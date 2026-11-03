import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";
import { createExecutionSnapshot } from "./native-gates.js";
import { captureRepositoryObject } from "./repository-object.js";

const roots: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function subjectWithLocalExclude(): { repo: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-snapshot-excludes-"));
  roots.push(root);
  const repo = join(root, "repo");
  createFixtureRepository(repo, { identity: { name: "Snapshot Exclude Fixture", email: "snapshot-exclude.invalid" } });
  writeFileSync(join(repo, "tracked.txt"), "tracked\n");
  fixtureCommit(repo, "fixture");
  const exclude = git(repo, "rev-parse", "--path-format=absolute", "--git-path", "info/exclude");
  mkdirSync(join(exclude, ".."), { recursive: true });
  writeFileSync(exclude, "local.lock\n");
  writeFileSync(join(repo, "local.lock"), "written by a harness, ignored only locally\n");
  return { repo, root };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("native-gate snapshot carries the subject's local exclude rules", () => {
  it("info/exclude: a file ignored only through info/exclude does not break the snapshot", async () => {
    const { repo } = subjectWithLocalExclude();
    expect(git(repo, "status", "--porcelain", "--untracked-files=all")).toBe("");
    const expected = captureRepositoryObject(repo);
    const snapshot = await createExecutionSnapshot(repo, expected, { git_timeout_ms: 60_000 });
    try {
      expect(snapshot.repository_object).toEqual(expected);
    } finally {
      rmSync(snapshot.container, { recursive: true, force: true });
    }
  });

  it("worktree: a linked worktree subject resolves info/exclude through the common directory", async () => {
    const { repo, root } = subjectWithLocalExclude();
    const linked = join(root, "linked");
    git(repo, "worktree", "add", "--quiet", "--detach", linked);
    writeFileSync(join(linked, "local.lock"), "also ignored only locally\n");
    expect(git(linked, "status", "--porcelain", "--untracked-files=all")).toBe("");
    const expected = captureRepositoryObject(linked);
    const snapshot = await createExecutionSnapshot(linked, expected, { git_timeout_ms: 60_000 });
    try {
      expect(snapshot.repository_object).toEqual(expected);
    } finally {
      rmSync(snapshot.container, { recursive: true, force: true });
    }
  });

  it("names the difference when the subject really changed after capture", async () => {
    const { repo } = subjectWithLocalExclude();
    const expected = captureRepositoryObject(repo);
    writeFileSync(join(repo, "late.txt"), "created after the object was captured\n");
    await expect(createExecutionSnapshot(repo, expected, { git_timeout_ms: 60_000 })).rejects.toThrow(
      new RegExp(`does not reproduce the exact subject repository object \\(subject ${expected.sha256} entries=${expected.entry_count}; snapshot [0-9a-f]{64} entries=${expected.entry_count + 1}\\)`, "u"),
    );
  });
});
