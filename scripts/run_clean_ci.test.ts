import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { captureRepositoryObject } from "../src/closeout/repository-object.js";
import { createCleanCandidateCapsule, runCleanCi } from "./run_clean_ci.js";

const temporaryRoots: string[] = [];

function put(root: string, path: string, content: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function git(root: string, ...args: string[]): void {
  execFileSync("git", ["--no-optional-locks", "-C", root, ...args], {
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: "pipe",
  });
}

function fixture(buildsGeneratedOutput: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-clean-ci-test-"));
  temporaryRoots.push(root);
  put(root, ".gitignore", "dist/\nnode_modules/\nsrc/generated-materials.ts\n");
  put(root, "package.json", `${JSON.stringify({
    name: "clean-ci-fixture",
    version: "1.0.0",
    private: true,
    type: "module",
    packageManager: "pnpm@11.0.3",
    scripts: {
      "build:raw": "bun scripts/build.ts",
      "test:node": "bun scripts/assert-built.ts",
      "test:bun": "bun scripts/assert-built.ts",
      "control-plane:check": "bun scripts/assert-built.ts",
      "pack:check": "bun scripts/assert-built.ts",
      "audit:public": "bun scripts/assert-built.ts",
      "audit:repository-boundaries": "bun scripts/assert-built.ts",
      "generated:check": "bun scripts/assert-built.ts",
      "generated:postbuild:check": "bun scripts/assert-built.ts",
    },
  }, null, 2)}\n`);
  put(root, "pnpm-lock.yaml", [
    "lockfileVersion: '9.0'",
    "",
    "settings:",
    "  autoInstallPeers: true",
    "  excludeLinksFromLockfile: false",
    "",
    "importers:",
    "",
    "  .: {}",
    "",
  ].join("\n"));
  put(root, "scripts/build.ts", buildsGeneratedOutput
    ? [
      'import { mkdirSync, writeFileSync } from "node:fs";',
      'mkdirSync("dist", { recursive: true });',
      'mkdirSync("src", { recursive: true });',
      'writeFileSync("dist/acceptance.txt", "fresh\\n");',
      'writeFileSync("src/generated-materials.ts", "export const generated = true;\\n");',
      "",
    ].join("\n")
    : "// Deliberately does not create the ignored output consumed by acceptance.\n");
  put(root, "scripts/assert-built.ts", [
    'import { readFileSync } from "node:fs";',
    'if (readFileSync("dist/acceptance.txt", "utf8") !== "fresh\\n") throw new Error("fresh build output absent");',
    "",
  ].join("\n"));
  put(root, "source.txt", "committed\n");
  git(root, "init", "--quiet", "--initial-branch=main");
  git(root, "config", "user.name", "Clean CI Fixture");
  git(root, "config", "user.email", "clean-ci.invalid");
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "fixture");
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe("clean exact-object CI capsule", () => {
  it("reconstructs staged, unstaged, and untracked candidate state without importing ignored output", () => {
    const root = fixture(true);
    put(root, "source.txt", "staged\n");
    git(root, "add", "source.txt");
    put(root, "source.txt", "unstaged-after-stage\n");
    put(root, "untracked.txt", "candidate-only\n");
    put(root, "dist/acceptance.txt", "stale\n");
    const expected = captureRepositoryObject(root);
    const capsule = mkdtempSync(join(tmpdir(), "mister-clean-clean-ci-capsule-test-"));
    temporaryRoots.push(capsule);

    const materialized = createCleanCandidateCapsule(root, capsule);

    expect(captureRepositoryObject(materialized.repository)).toEqual(expected);
    expect(readFileSync(join(materialized.repository, "source.txt"), "utf8")).toBe("unstaged-after-stage\n");
    expect(readFileSync(join(materialized.repository, "untracked.txt"), "utf8")).toBe("candidate-only\n");
    expect(existsSync(join(materialized.repository, "dist", "acceptance.txt"))).toBe(false);
  });

  it("passes from a cold clone because build:raw materializes every ignored prerequisite before the matrix", () => {
    const root = fixture(true);
    const before = captureRepositoryObject(root);

    const receipt = runCleanCi(root);

    expect(receipt.status).toBe("pass");
    expect(receipt.matrix).toHaveLength(8);
    expect(receipt.source_repository_object).toEqual(before);
    expect(receipt.capsule_repository_object_before_install).toEqual(before);
    expect(receipt.capsule_repository_object_after_build).toEqual(before);
    expect(receipt.source_repository_object_after).toEqual(before);
    expect(existsSync(join(root, "dist", "acceptance.txt"))).toBe(false);
  }, 30_000);

  it("proves a stale ignored dist in the source cannot satisfy capsule acceptance", () => {
    const root = fixture(false);
    put(root, "dist/acceptance.txt", "fresh\n");
    const before = captureRepositoryObject(root);

    expect(() => runCleanCi(root)).toThrow();

    expect(captureRepositoryObject(root)).toEqual(before);
    expect(readFileSync(join(root, "dist", "acceptance.txt"), "utf8")).toBe("fresh\n");
  }, 30_000);
});
