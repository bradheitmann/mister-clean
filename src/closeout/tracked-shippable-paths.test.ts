import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFixtureRepository } from "../test-support/fixture-repo.js";
import { trackedShippablePaths } from "./repository.js";

const roots: string[] = [];

afterEach(() => {
  // One recursive removal of the scratch tree, which holds only `.git`.
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Node's spawnSync default output buffer, which `prepare` once ran into. */
const NODE_DEFAULT_MAX_BUFFER = 1024 * 1024;

/**
 * The fixture is index-only, so it costs no per-file filesystem work: the
 * 1,200 entries are written to the index with one `git update-index
 * --index-info` and marked skip-worktree with one `git update-index --stdin`,
 * which is how a sparse checkout tracks a path with no worktree file. Git then
 * lists every entry under `--cached` and none under `--deleted`, exactly the
 * two listings `trackedShippablePaths` reconciles. Four 225-byte path
 * components per entry (about 900 bytes a path) keep the entry count as low as
 * the 1 MiB target allows.
 */
const COMPONENT = 225;
const ENTRIES_PER_LEAF = 400;
const LEAVES = 3;

function gitWithInput(repository: string, args: readonly string[], input: string): void {
  execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
}

describe("trackedShippablePaths on a large repository (prepare's own path)", () => {
  it("returns every tracked path when `git ls-files --cached -z` exceeds 1 MiB", () => {
    const base = mkdtempSync(join(tmpdir(), "mister-clean-tracked-large-"));
    roots.push(base);
    const repository = join(base, "repo");
    createFixtureRepository(repository);
    const emptyBlob = execFileSync("git", ["-C", repository, "hash-object", "-w", "--stdin"], {
      encoding: "utf8", input: "", stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const expected: string[] = [];
    for (let leaf = 0; leaf < LEAVES; leaf += 1) {
      const directory = [`${"a".repeat(COMPONENT - 1)}${String(leaf)}`, "b".repeat(COMPONENT), "c".repeat(COMPONENT)].join("/");
      for (let index = 0; index < ENTRIES_PER_LEAF; index += 1) {
        expected.push(`${directory}/${"f".repeat(COMPONENT - 8)}${String(index).padStart(4, "0")}.txt`);
      }
    }
    gitWithInput(repository, ["update-index", "--add", "--index-info"],
      expected.map((path) => `100644 ${emptyBlob}\t${path}\n`).join(""));
    gitWithInput(repository, ["update-index", "--skip-worktree", "--stdin"], `${expected.join("\n")}\n`);
    const outputBytes = expected.reduce((total, path) => total + Buffer.byteLength(path, "utf8") + 1, 0);
    expect(outputBytes).toBeGreaterThan(NODE_DEFAULT_MAX_BUFFER);

    const paths = trackedShippablePaths(repository);
    expect(paths).toHaveLength(expected.length);
    expect(new Set(paths)).toEqual(new Set(expected));
  });
});
