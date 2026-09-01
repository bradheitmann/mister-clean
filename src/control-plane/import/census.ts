import { canonicalJson, sha256Bytes } from "../runtime/authority.js";
import {
  type FrozenRepositoryCensus,
  type ArtifactDigest,
  type ImportRepositoryObject,
  type RepositoryCensusEvidence,
  type SourceLocator,
  ImportContractError,
  assertImport,
  frozenRepositoryCensusSchema,
  parseImportSchema,
} from "../contracts/import-provenance.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface FrozenCensusBindingInput {
  readonly census_bytes: string | Uint8Array;
  readonly census_evidence: RepositoryCensusEvidence;
  readonly locator: SourceLocator;
  readonly import_repository_object: ImportRepositoryObject;
  readonly artifact_digest?: ArtifactDigest;
}

export interface VerifiedFrozenCensusBinding {
  readonly census: FrozenRepositoryCensus;
  readonly bytes: Uint8Array;
  readonly canonical_json: string;
  readonly census_sha256: string;
  readonly authority_ceiling: "content_bound" | "legacy_evidence_only";
}

/** Pure cryptographic half of import admission; persistence is owned by SqliteImportStore. */
export function verifyFrozenCensusBinding(input: FrozenCensusBindingInput): VerifiedFrozenCensusBinding {
  const bytes = typeof input.census_bytes === "string" ? encoder.encode(input.census_bytes) : new Uint8Array(input.census_bytes);
  const text = decoder.decode(bytes);
  let candidate: unknown;
  try { candidate = JSON.parse(text); } catch { throw new ImportContractError("CENSUS_EVIDENCE_REQUIRED", "Frozen census bytes must contain canonical JSON"); }
  const census = parseImportSchema(frozenRepositoryCensusSchema, candidate, "frozen repository census");
  if (canonicalJson(census) !== text) throw new ImportContractError("CENSUS_EVIDENCE_REQUIRED", "Frozen census bytes must use exact canonical JSON");
  const censusSha256 = sha256Bytes(bytes);
  assertImport(input.census_evidence.census_sha256 === censusSha256, "CENSUS_EVIDENCE_REQUIRED", "Source classification does not bind the supplied frozen census digest");
  assertImport(input.census_evidence.repository_object_sha256 === census.repository_object_sha256, "CENSUS_EVIDENCE_REQUIRED", "Source classification does not bind the census RepositoryObject");
  assertImport(input.import_repository_object.sha256 === census.repository_object_sha256, "CENSUS_EVIDENCE_REQUIRED", "Frozen census is stale for the import RepositoryObject");
  const entry = census.entries.find((item) => item.repository_relative_path === input.locator.repository_relative_path);
  assertImport(entry !== undefined, "CENSUS_EVIDENCE_REQUIRED", "Source path is absent from the frozen census");
  assertImport(entry.tracking_state === input.census_evidence.tracking_state && entry.declared_artifact_role === input.census_evidence.declared_artifact_role, "CENSUS_EVIDENCE_REQUIRED", "Source classification conflicts with the frozen census entry");
  if (census.schema_version === "1.1") {
    assertImport(input.artifact_digest !== undefined, "CENSUS_EVIDENCE_REQUIRED", "Content-bound census verification requires the imported artifact digest");
    const contentEntry = census.entries.find((item) => item.repository_relative_path === input.locator.repository_relative_path);
    assertImport(contentEntry !== undefined, "CENSUS_EVIDENCE_REQUIRED", "Source path is absent from the content-bound frozen census");
    assertImport(contentEntry.sha256 === input.artifact_digest.sha256 && contentEntry.byte_length === input.artifact_digest.byte_length, "CENSUS_EVIDENCE_REQUIRED", "Imported artifact bytes conflict with the content-bound frozen census entry");
  }
  return {
    census,
    bytes,
    canonical_json: text,
    census_sha256: censusSha256,
    authority_ceiling: census.schema_version === "1.1" ? "content_bound" : "legacy_evidence_only",
  };
}
