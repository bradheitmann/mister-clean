/**
 * Side-effect-free control-plane primitives shared by Bun, browser, CLI, and
 * MCP surfaces. Runtime parsing belongs at an adapter boundary; these types do
 * not replace the existing closeout record validators.
 */

declare const brand: unique symbol;

export type Brand<Value, Name extends string> = Value & {
  readonly [brand]: Name;
};

export type IsoTimestamp = Brand<string, "IsoTimestamp">;
export type Sha256 = Brand<string, "Sha256">;
export type RepositoryId = Brand<string, "RepositoryId">;
export type RunId = Brand<string, "RunId">;
export type DetectorSetId = Brand<string, "DetectorSetId">;
export type IssueId = Brand<string, "IssueId">;
export type ObservationId = Brand<string, "ObservationId">;
export type IssueGraphId = Brand<string, "IssueGraphId">;
export type ManifestId = Brand<string, "ManifestId">;
export type ManifestRevisionId = Brand<string, "ManifestRevisionId">;
export type OperationId = Brand<string, "OperationId">;
export type WaveId = Brand<string, "WaveId">;
export type LaneId = Brand<string, "LaneId">;
export type DirectiveId = Brand<string, "DirectiveId">;
export type ReceiptId = Brand<string, "ReceiptId">;
export type EvidenceId = Brand<string, "EvidenceId">;
export type ModelId = Brand<string, "ModelId">;
export type HarnessId = Brand<string, "HarnessId">;
export type AgentTupleId = Brand<string, "AgentTupleId">;
export type InferenceSourceId = Brand<string, "InferenceSourceId">;
export type DeploymentId = Brand<string, "DeploymentId">;
export type ExecutionRouteId = Brand<string, "ExecutionRouteId">;
export type CapabilityEvaluatorId = Brand<string, "CapabilityEvaluatorId">;
export type TrialId = Brand<string, "TrialId">;
export type ControlSurfaceId = Brand<string, "ControlSurfaceId">;
export type AgentIdentityLeaseId = Brand<string, "AgentIdentityLeaseId">;
export type CoordinationDomainKey = Brand<string, "CoordinationDomainKey">;
export type LeaseId = Brand<string, "LeaseId">;

export interface EvidenceRef {
  readonly path: string;
  readonly sha256: Sha256;
  readonly record_type?: string;
}

export interface VersionedDigest {
  readonly version: number;
  readonly sha256: Sha256;
}

export interface RepositorySubject {
  readonly repository_id: RepositoryId;
  readonly branch: string;
  readonly commit: string;
  readonly tree: string;
  readonly repository_object_sha256: Sha256;
  readonly observed_at: IsoTimestamp;
}

export const DATA_AVAILABILITY = [
  "MEASURED",
  "NOT_MEASURED",
  "NOT_CONFIGURED",
  "UNKNOWN",
] as const;

export type DataAvailability = (typeof DATA_AVAILABILITY)[number];

export const CAPABILITY_IDS = [
  "census_detection",
  "classification_false_positive_judgment",
  "root_cause_analysis",
  "risk_blast_radius_analysis",
  "dependency_dag_planning",
  "planning_projection_reconciliation",
  "multi_agent_coordination_integration",
  "routing_ownership_team_topology",
  "code_correctness_remediation",
  "architecture_coherence_complexity_reduction",
  "test_negative_control_construction",
  "git_worktree_integration_hygiene",
  "ci_cd_release_deployment_remediation",
  "security_secrets_dependency_remediation",
  "documentation_minimalism_organization",
  "runtime_repository_process_cleanup",
  "control_surface_office_hygiene",
  "performance_resource_efficiency",
  "ui_design_accessibility_remediation",
  "canonical_conformance_exact_format",
  "semantic_naming_structural_wayfinding",
  "independent_qa_holdout",
  "evidence_receipts_provenance",
  "successor_readiness_handoff",
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export const PROTOCOL_META_CAPABILITY_IDS = [
  "mister_clean_protocol_improvement",
] as const;

export type ProtocolMetaCapabilityId = (typeof PROTOCOL_META_CAPABILITY_IDS)[number];

export const CAPABILITY_FAMILIES = [
  "discovery_judgment",
  "planning_orchestration",
  "remediation",
  "verification_closeout",
] as const;

export type CapabilityFamily = (typeof CAPABILITY_FAMILIES)[number];

interface CapabilityDefinitionBase {
  readonly family: CapabilityFamily;
  readonly label: string;
  readonly description: string;
  readonly taxonomy_version: string;
}

export interface RepositoryCapabilityDefinition extends CapabilityDefinitionBase {
  readonly id: CapabilityId;
  readonly scope: "repository";
}

export interface ProtocolMetaCapabilityDefinition extends CapabilityDefinitionBase {
  readonly id: ProtocolMetaCapabilityId;
  readonly scope: "protocol_meta";
}

export type CapabilityDefinition = RepositoryCapabilityDefinition | ProtocolMetaCapabilityDefinition;

export const AUTHORITY_MODES = ["ADVISE", "OPERATE"] as const;
export type AuthorityMode = (typeof AUTHORITY_MODES)[number];

export const CLEANLINESS_VERDICTS = ["CLEAN", "NOT_CLEAN"] as const;
export type CleanlinessVerdict = (typeof CLEANLINESS_VERDICTS)[number];

export interface ProvenanceBinding {
  readonly evidence: readonly EvidenceRef[];
  readonly recorded_at: IsoTimestamp;
  readonly recorded_by: string;
}
