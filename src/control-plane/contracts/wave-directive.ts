import type {
  AgentTupleId,
  AuthorityMode,
  CapabilityId,
  CoordinationDomainKey,
  DirectiveId,
  EvidenceRef,
  ExecutionRouteId,
  IsoTimestamp,
  IssueGraphId,
  IssueId,
  LaneId,
  LeaseId,
  ManifestId,
  OperationId,
  ReceiptId,
  RepositorySubject,
  RunId,
  Sha256,
  WaveId,
} from "./primitives.js";

export const WAVE_STATES = [
  "planned",
  "admitted",
  "running",
  "verifying",
  "ready_to_integrate",
  "integrating",
  "integrated",
  "blocked",
  "stale",
  "aborted",
] as const;

export type WaveState = (typeof WAVE_STATES)[number];

export const LANE_STATES = [
  "queued",
  "active",
  "ready",
  "integrated",
  "retired",
  "blocked",
] as const;

export type LaneState = (typeof LANE_STATES)[number];

export interface CoordinationDomainExpectation {
  readonly key: CoordinationDomainKey;
  readonly access: "read" | "write";
  readonly expected_version: number;
  readonly expected_state_digest: Sha256;
  readonly operation_class: string;
  readonly commutes_with: readonly string[];
  readonly commutativity_ref: EvidenceRef | null;
}

export interface WriterLeaseExpectation {
  readonly lease_id: LeaseId;
  readonly fencing_token: number;
  readonly worktree: string;
  readonly branch: string;
  readonly owner: string;
  readonly expires_at: IsoTimestamp;
}

export interface AgentAssignment {
  readonly agent_tuple_id: AgentTupleId;
  readonly execution_route_id: ExecutionRouteId;
  readonly required_capabilities: readonly CapabilityId[];
  readonly routing_evidence: readonly EvidenceRef[];
  readonly fallback_agent_tuple_id: AgentTupleId | null;
  readonly fallback_execution_route_id: ExecutionRouteId | null;
}

export interface ReadCustodyPolicy {
  readonly protected_paths: readonly string[];
  readonly permitted_metadata_paths: readonly string[];
  readonly enforcement: "not_applicable" | "filesystem_sandbox" | "externalized";
  readonly evidence: readonly EvidenceRef[];
}

export interface RemediationLane {
  readonly lane_id: LaneId;
  readonly task_id: string;
  readonly role: "read_only" | "writer" | "integrator";
  readonly state: LaneState;
  readonly owner: string;
  readonly issue_ids: readonly IssueId[];
  readonly dependencies: readonly LaneId[];
  readonly worktree: string | null;
  readonly branch: string | null;
  readonly baseline_commit: string;
  readonly read_paths: readonly string[];
  readonly read_custody: ReadCustodyPolicy;
  readonly write_paths: readonly string[];
  readonly invariants: readonly string[];
  readonly acceptance: readonly string[];
  readonly context_budget_tokens: number;
  readonly assignment: AgentAssignment;
  readonly lease: WriterLeaseExpectation | null;
  readonly coordination_claims: readonly CoordinationDomainExpectation[];
}

export interface RemediationTrack {
  readonly track_id: string;
  readonly lane_ids: readonly LaneId[];
  readonly issue_ids: readonly IssueId[];
}

export interface RemediationWave {
  readonly wave_id: WaveId;
  readonly sequence: number;
  readonly state: WaveState;
  readonly prerequisite_wave_ids: readonly WaveId[];
  readonly tracks: readonly RemediationTrack[];
  readonly integration_barrier: readonly string[];
}

export interface OptimizationPolicy {
  readonly policy_id: string;
  readonly severity_weight: number;
  readonly difficulty_weight: number;
  readonly unlock_value_weight: number;
  readonly regression_risk_weight: number;
  readonly cost_tiebreak: boolean;
  readonly speed_tiebreak: boolean;
  readonly overrides: readonly {
    readonly what: string;
    readonly why: string;
    readonly risk: string;
    readonly approver: string;
    readonly evidence: readonly EvidenceRef[];
  }[];
}

export interface ProjectionContract {
  readonly kind: "human_prompt" | "qa_packet" | "holdout_packet" | "ui_directive";
  readonly schema_version: string;
  readonly sha256: Sha256;
}

export interface ReceiptRequirement {
  readonly role: "dev" | "qa" | "mister_clean" | "holdout" | "integrator";
  readonly independent: boolean;
  readonly required_claims: readonly string[];
}

/**
 * Compatible schema-1.3 evolution of `mister-clean.action-manifest`.
 * Existing schema-1.2 coordination and actions remain canonical fields; this
 * contract adds wave identity, planning, routing, and projection bindings.
 */
export interface RemediationWaveManifest {
  readonly record_type: "mister-clean.action-manifest";
  readonly schema_version: "1.3";
  readonly manifest_kind: "remediation_wave";
  readonly manifest_id: ManifestId;
  readonly revision: number;
  readonly parent_manifest_sha256: Sha256 | null;
  readonly run_id: RunId;
  readonly created_at: IsoTimestamp;
  readonly created_by: string;
  readonly authority_mode: AuthorityMode;
  readonly repository: RepositorySubject;
  readonly target_ref: string;
  readonly expected_target_commit: string;
  readonly detector_set_sha256: Sha256;
  readonly policy_sha256: Sha256;
  readonly issue_graph: {
    readonly issue_graph_id: IssueGraphId;
    readonly version: number;
    readonly sha256: Sha256;
  };
  readonly selected_issue_ids: readonly IssueId[];
  readonly optimization: OptimizationPolicy;
  readonly waves: readonly RemediationWave[];
  readonly lanes: readonly RemediationLane[];
  readonly parent_operation_ids: readonly OperationId[];
  readonly no_harm_comparators: readonly string[];
  readonly native_gates: readonly string[];
  readonly rollback: readonly string[];
  readonly receipt_requirements: readonly ReceiptRequirement[];
  readonly projections: readonly ProjectionContract[];
  readonly terminal_issue_dispositions: readonly {
    readonly issue_id: IssueId;
    readonly required_terminal_state: "paid" | "false_positive";
  }[];
  readonly hard_boundaries: readonly string[];
  readonly excluded_actions: readonly string[];
  readonly self_audit: {
    readonly status: "passed" | "failed";
    readonly checked_at: IsoTimestamp;
    readonly evidence: readonly EvidenceRef[];
  };
}

export interface ManifestRevision {
  readonly manifest_id: ManifestId;
  readonly revision: number;
  readonly parent_manifest_sha256: Sha256 | null;
  readonly canonical_manifest: RemediationWaveManifest;
  readonly manifest_sha256: Sha256;
}

export const DIRECTIVE_STATES = [
  "recommended",
  "projected",
  "copied",
  "queued",
  "delivered",
  "accepted",
  "running",
  "completed",
  "verified",
  "failed",
  "delivery_uncertain",
] as const;

export type DirectiveState = (typeof DIRECTIVE_STATES)[number];

export interface DirectiveEvent {
  readonly directive_id: DirectiveId;
  readonly manifest_id: ManifestId;
  readonly manifest_revision: number;
  readonly manifest_sha256: Sha256;
  readonly from_state: DirectiveState | null;
  readonly to_state: DirectiveState;
  readonly occurred_at: IsoTimestamp;
  readonly control_surface: string | null;
  readonly evidence: readonly EvidenceRef[];
}

export const RECEIPT_STATES = ["draft", "sealed", "verified", "rejected"] as const;
export type ReceiptState = (typeof RECEIPT_STATES)[number];

export interface BoundReceipt {
  readonly receipt_id: ReceiptId;
  readonly state: ReceiptState;
  readonly manifest_id: ManifestId;
  readonly manifest_revision: number;
  readonly manifest_sha256: Sha256;
  readonly repository: RepositorySubject;
  readonly role: string;
  readonly actor: string;
  readonly conclusion: "pass" | "fail";
  readonly sealed_at: IsoTimestamp | null;
  readonly evidence: readonly EvidenceRef[];
}
