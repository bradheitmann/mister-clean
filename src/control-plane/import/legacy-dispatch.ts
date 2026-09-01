import { canonicalJson, sha256Bytes, remediationWaveManifestSchema } from "../runtime/authority.js";
import {
  type ArtifactDigest, type LegacyDispatchBridgeRecord, type ParserDescriptor, type SourceDescriptor, type ImmutableByteReference,
  REMEDIATION_WAVE_MANIFEST_FIELDS, ImportContractError, legacyDispatchBridgeRecordSchema,
  parseImportSchema,
} from "../contracts/import-provenance.js";
import { verifyFrozenCensusBinding } from "./census.js";

const manifestFieldSchemas = remediationWaveManifestSchema.shape;
type SourceInput = Omit<SourceDescriptor, "artifact_digest" | "byte_ref"> & { readonly artifact_digest?: ArtifactDigest; readonly byte_ref?: ImmutableByteReference };
export interface TranslateLegacyDispatchOptions {
  readonly source: SourceInput;
  readonly parser: ParserDescriptor;
  readonly legacy_record?: unknown;
  readonly legacy_bytes?: string | Uint8Array;
  readonly census_bytes: string | Uint8Array;
  readonly byte_loader?: (reference: ArtifactDigest) => string | Uint8Array;
  readonly legacy_schema_version?: string;
  readonly legacy_source_schema?: string;
}
function bytesOf(value: string | Uint8Array): Uint8Array { return typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value); }

export function translateLegacyDispatch(options: TranslateLegacyDispatchOptions): LegacyDispatchBridgeRecord {
  const supplied = options.legacy_bytes ?? (options.source.artifact_digest ? options.byte_loader?.(options.source.artifact_digest) : undefined);
  if (supplied === undefined) throw new ImportContractError("IMMUTABLE_BYTES_REQUIRED", "Legacy bridge requires exact original bytes or an immutable byte-store loader");
  const bytes = bytesOf(supplied);
  const canonicalBytes = new TextDecoder().decode(bytes);
  let parsedBytes: unknown;
  try { parsedBytes = JSON.parse(canonicalBytes); } catch { throw new ImportContractError("INCOMPLETE_DISPATCH_TRANSLATION", "Legacy bytes must contain a JSON object"); }
  if (typeof parsedBytes !== "object" || parsedBytes === null || Array.isArray(parsedBytes)) throw new ImportContractError("INCOMPLETE_DISPATCH_TRANSLATION", "Legacy dispatch record must be an object");
  if (canonicalJson(parsedBytes) !== canonicalBytes) throw new ImportContractError("INCOMPLETE_DISPATCH_TRANSLATION", "Legacy bytes must be exact canonical JSON");
  if (options.legacy_record !== undefined && canonicalJson(options.legacy_record) !== canonicalBytes) throw new ImportContractError("DIGEST_MISMATCH", "Legacy record does not match preserved original bytes");
  const legacyRecord = parsedBytes as Record<string, unknown>;
  const derivedFields: LegacyDispatchBridgeRecord["derived_fields"] = [];
  const missingFields: LegacyDispatchBridgeRecord["missing_fields"] = [];
  for (const field of REMEDIATION_WAVE_MANIFEST_FIELDS) {
    const schema = manifestFieldSchemas[field];
    if (!Object.prototype.hasOwnProperty.call(legacyRecord, field)) { missingFields.push(field); continue; }
    const result = schema.safeParse(legacyRecord[field]);
    if (!result.success) {
      missingFields.push(field);
      derivedFields.push({ field, source_present: true, reason: result.error.issues.map((issue) => issue.message).join("; ") });
    } else derivedFields.push({ field, source_present: true, value: result.data });
  }
  const candidate = Object.fromEntries(derivedFields.filter((entry) => entry.source_present && entry.value !== undefined).map((entry) => [entry.field, entry.value]));
  const complete = missingFields.length === 0 && remediationWaveManifestSchema.safeParse(candidate).success;
  const digest: ArtifactDigest = { algorithm: "sha256", sha256: sha256Bytes(bytes), byte_length: bytes.byteLength };
  if (options.source.artifact_digest && (options.source.artifact_digest.sha256 !== digest.sha256 || options.source.artifact_digest.byte_length !== digest.byte_length)) throw new ImportContractError("DIGEST_MISMATCH", "Legacy bytes do not match source digest");
  const source: SourceDescriptor = { ...options.source, artifact_digest: digest, byte_ref: { content_id: digest.sha256, byte_length: digest.byte_length, store: "immutable_content_addressed", local_ref: `sqlite:import_byte_vault/${digest.sha256}` } };
  verifyFrozenCensusBinding({
    census_bytes: options.census_bytes,
    census_evidence: source.census_evidence,
    locator: source.locator,
    import_repository_object: {
      record_type: "mister-clean.repository-object",
      schema_version: "1.0",
      head_commit: "legacy-evidence-only",
      surface: "tracked_and_nonignored",
      entry_count: 0,
      sha256: source.census_evidence.repository_object_sha256,
    },
    artifact_digest: source.artifact_digest,
  });
  return parseImportSchema(legacyDispatchBridgeRecordSchema, {
    record_type: "mister-clean.import-legacy-dispatch-bridge",
    schema_version: "1.0",
    target_manifest_schema_version: "1.3",
    legacy_schema_version: options.legacy_schema_version ?? "UNKNOWN",
    source,
    parser: options.parser,
    legacy_canonical_bytes: canonicalBytes,
    legacy_digest: digest,
    legacy_source_schema: options.legacy_source_schema ?? options.legacy_schema_version ?? "UNKNOWN",
    legacy_record: legacyRecord,
    disposition: "evidence_only",
    derived_fields: derivedFields,
    missing_fields: missingFields,
    complete,
  }, "legacy dispatch bridge");
}
