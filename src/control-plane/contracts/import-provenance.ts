import * as z from "zod";

import { canonicalJson, sha256Bytes, remediationWaveManifestSchema } from "../runtime/authority.js";
import {
  FILE_CENSUS_ALGORITHM_ID,
  FILE_CENSUS_ALGORITHM_VERSION,
  validateFileCensus,
  type FileCensus,
} from "../../census.js";

import type { RepositorySubject, Sha256 } from "./primitives.js";

const CONTROL_FREE = /^[^\u0000-\u001f\u007f]+$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SHA256 = /^[0-9a-f]{64}$/;
const UNKNOWN = "UNKNOWN" as const;

const boundedString = (maximum = 4096) => z.string().min(1).max(maximum).regex(CONTROL_FREE);
const identifier = boundedString(512);
const sha256 = z.string().regex(SHA256);
const isoTimestamp = z.string().regex(ISO_TIMESTAMP).refine((value) => Number.isFinite(Date.parse(value)));
const knownOrUnknown = (maximum = 512) => z.union([boundedString(maximum), z.literal(UNKNOWN)]);

export const IMPORT_CONTRACT_ERROR_CODES = [
  "DIGEST_MISMATCH",
  "INCOMPLETE_DISPATCH_TRANSLATION",
  "INVALID_BATCH_BINDING",
  "INVALID_CLOSEOUT_CLAIM",
  "INVALID_IMPORT_RECORD",
  "INVALID_SOURCE_CLASSIFICATION",
  "INVALID_SUBJECT_BINDING",
  "SCHEMA_VALIDATION_FAILED",
  "SOURCE_REJECTED",
  "DUPLICATE_IMPORT_RECORD",
  "IMMUTABLE_BYTES_REQUIRED",
  "BYTE_VAULT_MISS",
  "CENSUS_EVIDENCE_REQUIRED",
  "AUTHORITY_TRANSITION_REQUIRED",
  "SEMANTIC_CONFLICT",
] as const;

export type ImportContractErrorCode = (typeof IMPORT_CONTRACT_ERROR_CODES)[number];

export class ImportContractError extends Error {
  readonly code: ImportContractErrorCode;

  constructor(code: ImportContractErrorCode, message: string) {
    super(message);
    this.name = "ImportContractError";
    this.code = code;
  }
}

export function assertImport(condition: unknown, code: ImportContractErrorCode, message: string): asserts condition {
  if (!condition) throw new ImportContractError(code, message);
}

export function parseImportSchema<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ImportContractError(
      "SCHEMA_VALIDATION_FAILED",
      `${label}: ${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

function validateRepositoryRelativePath(path: string, source: string): void {
  assertImport(!path.startsWith("/") && !path.includes("\0"), "SCHEMA_VALIDATION_FAILED", `${source}: path must be repository-relative`);
  assertImport(!path.includes("\\"), "SCHEMA_VALIDATION_FAILED", `${source}: path must use forward slashes only`);
  const segments = path.split("/");
  assertImport(segments.length > 0, "SCHEMA_VALIDATION_FAILED", `${source}: path must not be empty`);
  assertImport(
    segments.every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    "SCHEMA_VALIDATION_FAILED",
    `${source}: path must not contain empty, '.' or '..' segments`,
  );
}

export const repositorySubjectSchema = z.object({
  repository_id: identifier,
  branch: boundedString(1024),
  commit: boundedString(512),
  tree: boundedString(512),
  repository_object_sha256: sha256,
  observed_at: isoTimestamp,
}).strict();

export const importRepositoryObjectSchema = z.object({
  record_type: z.literal("mister-clean.repository-object"),
  schema_version: z.literal("1.0"),
  head_commit: boundedString(512),
  surface: z.literal("tracked_and_nonignored"),
  entry_count: z.number().int().nonnegative(),
  sha256,
}).strict();

export const artifactDigestSchema = z.object({
  algorithm: z.literal("sha256"),
  sha256,
  byte_length: z.number().int().nonnegative(),
}).strict();

export const sourceLineSpanSchema = z.object({
  start: z.number().int().positive(),
  end: z.number().int().positive(),
}).strict().superRefine((value, context) => {
  if (value.end < value.start) {
    context.addIssue({ code: "custom", message: "line span end must be greater than or equal to start" });
  }
});

export const sourceLocatorSchema = z.object({
  repository_relative_path: boundedString(4096).superRefine((path, context) => {
    try {
      validateRepositoryRelativePath(path, "source locator");
    } catch (error) {
      context.addIssue({ code: "custom", message: error instanceof Error ? error.message : String(error) });
    }
  }),
  section: boundedString(1024).optional(),
  line_span: sourceLineSpanSchema.optional(),
}).strict();

export const SOURCE_TRUST_TIERS = [
  "authoritative",
  "first_party",
  "third_party",
  "unverified",
] as const;

export type SourceTrustTier = (typeof SOURCE_TRUST_TIERS)[number];
export const sourceTrustTierSchema = z.enum(SOURCE_TRUST_TIERS);

export const SOURCE_CLASSES = [
  "tracked_machine_contract",
  "tracked_narrative_observation",
  "ignored_local_quarantine",
  "fixture_template",
] as const;
export type SourceClass = (typeof SOURCE_CLASSES)[number];
export const sourceClassSchema = z.enum(SOURCE_CLASSES);

export const REPOSITORY_TRACKING_STATES = ["tracked", "ignored"] as const;
export type RepositoryTrackingState = (typeof REPOSITORY_TRACKING_STATES)[number];
export const repositoryTrackingStateSchema = z.enum(REPOSITORY_TRACKING_STATES);

export const ARTIFACT_ROLES = [
  "machine_contract",
  "narrative_observation",
  "ignored_quarantine",
  "fixture_template",
] as const;
export type ArtifactRole = (typeof ARTIFACT_ROLES)[number];
export const artifactRoleSchema = z.enum(ARTIFACT_ROLES);

/** Tracking state is evidence from a frozen census, never a path heuristic. */
export const repositoryCensusEvidenceSchema = z.object({
  census_sha256: sha256,
  repository_object_sha256: sha256,
  repository_relative_path: boundedString(4096).superRefine((path, context) => {
    try {
      validateRepositoryRelativePath(path, "census evidence");
    } catch (error) {
      context.addIssue({ code: "custom", message: error instanceof Error ? error.message : String(error) });
    }
  }),
  tracking_state: repositoryTrackingStateSchema,
  declared_artifact_role: artifactRoleSchema,
}).strict();

export const SOURCE_KINDS = [
  "attestation",
  "chat_transcript",
  "dispatch_record",
  "fixture",
  "receipt",
  "report",
  "repository_snapshot",
  "template",
  "other",
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];
export const sourceKindSchema = z.enum(SOURCE_KINDS);

export const immutableByteReferenceSchema = z.object({
  content_id: sha256,
  byte_length: z.number().int().nonnegative(),
  store: z.literal("immutable_content_addressed"),
  local_ref: boundedString(1024).superRefine((value, context) => {
    if (!/^sqlite:import_byte_vault\/[0-9a-f]{64}$/.test(value)) {
      context.addIssue({ code: "custom", message: "byte reference must use the canonical repository-local SQLite vault ref" });
    }
  }),
}).strict();

export const frozenRepositoryCensusEntryV1Schema = z.object({
  repository_relative_path: boundedString(4096).superRefine((path, context) => {
    try {
      validateRepositoryRelativePath(path, "frozen census entry");
    } catch (error) {
      context.addIssue({ code: "custom", message: error instanceof Error ? error.message : String(error) });
    }
  }),
  tracking_state: repositoryTrackingStateSchema,
  declared_artifact_role: artifactRoleSchema,
}).strict();

export const frozenRepositoryCensusV1Schema = z.object({
  record_type: z.literal("mister-clean.repository-census"),
  schema_version: z.literal("1.0"),
  repository_object_sha256: sha256,
  entries: z.array(frozenRepositoryCensusEntryV1Schema).min(1),
}).strict().superRefine((census, context) => {
  const paths = census.entries.map((entry) => entry.repository_relative_path);
  if (new Set(paths).size !== paths.length) context.addIssue({ code: "custom", message: "frozen census paths must be unique" });
  const ordered = [...paths].sort();
  if (paths.some((path, index) => path !== ordered[index])) context.addIssue({ code: "custom", message: "frozen census entries must use canonical path order" });
});

export const frozenRepositoryCensusEntryV11Schema = frozenRepositoryCensusEntryV1Schema.extend({
  byte_length: z.number().int().nonnegative(),
  sha256,
}).strict();

const censusRelativePath = boundedString(4096).superRefine((path, context) => {
  try { validateRepositoryRelativePath(path, "frozen census scope"); }
  catch (error) { context.addIssue({ code: "custom", message: error instanceof Error ? error.message : String(error) }); }
});

export const frozenRepositoryCensusV11Schema = z.object({
  record_type: z.literal("mister-clean.repository-census"),
  schema_version: z.literal("1.1"),
  repository_object_sha256: sha256,
  algorithm_id: z.literal(FILE_CENSUS_ALGORITHM_ID),
  algorithm_version: z.literal(FILE_CENSUS_ALGORITHM_VERSION),
  scope: z.object({
    roots: z.array(censusRelativePath).min(1),
    recursive: z.literal(true),
    direct_files: z.literal("included"),
    entry_kind: z.literal("regular_file"),
    symlinks: z.literal("reject"),
    special_files: z.literal("reject"),
    exclusions: z.array(censusRelativePath),
  }).strict(),
  summary: z.object({
    file_count: z.number().int().nonnegative(),
    direct_file_count: z.number().int().nonnegative(),
    nested_file_count: z.number().int().nonnegative(),
    total_bytes: z.number().int().nonnegative(),
    aggregate_sha256: sha256,
  }).strict(),
  entries: z.array(frozenRepositoryCensusEntryV11Schema).min(1),
}).strict().superRefine((census, context) => {
  const canonical: FileCensus = {
    record_type: "mister-clean.file-census",
    schema_version: "1.0",
    algorithm_id: census.algorithm_id,
    algorithm_version: census.algorithm_version,
    scope: census.scope,
    summary: census.summary,
    entries: census.entries.map((entry) => ({
      path: entry.repository_relative_path,
      byte_length: entry.byte_length,
      sha256: entry.sha256,
    })),
  };
  for (const error of validateFileCensus(canonical)) {
    context.addIssue({ code: "custom", message: `canonical file census: ${error}` });
  }
});

/** 1.0 remains readable as historical evidence; 1.1 is the content-bound producer schema. */
export const frozenRepositoryCensusSchema = z.union([
  frozenRepositoryCensusV11Schema,
  frozenRepositoryCensusV1Schema,
]);

export const parserDescriptorSchema = z.object({
  parser_identity: identifier,
  parser_version: boundedString(128),
  extraction_rule: boundedString(1024),
  confidence: z.number().finite().min(0).max(1),
}).strict();

export const sourceDescriptorSchema = z.object({
  source_class: sourceClassSchema,
  trust_tier: sourceTrustTierSchema,
  kind: sourceKindSchema,
  artifact_digest: artifactDigestSchema,
  byte_ref: immutableByteReferenceSchema,
  census_evidence: repositoryCensusEvidenceSchema,
  locator: sourceLocatorSchema,
}).strict().superRefine((source, context) => {
  if (source.artifact_digest.sha256 !== source.byte_ref.content_id || source.artifact_digest.byte_length !== source.byte_ref.byte_length) {
    context.addIssue({ code: "custom", message: "byte reference must exactly match artifact digest" });
  }
  if (source.byte_ref.local_ref !== `sqlite:import_byte_vault/${source.artifact_digest.sha256}`) {
    context.addIssue({ code: "custom", message: "byte reference local ref must be content-addressed by the artifact digest" });
  }
  if (source.locator.repository_relative_path !== source.census_evidence.repository_relative_path) {
    context.addIssue({ code: "custom", message: "source locator must exactly match the frozen census path" });
  }
  const expected: Record<SourceClass, { readonly tracking: RepositoryTrackingState | "either"; readonly role: ArtifactRole }> = {
    tracked_machine_contract: { tracking: "tracked", role: "machine_contract" },
    tracked_narrative_observation: { tracking: "tracked", role: "narrative_observation" },
    ignored_local_quarantine: { tracking: "ignored", role: "ignored_quarantine" },
    fixture_template: { tracking: "either", role: "fixture_template" },
  };
  const rule = expected[source.source_class];
  if ((rule.tracking !== "either" && source.census_evidence.tracking_state !== rule.tracking) || source.census_evidence.declared_artifact_role !== rule.role) {
    context.addIssue({ code: "custom", message: "source class must match injected repository census evidence" });
  }
  if ((source.source_class === "tracked_narrative_observation" || source.source_class === "ignored_local_quarantine") && (source.kind === "receipt" || source.kind === "attestation")) {
    context.addIssue({ code: "custom", message: "narrative and ignored-local sources cannot be typed acceptance or receipt evidence" });
  }
  if (source.source_class === "fixture_template" && source.kind !== "fixture" && source.kind !== "template") {
    context.addIssue({ code: "custom", message: "fixture/template source must use fixture or template kind" });
  }
});

export const agentIdentitySchema = z.object({
  agent_tuple_id: knownOrUnknown(512),
  model_id: knownOrUnknown(512),
  harness_id: knownOrUnknown(512),
  reasoning_level: knownOrUnknown(256),
  display_name: knownOrUnknown(512),
}).strict();

export const CLOSEOUT_CLAIM_STATUSES = [
  "claims_closed",
  "claims_not_closed",
  "no_claim",
] as const;

export type CloseoutClaimStatus = (typeof CLOSEOUT_CLAIM_STATUSES)[number];
export const closeoutClaimSchema = z.object({
  status: z.enum(CLOSEOUT_CLAIM_STATUSES),
  verification: z.enum(["unverified", "authority_transition"]),
  basis: boundedString(2048),
}).strict();

export const PAYMENT_STATES = [
  "paid",
  "not_paid",
  "false_positive",
  "unknown",
] as const;

export type PaymentState = (typeof PAYMENT_STATES)[number];
export const paymentStateSchema = z.enum(PAYMENT_STATES);

export const IMPORT_DISPOSITIONS = [
  "normalized",
  "evidence_only",
  "quarantined",
  "rejected",
] as const;

export type ImportDisposition = (typeof IMPORT_DISPOSITIONS)[number];
export const importDispositionSchema = z.enum(IMPORT_DISPOSITIONS);

export const evidenceHandlingSchema = z.enum([
  "considered",
  "ignored",
  "unknown",
]);

export const subjectBindingSchema = z.object({
  artifact_observed_subject: repositorySubjectSchema,
  import_repository_object: importRepositoryObjectSchema,
}).strict();

export const AUTHORITY_TRANSITION_KINDS = ["closure", "payment"] as const;
export const authorityTransitionSchema = z.object({
  record_type: z.literal("mister-clean.import-authority-transition"),
  schema_version: z.literal("1.0"),
  transition_kind: z.enum(AUTHORITY_TRANSITION_KINDS),
  from_state: boundedString(64),
  to_state: boundedString(64),
  subject_repository_object_sha256: sha256,
  evidence_source: sourceDescriptorSchema,
  evidence_record_sha256: sha256,
  occurred_at: isoTimestamp,
  transition_sha256: sha256,
}).strict().superRefine((transition, context) => {
  const allowed = transition.transition_kind === "closure"
    ? new Set(["unknown->open", "unknown->closed", "open->closed"])
    : new Set(["unknown->not_paid", "unknown->paid", "not_paid->paid", "unknown->false_positive", "not_paid->false_positive"]);
  if (!allowed.has(`${transition.from_state}->${transition.to_state}`)) {
    context.addIssue({ code: "custom", message: "authority transition is not an allowed monotonic state transition" });
  }
  if (transition.evidence_source.source_class !== "tracked_machine_contract"
    || transition.evidence_source.trust_tier !== "authoritative"
    || (transition.evidence_source.kind !== "receipt" && transition.evidence_source.kind !== "attestation")) {
    context.addIssue({ code: "custom", message: "closure and payment transitions require authoritative tracked receipt or attestation evidence" });
  }
  if (transition.evidence_source.census_evidence.repository_object_sha256 !== transition.subject_repository_object_sha256) {
    context.addIssue({ code: "custom", message: "authority evidence census must bind the transition subject RepositoryObject" });
  }
  const { transition_sha256: identity, ...content } = transition;
  if (sha256Bytes(canonicalJson(content)) !== identity) context.addIssue({ code: "custom", message: "authority transition identity mismatch" });
});

export const importObservedRecordSchema = z.object({
  record_type: z.literal("mister-clean.import-observed"),
  schema_version: z.literal("1.0"),
  observed_at: isoTimestamp,
  source: sourceDescriptorSchema,
  parser: parserDescriptorSchema,
  subject_binding: subjectBindingSchema,
  content_id: sha256,
  disposition: importDispositionSchema,
  evidence_handling: evidenceHandlingSchema,
  observed_agent: agentIdentitySchema,
  closeout_claim: closeoutClaimSchema,
  declared_payment_state: paymentStateSchema,
  notes: boundedString(4096).optional(),
}).strict().superRefine((record, context) => {
  if (record.closeout_claim.status === "claims_closed" || record.closeout_claim.verification !== "unverified") {
    context.addIssue({ code: "custom", message: "observed source prose cannot establish closure; closure requires a known-now authority transition" });
  }
  if (record.declared_payment_state === "paid") {
    context.addIssue({ code: "custom", message: "observed source prose cannot establish payment; payment requires a known-now authority transition" });
  }
  if ((record.source.source_class === "tracked_narrative_observation" || record.source.source_class === "ignored_local_quarantine" || record.source.source_class === "fixture_template") && record.declared_payment_state === "paid") {
    context.addIssue({ code: "custom", message: "non-contract import sources cannot declare paid" });
  }
  const expectedDisposition = record.source.source_class === "fixture_template" || record.source.source_class === "ignored_local_quarantine"
    ? "quarantined"
    : record.source.source_class === "tracked_narrative_observation" ? "evidence_only" : null;
  if (expectedDisposition !== null && record.disposition !== expectedDisposition) {
    context.addIssue({ code: "custom", message: "source class disposition is policy-bound" });
  }
  const { content_id: identity, ...content } = record;
  try {
    if (sha256Bytes(canonicalJson(content)) !== identity) context.addIssue({ code: "custom", message: "observed record content identity mismatch" });
  } catch (error) {
    context.addIssue({ code: "custom", message: error instanceof Error ? error.message : String(error) });
  }
});

export const knownNowInterpretationSchema = z.object({
  record_type: z.literal("mister-clean.import-known-now"),
  schema_version: z.literal("1.0"),
  interpreted_at: isoTimestamp,
  observed_record_sha256: sha256,
  content_id: sha256,
  source: sourceDescriptorSchema,
  subject_binding: subjectBindingSchema,
  payment_state: paymentStateSchema,
  closeout_claim: closeoutClaimSchema,
  authority_transitions: z.array(authorityTransitionSchema).max(16),
  subject_alignment: z.enum([
    "same_repository_object",
    "different_repository_object",
  ]),
  notes: boundedString(4096).optional(),
}).strict().superRefine((record, context) => {
  const transitionIds = record.authority_transitions.map((transition) => transition.transition_sha256);
  if (new Set(transitionIds).size !== transitionIds.length) context.addIssue({ code: "custom", message: "authority transitions must be unique" });
  const ordered = [...record.authority_transitions].sort((left, right) => left.occurred_at.localeCompare(right.occurred_at) || left.transition_sha256.localeCompare(right.transition_sha256));
  if (record.authority_transitions.some((transition, index) => transition.transition_sha256 !== ordered[index]?.transition_sha256)) {
    context.addIssue({ code: "custom", message: "authority transitions must use canonical chronological order" });
  }
  for (const transition of record.authority_transitions) {
    if (transition.subject_repository_object_sha256 !== record.subject_binding.import_repository_object.sha256) {
      context.addIssue({ code: "custom", message: "authority transition subject must match the import RepositoryObject" });
    }
  }
  for (const kind of AUTHORITY_TRANSITION_KINDS) {
    const chain = record.authority_transitions.filter((transition) => transition.transition_kind === kind);
    for (let index = 1; index < chain.length; index += 1) {
      if (chain[index]!.from_state !== chain[index - 1]!.to_state) {
        context.addIssue({ code: "custom", message: `${kind} authority transitions must form a contiguous state chain` });
      }
    }
  }
  const lastPayment = record.authority_transitions.filter((transition) => transition.transition_kind === "payment").at(-1);
  const expectedPayment = lastPayment?.to_state ?? "unknown";
  if (record.payment_state !== expectedPayment) {
    context.addIssue({ code: "custom", message: "known-now payment state must be derived from authority transitions" });
  }
  const lastClosure = record.authority_transitions.filter((transition) => transition.transition_kind === "closure").at(-1);
  const expectedClosure = lastClosure?.to_state === "closed" ? "claims_closed" : lastClosure?.to_state === "open" ? "claims_not_closed" : "no_claim";
  const expectedVerification = lastClosure ? "authority_transition" : "unverified";
  if (record.closeout_claim.status !== expectedClosure || record.closeout_claim.verification !== expectedVerification) {
    context.addIssue({ code: "custom", message: "known-now closeout claim must be derived from authority transitions" });
  }
  const { content_id: identity, ...content } = record;
  try {
    if (sha256Bytes(canonicalJson(content)) !== identity) context.addIssue({ code: "custom", message: "known-now content identity mismatch" });
  } catch (error) {
    context.addIssue({ code: "custom", message: error instanceof Error ? error.message : String(error) });
  }
});

export const importBatchEntrySchema = z.object({
  source: sourceDescriptorSchema,
  subject_binding: subjectBindingSchema,
  entry_sha256: sha256,
}).strict().superRefine((entry, context) => {
  const { entry_sha256: identity, ...content } = entry;
  if (sha256Bytes(canonicalJson(content)) !== identity) context.addIssue({ code: "custom", message: "batch entry identity mismatch" });
});

export const importBatchBindingSchema = z.object({
  record_type: z.literal("mister-clean.import-batch-binding"),
  schema_version: z.literal("1.0"),
  batch_sha256: sha256,
  import_repository_object: importRepositoryObjectSchema,
  artifact_count: z.number().int().positive(),
  entries: z.array(importBatchEntrySchema).min(1),
}).strict().superRefine((batch, context) => {
  const identities = new Set(batch.entries.map((entry) => entry.entry_sha256));
  if (identities.size !== batch.entries.length) context.addIssue({ code: "custom", message: "duplicate batch entry identity" });
  if (batch.artifact_count !== batch.entries.length) context.addIssue({ code: "custom", message: "batch artifact count mismatch" });
  const ordered = [...batch.entries].sort((left, right) => left.entry_sha256.localeCompare(right.entry_sha256));
  if (batch.entries.some((entry, index) => entry.entry_sha256 !== ordered[index]?.entry_sha256)) {
    context.addIssue({ code: "custom", message: "batch entries must use canonical entry identity order" });
  }
  if (batch.entries.some((entry) => canonicalJson(entry.subject_binding.import_repository_object) !== canonicalJson(batch.import_repository_object))) {
    context.addIssue({ code: "custom", message: "batch entries must bind the declared import RepositoryObject" });
  }
  if (batch.entries.some((entry) => entry.source.census_evidence.repository_object_sha256 !== batch.import_repository_object.sha256)) {
    context.addIssue({ code: "custom", message: "batch source census evidence must bind the declared import RepositoryObject" });
  }
  const batchContent = {
    schema_version: batch.schema_version,
    import_repository_object: batch.import_repository_object,
    entries: batch.entries,
  };
  if (sha256Bytes(canonicalJson(batchContent)) !== batch.batch_sha256) context.addIssue({ code: "custom", message: "batch digest mismatch" });
});

export const REMEDIATION_WAVE_MANIFEST_FIELDS = [
  "record_type",
  "schema_version",
  "manifest_kind",
  "manifest_id",
  "revision",
  "parent_manifest_sha256",
  "run_id",
  "created_at",
  "created_by",
  "authority_mode",
  "repository",
  "target_ref",
  "expected_target_commit",
  "detector_set_sha256",
  "policy_sha256",
  "issue_graph",
  "selected_issue_ids",
  "optimization",
  "waves",
  "lanes",
  "parent_operation_ids",
  "no_harm_comparators",
  "native_gates",
  "rollback",
  "receipt_requirements",
  "projections",
  "terminal_issue_dispositions",
  "hard_boundaries",
  "excluded_actions",
  "self_audit",
] as const;

export type RemediationWaveManifestField = (typeof REMEDIATION_WAVE_MANIFEST_FIELDS)[number];
export const remediationWaveManifestFieldSchema = z.enum(REMEDIATION_WAVE_MANIFEST_FIELDS);

export const legacyDispatchFieldDerivationSchema = z.object({
  field: remediationWaveManifestFieldSchema,
  source_present: z.boolean(),
  value: z.unknown().optional(),
  reason: boundedString(2048).optional(),
}).strict();

export const legacyDispatchBridgeRecordSchema = z.object({
  record_type: z.literal("mister-clean.import-legacy-dispatch-bridge"),
  schema_version: z.literal("1.0"),
  target_manifest_schema_version: z.literal("1.3"),
  legacy_schema_version: knownOrUnknown(128),
  source: sourceDescriptorSchema,
  parser: parserDescriptorSchema,
  legacy_canonical_bytes: z.string().min(1),
  legacy_digest: artifactDigestSchema,
  legacy_source_schema: boundedString(256),
  legacy_record: z.record(z.string(), z.unknown()),
  disposition: z.literal("evidence_only"),
  derived_fields: z.array(legacyDispatchFieldDerivationSchema).max(REMEDIATION_WAVE_MANIFEST_FIELDS.length),
  missing_fields: z.array(remediationWaveManifestFieldSchema).max(REMEDIATION_WAVE_MANIFEST_FIELDS.length),
  complete: z.boolean(),
}).strict().superRefine((bridge, context) => {
  try {
    const bytes = new TextEncoder().encode(bridge.legacy_canonical_bytes);
    if (sha256Bytes(bytes) !== bridge.legacy_digest.sha256 || bytes.byteLength !== bridge.legacy_digest.byte_length) {
      context.addIssue({ code: "custom", message: "legacy canonical bytes do not match preserved digest" });
    }
    if (canonicalJson(bridge.legacy_record) !== bridge.legacy_canonical_bytes) context.addIssue({ code: "custom", message: "legacy record is not the exact preserved canonical bytes" });
  } catch (error) {
    context.addIssue({ code: "custom", message: error instanceof Error ? error.message : String(error) });
  }
  const candidate = Object.fromEntries(bridge.derived_fields.filter((entry) => entry.source_present && entry.value !== undefined).map((entry) => [entry.field, entry.value]));
  const expectedComplete = bridge.missing_fields.length === 0 && remediationWaveManifestSchema.safeParse(candidate).success;
  if (bridge.complete !== expectedComplete) context.addIssue({ code: "custom", message: "bridge completeness is derived, never caller-asserted" });
});

export type ImportRepositoryObject = z.infer<typeof importRepositoryObjectSchema>;
export type ArtifactDigest = z.infer<typeof artifactDigestSchema>;
export type ImmutableByteReference = z.infer<typeof immutableByteReferenceSchema>;
export type RepositoryCensusEvidence = z.infer<typeof repositoryCensusEvidenceSchema>;
export type FrozenRepositoryCensus = z.infer<typeof frozenRepositoryCensusSchema>;
export type SourceLocator = z.infer<typeof sourceLocatorSchema>;
export type ParserDescriptor = z.infer<typeof parserDescriptorSchema>;
export type SourceDescriptor = z.infer<typeof sourceDescriptorSchema>;
export type AgentIdentity = z.infer<typeof agentIdentitySchema>;
export type CloseoutClaim = z.infer<typeof closeoutClaimSchema>;
export type SubjectBinding = z.infer<typeof subjectBindingSchema>;
export type ImportObservedRecord = z.infer<typeof importObservedRecordSchema>;
export type KnownNowInterpretation = z.infer<typeof knownNowInterpretationSchema>;
export type AuthorityTransition = z.infer<typeof authorityTransitionSchema>;
export type ImportBatchBinding = z.infer<typeof importBatchBindingSchema>;
export type LegacyDispatchBridgeRecord = z.infer<typeof legacyDispatchBridgeRecordSchema>;
export type RepositorySubjectBinding = RepositorySubject;
export const UNKNOWN_AGENT_FIELD = UNKNOWN;
