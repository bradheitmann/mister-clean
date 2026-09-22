import { Buffer } from "node:buffer";

import type { AgentIdentityAssurance, AgentIdentityLease, AgentIdentityObservation, AgentTuple } from "../contracts/agent-evaluation.js";
import type { Sha256 } from "../contracts/primitives.js";
import { canonicalJson, sha256Bytes } from "./authority.js";

export interface EvaluationIdentityReceiptBinding {
  readonly phase: "pre_dispatch" | "pre_evaluation";
  readonly run_event_id: string;
  readonly identity_lease: AgentIdentityLease;
  readonly invocation_ids: readonly string[];
}

export interface VerifiedEvaluationIdentityReceipt {
  readonly receipt_sha256: string;
  readonly observer_actor_id: string;
  readonly identity_assurance: AgentIdentityAssurance;
}

interface StoredBinding {
  readonly observer_actor_id: string;
  readonly receipt_sha256: string;
  readonly identity_assurance: AgentIdentityAssurance;
  /** Canonical immutable copy of every value the receipt authorizes. */
  readonly canonical_binding_json: string;
}

const verifiedReceiptTokens = new WeakMap<object, StoredBinding>();

function canonicalInvocationIds(ids: readonly string[]): readonly string[] {
  const sorted = [...ids].sort((left, right) => left.localeCompare(right));
  if (new Set(sorted).size !== sorted.length) throw new Error("identity receipt invocation IDs must be distinct");
  return sorted;
}

function bindingSnapshot(input: EvaluationIdentityReceiptBinding): Record<string, unknown> | null {
  const observation = input.phase === "pre_dispatch" ? input.identity_lease.pre_dispatch : input.identity_lease.pre_evaluation;
  if (observation === null) return null;
  return {
    phase: input.phase,
    run_event_id: input.run_event_id,
    identity_lease: {
      identity_lease_id: input.identity_lease.identity_lease_id,
      requested_tuple: input.identity_lease.requested_tuple,
      execution_route_id: input.identity_lease.execution_route_id,
      observation,
    },
    invocation_ids: canonicalInvocationIds(input.invocation_ids),
  };
}

function bindingFor(input: EvaluationIdentityReceiptBinding, receipt_sha256: string, observer_actor_id: string, identity_assurance: AgentIdentityAssurance): StoredBinding | null {
  const snapshot = bindingSnapshot(input);
  const observation = input.phase === "pre_dispatch" ? input.identity_lease.pre_dispatch : input.identity_lease.pre_evaluation;
  if (snapshot === null || observation === null || observation.observer_actor_id !== observer_actor_id) return null;
  return Object.freeze({ observer_actor_id, receipt_sha256, identity_assurance, canonical_binding_json: canonicalJson(snapshot) });
}

function receiptPayloadBindingSnapshot(input: EvaluationIdentityReceiptBinding): Record<string, unknown> | null {
  const snapshot = bindingSnapshot(input);
  const observation = input.phase === "pre_dispatch" ? input.identity_lease.pre_dispatch : input.identity_lease.pre_evaluation;
  if (snapshot === null || observation === null) return null;
  // A receipt cannot include its own digest in the bytes it hashes. Its exact
  // evidence reference is nevertheless retained in bindingSnapshot and checked
  // again when the opaque token is consumed.
  const { evidence: _selfReferentialReceiptEvidence, ...attestedObservation } = observation;
  return {
    ...snapshot,
    identity_lease: {
      identity_lease_id: input.identity_lease.identity_lease_id,
      requested_tuple: input.identity_lease.requested_tuple,
      execution_route_id: input.identity_lease.execution_route_id,
      observation: attestedObservation,
    },
  };
}

function receiptBytes(input: EvaluationIdentityReceiptBinding): Uint8Array | null {
  const snapshot = receiptPayloadBindingSnapshot(input);
  if (snapshot === null) return null;
  return Buffer.from(canonicalJson({
    schema_version: "1.0",
    record_type: "mister-clean.evaluation-identity-receipt",
    binding: snapshot,
  }), "utf8");
}

/** The token is opaque: callers cannot mint it, and the recorder compares the
 * full immutable binding before it uses its digest or actor. */
export function verifiedReceiptForBinding(value: unknown, input: EvaluationIdentityReceiptBinding): VerifiedEvaluationIdentityReceipt | null {
  if (typeof value !== "object" || value === null) return null;
  const stored = verifiedReceiptTokens.get(value);
  if (stored === undefined) return null;
  const expected = bindingFor(input, stored.receipt_sha256, stored.observer_actor_id, stored.identity_assurance);
  if (expected === null || expected.canonical_binding_json !== stored.canonical_binding_json) return null;
  return value as VerifiedEvaluationIdentityReceipt;
}

export interface EvaluationIdentityReceiptAuthority {
  readonly configured: boolean;
  authorize(input: EvaluationIdentityReceiptBinding & { readonly retained_evidence: readonly { readonly sha256: string; readonly bytes: Uint8Array }[] }): VerifiedEvaluationIdentityReceipt | null;
}

/** Startup-only source of live harness/provider state. A caller cannot provide
 * an observation through the IPC outcome; the adapter must read the supported
 * route state and return its timestamped, evidence-bound observation. */
export interface EvaluationIdentityObservationAdapter {
  readonly adapter_id: string;
  readonly adapter_version: string;
  readonly observer_actor_id: string;
  observe(input: {
    readonly phase: "pre_dispatch" | "pre_evaluation";
    readonly run_event_id: string;
    readonly requested_tuple: AgentTuple;
    readonly execution_route_id: string;
    readonly invocation_ids: readonly string[];
    readonly retained_evidence: readonly { readonly sha256: string; readonly bytes: Uint8Array }[];
  }): Promise<AgentIdentityObservation | null> | AgentIdentityObservation | null;
  /** A collector may return evidence that it captured itself. The intake
   * boundary retains this evidence before receipt verification; callers never
   * get to smuggle it in through the evaluation command. */
  capture?(input: Parameters<EvaluationIdentityObservationAdapter["observe"]>[0]): Promise<IdentityObservationCapture> | IdentityObservationCapture;
}

export interface IdentityObservationCapture {
  readonly observation: AgentIdentityObservation | null;
  /** Collector captures can establish this tier only. Provider attestation
   * requires a separate provider-owned authority. */
  readonly identity_assurance?: "active_harness_selection";
  readonly evidence: readonly {
    readonly sha256: Sha256;
    readonly media_type: string;
    readonly bytes: Uint8Array;
  }[];
}

/** Mint an opaque receipt only from a startup-configured collector capture.
 * The public transport never receives this function or its token. The capture
 * evidence digest is the receipt identity; `bindingFor` binds it to the exact
 * lease, phase, run, and invocation set before the recorder can use it. */
export function issueCapturedEvaluationIdentityReceipt(
  input: EvaluationIdentityReceiptBinding,
  adapter: EvaluationIdentityObservationAdapter,
  capture: IdentityObservationCapture | undefined,
): VerifiedEvaluationIdentityReceipt | null {
  if (capture?.identity_assurance !== "active_harness_selection" || capture.observation === null
    || capture.evidence.length !== 1 || capture.observation.evidence.length !== 1
    || capture.observation.observer_actor_id !== adapter.observer_actor_id) return null;
  const evidence = capture.evidence[0]!;
  if (evidence.sha256 !== sha256Bytes(evidence.bytes) || evidence.media_type.trim().length === 0
    || evidence.bytes.byteLength === 0 || capture.observation.evidence[0]!.sha256 !== evidence.sha256) return null;
  const binding = bindingFor(input, evidence.sha256, adapter.observer_actor_id, "active_harness_selection");
  if (binding === null) return null;
  const token = Object.freeze({ receipt_sha256: evidence.sha256, observer_actor_id: adapter.observer_actor_id, identity_assurance: "active_harness_selection" as const });
  verifiedReceiptTokens.set(token, binding);
  return token;
}

function assertObservedIdentity(observation: AgentIdentityObservation, input: Parameters<EvaluationIdentityObservationAdapter["observe"]>[0] & { readonly adapter_actor_id: string }): AgentIdentityObservation {
  if (observation.phase !== input.phase || observation.requested_agent_tuple_id !== input.requested_tuple.agent_tuple_id
    || observation.execution_route_id !== input.execution_route_id || observation.observer_actor_id !== input.adapter_actor_id
    || observation.intended_surface_label !== null || observation.worker_self_report !== null || observation.evidence.length === 0
    || observation.control_target === null || observation.harness_session_token.trim().length === 0
    || (observation.process_instance_token !== null && observation.process_instance_token.trim().length === 0)) {
    throw new Error("identity observation adapter returned an incomplete or caller-shaped observation");
  }
  if (observation.observed_model_id !== input.requested_tuple.model_id || observation.observed_harness_id !== input.requested_tuple.harness_id || observation.observed_reasoning_level !== input.requested_tuple.reasoning_level) {
    throw new Error("identity observation adapter observed a model, harness, or reasoning mismatch");
  }
  for (const evidence of observation.evidence) {
    const retained = input.retained_evidence.find((candidate) => candidate.sha256 === evidence.sha256);
    if (retained === undefined || sha256Bytes(retained.bytes) !== evidence.sha256) throw new Error("identity observation adapter evidence is not retained and digest-bound");
  }
  if (Date.parse(observation.observed_at) !== Date.parse(observation.observed_at)) throw new Error("identity observation adapter timestamp is invalid");
  return observation;
}

/** Adapter wrapper for a route-specific harness-state reader. The reader is
 * deliberately injected at startup and cannot consume a pane label or worker
 * self-report as proof. */
export class ConfiguredHarnessStateObservationAdapter implements EvaluationIdentityObservationAdapter {
  readonly configured = true;
  readonly #reader: EvaluationIdentityObservationAdapter["observe"];
  readonly adapter_id: string;
  readonly adapter_version: string;
  readonly observer_actor_id: string;
  constructor(input: { readonly adapter_id: string; readonly adapter_version: string; readonly observer_actor_id: string; readonly reader: EvaluationIdentityObservationAdapter["observe"] }) {
    if (input.adapter_id.trim().length === 0 || input.adapter_version.trim().length === 0 || input.observer_actor_id.trim().length === 0) throw new Error("identity observation adapter requires non-empty identity");
    this.adapter_id = input.adapter_id; this.adapter_version = input.adapter_version; this.observer_actor_id = input.observer_actor_id; this.#reader = input.reader;
  }
  async observe(input: Parameters<EvaluationIdentityObservationAdapter["observe"]>[0]): Promise<AgentIdentityObservation | null> {
    const observed = await this.#reader(input);
    return observed === null ? null : assertObservedIdentity(observed, { ...input, adapter_actor_id: this.observer_actor_id });
  }
}

export interface ConfiguredEvaluationIdentityReceipt {
  readonly receipt_sha256: string;
  readonly observer_actor_id: string;
  /** Startup-only classification. A client cannot elevate this field. */
  readonly identity_assurance: AgentIdentityAssurance;
}

export const denyEvaluationIdentityReceipt: EvaluationIdentityReceiptAuthority = Object.freeze({
  configured: false,
  authorize() { return null; },
});

/** Same-OS-user custody verifier. Startup configuration, rather than a
 * client payload, chooses the accepted receipt digests. */
export class ConfiguredEvaluationIdentityReceiptAuthority implements EvaluationIdentityReceiptAuthority {
  readonly configured = true;
  readonly #receipts: ReadonlyMap<string, { readonly observer_actor_id: string; readonly identity_assurance: AgentIdentityAssurance }>;
  constructor(receipts: readonly ConfiguredEvaluationIdentityReceipt[]) {
    if (receipts.length === 0 || new Set(receipts.map((receipt) => receipt.receipt_sha256)).size !== receipts.length) throw new Error("Trusted identity receipt authority requires distinct configured receipt digests");
    this.#receipts = new Map(receipts.map((receipt) => [receipt.receipt_sha256, { observer_actor_id: receipt.observer_actor_id, identity_assurance: receipt.identity_assurance }]));
  }
  authorize(input: Parameters<EvaluationIdentityReceiptAuthority["authorize"]>[0]) {
    const observation = input.phase === "pre_dispatch" ? input.identity_lease.pre_dispatch : input.identity_lease.pre_evaluation;
    if (observation === null || observation.evidence.length !== 1) return null;
    const receiptSha = observation.evidence[0]!.sha256;
    const evidence = input.retained_evidence.find((item) => item.sha256 === receiptSha);
    const configured = this.#receipts.get(receiptSha);
    if (evidence === undefined || sha256Bytes(evidence.bytes) !== receiptSha || configured === undefined || configured.observer_actor_id !== observation.observer_actor_id) return null;
    const expected = receiptBytes(input);
    if (expected === null || Buffer.compare(Buffer.from(evidence.bytes), expected) !== 0) return null;
    const token = Object.freeze({ receipt_sha256: receiptSha, observer_actor_id: configured.observer_actor_id, identity_assurance: configured.identity_assurance });
    const binding = bindingFor(input, receiptSha, configured.observer_actor_id, configured.identity_assurance);
    if (binding === null) return null;
    verifiedReceiptTokens.set(token, binding);
    return token;
  }
}
