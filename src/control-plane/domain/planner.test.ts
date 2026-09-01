import { describe, expect, it } from "vitest";

import type { CoordinationDomainKey, IssueId, Sha256 } from "../contracts/primitives.js";
import { planRemediation, type PlannerIssue } from "./planner.js";

const id = (value: string): IssueId => value as IssueId;
const key = (value: string): CoordinationDomainKey => value as CoordinationDomainKey;
const sha = (value: string): Sha256 => value.padEnd(64, "0") as Sha256;

function issue(
  issueId: string,
  overrides: Partial<PlannerIssue> = {},
): PlannerIssue {
  return {
    issue_id: id(issueId),
    prerequisite_issue_ids: [],
    severity: 3,
    remediation_difficulty: 3,
    unlock_value: 0,
    regression_risk: 0,
    coordination_claims: [],
    blocked_reasons: [],
    ...overrides,
  };
}

describe("dependency and coordination planning", () => {
  it("puts severity and difficulty first while respecting prerequisites", () => {
    const plan = planRemediation([
      issue("easy", { severity: 1, remediation_difficulty: 1, unlock_value: 1_000_000 }),
      issue("hard", { severity: 5, remediation_difficulty: 5 }),
      issue("dependent", { severity: 5, remediation_difficulty: 5, prerequisite_issue_ids: [id("easy")] }),
    ]);
    expect(plan.waves[0]?.issue_ids).toEqual([id("hard"), id("easy")]);
    expect(plan.waves[1]?.issue_ids).toEqual([id("dependent")]);
    expect(plan.items.find((item) => item.issue_id === id("dependent"))?.concurrency).toBe("Ordered");
  });

  it("serializes writes to one semantic domain", () => {
    const claim = (operationClass: string) => ({
      key: key("planning-projections"),
      access: "write" as const,
      operation_class: operationClass,
      commutes_with: [],
      commutativity_ref: null,
    });
    const plan = planRemediation([
      issue("a", { coordination_claims: [claim("terminalize-story")] }),
      issue("b", { coordination_claims: [claim("update-epic")] }),
    ]);
    expect(plan.waves).toHaveLength(2);
    expect(plan.items.find((item) => item.issue_id === id("b"))?.concurrency).toBe("Ordered");
  });

  it("allows only symmetric digest-bound commutativity", () => {
    const evidence = { path: "policy.json", sha256: sha("a") };
    const plan = planRemediation([
      issue("a", { coordination_claims: [{
        key: key("quota"), access: "write", operation_class: "decrement", commutes_with: ["increment"], commutativity_ref: evidence,
      }] }),
      issue("b", { coordination_claims: [{
        key: key("quota"), access: "write", operation_class: "increment", commutes_with: ["decrement"], commutativity_ref: evidence,
      }] }),
    ]);
    expect(plan.waves[0]?.issue_ids).toEqual([id("a"), id("b")]);
  });

  it("fails closed on a cycle and marks missing prerequisites blocked", () => {
    expect(() => planRemediation([
      issue("a", { prerequisite_issue_ids: [id("b")] }),
      issue("b", { prerequisite_issue_ids: [id("a")] }),
    ])).toThrow(/contains a cycle/);
    const plan = planRemediation([issue("a", { prerequisite_issue_ids: [id("missing")] })]);
    expect(plan.items[0]?.concurrency).toBe("Blocked");
  });
});
