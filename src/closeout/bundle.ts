/**
 * Live-bound Mister Clean closure-bundle validation.
 *
 * The domain rules consume `unknown` and accumulate errors. Filesystem and Git
 * effects sit behind narrow ports so the same rules can be exercised with
 * deterministic adapters while the default adapter remains Node/Bun portable.
 */
import { basename, dirname, isAbsolute, resolve } from "node:path";

import {
  captureFileCensus,
  compareFileCensuses,
  validateFileCensus,
  type FileCensus,
} from "../census.js";

import {
  findPlaceholders,
  validateManifest,
  validateReport,
} from "./records.js";
import {
  isCanonicalPlanningFileName,
  PLANNING_LANE_NAMES,
} from "./repository.js";
import {
  auditPlanningArtifacts,
  isNonArtifactPlanningClass,
  isPlanningTextPath,
  type PlanningSource,
} from "./planning.js";
import {
  createDetectorRuntimeIdentity,
  type DetectorRuntimeIdentity,
} from "./detector-coverage.js";
import { isVerifiedServerAttestationBinding } from "../runtime-binding.js";
import { verifyAcceptedReleaseBoundary } from "./accepted-release.js";
import {
  validateBoundExecutionRecords,
  validateSuccessor,
} from "./bundle-action-evidence.js";
import { validateRegressionDelta } from "./bundle-regression.js";
import { validateLive } from "./bundle-live-validation.js";
import {
  HEX64,
  array,
  compareCodePoints,
  contained,
  evidenceClock,
  evidenceRef,
  identity,
  iso,
  loadRef,
  nodeBundlePorts,
  object,
  requireObject,
  sha256,
  stableEqual,
  text,
  validateEvidenceClock,
  type BundleValidationOptions,
  type BundleValidationResult,
  type EvidenceClock,
  type FilePort,
  type GitPort,
  type JsonObject,
} from "./bundle-runtime.js";

export {
  nodeBundlePorts,
  nodeFilePort,
  nodeGitPort,
  type BundlePorts,
  type BundleValidationOptions,
  type BundleValidationResult,
  type FileObservation,
  type FilePort,
  type GitPort,
  type GitResult,
} from "./bundle-runtime.js";

function requiresAcceptedReleaseBoundary(report: JsonObject, manifest: JsonObject): boolean {
  const barrierState = object(object(manifest.guard ?? report.guard)?.commit_barrier)?.state;
  if (report.mode === "GUARD" && (barrierState === "open" || barrierState === "crossed")) return true;
  return [...array(report.actions), ...array(manifest.actions)].some((raw) => {
    const action = object(raw);
    return action?.kind === "git_commit" && action.status === "executed";
  });
}

function selectedMisterCleanEvaluator(report: JsonObject, manifest: JsonObject): unknown {
  const guard = object(manifest.guard ?? report.guard);
  const receipts = array(guard?.receipts).map(object).filter((value): value is JsonObject => value !== undefined);
  const selected = new Set(array(object(guard?.commit_barrier)?.receipt_ids).flatMap((raw) => {
    const seal = object(raw);
    return typeof seal?.receipt_id === "string" ? [seal.receipt_id] : [];
  }));
  const selectedMisterClean = receipts.filter((receipt) => receipt.role === "mister_clean" && selected.has(String(receipt.id)));
  return selectedMisterClean.length === 1 ? selectedMisterClean[0]?.mister_clean_evaluator : undefined;
}
const PLANNING_NAMES = new Set([
  "planning", "plans", "roadmap", "project-management", "work-items",
  "work_items", "tasks", "stories", "epics", "slices", "issues",
]);
const PLANNING_KINDS = new Set(["repo_files", "external_snapshot", "none"]);

async function discoverPlanningRoots(repo: string, files: FilePort): Promise<Set<string>> {
  const rows = await files.walk(repo);
  const directories = rows.filter((row) => row.kind === "directory");
  const childrenByDirectory = new Map<string, Set<string>>();
  for (const row of directories) {
    const parent = dirname(row.relative);
    const children = childrenByDirectory.get(parent) ?? new Set<string>();
    children.add(basename(row.relative).toLocaleLowerCase("und"));
    childrenByDirectory.set(parent, children);
  }
  const candidates = new Set<string>();
  for (const row of rows) {
    if (row.kind !== "directory" && isCanonicalPlanningFileName(row.relative)) {
      candidates.add(row.relative);
    }
  }
  for (const row of directories) {
    const parts = row.relative.split("/");
    if (PLANNING_NAMES.has(parts.at(-1)?.toLocaleLowerCase("und") ?? "")) candidates.add(row.relative);
    const children = childrenByDirectory.get(row.relative) ?? new Set<string>();
    if ([...children].filter((name) => PLANNING_LANE_NAMES.has(name)).length >= 2) candidates.add(row.relative);
  }
  const minimal = [...candidates].sort((a, b) => a.split("/").length - b.split("/").length || compareCodePoints(a, b));
  return new Set(minimal.filter((candidate, index) => !minimal.slice(0, index).some((parent) => candidate === parent || candidate.startsWith(`${parent}/`))));
}

async function validateCriteria(
  bundle: JsonObject, report: JsonObject, base: string, files: FilePort,
  clean: boolean, allowPlaceholders: boolean, clock: EvidenceClock | undefined, errors: string[],
): Promise<void> {
  const path = "$.criteria_discovery";
  const proof = requireObject(bundle.criteria_discovery,
    ["source_kind", "request_source", "source_refs", "request_sha256", "discovered_count", "none_found", "criteria_ids"], path, errors);
  if (!proof) return;
  if (!new Set(["exact_bytes", "reference_only"]).has(String(proof.source_kind))) errors.push(`${path}.source_kind: expected exact_bytes or reference_only`);
  if (clean && proof.source_kind !== "exact_bytes") errors.push(`${path}.source_kind: CLEAN requires exact operative request bytes`);
  if (proof.source_kind === "exact_bytes") {
    const ref = requireObject(proof.request_source, ["path", "sha256"], `${path}.request_source`, errors);
    if (ref && !(allowPlaceholders && String(ref.path).includes("<"))) {
      const request = await contained(files, base, ref.path);
      if (!request || !(await files.isFile(request))) errors.push(`${path}.request_source.path: file not found, not a regular file, or outside bundle directory`);
      else {
        const digest = sha256(await files.readBytes(request));
        if (digest !== ref.sha256) errors.push(`${path}.request_source.sha256: digest mismatch`);
        if (digest !== proof.request_sha256) errors.push(`${path}.request_source: exact request bytes do not match request_sha256`);
      }
    }
  } else if (proof.request_source !== null) errors.push(`${path}.request_source: reference_only requires null`);
  if (!Array.isArray(proof.criteria_ids) || !array(proof.criteria_ids).every(text)) errors.push(`${path}.criteria_ids: required string array`);
  if (!Number.isInteger(proof.discovered_count) || Number(proof.discovered_count) < 0) errors.push(`${path}.discovered_count: required nonnegative integer`);
  if (typeof proof.none_found !== "boolean") errors.push(`${path}.none_found: required boolean`);
  const ids = array(proof.criteria_ids).filter(text);
  const refs = array(proof.source_refs);
  if (refs.length === 0) errors.push(`${path}.source_refs: required nonempty digest-bound evidence array`);
  if (!allowPlaceholders && (typeof proof.request_sha256 !== "string" || !HEX64.test(proof.request_sha256))) errors.push(`${path}.request_sha256: required lowercase SHA-256`);
  if (proof.discovered_count !== ids.length) errors.push(`${path}: discovered_count (${String(proof.discovered_count)}) != criteria_ids (${ids.length})`);
  if (proof.none_found !== (ids.length === 0)) errors.push(`${path}.none_found: must be true exactly when discovered_count is zero`);
  const reportIds = array(report.acceptance_criteria).map((item) => object(item)?.id).filter(text).sort();
  if (!stableEqual([...ids].sort(), reportIds)) errors.push(`${path}.criteria_ids: must equal report acceptance_criteria ids`);
  const records = await Promise.all(refs.map((ref, index) => evidenceRef(files, base, ref, `${path}.source_refs[${index}]`, errors, allowPlaceholders, clock, "mister-clean.criteria-source")));
  for (const [index, record] of records.entries()) if (record && (!Array.isArray(record.criteria_ids) || !array(record.criteria_ids).every(text))) {
    errors.push(`${path}.source_refs[${index}]: criteria-source record requires criteria_ids string array`);
  }
  if (!allowPlaceholders && !records.some((record) => record !== undefined && record.request_ref === bundle.request_ref && record.request_sha256 === proof.request_sha256 && stableEqual([...array(record.criteria_ids)].sort(), [...ids].sort()))) {
    errors.push(`${path}.source_refs: no bound source record matches request_ref, request_sha256, and criteria_ids`);
  }
}

async function validatePlanning(
  bundle: JsonObject, repo: string | undefined, files: FilePort,
  clean: boolean, allowPlaceholders: boolean, errors: string[],
): Promise<void> {
  const path = "$.planning_discovery";
  const planning = requireObject(bundle.planning_discovery, ["unknown", "systems"], path, errors);
  if (!planning) return;
  if (clean && planning.unknown !== false) errors.push(`${path}.unknown: CLEAN requires false`);
  const systems = array(planning.systems);
  if (systems.length === 0) { errors.push(`${path}.systems: required nonempty array`); return; }
  const discovered = repo ? await discoverPlanningRoots(repo, files) : new Set<string>();
  const declared = new Set<string>();
  const none = systems.filter((item) => object(item)?.kind === "none");
  if (none.length && systems.length !== 1) errors.push(`${path}.systems: kind=none is only valid as the sole discovered planning system`);
  if (repo && none.length && discovered.size) errors.push(`${path}.systems: kind=none contradicts live planning candidates ${JSON.stringify([...discovered].sort())}`);
  const systemIds = new Set<string>();
  const globalArtifacts = new Set<string>();
  const planningSourcePaths = new Set<string>();
  const planningSources: PlanningSource[] = [];
  for (const [index, raw] of systems.entries()) {
    const spath = `${path}.systems[${index}]`;
    const system = requireObject(raw, ["id", "kind", "sources", "schema_sources", "validators", "corpus"], spath, errors);
    if (!system) continue;
    if (!text(system.id)) errors.push(`${spath}.id: required`);
    else if (systemIds.has(system.id)) errors.push(`${spath}.id: duplicate ${JSON.stringify(system.id)}`);
    else systemIds.add(system.id);
    if (!PLANNING_KINDS.has(String(system.kind))) errors.push(`${spath}.kind: expected one of ${JSON.stringify([...PLANNING_KINDS].sort())}`);
    for (const field of ["sources", "schema_sources", "validators"] as const) {
      if (!Array.isArray(system[field]) || array(system[field]).length === 0 || !array(system[field]).every(text)) {
        errors.push(`${spath}.${field}: required nonempty string array`);
      }
    }
    const corpus = requireObject(system.corpus, ["roots", "include_globs", "total", "classified", "unclassified", "artifacts"], `${spath}.corpus`, errors);
    if (!corpus) continue;
    if (!Array.isArray(corpus.roots) || !array(corpus.roots).every(text)) errors.push(`${spath}.corpus.roots: required string array`);
    if (!Array.isArray(corpus.include_globs) || !array(corpus.include_globs).every(text)) errors.push(`${spath}.corpus.include_globs: required string array`);
    if (!Array.isArray(corpus.artifacts)) errors.push(`${spath}.corpus.artifacts: required array`);
    const roots = array(corpus.roots).filter(text);
    const includeGlobs = array(corpus.include_globs).filter(text);
    const artifacts = array(corpus.artifacts);
    const rawFileCensus = object(corpus.census);
    let fileCensus: FileCensus | undefined;
    if (system.kind === "repo_files" && (repo || clean) && !rawFileCensus) {
      errors.push(`${spath}.corpus.census: canonical file census is required for a live or CLEAN repository-file corpus`);
    }
    if (rawFileCensus) {
      if (rawFileCensus.record_type !== "mister-clean.file-census" || rawFileCensus.schema_version !== "1.0"
        || !object(rawFileCensus.scope) || !object(rawFileCensus.summary) || !Array.isArray(rawFileCensus.entries)) {
        errors.push(`${spath}.corpus.census: malformed canonical file census`);
      } else fileCensus = rawFileCensus as unknown as FileCensus;
    }
    if (fileCensus) {
      for (const error of validateFileCensus(fileCensus)) errors.push(`${spath}.corpus.census: ${error}`);
      if (!stableEqual(fileCensus.scope.roots, roots)) errors.push(`${spath}.corpus.census.scope.roots: must equal corpus.roots`);
      if (fileCensus.summary.file_count !== artifacts.length) errors.push(`${spath}.corpus.census.summary.file_count: must equal artifact rows`);
    }
    if (system.kind === "repo_files" && roots.length === 0) errors.push(`${spath}.corpus.roots: repo_files requires at least one repository root`);
    if (system.kind === "repo_files" && includeGlobs.length === 0) errors.push(`${spath}.corpus.include_globs: repo_files requires at least one discovery glob`);
    if (system.kind === "none" && (roots.length || includeGlobs.length)) errors.push(`${spath}.corpus: kind=none requires empty roots and include_globs`);
    if (system.kind === "repo_files") roots.forEach((root) => declared.add(root.replace(/\/$/, "")));
    const seen = new Set<string>();
    let unclassified = 0;
    for (const [artifactIndex, rawArtifact] of artifacts.entries()) {
      const apath = `${spath}.corpus.artifacts[${artifactIndex}]`;
      const artifact = requireObject(rawArtifact, ["path", "class", "sha256"], apath, errors);
      if (!artifact) continue;
      if (!text(artifact.path) || seen.has(artifact.path)) errors.push(`${apath}.path: required unique repository-relative path`);
      else {
        seen.add(artifact.path);
        if (globalArtifacts.has(artifact.path)) errors.push(`${apath}.path: artifact appears in more than one planning system`);
        globalArtifacts.add(artifact.path);
      }
      if (!text(artifact.class)) {
        errors.push(`${apath}.class: required explicit class`);
        unclassified += 1;
      } else if (new Set(["not assessed", "not_assessed", "unclassified", "unknown"]).has(identity(artifact.class))) {
        unclassified += 1;
      }
      if (text(artifact.class) && isNonArtifactPlanningClass(artifact.class)
        && !text(artifact.classification_rationale)) {
        errors.push(`${apath}.classification_rationale: non-artifact class requires an explicit rationale`);
      }
      if (!allowPlaceholders && (typeof artifact.sha256 !== "string" || !HEX64.test(artifact.sha256))) errors.push(`${apath}.sha256: required lowercase SHA-256`);
      if (fileCensus && text(artifact.path)) {
        const censusEntry = fileCensus.entries.find((entry) => entry.path === artifact.path);
        if (!censusEntry) errors.push(`${apath}: missing from canonical file census`);
        else {
          if (artifact.sha256 !== censusEntry.sha256) errors.push(`${apath}.sha256: disagrees with canonical file census`);
          if (artifact.byte_length !== censusEntry.byte_length) errors.push(`${apath}.byte_length: disagrees with canonical file census`);
        }
      }
      if (repo && system.kind === "repo_files" && text(artifact.path)) {
        const target = await contained(files, repo, artifact.path);
        if (!target || !(await files.isFile(target))) errors.push(`${apath}.path: missing, not a regular file, or outside repository`);
        else {
          const liveBytes = await files.readBytes(target);
          if (typeof artifact.sha256 === "string" && HEX64.test(artifact.sha256) && sha256(liveBytes) !== artifact.sha256) errors.push(`${apath}.sha256: live digest mismatch`);
          if (fileCensus && artifact.byte_length !== liveBytes.byteLength) errors.push(`${apath}.byte_length: live byte length mismatch`);
        }
      }
    }
    if (corpus.total !== seen.size) errors.push(`${spath}.corpus.total (${String(corpus.total)}) != unique artifacts (${seen.size})`);
    if (corpus.classified !== seen.size - unclassified) errors.push(`${spath}.corpus.classified (${String(corpus.classified)}) != classified artifact rows (${seen.size - unclassified})`);
    if (corpus.unclassified !== unclassified) errors.push(`${spath}.corpus.unclassified (${String(corpus.unclassified)}) != unclassified artifact rows (${unclassified})`);
    if (clean && corpus.unclassified !== 0) errors.push(`${spath}.corpus.unclassified: CLEAN requires zero`);
    if (repo && system.kind === "repo_files" && fileCensus) {
      try {
        const liveCensus = await captureFileCensus({
          repository_root: repo,
          roots: fileCensus.scope.roots,
          exclusions: fileCensus.scope.exclusions,
        });
        const comparison = compareFileCensuses(fileCensus, liveCensus);
        if (comparison.status !== "absent") {
          if (comparison.status === "present") {
            const claimedByPath = new Map(fileCensus.entries.map((entry) => [entry.path, entry]));
            const liveByPath = new Map(liveCensus.entries.map((entry) => [entry.path, entry]));
            const missingFromBundle = liveCensus.entries
              .filter((entry) => !claimedByPath.has(entry.path))
              .map((entry) => entry.path);
            const absentFromLive = fileCensus.entries
              .filter((entry) => !liveByPath.has(entry.path))
              .map((entry) => entry.path);
            const changed = fileCensus.entries
              .filter((entry) => {
                const live = liveByPath.get(entry.path);
                return live !== undefined
                  && (entry.byte_length !== live.byte_length || entry.sha256 !== live.sha256);
              })
              .map((entry) => entry.path);
            errors.push(`${spath}.corpus: live canonical census mismatch missing_from_bundle=${JSON.stringify(missingFromBundle)} absent_from_live=${JSON.stringify(absentFromLive)} changed=${JSON.stringify(changed)}`);
          } else {
            errors.push(`${spath}.corpus: live canonical census is incompatible: ${comparison.status}: ${comparison.detail}`);
          }
        }
      } catch (error) {
        errors.push(`${spath}.corpus: live canonical census failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (clean) {
        for (const rawArtifact of artifacts) {
          const artifact = object(rawArtifact);
          if (!artifact || !text(artifact.path)) continue;
          if (!isPlanningTextPath(artifact.path)) {
            if (!text(artifact.class) || !isNonArtifactPlanningClass(artifact.class)
              || !text(artifact.classification_rationale)) {
              errors.push(`${spath}.corpus: unsupported planning entry ${artifact.path} requires an explicit non-artifact class and classification_rationale`);
            }
            continue;
          }
          const target = await contained(files, repo, artifact.path);
          if (!target || !(await files.exists(target))) continue;
          let content: string;
          try { content = await files.readText(target); } catch {
            errors.push(`${spath}.corpus: planning entry ${artifact.path} is not valid UTF-8 text`);
            continue;
          }
          if (content.includes("\0")) {
            errors.push(`${spath}.corpus: planning entry ${artifact.path} contains binary NUL bytes`);
            continue;
          }
          const earlyDone = /\b(implementation|dev|code)\b/i.test(content) && /\b(done|complete|completed|merged)\b/i.test(content);
          const laterUnrun = /\b(review|qa|acceptance|holdout)\b/i.test(content) && /\b(not[_ -]?run|pending|todo|backlog|unexecuted)\b/i.test(content);
          if (earlyDone && laterUnrun) errors.push(`${spath}.corpus: ${artifact.path} contains an executed-early/unexecuted-later procedure and cannot be CLEAN`);
          if (planningSourcePaths.has(artifact.path)) continue;
          planningSourcePaths.add(artifact.path);
          planningSources.push({
            ...(text(artifact.classification_rationale)
              ? { classificationRationale: artifact.classification_rationale }
              : {}),
            content,
            declaredClass: String(artifact.class),
            path: artifact.path,
          });
        }
      }
    }
  }
  if (clean && repo) {
    const audit = auditPlanningArtifacts(planningSources, declared.size);
    for (const finding of audit.findings) {
      errors.push(`${path}.corpus: ${finding.code} at ${finding.path} (${finding.subject}): ${finding.detail}; related=${JSON.stringify(finding.related)}`);
    }
  }
  if (repo) {
    const uncovered = [...discovered].filter((candidate) => ![...declared].some((root) => candidate === root || candidate.startsWith(`${root}/`))).sort();
    if (uncovered.length) errors.push(`${path}.systems: independently discovered planning roots are not fully covered: ${JSON.stringify(uncovered)}`);
  }
}

async function validateChangeInventory(
  bundle: JsonObject, report: JsonObject, manifest: JsonObject, repo: string | undefined,
  git: GitPort, base: string, files: FilePort, clean: boolean, allowPlaceholders: boolean,
  clock: EvidenceClock | undefined, errors: string[],
): Promise<void> {
  const path = "$.change_inventory";
  const inventory = requireObject(bundle.change_inventory, ["start_commit", "subject_commit", "changes"], path, errors);
  if (!inventory) return;
  const subject = object(report.repo)?.commit;
  if (!allowPlaceholders && inventory.subject_commit !== subject) errors.push(`${path}.subject_commit: must equal report repo.commit`);
  const startSnapshotRecord = object(object(object(bundle.successor_readiness)?.snapshots)?.start);
  const startSnapshot = startSnapshotRecord?.commit ?? startSnapshotRecord?.object;
  if (!allowPlaceholders && inventory.start_commit !== startSnapshot) errors.push(`${path}.start_commit: must equal start snapshot object`);
  const actions = new Map(array(manifest.actions).map((raw) => object(raw)).filter(Boolean).map((item) => [String(item!.id), item!]));
  const reported = new Map<string, string>();
  if (!Array.isArray(inventory.changes)) { errors.push(`${path}.changes: required array`); return; }
  for (const [index, raw] of array(inventory.changes).entries()) {
    const cpath = `${path}.changes[${index}]`;
    const change = requireObject(raw, ["status", "path", "action_ids", "exclusion"], cpath, errors);
    if (!change || !text(change.path)) continue;
    if (isAbsolute(change.path) || change.path.split(/[\\/]/).includes("..") || reported.has(change.path)) errors.push(`${cpath}.path: required unique repository-relative path`);
    reported.set(change.path, String(change.status));
    if (!new Set(["A", "M", "D", "T"]).has(String(change.status))) errors.push(`${cpath}.status: expected A, M, D, or T`);
    if (!Array.isArray(change.action_ids) || !array(change.action_ids).every(text)) errors.push(`${cpath}.action_ids: required string array`);
    const ids = array(change.action_ids).filter(text);
    for (const id of ids) {
      const action = actions.get(String(id));
      if (!action) errors.push(`${cpath}.action_ids: unknown action ${JSON.stringify(id)}`);
      else {
        const target = String(action.target ?? "");
        if (![change.path, ".", "repository"].includes(target) && !change.path.startsWith(`${target.replace(/\/$/, "")}/`)) errors.push(`${cpath}.action_ids: action ${JSON.stringify(id)} target does not cover ${change.path}`);
      }
    }
    if (clean && ids.length === 0) errors.push(`${cpath}: CLEAN requires an executed action mapping`);
    if (change.exclusion !== null) {
      const record = await evidenceRef(files, base, change.exclusion, `${cpath}.exclusion`, errors, allowPlaceholders, clock, "mister-clean.change-exclusion");
      if (record && !allowPlaceholders) {
        const expected = {
          path: change.path, status: change.status, start_commit: inventory.start_commit,
          subject_commit: subject, request_sha256: object(bundle.criteria_discovery)?.request_sha256,
        };
        for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${cpath}.exclusion: bound exclusion disagrees on ${key}`);
        for (const key of ["actor", "scope", "rationale"] as const) if (!text(record[key])) errors.push(`${cpath}.exclusion: requires ${key}`);
      }
    }
  }
  if (repo && text(inventory.start_commit) && text(subject)) {
    const output = (await git.run(repo, ["diff", "--name-status", "--no-renames", inventory.start_commit, subject])).stdout;
    const live = new Map(output.split("\n").filter(Boolean).map((line) => { const [status = "", path = ""] = line.split("\t", 2); return [path, status]; }));
    if (!stableEqual([...live.entries()].sort(), [...reported.entries()].sort())) errors.push(`${path}.changes: live start-to-subject diff differs`);
  }
}

/** Validate an already-parsed closure bundle and all digest-bound sidecars. */
async function validateBundleUnsafe(
  data: unknown,
  bundlePath: string,
  options: BundleValidationOptions = {},
): Promise<BundleValidationResult> {
  const errors: string[] = [];
  const clock = evidenceClock(options, errors);
  const allowPlaceholders = options.allowPlaceholders ?? false;
  const verifyLive = options.verifyLive ?? true;
  const ports = options.ports ?? nodeBundlePorts;
  if (clock) validateEvidenceClock(data, "$", clock, errors);
  const bundle = requireObject(data, ["record_type", "schema_version", "run_id", "request_ref", "report", "manifest", "custody", "criteria_discovery", "change_inventory", "planning_discovery", "successor_readiness"], "$", errors);
  if (!bundle) return { errors, ok: false };
  if (bundle.record_type !== "mister-clean.closure-bundle") errors.push("$.record_type: expected mister-clean.closure-bundle");
  if (bundle.schema_version !== "1.0") errors.push("$.schema_version: expected 1.0");
  for (const field of ["run_id", "request_ref"] as const) if (!text(bundle[field])) errors.push(`$.${field}: required`);
  const base = dirname(resolve(bundlePath));
  const reportLoad = await loadRef(ports.files, base, bundle.report, "$.report", errors, allowPlaceholders);
  const manifestLoad = await loadRef(ports.files, base, bundle.manifest, "$.manifest", errors, allowPlaceholders);
  const report = reportLoad.data;
  const manifest = manifestLoad.data;
  if (!report || !manifest) return { errors, ok: errors.length === 0 };
  if (clock) {
    validateEvidenceClock(report, "$.report", clock, errors);
    validateEvidenceClock(manifest, "$.manifest", clock, errors);
  }
  errors.push(...validateReport(report, allowPlaceholders, true).map((error) => `$.report::${error}`));
  errors.push(...validateManifest(manifest, allowPlaceholders).map((error) => `$.manifest::${error}`));
  if (!allowPlaceholders && !iso(report.generated_at)) errors.push("$.report.generated_at: required ISO-8601 timestamp");
  if (!allowPlaceholders && !iso(object(report.target_binding)?.measured_at)) errors.push("$.report.target_binding.measured_at: required ISO-8601 timestamp");
  if (bundle.request_ref !== object(report.authorization_basis)?.ref) errors.push("$.request_ref: must equal report authorization_basis.ref");
  if (bundle.request_ref !== manifest.request_ref) errors.push("$.request_ref: must equal manifest request_ref");
  for (const field of ["id", "commit"] as const) if (object(report.repo)?.[field] !== object(manifest.repo)?.[field]) errors.push(`$.report/manifest.repo.${field}: must match`);
  if (report.mode !== manifest.mode) errors.push("$.report/manifest.mode: must match");
  const reportActions = array(report.actions).map(object).filter(Boolean) as JsonObject[];
  const manifestActions = array(manifest.actions).map(object).filter(Boolean) as JsonObject[];
  const reportIds = reportActions.map((item) => item.id);
  const manifestIds = manifestActions.map((item) => item.id);
  if (new Set(reportIds).size !== reportActions.length) errors.push("$.report.actions: every action requires a unique id");
  if (!stableEqual([...reportIds].sort(), [...manifestIds].sort())) errors.push("$.report/manifest.actions: exact action id sets must match");
  else if (!stableEqual(reportActions, manifestActions)) errors.push("$.report/manifest.actions: canonical action records must match exactly");
  const clean = report.verdict === "CLEAN";
  let liveRuntimeIdentity: DetectorRuntimeIdentity | undefined;
  const runtimeCandidate: unknown = options.runtimeAttestation;
  if (runtimeCandidate !== undefined) {
    if (!isVerifiedServerAttestationBinding(runtimeCandidate)) {
      errors.push("$.runtime_attestation: must be minted by Mister Clean's live verifier");
    } else if (runtimeCandidate.status === "bundled_content") {
      errors.push("$.runtime_attestation: bundled-content identity cannot validate repository detector execution");
    } else {
      try {
        liveRuntimeIdentity = createDetectorRuntimeIdentity(runtimeCandidate);
      } catch (error) {
        errors.push(`$.runtime_attestation: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  if (clean) {
    if (!liveRuntimeIdentity) {
      errors.push("$.runtime_attestation: CLEAN requires a live verifier-minted file runtime binding");
    } else if (liveRuntimeIdentity.status !== "release_attested") {
      errors.push("$.runtime_attestation.status: CLEAN requires a release-attested CLI runtime");
    }
  }
  if (clean && manifestActions.length > 0 && manifest.execution_state !== "executed") errors.push("$.manifest.execution_state: CLEAN with actions requires executed");
  if (clean) for (const action of reportActions) if (action.status !== "executed") errors.push(`$.report.actions[${JSON.stringify(action.id)}].status: CLEAN requires executed`);
  const custody = requireObject(bundle.custody, ["mode", "subject_commit", "evidence_root", "evidence_paths"], "$.custody", errors);
  if (custody) {
    if (custody.mode !== "sidecar") errors.push("$.custody.mode: only sidecar is supported");
    if (!allowPlaceholders && custody.subject_commit !== object(report.repo)?.commit) errors.push("$.custody.subject_commit: must equal report repo.commit");
    if (!Array.isArray(custody.evidence_paths) || !array(custody.evidence_paths).every((entry) => text(entry) && !isAbsolute(entry) && !entry.split(/[\\/]/).includes(".."))) errors.push("$.custody.evidence_paths: required repository-relative string array");
    if (custody.evidence_root !== null || !stableEqual(custody.evidence_paths, [])) errors.push("$.custody: sidecar mode requires null evidence_root and empty evidence_paths");
  }
  let repo = options.repoPath ? resolve(options.repoPath) : undefined;
  if (verifyLive && !allowPlaceholders && !repo) {
    const probe = await ports.git.run(base, ["rev-parse", "--show-toplevel"], [0, 128]);
    if (probe.code === 0 && probe.stdout) repo = resolve(probe.stdout);
    else errors.push("$.live_repo: pass --repo or store the bundle inside the repository");
  }
  const repoExists = repo ? await ports.files.exists(repo) : false;
  if (verifyLive && !allowPlaceholders && repo && !repoExists) errors.push(`$.live_repo: repository not found: ${repo}`);
  const structuralRepo = repoExists ? repo : undefined;
  if (verifyLive && !allowPlaceholders && requiresAcceptedReleaseBoundary(report, manifest)) {
    if (!options.acceptedEvaluatorPath) {
      errors.push("$.accepted_release_ref.path: live GUARD acceptance requires --accepted-evaluator <absolute path>");
    } else if (structuralRepo) {
      const accepted = await verifyAcceptedReleaseBoundary({
        acceptedEvaluatorPath: options.acceptedEvaluatorPath,
        candidateRepoPath: structuralRepo,
        evaluator: selectedMisterCleanEvaluator(report, manifest),
        files: ports.files,
      });
      errors.push(...accepted.errors);
    }
  }
  await validateCriteria(bundle, report, base, ports.files, clean, allowPlaceholders, clock, errors);
  await validateBoundExecutionRecords(bundle, report, manifest, structuralRepo, ports.git, base, ports.files, allowPlaceholders, clock, errors);
  await validateChangeInventory(bundle, report, manifest, structuralRepo, ports.git, base, ports.files, clean, allowPlaceholders, clock, errors);
  await validateRegressionDelta(
    bundle,
    report,
    manifest,
    base,
    ports.files,
    clean,
    allowPlaceholders,
    clock,
    liveRuntimeIdentity,
    errors,
  );
  await validatePlanning(bundle, structuralRepo, ports.files, clean, allowPlaceholders, errors);
  await validateSuccessor(bundle, report, base, ports.files, clean, allowPlaceholders, clock, errors);
  if (!allowPlaceholders) for (const path of findPlaceholders(bundle)) errors.push(`${path}: unresolved template placeholder`);
  const liveGuard = manifest.mode === "GUARD" && !allowPlaceholders;
  if (clean || liveGuard) {
    if (clean && !verifyLive) errors.push("$.verdict: CLEAN requires live verification");
    else if (verifyLive && repo && repoExists) await validateLive(bundle, report, manifest, bundlePath, repo, ports, options.guardAuthorityPath, errors);
  }
  return { errors, ok: errors.length === 0 };
}

/**
 * Public trust boundary. Parsed input may be cyclic, proxied, or otherwise
 * hostile; no such value is allowed to turn validation into an exception.
 */
export async function validateBundle(
  data: unknown,
  bundlePath: string,
  options: BundleValidationOptions = {},
): Promise<BundleValidationResult> {
  try {
    return await validateBundleUnsafe(data, bundlePath, options);
  } catch (error) {
    return {
      errors: [`$: validation input could not be safely inspected: ${error instanceof Error ? error.message : String(error)}`],
      ok: false,
    };
  }
}

/** Parse and validate a closure bundle from disk without exposing CLI effects. */
export async function validateBundleFile(
  bundlePath: string,
  options: BundleValidationOptions = {},
): Promise<BundleValidationResult> {
  const ports = options.ports ?? nodeBundlePorts;
  try {
    const data = JSON.parse(await ports.files.readText(bundlePath));
    return validateBundle(data, bundlePath, { ...options, ports });
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : String(error)], failureKind: "load", ok: false };
  }
}
