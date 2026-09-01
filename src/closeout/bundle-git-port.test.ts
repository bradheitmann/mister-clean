import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { nodeGitPort } from "./bundle.js";
import { captureRepositoryObject } from "./repository-object.js";

const roots: string[] = [];

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["--no-optional-locks", "-C", root, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function signature(path: string): Readonly<Record<string, string | null>> {
  const metadata = lstatSync(path, { bigint: true });
  return Object.freeze({
    mode: metadata.mode.toString(),
    size: metadata.size.toString(),
    mtime_ns: metadata.mtimeNs.toString(),
    sha256: metadata.isFile() ? createHash("sha256").update(readFileSync(path)).digest("hex") : null,
  });
}

function sourceGitMetadata(root: string): unknown {
  const index = git(root, "rev-parse", "--path-format=absolute", "--git-path", "index");
  const objects = git(root, "rev-parse", "--path-format=absolute", "--git-path", "objects");
  const rows: unknown[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else rows.push({ path: relative(objects, path), signature: signature(path) });
    }
  };
  visit(objects);
  return { index: signature(index), objects: rows };
}

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "mc-bundle-git-port-"));
  roots.push(root);
  git(root, "init", "--quiet", "--initial-branch=main");
  git(root, "config", "user.name", "Mister Clean Test");
  git(root, "config", "user.email", "mister-clean-test.invalid");
  writeFileSync(join(root, "tracked.txt"), "before\n", "utf8");
  git(root, "add", "tracked.txt");
  git(root, "commit", "--quiet", "-m", "fixture");
  mkdirSync(join(root, "nested"));
  writeFileSync(join(root, "nested", "candidate.txt"), "candidate\n", "utf8");
  git(root, "add", "nested/candidate.txt");
  return root;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("read-only GUARD Git port", () => {
  it("computes the staged tree without mutating source Git metadata or RepositoryObject", async () => {
    const root = fixture();
    const metadataBefore = sourceGitMetadata(root);
    const objectBefore = captureRepositoryObject(root);

    const tree = await nodeGitPort.run(root, ["write-tree"]);

    expect(tree.code).toBe(0);
    expect(tree.stdout).toMatch(/^[a-f0-9]{40}$/u);
    expect(sourceGitMetadata(root)).toEqual(metadataBefore);
    expect(captureRepositoryObject(root)).toEqual(objectBefore);
  });
});
