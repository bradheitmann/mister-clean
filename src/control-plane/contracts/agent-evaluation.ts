import type {
  AgentTupleId,
  AgentIdentityLeaseId,
  CapabilityEvaluatorId,
  CapabilityId,
  ControlSurfaceId,
  DeploymentId,
  EvidenceRef,
  ExecutionRouteId,
  HarnessId,
  InferenceSourceId,
  IsoTimestamp,
  ModelId,
  RepositoryId,
  RunId,
  TrialId,
} from "./primitives.js";

export interface ModelRecord {
  readonly model_id: ModelId;
  readonly family: string;
  readonly display_name: string;
  readonly context_limit_tokens: number | null;
}

export interface HarnessRecord {
  readonly harness_id: HarnessId;
  readonly display_name: string;
  readonly version: string | null;
  readonly supports_headless: boolean | null;
}

export interface AgentTuple {
  readonly agent_tuple_id: AgentTupleId;
  readonly model_id: ModelId;
  readonly harness_id: HarnessId;
  readonly reasoning_level: string;
}

export const AGENT_IDENTITY_EVIDENCE_KINDS = [
  "structured_harness_readback",
  "trusted_runtime_receipt",
  "external_visual_readback",
] as const;

export type AgentIdentityEvidenceKind = (typeof AGENT_IDENTITY_EVIDENCE_KINDS)[number];

export const AGENT_IDENTITY_PHASES = ["pre_dispatch", "pre_evaluation"] as const;
export type AgentIdentityPhase = (typeof AGENT_IDENTITY_PHASES)[number];

export const AGENT_IDENTITY_INVALIDATION_REASONS = [
  "harness_restart",
  "harness_relaunch",
  "route_change",
  "provider_fallback",
  "model_change",
  "reasoning_change",
  "session_change",
  "configuration_change",
] as const;

export type AgentIdentityInvalidationReason = (typeof AGENT_IDENTITY_INVALIDATION_REASONS)[number];

export const AGENT_IDENTITY_DISPOSITIONS = [
  "IDENTITY_UNBOUND",
  "MISMATCH",
  "INVALIDATED",
  "BOUND_FOR_DISPATCH",
  "BOUND_FOR_EVALUATION",
] as const;

export type AgentIdentityDisposition = (typeof AGENT_IDENTITY_DISPOSITIONS)[number];

/**
 * Identity is observed externally. A pane/tab label is only the intended
 * configuration and a worker self-report is only an untrusted comparison.
 */
export interface AgentIdentityObservation {
  readonly observation_id: string;
  readonly phase: AgentIdentityPhase;
  readonly requested_agent_tuple_id: AgentTupleId;
  readonly observed_model_id: ModelId;
  readonly observed_harness_id: HarnessId;
  readonly observed_reasoning_level: string;
  readonly execution_route_id: ExecutionRouteId;
  readonly control_surface_id: ControlSurfaceId | null;
  readonly harness_session_token: string;
  readonly process_instance_token: string;
  readonly evidence_kind: AgentIdentityEvidenceKind;
  readonly evidence: readonly EvidenceRef[];
  readonly observer_actor_id: string;
  readonly intended_surface_label: string | null;
  readonly worker_self_report: string | null;
  readonly observed_at: IsoTimestamp;
}

export interface AgentIdentityInvalidation {
  readonly reason: AgentIdentityInvalidationReason;
  readonly occurred_at: IsoTimestamp;
  readonly evidence: readonly EvidenceRef[];
}

export interface AgentIdentityLease {
  readonly identity_lease_id: AgentIdentityLeaseId;
  readonly requested_tuple: AgentTuple;
  readonly execution_route_id: ExecutionRouteId;
  readonly pre_dispatch: AgentIdentityObservation | null;
  readonly pre_evaluation: AgentIdentityObservation | null;
  readonly invalidations: readonly AgentIdentityInvalidation[];
}

export const INFERENCE_SOURCE_KINDS = [
  "hosted_api",
  "local_machine",
  "remote_machine",
  "developer_plan",
] as const;

export type InferenceSourceKind = (typeof INFERENCE_SOURCE_KINDS)[number];

export interface InferenceSource {
  readonly inference_source_id: InferenceSourceId;
  readonly display_name: string;
  readonly kind: InferenceSourceKind;
  readonly machine_identity: string | null;
  readonly endpoint: string | null;
  readonly secret_ref: string | null;
}

export interface Deployment {
  readonly deployment_id: DeploymentId;
  readonly model_id: ModelId;
  readonly inference_source_id: InferenceSourceId;
  readonly provider_model_id: string;
  readonly context_limit_tokens: number | null;
  readonly max_concurrency: number | null;
  readonly streaming_supported: boolean | null;
  readonly usage_reporting_supported: boolean | null;
}

export interface ExecutionRoute {
  readonly execution_route_id: ExecutionRouteId;
  readonly agent_tuple_id: AgentTupleId;
  readonly deployment_id: DeploymentId;
  readonly invocation_kind: "direct" | "harness" | "local";
  readonly invocation_adapter: string;
  readonly headless_supported: boolean | null;
  readonly environment_policy: string;
  readonly working_directory_policy: string;
  readonly health_check: string | null;
  readonly recovery_procedure: string | null;
}

export const QUALIFICATION_LEVELS = [
  "UNTESTED",
  "EVALUATING",
  "Recommended_supervised",
  "Qualified",
  "Production_cleared",
  "DISQUALIFIED",
] as const;

export type QualificationLevel = (typeof QUALIFICATION_LEVELS)[number];

export interface CapabilityQualification {
  readonly agent_tuple_id: AgentTupleId;
  readonly capability_id: CapabilityId;
  readonly level: QualificationLevel;
  readonly verified_trials: number;
  readonly repository_cohort_count: number;
  readonly verified_success_rate: number | null;
  readonly independent_evaluation: boolean;
  readonly unresolved_no_harm_violations: number;
  readonly unresolved_authority_violations: number;
  readonly confidence: number;
  readonly derived_at: IsoTimestamp;
}

export interface BooleanCapabilityEvaluation {
  readonly evaluator_id: CapabilityEvaluatorId;
  readonly capability_id: CapabilityId;
  readonly question: string;
  readonly result: boolean | null;
  readonly evidence: readonly EvidenceRef[];
}

export interface TokenTelemetry {
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  readonly cache_read_tokens: number | null;
  readonly cache_write_tokens: number | null;
  readonly reasoning_tokens: number | null;
  readonly source: string;
  readonly reliable: boolean;
}

export interface RouteTelemetry {
  readonly time_to_first_token_ms: number | null;
  readonly tokens_per_second: number | null;
  readonly wall_time_ms: number;
  readonly retry_count: number;
  readonly recoverable_pause_count: number;
  readonly route_succeeded: boolean;
  readonly measurement_consistent: boolean;
}

export interface CostTelemetry {
  readonly currency: string;
  readonly amount: number | null;
  readonly price_source: "custom" | "contract" | "local_amortized" | "models_dev" | "unknown";
  readonly price_schedule_effective_at: IsoTimestamp | null;
}

export interface EvaluationTrial {
  readonly trial_id: TrialId;
  readonly run_id: RunId;
  readonly repository_id: RepositoryId;
  readonly repository_cohort_token: string;
  readonly agent_tuple_id: AgentTupleId;
  readonly identity_lease_id: AgentIdentityLeaseId;
  readonly identity_disposition: AgentIdentityDisposition;
  readonly contributes_quality_credit: boolean;
  readonly execution_route_id: ExecutionRouteId;
  readonly capability_ids: readonly CapabilityId[];
  readonly difficulty: 1 | 2 | 3 | 4 | 5;
  readonly started_at: IsoTimestamp;
  readonly completed_at: IsoTimestamp | null;
  readonly verified_success: boolean | null;
  readonly debt_paid: number;
  readonly debt_caused: number;
  readonly no_harm_violation: boolean;
  readonly authority_violation: boolean;
  readonly intervention_count: number;
  readonly reopened: boolean;
  readonly capability_evaluations: readonly BooleanCapabilityEvaluation[];
  readonly token_telemetry: TokenTelemetry;
  readonly route_telemetry: RouteTelemetry;
  readonly cost_telemetry: CostTelemetry;
  readonly evidence: readonly EvidenceRef[];
}

export const EVALUATION_REASONS = [
  "pre_clearance_every_run",
  "scheduled_five_percent_sample",
  "no_harm_anomaly",
  "authority_anomaly",
  "detector_disagreement",
  "reopened_work",
  "integration_rejection",
  "quality_drift",
  "route_identity_change",
  "operator_requested",
] as const;

export type EvaluationReason = (typeof EVALUATION_REASONS)[number];

export interface EvaluationDisposition {
  readonly trial_id: TrialId;
  readonly capability_id: CapabilityId;
  readonly evaluated: boolean;
  readonly reason: EvaluationReason | "not_selected";
  readonly post_clearance_run_ordinal: number | null;
  readonly scheduled_block: number | null;
  readonly contributes_quality_credit: boolean;
}

export interface RepositoryRosterSeat {
  readonly agent_tuple_id: AgentTupleId;
  readonly execution_route_id: ExecutionRouteId;
  readonly control_surface_id: ControlSurfaceId | null;
  readonly role: string;
  readonly availability: "available" | "busy" | "paused" | "offline" | "unknown";
  readonly repository_familiarity_runs: number;
  readonly observed_at: IsoTimestamp;
}
