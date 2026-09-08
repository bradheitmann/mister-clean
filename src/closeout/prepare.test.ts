import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  prepareCloseout as prepareCloseoutBound,
  type PrepareCloseoutOptions,
} from "./prepare.js";
import { validateBundleFile } from "./bundle.js";
import { validateReport } from "./records.js";
import { captureRepositoryObject } from "./repository-object.js";
import { createSemanticPlanV2 } from "./semantic-v2.js";
import {
  discoverSemanticProbeCandidates,
  semanticCandidateSetSha256,
  semanticWorkingTreeSha256,
} from "./semantic.js";
import type { ActionHygieneProcessPort } from "./action-hygiene.js";
import {
  ExecutionResourceBusyError,
  acquireRepositoryVerificationLease,
} from "./execution-lease.js";
import { mintServerAttestationBinding } from "../runtime-binding.js";

const roots: string[] = [];
const SOURCE_RUNTIME = mintServerAttestationBinding({
  record_type: "mister-clean.runtime-attestation-binding",
  schema_version: "1.0",
  status: "source_development",
  package_root: "/fixture/mister-clean",
  package_root_realpath: "/fixture/mister-clean",
  entrypoint: { path: "./src/cli.ts", realpath: "/fixture/mister-clean/src/cli.ts", sha256: "a".repeat(64) },
  reason: "prepare test source execution",
});

const TEST_PROCESS_PORT: ActionHygieneProcessPort = {
  processTable: () => [{
    pid: process.pid,
    ppid: 0,
    start_identity: "prepare-test-process",
    executable: process.execPath,
  }],
  pathTable: () => new Map([[process.pid, { cwd: "/", open_paths: [] }]]),
};

function prepareCloseout(options: Omit<PrepareCloseoutOptions, "runtimeAttestation">) {
  return prepareCloseoutBound({ ...options, processPort: options.processPort ?? TEST_PROCESS_PORT, runtimeAttestation: SOURCE_RUNTIME });
}

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

function writeDirectSemanticV2(
  repository: string,
  directory: string,
  trustPolicy: string,
): { readonly packagePath: string; readonly policyPath: string } {
  const candidates = discoverSemanticProbeCandidates(repository);
  if (candidates.some((candidate) => !new Set([
    "authoritative_projection",
    "bounded_state_lifecycle",
    "executable_surface_coverage",
    "execution_identity_coverage",
    "historical_evidence_portability",
    "identifier_namespace",
    "instruction_polarity",
    "supersession_lineage",
  ]).has(candidate.kind))) {
    throw new Error("direct semantic-v2 fixture unexpectedly discovered a runtime candidate");
  }
  const plan = createSemanticPlanV2({
    candidates,
    candidateSetSha256: semanticCandidateSetSha256(candidates),
    challengeNonce: "prepare-empty-nonce",
    observedAt: "2026-08-28T00:00:00Z",
    repository,
    repositoryObjectSha256: semanticWorkingTreeSha256(repository),
    runId: "prepare-empty-run",
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
  writeFileSync(policyPath, trustPolicy);
  return { packagePath, policyPath };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("prepareCloseout", { timeout: 60_000 }, async () => {
  it("refuses repository-wide contention before creating a run directory", async () => {
    const { evidence, repo } = fixture("prepare-contention");
    writeFileSync(join(repo, "README.md"), "fixture\n");
    commit(repo);
    const lease = acquireRepositoryVerificationLease(repo);
    try {
      await expect(prepareCloseout({
        repo,
        evidenceHome: evidence,
        runId: "prepare-contention",
        requestRef: "request-1",
      })).rejects.toBeInstanceOf(ExecutionResourceBusyError);
      expect(existsSync(join(evidence, "mister-clean", "prepare-contention"))).toBe(false);
    } finally {
      lease.release();
    }
  });
  it("copies exact operative request bytes and remains honestly NOT_CLEAN", async () => {
    const { evidence, repo } = fixture("request");
    writeFileSync(join(repo, "README.md"), "fixture\n");
    commit(repo);
    const invocation = "$mister-clean\nClose this repository for the next team.";

    const prepared = await prepareCloseout({
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

  it("binds a dirty baseline as a full repository object instead of merely HEAD", async () => {
    const { evidence, repo } = fixture("dirty-repository-object");
    writeFileSync(join(repo, "tracked.txt"), "committed\n");
    commit(repo);
    writeFileSync(join(repo, "dirty-untracked.txt"), "baseline dirt\n");
    const expected = captureRepositoryObject(repo);

    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "dirty-repository-object",
      requestRef: "request-1",
    });
    const bundle = json(prepared.bundlePath);
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));
    const regression = json(join(prepared.bundleDirectory, "regression-delta.json"));
    const snapshots = ((bundle.successor_readiness as Record<string, unknown>).snapshots) as Record<string, Record<string, unknown>>;
    const start = snapshots.start!;
    const coverage = regression.detector_coverage as Record<string, unknown>;
    const execution = (coverage.executions as Array<Record<string, unknown>>)[0]!;
    const resultRef = execution.result_ref as Record<string, unknown>;
    const result = json(join(prepared.bundleDirectory, String(resultRef.path)));

    expect(regression.schema_version).toBe("1.5");
    expect(regression.baseline_object).toBe(expected.sha256);
    expect(regression.baseline_repository_object).toEqual(expected);
    expect(regression.closing_object).toBe(expected.sha256);
    expect(start.object).toBe(expected.sha256);
    expect(start.repository_object).toEqual(expected);
    expect(start.commit).toBe(expected.head_commit);
    expect((report.repo as Record<string, unknown>).commit).toBe(expected.head_commit);
    expect(coverage.baseline_repository_object).toEqual(expected);
    expect(execution.repository_object).toEqual(expected);
    expect(result.object).toBe(expected.sha256);
    expect(result.repository_object).toEqual(expected);
  });

  it("binds repository-relevant external processes into successor readiness instead of assuming an empty census", async () => {
    const { evidence, repo } = fixture("process-census");
    writeFileSync(join(repo, "tracked.txt"), "committed\n");
    commit(repo);
    const observer = {
      pid: process.pid,
      ppid: 0,
      start_identity: "observer-start",
      executable: "/usr/bin/bun",
    };
    const external = {
      pid: 54321,
      ppid: 0,
      start_identity: "external-start",
      executable: "/usr/bin/external",
    };
    const processPort: ActionHygieneProcessPort = {
      processTable: () => [observer, external],
      pathTable: () => new Map([
        [observer.pid, { cwd: repo, open_paths: [] }],
        [external.pid, { cwd: tmpdir(), open_paths: [join(repo, "tracked.txt")] }],
      ]),
    };

    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "process-census",
      requestRef: "request-1",
      processPort,
    });
    const bundle = json(prepared.bundlePath);
    const successor = bundle.successor_readiness as Record<string, unknown>;
    const topology = successor.topology as Record<string, unknown>;
    const rows = topology.processes as Array<Record<string, unknown>>;
    const ref = topology.process_census_ref as Record<string, unknown>;
    const census = json(join(prepared.bundleDirectory, String(ref.path)));

    expect(rows).toEqual([
      expect.objectContaining({ owner: null, blocking: true }),
    ]);
    expect(topology.blocking_processes).toBe(1);
    expect(topology.unowned).toBe(3);
    expect(census.record_type).toBe("mister-clean.action-hygiene-process-census");
    expect(ref.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("emits schema 1.5 detector coverage with frozen inputs, repository-object binding, and honest source-runtime identity", async () => {
    const { base, evidence, repo } = fixture("detector-coverage");
    const denylist = join(base, "denylist.txt");
    const semanticManifest = join(base, "semantic-probes.json");
    writeFileSync(join(repo, "source.txt"), "internal campaign marker; security token safe by construction\n");
    writeFileSync(denylist, "internal campaign\n");
    writeFileSync(semanticManifest, "{}\n");
    commit(repo);

    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "detector-coverage",
      requestRef: "request-1",
      publicSafetyDenylistPath: denylist,
      semanticManifestPath: semanticManifest,
    });
    const regression = json(join(prepared.bundleDirectory, "regression-delta.json"));
    const coverage = regression.detector_coverage as Record<string, unknown>;
    const executions = coverage.executions as Array<Record<string, unknown>>;
    const publicExecution = executions.find((execution) => execution.detector_id === "public_safety") as Record<string, unknown>;
    const semanticExecution = executions.find((execution) => execution.detector_id === "semantic_boundary") as Record<string, unknown>;
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));
    const debts = report.completion_debts as Array<Record<string, unknown>>;

    expect(regression.schema_version).toBe("1.5");
    expect(coverage.runtime_identity).toMatchObject({
      status: "source_development",
      claim_scope: { covers: "source_entrypoint_regular_file_bytes_only" },
    });
    expect(coverage.required_detector_ids).toEqual(["planning_graph", "public_safety", "github_actions", "semantic_boundary"]);
    expect(coverage.run_policy).toEqual({
      schema_version: "1",
      public_safety: {
        disposition: "required",
        basis: "tracked_shippable_surface",
        scope: "tracked_shippable",
        tracked_path_count: 1,
      },
    });
    expect(publicExecution.input_refs).toEqual([expect.objectContaining({ kind: "public_safety_denylist", path: "public-safety-denylist.txt" })]);
    expect(semanticExecution.input_refs).toEqual([expect.objectContaining({ kind: "semantic_probe_manifest", path: "semantic-probe-manifest.json" })]);
    expect(readFileSync(join(prepared.bundleDirectory, "public-safety-denylist.txt"), "utf8")).toBe("internal campaign\n");
    expect(readFileSync(join(prepared.bundleDirectory, "semantic-probe-manifest.json"), "utf8")).toBe("{}\n");
    expect(debts.some((debt) => String(debt.class).startsWith("public_safety_")
      && Array.isArray(debt.detector_finding_fingerprints))).toBe(true);
    const publicSafetyDebt = debts.find((debt) => String(debt.class).startsWith("public_safety_"));
    expect(((publicSafetyDebt?.evidence as Array<Record<string, unknown>>)[0]?.command)).toBe(
      "mister-clean audit public-safety . --tracked --denylist-file public-safety-denylist.txt --json",
    );
    const semanticDebt = debts.find((debt) => String(debt.id).startsWith("DEBT-SEMANTIC-"));
    expect(((semanticDebt?.evidence as Array<Record<string, unknown>>)[0]?.command)).toBe(
      "mister-clean audit semantic . --manifest semantic-probe-manifest.json --json",
    );
    const publicAudit = json(join(prepared.bundleDirectory, "public-safety-audit.json"));
    expect(publicAudit.scope).toBe("tracked_shippable");
    expect(JSON.stringify(publicAudit)).not.toContain("internal campaign");
    expect(validateReport({ ...report, verdict: "CLEAN" }, false, true)
      .some((error) => error.includes("completion_debts") && error.includes("payable debt remains"))).toBe(true);
    await expect(validateBundleFile(prepared.bundlePath, { repoPath: repo })).resolves.toEqual({
      errors: [],
      ok: true,
    });
  });

  it("live-revalidates the frozen v2 package and trust policy instead of silently falling back to legacy discovery", async () => {
    const { base, evidence, repo } = fixture("semantic-v2-live");
    writeFileSync(join(repo, "README.md"), "plain fixture\n");
    mkdirSync(join(repo, "planning", "todo"), { recursive: true });
    writeFileSync(join(repo, "planning", "todo", "DEV.yaml"), [
      "artifact_type: slice",
      "slice_type: DEV",
      "status: To Do",
      "",
    ].join("\n"));
    commit(repo);
    const inputs = writeDirectSemanticV2(repo, base, `${JSON.stringify({
      record_type: "mister-clean.semantic-trust-policy",
      schema_version: "1.0",
      policy_id: "prepare-direct-fixture",
      keys: [],
    })}\n`);

    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "semantic-v2-live",
      requestRef: "request-1",
      semanticEvidencePackagePath: inputs.packagePath,
      semanticTrustPolicyPath: inputs.policyPath,
    });
    const regression = json(join(prepared.bundleDirectory, "regression-delta.json"));
    const semanticExecution = ((regression.detector_coverage as Record<string, unknown>)
      .executions as Array<Record<string, unknown>>)
      .find((execution) => execution.detector_id === "semantic_boundary");
    expect(semanticExecution?.input_refs).toEqual([
      expect.objectContaining({ kind: "semantic_evidence_package", path: "semantic-evidence-package.json" }),
      expect.objectContaining({ kind: "semantic_trust_policy", path: "semantic-trust-policy.json" }),
    ]);

    await expect(validateBundleFile(prepared.bundlePath, {
      repoPath: repo,
      verifyLive: true,
      runtimeAttestation: SOURCE_RUNTIME,
    })).resolves.toEqual({ errors: [], ok: true });
  });

  it("keeps ignored internal harness logs out of the default detector ledger", async () => {
    const { evidence, repo } = fixture("internal-default-coverage");
    mkdirSync(join(repo, ".crush", "logs"), { recursive: true });
    writeFileSync(join(repo, ".gitignore"), ".crush/\n");
    writeFileSync(join(repo, ".crush", "logs", "crush.log"), `local=/${"Users"}/operator/private\n`);
    writeFileSync(join(repo, "source.txt"), "internal source\n");
    commit(repo);

    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "internal-default-coverage",
      requestRef: "request-1",
    });
    const regression = json(join(prepared.bundleDirectory, "regression-delta.json"));
    const coverage = regression.detector_coverage as Record<string, unknown>;
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));

    expect(coverage.required_detector_ids).toEqual(["planning_graph", "public_safety", "github_actions", "semantic_boundary"]);
    expect(coverage.applicability).toContainEqual({
      detector_id: "public_safety", disposition: "required", basis: "tracked_shippable_surface",
    });
    expect((coverage.executions as Array<Record<string, unknown>>).some((execution) => execution.detector_id === "public_safety")).toBe(true);
    expect((report.completion_debts as Array<Record<string, unknown>>)
      .some((debt) => String(debt.class).startsWith("public_safety_"))).toBe(false);
    expect(json(join(prepared.bundleDirectory, "public-safety-audit.json"))).toMatchObject({
      status: "pass", scope: "tracked_shippable", tracked_path_count: 2, unassessed: [],
    });
  });

  it("turns GitHub Actions authority findings into grouped payable root debt", async () => {
    const { evidence, repo } = fixture("github-actions-debt");
    mkdirSync(join(repo, ".github", "workflows"), { recursive: true });
    writeFileSync(join(repo, ".github", "workflows", "cd.yml"), `name: CD
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
  workflow_dispatch: {}
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: vendor/setup@master
      - run: flyctl deploy --app production
      - name: Verify health
        run: flyctl checks list --app production --json
`);
    commit(repo);

    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "github-actions-debt",
      requestRef: "request-1",
    });
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));
    const audit = json(join(prepared.bundleDirectory, "github-actions-audit.json"));
    const debts = report.completion_debts as Array<Record<string, unknown>>;
    const accounting = report.github_actions_accounting as Record<string, unknown>;

    expect(audit.status).toBe("fail");
    expect(accounting).toMatchObject({ workflow_count: 1, sensitive_workflow_count: 1 });
    expect(Number(accounting.root_debt_count)).toBeGreaterThanOrEqual(5);
    expect(debts).toContainEqual(expect.objectContaining({
      class: "github_actions_manual_sensitive_ref_unbound",
      severity: "P0",
      state: "open",
    }));
    expect(debts.filter((debt) => debt.class === "github_actions_health_gate_nonblocking")).toHaveLength(1);
    await expect(validateBundleFile(prepared.bundlePath, { repoPath: repo })).resolves.toEqual({ errors: [], ok: true });
  });

  it("discovers, executes, and binds repository-native quality gates", async () => {
    const { evidence, repo } = fixture("native-gates-pass");
    writeFileSync(join(repo, "package.json"), `${JSON.stringify({
      name: "native-gates-pass",
      private: true,
      packageManager: "bun@1.2.0",
      scripts: { test: "bun -e \"process.exit(0)\"" },
    }, null, 2)}\n`);
    writeFileSync(join(repo, "bun.lock"), "");
    commit(repo);

    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "native-gates-pass",
      requestRef: "request-1",
    });
    const bundle = json(prepared.bundlePath);
    const successor = bundle.successor_readiness as Record<string, unknown>;
    const control = successor.native_gate_control as Record<string, unknown>;
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));

    expect(control).toMatchObject({
      required_count: 1,
      passed_count: 1,
      absent_count: 0,
      validation_error_count: 0,
      evidence_root: "native-gate-output",
    });
    expect(successor.gates).toEqual([
      expect.objectContaining({ kind: "repository_tests", semantic_status: "pass", verified: 1, total: 1 }),
    ]);
    expect((report.completion_debts as Array<Record<string, unknown>>)
      .some((debt) => String(debt.class).startsWith("native_gate_"))).toBe(false);
    await expect(validateBundleFile(prepared.bundlePath, { repoPath: repo })).resolves.toEqual({ errors: [], ok: true });
  });

  it("records a failing repository-native gate as payable debt without invalidating the evidence bundle", async () => {
    const { evidence, repo } = fixture("native-gates-fail");
    writeFileSync(join(repo, "package.json"), `${JSON.stringify({
      name: "native-gates-fail",
      private: true,
      packageManager: "bun@1.2.0",
      scripts: { test: "bun -e \"process.exit(1)\"" },
    }, null, 2)}\n`);
    writeFileSync(join(repo, "bun.lock"), "");
    commit(repo);

    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "native-gates-fail",
      requestRef: "request-1",
    });
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));
    const debts = report.completion_debts as Array<Record<string, unknown>>;

    expect(debts).toContainEqual(expect.objectContaining({ class: "native_gate_failed", state: "open" }));
    expect(json(join(prepared.bundleDirectory, "native-gate-validation.json"))).toMatchObject({ status: "fail" });
    await expect(validateBundleFile(prepared.bundlePath, { repoPath: repo })).resolves.toEqual({ errors: [], ok: true });
  });

  it("stops on structurally invalid native-gate evidence instead of manufacturing unprojectable coverage debt", async () => {
    const { evidence, repo } = fixture("native-gates-invalid-evidence");
    writeFileSync(join(repo, "package.json"), `${JSON.stringify({
      name: "native-gates-invalid-evidence",
      private: true,
      packageManager: "bun@1.2.0",
      scripts: { test: "bun -e \"process.exit(0)\"" },
    }, null, 2)}\n`);
    writeFileSync(join(repo, "bun.lock"), "");
    commit(repo);
    const moments = [
      "2026-08-25T12:00:00.000Z",
      "2030-08-25T11:59:59.000Z",
      "2030-08-25T12:00:00.000Z",
      "2030-08-25T12:00:01.000Z",
      "2030-08-25T12:00:02.000Z",
      "2026-08-25T12:00:01.000Z",
      "2026-08-25T12:00:02.000Z",
    ].map((value) => new Date(value));
    let clockIndex = 0;

    await expect(prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "native-gates-invalid-evidence",
      requestRef: "request-1",
      now: () => moments[Math.min(clockIndex++, moments.length - 1)]!,
    })).rejects.toThrow(
      /repository-native gate evidence is structurally invalid; closeout preparation stopped: .*started_at is in the future/u,
    );

    const runDirectory = join(evidence, "mister-clean", "native-gates-invalid-evidence");
    expect(json(join(runDirectory, "native-gate-validation.json"))).toMatchObject({
      status: "fail",
      errors: expect.arrayContaining([
        expect.stringContaining("started_at is in the future"),
        expect.stringContaining("finished_at is in the future"),
      ]),
    });
    expect(existsSync(join(runDirectory, "native-gate-discovery.json"))).toBe(true);
    expect(existsSync(join(runDirectory, "native-gate-coverage.json"))).toBe(true);
    expect(existsSync(join(runDirectory, "closeout-report.json"))).toBe(false);
    expect(existsSync(join(runDirectory, "regression-delta.json"))).toBe(false);
  });

  it("captures planning and a candidate current-state entrypoint", async () => {
    const { evidence, repo } = fixture("planning");
    mkdirSync(join(repo, "planning", "done"), { recursive: true });
    writeFileSync(join(repo, "planning", "done", "x.md"), "done\n");
    writeFileSync(join(repo, "CURRENT-STATE.md"), "Ready to inspect.\n");
    commit(repo);

    const prepared = await prepareCloseout({
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
    expect(systems.map((system) => system.id)).toEqual(["repository-planning-1"]);
    expect(planning.unknown).toBe(true);
    expect(systems.map((system) => system.corpus as Record<string, unknown>))
      .toContainEqual(expect.objectContaining({ unclassified: 1 }));
  });

  it("captures a canonical planning file as an exact repo-files root", async () => {
    const { evidence, repo } = fixture("roadmap-file");
    mkdirSync(join(repo, "docs"));
    writeFileSync(join(repo, "docs", "ROADMAP.md"), "# Roadmap\n\nAcceptance remains pending.\n");
    writeFileSync(join(repo, "docs", "architecture.md"), "# Architecture\n");
    commit(repo);

    const prepared = await prepareCloseout({
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

  it("treats a missing current-state document as payable scaffold state", async () => {
    const { evidence, repo } = fixture("missing");
    writeFileSync(join(repo, "source.txt"), "source\n");
    commit(repo);

    const prepared = await prepareCloseout({
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

  it("refuses to overwrite an existing run", async () => {
    const { evidence, repo } = fixture("collision");
    writeFileSync(join(repo, "README.md"), "fixture\n");
    commit(repo);
    const options = { repo, evidenceHome: evidence, runId: "same", requestRef: "request-1" };
    await prepareCloseout(options);
    await expect(prepareCloseout(options)).rejects.toThrow(/refusing to overwrite/);
  });

  it("produces a scaffold accepted by the TypeScript live validator", async () => {
    const { evidence, repo } = fixture("integration");
    writeFileSync(join(repo, "README.md"), "fixture\n");
    commit(repo);
    const prepared = await prepareCloseout({
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

  it("prepares an initialized exact-tree GUARD instead of requiring hand-authored machinery", async () => {
    const { evidence, repo } = fixture("guard");
    writeFileSync(join(repo, "README.md"), "fixture\n");
    commit(repo);
    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "guard",
      requestRef: "request-guard",
      requestText: "$mister-clean guard",
      mode: "GUARD",
      now: () => new Date("2026-08-25T12:00:00.000Z"),
    });
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));
    const manifest = json(join(prepared.bundleDirectory, "action-manifest.json"));
    expect(report.mode).toBe("GUARD");
    expect(manifest.mode).toBe("GUARD");
    expect(manifest.schema_version).toBe("1.3");
    expect(manifest.manifest_kind).toBe("closeout_guard");
    expect(manifest.guard).toEqual(expect.objectContaining({
      status: "initialized",
      baseline_commit: expect.stringMatching(/^[0-9a-f]{40}$/),
      candidate_tree: null,
      writers_frozen: false,
    }));
    expect((manifest.guard as Record<string, unknown>).commit_barrier).toEqual({
      state: "closed",
      approved_tree: null,
      receipt_ids: [],
      opened_at: null,
      crossed_action_id: null,
    });
    await expect(validateBundleFile(prepared.bundlePath, { repoPath: repo, verifyLive: false })).resolves.toEqual({
      errors: [],
      ok: true,
    });
  });

  it("produces a live-valid scaffold when planning debt is present", async () => {
    const { evidence, repo } = fixture("planning-debt-integration");
    mkdirSync(join(repo, "planning", "done"), { recursive: true });
    writeFileSync(join(repo, "planning", "done", "TASK.md"), `---
artifact_type: task
task_id: TASK
status: done
top_level: true
---
Status: active
`);
    commit(repo);
    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "planning-debt-integration",
      requestRef: "request-1",
      requestText: "$mister-clean",
    });
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));
    const debts = report.completion_debts as Array<Record<string, unknown>>;
    const accounting = report.planning_accounting as Record<string, unknown>;
    expect(debts.length).toBeGreaterThan(0);
    expect(debts.some((debt) => String(debt.class).includes("body_projection_conflict"))).toBe(true);
    expect(debts.every((debt) => Number(debt.observation_count) >= 1)).toBe(true);
    expect(accounting.raw_finding_count).toBeGreaterThanOrEqual(debts.length);
    expect(accounting.root_debt_count).toBe(debts.length);
    await expect(validateBundleFile(prepared.bundlePath, { repoPath: repo })).resolves.toEqual({
      errors: [],
      ok: true,
    });
  });

  it("groups unassigned semantic candidates into one manifest-bound verification obligation", async () => {
    const { evidence, repo } = fixture("semantic-debt-integration");
    mkdirSync(join(repo, "planning"));
    writeFileSync(join(repo, "planning", "SECURITY.md"), [
      "---",
      "artifact_type: product_contract",
      "status: active",
      "---",
      "The credential validator is a security choke point and must be safe by construction.",
      "The production composition root must wire the credential validator.",
      "",
    ].join("\n"));
    commit(repo);
    const prepared = await prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "semantic-debt-integration",
      requestRef: "request-1",
      requestText: "$mister-clean",
    });
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));
    const debts = report.completion_debts as Array<Record<string, unknown>>;
    const semantic = report.semantic_accounting as Record<string, unknown>;
    const dimensions = report.dimensions as Record<string, Record<string, unknown>>;
    expect(debts).toContainEqual(expect.objectContaining({
      class: "semantic_probe_set_unassigned",
      observation_count: 2,
      disposition: "autonomously_validate",
      state: "open",
    }));
    expect(semantic).toEqual(expect.objectContaining({ candidate_probe_count: 2, finding_count: 2 }));
    expect(dimensions.verification?.state).toBe("open");
    expect(json(join(prepared.bundleDirectory, "semantic-audit.json"))).toEqual(expect.objectContaining({ status: "fail" }));
    await expect(validateBundleFile(prepared.bundlePath, { repoPath: repo })).resolves.toEqual({
      errors: [],
      ok: true,
    });
  });

  it("does not execute semantic probes without an explicitly supplied manifest", async () => {
    const { evidence, repo } = fixture("semantic-execute-guard");
    writeFileSync(join(repo, "README.md"), "fixture\n");
    commit(repo);
    await expect(prepareCloseout({
      repo,
      evidenceHome: evidence,
      runId: "semantic-execute-guard",
      requestRef: "request-1",
      executeSemanticProbes: true,
    })).rejects.toThrow(/requires semanticManifestPath/);
  });
});
