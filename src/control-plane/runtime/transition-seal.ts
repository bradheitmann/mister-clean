import type {
  ControlSurfaceId,
  ReceiptId,
  RunId,
} from "../contracts/primitives.js";
import type { DirectiveEvent, DirectiveState } from "../contracts/wave-directive.js";
import { canonicalJson, sha256Bytes } from "./authority.js";

export interface DirectiveAppendPayload {
  readonly run_id: RunId;
  readonly event: DirectiveEvent;
  readonly expected_state: DirectiveState | null;
  readonly control_surface_id: ControlSurfaceId | null;
  readonly receipt_ids: readonly ReceiptId[];
  readonly require_current_manifest: boolean;
}

declare const transitionSealBrand: unique symbol;

/**
 * Runtime capability issued only after ControlPlaneService has completed the
 * state-specific authority checks for this exact append payload.
 */
interface TransitionSeal {
  readonly [transitionSealBrand]: true;
}

export interface AuthorizedDirectiveAppendRequest extends DirectiveAppendPayload {
  readonly transition_seal: TransitionSeal;
}

const issuedSeals = new WeakMap<object, string>();

function payloadDigest(payload: DirectiveAppendPayload): string {
  return sha256Bytes(canonicalJson({
    run_id: payload.run_id,
    event: {
      directive_id: payload.event.directive_id,
      manifest_id: payload.event.manifest_id,
      manifest_revision: payload.event.manifest_revision,
      manifest_sha256: payload.event.manifest_sha256,
      from_state: payload.event.from_state,
      to_state: payload.event.to_state,
      occurred_at: payload.event.occurred_at,
      control_surface: payload.event.control_surface,
      evidence: payload.event.evidence.map((entry) => ({
        path: entry.path,
        sha256: entry.sha256,
        record_type: entry.record_type ?? null,
      })),
    },
    expected_state: payload.expected_state,
    control_surface_id: payload.control_surface_id,
    receipt_ids: payload.receipt_ids,
    require_current_manifest: payload.require_current_manifest,
  }));
}

/** Internal authority constructor. This module is intentionally not exported. */
export function sealDirectiveAppend(payload: DirectiveAppendPayload): AuthorizedDirectiveAppendRequest {
  const seal = Object.freeze(Object.create(null)) as TransitionSeal;
  issuedSeals.set(seal, payloadDigest(payload));
  return { ...payload, transition_seal: seal };
}

/** Reject forged, replayed-with-mutation, or caller-manufactured append requests. */
export function assertDirectiveAppendSealed(request: AuthorizedDirectiveAppendRequest): void {
  const expected = issuedSeals.get(request.transition_seal);
  if (expected === undefined || expected !== payloadDigest(request)) {
    throw new Error("Directive append lacks a valid state-authority seal");
  }
}
