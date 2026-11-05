/**
 * The hand-built live-bound CLEAN closure-bundle fixture shared by the bundle
 * validator tests (bundle.test.ts) and the trust-root tests (trust-root.test.ts).
 * It mints regression 1.5 bundles exactly as 7.0-7.5 write them.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import {
  nodeFilePort,
  nodeGitPort,
  validateBundle as validateBundleRaw,
  type BundleValidationOptions,
} from "./bundle.js";
import { auditPlanningRepository } from "./planning.js";
import { applyHermeticHookPolicy } from "../test-support/fixture-repo.js";
import {
  CLOSEOUT_DETECTORS,
  createDetectorCoverage,
  createDetectorRuntimeIdentity,
  createDetectorRunPolicy,
  detectorById,
  detectorRegistrySha256,
  detectorRuntimeIdentitySha256,
  type DetectorRuntimeIdentity,
} from "./detector-coverage.js";
import { auditSemanticRepository } from "./semantic.js";
import { auditGitHubActionsRepository } from "./github-actions.js";
import { scanTrackedPublicSafetySync } from "./inspection.js";
import { captureRepositoryObject, type RepositoryObject } from "./repository-object.js";
import type { ActionHygieneProcessPort } from "./action-hygiene.js";
import { repositoryIdentity } from "./repository.js";
import {
  canonicalObservationId,
  canonicalRootDebtKey,
  deriveRegressionAccounting,
} from "./regression-accounting.js";
import { discoverNativeGates } from "./native-gates.js";
import { runNativeGates } from "./native-gate-runner.js";
import { validateNativeGateCoverage } from "./native-gate-validation.js";
import { mintServerAttestationBinding } from "../runtime-binding.js";
import { captureFileCensus } from "../census.js";

export const execute = promisify(execFile);
// This fixture mints regression 1.5 bundles exactly as 7.0-7.5 write them: the frozen registry 5, without language_policy.
export const FIXTURE_DETECTORS = CLOSEOUT_DETECTORS.filter(
  (detector): detector is Exclude<(typeof CLOSEOUT_DETECTORS)[number], { readonly id: "language_policy" }> => detector.id !== "language_policy",
);
export const temporaryRoots: string[] = [];

export type RecordValue = Record<string, unknown>;
export const COMPARATOR_RESULT_BYTES = Symbol("comparator-result-bytes");
export type ComparatorObservationRecord = RecordValue & { [COMPARATOR_RESULT_BYTES]?: string };
export const NOW = "2026-08-25T09:00:00Z";

export const DONE_PLANNING = "---\nartifact_type: story\nstory_id: FIXTURE-DONE\nstatus: done\n---\n";
export const NEXT_PLANNING = "---\nartifact_type: story\nstory_id: FIXTURE-NEXT\nstatus: backlog\n---\n";
export const TEST_RUNTIME_ATTESTATION = mintServerAttestationBinding({
  record_type: "mister-clean.runtime-attestation-binding",
  schema_version: "1.0",
  status: "pass",
  package_root: "/fixture/mister-clean",
  package_root_realpath: "/fixture/mister-clean",
  entrypoint: {
    path: "./bin/mister-clean.js",
    realpath: "/fixture/mister-clean/bin/mister-clean.js",
    sha256: digest("fixture cli"),
  },
  package: { name: "@example/mister-clean", version: "9.9.9" },
  claimed_source: { git_commit: "a".repeat(40), git_tag: "v9.9.9" },
  claim_scope: {
    covers: "own_package_regular_file_bytes",
    excludes: [
      "registry_publication_provenance",
      "dependency_resolution_graph",
      "filesystem_mode_bits_xattrs_and_timestamps",
      "release_attestation_self_bytes",
      "claimed_source_authenticity",
    ],
  },
  manifest: {
    path: "./MANIFEST.sha256",
    format: "sha256sum-v1-lf",
    entry_count: 7,
    sha256: digest("fixture manifest"),
  },
});
export const TEST_RUNTIME_IDENTITY: DetectorRuntimeIdentity = createDetectorRuntimeIdentity(TEST_RUNTIME_ATTESTATION);
export const TEST_RUNTIME_IDENTITY_SHA256 = detectorRuntimeIdentitySha256(TEST_RUNTIME_IDENTITY);
export const TEST_PROCESS_PORT: ActionHygieneProcessPort = {
  processTable: () => [{
    pid: process.pid,
    ppid: 0,
    start_identity: "bundle-test-process",
    executable: "/usr/bin/bun",
  }],
  pathTable: () => new Map([[process.pid, { cwd: "/", open_paths: [] }]]),
};

export function validateBundle(data: unknown, path: string, options: BundleValidationOptions = {}) {
  const ports = options.ports
    ? { ...options.ports, processes: options.ports.processes ?? TEST_PROCESS_PORT }
    : { files: nodeFilePort, git: nodeGitPort, processes: TEST_PROCESS_PORT };
  return validateBundleRaw(data, path, {
    ...options,
    ports,
    runtimeAttestation: TEST_RUNTIME_ATTESTATION,
  });
}

export async function git(repo: string, ...args: string[]): Promise<string> {
  return (await execute("git", ["-C", repo, ...args], { encoding: "utf8" })).stdout.trim();
}

export function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalDigest(value: unknown): string {
  const encode = (input: unknown): string => {
    if (Array.isArray(input)) return `[${input.map(encode).join(",")}]`;
    if (input && typeof input === "object") {
      const record = input as RecordValue;
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${encode(record[key])}`).join(",")}}`;
    }
    return JSON.stringify(input);
  };
  return digest(encode(value));
}

export async function put(path: string, value: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, value, "utf8");
}

export async function putJson(path: string, value: unknown): Promise<void> {
  await put(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function ref(path: string): RecordValue {
  return { path, sha256: "pending" };
}

export function successor(value: Fixture): RecordValue {
  return value.bundle.successor_readiness as RecordValue;
}

export function rebind(value: Fixture, subject: string, start = subject): void {
  const snapshots = (successor(value).snapshots as RecordValue);
  const previousStart = ((snapshots.start as RecordValue).repository_object) as RepositoryObject;
  const current = captureRepositoryObject(value.repo);
  const startObject = previousStart.head_commit === start ? previousStart : current;
  value.repositoryObject = current;
  value.head = subject;
  (value.report.repo as RecordValue).commit = subject;
  (value.manifest.repo as RecordValue).commit = subject;
  Object.assign(value.report.target_binding as RecordValue, { target_commit: subject, candidate_commit: subject, merge_base: subject });
  (((value.report.claims as RecordValue).committed_locally as RecordValue).evidence as RecordValue[])[0]!.commit = subject;
  (value.bundle.custody as RecordValue).subject_commit = subject;
  const inventory = value.bundle.change_inventory as RecordValue;
  inventory.start_commit = start;
  inventory.subject_commit = subject;
  const ready = successor(value);
  Object.assign(snapshots.start as RecordValue, {
    object: startObject.sha256, repository_object: startObject,
    commit: startObject.head_commit, result: startObject.sha256,
  });
  Object.assign(snapshots.end as RecordValue, {
    object: current.sha256, repository_object: current,
    commit: current.head_commit, result: current.sha256,
  });
  (ready.target_observation as RecordValue).commit = subject;
  (((ready.topology as RecordValue).worktrees as RecordValue[])[0]!).head = subject;
  (((ready.topology as RecordValue).branches as RecordValue[])[0]!).commit = subject;
  (ready.current_state as RecordValue).commit = subject;
  ((ready.gates as RecordValue[])[0]!).object = subject;
  const control = value.report.regression_control as RecordValue;
  Object.assign(control, {
    baseline_object: startObject.sha256, baseline_repository_object: startObject,
    closing_object: current.sha256, closing_repository_object: current,
  });
  Object.assign(value.regression, {
    baseline_object: startObject.sha256, baseline_repository_object: startObject,
    closing_object: current.sha256, closing_repository_object: current,
  });
}

export interface Fixture {
  readonly root: string;
  readonly repo: string;
  readonly proof: string;
  readonly bundlePath: string;
  head: string;
  report: RecordValue;
  manifest: RecordValue;
  bundle: RecordValue;
  regression: RecordValue;
  repositoryObject: RepositoryObject;
  persist(): Promise<void>;
}

export async function fixture(): Promise<Fixture> {
  const root = join(tmpdir(), `mister-clean-bundle-${crypto.randomUUID()}`);
  const repo = join(root, "repo");
  const proof = join(root, "proof");
  await Promise.all([mkdir(repo, { recursive: true }), mkdir(proof, { recursive: true })]);
  temporaryRoots.push(root);
  await execute("git", ["init", "-b", "main", repo]);
  await git(repo, "config", "user.name", "Bundle Test");
  await git(repo, "config", "user.email", "bundle.invalid");
  applyHermeticHookPolicy(repo);
  await Promise.all([
    put(join(repo, "planning/done/done.md"), DONE_PLANNING),
    put(join(repo, "planning/backlog/next.md"), NEXT_PLANNING),
    put(join(repo, "CURRENT-STATE.md"), "Current and successor-ready.\n"),
  ]);
  await git(repo, "add", ".");
  await git(repo, "commit", "-m", "fixture");
  const head = await git(repo, "rev-parse", "HEAD");
  const repositoryObject = captureRepositoryObject(repo);
  const planningCensus = await captureFileCensus({ repository_root: repo, roots: ["planning"] });
  const processCensusBody = {
    record_type: "mister-clean.action-hygiene-process-census",
    schema_version: "1.0",
    status: "complete",
    platform: "test",
    method: "injected",
    coverage: "current_invocation_ancestry_worktree_cwd_and_open_paths",
    current_pid: process.pid,
    rows: [{
      identity: {
        pid: process.pid,
        ppid: 0,
        start_identity: "bundle-test-process",
        executable: "/usr/bin/bun",
        cwd: repo,
        relevant_open_paths: [],
      },
      classification: "current_invocation_ancestry",
    }],
    errors: [],
  };
  const processCensus = {
    ...processCensusBody,
    state_sha256: canonicalDigest(processCensusBody),
  };
  const repoId = repositoryIdentity(repo);
  const now = NOW;
  const request = "request-1";
  const dimensionKinds = {
    completion_debt: "debt_census",
    repository_state: "git_topology",
    planning_integrity: "planning_census",
    verification: "validation_summary",
    handoff_readiness: "successor_readiness",
  } as const;
  const dimensions = Object.fromEntries(Object.entries(dimensionKinds).map(([name, kind]) => [
    name,
    { state: "satisfied", evidence: [{ kind, object: head, command: `verify ${name}`, result: "pass 1/1", observed_at: now }], notes: [] },
  ]));
  const report: RecordValue = {
    record_type: "mister-clean.closeout",
    schema_version: "1.2",
    generated_at: now,
    repo: { id: repoId, commit: head, branch: "main" },
    target_binding: {
      target_ref: "refs/heads/main", target_commit: head, candidate_commit: head,
      merge_base: head, target_commits_missing: 0, candidate_commits_ahead: 0,
      target_incorporated: true, measured_at: now, evidence: ["git facts"],
    },
    authorization_basis: { source: "skill_invocation", ref: request, scope: "named_repository_and_current_task", standing: true },
    scope: { included: [repo], excluded: [], policy_sources: ["fixture-policy"] },
    mode: "CLOSE",
    dimensions,
    completion_debts: [],
    actions: [],
    residuals: [],
    acceptance_criteria: [{ id: "criterion-1", source: "operator", met: true, evidence: ["verified"] }],
    claims: {
      committed_locally: { state: "established", evidence: [{ kind: "git_commit", commit: head }] },
      pushed: { state: "not_established", evidence: [] },
      ci_green_on_push: { state: "not_established", evidence: [] },
      deployed: { state: "not_established", evidence: [] },
      independently_qa_accepted: { state: "not_established", evidence: [] },
    },
    handoff_assessment: { recommendation: "proceed", reasons: ["bundle verified"], conditions: [] },
    verdict: "CLEAN",
    debt_census: { discovered: 0, paid: 0, accepted_exception: 0 },
    regression_control: {
      policy: "zero_open_run_introduced_debt",
      baseline_object: repositoryObject.sha256, baseline_repository_object: repositoryObject,
      closing_object: repositoryObject.sha256, closing_repository_object: repositoryObject,
      accounting_schema: "1.5",
      evidence_ref: ref("regression-delta.json"),
    },
  };
  const manifest: RecordValue = {
    record_type: "mister-clean.action-manifest", schema_version: "1.0",
    legacy_schema_acknowledged: true,
    repo: { id: repoId, commit: head }, mode: "CLOSE", request_ref: request,
    authorization_basis: { source: "skill_invocation", ref: request, scope: "named_repository_and_current_task", standing: true },
    policy_sources: ["fixture-policy"],
    execution_state: "authorized", actions: [], excluded_actions: ["unrecoverable destruction"],
  };
  const bundle: RecordValue = {
    record_type: "mister-clean.closure-bundle", schema_version: "1.0", run_id: "run-1", request_ref: request,
    report: ref("report.json"), manifest: ref("manifest.json"),
    custody: { mode: "sidecar", subject_commit: head, evidence_root: null, evidence_paths: [] },
    criteria_discovery: {
      source_kind: "exact_bytes", request_source: ref("operative-request.txt"),
      source_refs: [ref("criteria-source.json")], request_sha256: digest(request),
      discovered_count: 1, none_found: false, criteria_ids: ["criterion-1"],
    },
    change_inventory: { start_commit: head, subject_commit: head, changes: [] },
    planning_discovery: { unknown: false, systems: [{
      id: "planning", kind: "repo_files", sources: ["planning/"],
      schema_sources: ["fixture convention"], validators: ["bundle live census"],
      corpus: {
        roots: ["planning"], include_globs: ["**/*.md"], total: 2, classified: 2, unclassified: 0,
        census: planningCensus,
        artifacts: [
          { path: "planning/done/done.md", class: "done", sha256: digest(DONE_PLANNING), byte_length: Buffer.byteLength(DONE_PLANNING) },
          { path: "planning/backlog/next.md", class: "backlog", sha256: digest(NEXT_PLANNING), byte_length: Buffer.byteLength(NEXT_PLANNING) },
        ],
      },
    }] },
    successor_readiness: {
      snapshots: {
        start: { kind: "repository_snapshot", object: repositoryObject.sha256, repository_object: repositoryObject, commit: head, command: "capture repository object start", result: repositoryObject.sha256, observed_at: now },
        end: { kind: "repository_snapshot", object: repositoryObject.sha256, repository_object: repositoryObject, commit: head, command: "capture repository object end", result: repositoryObject.sha256, observed_at: now },
      },
      target_observation: {
        kind: "local_ref_resolution", local_ref: "refs/heads/main", commit: head,
        observed_at: now, policy_evidence: ref("local-target-policy.json"),
      },
      topology: {
        worktrees: [{ path: repo, head, branch: "refs/heads/main", dirty_count: 0, owner: "fixture", purpose: "canonical worktree", disposition: "retain" }],
        branches: [{ name: "main", commit: head, merged: true, owner: "fixture", purpose: "canonical branch", disposition: "retain" }],
        remote_refs: [], stashes: [], process_census_ref: ref("process-census.json"), processes: [], dirty: 0, unowned: 0, unmerged: 0, blocking_processes: 0,
      },
      current_state: {
        state: "designated", path: "CURRENT-STATE.md", sha256: digest("Current and successor-ready.\n"), commit: head,
        generator: "authored source", designation: ref("current-state-designation.json"),
      },
      native_gate_control: {
        discovery_ref: ref("native-gate-discovery.json"),
        coverage_ref: ref("native-gate-coverage.json"),
        validation_ref: ref("native-gate-validation.json"),
        evidence_root: "native-gate-output",
        required_count: 0,
        passed_count: 0,
        absent_count: 0,
        validation_error_count: 0,
      },
      gates: [{
        id: "fresh-clone", kind: "isolated_clone", object: head, command: "fixture validation",
        expected_status: 0, observed_status: 0, semantic_status: "pass", verified: 1, total: 1,
        warnings: 0, debt: 0, skipped: 0, evidence_ref: ref("gate-result.json"),
      }],
      debris: { removed: 0, retained: 0, unclassified: 0, evidence: [ref("debris-census.json")] },
      handoff: { entrypoints: ["CURRENT-STATE.md"], next_owner: "next team", next_action: "read current state" },
      final_review: {
        mechanism: "independent fixture review", status: "passed", reviewer: "fixture-reviewer", implementer: "fixture-implementer",
        reviewer_execution: { harness: "test", session_id: "review-1", receipt_id: "rr-1" },
        implementer_execution: { harness: "test", session_id: "implement-1", receipt_id: "ir-1" },
        criteria_reviewed: true, planning_reviewed: true, findings_total: 0, findings_paid: 0, unresolved: 0,
        evidence_ref: ref("independent-review.json"),
      },
    },
  };
  const regression: RecordValue = {
    record_type: "mister-clean.regression-delta", schema_version: "1.5",
    policy: "zero_open_run_introduced_debt",
    baseline_object: repositoryObject.sha256, baseline_repository_object: repositoryObject,
    closing_object: repositoryObject.sha256, closing_repository_object: repositoryObject,
    accounting: deriveRegressionAccounting({
      repo_id: repoId,
      baseline_observation_ids: [],
      closing_observation_ids: [],
      action_observations: [],
      root_debts: [],
    }),
    action_checks: [], detector_coverage: {},
  };

  let nativeGateObjectSha256: string | undefined;
  const value: Fixture = {
    root, repo, proof, head, repositoryObject, report, manifest, bundle, regression, bundlePath: join(proof, "bundle.json"),
    async persist() {
      const criteria = bundle.criteria_discovery as RecordValue;
      const successor = bundle.successor_readiness as RecordValue;
      const topology = successor.topology as RecordValue;
      const current = successor.current_state as RecordValue;
      const gate = (successor.gates as RecordValue[])[0];
      const review = successor.final_review as RecordValue;
      const debris = successor.debris as RecordValue;
      const baselineRepositoryObject = regression.baseline_repository_object as RepositoryObject;
      const planningAudit = {
        ...auditPlanningRepository(repo),
        object: baselineRepositoryObject.sha256,
        repository_object: baselineRepositoryObject,
      };
      const semanticAudit = {
        ...auditSemanticRepository(repo),
        object: baselineRepositoryObject.sha256,
        repository_object: baselineRepositoryObject,
      };
      const auditText = (audit: unknown) => `${JSON.stringify(audit, null, 2)}\n`;
      const trackedPaths = (await git(repo, "ls-files", "-z")).split("\0").filter(Boolean);
      const publicSafetyAudit = {
        ...scanTrackedPublicSafetySync(repo, trackedPaths),
        object: baselineRepositoryObject.sha256,
        repository_object: baselineRepositoryObject,
      };
      const githubActionsAudit = {
        ...auditGitHubActionsRepository(repo),
        object: baselineRepositoryObject.sha256,
        repository_object: baselineRepositoryObject,
      };
      const closingRepositoryObject = regression.closing_repository_object as RepositoryObject;
      let nativeGateRecords: Record<string, unknown> = {};
      if (captureRepositoryObject(repo).sha256 === closingRepositoryObject.sha256
        && nativeGateObjectSha256 !== closingRepositoryObject.sha256) {
        const nativeGateOutputDirectory = join(proof, "native-gate-output");
        await rm(nativeGateOutputDirectory, { recursive: true, force: true });
        const nativeGateDiscovery = discoverNativeGates(repo, closingRepositoryObject);
        const nativeGateCoverage = await runNativeGates(
          repo,
          nativeGateDiscovery,
          nativeGateOutputDirectory,
          { now: () => new Date(NOW) },
        );
        const nativeGateValidationErrors = await validateNativeGateCoverage(
          nativeGateCoverage,
          nativeGateDiscovery,
          closingRepositoryObject,
          nativeGateOutputDirectory,
          { validation_time: new Date(NOW) },
        );
        const nativeGateValidation = {
          record_type: "mister-clean.native-gate-validation",
          schema_version: "1.0",
          discovery_sha256: nativeGateDiscovery.catalog_sha256,
          coverage_sha256: nativeGateCoverage.coverage_sha256,
          status: nativeGateValidationErrors.length === 0 ? "pass" : "fail",
          errors: nativeGateValidationErrors,
          observed_at: NOW,
        };
        successor.native_gate_control = {
          discovery_ref: {
            path: "native-gate-discovery.json",
            sha256: digest(auditText(nativeGateDiscovery)),
          },
          coverage_ref: {
            path: "native-gate-coverage.json",
            sha256: digest(auditText(nativeGateCoverage)),
          },
          validation_ref: {
            path: "native-gate-validation.json",
            sha256: digest(auditText(nativeGateValidation)),
          },
          evidence_root: "native-gate-output",
          required_count: nativeGateDiscovery.required_gate_ids.length,
          passed_count: nativeGateCoverage.executions.filter((execution) => execution.state === "passed").length,
          absent_count: nativeGateDiscovery.gates.filter((gate) => gate.disposition === "absent").length,
          validation_error_count: nativeGateValidationErrors.length,
        };
        nativeGateRecords = {
          "native-gate-discovery.json": nativeGateDiscovery,
          "native-gate-coverage.json": nativeGateCoverage,
          "native-gate-validation.json": nativeGateValidation,
        };
        nativeGateObjectSha256 = closingRepositoryObject.sha256;
      }
      regression.detector_coverage = createDetectorCoverage({
        baselineRepositoryObject,
        observedAt: now,
        runPolicy: createDetectorRunPolicy({
          trackedShippablePathCount: trackedPaths.length,
        }),
        runtimeAttestation: TEST_RUNTIME_ATTESTATION,
        planningAudit,
        planningRef: { path: "planning-audit.json", sha256: digest(auditText(planningAudit)) },
        publicSafetyAudit,
        publicSafetyRef: { path: "public-safety-audit.json", sha256: digest(auditText(publicSafetyAudit)) },
        githubActionsAudit,
        githubActionsRef: { path: "github-actions-audit.json", sha256: digest(auditText(githubActionsAudit)) },
        semanticAudit,
        semanticRef: { path: "semantic-audit.json", sha256: digest(auditText(semanticAudit)) },
        registryVersion: "5",
      });
      if (regression.schema_version === "1.3") {
        const coverage = regression.detector_coverage as RecordValue;
        coverage.executions = (coverage.executions as RecordValue[])
          .filter((execution) => execution.detector_id !== "github_actions");
        coverage.required_detector_ids = (coverage.required_detector_ids as string[])
          .filter((id) => id !== "github_actions");
        coverage.applicability = (coverage.applicability as RecordValue[])
          .filter((row) => row.detector_id !== "github_actions");
        coverage.finding_fingerprints = (coverage.executions as RecordValue[])
          .flatMap((execution) => execution.finding_fingerprints as string[]).sort();
        coverage.registry_version = "1";
        coverage.registry_sha256 = detectorRegistrySha256("1");
        delete coverage.runtime_identity;
        delete coverage.runtime_identity_sha256;
        coverage.baseline_object = regression.baseline_object;
        for (const execution of coverage.executions as RecordValue[]) {
          const legacy = detectorById(String(execution.detector_id ?? ""), "1");
          if (!legacy) throw new Error(`missing frozen legacy detector ${String(execution.detector_id ?? "")}`);
          execution.object = regression.baseline_object;
          execution.scope = legacy.scope;
          execution.command = legacy.command;
          execution.detector = legacy.detector;
          execution.command_sha256 = digest(legacy.command);
          execution.detector_sha256 = digest(legacy.detector);
          delete execution.detector_registry_sha256;
          delete execution.runtime_identity_sha256;
        }
      }
      if (regression.schema_version === "1.2" || regression.schema_version === "1.3") {
        for (const check of regression.action_checks as RecordValue[]) {
          for (const comparator of check.comparators as RecordValue[]) {
            for (const observation of comparator.observations as RecordValue[]) {
              observation.detector_sha256 = observation.detector_registry_sha256;
              delete observation.detector_registry_sha256;
              delete observation.runtime_identity_sha256;
            }
          }
        }
      }
      const records: Record<string, unknown> = {
        "planning-audit.json": planningAudit,
        "public-safety-audit.json": publicSafetyAudit,
        "github-actions-audit.json": githubActionsAudit,
        "semantic-audit.json": semanticAudit,
        "process-census.json": processCensus,
        ...nativeGateRecords,
        "regression-delta.json": regression,
        "criteria-source.json": {
          record_type: "mister-clean.criteria-source", request_ref: bundle.request_ref,
          request_sha256: criteria.request_sha256, criteria_ids: criteria.criteria_ids,
        },
        "local-target-policy.json": {
          record_type: "mister-clean.local-target-policy",
          policy_ref: "fixture repository has no configured upstream",
        },
        "current-state-designation.json": {
          record_type: "mister-clean.current-state-designation", path: current.path,
          sha256: current.sha256, commit: current.commit, policy_ref: "fixture-policy#current-state",
        },
        "independent-review.json": {
          record_type: "mister-clean.independent-review", observed_at: now,
          mechanism: review.mechanism, status: review.status, reviewer: review.reviewer, implementer: review.implementer,
          reviewer_execution: review.reviewer_execution, implementer_execution: review.implementer_execution,
          candidate_commit: (report.repo as RecordValue).commit,
          criteria_ids: criteria.criteria_ids,
          planning_system_ids: ((bundle.planning_discovery as RecordValue).systems as RecordValue[]).map((system) => system.id),
          findings_total: review.findings_total, findings_paid: review.findings_paid, unresolved: review.unresolved,
        },
        "debris-census.json": {
          record_type: "mister-clean.debris-census", removed: debris.removed,
          retained: debris.retained, unclassified: debris.unclassified, observed_at: now,
        },
      };
      for (const rawCheck of (regression.action_checks ?? []) as RecordValue[]) {
        for (const rawComparator of (rawCheck.comparators ?? []) as RecordValue[]) {
          for (const rawObservation of (rawComparator.observations ?? []) as RecordValue[]) {
            const result = (rawObservation as ComparatorObservationRecord)[COMPARATOR_RESULT_BYTES];
            const resultRef = rawObservation.result_ref as RecordValue | undefined;
            if (typeof result === "string" && typeof resultRef?.path === "string") {
              await put(join(proof, resultRef.path), result);
            }
          }
        }
      }
      if (gate) {
        records["gate-result.json"] = {
          record_type: "mister-clean.gate-result", gate_id: gate.id, object: gate.object,
          command: gate.command, observed_status: gate.observed_status, semantic_status: gate.semantic_status,
          verified: gate.verified, total: gate.total, warnings: gate.warnings, debt: gate.debt, skipped: gate.skipped,
          observed_at: now,
        };
      }
      for (const raw of manifest.actions as RecordValue[]) {
        const action = raw;
        for (const evidence of (((action.outcome as RecordValue | undefined)?.evidence ?? []) as RecordValue[])) {
          const evidenceReference = evidence.evidence_ref as RecordValue;
          if (!evidenceReference || typeof evidenceReference.path !== "string") continue;
          records[evidenceReference.path] = {
            record_type: "mister-clean.action-result", action_id: action.id, kind: action.kind,
            target: action.target, object: evidence.object, command: evidence.command,
            result: evidence.result, observed_at: evidence.observed_at,
          };
        }
      }
      await put(join(proof, "operative-request.txt"), request);
      for (const [name, record] of Object.entries(records)) await putJson(join(proof, name), record);
      if (criteria.request_source !== null) {
        (criteria.request_source as RecordValue).sha256 = digest(await readFile(join(proof, "operative-request.txt")));
      }
      ((criteria.source_refs as RecordValue[])[0]!).sha256 = digest(await readFile(join(proof, "criteria-source.json")));
      (((successor.target_observation as RecordValue).policy_evidence) as RecordValue).sha256 = digest(await readFile(join(proof, "local-target-policy.json")));
      (topology.process_census_ref as RecordValue).sha256 = digest(await readFile(join(proof, "process-census.json")));
      if (current.designation) (current.designation as RecordValue).sha256 = digest(await readFile(join(proof, "current-state-designation.json")));
      if (gate) (gate.evidence_ref as RecordValue).sha256 = digest(await readFile(join(proof, "gate-result.json")));
      (review.evidence_ref as RecordValue).sha256 = digest(await readFile(join(proof, "independent-review.json")));
      ((debris.evidence as RecordValue[])[0]!).sha256 = digest(await readFile(join(proof, "debris-census.json")));
      (((report.regression_control as RecordValue).evidence_ref) as RecordValue).sha256 = digest(await readFile(join(proof, "regression-delta.json")));
      for (const raw of manifest.actions as RecordValue[]) {
        for (const evidence of ((((raw.outcome as RecordValue | undefined)?.evidence ?? []) as RecordValue[]))) {
          const evidenceReference = evidence.evidence_ref as RecordValue;
          if (evidenceReference && typeof evidenceReference.path === "string") evidenceReference.sha256 = digest(await readFile(join(proof, evidenceReference.path)));
        }
      }
      await Promise.all([putJson(join(proof, "report.json"), report), putJson(join(proof, "manifest.json"), manifest)]);
      (bundle.report as RecordValue).sha256 = digest(await readFile(join(proof, "report.json")));
      (bundle.manifest as RecordValue).sha256 = digest(await readFile(join(proof, "manifest.json")));
      await putJson(join(proof, "bundle.json"), bundle);
    },
  };
  await value.persist();
  return value;
}

export async function persistRegressionMutation(value: Fixture): Promise<void> {
  const regressionPath = join(value.proof, "regression-delta.json");
  await putJson(regressionPath, value.regression);
  (((value.report.regression_control as RecordValue).evidence_ref) as RecordValue).sha256 = digest(
    await readFile(regressionPath),
  );
  const reportPath = join(value.proof, "report.json");
  await putJson(reportPath, value.report);
  (value.bundle.report as RecordValue).sha256 = digest(await readFile(reportPath));
  await putJson(value.bundlePath, value.bundle);
}

export interface PublicSafetyDebtFixture {
  readonly value: Fixture;
  readonly debt: RecordValue;
  readonly observationId: string;
}

export async function publicSafetyDebtFixture(includeDebt = true): Promise<PublicSafetyDebtFixture> {
  const value = await fixture();
  const unsafe = `local path /${"Users"}/fixture/private should not ship\n`;
  await put(join(value.repo, "unsafe.txt"), unsafe);
  await git(value.repo, "add", "unsafe.txt");
  await git(value.repo, "commit", "-m", "add public-safety fixture");
  const head = await git(value.repo, "rev-parse", "HEAD");
  rebind(value, head);
  value.report.verdict = "NOT_CLEAN";
  value.report.handoff_assessment = {
    recommendation: "do_not_proceed",
    reasons: ["public-safety debt remains"],
    conditions: [],
  };
  await value.persist();
  const audit = JSON.parse(
    await readFile(join(value.proof, "public-safety-audit.json"), "utf8"),
  ) as RecordValue;
  const finding = (audit.findings as RecordValue[])[0]!;
  const fingerprint = String(finding.fingerprint);
  const source = FIXTURE_DETECTORS.find((detector) => detector.id === "public_safety")!;
  const observationId = canonicalObservationId({
    source_id: source.detector,
    source_native_fingerprint: fingerprint,
  });
  const causeKey = {
    detector_family: "public_safety",
    rule: finding.rule,
    path: finding.path,
    line: finding.line,
  };
  const debt: RecordValue = {
    id: "DEBT-PUBLIC-SAFETY-1",
    procedure: "remove public-safety residue -> rerun tracked-surface audit",
    repair_boundary: `file:${String(finding.path)}:${String(finding.line)}`,
    debt_key: canonicalRootDebtKey({
      repo_id: String((value.report.repo as RecordValue).id),
      normalizer: "mister-clean/public-safety-root@1",
      cause_key: causeKey as never,
    }),
    normalizer: "mister-clean/public-safety-root@1",
    cause_key: causeKey,
    state: "open",
    disposition: "autonomously_repair",
    origin: { class: "baseline" },
    observation_ids: [observationId],
    detector_finding_fingerprints: [fingerprint],
    evidence: [],
  };
  if (includeDebt) value.report.completion_debts = [debt];
  value.regression.accounting = deriveRegressionAccounting({
    repo_id: String((value.report.repo as RecordValue).id),
    baseline_observation_ids: includeDebt ? [observationId] : [],
    closing_observation_ids: includeDebt ? [observationId] : [],
    action_observations: [],
    root_debts: includeDebt ? [debt as never] : [],
  });
  await persistRegressionMutation(value);
  return { value, debt, observationId };
}


/** Remove every temporary root a fixture created; call from afterEach. */
export async function removeTemporaryRoots(): Promise<void> {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}
