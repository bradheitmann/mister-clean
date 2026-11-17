/**
 * Offline scorer (eval-case-set/1 + eval-answer/1 -> eval-score/1).
 *
 * Reads one case-set file and one JSONL file of saved answers, calls no model,
 * and prints one report: per subject, how many cases passed against floors
 * that the case set itself declares. Formats, rules and limits: README.md in
 * this folder.
 *
 * The scorer trusts nothing an answer says about its own result. It recomputes
 * every hash from the bytes it was given and every pass or fail from the
 * output and the case's expected value. Any problem in either file ends the
 * run with no report.
 *
 * Usage: bun offline-scorer/score.ts <case-set.json> <answers.jsonl>
 *        bun offline-scorer/score.ts --self-test
 * Exit 0 on a report, 1 when the self-test fails, 2 when an input is refused
 * (every problem printed on stderr, nothing on stdout).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const CASE_SET_SCHEMA = "eval-case-set/1";
const ANSWER_SCHEMA = "eval-answer/1";
const SCORE_SCHEMA = "eval-score/1";
const SCORER_VERSION = 1;
const HEX64 = /^[0-9a-f]{64}$/;
const IDENTITY_STATUSES = ["receipt", "title_only", "contract_only", "synthetic"] as const;
const SUBJECT_TEXT_FIELDS = ["id", "harness", "model", "reasoning", "provider"] as const;

type Kind = "label" | "exact";
type IdentityStatus = (typeof IDENTITY_STATUSES)[number];
type Outcome = "meets_floor" | "below_floor" | "insufficient_evidence";
type AttemptResult = "pass" | "fail" | "malformed";
type CaseResult = "pass" | "fail" | "unanswered";
type Json = Record<string, unknown>;

interface Case {
  readonly id: string;
  readonly input: string;
  readonly inputSha256: string;
  readonly expected: string;
}

interface CaseSet {
  readonly id: string;
  readonly version: number;
  readonly taskClass: string;
  readonly kind: Kind;
  readonly labels: readonly string[];
  readonly minAttemptsPerCase: number;
  readonly minCasesPassed: number;
  readonly cases: readonly Case[];
  readonly sha256: string;
}

interface Subject {
  readonly id: string;
  readonly harness: string;
  readonly model: string;
  readonly reasoning: string;
  readonly provider: string;
  readonly identity_status: IdentityStatus;
}

interface Answer {
  readonly subject: Subject;
  readonly caseId: string;
  readonly attempt: number;
  readonly output: string;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly costUsd: number | null;
}

interface CaseReport {
  readonly case: string;
  readonly attempts: number;
  readonly passes: number;
  readonly malformed: number;
  readonly result: CaseResult;
}

interface SubjectReport {
  readonly subject: Subject;
  /** True only when the subject's identity was observed in a harness log that every answer cites by hash. */
  readonly identity_bound: boolean;
  readonly outcome: Outcome;
  readonly cases: number;
  readonly cases_answered: number;
  readonly cases_passed: number;
  readonly cases_failed: number;
  readonly cases_unanswered: number;
  readonly attempts: number;
  readonly malformed_attempts: number;
  /** Answered cases whose attempts include both a pass and a non-pass. */
  readonly flaky_cases: number;
  /** Kind `label` only: the one label every attempt gave, when every attempt gave the same one. */
  readonly constant_label: string | null;
  /** Null when any attempt's count is unknown; an unknown is never read as zero. */
  readonly tokens_in: number | null;
  readonly tokens_out: number | null;
  readonly cost_usd: number | null;
  readonly cost_known_attempts: number;
  readonly per_case: readonly CaseReport[];
}

interface Report {
  readonly schema: typeof SCORE_SCHEMA;
  readonly scorer: { readonly name: "offline-scorer"; readonly version: number; readonly source_sha256: string };
  readonly case_set: {
    readonly id: string;
    readonly version: number;
    readonly sha256: string;
    readonly task_class: string;
    readonly kind: Kind;
    readonly cases: number;
    readonly floors: { readonly min_attempts_per_case: number; readonly min_cases_passed: number };
  };
  readonly answers: { readonly sha256: string; readonly lines: number };
  readonly subjects: readonly SubjectReport[];
}

function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseCaseSet(bytes: Uint8Array): { caseSet?: CaseSet; problems: string[] } {
  const problems: string[] = [];
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { problems: ["case set: not UTF-8 JSON"] };
  }
  if (!isObject(value)) return { problems: ["case set: not an object"] };
  if (value["schema"] !== CASE_SET_SCHEMA) problems.push(`case set: schema is not ${CASE_SET_SCHEMA}`);
  for (const key of ["id", "task_class", "provenance"] as const) {
    if (!isText(value[key])) problems.push(`case set: ${key} missing`);
  }
  const version = value["version"];
  if (!isCount(version) || version < 1) problems.push("case set: version is not a positive integer");
  const kind = value["kind"];
  if (kind !== "label" && kind !== "exact") problems.push('case set: kind is not "label" or "exact"');

  const labels: string[] = [];
  const rawLabels = value["labels"];
  if (kind === "label") {
    if (!Array.isArray(rawLabels) || rawLabels.length < 2) {
      problems.push("case set: kind label needs at least two labels");
    } else {
      for (const label of rawLabels as unknown[]) {
        if (!isText(label) || label !== label.trim()) problems.push("case set: a label is empty or has outer whitespace");
        else if (labels.includes(label)) problems.push(`case set: label ${label} is listed twice`);
        else labels.push(label);
      }
    }
  } else if (rawLabels !== undefined) {
    problems.push("case set: labels belongs to kind label only");
  }

  const cases: Case[] = [];
  const rawCases = value["cases"];
  if (!Array.isArray(rawCases) || rawCases.length === 0) {
    problems.push("case set: cases is not a non-empty array");
  } else {
    (rawCases as unknown[]).forEach((raw, index) => {
      const where = `case set: cases[${index}]`;
      if (!isObject(raw)) {
        problems.push(`${where}: not an object`);
        return;
      }
      const id = raw["id"];
      const input = raw["input"];
      const expected = raw["expected"];
      const before = problems.length;
      if (!isText(id)) problems.push(`${where}: id missing`);
      else if (cases.some((known) => known.id === id)) problems.push(`${where}: id ${id} is used twice`);
      if (!isText(input)) problems.push(`${where}: input missing`);
      else if (raw["input_sha256"] !== sha256(input)) problems.push(`${where}: input_sha256 is not the sha256 of input`);
      if (!isText(expected) || expected !== expected.trim()) {
        problems.push(`${where}: expected is empty or has outer whitespace`);
      } else if (kind === "label" && !labels.includes(expected)) {
        problems.push(`${where}: expected is not a declared label`);
      }
      if (raw["material"] !== undefined && typeof raw["material"] !== "string") problems.push(`${where}: material is not a string`);
      if (problems.length === before) {
        cases.push({ id: id as string, input: input as string, inputSha256: sha256(input as string), expected: expected as string });
      }
    });
  }

  const floors = value["floors"];
  let minAttemptsPerCase = 0;
  let minCasesPassed = 0;
  if (!isObject(floors)) {
    problems.push("case set: floors missing");
  } else {
    const attempts = floors["min_attempts_per_case"];
    const passed = floors["min_cases_passed"];
    if (!isCount(attempts) || attempts < 1) problems.push("case set: floors.min_attempts_per_case is not a positive integer");
    else minAttemptsPerCase = attempts;
    if (!isCount(passed) || passed < 1 || (Array.isArray(rawCases) && passed > rawCases.length)) {
      problems.push("case set: floors.min_cases_passed is not between 1 and the number of cases");
    } else {
      minCasesPassed = passed;
    }
  }

  // A subject that gives one label every time passes exactly the cases that expect it.
  if (kind === "label" && minCasesPassed > 0) {
    for (const label of labels) {
      const share = cases.filter((entry) => entry.expected === label).length;
      if (share >= minCasesPassed) {
        problems.push(`case set: answering ${label} every time would pass ${share} cases and meet the floor of ${minCasesPassed}`);
      }
    }
  }

  if (problems.length > 0) return { problems };
  return {
    problems,
    caseSet: {
      id: value["id"] as string,
      version: version as number,
      taskClass: value["task_class"] as string,
      kind: kind as Kind,
      labels,
      minAttemptsPerCase,
      minCasesPassed,
      cases,
      sha256: sha256(bytes),
    },
  };
}

function parseSubject(raw: unknown, where: string, problems: string[]): Subject | undefined {
  if (!isObject(raw)) {
    problems.push(`${where}: subject is not an object`);
    return undefined;
  }
  const before = problems.length;
  for (const key of SUBJECT_TEXT_FIELDS) {
    if (!isText(raw[key])) problems.push(`${where}: subject.${key} missing`);
  }
  const status = raw["identity_status"];
  if (!IDENTITY_STATUSES.includes(status as IdentityStatus)) {
    problems.push(`${where}: subject.identity_status is not one of ${IDENTITY_STATUSES.join(", ")}`);
  }
  if (problems.length > before) return undefined;
  return {
    id: raw["id"] as string,
    harness: raw["harness"] as string,
    model: raw["model"] as string,
    reasoning: raw["reasoning"] as string,
    provider: raw["provider"] as string,
    identity_status: status as IdentityStatus,
  };
}

function parseAnswers(bytes: Uint8Array, caseSet: CaseSet): { answers: Answer[]; lines: number; problems: string[] } {
  const problems: string[] = [];
  const answers: Answer[] = [];
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { answers, lines: 0, problems: ["answers: not UTF-8"] };
  }
  const described = new Map<string, string>();
  const seen = new Set<string>();
  let lines = 0;
  text.split("\n").forEach((line, index) => {
    if (line.trim().length === 0) return;
    lines += 1;
    const where = `answers line ${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      problems.push(`${where}: not JSON`);
      return;
    }
    if (!isObject(value)) {
      problems.push(`${where}: not an object`);
      return;
    }
    const before = problems.length;
    if (value["schema"] !== ANSWER_SCHEMA) problems.push(`${where}: schema is not ${ANSWER_SCHEMA}`);
    if (value["case_set_sha256"] !== caseSet.sha256) problems.push(`${where}: case_set_sha256 is not the sha256 of the case-set file`);
    const known = caseSet.cases.find((entry) => entry.id === value["case"]);
    if (known === undefined) problems.push(`${where}: case is not in the case set`);
    else if (value["input_sha256"] !== known.inputSha256) problems.push(`${where}: input_sha256 is not the case's`);
    const subject = parseSubject(value["subject"], where, problems);
    const evidence = value["identity_evidence_sha256"];
    if (evidence !== null && !(typeof evidence === "string" && HEX64.test(evidence))) {
      problems.push(`${where}: identity_evidence_sha256 is neither null nor a sha256`);
    } else if (subject?.identity_status === "receipt" && evidence === null) {
      problems.push(`${where}: identity_status receipt needs identity_evidence_sha256`);
    }
    const attempt = value["attempt"];
    if (!isCount(attempt) || attempt < 1) problems.push(`${where}: attempt is not a positive integer`);
    const output = value["output"];
    if (typeof output !== "string") problems.push(`${where}: output is not a string`);
    else if (value["output_sha256"] !== sha256(output)) problems.push(`${where}: output_sha256 is not the sha256 of output`);
    for (const key of ["tokens_in", "tokens_out"] as const) {
      if (value[key] !== null && !isCount(value[key])) problems.push(`${where}: ${key} is neither null nor a non-negative integer`);
    }
    const cost = value["cost_usd"];
    if (cost !== null && !(typeof cost === "number" && Number.isFinite(cost) && cost >= 0)) {
      problems.push(`${where}: cost_usd is neither null nor a non-negative number`);
    }
    if (subject !== undefined) {
      const description = JSON.stringify(subject);
      const earlier = described.get(subject.id);
      if (earlier === undefined) described.set(subject.id, description);
      else if (earlier !== description) problems.push(`${where}: subject ${subject.id} is described two ways in this file`);
    }
    if (problems.length > before || subject === undefined || known === undefined) return;
    const key = JSON.stringify([subject.id, known.id, attempt]);
    if (seen.has(key)) {
      problems.push(`${where}: subject ${subject.id} already has attempt ${String(attempt)} of case ${known.id}`);
      return;
    }
    seen.add(key);
    answers.push({
      subject,
      caseId: known.id,
      attempt: attempt as number,
      output: output as string,
      tokensIn: value["tokens_in"] as number | null,
      tokensOut: value["tokens_out"] as number | null,
      costUsd: cost as number | null,
    });
  });
  if (lines === 0) problems.push("answers: no answer lines");
  return { answers, lines, problems };
}

function judge(caseSet: CaseSet, expected: string, output: string): AttemptResult {
  const given = output.trim();
  if (caseSet.kind === "label" && !caseSet.labels.includes(given)) return "malformed";
  return given === expected ? "pass" : "fail";
}

function total(values: readonly (number | null)[]): number | null {
  let sum = 0;
  for (const value of values) {
    if (value === null) return null;
    sum += value;
  }
  return Math.round(sum * 1e9) / 1e9;
}

function scoreSubject(caseSet: CaseSet, subject: Subject, answers: readonly Answer[]): SubjectReport {
  const perCase: CaseReport[] = caseSet.cases.map((entry) => {
    const results = answers
      .filter((answer) => answer.caseId === entry.id)
      .map((answer) => judge(caseSet, entry.expected, answer.output));
    const passes = results.filter((result) => result === "pass").length;
    const answered = results.length >= caseSet.minAttemptsPerCase;
    return {
      case: entry.id,
      attempts: results.length,
      passes,
      malformed: results.filter((result) => result === "malformed").length,
      result: !answered ? "unanswered" : passes * 2 > results.length ? "pass" : "fail",
    };
  });
  const count = (result: CaseResult): number => perCase.filter((entry) => entry.result === result).length;
  const unanswered = count("unanswered");
  const passed = count("pass");
  const given = new Set(answers.map((answer) => answer.output.trim()));
  const only = given.size === 1 ? [...given][0] : undefined;
  return {
    subject,
    identity_bound: subject.identity_status === "receipt",
    outcome: unanswered > 0 ? "insufficient_evidence" : passed >= caseSet.minCasesPassed ? "meets_floor" : "below_floor",
    cases: caseSet.cases.length,
    cases_answered: caseSet.cases.length - unanswered,
    cases_passed: passed,
    cases_failed: count("fail"),
    cases_unanswered: unanswered,
    attempts: answers.length,
    malformed_attempts: perCase.reduce((sum, entry) => sum + entry.malformed, 0),
    flaky_cases: perCase.filter((entry) => entry.result !== "unanswered" && entry.passes > 0 && entry.passes < entry.attempts).length,
    constant_label: caseSet.kind === "label" && only !== undefined && caseSet.labels.includes(only) ? only : null,
    tokens_in: total(answers.map((answer) => answer.tokensIn)),
    tokens_out: total(answers.map((answer) => answer.tokensOut)),
    cost_usd: total(answers.map((answer) => answer.costUsd)),
    cost_known_attempts: answers.filter((answer) => answer.costUsd !== null).length,
    per_case: perCase,
  };
}

function score(
  caseSetBytes: Uint8Array,
  answersBytes: Uint8Array,
  scorerSourceSha256: string,
): { report?: Report; problems: string[] } {
  const parsedSet = parseCaseSet(caseSetBytes);
  if (parsedSet.caseSet === undefined) return { problems: parsedSet.problems };
  const caseSet = parsedSet.caseSet;
  const parsed = parseAnswers(answersBytes, caseSet);
  if (parsed.problems.length > 0) return { problems: parsed.problems };
  const subjects = new Map<string, Subject>();
  for (const answer of parsed.answers) subjects.set(answer.subject.id, answer.subject);
  const ids = [...subjects.keys()].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return {
    problems: [],
    report: {
      schema: SCORE_SCHEMA,
      scorer: { name: "offline-scorer", version: SCORER_VERSION, source_sha256: scorerSourceSha256 },
      case_set: {
        id: caseSet.id,
        version: caseSet.version,
        sha256: caseSet.sha256,
        task_class: caseSet.taskClass,
        kind: caseSet.kind,
        cases: caseSet.cases.length,
        floors: { min_attempts_per_case: caseSet.minAttemptsPerCase, min_cases_passed: caseSet.minCasesPassed },
      },
      answers: { sha256: sha256(answersBytes), lines: parsed.lines },
      subjects: ids.map((id) =>
        scoreSubject(
          caseSet,
          subjects.get(id) as Subject,
          parsed.answers.filter((answer) => answer.subject.id === id).sort((left, right) => left.attempt - right.attempt),
        ),
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// Self-test: every rule above, each with an input that must be refused or
// scored one exact way. The mutants in ../mutants each break one rule.

interface TestCase {
  readonly id: string;
  readonly expected: string;
}

function testSet(kind: Kind, cases: readonly TestCase[], minCasesPassed: number, change?: (set: Json) => void): Uint8Array {
  const set: Json = {
    schema: CASE_SET_SCHEMA,
    id: "self-test",
    version: 1,
    task_class: "self-test",
    provenance: "synthetic",
    kind,
    ...(kind === "label" ? { labels: ["yes", "no"] } : {}),
    floors: { min_attempts_per_case: 2, min_cases_passed: minCasesPassed },
    cases: cases.map((entry) => ({
      id: entry.id,
      input: `question ${entry.id}`,
      input_sha256: sha256(`question ${entry.id}`),
      expected: entry.expected,
    })),
  };
  change?.(set);
  return new TextEncoder().encode(`${JSON.stringify(set)}\n`);
}

function testAnswer(setBytes: Uint8Array, subject: string, caseId: string, attempt: number, output: string, change?: (answer: Json) => void): string {
  const answer: Json = {
    schema: ANSWER_SCHEMA,
    case_set_sha256: sha256(setBytes),
    case: caseId,
    input_sha256: sha256(`question ${caseId}`),
    subject: { id: subject, harness: "none", model: "hand-written", reasoning: "none", provider: "none", identity_status: "synthetic" },
    identity_evidence_sha256: null,
    attempt,
    output,
    output_sha256: sha256(output),
    tokens_in: 10,
    tokens_out: 1,
    cost_usd: 0.001,
  };
  change?.(answer);
  return JSON.stringify(answer);
}

function selfTest(): string[] {
  const failures: string[] = [];
  const encode = (lines: readonly string[]): Uint8Array => new TextEncoder().encode(`${lines.join("\n")}\n`);
  const cases: readonly TestCase[] = [
    { id: "c1", expected: "yes" },
    { id: "c2", expected: "no" },
    { id: "c3", expected: "yes" },
    { id: "c4", expected: "no" },
  ];
  const set = testSet("label", cases, 3);
  const twice = (subject: string, pick: (entry: TestCase) => string): string[] =>
    cases.flatMap((entry) => [1, 2].map((attempt) => testAnswer(set, subject, entry.id, attempt, pick(entry))));
  const run = (lines: readonly string[], setBytes: Uint8Array = set) => score(setBytes, encode(lines), "self-test");
  const subjectOf = (lines: readonly string[], id: string): SubjectReport | undefined =>
    run(lines).report?.subjects.find((entry) => entry.subject.id === id);
  const expect = (name: string, holds: boolean): void => {
    if (!holds) failures.push(name);
  };
  const refused = (name: string, result: { report?: Report; problems: string[] }, needle: string): void => {
    expect(`${name}: must be refused`, result.report === undefined && result.problems.some((problem) => problem.includes(needle)));
  };

  // Scoring.
  const perfect = twice("perfect", (entry) => entry.expected);
  const good = subjectOf(perfect, "perfect");
  expect("a subject that answers every case correctly meets the floor", good?.outcome === "meets_floor" && good.cases_passed === 4);
  expect("a hand-written subject is not identity-bound", good?.identity_bound === false);
  expect("known costs are summed", good?.cost_usd === 0.008 && good.tokens_in === 80 && good.cost_known_attempts === 8);

  const constant = subjectOf(twice("constant", () => "yes"), "constant");
  expect("a constant label is named and stays below the floor", constant?.outcome === "below_floor" && constant.constant_label === "yes" && constant.cases_passed === 2);

  const malformed = subjectOf(twice("wordy", (entry) => (entry.id === "c1" ? "The answer is yes." : entry.expected)), "wordy");
  expect(
    "an output that is not exactly one label is malformed and does not pass",
    malformed?.malformed_attempts === 2 && malformed.cases_passed === 3 && malformed.per_case[0]?.result === "fail",
  );

  const padded = subjectOf(twice("padded", (entry) => ` ${entry.expected}\n`), "padded");
  expect("outer whitespace around a label is ignored", padded?.outcome === "meets_floor" && padded.malformed_attempts === 0);

  const short = subjectOf(perfect.filter((line) => !(line.includes('"case":"c4"') && line.includes('"attempt":2'))), "perfect");
  expect(
    "a case with fewer attempts than the floor is unanswered and the subject gets insufficient_evidence",
    short?.outcome === "insufficient_evidence" && short.cases_unanswered === 1 && short.cases_passed === 3,
  );

  const split = subjectOf(
    cases.flatMap((entry) => [
      testAnswer(set, "split", entry.id, 1, entry.expected),
      testAnswer(set, "split", entry.id, 2, entry.expected === "yes" ? "no" : "yes"),
    ]),
    "split",
  );
  expect("a case passes only when more than half of its attempts pass", split?.cases_passed === 0 && split.flaky_cases === 4 && split.outcome === "below_floor");

  const unknownCost = subjectOf(
    perfect.map((line, index) => (index === 0 ? testAnswer(set, "perfect", "c1", 1, "yes", (answer) => { answer["cost_usd"] = null; }) : line)),
    "perfect",
  );
  expect("one unknown cost makes the total unknown, never zero", unknownCost?.cost_usd === null && unknownCost.cost_known_attempts === 7);

  const bound = subjectOf(
    cases.flatMap((entry) => [1, 2].map((attempt) =>
      testAnswer(set, "bound", entry.id, attempt, entry.expected, (answer) => {
        (answer["subject"] as Json)["identity_status"] = "receipt";
        answer["identity_evidence_sha256"] = sha256(`log ${entry.id} ${String(attempt)}`);
      }),
    )),
    "bound",
  );
  expect("a subject whose answers cite a harness log is identity-bound", bound?.identity_bound === true);

  const forward = run([...perfect, ...twice("constant", () => "yes")]).report;
  const backward = run([...twice("constant", () => "yes"), ...perfect].reverse()).report;
  expect(
    "the order of answer lines does not change the subjects' results",
    forward !== undefined && backward !== undefined && JSON.stringify(forward.subjects) === JSON.stringify(backward.subjects),
  );

  const exactSet = testSet("exact", [{ id: "c1", expected: '{"a":1}' }, { id: "c2", expected: "[]" }], 2);
  const exact = score(
    exactSet,
    encode([
      testAnswer(exactSet, "exact", "c1", 1, '{"a":1}\n'),
      testAnswer(exactSet, "exact", "c1", 2, '{"a":1}'),
      testAnswer(exactSet, "exact", "c2", 1, "[ ]"),
      testAnswer(exactSet, "exact", "c2", 2, "[ ]"),
    ]),
    "self-test",
  ).report?.subjects[0];
  expect(
    "kind exact compares the trimmed output with the expected text and has no malformed class",
    exact?.cases_passed === 1 && exact.malformed_attempts === 0 && exact.constant_label === null && exact.outcome === "below_floor",
  );

  // Refusals of answers.
  const tampered = (change: (answer: Json) => void): string[] =>
    perfect.map((line, index) => (index === 0 ? testAnswer(set, "perfect", "c1", 1, "yes", change) : line));
  refused("an output changed after its hash was written", run(tampered((answer) => { answer["output"] = "no"; })), "output_sha256");
  refused("an answer that cites another case set", run(tampered((answer) => { answer["case_set_sha256"] = sha256("other"); })), "case_set_sha256");
  refused("an answer to a case the set does not hold", run(tampered((answer) => { answer["case"] = "c9"; })), "not in the case set");
  refused("an answer that cites another prompt", run(tampered((answer) => { answer["input_sha256"] = sha256("other"); })), "input_sha256");
  refused(
    "one subject id described with two models",
    run(tampered((answer) => { (answer["subject"] as Json)["model"] = "another-model"; })),
    "described two ways",
  );
  refused("the same attempt given twice", run([...perfect, perfect[0] as string]), "already has attempt");
  refused(
    "identity_status receipt with no harness log hash",
    run(tampered((answer) => { (answer["subject"] as Json)["identity_status"] = "receipt"; })),
    "needs identity_evidence_sha256",
  );
  refused("a negative token count", run(tampered((answer) => { answer["tokens_in"] = -1; })), "tokens_in");
  refused("an empty answers file", run([]), "no answer lines");
  refused(
    "a case set whose floor changed after the answers were made",
    run(perfect, testSet("label", cases, 3, (changed) => { (changed["floors"] as Json)["min_cases_passed"] = 4; })),
    "case_set_sha256",
  );

  // Refusals of case sets.
  const refusedSet = (name: string, bytes: Uint8Array, needle: string): void => refused(name, score(bytes, encode(perfect), "self-test"), needle);
  refusedSet("a floor that a constant label would meet", testSet("label", cases, 2), "every time");
  refusedSet("an expected value that is not a declared label", testSet("label", [...cases.slice(0, 3), { id: "c4", expected: "maybe" }], 3), "not a declared label");
  refusedSet(
    "a prompt changed after its hash was written",
    testSet("label", cases, 3, (changed) => { ((changed["cases"] as Json[])[0] as Json)["input"] = "another question"; }),
    "input_sha256",
  );
  refusedSet("a case id used twice", testSet("label", [...cases.slice(0, 3), { id: "c1", expected: "no" }], 3), "used twice");
  refusedSet("a floor above the number of cases", testSet("label", cases, 5), "min_cases_passed");
  refusedSet("labels on a set of kind exact", testSet("exact", cases, 3, (changed) => { changed["labels"] = ["yes", "no"]; }), "kind label only");

  return failures;
}

function main(argv: readonly string[]): number {
  if (argv.length === 1 && argv[0] === "--self-test") {
    const failures = selfTest();
    for (const failure of failures) console.error(`self-test: ${failure}`);
    if (failures.length === 0) console.log("self-test: ok");
    return failures.length === 0 ? 0 : 1;
  }
  const [caseSetPath, answersPath] = argv;
  if (argv.length !== 2 || caseSetPath === undefined || answersPath === undefined || caseSetPath.startsWith("--")) {
    console.error("usage: bun offline-scorer/score.ts <case-set.json> <answers.jsonl> | --self-test");
    return 2;
  }
  let caseSetBytes: Uint8Array;
  let answersBytes: Uint8Array;
  try {
    caseSetBytes = readFileSync(caseSetPath);
    answersBytes = readFileSync(answersPath);
  } catch (error) {
    console.error(`cannot read an input file: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  const result = score(caseSetBytes, answersBytes, sha256(readFileSync(new URL(import.meta.url))));
  if (result.report === undefined) {
    for (const problem of result.problems) console.error(problem);
    return 2;
  }
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
