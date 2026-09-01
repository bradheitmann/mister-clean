import type {
  AgentIdentityDisposition,
  AgentIdentityLease,
  AgentIdentityObservation,
  AgentTuple,
} from "../contracts/agent-evaluation.js";

export interface AgentIdentityDecision {
  readonly disposition: AgentIdentityDisposition;
  readonly dispatch_allowed: boolean;
  readonly contributes_quality_credit: boolean;
  readonly reasons: readonly string[];
}

function observationProblems(
  observation: AgentIdentityObservation | null,
  phase: AgentIdentityObservation["phase"],
  expected: AgentTuple,
  lease: AgentIdentityLease,
): string[] {
  if (observation === null) return [`${phase} external identity observation is missing`];
  const reasons: string[] = [];
  if (observation.observation_id.trim().length === 0) reasons.push(`${phase} observation has no immutable observation id`);
  if (observation.phase !== phase) reasons.push(`${phase} observation has the wrong phase`);
  if (observation.requested_agent_tuple_id !== expected.agent_tuple_id) reasons.push(`${phase} requested tuple does not match the lease`);
  if (observation.execution_route_id !== lease.execution_route_id) reasons.push(`${phase} execution route does not match the lease`);
  if (observation.observed_model_id !== expected.model_id) reasons.push(`${phase} observed model does not match the requested tuple`);
  if (observation.observed_harness_id !== expected.harness_id) reasons.push(`${phase} observed harness does not match the requested tuple`);
  if (observation.observed_reasoning_level !== expected.reasoning_level) reasons.push(`${phase} observed reasoning level does not match the requested tuple`);
  if (observation.evidence.length === 0) reasons.push(`${phase} observation has no external evidence`);
  if (observation.evidence.some((item) => item.path.trim().length === 0 || !/^[0-9a-f]{64}$/i.test(String(item.sha256)))) reasons.push(`${phase} observation has invalid external evidence`);
  if (observation.observer_actor_id.trim().length === 0) reasons.push(`${phase} observation has no external observer`);
  if (observation.harness_session_token.trim().length === 0) reasons.push(`${phase} observation has no harness session token`);
  if (observation.process_instance_token.trim().length === 0) reasons.push(`${phase} observation has no process instance token`);
  return reasons;
}

export function evaluateAgentIdentityLease(
  lease: AgentIdentityLease,
  stage: "dispatch" | "evaluation",
): AgentIdentityDecision {
  if (lease.invalidations.length > 0) {
    return {
      disposition: "INVALIDATED",
      dispatch_allowed: false,
      contributes_quality_credit: false,
      reasons: lease.invalidations.map((event) => `identity lease invalidated: ${event.reason}`),
    };
  }

  const dispatchProblems = observationProblems(lease.pre_dispatch, "pre_dispatch", lease.requested_tuple, lease);
  if (dispatchProblems.length > 0) {
    const mismatch = dispatchProblems.some((reason) => reason.includes("does not match"));
    return {
      disposition: mismatch ? "MISMATCH" : "IDENTITY_UNBOUND",
      dispatch_allowed: false,
      contributes_quality_credit: false,
      reasons: dispatchProblems,
    };
  }

  if (stage === "dispatch") {
    return {
      disposition: "BOUND_FOR_DISPATCH",
      dispatch_allowed: true,
      contributes_quality_credit: false,
      reasons: [],
    };
  }

  const evaluationProblems = observationProblems(lease.pre_evaluation, "pre_evaluation", lease.requested_tuple, lease);
  if (lease.pre_dispatch && lease.pre_evaluation) {
    if (lease.pre_dispatch.observation_id === lease.pre_evaluation.observation_id) {
      evaluationProblems.push("pre-evaluation readback reuses the pre-dispatch observation id");
    }
    if (lease.pre_dispatch.evidence.every((dispatchEvidence) => lease.pre_evaluation!.evidence.some((evaluationEvidence) => dispatchEvidence.sha256 === evaluationEvidence.sha256))) {
      evaluationProblems.push("pre-evaluation readback reuses pre-dispatch evidence digests");
    }
    if (Date.parse(lease.pre_evaluation.observed_at) <= Date.parse(lease.pre_dispatch.observed_at)) {
      evaluationProblems.push("pre-evaluation readback must be strictly later than pre-dispatch readback");
    }
    if (lease.pre_dispatch.harness_session_token !== lease.pre_evaluation.harness_session_token) {
      evaluationProblems.push("harness session changed between dispatch and evaluation");
    }
    if (lease.pre_dispatch.process_instance_token !== lease.pre_evaluation.process_instance_token) {
      evaluationProblems.push("process instance changed between dispatch and evaluation");
    }
  }
  if (evaluationProblems.length > 0) {
    const mismatch = evaluationProblems.some((reason) => reason.includes("does not match"));
    return {
      disposition: mismatch ? "MISMATCH" : "IDENTITY_UNBOUND",
      dispatch_allowed: true,
      contributes_quality_credit: false,
      reasons: evaluationProblems,
    };
  }
  return {
    disposition: "BOUND_FOR_EVALUATION",
    dispatch_allowed: true,
    contributes_quality_credit: true,
    reasons: [],
  };
}
