/** Snapshot-isolated (not OS-sandboxed), sequential execution of one discovered native-gate catalog. */
import { randomUUID } from "node:crypto";
import { spawnSync, type ChildProcess } from "node:child_process";
import { accessSync, constants, existsSync, lstatSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { lstat, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { captureRepositoryObject, type RepositoryObject } from "./repository-object.js";
import {
  acquireRepositoryVerificationLease,
  repositoryVerificationCoordinationKey,
  type HeldExecutionLease,
} from "./execution-lease.js";
import { spawnSupervisedCommand } from "./execution-supervisor.js";
import {
  COVERAGE_RECORD_TYPE,
  COVERAGE_SCHEMA_VERSION,
  DEFAULT_OUTPUT_BYTES,
  DEFAULT_TERMINATION_GRACE_MS,
  DEFAULT_TIMEOUT_MS,
  assertPositiveInteger,
  captureSubjectState,
  createExecutionSnapshot,
  digestFile,
  errorMessage,
  identity,
  loadNativeGateBudgets,
  repositoryRelation,
  sha256,
  stableEqual,
  validateDiscoveryIntegrity,
  validatePortablePath,
  type NativeGateBudgetEvidence,
  type NativeGateCommand,
  type NativeGateCoverage,
  type NativeGateDefinition,
  type NativeGateDiscovery,
  type NativeGateExecution,
  type NativeGateExecutionState,
  type NativeGateExecutionSnapshot,
  type NativeGateFailureReason,
  type NativeGateOutputRef,
  type NativeGateSubjectState,
  type RunNativeGateOptions,
} from "./native-gates.js";

export interface ChildResult {
  readonly exit_code: number | null;
  readonly signal: string | null;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly stdout_complete: boolean;
  readonly stderr_complete: boolean;
  readonly termination: "timeout" | "output_limit_exceeded" | "spawn_error" | "process_cleanup_failed" | null;
}

/** The PATH entry as found, and the file it resolves to. */
export interface ResolvedExecutable {
  readonly invoked: string;
  readonly resolved: string;
}

export function safeIntegerOption(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  assertPositiveInteger(name, resolved, 24 * 60 * 60 * 1_000);
  return resolved;
}

export function evidenceOutputName(gateId: string, stream: "stdout" | "stderr"): string {
  const readable = gateId.replaceAll(/[^a-zA-Z0-9._-]/gu, "-").slice(0, 80) || "gate";
  return `${readable}.${randomUUID()}.${stream}.bin`;
}

export async function writeOutput(
  evidenceRoot: string,
  gateId: string,
  stream: "stdout" | "stderr",
  bytes: Buffer,
  complete: boolean,
): Promise<NativeGateOutputRef> {
  const path = evidenceOutputName(gateId, stream);
  await writeFile(join(evidenceRoot, path), bytes, { flag: "wx", mode: 0o600 });
  return { path, sha256: sha256(bytes), byte_count: bytes.length, complete };
}

export function executableCandidates(name: string, pathValue: string): readonly string[] {
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
    : [""];
  const candidates: string[] = [];
  for (const directory of pathValue.split(delimiter)) {
    if (!directory || !isAbsolute(directory)) continue;
    for (const extension of extensions) candidates.push(join(directory, `${name}${extension}`));
  }
  return candidates;
}

export function resolveExecutable(name: string, pathValue: string): ResolvedExecutable | undefined {
  if (!/^[a-zA-Z0-9._+-]+$/u.test(name)) return undefined;
  for (const candidate of executableCandidates(name, pathValue)) {
    try {
      const stat = lstatSync(candidate);
      if (!stat.isFile() && !stat.isSymbolicLink()) continue;
      accessSync(candidate, constants.X_OK);
      return { invoked: candidate, resolved: realpathSync(candidate) };
    } catch {
      // Continue through PATH without accepting an unresolved or non-executable candidate.
    }
  }
  return undefined;
}

/**
 * Multi-call proxies choose their behaviour from the name they were invoked as
 * (rustup's `cargo` symlink), so the child must be started through `invoked`.
 * The command must still be the file the evidence digested, so the pair has to
 * still agree immediately before the spawn.
 */
export function executableUnchanged(executable: ResolvedExecutable): boolean {
  try {
    return realpathSync(executable.invoked) === executable.resolved;
  } catch {
    return false;
  }
}

/**
 * Toolchain and dependency-cache locators the scrubbed gate environment must
 * keep. HOME is replaced by an empty snapshot home, so without them rustup
 * cannot find an installed toolchain and cargo/go cannot reach the dependency
 * caches that offline builds (CARGO_NET_OFFLINE, GOPROXY=off) depend on. Each
 * takes the operator's value when set, otherwise the conventional directory
 * under the operator's real home only when it exists; nothing is invented.
 */
const TOOLCHAIN_LOCATORS = [
  ["RUSTUP_HOME", ".rustup"],
  ["CARGO_HOME", ".cargo"],
  ["GOPATH", "go"],
  ["GOMODCACHE", join("go", "pkg", "mod")],
] as const;

export function toolchainLocators(
  environment: NodeJS.ProcessEnv = process.env,
  operatorHome: string = environment.HOME ?? homedir(),
): Partial<Record<(typeof TOOLCHAIN_LOCATORS)[number][0], string>> {
  const locators: Partial<Record<(typeof TOOLCHAIN_LOCATORS)[number][0], string>> = {};
  for (const [name, conventional] of TOOLCHAIN_LOCATORS) {
    const explicit = environment[name];
    if (explicit !== undefined && explicit !== "") {
      locators[name] = explicit;
      continue;
    }
    const candidate = join(operatorHome, conventional);
    if (existsSync(candidate)) locators[name] = candidate;
  }
  return locators;
}

/**
 * The toolchain a gate may reach by name. Each is resolved once, against the
 * operator's PATH at the first gate of this process; the gate PATH holds only
 * their directories, so a credential CLI elsewhere on the operator's PATH
 * (doppler, op, gh, aws, gcloud) is not reachable by name. A credential CLI
 * installed beside a toolchain executable stays reachable; that needs an OS
 * sandbox. `cc` is the C and Rust linker; its directory also carries the POSIX
 * utilities (basename, env, sed) that build scripts expect.
 */
export const GATE_TOOLCHAIN = ["node", "bun", "pnpm", "npm", "cargo", "rustc", "rustup", "go", "git", "sh", "cc"] as const;

let resolvedGateToolchain: readonly ResolvedExecutable[] | undefined;

/** The minimal gate PATH: toolchain directories (plus the gate executable's), in operator-PATH order. */
export function minimalGatePath(
  pathValue: string,
  toolchain: readonly ResolvedExecutable[],
  gateExecutable?: ResolvedExecutable,
): string {
  const wanted = new Set([...toolchain, ...(gateExecutable ? [gateExecutable] : [])].map((executable) => dirname(executable.invoked)));
  const ordered = pathValue.split(delimiter).filter((directory) => wanted.has(directory));
  return [...new Set([...ordered, ...wanted])].join(delimiter);
}

function gateToolchain(): readonly ResolvedExecutable[] {
  resolvedGateToolchain ??= GATE_TOOLCHAIN.flatMap((name) => {
    const executable = resolveExecutable(name, process.env.PATH ?? "");
    return executable ? [executable] : [];
  });
  return resolvedGateToolchain;
}

/** Where a gate's CARGO_HOME lives inside its disposable home. */
export function scrubbedCargoHome(home: string): string {
  return join(home, "cargo-home");
}

/**
 * Give the gate a CARGO_HOME that keeps the operator's registry and git caches
 * readable (symlinked) and holds nothing else: no credentials, credentials.toml,
 * config or installed binaries.
 */
export function materializeScrubbedCargoHome(home: string, operatorCargoHome = toolchainLocators().CARGO_HOME): void {
  if (operatorCargoHome === undefined) return;
  const target = scrubbedCargoHome(home);
  mkdirSync(target, { recursive: true, mode: 0o700 });
  for (const cache of ["registry", "git"]) {
    const source = join(operatorCargoHome, cache);
    if (existsSync(source) && !existsSync(join(target, cache))) symlinkSync(source, join(target, cache), "dir");
  }
}

export function scrubbedEnvironment(home: string, gateExecutable?: ResolvedExecutable): NodeJS.ProcessEnv {
  const locators = toolchainLocators();
  const env: NodeJS.ProcessEnv = {
    PATH: minimalGatePath(process.env.PATH ?? "", gateToolchain(), gateExecutable),
    HOME: home,
    USERPROFILE: home,
    TMPDIR: home,
    TEMP: home,
    TMP: home,
    CI: "1",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    NPM_CONFIG_OFFLINE: "true",
    YARN_ENABLE_NETWORK: "0",
    BUN_INSTALL_CACHE_DIR: join(home, "bun-cache"),
    CARGO_NET_OFFLINE: "true",
    GOPROXY: "off",
    ...locators,
    ...(locators.CARGO_HOME === undefined ? {} : { CARGO_HOME: scrubbedCargoHome(home) }),
  };
  for (const name of ["LANG", "LC_ALL", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT"] as const) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return env;
}

/** The environment one gate runs in: scrubbed, minimal PATH, credential-free CARGO_HOME. */
function gateEnvironment(home: string, executable: ResolvedExecutable): NodeJS.ProcessEnv {
  materializeScrubbedCargoHome(home);
  return scrubbedEnvironment(home, executable);
}

export function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): boolean {
  if (!child.pid) return true;
  try {
    if (process.platform === "win32") {
      const result = spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        encoding: null,
        env: scrubbedEnvironment(tmpdir()),
        stdio: ["ignore", "ignore", "ignore"],
        windowsHide: true,
      });
      return !result.error && result.status === 0;
    } else {
      process.kill(-child.pid, signal);
      return true;
    }
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    return code === "ESRCH";
  }
}

export async function executeChild(
  executable: string,
  argv: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  maxOutputBytes: number,
  graceMs: number,
  lease: HeldExecutionLease,
): Promise<ChildResult> {
  return await new Promise<ChildResult>((resolveResult) => {
    const child = spawnSupervisedCommand(
      lease.supervisor_binding,
      executable,
      argv,
      cwd,
      env,
      graceMs,
    );
    let exitCode: number | null = null;
    let signal: string | null = null;
    let termination: ChildResult["termination"] = null;
    let spawnError: string | null = null;
    let closeSeen = false;
    let escalationDone = false;
    let resolved = false;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutComplete = true;
    let stderrComplete = true;
    let escalationTimer: NodeJS.Timeout | undefined;
    let fallbackTimer: NodeJS.Timeout | undefined;

    const finish = (): void => {
      if (resolved || !closeSeen || (termination !== null && termination !== "spawn_error" && !escalationDone)) return;
      resolved = true;
      clearTimeout(timeoutTimer);
      if (escalationTimer) clearTimeout(escalationTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      const errorBytes = spawnError ? Buffer.from(`${spawnError}\n`, "utf8") : Buffer.alloc(0);
      resolveResult({
        exit_code: exitCode,
        signal,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(errorBytes.length > 0 ? [...stderr, errorBytes] : stderr),
        stdout_complete: stdoutComplete,
        stderr_complete: stderrComplete,
        termination,
      });
    };

    const terminate = (reason: "timeout" | "output_limit_exceeded"): void => {
      if (termination !== null) return;
      termination = reason;
      if (!signalProcessTree(child, "SIGTERM")) termination = "process_cleanup_failed";
      escalationTimer = setTimeout(() => {
        if (!signalProcessTree(child, "SIGKILL")) termination = "process_cleanup_failed";
        escalationDone = true;
        finish();
      }, graceMs);
      fallbackTimer = setTimeout(() => {
        escalationDone = true;
        closeSeen = true;
        finish();
      }, graceMs + 2_000);
    };

    const append = (stream: "stdout" | "stderr", chunk: Buffer): void => {
      const used = stream === "stdout" ? stdoutBytes : stderrBytes;
      const remaining = Math.max(0, maxOutputBytes - used);
      const kept = chunk.subarray(0, remaining);
      if (stream === "stdout") {
        if (kept.length > 0) stdout.push(kept);
        stdoutBytes += kept.length;
        if (kept.length !== chunk.length) stdoutComplete = false;
      } else {
        if (kept.length > 0) stderr.push(kept);
        stderrBytes += kept.length;
        if (kept.length !== chunk.length) stderrComplete = false;
      }
      if (kept.length !== chunk.length) terminate("output_limit_exceeded");
    };

    child.stdout?.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => append("stderr", chunk));
    child.once("error", (error) => {
      spawnError = errorMessage(error);
      termination = "spawn_error";
    });
    child.once("close", (code, closeSignal) => {
      exitCode = code;
      signal = closeSignal;
      closeSeen = true;
      finish();
    });
    const timeoutTimer = setTimeout(() => terminate("timeout"), timeoutMs);
  });
}

export function resolveGateCwd(repository: string, cwd: string): string {
  if (cwd !== ".") validatePortablePath(cwd, "native gate cwd");
  const target = realpathSync(resolve(repository, cwd));
  repositoryRelation(repository, target);
  const stat = lstatSync(target);
  if (!stat.isDirectory()) throw new Error(`native gate cwd is not a directory: ${cwd}`);
  return target;
}

export async function blockedExecution(
  gate: NativeGateDefinition & { readonly command: NativeGateCommand },
  reason: NativeGateFailureReason,
  object: RepositoryObject,
  evidenceRoot: string,
  now: () => Date,
  subjectStartState: NativeGateSubjectState,
  subjectEndState: NativeGateSubjectState = subjectStartState,
  resolvedExecutable: string | null = null,
  executableSha256: string | null = null,
  state: "blocked" | "skipped" = "blocked",
  diagnostic = "",
  invokedExecutable: string | null = null,
): Promise<NativeGateExecution> {
  // A subject that changed while the gate was being prepared outranks every
  // other reason: the evidence must say so, or its own start/end states
  // contradict it. The reason that was about to be recorded stays in stderr.
  const subjectChanged = !stableEqual(subjectStartState, subjectEndState);
  const recordedReason: NativeGateFailureReason = subjectChanged ? "subject_repository_changed" : reason;
  const recordedState = subjectChanged ? "blocked" : state;
  const recordedDiagnostic = subjectChanged && reason !== "subject_repository_changed"
    ? `subject repository changed while the gate was being prepared; superseded reason: ${reason}\n${diagnostic}`
    : diagnostic;
  const started = now().toISOString();
  const stdoutRef = await writeOutput(evidenceRoot, gate.id, "stdout", Buffer.alloc(0), true);
  const stderrRef = await writeOutput(evidenceRoot, gate.id, "stderr", Buffer.from(recordedDiagnostic, "utf8"), true);
  return {
    gate_id: gate.id,
    kind: gate.kind,
    isolation: "disposable_exact_object_snapshot",
    state: recordedState,
    failure_reason: recordedReason,
    command: gate.command,
    command_sha256: identity(gate.command),
    resolved_executable: resolvedExecutable,
    invoked_executable: invokedExecutable,
    executable_sha256: executableSha256,
    started_at: started,
    finished_at: now().toISOString(),
    start_repository_object: object,
    end_repository_object: object,
    subject_start_state: subjectStartState,
    subject_end_state: subjectEndState,
    exit_code: null,
    signal: null,
    stdout_ref: stdoutRef,
    stderr_ref: stderrRef,
  };
}

/**
 * Execute one gate under its budget. `budget.timeout_ms` is the deadline the
 * gate actually ran under; the evidence carries the whole budget record so a
 * reader can see whether the repository declared it and what default it
 * replaced.
 */
export async function executeGate(
  repository: string,
  gate: NativeGateDefinition & { readonly command: NativeGateCommand },
  discoveryObject: RepositoryObject,
  evidenceRoot: string,
  options: Required<Pick<RunNativeGateOptions, "max_output_bytes" | "termination_grace_ms">>,
  budget: NativeGateBudgetEvidence,
  skip: ReadonlySet<string>,
  now: () => Date,
  lease: HeldExecutionLease,
): Promise<NativeGateExecution> {
  const execution = await executeGateUnderDeadline(
    repository, gate, discoveryObject, evidenceRoot,
    { ...options, timeout_ms: budget.timeout_ms }, skip, now, lease,
  );
  return { ...execution, budget };
}

async function executeGateUnderDeadline(
  repository: string,
  gate: NativeGateDefinition & { readonly command: NativeGateCommand },
  discoveryObject: RepositoryObject,
  evidenceRoot: string,
  options: Required<Pick<RunNativeGateOptions, "timeout_ms" | "max_output_bytes" | "termination_grace_ms">>,
  skip: ReadonlySet<string>,
  now: () => Date,
  lease: HeldExecutionLease,
): Promise<NativeGateExecution> {
  const subjectStartState = captureSubjectState(repository);
  const startObject = subjectStartState.repository_object;
  if (!stableEqual(startObject, discoveryObject)) {
    return await blockedExecution(
      gate,
      "repository_object_mismatch",
      startObject,
      evidenceRoot,
      now,
      subjectStartState,
      captureSubjectState(repository),
    );
  }
  if (skip.has(gate.id)) {
    return await blockedExecution(
      gate,
      "operator_skip",
      startObject,
      evidenceRoot,
      now,
      subjectStartState,
      captureSubjectState(repository),
      null,
      null,
      "skipped",
    );
  }

  try {
    resolveGateCwd(repository, gate.command.cwd);
  } catch {
    return await blockedExecution(
      gate,
      "invalid_cwd",
      startObject,
      evidenceRoot,
      now,
      subjectStartState,
      captureSubjectState(repository),
    );
  }
  const executable = resolveExecutable(gate.command.executable, process.env.PATH ?? "");
  if (!executable) {
    return await blockedExecution(
      gate,
      "executable_unavailable",
      startObject,
      evidenceRoot,
      now,
      subjectStartState,
      captureSubjectState(repository),
    );
  }
  const { invoked: invokedExecutable, resolved: resolvedExecutable } = executable;
  let executableSha256: string;
  try {
    executableSha256 = await digestFile(resolvedExecutable);
  } catch {
    return await blockedExecution(
      gate,
      "executable_unreadable",
      startObject,
      evidenceRoot,
      now,
      subjectStartState,
      captureSubjectState(repository),
      resolvedExecutable,
      null,
      "blocked",
      "",
      invokedExecutable,
    );
  }

  let snapshot: NativeGateExecutionSnapshot;
  try {
    snapshot = await createExecutionSnapshot(repository, discoveryObject);
  } catch (error) {
    const subjectEndState = captureSubjectState(repository);
    return await blockedExecution(
      gate,
      "snapshot_unavailable",
      startObject,
      evidenceRoot,
      now,
      subjectStartState,
      subjectEndState,
      resolvedExecutable,
      executableSha256,
      "blocked",
      `${errorMessage(error)}\n`,
      invokedExecutable,
    );
  }
  const subjectBeforeChild = captureSubjectState(repository);
  if (!stableEqual(subjectBeforeChild, subjectStartState)) {
    await rm(snapshot.container, { recursive: true, force: true });
    return await blockedExecution(
      gate,
      "subject_repository_changed",
      startObject,
      evidenceRoot,
      now,
      subjectStartState,
      subjectBeforeChild,
      resolvedExecutable,
      executableSha256,
      "blocked",
      "",
      invokedExecutable,
    );
  }
  const cwd = resolveGateCwd(snapshot.repository, gate.command.cwd);
  const startedAt = now().toISOString();
  if (!executableUnchanged(executable)) {
    await rm(snapshot.container, { recursive: true, force: true });
    return await blockedExecution(
      gate,
      "executable_changed",
      startObject,
      evidenceRoot,
      now,
      subjectStartState,
      captureSubjectState(repository),
      resolvedExecutable,
      executableSha256,
      "blocked",
      "",
      invokedExecutable,
    );
  }
  let child: ChildResult;
  let endObject: RepositoryObject;
  try {
    child = await executeChild(
      invokedExecutable,
      gate.command.argv,
      cwd,
      gateEnvironment(snapshot.home, executable),
      options.timeout_ms,
      options.max_output_bytes,
      options.termination_grace_ms,
      lease,
    );
    endObject = captureRepositoryObject(snapshot.repository);
  } finally {
    await rm(snapshot.container, { recursive: true, force: true });
  }
  const finishedAt = now().toISOString();
  const subjectEndState = captureSubjectState(repository);
  const stdoutRef = await writeOutput(
    evidenceRoot,
    gate.id,
    "stdout",
    child.stdout,
    child.stdout_complete,
  );
  const stderrRef = await writeOutput(
    evidenceRoot,
    gate.id,
    "stderr",
    child.stderr,
    child.stderr_complete,
  );

  let state: NativeGateExecutionState;
  let failureReason: NativeGateFailureReason | null;
  if (!stableEqual(subjectEndState, subjectStartState)) {
    state = "blocked";
    failureReason = "subject_repository_changed";
  } else if (!stableEqual(endObject, snapshot.repository_object)) {
    state = "failed";
    failureReason = "repository_mutated";
  } else if (child.termination === "timeout") {
    state = "timed_out";
    failureReason = "timeout";
  } else if (child.termination === "output_limit_exceeded") {
    state = "failed";
    failureReason = "output_limit_exceeded";
  } else if (child.termination === "spawn_error") {
    state = "blocked";
    failureReason = "spawn_error";
  } else if (child.termination === "process_cleanup_failed") {
    state = "blocked";
    failureReason = "process_cleanup_failed";
  } else if (child.exit_code === 0 && child.signal === null) {
    state = "passed";
    failureReason = null;
  } else {
    state = "failed";
    failureReason = child.signal === null ? "nonzero_exit" : "terminated_by_signal";
  }
  return {
    gate_id: gate.id,
    kind: gate.kind,
    isolation: "disposable_exact_object_snapshot",
    state,
    failure_reason: failureReason,
    command: gate.command,
    command_sha256: identity(gate.command),
    resolved_executable: resolvedExecutable,
    invoked_executable: invokedExecutable,
    executable_sha256: executableSha256,
    started_at: startedAt,
    finished_at: finishedAt,
    start_repository_object: snapshot.repository_object,
    end_repository_object: endObject,
    subject_start_state: subjectStartState,
    subject_end_state: subjectEndState,
    exit_code: child.exit_code,
    signal: child.signal,
    stdout_ref: stdoutRef,
    stderr_ref: stderrRef,
  };
}

export async function runNativeGates(
  repository: string,
  discovery: NativeGateDiscovery,
  evidenceDirectory: string,
  runOptions: RunNativeGateOptions = {},
): Promise<NativeGateCoverage> {
  const root = realpathSync(resolve(repository));
  const now = runOptions.now ?? (() => new Date());
  const lease = runOptions.execution_lease ?? acquireRepositoryVerificationLease(root, now);
  let failure: unknown;
  let partial: Omit<NativeGateCoverage, "execution_lease" | "coverage_sha256"> | undefined;
  try {
    const integrityErrors = validateDiscoveryIntegrity(discovery);
    if (integrityErrors.length > 0) throw new Error(integrityErrors.join("; "));
    const expectedCoordinationKey = repositoryVerificationCoordinationKey(root);
    if (discovery.execution_coordination_key_sha256 !== expectedCoordinationKey) {
      throw new Error("native gate discovery is not bound to this repository execution coordination key");
    }
    if (lease.coordination_key_sha256 !== expectedCoordinationKey) {
      throw new Error("native gate execution lease is not bound to this repository");
    }
    const observed = captureRepositoryObject(root);
    if (!stableEqual(observed, discovery.repository_object)) {
      throw new Error("native gate run does not start at its bound discovery repository object");
    }

    const timeoutMs = safeIntegerOption(runOptions.timeout_ms, DEFAULT_TIMEOUT_MS, "timeout_ms");
    const maxOutputBytes = safeIntegerOption(runOptions.max_output_bytes, DEFAULT_OUTPUT_BYTES, "max_output_bytes");
    const terminationGraceMs = safeIntegerOption(
      runOptions.termination_grace_ms,
      DEFAULT_TERMINATION_GRACE_MS,
      "termination_grace_ms",
    );
    const skip = new Set(runOptions.skip_gate_ids ?? []);
    for (const id of skip) {
      if (!discovery.required_gate_ids.includes(id)) {
        throw new Error(`cannot skip unknown or non-required gate ${JSON.stringify(id)}`);
      }
    }
    // Repository-declared budgets are read once, before any gate runs; an
    // invalid file is a typed refusal of the whole run, never a silent clamp.
    const budgets = loadNativeGateBudgets(root, new Set(discovery.gates.map((gate) => gate.id)));
    const budgetFor = (gateId: string): NativeGateBudgetEvidence => {
      const declared = budgets?.gates.get(gateId);
      return declared
        ? {
          source: "repository",
          timeout_ms: declared.timeout_ms,
          path: budgets!.path,
          sha256: budgets!.sha256,
          reason: declared.reason,
          default_timeout_ms: timeoutMs,
        }
        : { source: "default", timeout_ms: timeoutMs };
    };

    await mkdir(evidenceDirectory, { recursive: true, mode: 0o700 });
    const evidenceRoot = await realpath(resolve(evidenceDirectory));
    const relation = relative(root, evidenceRoot);
    if (relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation))) {
      throw new Error("native gate evidence directory must be outside the repository surface");
    }
    const evidenceStat = await lstat(evidenceRoot);
    if (!evidenceStat.isDirectory() || evidenceStat.isSymbolicLink()) {
      throw new Error("native gate evidence root must be a real directory");
    }

    const executions: NativeGateExecution[] = [];
    for (const gate of discovery.gates) {
      if (gate.disposition !== "required" || !gate.command) continue;
      executions.push(await executeGate(
        root,
        gate as NativeGateDefinition & { readonly command: NativeGateCommand },
        discovery.repository_object,
        evidenceRoot,
        { max_output_bytes: maxOutputBytes, termination_grace_ms: terminationGraceMs },
        budgetFor(gate.id),
        skip,
        now,
        lease,
      ));
    }
    partial = {
      record_type: COVERAGE_RECORD_TYPE,
      schema_version: COVERAGE_SCHEMA_VERSION,
      discovery_sha256: discovery.catalog_sha256,
      closing_repository_object: captureRepositoryObject(root),
      required_gate_ids: discovery.required_gate_ids,
      executions,
    };
  } catch (error) {
    failure = error;
  }

  let executionLease;
  try {
    executionLease = lease.release();
  } catch (releaseError) {
    if (failure !== undefined) {
      throw new AggregateError([failure, releaseError], "native gate execution and execution-lease release both failed");
    }
    throw releaseError;
  }
  if (failure !== undefined) throw failure;
  if (!partial) throw new Error("native gate execution ended without coverage");
  const record = { ...partial, execution_lease: executionLease };
  return { ...record, coverage_sha256: identity(record) };
}
