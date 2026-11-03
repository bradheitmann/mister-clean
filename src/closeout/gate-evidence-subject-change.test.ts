import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";

const injected = vi.hoisted(() => ({ changeSubject: false }));
vi.mock("./native-gates.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./native-gates.js")>();
  return {
    ...original,
    // The snapshot step fails; when asked, the subject changes first, as it did
    // when lanes were cut in the subject during the self-clean cycle-1 prepare.
    createExecutionSnapshot: async (subject: string) => {
      if (injected.changeSubject) {
        execFileSync("git", ["branch", "lane-cut-during-the-run"], { cwd: subject, stdio: "ignore" });
      }
      throw new Error("injected snapshot failure");
    },
  };
});

const { discoverNativeGates, captureSubjectState } = await import("./native-gates.js");
const { blockedExecution, runNativeGates } = await import("./native-gate-runner.js");
const { validateNativeGateCoverage } = await import("./native-gate-validation.js");
const { captureRepositoryObject } = await import("./repository-object.js");

const roots: string[] = [];

function gatedRepository(): { evidence: string; repo: string } {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-gate-evidence-"));
  roots.push(root);
  const repo = join(root, "repo");
  createFixtureRepository(repo, { identity: { name: "Gate Evidence Fixture", email: "gate-evidence.invalid" } });
  writeFileSync(join(repo, "package.json"), `${JSON.stringify({
    name: "gate-evidence-fixture",
    private: true,
    packageManager: "bun@1.0.0",
    scripts: { test: "bun --version" },
  }, null, 2)}\n`);
  writeFileSync(join(repo, "bun.lock"), "fixture lock\n");
  fixtureCommit(repo, "fixture");
  return { evidence: join(root, "evidence"), repo };
}

async function runWithInjectedSnapshotFailure(changeSubject: boolean) {
  const { evidence, repo } = gatedRepository();
  const object = captureRepositoryObject(repo);
  const discovery = discoverNativeGates(repo, object);
  expect(discovery.required_gate_ids.length).toBe(1);
  injected.changeSubject = changeSubject;
  const coverage = await runNativeGates(repo, discovery, evidence, { timeout_ms: 30_000 });
  const execution = coverage.executions[0]!;
  const errors = await validateNativeGateCoverage(coverage, discovery, object, evidence);
  const stderr = readFileSync(join(evidence, execution.stderr_ref.path), "utf8");
  return { errors, execution, stderr };
}

afterEach(() => {
  injected.changeSubject = false;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("gate evidence when the subject changes while a gate is prepared", () => {
  it("snapshot: a subject change during a failed snapshot is recorded as subject_repository_changed and validates", async () => {
    const { errors, execution, stderr } = await runWithInjectedSnapshotFailure(true);
    expect(execution.failure_reason).toBe("subject_repository_changed");
    expect(execution.state).toBe("blocked");
    expect(stderr).toContain("superseded reason: snapshot_unavailable");
    expect(stderr).toContain("injected snapshot failure");
    expect(errors.filter((error) => error.includes("disagrees with failure_reason"))).toEqual([]);
  });

  it("unchanged: a failed snapshot with an unchanged subject keeps snapshot_unavailable", async () => {
    const { errors, execution } = await runWithInjectedSnapshotFailure(false);
    expect(execution.failure_reason).toBe("snapshot_unavailable");
    expect(errors.filter((error) => error.includes("disagrees with failure_reason"))).toEqual([]);
  });

  it("skip: an operator skip during which the subject changed is blocked, not skipped", async () => {
    const { evidence, repo } = gatedRepository();
    const object = captureRepositoryObject(repo);
    const gate = discoverNativeGates(repo, object).gates.find((candidate) => "command" in candidate && candidate.command);
    if (!gate || !("command" in gate) || !gate.command) throw new Error("fixture has no runnable gate");
    const start = captureSubjectState(repo);
    execFileSync("git", ["branch", "changed-during-skip"], { cwd: repo, stdio: "ignore" });
    const end = captureSubjectState(repo);
    mkdirSync(evidence, { recursive: true });
    const execution = await blockedExecution(
      gate as Parameters<typeof blockedExecution>[0],
      "operator_skip",
      object,
      evidence,
      () => new Date(),
      start,
      end,
      null,
      null,
      "skipped",
    );
    expect(execution.state).toBe("blocked");
    expect(execution.failure_reason).toBe("subject_repository_changed");
  });
});
