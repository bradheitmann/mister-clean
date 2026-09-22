import {
  spawn,
  type ChildProcess,
} from "node:child_process";
import { randomUUID } from "node:crypto";

import type { ExecutionSupervisorBinding } from "./execution-lease.js";

const SPEC_ENV = "MISTER_CLEAN_EXECUTION_SUPERVISOR_V1";
const CUSTODY_ENV = "MISTER_CLEAN_EXECUTION_CUSTODY_V1";

// The wrapper registers its own detached process group in the durable lease
// state before it starts the requested command. If the caller dies before
// registration, a replacement lease changes the lease id and the wrapper
// refuses to start. If the caller dies afterward, the registered group keeps
// successor verification blocked until the wrapper has terminated its tree.
const SUPERVISOR_SOURCE = String.raw`
const { execFileSync, spawn } = require("node:child_process");
const { chmodSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");

const encoded = process.env.MISTER_CLEAN_EXECUTION_SUPERVISOR_V1;
delete process.env.MISTER_CLEAN_EXECUTION_SUPERVISOR_V1;
delete process.env.MISTER_CLEAN_EXECUTION_CUSTODY_V1;
if (!encoded) throw new Error("missing execution-supervisor specification");
const spec = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));

function fail(message, code = 126) {
  process.stderr.write("mister-clean execution supervisor: " + message + "\n");
  process.exit(code);
}

function readState() {
  const value = JSON.parse(readFileSync(spec.binding.state_path, "utf8"));
  if (value.record_type !== "mister-clean.execution-lease-state"
    || value.schema_version !== "1.1"
    || value.lease_id !== spec.binding.lease_id
    || value.coordination_key_sha256 !== spec.binding.coordination_key_sha256
    || !value.owner
    || value.owner.pid !== spec.binding.owner_pid
    || value.owner.process_identity !== spec.binding.owner_process_identity
    || !Array.isArray(value.process_groups)
    || !Array.isArray(value.custody_processes)
    || (value.custody_census !== "clear" && value.custody_census !== "unverifiable")) {
    throw new Error("lease state no longer authorizes this supervisor");
  }
  return value;
}

function writeState(value) {
  const temporary = join(dirname(spec.binding.state_path), ".supervisor-" + String(process.pid) + "-" + spec.custody_token + ".tmp");
  writeFileSync(temporary, JSON.stringify(value) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    renameSync(temporary, spec.binding.state_path);
    chmodSync(spec.binding.state_path, 0o600);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function processAlive(pid, group = false) {
  try { process.kill(group && process.platform !== "win32" ? -pid : pid, 0); return true; }
  catch (error) { return Boolean(error && error.code === "EPERM"); }
}

function processIdentity(pid) {
  if (!processAlive(pid)) return undefined;
  try {
    if (process.platform === "linux") {
      const stat = readFileSync("/proc/" + String(pid) + "/stat", "utf8");
      const close = stat.lastIndexOf(")");
      if (close < 0) return undefined;
      const fields = stat.slice(close + 2).trim().split(/\s+/);
      return fields[19] ? "linux-proc-start:" + fields[19] : undefined;
    }
    const started = execFileSync("ps", ["-o", "lstart=", "-o", "comm=", "-p", String(pid)], {
      encoding: "utf8", env: { ...process.env, LC_ALL: "C", TZ: "UTC" }, stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return started ? "ps-lstart:" + started : undefined;
  } catch {
    return undefined;
  }
}

const supervisorIdentity = {
  pid: process.pid,
  process_identity: processIdentity(process.pid),
};
if (!supervisorIdentity.process_identity) fail("cannot establish supervisor process birth identity");

let lockHeld = false;
let registered = false;

function readLock() {
  const value = JSON.parse(readFileSync(spec.binding.supervisor_lock_path, "utf8"));
  if (value.record_type !== "mister-clean.execution-supervisor-lock"
    || value.schema_version !== "1.0"
    || value.lease_id !== spec.binding.lease_id
    || value.coordination_key_sha256 !== spec.binding.coordination_key_sha256
    || value.custody_token !== spec.custody_token
    || !value.supervisor
    || value.supervisor.pid !== supervisorIdentity.pid
    || value.supervisor.process_identity !== supervisorIdentity.process_identity) {
    throw new Error("execution supervisor lock no longer belongs to this supervisor");
  }
  return value;
}

function register() {
  const lock = {
    record_type: "mister-clean.execution-supervisor-lock",
    schema_version: "1.0",
    coordination_key_sha256: spec.binding.coordination_key_sha256,
    lease_id: spec.binding.lease_id,
    supervisor: supervisorIdentity,
    custody_token: spec.custody_token,
  };
  writeFileSync(spec.binding.supervisor_lock_path, JSON.stringify(lock) + "\n", {
    encoding: "utf8", flag: "wx", mode: 0o600,
  });
  chmodSync(spec.binding.supervisor_lock_path, 0o600);
  lockHeld = true;
  const state = readState();
  const observedParentIdentity = processIdentity(spec.parent_pid);
  if (observedParentIdentity !== spec.binding.owner_process_identity) {
    throw new Error("execution lease owner is no longer the process that dispatched this supervisor"
      + " (expected " + spec.binding.owner_process_identity + ", observed " + String(observedParentIdentity) + ")");
  }
  if (state.process_groups.length !== 0 || state.custody_processes.length !== 0 || state.custody_census !== "clear") {
    throw new Error("another supervised command already owns execution custody");
  }
  writeState({ ...state, process_groups: [supervisorIdentity] });
  registered = true;
}

function releaseOwnLock() {
  readLock();
  rmSync(spec.binding.supervisor_lock_path);
  lockHeld = false;
}

function clearCustodyProcesses() {
  const state = readState();
  writeState({ ...state, custody_processes: [], custody_census: "clear" });
}

function markCustodyUnverifiable() {
  const state = readState();
  writeState({ ...state, custody_census: "unverifiable" });
}

function unregister() {
  try {
    const state = readState();
    if (state.custody_processes.length !== 0) throw new Error("escaped custody processes remain recorded");
    writeState({
      ...state,
      process_groups: state.process_groups.filter((entry) => !(
        entry.pid === supervisorIdentity.pid
        && entry.process_identity === supervisorIdentity.process_identity
      )),
    });
    registered = false;
    releaseOwnLock();
    return true;
  } catch (error) {
    process.stderr.write("mister-clean execution supervisor: failed to clear process custody: "
      + (error instanceof Error ? error.message : String(error)) + "\n");
    return false;
  }
}

function custodyProcessIds() {
  const marker = "MISTER_CLEAN_EXECUTION_CUSTODY_V1=" + spec.custody_token;
  if (process.platform === "win32") return undefined;
  if (process.platform === "linux") {
    const ids = [];
    for (const name of readdirSync("/proc")) {
      if (!/^\d+$/.test(name)) continue;
      try {
        const environment = readFileSync("/proc/" + name + "/environ");
        if (environment.toString("utf8").split("\0").includes(marker)) ids.push(Number(name));
      } catch {}
    }
    return ids.filter((pid) => pid !== process.pid && processAlive(pid));
  }
  try {
    const output = execFileSync("ps", ["eww", "-axo", "pid=,command="], {
      encoding: "utf8", env: { ...process.env, LC_ALL: "C" }, stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 16 * 1024 * 1024,
    });
    const ids = [];
    for (const line of output.split("\n")) {
      if (!line.includes(marker)) continue;
      const match = /^\s*(\d+)\s/.exec(line);
      if (match) ids.push(Number(match[1]));
    }
    return ids.filter((pid) => pid !== process.pid && processAlive(pid));
  } catch {
    return undefined;
  }
}

function recordCustodyProcesses(pids) {
  const state = readState();
  const byPid = new Map(state.custody_processes.map((entry) => [entry.pid, entry]));
  for (const pid of pids) {
    byPid.set(pid, {
      pid,
      process_identity: processIdentity(pid) || "unverifiable:" + spec.custody_token,
    });
  }
  writeState({ ...state, custody_processes: [...byPid.values()].sort((a, b) => a.pid - b.pid) });
}

let child;
let terminating = false;
let settled = false;
let custodySettling = false;
let killTimer;
let parentTimer;

function finish(code) {
  if (settled) return;
  settled = true;
  if (parentTimer) clearInterval(parentTimer);
  if (killTimer) clearTimeout(killTimer);
  const clean = unregister();
  process.exit(clean ? code : 126);
}

function finishWithoutRelease(code) {
  if (settled) return;
  settled = true;
  if (parentTimer) clearInterval(parentTimer);
  if (killTimer) clearTimeout(killTimer);
  process.exit(code);
}

function settleCustody(code, force = false) {
  if (settled || custodySettling) return;
  custodySettling = true;
  const first = custodyProcessIds();
  if (first === undefined) {
    process.stderr.write("mister-clean execution supervisor: process-custody census is unavailable; refusing a clean result\n");
    try { markCustodyUnverifiable(); } catch {}
    return finishWithoutRelease(126);
  }
  if (first.length === 0) return finish(code);
  recordCustodyProcesses(first);
  process.stderr.write("mister-clean execution supervisor: detected a command that escaped its process group; terminating custody processes\n");
  for (const pid of first) {
    try { process.kill(pid, force ? "SIGKILL" : "SIGTERM"); } catch {}
  }
  setTimeout(() => {
    const remaining = custodyProcessIds();
    if (remaining === undefined) {
      try { markCustodyUnverifiable(); } catch {}
      return finishWithoutRelease(126);
    }
    if (remaining.length === 0) {
      clearCustodyProcesses();
      return finish(125);
    }
    recordCustodyProcesses(remaining);
    for (const pid of remaining) {
      try { process.kill(pid, "SIGKILL"); } catch {}
    }
    setTimeout(() => {
      const final = custodyProcessIds();
      if (final === undefined) {
        try { markCustodyUnverifiable(); } catch {}
        return finishWithoutRelease(126);
      }
      if (final.length !== 0) return finishWithoutRelease(126);
      clearCustodyProcesses();
      finish(125);
    }, 100);
  }, force ? 25 : spec.termination_grace_ms);
}

function terminateTree(signal = "SIGTERM") {
  if (terminating || settled) return;
  terminating = true;
  if (!child || !child.pid) return finish(125);
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    } else {
      process.kill(-process.pid, signal);
    }
  } catch (error) {
    if (!error || error.code !== "ESRCH") {
      process.stderr.write("mister-clean execution supervisor: failed to signal process tree\n");
    }
  }
  killTimer = setTimeout(() => {
    settleCustody(137, true);
  }, spec.termination_grace_ms);
}

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(signal, () => terminateTree(signal));
}

try { register(); }
catch (error) {
  if (registered) {
    try {
      const state = readState();
      writeState({ ...state, process_groups: [] });
      registered = false;
    } catch {}
  }
  if (lockHeld) {
    try { releaseOwnLock(); } catch {}
  }
  fail(error instanceof Error ? error.message : String(error));
}

parentTimer = setInterval(() => {
  if (processIdentity(spec.parent_pid) !== spec.binding.owner_process_identity) terminateTree("SIGTERM");
}, 100);
parentTimer.unref();

try {
  child = spawn(spec.executable, spec.argv, {
    cwd: spec.cwd,
    env: { ...process.env, MISTER_CLEAN_EXECUTION_CUSTODY_V1: spec.custody_token },
    shell: false,
    detached: false,
    stdio: ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error), 127);
}

child.once("error", (error) => {
  process.stderr.write("mister-clean execution supervisor: child spawn failed: " + error.message + "\n");
  finish(127);
});
child.once("close", (code, signal) => {
  if (signal) return settleCustody(128);
  settleCustody(code === null ? 1 : code);
});
`;

interface SupervisorSpec {
  readonly binding: ExecutionSupervisorBinding;
  readonly parent_pid: number;
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly termination_grace_ms: number;
  readonly custody_token: string;
}

function supervisorEnvironment(
  binding: ExecutionSupervisorBinding,
  executable: string,
  argv: readonly string[],
  cwd: string,
  environment: NodeJS.ProcessEnv,
  terminationGraceMs: number,
  custodyToken: string,
): NodeJS.ProcessEnv {
  const spec: SupervisorSpec = {
    binding,
    parent_pid: process.pid,
    executable,
    argv,
    cwd,
    termination_grace_ms: terminationGraceMs,
    custody_token: custodyToken,
  };
  const sanitized: NodeJS.ProcessEnv = {
    ...environment,
    [SPEC_ENV]: Buffer.from(JSON.stringify(spec), "utf8").toString("base64"),
  };
  delete sanitized[CUSTODY_ENV];
  return sanitized;
}

export function spawnSupervisedCommand(
  binding: ExecutionSupervisorBinding,
  executable: string,
  argv: readonly string[],
  cwd: string,
  environment: NodeJS.ProcessEnv,
  terminationGraceMs: number,
  output: "pipe" | "inherit" = "pipe",
): ChildProcess {
  if (process.platform === "win32") {
    throw new Error("Mister Clean refuses unsandboxed supervised execution on Windows because escaped-process custody is unavailable");
  }
  const custodyToken = randomUUID();
  return spawn(process.execPath, ["-e", SUPERVISOR_SOURCE], {
    cwd,
    env: supervisorEnvironment(binding, executable, argv, cwd, environment, terminationGraceMs, custodyToken),
    shell: false,
    detached: process.platform !== "win32",
    stdio: output === "pipe" ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"],
    windowsHide: true,
  });
}

export async function runSupervisedCommand(
  binding: ExecutionSupervisorBinding,
  executable: string,
  argv: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
  timeoutMs: number,
  terminationGraceMs: number,
): Promise<void> {
  const child = spawnSupervisedCommand(
    binding,
    executable,
    argv,
    options.cwd,
    options.env,
    terminationGraceMs,
    "inherit",
  );
  await new Promise<void>((resolveCommand, rejectCommand) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      try {
        if (process.platform === "win32") child.kill("SIGTERM");
        else if (child.pid) process.kill(-child.pid, "SIGTERM");
      } catch {
        // The close/error event below remains authoritative.
      }
    }, timeoutMs);
    child.once("error", (error) => {
      settled = true;
      clearTimeout(timeout);
      rejectCommand(error);
    });
    child.once("close", (code, signal) => {
      settled = true;
      clearTimeout(timeout);
      if (signal) rejectCommand(new Error(`supervised command terminated by ${signal}: ${executable}`));
      else if (code !== 0) rejectCommand(new Error(`supervised command exited ${String(code)}: ${executable}`));
      else resolveCommand();
    });
  });
}
