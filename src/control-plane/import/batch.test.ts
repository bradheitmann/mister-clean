import { describe, expect, it } from "vitest";

import { importBatchBindingSchema, parseImportSchema, type SubjectBinding } from "../contracts/import-provenance.js";
import { canonicalJson, sha256Bytes } from "../runtime/authority.js";
import { assertArtifactDigestMatches, bindImportBatch, digestArtifactBytes } from "./batch.js";

const subject = (overrides: Partial<SubjectBinding> = {}): SubjectBinding => ({
  artifact_observed_subject: {
    repository_id: "repo-1",
    branch: "history",
    commit: "abc123",
    tree: "def456",
    repository_object_sha256: "1".repeat(64),
    observed_at: "2026-08-26T12:00:00.000Z",
  },
  import_repository_object: {
    record_type: "mister-clean.repository-object",
    schema_version: "1.0",
    head_commit: "live123",
    surface: "tracked_and_nonignored",
    entry_count: 12,
    sha256: "2".repeat(64),
  },
  ...overrides,
});

describe("import batch binding", () => {
  const contentBoundCensusFor = (path: string, bytes: string, repositoryObjectSha256 = "2".repeat(64)) => {
    const artifactSha = sha256Bytes(bytes);
    const artifactLength = new TextEncoder().encode(bytes).byteLength;
    return canonicalJson({
      record_type: "mister-clean.repository-census",
      schema_version: "1.1",
      repository_object_sha256: repositoryObjectSha256,
      algorithm_id: "mister-clean.file-census.sha256-path-stream",
      algorithm_version: "1.0",
      scope: {
        roots: ["history"],
        recursive: true,
        direct_files: "included",
        entry_kind: "regular_file",
        symlinks: "reject",
        special_files: "reject",
        exclusions: [],
      },
      summary: {
        file_count: 1,
        direct_file_count: 1,
        nested_file_count: 0,
        total_bytes: artifactLength,
        aggregate_sha256: sha256Bytes(`${artifactSha}  ${path}\n`),
      },
      entries: [{
        repository_relative_path: path,
        tracking_state: "tracked",
        declared_artifact_role: "machine_contract",
        byte_length: artifactLength,
        sha256: artifactSha,
      }],
    });
  };
  const censusFor = (path: string, repositoryObjectSha256 = "2".repeat(64)) => canonicalJson({
    record_type: "mister-clean.repository-census", schema_version: "1.0", repository_object_sha256: repositoryObjectSha256,
    entries: [{ repository_relative_path: path, tracking_state: "tracked", declared_artifact_role: "machine_contract" }],
  });
  const entry = (path: string, bytes: string) => {
    const census = censusFor(path);
    return ({
    source: {
      source_class: "tracked_machine_contract" as const,
      trust_tier: "first_party" as const,
      kind: "report" as const,
      locator: { repository_relative_path: path },
      census_evidence: { census_sha256: sha256Bytes(census), repository_object_sha256: "2".repeat(64), repository_relative_path: path, tracking_state: "tracked" as const, declared_artifact_role: "machine_contract" as const },
    }, artifact_bytes: bytes, census_bytes: census, subject_binding: subject(),
  }); };

  it("fails closed on source hash drift", () => {
    const digest = digestArtifactBytes("exact bytes");
    expect(() => assertArtifactDigestMatches("changed bytes", digest)).toThrow(/digest/);
  });

  it("enforces content-bound census bytes on batch entries when producer schema 1.1 is supplied", () => {
    const bytes = "one";
    const census = contentBoundCensusFor("history/report.json", bytes);
    expect(() => bindImportBatch({
      entries: [{
        source: {
          source_class: "tracked_machine_contract",
          trust_tier: "first_party",
          kind: "report",
          locator: { repository_relative_path: "history/report.json" },
          census_evidence: { census_sha256: sha256Bytes(census), repository_object_sha256: "2".repeat(64), repository_relative_path: "history/report.json", tracking_state: "tracked", declared_artifact_role: "machine_contract" },
        },
        artifact_bytes: bytes,
        census_bytes: census,
        subject_binding: subject(),
      }],
    })).not.toThrow();
    expect(() => bindImportBatch({
      entries: [{
        source: {
          source_class: "tracked_machine_contract",
          trust_tier: "first_party",
          kind: "report",
          locator: { repository_relative_path: "history/report.json" },
          census_evidence: { census_sha256: sha256Bytes(census), repository_object_sha256: "2".repeat(64), repository_relative_path: "history/report.json", tracking_state: "tracked", declared_artifact_role: "machine_contract" },
        },
        artifact_bytes: "two",
        census_bytes: census,
        subject_binding: subject(),
      }],
    })).toThrow(/content-bound frozen census entry/);
  });

  it("binds a batch to exactly one import RepositoryObject subject", () => {
    const firstCensus = censusFor("history/report.json");
    const binding = bindImportBatch({
      entries: [{
        source: {
          source_class: "tracked_machine_contract",
          trust_tier: "first_party",
          kind: "report",
          locator: { repository_relative_path: "history/report.json" },
          census_evidence: { census_sha256: sha256Bytes(firstCensus), repository_object_sha256: "2".repeat(64), repository_relative_path: "history/report.json", tracking_state: "tracked", declared_artifact_role: "machine_contract" },
        },
        artifact_bytes: "one",
        census_bytes: firstCensus,
        subject_binding: subject(),
      }],
    });
    expect(binding.artifact_count).toBe(1);

    expect(() => bindImportBatch({
      entries: [{
        source: {
          source_class: "tracked_machine_contract",
          trust_tier: "first_party",
          kind: "report",
          locator: { repository_relative_path: "history/report.json" },
          census_evidence: { census_sha256: sha256Bytes(firstCensus), repository_object_sha256: "2".repeat(64), repository_relative_path: "history/report.json", tracking_state: "tracked", declared_artifact_role: "machine_contract" },
        },
        artifact_bytes: "one",
        census_bytes: firstCensus,
        subject_binding: subject(),
      }, {
        source: {
          source_class: "tracked_machine_contract",
          trust_tier: "first_party",
          kind: "report",
          locator: { repository_relative_path: "history/report-2.json" },
          census_evidence: { census_sha256: sha256Bytes(censusFor("history/report-2.json", "3".repeat(64))), repository_object_sha256: "3".repeat(64), repository_relative_path: "history/report-2.json", tracking_state: "tracked", declared_artifact_role: "machine_contract" },
        },
        artifact_bytes: "two",
        census_bytes: censusFor("history/report-2.json", "3".repeat(64)),
        subject_binding: subject({
          import_repository_object: {
            record_type: "mister-clean.repository-object",
            schema_version: "1.0",
            head_commit: "other123",
            surface: "tracked_and_nonignored",
            entry_count: 13,
            sha256: "3".repeat(64),
          },
        }),
      }],
    })).toThrow(/multiple RepositoryObject subjects/);
  });

  it("is permutation-invariant and rejects duplicate full entry identities", () => {
    const left = bindImportBatch({ entries: [entry("history/a.json", "a"), entry("history/b.json", "b")] });
    const right = bindImportBatch({ entries: [entry("history/b.json", "b"), entry("history/a.json", "a")] });
    expect(right.batch_sha256).toBe(left.batch_sha256);
    expect(() => bindImportBatch({ entries: [entry("history/a.json", "a"), entry("history/a.json", "a")] })).toThrow(/Duplicate/);
  });

  it("rejects byte metadata without bytes or a loader", () => {
    const candidate = entry("history/a.json", "a");
    const digest = digestArtifactBytes("a");
    const { artifact_bytes: _bytes, ...metadataOnly } = candidate;
    expect(() => bindImportBatch({ entries: [{ ...metadataOnly, source: { ...candidate.source, artifact_digest: digest } }] })).toThrow(/bytes|byte-store/);
  });

  it("enforces canonical order and recomputes the batch digest at the direct schema boundary", () => {
    const binding = bindImportBatch({ entries: [entry("history/a.json", "a"), entry("history/b.json", "b")] });
    expect(() => parseImportSchema(importBatchBindingSchema, {
      ...binding,
      entries: [...binding.entries].reverse(),
    }, "reordered batch")).toThrow(/canonical entry identity order/i);
    expect(() => parseImportSchema(importBatchBindingSchema, {
      ...binding,
      batch_sha256: "f".repeat(64),
    }, "stale batch hash")).toThrow(/batch digest mismatch/i);
    expect(parseImportSchema(importBatchBindingSchema, binding, "canonical batch")).toEqual(binding);
  });
});
