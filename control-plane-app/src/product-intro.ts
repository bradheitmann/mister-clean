import type { CapabilityId } from "../../src/control-plane/contracts/primitives.js";

export interface ProductIntroGroup {
  readonly title: string;
  readonly summary: string;
  readonly capability_ids: readonly CapabilityId[];
}

/**
 * First-use product language grouped for comprehension, while retaining an
 * exact mapping to the canonical repository-remediation taxonomy.
 */
export const PRODUCT_INTRO_GROUPS: readonly ProductIntroGroup[] = Object.freeze([
  {
    title: "Code and architecture",
    summary: "Correctness, root causes, blast radius, coherence, complexity, performance, and focused remediation.",
    capability_ids: [
      "root_cause_analysis",
      "risk_blast_radius_analysis",
      "code_correctness_remediation",
      "architecture_coherence_complexity_reduction",
      "performance_resource_efficiency",
    ],
  },
  {
    title: "Tests, QA, and evidence",
    summary: "Negative controls, independent holdouts, receipts, provenance, and evidence-bound closeout.",
    capability_ids: [
      "test_negative_control_construction",
      "independent_qa_holdout",
      "evidence_receipts_provenance",
    ],
  },
  {
    title: "Planning and documentation",
    summary: "Canonical planning projections, minimal documentation, and a truthful continuation surface.",
    capability_ids: [
      "planning_projection_reconciliation",
      "documentation_minimalism_organization",
    ],
  },
  {
    title: "Spit-shine and wayfinding",
    summary: "Exact-format conformance plus names and structure that guide an unfamiliar successor to the safe change path.",
    capability_ids: [
      "canonical_conformance_exact_format",
      "semantic_naming_structural_wayfinding",
    ],
  },
  {
    title: "Git and integration",
    summary: "Branches, worktrees, ignored state, writer custody, semantic collisions, and safe integration barriers.",
    capability_ids: [
      "git_worktree_integration_hygiene",
      "multi_agent_coordination_integration",
    ],
  },
  {
    title: "Delivery and security",
    summary: "CI/CD, releases, deployment evidence, dependencies, secrets, and security boundaries.",
    capability_ids: [
      "ci_cd_release_deployment_remediation",
      "security_secrets_dependency_remediation",
    ],
  },
  {
    title: "Runtime and control surfaces",
    summary: "Repository-relevant processes, panes, offices, locks, product surfaces, responsive design, and accessibility.",
    capability_ids: [
      "runtime_repository_process_cleanup",
      "control_surface_office_hygiene",
      "ui_design_accessibility_remediation",
    ],
  },
  {
    title: "Detection, orchestration, and handoff",
    summary: "Complete census, honest classification, dependency order, ownership, routing, team topology, and successor readiness.",
    capability_ids: [
      "census_detection",
      "classification_false_positive_judgment",
      "dependency_dag_planning",
      "routing_ownership_team_topology",
      "successor_readiness_handoff",
    ],
  },
]);

export const PRODUCT_INTRO_STORAGE_KEY = "mister-clean.product-intro.v1";
