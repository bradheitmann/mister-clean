/** SHA-256 digests of bytes and of canonical JSON. Node-only: imports node:crypto. */
import { createHash } from "node:crypto";

import { canonicalJson, type CanonicalJsonOptions } from "./canonical-json.js";
import type { Sha256 } from "./control-plane/contracts/primitives.js";

export function sha256Bytes(value: string | Uint8Array): Sha256 {
  return createHash("sha256").update(value).digest("hex") as Sha256;
}

/** SHA-256 hex of the canonical JSON of `value`. */
export function canonicalSha256(value: unknown, options: CanonicalJsonOptions = {}): Sha256 {
  return sha256Bytes(canonicalJson(value, options));
}
