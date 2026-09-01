import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalJson, sha256Bytes } from "../runtime/authority.js";
import { UNKNOWN_AGENT_FIELD, type AuthorityTransition } from "../contracts/import-provenance.js";
import { openControlPlaneDatabase, type OpenControlPlaneDatabase } from "../persistence/sqlite.js";
import { SqliteImportStore, type AdmitObservedOptions } from "./sqlite-store.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const importRepositoryObject = {
  record_type: "mister-clean.repository-object" as const,
  schema_version: "1.0" as const,
  head_commit: "live456",
  surface: "tracked_and_nonignored" as const,
  entry_count: 3,
  sha256: "2".repeat(64),
};

const subjectBinding = {
  artifact_observed_subject: {
    repository_id: "repo-1", branch: "main", commit: "abc123", tree: "def456",
    repository_object_sha256: "1".repeat(64), observed_at: "2026-08-26T12:00:00.000Z",
  },
  import_repository_object: importRepositoryObject,
};

const agent = {
  agent_tuple_id: UNKNOWN_AGENT_FIELD, model_id: UNKNOWN_AGENT_FIELD, harness_id: UNKNOWN_AGENT_FIELD,
  reasoning_level: UNKNOWN_AGENT_FIELD, display_name: UNKNOWN_AGENT_FIELD,
};

function censusBytes(overrides: { readonly reportRole?: "machine_contract" | "narrative_observation" } = {}): string {
  return canonicalJson({
    record_type: "mister-clean.repository-census",
    schema_version: "1.0",
    repository_object_sha256: importRepositoryObject.sha256,
    entries: [
      { repository_relative_path: "history/receipt.json", tracking_state: "tracked", declared_artifact_role: "machine_contract" },
      { repository_relative_path: "history/report.md", tracking_state: "tracked", declared_artifact_role: overrides.reportRole ?? "machine_contract" },
      { repository_relative_path: "templates/fixture.json", tracking_state: "tracked", declared_artifact_role: "fixture_template" },
    ],
  });
}

function contentBoundCensusBytes(path: string, artifactBytes: string, role: "machine_contract" | "narrative_observation" = "machine_contract"): string {
  const artifactSha = sha256Bytes(artifactBytes);
  const artifactLength = new TextEncoder().encode(artifactBytes).byteLength;
  return canonicalJson({
    record_type: "mister-clean.repository-census",
    schema_version: "1.1",
    repository_object_sha256: importRepositoryObject.sha256,
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
      declared_artifact_role: role,
      byte_length: artifactLength,
      sha256: artifactSha,
    }],
  });
}

function observedOptions(overrides: Partial<AdmitObservedOptions> = {}): AdmitObservedOptions {
  const census = censusBytes();
  return {
    observed_at: "2026-08-26T12:00:00.000Z",
    admitted_at: "2026-08-26T12:00:01.000Z",
    source: {
      source_class: "tracked_machine_contract",
      trust_tier: "first_party",
      kind: "report",
      census_evidence: {
        census_sha256: sha256Bytes(census), repository_object_sha256: importRepositoryObject.sha256,
        repository_relative_path: "history/report.md", tracking_state: "tracked", declared_artifact_role: "machine_contract",
      },
      locator: { repository_relative_path: "history/report.md" },
    },
    artifact_bytes: "immutable report bytes",
    census_bytes: census,
    parser: { parser_identity: "historical-import", parser_version: "1.0.0", extraction_rule: "exact-field-extraction", confidence: 1 },
    subject_binding: subjectBinding,
    evidence_handling: "considered",
    observed_agent: agent,
    closeout_claim: { status: "no_claim", verification: "unverified", basis: "source prose is observation only" },
    declared_payment_state: "unknown",
    ...overrides,
  };
}

function contentBoundObservedOptions(overrides: Partial<AdmitObservedOptions> = {}): AdmitObservedOptions {
  const artifactBytes = typeof overrides.artifact_bytes === "string" ? overrides.artifact_bytes : "immutable report bytes";
  const census = contentBoundCensusBytes("history/report.md", artifactBytes);
  return observedOptions({
    ...overrides,
    artifact_bytes: artifactBytes,
    census_bytes: census,
    source: {
      ...observedOptions().source,
      census_evidence: {
        ...observedOptions().source.census_evidence,
        census_sha256: sha256Bytes(census),
      },
    },
  });
}

function transition(content: Omit<AuthorityTransition, "transition_sha256">): AuthorityTransition {
  return { ...content, transition_sha256: sha256Bytes(canonicalJson(content)) };
}

async function openStore(): Promise<{ opened: OpenControlPlaneDatabase; store: SqliteImportStore }> {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-import-store-"));
  roots.push(root);
  const opened = await openControlPlaneDatabase("repository", join(root, "repository.sqlite"), "2026-08-26T12:00:00.000Z");
  return { opened, store: new SqliteImportStore(opened.database) };
}

describe("durable SQLite import invariant boundary", () => {
  it("persists retrievable content-addressed bytes and rejects missing bytes", async () => {
    const { opened, store } = await openStore();
    try {
      const admission = store.admitObserved(observedOptions());
      expect(admission.disposition).toBe("authoritative_history");
      expect(admission.record.disposition).toBe("evidence_only");
      expect(new TextDecoder().decode(store.load(admission.record.source.byte_ref))).toBe("immutable report bytes");
      expect(admission.record.source.byte_ref.local_ref).toBe(`sqlite:import_byte_vault/${admission.record.source.artifact_digest.sha256}`);
      const missing = observedOptions();
      const { artifact_bytes: _artifactBytes, ...withoutBytes } = missing;
      expect(() => store.admitObserved(withoutBytes)).toThrow(/exact artifact bytes|bytes/i);
      expect(() => opened.database.exec(`UPDATE import_byte_vault SET bytes = X'00' WHERE content_id = '${admission.record.source.artifact_digest.sha256}'`)).toThrow(/append-only/i);
    } finally {
      opened.close();
    }
  });

  it("preserves normalized authority only when the census is content-bound 1.1", async () => {
    const { opened, store } = await openStore();
    try {
      const admission = store.admitObserved(contentBoundObservedOptions());
      expect(admission.disposition).toBe("authoritative_history");
      expect(admission.record.disposition).toBe("normalized");
      expect(() => store.admitObserved(contentBoundObservedOptions({ artifact_bytes: "changed bytes" }))).not.toThrow();
      expect(() => store.admitObserved({
        ...contentBoundObservedOptions(),
        artifact_bytes: "changed bytes",
      })).toThrow(/content-bound frozen census entry/);
    } finally {
      opened.close();
    }
  });

  it("rejects parser/time duplicates and semantic conflicts but admits distinct immutable bytes", async () => {
    const { opened, store } = await openStore();
    try {
      store.admitObserved(observedOptions());
      expect(() => store.admitObserved(observedOptions({
        observed_at: "2026-08-26T13:00:00.000Z",
        parser: { parser_identity: "historical-import", parser_version: "9.9.9", extraction_rule: "renamed-parser", confidence: 0.5 },
        subject_binding: {
          ...subjectBinding,
          artifact_observed_subject: { ...subjectBinding.artifact_observed_subject, observed_at: "2026-08-26T13:00:00.000Z" },
        },
      }))).toThrow(/already admitted|Duplicate/i);
      expect(() => store.admitObserved(observedOptions({
        observed_at: "2026-08-26T13:00:00.000Z", evidence_handling: "unknown",
        closeout_claim: { status: "claims_not_closed", verification: "unverified", basis: "conflicting interpretation" },
      }))).toThrow(/conflicting semantics/i);
      expect(store.admitObserved(observedOptions({ artifact_bytes: "distinct immutable report bytes" })).disposition).toBe("authoritative_history");
    } finally {
      opened.close();
    }
  });

  it("requires the exact frozen census and routes quarantine away from authoritative history", async () => {
    const { opened, store } = await openStore();
    try {
      const forgedCensus = censusBytes({ reportRole: "narrative_observation" });
      const forged = observedOptions({
        census_bytes: forgedCensus,
        source: {
          ...observedOptions().source,
          census_evidence: { ...observedOptions().source.census_evidence, census_sha256: sha256Bytes(forgedCensus) },
        },
      });
      expect(() => store.admitObserved(forged)).toThrow(/frozen census entry|conflicts/i);

      const census = censusBytes();
      const quarantined = store.admitObserved(observedOptions({
        source: {
          source_class: "fixture_template", trust_tier: "unverified", kind: "fixture",
          census_evidence: {
            census_sha256: sha256Bytes(census), repository_object_sha256: importRepositoryObject.sha256,
            repository_relative_path: "templates/fixture.json", tracking_state: "tracked", declared_artifact_role: "fixture_template",
          },
          locator: { repository_relative_path: "templates/fixture.json" },
        },
        artifact_bytes: "fixture bytes",
      }));
      expect(quarantined.disposition).toBe("quarantine");
      expect(opened.database.query<{ count: number }>("SELECT count(*) AS count FROM import_observed_history").get()?.count).toBe(0);
      expect(opened.database.query<{ count: number }>("SELECT count(*) AS count FROM import_quarantine_records").get()?.count).toBe(1);
    } finally {
      opened.close();
    }
  });

  it("derives paid and claims_closed only from an admitted authoritative transition", async () => {
    const { opened, store } = await openStore();
    try {
      const report = store.admitObserved(observedOptions()).record;
      expect(() => store.admitKnownNow({
        interpreted_at: "2026-08-26T13:00:00.000Z", observed_record: report, payment_state: "paid",
      })).toThrow(/authority transition/i);

      const census = censusBytes();
      const receipt = store.admitObserved(observedOptions({
        observed_at: "2026-08-26T12:10:00.000Z",
        source: {
          source_class: "tracked_machine_contract", trust_tier: "authoritative", kind: "receipt",
          census_evidence: {
            census_sha256: sha256Bytes(census), repository_object_sha256: importRepositoryObject.sha256,
            repository_relative_path: "history/receipt.json", tracking_state: "tracked", declared_artifact_role: "machine_contract",
          },
          locator: { repository_relative_path: "history/receipt.json" },
        },
        artifact_bytes: "sealed authority receipt",
      })).record;
      const receiptRecordSha = sha256Bytes(canonicalJson(receipt));
      const paymentTransition = transition({
        record_type: "mister-clean.import-authority-transition", schema_version: "1.0", transition_kind: "payment",
        from_state: "not_paid", to_state: "paid", subject_repository_object_sha256: importRepositoryObject.sha256,
        evidence_source: receipt.source, evidence_record_sha256: receiptRecordSha, occurred_at: "2026-08-26T12:20:00.000Z",
      });
      const closureTransition = transition({
        record_type: "mister-clean.import-authority-transition", schema_version: "1.0", transition_kind: "closure",
        from_state: "open", to_state: "closed", subject_repository_object_sha256: importRepositoryObject.sha256,
        evidence_source: receipt.source, evidence_record_sha256: receiptRecordSha, occurred_at: "2026-08-26T12:21:00.000Z",
      });
      const known = store.admitKnownNow({
        interpreted_at: "2026-08-26T13:00:00.000Z", observed_record: report,
        payment_state: "paid", authority_transitions: [paymentTransition, closureTransition],
      });
      expect(known.payment_state).toBe("paid");
      expect(known.closeout_claim).toMatchObject({ status: "claims_closed", verification: "authority_transition" });

      const { transition_sha256: _transitionSha256, ...paymentTransitionContent } = paymentTransition;
      const forged = transition({ ...paymentTransitionContent, evidence_record_sha256: "f".repeat(64) });
      expect(() => store.admitKnownNow({
        interpreted_at: "2026-08-26T14:00:00.000Z", observed_record: report, authority_transitions: [forged],
      })).toThrow(/not admitted authoritative history/i);
    } finally {
      opened.close();
    }
  });
});
