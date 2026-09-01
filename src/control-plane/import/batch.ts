import { canonicalJson, sha256Bytes } from "../runtime/authority.js";
import {
  type ArtifactDigest, type ImportBatchBinding, type SourceDescriptor, type SubjectBinding,
  type ImmutableByteReference, ImportContractError, assertImport, importBatchBindingSchema,
  parseImportSchema,
} from "../contracts/import-provenance.js";
import { verifyFrozenCensusBinding } from "./census.js";

export type BatchByteLoader = (reference: ArtifactDigest) => string | Uint8Array;
type SourceInput = Omit<SourceDescriptor, "artifact_digest" | "byte_ref"> & { readonly artifact_digest?: ArtifactDigest; readonly byte_ref?: ImmutableByteReference };
export interface BindImportBatchOptions {
  readonly byte_loader?: BatchByteLoader;
  readonly byte_store?: { readonly load: BatchByteLoader };
  readonly entries: readonly {
    readonly source: SourceInput;
    readonly artifact_bytes?: string | Uint8Array;
    readonly bytes?: string | Uint8Array;
    readonly census_bytes: string | Uint8Array;
    readonly subject_binding: SubjectBinding;
  }[];
}

function bytesOf(value: string | Uint8Array): Uint8Array { return typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value); }
export function digestArtifactBytes(bytes: string | Uint8Array): ArtifactDigest {
  const encoded = bytesOf(bytes);
  return { algorithm: "sha256", sha256: sha256Bytes(encoded), byte_length: encoded.byteLength };
}
export function assertArtifactDigestMatches(bytes: string | Uint8Array, digest: ArtifactDigest): void {
  const actual = digestArtifactBytes(bytes);
  assertImport(actual.sha256 === digest.sha256 && actual.byte_length === digest.byte_length, "DIGEST_MISMATCH", "Imported artifact digest does not match source bytes");
}
export function bindImportBatch(options: BindImportBatchOptions): ImportBatchBinding {
  assertImport(options.entries.length > 0, "INVALID_BATCH_BINDING", "Import batch requires at least one entry");
  const entries = options.entries.map((entry) => {
    const supplied = entry.artifact_bytes ?? entry.bytes
      ?? (entry.source.artifact_digest ? options.byte_store?.load(entry.source.artifact_digest) : undefined)
      ?? (entry.source.artifact_digest ? options.byte_loader?.(entry.source.artifact_digest) : undefined);
    if (supplied === undefined) throw new ImportContractError("IMMUTABLE_BYTES_REQUIRED", "Actual artifact bytes or an immutable byte-store loader are required");
    const digest = digestArtifactBytes(supplied);
    if (entry.source.artifact_digest && (entry.source.artifact_digest.sha256 !== digest.sha256 || entry.source.artifact_digest.byte_length !== digest.byte_length)) throw new ImportContractError("DIGEST_MISMATCH", "Imported artifact digest does not match source bytes");
    const source: SourceDescriptor = {
      ...entry.source,
      artifact_digest: digest,
      byte_ref: { content_id: digest.sha256, byte_length: digest.byte_length, store: "immutable_content_addressed", local_ref: `sqlite:import_byte_vault/${digest.sha256}` },
    };
    verifyFrozenCensusBinding({
      census_bytes: entry.census_bytes,
      census_evidence: source.census_evidence,
      locator: source.locator,
      import_repository_object: entry.subject_binding.import_repository_object,
      artifact_digest: source.artifact_digest,
    });
    const content = { source, subject_binding: entry.subject_binding };
    return { ...content, entry_sha256: sha256Bytes(canonicalJson(content)) };
  });
  const identities = new Set(entries.map((entry) => entry.entry_sha256));
  assertImport(identities.size === entries.length, "DUPLICATE_IMPORT_RECORD", "Duplicate batch entry identity");
  const ordered = [...entries].sort((left, right) => left.entry_sha256 < right.entry_sha256 ? -1 : left.entry_sha256 > right.entry_sha256 ? 1 : 0);
  const importRepositoryObject = ordered[0]!.subject_binding.import_repository_object;
  for (const entry of ordered) assertImport(canonicalJson(entry.subject_binding.import_repository_object) === canonicalJson(importRepositoryObject), "INVALID_BATCH_BINDING", "Import batch cannot bind multiple RepositoryObject subjects");
  const batchContent = {
    schema_version: "1.0",
    import_repository_object: importRepositoryObject,
    entries: ordered,
  };
  const binding = {
    record_type: "mister-clean.import-batch-binding" as const,
    schema_version: "1.0" as const,
    batch_sha256: sha256Bytes(canonicalJson(batchContent)),
    import_repository_object: importRepositoryObject,
    artifact_count: ordered.length,
    entries: ordered,
  };
  return parseImportSchema(importBatchBindingSchema, binding, "import batch binding");
}
