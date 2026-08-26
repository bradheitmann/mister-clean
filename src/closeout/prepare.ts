import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import {
  discoverPlanningRoots,
  git,
  isGitAncestor,
  listFilesRecursively,
  packageRoot,
  parseWorktrees,
  PLANNING_LANE_NAMES,
  readJson,
  repositoryIdentity,
  runGit,
  sha256File,
  writeJson,
} from "./repository.js";
import { auditPlanningRepository } from "./planning.js";
import { REGRESSION_POLICY } from "./records.js";
import { auditSemanticRepository } from "./semantic.js";

type JsonObject = Record<string, unknown>;

export interface PrepareCloseoutOptions {
  readonly repo: string;
  readonly evidenceHome: string;
  readonly runId: string;
  readonly requestRef: string;
  readonly requestSource?: string;
  readonly requestText?: string;
  readonly semanticManifestPath?: string;
  readonly executeSemanticProbes?: boolean;
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

export function prepareCloseout(options: PrepareCloseoutOptions): PreparedCloseout {
  if (options.requestSource !== undefined && options.requestText !== undefined) {
    throw new Error("requestSource and requestText are mutually exclusive");
  }
  if (!options.runId.trim()) throw new Error("runId is required");
  if (!options.requestRef.trim()) throw new Error("requestRef is required");
  if (options.executeSemanticProbes && options.semanticManifestPath === undefined) {
    throw new Error("executeSemanticProbes requires semanticManifestPath");
  }
  const mode = options.mode ?? "CLOSE";
  if (!new Set(["CLOSE", "GUARD"]).has(mode)) throw new Error(`unsupported prepare mode: ${mode}`);

  const requestedRepository = resolve(options.repo);
  const repository = resolve(git(requestedRepository, "rev-parse", "--show-toplevel"));
  const bundleDirectory = join(resolve(options.evidenceHome), "mister-clean", options.runId);
  if (existsSync(bundleDirectory)) {
    throw new Error(`refusing to overwrite existing run directory: ${bundleDirectory}`);
  }
  mkdirSync(bundleDirectory, { recursive: true });

  const templates = options.templateRoot ?? packageRoot();
  const now = isoTimestamp((options.now ?? (() => new Date()))());
  const head = git(repository, "rev-parse", "HEAD");
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
  const planningAudit = auditPlanningRepository(repository);
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
  const semanticAudit = auditSemanticRepository(repository, {
    execute: options.executeSemanticProbes ?? false,
    ...(options.semanticManifestPath === undefined ? {} : { manifestPath: options.semanticManifestPath }),
  });
  writeJson(join(bundleDirectory, "semantic-audit.json"), semanticAudit);
  const semanticAuditRef = {
    path: "semantic-audit.json",
    sha256: sha256File(join(bundleDirectory, "semantic-audit.json")),
  };
  let planningSystems: JsonObject[];
  if (planningRoots.length) {
    planningSystems = planningRoots.map((rootText, index) => {
      const root = join(repository, ...rootText.split("/"));
      const rootStat = lstatSync(root);
      const rootFiles = rootStat.isFile() ? [root] : rootStat.isDirectory() ? listFilesRecursively(root) : [];
      const artifacts = rootFiles
        .filter((path) => !relative(repository, path).split(sep).includes(".git"))
        .map((path) => {
          const repoPath = relative(repository, path).split(sep).join("/");
          return {
            path: repoPath,
            class: unclassifiedPlanningPaths.has(repoPath) ? "unclassified" : planningClass(repoPath),
            sha256: sha256File(path),
          };
        });
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
          artifacts,
        },
      };
    });
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

  const report = loadTemplate(templates, "closeout-report.json");
  const validationDebtClasses = new Set([
    "acceptance_cascade_unexecuted",
    "acceptance_gate_unknown",
    "completed_parent_unexecuted_acceptance",
  ]);
  const planningDebts = planningAudit.root_debts.map((debt) => ({
    id: debt.id.replace("ROOT-", "DEBT-"),
    class: debt.class,
    cause_key: debt.cause_key,
    observation_count: debt.observation_count,
    raw_finding_ids: debt.raw_finding_ids,
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
  }));
  const semanticCommand = options.semanticManifestPath === undefined
    ? "mister-clean audit semantic . --json"
    : `mister-clean audit semantic . --manifest semantic-probe-manifest${options.executeSemanticProbes ? " --execute" : ""} --json`;
  const semanticDebts = semanticAudit.findings.map((finding) => ({
    id: `DEBT-SEMANTIC-${sha256(Buffer.from(`${finding.candidate_id}\0${finding.code}\0${finding.refs.join("\0")}\0${finding.detail.replaceAll(/\s+/g, " ")}`, "utf8")).slice(0, 16).toUpperCase()}`,
    class: finding.code,
    cause_key: finding.candidate_id,
    observation_count: 1,
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
      object: head,
      command: semanticCommand,
      result: `${finding.code}: ${finding.detail}`,
      observed_at: now,
      evidence_ref: semanticAuditRef,
    }],
  }));
  const completionDebts = [...planningDebts, ...semanticDebts];
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
  });
  if (completionDebts.length > 0) {
    Object.assign(asObject(asObject(report.dimensions, "closeout-report.dimensions").completion_debt, "closeout-report.dimensions.completion_debt"), {
      state: "open",
      evidence: [{ kind: "debt_census", object: head, command: "mister-clean prepare closeout census", result: `${completionDebts.length} total root debts (${planningDebts.length} planning, ${semanticDebts.length} semantic)`, observed_at: now }],
      notes: ["Executable planning and semantic audits found payable successor-readiness debt."],
    });
  }
  if (planningDebts.length > 0) {
    Object.assign(asObject(asObject(report.dimensions, "closeout-report.dimensions").planning_integrity, "closeout-report.dimensions.planning_integrity"), {
      state: "open",
      evidence: [{ kind: "planning_census", object: head, command: "mister-clean audit planning . --json", result: `${planningAudit.raw_finding_count} raw findings / ${planningDebts.length} root debts`, observed_at: now }],
      notes: ["Physical lanes, structured metadata, exact parent projections, and acceptance-gate identity do not yet agree."],
    });
  }
  if (semanticDebts.length > 0) {
    Object.assign(asObject(asObject(report.dimensions, "closeout-report.dimensions").verification, "closeout-report.dimensions.verification"), {
      state: "open",
      evidence: [{ kind: "validation_summary", object: head, command: semanticCommand, result: `${semanticDebts.length} unproved, pending, or failed semantic probes`, observed_at: now }],
      notes: ["Critical construction and composition-root claims require bound, executed evidence; prose and isolated unit tests are insufficient."],
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

  const regressionCounts = {
    policy: REGRESSION_POLICY,
    baseline_object: head,
    closing_object: head,
    baseline_findings: completionDebts.length,
    closing_findings: completionDebts.length,
    baseline_paid: 0,
    baseline_open: completionDebts.length,
    newly_discovered_preexisting_paid: 0,
    newly_discovered_preexisting_open: 0,
    concurrent_external_paid: 0,
    concurrent_external_open: 0,
    introduced_by_run_paid: 0,
    introduced_by_run_open: 0,
  };
  writeJson(join(bundleDirectory, "regression-delta.json"), {
    record_type: "mister-clean.regression-delta",
    schema_version: "1.2",
    ...regressionCounts,
    action_checks: [],
  });
  report.regression_control = {
    ...regressionCounts,
    action_checks: 0,
    evidence_ref: {
      path: "regression-delta.json",
      sha256: sha256File(join(bundleDirectory, "regression-delta.json")),
    },
  };

  const manifest = loadTemplate(templates, "action-manifest.json");
  manifest.repo = { id: repoId, commit: head };
  manifest.request_ref = options.requestRef;
  asObject(manifest.authorization_basis, "action-manifest.authorization_basis").ref = options.requestRef;
  manifest.mode = mode;
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
        object: head,
        command: "git rev-parse HEAD plus full topology census",
        result: head,
        observed_at: now,
      },
      end: {
        kind: "repository_snapshot",
        object: head,
        command: "initial scaffold; closing snapshot not yet taken",
        result: head,
        observed_at: now,
      },
    },
    target_observation: targetObservation,
    topology: {
      worktrees,
      branches,
      remote_refs: remoteRefs,
      stashes,
      processes: [],
      dirty: worktrees.filter((item) => item.dirty_count > 0).length,
      unowned: worktrees.length + branches.length + remoteRefs.length,
      unmerged: [...branches, ...remoteRefs].filter((item) => !item.merged).length,
      blocking_processes: 0,
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
    gates: [],
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
  return { bundleDirectory, bundlePath };
}
