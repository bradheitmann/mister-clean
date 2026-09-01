import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";

import { parse as parseYaml } from "yaml";

import {
  assertDirectory,
  discoverPlanningRoots,
  git,
  planningLaneLifecycle,
} from "./repository.js";

export type SemanticProbeKind =
  | "acceptance_effect_liveness"
  | "authoritative_projection"
  | "behavioral_dimension"
  | "bounded_state_lifecycle"
  | "composition_root_reachability"
  | "construction_boundary"
  | "environment_semantics"
  | "executable_surface_coverage"
  | "execution_identity_coverage"
  | "failure_domain_independence"
  | "gate_semantic_bite"
  | "historical_evidence_portability"
  | "identifier_namespace"
  | "instruction_polarity"
  | "representation_equivalence"
  | "supersession_lineage";
export type SemanticFindingCode =
  | "acceptance_effect_liveness_failure"
  | "authoritative_projection_failure"
  | "behavioral_dimension_failure"
  | "bounded_state_lifecycle_failure"
  | "construction_boundary_failure"
  | "environment_semantics_failure"
  | "executable_surface_coverage_failure"
  | "execution_identity_coverage_failure"
  | "failure_domain_independence_failure"
  | "gate_semantic_bite_failure"
  | "historical_evidence_portability_failure"
  | "identifier_namespace_failure"
  | "instruction_polarity_failure"
  | "mechanism_unwired_at_composition_root"
  | "representation_equivalence_failure"
  | "semantic_probe_execution_error"
  | "semantic_probe_independent_attestation_required"
  | "semantic_probe_incomplete"
  | "semantic_probe_manifest_invalid"
  | "semantic_probe_operate_time_pending"
  | "semantic_probe_unassigned"
  | "semantic_probe_unexecuted"
  | "supersession_lineage_failure";

export interface SemanticEvidenceRef {
  readonly path: string;
  readonly sha256: string;
}

export interface SemanticProbeCandidate {
  readonly evidence: readonly string[];
  readonly id: string;
  readonly kind: SemanticProbeKind;
  readonly path: string;
  readonly refs: readonly string[];
}

export interface SemanticProbeFinding {
  readonly candidate_id: string;
  readonly classification: "confirmed_product_defect" | "operate_time_pending" | "verification_debt";
  readonly code: SemanticFindingCode;
  readonly detail: string;
  readonly kind: SemanticProbeKind;
  readonly refs: readonly string[];
}

export interface SemanticProbeExecution {
  readonly candidate_id: string;
  readonly command_sha256: string;
  readonly evidence_sha256: string;
  readonly executable: string;
  readonly observed_status: number | null;
  readonly receipt_sha256: string;
  readonly result: "error" | "fail" | "pass";
}

export interface SemanticProbeResolution {
  readonly candidate_id: string;
  readonly disposition: "attested_satisfied" | "deterministically_satisfied" | "not_applicable";
  readonly evidence_refs: readonly SemanticEvidenceRef[];
  readonly rationale: string;
}

export interface SemanticAuditResult {
  readonly candidate_probe_count: number;
  readonly candidate_set_sha256: string;
  readonly candidates: readonly SemanticProbeCandidate[];
  readonly confirmed_failure_count: number;
  readonly executed_probe_count: number;
  readonly executions: readonly SemanticProbeExecution[];
  readonly exitCode: 0 | 1 | 2;
  readonly findings: readonly SemanticProbeFinding[];
  readonly pending_probe_count: number;
  readonly manifest_observed_at?: string;
  readonly manifest_sha256?: string;
  readonly resolved_probe_count: number;
  readonly resolutions: readonly SemanticProbeResolution[];
  readonly snapshot: string;
  readonly working_tree_sha256: string;
  readonly status: "fail" | "not_applicable" | "pass";
  readonly trust_policy_sha256?: string;
}

export interface SemanticAuditOptions {
  readonly evidencePackagePath?: string;
  readonly execute?: boolean;
  readonly manifestPath?: string;
  readonly trustPolicyPath?: string;
}

interface ProbeDefinition {
  readonly boundary: string;
  readonly candidateId: string;
  readonly command: readonly string[];
  readonly contractRefs: readonly string[];
  readonly disposition: "execute" | "not_applicable" | "operate_time_pending";
  readonly evidenceRequired?: string;
  readonly exercisedCases: readonly string[];
  readonly expectedStatus: number;
  readonly kind: SemanticProbeKind;
  readonly notApplicableEvidence?: readonly SemanticEvidenceRef[];
  readonly notApplicableReason?: string;
  readonly nextAction?: string;
  readonly observedEndpoint: string;
  readonly owner?: string;
  readonly requiredCases: readonly string[];
  readonly timeoutMs: number;
}

interface ParsedManifest {
  readonly definitions: readonly ProbeDefinition[];
  readonly errors: readonly SemanticProbeFinding[];
  readonly observedAt?: string;
  readonly sha256: string;
}

interface ProbeReceipt {
  readonly candidateId: string;
  readonly candidateSetSha256: string;
  readonly exercisedCases: readonly string[];
  readonly failedCases: readonly string[];
  readonly passedCases: readonly string[];
  readonly result: "fail" | "pass";
  readonly subjectCommit: string;
  readonly subjectTreeSha256: string;
}

const TEXT_EXTENSIONS = new Set([".json", ".md", ".mdx", ".txt", ".yaml", ".yml"]);
const SOURCE_EXTENSIONS = new Set([".cjs", ".go", ".js", ".jsx", ".mjs", ".rs", ".ts", ".tsx"]);
const CONSTRUCTION_ASSERTION = /\b(choke point|construction[- ]enforced|(?:safe|closed|enforced) by construction)\b/i;
const CRITICAL_BOUNDARY = /\b(auth(?:entication|orization)?|credential|privacy|policy|redact|secret|security|telemetry|token)\b/i;
const COMPOSITION_ROOT = /\b(app(?:lication)? factory|composition root|production (?:bootstrap|root)|server factory)\b/i;
const ROOT_BINDING = /\b(bind(?:ing|s)?|connect|inject|mount|register|route|wire|wired|wiring)\b/i;
const DECLARED_ROUTING_DIMENSION = /(?:\btask[- ](?:class(?:es)?|specific)\b[^\n]{0,160}\b(?:cost|fitness|route|router|routing|score|weight)\b|\b(?:route|router|routing)\b[^\n]{0,160}\b(?:cost|fitness|task[- ]class(?:es)?|weight)\b)/i;
const GATE_BITE_CLAIM = /(?:\b(?:gate|validator|check)\b[^\n]{0,180}\b(?:covers?|proves?|rejects?|validates?)\b|\b(?:covers?|proves?|rejects?|validates?)\b[^\n]{0,180}\b(?:gate|validator|check)\b)/i;
const REPRESENTATION_EQUIVALENCE_CLAIM = /\b(?:handwritten[^\n]{0,80}\btwin|keep\s+in\s+sync|mirrors?[^\n]{0,100}\brenderer|typed[- ]react\s+twin)\b/i;
const FORBIDDEN_INSTRUCTION = /\b(?:do\s+not|forbidden|must\s+not|never)\b/i;
const DANGEROUS_RECIPE_FENCE = /```(?:ba)?sh[^\n]*\n[\s\S]*?\b(?:curl\b[^\n|]*\|\s*(?:ba)?sh\b|git\s+(?:commit\s+--no-verify|reset\s+--hard)|ln\s+-s\b|rm\s+-rf\b)[\s\S]*?```/i;
const ENVIRONMENT_SENTINEL = /\bMISTER_CLEAN_SENTINEL\b/u;
const AUTHORITY_IDENTIFIER = /\b[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-(?:v\d+(?:\.\d+)+|\d+(?:\.\d+)*)\b/g;
const NAMESPACE_IDENTIFIER = /\b[A-Z][A-Z0-9]{0,7}(?:-\d+(?:\.\d+)?|\d+(?:\.\d+)?)\b/g;
const AUTHORITY_STATUS = /\b(PROPOSED|APPROVED|RATIFIED)\b/gi;
const LONG_LIVED_STATE_NAME = /(cache|dedup\w*|done|history|idempot\w*|journal\w*|ledger\w*|processed|queue\w*|record\w*|run\w*|seen)/i;
const STATE_FIELD_ALLOCATION = /(?:^|[;{}]\s*|\s)(?:(?:public|private|protected|static|readonly|declare)\s+)*(#?)([A-Za-z_$][\w$]*)\s*!?\s*(?::[^=\n;]+)?=\s*new\s+(?:Map|Set)\b/i;
const MODULE_STATE_ALLOCATION = /(?:^|[;}])\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*(?:new\s+(?:Map|Set|Array)\b|\[\s*\])/i;
const STATE_APPEND = /\b(?:appendFileSync?|createWriteStream)\b/i;
const APPEND_STATE_BOUND = /\b(?:compact(?:ion)?|evict(?:ion)?|expir(?:e|y)|max(?:imum)?(?:[_ -]?(?:age|entries|size))|prun(?:e|ing)|retention|rotat(?:e|ion)|ttl)\b/i;
const QUALITY_SCRIPT_NAME = /(?:^|:)(?:build|check|lint|test|typecheck|validate|verify)(?::|$)/i;
const NON_PRODUCT_PATH = /(?:^|\/)(?:__fixtures__|__tests__|dist|fixtures?|generated|node_modules|test|tests|vendor)(?:\/|$)/i;
const TOOL_CONFIG_SOURCE = /(?:^|\/)(?:eslint|jest|rollup|tsup|vite|vitest|webpack)\.config\.[^.]+$/i;
const IDENTITY_REFERENCE_FIELDS = ["agent_identity_ref", "execution_identity_ref", "identity_lease_id"] as const;
const EXECUTION_IDENTITY_FIELDS = [
  "control_surface",
  "inference_provider",
  "inference_backend",
  "model_id",
  "model_version",
  "reasoning_level",
  "harness_id",
  "harness_version",
  "permission_mode",
] as const;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) return undefined;
  return [...new Set(value.map((item) => String(item).trim()))].sort();
}

function argv(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) return undefined;
  return value.map((item) => String(item).trim());
}

function evidenceRefs(value: unknown): SemanticEvidenceRef[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const refs: SemanticEvidenceRef[] = [];
  for (const raw of value) {
    const ref = object(raw);
    if (!ref || typeof ref.path !== "string" || !ref.path.trim()
      || isAbsolute(ref.path) || ref.path === ".." || ref.path.startsWith("../")
      || typeof ref.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(ref.sha256)) return undefined;
    refs.push({ path: ref.path.trim().replaceAll("\\", "/"), sha256: ref.sha256 });
  }
  return refs.sort((left, right) => left.path.localeCompare(right.path) || left.sha256.localeCompare(right.sha256));
}

function isoTimestamp(value: unknown): boolean {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeClaim(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("und");
}

function regexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function frontmatter(content: string): string | undefined {
  const opening = /^---[ \t]*$/mu.exec(content);
  if (!opening) return undefined;
  const prefix = content.slice(0, opening.index).replaceAll(/<!--[\s\S]*?-->/gu, "").trim();
  if (prefix) return undefined;
  const bodyStart = opening.index + opening[0].length;
  const remainder = content.slice(bodyStart).replace(/^\r?\n/u, "");
  const closing = /^(?:---|\.\.\.)[ \t]*$/mu.exec(remainder);
  return closing ? remainder.slice(0, closing.index).replace(/\r?\n$/u, "") : undefined;
}

function planningRecord(path: string, content: string): Record<string, unknown> | undefined {
  try {
    const extension = extname(path).toLocaleLowerCase("und");
    if (extension === ".json") return object(JSON.parse(content));
    if (extension === ".yaml" || extension === ".yml") return object(parseYaml(content));
    if (extension === ".md" || extension === ".mdx") {
      const metadata = frontmatter(content);
      return metadata ? object(parseYaml(metadata)) : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function nonemptyIdentityValue(value: unknown): boolean {
  return typeof value === "string"
    && value.trim().length > 0
    && !new Set(["n/a", "none", "null", "unknown", "unrecorded"]).has(value.trim().toLocaleLowerCase("und"));
}

function validIdentityReference(root: string, value: unknown): boolean {
  const ref = object(value);
  if (!ref || typeof ref.path !== "string" || !ref.path.trim() || isAbsolute(ref.path)
    || ref.path === ".." || ref.path.startsWith("../")
    || typeof ref.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(ref.sha256)) return false;
  const target = resolve(root, ref.path);
  const relation = relative(root, target);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)
    || !existsSync(target) || !lstatSync(target).isFile() || lstatSync(target).isSymbolicLink()) return false;
  return createHash("sha256").update(readFileSync(target)).digest("hex") === ref.sha256;
}

function recordRole(record: Record<string, unknown>): "dev" | "qa" | undefined {
  for (const field of ["artifact_type", "role", "slice_type", "task_type", "work_type"] as const) {
    const value = record[field];
    if (typeof value !== "string") continue;
    const normalized = value.trim().toLocaleLowerCase("und");
    if (normalized === "dev" || normalized === "qa") return normalized;
  }
  return undefined;
}

function currentPlanningLifecycle(path: string): boolean {
  return path.split("/").some((segment) => {
    const lifecycle = planningLaneLifecycle(segment);
    return lifecycle === "active" || lifecycle === "preexecution";
  });
}

function historicalPlanningLifecycle(path: string): boolean {
  return path.split("/").some((segment) => {
    const lifecycle = planningLaneLifecycle(segment);
    return lifecycle === "archived" || lifecycle === "done";
  });
}

function missingExecutionIdentityFields(root: string, path: string, content: string): readonly string[] | undefined {
  if (!currentPlanningLifecycle(path) || historicalPlanningLifecycle(path)) return undefined;
  const record = planningRecord(path, content);
  if (!record || !recordRole(record)) return undefined;
  const validReference = IDENTITY_REFERENCE_FIELDS.some((field) => validIdentityReference(root, record[field]));
  if (validReference) return [];
  const errors: string[] = [];
  const presentReference = IDENTITY_REFERENCE_FIELDS.find((field) => Object.hasOwn(record, field));
  if (presentReference) errors.push(`invalid ${presentReference}`);
  for (const field of EXECUTION_IDENTITY_FIELDS) {
    if (!Object.hasOwn(record, field)) errors.push(`missing ${field}`);
    else if (!nonemptyIdentityValue(record[field])) errors.push(`blank ${field}`);
  }
  return errors;
}

function unboundedStateFields(path: string, content: string): Array<{ readonly line: number; readonly text: string }> {
  const results: Array<{ line: number; text: string }> = [];
  const lines = content.split(/\r?\n/);
  let braceDepth = 0;
  for (const [index, line] of lines.entries()) {
    const lineStartDepth = braceDepth;
    braceDepth += (line.match(/{/g)?.length ?? 0) - (line.match(/}/g)?.length ?? 0);
    const moduleAllocation = lineStartDepth === 0 ? MODULE_STATE_ALLOCATION.exec(line) : undefined;
    const classAllocation = /\b(?:const|let|var)\b/u.test(line) ? undefined : STATE_FIELD_ALLOCATION.exec(line);
    const field = classAllocation?.[2] ?? moduleAllocation?.[1];
    if (!field) continue;
    const sigil = classAllocation?.[1] === "#" ? "#" : "";
    const escaped = regexLiteral(field);
    if (!LONG_LIVED_STATE_NAME.test(`${field}\n${path}`)) continue;
    const access = sigil === "#" ? `(?:this\\.)?#${escaped}` : `(?:this\\.)?${escaped}`;
    const mutation = new RegExp(`${access}\\.(?:add|push|set|unshift)\\s*\\(`);
    if (!mutation.test(content)) continue;
    const insertionArguments = [...content.matchAll(new RegExp(`${access}\\.(?:add|set)\\s*\\(\\s*([^,\\)]+)`, "g"))]
      .map((match) => String(match[1] ?? "").trim()).filter(Boolean);
    const removalArguments = [...content.matchAll(new RegExp(`${access}\\.delete\\s*\\(\\s*([^\\)]+)`, "g"))]
      .map((match) => String(match[1] ?? "").trim()).filter(Boolean);
    const balancedKeyLifecycle = insertionArguments.length > 0
      && insertionArguments.every((argument) => removalArguments.includes(argument));
    const boundedArray = new RegExp(`${access}\\.length\\s*>?=\\s*\\d+[\\s\\S]{0,160}${access}\\.(?:shift|splice)\\s*\\(`).test(content)
      || new RegExp(`${access}\\.(?:shift|splice)\\s*\\([\\s\\S]{0,160}${access}\\.length\\s*-\\s*\\d+`).test(content);
    const explicitBound = new RegExp(
      `(?:max(?:imum)?(?:[_ -]?(?:age|entries|size))|retention|ttl)[\\s\\S]{0,200}${access}|${access}[\\s\\S]{0,200}(?:max(?:imum)?(?:[_ -]?(?:age|entries|size))|retention|ttl)`,
      "i",
    ).test(content);
    if (balancedKeyLifecycle || boundedArray || explicitBound) continue;
    results.push({ line: index + 1, text: line.trim() });
  }
  return results;
}

function executableSurfaceGaps(root: string, paths: readonly string[]): Array<{
  readonly evidence: string;
  readonly refs: readonly string[];
}> {
  const packagePaths = paths.filter((path) => basename(path) === "package.json" && !NON_PRODUCT_PATH.test(path));
  const packageDirectories = packagePaths
    .map((path) => dirname(path) === "." ? "." : dirname(path).split(sep).join("/"))
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
  const parsed = new Map<string, Record<string, unknown>>();
  for (const packagePath of packagePaths) {
    try {
      const value: unknown = JSON.parse(readFileSync(resolve(root, packagePath), "utf8"));
      if (value && typeof value === "object" && !Array.isArray(value)) parsed.set(packagePath, value as Record<string, unknown>);
    } catch {
      // Invalid manifests are handled by native-gate discovery.
    }
  }
  const nearestPackage = (sourcePath: string): string | undefined => packageDirectories.find((directory) => (
    directory === "." || sourcePath.startsWith(`${directory}/`)
  ));
  const qualityScripts: Array<{ command: string; directory: string; name: string }> = [];
  for (const [packagePath, manifest] of parsed) {
    const value = manifest.scripts;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const directory = dirname(packagePath) === "." ? "." : dirname(packagePath).split(sep).join("/");
    for (const [name, command] of Object.entries(value)) {
      if (typeof command !== "string" || !QUALITY_SCRIPT_NAME.test(name)) continue;
      const normalized = command.trim().replace(/\s+/gu, " ").toLocaleLowerCase("und");
      if (!normalized || /^(?:true|:|exit 0|echo(?:\s+.*)?)$/u.test(normalized)) continue;
      qualityScripts.push({ command, directory, name });
    }
  }
  const reachable = new Set<string>();
  for (const script of qualityScripts) {
    const origin = script.directory === "." ? "" : `${script.directory}/`;
    for (const path of paths) {
      const local = origin && path.startsWith(origin) ? path.slice(origin.length) : path;
      if (script.command.includes(path) || (origin && script.command.includes(local))) reachable.add(path);
    }
    for (const match of script.command.matchAll(/(?:^|\s)(?:\.\/)?((?:tests?|src|packages?)\/[^\s'";&|]*)/gu)) {
      const token = String(match[1] ?? "");
      const wildcard = token.search(/[*!?{\[]/u);
      const prefix = (wildcard >= 0 ? token.slice(0, wildcard) : token).replace(/\/+$/u, "");
      const rooted = `${origin}${prefix}`.replace(/^\.\//u, "");
      for (const path of paths) if (path === rooted || path.startsWith(`${rooted}/`)) reachable.add(path);
    }
  }
  const sourcePathSet = new Set(paths);
  const queue = [...reachable];
  while (queue.length > 0) {
    const importer = queue.shift()!;
    if (!SOURCE_EXTENSIONS.has(extname(importer).toLocaleLowerCase("und"))) continue;
    let content = "";
    try {
      content = readFileSync(resolve(root, importer), "utf8");
    } catch {
      continue;
    }
    for (const match of content.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/gu)) {
      const specifier = String(match[1] ?? "");
      if (!specifier.startsWith(".")) continue;
      const base = relative(root, resolve(root, dirname(importer), specifier)).split(sep).join("/");
      const resolvedCandidates = [
        base,
        ...[...SOURCE_EXTENSIONS].map((extension) => `${base}${extension}`),
        ...[...SOURCE_EXTENSIONS].map((extension) => `${base}/index${extension}`),
      ];
      for (const candidate of resolvedCandidates) {
        if (!sourcePathSet.has(candidate) || reachable.has(candidate)) continue;
        reachable.add(candidate);
        queue.push(candidate);
      }
    }
  }
  const gaps: Array<{ evidence: string; refs: readonly string[] }> = [];
  for (const packagePath of packagePaths) {
    const manifest = parsed.get(packagePath);
    if (!manifest) continue;
    const directory = dirname(packagePath) === "." ? "." : dirname(packagePath).split(sep).join("/");
    const sources = paths.filter((sourcePath) => (
      SOURCE_EXTENSIONS.has(extname(sourcePath).toLocaleLowerCase("und"))
      && !NON_PRODUCT_PATH.test(sourcePath)
      && !TOOL_CONFIG_SOURCE.test(sourcePath)
      && nearestPackage(sourcePath) === directory
    ));
    const declaredEntrypoint = [manifest.bin, manifest.exports, manifest.main, manifest.module]
      .some((value) => value !== undefined && value !== null);
    if (!declaredEntrypoint && sources.length === 0) continue;
    const uncovered = sources.filter((source) => !reachable.has(source));
    if (uncovered.length === 0) continue;
    gaps.push({
      evidence: `${directory}: ${uncovered.length}/${sources.length} production executable source files have no proven reachable quality gate`,
      refs: [packagePath, ...uncovered].sort(),
    });
  }
  return gaps;
}

function candidateId(kind: SemanticProbeKind, path: string, claim: string): string {
  const prefix = {
    acceptance_effect_liveness: "EFFECT",
    authoritative_projection: "AUTHORITY",
    behavioral_dimension: "BEHAVIOR",
    bounded_state_lifecycle: "STATE",
    composition_root_reachability: "COMPOSITION",
    construction_boundary: "CONSTRUCTION",
    environment_semantics: "ENVIRONMENT",
    executable_surface_coverage: "EXECUTABLE",
    execution_identity_coverage: "IDENTITY",
    failure_domain_independence: "FAILURE-DOMAIN",
    gate_semantic_bite: "GATE-BITE",
    historical_evidence_portability: "PORTABILITY",
    identifier_namespace: "NAMESPACE",
    instruction_polarity: "POLARITY",
    representation_equivalence: "EQUIVALENCE",
    supersession_lineage: "SUPERSESSION",
  }[kind];
  return `SEM-${prefix}-${sha256(`${kind}\0${path}\0${normalizeClaim(claim)}`).slice(0, 12).toUpperCase()}`;
}

export function semanticCandidateSetSha256(candidates: readonly SemanticProbeCandidate[]): string {
  return sha256(JSON.stringify(candidates.map((candidate) => ({
    evidence: candidate.evidence.map(normalizeClaim).sort(),
    id: candidate.id,
    kind: candidate.kind,
    path: candidate.path,
    refs: [...candidate.refs].sort(),
  }))));
}

function repositoryObjectPaths(repository: string): string[] {
  const root = resolve(repository);
  const listed = spawnSync("git", ["--no-optional-locks", "-C", root, "ls-files", "-co", "--exclude-standard", "-z"], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (listed.error) throw listed.error;
  if (listed.status !== 0) throw new Error(String(listed.stderr || "git ls-files failed"));
  return String(listed.stdout).split("\0").filter(Boolean).sort();
}

function semanticWorkingTreeSha256FromPaths(repository: string, paths: readonly string[], excludedPath?: string): string {
  const root = resolve(repository);
  const excluded = excludedPath ? resolve(excludedPath) : undefined;
  const hash = createHash("sha256");
  for (const portablePath of paths) {
    const absolute = resolve(root, portablePath);
    if (excluded && absolute === excluded) continue;
    hash.update(`${portablePath.length}:`);
    hash.update(portablePath);
    if (!existsSync(absolute)) {
      hash.update("\0missing\0");
      continue;
    }
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      hash.update("\0symlink\0");
      hash.update(readlinkSync(absolute));
    } else if (stat.isFile()) {
      hash.update("\0file\0");
      hash.update(readFileSync(absolute));
    } else {
      hash.update("\0other\0");
    }
  }
  return hash.digest("hex");
}

export function semanticWorkingTreeSha256(repository: string, excludedPath?: string): string {
  const root = resolve(repository);
  return semanticWorkingTreeSha256FromPaths(root, repositoryObjectPaths(root), excludedPath);
}

function visibleLines(content: string): Array<{ readonly line: number; readonly text: string }> {
  const result: Array<{ line: number; text: string }> = [];
  let fence: { character: string; length: number } | undefined;
  let inComment = false;
  for (const [index, raw] of content.split(/\r?\n/).entries()) {
    let text = raw;
    if (inComment) {
      const end = text.indexOf("-->");
      if (end < 0) continue;
      inComment = false;
      text = text.slice(end + 3);
    }
    while (text.includes("<!--")) {
      const start = text.indexOf("<!--");
      const end = text.indexOf("-->", start + 4);
      if (end < 0) {
        text = text.slice(0, start);
        inComment = true;
        break;
      }
      text = `${text.slice(0, start)}${text.slice(end + 3)}`;
    }
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(text)?.[1];
    if (marker) {
      const character = marker[0] ?? "";
      if (!fence) fence = { character, length: marker.length };
      else if (character === fence.character && marker.length >= fence.length) fence = undefined;
      continue;
    }
    if (!fence && text.trim()) result.push({ line: index + 1, text: text.trim() });
  }
  return result;
}

function authorityStatuses(text: string): Array<{ readonly identifier: string; readonly status: "proposed" | "ratified" }> {
  const identifiers = [...text.matchAll(AUTHORITY_IDENTIFIER)]
    .map((match) => ({ identifier: String(match[0]), index: match.index ?? 0 }));
  if (identifiers.length === 0) return [];
  const results: Array<{ identifier: string; status: "proposed" | "ratified" }> = [];
  for (const match of text.matchAll(AUTHORITY_STATUS)) {
    const statusIndex = match.index ?? 0;
    const prefix = text.slice(Math.max(0, statusIndex - 32), statusIndex).toLocaleLowerCase("und");
    if (/\b(?:is|was|were)?\s*(?:not|never|isn't|wasn't|weren't|without)\s+(?:yet\s+)?$/u.test(prefix)) continue;
    const distances = identifiers.map((item) => ({ ...item, distance: Math.abs(item.index - statusIndex) }));
    const nearest = Math.min(...distances.map((item) => item.distance));
    for (const item of distances.filter((candidate) => candidate.distance <= 80 && candidate.distance <= nearest + 20)) {
      results.push({
        identifier: item.identifier,
        status: String(match[0]).toLocaleUpperCase("und") === "PROPOSED" ? "proposed" : "ratified",
      });
    }
  }
  return results;
}

function nestedEntries(value: unknown, prefix = ""): Array<{ readonly key: string; readonly value: unknown }> {
  if (Array.isArray(value)) return value.flatMap((entry, index) => nestedEntries(entry, `${prefix}[${index}]`));
  const record = object(value);
  if (!record) return [];
  const result: Array<{ key: string; value: unknown }> = [];
  for (const [key, entry] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key;
    result.push({ key: path, value: entry });
    result.push(...nestedEntries(entry, path));
  }
  return result;
}

function nestedObjects(value: unknown): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const visit = (entry: unknown): void => {
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    const record = object(entry);
    if (!record) return;
    result.push(record);
    Object.values(record).forEach(visit);
  };
  visit(value);
  return result;
}

function terminalStructuredRecord(record: Record<string, unknown>): boolean {
  return nestedEntries(record).some(({ key, value }) => (
    /(?:^|\.)(?:result|status|verdict)$/iu.test(key)
    && typeof value === "string"
    && /^(?:accepted|complete|completed|done|pass|passed)$/iu.test(value.trim())
  ));
}

function structuredRecordId(record: Record<string, unknown>): string | undefined {
  for (const key of ["review_id", "holdout_id", "slice_id", "story_id", "epic_id", "artifact_id", "id"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function ignoredByRepository(root: string, portablePath: string): boolean {
  if (isAbsolute(portablePath) || portablePath === ".." || portablePath.startsWith("../")) return false;
  const result = spawnSync("git", ["--no-optional-locks", "-C", root, "check-ignore", "-q", "--", portablePath], {
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: "ignore",
  });
  return result.status === 0;
}

function commonFailureDomain(record: Record<string, unknown>): string | undefined {
  const fallbacks = record.fallbacks;
  if (record.resilience_claim !== true || !Array.isArray(fallbacks) || fallbacks.length < 2) return undefined;
  const domains = fallbacks.map((entry: unknown) => object(entry)).filter((entry): entry is Record<string, unknown> => !!entry)
    .map((entry) => ["provider", "gateway", "account", "credential", "region", "runtime"]
      .map((field) => typeof entry[field] === "string" ? `${field}=${String(entry[field]).trim()}` : "")
      .filter(Boolean).join("|"));
  if (domains.length < 2) return undefined;
  const sharedFields = ["provider", "gateway", "account", "credential", "region", "runtime"].filter((field) => {
    const values = fallbacks.map((entry: unknown) => object(entry)?.[field]).filter((value: unknown) => typeof value === "string" && value.trim());
    return values.length === fallbacks.length && new Set(values.map((value: unknown) => String(value).trim())).size === 1;
  });
  return sharedFields.length > 0 ? sharedFields.join(", ") : undefined;
}

function environmentSemanticHazards(content: string): string[] {
  if (!/^#!.*\b(?:ba|z|k)?sh\b/mu.test(content) && !/\bset\s+-e(?:u|o|\s|$)/mu.test(content)) return [];
  const hazards: string[] = [];
  if (/^\s*grep(?:\s+--?[\w-]+)*\s+[^\s|;&]+\s*$/mu.test(content)) hazards.push("search command can wait on stdin or omit an explicit search surface");
  const globRisk = content.split(/\r?\n/).some((line) => (
    /\b(?:for\s+\w+\s+in\s+|(?:cat|cp|ls|rm|test)\s+)/u.test(line)
    && /[*?\[]/u.test(line.replaceAll("$?", ""))
  ));
  if (globRisk && !/\b(?:nullglob|failglob)\b/u.test(content)) hazards.push("unmatched glob semantics are not declared");
  if (hazards.length > 0 && !ENVIRONMENT_SENTINEL.test(content)) hazards.push("final completion sentinel is absent");
  return hazards;
}

export function discoverSemanticProbeCandidates(
  repository: string,
  boundRepositoryPaths?: readonly string[],
): SemanticProbeCandidate[] {
  const root = resolve(repository);
  assertDirectory(root);
  const repositoryPaths = boundRepositoryPaths ? [...boundRepositoryPaths].sort() : repositoryObjectPaths(root);
  const repositoryPathSet = new Set(repositoryPaths);
  const groups = new Map<string, { claim: string; evidence: string[]; kind: SemanticProbeKind; path: string; refs: string[] }>();
  const authorityClaims = new Map<string, {
    proposed: Array<{ readonly path: string; readonly line: number; readonly text: string }>;
    ratified: Array<{ readonly path: string; readonly line: number; readonly text: string }>;
  }>();
  const identifierSpellings = new Map<string, Map<string, string[]>>();
  const authorityDefinitions = new Map<string, Map<string, string[]>>();
  const missingExecutionIdentity: Array<{ readonly path: string; readonly fields: readonly string[] }> = [];
  const structuredIds = new Map<string, string[]>();
  const supersessionEdges: Array<{ readonly from: string; readonly path: string; readonly to: string }> = [];
  const add = (kind: SemanticProbeKind, path: string, line: number, text: string): void => {
    const claim = normalizeClaim(text);
    const key = `${kind}\0${path}\0${claim}`;
    const group = groups.get(key) ?? { claim, evidence: [], kind, path, refs: [] };
    group.refs.push(`${path}#line-${line}`);
    group.evidence.push(text.slice(0, 240));
    groups.set(key, group);
  };
  const planningRoots = discoverPlanningRoots(root);
  const planningPaths = repositoryPaths.filter((path) => (
    TEXT_EXTENSIONS.has(extname(path).toLocaleLowerCase("und"))
    && planningRoots.some((planningRoot) => path === planningRoot || path.startsWith(`${planningRoot}/`))
  ));
  for (const path of planningPaths) {
      const absolute = resolve(root, path);
      if (!repositoryPathSet.has(path)) continue;
      const stat = lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      let content: string;
      try {
        content = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(absolute));
      } catch {
        continue;
      }
      if (content.includes("\0")) continue;
      const missing = missingExecutionIdentityFields(root, path, content);
      if (missing && missing.length > 0) missingExecutionIdentity.push({ fields: missing, path });
      const structured = planningRecord(path, content);
      const definition = object(structured?.authority_definition);
      if (definition && nonemptyIdentityValue(definition.namespace) && nonemptyIdentityValue(definition.id)) {
        const shortId = String(definition.id).trim();
        const qualified = `${String(definition.namespace).trim()}::${shortId}`;
        const definitions = authorityDefinitions.get(shortId) ?? new Map<string, string[]>();
        const refs = definitions.get(qualified) ?? [];
        refs.push(`${path}#authority_definition`);
        definitions.set(qualified, refs);
        authorityDefinitions.set(shortId, definitions);
      }
      for (const item of visibleLines(content)) {
        if (CONSTRUCTION_ASSERTION.test(item.text) && CRITICAL_BOUNDARY.test(item.text)) {
          add("construction_boundary", path, item.line, item.text);
        }
        if (COMPOSITION_ROOT.test(item.text) && ROOT_BINDING.test(item.text) && CRITICAL_BOUNDARY.test(item.text)) {
          add("composition_root_reachability", path, item.line, item.text);
        }
        if (DECLARED_ROUTING_DIMENSION.test(item.text)) {
          const key = "behavioral_dimension\0behavioral-dimension/task-routing\0task routing declares class-specific fitness or cost behavior";
          const group = groups.get(key) ?? {
            claim: "task routing declares class-specific fitness or cost behavior",
            evidence: [],
            kind: "behavioral_dimension" as const,
            path: "behavioral-dimension/task-routing",
            refs: [],
          };
          group.refs.push(`${path}#line-${item.line}`);
          group.evidence.push(item.text.slice(0, 240));
          groups.set(key, group);
        }
        if (!historicalPlanningLifecycle(path)) {
          for (const { identifier, status } of authorityStatuses(item.text)) {
            const record = authorityClaims.get(identifier) ?? { proposed: [], ratified: [] };
            record[status].push({ line: item.line, path, text: item.text });
            authorityClaims.set(identifier, record);
          }
          for (const match of item.text.matchAll(NAMESPACE_IDENTIFIER)) {
            const spelling = String(match[0]);
            const normalized = spelling.replace(/[^A-Z0-9]/g, "");
            const spellings = identifierSpellings.get(normalized) ?? new Map<string, string[]>();
            const refs = spellings.get(spelling) ?? [];
            refs.push(`${path}#line-${item.line}`);
            spellings.set(spelling, refs);
            identifierSpellings.set(normalized, spellings);
          }
        }
      }
  }
  for (const path of repositoryPaths) {
    const extension = extname(path).toLocaleLowerCase("und");
    if (!TEXT_EXTENSIONS.has(extension) && !SOURCE_EXTENSIONS.has(extension) && extension !== ".sh") continue;
    const absolute = resolve(root, path);
    let content = "";
    try {
      const stat = lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_048_576) continue;
      content = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(absolute));
    } catch {
      continue;
    }
    if (content.includes("\0")) continue;
    const lines = visibleLines(content);
    for (const item of lines) {
      if (GATE_BITE_CLAIM.test(item.text)) add("gate_semantic_bite", path, item.line, item.text);
      if (planningRoots.some((planningRoot) => path === planningRoot || path.startsWith(`${planningRoot}/`))) {
        if (CONSTRUCTION_ASSERTION.test(item.text) && CRITICAL_BOUNDARY.test(item.text)) {
          add("construction_boundary", path, item.line, item.text);
        }
      }
    }
    if (SOURCE_EXTENSIONS.has(extension) && REPRESENTATION_EQUIVALENCE_CLAIM.test(content)
      && !/\bmirror_contract_ref\b/u.test(content)) {
      const line = content.split(/\r?\n/).findIndex((item) => REPRESENTATION_EQUIVALENCE_CLAIM.test(item));
      add("representation_equivalence", path, Math.max(1, line + 1), "declared handwritten mirror/twin has no bound canonical equivalence contract");
    }
    if ((extension === ".md" || extension === ".mdx") && FORBIDDEN_INSTRUCTION.test(content)
      && DANGEROUS_RECIPE_FENCE.test(content)) {
      const structured = planningRecord(path, content);
      const polarity = typeof structured?.instruction_polarity === "string"
        ? structured.instruction_polarity.trim().toLocaleLowerCase("und")
        : "";
      if (!new Set(["allowed_recipe", "fixture", "forbidden_counterexample", "historical_nonexecutive"]).has(polarity)) {
        const line = content.split(/\r?\n/).findIndex((item) => FORBIDDEN_INSTRUCTION.test(item));
        add("instruction_polarity", path, Math.max(1, line + 1), "executable-looking forbidden recipe lacks machine-readable instruction polarity");
      }
    }
    if (extension === ".sh" || /^#!.*\b(?:ba|z|k)?sh\b/mu.test(content)) {
      const hazards = environmentSemanticHazards(content);
      if (hazards.length > 0) add("environment_semantics", path, 1, hazards.join("; "));
    }
    const structured = planningRecord(path, content);
    if (!structured) continue;
    const identifier = structuredRecordId(structured);
    if (identifier) {
      const refs = structuredIds.get(identifier) ?? [];
      refs.push(path);
      structuredIds.set(identifier, refs);
      if (typeof structured.superseded_by === "string" && structured.superseded_by.trim()) {
        supersessionEdges.push({ from: identifier, path, to: structured.superseded_by.trim() });
      }
    }
    if (terminalStructuredRecord(structured)) {
      const ignoredEvidence = nestedEntries(structured)
        .filter(({ key, value }) => /(?:^|\.)(?:evidence|evidence_ref|evidence_path|proof|proof_ref|receipt|receipt_ref)$/iu.test(key)
          && typeof value === "string" && ignoredByRepository(root, value.trim()))
        .map(({ value }) => String(value).trim());
      if (ignoredEvidence.length > 0) {
        add("historical_evidence_portability", path, 1, `terminal authority depends on ignored evidence: ${[...new Set(ignoredEvidence)].sort().join(", ")}`);
      }
      const entries = nestedEntries(structured);
      const effect = entries.find(({ key, value }) => /(?:^|\.)effect_kind$/iu.test(key) && typeof value === "string")?.value;
      const proof = entries.find(({ key, value }) => /(?:^|\.)proof_kind$/iu.test(key) && typeof value === "string")?.value;
      if (typeof effect === "string" && /^(?:external|live|live_external|operate_time)$/iu.test(effect.trim())
        && typeof proof === "string" && !/^(?:live|operate_time|runtime)$/iu.test(proof.trim())) {
        add("acceptance_effect_liveness", path, 1, `live effect ${effect.trim()} is terminalized by non-live proof kind ${proof.trim()}`);
      }
    }
    for (const candidate of nestedObjects(structured)) {
      const shared = commonFailureDomain(candidate);
      if (shared) add("failure_domain_independence", path, 1, `declared fallbacks share failure-domain fields: ${shared}`);
    }
  }
  for (const edge of supersessionEdges) {
    if (!structuredIds.has(edge.to)) {
      add("supersession_lineage", edge.path, 1, `${edge.from} supersedes to missing authority ${edge.to}`);
      continue;
    }
    const visited = new Set<string>([edge.from]);
    let cursor = edge.to;
    while (cursor) {
      if (visited.has(cursor)) {
        add("supersession_lineage", edge.path, 1, `supersession lineage for ${edge.from} contains a cycle at ${cursor}`);
        break;
      }
      visited.add(cursor);
      cursor = supersessionEdges.find((item) => item.from === cursor)?.to ?? "";
    }
  }
  if (missingExecutionIdentity.length > 0) {
    const path = "execution-identity/current-dev-qa";
    const claim = "every current or future DEV/QA record binds an externally verified execution identity";
    const key = `execution_identity_coverage\0${path}\0${normalizeClaim(claim)}`;
    groups.set(key, {
      claim: normalizeClaim(claim),
      evidence: missingExecutionIdentity.map((item) => `${item.path}: missing ${item.fields.join(", ")}`).sort(),
      kind: "execution_identity_coverage",
      path,
      refs: missingExecutionIdentity.map((item) => item.path).sort(),
    });
  }
  for (const [identifier, claims] of authorityClaims) {
    if (claims.proposed.length === 0 || claims.ratified.length === 0) continue;
    const evidence = [...claims.proposed, ...claims.ratified]
      .sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line);
    const path = `authority-projection/${identifier}`;
    const claim = `${identifier} appears as both PROPOSED and RATIFIED/APPROVED on current planning surfaces`;
    const key = `authoritative_projection\0${path}\0${normalizeClaim(claim)}`;
    groups.set(key, {
      claim: normalizeClaim(claim),
      evidence: [...new Set(evidence.map((item) => item.text.slice(0, 240)))].sort(),
      kind: "authoritative_projection",
      path,
      refs: [...new Set(evidence.map((item) => `${item.path}#line-${item.line}`))].sort(),
    });
  }
  const namespaceCollisions = [...identifierSpellings.entries()]
    .filter(([, spellings]) => spellings.size > 1)
    .sort(([left], [right]) => left.localeCompare(right));
  for (const [normalized, spellings] of namespaceCollisions) {
    const path = `identifier-namespace/${normalized}`;
    const claim = `${normalized} has punctuation-insensitive namespace variants`;
    const key = `identifier_namespace\0${path}\0${normalizeClaim(claim)}`;
    groups.set(key, {
      claim: normalizeClaim(claim),
      evidence: [`${normalized}: ${[...spellings.keys()].sort().join(" | ")}`],
      kind: "identifier_namespace",
      path,
      refs: [...new Set([...spellings.values()].flatMap((refs) => refs.slice(0, 2)))].sort(),
    });
  }
  for (const [shortId, definitions] of [...authorityDefinitions.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (definitions.size < 2) continue;
    const path = `identifier-namespace/${shortId}`;
    const claim = `${shortId} is defined by multiple authority namespaces`;
    const key = `identifier_namespace\0${path}\0${normalizeClaim(claim)}`;
    groups.set(key, {
      claim: normalizeClaim(claim),
      evidence: [`${shortId}: ${[...definitions.keys()].sort().join(" | ")}`],
      kind: "identifier_namespace",
      path,
      refs: [...new Set([...definitions.values()].flat())].sort(),
    });
  }

  const surfaceGaps = executableSurfaceGaps(root, repositoryPaths);
  if (surfaceGaps.length > 0) {
    const path = "executable-surface/source-to-gate";
    const claim = "every production executable package must be proven reachable from a canonical quality gate";
    const key = `executable_surface_coverage\0${path}\0${normalizeClaim(claim)}`;
    groups.set(key, {
      claim: normalizeClaim(claim),
      evidence: surfaceGaps.map((gap) => gap.evidence).sort(),
      kind: "executable_surface_coverage",
      path,
      refs: [...new Set(surfaceGaps.flatMap((gap) => gap.refs))].sort(),
    });
  }
  for (const path of repositoryPaths) {
    if (!SOURCE_EXTENSIONS.has(extname(path).toLocaleLowerCase("und"))
      || /(?:^|\/)(?:__fixtures__|__tests__|dist|fixtures?|generated|node_modules|test|tests|vendor)(?:\/|$)/i.test(path)
      || /\.(?:spec|test)\.[^.]+$/i.test(path)) continue;
    const absolute = resolve(root, path);
    let content = "";
    try {
      const stat = lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_048_576) continue;
      content = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(absolute));
    } catch {
      continue;
    }
    const persistentFields = unboundedStateFields(path, content);
    const appendOnlyStore = STATE_APPEND.test(content) && LONG_LIVED_STATE_NAME.test(`${path}\n${content}`);
    for (const field of persistentFields) add("bounded_state_lifecycle", path, field.line, field.text);
    if (appendOnlyStore && !APPEND_STATE_BOUND.test(content)) {
      const lines = content.split(/\r?\n/);
      const index = lines.findIndex((line) => STATE_APPEND.test(line));
      if (index >= 0) add("bounded_state_lifecycle", path, index + 1, (lines[index] ?? "").trim());
    }
  }
  return [...groups.values()].map((group) => ({
    evidence: [...new Set(group.evidence)].sort(),
    id: candidateId(group.kind, group.path, group.claim),
    kind: group.kind,
    path: group.path,
    refs: [...new Set(group.refs)].sort(),
  })).sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind));
}

function invalidFinding(detail: string, refs: readonly string[] = []): SemanticProbeFinding {
  return {
    candidate_id: "manifest",
    classification: "verification_debt",
    code: "semantic_probe_manifest_invalid",
    detail,
    kind: "construction_boundary",
    refs,
  };
}

function parseManifest(
  manifestPath: string,
  manifestRef: string,
  repository: string,
  expectedCommit: string,
  expectedTreeSha256: string,
  expectedCandidateSetSha256: string,
): ParsedManifest {
  let content = "";
  let raw: unknown;
  try {
    content = readFileSync(manifestPath, "utf8");
    raw = JSON.parse(content);
  } catch (error) {
    return {
      definitions: [],
      errors: [invalidFinding(`cannot read semantic probe manifest: ${error instanceof Error ? error.message : String(error)}`, [manifestRef])],
      sha256: sha256(content),
    };
  }
  const manifest = object(raw);
  if (!manifest) return { definitions: [], errors: [invalidFinding("semantic probe manifest root must be an object", [manifestRef])], sha256: sha256(content) };
  const errors: SemanticProbeFinding[] = [];
  if (manifest.record_type !== "mister-clean.semantic-probes") errors.push(invalidFinding("record_type must be mister-clean.semantic-probes", [manifestRef]));
  if (manifest.schema_version !== "1.1") errors.push(invalidFinding("schema_version must be 1.1", [manifestRef]));
  if (manifest.subject_commit !== expectedCommit) errors.push(invalidFinding(`subject_commit must equal current HEAD ${expectedCommit}`, [manifestRef]));
  if (manifest.subject_tree_sha256 !== expectedTreeSha256) errors.push(invalidFinding("subject_tree_sha256 must equal the current non-ignored working-tree snapshot", [manifestRef]));
  if (manifest.candidate_set_sha256 !== expectedCandidateSetSha256) errors.push(invalidFinding("candidate_set_sha256 must equal the complete discovered semantic candidate set", [manifestRef]));
  if (!isoTimestamp(manifest.observed_at)) errors.push(invalidFinding("observed_at must be a timezone-aware ISO timestamp", [manifestRef]));
  if (!Array.isArray(manifest.probes)) {
    errors.push(invalidFinding("probes must be an array", [manifestRef]));
    return { definitions: [], errors, ...(isoTimestamp(manifest.observed_at) ? { observedAt: String(manifest.observed_at) } : {}), sha256: sha256(content) };
  }
  const definitions: ProbeDefinition[] = [];
  const seen = new Set<string>();
  for (const [index, rawProbe] of manifest.probes.entries()) {
    const path = `${manifestRef}#probes[${index}]`;
    const probe = object(rawProbe);
    if (!probe) {
      errors.push(invalidFinding("probe must be an object", [path]));
      continue;
    }
    const candidate = typeof probe.candidate_id === "string" ? probe.candidate_id.trim() : "";
    const kind = new Set<SemanticProbeKind>([
      "acceptance_effect_liveness",
      "authoritative_projection",
      "behavioral_dimension",
      "bounded_state_lifecycle",
      "composition_root_reachability",
      "construction_boundary",
      "environment_semantics",
      "executable_surface_coverage",
      "execution_identity_coverage",
      "failure_domain_independence",
      "gate_semantic_bite",
      "historical_evidence_portability",
      "identifier_namespace",
      "instruction_polarity",
      "representation_equivalence",
      "supersession_lineage",
    ]).has(probe.kind as SemanticProbeKind)
      ? probe.kind as SemanticProbeKind
      : undefined;
    const contractRefs = strings(probe.contract_refs);
    const requiredCases = strings(probe.required_cases);
    const exercisedCases = strings(probe.exercised_cases);
    const disposition = probe.disposition === "operate_time_pending" || probe.disposition === "execute" || probe.disposition === "not_applicable"
      ? probe.disposition
      : undefined;
    const command = argv(probe.command);
    const timeout = probe.timeout_ms;
    const expectedStatus = probe.expected_status;
    const boundary = typeof probe.boundary === "string" ? probe.boundary.trim() : "";
    const endpoint = typeof probe.observed_endpoint === "string" ? probe.observed_endpoint.trim() : "";
    const localErrors: string[] = [];
    if (!candidate) localErrors.push("candidate_id is required");
    else if (seen.has(candidate)) localErrors.push(`duplicate candidate_id ${candidate}`);
    if (!kind) localErrors.push("kind must be one of the registered Mister Clean semantic candidate kinds");
    if (!contractRefs?.length) localErrors.push("contract_refs must be a nonempty string array");
    if (disposition !== "not_applicable" && !requiredCases?.length) localErrors.push("required_cases must be a nonempty string array");
    if (disposition !== "not_applicable" && !exercisedCases) localErrors.push("exercised_cases must be a string array");
    if (!disposition) localErrors.push("disposition must explicitly be execute, operate_time_pending, or not_applicable");
    if (!boundary) localErrors.push("boundary is required");
    if (!endpoint) localErrors.push("observed_endpoint is required");
    if (disposition === "execute") {
      if (!command?.length) localErrors.push("command must be a nonempty argv array");
      if (!Number.isInteger(timeout) || Number(timeout) < 100 || Number(timeout) > 30_000) localErrors.push("timeout_ms must be an integer from 100 through 30000");
      if (expectedStatus !== 0) localErrors.push("expected_status must be 0; the probe harness must translate correct behavior to success");
    }
    const owner = typeof probe.owner === "string" ? probe.owner.trim() : "";
    const nextAction = typeof probe.required_next_action === "string" ? probe.required_next_action.trim() : "";
    const evidenceRequired = typeof probe.evidence_required === "string" ? probe.evidence_required.trim() : "";
    const notApplicableReason = typeof probe.not_applicable_reason === "string" ? probe.not_applicable_reason.trim() : "";
    const notApplicableEvidence = evidenceRefs(probe.not_applicable_evidence);
    if (disposition === "operate_time_pending" && (!owner || !nextAction || !evidenceRequired)) {
      localErrors.push("operate_time_pending requires owner, required_next_action, and evidence_required");
    }
    if (disposition === "not_applicable" && (!notApplicableReason || !notApplicableEvidence?.length)) {
      localErrors.push("not_applicable requires not_applicable_reason and nonempty portable digest-bound not_applicable_evidence");
    } else if (disposition === "not_applicable" && notApplicableEvidence) {
      for (const ref of notApplicableEvidence) {
        const evidencePath = resolve(repository, ref.path);
        const relation = relative(repository, evidencePath);
        if (relation === ".." || relation.startsWith(`..${sep}`) || !existsSync(evidencePath) || !lstatSync(evidencePath).isFile()) {
          localErrors.push(`not_applicable_evidence path is missing or outside the repository: ${ref.path}`);
          continue;
        }
        if (createHash("sha256").update(readFileSync(evidencePath)).digest("hex") !== ref.sha256) {
          localErrors.push(`not_applicable_evidence digest mismatch: ${ref.path}`);
        }
      }
    }
    if (localErrors.length > 0 || !kind || !contractRefs || !disposition) {
      errors.push(invalidFinding(localErrors.join("; "), [path]));
      continue;
    }
    seen.add(candidate);
    definitions.push({
      boundary,
      candidateId: candidate,
      command: disposition === "execute" ? command ?? [] : [],
      contractRefs,
      disposition,
      ...(evidenceRequired ? { evidenceRequired } : {}),
      exercisedCases: exercisedCases ?? [],
      expectedStatus: disposition === "execute" ? Number(expectedStatus) : 0,
      kind,
      ...(notApplicableEvidence?.length ? { notApplicableEvidence } : {}),
      ...(notApplicableReason ? { notApplicableReason } : {}),
      ...(nextAction ? { nextAction } : {}),
      observedEndpoint: endpoint,
      ...(owner ? { owner } : {}),
      requiredCases: requiredCases ?? [],
      timeoutMs: disposition === "execute" ? Number(timeout) : 0,
    });
  }
  return {
    definitions,
    errors,
    ...(isoTimestamp(manifest.observed_at) ? { observedAt: String(manifest.observed_at) } : {}),
    sha256: sha256(content),
  };
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}

function parseProbeReceipt(
  stdout: string,
  definition: ProbeDefinition,
  candidate: SemanticProbeCandidate,
  subjectCommit: string,
  subjectTreeSha256: string,
  candidateSetSha256: string,
): { readonly error?: string; readonly receipt?: ProbeReceipt; readonly receiptSha256: string } {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const receiptRows: Array<{ raw: string; value: Record<string, unknown> }> = [];
  for (const line of lines) {
    try {
      const value = object(JSON.parse(line));
      if (value?.record_type === "mister-clean.semantic-probe-receipt") receiptRows.push({ raw: line, value });
    } catch {
      // Human-readable runner output may surround the one canonical receipt line.
    }
  }
  if (receiptRows.length !== 1) {
    return { error: `probe stdout must contain exactly one single-line mister-clean.semantic-probe-receipt; found ${receiptRows.length}`, receiptSha256: sha256(stdout) };
  }
  const row = receiptRows[0]!;
  const receipt = row.value;
  const exercisedCases = strings(receipt.exercised_cases);
  const passedCases = strings(receipt.passed_cases) ?? [];
  const failedCases = strings(receipt.failed_cases) ?? [];
  const result = receipt.result === "pass" || receipt.result === "fail" ? receipt.result : undefined;
  const errors: string[] = [];
  if (receipt.schema_version !== "1.0") errors.push("schema_version must be 1.0");
  if (receipt.candidate_id !== candidate.id) errors.push("candidate_id does not match the executing candidate");
  if (receipt.subject_commit !== subjectCommit) errors.push("subject_commit does not match current HEAD");
  if (receipt.subject_tree_sha256 !== subjectTreeSha256) errors.push("subject_tree_sha256 does not match the bound working tree");
  if (receipt.candidate_set_sha256 !== candidateSetSha256) errors.push("candidate_set_sha256 does not match the complete discovered set");
  if (!exercisedCases || !sameStringSet(exercisedCases, definition.requiredCases)) errors.push("exercised_cases must exactly equal required_cases");
  if (!sameStringSet([...passedCases, ...failedCases], definition.requiredCases)
    || passedCases.some((item) => failedCases.includes(item))) {
    errors.push("passed_cases and failed_cases must be a disjoint exact partition of required_cases");
  }
  if (!result) errors.push("result must be pass or fail");
  if (result === "pass" && (failedCases.length > 0 || !sameStringSet(passedCases, definition.requiredCases))) {
    errors.push("pass requires every required case in passed_cases and zero failed_cases");
  }
  if (result === "fail" && failedCases.length === 0) errors.push("fail requires at least one failed case");
  if (errors.length > 0 || !result || !exercisedCases) {
    return { error: errors.join("; "), receiptSha256: sha256(row.raw) };
  }
  return {
    receipt: {
      candidateId: candidate.id,
      candidateSetSha256,
      exercisedCases,
      failedCases,
      passedCases,
      result,
      subjectCommit,
      subjectTreeSha256,
    },
    receiptSha256: sha256(row.raw),
  };
}

export function auditSemanticRepository(
  repository: string,
  options: SemanticAuditOptions = {},
): SemanticAuditResult {
  const root = resolve(repository);
  assertDirectory(root);
  const snapshot = git(root, "rev-parse", "HEAD");
  const manifestPath = options.manifestPath ? resolve(root, options.manifestPath) : undefined;
  const manifestRelation = manifestPath ? relative(root, manifestPath) : "";
  const manifestRef = manifestPath
    ? (manifestRelation !== ".." && !manifestRelation.startsWith(`..${sep}`) && !isAbsolute(manifestRelation)
      ? manifestRelation.split(sep).join("/")
      : `external-semantic-manifest/${basename(manifestPath)}`)
    : undefined;
  const boundRepositoryPaths = repositoryObjectPaths(root);
  const workingTreeSha256 = semanticWorkingTreeSha256FromPaths(root, boundRepositoryPaths, manifestPath);
  const candidates = discoverSemanticProbeCandidates(root, boundRepositoryPaths);
  const candidateSetSha256 = semanticCandidateSetSha256(candidates);
  const postDiscoverySha256 = semanticWorkingTreeSha256(root, manifestPath);
  if (postDiscoverySha256 !== workingTreeSha256) {
    const finding: SemanticProbeFinding = {
      candidate_id: "repository-object",
      classification: "verification_debt",
      code: "semantic_probe_execution_error",
      detail: "repository object changed during semantic discovery; recapture a quiescent subject before assigning or executing probes",
      kind: "construction_boundary",
      refs: [],
    };
    return {
      candidate_probe_count: candidates.length,
      candidate_set_sha256: candidateSetSha256,
      candidates,
      confirmed_failure_count: 0,
      executed_probe_count: 0,
      executions: [],
      exitCode: 1,
      findings: [finding],
      pending_probe_count: 0,
      resolved_probe_count: 0,
      resolutions: [],
      snapshot,
      status: "fail",
      working_tree_sha256: workingTreeSha256,
    };
  }
  const findings: SemanticProbeFinding[] = [];
  const executions: SemanticProbeExecution[] = [];
  const resolutions: SemanticProbeResolution[] = [];
  let manifestSha256: string | undefined;
  let manifestObservedAt: string | undefined;
  if (!manifestPath || !manifestRef) {
    for (const candidate of candidates) {
      findings.push({
        candidate_id: candidate.id,
        classification: "verification_debt",
        code: "semantic_probe_unassigned",
        detail: "critical contract candidate has no bound construction or composition-root probe",
        kind: candidate.kind,
        refs: candidate.refs,
      });
    }
  } else {
    const parsed = parseManifest(
      manifestPath,
      manifestRef,
      root,
      snapshot,
      workingTreeSha256,
      candidateSetSha256,
    );
    manifestSha256 = parsed.sha256;
    manifestObservedAt = parsed.observedAt;
    const candidateIds = new Set(candidates.map((candidate) => candidate.id));
    const bindingErrors: string[] = [];
    if (parsed.errors.length > 0) {
      bindingErrors.push(...parsed.errors.map((error) => error.detail));
    } else {
      const definitions = new Map(parsed.definitions.map((definition) => [definition.candidateId, definition]));
      for (const definition of parsed.definitions) {
        if (!candidateIds.has(definition.candidateId)) bindingErrors.push(`probe ${definition.candidateId} does not match the bound candidate set`);
      }
      for (const candidate of candidates) {
        const definition = definitions.get(candidate.id);
        if (!definition) bindingErrors.push(`candidate ${candidate.id} is absent from the manifest`);
        else if (definition.kind !== candidate.kind || !candidate.refs.every((ref) => definition.contractRefs.includes(ref))) {
          bindingErrors.push(`candidate ${candidate.id} has incomplete kind or contract_refs coverage`);
        }
      }
    }
    if (bindingErrors.length > 0) {
      findings.push(invalidFinding(
        `semantic probe manifest requires one repair: ${[...new Set(bindingErrors)].sort().join(" | ")}`,
        [manifestRef],
      ));
    } else {
      const byCandidate = new Map(parsed.definitions.map((definition) => [definition.candidateId, definition]));
      for (const candidate of candidates) {
        const definition = byCandidate.get(candidate.id)!;
        if (definition.disposition === "not_applicable") {
          resolutions.push({
            candidate_id: candidate.id,
            disposition: "not_applicable",
            evidence_refs: definition.notApplicableEvidence ?? [],
            rationale: definition.notApplicableReason ?? "",
          });
          findings.push({
            candidate_id: candidate.id,
            classification: "verification_debt",
            code: "semantic_probe_independent_attestation_required",
            detail: "legacy repository-authored not_applicable evidence cannot clear a semantic obligation without an external independent v2 attestation",
            kind: candidate.kind,
            refs: candidate.refs,
          });
          continue;
        }
        const missingCases = definition.requiredCases.filter((item) => !definition.exercisedCases.includes(item));
        if (missingCases.length > 0) {
          findings.push({
            candidate_id: candidate.id,
            classification: "verification_debt",
            code: "semantic_probe_incomplete",
            detail: `probe omits required cases: ${missingCases.join(", ")}`,
            kind: candidate.kind,
            refs: candidate.refs,
          });
          continue;
        }
        if (definition.disposition === "operate_time_pending") {
          findings.push({
            candidate_id: candidate.id,
            classification: "operate_time_pending",
            code: "semantic_probe_operate_time_pending",
            detail: `${definition.nextAction}; owner=${definition.owner}; evidence=${definition.evidenceRequired}`,
            kind: candidate.kind,
            refs: candidate.refs,
          });
          continue;
        }
        if (!options.execute) {
          findings.push({
            candidate_id: candidate.id,
            classification: "verification_debt",
            code: "semantic_probe_unexecuted",
            detail: "probe is defined but was not executed; rerun with --execute under CLOSE authority",
            kind: candidate.kind,
            refs: candidate.refs,
          });
          continue;
        }
        const [command, ...args] = definition.command;
        if (!command) continue;
        const result = spawnSync(command, args, {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            MISTER_CLEAN_CANDIDATE_ID: candidate.id,
            MISTER_CLEAN_CANDIDATE_SET_SHA256: candidateSetSha256,
            MISTER_CLEAN_REQUIRED_CASES_JSON: JSON.stringify(definition.requiredCases),
            MISTER_CLEAN_SUBJECT_COMMIT: snapshot,
            MISTER_CLEAN_SUBJECT_TREE_SHA256: workingTreeSha256,
          },
          stdio: ["ignore", "pipe", "pipe"],
          timeout: definition.timeoutMs,
        });
        const stdout = String(result.stdout ?? "");
        const evidence = `${stdout}\n${result.stderr ?? ""}`;
        if (result.error || result.status === null) {
          findings.push({
            candidate_id: candidate.id,
            classification: "verification_debt",
            code: "semantic_probe_execution_error",
            detail: result.error?.message ?? `probe ended without an exit status${result.signal ? ` (${result.signal})` : ""}`,
            kind: candidate.kind,
            refs: candidate.refs,
          });
          continue;
        }
        const receiptResult = parseProbeReceipt(
          stdout,
          definition,
          candidate,
          snapshot,
          workingTreeSha256,
          candidateSetSha256,
        );
        const changedTree = semanticWorkingTreeSha256(root, manifestPath) !== workingTreeSha256;
        const statusMismatch = receiptResult.receipt
          ? (receiptResult.receipt.result === "pass" ? result.status !== 0 : result.status === 0)
          : false;
        const executionResult = receiptResult.error || changedTree || statusMismatch
          ? "error"
          : receiptResult.receipt!.result;
        executions.push({
          candidate_id: candidate.id,
          command_sha256: sha256(JSON.stringify(definition.command)),
          evidence_sha256: sha256(evidence),
          executable: basename(command),
          observed_status: result.status,
          receipt_sha256: receiptResult.receiptSha256,
          result: executionResult,
        });
        if (executionResult === "error") {
          const detail = receiptResult.error
            ?? (changedTree ? "probe mutated the bound working tree" : "probe receipt result and process exit status disagree");
          findings.push({
            candidate_id: candidate.id,
            classification: "verification_debt",
            code: "semantic_probe_execution_error",
            detail,
            kind: candidate.kind,
            refs: candidate.refs,
          });
          continue;
        }
        if (executionResult === "fail") {
          findings.push({
            candidate_id: candidate.id,
            classification: "confirmed_product_defect",
            code: ({
              acceptance_effect_liveness: "acceptance_effect_liveness_failure",
              authoritative_projection: "authoritative_projection_failure",
              behavioral_dimension: "behavioral_dimension_failure",
              bounded_state_lifecycle: "bounded_state_lifecycle_failure",
              composition_root_reachability: "mechanism_unwired_at_composition_root",
              construction_boundary: "construction_boundary_failure",
              environment_semantics: "environment_semantics_failure",
              executable_surface_coverage: "executable_surface_coverage_failure",
              execution_identity_coverage: "execution_identity_coverage_failure",
              failure_domain_independence: "failure_domain_independence_failure",
              gate_semantic_bite: "gate_semantic_bite_failure",
              historical_evidence_portability: "historical_evidence_portability_failure",
              identifier_namespace: "identifier_namespace_failure",
              instruction_polarity: "instruction_polarity_failure",
              representation_equivalence: "representation_equivalence_failure",
              supersession_lineage: "supersession_lineage_failure",
            } satisfies Record<SemanticProbeKind, SemanticFindingCode>)[candidate.kind],
            detail: `${definition.boundary} -> ${definition.observedEndpoint} failed cases: ${receiptResult.receipt!.failedCases.join(", ")}`,
            kind: candidate.kind,
            refs: candidate.refs,
          });
        } else {
          findings.push({
            candidate_id: candidate.id,
            classification: "verification_debt",
            code: "semantic_probe_independent_attestation_required",
            detail: "legacy runner-authored PASS is retained as an observation but cannot adjudicate its own semantic obligation; obtain an external independent v2 attestation",
            kind: candidate.kind,
            refs: candidate.refs,
          });
        }
      }
    }
  }
  const status = candidates.length === 0 && findings.length === 0
    ? "not_applicable"
    : findings.length > 0
      ? "fail"
      : "pass";
  return {
    candidate_probe_count: candidates.length,
    candidate_set_sha256: candidateSetSha256,
    candidates,
    confirmed_failure_count: findings.filter((finding) => finding.classification === "confirmed_product_defect").length,
    executed_probe_count: executions.length,
    executions,
    exitCode: status === "fail" ? 1 : 0,
    findings,
    ...(manifestObservedAt ? { manifest_observed_at: manifestObservedAt } : {}),
    ...(manifestSha256 ? { manifest_sha256: manifestSha256 } : {}),
    pending_probe_count: findings.filter((finding) => finding.classification === "operate_time_pending").length,
    resolved_probe_count: resolutions.length,
    resolutions,
    snapshot,
    status,
    working_tree_sha256: workingTreeSha256,
  };
}
