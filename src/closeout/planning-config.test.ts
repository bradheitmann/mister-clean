import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type CliIO, runCli } from "../cli.js";
import { createFixtureRepository } from "../test-support/fixture-repo.js";
import { discoverBundlePlanningRoots, nodeFilePort } from "./bundle.js";
import { auditPlanningRepository } from "./planning.js";
import {
  discoverPlanningRoots,
  loadPlanningConfig,
  PLANNING_CONFIG_PATH,
  PLANNING_CONFIG_SCHEMA,
  PlanningConfigInvalidError,
} from "./repository.js";

const roots: string[] = [];

function scratch(name: string): string {
  const base = mkdtempSync(join(tmpdir(), `mister-clean-planning-config-${name}-`));
  roots.push(base);
  return base;
}

function put(repository: string, path: string, content = "x\n"): void {
  const absolute = join(repository, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

function repo(name: string): string {
  const repository = join(scratch(name), "repo");
  createFixtureRepository(repository);
  return repository;
}

function writeConfig(repository: string, config: unknown): string {
  const text = typeof config === "string" ? config : `${JSON.stringify(config, null, 2)}\n`;
  put(repository, PLANNING_CONFIG_PATH, text);
  return createHash("sha256").update(readFileSync(join(repository, PLANNING_CONFIG_PATH))).digest("hex");
}

function capture(): { io: CliIO; stderr: string[]; stdout: string[] } {
  const stderr: string[] = [];
  const stdout: string[] = [];
  return { io: { stderr: (line) => stderr.push(line), stdout: (line) => stdout.push(line) }, stderr, stdout };
}

/** Heuristic-visible shapes: a real corpus plus two heuristic false positives. */
function corpus(repository: string): void {
  put(repository, "plans/ROADMAP.md", "# Roadmap\n");
  put(repository, "docs/STATUS.md", "# Status\n");
  put(repository, "reports/x/tasks/T-1.md", "# evidence\n");
  put(repository, "misc/tasks/T-2.md", "# scratch\n");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("repository planning config (.mister-clean/planning.json)", () => {
  it("leaves the heuristic unchanged without a config", () => {
    const repository = repo("absent");
    corpus(repository);
    expect(loadPlanningConfig(repository)).toBeNull();
    expect(discoverPlanningRoots(repository)).toEqual(["docs/STATUS.md", "misc/tasks", "plans", "reports/x/tasks"]);
    expect(auditPlanningRepository(repository).planning_config).toBeNull();
  });

  it("proof 1: exclude removes a heuristic false positive", () => {
    const repository = repo("exclude");
    corpus(repository);
    const sha256 = writeConfig(repository, { schema: PLANNING_CONFIG_SCHEMA, exclude: ["reports"] });
    expect(discoverPlanningRoots(repository)).toEqual(["docs/STATUS.md", "misc/tasks", "plans"]);
    // The config file is never itself a root, although `planning.json` is a canonical name.
    expect(discoverPlanningRoots(repository)).not.toContain(PLANNING_CONFIG_PATH);
    expect(auditPlanningRepository(repository).planning_config).toEqual({ path: PLANNING_CONFIG_PATH, sha256 });
  });

  it("proof 2: declared roots replace the heuristic", () => {
    const repository = repo("declared");
    corpus(repository);
    writeConfig(repository, { schema: PLANNING_CONFIG_SCHEMA, roots: ["plans"] });
    expect(discoverPlanningRoots(repository)).toEqual(["plans"]);
    const audit = auditPlanningRepository(repository);
    expect(audit.planningRootCount).toBe(1);
    expect(audit.artifactCount).toBe(1);
  });

  it("proof 3: roots [] declares no planning roots and the audit sees zero artifacts", async () => {
    const repository = repo("empty");
    corpus(repository);
    const sha256 = writeConfig(repository, { schema: PLANNING_CONFIG_SCHEMA, roots: [] });
    expect(discoverPlanningRoots(repository)).toEqual([]);
    const audit = auditPlanningRepository(repository);
    expect(audit).toEqual(expect.objectContaining({ artifactCount: 0, planningRootCount: 0 }));
    const output = capture();
    await runCli(["audit", "planning", repository, "--json"], output.io);
    const json = JSON.parse(output.stdout.join("\n")) as { artifactCount: number; planning_config: unknown };
    expect(json.artifactCount).toBe(0);
    expect(json.planning_config).toEqual({ path: PLANNING_CONFIG_PATH, sha256 });
  });

  describe("proof 4: an invalid config refuses typed, never falls back", () => {
    const cases: ReadonlyArray<readonly [string, unknown, RegExp]> = [
      ["dot-dot", { schema: PLANNING_CONFIG_SCHEMA, roots: ["../x"] }, /"\.\." segment/u],
      ["absolute", { schema: PLANNING_CONFIG_SCHEMA, roots: ["/etc"] }, /absolute path/u],
      ["unknown-key", { schema: PLANNING_CONFIG_SCHEMA, roots: ["plans"], include: ["x"] }, /unknown key/u],
      ["missing-root", { schema: PLANNING_CONFIG_SCHEMA, roots: ["nowhere"] }, /does not exist/u],
      ["root-under-exclude", { schema: PLANNING_CONFIG_SCHEMA, roots: ["reports/x/tasks"], exclude: ["reports"] }, /inside an exclude/u],
      ["malformed-json", "{ not json", /malformed JSON/u],
      ["unknown-schema", { schema: "mister-clean.planning-config/9", roots: ["plans"] }, /unknown schema/u],
      ["non-string", { schema: PLANNING_CONFIG_SCHEMA, exclude: [7] }, /must be a string/u],
      ["harness-root", { schema: PLANNING_CONFIG_SCHEMA, roots: [".claude/commands"] }, /harness-definition/u],
      ["nested-checkout-root", { schema: PLANNING_CONFIG_SCHEMA, roots: ["tmp/wt/plans"] }, /nested checkout/u],
    ];
    it.each(cases)("%s", async (name, config, reason) => {
      const repository = repo(`invalid-${name}`);
      corpus(repository);
      put(repository, ".claude/commands/plan.md");
      put(repository, "tmp/wt/.git", "gitdir: elsewhere\n");
      put(repository, "tmp/wt/plans/ROADMAP.md");
      writeConfig(repository, config);
      let failure: unknown;
      try { discoverPlanningRoots(repository); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(PlanningConfigInvalidError);
      expect(failure).toMatchObject({ code: "planning_config_invalid", path: PLANNING_CONFIG_PATH });
      expect((failure as PlanningConfigInvalidError).reason).toMatch(reason);
      await expect(discoverBundlePlanningRoots(repository, nodeFilePort)).rejects.toBeInstanceOf(PlanningConfigInvalidError);
      const output = capture();
      expect(await runCli(["audit", "planning", repository, "--json"], output.io)).toBe(2);
      expect(JSON.parse(output.stdout.join("\n"))).toMatchObject({ code: "planning_config_invalid", path: PLANNING_CONFIG_PATH });
    });
  });

  describe("proof 5: audit/prepare discovery and bundle discovery agree", () => {
    const fixtures: ReadonlyArray<readonly [string, unknown]> = [
      ["no-config", undefined],
      ["exclude-only", { schema: PLANNING_CONFIG_SCHEMA, exclude: ["reports", "misc"] }],
      ["declared", { schema: PLANNING_CONFIG_SCHEMA, roots: ["plans", "docs/STATUS.md"], exclude: ["reports"] }],
    ];
    it.each(fixtures)("%s", async (name, config) => {
      const repository = repo(`parity-${name}`);
      corpus(repository);
      if (config !== undefined) writeConfig(repository, config);
      const fromRepository = discoverPlanningRoots(repository);
      const fromBundle = [...await discoverBundlePlanningRoots(repository, nodeFilePort)].sort();
      expect(fromBundle).toEqual(fromRepository);
      if (config !== undefined) expect(fromRepository).not.toContain("reports/x/tasks");
    });
  });
});
