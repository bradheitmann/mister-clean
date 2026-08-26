/**
 * Live-bound Mister Clean closure-bundle validation.
 *
 * The domain rules consume `unknown` and accumulate errors. Filesystem and Git
 * effects sit behind narrow ports so the same rules can be exercised with
 * deterministic adapters while the default adapter remains Node/Bun portable.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, lstat, readFile, readdir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import {
  findPlaceholders,
  isoTimestamp,
  REGRESSION_COUNT_FIELDS,
  REGRESSION_POLICY,
  validateManifest,
  validateReport,
} from "./records.js";
import { canonicalIdentity } from "./normalization.js";
import { isCanonicalPlanningFileName, PLANNING_LANE_NAMES } from "./repository.js";
import {
  auditPlanningArtifacts,
  isNonArtifactPlanningClass,
  isPlanningTextPath,
  type PlanningSource,
} from "./planning.js";

const execFileAsync = promisify(execFile);

export interface FilePort {
  readBytes(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  isFile(path: string): Promise<boolean>;
  realpath(path: string): Promise<string>;
  walk(root: string): Promise<readonly FileObservation[]>;
}

export interface FileObservation {
  readonly absolute: string;
  readonly relative: string;
  readonly kind: "file" | "directory" | "symlink";
}

export interface GitResult {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

export interface GitPort {
  run(repo: string, args: readonly string[], allowed?: readonly number[]): Promise<GitResult>;
}

export interface BundlePorts {
  readonly files: FilePort;
  readonly git: GitPort;
}

export interface BundleValidationOptions {
  readonly allowPlaceholders?: boolean;
  readonly ports?: BundlePorts;
  readonly repoPath?: string;
  readonly verifyLive?: boolean;
}

export interface BundleValidationResult {
  readonly errors: readonly string[];
  readonly failureKind?: "load";
  readonly ok: boolean;
}

type JsonObject = Record<string, unknown>;

const HEX64 = /^[0-9a-f]{64}$/;
const PLANNING_NAMES = new Set([
  "planning", "plans", "roadmap", "project-management", "work-items",
  "work_items", "tasks", "stories", "epics", "slices", "issues",
]);
const PLANNING_KINDS = new Set(["repo_files", "external_snapshot", "none"]);
const GATE_KINDS = new Set([
  "isolated_clone", "repository_tests", "lint", "typecheck", "build",
  "planning_validation", "security_scan", "established_ci", "negative_control",
]);
const IGNORED_WALK = new Set([".git", "node_modules", "vendor", ".venv", "venv", "dist", "build", ".cache"]);
const LOCAL_ACTION_KINDS = new Set([
  "local_edit", "local_move", "recoverable_delete", "doc_update",
  "planning_record_update", "historical_conform", "handoff_update",
]);
const EXTERNAL_CLAIMS = new Set(["ci_green_on_push", "deployed", "independently_qa_accepted"]);

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function identity(value: unknown): string {
  return canonicalIdentity(value);
}

function owned(value: unknown): boolean {
  const normalized = identity(value);
  return normalized.length > 0 && !new Set([
    "unknown", "unowned", "unassigned", "none", "n/a", "na", "tbd", "not assigned", "not-assigned",
  ]).has(normalized);
}

function iso(value: unknown): boolean {
  return isoTimestamp(value);
}

function executedText(value: unknown): boolean {
  if (!text(value)) return false;
  return !new Set(["not run", "not executed", "not measured", "claim", "anything", "pass"])
    .has(value.trim().split(/\s+/).join(" ").toLocaleLowerCase("und"));
}

function posix(path: string): string {
  return path.split(sep).join("/");
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function stableEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => stableEqual(value, right[index]));
  }
  const leftObject = object(left);
  const rightObject = object(right);
  if (!leftObject || !rightObject) return false;
  const leftKeys = Object.keys(leftObject).sort();
  const rightKeys = Object.keys(rightObject).sort();
  return stableEqual(leftKeys, rightKeys)
    && leftKeys.every((key) => stableEqual(leftObject[key], rightObject[key]));
}

function requireObject(value: unknown, keys: readonly string[], path: string, errors: string[]): JsonObject | undefined {
  const item = object(value);
  if (!item) {
    errors.push(`${path}: expected object`);
    return undefined;
  }
  for (const key of [...keys].sort()) if (!(key in item)) errors.push(`${path}.${key}: missing`);
  return item;
}

export const nodeFilePort: FilePort = {
  async readBytes(path) { return new Uint8Array(await readFile(path)); },
  async readText(path) { return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path)); },
  async exists(path) { try { await access(path); return true; } catch { return false; } },
  async isFile(path) { try { return (await lstat(path)).isFile(); } catch { return false; } },
  async realpath(path) { return realpath(path); },
  async walk(root) {
    const rootPath = resolve(root);
    const rows: FileObservation[] = [];
    async function visit(directory: string): Promise<void> {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_WALK.has(entry.name)) continue;
        const absolute = resolve(directory, entry.name);
        const rel = posix(relative(rootPath, absolute));
        if (entry.isSymbolicLink()) rows.push({ absolute, relative: rel, kind: "symlink" });
        else if (entry.isDirectory()) { rows.push({ absolute, relative: rel, kind: "directory" }); await visit(absolute); }
        else if (entry.isFile()) rows.push({ absolute, relative: rel, kind: "file" });
      }
    }
    await visit(rootPath);
    return rows.sort((a, b) => compareCodePoints(a.relative, b.relative));
  },
};

export const nodeGitPort: GitPort = {
  async run(repo, args, allowed = [0]) {
    try {
      const result = await execFileAsync("git", ["-C", repo, ...args], { encoding: "utf8" });
      return { code: 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
    } catch (error) {
      const failure = error as { code?: number; stdout?: string; stderr?: string; message?: string };
      const result = {
        code: typeof failure.code === "number" ? failure.code : 128,
        stdout: (failure.stdout ?? "").trim(),
        stderr: (failure.stderr ?? failure.message ?? "").trim(),
      };
      if (!allowed.includes(result.code)) throw new Error(result.stderr || `git ${args.join(" ")} exited ${result.code}`);
      return result;
    }
  },
};

export const nodeBundlePorts: BundlePorts = { files: nodeFilePort, git: nodeGitPort };

async function contained(files: FilePort, root: string, candidate: unknown): Promise<string | undefined> {
  if (!text(candidate) || isAbsolute(candidate)) return undefined;
  const lexical = resolve(root, candidate);
  const rel = relative(resolve(root), lexical);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return undefined;
  try {
    const rootReal = await files.realpath(root);
    let existing = lexical;
    const tail: string[] = [];
    while (!(await files.exists(existing)) && dirname(existing) !== existing) {
      tail.unshift(basename(existing));
      existing = dirname(existing);
    }
    const targetReal = resolve(await files.realpath(existing), ...tail);
    const realRel = relative(rootReal, targetReal);
    if (realRel === ".." || realRel.startsWith(`..${sep}`) || isAbsolute(realRel)) return undefined;
    return targetReal;
  } catch {
    return lexical;
  }
}

async function loadBytesRef(
  files: FilePort,
  base: string,
  value: unknown,
  path: string,
  errors: string[],
  allowPlaceholders: boolean,
): Promise<{ bytes?: Uint8Array; digest?: string; file?: string }> {
  const ref = requireObject(value, ["path", "sha256"], path, errors);
  if (!ref) return {};
  if (allowPlaceholders && [ref.path, ref.sha256].some((entry) => typeof entry === "string" && entry.includes("<"))) return {};
  const target = await contained(files, base, ref.path);
  if (!target) { errors.push(`${path}.path: must resolve inside the bundle directory`); return {}; }
  if (!(await files.isFile(target))) { errors.push(`${path}.path: file not found or not a regular file: ${target}`); return { file: target }; }
  const bytes = await files.readBytes(target);
  const digest = sha256(bytes);
  if (!allowPlaceholders) {
    if (typeof ref.sha256 !== "string" || !HEX64.test(ref.sha256)) errors.push(`${path}.sha256: required lowercase SHA-256`);
    else if (digest !== ref.sha256) errors.push(`${path}.sha256: digest mismatch`);
  }
  return { bytes, digest, file: target };
}

async function loadRef(
  files: FilePort,
  base: string,
  value: unknown,
  path: string,
  errors: string[],
  allowPlaceholders: boolean,
): Promise<{ data?: JsonObject; file?: string }> {
  const loaded = await loadBytesRef(files, base, value, path, errors, allowPlaceholders);
  const fileResult = loaded.file === undefined ? {} : { file: loaded.file };
  if (!loaded.bytes) return fileResult;
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(loaded.bytes));
    if (!object(parsed)) errors.push(`${path}.path: expected JSON object`);
    const data = object(parsed);
    return data ? { ...fileResult, data } : fileResult;
  } catch (error) {
    errors.push(`${path}.path: ${error instanceof Error ? error.message : String(error)}`);
    return fileResult;
  }
}

async function evidenceRef(
  files: FilePort,
  base: string,
  ref: unknown,
  path: string,
  errors: string[],
  allowPlaceholders: boolean,
  recordType?: string,
): Promise<JsonObject | undefined> {
  const loaded = await loadRef(files, base, ref, path, errors, allowPlaceholders);
  if (loaded.data && recordType && loaded.data.record_type !== recordType) {
    errors.push(`${path}: expected evidence record_type ${recordType}`);
  }
  return loaded.data;
}

async function repositoryIdentity(repo: string, git: GitPort): Promise<string> {
  const remote = (await git.run(repo, ["config", "--get", "remote.origin.url"], [0, 1])).stdout;
  if (remote && !remote.startsWith("/") && !remote.startsWith("file://")) {
    const path = remote.includes("://") ? new URL(remote).pathname.replace(/^\/+|\/+$/g, "") : remote.split(":", 2).at(-1) ?? "";
    const normalized = path.replace(/\.git$/, "").replace(/\/+$/, "");
    if (normalized.includes("/")) return normalized;
  }
  return basename(repo);
}

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
  clean: boolean, allowPlaceholders: boolean, errors: string[],
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
  const records = await Promise.all(refs.map((ref, index) => evidenceRef(files, base, ref, `${path}.source_refs[${index}]`, errors, allowPlaceholders, "mister-clean.criteria-source")));
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
      if (repo && system.kind === "repo_files" && text(artifact.path)) {
        const target = await contained(files, repo, artifact.path);
        if (!target || !(await files.isFile(target))) errors.push(`${apath}.path: missing, not a regular file, or outside repository`);
        else if (typeof artifact.sha256 === "string" && HEX64.test(artifact.sha256) && sha256(await files.readBytes(target)) !== artifact.sha256) errors.push(`${apath}.sha256: live digest mismatch`);
      }
    }
    if (corpus.total !== seen.size) errors.push(`${spath}.corpus.total (${String(corpus.total)}) != unique artifacts (${seen.size})`);
    if (corpus.classified !== seen.size - unclassified) errors.push(`${spath}.corpus.classified (${String(corpus.classified)}) != classified artifact rows (${seen.size - unclassified})`);
    if (corpus.unclassified !== unclassified) errors.push(`${spath}.corpus.unclassified (${String(corpus.unclassified)}) != unclassified artifact rows (${unclassified})`);
    if (clean && corpus.unclassified !== 0) errors.push(`${spath}.corpus.unclassified: CLEAN requires zero`);
    if (repo && system.kind === "repo_files") {
      const live = new Set<string>();
      const repositoryRoot = await files.realpath(repo);
      for (const root of roots) {
        const target = await contained(files, repo, root);
        if (!target || !(await files.exists(target))) { errors.push(`${spath}.corpus.roots: missing or outside repository: ${JSON.stringify(root)}`); continue; }
        if (await files.isFile(target)) live.add(posix(relative(repositoryRoot, target)));
        else (await files.walk(target)).filter((row) => row.kind !== "directory").forEach((row) => live.add(posix(relative(repositoryRoot, row.absolute))));
      }
      if (!stableEqual([...live].sort(), [...seen].sort())) errors.push(`${spath}.corpus: live census mismatch missing_from_bundle=${JSON.stringify([...live].filter((item) => !seen.has(item)).sort())} absent_from_live=${JSON.stringify([...seen].filter((item) => !live.has(item)).sort())}`);
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
  git: GitPort, base: string, files: FilePort, clean: boolean, allowPlaceholders: boolean, errors: string[],
): Promise<void> {
  const path = "$.change_inventory";
  const inventory = requireObject(bundle.change_inventory, ["start_commit", "subject_commit", "changes"], path, errors);
  if (!inventory) return;
  const subject = object(report.repo)?.commit;
  if (!allowPlaceholders && inventory.subject_commit !== subject) errors.push(`${path}.subject_commit: must equal report repo.commit`);
  const startSnapshot = object(object(object(bundle.successor_readiness)?.snapshots)?.start)?.object;
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
      const record = await evidenceRef(files, base, change.exclusion, `${cpath}.exclusion`, errors, allowPlaceholders, "mister-clean.change-exclusion");
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

async function validateRegressionDelta(
  bundle: JsonObject,
  report: JsonObject,
  manifest: JsonObject,
  base: string,
  files: FilePort,
  clean: boolean,
  allowPlaceholders: boolean,
  errors: string[],
): Promise<void> {
  const path = "$.report.regression_control";
  const control = requireObject(report.regression_control, [
    "policy", "baseline_object", "closing_object", ...REGRESSION_COUNT_FIELDS, "evidence_ref",
  ], path, errors);
  if (!control) return;
  const record = await evidenceRef(
    files,
    base,
    control.evidence_ref,
    `${path}.evidence_ref`,
    errors,
    allowPlaceholders,
    "mister-clean.regression-delta",
  );
  if (!record) return;
  const recordPath = `${path}.evidence_ref`;
  requireObject(record, [
    "record_type", "schema_version", "policy", "baseline_object", "closing_object",
    ...REGRESSION_COUNT_FIELDS.filter((field) => field !== "action_checks"), "action_checks",
  ], recordPath, errors);
  if (record.schema_version !== "1.2") errors.push(`${recordPath}.schema_version: expected 1.2`);
  if (record.policy !== REGRESSION_POLICY) {
    errors.push(`${recordPath}.policy: expected ${REGRESSION_POLICY}`);
  }
  for (const field of ["policy", "baseline_object", "closing_object", ...REGRESSION_COUNT_FIELDS] as const) {
    const recordValue = field === "action_checks" ? array(record.action_checks).length : record[field];
    if (control[field] !== recordValue) errors.push(`${recordPath}: bound regression record disagrees on ${field}`);
  }

  const snapshots = object(object(bundle.successor_readiness)?.snapshots);
  const startObject = object(snapshots?.start)?.object;
  const endObject = object(snapshots?.end)?.object;
  const closingObject = object(report.repo)?.commit;
  if (record.baseline_object !== startObject) errors.push(`${recordPath}.baseline_object: must equal successor start snapshot`);
  if (record.closing_object !== endObject || record.closing_object !== closingObject) {
    errors.push(`${recordPath}.closing_object: must equal successor end snapshot and report repo.commit`);
  }

  for (const field of REGRESSION_COUNT_FIELDS.filter((name) => name !== "action_checks")) {
    if (!Number.isInteger(record[field]) || Number(record[field]) < 0) {
      errors.push(`${recordPath}.${field}: required nonnegative integer`);
    }
  }
  const countsValid = REGRESSION_COUNT_FIELDS
    .filter((field) => field !== "action_checks")
    .every((field) => Number.isInteger(record[field]) && Number(record[field]) >= 0);
  if (countsValid) {
    const baselineExpected = Number(record.baseline_paid) + Number(record.baseline_open);
    if (record.baseline_findings !== baselineExpected) {
      errors.push(`${recordPath}.baseline_findings: must equal baseline_paid + baseline_open (${baselineExpected})`);
    }
    const closingExpected = Number(record.baseline_open)
      + Number(record.newly_discovered_preexisting_open)
      + Number(record.concurrent_external_open)
      + Number(record.introduced_by_run_open);
    if (record.closing_findings !== closingExpected) {
      errors.push(`${recordPath}.closing_findings: must equal all open origin buckets (${closingExpected})`);
    }
  }

  if (!Array.isArray(record.action_checks)) errors.push(`${recordPath}.action_checks: required array`);
  const checks = array(record.action_checks);
  const manifestActions = array(manifest.actions).map(object).filter((item): item is JsonObject => !!item);
  const expectedActionIds = manifestActions
    .filter((action) => manifest.execution_state === "executed" || action.status === "executed" || action.status === "failed")
    .map((action) => action.id);
  const checkedActionIds: unknown[] = [];
  let introducedPaid = 0;
  let introducedOpen = 0;
  const interruptedAt: number[] = [];
  for (const [index, raw] of checks.entries()) {
    const checkPath = `${recordPath}.action_checks[${index}]`;
    const check = requireObject(raw, [
      "action_id", "before_object", "after_object", "comparators", "introduced",
      "paid_before_boundary", "open_at_boundary", "boundary_status", "observed_at",
    ], checkPath, errors);
    if (!check) continue;
    checkedActionIds.push(check.action_id);
    for (const field of ["action_id", "before_object", "after_object"] as const) {
      if (!text(check[field])) errors.push(`${checkPath}.${field}: required`);
    }
    if (!iso(check.observed_at)) errors.push(`${checkPath}.observed_at: required ISO-8601 timestamp`);
    for (const field of ["introduced", "paid_before_boundary", "open_at_boundary"] as const) {
      if (!Number.isInteger(check[field]) || Number(check[field]) < 0) errors.push(`${checkPath}.${field}: required nonnegative integer`);
    }
    if (Number.isInteger(check.introduced) && Number.isInteger(check.paid_before_boundary) && Number.isInteger(check.open_at_boundary)) {
      const accounted = Number(check.paid_before_boundary) + Number(check.open_at_boundary);
      if (check.introduced !== accounted) errors.push(`${checkPath}.introduced: must equal paid_before_boundary + open_at_boundary (${accounted})`);
    }
    if (!Array.isArray(check.comparators) || array(check.comparators).length === 0) {
      errors.push(`${checkPath}.comparators: required nonempty array`);
    }
    const derivedIntroduced = new Set<string>();
    const derivedPaid = new Set<string>();
    const derivedOpen = new Set<string>();
    const comparatorIds = new Set<string>();
    for (const [comparatorIndex, rawComparator] of array(check.comparators).entries()) {
      const comparatorPath = `${checkPath}.comparators[${comparatorIndex}]`;
      const comparator = requireObject(rawComparator, [
        "id", "command", "scope", "detector", "observations",
      ], comparatorPath, errors);
      if (!comparator) continue;
      for (const field of ["id", "command", "scope", "detector"] as const) {
        if (!text(comparator[field])) errors.push(`${comparatorPath}.${field}: required`);
      }
      const comparatorId = String(comparator.id ?? "");
      if (comparatorIds.has(comparatorId)) errors.push(`${comparatorPath}.id: duplicate within action check`);
      else comparatorIds.add(comparatorId);
      const observations = array(comparator.observations);
      if (observations.length < 2) errors.push(`${comparatorPath}.observations: requires before and after observations`);
      const commandSha256 = sha256(new TextEncoder().encode(String(comparator.command ?? "")));
      const detectorSha256 = sha256(new TextEncoder().encode(String(comparator.detector ?? "")));
      const fingerprintsByObservation: Set<string>[] = [];
      let priorObservedAt = -Infinity;
      for (const [observationIndex, rawObservation] of observations.entries()) {
        const observationPath = `${comparatorPath}.observations[${observationIndex}]`;
        const observation = requireObject(rawObservation, [
          "phase", "object", "command_sha256", "detector_sha256", "result_sha256", "result_ref",
          "finding_fingerprints", "exit_code", "observed_at",
        ], observationPath, errors);
        if (!observation) continue;
        const phase = observation.phase;
        const expectedPhase = observationIndex === 0 ? "before" : observationIndex === observations.length - 1 ? "after" : "intermediate";
        if (phase !== expectedPhase) errors.push(`${observationPath}.phase: expected ${expectedPhase}`);
        if (!text(observation.object)) errors.push(`${observationPath}.object: required`);
        if (observationIndex === 0 && observation.object !== check.before_object) errors.push(`${observationPath}.object: must equal action-check before_object`);
        if (observationIndex === observations.length - 1 && observation.object !== check.after_object) errors.push(`${observationPath}.object: must equal action-check after_object`);
        for (const [field, expected] of [["command_sha256", commandSha256], ["detector_sha256", detectorSha256]] as const) {
          if (!(allowPlaceholders && text(observation[field]) && String(observation[field]).includes("<")) && observation[field] !== expected) {
            errors.push(`${observationPath}.${field}: must equal the SHA-256 of comparator ${field === "command_sha256" ? "command" : "detector"}`);
          }
        }
        if (!(allowPlaceholders && text(observation.result_sha256) && observation.result_sha256.includes("<"))
          && (typeof observation.result_sha256 !== "string" || !HEX64.test(observation.result_sha256))) {
          errors.push(`${observationPath}.result_sha256: required lowercase SHA-256 of exact comparator output`);
        }
        const comparatorResult = await loadBytesRef(
          files,
          base,
          observation.result_ref,
          `${observationPath}.result_ref`,
          errors,
          allowPlaceholders,
        );
        if (comparatorResult.digest
          && !(allowPlaceholders && text(observation.result_sha256) && observation.result_sha256.includes("<"))
          && observation.result_sha256 !== comparatorResult.digest) {
          errors.push(`${observationPath}.result_sha256: must equal the digest-bound result_ref bytes`);
        }
        if (!Number.isInteger(observation.exit_code)) errors.push(`${observationPath}.exit_code: required integer`);
        if (!iso(observation.observed_at)) errors.push(`${observationPath}.observed_at: required ISO-8601 timestamp`);
        else {
          const observedAt = Date.parse(String(observation.observed_at));
          if (observedAt < priorObservedAt) errors.push(`${observationPath}.observed_at: observations must be chronological`);
          priorObservedAt = observedAt;
        }
        if (!Array.isArray(observation.finding_fingerprints)) {
          errors.push(`${observationPath}.finding_fingerprints: required array`);
          fingerprintsByObservation.push(new Set());
          continue;
        }
        const rawFingerprints = array(observation.finding_fingerprints);
        const fingerprints = rawFingerprints.filter((item): item is string => typeof item === "string");
        if (fingerprints.length !== rawFingerprints.length
          || fingerprints.some((item) => !(allowPlaceholders && item.includes("<")) && !HEX64.test(item))) {
          errors.push(`${observationPath}.finding_fingerprints: entries must be lowercase SHA-256 values`);
        }
        if (new Set(fingerprints).size !== fingerprints.length) errors.push(`${observationPath}.finding_fingerprints: duplicates are forbidden`);
        if (!stableEqual(fingerprints, [...fingerprints].sort())) errors.push(`${observationPath}.finding_fingerprints: must be sorted`);
        fingerprintsByObservation.push(new Set(fingerprints));
      }
      if (fingerprintsByObservation.length === observations.length && observations.length >= 2) {
        const before = fingerprintsByObservation[0] ?? new Set<string>();
        const after = fingerprintsByObservation.at(-1) ?? new Set<string>();
        const introduced = new Set(fingerprintsByObservation.flatMap((set) => [...set]).filter((item) => !before.has(item)));
        for (const fingerprint of introduced) {
          const namespaced = `${comparatorId}\0${fingerprint}`;
          derivedIntroduced.add(namespaced);
          if (after.has(fingerprint)) derivedOpen.add(namespaced);
          else derivedPaid.add(namespaced);
        }
      }
    }
    if (Number.isInteger(check.introduced) && check.introduced !== derivedIntroduced.size) {
      errors.push(`${checkPath}.introduced: must equal fingerprint-derived total (${derivedIntroduced.size})`);
    }
    if (Number.isInteger(check.paid_before_boundary) && check.paid_before_boundary !== derivedPaid.size) {
      errors.push(`${checkPath}.paid_before_boundary: must equal fingerprint-derived total (${derivedPaid.size})`);
    }
    if (Number.isInteger(check.open_at_boundary) && check.open_at_boundary !== derivedOpen.size) {
      errors.push(`${checkPath}.open_at_boundary: must equal fingerprint-derived total (${derivedOpen.size})`);
    }
    introducedPaid += derivedPaid.size;
    introducedOpen += derivedOpen.size;
    if (check.boundary_status === "closed") {
      if (check.open_at_boundary !== 0) errors.push(`${checkPath}: closed boundary requires open_at_boundary=0`);
    } else if (check.boundary_status === "interrupted") {
      interruptedAt.push(index);
      if (check.open_at_boundary === 0) errors.push(`${checkPath}: interrupted boundary requires open_at_boundary>0`);
      if (clean) errors.push(`${checkPath}: CLEAN forbids an interrupted action boundary`);
      const action = manifestActions.find((candidate) => candidate.id === check.action_id);
      if (action?.status !== "failed") errors.push(`${checkPath}: interrupted boundary requires a failed action status`);
    } else errors.push(`${checkPath}.boundary_status: expected closed or interrupted`);
  }
  if (!stableEqual(checkedActionIds, expectedActionIds)) {
    errors.push(`${recordPath}.action_checks: ordered action ids must exactly cover every executed or failed action`);
  }
  if (interruptedAt.some((index) => index !== checks.length - 1) || interruptedAt.length > 1) {
    errors.push(`${recordPath}.action_checks: exactly one interrupted boundary may appear, and only as the final observed action`);
  }
  if (introducedPaid !== record.introduced_by_run_paid) {
    errors.push(`${recordPath}.introduced_by_run_paid: must equal action-check total (${introducedPaid})`);
  }
  if (introducedOpen !== record.introduced_by_run_open) {
    errors.push(`${recordPath}.introduced_by_run_open: must equal action-check total (${introducedOpen})`);
  }
  if (clean && record.introduced_by_run_open !== 0) {
    errors.push(`${recordPath}.introduced_by_run_open: CLEAN requires zero`);
  }
}

async function validateBoundExecutionRecords(
  bundle: JsonObject, report: JsonObject, manifest: JsonObject, repo: string | undefined,
  git: GitPort, base: string, files: FilePort, allowPlaceholders: boolean, errors: string[],
): Promise<void> {
  for (const [index, raw] of array(manifest.actions).entries()) {
    const action = object(raw);
    if (!action) continue;
    for (const [evidenceIndex, rawEvidence] of array(object(action.outcome)?.evidence).entries()) {
      const evidence = object(rawEvidence);
      if (!evidence) continue;
      const epath = `$.manifest.actions[${JSON.stringify(action.id)}].outcome.evidence[${evidenceIndex}]`;
      const record = await evidenceRef(files, base, evidence.evidence_ref, `${epath}.evidence_ref`, errors, allowPlaceholders, "mister-clean.action-result");
      if (record && !allowPlaceholders) {
        const expected = {
          action_id: action.id, kind: action.kind, target: action.target,
          object: evidence.object, command: evidence.command, result: evidence.result,
          observed_at: evidence.observed_at,
        };
        for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${epath}: bound result disagrees on ${key}`);
      }
    }
  }

  for (const [index, raw] of array(report.completion_debts).entries()) {
    const debt = object(raw);
    if (!debt) continue;
    if (debt.state === "satisfied") {
      for (const [evidenceIndex, rawEvidence] of array(debt.evidence).entries()) {
        const evidence = object(rawEvidence);
        if (!evidence) continue;
        const epath = `$.report.completion_debts[${index}].evidence[${evidenceIndex}]`;
        const record = await evidenceRef(files, base, evidence.evidence_ref, `${epath}.evidence_ref`, errors, allowPlaceholders, "mister-clean.debt-result");
        if (record && !allowPlaceholders) {
          const expected = {
            debt_id: debt.id, kind: evidence.kind, object: evidence.object,
            command: evidence.command, result: evidence.result, observed_at: evidence.observed_at,
          };
          for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${epath}: bound debt result disagrees on ${key}`);
        }
      }
    }
    if (debt.state === "accepted_exception") {
      const exception = object(debt.exception) ?? {};
      const epath = `$.report.completion_debts[${index}].exception.ref`;
      const record = await evidenceRef(files, base, exception.ref, epath, errors, allowPlaceholders, "mister-clean.operator-ruling");
      if (record && !allowPlaceholders) {
        for (const field of ["actor", "at", "scope", "rationale"] as const) if (record[field] !== exception[field]) errors.push(`${epath}: ruling disagrees on ${field}`);
        if (record.debt_id !== debt.id) errors.push(`${epath}: ruling debt_id mismatch`);
        if (record.request_sha256 !== object(bundle.criteria_discovery)?.request_sha256) errors.push(`${epath}: ruling must bind the exact operative request`);
      }
    }
  }

  for (const [name, raw] of Object.entries(object(report.claims) ?? {})) {
    const claim = object(raw);
    if (claim?.state !== "established") continue;
    for (const [index, rawEvidence] of array(claim.evidence).entries()) {
      const evidence = object(rawEvidence);
      if (!evidence) continue;
      const epath = `$.report.claims.${name}.evidence[${index}]`;
      if (name === "committed_locally") {
        if (repo && !allowPlaceholders && (await git.run(repo, ["cat-file", "-e", `${String(evidence.commit ?? "")}^{commit}`], [0, 128])).code !== 0) errors.push(`${epath}: commit does not exist in live repository`);
      } else if (name === "pushed" && evidence.kind === "remote_ref_resolution") {
        if (repo && !allowPlaceholders) {
          const result = await git.run(repo, ["ls-remote", String(evidence.remote ?? ""), String(evidence.ref ?? "")], [0, 2, 128]);
          const observed = result.stdout.split("\n").filter(Boolean)[0]?.split(/\s+/, 1)[0] ?? "";
          if (observed !== evidence.commit || evidence.commit !== object(report.repo)?.commit) errors.push(`${epath}: live remote resolution does not establish the subject commit`);
        }
      } else if (EXTERNAL_CLAIMS.has(name)) {
        errors.push(`${epath}: local closure bundles cannot establish external claim ${name}; use not_established/not_applicable until a trusted adapter is configured`);
      }
    }
  }
}

async function validateSuccessor(
  bundle: JsonObject, report: JsonObject, base: string, files: FilePort,
  clean: boolean, allowPlaceholders: boolean, errors: string[],
): Promise<void> {
  const path = "$.successor_readiness";
  const successor = requireObject(bundle.successor_readiness, ["snapshots", "target_observation", "topology", "current_state", "gates", "debris", "handoff", "final_review"], path, errors);
  if (!successor) return;
  const snapshots = requireObject(successor.snapshots, ["start", "end"], `${path}.snapshots`, errors);
  if (snapshots) {
    for (const name of ["start", "end"] as const) {
      const snapshot = requireObject(snapshots[name], ["kind", "object", "command", "result", "observed_at"], `${path}.snapshots.${name}`, errors);
      if (!snapshot) continue;
      if (snapshot.kind !== "repository_snapshot") errors.push(`${path}.snapshots.${name}.kind: expected repository_snapshot`);
      for (const field of ["object", "command", "result"] as const) if (!text(snapshot[field])) errors.push(`${path}.snapshots.${name}.${field}: required`);
      if (!allowPlaceholders && !executedText(snapshot.command)) errors.push(`${path}.snapshots.${name}.command: must describe an executed observation, not an assertion`);
      if (!allowPlaceholders && !iso(snapshot.observed_at)) errors.push(`${path}.snapshots.${name}.observed_at: required ISO-8601 timestamp`);
    }
  }
  const observation = requireObject(successor.target_observation, ["kind", "local_ref", "commit", "observed_at"], `${path}.target_observation`, errors);
  if (observation) {
    if (!new Set(["remote_ref_resolution", "local_ref_resolution"]).has(String(observation.kind))) errors.push(`${path}.target_observation.kind: unsupported`);
    if (!text(observation.local_ref)) errors.push(`${path}.target_observation.local_ref: required`);
    if (!text(observation.commit)) errors.push(`${path}.target_observation.commit: required`);
    if (!allowPlaceholders && !iso(observation.observed_at)) errors.push(`${path}.target_observation.observed_at: required ISO-8601 timestamp`);
    if (observation.kind === "remote_ref_resolution") {
      for (const field of ["remote", "remote_ref"] as const) if (!text(observation[field])) errors.push(`${path}.target_observation.${field}: required`);
    } else if (observation.kind === "local_ref_resolution") {
      await evidenceRef(files, base, observation.policy_evidence, `${path}.target_observation.policy_evidence`, errors, allowPlaceholders, "mister-clean.local-target-policy");
    }
  }
  const topology = requireObject(successor.topology, ["worktrees", "branches", "remote_refs", "stashes", "processes", "dirty", "unowned", "unmerged", "blocking_processes"], `${path}.topology`, errors);
  if (topology) {
    for (const field of ["worktrees", "branches", "remote_refs", "stashes", "processes"] as const) {
      if (!Array.isArray(topology[field])) errors.push(`${path}.topology.${field}: required array`);
    }
    let reportedUnowned = 0;
    const specs = {
      worktrees: ["path", "head", "branch", "dirty_count", "owner", "purpose", "disposition"],
      branches: ["name", "commit", "merged", "owner", "purpose", "disposition"],
      remote_refs: ["name", "commit", "merged", "owner", "purpose", "disposition"],
    } as const;
    for (const [field, fields] of Object.entries(specs) as [keyof typeof specs, readonly string[]][]) {
      for (const [index, raw] of array(topology[field]).entries()) {
        const rpath = `${path}.topology.${field}[${index}]`;
        const row = requireObject(raw, fields, rpath, errors);
        if (!row) continue;
        if (!owned(row.owner)) { reportedUnowned += 1; if (clean) errors.push(`${rpath}.owner: CLEAN requires a named owner`); }
        for (const key of ["purpose", "disposition"] as const) if (!text(row[key])) errors.push(`${rpath}.${key}: required`);
        if (field === "worktrees") {
          if (!Number.isInteger(row.dirty_count) || Number(row.dirty_count) < 0) errors.push(`${rpath}.dirty_count: required nonnegative integer`);
          if (clean && Number(row.dirty_count) > 0) {
            errors.push(`${rpath}: unresolved topology row prevents CLEAN`);
            const record = await evidenceRef(files, base, row.policy_ref, `${rpath}.policy_ref`, errors, allowPlaceholders, "mister-clean.topology-policy");
            if (record && !allowPlaceholders) {
              const expected = {
                surface: field, identity: row.path, commit: row.head,
                request_sha256: object(bundle.criteria_discovery)?.request_sha256,
              };
              for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${rpath}.policy_ref: bound topology ruling disagrees on ${key}`);
              for (const key of ["actor", "scope", "rationale", "next_action"] as const) if (!text(record[key])) errors.push(`${rpath}.policy_ref: topology ruling requires ${key}`);
            }
          }
        } else {
          if (typeof row.merged !== "boolean") errors.push(`${rpath}.merged: required boolean`);
          if (clean && row.merged === false) {
            errors.push(`${rpath}: unresolved topology row prevents CLEAN`);
            const record = await evidenceRef(files, base, row.policy_ref, `${rpath}.policy_ref`, errors, allowPlaceholders, "mister-clean.topology-policy");
            if (record && !allowPlaceholders) {
              const expected = {
                surface: field, identity: row.name, commit: row.commit,
                request_sha256: object(bundle.criteria_discovery)?.request_sha256,
              };
              for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${rpath}.policy_ref: bound topology ruling disagrees on ${key}`);
              for (const key of ["actor", "scope", "rationale", "next_action"] as const) if (!text(record[key])) errors.push(`${rpath}.policy_ref: topology ruling requires ${key}`);
            }
          }
        }
      }
    }
    for (const [index, raw] of array(topology.processes).entries()) {
      const ppath = `${path}.topology.processes[${index}]`;
      const process = requireObject(raw, ["identity", "owner", "purpose", "disposition", "blocking"], ppath, errors);
      if (!process) continue;
      if (!text(process.identity)) errors.push(`${ppath}.identity: required`);
      if (!owned(process.owner)) { reportedUnowned += 1; if (clean) errors.push(`${ppath}.owner: CLEAN requires a named owner`); }
      for (const field of ["purpose", "disposition"] as const) if (!text(process[field])) errors.push(`${ppath}.${field}: required`);
      if (typeof process.blocking !== "boolean") errors.push(`${ppath}.blocking: required boolean`);
    }
    for (const field of ["dirty", "unowned", "unmerged", "blocking_processes"] as const) {
      if (!Number.isInteger(topology[field]) || Number(topology[field]) < 0) errors.push(`${path}.topology.${field}: required nonnegative integer`);
      else if (clean && topology[field] !== 0) errors.push(`${path}.topology.${field}: CLEAN requires zero`);
    }
    const reportedBlocking = array(topology.processes).filter((raw) => object(raw)?.blocking === true).length;
    if (topology.blocking_processes !== reportedBlocking) errors.push(`${path}.topology.blocking_processes: must equal blocking process rows (${reportedBlocking})`);
    if (topology.unowned !== reportedUnowned) errors.push(`${path}.topology.unowned: must equal unowned topology rows (${reportedUnowned})`);
    if (clean && array(topology.stashes).length) errors.push(`${path}.topology.stashes: CLEAN requires zero stashes`);
  }
  const currentPath = `${path}.current_state`;
  const current = requireObject(successor.current_state, ["state", "path", "sha256", "commit", "generator", "designation"], currentPath, errors);
  if (current) {
    if (!new Set(["missing", "candidate_unverified", "designated"]).has(String(current.state))) errors.push(`${currentPath}.state: unsupported`);
    if (!text(current.commit) || !text(current.generator)) errors.push(`${currentPath}: commit and generator are required`);
    if (clean && current.state !== "designated") errors.push(`${currentPath}.state: CLEAN requires designated`);
    if (current.state === "missing") {
      if (current.path !== null || current.sha256 !== null || current.designation !== null) errors.push(`${currentPath}: missing state requires null path, sha256, and designation`);
    } else {
      if (!text(current.path)) errors.push(`${currentPath}.path: required`);
      if (!allowPlaceholders && (typeof current.sha256 !== "string" || !HEX64.test(current.sha256))) errors.push(`${currentPath}.sha256: required lowercase SHA-256`);
      if (current.state === "candidate_unverified" && current.designation !== null) errors.push(`${currentPath}.designation: candidate_unverified requires null`);
      if (current.state === "designated") {
        const record = await evidenceRef(files, base, current.designation, `${currentPath}.designation`, errors, allowPlaceholders, "mister-clean.current-state-designation");
        if (record && !allowPlaceholders) {
          for (const field of ["path", "sha256", "commit"] as const) if (record[field] !== current[field]) errors.push(`${currentPath}.designation: bound designation disagrees on ${field}`);
        }
      }
    }
  }
  if (!Array.isArray(successor.gates)) errors.push(`${path}.gates: required array`);
  const gates = array(successor.gates);
  if (clean && gates.length === 0) errors.push(`${path}.gates: CLEAN requires nonempty array`);
  for (const [index, raw] of gates.entries()) {
    const gpath = `${path}.gates[${index}]`;
    const gate = requireObject(raw, ["id", "kind", "object", "command", "expected_status", "observed_status", "semantic_status", "verified", "total", "warnings", "debt", "skipped", "evidence_ref"], gpath, errors);
    if (!gate) continue;
    for (const field of ["id", "kind", "object", "command"] as const) if (!text(gate[field])) errors.push(`${gpath}.${field}: required`);
    if (!GATE_KINDS.has(String(gate.kind))) errors.push(`${gpath}.kind: unsupported gate kind`);
    if (!allowPlaceholders && !executedText(gate.command)) errors.push(`${gpath}.command: must describe an executed gate`);
    for (const field of ["expected_status", "observed_status"] as const) if (!Number.isInteger(gate[field])) errors.push(`${gpath}.${field}: required integer`);
    for (const field of ["verified", "total", "warnings", "debt", "skipped"] as const) if (!Number.isInteger(gate[field]) || Number(gate[field]) < 0) errors.push(`${gpath}.${field}: required nonnegative integer`);
    if (clean && gate.expected_status !== gate.observed_status) errors.push(`${gpath}: observed_status must equal expected_status`);
    if (clean && gate.semantic_status !== "pass") errors.push(`${gpath}.semantic_status: CLEAN requires pass`);
    if (clean && gate.total === 0) errors.push(`${gpath}.total: zero-scope gate cannot establish CLEAN`);
    if (clean && gate.verified !== gate.total) errors.push(`${gpath}: verified must equal total`);
    for (const field of ["warnings", "debt", "skipped"] as const) if (clean && gate[field] !== 0) errors.push(`${gpath}.${field}: CLEAN requires zero`);
    const record = await evidenceRef(files, base, gate.evidence_ref, `${gpath}.evidence_ref`, errors, allowPlaceholders, "mister-clean.gate-result");
    if (record && !allowPlaceholders) {
      const expected = {
        gate_id: gate.id, object: gate.object, command: gate.command,
        observed_status: gate.observed_status, semantic_status: gate.semantic_status,
        verified: gate.verified, total: gate.total, warnings: gate.warnings,
        debt: gate.debt, skipped: gate.skipped,
      };
      for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${gpath}.evidence_ref: bound gate record disagrees on ${key}`);
      if (!iso(record.observed_at)) errors.push(`${gpath}.evidence_ref: gate record requires timezone-aware observed_at`);
    }
  }
  if (clean && !gates.some((raw) => { const gate = object(raw); return gate?.kind === "isolated_clone" && gate.object === object(report.repo)?.commit; })) errors.push(`${path}.gates: CLEAN requires an isolated_clone gate bound to the subject commit`);
  const debris = requireObject(successor.debris, ["removed", "retained", "unclassified", "evidence"], `${path}.debris`, errors);
  if (debris) {
    for (const field of ["removed", "retained", "unclassified"] as const) {
      if (!Number.isInteger(debris[field]) || Number(debris[field]) < 0) errors.push(`${path}.debris.${field}: required nonnegative integer`);
    }
    if (clean && debris.unclassified !== 0) errors.push(`${path}.debris.unclassified: CLEAN requires zero`);
    if (!Array.isArray(debris.evidence) || array(debris.evidence).length === 0) errors.push(`${path}.debris.evidence: required`);
    else {
      for (const [index, ref] of array(debris.evidence).entries()) {
        const record = await evidenceRef(files, base, ref, `${path}.debris.evidence[${index}]`, errors, allowPlaceholders, "mister-clean.debris-census");
        if (record && !allowPlaceholders) for (const field of ["removed", "retained", "unclassified"] as const) {
          if (record[field] !== debris[field]) errors.push(`${path}.debris.evidence[${index}]: bound debris record disagrees on ${field}`);
        }
      }
    }
  }
  const handoff = requireObject(successor.handoff, ["entrypoints", "next_owner", "next_action"], `${path}.handoff`, errors);
  if (handoff) {
    if (!Array.isArray(handoff.entrypoints) || !array(handoff.entrypoints).every(text)) errors.push(`${path}.handoff.entrypoints: required string array`);
    else if (clean && array(handoff.entrypoints).length === 0) errors.push(`${path}.handoff.entrypoints: CLEAN requires at least one entrypoint`);
    for (const field of ["next_owner", "next_action"] as const) if (!text(handoff[field])) errors.push(`${path}.handoff.${field}: required`);
  }
  const review = requireObject(successor.final_review, ["mechanism", "status", "reviewer", "implementer", "reviewer_execution", "implementer_execution", "criteria_reviewed", "planning_reviewed", "findings_total", "findings_paid", "unresolved", "evidence_ref"], `${path}.final_review`, errors);
  if (review) {
    for (const field of ["mechanism", "reviewer", "implementer"] as const) if (!text(review[field])) errors.push(`${path}.final_review.${field}: required`);
    if (identity(review.reviewer) && identity(review.reviewer) === identity(review.implementer)) errors.push(`${path}.final_review: reviewer must differ from implementer`);
    const executionIdentities: unknown[][] = [];
    for (const field of ["reviewer_execution", "implementer_execution"] as const) {
      const execution = requireObject(review[field], ["harness", "session_id", "receipt_id"], `${path}.final_review.${field}`, errors);
      if (!execution) continue;
      for (const key of ["harness", "session_id", "receipt_id"] as const) if (!text(execution[key])) errors.push(`${path}.final_review.${field}.${key}: required`);
      executionIdentities.push([identity(execution.harness), identity(execution.session_id), identity(execution.receipt_id)]);
    }
    if (executionIdentities.length === 2 && stableEqual(executionIdentities[0], executionIdentities[1])) errors.push(`${path}.final_review: reviewer and implementer require distinct execution identities`);
    for (const field of ["criteria_reviewed", "planning_reviewed"] as const) {
      if (typeof review[field] !== "boolean") errors.push(`${path}.final_review.${field}: required boolean`);
      else if (clean && review[field] !== true) errors.push(`${path}.final_review.${field}: CLEAN requires true`);
    }
    if (clean && review.status !== "passed") errors.push(`${path}.final_review.status: CLEAN requires passed`);
    for (const field of ["findings_total", "findings_paid", "unresolved"] as const) if (!Number.isInteger(review[field]) || Number(review[field]) < 0) errors.push(`${path}.final_review.${field}: required nonnegative integer`);
    if (clean && review.unresolved !== 0) errors.push(`${path}.final_review.unresolved: CLEAN requires zero`);
    if (clean && review.findings_total !== review.findings_paid) errors.push(`${path}.final_review: findings_total must equal findings_paid`);
    const record = await evidenceRef(files, base, review.evidence_ref, `${path}.final_review.evidence_ref`, errors, allowPlaceholders, "mister-clean.independent-review");
    if (record && !allowPlaceholders) {
      const criteria = object(bundle.criteria_discovery);
      const planning = object(bundle.planning_discovery);
      const expected = {
        mechanism: review.mechanism, status: review.status,
        reviewer: review.reviewer, implementer: review.implementer,
        reviewer_execution: review.reviewer_execution,
        implementer_execution: review.implementer_execution,
        candidate_commit: object(report.repo)?.commit,
        criteria_ids: criteria?.criteria_ids,
        planning_system_ids: array(planning?.systems).map((item) => object(item)?.id).filter((item) => item !== undefined),
        findings_total: review.findings_total, findings_paid: review.findings_paid,
        unresolved: review.unresolved,
      };
      for (const [key, value] of Object.entries(expected)) if (!stableEqual(record[key], value)) errors.push(`${path}.final_review.evidence_ref: bound review record disagrees on ${key}`);
      if (!iso(record.observed_at)) errors.push(`${path}.final_review.evidence_ref: review record requires timezone-aware observed_at`);
    }
  }
}

async function validateLive(
  bundle: JsonObject, report: JsonObject, manifest: JsonObject, bundlePath: string,
  repo: string, ports: BundlePorts, errors: string[],
): Promise<void> {
  const { files, git } = ports;
  if (!(await files.exists(repo))) { errors.push(`$.live_repo: repository not found: ${repo}`); return; }
  try {
    const top = await files.realpath(resolve((await git.run(repo, ["rev-parse", "--show-toplevel"])).stdout));
    const requestedRoot = await files.realpath(resolve(repo));
    if (top !== requestedRoot) errors.push(`$.live_repo: expected worktree root ${top}, got ${requestedRoot}`);
    const head = (await git.run(repo, ["rev-parse", "HEAD"])).stdout;
    const subject = object(report.repo)?.commit;
    if ((await git.run(repo, ["cat-file", "-e", `${String(subject ?? "")}^{commit}`], [0, 128])).code !== 0) errors.push("$.report.repo.commit: subject commit does not exist in live repository");
    const custody = object(bundle.custody) ?? {};
    if (custody.mode !== "sidecar") errors.push("$.custody.mode: only sidecar is supported");
    else if (head !== subject) errors.push(`$.custody: sidecar validation requires live HEAD ${head} == subject ${String(subject)}`);
    if (object(report.repo)?.id !== await repositoryIdentity(repo, git)) errors.push("$.report.repo.id: does not match independently resolved live repository identity");
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
      const commit = String(snapshot.object ?? "");
      if (!/^[0-9a-f]{40}$/.test(commit) || (await git.run(repo, ["cat-file", "-e", `${commit}^{commit}`], [0, 128])).code !== 0) errors.push(`$.successor_readiness.snapshots.${name}.object: must be an existing full commit`);
    }
    if (object(object(successor.snapshots)?.end)?.object !== subject) errors.push("$.successor_readiness.snapshots.end.object: must equal subject commit");
    for (const [index, raw] of array(manifest.actions).entries()) {
      const action = object(raw);
      if (action && LOCAL_ACTION_KINDS.has(String(action.kind))) {
        const actionPath = await contained(files, repo, action.target);
        if (!actionPath) errors.push(`$.manifest.actions[${index}].target: resolves outside repository through traversal or symlink`);
      }
    }
    void bundlePath;
  } catch (error) {
    errors.push(`$.live_git: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Validate an already-parsed closure bundle and all digest-bound sidecars. */
export async function validateBundle(
  data: unknown,
  bundlePath: string,
  options: BundleValidationOptions = {},
): Promise<BundleValidationResult> {
  const errors: string[] = [];
  const allowPlaceholders = options.allowPlaceholders ?? false;
  const verifyLive = options.verifyLive ?? true;
  const ports = options.ports ?? nodeBundlePorts;
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
  await validateCriteria(bundle, report, base, ports.files, clean, allowPlaceholders, errors);
  await validateBoundExecutionRecords(bundle, report, manifest, structuralRepo, ports.git, base, ports.files, allowPlaceholders, errors);
  await validateChangeInventory(bundle, report, manifest, structuralRepo, ports.git, base, ports.files, clean, allowPlaceholders, errors);
  await validateRegressionDelta(bundle, report, manifest, base, ports.files, clean, allowPlaceholders, errors);
  await validatePlanning(bundle, structuralRepo, ports.files, clean, allowPlaceholders, errors);
  await validateSuccessor(bundle, report, base, ports.files, clean, allowPlaceholders, errors);
  if (!allowPlaceholders) for (const path of findPlaceholders(bundle)) errors.push(`${path}: unresolved template placeholder`);
  if (clean) {
    if (!verifyLive) errors.push("$.verdict: CLEAN requires live verification");
    else if (repo && repoExists) await validateLive(bundle, report, manifest, bundlePath, repo, ports, errors);
  }
  return { errors, ok: errors.length === 0 };
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
