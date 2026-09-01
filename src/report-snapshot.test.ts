import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// The report renderer is intentionally plain ESM so Bun can run it without a build step.
// @ts-expect-error no declaration file is shipped for this local renderer module
const { publishedScorecard, writeReceiptManifest } = await import("../scripts/report_snapshot.mjs");

function git(repository: string, ...args: string[]): string {
  return execFileSync("/usr/bin/git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
}

describe("model-evidence report snapshots", () => {
  it("preserves mutable evidence bytes and fails closed on unbound identity", async () => {
    const repository = await mkdtemp(join(tmpdir(), "mister-clean-scorecard-repository-"));
    const assetRoot = await mkdtemp(join(tmpdir(), "mister-clean-scorecard-assets-"));
    const evidenceDirectory = join("/tmp", `mister-clean-scorecard-evidence-${process.pid}`);
    const evidencePath = join(evidenceDirectory, "nested", "verdict.md");
    try {
      git(repository, "init", "-q");
      git(repository, "config", "user.email", ["fixture", "example.invalid"].join("@"));
      git(repository, "config", "user.name", "Fixture");
      await writeFile(join(repository, "README.md"), "fixture\n");
      git(repository, "add", "README.md");
      git(repository, "commit", "-qm", "fixture");
      git(repository, "remote", "add", "origin", "https://example.invalid/fixture.git");
      const commit = git(repository, "rev-parse", "HEAD");
      await mkdir(join(evidenceDirectory, "nested"), { recursive: true });
      await writeFile(evidencePath, "first receipt body\n");

      const raw = {
        snapshot: {
          campaign: "Fixture campaign",
          generatedAt: "2026-08-26T00:00:00Z",
          targetRepository: "Fixture",
          targetRepositoryRemote: "https://example.invalid/fixture.git",
          targetRepositoryPath: repository,
          targetCommit: commit,
          sourceDocument: "fixture-scorecard.json",
        },
        coverage: null,
        tuples: [{
          id: "fixture-tuple",
          band: "insufficient",
          taskClasses: ["review"],
          evidence: [evidencePath, `${commit.slice(0, 8)} · candidate`],
        }],
      };
      const scorecard = publishedScorecard(raw, { "fixture-scorecard.json": "a".repeat(64) });
      expect(scorecard.snapshot.targetRepositoryPath).toBeUndefined();
      expect(scorecard.coverage).toMatchObject({ configuredTupleCount: null, observedTupleCount: 1, universeStatus: "not_frozen" });

      const first = writeReceiptManifest(assetRoot, scorecard, { repositoryPath: repository });
      const firstManifest = JSON.parse(await readFile(first.path, "utf8"));
      const firstEvidence = firstManifest.entries.find((entry: Record<string, unknown>) => entry.content_sha256);
      expect(firstManifest.target_commit).toBe(commit);
      expect(firstManifest.target_repository_remote).toBe("https://example.invalid/fixture.git");
      expect(firstManifest.target_repository_url).toBe("https://example.invalid/fixture");
      expect(firstManifest.target_commit_url).toBe(`https://example.invalid/fixture/commit/${commit}`);
      expect(firstManifest.binding_summary).toEqual({ total: 2, content_or_commit_bound: 2, assertion_only: 0 });
      expect(firstEvidence.evidence_object).toMatch(/^\.\/objects\/[0-9a-f]{64}\.md$/);
      expect(firstEvidence.locator).toBeUndefined();
      expect(firstEvidence.source_name).toBe(evidencePath.split("/").at(-1));
      expect(existsSync(join(assetRoot, "receipts", firstEvidence.evidence_object))).toBe(true);

      await writeFile(evidencePath, "replacement receipt body\n");
      const second = writeReceiptManifest(assetRoot, scorecard, { repositoryPath: repository });
      const secondManifest = JSON.parse(await readFile(second.path, "utf8"));
      expect(second.digest).not.toBe(first.digest);
      expect(secondManifest.entries[0].receipt_id).not.toBe(firstManifest.entries[0].receipt_id);
      const index = JSON.parse(await readFile(join(assetRoot, "receipts", "index.json"), "utf8"));
      expect(index.manifests).toHaveLength(2);
      expect(index.manifests.filter((entry: { current: boolean }) => entry.current)).toHaveLength(1);

      const unbound = structuredClone(scorecard);
      unbound.tuples[0].evidence = ["descriptive evidence with no binding"];
      expect(() => writeReceiptManifest(assetRoot, unbound, { repositoryPath: repository })).toThrow(/explicitly labeled assertion-only/);

      const partialTarget = structuredClone(scorecard);
      partialTarget.snapshot.targetCommit = commit.slice(0, 8);
      expect(() => writeReceiptManifest(assetRoot, partialTarget, { repositoryPath: repository })).toThrow(/full 40-character commit SHA/);
    } finally {
      await rm(repository, { recursive: true, force: true });
      await rm(assetRoot, { recursive: true, force: true });
      await rm(evidenceDirectory, { recursive: true, force: true });
    }
  });
});
