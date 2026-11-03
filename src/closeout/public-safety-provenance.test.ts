/**
 * Lane public-safety-provenance (charter/DONE/public-safety-provenance.md).
 *
 * The walk-based public-safety scan visits tracked, untracked and ignored
 * files alike. Each finding must say which it is, derived from Git and never
 * guessed, while the finding's fingerprint and value digest stay exactly what
 * they were before provenance existed.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";
import { receiptFindingsFromAudit } from "./finding-anchors.js";
import { scanPublicSafetySync, scanTrackedPublicSafetySync } from "./inspection.js";
import { trackedShippablePaths } from "./repository.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A planted home path; the test never asserts on its text, only on digests. */
const PLANTED_HOME = `/${"Users"}/provenance-fixture/`;
const PLANTED_LINE = `root=${PLANTED_HOME}project\n`;

function scratch(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `mister-clean-${name}-`));
  roots.push(root);
  return root;
}

function put(root: string, path: string, content: string): void {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), content, "utf8");
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** One tracked, one untracked and one ignored file, each holding the planted path. */
function threeProvenanceRepository(): string {
  const repository = join(scratch("ps-provenance"), "repo");
  createFixtureRepository(repository);
  put(repository, ".gitignore", "ignored/\n");
  put(repository, "tracked.txt", PLANTED_LINE);
  fixtureCommit(repository, "tracked bytes");
  put(repository, "untracked.txt", PLANTED_LINE);
  put(repository, "ignored/local.txt", PLANTED_LINE);
  return repository;
}

describe("proof 1 three-provenances: the walk scan labels tracked, untracked and ignored findings from Git", () => {
  it("reports one finding per file with its provenance and the matching counts", () => {
    const repository = threeProvenanceRepository();

    const result = scanPublicSafetySync(repository);

    expect(result.provenance_source).toBe("git");
    expect(result).not.toHaveProperty("provenance_unavailable_reason");
    expect(result.findings.map((finding) => [finding.path, finding.rule, finding.provenance])).toEqual([
      ["ignored/local.txt", "posix-home-path", "ignored"],
      ["tracked.txt", "posix-home-path", "tracked"],
      ["untracked.txt", "posix-home-path", "untracked"],
    ]);
    expect(result.provenance_counts).toEqual({ tracked: 1, untracked: 1, ignored: 1, unknown: 0 });
  });
});

describe("proof 2 fingerprint-unchanged: provenance never enters the fingerprint or the value digest", () => {
  it("keeps fingerprint = sha256(public_safety\\0rule\\0path\\0line) and value_sha256 = sha256(matched value)", () => {
    const repository = threeProvenanceRepository();

    const result = scanPublicSafetySync(repository);

    expect(result.findings).toHaveLength(3);
    for (const finding of result.findings) {
      expect(finding.fingerprint).toBe(sha256(`public_safety\0${finding.rule}\0${finding.path}\0${String(finding.line)}`));
      expect(finding.value_sha256).toBe(sha256(PLANTED_HOME));
    }
  });
});

describe("proof 3 tracked-scope-all-tracked: the tracked_shippable scan is tracked by construction", () => {
  it("labels every finding tracked with counts {n,0,0,0} and names the scope as its source", () => {
    const repository = threeProvenanceRepository();

    const result = scanTrackedPublicSafetySync(repository, trackedShippablePaths(repository));

    expect(result.scope).toBe("tracked_shippable");
    expect(result.provenance_source).toBe("scope");
    expect(result.findings.map((finding) => [finding.path, finding.provenance])).toEqual([["tracked.txt", "tracked"]]);
    expect(result.provenance_counts).toEqual({ tracked: result.findings.length, untracked: 0, ignored: 0, unknown: 0 });
  });
});

describe("proof 4 non-git-unknown: without Git the scan says unknown and why, never a guess", () => {
  it("labels every finding unknown with provenance_source unavailable and a typed reason", () => {
    const root = scratch("ps-no-git");
    put(root, "a.txt", PLANTED_LINE);
    put(root, "nested/b.txt", PLANTED_LINE);

    const result = scanPublicSafetySync(root);

    expect(result.findings).toHaveLength(2);
    expect(result.findings.map((finding) => finding.provenance)).toEqual(["unknown", "unknown"]);
    expect(result.provenance_source).toBe("unavailable");
    expect(result.provenance_unavailable_reason).toBe("not_a_git_repository");
    expect(result.provenance_counts).toEqual({ tracked: 0, untracked: 0, ignored: 0, unknown: 2 });
  });
});

describe("proof 5 existing-green: a walked result with provenance still derives receipt findings by the same fingerprint", () => {
  it("anchors each walked finding with legacy_fingerprint equal to the scan fingerprint", () => {
    const repository = threeProvenanceRepository();
    const result = scanPublicSafetySync(repository);

    const anchored = receiptFindingsFromAudit("public_safety", result, { repository });

    expect(anchored.map(({ finding }) => finding.legacy_fingerprint)).toEqual(result.findings.map((finding) => finding.fingerprint));
    expect(anchored.every(({ finding }) => finding.family === "public_safety")).toBe(true);
  });
});

/** Node's spawnSync default output buffer, which a raw listing would overflow. */
const NODE_DEFAULT_MAX_BUFFER = 1024 * 1024;
const COMPONENT = 225;
const ENTRIES_PER_LEAF = 400;
const LEAVES = 3;

function gitWithInput(repository: string, args: readonly string[], input: string): void {
  execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
}

describe("proof 6 bounded-listing: the tracked listing goes through the bounded Git helper", () => {
  it("labels a tracked finding from Git when `git ls-files -z` exceeds 1 MiB (index-only fixture)", () => {
    const repository = join(scratch("ps-large-index"), "repo");
    createFixtureRepository(repository);
    put(repository, "tracked.txt", PLANTED_LINE);
    fixtureCommit(repository, "one real tracked file");
    const emptyBlob = execFileSync("git", ["-C", repository, "hash-object", "-w", "--stdin"], {
      encoding: "utf8", input: "", stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    const entries: string[] = [];
    for (let leaf = 0; leaf < LEAVES; leaf += 1) {
      const directory = [`${"a".repeat(COMPONENT - 1)}${String(leaf)}`, "b".repeat(COMPONENT), "c".repeat(COMPONENT)].join("/");
      for (let index = 0; index < ENTRIES_PER_LEAF; index += 1) {
        entries.push(`${directory}/${"f".repeat(COMPONENT - 8)}${String(index).padStart(4, "0")}.txt`);
      }
    }
    gitWithInput(repository, ["update-index", "--add", "--index-info"], entries.map((path) => `100644 ${emptyBlob}\t${path}\n`).join(""));
    gitWithInput(repository, ["update-index", "--skip-worktree", "--stdin"], `${entries.join("\n")}\n`);
    const listingBytes = entries.reduce((total, path) => total + Buffer.byteLength(path, "utf8") + 1, 0);
    expect(listingBytes).toBeGreaterThan(NODE_DEFAULT_MAX_BUFFER);

    const result = scanPublicSafetySync(repository);

    expect(result.provenance_source).toBe("git");
    expect(result.findings.map((finding) => [finding.path, finding.provenance])).toEqual([["tracked.txt", "tracked"]]);
    expect(result.provenance_counts).toEqual({ tracked: 1, untracked: 0, ignored: 0, unknown: 0 });
  });
});
