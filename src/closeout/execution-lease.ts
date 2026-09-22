import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

type SqliteModule = typeof import("node:sqlite");
type DatabaseSync = import("node:sqlite").DatabaseSync;

let sqliteModule: SqliteModule | undefined;

/**
 * Load `node:sqlite` on first use only. Node 22 emits an ExperimentalWarning
 * on stderr when the module loads; a static load would attach that warning
 * to every standalone CLI invocation, including commands that never take an
 * execution lease, and break source/standalone output parity.
 */
function sqlite(): SqliteModule {
  sqliteModule ??= createRequire(import.meta.url)("node:sqlite") as SqliteModule;
  return sqliteModule;
}

export const REPOSITORY_VERIFICATION_RESOURCE = "repository-wide-verification" as const;
export const EXECUTION_LEASE_RECORD_TYPE = "mister-clean.execution-lease-receipt" as const;
export const EXECUTION_LEASE_SCHEMA_VERSION = "1.0" as const;
export const EXECUTION_CONTENTION_RECORD_TYPE = "mister-clean.execution-resource-contention" as const;
export const EXECUTION_CONTENTION_SCHEMA_VERSION = "1.0" as const;

export interface ExecutionResourceContentionReceipt {
  readonly record_type: typeof EXECUTION_CONTENTION_RECORD_TYPE;
  readonly schema_version: typeof EXECUTION_CONTENTION_SCHEMA_VERSION;
  readonly resource: typeof REPOSITORY_VERIFICATION_RESOURCE;
  readonly coordination_key_sha256: string;
  readonly state: "not_started";
  readonly classification: "resource_contention";
  readonly model_attribution: "excluded";
  readonly observed_at: string;
}

export interface ExecutionSupervisorBinding {
  readonly state_path: string;
  readonly supervisor_lock_path: string;
  readonly lease_id: string;
  readonly coordination_key_sha256: string;
  readonly owner_pid: number;
  readonly owner_process_identity: string;
}

export interface ExecutionLeaseReceipt {
  readonly record_type: typeof EXECUTION_LEASE_RECORD_TYPE;
  readonly schema_version: typeof EXECUTION_LEASE_SCHEMA_VERSION;
  readonly resource: typeof REPOSITORY_VERIFICATION_RESOURCE;
  readonly coordination_key_sha256: string;
  readonly lease_id: string;
  readonly mechanism: "sqlite_exclusive_transaction";
  readonly acquired_at: string;
  readonly released_at: string;
  readonly state: "released";
}

export interface HeldExecutionLease {
  readonly resource: typeof REPOSITORY_VERIFICATION_RESOURCE;
  readonly coordination_key_sha256: string;
  readonly lease_id: string;
  readonly acquired_at: string;
  readonly supervisor_binding: ExecutionSupervisorBinding;
  release(): ExecutionLeaseReceipt;
}

export class ExecutionResourceBusyError extends Error {
  readonly code = "MISTER_CLEAN_EXECUTION_RESOURCE_BUSY";
  readonly classification = "resource_contention";
  readonly model_attribution = "excluded";
  readonly contention_receipt: ExecutionResourceContentionReceipt;

  constructor(
    readonly resource: typeof REPOSITORY_VERIFICATION_RESOURCE,
    readonly coordination_key_sha256: string,
    observedAt: string,
  ) {
    super(
      `execution resource ${JSON.stringify(resource)} is already owned `
      + `(coordination_key_sha256=${coordination_key_sha256}); `
      + "do not start a duplicate, wait for the current owner to reach a terminal state",
    );
    this.name = "ExecutionResourceBusyError";
    this.contention_receipt = Object.freeze({
      record_type: EXECUTION_CONTENTION_RECORD_TYPE,
      schema_version: EXECUTION_CONTENTION_SCHEMA_VERSION,
      resource,
      coordination_key_sha256,
      state: "not_started",
      classification: "resource_contention",
      model_attribution: "excluded",
      observed_at: observedAt,
    });
  }
}

interface ProcessIdentity {
  readonly pid: number;
  readonly process_identity: string;
}

interface ExecutionLeaseState {
  readonly record_type: "mister-clean.execution-lease-state";
  readonly schema_version: "1.1";
  readonly resource: typeof REPOSITORY_VERIFICATION_RESOURCE;
  readonly coordination_key_sha256: string;
  readonly lease_id: string;
  readonly owner: ProcessIdentity;
  readonly acquired_at: string;
  readonly process_groups: readonly ProcessIdentity[];
  readonly custody_processes: readonly ProcessIdentity[];
  readonly custody_census: "clear" | "unverifiable";
}

interface ExecutionSupervisorLock {
  readonly record_type: "mister-clean.execution-supervisor-lock";
  readonly schema_version: "1.0";
  readonly coordination_key_sha256: string;
  readonly lease_id: string;
  readonly supervisor: ProcessIdentity;
  readonly custody_token: string;
}

const RECEIPT_KEYS = new Set([
  "record_type",
  "schema_version",
  "resource",
  "coordination_key_sha256",
  "lease_id",
  "mechanism",
  "acquired_at",
  "released_at",
  "state",
]);

export function validateExecutionLeaseReceipt(
  value: unknown,
  label: string,
  errors: string[],
): value is ExecutionLeaseReceipt {
  const before = errors.length;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label}: expected object`);
    return false;
  }
  const receipt = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(receipt);
  for (const key of keys) {
    if (typeof key !== "string" || !RECEIPT_KEYS.has(key)) errors.push(`${label}: unexpected key ${String(key)}`);
  }
  for (const key of RECEIPT_KEYS) {
    if (!Object.hasOwn(receipt, key)) errors.push(`${label}.${key}: required`);
  }
  if (receipt.record_type !== EXECUTION_LEASE_RECORD_TYPE) errors.push(`${label}.record_type: invalid`);
  if (receipt.schema_version !== EXECUTION_LEASE_SCHEMA_VERSION) errors.push(`${label}.schema_version: invalid`);
  if (receipt.resource !== REPOSITORY_VERIFICATION_RESOURCE) errors.push(`${label}.resource: invalid`);
  if (typeof receipt.coordination_key_sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(receipt.coordination_key_sha256)) {
    errors.push(`${label}.coordination_key_sha256: required lowercase SHA-256`);
  }
  if (typeof receipt.lease_id !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(receipt.lease_id)) {
    errors.push(`${label}.lease_id: required UUIDv4`);
  }
  if (receipt.mechanism !== "sqlite_exclusive_transaction") errors.push(`${label}.mechanism: invalid`);
  if (receipt.state !== "released") errors.push(`${label}.state: expected released`);
  const acquired = typeof receipt.acquired_at === "string" ? Date.parse(receipt.acquired_at) : Number.NaN;
  const released = typeof receipt.released_at === "string" ? Date.parse(receipt.released_at) : Number.NaN;
  if (!Number.isFinite(acquired) || new Date(acquired).toISOString() !== receipt.acquired_at) {
    errors.push(`${label}.acquired_at: required canonical ISO timestamp`);
  }
  if (!Number.isFinite(released) || new Date(released).toISOString() !== receipt.released_at) {
    errors.push(`${label}.released_at: required canonical ISO timestamp`);
  }
  if (Number.isFinite(acquired) && Number.isFinite(released) && released < acquired) {
    errors.push(`${label}: release precedes acquisition`);
  }
  return errors.length === before;
}

function canonicalTimestamp(value: Date, label: string): string {
  const milliseconds = value.getTime();
  if (!Number.isFinite(milliseconds)) throw new Error(`${label} returned an invalid date`);
  return value.toISOString();
}

export function gitCommonDirectory(repository: string): string {
  const root = realpathSync(resolve(repository));
  const output = execFileSync(
    "git",
    ["--no-optional-locks", "-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    {
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
  if (!output || !isAbsolute(output)) throw new Error("git did not return an absolute common directory");
  return realpathSync(output);
}

export function repositoryVerificationCoordinationKey(repository: string): string {
  return createHash("sha256")
    .update(JSON.stringify([
      "mister-clean.execution-resource.v1",
      gitCommonDirectory(repository),
      REPOSITORY_VERIFICATION_RESOURCE,
    ]))
    .digest("hex");
}

function ensurePrivateDirectory(path: string): string {
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "EEXIST") throw error;
  }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path) {
    throw new Error("execution lease root must be a real directory");
  }
  chmodSync(path, 0o700);
  return path;
}

function executionLeasePaths(repository: string, key: string): {
  readonly database: string;
  readonly state: string;
  readonly supervisorLock: string;
} {
  const common = gitCommonDirectory(repository);
  const productRoot = ensurePrivateDirectory(join(common, "mister-clean"));
  const root = ensurePrivateDirectory(join(productRoot, "execution-leases-v1"));
  const database = join(root, `${key}.sqlite`);
  try {
    const databaseStat = lstatSync(database);
    if (!databaseStat.isFile() || databaseStat.isSymbolicLink()) {
      throw new Error("execution lease database must be a regular non-symlink file");
    }
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "ENOENT") throw error;
  }
  return {
    database,
    state: join(root, `${key}.active.json`),
    supervisorLock: join(root, `${key}.supervisor.lock.json`),
  };
}

function sqliteBusy(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /\bdatabase is (?:busy|locked)\b/iu.test(error.message);
}

function processAlive(pid: number, group: boolean): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(group && process.platform !== "win32" ? -pid : pid, 0);
    return true;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    return code === "EPERM";
  }
}

function processIdentity(pid: number): string | undefined {
  if (!processAlive(pid, false)) return undefined;
  try {
    if (process.platform === "linux") {
      const stat = readFileSync(`/proc/${String(pid)}/stat`, "utf8");
      const close = stat.lastIndexOf(")");
      if (close < 0) return undefined;
      const fields = stat.slice(close + 2).trim().split(/\s+/u);
      const startTicks = fields[19];
      return startTicks ? `linux-proc-start:${startTicks}` : undefined;
    }
    if (process.platform === "win32") {
      const ticks = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `(Get-Process -Id ${String(pid)} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`,
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
      return ticks ? `windows-start-ticks:${ticks}` : undefined;
    }
    const started = execFileSync(
      "ps",
      ["-o", "lstart=", "-o", "comm=", "-p", String(pid)],
      {
        encoding: "utf8",
        env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    return started ? `ps-lstart:${started}` : undefined;
  } catch {
    return undefined;
  }
}

type IdentityStatus = "dead" | "same" | "reused" | "unverifiable";

function processIdentityStatus(identity: ProcessIdentity): IdentityStatus {
  if (!processAlive(identity.pid, false)) return "dead";
  if (identity.process_identity.startsWith("unverifiable:")) return "unverifiable";
  const observed = processIdentity(identity.pid);
  if (observed === undefined) return "unverifiable";
  return observed === identity.process_identity ? "same" : "reused";
}

function processGroupIdentityStatus(identity: ProcessIdentity): IdentityStatus {
  if (!processAlive(identity.pid, true)) return "dead";
  if (identity.process_identity.startsWith("unverifiable:")) return "unverifiable";
  if (!processAlive(identity.pid, false)) return "same";
  const observed = processIdentity(identity.pid);
  if (observed === undefined) return "unverifiable";
  return observed === identity.process_identity ? "same" : "unverifiable";
}

function recoveryBlocked(label: string, identity: ProcessIdentity): Error {
  const error = new Error(
    `execution lease recovery is blocked: ${label} PID ${String(identity.pid)} is alive but its process birth identity cannot be verified; `
    + "inspect that process and terminate it or establish the stale record before retrying",
  );
  error.name = "ExecutionLeaseRecoveryBlockedError";
  return error;
}

function parseProcessIdentity(value: unknown, label: string): ProcessIdentity {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is structurally invalid`);
  }
  const record = value as Partial<ProcessIdentity>;
  if (!Number.isSafeInteger(record.pid)
    || Number(record.pid) <= 0
    || typeof record.process_identity !== "string"
    || record.process_identity.length === 0) {
    throw new Error(`${label} is structurally invalid`);
  }
  return record as ProcessIdentity;
}

function parseLeaseState(path: string): ExecutionLeaseState {
  const value = JSON.parse(readFileSync(path, "utf8")) as Partial<ExecutionLeaseState>;
  if (value.record_type !== "mister-clean.execution-lease-state"
    || value.schema_version !== "1.1"
    || value.resource !== REPOSITORY_VERIFICATION_RESOURCE
    || typeof value.coordination_key_sha256 !== "string"
    || !/^[0-9a-f]{64}$/u.test(value.coordination_key_sha256)
    || typeof value.lease_id !== "string"
    || typeof value.acquired_at !== "string"
    || !Array.isArray(value.process_groups)
    || value.process_groups.length > 1
    || !Array.isArray(value.custody_processes)
    || (value.custody_census !== "clear" && value.custody_census !== "unverifiable")) {
    throw new Error("execution lease state is structurally invalid");
  }
  const owner = parseProcessIdentity(value.owner, "execution lease owner");
  const processGroups = value.process_groups.map((entry) => parseProcessIdentity(entry, "execution lease process group"));
  const custodyProcesses = value.custody_processes.map((entry) => parseProcessIdentity(entry, "execution lease custody process"));
  return { ...value, owner, process_groups: processGroups, custody_processes: custodyProcesses } as ExecutionLeaseState;
}

function parseSupervisorLock(path: string): ExecutionSupervisorLock {
  const value = JSON.parse(readFileSync(path, "utf8")) as Partial<ExecutionSupervisorLock>;
  if (value.record_type !== "mister-clean.execution-supervisor-lock"
    || value.schema_version !== "1.0"
    || typeof value.coordination_key_sha256 !== "string"
    || !/^[0-9a-f]{64}$/u.test(value.coordination_key_sha256)
    || typeof value.lease_id !== "string"
    || typeof value.custody_token !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value.custody_token)) {
    throw new Error("execution supervisor lock is structurally invalid");
  }
  return { ...value, supervisor: parseProcessIdentity(value.supervisor, "execution supervisor lock identity") } as ExecutionSupervisorLock;
}

function writeLeaseState(path: string, state: ExecutionLeaseState): void {
  const temporary = join(dirname(path), `.${state.lease_id}.${String(process.pid)}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    renameSync(temporary, path);
    chmodSync(path, 0o600);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function releaseDatabase(database: DatabaseSync): void {
  try {
    database.exec("ROLLBACK");
  } finally {
    database.close();
  }
}

function cleanupStaleStateTemps(root: string): void {
  for (const name of readdirSync(root)) {
    if (/^\.(?:[0-9a-f-]{36}\.[0-9]+|supervisor-[0-9]+-[0-9a-f-]{36})\.tmp$/u.test(name)) {
      rmSync(join(root, name), { force: true });
    }
  }
}

export function executionContentionJson(error: ExecutionResourceBusyError): string {
  return JSON.stringify(error.contention_receipt);
}

/**
 * Acquire one crash-safe, worktree-wide execution lease. SQLite serializes
 * live owners; durable process-group custody prevents a dead owner from
 * admitting a successor while one of its supervised commands still runs.
 */
export function acquireRepositoryVerificationLease(
  repository: string,
  now: () => Date = () => new Date(),
): HeldExecutionLease {
  const resource = REPOSITORY_VERIFICATION_RESOURCE;
  const key = repositoryVerificationCoordinationKey(repository);
  const paths = executionLeasePaths(repository, key);
  const leaseId = randomUUID();
  const ownerProcessIdentity = processIdentity(process.pid);
  if (ownerProcessIdentity === undefined) {
    throw new Error("cannot establish the execution lease owner's process birth identity");
  }
  const database = new (sqlite().DatabaseSync)(paths.database);
  try {
    database.exec([
      "PRAGMA busy_timeout = 0",
      "PRAGMA journal_mode = DELETE",
      "CREATE TABLE IF NOT EXISTS lease_sentinel (id INTEGER PRIMARY KEY CHECK (id = 1))",
      "BEGIN EXCLUSIVE",
    ].join("; "));
    chmodSync(paths.database, 0o600);
  } catch (error) {
    database.close();
    if (sqliteBusy(error)) {
      throw new ExecutionResourceBusyError(
        resource,
        key,
        canonicalTimestamp(now(), "execution contention clock"),
      );
    }
    throw error;
  }

  let acquiredAt: string;
  try {
    let previousLeaseId: string | undefined;
    if (existsSync(paths.state)) {
      const previous = parseLeaseState(paths.state);
      previousLeaseId = previous.lease_id;
      if (previous.coordination_key_sha256 !== key) {
        throw new Error("execution lease state coordination key does not match its path");
      }
      const ownerStatus = processIdentityStatus(previous.owner);
      if (ownerStatus === "unverifiable") throw recoveryBlocked("recorded owner", previous.owner);
      const groupStatuses = previous.process_groups.map((group) => processGroupIdentityStatus(group));
      const unverifiableGroup = previous.process_groups.find((_, index) => groupStatuses[index] === "unverifiable");
      if (unverifiableGroup !== undefined) throw recoveryBlocked("recorded process group", unverifiableGroup);
      const custodyStatuses = previous.custody_processes.map((entry) => processIdentityStatus(entry));
      const unverifiableCustody = previous.custody_processes.find((_, index) => custodyStatuses[index] === "unverifiable");
      if (unverifiableCustody !== undefined) throw recoveryBlocked("recorded escaped custody process", unverifiableCustody);
      if (previous.custody_census === "unverifiable") {
        throw new Error(
          "execution lease recovery is blocked: the previous supervisor could not establish escaped-process custody; "
          + "inspect repository-associated processes and explicitly clear the stale lease record before retrying",
        );
      }
      if (ownerStatus === "same" || groupStatuses.includes("same") || custodyStatuses.includes("same")) {
        releaseDatabase(database);
        throw new ExecutionResourceBusyError(
          resource,
          key,
          canonicalTimestamp(now(), "execution contention clock"),
        );
      }
    }
    if (existsSync(paths.supervisorLock)) {
      const lock = parseSupervisorLock(paths.supervisorLock);
      if (lock.coordination_key_sha256 !== key) {
        throw new Error("execution supervisor lock coordination key does not match its path");
      }
      if (previousLeaseId !== undefined && lock.lease_id !== previousLeaseId) {
        throw new Error("execution supervisor lock does not belong to the recorded lease");
      }
      const lockStatus = processGroupIdentityStatus(lock.supervisor);
      if (lockStatus === "unverifiable") throw recoveryBlocked("execution supervisor", lock.supervisor);
      if (lockStatus === "same") {
        releaseDatabase(database);
        throw new ExecutionResourceBusyError(
          resource,
          key,
          canonicalTimestamp(now(), "execution contention clock"),
        );
      }
      rmSync(paths.supervisorLock);
    }
    if (existsSync(paths.state)) rmSync(paths.state);
    cleanupStaleStateTemps(dirname(paths.state));
    acquiredAt = canonicalTimestamp(now(), "execution lease clock");
    writeLeaseState(paths.state, {
      record_type: "mister-clean.execution-lease-state",
      schema_version: "1.1",
      resource,
      coordination_key_sha256: key,
      lease_id: leaseId,
      owner: { pid: process.pid, process_identity: ownerProcessIdentity },
      acquired_at: acquiredAt,
      process_groups: [],
      custody_processes: [],
      custody_census: "clear",
    });
  } catch (error) {
    if (!(error instanceof ExecutionResourceBusyError)) releaseDatabase(database);
    throw error;
  }
  let released = false;
  return Object.freeze({
    resource,
    coordination_key_sha256: key,
    lease_id: leaseId,
    acquired_at: acquiredAt,
    supervisor_binding: Object.freeze({
      state_path: paths.state,
      supervisor_lock_path: paths.supervisorLock,
      lease_id: leaseId,
      coordination_key_sha256: key,
      owner_pid: process.pid,
      owner_process_identity: ownerProcessIdentity,
    }),
    release: (): ExecutionLeaseReceipt => {
      if (released) throw new Error(`execution lease ${leaseId} is already released`);
      const state = parseLeaseState(paths.state);
      if (state.lease_id !== leaseId || state.coordination_key_sha256 !== key) {
        throw new Error("execution lease state changed before release");
      }
      if (existsSync(paths.supervisorLock)) {
        const lock = parseSupervisorLock(paths.supervisorLock);
        if (lock.lease_id !== leaseId || lock.coordination_key_sha256 !== key) {
          throw new Error("execution supervisor lock changed before release");
        }
        const lockStatus = processGroupIdentityStatus(lock.supervisor);
        if (lockStatus === "unverifiable") throw recoveryBlocked("execution supervisor", lock.supervisor);
        if (lockStatus === "same") {
          throw new Error("execution lease cannot release while a supervised command owns custody");
        }
        rmSync(paths.supervisorLock);
      }
      const groupStatuses = state.process_groups.map((group) => processGroupIdentityStatus(group));
      const unverifiableGroup = state.process_groups.find((_, index) => groupStatuses[index] === "unverifiable");
      if (unverifiableGroup !== undefined) throw recoveryBlocked("recorded process group", unverifiableGroup);
      if (groupStatuses.includes("same")) {
        throw new Error("execution lease cannot release while a supervised process group is still alive");
      }
      const custodyStatuses = state.custody_processes.map((entry) => processIdentityStatus(entry));
      const unverifiableCustody = state.custody_processes.find((_, index) => custodyStatuses[index] === "unverifiable");
      if (unverifiableCustody !== undefined) throw recoveryBlocked("recorded escaped custody process", unverifiableCustody);
      if (custodyStatuses.includes("same")) {
        throw new Error("execution lease cannot release while an escaped custody process is still alive");
      }
      if (state.custody_census === "unverifiable") {
        throw new Error("execution lease cannot release after process-custody census became unverifiable");
      }
      rmSync(paths.state);
      released = true;
      let rollbackError: unknown;
      try {
        database.exec("ROLLBACK");
      } catch (error) {
        rollbackError = error;
      } finally {
        database.close();
      }
      if (rollbackError !== undefined) throw rollbackError;
      const releasedAt = canonicalTimestamp(now(), "execution lease clock");
      if (Date.parse(releasedAt) < Date.parse(acquiredAt)) {
        throw new Error("execution lease clock moved backward before release");
      }
      return Object.freeze({
        record_type: EXECUTION_LEASE_RECORD_TYPE,
        schema_version: EXECUTION_LEASE_SCHEMA_VERSION,
        resource,
        coordination_key_sha256: key,
        lease_id: leaseId,
        mechanism: "sqlite_exclusive_transaction",
        acquired_at: acquiredAt,
        released_at: releasedAt,
        state: "released",
      });
    },
  });
}
