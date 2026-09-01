#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import {
  captureRepositoryObjectSurface,
  type RepositoryObject,
  type RepositoryObjectSurfaceCapture,
} from "../src/closeout/repository-object.js";
import { materializeRepositoryObjectSurface } from "../src/closeout/repository-materialization.js";
import { copyIsolatedPnpmTree } from "./release_capsule.mjs";

export type GeneratedCandidateKind = "worktree" | "staged";

const GENERATED_OUTPUTS = Object.freeze([
  "assets/codebase-state-dashboard/model-scorecard-interactions.js",
  "assets/codebase-state-dashboard/model-scorecard.html",
  "bin/mister-clean.js",
  "MANIFEST.sha256",
]);

interface CandidateBinding {
  readonly kind: GeneratedCandidateKind;
  readonly repository_object: RepositoryObject | null;
  readonly index_tree: string | null;
}

interface OutputSignature {
  readonly path: string;
  readonly mode: number;
  readonly size: number;
  readonly sha256: string;
}

function repositoryRoot(): string {
  return resolve(import.meta.dir, "..");
}

function productionBuildEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env, NODE_ENV: "production", BUN_ENV: "production" };
  for (const key of ["VITEST", "VITEST_MODE", "VITEST_POOL_ID", "VITEST_WORKER_ID", "JEST_WORKER_ID"]) {
    delete environment[key];
  }
  return environment;
}

function git(repository: string, args: readonly string[]): string {
  return execFileSync("git", ["--no-optional-locks", "-C", repository, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function withExternalIndexTree<Result>(repository: string, use: (tree: string, environment: NodeJS.ProcessEnv) => Result): Result {
  const temporary = mkdtempSync(join(tmpdir(), "mc-readonly-index-"));
  const sourceIndex = git(repository, ["rev-parse", "--path-format=absolute", "--git-path", "index"]);
  const sourceObjects = git(repository, ["rev-parse", "--path-format=absolute", "--git-path", "objects"]);
  const externalIndex = join(temporary, "index");
  const externalObjects = join(temporary, "objects");
  mkdirSync(externalObjects, { recursive: true });
  copyFileSync(sourceIndex, externalIndex);
  try {
    const environment = {
      ...process.env,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: sourceObjects,
      GIT_INDEX_FILE: externalIndex,
      GIT_OBJECT_DIRECTORY: externalObjects,
      GIT_OPTIONAL_LOCKS: "0",
      LC_ALL: "C",
    };
    const tree = execFileSync("git", ["--no-optional-locks", "-C", repository, "write-tree"], {
      encoding: "utf8",
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return use(tree, environment);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function externalIndexTree(repository: string): string {
  return withExternalIndexTree(repository, (tree) => tree);
}

function sameRepositoryObject(left: RepositoryObject, right: RepositoryObject): boolean {
  return left.head_commit === right.head_commit
    && left.entry_count === right.entry_count
    && left.sha256 === right.sha256;
}

function materializeStaged(repository: string, destination: string, indexTree: string): void {
  const archive = join(dirname(destination), "staged-candidate.tar");
  withExternalIndexTree(repository, (observedTree, environment) => {
    if (observedTree !== indexTree) throw new Error("Git index tree changed before staged candidate materialization");
    execFileSync("git", ["--no-optional-locks", "-C", repository, "archive", "--format=tar", `--output=${archive}`, indexTree], {
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
  });
  execFileSync("tar", ["-xf", archive, "-C", destination], {
    env: { ...process.env, COPYFILE_DISABLE: "1", COPY_EXTENDED_ATTRIBUTES_DISABLE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function initializeCandidateGit(destination: string): void {
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", destination], { stdio: "pipe" });
  git(destination, ["config", "user.name", "Mister Clean Generated Candidate"]);
  git(destination, ["config", "user.email", "generated-candidate.invalid"]);
  git(destination, ["add", "--all", "--force"]);
  git(destination, ["commit", "--quiet", "-m", "exact generated candidate"]);
}

function outputSignatures(root: string): readonly OutputSignature[] {
  return GENERATED_OUTPUTS.map((path) => {
    const absolute = join(root, path);
    const metadata = lstatSync(absolute);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`required generated output is not a regular file: ${path}`);
    }
    const bytes = readFileSync(absolute);
    return Object.freeze({
      path,
      mode: metadata.mode & 0o777,
      size: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  });
}

function manifestDelta(expected: string, actual: string): string {
  const rows = (text: string) => new Map(text.trimEnd().split("\n").filter(Boolean).map((line) => [line.slice(68), line.slice(0, 64)]));
  const expectedRows = rows(expected);
  const actualRows = rows(actual);
  const paths = [...new Set([...expectedRows.keys(), ...actualRows.keys()])].sort();
  return paths
    .filter((path) => expectedRows.get(path) !== actualRows.get(path))
    .slice(0, 12)
    .map((path) => `${path}:${expectedRows.get(path) ?? "MISSING"}->${actualRows.get(path) ?? "MISSING"}`)
    .join(";");
}

function assertSameOutputs(
  expected: readonly OutputSignature[],
  actual: readonly OutputSignature[],
  expectedManifest: string,
  actualManifest: string,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const expectedByPath = new Map(expected.map((entry) => [entry.path, entry]));
    const mismatches = actual
      .filter((entry) => JSON.stringify(entry) !== JSON.stringify(expectedByPath.get(entry.path)))
      .map((entry) => entry.path);
    const manifestDetail = mismatches.includes("MANIFEST.sha256")
      ? ` (${manifestDelta(expectedManifest, actualManifest)})`
      : "";
    throw new Error(`fresh isolated build differs from candidate generated outputs: ${mismatches.join(", ") || "missing output"}${manifestDetail}`);
  }
}

function captureBinding(repository: string, kind: GeneratedCandidateKind): {
  readonly binding: CandidateBinding;
  readonly worktree_capture: RepositoryObjectSurfaceCapture | null;
} {
  if (kind === "worktree") {
    const capture = captureRepositoryObjectSurface(repository);
    return {
      binding: { kind, repository_object: capture.repository_object, index_tree: null },
      worktree_capture: capture,
    };
  }
  const indexTree = externalIndexTree(repository);
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(indexTree)) throw new Error("git write-tree returned an invalid index tree");
  return { binding: { kind, repository_object: null, index_tree: indexTree }, worktree_capture: null };
}

function assertBindingUnchanged(repository: string, binding: CandidateBinding): void {
  if (binding.kind === "worktree") {
    const current = captureRepositoryObjectSurface(repository).repository_object;
    if (!binding.repository_object || !sameRepositoryObject(binding.repository_object, current)) {
      throw new Error("worktree RepositoryObject changed during isolated generated verification");
    }
    return;
  }
  const current = externalIndexTree(repository);
  if (current !== binding.index_tree) throw new Error("Git index tree changed during staged generated verification");
}

export function verifyGeneratedCandidate(
  repository: string,
  kind: GeneratedCandidateKind,
): { readonly binding: CandidateBinding; readonly outputs: readonly OutputSignature[] } {
  const root = resolve(repository);
  const { binding, worktree_capture } = captureBinding(root, kind);
  const candidateRoot = mkdtempSync(join(tmpdir(), "mc-generated-candidate-"));
  try {
    if (kind === "worktree") materializeRepositoryObjectSurface(worktree_capture!, candidateRoot);
    else materializeStaged(root, candidateRoot, binding.index_tree!);
    const expected = outputSignatures(candidateRoot);
    const expectedManifest = readFileSync(join(candidateRoot, "MANIFEST.sha256"), "utf8");
    initializeCandidateGit(candidateRoot);
    copyIsolatedPnpmTree(join(root, "node_modules"), join(candidateRoot, "node_modules"));
    execFileSync("bun", ["run", "build:raw"], {
      cwd: candidateRoot,
      env: { ...productionBuildEnvironment(), MISTER_CLEAN_SOURCE_DEVELOPMENT: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const actual = outputSignatures(candidateRoot);
    const actualManifest = readFileSync(join(candidateRoot, "MANIFEST.sha256"), "utf8");
    assertSameOutputs(expected, actual, expectedManifest, actualManifest);
    assertBindingUnchanged(root, binding);
    return Object.freeze({ binding, outputs: actual });
  } finally {
    rmSync(candidateRoot, { recursive: true, force: true });
  }
}

function parseCandidate(args: readonly string[]): GeneratedCandidateKind {
  if (args.length !== 1 || !args[0]?.startsWith("--candidate=")) {
    throw new Error("usage: bun scripts/verify_generated_candidate.ts --candidate=worktree|staged");
  }
  const value = args[0].slice("--candidate=".length);
  if (value !== "worktree" && value !== "staged") throw new Error(`unsupported generated candidate ${value}`);
  return value;
}

if (import.meta.main) {
  const kind = parseCandidate(process.argv.slice(2));
  const result = verifyGeneratedCandidate(repositoryRoot(), kind);
  process.stdout.write(`generated candidate: PASS (${kind}; ${result.outputs.length} exact outputs)\n`);
}
