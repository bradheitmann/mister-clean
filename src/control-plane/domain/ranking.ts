import type {
  AgentTupleId,
  CapabilityId,
} from "../contracts/primitives.js";
import type { QualificationLevel } from "../contracts/agent-evaluation.js";

export type CategoryWeight = 1 | 2 | 3;

export interface CapabilitySelection {
  readonly capability_id: CapabilityId;
  readonly weight: CategoryWeight;
}

export interface CandidateCapabilityScore {
  readonly capability_id: CapabilityId;
  readonly score: number;
  readonly confidence: number;
  readonly verified_trials: number;
  readonly qualification: QualificationLevel;
}

export interface AgentCandidate {
  readonly agent_tuple_id: AgentTupleId;
  readonly active_in_repository: boolean;
  readonly available: boolean;
  readonly capability_scores: readonly CandidateCapabilityScore[];
}

export interface RankedAgentCandidate {
  readonly agent_tuple_id: AgentTupleId;
  readonly weighted_score: number;
  readonly active_in_repository: boolean;
  readonly category_scores: readonly {
    readonly capability_id: CapabilityId;
    readonly weighted_score: number;
  }[];
}

function validUnitInterval(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${field} must be between 0 and 1`);
  }
}

/** Apply hard availability/qualification gates before categorical ranking. */
export function rankAgents(
  candidates: readonly AgentCandidate[],
  selections: readonly CapabilitySelection[],
  minimumQualification: QualificationLevel = "Recommended_supervised",
): readonly RankedAgentCandidate[] {
  if (selections.length === 0) return [];
  const selected = new Map<CapabilityId, CategoryWeight>();
  for (const selection of selections) {
    if (selected.has(selection.capability_id)) throw new Error(`duplicate capability selection ${selection.capability_id}`);
    selected.set(selection.capability_id, selection.weight);
  }
  const qualificationRank: Record<QualificationLevel, number> = {
    UNTESTED: 0,
    EVALUATING: 1,
    Recommended_supervised: 2,
    Qualified: 3,
    Production_cleared: 4,
    DISQUALIFIED: -1,
  };
  const minimumRank = qualificationRank[minimumQualification];

  return candidates.flatMap((candidate): RankedAgentCandidate[] => {
    if (!candidate.available) return [];
    const scores = new Map(candidate.capability_scores.map((score) => [score.capability_id, score]));
    const categoryScores: RankedAgentCandidate["category_scores"][number][] = [];
    for (const [capabilityId, weight] of selected) {
      const score = scores.get(capabilityId);
      if (!score || qualificationRank[score.qualification] < minimumRank) return [];
      validUnitInterval(score.score, `${String(candidate.agent_tuple_id)}.${capabilityId}.score`);
      validUnitInterval(score.confidence, `${String(candidate.agent_tuple_id)}.${capabilityId}.confidence`);
      categoryScores.push({ capability_id: capabilityId, weighted_score: score.score * score.confidence * weight });
    }
    return [{
      agent_tuple_id: candidate.agent_tuple_id,
      weighted_score: categoryScores.reduce((sum, score) => sum + score.weighted_score, 0),
      active_in_repository: candidate.active_in_repository,
      category_scores: categoryScores,
    }];
  }).sort((left, right) => (
    right.weighted_score - left.weighted_score
    || Number(right.active_in_repository) - Number(left.active_in_repository)
    || String(left.agent_tuple_id).localeCompare(String(right.agent_tuple_id))
  ));
}

export function categoryChampions(
  candidates: readonly AgentCandidate[],
  capabilityId: CapabilityId,
): readonly RankedAgentCandidate[] {
  return rankAgents(candidates, [{ capability_id: capabilityId, weight: 1 }]);
}
