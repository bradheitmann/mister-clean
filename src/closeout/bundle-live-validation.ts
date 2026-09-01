/** Live repository, detector, topology, and native-gate revalidation. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { captureRelevantProcessCensus, successorProcessRows } from "./action-hygiene.js";
import {
  createDetectorRunPolicy,
  findingFingerprintsFromAudit,
  requiredDetectorIdsForPolicy,
  sortedUnique,
} from "./detector-coverage.js";
import { canonicalObservationId } from "./regression-accounting.js";
import { auditGitHubActionsRepository } from "./github-actions.js";
import { loadDenylist, scanTrackedPublicSafetySync } from "./inspection.js";
import {
  discoverNativeGates,
  nativeGateFailureObservations,
  type NativeGateCoverage,
  type NativeGateDiscovery,
} from "./native-gates.js";
import { runNativeGates } from "./native-gate-runner.js";
import { validateNativeGateCoverage } from "./native-gate-validation.js";
import { auditPlanningRepository } from "./planning.js";
import { captureRepositoryObject } from "./repository-object.js";
import { auditSemanticRepository } from "./semantic.js";
import { auditSemanticEvidencePackageV2 } from "./semantic-v2.js";
import {
  HEX64,
  array,
  contained,
  loadRef,
  object,
  owned,
  sha256,
  stableEqual,
  text,
  type BundlePorts,
  type FilePort,
  type GitPort,
  type JsonObject,
} from "./bundle-runtime.js";
import {
  repositoryIdentity,
  validateGuardLiveAuthority,
} from "./bundle-guard-authority.js";

export const LOCAL_ACTION_KINDS = new Set([
  "local_edit", "local_move", "recoverable_delete", "doc_update",
  "planning_record_update", "historical_conform", "handoff_update",
]);

async function validateLiveRepositoryAndTarget(
  bundle: JsonObject, report: JsonObject, repo: string, files: FilePort, git: GitPort, errors: string[],
): Promise<{ readonly head: string; readonly subject: unknown; readonly successor: JsonObject }> {
    const top = await files.realpath(resolve((await git.run(repo, ["rev-parse", "--show-toplevel"])).stdout));
    const requestedRoot = await files.realpath(resolve(repo));
    if (top !== requestedRoot) errors.push(`$.live_repo: expected worktree root ${top}, got ${requestedRoot}`);
    const head = (await git.run(repo, ["rev-parse", "HEAD"])).stdout;
    const subject = object(report.repo)?.commit;
    if ((await git.run(repo, ["cat-file", "-e", `${String(subject ?? "")}^{commit}`], [0, 128])).code !== 0) errors.push("$.report.repo.commit: subject commit does not exist in live repository");
    const custody = object(bundle.custody) ?? {};
    if (custody.mode !== "sidecar") errors.push("$.custody.mode: only sidecar is supported");
    else if (head !== subject) errors.push(`$.custody: sidecar validation requires live HEAD ${head} == subject ${String(subject)}`);
    if (object(report.repo)?.id !== await repositoryIdentity(repo, git, files)) errors.push("$.report.repo.id: does not match independently resolved live repository identity");
    if ((await git.run(repo, ["status", "--porcelain=v1", "--untracked-files=all"])).stdout) errors.push("$.report.repo: CLEAN requires a clean live working tree");
    const successor = object(bundle.successor_readiness) ?? {};
    const observation = object(successor.target_observation) ?? {};
    const target = object(report.target_binding) ?? {};
    if (observation.local_ref !== target.target_ref) errors.push("$.successor_readiness.target_observation.local_ref: must equal report target_binding.target_ref");
    const liveTarget = (await git.run(repo, ["rev-parse", String(observation.local_ref ?? "")])).stdout;
    if (liveTarget !== target.target_commit) errors.push("$.report.target_binding.target_commit: live target differs");
    if (observation.commit !== liveTarget) errors.push("$.successor_readiness.target_observation.commit: must equal live target");
    const mergeBase = (await git.run(repo, ["merge-base", liveTarget, String(subject ?? "")])).stdout;
    if (mergeBase !== target.merge_base) errors.push("$.report.target_binding.merge_base: live merge base differs");
    const divergence = (await git.run(repo, ["rev-list", "--left-right", "--count", `${liveTarget}...${String(subject ?? "")}`])).stdout.split(/\s+/, 2).map(Number);
    if (divergence[0] !== target.target_commits_missing || divergence[1] !== target.candidate_commits_ahead) errors.push("$.report.target_binding: live left/right divergence differs");
    const upstream = (await git.run(repo, ["rev-parse", "--symbolic-full-name", "@{upstream}"], [0, 128])).stdout;
    const remotes = (await git.run(repo, ["remote"])).stdout.split("\n").filter(Boolean);
    if (observation.kind === "remote_ref_resolution") {
      const remote = String(observation.remote ?? "");
      const remoteRef = String(observation.remote_ref ?? "");
      const result = await git.run(repo, ["ls-remote", "--heads", remote, remoteRef], [0, 2, 128]);
      const observed = result.stdout.split("\n").filter(Boolean)[0]?.split(/\s+/, 1)[0] ?? "";
      if (observed !== liveTarget) errors.push("$.successor_readiness.target_observation: remote ref differs from live target");
    }
    if (upstream && observation.kind !== "remote_ref_resolution") errors.push("$.successor_readiness.target_observation: configured upstream forbids local-only target proof");
    if (upstream) {
      if (observation.local_ref !== upstream) errors.push(`$.successor_readiness.target_observation.local_ref: must equal configured upstream ${upstream}`);
      const branch = String(object(report.repo)?.branch ?? "");
      const remoteName = (await git.run(repo, ["config", "--get", `branch.${branch}.remote`], [0, 1])).stdout;
      const mergeRef = (await git.run(repo, ["config", "--get", `branch.${branch}.merge`], [0, 1])).stdout;
      if (observation.remote !== remoteName || observation.remote_ref !== mergeRef) errors.push("$.successor_readiness.target_observation: remote/ref tuple differs from configured upstream");
    } else if (remotes.length && observation.kind === "local_ref_resolution") errors.push("$.successor_readiness.target_observation: CLEAN cannot use local-only target proof while remotes exist");
  return { head, subject, successor };
}

async function validateLiveTopology(
  successor: JsonObject, repo: string, head: string, subject: unknown,
  ports: BundlePorts, errors: string[],
): Promise<void> {
  const { files, git } = ports;
    const topology = object(successor.topology) ?? {};
    const worktreeOutput = (await git.run(repo, ["worktree", "list", "--porcelain"])).stdout;
    const liveWorktrees = worktreeOutput.split(/\n\n+/).filter(Boolean).map((block) => {
      const row: Record<string, string> = {};
      for (const line of block.split("\n")) {
        const [key = "", ...rest] = line.split(" ");
        if (new Set(["worktree", "HEAD", "branch"]).has(key)) row[key.toLocaleLowerCase("und")] = rest.join(" ");
        else if (key === "detached") row.branch = "detached";
      }
      return row;
    });
    const reportedWorktrees = new Map<string, JsonObject>();
    for (const raw of array(topology.worktrees)) {
      const row = object(raw);
      if (row && text(row.path)) reportedWorktrees.set(await files.realpath(resolve(row.path)), row);
    }
    const liveWorktreePaths = new Set<string>();
    let dirty = 0;
    let unowned = 0;
    let unmerged = 0;
    for (const row of liveWorktrees) {
      const livePath = await files.realpath(resolve(row.worktree ?? ""));
      liveWorktreePaths.add(livePath);
      const reported = reportedWorktrees.get(livePath) ?? {};
      if (!owned(reported.owner)) unowned += 1;
      const dirtyCount = (await git.run(livePath, ["status", "--porcelain=v1", "--untracked-files=all"])).stdout.split("\n").filter(Boolean).length;
      if (dirtyCount > 0) dirty += 1;
      if (reported.head !== row.head || reported.branch !== row.branch) errors.push(`$.successor_readiness.topology.worktrees[${JSON.stringify(livePath)}]: live head/branch differs`);
      if (reported.dirty_count !== dirtyCount) errors.push(`$.successor_readiness.topology.worktrees[${JSON.stringify(livePath)}].dirty_count: live count differs`);
      if ((await git.run(repo, ["merge-base", "--is-ancestor", row.head ?? "", head], [0, 1])).code !== 0) unmerged += 1;
    }
    if (!stableEqual([...liveWorktreePaths].sort(), [...reportedWorktrees.keys()].sort())) errors.push("$.successor_readiness.topology.worktrees: live path set differs");
    let liveProcessRows = array(topology.processes).map(object).filter((row): row is JsonObject => !!row);
    if (ports.processes) {
      const liveProcessCensus = captureRelevantProcessCensus(
        [...liveWorktreePaths],
        { processPort: ports.processes },
      );
      if (liveProcessCensus.status !== "complete") {
        errors.push(`$.successor_readiness.topology.processes: live process census is ${liveProcessCensus.status}: ${liveProcessCensus.errors.join("; ")}`);
      }
      liveProcessRows = successorProcessRows(liveProcessCensus) as unknown as JsonObject[];
      if (!stableEqual(topology.processes, liveProcessRows)) {
        errors.push("$.successor_readiness.topology.processes: live process set differs");
      }
    }
    unowned += liveProcessRows.filter((row) => !owned(row.owner)).length;
    const liveBlockingProcesses = liveProcessRows.filter((row) => row.blocking === true).length;
    if (topology.blocking_processes !== liveBlockingProcesses) {
      errors.push(`$.successor_readiness.topology.blocking_processes: live count ${liveBlockingProcesses} differs`);
    }
    const branchLines = (await git.run(repo, ["for-each-ref", "--format=%(refname:short)%09%(objectname)", "refs/heads"])).stdout.split("\n").filter(Boolean);
    const liveBranches = new Map(branchLines.map((line) => line.split("\t", 2) as [string, string]));
    const reportedBranches = new Map(array(topology.branches).map(object).filter(Boolean).map((row) => [String(row!.name), row!]));
    if (!stableEqual([...liveBranches.keys()].sort(), [...reportedBranches.keys()].sort())) errors.push("$.successor_readiness.topology.branches: live branch set differs");
    for (const [name, commit] of liveBranches) {
      const reported = reportedBranches.get(name) ?? {};
      if (!owned(reported.owner)) unowned += 1;
      const merged = (await git.run(repo, ["merge-base", "--is-ancestor", commit, head], [0, 1])).code === 0;
      if (reported.commit !== commit || reported.merged !== merged) errors.push(`$.successor_readiness.topology.branches[${JSON.stringify(name)}]: live commit/merged differs`);
      if (!merged) unmerged += 1;
    }
    const remoteLines = (await git.run(repo, ["for-each-ref", "--format=%(refname)%09%(objectname)", "refs/remotes"])).stdout.split("\n").filter((line) => line && !line.split("\t", 1)[0]!.endsWith("/HEAD"));
    const liveRemoteRefs = new Map(remoteLines.map((line) => line.split("\t", 2) as [string, string]));
    const reportedRemoteRefs = new Map(array(topology.remote_refs).map(object).filter(Boolean).map((row) => [String(row!.name), row!]));
    if (!stableEqual([...liveRemoteRefs.keys()].sort(), [...reportedRemoteRefs.keys()].sort())) errors.push("$.successor_readiness.topology.remote_refs: live remote-ref set differs");
    for (const [name, commit] of liveRemoteRefs) {
      const reported = reportedRemoteRefs.get(name) ?? {};
      if (!owned(reported.owner)) unowned += 1;
      const merged = (await git.run(repo, ["merge-base", "--is-ancestor", commit, String(subject ?? "")], [0, 1])).code === 0;
      if (reported.commit !== commit || reported.merged !== merged) errors.push(`$.successor_readiness.topology.remote_refs[${JSON.stringify(name)}]: live commit/merged differs`);
      if (!merged) unmerged += 1;
    }
    const liveStashes = (await git.run(repo, ["stash", "list", "--format=%gd%09%H%09%gs"])).stdout.split("\n").filter(Boolean);
    if (!stableEqual(topology.stashes, liveStashes)) errors.push("$.successor_readiness.topology.stashes: live stash set differs");
    if (topology.dirty !== dirty || topology.unowned !== unowned || topology.unmerged !== unmerged) errors.push(`$.successor_readiness.topology: live counts dirty=${dirty} unowned=${unowned} unmerged=${unmerged} differ`);
}

async function validateLiveSuccessorFiles(
  successor: JsonObject, manifest: JsonObject, repo: string, subject: unknown,
  files: FilePort, git: GitPort, errors: string[],
): Promise<void> {
    const current = object(successor.current_state) ?? {};
    if (text(current.path)) {
      const relCurrent = current.path;
      const currentPath = await contained(files, repo, relCurrent);
      if (relCurrent === ".git" || relCurrent.startsWith(".git/")) errors.push("$.successor_readiness.current_state.path: Git metadata cannot be a successor entrypoint");
      else if (!currentPath || !(await files.isFile(currentPath))) errors.push("$.successor_readiness.current_state.path: missing, not a file, or outside repository");
      else if (sha256(await files.readBytes(currentPath)) !== current.sha256) errors.push("$.successor_readiness.current_state.sha256: live digest differs");
      else if ((await git.run(repo, ["cat-file", "-e", `${String(subject)}:${relCurrent}`], [0, 128])).code !== 0) errors.push("$.successor_readiness.current_state.path: must exist in the subject commit");
    }
    if (current.commit !== subject) errors.push("$.successor_readiness.current_state.commit: must equal subject commit");
    for (const [index, entry] of array(object(successor.handoff)?.entrypoints).entries()) {
      const resolved = await contained(files, repo, entry);
      if (!text(entry) || isAbsolute(entry) || entry === ".git" || entry.startsWith(".git/") || !resolved || !(await files.isFile(resolved))) errors.push(`$.successor_readiness.handoff.entrypoints[${index}]: must be an existing repository-relative file outside .git`);
    }
    for (const name of ["start", "end"] as const) {
      const snapshot = object(object(successor.snapshots)?.[name]) ?? {};
      const commit = String(snapshot.commit ?? snapshot.object ?? "");
      if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(commit) || (await git.run(repo, ["cat-file", "-e", `${commit}^{commit}`], [0, 128])).code !== 0) errors.push(`$.successor_readiness.snapshots.${name}.commit: must be an existing full commit`);
    }
    if ((object(object(successor.snapshots)?.end)?.commit ?? object(object(successor.snapshots)?.end)?.object) !== subject) {
      errors.push("$.successor_readiness.snapshots.end.commit: must equal subject commit");
    }
    for (const [index, raw] of array(manifest.actions).entries()) {
      const action = object(raw);
      if (action && LOCAL_ACTION_KINDS.has(String(action.kind))) {
        const actionPath = await contained(files, repo, action.target);
        if (!actionPath) errors.push(`$.manifest.actions[${index}].target: resolves outside repository through traversal or symlink`);
      }
    }
}

async function loadLiveRegressionBoundary(
  report: JsonObject, bundlePath: string, repo: string, files: FilePort, errors: string[],
): Promise<{ readonly closingRepositoryObject: JsonObject | undefined; readonly coverage: JsonObject | undefined }> {
    const regressionRecord = (await loadRef(
      files,
      dirname(resolve(bundlePath)),
      object(report.regression_control)?.evidence_ref,
      "$.report.regression_control.evidence_ref",
      errors,
      false,
    )).data;
    const closingRepositoryObject = object(regressionRecord?.closing_repository_object);
    if (closingRepositoryObject) {
      const liveRepositoryObject = captureRepositoryObject(repo);
      if (!stableEqual(liveRepositoryObject, closingRepositoryObject)) {
        errors.push("$.report.regression_control.evidence_ref.closing_repository_object: live repository object differs");
      }
    } else {
      errors.push("$.report.regression_control.evidence_ref.closing_repository_object: CLEAN requires a bound repository object");
    }
    const coverage = object(regressionRecord?.detector_coverage);
  return { closingRepositoryObject, coverage };
}

async function validateLiveDetectors(
  report: JsonObject, bundlePath: string, repo: string, coverage: JsonObject | undefined,
  files: FilePort, git: GitPort, errors: string[],
): Promise<Set<string>> {
    const trackedPaths = (await git.run(repo, ["ls-files", "-z"])).stdout.split("\0").filter(Boolean);
    const liveRunPolicy = createDetectorRunPolicy({ trackedShippablePathCount: trackedPaths.length });
    if (!stableEqual(coverage?.run_policy, liveRunPolicy)) {
      errors.push("$.live_detector_coverage.run_policy: recorded applicability differs from the live tracked shippable surface");
    }
    const liveRequiredDetectorIds = requiredDetectorIdsForPolicy(liveRunPolicy) ?? [];
    const executionFor = (detectorId: string): JsonObject | undefined => array(coverage?.executions)
      .map(object)
      .find((execution) => execution?.detector_id === detectorId);
    const frozenInput = async (detectorId: string, kind: string): Promise<string | undefined> => {
      const execution = executionFor(detectorId);
      const input = array(execution?.input_refs).map(object).find((ref) => ref?.kind === kind);
      if (!input) return undefined;
      return contained(files, dirname(resolve(bundlePath)), input.path);
    };
    const publicSafetyDenylist = await frozenInput("public_safety", "public_safety_denylist");
    const semanticManifest = await frozenInput("semantic_boundary", "semantic_probe_manifest");
    const semanticEvidencePackage = await frozenInput("semantic_boundary", "semantic_evidence_package");
    const semanticTrustPolicy = await frozenInput("semantic_boundary", "semantic_trust_policy");
    const semanticExecution = executionFor("semantic_boundary");
    const semanticResult = semanticExecution
      ? await loadRef(files, dirname(resolve(bundlePath)), semanticExecution.result_ref, "$.live_detector_coverage.semantic_boundary.result_ref", errors, false)
      : {};
    const executeSemanticProbes = Number(semanticResult.data?.executed_probe_count ?? 0) > 0;
    const acceptedDetectorFindings = new Set<string>();
    const acceptedObservationIds = new Set<string>();
    for (const rawDebt of array(report.completion_debts)) {
      const debt = object(rawDebt);
      if (debt?.state !== "accepted_exception" || debt.disposition !== "accepted_exception") continue;
      for (const observationId of array(debt.observation_ids)) {
        if (typeof observationId === "string" && HEX64.test(observationId)) {
          acceptedObservationIds.add(observationId);
        }
      }
      const detectorFamily = String(object(debt.cause_key)?.detector_family ?? "");
      for (const fingerprint of array(debt.detector_finding_fingerprints)) {
        if (typeof fingerprint === "string" && HEX64.test(fingerprint)) {
          acceptedDetectorFindings.add(`${detectorFamily}\0${fingerprint}`);
        }
      }
    }
    const planningLive = auditPlanningRepository(repo);
    const githubActionsLive = auditGitHubActionsRepository(repo);
    let semanticLive;
    if ((semanticEvidencePackage === undefined) !== (semanticTrustPolicy === undefined)) {
      errors.push("$.live_detector_coverage.semantic_boundary: v2 live revalidation requires both frozen evidence package and trust policy");
      semanticLive = auditSemanticRepository(repo);
    } else if (semanticEvidencePackage !== undefined && semanticTrustPolicy !== undefined) {
      semanticLive = auditSemanticEvidencePackageV2(repo, semanticEvidencePackage, semanticTrustPolicy);
    } else {
      semanticLive = auditSemanticRepository(repo, {
        execute: executeSemanticProbes,
        ...(semanticManifest === undefined ? {} : { manifestPath: semanticManifest }),
      });
    }
    const liveDetectorFindings: Array<readonly [string, readonly string[] | undefined]> = [
      ["planning_graph", findingFingerprintsFromAudit("planning_graph", planningLive)],
      ["github_actions", findingFingerprintsFromAudit("github_actions", githubActionsLive)],
      ["semantic_boundary", findingFingerprintsFromAudit("semantic_boundary", semanticLive)],
    ];
    if (liveRequiredDetectorIds.includes("public_safety")) {
      const publicSafetyResult = scanTrackedPublicSafetySync(repo, trackedPaths, await loadDenylist(publicSafetyDenylist));
      const policyTrackedPathCount = object(object(coverage?.run_policy)?.public_safety)?.tracked_path_count;
      if (policyTrackedPathCount !== trackedPaths.length) {
        errors.push(`$.live_detector_coverage.public_safety: tracked path count drifted from bound policy (${String(policyTrackedPathCount)} -> ${trackedPaths.length})`);
      }
      liveDetectorFindings.splice(1, 0, [
        "public_safety",
        findingFingerprintsFromAudit("public_safety", publicSafetyResult),
      ]);
    }
    for (const [detectorId, fingerprints] of liveDetectorFindings) {
      if (!fingerprints) {
        errors.push(`$.live_detector_coverage.${detectorId}: fresh registered detector result was not canonical`);
        continue;
      }
      const payable = fingerprints.filter((fingerprint) => (
        !acceptedDetectorFindings.has(`${detectorId}\0${fingerprint}`)
      ));
      if (payable.length !== 0) {
        errors.push(`$.live_detector_coverage.${detectorId}: CLEAN requires zero payable findings after principal-ratified exceptions (got ${payable.length})`);
      }
    }
  return acceptedObservationIds;
}

async function validateLiveNativeGates(
  successor: JsonObject, closingRepositoryObject: JsonObject | undefined,
  acceptedObservationIds: ReadonlySet<string>, bundlePath: string, repo: string,
  files: FilePort, errors: string[],
): Promise<void> {
    if (closingRepositoryObject) {
      const nativeControl = object(successor.native_gate_control);
      const recordedDiscovery = nativeControl
        ? (await loadRef(
            files,
            dirname(resolve(bundlePath)),
            nativeControl.discovery_ref,
            "$.live_native_gates.recorded_discovery_ref",
            errors,
            false,
          )).data
        : undefined;
      const recordedCoverage = nativeControl
        ? (await loadRef(
            files,
            dirname(resolve(bundlePath)),
            nativeControl.coverage_ref,
            "$.live_native_gates.recorded_coverage_ref",
            errors,
            false,
          )).data
        : undefined;
      const liveObject = captureRepositoryObject(repo);
      if (stableEqual(liveObject, closingRepositoryObject)) {
        try {
          const liveDiscovery = discoverNativeGates(
            repo,
            liveObject,
          );
          if (!recordedDiscovery || !stableEqual(liveDiscovery, recordedDiscovery)) {
            errors.push("$.live_native_gates.discovery: fresh canonical discovery differs from recorded successor discovery");
          }
          const evidenceDirectory = await mkdtemp(join(tmpdir(), "mister-clean-live-native-"));
          try {
            const liveCoverage = await runNativeGates(
              repo,
              liveDiscovery,
              evidenceDirectory,
            );
            const liveNativeErrors = await validateNativeGateCoverage(
              liveCoverage,
              liveDiscovery,
              liveObject,
              evidenceDirectory,
              { validation_time: new Date(), require_passing: false },
            );
            for (const error of liveNativeErrors) errors.push(`$.live_native_gates.execution: ${error}`);
            const liveFailureIds = sortedUnique(nativeGateFailureObservations(
              liveDiscovery,
              liveCoverage,
            ).map((projection) => canonicalObservationId({
              source_id: projection.source_id,
              source_native_fingerprint: projection.source_native_fingerprint,
            })));
            if (recordedDiscovery && recordedCoverage) {
              const recordedFailureIds = sortedUnique(nativeGateFailureObservations(
                recordedDiscovery as unknown as NativeGateDiscovery,
                recordedCoverage as unknown as NativeGateCoverage,
              ).map((projection) => canonicalObservationId({
                source_id: projection.source_id,
                source_native_fingerprint: projection.source_native_fingerprint,
              })));
              if (!stableEqual(liveFailureIds, recordedFailureIds)) {
                errors.push("$.live_native_gates.execution: fresh failure observations differ from the recorded successor boundary");
              }
            }
            const payableNative = liveFailureIds.filter((id) => !acceptedObservationIds.has(id));
            if (payableNative.length !== 0) {
              errors.push(`$.live_native_gates.execution: CLEAN requires zero payable native-gate findings after principal-ratified exceptions (got ${payableNative.length})`);
            }
          } finally {
            await rm(evidenceDirectory, { recursive: true, force: true });
          }
        } catch (error) {
          errors.push(`$.live_native_gates: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
}

function validateLiveClosingRecheck(
  closingRepositoryObject: JsonObject | undefined, repo: string, errors: string[],
): void {
    if (closingRepositoryObject) {
      const verifiedLiveRepositoryObject = captureRepositoryObject(repo);
      const driftError = "$.report.regression_control.evidence_ref.closing_repository_object: live repository object differs";
      if (!stableEqual(verifiedLiveRepositoryObject, closingRepositoryObject)
        && !errors.includes(driftError)) errors.push(driftError);
    }
}

export async function validateLive(
  bundle: JsonObject, report: JsonObject, manifest: JsonObject, bundlePath: string,
  repo: string, ports: BundlePorts, guardAuthorityPath: string | undefined, errors: string[],
): Promise<void> {
  const { files, git } = ports;
  if (!(await files.exists(repo))) { errors.push(`$.live_repo: repository not found: ${repo}`); return; }
  if (manifest.mode === "GUARD") {
    await validateGuardLiveAuthority(bundle, report, manifest, bundlePath, repo, ports, guardAuthorityPath, errors);
    return;
  }
  try {
    const { head, subject, successor } = await validateLiveRepositoryAndTarget(bundle, report, repo, files, git, errors);
    await validateLiveTopology(successor, repo, head, subject, ports, errors);
    await validateLiveSuccessorFiles(successor, manifest, repo, subject, files, git, errors);
    const { closingRepositoryObject, coverage } = await loadLiveRegressionBoundary(report, bundlePath, repo, files, errors);
    const acceptedObservationIds = await validateLiveDetectors(report, bundlePath, repo, coverage, files, git, errors);
    await validateLiveNativeGates(successor, closingRepositoryObject, acceptedObservationIds, bundlePath, repo, files, errors);
    validateLiveClosingRecheck(closingRepositoryObject, repo, errors);
    void bundlePath;
  } catch (error) {
    errors.push(`$.live_git: ${error instanceof Error ? error.message : String(error)}`);
  }
}
