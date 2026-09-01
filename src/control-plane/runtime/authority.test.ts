import { describe, expect, it } from "vitest";

import { canonicalJson, parseCanonicalManifest, parseCanonicalReceipt, sha256Bytes } from "./authority.js";
import { TEST_NOW as now, testSha as sha, validManifestValue } from "./test-fixture.js";


describe("canonical authority records", () => {
  it("accepts only full canonical manifest bytes", () => {
    const manifest = validManifestValue();
    const canonical = canonicalJson(manifest);
    expect(parseCanonicalManifest(canonical)).toEqual(manifest);
    expect(() => parseCanonicalManifest(JSON.stringify(manifest))).toThrow(/canonical/);
    const incomplete = { ...manifest } as Record<string, unknown>;
    delete incomplete.excluded_actions;
    expect(() => parseCanonicalManifest(canonicalJson(incomplete))).toThrow();
    expect(sha256Bytes(canonical)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("requires explicit baseline and output objects in canonical receipts", () => {
    const manifest = validManifestValue();
    const receipt = {
      receipt_id: "receipt-1",
      state: "verified",
      run_id: manifest.run_id,
      manifest_id: manifest.manifest_id,
      manifest_revision: manifest.revision,
      manifest_sha256: sha("2"),
      baseline_repository: manifest.repository,
      output_repository: { ...manifest.repository, repository_object_sha256: sha("9") },
      role: "holdout",
      actor: "holdout-agent",
      claims: ["verified"],
      conclusion: "pass",
      sealed_at: now,
      evidence: [{ path: "receipt-evidence.json", sha256: sha("3"), record_type: "mister-clean.receipt-evidence" }],
    };
    expect(parseCanonicalReceipt(canonicalJson(receipt))).toEqual(receipt);
    const ambiguous = { ...receipt } as Record<string, unknown>;
    delete ambiguous.output_repository;
    expect(() => parseCanonicalReceipt(canonicalJson(ambiguous))).toThrow();
  });

  it("rejects duplicate receipt roles in canonical manifest authority bytes", () => {
    const manifest = validManifestValue();
    const duplicate = {
      ...manifest,
      receipt_requirements: [
        ...manifest.receipt_requirements,
        { role: "holdout", independent: true, required_claims: ["no_harm"] },
      ],
    };
    expect(() => parseCanonicalManifest(canonicalJson(duplicate))).toThrow(/duplicate receipt requirement role/);
  });

  it("rejects prose-only custody for protected read paths", () => {
    const manifest = validManifestValue();
    const lane = manifest.lanes[0]!;
    const invalid = {
      ...manifest,
      lanes: [{
        ...lane,
        read_custody: { ...lane.read_custody, enforcement: "not_applicable", evidence: [] },
      }],
    };
    expect(() => parseCanonicalManifest(canonicalJson(invalid))).toThrow(/protected read paths require mechanical enforcement/);
  });

  it("requires the protected path set to be explicit when custody is enforced", () => {
    const manifest = validManifestValue();
    const lane = manifest.lanes[0]!;
    const invalid = {
      ...manifest,
      lanes: [{
        ...lane,
        read_custody: { ...lane.read_custody, protected_paths: [] },
      }],
    };
    expect(() => parseCanonicalManifest(canonicalJson(invalid))).toThrow(/enforcement requires an explicit protected path set/);
  });
});
