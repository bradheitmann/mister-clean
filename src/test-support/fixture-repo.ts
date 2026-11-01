/**
 * Temporary Git repositories for tests.
 *
 * A host may define hook policies in its system or global Git configuration
 * (`hook.<name>.event` / `hook.<name>.command`, git-config(1)). Those hooks run
 * on every commit, including the throwaway commits a test makes in its own
 * scratch repository, so a suite that only passes on a host without them is not
 * portable. Each fixture repository therefore switches the hook events a commit
 * triggers off in its own configuration (`hook.<event>.enabled=false`), which
 * is repository-local and names no particular hook.
 *
 * Nothing here touches a global config, an environment variable of the running
 * process, or a repository the caller did not create.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

/** Hook events a plain fixture commit triggers, and a host policy can refuse. */
export const FIXTURE_HOOK_EVENTS = ["pre-commit", "commit-msg"] as const;

export const FIXTURE_IDENTITY = { name: "Fixture", email: "fixture.invalid" } as const;

export interface FixtureGitOptions {
  /** Working directory for the Git child; the fixture repository by default. */
  readonly cwd?: string;
  /** Environment for the Git child; the caller's environment by default. */
  readonly env?: NodeJS.ProcessEnv;
}

export interface FixtureRepositoryOptions extends FixtureGitOptions {
  readonly branch?: string;
  readonly identity?: { readonly name: string; readonly email: string };
}

function git(repository: string, args: readonly string[], options: FixtureGitOptions): string {
  return execFileSync("git", args, {
    cwd: options.cwd ?? repository,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * Turn off every config-defined hook event a fixture commit triggers, in this
 * repository only. Idempotent, so a test may also call it on a repository it
 * obtained another way (a clone, a copy).
 */
export function applyHermeticHookPolicy(repository: string, options: FixtureGitOptions = {}): void {
  for (const event of FIXTURE_HOOK_EVENTS) {
    git(repository, ["config", `hook.${event}.enabled`, "false"], options);
  }
}

/**
 * Create `directory` as a hermetic fixture repository: initialized, given a
 * commit identity, and insulated from host hook policies.
 */
export function createFixtureRepository(directory: string, options: FixtureRepositoryOptions = {}): void {
  mkdirSync(directory, { recursive: true });
  git(directory, ["init", "-q", "-b", options.branch ?? "main", "."], options);
  const identity = options.identity ?? FIXTURE_IDENTITY;
  git(directory, ["config", "user.name", identity.name], options);
  git(directory, ["config", "user.email", identity.email], options);
  applyHermeticHookPolicy(directory, options);
}

/** Run one Git command against a fixture repository. */
export function fixtureGit(
  repository: string,
  args: readonly string[],
  options: FixtureGitOptions = {},
): string {
  return git(repository, args, options);
}

/** Stage every path and commit inside a fixture repository; returns the new HEAD. */
export function fixtureCommit(
  repository: string,
  message = "fixture",
  options: FixtureGitOptions = {},
): string {
  git(repository, ["add", "-A"], options);
  git(repository, ["commit", "-qm", message], options);
  return git(repository, ["rev-parse", "HEAD"], options);
}
