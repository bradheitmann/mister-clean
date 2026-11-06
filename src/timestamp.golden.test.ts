/**
 * Golden tests for the one timestamp module (mg-s2a-codecs, DONE proofs 3 and 4).
 *
 * The oracles in codec-oracles.test-fixture.ts are verbatim copies of the base
 * validators. "oracle fidelity" proves the copies of exported validators behave as
 * the live code did on the golden commit. Run under node and under bun.
 */
import { describe, expect, it } from "vitest";

import { validClock } from "./closeout/native-gate-validation.js";
import { isoTimestamp } from "./closeout/records.js";
import {
  oracle_authority,
  oracle_campaign_observation_intake,
  oracle_evidence,
  oracle_execution_lease,
  oracle_import_provenance,
  oracle_invocation_journal,
  oracle_native_gate_validation,
  oracle_prepare,
  oracle_records,
  oracle_run_receipt,
  oracle_semantic,
  oracle_semantic_v2,
  oracle_trust_root,
  timestampCorpus,
} from "./codec-oracles.test-fixture.js";
import { formatTimestamp, isTimestamp, timestampMillis, type TimestampProfile } from "./timestamp.js";

const corpus = timestampCorpus();
const handRows: readonly unknown[] = [
  "", " ", "2024-02-29T23:59:59Z", "2024-02-29T23:59:59.999Z", "2024-02-29 23:59:59+05:30", "1970-01-01T00:00:00.000Z",
  "2026-11-06T09:33:11.123456789Z", "2026-11-06T09:33:11.1234567891Z", "+002026-11-06T09:33:11.000Z", "2026-11-06",
  "2026-11-06T09:33Z", "2026-11-06T09:33:11.000Z ", " 2026-11-06T09:33:11.000Z", "2026-11-06T09:33:11.000+00:00",
  null, undefined, 0, 1_700_000_000_000, {}, [],
];

describe("oracle fidelity", () => {
  it("corpus has the DONE proof 3 cartesian size", () => {
    expect(corpus).toHaveLength(6 * 6 * 7 * 3 * 3 * 3 * 3 * 5 * 8);
    expect(new Set(corpus).size).toBe(corpus.length);
  });

  it("records isoTimestamp equals its oracle on every corpus value", () => {
    const mismatches = [...corpus, ...handRows].filter((value) => isoTimestamp(value) !== oracle_records.isoTimestamp(value));
    expect(mismatches).toEqual([]);
  });

  it("native-gate-validation validClock equals its oracle on every corpus value, milliseconds included", () => {
    const mismatches = [...corpus, ...handRows].filter((value) => {
      // validClock is typed for strings; the oracle and the live code both guard non-strings.
      const live = validClock(value as string);
      const oracle = oracle_native_gate_validation.validClock(value as string);
      return !Object.is(live, oracle);
    });
    expect(mismatches).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Differential and declared delta (DONE proofs 3 and 4). Added after the golden commit.

const SITES: readonly { readonly site: string; readonly profile: TimestampProfile; readonly oracle: (value: string) => boolean }[] = [
  { site: "records.ts:117 isoTimestamp", profile: "record", oracle: (value) => oracle_records.isoTimestamp(value) },
  { site: "semantic.ts:242 isoTimestamp", profile: "rfc3339", oracle: (value) => oracle_semantic.isoTimestamp(value) },
  { site: "semantic-v2.ts:248 validIsoTimestamp", profile: "rfc3339", oracle: (value) => oracle_semantic_v2.validIsoTimestamp(value) },
  { site: "trust-root.ts:48 validIsoTimestamp", profile: "rfc3339", oracle: (value) => oracle_trust_root.validIsoTimestamp(value) },
  { site: "authority.ts:16 isoTimestamp", profile: "utc_ms", oracle: (value) => oracle_authority.isoTimestamp(value) },
  { site: "import-provenance.ts:21 isoTimestamp", profile: "utc_ms", oracle: (value) => oracle_import_provenance.isoTimestamp(value) },
  { site: "evidence.ts:25 isoTimestamp", profile: "utc_ms", oracle: (value) => oracle_evidence.isoTimestamp(value) },
  { site: "campaign-observation-intake.ts:80", profile: "utc_ns", oracle: (value) => oracle_campaign_observation_intake.validTimestamp(value) },
  { site: "native-gate-validation.ts:103 validClock", profile: "canonical_utc", oracle: (value) => oracle_native_gate_validation.validClock(value) !== undefined },
  { site: "run-receipt.ts:160 canonicalTimestamp", profile: "canonical_utc", oracle: (value) => oracle_run_receipt.canonicalTimestamp(value) },
  { site: "mister-clean-invocation-journal.ts:126 canonicalTimestamp", profile: "canonical_utc", oracle: (value) => oracle_invocation_journal.canonicalTimestamp(value) },
];

/**
 * An independent calendar check (not src/timestamp.ts): every field of a
 * date-time-shaped string names an instant that exists. Shapes the regex does not
 * match are not calendar failures; the grammars decide those.
 */
function failsCalendar(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):?(\d{2}))?$/u.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (days === undefined || day < 1 || day > days) return true;
  if (hour > 23 || minute > 59 || second > 59) return true;
  return match[7] !== undefined && (Number(match[8]) > 23 || Number(match[9]) > 59);
}

const engine = typeof (globalThis as { Bun?: unknown }).Bun === "undefined" ? "node" : "bun";

/** Corpus values that some oracle accepts and that fail the calendar check, computed on this engine. */
const deltaSet = new Set(corpus.filter((value) => failsCalendar(value) && SITES.some(({ oracle }) => oracle(value))));

describe("timestamp differential", () => {
  it.each(SITES)("$site equals isTimestamp under profile $profile outside the calendar delta", ({ profile, oracle }) => {
    const mismatches: string[] = [];
    for (const value of [...corpus, ...handRows]) {
      if (typeof value === "string" && deltaSet.has(value)) continue;
      const expected = typeof value === "string" && oracle(value);
      if (isTimestamp(value, profile) !== expected) mismatches.push(String(value));
    }
    expect(mismatches.slice(0, 20)).toEqual([]);
    expect(mismatches).toHaveLength(0);
  });

  it("canonical_utc timestampMillis equals the validClock oracle's milliseconds", () => {
    const mismatches = corpus.filter((value) => !Object.is(timestampMillis(value, "canonical_utc"), oracle_native_gate_validation.validClock(value)));
    expect(mismatches).toEqual([]);
  });

  it("formatTimestamp equals both formatters on valid Dates and throws for invalid ones", () => {
    const dates = [0, 1, -1, 951_782_400_000, 1_700_000_000_123, 253_402_300_799_999, -62_167_219_200_000, -62_198_755_200_000, 8.64e15, -8.64e15]
      .map((milliseconds) => new Date(milliseconds));
    for (const date of dates) {
      expect(formatTimestamp(date)).toBe(oracle_prepare.isoTimestamp(date));
      expect(formatTimestamp(date, "execution lease clock")).toBe(oracle_execution_lease.canonicalTimestamp(date, "execution lease clock"));
    }
    const invalid = new Date(Number.NaN);
    expect(() => oracle_prepare.isoTimestamp(invalid)).toThrow(RangeError);
    expect(() => formatTimestamp(invalid)).toThrow(RangeError);
    expect(() => oracle_execution_lease.canonicalTimestamp(invalid, "execution lease clock")).toThrow("execution lease clock returned an invalid date");
    expect(() => formatTimestamp(invalid, "execution lease clock")).toThrow("execution lease clock returned an invalid date");
  });
});

describe("calendar refusal", () => {
  const shapes: Readonly<Record<TimestampProfile, (date: string, time: string) => string>> = {
    record: (date, time) => `${date} ${time}+05:30`,
    rfc3339: (date, time) => `${date}T${time}.5Z`,
    utc_ms: (date, time) => `${date}T${time}Z`,
    utc_ns: (date, time) => `${date}T${time}.123456789Z`,
    canonical_utc: (date, time) => `${date}T${time}.000Z`,
  };
  const profiles = Object.keys(shapes) as TimestampProfile[];

  it.each(profiles)("%s refuses impossible calendar instants", (profile) => {
    const shape = shapes[profile];
    for (const date of ["2026-02-29", "2026-02-30", "2026-04-31", "2026-01-00", "2026-00-10", "2026-13-10", "2026-01-32"]) {
      expect(isTimestamp(shape(date, "12:00:00"), profile), `${profile} ${date}`).toBe(false);
    }
    for (const time of ["24:00:00", "23:60:00", "23:59:60"]) {
      expect(isTimestamp(shape("2026-01-01", time), profile), `${profile} ${time}`).toBe(false);
    }
    expect(isTimestamp(shape("2024-02-29", "23:59:59"), profile)).toBe(true);
    expect(isTimestamp(shape("2000-02-29", "00:00:00"), profile)).toBe(true);
    expect(isTimestamp(shape("2100-02-29", "00:00:00"), profile)).toBe(false);
  });

  it("offset profiles refuse an offset hour above 23 or minute above 59", () => {
    for (const profile of ["record", "rfc3339"] as const) {
      expect(isTimestamp("2026-01-01T00:00:00+24:00", profile)).toBe(false);
      expect(isTimestamp("2026-01-01T00:00:00+23:60", profile)).toBe(false);
      expect(isTimestamp("2026-01-01T00:00:00-23:59", profile)).toBe(true);
    }
  });

  it("the delta set is exactly the oracle-accepted calendar failures, and every profile refuses it", () => {
    expect(deltaSet.size).toBeGreaterThan(0);
    expect([...deltaSet].some((value) => value.startsWith("2026-02-30"))).toBe(true);
    expect([...deltaSet].some((value) => /T24:/u.test(value))).toBe(true);
    for (const value of deltaSet) {
      expect(failsCalendar(value)).toBe(true);
      for (const profile of profiles) expect(isTimestamp(value, profile), `${engine} ${profile} ${value}`).toBe(false);
    }
  });
});
