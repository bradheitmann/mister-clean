import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { canonicalJson, sha256Bytes } from "./authority.js";
import { canonicalCapabilityEvaluators } from "../contracts/capability-evaluator-registry.js";
import {
  parseAgentExecutionProfile,
  parseExecutionTreatment,
  type AgentExecutionProfile,
  type ExecutionTreatment,
} from "../contracts/agent-profile.js";
import type {
  AgentIdentityLease, AgentIdentityObservation,
  AgentIdentityDisposition, AgentIdentityAssurance, EvaluationReason, QualificationLevel,
  TokenTelemetry,
  RouteTelemetry,
  CostTelemetry,
} from "../contracts/agent-evaluation.js";
import type { CapabilityId, EvidenceRef, IsoTimestamp, Sha256 } from "../contracts/primitives.js";
import { parseRepositoryCapabilityId } from "../contracts/capability-taxonomy.js";
import { evaluateAgentIdentityLease } from "../domain/agent-identity.js";
import { deriveQualification, evaluationSamplingDecision } from "../domain/qualification.js";
import type { OpenControlPlaneDatabase } from "../persistence/sqlite.js";
import { readQualificationEvidence } from "./sqlite-store.js";
import { verifiedReceiptForBinding, type VerifiedEvaluationIdentityReceipt } from "./evaluation-identity-receipt.js";
import type { CapabilityEvaluatorExecutionReceipt } from "./capability-evaluator-execution.js";

export interface RetainedEvaluationEvidence {
  readonly sha256: Sha256;
  readonly media_type: string;
  readonly bytes: Uint8Array;
}

export interface EvaluationRunStart {
  readonly source_run_token: string;
  /** Legacy scheduling/experiment label. Never used as repository proof. */
  readonly repository_cohort_token: string;
  /** The local checkout root is resolved through a sanitized Git invocation.
   * It is physical repository evidence; the cohort is not. */
  readonly local_repository_root: string;
  readonly capability_id: CapabilityId;
  /** A closed evaluator-detected reason. It is never inferred from telemetry. */
  readonly anomaly_reason?: Exclude<EvaluationReason, "pre_clearance_every_run" | "scheduled_five_percent_sample"> | null;
  readonly started_at: IsoTimestamp;
  readonly token_telemetry: TokenTelemetry;
  readonly route_telemetry: RouteTelemetry;
  readonly cost_telemetry: CostTelemetry;
  /** Explicit supervised diagnostic admission; never automatic eligibility. */
  readonly user_authorized_exploratory?: boolean;
}

export interface EvaluationRunStartInput {
  readonly profile: unknown;
  readonly treatment: unknown;
  readonly identity_lease: AgentIdentityLease;
  readonly run: EvaluationRunStart;
  readonly retained_evidence: readonly RetainedEvaluationEvidence[];
  /** Public intake supplies imported identity-unobserved CLI receipts. Kept
   * optional only for lower-level recorder fixtures; the transport boundary
   * requires at least one. */
  readonly invocation_ids?: readonly string[];
  /** Dispatch subject and final candidate are distinct evidence facts. */
  readonly task_subject?: {
    readonly dispatch_scope_evidence_sha256: Sha256;
    readonly subject_repository_object_sha256: Sha256;
  };
  /** Opaque token minted only by the startup-configured custody authority. */
  readonly pre_dispatch_receipt_verification?: VerifiedEvaluationIdentityReceipt | null;
}

export interface RecordedEvaluationRunStart {
  readonly run_event_id: string;
  readonly repository_id: string;
  readonly evaluation_required: boolean;
  readonly evaluation_reason: EvaluationReason | "not_selected";
  readonly qualification_at_dispatch: QualificationLevel;
  readonly post_clearance_run_ordinal: number | null;
  readonly identity_disposition: AgentIdentityDisposition;
  readonly identity_credit_possible: boolean;
  readonly identity_assurance: AgentIdentityAssurance | null;
  readonly automatic_routing_eligible: boolean;
  readonly repository_provenance: "MACHINE_LOCAL_GIT_ROOT";
  /** A checkout is physical Git evidence only. Qualification diversity waits
   * for a separately retained logical-project alias policy. */
  readonly logical_project_provenance: "UNRESOLVED";
}

export interface CapabilityEvaluationOutcome {
  readonly evaluator_id: string;
  readonly case_id: string;
  readonly result: boolean;
  readonly evaluator_actor_id: string;
  readonly evidence_sha256: Sha256;
}

export interface EvaluationOutcomeInput {
  readonly run_event_id: string;
  readonly identity_lease: AgentIdentityLease;
  readonly worker_actor_id: string;
  readonly author_actor_id: string;
  readonly verified_success: boolean;
  /** When the worker's task ended; persisted as the trial completion. */
  readonly task_completed_at: IsoTimestamp;
  /** When independent evaluation was recorded; it may be later than task end. */
  readonly evaluated_at: IsoTimestamp;
  readonly completion_evidence_sha256: Sha256;
  readonly evaluations: readonly CapabilityEvaluationOutcome[];
  /** Receipts produced by the trusted runtime evaluator adapter. Public
   * intake supplies these; lower-level test fixtures may omit them. */
  readonly evaluator_execution_receipts?: readonly CapabilityEvaluatorExecutionReceipt[];
  readonly retained_evidence: readonly RetainedEvaluationEvidence[];
  readonly evaluated_candidate?: {
    readonly transition_scope_evidence_sha256: Sha256;
    readonly evaluated_repository_object_sha256: Sha256;
  };
  readonly pre_evaluation_receipt_verification?: VerifiedEvaluationIdentityReceipt | null;
}

export interface RecordedEvaluationOutcome {
  readonly run_event_id: string;
  readonly identity_disposition: AgentIdentityDisposition;
  readonly contributes_quality_credit: boolean;
  readonly qualification_after_outcome: QualificationLevel;
}

export interface LogicalProjectAlias {
  readonly repository_id: string;
  readonly attestation_evidence_sha256: Sha256;
}

/** Operator-attested local mapping. Remote URLs, checkout names, and Git
 * history are deliberately not guessed as logical-project equivalence. */
export interface LogicalProjectRegistrationInput {
  readonly logical_project_id: string;
  readonly operator_actor_id: string;
  readonly registration_evidence_sha256: Sha256;
  readonly aliases: readonly LogicalProjectAlias[];
  readonly registered_at: IsoTimestamp;
  readonly retained_evidence: readonly RetainedEvaluationEvidence[];
}

export interface RecordedLogicalProjectRegistration {
  readonly logical_project_id: string;
  readonly alias_count: number;
  readonly provenance: "OPERATOR_ATTESTED";
}

function requireText(value: string, field: string): void {
  if (value.trim().length === 0) throw new Error(`${field} must be non-empty`);
}

const START_ANOMALY_REASONS = new Set<Exclude<EvaluationReason, "pre_clearance_every_run" | "scheduled_five_percent_sample">>([
  "no_harm_anomaly", "authority_anomaly", "detector_disagreement", "reopened_work",
  "integration_rejection", "quality_drift", "route_identity_change", "operator_requested",
]);

function parseStartAnomalyReason(value: unknown): Exclude<EvaluationReason, "pre_clearance_every_run" | "scheduled_five_percent_sample"> | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !START_ANOMALY_REASONS.has(value as Exclude<EvaluationReason, "pre_clearance_every_run" | "scheduled_five_percent_sample">)) {
    throw new Error("run anomaly_reason must be a closed evaluation anomaly reason");
  }
  return value as Exclude<EvaluationReason, "pre_clearance_every_run" | "scheduled_five_percent_sample">;
}

/** SQLite BEGIN IMMEDIATE serializes the qualification read plus ordinal
 * allocation across local recorder processes. A deferred read transaction
 * could let two post-clearance starts both choose ordinal 20. */
function withImmediateTransaction<Result>(database: OpenControlPlaneDatabase, callback: () => Result): Result {
  database.database.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    database.database.exec("COMMIT");
    return result;
  } catch (error) {
    try { database.database.exec("ROLLBACK"); } catch { /* transaction may already be aborted */ }
    throw error;
  }
}

function timestampMilliseconds(value: IsoTimestamp, field: string): number {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    throw new Error(`${field} must be a canonical ISO timestamp`);
  }
  return milliseconds;
}

function profileFingerprint(profile: AgentExecutionProfile): Sha256 {
  const { fingerprint_sha256: _fingerprint, ...content } = profile;
  return sha256Bytes(canonicalJson(content));
}

function canonicalProfile(profile: AgentExecutionProfile): string {
  return canonicalJson(profile);
}

interface LocalRepositoryIdentity {
  readonly repository_id: string;
  readonly canonical_local_repository_root: string;
  readonly canonical_git_common_directory: string;
  readonly evidence: RetainedEvaluationEvidence;
}

interface ResolvedGitCheckout {
  readonly canonical_requested_path: string;
  readonly canonical_git_top_level: string;
  readonly canonical_git_common_directory: string;
}

interface LocalTargetBinding {
  readonly binding: "not_declared" | "bound_authorized_checkout";
  readonly canonical_tool_target_root: string | null;
  readonly canonical_command_cwd: string | null;
  readonly canonical_git_top_level: string | null;
  readonly canonical_git_common_directory: string | null;
  readonly evidence: RetainedEvaluationEvidence | null;
}

/**
 * Repository identity is derived from a real local checkout root, never from
 * an experiment/cohort label. The retained canonical receipt makes that
 * machine-local observation independently inspectable without a provider call.
 */
function resolveGitCheckout(path: string, field: string): ResolvedGitCheckout {
  requireText(path, field);
  if (!isAbsolute(path)) throw new Error(`${field} must be an absolute path`);
  const requestedRoot = realpathSync(resolve(path));
  let canonicalRoot: string;
  let canonicalCommonDirectory: string;
  try {
    // Never inherit a caller's Git selection.  GIT_DIR/GIT_WORK_TREE can make
    // a non-repository directory appear to be a checkout of another project.
    const gitEnvironment: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" };
    for (const name of [
      "GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE",
      "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_CEILING_DIRECTORIES", "GIT_DISCOVERY_ACROSS_FILESYSTEM",
    ]) delete gitEnvironment[name];
    const git = (parameters: readonly string[]): string => execFileSync("git", ["--no-optional-locks", "-C", requestedRoot, ...parameters], {
      encoding: "utf8",
      env: gitEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const topLevel = git(["rev-parse", "--show-toplevel"]);
    const commonDirectory = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    if (!isAbsolute(topLevel) || !isAbsolute(commonDirectory)) throw new Error("git did not return absolute repository identity paths");
    canonicalRoot = realpathSync(topLevel);
    canonicalCommonDirectory = realpathSync(commonDirectory);
    const rootRelation = relative(canonicalRoot, requestedRoot);
    if (rootRelation === ".." || rootRelation.startsWith(`..${sep}`) || isAbsolute(rootRelation)) {
      throw new Error(`${field} is outside Git top-level`);
    }
  } catch {
    throw new Error(`${field} must resolve to a local Git checkout`);
  }
  return {
    canonical_requested_path: requestedRoot,
    canonical_git_top_level: canonicalRoot,
    canonical_git_common_directory: canonicalCommonDirectory,
  };
}

function resolveLocalRepositoryIdentity(localRoot: string): LocalRepositoryIdentity {
  const checkout = resolveGitCheckout(localRoot, "local_repository_root");
  const bytes = Buffer.from(canonicalJson({
    schema_version: "1.0",
    canonical_local_repository_root: checkout.canonical_git_top_level,
    canonical_git_common_directory: checkout.canonical_git_common_directory,
  }), "utf8");
  const sha256 = sha256Bytes(bytes);
  return {
    // The shared Git common directory identifies one repository across its
    // primary checkout and all linked worktrees. Worktree paths are evidence,
    // not distinct-repository qualification keys.
    repository_id: `local-repository:${sha256Bytes(canonicalJson({ canonical_git_common_directory: checkout.canonical_git_common_directory }))}`,
    canonical_local_repository_root: checkout.canonical_git_top_level,
    canonical_git_common_directory: checkout.canonical_git_common_directory,
    evidence: { sha256, media_type: "application/vnd.mister-clean.local-repository-identity+json", bytes },
  };
}

function resolveLocalTargetBinding(
  observation: AgentIdentityObservation,
  repository: Pick<LocalRepositoryIdentity, "canonical_local_repository_root" | "canonical_git_common_directory">,
): LocalTargetBinding {
  const target = observation.control_target;
  const toolTargetRoot = target.tool_target_root;
  const commandCwd = target.command_cwd;
  if (toolTargetRoot === null && commandCwd === null) {
    return { binding: "not_declared", canonical_tool_target_root: null, canonical_command_cwd: null, canonical_git_top_level: null, canonical_git_common_directory: null, evidence: null };
  }
  if (toolTargetRoot !== null) {
    const tool = resolveGitCheckout(toolTargetRoot, "identity control target tool_target_root");
    if (tool.canonical_requested_path !== tool.canonical_git_top_level) {
      throw new Error("identity control target tool_target_root must be the Git checkout top-level");
    }
    if (tool.canonical_git_top_level !== repository.canonical_local_repository_root
      || tool.canonical_git_common_directory !== repository.canonical_git_common_directory) {
      throw new Error("identity control target does not resolve to the authorized local Git checkout");
    }
    if (commandCwd !== null && !isAbsolute(commandCwd)) throw new Error("identity control target command_cwd must be an absolute path");
    const canonicalCommandCwd = commandCwd === null ? null : realpathSync(resolve(commandCwd));
    return targetBindingFromResolvedTarget(observation, target.kind, tool, canonicalCommandCwd, repository, "tool_target_root");
  }
  const cwd = resolveGitCheckout(commandCwd!, "identity control target command_cwd fallback");
  if (cwd.canonical_git_top_level !== repository.canonical_local_repository_root
    || cwd.canonical_git_common_directory !== repository.canonical_git_common_directory) {
    throw new Error("identity control target does not resolve to the authorized local Git checkout");
  }
  return targetBindingFromResolvedTarget(observation, target.kind, cwd, cwd.canonical_requested_path, repository, "command_cwd_fallback");
}

function targetBindingFromResolvedTarget(
  observation: AgentIdentityObservation,
  targetKind: AgentIdentityObservation["control_target"]["kind"],
  effectiveTarget: ResolvedGitCheckout,
  canonicalCommandCwd: string | null,
  repository: Pick<LocalRepositoryIdentity, "canonical_local_repository_root" | "canonical_git_common_directory">,
  effectiveTargetSource: "tool_target_root" | "command_cwd_fallback",
): LocalTargetBinding {
  const bytes = Buffer.from(canonicalJson({
    schema_version: "1.0",
    observation_id: observation.observation_id,
    phase: observation.phase,
    target_kind: targetKind,
    effective_target_source: effectiveTargetSource,
    canonical_tool_target_root: effectiveTargetSource === "tool_target_root" ? effectiveTarget.canonical_requested_path : null,
    canonical_command_cwd: canonicalCommandCwd,
    canonical_git_top_level: effectiveTarget.canonical_git_top_level,
    canonical_git_common_directory: effectiveTarget.canonical_git_common_directory,
    authorized_local_repository_root: repository.canonical_local_repository_root,
  }), "utf8");
  return {
    binding: "bound_authorized_checkout",
    canonical_tool_target_root: effectiveTargetSource === "tool_target_root" ? effectiveTarget.canonical_requested_path : null,
    canonical_command_cwd: canonicalCommandCwd,
    canonical_git_top_level: effectiveTarget.canonical_git_top_level,
    canonical_git_common_directory: effectiveTarget.canonical_git_common_directory,
    evidence: { sha256: sha256Bytes(bytes), media_type: "application/vnd.mister-clean.identity-control-target-git+json", bytes },
  };
}

function resolveLocalTargetBindings(lease: AgentIdentityLease, repository: Pick<LocalRepositoryIdentity, "canonical_local_repository_root" | "canonical_git_common_directory">): Readonly<Record<"pre_dispatch" | "pre_evaluation", LocalTargetBinding | null>> {
  return {
    pre_dispatch: lease.pre_dispatch === null ? null : resolveLocalTargetBinding(lease.pre_dispatch, repository),
    pre_evaluation: lease.pre_evaluation === null ? null : resolveLocalTargetBinding(lease.pre_evaluation, repository),
  };
}

function withLocalTargetEvidence(evidence: readonly RetainedEvaluationEvidence[], bindings: Readonly<Record<"pre_dispatch" | "pre_evaluation", LocalTargetBinding | null>>): readonly RetainedEvaluationEvidence[] {
  const result = [...evidence];
  for (const binding of Object.values(bindings)) {
    if (binding?.evidence !== null && binding?.evidence !== undefined && !result.some((item) => item.sha256 === binding.evidence!.sha256)) result.push(binding.evidence);
  }
  return result;
}

function withRepositoryEvidence(evidence: readonly RetainedEvaluationEvidence[], repository: LocalRepositoryIdentity): readonly RetainedEvaluationEvidence[] {
  const existing = evidence.find((item) => item.sha256 === repository.evidence.sha256);
  if (existing !== undefined) {
    if (existing.media_type !== repository.evidence.media_type || Buffer.compare(Buffer.from(existing.bytes), Buffer.from(repository.evidence.bytes)) !== 0) {
      throw new Error("repository identity evidence digest is bound to different retained bytes");
    }
    return evidence;
  }
  return [...evidence, repository.evidence];
}

function retainAll(database: OpenControlPlaneDatabase, evidence: readonly RetainedEvaluationEvidence[], retainedAt: IsoTimestamp): void {
  const seen = new Set<string>();
  for (const item of evidence) {
    if (!/^[0-9a-f]{64}$/u.test(item.sha256) || item.bytes.byteLength === 0 || item.media_type.trim().length === 0) {
      throw new Error("retained evaluation evidence must have canonical digest, media type, and non-empty bytes");
    }
    if (!seen.add(item.sha256)) throw new Error(`duplicate retained evaluation evidence ${item.sha256}`);
    if (sha256Bytes(item.bytes) !== item.sha256) throw new Error(`retained evaluation evidence digest mismatch ${item.sha256}`);
    database.database.query(
      `INSERT INTO agent_evaluation_evidence(evidence_sha256, media_type, evidence_bytes, byte_length, retained_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(evidence_sha256) DO NOTHING`,
    ).run(item.sha256, item.media_type, item.bytes, item.bytes.byteLength, retainedAt);
  }
}

/** Registers immutable, retained-evidence aliases after physical checkout
 * observations exist. Exact replay is idempotent; any reassignment conflicts. */
export function registerMachineLocalLogicalProject(
  database: OpenControlPlaneDatabase,
  input: LogicalProjectRegistrationInput,
): RecordedLogicalProjectRegistration {
  if (database.kind !== "global") throw new Error("logical-project registration requires the machine-local global database");
  requireText(input.logical_project_id, "logical_project_id");
  requireText(input.operator_actor_id, "operator_actor_id");
  timestampMilliseconds(input.registered_at, "registered_at");
  if (input.aliases.length === 0 || input.aliases.length > 100) throw new Error("logical-project registration requires one to 100 aliases");
  if (new Set(input.aliases.map((alias) => alias.repository_id)).size !== input.aliases.length) throw new Error("logical-project aliases must not repeat a physical repository");
  const retained = evidenceSet(input.retained_evidence);
  if (!retained.has(input.registration_evidence_sha256) || input.aliases.some((alias) => !retained.has(alias.attestation_evidence_sha256))) {
    throw new Error("logical-project registration evidence must be retained");
  }
  return withImmediateTransaction(database, () => {
    retainAll(database, input.retained_evidence, input.registered_at);
    const registration = database.database.query<{ operator_actor_id: string; registration_evidence_sha256: string }>(
      "SELECT operator_actor_id, registration_evidence_sha256 FROM logical_projects WHERE logical_project_id = ?",
    ).get(input.logical_project_id);
    if (registration === null) {
      database.database.query(
        `INSERT INTO logical_projects(logical_project_id, operator_actor_id, registration_evidence_sha256, registered_at)
         VALUES (?, ?, ?, ?)`,
      ).run(input.logical_project_id, input.operator_actor_id, input.registration_evidence_sha256, input.registered_at);
    } else if (registration.operator_actor_id !== input.operator_actor_id || registration.registration_evidence_sha256 !== input.registration_evidence_sha256) {
      throw new Error("logical project id is already bound to different operator evidence");
    }
    for (const alias of input.aliases) {
      const physical = database.database.query<{ repository_id: string }>(
        "SELECT repository_id FROM local_repository_identities WHERE repository_id = ?",
      ).get(alias.repository_id);
      if (physical === null) throw new Error("logical-project alias requires a previously observed physical checkout");
      const persisted = database.database.query<{ logical_project_id: string; operator_actor_id: string; attestation_evidence_sha256: string }>(
        "SELECT logical_project_id, operator_actor_id, attestation_evidence_sha256 FROM logical_project_repository_aliases WHERE repository_id = ?",
      ).get(alias.repository_id);
      if (persisted === null) {
        database.database.query(
          `INSERT INTO logical_project_repository_aliases(repository_id, logical_project_id, operator_actor_id, attestation_evidence_sha256, attested_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(alias.repository_id, input.logical_project_id, input.operator_actor_id, alias.attestation_evidence_sha256, input.registered_at);
      } else if (persisted.logical_project_id !== input.logical_project_id || persisted.operator_actor_id !== input.operator_actor_id || persisted.attestation_evidence_sha256 !== alias.attestation_evidence_sha256) {
        throw new Error("physical checkout alias is already bound to different logical-project evidence");
      }
    }
    return { logical_project_id: input.logical_project_id, alias_count: input.aliases.length, provenance: "OPERATOR_ATTESTED" };
  });
}

function evidenceSet(evidence: readonly RetainedEvaluationEvidence[]): ReadonlySet<string> {
  return new Set(evidence.map((item) => item.sha256));
}

function requireRetained(refs: readonly { readonly sha256: string }[], retained: ReadonlySet<string>, field: string): void {
  if (refs.length === 0 || refs.some((ref) => !retained.has(ref.sha256))) {
    throw new Error(`${field} must resolve to retained machine-local evidence`);
  }
}

function requireOneObservationEvidence(refs: readonly EvidenceRef[], retained: ReadonlySet<string>, field: string): Sha256 {
  requireRetained(refs, retained, field);
  if (refs.length !== 1) throw new Error(`${field} must contain exactly one retained evidence reference for the current SQLite schema`);
  return refs[0]!.sha256;
}

function requireKnownRoute(database: OpenControlPlaneDatabase, profile: AgentExecutionProfile, lease: AgentIdentityLease, run: EvaluationRunStart): void {
  const row = database.database.query<{ agent_tuple_id: string }>(
    `SELECT agent_tuple_id FROM execution_routes WHERE execution_route_id = ? AND agent_tuple_id = ?`,
  ).get(lease.execution_route_id, profile.agent_tuple_id);
  if (row === null) throw new Error("execution route is not registered for the observed agent tuple");
  const capability = database.database.query<{ capability_id: string }>("SELECT capability_id FROM capabilities WHERE capability_id = ?").get(run.capability_id);
  if (capability === null) throw new Error(`capability ${run.capability_id} is not seeded in the machine-local registry`);
}

function assertStartShape(database: OpenControlPlaneDatabase, raw: EvaluationRunStartInput): {
  readonly profile: AgentExecutionProfile;
  readonly treatment: ExecutionTreatment;
  readonly capabilityId: CapabilityId;
  readonly repository: LocalRepositoryIdentity;
  readonly targetBindings: Readonly<Record<"pre_dispatch" | "pre_evaluation", LocalTargetBinding | null>>;
  readonly retained: ReadonlySet<string>;
  readonly retainedEvidence: readonly RetainedEvaluationEvidence[];
  readonly anomalyReason: Exclude<EvaluationReason, "pre_clearance_every_run" | "scheduled_five_percent_sample"> | null;
} {
  if (database.kind !== "global") throw new Error("evaluation recorder requires the machine-local global database");
  const profile = parseAgentExecutionProfile(raw.profile);
  const treatment = parseExecutionTreatment(raw.treatment);
  const capabilityId = parseRepositoryCapabilityId(raw.run.capability_id);
  const repository = resolveLocalRepositoryIdentity(raw.run.local_repository_root);
  const targetBindings = resolveLocalTargetBindings(raw.identity_lease, repository);
  const retainedEvidence = withLocalTargetEvidence(withRepositoryEvidence(raw.retained_evidence, repository), targetBindings);
  const retained = evidenceSet(retainedEvidence);
  if (profile.fingerprint_sha256 !== profileFingerprint(profile)) throw new Error("profile fingerprint does not bind canonical profile content");
  if (treatment.profile_id !== profile.profile_id || treatment.profile_revision !== profile.revision
    || treatment.profile_fingerprint_sha256 !== profile.fingerprint_sha256 || treatment.observed_profile_sha256 !== profile.fingerprint_sha256) {
    throw new Error("treatment does not bind the observed canonical execution profile");
  }
  if (treatment.run_event_id.trim().length === 0 || treatment.completed_at !== null) throw new Error("run-start treatment must have a non-empty run_event_id and null completed_at");
  if (treatment.capability_id !== capabilityId || treatment.repository_cohort_token !== raw.run.repository_cohort_token) throw new Error("treatment does not match the started capability or cohort token");
  if (raw.identity_lease.requested_tuple.agent_tuple_id !== profile.agent_tuple_id
    || (raw.identity_lease.pre_dispatch !== null
      && raw.identity_lease.execution_route_id !== raw.identity_lease.pre_dispatch.execution_route_id)) {
    throw new Error("run-start profile, treatment, and lease identity bindings disagree");
  }
  requireText(raw.run.source_run_token, "source_run_token");
  requireText(raw.run.repository_cohort_token, "repository_cohort_token");
  requireRetained(profile.evidence, retained, "profile evidence");
  requireRetained(treatment.evidence, retained, "treatment evidence");
  if (raw.identity_lease.pre_dispatch !== null) requireOneObservationEvidence(raw.identity_lease.pre_dispatch.evidence, retained, "pre-dispatch identity evidence");
  if (raw.identity_lease.pre_evaluation !== null) requireOneObservationEvidence(raw.identity_lease.pre_evaluation.evidence, retained, "pre-evaluation identity evidence");
  for (const invalidation of raw.identity_lease.invalidations) requireRetained(invalidation.evidence, retained, "identity invalidation evidence");
  if (raw.task_subject !== undefined) {
    if (!retained.has(raw.task_subject.dispatch_scope_evidence_sha256)) throw new Error("dispatch task scope evidence must be retained");
    if (!/^[0-9a-f]{64}$/u.test(raw.task_subject.subject_repository_object_sha256)) throw new Error("dispatch subject repository object must be canonical SHA-256");
  }
  requireKnownRoute(database, profile, raw.identity_lease, raw.run);
  return { profile, treatment, capabilityId, repository, targetBindings, retained, retainedEvidence, anomalyReason: parseStartAnomalyReason(raw.run.anomaly_reason) };
}

function upsertCanonicalEvaluators(database: OpenControlPlaneDatabase, capabilityId: CapabilityId): void {
  for (const evaluator of canonicalCapabilityEvaluators(capabilityId)) {
    database.database.query(
      `INSERT INTO capability_evaluators(evaluator_id, capability_id, question, evaluator_version, active, evaluation_dimension, independent_evaluator)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(evaluator_id) DO NOTHING`,
    ).run(evaluator.evaluator_id, evaluator.capability_id, evaluator.question, evaluator.evaluator_version, evaluator.evaluation_dimension, Number(evaluator.independent_evaluator));
    const persisted = database.database.query<{ capability_id: string; question: string; evaluator_version: string; active: number; evaluation_dimension: string; independent_evaluator: number }>(
      "SELECT capability_id, question, evaluator_version, active, evaluation_dimension, independent_evaluator FROM capability_evaluators WHERE evaluator_id = ?",
    ).get(evaluator.evaluator_id);
    if (persisted === null || persisted.capability_id !== evaluator.capability_id || persisted.question !== evaluator.question
      || persisted.evaluator_version !== evaluator.evaluator_version || persisted.active !== 1
      || persisted.evaluation_dimension !== evaluator.evaluation_dimension || persisted.independent_evaluator !== Number(evaluator.independent_evaluator)) {
      throw new Error(`canonical evaluator registry conflict for ${evaluator.evaluator_id}`);
    }
  }
}

function insertObservation(database: OpenControlPlaneDatabase, lease: AgentIdentityLease, phase: "pre_dispatch" | "pre_evaluation", retained: ReadonlySet<string>, targetBinding: LocalTargetBinding | null): void {
  const observation = phase === "pre_dispatch" ? lease.pre_dispatch : lease.pre_evaluation;
  if (observation === null) return;
  const digest = requireOneObservationEvidence(observation.evidence, retained, `${phase} identity evidence`);
  database.database.query(
    `INSERT INTO agent_identity_observations(observation_id, identity_lease_id, phase, requested_agent_tuple_id, execution_route_id, observed_model_id, observed_harness_id, observed_reasoning_level, evidence_kind, evidence_sha256, observer_actor_id, control_surface_token, harness_session_token, process_instance_token, intended_surface_label, worker_self_report, observed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(observation.observation_id, lease.identity_lease_id, phase, observation.requested_agent_tuple_id, observation.execution_route_id,
    observation.observed_model_id, observation.observed_harness_id, observation.observed_reasoning_level, observation.evidence_kind, digest,
    observation.observer_actor_id, observation.control_surface_id, observation.harness_session_token, observation.process_instance_token ?? "",
    observation.intended_surface_label, observation.worker_self_report, observation.observed_at);
  const targetJson = canonicalJson(observation.control_target);
  database.database.query(
    `INSERT INTO agent_identity_observation_targets(observation_id, target_kind, target_sha256, canonical_target_json, recorded_at, local_target_binding, target_git_evidence_sha256, canonical_tool_target_root, canonical_command_cwd, canonical_git_top_level, canonical_git_common_directory)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    observation.observation_id, observation.control_target.kind, sha256Bytes(targetJson), targetJson, observation.observed_at,
    targetBinding?.binding ?? "not_declared", targetBinding?.evidence?.sha256 ?? null,
    targetBinding?.canonical_tool_target_root ?? null, targetBinding?.canonical_command_cwd ?? null,
    targetBinding?.canonical_git_top_level ?? null, targetBinding?.canonical_git_common_directory ?? null,
  );
}

function isCreditAssurance(value: AgentIdentityAssurance | null): boolean {
  return value === "active_harness_selection" || value === "provider_execution_attested";
}

function hasBoundLocalTarget(binding: LocalTargetBinding | null): boolean {
  return binding?.binding === "bound_authorized_checkout";
}

/**
 * Internal machine-local intake entrypoint. It records only a started Mister
 * Clean run and evidence/identity observations; it neither dispatches work nor
 * fetches providers. Completion is deliberately a second call so a later bad
 * evaluation cannot erase the observed run-start; only independently retained
 * evidence can change the qualification used by the next start.
 */
export function recordMachineLocalEvaluationRunStart(database: OpenControlPlaneDatabase, raw: EvaluationRunStartInput): RecordedEvaluationRunStart {
  const parsed = assertStartShape(database, raw);
  const dispatchIdentity = evaluateAgentIdentityLease(raw.identity_lease, "dispatch");
  const dispatchReceipt = verifiedReceiptForBinding(raw.pre_dispatch_receipt_verification, {
    phase: "pre_dispatch", run_event_id: parsed.treatment.run_event_id, identity_lease: raw.identity_lease, invocation_ids: raw.invocation_ids ?? [],
  });
  const dispatchAssurance = dispatchReceipt?.identity_assurance ?? null;
  const automaticRoutingEligible = dispatchIdentity.disposition === "BOUND_FOR_DISPATCH"
    && isCreditAssurance(dispatchAssurance) && hasBoundLocalTarget(parsed.targetBindings.pre_dispatch);
  if (dispatchIdentity.disposition === "BOUND_FOR_DISPATCH" && dispatchAssurance === "requested_configuration" && raw.run.user_authorized_exploratory !== true) {
    throw new Error("requested-only identity requires explicit user_authorized_exploratory admission");
  }
  return withImmediateTransaction(database, () => {
    if (raw.invocation_ids !== undefined) {
      if (raw.invocation_ids.length === 0 || new Set(raw.invocation_ids).size !== raw.invocation_ids.length) throw new Error("evaluation run must bind distinct imported CLI invocation receipts");
      for (const invocationId of raw.invocation_ids) {
        const imported = database.database.query<{ invocation_id: string }>("SELECT invocation_id FROM local_mister_clean_invocations WHERE invocation_id = ?").get(invocationId);
        if (imported === null) throw new Error("evaluation run requires imported identity-unobserved CLI invocation receipts");
        if (database.database.query<{ invocation_id: string }>("SELECT invocation_id FROM evaluation_run_invocations WHERE invocation_id = ?").get(invocationId) !== null) throw new Error("CLI invocation receipt is already bound to an immutable evaluation trial source");
      }
    }
    const qualificationEvidence = readQualificationEvidence(database, parsed.profile.agent_tuple_id, parsed.capabilityId);
    const qualificationAtDispatch = deriveQualification(qualificationEvidence);
    const postClearanceRunOrdinal = qualificationAtDispatch === "Production_cleared"
      ? (database.database.query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM agent_run_events
         WHERE agent_tuple_id = ? AND capability_id = ? AND qualification_at_dispatch = 'Production_cleared'`,
      ).get(parsed.profile.agent_tuple_id, parsed.capabilityId)?.count ?? 0) + 1
      : null;
    const sampling = evaluationSamplingDecision({
      qualification: qualificationAtDispatch,
      verified_evaluations: qualificationEvidence.verified_trials,
      post_clearance_run_ordinal: postClearanceRunOrdinal,
      anomaly_reason: parsed.anomalyReason,
    });
    retainAll(database, parsed.retainedEvidence, raw.run.started_at);
    database.database.query(
      `INSERT INTO local_repository_identities(repository_id, canonical_git_common_directory, identity_evidence_sha256, first_observed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(repository_id) DO NOTHING`,
    ).run(parsed.repository.repository_id, parsed.repository.canonical_git_common_directory, parsed.repository.evidence.sha256, raw.run.started_at);
    const persistedRepository = database.database.query<{ canonical_git_common_directory: string; identity_evidence_sha256: string }>(
      "SELECT canonical_git_common_directory, identity_evidence_sha256 FROM local_repository_identities WHERE repository_id = ?",
    ).get(parsed.repository.repository_id);
    if (persistedRepository === null || persistedRepository.canonical_git_common_directory !== parsed.repository.canonical_git_common_directory) {
      throw new Error("local repository id is already bound to different identity provenance");
    }
    upsertCanonicalEvaluators(database, parsed.capabilityId);
    database.database.query(
      `INSERT INTO agent_execution_profiles(profile_id, revision, agent_tuple_id, profile_sha256, canonical_profile_json, captured_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(profile_id, revision) DO NOTHING`,
    ).run(parsed.profile.profile_id, parsed.profile.revision, parsed.profile.agent_tuple_id, parsed.profile.fingerprint_sha256, canonicalProfile(parsed.profile), parsed.profile.captured_at);
    const persistedProfile = database.database.query<{ profile_sha256: string; canonical_profile_json: string }>(
      "SELECT profile_sha256, canonical_profile_json FROM agent_execution_profiles WHERE profile_id = ? AND revision = ?",
    ).get(parsed.profile.profile_id, parsed.profile.revision);
    if (persistedProfile === null || persistedProfile.profile_sha256 !== parsed.profile.fingerprint_sha256 || persistedProfile.canonical_profile_json !== canonicalProfile(parsed.profile)) {
      throw new Error("profile id/revision is already bound to different canonical content");
    }
    insertObservation(database, raw.identity_lease, "pre_dispatch", parsed.retained, parsed.targetBindings.pre_dispatch);
    database.database.query(
      `INSERT INTO agent_identity_lease_events(event_id, identity_lease_id, requested_agent_tuple_id, execution_route_id, observation_id, event_kind, reason, occurred_at)
       VALUES (?, ?, ?, ?, NULL, 'issued', NULL, ?)`,
    ).run(`${raw.identity_lease.identity_lease_id}:issued`, raw.identity_lease.identity_lease_id, raw.identity_lease.requested_tuple.agent_tuple_id, raw.identity_lease.execution_route_id, raw.run.started_at);
    const dispatchObservation = raw.identity_lease.pre_dispatch;
    const eventKind = dispatchIdentity.disposition === "BOUND_FOR_DISPATCH" ? "pre_dispatch_bound" : "mismatch";
    if (dispatchObservation !== null) database.database.query(
      `INSERT INTO agent_identity_lease_events(event_id, identity_lease_id, requested_agent_tuple_id, execution_route_id, observation_id, event_kind, reason, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(`${raw.identity_lease.identity_lease_id}:${eventKind}`, raw.identity_lease.identity_lease_id, raw.identity_lease.requested_tuple.agent_tuple_id, raw.identity_lease.execution_route_id,
      dispatchObservation.observation_id, eventKind, dispatchIdentity.reasons.join("; ") || null, raw.run.started_at);
    for (const invalidation of raw.identity_lease.invalidations) database.database.query(
      `INSERT INTO agent_identity_lease_events(event_id, identity_lease_id, requested_agent_tuple_id, execution_route_id, observation_id, event_kind, reason, occurred_at)
       VALUES (?, ?, ?, ?, NULL, 'invalidated', ?, ?)`,
    ).run(`${raw.identity_lease.identity_lease_id}:invalidated:${invalidation.occurred_at}`, raw.identity_lease.identity_lease_id, raw.identity_lease.requested_tuple.agent_tuple_id, raw.identity_lease.execution_route_id, invalidation.reason, invalidation.occurred_at);
    database.database.query(
      `INSERT INTO agent_run_events(run_event_id, source_run_token, repository_cohort_token, agent_tuple_id, execution_route_id, identity_lease_id, capability_id, qualification_at_dispatch, post_clearance_run_ordinal, evaluation_required, evaluation_reason, operational_telemetry_json, occurred_at, repository_id, repository_identity_evidence_sha256, identity_receipt_trusted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(parsed.treatment.run_event_id, raw.run.source_run_token, raw.run.repository_cohort_token, parsed.profile.agent_tuple_id,
      raw.identity_lease.execution_route_id, raw.identity_lease.identity_lease_id, parsed.capabilityId,
      qualificationAtDispatch, postClearanceRunOrdinal, Number(sampling.evaluate), sampling.reason,
      canonicalJson({
        token: raw.run.token_telemetry,
        route: raw.run.route_telemetry,
        cost: raw.run.cost_telemetry,
        repository_cohort_provenance: "LEGACY_NON_QUALIFYING_LABEL",
        repository_id: parsed.repository.repository_id,
        user_authorized_exploratory: raw.run.user_authorized_exploratory === true,
      }), raw.run.started_at, parsed.repository.repository_id, parsed.repository.evidence.sha256, Number(dispatchReceipt !== null));
    if (raw.task_subject !== undefined) database.database.query(
      `INSERT INTO evaluation_dispatch_subjects(run_event_id, dispatch_scope_evidence_sha256, subject_repository_object_sha256, recorded_at)
       VALUES (?, ?, ?, ?)`,
    ).run(parsed.treatment.run_event_id, raw.task_subject.dispatch_scope_evidence_sha256, raw.task_subject.subject_repository_object_sha256, raw.run.started_at);
    database.database.query(
      `INSERT INTO execution_treatments(treatment_id, profile_id, profile_revision, run_event_id, repository_cohort_token, capability_id, treatment_sha256, canonical_treatment_json, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(parsed.treatment.treatment_id, parsed.treatment.profile_id, parsed.treatment.profile_revision, parsed.treatment.run_event_id,
      parsed.treatment.repository_cohort_token, parsed.capabilityId, sha256Bytes(canonicalJson(parsed.treatment)), canonicalJson(parsed.treatment), parsed.treatment.started_at, parsed.treatment.completed_at);
    for (const invocationId of raw.invocation_ids ?? []) database.database.query(
      "INSERT INTO evaluation_run_invocations(invocation_id, run_event_id, linked_at) VALUES (?, ?, ?)",
    ).run(invocationId, parsed.treatment.run_event_id, raw.run.started_at);
    if (dispatchReceipt !== null) database.database.query(
      "INSERT INTO evaluation_identity_receipt_verifications(run_event_id, phase, receipt_sha256, observer_actor_id, verified_at, identity_assurance) VALUES (?, 'pre_dispatch', ?, ?, ?, ?)",
    ).run(parsed.treatment.run_event_id, dispatchReceipt.receipt_sha256, dispatchReceipt.observer_actor_id, raw.run.started_at, dispatchReceipt.identity_assurance);
    return {
    run_event_id: parsed.treatment.run_event_id,
    repository_id: parsed.repository.repository_id,
    evaluation_required: sampling.evaluate,
    evaluation_reason: sampling.reason,
    qualification_at_dispatch: qualificationAtDispatch,
    post_clearance_run_ordinal: postClearanceRunOrdinal,
    identity_disposition: dispatchIdentity.disposition,
    identity_credit_possible: dispatchIdentity.contributes_quality_credit && isCreditAssurance(dispatchAssurance) && hasBoundLocalTarget(parsed.targetBindings.pre_dispatch),
    identity_assurance: dispatchAssurance,
    automatic_routing_eligible: automaticRoutingEligible,
    repository_provenance: "MACHINE_LOCAL_GIT_ROOT",
    logical_project_provenance: "UNRESOLVED",
    };
  });
}

export function recordMachineLocalEvaluationOutcome(database: OpenControlPlaneDatabase, raw: EvaluationOutcomeInput): RecordedEvaluationOutcome {
  if (database.kind !== "global") throw new Error("evaluation recorder requires the machine-local global database");
  requireText(raw.run_event_id, "run_event_id"); requireText(raw.worker_actor_id, "worker_actor_id"); requireText(raw.author_actor_id, "author_actor_id");
  if (raw.worker_actor_id === raw.author_actor_id) throw new Error("worker and author actors must be distinct");
  let retainedEvidence = raw.retained_evidence;
  let retained = evidenceSet(retainedEvidence);
  if (!retained.has(raw.completion_evidence_sha256)) throw new Error("completion evidence must be retained with the outcome");
  if (raw.evaluated_candidate !== undefined) {
    if (!retained.has(raw.evaluated_candidate.transition_scope_evidence_sha256)) throw new Error("evaluated candidate transition scope evidence must be retained");
    if (!/^[0-9a-f]{64}$/u.test(raw.evaluated_candidate.evaluated_repository_object_sha256)) throw new Error("evaluated candidate repository object must be canonical SHA-256");
  }
  const run = database.database.query<{ agent_tuple_id: string; execution_route_id: string; identity_lease_id: string; capability_id: string; repository_id: string | null; identity_receipt_trusted: number; evaluation_required: number; occurred_at: IsoTimestamp }>(
    "SELECT agent_tuple_id, execution_route_id, identity_lease_id, capability_id, repository_id, identity_receipt_trusted, evaluation_required, occurred_at FROM agent_run_events WHERE run_event_id = ?",
  ).get(raw.run_event_id);
  if (run === null || run.evaluation_required !== 1) throw new Error("outcome requires a previously recorded evaluation-required run");
  const repositoryEvidence = database.database.query<{ evidence_bytes: Uint8Array }>(
    "SELECT evidence_bytes FROM agent_evaluation_evidence WHERE evidence_sha256 = (SELECT repository_identity_evidence_sha256 FROM agent_run_events WHERE run_event_id = ?)",
  ).get(raw.run_event_id);
  if (repositoryEvidence === null) throw new Error("recorded run has no retained local checkout identity evidence");
  let checkout: { canonical_local_repository_root?: unknown; canonical_git_common_directory?: unknown };
  try { checkout = JSON.parse(Buffer.from(repositoryEvidence.evidence_bytes).toString("utf8")) as typeof checkout; } catch { throw new Error("recorded local checkout identity evidence is malformed"); }
  if (typeof checkout.canonical_local_repository_root !== "string" || typeof checkout.canonical_git_common_directory !== "string") {
    throw new Error("recorded local checkout identity evidence is incomplete");
  }
  const targetBindings = resolveLocalTargetBindings(raw.identity_lease, {
    canonical_local_repository_root: checkout.canonical_local_repository_root,
    canonical_git_common_directory: checkout.canonical_git_common_directory,
  });
  retainedEvidence = withLocalTargetEvidence(retainedEvidence, targetBindings);
  retained = evidenceSet(retainedEvidence);
  const invocationIds = database.database.query<{ invocation_id: string }>(
    "SELECT invocation_id FROM evaluation_run_invocations WHERE run_event_id = ? ORDER BY invocation_id",
  ).all(raw.run_event_id).map((row) => row.invocation_id);
  if (database.database.query<{ trial_id: string }>("SELECT trial_id FROM trials WHERE run_event_id = ?").get(raw.run_event_id) !== null) throw new Error("recorded run already has an evaluation outcome");
  if (raw.identity_lease.identity_lease_id !== run.identity_lease_id || raw.identity_lease.execution_route_id !== run.execution_route_id || raw.identity_lease.requested_tuple.agent_tuple_id !== run.agent_tuple_id) throw new Error("outcome identity lease does not bind the recorded run");
  const startedAt = timestampMilliseconds(run.occurred_at, "run occurred_at");
  const taskCompletedAt = timestampMilliseconds(raw.task_completed_at, "task_completed_at");
  const evaluatedAt = timestampMilliseconds(raw.evaluated_at, "evaluated_at");
  if (taskCompletedAt < startedAt || evaluatedAt < taskCompletedAt) throw new Error("outcome task/evaluation chronology does not follow the recorded run start");
  if (raw.identity_lease.pre_dispatch !== null && timestampMilliseconds(raw.identity_lease.pre_dispatch.observed_at, "pre-dispatch observed_at") > startedAt) {
    throw new Error("pre-dispatch identity observation must not follow run start");
  }
  if (raw.identity_lease.pre_evaluation !== null) {
    const observedAt = timestampMilliseconds(raw.identity_lease.pre_evaluation.observed_at, "pre-evaluation observed_at");
    if (observedAt < taskCompletedAt || observedAt > evaluatedAt) throw new Error("pre-evaluation identity observation must fall between task completion and evaluation");
  }
  const capabilityId = parseRepositoryCapabilityId(run.capability_id);
  const canonical = canonicalCapabilityEvaluators(capabilityId);
  if (raw.evaluations.length !== canonical.length || new Set(raw.evaluations.map((item) => item.evaluator_id)).size !== canonical.length) throw new Error("outcome must include each canonical evaluator exactly once");
  for (const evaluator of canonical) {
    const outcome = raw.evaluations.find((item) => item.evaluator_id === evaluator.evaluator_id);
    if (!outcome || outcome.case_id !== evaluator.case_id || !retained.has(outcome.evidence_sha256) || outcome.evaluator_actor_id.trim().length === 0
      || outcome.evaluator_actor_id === raw.worker_actor_id || outcome.evaluator_actor_id === raw.author_actor_id) {
      throw new Error("outcome evaluator case, evidence, or independent actor is missing");
    }
  }
  if (raw.evaluator_execution_receipts !== undefined) {
    if (raw.evaluator_execution_receipts.length !== canonical.length) throw new Error("evaluator execution receipt count does not match canonical evaluators");
    const receiptActors = new Set(raw.evaluator_execution_receipts.map((receipt) => receipt.evaluator_actor_id));
    const adapterIds = new Set(raw.evaluator_execution_receipts.map((receipt) => `${receipt.adapter_id}@${receipt.adapter_version}`));
    if (receiptActors.size !== 1 || adapterIds.size !== 1) throw new Error("evaluator execution receipts must bind one evaluator actor and adapter version");
    for (const receipt of raw.evaluator_execution_receipts) {
      const evaluator = canonical.find((item) => item.evaluator_id === receipt.evaluator_id);
      const outcome = raw.evaluations.find((item) => item.evaluator_id === receipt.evaluator_id);
      if (evaluator === undefined || outcome === undefined || receipt.case_id !== evaluator.case_id || receipt.evaluator_version !== evaluator.evaluator_version
        || receipt.result !== outcome.result || receipt.evidence_sha256 !== outcome.evidence_sha256 || receipt.evaluator_actor_id !== outcome.evaluator_actor_id) {
        throw new Error("evaluator execution receipt does not bind the admitted evaluator outcome");
      }
    }
  }
  const resultFor = (dimension: "verified_success" | "independent_evaluation" | "no_harm" | "authority"): boolean => {
    const evaluator = canonical.find((item) => item.evaluation_dimension === dimension)!;
    return raw.evaluations.find((item) => item.evaluator_id === evaluator.evaluator_id)!.result;
  };
  const verifiedSuccess = raw.verified_success && resultFor("verified_success");
  const independentEvaluation = resultFor("independent_evaluation");
  const noHarmViolation = !resultFor("no_harm");
  const authorityViolation = !resultFor("authority");
  const identity = evaluateAgentIdentityLease(raw.identity_lease, "evaluation");
  const observers = [raw.identity_lease.pre_dispatch?.observer_actor_id, raw.identity_lease.pre_evaluation?.observer_actor_id];
  const evaluatorActors = new Set(raw.evaluations.map((item) => item.evaluator_actor_id));
  if (evaluatorActors.size !== 1 || [...evaluatorActors].some((actor) => observers.includes(actor))) {
    throw new Error("canonical evaluators must use one actor independent from both identity observers");
  }
  // The approved policy applies independent/no-harm/authority gates at
  // Production_cleared, not at Recommended_supervised or Qualified. A fully
  // evidenced, identity-bound failed trial remains in the success-rate
  // denominator; the evaluator outcomes and unresolved violations are carried
  // forward to the production-clearance derivation.
  const evaluationReceipt = verifiedReceiptForBinding(raw.pre_evaluation_receipt_verification, { phase: "pre_evaluation", run_event_id: raw.run_event_id, identity_lease: raw.identity_lease, invocation_ids: invocationIds });
  const contributesQualityCredit = identity.disposition === "BOUND_FOR_EVALUATION" && run.repository_id !== null
    && run.identity_receipt_trusted === 1 && evaluationReceipt !== null && isCreditAssurance(evaluationReceipt.identity_assurance)
    && raw.evaluated_candidate !== undefined
    && hasBoundLocalTarget(targetBindings.pre_dispatch) && hasBoundLocalTarget(targetBindings.pre_evaluation);
  database.database.transaction(() => {
    retainAll(database, retainedEvidence, raw.evaluated_at);
    if (evaluationReceipt !== null) database.database.query(
      "INSERT INTO evaluation_identity_receipt_verifications(run_event_id, phase, receipt_sha256, observer_actor_id, verified_at, identity_assurance) VALUES (?, 'pre_evaluation', ?, ?, ?, ?)",
    ).run(raw.run_event_id, evaluationReceipt.receipt_sha256, evaluationReceipt.observer_actor_id, raw.evaluated_at, evaluationReceipt.identity_assurance);
    insertObservation(database, raw.identity_lease, "pre_evaluation", retained, targetBindings.pre_evaluation);
    if (raw.evaluated_candidate !== undefined) database.database.query(
      `INSERT INTO evaluation_evaluated_candidates(run_event_id, transition_scope_evidence_sha256, evaluated_repository_object_sha256, recorded_at)
       VALUES (?, ?, ?, ?)`,
    ).run(raw.run_event_id, raw.evaluated_candidate.transition_scope_evidence_sha256, raw.evaluated_candidate.evaluated_repository_object_sha256, raw.evaluated_at);
    const evaluationObservation = raw.identity_lease.pre_evaluation;
    if (evaluationObservation !== null) database.database.query(
      `INSERT INTO agent_identity_lease_events(event_id, identity_lease_id, requested_agent_tuple_id, execution_route_id, observation_id, event_kind, reason, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(`${raw.identity_lease.identity_lease_id}:outcome`, raw.identity_lease.identity_lease_id, raw.identity_lease.requested_tuple.agent_tuple_id,
      raw.identity_lease.execution_route_id, evaluationObservation.observation_id,
      identity.disposition === "BOUND_FOR_EVALUATION" ? "pre_evaluation_bound" : "mismatch", identity.reasons.join("; ") || null, raw.evaluated_at);
    database.database.query(
      `INSERT INTO trials(trial_id, run_event_id, agent_tuple_id, capability_id, repository_cohort_token, verified_success, independent_evaluation, no_harm_violation, authority_violation, identity_disposition, contributes_quality_credit, evaluation_json, evidence_sha256, completed_at, worker_actor_id, author_actor_id, repository_id)
       SELECT ?, run_event_id, agent_tuple_id, capability_id, repository_cohort_token, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, repository_id FROM agent_run_events WHERE run_event_id = ?`,
    ).run(`trial:${raw.run_event_id}`, Number(verifiedSuccess), Number(independentEvaluation), Number(noHarmViolation), Number(authorityViolation), identity.disposition, Number(contributesQualityCredit), canonicalJson({
      evaluator_cases: raw.evaluations.map((item) => ({ evaluator_id: item.evaluator_id, case_id: item.case_id })).sort((left, right) => left.evaluator_id.localeCompare(right.evaluator_id)),
      ...(raw.evaluator_execution_receipts === undefined ? {} : { evaluator_execution_receipts: raw.evaluator_execution_receipts }),
    }), raw.completion_evidence_sha256, raw.task_completed_at, raw.worker_actor_id, raw.author_actor_id, raw.run_event_id);
    for (const outcome of raw.evaluations) database.database.query(
      "INSERT INTO trial_evaluations(trial_id, evaluator_id, result, evidence_sha256, evaluator_actor_id) VALUES (?, ?, ?, ?, ?)",
    ).run(`trial:${raw.run_event_id}`, outcome.evaluator_id, Number(outcome.result), outcome.evidence_sha256, outcome.evaluator_actor_id);
    for (const outcome of raw.evaluations) {
      const evaluator = canonical.find((item) => item.evaluator_id === outcome.evaluator_id)!;
      if (outcome.result || (evaluator.evaluation_dimension !== "no_harm" && evaluator.evaluation_dimension !== "authority")) continue;
      database.database.query(
        `INSERT INTO qualification_events(event_id, agent_tuple_id, capability_id, event_kind, related_event_id, payload_json, occurred_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      ).run(`violation:${raw.run_event_id}:${evaluator.evaluation_dimension}`, run.agent_tuple_id, capabilityId,
        evaluator.evaluation_dimension === "no_harm" ? "no_harm_violation" : "authority_violation",
        canonicalJson({ run_event_id: raw.run_event_id, evaluator_id: evaluator.evaluator_id, evidence_sha256: outcome.evidence_sha256 }), raw.evaluated_at);
    }
  })();
  return {
    run_event_id: raw.run_event_id,
    identity_disposition: identity.disposition,
    contributes_quality_credit: contributesQualityCredit,
    qualification_after_outcome: deriveQualification(readQualificationEvidence(database, run.agent_tuple_id, capabilityId)),
  };
}
