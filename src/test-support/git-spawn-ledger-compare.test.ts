/**
 * DONE proof 1 (charter/DONE/mg-s2b-git-runner.md): the spawn ledger of the
 * base bytes, transformed by exactly the declared deltas of proof 2, equals the
 * spawn ledger of the head, record set by record set, for every test id.
 *
 * Runs only when MISTER_CLEAN_GIT_LEDGER_BASE and MISTER_CLEAN_GIT_LEDGER_HEAD
 * name two ledger directories written by vitest.ledger.config.ts; otherwise it
 * skips, so it never passes vacuously inside the ordinary suites.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { stableStringify, type GitSpawnLedgerLine, type GitSpawnRecord } from "./git-spawn-ledger.js";

const BASE = process.env.MISTER_CLEAN_GIT_LEDGER_BASE ?? "";
const HEAD = process.env.MISTER_CLEAN_GIT_LEDGER_HEAD ?? "";
const ENABLED = BASE !== "" && HEAD !== "";

/** The 28 `hardenedGitArgs(` call sites outside git-hardening.ts at base 74e23b1, as file and line. */
export const BASE_SITES = [
  ["src/attestation.ts", 533], ["src/attestation.ts", 600],
  ["src/closeout/action-hygiene.ts", 255],
  ["src/closeout/action-lifecycle.ts", 177], ["src/closeout/action-lifecycle.ts", 774], ["src/closeout/action-lifecycle.ts", 846],
  ["src/closeout/bundle-runtime.ts", 311], ["src/closeout/bundle-runtime.ts", 312], ["src/closeout/bundle-runtime.ts", 317], ["src/closeout/bundle-runtime.ts", 330],
  ["src/closeout/execution-lease.ts", 200],
  ["src/closeout/finding-anchors.ts", 133],
  ["src/closeout/github-actions.ts", 547], ["src/closeout/github-actions.ts", 560],
  ["src/closeout/native-gates.ts", 579], ["src/closeout/native-gates.ts", 627], ["src/closeout/native-gates.ts", 900],
  ["src/closeout/repository-boundaries.ts", 79], ["src/closeout/repository-boundaries.ts", 138],
  ["src/closeout/repository-object.ts", 85], ["src/closeout/repository-object.ts", 126],
  ["src/closeout/repository.ts", 397], ["src/closeout/repository.ts", 416],
  ["src/closeout/semantic.ts", 926], ["src/closeout/semantic.ts", 1094],
  ["src/control-plane/runtime/evaluation-recorder.ts", 240],
  ["src/metrics/codebase-complexity.ts", 620],
  ["src/planning.ts", 14],
] as const;

/** Sites that gain `--no-optional-locks` (delta (a)), as file and function. */
const DELTA_A_SITES = [
  ["src/closeout/repository-boundaries.ts", "candidatePaths"],
  ["src/closeout/repository-boundaries.ts", "ignored"],
  ["src/planning.ts", "<anonymous>"],
] as const;

/** Planning's `cwd` becomes `-C <packageRoot>` (delta (c)). */
const DELTA_C_SITE = ["src/planning.ts", "<anonymous>"] as const;

/**
 * Delta (d): the records D5 changes in the tests that called `hardenedRemoteUrl`
 * and `contactRemote` directly and now call `contactConfiguredRemote` (proof 4
 * covers the behaviour), keyed by test id and argv. Only these are set aside, on
 * both sides; every other record of those tests compares.
 *
 * Measured empty (mg-s2c proof 7, S2B-QA-D2): on the retained S2b QA ledgers the
 * 8 `remote` / `remote get-url` records of the four tests are byte-identical on
 * base and head, and neither ledger holds an `ls-remote` record, so no record
 * differs and none is set aside. A record added here must differ on a real run.
 */
const DELTA_D_RECORDS: readonly { readonly test: string; readonly argv: readonly string[] }[] = [];

/** Tests the head adds (proofs 2-5, 7, 8); they have no base counterpart to compare. */
const HEAD_ONLY_PREFIXES = [
  "src/closeout/git-runner.test.ts > runner contract",
  "src/closeout/git-runner.test.ts > declared deltas",
  "src/closeout/git-runner.test.ts > remote contact",
  "src/closeout/git-runner.test.ts > fsmonitor control",
  "src/backbone-single-implementation.test.ts > git runner",
  "src/canonical-json.golden.test.ts > S2A-QA-D1",
] as const;

type Ledger = Map<string, GitSpawnRecord[]>;

function readLedger(directory: string): Ledger {
  const ledger: Ledger = new Map();
  for (const name of readdirSync(directory).filter((entry) => entry.endsWith(".jsonl")).sort()) {
    for (const text of readFileSync(join(directory, name), "utf8").split("\n").filter(Boolean)) {
      const line = JSON.parse(text) as GitSpawnLedgerLine;
      const records = ledger.get(line.test) ?? [];
      records.push(line.record);
      ledger.set(line.test, records);
    }
  }
  return ledger;
}

/** Index of the first argv entry after the leading `-c <override>` pairs. */
function afterOverrides(argv: readonly string[]): number {
  let index = 0;
  while (argv[index] === "-c") index += 2;
  return index;
}

/** gitConfigSnapshot's own read, which keeps its raw argv (no `--no-optional-locks`, no added `-C`). */
function isSnapshot(record: GitSpawnRecord): boolean {
  const at = afterOverrides(record.argv);
  return record.argv[at] === "-C" && record.argv.slice(at + 2).join(" ") === "config --list --name-only --null";
}

function atSite(record: GitSpawnRecord, [file, fn]: readonly [string, string]): boolean {
  return record.site.file === file && record.site.function === fn;
}

/** Whether DELTA_D_RECORDS sets this record of `test` aside (same test id, same argv). */
function isDeltaDRecord(test: string, record: GitSpawnRecord): boolean {
  return DELTA_D_RECORDS.some((entry) => entry.test === test && stableStringify(entry.argv) === stableStringify(record.argv));
}

export interface DeltaCounts { a: number; b: number; c: number; d: number }

/** Apply the declared deltas of proof 2, in the brief's order: (a), (b), (c), then (d). */
export function transformBase(test: string, records: readonly GitSpawnRecord[], counts: DeltaCounts): GitSpawnRecord[] {
  const result: GitSpawnRecord[] = [];
  for (const original of records) {
    let record = original;
    if (!isSnapshot(record) && DELTA_A_SITES.some((site) => atSite(record, site))) {
      const at = afterOverrides(record.argv);
      if (record.argv[at] !== "--no-optional-locks") {
        record = { ...record, argv: [...record.argv.slice(0, at), "--no-optional-locks", ...record.argv.slice(at)] };
        counts.a += 1;
      }
    }
    if (record.env.exact.LC_ALL !== "C") {
      record = { ...record, env: { ...record.env, exact: { ...record.env.exact, LC_ALL: "C" } } };
      counts.b += 1;
    }
    if (!isSnapshot(record) && atSite(record, DELTA_C_SITE) && typeof record.options.cwd === "string") {
      const { cwd, ...options } = record.options;
      const at = afterOverrides(record.argv) + 1;
      record = { ...record, options, argv: [...record.argv.slice(0, at), "-C", cwd as string, ...record.argv.slice(at)] };
      counts.c += 1;
    }
    if (isDeltaDRecord(test, record)) {
      counts.d += 1;
      continue;
    }
    result.push(record);
  }
  return result;
}

function headRecords(test: string, records: readonly GitSpawnRecord[]): GitSpawnRecord[] {
  return records.filter((record) => !isDeltaDRecord(test, record));
}

/**
 * A record's compared identity: everything except the base-only `line`. Run
 * names the instrument's normalisation leaves partly in place are normalised
 * here, on both sides alike: a randomUUID in a directory name, a mkdtemp name
 * nested inside another (`-lGvHk5-XXXXXX`), and mkdtemp directories a fixture
 * makes directly under /tmp rather than under the run's TMPDIR.
 */
function key(record: GitSpawnRecord): string {
  const { line: _line, ...compared } = record;
  return stableStringify(compared)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{6}(?:[0-9a-f]{6}|XXXXXX)/gu, "<UUID>")
    .replace(/-[A-Za-z0-9]{6}-XXXXXX/gu, "-XXXXXX-XXXXXX")
    .replace(/(?:\/private)?\/tmp\/([^/"\s]*?)[A-Za-z0-9]{6}(?=[/"\s]|$)/gu, "<SYSTMP>/$1XXXXXX");
}

/**
 * MISTER_CLEAN_GIT_LEDGER_NO_DELTAS=1 compares two ledgers of the same bytes
 * (a determinism check of the instrument): no delta is applied, so it is
 * strictly stricter than the base/head comparison.
 */
const NO_DELTAS = process.env.MISTER_CLEAN_GIT_LEDGER_NO_DELTAS === "1";

describe.skipIf(!ENABLED)("git spawn ledger comparison (needs MISTER_CLEAN_GIT_LEDGER_BASE and MISTER_CLEAN_GIT_LEDGER_HEAD)", () => {
  it("transformed base and head hold the same git spawn records for every test id", () => {
    const base = readLedger(BASE);
    const head = readLedger(HEAD);

    // Liveness: every base site was reached on base, and its file+function on head.
    const baseRecords = [...base.values()].flat();
    const headRecordList = [...head.values()].flat();
    const missedBase: string[] = [];
    const missedHead: string[] = [];
    for (const [file, line] of BASE_SITES) {
      const functions = new Set(baseRecords.filter((record) => record.site.file === file && record.line === line).map((record) => record.site.function));
      if (functions.size === 0) { missedBase.push(`${file}:${line}`); continue; }
      for (const fn of functions) if (!headRecordList.some((record) => atSite(record, [file, fn]))) missedHead.push(`${file}:${line} (${fn})`);
    }

    // Every result is computed and reported before any assertion, so a red run names all of its causes.
    const counts: DeltaCounts = { a: 0, b: 0, c: 0, d: 0 };
    const differences: string[] = [];
    let compared = 0;
    for (const [test, records] of base) {
      const expected = new Set((NO_DELTAS ? records : transformBase(test, records, counts)).map(key));
      const actual = new Set((NO_DELTAS ? head.get(test) ?? [] : headRecords(test, head.get(test) ?? [])).map(key));
      if (!head.has(test)) { differences.push(`${test}: absent from the head ledger`); continue; }
      compared += expected.size;
      for (const record of expected) if (!actual.has(record)) differences.push(`${test}: base-only ${record}`);
      for (const record of actual) if (!expected.has(record)) differences.push(`${test}: head-only ${record}`);
    }
    const headOnly = [...head.keys()].filter((test) => !base.has(test));
    const undeclared = headOnly.filter((test) => !HEAD_ONLY_PREFIXES.some((prefix) => test.startsWith(prefix)));
    // MISTER_CLEAN_GIT_LEDGER_REPORT, when set, receives every difference, one per line.
    const report = process.env.MISTER_CLEAN_GIT_LEDGER_REPORT ?? "";
    if (report !== "") writeFileSync(report, differences.map((difference) => `${difference}\n`).join(""));
    process.stdout.write(`${stableStringify({
      base_tests: base.size, head_tests: head.size, compared_records: compared, transformed: counts,
      head_only_tests: headOnly.length, sites_covered: BASE_SITES.length - missedBase.length,
      missed_base: missedBase, missed_head: missedHead, undeclared_head_only: undeclared,
      differences: differences.length, first_differences: differences.slice(0, 10),
    })}\n`);
    expect(base.size, "the base ledger is empty").toBeGreaterThan(0);
    expect(head.size, "the head ledger is empty").toBeGreaterThan(0);
    expect(missedBase, "base sites the base run never reached").toEqual([]);
    expect(missedHead, "base sites whose function the head run never reached").toEqual([]);
    expect(undeclared, "head tests with git spawns and no base counterpart, outside the declared new describes").toEqual([]);
    if (!NO_DELTAS) expect(counts.d, "delta (d) sets aside exactly the listed records").toBe(DELTA_D_RECORDS.length);
    expect(differences.slice(0, 40), `${differences.length} differing records`).toEqual([]);
  });
});
