import { describe, expect, it } from "vitest";

import { sha256Bytes } from "./authority.js";
import {
  admitCapabilityEvaluatorExecution,
  executeCapabilityEvaluators,
  type CapabilityEvaluatorAdapter,
} from "./capability-evaluator-execution.js";
import type { RetainedEvaluationEvidence } from "./evaluation-recorder.js";
import { canonicalCapabilityEvaluators } from "../contracts/capability-evaluator-registry.js";
import type { CapabilityId } from "../contracts/primitives.js";

const capability = "root_cause_analysis" as CapabilityId;

function fixture(evaluator: ReturnType<typeof canonicalCapabilityEvaluators>[number], result: boolean): RetainedEvaluationEvidence {
  const bytes = new TextEncoder().encode(JSON.stringify({
    record_type: "mister-clean.capability-evaluator-case-fixture",
    schema_version: "1.0",
    evaluator_id: evaluator.evaluator_id,
    case_id: evaluator.case_id,
    evaluation_dimension: evaluator.evaluation_dimension,
    result,
  }));
  return { sha256: sha256Bytes(bytes), media_type: "application/json", bytes };
}

const fixtureAdapter: CapabilityEvaluatorAdapter = {
  adapter_id: "deterministic-fixture",
  adapter_version: "1.0",
  evaluator_actor_id: "independent-evaluator",
  execute_case: ({ evaluator, evidence }) => {
  const retained = evidence.find((candidate) => {
    try {
      const value = JSON.parse(new TextDecoder().decode(candidate.bytes)) as Record<string, unknown>;
      return value.record_type === "mister-clean.capability-evaluator-case-fixture"
        && value.evaluator_id === evaluator.evaluator_id
        && value.case_id === evaluator.case_id
        && value.evaluation_dimension === evaluator.evaluation_dimension;
    } catch {
      return false;
    }
  });
  if (retained === undefined) return null;
  const value = JSON.parse(new TextDecoder().decode(retained.bytes)) as { result?: unknown };
    return typeof value.result === "boolean" ? {
      evaluator_id: evaluator.evaluator_id,
      case_id: evaluator.case_id,
      adapter_id: "deterministic-fixture",
      adapter_version: "1.0",
      evaluator_actor_id: "independent-evaluator",
      result: value.result,
      evidence_sha256: retained.sha256,
    } : null;
  },
};

function request(overrides: Partial<Parameters<typeof executeCapabilityEvaluators>[0]> = {}) {
  const evaluators = canonicalCapabilityEvaluators(capability);
  return {
    capability_id: capability,
    worker_actor_id: "worker",
    author_actor_id: "author",
    retained_evidence: evaluators.map((evaluator) => fixture(evaluator, true)),
    adapter: fixtureAdapter,
    ...overrides,
  };
}

describe("capability evaluator execution", () => {
  it("executes all four canonical cases against retained evidence and admits their observations", () => {
    const calls: string[] = [];
    const execution = executeCapabilityEvaluators(request({
      adapter: {
        ...fixtureAdapter,
        execute_case: (input) => {
          calls.push(input.evaluator.evaluator_id);
          return fixtureAdapter.execute_case(input);
        },
      },
    }));

    expect(execution).toMatchObject({
      execution_status: "complete",
      canonical_case_count: 4,
      executed_case_count: 4,
      unexecuted_evaluator_ids: [],
      issues: [],
    });
    expect(calls).toHaveLength(4);
    expect(admitCapabilityEvaluatorExecution(execution)).toHaveLength(4);
    expect(execution.execution_receipts).toHaveLength(4);
    expect(new Set(execution.execution_receipts.map((item) => item.evaluator_version))).toEqual(new Set(["1.0"]));
    expect(new Set(execution.evaluations.map((item) => item.evaluator_actor_id))).toEqual(new Set(["independent-evaluator"]));
  });

  it("retains a measured negative result as executed while refusing no-result cases", () => {
    const evaluators = canonicalCapabilityEvaluators(capability);
    const retained = evaluators.map((evaluator, index) => fixture(evaluator, index !== 1));
    const execution = executeCapabilityEvaluators(request({ retained_evidence: retained }));

    expect(execution.execution_status).toBe("complete");
    expect(execution.evaluations.find((item) => item.evaluator_id === evaluators[1]!.evaluator_id)?.result).toBe(false);
    expect(admitCapabilityEvaluatorExecution(execution)).toHaveLength(4);
  });

  it("marks an unobserved case incomplete and blocks admission instead of manufacturing a pass", () => {
    const evaluators = canonicalCapabilityEvaluators(capability);
    const retained = evaluators.slice(0, 3).map((evaluator) => fixture(evaluator, true));
    const execution = executeCapabilityEvaluators(request({ retained_evidence: retained }));

    expect(execution.execution_status).toBe("incomplete");
    expect(execution.executed_case_count).toBe(3);
    expect(execution.unexecuted_evaluator_ids).toContain(evaluators[3]!.evaluator_id);
    expect(() => admitCapabilityEvaluatorExecution(execution)).toThrow(/incomplete/);
  });

  it("rejects a runner result whose evidence digest is not retained", () => {
    const execution = executeCapabilityEvaluators(request({
      adapter: {
        ...fixtureAdapter,
        execute_case: ({ evaluator }) => ({ evaluator_id: evaluator.evaluator_id, case_id: evaluator.case_id, adapter_id: fixtureAdapter.adapter_id, adapter_version: fixtureAdapter.adapter_version, evaluator_actor_id: fixtureAdapter.evaluator_actor_id, result: true, evidence_sha256: sha256Bytes(`unretained-${evaluator.evaluator_id}`) }),
      },
    }));

    expect(execution.execution_status).toBe("incomplete");
    expect(execution.executed_case_count).toBe(0);
    expect(execution.unexecuted_evaluator_ids).toHaveLength(4);
    expect(execution.issues).toHaveLength(4);
    expect(() => admitCapabilityEvaluatorExecution(execution)).toThrow(/incomplete/);
  });

  it("rejects evaluator/worker/author identity overlap before running cases", () => {
    expect(() => executeCapabilityEvaluators(request({ adapter: { ...fixtureAdapter, evaluator_actor_id: "worker" } }))).toThrow(/independent/);
    expect(() => executeCapabilityEvaluators(request({ author_actor_id: "worker" }))).toThrow(/distinct/);
  });

  it("fails closed on malformed, partial, thrown, and case-mismatched adapter outputs", () => {
    const evaluators = canonicalCapabilityEvaluators(capability);
    const execution = executeCapabilityEvaluators(request({
      adapter: {
        ...fixtureAdapter,
        execute_case: ({ evaluator }) => {
          if (evaluator.evaluator_id === evaluators[0]!.evaluator_id) return undefined as never;
          if (evaluator.evaluator_id === evaluators[1]!.evaluator_id) throw new Error("adapter interrupted");
          if (evaluator.evaluator_id === evaluators[2]!.evaluator_id) return { evaluator_id: evaluator.evaluator_id, case_id: "wrong-case", adapter_id: fixtureAdapter.adapter_id, adapter_version: fixtureAdapter.adapter_version, evaluator_actor_id: fixtureAdapter.evaluator_actor_id, result: true, evidence_sha256: sha256Bytes("wrong") };
          return fixtureAdapter.execute_case({ evaluator, evidence: [] });
        },
      },
    }));

    expect(execution.execution_status).toBe("incomplete");
    expect(execution.executed_case_count).toBe(0);
    expect(execution.unexecuted_evaluator_ids).toEqual(evaluators.map((item) => item.evaluator_id));
    expect(execution.issues).toHaveLength(4);
    expect(() => admitCapabilityEvaluatorExecution(execution)).toThrow(/incomplete/);
  });

  it("refuses a result whose claimed adapter identity does not match the executed adapter", () => {
    const execution = executeCapabilityEvaluators(request({
      adapter: {
        ...fixtureAdapter,
        execute_case: ({ evaluator }) => ({ evaluator_id: evaluator.evaluator_id, case_id: evaluator.case_id, adapter_id: "forged-adapter", adapter_version: fixtureAdapter.adapter_version, evaluator_actor_id: fixtureAdapter.evaluator_actor_id, result: true, evidence_sha256: sha256Bytes("unrelated") }),
      },
    }));

    expect(execution.execution_status).toBe("incomplete");
    expect(execution.execution_receipts).toHaveLength(0);
    expect(execution.issues).toHaveLength(4);
  });
});
