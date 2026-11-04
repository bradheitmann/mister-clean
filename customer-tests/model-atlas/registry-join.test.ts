import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pinnedSha256For } from "./registry-join.js";

const here = import.meta.dirname;
const repositoryRoot = resolve(here, "..", "..");
const spec = JSON.parse(readFileSync(join(here, "registry-join.json"), "utf8")) as { fixture: string; artifact: { sha256: string } };
const fixture = resolve(repositoryRoot, spec.fixture);
const script = join(here, "registry-join.ts");
const scratch: string[] = [];

function run(args: string[]) {
  return spawnSync("bun", [script, ...args], { cwd: repositoryRoot, encoding: "utf8" });
}

afterEach(() => {
  for (const root of scratch.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("model-atlas customer test pin", () => {
  it("fixture matches the pin: the vendored fixture's sha256 equals registry-join.json", () => {
    expect(createHash("sha256").update(readFileSync(fixture)).digest("hex")).toBe(spec.artifact.sha256);
    expect(pinnedSha256For(fixture)).toBe(spec.artifact.sha256);
  });

  it("pinned fixture: one changed byte fails with no sha argument", () => {
    const original = readFileSync(fixture);
    try {
      const edited = Buffer.from(original);
      const index = edited.indexOf(Buffer.from('"schema"'));
      edited[index + 1] = "S".charCodeAt(0);
      writeFileSync(fixture, edited);
      const result = run([fixture]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("pinned sha256 mismatch");
    } finally {
      writeFileSync(fixture, original);
    }
    expect(run([fixture]).status).toBe(0);
  });

  it("unpinned: another artifact without a sha argument runs semantic checks and says so", () => {
    const root = mkdtempSync(join(tmpdir(), "mister-clean-registry-join-"));
    scratch.push(root);
    const copy = join(root, "current-main.json");
    copyFileSync(fixture, copy);
    const result = run([copy]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("UNPINNED");
  });
});
