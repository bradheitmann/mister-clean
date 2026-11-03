import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFixtureRepository, fixtureGit } from "../test-support/fixture-repo.js";
import { trackedShippablePaths } from "./repository.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Node's spawnSync default output buffer, which `prepare` once ran into. */
const NODE_DEFAULT_MAX_BUFFER = 1024 * 1024;

describe("trackedShippablePaths on a large repository (prepare's own path)", () => {
  it("returns every tracked path when `git ls-files --cached -z` exceeds 1 MiB", () => {
    const repository = join(mkdtempSync(join(tmpdir(), "mister-clean-tracked-large-")), "repo");
    roots.push(join(repository, ".."));
    createFixtureRepository(repository);
    // Long names keep the file count low: each path is about 700 bytes.
    const outer = "o".repeat(220);
    const inner = "i".repeat(220);
    const expected: string[] = [];
    for (let group = 0; group < 4; group += 1) {
      const directory = join(repository, `${outer}${String(group)}`, inner);
      mkdirSync(directory, { recursive: true });
      for (let index = 0; index < 400; index += 1) {
        const name = `${"f".repeat(240)}-${String(index).padStart(4, "0")}.txt`;
        writeFileSync(join(directory, name), "");
        expected.push(`${outer}${String(group)}/${inner}/${name}`);
      }
    }
    fixtureGit(repository, ["add", "-A"]);
    const outputBytes = expected.reduce((total, path) => total + Buffer.byteLength(path, "utf8") + 1, 0);
    expect(outputBytes).toBeGreaterThan(NODE_DEFAULT_MAX_BUFFER);

    const paths = trackedShippablePaths(repository);
    expect(paths).toHaveLength(expected.length);
    expect(new Set(paths)).toEqual(new Set(expected));
  });
});
