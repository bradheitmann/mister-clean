import { describe, expect, it } from "vitest";

import type { DebtFlow } from "../contracts/run-issue.js";
import { assertDebtFlow, calculatedEndingRealIssues, noHarmPassed } from "./accounting.js";

const flow: DebtFlow = {
  starting_real_issues: 100,
  discovered_preexisting: 8,
  caused_by_remediation: 0,
  concurrently_introduced: 2,
  paid: 30,
  invalidated_false_positives: 5,
  classification_correction_delta: -1,
  ending_real_issues: 74,
  boundary_blocked: 4,
};

describe("control-plane debt-flow accounting", () => {
  it("reconciles the transparent headline identity", () => {
    expect(calculatedEndingRealIssues(flow)).toBe(74);
    expect(() => assertDebtFlow(flow)).not.toThrow();
    expect(noHarmPassed(flow)).toBe(true);
  });

  it("rejects a headline that does not reconcile by stable issue count", () => {
    expect(() => assertDebtFlow({ ...flow, ending_real_issues: 75 })).toThrow(/must equal debt-flow identity/);
  });

  it("does not net caused debt against paid debt", () => {
    const harmed = { ...flow, caused_by_remediation: 1, ending_real_issues: 75 };
    expect(noHarmPassed(harmed)).toBe(false);
  });
});
