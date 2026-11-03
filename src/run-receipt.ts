/**
 * Run receipts: `mister-clean.run-receipt/1`.
 *
 * Every CLOSE, AUDIT and SECOND_PASS run writes one receipt to the machine-local
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
import {
  ANCHOR_KINDS,
  RECEIPT_FAMILIES,
  type ReceiptFamily,
  type ReceiptFinding,
} from "./closeout/finding-anchors.js";
import { publicSafetyValueDigestsInText } from "./closeout/inspection.js";
import type { RepositoryObject } from "./closeout/repository-object.js";

export const RUN_RECEIPT_RECORD_TYPE = "mister-clean.run-receipt";
export const RUN_RECEIPT_SCHEMA_VERSION = "1";
export const RECEIPT_INDEX_FILE = "receipts.index.jsonl";

export type ReceiptMode = "CLOSE" | "AUDIT" | "SECOND_PASS";
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

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
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
  if (!exactKeys(record, [
    "record_type", "schema_version", "receipt_id", "invocation_id", "mode", "repository_id", "subject", "dirty",
    "detector_registry_sha256", "runtime_identity_sha256", "agent", "families", "findings", "verdict", "exit_code",
    "observed_at", "finished_at",
  ], "$", errors)) return errors;
  if (record.record_type !== RUN_RECEIPT_RECORD_TYPE) errors.push(`$.record_type: expected ${RUN_RECEIPT_RECORD_TYPE}`);
  if (record.schema_version !== RUN_RECEIPT_SCHEMA_VERSION) errors.push(`$.schema_version: expected ${RUN_RECEIPT_SCHEMA_VERSION}`);
  if (typeof record.receipt_id !== "string" || !/^mc-receipt:[0-9a-f-]{36}$/u.test(record.receipt_id)) errors.push("$.receipt_id: expected mc-receipt:<uuid>");
  if (record.invocation_id !== null && (typeof record.invocation_id !== "string" || !record.invocation_id.startsWith("mc-invocation:"))) errors.push("$.invocation_id: expected null or mc-invocation:<uuid>");
  if (!["CLOSE", "AUDIT", "SECOND_PASS"].includes(String(record.mode))) errors.push("$.mode: expected CLOSE, AUDIT or SECOND_PASS");
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
  if (!canonicalTimestamp(record.observed_at)) errors.push("$.observed_at: expected canonical ISO timestamp");
  if (!canonicalTimestamp(record.finished_at)) errors.push("$.finished_at: expected canonical ISO timestamp");
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

/** Machine-local receipt custody: one directory per repository identity plus one index. */
export class LocalRunReceiptStore {
  readonly #root: string;

  constructor(root: string) {
    if (!isAbsolute(root)) throw new Error("receipt root must be an absolute machine-local path");
    this.#root = root;
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

  index(): ReceiptIndexEntry[] {
    const path = join(this.#root, RECEIPT_INDEX_FILE);
    if (!existsSync(path)) return [];
    const contents = readFileSync(path, "utf8");
    if (contents.length === 0) return [];
    if (!contents.endsWith("\n")) throw new RunReceiptInvalidError(["receipt index must end with a newline"]);
    return contents.slice(0, -1).split("\n").map((line, index) => {
      let parsed: unknown;
      try { parsed = JSON.parse(line); } catch { throw new RunReceiptInvalidError([`receipt index is not valid JSONL at line ${index + 1}`]); }
      const record = object(parsed);
      if (!record || typeof record.receipt_id !== "string" || typeof record.repository_id_sha256 !== "string" || typeof record.path !== "string") {
        throw new RunReceiptInvalidError([`receipt index has an invalid entry at line ${index + 1}`]);
      }
      return record as unknown as ReceiptIndexEntry;
    });
  }

  /** Index entries for one repository identity, oldest first. */
  forRepository(repositoryId: string): ReceiptIndexEntry[] {
    const sha = repositoryIdSha256(repositoryId);
    return this.index().filter((entry) => entry.repository_id_sha256 === sha)
      .sort((left, right) => left.observed_at.localeCompare(right.observed_at) || left.receipt_id.localeCompare(right.receipt_id));
  }

  #pathForId(receiptId: string): string | undefined {
    const entry = this.index().find((item) => item.receipt_id === receiptId);
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
