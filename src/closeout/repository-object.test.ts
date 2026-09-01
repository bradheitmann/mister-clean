import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  captureRepositoryObject,
  captureRepositoryObjectSurface,
} from "./repository-object.js";

const roots: string[] = [];

function git(repository: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fixture(name: string, base = tmpdir()): string {
  const repository = mkdtempSync(join(base, `mister-clean-repository-object-${name}-`));
  roots.push(repository);
  git(repository, "init", "-q", "-b", "main");
  git(repository, "config", "user.name", "Repository Object Test");
  git(repository, "config", "user.email", "repository-object.invalid");
  git(repository, "config", "core.filemode", "true");
  writeFileSync(join(repository, ".gitignore"), "local-evidence.log\n", "utf8");
  writeFileSync(join(repository, "tracked.txt"), "tracked baseline\n", "utf8");
  writeFileSync(join(repository, "script.sh"), "#!/bin/sh\nexit 0\n", "utf8");
  chmodSync(join(repository, "script.sh"), 0o644);
  git(repository, "add", ".gitignore", "tracked.txt", "script.sh");
  git(repository, "commit", "-qm", "fixture");
  return repository;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("captureRepositoryObject", () => {
  it("projects the exact bytes from the verified RepositoryObject traversal", () => {
    const repository = fixture("surface-projection");
    writeFileSync(join(repository, "untracked.txt"), "untracked baseline\n", "utf8");

    const capture = captureRepositoryObjectSurface(repository);
    expect(capture.repository_object).toEqual(captureRepositoryObject(repository));
    expect(capture.entries).toHaveLength(capture.repository_object.entry_count);
    expect(capture.entries.map((entry) => entry.path)).toEqual([
      ".gitignore",
      "script.sh",
      "tracked.txt",
      "untracked.txt",
    ]);
    const tracked = capture.entries.find((entry) => entry.path === "tracked.txt");
    const untracked = capture.entries.find((entry) => entry.path === "untracked.txt");
    expect(tracked).toMatchObject({ kind: "regular_file", tracked: { mode: "100644" } });
    expect(untracked).toMatchObject({ kind: "regular_file", tracked: null });
    if (tracked?.kind !== "regular_file" || untracked?.kind !== "regular_file") {
      throw new Error("expected regular-file projection entries");
    }
    expect(Buffer.from(tracked.bytes).toString("utf8")).toBe("tracked baseline\n");
    expect(Buffer.from(untracked.bytes).toString("utf8")).toBe("untracked baseline\n");
  });

  it("is stable, content-addressed, and does not modify the repository", () => {
    const repository = fixture("stable");
    writeFileSync(join(repository, "untracked.txt"), "untracked baseline\n", "utf8");
    const statusBefore = git(repository, "status", "--porcelain=v1", "--untracked-files=all");
    const indexBefore = sha256(readFileSync(join(repository, ".git", "index")));

    const first = captureRepositoryObject(repository);
    const second = captureRepositoryObject(repository);

    expect(second).toEqual(first);
    expect(first).toEqual({
      record_type: "mister-clean.repository-object",
      schema_version: "1.0",
      head_commit: git(repository, "rev-parse", "HEAD"),
      surface: "tracked_and_nonignored",
      entry_count: 4,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(git(repository, "status", "--porcelain=v1", "--untracked-files=all")).toBe(statusBefore);
    expect(sha256(readFileSync(join(repository, ".git", "index")))).toBe(indexBefore);
  });

  it("changes identity when a tracked regular file changes", () => {
    const repository = fixture("tracked-mutation");
    const before = captureRepositoryObject(repository);
    writeFileSync(join(repository, "tracked.txt"), "tracked mutation\n", "utf8");
    const after = captureRepositoryObject(repository);
    expect(after.sha256).not.toBe(before.sha256);
    expect(after.entry_count).toBe(before.entry_count);
  });

  it("changes identity when a nonignored untracked file changes", () => {
    const repository = fixture("untracked-mutation");
    writeFileSync(join(repository, "untracked.txt"), "first\n", "utf8");
    const before = captureRepositoryObject(repository);
    writeFileSync(join(repository, "untracked.txt"), "second\n", "utf8");
    const after = captureRepositoryObject(repository);
    expect(after.sha256).not.toBe(before.sha256);
    expect(after.entry_count).toBe(before.entry_count);
  });

  it("binds staged index state even when the working bytes match HEAD", () => {
    const repository = fixture("staged-state");
    const before = captureRepositoryObject(repository);
    writeFileSync(join(repository, "tracked.txt"), "staged mutation\n", "utf8");
    git(repository, "add", "tracked.txt");
    writeFileSync(join(repository, "tracked.txt"), "tracked baseline\n", "utf8");
    const after = captureRepositoryObject(repository);
    expect(after.sha256).not.toBe(before.sha256);
    expect(after.entry_count).toBe(before.entry_count);
  });

  it("changes identity and preserves the entry when a tracked file is deleted", () => {
    const repository = fixture("deletion");
    const before = captureRepositoryObject(repository);
    unlinkSync(join(repository, "tracked.txt"));
    const after = captureRepositoryObject(repository);
    expect(after.sha256).not.toBe(before.sha256);
    expect(after.entry_count).toBe(before.entry_count);
    const capture = captureRepositoryObjectSurface(repository);
    expect(capture.entries.find((entry) => entry.path === "tracked.txt"))
      .toMatchObject({ kind: "missing_tracked_entry", tracked: { mode: "100644" } });
  });

  it("changes identity when a symlink target changes", () => {
    const repository = fixture("symlink");
    writeFileSync(join(repository, "target-a.txt"), "same bytes\n", "utf8");
    writeFileSync(join(repository, "target-b.txt"), "same bytes\n", "utf8");
    symlinkSync("target-a.txt", join(repository, "current.txt"));
    git(repository, "add", "target-a.txt", "target-b.txt", "current.txt");
    git(repository, "commit", "-qm", "add symlink");
    const before = captureRepositoryObject(repository);
    unlinkSync(join(repository, "current.txt"));
    symlinkSync("target-b.txt", join(repository, "current.txt"));
    const after = captureRepositoryObject(repository);
    expect(after.sha256).not.toBe(before.sha256);
    expect(after.entry_count).toBe(before.entry_count);
  });

  it("projects symlink targets without following them", () => {
    const repository = fixture("projected-symlink");
    writeFileSync(join(repository, "target.txt"), "target bytes\n", "utf8");
    symlinkSync("target.txt", join(repository, "current.txt"));
    git(repository, "add", "target.txt", "current.txt");
    git(repository, "commit", "-qm", "add projected symlink");

    const capture = captureRepositoryObjectSurface(repository);
    const current = capture.entries.find((entry) => entry.path === "current.txt");
    expect(current).toMatchObject({ kind: "symlink", tracked: { mode: "120000" } });
    if (current?.kind !== "symlink") throw new Error("expected symlink projection entry");
    expect(Buffer.from(current.target).toString("utf8")).toBe("target.txt");
  });

  it("changes identity when a regular file executable bit changes", () => {
    const repository = fixture("executable");
    const before = captureRepositoryObject(repository);
    chmodSync(join(repository, "script.sh"), 0o755);
    const after = captureRepositoryObject(repository);
    expect(after.sha256).not.toBe(before.sha256);
    expect(after.entry_count).toBe(before.entry_count);
  });

  it("binds the checked-out worktree state of a tracked gitlink", () => {
    const child = fixture("submodule-child");
    const repository = fixture("submodule-parent");
    git(repository, "-c", "protocol.file.allow=always", "submodule", "add", "-q", child, "vendor/child");
    git(repository, "commit", "-qm", "add submodule");
    const before = captureRepositoryObject(repository);
    writeFileSync(join(repository, "vendor", "child", "tracked.txt"), "dirty submodule worktree\n", "utf8");
    const after = captureRepositoryObject(repository);
    expect(after.sha256).not.toBe(before.sha256);
    expect(after.entry_count).toBe(before.entry_count);
  });

  it("excludes ignored local evidence from the identity", () => {
    const repository = fixture("ignored");
    const before = captureRepositoryObject(repository);
    writeFileSync(join(repository, "local-evidence.log"), "first local observation\n", "utf8");
    const withIgnoredFile = captureRepositoryObject(repository);
    writeFileSync(join(repository, "local-evidence.log"), "second local observation\n", "utf8");
    const afterIgnoredMutation = captureRepositoryObject(repository);
    expect(withIgnoredFile).toEqual(before);
    expect(afterIgnoredMutation).toEqual(before);
  });

  it("rejects an untracked special filesystem entry instead of omitting it", async () => {
    const repository = fixture("special", "/tmp");
    const socketPath = join(repository, "agent.sock");
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    try {
      expect(() => captureRepositoryObject(repository)).toThrow(/unsupported special entry.*agent\.sock/i);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
