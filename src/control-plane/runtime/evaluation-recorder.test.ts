import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalJson, sha256Bytes } from "./authority.js";
import { canonicalCapabilityEvaluators } from "../contracts/capability-evaluator-registry.js";
import { CAPABILITY_DEFINITIONS } from "../contracts/capability-taxonomy.js";
import { deriveQualification } from "../domain/qualification.js";
import { openControlPlaneDatabase } from "../persistence/sqlite.js";
import { readQualificationEvidence } from "./sqlite-store.js";
import { ConfiguredEvaluationIdentityReceiptAuthority } from "./evaluation-intake.js";
import * as receiptCustody from "./evaluation-identity-receipt.js";
import {
  recordMachineLocalEvaluationOutcome,
  recordMachineLocalEvaluationRunStart,
  registerMachineLocalLogicalProject,
  type RetainedEvaluationEvidence,
} from "./evaluation-recorder.js";

const now = "2026-09-08T12:00:00.000Z" as never;
const capability = "canonical_conformance_exact_format" as const;

function evidence(label: string): RetainedEvaluationEvidence {
  const bytes = Buffer.from(`evaluation-evidence:${label}`, "utf8");
  return { sha256: sha256Bytes(bytes), media_type: "application/json", bytes };
}

function field(value: unknown, status: "verified" | "reported" | "inferred" | "unavailable" = "reported", refs: readonly RetainedEvaluationEvidence[] = []) {
  return { value, provenance: { status, evidence: refs.map((item) => ({ path: `evidence/${item.sha256}.json`, sha256: item.sha256 })), note: null } };
}

function profile(profileEvidence: RetainedEvaluationEvidence): Record<string, unknown> {
  const metric = field(null, "unavailable");
  const value: Record<string, unknown> = {
    schema_version: "1.0", profile_id: "profile-1", revision: 1, captured_at: now, fingerprint_sha256: "0".repeat(64), agent_tuple_id: "tuple-1",
    harness: { id: field("harness-1"), version: field("1") },
    model: { id: field("model-1"), version: field("2026.09"), release_date: field(null, "unavailable"), family: field("family") },
    reasoning_level: field("high"), settings: [{ name: "temperature", value: field(0) }],
    inference: { deployment_mode: field("local_direct"), provider: field("local-provider"), gateway: field(null, "unavailable"), server: field(null, "unavailable"), server_version: field(null, "unavailable"), endpoint_ref: field(null, "unavailable"), secret_ref: field(null, "unavailable") },
    capability_environment: { tools: field([], "reported"), plugins: field([], "reported"), mcp_servers: field([], "reported"), skills: field([], "reported") },
    context: { starting_context_tokens: field(0), context_window_tokens: field(200000) },
    performance: { time_to_first_token_ms: metric, tokens_per_second: metric, input_tokens: metric, output_tokens: metric, cost_usd: metric, reliability: field(null, "unavailable") },
    a2a_agent_card_extension: { enabled: false, public_card_url: null, extension_uri: null },
    evidence: [{ path: "profile.json", sha256: profileEvidence.sha256 }],
  };
  const { fingerprint_sha256: _ignored, ...content } = value;
  value.fingerprint_sha256 = sha256Bytes(canonicalJson(content));
  return value;
}

function lease(
  dispatch: RetainedEvaluationEvidence,
  evaluation: RetainedEvaluationEvidence,
  sequence: number,
  mismatch = false,
  controlTarget: Record<string, unknown> | null = null,
): Record<string, unknown> {
  const tuple = { agent_tuple_id: "tuple-1", model_id: "model-1", harness_id: "harness-1", reasoning_level: "high" };
  const observation = (phase: "pre_dispatch" | "pre_evaluation", item: RetainedEvaluationEvidence) => ({
    observation_id: `ob-${phase}-${sequence}`, phase, requested_agent_tuple_id: "tuple-1", observed_model_id: mismatch ? "model-other" : "model-1", observed_harness_id: "harness-1", observed_reasoning_level: "high",
    execution_route_id: "route-1", control_surface_id: null, control_target: controlTarget ?? { kind: "headless", adapter_id: "fixture", request_or_session_id: "session-1", tool_target_root: null, command_cwd: null }, harness_session_token: "session-1", process_instance_token: "process-1", evidence_kind: "trusted_runtime_receipt",
    evidence: [{ path: `${phase}.json`, sha256: item.sha256 }], observer_actor_id: `${phase}-observer`, intended_surface_label: "untrusted label", worker_self_report: "untrusted self report",
    observed_at: phase === "pre_dispatch" ? "2026-09-08T12:00:00.000Z" : "2026-09-08T12:00:01.000Z",
  });
  return { identity_lease_id: `lease-${sequence}`, requested_tuple: tuple, execution_route_id: "route-1", pre_dispatch: observation("pre_dispatch", dispatch), pre_evaluation: observation("pre_evaluation", evaluation), invalidations: [] };
}

async function database() {
  const directory = await mkdtemp("/tmp/mc-evaluation-recorder-");
  const global = await openControlPlaneDatabase("global", join(directory, "global.sqlite"), now);
  const query = global.database.query.bind(global.database);
  query("INSERT INTO models(model_id, family, display_name, context_limit_tokens, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?)").run("model-1", "family", "Model", 200000, "{}", now);
  query("INSERT INTO models(model_id, family, display_name, context_limit_tokens, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?)").run("model-other", "family", "Other model", 200000, "{}", now);
  query("INSERT INTO harnesses(harness_id, display_name, version, supports_headless, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?)").run("harness-1", "Harness", "1", 1, "{}", now);
  query("INSERT INTO harnesses(harness_id, display_name, version, supports_headless, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?)").run("harness-other", "Other harness", "1", 1, "{}", now);
  query("INSERT INTO agent_tuples(agent_tuple_id, model_id, harness_id, reasoning_level, first_observed_at) VALUES (?, ?, ?, ?, ?)").run("tuple-1", "model-1", "harness-1", "high", now);
  query("INSERT INTO inference_sources(inference_source_id, display_name, source_kind, machine_identity, endpoint, secret_ref, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("source-1", "Local source", "local_machine", "machine-1", null, null, "{}", now);
  query("INSERT INTO deployments(deployment_id, model_id, inference_source_id, provider_model_id, context_limit_tokens, max_concurrency, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("deployment-1", "model-1", "source-1", "model-1", 200000, 1, "{}", now);
  query("INSERT INTO execution_routes(execution_route_id, agent_tuple_id, deployment_id, invocation_kind, invocation_adapter, headless_supported, secret_ref, route_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("route-1", "tuple-1", "deployment-1", "local", "test", 1, null, "{}", now);
  query("INSERT INTO capabilities(capability_id, family, label, description, taxonomy_version) VALUES (?, ?, ?, ?, ?)").run(capability, "remediation", "Canonical", "Exact output", "1.0");
  return { directory, global };
}

function runStartInput(localRepositoryRoot: string, sequence = 1, mismatch = false, controlTarget: Record<string, unknown> | null = null) {
  const profileEvidence = evidence("profile");
  const dispatchEvidence = evidence(`dispatch-${sequence}`);
  const evaluationEvidence = evidence(`evaluation-${sequence}`);
  const treatmentEvidence = evidence(`treatment-${sequence}`);
  const itemProfile = profile(profileEvidence);
  return {
    profile: itemProfile,
    treatment: {
      schema_version: "1.0", treatment_id: `treatment-${sequence}`, profile_id: "profile-1", profile_revision: 1, profile_fingerprint_sha256: itemProfile.fingerprint_sha256,
      run_event_id: `run-event-${sequence}`, repository_cohort_token: "legacy-cohort-1", capability_id: capability, started_at: now, completed_at: null,
      observed_identity_disposition: "IDENTITY_UNBOUND", observed_profile_sha256: itemProfile.fingerprint_sha256, telemetry_sha256: null,
      evidence: [{ path: "treatment.json", sha256: treatmentEvidence.sha256 }],
    },
    identity_lease: lease(dispatchEvidence, evaluationEvidence, sequence, mismatch, controlTarget),
    run: { source_run_token: `mc-run-${sequence}`, repository_cohort_token: "legacy-cohort-1", local_repository_root: localRepositoryRoot, capability_id: capability, started_at: now,
      token_telemetry: { input_tokens: 1, output_tokens: 1, cache_read_tokens: null, cache_write_tokens: null, reasoning_tokens: null, source: "local receipt", reliable: true },
      route_telemetry: { time_to_first_token_ms: null, tokens_per_second: null, wall_time_ms: 1, retry_count: 0, recoverable_pause_count: 0, route_succeeded: true, measurement_consistent: true },
      cost_telemetry: { currency: "USD", amount: null, price_source: "unknown", price_schedule_effective_at: null },
    },
    retained_evidence: [profileEvidence, dispatchEvidence, evaluationEvidence, treatmentEvidence],
  };
}

async function localGitCheckout(directory: string, name: string): Promise<string> {
  const root = join(directory, name);
  await mkdir(root, { recursive: true });
  execFileSync("git", ["init", "--quiet", root]);
  execFileSync("git", ["-C", root, "config", "user.email", ["evaluation", "example.test"].join("@")]);
  execFileSync("git", ["-C", root, "config", "user.name", "Evaluation Fixture"]);
  await writeFile(join(root, "README.md"), `${name}\n`, "utf8");
  execFileSync("git", ["-C", root, "add", "README.md"]);
  execFileSync("git", ["-C", root, "commit", "--quiet", "-m", "fixture"]);
  return root;
}

async function linkedGitWorktree(directory: string): Promise<{ readonly primary: string; readonly linked: string }> {
  const primary = await localGitCheckout(directory, "repository-primary");
  const linked = join(directory, "repository-linked-worktree");
  execFileSync("git", ["-C", primary, "worktree", "add", "--quiet", "-b", "linked-fixture", linked]);
  return { primary, linked };
}

function trustedStartInput(
  localRepositoryRoot: string,
  sequence: number,
  assurance: "requested_configuration" | "active_harness_selection" | "provider_execution_attested" = "active_harness_selection",
  controlTarget: Record<string, unknown> | null | undefined = undefined,
) {
  const start = runStartInput(localRepositoryRoot, sequence, false, controlTarget === undefined ? {
    kind: "headless", adapter_id: "fixture", request_or_session_id: `session-target-${sequence}`,
    tool_target_root: localRepositoryRoot, command_cwd: localRepositoryRoot,
  } : controlTarget);
  const invocationIds = [`mc-invocation:fixture-${sequence}`];
  const verified = (["pre_dispatch", "pre_evaluation"] as const).map((phase) => {
    const observation = (start.identity_lease as any)[phase]!;
    const { evidence: _selfReferentialReceiptEvidence, ...attestedObservation } = observation;
    const bytes = Buffer.from(canonicalJson({
      schema_version: "1.0",
      record_type: "mister-clean.evaluation-identity-receipt",
      binding: {
        phase,
        run_event_id: `run-event-${sequence}`,
        identity_lease: {
          identity_lease_id: start.identity_lease.identity_lease_id,
          requested_tuple: (start.identity_lease as any).requested_tuple,
          execution_route_id: start.identity_lease.execution_route_id,
          observation: attestedObservation,
        },
        invocation_ids: [],
      },
    }), "utf8");
    const receipt = { sha256: sha256Bytes(bytes), media_type: "application/json", bytes };
    observation.evidence = [{ path: `${phase}-receipt.json`, sha256: receipt.sha256 }];
    start.retained_evidence.push(receipt);
    const authority = new ConfiguredEvaluationIdentityReceiptAuthority([{ receipt_sha256: receipt.sha256, observer_actor_id: observation.observer_actor_id, identity_assurance: assurance }]);
    const token = authority.authorize({ phase, run_event_id: `run-event-${sequence}`, identity_lease: start.identity_lease as never, invocation_ids: [], retained_evidence: [receipt] });
    if (token === null) throw new Error("fixture authority did not mint a verified receipt");
    return token;
  });
  const dispatchScope = evidence(`dispatch-scope-${sequence}`);
  const transitionScope = evidence(`transition-scope-${sequence}`);
  start.retained_evidence.push(dispatchScope, transitionScope);
  return {
    ...start,
    task_subject: { dispatch_scope_evidence_sha256: dispatchScope.sha256, subject_repository_object_sha256: "a".repeat(64) },
    evaluated_candidate: { transition_scope_evidence_sha256: transitionScope.sha256, evaluated_repository_object_sha256: "b".repeat(64) },
    pre_dispatch_receipt_verification: verified[0], pre_evaluation_receipt_verification: verified[1],
  };
}

function recordCreditableTrial(global: Awaited<ReturnType<typeof database>>["global"], localRepositoryRoot: string, sequence: number) {
  const start = trustedStartInput(localRepositoryRoot, sequence);
  const recorded = recordMachineLocalEvaluationRunStart(global, start as never);
  const outcome = recordOutcome(global, start, sequence, "independent-evaluator", () => true, true, start.identity_lease, start.pre_evaluation_receipt_verification);
  return { recorded, outcome };
}

function recordOutcome(
  global: Awaited<ReturnType<typeof database>>["global"],
  start: ReturnType<typeof runStartInput>,
  sequence: number,
  evaluatorActor = "independent-evaluator",
  resultFor: (dimension: string) => boolean = () => true,
  verifiedSuccess = true,
  identityLease: unknown = start.identity_lease,
  preEvaluationReceiptVerification: unknown = undefined,
) {
  const completion = evidence(`completion-${sequence}`);
  const evaluatorEvidence = canonicalCapabilityEvaluators(capability).map((item) => ({ item, evidence: evidence(`${item.evaluator_id}-${sequence}`) }));
  const evaluatedCandidate = (start as unknown as { evaluated_candidate?: { transition_scope_evidence_sha256: string; evaluated_repository_object_sha256: string } }).evaluated_candidate;
  return recordMachineLocalEvaluationOutcome(global, {
    run_event_id: `run-event-${sequence}`, identity_lease: identityLease as never, worker_actor_id: "worker", author_actor_id: "author", verified_success: verifiedSuccess,
    task_completed_at: "2026-09-08T12:00:01.000Z" as never, evaluated_at: "2026-09-08T12:00:02.000Z" as never, completion_evidence_sha256: completion.sha256,
    evaluations: evaluatorEvidence.map(({ item, evidence: itemEvidence }) => ({ evaluator_id: item.evaluator_id, case_id: item.case_id, result: resultFor(item.evaluation_dimension), evaluator_actor_id: evaluatorActor, evidence_sha256: itemEvidence.sha256 })),
    ...(evaluatedCandidate === undefined ? {} : { evaluated_candidate: evaluatedCandidate as never }),
    ...(preEvaluationReceiptVerification === undefined ? {} : { pre_evaluation_receipt_verification: preEvaluationReceiptVerification as never }),
    retained_evidence: [completion, ...evaluatorEvidence.map(({ evidence: itemEvidence }) => itemEvidence), ...start.retained_evidence],
  });
}

// This correctness group repeatedly creates real temporary Git checkouts and SQLite
// evidence rows; its timeout is not a performance or latency acceptance criterion.
describe("machine-local evaluation intake", () => {
  it("records the run start when observed identity is invalid, then records a non-creditable outcome", async () => {
    const { directory, global } = await database();
    try {
      const start = runStartInput(await localGitCheckout(directory, "repository-a"), 1, true);
      const result = recordMachineLocalEvaluationRunStart(global, start as never);
      expect(result).toMatchObject({ evaluation_required: true, identity_disposition: "MISMATCH", identity_credit_possible: false, repository_provenance: "MACHINE_LOCAL_GIT_ROOT" });
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM agent_run_events").get()?.count).toBe(1);
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM capability_evaluators").get()?.count).toBe(4);

      const completion = evidence("completion");
      const evaluatorEvidence = canonicalCapabilityEvaluators(capability).map((item) => ({ item, evidence: evidence(item.evaluator_id) }));
      const outcome = recordMachineLocalEvaluationOutcome(global, {
        run_event_id: "run-event-1", identity_lease: start.identity_lease as never, worker_actor_id: "worker", author_actor_id: "author", verified_success: true,
        task_completed_at: "2026-09-08T12:00:01.000Z" as never, evaluated_at: "2026-09-08T12:00:02.000Z" as never, completion_evidence_sha256: completion.sha256,
        evaluations: evaluatorEvidence.map(({ item, evidence: itemEvidence }) => ({ evaluator_id: item.evaluator_id, case_id: item.case_id, result: true, evaluator_actor_id: "evaluator", evidence_sha256: itemEvidence.sha256 })),
        retained_evidence: [completion, ...evaluatorEvidence.map(({ evidence: itemEvidence }) => itemEvidence), ...start.retained_evidence],
      });
      expect(outcome).toMatchObject({ identity_disposition: "MISMATCH", contributes_quality_credit: false, qualification_after_outcome: "UNTESTED" });
      expect(global.database.query<{ verified_success: number; independent_evaluation: number; no_harm_violation: number; authority_violation: number; contributes_quality_credit: number }>(
        "SELECT verified_success, independent_evaluation, no_harm_violation, authority_violation, contributes_quality_credit FROM trials WHERE run_event_id = ?",
      ).get("run-event-1")).toEqual({ verified_success: 1, independent_evaluation: 1, no_harm_violation: 0, authority_violation: 0, contributes_quality_credit: 0 });
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("rejects malformed starts atomically and keeps a pending required evaluation after a malformed outcome", async () => {
    const { directory, global } = await database();
    try {
      const repository = await localGitCheckout(directory, "repository-a");
      const malformed = runStartInput(repository, 1);
      (malformed.profile as Record<string, unknown>).fingerprint_sha256 = "0".repeat(64);
      expect(() => recordMachineLocalEvaluationRunStart(global, malformed as never)).toThrow(/fingerprint/);
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM agent_run_events").get()?.count).toBe(0);
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM agent_execution_profiles").get()?.count).toBe(0);

      const valid = runStartInput(repository, 1);
      recordMachineLocalEvaluationRunStart(global, valid as never);
      const completion = evidence("completion-pending");
      expect(() => recordMachineLocalEvaluationOutcome(global, {
        run_event_id: "run-event-1", identity_lease: valid.identity_lease as never, worker_actor_id: "worker", author_actor_id: "author", verified_success: true,
        task_completed_at: "2026-09-08T12:00:01.000Z" as never, evaluated_at: "2026-09-08T12:00:02.000Z" as never, completion_evidence_sha256: completion.sha256, evaluations: [], retained_evidence: [completion],
      })).toThrow(/canonical evaluator/);
      expect(global.database.query<{ evaluation_required: number }>("SELECT evaluation_required FROM agent_run_events WHERE run_event_id = ?").get("run-event-1")?.evaluation_required).toBe(1);
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM trials").get()?.count).toBe(0);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("rejects an arbitrary cohort label when no actual local Git checkout is supplied", async () => {
    const { directory, global } = await database();
    try {
      expect(() => recordMachineLocalEvaluationRunStart(global, runStartInput(directory, 1) as never)).toThrow(/local Git checkout/);
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM agent_run_events").get()?.count).toBe(0);
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM local_repository_identities").get()?.count).toBe(0);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("does not inherit Git context that would turn a non-checkout into another repository", async () => {
    const { directory, global } = await database();
    const priorGitDir = process.env.GIT_DIR;
    const priorGitWorkTree = process.env.GIT_WORK_TREE;
    try {
      const repository = await localGitCheckout(directory, "repository-a");
      const nonCheckout = join(directory, "not-a-checkout");
      await mkdir(nonCheckout);
      process.env.GIT_DIR = join(repository, ".git");
      process.env.GIT_WORK_TREE = repository;
      expect(() => recordMachineLocalEvaluationRunStart(global, runStartInput(nonCheckout, 1) as never)).toThrow(/local Git checkout/);
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM agent_run_events").get()?.count).toBe(0);
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM local_repository_identities").get()?.count).toBe(0);
    } finally {
      if (priorGitDir === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = priorGitDir;
      if (priorGitWorkTree === undefined) delete process.env.GIT_WORK_TREE; else process.env.GIT_WORK_TREE = priorGitWorkTree;
      global.close(); await rm(directory, { recursive: true, force: true });
    }
  });

  it("credits a valid independently evidenced trial and binds four evaluators to one capability-specific case", async () => {
    const { directory, global } = await database();
    try {
      const { recorded, outcome } = recordCreditableTrial(global, await localGitCheckout(directory, "repository-a"), 1);
      expect(recorded).toMatchObject({ evaluation_required: true, evaluation_reason: "pre_clearance_every_run", qualification_at_dispatch: "UNTESTED", repository_provenance: "MACHINE_LOCAL_GIT_ROOT" });
      expect(outcome).toMatchObject({ identity_disposition: "BOUND_FOR_EVALUATION", contributes_quality_credit: true, qualification_after_outcome: "EVALUATING" });
      expect(global.database.query<{ repository_id: string; contributes_quality_credit: number }>(
        "SELECT repository_id, contributes_quality_credit FROM trials WHERE run_event_id = ?",
      ).get("run-event-1")).toMatchObject({ repository_id: recorded.repository_id, contributes_quality_credit: 1 });
      const evaluators = canonicalCapabilityEvaluators(capability);
      expect(evaluators).toHaveLength(4);
      expect(new Set(evaluators.map((evaluator) => evaluator.case_id))).toEqual(new Set(["mister-clean.case.canonical_conformance_exact_format.1.0"]));
      expect(CAPABILITY_DEFINITIONS.every((definition) => {
        const cases = canonicalCapabilityEvaluators(definition.id);
        return cases.length === 4 && cases.every((evaluator) => evaluator.case_id === `mister-clean.case.${definition.id}.1.0`);
      })).toBe(true);
      expect(canonicalCapabilityEvaluators("root_cause_analysis").every((evaluator) => evaluator.question.includes("causal completeness"))).toBe(true);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("credits an active receipt only when its absolute git -C target is the authorized checkout", async () => {
    const { directory, global } = await database();
    try {
      const repository = await localGitCheckout(directory, "repository-authorized-target");
      const targetRoot = execFileSync("git", ["-C", repository, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
      const target = {
        kind: "headless" as const,
        adapter_id: "fixture",
        request_or_session_id: "session-target",
        tool_target_root: targetRoot,
        command_cwd: targetRoot,
      };
      const start = trustedStartInput(repository, 1, "active_harness_selection", target);
      const recorded = recordMachineLocalEvaluationRunStart(global, start as never);
      const outcome = recordOutcome(global, start, 1, "independent-evaluator", () => true, true, start.identity_lease, start.pre_evaluation_receipt_verification);
      expect(outcome.contributes_quality_credit).toBe(true);
      expect(global.database.query<{ local_target_binding: string; canonical_git_top_level: string; target_git_evidence_sha256: string }>(
        "SELECT local_target_binding, canonical_git_top_level, target_git_evidence_sha256 FROM agent_identity_observation_targets WHERE observation_id = ?",
      ).get("ob-pre_dispatch-1")).toEqual({
        local_target_binding: "bound_authorized_checkout",
        canonical_git_top_level: targetRoot,
        target_git_evidence_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(recorded.repository_id).toMatch(/^local-repository:/);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("uses an explicit authorized git -C target even when the observed command cwd is outside the checkout", async () => {
    const { directory, global } = await database();
    try {
      const repository = await localGitCheckout(directory, "repository-explicit-target");
      const outside = join(directory, "launcher-cwd");
      await mkdir(outside);
      const targetRoot = execFileSync("git", ["-C", repository, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
      const start = trustedStartInput(repository, 1, "active_harness_selection", {
        kind: "headless", adapter_id: "fixture", request_or_session_id: "session-explicit-target",
        tool_target_root: targetRoot, command_cwd: outside,
      });
      expect(recordMachineLocalEvaluationRunStart(global, start as never).automatic_routing_eligible).toBe(true);
      expect(recordOutcome(global, start, 1, "independent-evaluator", () => true, true, start.identity_lease, start.pre_evaluation_receipt_verification).contributes_quality_credit).toBe(true);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("uses an authorized git command cwd only as a fallback when no explicit target exists", async () => {
    const { directory, global } = await database();
    try {
      const repository = await localGitCheckout(directory, "repository-cwd-fallback");
      const start = trustedStartInput(repository, 1, "active_harness_selection", {
        kind: "headless", adapter_id: "fixture", request_or_session_id: "session-cwd-fallback",
        tool_target_root: null, command_cwd: repository,
      });
      expect(recordMachineLocalEvaluationRunStart(global, start as never).automatic_routing_eligible).toBe(true);
      expect(recordOutcome(global, start, 1, "independent-evaluator", () => true, true, start.identity_lease, start.pre_evaluation_receipt_verification).contributes_quality_credit).toBe(true);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("credits a Desktop receipt only with an authority-bound effective target", async () => {
    const { directory, global } = await database();
    try {
      const repository = await localGitCheckout(directory, "repository-desktop-target");
      const start = trustedStartInput(repository, 1, "active_harness_selection", {
        kind: "desktop", application_id: "codex", thread_id: "thread-1", turn_id: "turn-1", session_id: "session-1", settings_record_sha256: "a".repeat(64),
        tool_target_root: repository, command_cwd: repository,
      });
      expect(recordMachineLocalEvaluationRunStart(global, start as never).automatic_routing_eligible).toBe(true);
      expect(recordOutcome(global, start, 1, "independent-evaluator", () => true, true, start.identity_lease, start.pre_evaluation_receipt_verification).contributes_quality_credit).toBe(true);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it.each([
    ["headless", { kind: "headless", adapter_id: "fixture", request_or_session_id: "session-null-headless", tool_target_root: null, command_cwd: null }],
    ["cmux", { kind: "cmux", host_socket_namespace: "cmux://fixture/socket", workspace_id: "workspace-1", window_id: "window-1", surface_id: "surface-1", tool_target_root: null, command_cwd: null }],
    ["desktop", { kind: "desktop", application_id: "codex", thread_id: "thread-1", turn_id: "turn-1", session_id: "session-1", settings_record_sha256: "a".repeat(64), tool_target_root: null, command_cwd: null }],
  ])("records but does not credit a %s receipt with no effective local target", async (_route, controlTarget) => {
    const { directory, global } = await database();
    try {
      const repository = await localGitCheckout(directory, `repository-null-${_route}`);
      const start = trustedStartInput(repository, 1, "active_harness_selection", controlTarget);
      const recorded = recordMachineLocalEvaluationRunStart(global, start as never);
      expect(recorded.automatic_routing_eligible).toBe(false);
      expect(recordOutcome(global, start, 1, "independent-evaluator", () => true, true, start.identity_lease, start.pre_evaluation_receipt_verification).contributes_quality_credit).toBe(false);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("rejects a same-phase target that resolves to a different checkout even with active receipt custody", async () => {
    const { directory, global } = await database();
    try {
      const authorized = await localGitCheckout(directory, "repository-authorized");
      const other = await localGitCheckout(directory, "repository-other-checkout");
      const otherRoot = execFileSync("git", ["-C", other, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
      const authorizedRoot = execFileSync("git", ["-C", authorized, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
      const start = trustedStartInput(authorized, 1, "active_harness_selection", {
        kind: "headless", adapter_id: "fixture", request_or_session_id: "session-target-other",
        tool_target_root: otherRoot, command_cwd: authorizedRoot,
      });
      expect(() => recordMachineLocalEvaluationRunStart(global, start as never)).toThrow(/authorized local Git checkout/);
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM agent_run_events").get()?.count).toBe(0);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("rejects command-cwd fallback outside the authorized checkout when no explicit target exists", async () => {
    const { directory, global } = await database();
    try {
      const repository = await localGitCheckout(directory, "repository-fallback-authorized");
      const outside = await localGitCheckout(directory, "repository-fallback-other");
      const start = trustedStartInput(repository, 1, "active_harness_selection", {
        kind: "headless", adapter_id: "fixture", request_or_session_id: "session-fallback-other",
        tool_target_root: null, command_cwd: outside,
      });
      expect(() => recordMachineLocalEvaluationRunStart(global, start as never)).toThrow(/authorized local Git checkout/);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("rejects a linked-worktree target when the authorized checkout is its sibling", async () => {
    const { directory, global } = await database();
    try {
      const worktrees = await linkedGitWorktree(directory);
      const linkedRoot = execFileSync("git", ["-C", worktrees.linked, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
      const start = trustedStartInput(worktrees.primary, 1, "active_harness_selection", {
        kind: "cmux", host_socket_namespace: "cmux://fixture/socket", workspace_id: "workspace-1", window_id: "window-1", surface_id: "surface-1",
        tool_target_root: linkedRoot, command_cwd: linkedRoot,
      });
      expect(() => recordMachineLocalEvaluationRunStart(global, start as never)).toThrow(/authorized local Git checkout/);
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM agent_run_events").get()?.count).toBe(0);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("retains requested-only exploratory identity but never promotes it to automatic routing or quality credit", async () => {
    const { directory, global } = await database();
    try {
      const start = trustedStartInput(await localGitCheckout(directory, "repository-requested"), 1, "requested_configuration");
      (start.run as { user_authorized_exploratory?: boolean }).user_authorized_exploratory = true;
      const recorded = recordMachineLocalEvaluationRunStart(global, start as never);
      expect(recorded).toMatchObject({ identity_assurance: "requested_configuration", automatic_routing_eligible: false, identity_credit_possible: false });
      const outcome = recordOutcome(global, start, 1, "independent-evaluator", () => true, true, start.identity_lease, start.pre_evaluation_receipt_verification);
      expect(outcome.contributes_quality_credit).toBe(false);
      expect(global.database.query<{ identity_assurance: string }>("SELECT identity_assurance FROM evaluation_identity_receipt_verifications WHERE run_event_id = ? AND phase = 'pre_dispatch'").get("run-event-1")?.identity_assurance).toBe("requested_configuration");
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("does not let a requested-only receipt silently become a normal dispatch", async () => {
    const { directory, global } = await database();
    try {
      const start = trustedStartInput(await localGitCheckout(directory, "repository-requested-denied"), 1, "requested_configuration");
      expect(() => recordMachineLocalEvaluationRunStart(global, start as never)).toThrow(/explicit user_authorized_exploratory/);
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM agent_run_events").get()?.count).toBe(0);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("requires retained dispatch scope and evaluated candidate custody before an otherwise active receipt can earn credit", async () => {
    const { directory, global } = await database();
    try {
      const start = trustedStartInput(await localGitCheckout(directory, "repository-missing-candidate"), 1);
      delete (start as { evaluated_candidate?: unknown }).evaluated_candidate;
      recordMachineLocalEvaluationRunStart(global, start as never);
      const outcome = recordOutcome(global, start, 1, "independent-evaluator", () => true, true, start.identity_lease, start.pre_evaluation_receipt_verification);
      expect(outcome.contributes_quality_credit).toBe(false);
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM evaluation_evaluated_candidates").get()?.count).toBe(0);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("does not accept a structurally forged receipt object at the direct recorder export", async () => {
    const { directory, global } = await database();
    try {
      const start = runStartInput(await localGitCheckout(directory, "repository-forged"), 1) as any;
      start.pre_dispatch_receipt_verification = { receipt_sha256: "f".repeat(64), observer_actor_id: "forged" };
      recordMachineLocalEvaluationRunStart(global, start);
      const outcome = recordOutcome(global, start, 1, "independent-evaluator", () => true, true, start.identity_lease, { receipt_sha256: "e".repeat(64), observer_actor_id: "forged" });
      expect(outcome.contributes_quality_credit).toBe(false);
      expect(global.database.query<{ contributes_quality_credit: number }>("SELECT contributes_quality_credit FROM trials WHERE run_event_id = ?").get("run-event-1")?.contributes_quality_credit).toBe(0);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("keeps custody mint private and rejects a valid token reused for another phase or run", async () => {
    const { directory, global } = await database();
    try {
      expect(Object.hasOwn(receiptCustody, "mintRuntimeVerifiedEvaluationIdentityReceipt")).toBe(false);
      const first = trustedStartInput(await localGitCheckout(directory, "repository-token-a"), 1);
      recordMachineLocalEvaluationRunStart(global, first as never);
      const wrongPhase = recordOutcome(global, first, 1, "independent-evaluator", () => true, true, first.identity_lease, first.pre_dispatch_receipt_verification);
      expect(wrongPhase.contributes_quality_credit).toBe(false);
      const second = trustedStartInput(await localGitCheckout(directory, "repository-token-b"), 2);
      recordMachineLocalEvaluationRunStart(global, second as never);
      const wrongRun = recordOutcome(global, second, 2, "independent-evaluator", () => true, true, second.identity_lease, first.pre_evaluation_receipt_verification);
      expect(wrongRun.contributes_quality_credit).toBe(false);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it.each([
    ["model", (observation: any) => { observation.observed_model_id = "model-other"; }],
    ["harness", (observation: any) => { observation.observed_harness_id = "harness-other"; }],
    ["reasoning", (observation: any) => { observation.observed_reasoning_level = "low"; }],
    ["session", (observation: any, phase: "pre_dispatch" | "pre_evaluation") => { observation.harness_session_token = `session-other-${phase}`; }],
    ["process", (observation: any, phase: "pre_dispatch" | "pre_evaluation") => { observation.process_instance_token = `process-other-${phase}`; }],
    ["time", (observation: any, phase: "pre_dispatch" | "pre_evaluation") => { observation.observed_at = phase === "pre_dispatch" ? "2026-09-08T11:59:59.000Z" : "2026-09-08T12:00:01.500Z"; }],
    ["evidence reference", (observation: any) => { observation.evidence = [{ ...observation.evidence[0], path: "mutated-receipt-reference.json" }]; }],
  ] as const)("does not reuse a custody token after %s observation mutation", async (_field, mutate) => {
    const { directory, global } = await database();
    try {
      const dispatch = trustedStartInput(await localGitCheckout(directory, "repository-mutation-dispatch"), 1);
      mutate((dispatch.identity_lease as any).pre_dispatch, "pre_dispatch");
      recordMachineLocalEvaluationRunStart(global, dispatch as never);
      expect(global.database.query<{ identity_receipt_trusted: number }>(
        "SELECT identity_receipt_trusted FROM agent_run_events WHERE run_event_id = ?",
      ).get("run-event-1")?.identity_receipt_trusted).toBe(0);

      const evaluation = trustedStartInput(await localGitCheckout(directory, "repository-mutation-evaluation"), 2);
      recordMachineLocalEvaluationRunStart(global, evaluation as never);
      mutate((evaluation.identity_lease as any).pre_evaluation, "pre_evaluation");
      const outcome = recordOutcome(global, evaluation, 2, "independent-evaluator", () => true, true, evaluation.identity_lease, evaluation.pre_evaluation_receipt_verification);
      expect(outcome.contributes_quality_credit).toBe(false);
      expect(global.database.query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM evaluation_identity_receipt_verifications WHERE run_event_id = ? AND phase = 'pre_evaluation'",
      ).get("run-event-2")?.count).toBe(0);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it.each([
    ["requested tuple model", (binding: any) => { binding.identity_lease.requested_tuple.model_id = "model-other"; }],
    ["requested tuple harness", (binding: any) => { binding.identity_lease.requested_tuple.harness_id = "harness-other"; }],
    ["requested tuple reasoning", (binding: any) => { binding.identity_lease.requested_tuple.reasoning_level = "low"; }],
    ["identity lease", (binding: any) => { binding.identity_lease.identity_lease_id = "lease-other"; }],
    ["execution route", (binding: any) => { binding.identity_lease.execution_route_id = "route-other"; }],
    ["invocation set", (binding: any) => { binding.invocation_ids = ["mc-invocation:other"]; }],
  ] as const)("binds the custody token to the exact %s", async (_field, mutate) => {
    const { directory, global } = await database();
    try {
      const start = trustedStartInput(await localGitCheckout(directory, "repository-binding"), 1);
      const binding: any = {
        phase: "pre_dispatch",
        run_event_id: "run-event-1",
        identity_lease: start.identity_lease,
        invocation_ids: [],
      };
      expect(receiptCustody.verifiedReceiptForBinding(start.pre_dispatch_receipt_verification, binding)).not.toBeNull();
      mutate(binding);
      expect(receiptCustody.verifiedReceiptForBinding(start.pre_dispatch_receipt_verification, binding)).toBeNull();
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("rejects evaluator self/identity-observer attribution without consuming the required evaluation", async () => {
    const { directory, global } = await database();
    try {
      const start = runStartInput(await localGitCheckout(directory, "repository-a"), 1);
      recordMachineLocalEvaluationRunStart(global, start as never);
      expect(() => recordOutcome(global, start, 1, "pre_evaluation-observer")).toThrow(/independent from both identity observers/);
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM trials").get()?.count).toBe(0);
      expect(global.database.query<{ evaluation_required: number }>("SELECT evaluation_required FROM agent_run_events WHERE run_event_id = ?").get("run-event-1")?.evaluation_required).toBe(1);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("rejects an identity observation outside the task-completion-to-evaluation interval", async () => {
    const { directory, global } = await database();
    try {
      const start = runStartInput(await localGitCheckout(directory, "repository-a"), 1);
      recordMachineLocalEvaluationRunStart(global, start as never);
      const staleLease = structuredClone(start.identity_lease) as { pre_evaluation: { observed_at: string } };
      staleLease.pre_evaluation.observed_at = "2026-09-08T12:00:00.000Z";
      expect(() => recordOutcome(global, start, 1, "independent-evaluator", () => true, true, staleLease)).toThrow(/must fall between task completion and evaluation/);
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM trials").get()?.count).toBe(0);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("records physical checkout provenance without treating worktrees or clones as logical-project diversity", async () => {
    const { directory, global } = await database();
    try {
      const worktrees = await linkedGitWorktree(directory);
      recordCreditableTrial(global, worktrees.primary, 1);
      recordCreditableTrial(global, worktrees.linked, 2);
      for (let sequence = 3; sequence <= 25; sequence += 1) recordCreditableTrial(global, worktrees.primary, sequence);
      expect(global.database.query<{ repository_count: number }>("SELECT COUNT(DISTINCT repository_id) AS repository_count FROM trials WHERE contributes_quality_credit = 1").get()?.repository_count).toBe(1);
      const repositoryB = await localGitCheckout(directory, "repository-b");
      const result = recordCreditableTrial(global, repositoryB, 26);
      expect(result.recorded).toMatchObject({ logical_project_provenance: "UNRESOLVED" });
      expect(result.outcome.qualification_after_outcome).toBe("Recommended_supervised");
      expect(readQualificationEvidence(global, "tuple-1", capability).repository_cohort_count).toBe(0);
      expect(global.database.query<{ cohort_count: number }>("SELECT COUNT(DISTINCT repository_cohort_token) AS cohort_count FROM trials WHERE contributes_quality_credit = 1").get()?.cohort_count).toBe(1);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("keeps every run evaluated while logical-project provenance is unresolved", async () => {
    const { directory, global } = await database();
    try {
      const repositories = await Promise.all(["repository-a", "repository-b", "repository-c"].map((name) => localGitCheckout(directory, name)));
      for (let sequence = 1; sequence <= 50; sequence += 1) {
        const result = recordCreditableTrial(global, repositories[(sequence - 1) % repositories.length]!, sequence);
        expect(result.recorded.evaluation_required).toBe(true);
      }
      expect(global.database.query<{ qualification: string }>("SELECT qualification_at_dispatch AS qualification FROM agent_run_events WHERE run_event_id = ?").get("run-event-50")?.qualification).not.toBe("Production_cleared");
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM trials WHERE contributes_quality_credit = 1").get()?.count).toBe(50);
      expect(deriveQualification(readQualificationEvidence(global, "tuple-1", capability))).toBe("Recommended_supervised");
      for (let sequence = 51; sequence <= 69; sequence += 1) {
        const start = recordMachineLocalEvaluationRunStart(global, runStartInput(repositories[0]!, sequence) as never);
        expect(start).toMatchObject({ evaluation_required: true, evaluation_reason: "pre_clearance_every_run", qualification_at_dispatch: "Recommended_supervised", post_clearance_run_ordinal: null });
      }
      const twentieth = recordMachineLocalEvaluationRunStart(global, runStartInput(repositories[0]!, 70) as never);
      expect(twentieth).toMatchObject({ evaluation_required: true, evaluation_reason: "pre_clearance_every_run", qualification_at_dispatch: "Recommended_supervised", post_clearance_run_ordinal: null });
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("forces a closed anomaly off cadence after production clearance without relabeling routine cadence", async () => {
    const { directory, global } = await database();
    try {
      const repositories = await Promise.all(["repository-a", "repository-b", "repository-c"].map((name) => localGitCheckout(directory, name)));
      for (let sequence = 1; sequence <= 50; sequence += 1) recordCreditableTrial(global, repositories[(sequence - 1) % repositories.length]!, sequence);
      for (let index = 0; index < repositories.length; index += 1) {
        const identity = recordMachineLocalEvaluationRunStart(global, runStartInput(repositories[index]!, 100 + index) as never);
        const receipt = evidence(`project-receipt-${index}`), alias = evidence(`project-alias-${index}`);
        registerMachineLocalLogicalProject(global, {
          logical_project_id: `logical-project-${index}`, operator_actor_id: "trusted-operator", registration_evidence_sha256: receipt.sha256,
          aliases: [{ repository_id: identity.repository_id, attestation_evidence_sha256: alias.sha256 }], registered_at: now,
          retained_evidence: [receipt, alias],
        });
      }
      expect(deriveQualification(readQualificationEvidence(global, "tuple-1", capability))).toBe("Production_cleared");
      const anomalous = runStartInput(repositories[0]!, 200) as any;
      anomalous.run.anomaly_reason = "quality_drift";
      expect(recordMachineLocalEvaluationRunStart(global, anomalous)).toMatchObject({ evaluation_required: true, evaluation_reason: "quality_drift", post_clearance_run_ordinal: 1 });
      expect(recordMachineLocalEvaluationRunStart(global, runStartInput(repositories[0]!, 201) as never)).toMatchObject({ evaluation_required: false, evaluation_reason: "not_selected", post_clearance_run_ordinal: 2 });
      const malformed = runStartInput(repositories[0]!, 202) as any;
      malformed.run.anomaly_reason = "fabricated_anomaly";
      expect(() => recordMachineLocalEvaluationRunStart(global, malformed)).toThrow(/closed evaluation anomaly reason/);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("retains a no-harm failure, emits its qualification violation, and reserves the production gate", async () => {
    const { directory, global } = await database();
    try {
      const start = trustedStartInput(await localGitCheckout(directory, "repository-a"), 1);
      recordMachineLocalEvaluationRunStart(global, start as never);
      const outcome = recordOutcome(global, start, 1, "independent-evaluator", (dimension) => dimension !== "no_harm", true, start.identity_lease, start.pre_evaluation_receipt_verification);
      expect(outcome).toMatchObject({ contributes_quality_credit: true, qualification_after_outcome: "EVALUATING" });
      expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM qualification_events WHERE event_kind = 'no_harm_violation'").get()?.count).toBe(1);
      expect(global.database.query<{ contributes_quality_credit: number }>("SELECT contributes_quality_credit FROM trials WHERE run_event_id = ?").get("run-event-1")?.contributes_quality_credit).toBe(1);
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it("keeps a raw failed task in the qualification denominator even when an evaluator result says success", async () => {
    const { directory, global } = await database();
    try {
      const start = trustedStartInput(await localGitCheckout(directory, "repository-a"), 1);
      recordMachineLocalEvaluationRunStart(global, start as never);
      const outcome = recordOutcome(global, start, 1, "independent-evaluator", () => true, false, start.identity_lease, start.pre_evaluation_receipt_verification);
      expect(outcome).toMatchObject({ contributes_quality_credit: true, qualification_after_outcome: "EVALUATING" });
      expect(global.database.query<{ verified_success: number; contributes_quality_credit: number }>(
        "SELECT verified_success, contributes_quality_credit FROM trials WHERE run_event_id = ?",
      ).get("run-event-1")).toEqual({ verified_success: 0, contributes_quality_credit: 1 });
      expect(readQualificationEvidence(global, "tuple-1", capability)).toMatchObject({ verified_trials: 1, verified_successes: 0 });
    } finally { global.close(); await rm(directory, { recursive: true, force: true }); }
  });
}, 20_000);
