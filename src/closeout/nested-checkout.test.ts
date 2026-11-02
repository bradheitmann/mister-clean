import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { nodeFilePort } from "./bundle-runtime.js";
import { auditPlanningRepository } from "./planning.js";
import { discoverPlanningRoots, isNestedCheckout, listEntriesRecursively } from "./repository.js";
import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";

const roots: string[] = [];

function scratch(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `mister-clean-nested-checkout-${name}-`));
  roots.push(root);
  return root;
}

function put(repository: string, path: string, content = "x\n"): void {
  const absolute = join(repository, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A worktree writes `.git` as a file; a clone keeps it as a directory. */
function nestedCheckouts(repository: string): void {
  put(repository, "tmp/wt/.git", "gitdir: /elsewhere/worktrees/wt\n");
  put(repository, "tmp/wt/tasks/TASK-1.md");
  put(repository, "tmp/wt/plans/ROADMAP.md");
  put(repository, "tmp/clone/.git/HEAD", "ref: refs/heads/main\n");
  put(repository, "tmp/clone/tasks/TASK-2.md");
  put(repository, "tmp/clone/plans/ROADMAP.md");
  put(repository, "tmp/notes/tasks/TASK-3.md");
}

describe("one nested-checkout rule for every walker", () => {
  it("keeps nested checkouts out of the file walk the bundle validator uses", async () => {
    const repository = join(scratch("walk"), "repo");
    createFixtureRepository(repository);
    nestedCheckouts(repository);

    const rows = await nodeFilePort.walk(repository);
    const paths = rows.map((row) => row.relative);
    expect(paths).toContain("tmp/wt");
    expect(paths).not.toContain("tmp/wt/tasks/TASK-1.md");
    expect(paths).not.toContain("tmp/wt/plans/ROADMAP.md");
    expect(paths).not.toContain("tmp/clone/tasks/TASK-2.md");
    // Near-miss control: no `.git`, so it is this repository's own content.
    expect(paths).toContain("tmp/notes/tasks/TASK-3.md");
  });

  it("keeps nested checkouts out of the listing walk used for planning roots", () => {
    const repository = join(scratch("listing"), "repo");
    createFixtureRepository(repository);
    nestedCheckouts(repository);
    put(repository, "plans/ROADMAP.md");

    const listed = listEntriesRecursively(repository).map((entry) => entry.path.split(repository + "/")[1]);
    expect(listed).toContain("plans/ROADMAP.md");
    expect(listed.some((path) => path?.startsWith("tmp/wt/") || path?.startsWith("tmp/clone/"))).toBe(false);
    expect(listed).toContain("tmp/notes/tasks/TASK-3.md");
    expect(discoverPlanningRoots(repository)).toContain("tmp/notes/tasks");
  });

  it("does not read a clone that sits inside a documentation directory", () => {
    const repository = join(scratch("docs-clone"), "repo");
    createFixtureRepository(repository);
    put(repository, "plans/ROADMAP.md", "# Roadmap\n\nOne slice.\n");
    // A vendored clone under docs/, carrying an active-implementation document
    // that the planning-candidate scan would otherwise read in full.
    put(repository, "docs/vendor-repo/.git/HEAD", "ref: refs/heads/main\n");
    put(
      repository,
      "docs/vendor-repo/HANDOFF.md",
      "status: active implementation\n\n## Implementation plan\n\n1. do the vendored thing\n",
    );
    fixtureCommit(repository, "docs clone");

    const result = auditPlanningRepository(repository);
    const paths = JSON.stringify(result.findings) + JSON.stringify(result.raw_findings ?? []);
    expect(paths).not.toContain("docs/vendor-repo/HANDOFF.md");
  });

  it("still walks a root that is itself a worktree", () => {
    const base = scratch("root-worktree");
    const repository = join(base, "repo");
    createFixtureRepository(repository);
    put(repository, "plans/ROADMAP.md");
    put(repository, "tmp/wt/.git", "gitdir: /elsewhere/worktrees/wt\n");
    put(repository, "tmp/wt/tasks/TASK-1.md");
    // The root carries its own `.git` (a directory here, a file in a linked
    // worktree): the rule must never skip the root itself.
    expect(isNestedCheckout(repository, repository)).toBe(false);
    expect(isNestedCheckout(repository, join(repository, "tmp/wt"))).toBe(true);
    expect(discoverPlanningRoots(repository)).toContain("plans");
  });
});
