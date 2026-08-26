import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  validateManifest,
  validateReport,
} from "./records.js";

type Dict = Record<string, unknown>;

const digest = "a".repeat(64);
const commit = "a".repeat(40);
const evidenceRef = { path: "evidence.json", sha256: digest };

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
    authorization_basis: { source: "skill_invocation", ref: "request-1", scope: "named_repository_and_current_task", standing: true },
    policy_sources: ["policy#local"],
    actions: [],
    excluded_actions: [],
    ...overrides,
  };
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
});
