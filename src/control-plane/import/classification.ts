import {
  type CloseoutClaim,
  type ImportDisposition,
  type SourceDescriptor,
  ImportContractError,
  parseImportSchema,
  sourceDescriptorSchema,
} from "../contracts/import-provenance.js";

export interface SourceClassificationInput {
  readonly source: SourceDescriptor;
  readonly closeout_claim: CloseoutClaim;
  readonly evidence_handling: "considered" | "ignored" | "unknown";
}

export interface SourceClassificationResult {
  readonly disposition: ImportDisposition;
  readonly reasons: readonly string[];
}

const authoritativeKinds = new Set<SourceDescriptor["kind"]>([
  "attestation",
  "receipt",
  "repository_snapshot",
]);

const lowTrustKinds = new Set<SourceDescriptor["kind"]>([
  "chat_transcript",
  "other",
]);

export function classifySource(input: SourceClassificationInput): SourceClassificationResult {
  const source = parseImportSchema(sourceDescriptorSchema, input.source, "source");
  const reasons: string[] = [];
  if (source.source_class === "fixture_template" || source.source_class === "ignored_local_quarantine") {
    reasons.push(source.source_class === "fixture_template" ? "fixture_or_template_source" : "ignored_local_quarantine_source");
    return { disposition: "quarantined", reasons };
  }
  if (source.source_class === "tracked_narrative_observation") {
    reasons.push("tracked_narrative_observation");
    return { disposition: "evidence_only", reasons };
  }
  if (input.evidence_handling === "ignored" && input.closeout_claim.status === "claims_closed") {
    throw new ImportContractError(
      "SOURCE_REJECTED",
      "Ignored evidence cannot establish a closeout claim",
    );
  }
  if (source.trust_tier === "unverified" || lowTrustKinds.has(source.kind)) {
    reasons.push("unverified_or_low_trust_source");
    return { disposition: "evidence_only", reasons };
  }
  if (authoritativeKinds.has(source.kind) && source.trust_tier !== "authoritative") {
    reasons.push("kind_tier_mismatch");
    return { disposition: "evidence_only", reasons };
  }
  reasons.push("validated_structural_source");
  return { disposition: "normalized", reasons };
}
