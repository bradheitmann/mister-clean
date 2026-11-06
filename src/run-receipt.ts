/**
 * Run receipts: `mister-clean.run-receipt/1`.
 *
 * Every CLOSE, AUDIT, SECOND_PASS and VALIDATE run writes one receipt to the machine-local
 * state root (the same custody as the invocation journal): repository identity,
 * the exact subject, and every finding keyed by a content anchor. A receipt
 * holds repository-relative paths and digests only: never matched text,
 * excerpts, absolute paths, remote URLs with credentials, or seat names. Agent
 * identity enters only through an explicit card; it is never inferred.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { canonicalJson } from "./canonical-json.js";
import { isTimestamp } from "./timestamp.js";
import {
  ANCHOR_KINDS,
  RECEIPT_FAMILIES,
  type ReceiptFamily,
  type ReceiptFinding,
} from "./closeout/finding-anchors.js";
import { publicSafetyValueDigestsInText } from "./closeout/inspection.js";
import type { RepositoryObject } from "./closeout/repository-object.js";
import {
  openSegments,
  readLiveSegment,
  readSealedSegment,
  readSegmentKeys,
  sealLiveSegmentIfFull,
  segmentLayout,
  type SealedSegment,
  type SegmentLayout,
  type SegmentSummary,
} from "./sealed-segments.js";

export const RUN_RECEIPT_RECORD_TYPE = "mister-clean.run-receipt";
export const RUN_RECEIPT_SCHEMA_VERSION = "1";
export const RECEIPT_INDEX_FILE = "receipts.index.jsonl";

/**
 * Most bytes the live receipt-index segment may hold. A write that would cross
 * it seals the live index segment first (owner decision 2026-11-04: keep
 * everything; sealed segments are never deleted). 8 MiB is about 25,000 index entries. Receipt files
 * themselves are never moved, rewritten or pruned.
 */
export const RECEIPT_INDEX_SEGMENT_MAX_BYTES = 8 * 1024 * 1024;

export type ReceiptMode = "CLOSE" | "AUDIT" | "SECOND_PASS" | "VALIDATE";
export type ReceiptVerdict = "CLEAN" | "NOT_CLEAN" | "AUDIT_ONLY";
export type AgentIdentityStatus = "receipt" | "title_only" | "contract_only" | "unobserved";
export type AgentIdentitySource = "flag" | "env" | "lifecycle" | null;

export interface ReceiptAgent {
  readonly identity_status: AgentIdentityStatus;
  /** Opaque card reference (the card's own id or a digest); never a path. */
  readonly card_ref: string | null;
  readonly source: AgentIdentitySource;
}

export interface ReceiptSubject {
  /** RepositoryObject 1.0 verbatim, or null when the run declined the subject hash. */
  readonly repository_object: RepositoryObject | null;
  readonly head_commit: string;
  readonly head_tree: string;
}

export interface RunReceipt {
  readonly record_type: typeof RUN_RECEIPT_RECORD_TYPE;
  readonly schema_version: typeof RUN_RECEIPT_SCHEMA_VERSION;
  readonly receipt_id: string;
  readonly invocation_id: string | null;
  readonly mode: ReceiptMode;
  readonly repository_id: string;
  readonly subject: ReceiptSubject;
  readonly dirty: boolean;
  readonly detector_registry_sha256: string;
  readonly runtime_identity_sha256: string;
  readonly agent: ReceiptAgent;
  /** Families this run examined; a family absent here was not run, not clean. */
  readonly families: readonly ReceiptFamily[];
  readonly findings: readonly ReceiptFinding[];
  readonly verdict: ReceiptVerdict;
  readonly exit_code: number;
  readonly observed_at: string;
  readonly finished_at: string;
  /** Present exactly on VALIDATE receipts: what `validate bundle` judged. */
  readonly validation?: ReceiptValidation;
}

/**
 * The VALIDATE receipt body. A VALIDATE receipt is the only machine record of
 * CLEAN: prepare never decides it, and a closer-written report field is never
 * copied into a receipt verdict.
 */
export interface ReceiptValidation {
  readonly bundle_sha256: string;
  /** The subject commit the validated bundle binds, or null when unreadable. */
  readonly subject_commit: string | null;
  /** Judge-supplied trust-policy pins, sorted. */
  readonly trust_policy_pins: readonly string[];
  /** The pins the trust checks matched, sorted; empty when none was relied on. */
  readonly trust_policy_pins_used: readonly string[];
  readonly live: boolean;
}

export interface ReceiptIndexEntry {
  readonly receipt_id: string;
  readonly repository_id_sha256: string;
  readonly mode: ReceiptMode;
  readonly head_commit: string;
  readonly subject_sha256: string | null;
  readonly dirty: boolean;
  readonly families: readonly ReceiptFamily[];
  readonly finding_count: number;
  readonly verdict: ReceiptVerdict;
  readonly observed_at: string;
  /** Root-relative receipt path. */
  readonly path: string;
}

export class ReceiptRootInsideRepositoryError extends Error {
  readonly code = "receipt_root_inside_repository";
  constructor(readonly receipt_root: string) {
    super("receipt root must not be inside the audited repository");
    this.name = "ReceiptRootInsideRepositoryError";
  }
}

export class ReceiptPrivacyError extends Error {
  readonly code = "receipt_privacy_violation";
  constructor(readonly violations: readonly string[]) {
    super(`receipt refused: ${violations.join("; ")}`);
    this.name = "ReceiptPrivacyError";
  }
}

export class RunReceiptInvalidError extends Error {
  readonly code = "run_receipt_invalid";
  constructor(readonly errors: readonly string[]) {
    super(`run receipt is invalid: ${errors.join("; ")}`);
    this.name = "RunReceiptInvalidError";
  }
}

const HEX64 = /^[0-9a-f]{64}$/u;
const HEX40 = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;

function object(value: unknown): Record<string, unknown> | undefined {
  return !!value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[], path: string, errors: string[]): boolean {
  const keys = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (keys.length === wanted.length && keys.every((key, index) => key === wanted[index])) return true;
  errors.push(`${path}: expected exactly the keys ${wanted.join(",")}; got ${keys.join(",")}`);
  return false;
}

export function isRepositoryRelativePath(path: string): boolean {
  if (path.length === 0 || isAbsolute(path) || path.startsWith("/") || path.includes("\\")) return false;
  if (/^[A-Za-z]:/u.test(path) || /[\u0000-\u001f\u007f]/u.test(path)) return false;
  return path === "." || path.split("/").every((part) => part.length > 0 && part !== "..");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function repositoryIdSha256(repositoryId: string): string {
  return sha256Hex(repositoryId);
}

/** Structural validation of one receipt; exact key sets, enumerations and digests. */
export function runReceiptErrors(value: unknown): string[] {
  const errors: string[] = [];
  const record = object(value);
  if (!record) return ["$: expected object"];
  const validating = record.mode === "VALIDATE";
  if (!exactKeys(record, [
    "record_type", "schema_version", "receipt_id", "invocation_id", "mode", "repository_id", "subject", "dirty",
    "detector_registry_sha256", "runtime_identity_sha256", "agent", "families", "findings", "verdict", "exit_code",
    "observed_at", "finished_at", ...(validating ? ["validation"] : []),
  ], "$", errors)) return errors;
  if (record.record_type !== RUN_RECEIPT_RECORD_TYPE) errors.push(`$.record_type: expected ${RUN_RECEIPT_RECORD_TYPE}`);
  if (record.schema_version !== RUN_RECEIPT_SCHEMA_VERSION) errors.push(`$.schema_version: expected ${RUN_RECEIPT_SCHEMA_VERSION}`);
  if (typeof record.receipt_id !== "string" || !/^mc-receipt:[0-9a-f-]{36}$/u.test(record.receipt_id)) errors.push("$.receipt_id: expected mc-receipt:<uuid>");
  if (record.invocation_id !== null && (typeof record.invocation_id !== "string" || !record.invocation_id.startsWith("mc-invocation:"))) errors.push("$.invocation_id: expected null or mc-invocation:<uuid>");
  if (!["CLOSE", "AUDIT", "SECOND_PASS", "VALIDATE"].includes(String(record.mode))) errors.push("$.mode: expected CLOSE, AUDIT, SECOND_PASS or VALIDATE");
  if (record.verdict === "CLEAN" && !validating) errors.push("$.verdict: CLEAN is recorded only by a VALIDATE receipt");
  if (validating && record.verdict !== "CLEAN" && record.verdict !== "NOT_CLEAN") errors.push("$.verdict: a VALIDATE receipt records CLEAN or NOT_CLEAN");
  const validation = object(record.validation);
  if (validating && (!validation || !exactKeys(validation, ["bundle_sha256", "subject_commit", "trust_policy_pins", "trust_policy_pins_used", "live"], "$.validation", errors))) {
    if (!validation) errors.push("$.validation: expected object");
  } else if (validation) {
    if (typeof validation.bundle_sha256 !== "string" || !HEX64.test(validation.bundle_sha256)) errors.push("$.validation.bundle_sha256: expected lowercase SHA-256");
    if (validation.subject_commit !== null && (typeof validation.subject_commit !== "string" || !HEX40.test(validation.subject_commit))) errors.push("$.validation.subject_commit: expected null or Git object id");
    for (const field of ["trust_policy_pins", "trust_policy_pins_used"] as const) {
      const pins = validation[field];
      if (!Array.isArray(pins) || pins.some((pin) => typeof pin !== "string" || !HEX64.test(pin))) errors.push(`$.validation.${field}: expected lowercase SHA-256 array`);
    }
    if (typeof validation.live !== "boolean") errors.push("$.validation.live: expected boolean");
  }
  if (typeof record.repository_id !== "string" || !/^(?:remote:[^\s/]+\/.+|local-path-sha256:[0-9a-f]{64})$/u.test(record.repository_id)) errors.push("$.repository_id: expected remote:<host>/<path> or local-path-sha256:<hex>");
  const subject = object(record.subject);
  if (subject && exactKeys(subject, ["repository_object", "head_commit", "head_tree"], "$.subject", errors)) {
    if (typeof subject.head_commit !== "string" || !HEX40.test(subject.head_commit)) errors.push("$.subject.head_commit: expected Git object id");
    if (typeof subject.head_tree !== "string" || !HEX40.test(subject.head_tree)) errors.push("$.subject.head_tree: expected Git object id");
    const repositoryObject = object(subject.repository_object);
    if (subject.repository_object !== null) {
      if (!repositoryObject || !exactKeys(repositoryObject, ["record_type", "schema_version", "head_commit", "surface", "entry_count", "sha256"], "$.subject.repository_object", errors)) {
        if (!repositoryObject) errors.push("$.subject.repository_object: expected null or RepositoryObject 1.0");
      } else if (repositoryObject.record_type !== "mister-clean.repository-object" || repositoryObject.schema_version !== "1.0"
        || repositoryObject.surface !== "tracked_and_nonignored" || !Number.isInteger(repositoryObject.entry_count)
        || typeof repositoryObject.sha256 !== "string" || !HEX64.test(repositoryObject.sha256)
        || repositoryObject.head_commit !== subject.head_commit) {
        errors.push("$.subject.repository_object: expected RepositoryObject 1.0 bound to subject.head_commit");
      }
    }
  } else if (!subject) errors.push("$.subject: expected object");
  if (typeof record.dirty !== "boolean") errors.push("$.dirty: expected boolean");
  if (typeof record.detector_registry_sha256 !== "string" || !HEX64.test(record.detector_registry_sha256)) errors.push("$.detector_registry_sha256: expected lowercase SHA-256");
  if (typeof record.runtime_identity_sha256 !== "string" || !HEX64.test(record.runtime_identity_sha256)) errors.push("$.runtime_identity_sha256: expected lowercase SHA-256");
  const agent = object(record.agent);
  if (agent && exactKeys(agent, ["identity_status", "card_ref", "source"], "$.agent", errors)) {
    if (!["receipt", "title_only", "contract_only", "unobserved"].includes(String(agent.identity_status))) errors.push("$.agent.identity_status: expected receipt, title_only, contract_only or unobserved");
    if (agent.card_ref !== null && (typeof agent.card_ref !== "string" || agent.card_ref.length === 0 || isAbsolute(agent.card_ref) || agent.card_ref.includes("/"))) errors.push("$.agent.card_ref: expected null or an opaque reference without path separators");
    if (agent.source !== null && !["flag", "env", "lifecycle"].includes(String(agent.source))) errors.push("$.agent.source: expected flag, env, lifecycle or null");
    if (agent.identity_status === "unobserved" && (agent.card_ref !== null || agent.source !== null)) errors.push("$.agent: unobserved identity carries no card_ref or source");
    if (agent.identity_status !== "unobserved" && (agent.card_ref === null || agent.source === null)) errors.push("$.agent: an observed identity requires card_ref and source");
  } else if (!agent) errors.push("$.agent: expected object");
  const families = Array.isArray(record.families) ? record.families : undefined;
  if (!families || families.some((family) => !RECEIPT_FAMILIES.includes(family as ReceiptFamily))
    || new Set(families).size !== families.length) errors.push("$.families: expected unique receipt families");
  const findings = Array.isArray(record.findings) ? record.findings : undefined;
  if (!findings) errors.push("$.findings: expected array");
  const seen = new Set<string>();
  for (const [index, value] of (findings ?? []).entries()) {
    const path = `$.findings[${index}]`;
    const finding = object(value);
    if (!finding || !exactKeys(finding, ["fingerprint", "family", "rule", "path", "anchor", "severity", "legacy_fingerprint"], path, errors)) {
      if (!finding) errors.push(`${path}: expected object`);
      continue;
    }
    if (typeof finding.fingerprint !== "string" || !HEX64.test(finding.fingerprint)) errors.push(`${path}.fingerprint: expected lowercase SHA-256`);
    else if (seen.has(finding.fingerprint)) errors.push(`${path}.fingerprint: duplicate`);
    else seen.add(finding.fingerprint);
    if (!RECEIPT_FAMILIES.includes(finding.family as ReceiptFamily)) errors.push(`${path}.family: unknown family`);
    else if (families && !families.includes(finding.family)) errors.push(`${path}.family: not among the receipt's families`);
    if (typeof finding.rule !== "string" || finding.rule.length === 0) errors.push(`${path}.rule: required`);
    if (typeof finding.path !== "string" || !isRepositoryRelativePath(finding.path)) errors.push(`${path}.path: expected a repository-relative path`);
    if (finding.severity !== null && typeof finding.severity !== "string") errors.push(`${path}.severity: expected string or null`);
    if (typeof finding.legacy_fingerprint !== "string" || !HEX64.test(finding.legacy_fingerprint)) errors.push(`${path}.legacy_fingerprint: expected lowercase SHA-256`);
    const anchor = object(finding.anchor);
    if (anchor && exactKeys(anchor, ["kind", "blob_oid", "content_sha256", "line_hint"], `${path}.anchor`, errors)) {
      if (!ANCHOR_KINDS.includes(anchor.kind as never)) errors.push(`${path}.anchor.kind: unknown anchor kind`);
      if (anchor.blob_oid !== null && (typeof anchor.blob_oid !== "string" || !HEX40.test(anchor.blob_oid))) errors.push(`${path}.anchor.blob_oid: expected null or Git object id`);
      if (typeof anchor.content_sha256 !== "string" || !HEX64.test(anchor.content_sha256)) errors.push(`${path}.anchor.content_sha256: expected lowercase SHA-256`);
      if (anchor.line_hint !== null && (!Number.isInteger(anchor.line_hint) || Number(anchor.line_hint) < 1)) errors.push(`${path}.anchor.line_hint: expected null or positive integer`);
    } else if (!anchor) errors.push(`${path}.anchor: expected object`);
  }
  if (!["CLEAN", "NOT_CLEAN", "AUDIT_ONLY"].includes(String(record.verdict))) errors.push("$.verdict: expected CLEAN, NOT_CLEAN or AUDIT_ONLY");
  if (!Number.isInteger(record.exit_code) || Number(record.exit_code) < 0 || Number(record.exit_code) > 255) errors.push("$.exit_code: expected 0..255");
  if (!isTimestamp(record.observed_at, "canonical_utc")) errors.push("$.observed_at: expected canonical ISO timestamp");
  if (!isTimestamp(record.finished_at, "canonical_utc")) errors.push("$.finished_at: expected canonical ISO timestamp");
  return errors;
}

/**
 * Privacy refusal: a receipt may carry repository-relative paths and digests
 * only. Any built-in public-safety rule match anywhere in the serialized
 * receipt (an email address, a home path, a credential assignment, a file URL)
 * is a matched value, not a digest, and the receipt is refused before any write.
 */
export function receiptPrivacyViolations(receipt: RunReceipt): string[] {
  const violations: string[] = [];
  for (const [index, finding] of receipt.findings.entries()) {
    if (!isRepositoryRelativePath(finding.path)) violations.push(`$.findings[${index}].path is not repository-relative`);
  }
  if (receipt.agent.card_ref !== null && (isAbsolute(receipt.agent.card_ref) || receipt.agent.card_ref.includes("/"))) {
    violations.push("$.agent.card_ref must not be a path");
  }
  if (/^remote:[^/]*@/u.test(receipt.repository_id) || /:\/\/[^/]*@/u.test(receipt.repository_id)) {
    violations.push("$.repository_id must not carry credentials");
  }
  const matches = publicSafetyValueDigestsInText(canonicalJson(receipt));
  for (const match of matches) violations.push(`receipt text matches public-safety rule ${match.rule} (value digest ${match.value_sha256.slice(0, 12)})`);
  return violations;
}

export function receiptRootFromEnvironment(environment: NodeJS.ProcessEnv): string {
  const override = environment.MISTER_CLEAN_RECEIPT_ROOT;
  const stateRoot = environment.XDG_STATE_HOME
    ?? (environment.HOME === undefined || environment.HOME.trim().length === 0 ? undefined : `${environment.HOME}/.local/state`);
  const root = override === undefined || override.trim().length === 0
    ? (stateRoot === undefined ? undefined : `${stateRoot}/mister-clean/receipts`)
    : override;
  if (root === undefined) throw new Error("Mister Clean requires HOME, XDG_STATE_HOME or MISTER_CLEAN_RECEIPT_ROOT to resolve its receipt root");
  if (!isAbsolute(root)) throw new Error("MISTER_CLEAN_RECEIPT_ROOT must be an absolute machine-local path");
  return root;
}

/** Canonical path even when the tail does not exist yet: realpath the nearest existing ancestor. */
function realOrResolved(path: string): string {
  const resolved = resolve(path);
  const pending: string[] = [];
  let cursor = resolved;
  for (;;) {
    try { return join(realpathSync(cursor), ...[...pending].reverse()); } catch { /* walk up */ }
    const parent = dirname(cursor);
    if (parent === cursor) return resolved;
    pending.push(cursor.slice(parent.length + 1));
    cursor = parent;
  }
}

function containedIn(root: string, candidate: string): boolean {
  const relation = relative(realOrResolved(root), realOrResolved(candidate));
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}

/** Parse one index segment's lines; positions name the segment once the index has sealed any. */
function indexEntries(text: string, label: string, live: boolean): ReceiptIndexEntry[] {
  if (text.length === 0) return [];
  if (!text.endsWith("\n")) throw new RunReceiptInvalidError([live ? "receipt index must end with a newline" : `receipt index segment ${label} must end with a newline`]);
  return text.slice(0, -1).split("\n").map((line, index) => {
    const at = live ? `line ${index + 1}` : `line ${index + 1} of ${label}`;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { throw new RunReceiptInvalidError([`receipt index is not valid JSONL at ${at}`]); }
    const record = object(parsed);
    if (!record || typeof record.receipt_id !== "string" || typeof record.repository_id_sha256 !== "string" || typeof record.path !== "string") {
      throw new RunReceiptInvalidError([`receipt index has an invalid entry at ${at}`]);
    }
    return record as unknown as ReceiptIndexEntry;
  });
}

/** Manifest summary of a sealed index segment: observed_at range, repository digests, receipt ids. */
function summarizeReceiptIndexSegment(lines: readonly string[]): SegmentSummary {
  const entries = indexEntries(lines.length === 0 ? "" : `${lines.join("\n")}\n`, "segment", false);
  return {
    records: entries.length,
    first: entries[0]?.observed_at ?? null,
    last: entries.at(-1)?.observed_at ?? null,
    groups: entries.map((entry) => entry.repository_id_sha256),
    keys: entries.map((entry) => entry.receipt_id),
  };
}

/** Machine-local receipt custody: one directory per repository identity plus one segmented index. */
export class LocalRunReceiptStore {
  readonly #root: string;
  readonly #index: SegmentLayout;
  readonly #segmentMaxBytes: number;
  readonly #betweenSealSteps: (() => void) | undefined;

  /** `segmentMaxBytes` and `betweenSealSteps` exist for tests (a small cap; a crash between sealing steps). */
  constructor(root: string, options: { readonly segmentMaxBytes?: number; readonly betweenSealSteps?: () => void } = {}) {
    if (!isAbsolute(root)) throw new Error("receipt root must be an absolute machine-local path");
    this.#root = root;
    this.#index = segmentLayout(join(root, RECEIPT_INDEX_FILE));
    this.#segmentMaxBytes = options.segmentMaxBytes ?? RECEIPT_INDEX_SEGMENT_MAX_BYTES;
    this.#betweenSealSteps = options.betweenSealSteps;
  }

  get root(): string { return this.#root; }

  /** Typed refusal when the receipt root lies inside (or is) the audited repository. */
  assertOutsideRepository(repository: string): void {
    if (containedIn(repository, this.#root)) throw new ReceiptRootInsideRepositoryError(this.#root);
  }

  receiptPath(receipt: Pick<RunReceipt, "repository_id" | "receipt_id">): string {
    return join(this.#root, repositoryIdSha256(receipt.repository_id), `${receipt.receipt_id.replace(/^mc-receipt:/u, "")}.json`);
  }

  /** Validate, refuse private content, then write the receipt (0600) and append the index line. */
  write(receipt: RunReceipt, repository: string): string {
    this.assertOutsideRepository(repository);
    const errors = runReceiptErrors(receipt);
    if (errors.length > 0) throw new RunReceiptInvalidError(errors);
    const violations = receiptPrivacyViolations(receipt);
    if (violations.length > 0) throw new ReceiptPrivacyError(violations);
    const path = this.receiptPath(receipt);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, `${canonicalJson(receipt)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    const entry: ReceiptIndexEntry = {
      receipt_id: receipt.receipt_id,
      repository_id_sha256: repositoryIdSha256(receipt.repository_id),
      mode: receipt.mode,
      head_commit: receipt.subject.head_commit,
      subject_sha256: receipt.subject.repository_object?.sha256 ?? null,
      dirty: receipt.dirty,
      families: receipt.families,
      finding_count: receipt.findings.length,
      verdict: receipt.verdict,
      observed_at: receipt.observed_at,
      path: relative(this.#root, path).split(sep).join("/"),
    };
    sealLiveSegmentIfFull(this.#index, {
      incomingBytes: new TextEncoder().encode(`${canonicalJson(entry)}\n`).byteLength,
      maxSize: this.#segmentMaxBytes,
      summarize: summarizeReceiptIndexSegment,
      betweenSealSteps: this.#betweenSealSteps,
    });
    appendFileSync(join(this.#root, RECEIPT_INDEX_FILE), `${canonicalJson(entry)}\n`, { encoding: "utf8", flag: "a", mode: 0o600 });
    return path;
  }

  /** Read one receipt by id or by path; refuses anything that does not validate. */
  read(reference: string): RunReceipt {
    const path = reference.startsWith("mc-receipt:")
      ? this.#pathForId(reference)
      : resolve(reference);
    if (path === undefined || !existsSync(path)) throw new RunReceiptInvalidError([`receipt not found: ${reference}`]);
    let parsed: unknown;
    try { parsed = JSON.parse(readFileSync(path, "utf8")); } catch { throw new RunReceiptInvalidError([`receipt is not valid JSON: ${reference}`]); }
    const errors = runReceiptErrors(parsed);
    if (errors.length > 0) throw new RunReceiptInvalidError(errors);
    return parsed as RunReceipt;
  }

  /** Every index entry in append order: sealed segments (digest-checked) one at a time, then the live one. */
  index(): ReceiptIndexEntry[] {
    return this.#entries(() => true);
  }

  /** Index entries for one repository identity, oldest first. Sealed segments
   * holding no entry for the repository are not read. */
  forRepository(repositoryId: string): ReceiptIndexEntry[] {
    const sha = repositoryIdSha256(repositoryId);
    return this.#entries((segment) => segment.groups.includes(sha)).filter((entry) => entry.repository_id_sha256 === sha)
      .sort((left, right) => left.observed_at.localeCompare(right.observed_at) || left.receipt_id.localeCompare(right.receipt_id));
  }

  #entries(include: (segment: SealedSegment) => boolean): ReceiptIndexEntry[] {
    const manifest = openSegments(this.#index, summarizeReceiptIndexSegment);
    const entries: ReceiptIndexEntry[] = [];
    for (const segment of manifest.segments) {
      if (include(segment)) entries.push(...indexEntries(readSealedSegment(this.#index, segment), segment.file, false));
    }
    entries.push(...indexEntries(readLiveSegment(this.#index), RECEIPT_INDEX_FILE, true));
    return entries;
  }

  /** Lookup by id: the live segment, then each sealed segment's key index
   * (newest first); only the one sealed segment that holds the id is read. */
  #pathForId(receiptId: string): string | undefined {
    const manifest = openSegments(this.#index, summarizeReceiptIndexSegment);
    let entry = indexEntries(readLiveSegment(this.#index), RECEIPT_INDEX_FILE, true).find((item) => item.receipt_id === receiptId);
    for (const segment of [...manifest.segments].reverse()) {
      if (entry !== undefined) break;
      if (!readSegmentKeys(this.#index, segment).includes(receiptId)) continue;
      entry = indexEntries(readSealedSegment(this.#index, segment), segment.file, false).find((item) => item.receipt_id === receiptId);
    }
    return entry === undefined ? undefined : join(this.#root, entry.path);
  }
}

export function newReceiptId(): string {
  return `mc-receipt:${randomUUID()}`;
}

/** Load an explicit agent card; identity is never inferred from the environment. */
export function agentFromCard(reference: string | undefined, source: "flag" | "env"): ReceiptAgent {
  if (reference === undefined || reference.trim().length === 0) return { identity_status: "unobserved", card_ref: null, source: null };
  const path = resolve(reference);
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error("agent card must be a readable JSON object"); }
  const card = object(parsed);
  const status = card?.identity_status;
  if (!card || !["receipt", "title_only", "contract_only", "unobserved"].includes(String(status))) {
    throw new Error("agent card requires identity_status: receipt, title_only, contract_only or unobserved");
  }
  if (status === "unobserved") return { identity_status: "unobserved", card_ref: null, source: null };
  const explicitId = typeof card.card_id === "string" && card.card_id.length > 0 && !card.card_id.includes("/") ? card.card_id : undefined;
  const cardRef = explicitId ?? `sha256:${sha256Hex(readFileSync(path, "utf8"))}`;
  return { identity_status: status as Exclude<AgentIdentityStatus, "unobserved">, card_ref: cardRef, source };
}

export function agentFromEnvironment(flagValue: string | undefined, environment: NodeJS.ProcessEnv): ReceiptAgent {
  if (flagValue !== undefined) return agentFromCard(flagValue, "flag");
  return agentFromCard(environment.MISTER_CLEAN_AGENT_CARD, "env");
}
