import { canonicalJson, sha256Bytes } from "../runtime/authority.js";
import {
  type AuthorityTransition,
  type FrozenRepositoryCensus,
  type ImmutableByteReference,
  type ImportObservedRecord,
  type KnownNowInterpretation,
  ImportContractError,
  assertImport,
  authorityTransitionSchema,
  immutableByteReferenceSchema,
  importObservedRecordSchema,
  knownNowInterpretationSchema,
  parseImportSchema,
  sourceDescriptorSchema,
} from "../contracts/import-provenance.js";
import type { BunSqliteDatabase } from "../persistence/sqlite.js";
import {
  buildKnownNowInterpretation,
  buildObservedRecord,
  observedSemanticKey,
  observedSemanticValue,
  type BuildKnownNowInterpretationOptions,
  type BuildObservedRecordOptions,
} from "./records.js";
import { verifyFrozenCensusBinding } from "./census.js";

const encoder = new TextEncoder();

function bytesOf(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? encoder.encode(value) : new Uint8Array(value);
}

function byteReference(bytes: Uint8Array): ImmutableByteReference {
  const contentId = sha256Bytes(bytes);
  return {
    content_id: contentId,
    byte_length: bytes.byteLength,
    store: "immutable_content_addressed",
    local_ref: `sqlite:import_byte_vault/${contentId}`,
  };
}

export interface AdmitObservedOptions extends BuildObservedRecordOptions {
  readonly census_bytes: string | Uint8Array;
  readonly admitted_at?: string;
}

export interface AdmitKnownNowOptions extends BuildKnownNowInterpretationOptions {
  readonly admitted_at?: string;
}

export type ObservedAdmission =
  | { readonly disposition: "authoritative_history"; readonly record: ImportObservedRecord }
  | { readonly disposition: "quarantine"; readonly record: ImportObservedRecord };

/**
 * The single durable import invariant boundary. It owns byte persistence, frozen
 * census verification, semantic conflict checks, quarantine routing, and
 * authority-transition admission.
 */
export class SqliteImportStore {
  constructor(private readonly database: BunSqliteDatabase) {}

  load(reference: ImmutableByteReference): Uint8Array {
    const parsed = parseImportSchema(immutableByteReferenceSchema, reference, "immutable byte reference");
    const row = this.database.query<{ bytes: Uint8Array; byte_length: number }>(
      "SELECT bytes, byte_length FROM import_byte_vault WHERE content_id = ? AND local_ref = ?",
    ).get(parsed.content_id, parsed.local_ref);
    if (!row) throw new ImportContractError("BYTE_VAULT_MISS", `No persisted bytes exist for ${parsed.local_ref}`);
    const bytes = new Uint8Array(row.bytes);
    assertImport(bytes.byteLength === parsed.byte_length && row.byte_length === parsed.byte_length && sha256Bytes(bytes) === parsed.content_id, "DIGEST_MISMATCH", "Persisted import bytes failed digest or length verification");
    return bytes;
  }

  admitObserved(options: AdmitObservedOptions): ObservedAdmission {
    return this.database.transaction(() => {
      const admittedAt = options.admitted_at ?? options.observed_at;
      const artifactBytes = this.resolveArtifactBytes(options);
      const artifactRef = this.storeBytes(artifactBytes, admittedAt);
      const census = this.verifyAndStoreCensus(options, admittedAt, artifactRef);
      const record = buildObservedRecord({ ...options, artifact_bytes: artifactBytes });
      assertImport(record.source.byte_ref.content_id === artifactRef.content_id && record.source.byte_ref.local_ref === artifactRef.local_ref, "DIGEST_MISMATCH", "Observed record does not bind the persisted byte reference");
      assertImport(record.source.census_evidence.census_sha256 === sha256Bytes(bytesOf(options.census_bytes)), "CENSUS_EVIDENCE_REQUIRED", "Observed record does not bind the persisted census bytes");
      assertImport(census.repository_object_sha256 === record.subject_binding.import_repository_object.sha256, "CENSUS_EVIDENCE_REQUIRED", "Frozen census does not bind the import RepositoryObject");

      const canonicalRecord = canonicalJson(record);
      const recordSha = sha256Bytes(canonicalRecord);
      if (record.disposition === "quarantined" || record.disposition === "rejected") {
        this.database.query(
          `INSERT INTO import_quarantine_records(
            quarantine_id, byte_content_id, census_sha256, source_class, disposition, reason, canonical_record_json, quarantined_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(recordSha, artifactRef.content_id, record.source.census_evidence.census_sha256, record.source.source_class, record.disposition, "source classification is not authoritative history", canonicalRecord, admittedAt);
        return { disposition: "quarantine" as const, record };
      }

      const semanticKey = observedSemanticKey(record);
      const semanticValue = observedSemanticValue(record);
      const prior = this.database.query<{ record_sha256: string; semantic_value_sha256: string }>(
        "SELECT record_sha256, semantic_value_sha256 FROM import_observed_history WHERE semantic_key_sha256 = ?",
      ).get(semanticKey);
      if (prior) {
        if (prior.semantic_value_sha256 !== semanticValue) throw new ImportContractError("SEMANTIC_CONFLICT", "Same immutable source bytes and observed subject produced conflicting semantics");
        throw new ImportContractError("DUPLICATE_IMPORT_RECORD", "Same immutable source bytes and observed subject were already admitted");
      }
      this.database.query(
        `INSERT INTO import_observed_history(
          record_sha256, semantic_key_sha256, semantic_value_sha256, byte_content_id, census_sha256,
          parser_identity, parser_version, schema_version, subject_repository_object_sha256,
          source_class, disposition, canonical_record_json, admitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        recordSha, semanticKey, semanticValue, artifactRef.content_id, record.source.census_evidence.census_sha256,
        record.parser.parser_identity, record.parser.parser_version, record.schema_version,
        record.subject_binding.import_repository_object.sha256, record.source.source_class, record.disposition,
        canonicalRecord, admittedAt,
      );
      return { disposition: "authoritative_history" as const, record };
    })();
  }

  admitKnownNow(options: AdmitKnownNowOptions): KnownNowInterpretation {
    return this.database.transaction(() => {
      const observed = parseImportSchema(importObservedRecordSchema, options.observed_record, "observed import record");
      const observedSha = sha256Bytes(canonicalJson(observed));
      const admittedObserved = this.database.query<{ record_sha256: string }>(
        "SELECT record_sha256 FROM import_observed_history WHERE record_sha256 = ?",
      ).get(observedSha);
      if (!admittedObserved) throw new ImportContractError("SOURCE_REJECTED", "Known-now interpretation requires an admitted authoritative-history observation");
      for (const transition of options.authority_transitions ?? []) this.verifyAuthorityTransition(transition);
      const record = buildKnownNowInterpretation(options);
      const parsed = parseImportSchema(knownNowInterpretationSchema, record, "known-now interpretation");
      const recordSha = sha256Bytes(canonicalJson(parsed));
      const existing = this.database.query<{ record_sha256: string }>(
        "SELECT record_sha256 FROM import_known_now_history WHERE record_sha256 = ?",
      ).get(recordSha);
      if (existing) throw new ImportContractError("DUPLICATE_IMPORT_RECORD", "Known-now interpretation was already admitted");
      this.database.query(
        `INSERT INTO import_known_now_history(
          record_sha256, observed_record_sha256, byte_content_id, census_sha256, schema_version,
          subject_repository_object_sha256, payment_state, closeout_status, canonical_record_json, admitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        recordSha, observedSha, parsed.source.byte_ref.content_id, parsed.source.census_evidence.census_sha256,
        parsed.schema_version, parsed.subject_binding.import_repository_object.sha256, parsed.payment_state,
        parsed.closeout_claim.status, canonicalJson(parsed), options.admitted_at ?? options.interpreted_at,
      );
      return parsed;
    })();
  }

  private resolveArtifactBytes(options: AdmitObservedOptions): Uint8Array {
    const supplied = options.artifact_bytes ?? options.bytes
      ?? (options.source.artifact_digest ? options.byte_store?.load(options.source.artifact_digest) : undefined)
      ?? (options.source.artifact_digest ? options.byte_loader?.(options.source.artifact_digest) : undefined);
    if (supplied === undefined) throw new ImportContractError("IMMUTABLE_BYTES_REQUIRED", "Admission requires exact artifact bytes");
    return bytesOf(supplied);
  }

  private storeBytes(bytes: Uint8Array, storedAt: string): ImmutableByteReference {
    const reference = byteReference(bytes);
    const existing = this.database.query<{ byte_length: number; bytes: Uint8Array; local_ref: string }>(
      "SELECT byte_length, bytes, local_ref FROM import_byte_vault WHERE content_id = ?",
    ).get(reference.content_id);
    if (existing) {
      const persisted = new Uint8Array(existing.bytes);
      assertImport(existing.byte_length === reference.byte_length && existing.local_ref === reference.local_ref && sha256Bytes(persisted) === reference.content_id, "DIGEST_MISMATCH", "Existing byte-vault row conflicts with its content address");
      return reference;
    }
    this.database.query(
      "INSERT INTO import_byte_vault(content_id, byte_length, bytes, local_ref, stored_at) VALUES (?, ?, ?, ?, ?)",
    ).run(reference.content_id, reference.byte_length, bytes, reference.local_ref, storedAt);
    return reference;
  }

  private verifyAndStoreCensus(
    options: AdmitObservedOptions,
    storedAt: string,
    artifactRef: ImmutableByteReference,
  ): FrozenRepositoryCensus {
    const verified = verifyFrozenCensusBinding({
      census_bytes: options.census_bytes,
      census_evidence: options.source.census_evidence,
      locator: options.source.locator,
      import_repository_object: options.subject_binding.import_repository_object,
      artifact_digest: {
        algorithm: "sha256",
        sha256: artifactRef.content_id,
        byte_length: artifactRef.byte_length,
      },
    });
    const { census, bytes, canonical_json: text } = verified;
    const censusRef = this.storeBytes(bytes, storedAt);

    const existing = this.database.query<{ canonical_census_json: string }>(
      "SELECT canonical_census_json FROM import_census_snapshots WHERE census_sha256 = ?",
    ).get(censusRef.content_id);
    if (existing) {
      assertImport(existing.canonical_census_json === text, "DIGEST_MISMATCH", "Existing census snapshot conflicts with its content address");
      return census;
    }
    this.database.query(
      "INSERT INTO import_census_snapshots(census_sha256, repository_object_sha256, byte_content_id, canonical_census_json, stored_at) VALUES (?, ?, ?, ?, ?)",
    ).run(censusRef.content_id, census.repository_object_sha256, censusRef.content_id, text, storedAt);
    const insertEntry = this.database.query(
      "INSERT INTO import_census_entries(census_sha256, repository_relative_path, tracking_state, declared_artifact_role) VALUES (?, ?, ?, ?)",
    );
    for (const item of census.entries) insertEntry.run(censusRef.content_id, item.repository_relative_path, item.tracking_state, item.declared_artifact_role);
    return census;
  }

  private verifyAuthorityTransition(transition: AuthorityTransition): void {
    const parsedTransition = parseImportSchema(authorityTransitionSchema, transition, "authority transition");
    const source = parseImportSchema(sourceDescriptorSchema, parsedTransition.evidence_source, "authority transition source");
    this.load(source.byte_ref);
    const evidence = this.database.query<{ canonical_record_json: string }>(
      "SELECT canonical_record_json FROM import_observed_history WHERE record_sha256 = ? AND byte_content_id = ? AND census_sha256 = ?",
    ).get(parsedTransition.evidence_record_sha256, source.byte_ref.content_id, source.census_evidence.census_sha256);
    if (!evidence) throw new ImportContractError("AUTHORITY_TRANSITION_REQUIRED", "Authority transition evidence is not admitted authoritative history");
    const record = parseImportSchema(importObservedRecordSchema, JSON.parse(evidence.canonical_record_json), "authority evidence record");
    assertImport(canonicalJson(record.source) === canonicalJson(source), "AUTHORITY_TRANSITION_REQUIRED", "Authority transition source does not match the admitted evidence record");
    assertImport(record.subject_binding.import_repository_object.sha256 === parsedTransition.subject_repository_object_sha256, "AUTHORITY_TRANSITION_REQUIRED", "Authority evidence record does not bind the transition subject RepositoryObject");
  }
}
