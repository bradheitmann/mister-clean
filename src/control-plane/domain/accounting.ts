import type { DebtFlow } from "../contracts/run-issue.js";

function requireCount(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a nonnegative safe integer`);
  }
}

export function calculatedEndingRealIssues(flow: Omit<DebtFlow, "ending_real_issues" | "boundary_blocked">): number {
  for (const [field, value] of Object.entries(flow)) {
    if (field === "classification_correction_delta") continue;
    requireCount(value, field);
  }
  if (!Number.isSafeInteger(flow.classification_correction_delta)) {
    throw new Error("classification_correction_delta must be a safe integer");
  }
  const ending = flow.starting_real_issues
    + flow.discovered_preexisting
    + flow.caused_by_remediation
    + flow.concurrently_introduced
    - flow.paid
    - flow.invalidated_false_positives
    + flow.classification_correction_delta;
  if (!Number.isSafeInteger(ending) || ending < 0) {
    throw new Error("debt-flow identity produced an invalid ending issue count");
  }
  return ending;
}

export function assertDebtFlow(flow: DebtFlow): void {
  requireCount(flow.ending_real_issues, "ending_real_issues");
  requireCount(flow.boundary_blocked, "boundary_blocked");
  const calculated = calculatedEndingRealIssues(flow);
  if (calculated !== flow.ending_real_issues) {
    throw new Error(`ending_real_issues must equal debt-flow identity (${calculated})`);
  }
  if (flow.boundary_blocked > flow.ending_real_issues) {
    throw new Error("boundary_blocked cannot exceed ending_real_issues");
  }
}

export function noHarmPassed(flow: DebtFlow): boolean {
  assertDebtFlow(flow);
  return flow.caused_by_remediation === 0;
}
