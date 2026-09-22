import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalCapabilityEvaluators } from "../contracts/capability-evaluator-registry.js";
import { canonicalJson, sha256Bytes } from "./authority.js";
import { startLocalControlPlaneRuntime } from "../../control-plane.js";
import { openControlPlaneDatabase } from "../persistence/sqlite.js";
import { rankAgents } from "../domain/ranking.js";
import { AppendOnlyLocalMisterCleanInvocationJournal, readMisterCleanInvocationJournal } from "../../mister-clean-invocation-journal.js";
import { ConfiguredEvaluationIdentityReceiptAuthority } from "./evaluation-intake.js";
import type { CapabilityEvaluatorAdapter } from "./capability-evaluator-execution.js";
import { CmuxAssistedVisualReadbackAdapter } from "./cmux-visual-readback.js";

const now = "2026-09-08T12:00:00.000Z";
const capability = "canonical_conformance_exact_format";
const token = "evaluation-intake-e2e-token-000000000000000000000001";
const testEvaluatorAdapter: CapabilityEvaluatorAdapter = {
  adapter_id: "fixture-evaluator-adapter",
  adapter_version: "1",
  evaluator_actor_id: "independent",
  execute_case({ evaluator, evidence }) {
    const matching = evidence.find((item) => Buffer.from(item.bytes).toString("utf8").includes(evaluator.evaluator_id));
    if (matching === undefined) return null;
    return { evaluator_id: evaluator.evaluator_id, case_id: evaluator.case_id, adapter_id: "fixture-evaluator-adapter", adapter_version: "1", evaluator_actor_id: "independent", result: true, evidence_sha256: matching.sha256 };
  },
};

function assistedCmuxAdapter(root: string) {
  const identify = new TextEncoder().encode(JSON.stringify({ workspace_id: "workspace-1", workspace_ref: "workspace:fixture", window_id: "window-1", window_ref: "window:fixture", surface_id: "surface-1", surface_ref: "surface:fixture", surface_type: "terminal" }));
  return new CmuxAssistedVisualReadbackAdapter({
    adapter_id: "trusted-assisted-visual", adapter_version: "1", observer_actor_id: "trusted-visual-observer",
    workspace_ref: "workspace:fixture", surface_ref: "surface:fixture", socket_namespace: "cmux://fixture/socket",
    tool_target_root: root, command_cwd: root,
    command_runner: { async run() { return { stdout: identify, stderr: new Uint8Array() }; } },
    source: { captureSelector({ requested_tuple }) { return { screenshot_bytes: new Uint8Array([137, 80, 78, 71]), screenshot_media_type: "image/png", observed_tuple: requested_tuple, observer_actor_id: "trusted-visual-observer", observed_at: new Date().toISOString() as never }; } },
  });
}

function retained(label: string) {
  const bytes = Buffer.from(`evidence:${label}`);
  return { sha256: sha256Bytes(bytes), media_type: "application/json", bytes, bytes_base64: bytes.toString("base64") };
}
function field(value: unknown, evidence: ReturnType<typeof retained> | null = null) { return { value, provenance: { status: evidence === null ? "unavailable" : "reported", evidence: evidence === null ? [] : [{ path: "evidence.json", sha256: evidence.sha256 }], note: null } }; }
function startPayload(root: string, number: number) {
  const profileEvidence = retained(`profile-${number}`), dispatch = retained(`dispatch-${number}`), evaluation = retained(`evaluation-${number}`), treatmentEvidence = retained(`treatment-${number}`);
  const profile: Record<string, unknown> = { schema_version: "1.0", profile_id: `profile-${number}`, revision: 1, captured_at: now, fingerprint_sha256: "0".repeat(64), agent_tuple_id: "tuple-1", harness: { id: field("harness-1", profileEvidence), version: field("1", profileEvidence) }, model: { id: field("model-1", profileEvidence), version: field("1", profileEvidence), release_date: field(null), family: field("family", profileEvidence) }, reasoning_level: field("high", profileEvidence), settings: [], inference: { deployment_mode: field("local_direct", profileEvidence), provider: field("local", profileEvidence), gateway: field(null), server: field(null), server_version: field(null), endpoint_ref: field(null), secret_ref: field(null) }, capability_environment: { tools: field([], profileEvidence), plugins: field([], profileEvidence), mcp_servers: field([], profileEvidence), skills: field([], profileEvidence) }, context: { starting_context_tokens: field(0, profileEvidence), context_window_tokens: field(1024, profileEvidence) }, performance: { time_to_first_token_ms: field(null), tokens_per_second: field(null), input_tokens: field(null), output_tokens: field(null), cost_usd: field(null), reliability: field(null) }, a2a_agent_card_extension: { enabled: false, public_card_url: null, extension_uri: null }, evidence: [{ path: "profile.json", sha256: profileEvidence.sha256 }] };
  const { fingerprint_sha256: _ignored, ...content } = profile;
  profile.fingerprint_sha256 = sha256Bytes(canonicalJson(content));
  const observation = (phase: "pre_dispatch" | "pre_evaluation", item: ReturnType<typeof retained>, observed_at: string) => ({ observation_id: `${phase}-${number}`, phase, requested_agent_tuple_id: "tuple-1", observed_model_id: "model-1", observed_harness_id: "harness-1", observed_reasoning_level: "high", execution_route_id: "route-1", control_surface_id: null, control_target: { kind: "headless", adapter_id: "test", request_or_session_id: "session", tool_target_root: null, command_cwd: null }, harness_session_token: "session", process_instance_token: "process", evidence_kind: "trusted_runtime_receipt", evidence: [{ path: `${phase}.json`, sha256: item.sha256 }], observer_actor_id: `${phase}-observer`, intended_surface_label: null, worker_self_report: null, observed_at });
  return { profile, treatment: { schema_version: "1.0", treatment_id: `treatment-${number}`, profile_id: profile.profile_id, profile_revision: 1, profile_fingerprint_sha256: profile.fingerprint_sha256, run_event_id: `run-${number}`, repository_cohort_token: "untrusted-label", capability_id: capability, started_at: now, completed_at: null, observed_identity_disposition: "IDENTITY_UNBOUND", observed_profile_sha256: profile.fingerprint_sha256, telemetry_sha256: null, evidence: [{ path: "treatment.json", sha256: treatmentEvidence.sha256 }] }, identity_lease: { identity_lease_id: `lease-${number}`, requested_tuple: { agent_tuple_id: "tuple-1", model_id: "model-1", harness_id: "harness-1", reasoning_level: "high" }, execution_route_id: "route-1", pre_dispatch: observation("pre_dispatch", dispatch, now), pre_evaluation: observation("pre_evaluation", evaluation, "2026-09-08T12:00:02.000Z"), invalidations: [] }, run: { source_run_token: `source-${number}`, repository_cohort_token: "untrusted-label", local_repository_root: root, capability_id: capability, started_at: now, token_telemetry: { input_tokens: null, output_tokens: null, cache_read_tokens: null, cache_write_tokens: null, reasoning_tokens: null, source: "local", reliable: false }, route_telemetry: { time_to_first_token_ms: null, tokens_per_second: null, wall_time_ms: null, retry_count: 0, recoverable_pause_count: 0, route_succeeded: true, measurement_consistent: true }, cost_telemetry: { currency: "USD", amount: null, price_source: "unknown", price_schedule_effective_at: null } }, retained: [profileEvidence, dispatch, evaluation, treatmentEvidence] };
}

function preDispatchReceipt(payload: ReturnType<typeof startPayload>, invocationIds: readonly string[]) {
  const observation = payload.identity_lease.pre_dispatch!;
  const { evidence: _selfReferentialReceiptEvidence, ...attestedObservation } = observation;
  const bytes = Buffer.from(canonicalJson({
    schema_version: "1.0",
    record_type: "mister-clean.evaluation-identity-receipt",
    binding: {
      phase: "pre_dispatch",
      run_event_id: payload.treatment.run_event_id,
      identity_lease: {
        identity_lease_id: payload.identity_lease.identity_lease_id,
        requested_tuple: payload.identity_lease.requested_tuple,
        execution_route_id: payload.identity_lease.execution_route_id,
        observation: attestedObservation,
      },
      invocation_ids: [...invocationIds],
    },
  }), "utf8");
  const receipt = { sha256: sha256Bytes(bytes), media_type: "application/vnd.mister-clean.evaluation-identity-receipt+json", bytes, bytes_base64: bytes.toString("base64") };
  (observation as { evidence: unknown }).evidence = [{ path: "pre-dispatch-receipt.json", sha256: receipt.sha256 }];
  payload.retained.push(receipt);
  return receipt;
}
async function checkout(directory: string, name: string) { const root = join(directory, name); await mkdir(root); execFileSync("git", ["init", "--quiet", root]); execFileSync("git", ["-C", root, "config", "user.email", ["e2e", "example.test"].join("@")]); execFileSync("git", ["-C", root, "config", "user.name", "E2E"]); await writeFile(join(root, "README.md"), name); execFileSync("git", ["-C", root, "add", "README.md"]); execFileSync("git", ["-C", root, "commit", "--quiet", "-m", "fixture"]); return root; }

describe("local evaluation intake transport", () => {
  it("credits only startup-configured receipts bound to the exact phase, lease, process, and imported invocation set", () => {
    const payload = startPayload("/tmp/identity-receipt-fixture", 99);
    const invocationIds = ["mc-invocation:a", "mc-invocation:b"];
    const observation = payload.identity_lease.pre_dispatch!;
    const { evidence: _selfReferentialReceiptEvidence, ...attestedObservation } = observation;
    const bytes = Buffer.from(canonicalJson({
      schema_version: "1.0",
      record_type: "mister-clean.evaluation-identity-receipt",
      binding: {
        phase: "pre_dispatch",
        run_event_id: "run-99",
        identity_lease: {
          identity_lease_id: payload.identity_lease.identity_lease_id,
          requested_tuple: payload.identity_lease.requested_tuple,
          execution_route_id: payload.identity_lease.execution_route_id,
          observation: attestedObservation,
        },
        invocation_ids: invocationIds,
      },
    }), "utf8");
    const receipt = { sha256: sha256Bytes(bytes), bytes };
    (observation as { evidence: unknown }).evidence = [{ path: "pre_dispatch-receipt.json", sha256: receipt.sha256 }];
    const authority = new ConfiguredEvaluationIdentityReceiptAuthority([{ receipt_sha256: receipt.sha256, observer_actor_id: observation.observer_actor_id, identity_assurance: "active_harness_selection" }]);
    expect(authority.authorize({ phase: "pre_dispatch", run_event_id: "run-99", identity_lease: payload.identity_lease as never, invocation_ids: invocationIds, retained_evidence: [receipt] })).toEqual({ receipt_sha256: receipt.sha256, observer_actor_id: observation.observer_actor_id, identity_assurance: "active_harness_selection" });
    expect(authority.authorize({ phase: "pre_dispatch", run_event_id: "run-99", identity_lease: payload.identity_lease as never, invocation_ids: [invocationIds[0]!], retained_evidence: [receipt] })).toBeNull();
    expect(authority.authorize({ phase: "pre_evaluation", run_event_id: "run-99", identity_lease: payload.identity_lease as never, invocation_ids: invocationIds, retained_evidence: [receipt] })).toBeNull();
  });

  it("accepts evidence-bound start/outcome and operator-attested aliases through authenticated local HTTP", async () => {
    const directory = await mkdtemp("/tmp/mc-evaluation-e2e-");
    const globalPath = join(directory, "global.sqlite"), repositoryPath = join(directory, "repository.sqlite");
    const journalPath = join(directory, "canonical-cli-invocations.jsonl");
    const journal = new AppendOnlyLocalMisterCleanInvocationJournal(journalPath);
    const global = await openControlPlaneDatabase("global", globalPath, now as never);
    const q = global.database.query.bind(global.database);
    q("INSERT INTO models(model_id, family, display_name, context_limit_tokens, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?)").run("model-1", "family", "Model", 1024, "{}", now);
    q("INSERT INTO harnesses(harness_id, display_name, version, supports_headless, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?)").run("harness-1", "Harness", "1", 1, "{}", now);
    q("INSERT INTO agent_tuples(agent_tuple_id, model_id, harness_id, reasoning_level, first_observed_at) VALUES (?, ?, ?, ?, ?)").run("tuple-1", "model-1", "harness-1", "high", now);
    q("INSERT INTO inference_sources(inference_source_id, display_name, source_kind, machine_identity, endpoint, secret_ref, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("source", "Local", "local_machine", "machine", null, null, "{}", now);
    q("INSERT INTO deployments(deployment_id, model_id, inference_source_id, provider_model_id, context_limit_tokens, max_concurrency, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("deployment", "model-1", "source", "model-1", 1024, 1, "{}", now);
    q("INSERT INTO execution_routes(execution_route_id, agent_tuple_id, deployment_id, invocation_kind, invocation_adapter, headless_supported, secret_ref, route_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("route-1", "tuple-1", "deployment", "local", "test", 1, null, "{}", now);
    q("INSERT INTO capabilities(capability_id, family, label, description, taxonomy_version) VALUES (?, ?, ?, ?, ?)").run(capability, "remediation", "Canonical", "Exact", "1.0"); global.close();
    let runtime = await startLocalControlPlaneRuntime({ repository_database_path: repositoryPath, global_database_path: globalPath, bearer_token: token, invocation_journal_path: journalPath, capability_evaluator_adapter: testEvaluatorAdapter, http: { host: "127.0.0.1", port: 0 } });
    try {
      const roots = await Promise.all([checkout(directory, "clone-a"), checkout(directory, "clone-b")]);
      const directBin = spawnSync(process.execPath, [join(process.cwd(), "bin", "mister-clean.js"), "detect", "stack", roots[0]!], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          MISTER_CLEAN_SOURCE_DEVELOPMENT: "1",
          MISTER_CLEAN_INVOCATION_JOURNAL_PATH: journalPath,
        },
      });
      // The fixture intentionally has no trusted stack attestation; the
      // receipt must still survive the package-bin command's nonzero result.
      expect(directBin.status).toBe(2);
      expect(readMisterCleanInvocationJournal(journalPath)).toHaveLength(1);
      // Startup reconciliation is the only importer: the direct package-bin
      // receipt is now visible without creating a tuple, route, or trial.
      await runtime.close();
      runtime = await startLocalControlPlaneRuntime({ repository_database_path: repositoryPath, global_database_path: globalPath, bearer_token: token, invocation_journal_path: journalPath, capability_evaluator_adapter: testEvaluatorAdapter, http: { host: "127.0.0.1", port: 0 } });
      const call = async (request_id: string, name: string, input: unknown, kind: "command" | "query" = "command") => { const response = await fetch(runtime.http!.url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ version: "1", request_id, kind, name, input }) }); return response.json() as Promise<any>; };
      const directPending = await call("direct-pending", "evaluation.invocations.pending.list", { limit: 1 }, "query");
      expect(directPending).toMatchObject({ ok: true, result: { pending_count: 1, invocations: [expect.objectContaining({ command: "detect", identity_provenance: "UNOBSERVED", quality_credit: false })] } });
      expect(Object.keys(directPending.result.invocations[0]).sort()).toEqual(["argv_sha256", "command", "identity_provenance", "invocation_id", "observed_at", "quality_credit", "receipt_sha256"]);
      const ids: string[] = [];
      for (let index = 0; index < 25; index += 1) {
        const payload = startPayload(roots[index % roots.length]!, index + 1);
        const invocationId = journal.recordStart({ command: "evaluate", argv: [String(index)], occurred_at: now });
        const started = await call(`start-${index}`, "evaluation.run.start", { start: { profile: payload.profile, treatment: payload.treatment, identity_lease: payload.identity_lease, run: payload.run }, invocation_ids: [invocationId], retained_evidence: payload.retained.map(({ sha256, media_type, bytes_base64 }) => ({ sha256, media_type, bytes_base64 })) });
        expect(started.ok, JSON.stringify(started)).toBe(true);
        expect(started).toMatchObject({ ok: true, result: { run_event_id: `run-${index + 1}`, evaluation_required: true } });
        const completion = retained(`completion-${index}`), evaluator = canonicalCapabilityEvaluators(capability).map((item) => ({ item, evidence: retained(`${item.evaluator_id}-${index}`) }));
        if (index === 0) {
          const directOutcome = await call("direct-evaluator-outcome", "evaluation.run.outcome", { outcome: { run_event_id: "run-1", identity_lease: payload.identity_lease, worker_actor_id: "worker", author_actor_id: "author", verified_success: true, task_completed_at: "2026-09-08T12:00:01.000Z", evaluated_at: "2026-09-08T12:00:03.000Z", completion_evidence_sha256: completion.sha256, evaluations: [] }, retained_evidence: [completion, ...evaluator.map(({ evidence }) => evidence), ...payload.retained].map(({ sha256, media_type, bytes_base64 }) => ({ sha256, media_type, bytes_base64 })) });
          expect(directOutcome).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
        }
        const outcome = await call(`outcome-${index}`, "evaluation.run.outcome", { outcome: { run_event_id: `run-${index + 1}`, identity_lease: payload.identity_lease, worker_actor_id: "worker", author_actor_id: "author", verified_success: true, task_completed_at: "2026-09-08T12:00:01.000Z", evaluated_at: "2026-09-08T12:00:03.000Z", completion_evidence_sha256: completion.sha256 }, retained_evidence: [completion, ...evaluator.map(({ evidence }) => evidence), ...payload.retained].map(({ sha256, media_type, bytes_base64 }) => ({ sha256, media_type, bytes_base64 })) });
        expect(outcome).toMatchObject({ ok: true, result: { contributes_quality_credit: false } }); ids.push(started.result.repository_id);
      }
      // This crosses the public service boundary: the caller offers stale
      // placeholder observations, while the startup-owned assisted adapter
      // captures both phases and mints the opaque dynamic receipt internally.
      const assisted = startPayload(roots[0]!, 90);
      const assistedStartAt = new Date(Date.now() + 300).toISOString();
      (assisted.treatment as { started_at: string }).started_at = assistedStartAt;
      (assisted.run as { started_at: string }).started_at = assistedStartAt;
      const dispatchScope = retained("assisted-dispatch-scope"), transitionScope = retained("assisted-transition-scope");
      const assistedInvocation = journal.recordStart({ command: "evaluate", argv: ["assisted"], occurred_at: now });
      await runtime.close();
      runtime = await startLocalControlPlaneRuntime({ repository_database_path: repositoryPath, global_database_path: globalPath, bearer_token: token, invocation_journal_path: journalPath, capability_evaluator_adapter: testEvaluatorAdapter, evaluation_identity_observation_adapter: assistedCmuxAdapter(roots[0]!), http: { host: "127.0.0.1", port: 0 } });
      const assistedStart = await call("assisted-start", "evaluation.run.start", { start: { profile: assisted.profile, treatment: assisted.treatment, identity_lease: assisted.identity_lease, run: assisted.run, task_subject: { dispatch_scope_evidence_sha256: dispatchScope.sha256, subject_repository_object_sha256: "a".repeat(64) } }, invocation_ids: [assistedInvocation], retained_evidence: [...assisted.retained, dispatchScope].map(({ sha256, media_type, bytes_base64 }) => ({ sha256, media_type, bytes_base64 })) });
      expect(assistedStart).toMatchObject({ ok: true, result: { run_event_id: "run-90" } });
      const assistedCompletion = retained("assisted-completion");
      const assistedEvaluator = canonicalCapabilityEvaluators(capability).map((item) => retained(`${item.evaluator_id}-assisted`));
      const forgedLease = structuredClone(assisted.identity_lease) as Record<string, any>;
      forgedLease.requested_tuple.model_id = "forged-model";
      expect(await call("assisted-forged-outcome", "evaluation.run.outcome", { outcome: { run_event_id: "run-90", identity_lease: forgedLease, worker_actor_id: "worker", author_actor_id: "author", verified_success: true, task_completed_at: new Date().toISOString(), evaluated_at: new Date(Date.now() + 100).toISOString(), completion_evidence_sha256: assistedCompletion.sha256, evaluated_candidate: { transition_scope_evidence_sha256: transitionScope.sha256, evaluated_repository_object_sha256: "b".repeat(64) } }, retained_evidence: [assistedCompletion, transitionScope, ...assistedEvaluator, ...assisted.retained].map(({ sha256, media_type, bytes_base64 }) => ({ sha256, media_type, bytes_base64 })) })).toMatchObject({ ok: false, error: { code: "PRECONDITION_FAILED" } });
      await new Promise((resolve) => setTimeout(resolve, 350));
      const completedAt = new Date(Date.now() - 25).toISOString();
      const evaluatedAt = new Date(Date.now() + 100).toISOString();
      expect(await call("assisted-outcome", "evaluation.run.outcome", { outcome: { run_event_id: "run-90", identity_lease: assisted.identity_lease, worker_actor_id: "worker", author_actor_id: "author", verified_success: true, task_completed_at: completedAt, evaluated_at: evaluatedAt, completion_evidence_sha256: assistedCompletion.sha256, evaluated_candidate: { transition_scope_evidence_sha256: transitionScope.sha256, evaluated_repository_object_sha256: "b".repeat(64) } }, retained_evidence: [assistedCompletion, transitionScope, ...assistedEvaluator, ...assisted.retained].map(({ sha256, media_type, bytes_base64 }) => ({ sha256, media_type, bytes_base64 })) })).toMatchObject({ ok: true, result: { contributes_quality_credit: true } });
      const assistedDatabase = await openControlPlaneDatabase("global", globalPath, now as never);
      expect(assistedDatabase.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM evaluation_identity_receipt_verifications WHERE run_event_id = ? AND identity_assurance = 'active_harness_selection'").get("run-90")?.count).toBe(2);
      expect(assistedDatabase.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM agent_evaluation_evidence WHERE media_type = 'application/vnd.mister-clean.cmux-assisted-visual-readback+json'").get()?.count).toBeGreaterThanOrEqual(2);
      assistedDatabase.close();
      // Two actual CLI receipts may source one observed trial, but neither can
      // be replayed into another source. This is deliberately independent of
      // the caller's claimed evidence_kind.
      const many = startPayload(roots[0]!, 26);
      const firstInvocation = journal.recordStart({ command: "detect", argv: ["many-a"], occurred_at: now });
      const secondInvocation = journal.recordStart({ command: "detect", argv: ["many-b"], occurred_at: now });
      const dispatchReceipt = preDispatchReceipt(many, [firstInvocation, secondInvocation]);
      await runtime.close();
      runtime = await startLocalControlPlaneRuntime({ repository_database_path: repositoryPath, global_database_path: globalPath, bearer_token: token, invocation_journal_path: journalPath, capability_evaluator_adapter: testEvaluatorAdapter, http: { host: "127.0.0.1", port: 0 }, evaluation_identity_receipts: [{ receipt_sha256: dispatchReceipt.sha256, observer_actor_id: many.identity_lease.pre_dispatch!.observer_actor_id, identity_assurance: "active_harness_selection" }] });
      expect(await call("pending-bounded", "evaluation.invocations.pending.list", { limit: 1 }, "query")).toMatchObject({ ok: true, result: { pending_count: 3, invocations: [expect.any(Object)] } });
      expect(await call("pending-unbounded", "evaluation.invocations.pending.list", { limit: 501 }, "query")).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
      expect(await call("many-to-one", "evaluation.run.start", { start: { profile: many.profile, treatment: many.treatment, identity_lease: many.identity_lease, run: many.run }, invocation_ids: [firstInvocation, secondInvocation], retained_evidence: many.retained.map(({ sha256, media_type, bytes_base64 }) => ({ sha256, media_type, bytes_base64 })) })).toMatchObject({ ok: true, result: { run_event_id: "run-26" } });
      expect(await call("pending-linked", "evaluation.invocations.pending.list", { limit: 10 }, "query")).toMatchObject({ ok: true, result: { pending_count: 1, invocations: [expect.objectContaining({ command: "detect", identity_provenance: "UNOBSERVED", quality_credit: false })] } });
      expect(await call("linked-not-agent", "agents.list", { capability_id: capability, limit: 10 }, "query")).toMatchObject({ ok: true, result: [expect.objectContaining({ agent_tuple_id: "tuple-1", capabilities: [] })] });
      const replay = startPayload(roots[1]!, 27);
      expect(await call("receipt-replay", "evaluation.run.start", { start: { profile: replay.profile, treatment: replay.treatment, identity_lease: replay.identity_lease, run: replay.run }, invocation_ids: [firstInvocation], retained_evidence: replay.retained.map(({ sha256, media_type, bytes_base64 }) => ({ sha256, media_type, bytes_base64 })) })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
      const linked = await openControlPlaneDatabase("global", globalPath, now as never);
      expect(linked.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM evaluation_run_invocations WHERE run_event_id = ?").get("run-26")?.count).toBe(2);
      expect(linked.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM trials WHERE run_event_id = ?").get("run-26")?.count).toBe(0);
      linked.close();
      const physicalIds = [...new Set(ids)].sort((left, right) => left.localeCompare(right));
      expect(physicalIds).toHaveLength(2);
      const registrationInput = (logicalProjectId: string, repositoryId: string, index: number) => {
        const receiptBytes = Buffer.from(canonicalJson({ schema_version: "1.0", record_type: "mister-clean.logical-project-registration", logical_project_id: logicalProjectId, repository_ids: [repositoryId], authorized_actor_id: "trusted-operator" }));
        const registrationEvidence = { sha256: sha256Bytes(receiptBytes), media_type: "application/vnd.mister-clean.logical-project-registration+json", bytes: receiptBytes, bytes_base64: receiptBytes.toString("base64") };
        const aliasEvidence = retained(`alias-${index}`);
        return { logical_project_id: logicalProjectId, registration_evidence_sha256: registrationEvidence.sha256, aliases: [{ repository_id: repositoryId, attestation_evidence_sha256: aliasEvidence.sha256 }], registered_at: now, retained_evidence: [registrationEvidence, aliasEvidence].map(({ sha256, media_type, bytes_base64 }) => ({ sha256, media_type, bytes_base64 })) };
      };
      const firstRegistration = registrationInput("logical-project:fixture-a", physicalIds[0]!, 0);
      const secondRegistration = registrationInput("logical-project:fixture-b", physicalIds[1]!, 1);
      expect(await call("untrusted-project", "evaluation.project.register", firstRegistration)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      const unaliasedRoster = await fetch(runtime.http!.url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ version: "1", request_id: "agents-unaliased", kind: "query", name: "agents.list", input: { capability_id: capability, limit: 10 } }) }).then((response) => response.json()) as any;
      expect(unaliasedRoster.result[0]).toMatchObject({ agent_tuple_id: "tuple-1", capabilities: [] });
      await runtime.close();
      runtime = await startLocalControlPlaneRuntime({ repository_database_path: repositoryPath, global_database_path: globalPath, bearer_token: token, invocation_journal_path: journalPath, capability_evaluator_adapter: testEvaluatorAdapter, http: { host: "127.0.0.1", port: 0 }, logical_project_registration_receipts: [
        { registration_evidence_sha256: firstRegistration.registration_evidence_sha256, operator_actor_id: "trusted-operator" },
        { registration_evidence_sha256: secondRegistration.registration_evidence_sha256, operator_actor_id: "trusted-operator" },
      ] });
      const alteredRegistration = registrationInput("logical-project:altered", physicalIds[0]!, 9);
      expect(await call("altered-project", "evaluation.project.register", alteredRegistration)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      expect(await call("project-a", "evaluation.project.register", firstRegistration)).toMatchObject({ ok: true, result: { logical_project_id: "logical-project:fixture-a", alias_count: 1, provenance: "OPERATOR_ATTESTED" } });
      expect(await call("project-b", "evaluation.project.register", secondRegistration)).toMatchObject({ ok: true, result: { logical_project_id: "logical-project:fixture-b", alias_count: 1, provenance: "OPERATOR_ATTESTED" } });
      expect(await call("project-replay", "evaluation.project.register", firstRegistration)).toMatchObject({ ok: true, result: { alias_count: 1 } });
      const changedAlias = retained("changed-alias");
      expect(await call("project-conflict", "evaluation.project.register", { ...firstRegistration, aliases: [{ ...firstRegistration.aliases[0]!, attestation_evidence_sha256: changedAlias.sha256 }], retained_evidence: [...firstRegistration.retained_evidence, { sha256: changedAlias.sha256, media_type: changedAlias.media_type, bytes_base64: changedAlias.bytes_base64 }] })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
      const direct = await openControlPlaneDatabase("global", globalPath, now as never);
      expect(() => direct.database.query("UPDATE logical_project_repository_aliases SET logical_project_id = ? WHERE repository_id = ?").run("forged-project", physicalIds[0]!)).toThrow(/append-only/);
      expect(() => direct.database.query("DELETE FROM logical_projects WHERE logical_project_id = ?").run("logical-project:fixture-a")).toThrow(/append-only/);
      direct.close();
      const roster = await fetch(runtime.http!.url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ version: "1", request_id: "agents", kind: "query", name: "agents.list", input: { capability_id: capability, limit: 10 } }) }).then((response) => response.json()) as any;
      expect(roster.result[0]).toMatchObject({ agent_tuple_id: "tuple-1", capabilities: [] });
      const ranked = rankAgents(roster.result.map((agent: any) => ({ agent_tuple_id: agent.agent_tuple_id, active_in_repository: false, available: true, capability_scores: agent.capabilities.map((score: any) => ({ capability_id: score.capability_id, score: score.trial_count === 0 ? 0 : score.verified_success_count / score.trial_count, confidence: Math.min(1, score.trial_count / 50), verified_trials: score.trial_count, qualification: score.qualification })) })), [{ capability_id: capability, weight: 3 }]);
      expect(ranked).toEqual([]);
    } finally { await runtime.close(); await rm(directory, { recursive: true, force: true }); }
  });
});
