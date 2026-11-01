import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FIXTURE_HOOK_EVENTS,
  createFixtureRepository,
  fixtureCommit,
  fixtureGit,
} from "./fixture-repo.js";

const roots: string[] = [];

function scratch(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `mister-clean-fixture-repo-${name}-`));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function homeEnvironment(home: string): NodeJS.ProcessEnv {
  return { ...process.env, HOME: home, USERPROFILE: home };
}

/** A host policy that refuses every fixture commit, defined the way a host would. */
function writeRefusingHostPolicy(home: string, repository: string): void {
  mkdirSync(home, { recursive: true });
  const env = homeEnvironment(home);
  for (const event of FIXTURE_HOOK_EVENTS) {
    fixtureGit(repository, ["config", "--global", `hook.host-guard-${event}.event`, event], { env });
    fixtureGit(repository, ["config", "--global", `hook.host-guard-${event}.command`, "echo host hook refused >&2; exit 1"], {
      env,
    });
  }
}

function stageAndCommitWithHostPolicy(repository: string, home: string): { status: number; stderr: string } {
  const env = homeEnvironment(home);
  try {
    execFileSync("git", ["add", "-A"], { cwd: repository, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
    execFileSync("git", ["commit", "-qm", "control"], { cwd: repository, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stderr: "" };
  } catch (error) {
    const failed = error as { status?: number; stderr?: string };
    return { status: failed.status ?? 1, stderr: failed.stderr ?? "" };
  }
}

describe("hermetic fixture repositories", () => {
  it("commits in a fixture repository even when the host refuses every commit", () => {
    const root = scratch("host-policy");
    const home = join(root, "home");
    const control = join(root, "control");
    const hermetic = join(root, "hermetic");
    writeRefusingHostPolicy(home, root);

    // Control: a repository the helper did not create is refused, so the policy is live.
    mkdirSync(control);
    const env = homeEnvironment(home);
    execFileSync("git", ["init", "-q", "-b", "main", "."], { cwd: control, env });
    execFileSync("git", ["config", "user.name", "Control"], { cwd: control, env });
    execFileSync("git", ["config", "user.email", "control.invalid"], { cwd: control, env });
    writeFileSync(join(control, "control.txt"), "control\n");
    expect(stageAndCommitWithHostPolicy(control, home)).toEqual(expect.objectContaining({
      status: 1,
      stderr: expect.stringContaining("host hook refused"),
    }));

    // The helper's repository commits under the same host policy.
    createFixtureRepository(hermetic, { env });
    writeFileSync(join(hermetic, "fixture.txt"), "fixture\n");
    const head = fixtureCommit(hermetic, "hermetic fixture", { env });
    expect(head).toMatch(/^[0-9a-f]{40}$/u);
    expect(fixtureGit(hermetic, ["log", "--format=%s", "-1"], { env })).toBe("hermetic fixture");
    expect(fixtureGit(hermetic, ["status", "--porcelain"], { env })).toBe("");
  });

  it("writes only inside the fixture repository", () => {
    const root = scratch("scope");
    const home = join(root, "home");
    const control = join(root, "control");
    const hermetic = join(root, "hermetic");
    mkdirSync(home, { recursive: true });
    const env = homeEnvironment(home);
    fixtureGit(root, ["config", "--global", "user.name", "Host Owner"], { env });

    mkdirSync(control);
    execFileSync("git", ["init", "-q", "-b", "main", "."], { cwd: control });
    execFileSync("git", ["config", "user.name", "Control"], { cwd: control });
    execFileSync("git", ["config", "user.email", "control.invalid"], { cwd: control });

    const globalConfigPath = join(home, ".gitconfig");
    const globalBefore = readFileSync(globalConfigPath);
    const operatorGlobalBefore = existsSync(join(homedir(), ".gitconfig"))
      ? readFileSync(join(homedir(), ".gitconfig"))
      : null;
    const controlBefore = execFileSync("git", ["config", "--local", "--list"], { cwd: control, encoding: "utf8" });

    createFixtureRepository(hermetic, { env });
    writeFileSync(join(hermetic, "fixture.txt"), "fixture\n");
    fixtureCommit(hermetic, "scoped fixture", { env });

    expect(readFileSync(globalConfigPath)).toEqual(globalBefore);
    expect(existsSync(join(homedir(), ".gitconfig")) ? readFileSync(join(homedir(), ".gitconfig")) : null)
      .toEqual(operatorGlobalBefore);
    expect(execFileSync("git", ["config", "--local", "--list"], { cwd: control, encoding: "utf8" })).toBe(controlBefore);
    const fixtureConfig = execFileSync("git", ["config", "--local", "--list"], { cwd: hermetic, encoding: "utf8" });
    for (const event of FIXTURE_HOOK_EVENTS) {
      expect(fixtureConfig).toContain(`hook.${event}.enabled=false`);
    }
  });
});
