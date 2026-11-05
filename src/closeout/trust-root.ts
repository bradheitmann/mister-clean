/**
 * The judge's trust root (master-gate S0).
 *
 * A CLEAN verdict may rest only on authority the closer cannot mint:
 * - the trust policy it verifies signatures against must match a SHA-256 pin
 *   the judge supplies from outside the bundle (`--trust-policy-sha256`, or
 *   `MISTER_CLEAN_TRUST_POLICY_SHA256`);
 * - independence is decided by the policy key that verified a signature, not
 *   by an identity string the signer declares;
 * - an accepted exception counts only under an Ed25519 signature, over the
 *   ruling's canonical bytes, by a key holding the owner or principal role.
 */
import { createHash, createPublicKey, verify } from "node:crypto";

import { canonicalJson, sha256Bytes } from "../canonical-json.js";

export const TRUST_POLICY_PIN_ENV = "MISTER_CLEAN_TRUST_POLICY_SHA256";
export const TRUST_POLICY_PIN_FLAG = "--trust-policy-sha256";
export const TRUST_POLICY_RECORD_TYPE = "mister-clean.semantic-trust-policy";

export type TrustPolicyRole = "domain_evaluator" | "independent_qa" | "owner" | "principal" | "runner";

export interface TrustPolicyKey {
  actor_id: string;
  key_id: string;
  public_key_pem: string;
  roles: TrustPolicyRole[];
  valid_from: string;
  /** Required: an open-ended key is refused. Optional here only because parsed input may omit it. */
  valid_to?: string;
}

export interface TrustPolicy {
  keys: TrustPolicyKey[];
  policy_id: string;
  record_type: typeof TRUST_POLICY_RECORD_TYPE;
  schema_version: "1.0";
}

const HEX64 = /^[0-9a-f]{64}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/u;
const EXCEPTION_SIGNER_ROLES: ReadonlySet<string> = new Set(["owner", "principal"]);

function record(value: unknown): Record<string, unknown> | undefined {
  return !!value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function validIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}

/** Judge pins from repeatable flags plus the environment; sorted and unique. A malformed pin is refused. */
export function trustPolicyPins(flags: readonly string[], environment: NodeJS.ProcessEnv): string[] {
  const pins = new Set<string>();
  for (const value of flags) {
    if (!HEX64.test(value)) throw new Error(`${TRUST_POLICY_PIN_FLAG} requires a lowercase SHA-256 hex digest`);
    pins.add(value);
  }
  for (const value of (environment[TRUST_POLICY_PIN_ENV] ?? "").split(/[\s,]+/u).filter(Boolean)) {
    if (!HEX64.test(value)) throw new Error(`${TRUST_POLICY_PIN_ENV} must hold lowercase SHA-256 hex digests separated by commas or whitespace`);
    pins.add(value);
  }
  return [...pins].sort();
}

/** The refusal for a bound trust-policy digest that matches no judge pin; undefined when it matches. */
export function trustPolicyPinError(boundSha256: string, pins: readonly string[]): string | undefined {
  if (pins.includes(boundSha256)) return undefined;
  return `trust policy sha256 ${boundSha256} matches no judge-supplied pin (pins: ${pins.length === 0 ? "none" : pins.join(", ")}); `
    + `the judge pins the trust root with ${TRUST_POLICY_PIN_FLAG} <hex> or ${TRUST_POLICY_PIN_ENV}, never from the bundle`;
}

/** Parse trust-policy bytes; undefined when they are not a schema 1.0 policy with a keys array. */
export function parseTrustPolicy(bytes: Uint8Array): TrustPolicy | undefined {
  try {
    const parsed = record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    if (parsed?.record_type !== TRUST_POLICY_RECORD_TYPE || parsed.schema_version !== "1.0" || !Array.isArray(parsed.keys)) return undefined;
    return parsed as unknown as TrustPolicy;
  } catch {
    return undefined;
  }
}

/** Key identity is the key material: SHA-256 over its Ed25519 SPKI DER. Undefined for an unparseable or non-Ed25519 key. */
export function trustKeyIdentity(key: Pick<TrustPolicyKey, "public_key_pem">): string | undefined {
  try {
    const parsed = createPublicKey(key.public_key_pem);
    if (parsed.asymmetricKeyType !== "ed25519") return undefined;
    return createHash("sha256").update(parsed.export({ format: "der", type: "spki" })).digest("hex");
  } catch {
    return undefined;
  }
}

/** Validity-window refusal for a key at a signing time; a key without valid_to is refused. */
export function trustKeyWindowError(key: TrustPolicyKey, at: string): string | undefined {
  if (key.valid_to === undefined) return "has no valid_to; an open-ended trust-policy key is refused";
  if (!validIsoTimestamp(key.valid_from) || !validIsoTimestamp(key.valid_to) || !validIsoTimestamp(at)
    || Date.parse(at) < Date.parse(key.valid_from) || Date.parse(at) > Date.parse(key.valid_to)) {
    return "is outside its validity window";
  }
  return undefined;
}

/**
 * Independence of a verifying key from the runner and supervisor. Every
 * policy entry that shares the verifying key's material is the same signer;
 * if any of them names an excluded actor or holds the runner role, the
 * signer is not independent, whatever actor_id the attestation declares.
 */
export function trustKeyIndependenceError(
  keys: readonly TrustPolicyKey[],
  verifyingKey: TrustPolicyKey,
  excludedActorIds: readonly (string | undefined)[],
): string | undefined {
  const identity = trustKeyIdentity(verifyingKey);
  const excluded = new Set(excludedActorIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    .map((id) => id.toLocaleLowerCase("und")));
  const sameSigner = keys.filter((key) => key === verifyingKey || (identity !== undefined && trustKeyIdentity(key) === identity));
  const bound = sameSigner.some((key) => excluded.has(String(key.actor_id).toLocaleLowerCase("und"))
    || (Array.isArray(key.roles) && key.roles.includes("runner")));
  return bound ? "the verifying key is bound to a runner or supervisor identity in the trust policy" : undefined;
}

/** The fields an exception ruling must bind exactly to its debt. */
const RULING_DEBT_BINDINGS = ["debt_key", "detector_finding_fingerprints", "observation_ids"] as const;

function sortedStrings(value: unknown): unknown {
  return Array.isArray(value) ? [...value].map(String).sort() : value;
}

/**
 * Why an accepted-exception ruling does not count toward CLEAN, or an empty
 * list when it carries a valid owner or principal signature. `policyBytes` are
 * the bytes of the ruling's `trust_policy_ref`, already digest-checked by the
 * caller; `pinUsed` is the pin they matched.
 */
export function exceptionSignatureErrors(input: {
  readonly ruling: Record<string, unknown> | undefined;
  readonly debt: Record<string, unknown>;
  readonly policyBytes: Uint8Array | undefined;
  readonly pins: readonly string[];
}): { readonly errors: string[]; readonly pinUsed?: string } {
  const { ruling, debt } = input;
  if (!ruling) return { errors: ["the operator ruling could not be loaded"] };
  const signature = record(ruling.signature);
  if (!signature) return { errors: ["unsigned: the operator ruling carries no owner or principal signature"] };
  const errors: string[] = [];
  if (signature.algorithm !== "Ed25519" || typeof signature.key_id !== "string" || typeof signature.signature_base64url !== "string") {
    errors.push("the ruling signature must be {algorithm: Ed25519, key_id, signature_base64url}");
  }
  for (const field of RULING_DEBT_BINDINGS) {
    if (canonicalJson(sortedStrings(ruling[field]) ?? null) !== canonicalJson(sortedStrings(debt[field] ?? (field === "debt_key" ? null : [])) ?? null)) {
      errors.push(`the signed ruling's ${field} differs from its debt's`);
    }
  }
  if (!input.policyBytes) {
    errors.push("the ruling names no loadable trust_policy_ref {path, sha256}");
    return { errors };
  }
  const policySha256 = sha256Bytes(input.policyBytes);
  const pinError = trustPolicyPinError(policySha256, input.pins);
  if (pinError) {
    errors.push(pinError);
    return { errors };
  }
  const policy = parseTrustPolicy(input.policyBytes);
  const key = policy?.keys.find((item) => item?.key_id === signature.key_id);
  if (!key) {
    errors.push("the signing key is not in the judge-pinned trust policy");
    return { errors, pinUsed: policySha256 };
  }
  if (!Array.isArray(key.roles) || !key.roles.some((role) => EXCEPTION_SIGNER_ROLES.has(role))) {
    errors.push("the signing key holds no owner or principal role in the trust policy");
  }
  if (key.actor_id !== ruling.actor) errors.push("the ruling actor is not the signing key's actor");
  const windowError = trustKeyWindowError(key, String(ruling.at ?? ""));
  if (windowError) errors.push(`the signing key ${windowError}`);
  if (trustKeyIdentity(key) === undefined) errors.push("the signing key is not an Ed25519 public key");
  else if (typeof signature.signature_base64url === "string") {
    const { signature: _signature, ...unsigned } = ruling;
    let valid = false;
    try {
      valid = verify(null, Buffer.from(canonicalJson(unsigned)), key.public_key_pem, Buffer.from(signature.signature_base64url, "base64url"));
    } catch {
      valid = false;
    }
    if (!valid) errors.push("the ruling signature does not verify over its canonical bytes");
  }
  return { errors, pinUsed: policySha256 };
}

/** The VALIDATE receipt verdict: CLEAN only when a live validation of a CLEAN report passed. */
export function validateReceiptVerdict(input: { readonly ok: boolean; readonly live: boolean; readonly reportVerdict: unknown }): "CLEAN" | "NOT_CLEAN" {
  return input.ok && input.live && input.reportVerdict === "CLEAN" ? "CLEAN" : "NOT_CLEAN";
}
