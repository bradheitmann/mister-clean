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

const FIXED_OVERRIDES = [
  "core.fsmonitor=false",
  "core.untrackedCache=false",
  "core.hooksPath=/dev/null",
  "core.sshCommand=ssh",
  "diff.external=",
  "credential.helper=",
] as const;

/** Per-name driver keys that run a program; their names come from the target's config. */
const DRIVER_KEYS = "^(filter\\..+\\.(clean|smudge|process)|remote\\..+\\.uploadpack)$";

export function hardenedGitEnv(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return { ...environment, GIT_CONFIG_NOSYSTEM: "1" };
}

/** Overrides for every filter or upload-pack driver the target's config declares. */
function driverOverrides(repository: string): string[] {
  const result = spawnSync("git", [
    ...FIXED_OVERRIDES.flatMap((override) => ["-c", override]),
    "-C", repository, "config", "--name-only", "--get-regexp", DRIVER_KEYS,
  ], { encoding: "utf8", env: hardenedGitEnv(), stdio: ["ignore", "pipe", "ignore"], timeout: 10_000 });
  if (result.status !== 0 || typeof result.stdout !== "string") return [];
  const overrides: string[] = [];
  for (const key of result.stdout.split("\n").filter(Boolean)) {
    if (key.startsWith("remote.")) {
      overrides.push(`${key}=git-upload-pack`);
    } else {
      overrides.push(`${key}=`, `${key.slice(0, key.lastIndexOf("."))}.required=false`);
    }
  }
  return overrides;
}

/**
 * Prefix git argv with config overrides that keep the call from executing any
 * program the target's config names. The repository is the `-C` argument, or
 * `cwd` when the call has none.
 */
export function hardenedGitArgs(args: readonly string[], cwd?: string): string[] {
  const at = args.indexOf("-C");
  const repository = at >= 0 ? args[at + 1] : cwd;
  const overrides = [...FIXED_OVERRIDES, ...(repository === undefined ? [] : driverOverrides(repository))];
  return [...overrides.flatMap((override) => ["-c", override]), ...args];
}
