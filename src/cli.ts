#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  bindRuntimeAttestation,
  isSourceDevelopmentEntrypoint,
  verifyReleaseAttestation,
} from "./attestation.js";
import { nodeCloseoutEngine } from "./closeout/engine.js";
import { loadDenylist, scanTrackedPublicSafetySync } from "./closeout/inspection.js";
import { inspectRepositoryObject } from "./closeout/repository-inspection.js";
import { packageRoot, trackedShippablePaths } from "./closeout/repository.js";
import {
  executionContentionJson,
  ExecutionResourceBusyError,
} from "./closeout/execution-lease.js";
import {
  discoverSemanticProbeCandidates,
  semanticCandidateSetSha256,
  semanticWorkingTreeSha256,
} from "./closeout/semantic.js";
import {
  createSemanticPlanV2,
  verifyDirectSemanticCandidateV2,
  verifyRuntimeSemanticCandidateV2,
  type RuntimeSemanticCaseV2,
  type SemanticAttestationV2,
  type SemanticObservationsV2,
  type SemanticPlanV2,
} from "./closeout/semantic-v2.js";
import type { FileRuntimeAttestationBinding } from "./runtime-binding.js";
import { canonicalJson } from "./canonical-json.js";
import type { MisterCleanRunLifecycle } from "./mister-clean-lifecycle.js";
import { journalFromEnvironment, type MisterCleanInvocationJournal } from "./mister-clean-invocation-journal.js";
import {
  captureFileCensus,
  compareFileCensuses,
  validateFileCensus,
  type FileCensus,
} from "./census.js";

export interface CliIO {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

class UsageError extends Error {}

function defaultIO(): CliIO {
  return {
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
  };
}

function removeFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function removeOption(args: string[], option: string, required = false): string | undefined {
  const index = args.indexOf(option);
  if (index < 0) {
    if (required) throw new UsageError(`${option} is required`);
    return undefined;
  }
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new UsageError(`${option} requires a value`);
  args.splice(index, 2);
  return value;
}

function removeRepeatedOption(args: string[], option: string): string[] {
  const values: string[] = [];
  while (args.includes(option)) values.push(removeOption(args, option, true) as string);
  return values;
}

function assertNoArgs(args: readonly string[]): void {
  if (args.length) throw new UsageError(`unexpected argument(s): ${args.join(" ")}`);
}

function inside(root: string, candidate: string): boolean {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  const relation = relative(
    existsSync(rootPath) ? realpathSync(rootPath) : rootPath,
    existsSync(candidatePath) ? realpathSync(candidatePath) : candidatePath,
  );
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !relation.startsWith("/"));
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function runSemantic(args: string[], io: CliIO): Promise<number> {
  const subcommand = args.shift();
  if (subcommand !== "plan" && subcommand !== "verify") {
    throw new UsageError("semantic requires plan or verify");
  }
  const repository = args[0]?.startsWith("--") === false ? (args.shift() as string) : process.cwd();
  if (subcommand === "plan") {
    const proposalsPath = removeOption(args, "--case-proposals", true) as string;
    const runId = removeOption(args, "--run-id", true) as string;
    const challengeNonce = removeOption(args, "--nonce", true) as string;
    const outputPath = resolve(removeOption(args, "--output", true) as string);
    const json = removeFlag(args, "--json");
    assertNoArgs(args);
    if (inside(repository, outputPath)) throw new UsageError("semantic v2 plan output must be outside the audited repository");
    if (existsSync(outputPath)) throw new UsageError("semantic v2 plan output already exists");
    const proposal = record(readJson(proposalsPath));
    const rawCases = record(proposal?.cases);
    if (proposal?.record_type !== "mister-clean.semantic-case-proposals"
      || proposal.schema_version !== "1.0" || !rawCases) {
      throw new UsageError("--case-proposals must be a mister-clean.semantic-case-proposals schema 1.0 record");
    }
    const runtimeCases: Record<string, RuntimeSemanticCaseV2[]> = {};
    for (const [candidateId, value] of Object.entries(rawCases)) {
      if (!Array.isArray(value)) throw new UsageError(`case proposals for ${candidateId} must be an array`);
      runtimeCases[candidateId] = value as RuntimeSemanticCaseV2[];
    }
    const candidates = discoverSemanticProbeCandidates(repository);
    const plan = createSemanticPlanV2({
      candidateSetSha256: semanticCandidateSetSha256(candidates),
      candidates,
      challengeNonce,
      observedAt: new Date().toISOString(),
      repository,
      repositoryObjectSha256: semanticWorkingTreeSha256(repository),
      runId,
      runtimeCases,
    });
    writeFileSync(outputPath, `${canonicalJson(plan)}\n`, { flag: "wx" });
    if (json) io.stdout(JSON.stringify(plan, null, 2));
    else io.stdout(`semantic-plan: WROTE candidates=${plan.candidates.length} sha256=${plan.plan_sha256} path=${outputPath}`);
    return 0;
  }

  const planPath = removeOption(args, "--plan", true) as string;
  const candidateId = removeOption(args, "--candidate", true) as string;
  const json = removeFlag(args, "--json");
  const plan = readJson(planPath) as SemanticPlanV2;
  const candidate = Array.isArray(plan?.candidates)
    ? plan.candidates.find((item) => item.candidate_id === candidateId)
    : undefined;
  if (!candidate) throw new UsageError("--candidate must identify exactly one candidate in --plan");
  if (candidate.resolution_mode === "direct_check") {
    assertNoArgs(args);
    const result = verifyDirectSemanticCandidateV2({ candidateId, plan, repository });
    if (json) io.stdout(JSON.stringify(result, null, 2));
    else io.stdout(`semantic-v2: ${result.verdict.toLocaleUpperCase("und")} candidate=${candidateId} errors=${result.errors.length}`);
    return result.verdict === "deterministically_satisfied" ? 0 : 1;
  }
  const observationsPath = removeOption(args, "--observations", true) as string;
  const attestationPath = removeOption(args, "--attestation", true) as string;
  const trustPolicyPath = removeOption(args, "--trust-policy", true) as string;
  const evidenceRoot = removeOption(args, "--evidence-root", true) as string;
  assertNoArgs(args);
  const result = verifyRuntimeSemanticCandidateV2({
    attestation: readJson(attestationPath) as SemanticAttestationV2,
    evidenceRoot,
    observations: readJson(observationsPath) as SemanticObservationsV2,
    plan,
    repository,
    trustPolicyPath,
  });
  if (json) io.stdout(JSON.stringify(result, null, 2));
  else io.stdout(`semantic-v2: ${result.verdict.toLocaleUpperCase("und")} candidate=${candidateId} errors=${result.errors.length}`);
  return result.verdict === "attested_satisfied" ? 0 : 1;
}

async function runPrepare(
  args: string[],
  io: CliIO,
  runtimeAttestation: FileRuntimeAttestationBinding,
): Promise<number> {
  const repo = removeOption(args, "--repo", true) as string;
  const evidenceHome = removeOption(args, "--evidence-home", true) as string;
  const runId = removeOption(args, "--run-id", true) as string;
  const requestRef = removeOption(args, "--request-ref", true) as string;
  const requestSource = removeOption(args, "--request-source");
  const requestText = removeOption(args, "--request-text");
  const rawMode = removeOption(args, "--mode")?.toLocaleUpperCase("und");
  if (rawMode !== undefined && rawMode !== "CLOSE" && rawMode !== "GUARD") {
    throw new UsageError("--mode requires CLOSE or GUARD");
  }
  const semanticManifestPath = removeOption(args, "--semantic-manifest");
  const semanticEvidencePackagePath = removeOption(args, "--semantic-evidence-package");
  const semanticTrustPolicyPath = removeOption(args, "--semantic-trust-policy");
  const publicSafetyDenylistPath = removeOption(args, "--public-safety-denylist");
  // Backward-compatible no-op: tracked shippable content is always assessed.
  removeFlag(args, "--public-safety");
  const executeSemanticProbes = removeFlag(args, "--execute-semantic-probes");
  const criteria = removeRepeatedOption(args, "--criterion");
  assertNoArgs(args);
  if (requestSource !== undefined && requestText !== undefined) {
    throw new UsageError("--request-source and --request-text are mutually exclusive");
  }
  if (executeSemanticProbes && semanticManifestPath === undefined) {
    throw new UsageError("--execute-semantic-probes requires --semantic-manifest");
  }
  if (semanticEvidencePackagePath !== undefined && (semanticManifestPath !== undefined || executeSemanticProbes)) {
    throw new UsageError("--semantic-evidence-package is mutually exclusive with legacy --semantic-manifest execution");
  }
  if ((semanticEvidencePackagePath === undefined) !== (semanticTrustPolicyPath === undefined)) {
    throw new UsageError("semantic v2 prepare requires both --semantic-evidence-package and --semantic-trust-policy");
  }
  const prepared = await nodeCloseoutEngine.prepare({
    repo,
    evidenceHome,
    runId,
    requestRef,
    mode: (rawMode ?? "CLOSE") as "CLOSE" | "GUARD",
    ...(requestSource === undefined ? {} : { requestSource }),
    ...(requestText === undefined ? {} : { requestText }),
    ...(semanticManifestPath === undefined ? {} : { semanticManifestPath }),
    ...(semanticEvidencePackagePath === undefined ? {} : { semanticEvidencePackagePath }),
    ...(semanticTrustPolicyPath === undefined ? {} : { semanticTrustPolicyPath }),
    ...(publicSafetyDenylistPath === undefined ? {} : { publicSafetyDenylistPath }),
    executeSemanticProbes,
    criteria,
    runtimeAttestation,
  });
  io.stdout(prepared.bundleDirectory);
  return 0;
}

function actionUsage(io: CliIO, subcommand?: "begin" | "finish"): void {
  if (subcommand !== "finish") {
    io.stderr("usage: mister-clean action begin <bundle-dir> --id <id> --debt-key <sha256> --kind <kind> --target <path-or-resource> --purpose <text>");
  }
  if (subcommand !== "begin") {
    io.stderr(`${subcommand === undefined ? "       " : "usage: "}mister-clean action finish <bundle-dir> --id <id> --status <closed|interrupted>`);
  }
}

async function runAction(
  args: string[],
  io: CliIO,
  runtimeAttestation: FileRuntimeAttestationBinding,
): Promise<number> {
  const subcommand = args.shift();
  if (subcommand === "--help" || subcommand === "help" || subcommand === undefined) {
    actionUsage(io);
    return subcommand === undefined ? 2 : 0;
  }
  if (subcommand !== "begin" && subcommand !== "finish") {
    actionUsage(io);
    throw new UsageError("action requires begin or finish");
  }
  if (args[0] === "--help") {
    actionUsage(io, subcommand);
    return 0;
  }
  const bundleDirectory = args.shift();
  if (!bundleDirectory) throw new UsageError(`action ${subcommand} requires a bundle directory`);
  const id = removeOption(args, "--id", true) as string;
  if (subcommand === "begin") {
    const debtKey = removeOption(args, "--debt-key", true) as string;
    const kind = removeOption(args, "--kind", true) as string;
    const target = removeOption(args, "--target", true) as string;
    const purpose = removeOption(args, "--purpose", true) as string;
    assertNoArgs(args);
    const result = await nodeCloseoutEngine.beginAction({
      bundleDirectory,
      id,
      debtKey,
      kind,
      target,
      purpose,
      runtimeAttestation,
    });
    io.stdout(`OPEN action=${result.actionId} object=${result.repositoryObject.sha256} bundle=${result.bundlePath}`);
    return 0;
  }
  const status = removeOption(args, "--status", true);
  if (status !== "closed" && status !== "interrupted") {
    throw new UsageError("--status requires closed or interrupted");
  }
  assertNoArgs(args);
  const result = await nodeCloseoutEngine.finishAction({
    bundleDirectory,
    id,
    status,
    runtimeAttestation,
  });
  io.stdout(`${status.toLocaleUpperCase("und")} action=${result.actionId} object=${result.repositoryObject.sha256} bundle=${result.bundlePath}`);
  return 0;
}

async function runValidate(
  args: string[],
  io: CliIO,
  runtimeAttestation: FileRuntimeAttestationBinding,
): Promise<number> {
  const kind = args.shift();
  const path = args.shift();
  if (!kind || !new Set(["report", "manifest", "bundle"]).has(kind)) {
    throw new UsageError("validate requires report, manifest, or bundle");
  }
  if (!path) throw new UsageError(`validate ${kind} requires a path`);
  const template = removeFlag(args, "--template");
  const structural = removeFlag(args, "--structural");
  const repo = removeOption(args, "--repo");
  const acceptedEvaluatorPath = removeOption(args, "--accepted-evaluator");
  const guardAuthorityPath = removeOption(args, "--guard-authority");
  assertNoArgs(args);
  if (kind !== "bundle" && (structural || repo !== undefined || acceptedEvaluatorPath !== undefined)) {
    throw new UsageError("--structural, --repo, and --accepted-evaluator are only valid for bundle validation");
  }
  if (kind !== "bundle" && guardAuthorityPath !== undefined) {
    throw new UsageError("--guard-authority is only valid for bundle validation");
  }
  if (acceptedEvaluatorPath !== undefined && !isAbsolute(acceptedEvaluatorPath)) {
    throw new UsageError("--accepted-evaluator requires an absolute path");
  }
  if (structural && acceptedEvaluatorPath !== undefined) {
    throw new UsageError("--accepted-evaluator is only valid for live bundle validation");
  }
  if (guardAuthorityPath !== undefined && !isAbsolute(guardAuthorityPath)) {
    throw new UsageError("--guard-authority requires an absolute path");
  }
  if (structural && guardAuthorityPath !== undefined) {
    throw new UsageError("--guard-authority is only valid for live bundle validation");
  }
  if (template && !inside(join(packageRoot(import.meta.url), "assets"), path)) {
    io.stderr("ERROR: --template is only valid for the skill's bundled assets/ templates; a real record must validate without placeholders");
    return 2;
  }

  if (kind === "bundle") {
    const result = await nodeCloseoutEngine.validateBundle(path, {
      allowPlaceholders: template,
      verifyLive: !structural,
      runtimeAttestation,
      ...(repo === undefined ? {} : { repoPath: repo }),
      ...(acceptedEvaluatorPath === undefined ? {} : { acceptedEvaluatorPath }),
      ...(guardAuthorityPath === undefined ? {} : { guardAuthorityPath }),
    });
    if (!result.ok) {
      result.errors.forEach((error) => io.stderr(`ERROR: ${error}`));
      if (result.failureKind === "load") return 2;
      io.stderr(`FAIL errors=${result.errors.length}`);
      return 1;
    }
    io.stdout(`PASS kind=bundle path=${path} live=${!structural}`);
    return 0;
  }

  let data: unknown;
  try {
    data = readJson(path);
  } catch (error) {
    if (error instanceof ExecutionResourceBusyError) io.stderr(executionContentionJson(error));
    io.stderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  const errors = nodeCloseoutEngine.validateRecord(kind === "report" ? "report" : "manifest", data, template);
  if (errors.length) {
    errors.forEach((error) => io.stderr(`ERROR: ${error}`));
    io.stderr(`FAIL errors=${errors.length}`);
    return 1;
  }
  io.stdout(`PASS kind=${kind} path=${path}`);
  return 0;
}

async function runDetect(args: string[], io: CliIO): Promise<number> {
  if (args.shift() !== "stack") throw new UsageError("detect requires stack");
  const root = args.shift();
  if (!root) throw new UsageError("detect stack requires a repository path");
  const listOnly = removeFlag(args, "--list");
  assertNoArgs(args);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    io.stderr(`ERROR: not a directory: ${resolve(root)}`);
    return 2;
  }
  const result = await nodeCloseoutEngine.detectStack(root);
  if (result.status === "unknown") {
    io.stdout("NO KNOWN ECOSYSTEM DETECTED -- inspect manually; adapter checks may not be silently skipped");
    return result.exitCode;
  }
  io.stdout(`detected: ${result.ecosystems.join(" ")}`);
  if (listOnly) return 0;
  const reference = join(packageRoot(import.meta.url), "references", "stack-adapters.md");
  if (!existsSync(reference)) return 0;
  const text = readFileSync(reference, "utf8");
  for (const ecosystem of result.ecosystems) {
    const header = `## ${ecosystem}`;
    const start = text.indexOf(header);
    if (start < 0) continue;
    const next = text.indexOf("\n## ", start + header.length);
    io.stdout(`\n${text.slice(start, next < 0 ? undefined : next).trimEnd()}`);
  }
  return 0;
}

async function runAudit(args: string[], io: CliIO): Promise<number> {
  const kind = args.shift();
  if (!new Set(["github-actions", "planning", "public-safety", "repository-boundaries", "semantic"]).has(String(kind))) {
    throw new UsageError("audit requires github-actions, planning, public-safety, repository-boundaries, or semantic");
  }
  const root = args[0]?.startsWith("--") === false ? (args.shift() as string) : process.cwd();
  if (kind === "planning") {
    const json = removeFlag(args, "--json");
    assertNoArgs(args);
    const result = await nodeCloseoutEngine.auditPlanning(root);
    if (json) io.stdout(JSON.stringify(result, null, 2));
    else {
      for (const finding of result.findings) {
        io.stdout(`${finding.code}\t${finding.path}\t${finding.subject}\t${finding.detail}`);
      }
      io.stdout(`planning: ${result.status.toLocaleUpperCase("und")} artifacts=${result.artifactCount} structured=${result.structuredArtifactCount} findings=${result.findings.length}`);
    }
    return result.exitCode;
  }
  if (kind === "semantic") {
    const json = removeFlag(args, "--json");
    const execute = removeFlag(args, "--execute");
    const manifestPath = removeOption(args, "--manifest");
    const evidencePackagePath = removeOption(args, "--evidence-package");
    const trustPolicyPath = removeOption(args, "--trust-policy");
    assertNoArgs(args);
    if (execute && manifestPath === undefined) throw new UsageError("audit semantic --execute requires --manifest");
    if (evidencePackagePath !== undefined && (manifestPath !== undefined || execute)) {
      throw new UsageError("audit semantic --evidence-package is mutually exclusive with --manifest and --execute");
    }
    if ((evidencePackagePath === undefined) !== (trustPolicyPath === undefined)) {
      throw new UsageError("audit semantic v2 requires both --evidence-package and --trust-policy");
    }
    const result = await nodeCloseoutEngine.auditSemantic(root, {
      execute,
      ...(evidencePackagePath === undefined ? {} : { evidencePackagePath }),
      ...(manifestPath === undefined ? {} : { manifestPath }),
      ...(trustPolicyPath === undefined ? {} : { trustPolicyPath }),
    });
    if (json) io.stdout(JSON.stringify(result, null, 2));
    else {
      for (const finding of result.findings) {
        io.stdout(`${finding.code}\t${finding.candidate_id}\t${finding.detail}`);
      }
      io.stdout(`semantic: ${result.status.toLocaleUpperCase("und")} candidates=${result.candidate_probe_count} executed=${result.executed_probe_count} findings=${result.findings.length}`);
    }
    return result.exitCode;
  }
  if (kind === "github-actions") {
    const json = removeFlag(args, "--json");
    assertNoArgs(args);
    const result = await nodeCloseoutEngine.auditGitHubActions(root);
    if (json) io.stdout(JSON.stringify(result, null, 2));
    else {
      for (const finding of result.findings) {
        io.stdout(`${finding.severity}\t${finding.rule}\t${finding.path}\t${finding.detail}`);
      }
      io.stdout(`github-actions: ${result.status.toLocaleUpperCase("und")} workflows=${result.workflow_count} sensitive=${result.sensitive_workflow_count} findings=${result.findings.length}`);
    }
    return result.exitCode;
  }
  if (kind === "repository-boundaries") {
    const json = removeFlag(args, "--json");
    assertNoArgs(args);
    const result = await nodeCloseoutEngine.auditRepositoryBoundaries(root);
    if (json) io.stdout(JSON.stringify(result, null, 2));
    else {
      for (const boundaryFinding of result.findings) {
        io.stdout(`${boundaryFinding.rule}\t${boundaryFinding.path}\t${boundaryFinding.detail}`);
      }
      io.stdout(`repository-boundaries: ${result.status.toLocaleUpperCase("und")} parsers=${result.parser_surfaces.length} contracts=${result.external_contract_count} findings=${result.findings.length}`);
    }
    return result.exitCode;
  }
  const json = removeFlag(args, "--json");
  const tracked = removeFlag(args, "--tracked");
  const denylist = removeOption(args, "--denylist-file");
  assertNoArgs(args);
  const result = tracked
    ? scanTrackedPublicSafetySync(
      root,
      trackedShippablePaths(root),
      await loadDenylist(denylist),
    )
    : await nodeCloseoutEngine.scanPublicSafety(root, denylist);
  if (json) {
    io.stdout(JSON.stringify(result, null, 2));
    return result.exitCode;
  }
  for (const finding of result.findings) io.stdout(`${finding.path}:${finding.line}: ${finding.rule}`);
  if (result.status === "fail") io.stderr(`public-safety: FAIL (${result.findings.length} finding(s))`);
  else io.stdout("public-safety: PASS");
  return result.exitCode;
}

async function runManifest(args: string[], io: CliIO): Promise<number> {
  const root = args.shift() ?? packageRoot(import.meta.url);
  const check = removeFlag(args, "--check");
  const packageSurface = removeFlag(args, "--package");
  assertNoArgs(args);
  const result = packageSurface
    ? await nodeCloseoutEngine.generatePackageManifest(root)
    : await nodeCloseoutEngine.generateManifest(root);
  const path = join(resolve(root), "MANIFEST.sha256");
  if (check) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== result.content) {
      io.stderr("manifest: FAIL (MANIFEST.sha256 is stale)");
      return 1;
    }
    io.stdout(`manifest: PASS (${result.entries.length} entries)`);
    return 0;
  }
  writeFileSync(path, result.content, "utf8");
  io.stdout(`manifest: wrote ${result.entries.length} entries`);
  return 0;
}

async function runInspect(args: string[], io: CliIO): Promise<number> {
  const subcommand = args.shift();
  if (subcommand !== "repository-object") throw new UsageError("inspect requires repository-object");
  const root = args.shift();
  if (!root) throw new UsageError("inspect repository-object requires a repository path");
  const json = removeFlag(args, "--json");
  assertNoArgs(args);
  const result = inspectRepositoryObject(root);
  if (json) io.stdout(JSON.stringify(result, null, 2));
  else io.stdout(`RepositoryObject ${result.sha256} entries=${result.entry_count} head=${result.head_commit}`);
  return 0;
}

function loadFileCensus(path: string): FileCensus {
  const candidate = readJson(path) as Partial<FileCensus>;
  if (candidate.record_type !== "mister-clean.file-census" || candidate.schema_version !== "1.0"
    || !candidate.scope || !candidate.summary || !Array.isArray(candidate.entries)) {
    throw new UsageError(`${path}: not a Mister Clean file census 1.0 record`);
  }
  const census = candidate as FileCensus;
  const errors = validateFileCensus(census);
  if (errors.length) throw new UsageError(`${path}: ${errors.join("; ")}`);
  return census;
}

async function runCensus(args: string[], io: CliIO): Promise<number> {
  const subcommand = args.shift();
  if (subcommand === "capture") {
    const repository = removeOption(args, "--repo", true) as string;
    const roots = removeRepeatedOption(args, "--root");
    const exclusions = removeRepeatedOption(args, "--exclude");
    const output = removeOption(args, "--output", true) as string;
    assertNoArgs(args);
    if (!roots.length) throw new UsageError("census capture requires at least one --root");
    const census = await captureFileCensus({
      repository_root: repository,
      roots,
      exclusions,
      output_path: output,
    });
    writeFileSync(output, canonicalJson(census), { encoding: "utf8", flag: "wx" });
    io.stdout(`CENSUS file_count=${census.summary.file_count} direct=${census.summary.direct_file_count} nested=${census.summary.nested_file_count} bytes=${census.summary.total_bytes} aggregate_sha256=${census.summary.aggregate_sha256} path=${resolve(output)}`);
    return 0;
  }
  if (subcommand === "validate") {
    const path = args.shift();
    if (!path) throw new UsageError("census validate requires a census path");
    assertNoArgs(args);
    const census = loadFileCensus(path);
    io.stdout(`PASS kind=file-census path=${path} files=${census.summary.file_count}`);
    return 0;
  }
  if (subcommand === "compare") {
    const beforePath = args.shift();
    const afterPath = args.shift();
    if (!beforePath || !afterPath) throw new UsageError("census compare requires before and after census paths");
    const json = removeFlag(args, "--json");
    assertNoArgs(args);
    const comparison = compareFileCensuses(loadFileCensus(beforePath), loadFileCensus(afterPath));
    if (json) io.stdout(JSON.stringify(comparison, null, 2));
    else io.stdout(`CENSUS_DELTA status=${comparison.status}`);
    if (comparison.status === "present") return 1;
    if (comparison.status === "absent") return 0;
    return 2;
  }
  throw new UsageError("census requires capture, validate, or compare");
}

async function runAttest(args: string[], io: CliIO): Promise<number> {
  const root = args[0]?.startsWith("--") === false
    ? (args.shift() as string)
    : packageRoot(import.meta.url);
  const json = removeFlag(args, "--json");
  const strict = removeFlag(args, "--strict");
  assertNoArgs(args);
  const result = await verifyReleaseAttestation(root, { strict });
  if (json) io.stdout(JSON.stringify(result, null, 2));
  else if (result.status === "pass") {
    io.stdout(`attestation: PASS ${result.package?.name}@${result.package?.version} claimed-source=${result.claimed_source?.git_commit}`);
  } else {
    result.errors.forEach((error) => io.stderr(`ERROR: ${error}`));
    io.stderr(`attestation: FAIL errors=${result.errors.length}`);
  }
  return result.status === "pass" ? 0 : 1;
}

async function bindCliRuntime(io: CliIO): Promise<FileRuntimeAttestationBinding | undefined> {
  const root = packageRoot(import.meta.url);
  try {
    return await bindRuntimeAttestation(root, {
      moduleUrl: import.meta.url,
      expectedEntrypoint: "./bin/mister-clean.js",
      allowSourceDevelopment: process.env.MISTER_CLEAN_SOURCE_DEVELOPMENT === "1"
        && isSourceDevelopmentEntrypoint(root, import.meta.url),
      sourceDevelopmentReason: "explicit source-development CLI execution",
    });
  } catch (error) {
    io.stderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    io.stderr(`Run mister-clean attest ${JSON.stringify(root)} --json --strict for the exact runtime diagnosis.`);
    return undefined;
  }
}

function usage(io: CliIO): void {
  io.stderr("usage: mister-clean <prepare|action|validate|detect|audit|inspect|census|manifest|semantic|attest> ... (action: begin|finish; audit: github-actions|planning|public-safety|repository-boundaries|semantic; semantic: plan|verify; inspect: repository-object; census: capture|validate|compare)");
}

export async function runCli(
  argv: readonly string[],
  io: CliIO = defaultIO(),
  lifecycle: MisterCleanRunLifecycle | undefined = undefined,
  journal: MisterCleanInvocationJournal | undefined = undefined,
): Promise<number> {
  const args = [...argv];
  const command = args.shift();
  let invocationId: string | undefined;
  let lifecycleRunEventId: string | null = null;
  let terminalRecorded = false;
  try {
    if (!new Set(["prepare", "action", "validate", "detect", "audit", "inspect", "census", "manifest", "semantic", "attest"]).has(String(command))) {
      usage(io);
      return 2;
    }
    // Every actual CLI hygiene invocation has an identity-unobserved receipt
    // before execution. A strict evaluator event is linked only if one was
    // explicitly supplied; no tuple or telemetry is invented otherwise.
    invocationId = journal?.recordStart({ command: command!, argv, occurred_at: new Date().toISOString() });
    if (lifecycle !== undefined) {
      const evaluation = await lifecycle.recordRunStart();
      lifecycleRunEventId = evaluation.run_event_id;
      if (invocationId !== undefined) journal?.recordEvaluationLink({ invocation_id: invocationId, run_event_id: evaluation.run_event_id, occurred_at: new Date().toISOString() });
    }
    let exitCode: number;
    if (command === "attest") exitCode = await runAttest(args, io);
    else {
    const runtimeAttestation = await bindCliRuntime(io);
      if (!runtimeAttestation) exitCode = 2;
      else if (command === "prepare") exitCode = await runPrepare(args, io, runtimeAttestation);
      else if (command === "action") exitCode = await runAction(args, io, runtimeAttestation);
      else if (command === "validate") exitCode = await runValidate(args, io, runtimeAttestation);
      else if (command === "detect") exitCode = await runDetect(args, io);
      else if (command === "audit") exitCode = await runAudit(args, io);
      else if (command === "inspect") exitCode = await runInspect(args, io);
      else if (command === "census") exitCode = await runCensus(args, io);
      else if (command === "manifest") exitCode = await runManifest(args, io);
      else if (command === "semantic") exitCode = await runSemantic(args, io);
      else exitCode = 2;
    }
    if (invocationId !== undefined) {
      journal?.recordEnd({ invocation_id: invocationId, run_event_id: lifecycleRunEventId, status: exitCode === 0 ? "SUCCEEDED" : "FAILED", exit_code: exitCode, occurred_at: new Date().toISOString() });
      terminalRecorded = true;
    }
    return exitCode;
  } catch (error) {
    if (invocationId !== undefined && !terminalRecorded) {
      try { journal?.recordEnd({ invocation_id: invocationId, run_event_id: lifecycleRunEventId, status: "FAILED", exit_code: 2, occurred_at: new Date().toISOString() }); } catch (journalError) { io.stderr(`ERROR: ${journalError instanceof Error ? journalError.message : String(journalError)}`); }
    }
    io.stderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof UsageError) usage(io);
    return 2;
  }
}

export function isDirectInvocation(argvPath: string | undefined, moduleUrl: string): boolean {
  if (!argvPath) return false;
  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    const invokedPath = resolve(argvPath);
    return invokedPath === fileURLToPath(moduleUrl) || pathToFileURL(invokedPath).href === moduleUrl;
  }
}

if (isDirectInvocation(process.argv[1], import.meta.url)) {
  const directArgs = process.argv.slice(2);
  const directCommand = directArgs[0];
  const isHelpOrVersion = directCommand === undefined || directCommand === "--help" || directCommand === "help" || directCommand === "--version" || directCommand === "version";
  try {
    process.exitCode = await runCli(directArgs, defaultIO(), undefined, isHelpOrVersion ? undefined : journalFromEnvironment(process.env));
  } catch (error) {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
