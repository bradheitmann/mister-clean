import { describe, expect, it } from "vitest";

import type {
  AgentIdentityLease,
  AgentIdentityObservation,
  AgentTuple,
} from "../contracts/agent-evaluation.js";
import type {
  AgentIdentityLeaseId,
  AgentTupleId,
  ControlSurfaceId,
  EvidenceRef,
  ExecutionRouteId,
  HarnessId,
  IsoTimestamp,
  ModelId,
  Sha256,
} from "../contracts/primitives.js";
import { evaluateAgentIdentityLease } from "./agent-identity.js";

const tuple: AgentTuple = {
  agent_tuple_id: "tuple-sol-codex-high" as AgentTupleId,
  model_id: "gpt-5.6-sol" as ModelId,
  harness_id: "codex-desktop" as HarnessId,
  reasoning_level: "high",
};
const evidence: EvidenceRef = { path: "identity/pre-dispatch.png", sha256: "a".repeat(64) as Sha256 };
const observedAt = "2026-08-26T12:00:00.000Z" as IsoTimestamp;
const route = "route-codex" as ExecutionRouteId;

function observation(phase: AgentIdentityObservation["phase"]): AgentIdentityObservation {
  return {
    observation_id: `observation-${phase}`,
    phase,
    requested_agent_tuple_id: tuple.agent_tuple_id,
    observed_model_id: tuple.model_id,
    observed_harness_id: tuple.harness_id,
    observed_reasoning_level: tuple.reasoning_level,
    execution_route_id: route,
    control_surface_id: "surface-1" as ControlSurfaceId,
    harness_session_token: "session-1",
    process_instance_token: "process-1",
    evidence_kind: "external_visual_readback",
    evidence: [{ ...evidence, sha256: (phase === "pre_evaluation" ? "b" : "a").repeat(64) as Sha256 }],
    observer_actor_id: "dispatcher-1",
    intended_surface_label: "GPT 5.6 Sol High",
    worker_self_report: "I think I am another model",
    observed_at: (phase === "pre_evaluation" ? "2026-08-26T12:00:01.000Z" : observedAt) as IsoTimestamp,
  };
}

function lease(overrides: Partial<AgentIdentityLease> = {}): AgentIdentityLease {
  return {
    identity_lease_id: "identity-lease-1" as AgentIdentityLeaseId,
    requested_tuple: tuple,
    execution_route_id: route,
    pre_dispatch: observation("pre_dispatch"),
    pre_evaluation: observation("pre_evaluation"),
    invalidations: [],
    ...overrides,
  };
}

describe("external agent identity lease", () => {
  it("requires an external readback before dispatch and a second readback before quality credit", () => {
    expect(evaluateAgentIdentityLease(lease({ pre_evaluation: null }), "dispatch")).toMatchObject({
      disposition: "BOUND_FOR_DISPATCH",
      dispatch_allowed: true,
      contributes_quality_credit: false,
    });
    expect(evaluateAgentIdentityLease(lease(), "evaluation")).toMatchObject({
      disposition: "BOUND_FOR_EVALUATION",
      dispatch_allowed: true,
      contributes_quality_credit: true,
    });
  });

  it("does not treat a tab label or worker self-report as execution identity", () => {
    const result = evaluateAgentIdentityLease(lease({ pre_dispatch: null }), "dispatch");
    expect(result).toMatchObject({ disposition: "IDENTITY_UNBOUND", dispatch_allowed: false });
    expect(result.reasons.join(" ")).toContain("external identity observation is missing");
  });

  it("blocks a mismatched observed tuple", () => {
    const mismatched = { ...observation("pre_dispatch"), observed_model_id: "opus-5" as ModelId };
    expect(evaluateAgentIdentityLease(lease({ pre_dispatch: mismatched }), "dispatch")).toMatchObject({
      disposition: "MISMATCH",
      dispatch_allowed: false,
      contributes_quality_credit: false,
    });
  });

  it("blocks a route mismatch even if every tuple field is self-consistent", () => {
    const mismatched = { ...observation("pre_dispatch"), execution_route_id: "route-other" as ExecutionRouteId };
    expect(evaluateAgentIdentityLease(lease({ pre_dispatch: mismatched }), "dispatch")).toMatchObject({
      disposition: "MISMATCH",
      dispatch_allowed: false,
      contributes_quality_credit: false,
    });
  });

  it("invalidates identity across restart, relaunch, fallback, or session replacement", () => {
    const invalidated = lease({ invalidations: [{ reason: "harness_restart", occurred_at: observedAt, evidence: [evidence] }] });
    expect(evaluateAgentIdentityLease(invalidated, "evaluation")).toMatchObject({
      disposition: "INVALIDATED",
      dispatch_allowed: false,
      contributes_quality_credit: false,
    });
    const replaced = { ...observation("pre_evaluation"), harness_session_token: "session-2" };
    const result = evaluateAgentIdentityLease(lease({ pre_evaluation: replaced }), "evaluation");
    expect(result.disposition).toBe("IDENTITY_UNBOUND");
    expect(result.contributes_quality_credit).toBe(false);
  });

  it("rejects a replayed readback whose phase was changed without a later external observation", () => {
    const dispatch = observation("pre_dispatch");
    const replayed = { ...dispatch, phase: "pre_evaluation" as const };
    const result = evaluateAgentIdentityLease(lease({ pre_dispatch: dispatch, pre_evaluation: replayed }), "evaluation");
    expect(result).toMatchObject({ disposition: "IDENTITY_UNBOUND", contributes_quality_credit: false });
    expect(result.reasons.join(" ")).toMatch(/reuses|strictly later/);
  });

  it("rejects empty execution tokens even when the caller asserts bound identity", () => {
    const result = evaluateAgentIdentityLease(lease({
      pre_evaluation: { ...observation("pre_evaluation"), harness_session_token: "", process_instance_token: "" },
    }), "evaluation");
    expect(result).toMatchObject({ disposition: "IDENTITY_UNBOUND", contributes_quality_credit: false });
  });
});
