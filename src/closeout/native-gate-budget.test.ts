import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";
import {
  NATIVE_GATE_BUDGET_PATH,
  NATIVE_GATE_BUDGET_SCHEMA,
  NATIVE_GATE_TIMEOUT_MAX_MS,
  NativeGateBudgetInvalidError,
  discoverNativeGates,
  loadNativeGateBudgets,
  type NativeGateCoverage,
} from "./native-gates.js";
import { runNativeGates } from "./native-gate-runner.js";
import { validateBudgetEvidence, validateNativeGateCoverage } from "./native-gate-validation.js";
import { captureRepositoryObject } from "./repository-object.js";

const roots: string[] = [];
const RUN_DEFAULT_MS = 1_000;
const SLEEP_MS = 2_500;
const DECLARED_MS = 20_000;

function put(repository: string, path: string, content: string): void {
  const absolute = join(repository, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

/** One bun-managed package whose `test` gate sleeps past the run default. */
function fixture(name: string, budgets?: unknown): { repo: string; evidence: string } {
  const base = mkdtempSync(join(tmpdir(), `mister-clean-gate-budget-${name}-`));
  roots.push(base);
  const repo = join(base, "repo");
  const evidence = join(base, "evidence");
  createFixtureRepository(repo, { identity: { name: "Gate Budget Fixture", email: "gate-budget.invalid" } });
  put(repo, "sleep.mjs", `await new Promise((resolve) => setTimeout(resolve, ${String(SLEEP_MS)}));\nprocess.stdout.write("slept\\n");\n`);
  put(repo, "package.json", `${JSON.stringify({
    name: "gate-budget-fixture",
    private: true,
    packageManager: "bun@1.0.0",
    scripts: { test: "node sleep.mjs" },
  }, null, 2)}\n`);
  put(repo, "bun.lock", "fixture lock\n");
  if (budgets !== undefined) {
    put(repo, NATIVE_GATE_BUDGET_PATH, typeof budgets === "string" ? budgets : `${JSON.stringify(budgets, null, 2)}\n`);
  }
  fixtureCommit(repo, "fixture");
  return { repo, evidence };
}

async function run(repo: string, evidence: string): Promise<{ coverage: NativeGateCoverage; errors: readonly string[] }> {
  const object = captureRepositoryObject(repo);
  const discovery = discoverNativeGates(repo, object);
  expect(discovery.required_gate_ids).toEqual(["node:.:test"]);
  const coverage = await runNativeGates(repo, discovery, evidence, { timeout_ms: RUN_DEFAULT_MS });
  const errors = await validateNativeGateCoverage(coverage, discovery, object, evidence, { require_passing: false, repository: repo });
  return { coverage, errors };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("repository-declared native-gate time budgets", () => {
  it("proof 1: a declared budget lets the gate finish and the evidence names the budget source", async () => {
    const declared = {
      schema: NATIVE_GATE_BUDGET_SCHEMA,
      gates: { "node:.:test": { timeout_ms: DECLARED_MS, reason: "the fixture gate sleeps past the run default" } },
    };
    const { repo, evidence } = fixture("declared", declared);
    const budgets = loadNativeGateBudgets(repo, new Set(["node:.:test"]));
    expect(budgets?.gates.get("node:.:test")).toEqual({ timeout_ms: DECLARED_MS, reason: "the fixture gate sleeps past the run default" });
    const { coverage, errors } = await run(repo, evidence);
    expect(errors).toEqual([]);
    expect(coverage.schema_version).toBe("1.6");
    const execution = coverage.executions[0]!;
    expect(execution.state).toBe("passed");
    expect(execution.budget).toEqual({
      source: "repository",
      timeout_ms: DECLARED_MS,
      path: NATIVE_GATE_BUDGET_PATH,
      sha256: budgets!.sha256,
      reason: "the fixture gate sleeps past the run default",
      default_timeout_ms: RUN_DEFAULT_MS,
    });
  }, 60_000);

  describe("proof 2: an invalid budget file is a typed refusal before any gate runs", () => {
    const cases: ReadonlyArray<readonly [string, unknown, RegExp]> = [
      ["above the maximum", { schema: NATIVE_GATE_BUDGET_SCHEMA, gates: { "node:.:test": { timeout_ms: NATIVE_GATE_TIMEOUT_MAX_MS + 1, reason: "too long" } } }, /exceeds NATIVE_GATE_TIMEOUT_MAX_MS/u],
      ["non-integer", { schema: NATIVE_GATE_BUDGET_SCHEMA, gates: { "node:.:test": { timeout_ms: 1500.5, reason: "fraction" } } }, /positive integer/u],
      ["non-positive", { schema: NATIVE_GATE_BUDGET_SCHEMA, gates: { "node:.:test": { timeout_ms: 0, reason: "zero" } } }, /positive integer/u],
      ["unknown gate id", { schema: NATIVE_GATE_BUDGET_SCHEMA, gates: { "node:.:nope": { timeout_ms: 5_000, reason: "x" } } }, /not a gate this repository's discovery defines/u],
      ["missing reason", { schema: NATIVE_GATE_BUDGET_SCHEMA, gates: { "node:.:test": { timeout_ms: 5_000 } } }, /reason must be a nonempty string/u],
      ["unknown key", { schema: NATIVE_GATE_BUDGET_SCHEMA, gates: { "node:.:test": { timeout_ms: 5_000, reason: "x", retries: 2 } } }, /unknown key/u],
      ["unknown schema", { schema: "mister-clean.native-gates/9", gates: {} }, /unknown schema/u],
      ["malformed JSON", "{ not json", /malformed JSON/u],
    ];
    it.each(cases)("%s", async (_name, budgets, reason) => {
      const { repo, evidence } = fixture("invalid", budgets);
      const object = captureRepositoryObject(repo);
      const discovery = discoverNativeGates(repo, object);
      let failure: unknown;
      try {
        await runNativeGates(repo, discovery, evidence, { timeout_ms: RUN_DEFAULT_MS });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(NativeGateBudgetInvalidError);
      expect(failure).toMatchObject({ code: "native_gate_budget_invalid", path: NATIVE_GATE_BUDGET_PATH });
      expect((failure as NativeGateBudgetInvalidError).reason).toMatch(reason);
      // Refused before any gate ran: no gate output was written.
      expect(!existsSync(evidence) || readdirSync(evidence).length === 0).toBe(true);
    }, 60_000);
  });

  it("proof 3: an undeclared gate keeps the run default and records it as such", async () => {
    const other = {
      schema: NATIVE_GATE_BUDGET_SCHEMA,
      gates: { "node:.:lint": { timeout_ms: DECLARED_MS, reason: "another gate" } },
    };
    const { repo, evidence } = fixture("undeclared");
    // Declare a budget for a second gate so the file is valid yet names a different gate.
    put(repo, "package.json", `${JSON.stringify({
      name: "gate-budget-fixture",
      private: true,
      packageManager: "bun@1.0.0",
      scripts: { test: "node sleep.mjs", lint: "node sleep.mjs" },
    }, null, 2)}\n`);
    put(repo, NATIVE_GATE_BUDGET_PATH, `${JSON.stringify(other, null, 2)}\n`);
    fixtureCommit(repo, "two gates");
    const object = captureRepositoryObject(repo);
    const discovery = discoverNativeGates(repo, object);
    expect([...discovery.required_gate_ids].sort()).toEqual(["node:.:lint", "node:.:test"]);
    const coverage = await runNativeGates(repo, discovery, evidence, { timeout_ms: RUN_DEFAULT_MS });
    const byId = new Map(coverage.executions.map((execution) => [execution.gate_id, execution]));
    expect(byId.get("node:.:lint")).toMatchObject({ state: "passed", budget: { source: "repository", timeout_ms: DECLARED_MS } });
    expect(byId.get("node:.:test")).toMatchObject({ state: "timed_out", failure_reason: "timeout", budget: { source: "default", timeout_ms: RUN_DEFAULT_MS } });
    expect(await validateNativeGateCoverage(coverage, discovery, object, evidence, { require_passing: false, repository: repo })).toEqual([]);

    // No budget file at all: nothing changes.
    const plain = fixture("no-file");
    const result = await run(plain.repo, plain.evidence);
    expect(result.errors).toEqual([]);
    expect(result.coverage.executions[0]).toMatchObject({ state: "timed_out", budget: { source: "default", timeout_ms: RUN_DEFAULT_MS } });
  }, 90_000);

  it("validates recorded budget evidence (proof 5 mutant anchor)", () => {
    const errors: string[] = [];
    expect(validateBudgetEvidence({ source: "default", timeout_ms: 1_000 }, "b", errors)).toBe(true);
    expect(validateBudgetEvidence({ source: "default", timeout_ms: 1_000.5 }, "b", errors)).toBe(false);
    expect(errors).toContain(`b.timeout_ms must be a positive integer of milliseconds no greater than ${String(NATIVE_GATE_TIMEOUT_MAX_MS)}`);
    expect(validateBudgetEvidence({ source: "repository", timeout_ms: 5, path: "elsewhere.json", sha256: "a".repeat(64), reason: "r", default_timeout_ms: 1 }, "c", errors)).toBe(false);
    expect(errors).toContain(`c.path must be ${NATIVE_GATE_BUDGET_PATH}`);
  });
});
