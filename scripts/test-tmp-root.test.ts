import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRunRoot, removeRunRoot, RUN_ROOT_PREFIX } from "./test-tmp-root.js";

describe("per-run test temp root", () => {
  it("inside the run root: tmpdir() is this run's root and TMPDIR names it", () => {
    const current = tmpdir();
    expect(basename(current).startsWith(RUN_ROOT_PREFIX)).toBe(true);
    expect(process.env.TMPDIR?.replace(/\/$/u, "")).toBe(current.replace(/\/$/u, ""));
    expect(basename(dirname(current)).startsWith(RUN_ROOT_PREFIX)).toBe(false);
  });

  it("teardown removes the run root with nested non-empty directories", () => {
    const base = mkdtempSync(join(tmpdir(), "mister-clean-run-root-proof-"));
    try {
      const root = createRunRoot(base);
      mkdirSync(join(root, "fixture", "repo", ".git", "objects"), { recursive: true });
      writeFileSync(join(root, "fixture", "repo", ".git", "objects", "blob"), "x");
      expect(removeRunRoot(root)).toEqual({ removed: root });
      expect(existsSync(root)).toBe(false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
