import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { openControlPlaneDatabase, type BunSqliteDatabase } from "../persistence/sqlite.js";
import { appendCurrentRunBinding, appendRunComponent, SqliteControlPlaneSnapshotProducer } from "./snapshot-producer.js";
import { CAPABILITY_DEFINITIONS } from "../contracts/capability-taxonomy.js";
import { canonicalJson, sha256Bytes } from "./authority.js";
import { TEST_NOW, testSha, validManifestValue } from "./test-fixture.js";
import { StaticBearerAuthenticator } from "./auth.js";
import { startLoopbackHttpAdapter, type ControlPlaneRequestHandler } from "./http.js";
import { CONTROL_PLANE_PROTOCOL_VERSION } from "./protocol.js";
import { parseCanonicalLiveSnapshot } from "../contracts/snapshot.js";
import { parseSnapshot } from "../../../control-plane-app/src/read-model.js";

const now = "2026-08-26T12:00:00.000Z";
const digest = "a".repeat(64);

async function openWriter(path: string): Promise<BunSqliteDatabase> {
  const moduleName: string = "bun:sqlite";
  const sqlite = await import(moduleName) as unknown as { readonly Database: new (filename: string) => BunSqliteDatabase };
  return new sqlite.Database(path);
}

function complexityValue(objectSha: string) {
  const counts = { bytes: 1, lines: 1, files: 1 };
  const object = { bytes: 8, lines: 8, files: 8 };
  const tracked = { bytes: 7, lines: 7, files: 7 };
  const ignoredZero = { bytes: 0, lines: 0, files: 0 };
  return {
    availability: "MEASURED", object_sha256: objectSha,
    repository_object_total: object, tracked_object: tracked, untracked_nonignored: counts,
    authored_source: counts, tests: counts, public_documentation: counts, planning_documentation: counts,
    generated_shippable: counts, config_tooling: counts, evidence_research: counts, dependencies_assets: counts,
    ignored_live: { availability: "NOT_MEASURED", observed_at: null, subject_relation: "outside_repository_object", total: ignoredZero, dependencies: ignoredZero, build_cache: ignoredZero, local_evidence: ignoredZero, other: ignoredZero },
    docs_to_authored_code: { bytes: 2, lines: 2, files: 2 }, structural_coverage: "repository-object TypeScript/JavaScript", limitations: [],
    functions: { p50: 1, p95: 1, max: 1, cyclomatic_p95: 1 }, cycles: [], hotspots: [], trend: [], repository_size_history: [],
  };
}

describe("SQLite live snapshot producer", () => {
  it("admits only canonical typed components and monotonic current bindings", async () => {
    const directory = await mkdtemp("/tmp/mc-snapshot-admission-");
    const repository = await openControlPlaneDatabase("repository", join(directory, "repository.sqlite"), now);
    try {
      repository.database.query("INSERT INTO repositories(repository_id, repository_root, display_name, created_at) VALUES (?, ?, ?, ?)").run("repo-1", directory, "repo", now);
      repository.database.query("INSERT INTO evidence_records(evidence_id, repository_id, path, sha256, record_type, recorded_at) VALUES (?, ?, ?, ?, ?, ?)").run("evidence-1", "repo-1", "coverage.json", digest, "test", now);
      repository.database.query("INSERT INTO evidence_records(evidence_id, repository_id, path, sha256, record_type, recorded_at) VALUES (?, ?, ?, ?, ?, ?)").run("evidence-2", "repo-1", "binding.json", digest, "test", now);
      repository.database.query("INSERT INTO runs(run_id, repository_id, mister_clean_version, detector_set_id, detector_set_sha256, observed_then_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run("run-1", "repo-1", "1.0", "detector-1", digest, "{}", now);
      repository.database.query("INSERT INTO run_events(event_id, run_id, sequence, event_kind, state, repository_object_sha256, payload_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("closed-1", "run-1", 1, "repository_object.closed", "clean", digest, "{}", now);
      expect(() => appendRunComponent(repository, {
        component_id: "component-1", run_id: "run-1", repository_object_sha256: digest, component_kind: "complexity", schema_version: "1.0",
        parser_identity: "test", parser_version: "1", value: { availability: "MEASURED" }, evidence: [{ path: "evidence.json", sha256: digest }], observed_at: now,
      })).toThrow();
      appendRunComponent(repository, {
        component_id: "component-detector", run_id: "run-1", repository_object_sha256: digest, component_kind: "detector_coverage", schema_version: "1.0",
        parser_identity: "test", parser_version: "1", value: "three required detector families", evidence: [{ path: "coverage.json", sha256: digest }], observed_at: now,
      });
      appendCurrentRunBinding(repository, { binding_id: "binding-1", repository_id: "repo-1", run_id: "run-1", repository_object_sha256: digest, sequence: 1, evidence: [{ path: "binding.json", sha256: digest }], bound_at: now });
      expect(() => appendCurrentRunBinding(repository, { binding_id: "binding-0", repository_id: "repo-1", run_id: "run-1", repository_object_sha256: digest, sequence: 1, evidence: [{ path: "binding.json", sha256: digest }], bound_at: now })).toThrow(/sequence/);
    } finally {
      repository.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not accept a perfectly shaped forged metric snapshot cache", async () => {
    const directory = await mkdtemp("/tmp/mc-snapshot-producer-");
    const repository = await openControlPlaneDatabase("repository", join(directory, "repository.sqlite"), now);
    const global = await openControlPlaneDatabase("global", join(directory, "global.sqlite"), now);
    try {
      repository.database.query("INSERT INTO repositories(repository_id, repository_root, display_name, created_at) VALUES (?, ?, ?, ?)").run("repo-1", directory, "repo", now);
      repository.database.query("INSERT INTO runs(run_id, repository_id, mister_clean_version, detector_set_id, detector_set_sha256, observed_then_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run("run-1", "repo-1", "1.0", "detector-1", digest, "{}", now);
      repository.database.query("INSERT INTO metric_snapshots(metric_snapshot_id, run_id, repository_object_sha256, metric_kind, classifier_version, snapshot_json, snapshot_sha256, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("snapshot-1", "run-1", digest, "control-plane.snapshot", "1.0", JSON.stringify({ source: "live" }), digest, now);
      const producer = new SqliteControlPlaneSnapshotProducer({ repository, global });
      await expect(producer.load()).rejects.toThrow(/current run binding is absent/);
    } finally {
      repository.close();
      global.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("composes an admitted normalized run and historical qualification without binding a live seat", async () => {
    const directory = await mkdtemp("/tmp/mc-snapshot-compose-");
    const repositoryPath = join(directory, "repository.sqlite");
    const globalPath = join(directory, "global.sqlite");
    const repository = await openControlPlaneDatabase("repository", repositoryPath, TEST_NOW);
    const global = await openControlPlaneDatabase("global", globalPath, TEST_NOW);
    let repositoryWriter: BunSqliteDatabase | null = null;
    let globalWriter: BunSqliteDatabase | null = null;
    try {
      const manifest = validManifestValue();
      const subject = manifest.repository;
      const manifestBytes = canonicalJson(manifest);
      const manifestDigest = sha256Bytes(manifestBytes);
      const observation = {
        run_id: manifest.run_id, observed_at: TEST_NOW, mister_clean_version: "6.4.0",
        detector_set: { detector_set_id: "detectors-1", version: "1", sha256: manifest.detector_set_sha256, runtime_identity_sha256: testSha("9"), coverage_ref: { path: "coverage.json", sha256: testSha("c") } },
        subject, scope: ["."], exclusions: [], start_verdict: "CLEAN", terminal_verdict: "CLEAN", terminal_state: "clean",
        debt_flow: { starting_real_issues: 0, discovered_preexisting: 0, caused_by_remediation: 0, concurrently_introduced: 0, paid: 0, invalidated_false_positives: 0, classification_correction_delta: 0, ending_real_issues: 0, boundary_blocked: 0 },
        evidence: [{ path: "coverage.json", sha256: testSha("c") }], known_now_issue_ids: [], detector_misses: [], process_defects: [], note: "admitted run",
      };
      const interpretation = { source_run_id: manifest.run_id, interpreted_at: TEST_NOW, detector_set: observation.detector_set, real_issue_ids: [], false_positive_issue_ids: [], classification_corrections: [], debt_flow: observation.debt_flow, evidence: observation.evidence };
      const observationJson = canonicalJson(observation);
      const interpretationJson = canonicalJson(interpretation);
      const receipt = { receipt_id: "receipt-1", state: "verified", run_id: manifest.run_id, manifest_id: manifest.manifest_id, manifest_revision: 1, manifest_sha256: manifestDigest, baseline_repository: subject, output_repository: subject, role: "holdout", actor: "holdout-agent", claims: ["verified"], conclusion: "pass", sealed_at: TEST_NOW, evidence: [{ path: "receipt.json", sha256: testSha("e") }] };
      const receiptJson = canonicalJson(receipt);
      const directive = { record_type: "mister-clean.directive-event", schema_version: "1.0", directive_id: "directive-1", sequence: 1, run_id: manifest.run_id, manifest_id: manifest.manifest_id, manifest_revision: 1, manifest_sha256: manifestDigest, from_state: null, to_state: "recommended", occurred_at: TEST_NOW, control_surface_id: null, evidence: [], receipt_ids: ["receipt-1"] };
      const issue = { issue_id: "issue-1", stable_cause_key: "issue", normalizer: "test", title: "paid issue", description: "paid", debt_domain: "test", technical_or_agentic: "technical", state: "paid", origin: "baseline", disposition: "autonomously_repair", severity: 1, remediation_difficulty: 1, confidence: 1, first_detected_run_id: manifest.run_id, observation_ids: [], affected_invariants: [], affected_paths: ["src"], acceptance_boundary: [], evidence: [{ path: "issue.json", sha256: testSha("f") }] };
      repository.database.query("INSERT INTO repositories(repository_id, repository_root, display_name, created_at) VALUES (?, ?, ?, ?)").run(subject.repository_id, directory, "repo", TEST_NOW);
      for (const [path, sha] of [["coverage.json", testSha("c")], ["receipt.json", testSha("e")], ["issue.json", testSha("f")], ["binding.json", testSha("b")]] as const) repository.database.query("INSERT INTO evidence_records(evidence_id, repository_id, path, sha256, record_type, recorded_at) VALUES (?, ?, ?, ?, ?, ?)").run(`e-${path}`, subject.repository_id, path, sha, "test", TEST_NOW);
      repository.database.query("INSERT INTO runs(run_id, repository_id, mister_clean_version, detector_set_id, detector_set_sha256, observed_then_json, observed_then_sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(manifest.run_id, subject.repository_id, "6.4.0", "detectors-1", manifest.detector_set_sha256, observationJson, sha256Bytes(observationJson), TEST_NOW);
      repository.database.query("INSERT INTO run_interpretations(interpretation_id, source_run_id, detector_set_id, detector_set_sha256, interpretation_sha256, known_now_json, known_now_sha256, interpreted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("interpretation-1", manifest.run_id, "detectors-1", manifest.detector_set_sha256, sha256Bytes(interpretationJson), interpretationJson, sha256Bytes(interpretationJson), TEST_NOW);
      repository.database.query("INSERT INTO run_events(event_id, run_id, sequence, event_kind, state, repository_object_sha256, payload_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("closed-1", manifest.run_id, 1, "repository_object.closed", "clean", subject.repository_object_sha256, canonicalJson({ record_type: "mister-clean.repository-object-binding", schema_version: "1.0", run_id: manifest.run_id, repository: subject, evidence: [{ path: "binding.json", sha256: testSha("b") }] }), TEST_NOW);
      repository.database.query("INSERT INTO manifest_revisions(manifest_id, revision, run_id, parent_manifest_sha256, manifest_sha256, canonical_manifest_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(manifest.manifest_id, 1, manifest.run_id, null, manifestDigest, manifestBytes, TEST_NOW);
      repository.database.query("INSERT INTO issue_roots(issue_id, repository_id, stable_cause_key, normalizer, first_detected_run_id, immutable_identity_json) VALUES (?, ?, ?, ?, ?, ?)").run("issue-1", subject.repository_id, "issue", "test", manifest.run_id, canonicalJson(issue));
      repository.database.query("INSERT INTO issue_events(event_id, issue_id, run_id, sequence, event_kind, from_state, to_state, payload_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("issue-event-1", "issue-1", manifest.run_id, 1, "paid", null, "paid", "{}", TEST_NOW);
      repository.database.query("INSERT INTO directive_events(directive_id, sequence, run_id, manifest_id, manifest_revision, from_state, to_state, control_surface_id, event_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("directive-1", 1, manifest.run_id, manifest.manifest_id, 1, null, "recommended", null, canonicalJson(directive), TEST_NOW);
      repository.database.query("INSERT INTO receipts(receipt_id, run_id, manifest_id, manifest_revision, repository_object_sha256, receipt_sha256, receipt_json, sealed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("receipt-1", manifest.run_id, manifest.manifest_id, 1, subject.repository_object_sha256, sha256Bytes(receiptJson), receiptJson, TEST_NOW);
      appendCurrentRunBinding(repository, { binding_id: "binding-1", repository_id: subject.repository_id, run_id: manifest.run_id, repository_object_sha256: subject.repository_object_sha256, sequence: 1, evidence: [{ path: "binding.json", sha256: testSha("b") }], bound_at: TEST_NOW });
      appendRunComponent(repository, { component_id: "detector-1", run_id: manifest.run_id, repository_object_sha256: subject.repository_object_sha256, component_kind: "detector_coverage", schema_version: "1.0", parser_identity: "test", parser_version: "1", value: "admitted detector coverage", evidence: [{ path: "coverage.json", sha256: testSha("c") }], observed_at: TEST_NOW });
      appendRunComponent(repository, { component_id: "complexity-1", run_id: manifest.run_id, repository_object_sha256: subject.repository_object_sha256, component_kind: "complexity", schema_version: "1.0", parser_identity: "test", parser_version: "1", value: complexityValue(subject.repository_object_sha256), evidence: [{ path: "coverage.json", sha256: testSha("c") }], observed_at: TEST_NOW });
      appendRunComponent(repository, { component_id: "terminal-1", run_id: manifest.run_id, repository_object_sha256: subject.repository_object_sha256, component_kind: "terminal_contract", schema_version: "1.0", parser_identity: "test", parser_version: "1", value: { declared_verdict: "CLEAN", subject, contract: { zero_payable_issues: true, zero_unpaid_caused_by_mister_clean: true, zero_material_boundary_or_unknown_debt: true, fresh_repository_and_mister_clean_evidence: true, coherent_required_surfaces: true, independent_qa_holdout_accepted: true, no_unexplained_complexity_regression: true, exact_tree_target_coordination_current: true, live_validated_closure_bundle: true }, evidence: [{ path: "receipt.json", sha256: testSha("e") }] }, evidence: [{ path: "receipt.json", sha256: testSha("e") }], observed_at: TEST_NOW });
      appendRunComponent(repository, { component_id: "freshness-1", run_id: manifest.run_id, repository_object_sha256: subject.repository_object_sha256, component_kind: "evidence_freshness", schema_version: "1.0", parser_identity: "test", parser_version: "1", value: "fresh at admitted run", evidence: [{ path: "coverage.json", sha256: testSha("c") }], observed_at: TEST_NOW });
      for (const definition of CAPABILITY_DEFINITIONS) global.database.query("INSERT INTO capabilities(capability_id, family, label, description, taxonomy_version) VALUES (?, ?, ?, ?, ?)").run(definition.id, definition.family, definition.label, definition.description, definition.taxonomy_version);
      global.database.query("INSERT INTO models(model_id, family, display_name, context_limit_tokens, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?)").run("model-1", "family", "Model", 200000, "{}", TEST_NOW);
      global.database.query("INSERT INTO harnesses(harness_id, display_name, version, supports_headless, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?)").run("harness-1", "Harness", "1", 1, "{}", TEST_NOW);
      global.database.query("INSERT INTO agent_tuples(agent_tuple_id, model_id, harness_id, reasoning_level, first_observed_at) VALUES (?, ?, ?, ?, ?)").run("agent-tuple-1", "model-1", "harness-1", "high", TEST_NOW);
      global.database.query("INSERT INTO inference_sources(inference_source_id, display_name, source_kind, machine_identity, endpoint, secret_ref, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("source-1", "Source", "developer_plan", null, null, null, "{}", TEST_NOW);
      global.database.query("INSERT INTO deployments(deployment_id, model_id, inference_source_id, provider_model_id, context_limit_tokens, max_concurrency, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("deployment-1", "model-1", "source-1", "provider-model", 200000, 1, "{}", TEST_NOW);
      global.database.query("INSERT INTO execution_routes(execution_route_id, agent_tuple_id, deployment_id, invocation_kind, invocation_adapter, headless_supported, secret_ref, route_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("route-1", "agent-tuple-1", "deployment-1", "harness", "adapter", 1, null, "{}", TEST_NOW);
      const retain = (label: string): string => {
        const bytes = Buffer.from(`snapshot-evidence:${label}`, "utf8");
        const digest = sha256Bytes(bytes);
        global.database.query("INSERT INTO agent_evaluation_evidence(evidence_sha256, media_type, evidence_bytes, byte_length, retained_at) VALUES (?, ?, ?, ?, ?)").run(digest, "application/json", bytes, bytes.byteLength, TEST_NOW);
        return digest;
      };
      const dispatchDigest = retain("dispatch");
      const evaluationDigest = retain("evaluation");
      const trialDigest = retain("trial");
      const insertObservation = global.database.query(
        `INSERT INTO agent_identity_observations(observation_id, identity_lease_id, phase, requested_agent_tuple_id, execution_route_id, observed_model_id, observed_harness_id, observed_reasoning_level, evidence_kind, evidence_sha256, observer_actor_id, control_surface_token, harness_session_token, process_instance_token, intended_surface_label, worker_self_report, observed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      insertObservation.run("ob-dispatch", "lease-qualified", "pre_dispatch", "agent-tuple-1", "route-1", "model-1", "harness-1", "high", "external_visual_readback", dispatchDigest, "dispatch-observer", null, "session", "process", null, null, "2026-08-26T11:00:00.000Z");
      insertObservation.run("ob-evaluation", "lease-qualified", "pre_evaluation", "agent-tuple-1", "route-1", "model-1", "harness-1", "high", "external_visual_readback", evaluationDigest, "evaluation-observer", null, "session", "process", null, null, "2026-08-26T11:01:00.000Z");
      const insertLeaseEvent = global.database.query("INSERT INTO agent_identity_lease_events(event_id, identity_lease_id, requested_agent_tuple_id, execution_route_id, observation_id, event_kind, reason, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      insertLeaseEvent.run("lease-issued", "lease-qualified", "agent-tuple-1", "route-1", null, "issued", null, "2026-08-26T10:59:00.000Z");
      insertLeaseEvent.run("lease-dispatch", "lease-qualified", "agent-tuple-1", "route-1", "ob-dispatch", "pre_dispatch_bound", null, "2026-08-26T11:00:00.000Z");
      insertLeaseEvent.run("lease-evaluation", "lease-qualified", "agent-tuple-1", "route-1", "ob-evaluation", "pre_evaluation_bound", null, "2026-08-26T11:01:00.000Z");
      global.database.query(
        `INSERT INTO agent_run_events(run_event_id, source_run_token, repository_cohort_token, agent_tuple_id, execution_route_id, identity_lease_id, capability_id, qualification_at_dispatch, post_clearance_run_ordinal, evaluation_required, evaluation_reason, operational_telemetry_json, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("agent-run-1", "source-run-1", "cohort-1", "agent-tuple-1", "route-1", "lease-qualified", "independent_qa_holdout", "EVALUATING", null, 1, "pre_clearance_every_run", "{}", "2026-08-26T11:00:00.000Z");
      global.database.query(
        `INSERT INTO trials(trial_id, run_event_id, agent_tuple_id, capability_id, repository_cohort_token, verified_success, independent_evaluation, no_harm_violation, authority_violation, identity_disposition, contributes_quality_credit, evaluation_json, evidence_sha256, completed_at, worker_actor_id, author_actor_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("trial-1", "agent-run-1", "agent-tuple-1", "independent_qa_holdout", "cohort-1", 1, 1, 0, 0, "BOUND_FOR_EVALUATION", 1, "{}", trialDigest, "2026-08-26T11:02:00.000Z", "worker", "author");
      const insertEvaluator = global.database.query(
        "INSERT INTO capability_evaluators(evaluator_id, capability_id, question, evaluator_version, active, evaluation_dimension, independent_evaluator) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      const insertEvaluation = global.database.query("INSERT INTO trial_evaluations(trial_id, evaluator_id, result, evidence_sha256, evaluator_actor_id) VALUES (?, ?, ?, ?, ?)");
      for (const [id, dimension, independent] of [
        ["eval-success", "verified_success", 0],
        ["eval-independent", "independent_evaluation", 1],
        ["eval-no-harm", "no_harm", 0],
        ["eval-authority", "authority", 0],
      ] as const) {
        insertEvaluator.run(id, "independent_qa_holdout", `${dimension} question`, "1", 1, dimension, independent);
        insertEvaluation.run("trial-1", id, 1, retain(id), "independent-evaluator");
      }

      repositoryWriter = await openWriter(repositoryPath);
      globalWriter = await openWriter(globalPath);
      let consistencyAttempts = 0;
      const snapshot = await new SqliteControlPlaneSnapshotProducer({ repository, global }, async (attempt) => {
        consistencyAttempts = attempt;
        await Promise.resolve();
        if (attempt === 1) repositoryWriter!.query("UPDATE repositories SET display_name = ? WHERE repository_id = ?").run("repo-after-retry", subject.repository_id);
        if (attempt === 2) globalWriter!.query("UPDATE models SET display_name = ? WHERE model_id = ?").run("Model after retry", "model-1");
      }).load();
      expect(snapshot.current_run_id).toBe(manifest.run_id);
      expect(snapshot.source).toBe("live");
      expect(consistencyAttempts).toBe(3);
      expect(snapshot.agents).toHaveLength(1);
      const agent = snapshot.agents[0]!;
      expect(agent.model).toBe("Model after retry");
      expect(agent.execution_identity.disposition).toBe("IDENTITY_UNBOUND");
      const score = agent.capability_scores.find((value) => value.capability_id === "independent_qa_holdout")!;
      expect(score.verified_trials).toBe(1);
      expect(score.qualification_provenance.explicitly_disqualified).toBe(false);

      const appRoot = join(directory, "app");
      await mkdir(appRoot);
      await writeFile(join(appRoot, "index.html"), "<html><body>control plane</body></html>", "utf8");
      const service: ControlPlaneRequestHandler = {
        async handle(value) {
          const requestId = typeof value === "object" && value !== null && "request_id" in value
            ? String((value as { request_id: unknown }).request_id) : "unknown";
          return { version: CONTROL_PLANE_PROTOCOL_VERSION, request_id: requestId, ok: true, result: { status: "ok", protocol_version: CONTROL_PLANE_PROTOCOL_VERSION, global_inventory_available: true, route_admission_configured: false, evidence_verification_configured: false, dispatch_supported: false, execution_supported: false } };
        },
      };
      const http = await startLoopbackHttpAdapter({
        service,
        authenticator: new StaticBearerAuthenticator("snapshot-producer-http-test-token-0001"),
        app_root: appRoot,
        snapshot_producer: new SqliteControlPlaneSnapshotProducer({ repository, global }),
      });
      try {
        const session = await fetch(new URL("session", http.app_url!));
        const response = await fetch(new URL("control-plane/snapshot.json", http.app_url!), { headers: { Cookie: session.headers.get("set-cookie")! } });
        const wire = await response.json();
        const canonical = parseCanonicalLiveSnapshot(wire);
        const browser = parseSnapshot(wire);
        expect(response.status).toBe(200);
        expect(browser).toEqual(canonical);
        expect(canonical.current_run_id).toBe(manifest.run_id);
        expect("run_id" in (wire as Record<string, unknown>)).toBe(false);
        expect("repository_object_sha256" in (wire as Record<string, unknown>)).toBe(false);
      } finally {
        await http.close();
      }

      let unstableAttempts = 0;
      await expect(new SqliteControlPlaneSnapshotProducer({ repository, global }, async (attempt) => {
        unstableAttempts = attempt;
        await Promise.resolve();
        repositoryWriter!.query("UPDATE repositories SET display_name = ? WHERE repository_id = ?").run(`unstable-${attempt}`, subject.repository_id);
      }).load()).rejects.toThrow(/changed during 3 consecutive snapshot read windows/);
      expect(unstableAttempts).toBe(3);
    } finally {
      repositoryWriter?.close();
      globalWriter?.close();
      repository.close();
      global.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
