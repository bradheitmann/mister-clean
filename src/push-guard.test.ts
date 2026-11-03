import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFixtureRepository, fixtureCommit } from "./test-support/fixture-repo.js";

const guard = resolve(import.meta.dirname, "..", "hooks", "pre-push-no-force.sh");
const roots: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function guardedClone(): { clone: string; remote: string } {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-push-guard-"));
  roots.push(root);
  const remote = join(root, "remote.git");
  git(root, "init", "--quiet", "--bare", remote);
  const clone = join(root, "clone");
  createFixtureRepository(clone, { identity: { name: "Push Guard Fixture", email: "push-guard.invalid" } });
  writeFileSync(join(clone, "a.txt"), "one\n");
  fixtureCommit(clone, "first");
  git(clone, "remote", "add", "origin", remote);
  git(clone, "push", "--quiet", "origin", "HEAD:refs/heads/lane");
  const hooks = git(clone, "rev-parse", "--path-format=absolute", "--git-path", "hooks");
  git(clone, "config", "core.hooksPath", hooks);
  copyFileSync(guard, join(hooks, "pre-push"));
  execFileSync("chmod", ["+x", join(hooks, "pre-push")]);
  return { clone, remote };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("pre-push no-force guard", () => {
  it("fast-forward: a push that extends the remote tip passes", () => {
    const { clone, remote } = guardedClone();
    writeFileSync(join(clone, "a.txt"), "two\n");
    fixtureCommit(clone, "second");
    const result = spawnSync("git", ["push", "--quiet", "origin", "HEAD:refs/heads/lane"], { cwd: clone, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(git(remote, "rev-parse", "refs/heads/lane")).toBe(git(clone, "rev-parse", "HEAD"));
  });

  it("force: a rewritten tip is refused even with --force, and the remote keeps its tip", () => {
    const { clone, remote } = guardedClone();
    const before = git(remote, "rev-parse", "refs/heads/lane");
    git(clone, "commit", "--quiet", "--amend", "-m", "rewritten");
    const result = spawnSync("git", ["push", "--force", "origin", "HEAD:refs/heads/lane"], { cwd: clone, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("is not a fast-forward");
    expect(git(remote, "rev-parse", "refs/heads/lane")).toBe(before);
  });
});
