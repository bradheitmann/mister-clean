/** Compatibility facade. Full repository audits retain discovery and live verification. */
export {
  DEFAULT_PLANNING_DEADLINE_MS,
  PlanningAuditTimeout,
  auditPlanningArtifacts,
  auditPlanningRepository,
} from "./planning-analysis/repository.js";
export type { PlanningAuditDeadline, PlanningAuditPartial } from "./planning-analysis/repository.js";
export { causalPlanningAccounting, isNonArtifactPlanningClass, isPlanningTextPath } from "./planning-analysis/policy.js";
export type { PlanningAuditResult, PlanningFinding, PlanningFindingCode, PlanningRawFinding, PlanningRootDebt, PlanningSource } from "./planning-analysis/policy.js";
