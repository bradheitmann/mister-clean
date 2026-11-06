// Verbatim copies of the base canonical-JSON encoders and timestamp validators
// (mg-s2a-codecs). Each closure holds the base lines unchanged, so the text check
// in charter/DONE/mg-s2a-codecs.md can diff them against `git show <base>:<path>`.
// Exported base functions differ only by the removed leading `export`.
// The zod sites are copied as their regex line plus the refine as a plain predicate.
// Never import this file from non-test code.
import { createHash } from "node:crypto";


// oracle: 4240c0e src/canonical-json.ts:5-7,10-24 (export removed at :10)
export const oracle_canonical_json = (() => {
function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value: unknown): string {
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
  return { canonicalJson };
})();

// oracle: 4240c0e src/closeout/native-gates.ts:489-505,507-517 (export removed at :507,:511,:515)
export const oracle_native_gates = (() => {
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON refuses a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${fields.join(",")}}`;
  }
  throw new Error(`canonical JSON refuses ${typeof value}`);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function identity(value: unknown): string {
  return sha256(canonicalJson(value));
}

function stableEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}
  return { canonicalJson, identity, stableEqual };
})();

// oracle: 4240c0e src/closeout/regression-accounting.ts:203-286
export const oracle_regression_accounting = (() => {
function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Unicode scalar-value order is identical to lexicographic UTF-8 order. */
function compareCanonicalText(left: string, right: string): number {
  const leftIterator = left[Symbol.iterator]();
  const rightIterator = right[Symbol.iterator]();
  for (;;) {
    const leftNext = leftIterator.next();
    const rightNext = rightIterator.next();
    if (leftNext.done || rightNext.done) {
      if (leftNext.done === rightNext.done) return 0;
      return leftNext.done ? -1 : 1;
    }
    const leftPoint = leftNext.value.codePointAt(0)!;
    const rightPoint = rightNext.value.codePointAt(0)!;
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
  }
}

function assertWellFormedUnicode(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error(`${path}: canonical UTF-8 text cannot contain an unpaired surrogate`);
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error(`${path}: canonical UTF-8 text cannot contain an unpaired surrogate`);
    }
  }
}

function canonicalJson(value: unknown, path = "$", active = new Set<object>()): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    assertWellFormedUnicode(value, path);
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path}: canonical JSON requires a finite number`);
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value !== "object") {
    throw new Error(`${path}: value is not canonical JSON`);
  }
  if (active.has(value)) throw new Error(`${path}: canonical JSON cannot contain a cycle`);
  active.add(value);
  try {
    if (Array.isArray(value)) {
      const encoded: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) throw new Error(`${path}[${index}]: canonical JSON cannot contain an array hole`);
        encoded.push(canonicalJson(value[index], `${path}[${index}]`, active));
      }
      return `[${encoded.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path}: canonical JSON requires a plain object`);
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key === "symbol")) {
      throw new Error(`${path}: canonical JSON cannot contain symbol keys`);
    }
    const keys = (ownKeys as string[]).sort(compareCanonicalText);
    const encoded = keys.map((key) => {
      assertWellFormedUnicode(key, `${path} object key`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new Error(`${path}.${key}: canonical JSON requires enumerable data properties`);
      }
      return `${JSON.stringify(key)}:${canonicalJson(descriptor.value, `${path}.${key}`, active)}`;
    });
    return `{${encoded.join(",")}}`;
  } finally {
    active.delete(value);
  }
}
  return { canonicalJson: (value: unknown): string => canonicalJson(value) };
})();

// oracle: 4240c0e src/closeout/accepted-release.ts:40,71-76
export const oracle_accepted_release = (() => {
type Json = Record<string, unknown>;
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Json;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}
  return { canonical };
})();

// oracle: 4240c0e src/closeout/action-lifecycle-runtime.ts:22,58-69 (export removed at :22,:58,:67)
export const oracle_action_lifecycle_runtime = (() => {
type JsonObject = Record<string, unknown>;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as JsonObject;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function equal(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}
  return { canonical, equal };
})();

// oracle: 4240c0e src/closeout/action-hygiene.ts:222-243,307-309
export const oracle_action_hygiene = (() => {
function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical action-hygiene evidence refuses non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => compare(left, right));
    if (entries.some(([, item]) => item === undefined)) throw new Error("canonical action-hygiene evidence refuses undefined fields");
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  throw new Error(`canonical action-hygiene evidence refuses ${typeof value}`);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function identity(value: unknown): string {
  return sha256(canonical(value));
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
  return { canonical, identity };
})();

// oracle: 4240c0e src/control-plane/contracts/snapshot.ts:454-458
export const oracle_snapshot = (() => {
function canonicalJsonForSnapshot(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return JSON.stringify(value);
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJsonForSnapshot(object[key])}`).join(",")}}`;
}
  return { canonicalJsonForSnapshot };
})();

// oracle: 4240c0e src/closeout/records.ts:113-136 (export removed at :113,:117)
export const oracle_records = (() => {
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isoTimestamp(value: unknown): boolean {
  if (!nonempty(value)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:?\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const zone = match[7] ?? "";
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return false;
  if (zone !== "Z") {
    const offset = zone.slice(1).replace(":", "");
    if (Number(offset.slice(0, 2)) > 23 || Number(offset.slice(2)) > 59) return false;
  }
  return !Number.isNaN(Date.parse(value));
}
  return { isoTimestamp };
})();

// oracle: 4240c0e src/closeout/semantic.ts:242-246
export const oracle_semantic = (() => {
function isoTimestamp(value: unknown): boolean {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}
  return { isoTimestamp };
})();

// oracle: 4240c0e src/closeout/semantic-v2.ts:224,248-250
export const oracle_semantic_v2 = (() => {
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/u;
function validIsoTimestamp(value: string): boolean {
  return ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}
  return { validIsoTimestamp };
})();

// oracle: 4240c0e src/closeout/trust-root.ts:41,48-50
export const oracle_trust_root = (() => {
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/u;
function validIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}
  return { validIsoTimestamp };
})();

// oracle: 4240c0e src/control-plane/runtime/authority.ts:10 (zod refine at :16 as a predicate)
export const oracle_authority = (() => {
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  const isoTimestamp = (value: unknown): boolean => typeof value === "string" && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
  return { isoTimestamp };
})();

// oracle: 4240c0e src/control-plane/contracts/import-provenance.ts:14 (zod refine at :21 as a predicate)
export const oracle_import_provenance = (() => {
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
  const isoTimestamp = (value: unknown): boolean => typeof value === "string" && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
  return { isoTimestamp };
})();

// oracle: 4240c0e src/control-plane/runtime/evidence.ts:25 (zod regex, no refine, as a predicate)
export const oracle_evidence = (() => {
  const isoTimestamp = (value: unknown): boolean => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value);
  return { isoTimestamp };
})();

// oracle: 4240c0e src/control-plane/runtime/campaign-observation-intake.ts:16 (the test at :80 as a predicate)
export const oracle_campaign_observation_intake = (() => {
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u;
  const validTimestamp = (timestamp: string): boolean => ISO_TIMESTAMP.test(timestamp) && Number.isFinite(Date.parse(timestamp));
  return { validTimestamp };
})();

// oracle: 4240c0e src/closeout/native-gate-validation.ts:103-107 (export removed at :103)
export const oracle_native_gate_validation = (() => {
function validClock(value: string): number | undefined {
  if (typeof value !== "string") return undefined;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value ? milliseconds : undefined;
}
  return { validClock };
})();

// oracle: 4240c0e src/run-receipt.ts:160-164
export const oracle_run_receipt = (() => {
function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
  return { canonicalTimestamp };
})();

// oracle: 4240c0e src/mister-clean-invocation-journal.ts:126-129
export const oracle_invocation_journal = (() => {
function canonicalTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
  return { canonicalTimestamp };
})();

// oracle: 4240c0e src/closeout/prepare.ts:109-111
export const oracle_prepare = (() => {
function isoTimestamp(date: Date): string {
  return date.toISOString();
}
  return { isoTimestamp };
})();

// oracle: 4240c0e src/closeout/execution-lease.ts:195-199
export const oracle_execution_lease = (() => {
function canonicalTimestamp(value: Date, label: string): string {
  const milliseconds = value.getTime();
  if (!Number.isFinite(milliseconds)) throw new Error(`${label} returned an invalid date`);
  return value.toISOString();
}
  return { canonicalTimestamp };
})();

// ---------------------------------------------------------------------------
// Corpora (DONE proofs 1 and 3). Deterministic: the same seed yields the same values.

/** mulberry32: a small seeded PRNG, so the JSON corpus is identical on every run and engine. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const JSON_CORPUS_SEED = 0x5a2a_c0de;
export const JSON_CORPUS_SIZE = 10_000;

/** Strings: ASCII, BMP (including U+E000-U+FFFF), astral, and escape-needing. Never a lone surrogate. */
export const CORPUS_STRINGS: readonly string[] = [
  "", "a", "B", "b", "A", "Z", "_", "-", "0", "1", "9", "10", "01", "-1", "1.5", "__proto__", "constructor",
  "key", "Key", "aa", "ab", "a b", " a", "a ",
  "\u00e9", "\u00df", "\u4e2d\u6587", "\u00ff", "\u0100", "\u07ff", "\u0800", "\ud7ff", "\ue000", "\uf8ff", "\ufeff", "\ufffd", "\uffff",
  "\u{10000}", "\u{1f600}", "\ud83d\ude00", "a\u{1f600}", "\u{10ffff}", "\u{1d11e}x", "\uffffa", "\u{10000}a",
  "\"", "\\", "/", "\n", "\r", "\t", "\b", "\f", "\u0000", "\u001f", "\u007f", "\u2028", "\u2029", "</script>", "a\"b\\c",
];

/** Keys: a smaller pool so objects collide on order-sensitive neighbours ("B"/"a", "10"/"9", U+FFFF/U+10000). */
export const CORPUS_KEYS: readonly string[] = [
  "a", "B", "b", "A", "", "_", "10", "9", "1", "01", "__proto__", "\u00e9", "\ue000", "\uffff", "\u{10000}", "\u{1f600}", "\"", "\n", "a b", "key",
];

export const CORPUS_NUMBERS: readonly number[] = [
  0, -0, 1, -1, 2, 10, 255, 1_000_000, -123456789, 2 ** 31, 2 ** 53 - 1, -(2 ** 53 - 1), 2 ** 53, 2 ** 64,
  0.1, 0.5, -0.25, 1.5, 3.141592653589793, 1 / 3, 1e-6, 1e-7, -1e-7, 5e-324, 1e20, 1e21, -1e21, 1.7976931348623157e308,
  123e-20, 0.000001, 1e300,
];

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
}

function jsonValue(random: () => number, depth: number): unknown {
  const roll = random();
  if (depth <= 0 || roll < 0.45) {
    const scalar = random();
    if (scalar < 0.1) return null;
    if (scalar < 0.2) return random() < 0.5;
    if (scalar < 0.45) return pick(random, CORPUS_NUMBERS);
    if (scalar < 0.55) return Math.floor(random() * 2_000_001) - 1_000_000;
    if (scalar < 0.6) return (random() - 0.5) * 10 ** Math.floor(random() * 30 - 10);
    if (scalar < 0.85) return pick(random, CORPUS_STRINGS);
    return pick(random, CORPUS_STRINGS) + pick(random, CORPUS_STRINGS);
  }
  if (roll < 0.7) {
    const length = Math.floor(random() * 5);
    return Array.from({ length }, () => jsonValue(random, depth - 1));
  }
  const size = Math.floor(random() * 6);
  const entries: [string, unknown][] = [];
  for (let index = 0; index < size; index += 1) {
    const key = random() < 0.8 ? pick(random, CORPUS_KEYS) : pick(random, CORPUS_STRINGS);
    entries.push([key, jsonValue(random, depth - 1)]);
  }
  // Object.fromEntries defines own data properties, so "__proto__" stays an ordinary key.
  return Object.fromEntries(entries);
}

/** The seeded plain-JSON corpus: nested objects and arrays, ASCII/BMP/astral/escape strings, -0, 1e21, -1e-7. */
export function jsonCorpus(size = JSON_CORPUS_SIZE, seed = JSON_CORPUS_SEED): unknown[] {
  const random = mulberry32(seed);
  const values: unknown[] = [];
  for (let index = 0; index < size; index += 1) values.push(jsonValue(random, 1 + Math.floor(random() * 4)));
  return values;
}

/** The DONE proof 3 field variants. */
export const TIMESTAMP_FIELDS = {
  year: ["0000", "0001", "1970", "2024", "2026", "9999"],
  month: ["00", "01", "02", "04", "12", "13"],
  day: ["00", "01", "28", "29", "30", "31", "32"],
  hour: ["00", "23", "24"],
  minute: ["00", "59", "60"],
  second: ["00", "59", "60"],
  separator: ["T", "t", " "],
  fraction: ["", ".1", ".123", ".123456789", ".1234567890"],
  zone: ["Z", "z", "+00:00", "+0000", "-23:59", "+24:00", "+05:30", ""],
} as const;

/** The cartesian product of TIMESTAMP_FIELDS, in a fixed order. */
export function timestampCorpus(): string[] {
  const values: string[] = [];
  const f = TIMESTAMP_FIELDS;
  for (const year of f.year) for (const month of f.month) for (const day of f.day)
    for (const hour of f.hour) for (const minute of f.minute) for (const second of f.second)
      for (const separator of f.separator) for (const fraction of f.fraction) for (const zone of f.zone)
        values.push(`${year}-${month}-${day}${separator}${hour}:${minute}:${second}${fraction}${zone}`);
  return values;
}
