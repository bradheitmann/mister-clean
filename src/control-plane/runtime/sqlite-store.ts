import type {
  AgentTupleId,
  CapabilityId,
  ControlSurfaceId,
  DetectorSetId,
  DirectiveId,
  HarnessId,
  IsoTimestamp,
  IssueId,
  ManifestId,
  ModelId,
  ReceiptId,
  RepositoryId,
  RunId,
  Sha256,
} from "../contracts/primitives.js";
import { parseRepositoryCapabilityId } from "../contracts/capability-taxonomy.js";
import {
  DIRECTIVE_STATES,
  type DirectiveState,
  type ManifestRevision,
} from "../contracts/wave-directive.js";
import type { OpenControlPlaneDatabase } from "../persistence/sqlite.js";
import {
  canonicalJson,
  parseCanonicalManifest,
  parseCanonicalReceipt,
  repositorySubjectSchema,
  type RuntimeBoundReceipt,
  sha256Bytes,
} from "./authority.js";
import {
  ControlPlaneFault,
  type AgentView,
  type CapabilityTrialSummary,
  type DirectiveEventView,
  type EvidenceInput,
  type IssueView,
  type PendingEvaluationInvocationView,
  type PendingEvaluationInvocationsView,
  type RunView,
} from "./protocol.js";
import type {
  ClosingRepositoryObject,
  DirectiveAppendResult,
  RepositoryControlPlaneStore,
} from "./service.js";
import {
  assertDirectiveAppendSealed,
  type AuthorizedDirectiveAppendRequest,
} from "./transition-seal.js";
import { deriveQualification, type QualificationEvidence } from "../domain/qualification.js";

interface RunRow {
  readonly run_id: string;
  readonly repository_id: string;
  readonly mister_clean_version: string;
  readonly detector_set_id: string;
  readonly detector_set_sha256: string;
  readonly created_at: string;
}

interface ManifestRow {
  readonly manifest_id: string;
  readonly revision: number;
  readonly run_id: string;
  readonly parent_manifest_sha256: string | null;
  readonly manifest_sha256: string;
  readonly canonical_manifest_json: string;
  readonly created_at: string;
}

interface IssueRow {
  readonly issue_id: string;
  readonly repository_id: string;
  readonly stable_cause_key: string;
  readonly normalizer: string;
  readonly first_detected_run_id: string;
  readonly current_state: string | null;
  readonly last_changed_at: string | null;
}

interface AgentRow {
  readonly agent_tuple_id: string;
  readonly model_id: string;
  readonly model_name: string;
  readonly model_family: string;
  readonly harness_id: string;
  readonly harness_name: string;
  readonly reasoning_level: string;
}

interface PendingEvaluationInvocationRow {
  readonly invocation_id: string;
  readonly command: string;
  readonly argv_sha256: string;
  readonly observed_at: string;
  readonly receipt_sha256: string;
  readonly pending_count: number;
}

interface CreditedTrialRow {
  readonly trial_id: string;
  readonly agent_tuple_id: string;
  readonly capability_id: string;
  /** Actual machine-local repository provenance; legacy cohort labels never
   * satisfy the distinct-repository qualification requirement. */
  readonly repository_id: string;
  /** Null until provenance-backed logical-project aliasing is implemented. */
  readonly logical_project_id: string | null;
  readonly verified_success: number;
  readonly independent_evaluation: number;
  readonly pre_dispatch_observation_id: string;
  readonly pre_evaluation_observation_id: string;
  readonly pre_dispatch_observed_at: string;
  readonly pre_evaluation_observed_at: string;
  readonly pre_dispatch_evidence_sha256: string;
  readonly pre_evaluation_evidence_sha256: string;
  readonly trial_evidence_sha256: string;
  readonly worker_actor_id: string;
  readonly author_actor_id: string;
  readonly pre_dispatch_observer_actor_id: string;
  readonly pre_evaluation_observer_actor_id: string;
  readonly evaluator_actor_id: string;
  readonly evaluation_evidence_digests_json: string;
}

export const CREDITED_TRIALS = `
  WITH credited_trials AS (
    SELECT t.trial_id, t.agent_tuple_id, t.capability_id, t.repository_id, alias.logical_project_id,
      CASE WHEN t.verified_success = 0 OR EXISTS (
        SELECT 1
        FROM trial_evaluations result
        JOIN capability_evaluators evaluator ON evaluator.evaluator_id = result.evaluator_id
        WHERE result.trial_id = t.trial_id
          AND evaluator.capability_id = t.capability_id
          AND evaluator.active = 1
          AND evaluator.evaluation_dimension = 'verified_success'
          AND result.result = 0
      ) THEN 0 ELSE 1 END AS verified_success,
      CASE WHEN EXISTS (
        SELECT 1
        FROM trial_evaluations result
        JOIN capability_evaluators evaluator ON evaluator.evaluator_id = result.evaluator_id
        WHERE result.trial_id = t.trial_id
          AND evaluator.capability_id = t.capability_id
          AND evaluator.active = 1
          AND evaluator.evaluation_dimension = 'independent_evaluation'
          AND evaluator.independent_evaluator = 1
          AND result.result = 1
          AND result.evaluator_actor_id IS NOT NULL
          AND result.evaluator_actor_id NOT IN (
            t.worker_actor_id, t.author_actor_id,
            dispatch.observer_actor_id, evaluation.observer_actor_id
          )
      ) THEN 1 ELSE 0 END AS independent_evaluation,
      dispatch.observation_id AS pre_dispatch_observation_id,
      evaluation.observation_id AS pre_evaluation_observation_id,
      dispatch.observed_at AS pre_dispatch_observed_at,
      evaluation.observed_at AS pre_evaluation_observed_at,
      dispatch.evidence_sha256 AS pre_dispatch_evidence_sha256,
      evaluation.evidence_sha256 AS pre_evaluation_evidence_sha256,
      t.evidence_sha256 AS trial_evidence_sha256,
      t.worker_actor_id, t.author_actor_id,
      dispatch.observer_actor_id AS pre_dispatch_observer_actor_id,
      evaluation.observer_actor_id AS pre_evaluation_observer_actor_id,
      (
        SELECT MIN(result.evaluator_actor_id)
        FROM trial_evaluations result
        JOIN capability_evaluators evaluator ON evaluator.evaluator_id = result.evaluator_id
        WHERE result.trial_id = t.trial_id
          AND evaluator.capability_id = t.capability_id
          AND evaluator.active = 1
      ) AS evaluator_actor_id,
      (
        SELECT json_group_array(evidence_sha256)
        FROM (
          SELECT result.evidence_sha256
          FROM trial_evaluations result
          JOIN capability_evaluators evaluator ON evaluator.evaluator_id = result.evaluator_id
          WHERE result.trial_id = t.trial_id
            AND evaluator.capability_id = t.capability_id
            AND evaluator.active = 1
          ORDER BY result.evaluator_id
        )
      ) AS evaluation_evidence_digests_json
    FROM trials t
    JOIN agent_run_events r ON r.run_event_id = t.run_event_id
      AND r.agent_tuple_id = t.agent_tuple_id
      AND r.capability_id = t.capability_id
      AND r.repository_id = t.repository_id
    JOIN local_repository_identities repository ON repository.repository_id = t.repository_id
    LEFT JOIN logical_project_repository_aliases alias ON alias.repository_id = t.repository_id
    JOIN execution_routes route ON route.execution_route_id = r.execution_route_id
      AND route.agent_tuple_id = t.agent_tuple_id
    JOIN agent_tuples tuple ON tuple.agent_tuple_id = t.agent_tuple_id
    JOIN agent_identity_observations dispatch ON dispatch.identity_lease_id = r.identity_lease_id
      AND dispatch.phase = 'pre_dispatch'
      AND dispatch.requested_agent_tuple_id = t.agent_tuple_id
      AND dispatch.execution_route_id = r.execution_route_id
      AND dispatch.observed_model_id = tuple.model_id
      AND dispatch.observed_harness_id = tuple.harness_id
      AND dispatch.observed_reasoning_level = tuple.reasoning_level
    JOIN agent_identity_observations evaluation ON evaluation.identity_lease_id = r.identity_lease_id
      AND evaluation.phase = 'pre_evaluation'
      AND evaluation.requested_agent_tuple_id = t.agent_tuple_id
      AND evaluation.execution_route_id = r.execution_route_id
      AND evaluation.observed_model_id = tuple.model_id
      AND evaluation.observed_harness_id = tuple.harness_id
      AND evaluation.observed_reasoning_level = tuple.reasoning_level
    JOIN agent_identity_observation_targets dispatch_target ON dispatch_target.observation_id = dispatch.observation_id
    JOIN agent_identity_observation_targets evaluation_target ON evaluation_target.observation_id = evaluation.observation_id
    JOIN evaluation_identity_receipt_verifications dispatch_receipt ON dispatch_receipt.run_event_id = r.run_event_id
      AND dispatch_receipt.phase = 'pre_dispatch'
      AND dispatch_receipt.identity_assurance IN ('active_harness_selection', 'provider_execution_attested')
    JOIN evaluation_identity_receipt_verifications evaluation_receipt ON evaluation_receipt.run_event_id = r.run_event_id
      AND evaluation_receipt.phase = 'pre_evaluation'
      AND evaluation_receipt.identity_assurance IN ('active_harness_selection', 'provider_execution_attested')
    JOIN evaluation_dispatch_subjects dispatch_subject ON dispatch_subject.run_event_id = r.run_event_id
    JOIN evaluation_evaluated_candidates evaluated_candidate ON evaluated_candidate.run_event_id = r.run_event_id
    JOIN agent_evaluation_evidence dispatch_evidence ON dispatch_evidence.evidence_sha256 = dispatch.evidence_sha256
    JOIN agent_evaluation_evidence evaluation_evidence ON evaluation_evidence.evidence_sha256 = evaluation.evidence_sha256
    JOIN agent_evaluation_evidence trial_evidence ON trial_evidence.evidence_sha256 = t.evidence_sha256
    WHERE t.identity_disposition = 'BOUND_FOR_EVALUATION'
      AND t.contributes_quality_credit = 1
      AND t.repository_id IS NOT NULL
      AND r.evaluation_required = 1
      AND length(trim(t.worker_actor_id)) > 0
      AND length(trim(t.author_actor_id)) > 0
      AND t.worker_actor_id <> t.author_actor_id
      AND length(trim(dispatch.observation_id)) > 0 AND length(trim(evaluation.observation_id)) > 0
      AND dispatch.observation_id <> evaluation.observation_id
      AND dispatch.evidence_sha256 <> evaluation.evidence_sha256
      AND length(trim(dispatch.observer_actor_id)) > 0 AND length(trim(evaluation.observer_actor_id)) > 0
      AND dispatch.observer_actor_id NOT IN (t.worker_actor_id, t.author_actor_id)
      AND evaluation.observer_actor_id NOT IN (t.worker_actor_id, t.author_actor_id, dispatch.observer_actor_id)
      AND length(trim(dispatch.harness_session_token)) > 0 AND length(trim(evaluation.harness_session_token)) > 0
      AND length(trim(dispatch.harness_session_token)) > 0 AND length(trim(evaluation.harness_session_token)) > 0
      AND dispatch.harness_session_token = evaluation.harness_session_token
      AND dispatch_target.target_kind = evaluation_target.target_kind
      AND dispatch_target.target_sha256 <> '' AND evaluation_target.target_sha256 <> ''
      AND dispatch_target.local_target_binding = 'bound_authorized_checkout'
      AND evaluation_target.local_target_binding = 'bound_authorized_checkout'
      AND dispatch_target.target_git_evidence_sha256 IS NOT NULL
      AND evaluation_target.target_git_evidence_sha256 IS NOT NULL
      AND dispatch_target.canonical_git_top_level = evaluation_target.canonical_git_top_level
      AND dispatch_target.canonical_git_common_directory = evaluation_target.canonical_git_common_directory
      AND (
        (dispatch_target.target_kind = 'cmux' AND dispatch_target.target_sha256 = evaluation_target.target_sha256)
        OR (dispatch_target.target_kind = 'desktop'
          AND json_extract(dispatch_target.canonical_target_json, '$.application_id') = json_extract(evaluation_target.canonical_target_json, '$.application_id')
          AND json_extract(dispatch_target.canonical_target_json, '$.thread_id') = json_extract(evaluation_target.canonical_target_json, '$.thread_id')
          AND json_extract(dispatch_target.canonical_target_json, '$.session_id') = json_extract(evaluation_target.canonical_target_json, '$.session_id')
          AND json_extract(dispatch_target.canonical_target_json, '$.settings_record_sha256') = json_extract(evaluation_target.canonical_target_json, '$.settings_record_sha256')
        )
        OR (dispatch_target.target_kind = 'headless' AND dispatch_target.target_sha256 = evaluation_target.target_sha256)
      )
      AND (dispatch_target.target_kind = 'headless' OR (
        length(trim(dispatch.process_instance_token)) > 0 AND length(trim(evaluation.process_instance_token)) > 0
        AND dispatch.process_instance_token = evaluation.process_instance_token
      ))
      -- Dispatch identity must be observed no later than run start; the
      -- evaluation identity is observed after task completion and before the
      -- separately recorded evaluation outcome. Do not infer a stricter order
      -- merely from receipt timestamps.
      AND dispatch.observed_at <= r.occurred_at
      AND evaluation.observed_at >= t.completed_at
      AND EXISTS (SELECT 1 FROM agent_identity_lease_events issued WHERE issued.identity_lease_id = r.identity_lease_id
        AND issued.event_kind = 'issued' AND issued.requested_agent_tuple_id = t.agent_tuple_id AND issued.execution_route_id = r.execution_route_id)
      AND EXISTS (SELECT 1 FROM agent_identity_lease_events bound WHERE bound.identity_lease_id = r.identity_lease_id
        AND bound.event_kind = 'pre_dispatch_bound' AND bound.observation_id = dispatch.observation_id
        AND bound.requested_agent_tuple_id = t.agent_tuple_id AND bound.execution_route_id = r.execution_route_id)
      AND EXISTS (SELECT 1 FROM agent_identity_lease_events bound WHERE bound.identity_lease_id = r.identity_lease_id
        AND bound.event_kind = 'pre_evaluation_bound' AND bound.observation_id = evaluation.observation_id
        AND bound.requested_agent_tuple_id = t.agent_tuple_id AND bound.execution_route_id = r.execution_route_id)
      AND NOT EXISTS (SELECT 1 FROM agent_identity_lease_events disqualifying WHERE disqualifying.identity_lease_id = r.identity_lease_id
        AND disqualifying.event_kind IN ('mismatch', 'invalidated'))
      AND NOT EXISTS (
        SELECT 1
        FROM trials replay
        JOIN agent_run_events replay_run ON replay_run.run_event_id = replay.run_event_id
        WHERE replay.trial_id <> t.trial_id
          AND replay.contributes_quality_credit = 1
          AND replay.identity_disposition = 'BOUND_FOR_EVALUATION'
          AND replay_run.identity_lease_id = r.identity_lease_id
      )
      AND EXISTS (
        SELECT 1 FROM capability_evaluators evaluator
        WHERE evaluator.capability_id = t.capability_id
          AND evaluator.active = 1
          AND evaluator.evaluation_dimension = 'verified_success'
      )
      AND EXISTS (
        SELECT 1 FROM capability_evaluators evaluator
        WHERE evaluator.capability_id = t.capability_id
          AND evaluator.active = 1
          AND evaluator.evaluation_dimension = 'independent_evaluation'
          AND evaluator.independent_evaluator = 1
      )
      AND EXISTS (
        SELECT 1 FROM capability_evaluators evaluator
        WHERE evaluator.capability_id = t.capability_id
          AND evaluator.active = 1
          AND evaluator.evaluation_dimension = 'no_harm'
      )
      AND EXISTS (
        SELECT 1 FROM capability_evaluators evaluator
        WHERE evaluator.capability_id = t.capability_id
          AND evaluator.active = 1
          AND evaluator.evaluation_dimension = 'authority'
      )
      AND NOT EXISTS (
        SELECT 1 FROM capability_evaluators evaluator
        WHERE evaluator.capability_id = t.capability_id AND evaluator.active = 1
          AND NOT EXISTS (
            SELECT 1 FROM trial_evaluations result
            WHERE result.trial_id = t.trial_id
              AND result.evaluator_id = evaluator.evaluator_id
              AND result.result IN (0, 1)
              AND result.evaluator_actor_id IS NOT NULL
              AND length(trim(result.evaluator_actor_id)) > 0
              AND EXISTS (
                SELECT 1 FROM agent_evaluation_evidence retained
                WHERE retained.evidence_sha256 = result.evidence_sha256
              )
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM trial_evaluations result
        JOIN capability_evaluators evaluator ON evaluator.evaluator_id = result.evaluator_id
        WHERE result.trial_id = t.trial_id
          AND evaluator.active = 1
          AND evaluator.capability_id = t.capability_id
          AND result.evaluator_actor_id IN (
            t.worker_actor_id, t.author_actor_id,
            dispatch.observer_actor_id, evaluation.observer_actor_id
          )
      )
      AND 1 = (
        SELECT COUNT(DISTINCT result.evaluator_actor_id)
        FROM trial_evaluations result
        JOIN capability_evaluators evaluator ON evaluator.evaluator_id = result.evaluator_id
        WHERE result.trial_id = t.trial_id
          AND evaluator.active = 1
          AND evaluator.capability_id = t.capability_id
      )
  )`;

/**
 * Reuses the same evidence-derived credit projection shown to the router.
 * Intake calls this before recording a new run so sampling cannot be advanced
 * by legacy cohort labels or by rows with missing retained evidence.
 */
export function readQualificationEvidence(
  global: OpenControlPlaneDatabase,
  agentTupleId: string,
  capabilityId: string,
): QualificationEvidence {
  if (global.kind !== "global") throw new Error("qualification evidence requires the machine-local global database");
  const retainedEvidence = global.database.query<{ evidence_sha256: string; evidence_bytes: Uint8Array }>(
    "SELECT evidence_sha256, evidence_bytes FROM agent_evaluation_evidence",
  ).all();
  const validDigests = new Set(retainedEvidence
    .filter((evidence) => sha256Bytes(evidence.evidence_bytes) === evidence.evidence_sha256)
    .map((evidence) => evidence.evidence_sha256));
  const rows = global.database.query<CreditedTrialRow>(
    `${CREDITED_TRIALS}
     SELECT * FROM credited_trials WHERE agent_tuple_id = ? AND capability_id = ? ORDER BY trial_id`,
  ).all(agentTupleId, capabilityId).filter((trial) => {
    try {
      const evaluationDigests = JSON.parse(trial.evaluation_evidence_digests_json) as unknown;
      return Array.isArray(evaluationDigests)
        && evaluationDigests.length > 0
        && evaluationDigests.every((digest) => typeof digest === "string" && validDigests.has(digest))
        && validDigests.has(trial.pre_dispatch_evidence_sha256)
        && validDigests.has(trial.pre_evaluation_evidence_sha256)
        && validDigests.has(trial.trial_evidence_sha256);
    } catch {
      return false;
    }
  });
  const unresolved = global.database.query<{ event_kind: string }>(
    `SELECT event_kind FROM qualification_events q
     WHERE agent_tuple_id = ? AND capability_id = ?
       AND event_kind IN ('no_harm_violation', 'authority_violation', 'explicit_disqualification')
       AND NOT EXISTS (
         SELECT 1 FROM qualification_events resolved
         WHERE resolved.related_event_id = q.event_id
           AND ((q.event_kind IN ('no_harm_violation', 'authority_violation') AND resolved.event_kind = 'violation_resolved')
             OR (q.event_kind = 'explicit_disqualification' AND resolved.event_kind = 'disqualification_lifted'))
       )`,
  ).all(agentTupleId, capabilityId);
  return {
    verified_trials: rows.length,
    verified_successes: rows.reduce((sum, trial) => sum + trial.verified_success, 0),
    // Physical Git identities prevent worktree duplication, but clones/moves
    // cannot establish distinct logical projects without alias provenance.
    repository_cohort_count: new Set(rows.flatMap((trial) => trial.logical_project_id === null ? [] : [trial.logical_project_id])).size,
    independently_evaluated: rows.every((trial) => trial.independent_evaluation === 1),
    unresolved_no_harm_violations: unresolved.filter((event) => event.event_kind === "no_harm_violation").length,
    unresolved_authority_violations: unresolved.filter((event) => event.event_kind === "authority_violation").length,
    explicitly_disqualified: unresolved.some((event) => event.event_kind === "explicit_disqualification"),
  };
}

interface DirectiveRow {
  readonly directive_id: string;
  readonly sequence: number;
  readonly run_id: string;
  readonly manifest_id: string;
  readonly manifest_revision: number;
  readonly from_state: string | null;
  readonly to_state: string;
  readonly control_surface_id: string | null;
  readonly event_json: string;
  readonly occurred_at: string;
}

interface ReceiptRow {
  readonly receipt_id: string;
  readonly run_id: string;
  readonly manifest_id: string;
  readonly manifest_revision: number;
  readonly repository_object_sha256: string;
  readonly receipt_sha256: string;
  readonly receipt_json: string;
  readonly sealed_at: string;
}

interface ClosingObjectRow {
  readonly event_id: string;
  readonly sequence: number;
  readonly repository_object_sha256: string;
  readonly payload_json: string;
}

const SHA256 = /^[0-9a-f]{64}$/;
const DIRECTIVE_STATE_SET = new Set<string>(DIRECTIVE_STATES);
const DIRECTIVE_TRANSITIONS: ReadonlyMap<string | null, ReadonlySet<string>> = new Map([
  [null, new Set(["recommended"])],
  ["recommended", new Set(["projected"])],
  ["projected", new Set(["copied", "queued"])],
  ["copied", new Set()],
  ["queued", new Set(["delivered", "failed", "delivery_uncertain"])],
  ["delivered", new Set(["accepted", "failed", "delivery_uncertain"])],
  ["accepted", new Set(["running", "failed"])],
  ["running", new Set(["completed", "failed"])],
  ["completed", new Set(["verified"])],
  ["verified", new Set()],
  ["failed", new Set()],
  ["delivery_uncertain", new Set()],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ControlPlaneFault("INTERNAL", `${label} contains invalid JSON`);
  }
}

function requireStoredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new ControlPlaneFault("INTERNAL", `Stored record has an invalid ${key}`);
  }
  return value;
}

function requireStoredSha(record: Record<string, unknown>, key: string): Sha256 {
  const value = requireStoredString(record, key);
  if (!SHA256.test(value)) throw new ControlPlaneFault("INTERNAL", `Stored record has an invalid ${key}`);
  return value as Sha256;
}

function requireStoredInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new ControlPlaneFault("INTERNAL", `Stored record has an invalid ${key}`);
  }
  return value as number;
}

function parseEvidence(value: unknown): readonly EvidenceInput[] {
  if (!Array.isArray(value)) throw new ControlPlaneFault("INTERNAL", "Stored directive evidence is invalid");
  return value.map((item) => {
    if (!isRecord(item)) throw new ControlPlaneFault("INTERNAL", "Stored directive evidence is invalid");
    const recordType = item.record_type;
    if (recordType !== undefined && recordType !== null && typeof recordType !== "string") {
      throw new ControlPlaneFault("INTERNAL", "Stored directive record_type is invalid");
    }
    return {
      path: requireStoredString(item, "path"),
      sha256: requireStoredSha(item, "sha256"),
      record_type: typeof recordType === "string" ? recordType : null,
    };
  });
}

function parseManifest(row: ManifestRow): ManifestRevision {
  let value;
  try {
    value = parseCanonicalManifest(row.canonical_manifest_json);
  } catch {
    throw new ControlPlaneFault("INTERNAL", "Stored manifest bytes are not canonical schema-1.3 authority bytes");
  }
  if (
    value.manifest_id !== row.manifest_id
    || value.revision !== row.revision
    || value.run_id !== row.run_id
    || value.parent_manifest_sha256 !== row.parent_manifest_sha256
    || value.created_at !== row.created_at
    || sha256Bytes(row.canonical_manifest_json) !== row.manifest_sha256
  ) throw new ControlPlaneFault("INTERNAL", "Stored manifest row bindings or declared digest do not match canonical bytes");
  return {
    manifest_id: row.manifest_id as ManifestId,
    revision: row.revision,
    parent_manifest_sha256: row.parent_manifest_sha256 as Sha256 | null,
    canonical_manifest: value,
    manifest_sha256: row.manifest_sha256 as Sha256,
  };
}

function parseDirectiveRow(row: DirectiveRow): DirectiveEventView {
  const value = parseJson(row.event_json, "Stored directive event");
  if (!isRecord(value)) throw new ControlPlaneFault("INTERNAL", "Stored directive event is not an object");
  if (canonicalJson(value) !== row.event_json) throw new ControlPlaneFault("INTERNAL", "Stored directive event is not canonical JSON");
  const manifestSha256 = requireStoredSha(value, "manifest_sha256");
  const receiptIds = value.receipt_ids;
  if (
    value.record_type !== "mister-clean.directive-event"
    || value.schema_version !== "1.0"
    || value.directive_id !== row.directive_id
    || value.sequence !== row.sequence
    || value.run_id !== row.run_id
    || value.manifest_id !== row.manifest_id
    || value.manifest_revision !== row.manifest_revision
    || value.from_state !== row.from_state
    || value.to_state !== row.to_state
    || value.control_surface_id !== row.control_surface_id
    || value.occurred_at !== row.occurred_at
    || !Array.isArray(receiptIds)
    || receiptIds.some((entry) => typeof entry !== "string" || entry.length === 0)
    || new Set(receiptIds).size !== receiptIds.length
    || !DIRECTIVE_STATE_SET.has(row.to_state)
    || (row.from_state !== null && !DIRECTIVE_STATE_SET.has(row.from_state))
  ) {
    throw new ControlPlaneFault("INTERNAL", "Stored directive event has an invalid state");
  }
  return {
    sequence: row.sequence,
    directive_id: row.directive_id as DirectiveId,
    run_id: row.run_id as RunId,
    manifest_id: row.manifest_id as ManifestId,
    manifest_revision: row.manifest_revision,
    manifest_sha256: manifestSha256,
    from_state: row.from_state as DirectiveState | null,
    to_state: row.to_state as DirectiveState,
    control_surface_id: row.control_surface_id as ControlSurfaceId | null,
    occurred_at: row.occurred_at as IsoTimestamp,
    evidence: parseEvidence(value.evidence),
    receipt_ids: receiptIds as ReceiptId[],
  };
}

function parseReceipt(row: ReceiptRow): RuntimeBoundReceipt {
  let value: RuntimeBoundReceipt;
  try {
    value = parseCanonicalReceipt(row.receipt_json);
  } catch {
    throw new ControlPlaneFault("INTERNAL", "Stored receipt bytes are not canonical runtime receipt authority bytes");
  }
  if (
    value.receipt_id !== row.receipt_id
    || value.run_id !== row.run_id
    || value.manifest_id !== row.manifest_id
    || value.manifest_revision !== row.manifest_revision
    || value.output_repository.repository_object_sha256 !== row.repository_object_sha256
    || value.sealed_at !== row.sealed_at
    || sha256Bytes(row.receipt_json) !== row.receipt_sha256
  ) throw new ControlPlaneFault("INTERNAL", "Stored receipt row bindings or declared digest do not match canonical bytes");
  return value;
}

/** Local SQLite implementation. It never selects route JSON or secret refs. */
export class SqliteControlPlaneStore implements RepositoryControlPlaneStore {
  readonly #repository: OpenControlPlaneDatabase;
  readonly #global: OpenControlPlaneDatabase | null;

  constructor(repository: OpenControlPlaneDatabase, global: OpenControlPlaneDatabase | null = null) {
    if (repository.kind !== "repository") throw new Error("SqliteControlPlaneStore requires a repository database");
    if (global !== null && global.kind !== "global") throw new Error("Global inventory database has the wrong store kind");
    this.#repository = repository;
    this.#global = global;
  }

  get global_inventory_available(): boolean {
    return this.#global !== null;
  }

  async getRun(runId: RunId): Promise<RunView | null> {
    const row = this.#repository.database.query<RunRow>(
      `SELECT run_id, repository_id, mister_clean_version, detector_set_id, detector_set_sha256, created_at
       FROM runs WHERE run_id = ?`,
    ).get(runId);
    return row === null ? null : {
      run_id: row.run_id as RunId,
      repository_id: row.repository_id as RepositoryId,
      mister_clean_version: row.mister_clean_version,
      detector_set_id: row.detector_set_id as DetectorSetId,
      detector_set_sha256: row.detector_set_sha256 as Sha256,
      created_at: row.created_at as IsoTimestamp,
    };
  }

  async getManifest(manifestId: ManifestId, revision: number | null): Promise<ManifestRevision | null> {
    const row = revision === null
      ? this.#repository.database.query<ManifestRow>(
        `SELECT manifest_id, revision, run_id, parent_manifest_sha256, manifest_sha256, canonical_manifest_json, created_at
         FROM manifest_revisions WHERE manifest_id = ? ORDER BY revision DESC LIMIT 1`,
      ).get(manifestId)
      : this.#repository.database.query<ManifestRow>(
        `SELECT manifest_id, revision, run_id, parent_manifest_sha256, manifest_sha256, canonical_manifest_json, created_at
         FROM manifest_revisions WHERE manifest_id = ? AND revision = ?`,
      ).get(manifestId, revision);
    if (row === null) return null;
    const parsed = parseManifest(row);
    if (parsed.revision === 1) {
      if (parsed.parent_manifest_sha256 !== null) throw new ControlPlaneFault("INTERNAL", "First manifest revision cannot declare a parent digest");
    } else {
      if (parsed.parent_manifest_sha256 === null) throw new ControlPlaneFault("INTERNAL", "Manifest revision chain is missing its parent digest");
      const parent = this.#repository.database.query<{ manifest_sha256: string }>(
        "SELECT manifest_sha256 FROM manifest_revisions WHERE manifest_id = ? AND revision = ?",
      ).get(manifestId, parsed.revision - 1);
      if (parent === null || parent.manifest_sha256 !== parsed.parent_manifest_sha256) {
        throw new ControlPlaneFault("INTERNAL", "Manifest revision parent digest does not match the preceding immutable revision");
      }
    }
    return parsed;
  }

  async getManifestHead(manifestId: ManifestId): Promise<ManifestRevision | null> {
    return this.getManifest(manifestId, null);
  }

  async listIssues(runId: RunId, limit: number): Promise<readonly IssueView[]> {
    const run = this.#repository.database.query<{ repository_id: string }>(
      "SELECT repository_id FROM runs WHERE run_id = ?",
    ).get(runId);
    if (run === null) throw new ControlPlaneFault("NOT_FOUND", "Run was not found");
    const rows = this.#repository.database.query<IssueRow>(
      `SELECT issue_id, repository_id, stable_cause_key, normalizer, first_detected_run_id,
         (SELECT to_state FROM issue_events e WHERE e.issue_id = issue_roots.issue_id ORDER BY sequence DESC LIMIT 1) AS current_state,
         (SELECT occurred_at FROM issue_events e WHERE e.issue_id = issue_roots.issue_id ORDER BY sequence DESC LIMIT 1) AS last_changed_at
       FROM issue_roots
       WHERE repository_id = ?
       ORDER BY stable_cause_key, issue_id
       LIMIT ?`,
    ).all(run.repository_id, limit);
    return rows.map((row) => ({
      issue_id: row.issue_id as IssueId,
      repository_id: row.repository_id as RepositoryId,
      stable_cause_key: row.stable_cause_key,
      normalizer: row.normalizer,
      first_detected_run_id: row.first_detected_run_id as RunId,
      current_state: row.current_state,
      last_changed_at: row.last_changed_at as IsoTimestamp | null,
    }));
  }

  async listAgents(capabilityId: string | null, limit: number): Promise<readonly AgentView[]> {
    if (this.#global === null) throw new ControlPlaneFault("PRECONDITION_FAILED", "Global agent inventory is not configured");
    const requestedCapability = capabilityId === null ? null : parseRepositoryCapabilityId(capabilityId);
    const retainedEvidence = this.#global.database.query<{ evidence_sha256: string; evidence_bytes: Uint8Array }>(
      "SELECT evidence_sha256, evidence_bytes FROM agent_evaluation_evidence ORDER BY evidence_sha256",
    ).all();
    const validEvidenceDigests = new Set(retainedEvidence
      .filter((evidence) => sha256Bytes(evidence.evidence_bytes) === evidence.evidence_sha256)
      .map((evidence) => evidence.evidence_sha256));
    const rows = this.#global.database.query<AgentRow>(
      `SELECT a.agent_tuple_id, m.model_id, m.display_name AS model_name, m.family AS model_family,
              h.harness_id, h.display_name AS harness_name, a.reasoning_level
       FROM agent_tuples a
       JOIN models m ON m.model_id = a.model_id
       JOIN harnesses h ON h.harness_id = a.harness_id
       ORDER BY m.display_name, h.display_name, a.reasoning_level
       LIMIT ?`,
    ).all(limit);
    return rows.map((row) => {
      const allCredited = requestedCapability === null
        ? this.#global!.database.query<CreditedTrialRow>(
          `${CREDITED_TRIALS}
           SELECT * FROM credited_trials
           WHERE agent_tuple_id = ?
           ORDER BY capability_id, trial_id`,
        ).all(row.agent_tuple_id)
        : this.#global!.database.query<CreditedTrialRow>(
          `${CREDITED_TRIALS}
           SELECT * FROM credited_trials
           WHERE agent_tuple_id = ? AND capability_id = ?
           ORDER BY capability_id, trial_id`,
        ).all(row.agent_tuple_id, requestedCapability);
      const credited = allCredited.filter((trial) => {
        let evaluationDigests: unknown;
        try {
          evaluationDigests = JSON.parse(trial.evaluation_evidence_digests_json) as unknown;
        } catch {
          return false;
        }
        return Array.isArray(evaluationDigests)
          && evaluationDigests.length > 0
          && evaluationDigests.every((digest) => typeof digest === "string" && validEvidenceDigests.has(digest))
          && validEvidenceDigests.has(trial.pre_dispatch_evidence_sha256)
          && validEvidenceDigests.has(trial.pre_evaluation_evidence_sha256)
          && validEvidenceDigests.has(trial.trial_evidence_sha256);
      });
      const byCapability = new Map<CapabilityId, CreditedTrialRow[]>();
      for (const trial of credited) {
        const id = parseRepositoryCapabilityId(trial.capability_id);
        byCapability.set(id, [...(byCapability.get(id) ?? []), trial]);
      }
      return {
        agent_tuple_id: row.agent_tuple_id as AgentTupleId,
        model_id: row.model_id as ModelId,
        model_name: row.model_name,
        model_family: row.model_family,
        harness_id: row.harness_id as HarnessId,
        harness_name: row.harness_name,
        reasoning_level: row.reasoning_level,
        capabilities: [...byCapability.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([id, trials]): CapabilityTrialSummary => {
          const verifiedSuccessCount = trials.reduce((sum, trial) => sum + trial.verified_success, 0);
          const repositoryCohortCount = new Set(trials.flatMap((trial) => trial.logical_project_id === null ? [] : [trial.logical_project_id])).size;
          const independentlyEvaluated = trials.every((trial) => trial.independent_evaluation === 1);
          const unresolved = this.#unresolvedQualificationViolations(row.agent_tuple_id, id);
          const qualification = deriveQualification({
            verified_trials: trials.length,
            verified_successes: verifiedSuccessCount,
            repository_cohort_count: repositoryCohortCount,
            independently_evaluated: independentlyEvaluated,
            unresolved_no_harm_violations: unresolved.no_harm,
            unresolved_authority_violations: unresolved.authority,
            explicitly_disqualified: unresolved.disqualified,
          });
          return {
            capability_id: id,
            trial_count: trials.length,
            verified_success_count: verifiedSuccessCount,
            repository_cohort_count: repositoryCohortCount,
            independently_evaluated: independentlyEvaluated,
            qualification,
            no_harm_violation_count: unresolved.no_harm,
            authority_violation_count: unresolved.authority,
            qualification_provenance: {
              credited_trial_ids: trials.map((trial) => trial.trial_id),
              pre_dispatch_observation_ids: trials.map((trial) => trial.pre_dispatch_observation_id),
              pre_evaluation_observation_ids: trials.map((trial) => trial.pre_evaluation_observation_id),
              pre_dispatch_observed_at: trials.map((trial) => trial.pre_dispatch_observed_at),
              pre_evaluation_observed_at: trials.map((trial) => trial.pre_evaluation_observed_at),
              pre_dispatch_evidence_digests: trials.map((trial) => trial.pre_dispatch_evidence_sha256),
              pre_evaluation_evidence_digests: trials.map((trial) => trial.pre_evaluation_evidence_sha256),
              trial_evidence_digests: trials.map((trial) => trial.trial_evidence_sha256),
              evaluation_evidence_digest_sets: trials.map((trial) => JSON.parse(trial.evaluation_evidence_digests_json) as string[]),
              worker_actor_ids: trials.map((trial) => trial.worker_actor_id),
              author_actor_ids: trials.map((trial) => trial.author_actor_id),
              pre_dispatch_observer_actor_ids: trials.map((trial) => trial.pre_dispatch_observer_actor_id),
              pre_evaluation_observer_actor_ids: trials.map((trial) => trial.pre_evaluation_observer_actor_id),
              evaluator_actor_ids: trials.map((trial) => trial.evaluator_actor_id),
            },
          };
        }),
      };
    });
  }

  async listPendingEvaluationInvocations(limit: number): Promise<PendingEvaluationInvocationsView> {
    if (this.#global === null) throw new ControlPlaneFault("PRECONDITION_FAILED", "Global agent inventory is not configured");
    const rows = this.#global.database.query<PendingEvaluationInvocationRow>(
      `WITH pending AS (
         SELECT invocation.invocation_id, invocation.command, invocation.argv_sha256,
                invocation.observed_at, invocation.receipt_sha256
         FROM local_mister_clean_invocations AS invocation
         LEFT JOIN evaluation_run_invocations AS linked ON linked.invocation_id = invocation.invocation_id
         WHERE linked.invocation_id IS NULL AND invocation.identity_provenance = 'UNOBSERVED'
       )
       SELECT invocation_id, command, argv_sha256, observed_at, receipt_sha256,
              COUNT(*) OVER () AS pending_count
       FROM pending
       ORDER BY observed_at, invocation_id
       LIMIT ?`,
    ).all(limit);
    return {
      pending_count: rows[0]?.pending_count ?? 0,
      invocations: rows.map((row): PendingEvaluationInvocationView => ({
        invocation_id: row.invocation_id,
        command: row.command,
        argv_sha256: row.argv_sha256 as Sha256,
        observed_at: row.observed_at as IsoTimestamp,
        receipt_sha256: row.receipt_sha256 as Sha256,
        identity_provenance: "UNOBSERVED",
        quality_credit: false,
      })),
    };
  }

  #unresolvedQualificationViolations(agentTupleId: string, capabilityId: string): { readonly no_harm: number; readonly authority: number; readonly disqualified: boolean } {
    const rows = this.#global!.database.query<{ event_kind: string; event_id: string }>(
      `SELECT event_id, event_kind FROM qualification_events q
       WHERE agent_tuple_id = ? AND capability_id = ?
         AND event_kind IN ('no_harm_violation', 'authority_violation', 'explicit_disqualification')
         AND NOT EXISTS (
           SELECT 1 FROM qualification_events resolved
           WHERE resolved.related_event_id = q.event_id
             AND ((q.event_kind IN ('no_harm_violation', 'authority_violation') AND resolved.event_kind = 'violation_resolved')
               OR (q.event_kind = 'explicit_disqualification' AND resolved.event_kind = 'disqualification_lifted'))
         )`,
    ).all(agentTupleId, capabilityId);
    return {
      no_harm: rows.filter((row) => row.event_kind === "no_harm_violation").length,
      authority: rows.filter((row) => row.event_kind === "authority_violation").length,
      disqualified: rows.some((row) => row.event_kind === "explicit_disqualification"),
    };
  }

  async listDirectiveEvents(directiveId: DirectiveId): Promise<readonly DirectiveEventView[]> {
    const events = this.#repository.database.query<DirectiveRow>(
      `SELECT directive_id, sequence, run_id, manifest_id, manifest_revision, from_state, to_state,
              control_surface_id, event_json, occurred_at
       FROM directive_events WHERE directive_id = ? ORDER BY sequence`,
    ).all(directiveId).map(parseDirectiveRow);
    let prior: DirectiveEventView | null = null;
    for (const event of events) {
      if (event.sequence !== (prior?.sequence ?? 0) + 1 || event.from_state !== (prior?.to_state ?? null)) {
        throw new ControlPlaneFault("INTERNAL", "Stored directive event chain is discontinuous");
      }
      if (!DIRECTIVE_TRANSITIONS.get(event.from_state)?.has(event.to_state)) {
        throw new ControlPlaneFault("INTERNAL", "Stored directive event chain contains an invalid lifecycle transition");
      }
      if (prior !== null && (
        event.run_id !== prior.run_id
        || event.manifest_id !== prior.manifest_id
        || event.manifest_revision !== prior.manifest_revision
        || event.manifest_sha256 !== prior.manifest_sha256
      )) throw new ControlPlaneFault("INTERNAL", "Stored directive event identity changes within one directive chain");
      prior = event;
    }
    return events;
  }

  async getReceipt(receiptId: ReceiptId): Promise<RuntimeBoundReceipt | null> {
    const row = this.#repository.database.query<ReceiptRow>(
      `SELECT receipt_id, run_id, manifest_id, manifest_revision, repository_object_sha256,
              receipt_sha256, receipt_json, sealed_at
       FROM receipts WHERE receipt_id = ?`,
    ).get(receiptId);
    return row === null ? null : parseReceipt(row);
  }

  async getClosingRepositoryObject(runId: RunId): Promise<ClosingRepositoryObject | null> {
    const rows = this.#repository.database.query<ClosingObjectRow>(
      `SELECT event_id, sequence, repository_object_sha256, payload_json
       FROM run_events WHERE run_id = ? AND event_kind = 'repository_object.closed'
       ORDER BY sequence LIMIT 2`,
    ).all(runId);
    if (rows.length === 0) return null;
    if (rows.length !== 1) throw new ControlPlaneFault("PRECONDITION_FAILED", "Run has ambiguous closing repository-object bindings");
    const row = rows[0]!;
    const value = parseJson(row.payload_json, "Closing repository-object binding");
    if (!isRecord(value) || canonicalJson(value) !== row.payload_json) {
      throw new ControlPlaneFault("INTERNAL", "Closing repository-object binding is not canonical JSON");
    }
    let repository;
    try {
      repository = repositorySubjectSchema.parse(value.repository);
    } catch {
      throw new ControlPlaneFault("INTERNAL", "Closing repository-object binding has an invalid repository subject");
    }
    if (
      value.record_type !== "mister-clean.repository-object-binding"
      || value.schema_version !== "1.0"
      || value.run_id !== runId
      || repository.repository_object_sha256 !== row.repository_object_sha256
      || !Array.isArray(value.evidence)
    ) throw new ControlPlaneFault("INTERNAL", "Closing repository-object binding does not match its run event row");
    return {
      repository: repository as unknown as ClosingRepositoryObject["repository"],
      evidence: parseEvidence(value.evidence).map((entry) => entry.record_type === null
        ? { path: entry.path, sha256: entry.sha256 }
        : { path: entry.path, sha256: entry.sha256, record_type: entry.record_type }),
    };
  }

  async appendDirectiveEvent(request: AuthorizedDirectiveAppendRequest): Promise<DirectiveAppendResult> {
    assertDirectiveAppendSealed(request);
    let result: DirectiveAppendResult | null = null;
    this.#repository.database.transaction(() => {
      const current = this.#repository.database.query<DirectiveRow>(
        `SELECT directive_id, sequence, run_id, manifest_id, manifest_revision, from_state, to_state,
                control_surface_id, event_json, occurred_at
         FROM directive_events WHERE directive_id = ? ORDER BY sequence DESC LIMIT 1`,
      ).get(request.event.directive_id);
      const actualState = current?.to_state ?? null;
      if (current !== null) parseDirectiveRow(current);
      if (!DIRECTIVE_TRANSITIONS.get(request.event.from_state)?.has(request.event.to_state)) {
        throw new ControlPlaneFault("PRECONDITION_FAILED", "Directive event is not a valid lifecycle transition");
      }
      if (actualState !== request.expected_state) {
        throw new ControlPlaneFault("CONFLICT", "Directive state changed before this command could commit");
      }
      if (current !== null && (
        current.run_id !== request.run_id
        || current.manifest_id !== request.event.manifest_id
        || current.manifest_revision !== request.event.manifest_revision
      )) {
        throw new ControlPlaneFault("CONFLICT", "Directive identity is already bound to a different run or manifest");
      }
      const manifestRow = this.#repository.database.query<ManifestRow>(
        `SELECT manifest_id, revision, run_id, parent_manifest_sha256, manifest_sha256, canonical_manifest_json, created_at
         FROM manifest_revisions WHERE manifest_id = ? AND revision = ?`,
      ).get(request.event.manifest_id, request.event.manifest_revision);
      if (manifestRow === null) {
        throw new ControlPlaneFault("PRECONDITION_FAILED", "Manifest changed or does not match the directive binding");
      }
      const manifest = parseManifest(manifestRow);
      if (manifest.canonical_manifest.run_id !== request.run_id || manifest.manifest_sha256 !== request.event.manifest_sha256) {
        throw new ControlPlaneFault("PRECONDITION_FAILED", "Manifest changed or does not match the directive binding");
      }
      if (request.require_current_manifest) {
        const head = this.#repository.database.query<{ revision: number; manifest_sha256: string }>(
          "SELECT revision, manifest_sha256 FROM manifest_revisions WHERE manifest_id = ? ORDER BY revision DESC LIMIT 1",
        ).get(request.event.manifest_id);
        if (head === null || head.revision !== request.event.manifest_revision || head.manifest_sha256 !== request.event.manifest_sha256) {
          throw new ControlPlaneFault("CONFLICT", "Manifest head changed before this command could commit");
        }
      }
      const sequence = (current?.sequence ?? 0) + 1;
      const eventJson = canonicalJson({
        record_type: "mister-clean.directive-event",
        schema_version: "1.0",
        directive_id: request.event.directive_id,
        run_id: request.run_id,
        sequence,
        manifest_id: request.event.manifest_id,
        manifest_revision: request.event.manifest_revision,
        manifest_sha256: request.event.manifest_sha256,
        from_state: request.event.from_state,
        to_state: request.event.to_state,
        control_surface_id: request.control_surface_id,
        occurred_at: request.event.occurred_at,
        evidence: request.event.evidence.map((entry) => ({
          path: entry.path,
          sha256: entry.sha256,
          record_type: entry.record_type ?? null,
        })),
        receipt_ids: request.receipt_ids,
      });
      this.#repository.database.query(
        `INSERT INTO directive_events(
           directive_id, sequence, run_id, manifest_id, manifest_revision, from_state, to_state,
           control_surface_id, event_json, occurred_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        request.event.directive_id,
        sequence,
        request.run_id,
        request.event.manifest_id,
        request.event.manifest_revision,
        request.event.from_state,
        request.event.to_state,
        request.control_surface_id,
        eventJson,
        request.event.occurred_at,
      );
      result = {
        sequence,
        event: {
          sequence,
          directive_id: request.event.directive_id,
          run_id: request.run_id,
          manifest_id: request.event.manifest_id,
          manifest_revision: request.event.manifest_revision,
          manifest_sha256: request.event.manifest_sha256,
          from_state: request.event.from_state,
          to_state: request.event.to_state,
          control_surface_id: request.control_surface_id,
          occurred_at: request.event.occurred_at,
          evidence: request.event.evidence.map((entry) => ({
            path: entry.path,
            sha256: entry.sha256,
            record_type: entry.record_type ?? null,
          })),
          receipt_ids: request.receipt_ids,
        },
      };
    })();
    if (result === null) throw new ControlPlaneFault("INTERNAL", "Directive event was not committed");
    return result;
  }
}
