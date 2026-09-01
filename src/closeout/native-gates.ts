import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  accessSync,
  closeSync,
  constants,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
} from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readlink,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { captureRepositoryObject, type RepositoryObject } from "./repository-object.js";

export type NativeGateKind = "established_ci" | "repository_tests" | "lint" | "typecheck" | "build";
export type NativeGateDisposition = "required" | "not_applicable" | "absent";
export type NativeGateExecutionState = "passed" | "failed" | "blocked" | "timed_out" | "skipped";
export type NativeGateBasis =
  | "tracked_package_script"
  | "tracked_cargo_manifest"
  | "tracked_go_manifest"
  | "empty_script"
  | "forbidden_script"
  | "invalid_package_manifest"
  | "manager_conflict"
  | "manager_unresolved"
  | "nonpreemptible_timeout_wrapper"
  | "no_recognized_quality_script"
  | "no_supported_native_manifest";
export type NativeGateFailureReason =
  | "repository_object_mismatch"
  | "operator_skip"
  | "invalid_cwd"
  | "executable_unavailable"
  | "executable_unreadable"
  | "snapshot_unavailable"
  | "subject_repository_changed"
  | "repository_mutated"
  | "timeout"
  | "output_limit_exceeded"
  | "spawn_error"
  | "process_cleanup_failed"
  | "nonzero_exit"
  | "terminated_by_signal";

export interface NativeGateSourceRef {
  readonly kind: "package_manifest" | "lockfile" | "cargo_manifest" | "go_manifest" | "runner_source";
  readonly path: string;
  readonly sha256: string;
}

export interface NativeGateCommand {
  readonly adapter: "node-package-script" | "cargo" | "go";
  readonly executable: "bun" | "pnpm" | "npm" | "yarn" | "cargo" | "go";
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env_policy: "credential_scrubbed_ci";
}

export interface NativeGateDefinition {
  readonly id: string;
  readonly kind: NativeGateKind;
  readonly disposition: NativeGateDisposition;
  readonly basis: NativeGateBasis;
  readonly source_refs: readonly NativeGateSourceRef[];
  readonly script_sha256?: string;
  readonly command?: NativeGateCommand;
  /** Stable identity of what the gate means, excluding volatile evidence digests. */
  readonly semantic_contract_sha256: string;
  /** Exact identity of the complete evidence-bound definition. */
  readonly definition_sha256: string;
}

export interface NativeGateDiscovery {
  readonly record_type: "mister-clean.native-gate-discovery";
  readonly schema_version: "1.2";
  readonly repository_object: RepositoryObject;
  readonly source_refs: readonly NativeGateSourceRef[];
  readonly gates: readonly NativeGateDefinition[];
  readonly required_gate_ids: readonly string[];
  readonly catalog_sha256: string;
}

export interface NativeGateOutputRef {
  readonly path: string;
  readonly sha256: string;
  readonly byte_count: number;
  readonly complete: boolean;
}

export interface NativeGateExecution {
  readonly gate_id: string;
  readonly kind: NativeGateKind;
  readonly isolation: "disposable_exact_object_snapshot";
  readonly state: NativeGateExecutionState;
  readonly failure_reason: NativeGateFailureReason | null;
  readonly command: NativeGateCommand;
  readonly command_sha256: string;
  readonly resolved_executable: string | null;
  readonly executable_sha256: string | null;
  readonly started_at: string;
  readonly finished_at: string;
  readonly start_repository_object: RepositoryObject;
  readonly end_repository_object: RepositoryObject;
  readonly subject_start_state: NativeGateSubjectState;
  readonly subject_end_state: NativeGateSubjectState;
  readonly exit_code: number | null;
  readonly signal: string | null;
  readonly stdout_ref: NativeGateOutputRef;
  readonly stderr_ref: NativeGateOutputRef;
}

export interface NativeGateCoverage {
  readonly record_type: "mister-clean.native-gate-coverage";
  readonly schema_version: "1.2";
  readonly discovery_sha256: string;
  readonly closing_repository_object: RepositoryObject;
  readonly required_gate_ids: readonly string[];
  readonly executions: readonly NativeGateExecution[];
  readonly coverage_sha256: string;
}

export interface NativeGateSubjectState {
  readonly record_type: "mister-clean.native-gate-subject-state";
  readonly schema_version: "1.0";
  readonly repository_object: RepositoryObject;
  readonly refs_sha256: string;
  readonly stash_sha256: string;
  readonly worktree_topology_sha256: string;
  readonly state_sha256: string;
}

export interface NativeGateFailureObservation {
  readonly gate: NativeGateDefinition;
  readonly execution: NativeGateExecution | undefined;
  readonly source_id: "mister-clean/native_gate@4";
  readonly source_native_fingerprint: string;
  readonly normalizer: "mister-clean/native-gate-root@4";
  readonly cause_key: {
    readonly gate_id: string;
    readonly semantic_contract_sha256: string;
  };
}

export interface RunNativeGateOptions {
  readonly timeout_ms?: number;
  readonly max_output_bytes?: number;
  readonly termination_grace_ms?: number;
  readonly skip_gate_ids?: readonly string[];
  readonly now?: () => Date;
}

export interface ValidateNativeGateOptions {
  readonly validation_time?: Date;
  readonly max_future_skew_ms?: number;
  /** False validates evidence integrity without pretending a failing gate passed. */
  readonly require_passing?: boolean;
}

type NodeManager = "bun" | "pnpm" | "npm" | "yarn";

interface PackageManifest {
  readonly packageManager?: unknown;
  readonly scripts?: unknown;
}

interface NativeGateIndexEntry {
  readonly mode: "100644" | "100755" | "120000" | "160000";
  readonly oid: string;
  readonly path: string;
}

interface NativeGateReachabilityRef {
  readonly refname: string;
  readonly oid: string;
  readonly objecttype: string;
}

export interface NativeGateExecutionSnapshot {
  readonly container: string;
  readonly repository: string;
  readonly home: string;
  readonly repository_object: RepositoryObject;
}

export interface VerificationRunnerSafetyFinding {
  readonly line: number;
  readonly path: string;
  readonly rule: "synchronous_child_deadline_unenforceable";
}

const DISCOVERY_RECORD_TYPE = "mister-clean.native-gate-discovery";
export const COVERAGE_RECORD_TYPE = "mister-clean.native-gate-coverage";
export const SCHEMA_VERSION = "1.2";
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000;
export const DEFAULT_OUTPUT_BYTES = 1024 * 1024;
export const DEFAULT_TERMINATION_GRACE_MS = 1_000;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_GIT_OUTPUT_BYTES = 128 * 1024 * 1024;
export const HEX64 = /^[0-9a-f]{64}$/;
const GIT_OID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const UTF8 = new TextDecoder("utf-8", { fatal: true });
export const NATIVE_GATE_KINDS = new Set<NativeGateKind>([
  "established_ci", "repository_tests", "lint", "typecheck", "build",
]);
const NATIVE_GATE_DISPOSITIONS = new Set<NativeGateDisposition>(["required", "not_applicable", "absent"]);
const NATIVE_GATE_BASES = new Set<NativeGateBasis>([
  "tracked_package_script",
  "tracked_cargo_manifest",
  "tracked_go_manifest",
  "empty_script",
  "forbidden_script",
  "invalid_package_manifest",
  "manager_conflict",
  "manager_unresolved",
  "nonpreemptible_timeout_wrapper",
  "no_recognized_quality_script",
  "no_supported_native_manifest",
]);
export const NATIVE_GATE_STATES = new Set<NativeGateExecutionState>([
  "passed", "failed", "blocked", "timed_out", "skipped",
]);
export const NATIVE_GATE_FAILURE_REASONS = new Set<NativeGateFailureReason>([
  "repository_object_mismatch",
  "operator_skip",
  "invalid_cwd",
  "executable_unavailable",
  "executable_unreadable",
  "snapshot_unavailable",
  "subject_repository_changed",
  "repository_mutated",
  "timeout",
  "output_limit_exceeded",
  "spawn_error",
  "process_cleanup_failed",
  "nonzero_exit",
  "terminated_by_signal",
]);

/**
 * One canonical native-gate failure projection is shared by closeout
 * generation and validation. Keeping the byte preimage here prevents a
 * preparer/validator version split from manufacturing hygiene debt.
 */
export function nativeGateFailureObservations(
  discovery: NativeGateDiscovery,
  coverage: NativeGateCoverage,
): NativeGateFailureObservation[] {
  const executions = new Map(coverage.executions.map((entry) => [entry.gate_id, entry]));
  return discovery.gates.flatMap((gate) => {
    const execution = executions.get(gate.id);
    const absent = gate.disposition === "absent";
    const nonpassing = gate.disposition === "required" && execution?.state !== "passed";
    if (!absent && !nonpassing) return [];
    const sourceNativeFingerprint = absent
      ? sha256(JSON.stringify([
          "native-gate-absent@3", gate.id, gate.semantic_contract_sha256, gate.basis,
        ]))
      : sha256(JSON.stringify([
          "native-gate-execution@3",
          gate.id,
          gate.semantic_contract_sha256,
          execution?.state ?? "unexecuted",
          execution?.failure_reason ?? null,
          execution?.failure_reason === "nonzero_exit" ? execution.exit_code : null,
          execution?.failure_reason === "terminated_by_signal" ? execution.signal : null,
        ]));
    return [{
      gate,
      execution,
      source_id: "mister-clean/native_gate@4" as const,
      source_native_fingerprint: sourceNativeFingerprint,
      normalizer: "mister-clean/native-gate-root@4" as const,
      cause_key: {
        gate_id: gate.id,
        semantic_contract_sha256: gate.semantic_contract_sha256,
      },
    }];
  });
}

const LOCKFILE_MANAGERS = new Map<string, NodeManager>([
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["pnpm-lock.yaml", "pnpm"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
  ["yarn.lock", "yarn"],
]);

const AGGREGATE_SCRIPTS = ["ci:check", "ci", "check", "verify"] as const;
const INDIVIDUAL_SCRIPTS = [
  { names: ["test"] as const, kind: "repository_tests" as const },
  { names: ["lint"] as const, kind: "lint" as const },
  { names: ["typecheck", "type-check"] as const, kind: "typecheck" as const },
  { names: ["build"] as const, kind: "build" as const },
] as const;

// These patterns are deliberately narrow. Native package scripts are repository
// policy, but an audit gate may not be a delivery, network, privilege, or
// destructive operation merely because it has a familiar script name.
const FORBIDDEN_SCRIPT_PATTERNS = [
  /(?:^|[\s;&|()])(?:curl|wget|ssh|scp|sftp|sudo)(?=$|[\s;&|()])/iu,
  /(?:^|[\s;&|()])rm\s+(?:-[a-z]*r[a-z]*f|-rf|-fr)(?=$|\s)/iu,
  /(?:^|[\s;&|()])(?:npm|pnpm|yarn|bun)\s+(?:publish|deploy|release)(?=$|\s)/iu,
  /(?:^|[\s;&|()])(?:npx|bunx)(?=$|\s)/iu,
  /(?:^|[\s;&|()])pnpm\s+dlx(?=$|\s)/iu,
  /(?:^|[\s;&|()])npm\s+exec(?=$|\s)/iu,
  /(?:^|[\s;&|()])(?:wrangler|fly|kubectl|helm|terraform|pulumi)\s+(?:deploy|publish|apply|destroy|up|release)(?=$|\s)/iu,
] as const;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON refuses a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${fields.join(",")}}`;
  }
  throw new Error(`canonical JSON refuses ${typeof value}`);
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function identity(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function stableEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function withoutField<T extends object>(value: T, field: keyof T): Record<string, unknown> {
  const record = { ...value } as Record<string, unknown>;
  delete record[String(field)];
  return record;
}

export function assertPositiveInteger(name: string, value: number, maximum = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be a positive safe integer no greater than ${String(maximum)}`);
  }
}

export function repositoryRelation(repository: string, target: string): string {
  const relation = relative(repository, target);
  if (relation === "") return ".";
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error(`path escapes repository root: ${target}`);
  }
  return relation.split(sep).join("/");
}

export function validatePortablePath(path: string, source: string): void {
  if (!path || isAbsolute(path) || path.includes("\0") || (sep === "\\" && path.includes("\\"))) {
    throw new Error(`${source} contains an unsafe path: ${JSON.stringify(path)}`);
  }
  if (path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`${source} contains an ambiguous path: ${JSON.stringify(path)}`);
  }
}

function gitBytes(repository: string, args: readonly string[], input?: Buffer): Buffer {
  const result = spawnSync(
    "git",
    ["--no-optional-locks", "-C", repository, ...args],
    {
      encoding: null,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
      input,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    },
  );
  if (result.error) throw new Error(`git ${args.join(" ")} failed: ${errorMessage(result.error)}`);
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    const stderr = Buffer.isBuffer(result.stderr) ? new TextDecoder().decode(result.stderr).trim() : "";
    throw new Error(stderr || `git ${args.join(" ")} exited ${String(result.status)}`);
  }
  return result.stdout;
}

function gitLine(repository: string, args: readonly string[], input?: Buffer): string {
  const bytes = gitBytes(repository, args, input);
  const end = bytes.at(-1) === 0x0a ? bytes.length - 1 : bytes.length;
  const line = UTF8.decode(bytes.subarray(0, end));
  if (!line || line.includes("\n") || line.includes("\r")) {
    throw new Error(`git ${args.join(" ")} returned an ambiguous line`);
  }
  return line;
}

function trackedIndexEntries(repository: string): readonly NativeGateIndexEntry[] {
  const bytes = gitBytes(repository, ["ls-files", "--cached", "--stage", "--full-name", "-z"]);
  if (bytes.length === 0) return [];
  if (bytes.at(-1) !== 0) throw new Error("git ls-files --stage returned a truncated NUL record");
  const entries: NativeGateIndexEntry[] = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0) continue;
    const record = bytes.subarray(start, index);
    const separator = record.indexOf(0x09);
    if (separator <= 0 || separator === record.length - 1) {
      throw new Error("git ls-files --stage returned a malformed index record");
    }
    const metadata = UTF8.decode(record.subarray(0, separator)).split(" ");
    if (metadata.length !== 3 || metadata[2] !== "0") {
      throw new Error("native gate snapshot refuses an unmerged index");
    }
    const [rawMode, oid] = metadata;
    if (!rawMode || !new Set(["100644", "100755", "120000", "160000"]).has(rawMode) || !oid || !GIT_OID.test(oid)) {
      throw new Error("git ls-files --stage returned unsupported index metadata");
    }
    const pathBytes = record.subarray(separator + 1);
    const path = UTF8.decode(pathBytes);
    if (!Buffer.from(path, "utf8").equals(pathBytes)) {
      throw new Error("native gate snapshot refuses non-canonical UTF-8");
    }
    validatePortablePath(path, "git ls-files --stage");
    entries.push({ mode: rawMode as NativeGateIndexEntry["mode"], oid, path });
    start = index + 1;
  }
  return entries.sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
}

function reachabilityRefs(repository: string): readonly NativeGateReachabilityRef[] {
  const bytes = gitBytes(repository, [
    "for-each-ref",
    "--sort=refname",
    "--format=%(refname)%09%(objectname)%09%(objecttype)",
    "refs/heads",
    "refs/remotes",
  ]);
  if (bytes.length === 0) return [];
  const refs: NativeGateReachabilityRef[] = [];
  const text = UTF8.decode(bytes).replace(/\n$/u, "");
  for (const line of text.split("\n")) {
    if (!line) continue;
    const [refname, oid, objecttype, extra] = line.split("\t");
    if (extra !== undefined) throw new Error("git for-each-ref returned malformed reachability records");
    if (!refname || !/^refs\/(?:heads|remotes)\/[A-Za-z0-9._/-]+$/u.test(refname)) {
      throw new Error(`git for-each-ref returned unsafe reachability ref ${JSON.stringify(refname)}`);
    }
    if (!oid || !GIT_OID.test(oid)) throw new Error(`git for-each-ref returned invalid oid for ${JSON.stringify(refname)}`);
    if (!objecttype) throw new Error(`git for-each-ref returned invalid object type for ${JSON.stringify(refname)}`);
    refs.push({ refname, oid, objecttype });
  }
  return refs;
}

function restoreReachabilityRefs(subject: string, repository: string): void {
  for (const ref of reachabilityRefs(subject)) {
    if (ref.objecttype !== "commit") continue;
    gitBytes(repository, ["fetch", "--quiet", "--no-tags", subject, ref.oid]);
    gitBytes(repository, ["update-ref", ref.refname, ref.oid]);
  }
}

function captureSubjectStateOnce(repository: string): NativeGateSubjectState {
  const repositoryObject = captureRepositoryObject(repository);
  const refsSha256 = sha256(gitBytes(repository, [
    "for-each-ref",
    "--sort=refname",
    "--format=%(refname)%00%(objectname)%00%(objecttype)",
  ]));
  const stashSha256 = sha256(gitBytes(repository, [
    "stash",
    "list",
    "--format=%H%x00%gd%x00%gs",
  ]));
  const worktreeTopologySha256 = sha256(gitBytes(repository, ["worktree", "list", "--porcelain", "-z"]));
  const record = {
    record_type: "mister-clean.native-gate-subject-state",
    schema_version: "1.0",
    repository_object: repositoryObject,
    refs_sha256: refsSha256,
    stash_sha256: stashSha256,
    worktree_topology_sha256: worktreeTopologySha256,
  } as const;
  return { ...record, state_sha256: identity(record) };
}

export function captureSubjectState(repository: string): NativeGateSubjectState {
  const first = captureSubjectStateOnce(repository);
  const second = captureSubjectStateOnce(repository);
  if (!stableEqual(first, second)) throw new Error("subject repository changed while native-gate isolation was being proven");
  return first;
}

async function copySubjectWorktree(subject: string, snapshot: string): Promise<void> {
  for (const entry of await readdir(snapshot)) {
    if (entry !== ".git") await rm(join(snapshot, entry), { recursive: true, force: true });
  }
  const sourceRoot = realpathSync(subject);
  for (const entry of await readdir(sourceRoot)) {
    if (entry === ".git") continue;
    const source = join(sourceRoot, entry);
    const target = join(snapshot, entry);
    await cp(source, target, {
      recursive: true,
      preserveTimestamps: true,
      verbatimSymlinks: true,
      filter: async (candidate) => {
        if (basename(candidate) === ".git") return false;
        const stat = await lstat(candidate);
        if (stat.isSymbolicLink()) {
          const link = await readlink(candidate);
          if (isAbsolute(link)) throw new Error(`native gate snapshot refuses absolute symlink ${JSON.stringify(candidate)}`);
          repositoryRelation(sourceRoot, resolve(dirname(candidate), link));
          return true;
        }
        if (!stat.isDirectory() && !stat.isFile()) {
          throw new Error(`native gate snapshot refuses special entry ${JSON.stringify(candidate)}`);
        }
        return true;
      },
    });
  }
}

export async function createExecutionSnapshot(
  subject: string,
  expected: RepositoryObject,
): Promise<NativeGateExecutionSnapshot> {
  const container = await mkdtemp(join(tmpdir(), "mister-clean-native-gate-snapshot-"));
  const repository = join(container, "repository");
  const home = join(container, "home");
  try {
    await mkdir(repository, { mode: 0o700 });
    await mkdir(home, { mode: 0o700 });
    const objectFormat = gitLine(subject, ["rev-parse", "--show-object-format"]);
    if (objectFormat !== "sha1" && objectFormat !== "sha256") {
      throw new Error(`unsupported Git object format ${JSON.stringify(objectFormat)}`);
    }
    gitBytes(repository, ["init", "--quiet", `--object-format=${objectFormat}`]);
    gitBytes(repository, ["fetch", "--quiet", "--no-tags", subject, expected.head_commit]);
    gitBytes(repository, ["checkout", "--quiet", "--detach", expected.head_commit]);
    restoreReachabilityRefs(subject, repository);
    gitBytes(repository, ["read-tree", "--empty"]);
    for (const entry of trackedIndexEntries(subject)) {
      if (entry.mode === "160000") {
        throw new Error(`exact native-gate snapshots do not yet support gitlink ${JSON.stringify(entry.path)}`);
      }
      const sourceBlob = gitBytes(subject, ["cat-file", "blob", entry.oid]);
      const importedOid = gitLine(repository, ["hash-object", "-w", "--stdin"], sourceBlob);
      if (importedOid !== entry.oid) throw new Error(`index object format mismatch at ${JSON.stringify(entry.path)}`);
      gitBytes(repository, ["update-index", "--add", "--cacheinfo", entry.mode, entry.oid, entry.path]);
    }
    await copySubjectWorktree(subject, repository);
    const repositoryObject = captureRepositoryObject(repository);
    if (!stableEqual(repositoryObject, expected)) {
      throw new Error("disposable native-gate snapshot does not reproduce the exact subject repository object");
    }
    return {
      container,
      repository: realpathSync(repository),
      home: realpathSync(home),
      repository_object: repositoryObject,
    };
  } catch (error) {
    await rm(container, { recursive: true, force: true });
    throw error;
  }
}

function trackedPaths(repository: string): readonly string[] {
  const result = spawnSync(
    "git",
    ["--no-optional-locks", "-C", repository, "ls-files", "--cached", "--full-name", "-z"],
    {
      encoding: null,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error) throw new Error(`git ls-files failed: ${errorMessage(result.error)}`);
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    const stderr = Buffer.isBuffer(result.stderr) ? new TextDecoder().decode(result.stderr).trim() : "";
    throw new Error(stderr || `git ls-files exited ${String(result.status)}`);
  }
  if (result.stdout.length === 0) return [];
  if (result.stdout.at(-1) !== 0) throw new Error("git ls-files returned a truncated NUL record");
  const paths: string[] = [];
  let start = 0;
  for (let index = 0; index < result.stdout.length; index += 1) {
    if (result.stdout[index] !== 0) continue;
    const bytes = result.stdout.subarray(start, index);
    if (bytes.length === 0) throw new Error("git ls-files returned an empty path");
    let path: string;
    try {
      path = UTF8.decode(bytes);
    } catch {
      throw new Error("native gate discovery refuses a non-UTF-8 tracked path");
    }
    if (!Buffer.from(path, "utf8").equals(bytes)) throw new Error("native gate discovery refuses non-canonical UTF-8");
    validatePortablePath(path, "git ls-files");
    paths.push(path);
    start = index + 1;
  }
  return paths.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

function trackedFile(repository: string, path: string): string {
  validatePortablePath(path, "tracked file");
  const root = realpathSync(resolve(repository));
  const segments = path.split("/");
  let cursor = root;
  for (const segment of segments) {
    cursor = join(cursor, segment);
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error(`native gate discovery refuses symlink traversal at ${JSON.stringify(path)}`);
  }
  const stat = lstatSync(cursor);
  if (!stat.isFile()) throw new Error(`native gate source is not a regular file: ${JSON.stringify(path)}`);
  repositoryRelation(root, realpathSync(cursor));
  return cursor;
}

function digestFileSync(path: string): string {
  const hash = createHash("sha256");
  const descriptor = openSync(path, constants.O_RDONLY);
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

export async function digestFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function sourceRef(repository: string, path: string, forcedKind?: NativeGateSourceRef["kind"]): NativeGateSourceRef {
  const name = basename(path);
  const kind = forcedKind ?? (name === "package.json"
    ? "package_manifest"
    : name === "Cargo.toml"
      ? "cargo_manifest"
      : name === "go.mod"
        ? "go_manifest"
        : "lockfile");
  return { kind, path, sha256: digestFileSync(trackedFile(repository, path)) };
}

const TEST_SOURCE = /(?:^|\/)[^/]+\.(?:spec|test)\.[cm]?[jt]sx?$/iu;
const LONG_GATE_COMMAND = /^\s*(?:execFileSync|spawnSync)\s*\(\s*["'](?:bun|pnpm|npm|yarn|cargo|go)["']/u;
const LONG_GATE_ARGUMENT = /["'](?:build|check|ci(?::check)?|test|verify)["']|--all-targets|["']\.\/\.\.\.["']/iu;

function balancedCall(content: string, marker: number): string | undefined {
  const open = content.indexOf("(", marker);
  if (open < 0) return undefined;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = open; index < content.length; index += 1) {
    const character = content[index] ?? "";
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return content.slice(marker, index + 1);
    }
  }
  return undefined;
}

function syncChildMarkers(content: string): number[] {
  const markers: number[] = [];
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index] ?? "";
    const next = content[index + 1] ?? "";
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    const name = content.startsWith("execFileSync", index)
      ? "execFileSync"
      : content.startsWith("spawnSync", index)
        ? "spawnSync"
        : "";
    if (!name || /[A-Za-z0-9_$]/u.test(content[index - 1] ?? "")) continue;
    let cursor = index + name.length;
    while (/\s/u.test(content[cursor] ?? "")) cursor += 1;
    if (content[cursor] === "(") markers.push(index);
    index += name.length - 1;
  }
  return markers;
}

function verificationRunnerSafetyFindings(
  repository: string,
  paths: readonly string[],
): VerificationRunnerSafetyFinding[] {
  const findings: VerificationRunnerSafetyFinding[] = [];
  for (const path of paths.filter((candidate) => TEST_SOURCE.test(candidate))) {
    let content = "";
    try {
      const bytes = readFileSync(trackedFile(repository, path));
      if (bytes.length > MAX_MANIFEST_BYTES) continue;
      content = UTF8.decode(bytes);
    } catch {
      continue;
    }
    for (const marker of syncChildMarkers(content)) {
      const call = balancedCall(content, marker);
      if (!call || !LONG_GATE_COMMAND.test(call) || !LONG_GATE_ARGUMENT.test(call) || /\btimeout\s*:/u.test(call)) continue;
      findings.push({
        line: content.slice(0, marker).split(/\r?\n/u).length,
        path,
        rule: "synchronous_child_deadline_unenforceable",
      });
    }
  }
  return findings.sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line);
}

export function auditVerificationRunnerSafety(repository: string): readonly VerificationRunnerSafetyFinding[] {
  const root = realpathSync(resolve(repository));
  return verificationRunnerSafetyFindings(root, trackedPaths(root));
}

function packageManager(value: unknown): NodeManager | undefined {
  if (typeof value !== "string") return undefined;
  return /^(bun|pnpm|npm|yarn)(?:@|$)/u.exec(value)?.[1] as NodeManager | undefined;
}

function parentDirectory(path: string): string | undefined {
  if (path === ".") return undefined;
  const parent = dirname(path);
  return parent === "" ? "." : parent.split(sep).join("/");
}

function commandFor(manager: NodeManager, cwd: string, script: string): NativeGateCommand {
  return {
    adapter: "node-package-script",
    executable: manager,
    argv: ["run", script],
    cwd,
    env_policy: "credential_scrubbed_ci",
  };
}

function semanticGateContract(
  definition: Omit<NativeGateDefinition, "semantic_contract_sha256" | "definition_sha256">,
): Record<string, unknown> {
  return {
    id: definition.id,
    kind: definition.kind,
    disposition: definition.disposition,
    basis: definition.basis,
    ...(definition.script_sha256 === undefined ? {} : { script_sha256: definition.script_sha256 }),
    ...(definition.command === undefined ? {} : { command: definition.command }),
  };
}

function gateDefinition(
  definition: Omit<NativeGateDefinition, "semantic_contract_sha256" | "definition_sha256">,
): NativeGateDefinition {
  const withContract = {
    ...definition,
    semantic_contract_sha256: identity(semanticGateContract(definition)),
  };
  return { ...withContract, definition_sha256: identity(withContract) };
}

function scriptIsForbidden(script: string): boolean {
  return FORBIDDEN_SCRIPT_PATTERNS.some((pattern) => pattern.test(script));
}

function gateIdToken(value: string): string {
  const normalized = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/gu, "-")
    .replaceAll(/-+/gu, "-")
    .replace(/^[^a-z0-9]+/u, "x-")
    .replace(/[^a-z0-9]+$/u, "");
  if (normalized && normalized === value) return normalized;
  return `${normalized || "x"}-${sha256(value).slice(0, 12)}`;
}

function gateIdCwd(cwd: string): string {
  if (cwd === ".") return ".";
  return cwd.split("/").filter(Boolean).map(gateIdToken).join(":") || ".";
}

function nodeGateId(cwd: string, scriptName: string): string {
  return `node:${gateIdCwd(cwd)}:${gateIdToken(scriptName.replaceAll(":", "-"))}`;
}

function nativeQualityGateId(cwd: string): string {
  return `node:${gateIdCwd(cwd)}:native-quality`;
}

function fixedGateId(adapter: "cargo" | "go", cwd: string): string {
  return `${adapter}:${gateIdCwd(cwd)}:test`;
}

function nativeScriptGate(
  cwd: string,
  manager: NodeManager,
  scriptName: string,
  scriptBody: string,
  kind: NativeGateKind,
  refs: readonly NativeGateSourceRef[],
): NativeGateDefinition {
  const base = {
    id: nodeGateId(cwd, scriptName),
    kind,
    source_refs: refs,
    script_sha256: sha256(scriptBody),
  } as const;
  if (!scriptBody.trim()) {
    return gateDefinition({ ...base, disposition: "absent", basis: "empty_script" });
  }
  if (scriptIsForbidden(scriptBody)) {
    return gateDefinition({ ...base, disposition: "absent", basis: "forbidden_script" });
  }
  return gateDefinition({
    ...base,
    disposition: "required",
    basis: "tracked_package_script",
    command: commandFor(manager, cwd, scriptName),
  });
}

function packageScripts(value: unknown): Readonly<Record<string, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const scripts: Record<string, string> = {};
  for (const [name, command] of Object.entries(value)) {
    if (typeof command === "string") scripts[name] = command;
  }
  return scripts;
}

function packageSourceRefs(
  cwd: string,
  sourceRefs: readonly NativeGateSourceRef[],
  managerRoot: string | undefined,
): readonly NativeGateSourceRef[] {
  const manifestPath = cwd === "." ? "package.json" : `${cwd}/package.json`;
  return sourceRefs.filter((ref) => ref.path === manifestPath || (
    managerRoot !== undefined
    && ref.kind === "lockfile"
    && dirname(ref.path) === (managerRoot === "." ? "." : managerRoot)
  ));
}

function discoverNodeGates(
  repository: string,
  paths: readonly string[],
  refs: readonly NativeGateSourceRef[],
): readonly NativeGateDefinition[] {
  const packagePaths = paths.filter((path) => basename(path) === "package.json");
  const markerByDirectory = new Map<string, Set<NodeManager>>();
  for (const path of paths) {
    const manager = LOCKFILE_MANAGERS.get(basename(path));
    if (!manager) continue;
    const directory = dirname(path) === "." ? "." : dirname(path).split(sep).join("/");
    const set = markerByDirectory.get(directory) ?? new Set<NodeManager>();
    set.add(manager);
    markerByDirectory.set(directory, set);
  }

  const parsed = new Map<string, PackageManifest | Error>();
  for (const path of packagePaths) {
    try {
      const bytes = readFileSync(trackedFile(repository, path));
      if (bytes.length > MAX_MANIFEST_BYTES) throw new Error("package manifest exceeds the discovery size limit");
      const value: unknown = JSON.parse(UTF8.decode(bytes));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("package manifest must be an object");
      parsed.set(path, value as PackageManifest);
      const manager = packageManager((value as PackageManifest).packageManager);
      if (manager) {
        const directory = dirname(path) === "." ? "." : dirname(path).split(sep).join("/");
        const set = markerByDirectory.get(directory) ?? new Set<NodeManager>();
        set.add(manager);
        markerByDirectory.set(directory, set);
      }
    } catch (error) {
      parsed.set(path, error instanceof Error ? error : new Error(errorMessage(error)));
    }
  }

  const gates: NativeGateDefinition[] = [];
  for (const path of packagePaths) {
    const cwd = dirname(path) === "." ? "." : dirname(path).split(sep).join("/");
    const manifest = parsed.get(path);
    if (manifest instanceof Error || !manifest) {
      const localRefs = packageSourceRefs(cwd, refs, cwd);
      gates.push(gateDefinition({
        id: nativeQualityGateId(cwd),
        kind: "repository_tests",
        disposition: "absent",
        basis: "invalid_package_manifest",
        source_refs: localRefs,
      }));
      continue;
    }

    let cursor: string | undefined = cwd;
    let managerRoot: string | undefined;
    let managers: ReadonlySet<NodeManager> = new Set<NodeManager>();
    while (cursor !== undefined) {
      const candidate = markerByDirectory.get(cursor);
      if (candidate && candidate.size > 0) {
        managerRoot = cursor;
        managers = candidate;
        break;
      }
      cursor = parentDirectory(cursor);
    }
    const localRefs = packageSourceRefs(cwd, refs, managerRoot);
    if (managers.size !== 1) {
      gates.push(gateDefinition({
        id: nativeQualityGateId(cwd),
        kind: "repository_tests",
        disposition: "absent",
        basis: managers.size > 1 ? "manager_conflict" : "manager_unresolved",
        source_refs: localRefs,
      }));
      continue;
    }

    const manager = [...managers][0]!;
    const scripts = packageScripts(manifest.scripts);
    const aggregate = AGGREGATE_SCRIPTS.find((name) => Object.hasOwn(scripts, name));
    if (aggregate) {
      gates.push(nativeScriptGate(cwd, manager, aggregate, scripts[aggregate]!, "established_ci", localRefs));
      continue;
    }
    let selected = 0;
    for (const candidate of INDIVIDUAL_SCRIPTS) {
      const name = candidate.names.find((entry) => Object.hasOwn(scripts, entry));
      if (!name) continue;
      selected += 1;
      gates.push(nativeScriptGate(cwd, manager, name, scripts[name]!, candidate.kind, localRefs));
    }
    if (selected === 0) {
      gates.push(gateDefinition({
        id: nativeQualityGateId(cwd),
        kind: "repository_tests",
        disposition: "not_applicable",
        basis: "no_recognized_quality_script",
        source_refs: localRefs,
      }));
    }
  }
  return gates;
}

function discoverFixedGates(
  paths: readonly string[],
  refs: readonly NativeGateSourceRef[],
): readonly NativeGateDefinition[] {
  const gates: NativeGateDefinition[] = [];
  for (const path of paths.filter((entry) => basename(entry) === "Cargo.toml")) {
    const cwd = dirname(path) === "." ? "." : dirname(path).split(sep).join("/");
    gates.push(gateDefinition({
      id: fixedGateId("cargo", cwd),
      kind: "repository_tests",
      disposition: "required",
      basis: "tracked_cargo_manifest",
      source_refs: refs.filter((ref) => ref.path === path),
      command: {
        adapter: "cargo",
        executable: "cargo",
        argv: ["test", "--all-targets"],
        cwd,
        env_policy: "credential_scrubbed_ci",
      },
    }));
  }
  for (const path of paths.filter((entry) => basename(entry) === "go.mod")) {
    const cwd = dirname(path) === "." ? "." : dirname(path).split(sep).join("/");
    gates.push(gateDefinition({
      id: fixedGateId("go", cwd),
      kind: "repository_tests",
      disposition: "required",
      basis: "tracked_go_manifest",
      source_refs: refs.filter((ref) => ref.path === path),
      command: {
        adapter: "go",
        executable: "go",
        argv: ["test", "./..."],
        cwd,
        env_policy: "credential_scrubbed_ci",
      },
    }));
  }
  return gates;
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function validateExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
  errors: string[],
): Record<string, unknown> | undefined {
  const raw = record(value);
  if (!raw) {
    errors.push(`${label} must be an object`);
    return undefined;
  }
  const actual = Object.keys(raw).sort();
  const canonical = [...expected].sort();
  if (!stableEqual(actual, canonical)) {
    const missing = canonical.filter((key) => !Object.hasOwn(raw, key));
    const unexpected = actual.filter((key) => !canonical.includes(key));
    if (missing.length > 0) errors.push(`${label} is missing keys: ${missing.join(", ")}`);
    if (unexpected.length > 0) errors.push(`${label} has unexpected keys: ${unexpected.join(", ")}`);
  }
  return raw;
}

export function validateRepositoryObjectSchema(value: unknown, label: string, errors: string[]): value is RepositoryObject {
  const before = errors.length;
  const raw = validateExactKeys(value, [
    "record_type", "schema_version", "head_commit", "surface", "entry_count", "sha256",
  ], label, errors);
  if (!raw) return false;
  if (raw.record_type !== "mister-clean.repository-object") errors.push(`${label}.record_type is invalid`);
  if (raw.schema_version !== "1.0") errors.push(`${label}.schema_version is invalid`);
  if (typeof raw.head_commit !== "string" || !GIT_OID.test(raw.head_commit)) errors.push(`${label}.head_commit is invalid`);
  if (raw.surface !== "tracked_and_nonignored") errors.push(`${label}.surface is invalid`);
  if (!Number.isSafeInteger(raw.entry_count) || Number(raw.entry_count) < 0) errors.push(`${label}.entry_count is invalid`);
  if (typeof raw.sha256 !== "string" || !HEX64.test(raw.sha256)) errors.push(`${label}.sha256 is invalid`);
  return errors.length === before;
}

function validateSourceRef(value: unknown, label: string, errors: string[]): value is NativeGateSourceRef {
  const before = errors.length;
  const raw = validateExactKeys(value, ["kind", "path", "sha256"], label, errors);
  if (!raw) return false;
  const kinds = new Set(["package_manifest", "lockfile", "cargo_manifest", "go_manifest", "runner_source"]);
  if (typeof raw.kind !== "string" || !kinds.has(raw.kind)) errors.push(`${label}.kind is invalid`);
  if (typeof raw.path !== "string") {
    errors.push(`${label}.path is invalid`);
  } else {
    try {
      validatePortablePath(raw.path, label);
    } catch (error) {
      errors.push(errorMessage(error));
    }
    const name = basename(raw.path);
    const expectedKind = TEST_SOURCE.test(raw.path)
      ? "runner_source"
      : name === "package.json"
      ? "package_manifest"
      : name === "Cargo.toml"
        ? "cargo_manifest"
        : name === "go.mod"
          ? "go_manifest"
          : LOCKFILE_MANAGERS.has(name)
            ? "lockfile"
            : undefined;
    if (expectedKind === undefined || raw.kind !== expectedKind) errors.push(`${label}.kind does not match path`);
  }
  if (typeof raw.sha256 !== "string" || !HEX64.test(raw.sha256)) errors.push(`${label}.sha256 is invalid`);
  return errors.length === before;
}

export function validateCommand(value: unknown, label: string, errors: string[]): value is NativeGateCommand {
  const before = errors.length;
  const raw = validateExactKeys(value, ["adapter", "executable", "argv", "cwd", "env_policy"], label, errors);
  if (!raw) return false;
  if (raw.env_policy !== "credential_scrubbed_ci") errors.push(`${label}.env_policy is invalid`);
  if (typeof raw.cwd !== "string") {
    errors.push(`${label}.cwd is invalid`);
  } else if (raw.cwd !== ".") {
    try {
      validatePortablePath(raw.cwd, label);
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
  if (!Array.isArray(raw.argv) || raw.argv.some((entry) => typeof entry !== "string" || !entry || entry.includes("\0"))) {
    errors.push(`${label}.argv is invalid`);
  }
  if (raw.adapter === "node-package-script") {
    if (!new Set(["bun", "pnpm", "npm", "yarn"]).has(String(raw.executable))) {
      errors.push(`${label}.executable does not match node-package-script adapter`);
    }
    if (!Array.isArray(raw.argv) || raw.argv.length !== 2 || raw.argv[0] !== "run") {
      errors.push(`${label}.argv is not an exact package-script command`);
    }
  } else if (raw.adapter === "cargo") {
    if (raw.executable !== "cargo" || !stableEqual(raw.argv, ["test", "--all-targets"])) {
      errors.push(`${label} is not the fixed Cargo adapter`);
    }
  } else if (raw.adapter === "go") {
    if (raw.executable !== "go" || !stableEqual(raw.argv, ["test", "./..."])) {
      errors.push(`${label} is not the fixed Go adapter`);
    }
  } else {
    errors.push(`${label}.adapter is invalid`);
  }
  return errors.length === before;
}

function validateGateDefinition(
  value: unknown,
  label: string,
  discoveryRefs: readonly NativeGateSourceRef[],
  errors: string[],
): value is NativeGateDefinition {
  const before = errors.length;
  const raw = record(value);
  if (!raw) {
    errors.push(`${label} must be an object`);
    return false;
  }
  const optional = [
    ...(Object.hasOwn(raw, "script_sha256") ? ["script_sha256"] : []),
    ...(Object.hasOwn(raw, "command") ? ["command"] : []),
  ];
  validateExactKeys(raw, [
    "id", "kind", "disposition", "basis", "source_refs",
    "semantic_contract_sha256", "definition_sha256", ...optional,
  ], label, errors);
  if (typeof raw.id !== "string" || !/^[a-z0-9][a-z0-9:._-]*$/u.test(raw.id)) errors.push(`${label}.id is invalid`);
  if (typeof raw.kind !== "string" || !NATIVE_GATE_KINDS.has(raw.kind as NativeGateKind)) errors.push(`${label}.kind is invalid`);
  if (typeof raw.disposition !== "string" || !NATIVE_GATE_DISPOSITIONS.has(raw.disposition as NativeGateDisposition)) {
    errors.push(`${label}.disposition is invalid`);
  }
  if (typeof raw.basis !== "string" || !NATIVE_GATE_BASES.has(raw.basis as NativeGateBasis)) errors.push(`${label}.basis is invalid`);
  if (!Array.isArray(raw.source_refs)) {
    errors.push(`${label}.source_refs must be an array`);
  } else {
    const seen = new Set<string>();
    raw.source_refs.forEach((ref, index) => {
      const refLabel = `${label}.source_refs[${String(index)}]`;
      if (!validateSourceRef(ref, refLabel, errors)) return;
      const key = canonicalJson(ref);
      if (seen.has(key)) errors.push(`${refLabel} is duplicated`);
      seen.add(key);
      if (!discoveryRefs.some((candidate) => stableEqual(candidate, ref))) {
        errors.push(`${refLabel} is not bound by discovery.source_refs`);
      }
    });
  }
  if (Object.hasOwn(raw, "script_sha256") && (typeof raw.script_sha256 !== "string" || !HEX64.test(raw.script_sha256))) {
    errors.push(`${label}.script_sha256 is invalid`);
  }
  if (Object.hasOwn(raw, "command")) validateCommand(raw.command, `${label}.command`, errors);
  if (raw.disposition === "required" && !Object.hasOwn(raw, "command")) errors.push(`${label} required gate has no command`);
  if (raw.disposition !== "required" && Object.hasOwn(raw, "command")) errors.push(`${label} non-required gate has a command`);
  if (raw.basis === "tracked_package_script" && !Object.hasOwn(raw, "script_sha256")) {
    errors.push(`${label} tracked package script has no script_sha256`);
  }
  const command = record(raw.command);
  if (command?.adapter === "node-package-script" && Array.isArray(command.argv) && typeof command.argv[1] === "string") {
    const expectedId = nodeGateId(String(command.cwd), command.argv[1]);
    if (raw.id !== expectedId || raw.basis !== "tracked_package_script") {
      errors.push(`${label}: node gate id or basis does not match its exact command`);
    }
    const manifestPath = command.cwd === "." ? "package.json" : `${String(command.cwd)}/package.json`;
    if (!Array.isArray(raw.source_refs)
      || !raw.source_refs.some((ref) => record(ref)?.kind === "package_manifest" && record(ref)?.path === manifestPath)) {
      errors.push(`${label}: node gate is not bound to its exact package manifest`);
    }
  } else if (command?.adapter === "cargo") {
    if (raw.id !== fixedGateId("cargo", String(command.cwd)) || raw.basis !== "tracked_cargo_manifest") {
      errors.push(`${label}: Cargo gate id or basis does not match its exact command`);
    }
    const manifestPath = command.cwd === "." ? "Cargo.toml" : `${String(command.cwd)}/Cargo.toml`;
    if (!Array.isArray(raw.source_refs)
      || raw.source_refs.length !== 1
      || record(raw.source_refs[0])?.kind !== "cargo_manifest"
      || record(raw.source_refs[0])?.path !== manifestPath) {
      errors.push(`${label}: Cargo gate is not bound to its exact manifest`);
    }
  } else if (command?.adapter === "go") {
    if (raw.id !== fixedGateId("go", String(command.cwd)) || raw.basis !== "tracked_go_manifest") {
      errors.push(`${label}: Go gate id or basis does not match its exact command`);
    }
    const manifestPath = command.cwd === "." ? "go.mod" : `${String(command.cwd)}/go.mod`;
    if (!Array.isArray(raw.source_refs)
      || raw.source_refs.length !== 1
      || record(raw.source_refs[0])?.kind !== "go_manifest"
      || record(raw.source_refs[0])?.path !== manifestPath) {
      errors.push(`${label}: Go gate is not bound to its exact manifest`);
    }
  }
  const semantic = semanticGateContract(raw as unknown as Omit<NativeGateDefinition, "semantic_contract_sha256" | "definition_sha256">);
  if (raw.semantic_contract_sha256 !== identity(semantic)) errors.push(`${label}.semantic_contract_sha256 mismatch`);
  if (raw.definition_sha256 !== identity(withoutField(raw, "definition_sha256"))) {
    errors.push(`${label}.definition_sha256 mismatch`);
  }
  return errors.length === before;
}

export function validateDiscoveryIntegrity(discovery: NativeGateDiscovery): readonly string[] {
  const errors: string[] = [];
  const raw = validateExactKeys(discovery, [
    "record_type", "schema_version", "repository_object", "source_refs", "gates",
    "required_gate_ids", "catalog_sha256",
  ], "discovery", errors);
  if (!raw) return errors;
  if (raw.record_type !== DISCOVERY_RECORD_TYPE) errors.push("discovery.record_type is invalid");
  if (raw.schema_version !== SCHEMA_VERSION) errors.push("discovery.schema_version is invalid");
  validateRepositoryObjectSchema(raw.repository_object, "discovery.repository_object", errors);
  const validRefs: NativeGateSourceRef[] = [];
  if (!Array.isArray(raw.source_refs)) {
    errors.push("discovery.source_refs must be an array");
  } else {
    const seen = new Set<string>();
    raw.source_refs.forEach((ref, index) => {
      if (!validateSourceRef(ref, `discovery.source_refs[${String(index)}]`, errors)) return;
      if (seen.has(ref.path)) errors.push(`discovery.source_refs has duplicate path ${JSON.stringify(ref.path)}`);
      seen.add(ref.path);
      validRefs.push(ref);
    });
    const actualOrder = validRefs.map((ref) => ref.path);
    const canonicalOrder = [...actualOrder].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
    if (!stableEqual(actualOrder, canonicalOrder)) errors.push("discovery.source_refs is not in canonical path order");
  }
  const seen = new Set<string>();
  const validGates: NativeGateDefinition[] = [];
  if (!Array.isArray(raw.gates)) errors.push("discovery.gates must be an array");
  for (const [index, gate] of (Array.isArray(raw.gates) ? raw.gates : []).entries()) {
    if (!validateGateDefinition(gate, `discovery.gates[${String(index)}]`, validRefs, errors)) continue;
    validGates.push(gate);
    if (seen.has(gate.id)) errors.push(`discovery has duplicate gate ${JSON.stringify(gate.id)}`);
    seen.add(gate.id);
  }
  const expectedRequired = validGates
    .filter((gate) => gate.disposition === "required")
    .map((gate) => gate.id);
  if (!Array.isArray(raw.required_gate_ids)
    || raw.required_gate_ids.some((id) => typeof id !== "string")
    || !stableEqual(raw.required_gate_ids, expectedRequired)) {
    errors.push("discovery.required_gate_ids does not match required definitions");
  }
  if (raw.catalog_sha256 !== identity(withoutField(raw, "catalog_sha256"))) {
    errors.push("discovery.catalog_sha256 mismatch");
  }
  return errors;
}

/**
 * Discover only typed, repository-native gates. CI YAML is intentionally not
 * interpreted: package scripts are selected by fixed names, while Cargo and Go
 * use fixed argv adapters. The returned catalog is stable and content-bound to
 * the supplied exact repository object.
 */
export function discoverNativeGates(
  repository: string,
  repositoryObject: RepositoryObject,
): NativeGateDiscovery {
  const root = realpathSync(resolve(repository));
  const observed = captureRepositoryObject(root);
  if (!stableEqual(observed, repositoryObject)) {
    throw new Error("native gate discovery repository object does not match the supplied object");
  }
  const paths = trackedPaths(root);
  const runnerFindings = verificationRunnerSafetyFindings(root, paths);
  const runnerSourcePaths = [...new Set(runnerFindings.map((finding) => finding.path))].sort();
  const sourcePaths = paths.filter((path) => (
    basename(path) === "package.json"
    || basename(path) === "Cargo.toml"
    || basename(path) === "go.mod"
    || LOCKFILE_MANAGERS.has(basename(path))
  ));
  const refs = [
    ...sourcePaths.map((path) => sourceRef(root, path)),
    ...runnerSourcePaths.map((path) => sourceRef(root, path, "runner_source")),
  ].sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind));
  let gates = [
    ...discoverNodeGates(root, paths, refs),
    ...discoverFixedGates(paths, refs),
  ];
  if (gates.length === 0) {
    gates = [gateDefinition({
      id: "repository:native-quality",
      kind: "repository_tests",
      disposition: "not_applicable",
      basis: "no_supported_native_manifest",
      source_refs: [],
    })];
  }
  if (runnerFindings.length > 0) {
    gates.push(gateDefinition({
      id: "repository:runner-safety",
      kind: "repository_tests",
      disposition: "absent",
      basis: "nonpreemptible_timeout_wrapper",
      source_refs: refs.filter((ref) => ref.kind === "runner_source"),
      script_sha256: sha256(canonicalJson(runnerFindings)),
    }));
  }
  const record = {
    record_type: DISCOVERY_RECORD_TYPE,
    schema_version: SCHEMA_VERSION,
    repository_object: repositoryObject,
    source_refs: refs,
    gates,
    required_gate_ids: gates.filter((gate) => gate.disposition === "required").map((gate) => gate.id),
  } as const;
  return { ...record, catalog_sha256: identity(record) };
}
