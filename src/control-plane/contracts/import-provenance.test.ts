import { describe, expect, it } from "vitest";

import {
  UNKNOWN_AGENT_FIELD,
  frozenRepositoryCensusV11Schema,
  importObservedRecordSchema,
  knownNowInterpretationSchema,
  sourceDescriptorSchema,
  parseImportSchema,
  sourceLocatorSchema,
  agentIdentitySchema,
} from "./import-provenance.js";
import { canonicalJson, sha256Bytes } from "../runtime/authority.js";
import { verifyFrozenCensusBinding } from "../import/census.js";

describe("import provenance contracts", () => {
  const contentBoundCensus = () => {
    const bytes = "content-bound report\n";
    const path = "history/report.md";
    const byteLength = new TextEncoder().encode(bytes).byteLength;
    const artifactSha256 = sha256Bytes(bytes);
    return {
      record_type: "mister-clean.repository-census" as const,
      schema_version: "1.1" as const,
      repository_object_sha256: "2".repeat(64),
      algorithm_id: "mister-clean.file-census.sha256-path-stream" as const,
      algorithm_version: "1.0" as const,
      scope: {
        roots: ["history"], recursive: true as const, direct_files: "included" as const,
        entry_kind: "regular_file" as const, symlinks: "reject" as const,
        special_files: "reject" as const, exclusions: [] as string[],
      },
      summary: {
        file_count: 1, direct_file_count: 1, nested_file_count: 0,
        total_bytes: byteLength,
        aggregate_sha256: sha256Bytes(`${artifactSha256}  ${path}\n`),
      },
      entries: [{
        repository_relative_path: path,
        tracking_state: "tracked" as const,
        declared_artifact_role: "machine_contract" as const,
        byte_length: byteLength,
        sha256: artifactSha256,
      }],
      artifact: { bytes, path, byteLength, sha256: artifactSha256 },
    };
  };

  it("applies the full canonical census binding before granting content-bound authority", () => {
    const valid = contentBoundCensus();
    const { artifact, ...validRecord } = valid;
    expect(() => parseImportSchema(frozenRepositoryCensusV11Schema, validRecord, "valid content census"))
      .not.toThrow();

    const overlapping = structuredClone(validRecord);
    overlapping.scope.roots = ["history", "history/archive"];
    expect(() => parseImportSchema(frozenRepositoryCensusV11Schema, overlapping, "overlapping roots"))
      .toThrow(/measured roots must not overlap/);

    const outsideExclusion = structuredClone(validRecord);
    outsideExclusion.scope.exclusions = ["outside"];
    expect(() => parseImportSchema(frozenRepositoryCensusV11Schema, outsideExclusion, "outside exclusion"))
      .toThrow(/outside every measured root/);

    const outsideEntry = structuredClone(validRecord);
    outsideEntry.entries[0]!.repository_relative_path = "outside/report.md";
    outsideEntry.summary.direct_file_count = 0;
    outsideEntry.summary.nested_file_count = 1;
    outsideEntry.summary.aggregate_sha256 = sha256Bytes(`${artifact.sha256}  outside/report.md\n`);
    expect(() => parseImportSchema(frozenRepositoryCensusV11Schema, outsideEntry, "outside entry"))
      .toThrow(/outside every measured root/);

    const excludedEntry = structuredClone(validRecord);
    excludedEntry.scope.exclusions = [artifact.path];
    expect(() => parseImportSchema(frozenRepositoryCensusV11Schema, excludedEntry, "excluded entry"))
      .toThrow(/excluded by census scope/);

    const invalidBytes = canonicalJson(excludedEntry);
    expect(() => verifyFrozenCensusBinding({
      census_bytes: invalidBytes,
      census_evidence: {
        census_sha256: sha256Bytes(invalidBytes),
        repository_object_sha256: validRecord.repository_object_sha256,
        repository_relative_path: artifact.path,
        tracking_state: "tracked",
        declared_artifact_role: "machine_contract",
      },
      locator: { repository_relative_path: artifact.path },
      import_repository_object: {
        record_type: "mister-clean.repository-object",
        schema_version: "1.0",
        head_commit: "live123",
        surface: "tracked_and_nonignored",
        entry_count: 1,
        sha256: validRecord.repository_object_sha256,
      },
      artifact_digest: { algorithm: "sha256", sha256: artifact.sha256, byte_length: artifact.byteLength },
    })).toThrow(/excluded by census scope/);
  });

  it("rejects invalid source line spans and unsafe repository-relative paths", () => {
    expect(() => parseImportSchema(sourceLocatorSchema, {
      repository_relative_path: "records/history.json",
      line_span: { start: 12, end: 11 },
    }, "locator")).toThrow(/line span end/);

    expect(() => parseImportSchema(sourceLocatorSchema, {
      repository_relative_path: "../records/history.json",
    }, "locator")).toThrow(/path must not contain empty, '\.' or '\.\.' segments/);
  });

  it("requires explicit UNKNOWN agent tuple fields instead of omission or guessing", () => {
    expect(() => parseImportSchema(agentIdentitySchema, {
      agent_tuple_id: "tuple-1",
      model_id: "model-1",
      harness_id: "harness-1",
      display_name: "Agent",
    }, "agent")).toThrow(/reasoning_level/);

    expect(parseImportSchema(agentIdentitySchema, {
      agent_tuple_id: UNKNOWN_AGENT_FIELD,
      model_id: UNKNOWN_AGENT_FIELD,
      harness_id: UNKNOWN_AGENT_FIELD,
      reasoning_level: UNKNOWN_AGENT_FIELD,
      display_name: UNKNOWN_AGENT_FIELD,
    }, "agent")).toEqual({
      agent_tuple_id: "UNKNOWN",
      model_id: "UNKNOWN",
      harness_id: "UNKNOWN",
      reasoning_level: "UNKNOWN",
      display_name: "UNKNOWN",
    });
  });

  it("rejects fixture-normalized and narrative-paid combinations at the direct schema boundary", () => {
    const bytes = "fixture";
    const source = {
      source_class: "fixture_template" as const,
      trust_tier: "authoritative" as const,
      kind: "fixture" as const,
      artifact_digest: { algorithm: "sha256" as const, sha256: sha256Bytes(bytes), byte_length: bytes.length },
      byte_ref: { content_id: sha256Bytes(bytes), byte_length: bytes.length, store: "immutable_content_addressed" as const, local_ref: `sqlite:import_byte_vault/${sha256Bytes(bytes)}` },
      census_evidence: { census_sha256: "c".repeat(64), repository_object_sha256: "2".repeat(64), repository_relative_path: "fixtures/x.json", tracking_state: "tracked" as const, declared_artifact_role: "fixture_template" as const },
      locator: { repository_relative_path: "fixtures/x.json" },
    };
    const base = {
      record_type: "mister-clean.import-observed" as const, schema_version: "1.0" as const,
      observed_at: "2026-08-26T12:00:00.000Z", source, parser: { parser_identity: "p", parser_version: "1", extraction_rule: "r", confidence: 1 },
      subject_binding: {
        artifact_observed_subject: { repository_id: "r", branch: "main", commit: "c", tree: "t", repository_object_sha256: "1".repeat(64), observed_at: "2026-08-26T12:00:00.000Z" },
        import_repository_object: { record_type: "mister-clean.repository-object" as const, schema_version: "1.0" as const, head_commit: "c", surface: "tracked_and_nonignored" as const, entry_count: 1, sha256: "2".repeat(64) },
      }, disposition: "normalized" as const, evidence_handling: "considered" as const,
      observed_agent: { agent_tuple_id: "UNKNOWN", model_id: "UNKNOWN", harness_id: "UNKNOWN", reasoning_level: "UNKNOWN", display_name: "UNKNOWN" },
      closeout_claim: { status: "claims_closed" as const, verification: "unverified" as const, basis: "CLOSED" }, declared_payment_state: "paid" as const,
    };
    expect(() => parseImportSchema(importObservedRecordSchema, { ...base, content_id: sha256Bytes(canonicalJson(base)) }, "fixture record")).toThrow();
    expect(() => parseImportSchema(sourceDescriptorSchema, { ...source, source_class: "tracked_narrative_observation", kind: "report", census_evidence: { ...source.census_evidence, declared_artifact_role: "narrative_observation" } }, "narrative source")).not.toThrow();
  });

  it("prevents direct schema parsing from forging observed closure or known-now payment", () => {
    const bytes = "report";
    const source = {
      source_class: "tracked_machine_contract" as const,
      trust_tier: "first_party" as const,
      kind: "report" as const,
      artifact_digest: { algorithm: "sha256" as const, sha256: sha256Bytes(bytes), byte_length: bytes.length },
      byte_ref: { content_id: sha256Bytes(bytes), byte_length: bytes.length, store: "immutable_content_addressed" as const, local_ref: `sqlite:import_byte_vault/${sha256Bytes(bytes)}` },
      census_evidence: { census_sha256: "c".repeat(64), repository_object_sha256: "2".repeat(64), repository_relative_path: "history/report.md", tracking_state: "tracked" as const, declared_artifact_role: "machine_contract" as const },
      locator: { repository_relative_path: "history/report.md" },
    };
    const subject_binding = {
      artifact_observed_subject: { repository_id: "r", branch: "main", commit: "c", tree: "t", repository_object_sha256: "1".repeat(64), observed_at: "2026-08-26T12:00:00.000Z" },
      import_repository_object: { record_type: "mister-clean.repository-object" as const, schema_version: "1.0" as const, head_commit: "c", surface: "tracked_and_nonignored" as const, entry_count: 1, sha256: "2".repeat(64) },
    };
    const observedContent = {
      record_type: "mister-clean.import-observed" as const, schema_version: "1.0" as const,
      observed_at: "2026-08-26T12:00:00.000Z", source,
      parser: { parser_identity: "p", parser_version: "1", extraction_rule: "r", confidence: 1 },
      subject_binding, disposition: "normalized" as const, evidence_handling: "considered" as const,
      observed_agent: { agent_tuple_id: "UNKNOWN", model_id: "UNKNOWN", harness_id: "UNKNOWN", reasoning_level: "UNKNOWN", display_name: "UNKNOWN" },
      closeout_claim: { status: "no_claim" as const, verification: "unverified" as const, basis: "prose only" }, declared_payment_state: "unknown" as const,
    };
    const observed = { ...observedContent, content_id: sha256Bytes(canonicalJson(observedContent)) };
    expect(() => parseImportSchema(importObservedRecordSchema, observed, "honest observed record")).not.toThrow();
    const forgedObservedContent = { ...observedContent, closeout_claim: { status: "claims_closed" as const, verification: "unverified" as const, basis: "report says closed" } };
    expect(() => parseImportSchema(importObservedRecordSchema, {
      ...forgedObservedContent, content_id: sha256Bytes(canonicalJson(forgedObservedContent)),
    }, "forged observed closure")).toThrow(/authority transition/i);

    const knownContent = {
      record_type: "mister-clean.import-known-now" as const, schema_version: "1.0" as const,
      interpreted_at: "2026-08-26T13:00:00.000Z", observed_record_sha256: sha256Bytes(canonicalJson(observed)),
      source, subject_binding, payment_state: "paid" as const,
      closeout_claim: { status: "no_claim" as const, verification: "unverified" as const, basis: "no authority transition" },
      authority_transitions: [], subject_alignment: "different_repository_object" as const,
    };
    expect(() => parseImportSchema(knownNowInterpretationSchema, {
      ...knownContent, content_id: sha256Bytes(canonicalJson(knownContent)),
    }, "forged known-now payment")).toThrow(/derived from authority transitions/i);
  });
});
