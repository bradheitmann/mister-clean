import { canonicalJson, sha256Bytes } from "../runtime/authority.js";
import {
  type AgentIdentity, type ArtifactDigest, type AuthorityTransition, type CloseoutClaim, type ImportDisposition,
  type ImportObservedRecord, type KnownNowInterpretation, type ParserDescriptor,
  type PaymentState, type SourceDescriptor, type SubjectBinding, type ImmutableByteReference,
  ImportContractError, assertImport, authorityTransitionSchema, importObservedRecordSchema,
  knownNowInterpretationSchema, parseImportSchema,
} from "../contracts/import-provenance.js";
import { classifySource } from "./classification.js";
import { verifyFrozenCensusBinding } from "./census.js";

export type ByteLoader = (reference: ArtifactDigest) => string | Uint8Array;
export interface ImmutableByteStore { readonly load: ByteLoader; }
type SourceInput = Omit<SourceDescriptor, "artifact_digest" | "byte_ref"> & { readonly artifact_digest?: ArtifactDigest; readonly byte_ref?: ImmutableByteReference };

export interface BuildObservedRecordOptions {
  readonly observed_at: string;
  readonly source: SourceInput;
  readonly artifact_bytes?: string | Uint8Array;
  readonly bytes?: string | Uint8Array;
  readonly census_bytes: string | Uint8Array;
  readonly byte_store?: ImmutableByteStore;
  readonly byte_loader?: ByteLoader;
  readonly parser: ParserDescriptor;
  readonly subject_binding: SubjectBinding;
  readonly evidence_handling: "considered" | "ignored" | "unknown";
  readonly observed_agent: AgentIdentity;
  readonly closeout_claim: CloseoutClaim;
  readonly declared_payment_state: PaymentState;
  readonly notes?: string;
}

export interface BuildKnownNowInterpretationOptions {
  readonly interpreted_at: string;
  readonly observed_record: ImportObservedRecord;
  /** Compatibility assertion only. The persisted value is derived from authority_transitions. */
  readonly payment_state?: PaymentState;
  readonly authority_transitions?: readonly AuthorityTransition[];
  readonly notes?: string;
}
export interface ImportHistory { readonly observed: readonly ImportObservedRecord[]; readonly known_now: readonly KnownNowInterpretation[]; }

function bytesOf(value: string | Uint8Array): Uint8Array { return typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value); }
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    if (!Object.isFrozen(value)) Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
function loadAndBindSource(source: SourceInput, options: BuildObservedRecordOptions): SourceDescriptor {
  const supplied = options.artifact_bytes ?? options.bytes
    ?? (source.artifact_digest ? options.byte_store?.load(source.artifact_digest) : undefined)
    ?? (source.artifact_digest ? options.byte_loader?.(source.artifact_digest) : undefined);
  if (supplied === undefined) throw new ImportContractError("IMMUTABLE_BYTES_REQUIRED", "Actual artifact bytes or an immutable byte-store loader are required");
  const bytes = bytesOf(supplied);
  const digest: ArtifactDigest = { algorithm: "sha256", sha256: sha256Bytes(bytes), byte_length: bytes.byteLength };
  if (source.artifact_digest && (source.artifact_digest.sha256 !== digest.sha256 || source.artifact_digest.byte_length !== digest.byte_length)) throw new ImportContractError("DIGEST_MISMATCH", "Imported artifact digest does not match source bytes");
  return { ...source, artifact_digest: digest, byte_ref: { content_id: digest.sha256, byte_length: digest.byte_length, store: "immutable_content_addressed", local_ref: `sqlite:import_byte_vault/${digest.sha256}` } };
}
function observedContentIdentity(record: Omit<ImportObservedRecord, "content_id">): string { return sha256Bytes(canonicalJson(record)); }
function knownNowContentIdentity(record: Omit<KnownNowInterpretation, "content_id">): string { return sha256Bytes(canonicalJson(record)); }

export function observedSemanticKey(record: ImportObservedRecord): string {
  const { observed_at: _subjectObservedAt, ...stableObservedSubject } = record.subject_binding.artifact_observed_subject;
  return sha256Bytes(canonicalJson({
    artifact_sha256: record.source.artifact_digest.sha256,
    artifact_observed_subject: stableObservedSubject,
  }));
}

export function observedSemanticValue(record: ImportObservedRecord): string {
  return sha256Bytes(canonicalJson({
    source: record.source,
    import_repository_object: record.subject_binding.import_repository_object,
    disposition: record.disposition,
    evidence_handling: record.evidence_handling,
    closeout_claim: record.closeout_claim,
    declared_payment_state: record.declared_payment_state,
  }));
}

export function buildObservedRecord(options: BuildObservedRecordOptions): ImportObservedRecord {
  if (options.closeout_claim.status === "claims_closed") throw new ImportContractError("AUTHORITY_TRANSITION_REQUIRED", "Imported source prose cannot establish claims_closed");
  if (options.declared_payment_state === "paid") throw new ImportContractError("AUTHORITY_TRANSITION_REQUIRED", "Imported source prose cannot establish paid");
  const source = loadAndBindSource(options.source, options);
  const censusBinding = verifyFrozenCensusBinding({
    census_bytes: options.census_bytes,
    census_evidence: source.census_evidence,
    locator: source.locator,
    import_repository_object: options.subject_binding.import_repository_object,
    artifact_digest: source.artifact_digest,
  });
  const classifiedDisposition = classifySource({
    source,
    closeout_claim: options.closeout_claim,
    evidence_handling: options.evidence_handling,
  }).disposition;
  const downgraded = censusBinding.authority_ceiling === "legacy_evidence_only"
    && classifiedDisposition === "normalized";
  const disposition = downgraded ? "evidence_only" : classifiedDisposition;
  const notes = [
    options.notes,
    downgraded
      ? "Legacy repository census 1.0 is readable as historical evidence but cannot establish normalized authority without exact per-entry byte and digest binding."
      : undefined,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  const content = {
    record_type: "mister-clean.import-observed" as const, schema_version: "1.0" as const,
    observed_at: options.observed_at, source, parser: options.parser, subject_binding: options.subject_binding,
    disposition, evidence_handling: options.evidence_handling, observed_agent: options.observed_agent,
    closeout_claim: options.closeout_claim, declared_payment_state: options.declared_payment_state,
    ...(notes.length > 0 ? { notes: notes.join("\n\n") } : {}),
  };
  return deepFreeze(parseImportSchema(importObservedRecordSchema, { ...content, content_id: observedContentIdentity(content) }, "observed import record"));
}

export function buildKnownNowInterpretation(options: BuildKnownNowInterpretationOptions): KnownNowInterpretation {
  const observed = parseImportSchema(importObservedRecordSchema, options.observed_record, "observed import record");
  const transitions = [...(options.authority_transitions ?? [])]
    .map((transition) => parseImportSchema(authorityTransitionSchema, transition, "authority transition"))
    .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at) || left.transition_sha256.localeCompare(right.transition_sha256));
  const lastPayment = transitions.filter((transition) => transition.transition_kind === "payment").at(-1);
  const paymentState = (lastPayment?.to_state ?? "unknown") as PaymentState;
  if (options.payment_state !== undefined && options.payment_state !== paymentState) {
    throw new ImportContractError("AUTHORITY_TRANSITION_REQUIRED", "Known-now payment assertion is not supported by the supplied authority transitions");
  }
  const lastClosure = transitions.filter((transition) => transition.transition_kind === "closure").at(-1);
  const closeoutClaim: CloseoutClaim = lastClosure
    ? {
        status: lastClosure.to_state === "closed" ? "claims_closed" : "claims_not_closed",
        verification: "authority_transition",
        basis: `authority transition ${lastClosure.transition_sha256}`,
      }
    : { status: "no_claim", verification: "unverified", basis: "no authority transition" };
  const content = {
    record_type: "mister-clean.import-known-now" as const, schema_version: "1.0" as const,
    interpreted_at: options.interpreted_at, observed_record_sha256: sha256Bytes(canonicalJson(observed)),
    source: observed.source, subject_binding: observed.subject_binding, payment_state: paymentState,
    closeout_claim: closeoutClaim, authority_transitions: transitions,
    subject_alignment: observed.subject_binding.artifact_observed_subject.repository_object_sha256 === observed.subject_binding.import_repository_object.sha256 ? "same_repository_object" as const : "different_repository_object" as const,
    ...(options.notes ? { notes: options.notes } : {}),
  };
  return deepFreeze(parseImportSchema(knownNowInterpretationSchema, { ...content, content_id: knownNowContentIdentity(content) }, "known-now interpretation"));
}

export function appendObservedThenKnownNow(history: ImportHistory, observed: ImportObservedRecord, knownNow: KnownNowInterpretation): ImportHistory {
  const parsedObserved = parseImportSchema(importObservedRecordSchema, observed, "observed import record");
  const parsedKnownNow = parseImportSchema(knownNowInterpretationSchema, knownNow, "known-now interpretation");
  assertImport(parsedObserved.disposition !== "quarantined" && parsedObserved.disposition !== "rejected", "SOURCE_REJECTED", "Quarantined or rejected artifacts cannot enter live observed history");
  assertImport(parsedKnownNow.source.source_class !== "ignored_local_quarantine" && parsedKnownNow.source.source_class !== "fixture_template", "SOURCE_REJECTED", "Quarantined or rejected artifacts cannot enter live known-now history");
  assertImport(parsedKnownNow.observed_record_sha256 === sha256Bytes(canonicalJson(parsedObserved)), "INVALID_IMPORT_RECORD", "Known-now interpretation is not bound to the observed record bytes");
  assertImport(canonicalJson(parsedKnownNow.source) === canonicalJson(parsedObserved.source), "INVALID_SUBJECT_BINDING", "Known-now source does not exactly match observed bytes");
  assertImport(canonicalJson(parsedKnownNow.subject_binding) === canonicalJson(parsedObserved.subject_binding), "INVALID_SUBJECT_BINDING", "Known-now subject does not exactly match observed binding");
  const existingSemantic = history.observed
    .map((entry) => parseImportSchema(importObservedRecordSchema, entry, "history observed record"))
    .find((entry) => observedSemanticKey(entry) === observedSemanticKey(parsedObserved));
  if (existingSemantic) {
    assertImport(observedSemanticValue(existingSemantic) === observedSemanticValue(parsedObserved), "SEMANTIC_CONFLICT", "Same immutable source bytes and observed subject produced conflicting semantics");
    throw new ImportContractError("DUPLICATE_IMPORT_RECORD", "Duplicate immutable source bytes and observed subject; parser version or observation time cannot manufacture a second fact");
  }
  assertImport(!history.observed.some((entry) => entry.content_id === parsedObserved.content_id), "DUPLICATE_IMPORT_RECORD", "Duplicate observed record content identity");
  assertImport(!history.known_now.some((entry) => entry.content_id === parsedKnownNow.content_id), "DUPLICATE_IMPORT_RECORD", "Duplicate known-now record content identity");
  return deepFreeze({ observed: Object.freeze([...history.observed.map((entry) => parseImportSchema(importObservedRecordSchema, entry, "history observed record")), parsedObserved]), known_now: Object.freeze([...history.known_now.map((entry) => parseImportSchema(knownNowInterpretationSchema, entry, "history known-now record")), parsedKnownNow]) });
}

export function closeoutClaimDoesNotImplyPayment(closeoutClaim: CloseoutClaim, declaredPaymentState: PaymentState): { readonly disposition: ImportDisposition; readonly payment_state: PaymentState } {
  if (declaredPaymentState === "paid") throw new ImportContractError("AUTHORITY_TRANSITION_REQUIRED", "Caller prose cannot establish paid without an authority state transition");
  if (closeoutClaim.status === "claims_closed") return { disposition: "evidence_only", payment_state: declaredPaymentState };
  return { disposition: "normalized", payment_state: declaredPaymentState };
}
