/**
 * Master-gate S2b: one git runner (charter/DONE/mg-s2b-git-runner.md, proofs
 * 2, 3, 4 and 8). The runner in git-hardening.ts owns the hardened argv, the
 * environment and the remote-contact invariant. Spawns are observed through a
 * `git` shim on PATH that logs each call's argv, cwd and environment and then
 * runs the real git, so every case exercises real git behaviour. Every
 * behavioural refusal first shows, with an unhardened control call, that the
 * fixture really would misbehave without the protection.
 */
import { spawnSync } from "node:child_process";
import { accessSync, appendFileSync, chmodSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createFixtureRepository, fixtureCommit, fixtureGit } from "../test-support/fixture-repo.js";
import { fixture as cleanBundleFixture, git, removeTemporaryRoots, successor, validateBundle, type RecordValue } from "./bundle.test-fixture.js";
import { nodeGitPort } from "./bundle.js";
import {
  GitRemoteNameError,
  GitRemoteRefError,
  GitRemoteTransportError,
  GitRunnerEnvError,
  contactConfiguredRemote,
  gitExecFile,
  gitExecFileSync,
  gitSpawn,
  gitSpawnSync,
  hardenedGitArgs,
  hardenedGitEnv,
  type GitSpawnOptions,
} from "./git-hardening.js";

const PACKAGE_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const ORIGINAL_PATH = process.env.PATH ?? "";
const roots: string[] = [];

afterEach(async () => {
  process.env.PATH = ORIGINAL_PATH;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  await removeTemporaryRoots();
});

function scratch(name: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `mister-clean-git-runner-${name}-`)));
  roots.push(root);
  return root;
}

function realGit(): string {
  for (const directory of ORIGINAL_PATH.split(delimiter)) {
    const candidate = join(directory, "git");
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Not on this PATH entry.
    }
  }
  throw new Error("no git on PATH");
}

interface LoggedCall {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

/**
 * Put a logging `git` first on PATH. Each call writes `<n>.argv` (NUL
 * separated), `<n>.cwd` and `<n>.env`, then execs the real git with the same
 * argv. Returns a reader for the calls logged so far.
 */
function gitShim(name: string): { readonly calls: () => LoggedCall[]; readonly clear: () => void } {
  const root = scratch(`${name}-shim`);
  const bin = join(root, "bin");
  const log = join(root, "log");
  mkdirSync(bin);
  mkdirSync(log);
  writeFileSync(join(bin, "git"), [
    "#!/bin/sh",
    `call=$(mktemp "${log}/call.XXXXXX")`,
    "for argument in \"$@\"; do printf '%s\\0' \"$argument\"; done > \"$call.argv\"",
    "pwd > \"$call.cwd\"",
    "env > \"$call.env\"",
    `exec "${realGit()}" "$@"`,
    "",
  ].join("\n"));
  chmodSync(join(bin, "git"), 0o755);
  process.env.PATH = `${bin}${delimiter}${ORIGINAL_PATH}`;
  const calls = (): LoggedCall[] => readdirSync(log).filter((entry) => entry.endsWith(".argv")).sort().map((entry) => {
    const base = join(log, entry.slice(0, -".argv".length));
    const env: Record<string, string> = {};
    for (const line of readFileSync(`${base}.env`, "utf8").split("\n")) {
      const at = line.indexOf("=");
      if (at > 0) env[line.slice(0, at)] = line.slice(at + 1);
    }
    return { argv: readFileSync(`${base}.argv`, "utf8").split("\0").slice(0, -1), cwd: readFileSync(`${base}.cwd`, "utf8").trim(), env };
  });
  return { calls, clear: () => { for (const entry of readdirSync(log)) rmSync(join(log, entry)); } };
}

/** The calls other than gitConfigSnapshot's own `config --list` read. */
function commandCalls(calls: readonly LoggedCall[]): LoggedCall[] {
  return calls.filter((call) => !(call.argv.includes("config") && call.argv.includes("--list")));
}

function repository(name: string): string {
  const root = scratch(name);
  const repo = join(root, "repo");
  createFixtureRepository(repo, { identity: { name: "Runner Fixture", email: "runner.invalid" } });
  writeFileSync(join(repo, "README.md"), "fixture\n");
  fixtureCommit(repo, "fixture");
  return repo;
}

type EntryPoint = (repo: string, args: readonly string[], options?: GitSpawnOptions) => Promise<unknown>;

/** Each runner entry point, driven to completion. */
const ENTRY_POINTS: readonly (readonly [string, EntryPoint])[] = [
  ["gitExecFileSync", async (repo, args, options = {}) => gitExecFileSync(repo, args, { ...options, encoding: "utf8" })],
  ["gitSpawnSync", async (repo, args, options = {}) => gitSpawnSync(repo, args, { ...options, encoding: "utf8" })],
  ["gitExecFile", async (repo, args, options = {}) => await gitExecFile(repo, args, { ...options, encoding: "utf8" })],
  ["gitSpawn", async (repo, args, options = {}) => await new Promise<void>((resolveClose, rejectClose) => {
    const child = gitSpawn(repo, args, { ...options, stdio: ["ignore", "ignore", "ignore"] });
    child.once("error", rejectClose);
    child.once("close", () => resolveClose());
  })],
];

/** A script git runs as core.fsmonitor; it records each invocation in `marker` (as execution-safety.test.ts:106). */
function plantFsmonitor(repo: string, root: string): string {
  const marker = join(root, "fsmonitor-ran");
  const hook = join(root, "fsmonitor-hook.sh");
  writeFileSync(hook, `#!/bin/sh\necho ran >> "${marker}"\nexit 1\n`);
  chmodSync(hook, 0o755);
  writeFileSync(join(repo, ".git", "config"), `${readFileSync(join(repo, ".git", "config"), "utf8")}[core]\n\tfsmonitor = ${hook}\n`);
  return marker;
}

describe("runner contract", { timeout: 120_000 }, () => {
  it.each(ENTRY_POINTS)("%s passes the hardened -c overrides, then --no-optional-locks and -C <repo>, then the args", async (_name, run) => {
    const repo = repository("argv");
    // A per-name driver key, so the expected overrides include a derived one.
    appendFileSync(join(repo, ".git", "config"), "[filter \"fixture\"]\n\tclean = false\n");
    const shim = gitShim("argv");
    await run(repo, ["rev-parse", "HEAD"]);
    const calls = commandCalls(shim.calls());
    expect(calls).toHaveLength(1);
    expect(calls[0]!.argv).toEqual(hardenedGitArgs(["--no-optional-locks", "-C", repo, "rev-parse", "HEAD"]));
    expect(calls[0]!.argv).toContain("filter.fixture.clean=");
  });

  it.each(ENTRY_POINTS)("%s runs under hardenedGitEnv with LC_ALL=C plus only the allowlisted extras", async (_name, run) => {
    const repo = repository("env");
    const shim = gitShim("env");
    await run(repo, ["rev-parse", "HEAD"], { extraEnv: { GIT_CEILING_DIRECTORIES: dirname(dirname(repo)) } });
    const [call] = commandCalls(shim.calls());
    const expected: NodeJS.ProcessEnv = { ...hardenedGitEnv({ ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" }), GIT_CEILING_DIRECTORIES: dirname(dirname(repo)) };
    const gitNames = (env: Readonly<Record<string, string | undefined>>): string[] => Object.keys(env).filter((key) => key.startsWith("GIT_")).sort();
    expect(gitNames(call!.env)).toEqual(gitNames(expected));
    for (const name of gitNames(expected)) expect(call!.env[name], name).toBe(expected[name]);
    expect(call!.env.LC_ALL).toBe("C");
  });

  it("accepts each allowlisted extra environment name", () => {
    const repo = repository("extras");
    const shim = gitShim("extras");
    const extraEnv = {
      GIT_INDEX_FILE: join(repo, ".git", "index"),
      GIT_OBJECT_DIRECTORY: join(repo, ".git", "objects"),
      GIT_ALTERNATE_OBJECT_DIRECTORIES: join(repo, ".git", "objects"),
      GIT_CONFIG_GLOBAL: join(repo, ".git", "no-global"),
      GIT_CEILING_DIRECTORIES: dirname(repo),
    };
    gitExecFileSync(repo, ["rev-parse", "HEAD"], { encoding: "utf8", extraEnv });
    const [call] = commandCalls(shim.calls());
    for (const [name, value] of Object.entries(extraEnv)) expect(call!.env[name], name).toBe(value);
  });

  it.each(ENTRY_POINTS)("%s refuses any other extra environment name with GitRunnerEnvError before any spawn", async (_name, run) => {
    const repo = repository("extra-env");
    const shim = gitShim("extra-env");
    for (const name of ["GIT_DIR", "GIT_SSH_COMMAND", "PATH"]) {
      const extraEnv = { [name]: "/nonexistent" } as unknown as NonNullable<GitSpawnOptions["extraEnv"]>;
      await expect(run(repo, ["rev-parse", "HEAD"], { extraEnv }), name).rejects.toBeInstanceOf(GitRunnerEnvError);
    }
    // Not even the config snapshot ran.
    expect(shim.calls()).toEqual([]);
  });

  it("does not let a parent GIT_DIR redirect the child to another repository", () => {
    const repo = repository("git-dir-subject");
    const other = repository("git-dir-other");
    // With core.worktree set, an inherited GIT_DIR alone names `other` as the work tree.
    fixtureGit(other, ["config", "core.worktree", other]);
    const otherGitDir = join(other, ".git");
    const control = spawnSync("git", ["-C", repo, "rev-parse", "--show-toplevel"], { encoding: "utf8", env: { ...process.env, GIT_DIR: otherGitDir } });
    expect(control.status, control.stderr).toBe(0);
    expect(realpathSync(control.stdout.trim()), "the unhardened control was not redirected, so the case proves nothing").toBe(realpathSync(other));

    const previous = process.env.GIT_DIR;
    process.env.GIT_DIR = otherGitDir;
    try {
      expect(realpathSync(gitExecFileSync(repo, ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim())).toBe(realpathSync(repo));
    } finally {
      if (previous === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previous;
    }
  });
});

describe("declared deltas", { timeout: 120_000 }, () => {
  it.each(ENTRY_POINTS)("(a) %s adds --no-optional-locks after the -c overrides", async (_name, run) => {
    const repo = repository("delta-a");
    const shim = gitShim("delta-a");
    await run(repo, ["rev-parse", "HEAD"]);
    const [call] = commandCalls(shim.calls());
    let at = 0;
    while (call!.argv[at] === "-c") at += 2;
    expect(call!.argv.slice(at, at + 3)).toEqual(["--no-optional-locks", "-C", repo]);
  });

  it.each(ENTRY_POINTS)("(b) %s sets LC_ALL=C over the parent's locale", async (_name, run) => {
    const repo = repository("delta-b");
    const previous = process.env.LC_ALL;
    process.env.LC_ALL = "en_US.UTF-8";
    try {
      const shim = gitShim("delta-b");
      await run(repo, ["rev-parse", "HEAD"]);
      for (const call of shim.calls()) expect(call.env.LC_ALL, call.argv.join(" ")).toBe("C");
    } finally {
      if (previous === undefined) delete process.env.LC_ALL;
      else process.env.LC_ALL = previous;
    }
  });

  it("(c) planning names its package root with -C instead of cwd", async () => {
    const shim = gitShim("delta-c");
    vi.resetModules();
    await import("../planning.js");
    const calls = commandCalls(shim.calls()).filter((call) => call.argv.includes("--show-toplevel"));
    expect(calls).toHaveLength(1);
    let at = 0;
    while (calls[0]!.argv[at] === "-c") at += 2;
    expect(calls[0]!.argv.slice(at)).toEqual(["--no-optional-locks", "-C", PACKAGE_ROOT, "rev-parse", "--show-toplevel"]);
  });
});

describe("remote contact", { timeout: 180_000 }, () => {
  function contactFixture(name: string): { readonly repo: string; readonly target: string; readonly sha: string } {
    const target = repository(`${name}-target`);
    const sha = fixtureGit(target, ["rev-parse", "refs/heads/main"]);
    const repo = repository(name);
    return { repo, target, sha };
  }

  it("refuses a configured remote whose URL is a plain local path, with GitRemoteTransportError and no ls-remote", async () => {
    const { repo, target, sha } = contactFixture("plain-path");
    fixtureGit(repo, ["remote", "add", "origin", target]);
    // Control: git really does answer ls-remote on this plain path.
    const control = spawnSync("git", ["ls-remote", target, "refs/heads/main"], { encoding: "utf8" });
    expect(control.status, control.stderr).toBe(0);
    expect(control.stdout, "the control could not reach the fixture, so the case proves nothing").toContain(sha);

    const shim = gitShim("plain-path");
    await expect(contactConfiguredRemote(repo, "origin", "refs/heads/main", ["--heads"], nodeGitPort)).rejects.toBeInstanceOf(GitRemoteTransportError);
    expect(shim.calls().filter((call) => call.argv.includes("ls-remote"))).toEqual([]);
  });

  it("does not refuse an https remote: the contact is attempted and a failure is a nonzero code", async () => {
    const { repo } = contactFixture("https");
    fixtureGit(repo, ["remote", "add", "origin", "https://example.invalid/x.git"]);
    const shim = gitShim("https");
    const contacted = await contactConfiguredRemote(repo, "origin", "refs/heads/main", ["--heads"], nodeGitPort);
    expect(contacted.url).toBe("https://example.invalid/x.git");
    expect(contacted.code).not.toBe(0);
    expect(shim.calls().filter((call) => call.argv.includes("ls-remote"))).toHaveLength(1);
  });

  it("refuses an option-shaped ref with GitRemoteRefError before any spawn", async () => {
    const { repo } = contactFixture("dash-ref");
    fixtureGit(repo, ["remote", "add", "origin", "https://example.invalid/x.git"]);
    const shim = gitShim("dash-ref");
    await expect(contactConfiguredRemote(repo, "origin", "--upload-pack=x", ["--heads"], nodeGitPort)).rejects.toBeInstanceOf(GitRemoteRefError);
    expect(shim.calls()).toEqual([]);
  });

  it("keeps the begin-with-dash message for an option-shaped remote name", async () => {
    const { repo } = contactFixture("dash-remote");
    const refusal = contactConfiguredRemote(repo, "--upload-pack=x", "refs/heads/main", ["--heads"], nodeGitPort);
    await expect(refusal).rejects.toBeInstanceOf(GitRemoteNameError);
    await expect(refusal).rejects.toThrow(/begin with '-'/u);
  });

  it("live validation reports an option-shaped target remote_ref with its exact string", async () => {
    const value = await cleanBundleFixture();
    await git(value.repo, "remote", "add", "origin", "https://example.invalid/x.git");
    Object.assign(successor(value).target_observation as RecordValue, {
      kind: "remote_ref_resolution",
      remote: "origin",
      remote_ref: "--upload-pack=touch-nothing",
    });
    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain("$.successor_readiness.target_observation.remote_ref: a remote ref may not begin with '-'");
  });

  it("action evidence reports an option-shaped pushed ref with its exact string", async () => {
    const value = await cleanBundleFixture();
    await git(value.repo, "remote", "add", "origin", "https://example.invalid/x.git");
    const commit = (value.report.repo as RecordValue).commit;
    (value.report.claims as RecordValue).pushed = {
      state: "established",
      evidence: [{ kind: "remote_ref_resolution", remote: "origin", ref: "--upload-pack=touch-nothing", commit }],
    };
    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain("$.report.claims.pushed.evidence[0]: a pushed ref may not begin with '-'");
  });
});

describe("fsmonitor control", { timeout: 120_000 }, () => {
  it("an unhardened status runs the planted fsmonitor; the runner's status does not", () => {
    const repo = repository("fsmonitor");
    const root = dirname(repo);
    const marker = plantFsmonitor(repo, root);
    const control = spawnSync("git", ["-C", repo, "status"], { encoding: "utf8", env: { ...process.env } });
    expect(control.status, control.stderr).toBe(0);
    expect(existsSync(marker), `the unhardened status never ran the fsmonitor (git ${spawnSync("git", ["--version"], { encoding: "utf8" }).stdout.trim()}), so the case proves nothing`).toBe(true);
    rmSync(marker);

    const result = gitSpawnSync(repo, ["status"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(marker)).toBe(false);
  });
});
