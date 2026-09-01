import { describe, expect, it } from "vitest";

import type { CloseoutClaim, SourceDescriptor } from "../contracts/import-provenance.js";
import { classifySource } from "./classification.js";

const source = (overrides: Partial<SourceDescriptor> = {}): SourceDescriptor => ({
  source_class: "tracked_machine_contract",
  trust_tier: "authoritative",
  kind: "receipt",
  artifact_digest: {
    algorithm: "sha256",
    sha256: "a".repeat(64),
    byte_length: 42,
  },
  locator: {
    repository_relative_path: "history/receipt.json",
  },
  byte_ref: { content_id: "a".repeat(64), byte_length: 42, store: "immutable_content_addressed", local_ref: `sqlite:import_byte_vault/${"a".repeat(64)}` },
  census_evidence: { census_sha256: "c".repeat(64), repository_object_sha256: "2".repeat(64), repository_relative_path: "history/receipt.json", tracking_state: "tracked", declared_artifact_role: "machine_contract" },
  ...overrides,
});

const claim = (status: CloseoutClaim["status"]): CloseoutClaim => ({
  status,
  verification: "unverified",
  basis: "historical import",
});

describe("source classification", () => {
  it("quarantines fixture and template receipts even if they look authoritative", () => {
    expect(classifySource({
      source: source({ source_class: "fixture_template", kind: "fixture", locator: { repository_relative_path: "templates/receipt.json" }, census_evidence: { census_sha256: "c".repeat(64), repository_object_sha256: "2".repeat(64), repository_relative_path: "templates/receipt.json", tracking_state: "tracked", declared_artifact_role: "fixture_template" } }),
      closeout_claim: claim("no_claim"),
      evidence_handling: "considered",
    })).toEqual({
      disposition: "quarantined",
      reasons: ["fixture_or_template_source"],
    });
  });

  it("rejects ignored evidence that tries to claim closure", () => {
    expect(() => classifySource({
      source: source(),
      closeout_claim: claim("claims_closed"),
      evidence_handling: "ignored",
    })).toThrow(/Ignored evidence/);
  });
});
