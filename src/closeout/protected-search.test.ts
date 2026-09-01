import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildProtectedSearchPlan, validateProtectedSearchPolicy } from "./protected-search.js";

const roots: string[] = [];

function put(root: string, path: string, source: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), source, "utf8");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("protected search policy", () => {
  it("proves a basename exclusion does not contain a nested protected root", () => {
    const root = mkdtempSync(join(tmpdir(), "mister-clean-protected-search-"));
    roots.push(root);
    put(root, "src/public.txt", "needle\n");
    put(root, "project/planning/holdout/secret.txt", "needle\n");

    const unsafe = execFileSync("rg", ["--files", "--glob", "!holdout/**"], { cwd: root, encoding: "utf8" });
    expect(unsafe.split(/\r?\n/u)).toContain("project/planning/holdout/secret.txt");
    expect(validateProtectedSearchPolicy({
      allowed_roots: ["src"],
      protected_roots: ["project/planning/holdout"],
      exclusions: ["!holdout/**"],
    })).toContain("exclusion !holdout/** does not exactly bind a declared protected root");
  });

  it("emits positive allowed-root enumeration plus repository-qualified exclusions", () => {
    const plan = buildProtectedSearchPlan({
      allowed_roots: ["src", "references/public"],
      protected_roots: ["project/planning/holdout"],
      exclusions: ["!project/planning/holdout/**"],
    }, ["needle"]);

    expect(plan.argv).toContain("src/**");
    expect(plan.argv).toContain("references/public/**");
    expect(plan.argv).toContain("!project/planning/holdout/**");
  });

  it("rejects an allowed root that contains protected custody", () => {
    expect(validateProtectedSearchPolicy({
      allowed_roots: ["project"],
      protected_roots: ["project/planning/holdout"],
    })).toContain("allowed root project contains protected root project/planning/holdout");
  });

  it("keeps generated dispatch surfaces free of the unsafe basename pattern", () => {
    const repository = join(import.meta.dirname, "..", "..");
    const paths = [
      "templates/hygiene-report.md",
      "templates/orchestration-goal.md",
      "templates/session-close-report.md",
      "assets/action-manifest.json",
      "assets/closeout-report.json",
      "assets/closure-bundle.json",
    ];
    const unsafe = `--glob '${"!holdout/**"}'`;
    for (const path of paths) expect(readFileSync(join(repository, path), "utf8"), path).not.toContain(unsafe);
  });
});
