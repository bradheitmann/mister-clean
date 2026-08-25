import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { prepareCloseout } from "./prepare.js";
import { validateBundleFile } from "./bundle.js";

const roots: string[] = [];

function command(cwd: string, executable: string, ...args: string[]): string {
  return execFileSync(executable, args, { cwd, encoding: "utf8" }).trim();
}

function fixture(name: string): { base: string; evidence: string; repo: string } {
  const base = mkdtempSync(join(tmpdir(), `mister-clean-prepare-${name}-`));
  roots.push(base);
  const repo = join(base, "repo");
  const evidence = join(base, "evidence");
  mkdirSync(repo);
  command(repo, "git", "init", "-b", "main");
  command(repo, "git", "config", "user.name", "Fixture");
  command(repo, "git", "config", "user.email", "fixture.invalid");
  return { base, evidence, repo };
}

function commit(repository: string, message = "fixture"): void {
  command(repository, "git", "add", ".");
  command(repository, "git", "commit", "-m", message);
}

function json(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("prepareCloseout", () => {
  it("copies exact operative request bytes and remains honestly NOT_CLEAN", () => {
    const { evidence, repo } = fixture("request");
    writeFileSync(join(repo, "README.md"), "fixture\n");
    commit(repo);
    const invocation = "$mister-clean\nClose this repository for the next team.";

    const prepared = prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "exact",
      requestRef: "request-1",
      requestText: invocation,
      now: () => new Date("2026-08-25T12:00:00.000Z"),
    });
    const bundle = json(prepared.bundlePath);
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));
    expect((bundle.criteria_discovery as Record<string, unknown>).source_kind).toBe("exact_bytes");
    expect(readFileSync(join(prepared.bundleDirectory, "operative-request.txt"), "utf8")).toBe(invocation);
    expect(report.verdict).toBe("NOT_CLEAN");
  });

  it("captures planning and a candidate current-state entrypoint", () => {
    const { evidence, repo } = fixture("planning");
    mkdirSync(join(repo, "planning", "done"), { recursive: true });
    writeFileSync(join(repo, "planning", "done", "x.md"), "done\n");
    writeFileSync(join(repo, "CURRENT-STATE.md"), "Ready to inspect.\n");
    commit(repo);

    const prepared = prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "run-1",
      requestRef: "request-1",
      criteria: ["criterion-1", "criterion-1"],
    });
    const bundle = json(prepared.bundlePath);
    const readiness = bundle.successor_readiness as Record<string, unknown>;
    const currentState = readiness.current_state as Record<string, unknown>;
    const planning = bundle.planning_discovery as Record<string, unknown>;
    const systems = planning.systems as Array<Record<string, unknown>>;
    expect(currentState.state).toBe("candidate_unverified");
    expect(currentState.path).toBe("CURRENT-STATE.md");
    expect((bundle.criteria_discovery as Record<string, unknown>).criteria_ids).toEqual(["criterion-1"]);
    expect(systems).toHaveLength(1);
    expect(systems[0]?.id).toBe("repository-planning-1");
    expect(planning.unknown).toBe(true);
    const corpus = systems[0]?.corpus as Record<string, unknown>;
    expect(corpus.unclassified).toBe(1);
  });

  it("captures a canonical planning file as an exact repo-files root", () => {
    const { evidence, repo } = fixture("roadmap-file");
    mkdirSync(join(repo, "docs"));
    writeFileSync(join(repo, "docs", "ROADMAP.md"), "# Roadmap\n\nAcceptance remains pending.\n");
    writeFileSync(join(repo, "docs", "architecture.md"), "# Architecture\n");
    commit(repo);

    const prepared = prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "roadmap-file",
      requestRef: "request-1",
    });
    const bundle = json(prepared.bundlePath);
    const planning = bundle.planning_discovery as Record<string, unknown>;
    const systems = planning.systems as Array<Record<string, unknown>>;
    expect(systems).toHaveLength(1);
    expect(systems[0]?.kind).toBe("repo_files");
    expect(systems[0]?.sources).toEqual(["docs/ROADMAP.md"]);
    const corpus = systems[0]?.corpus as Record<string, unknown>;
    expect((corpus.artifacts as Array<Record<string, unknown>>).map((item) => item.path)).toEqual([
      "docs/ROADMAP.md",
    ]);
    expect(corpus.unclassified).toBe(1);
  });

  it("treats a missing current-state document as payable scaffold state", () => {
    const { evidence, repo } = fixture("missing");
    writeFileSync(join(repo, "source.txt"), "source\n");
    commit(repo);

    const prepared = prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "missing",
      requestRef: "request-1",
    });
    const bundle = json(prepared.bundlePath);
    const readiness = bundle.successor_readiness as Record<string, unknown>;
    const currentState = readiness.current_state as Record<string, unknown>;
    const handoff = readiness.handoff as Record<string, unknown>;
    expect(currentState.state).toBe("missing");
    expect(handoff.entrypoints).toEqual([]);
  });

  it("refuses to overwrite an existing run", () => {
    const { evidence, repo } = fixture("collision");
    writeFileSync(join(repo, "README.md"), "fixture\n");
    commit(repo);
    const options = { repo, evidenceHome: evidence, runId: "same", requestRef: "request-1" };
    prepareCloseout(options);
    expect(() => prepareCloseout(options)).toThrow(/refusing to overwrite/);
  });

  it("produces a scaffold accepted by the TypeScript live validator", async () => {
    const { evidence, repo } = fixture("integration");
    writeFileSync(join(repo, "README.md"), "fixture\n");
    commit(repo);
    const prepared = prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "integration",
      requestRef: "request-1",
      requestText: "$mister-clean",
    });
    await expect(validateBundleFile(prepared.bundlePath, { repoPath: repo })).resolves.toEqual({
      errors: [],
      ok: true,
    });
  });

  it("produces a live-valid scaffold when planning debt is present", async () => {
    const { evidence, repo } = fixture("planning-debt-integration");
    mkdirSync(join(repo, "planning"));
    writeFileSync(join(repo, "planning", "backlog.md"), "# Backlog\n\nEventually implement the feature.\n");
    commit(repo);
    const prepared = prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "planning-debt-integration",
      requestRef: "request-1",
      requestText: "$mister-clean",
    });
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));
    expect((report.completion_debts as unknown[]).length).toBeGreaterThan(0);
    await expect(validateBundleFile(prepared.bundlePath, { repoPath: repo })).resolves.toEqual({
      errors: [],
      ok: true,
    });
  });
});
