import type { Sha256 } from "./primitives.js";
import * as z from "zod";
import { CAPABILITY_DEFINITIONS } from "./capability-taxonomy.js";
import { agentExecutionProfileSchema } from "./agent-profile.js";
import { rankAgents, type AgentCandidate, type CapabilitySelection } from "../domain/ranking.js";
import { DIRECTIVE_STATES } from "./wave-directive.js";
import { ISSUE_ORIGINS, ISSUE_STATES } from "./run-issue.js";

export const CONTROL_PLANE_SNAPSHOT_SCHEMA_VERSION = "1.0" as const;

export const CONTROL_PLANE_SNAPSHOT_FIELDS = [
  "source", "source_label", "repository", "current_run_id", "current_subject",
  "current_observation", "current_flow", "previous_flow", "first_flow", "issues", "agents", "runs",
  "capabilities", "complexity", "manifest", "terminal_contract", "current_authority",
  "detector_coverage", "evidence_freshness",
] as const;

const text = z.string().min(1);
const repositoryCapabilityIdSchema = z.enum(CAPABILITY_DEFINITIONS.map((definition) => definition.id) as [typeof CAPABILITY_DEFINITIONS[number]["id"], ...typeof CAPABILITY_DEFINITIONS[number]["id"][]]);
const digest = text.regex(/^[a-f0-9]{64}$/);
const timestamp = text.regex(/^\d{4}-\d\d-\d\dT/).refine((value) => !Number.isNaN(Date.parse(value)));
const evidence = z.object({ path: text, sha256: digest }).strict();
const subjectSchema = z.object({ repository_id: text, branch: text, commit: text, tree: text, repository_object_sha256: digest.nullable(), observed_at: timestamp }).strict();
const flowSchema = z.object({
  starting_real_issues: z.number().int().nonnegative().safe(), discovered_preexisting: z.number().int().nonnegative().safe(),
  caused_by_remediation: z.number().int().nonnegative().safe(), concurrently_introduced: z.number().int().nonnegative().safe(),
  paid: z.number().int().nonnegative().safe(), invalidated_false_positives: z.number().int().nonnegative().safe(),
  classification_correction_delta: z.number().int().safe(), ending_real_issues: z.number().int().nonnegative().safe(), boundary_blocked: z.number().int().nonnegative().safe(),
}).strict().superRefine((value, context) => {
  const ending = value.starting_real_issues + value.discovered_preexisting + value.caused_by_remediation
    + value.concurrently_introduced - value.paid - value.invalidated_false_positives + value.classification_correction_delta;
  if (ending !== value.ending_real_issues) context.addIssue({ code: "custom", message: "debt flow does not reconcile" });
  if (value.boundary_blocked > value.ending_real_issues) context.addIssue({ code: "custom", message: "debt flow boundary-blocked count exceeds ending real issues" });
});
const runnerCardSchema = z.object({
  agent_tuple_id: text, model: text, harness: text, reasoning_level: text,
  /** Immutable recipe binding. A quality-ranked tuple is not a runnable card
   * unless its exact admitted execution profile is present here. */
  profile_id: text, profile_revision: z.number().int().nonnegative().safe(), profile_fingerprint_sha256: digest,
  category_scores: z.array(z.object({ capability_id: repositoryCapabilityIdSchema, weighted_score: z.number().finite().nonnegative() }).strict()).min(1),
}).strict();
const runnerRecommendationSchema = z.object({
  required_capabilities: z.array(repositoryCapabilityIdSchema).min(1),
  selection_weights: z.array(z.object({ capability_id: repositoryCapabilityIdSchema, weight: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict()).min(1),
  minimum_qualification: z.literal("Recommended_supervised"),
  runner_card: runnerCardSchema.nullable(),
  provenance: z.object({ manifest_assignment_agent_tuple_id: text, routing_evidence: z.array(evidence) }).strict(),
}).strict();
const issueSchema = z.object({
  issue_id: text, stable_cause_key: text, title: text, description: text, debt_domain: text,
  technical_or_agentic: z.enum(["technical", "agentic_operational"]), state: z.enum([...ISSUE_STATES] as [string, ...string[]]), origin: z.enum([...ISSUE_ORIGINS] as [string, ...string[]]),
  severity: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), remediation_difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), confidence: z.number().min(0).max(1),
  first_detected_run_id: text, observation_ids: z.array(text), affected_invariants: z.array(text), affected_paths: z.array(text), acceptance_boundary: z.array(text), evidence: z.array(evidence),
  prerequisite_issue_ids: z.array(text), dependent_issue_ids: z.array(text), unlock_value: z.number().finite().nonnegative(), regression_risk: z.number().finite().nonnegative(),
  coordination_claims: z.array(z.object({ key: text, access: z.enum(["read", "write"]), operation_class: text, commutes_with: z.array(text), commutativity_ref: evidence.nullable() }).strict()),
  blocked_reasons: z.array(text), owner: text, worktree: text.nullable(), recommended_tuple: text, runner_recommendation: runnerRecommendationSchema, rationale: text,
}).strict();
const qualificationProvenanceSchema = z.object({
  credited_trial_ids: z.array(text), pre_dispatch_observation_ids: z.array(text), pre_evaluation_observation_ids: z.array(text),
  pre_dispatch_observed_at: z.array(timestamp), pre_evaluation_observed_at: z.array(timestamp), pre_dispatch_evidence_digests: z.array(digest), pre_evaluation_evidence_digests: z.array(digest),
  trial_evidence_digests: z.array(digest), evaluation_evidence_digest_sets: z.array(z.array(digest).min(1)),
  worker_actor_ids: z.array(text), author_actor_ids: z.array(text), pre_dispatch_observer_actor_ids: z.array(text), pre_evaluation_observer_actor_ids: z.array(text), evaluator_actor_ids: z.array(text),
  verified_successes: z.number().int().nonnegative().safe(), repository_cohort_count: z.number().int().nonnegative().safe(), independent_evaluation: z.boolean(),
  unresolved_no_harm_violations: z.number().int().nonnegative().safe(), unresolved_authority_violations: z.number().int().nonnegative().safe(), explicitly_disqualified: z.boolean(),
}).strict();
const capabilityScoreSchema = z.object({ capability_id: repositoryCapabilityIdSchema, score: z.number().min(0).max(1), confidence: z.number().min(0).max(1), verified_trials: z.number().int().nonnegative().safe(), qualification: z.enum(["UNTESTED", "EVALUATING", "Recommended_supervised", "Qualified", "Production_cleared", "DISQUALIFIED"]), qualification_provenance: qualificationProvenanceSchema }).strict().superRefine((score, context) => {
  const proof = score.qualification_provenance;
  const fields = [proof.credited_trial_ids, proof.pre_dispatch_observation_ids, proof.pre_evaluation_observation_ids, proof.pre_dispatch_observed_at, proof.pre_evaluation_observed_at, proof.pre_dispatch_evidence_digests, proof.pre_evaluation_evidence_digests, proof.trial_evidence_digests];
  if (fields.some((items) => new Set(items).size !== items.length)) context.addIssue({ code: "custom", message: "qualification provenance identifiers must be distinct" });
  const trialBoundFields = [proof.pre_dispatch_observation_ids, proof.pre_evaluation_observation_ids, proof.pre_dispatch_observed_at, proof.pre_evaluation_observed_at, proof.pre_dispatch_evidence_digests, proof.pre_evaluation_evidence_digests, proof.trial_evidence_digests, proof.evaluation_evidence_digest_sets, proof.worker_actor_ids, proof.author_actor_ids, proof.pre_dispatch_observer_actor_ids, proof.pre_evaluation_observer_actor_ids, proof.evaluator_actor_ids];
  if (trialBoundFields.some((items) => items.length !== score.verified_trials)) context.addIssue({ code: "custom", message: "each credited trial requires complete actor and retained-evidence provenance" });
  for (let index = 0; index < score.verified_trials; index += 1) {
    const actors = [proof.worker_actor_ids[index], proof.author_actor_ids[index], proof.pre_dispatch_observer_actor_ids[index], proof.pre_evaluation_observer_actor_ids[index], proof.evaluator_actor_ids[index]];
    if (new Set(actors).size !== actors.length) context.addIssue({ code: "custom", message: "qualification independence requires actor separation" });
    const evaluationDigests = proof.evaluation_evidence_digest_sets[index] ?? [];
    if (new Set(evaluationDigests).size !== evaluationDigests.length) context.addIssue({ code: "custom", message: "evaluation evidence digests must be distinct within a trial" });
  }
  if (proof.verified_successes > score.verified_trials || proof.credited_trial_ids.length !== score.verified_trials) context.addIssue({ code: "custom", message: "qualification provenance trial accounting is invalid" });
  const rate = score.verified_trials === 0 ? 0 : proof.verified_successes / score.verified_trials;
  const expected = proof.explicitly_disqualified ? "DISQUALIFIED" : score.verified_trials === 0 ? "UNTESTED" : score.verified_trials >= 50 && proof.repository_cohort_count >= 3 && rate >= .95 && proof.independent_evaluation && proof.unresolved_no_harm_violations === 0 && proof.unresolved_authority_violations === 0 ? "Production_cleared" : score.verified_trials >= 25 && proof.repository_cohort_count >= 2 && rate >= .90 ? "Qualified" : score.verified_trials >= 10 ? "Recommended_supervised" : "EVALUATING";
  if (score.qualification !== expected) context.addIssue({ code: "custom", message: "qualification must be derived from credited ledger provenance" });
  const minimum = score.qualification === "Recommended_supervised" ? 10
    : score.qualification === "Qualified" ? 25
      : score.qualification === "Production_cleared" ? 50 : 0;
  if (score.qualification === "UNTESTED" && score.verified_trials !== 0) context.addIssue({ code: "custom", message: "UNTESTED qualification cannot claim credited trials" });
  if (score.qualification === "EVALUATING" && (score.verified_trials < 1 || score.verified_trials >= 10)) context.addIssue({ code: "custom", message: "EVALUATING qualification requires 1 through 9 credited trials" });
  if (minimum > 0 && score.verified_trials < minimum) context.addIssue({ code: "custom", message: `${score.qualification} qualification lacks its ledger trial threshold` });
});
const agentSchema = z.object({
  agent_tuple_id: text, model: text, family: text, harness: text, reasoning_level: text, deployment: text, inference_source: text, route: text, invocation_adapter: text,
  headless: z.boolean().nullable(), available: z.boolean(), availability: z.enum(["available", "busy", "paused", "offline", "unknown"]), active_in_repository: z.boolean(), role: text, control_surface: text.nullable(), familiarity_runs: z.number().int().nonnegative().safe(),
  capability_scores: z.array(capabilityScoreSchema), champion_for: z.array(text), evidence: z.array(evidence),
  /** The latest immutable desired execution recipe admitted for this tuple.
   * This is configuration evidence, not proof that the current seat ran it. */
  execution_profile: agentExecutionProfileSchema.nullable(),
  execution_identity: z.object({ intended_surface_label: text, disposition: z.enum(["BOUND_FOR_EVALUATION", "BOUND_FOR_DISPATCH", "IDENTITY_UNBOUND", "MISMATCH", "INVALIDATED", "UNTESTED"]), assurance: z.enum(["requested_configuration", "active_harness_selection", "provider_execution_attested"]).nullable(), automatic_routing_eligible: z.boolean(), last_external_verification_at: timestamp.nullable(), evidence: z.array(evidence) }).strict(),
  metrics: z.object({ verified_success_rate: z.number().min(0).max(1).nullable(), reliability: z.number().min(0).max(1).nullable(), cost_per_success_usd: z.number().finite().nonnegative().nullable(), tokens_per_success: z.number().finite().nonnegative().nullable(), tokens_per_second: z.number().finite().nonnegative().nullable(), local: z.boolean().nullable() }).strict(),
}).strict();
const runSchema = z.object({
  run_id: text, observed_at: timestamp, mister_clean_version: text, detector_version: text, subject: subjectSchema, scope: z.array(text), exclusions: z.array(text),
  start_verdict: z.enum(["CLEAN", "NOT_CLEAN"]), terminal_verdict: z.enum(["CLEAN", "NOT_CLEAN"]), debt_flow: flowSchema, real_issue_ids: z.array(text), known_now_issue_ids: z.array(text), false_positive_issue_ids: z.array(text), detector_misses: z.array(text), process_defects: z.array(text), classification_corrections: z.array(text), directives: z.array(text), receipts: z.array(evidence), note: text,
}).strict();
const countSchema = z.object({ bytes: z.number().int().nonnegative().safe(), lines: z.number().int().nonnegative().safe(), files: z.number().int().nonnegative().safe() }).strict();
const availabilitySchema = z.enum(["MEASURED", "NOT_MEASURED", "NOT_CONFIGURED", "UNKNOWN"]);
const currentObservationSchema = z.object({
  kind: z.enum(["FULL_MISTER_CLEAN_RUN", "PARTIAL"]),
  evidence_binding: z.object({ kind: z.enum(["REPOSITORY_OBJECT", "OBSERVATION_RECEIPT"]), sha256: digest }).strict(),
  current_debt_flow: availabilitySchema,
  remediation_no_harm: availabilitySchema,
  live_topology: availabilitySchema,
  current_complexity: availabilitySchema,
}).strict();
const ignoredLiveSchema = z.object({
  availability: availabilitySchema,
  observed_at: timestamp.nullable(),
  subject_relation: z.literal("outside_repository_object"),
  total: countSchema,
  dependencies: countSchema,
  build_cache: countSchema,
  local_evidence: countSchema,
  other: countSchema,
}).strict().superRefine((value, context) => {
  if (value.availability === "MEASURED" && value.observed_at === null) {
    context.addIssue({ code: "custom", message: "measured ignored-live surface requires an observation time" });
  }
  if (value.availability !== "MEASURED" && value.observed_at !== null) {
    context.addIssue({ code: "custom", message: "unmeasured ignored-live surface cannot claim an observation time" });
  }
  for (const dimension of ["bytes", "lines", "files"] as const) {
    const classified = value.dependencies[dimension] + value.build_cache[dimension]
      + value.local_evidence[dimension] + value.other[dimension];
    if (classified !== value.total[dimension]) {
      context.addIssue({ code: "custom", message: `ignored-live ${dimension} classes do not reconcile to total` });
    }
  }
});
const complexitySchema = z.object({
  availability: availabilitySchema,
  object_sha256: digest.nullable(),
  repository_object_total: countSchema,
  tracked_object: countSchema,
  untracked_nonignored: countSchema,
  authored_source: countSchema,
  tests: countSchema,
  public_documentation: countSchema,
  planning_documentation: countSchema,
  generated_shippable: countSchema,
  config_tooling: countSchema,
  evidence_research: countSchema,
  dependencies_assets: countSchema,
  ignored_live: ignoredLiveSchema,
  docs_to_authored_code: z.object({ bytes: z.number().finite().nonnegative().nullable(), lines: z.number().finite().nonnegative().nullable(), files: z.number().finite().nonnegative().nullable() }).strict(), structural_coverage: text, limitations: z.array(text),
  functions: z.object({ p50: z.number().finite().nonnegative().nullable(), p95: z.number().finite().nonnegative().nullable(), max: z.number().finite().nonnegative().nullable(), cyclomatic_p95: z.number().finite().nonnegative().nullable() }).strict(), cycles: z.array(text), hotspots: z.array(text),
  trend: z.array(z.object({ run_id: text, object_sha256: digest, complexity: z.number().finite().nonnegative().nullable(), docs_to_code_lines: z.number().finite().nonnegative().nullable() }).strict()),
  repository_size_history: z.array(z.object({
    series_id: text, label: text, ref: text, head_commit: text, evidence: z.array(evidence),
    points: z.array(z.object({ commit: text, observed_at: timestamp, files: z.number().int().nonnegative().safe(), bytes: z.number().int().nonnegative().safe(), delta_bytes: z.number().int().safe() }).strict()),
  }).strict()).optional(),
}).strict().superRefine((value, context) => {
  for (const dimension of ["bytes", "lines", "files"] as const) {
    const objectParts = value.tracked_object[dimension] + value.untracked_nonignored[dimension];
    if (objectParts !== value.repository_object_total[dimension]) {
      context.addIssue({ code: "custom", message: `repository-object ${dimension} does not reconcile to tracked plus untracked-nonignored` });
    }
    const classified = value.authored_source[dimension] + value.tests[dimension]
      + value.public_documentation[dimension] + value.planning_documentation[dimension]
      + value.generated_shippable[dimension] + value.config_tooling[dimension]
      + value.evidence_research[dimension] + value.dependencies_assets[dimension];
    if (classified !== value.repository_object_total[dimension]) {
      context.addIssue({ code: "custom", message: `repository-object ${dimension} categories do not reconcile to total` });
    }
  }
});
const manifestSchema = z.object({
  manifest_id: text, revision: z.number().int().positive().safe(), digest, projection_digest: digest, subject: subjectSchema, authority_mode: z.enum(["ADVISE", "OPERATE"]), target_ref: text, expected_target_commit: text,
  issue_graph: z.object({ issue_graph_id: text, version: z.number().int().positive().safe(), digest }).strict(), selected_issue_ids: z.array(text), lanes: z.array(z.object({ owner: text, role: text, worktree: text.nullable(), route: text }).strict()), directive_id: text, directive_state: z.enum([...DIRECTIVE_STATES] as [string, ...string[]]), receipt_boundary: text,
}).strict();
const terminalSchema = z.object({
  declared_verdict: z.enum(["CLEAN", "NOT_CLEAN"]).nullable(), subject: subjectSchema.nullable(), contract: z.object({
    zero_payable_issues: z.boolean(), zero_unpaid_caused_by_mister_clean: z.boolean(), zero_material_boundary_or_unknown_debt: z.boolean(), fresh_repository_and_mister_clean_evidence: z.boolean(), coherent_required_surfaces: z.boolean(), independent_qa_holdout_accepted: z.boolean(), no_unexplained_complexity_regression: z.boolean(), exact_tree_target_coordination_current: z.boolean(), live_validated_closure_bundle: z.boolean(),
  }).strict().nullable(), evidence: z.array(evidence),
}).strict();
const repositoryCapabilitySchema = z.object({
  id: repositoryCapabilityIdSchema,
  scope: z.literal("repository"),
  family: z.enum(["discovery_judgment", "planning_orchestration", "remediation", "verification_closeout"]),
  label: text,
  description: text,
  taxonomy_version: text,
}).strict();

const canonicalSnapshotSchema = z.object({
  source: z.enum(["live", "demo"]), source_label: text, repository: text, current_run_id: text, current_subject: subjectSchema, current_observation: currentObservationSchema, current_flow: flowSchema, previous_flow: flowSchema.nullable(), first_flow: flowSchema.nullable(),
  issues: z.array(issueSchema), agents: z.array(agentSchema), runs: z.array(runSchema), capabilities: z.array(repositoryCapabilitySchema), complexity: complexitySchema, manifest: manifestSchema.nullable(), terminal_contract: terminalSchema, current_authority: z.enum(["ADVISE", "OPERATE"]), detector_coverage: text, evidence_freshness: text,
}).strict();

type DeepReadonly<Value> = Value extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : Value extends object
    ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
    : Value;

export type CanonicalControlPlaneSnapshot = DeepReadonly<z.infer<typeof canonicalSnapshotSchema>>;

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid control-plane snapshot at ${path}: expected object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid control-plane snapshot at ${path}: expected non-empty string`);
  }
  return value;
}

function sha(value: unknown, path: string): Sha256 {
  const text = requiredString(value, path);
  if (!/^[a-f0-9]{64}$/.test(text)) throw new Error(`Invalid control-plane snapshot at ${path}: expected lowercase SHA-256`);
  return text as Sha256;
}

function exactKeys(value: Record<string, unknown>, path: string, expected: readonly string[]): void {
  const allowed = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Invalid control-plane snapshot at ${path}.${key}: unknown field`);
  }
  for (const key of expected) {
    if (!(key in value)) throw new Error(`Invalid control-plane snapshot at ${path}.${key}: missing field`);
  }
}

/**
 * Canonical producer/client boundary. This validates the complete top-level
 * shape, every nested field, and the identity/accounting fields shared by the
 * Bun producer and the browser read model. Presentation code must consume the
 * result; it must not establish a second validity policy.
 */
export function parseCanonicalLiveSnapshot(value: unknown, options: { readonly allow_demo?: boolean } = {}): CanonicalControlPlaneSnapshot {
  let strictSnapshot: z.infer<typeof canonicalSnapshotSchema>;
  try {
    strictSnapshot = canonicalSnapshotSchema.parse(value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      const suffix = issue?.code === "invalid_type" && issue.input === undefined ? "missing field" : issue?.message ?? "schema violation";
      throw new Error(`Invalid control-plane snapshot at ${issue?.path.join(".") || "snapshot"}: ${suffix}`);
    }
    throw error;
  }
  const snapshot = record(value, "snapshot");
  exactKeys(snapshot, "snapshot", CONTROL_PLANE_SNAPSHOT_FIELDS);
  if (snapshot.source !== "live" && !(options.allow_demo === true && snapshot.source === "demo")) throw new Error("Snapshot is missing a live evidence binding");

  const subject = record(snapshot.current_subject, "snapshot.current_subject");
  exactKeys(subject, "snapshot.current_subject", ["repository_id", "branch", "commit", "tree", "repository_object_sha256", "observed_at"]);
  const runId = requiredString(snapshot.current_run_id, "snapshot.current_run_id");
  const objectDigest = subject.repository_object_sha256 === null ? null : sha(subject.repository_object_sha256, "snapshot.current_subject.repository_object_sha256");
  const currentObservation = strictSnapshot.current_observation;
  if (currentObservation.kind === "FULL_MISTER_CLEAN_RUN") {
    if (currentObservation.evidence_binding.kind !== "REPOSITORY_OBJECT" || objectDigest === null || currentObservation.evidence_binding.sha256 !== objectDigest) {
      throw new Error("Invalid control-plane snapshot at snapshot.current_observation: full run requires the current repository-object binding");
    }
  } else {
    if (currentObservation.evidence_binding.kind !== "OBSERVATION_RECEIPT" || objectDigest !== null) {
      throw new Error("Invalid control-plane snapshot at snapshot.current_observation: partial observation requires a receipt binding and no repository-object digest");
    }
    if (currentObservation.current_debt_flow !== "UNKNOWN" || currentObservation.remediation_no_harm !== "UNKNOWN" || currentObservation.live_topology !== "UNKNOWN" || currentObservation.current_complexity !== "UNKNOWN") {
      throw new Error("Invalid control-plane snapshot at snapshot.current_observation: partial observation cannot establish current debt, no-harm, topology, or complexity without per-surface evidence");
    }
    if (strictSnapshot.current_authority !== "ADVISE") {
      throw new Error("Invalid control-plane snapshot at snapshot.current_authority: partial observation is ADVISE-only");
    }
  }
  if (currentObservation.current_complexity !== strictSnapshot.complexity.availability) {
    throw new Error("Invalid control-plane snapshot at snapshot.current_observation.current_complexity: does not match complexity availability");
  }

  if (!Array.isArray(snapshot.issues) || !Array.isArray(snapshot.agents) || !Array.isArray(snapshot.runs) || !Array.isArray(snapshot.capabilities)) {
    throw new Error("Invalid control-plane snapshot at snapshot: issues, agents, runs, and capabilities must be arrays");
  }
  const runIds = new Set<string>();
  for (const [index, run] of snapshot.runs.entries()) {
    const row = record(run, `snapshot.runs[${index}]`);
    const id = requiredString(row.run_id, `snapshot.runs[${index}].run_id`);
    if (runIds.has(id)) throw new Error(`Invalid control-plane snapshot at snapshot.runs[${index}].run_id: duplicate value`);
    runIds.add(id);
  }
  if (!runIds.has(runId)) throw new Error("Invalid control-plane snapshot at snapshot.current_run_id: not present in runs");
  const issueIds = new Set<string>();
  for (const [index, issue] of snapshot.issues.entries()) {
    const row = record(issue, `snapshot.issues[${index}]`);
    const id = requiredString(row.issue_id, `snapshot.issues[${index}].issue_id`);
    if (issueIds.has(id)) throw new Error(`Invalid control-plane snapshot at snapshot.issues[${index}].issue_id: duplicate value`);
    issueIds.add(id);
  }
  for (const [index, run] of snapshot.runs.entries()) {
    const row = record(run, `snapshot.runs[${index}]`);
    const subjectRow = record(row.subject, `snapshot.runs[${index}].subject`);
    const runDigest = subjectRow.repository_object_sha256 === null ? null : sha(subjectRow.repository_object_sha256, `snapshot.runs[${index}].subject.repository_object_sha256`);
    if (requiredString(row.run_id, `snapshot.runs[${index}].run_id`) === runId && runDigest !== objectDigest) {
      throw new Error("Invalid control-plane snapshot at snapshot.runs: current run subject does not match current subject");
    }
  }
  if (strictSnapshot.capabilities.length !== CAPABILITY_DEFINITIONS.length || canonicalJsonForSnapshot(strictSnapshot.capabilities) !== canonicalJsonForSnapshot(CAPABILITY_DEFINITIONS)) {
    throw new Error("Invalid control-plane snapshot at snapshot.capabilities: not canonical taxonomy");
  }
  const canonicalIssueIds = new Set(strictSnapshot.issues.map((issue) => issue.issue_id));
  if (canonicalIssueIds.size !== strictSnapshot.issues.length) throw new Error("Invalid control-plane snapshot at snapshot.issues: duplicate issue_id");
  for (const issue of strictSnapshot.issues) {
    for (const dependency of [...issue.prerequisite_issue_ids, ...issue.dependent_issue_ids]) {
      if (!canonicalIssueIds.has(dependency) || dependency === issue.issue_id) throw new Error(`Invalid control-plane snapshot at snapshot.issues.${issue.issue_id}: invalid issue dependency`);
    }
  }
  for (const run of strictSnapshot.runs) {
    for (const issueId of [...run.real_issue_ids, ...run.known_now_issue_ids, ...run.false_positive_issue_ids]) {
      if (!canonicalIssueIds.has(issueId)) throw new Error(`Invalid control-plane snapshot at snapshot.runs.${run.run_id}: unknown issue ID`);
    }
  }
  for (const agent of strictSnapshot.agents) {
    if (agent.execution_profile !== null && agent.execution_profile.agent_tuple_id !== agent.agent_tuple_id) {
      throw new Error(`Invalid control-plane snapshot at snapshot.agents.${agent.agent_tuple_id}.execution_profile: profile tuple does not match roster tuple`);
    }
    const identity = agent.execution_identity;
    if ((identity.disposition === "BOUND_FOR_EVALUATION" || identity.disposition === "BOUND_FOR_DISPATCH")
      && (identity.last_external_verification_at === null || identity.evidence.length === 0)) {
      throw new Error(`Invalid control-plane snapshot at snapshot.agents.${agent.agent_tuple_id}.execution_identity: bound identity requires external verification evidence`);
    }
    const performanceClaimed = Object.values(agent.metrics).some((value) => value !== null);
    if (performanceClaimed) throw new Error(`Invalid control-plane snapshot at snapshot.agents.${agent.agent_tuple_id}.metrics: performance attribution is unavailable until a ledger-derived external evaluation projection exists`);
    if (currentObservation.kind === "PARTIAL" && (agent.available || agent.active_in_repository)) {
      throw new Error(`Invalid control-plane snapshot at snapshot.agents.${agent.agent_tuple_id}: partial observation cannot claim current availability or repository activity`);
    }
  }
  const agentTupleIds = strictSnapshot.agents.map((agent) => agent.agent_tuple_id);
  if (new Set(agentTupleIds).size !== agentTupleIds.length) {
    throw new Error("Invalid control-plane snapshot at snapshot.agents: duplicate agent_tuple_id");
  }
  const agentByTupleId = new Map(strictSnapshot.agents.map((agent) => [agent.agent_tuple_id, agent]));
  const candidates: readonly AgentCandidate[] = strictSnapshot.agents.map((agent) => ({
    agent_tuple_id: agent.agent_tuple_id as never,
    active_in_repository: agent.active_in_repository,
    available: agent.available,
    capability_scores: agent.capability_scores.map((score) => ({ capability_id: score.capability_id as never, score: score.score, confidence: score.confidence, verified_trials: score.verified_trials, qualification: score.qualification })),
  }));
  for (const issue of strictSnapshot.issues) {
    const recommendation = issue.runner_recommendation;
    const requirements = new Set(recommendation.required_capabilities);
    const weights = new Set(recommendation.selection_weights.map((selection) => selection.capability_id));
    if (requirements.size !== recommendation.required_capabilities.length || weights.size !== recommendation.selection_weights.length
      || requirements.size !== weights.size || [...requirements].some((capabilityId) => !weights.has(capabilityId))) {
      throw new Error(`Invalid control-plane snapshot at snapshot.issues.${issue.issue_id}.runner_recommendation: required capabilities and weights must be one-to-one`);
    }
    if (recommendation.provenance.manifest_assignment_agent_tuple_id !== issue.recommended_tuple) {
      throw new Error(`Invalid control-plane snapshot at snapshot.issues.${issue.issue_id}.runner_recommendation.provenance: does not match the manifest assignment`);
    }
    const selections: readonly CapabilitySelection[] = recommendation.selection_weights.map((selection) => ({ capability_id: selection.capability_id as never, weight: selection.weight }));
    // Ranking preserves historical quality evidence for every available tuple.
    // A runner card is narrower: it requires a current, exact recipe binding.
    const runnableCandidates = candidates.filter((candidate) => agentByTupleId.get(String(candidate.agent_tuple_id))?.execution_profile !== null);
    const expected = rankAgents(runnableCandidates, selections, recommendation.minimum_qualification).at(0) ?? null;
    const card = recommendation.runner_card;
    if (card === null) {
      if (expected !== null) throw new Error(`Invalid control-plane snapshot at snapshot.issues.${issue.issue_id}.runner_recommendation.runner_card: omitted despite an eligible deterministic recommendation`);
      continue;
    }
    const agent = agentByTupleId.get(card.agent_tuple_id);
    if (agent === undefined || agent.model !== card.model || agent.harness !== card.harness || agent.reasoning_level !== card.reasoning_level) {
      throw new Error(`Invalid control-plane snapshot at snapshot.issues.${issue.issue_id}.runner_recommendation.runner_card: tuple identity does not match the admitted agent roster`);
    }
    const profile = agent.execution_profile;
    if (profile === null || card.profile_id !== profile.profile_id || card.profile_revision !== profile.revision || card.profile_fingerprint_sha256 !== profile.fingerprint_sha256) {
      throw new Error(`Invalid control-plane snapshot at snapshot.issues.${issue.issue_id}.runner_recommendation.runner_card: execution profile is absent or does not exactly bind the admitted recipe`);
    }
    const cardCapabilities = new Set(card.category_scores.map((score) => score.capability_id));
    if (cardCapabilities.size !== card.category_scores.length || cardCapabilities.size !== requirements.size || [...requirements].some((capabilityId) => !cardCapabilities.has(capabilityId))) {
      throw new Error(`Invalid control-plane snapshot at snapshot.issues.${issue.issue_id}.runner_recommendation.runner_card: scores do not cover required capabilities`);
    }
    if (expected === null || card.agent_tuple_id !== expected.agent_tuple_id) {
      throw new Error(`Invalid control-plane snapshot at snapshot.issues.${issue.issue_id}.runner_recommendation.runner_card: is not the deterministic eligible recommendation`);
    }
    const expectedScores = new Map(expected.category_scores.map((score) => [score.capability_id, score.weighted_score]));
    if (card.category_scores.some((score) => expectedScores.get(score.capability_id) !== score.weighted_score)) {
      throw new Error(`Invalid control-plane snapshot at snapshot.issues.${issue.issue_id}.runner_recommendation.runner_card: weighted scores do not match roster qualification`);
    }
  }
  if (strictSnapshot.complexity.availability === "MEASURED" && strictSnapshot.complexity.object_sha256 === null) {
    throw new Error("Invalid control-plane snapshot at snapshot.complexity.object_sha256: required when measured");
  }
  if (strictSnapshot.complexity.availability === "MEASURED"
    && strictSnapshot.complexity.object_sha256 !== strictSnapshot.current_subject.repository_object_sha256) {
    throw new Error("Invalid control-plane snapshot at snapshot.complexity.object_sha256: does not match current repository object");
  }
  const sameSubject = (left: typeof strictSnapshot.current_subject, right: typeof strictSnapshot.current_subject): boolean =>
    left.repository_id === right.repository_id && left.branch === right.branch && left.commit === right.commit && left.tree === right.tree
      && left.repository_object_sha256 === right.repository_object_sha256 && left.observed_at === right.observed_at;
  if (strictSnapshot.manifest !== null && !sameSubject(strictSnapshot.manifest.subject, strictSnapshot.current_subject)) {
    throw new Error("Invalid control-plane snapshot at snapshot.manifest.subject: does not match current subject");
  }
  if (strictSnapshot.manifest !== null) {
    for (const issueId of strictSnapshot.manifest.selected_issue_ids) {
      if (!canonicalIssueIds.has(issueId)) throw new Error(`Invalid control-plane snapshot at snapshot.manifest.selected_issue_ids: unknown issue ID ${issueId}`);
    }
    if (strictSnapshot.current_authority !== strictSnapshot.manifest.authority_mode) {
      throw new Error("Invalid control-plane snapshot at snapshot.current_authority: does not match manifest authority");
    }
  }
  if (strictSnapshot.terminal_contract.subject !== null && !sameSubject(strictSnapshot.terminal_contract.subject, strictSnapshot.current_subject)) {
    throw new Error("Invalid control-plane snapshot at snapshot.terminal_contract.subject: does not match current subject");
  }
  const currentRun = strictSnapshot.runs.find((run) => run.run_id === strictSnapshot.current_run_id);
  if (currentRun === undefined) throw new Error("Invalid control-plane snapshot at snapshot.current_run_id: current run is absent");
  if (canonicalJsonForSnapshot(currentRun.debt_flow) !== canonicalJsonForSnapshot(strictSnapshot.current_flow)) {
    throw new Error("Invalid control-plane snapshot at snapshot.current_flow: does not match current run debt flow");
  }
  const hasExactIssueSet = (actual: readonly string[], expected: ReadonlySet<string>): boolean => {
    const actualSet = new Set(actual);
    return actualSet.size === actual.length && actualSet.size === expected.size && [...expected].every((issueId) => actualSet.has(issueId));
  };
  const payableIssueIds = new Set(strictSnapshot.issues.filter((issue) => issue.state !== "paid" && issue.state !== "false_positive").map((issue) => issue.issue_id));
  const falsePositiveIssueIds = new Set(strictSnapshot.issues.filter((issue) => issue.state === "false_positive").map((issue) => issue.issue_id));
  if (currentObservation.kind === "FULL_MISTER_CLEAN_RUN" && (!hasExactIssueSet(currentRun.real_issue_ids, payableIssueIds) || !hasExactIssueSet(currentRun.known_now_issue_ids, payableIssueIds))) {
    throw new Error("Invalid control-plane snapshot at snapshot.runs: current run issue sets do not match payable canonical issue states");
  }
  if (currentObservation.kind === "FULL_MISTER_CLEAN_RUN" && !hasExactIssueSet(currentRun.false_positive_issue_ids, falsePositiveIssueIds)) {
    throw new Error("Invalid control-plane snapshot at snapshot.runs: current run false-positive set does not match canonical issue states");
  }
  if (strictSnapshot.terminal_contract.declared_verdict === "CLEAN") {
    const contract = strictSnapshot.terminal_contract.contract;
    if (currentRun.terminal_verdict !== "CLEAN") throw new Error("Invalid control-plane snapshot at snapshot.terminal_contract: current run is not CLEAN");
    if (strictSnapshot.current_flow.ending_real_issues !== 0 || strictSnapshot.current_flow.caused_by_remediation !== 0 || strictSnapshot.current_flow.boundary_blocked !== 0) {
      throw new Error("Invalid control-plane snapshot at snapshot.current_flow: CLEAN requires zero ending, caused, and boundary debt");
    }
    if (currentRun.real_issue_ids.length !== 0 || currentRun.known_now_issue_ids.length !== 0) {
      throw new Error("Invalid control-plane snapshot at snapshot.terminal_contract: CLEAN requires empty current run issue sets");
    }
    if (payableIssueIds.size !== 0) throw new Error("Invalid control-plane snapshot at snapshot.terminal_contract: CLEAN cannot retain a payable canonical issue");
    if (strictSnapshot.terminal_contract.subject === null) throw new Error("Invalid control-plane snapshot at snapshot.terminal_contract.subject: required for CLEAN");
    if (contract === null || Object.values(contract).some((value) => value !== true)) {
      throw new Error("Invalid control-plane snapshot at snapshot.terminal_contract.contract: CLEAN requires every terminal condition");
    }
    if (strictSnapshot.terminal_contract.evidence.length === 0) throw new Error("Invalid control-plane snapshot at snapshot.terminal_contract.evidence: required for CLEAN");
  }
  if (currentObservation.kind === "PARTIAL" && (strictSnapshot.manifest !== null || strictSnapshot.terminal_contract.declared_verdict !== null || strictSnapshot.terminal_contract.subject !== null || strictSnapshot.terminal_contract.contract !== null || strictSnapshot.terminal_contract.evidence.length !== 0)) {
    throw new Error("Invalid control-plane snapshot at snapshot.current_observation: partial observation cannot declare manifest or terminal closure evidence");
  }
  // Return the strict wire object without convenience aliases. A parser output
  // must be valid input to the same parser, including after JSON transport.
  return strictSnapshot;
}

function canonicalJsonForSnapshot(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return JSON.stringify(value);
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJsonForSnapshot(object[key])}`).join(",")}}`;
}
