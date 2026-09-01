import { describe, expect, it } from "vitest";

import {
  UNKNOWN_AGENT_FIELD,
  parseImportSchema,
  repositorySubjectSchema,
} from "../contracts/import-provenance.js";
import { canonicalJson, sha256Bytes } from "../runtime/authority.js";
import {
  appendObservedThenKnownNow,
  buildKnownNowInterpretation,
  buildObservedRecord,
  closeoutClaimDoesNotImplyPayment,
} from "./records.js";

const census = canonicalJson({
  record_type: "mister-clean.repository-census", schema_version: "1.0", repository_object_sha256: "2".repeat(64),
  entries: [
    { repository_relative_path: "history/closeout.md", tracking_state: "tracked", declared_artifact_role: "machine_contract" },
    { repository_relative_path: "templates/closeout.md", tracking_state: "tracked", declared_artifact_role: "fixture_template" },
  ],
});

const source = {
  source_class: "tracked_machine_contract" as const,
  trust_tier: "first_party" as const,
  kind: "report" as const,
  census_evidence: {
    census_sha256: sha256Bytes(census),
    repository_object_sha256: "2".repeat(64),
    repository_relative_path: "history/closeout.md",
    tracking_state: "tracked" as const,
    declared_artifact_role: "machine_contract" as const,
  },
  locator: {
    repository_relative_path: "history/closeout.md",
    section: "summary",
  },
};

const subjectBinding = {
  artifact_observed_subject: {
    repository_id: "repo-1",
    branch: "main",
    commit: "abc123",
    tree: "def456",
    repository_object_sha256: "1".repeat(64),
    observed_at: "2026-08-26T12:00:00.000Z",
  },
  import_repository_object: {
    record_type: "mister-clean.repository-object" as const,
    schema_version: "1.0" as const,
    head_commit: "live456",
    surface: "tracked_and_nonignored" as const,
    entry_count: 9,
    sha256: "2".repeat(64),
  },
};

const observed = () => buildObservedRecord({
  observed_at: "2026-08-26T12:00:00.000Z",
  source,
  artifact_bytes: "artifact bytes",
  census_bytes: census,
  parser: {
    parser_identity: "historical-import",
    parser_version: "1.0.0",
    extraction_rule: "exact-field-extraction",
    confidence: 1,
  },
  subject_binding: subjectBinding,
  evidence_handling: "considered",
  observed_agent: {
    agent_tuple_id: UNKNOWN_AGENT_FIELD,
    model_id: UNKNOWN_AGENT_FIELD,
    harness_id: UNKNOWN_AGENT_FIELD,
    reasoning_level: UNKNOWN_AGENT_FIELD,
    display_name: UNKNOWN_AGENT_FIELD,
  },
  closeout_claim: {
    status: "no_claim",
    verification: "unverified",
    basis: "Imported prose is not authority",
  },
  declared_payment_state: "unknown",
});

describe("observed and known-now import records", () => {
  it("binds producer census 1.1 to the exact imported bytes and rejects same-path drift", () => {
    const artifactBytes = "artifact bytes";
    const artifactSha = sha256Bytes(artifactBytes);
    const contentBoundCensus = canonicalJson({
      record_type: "mister-clean.repository-census",
      schema_version: "1.1",
      repository_object_sha256: "2".repeat(64),
      algorithm_id: "mister-clean.file-census.sha256-path-stream",
      algorithm_version: "1.0",
      scope: {
        roots: ["history"], recursive: true, direct_files: "included", entry_kind: "regular_file",
        symlinks: "reject", special_files: "reject", exclusions: [],
      },
      summary: {
        file_count: 1, direct_file_count: 1, nested_file_count: 0,
        total_bytes: new TextEncoder().encode(artifactBytes).byteLength,
        aggregate_sha256: sha256Bytes(`${artifactSha}  history/closeout.md\n`),
      },
      entries: [{
        repository_relative_path: "history/closeout.md",
        tracking_state: "tracked",
        declared_artifact_role: "machine_contract",
        byte_length: new TextEncoder().encode(artifactBytes).byteLength,
        sha256: artifactSha,
      }],
    });
    const contentBoundSource = {
      ...source,
      census_evidence: { ...source.census_evidence, census_sha256: sha256Bytes(contentBoundCensus) },
    };
    const input = {
      observed_at: "2026-08-26T12:00:00.000Z",
      source: contentBoundSource,
      artifact_bytes: artifactBytes,
      census_bytes: contentBoundCensus,
      parser: { parser_identity: "historical-import", parser_version: "1.0.0", extraction_rule: "exact-field-extraction", confidence: 1 },
      subject_binding: subjectBinding,
      evidence_handling: "considered" as const,
      observed_agent: { agent_tuple_id: UNKNOWN_AGENT_FIELD, model_id: UNKNOWN_AGENT_FIELD, harness_id: UNKNOWN_AGENT_FIELD, reasoning_level: UNKNOWN_AGENT_FIELD, display_name: UNKNOWN_AGENT_FIELD },
      closeout_claim: { status: "no_claim" as const, verification: "unverified" as const, basis: "Imported prose is not authority" },
      declared_payment_state: "unknown" as const,
    };
    expect(() => buildObservedRecord(input)).not.toThrow();
    expect(() => buildObservedRecord({ ...input, artifact_bytes: "changed bytes" })).toThrow(/content-bound frozen census entry/);
  });

  it("downgrades legacy 1.0 census imports to evidence_only instead of normalized authority", () => {
    const record = observed();
    expect(record.disposition).toBe("evidence_only");
    expect(record.notes).toMatch(/legacy repository census 1\.0/i);
  });

  it("requires bytes and refuses caller-only digest metadata", () => {
    expect(() => buildObservedRecord({
      observed_at: "2026-08-26T12:00:00.000Z", source, census_bytes: census, parser: {
        parser_identity: "historical-import", parser_version: "1.0.0", extraction_rule: "exact-field-extraction", confidence: 1,
      }, subject_binding: subjectBinding, evidence_handling: "considered", observed_agent: {
        agent_tuple_id: UNKNOWN_AGENT_FIELD, model_id: UNKNOWN_AGENT_FIELD, harness_id: UNKNOWN_AGENT_FIELD, reasoning_level: UNKNOWN_AGENT_FIELD, display_name: UNKNOWN_AGENT_FIELD,
      }, closeout_claim: { status: "no_claim", verification: "unverified", basis: "none" }, declared_payment_state: "unknown",
    })).toThrow(/bytes|byte-store/);
  });
  it("keeps prose CLOSED distinct from paid", () => {
    expect(closeoutClaimDoesNotImplyPayment({
      status: "claims_closed",
      verification: "unverified",
      basis: "Artifact says CLOSED",
    }, "unknown")).toEqual({
      disposition: "evidence_only",
      payment_state: "unknown",
    });
    expect(() => observed()).not.toThrow();
    expect(() => buildObservedRecord({
      observed_at: "2026-08-26T12:00:00.000Z", source, artifact_bytes: "artifact bytes", census_bytes: census,
      parser: { parser_identity: "historical-import", parser_version: "1.0.0", extraction_rule: "exact-field-extraction", confidence: 1 },
      subject_binding: subjectBinding, evidence_handling: "considered",
      observed_agent: { agent_tuple_id: UNKNOWN_AGENT_FIELD, model_id: UNKNOWN_AGENT_FIELD, harness_id: UNKNOWN_AGENT_FIELD, reasoning_level: UNKNOWN_AGENT_FIELD, display_name: UNKNOWN_AGENT_FIELD },
      closeout_claim: { status: "claims_closed", verification: "unverified", basis: "report says CLOSED" },
      declared_payment_state: "unknown",
    })).toThrow(/authority|claims_closed/i);
    expect(() => closeoutClaimDoesNotImplyPayment({ status: "no_claim", verification: "unverified", basis: "none" }, "paid")).toThrow(/authority/i);
  });

  it("rejects observed/import subject conflation", () => {
    const conflated = {
      record_type: "mister-clean.repository-object",
      schema_version: "1.0",
      head_commit: "abc",
      surface: "tracked_and_nonignored",
      entry_count: 2,
      sha256: "3".repeat(64),
    };
    expect(() => parseImportSchema(repositorySubjectSchema, conflated, "artifact observed subject")).toThrow();
  });

  it("appends observed-then-known-now records with digest binding", () => {
    const observedRecord = observed();
    const knownNow = buildKnownNowInterpretation({
      interpreted_at: "2026-08-26T12:30:00.000Z",
      observed_record: observedRecord,
      payment_state: "unknown",
    });
    const history = appendObservedThenKnownNow({ observed: [], known_now: [] }, observedRecord, knownNow);
    expect(history.observed).toHaveLength(1);
    expect(history.known_now).toHaveLength(1);
    expect(history.known_now[0]?.subject_alignment).toBe("different_repository_object");
  });

  it("rejects quarantined artifacts from live history", () => {
    const quarantined = buildObservedRecord({
      observed_at: "2026-08-26T12:00:00.000Z",
      source: { ...source, source_class: "fixture_template", kind: "fixture", locator: { repository_relative_path: "templates/closeout.md" }, census_evidence: { ...source.census_evidence, repository_relative_path: "templates/closeout.md", declared_artifact_role: "fixture_template" } },
      artifact_bytes: "fixture bytes", census_bytes: census, parser: { parser_identity: "historical-import", parser_version: "1.0.0", extraction_rule: "exact-field-extraction", confidence: 1 },
      subject_binding: subjectBinding, evidence_handling: "considered", observed_agent: { agent_tuple_id: UNKNOWN_AGENT_FIELD, model_id: UNKNOWN_AGENT_FIELD, harness_id: UNKNOWN_AGENT_FIELD, reasoning_level: UNKNOWN_AGENT_FIELD, display_name: UNKNOWN_AGENT_FIELD },
      closeout_claim: { status: "no_claim", verification: "unverified", basis: "fixture" }, declared_payment_state: "unknown",
    });
    const known = buildKnownNowInterpretation({ interpreted_at: "2026-08-26T12:30:00.000Z", observed_record: quarantined, payment_state: "unknown" });
    expect(() => appendObservedThenKnownNow({ observed: [], known_now: [] }, quarantined, known)).toThrow(/quarantined|rejected/i);
  });

  it("rejects duplicate appends and protects nested source state", () => {
    const first = observed();
    const known = buildKnownNowInterpretation({ interpreted_at: "2026-08-26T12:30:00.000Z", observed_record: first, payment_state: "unknown" });
    const history = appendObservedThenKnownNow({ observed: [], known_now: [] }, first, known);
    expect(() => appendObservedThenKnownNow(history, first, known)).toThrow(/Duplicate/);
    expect(Object.isFrozen(history.observed[0]?.source)).toBe(true);
  });

  it("rejects parser/time duplicate identities and semantic conflicts, while allowing a distinct source", () => {
    const first = observed();
    const firstKnown = buildKnownNowInterpretation({ interpreted_at: "2026-08-26T12:30:00.000Z", observed_record: first });
    const history = appendObservedThenKnownNow({ observed: [], known_now: [] }, first, firstKnown);
    const duplicate = buildObservedRecord({
      observed_at: "2026-08-26T13:00:00.000Z", source, artifact_bytes: "artifact bytes", census_bytes: census,
      parser: { parser_identity: "historical-import", parser_version: "9.9.9", extraction_rule: "new-parser-name", confidence: 0.5 },
      subject_binding: subjectBinding, evidence_handling: "considered",
      observed_agent: first.observed_agent, closeout_claim: { status: "no_claim", verification: "unverified", basis: "Imported prose is not authority" }, declared_payment_state: "unknown",
    });
    const duplicateKnown = buildKnownNowInterpretation({ interpreted_at: "2026-08-26T13:30:00.000Z", observed_record: duplicate });
    expect(() => appendObservedThenKnownNow(history, duplicate, duplicateKnown)).toThrow(/Duplicate|parser version/i);

    const conflicting = buildObservedRecord({
      observed_at: "2026-08-26T13:00:00.000Z", source, artifact_bytes: "artifact bytes", census_bytes: census,
      parser: { parser_identity: "historical-import", parser_version: "9.9.9", extraction_rule: "new-parser-name", confidence: 0.5 },
      subject_binding: subjectBinding, evidence_handling: "unknown",
      observed_agent: first.observed_agent, closeout_claim: { status: "claims_not_closed", verification: "unverified", basis: "different parser claim" }, declared_payment_state: "unknown",
    });
    const conflictKnown = buildKnownNowInterpretation({ interpreted_at: "2026-08-26T13:30:00.000Z", observed_record: conflicting });
    expect(() => appendObservedThenKnownNow(history, conflicting, conflictKnown)).toThrow(/conflicting semantics/i);

    const distinct = buildObservedRecord({
      observed_at: "2026-08-26T13:00:00.000Z", source, artifact_bytes: "different artifact bytes", census_bytes: census,
      parser: first.parser, subject_binding: subjectBinding, evidence_handling: "considered", observed_agent: first.observed_agent,
      closeout_claim: { status: "no_claim", verification: "unverified", basis: "Imported prose is not authority" }, declared_payment_state: "unknown",
    });
    const distinctKnown = buildKnownNowInterpretation({ interpreted_at: "2026-08-26T13:30:00.000Z", observed_record: distinct });
    expect(appendObservedThenKnownNow(history, distinct, distinctKnown).observed).toHaveLength(2);
  });

  it("rejects a Known-now source or subject changed after observation", () => {
    const first = observed();
    const known = buildKnownNowInterpretation({ interpreted_at: "2026-08-26T12:30:00.000Z", observed_record: first, payment_state: "unknown" });
    const changed = { ...known, source: { ...known.source, locator: { ...known.source.locator, section: "changed" } }, content_id: known.content_id };
    expect(() => appendObservedThenKnownNow({ observed: [], known_now: [] }, first, changed)).toThrow(/source|identity/i);
  });
});
