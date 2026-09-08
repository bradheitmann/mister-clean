import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  ExecutionResourceBusyError,
  acquireRepositoryVerificationLease,
  validateExecutionLeaseReceipt,
} from "./execution-lease.js";
import { spawnSupervisedCommand } from "./execution-supervisor.js";

const roots: string[] = [];

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["--no-optional-locks", "-C", root, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fixture(name: string): { readonly repository: string; readonly root: string } {
  const root = mkdtempSync(join(tmpdir(), `mister-clean-execution-lease-${name}-`));
  roots.push(root);
  const repository = join(root, "repository");
  mkdirSync(repository);
  git(repository, "init", "--quiet", "--initial-branch=main");
  git(repository, "config", "user.name", "Execution Lease Fixture");
  git(repository, "config", "user.email", "execution-lease.invalid");
  writeFileSync(join(repository, "tracked.txt"), "fixture\n");
  git(repository, "add", "tracked.txt");
  git(repository, "commit", "--quiet", "-m", "fixture");
  return { repository, root };
}

async function waitForFile(path: string, child?: ReturnType<typeof spawn>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path) && Date.now() < deadline) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error(`process exited before ${path} appeared: ${String(child.exitCode)} ${String(child.signalCode)}`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  if (!existsSync(path)) throw new Error(`timed out waiting for ${path}`);
}

async function closeResult(child: ReturnType<typeof spawn>): Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode };
  }
  return new Promise((resolveClose, rejectClose) => {
    child.once("error", rejectClose);
    child.once("close", (code, signal) => resolveClose({ code, signal }));
  });
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("repository verification execution lease", () => {
  it("rejects overlapping verification and emits a terminal, validated receipt", () => {
    const { repository } = fixture("exclusive");
    const first = acquireRepositoryVerificationLease(repository);
    let busy: unknown;
    try {
      acquireRepositoryVerificationLease(repository);
    } catch (error) {
      busy = error;
    }
    expect(busy).toBeInstanceOf(ExecutionResourceBusyError);
    expect(busy).toEqual(expect.objectContaining({
      code: "MISTER_CLEAN_EXECUTION_RESOURCE_BUSY",
      classification: "resource_contention",
      model_attribution: "excluded",
      coordination_key_sha256: first.coordination_key_sha256,
    }));
    expect((busy as ExecutionResourceBusyError).contention_receipt).toEqual(expect.objectContaining({
      record_type: "mister-clean.execution-resource-contention",
      state: "not_started",
      classification: "resource_contention",
      model_attribution: "excluded",
      coordination_key_sha256: first.coordination_key_sha256,
    }));

    const receipt = first.release();
    const errors: string[] = [];
    expect(validateExecutionLeaseReceipt(receipt, "receipt", errors)).toBe(true);
    expect(errors).toEqual([]);
    expect(() => first.release()).toThrow(/already released/u);

    const successor = acquireRepositoryVerificationLease(repository);
    expect(successor.coordination_key_sha256).toBe(first.coordination_key_sha256);
    successor.release();
  });

  it("uses the shared Git common directory as the coordination boundary", () => {
    const { repository, root } = fixture("worktrees");
    const linked = join(root, "linked");
    git(repository, "worktree", "add", "--quiet", "-b", "linked", linked, "HEAD");
    const lease = acquireRepositoryVerificationLease(repository);
    expect(() => acquireRepositoryVerificationLease(linked)).toThrow(ExecutionResourceBusyError);
    lease.release();
  });

  it("cannot split the same repository lease by changing TMPDIR", () => {
    const { repository, root } = fixture("tmpdir-independent");
    const lease = acquireRepositoryVerificationLease(repository);
    const previous = process.env.TMPDIR;
    process.env.TMPDIR = join(root, "different-harness-tmp");
    mkdirSync(process.env.TMPDIR);
    try {
      expect(() => acquireRepositoryVerificationLease(repository)).toThrow(ExecutionResourceBusyError);
    } finally {
      if (previous === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previous;
      lease.release();
    }
  });

  it("does not strand the lease when acquisition metadata cannot be minted", () => {
    const { repository } = fixture("metadata-failure");
    expect(() => acquireRepositoryVerificationLease(repository, () => new Date(Number.NaN))).toThrow(/invalid date/u);
    const successor = acquireRepositoryVerificationLease(repository);
    successor.release();
  });

  it("does not leave a stale lease when the owning process is killed", async () => {
    const { repository } = fixture("crash-release");
    const moduleUrl = pathToFileURL(join(import.meta.dirname, "execution-lease.ts")).href;
    const source = [
      `import { acquireRepositoryVerificationLease } from ${JSON.stringify(moduleUrl)};`,
      `acquireRepositoryVerificationLease(${JSON.stringify(repository)});`,
      "process.stdout.write('HELD\\n');",
      "setInterval(() => {}, 1_000);",
    ].join("\n");
    const child = spawn("bun", ["-e", source], { stdio: ["ignore", "pipe", "pipe"] });
    await new Promise<void>((resolveReady, rejectReady) => {
      let output = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
        if (output.includes("HELD\n")) resolveReady();
      });
      child.once("error", rejectReady);
      child.once("exit", (code, signal) => rejectReady(new Error(`lease holder exited early code=${String(code)} signal=${String(signal)}`)));
    });
    child.kill("SIGKILL");
    await new Promise<void>((resolveExit) => child.once("close", () => resolveExit()));

    const successor = acquireRepositoryVerificationLease(repository);
    successor.release();
  }, 10_000);

  it("recovers a stale owner record when its PID has been reused by a different process birth", async () => {
    const { repository } = fixture("pid-reuse");
    const moduleUrl = pathToFileURL(join(import.meta.dirname, "execution-lease.ts")).href;
    const source = [
      `import { acquireRepositoryVerificationLease } from ${JSON.stringify(moduleUrl)};`,
      `const lease = acquireRepositoryVerificationLease(${JSON.stringify(repository)});`,
      "process.stdout.write(lease.supervisor_binding.state_path + '\\n');",
      "setInterval(() => {}, 1_000);",
    ].join("\n");
    const child = spawn("bun", ["-e", source], { stdio: ["ignore", "pipe", "pipe"] });
    const statePath = await new Promise<string>((resolveReady, rejectReady) => {
      let output = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
        if (output.includes("\n")) resolveReady(output.trim());
      });
      child.once("error", rejectReady);
      child.once("exit", (code, signal) => rejectReady(new Error(`lease holder exited early code=${String(code)} signal=${String(signal)}`)));
    });
    child.kill("SIGKILL");
    await closeResult(child);

    const state = JSON.parse(readFileSync(statePath, "utf8")) as Record<string, unknown>;
    state.owner = { pid: process.pid, process_identity: "ps-lstart:Thu Jan  1 00:00:00 1970" };
    writeFileSync(statePath, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });

    const successor = acquireRepositoryVerificationLease(repository);
    successor.release();
  }, 10_000);

  it("serializes concurrent supervisors before either can start a second target", async () => {
    const { repository, root } = fixture("supervisor-serialization");
    const firstMarker = join(root, "first.pid");
    const secondMarker = join(root, "second-started");
    const lease = acquireRepositoryVerificationLease(repository);
    const first = spawnSupervisedCommand(
      lease.supervisor_binding,
      process.execPath,
      ["-e", `require("node:fs").writeFileSync(${JSON.stringify(firstMarker)}, String(process.pid)); setInterval(() => {}, 1_000);`],
      repository,
      process.env,
      100,
    );
    await waitForFile(firstMarker, first);
    const second = spawnSupervisedCommand(
      lease.supervisor_binding,
      process.execPath,
      ["-e", `require("node:fs").writeFileSync(${JSON.stringify(secondMarker)}, "started\\n");`],
      repository,
      process.env,
      100,
    );
    const secondResult = await closeResult(second);
    expect(secondResult.code).not.toBe(0);
    expect(existsSync(secondMarker)).toBe(false);

    if (first.pid) process.kill(-first.pid, "SIGTERM");
    await closeResult(first);
    expect(lease.release().state).toBe("released");
  }, 10_000);

  it("kills and rejects a target that daemonizes outside its supervised process group", async () => {
    const { repository, root } = fixture("daemon-escape");
    const daemonMarker = join(root, "daemon.pid");
    const daemon = `require("node:fs").writeFileSync(${JSON.stringify(daemonMarker)}, String(process.pid)); setInterval(() => {}, 1_000);`;
    const target = [
      'const { spawn } = require("node:child_process");',
      `const child = spawn(process.execPath, ["-e", ${JSON.stringify(daemon)}], { detached: true, stdio: "ignore" });`,
      "child.unref();",
      "setTimeout(() => process.exit(0), 100);",
    ].join("\n");
    const lease = acquireRepositoryVerificationLease(repository);
    const supervisor = spawnSupervisedCommand(
      lease.supervisor_binding,
      process.execPath,
      ["-e", target],
      repository,
      process.env,
      100,
    );
    await waitForFile(daemonMarker, supervisor);
    const daemonPid = Number(readFileSync(daemonMarker, "utf8"));
    const result = await closeResult(supervisor);
    expect(result.code).not.toBe(0);
    expect(() => process.kill(daemonPid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
    expect(lease.release().state).toBe("released");
  }, 10_000);

  it("does not admit a successor until a killed owner's supervised child tree is gone", async () => {
    const { repository, root } = fixture("crash-with-child");
    const marker = join(root, "child.pid");
    const leaseUrl = pathToFileURL(join(import.meta.dirname, "execution-lease.ts")).href;
    const supervisorUrl = pathToFileURL(join(import.meta.dirname, "execution-supervisor.ts")).href;
    const target = [
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, String(process.pid));`,
      "setInterval(() => {}, 1_000);",
    ].join("\n");
    const source = [
      `import { acquireRepositoryVerificationLease } from ${JSON.stringify(leaseUrl)};`,
      `import { spawnSupervisedCommand } from ${JSON.stringify(supervisorUrl)};`,
      `const lease = acquireRepositoryVerificationLease(${JSON.stringify(repository)});`,
      `spawnSupervisedCommand(lease.supervisor_binding, process.execPath, ["-e", ${JSON.stringify(target)}], ${JSON.stringify(repository)}, process.env, 100);`,
      "setInterval(() => {}, 1_000);",
    ].join("\n");
    const owner = spawn("bun", ["-e", source], { stdio: ["ignore", "ignore", "pipe"] });
    const deadline = Date.now() + 5_000;
    while (!existsSync(marker) && Date.now() < deadline) {
      if (owner.exitCode !== null || owner.signalCode !== null) {
        throw new Error(`lease owner exited before child start: ${String(owner.exitCode)} ${String(owner.signalCode)}`);
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    }
    expect(existsSync(marker)).toBe(true);
    const targetPid = Number(readFileSync(marker, "utf8"));
    expect(Number.isSafeInteger(targetPid)).toBe(true);

    owner.kill("SIGKILL");
    await new Promise<void>((resolveExit) => owner.once("close", () => resolveExit()));

    let successor: ReturnType<typeof acquireRepositoryVerificationLease> | undefined;
    const successorDeadline = Date.now() + 5_000;
    while (!successor && Date.now() < successorDeadline) {
      try {
        successor = acquireRepositoryVerificationLease(repository);
      } catch (error) {
        if (!(error instanceof ExecutionResourceBusyError)) throw error;
        await new Promise((resolveWait) => setTimeout(resolveWait, 25));
      }
    }
    expect(successor).toBeDefined();
    let targetAlive = true;
    try {
      process.kill(targetPid, 0);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code === "ESRCH") targetAlive = false;
      else throw error;
    }
    expect(targetAlive).toBe(false);
    successor!.release();
  }, 15_000);
});
