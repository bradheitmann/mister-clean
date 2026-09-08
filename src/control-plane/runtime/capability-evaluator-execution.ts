import {
  CAPABILITY_EVALUATOR_REGISTRY_VERSION,
  canonicalCapabilityEvaluators,
  type CanonicalCapabilityEvaluator,
} from "../contracts/capability-evaluator-registry.js";
import type { CapabilityEvaluationOutcome, RetainedEvaluationEvidence } from "./evaluation-recorder.js";
import { sha256Bytes } from "./authority.js";
import type { CapabilityEvaluatorId, CapabilityId, Sha256 } from "../contracts/primitives.js";

/**
 * A configured evaluator adapter performs the case operation. The public
 * intake must install this adapter at startup; a worker never supplies a
 * completed evaluator outcome. This module implements deterministic evidence
 * checks only, not an inference runner.
 */
export interface CapabilityEvaluatorAdapter {
  readonly adapter_id: string;
  readonly adapter_version: string;
  /** Actor operating this adapter, distinct from worker and author. */
  readonly evaluator_actor_id: string;
  execute_case(input: {
  readonly evaluator: CanonicalCapabilityEvaluator;
  readonly evidence: readonly RetainedEvaluationEvidence[];
  }): CapabilityEvaluatorCaseResult | null;
}

export interface CapabilityEvaluatorCaseResult {
  readonly evaluator_id: CapabilityEvaluatorId;
  readonly case_id: string;
  readonly adapter_id: string;
  readonly adapter_version: string;
  readonly evaluator_actor_id: string;
  readonly result: boolean;
  readonly evidence_sha256: Sha256;
}

export interface CapabilityEvaluatorExecutionRequest {
  readonly capability_id: CapabilityId;
  readonly worker_actor_id: string;
  readonly author_actor_id: string;
  readonly retained_evidence: readonly RetainedEvaluationEvidence[];
  readonly adapter: CapabilityEvaluatorAdapter;
}

export interface CapabilityEvaluatorExecutionResult {
  readonly capability_id: CapabilityId;
  readonly execution_status: "complete" | "incomplete";
  readonly canonical_case_count: number;
  readonly executed_case_count: number;
  /** Valid observations only; never contains a fabricated result. */
  readonly evaluations: readonly CapabilityEvaluationOutcome[];
  /** Immutable execution facts for audit/handoff; distinct from worker output. */
  readonly execution_receipts: readonly CapabilityEvaluatorExecutionReceipt[];
  readonly unexecuted_evaluator_ids: readonly string[];
  readonly issues: readonly string[];
}

export interface CapabilityEvaluatorExecutionReceipt {
  readonly evaluator_id: CapabilityEvaluatorId;
  readonly evaluator_version: typeof CAPABILITY_EVALUATOR_REGISTRY_VERSION;
  readonly adapter_id: string;
  readonly adapter_version: string;
  readonly case_id: string;
  readonly evaluation_dimension: CanonicalCapabilityEvaluator["evaluation_dimension"];
  readonly evaluator_actor_id: string;
  readonly result: boolean;
  readonly evidence_sha256: Sha256;
}

function requireActor(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be non-empty`);
}

function validSha256(value: string): value is Sha256 {
  return /^[0-9a-f]{64}$/u.test(value);
}

function isCaseResult(value: unknown): value is CapabilityEvaluatorCaseResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return typeof result.evaluator_id === "string"
    && typeof result.case_id === "string"
    && typeof result.adapter_id === "string"
    && typeof result.adapter_version === "string"
    && typeof result.evaluator_actor_id === "string"
    && typeof result.result === "boolean"
    && typeof result.evidence_sha256 === "string";
}

/**
 * Execute all four canonical cases for one capability. The function is
 * deliberately conservative: unknown, thrown, mismatched, or ungrounded
 * cases remain unexecuted and make admission incomplete.
 */
export function executeCapabilityEvaluators(request: CapabilityEvaluatorExecutionRequest): CapabilityEvaluatorExecutionResult {
  requireActor(request.worker_actor_id, "worker_actor_id");
  requireActor(request.author_actor_id, "author_actor_id");
  requireActor(request.adapter.adapter_id, "adapter.adapter_id");
  requireActor(request.adapter.adapter_version, "adapter.adapter_version");
  requireActor(request.adapter.evaluator_actor_id, "adapter.evaluator_actor_id");
  if (request.worker_actor_id === request.author_actor_id) throw new Error("worker and author actors must be distinct");
  if (request.adapter.evaluator_actor_id === request.worker_actor_id || request.adapter.evaluator_actor_id === request.author_actor_id) {
    throw new Error("evaluator actor must be independent from worker and author actors");
  }
  if (request.retained_evidence.length === 0) throw new Error("capability evaluator execution requires retained evidence");

  const issues: string[] = [];
  const evidenceByDigest = new Map<string, RetainedEvaluationEvidence>();
  for (const evidence of request.retained_evidence) {
    if (!validSha256(evidence.sha256)) {
      issues.push(`retained evidence has a non-canonical SHA-256: ${String(evidence.sha256)}`);
      continue;
    }
    if (!(evidence.bytes instanceof Uint8Array)) {
      issues.push(`retained evidence bytes are not a Uint8Array: ${evidence.sha256}`);
      continue;
    }
    const actual = sha256Bytes(evidence.bytes);
    if (actual !== evidence.sha256) {
      issues.push(`retained evidence digest mismatch: ${evidence.sha256}`);
      continue;
    }
    evidenceByDigest.set(evidence.sha256, evidence);
  }

  const canonical = canonicalCapabilityEvaluators(request.capability_id);
  const evaluations: CapabilityEvaluationOutcome[] = [];
  const executionReceipts: CapabilityEvaluatorExecutionReceipt[] = [];
  const unexecuted: string[] = [];
  for (const evaluator of canonical) {
    let observed: CapabilityEvaluatorCaseResult | null | unknown;
    try {
      observed = request.adapter.execute_case({ evaluator, evidence: [...evidenceByDigest.values()] });
    } catch (error) {
      unexecuted.push(evaluator.evaluator_id);
      issues.push(`${evaluator.evaluator_id} adapter execution failed: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (observed === null) {
      unexecuted.push(evaluator.evaluator_id);
      issues.push(`${evaluator.evaluator_id} has no observed result`);
      continue;
    }
    if (!isCaseResult(observed)
      || observed.evaluator_id !== evaluator.evaluator_id
      || observed.case_id !== evaluator.case_id
      || observed.adapter_id !== request.adapter.adapter_id
      || observed.adapter_version !== request.adapter.adapter_version
      || observed.evaluator_actor_id !== request.adapter.evaluator_actor_id
      || !validSha256(observed.evidence_sha256)
      || !evidenceByDigest.has(observed.evidence_sha256)) {
      unexecuted.push(evaluator.evaluator_id);
      issues.push(`${evaluator.evaluator_id} result is malformed, mismatched, or not grounded in retained evidence`);
      continue;
    }
    evaluations.push({
      evaluator_id: evaluator.evaluator_id,
      case_id: evaluator.case_id,
      result: observed.result,
      evaluator_actor_id: request.adapter.evaluator_actor_id,
      evidence_sha256: observed.evidence_sha256,
    });
    executionReceipts.push({
      evaluator_id: evaluator.evaluator_id,
      evaluator_version: evaluator.evaluator_version,
      adapter_id: request.adapter.adapter_id,
      adapter_version: request.adapter.adapter_version,
      case_id: evaluator.case_id,
      evaluation_dimension: evaluator.evaluation_dimension,
      evaluator_actor_id: request.adapter.evaluator_actor_id,
      result: observed.result,
      evidence_sha256: observed.evidence_sha256,
    });
  }

  return {
    capability_id: request.capability_id,
    execution_status: unexecuted.length === 0 && issues.length === 0 ? "complete" : "incomplete",
    canonical_case_count: canonical.length,
    executed_case_count: evaluations.length,
    evaluations,
    execution_receipts: executionReceipts,
    unexecuted_evaluator_ids: unexecuted,
    issues,
  };
}

/**
 * Admission bridge for the existing recorder contract. A complete execution
 * still admits false results; quality credit remains the recorder's separate
 * identity/evidence/authority decision.
 */
export function admitCapabilityEvaluatorExecution(result: CapabilityEvaluatorExecutionResult): readonly CapabilityEvaluationOutcome[] {
  if (result.execution_status !== "complete" || result.executed_case_count !== result.canonical_case_count) {
    throw new Error(`capability evaluator execution is incomplete; unexecuted=${result.unexecuted_evaluator_ids.length}`);
  }
  return result.evaluations;
}
