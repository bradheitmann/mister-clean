import { describe, expect, it } from "vitest";
import { resolveCapabilityQuery } from "./domain.js";
import { demoSnapshot } from "./fixture.js";
import { debtFlowShare, dependencyClosure, groupSnapshotAgents, knownNowIssueIds, planSnapshotIssues, projectInventoryAgents, projectWorkbenchIssues, rankSnapshotAgents } from "./read-model.js";

describe("control-plane read-model adapters", () => {
  it("keeps dependency-bound work ordered and custody-bound work blocked without paying planned issues", () => {
    const result = planSnapshotIssues(demoSnapshot.issues, "default");
    const currentState = result.items.find((issue) => issue.issue_id === "MC-102");
    const custody = result.items.find((issue) => issue.issue_id === "MC-104");

    expect(currentState?.plan.concurrency).toBe("Ordered");
    expect(custody?.plan.concurrency).toBe("Blocked");
    expect(demoSnapshot.current_flow.paid).toBe(212);
    expect(result.plan.waves.flatMap((wave) => wave.issue_ids).map(String)).not.toContain("paid");
  });

  it("projects the balanced planner in exact DAG order rather than source order", () => {
    const result = planSnapshotIssues(demoSnapshot.issues, "default");
    expect(result.items.map((issue) => issue.issue_id)).toEqual(["MC-101", "MC-103", "MC-105", "MC-102", "MC-104"]);
    expect(result.items.map((issue) => issue.plan.order)).toEqual([1, 2, 3, 4, 0]);
  });

  it("adds prerequisites to an explicit selection", () => {
    expect(dependencyClosure(demoSnapshot.issues, ["MC-102"])).toEqual(["MC-102", "MC-101"]);
  });

  it("treats paid prerequisites as satisfied without recommending the paid issue again", () => {
    const issues = demoSnapshot.issues.map((issue) => issue.issue_id === "MC-101" ? { ...issue, state: "paid" as const } : issue);
    const result = planSnapshotIssues(issues, "default");
    expect(result.items.map((issue) => issue.issue_id)).not.toContain("MC-101");
    expect(result.items.find((issue) => issue.issue_id === "MC-102")?.plan.concurrency).toBe("Parallelizable");
    expect(dependencyClosure(issues, ["MC-102"])).toEqual(["MC-102"]);
  });

  it("applies hard availability and qualification gates before ranking", () => {
    const result = rankSnapshotAgents(demoSnapshot.agents, [{ capability_id: "planning_projection_reconciliation", weight: 3 }]);
    expect(result.ranked.every((item) => item.agent.available)).toBe(true);
    expect(result.excluded.map((item) => item.agent.agent_tuple_id)).toContain("tuple-luna-droid-medium");
    expect(result.ranked[0]?.agent.agent_tuple_id).toBe("tuple-glm-pi-high");
  });

  it("resolves an exact autocomplete category without treating it as an agent-name filter", () => {
    expect(resolveCapabilityQuery("Canonical conformance and exact-format reconciliation — Spit-shine")?.id)
      .toBe("canonical_conformance_exact_format");
    expect(resolveCapabilityQuery("  dependency/dag planning  ")?.id).toBe("dependency_dag_planning");
    expect(resolveCapabilityQuery("spit")).toBeNull();
    expect(resolveCapabilityQuery("mister_clean_protocol_improvement")).toBeNull();
  });

  it("filters and re-sorts the issue workbench without mutating the canonical plan", () => {
    const planned = planSnapshotIssues(demoSnapshot.issues, "default").items;
    const release = projectWorkbenchIssues(planned, demoSnapshot.runs, { sort: "plan", query: "", domain: "release", owner: "", state: "" });
    const byDifficulty = projectWorkbenchIssues(planned, demoSnapshot.runs, { sort: "difficulty", query: "", domain: "", owner: "", state: "" });
    const noMatches = projectWorkbenchIssues(planned, demoSnapshot.runs, { sort: "plan", query: "not-a-real-issue", domain: "", owner: "", state: "" });

    expect(release.map((issue) => issue.issue_id)).toEqual(["MC-103"]);
    expect(byDifficulty.slice(0, 2).map((issue) => issue.issue_id)).toEqual(["MC-101", "MC-103"]);
    expect(noMatches).toEqual([]);
    expect(planned.map((issue) => issue.issue_id)).toEqual(["MC-101", "MC-103", "MC-105", "MC-102", "MC-104"]);
  });

  it("derives current known-now overlays without rewriting historical observations", () => {
    const baseline = demoSnapshot.runs[0]!;
    expect(baseline.real_issue_ids).toEqual([]);
    expect(knownNowIssueIds(demoSnapshot, baseline)).toEqual(["MC-101", "MC-102", "MC-103", "MC-104", "MC-105"]);
    expect(knownNowIssueIds({ ...demoSnapshot, runs: [...demoSnapshot.runs].reverse() }, baseline)).toEqual(["MC-101", "MC-102", "MC-103", "MC-104", "MC-105"]);
    expect(baseline.real_issue_ids).toEqual([]);
  });

  it("projects later-discovered pre-existing debt backward but not later-introduced debt or false positives", () => {
    const baseline = demoSnapshot.runs[0]!;
    const issues = demoSnapshot.issues.map((issue) => issue.issue_id === "MC-105" ? { ...issue, first_detected_run_id: "MC-RUN-0042", origin: "newly_discovered_preexisting" as const } : issue);
    expect(knownNowIssueIds({ ...demoSnapshot, issues }, baseline)).toContain("MC-105");

    const introduced = issues.map((issue) => issue.issue_id === "MC-105" ? { ...issue, origin: "introduced_by_run" as const } : issue);
    expect(knownNowIssueIds({ ...demoSnapshot, issues: introduced }, baseline)).not.toContain("MC-105");

    const falsePositive = issues.map((issue) => issue.issue_id === "MC-105" ? { ...issue, state: "false_positive" as const } : issue);
    expect(knownNowIssueIds({ ...demoSnapshot, issues: falsePositive }, baseline)).not.toContain("MC-105");
  });

  it("groups the roster by family and harness while preserving exact treatments", () => {
    const groups = groupSnapshotAgents(demoSnapshot.agents);
    expect(groups[0]).toMatchObject({ family: "GLM", harness: "Pi", active_count: 1, available_count: 1 });
    expect(groups.find((group) => group.family === "GPT-5" && group.harness === "Droid")?.treatments.map((agent) => agent.agent_tuple_id)).toEqual(["tuple-luna-droid-medium"]);
    expect(groups.flatMap((group) => group.treatments)).toHaveLength(demoSnapshot.agents.length);
  });

  it("filters and sorts exact inventory treatments with missing metrics last", () => {
    const base = { query: "", harness: "", availability: "", capability: "" };
    expect(projectInventoryAgents(demoSnapshot.agents, { ...base, sort: "qualification" })[0]?.agent_tuple_id).toBe("tuple-terra-codex-medium");
    expect(projectInventoryAgents(demoSnapshot.agents, { ...base, sort: "availability" }).slice(0, 2).map((agent) => agent.availability)).toEqual(["available", "available"]);
    expect(projectInventoryAgents(demoSnapshot.agents, { ...base, sort: "model", harness: "Pi" }).map((agent) => agent.agent_tuple_id)).toEqual(["tuple-glm-pi-high"]);
    expect(projectInventoryAgents(demoSnapshot.agents, { ...base, sort: "model", query: "not-a-real-agent" })).toEqual([]);
  });

  it("binds debt visualization magnitude to the observed flow and clamps it safely", () => {
    expect(debtFlowShare(demoSnapshot.current_flow.paid, demoSnapshot.current_flow)).toBeCloseTo(97.6958525345622, 10);
    expect(debtFlowShare(-1, demoSnapshot.current_flow)).toBe(0);
    expect(debtFlowShare(9999, demoSnapshot.current_flow)).toBe(100);
  });
});
