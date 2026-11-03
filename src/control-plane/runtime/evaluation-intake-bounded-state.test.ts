import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { canonicalCapabilityEvaluators } from "../contracts/capability-evaluator-registry.js";
import { canonicalJson, sha256Bytes } from "./authority.js";
import { applyHermeticHookPolicy } from "../../test-support/fixture-repo.js";
import { openControlPlaneDatabase, type OpenControlPlaneDatabase } from "../persistence/sqlite.js";
import type { CapabilityEvaluatorAdapter } from "./capability-evaluator-execution.js";
import type { EvaluationIdentityObservationAdapter, IdentityObservationCapture } from "./evaluation-identity-receipt.js";
import { CAPTURED_DISPATCH_RECEIPTS_MAX_ENTRIES, CapturedDispatchReceiptUnavailableFault, SqliteMachineLocalEvaluationIntake } from "./evaluation-intake.js";
import { ControlPlaneFault } from "./protocol.js";

const startedAt = "2026-09-08T12:00:00.000Z";
const taskCompletedAt = "2026-09-08T12:00:01.000Z";
const preEvaluationAt = "2026-09-08T12:00:02.000Z";
const evaluatedAt = "2026-09-08T12:00:03.000Z";
const capability = "canonical_conformance_exact_format";
const observerActorId = "fixture-collector";

const evaluatorAdapter: CapabilityEvaluatorAdapter = {
  adapter_id: "fixture-evaluator-adapter",
  adapter_version: "1",
  evaluator_actor_id: "independent",
  execute_case({ evaluator, evidence }) {
    const matching = evidence.find((item) => Buffer.from(item.bytes).toString("utf8").includes(evaluator.evaluator_id));
    if (matching === undefined) return null;
    return { evaluator_id: evaluator.evaluator_id, case_id: evaluator.case_id, adapter_id: "fixture-evaluator-adapter", adapter_version: "1", evaluator_actor_id: "independent", result: true, evidence_sha256: matching.sha256 };
  },
};

/** A startup-owned collector that captures its own evidence for each phase. */
class FixtureCollector implements EvaluationIdentityObservationAdapter {
  readonly adapter_id = "fixture-collector-adapter";
  readonly adapter_version = "1";
  readonly observer_actor_id = observerActorId;
  captures = 0;
  observe(): null { return null; }
  capture(input: Parameters<EvaluationIdentityObservationAdapter["observe"]>[0]): IdentityObservationCapture {
    this.captures += 1;
    const bytes = Buffer.from(`collector:${input.phase}:${input.run_event_id}`);
    const sha256 = sha256Bytes(bytes);
    return {
      identity_assurance: "active_harness_selection",
      evidence: [{ sha256: sha256 as never, media_type: "application/json", bytes }],
      observation: {
        observation_id: `${input.phase}-${input.run_event_id}`, phase: input.phase, requested_agent_tuple_id: input.requested_tuple.agent_tuple_id,
        observed_model_id: input.requested_tuple.model_id, observed_harness_id: input.requested_tuple.harness_id, observed_reasoning_level: input.requested_tuple.reasoning_level,
        execution_route_id: input.execution_route_id, control_surface_id: null,
        control_target: { kind: "headless", adapter_id: "fixture", request_or_session_id: "session", tool_target_root: null, command_cwd: null },
        harness_session_token: "session", process_instance_token: "process", evidence_kind: "trusted_runtime_receipt",
        evidence: [{ path: `${input.phase}.json`, sha256 }], observer_actor_id: observerActorId, intended_surface_label: null, worker_self_report: null,
        observed_at: input.phase === "pre_dispatch" ? startedAt : preEvaluationAt,
      } as never,
    };
  }
}

function retained(label: string) {
  const bytes = Buffer.from(`evidence:${label}`);
  return { sha256: sha256Bytes(bytes), media_type: "application/json", bytes };
}
function field(value: unknown, evidence: ReturnType<typeof retained> | null = null) {
  return { value, provenance: { status: evidence === null ? "unavailable" : "reported", evidence: evidence === null ? [] : [{ path: "evidence.json", sha256: evidence.sha256 }], note: null } };
}
function startInput(root: string, number: number) {
  const profileEvidence = retained(`profile-${number}`), treatmentEvidence = retained(`treatment-${number}`);
  const profile: Record<string, unknown> = { schema_version: "1.0", profile_id: `profile-${number}`, revision: 1, captured_at: startedAt, fingerprint_sha256: "0".repeat(64), agent_tuple_id: "tuple-1", harness: { id: field("harness-1", profileEvidence), version: field("1", profileEvidence) }, model: { id: field("model-1", profileEvidence), version: field("1", profileEvidence), release_date: field(null), family: field("family", profileEvidence) }, reasoning_level: field("high", profileEvidence), settings: [], inference: { deployment_mode: field("local_direct", profileEvidence), provider: field("local", profileEvidence), gateway: field(null), server: field(null), server_version: field(null), endpoint_ref: field(null), secret_ref: field(null) }, capability_environment: { tools: field([], profileEvidence), plugins: field([], profileEvidence), mcp_servers: field([], profileEvidence), skills: field([], profileEvidence) }, context: { starting_context_tokens: field(0, profileEvidence), context_window_tokens: field(1024, profileEvidence) }, performance: { time_to_first_token_ms: field(null), tokens_per_second: field(null), input_tokens: field(null), output_tokens: field(null), cost_usd: field(null), reliability: field(null) }, a2a_agent_card_extension: { enabled: false, public_card_url: null, extension_uri: null }, evidence: [{ path: "profile.json", sha256: profileEvidence.sha256 }] };
  const { fingerprint_sha256: _ignored, ...content } = profile;
  profile.fingerprint_sha256 = sha256Bytes(canonicalJson(content));
  const identityLease = { identity_lease_id: `lease-${number}`, requested_tuple: { agent_tuple_id: "tuple-1", model_id: "model-1", harness_id: "harness-1", reasoning_level: "high" }, execution_route_id: "route-1", pre_dispatch: null, pre_evaluation: null, invalidations: [] };
  return {
    identityLease,
    input: {
      start: {
        profile,
        treatment: { schema_version: "1.0", treatment_id: `treatment-${number}`, profile_id: profile.profile_id, profile_revision: 1, profile_fingerprint_sha256: profile.fingerprint_sha256, run_event_id: `run-${number}`, repository_cohort_token: "untrusted-label", capability_id: capability, started_at: startedAt, completed_at: null, observed_identity_disposition: "IDENTITY_UNBOUND", observed_profile_sha256: profile.fingerprint_sha256, telemetry_sha256: null, evidence: [{ path: "treatment.json", sha256: treatmentEvidence.sha256 }] },
        identity_lease: identityLease,
        run: { source_run_token: `source-${number}`, repository_cohort_token: "untrusted-label", local_repository_root: root, capability_id: capability, started_at: startedAt, token_telemetry: { input_tokens: null, output_tokens: null, cache_read_tokens: null, cache_write_tokens: null, reasoning_tokens: null, source: "local", reliable: false }, route_telemetry: { time_to_first_token_ms: null, tokens_per_second: null, wall_time_ms: null, retry_count: 0, recoverable_pause_count: 0, route_succeeded: true, measurement_consistent: true }, cost_telemetry: { currency: "USD", amount: null, price_source: "unknown", price_schedule_effective_at: null } },
      },
      invocation_ids: [`mc-invocation:${number}`],
      retained_evidence: [profileEvidence, treatmentEvidence],
    },
  };
}
function outcomeInput(number: number, identityLease: unknown, withEvaluatorEvidence = true) {
  const completion = retained(`completion-${number}`);
  const evaluatorEvidence = withEvaluatorEvidence ? canonicalCapabilityEvaluators(capability).map((item) => retained(`${item.evaluator_id}-${number}`)) : [];
  return {
    outcome: { run_event_id: `run-${number}`, identity_lease: identityLease, worker_actor_id: "worker", author_actor_id: "author", verified_success: true, task_completed_at: taskCompletedAt, evaluated_at: evaluatedAt, completion_evidence_sha256: completion.sha256 },
    retained_evidence: [completion, ...evaluatorEvidence],
  } as never;
}

async function seededDatabase(directory: string): Promise<OpenControlPlaneDatabase> {
  const global = await openControlPlaneDatabase("global", join(directory, "global.sqlite"), startedAt as never);
  const q = global.database.query.bind(global.database);
  q("INSERT INTO models(model_id, family, display_name, context_limit_tokens, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?)").run("model-1", "family", "Model", 1024, "{}", startedAt);
  q("INSERT INTO harnesses(harness_id, display_name, version, supports_headless, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?)").run("harness-1", "Harness", "1", 1, "{}", startedAt);
  q("INSERT INTO agent_tuples(agent_tuple_id, model_id, harness_id, reasoning_level, first_observed_at) VALUES (?, ?, ?, ?, ?)").run("tuple-1", "model-1", "harness-1", "high", startedAt);
  q("INSERT INTO inference_sources(inference_source_id, display_name, source_kind, machine_identity, endpoint, secret_ref, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("source", "Local", "local_machine", "machine", null, null, "{}", startedAt);
  q("INSERT INTO deployments(deployment_id, model_id, inference_source_id, provider_model_id, context_limit_tokens, max_concurrency, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("deployment", "model-1", "source", "model-1", 1024, 1, "{}", startedAt);
  q("INSERT INTO execution_routes(execution_route_id, agent_tuple_id, deployment_id, invocation_kind, invocation_adapter, headless_supported, secret_ref, route_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("route-1", "tuple-1", "deployment", "local", "test", 1, null, "{}", startedAt);
  q("INSERT INTO capabilities(capability_id, family, label, description, taxonomy_version) VALUES (?, ?, ?, ?, ?)").run(capability, "remediation", "Canonical", "Exact", "1.0");
  // Imported CLI receipts, one per run, as startup reconciliation would leave them.
  const insert = q("INSERT INTO local_mister_clean_invocations(invocation_id, command, argv_sha256, observed_at, identity_provenance, receipt_sha256, journal_path_sha256, imported_at) VALUES (?, 'evaluate', ?, ?, 'UNOBSERVED', ?, ?, ?)");
  for (let number = 1; number <= CAPTURED_DISPATCH_RECEIPTS_MAX_ENTRIES + 8; number += 1) {
    insert.run(`mc-invocation:${number}`, sha256Bytes(`argv-${number}`), startedAt, sha256Bytes(`receipt-${number}`), sha256Bytes("journal"), startedAt);
  }
  return global;
}

async function checkout(directory: string): Promise<string> {
  const root = join(directory, "checkout");
  await mkdir(root);
  execFileSync("git", ["init", "--quiet", root]);
  execFileSync("git", ["-C", root, "config", "user.email", ["fixture", "example.test"].join("@")]);
  execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
  applyHermeticHookPolicy(root);
  await writeFile(join(root, "README.md"), "fixture");
  execFileSync("git", ["-C", root, "add", "README.md"]);
  execFileSync("git", ["-C", root, "commit", "--quiet", "-m", "fixture"]);
  return root;
}

function recordedRows(database: OpenControlPlaneDatabase): Record<string, number> {
  const count = (table: string) => database.database.query<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count ?? -1;
  return Object.fromEntries(["trials", "agent_identity_observations", "evaluation_identity_receipt_verifications", "agent_evaluation_evidence"].map((table) => [table, count(table)]));
}

describe("evaluation intake collector-bound dispatch receipts are bounded and fail closed", () => {
  let directory = "";
  let root = "";
  let database: OpenControlPlaneDatabase;
  let collector: FixtureCollector;
  let intake: SqliteMachineLocalEvaluationIntake;
  let largestHeld = 0;
  const leases = new Map<number, unknown>();

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "mc-intake-bounded-"));
    root = await checkout(directory);
    database = await seededDatabase(directory);
    collector = new FixtureCollector();
    intake = new SqliteMachineLocalEvaluationIntake(database, undefined, null, undefined, evaluatorAdapter, collector);
    // Start MAX+1 runs; none reports an outcome.
    for (let number = 1; number <= CAPTURED_DISPATCH_RECEIPTS_MAX_ENTRIES + 1; number += 1) {
      const { input, identityLease } = startInput(root, number);
      leases.set(number, identityLease);
      await expect(intake.start(input as never)).resolves.toMatchObject({ run_event_id: `run-${number}` });
      largestHeld = Math.max(largestHeld, intake.capturedDispatchReceiptCount);
    }
  }, 600_000);

  afterAll(async () => {
    database?.close();
    if (directory !== "") await rm(directory, { recursive: true, force: true });
  });

  it("never exceeds the maximum when MAX+1 runs start without outcomes", () => {
    expect(CAPTURED_DISPATCH_RECEIPTS_MAX_ENTRIES).toBeGreaterThan(0);
    expect(largestHeld).toBe(CAPTURED_DISPATCH_RECEIPTS_MAX_ENTRIES);
    expect(intake.capturedDispatchReceiptCount).toBe(CAPTURED_DISPATCH_RECEIPTS_MAX_ENTRIES);
    // Every start was collector-bound, so the oldest one is the one evicted.
    expect(database.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM evaluation_identity_receipt_verifications WHERE phase = 'pre_dispatch' AND observer_actor_id = ?").get(observerActorId)?.count).toBe(CAPTURED_DISPATCH_RECEIPTS_MAX_ENTRIES + 1);
  });

  it("refuses the outcome of an evicted run with the typed fault and records nothing", async () => {
    const before = recordedRows(database);
    const capturesBefore = collector.captures;
    const held = intake.capturedDispatchReceiptCount;
    const refusal = await intake.outcome(outcomeInput(1, leases.get(1))).then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(CapturedDispatchReceiptUnavailableFault);
    expect(refusal).toBeInstanceOf(ControlPlaneFault);
    expect(refusal).toMatchObject({ code: "PRECONDITION_FAILED", run_event_id: "run-1" });
    expect(recordedRows(database)).toEqual(before);
    expect(collector.captures).toBe(capturesBefore);
    expect(intake.capturedDispatchReceiptCount).toBe(held);
    // A run still held completes normally: its outcome is recorded.
    const last = CAPTURED_DISPATCH_RECEIPTS_MAX_ENTRIES + 1;
    await expect(intake.outcome(outcomeInput(last, leases.get(last)))).resolves.toMatchObject({ run_event_id: `run-${last}` });
    expect(database.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM trials WHERE run_event_id = ?").get(`run-${last}`)?.count).toBe(1);
    expect(intake.capturedDispatchReceiptCount).toBe(held - 1);
  });

  it("removes the entry when a throwing outcome fails after the bound lease matched", async () => {
    const number = 2;
    const forged = structuredClone(leases.get(number)) as { requested_tuple: { model_id: string } };
    forged.requested_tuple.model_id = "forged-model";
    const held = intake.capturedDispatchReceiptCount;
    // A forged lease is refused without releasing the genuine run's receipt.
    await expect(intake.outcome(outcomeInput(number, forged))).rejects.toThrow(/cannot replace the collector-bound dispatch identity lease/);
    expect(intake.capturedDispatchReceiptCount).toBe(held);
    // The genuine lease with no evaluator evidence throws inside the handling.
    const failure = await intake.outcome(outcomeInput(number, leases.get(number), false)).then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(ControlPlaneFault);
    expect(failure).not.toBeInstanceOf(CapturedDispatchReceiptUnavailableFault);
    expect(intake.capturedDispatchReceiptCount).toBe(held - 1);
    // The released run is now refused, never re-derived from the caller lease.
    await expect(intake.outcome(outcomeInput(number, leases.get(number)))).rejects.toBeInstanceOf(CapturedDispatchReceiptUnavailableFault);
  });
});
