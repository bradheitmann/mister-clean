import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { validateBundle, validateBundleFile } from "./bundle.js";
import { auditPlanningRepository, type PlanningAuditResult } from "./planning.js";
import { prepareCloseout } from "./prepare.js";
import { validateReport } from "./records.js";

const execute = promisify(execFile);
const temporaryRoots: string[] = [];

type RecordValue = Record<string, unknown>;
const COMPARATOR_RESULT_BYTES = Symbol("comparator-result-bytes");
type ComparatorObservationRecord = RecordValue & { [COMPARATOR_RESULT_BYTES]?: string };
const NOW = "2026-08-25T09:00:00Z";
const MIDDLE = "2026-08-25T09:00:01Z";
const AFTER = "2026-08-25T09:00:02Z";
const DONE_PLANNING = "---\nartifact_type: story\nstory_id: FIXTURE-DONE\nstatus: done\n---\n";
const NEXT_PLANNING = "---\nartifact_type: story\nstory_id: FIXTURE-NEXT\nstatus: backlog\n---\n";

async function git(repo: string, ...args: string[]): Promise<string> {
  return (await execute("git", ["-C", repo, ...args], { encoding: "utf8" })).stdout.trim();
}

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function comparatorObservation(
  phase: "before" | "intermediate" | "after",
  object: string,
  command: string,
  detector: string,
  findings: readonly string[],
  result: string,
  observedAt: string,
): RecordValue {
  const resultSha256 = digest(result);
  return {
    phase,
    object,
    command_sha256: digest(command),
    detector_sha256: digest(detector),
    result_sha256: resultSha256,
    result_ref: { path: `comparator-results/${resultSha256}.txt`, sha256: resultSha256 },
    finding_fingerprints: [...findings].sort(),
    exit_code: 0,
    observed_at: observedAt,
    [COMPARATOR_RESULT_BYTES]: result,
  };
}

async function put(path: string, value: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, value, "utf8");
}

async function putJson(path: string, value: unknown): Promise<void> {
  await put(path, `${JSON.stringify(value, null, 2)}\n`);
}

function ref(path: string): RecordValue {
  return { path, sha256: "pending" };
}

function executedAction(target = "CURRENT-STATE.md"): RecordValue {
  return {
    id: "A-1", kind: "doc_update", target, purpose: "prepare successor state", risk: "reversible_local",
    authorization: { state: "granted", source: "skill_invocation", ref: "request-1" },
    preconditions: ["repository inspected"], verification: ["target verified"], status: "executed",
    outcome: { state: "verified", evidence: [{ kind: "git_change", object: target, command: "verify target digest", result: "pass", observed_at: NOW, evidence_ref: ref("action-result-A-1.json") }] },
  };
}

function successor(value: Fixture): RecordValue {
  return value.bundle.successor_readiness as RecordValue;
}

function rebind(value: Fixture, subject: string, start = subject): void {
  value.head = subject;
  (value.report.repo as RecordValue).commit = subject;
  (value.manifest.repo as RecordValue).commit = subject;
  Object.assign(value.report.target_binding as RecordValue, { target_commit: subject, candidate_commit: subject, merge_base: subject });
  (((value.report.claims as RecordValue).committed_locally as RecordValue).evidence as RecordValue[])[0]!.commit = subject;
  (value.bundle.custody as RecordValue).subject_commit = subject;
  const inventory = value.bundle.change_inventory as RecordValue;
  inventory.start_commit = start;
  inventory.subject_commit = subject;
  const ready = successor(value);
  const snapshots = ready.snapshots as RecordValue;
  Object.assign(snapshots.start as RecordValue, { object: start, result: start });
  Object.assign(snapshots.end as RecordValue, { object: subject, result: subject });
  (ready.target_observation as RecordValue).commit = subject;
  (((ready.topology as RecordValue).worktrees as RecordValue[])[0]!).head = subject;
  (((ready.topology as RecordValue).branches as RecordValue[])[0]!).commit = subject;
  (ready.current_state as RecordValue).commit = subject;
  ((ready.gates as RecordValue[])[0]!).object = subject;
  const control = value.report.regression_control as RecordValue;
  Object.assign(control, { baseline_object: start, closing_object: subject });
  Object.assign(value.regression, { baseline_object: start, closing_object: subject });
}

interface Fixture {
  readonly root: string;
  readonly repo: string;
  readonly proof: string;
  readonly bundlePath: string;
  head: string;
  report: RecordValue;
  manifest: RecordValue;
  bundle: RecordValue;
  regression: RecordValue;
  persist(): Promise<void>;
}

async function fixture(): Promise<Fixture> {
  const root = join(tmpdir(), `mister-clean-bundle-${crypto.randomUUID()}`);
  const repo = join(root, "repo");
  const proof = join(root, "proof");
  await Promise.all([mkdir(repo, { recursive: true }), mkdir(proof, { recursive: true })]);
  temporaryRoots.push(root);
  await execute("git", ["init", "-b", "main", repo]);
  await git(repo, "config", "user.name", "Bundle Test");
  await git(repo, "config", "user.email", "bundle.invalid");
  await Promise.all([
    put(join(repo, "planning/done/done.md"), DONE_PLANNING),
    put(join(repo, "planning/backlog/next.md"), NEXT_PLANNING),
    put(join(repo, "CURRENT-STATE.md"), "Current and successor-ready.\n"),
  ]);
  await git(repo, "add", ".");
  await git(repo, "commit", "-m", "fixture");
  const head = await git(repo, "rev-parse", "HEAD");
  const now = NOW;
  const request = "request-1";
  const dimensionKinds = {
    completion_debt: "debt_census",
    repository_state: "git_topology",
    planning_integrity: "planning_census",
    verification: "validation_summary",
    handoff_readiness: "successor_readiness",
  } as const;
  const dimensions = Object.fromEntries(Object.entries(dimensionKinds).map(([name, kind]) => [
    name,
    { state: "satisfied", evidence: [{ kind, object: head, command: `verify ${name}`, result: "pass 1/1", observed_at: now }], notes: [] },
  ]));
  const report: RecordValue = {
    record_type: "mister-clean.closeout",
    schema_version: "1.2",
    generated_at: now,
    repo: { id: "repo", commit: head, branch: "main" },
    target_binding: {
      target_ref: "refs/heads/main", target_commit: head, candidate_commit: head,
      merge_base: head, target_commits_missing: 0, candidate_commits_ahead: 0,
      target_incorporated: true, measured_at: now, evidence: ["git facts"],
    },
    authorization_basis: { source: "skill_invocation", ref: request, scope: "named_repository_and_current_task", standing: true },
    scope: { included: [repo], excluded: [], policy_sources: ["fixture-policy"] },
    mode: "CLOSE",
    dimensions,
    completion_debts: [],
    actions: [],
    residuals: [],
    acceptance_criteria: [{ id: "criterion-1", source: "operator", met: true, evidence: ["verified"] }],
    claims: {
      committed_locally: { state: "established", evidence: [{ kind: "git_commit", commit: head }] },
      pushed: { state: "not_established", evidence: [] },
      ci_green_on_push: { state: "not_established", evidence: [] },
      deployed: { state: "not_established", evidence: [] },
      independently_qa_accepted: { state: "not_established", evidence: [] },
    },
    handoff_assessment: { recommendation: "proceed", reasons: ["bundle verified"], conditions: [] },
    verdict: "CLEAN",
    debt_census: { discovered: 0, paid: 0, accepted_exception: 0 },
    regression_control: {
      policy: "zero_open_run_introduced_debt", baseline_object: head, closing_object: head,
      baseline_findings: 0, closing_findings: 0, baseline_paid: 0, baseline_open: 0,
      newly_discovered_preexisting_paid: 0, newly_discovered_preexisting_open: 0,
      concurrent_external_paid: 0, concurrent_external_open: 0,
      introduced_by_run_paid: 0, introduced_by_run_open: 0, action_checks: 0,
      evidence_ref: ref("regression-delta.json"),
    },
  };
  const manifest: RecordValue = {
    record_type: "mister-clean.action-manifest", schema_version: "1.0",
    legacy_schema_acknowledged: true,
    repo: { id: "repo", commit: head }, mode: "CLOSE", request_ref: request,
    authorization_basis: { source: "skill_invocation", ref: request, scope: "named_repository_and_current_task", standing: true },
    policy_sources: ["fixture-policy"],
    execution_state: "authorized", actions: [], excluded_actions: ["unrecoverable destruction"],
  };
  const bundle: RecordValue = {
    record_type: "mister-clean.closure-bundle", schema_version: "1.0", run_id: "run-1", request_ref: request,
    report: ref("report.json"), manifest: ref("manifest.json"),
    custody: { mode: "sidecar", subject_commit: head, evidence_root: null, evidence_paths: [] },
    criteria_discovery: {
      source_kind: "exact_bytes", request_source: ref("operative-request.txt"),
      source_refs: [ref("criteria-source.json")], request_sha256: digest(request),
      discovered_count: 1, none_found: false, criteria_ids: ["criterion-1"],
    },
    change_inventory: { start_commit: head, subject_commit: head, changes: [] },
    planning_discovery: { unknown: false, systems: [{
      id: "planning", kind: "repo_files", sources: ["planning/"],
      schema_sources: ["fixture convention"], validators: ["bundle live census"],
      corpus: {
        roots: ["planning"], include_globs: ["**/*.md"], total: 2, classified: 2, unclassified: 0,
        artifacts: [
          { path: "planning/done/done.md", class: "done", sha256: digest(DONE_PLANNING) },
          { path: "planning/backlog/next.md", class: "backlog", sha256: digest(NEXT_PLANNING) },
        ],
      },
    }] },
    successor_readiness: {
      snapshots: {
        start: { kind: "repository_snapshot", object: head, command: "git snapshot start", result: head, observed_at: now },
        end: { kind: "repository_snapshot", object: head, command: "git snapshot end", result: head, observed_at: now },
      },
      target_observation: {
        kind: "local_ref_resolution", local_ref: "refs/heads/main", commit: head,
        observed_at: now, policy_evidence: ref("local-target-policy.json"),
      },
      topology: {
        worktrees: [{ path: repo, head, branch: "refs/heads/main", dirty_count: 0, owner: "fixture", purpose: "canonical worktree", disposition: "retain" }],
        branches: [{ name: "main", commit: head, merged: true, owner: "fixture", purpose: "canonical branch", disposition: "retain" }],
        remote_refs: [], stashes: [], processes: [], dirty: 0, unowned: 0, unmerged: 0, blocking_processes: 0,
      },
      current_state: {
        state: "designated", path: "CURRENT-STATE.md", sha256: digest("Current and successor-ready.\n"), commit: head,
        generator: "authored source", designation: ref("current-state-designation.json"),
      },
      gates: [{
        id: "fresh-clone", kind: "isolated_clone", object: head, command: "fixture validation",
        expected_status: 0, observed_status: 0, semantic_status: "pass", verified: 1, total: 1,
        warnings: 0, debt: 0, skipped: 0, evidence_ref: ref("gate-result.json"),
      }],
      debris: { removed: 0, retained: 0, unclassified: 0, evidence: [ref("debris-census.json")] },
      handoff: { entrypoints: ["CURRENT-STATE.md"], next_owner: "next team", next_action: "read current state" },
      final_review: {
        mechanism: "independent fixture review", status: "passed", reviewer: "fixture-reviewer", implementer: "fixture-implementer",
        reviewer_execution: { harness: "test", session_id: "review-1", receipt_id: "rr-1" },
        implementer_execution: { harness: "test", session_id: "implement-1", receipt_id: "ir-1" },
        criteria_reviewed: true, planning_reviewed: true, findings_total: 0, findings_paid: 0, unresolved: 0,
        evidence_ref: ref("independent-review.json"),
      },
    },
  };
  const regression: RecordValue = {
    record_type: "mister-clean.regression-delta", schema_version: "1.2",
    policy: "zero_open_run_introduced_debt", baseline_object: head, closing_object: head,
    baseline_findings: 0, closing_findings: 0, baseline_paid: 0, baseline_open: 0,
    newly_discovered_preexisting_paid: 0, newly_discovered_preexisting_open: 0,
    concurrent_external_paid: 0, concurrent_external_open: 0,
    introduced_by_run_paid: 0, introduced_by_run_open: 0, action_checks: [],
  };

  const value: Fixture = {
    root, repo, proof, head, report, manifest, bundle, regression, bundlePath: join(proof, "bundle.json"),
    async persist() {
      const criteria = bundle.criteria_discovery as RecordValue;
      const successor = bundle.successor_readiness as RecordValue;
      const current = successor.current_state as RecordValue;
      const gate = (successor.gates as RecordValue[])[0];
      const review = successor.final_review as RecordValue;
      const debris = successor.debris as RecordValue;
      const records: Record<string, unknown> = {
        "regression-delta.json": regression,
        "criteria-source.json": {
          record_type: "mister-clean.criteria-source", request_ref: bundle.request_ref,
          request_sha256: criteria.request_sha256, criteria_ids: criteria.criteria_ids,
        },
        "local-target-policy.json": {
          record_type: "mister-clean.local-target-policy",
          policy_ref: "fixture repository has no configured upstream",
        },
        "current-state-designation.json": {
          record_type: "mister-clean.current-state-designation", path: current.path,
          sha256: current.sha256, commit: current.commit, policy_ref: "fixture-policy#current-state",
        },
        "independent-review.json": {
          record_type: "mister-clean.independent-review", observed_at: now,
          mechanism: review.mechanism, status: review.status, reviewer: review.reviewer, implementer: review.implementer,
          reviewer_execution: review.reviewer_execution, implementer_execution: review.implementer_execution,
          candidate_commit: (report.repo as RecordValue).commit,
          criteria_ids: criteria.criteria_ids,
          planning_system_ids: ((bundle.planning_discovery as RecordValue).systems as RecordValue[]).map((system) => system.id),
          findings_total: review.findings_total, findings_paid: review.findings_paid, unresolved: review.unresolved,
        },
        "debris-census.json": {
          record_type: "mister-clean.debris-census", removed: debris.removed,
          retained: debris.retained, unclassified: debris.unclassified, observed_at: now,
        },
      };
      for (const rawCheck of (regression.action_checks ?? []) as RecordValue[]) {
        for (const rawComparator of (rawCheck.comparators ?? []) as RecordValue[]) {
          for (const rawObservation of (rawComparator.observations ?? []) as RecordValue[]) {
            const result = (rawObservation as ComparatorObservationRecord)[COMPARATOR_RESULT_BYTES];
            const resultRef = rawObservation.result_ref as RecordValue | undefined;
            if (typeof result === "string" && typeof resultRef?.path === "string") {
              await put(join(proof, resultRef.path), result);
            }
          }
        }
      }
      if (gate) {
        records["gate-result.json"] = {
          record_type: "mister-clean.gate-result", gate_id: gate.id, object: gate.object,
          command: gate.command, observed_status: gate.observed_status, semantic_status: gate.semantic_status,
          verified: gate.verified, total: gate.total, warnings: gate.warnings, debt: gate.debt, skipped: gate.skipped,
          observed_at: now,
        };
      }
      for (const raw of manifest.actions as RecordValue[]) {
        const action = raw;
        for (const evidence of (((action.outcome as RecordValue | undefined)?.evidence ?? []) as RecordValue[])) {
          const evidenceReference = evidence.evidence_ref as RecordValue;
          if (!evidenceReference || typeof evidenceReference.path !== "string") continue;
          records[evidenceReference.path] = {
            record_type: "mister-clean.action-result", action_id: action.id, kind: action.kind,
            target: action.target, object: evidence.object, command: evidence.command,
            result: evidence.result, observed_at: evidence.observed_at,
          };
        }
      }
      await put(join(proof, "operative-request.txt"), request);
      for (const [name, record] of Object.entries(records)) await putJson(join(proof, name), record);
      if (criteria.request_source !== null) {
        (criteria.request_source as RecordValue).sha256 = digest(await readFile(join(proof, "operative-request.txt")));
      }
      ((criteria.source_refs as RecordValue[])[0]!).sha256 = digest(await readFile(join(proof, "criteria-source.json")));
      (((successor.target_observation as RecordValue).policy_evidence) as RecordValue).sha256 = digest(await readFile(join(proof, "local-target-policy.json")));
      if (current.designation) (current.designation as RecordValue).sha256 = digest(await readFile(join(proof, "current-state-designation.json")));
      if (gate) (gate.evidence_ref as RecordValue).sha256 = digest(await readFile(join(proof, "gate-result.json")));
      (review.evidence_ref as RecordValue).sha256 = digest(await readFile(join(proof, "independent-review.json")));
      ((debris.evidence as RecordValue[])[0]!).sha256 = digest(await readFile(join(proof, "debris-census.json")));
      (((report.regression_control as RecordValue).evidence_ref) as RecordValue).sha256 = digest(await readFile(join(proof, "regression-delta.json")));
      for (const raw of manifest.actions as RecordValue[]) {
        for (const evidence of ((((raw.outcome as RecordValue | undefined)?.evidence ?? []) as RecordValue[]))) {
          const evidenceReference = evidence.evidence_ref as RecordValue;
          if (evidenceReference && typeof evidenceReference.path === "string") evidenceReference.sha256 = digest(await readFile(join(proof, evidenceReference.path)));
        }
      }
      await Promise.all([putJson(join(proof, "report.json"), report), putJson(join(proof, "manifest.json"), manifest)]);
      (bundle.report as RecordValue).sha256 = digest(await readFile(join(proof, "report.json")));
      (bundle.manifest as RecordValue).sha256 = digest(await readFile(join(proof, "manifest.json")));
      await putJson(join(proof, "bundle.json"), bundle);
    },
  };
  await value.persist();
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
  (value.bundle.planning_discovery as RecordValue).systems = [
    {
      id: "product-plans", kind: "repo_files", sources: ["product/plans"],
      schema_sources: ["fixture convention"], validators: ["bundle live census"],
      corpus: {
        roots: ["product/plans"], include_globs: ["**/*.md"], total: 1, classified: 1, unclassified: 0,
        artifacts: [{ path: parentPath, class: "done", sha256: digest(parentContent) }],
      },
    },
    {
      id: "delivery-tasks", kind: "repo_files", sources: ["delivery/tasks"],
      schema_sources: ["fixture convention"], validators: ["bundle live census"],
      corpus: {
        roots: ["delivery/tasks"], include_globs: ["**/*.md"], total: 1, classified: 1, unclassified: 0,
        artifacts: [{ path: childPath, class: "done", sha256: digest(childContent) }],
      },
    },
  ];
}

async function preparedPlanningAudit(value: Fixture, runId: string): Promise<PlanningAuditResult> {
  const prepared = prepareCloseout({
    repo: value.repo,
    evidenceHome: join(value.root, "prepared"),
    runId,
    requestRef: `request-${runId}`,
  });
  return JSON.parse(await readFile(join(prepared.bundleDirectory, "planning-audit.json"), "utf8")) as PlanningAuditResult;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("validateBundle", () => {
  it("accepts a live-bound sidecar bundle", async () => {
    const value = await fixture();
    await expect(validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo })).resolves.toEqual({ errors: [], ok: true });
  });

  it("accepts temporary action harm only when it is paid before the boundary", async () => {
    const value = await fixture();
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
        action_id: "A-1", before_object: value.head, after_object: value.head,
        comparators: [{
          id: "git-status", command, scope: "repository", detector,
          observations: [
            comparatorObservation("before", value.head, command, detector, [], "clean", NOW),
            comparatorObservation("intermediate", digest("temporary action state"), command, detector, [generatedFile], "untracked generated file", MIDDLE),
            comparatorObservation("after", value.head, command, detector, [], "clean", AFTER),
          ],
        }],
        introduced: 1, paid_before_boundary: 1, open_at_boundary: 0,
        boundary_status: "closed", observed_at: AFTER,
      }],
    });
    await value.persist();
    await expect(validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo })).resolves.toEqual({ errors: [], ok: true });
  });

  it("requires preserved result bytes and binds result_sha256 to them", async () => {
    const value = await fixture();
    const action = executedAction();
    const command = "git status --porcelain=v2";
    const detector = "git fixture";
    value.report.actions = [action];
    value.manifest.actions = [action];
    value.manifest.execution_state = "executed";
    (value.report.regression_control as RecordValue).action_checks = 1;
    const before = comparatorObservation("before", value.head, command, detector, [], "clean", NOW);
    const after = comparatorObservation("after", value.head, command, detector, [], "clean", AFTER);
    value.regression.action_checks = [{
      action_id: "A-1", before_object: value.head, after_object: value.head,
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
        action_id: "A-1", before_object: value.head, after_object: value.head,
        comparators: [{
          id: "git-status", command, scope: "repository", detector,
          observations: [
            comparatorObservation("before", value.head, command, detector, [], "clean", NOW),
            comparatorObservation("after", value.head, command, detector, [generatedFile], "untracked generated file", AFTER),
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
  });

  it("rejects self-asserted zero harm when comparator fingerprints prove a new finding", async () => {
    const value = await fixture();
    const action = executedAction();
    const command = "git status --porcelain=v2";
    const detector = "git fixture";
    const generatedFile = digest("generated-file");
    value.report.actions = [action];
    value.manifest.actions = [action];
    value.manifest.execution_state = "executed";
    (value.report.regression_control as RecordValue).action_checks = 1;
    value.regression.action_checks = [{
      action_id: "A-1", before_object: value.head, after_object: value.head,
      comparators: [{
        id: "git-status", command, scope: "repository", detector,
        observations: [
          comparatorObservation("before", value.head, command, detector, [], "clean", NOW),
          comparatorObservation("after", value.head, command, detector, [generatedFile], "untracked generated file", AFTER),
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
    const result = await validateBundleFile(value.bundlePath, { repoPath: value.repo });
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
    expect(result.errors.some((error) => error.includes("live census mismatch"))).toBe(true);
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

  it("includes planning symlinks in the live census instead of silently dropping them", async () => {
    const value = await fixture();
    const start = value.head;
    await symlink("backlog/next.md", join(value.repo, "planning", "LINK.md"));
    await git(value.repo, "add", ".");
    await git(value.repo, "commit", "-m", "add planning symlink");
    rebind(value, await git(value.repo, "rev-parse", "HEAD"), start);
    await value.persist();

    const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
    expect(result.errors.some((error) =>
      error.includes("live census mismatch") && error.includes("planning/LINK.md"))).toBe(true);
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
    expect((await checked(value)).errors.some((error) => error.includes("live census mismatch"))).toBe(true);
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
    expect((await checked(value)).errors.some((error) => error.includes("must be an existing full commit"))).toBe(true);
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
