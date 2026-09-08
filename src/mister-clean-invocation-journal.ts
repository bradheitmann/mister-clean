import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute } from "node:path";

import { canonicalJson } from "./canonical-json.js";

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

/** Read the single append-only CLI journal for later runtime reconciliation.
 * The journal intentionally proves only that a local CLI invocation occurred;
 * it contains no tuple, route, or quality claim. */
export function readMisterCleanInvocationJournal(path: string): readonly ImportedMisterCleanInvocation[] {
  if (!isAbsolute(path)) throw new Error("Mister Clean invocation journal path must be absolute");
  if (!existsSync(path)) return [];
  const contents = readFileSync(path, "utf8");
  if (contents.length === 0) return [];
  if (contents.length > 0 && !contents.endsWith("\n")) throw new Error("Mister Clean invocation journal must end with a canonical JSONL newline");
  const started = new Map<string, ImportedMisterCleanInvocation>();
  const ended = new Map<string, { readonly status: "SUCCEEDED" | "FAILED"; readonly exit_code: number; readonly observed_at: string; readonly run_event_id: string | null }>();
  for (const [index, line] of contents.slice(0, -1).split("\n").entries()) {
    if (line.length === 0) throw new Error(`Mister Clean invocation journal has a blank receipt line at ${index + 1}`);
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { throw new Error(`Mister Clean invocation journal is not valid JSONL at line ${index + 1}`); }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`Mister Clean invocation journal has an invalid receipt at line ${index + 1}`);
    const record = parsed as Record<string, unknown>;
    if (record.record_type !== "mister-clean.invocation-receipt" || record.schema_version !== "1.0") throw new Error(`Mister Clean invocation journal has an invalid receipt at line ${index + 1}`);
    if (record.event === "started") {
      const current = sameKeys(record, ["record_type", "schema_version", "event", "invocation_id", "command", "argv_sha256", "observed_at", "identity_provenance", "evaluation_status", "evaluation_run_event_id"]);
      const legacy = sameKeys(record, ["record_type", "schema_version", "event", "invocation_id", "command", "argv_sha256", "observed_at", "identity_provenance", "evaluation_run_event_id"]);
      if ((!current && !legacy) || typeof record.invocation_id !== "string" || typeof record.command !== "string" || typeof record.argv_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(record.argv_sha256) || typeof record.observed_at !== "string" || record.identity_provenance !== "UNOBSERVED" || record.evaluation_run_event_id !== null || (current && record.evaluation_status !== "PENDING_IDENTITY_EVALUATION")) throw new Error(`Mister Clean invocation journal has an invalid start receipt at line ${index + 1}`);
      // Pre-P1 receipts had no explicit status. Their only safe migration is
      // the same pending state; they still cannot yield a tuple or credit.
      const canonical = current
        ? { record_type: "mister-clean.invocation-receipt", schema_version: "1.0", event: "started", invocation_id: record.invocation_id, command: record.command, argv_sha256: record.argv_sha256, observed_at: record.observed_at, identity_provenance: "UNOBSERVED", evaluation_status: "PENDING_IDENTITY_EVALUATION", evaluation_run_event_id: null }
        : { record_type: "mister-clean.invocation-receipt", schema_version: "1.0", event: "started", invocation_id: record.invocation_id, command: record.command, argv_sha256: record.argv_sha256, observed_at: record.observed_at, identity_provenance: "UNOBSERVED", evaluation_run_event_id: null };
      if (line !== canonicalJson(canonical)) throw new Error(`Mister Clean invocation journal has a non-canonical receipt at line ${index + 1}`);
      const value = { invocation_id: record.invocation_id, command: record.command, argv_sha256: record.argv_sha256, observed_at: record.observed_at, receipt_sha256: sha256(line), terminal_status: null, terminal_exit_code: null, terminal_observed_at: null, terminal_run_event_id: null } as const;
      const existing = started.get(value.invocation_id);
      if (existing !== undefined && canonicalJson(existing) !== canonicalJson(value)) throw new Error(`Mister Clean invocation journal reuses invocation_id with different content at line ${index + 1}`);
      started.set(value.invocation_id, value);
    } else if (record.event === "finished") {
      if (!sameKeys(record, ["record_type", "schema_version", "event", "invocation_id", "run_event_id", "status", "exit_code", "observed_at"])
        || typeof record.invocation_id !== "string" || (record.run_event_id !== null && typeof record.run_event_id !== "string")
        || (record.status !== "SUCCEEDED" && record.status !== "FAILED") || typeof record.exit_code !== "number" || !Number.isInteger(record.exit_code) || record.exit_code < 0 || record.exit_code > 255
        || (record.status === "SUCCEEDED" && record.exit_code !== 0) || (record.status === "FAILED" && record.exit_code === 0)
        || typeof record.observed_at !== "string" || !canonicalTimestamp(record.observed_at) || line !== canonicalJson(record)) {
        throw new Error(`Mister Clean invocation journal has an invalid terminal receipt at line ${index + 1}`);
      }
      if (!started.has(record.invocation_id)) throw new Error(`Mister Clean invocation journal terminates an unknown invocation at line ${index + 1}`);
      if (ended.has(record.invocation_id)) throw new Error(`Mister Clean invocation journal terminates an invocation more than once at line ${index + 1}`);
      ended.set(record.invocation_id, { status: record.status, exit_code: record.exit_code, observed_at: record.observed_at, run_event_id: record.run_event_id });
    } else if (record.event !== "evaluation_run_linked" || !sameKeys(record, ["record_type", "schema_version", "event", "invocation_id", "run_event_id", "observed_at"]) || typeof record.invocation_id !== "string" || typeof record.run_event_id !== "string" || typeof record.observed_at !== "string" || line !== canonicalJson(record)) {
      throw new Error(`Mister Clean invocation journal has an invalid receipt at line ${index + 1}`);
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
  readonly #path: string;

  constructor(path: string) {
    if (!isAbsolute(path)) throw new Error("MISTER_CLEAN_INVOCATION_JOURNAL_PATH must be an absolute machine-local path");
    this.#path = path;
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
    appendFileSync(this.#path, `${canonicalJson(record)}\n`, { encoding: "utf8", flag: "a", mode: 0o600 });
  }

  #assertExistingIntegrity(): void {
    readMisterCleanInvocationJournal(this.#path);
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
