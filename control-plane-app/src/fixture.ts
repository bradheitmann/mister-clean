import type { CapabilityId, EvidenceRef, Sha256 } from "../../src/control-plane/contracts/primitives.js";
import { CAPABILITY_DEFINITIONS } from "../../src/control-plane/contracts/capability-taxonomy.js";
import type { ControlPlaneSnapshot, SnapshotAgent, SnapshotIssue } from "./read-model.js";

const sha = (_value: string): Sha256 => "d".repeat(64) as Sha256;
const evidence = (path: string): EvidenceRef => ({ path, sha256: sha("demo") });
const ledgerDigest = (index: number): Sha256 => index.toString(16).padStart(64, "0") as Sha256;

function capabilityScores(base: number, overrides: Partial<Record<CapabilityId, number>> = {}, qualification: SnapshotAgent["capability_scores"][number]["qualification"] = "Recommended_supervised"): SnapshotAgent["capability_scores"] {
  const verifiedTrials = qualification === "UNTESTED" ? 0 : qualification === "EVALUATING" ? 1 : qualification === "Qualified" ? 28 : qualification === "Production_cleared" ? 50 : 12;
  return CAPABILITY_DEFINITIONS.map((definition) => ({
    capability_id: definition.id,
    score: overrides[definition.id] ?? base,
    confidence: 0.9,
    verified_trials: verifiedTrials,
    qualification,
    qualification_provenance: {
      credited_trial_ids: Array.from({ length: verifiedTrials }, (_, index) => `${definition.id}-trial-${index}`),
      pre_dispatch_observation_ids: Array.from({ length: verifiedTrials }, (_, index) => `${definition.id}-dispatch-${index}`),
      pre_evaluation_observation_ids: Array.from({ length: verifiedTrials }, (_, index) => `${definition.id}-evaluation-${index}`),
      pre_dispatch_observed_at: Array.from({ length: verifiedTrials }, (_, index) => `2026-08-01T00:${String(index).padStart(2, "0")}:00.000Z`),
      pre_evaluation_observed_at: Array.from({ length: verifiedTrials }, (_, index) => `2026-08-02T00:${String(index).padStart(2, "0")}:00.000Z`),
      pre_dispatch_evidence_digests: Array.from({ length: verifiedTrials }, (_, index) => ledgerDigest(index + 1)),
      pre_evaluation_evidence_digests: Array.from({ length: verifiedTrials }, (_, index) => ledgerDigest(index + 100)),
      trial_evidence_digests: Array.from({ length: verifiedTrials }, (_, index) => ledgerDigest(index + 200)),
      evaluation_evidence_digest_sets: Array.from({ length: verifiedTrials }, (_, index) => [ledgerDigest(index + 300), ledgerDigest(index + 400), ledgerDigest(index + 500), ledgerDigest(index + 600)]),
      worker_actor_ids: Array.from({ length: verifiedTrials }, (_, index) => `${definition.id}-worker-${index}`),
      author_actor_ids: Array.from({ length: verifiedTrials }, (_, index) => `${definition.id}-author-${index}`),
      pre_dispatch_observer_actor_ids: Array.from({ length: verifiedTrials }, (_, index) => `${definition.id}-dispatch-observer-${index}`),
      pre_evaluation_observer_actor_ids: Array.from({ length: verifiedTrials }, (_, index) => `${definition.id}-evaluation-observer-${index}`),
      evaluator_actor_ids: Array.from({ length: verifiedTrials }, (_, index) => `${definition.id}-evaluator-${index}`),
      verified_successes: verifiedTrials,
      repository_cohort_count: qualification === "Qualified" ? 2 : qualification === "Production_cleared" ? 3 : verifiedTrials > 0 ? 1 : 0,
      independent_evaluation: qualification === "Production_cleared",
      unresolved_no_harm_violations: 0,
      unresolved_authority_violations: 0,
      explicitly_disqualified: false,
    },
  }));
}

const subject = {
  repository_id: "mister-clean" as never,
  branch: "main",
  commit: "demo-commit",
  tree: "demo-tree",
  repository_object_sha256: sha("demo-object"),
  observed_at: "2026-08-26T10:30:00.000Z" as never,
};

const flow = {
  starting_real_issues: 217,
  discovered_preexisting: 0,
  caused_by_remediation: 0,
  concurrently_introduced: 0,
  paid: 212,
  invalidated_false_positives: 0,
  classification_correction_delta: 0,
  ending_real_issues: 5,
  boundary_blocked: 1,
};

const issue = (value: Omit<SnapshotIssue, "evidence" | "confidence" | "observation_ids" | "first_detected_run_id">): SnapshotIssue => ({
  ...value,
  confidence: 0.92,
  observation_ids: [`${value.issue_id}-observation`],
  first_detected_run_id: "MC-RUN-0039",
  evidence: [evidence(`evidence/${value.issue_id}.json`)],
});

const issues: readonly SnapshotIssue[] = [
  issue({ issue_id: "MC-101", stable_cause_key: "complexity.full-object", title: "Measure complexity on the full repository object", description: "Bind complexity and documentation balance to the tracked plus nonignored repository object.", debt_domain: "complexity", technical_or_agentic: "technical", state: "open", origin: "baseline", severity: 5, remediation_difficulty: 4, affected_invariants: ["exact repository object", "no unexplained complexity regression"], affected_paths: ["src/", "control-plane-app/"], acceptance_boundary: ["same object digest", "p50/p95/max and cycle report bound"], prerequisite_issue_ids: [], dependent_issue_ids: ["MC-102"], unlock_value: 8, regression_risk: 4, coordination_claims: [{ key: "detectors/complexity", access: "write", operation_class: "measure-complexity", commutes_with: [], commutativity_ref: null }], blocked_reasons: [], owner: "architecture lane", worktree: null, recommended_tuple: "GPT-5.6 Sol · Codex Desktop · high", rationale: "Architecture and detector-boundary work." }),
  issue({ issue_id: "MC-102", stable_cause_key: "planning.current-state", title: "Make successor state a canonical, current surface", description: "Publish one current-state entrypoint that an unfamiliar successor can navigate.", debt_domain: "planning", technical_or_agentic: "agentic_operational", state: "open", origin: "baseline", severity: 5, remediation_difficulty: 3, affected_invariants: ["successor readiness", "one current-state surface"], affected_paths: ["CURRENT.md", "references/"], acceptance_boundary: ["blind successor probe passes", "digest-bound current-state evidence"], prerequisite_issue_ids: ["MC-101"], dependent_issue_ids: [], unlock_value: 6, regression_risk: 3, coordination_claims: [{ key: "planning/current-state", access: "write", operation_class: "update-current-state", commutes_with: [], commutativity_ref: null }], blocked_reasons: [], owner: "planning lane", worktree: null, recommended_tuple: "GLM-5.3 · Pi · high", rationale: "Exact-format and projection reconciliation evidence." }),
  issue({ issue_id: "MC-103", stable_cause_key: "release.published-runtime", title: "Separate published runtime from source-only scripts", description: "Prove the package surface and fresh-install runtime independently from source development.", debt_domain: "release", technical_or_agentic: "technical", state: "verification_pending", origin: "baseline", severity: 4, remediation_difficulty: 3, affected_invariants: ["package/runtime parity"], affected_paths: ["package.json", "bin/", "dist/"], acceptance_boundary: ["isolated package smoke test", "runtime identity receipt"], prerequisite_issue_ids: [], dependent_issue_ids: [], unlock_value: 4, regression_risk: 4, coordination_claims: [{ key: "package/release", access: "write", operation_class: "package-verify", commutes_with: [], commutativity_ref: null }], blocked_reasons: [], owner: "release lane", worktree: null, recommended_tuple: "GPT-5.6 Terra · Codex CLI · medium", rationale: "Release-surface and fresh-install verification." }),
  issue({ issue_id: "MC-104", stable_cause_key: "git.detached-worktree", title: "Establish disposition for the detached detector worktree", description: "Resolve custody before any writer acts on the detached worktree.", debt_domain: "git", technical_or_agentic: "agentic_operational", state: "blocked", origin: "unestablished", severity: 4, remediation_difficulty: 2, affected_invariants: ["writer custody", "no-harm"], affected_paths: [".git/worktrees/"], acceptance_boundary: ["independent custody receipt"], prerequisite_issue_ids: [], dependent_issue_ids: [], unlock_value: 2, regression_risk: 5, coordination_claims: [{ key: "git/worktrees", access: "write", operation_class: "worktree-disposition", commutes_with: [], commutativity_ref: null }], blocked_reasons: ["custody evidence is not established"], owner: "operator", worktree: "/detached-detector", recommended_tuple: "GPT-5.6 Luna · Droid · medium", rationale: "Requires custody evidence before a writer can act." }),
  issue({ issue_id: "MC-105", stable_cause_key: "contracts.unowned-suppression", title: "Replace the unowned TypeScript suppression", description: "Remove the suppression or bind a documented, tested exception owner.", debt_domain: "code hygiene", technical_or_agentic: "technical", state: "open", origin: "baseline", severity: 3, remediation_difficulty: 1, affected_invariants: ["typed contracts", "successor clarity"], affected_paths: ["src/control-plane/contracts/"], acceptance_boundary: ["type gate passes", "owner/evidence recorded"], prerequisite_issue_ids: [], dependent_issue_ids: [], unlock_value: 1, regression_risk: 2, coordination_claims: [{ key: "src/contracts", access: "write", operation_class: "contract-cleanup", commutes_with: [], commutativity_ref: null }], blocked_reasons: [], owner: "contracts lane", worktree: null, recommended_tuple: "GPT-5.6 Luna · Droid · medium", rationale: "Narrow code-hygiene repair with focused holdout." }),
];

const agents: readonly SnapshotAgent[] = [
  { agent_tuple_id: "tuple-sol-codex-high", model: "GPT-5.6 Sol", family: "GPT-5", harness: "Codex Desktop", reasoning_level: "high", deployment: "openai-dev", inference_source: "OpenAI developer plan", route: "route-sol-codex", invocation_adapter: "codex-desktop", headless: false, available: true, availability: "available", active_in_repository: true, role: "architecture owner", control_surface: "cmux:control-plane", familiarity_runs: 12, capability_scores: capabilityScores(0.78, { architecture_coherence_complexity_reduction: 0.96, root_cause_analysis: 0.94 }), champion_for: ["Architecture and coherence", "Root-cause analysis"], evidence: [evidence("trials/sol.json")], execution_identity: { intended_surface_label: "Codex Desktop control-plane lane", disposition: "IDENTITY_UNBOUND", last_external_verification_at: null, evidence: [] }, metrics: { verified_success_rate: null, reliability: null, cost_per_success_usd: null, tokens_per_success: null, tokens_per_second: null, local: null } },
  { agent_tuple_id: "tuple-terra-codex-medium", model: "GPT-5.6 Terra", family: "GPT-5", harness: "Codex CLI", reasoning_level: "medium", deployment: "openai-dev", inference_source: "OpenAI developer plan", route: "route-terra-codex", invocation_adapter: "codex-cli", headless: true, available: false, availability: "busy", active_in_repository: false, role: "release verifier", control_surface: null, familiarity_runs: 4, capability_scores: capabilityScores(0.8, { independent_qa_holdout: 0.94, ci_cd_release_deployment_remediation: 0.93 }, "Qualified"), champion_for: ["Release verification", "Git integration"], evidence: [evidence("trials/terra.json")], execution_identity: { intended_surface_label: "Codex CLI release route", disposition: "MISMATCH", last_external_verification_at: "2026-08-25T10:30:00.000Z", evidence: [evidence("identity/terra-mismatch.json")] }, metrics: { verified_success_rate: null, reliability: null, cost_per_success_usd: null, tokens_per_success: null, tokens_per_second: null, local: null } },
  { agent_tuple_id: "tuple-glm-pi-high", model: "GLM-5.3", family: "GLM", harness: "Pi", reasoning_level: "high", deployment: "glm-zai", inference_source: "z.ai API", route: "route-glm-pi", invocation_adapter: "pi", headless: true, available: true, availability: "available", active_in_repository: true, role: "planning reconciler", control_surface: "cmux:planning", familiarity_runs: 15, capability_scores: capabilityScores(0.77, { planning_projection_reconciliation: 0.95, canonical_conformance_exact_format: 0.94 }), champion_for: ["Canonical conformance", "Planning reconciliation"], evidence: [evidence("trials/glm.json")], execution_identity: { intended_surface_label: "Pi planning lane", disposition: "BOUND_FOR_DISPATCH", last_external_verification_at: "2026-08-26T10:30:00.000Z", evidence: [evidence("identity/glm.json")] }, metrics: { verified_success_rate: null, reliability: null, cost_per_success_usd: null, tokens_per_success: null, tokens_per_second: null, local: null } },
  { agent_tuple_id: "tuple-luna-droid-medium", model: "GPT-5.6 Luna", family: "GPT-5", harness: "Droid", reasoning_level: "medium", deployment: "openai-dev", inference_source: "OpenAI developer plan", route: "route-luna-droid", invocation_adapter: "droid", headless: null, available: false, availability: "paused", active_in_repository: false, role: "UNTESTED", control_surface: null, familiarity_runs: 0, capability_scores: capabilityScores(0.55, {}, "UNTESTED"), champion_for: [], evidence: [], execution_identity: { intended_surface_label: "Droid route", disposition: "UNTESTED", last_external_verification_at: null, evidence: [] }, metrics: { verified_success_rate: null, reliability: null, cost_per_success_usd: null, tokens_per_success: null, tokens_per_second: null, local: null } },
];

export const demoSnapshot: ControlPlaneSnapshot = {
  source: "demo",
  source_label: "DEMONSTRATION DATA — NOT A CLEANLINESS VERDICT",
  repository: "mister-clean",
  current_run_id: "MC-RUN-0042",
  current_subject: subject,
  current_flow: flow,
  previous_flow: { ...flow, starting_real_issues: 846, paid: 671, caused_by_remediation: 2, ending_real_issues: 177, boundary_blocked: 0 },
  first_flow: { ...flow, starting_real_issues: 1132, paid: 0, ending_real_issues: 1132, boundary_blocked: 0 },
  issues,
  agents,
  capabilities: CAPABILITY_DEFINITIONS,
  runs: [
    { run_id: "MC-RUN-0039", observed_at: "2026-08-22T10:00:00.000Z", mister_clean_version: "6.2.1", detector_version: "6.2.1", subject: { ...subject, commit: "demo-0039", tree: "demo-tree-0039" }, scope: ["tracked", "nonignored"], exclusions: ["ignored evidence"], start_verdict: "NOT_CLEAN", terminal_verdict: "NOT_CLEAN", debt_flow: { ...flow, starting_real_issues: 1132, paid: 0, ending_real_issues: 1132, boundary_blocked: 0 }, real_issue_ids: [], known_now_issue_ids: [], false_positive_issue_ids: [], detector_misses: [], process_defects: [], classification_corrections: [], directives: [], receipts: [evidence("runs/0039.json")], note: "Baseline census." },
    { run_id: "MC-RUN-0040", observed_at: "2026-08-23T10:00:00.000Z", mister_clean_version: "6.3.0", detector_version: "6.3.0", subject: { ...subject, commit: "demo-0040", tree: "demo-tree-0040" }, scope: ["tracked", "nonignored"], exclusions: ["ignored evidence"], start_verdict: "NOT_CLEAN", terminal_verdict: "NOT_CLEAN", debt_flow: { ...flow, starting_real_issues: 1132, discovered_preexisting: 20, paid: 302, caused_by_remediation: 4, ending_real_issues: 854, boundary_blocked: 4 }, real_issue_ids: [], known_now_issue_ids: [], false_positive_issue_ids: [], detector_misses: ["projection coverage"], process_defects: [], classification_corrections: [], directives: ["directive-0040"], receipts: [evidence("runs/0040.json")], note: "Improved projection detection expanded known scope." },
    { run_id: "MC-RUN-0041", observed_at: "2026-08-25T10:00:00.000Z", mister_clean_version: "6.3.0", detector_version: "6.3.0", subject: { ...subject, commit: "demo-0041", tree: "demo-tree-0041" }, scope: ["tracked", "nonignored"], exclusions: ["ignored evidence"], start_verdict: "NOT_CLEAN", terminal_verdict: "NOT_CLEAN", debt_flow: { ...flow, starting_real_issues: 854, paid: 671, caused_by_remediation: 2, ending_real_issues: 185, boundary_blocked: 2 }, real_issue_ids: [], known_now_issue_ids: [], false_positive_issue_ids: [], detector_misses: [], process_defects: ["process-1"], classification_corrections: ["classification-1"], directives: ["directive-0041"], receipts: [evidence("runs/0041.json")], note: "Acceptance and worktree closure." },
    { run_id: "MC-RUN-0042", observed_at: "2026-08-26T10:30:00.000Z", mister_clean_version: "6.4.0-candidate", detector_version: "6.4.0-candidate", subject, scope: ["tracked", "nonignored"], exclusions: ["ignored evidence"], start_verdict: "NOT_CLEAN", terminal_verdict: "NOT_CLEAN", debt_flow: flow, real_issue_ids: issues.map((item) => item.issue_id), known_now_issue_ids: issues.map((item) => item.issue_id), false_positive_issue_ids: [], detector_misses: [], process_defects: [], classification_corrections: [], directives: [], receipts: [evidence("runs/0042.json")], note: "Candidate control-plane dogfood run." },
  ],
  complexity: {
    availability: "MEASURED",
    object_sha256: sha("demo-object"),
    repository_object_total: { bytes: 750000, lines: 21200, files: 200 },
    tracked_object: { bytes: 700000, lines: 20000, files: 190 },
    untracked_nonignored: { bytes: 50000, lines: 1200, files: 10 },
    authored_source: { bytes: 250000, lines: 7000, files: 80 },
    tests: { bytes: 70000, lines: 2200, files: 25 },
    public_documentation: { bytes: 50000, lines: 1500, files: 15 },
    planning_documentation: { bytes: 90000, lines: 2400, files: 20 },
    generated_shippable: { bytes: 180000, lines: 5200, files: 30 },
    config_tooling: { bytes: 25000, lines: 600, files: 10 },
    evidence_research: { bytes: 15000, lines: 400, files: 5 },
    dependencies_assets: { bytes: 70000, lines: 1900, files: 15 },
    ignored_live: {
      availability: "MEASURED", observed_at: "2026-08-26T10:30:00.000Z", subject_relation: "outside_repository_object",
      total: { bytes: 1000000, lines: 30000, files: 300 }, dependencies: { bytes: 800000, lines: 24000, files: 240 },
      build_cache: { bytes: 120000, lines: 3000, files: 30 }, local_evidence: { bytes: 70000, lines: 2500, files: 20 }, other: { bytes: 10000, lines: 500, files: 10 },
    },
    docs_to_authored_code: { bytes: 0.56, lines: 3900 / 7000, files: 35 / 80 },
    structural_coverage: "TypeScript modules, exports, import edges, SCC cycles, supported-language census.",
    limitations: ["Fixture measurement is demonstration data; thresholds are not industry truth.", "Generated assets are classified by repository policy, not file extension alone."],
    functions: { p50: 4, p95: 18, max: 61, cyclomatic_p95: 9 },
    cycles: ["src/control-plane/runtime ↔ persistence adapter (demo observation)"],
    hotspots: ["src/closeout/bundle.ts", "src/control-plane/runtime/service.ts"],
    trend: [{ run_id: "MC-RUN-0040", object_sha256: sha("demo-object-0040"), complexity: 72, docs_to_code_lines: 0.48 }, { run_id: "MC-RUN-0041", object_sha256: sha("demo-object-0041"), complexity: 68, docs_to_code_lines: 0.52 }, { run_id: "MC-RUN-0042", object_sha256: sha("demo-object"), complexity: 61, docs_to_code_lines: 3900 / 7000 }],
    repository_size_history: [],
  },
  manifest: null,
  terminal_contract: { declared_verdict: "NOT_CLEAN", subject, contract: { zero_payable_issues: false, zero_unpaid_caused_by_mister_clean: true, zero_material_boundary_or_unknown_debt: false, fresh_repository_and_mister_clean_evidence: true, coherent_required_surfaces: false, independent_qa_holdout_accepted: false, no_unexplained_complexity_regression: false, exact_tree_target_coordination_current: false, live_validated_closure_bundle: false }, evidence: [evidence("closeout/demo-not-clean.json")] },
  current_authority: "ADVISE",
  detector_coverage: "DEMONSTRATION: 18 detector families represented; live coverage unavailable.",
  evidence_freshness: "DEMONSTRATION: observed 2026-08-26T10:30:00Z",
};

export const fixture = demoSnapshot;
