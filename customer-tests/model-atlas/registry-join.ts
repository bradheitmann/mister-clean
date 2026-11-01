/**
 * Customer test (customer-test/1): what this repository needs from the
 * model-facts registry's published export.
 *
 * Field-evaluation records cite registry records by reference, as
 * `<record id>@<export version>`, and agent cards are keyed by harness, model
 * and reasoning level. So this repository needs, from each export:
 * - the export schema it was written against, and a non-empty export version;
 * - record ids that are unique and safe to embed in a `<id>@<version>` ref;
 * - every card's reasoning levels as a well-formed fact (kind, source and
 *   last_verified, plus either a non-empty list of level names or an explicit
 *   `unknown`), so an agent card can bind a level or record that it cannot.
 *
 * Usage: bun customer-tests/model-atlas/registry-join.ts <export.json> [<sha256>]
 * The sha256 is checked only when given: the runner passes it for the pinned
 * artifact and omits it for the artifact published from the focus repository's
 * current main, so the semantic checks below decide that run (and the mutant).
 * Exit 0 when every requirement holds, 1 otherwise (each failure printed).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const EXPECTED_SCHEMA = "model-atlas.export/1";
const RECORD_ID = /^[a-z0-9][a-z0-9.-]*$/u;
const RECORD_KINDS: ReadonlySet<string> = new Set(["card", "provider"]);

type Json = null | boolean | number | string | Json[] | { readonly [key: string]: Json };

function isObject(value: Json | undefined): value is { readonly [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A registry fact: provenance, plus exactly one of a value or a stated unknown. */
function factProblem(fact: Json | undefined, isValue: (value: Json) => boolean): string | undefined {
  if (!isObject(fact)) return "is not a fact object";
  for (const key of ["kind", "source", "last_verified"] as const) {
    const field = fact[key];
    if (typeof field !== "string" || field.length === 0) return `fact is missing ${key}`;
  }
  const hasValue = "value" in fact;
  const hasUnknown = "unknown" in fact;
  if (hasValue === hasUnknown) return "fact must carry exactly one of value or unknown";
  if (hasUnknown) {
    const unknown = fact.unknown;
    return typeof unknown === "string" && unknown.length > 0 ? undefined : "unknown must state why";
  }
  return isValue(fact.value as Json) ? undefined : "value has the wrong shape";
}

function isLevelList(value: Json): boolean {
  return Array.isArray(value) && value.length > 0 && value.every((level) => typeof level === "string" && level.length > 0);
}

/** The ref form field-evaluation records use, and its inverse. */
export function registryRef(id: string, version: string): string {
  return `${id}@${version}`;
}

export function parseRegistryRef(ref: string): { readonly id: string; readonly version: string } | undefined {
  const at = ref.lastIndexOf("@");
  if (at <= 0 || at === ref.length - 1) return undefined;
  return { id: ref.slice(0, at), version: ref.slice(at + 1) };
}

export function checkExport(bytes: Uint8Array, expectedSha256: string | undefined): readonly string[] {
  const failures: string[] = [];
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (expectedSha256 !== undefined && actual !== expectedSha256) failures.push(`pinned sha256 mismatch: expected ${expectedSha256}, got ${actual}`);

  let parsed: Json;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Json;
  } catch {
    return [...failures, "export is not valid JSON"];
  }
  if (!isObject(parsed)) return [...failures, "export is not a JSON object"];

  if (parsed.schema !== EXPECTED_SCHEMA) failures.push(`schema is ${JSON.stringify(parsed.schema)}, expected ${EXPECTED_SCHEMA}`);
  const version = parsed.export_version;
  if (typeof version !== "string" || version.length === 0 || version.includes("@")) {
    failures.push("export_version must be a non-empty string without '@'");
  }

  const records = parsed.records;
  if (!Array.isArray(records) || records.length === 0) return [...failures, "records must be a non-empty array"];

  const seen = new Set<string>();
  let cards = 0;
  for (const [index, record] of records.entries()) {
    if (!isObject(record)) {
      failures.push(`records[${index}] is not an object`);
      continue;
    }
    const { id, kind } = record;
    if (typeof id !== "string" || !RECORD_ID.test(id)) {
      failures.push(`records[${index}].id ${JSON.stringify(id)} is not a ref-safe id`);
      continue;
    }
    if (seen.has(id)) failures.push(`duplicate record id ${id}`);
    seen.add(id);
    if (typeof kind !== "string" || !RECORD_KINDS.has(kind)) failures.push(`${id}: kind ${JSON.stringify(kind)} is not card or provider`);
    if (typeof version === "string") {
      const round = parseRegistryRef(registryRef(id, version));
      if (round?.id !== id || round.version !== version) failures.push(`${id}: ref does not round-trip`);
    }
    if (kind === "card") {
      cards += 1;
      const problem = factProblem(record.reasoning_levels, isLevelList);
      if (problem) failures.push(`${id}: reasoning_levels ${problem}`);
    }
  }
  if (cards === 0) failures.push("export contains no card records");
  return failures;
}

if (import.meta.main) {
  const [path, sha256] = process.argv.slice(2);
  if (!path) {
    console.error("usage: registry-join.ts <export.json> [<sha256>]");
    process.exit(2);
  }
  const failures = checkExport(readFileSync(path), sha256);
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.log(failures.length === 0 ? "PASS registry-join" : `FAIL registry-join (${failures.length})`);
  process.exit(failures.length === 0 ? 0 : 1);
}
