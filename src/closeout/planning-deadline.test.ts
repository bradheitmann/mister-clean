import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PlanningAuditTimeout, auditPlanningRepository } from "./planning.js";
import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";

const roots: string[] = [];

function scratch(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `mister-clean-planning-deadline-${name}-`));
  roots.push(root);
  return root;
}

function put(repository: string, path: string, content: string): void {
  const absolute = join(repository, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

function corpus(name: string, artifacts: number): string {
  const root = join(scratch(name), "repo");
  createFixtureRepository(root);
  put(root, "CURRENT.md", "# Current state\n\nEverything is represented.\n");
  for (let index = 0; index < artifacts; index += 1) {
    put(root, `planning/backlog/slice-${String(index).padStart(3, "0")}.md`, [
      "---",
      "artifact_type: slice",
      `slice_id: DEV-${String(index)}`,
      "status: To Do",
      "---",
      `Body ${String(index)}`,
      "",
    ].join("\n"));
  }
  fixtureCommit(root, "corpus");
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("audit planning deadline", () => {
  it("returns a typed partial naming what it covered when the deadline trips", () => {
    const repository = corpus("timeout", 40);
    // Injected clock: the first reading starts the run, every later reading is
    // a full second later, so the deadline trips on the second entry.
    let ticks = 0;
    const now = (): number => {
      const value = ticks * 1_000;
      ticks += 1;
      return value;
    };
    let failure: unknown;
    try {
      auditPlanningRepository(repository, { deadline_ms: 250, now });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(PlanningAuditTimeout);
    const partial = (failure as PlanningAuditTimeout).partial;
    expect(partial.status).toBe("timeout");
    expect(partial.deadline_ms).toBe(250);
    expect(partial.elapsed_ms).toBeGreaterThan(250);
    expect(partial.covered.planning_roots).toContain("planning");
    expect(partial.pending_count).toBeGreaterThan(0);
    expect(partial.covered.artifacts.length + partial.pending_count).toBeGreaterThanOrEqual(40);
  });

  it("runs to completion when no deadline is given", () => {
    const repository = corpus("complete", 5);
    const result = auditPlanningRepository(repository);
    expect(result.artifactCount).toBeGreaterThanOrEqual(1);
    expect(result.status === "pass" || result.status === "fail").toBe(true);
  });

  it("prints the typed partial through the CLI and exits nonzero", () => {
    const repository = corpus("cli", 400);
    const result = spawnSync("bun", [
      join(process.cwd(), "src", "cli.ts"),
      "audit",
      "planning",
      repository,
      "--deadline-ms",
      "1",
      "--json",
    ], {
      encoding: "utf8",
      env: { ...process.env, MISTER_CLEAN_SOURCE_DEVELOPMENT: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual(expect.objectContaining({
      status: "timeout",
      record_type: "mister-clean.planning-audit-partial",
    }));
  }, 120_000);
});
