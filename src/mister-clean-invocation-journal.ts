import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute } from "node:path";

import { canonicalJson } from "./canonical-json.js";
import { openSegments, sealLiveSegmentIfFull, segmentLayout, segmentTexts, type SegmentLayout, type SegmentSummary } from "./sealed-segments.js";

/**
 * Most bytes the live journal segment may hold. A write that would cross it
 * seals the live segment first (owner decision 2026-11-04: keep everything;
 * sealed segments are never deleted). 8 MiB is about 25,000 receipts, roughly three times the largest
 * journal observed in use (2.7 MB), so a seal is rare while every re-read of
 * the live segment stays small.
 */
export const INVOCATION_JOURNAL_SEGMENT_MAX_BYTES = 8 * 1024 * 1024;

export interface MisterCleanInvocationJournal {
  recordStart(input: { readonly command: string; readonly argv: readonly string[]; readonly occurred_at: string }): string;
  recordEvaluationLink(input: { readonly invocation_id: string; readonly run_event_id: string; readonly occurred_at: string }): void;
  /** Records terminal process truth only; it never asserts evaluator success,
   * identity, hygiene, or quality credit. */
  recordEnd(input: { readonly invocation_id: string; readonly run_event_id: string | null; readonly status: "SUCCEEDED" | "FAILED"; readonly exit_code: number; readonly occurred_at: string }): void;
}

export interface ImportedMisterCleanInvocation {
  readonly invocation_id: string;
  readonly command: string;
  readonly argv_sha256: string;
  readonly observed_at: string;
  /** Digest of the exact canonical journal line, retaining legacy/new bytes
   * distinctly without rewriting either record. */
  readonly receipt_sha256: string;
  readonly terminal_status: "SUCCEEDED" | "FAILED" | null;
  readonly terminal_exit_code: number | null;
  readonly terminal_observed_at: string | null;
  readonly terminal_run_event_id: string | null;
}

type JournalLine =
  | { readonly event: "started"; readonly value: ImportedMisterCleanInvocation }
  | { readonly event: "finished"; readonly invocation_id: string; readonly terminal: { readonly status: "SUCCEEDED" | "FAILED"; readonly exit_code: number; readonly observed_at: string; readonly run_event_id: string | null } }
  | { readonly event: "evaluation_run_linked" };

/** Validate one journal line on its own; cross-line rules belong to the reader. */
function parseJournalLine(line: string, at: string): JournalLine {
  if (line.length === 0) throw new Error(`Mister Clean invocation journal has a blank receipt line at ${at}`);
  let parsed: unknown;
  try { parsed = JSON.parse(line); } catch { throw new Error(`Mister Clean invocation journal is not valid JSONL at ${at}`); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`Mister Clean invocation journal has an invalid receipt at ${at}`);
  const record = parsed as Record<string, unknown>;
  if (record.record_type !== "mister-clean.invocation-receipt" || record.schema_version !== "1.0") throw new Error(`Mister Clean invocation journal has an invalid receipt at ${at}`);
  if (record.event === "started") {
    const current = sameKeys(record, ["record_type", "schema_version", "event", "invocation_id", "command", "argv_sha256", "observed_at", "identity_provenance", "evaluation_status", "evaluation_run_event_id"]);
    const legacy = sameKeys(record, ["record_type", "schema_version", "event", "invocation_id", "command", "argv_sha256", "observed_at", "identity_provenance", "evaluation_run_event_id"]);
    if ((!current && !legacy) || typeof record.invocation_id !== "string" || typeof record.command !== "string" || typeof record.argv_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(record.argv_sha256) || typeof record.observed_at !== "string" || record.identity_provenance !== "UNOBSERVED" || record.evaluation_run_event_id !== null || (current && record.evaluation_status !== "PENDING_IDENTITY_EVALUATION")) throw new Error(`Mister Clean invocation journal has an invalid start receipt at ${at}`);
    // Pre-P1 receipts had no explicit status. Their only safe migration is
    // the same pending state; they still cannot yield a tuple or credit.
    const canonical = current
      ? { record_type: "mister-clean.invocation-receipt", schema_version: "1.0", event: "started", invocation_id: record.invocation_id, command: record.command, argv_sha256: record.argv_sha256, observed_at: record.observed_at, identity_provenance: "UNOBSERVED", evaluation_status: "PENDING_IDENTITY_EVALUATION", evaluation_run_event_id: null }
      : { record_type: "mister-clean.invocation-receipt", schema_version: "1.0", event: "started", invocation_id: record.invocation_id, command: record.command, argv_sha256: record.argv_sha256, observed_at: record.observed_at, identity_provenance: "UNOBSERVED", evaluation_run_event_id: null };
    if (line !== canonicalJson(canonical)) throw new Error(`Mister Clean invocation journal has a non-canonical receipt at ${at}`);
    return { event: "started", value: { invocation_id: record.invocation_id, command: record.command, argv_sha256: record.argv_sha256, observed_at: record.observed_at, receipt_sha256: sha256(line), terminal_status: null, terminal_exit_code: null, terminal_observed_at: null, terminal_run_event_id: null } };
  }
  if (record.event === "finished") {
    if (!sameKeys(record, ["record_type", "schema_version", "event", "invocation_id", "run_event_id", "status", "exit_code", "observed_at"])
      || typeof record.invocation_id !== "string" || (record.run_event_id !== null && typeof record.run_event_id !== "string")
      || (record.status !== "SUCCEEDED" && record.status !== "FAILED") || typeof record.exit_code !== "number" || !Number.isInteger(record.exit_code) || record.exit_code < 0 || record.exit_code > 255
      || (record.status === "SUCCEEDED" && record.exit_code !== 0) || (record.status === "FAILED" && record.exit_code === 0)
      || typeof record.observed_at !== "string" || !canonicalTimestamp(record.observed_at) || line !== canonicalJson(record)) {
      throw new Error(`Mister Clean invocation journal has an invalid terminal receipt at ${at}`);
    }
    return { event: "finished", invocation_id: record.invocation_id, terminal: { status: record.status, exit_code: record.exit_code, observed_at: record.observed_at, run_event_id: record.run_event_id as string | null } };
  }
  if (record.event !== "evaluation_run_linked" || !sameKeys(record, ["record_type", "schema_version", "event", "invocation_id", "run_event_id", "observed_at"]) || typeof record.invocation_id !== "string" || typeof record.run_event_id !== "string" || typeof record.observed_at !== "string" || line !== canonicalJson(record)) {
    throw new Error(`Mister Clean invocation journal has an invalid receipt at ${at}`);
  }
  return { event: "evaluation_run_linked" };
}

/** Lines of one journal segment. Positions name the segment once the journal has sealed any. */
function journalSegmentLines(text: string, label: string, live: boolean): Array<{ readonly line: string; readonly at: string }> {
  if (text.length === 0) return [];
  if (!text.endsWith("\n")) throw new Error(live ? "Mister Clean invocation journal must end with a canonical JSONL newline" : `Mister Clean invocation journal segment ${label} must end with a canonical JSONL newline`);
  return text.slice(0, -1).split("\n").map((line, index) => ({ line, at: live ? `line ${index + 1}` : `line ${index + 1} of ${label}` }));
}

/** Manifest summary of a sealed journal segment: record count and the first and last observed_at. */
function summarizeJournalSegment(lines: readonly string[]): SegmentSummary {
  const observed = lines.map((line) => {
    try { const value = (JSON.parse(line) as { observed_at?: unknown }).observed_at; return typeof value === "string" ? value : null; } catch { return null; }
  });
  return { records: lines.length, first: observed[0] ?? null, last: observed.at(-1) ?? null };
}

/** Read the append-only CLI journal for later runtime reconciliation, one
 * segment at a time (sealed segments digest-checked, then the live one). The
 * journal intentionally proves only that a local CLI invocation occurred; it
 * contains no tuple, route, or quality claim. */
export function readMisterCleanInvocationJournal(path: string): readonly ImportedMisterCleanInvocation[] {
  if (!isAbsolute(path)) throw new Error("Mister Clean invocation journal path must be absolute");
  const layout = segmentLayout(path);
  if (!existsSync(path) && !existsSync(layout.manifestPath) && !existsSync(`${layout.directory}/${layout.sealedFile(1)}`)) return [];
  const started = new Map<string, ImportedMisterCleanInvocation>();
  const ended = new Map<string, { readonly status: "SUCCEEDED" | "FAILED"; readonly exit_code: number; readonly observed_at: string; readonly run_event_id: string | null }>();
  for (const segment of segmentTexts(layout, openSegments(layout, summarizeJournalSegment))) {
    const live = segment.label === basename(path);
    for (const { line, at } of journalSegmentLines(segment.text, segment.label, live)) {
      const parsed = parseJournalLine(line, at);
      if (parsed.event === "started") {
        const existing = started.get(parsed.value.invocation_id);
        if (existing !== undefined && canonicalJson(existing) !== canonicalJson(parsed.value)) throw new Error(`Mister Clean invocation journal reuses invocation_id with different content at ${at}`);
        started.set(parsed.value.invocation_id, parsed.value);
      } else if (parsed.event === "finished") {
        if (!started.has(parsed.invocation_id)) throw new Error(`Mister Clean invocation journal terminates an unknown invocation at ${at}`);
        if (ended.has(parsed.invocation_id)) throw new Error(`Mister Clean invocation journal terminates an invocation more than once at ${at}`);
        ended.set(parsed.invocation_id, parsed.terminal);
      }
    }
  }
  return [...started.values()].map((value) => {
    const terminal = ended.get(value.invocation_id);
    return terminal === undefined ? value : { ...value, terminal_status: terminal.status, terminal_exit_code: terminal.exit_code, terminal_observed_at: terminal.observed_at, terminal_run_event_id: terminal.run_event_id };
  }).sort((left, right) => left.invocation_id.localeCompare(right.invocation_id));
}

function canonicalTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function sameKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(record).sort((left, right) => left.localeCompare(right));
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Explicitly configured machine-local custody for actual Mister Clean CLI
 * invocations. It intentionally records no model, harness, telemetry, target
 * path, or unobserved identity. Those belong only in a later strict evaluator
 * event if external evidence is supplied. */
export class AppendOnlyLocalMisterCleanInvocationJournal implements MisterCleanInvocationJournal {
  /** The live segment: the journal's historical path. */
  readonly #path: string;
  readonly #segments: SegmentLayout;
  readonly #segmentMaxBytes: number;
  readonly #betweenSealSteps: (() => void) | undefined;

  /** `segmentMaxBytes` and `betweenSealSteps` exist for tests (a small cap; a crash between sealing steps). */
  constructor(path: string, options: { readonly segmentMaxBytes?: number; readonly betweenSealSteps?: () => void } = {}) {
    if (!isAbsolute(path)) throw new Error("MISTER_CLEAN_INVOCATION_JOURNAL_PATH must be an absolute machine-local path");
    this.#path = path;
    this.#segments = segmentLayout(path);
    this.#segmentMaxBytes = options.segmentMaxBytes ?? INVOCATION_JOURNAL_SEGMENT_MAX_BYTES;
    this.#betweenSealSteps = options.betweenSealSteps;
    mkdirSync(dirname(path), { recursive: true });
    this.#assertExistingIntegrity();
  }

  recordStart(input: { readonly command: string; readonly argv: readonly string[]; readonly occurred_at: string }): string {
    const invocationId = `mc-invocation:${randomUUID()}`;
    this.#append({
      record_type: "mister-clean.invocation-receipt",
      schema_version: "1.0",
      event: "started",
      invocation_id: invocationId,
      command: input.command,
      argv_sha256: sha256(canonicalJson(input.argv)),
      observed_at: input.occurred_at,
      identity_provenance: "UNOBSERVED",
      evaluation_status: "PENDING_IDENTITY_EVALUATION",
      evaluation_run_event_id: null,
    });
    return invocationId;
  }

  recordEvaluationLink(input: { readonly invocation_id: string; readonly run_event_id: string; readonly occurred_at: string }): void {
    this.#append({
      record_type: "mister-clean.invocation-receipt",
      schema_version: "1.0",
      event: "evaluation_run_linked",
      invocation_id: input.invocation_id,
      run_event_id: input.run_event_id,
      observed_at: input.occurred_at,
    });
  }

  recordEnd(input: { readonly invocation_id: string; readonly run_event_id: string | null; readonly status: "SUCCEEDED" | "FAILED"; readonly exit_code: number; readonly occurred_at: string }): void {
    if (!Number.isInteger(input.exit_code) || input.exit_code < 0 || input.exit_code > 255 || (input.status === "SUCCEEDED" && input.exit_code !== 0) || (input.status === "FAILED" && input.exit_code === 0)) throw new Error("Mister Clean terminal receipt has an invalid status/exit code");
    if (!canonicalTimestamp(input.occurred_at)) throw new Error("Mister Clean terminal receipt requires a canonical timestamp");
    this.#append({ record_type: "mister-clean.invocation-receipt", schema_version: "1.0", event: "finished", invocation_id: input.invocation_id, run_event_id: input.run_event_id, status: input.status, exit_code: input.exit_code, observed_at: input.occurred_at });
  }

  #append(record: object): void {
    sealLiveSegmentIfFull(this.#segments, {
      incomingBytes: new TextEncoder().encode(`${canonicalJson(record)}\n`).byteLength,
      maxSize: this.#segmentMaxBytes,
      summarize: summarizeJournalSegment,
      betweenSealSteps: this.#betweenSealSteps,
    });
    appendFileSync(this.#path, `${canonicalJson(record)}\n`, { encoding: "utf8", flag: "a", mode: 0o600 });
  }

  /** Construction reads the manifest (completing an interrupted seal) and the
   * live segment only; whole-history checks belong to the reader. */
  #assertExistingIntegrity(): void {
    openSegments(this.#segments, summarizeJournalSegment);
    const live = existsSync(this.#path) ? readFileSync(this.#path, "utf8") : "";
    for (const { line, at } of journalSegmentLines(live, basename(this.#path), true)) parseJournalLine(line, at);
  }
}

export function invocationJournalPathFromEnvironment(environment: NodeJS.ProcessEnv): string {
  const override = environment.MISTER_CLEAN_INVOCATION_JOURNAL_PATH;
  const stateRoot = environment.XDG_STATE_HOME
    ?? (environment.HOME === undefined || environment.HOME.trim().length === 0 ? undefined : `${environment.HOME}/.local/state`);
  const path = override === undefined || override.trim().length === 0
    ? (stateRoot === undefined ? undefined : `${stateRoot}/mister-clean/invocations.jsonl`)
    : override;
  if (path === undefined) throw new Error("Mister Clean requires HOME or XDG_STATE_HOME to resolve its machine-local invocation journal");
  if (!isAbsolute(path)) throw new Error("MISTER_CLEAN_INVOCATION_JOURNAL_PATH must be an absolute machine-local path");
  return path;
}

export function journalFromEnvironment(environment: NodeJS.ProcessEnv): MisterCleanInvocationJournal {
  return new AppendOnlyLocalMisterCleanInvocationJournal(invocationJournalPathFromEnvironment(environment));
}
