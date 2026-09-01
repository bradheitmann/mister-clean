import {
  CAPABILITY_IDS,
  PROTOCOL_META_CAPABILITY_IDS,
  type CapabilityDefinition,
  type CapabilityFamily,
  type CapabilityId,
  type ProtocolMetaCapabilityDefinition,
  type RepositoryCapabilityDefinition,
} from "./primitives.js";

const definition = (id: CapabilityId, family: CapabilityFamily, label: string, description: string): RepositoryCapabilityDefinition => ({
  id,
  scope: "repository",
  family,
  label,
  description,
  taxonomy_version: "1.0",
});

/** The single canonical capability vocabulary used by routing and UI projections. */
export const CAPABILITY_DEFINITIONS: readonly RepositoryCapabilityDefinition[] = Object.freeze([
  definition("census_detection", "discovery_judgment", "Census and detection", "Find in-scope observations without silently skipping surfaces."),
  definition("classification_false_positive_judgment", "discovery_judgment", "Classification and false-positive judgment", "Separate debt, false positives, process defects, and unknown origin."),
  definition("root_cause_analysis", "discovery_judgment", "Root-cause analysis", "Collapse observations only when one coherent cause and acceptance test apply."),
  definition("risk_blast_radius_analysis", "discovery_judgment", "Risk and blast-radius analysis", "Bound affected paths, invariants, rollback, and regression exposure."),
  definition("dependency_dag_planning", "planning_orchestration", "Dependency/DAG planning", "Compute dependency-closed order, critical path, and eligible frontier."),
  definition("planning_projection_reconciliation", "planning_orchestration", "Planning and projection reconciliation", "Reconcile canonical planning surfaces without rewriting history."),
  definition("multi_agent_coordination_integration", "planning_orchestration", "Multi-agent coordination and integration", "Coordinate writers, leases, semantic collisions, and integration barriers."),
  definition("routing_ownership_team_topology", "planning_orchestration", "Routing, ownership, and team topology", "Resolve exact tuples, routes, roles, offices, and ownership boundaries."),
  definition("code_correctness_remediation", "remediation", "Code-correctness remediation", "Make narrow, verified changes that pay the bound issue."),
  definition("architecture_coherence_complexity_reduction", "remediation", "Architecture, coherence, and complexity reduction", "Reduce structural debt while preserving exact repository-object accounting."),
  definition("test_negative_control_construction", "remediation", "Test and negative-control construction", "Build adversarial tests and controls that distinguish legal twins from failures."),
  definition("git_worktree_integration_hygiene", "remediation", "Git, worktree, and integration hygiene", "Reconcile refs, worktrees, ignored state, locks, and integration custody."),
  definition("ci_cd_release_deployment_remediation", "remediation", "CI/CD, release, and deployment remediation", "Repair native gates and bind package and delivery evidence."),
  definition("security_secrets_dependency_remediation", "remediation", "Security, secrets, and dependency remediation", "Protect secret custody and resolve dependency or security debt."),
  definition("documentation_minimalism_organization", "remediation", "Documentation minimalism and organization", "Create the smallest accurate successor surface and documentation balance."),
  definition("runtime_repository_process_cleanup", "remediation", "Runtime and repository-process cleanup", "Remove residue and reconcile repository-relevant processes safely."),
  definition("control_surface_office_hygiene", "remediation", "Control-surface and office hygiene", "Clean panes, offices, locks, and control-surface residue."),
  definition("performance_resource_efficiency", "remediation", "Performance and resource efficiency", "Improve measured resource behavior without trading away correctness."),
  definition("ui_design_accessibility_remediation", "remediation", "UI, design, and accessibility remediation", "Deliver token-bound, keyboard-accessible, responsive product surfaces."),
  definition("canonical_conformance_exact_format", "remediation", "Canonical conformance and exact-format reconciliation — Spit-shine", "Reach 100% mechanical conformance and idempotence across the declared corpus."),
  definition("semantic_naming_structural_wayfinding", "remediation", "Semantic naming and structural wayfinding — Wayfinding", "Enable a blind successor to locate ownership and the safe change path."),
  definition("independent_qa_holdout", "verification_closeout", "Independent QA and holdout", "Adjudicate findings independently on the current candidate object."),
  definition("evidence_receipts_provenance", "verification_closeout", "Evidence, receipts, and provenance", "Bind claims to immutable evidence, receipts, digests, and timestamps."),
  definition("successor_readiness_handoff", "verification_closeout", "Successor-readiness and handoff", "Leave an unfamiliar agent a truthful, navigable continuation surface."),
]);

export const CONTROL_PLANE_META_CAPABILITY: ProtocolMetaCapabilityDefinition = Object.freeze({
  id: "mister_clean_protocol_improvement",
  scope: "protocol_meta",
  family: "verification_closeout",
  label: "Mister Clean protocol improvement",
  description: "Improve the detector or protocol itself; this cannot qualify an agent for repository remediation.",
  taxonomy_version: "1.0",
});

export const ALL_CAPABILITY_DEFINITIONS: readonly CapabilityDefinition[] = Object.freeze([
  ...CAPABILITY_DEFINITIONS,
  CONTROL_PLANE_META_CAPABILITY,
]);

const REPOSITORY_CAPABILITY_IDS = new Set<string>(CAPABILITY_IDS);
const META_CAPABILITY_IDS = new Set<string>(PROTOCOL_META_CAPABILITY_IDS);

export function isRepositoryCapabilityId(value: string): value is CapabilityId {
  return REPOSITORY_CAPABILITY_IDS.has(value);
}

export function isProtocolMetaCapabilityId(value: string): value is (typeof PROTOCOL_META_CAPABILITY_IDS)[number] {
  return META_CAPABILITY_IDS.has(value);
}

export function parseRepositoryCapabilityId(value: string): CapabilityId {
  if (!isRepositoryCapabilityId(value)) throw new Error(`Unknown repository capability: ${value}`);
  return value;
}
