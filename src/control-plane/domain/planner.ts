import type {
  CoordinationDomainKey,
  EvidenceRef,
  IssueId,
} from "../contracts/primitives.js";
import type {
  ConcurrencyClass,
  PlannedIssue,
} from "../contracts/run-issue.js";

export interface PlannerCoordinationClaim {
  readonly key: CoordinationDomainKey;
  readonly access: "read" | "write";
  readonly operation_class: string;
  readonly commutes_with: readonly string[];
  readonly commutativity_ref: EvidenceRef | null;
}

export interface PlannerIssue {
  readonly issue_id: IssueId;
  readonly prerequisite_issue_ids: readonly IssueId[];
  readonly severity: 1 | 2 | 3 | 4 | 5;
  readonly remediation_difficulty: 1 | 2 | 3 | 4 | 5;
  readonly unlock_value: number;
  readonly regression_risk: number;
  readonly coordination_claims: readonly PlannerCoordinationClaim[];
  readonly blocked_reasons: readonly string[];
}

export interface PlannerPolicy {
  readonly severity_weight: number;
  readonly difficulty_weight: number;
  readonly unlock_value_weight: number;
  readonly regression_risk_weight: number;
}

export interface PlannedWave {
  readonly sequence: number;
  readonly issue_ids: readonly IssueId[];
}

export interface RemediationPlan {
  readonly waves: readonly PlannedWave[];
  readonly items: readonly PlannedIssue[];
}

export const DEFAULT_PLANNER_POLICY: PlannerPolicy = Object.freeze({
  severity_weight: 1,
  difficulty_weight: 1,
  unlock_value_weight: 1,
  regression_risk_weight: 1,
});

function safeMetric(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a nonnegative finite number`);
}

function compareIssue(left: PlannerIssue, right: PlannerIssue, policy: PlannerPolicy): number {
  const primaryLeft = left.severity * policy.severity_weight
    + left.remediation_difficulty * policy.difficulty_weight;
  const primaryRight = right.severity * policy.severity_weight
    + right.remediation_difficulty * policy.difficulty_weight;
  if (primaryLeft !== primaryRight) return primaryRight - primaryLeft;
  const unlockLeft = left.unlock_value * policy.unlock_value_weight;
  const unlockRight = right.unlock_value * policy.unlock_value_weight;
  if (unlockLeft !== unlockRight) return unlockRight - unlockLeft;
  const riskLeft = left.regression_risk * policy.regression_risk_weight;
  const riskRight = right.regression_risk * policy.regression_risk_weight;
  if (riskLeft !== riskRight) return riskRight - riskLeft;
  return String(left.issue_id).localeCompare(String(right.issue_id));
}

function symmetricCommutativity(left: PlannerCoordinationClaim, right: PlannerCoordinationClaim): boolean {
  if (!left.commutativity_ref || !right.commutativity_ref) return false;
  return left.commutes_with.includes(right.operation_class)
    && right.commutes_with.includes(left.operation_class)
    && left.commutativity_ref.path === right.commutativity_ref.path
    && left.commutativity_ref.sha256 === right.commutativity_ref.sha256;
}

export function coordinationConflict(left: PlannerIssue, right: PlannerIssue): boolean {
  for (const leftClaim of left.coordination_claims) {
    for (const rightClaim of right.coordination_claims) {
      if (leftClaim.key !== rightClaim.key) continue;
      if (leftClaim.access === "read" && rightClaim.access === "read") continue;
      if (symmetricCommutativity(leftClaim, rightClaim)) continue;
      return true;
    }
  }
  return false;
}

/**
 * Produce dependency-closed waves. Sorting affects which eligible item wins a
 * semantic collision; it never bypasses a prerequisite or a hard block.
 */
export function planRemediation(
  input: readonly PlannerIssue[],
  policy: PlannerPolicy = DEFAULT_PLANNER_POLICY,
): RemediationPlan {
  for (const [field, value] of Object.entries(policy)) safeMetric(value, `policy.${field}`);
  const byId = new Map<IssueId, PlannerIssue>();
  for (const issue of input) {
    if (byId.has(issue.issue_id)) throw new Error(`duplicate issue_id ${String(issue.issue_id)}`);
    safeMetric(issue.unlock_value, `${String(issue.issue_id)}.unlock_value`);
    safeMetric(issue.regression_risk, `${String(issue.issue_id)}.regression_risk`);
    byId.set(issue.issue_id, issue);
  }

  const blocked = new Map<IssueId, string[]>();
  for (const issue of input) {
    const reasons = [...issue.blocked_reasons];
    for (const prerequisite of issue.prerequisite_issue_ids) {
      if (!byId.has(prerequisite)) reasons.push(`missing prerequisite ${String(prerequisite)}`);
    }
    if (reasons.length > 0) blocked.set(issue.issue_id, reasons);
  }

  const scheduled = new Set<IssueId>();
  const serializedByConflict = new Set<IssueId>();
  const waves: PlannedWave[] = [];
  const schedulableCount = input.length - blocked.size;
  while (scheduled.size < schedulableCount) {
    const eligible = input
      .filter((issue) => !blocked.has(issue.issue_id) && !scheduled.has(issue.issue_id))
      .filter((issue) => issue.prerequisite_issue_ids.every((id) => scheduled.has(id)))
      .sort((left, right) => compareIssue(left, right, policy));
    if (eligible.length === 0) {
      const unresolved = input
        .filter((issue) => !blocked.has(issue.issue_id) && !scheduled.has(issue.issue_id))
        .map((issue) => String(issue.issue_id));
      throw new Error(`issue dependency graph contains a cycle: ${unresolved.join(", ")}`);
    }

    const selected: PlannerIssue[] = [];
    for (const candidate of eligible) {
      if (selected.some((chosen) => coordinationConflict(candidate, chosen))) {
        serializedByConflict.add(candidate.issue_id);
        continue;
      }
      selected.push(candidate);
    }
    if (selected.length === 0) throw new Error("planner failed to select an eligible issue");
    for (const issue of selected) scheduled.add(issue.issue_id);
    waves.push({ sequence: waves.length + 1, issue_ids: selected.map((issue) => issue.issue_id) });
  }

  const order = new Map<IssueId, number>();
  let nextOrder = 1;
  for (const wave of waves) {
    for (const issueId of wave.issue_ids) order.set(issueId, nextOrder++);
  }
  const items = input.map((issue): PlannedIssue => {
    const reasons = blocked.get(issue.issue_id) ?? [];
    let concurrency: ConcurrencyClass = "Parallelizable";
    if (reasons.length > 0) concurrency = "Blocked";
    else if (issue.prerequisite_issue_ids.length > 0 || serializedByConflict.has(issue.issue_id)) concurrency = "Ordered";
    return {
      issue_id: issue.issue_id,
      order: order.get(issue.issue_id) ?? 0,
      concurrency,
      prerequisite_issue_ids: issue.prerequisite_issue_ids,
      unlock_value: issue.unlock_value,
      regression_risk: issue.regression_risk,
      classification_reason: reasons.length > 0
        ? reasons
        : serializedByConflict.has(issue.issue_id)
          ? ["serialized by a semantic coordination-domain collision"]
          : issue.prerequisite_issue_ids.length > 0
            ? ["ordered behind declared prerequisites"]
            : ["eligible without a dependency or semantic collision"],
    };
  });
  return { waves, items };
}
