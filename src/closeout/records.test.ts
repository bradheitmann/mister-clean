import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  validateManifest,
  validateReport,
} from "./records.js";
import { canonicalJson, sha256Bytes } from "../control-plane/runtime/authority.js";

type Dict = Record<string, unknown>;

const digest = "a".repeat(64);
const commit = "a".repeat(40);
const domainDigest = "b".repeat(64);
const candidateTree = "e".repeat(40);
const evidenceRef = { path: "evidence.json", sha256: digest };
const sealReceipt = (receipt: Dict): Dict => { const { receipt_sha256: _ignored, ...content } = receipt; return { ...receipt, receipt_sha256: sha256Bytes(canonicalJson(content)) }; };

function report(overrides: Dict = {}): Dict {
  const dimensions: Dict = {};
  for (const name of ["completion_debt", "repository_state", "planning_integrity", "verification", "handoff_readiness"]) {
    dimensions[name] = {
      state: "satisfied",
      notes: "recorded",
      evidence: [{ kind: name === "completion_debt" ? "debt_census" : name === "repository_state" ? "git_topology" : name === "planning_integrity" ? "planning_census" : name === "verification" ? "validation_summary" : "successor_readiness", object: "object-1", command: "check", result: "pass", observed_at: "2026-08-25T10:00:00Z" }],
    };
  }
  const claims: Dict = {};
  for (const name of ["committed_locally", "pushed", "ci_green_on_push", "deployed", "independently_qa_accepted"]) {
    claims[name] = { state: "not_applicable", evidence: [], na_reason: "policy excludes this claim", policy_ref: "policy#local" };
  }
  return {
    record_type: "mister-clean.closeout",
    schema_version: "1.2",
    generated_at: "2026-08-25T10:00:00Z",
    repo: { id: "example/repo", commit },
    target_binding: {
      target_ref: "refs/heads/main", target_commit: commit, candidate_commit: commit, merge_base: commit,
      target_commits_missing: 0, candidate_commits_ahead: 0, target_incorporated: true,
      measured_at: "2026-08-25T10:00:00Z", evidence: [{ object: "target", command: "git", result: "pass" }],
    },
    mode: "CLEAN",
    authorization_basis: { source: "skill_invocation", ref: "request-1", scope: "named_repository_and_current_task", standing: true },
    scope: "repository",
    dimensions,
    completion_debts: [],
    claims,
    actions: [],
    residuals: [],
    acceptance_criteria: [],
    debt_census: { discovered: 0, paid: 0, accepted_exception: 0 },
    regression_control: {
      policy: "zero_open_run_introduced_debt", baseline_object: commit, closing_object: commit,
      baseline_findings: 0, closing_findings: 0, baseline_paid: 0, baseline_open: 0,
      newly_discovered_preexisting_paid: 0, newly_discovered_preexisting_open: 0,
      concurrent_external_paid: 0, concurrent_external_open: 0,
      introduced_by_run_paid: 0, introduced_by_run_open: 0, action_checks: 0,
      evidence_ref: { path: "regression-delta.json", sha256: digest },
    },
    handoff_assessment: { recommendation: "proceed", reasons: ["handoff recorded"], conditions: [] },
    verdict: "CLEAN",
    ...overrides,
  };
}

function manifest(overrides: Dict = {}): Dict {
  return {
    record_type: "mister-clean.action-manifest",
    schema_version: "1.0",
    execution_state: "authorized",
    repo: { id: "example/repo", commit },
    mode: "CLOSE",
    request_ref: "request-1",
    legacy_schema_acknowledged: true,
    authorization_basis: { source: "skill_invocation", ref: "request-1", scope: "named_repository_and_current_task", standing: true },
    policy_sources: ["policy#local"],
    actions: [],
    excluded_actions: [],
    ...overrides,
  };
}

function lane(id: string, overrides: Dict = {}): Dict {
  return {
    id,
    task_id: `task-${id}`,
    owner: `owner-${id}`,
    role: "writer",
    state: "active",
    execution_class: "hosted",
    model: "model",
    reasoning: "high",
    harness: "harness",
    safe_context_limit_tokens: 131072,
    estimated_context_tokens: 4096,
    evaluation_mode: "naturalistic",
    routing_reason: "bounded implementation task",
    worktree: `/tmp/${id}`,
    branch: `mc/${id}`,
    baseline_commit: commit,
    read_paths: ["src/**"],
    write_paths: [`src/${id}/**`],
    collision_keys: [`domain-${id}`],
    dependencies: [],
    invariants: ["established tests remain green"],
    acceptance: ["focused and full gates pass"],
    bootstrap: {
      worktree: `/tmp/${id}`,
      branch: `mc/${id}`,
      head: commit,
      observed_at: "2026-08-25T10:00:00Z",
      evidence_ref: evidenceRef,
    },
    ...overrides,
  };
}

function coordination(lanes: Dict[] = []): Dict {
  return {
    dispatcher: "dispatcher",
    integrator: "integrator",
    write_policy: "isolated_worktrees",
    integration_policy: "mutex_and_compare_and_swap",
    integration_mutex: {
      required: true,
      kind: "lease_with_fencing",
      scope: "target_ref",
      max_lease_seconds: 300,
    },
    local_inference_max_concurrency: 1,
    target: { ref: "refs/heads/main", expected_commit: commit, observed_at: "2026-08-25T10:00:00Z" },
    lanes,
  };
}

function coordinationClaim(key: string, overrides: Dict = {}): Dict {
  return {
    key,
    access: "write",
    expected_version: 7,
    expected_state_digest: domainDigest,
    operation_class: `update-${key}`,
    commutes_with: [],
    commutativity_ref: null,
    ...overrides,
  };
}

function laneV12(id: string, key: string, overrides: Dict = {}): Dict {
  const value = lane(id, overrides);
  delete value.collision_keys;
  value.coordination_claims = overrides.coordination_claims ?? [coordinationClaim(key)];
  return value;
}

function coordinationV12(lanes: Dict[], keys = ["planning-projections", "integration-target"]): Dict {
  return {
    ...coordination(lanes),
    domains: keys.map((key) => ({
      key,
      version: 7,
      state_digest: domainDigest,
      observed_at: "2026-08-25T10:00:00Z",
      evidence_ref: evidenceRef,
    })),
  };
}

function operation(id: string, laneValue: Dict, overrides: Dict = {}): Dict {
  const value: Dict = {
    id,
    kind: "local_edit",
    target: `src/${laneValue.id}/${id}.ts`,
    purpose: "pay bounded debt",
    risk: "reversible_local",
    authorization: { state: "granted", source: "skill_invocation", ref: "request-1" },
    preconditions: ["baseline frozen"],
    verification: ["focused gate"],
    status: "planned",
    lane_id: laneValue.id,
    task_id: laneValue.task_id,
    parent_operation_ids: [],
    before_object: commit,
    after_object: null,
    recorded_at: "2026-08-25T10:00:00Z",
    ...overrides,
  };
  if (value.status === "executed" && value.outcome === undefined) {
    const evidenceKind = value.kind === "git_push"
      ? "remote_ref_resolution"
      : value.kind === "git_commit"
        ? "git_change"
        : "validation_result";
    value.outcome = {
      state: "verified",
      evidence: [{
        kind: evidenceKind,
        object: `operation-${id}`,
        command: "bun test",
        result: "pass",
        observed_at: "2026-08-25T10:00:01Z",
        evidence_ref: evidenceRef,
      }],
    };
  }
  return value;
}

function guardReceipt(
  role: "dev" | "qa" | "mister_clean" | "holdout",
  actor: string,
  startedAt: string,
  finishedAt: string,
  overrides: Dict = {},
): Dict {
  const misterCleanEvaluator = role === "mister_clean" ? {
    package_name: "@bradheitmann/mister-clean",
    version: "6.3.0",
    release_state: "accepted_release",
    registry_integrity: `sha512-${"A".repeat(86)}==`,
    skill_sha256: digest,
    executable_sha256: digest,
    manifest_sha256: digest,
    entrypoint: "bin/mister-clean.js",
    resolved_package_root: "/opt/mister-clean/6.3.0",
    resolved_at: "2026-08-25T10:02:30Z",
    evidence_ref: evidenceRef,
    accepted_release_ref: evidenceRef,
  } : null;
  return sealReceipt({
    id: `receipt-${role}`, run_id: "run-1", round_id: "round-1", pod_id: "pod-1", task_id: "task-1", role, actor,
    actual_model: `model-${role}`, reasoning_level: "high", harness: `harness-${role}`, session_id: `session-${role}`, baseline_commit: commit, candidate_tree: candidateTree,
    prompt_sha256: digest, policy_sha256: digest, criteria_sha256: digest, checks_sha256: digest, started_at: startedAt, finished_at: finishedAt, conclusion: "pass", findings_total: 0, findings_paid: 0, unresolved: 0, repository_mutated: false, mutation_owner_transfer: null, mister_clean_evaluator: misterCleanEvaluator, evidence_ref: evidenceRef, ...overrides,
  });
}

function guardRecord(overrides: Dict = {}): Dict {
  const receipts = [
    guardReceipt("dev", "actor-dev", "2026-08-25T10:01:00Z", "2026-08-25T10:02:00Z"),
    guardReceipt("qa", "actor-qa", "2026-08-25T10:03:00Z", "2026-08-25T10:04:00Z"),
    guardReceipt("mister_clean", "actor-clean", "2026-08-25T10:03:00Z", "2026-08-25T10:05:00Z"),
    guardReceipt("holdout", "actor-holdout", "2026-08-25T10:06:00Z", "2026-08-25T10:07:00Z"),
  ];
  return {
    status: "passed",
    baseline_commit: commit,
    candidate_tree: candidateTree,
    minted_at: "2026-08-25T10:00:30Z",
    staged_paths: ["src/candidate.ts"],
    writers_frozen: true,
    receipts,
    deterministic_gates: {
      candidate_tree: candidateTree,
      state: "passed",
      required_count: 3,
      passed_count: 3,
      known_failures: [],
      evidence_ref: evidenceRef,
    },
    no_harm: {
      candidate_tree: candidateTree,
      state: "passed",
      introduced_by_run_open: 0,
      evidence_ref: evidenceRef,
    },
    commit_barrier: {
      state: "open",
      approved_tree: candidateTree,
      receipt_ids: receipts.map((receipt) => ({ receipt_id: receipt.id, receipt_sha256: receipt.receipt_sha256 })),
      opened_at: "2026-08-25T10:08:00Z",
      crossed_action_id: null,
    },
    ...overrides,
  };
}

function crossedGuardManifestV13(): Dict {
  const resultCommit = "f".repeat(40);
  const integrator = laneV12("integrator", "integration-target", {
    role: "integrator",
    task_id: "task-1",
    write_paths: ["**/*"],
  });
  const guard = guardRecord({
    status: "crossed",
    authority: {
      kind: "external_custody",
      precommit_sha256: "a".repeat(64),
      crossing_sha256: "b".repeat(64),
    },
  });
  Object.assign(guard.commit_barrier as Dict, { state: "crossed", crossed_action_id: "OP-COMMIT" });
  const receiptIds = structuredClone((guard.commit_barrier as Dict).receipt_ids);
  const cas = {
    compare_and_swap: true,
    target_ref: "refs/heads/main",
    expected_target_commit: commit,
    observed_target_commit: commit,
    candidate_commit: resultCommit,
    result: "applied",
    result_commit: resultCommit,
    mutex: {
      resource: "refs/heads/main",
      holder_lane_id: "integrator",
      lease_id: "lease-guard",
      fencing_token: 1,
      acquired_at: "2026-08-25T10:08:01Z",
      mutation_observed_at: "2026-08-25T10:08:02Z",
      expires_at: "2026-08-25T10:09:00Z",
      released_at: "2026-08-25T10:08:03Z",
    },
  };
  const action = operation("OP-COMMIT", integrator, {
    kind: "git_commit",
    target: "repository",
    status: "executed",
    before_object: commit,
    after_object: resultCommit,
    recorded_at: "2026-08-25T10:08:02Z",
    guard_commit: {
      candidate_tree: candidateTree,
      commit: resultCommit,
      commit_tree: candidateTree,
      receipt_ids: receiptIds,
      evidence_ref: evidenceRef,
    },
    cas,
  });
  return manifest({
    schema_version: "1.3",
    manifest_kind: "closeout_guard",
    mode: "GUARD",
    execution_state: "executed",
    repo: { id: "example/repo", commit: resultCommit },
    coordination: coordinationV12([integrator]),
    guard,
    actions: [action],
  });
}

describe("validateReport", () => {
  it("accepts the canonical template when placeholders are explicitly allowed", async () => {
    const value = JSON.parse(await readFile(new URL("../../assets/closeout-report.json", import.meta.url), "utf8")) as unknown;
    expect(validateReport(value, true)).toEqual([]);
  });

  it("refuses a standalone CLEAN report", () => {
    expect(validateReport(report())).toContain("$.verdict: CLEAN requires validation through a live-bound mister-clean.closure-bundle; a standalone report is structural evidence only");
  });

  it("requires all record keys and typed target binding", () => {
    const result = validateReport({});
    expect(result).toContain("$.actions: missing");
    expect(result).toContain("$.target_binding: missing");
  });

  it("refuses open debt, deferred debt, and unconditional proceed", () => {
    const value = report({
      verdict: "NOT_CLEAN",
      handoff_assessment: { recommendation: "proceed", reasons: ["r"], conditions: [] },
      completion_debts: [{ id: "D1", procedure: "review", state: "open", disposition: "autonomously_repair", evidence: [] }],
    });
    expect(validateReport(value)).toContain("$.handoff_assessment.recommendation: unconditional proceed conflicts with NOT_CLEAN verdict");
  });

  it("requires executed, typed, digest-bound evidence for satisfied debt", () => {
    const value = report({
      completion_debts: [{ id: "D1", procedure: "execute acceptance", state: "satisfied", disposition: "autonomously_repair", evidence: ["done"] }],
      debt_census: { discovered: 1, paid: 1, accepted_exception: 0 },
    });
    expect(validateReport(value)).toContain("$.completion_debts[0].evidence: satisfied debt requires allowlisted, time-bound, digest-referenced execution evidence");
    const evidence = { kind: "acceptance_execution", object: "D1", command: "run", result: "pass", observed_at: "2026-08-25T10:00:00Z", evidence_ref: evidenceRef };
    expect(validateReport({ ...value, completion_debts: [{ ...(value.completion_debts as Dict[])[0], evidence: [evidence] }] }, false, true)).toEqual([]);
  });

  it("requires complete operator rulings for accepted exceptions", () => {
    const value = report({
      completion_debts: [{ id: "D1", procedure: "historical review", state: "accepted_exception", disposition: "accepted_exception", evidence: [], exception: { actor: "operator", at: "2026-08-25T10:00:00Z", scope: "D1", rationale: "historical", ref: evidenceRef } }],
      debt_census: { discovered: 1, paid: 0, accepted_exception: 1 },
    });
    expect(validateReport(value, false, true)).toEqual([]);
    const invalid = structuredClone(value) as Dict;
    const firstDebt = (invalid.completion_debts as Dict[])[0];
    if (!firstDebt) throw new Error("fixture debt missing");
    (firstDebt.exception as Dict).ref = { path: "bad", sha256: "bad" };
    expect(validateReport(invalid).some(error => error.includes("digest-bound evidence reference"))).toBe(true);
  });

  it("does not permit stale documentation to become an accepted exception or residual", () => {
    const debt = { id: "D1", procedure: "fix", state: "accepted_exception", disposition: "accepted_exception", evidence: [], exception: { actor: "operator", at: "2026-08-25T10:00:00Z", scope: "D1", rationale: "history", ref: evidenceRef }, class: "stale_doc" };
    expect(validateReport(report({ completion_debts: [debt], debt_census: { discovered: 1, paid: 0, accepted_exception: 1 } }))).toContain("$.completion_debts[0].disposition: a reviewer-reported stale doc/comment is PAYABLE regardless of severity label -- accepted_exception is for irreparable historical limits only; fix the doc before CLEAN");
    expect(validateReport(report({ residuals: [{ kind: "roadmap", represented_at: "plan", class: "stale_doc" }] }))).toContain("$.residuals[0]: a reviewer-reported stale doc/comment is payable debt, not a residual -- move it to completion_debts and fix it before CLEAN");
  });

  it("enforces operator-only waivers for operator criteria", () => {
    const criterion = { id: "C1", met: false, source: "operator", waiver: { actor: "reviewer", ref: "waiver" } };
    expect(validateReport(report({ acceptance_criteria: [criterion] })).some(error => error.includes("may be waived ONLY by the operator"))).toBe(true);
    const waived = { ...criterion, waiver: { actor: "operator", ref: "waiver" } };
    expect(validateReport(report({ acceptance_criteria: [waived] }), false, true)).toEqual([]);
  });

  it("rejects aliases for independent QA identities and mismatched claim objects", () => {
    const claims: Dict = {
      committed_locally: { state: "established", evidence: [{ kind: "git_commit", commit }] },
      independently_qa_accepted: { state: "established", evidence: [{ kind: "independent_qa_verdict", verdict_ref: "qa", reviewer: "A  Reviewer", implementer: "a reviewer", conclusion: "accepted", commit }] },
      pushed: { state: "not_applicable", evidence: [], na_reason: "local", policy_ref: "p" },
      ci_green_on_push: { state: "not_applicable", evidence: [], na_reason: "local", policy_ref: "p" },
      deployed: { state: "not_applicable", evidence: [], na_reason: "local", policy_ref: "p" },
    };
    expect(validateReport(report({ claims })).some(error => error.includes("normalize to the same actor"))).toBe(true);
    for (const [reviewer, implementer] of [["Straße", "STRASSE"], ["ẞ", "SS"]]) {
      const unicodeAlias = structuredClone(claims) as Dict;
      const verdict = ((unicodeAlias.independently_qa_accepted as Dict).evidence as Dict[])[0]!;
      verdict.reviewer = reviewer;
      verdict.implementer = implementer;
      expect(validateReport(report({ claims: unicodeAlias })).some(error => error.includes("normalize to the same actor"))).toBe(true);
    }
  });

  it("requires an actual debt census and finished actions for CLEAN", () => {
    const value = report({ debt_census: undefined });
    expect(validateReport(value)).toContain("$.debt_census: required for CLEAN (discovered/paid/accepted_exception ints; empty ledger is not a census)");
    const action = { id: "A1", status: "planned" };
    expect(validateReport(report({ actions: [action] })).some(error => error.includes("unfinished/failed action"))).toBe(true);
  });

  it("refuses CLEAN when cleanup-introduced debt remains open", () => {
    const value = report();
    const control = value.regression_control as Dict;
    Object.assign(control, { closing_findings: 1, introduced_by_run_open: 1 });
    expect(validateReport(value, false, true)).toContain(
      "$.regression_control.introduced_by_run_open: CLEAN requires zero cleanup-introduced open debt",
    );
  });

  it("rejects placeholders unless explicitly validating a template", () => {
    expect(validateReport({ ...report(), repo: { id: "<repo>", commit: "<commit>" } })).toContain("$.repo.id: unresolved template placeholder");
    expect(validateReport({ ...report(), repo: { id: "<repo>", commit: "<commit>" } }, true)).not.toContain("$.repo.id: unresolved template placeholder");
  });
});

describe("validateManifest", () => {
  it("accepts the authorized empty manifest", () => {
    expect(validateManifest(manifest())).toEqual([]);
  });

  it("requires GUARD to use schema 1.2 exact-tree enforcement", () => {
    expect(validateManifest(manifest({ mode: "GUARD" }))).toContain(
      "$.schema_version: GUARD requires schema 1.2 or closeout_guard schema 1.3 exact-tree enforcement",
    );
    expect(validateManifest(manifest({
      mode: "GUARD",
      schema_version: "1.2",
      coordination: coordinationV12([]),
      guard: guardRecord(),
    }))).toEqual([]);
  });

  it("keeps the schema 1.3 closeout_guard discriminator two-way", () => {
    const mislabeled = validateManifest(manifest({
      schema_version: "1.3",
      manifest_kind: "closeout_guard",
      mode: "CLOSE",
      coordination: coordinationV12([]),
    }));
    expect(mislabeled).toContain("$.mode: closeout_guard schema 1.3 requires GUARD mode");
    expect(mislabeled).toContain("$.guard: closeout_guard schema 1.3 requires a guard object");
    const missingKind = validateManifest(manifest({
      schema_version: "1.3",
      mode: "GUARD",
      coordination: coordinationV12([]),
      guard: guardRecord({ authority: { kind: "external_custody", precommit_sha256: null, crossing_sha256: null } }),
    }));
    expect(missingKind).toContain("$.manifest_kind: schema 1.3 closeout manifests require manifest_kind=closeout_guard");
    const valid13 = validateManifest(manifest({
      schema_version: "1.3",
      manifest_kind: "closeout_guard",
      mode: "GUARD",
      coordination: coordinationV12([]),
      guard: guardRecord({ authority: { kind: "external_custody", precommit_sha256: "a".repeat(64), crossing_sha256: null } }),
    }));
    expect(valid13).toEqual([]);
  });

  it("uses the canonical receipt id and rejects schema 1.3 receipt aliases", () => {
    const value = manifest({
      schema_version: "1.3",
      manifest_kind: "closeout_guard",
      mode: "GUARD",
      coordination: coordinationV12([]),
      guard: guardRecord({ authority: { kind: "external_custody", precommit_sha256: "a".repeat(64), crossing_sha256: null } }),
    });
    const receipt = (((value.guard as Dict).receipts as Dict[])[2]!);
    receipt.receipt_id = "unselected-alias";
    Object.assign(receipt, sealReceipt(receipt));
    expect(validateManifest(value)).toContain(
      "$.guard.receipts[2].receipt_id: unexpected field in schema 1.3 GUARD receipt",
    );
  });

  it("requires every selected schema 1.3 receipt to bind the complete barrier tuple", () => {
    const fields = ["run_id", "round_id", "pod_id", "task_id"] as const;
    for (const field of fields) {
      const value = manifest({
        schema_version: "1.3",
        manifest_kind: "closeout_guard",
        mode: "GUARD",
        coordination: coordinationV12([]),
        guard: guardRecord({ authority: { kind: "external_custody", precommit_sha256: "a".repeat(64), crossing_sha256: null } }),
      });
      const receipts = (value.guard as Dict).receipts as Dict[];
      const receipt = receipts[3]!;
      receipt[field] = `different-${field}`;
      Object.assign(receipt, sealReceipt(receipt));
      const seal = (((value.guard as Dict).commit_barrier as Dict).receipt_ids as Dict[])[3]!;
      seal.receipt_sha256 = receipt.receipt_sha256;
      expect(validateManifest(value)).toContain(
        "$.guard.commit_barrier.receipt_ids: all final receipts must bind the same run, round, pod, and task",
      );
    }
  });

  it("orders candidate mint, selected receipt completion, and barrier opening", () => {
    const mintedLate = manifest({
      mode: "GUARD",
      schema_version: "1.2",
      coordination: coordinationV12([]),
      guard: guardRecord({ minted_at: "2026-08-25T10:01:01Z" }),
    });
    expect(validateManifest(mintedLate)).toContain(
      "$.guard.commit_barrier.receipt_ids: guard.minted_at must not follow a selected receipt started_at",
    );

    const finishedLate = manifest({
      mode: "GUARD",
      schema_version: "1.2",
      coordination: coordinationV12([]),
      guard: guardRecord(),
    });
    const guard = finishedLate.guard as Dict;
    const receipt = (guard.receipts as Dict[])[3]!;
    receipt.finished_at = "2026-08-25T10:08:01Z";
    Object.assign(receipt, sealReceipt(receipt));
    (((guard.commit_barrier as Dict).receipt_ids as Dict[])[3]!).receipt_sha256 = receipt.receipt_sha256;
    expect(validateManifest(finishedLate)).toContain(
      "$.guard.commit_barrier.receipt_ids: every selected receipt must finish before the barrier opens",
    );
  });

  it("binds crossed schema 1.3 receipt, action, and integrator tasks", () => {
    const valid = crossedGuardManifestV13();
    expect(validateManifest(valid)).toEqual([]);
    const mismatch = structuredClone(valid) as Dict;
    ((mismatch.actions as Dict[])[0]!).task_id = "other-task";
    expect(validateManifest(mismatch)).toContain(
      "$.guard.commit_barrier.receipt_ids: selected task_id must equal the crossed git_commit and integrator lane task_id",
    );
  });

  it("rejects crossing action and CAS mutation times before the barrier opens", () => {
    const value = crossedGuardManifestV13();
    const action = (value.actions as Dict[])[0]!;
    action.recorded_at = "2026-08-25T10:07:59Z";
    (((action.cas as Dict).mutex as Dict).mutation_observed_at) = "2026-08-25T10:07:59Z";
    const errors = validateManifest(value);
    expect(errors).toContain("$.actions[0].recorded_at: crossed git_commit cannot precede guard.commit_barrier.opened_at");
    expect(errors).toContain("$.actions[0].cas.mutex.mutation_observed_at: cannot precede guard.commit_barrier.opened_at");
  });

  it("requires an explicit acknowledgment when retaining legacy schema 1.0", () => {
    const legacy = manifest();
    delete legacy.legacy_schema_acknowledged;
    expect(validateManifest(legacy)).toContain(
      "$.legacy_schema_acknowledged: schema 1.0 omits coordination/CAS protections and requires explicit true acknowledgment",
    );
  });

  it("accepts the canonical template with placeholders", async () => {
    const value = JSON.parse(await readFile(new URL("../../assets/action-manifest.json", import.meta.url), "utf8")) as unknown;
    expect(validateManifest(value, true)).toEqual([]);
  });

  it("requires authorization, preflight, verification, and typed outcome evidence", () => {
    const action = { id: "A1", kind: "git_push", target: "origin/main", purpose: "publish", risk: "consequential_external", authorization: { state: "granted", source: "skill_invocation", ref: "request-1" }, preconditions: ["clean"], verification: ["remote matches"], status: "executed", outcome: { state: "verified", evidence: [{ kind: "git_change", object: "A1", command: "git push", result: "ok", observed_at: "2026-08-25T10:00:00Z", evidence_ref: evidenceRef }] } };
    expect(validateManifest(manifest({ execution_state: "executed", actions: [action] }))).toEqual([]);
    const invalid = structuredClone(action) as Dict;
    (invalid.outcome as Dict).evidence = [{ kind: "git_change" }];
    expect(validateManifest(manifest({ execution_state: "executed", actions: [invalid] })).some(error => error.includes("digest-referenced execution evidence"))).toBe(true);
  });

  it("permits terminal history while the next authorized action is planned", () => {
    const terminal = {
      id: "A1", kind: "local_edit", target: "README.md", purpose: "pay the first debt", risk: "reversible_local",
      authorization: { state: "granted", source: "skill_invocation", ref: "request-1" },
      preconditions: ["baseline captured"], verification: ["result verified"], status: "executed",
      outcome: { state: "verified", evidence: [{ kind: "git_change", object: "A1", command: "edit", result: "paid", observed_at: "2026-08-25T10:00:00Z", evidence_ref: evidenceRef }] },
    };
    const planned = {
      id: "A2", kind: "local_edit", target: "SECURITY.md", purpose: "pay the next debt", risk: "reversible_local",
      authorization: { state: "granted", source: "skill_invocation", ref: "request-1" },
      preconditions: ["first action terminal"], verification: ["second result verified"], status: "planned",
    };
    expect(validateManifest(manifest({ actions: [terminal, planned] }))).toEqual([]);
    const failed = structuredClone(terminal);
    failed.status = "failed";
    expect(validateManifest(manifest({ actions: [failed, planned] }))).toContain(
      "$.actions: a failed action is terminal and must be the final manifest action",
    );
    expect(validateManifest(manifest({ actions: [terminal] }))).toContain(
      "$.execution_state: authorized action history requires at least one planned action",
    );
    expect(validateManifest(manifest({ execution_state: "executed", actions: [] }))).toContain(
      "$.execution_state: executed manifest requires at least one terminal action",
    );
  });

  it("rejects prohibited, unknown, and unrecoverable actions", () => {
    const base = { id: "A1", target: "x", purpose: "x", risk: "reversible_local", authorization: { state: "granted", source: "skill_invocation", ref: "request-1" }, preconditions: [], verification: [] };
    expect(validateManifest(manifest({ actions: [{ ...base, kind: "force_push" }] }))).toContain("$.actions[0]: unrecoverable or prohibited action is outside Mister Clean");
    expect(validateManifest(manifest({ actions: [{ ...base, kind: "invented" }] }))).toContain("$.actions[0].kind: unsupported action kind \"invented\"");
  });

  it("rejects unsafe local targets and invalid agent-dispatch mechanisms", () => {
    const base = { id: "A1", kind: "local_edit", target: "../outside", purpose: "edit", risk: "reversible_local", authorization: { state: "granted", source: "skill_invocation", ref: "request-1" }, preconditions: [], verification: [] };
    const errors = validateManifest(manifest({ actions: [base] }));
    expect(errors.some(error => error.includes("local mutation target must be repository-relative"))).toBe(true);
    expect(validateManifest(manifest({ actions: [{ ...base, kind: "agent_dispatch", target: "agent", mechanism: "human" }] })).some(error => error.includes("agent_dispatch requires"))).toBe(true);
  });

  it("requires meaningful recovery proof for destructive actions", () => {
    const action = { id: "A1", kind: "git_push", target: "origin/main", purpose: "publish", risk: "consequential_external", authorization: { state: "granted", source: "skill_invocation", ref: "request-1" }, preconditions: [], verification: [] };
    const errors = validateManifest(manifest({ actions: [action] }));
    expect(errors.some(error => error.includes("requires a bounded preflight"))).toBe(true);
    expect(errors.some(error => error.includes("requires an exact postcondition"))).toBe(true);
    expect(errors.some(error => error.includes("requires meaningful preflight facts"))).toBe(true);
  });

  it("enforces isolated semantic lanes and serialized local inference in schema 1.1", () => {
    const first = lane("one", { collision_keys: ["planning-projections"] });
    const second = lane("two", { collision_keys: ["planning-projections"] });
    const collided = validateManifest(manifest({
      schema_version: "1.1",
      coordination: coordination([first, second]),
    }));
    expect(collided.some(error => error.includes("overlap on \"planning-projections\""))).toBe(true);

    const muse = lane("muse", {
      role: "read_only", execution_class: "local_inference", worktree: null, branch: null,
      baseline_commit: null, write_paths: [], collision_keys: [], safe_context_limit_tokens: 131072,
    });
    const qwen = lane("qwen", {
      role: "read_only", execution_class: "local_inference", worktree: null, branch: null,
      baseline_commit: null, write_paths: [], collision_keys: [], safe_context_limit_tokens: 262144,
    });
    const localCollision = validateManifest(manifest({
      schema_version: "1.1",
      coordination: coordination([muse, qwen]),
    }));
    expect(localCollision).toContain("$.coordination.lanes: local inference is serialized; at most one model may be active");

    const oversized = lane("oversized", {
      role: "read_only", execution_class: "local_inference", worktree: null, branch: null,
      baseline_commit: null, write_paths: [], collision_keys: [], safe_context_limit_tokens: 131072,
      estimated_context_tokens: 131073,
    });
    expect(validateManifest(manifest({
      schema_version: "1.1",
      coordination: coordination([oversized]),
    })).some(error => error.includes("exceeds verified safe context limit"))).toBe(true);

    const parentPath = lane("parent-path", { write_paths: ["src/shared/**"] });
    const childPath = lane("child-path", { write_paths: ["src/shared/feature/**"] });
    expect(validateManifest(manifest({
      schema_version: "1.1",
      coordination: coordination([parentPath, childPath]),
    })).some(error => error.includes("overlap on write roots"))).toBe(true);

    const badBootstrap = lane("bad-bootstrap");
    (badBootstrap.bootstrap as Dict).branch = "mc/someone-else";
    expect(validateManifest(manifest({
      schema_version: "1.1",
      coordination: coordination([badBootstrap]),
    })).some(error => error.includes("bootstrap.branch: must equal the assigned branch"))).toBe(true);
  });

  it("binds local mutations to their lane write set and planning projections to one atomic transaction", () => {
    const writer = lane("planning", {
      write_paths: ["planning/**"],
      collision_keys: ["planning-projections"],
    });
    const escaped = operation("OP-1", writer, { target: "src/outside.ts" });
    expect(validateManifest(manifest({
      schema_version: "1.1", coordination: coordination([writer]), actions: [escaped],
    })).some((error) => error.includes("must be contained by the lane write_paths"))).toBe(true);

    const after = "b".repeat(40);
    const projection = operation("OP-2", writer, {
      kind: "planning_record_update",
      target: "planning/story.md",
      after_object: after,
      projection_transaction: {
        cause_key: "story-terminalization-17",
        source_of_truth: "planning/story.md",
        required_projections: ["planning/story.md", "planning/epic.md"],
        updated_projections: ["planning/story.md", "planning/epic.md"],
        atomic: true,
        post_audit: { status: "passed", object: after, evidence_ref: evidenceRef },
      },
    });
    expect(validateManifest(manifest({
      schema_version: "1.1", coordination: coordination([writer]), actions: [projection],
    }))).toEqual([]);

    const partial = structuredClone(projection) as Dict;
    (partial.projection_transaction as Dict).updated_projections = ["planning/story.md"];
    expect(validateManifest(manifest({
      schema_version: "1.1", coordination: coordination([writer]), actions: [partial],
    })).some((error) => error.includes("required_projections must equal updated_projections atomically"))).toBe(true);
  });

  it("blocks a push until the candidate has a direct producer, frozen writers, clean tree, zero red gates, and fresh remote CAS evidence", () => {
    const integrator = laneV12("integrator", "integration-target", {
      role: "integrator", collision_keys: ["integration-target"], write_paths: ["**/*"],
    });
    const candidate = candidateTree;
    const guard = guardRecord();
    guard.baseline_commit = candidate;
    for (const receipt of guard.receipts as Dict[]) {
      receipt.baseline_commit = candidate;
      Object.assign(receipt, sealReceipt(receipt));
    }
    (guard.commit_barrier as Dict).receipt_ids = (guard.receipts as Dict[]).map((receipt) => ({
      receipt_id: receipt.id,
      receipt_sha256: receipt.receipt_sha256,
    }));
    guard.status = "crossed";
    Object.assign(guard.commit_barrier as Dict, { state: "crossed", crossed_action_id: "OP-1" });
    const commitAction = operation("OP-1", integrator, {
      kind: "git_commit", target: candidate, status: "executed", after_object: candidate,
      guard_commit: {
        candidate_tree: candidateTree,
        commit: candidate,
        commit_tree: candidateTree,
        receipt_ids: (guard.commit_barrier as Dict).receipt_ids,
        evidence_ref: evidenceRef,
      },
    });
    const push = operation("OP-2", integrator, {
      kind: "git_push",
      target: "origin/main",
      risk: "consequential_external",
      parent_operation_ids: ["OP-1"],
      before_object: candidate,
      after_object: candidate,
      preconditions: ["remote head re-resolved", "writers frozen", "worktree clean"],
      verification: ["remote ref equals candidate", "terminal CI observed"],
      status: "executed",
      push_gate: {
        intent: "minimal_ci_repair",
        remote_ref: "refs/heads/main",
        candidate_commit: candidate,
        expected_remote_commit: commit,
        observed_remote_commit: commit,
        observed_at: "2026-08-25T10:00:03Z",
        writers_frozen: true,
        worktree_clean: true,
        review: { state: "accepted", evidence_ref: evidenceRef },
        validation: {
          candidate_commit: candidate,
          focused_state: "passed",
          full_applicable_state: "passed",
          known_failing_gates: [],
          evidence_ref: evidenceRef,
          no_harm_evidence_ref: evidenceRef,
        },
        prior_remote_ci: { status: "failure", commit, evidence_ref: evidenceRef },
      },
    });
    const valid = manifest({
      schema_version: "1.2",
      execution_state: "executed",
      mode: "GUARD",
      repo: { id: "example/repo", commit: candidate },
      coordination: coordinationV12([integrator]),
      guard,
      actions: [commitAction, push],
    });
    expect(validateManifest(valid)).toEqual([]);

    const red = structuredClone(valid) as Dict;
    (((red.actions as Dict[])[1]!.push_gate as Dict).validation as Dict).known_failing_gates = ["hosting fixture"];
    expect(validateManifest(red).some((error) => error.includes("push forbidden while any established gate is red"))).toBe(true);

    const moved = structuredClone(valid) as Dict;
    ((moved.actions as Dict[])[1]!.push_gate as Dict).observed_remote_commit = "d".repeat(40);
    expect(validateManifest(moved).some((error) => error.includes("compare-and-swap precondition failed"))).toBe(true);

    const orphan = structuredClone(valid) as Dict;
    (orphan.actions as Dict[]).splice(0, 1);
    ((orphan.actions as Dict[])[0]!).parent_operation_ids = [];
    expect(validateManifest(orphan).some((error) => error.includes("requires the candidate-producing"))).toBe(true);
  });

  it("makes actions an append-only operation DAG and rejects stale CAS integration", () => {
    const writer = lane("writer", { state: "ready" });
    const integrator = lane("integrator", {
      role: "integrator", collision_keys: ["integration-target"], write_paths: ["**/*"],
    });
    const childBeforeParent = operation("OP-2", writer, { parent_operation_ids: ["OP-1"] });
    const missingParent = validateManifest(manifest({
      schema_version: "1.1",
      coordination: coordination([writer, integrator]),
      actions: [childBeforeParent],
    }));
    expect(missingParent.some(error => error.includes("parent must precede child"))).toBe(true);

    const parent = operation("OP-1", writer, { status: "executed", after_object: commit });
    const staleCas = operation("OP-2", integrator, {
      kind: "git_integrate",
      target: "refs/heads/main",
      parent_operation_ids: ["OP-1"],
      cas: {
        compare_and_swap: true,
        target_ref: "refs/heads/main",
        expected_target_commit: commit,
        observed_target_commit: "b".repeat(40),
        candidate_commit: "c".repeat(40),
        result: "applied",
        result_commit: "d".repeat(40),
        mutex: {
          resource: "refs/heads/main",
          holder_lane_id: "integrator",
          lease_id: "lease-1",
          fencing_token: 1,
          acquired_at: "2026-08-25T10:00:01Z",
          mutation_observed_at: "2026-08-25T10:00:02Z",
          expires_at: "2026-08-25T10:01:01Z",
          released_at: "2026-08-25T10:00:03Z",
        },
      },
      status: "executed",
      after_object: "d".repeat(40),
    });
    const stale = validateManifest(manifest({
      schema_version: "1.1",
      coordination: coordination([writer, integrator]),
      actions: [parent, staleCas],
    }));
    expect(stale.some(error => error.includes("applied integration requires observed target to equal expected target"))).toBe(true);

    const rejected = structuredClone(staleCas) as Dict;
    (rejected.cas as Dict).result = "rejected_target_moved";
    rejected.status = "blocked";
    rejected.after_object = null;
    delete rejected.outcome;
    expect(validateManifest(manifest({
      schema_version: "1.1",
      execution_state: "executed",
      coordination: coordination([writer, integrator]),
      actions: [parent, rejected],
    }))).toEqual([]);
  });

  it("rejects stale plans at the coordination-domain boundary", () => {
    const writer = laneV12("writer", "planning-projections");
    const valid = manifest({
      schema_version: "1.2",
      coordination: coordinationV12([writer]),
    });
    expect(validateManifest(valid)).toEqual([]);

    const stale = structuredClone(valid) as Dict;
    const claim = (((stale.coordination as Dict).lanes as Dict[])[0]!.coordination_claims as Dict[])[0]!;
    claim.expected_version = 6;
    expect(validateManifest(stale).some((error) => error.includes("stale plan"))).toBe(true);

    const drifted = structuredClone(valid) as Dict;
    const domain = (((drifted.coordination as Dict).domains as Dict[])[0]!);
    domain.state_digest = "c".repeat(64);
    expect(validateManifest(drifted).some((error) => error.includes("invariant state digest has changed"))).toBe(true);
  });

  it("allows shared-domain concurrency only for read/read or symmetrically proven commutativity", () => {
    const first = laneV12("first", "planning-projections");
    const second = laneV12("second", "planning-projections");
    const collided = validateManifest(manifest({
      schema_version: "1.2",
      coordination: coordinationV12([first, second]),
    }));
    expect(collided.some((error) => error.includes("without symmetric, evidence-bound commutativity"))).toBe(true);

    const policy = { path: "commutativity-policy.json", sha256: digest };
    const commutingFirst = laneV12("first", "planning-projections", {
      coordination_claims: [coordinationClaim("planning-projections", {
        operation_class: "append-left",
        commutes_with: ["append-right"],
        commutativity_ref: policy,
      })],
    });
    const commutingSecond = laneV12("second", "planning-projections", {
      coordination_claims: [coordinationClaim("planning-projections", {
        operation_class: "append-right",
        commutes_with: ["append-left"],
        commutativity_ref: policy,
      })],
    });
    expect(validateManifest(manifest({
      schema_version: "1.2",
      coordination: coordinationV12([commutingFirst, commutingSecond]),
    }))).toEqual([]);

    const readerA = laneV12("reader-a", "planning-projections", {
      role: "read_only", worktree: null, branch: null, baseline_commit: null, write_paths: [],
      coordination_claims: [coordinationClaim("planning-projections", { access: "read" })],
    });
    const readerB = laneV12("reader-b", "planning-projections", {
      role: "read_only", worktree: null, branch: null, baseline_commit: null, write_paths: [],
      coordination_claims: [coordinationClaim("planning-projections", { access: "read" })],
    });
    expect(validateManifest(manifest({
      schema_version: "1.2",
      coordination: coordinationV12([readerA, readerB]),
    }))).toEqual([]);
  });

  it("lifts compare-and-swap to every invariant a source plan reads or writes", () => {
    const source = laneV12("source", "planning-projections", { state: "ready" });
    const integrator = laneV12("integrator", "integration-target", {
      role: "integrator", write_paths: ["**/*"],
    });
    const resultCommit = "d".repeat(40);
    const integrate = operation("OP-1", integrator, {
      kind: "git_integrate",
      target: "refs/heads/main",
      status: "executed",
      after_object: resultCommit,
      source_lane_ids: ["source"],
      cas: {
        compare_and_swap: true,
        target_ref: "refs/heads/main",
        expected_target_commit: commit,
        observed_target_commit: commit,
        candidate_commit: "c".repeat(40),
        result: "applied",
        result_commit: resultCommit,
        mutex: {
          resource: "refs/heads/main",
          holder_lane_id: "integrator",
          lease_id: "lease-v12",
          fencing_token: 1,
          acquired_at: "2026-08-25T10:00:01Z",
          mutation_observed_at: "2026-08-25T10:00:02Z",
          expires_at: "2026-08-25T10:01:01Z",
          released_at: "2026-08-25T10:00:03Z",
        },
      },
      coordination_cas: [{
        source_lane_id: "source",
        key: "planning-projections",
        access: "write",
        operation_class: "update-planning-projections",
        expected_version: 7,
        observed_version: 7,
        expected_state_digest: domainDigest,
        observed_state_digest: domainDigest,
        result: "applied",
        result_version: 8,
        result_state_digest: "c".repeat(64),
        observed_at: "2026-08-25T10:00:02Z",
        evidence_ref: evidenceRef,
      }],
    });
    const valid = manifest({
      schema_version: "1.2",
      execution_state: "executed",
      coordination: coordinationV12([source, integrator]),
      actions: [integrate],
    });
    expect(validateManifest(valid)).toEqual([]);

    const stale = structuredClone(valid) as Dict;
    const domains = ((stale.coordination as Dict).domains as Dict[]);
    domains[0]!.version = 8;
    domains[0]!.state_digest = "e".repeat(64);
    const check = ((stale.actions as Dict[])[0]!.coordination_cas as Dict[])[0]!;
    check.observed_version = 8;
    check.observed_state_digest = "e".repeat(64);
    expect(validateManifest(stale).some((error) => error.includes("stale plan cannot integrate"))).toBe(true);
  });

  it("requires a short integration lease with a fresh fencing token in addition to CAS", () => {
    const integrator = lane("integrator", {
      role: "integrator", collision_keys: ["integration-target"], write_paths: ["**/*"],
    });
    const baseCas = {
      compare_and_swap: true,
      target_ref: "refs/heads/main",
      expected_target_commit: commit,
      observed_target_commit: commit,
      candidate_commit: "c".repeat(40),
      result: "applied",
      result_commit: "d".repeat(40),
      mutex: {
        resource: "refs/heads/main",
        holder_lane_id: "integrator",
        lease_id: "lease-1",
        fencing_token: 1,
        acquired_at: "2026-08-25T10:00:01Z",
        mutation_observed_at: "2026-08-25T10:00:02Z",
        expires_at: "2026-08-25T10:01:01Z",
        released_at: "2026-08-25T10:00:03Z",
      },
    };
    const integrate = operation("OP-1", integrator, {
      kind: "git_integrate", target: "refs/heads/main", cas: baseCas,
      status: "executed", after_object: "d".repeat(40),
    });
    expect(validateManifest(manifest({
      schema_version: "1.1", execution_state: "executed", coordination: coordination([integrator]), actions: [integrate],
    }))).toEqual([]);

    const expired = structuredClone(integrate) as Dict;
    ((expired.cas as Dict).mutex as Dict).mutation_observed_at = "2026-08-25T10:02:00Z";
    expect(validateManifest(manifest({
      schema_version: "1.1", coordination: coordination([integrator]), actions: [expired],
    })).some((error) => error.includes("CAS observation must occur inside the live lease"))).toBe(true);

    const second = structuredClone(integrate) as Dict;
    second.id = "OP-2";
    ((second.cas as Dict).mutex as Dict).lease_id = "lease-2";
    ((second.cas as Dict).mutex as Dict).acquired_at = "2026-08-25T10:00:02Z";
    ((second.cas as Dict).mutex as Dict).mutation_observed_at = "2026-08-25T10:00:03Z";
    ((second.cas as Dict).mutex as Dict).expires_at = "2026-08-25T10:01:02Z";
    ((second.cas as Dict).mutex as Dict).released_at = "2026-08-25T10:00:04Z";
    expect(validateManifest(manifest({
      schema_version: "1.1", coordination: coordination([integrator]), actions: [integrate, second],
    })).some((error) => error.includes("integration lease overlaps a prior lease"))).toBe(true);

    ((second.cas as Dict).mutex as Dict).acquired_at = "2026-08-25T10:02:00Z";
    ((second.cas as Dict).mutex as Dict).mutation_observed_at = "2026-08-25T10:02:01Z";
    ((second.cas as Dict).mutex as Dict).expires_at = "2026-08-25T10:03:00Z";
    ((second.cas as Dict).mutex as Dict).released_at = "2026-08-25T10:02:02Z";
    expect(validateManifest(manifest({
      schema_version: "1.1", coordination: coordination([integrator]), actions: [integrate, second],
    })).some((error) => error.includes("fencing_token: must increase monotonically"))).toBe(true);
  });

  it("refuses stale, conditional, self-authored, or mutating final GUARD receipts", () => {
    const base = manifest({
      mode: "GUARD",
      schema_version: "1.2",
      coordination: coordinationV12([]),
      guard: guardRecord(),
    });

    const stale = structuredClone(base) as Dict;
    (((stale.guard as Dict).receipts as Dict[])[1]!).candidate_tree = "f".repeat(40);
    expect(validateManifest(stale).some((error) => error.includes("receipt is stale or bound to a different tree"))).toBe(true);

    const conditional = structuredClone(base) as Dict;
    (((conditional.guard as Dict).receipts as Dict[])[3]!).conclusion = "conditional";
    expect(validateManifest(conditional).some((error) => error.includes("every selected role receipt must conclude pass"))).toBe(true);

    const aliased = structuredClone(base) as Dict;
    (((aliased.guard as Dict).receipts as Dict[])[1]!).actor = "  ACTOR-DEV  ";
    expect(validateManifest(aliased).some((error) => error.includes("must be distinct actors"))).toBe(true);

    const crossTask = structuredClone(base) as Dict;
    (((crossTask.guard as Dict).receipts as Dict[])[3]!).task_id = "another-task";
    expect(validateManifest(crossTask).some((error) => error.includes("same run, round, pod, and task"))).toBe(true);

    const mutating = structuredClone(base) as Dict;
    const clean = (((mutating.guard as Dict).receipts as Dict[])[2]!);
    clean.repository_mutated = true;
    clean.mutation_owner_transfer = evidenceRef;
    expect(validateManifest(mutating).some((error) => error.includes("receipt that mutated the repository is stale"))).toBe(true);
  });

  it("requires the selected Mister Clean receipt to bind a pinned accepted release", () => {
    const base = manifest({
      mode: "GUARD",
      schema_version: "1.2",
      coordination: coordinationV12([]),
      guard: guardRecord(),
    });

    const missing = structuredClone(base) as Dict;
    (((missing.guard as Dict).receipts as Dict[])[2]!).mister_clean_evaluator = null;
    expect(validateManifest(missing).some((error) => error.includes("mister_clean_evaluator"))).toBe(true);

    const candidate = structuredClone(base) as Dict;
    const candidateEvaluator = ((((candidate.guard as Dict).receipts as Dict[])[2]!).mister_clean_evaluator as Dict);
    candidateEvaluator.release_state = "candidate_shadow";
    expect(validateManifest(candidate).some((error) => error.includes("pinned accepted release"))).toBe(true);

    const forgedIntegrity = structuredClone(base) as Dict;
    const forgedEvaluator = ((((forgedIntegrity.guard as Dict).receipts as Dict[])[2]!).mister_clean_evaluator as Dict);
    forgedEvaluator.registry_integrity = "latest";
    expect(validateManifest(forgedIntegrity).some((error) => error.includes("required npm sha512 integrity"))).toBe(true);

    const lateIdentity = structuredClone(base) as Dict;
    const lateEvaluator = ((((lateIdentity.guard as Dict).receipts as Dict[])[2]!).mister_clean_evaluator as Dict);
    lateEvaluator.resolved_at = "2026-08-25T10:04:00Z";
    expect(validateManifest(lateIdentity).some((error) => error.includes("resolved before the run starts"))).toBe(true);

    const foreignRole = structuredClone(base) as Dict;
    (((foreignRole.guard as Dict).receipts as Dict[])[0]!).mister_clean_evaluator = structuredClone(
      ((((foreignRole.guard as Dict).receipts as Dict[])[2]!).mister_clean_evaluator),
    );
    expect(validateManifest(foreignRole).some((error) => error.includes("only the Mister Clean role"))).toBe(true);

    const closeModeBypass = manifest({
      mode: "CLOSE",
      schema_version: "1.2",
      coordination: coordinationV12([]),
      actions: [{
        id: "OP-UNGUARDED-COMMIT",
        kind: "git_commit",
        target: "refs/heads/main",
        purpose: "attempt to bypass the exact-tree barrier",
        risk: "reversible_local",
        authorization: { state: "granted", source: "skill_invocation", ref: "request-1" },
        preconditions: ["candidate staged"],
        verification: ["commit tree checked"],
        status: "planned",
      }],
    });
    expect(validateManifest(closeModeBypass).some((error) => error.includes("every git_commit requires GUARD mode"))).toBe(true);
  });

  it("seals guard receipts and reconciles action status with execution evidence", () => {
    const base = manifest({
      mode: "GUARD",
      schema_version: "1.2",
      coordination: coordinationV12([]),
      guard: guardRecord(),
    });

    const rewrittenReceipt = structuredClone(base) as Dict;
    (((rewrittenReceipt.guard as Dict).receipts as Dict[])[0]!).actual_model = "rewritten-after-seal";
    expect(validateManifest(rewrittenReceipt).some((error) => error.includes("receipt_sha256: must seal canonical receipt content"))).toBe(true);

    const substitutedSeal = structuredClone(base) as Dict;
    ((((substitutedSeal.guard as Dict).commit_barrier as Dict).receipt_ids as Dict[])[0]!).receipt_sha256 = "b".repeat(64);
    expect(validateManifest(substitutedSeal).some((error) => error.includes("receipt seal does not match immutable guard receipt"))).toBe(true);

    const writer = lane("writer", { state: "ready" });
    const planned = operation("OP-PLANNED", writer);
    const executedTop = manifest({
      schema_version: "1.1",
      execution_state: "executed",
      coordination: coordination([writer]),
      actions: [planned],
    });
    expect(validateManifest(executedTop).some((error) => error.includes("executed manifest requires terminal action status"))).toBe(true);

    const forgedVerified = structuredClone(planned) as Dict;
    forgedVerified.outcome = {
      state: "verified",
      evidence: [{
        kind: "validation_result", object: "forged", command: "claim", result: "pass",
        observed_at: "2026-08-25T10:00:01Z", evidence_ref: evidenceRef,
      }],
    };
    expect(validateManifest(manifest({
      schema_version: "1.1", coordination: coordination([writer]), actions: [forgedVerified],
    })).some((error) => error.includes("verified outcome requires executed or failed"))).toBe(true);

    const verifiedFailure = structuredClone(forgedVerified) as Dict;
    verifiedFailure.status = "failed";
    (((verifiedFailure.outcome as Dict).evidence as Dict[])[0] as Dict).result = "failure observed and preserved";
    expect(validateManifest(manifest({
      schema_version: "1.1", execution_state: "executed", coordination: coordination([writer]), actions: [verifiedFailure],
    }))).toEqual([]);

    const malformedFailure = structuredClone(verifiedFailure) as Dict;
    ((malformedFailure.outcome as Dict).evidence as Dict[]) = [{ kind: "validation_result" }];
    expect(validateManifest(manifest({
      schema_version: "1.1", execution_state: "executed", coordination: coordination([writer]), actions: [malformedFailure],
    })).some((error) => error.includes("digest-referenced execution evidence"))).toBe(true);

    for (const status of ["blocked", "skipped"]) {
      const invalidTerminal = structuredClone(verifiedFailure) as Dict;
      invalidTerminal.status = status;
      expect(validateManifest(manifest({
        schema_version: "1.1", execution_state: "executed", coordination: coordination([writer]), actions: [invalidTerminal],
      })).some((error) => error.includes("verified outcome requires executed or failed"))).toBe(true);
    }

    const failedCommit = structuredClone(verifiedFailure) as Dict;
    failedCommit.kind = "git_commit";
    failedCommit.after_object = "f".repeat(40);
    expect(validateManifest(manifest({
      mode: "GUARD", schema_version: "1.2", execution_state: "executed",
      coordination: coordinationV12([laneV12("writer", "integration-target")]),
      guard: guardRecord(), actions: [failedCommit],
    })).some((error) => error.includes("resulting git_commit requires executed"))).toBe(true);
  });

  it("rejects integration and push before the exact-tree commit barrier crosses", () => {
    const integrator = laneV12("integrator", "integration-target", {
      role: "integrator",
      write_paths: ["**/*"],
    });
    for (const kind of ["git_integrate", "git_push"] as const) {
      const action = operation(`OP-PREMATURE-${kind}`, integrator, {
        kind,
        target: kind === "git_push" ? "origin/main" : "refs/heads/main",
        risk: kind === "git_push" ? "consequential_external" : "reversible_local",
        status: "executed",
        after_object: candidateTree,
      });
      const errors = validateManifest(manifest({
        mode: "GUARD",
        schema_version: "1.2",
        execution_state: "executed",
        coordination: coordinationV12([integrator]),
        guard: guardRecord(),
        actions: [action],
      }));
      expect(errors).toContain(
        "$.actions[0]: GUARD integration or push requires a crossed exact-tree commit barrier",
      );
    }
  });

  it("invalidates the exact-tree barrier when a mutation occurs after candidate mint", () => {
    const writer = laneV12("writer", "planning-projections");
    const mutation = operation("OP-MUTATE", writer, {
      status: "executed",
      after_object: "f".repeat(40),
      recorded_at: "2026-08-25T10:09:00Z",
    });
    const errors = validateManifest(manifest({
      mode: "GUARD",
      schema_version: "1.2",
      execution_state: "executed",
      coordination: coordinationV12([writer]),
      guard: guardRecord(),
      actions: [mutation],
    }));
    expect(errors.some((error) => error.includes("occurred after candidate mint"))).toBe(true);
  });

  it("crosses the GUARD commit barrier only when the created commit has the approved tree", () => {
    const integrator = laneV12("integrator", "integration-target", {
      role: "integrator",
      write_paths: ["**/*"],
    });
    const committed = "f".repeat(40);
    const guard = guardRecord();
    const receiptIds = ((guard.commit_barrier as Dict).receipt_ids as Dict[]);
    Object.assign(guard, { status: "crossed" });
    Object.assign(guard.commit_barrier as Dict, {
      state: "crossed",
      crossed_action_id: "OP-COMMIT",
    });
    const commitAction = operation("OP-COMMIT", integrator, {
      kind: "git_commit",
      target: "refs/heads/mc/candidate",
      status: "executed",
      after_object: committed,
      guard_commit: {
        candidate_tree: candidateTree,
        commit: committed,
        commit_tree: candidateTree,
        receipt_ids: receiptIds,
        evidence_ref: evidenceRef,
      },
    });
    const valid = manifest({
      mode: "GUARD",
      schema_version: "1.2",
      execution_state: "executed",
      coordination: coordinationV12([integrator]),
      guard,
      actions: [commitAction],
    });
    expect(validateManifest(valid)).toEqual([]);

    const changedByHook = structuredClone(valid) as Dict;
    (((changedByHook.actions as Dict[])[0]!.guard_commit as Dict).commit_tree) = "1".repeat(40);
    expect(validateManifest(changedByHook).some((error) => error.includes("commit_tree must equal the approved guard tree"))).toBe(true);

    const uncrossed = structuredClone(valid) as Dict;
    const barrier = ((uncrossed.guard as Dict).commit_barrier as Dict);
    (uncrossed.guard as Dict).status = "passed";
    barrier.state = "open";
    barrier.crossed_action_id = null;
    expect(validateManifest(uncrossed).some((error) => error.includes("executed git_commit forbidden before"))).toBe(true);

    const plannedAfterCrossing = structuredClone(valid) as Dict;
    (plannedAfterCrossing.actions as Dict[]).push(operation("OP-LATE", integrator));
    expect(validateManifest(plannedAfterCrossing).some((error) => error.includes("crossed barrier cannot coexist"))).toBe(true);
  });
});
