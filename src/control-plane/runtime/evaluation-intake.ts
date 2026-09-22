import type { OpenControlPlaneDatabase } from "../persistence/sqlite.js";
import { Buffer } from "node:buffer";
import { isAbsolute } from "node:path";
import type { QualificationLevel } from "../contracts/agent-evaluation.js";
import {
  recordMachineLocalEvaluationOutcome,
  recordMachineLocalEvaluationRunStart,
  registerMachineLocalLogicalProject,
  type EvaluationOutcomeInput,
  type EvaluationRunStartInput,
  type RetainedEvaluationEvidence,
} from "./evaluation-recorder.js";
import { canonicalJson, sha256Bytes } from "./authority.js";
import { ControlPlaneFault, type EvaluationProjectRegisterCommand, type EvaluationRunOutcomeCommand, type EvaluationRunStartCommand } from "./protocol.js";
import { readMisterCleanInvocationJournal } from "../../mister-clean-invocation-journal.js";
import { denyEvaluationIdentityReceipt, issueCapturedEvaluationIdentityReceipt, type EvaluationIdentityObservationAdapter, type EvaluationIdentityReceiptAuthority, type IdentityObservationCapture, type VerifiedEvaluationIdentityReceipt } from "./evaluation-identity-receipt.js";
import { admitCapabilityEvaluatorExecution, executeCapabilityEvaluators, type CapabilityEvaluatorAdapter } from "./capability-evaluator-execution.js";
import { parseRepositoryCapabilityId } from "../contracts/capability-taxonomy.js";
export { ConfiguredEvaluationIdentityReceiptAuthority, type ConfiguredEvaluationIdentityReceipt } from "./evaluation-identity-receipt.js";

/** The service-facing local intake boundary: it stores evidence and evaluates
 * supplied records only. It never invokes a provider or launches a worker. */
export interface EvaluationIntakePort {
  readonly configured: boolean;
  register(input: EvaluationProjectRegisterCommand["input"]): Promise<{ readonly logical_project_id: string; readonly alias_count: number; readonly provenance: "OPERATOR_ATTESTED" }>;
  start(input: EvaluationRunStartCommand["input"]): Promise<{ readonly run_event_id: string; readonly repository_id: string; readonly evaluation_required: boolean; readonly qualification_at_dispatch: QualificationLevel }>;
  outcome(input: EvaluationRunOutcomeCommand["input"]): Promise<{ readonly run_event_id: string; readonly contributes_quality_credit: boolean; readonly qualification_after_outcome: QualificationLevel }>;
}

/** Trusted runtime setup, not the shared client bearer, decides who may bind
 * a logical project. The receipt bytes bind that actor to exact alias IDs. */
export interface LogicalProjectRegistrationAuthority {
  readonly configured: boolean;
  authorize(input: {
    readonly logical_project_id: string;
    readonly aliases: readonly { readonly repository_id: string; readonly attestation_evidence_sha256: string }[];
    readonly registration_evidence_sha256: string;
    readonly registration_evidence_bytes: Uint8Array;
  }): Promise<{ readonly operator_actor_id: string }>;
}

export const denyLogicalProjectRegistration: LogicalProjectRegistrationAuthority = Object.freeze({
  configured: false,
  async authorize() { throw new ControlPlaneFault("FORBIDDEN", "Logical-project registration requires trusted runtime authorization"); },
});

export interface ConfiguredLogicalProjectRegistrationReceipt {
  readonly registration_evidence_sha256: string;
  readonly operator_actor_id: string;
}

/** Minimal local authority: startup configuration allowlists immutable receipt
 * digests. It is deliberately replay-safe only for the exact receipt binding. */
export class ConfiguredLogicalProjectRegistrationAuthority implements LogicalProjectRegistrationAuthority {
  readonly configured = true;
  readonly #receipts: ReadonlyMap<string, string>;
  constructor(receipts: readonly ConfiguredLogicalProjectRegistrationReceipt[]) {
    if (receipts.length === 0 || new Set(receipts.map((receipt) => receipt.registration_evidence_sha256)).size !== receipts.length) throw new Error("Trusted registration authority requires distinct configured receipts");
    this.#receipts = new Map(receipts.map((receipt) => [receipt.registration_evidence_sha256, receipt.operator_actor_id]));
  }
  async authorize(input: Parameters<LogicalProjectRegistrationAuthority["authorize"]>[0]) {
    const actor = this.#receipts.get(input.registration_evidence_sha256);
    if (actor === undefined || sha256Bytes(input.registration_evidence_bytes) !== input.registration_evidence_sha256) throw new ControlPlaneFault("FORBIDDEN", "Registration receipt is not authorized by trusted runtime setup");
    const repositoryIds = input.aliases.map((alias) => alias.repository_id);
    if ([...repositoryIds].sort((left, right) => left.localeCompare(right)).some((id, index) => id !== repositoryIds[index])) throw new ControlPlaneFault("PRECONDITION_FAILED", "Registration aliases must be canonical repository-id order");
    const expected = Buffer.from(canonicalJson({ schema_version: "1.0", record_type: "mister-clean.logical-project-registration", logical_project_id: input.logical_project_id, repository_ids: repositoryIds, authorized_actor_id: actor }), "utf8");
    if (Buffer.compare(Buffer.from(input.registration_evidence_bytes), expected) !== 0) throw new ControlPlaneFault("PRECONDITION_FAILED", "Registration receipt does not bind the authorized actor and exact logical-project aliases");
    return { operator_actor_id: actor };
  }
}

export const denyEvaluationIntake: EvaluationIntakePort = Object.freeze({
  configured: false,
  async register() { throw new ControlPlaneFault("PRECONDITION_FAILED", "Machine-local evaluation intake is not configured"); },
  async start() { throw new ControlPlaneFault("PRECONDITION_FAILED", "Machine-local evaluation intake is not configured"); },
  async outcome() { throw new ControlPlaneFault("PRECONDITION_FAILED", "Machine-local evaluation intake is not configured"); },
});

export class SqliteMachineLocalEvaluationIntake implements EvaluationIntakePort {
  readonly configured = true;
  readonly #database: OpenControlPlaneDatabase;
  readonly #registrationAuthority: LogicalProjectRegistrationAuthority;
  readonly #identityReceiptAuthority: EvaluationIdentityReceiptAuthority;
  readonly #identityObservationAdapter: EvaluationIdentityObservationAdapter | null;
  readonly #capabilityEvaluatorAdapter: CapabilityEvaluatorAdapter | null;
  readonly #invocationJournalPath: string | null;
  /** Dynamic capture receipts remain local to this running intake. After a
   * restart, a caller cannot replay the old lease into quality credit. */
  readonly #capturedDispatchReceipts = new Map<string, { readonly identity_lease: import("../contracts/agent-evaluation.js").AgentIdentityLease; readonly receipt: VerifiedEvaluationIdentityReceipt }>();

  constructor(database: OpenControlPlaneDatabase, registrationAuthority: LogicalProjectRegistrationAuthority = denyLogicalProjectRegistration, invocationJournalPath: string | null = null, identityReceiptAuthority: EvaluationIdentityReceiptAuthority = denyEvaluationIdentityReceipt, capabilityEvaluatorAdapter: CapabilityEvaluatorAdapter | null = null, identityObservationAdapter: EvaluationIdentityObservationAdapter | null = null) {
    if (invocationJournalPath !== null && !isAbsolute(invocationJournalPath)) throw new Error("Mister Clean invocation journal path must be absolute");
    this.#database = database; this.#registrationAuthority = registrationAuthority; this.#invocationJournalPath = invocationJournalPath; this.#identityReceiptAuthority = identityReceiptAuthority; this.#capabilityEvaluatorAdapter = capabilityEvaluatorAdapter; this.#identityObservationAdapter = identityObservationAdapter;
  }

  async #captureIdentity(input: Parameters<NonNullable<EvaluationIdentityObservationAdapter["capture"]>>[0], retainedEvidence: readonly RetainedEvaluationEvidence[]): Promise<{ readonly observation: import("../contracts/agent-evaluation.js").AgentIdentityObservation | null; readonly retainedEvidence: readonly RetainedEvaluationEvidence[]; readonly capture: IdentityObservationCapture }> {
    const capture: IdentityObservationCapture = this.#identityObservationAdapter?.capture === undefined
      ? { observation: this.#identityObservationAdapter === null ? null : await this.#identityObservationAdapter.observe(input), evidence: [] }
      : await this.#identityObservationAdapter.capture(input);
    const merged = [...retainedEvidence];
    for (const evidence of capture.evidence) {
      if (evidence.sha256 !== sha256Bytes(evidence.bytes) || evidence.media_type.trim().length === 0 || evidence.bytes.byteLength === 0) throw new ControlPlaneFault("PRECONDITION_FAILED", "identity observation collector returned invalid retained evidence");
      const existing = merged.find((candidate) => candidate.sha256 === evidence.sha256);
      if (existing !== undefined) {
        if (existing.media_type !== evidence.media_type || Buffer.compare(Buffer.from(existing.bytes), Buffer.from(evidence.bytes)) !== 0) throw new ControlPlaneFault("CONFLICT", "identity observation evidence digest is bound to different bytes");
      } else merged.push(evidence as RetainedEvaluationEvidence);
    }
    return { observation: capture.observation, retainedEvidence: merged, capture };
  }

  /** Reconciliation records unobserved CLI facts only. It never promotes a
   * journal line into a profile, route, identity, sampling ordinal, or trial. */
  reconcileInvocations(importedAt: string): void {
    if (this.#invocationJournalPath === null) return;
    const journalPathSha256 = sha256Bytes(this.#invocationJournalPath);
    for (const invocation of readMisterCleanInvocationJournal(this.#invocationJournalPath)) {
      this.#database.database.query(
        `INSERT INTO local_mister_clean_invocations(invocation_id, command, argv_sha256, observed_at, identity_provenance, receipt_sha256, journal_path_sha256, imported_at)
         VALUES (?, ?, ?, ?, 'UNOBSERVED', ?, ?, ?)
         ON CONFLICT(invocation_id) DO NOTHING`,
      ).run(invocation.invocation_id, invocation.command, invocation.argv_sha256, invocation.observed_at, invocation.receipt_sha256, journalPathSha256, importedAt);
      const persisted = this.#database.database.query<{ command: string; argv_sha256: string; observed_at: string; receipt_sha256: string; journal_path_sha256: string }>(
        "SELECT command, argv_sha256, observed_at, receipt_sha256, journal_path_sha256 FROM local_mister_clean_invocations WHERE invocation_id = ?",
      ).get(invocation.invocation_id);
      if (persisted === null || persisted.command !== invocation.command || persisted.argv_sha256 !== invocation.argv_sha256 || persisted.observed_at !== invocation.observed_at || persisted.receipt_sha256 !== invocation.receipt_sha256 || persisted.journal_path_sha256 !== journalPathSha256) {
        throw new Error("invocation_id is already bound to different machine-local journal content");
      }
    }
  }

  async register(input: EvaluationProjectRegisterCommand["input"]) {
    try {
      const receipt = input.retained_evidence.find((item) => item.sha256 === input.registration_evidence_sha256);
      if (receipt === undefined) throw new ControlPlaneFault("PRECONDITION_FAILED", "Registration receipt must be retained in this request");
      const authorization = await this.#registrationAuthority.authorize({ ...input, registration_evidence_bytes: receipt.bytes });
      return registerMachineLocalLogicalProject(this.#database, { ...input, operator_actor_id: authorization.operator_actor_id });
    } catch (error) {
      if (error instanceof Error && /already bound|incompatible logical-project/i.test(error.message)) {
        throw new ControlPlaneFault("CONFLICT", "Logical-project registration conflicts with immutable local provenance");
      }
      throw error;
    }
  }

  async start(input: EvaluationRunStartCommand["input"]) {
    this.reconcileInvocations(input.start.run && typeof input.start.run === "object" && input.start.run !== null && typeof (input.start.run as { started_at?: unknown }).started_at === "string" ? (input.start.run as { started_at: string }).started_at : new Date().toISOString());
    let result;
    const startLease = input.start.identity_lease as import("../contracts/agent-evaluation.js").AgentIdentityLease;
    const startRunEventId = (input.start.treatment as { run_event_id?: unknown } | undefined)?.run_event_id;
    const capturedPreDispatch = typeof startRunEventId === "string" && this.#identityObservationAdapter !== null
      ? await this.#captureIdentity({ phase: "pre_dispatch", run_event_id: startRunEventId, requested_tuple: startLease.requested_tuple, execution_route_id: startLease.execution_route_id, invocation_ids: input.invocation_ids, retained_evidence: input.retained_evidence }, input.retained_evidence)
      : { observation: null, retainedEvidence: input.retained_evidence, capture: { observation: null, evidence: [] } };
    const observedPreDispatch = capturedPreDispatch.observation;
    const effectiveStartLease = { ...startLease, pre_dispatch: observedPreDispatch };
    const capturedDispatchReceipt = typeof startRunEventId === "string" && this.#identityObservationAdapter !== null
      ? issueCapturedEvaluationIdentityReceipt({ phase: "pre_dispatch", run_event_id: startRunEventId, identity_lease: effectiveStartLease, invocation_ids: input.invocation_ids }, this.#identityObservationAdapter, capturedPreDispatch.capture)
      : null;
    const preDispatchReceipt = capturedDispatchReceipt ?? (typeof startRunEventId === "string"
      ? this.#identityReceiptAuthority.authorize({ phase: "pre_dispatch", run_event_id: startRunEventId, identity_lease: effectiveStartLease, invocation_ids: input.invocation_ids, retained_evidence: capturedPreDispatch.retainedEvidence })
      : null);
    try { result = recordMachineLocalEvaluationRunStart(this.#database, {
      ...input.start,
      identity_lease: effectiveStartLease,
      invocation_ids: input.invocation_ids,
      pre_dispatch_receipt_verification: preDispatchReceipt,
      retained_evidence: capturedPreDispatch.retainedEvidence,
    } as EvaluationRunStartInput); } catch (error) {
      if (error instanceof Error && /imported identity-unobserved CLI invocation receipts/.test(error.message)) throw new ControlPlaneFault("PRECONDITION_FAILED", error.message);
      if (error instanceof Error && /already bound to an immutable evaluation trial source/.test(error.message)) throw new ControlPlaneFault("CONFLICT", error.message);
      throw error;
    }
    if (capturedDispatchReceipt !== null) this.#capturedDispatchReceipts.set(result.run_event_id, { identity_lease: effectiveStartLease, receipt: capturedDispatchReceipt });
    return { run_event_id: result.run_event_id, repository_id: result.repository_id, evaluation_required: result.evaluation_required, qualification_at_dispatch: result.qualification_at_dispatch };
  }

  async outcome(input: EvaluationRunOutcomeCommand["input"]) {
    if (this.#capabilityEvaluatorAdapter === null) throw new ControlPlaneFault("PRECONDITION_FAILED", "Evaluation outcome requires a trusted runtime evaluator adapter");
    const outcome = input.outcome as unknown as EvaluationOutcomeInput & { readonly evaluations?: unknown };
    if (Object.hasOwn(outcome, "evaluations")) throw new ControlPlaneFault("INVALID_REQUEST", "Direct caller-provided evaluator outcomes are not admitted; the configured evaluator adapter must execute canonical cases");
    const outcomeRunEventId = outcome.run_event_id;
    const run = this.#database.database.query<{ capability_id: string }>("SELECT capability_id FROM agent_run_events WHERE run_event_id = ?").get(outcomeRunEventId);
    if (run === null) throw new ControlPlaneFault("PRECONDITION_FAILED", "Evaluation outcome requires a previously recorded run");
    const execution = executeCapabilityEvaluators({
      capability_id: parseRepositoryCapabilityId(run.capability_id),
      worker_actor_id: outcome.worker_actor_id,
      author_actor_id: outcome.author_actor_id,
      retained_evidence: input.retained_evidence,
      adapter: this.#capabilityEvaluatorAdapter,
    });
    let evaluations;
    try { evaluations = admitCapabilityEvaluatorExecution(execution); } catch (error) {
      throw new ControlPlaneFault("PRECONDITION_FAILED", error instanceof Error ? error.message : String(error));
    }
    const invocationIds = this.#database.database.query<{ invocation_id: string }>("SELECT invocation_id FROM evaluation_run_invocations WHERE run_event_id = ? ORDER BY invocation_id").all(outcomeRunEventId).map((row) => row.invocation_id);
    const callerLease = outcome.identity_lease;
    const capturedDispatch = this.#capturedDispatchReceipts.get(outcomeRunEventId);
    if (capturedDispatch !== undefined && (callerLease.identity_lease_id !== capturedDispatch.identity_lease.identity_lease_id
      || callerLease.execution_route_id !== capturedDispatch.identity_lease.execution_route_id
      || canonicalJson(callerLease.requested_tuple) !== canonicalJson(capturedDispatch.identity_lease.requested_tuple))) {
      throw new ControlPlaneFault("PRECONDITION_FAILED", "Evaluation outcome cannot replace the collector-bound dispatch identity lease");
    }
    const originalLease = capturedDispatch === undefined
      ? callerLease
      : { ...callerLease, pre_dispatch: capturedDispatch.identity_lease.pre_dispatch };
    const preDispatchReceipt = capturedDispatch?.receipt ?? this.#identityReceiptAuthority.authorize({ phase: "pre_dispatch", run_event_id: outcomeRunEventId, identity_lease: originalLease, invocation_ids: invocationIds, retained_evidence: input.retained_evidence });
    const capturedPreEvaluation = this.#identityObservationAdapter === null
      ? { observation: null, retainedEvidence: input.retained_evidence, capture: { observation: null, evidence: [] } }
      : await this.#captureIdentity({ phase: "pre_evaluation", run_event_id: outcomeRunEventId, requested_tuple: originalLease.requested_tuple, execution_route_id: originalLease.execution_route_id, invocation_ids: invocationIds, retained_evidence: input.retained_evidence }, input.retained_evidence);
    const observedPreEvaluation = capturedPreEvaluation.observation;
    const effectiveOutcomeLease = { ...originalLease, pre_dispatch: preDispatchReceipt === null ? null : originalLease.pre_dispatch, pre_evaluation: observedPreEvaluation };
    const capturedEvaluationReceipt = this.#identityObservationAdapter === null
      ? null
      : issueCapturedEvaluationIdentityReceipt({ phase: "pre_evaluation", run_event_id: outcomeRunEventId, identity_lease: effectiveOutcomeLease, invocation_ids: invocationIds }, this.#identityObservationAdapter, capturedPreEvaluation.capture);
    const preEvaluationReceipt = capturedEvaluationReceipt ?? this.#identityReceiptAuthority.authorize({ phase: "pre_evaluation", run_event_id: outcomeRunEventId, identity_lease: effectiveOutcomeLease, invocation_ids: invocationIds, retained_evidence: capturedPreEvaluation.retainedEvidence });
    const result = recordMachineLocalEvaluationOutcome(this.#database, {
      ...outcome,
      identity_lease: effectiveOutcomeLease,
      evaluations,
      evaluator_execution_receipts: execution.execution_receipts,
      pre_evaluation_receipt_verification: preEvaluationReceipt,
      retained_evidence: capturedPreEvaluation.retainedEvidence,
    } as EvaluationOutcomeInput);
    this.#capturedDispatchReceipts.delete(outcomeRunEventId);
    return { run_event_id: result.run_event_id, contributes_quality_credit: result.contributes_quality_credit, qualification_after_outcome: result.qualification_after_outcome };
  }
}
