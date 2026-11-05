import { mkdir, readFile, rename, rm, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  nodeBundlePorts,
  nodeFilePort,
  nodeGitPort,
  validateBundle as validateBundleRaw,
  validateBundleFile,
  type BundlePorts,
} from "./bundle.js";
import { auditPlanningRepository, type PlanningAuditResult } from "./planning.js";
import {
  prepareCloseout as prepareCloseoutBound,
  type PrepareCloseoutOptions,
} from "./prepare.js";
import { validateReport } from "./records.js";
import {
  detectorRegistrySha256,
  semanticFindingFingerprint,
} from "./detector-coverage.js";
import { captureRepositoryObject, type RepositoryObject } from "./repository-object.js";
import type { ActionHygieneProcessPort } from "./action-hygiene.js";
import {
  canonicalObservationId,
  canonicalRootDebtKey,
  deriveActionObservationSets,
  deriveRegressionAccounting,
} from "./regression-accounting.js";
import {
  COVERAGE_SCHEMA_VERSION,
  discoverNativeGates,
  nativeGateFailureObservations,
} from "./native-gates.js";
import { runNativeGates } from "./native-gate-runner.js";
import { validateNativeGateCoverage } from "./native-gate-validation.js";
import { mintServerAttestationBinding } from "../runtime-binding.js";
import { captureFileCensus } from "../census.js";
import {
  createOpenGuardValidationFixture,
  testSha256,
  writeCanonicalTestRecord,
  type OpenGuardValidationFixture,
  type TestRecord,
} from "./guard-authority.test-fixture.js";
import {
  COMPARATOR_RESULT_BYTES,
  FIXTURE_DETECTORS,
  NOW,
  TEST_PROCESS_PORT,
  TEST_RUNTIME_ATTESTATION,
  TEST_RUNTIME_IDENTITY_SHA256,
  canonicalDigest,
  digest,
  execute,
  fixture,
  git,
  persistRegressionMutation,
  publicSafetyDebtFixture,
  put,
  putJson,
  rebind,
  ref,
  removeTemporaryRoots,
  successor,
  temporaryRoots,
  validateBundle,
  type ComparatorObservationRecord,
  type Fixture,
  type RecordValue,
} from "./bundle.test-fixture.js";

const MIDDLE = "2026-08-25T09:00:01Z";
const AFTER = "2026-08-25T09:00:02Z";
const VALIDATION_TIME = new Date("2026-08-25T09:00:10Z");
const WITHIN_FUTURE_SKEW = "2026-08-25T09:00:10.500Z";
const BEYOND_FUTURE_SKEW = "2026-08-25T09:00:11.001Z";

function prepareCloseout(options: Omit<PrepareCloseoutOptions, "runtimeAttestation">) {
  return prepareCloseoutBound({ ...options, processPort: options.processPort ?? TEST_PROCESS_PORT, runtimeAttestation: TEST_RUNTIME_ATTESTATION });
}

function repositoryObjectAt(base: RepositoryObject, sha256: string): RepositoryObject {
  return { ...base, sha256 };
}

function comparatorObservation(
  phase: "before" | "intermediate" | "after",
  object: string,
  command: string,
  detector: string,
  findings: readonly string[],
  result: string,
  observedAt: string,
  repositoryObject?: RepositoryObject,
  actionId = "A-1",
  comparatorId = "git-status",
): RecordValue {
  let resultBytes = result;
  if (repositoryObject) {
    let detectorResult: RecordValue;
    try {
      const parsed: unknown = JSON.parse(result);
      detectorResult = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as RecordValue
        : { output: parsed };
    } catch {
      detectorResult = { output: result };
    }
    resultBytes = JSON.stringify({
      ...detectorResult,
      action_id: actionId,
      comparator_id: comparatorId,
      phase,
      object,
      repository_object: repositoryObject,
    });
  }
  const resultSha256 = digest(resultBytes);
  return {
    phase,
    object,
    ...(repositoryObject === undefined ? {} : {
      action_id: actionId,
      comparator_id: comparatorId,
      repository_object: repositoryObject,
    }),
    command_sha256: digest(command),
    detector_registry_sha256: digest(detector),
    runtime_identity_sha256: TEST_RUNTIME_IDENTITY_SHA256,
    result_sha256: resultSha256,
    result_ref: { path: `comparator-results/${resultSha256}.txt`, sha256: resultSha256 },
    finding_fingerprints: [...findings].sort(),
    exit_code: 0,
    observed_at: observedAt,
    [COMPARATOR_RESULT_BYTES]: resultBytes,
  };
}

function registeredComparator(
  detectorId: "github_actions" | "planning_graph" | "public_safety" | "semantic_boundary",
  beforeObject: RepositoryObject,
  afterObject: RepositoryObject,
  id = `${detectorId}-comparator`,
  actionId = "A-1",
): RecordValue {
  const spec = FIXTURE_DETECTORS.find((candidate) => candidate.id === detectorId);
  if (!spec) throw new Error(`missing fixture detector ${detectorId}`);
  const result = JSON.stringify(detectorId === "planning_graph"
    ? {
      artifactCount: 0,
      candidate_probe_count: 0,
      counts: {},
      exitCode: 0,
      findings: [],
      planningRootCount: 0,
      raw_finding_count: 0,
      raw_findings: [],
      root_debt_count: 0,
      root_debts: [],
      status: "not_applicable",
      structuredArtifactCount: 0,
      suppressed_by_typed_nonartifact_count: 0,
    }
    : detectorId === "public_safety"
      ? {
        exitCode: 0,
        findings: [],
        scope: "tracked_shippable",
        status: "pass",
        tracked_path_count: 0,
        tracked_paths_sha256: digest(""),
        unassessed: [],
      }
      : detectorId === "github_actions"
        ? {
          record_type: "mister-clean.github-actions-audit",
          schema_version: "1.0",
          status: "not_applicable",
          exitCode: 0,
          workflow_count: 0,
          sensitive_workflow_count: 0,
          findings: [],
        }
        : {
      candidate_probe_count: 0,
      candidate_set_sha256: digest("[]"),
      candidates: [],
      confirmed_failure_count: 0,
      executed_probe_count: 0,
      executions: [],
      exitCode: 0,
      findings: [],
      pending_probe_count: 0,
      resolved_probe_count: 0,
      resolutions: [],
      snapshot: "a".repeat(40),
      status: "not_applicable",
      working_tree_sha256: digest("fixture-tree"),
    });
  return {
    id,
    detector_id: detectorId,
    command: spec.command,
    scope: spec.scope,
    detector: spec.detector,
    observations: [
      comparatorObservation("before", beforeObject.sha256, spec.command, spec.detector, [], result, NOW, beforeObject, actionId, id),
      comparatorObservation("after", afterObject.sha256, spec.command, spec.detector, [], result, AFTER, afterObject, actionId, id),
    ],
  };
}

async function acceptedReleaseBoundaryFixture(
  report: RecordValue,
  manifest: RecordValue,
): Promise<{ bundle: RecordValue; bundlePath: string; missingRepo: string }> {
  const root = join(tmpdir(), `mister-clean-accepted-boundary-${crypto.randomUUID()}`);
  temporaryRoots.push(root);
  await mkdir(root, { recursive: true });
  const reportBytes = `${JSON.stringify(report)}\n`;
  const manifestBytes = `${JSON.stringify(manifest)}\n`;
  await Promise.all([
    put(join(root, "report.json"), reportBytes),
    put(join(root, "manifest.json"), manifestBytes),
  ]);
  return {
    bundlePath: join(root, "bundle.json"),
    missingRepo: join(root, "candidate-not-present"),
    bundle: {
      record_type: "mister-clean.closure-bundle",
      schema_version: "1.0",
      run_id: "accepted-boundary-test",
      request_ref: "request-1",
      report: { path: "report.json", sha256: digest(reportBytes) },
      manifest: { path: "manifest.json", sha256: digest(manifestBytes) },
      custody: {},
      criteria_discovery: {},
      change_inventory: {},
      planning_discovery: {},
      successor_readiness: {},
    },
  };
}

function executedAction(target = "CURRENT-STATE.md"): RecordValue {
  return {
    id: "A-1", kind: "doc_update", target, purpose: "prepare successor state", risk: "reversible_local",
    authorization: { state: "granted", source: "skill_invocation", ref: "request-1" },
    preconditions: ["repository inspected"], verification: ["target verified"], status: "executed",
    outcome: { state: "verified", evidence: [{ kind: "git_change", object: target, command: "verify target digest", result: "pass", observed_at: NOW, evidence_ref: ref("action-result-A-1.json") }] },
  };
}

function useLegacyRegression(value: Fixture, schemaVersion: "1.2" | "1.3" | "1.4"): void {
  value.regression.schema_version = schemaVersion;
  const control = value.report.regression_control as RecordValue;
  delete control.accounting_schema;
  delete value.regression.accounting;
  const legacyCounts = {
    baseline_findings: 0, closing_findings: 0, baseline_paid: 0, baseline_open: 0,
    newly_discovered_preexisting_paid: 0, newly_discovered_preexisting_open: 0,
    concurrent_external_paid: 0, concurrent_external_open: 0,
    introduced_by_run_paid: 0, introduced_by_run_open: 0,
  };
  Object.assign(control, legacyCounts, { action_checks: 0 });
  Object.assign(value.regression, legacyCounts);
  if (schemaVersion === "1.2" || schemaVersion === "1.3") {
    value.regression.baseline_object = value.head;
    value.regression.closing_object = value.head;
    control.baseline_object = value.head;
    control.closing_object = value.head;
    delete control.baseline_repository_object;
    delete control.closing_repository_object;
    const snapshots = successor(value).snapshots as RecordValue;
    for (const name of ["start", "end"] as const) {
      const snapshot = snapshots[name] as RecordValue;
      snapshot.object = value.head;
      snapshot.result = value.head;
    }
  }
}

function modernizeActionAccounting(value: Fixture): void {
  const accounting = value.regression.accounting as RecordValue;
  const observationLedger = accounting.observation_ledger as RecordValue;
  const baseline = [...((observationLedger.baseline_observation_ids ?? []) as string[])];
  const closing = new Set(baseline);
  const actions = (value.regression.action_checks as RecordValue[]).map((check) => {
    const before = new Set<string>();
    const intermediate = new Set<string>();
    const after = new Set<string>();
    for (const comparator of check.comparators as RecordValue[]) {
      const spec = FIXTURE_DETECTORS.find((candidate) => candidate.id === comparator.detector_id);
      if (!spec) continue;
      for (const observation of comparator.observations as RecordValue[]) {
        const target = observation.phase === "before" ? before : observation.phase === "after" ? after : intermediate;
        for (const fingerprint of observation.finding_fingerprints as string[]) {
          target.add(canonicalObservationId({
            source_id: spec.detector,
            source_native_fingerprint: fingerprint,
          }));
        }
      }
    }
    const derived = deriveActionObservationSets(String(check.action_id), [
      { phase: "before", observation_ids: [...before] },
      ...(intermediate.size > 0 ? [{ phase: "intermediate" as const, observation_ids: [...intermediate] }] : []),
      { phase: "after", observation_ids: [...after] },
    ]);
    Object.assign(check, derived);
    delete check.introduced;
    delete check.paid_before_boundary;
    delete check.open_at_boundary;
    for (const id of derived.before_observation_ids) closing.delete(id);
    for (const id of derived.closing_observation_ids) closing.add(id);
    return derived;
  });
  value.regression.accounting = deriveRegressionAccounting({
    repo_id: String((value.report.repo as RecordValue).id),
    baseline_observation_ids: baseline,
    closing_observation_ids: [...closing],
    action_observations: actions,
    root_debts: (value.report.completion_debts ?? []) as never[],
  });
}

async function materializeNativeGateControl(
  value: Fixture,
  label: string,
  repositoryObject: RepositoryObject,
): Promise<RecordValue> {
  const recordRoot = `native-gates/${label}-${repositoryObject.sha256}`;
  const evidenceRoot = `${recordRoot}/output`;
  const absoluteEvidenceRoot = join(value.proof, evidenceRoot);
  await mkdir(absoluteEvidenceRoot, { recursive: true });
  const discovery = discoverNativeGates(value.repo, repositoryObject);
  const coverage = await runNativeGates(
    value.repo,
    discovery,
    absoluteEvidenceRoot,
    { now: () => new Date(NOW) },
  );
  const validationErrors = await validateNativeGateCoverage(
    coverage,
    discovery,
    repositoryObject,
    absoluteEvidenceRoot,
    { validation_time: new Date(NOW), require_passing: false },
  );
  const validation = {
    record_type: "mister-clean.native-gate-validation",
    schema_version: "1.0",
    discovery_sha256: discovery.catalog_sha256,
    coverage_sha256: coverage.coverage_sha256,
    status: validationErrors.length === 0 ? "pass" : "fail",
    errors: validationErrors,
    observed_at: NOW,
  };
  const records = {
    discovery: { path: `${recordRoot}/discovery.json`, value: discovery },
    coverage: { path: `${recordRoot}/coverage.json`, value: coverage },
    validation: { path: `${recordRoot}/validation.json`, value: validation },
  } as const;
  await Promise.all(Object.values(records).map(async (record) => {
    await putJson(join(value.proof, record.path), record.value);
  }));
  return {
    discovery_ref: {
      path: records.discovery.path,
      sha256: digest(await readFile(join(value.proof, records.discovery.path))),
    },
    coverage_ref: {
      path: records.coverage.path,
      sha256: digest(await readFile(join(value.proof, records.coverage.path))),
    },
    validation_ref: {
      path: records.validation.path,
      sha256: digest(await readFile(join(value.proof, records.validation.path))),
    },
    evidence_root: evidenceRoot,
    required_count: discovery.required_gate_ids.length,
    passed_count: coverage.executions.filter((execution) => execution.state === "passed").length,
    absent_count: discovery.gates.filter((gate) => gate.disposition === "absent").length,
    validation_error_count: validationErrors.length,
  };
}

interface ChangedNativeActionFixture {
  readonly value: Fixture;
  readonly before: RepositoryObject;
  readonly after: RepositoryObject;
  readonly baselineControl: RecordValue;
  readonly afterControl: RecordValue;
}

type NativeGateMutation = "fail" | "weaken" | "semantic_weaken";

async function changedNativeActionFixture(): Promise<ChangedNativeActionFixture> {
  const value = await fixture();
  const start = value.head;
  const before = value.repositoryObject;
  const baselineControl = await materializeNativeGateControl(value, "baseline", before);
  const currentState = "Current, verified, and successor-ready after A-1.\n";
  await put(join(value.repo, "CURRENT-STATE.md"), currentState);
  await git(value.repo, "add", "CURRENT-STATE.md");
  await git(value.repo, "commit", "-m", "update successor state");
  const head = await git(value.repo, "rev-parse", "HEAD");
  rebind(value, head, start);
  const after = value.repositoryObject;
  (successor(value).current_state as RecordValue).sha256 = digest(currentState);
  const action = executedAction();
  value.report.actions = [action];
  value.manifest.actions = [action];
  value.manifest.execution_state = "executed";
  value.bundle.change_inventory = {
    start_commit: start,
    subject_commit: head,
    changes: [{ status: "M", path: "CURRENT-STATE.md", action_ids: ["A-1"], exclusion: null }],
  };
  value.regression.action_checks = [{
    action_id: "A-1",
    before_object: before.sha256,
    before_repository_object: before,
    after_object: after.sha256,
    after_repository_object: after,
    comparators: FIXTURE_DETECTORS.map((detector) => registeredComparator(
      detector.id,
      before,
      after,
      `${detector.id}-comparator`,
      "A-1",
    )),
    boundary_status: "closed",
    observed_at: AFTER,
  }];
  const afterControl = await materializeNativeGateControl(value, "after-A-1", after);
  modernizeActionAccounting(value);
  await value.persist();
  value.regression.baseline_native_gate_control = baselineControl;
  (value.regression.action_checks as RecordValue[])[0]!.native_gate_control = afterControl;
  successor(value).native_gate_control = afterControl;
  await persistRegressionMutation(value);
  return { value, before, after, baselineControl, afterControl };
}

type PreparedGuardFixture = OpenGuardValidationFixture;

async function preparedGuardFixture(): Promise<PreparedGuardFixture> {
  const root = join(tmpdir(), `mister-clean-guard-${crypto.randomUUID()}`);
  temporaryRoots.push(root);
  return createOpenGuardValidationFixture({ root, runtimeAttestation: TEST_RUNTIME_ATTESTATION });
}

async function crossPreparedGuardFixture(
  value: PreparedGuardFixture,
  options: { readonly repairDescendant?: boolean } = {},
): Promise<string> {
  const baseline = String(value.candidate.baseline_commit);
  const before = value.candidate.repository_object as RepositoryObject;
  if (options.repairDescendant) {
    await git(value.repo, "commit", "-m", "bypass commit later claimed as repaired");
    await git(value.repo, "commit", "--allow-empty", "-m", "retroactive authority repair descendant");
  } else {
    await git(value.repo, "commit", "-m", "cross approved GUARD candidate");
  }
  const resultCommit = await git(value.repo, "rev-parse", "HEAD");
  const resultTree = await git(value.repo, "rev-parse", "HEAD^{tree}");
  const after = captureRepositoryObject(value.repo);
  const evidenceRef = { path: "criteria-source.json", sha256: testSha256(await readFile(join(value.bundleDirectory, "criteria-source.json"))) };
  const domainDigest = "8".repeat(64);
  const lane = {
    id: "integrator", task_id: value.authority.tuple.task_id, owner: "fixture-integrator", role: "integrator", state: "active",
    execution_class: "hosted", model: "fixture-model", reasoning: "high", harness: "fixture-harness",
    safe_context_limit_tokens: 131072, estimated_context_tokens: 4096, evaluation_mode: "naturalistic",
    routing_reason: "permanent exact-tree fixture", worktree: value.repo, branch: "main", baseline_commit: baseline,
    read_paths: ["**/*"], write_paths: ["**/*"],
    coordination_claims: [{ key: "integration-target", access: "write", expected_version: 1, expected_state_digest: domainDigest, operation_class: "cross-guard", commutes_with: [], commutativity_ref: null }],
    dependencies: [], invariants: ["approved tree remains exact"], acceptance: ["one-parent commit matches approved tree"],
    bootstrap: { worktree: value.repo, branch: "main", head: baseline, observed_at: "2026-08-25T08:58:30Z", evidence_ref: evidenceRef },
  };
  const cas = {
    compare_and_swap: true, target_ref: "refs/heads/main", expected_target_commit: baseline,
    observed_target_commit: baseline, candidate_commit: resultCommit, result: "applied", result_commit: resultCommit,
    mutex: {
      resource: "refs/heads/main", holder_lane_id: "integrator", lease_id: "fixture-lease", fencing_token: 1,
      acquired_at: "2026-08-25T08:59:31Z", mutation_observed_at: "2026-08-25T08:59:32Z",
      expires_at: "2026-08-25T09:01:00Z", released_at: "2026-08-25T08:59:33Z",
    },
  };
  const action = {
    id: "OP-COMMIT", kind: "git_commit", target: "repository", purpose: "cross exact-tree GUARD",
    risk: "reversible_local", authorization: { state: "granted", source: "skill_invocation", ref: value.manifest.request_ref },
    preconditions: ["approved candidate tree"], verification: ["one-parent result commit and tree verified"], status: "executed",
    lane_id: "integrator", task_id: value.authority.tuple.task_id, parent_operation_ids: [], before_object: baseline,
    after_object: resultCommit, recorded_at: "2026-08-25T08:59:32Z",
    guard_commit: {
      candidate_tree: value.candidate.candidate_tree, commit: resultCommit, commit_tree: resultTree,
      receipt_ids: structuredClone(value.manifest.guard.commit_barrier.receipt_ids), evidence_ref: evidenceRef,
    },
    cas,
    outcome: {
      state: "verified",
      evidence: [{
        kind: "git_change", object: resultCommit, command: "git commit", result: "one-parent commit created",
        observed_at: "2026-08-25T08:59:32Z", evidence_ref: { path: "guard-commit-result.json", sha256: "pending" },
      }],
    },
  };
  const actionResult = {
    record_type: "mister-clean.action-result", action_id: action.id, kind: action.kind, target: action.target,
    object: resultCommit, command: "git commit", result: "one-parent commit created", observed_at: "2026-08-25T08:59:32Z",
  };
  await putJson(join(value.bundleDirectory, "guard-commit-result.json"), actionResult);
  action.outcome.evidence[0]!.evidence_ref.sha256 = testSha256(await readFile(join(value.bundleDirectory, "guard-commit-result.json")));

  value.manifest.repo.commit = resultCommit;
  value.manifest.execution_state = "executed";
  value.manifest.actions = [action];
  value.manifest.coordination.domains = [{ key: "integration-target", version: 1, state_digest: domainDigest, observed_at: "2026-08-25T08:58:30Z", evidence_ref: evidenceRef }];
  value.manifest.coordination.lanes = [lane];
  value.manifest.guard.status = "crossed";
  value.manifest.guard.commit_barrier.state = "crossed";
  value.manifest.guard.commit_barrier.crossed_action_id = action.id;
  value.report.repo.commit = resultCommit;
  value.report.actions = [structuredClone(action)];
  Object.assign(value.report.target_binding, {
    target_commit: resultCommit, candidate_commit: resultCommit, merge_base: resultCommit,
    target_commits_missing: 0, candidate_commits_ahead: 0, target_incorporated: true,
  });
  value.bundle.custody.subject_commit = resultCommit;
  value.bundle.change_inventory = {
    start_commit: baseline, subject_commit: resultCommit,
    changes: [{ status: "M", path: "CURRENT-STATE.md", action_ids: [action.id], exclusion: null }],
  };
  const successor = value.bundle.successor_readiness as TestRecord;
  Object.assign(successor.snapshots.start, { object: baseline, commit: baseline, result: baseline });
  Object.assign(successor.snapshots.end, { object: resultCommit, repository_object: after, commit: resultCommit, result: resultCommit });
  successor.current_state.commit = resultCommit;
  successor.current_state.sha256 = testSha256(await readFile(join(value.repo, "CURRENT-STATE.md")));
  successor.target_observation.observed_commit = resultCommit;
  successor.target_observation.current_commit = resultCommit;
  for (const worktree of successor.topology.worktrees as TestRecord[]) {
    if (resolve(worktree.path) === resolve(value.repo)) Object.assign(worktree, { head: resultCommit, dirty_count: 0 });
  }
  for (const branch of successor.topology.branches as TestRecord[]) {
    if (branch.name === "main") Object.assign(branch, { commit: resultCommit, merged: true });
  }
  successor.topology.dirty = 0;
  const reviewPath = join(value.bundleDirectory, String(successor.final_review.evidence_ref.path));
  const review = JSON.parse(await readFile(reviewPath, "utf8")) as TestRecord;
  review.candidate_commit = resultCommit;
  await putJson(reviewPath, review);
  successor.final_review.evidence_ref.sha256 = testSha256(await readFile(reviewPath));

  const regressionPath = join(value.bundleDirectory, "regression-delta.json");
  const regression = JSON.parse(await readFile(regressionPath, "utf8")) as TestRecord;
  const comparator = registeredComparator("semantic_boundary", before, after, "guard-commit-comparator", action.id);
  for (const observation of comparator.observations as ComparatorObservationRecord[]) {
    observation.detector_sha256 = observation.detector_registry_sha256;
    delete observation.detector_registry_sha256;
    delete observation.runtime_identity_sha256;
    const bytes = observation[COMPARATOR_RESULT_BYTES];
    if (bytes) await put(join(value.bundleDirectory, String((observation.result_ref as TestRecord).path)), bytes);
  }
  const zeroCounts = {
    baseline_findings: 0, closing_findings: 0, baseline_paid: 0, baseline_open: 0,
    newly_discovered_preexisting_paid: 0, newly_discovered_preexisting_open: 0,
    concurrent_external_paid: 0, concurrent_external_open: 0, introduced_by_run_paid: 0, introduced_by_run_open: 0,
  };
  Object.assign(regression, {
    schema_version: "1.2", baseline_object: baseline, closing_object: resultCommit, ...zeroCounts,
    action_checks: [{
      action_id: action.id, before_object: before.sha256, before_repository_object: before,
      after_object: after.sha256, after_repository_object: after, comparators: [comparator],
      introduced: 0, paid_before_boundary: 0, open_at_boundary: 0, boundary_status: "closed", observed_at: AFTER,
    }],
  });
  delete regression.baseline_repository_object;
  delete regression.closing_repository_object;
  delete regression.accounting;
  await putJson(regressionPath, regression);
  const control = value.report.regression_control as TestRecord;
  Object.assign(control, { baseline_object: baseline, closing_object: resultCommit, ...zeroCounts, action_checks: 1 });
  delete control.baseline_repository_object;
  delete control.closing_repository_object;
  delete control.accounting_schema;
  control.evidence_ref.sha256 = testSha256(await readFile(regressionPath));
  delete successor.native_gate_control;

  const crossing = {
    record_type: "mister-clean.guard-commit-authority", schema_version: "1.0",
    repo: structuredClone(value.manifest.repo), request_ref: value.manifest.request_ref, ...value.authority.tuple,
    target: { ref: "refs/heads/main", expected_commit: baseline }, candidate: value.candidate,
    receipts: value.authority.receipts, deterministic_gates: value.authority.deterministicGates, no_harm: value.authority.noHarm,
    commit_barrier: structuredClone(value.manifest.guard.commit_barrier),
    precommit_sha256: value.authority.precommitSha256,
    precommit_ref: { path: value.authority.precommitPath, sha256: value.authority.precommitSha256 },
    precommit: value.authority.precommit,
    commit: { commit: resultCommit, commit_tree: resultTree, parent: baseline, ref: "refs/heads/main", cas, postcommit_repository_object: after },
  };
  const crossingPath = join(value.root, "external-authority", "guard", "crossing.json");
  value.manifest.guard.authority.crossing_sha256 = await writeCanonicalTestRecord(crossingPath, crossing);
  await value.persist();
  return crossingPath;
}

function recustodyPorts(authorityPath: string): BundlePorts {
  let reads = 0;
  return {
    ...nodeBundlePorts,
    files: {
      ...nodeBundlePorts.files,
      async realpath(path) {
        if (resolve(path) === resolve(authorityPath) && ++reads === 2) {
          await rename(authorityPath, `${authorityPath}.real`);
          await symlink(`${authorityPath}.real`, authorityPath);
        }
        return nodeBundlePorts.files.realpath(path);
      },
    },
  };
}

async function nativeGateMutationFixture(mutation: NativeGateMutation): Promise<Fixture> {
  const value = await fixture();
  const packageManifest = {
    private: true,
    packageManager: "bun@1.4.0",
    scripts: { test: "bun gate.mjs" },
  };
  await Promise.all([
    putJson(join(value.repo, "package.json"), packageManifest),
    put(join(value.repo, "gate.mjs"), [
      'import { readFileSync } from "node:fs";',
      'if (readFileSync(new URL("./gate-state.txt", import.meta.url), "utf8").trim() !== "pass") process.exit(1);',
      "",
    ].join("\n")),
    put(join(value.repo, "gate-state.txt"), "pass\n"),
  ]);
  await git(value.repo, "add", "package.json", "gate.mjs", "gate-state.txt");
  await git(value.repo, "commit", "-m", "add native quality gate");
  const baselineHead = await git(value.repo, "rev-parse", "HEAD");
  rebind(value, baselineHead);
  const before = value.repositoryObject;
  const baselineControl = await materializeNativeGateControl(value, "baseline-required", before);
  const changedPath = mutation === "fail" ? "gate-state.txt" : "package.json";
  if (mutation === "fail") await put(join(value.repo, changedPath), "fail\n");
  else if (mutation === "weaken") await putJson(join(value.repo, changedPath), { ...packageManifest, scripts: {} });
  else await putJson(join(value.repo, changedPath), { ...packageManifest, scripts: { test: "true" } });
  await git(value.repo, "add", changedPath);
  await git(value.repo, "commit", "-m", `${mutation} native quality gate`);
  const head = await git(value.repo, "rev-parse", "HEAD");
  rebind(value, head, baselineHead);
  const after = value.repositoryObject;
  const action = executedAction(changedPath);
  value.report.actions = [action];
  value.manifest.actions = [action];
  value.manifest.execution_state = "executed";
  value.bundle.change_inventory = {
    start_commit: baselineHead,
    subject_commit: head,
    changes: [{ status: "M", path: changedPath, action_ids: ["A-1"], exclusion: null }],
  };
  value.regression.action_checks = [{
    action_id: "A-1",
    before_object: before.sha256,
    before_repository_object: before,
    after_object: after.sha256,
    after_repository_object: after,
    comparators: FIXTURE_DETECTORS.map((detector) => registeredComparator(
      detector.id,
      before,
      after,
      `${detector.id}-comparator`,
      "A-1",
    )),
    boundary_status: "closed",
    observed_at: AFTER,
  }];
  const afterControl = await materializeNativeGateControl(value, `after-${mutation}`, after);
  if (mutation === "fail") {
    value.report.verdict = "NOT_CLEAN";
    value.report.handoff_assessment = {
      recommendation: "do_not_proceed",
      reasons: ["native gate regressed"],
      conditions: [],
    };
  }
  modernizeActionAccounting(value);
  await value.persist();
  value.regression.baseline_native_gate_control = baselineControl;
  (value.regression.action_checks as RecordValue[])[0]!.native_gate_control = afterControl;
  successor(value).native_gate_control = afterControl;
  await persistRegressionMutation(value);
  return value;
}

async function installCrossRootPlanning(
  value: Fixture,
  childParentId: string,
): Promise<void> {
  const parentPath = "product/plans/done/CROSS-PARENT.md";
  const childPath = "delivery/tasks/done/CROSS-CHILD.md";
  const parentContent = "---\nartifact_type: story\nstory_id: CROSS-PARENT\nstatus: done\nholdout_status: pass\n---\n";
  const childContent = `---\nartifact_type: slice\nslice_id: CROSS-CHILD\nparent_id: ${childParentId}\nstatus: done\n---\n`;
  await rm(join(value.repo, "planning"), { recursive: true, force: true });
  await Promise.all([
    put(join(value.repo, parentPath), parentContent),
    put(join(value.repo, childPath), childContent),
  ]);
  await git(value.repo, "add", "-A");
  await git(value.repo, "commit", "-m", `cross-root planning for ${childParentId}`);
  rebind(value, await git(value.repo, "rev-parse", "HEAD"));
  const productCensus = await captureFileCensus({ repository_root: value.repo, roots: ["product/plans"] });
  const deliveryCensus = await captureFileCensus({ repository_root: value.repo, roots: ["delivery/tasks"] });
  (value.bundle.planning_discovery as RecordValue).systems = [
    {
      id: "product-plans", kind: "repo_files", sources: ["product/plans"],
      schema_sources: ["fixture convention"], validators: ["bundle live census"],
      corpus: {
        roots: ["product/plans"], include_globs: ["**/*.md"], total: 1, classified: 1, unclassified: 0,
        census: productCensus,
        artifacts: [{ path: parentPath, class: "done", sha256: digest(parentContent), byte_length: Buffer.byteLength(parentContent) }],
      },
    },
    {
      id: "delivery-tasks", kind: "repo_files", sources: ["delivery/tasks"],
      schema_sources: ["fixture convention"], validators: ["bundle live census"],
      corpus: {
        roots: ["delivery/tasks"], include_globs: ["**/*.md"], total: 1, classified: 1, unclassified: 0,
        census: deliveryCensus,
        artifacts: [{ path: childPath, class: "done", sha256: digest(childContent), byte_length: Buffer.byteLength(childContent) }],
      },
    },
  ];
}

async function preparedPlanningAudit(value: Fixture, runId: string): Promise<PlanningAuditResult> {
  const prepared = await prepareCloseout({
    repo: value.repo,
    evidenceHome: join(value.root, "prepared"),
    runId,
    requestRef: `request-${runId}`,
  });
  const preparedAudit = JSON.parse(
    await readFile(join(prepared.bundleDirectory, "planning-audit.json"), "utf8"),
  ) as RecordValue;
  delete preparedAudit.object;
  delete preparedAudit.repository_object;
  return preparedAudit as unknown as PlanningAuditResult;
}

afterEach(removeTemporaryRoots);

// Live-bound cases execute repository-native gates plus the physical process
// census. Keep the timeout explicit so the stronger boundary is tested rather
// than racing Vitest's generic 5s default on slower macOS hosts.
describe("validateBundle", { timeout: 30_000 }, () => {
  it("parsed trust boundary never throws for cyclic or hostile values", async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await expect(validateBundleRaw(cyclic, "/tmp/cyclic.json", { verifyLive: false }))
      .resolves.toMatchObject({ ok: false });
    const hostile = new Proxy({}, {
      ownKeys() { throw new Error("hostile ownKeys"); },
    });
    await expect(validateBundleRaw(hostile, "/tmp/hostile.json", { verifyLive: false }))
      .resolves.toMatchObject({ ok: false });
  });
  it("accepts a live-bound sidecar bundle", async () => {
    const value = await fixture();
    await expect(validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo })).resolves.toEqual({ errors: [], ok: true });
  });

  it("requires an explicit external accepted-release path only at a live GUARD barrier", async () => {
    const value = await acceptedReleaseBoundaryFixture(
      { mode: "GUARD", guard: { commit_barrier: { state: "open" } }, actions: [] },
      { mode: "GUARD", actions: [] },
    );

    const live = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.missingRepo });
    expect(live.errors).toContain(
      "$.accepted_release_ref.path: live GUARD acceptance requires --accepted-evaluator <absolute path>",
    );
    const structural = await validateBundle(value.bundle, value.bundlePath, {
      repoPath: value.missingRepo,
      verifyLive: false,
    });
    expect(structural.errors).not.toContain(
      "$.accepted_release_ref.path: live GUARD acceptance requires --accepted-evaluator <absolute path>",
    );
  }, 30_000);

  it("requires accepted-release proof for any executed git_commit even if the record mode is forged", async () => {
    const commit = {
      id: "commit-1",
      kind: "git_commit",
      target: "candidate-repository",
      purpose: "attempt commit without external evaluator proof",
      risk: "consequential_external",
      authorization: { state: "granted", source: "skill_invocation", ref: "request-1" },
      preconditions: ["barrier"],
      verification: ["tree"],
      status: "executed",
      outcome: { state: "verified", evidence: [] },
    };
    const value = await acceptedReleaseBoundaryFixture(
      { mode: "CLOSE", actions: [commit] },
      { mode: "CLOSE", actions: [commit], execution_state: "executed" },
    );

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.missingRepo });
    expect(result.errors).toContain(
      "$.accepted_release_ref.path: live GUARD acceptance requires --accepted-evaluator <absolute path>",
    );
  }, 30_000);

  it("refuses CLEAN when a live process outside the verifier ancestry touches the repository", async () => {
    const value = await fixture();
    const externalProcessPort: ActionHygieneProcessPort = {
      processTable: () => [
        { pid: process.pid, ppid: 0, start_identity: "bundle-test-process", executable: "/usr/bin/bun" },
        { pid: 54321, ppid: 0, start_identity: "external-process", executable: "/usr/bin/external" },
      ],
      pathTable: () => new Map([
        [process.pid, { cwd: "/", open_paths: [] }],
        [54321, { cwd: value.repo, open_paths: [] }],
      ]),
    };

    const result = await validateBundle(value.bundle, value.bundlePath, {
      repoPath: value.repo,
      ports: { files: nodeFilePort, git: nodeGitPort, processes: externalProcessPort },
    });

    expect(result.errors).toContain("$.successor_readiness.topology.processes: live process set differs");
    expect(result.ok).toBe(false);
  });

  it("refuses CLEAN without repository-native gate discovery and execution evidence", async () => {
    const value = await fixture();
    delete successor(value).native_gate_control;

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.successor_readiness.native_gate_control: CLEAN requires repository-native gate discovery and execution evidence",
    );
  });

  it("rediscovers native gates live instead of trusting a self-consistent empty catalog", async () => {
    const value = await fixture();
    await Promise.all([
      putJson(join(value.repo, "package.json"), {
        private: true,
        packageManager: "bun@1.4.0",
        scripts: { test: "bun gate.mjs" },
      }),
      put(join(value.repo, "gate.mjs"), "process.exit(0);\n"),
    ]);
    await git(value.repo, "add", "package.json", "gate.mjs");
    await git(value.repo, "commit", "-m", "add required native gate");
    rebind(value, await git(value.repo, "rev-parse", "HEAD"));
    await value.persist();

    const control = successor(value).native_gate_control as RecordValue;
    const discoveryRef = control.discovery_ref as RecordValue;
    const coverageRef = control.coverage_ref as RecordValue;
    const validationRef = control.validation_ref as RecordValue;
    const realDiscovery = JSON.parse(
      await readFile(join(value.proof, String(discoveryRef.path)), "utf8"),
    ) as RecordValue;
    const discoveryRecord: RecordValue = {
      ...realDiscovery,
      gates: [],
      required_gate_ids: [],
    };
    delete discoveryRecord.catalog_sha256;
    const fakeDiscovery = {
      ...discoveryRecord,
      catalog_sha256: canonicalDigest(discoveryRecord),
    };
    const coverageRecord = {
      record_type: "mister-clean.native-gate-coverage",
      schema_version: COVERAGE_SCHEMA_VERSION,
      discovery_sha256: fakeDiscovery.catalog_sha256,
      closing_repository_object: value.repositoryObject,
      required_gate_ids: [],
      executions: [],
      execution_lease: {
        record_type: "mister-clean.execution-lease-receipt",
        schema_version: "1.0",
        resource: "repository-wide-verification",
        coordination_key_sha256: String((fakeDiscovery as RecordValue).execution_coordination_key_sha256),
        lease_id: "11111111-1111-4111-8111-111111111111",
        mechanism: "sqlite_exclusive_transaction",
        acquired_at: NOW,
        released_at: NOW,
        state: "released",
      },
    };
    const fakeCoverage = {
      ...coverageRecord,
      coverage_sha256: canonicalDigest(coverageRecord),
    };
    const fakeValidation = {
      record_type: "mister-clean.native-gate-validation",
      schema_version: "1.0",
      discovery_sha256: fakeDiscovery.catalog_sha256,
      coverage_sha256: fakeCoverage.coverage_sha256,
      status: "pass",
      errors: [],
      observed_at: NOW,
    };
    await Promise.all([
      putJson(join(value.proof, String(discoveryRef.path)), fakeDiscovery),
      putJson(join(value.proof, String(coverageRef.path)), fakeCoverage),
      putJson(join(value.proof, String(validationRef.path)), fakeValidation),
    ]);
    discoveryRef.sha256 = digest(await readFile(join(value.proof, String(discoveryRef.path))));
    coverageRef.sha256 = digest(await readFile(join(value.proof, String(coverageRef.path))));
    validationRef.sha256 = digest(await readFile(join(value.proof, String(validationRef.path))));
    control.required_count = 0;
    control.passed_count = 0;
    control.absent_count = 0;
    control.validation_error_count = 0;
    await putJson(value.bundlePath, value.bundle);

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.live_native_gates.discovery: fresh canonical discovery differs from recorded successor discovery",
    );
  });

  it("does not require a redundant native-gate run for a same-object action", async () => {
    const value = await fixture();
    const action = executedAction();
    value.report.actions = [action];
    value.manifest.actions = [action];
    value.manifest.execution_state = "executed";
    value.regression.action_checks = [{
      action_id: "A-1",
      before_object: value.repositoryObject.sha256,
      before_repository_object: value.repositoryObject,
      after_object: value.repositoryObject.sha256,
      after_repository_object: value.repositoryObject,
      comparators: FIXTURE_DETECTORS.map((detector) => registeredComparator(
        detector.id,
        value.repositoryObject,
        value.repositoryObject,
        `${detector.id}-comparator`,
      )),
      introduced: 0,
      paid_before_boundary: 0,
      open_at_boundary: 0,
      boundary_status: "closed",
      observed_at: AFTER,
    }];
    modernizeActionAccounting(value);
    await value.persist();
    expect((value.regression.action_checks as RecordValue[])[0]!.native_gate_control).toBeUndefined();
    await expect(validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo }))
      .resolves.toEqual({ errors: [], ok: true });
  });

  it("binds baseline, action-post, and successor native gates across a changed repository object", async () => {
    const { value } = await changedNativeActionFixture();
    await expect(validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo }))
      .resolves.toEqual({ errors: [], ok: true });
  });

  it("requires baseline and post-state native controls for a changed action", async () => {
    const { value, baselineControl } = await changedNativeActionFixture();
    delete value.regression.baseline_native_gate_control;
    await persistRegressionMutation(value);
    let result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.report.regression_control.evidence_ref.baseline_native_gate_control: requires repository-native gate discovery and execution evidence",
    );

    value.regression.baseline_native_gate_control = baselineControl;
    delete (value.regression.action_checks as RecordValue[])[0]!.native_gate_control;
    await persistRegressionMutation(value);
    result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.report.regression_control.evidence_ref.action_checks[0].native_gate_control: requires repository-native gate discovery and execution evidence",
    );
  });

  it("rejects reuse of baseline native proof as a changed action's post-state proof", async () => {
    const { value, baselineControl } = await changedNativeActionFixture();
    (value.regression.action_checks as RecordValue[])[0]!.native_gate_control = baselineControl;
    await persistRegressionMutation(value);
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => (
      error.includes("action_checks[0].native_gate_control")
      && error.includes("does not match the requested closing object")
    ))).toBe(true);
  });

  it("requires successor native state to agree with the final changed action", async () => {
    const { value, baselineControl } = await changedNativeActionFixture();
    successor(value).native_gate_control = baselineControl;
    await persistRegressionMutation(value);
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.successor_readiness.native_gate_control.discovery_ref: must equal the final action boundary native-gate catalog",
    );
  });

  it("still requires post-state native evidence when a changed action is interrupted", async () => {
    const { value } = await changedNativeActionFixture();
    const reportAction = (value.report.actions as RecordValue[])[0]!;
    const manifestAction = (value.manifest.actions as RecordValue[])[0]!;
    reportAction.status = "failed";
    manifestAction.status = "failed";
    value.report.verdict = "NOT_CLEAN";
    value.report.handoff_assessment = {
      recommendation: "do_not_proceed",
      reasons: ["action interrupted"],
      conditions: [],
    };
    const check = (value.regression.action_checks as RecordValue[])[0]!;
    check.boundary_status = "interrupted";
    delete check.native_gate_control;
    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.report.regression_control.evidence_ref.action_checks[0].native_gate_control: requires repository-native gate discovery and execution evidence",
    );
  });

  it("treats a native-only failure introduced by an action as open boundary debt", async () => {
    const value = await nativeGateMutationFixture("fail");
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => (
      error.includes("action_checks[0]")
      && error.includes("closed boundary requires zero open observations")
    ))).toBe(true);
  });

  it("fails closed when an action removes or downgrades an established native gate", async () => {
    const value = await nativeGateMutationFixture("weaken");
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => (
      error.includes("action_checks[0].native_gate_control.discovery_ref")
      && (error.includes("disappeared") || error.includes("was weakened"))
    ))).toBe(true);
  });

  it("rejects a same-id green replacement that weakens the native gate's semantic contract", async () => {
    const value = await nativeGateMutationFixture("semantic_weaken");
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.report.regression_control.evidence_ref.action_checks[0].native_gate_control.discovery_ref: native gate \"node:.:test\" changed its semantic contract; ordinary cleanup cannot weaken or rewrite repository quality policy",
    );
  });

  it("requires every evidence-derived root debt to be reported", async () => {
    const { value } = await publicSafetyDebtFixture(false);
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => (
      error.includes("root_projection: evidence-derived root debt")
      && error.includes("is absent from report completion_debts")
    ))).toBe(true);
  });

  it("accepts a canonically projected baseline debt with exactly one owner", async () => {
    const { value } = await publicSafetyDebtFixture();
    await expect(validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo }))
      .resolves.toEqual({ errors: [], ok: true });
  });

  it("does not permit one observation to be claimed by multiple root debts", async () => {
    const { value, debt } = await publicSafetyDebtFixture();
    const duplicate = {
      ...structuredClone(debt),
      id: "DEBT-PUBLIC-SAFETY-DUPLICATE",
      cause_key: { ...debt.cause_key as RecordValue, duplicate_partition: true },
    } as RecordValue;
    duplicate.debt_key = canonicalRootDebtKey({
      repo_id: String((value.report.repo as RecordValue).id),
      normalizer: String(duplicate.normalizer),
      cause_key: duplicate.cause_key as never,
    });
    value.report.completion_debts = [debt, duplicate];
    await persistRegressionMutation(value);
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => error.includes("must map to exactly one root debt (2 owners)"))).toBe(true);
  });

  it("loads and digest-checks origin evidence instead of trusting its reference", async () => {
    const { value, debt } = await publicSafetyDebtFixture();
    debt.origin = {
      class: "newly_discovered_preexisting",
      observation_evidence_ref: { path: "missing-origin-evidence.json", sha256: "a".repeat(64) },
      baseline_replay_ref: { path: "missing-baseline-replay.json", sha256: "b".repeat(64) },
    };
    await persistRegressionMutation(value);
    let result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => (
      error.includes("origin.observation_evidence_ref") && error.includes("file not found")
    ))).toBe(true);

    (debt.origin as RecordValue).observation_evidence_ref = {
      path: "public-safety-audit.json",
      sha256: "a".repeat(64),
    };
    await persistRegressionMutation(value);
    result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => (
      error.includes("origin.observation_evidence_ref") && error.includes("digest")
    ))).toBe(true);

    (debt.origin as RecordValue).observation_evidence_ref = {
      path: "criteria-source.json",
      sha256: digest(await readFile(join(value.proof, "criteria-source.json"))),
    };
    await persistRegressionMutation(value);
    result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.report.completion_debts[0].origin.observation_evidence_ref: must equal independently bound detector/native evidence for a root observation",
    );
  });

  it("requires introduced origin evidence to come from its attributed action observation", async () => {
    const { value, debt } = await publicSafetyDebtFixture();
    debt.origin = {
      class: "introduced_by_run",
      action_id: "A-1",
      observation_evidence_ref: {
        path: "public-safety-audit.json",
        sha256: digest(await readFile(join(value.proof, "public-safety-audit.json"))),
      },
    };
    await persistRegressionMutation(value);
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.report.completion_debts[0].origin.observation_evidence_ref: must equal bound evidence for a root observation at its attributed action",
    );
  });

  it("requires an exact baseline replay instead of accepting a generic preexistence receipt", async () => {
    const { value, debt } = await publicSafetyDebtFixture();
    const replayPath = "forged-baseline-replay.json";
    const replay = {
      record_type: "mister-clean.baseline-replay",
      schema_version: "1.0",
      detector_id: "public_safety",
      baseline_object: "f".repeat(64),
      baseline_repository_object: value.repositoryObject,
      detector_registry_sha256: detectorRegistrySha256(),
      runtime_identity_sha256: TEST_RUNTIME_IDENTITY_SHA256,
      result_ref: {
        path: "criteria-source.json",
        sha256: digest(await readFile(join(value.proof, "criteria-source.json"))),
      },
      observed_at: NOW,
    };
    await putJson(join(value.proof, replayPath), replay);
    debt.origin = {
      class: "newly_discovered_preexisting",
      observation_evidence_ref: {
        path: "public-safety-audit.json",
        sha256: digest(await readFile(join(value.proof, "public-safety-audit.json"))),
      },
      baseline_replay_ref: {
        path: replayPath,
        sha256: digest(await readFile(join(value.proof, replayPath))),
      },
    };
    await persistRegressionMutation(value);

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.report.completion_debts[0].origin.baseline_replay_ref.baseline_object: must equal the immutable regression baseline object",
    );
    expect(result.errors.some((error) => (
      error.includes("origin.baseline_replay_ref.result_ref")
      && error.includes("canonical detector result")
    ))).toBe(true);
  });

  it("requires independent typed writer evidence for concurrent-external attribution", async () => {
    const { value, debt, observationId } = await publicSafetyDebtFixture();
    const changePath = "forged-external-change.json";
    const transition = {
      record_type: "mister-clean.external-change",
      schema_version: "1.0",
      observed_during_action_id: "A-1",
      before_repository_object: value.repositoryObject,
      after_repository_object: value.repositoryObject,
      observation_ids: [observationId],
      changed_paths: ["unsafe.txt"],
      writer: { kind: "external_agent", execution_id: "same-execution", receipt_ref: "receipt-1" },
      observer: { kind: "mister_clean_action_lane", action_id: "A-1", execution_id: "same-execution" },
      observed_at: NOW,
    };
    await putJson(join(value.proof, changePath), transition);
    debt.origin = {
      class: "concurrent_external",
      observation_evidence_ref: {
        path: "public-safety-audit.json",
        sha256: digest(await readFile(join(value.proof, "public-safety-audit.json"))),
      },
      change_ref: {
        kind: "external_change",
        path: changePath,
        sha256: digest(await readFile(join(value.proof, changePath))),
      },
    };
    await persistRegressionMutation(value);

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.report.completion_debts[0].origin.change_ref: external-change evidence requires a real repository-object transition",
    );
    expect(result.errors).toContain(
      "$.report.completion_debts[0].origin.change_ref: writer and observer execution identities must be independent",
    );
  });

  it("does not let reported satisfied state erase a physically failing native gate", async () => {
    const value = await nativeGateMutationFixture("fail");
    const control = successor(value).native_gate_control as RecordValue;
    const discoveryRef = control.discovery_ref as RecordValue;
    const coverageRef = control.coverage_ref as RecordValue;
    const discovery = JSON.parse(await readFile(join(value.proof, String(discoveryRef.path)), "utf8"));
    const coverage = JSON.parse(await readFile(join(value.proof, String(coverageRef.path)), "utf8"));
    const projection = nativeGateFailureObservations(discovery, coverage)[0]!;
    const observationId = canonicalObservationId({
      source_id: projection.source_id,
      source_native_fingerprint: projection.source_native_fingerprint,
    });
    value.report.completion_debts = [{
      id: "DEBT-NATIVE-RELABEL",
      procedure: "repair the failing native gate",
      debt_key: canonicalRootDebtKey({
        repo_id: String((value.report.repo as RecordValue).id),
        normalizer: projection.normalizer,
        cause_key: projection.cause_key,
      }),
      normalizer: projection.normalizer,
      cause_key: projection.cause_key,
      state: "satisfied",
      disposition: "autonomously_repair",
      origin: {
        class: "introduced_by_run",
        action_id: "A-1",
        observation_evidence_ref: coverageRef,
      },
      observation_ids: [observationId],
      evidence: [],
    }];
    (value.report.actions as RecordValue[])[0]!.status = "failed";
    (value.manifest.actions as RecordValue[])[0]!.status = "failed";
    const check = (value.regression.action_checks as RecordValue[])[0]!;
    Object.assign(check, deriveActionObservationSets("A-1", [
      { phase: "before", observation_ids: [] },
      { phase: "after", observation_ids: [observationId] },
    ]));
    check.boundary_status = "interrupted";
    await value.persist();

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => (
      error.includes("closing-present root debt cannot be satisfied")
    ))).toBe(true);
  });

  it("refuses CLEAN on an unsigned principal ruling over an irreparable finding, which stays payable", async () => {
    const { value, debt, observationId } = await publicSafetyDebtFixture();
    const rulingPath = "operator-ruling.json";
    const ruling = {
      record_type: "mister-clean.operator-ruling",
      debt_id: debt.id,
      actor: "principal",
      at: NOW,
      scope: "irreparable historical fixture path retained as explicit test evidence",
      rationale: "the fixture deliberately preserves the historical string to test the ratified-exception path",
      request_sha256: (value.bundle.criteria_discovery as RecordValue).request_sha256,
    };
    await putJson(join(value.proof, rulingPath), ruling);
    debt.state = "accepted_exception";
    debt.disposition = "accepted_exception";
    debt.exception = {
      actor: ruling.actor,
      at: ruling.at,
      scope: ruling.scope,
      rationale: ruling.rationale,
      ref: { path: rulingPath, sha256: digest(await readFile(join(value.proof, rulingPath))) },
    };
    value.report.verdict = "CLEAN";
    value.report.debt_census = { discovered: 1, paid: 0, accepted_exception: 1 };
    value.report.handoff_assessment = {
      recommendation: "proceed",
      reasons: ["the only remaining physical finding is a principal-ratified irreparable historical exception"],
      conditions: [],
    };
    value.regression.accounting = deriveRegressionAccounting({
      repo_id: String((value.report.repo as RecordValue).id),
      baseline_observation_ids: [observationId],
      closing_observation_ids: [observationId],
      action_observations: [],
      root_debts: [debt as never],
    });
    await value.persist();

    // Master-gate S0: a closer-written ruling is not the principal's act. Without an
    // owner or principal signature under a judge-pinned policy it waives nothing.
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(expect.stringMatching(/^\$\.report\.completion_debts\[0\]\.exception: .*stays payable \(unsigned/));
    expect(result.errors).toContain("$.live_detector_coverage.public_safety: CLEAN requires zero payable findings after owner-signed exceptions (got 1)");
  });

  it("keeps an honest NOT_CLEAN schema 1.5 bundle readable without native gate control", async () => {
    const value = await fixture();
    value.report.verdict = "NOT_CLEAN";
    value.report.handoff_assessment = {
      recommendation: "do_not_proceed",
      reasons: ["repository-native gate evidence is not available"],
      conditions: [],
    };
    await value.persist();
    delete successor(value).native_gate_control;

    await expect(validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo }))
      .resolves.toEqual({ errors: [], ok: true });
  });

  it("refuses CLEAN without the live verifier-minted runtime capability", async () => {
    const value = await fixture();
    const result = await validateBundleRaw(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.runtime_attestation: CLEAN requires a live verifier-minted file runtime binding",
    );
  });

  it("refuses a structurally valid but unminted runtime capability", async () => {
    const value = await fixture();
    const forged = structuredClone(TEST_RUNTIME_ATTESTATION);
    const result = await validateBundleRaw(value.bundle, value.bundlePath, {
      repoPath: value.repo,
      runtimeAttestation: forged,
    });
    expect(result.errors).toContain(
      "$.runtime_attestation: must be minted by Mister Clean's live verifier",
    );
  });

  it("refuses CLEAN evidence produced by different attested package bytes", async () => {
    const value = await fixture();
    const otherRuntime = mintServerAttestationBinding({
      ...TEST_RUNTIME_ATTESTATION,
      package_root: "/fixture/other-mister-clean",
      package_root_realpath: "/fixture/other-mister-clean",
      entrypoint: {
        ...TEST_RUNTIME_ATTESTATION.entrypoint,
        realpath: "/fixture/other-mister-clean/bin/mister-clean.js",
      },
      manifest: { ...TEST_RUNTIME_ATTESTATION.manifest!, sha256: digest("different package manifest") },
    });
    const result = await validateBundleRaw(value.bundle, value.bundlePath, {
      repoPath: value.repo,
      runtimeAttestation: otherRuntime,
    });
    expect(result.errors).toContain(
      "$.report.regression_control.evidence_ref.detector_coverage.runtime_identity: must exactly equal the live verifier-minted runtime identity",
    );
  });

  it("refuses source-development runtime identity for CLEAN validation", async () => {
    const value = await fixture();
    const sourceRuntime = mintServerAttestationBinding({
      record_type: "mister-clean.runtime-attestation-binding",
      schema_version: "1.0",
      status: "source_development",
      package_root: "/fixture/mister-clean",
      package_root_realpath: "/fixture/mister-clean",
      entrypoint: { path: "./src/cli.ts", realpath: "/fixture/mister-clean/src/cli.ts", sha256: digest("source cli") },
      reason: "explicit fixture source execution",
    });
    const result = await validateBundleRaw(value.bundle, value.bundlePath, {
      repoPath: value.repo,
      runtimeAttestation: sourceRuntime,
    });
    expect(result.errors).toContain(
      "$.runtime_attestation.status: CLEAN requires a release-attested CLI runtime",
    );
  });

  it("rejects detector result reuse after its execution is rebound to another repository object", async () => {
    const value = await fixture();
    const coverage = value.regression.detector_coverage as RecordValue;
    const execution = (coverage.executions as RecordValue[])[0]!;
    const original = (execution.repository_object as RecordValue | undefined) ?? {
      record_type: "mister-clean.repository-object", schema_version: "1.0",
      head_commit: value.head, surface: "tracked_and_nonignored", entry_count: 3,
      sha256: value.head,
    };
    const other = { ...original, sha256: digest("other repository tree") };
    execution.object = other.sha256;
    execution.repository_object = other;
    await persistRegressionMutation(value);

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => error.includes(
      "result_ref: repository_object must equal the detector execution repository_object",
    ))).toBe(true);
  });

  it("rejects a comparator action chain that does not begin at the regression baseline object", async () => {
    const value = await fixture();
    const action = executedAction();
    value.report.actions = [action];
    value.manifest.actions = [action];
    value.manifest.execution_state = "executed";
    const wrongStart = digest("disconnected action start");
    const wrongStartObject = repositoryObjectAt(value.repositoryObject, wrongStart);
    value.regression.action_checks = [{
      action_id: "A-1",
      before_object: wrongStart, before_repository_object: wrongStartObject,
      after_object: value.repositoryObject.sha256, after_repository_object: value.repositoryObject,
      comparators: [registeredComparator("semantic_boundary", wrongStartObject, value.repositoryObject)],
      introduced: 0, paid_before_boundary: 0, open_at_boundary: 0,
      boundary_status: "closed", observed_at: AFTER,
    }];
    modernizeActionAccounting(value);
    await value.persist();

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => error.includes(
      "before_object: must continue the repository-object chain from regression baseline_object",
    ))).toBe(true);
  });

  it("rejects live closing drift from the bound repository object", async () => {
    const value = await fixture();
    await put(join(value.repo, "late-drift.txt"), "appeared after closeout\n");
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.report.regression_control.evidence_ref.closing_repository_object: live repository object differs",
    );
  });

  it("rejects repository drift introduced during live detector verification", async () => {
    const value = await fixture();
    let semanticResultReads = 0;
    const result = await validateBundle(value.bundle, value.bundlePath, {
      repoPath: value.repo,
      ports: {
        git: nodeGitPort,
        files: {
          ...nodeFilePort,
          async readBytes(path) {
            const bytes = await nodeFilePort.readBytes(path);
            if (path.endsWith("semantic-audit.json") && ++semanticResultReads === 2) {
              await put(join(value.repo, "drift-during-live-verification.txt"), "late mutation\n");
            }
            return bytes;
          },
        },
      },
    });
    expect(semanticResultReads).toBeGreaterThanOrEqual(2);
    expect(result.errors).toContain(
      "$.report.regression_control.evidence_ref.closing_repository_object: live repository object differs",
    );
  });

  it("requires schema 1.5 runtime and repository-object coverage for CLEAN while retaining schema 1.3 NOT_CLEAN compatibility", async () => {
    const clean = await fixture();
    clean.regression.schema_version = "1.3";
    await clean.persist();
    const cleanResult = await validateBundle(clean.bundle, clean.bundlePath, { repoPath: clean.repo });
    expect(cleanResult.errors).toContain(
      "$.report.regression_control.evidence_ref.schema_version: CLEAN requires regression-delta schema 1.5 or later runtime and repository-object coverage",
    );

    const notClean = await fixture();
    notClean.report.verdict = "NOT_CLEAN";
    (notClean.report.handoff_assessment as RecordValue).recommendation = "proceed_with_conditions";
    (notClean.report.handoff_assessment as RecordValue).conditions = ["legacy ledger"];
    useLegacyRegression(notClean, "1.3");
    await notClean.persist();
    await expect(validateBundle(notClean.bundle, notClean.bundlePath, { repoPath: notClean.repo }))
      .resolves.toEqual({ errors: [], ok: true });
  });

  it("requires the identity accounting object on every schema 1.5 regression record", async () => {
    const value = await fixture();
    delete value.regression.accounting;
    await value.persist();

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) =>
      error.includes("evidence_ref.accounting") && error.includes("required object"),
    )).toBe(true);
  });

  it("rejects legacy count fields in schema 1.5 by presence even when disguised as another type", async () => {
    const value = await fixture();
    value.regression.baseline_findings = "not-a-count";
    await value.persist();

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.report.regression_control.evidence_ref.baseline_findings: legacy numeric regression field is forbidden by schema 1.5 accounting",
    );
  });

  it("returns validation errors instead of throwing on malformed schema 1.5 accounting", async () => {
    const value = await fixture();
    value.regression.accounting = { observation_ledger: "malformed", root_debt_ledger: null };
    await value.persist();

    const validation = validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    await expect(validation).resolves.toMatchObject({ ok: false });
    const result = await validation;
    expect(result.errors.some((error) => error.includes("evidence_ref.accounting"))).toBe(true);
  });

  it("recomputes policy-required detector coverage instead of trusting a smaller declared set", async () => {
    const value = await fixture();
    const coverage = value.regression.detector_coverage as RecordValue;
    coverage.required_detector_ids = ["planning_graph"];
    await putJson(join(value.proof, "regression-delta.json"), value.regression);
    ((value.report.regression_control as RecordValue).evidence_ref as RecordValue).sha256 = digest(
      await readFile(join(value.proof, "regression-delta.json")),
    );
    await putJson(join(value.proof, "report.json"), value.report);
    (value.bundle.report as RecordValue).sha256 = digest(await readFile(join(value.proof, "report.json")));
    await putJson(value.bundlePath, value.bundle);

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.report.regression_control.evidence_ref.detector_coverage.required_detector_ids: must exactly equal the required detector set derived from the bound run policy",
    );
  });

  it("rejects event timestamps beyond the bounded future skew", async () => {
    const value = await fixture();
    value.report.generated_at = BEYOND_FUTURE_SKEW;
    await value.persist();

    const result = await validateBundle(value.bundle, value.bundlePath, {
      repoPath: value.repo,
      validationTime: VALIDATION_TIME,
      maxFutureSkewMs: 1_000,
    });

    expect(result.errors).toContain(
      "$.report.generated_at: timestamp exceeds validation time plus max future skew (2026-08-25T09:00:11.000Z)",
    );
  });

  it("accepts event timestamps within the bounded future skew", async () => {
    const value = await fixture();
    value.report.generated_at = WITHIN_FUTURE_SKEW;
    await value.persist();

    await expect(validateBundle(value.bundle, value.bundlePath, {
      repoPath: value.repo,
      validationTime: VALIDATION_TIME,
      maxFutureSkewMs: 1_000,
    })).resolves.toEqual({ errors: [], ok: true });
  });

  it("accepts future deadline fields", async () => {
    const value = await fixture();
    value.bundle.expires_at = "2026-08-26T09:00:10Z";
    await value.persist();

    await expect(validateBundle(value.bundle, value.bundlePath, {
      repoPath: value.repo,
      validationTime: VALIDATION_TIME,
      maxFutureSkewMs: 0,
    })).resolves.toEqual({ errors: [], ok: true });
  });

  it("rejects a future-dated loaded evidence sidecar", async () => {
    const value = await fixture();
    const sidecarPath = join(value.proof, "debris-census.json");
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8")) as RecordValue;
    sidecar.observed_at = BEYOND_FUTURE_SKEW;
    await putJson(sidecarPath, sidecar);
    const debris = (successor(value).debris as RecordValue);
    ((debris.evidence as RecordValue[])[0]!).sha256 = digest(await readFile(sidecarPath));

    const result = await validateBundle(value.bundle, value.bundlePath, {
      repoPath: value.repo,
      validationTime: VALIDATION_TIME,
      maxFutureSkewMs: 1_000,
    });

    expect(result.errors).toContain(
      "$.successor_readiness.debris.evidence[0].observed_at: timestamp exceeds validation time plus max future skew (2026-08-25T09:00:11.000Z)",
    );
  });

  it("treats semantic-manifest observation time as an event clock", async () => {
    const value = await fixture();
    const sidecarPath = join(value.proof, "debris-census.json");
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8")) as RecordValue;
    sidecar.manifest_observed_at = BEYOND_FUTURE_SKEW;
    await putJson(sidecarPath, sidecar);
    const debris = successor(value).debris as RecordValue;
    ((debris.evidence as RecordValue[])[0]!).sha256 = digest(await readFile(sidecarPath));

    const result = await validateBundle(value.bundle, value.bundlePath, {
      repoPath: value.repo,
      validationTime: VALIDATION_TIME,
      maxFutureSkewMs: 1_000,
    });

    expect(result.errors).toContain(
      "$.successor_readiness.debris.evidence[0].manifest_observed_at: timestamp exceeds validation time plus max future skew (2026-08-25T09:00:11.000Z)",
    );
  });

  it("rejects future-dated semantic detector input bytes", async () => {
    const value = await fixture();
    const coverage = value.regression.detector_coverage as RecordValue;
    const executions = coverage.executions as RecordValue[];
    const executionIndex = executions.findIndex((candidate) => candidate.detector_id === "semantic_boundary");
    const execution = executions[executionIndex];
    if (!execution) throw new Error("missing semantic detector execution");

    const manifestPath = join(value.proof, "semantic-probe-manifest.json");
    await putJson(manifestPath, {
      record_type: "mister-clean.semantic-probe-manifest",
      observed_at: BEYOND_FUTURE_SKEW,
      probes: [],
    });
    const manifestSha256 = digest(await readFile(manifestPath));
    execution.input_refs = [{
      kind: "semantic_probe_manifest",
      path: "semantic-probe-manifest.json",
      sha256: manifestSha256,
    }];

    const semanticResultPath = join(value.proof, "semantic-audit.json");
    const semanticResult = JSON.parse(await readFile(semanticResultPath, "utf8")) as RecordValue;
    semanticResult.manifest_sha256 = manifestSha256;
    await putJson(semanticResultPath, semanticResult);
    const semanticResultSha256 = digest(await readFile(semanticResultPath));
    (execution.result_ref as RecordValue).sha256 = semanticResultSha256;
    execution.result_sha256 = semanticResultSha256;
    await persistRegressionMutation(value);

    const result = await validateBundle(value.bundle, value.bundlePath, {
      repoPath: value.repo,
      validationTime: VALIDATION_TIME,
      maxFutureSkewMs: 1_000,
    });

    expect(result.errors).toContain(
      `$.report.regression_control.evidence_ref.detector_coverage.executions[${executionIndex}].input_refs[0].observed_at: timestamp exceeds validation time plus max future skew (2026-08-25T09:00:11.000Z)`,
    );
  });

  it("rejects future-dated baseline detector result bytes", async () => {
    const value = await fixture();
    const coverage = value.regression.detector_coverage as RecordValue;
    const execution = (coverage.executions as RecordValue[])
      .find((candidate) => candidate.detector_id === "planning_graph");
    if (!execution) throw new Error("missing planning detector execution");

    const planningResultPath = join(value.proof, "planning-audit.json");
    const planningResult = JSON.parse(await readFile(planningResultPath, "utf8")) as RecordValue;
    planningResult.observed_at = BEYOND_FUTURE_SKEW;
    await putJson(planningResultPath, planningResult);
    const planningResultSha256 = digest(await readFile(planningResultPath));
    (execution.result_ref as RecordValue).sha256 = planningResultSha256;
    execution.result_sha256 = planningResultSha256;
    await persistRegressionMutation(value);

    const result = await validateBundle(value.bundle, value.bundlePath, {
      repoPath: value.repo,
      validationTime: VALIDATION_TIME,
      maxFutureSkewMs: 1_000,
    });

    expect(result.errors).toContain(
      "$.report.regression_control.evidence_ref.detector_coverage.executions[0].result_ref.observed_at: timestamp exceeds validation time plus max future skew (2026-08-25T09:00:11.000Z)",
    );
  });

  it("rejects future-dated action comparator result bytes", async () => {
    const value = await fixture();
    const action = executedAction();
    value.report.actions = [action];
    value.manifest.actions = [action];
    value.manifest.execution_state = "executed";
    const spec = FIXTURE_DETECTORS.find((candidate) => candidate.id === "semantic_boundary");
    if (!spec) throw new Error("missing semantic detector registry entry");
    const ordinaryResult = JSON.stringify({ findings: [], exitCode: 0 });
    const futureResult = JSON.stringify({ findings: [], exitCode: 0, observed_at: BEYOND_FUTURE_SKEW });
    value.regression.action_checks = [{
      action_id: "A-1",
      before_object: value.repositoryObject.sha256, before_repository_object: value.repositoryObject,
      after_object: value.repositoryObject.sha256, after_repository_object: value.repositoryObject,
      comparators: [{
        id: "semantic-boundary-comparator",
        detector_id: "semantic_boundary",
        command: spec.command,
        scope: spec.scope,
        detector: spec.detector,
        observations: [
          comparatorObservation("before", value.repositoryObject.sha256, spec.command, spec.detector, [], ordinaryResult, NOW, value.repositoryObject, "A-1", "semantic-boundary-comparator"),
          comparatorObservation("after", value.repositoryObject.sha256, spec.command, spec.detector, [], futureResult, AFTER, value.repositoryObject, "A-1", "semantic-boundary-comparator"),
        ],
      }],
      introduced: 0, paid_before_boundary: 0, open_at_boundary: 0,
      boundary_status: "closed", observed_at: AFTER,
    }];
    modernizeActionAccounting(value);
    await value.persist();

    const result = await validateBundle(value.bundle, value.bundlePath, {
      repoPath: value.repo,
      validationTime: VALIDATION_TIME,
      maxFutureSkewMs: 1_000,
    });

    expect(result.errors).toContain(
      "$.report.regression_control.evidence_ref.action_checks[0].comparators[0].observations[1].result_ref.observed_at: timestamp exceeds validation time plus max future skew (2026-08-25T09:00:11.000Z)",
    );
  });

  it("accepts temporary action harm only when it is paid before the boundary", async () => {
    const value = await fixture();
    // Schema 1.2 remains accepted for explicitly NOT_CLEAN historical
    // ledgers; schema 1.4 binds action comparators to detector coverage and
    // the repository-object chain.
    value.report.verdict = "NOT_CLEAN";
    (value.report.handoff_assessment as RecordValue).recommendation = "proceed_with_conditions";
    (value.report.handoff_assessment as RecordValue).conditions = ["legacy comparator ledger"];
    useLegacyRegression(value, "1.2");
    const action = executedAction();
    const command = "git status --porcelain=v2";
    const detector = "git fixture";
    const generatedFile = digest("generated-file");
    value.report.actions = [action];
    value.manifest.actions = [action];
    value.manifest.execution_state = "executed";
    const control = value.report.regression_control as RecordValue;
    Object.assign(control, { introduced_by_run_paid: 1, action_checks: 1 });
    Object.assign(value.regression, {
      introduced_by_run_paid: 1,
      action_checks: [{
        action_id: "A-1",
        before_object: value.repositoryObject.sha256, before_repository_object: value.repositoryObject,
        after_object: value.repositoryObject.sha256, after_repository_object: value.repositoryObject,
        comparators: [{
          id: "git-status", command, scope: "repository", detector,
          observations: [
            comparatorObservation("before", value.repositoryObject.sha256, command, detector, [], "clean", NOW),
            comparatorObservation("intermediate", digest("temporary action state"), command, detector, [generatedFile], "untracked generated file", MIDDLE),
            comparatorObservation("after", value.repositoryObject.sha256, command, detector, [], "clean", AFTER),
          ],
        }],
        introduced: 1, paid_before_boundary: 1, open_at_boundary: 0,
        boundary_status: "closed", observed_at: AFTER,
      }],
    });
    await value.persist();
    await expect(validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo })).resolves.toEqual({ errors: [], ok: true });
  });

  it("refuses a mutating action whose comparator subset omits required detector families", async () => {
    const value = await fixture();
    const action = executedAction();
    value.report.actions = [action];
    value.manifest.actions = [action];
    value.manifest.execution_state = "executed";
    value.regression.action_checks = [{
      action_id: "A-1",
      before_object: value.repositoryObject.sha256, before_repository_object: value.repositoryObject,
      after_object: value.repositoryObject.sha256, after_repository_object: value.repositoryObject,
      comparators: [registeredComparator("semantic_boundary", value.repositoryObject, value.repositoryObject)],
      introduced: 0, paid_before_boundary: 0, open_at_boundary: 0,
      boundary_status: "closed", observed_at: AFTER,
    }];
    modernizeActionAccounting(value);

    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toEqual(expect.arrayContaining([
      "$.report.regression_control.evidence_ref.action_checks[0].comparators: every mutating action requires planning_graph",
      "$.report.regression_control.evidence_ref.action_checks[0].comparators: every mutating action requires public_safety",
    ]));
  });

  it("derives registered action findings and exit status from preserved result bytes", async () => {
    const value = await fixture();
    useLegacyRegression(value, "1.4");
    const action = executedAction();
    value.report.actions = [action];
    value.manifest.actions = [action];
    value.manifest.execution_state = "executed";
    (value.report.regression_control as RecordValue).action_checks = 1;
    const comparator = registeredComparator("semantic_boundary", value.repositoryObject, value.repositoryObject);
    const after = (comparator.observations as RecordValue[])[1]!;
    after.finding_fingerprints = [semanticFindingFingerprint("SEM-FABRICATED", "semantic_probe_unassigned")];
    after.exit_code = 1;
    value.regression.action_checks = [{
      action_id: "A-1",
      before_object: value.repositoryObject.sha256, before_repository_object: value.repositoryObject,
      after_object: value.repositoryObject.sha256, after_repository_object: value.repositoryObject,
      comparators: [comparator],
      introduced: 0, paid_before_boundary: 0, open_at_boundary: 0,
      boundary_status: "closed", observed_at: AFTER,
    }];

    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.report.regression_control.evidence_ref.action_checks[0].comparators[0].observations[1].finding_fingerprints: must equal the exact result-derived fingerprint set",
    );
    expect(result.errors).toContain(
      "$.report.regression_control.evidence_ref.action_checks[0].comparators[0].observations[1].exit_code: must equal the registered detector result exitCode",
    );
  });

  it("requires planning_graph when a planning-record action has a comparator check", async () => {
    const value = await fixture();
    useLegacyRegression(value, "1.4");
    const action = executedAction("planning/done/done.md");
    action.kind = "planning_record_update";
    value.report.actions = [structuredClone(action)];
    value.manifest.actions = [structuredClone(action)];
    value.manifest.execution_state = "executed";
    (value.report.regression_control as RecordValue).action_checks = 1;
    value.regression.action_checks = [{
      action_id: "A-1",
      before_object: value.repositoryObject.sha256, before_repository_object: value.repositoryObject,
      after_object: value.repositoryObject.sha256, after_repository_object: value.repositoryObject,
      comparators: [registeredComparator("semantic_boundary", value.repositoryObject, value.repositoryObject)],
      introduced: 0, paid_before_boundary: 0, open_at_boundary: 0,
      boundary_status: "closed", observed_at: AFTER,
    }];

    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.report.regression_control.evidence_ref.action_checks[0].comparators: every mutating action requires planning_graph",
    );
  });

  it("rejects unknown and duplicate detector families within an action comparator subset", async () => {
    const unknown = await fixture();
    useLegacyRegression(unknown, "1.4");
    const action = executedAction();
    unknown.report.actions = [action];
    unknown.manifest.actions = [action];
    unknown.manifest.execution_state = "executed";
    (unknown.report.regression_control as RecordValue).action_checks = 1;
    const unknownCommand = "fixture unknown detector";
    const unknownDetector = "fixture/unknown@1";
    unknown.regression.action_checks = [{
      action_id: "A-1",
      before_object: unknown.repositoryObject.sha256, before_repository_object: unknown.repositoryObject,
      after_object: unknown.repositoryObject.sha256, after_repository_object: unknown.repositoryObject,
      comparators: [{
        id: "unknown", detector_id: "unknown_detector", command: unknownCommand, scope: ".", detector: unknownDetector,
        observations: [
          comparatorObservation("before", unknown.repositoryObject.sha256, unknownCommand, unknownDetector, [], "before", NOW, unknown.repositoryObject, "A-1", "unknown"),
          comparatorObservation("after", unknown.repositoryObject.sha256, unknownCommand, unknownDetector, [], "after", AFTER, unknown.repositoryObject, "A-1", "unknown"),
        ],
      }],
      introduced: 0, paid_before_boundary: 0, open_at_boundary: 0,
      boundary_status: "closed", observed_at: AFTER,
    }];
    await unknown.persist();
    const unknownResult = await validateBundle(unknown.bundle, unknown.bundlePath, { repoPath: unknown.repo });
    expect(unknownResult.errors).toContain(
      "$.report.regression_control.evidence_ref.action_checks[0].comparators[0].detector_id: must name a canonical detector family",
    );

    const duplicate = await fixture();
    useLegacyRegression(duplicate, "1.4");
    duplicate.report.actions = [structuredClone(action)];
    duplicate.manifest.actions = [structuredClone(action)];
    duplicate.manifest.execution_state = "executed";
    (duplicate.report.regression_control as RecordValue).action_checks = 1;
    duplicate.regression.action_checks = [{
      action_id: "A-1",
      before_object: duplicate.repositoryObject.sha256, before_repository_object: duplicate.repositoryObject,
      after_object: duplicate.repositoryObject.sha256, after_repository_object: duplicate.repositoryObject,
      comparators: [
        registeredComparator("planning_graph", duplicate.repositoryObject, duplicate.repositoryObject, "planning-one"),
        registeredComparator("planning_graph", duplicate.repositoryObject, duplicate.repositoryObject, "planning-two"),
      ],
      introduced: 0, paid_before_boundary: 0, open_at_boundary: 0,
      boundary_status: "closed", observed_at: AFTER,
    }];
    await duplicate.persist();
    const duplicateResult = await validateBundle(duplicate.bundle, duplicate.bundlePath, { repoPath: duplicate.repo });
    expect(duplicateResult.errors).toContain(
      "$.report.regression_control.evidence_ref.action_checks[0].comparators[1].detector_id: duplicate detector family within action check",
    );
  });

  it("requires preserved result bytes and binds result_sha256 to them", async () => {
    const value = await fixture();
    value.report.verdict = "NOT_CLEAN";
    (value.report.handoff_assessment as RecordValue).recommendation = "proceed_with_conditions";
    (value.report.handoff_assessment as RecordValue).conditions = ["legacy comparator fixture"];
    useLegacyRegression(value, "1.2");
    const action = executedAction();
    const command = "git status --porcelain=v2";
    const detector = "git fixture";
    value.report.actions = [action];
    value.manifest.actions = [action];
    value.manifest.execution_state = "executed";
    (value.report.regression_control as RecordValue).action_checks = 1;
    const before = comparatorObservation("before", value.repositoryObject.sha256, command, detector, [], "clean", NOW, value.repositoryObject);
    const after = comparatorObservation("after", value.repositoryObject.sha256, command, detector, [], "clean", AFTER, value.repositoryObject);
    value.regression.action_checks = [{
      action_id: "A-1",
      before_object: value.repositoryObject.sha256, before_repository_object: value.repositoryObject,
      after_object: value.repositoryObject.sha256, after_repository_object: value.repositoryObject,
      comparators: [{ id: "git-status", command, scope: "repository", detector, observations: [before, after] }],
      introduced: 0, paid_before_boundary: 0, open_at_boundary: 0,
      boundary_status: "closed", observed_at: AFTER,
    }];
    await value.persist();

    const resultPath = String((before.result_ref as RecordValue).path);
    await rm(join(value.proof, resultPath));
    const missing = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(missing.errors.some((error) => error.includes("result_ref.path: file not found"))).toBe(true);

    before.result_sha256 = digest("fabricated clean output");
    await value.persist();
    const fabricated = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(fabricated.errors.some((error) => error.includes("result_sha256: must equal the digest-bound result_ref bytes"))).toBe(true);
  });

  it("refuses CLEAN when an action leaves cleanup-introduced debt open", async () => {
    const value = await fixture();
    useLegacyRegression(value, "1.2");
    const action = executedAction();
    const command = "git status --porcelain=v2";
    const detector = "git fixture";
    const generatedFile = digest("generated-file");
    action.status = "failed";
    value.report.actions = [structuredClone(action)];
    value.manifest.actions = [structuredClone(action)];
    const control = value.report.regression_control as RecordValue;
    Object.assign(control, { closing_findings: 1, introduced_by_run_open: 1, action_checks: 1 });
    Object.assign(value.regression, {
      closing_findings: 1, introduced_by_run_open: 1,
      action_checks: [{
        action_id: "A-1",
        before_object: value.repositoryObject.sha256, before_repository_object: value.repositoryObject,
        after_object: value.repositoryObject.sha256, after_repository_object: value.repositoryObject,
        comparators: [{
          id: "git-status", command, scope: "repository", detector,
          observations: [
            comparatorObservation("before", value.repositoryObject.sha256, command, detector, [], "clean", NOW, value.repositoryObject),
            comparatorObservation("after", value.repositoryObject.sha256, command, detector, [generatedFile], "untracked generated file", AFTER, value.repositoryObject),
          ],
        }],
        introduced: 1, paid_before_boundary: 0, open_at_boundary: 1,
        boundary_status: "interrupted", observed_at: AFTER,
      }],
    });
    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => error.includes("CLEAN requires zero cleanup-introduced open debt"))).toBe(true);
    expect(result.errors.some((error) => error.includes("CLEAN forbids an interrupted action boundary"))).toBe(true);

    (value.regression.action_checks as RecordValue[])[0]!.boundary_status = "closed";
    await value.persist();
    const forgedClosed = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(forgedClosed.errors.some((error) => error.includes("closed boundary requires an executed action status"))).toBe(true);
  });

  it("rejects self-asserted zero harm when comparator fingerprints prove a new finding", async () => {
    const value = await fixture();
    value.report.verdict = "NOT_CLEAN";
    (value.report.handoff_assessment as RecordValue).recommendation = "proceed_with_conditions";
    (value.report.handoff_assessment as RecordValue).conditions = ["legacy comparator fixture"];
    useLegacyRegression(value, "1.2");
    const action = executedAction();
    const command = "git status --porcelain=v2";
    const detector = "git fixture";
    const generatedFile = digest("generated-file");
    value.report.actions = [action];
    value.manifest.actions = [action];
    value.manifest.execution_state = "executed";
    (value.report.regression_control as RecordValue).action_checks = 1;
    value.regression.action_checks = [{
      action_id: "A-1",
      before_object: value.repositoryObject.sha256, before_repository_object: value.repositoryObject,
      after_object: value.repositoryObject.sha256, after_repository_object: value.repositoryObject,
      comparators: [{
        id: "git-status", command, scope: "repository", detector,
        observations: [
          comparatorObservation("before", value.repositoryObject.sha256, command, detector, [], "clean", NOW, value.repositoryObject),
          comparatorObservation("after", value.repositoryObject.sha256, command, detector, [generatedFile], "untracked generated file", AFTER, value.repositoryObject),
        ],
      }],
      introduced: 0, paid_before_boundary: 0, open_at_boundary: 0,
      boundary_status: "closed", observed_at: AFTER,
    }];
    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain("$.report.regression_control.evidence_ref.action_checks[0].introduced: must equal fingerprint-derived total (1)");
    expect(result.errors).toContain("$.report.regression_control.evidence_ref.action_checks[0].open_at_boundary: must equal fingerprint-derived total (1)");
  });

  it("requires a no-harm action check for every executed action", async () => {
    const value = await fixture();
    const action = executedAction();
    value.report.actions = [structuredClone(action)];
    value.manifest.actions = [structuredClone(action)];
    value.manifest.execution_state = "executed";
    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => error.includes("ordered action ids must exactly cover every executed or failed action"))).toBe(true);
  });

  it("binds the portable repository identity to the live repository", async () => {
    const value = await fixture();
    (value.report.repo as RecordValue).id = "different/target";
    (value.manifest.repo as RecordValue).id = "different/target";
    await value.persist();
    const result = await validateBundleFile(value.bundlePath, {
      repoPath: value.repo,
      ports: { files: nodeFilePort, git: nodeGitPort, processes: TEST_PROCESS_PORT },
      runtimeAttestation: TEST_RUNTIME_ATTESTATION,
    });
    expect(result.errors).toContain("$.report.repo.id: does not match independently resolved live repository identity");
  });

  it("never lets reference-only request evidence establish CLEAN", async () => {
    const value = await fixture();
    const criteria = value.bundle.criteria_discovery as RecordValue;
    criteria.source_kind = "reference_only";
    criteria.request_source = null;
    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain("$.criteria_discovery.source_kind: CLEAN requires exact operative request bytes");
  });

  it("detects an omitted planning artifact against the live census", async () => {
    const value = await fixture();
    const system = ((value.bundle.planning_discovery as RecordValue).systems as RecordValue[])[0]!;
    const corpus = system.corpus as RecordValue;
    corpus.artifacts = (corpus.artifacts as RecordValue[]).slice(0, 1);
    corpus.total = 1;
    corpus.classified = 1;
    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.planning_discovery.systems[0].corpus.census.summary.file_count: must equal artifact rows",
    );
  });

  it("requires canonical census evidence for every live repository-file corpus", async () => {
    const value = await fixture();
    const system = ((value.bundle.planning_discovery as RecordValue).systems as RecordValue[])[0]!;
    const corpus = system.corpus as RecordValue;
    delete corpus.census;
    await value.persist();

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.planning_discovery.systems[0].corpus.census: canonical file census is required for a live or CLEAN repository-file corpus",
    );
  });

  it("rejects a malformed canonical corpus census", async () => {
    const value = await fixture();
    const system = ((value.bundle.planning_discovery as RecordValue).systems as RecordValue[])[0]!;
    (system.corpus as RecordValue).census = { record_type: "mister-clean.file-census" };
    await value.persist();

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.planning_discovery.systems[0].corpus.census: malformed canonical file census",
    );
  });

  it("rejects artifact bytes that disagree with the canonical census", async () => {
    const value = await fixture();
    const system = ((value.bundle.planning_discovery as RecordValue).systems as RecordValue[])[0]!;
    const corpus = system.corpus as RecordValue;
    const artifact = (corpus.artifacts as RecordValue[])[0]!;
    artifact.byte_length = Number(artifact.byte_length) + 1;
    await value.persist();

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.planning_discovery.systems[0].corpus.artifacts[0].byte_length: disagrees with canonical file census",
    );
  });

  it("rejects a nested-only census under a full-root corpus claim", async () => {
    const value = await fixture();
    const system = ((value.bundle.planning_discovery as RecordValue).systems as RecordValue[])[0]!;
    (system.corpus as RecordValue).census = await captureFileCensus({
      repository_root: value.repo,
      roots: ["planning/backlog"],
    });
    await value.persist();

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      "$.planning_discovery.systems[0].corpus.census.scope.roots: must equal corpus.roots",
    );
  });

  it("uses the canonical census for live corpus closure instead of repository-walk ignores", async () => {
    const value = await fixture();
    await rm(join(value.repo, "planning"), { recursive: true, force: true });
    const directPath = "corpus/direct.txt";
    const generatedPath = "corpus/build/generated.txt";
    const directContent = "direct planning reference\n";
    const generatedContent = "generated planning reference\n";
    await Promise.all([
      put(join(value.repo, directPath), directContent),
      put(join(value.repo, generatedPath), generatedContent),
    ]);
    await git(value.repo, "add", "-A");
    await git(value.repo, "commit", "-m", "install canonical census fixture");
    rebind(value, await git(value.repo, "rev-parse", "HEAD"));

    const canonical = await captureFileCensus({ repository_root: value.repo, roots: ["corpus"] });
    const corpus = (((value.bundle.planning_discovery as RecordValue).systems as RecordValue[])[0]!.corpus as RecordValue);
    Object.assign(corpus, {
      roots: ["corpus"],
      include_globs: ["**/*.txt"],
      total: 2,
      classified: 2,
      unclassified: 0,
      census: canonical,
      artifacts: [
        {
          path: generatedPath,
          class: "reference",
          classification_rationale: "generated planning reference retained in the governed corpus",
          sha256: digest(generatedContent),
          byte_length: Buffer.byteLength(generatedContent),
        },
        {
          path: directPath,
          class: "reference",
          classification_rationale: "direct planning reference retained in the governed corpus",
          sha256: digest(directContent),
          byte_length: Buffer.byteLength(directContent),
        },
      ],
    });
    await value.persist();

    const accepted = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(accepted).toEqual({ errors: [], ok: true });

    const directEntry = canonical.entries.find((entry) => entry.path === directPath)!;
    corpus.census = {
      ...canonical,
      summary: {
        file_count: 1,
        direct_file_count: 1,
        nested_file_count: 0,
        total_bytes: directEntry.byte_length,
        aggregate_sha256: digest(`${directEntry.sha256}  ${directEntry.path}\n`),
      },
      entries: [directEntry],
    };
    corpus.total = 1;
    corpus.classified = 1;
    corpus.artifacts = (corpus.artifacts as RecordValue[]).filter((artifact) => artifact.path === directPath);
    await value.persist();

    const unchanged = await captureFileCensus({ repository_root: value.repo, roots: ["corpus"] });
    expect(unchanged.summary.aggregate_sha256).toBe(canonical.summary.aggregate_sha256);
    const rejected = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(rejected.errors).toContain(
      `$.planning_discovery.systems[0].corpus: live canonical census mismatch missing_from_bundle=[${JSON.stringify(generatedPath)}] absent_from_live=[] changed=[]`,
    );
  });

  it("requires unsupported planning entries to be explicitly classified as non-artifacts", async () => {
    const value = await fixture();
    const start = value.head;
    const path = "planning/CURRENT.org";
    const content = "* Current planning state\n";
    await put(join(value.repo, path), content);
    await git(value.repo, "add", ".");
    await git(value.repo, "commit", "-m", "add unsupported planning entry");
    rebind(value, await git(value.repo, "rev-parse", "HEAD"), start);
    const corpus = (((value.bundle.planning_discovery as RecordValue).systems as RecordValue[])[0]!.corpus as RecordValue);
    (corpus.artifacts as RecordValue[]).push({ path, class: "active", sha256: digest(content) });
    corpus.total = 3;
    corpus.classified = 3;
    await value.persist();

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => error.includes(
      `unsupported planning entry ${path} requires an explicit non-artifact class and classification_rationale`,
    ))).toBe(true);
  });

  it("rejects planning symlinks explicitly instead of counting them as regular files", async () => {
    const value = await fixture();
    const start = value.head;
    await symlink("backlog/next.md", join(value.repo, "planning", "LINK.md"));
    await git(value.repo, "add", ".");
    await git(value.repo, "commit", "-m", "add planning symlink");
    rebind(value, await git(value.repo, "rev-parse", "HEAD"), start);
    await value.persist();

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) =>
      error.includes("live canonical census failed: census rejects symbolic link: planning/LINK.md"))).toBe(true);
  });

  it("discovers a planning root below more than five directory levels", async () => {
    const value = await fixture();
    const deepRoot = "one/two/three/four/five/six/planning";
    const deepPath = `${deepRoot}/backlog/DEEP.md`;
    await put(join(value.repo, deepPath), "---\nartifact_type: story\nstory_id: DEEP\nstatus: backlog\n---\n");
    await git(value.repo, "add", ".");
    await git(value.repo, "commit", "-m", "add deep planning root");
    rebind(value, await git(value.repo, "rev-parse", "HEAD"));
    await value.persist();

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      `$.planning_discovery.systems: independently discovered planning roots are not fully covered: [${JSON.stringify(deepRoot)}]`,
    );
  });

  it("independently discovers a canonical planning file outside reserved directories", async () => {
    const value = await fixture();
    const start = value.head;
    const roadmap = "docs/ROADMAP.md";
    await put(join(value.repo, roadmap), "# Roadmap\n\nAcceptance remains pending.\n");
    await git(value.repo, "add", ".");
    await git(value.repo, "commit", "-m", "add canonical roadmap file");
    rebind(value, await git(value.repo, "rev-parse", "HEAD"), start);
    await value.persist();

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain(
      `$.planning_discovery.systems: independently discovered planning roots are not fully covered: [${JSON.stringify(roadmap)}]`,
    );
  });

  it("keeps standalone, prepare, and bundle semantics invariant for a cross-root relationship", async () => {
    const value = await fixture();
    await installCrossRootPlanning(value, "CROSS-PARENT");

    const standalone = auditPlanningRepository(value.repo);
    const prepared = await preparedPlanningAudit(value, "cross-root-valid");
    expect(standalone.findings).toEqual([]);
    expect(prepared).toEqual(standalone);

    await value.persist();
    await expect(validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo }))
      .resolves.toEqual({ errors: [], ok: true });
  });

  it("keeps a missing cross-root target invariant across standalone, prepare, and bundle", async () => {
    const value = await fixture();
    await installCrossRootPlanning(value, "MISSING-PARENT");

    const standalone = auditPlanningRepository(value.repo);
    const prepared = await preparedPlanningAudit(value, "cross-root-missing");
    expect(standalone.findings.map((finding) => finding.code)).toEqual([
      "orphan_parent_reference",
      "planning_relationship_unresolved",
    ]);
    expect(prepared).toEqual(standalone);

    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    const semanticErrors = result.errors.filter((error) => error.startsWith("$.planning_discovery.corpus: "));
    expect(semanticErrors).toHaveLength(standalone.findings.length);
    for (const finding of standalone.findings) {
      expect(semanticErrors.some((error) => error.includes(
        `${finding.code} at ${finding.path} (${finding.subject}): ${finding.detail}`,
      ))).toBe(true);
    }
  });

  it("does not let a bundle archive a live planning artifact by label alone", async () => {
    const value = await fixture();
    const system = ((value.bundle.planning_discovery as RecordValue).systems as RecordValue[])[0]!;
    const artifacts = (system.corpus as RecordValue).artifacts as RecordValue[];
    artifacts.find((artifact) => artifact.path === "planning/backlog/next.md")!.class = "archived";
    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => error.includes("archive_classification_conflict"))).toBe(true);
  });

  it("does not let a reasoned guidance label suppress live planning signals", async () => {
    const value = await fixture();
    const system = ((value.bundle.planning_discovery as RecordValue).systems as RecordValue[])[0]!;
    const artifacts = (system.corpus as RecordValue).artifacts as RecordValue[];
    const target = artifacts.find((artifact) => artifact.path === "planning/backlog/next.md")!;
    target.class = "guidance";
    target.classification_rationale = "claimed prose";
    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => error.includes("non-artifact classification conflicts"))).toBe(true);
  });

  it("refuses a CLEAN bundle when its live planning graph contains an unpaid cascade", async () => {
    const value = await fixture();
    const start = value.head;
    const parentPath = "planning/active/WORK-CASCADE.md";
    const childPath = "planning/done/TASK-CASCADE.md";
    const parentContent = "---\nartifact_type: story\nstory_id: WORK-CASCADE\nstatus: active\nholdout_status: not_run\n---\n";
    const childContent = "---\nartifact_type: slice\nslice_id: TASK-CASCADE\nparent_id: WORK-CASCADE\nstatus: done\n---\n";
    await Promise.all([
      put(join(value.repo, parentPath), parentContent),
      put(join(value.repo, childPath), childContent),
    ]);
    await git(value.repo, "add", ".");
    await git(value.repo, "commit", "-m", "add unpaid acceptance cascade");
    const head = await git(value.repo, "rev-parse", "HEAD");
    rebind(value, head, start);

    const corpus = (((value.bundle.planning_discovery as RecordValue).systems as RecordValue[])[0]!.corpus as RecordValue);
    const artifacts = corpus.artifacts as RecordValue[];
    artifacts.push(
      { path: parentPath, class: "active", sha256: digest(parentContent) },
      { path: childPath, class: "done", sha256: digest(childContent) },
    );
    corpus.total = 4;
    corpus.classified = 4;

    const parentAction = executedAction(parentPath);
    const childAction = executedAction(childPath);
    parentAction.id = "A-CASCADE-PARENT";
    childAction.id = "A-CASCADE-CHILD";
    ((((parentAction.outcome as RecordValue).evidence as RecordValue[])[0]!.evidence_ref) as RecordValue).path = "action-result-A-CASCADE-PARENT.json";
    ((((childAction.outcome as RecordValue).evidence as RecordValue[])[0]!.evidence_ref) as RecordValue).path = "action-result-A-CASCADE-CHILD.json";
    const actions = [parentAction, childAction];
    value.report.actions = actions;
    value.manifest.actions = actions;
    value.manifest.execution_state = "executed";
    value.bundle.change_inventory = {
      start_commit: start,
      subject_commit: head,
      changes: [
        { status: "A", path: parentPath, action_ids: ["A-CASCADE-PARENT"], exclusion: null },
        { status: "A", path: childPath, action_ids: ["A-CASCADE-CHILD"], exclusion: null },
      ],
    };

    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => error.includes("acceptance_cascade_unexecuted"))).toBe(true);
  });

  it("requires handoff entrypoints to be files, not directories", async () => {
    const value = await fixture();
    ((value.bundle.successor_readiness as RecordValue).handoff as RecordValue).entrypoints = ["planning"];
    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => error.includes("must be an existing repository-relative file"))).toBe(true);
  });

  it("requires each start-to-subject change to map to an action or exclusion", async () => {
    const value = await fixture();
    value.bundle.change_inventory = {
      start_commit: value.head, subject_commit: value.head,
      changes: [{ status: "M", path: "planning/done/done.md", action_ids: [], exclusion: null }],
    };
    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => error.includes("requires an executed action mapping"))).toBe(true);
  });

  it("normalizes reviewer aliases before deciding independence", async () => {
    const value = await fixture();
    const review = (value.bundle.successor_readiness as RecordValue).final_review as RecordValue;
    review.reviewer = " FIXTURE-IMPLEMENTER ";
    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain("$.successor_readiness.final_review: reviewer must differ from implementer");
  });

  it("refuses CLEAN under structural-only validation", async () => {
    const value = await fixture();
    const result = await validateBundle(value.bundle, value.bundlePath, { verifyLive: false });
    expect(result.errors).toContain("$.verdict: CLEAN requires live verification");
  });

  it("keeps an initialized schema 1.3 GUARD live-valid without external authority", async () => {
    const value = await fixture();
    const prepared = await prepareCloseout({
      repo: value.repo,
      evidenceHome: join(value.root, "guard-evidence"),
      runId: "guard-live",
      requestRef: "request-guard-live",
      requestText: "$mister-clean guard",
      mode: "GUARD",
    });
    await expect(validateBundleFile(prepared.bundlePath, {
      repoPath: value.repo,
      acceptedEvaluatorPath: join(value.root, "retained-accepted-release.json"),
      guardAuthorityPath: join(value.root, "retained-guard-authority.json"),
    })).resolves.toEqual({ errors: [], ok: true });
  });

  it("validates a fully externalized schema 1.3 passed/open GUARD candidate", async () => {
    const value = await preparedGuardFixture();
    await expect(validateBundleFile(value.bundlePath, {
      repoPath: value.repo,
      acceptedEvaluatorPath: value.acceptedEvaluatorPath,
      guardAuthorityPath: value.authority.precommitPath,
      runtimeAttestation: TEST_RUNTIME_ATTESTATION,
      validationTime: VALIDATION_TIME,
    })).resolves.toEqual({ errors: [], ok: true });
  });

  it("validates the same retained authority after a real one-parent GUARD crossing", async () => {
    const value = await preparedGuardFixture();
    const crossingPath = await crossPreparedGuardFixture(value);
    await expect(validateBundleFile(value.bundlePath, {
      repoPath: value.repo,
      acceptedEvaluatorPath: value.acceptedEvaluatorPath,
      guardAuthorityPath: crossingPath,
      runtimeAttestation: TEST_RUNTIME_ATTESTATION,
      validationTime: VALIDATION_TIME,
    })).resolves.toEqual({ errors: [], ok: true });
  });

  it("rejects a bypass commit followed by a repair descendant", async () => {
    const value = await preparedGuardFixture();
    const crossingPath = await crossPreparedGuardFixture(value, { repairDescendant: true });
    const result = await validateBundleFile(value.bundlePath, {
      repoPath: value.repo,
      acceptedEvaluatorPath: value.acceptedEvaluatorPath,
      guardAuthorityPath: crossingPath,
      runtimeAttestation: TEST_RUNTIME_ATTESTATION,
      validationTime: VALIDATION_TIME,
    });
    expect(result.errors).toContain(
      "$.guard_authority.commit.parent: commit must have exactly the guarded baseline parent",
    );
  });

  it("rejects an alternate valid four-role barrier selection without authority recustody", async () => {
    const value = await preparedGuardFixture();
    const crossingPath = await crossPreparedGuardFixture(value);
    value.manifest.guard.commit_barrier.receipt_ids = structuredClone(value.authority.alternateReceiptSeals);
    value.manifest.actions[0].guard_commit.receipt_ids = structuredClone(value.authority.alternateReceiptSeals);
    value.report.actions[0].guard_commit.receipt_ids = structuredClone(value.authority.alternateReceiptSeals);
    await value.persist();
    const result = await validateBundleFile(value.bundlePath, {
      repoPath: value.repo,
      acceptedEvaluatorPath: value.acceptedEvaluatorPath,
      guardAuthorityPath: crossingPath,
      runtimeAttestation: TEST_RUNTIME_ATTESTATION,
      validationTime: VALIDATION_TIME,
    });
    expect(result.errors).toContain(
      "$.guard_authority.commit_barrier: must equal the exact current guard.commit_barrier projection",
    );
  });

  it("rejects recustody of only the crossing candidate RepositoryObject", async () => {
    const value = await preparedGuardFixture();
    const crossingPath = await crossPreparedGuardFixture(value);
    const crossing = JSON.parse(await readFile(crossingPath, "utf8")) as TestRecord;
    crossing.candidate.repository_object.sha256 = "0".repeat(64);
    value.manifest.guard.authority.crossing_sha256 = await writeCanonicalTestRecord(crossingPath, crossing);
    await value.persist();

    const result = await validateBundleFile(value.bundlePath, {
      repoPath: value.repo,
      acceptedEvaluatorPath: value.acceptedEvaluatorPath,
      guardAuthorityPath: crossingPath,
      runtimeAttestation: TEST_RUNTIME_ATTESTATION,
      validationTime: VALIDATION_TIME,
    });
    expect(result.errors).toContain(
      "$.guard_authority.candidate: must equal the historical precommit candidate projection",
    );
  });

  it.each([
    {
      name: "selected/retained precommit mismatch",
      expected: "separately retained precommit",
      mutate: async (value: PreparedGuardFixture) => {
        const changed = structuredClone(value.authority.precommit);
        changed.task_id = "changed-after-crossing";
        await writeCanonicalTestRecord(value.authority.precommitPath, changed);
        return {};
      },
    },
    {
      name: "selected authority recustody drift",
      expected: "symlink or realpath alias",
      mutate: async (_value: PreparedGuardFixture, crossingPath: string) => ({ ports: recustodyPorts(crossingPath) }),
    },
    {
      name: "retained precommit recustody drift",
      expected: "symlink or realpath alias",
      mutate: async (value: PreparedGuardFixture) => ({ ports: recustodyPorts(value.authority.precommitPath) }),
    },
    {
      name: "HEAD drift",
      expected: "HEAD must equal the resulting commit",
      mutate: async (value: PreparedGuardFixture) => {
        await git(value.repo, "checkout", "--detach", String(value.candidate.baseline_commit));
        return {};
      },
    },
    {
      name: "dirty worktree drift",
      expected: "requires a clean tracked/untracked worktree",
      mutate: async (value: PreparedGuardFixture) => {
        await put(join(value.repo, "drift.txt"), "untracked drift\n");
        return {};
      },
    },
    {
      name: "index/tree drift",
      expected: "live index tree differs",
      mutate: async (value: PreparedGuardFixture) => {
        const baselineBlob = await git(value.repo, "rev-parse", `${value.candidate.baseline_commit}:CURRENT-STATE.md`);
        await git(value.repo, "update-index", "--cacheinfo", "100644", baselineBlob, "CURRENT-STATE.md");
        return {};
      },
    },
    {
      name: "target ref drift",
      expected: "target",
      mutate: async (value: PreparedGuardFixture) => {
        await git(value.repo, "update-ref", "refs/heads/main", String(value.candidate.baseline_commit));
        return {};
      },
    },
    {
      name: "worktree topology drift",
      expected: "live worktree set changed",
      mutate: async (value: PreparedGuardFixture) => {
        let reads = 0;
        const lateWorktree = join(value.root, "late-worktree");
        const ports: BundlePorts = {
          ...nodeBundlePorts,
          git: {
            async run(path, args, allowed) {
              if (args[0] === "worktree" && args[1] === "list" && ++reads === 2) {
                await git(value.repo, "worktree", "add", "--detach", lateWorktree, "HEAD");
              }
              return nodeBundlePorts.git.run(path, args, allowed);
            },
          },
        };
        return { ports };
      },
    },
  ])("rejects crossed GUARD $name", async ({ expected, mutate }) => {
    const value = await preparedGuardFixture();
    const crossingPath = await crossPreparedGuardFixture(value);
    const mutation = await mutate(value, crossingPath);
    const result = await validateBundleFile(value.bundlePath, {
      repoPath: value.repo,
      acceptedEvaluatorPath: value.acceptedEvaluatorPath,
      guardAuthorityPath: crossingPath,
      runtimeAttestation: TEST_RUNTIME_ATTESTATION,
      validationTime: VALIDATION_TIME,
      ...mutation,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes(expected))).toBe(true);
  });

  it("keeps custody sidecar-only", async () => {
    const value = await fixture();
    (value.bundle.custody as RecordValue).mode = "receipt_commit";
    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors).toContain("$.custody.mode: only sidecar is supported");
  });

  it("does not let a local bundle establish an external claim", async () => {
    const value = await fixture();
    ((value.report.claims as RecordValue).deployed as RecordValue).state = "established";
    ((value.report.claims as RecordValue).deployed as RecordValue).evidence = [{ kind: "deployment_receipt" }];
    await value.persist();
    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) => error.includes("cannot establish external claim deployed"))).toBe(true);
  });

  it("validates the shipped placeholder bundle as a template", async () => {
    const path = join(process.cwd(), "assets/closure-bundle.json");
    const result = await validateBundleFile(path, { allowPlaceholders: true, verifyLive: false });
    expect(result).toEqual({ errors: [], ok: true });
  });
});

describe("test_validate_bundle.py behavior parity", () => {
  async function checked(value: Fixture, options: Parameters<typeof validateBundle>[2] = { repoPath: value.repo }) {
    await value.persist();
    return validateBundle(value.bundle, value.bundlePath, options);
  }

  it("canonical_bundle_template_validates", async () => {
    const result = await validateBundleFile(join(process.cwd(), "assets/closure-bundle.json"), { allowPlaceholders: true, verifyLive: false });
    expect(result).toEqual({ errors: [], ok: true });
  });

  it("live_bound_bundle_passes", async () => {
    const value = await fixture();
    expect(await checked(value)).toEqual({ errors: [], ok: true });
  });

  it("standalone_clean_report_is_refused", async () => {
    const value = await fixture();
    expect(validateReport(value.report).some((error) => error.includes("closure-bundle"))).toBe(true);
  });

  it("nonexistent_repository_is_refused", async () => {
    const value = await fixture();
    const result = await checked(value, { repoPath: "/definitely/not/a/repository" });
    expect(result.errors.some((error) => error.includes("repository not found"))).toBe(true);
  });

  it("declared_repository_identity_must_match_live_origin_or_root", async () => {
    const value = await fixture();
    (value.report.repo as RecordValue).id = "different/target";
    (value.manifest.repo as RecordValue).id = "different/target";
    expect((await checked(value)).errors.some((error) => error.includes("live repository identity"))).toBe(true);
  });

  it("structural_mode_cannot_establish_clean", async () => {
    const value = await fixture();
    expect((await checked(value, { verifyLive: false })).errors.some((error) => error.includes("requires live verification"))).toBe(true);
  });

  it("invalid_timestamp_is_refused", async () => {
    const value = await fixture();
    (successor(value).target_observation as RecordValue).observed_at = "not-a-time";
    expect((await checked(value)).errors.some((error) => error.includes("target_observation.observed_at") && error.includes("ISO-8601"))).toBe(true);
  });

  it("invalid_report_measurement_time_is_refused", async () => {
    const value = await fixture();
    (value.report.target_binding as RecordValue).measured_at = "not-a-time";
    expect((await checked(value)).errors.some((error) => error.includes("target_binding.measured_at"))).toBe(true);
  });

  it("empty_dimension_evidence_is_refused", async () => {
    const value = await fixture();
    (((value.report.dimensions as RecordValue).planning_integrity as RecordValue).evidence) = [{}];
    expect((await checked(value)).errors.some((error) => error.includes("planning_census"))).toBe(true);
  });

  it("partial_gate_is_refused_despite_zero_exit", async () => {
    const value = await fixture();
    const gate = (successor(value).gates as RecordValue[])[0]!;
    gate.verified = 7; gate.total = 10;
    expect((await checked(value)).errors.some((error) => error.includes("verified must equal total"))).toBe(true);
  });

  it("omitted_planning_artifact_is_refused", async () => {
    const value = await fixture();
    const corpus = (((value.bundle.planning_discovery as RecordValue).systems as RecordValue[])[0]!.corpus as RecordValue);
    corpus.artifacts = (corpus.artifacts as RecordValue[]).slice(0, 1); corpus.total = 1; corpus.classified = 1;
    expect((await checked(value)).errors).toContain(
      "$.planning_discovery.systems[0].corpus.census.summary.file_count: must equal artifact rows",
    );
  });

  it("declaring_no_planning_cannot_hide_a_live_planning_root", async () => {
    const value = await fixture();
    (value.bundle.planning_discovery as RecordValue).systems = [{ id: "none", kind: "none", sources: ["root scan"], schema_sources: ["no schema found"], validators: ["common-root scan"], corpus: { roots: [], include_globs: [], total: 0, classified: 0, unclassified: 0, artifacts: [] } }];
    expect((await checked(value)).errors.some((error) => error.includes("contradicts live planning candidates"))).toBe(true);
  });

  it("omitted_operator_criterion_is_refused", async () => {
    const value = await fixture();
    Object.assign(value.bundle.criteria_discovery as RecordValue, { criteria_ids: [], discovered_count: 0, none_found: true });
    expect((await checked(value)).errors.some((error) => error.includes("acceptance_criteria ids"))).toBe(true);
  });

  it("reference_only_request_source_cannot_establish_clean", async () => {
    const value = await fixture();
    Object.assign(value.bundle.criteria_discovery as RecordValue, { source_kind: "reference_only", request_source: null });
    expect((await checked(value)).errors.some((error) => error.includes("exact operative request bytes"))).toBe(true);
  });

  it("report_manifest_action_sets_must_match", async () => {
    const value = await fixture();
    value.report.actions = [{ id: "A-1", status: "executed" }];
    expect((await checked(value)).errors.some((error) => error.includes("exact action id sets"))).toBe(true);
  });

  it("report_manifest_action_contents_must_match", async () => {
    const value = await fixture();
    const action = executedAction();
    value.report.actions = [structuredClone(action)]; value.manifest.actions = [structuredClone(action)]; value.manifest.execution_state = "executed";
    (value.report.actions as RecordValue[])[0]!.target = "planning/backlog/next.md";
    expect((await checked(value)).errors.some((error) => error.includes("canonical action records"))).toBe(true);
  });

  it("duplicate_report_action_id_is_refused", async () => {
    const value = await fixture();
    const action = executedAction();
    value.report.actions = [structuredClone(action), structuredClone(action)]; value.manifest.actions = [structuredClone(action)]; value.manifest.execution_state = "executed";
    expect((await checked(value)).errors.some((error) => error.includes("unique id") || error.includes("duplicate"))).toBe(true);
  });

  it("zero_scope_gate_is_refused", async () => {
    const value = await fixture();
    const gate = (successor(value).gates as RecordValue[])[0]!; gate.verified = 0; gate.total = 0;
    expect((await checked(value)).errors.some((error) => error.includes("zero-scope"))).toBe(true);
  });

  it("narrow_planning_root_is_refused", async () => {
    const value = await fixture();
    const corpus = (((value.bundle.planning_discovery as RecordValue).systems as RecordValue[])[0]!.corpus as RecordValue);
    corpus.roots = ["planning/done"]; corpus.artifacts = (corpus.artifacts as RecordValue[]).slice(0, 1); corpus.total = 1; corpus.classified = 1;
    expect((await checked(value)).errors.some((error) => error.includes("independently discovered planning roots"))).toBe(true);
  });

  it("nonstandard_work_items_planning_root_is_discovered", async () => {
    const value = await fixture();
    await put(join(value.repo, "ops/work-items/closed/story.md"), "implementation DONE; required review NOT RUN\n");
    expect((await checked(value)).errors.some((error) => error.includes("independently discovered planning roots"))).toBe(true);
  });

  it("nonexistent_gate_evidence_is_refused", async () => {
    const value = await fixture();
    (((successor(value).gates as RecordValue[])[0]!.evidence_ref) as RecordValue).path = "missing.json";
    expect((await checked(value)).errors.some((error) => error.includes("file not found"))).toBe(true);
  });

  it("fake_snapshot_object_is_refused", async () => {
    const value = await fixture();
    (((successor(value).snapshots as RecordValue).start as RecordValue).object) = "0".repeat(40);
    expect((await checked(value)).errors.some((error) => error.includes("must equal the bound repository object"))).toBe(true);
  });

  it("git_metadata_cannot_be_current_state", async () => {
    const value = await fixture();
    const current = successor(value).current_state as RecordValue;
    current.path = ".git/HEAD"; current.sha256 = digest(await readFile(join(value.repo, ".git/HEAD")));
    expect((await checked(value)).errors.some((error) => error.includes("Git metadata"))).toBe(true);
  });

  it("unverified_readme_candidate_cannot_establish_clean", async () => {
    const value = await fixture();
    Object.assign(successor(value).current_state as RecordValue, { state: "candidate_unverified", designation: null });
    expect((await checked(value)).errors.some((error) => error.includes("CLEAN requires designated"))).toBe(true);
  });

  it("handoff_entrypoint_must_resolve_inside_repo", async () => {
    const value = await fixture();
    (successor(value).handoff as RecordValue).entrypoints = ["/etc/passwd"];
    expect((await checked(value)).errors.some((error) => error.includes("repository-relative"))).toBe(true);
  });

  it("configured_upstream_forbids_local_only_target_proof", async () => {
    const value = await fixture();
    const bare = join(value.root, "remote.git");
    await execute("git", ["init", "--bare", bare]); await git(value.repo, "remote", "add", "origin", bare); await git(value.repo, "push", "-u", "origin", "main");
    (successor(value).topology as RecordValue).remote_refs = [{ name: "refs/remotes/origin/main", commit: value.head, merged: true, owner: "fixture", purpose: "configured upstream", disposition: "retain" }];
    expect((await checked(value)).errors.some((error) => error.includes("configured upstream forbids local-only"))).toBe(true);
  });

  it("uninventoried_remote_tracking_ref_is_refused", async () => {
    const value = await fixture();
    await git(value.repo, "update-ref", "refs/remotes/origin/forgotten", value.head);
    expect((await checked(value)).errors.some((error) => error.includes("remote-ref set differs"))).toBe(true);
  });

  it("bound_policy_does_not_suppress_divergent_branch", async () => {
    const value = await fixture();
    await git(value.repo, "switch", "-c", "divergent"); await put(join(value.repo, "side.txt"), "side branch\n"); await git(value.repo, "add", "side.txt"); await git(value.repo, "commit", "-m", "divergent work");
    const side = await git(value.repo, "rev-parse", "HEAD"); await git(value.repo, "switch", "main");
    const topology = successor(value).topology as RecordValue;
    (topology.branches as RecordValue[]).push({ name: "divergent", commit: side, merged: false, owner: "fixture", purpose: "side work", disposition: "retain temporarily", policy_ref: ref("topology-policy.json") });
    await putJson(join(value.proof, "topology-policy.json"), { record_type: "mister-clean.topology-policy", surface: "branches", identity: "divergent", commit: side, request_sha256: (value.bundle.criteria_discovery as RecordValue).request_sha256, actor: "fixture", scope: "divergent branch", rationale: "retain temporarily", next_action: "integrate or remove" });
    expect((await checked(value)).errors.some((error) => error.includes("unmerged=1") || error.includes("unresolved topology row"))).toBe(true);
  });

  it("satisfied_debt_rejects_textual_assertion", async () => {
    const value = await fixture();
    value.report.completion_debts = [{ id: "D-1", procedure: "implementation -> review", state: "satisfied", disposition: "autonomously_validate", evidence: ["fake textual assertion"] }];
    value.report.debt_census = { discovered: 1, paid: 1, accepted_exception: 0 };
    expect((await checked(value)).errors.some((error) => error.includes("allowlisted"))).toBe(true);
  });

  it("symlink_escape_action_is_refused_live", async () => {
    const value = await fixture();
    const external = join(value.root, "external"); await mkdir(external); await symlink(external, join(value.repo, "escape"), "dir");
    await git(value.repo, "add", "escape"); await git(value.repo, "commit", "-m", "add symlink"); const head = await git(value.repo, "rev-parse", "HEAD"); rebind(value, head);
    const action = executedAction("escape/secret"); value.report.actions = [structuredClone(action)]; value.manifest.actions = [structuredClone(action)]; value.manifest.execution_state = "executed";
    expect((await checked(value)).errors.some((error) => error.includes("symlink"))).toBe(true);
  });

  it("not_clean_bundle_can_record_unresolved_state", async () => {
    const value = await fixture();
    value.report.verdict = "NOT_CLEAN"; value.report.handoff_assessment = { recommendation: "do_not_proceed", reasons: ["review unresolved"], conditions: [] };
    (value.report.dimensions as RecordValue).verification = { state: "open", evidence: [], notes: ["review pending"] };
    successor(value).gates = []; (successor(value).topology as RecordValue).stashes = ["stash@{0}"];
    Object.assign(successor(value).final_review as RecordValue, { status: "conditional", findings_total: 1, findings_paid: 0, unresolved: 1 });
    expect(await checked(value)).toEqual({ errors: [], ok: true });
  });

  it("unresolved_final_review_is_refused", async () => {
    const value = await fixture();
    Object.assign(successor(value).final_review as RecordValue, { status: "conditional", findings_total: 1, findings_paid: 0, unresolved: 1 });
    expect((await checked(value)).errors.some((error) => error.includes("final_review"))).toBe(true);
  });

  it("reviewer_identity_alias_is_not_independent", async () => {
    const value = await fixture();
    (successor(value).final_review as RecordValue).reviewer = " FIXTURE-IMPLEMENTER ";
    expect((await checked(value)).errors.some((error) => error.includes("reviewer must differ"))).toBe(true);
  });

  it("changed_path_requires_action_even_with_bound_exclusion", async () => {
    const value = await fixture(); const start = value.head;
    await put(join(value.repo, "planning/done/done.md"), "done and amended\n"); await git(value.repo, "add", "."); await git(value.repo, "commit", "-m", "material change");
    const head = await git(value.repo, "rev-parse", "HEAD"); rebind(value, head, start);
    value.bundle.change_inventory = { start_commit: start, subject_commit: head, changes: [{ status: "M", path: "planning/done/done.md", action_ids: [], exclusion: ref("change-exclusion.json") }] };
    const artifacts = ((((value.bundle.planning_discovery as RecordValue).systems as RecordValue[])[0]!.corpus as RecordValue).artifacts as RecordValue[]);
    artifacts.find((item) => item.path === "planning/done/done.md")!.sha256 = digest("done and amended\n");
    const exclusion = { record_type: "mister-clean.change-exclusion", path: "planning/done/done.md", status: "M", start_commit: start, subject_commit: head, request_sha256: (value.bundle.criteria_discovery as RecordValue).request_sha256, actor: "fixture", scope: "preexisting concurrent change", rationale: "adopted into closing subject" };
    await putJson(join(value.proof, "change-exclusion.json"), exclusion);
    ((((value.bundle.change_inventory as RecordValue).changes as RecordValue[])[0]!.exclusion) as RecordValue).sha256 = digest(await readFile(join(value.proof, "change-exclusion.json")));
    expect((await checked(value)).errors.some((error) => error.includes("requires an executed action mapping"))).toBe(true);
  });
});
