/**
 * Sealed segments for the machine-local JSONL stores (owner decision
 * 2026-11-04, `charter/owner-decisions/2026-11-04-local-store-retention.md`):
 * keep everything, rotate.
 *
 * A store has one live segment (its historical file name, so a single-file
 * store from before rotation is simply the first live segment) and any number
 * of sealed ones. When a write would take the live segment past the store's
 * cap, the live segment is sealed first:
 *
 * 1. renamed to the next numbered file (`<base>.000001.jsonl`) and made
 *    read-only;
 * 2. recorded in `<base>.segments.json` (digest, byte and record counts, first
 *    and last key, optional groups and per-segment key index), written to a
 *    temporary file and renamed into place.
 *
 * A crash between the two steps leaves a numbered segment with no manifest
 * entry; the next open completes the entry from the segment's own bytes, so the
 * store stays readable. Sealed segments are never deleted or rewritten, and a
 * sealed segment whose bytes no longer match its recorded digest is a typed
 * refusal, never skipped.
 */
import { chmodSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";

import { canonicalJson } from "./canonical-json.js";

export const SEGMENT_MANIFEST_RECORD_TYPE = "mister-clean.segment-manifest";
export const SEGMENT_MANIFEST_SCHEMA_VERSION = "1";

export interface SealedSegment {
  /** File name of the sealed segment, in the live segment's directory. */
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly records: number;
  /** First and last record key in append order (a timestamp or an id). */
  readonly first: string | null;
  readonly last: string | null;
  /** Small partition labels (for example repository digests) a reader can filter on. */
  readonly groups: readonly string[];
  /** Per-segment key index, when the store looks records up by id. */
  readonly key_index: { readonly file: string; readonly sha256: string } | null;
  readonly sealed_at: string;
}

export interface SegmentManifest {
  readonly record_type: typeof SEGMENT_MANIFEST_RECORD_TYPE;
  readonly schema_version: typeof SEGMENT_MANIFEST_SCHEMA_VERSION;
  readonly segments: readonly SealedSegment[];
}

export interface SegmentSummary {
  readonly records: number;
  readonly first: string | null;
  readonly last: string | null;
  readonly groups?: readonly string[];
  /** Keys for the per-segment key index; omit when the store has no lookups by id. */
  readonly keys?: readonly string[];
}

/** Summarise one segment's complete newline-terminated lines (without the trailing newline). */
export type SegmentSummarizer = (lines: readonly string[]) => SegmentSummary;

export class SealedSegmentTamperedError extends Error {
  readonly code = "sealed_segment_tampered";
  constructor(readonly file: string, readonly expected_sha256: string, readonly observed_sha256: string) {
    super(`sealed segment ${file} does not match its manifest digest (manifest ${expected_sha256}, file ${observed_sha256}); refusing to read it`);
    this.name = "SealedSegmentTamperedError";
  }
}

export class SegmentStoreInvalidError extends Error {
  readonly code = "segment_store_invalid";
  constructor(message: string) {
    super(message);
    this.name = "SegmentStoreInvalidError";
  }
}

export interface SegmentLayout {
  readonly directory: string;
  readonly livePath: string;
  readonly manifestPath: string;
  sealedFile(ordinal: number): string;
  keyIndexFile(ordinal: number): string;
}

/** `<dir>/invocations.jsonl` → sealed `<dir>/invocations.000001.jsonl`, manifest `<dir>/invocations.segments.json`. */
export function segmentLayout(livePath: string): SegmentLayout {
  const directory = dirname(livePath);
  const name = basename(livePath);
  const base = name.endsWith(".jsonl") ? name.slice(0, -".jsonl".length) : name;
  const ordinal = (value: number): string => String(value).padStart(6, "0");
  return {
    directory,
    livePath,
    manifestPath: join(directory, `${base}.segments.json`),
    sealedFile: (value) => `${base}.${ordinal(value)}.jsonl`,
    keyIndexFile: (value) => `${base}.${ordinal(value)}.keys.json`,
  };
}

type SegmentReadObserver = (path: string) => void;
const readObservers: SegmentReadObserver[] = [];

/** Instrumentation: observe every file this module reads. Returns the unsubscribe function. */
export function observeSegmentReads(observer: SegmentReadObserver): () => void {
  readObservers.push(observer);
  return () => {
    const index = readObservers.indexOf(observer);
    if (index >= 0) readObservers.splice(index, 1);
  };
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

function readSegmentFile(path: string): Uint8Array {
  for (const observer of readObservers) observer(path);
  return readFileSync(path);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Complete newline-terminated lines of a segment; an unterminated tail is refused. */
export function segmentLines(text: string, label: string): string[] {
  if (text.length === 0) return [];
  if (!text.endsWith("\n")) throw new SegmentStoreInvalidError(`${label} must end with a newline`);
  return text.slice(0, -1).split("\n");
}

/** Write a small file atomically: temporary file, then rename over the target. */
function writeAtomically(path: string, text: string, mode: number): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, text, { encoding: "utf8", mode });
  renameSync(temporary, path);
}

function emptyManifest(): SegmentManifest {
  return { record_type: SEGMENT_MANIFEST_RECORD_TYPE, schema_version: SEGMENT_MANIFEST_SCHEMA_VERSION, segments: [] };
}

function parseManifest(layout: SegmentLayout): SegmentManifest {
  if (!existsSync(layout.manifestPath)) return emptyManifest();
  let parsed: unknown;
  try { parsed = JSON.parse(utf8.decode(readSegmentFile(layout.manifestPath))); } catch {
    throw new SegmentStoreInvalidError(`segment manifest ${basename(layout.manifestPath)} is not valid JSON`);
  }
  const record = parsed as Partial<SegmentManifest> | null;
  if (!record || record.record_type !== SEGMENT_MANIFEST_RECORD_TYPE || record.schema_version !== SEGMENT_MANIFEST_SCHEMA_VERSION || !Array.isArray(record.segments)) {
    throw new SegmentStoreInvalidError(`segment manifest ${basename(layout.manifestPath)} is not a ${SEGMENT_MANIFEST_RECORD_TYPE}/${SEGMENT_MANIFEST_SCHEMA_VERSION}`);
  }
  for (const [index, segment] of record.segments.entries()) {
    if (segment.file !== layout.sealedFile(index + 1) || !/^[0-9a-f]{64}$/u.test(String(segment.sha256))) {
      throw new SegmentStoreInvalidError(`segment manifest entry ${index + 1} must name ${layout.sealedFile(index + 1)} with its sha256`);
    }
  }
  return record as SegmentManifest;
}

/** Record a segment that is already renamed into place (the second sealing step). */
function recordSealedSegment(layout: SegmentLayout, manifest: SegmentManifest, ordinal: number, summarize: SegmentSummarizer, sealedAt: string): SegmentManifest {
  const file = layout.sealedFile(ordinal);
  const bytes = readSegmentFile(join(layout.directory, file));
  const summary = summarize(segmentLines(utf8.decode(bytes), file));
  let keyIndex: SealedSegment["key_index"] = null;
  if (summary.keys !== undefined) {
    const keyFile = layout.keyIndexFile(ordinal);
    const keyText = `${canonicalJson([...summary.keys].sort())}\n`;
    const keyPath = join(layout.directory, keyFile);
    if (existsSync(keyPath)) chmodSync(keyPath, 0o600);
    writeAtomically(keyPath, keyText, 0o600);
    chmodSync(keyPath, 0o400);
    keyIndex = { file: keyFile, sha256: sha256(new TextEncoder().encode(keyText)) };
  }
  const entry: SealedSegment = {
    file,
    sha256: sha256(bytes),
    bytes: bytes.byteLength,
    records: summary.records,
    first: summary.first,
    last: summary.last,
    groups: [...new Set(summary.groups ?? [])].sort(),
    key_index: keyIndex,
    sealed_at: sealedAt,
  };
  const next: SegmentManifest = { ...manifest, segments: [...manifest.segments, entry] };
  writeAtomically(layout.manifestPath, `${canonicalJson(next)}\n`, 0o600);
  return next;
}

/**
 * Read the manifest, completing a seal that a crash interrupted between the
 * rename and the manifest write. Reads no segment unless one needs completing.
 */
export function openSegments(layout: SegmentLayout, summarize: SegmentSummarizer, now: () => string = () => new Date().toISOString()): SegmentManifest {
  let manifest = parseManifest(layout);
  for (;;) {
    const ordinal = manifest.segments.length + 1;
    const orphan = join(layout.directory, layout.sealedFile(ordinal));
    if (!existsSync(orphan)) return manifest;
    chmodSync(orphan, 0o400);
    manifest = recordSealedSegment(layout, manifest, ordinal, summarize, now());
  }
}

/**
 * Seal the live segment when writing `incomingBytes` more would take it past
 * `maxSize`. Returns true when it sealed. An empty live segment is never sealed,
 * so a single record larger than the cap still lands in its own segment.
 */
export function sealLiveSegmentIfFull(layout: SegmentLayout, input: {
  readonly incomingBytes: number;
  readonly maxSize: number;
  readonly summarize: SegmentSummarizer;
  readonly now?: () => string;
  /** Test seam: runs after the rename and before the manifest write (a crash here must be survivable). */
  readonly betweenSealSteps?: (() => void) | undefined;
}): boolean {
  if (!Number.isInteger(input.maxSize) || input.maxSize <= 0) throw new SegmentStoreInvalidError("segment cap must be a positive integer number of bytes");
  const now = input.now ?? (() => new Date().toISOString());
  const manifest = openSegments(layout, input.summarize, now);
  if (!existsSync(layout.livePath)) return false;
  const size = statSync(layout.livePath).size;
  if (size === 0 || size + input.incomingBytes <= input.maxSize) return false;
  const ordinal = manifest.segments.length + 1;
  const sealedPath = join(layout.directory, layout.sealedFile(ordinal));
  if (existsSync(sealedPath)) throw new SegmentStoreInvalidError(`refusing to overwrite sealed segment ${layout.sealedFile(ordinal)}`);
  renameSync(layout.livePath, sealedPath);
  chmodSync(sealedPath, 0o400);
  input.betweenSealSteps?.();
  recordSealedSegment(layout, manifest, ordinal, input.summarize, now());
  return true;
}

/** The bytes of one sealed segment, refused unless they match the manifest digest. */
export function readSealedSegment(layout: SegmentLayout, segment: SealedSegment): string {
  const bytes = readSegmentFile(join(layout.directory, segment.file));
  const observed = sha256(bytes);
  if (observed !== segment.sha256) throw new SealedSegmentTamperedError(segment.file, segment.sha256, observed);
  return utf8.decode(bytes);
}

/** The keys of one sealed segment's key index, refused unless they match the manifest digest. */
export function readSegmentKeys(layout: SegmentLayout, segment: SealedSegment): readonly string[] {
  if (segment.key_index === null) throw new SegmentStoreInvalidError(`sealed segment ${segment.file} has no key index`);
  const bytes = readSegmentFile(join(layout.directory, segment.key_index.file));
  const observed = sha256(bytes);
  if (observed !== segment.key_index.sha256) throw new SealedSegmentTamperedError(segment.key_index.file, segment.key_index.sha256, observed);
  const keys: unknown = JSON.parse(utf8.decode(bytes));
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== "string")) throw new SegmentStoreInvalidError(`key index ${segment.key_index.file} is not a list of keys`);
  return keys as string[];
}

/** The live segment's text, or the empty string when it does not exist yet. */
export function readLiveSegment(layout: SegmentLayout): string {
  return existsSync(layout.livePath) ? utf8.decode(readSegmentFile(layout.livePath)) : "";
}

/** Every segment's text in append order, one at a time: sealed segments (digest-checked), then the live one. */
export function* segmentTexts(layout: SegmentLayout, manifest: SegmentManifest): Generator<{ readonly label: string; readonly text: string }> {
  for (const segment of manifest.segments) yield { label: segment.file, text: readSealedSegment(layout, segment) };
  yield { label: basename(layout.livePath), text: readLiveSegment(layout) };
}
