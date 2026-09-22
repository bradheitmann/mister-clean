import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  discoverPlanningRoots,
  git,
  isGitAncestor,
  packageRoot,
  parseWorktrees,
  PLANNING_LANE_NAMES,
  readJson,
  repositoryIdentity,
  runGit,
  sha256File,
  trackedShippablePaths,
  writeJson,
} from "./repository.js";
import { auditPlanningRepository } from "./planning.js";
import { REGRESSION_POLICY } from "./records.js";
import { auditSemanticRepository } from "./semantic.js";
import { auditSemanticEvidencePackageV2 } from "./semantic-v2.js";
import {
  createDetectorCoverage,
  createDetectorRunPolicy,
  detectorById,
  planningFindingFingerprint,
  semanticFindingFingerprint,
} from "./detector-coverage.js";
import { loadDenylistSync, scanTrackedPublicSafetySync } from "./inspection.js";
import { captureRepositoryObject } from "./repository-object.js";
import {
  captureRelevantProcessCensus,
  successorProcessRows,
  type ActionHygieneProcessPort,
} from "./action-hygiene.js";
import {
  discoverNativeGates,
  nativeGateFailureObservations,
} from "./native-gates.js";
import { runNativeGates } from "./native-gate-runner.js";
import { validateNativeGateCoverage } from "./native-gate-validation.js";
import { acquireRepositoryVerificationLease } from "./execution-lease.js";
import {
  canonicalObservationId,
  canonicalRootDebtKey,
  deriveRegressionAccounting,
  type CanonicalJsonValue,
  type RootDebtAccountingRow,
} from "./regression-accounting.js";
import type { FileRuntimeAttestationBinding } from "../runtime-binding.js";
import { captureFileCensus } from "../census.js";
import { auditGitHubActionsRepository } from "./github-actions.js";
type JsonObject = Record<string, unknown>;
export interface PrepareCloseoutOptions {
  readonly repo: string;
  readonly evidenceHome: string;
  readonly runId: string;
  readonly requestRef: string;
  readonly requestSource?: string;
  readonly requestText?: string;
  readonly publicSafetyDenylistPath?: string;
  readonly semanticEvidencePackagePath?: string;
  readonly semanticManifestPath?: string;
  readonly semanticTrustPolicyPath?: string;
  readonly executeSemanticProbes?: boolean;
  readonly nativeGateTimeoutMs?: number;
  /** Injectable for deterministic tests; production uses the native ps+lsof adapter. */
  readonly processPort?: ActionHygieneProcessPort;
  /** Live-verifier-minted identity of the CLI that executes the detector run. */
  readonly runtimeAttestation: FileRuntimeAttestationBinding;
  readonly criteria?: readonly string[];
  readonly mode?: "CLOSE" | "GUARD";
  readonly now?: () => Date;
  readonly templateRoot?: string;
}
export interface PreparedCloseout {
  readonly bundleDirectory: string;
  readonly bundlePath: string;
}
function asObject(value: unknown, path: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected object`);
  return value as JsonObject;
}
function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  return value;
}
function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function isoTimestamp(date: Date): string {
  return date.toISOString();
}
function planningClass(path: string): string {
  const parts = path.split("/").map((part) => part.toLocaleLowerCase());
  for (const part of parts) if (PLANNING_LANE_NAMES.has(part)) return part;
  return "planning";
}
function loadTemplate(root: string, name: string): JsonObject {
  return structuredClone(readJson(join(root, "assets", name)));
}
function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
function splitLines(value: string): string[] {
  return value ? value.split(/\r?\n/) : [];
}
function evidenceLabel(value: string): string {
  return value.replaceAll("<", "‹").replaceAll(">", "›");
}
function nativeGateCommand(executable: string, argv: readonly string[], cwd: string): string {
  const args = argv.map((value) => JSON.stringify(value)).join(" ");
  return `${executable}${args ? ` ${args}` : ""} (cwd ${cwd})`;
}
function observationId(sourceId: string, nativeFingerprint: string): string {
  return canonicalObservationId({
    source_id: sourceId,
    source_native_fingerprint: nativeFingerprint,
  });
}
function baselineDebt<T extends JsonObject & Pick<RootDebtAccountingRow, "state" | "disposition">>(
  repoId: string,
  row: T,
  normalizer: string,
  causeKey: CanonicalJsonValue,
  observationIds: readonly string[],
): T & RootDebtAccountingRow {
  return {
    ...row,
    debt_key: canonicalRootDebtKey({ repo_id: repoId, normalizer, cause_key: causeKey }),
    normalizer,
    cause_key: causeKey,
    observation_ids: [...new Set(observationIds)].sort(),
    origin: { class: "baseline" },
  } as T & RootDebtAccountingRow;
}
export async function prepareCloseout(options: PrepareCloseoutOptions): Promise<PreparedCloseout> {
  const mode = validatePrepareMode(options);
  const evidence = await collectPrepareEvidence(options, mode);
  const topology = await collectPrepareTopology(evidence);
  const report = assemblePrepareReport(topology);
  return assemblePrepareBundle(report);
}
function validatePrepareMode(options: PrepareCloseoutOptions): "CLOSE" | "GUARD" {
  if (options.requestSource !== undefined && options.requestText !== undefined) {
    throw new Error("requestSource and requestText are mutually exclusive");
  }
  if (!options.runId.trim()) throw new Error("runId is required");
  if (!options.requestRef.trim()) throw new Error("requestRef is required");
  if (options.executeSemanticProbes && options.semanticManifestPath === undefined) {
    throw new Error("executeSemanticProbes requires semanticManifestPath");
  }
  if (options.semanticEvidencePackagePath !== undefined
    && (options.semanticManifestPath !== undefined || options.executeSemanticProbes)) {
    throw new Error("semanticEvidencePackagePath is mutually exclusive with legacy semantic manifest execution");
  }
  if ((options.semanticEvidencePackagePath === undefined) !== (options.semanticTrustPolicyPath === undefined)) {
    throw new Error("semantic v2 requires both semanticEvidencePackagePath and semanticTrustPolicyPath");
  }
  const mode = options.mode ?? "CLOSE";
  if (mode !== "CLOSE" && mode !== "GUARD") throw new Error(`unsupported prepare mode: ${mode}`);
  return mode;
}
async function collectPrepareEvidence(
  options: PrepareCloseoutOptions,
  mode: "CLOSE" | "GUARD",
) {
  const requestedRepository = resolve(options.repo);
  const repository = resolve(git(requestedRepository, "rev-parse", "--show-toplevel"));
  const baselineRepositoryObject = captureRepositoryObject(repository);
  const clock = options.now ?? (() => new Date());
  const now = isoTimestamp(clock());
  const executionLease = acquireRepositoryVerificationLease(repository, clock);
  let leaseTransferred = false;
  try {
    const bundleDirectory = join(resolve(options.evidenceHome), "mister-clean", options.runId);
    if (existsSync(bundleDirectory)) {
      throw new Error(`refusing to overwrite existing run directory: ${bundleDirectory}`);
    }
    mkdirSync(bundleDirectory, { recursive: true });
    const templates = options.templateRoot ?? packageRoot();
    const head = baselineRepositoryObject.head_commit;
    const branch = git(repository, "branch", "--show-current") || "detached";
    const repoId = repositoryIdentity(repository);
    const upstream = runGit(
      repository,
      ["rev-parse", "--symbolic-full-name", "@{upstream}"],
      [0, 128],
    ).stdout;
    const targetRef = upstream || (branch === "detached" ? head : `refs/heads/${branch}`);
    const targetCommit = git(repository, "rev-parse", targetRef);
    const mergeBase = git(repository, "merge-base", targetCommit, head);
    const divergence = git(
      repository,
      "rev-list",
      "--left-right",
      "--count",
      `${targetCommit}...${head}`,
    ).split(/\s+/);
    const left = Number(divergence[0] ?? 0);
    const right = Number(divergence[1] ?? 0);
    let requestBytes: Buffer;
    if (options.requestSource !== undefined) requestBytes = readFileSync(options.requestSource);
    else if (options.requestText !== undefined) requestBytes = Buffer.from(options.requestText, "utf8");
    else requestBytes = Buffer.from(options.requestRef, "utf8");
    const requestSha256 = sha256(requestBytes);
    let requestSource: JsonObject | null = null;
    let sourceKind = "reference_only";
    if (options.requestSource !== undefined || options.requestText !== undefined) {
      const path = join(bundleDirectory, "operative-request.txt");
      writeFileSync(path, requestBytes);
      requestSource = { path: "operative-request.txt", sha256: sha256File(path) };
      sourceKind = "exact_bytes";
    }
    const criteriaIds = unique(options.criteria ?? []);
    writeJson(join(bundleDirectory, "criteria-source.json"), {
      record_type: "mister-clean.criteria-source",
      request_ref: options.requestRef,
      request_sha256: requestSha256,
      criteria_ids: criteriaIds,
    });
    const planningRoots = discoverPlanningRoots(repository);
    const planningAudit = {
      ...auditPlanningRepository(repository),
      object: baselineRepositoryObject.sha256,
      repository_object: baselineRepositoryObject,
    };
    const unclassifiedPlanningPaths = new Set(
      planningAudit.findings
        .filter((finding) => finding.code === "planning_input_unparsed")
        .map((finding) => finding.path),
    );
    writeJson(join(bundleDirectory, "planning-audit.json"), planningAudit);
    const planningAuditRef = {
      path: "planning-audit.json",
      sha256: sha256File(join(bundleDirectory, "planning-audit.json")),
    };
    let publicSafetyInputRef: { kind: "public_safety_denylist"; path: string; sha256: string } | undefined;
    let publicSafetyDenylistPath: string | undefined;
    if (options.publicSafetyDenylistPath !== undefined) {
      const inputPath = join(bundleDirectory, "public-safety-denylist.txt");
      writeFileSync(inputPath, readFileSync(resolve(options.publicSafetyDenylistPath)));
      publicSafetyDenylistPath = inputPath;
      publicSafetyInputRef = {
        kind: "public_safety_denylist",
        path: "public-safety-denylist.txt",
        sha256: sha256File(inputPath),
      };
    }
    const trackedPaths = trackedShippablePaths(repository);
    const detectorRunPolicy = createDetectorRunPolicy({ trackedShippablePathCount: trackedPaths.length });
    const publicSafetyAudit = detectorRunPolicy.public_safety.disposition === "required"
      ? {
        ...scanTrackedPublicSafetySync(repository, trackedPaths, loadDenylistSync(publicSafetyDenylistPath)),
        object: baselineRepositoryObject.sha256,
        repository_object: baselineRepositoryObject,
        ...(publicSafetyInputRef === undefined ? {} : { input_sha256: publicSafetyInputRef.sha256 }),
      }
      : undefined;
    if (publicSafetyAudit) writeJson(join(bundleDirectory, "public-safety-audit.json"), publicSafetyAudit);
    const publicSafetyAuditRef = publicSafetyAudit === undefined
      ? undefined
      : {
        path: "public-safety-audit.json",
        sha256: sha256File(join(bundleDirectory, "public-safety-audit.json")),
      };
    const githubActionsAudit = {
      ...auditGitHubActionsRepository(repository),
      object: baselineRepositoryObject.sha256,
      repository_object: baselineRepositoryObject,
    };
    writeJson(join(bundleDirectory, "github-actions-audit.json"), githubActionsAudit);
    const githubActionsAuditRef = {
      path: "github-actions-audit.json",
      sha256: sha256File(join(bundleDirectory, "github-actions-audit.json")),
    };
    const semanticInputRefs: Array<{
      kind: "semantic_evidence_package" | "semantic_probe_manifest" | "semantic_trust_policy";
      path: string;
      sha256: string;
    }> = [];
    let semanticManifestPath: string | undefined;
    let semanticEvidencePackagePath: string | undefined;
    let semanticTrustPolicyPath: string | undefined;
    if (options.semanticManifestPath !== undefined) {
      const inputPath = join(bundleDirectory, "semantic-probe-manifest.json");
      writeFileSync(inputPath, readFileSync(resolve(options.semanticManifestPath)));
      semanticManifestPath = inputPath;
      semanticInputRefs.push({
        kind: "semantic_probe_manifest",
        path: "semantic-probe-manifest.json",
        sha256: sha256File(inputPath),
      });
    }
    if (options.semanticEvidencePackagePath !== undefined && options.semanticTrustPolicyPath !== undefined) {
      const packageInputPath = join(bundleDirectory, "semantic-evidence-package.json");
      const policyInputPath = join(bundleDirectory, "semantic-trust-policy.json");
      writeFileSync(packageInputPath, readFileSync(resolve(options.semanticEvidencePackagePath)));
      writeFileSync(policyInputPath, readFileSync(resolve(options.semanticTrustPolicyPath)));
      semanticEvidencePackagePath = packageInputPath;
      semanticTrustPolicyPath = policyInputPath;
      semanticInputRefs.push({
        kind: "semantic_evidence_package",
        path: "semantic-evidence-package.json",
        sha256: sha256File(packageInputPath),
      }, {
        kind: "semantic_trust_policy",
        path: "semantic-trust-policy.json",
        sha256: sha256File(policyInputPath),
      });
    }
    const semanticAuditResult = semanticEvidencePackagePath !== undefined && semanticTrustPolicyPath !== undefined
      ? auditSemanticEvidencePackageV2(repository, semanticEvidencePackagePath, semanticTrustPolicyPath)
      : auditSemanticRepository(repository, {
        execute: options.executeSemanticProbes ?? false,
        ...(semanticManifestPath === undefined ? {} : { manifestPath: semanticManifestPath }),
      });
    const semanticAudit = {
      ...semanticAuditResult,
      object: baselineRepositoryObject.sha256,
      repository_object: baselineRepositoryObject,
    };
    writeJson(join(bundleDirectory, "semantic-audit.json"), semanticAudit);
    const semanticAuditRef = {
      path: "semantic-audit.json",
      sha256: sha256File(join(bundleDirectory, "semantic-audit.json")),
    };
    const detectorCoverage = createDetectorCoverage({
      baselineRepositoryObject,
      observedAt: now,
      runPolicy: detectorRunPolicy,
      runtimeAttestation: options.runtimeAttestation,
      planningAudit,
      planningRef: planningAuditRef,
      ...(publicSafetyAudit === undefined ? {} : { publicSafetyAudit }),
      ...(publicSafetyAuditRef === undefined ? {} : { publicSafetyRef: publicSafetyAuditRef }),
      githubActionsAudit,
      githubActionsRef: githubActionsAuditRef,
      semanticAudit,
      semanticRef: semanticAuditRef,
      inputRefs: {
        ...(publicSafetyInputRef === undefined ? {} : { public_safety: [publicSafetyInputRef] }),
        ...(semanticInputRefs.length === 0 ? {} : { semantic_boundary: semanticInputRefs }),
      },
    });
    const nativeGateDiscovery = discoverNativeGates(repository, baselineRepositoryObject);
    const nativeGateOutputDirectory = join(bundleDirectory, "native-gate-output");
    leaseTransferred = true;
    const nativeGateCoverage = await runNativeGates(
      repository,
      nativeGateDiscovery,
      nativeGateOutputDirectory,
      {
        ...(options.nativeGateTimeoutMs === undefined ? {} : { timeout_ms: options.nativeGateTimeoutMs }),
        now: clock,
        execution_lease: executionLease,
      },
    );
    writeJson(join(bundleDirectory, "native-gate-discovery.json"), nativeGateDiscovery);
    writeJson(join(bundleDirectory, "native-gate-coverage.json"), nativeGateCoverage);
    const nativeGateValidationTime = clock();
    const nativeGateIntegrityErrors = await validateNativeGateCoverage(
      nativeGateCoverage,
      nativeGateDiscovery,
      nativeGateCoverage.closing_repository_object,
      nativeGateOutputDirectory,
      { validation_time: nativeGateValidationTime, require_passing: false, repository },
    );
    const nativeGateValidationErrors = await validateNativeGateCoverage(
      nativeGateCoverage,
      nativeGateDiscovery,
      nativeGateCoverage.closing_repository_object,
      nativeGateOutputDirectory,
      { validation_time: nativeGateValidationTime, repository },
    );
    writeJson(join(bundleDirectory, "native-gate-validation.json"), {
      record_type: "mister-clean.native-gate-validation",
      schema_version: "1.0",
      discovery_sha256: nativeGateDiscovery.catalog_sha256,
      coverage_sha256: nativeGateCoverage.coverage_sha256,
      status: nativeGateValidationErrors.length === 0 ? "pass" : "fail",
      errors: nativeGateValidationErrors,
      observed_at: isoTimestamp(clock()),
    });
    if (nativeGateIntegrityErrors.length > 0) {
      throw new Error(
        `repository-native gate evidence is structurally invalid; closeout preparation stopped: ${nativeGateIntegrityErrors.join("; ")}`,
      );
    }
    const nativeGateRows = nativeGateCoverage.executions.map((execution) => {
      const definition = nativeGateDiscovery.gates.find((gate) => gate.id === execution.gate_id);
      if (!definition) throw new Error(`native gate execution has no discovery definition: ${execution.gate_id}`);
      const path = `native-gate-${sha256(Buffer.from(execution.gate_id, "utf8")).slice(0, 16)}.json`;
      const command = nativeGateCommand(
        execution.command.executable,
        execution.command.argv,
        execution.command.cwd,
      );
      const passed = execution.state === "passed";
      const record = {
        record_type: "mister-clean.gate-result",
        gate_id: execution.gate_id,
        object: nativeGateCoverage.closing_repository_object.sha256,
        command,
        observed_status: execution.exit_code ?? -1,
        semantic_status: passed ? "pass" : "fail",
        verified: passed ? 1 : 0,
        total: 1,
        warnings: 0,
        debt: passed ? 0 : 1,
        skipped: execution.state === "skipped" ? 1 : 0,
        observed_at: execution.finished_at,
        native_definition_sha256: definition.definition_sha256,
        native_coverage_sha256: nativeGateCoverage.coverage_sha256,
        stdout_ref: { ...execution.stdout_ref, path: `native-gate-output/${execution.stdout_ref.path}` },
        stderr_ref: { ...execution.stderr_ref, path: `native-gate-output/${execution.stderr_ref.path}` },
      };
      writeJson(join(bundleDirectory, path), record);
      return {
        id: execution.gate_id,
        kind: execution.kind,
        object: nativeGateCoverage.closing_repository_object.sha256,
        command,
        expected_status: 0,
        observed_status: execution.exit_code ?? -1,
        semantic_status: passed ? "pass" : "fail",
        verified: passed ? 1 : 0,
        total: 1,
        warnings: 0,
        debt: passed ? 0 : 1,
        skipped: execution.state === "skipped" ? 1 : 0,
        evidence_ref: { path, sha256: sha256File(join(bundleDirectory, path)) },
      };
    });
    if (nativeGateCoverage.closing_repository_object.sha256 !== baselineRepositoryObject.sha256) {
      throw new Error("repository-native gate execution changed the bound repository object; evidence was preserved and closeout stopped");
    }
    return {
      options,
      mode,
      repository,
      baselineRepositoryObject,
      bundleDirectory,
      templates,
      clock,
      now,
      head,
      branch,
      repoId,
      upstream,
      targetRef,
      targetCommit,
      mergeBase,
      left,
      right,
      requestSha256,
      requestSource,
      sourceKind,
      criteriaIds,
      planningRoots,
      planningAudit,
      unclassifiedPlanningPaths,
      planningAuditRef,
      publicSafetyInputRef,
      publicSafetyAudit,
      publicSafetyAuditRef,
      githubActionsAudit,
      githubActionsAuditRef,
      semanticAudit,
      semanticAuditRef,
      detectorCoverage,
      nativeGateDiscovery,
      nativeGateCoverage,
      nativeGateValidationErrors,
      nativeGateRows,
    };
  } catch (error) {
    if (!leaseTransferred) {
      try {
        executionLease.release();
      } catch (releaseError) {
        throw new AggregateError([error, releaseError], "closeout preparation and execution-lease release both failed");
      }
    }
    throw error;
  }
}
async function collectPrepareTopology(
  context: Readonly<Awaited<ReturnType<typeof collectPrepareEvidence>>>,
) {
  const {
    options,
    repository,
    baselineRepositoryObject,
    bundleDirectory,
    now,
    head,
    branch,
    targetRef,
    targetCommit,
    upstream,
    planningRoots,
    unclassifiedPlanningPaths,
  } = context;
  let planningSystems: JsonObject[];
  if (planningRoots.length) {
    planningSystems = await Promise.all(planningRoots.map(async (rootText, index) => {
      const census = await captureFileCensus({
        repository_root: repository,
        roots: [rootText],
        output_path: join(bundleDirectory, `planning-census-${index + 1}.json`),
      });
      const artifacts = census.entries.map((entry) => ({
        path: entry.path,
        class: unclassifiedPlanningPaths.has(entry.path) ? "unclassified" : planningClass(entry.path),
        byte_length: entry.byte_length,
        sha256: entry.sha256,
      }));
      const unclassified = artifacts.filter((artifact) => artifact.class === "unclassified").length;
      return {
        id: `repository-planning-${index + 1}`,
        kind: "repo_files",
        sources: [rootText],
        schema_sources: ["repository lane/artifact convention; verify manually"],
        validators: ["mister-clean audit planning . --json", "mister-clean live planning census"],
        corpus: {
          roots: [rootText],
          include_globs: ["**/*"],
          total: artifacts.length,
          classified: artifacts.length - unclassified,
          unclassified,
          census,
          artifacts,
        },
      };
    }));
  } else {
    planningSystems = [
      {
        id: "no-repository-planning",
        kind: "none",
        sources: ["independent shallow root scan"],
        schema_sources: ["no planning schema found"],
        validators: ["mister-clean planning discovery"],
        corpus: {
          roots: [],
          include_globs: [],
          total: 0,
          classified: 0,
          unclassified: 0,
          artifacts: [],
        },
      },
    ];
  }
  const worktrees = parseWorktrees(repository).map((row) => {
    const path = resolve(row.worktree);
    const dirtyCount = splitLines(git(path, "status", "--porcelain=v1", "--untracked-files=all")).length;
    return {
      path,
      head: row.head ?? "",
      branch: row.branch ?? "detached",
      dirty_count: dirtyCount,
      owner: "unassigned",
      purpose: "discovered during closeout",
      disposition: "requires reconciliation",
    };
  });
  const branches = splitLines(
    git(repository, "for-each-ref", "--format=%(refname:short)%09%(objectname)", "refs/heads"),
  ).map((line) => {
    const [name = "", commit = ""] = line.split("\t", 2);
    return {
      name,
      commit,
      merged: isGitAncestor(repository, commit, head),
      owner: "unassigned",
      purpose: "discovered during closeout",
      disposition: "requires reconciliation",
    };
  });
  const remoteRefs = splitLines(
    git(repository, "for-each-ref", "--format=%(refname)%09%(objectname)", "refs/remotes"),
  )
    .map((line) => line.split("\t", 2))
    .filter(([name]) => !name?.endsWith("/HEAD"))
    .map(([name = "", commit = ""]) => ({
      name,
      commit,
      merged: isGitAncestor(repository, commit, head),
      owner: "unassigned",
      purpose: "discovered during closeout",
      disposition: "requires reconciliation",
    }));
  const stashes = splitLines(git(repository, "stash", "list", "--format=%gd%09%H%09%gs"));
  const processCensus = captureRelevantProcessCensus(
    worktrees.map((worktree) => worktree.path),
    options.processPort === undefined ? {} : { processPort: options.processPort },
  );
  const processes = successorProcessRows(processCensus);
  writeJson(join(bundleDirectory, "process-census.json"), processCensus);
  const processCensusRef = {
    path: "process-census.json",
    sha256: sha256File(join(bundleDirectory, "process-census.json")),
  };
  const currentCandidates = ["CURRENT-STATE.md", "docs/CURRENT-STATE.md", "_STATUS.md", "README.md"];
  const currentPath = currentCandidates.find((candidate) => existsSync(join(repository, candidate)));
  let policyRef: JsonObject | null = null;
  let targetObservation: JsonObject;
  if (upstream) {
    const remote = git(repository, "config", "--get", `branch.${branch}.remote`);
    const remoteRef = git(repository, "config", "--get", `branch.${branch}.merge`);
    targetObservation = {
      kind: "remote_ref_resolution",
      local_ref: upstream,
      remote,
      remote_ref: remoteRef,
      commit: targetCommit,
      observed_at: now,
    };
  } else {
    writeJson(join(bundleDirectory, "local-target-policy.json"), {
      record_type: "mister-clean.local-target-policy",
      policy_ref: "no configured upstream; current branch is the conservative local target",
    });
    policyRef = {
      path: "local-target-policy.json",
      sha256: sha256File(join(bundleDirectory, "local-target-policy.json")),
    };
    targetObservation = {
      kind: "local_ref_resolution",
      local_ref: targetRef,
      commit: targetCommit,
      observed_at: now,
      policy_evidence: policyRef,
    };
  }
  return {
    ...context,
    planningSystems,
    worktrees,
    branches,
    remoteRefs,
    stashes,
    processCensusRef,
    processes,
    currentPath,
    policyRef,
    targetObservation,
  };
}
function assemblePrepareReport(
  context: Readonly<Awaited<ReturnType<typeof collectPrepareTopology>>>,
) {
  const {
    options,
    mode,
    repository,
    baselineRepositoryObject,
    bundleDirectory,
    templates,
    now,
    head,
    branch,
    repoId,
    targetRef,
    targetCommit,
    mergeBase,
    left,
    right,
    requestSha256,
    requestSource,
    sourceKind,
    criteriaIds,
    planningAudit,
    planningAuditRef,
    publicSafetyInputRef,
    publicSafetyAudit,
    publicSafetyAuditRef,
    githubActionsAudit,
    githubActionsAuditRef,
    semanticAudit,
    semanticAuditRef,
    detectorCoverage,
    nativeGateDiscovery,
    nativeGateCoverage,
    nativeGateValidationErrors,
    nativeGateRows,
    planningSystems,
    worktrees,
    branches,
    remoteRefs,
    stashes,
    processCensusRef,
    processes,
    currentPath,
    targetObservation,
    policyRef,
  } = context;
  const report = loadTemplate(templates, "closeout-report.json");
  const validationDebtClasses = new Set([
    "acceptance_cascade_unexecuted",
    "acceptance_gate_unknown",
    "completed_parent_unexecuted_acceptance",
  ]);
  const planningDebts = planningAudit.root_debts.map((debt) => {
    const nativeFingerprints = debt.raw_finding_ids.map(planningFindingFingerprint).sort();
    const causeKey = {
      detector_family: "planning_graph",
      source_cause_key: debt.cause_key,
      repair_boundary: debt.repair_boundary,
    } as const;
    return baselineDebt(repoId, {
      id: debt.id.replace("ROOT-", "DEBT-"),
      class: debt.class,
      observation_count: debt.observation_count,
      raw_finding_ids: debt.raw_finding_ids,
      detector_finding_fingerprints: nativeFingerprints,
      affected_paths: debt.affected_paths,
      repair_boundary: debt.repair_boundary,
      causal_evidence: debt.causal_evidence,
      procedure: `Reconcile ${debt.affected_projection_field} across ${evidenceLabel(debt.repair_boundary)}`,
      state: "open",
      disposition: debt.class.split("+").some((code) => validationDebtClasses.has(code))
        ? "autonomously_validate"
        : "autonomously_repair",
      evidence: [{
        kind: "planning_census",
        object: debt.cause_key,
        command: "mister-clean audit planning . --json",
        result: `${debt.observation_count} raw observations: ${debt.class}`,
        observed_at: now,
        evidence_ref: planningAuditRef,
      }],
    }, "mister-clean/planning-root@1", causeKey, nativeFingerprints.map((fingerprint) => (
      observationId(detectorById("planning_graph")?.detector ?? "mister-clean/planning_graph@2", fingerprint)
    )));
  });
  const semanticCommand = options.semanticEvidencePackagePath !== undefined
    ? "mister-clean audit semantic . --evidence-package semantic-evidence-package.json --trust-policy semantic-trust-policy.json --json"
    : options.semanticManifestPath === undefined
      ? "mister-clean audit semantic . --json"
      : `mister-clean audit semantic . --manifest semantic-probe-manifest.json${options.executeSemanticProbes ? " --execute" : ""} --json`;
  const publicSafetyCommand = `mister-clean audit public-safety . --tracked${publicSafetyInputRef === undefined ? "" : " --denylist-file public-safety-denylist.txt"} --json`;
  const unassignedSemanticFindings = semanticAudit.findings
    .filter((finding) => finding.code === "semantic_probe_unassigned");
  const semanticDebts = semanticAudit.findings
    .filter((finding) => finding.code !== "semantic_probe_unassigned")
    .map((finding) => baselineDebt(repoId, {
    id: `DEBT-SEMANTIC-${sha256(Buffer.from(`${finding.candidate_id}\0${finding.code}\0${finding.refs.join("\0")}\0${finding.detail.replaceAll(/\s+/g, " ")}`, "utf8")).slice(0, 16).toUpperCase()}`,
    class: finding.code,
    observation_count: 1,
    detector_finding_fingerprints: [semanticFindingFingerprint(finding.candidate_id, finding.code)],
    affected_paths: unique(finding.refs.map((ref) => ref.split("#line-", 1)[0] ?? ref)),
    procedure: finding.classification === "confirmed_product_defect"
      ? `Repair ${finding.kind.replaceAll("_", " ")} and rerun its bound semantic probe`
      : finding.classification === "operate_time_pending"
        ? `Execute and record the owned operate-time proof for ${finding.candidate_id}`
        : `Bind and execute complete adversarial coverage for ${finding.candidate_id}`,
    state: "open",
    disposition: finding.classification === "confirmed_product_defect"
      ? "autonomously_repair"
      : finding.classification === "operate_time_pending"
        ? "decision_or_coordination_required"
        : "autonomously_validate",
    evidence: [{
      kind: "gate_result",
      object: baselineRepositoryObject.sha256,
      command: semanticCommand,
      result: `${finding.code}: ${finding.detail}`,
      observed_at: now,
      evidence_ref: semanticAuditRef,
    }],
  }, "mister-clean/semantic-root@1", {
    detector_family: "semantic_boundary",
    candidate_id: finding.candidate_id,
    code: finding.code,
  }, [observationId(
    "mister-clean/semantic_boundary@1",
    semanticFindingFingerprint(finding.candidate_id, finding.code),
  )]));
  if (unassignedSemanticFindings.length > 0) {
    const fingerprints = unassignedSemanticFindings
      .map((finding) => semanticFindingFingerprint(finding.candidate_id, finding.code))
      .sort();
    semanticDebts.push(baselineDebt(repoId, {
      id: `DEBT-SEMANTIC-SET-${semanticAudit.candidate_set_sha256.slice(0, 16).toUpperCase()}`,
      class: "semantic_probe_set_unassigned",
      observation_count: unassignedSemanticFindings.length,
      detector_finding_fingerprints: fingerprints,
      affected_paths: unique(unassignedSemanticFindings.flatMap((finding) => (
        finding.refs.map((ref) => ref.split("#line-", 1)[0] ?? ref)
      ))),
      procedure: `Triage the ${unassignedSemanticFindings.length} semantic candidates once, bind one complete manifest to candidate set ${semanticAudit.candidate_set_sha256}, then execute or explicitly dispose each candidate`,
      state: "open",
      disposition: "autonomously_validate",
      evidence: [{
        kind: "gate_result",
        object: baselineRepositoryObject.sha256,
        command: semanticCommand,
        result: `${unassignedSemanticFindings.length} unassigned candidates share one missing-manifest root cause`,
        observed_at: now,
        evidence_ref: semanticAuditRef,
      }],
    }, "mister-clean/semantic-candidate-set@1", {
      detector_family: "semantic_boundary",
      candidate_set_sha256: semanticAudit.candidate_set_sha256,
      code: "semantic_probe_unassigned",
    }, fingerprints.map((fingerprint) => observationId("mister-clean/semantic_boundary@1", fingerprint))) as unknown as (typeof semanticDebts)[number]);
  }
  const publicSafetyDebts = (publicSafetyAudit?.findings ?? []).map((finding) => baselineDebt(repoId, {
    id: `DEBT-PUBLIC-SAFETY-${finding.fingerprint.slice(0, 16).toUpperCase()}`,
    class: `public_safety_${finding.rule}`,
    observation_count: 1,
    detector_finding_fingerprints: [finding.fingerprint],
    affected_paths: [finding.path],
    procedure: `Remove or remediate the ${finding.rule} public-safety finding, then rerun the redacted public-safety audit`,
    state: "open",
    disposition: "autonomously_repair",
    evidence: [{
      kind: "public_safety_scan",
      object: baselineRepositoryObject.sha256,
      command: publicSafetyCommand,
      result: `public-safety fingerprint ${finding.fingerprint}`,
      observed_at: now,
      evidence_ref: publicSafetyAuditRef,
    }],
  }, "mister-clean/public-safety-root@1", {
    detector_family: "public_safety",
    rule: finding.rule,
    path: finding.path,
    line: finding.line,
  }, [observationId("mister-clean/public_safety@1", finding.fingerprint)]));
  const publicSafetyUnassessedDebts = (publicSafetyAudit?.unassessed ?? []).map((finding) => baselineDebt(repoId, {
    id: `DEBT-PUBLIC-SAFETY-UNASSESSED-${finding.fingerprint.slice(0, 16).toUpperCase()}`,
    class: `public_safety_unassessed_${finding.reason}`,
    observation_count: 1,
    detector_finding_fingerprints: [finding.fingerprint],
    affected_paths: [finding.path],
    procedure: `Make ${finding.path} safely text-assessable or explicitly remove it from the tracked shippable surface, then rerun public-safety inspection`,
    state: "open",
    disposition: "autonomously_repair",
    evidence: [{
      kind: "public_safety_scan",
      object: baselineRepositoryObject.sha256,
      command: publicSafetyCommand,
      result: `unassessed ${finding.reason} fingerprint ${finding.fingerprint}`,
      observed_at: now,
      evidence_ref: publicSafetyAuditRef,
    }],
  }, "mister-clean/public-safety-root@1", {
    detector_family: "public_safety",
    reason: finding.reason,
    path: finding.path,
  }, [observationId("mister-clean/public_safety@1", finding.fingerprint)]));
  const publicSafetyRootDebts = [...publicSafetyDebts, ...publicSafetyUnassessedDebts];
  const githubActionsCommand = "mister-clean audit github-actions . --json";
  const githubActionsDetector = detectorById("github_actions")?.detector;
  if (!githubActionsDetector) throw new Error("GitHub Actions detector is absent from the canonical registry");
  const githubActionGroups = new Map<string, typeof githubActionsAudit.findings>();
  for (const finding of githubActionsAudit.findings) {
    const key = `${finding.path}\0${finding.rule}`;
    githubActionGroups.set(key, [...(githubActionGroups.get(key) ?? []), finding]);
  }
  const githubActionsRootDebts = [...githubActionGroups.entries()].map(([key, findings]) => {
    const first = findings[0];
    if (!first) throw new Error(`empty GitHub Actions finding group: ${key}`);
    const fingerprints = findings.map((finding) => finding.fingerprint).sort();
    return baselineDebt(repoId, {
      id: `DEBT-GITHUB-ACTIONS-${sha256(Buffer.from(key, "utf8")).slice(0, 16).toUpperCase()}`,
      class: `github_actions_${first.rule}`,
      severity: first.severity,
      observation_count: findings.length,
      detector_finding_fingerprints: fingerprints,
      affected_paths: [first.path],
      affected_refs: unique(findings.flatMap((finding) => finding.refs)),
      procedure: `Repair ${first.rule.replaceAll("_", " ")} as one fail-closed workflow invariant, add a negative control, then rerun the GitHub Actions audit`,
      state: "open",
      disposition: "autonomously_repair",
      evidence: [{
        kind: "gate_result",
        object: baselineRepositoryObject.sha256,
        command: githubActionsCommand,
        result: `${findings.length} observation(s): ${first.detail}`,
        observed_at: now,
        evidence_ref: githubActionsAuditRef,
      }],
    }, "mister-clean/github-actions-root@1", {
      detector_family: "github_actions",
      path: first.path,
      rule: first.rule,
    }, fingerprints.map((fingerprint) => observationId(githubActionsDetector, fingerprint)));
  });
  const nativeGateDebts = nativeGateFailureObservations(nativeGateDiscovery, nativeGateCoverage).map((projection) => {
    const { gate, execution } = projection;
    const failure = gate.disposition === "absent"
      ? `required native gate is absent (${gate.basis})`
      : `native gate ended ${execution?.state ?? "without execution"}: ${execution?.failure_reason ?? "no passing evidence"}`;
    return baselineDebt(repoId, {
      id: `DEBT-NATIVE-GATE-${projection.source_native_fingerprint.slice(0, 16).toUpperCase()}`,
      class: gate.disposition === "absent" ? "native_gate_absent" : `native_gate_${execution?.state ?? "unexecuted"}`,
      observation_count: 1,
      affected_paths: gate.source_refs.map((ref) => ref.path),
      procedure: gate.disposition === "absent"
        ? `Restore a safe repository-native ${gate.kind} gate for ${gate.id}, then rerun closeout`
        : `Repair ${gate.id} and rerun the exact repository-native gate on an unchanged repository object`,
      state: "open",
      disposition: "autonomously_repair",
      evidence: [{
        kind: "gate_result",
        object: baselineRepositoryObject.sha256,
        command: execution
          ? nativeGateCommand(execution.command.executable, execution.command.argv, execution.command.cwd)
          : "mister-clean native gate discovery",
        result: failure,
        observed_at: execution?.finished_at ?? now,
        evidence_ref: {
          path: "native-gate-validation.json",
          sha256: sha256File(join(bundleDirectory, "native-gate-validation.json")),
        },
      }],
    }, projection.normalizer, projection.cause_key, [
      observationId(projection.source_id, projection.source_native_fingerprint),
    ]);
  });
  const nativeRootDebts = nativeGateDebts;
  const completionDebts = [
    ...planningDebts,
    ...publicSafetyRootDebts,
    ...githubActionsRootDebts,
    ...semanticDebts,
    ...nativeRootDebts,
  ];
  const rootDebtRows: RootDebtAccountingRow[] = completionDebts.map((debt) => ({
    debt_key: debt.debt_key,
    normalizer: debt.normalizer,
    cause_key: debt.cause_key,
    state: debt.state,
    disposition: debt.disposition,
    origin: debt.origin,
    observation_ids: debt.observation_ids,
  }));
  const baselineObservationIds = [...new Set(
    rootDebtRows.flatMap((debt) => debt.observation_ids),
  )].sort();
  const regressionAccounting = deriveRegressionAccounting({
    repo_id: repoId,
    baseline_observation_ids: baselineObservationIds,
    closing_observation_ids: baselineObservationIds,
    action_observations: [],
    root_debts: rootDebtRows,
  });
  Object.assign(report, {
    generated_at: now,
    repo: { id: repoId, commit: head, branch },
    mode,
    actions: [],
    completion_debts: completionDebts,
    residuals: [],
    acceptance_criteria: criteriaIds.map((id) => ({
      id,
      source: "operator",
      met: false,
      evidence: ["not yet assessed"],
    })),
    verdict: "NOT_CLEAN",
    debt_census: { discovered: completionDebts.length, paid: 0, accepted_exception: 0 },
    planning_accounting: {
      raw_finding_count: planningAudit.raw_finding_count,
      root_debt_count: planningAudit.root_debt_count,
      suppressed_by_typed_nonartifact_count: planningAudit.suppressed_by_typed_nonartifact_count,
      candidate_probe_count: planningAudit.candidate_probe_count,
      evidence_ref: planningAuditRef,
    },
    semantic_accounting: {
      candidate_probe_count: semanticAudit.candidate_probe_count,
      executed_probe_count: semanticAudit.executed_probe_count,
      resolved_probe_count: semanticAudit.resolved_probe_count,
      confirmed_failure_count: semanticAudit.confirmed_failure_count,
      pending_probe_count: semanticAudit.pending_probe_count,
      finding_count: semanticAudit.findings.length,
      evidence_ref: semanticAuditRef,
    },
    public_safety_accounting: {
      tracked_path_count: publicSafetyAudit?.tracked_path_count ?? 0,
      finding_count: publicSafetyAudit?.findings.length ?? 0,
      unassessed_count: publicSafetyAudit?.unassessed.length ?? 0,
      evidence_ref: publicSafetyAuditRef ?? null,
    },
    github_actions_accounting: {
      workflow_count: githubActionsAudit.workflow_count,
      sensitive_workflow_count: githubActionsAudit.sensitive_workflow_count,
      finding_count: githubActionsAudit.findings.length,
      root_debt_count: githubActionsRootDebts.length,
      evidence_ref: githubActionsAuditRef,
    },
    native_gate_accounting: {
      discovered_count: nativeGateDiscovery.gates.length,
      required_count: nativeGateDiscovery.required_gate_ids.length,
      executed_count: nativeGateCoverage.executions.length,
      passed_count: nativeGateCoverage.executions.filter((execution) => execution.state === "passed").length,
      absent_count: nativeGateDiscovery.gates.filter((gate) => gate.disposition === "absent").length,
      validation_error_count: nativeGateValidationErrors.length,
      discovery_ref: {
        path: "native-gate-discovery.json",
        sha256: sha256File(join(bundleDirectory, "native-gate-discovery.json")),
      },
      coverage_ref: {
        path: "native-gate-coverage.json",
        sha256: sha256File(join(bundleDirectory, "native-gate-coverage.json")),
      },
    },
  });
  if (completionDebts.length > 0) {
    Object.assign(asObject(asObject(report.dimensions, "closeout-report.dimensions").completion_debt, "closeout-report.dimensions.completion_debt"), {
      state: "open",
      evidence: [{ kind: "debt_census", object: baselineRepositoryObject.sha256, command: "mister-clean prepare closeout census", result: `${completionDebts.length} total root debts (${planningDebts.length} planning, ${publicSafetyRootDebts.length} public safety, ${githubActionsRootDebts.length} GitHub Actions, ${semanticDebts.length} semantic, ${nativeRootDebts.length} native gate)`, observed_at: now }],
      notes: ["Executable planning, public-safety, workflow-governance, semantic, and native-gate audits found payable successor-readiness debt."],
    });
  }
  if (planningDebts.length > 0) {
    Object.assign(asObject(asObject(report.dimensions, "closeout-report.dimensions").planning_integrity, "closeout-report.dimensions.planning_integrity"), {
      state: "open",
      evidence: [{ kind: "planning_census", object: baselineRepositoryObject.sha256, command: "mister-clean audit planning . --json", result: `${planningAudit.raw_finding_count} raw findings / ${planningDebts.length} root debts`, observed_at: now }],
      notes: ["Physical lanes, structured metadata, exact parent projections, and acceptance-gate identity do not yet agree."],
    });
  }
  if (semanticDebts.length > 0) {
    Object.assign(asObject(asObject(report.dimensions, "closeout-report.dimensions").verification, "closeout-report.dimensions.verification"), {
      state: "open",
      evidence: [{ kind: "validation_summary", object: baselineRepositoryObject.sha256, command: semanticCommand, result: `${semanticDebts.length} unproved, pending, or failed semantic probes`, observed_at: now }],
      notes: ["Critical construction and composition-root claims require bound, executed evidence; prose and isolated unit tests are insufficient."],
    });
  }
  if (nativeRootDebts.length > 0) {
    Object.assign(asObject(asObject(report.dimensions, "closeout-report.dimensions").verification, "closeout-report.dimensions.verification"), {
      state: "open",
      evidence: [{
        kind: "validation_summary",
        object: baselineRepositoryObject.sha256,
        command: "mister-clean repository-native gate census",
        result: `${nativeRootDebts.length} absent, failed, blocked, timed-out, skipped, or invalid native-gate obligations`,
        observed_at: now,
      }],
      notes: ["Repository-native test, lint, typecheck, build, or established aggregate gates are not yet fully green on the bound object."],
    });
  }
  asObject(report.authorization_basis, "closeout-report.authorization_basis").ref = options.requestRef;
  report.scope = { included: [`repository:${repoId}`], excluded: [], policy_sources: [] };
  report.target_binding = {
    target_ref: targetRef,
    target_commit: targetCommit,
    candidate_commit: head,
    merge_base: mergeBase,
    target_commits_missing: left,
    candidate_commits_ahead: right,
    target_incorporated: left === 0 && mergeBase === targetCommit,
    measured_at: now,
    evidence: [`git merge-base + rev-list --left-right --count => ${left}/${right}`],
  };
  const closingRepositoryObject = captureRepositoryObject(repository);
  if (closingRepositoryObject.sha256 !== baselineRepositoryObject.sha256) {
    throw new Error("repository changed while closeout preparation was collecting baseline evidence");
  }
  const regressionBinding = {
    policy: REGRESSION_POLICY,
    baseline_object: baselineRepositoryObject.sha256,
    baseline_repository_object: baselineRepositoryObject,
    closing_object: closingRepositoryObject.sha256,
    closing_repository_object: closingRepositoryObject,
  };
  writeJson(join(bundleDirectory, "regression-delta.json"), {
    record_type: "mister-clean.regression-delta",
    schema_version: "1.5",
    ...regressionBinding,
    accounting: regressionAccounting,
    action_checks: [],
    detector_coverage: detectorCoverage,
  });
  report.regression_control = {
    ...regressionBinding,
    accounting_schema: "1.5",
    evidence_ref: {
      path: "regression-delta.json",
      sha256: sha256File(join(bundleDirectory, "regression-delta.json")),
    },
  };
  return {
    ...context,
    report,
    closingRepositoryObject,
  };
}
function assemblePrepareBundle(
  context: Readonly<ReturnType<typeof assemblePrepareReport>>,
): PreparedCloseout {
  const {
    options,
    mode,
    repository,
    baselineRepositoryObject,
    bundleDirectory,
    now,
    head,
    repoId,
    targetRef,
    targetCommit,
    requestSha256,
    requestSource,
    sourceKind,
    criteriaIds,
    unclassifiedPlanningPaths,
    planningSystems,
    worktrees,
    branches,
    remoteRefs,
    stashes,
    processCensusRef,
    processes,
    currentPath,
    targetObservation,
    nativeGateDiscovery,
    nativeGateCoverage,
    nativeGateValidationErrors,
    nativeGateRows,
    closingRepositoryObject,
    report,
    templates,
  } = context;
  const manifest = loadTemplate(templates, "action-manifest.json");
  manifest.repo = { id: repoId, commit: head };
  manifest.request_ref = options.requestRef;
  asObject(manifest.authorization_basis, "action-manifest.authorization_basis").ref = options.requestRef;
  manifest.mode = mode;
  if (mode === "GUARD") {
    manifest.schema_version = "1.3";
    manifest.manifest_kind = "closeout_guard";
  }
  if (mode === "GUARD") {
    manifest.guard = {
      status: "initialized",
      baseline_commit: head,
      candidate_tree: null,
      minted_at: null,
      staged_paths: [],
      writers_frozen: false,
      receipts: [],
      deterministic_gates: null,
      no_harm: null,
      commit_barrier: {
        state: "closed",
        approved_tree: null,
        receipt_ids: [],
        opened_at: null,
        crossed_action_id: null,
      },
      authority: {
        kind: "external_custody",
        precommit_sha256: null,
        crossing_sha256: null,
      },
    };
  }
  const coordination = asObject(manifest.coordination, "action-manifest.coordination");
  coordination.dispatcher = `mister-clean:${options.runId}`;
  coordination.integrator = `mister-clean:${options.runId}`;
  coordination.target = { ref: targetRef, expected_commit: targetCommit, observed_at: now };
  writeJson(join(bundleDirectory, "debris-census.json"), {
    record_type: "mister-clean.debris-census",
    removed: 0,
    retained: 0,
    unclassified: 0,
  });
  writeJson(join(bundleDirectory, "independent-review.json"), {
    record_type: "mister-clean.independent-review",
    observed_at: now,
    mechanism: "not yet run",
    status: "not_run",
    reviewer: "not-assigned",
    implementer: `mister-clean:${options.runId}`,
    candidate_commit: head,
    reviewer_execution: { harness: "not-assigned", session_id: "not-assigned", receipt_id: "not-assigned" },
    implementer_execution: { harness: "local", session_id: options.runId, receipt_id: `prepare-${options.runId}` },
    criteria_ids: criteriaIds,
    planning_system_ids: planningSystems.map((item) => item.id),
    findings_total: 0,
    findings_paid: 0,
    unresolved: 0,
  });
  const bundle = loadTemplate(templates, "closure-bundle.json");
  Object.assign(bundle, {
    run_id: options.runId,
    request_ref: options.requestRef,
    custody: { mode: "sidecar", subject_commit: head, evidence_root: null, evidence_paths: [] },
    criteria_discovery: {
      source_kind: sourceKind,
      request_source: requestSource,
      source_refs: [
        { path: "criteria-source.json", sha256: sha256File(join(bundleDirectory, "criteria-source.json")) },
      ],
      request_sha256: requestSha256,
      discovered_count: criteriaIds.length,
      none_found: criteriaIds.length === 0,
      criteria_ids: criteriaIds,
    },
    change_inventory: { start_commit: head, subject_commit: head, changes: [] },
    planning_discovery: { unknown: unclassifiedPlanningPaths.size > 0, systems: planningSystems },
  });
  bundle.successor_readiness = {
    snapshots: {
      start: {
        kind: "repository_snapshot",
        object: baselineRepositoryObject.sha256,
        repository_object: baselineRepositoryObject,
        commit: baselineRepositoryObject.head_commit,
        command: "captureRepositoryObject before evidence-directory creation",
        result: baselineRepositoryObject.sha256,
        observed_at: now,
      },
      end: {
        kind: "repository_snapshot",
        object: closingRepositoryObject.sha256,
        repository_object: closingRepositoryObject,
        commit: closingRepositoryObject.head_commit,
        command: "captureRepositoryObject after baseline detector execution",
        result: closingRepositoryObject.sha256,
        observed_at: now,
      },
    },
    target_observation: targetObservation,
    topology: {
      worktrees,
      branches,
      remote_refs: remoteRefs,
      stashes,
      process_census_ref: processCensusRef,
      processes,
      dirty: worktrees.filter((item) => item.dirty_count > 0).length,
      unowned: worktrees.length + branches.length + remoteRefs.length + processes.length,
      unmerged: [...branches, ...remoteRefs].filter((item) => !item.merged).length,
      blocking_processes: processes.length,
    },
    current_state: currentPath
      ? {
          state: "candidate_unverified",
          path: currentPath,
          sha256: sha256File(join(repository, currentPath)),
          commit: head,
          generator: "discovered candidate; requires explicit designation",
          designation: null,
        }
      : {
          state: "missing",
          path: null,
          sha256: null,
          commit: head,
          generator: "not yet created",
          designation: null,
        },
    native_gate_control: {
      discovery_ref: {
        path: "native-gate-discovery.json",
        sha256: sha256File(join(bundleDirectory, "native-gate-discovery.json")),
      },
      coverage_ref: {
        path: "native-gate-coverage.json",
        sha256: sha256File(join(bundleDirectory, "native-gate-coverage.json")),
      },
      validation_ref: {
        path: "native-gate-validation.json",
        sha256: sha256File(join(bundleDirectory, "native-gate-validation.json")),
      },
      evidence_root: "native-gate-output",
      required_count: nativeGateDiscovery.required_gate_ids.length,
      passed_count: nativeGateCoverage.executions.filter((execution) => execution.state === "passed").length,
      absent_count: nativeGateDiscovery.gates.filter((gate) => gate.disposition === "absent").length,
      validation_error_count: nativeGateValidationErrors.length,
    },
    gates: nativeGateRows,
    debris: {
      removed: 0,
      retained: 0,
      unclassified: 0,
      evidence: [
        { path: "debris-census.json", sha256: sha256File(join(bundleDirectory, "debris-census.json")) },
      ],
    },
    handoff: {
      entrypoints: currentPath ? [currentPath] : [],
      next_owner: "unassigned-by-policy",
      next_action: "pay the first open debt discovered by Mister Clean",
    },
    final_review: {
      mechanism: "not yet run",
      status: "not_run",
      reviewer: "not-assigned",
      implementer: `mister-clean:${options.runId}`,
      reviewer_execution: { harness: "not-assigned", session_id: "not-assigned", receipt_id: "not-assigned" },
      implementer_execution: { harness: "local", session_id: options.runId, receipt_id: `prepare-${options.runId}` },
      criteria_reviewed: false,
      planning_reviewed: false,
      findings_total: 0,
      findings_paid: 0,
      unresolved: 0,
      evidence_ref: {
        path: "independent-review.json",
        sha256: sha256File(join(bundleDirectory, "independent-review.json")),
      },
    },
  };
  writeJson(join(bundleDirectory, "action-manifest.json"), manifest);
  writeJson(join(bundleDirectory, "closeout-report.json"), report);
  bundle.manifest = {
    path: "action-manifest.json",
    sha256: sha256File(join(bundleDirectory, "action-manifest.json")),
  };
  bundle.report = {
    path: "closeout-report.json",
    sha256: sha256File(join(bundleDirectory, "closeout-report.json")),
  };
  const bundlePath = join(bundleDirectory, "closure-bundle.json");
  writeJson(bundlePath, bundle);
  const verifiedClosingRepositoryObject = captureRepositoryObject(repository);
  if (verifiedClosingRepositoryObject.sha256 !== closingRepositoryObject.sha256) {
    throw new Error("repository changed before closeout preparation completed");
  }
  return { bundleDirectory, bundlePath };
}
