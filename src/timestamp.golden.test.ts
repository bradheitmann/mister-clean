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
import { oracle_native_gate_validation, oracle_records, timestampCorpus } from "./codec-oracles.test-fixture.js";

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
