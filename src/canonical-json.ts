import { createHash } from "node:crypto";

import type { Sha256 } from "./control-plane/contracts/primitives.js";

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** RFC-8785-compatible canonical JSON for Mister Clean's JSON record domain. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON cannot encode a non-finite number");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (typeof value !== "object") throw new Error("Canonical JSON encountered a non-JSON value");
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record).sort(compareCodeUnits).map((key) => {
    if (record[key] === undefined) throw new Error("Canonical JSON cannot encode undefined");
    return `${JSON.stringify(key)}:${canonicalJson(record[key])}`;
  });
  return `{${entries.join(",")}}`;
}

export function sha256Bytes(value: string | Uint8Array): Sha256 {
  return createHash("sha256").update(value).digest("hex") as Sha256;
}
