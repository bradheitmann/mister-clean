import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverPlanningRoots } from "./repository.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("discoverPlanningRoots", () => {
  it("discovers a planning root below more than five directory levels", () => {
    const repository = mkdtempSync(join(tmpdir(), "mister-clean-deep-planning-"));
    roots.push(repository);
    const planningRoot = "one/two/three/four/five/six/planning";
    mkdirSync(join(repository, ...planningRoot.split("/"), "backlog"), { recursive: true });

    expect(discoverPlanningRoots(repository)).toEqual([planningRoot]);
  });

  it("discovers canonical planning files as exact roots without promoting their directory", () => {
    const repository = mkdtempSync(join(tmpdir(), "mister-clean-file-planning-"));
    roots.push(repository);
    mkdirSync(join(repository, "docs"));
    writeFileSync(join(repository, "docs", "ROADMAP.md"), "# Roadmap\n");
    writeFileSync(join(repository, "docs", "STATUS.md"), "# Status\n");
    writeFileSync(join(repository, "docs", "architecture.md"), "# Architecture\n");

    expect(discoverPlanningRoots(repository)).toEqual(["docs/ROADMAP.md", "docs/STATUS.md"]);
  });

  it("does not mistake source files with planning-like stems for planning documents", () => {
    const repository = mkdtempSync(join(tmpdir(), "mister-clean-source-stems-"));
    roots.push(repository);
    mkdirSync(join(repository, "src", "closeout"), { recursive: true });
    writeFileSync(join(repository, "src", "closeout", "planning.ts"), "export const planning = true;\n");
    writeFileSync(join(repository, "src", "closeout", "status.ts"), "export const status = 'ready';\n");
    writeFileSync(join(repository, "src", "closeout", "plan.py"), "plan = True\n");
    writeFileSync(join(repository, "src", "closeout", "roadmap.sh"), "#!/bin/sh\n");
    writeFileSync(join(repository, "src", "closeout", "CURRENT-STATE.md"), "# Current State\n");

    expect(discoverPlanningRoots(repository)).toEqual([]);
  });
});
