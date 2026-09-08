import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { beginAction, finishAction } from "./action-lifecycle.js";
import { nodeProcessPort } from "./action-hygiene.js";
import { validateBundleFile } from "./bundle.js";
import { prepareCloseout } from "./prepare.js";
import { createSemanticPlanV2 } from "./semantic-v2.js";
import {
  discoverSemanticProbeCandidates,
  semanticCandidateSetSha256,
  semanticWorkingTreeSha256,
} from "./semantic.js";
import { mintServerAttestationBinding } from "../runtime-binding.js";

const roots: string[] = [];
const SOURCE_RUNTIME = mintServerAttestationBinding({
  record_type: "mister-clean.runtime-attestation-binding",
  schema_version: "1.0",
  status: "source_development",
  package_root: "/fixture/mister-clean",
  package_root_realpath: "/fixture/mister-clean",
  entrypoint: { path: "./src/cli.ts", realpath: "/fixture/mister-clean/src/cli.ts", sha256: "a".repeat(64) },
  reason: "action lifecycle test source execution",
});

function command(repository: string, executable: string, ...args: string[]): string {
  return execFileSync(executable, args, { cwd: repository, encoding: "utf8" }).trim();
}

function json(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function fixture(name: string): { readonly evidence: string; readonly repo: string } {
  const base = mkdtempSync(join(tmpdir(), `mister-clean-action-${name}-`));
  roots.push(base);
  const repo = join(base, "repo");
  const evidence = join(base, "evidence");
  mkdirSync(join(repo, "planning", "done"), { recursive: true });
  command(repo, "git", "init", "-b", "main");
  command(repo, "git", "config", "user.name", "Action Fixture");
  command(repo, "git", "config", "user.email", "action-fixture.invalid");
  writeFileSync(join(repo, ".gitignore"), "ignored-debris/\n");
  writeFileSync(join(repo, "README.md"), "safe fixture\n");
  writeFileSync(join(repo, "planning", "done", "TASK.md"), [
    "---",
    "artifact_type: task",
    "task_id: TASK",
    "status: done",
    "top_level: true",
    "---",
    "Status: active",
    "",
  ].join("\n"));
  command(repo, "git", "add", ".");
  command(repo, "git", "commit", "-m", "fixture");
  return { evidence, repo };
}

function commit(repository: string, message: string): void {
  command(repository, "git", "add", ".");
  command(repository, "git", "commit", "-m", message);
}

function debtKey(bundleDirectory: string): string {
  const report = json(join(bundleDirectory, "closeout-report.json"));
  const debts = report.completion_debts as Array<Record<string, unknown>>;
  const debt = debts.find((row) => row.class === "body_projection_conflict");
  if (!debt || typeof debt.debt_key !== "string") throw new Error("fixture planning debt was not detected");
  return debt.debt_key;
}

function writeEmptySemanticV2(repository: string, directory: string): {
  readonly packagePath: string;
  readonly policyPath: string;
} {
  const candidates = discoverSemanticProbeCandidates(repository);
  if (candidates.length !== 0) throw new Error("empty lifecycle semantic-v2 fixture unexpectedly discovered candidates");
  const plan = createSemanticPlanV2({
    candidates,
    candidateSetSha256: semanticCandidateSetSha256(candidates),
    challengeNonce: "action-empty-nonce",
    observedAt: "2026-08-28T00:00:00Z",
    repository,
    repositoryObjectSha256: semanticWorkingTreeSha256(repository),
    runId: "action-empty-run",
    runtimeCases: {},
  });
  const packagePath = join(directory, "semantic-evidence-package.json");
  const policyPath = join(directory, "semantic-trust-policy.json");
  writeFileSync(packagePath, `${JSON.stringify({
    record_type: "mister-clean.semantic-evidence-package",
    schema_version: "2.0",
    plan,
    runtime_records: [],
  })}\n`);
  writeFileSync(policyPath, `${JSON.stringify({
    record_type: "mister-clean.semantic-trust-policy",
    schema_version: "1.0",
    policy_id: "action-empty-fixture",
    keys: [],
  })}\n`);
  return { packagePath, policyPath };
}

beforeEach(() => {
  vi.spyOn(nodeProcessPort, "processTable").mockReturnValue([{
    pid: process.pid,
    ppid: 0,
    start_identity: "action-lifecycle-test-process",
    executable: process.execPath,
  }]);
  vi.spyOn(nodeProcessPort, "pathTable").mockReturnValue(
    new Map([[process.pid, { cwd: "/", open_paths: [] }]]),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("public action evidence lifecycle", () => {
  it("freezes the v2 trust policy and package provenance when an action begins", async () => {
    const { evidence, repo } = fixture("semantic-v2-frozen-inputs");
    writeFileSync(join(repo, "planning", "done", "TASK.md"), [
      "---",
      "artifact_type: task",
      "task_id: TASK",
      "status: done",
      "top_level: true",
      "---",
      "Status: done",
      "",
    ].join("\n"));
    writeFileSync(join(repo, "contact.txt"), `${["owner", "example.com"].join("@")}\n`);
    commit(repo, "add public safety debt");
    const semantic = writeEmptySemanticV2(repo, dirname(evidence));
    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "semantic-v2-boundary",
      requestRef: "request-1",
      semanticEvidencePackagePath: semantic.packagePath,
      semanticTrustPolicyPath: semantic.policyPath,
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-28T00:00:00.000Z"),
    });
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));
    const debt = (report.completion_debts as Array<Record<string, unknown>>)
      .find((row) => String(row.class).startsWith("public_safety_"));
    if (typeof debt?.debt_key !== "string") throw new Error("public safety debt was not detected");

    await beginAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "pay-public-safety",
      debtKey: debt.debt_key,
      kind: "local_edit",
      target: "contact.txt",
      purpose: "remove the shippable personal address",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-28T00:05:00.000Z"),
    });
    const lifecycle = json(join(prepared.bundleDirectory, "action-evidence", "pay-public-safety", "lifecycle.json"));
    const policy = lifecycle.frozen_detector_policy as Record<string, unknown>;
    expect(policy.inputs).toEqual({
      semantic_evidence_package: "semantic-evidence-package.json",
      semantic_trust_policy: "semantic-trust-policy.json",
    });
  });

  it("opens a traversable operation and closes only after the targeted debt is paid", async () => {
    const { evidence, repo } = fixture("closed");
    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "boundary",
      requestRef: "request-1",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T10:00:00.000Z"),
    });
    const key = debtKey(prepared.bundleDirectory);

    const opened = await beginAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "pay-planning",
      debtKey: key,
      kind: "local_edit",
      target: "planning/done/TASK.md",
      purpose: "reconcile the lifecycle projection",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T10:05:00.000Z"),
    });
    expect(opened.state).toBe("open");
    expect(existsSync(join(prepared.bundleDirectory, ".mister-clean-action.lock.json"))).toBe(true);
    const openedManifest = json(join(prepared.bundleDirectory, "action-manifest.json"));
    const openedAction = (openedManifest.actions as Array<Record<string, unknown>>).at(-1)!;
    const openedCoordination = openedManifest.coordination as Record<string, unknown>;
    const openedLane = (openedCoordination.lanes as Array<Record<string, unknown>>).at(-1)!;
    expect(openedAction).toMatchObject({
      id: "pay-planning",
      status: "planned",
      before_object: opened.repositoryObject.sha256,
      after_object: null,
      lane_id: "action-pay-planning",
    });
    expect(openedLane).toMatchObject({
      id: "action-pay-planning",
      state: "active",
      write_paths: ["planning/done/TASK.md"],
    });
    await expect(validateBundleFile(prepared.bundlePath, {
      repoPath: repo,
      verifyLive: true,
      runtimeAttestation: SOURCE_RUNTIME,
    })).resolves.toEqual({ errors: [], ok: true });

    writeFileSync(join(repo, "planning", "done", "TASK.md"), [
      "---",
      "artifact_type: task",
      "task_id: TASK",
      "status: done",
      "top_level: true",
      "---",
      "Status: done",
      "",
    ].join("\n"));
    commit(repo, "pay planning debt");

    const closed = await finishAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "pay-planning",
      status: "closed",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T10:10:00.000Z"),
    });
    expect(closed.state).toBe("closed");
    expect(existsSync(join(prepared.bundleDirectory, ".mister-clean-action.lock.json"))).toBe(false);
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));
    const manifest = json(join(prepared.bundleDirectory, "action-manifest.json"));
    const regression = json(join(prepared.bundleDirectory, "regression-delta.json"));
    const finalDebt = (report.completion_debts as Array<Record<string, unknown>>)
      .find((row) => row.debt_key === key);
    const finalAction = (manifest.actions as Array<Record<string, unknown>>).at(-1)!;
    const finalLane = ((manifest.coordination as Record<string, unknown>).lanes as Array<Record<string, unknown>>).at(-1)!;
    const check = (regression.action_checks as Array<Record<string, unknown>>).at(-1)!;
    expect(finalDebt).toMatchObject({ state: "satisfied", origin: { class: "baseline" } });
    expect(finalAction).toMatchObject({
      id: "pay-planning",
      status: "executed",
      after_object: closed.repositoryObject.sha256,
      hygiene_contract: "mister-clean.action-hygiene/1.0",
      action_hygiene: {
        verdict: "NO_HARM",
        violation_count: 0,
      },
    });
    expect(finalLane.state).toBe("integrated");
    expect(check).toMatchObject({
      action_id: "pay-planning",
      boundary_status: "closed",
      open_at_boundary_observation_ids: [],
      action_hygiene: {
        verdict: "NO_HARM",
        violation_count: 0,
      },
    });
    expect(report.verdict).toBe("NOT_CLEAN");
    await expect(validateBundleFile(prepared.bundlePath, {
      repoPath: repo,
      verifyLive: true,
      runtimeAttestation: SOURCE_RUNTIME,
    })).resolves.toEqual({ errors: [], ok: true });

    const hygiene = finalAction.action_hygiene as Record<string, unknown>;
    const beforeRef = hygiene.before_ref as Record<string, string>;
    if (!beforeRef.path) throw new Error("action hygiene before_ref path missing");
    const beforePath = join(prepared.bundleDirectory, beforeRef.path);
    expect(existsSync(beforePath)).toBe(true);
    writeFileSync(beforePath, "{}\n");
    const tampered = await validateBundleFile(prepared.bundlePath, {
      repoPath: repo,
      verifyLive: true,
      runtimeAttestation: SOURCE_RUNTIME,
    });
    expect(tampered.ok).toBe(false);
    expect(tampered.errors).toContainEqual(expect.stringMatching(/hygiene\.before_ref.*digest mismatch/i));
  }, 25_000);

  it("opens a second action without invalidating the first terminal action history", async () => {
    const { evidence, repo } = fixture("sequential-actions");
    writeFileSync(join(repo, "obsolete.txt"), `contact=${"person"}@${"example.org"}\n`);
    commit(repo, "add second independent debt");
    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "boundary",
      requestRef: "request-1",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T10:40:00.000Z"),
    });
    const planningKey = debtKey(prepared.bundleDirectory);
    const initialReport = json(join(prepared.bundleDirectory, "closeout-report.json"));
    const publicDebt = (initialReport.completion_debts as Array<Record<string, unknown>>)
      .find((row) => String(row.class).startsWith("public_safety_"));
    if (!publicDebt || typeof publicDebt.debt_key !== "string") throw new Error("fixture public-safety debt was not detected");

    await beginAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "pay-planning-first",
      debtKey: planningKey,
      kind: "local_edit",
      target: "planning/done/TASK.md",
      purpose: "pay the first independent debt",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T10:45:00.000Z"),
    });
    writeFileSync(join(repo, "planning", "done", "TASK.md"), [
      "---", "artifact_type: task", "task_id: TASK", "status: done", "top_level: true", "---", "Status: done", "",
    ].join("\n"));
    commit(repo, "pay first independent debt");
    await finishAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "pay-planning-first",
      status: "closed",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T10:50:00.000Z"),
    });

    await beginAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "pay-public-second",
      debtKey: publicDebt.debt_key,
      kind: "recoverable_delete",
      target: "obsolete.txt",
      purpose: "pay the second independent debt",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T10:55:00.000Z"),
    });
    const manifest = json(join(prepared.bundleDirectory, "action-manifest.json"));
    expect(manifest.execution_state).toBe("authorized");
    expect((manifest.actions as Array<Record<string, unknown>>).map((action) => action.status))
      .toEqual(["executed", "planned"]);
    await expect(validateBundleFile(prepared.bundlePath, {
      repoPath: repo,
      verifyLive: true,
      runtimeAttestation: SOURCE_RUNTIME,
    })).resolves.toEqual({ errors: [], ok: true });

    rmSync(join(repo, "obsolete.txt"));
    commit(repo, "pay second independent debt");
    await finishAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "pay-public-second",
      status: "closed",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T11:00:00.000Z"),
    });
    const terminalManifest = json(join(prepared.bundleDirectory, "action-manifest.json"));
    const terminalRegression = json(join(prepared.bundleDirectory, "regression-delta.json"));
    expect(terminalManifest.execution_state).toBe("executed");
    expect((terminalManifest.actions as Array<Record<string, unknown>>).map((action) => action.status))
      .toEqual(["executed", "executed"]);
    expect((terminalRegression.action_checks as Array<Record<string, unknown>>).map((check) => check.action_id))
      .toEqual(["pay-planning-first", "pay-public-second"]);
    await expect(validateBundleFile(prepared.bundlePath, {
      repoPath: repo,
      verifyLive: true,
      runtimeAttestation: SOURCE_RUNTIME,
    })).resolves.toEqual({ errors: [], ok: true });
  }, 35_000);

  it("refuses a terminal boundary that paid its target but added ignored debris", async () => {
    const { evidence, repo } = fixture("ignored-debris");
    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "boundary",
      requestRef: "request-1",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T10:20:00.000Z"),
    });
    const key = debtKey(prepared.bundleDirectory);
    await beginAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "pay-with-debris",
      debtKey: key,
      kind: "local_edit",
      target: "planning/done/TASK.md",
      purpose: "pay the planning debt without hiding residue",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T10:25:00.000Z"),
    });
    writeFileSync(join(repo, "planning", "done", "TASK.md"), [
      "---",
      "artifact_type: task",
      "task_id: TASK",
      "status: done",
      "top_level: true",
      "---",
      "Status: done",
      "",
    ].join("\n"));
    commit(repo, "pay planning debt");
    mkdirSync(join(repo, "ignored-debris"));
    writeFileSync(join(repo, "ignored-debris", "left-behind.log"), "residue\n");

    await expect(finishAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "pay-with-debris",
      status: "closed",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T10:30:00.000Z"),
    })).rejects.toThrow(/cleanup-created debt: ignored_path_added/i);
    expect(existsSync(join(prepared.bundleDirectory, ".mister-clean-action.lock.json"))).toBe(true);

    rmSync(join(repo, "ignored-debris"), { recursive: true, force: true });
    const closed = await finishAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "pay-with-debris",
      status: "closed",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T10:35:00.000Z"),
    });
    expect(closed.state).toBe("closed");
    await expect(validateBundleFile(prepared.bundlePath, {
      repoPath: repo,
      verifyLive: true,
      runtimeAttestation: SOURCE_RUNTIME,
    })).resolves.toEqual({ errors: [], ok: true });
  }, 35_000);

  it("refuses a harmful close and preserves the interrupted action as the final NOT_CLEAN boundary", async () => {
    const { evidence, repo } = fixture("interrupted");
    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "boundary",
      requestRef: "request-1",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T11:00:00.000Z"),
    });
    const key = debtKey(prepared.bundleDirectory);
    await beginAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "harmful-attempt",
      debtKey: key,
      kind: "local_edit",
      target: "repository",
      purpose: "pay the planning debt without creating public-safety debt",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T11:05:00.000Z"),
    });
    writeFileSync(join(repo, "planning", "done", "TASK.md"), [
      "---",
      "artifact_type: task",
      "task_id: TASK",
      "status: done",
      "top_level: true",
      "---",
      "Status: done",
      "",
    ].join("\n"));
    writeFileSync(join(repo, "README.md"), `contact=${"person"}@${"example.org"}\n`);
    commit(repo, "pay one debt but introduce another");

    await expect(finishAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "harmful-attempt",
      status: "closed",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T11:10:00.000Z"),
    })).rejects.toThrow(/closed action refused: 1 action-introduced observation/i);
    expect(existsSync(join(prepared.bundleDirectory, ".mister-clean-action.lock.json"))).toBe(true);
    expect((json(join(prepared.bundleDirectory, "action-manifest.json")).actions as Array<Record<string, unknown>>).at(-1))
      .toMatchObject({ id: "harmful-attempt", status: "planned" });

    const interrupted = await finishAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "harmful-attempt",
      status: "interrupted",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T11:15:00.000Z"),
    });
    expect(interrupted.state).toBe("interrupted");
    expect(existsSync(join(prepared.bundleDirectory, ".mister-clean-action.lock.json"))).toBe(false);
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));
    const manifest = json(join(prepared.bundleDirectory, "action-manifest.json"));
    const regression = json(join(prepared.bundleDirectory, "regression-delta.json"));
    const publicDebt = (report.completion_debts as Array<Record<string, unknown>>)
      .find((row) => String(row.class).startsWith("public_safety_"));
    const finalAction = (manifest.actions as Array<Record<string, unknown>>).at(-1)!;
    const finalLane = ((manifest.coordination as Record<string, unknown>).lanes as Array<Record<string, unknown>>).at(-1)!;
    const check = (regression.action_checks as Array<Record<string, unknown>>).at(-1)!;
    expect(publicDebt).toMatchObject({
      state: "open",
      origin: {
        class: "introduced_by_run",
        action_id: "harmful-attempt",
        observation_evidence_ref: {
          path: expect.stringContaining("action-comparators/public_safety-after.json"),
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      },
    });
    expect(finalAction).toMatchObject({ id: "harmful-attempt", status: "failed" });
    expect(manifest.execution_state).toBe("executed");
    expect(finalAction.outcome).toMatchObject({
      state: "verified",
      evidence: [{
        kind: "git_change",
        result: expect.stringContaining("interrupted"),
        evidence_ref: { path: expect.any(String), sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
      }],
    });
    expect(finalLane.state).toBe("blocked");
    expect(check).toMatchObject({
      action_id: "harmful-attempt",
      boundary_status: "interrupted",
      open_at_boundary_observation_ids: [expect.stringMatching(/^[0-9a-f]{64}$/)],
    });
    expect(report.verdict).toBe("NOT_CLEAN");
    await expect(validateBundleFile(prepared.bundlePath, {
      repoPath: repo,
      verifyLive: true,
      runtimeAttestation: SOURCE_RUNTIME,
    })).resolves.toEqual({ errors: [], ok: true });
    if (!publicDebt || typeof publicDebt.debt_key !== "string") throw new Error("introduced public debt was not detected");
    await expect(beginAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "forbidden-after-interruption",
      debtKey: publicDebt.debt_key,
      kind: "local_edit",
      target: "README.md",
      purpose: "prove interruption is terminal",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T11:20:00.000Z"),
    })).rejects.toThrow(/interrupted action is terminal and must remain the final action/i);
  }, 25_000);

  it("keeps detector scope frozen while allowing an action to remove a tracked debt-bearing file", async () => {
    const { evidence, repo } = fixture("tracked-cardinality");
    writeFileSync(join(repo, "obsolete.txt"), `contact=${"person"}@${"example.org"}\n`);
    commit(repo, "add obsolete unsafe file");
    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "boundary",
      requestRef: "request-1",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T12:00:00.000Z"),
    });
    const initialReport = json(join(prepared.bundleDirectory, "closeout-report.json"));
    const publicDebt = (initialReport.completion_debts as Array<Record<string, unknown>>)
      .find((row) => String(row.class).startsWith("public_safety_"));
    if (!publicDebt || typeof publicDebt.debt_key !== "string") throw new Error("fixture public-safety debt was not detected");

    await beginAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "remove-obsolete",
      debtKey: publicDebt.debt_key,
      kind: "recoverable_delete",
      target: "obsolete.txt",
      purpose: "remove an obsolete debt-bearing public file",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T12:05:00.000Z"),
    });
    rmSync(join(repo, "obsolete.txt"));
    commit(repo, "remove obsolete unsafe file");
    const closed = await finishAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "remove-obsolete",
      status: "closed",
      runtimeAttestation: SOURCE_RUNTIME,
      now: () => new Date("2026-08-26T12:10:00.000Z"),
    });
    expect(closed.state).toBe("closed");
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));
    const finalPublicDebt = (report.completion_debts as Array<Record<string, unknown>>)
      .find((row) => row.debt_key === publicDebt.debt_key);
    expect(finalPublicDebt).toMatchObject({ state: "satisfied", origin: { class: "baseline" } });
    await expect(validateBundleFile(prepared.bundlePath, {
      repoPath: repo,
      verifyLive: true,
      runtimeAttestation: SOURCE_RUNTIME,
    })).resolves.toEqual({ errors: [], ok: true });
  }, 25_000);
});
