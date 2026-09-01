import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { DirectiveId, IsoTimestamp, RepositoryId, RunId, Sha256 } from "../contracts/primitives.js";
import type { ManifestRevision, RemediationWaveManifest } from "../contracts/wave-directive.js";
import { canonicalJson, sha256Bytes, type RuntimeBoundReceipt } from "./authority.js";
import { LocalAuthorityEvidenceVerifier } from "./evidence.js";

const now = "2026-08-26T12:00:00.000Z" as IsoTimestamp;
const sha = (value: string): Sha256 => value.repeat(64) as Sha256;
const directiveId = "directive-1" as DirectiveId;

function revision(): ManifestRevision {
  const manifest = {
    manifest_id: "manifest-1",
    revision: 1,
    run_id: "run-1" as RunId,
    created_by: "controller",
    repository: {
      repository_id: "repo-1" as RepositoryId,
      branch: "work",
      commit: "abc",
      tree: "def",
      repository_object_sha256: sha("a"),
      observed_at: now,
    },
    lanes: [{ lane_id: "lane-1", owner: "agent-1", role: "writer" }],
  } as unknown as RemediationWaveManifest;
  return {
    manifest_id: "manifest-1" as never,
    revision: 1,
    parent_manifest_sha256: null,
    canonical_manifest: manifest,
    manifest_sha256: sha("f"),
  };
}

async function putRecord(path: string, value: unknown): Promise<Sha256> {
  const bytes = canonicalJson(value);
  await writeFile(path, bytes, "utf8");
  return sha256Bytes(bytes);
}

describe("local authority evidence", () => {
  it("validates custody and bytes and never lets delivery evidence imply acceptance", async () => {
    const root = await mkdtemp("/tmp/mc-evidence-");
    const actorRoot = join(root, "agent-1");
    await mkdir(actorRoot);
    try {
      const path = join(actorRoot, "delivery.json");
      const digest = await putRecord(path, {
        actor: "agent-1",
        claims: ["transport_delivered"],
        control_surface_id: "surface-1",
        directive_id: directiveId,
        run_id: "run-1",
        lane_id: "lane-1",
        manifest_id: "manifest-1",
        manifest_revision: 1,
        manifest_sha256: sha("f"),
        observed_at: now,
        record_type: "mister-clean.directive-state-evidence",
        repository_object_sha256: sha("a"),
        schema_version: "1.0",
        state: "delivered",
      });
      const verifier = new LocalAuthorityEvidenceVerifier({
        custody_roots: [root],
        actor_roots: { "agent-1": actorRoot },
      });
      const evidence = [{ path, sha256: digest, record_type: "mister-clean.directive-state-evidence" }];
      await expect(verifier.verifyDirective({
        state: "delivered",
        directive_id: directiveId,
        run_id: "run-1" as RunId,
        revision: revision(),
        repository: revision().canonical_manifest.repository,
        control_surface_id: "surface-1",
        evidence,
      })).resolves.toHaveLength(1);
      await expect(verifier.verifyDirective({
        state: "accepted",
        directive_id: directiveId,
        run_id: "run-1" as RunId,
        revision: revision(),
        repository: revision().canonical_manifest.repository,
        control_surface_id: "surface-1",
        evidence,
      })).rejects.toThrow(/not bound/);
      await expect(verifier.verifyDirective({
        state: "delivered",
        directive_id: directiveId,
        run_id: "run-1" as RunId,
        revision: revision(),
        repository: revision().canonical_manifest.repository,
        control_surface_id: "surface-1",
        evidence: [{ ...evidence[0]!, sha256: sha("0") }],
      })).rejects.toThrow(/digest/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("binds receipt claims and actor identity to actor-custodied bytes", async () => {
    const root = await mkdtemp("/tmp/mc-receipt-evidence-");
    const actorRoot = join(root, "holdout-agent");
    await mkdir(actorRoot);
    try {
      const path = join(actorRoot, "receipt.json");
      const output = { ...revision().canonical_manifest.repository, repository_object_sha256: sha("9") };
      const digest = await putRecord(path, {
        actor: "holdout-agent",
        baseline_repository_object_sha256: sha("a"),
        claims: ["verified"],
        conclusion: "pass",
        directive_id: directiveId,
        manifest_id: "manifest-1",
        manifest_revision: 1,
        manifest_sha256: sha("f"),
        observed_at: now,
        output_repository_object_sha256: sha("9"),
        receipt_id: "receipt-1",
        run_id: "run-1",
        record_type: "mister-clean.receipt-evidence",
        role: "holdout",
        schema_version: "1.0",
      });
      const receipt: RuntimeBoundReceipt = {
        receipt_id: "receipt-1",
        state: "verified",
        run_id: "run-1",
        manifest_id: "manifest-1",
        manifest_revision: 1,
        manifest_sha256: sha("f"),
        baseline_repository: revision().canonical_manifest.repository,
        output_repository: output,
        role: "holdout",
        actor: "holdout-agent",
        claims: ["verified"],
        conclusion: "pass",
        sealed_at: now,
        evidence: [{ path, sha256: digest, record_type: "mister-clean.receipt-evidence" }],
      };
      const verifier = new LocalAuthorityEvidenceVerifier({ custody_roots: [root], actor_roots: { "holdout-agent": actorRoot } });
      await expect(verifier.verifyReceipt({ directive_id: directiveId, run_id: "run-1" as RunId, revision: revision(), receipt })).resolves.toHaveLength(1);
      await expect(verifier.verifyReceipt({
        directive_id: directiveId,
        run_id: "run-1" as RunId,
        revision: revision(),
        receipt: { ...receipt, claims: ["verified", "no_harm"] },
      })).rejects.toThrow(/claims/);
      await expect(verifier.verifyReceipt({ directive_id: directiveId, run_id: "run-other" as RunId, revision: revision(), receipt })).rejects.toThrow(/not bound/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
