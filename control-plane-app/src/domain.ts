import { ALL_CAPABILITY_DEFINITIONS, CAPABILITY_DEFINITIONS } from "../../src/control-plane/contracts/capability-taxonomy.js";
import { rankSnapshotAgents, planSnapshotIssues, type Objective, type SnapshotAgent, type SnapshotIssue } from "./read-model.js";

export type SortMode = Objective;
export { ALL_CAPABILITY_DEFINITIONS };
export { planSnapshotIssues, rankSnapshotAgents };
export type { SnapshotAgent, SnapshotIssue };

export function resolveCapabilityQuery(query: string): (typeof CAPABILITY_DEFINITIONS)[number] | null {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) return null;
  return CAPABILITY_DEFINITIONS.find((definition) =>
    definition.id.toLocaleLowerCase() === needle || definition.label.toLocaleLowerCase() === needle
  ) ?? null;
}

export function matchesAgentQuery(agent: SnapshotAgent, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) return true;
  const searchable = [
    agent.model,
    agent.family,
    agent.harness,
    agent.reasoning_level,
    agent.deployment,
    agent.inference_source,
    agent.route,
    agent.invocation_adapter,
    agent.role,
    ...agent.champion_for,
    ...agent.capability_scores.map((score) => ALL_CAPABILITY_DEFINITIONS.find((definition) => definition.id === score.capability_id)?.label ?? score.capability_id),
  ];
  return searchable.join(" ").toLocaleLowerCase().includes(needle);
}
