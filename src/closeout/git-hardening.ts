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
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  const result = spawnSync("git", [
    ...FIXED_OVERRIDES.flatMap((override) => ["-c", override]),
    "-C", repository, "config", "--list", "--name-only", "--null",
  ], { encoding: "utf8", env: hardenedGitEnv(), stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 });
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

export interface GitRunner {
  run(repo: string, args: readonly string[], allowed?: readonly number[]): Promise<{ readonly stdout: string; readonly code?: number }>;
}

/**
 * The URL the named remote resolves to under the hardened configuration, after
 * any `insteadOf` rewrite. The name is refused unless it is a configured remote
 * whose name is not option-shaped, so it cannot fall back to `origin` or be
 * read as a git option; the URL comes from that exact remote, and its transport
 * must be https or ssh. Callers contact the returned URL, not the name, so the
 * value checked here is the value contacted.
 */
export async function hardenedRemoteUrl(
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
 * contacted. `repository` names the subject in errors only; it is never read.
 */
export function contactRemote(
  repository: string,
  url: string,
  flags: readonly string[],
  ref: string,
): { readonly stdout: string; readonly code: number } {
  if (ref.startsWith("-")) throw new GitRemoteNameError(ref, `a ref contacted for ${repository} may not begin with '-'`);
  const isolation = mkdtempSync(join(tmpdir(), "mister-clean-remote-contact-"));
  try {
    const outside = join(isolation, "cwd");
    const emptyGlobal = join(isolation, "gitconfig");
    mkdirSync(outside);
    writeFileSync(emptyGlobal, "");
    const result = spawnSync("git", hardenedGitArgs(["--no-optional-locks", "-C", outside, "ls-remote", ...flags, "--end-of-options", url, ref]), {
      encoding: "utf8",
      env: { ...hardenedGitEnv(), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: emptyGlobal, GIT_CEILING_DIRECTORIES: isolation },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
    return { stdout: (result.stdout ?? "").trim(), code: result.status ?? 128 };
  } finally {
    rmSync(isolation, { recursive: true, force: true });
  }
}
