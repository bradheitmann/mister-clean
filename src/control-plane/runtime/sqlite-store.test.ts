import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type {
  DirectiveId,
  IsoTimestamp,
  ManifestId,
  RepositoryId,
  RunId,
  Sha256,
} from "../contracts/primitives.js";
import type { DirectiveEvent, DirectiveState } from "../contracts/wave-directive.js";
import { openControlPlaneDatabase } from "../persistence/sqlite.js";
import { canonicalJson, sha256Bytes } from "./authority.js";
import { SqliteControlPlaneStore } from "./sqlite-store.js";
import { TEST_NOW, validManifestValue } from "./test-fixture.js";
import { sealDirectiveAppend } from "./transition-seal.js";

const sha = (character: string): Sha256 => character.repeat(64) as Sha256;
const now = TEST_NOW as IsoTimestamp;
const runId = "run-1" as RunId;
const manifestId = "manifest-1" as ManifestId;
const directiveId = "directive-1" as DirectiveId;

function manifestJson(revision: number, parentManifestSha256: Sha256 | null = null): string {
  return canonicalJson(validManifestValue(revision, parentManifestSha256));
}

function event(fromState: DirectiveState | null, toState: DirectiveState, manifestSha256: Sha256): DirectiveEvent {
  return {
    directive_id: directiveId,
    manifest_id: manifestId,
    manifest_revision: 1,
    manifest_sha256: manifestSha256,
    from_state: fromState,
    to_state: toState,
    occurred_at: now,
    control_surface: null,
    evidence: [],
  };
}

describe("SQLite directive ledger CAS", () => {
  it("atomically rejects stale directive state and stale manifest heads", async () => {
    const directory = await mkdtemp("/tmp/mc-runtime-db-");
    const database = await openControlPlaneDatabase("repository", join(directory, "repository.sqlite"), now);
    try {
      database.database.query(
        "INSERT INTO repositories(repository_id, repository_root, display_name, created_at) VALUES (?, ?, ?, ?)",
      ).run("repository-1" as RepositoryId, "/repo", "Repo", now);
      database.database.query(
        `INSERT INTO runs(run_id, repository_id, mister_clean_version, detector_set_id, detector_set_sha256, observed_then_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(runId, "repository-1", "6.4.0", "detectors-1", sha("d"), "{}", now);
      database.database.query(
        `INSERT INTO manifest_revisions(manifest_id, revision, run_id, parent_manifest_sha256, manifest_sha256, canonical_manifest_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(manifestId, 1, runId, null, sha256Bytes(manifestJson(1)), manifestJson(1), now);

      const store = new SqliteControlPlaneStore(database);
      const manifestDigest = sha256Bytes(manifestJson(1));
      await expect(store.getManifest(manifestId, 1)).resolves.toMatchObject({ manifest_sha256: manifestDigest });
      await expect(store.appendDirectiveEvent(sealDirectiveAppend({
        run_id: runId,
        event: event(null, "recommended", manifestDigest),
        expected_state: null,
        control_surface_id: null,
        receipt_ids: [],
        require_current_manifest: false,
      }))).resolves.toMatchObject({ sequence: 1 });
      await expect(store.appendDirectiveEvent(sealDirectiveAppend({
        run_id: runId,
        event: event(null, "recommended", manifestDigest),
        expected_state: null,
        control_surface_id: null,
        receipt_ids: [],
        require_current_manifest: false,
      }))).rejects.toMatchObject({ code: "CONFLICT" });

      await expect(store.appendDirectiveEvent(sealDirectiveAppend({
        run_id: runId,
        event: event("recommended", "projected", manifestDigest),
        expected_state: "recommended",
        control_surface_id: null,
        receipt_ids: [],
        require_current_manifest: false,
      }))).resolves.toMatchObject({ sequence: 2 });

      const secondManifest = manifestJson(2, manifestDigest);
      database.database.query(
        `INSERT INTO manifest_revisions(manifest_id, revision, run_id, parent_manifest_sha256, manifest_sha256, canonical_manifest_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(manifestId, 2, runId, manifestDigest, sha256Bytes(secondManifest), secondManifest, now);
      await expect(store.appendDirectiveEvent(sealDirectiveAppend({
        run_id: runId,
        event: event("projected", "queued", manifestDigest),
        expected_state: "projected",
        control_surface_id: null,
        receipt_ids: [],
        require_current_manifest: true,
      }))).rejects.toMatchObject({ code: "CONFLICT" });

      expect(await store.listDirectiveEvents(directiveId)).toHaveLength(2);
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects receipt row/digest mismatches instead of trusting receipt JSON", async () => {
    const directory = await mkdtemp("/tmp/mc-runtime-receipt-db-");
    const database = await openControlPlaneDatabase("repository", join(directory, "repository.sqlite"), now);
    try {
      database.database.query(
        "INSERT INTO repositories(repository_id, repository_root, display_name, created_at) VALUES (?, ?, ?, ?)",
      ).run("repository-1", "/repo", "Repo", now);
      database.database.query(
        `INSERT INTO runs(run_id, repository_id, mister_clean_version, detector_set_id, detector_set_sha256, observed_then_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(runId, "repository-1", "6.4.0", "detectors-1", sha("d"), "{}", now);
      database.database.query(
        `INSERT INTO manifest_revisions(manifest_id, revision, run_id, parent_manifest_sha256, manifest_sha256, canonical_manifest_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(manifestId, 1, runId, null, sha256Bytes(manifestJson(1)), manifestJson(1), now);
      const repository = {
        repository_id: "repository-1",
        branch: "work",
        commit: "abc",
        tree: "def",
        repository_object_sha256: sha("a"),
        observed_at: now,
      };
      const receiptJson = canonicalJson({
        receipt_id: "receipt-1",
        state: "verified",
        run_id: runId,
        manifest_id: manifestId,
        manifest_revision: 1,
        manifest_sha256: sha("f"),
        baseline_repository: repository,
        output_repository: { ...repository, repository_object_sha256: sha("9") },
        role: "holdout",
        actor: "holdout-agent",
        claims: ["verified"],
        conclusion: "pass",
        sealed_at: now,
        evidence: [{ path: "receipt.json", sha256: sha("1"), record_type: "mister-clean.receipt-evidence" }],
      });
      database.database.query(
        `INSERT INTO receipts(receipt_id, run_id, manifest_id, manifest_revision, repository_object_sha256, receipt_sha256, receipt_json, sealed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("receipt-1", runId, manifestId, 1, sha("9"), sha("0"), receiptJson, now);
      const store = new SqliteControlPlaneStore(database);
      await expect(store.getReceipt("receipt-1" as never)).rejects.toMatchObject({ code: "INTERNAL" });
      expect(sha256Bytes(receiptJson)).not.toBe(sha("0"));
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("returns verified-event receipt bindings from a continuous canonical event chain", async () => {
    const directory = await mkdtemp("/tmp/mc-runtime-events-db-");
    const database = await openControlPlaneDatabase("repository", join(directory, "repository.sqlite"), now);
    try {
      database.database.query(
        "INSERT INTO repositories(repository_id, repository_root, display_name, created_at) VALUES (?, ?, ?, ?)",
      ).run("repository-1", "/repo", "Repo", now);
      database.database.query(
        `INSERT INTO runs(run_id, repository_id, mister_clean_version, detector_set_id, detector_set_sha256, observed_then_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(runId, "repository-1", "6.4.0", "detectors-1", sha("d"), "{}", now);
      database.database.query(
        `INSERT INTO manifest_revisions(manifest_id, revision, run_id, parent_manifest_sha256, manifest_sha256, canonical_manifest_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(manifestId, 1, runId, null, sha256Bytes(manifestJson(1)), manifestJson(1), now);
      const store = new SqliteControlPlaneStore(database);
      const manifestDigest = sha256Bytes(manifestJson(1));
      const states: readonly DirectiveState[] = ["recommended", "projected", "queued", "delivered", "accepted", "running", "completed", "verified"];
      let from: DirectiveState | null = null;
      for (const to of states) {
        await store.appendDirectiveEvent(sealDirectiveAppend({
          run_id: runId,
          event: event(from, to, manifestDigest),
          expected_state: from,
          control_surface_id: null,
          receipt_ids: to === "verified" ? ["receipt-1" as never] : [],
          require_current_manifest: false,
        }));
        from = to;
      }
      const events = await store.listDirectiveEvents(directiveId);
      expect(events).toHaveLength(8);
      expect(events.at(-1)).toMatchObject({ to_state: "verified", receipt_ids: ["receipt-1"] });
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects direct mutation with arbitrary evidence or invalid canonical manifest bytes", async () => {
    const directory = await mkdtemp("/tmp/mc-runtime-bypass-db-");
    const database = await openControlPlaneDatabase("repository", join(directory, "repository.sqlite"), now);
    try {
      database.database.query(
        "INSERT INTO repositories(repository_id, repository_root, display_name, created_at) VALUES (?, ?, ?, ?)",
      ).run("repository-1", "/repo", "Repo", now);
      database.database.query(
        `INSERT INTO runs(run_id, repository_id, mister_clean_version, detector_set_id, detector_set_sha256, observed_then_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(runId, "repository-1", "6.4.0", "detectors-1", sha("d"), "{}", now);
      const bytes = manifestJson(1);
      const digest = sha256Bytes(bytes);
      database.database.query(
        `INSERT INTO manifest_revisions(manifest_id, revision, run_id, parent_manifest_sha256, manifest_sha256, canonical_manifest_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(manifestId, 1, runId, null, digest, bytes, now);
      const store = new SqliteControlPlaneStore(database);
      const raw = {
        run_id: runId,
        event: { ...event(null, "recommended", digest), evidence: [{ path: "invented.json", sha256: sha("7") }] },
        expected_state: null,
        control_surface_id: null,
        receipt_ids: [],
        require_current_manifest: false,
        transition_seal: Object.freeze({}),
      };
      await expect(store.appendDirectiveEvent(raw as never)).rejects.toThrow(/authority seal/);

      const invalidManifestId = "manifest-invalid" as ManifestId;
      const invalidCanonical = canonicalJson({ ...validManifestValue(), manifest_id: invalidManifestId });
      const invalidBytes = `${invalidCanonical}\n`;
      const invalidDigest = sha256Bytes(invalidBytes);
      database.database.query(
        `INSERT INTO manifest_revisions(manifest_id, revision, run_id, parent_manifest_sha256, manifest_sha256, canonical_manifest_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(invalidManifestId, 1, runId, null, invalidDigest, invalidBytes, now);
      await expect(store.appendDirectiveEvent(sealDirectiveAppend({
        run_id: runId,
        event: { ...event(null, "recommended", invalidDigest), manifest_id: invalidManifestId },
        expected_state: null,
        control_surface_id: null,
        receipt_ids: [],
        require_current_manifest: false,
      }))).rejects.toMatchObject({ code: "INTERNAL" });
      expect(await store.listDirectiveEvents(directiveId)).toHaveLength(0);
    } finally {
      database.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("SQLite agent qualification projection", () => {
  it("excludes identity-unbound trials from tuple capability credit", async () => {
    const directory = await mkdtemp("/tmp/mc-agent-credit-db-");
    const repository = await openControlPlaneDatabase("repository", join(directory, "repository.sqlite"), now);
    const global = await openControlPlaneDatabase("global", join(directory, "global.sqlite"), now);
    try {
      global.database.query(
        "INSERT INTO models(model_id, family, display_name, context_limit_tokens, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run("model-1", "family", "Model", 200000, "{}", now);
      global.database.query(
        "INSERT INTO harnesses(harness_id, display_name, version, supports_headless, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run("harness-1", "Harness", "1", 1, "{}", now);
      global.database.query(
        "INSERT INTO agent_tuples(agent_tuple_id, model_id, harness_id, reasoning_level, first_observed_at) VALUES (?, ?, ?, ?, ?)",
      ).run("tuple-1", "model-1", "harness-1", "high", now);
      global.database.query(
        "INSERT INTO inference_sources(inference_source_id, display_name, source_kind, machine_identity, endpoint, secret_ref, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run("source-1", "Source", "developer_plan", null, null, null, "{}", now);
      global.database.query(
        "INSERT INTO deployments(deployment_id, model_id, inference_source_id, provider_model_id, context_limit_tokens, max_concurrency, metadata_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run("deployment-1", "model-1", "source-1", "provider-model", 200000, 1, "{}", now);
      global.database.query(
        "INSERT INTO execution_routes(execution_route_id, agent_tuple_id, deployment_id, invocation_kind, invocation_adapter, headless_supported, secret_ref, route_json, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run("route-1", "tuple-1", "deployment-1", "harness", "adapter", 1, null, "{}", now);
      global.database.query(
        "INSERT INTO capabilities(capability_id, family, label, description, taxonomy_version) VALUES (?, ?, ?, ?, ?)",
      ).run("root_cause_analysis", "discovery_judgment", "Root cause", "Find common causes", "1.0");
      const insertEvaluator = global.database.query(
        "INSERT INTO capability_evaluators(evaluator_id, capability_id, question, evaluator_version, active, evaluation_dimension, independent_evaluator) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      for (const [id, dimension, independent] of [
        ["eval-success", "verified_success", 0],
        ["eval-independent", "independent_evaluation", 1],
        ["eval-no-harm", "no_harm", 0],
        ["eval-authority", "authority", 0],
      ]) {
        insertEvaluator.run(id, "root_cause_analysis", `${dimension} check`, "1", 1, dimension, independent);
      }
      const insertRetainedEvidence = global.database.query(
        "INSERT INTO agent_evaluation_evidence(evidence_sha256, media_type, evidence_bytes, byte_length, retained_at) VALUES (?, ?, ?, ?, ?)",
      );
      const retain = (label: string): string => {
        const bytes = Buffer.from(`retained:${label}`, "utf8");
        const digest = sha256Bytes(bytes);
        insertRetainedEvidence.run(digest, "application/json", bytes, bytes.byteLength, now);
        return digest;
      };
      const dispatchDigest = retain("dispatch");
      const evaluationDigest = retain("evaluation");
      const trialDigest = retain("trial");
      const evaluatorDigests = new Map(["eval-success", "eval-independent", "eval-no-harm", "eval-authority"].map((id) => [id, retain(id)]));

      const insertObservation = global.database.query(
        `INSERT INTO agent_identity_observations(observation_id, identity_lease_id, phase, requested_agent_tuple_id, execution_route_id, observed_model_id, observed_harness_id, observed_reasoning_level, evidence_kind, evidence_sha256, observer_actor_id, control_surface_token, harness_session_token, process_instance_token, intended_surface_label, worker_self_report, observed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertLeaseEvent = global.database.query(
        `INSERT INTO agent_identity_lease_events(event_id, identity_lease_id, requested_agent_tuple_id, execution_route_id, observation_id, event_kind, reason, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      insertObservation.run("ob-dispatch", "lease-bound", "pre_dispatch", "tuple-1", "route-1", "model-1", "harness-1", "high", "external_visual_readback", dispatchDigest, "dispatch-observer", null, "session", "process", null, null, "2026-08-26T11:00:00.000Z");
      insertObservation.run("ob-evaluation", "lease-bound", "pre_evaluation", "tuple-1", "route-1", "model-1", "harness-1", "high", "external_visual_readback", evaluationDigest, "evaluation-observer", null, "session", "process", null, null, "2026-08-26T11:00:01.000Z");
      insertLeaseEvent.run("lease-issued", "lease-bound", "tuple-1", "route-1", null, "issued", null, "2026-08-26T11:00:00.000Z");
      insertLeaseEvent.run("lease-dispatch", "lease-bound", "tuple-1", "route-1", "ob-dispatch", "pre_dispatch_bound", null, "2026-08-26T11:00:00.000Z");
      insertLeaseEvent.run("lease-evaluation", "lease-bound", "tuple-1", "route-1", "ob-evaluation", "pre_evaluation_bound", null, "2026-08-26T11:00:01.000Z");

      const insertRun = global.database.query(
        `INSERT INTO agent_run_events(run_event_id, source_run_token, repository_cohort_token, agent_tuple_id, execution_route_id, identity_lease_id, capability_id, qualification_at_dispatch, post_clearance_run_ordinal, evaluation_required, evaluation_reason, operational_telemetry_json, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertTrial = global.database.query(
        `INSERT INTO trials(trial_id, run_event_id, agent_tuple_id, capability_id, repository_cohort_token, verified_success, independent_evaluation, no_harm_violation, authority_violation, identity_disposition, contributes_quality_credit, evaluation_json, evidence_sha256, completed_at, worker_actor_id, author_actor_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertTrialEvaluation = global.database.query(
        "INSERT INTO trial_evaluations(trial_id, evaluator_id, result, evidence_sha256, evaluator_actor_id) VALUES (?, ?, ?, ?, ?)",
      );
      insertRun.run("event-bound", "run-bound", "cohort", "tuple-1", "route-1", "lease-bound", "root_cause_analysis", "EVALUATING", null, 1, "pre_clearance_every_run", "{}", now);
      // Caller-populated trial booleans are deliberately contradictory. The
      // projection must derive success, independence, no-harm, and authority
      // eligibility from evaluator records instead.
      insertTrial.run("trial-bound", "event-bound", "tuple-1", "root_cause_analysis", "cohort", 0, 0, 1, 1, "BOUND_FOR_EVALUATION", 1, "{}", trialDigest, now, "worker", "author");
      for (const evaluatorId of ["eval-success", "eval-independent", "eval-no-harm", "eval-authority"]) {
        insertTrialEvaluation.run("trial-bound", evaluatorId, 1, evaluatorDigests.get(evaluatorId), "independent-evaluator");
      }
      expect(() => insertObservation.run("ob-invalid-digest", "lease-invalid-digest", "pre_dispatch", "tuple-1", "route-1", "model-1", "harness-1", "high", "external_visual_readback", sha("z"), "observer", null, "session-invalid-digest", "process-invalid-digest", null, null, "2026-08-26T11:00:00.000Z")).toThrow("identity observation evidence_sha256 must be canonical lowercase SHA-256");
      expect(() => insertTrialEvaluation.run("trial-bound", "eval-success", 1, sha("y"), "independent-evaluator")).toThrow("trial evaluation evidence_sha256 must be canonical lowercase SHA-256");
      insertRun.run("event-unbound", "run-unbound", "cohort", "tuple-1", "route-1", "lease-unbound", "root_cause_analysis", "EVALUATING", null, 1, "route_identity_change", "{}", now);
      insertTrial.run("trial-unbound", "event-unbound", "tuple-1", "root_cause_analysis", "cohort", 0, 1, 1, 0, "IDENTITY_UNBOUND", 0, "{}", sha("b"), now, null, null);

      const [agent] = await new SqliteControlPlaneStore(repository, global).listAgents(null, 10);
      expect(agent?.capabilities).toEqual([{
        capability_id: "root_cause_analysis",
        trial_count: 1,
        verified_success_count: 1,
        repository_cohort_count: 1,
        independently_evaluated: true,
        qualification: "EVALUATING",
        no_harm_violation_count: 0,
        authority_violation_count: 0,
        qualification_provenance: {
          credited_trial_ids: ["trial-bound"],
          pre_dispatch_observation_ids: ["ob-dispatch"],
          pre_evaluation_observation_ids: ["ob-evaluation"],
          pre_dispatch_observed_at: ["2026-08-26T11:00:00.000Z"],
          pre_evaluation_observed_at: ["2026-08-26T11:00:01.000Z"],
          pre_dispatch_evidence_digests: [dispatchDigest],
          pre_evaluation_evidence_digests: [evaluationDigest],
          trial_evidence_digests: [trialDigest],
          evaluation_evidence_digest_sets: [["eval-authority", "eval-independent", "eval-no-harm", "eval-success"].map((id) => evaluatorDigests.get(id)!)],
          worker_actor_ids: ["worker"],
          author_actor_ids: ["author"],
          pre_dispatch_observer_actor_ids: ["dispatch-observer"],
          pre_evaluation_observer_actor_ids: ["evaluation-observer"],
          evaluator_actor_ids: ["independent-evaluator"],
        },
      }]);

      for (let index = 0; index < 50; index += 1) {
        const suffix = `same-${index}`;
        const lease = `lease-${suffix}`;
        const dispatchId = `dispatch-${suffix}`;
        const evaluationId = `evaluation-${suffix}`;
        const dispatchAt = new Date(Date.parse("2026-08-26T13:00:00.000Z") + index * 2_000).toISOString();
        const evaluationAt = new Date(Date.parse(dispatchAt) + 1_000).toISOString();
        insertObservation.run(dispatchId, lease, "pre_dispatch", "tuple-1", "route-1", "model-1", "harness-1", "high", "external_visual_readback", retain(`${suffix}-dispatch`), "same-actor", null, `session-${suffix}`, `process-${suffix}`, null, null, dispatchAt);
        insertObservation.run(evaluationId, lease, "pre_evaluation", "tuple-1", "route-1", "model-1", "harness-1", "high", "external_visual_readback", retain(`${suffix}-evaluation`), "same-actor", null, `session-${suffix}`, `process-${suffix}`, null, null, evaluationAt);
        insertLeaseEvent.run(`issued-${suffix}`, lease, "tuple-1", "route-1", null, "issued", null, dispatchAt);
        insertLeaseEvent.run(`bound-dispatch-${suffix}`, lease, "tuple-1", "route-1", dispatchId, "pre_dispatch_bound", null, dispatchAt);
        insertLeaseEvent.run(`bound-evaluation-${suffix}`, lease, "tuple-1", "route-1", evaluationId, "pre_evaluation_bound", null, evaluationAt);
        insertRun.run(`event-${suffix}`, `run-${suffix}`, `cohort-${index % 3}`, "tuple-1", "route-1", lease, "root_cause_analysis", "EVALUATING", null, 1, "pre_clearance_every_run", "{}", dispatchAt);
        insertTrial.run(`trial-${suffix}`, `event-${suffix}`, "tuple-1", "root_cause_analysis", `cohort-${index % 3}`, 1, 1, 0, 0, "BOUND_FOR_EVALUATION", 1, "{}", retain(`${suffix}-trial`), evaluationAt, "same-actor", "same-actor");
        for (const evaluatorId of ["eval-success", "eval-independent", "eval-no-harm", "eval-authority"]) {
          insertTrialEvaluation.run(`trial-${suffix}`, evaluatorId, 1, retain(`${suffix}-${evaluatorId}`), "same-actor");
        }
      }
      const [afterSameActorTrials] = await new SqliteControlPlaneStore(repository, global).listAgents(null, 10);
      expect(afterSameActorTrials?.capabilities[0]?.trial_count).toBe(1);

      insertRun.run("event-replay", "run-replay", "cohort", "tuple-1", "route-1", "lease-bound", "root_cause_analysis", "EVALUATING", null, 1, "pre_clearance_every_run", "{}", now);
      expect(() => insertTrial.run("trial-replay", "event-replay", "tuple-1", "root_cause_analysis", "cohort", 1, 1, 0, 0, "BOUND_FOR_EVALUATION", 1, "{}", sha("e"), now, "worker", "author")).toThrow("identity lease observations cannot be replayed into multiple credited trials");

      const missingDispatchDigest = retain("missing-dispatch");
      const missingEvaluationDigest = retain("missing-evaluation");
      const missingTrialDigest = retain("missing-trial");
      const missingEvaluatorDigests = new Map(["eval-success", "eval-independent", "eval-no-harm", "eval-authority"].map((id) => [id, retain(`missing-${id}`)]));
      insertObservation.run("ob-no-evaluator-dispatch", "lease-no-evaluator", "pre_dispatch", "tuple-1", "route-1", "model-1", "harness-1", "high", "external_visual_readback", missingDispatchDigest, "missing-dispatch-observer", null, "session-no-evaluator", "process-no-evaluator", null, null, "2026-08-26T11:02:00.000Z");
      insertObservation.run("ob-no-evaluator-evaluation", "lease-no-evaluator", "pre_evaluation", "tuple-1", "route-1", "model-1", "harness-1", "high", "external_visual_readback", missingEvaluationDigest, "missing-evaluation-observer", null, "session-no-evaluator", "process-no-evaluator", null, null, "2026-08-26T11:02:01.000Z");
      insertLeaseEvent.run("lease-no-evaluator-issued", "lease-no-evaluator", "tuple-1", "route-1", null, "issued", null, "2026-08-26T11:02:00.000Z");
      insertLeaseEvent.run("lease-no-evaluator-dispatch", "lease-no-evaluator", "tuple-1", "route-1", "ob-no-evaluator-dispatch", "pre_dispatch_bound", null, "2026-08-26T11:02:00.000Z");
      insertLeaseEvent.run("lease-no-evaluator-evaluation", "lease-no-evaluator", "tuple-1", "route-1", "ob-no-evaluator-evaluation", "pre_evaluation_bound", null, "2026-08-26T11:02:01.000Z");
      insertRun.run("event-no-evaluator", "run-no-evaluator", "cohort", "tuple-1", "route-1", "lease-no-evaluator", "root_cause_analysis", "EVALUATING", null, 1, "pre_clearance_every_run", "{}", now);
      insertTrial.run("trial-no-evaluator", "event-no-evaluator", "tuple-1", "root_cause_analysis", "cohort", 1, 1, 0, 0, "BOUND_FOR_EVALUATION", 1, "{}", missingTrialDigest, now, "missing-worker", "missing-author");
      const [afterMissingEvaluation] = await new SqliteControlPlaneStore(repository, global).listAgents(null, 10);
      expect(afterMissingEvaluation?.capabilities[0]?.trial_count).toBe(1);

      insertLeaseEvent.run("lease-mismatch", "lease-bound", "tuple-1", "route-1", "ob-evaluation", "mismatch", "forensic route mismatch discovered later", "2026-08-26T12:00:30.000Z");
      const [afterMismatch] = await new SqliteControlPlaneStore(repository, global).listAgents(null, 10);
      expect(afterMismatch?.capabilities).toEqual([]);

      insertLeaseEvent.run("lease-invalidated", "lease-bound", "tuple-1", "route-1", null, "invalidated", "harness_restart", "2026-08-26T12:01:00.000Z");
      insertRun.run("event-after-invalidation", "run-after", "cohort", "tuple-1", "route-1", "lease-bound", "root_cause_analysis", "EVALUATING", null, 1, "route_identity_change", "{}", "2026-08-26T12:02:00.000Z");
      expect(() => insertTrial.run("trial-after-invalidation", "event-after-invalidation", "tuple-1", "root_cause_analysis", "cohort", 1, 1, 0, 0, "BOUND_FOR_EVALUATION", 1, "{}", sha("e"), "2026-08-26T12:03:00.000Z", "worker", "author")).toThrow("mismatched or invalidated identity lease cannot receive quality credit");
      insertTrial.run("trial-after-invalidation", "event-after-invalidation", "tuple-1", "root_cause_analysis", "cohort", 1, 1, 0, 0, "INVALIDATED", 0, "{}", sha("e"), "2026-08-26T12:03:00.000Z", null, null);
      const [afterInvalidation] = await new SqliteControlPlaneStore(repository, global).listAgents(null, 10);
      expect(afterInvalidation?.capabilities).toEqual([]);

      // Completing the previously evaluator-less trial demonstrates that a
      // valid independently evaluated trial projects once its evidence exists.
      for (const evaluatorId of ["eval-success", "eval-independent", "eval-no-harm", "eval-authority"]) {
        insertTrialEvaluation.run("trial-no-evaluator", evaluatorId, 1, missingEvaluatorDigests.get(evaluatorId), "missing-independent-evaluator");
      }
      const [afterEvaluation] = await new SqliteControlPlaneStore(repository, global).listAgents(null, 10);
      expect(afterEvaluation?.capabilities[0]?.trial_count).toBe(1);
    } finally {
      repository.close();
      global.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
