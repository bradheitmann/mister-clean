import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverPlanningRoots, isCanonicalPlanningFileName, isHarnessDefinitionPath } from "./repository.js";
import { auditPlanningRepository } from "./planning.js";
import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";

const roots: string[] = [];

function scratch(name: string): string {
  const base = mkdtempSync(join(tmpdir(), `mister-clean-planning-roots-${name}-`));
  roots.push(base);
  return base;
}

function put(repository: string, path: string, content = "x\n"): void {
  const absolute = join(repository, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("planning root discovery", () => {
  it("does not promote a harness definition file to a planning root", () => {
    const base = scratch("harness");
    const repository = join(base, "repo");
    createFixtureRepository(repository);
    // Harness definition files are named exactly like planning inputs.
    put(repository, ".claude/commands/plan.md");
    put(repository, ".claude/skills/cleaner/SKILL.md");
    put(repository, ".claude/agents/reviewer.md");
    put(repository, ".agents/skills/planner/SKILL.md");
    put(repository, ".codex/prompts/requirements.md");
    put(repository, ".cursor/rules/roadmap.md");
    put(repository, ".opencode/status.md");
    put(repository, ".pi/todo.md");
    // One real corpus.
    put(repository, "planning/backlog/next.md");

    expect(isCanonicalPlanningFileName(".claude/commands/plan.md")).toBe(true);
    for (const path of [
      ".claude/commands/plan.md",
      ".claude/skills/cleaner/SKILL.md",
      ".agents/skills/planner/SKILL.md",
      ".codex/prompts/requirements.md",
      ".cursor/rules/roadmap.md",
      ".opencode/status.md",
      ".pi/todo.md",
    ]) {
      expect(isHarnessDefinitionPath(path)).toBe(true);
    }
    expect(isHarnessDefinitionPath("planning/backlog/next.md")).toBe(false);
    expect(discoverPlanningRoots(repository)).toEqual(["planning"]);
  });

  it("keeps discovering an ignored local planning corpus", () => {
    const base = scratch("ignored-corpus");
    const repository = join(base, "repo");
    createFixtureRepository(repository);
    put(repository, ".gitignore", "local-corpora/\n");
    put(repository, "planning/backlog/next.md");
    put(repository, "local-corpora/legacy/planning/status.md");
    execFileSync("git", ["add", ".gitignore", "planning"], { cwd: repository, stdio: "pipe" });
    execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture.invalid", "commit", "-qm", "fixture"], {
      cwd: repository,
      stdio: "pipe",
    });
    expect(execFileSync("git", ["status", "--porcelain", "--ignored"], { cwd: repository, encoding: "utf8" }))
      .toContain("!! local-corpora/");

    expect(discoverPlanningRoots(repository).sort()).toEqual(["local-corpora/legacy/planning", "planning"]);
  });
});

describe("planning root discovery in a workspace with nested agent worktrees", () => {
  it("does not descend into a harness worktree's own planning trees", async () => {
    const base = scratch("nested-worktrees");
    const repository = join(base, "repo");
    createFixtureRepository(repository);
    put(repository, "plans/ROADMAP.md");
    // A nested checkout of the same repository, exactly as a harness keeps them.
    for (const worktree of [".claude/worktrees/agent-a", ".codex/worktrees/agent-b", ".agents/worktrees/agent-c"]) {
      put(repository, `${worktree}/plans/ROADMAP.md`);
      put(repository, `${worktree}/reports/lane/tasks/TASK-1.md`);
      put(repository, `${worktree}/docs/PRIMER.md`);
    }
    for (const path of [".claude/worktrees/agent-a/plans", ".claude/worktrees/agent-a/reports/lane/tasks"]) {
      expect(isHarnessDefinitionPath(path)).toBe(true);
    }
    expect(isHarnessDefinitionPath("plans")).toBe(false);

    const roots = discoverPlanningRoots(repository);
    expect(roots).toContain("plans");
    expect(roots.some((root) => root.startsWith(".claude/worktrees")
      || root.startsWith(".codex/worktrees")
      || root.startsWith(".agents/worktrees"))).toBe(false);
  });

  it("keeps a nested worktree corpus out of the audited artifact set", { timeout: 120_000 }, async () => {
    const base = scratch("nested-worktrees-audit");
    const repository = join(base, "repo");
    createFixtureRepository(repository);
    put(repository, "plans/ROADMAP.md", "# Roadmap\n\nOne slice.\n");
    // 200 artifacts inside a nested worktree: before the exclusion these were
    // walked and retained (measured: 2.39 B characters on a real workspace).
    for (let index = 0; index < 200; index += 1) {
      put(repository, `.claude/worktrees/agent-a/plans/slice-${String(index)}.md`, `# Slice ${String(index)}\n`);
    }
    fixtureCommit(repository, "nested worktrees");

    const result = auditPlanningRepository(repository);
    expect(result.planningRootCount).toBeLessThanOrEqual(1);
    expect(result.artifactCount).toBeLessThan(200);
  });
});
