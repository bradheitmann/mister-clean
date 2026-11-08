/**
 * The one hardening point for git calls against a target repository.
 *
 * A target's own .git/config can name programs git would run for an ordinary
 * read (core.fsmonitor on `git status`), and hooks, ssh, external diff, filter
 * and upload-pack drivers, or credential helpers on other calls. Every spawn of
 * git passes its argv through `hardenedGitArgs` and its environment through
 * `hardenedGitEnv`, which neutralise those keys for the call and drop the
 * system config. Config is still read, so remotes, upstreams and object format
 * keep working.
 *
 * Callers do not spawn git themselves: the runner below (`gitExecFileSync`,
 * `gitSpawnSync`, `gitExecFile`, `gitSpawn`) is the only place that does, and
 * it owns the hardened argv, `--no-optional-locks`, `-C <repo>` and the
 * environment (with `LC_ALL=C`). Each entry point keeps one child_process API,
 * so a caller's exit, throw and timeout semantics stay its own.
 */
import { execFile, execFileSync, spawn, spawnSync, type ChildProcess, type ChildProcessWithoutNullStreams, type SpawnSyncReturns, type StdioOptions } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Keys whose value names a program, or a transport that carries a command. */
const FIXED_OVERRIDES = [
  "core.fsmonitor=false",
  "core.untrackedCache=false",
  "core.hooksPath=/dev/null",
  "core.sshCommand=ssh",
  "core.askPass=",
  "core.askpass=",
  "core.pager=cat",
  "core.editor=false",
  "core.alternateRefsCommand=",
  "sequence.editor=false",
  "gpg.program=false",
  "diff.external=",
  "credential.helper=",
  "protocol.ext.allow=never",
] as const;

/**
 * Config no file may override. Injected through GIT_CONFIG_COUNT, which git
 * applies as if given on the command line, so it outranks the repository,
 * global and system files alike.
 */
const INJECTED_CONFIG = [
  ["credential.helper", ""],
  ["protocol.ext.allow", "never"],
  ["protocol.git.allow", "never"],
  ["core.askPass", ""],
  ["core.askpass", ""],
] as const;

/**
 * Environment variables a git call may inherit. Everything else, and every
 * inherited `GIT_*`, is dropped: several name a program, and the `GIT_CONFIG_*`
 * family is applied as command-line config, so it would collide with the
 * injection above. A caller that needs one specific `GIT_*` (a read-only index,
 * say) adds it to the result deliberately.
 */
const INHERITED_ALLOWLIST = [
  "PATH", "HOME", "USERPROFILE", "TMPDIR", "TEMP", "TMP",
  "LANG", "LC_ALL", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT",
  "http_proxy", "https_proxy", "no_proxy", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
] as const;

/** Transports a config-named remote may use; every other one can carry a command. */
const ALLOWED_REMOTE_TRANSPORTS = ["https", "ssh"] as const;

/**
 * Per-name keys whose value names a program; the names come from the target's
 * config. `url.<base>.insteadOf` is deliberately absent: an empty insteadOf
 * rewrites every URL to <base>, so clearing it would be worse than leaving it.
 * A rewrite that lands on a command transport is refused instead, by
 * protocol.ext.allow=never plus the transport check in `hardenedRemoteUrl`.
 */
const DRIVER_KEY = /^(?:filter\.(?<filter>.+)\.(?:clean|smudge|process)|remote\..+\.(?:uploadpack|proxy|vcs)|gpg\..+\.program|diff\..+\.(?:textconv|command)|merge\..+\.driver|trailer\..+\.command)$/u;

export class GitConfigSnapshotError extends Error {
  readonly code = "git_config_snapshot_unreadable";
  constructor(readonly repository: string, readonly detail: string) {
    super(
      `refusing the protected git call: the configuration of ${repository} could not be enumerated`
      + ` (${detail}), so its per-name driver overrides cannot be derived`,
    );
    this.name = "GitConfigSnapshotError";
  }
}

export class GitRemoteTransportError extends Error {
  readonly code = "git_remote_transport_refused";
  constructor(readonly remote: string, readonly transport: string) {
    super(
      `remote ${JSON.stringify(remote)} resolves to a ${transport} transport; only`
      + ` ${ALLOWED_REMOTE_TRANSPORTS.join(" and ")} may be contacted, because every other transport can carry a command`,
    );
    this.name = "GitRemoteTransportError";
  }
}

export function hardenedGitEnv(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const name of INHERITED_ALLOWLIST) {
    const value = environment[name];
    if (value !== undefined) result[name] = value;
  }
  result.GIT_OPTIONAL_LOCKS = "0";
  result.GIT_CONFIG_NOSYSTEM = "1";
  result.GIT_TERMINAL_PROMPT = "0";
  result.GIT_CONFIG_COUNT = String(INJECTED_CONFIG.length);
  for (const [index, [key, value]] of INJECTED_CONFIG.entries()) {
    result[`GIT_CONFIG_KEY_${index}`] = key;
    result[`GIT_CONFIG_VALUE_${index}`] = value;
  }
  return result;
}

export interface GitConfigSnapshot {
  /** Every config key the call will see, as git names it. */
  readonly keys: readonly string[];
  /** Git invocations the snapshot cost: one per protected call. */
  readonly reads: number;
}

/**
 * One read of the configuration a protected call will see. Every per-name
 * override for that call comes from this snapshot, so the call never
 * enumerates twice. A process inside the target that edits its config between
 * this read and the call can still re-add a driver; that race needs a
 * quiescent subject, like the rest of the live path.
 */
export function gitConfigSnapshot(repository: string): GitConfigSnapshot {
  // The snapshot is what hardenedGitArgs needs, so it cannot go through it: its
  // argv is the fixed overrides only, and the runner adds just LC_ALL=C.
  const result = spawnSync("git", [
    ...FIXED_OVERRIDES.flatMap((override) => ["-c", override]),
    "-C", repository, "config", "--list", "--name-only", "--null",
  ], { encoding: "utf8", env: runnerEnvironment({}), stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 });
  if (result.error !== undefined) throw new GitConfigSnapshotError(repository, result.error.message);
  if (result.signal !== null) throw new GitConfigSnapshotError(repository, `git config was terminated by ${result.signal}`);
  if (result.status !== 0 || typeof result.stdout !== "string") {
    throw new GitConfigSnapshotError(repository, `git config exited ${String(result.status)}: ${String(result.stderr ?? "").trim()}`);
  }
  return { keys: result.stdout.split("\0").filter(Boolean), reads: 1 };
}

/** Overrides for every driver key the snapshot declares. */
function driverOverrides(snapshot: GitConfigSnapshot): string[] {
  const overrides: string[] = [];
  for (const key of snapshot.keys) {
    const match = DRIVER_KEY.exec(key.toLocaleLowerCase("und"));
    if (!match) continue;
    if (key.toLocaleLowerCase("und").endsWith(".uploadpack")) overrides.push(`${key}=git-upload-pack`);
    else if (match.groups?.filter !== undefined) overrides.push(`${key}=`, `filter.${match.groups.filter}.required=false`);
    else overrides.push(`${key}=`);
  }
  return overrides;
}

/**
 * Prefix git argv with config overrides that keep the call from executing any
 * program the configuration names. The repository is the `-C` argument, or
 * `cwd` when the call has none. Throws `GitConfigSnapshotError` when that
 * configuration cannot be enumerated, rather than running without the
 * per-name overrides.
 */
export function hardenedGitArgs(args: readonly string[], cwd?: string): string[] {
  const at = args.indexOf("-C");
  const repository = at >= 0 ? args[at + 1] : cwd;
  const overrides = [
    ...FIXED_OVERRIDES,
    ...(repository === undefined ? [] : driverOverrides(gitConfigSnapshot(repository))),
  ];
  return [...overrides.flatMap((override) => ["-c", override]), ...args];
}

/**
 * The only `GIT_*` names a caller may add to the runner's environment: a
 * read-only index and object store (bundle-runtime's `write-tree`), and the
 * isolated global config and ceiling of the remote contact below. Any other
 * name, GIT_DIR or GIT_SSH_COMMAND say, could redirect or reprogram the call.
 */
const RUNNER_EXTRA_ENV = [
  "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CONFIG_GLOBAL", "GIT_CEILING_DIRECTORIES",
] as const;

export type GitRunnerExtraEnvName = (typeof RUNNER_EXTRA_ENV)[number];

export class GitRunnerEnvError extends Error {
  readonly code = "git_runner_env_refused";
  constructor(readonly names: readonly string[]) {
    super(`refusing the git call: extra environment ${names.map((name) => JSON.stringify(name)).join(", ")} is not one of ${RUNNER_EXTRA_ENV.join(", ")}`);
    this.name = "GitRunnerEnvError";
  }
}

/**
 * Options a runner call may set. There is no `cwd` and no `env`: the
 * repository is the runner's `-C` argument and the environment is always the
 * hardened one, so a caller cannot route around either.
 */
export interface GitSpawnOptions {
  readonly encoding?: BufferEncoding | "buffer" | null;
  readonly maxBuffer?: number;
  readonly timeout?: number;
  readonly killSignal?: NodeJS.Signals | number;
  readonly stdio?: StdioOptions;
  readonly input?: string | NodeJS.ArrayBufferView | undefined;
  readonly windowsHide?: boolean;
  readonly shell?: false;
  readonly extraEnv?: Readonly<Partial<Record<GitRunnerExtraEnvName, string>>>;
}

/** The runner's environment: hardened, with LC_ALL=C, plus only allowlisted extras. */
function runnerEnvironment(extraEnv: Readonly<Record<string, string | undefined>>): NodeJS.ProcessEnv {
  const refused = Object.keys(extraEnv).filter((name) => !(RUNNER_EXTRA_ENV as readonly string[]).includes(name));
  if (refused.length > 0) throw new GitRunnerEnvError(refused);
  return { ...hardenedGitEnv({ ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" }), ...extraEnv };
}

/** Child options: the caller's, unchanged, with the runner's environment. Checked before argv, so a refused env spawns nothing. */
function runnerOptions(options: GitSpawnOptions): Record<string, unknown> {
  const { extraEnv = {}, ...rest } = options;
  return { ...rest, env: runnerEnvironment(extraEnv) };
}

function runnerArgs(repo: string, args: readonly string[]): string[] {
  return hardenedGitArgs(["--no-optional-locks", "-C", repo, ...args]);
}

/** `execFileSync` of git against `repo`; throws as execFileSync does. */
export function gitExecFileSync(repo: string, args: readonly string[], options: GitSpawnOptions & { readonly encoding: BufferEncoding }): string;
export function gitExecFileSync(repo: string, args: readonly string[], options?: GitSpawnOptions): Buffer;
export function gitExecFileSync(repo: string, args: readonly string[], options: GitSpawnOptions = {}): string | Buffer {
  const childOptions = runnerOptions(options);
  return execFileSync("git", runnerArgs(repo, args), childOptions);
}

/** `spawnSync` of git against `repo`; reports exit and timeout in its result, as spawnSync does. */
export function gitSpawnSync(repo: string, args: readonly string[], options: GitSpawnOptions & { readonly encoding: BufferEncoding }): SpawnSyncReturns<string>;
export function gitSpawnSync(repo: string, args: readonly string[], options?: GitSpawnOptions): SpawnSyncReturns<Buffer>;
export function gitSpawnSync(repo: string, args: readonly string[], options: GitSpawnOptions = {}): SpawnSyncReturns<string | Buffer> {
  const childOptions = runnerOptions(options);
  return spawnSync("git", runnerArgs(repo, args), childOptions);
}

/** Promisified `execFile` of git against `repo`; rejects as execFile does. */
export async function gitExecFile(
  repo: string,
  args: readonly string[],
  options: GitSpawnOptions & { readonly encoding: BufferEncoding },
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  const childOptions = runnerOptions(options) as { encoding: BufferEncoding };
  return await execFileAsync("git", runnerArgs(repo, args), childOptions);
}

/** `spawn` of git against `repo`; the caller owns the child's lifecycle. */
export function gitSpawn(repo: string, args: readonly string[], options: GitSpawnOptions & { readonly stdio: readonly ["pipe", "pipe", "pipe"] }): ChildProcessWithoutNullStreams;
export function gitSpawn(repo: string, args: readonly string[], options?: GitSpawnOptions): ChildProcess;
export function gitSpawn(repo: string, args: readonly string[], options: GitSpawnOptions = {}): ChildProcess {
  const childOptions = runnerOptions(options);
  return spawn("git", runnerArgs(repo, args), childOptions);
}

/** A resolved remote URL's transport: its scheme, scp-like ssh, or a local path. */
export function remoteTransport(url: string): string {
  const scheme = /^(?<scheme>[A-Za-z][A-Za-z0-9+.-]*)::/u.exec(url)?.groups?.scheme
    ?? /^(?<scheme>[A-Za-z][A-Za-z0-9+.-]*):\/\//u.exec(url)?.groups?.scheme;
  if (scheme !== undefined) return scheme.toLocaleLowerCase("und");
  if (/^[^/]+@[^/:]+:/u.test(url)) return "ssh";
  return "path";
}

export class GitRemoteNameError extends Error {
  readonly code = "git_remote_name_refused";
  constructor(readonly remote: string, readonly reason: string) {
    super(`remote ${JSON.stringify(remote)} is refused: ${reason}`);
    this.name = "GitRemoteNameError";
  }
}

export class GitRemoteRefError extends Error {
  readonly code = "git_remote_ref_refused";
  constructor(readonly ref: string, readonly repository: string) {
    super(`a ref contacted for ${repository} may not begin with '-'`);
    this.name = "GitRemoteRefError";
  }
}

export interface GitRunner {
  run(repo: string, args: readonly string[], allowed?: readonly number[]): Promise<{ readonly stdout: string; readonly code?: number }>;
}

/**
 * The URL the named remote resolves to under the hardened configuration, after
 * any `insteadOf` rewrite. The name is refused unless it is a configured remote
 * whose name is not option-shaped, so it cannot fall back to `origin` or be
 * read as a git option; the URL comes from that exact remote, and its transport
 * must be https or ssh. This is the only transport check in the source.
 */
async function hardenedRemoteUrl(
  repository: string,
  remote: string,
  git: GitRunner,
): Promise<string> {
  if (remote.startsWith("-") || remote.length === 0) throw new GitRemoteNameError(remote, "a remote name may not be empty or begin with '-'");
  const configured = (await git.run(repository, ["remote"])).stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!configured.includes(remote)) throw new GitRemoteNameError(remote, "not a configured remote; a target proof may not name a remote the repository does not define");
  // get-url errors on an unknown remote rather than falling back to origin.
  const url = (await git.run(repository, ["remote", "get-url", "--end-of-options", remote])).stdout.trim();
  const transport = remoteTransport(url);
  if (!ALLOWED_REMOTE_TRANSPORTS.includes(transport as (typeof ALLOWED_REMOTE_TRANSPORTS)[number])) {
    throw new GitRemoteTransportError(remote, transport);
  }
  return url;
}

/**
 * Contact a URL `hardenedRemoteUrl` already checked, exactly as written. The
 * call runs outside any repository, with no system config and an empty global
 * config, so no `insteadOf` rewrite from the repository, global or system
 * config can redirect it after the check: the bytes checked are the bytes
 * contacted.
 */
function contactRemote(url: string, flags: readonly string[], ref: string): { readonly stdout: string; readonly code: number } {
  const isolation = mkdtempSync(join(tmpdir(), "mister-clean-remote-contact-"));
  try {
    const outside = join(isolation, "cwd");
    const emptyGlobal = join(isolation, "gitconfig");
    mkdirSync(outside);
    writeFileSync(emptyGlobal, "");
    // GIT_CONFIG_NOSYSTEM=1 comes from hardenedGitEnv, as on every call.
    const result = gitSpawnSync(outside, ["ls-remote", ...flags, "--end-of-options", url, ref], {
      encoding: "utf8",
      extraEnv: { GIT_CONFIG_GLOBAL: emptyGlobal, GIT_CEILING_DIRECTORIES: isolation },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
    return { stdout: (result.stdout ?? "").trim(), code: result.status ?? 128 };
  } finally {
    rmSync(isolation, { recursive: true, force: true });
  }
}

/**
 * Contact the configured remote `remote` for `ref`, holding the whole
 * remote-contact invariant in one place: the ref is refused when option-shaped
 * (`GitRemoteRefError`), then the remote name and its configured membership are
 * checked (`GitRemoteNameError`), then its URL is resolved and its transport
 * checked (`GitRemoteTransportError`), and only then is that exact URL
 * contacted, in isolation. Nothing is spawned before the ref check, and
 * nothing contacts a remote before the transport check. A failed contact is a
 * nonzero `code`, not a throw. `url` is the URL checked and contacted.
 */
export async function contactConfiguredRemote(
  repository: string,
  remote: string,
  ref: string,
  flags: readonly string[],
  git: GitRunner,
): Promise<{ readonly url: string; readonly stdout: string; readonly code: number }> {
  if (ref.startsWith("-")) throw new GitRemoteRefError(ref, repository);
  const url = await hardenedRemoteUrl(repository, remote, git);
  return { url, ...contactRemote(url, flags, ref) };
}
