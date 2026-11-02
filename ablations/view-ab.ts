/**
 * View-ablation A/B comparator (ablation-replay/1).
 *
 * An ablation runs the same judge (model, harness, reasoning level) k times on
 * each of two views of the same input: arm A (the baseline view) and arm B (the
 * changed view). This comparator reads one JSONL file of replay records and
 * reports, per item, whether the change moved the verdict or the findings
 * beyond the judge's own run-to-run variance, which the k replays inside each
 * arm measure.
 *
 * Record (one JSON object per line):
 *   { "schema": "ablation-replay/1", "item": "<case id>", "arm": "A" | "B",
 *     "replay": <int>, "pass": <bool>,
 *     "findings": [ { "ref": "<affected id>", "class": "<defect class>",
 *                     "severity": "<judge's severity>" } ],
 *     "tokens_in": <int>, "tokens_out": <int>, "cost_usd": <number> }
 * Only findings whose severity is "blocking" enter the finding comparison.
 * A finding's key is `ref|class`.
 *
 * Usage: bun ablations/view-ab.ts <replays.jsonl>
 *        bun ablations/view-ab.ts --self-test
 * Prints one JSON report. Exit 0 on a report, 1 when the self-test fails,
 * 2 when the input is malformed (every problem printed).
 */
import { readFileSync } from "node:fs";

type Arm = "A" | "B";

interface Finding {
  readonly ref: string;
  readonly class: string;
  readonly severity: string;
}

interface Replay {
  readonly item: string;
  readonly arm: Arm;
  readonly replay: number;
  readonly pass: boolean;
  readonly findings: readonly Finding[];
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly costUsd: number;
}

interface ArmSummary {
  readonly replays: number;
  readonly passes: number;
  readonly majority: "pass" | "fail" | "tie";
  /** Mean Jaccard of blocking-finding sets over pairs of replays inside the arm. */
  readonly within_jaccard: number | null;
  readonly tokens_in: number;
  readonly tokens_out: number;
  readonly cost_usd: number;
}

interface ItemReport {
  readonly item: string;
  readonly a: ArmSummary;
  readonly b: ArmSummary;
  /** The majority verdict differs between the arms (a tie never counts as a flip). */
  readonly flip: boolean;
  /** Share of (A replay, B replay) pairs whose pass/fail verdicts agree. */
  readonly cross_verdict_agreement: number;
  /** Mean Jaccard of blocking-finding sets over (A replay, B replay) pairs. */
  readonly cross_jaccard: number | null;
  /** cross_jaccard is below the lower within-arm Jaccard: the view moved findings more than noise. */
  readonly findings_moved_beyond_noise: boolean | null;
  /** Blocking findings present in a majority of one arm's replays and in none of the other's. */
  readonly only_in_a: readonly string[];
  readonly only_in_b: readonly string[];
}

const SCHEMA = "ablation-replay/1";

function problemsOf(line: string, index: number): { replay?: Replay; problems: string[] } {
  const where = `line ${index + 1}`;
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { problems: [`${where}: not JSON`] };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { problems: [`${where}: not an object`] };
  }
  const record = value as Record<string, unknown>;
  const problems: string[] = [];
  if (record["schema"] !== SCHEMA) problems.push(`${where}: schema is not ${SCHEMA}`);
  const item = record["item"];
  if (typeof item !== "string" || item.length === 0) problems.push(`${where}: item missing`);
  const arm = record["arm"];
  if (arm !== "A" && arm !== "B") problems.push(`${where}: arm is not "A" or "B"`);
  const replay = record["replay"];
  if (!Number.isInteger(replay)) problems.push(`${where}: replay is not an integer`);
  const pass = record["pass"];
  if (typeof pass !== "boolean") problems.push(`${where}: pass is not a boolean`);
  const rawFindings = record["findings"];
  const findings: Finding[] = [];
  if (!Array.isArray(rawFindings)) {
    problems.push(`${where}: findings is not an array`);
  } else {
    rawFindings.forEach((raw: unknown, position) => {
      const finding = raw as Record<string, unknown> | null;
      if (
        typeof finding !== "object" || finding === null
        || typeof finding["ref"] !== "string" || typeof finding["class"] !== "string"
        || typeof finding["severity"] !== "string"
      ) {
        problems.push(`${where}: findings[${position}] needs string ref, class and severity`);
        return;
      }
      findings.push({ ref: finding["ref"], class: finding["class"], severity: finding["severity"] });
    });
  }
  const numbers: Record<string, number> = {};
  for (const key of ["tokens_in", "tokens_out", "cost_usd"] as const) {
    const field = record[key];
    if (typeof field !== "number" || !Number.isFinite(field) || field < 0) {
      problems.push(`${where}: ${key} is not a non-negative number`);
    } else {
      numbers[key] = field;
    }
  }
  if (problems.length > 0) return { problems };
  return {
    problems,
    replay: {
      item: item as string,
      arm: arm as Arm,
      replay: replay as number,
      pass: pass as boolean,
      findings,
      tokensIn: numbers["tokens_in"] ?? 0,
      tokensOut: numbers["tokens_out"] ?? 0,
      costUsd: numbers["cost_usd"] ?? 0,
    },
  };
}

function blockingKeys(replay: Replay): Set<string> {
  return new Set(
    replay.findings.filter((finding) => finding.severity === "blocking").map((finding) => `${finding.ref}|${finding.class}`),
  );
}

/** Jaccard of two sets; two empty sets are identical (1). */
function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  let shared = 0;
  for (const key of left) if (right.has(key)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function summarize(replays: readonly Replay[]): ArmSummary {
  const passes = replays.filter((replay) => replay.pass).length;
  const fails = replays.length - passes;
  const sets = replays.map(blockingKeys);
  const pairs: number[] = [];
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) pairs.push(jaccard(sets[i] as Set<string>, sets[j] as Set<string>));
  }
  const within = mean(pairs);
  return {
    replays: replays.length,
    passes,
    majority: passes > fails ? "pass" : fails > passes ? "fail" : "tie",
    within_jaccard: within === null ? null : round(within),
    tokens_in: replays.reduce((sum, replay) => sum + replay.tokensIn, 0),
    tokens_out: replays.reduce((sum, replay) => sum + replay.tokensOut, 0),
    cost_usd: round(replays.reduce((sum, replay) => sum + replay.costUsd, 0)),
  };
}

/** Keys present in more than half of `side`'s replays and in none of `other`'s. */
function exclusiveMajority(side: readonly Replay[], other: readonly Replay[]): string[] {
  const counts = new Map<string, number>();
  for (const replay of side) for (const key of blockingKeys(replay)) counts.set(key, (counts.get(key) ?? 0) + 1);
  const otherKeys = new Set<string>();
  for (const replay of other) for (const key of blockingKeys(replay)) otherKeys.add(key);
  return [...counts]
    .filter(([key, count]) => count * 2 > side.length && !otherKeys.has(key))
    .map(([key]) => key)
    .sort();
}

export function compare(replays: readonly Replay[]): ItemReport[] {
  const items = [...new Set(replays.map((replay) => replay.item))].sort();
  return items.map((item) => {
    const a = replays.filter((replay) => replay.item === item && replay.arm === "A");
    const b = replays.filter((replay) => replay.item === item && replay.arm === "B");
    const summaryA = summarize(a);
    const summaryB = summarize(b);
    let agreeing = 0;
    const cross: number[] = [];
    for (const left of a) {
      for (const right of b) {
        if (left.pass === right.pass) agreeing += 1;
        cross.push(jaccard(blockingKeys(left), blockingKeys(right)));
      }
    }
    const crossJaccard = mean(cross);
    const floor = summaryA.within_jaccard === null || summaryB.within_jaccard === null
      ? null
      : Math.min(summaryA.within_jaccard, summaryB.within_jaccard);
    return {
      item,
      a: summaryA,
      b: summaryB,
      flip: summaryA.majority !== "tie" && summaryB.majority !== "tie" && summaryA.majority !== summaryB.majority,
      cross_verdict_agreement: a.length * b.length === 0 ? 0 : round(agreeing / (a.length * b.length)),
      cross_jaccard: crossJaccard === null ? null : round(crossJaccard),
      findings_moved_beyond_noise: crossJaccard === null || floor === null ? null : round(crossJaccard) < floor,
      only_in_a: exclusiveMajority(a, b),
      only_in_b: exclusiveMajority(b, a),
    };
  });
}

function parse(text: string): { replays: Replay[]; problems: string[] } {
  const replays: Replay[] = [];
  const problems: string[] = [];
  text.split("\n").forEach((line, index) => {
    if (line.trim().length === 0) return;
    const parsed = problemsOf(line, index);
    problems.push(...parsed.problems);
    if (parsed.replay) replays.push(parsed.replay);
  });
  const seen = new Set<string>();
  for (const replay of replays) {
    const key = `${replay.item}|${replay.arm}|${replay.replay}`;
    if (seen.has(key)) problems.push(`duplicate replay ${key}`);
    seen.add(key);
  }
  return { replays, problems };
}

/** A fixed two-arm case whose report is known by hand. */
function selfTest(): string[] {
  const finding = (ref: string): Finding => ({ ref, class: "omission", severity: "blocking" });
  const row = (arm: Arm, replay: number, pass: boolean, findings: Finding[]): Replay =>
    ({ item: "case-1", arm, replay, pass, findings, tokensIn: 100, tokensOut: 10, costUsd: 0.01 });
  // Arm A: stable fail on X. Arm B: passes twice, then once fails on Y.
  const [report] = compare([
    row("A", 1, false, [finding("X")]),
    row("A", 2, false, [finding("X")]),
    row("A", 3, false, [finding("X")]),
    row("B", 1, true, []),
    row("B", 2, true, []),
    row("B", 3, false, [finding("Y")]),
  ]);
  const failures: string[] = [];
  const expect = (label: string, actual: unknown, expected: unknown): void => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  };
  expect("flip", report?.flip, true);
  expect("cross_verdict_agreement", report?.cross_verdict_agreement, round(3 / 9));
  expect("a.within_jaccard", report?.a.within_jaccard, 1);
  expect("b.within_jaccard", report?.b.within_jaccard, round(1 / 3));
  expect("cross_jaccard", report?.cross_jaccard, 0);
  expect("findings_moved_beyond_noise", report?.findings_moved_beyond_noise, true);
  expect("only_in_a", report?.only_in_a, ["X|omission"]);
  expect("only_in_b", report?.only_in_b, []);
  expect("a.cost_usd", report?.a.cost_usd, 0.03);
  return failures;
}

function main(argv: readonly string[]): number {
  const [argument] = argv;
  if (argument === "--self-test") {
    const failures = selfTest();
    for (const failure of failures) console.error(`self-test: ${failure}`);
    if (failures.length === 0) console.log("self-test: ok");
    return failures.length === 0 ? 0 : 1;
  }
  if (argument === undefined) {
    console.error("usage: bun ablations/view-ab.ts <replays.jsonl> | --self-test");
    return 2;
  }
  const { replays, problems } = parse(readFileSync(argument, "utf8"));
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    return 2;
  }
  console.log(JSON.stringify({ schema: "ablation-report/1", items: compare(replays) }, null, 2));
  return 0;
}

process.exitCode = main(process.argv.slice(2));
