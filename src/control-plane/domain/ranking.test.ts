import { describe, expect, it } from "vitest";

import type { AgentTupleId } from "../contracts/primitives.js";
import { categoryChampions, rankAgents, type AgentCandidate } from "./ranking.js";

const agent = (value: string): AgentTupleId => value as AgentTupleId;
const architecture = "architecture_coherence_complexity_reduction";
const conformance = "canonical_conformance_exact_format";

const candidates: AgentCandidate[] = [
  {
    agent_tuple_id: agent("balanced"),
    active_in_repository: true,
    available: true,
    capability_scores: [
      { capability_id: architecture, score: 0.8, confidence: 0.9, verified_trials: 30, qualification: "Qualified" },
      { capability_id: conformance, score: 0.9, confidence: 0.9, verified_trials: 30, qualification: "Qualified" },
    ],
  },
  {
    agent_tuple_id: agent("architect"),
    active_in_repository: false,
    available: true,
    capability_scores: [
      { capability_id: architecture, score: 1, confidence: 0.95, verified_trials: 50, qualification: "Production_cleared" },
      { capability_id: conformance, score: 0.6, confidence: 0.95, verified_trials: 50, qualification: "Production_cleared" },
    ],
  },
  {
    agent_tuple_id: agent("untested"),
    active_in_repository: true,
    available: true,
    capability_scores: [
      { capability_id: architecture, score: 1, confidence: 1, verified_trials: 1, qualification: "EVALUATING" },
      { capability_id: conformance, score: 1, confidence: 1, verified_trials: 1, qualification: "EVALUATING" },
    ],
  },
];

describe("category-specific agent routing", () => {
  it("names a category champion instead of a universal champion", () => {
    expect(categoryChampions(candidates, architecture)[0]?.agent_tuple_id).toBe(agent("architect"));
    expect(categoryChampions(candidates, conformance)[0]?.agent_tuple_id).toBe(agent("balanced"));
  });

  it("applies 1x to 3x weights after qualification gates", () => {
    const ranked = rankAgents(candidates, [
      { capability_id: architecture, weight: 3 },
      { capability_id: conformance, weight: 1 },
    ]);
    expect(ranked.map((entry) => entry.agent_tuple_id)).toEqual([agent("architect"), agent("balanced")]);
    expect(ranked.some((entry) => entry.agent_tuple_id === agent("untested"))).toBe(false);
  });
});
