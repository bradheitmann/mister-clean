import type { CapabilityEvaluatorId, CapabilityId } from "./primitives.js";
import { CAPABILITY_DEFINITIONS } from "./capability-taxonomy.js";

/**
 * Versioned, source-controlled evaluator registry.  This is intentionally a
 * small manifest rather than a second policy engine: one selected capability
 * receives exactly these four independent judgments before it can earn credit.
 */
export const CAPABILITY_EVALUATOR_REGISTRY_VERSION = "1.0" as const;

export const EVALUATION_DIMENSIONS = [
  "verified_success",
  "independent_evaluation",
  "no_harm",
  "authority",
] as const;

export type EvaluationDimension = (typeof EVALUATION_DIMENSIONS)[number];

export interface CanonicalCapabilityEvaluator {
  readonly evaluator_id: CapabilityEvaluatorId;
  readonly capability_id: CapabilityId;
  readonly evaluation_dimension: EvaluationDimension;
  readonly independent_evaluator: boolean;
  readonly evaluator_version: typeof CAPABILITY_EVALUATOR_REGISTRY_VERSION;
  /** A capability-specific case identity, not a worker-supplied score. */
  readonly case_id: string;
  readonly question: string;
}

export function canonicalCapabilityEvaluators(capabilityId: CapabilityId): readonly CanonicalCapabilityEvaluator[] {
  const capability = CAPABILITY_DEFINITIONS.find((definition) => definition.id === capabilityId);
  if (capability === undefined) throw new Error(`No canonical evaluator case for ${capabilityId}`);
  const caseId = `mister-clean.case.${capabilityId}.${CAPABILITY_EVALUATOR_REGISTRY_VERSION}`;
  const causalCalibration = capabilityId === "root_cause_analysis"
    ? " Record observed symptom accuracy separately from causal completeness; do not claim a sole cause until the cited before/after evidence is inspected."
    : " Do not substitute a worker self-report or an uninspected cited artifact for retained independent evidence.";
  return EVALUATION_DIMENSIONS.map((dimension) => ({
    evaluator_id: `mister-clean.${capabilityId}.${CAPABILITY_EVALUATOR_REGISTRY_VERSION}.${dimension}` as CapabilityEvaluatorId,
    capability_id: capabilityId,
    evaluation_dimension: dimension,
    independent_evaluator: dimension === "independent_evaluation",
    evaluator_version: CAPABILITY_EVALUATOR_REGISTRY_VERSION,
    case_id: caseId,
    question: `${capability.label}: independently assess ${dimension} against retained evidence for ${caseId}.${causalCalibration}`,
  }));
}
