import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { basename, extname, relative, resolve } from "node:path";
import * as posix from "node:path/posix";
import { fileURLToPath } from "node:url";

import * as ts from "typescript";

import {
  captureRepositoryObjectSurface,
  type RepositoryObject,
  type RepositoryObjectSurfaceEntry,
} from "../closeout/repository-object.js";

/**
 * Schema 1.0 reports remain valid historical observations.  Version 1.1 adds
 * analyzer identity, generated-distribution accounting, and truthful import
 * resolution classes; it deliberately retains every 1.0 measurement field.
 */
export const LEGACY_COMPLEXITY_SCHEMA = "mister-clean.codebase-complexity/1.0" as const;
export const COMPLEXITY_SCHEMA = "mister-clean.codebase-complexity/1.1" as const;
export const LEGACY_REPOSITORY_OBJECT_COMPLEXITY_SCHEMA =
  "mister-clean.codebase-complexity.repository-object/1.0" as const;
export const REPOSITORY_OBJECT_COMPLEXITY_SCHEMA =
  "mister-clean.codebase-complexity.repository-object/1.1" as const;

const ANALYZER_ID = "mister-clean.codebase-complexity";
const CLASSIFIER_ID = "mister-clean.codebase-complexity.classifier";
const CLASSIFIER_VERSION = "1.1";
const ANALYZER_SOURCE_SHA256 = createHash("sha256")
  .update(readFileSync(fileURLToPath(import.meta.url)))
  .digest("hex");

export const SURFACE_CATEGORIES = [
  "production_code",
  "tests",
  "public_docs",
  "planning_protocol_docs",
  "generated",
  "config_tooling",
  "evidence_research",
  "dependencies_assets",
] as const;

export type SurfaceCategory = (typeof SURFACE_CATEGORIES)[number];

export const IGNORED_CLASSES = [
  "dependencies",
  "build_cache",
  "local_evidence",
  "other",
] as const;

export type IgnoredClass = (typeof IGNORED_CLASSES)[number];

export const DEPENDENCY_ASSET_CLASSES = ["vendored_dependencies", "design_assets"] as const;
export type DependencyAssetClass = (typeof DEPENDENCY_ASSET_CLASSES)[number];

export interface SurfaceTotals {
  readonly files: number;
  readonly bytes: number;
  readonly physical_lines: number;
  readonly text_files: number;
  readonly binary_files: number;
  readonly symlinks: number;
}

export interface RatioMeasurement {
  readonly numerator: SurfaceTotals;
  readonly denominator: SurfaceTotals;
  readonly bytes: number | null;
  readonly physical_lines: number | null;
  readonly files: number | null;
}

export interface Distribution {
  readonly count: number;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly max: number | null;
}

export interface LanguageSummary extends SurfaceTotals {
  readonly language: string;
  readonly structural_support: "typescript_compiler" | "unsupported";
}

export interface FunctionHotspot {
  readonly path: string;
  readonly name: string;
  readonly start_line: number;
  readonly physical_lines: number;
  readonly cyclomatic: number;
  readonly hotspot_score: number;
}

export interface AnalyzerIdentity {
  readonly analyzer_id: typeof ANALYZER_ID;
  readonly analyzer_source_sha256: string;
  readonly classifier_id: typeof CLASSIFIER_ID;
  readonly classifier_version: typeof CLASSIFIER_VERSION;
  readonly typescript_version: string;
}

export interface UnresolvedImport {
  readonly importer: string;
  readonly specifier: string;
}

export interface PresentUnsupportedRelativeImport extends UnresolvedImport {
  readonly target: string;
  readonly target_language: string | null;
}

export interface DeclaredGeneratedBoundaryRelativeImport extends UnresolvedImport {
  readonly candidate_paths: readonly string[];
}

export interface StructuralMetrics {
  readonly scope:
    | "tracked production_code TypeScript/JavaScript"
    | "RepositoryObject production_code TypeScript/JavaScript";
  readonly supported_files: number;
  readonly unsupported_languages: readonly LanguageSummary[];
  readonly functions: number;
  readonly function_physical_lines: Distribution;
  readonly cyclomatic_complexity: Distribution;
  readonly import_occurrences: number;
  readonly internal_import_occurrences: number;
  readonly external_import_occurrences: number;
  /** Missing relative imports that target a TypeScript/JavaScript module. */
  readonly unresolved_relative_imports: readonly UnresolvedImport[];
  /** Present subject files outside the TypeScript/JavaScript structural graph. */
  readonly present_unsupported_relative_imports: readonly PresentUnsupportedRelativeImport[];
  /**
   * Conventional generated-module imports absent from this object. They are
   * declared boundaries, not unresolved-import debt findings.
   */
  readonly declared_generated_boundary_relative_imports:
    readonly DeclaredGeneratedBoundaryRelativeImport[];
  readonly module_nodes: number;
  readonly module_edges: number;
  readonly dependency_cycles: number;
  readonly largest_cycle_modules: number;
  readonly largest_cycle: readonly string[];
  readonly strongly_connected_cycles: readonly (readonly string[])[];
  readonly top_hotspots: readonly FunctionHotspot[];
}

export interface ComplexityPolicyThresholds {
  readonly function_physical_lines_p95_max?: number;
  readonly function_physical_lines_max?: number;
  readonly cyclomatic_p95_max?: number;
  readonly cyclomatic_max?: number;
  readonly dependency_cycles_max?: number;
  readonly largest_cycle_modules_max?: number;
  readonly committed_docs_to_production_bytes_ratio_max?: number;
  readonly tests_to_production_physical_lines_ratio_min?: number;
  readonly ignored_to_committed_bytes_ratio_max?: number;
}

export interface ComplexityPolicy {
  readonly name: string;
  readonly thresholds: ComplexityPolicyThresholds;
}

export interface PolicyEvaluation {
  readonly metric: string;
  readonly operator: "<=" | ">=";
  readonly threshold: number;
  readonly actual: number | null;
  readonly status: "pass" | "fail" | "not_applicable";
}

export interface ComplexityReport {
  readonly schema: typeof COMPLEXITY_SCHEMA;
  readonly repository: {
    readonly label: string;
    readonly ref: string;
    readonly commit: string;
  };
  readonly measurement_contract: {
    readonly analyzer: AnalyzerIdentity;
    readonly analyzer_runtime: "source_checkout_only_requires_typescript_dev_dependency";
    readonly tracked_basis: "committed Git tree";
    readonly ignored_basis: "current worktree ignored files" | "not_measured";
    readonly physical_lines: string;
    readonly percentile: "nearest-rank";
    readonly classification_version: typeof CLASSIFIER_VERSION;
    readonly category_precedence: readonly string[];
    readonly unclassified_tracked_files: 0;
  };
  readonly surfaces: {
    readonly tracked: {
      readonly total: SurfaceTotals;
      readonly categories: Readonly<Record<SurfaceCategory, SurfaceTotals>>;
      readonly dependency_asset_breakdown: Readonly<Record<DependencyAssetClass, SurfaceTotals>>;
      readonly generated_distribution_mirrors: SurfaceTotals;
    };
    readonly ignored: {
      readonly measured: boolean;
      readonly total: SurfaceTotals;
      readonly categories: Readonly<Record<SurfaceCategory, SurfaceTotals>>;
      readonly classes: Readonly<Record<IgnoredClass, SurfaceTotals>>;
      readonly dependency_asset_breakdown: Readonly<Record<DependencyAssetClass, SurfaceTotals>>;
    };
  };
  readonly ratios: {
    readonly committed_docs_to_production: RatioMeasurement;
    readonly public_docs_to_production: RatioMeasurement;
    readonly planning_protocol_docs_to_production: RatioMeasurement;
    readonly tests_to_production: RatioMeasurement;
    readonly ignored_to_committed: RatioMeasurement;
    readonly ignored_bytes_by_class: Readonly<Record<IgnoredClass, number>>;
  };
  readonly languages: readonly LanguageSummary[];
  readonly structural: StructuralMetrics;
  readonly policy: {
    readonly basis: "project_policy_not_industry_truth";
    readonly name: string | null;
    readonly evaluations: readonly PolicyEvaluation[];
  };
}

export interface MeasureCodebaseOptions {
  readonly repository: string;
  readonly ref?: string;
  readonly include_ignored?: boolean;
  readonly policy?: ComplexityPolicy;
  readonly hotspot_limit?: number;
}

export interface RepositoryObjectEntryReconciliation {
  readonly repository_object_entries: number;
  readonly tracked_entries: number;
  readonly untracked_entries: number;
  readonly measured_files: number;
  readonly regular_files: number;
  readonly symlinks: number;
  readonly missing_tracked_entries: number;
  readonly gitlinks: number;
}

export interface RepositoryObjectComplexityReport {
  readonly schema: typeof REPOSITORY_OBJECT_COMPLEXITY_SCHEMA;
  readonly repository: {
    readonly label: string;
    readonly subject_kind: "repository_object";
    readonly repository_object: RepositoryObject;
  };
  readonly measurement_contract: {
    readonly analyzer: AnalyzerIdentity;
    readonly analyzer_runtime: "source_checkout_only_requires_typescript_dev_dependency";
    readonly surface_basis: "verified tracked-plus-nonignored RepositoryObject worktree bytes";
    readonly ignored_basis: "excluded_from_repository_object";
    readonly physical_lines: string;
    readonly percentile: "nearest-rank";
    readonly classification_version: typeof CLASSIFIER_VERSION;
    readonly category_precedence: readonly string[];
    readonly unclassified_subject_entries: 0;
    readonly entry_reconciliation: RepositoryObjectEntryReconciliation;
  };
  readonly surfaces: {
    readonly subject: {
      readonly total: SurfaceTotals;
      readonly categories: Readonly<Record<SurfaceCategory, SurfaceTotals>>;
      readonly dependency_asset_breakdown: Readonly<Record<DependencyAssetClass, SurfaceTotals>>;
      readonly generated_distribution_mirrors: SurfaceTotals;
    };
  };
  readonly ratios: {
    readonly subject_docs_to_production: RatioMeasurement;
    readonly public_docs_to_production: RatioMeasurement;
    readonly planning_protocol_docs_to_production: RatioMeasurement;
    readonly tests_to_production: RatioMeasurement;
  };
  readonly languages: readonly LanguageSummary[];
  readonly structural: StructuralMetrics;
  readonly policy: {
    readonly basis: "project_policy_not_industry_truth";
    readonly name: string | null;
    readonly evaluations: readonly PolicyEvaluation[];
  };
}

export interface MeasureRepositoryObjectCodebaseOptions {
  readonly repository: string;
  readonly expected_repository_object: RepositoryObject;
  readonly policy?: ComplexityPolicy;
  readonly hotspot_limit?: number;
}

interface MeasuredFile {
  readonly path: string;
  readonly category: SurfaceCategory;
  readonly bytes: number;
  readonly physical_lines: number;
  readonly text: string | null;
  readonly binary: boolean;
  readonly symlink: boolean;
  readonly language: string | null;
  readonly generated_distribution_mirror: boolean;
}

interface TreeEntry {
  readonly mode: string;
  readonly object: string;
  readonly size: number;
  readonly path: string;
}

const ZERO_TOTALS: SurfaceTotals = Object.freeze({
  files: 0,
  bytes: 0,
  physical_lines: 0,
  text_files: 0,
  binary_files: 0,
  symlinks: 0,
});

const STRUCTURAL_EXTENSIONS = new Map<string, string>([
  [".ts", "TypeScript"],
  [".tsx", "TypeScript JSX"],
  [".mts", "TypeScript ESM"],
  [".cts", "TypeScript CJS"],
  [".js", "JavaScript"],
  [".jsx", "JavaScript JSX"],
  [".mjs", "JavaScript ESM"],
  [".cjs", "JavaScript CJS"],
]);

const OTHER_CODE_EXTENSIONS = new Map<string, string>([
  [".bash", "Shell"], [".c", "C"], [".cc", "C++"], [".cpp", "C++"],
  [".cs", "C#"], [".css", "CSS"], [".fish", "Shell"], [".go", "Go"],
  [".h", "C/C++ Header"], [".hpp", "C++ Header"], [".html", "HTML"],
  [".java", "Java"], [".kt", "Kotlin"], [".kts", "Kotlin"], [".less", "Less"],
  [".php", "PHP"], [".py", "Python"], [".rb", "Ruby"], [".rs", "Rust"],
  [".scss", "SCSS"], [".sh", "Shell"], [".sql", "SQL"], [".svelte", "Svelte"],
  [".swift", "Swift"], [".vue", "Vue"], [".zsh", "Shell"],
]);

const DOC_EXTENSIONS = new Set([".adoc", ".md", ".mdx", ".mmd", ".rst", ".txt"]);
const ASSET_EXTENSIONS = new Set([
  ".afdesign", ".avif", ".gif", ".ico", ".jpeg", ".jpg", ".otf", ".pdf",
  ".png", ".svg", ".ttf", ".webmanifest", ".webp", ".woff", ".woff2",
]);
const CONFIG_EXTENSIONS = new Set([
  ".conf", ".env", ".envrc", ".gitignore", ".gitkeep", ".ini", ".json", ".jsonc",
  ".lock", ".sha256", ".sha512", ".sum", ".toml", ".xml", ".yaml", ".yml",
]);
const GENERATED_SEGMENTS = new Set([
  ".cache", ".next", ".output", ".parcel-cache", ".turbo", ".vite", "build", "coverage",
  "dist", "generated", "out",
]);
const DEPENDENCY_SEGMENTS = new Set([
  ".pnpm", "deps", "node_modules", "third_party", "vendor",
]);
const TEST_SEGMENTS = new Set([
  "__fixtures__", "__mocks__", "__tests__", "fixtures", "spec", "specs", "test", "tests",
]);
const POLICY_THRESHOLD_KEYS = new Set<keyof ComplexityPolicyThresholds>([
  "function_physical_lines_p95_max",
  "function_physical_lines_max",
  "cyclomatic_p95_max",
  "cyclomatic_max",
  "dependency_cycles_max",
  "largest_cycle_modules_max",
  "committed_docs_to_production_bytes_ratio_max",
  "tests_to_production_physical_lines_ratio_min",
  "ignored_to_committed_bytes_ratio_max",
]);
const PHYSICAL_LINES_CONTRACT =
  "valid UTF-8 content LF count plus one final unterminated line; empty and non-UTF-8 files contribute zero";
const CATEGORY_PRECEDENCE = [
  "dependency path segments -> dependencies_assets.vendored_dependencies",
  "planning and agent-protocol paths -> planning_protocol_docs",
  "research, evidence roots, session notes, and verification docs -> evidence_research",
  "generated/cache paths and generated filenames -> generated",
  "test paths and test/spec filenames -> tests",
  "design roots and media/font extensions -> dependencies_assets.design_assets",
  "agent, CI, config, and script roots -> config_tooling",
  "documentation roots/extensions -> public_docs",
  "configuration extensions and build manifests -> config_tooling",
  "recognized source-language extensions -> production_code",
  "anything else -> fail closed",
] as const;

function analyzerIdentity(): AnalyzerIdentity {
  return {
    analyzer_id: ANALYZER_ID,
    analyzer_source_sha256: ANALYZER_SOURCE_SHA256,
    classifier_id: CLASSIFIER_ID,
    classifier_version: CLASSIFIER_VERSION,
    typescript_version: ts.version,
  };
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  const shared = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < shared; index += 1) {
    const delta = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return leftPoints.length - rightPoints.length;
}

function orderedRecord<Key extends string>(
  keys: readonly Key[],
  factory: () => SurfaceTotals = () => ZERO_TOTALS,
): Record<Key, SurfaceTotals> {
  return Object.fromEntries(keys.map((key) => [key, factory()])) as Record<Key, SurfaceTotals>;
}

function addTotals(left: SurfaceTotals, right: SurfaceTotals): SurfaceTotals {
  return {
    files: left.files + right.files,
    bytes: left.bytes + right.bytes,
    physical_lines: left.physical_lines + right.physical_lines,
    text_files: left.text_files + right.text_files,
    binary_files: left.binary_files + right.binary_files,
    symlinks: left.symlinks + right.symlinks,
  };
}

function totalsForFile(file: MeasuredFile): SurfaceTotals {
  return {
    files: 1,
    bytes: file.bytes,
    physical_lines: file.physical_lines,
    text_files: file.binary ? 0 : 1,
    binary_files: file.binary ? 1 : 0,
    symlinks: file.symlink ? 1 : 0,
  };
}

function summarize(files: readonly MeasuredFile[]): SurfaceTotals {
  return files.reduce((total, file) => addTotals(total, totalsForFile(file)), ZERO_TOTALS);
}

function summarizeByCategory(files: readonly MeasuredFile[]): Record<SurfaceCategory, SurfaceTotals> {
  const result = orderedRecord(SURFACE_CATEGORIES);
  for (const file of files) result[file.category] = addTotals(result[file.category], totalsForFile(file));
  return result;
}

function summarizeDependencyAssets(
  files: readonly MeasuredFile[],
): Record<DependencyAssetClass, SurfaceTotals> {
  const result = orderedRecord(DEPENDENCY_ASSET_CLASSES);
  for (const file of files) {
    if (file.category !== "dependencies_assets") continue;
    const segments = file.path.toLocaleLowerCase("und").split("/");
    const key: DependencyAssetClass = segments.some((segment) => DEPENDENCY_SEGMENTS.has(segment))
      ? "vendored_dependencies"
      : "design_assets";
    result[key] = addTotals(result[key], totalsForFile(file));
  }
  return result;
}

function summarizeGeneratedDistributionMirrors(files: readonly MeasuredFile[]): SurfaceTotals {
  return summarize(files.filter((file) => file.generated_distribution_mirror));
}

function ratio(numerator: SurfaceTotals, denominator: SurfaceTotals): RatioMeasurement {
  return {
    numerator,
    denominator,
    bytes: denominator.bytes === 0 ? null : numerator.bytes / denominator.bytes,
    physical_lines: denominator.physical_lines === 0
      ? null
      : numerator.physical_lines / denominator.physical_lines,
    files: denominator.files === 0 ? null : numerator.files / denominator.files,
  };
}

function unmeasuredRatio(numerator: SurfaceTotals, denominator: SurfaceTotals): RatioMeasurement {
  return { numerator, denominator, bytes: null, physical_lines: null, files: null };
}

function normalizeRepositoryPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.includes("\0")) {
    throw new Error(`Unsafe repository path: ${JSON.stringify(path)}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`Non-canonical repository path: ${JSON.stringify(path)}`);
  }
  return normalized;
}

function isTestPath(path: string, segments: readonly string[]): boolean {
  if (segments.some((segment) => TEST_SEGMENTS.has(segment.toLocaleLowerCase("und")))) return true;
  const name = basename(path).toLocaleLowerCase("und");
  return /(?:^|\.)[^/]*(?:test|spec)\.(?:[cm]?[jt]sx?|py|rs|go|sh)$/.test(name)
    || /(?:^|[-_.])test[-_.]/.test(name);
}

function isGeneratedDistributionMirror(path: string, content: Uint8Array | undefined): boolean {
  if (content === undefined) return false;
  const first = path.split("/")[0]?.toLocaleLowerCase("und");
  if (first !== "bin" && first !== "dist" && first !== "build" && first !== "out") return false;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return false;
  }
  const packageSections = text.match(/(?:^|\n)\/\/ node_modules\//gu)?.length ?? 0;
  return packageSections > 0
    && (text.includes("var __commonJS") || text.includes("var __toESM") || text.includes("var __export"));
}

function isGeneratedPath(
  path: string,
  segments: readonly string[],
  content: Uint8Array | undefined,
): boolean {
  const lowerName = basename(path).toLocaleLowerCase("und");
  return isGeneratedDistributionMirror(path, content)
    || segments.some((segment) => GENERATED_SEGMENTS.has(segment.toLocaleLowerCase("und")))
    || lowerName.includes(".generated.")
    || lowerName.endsWith(".map")
    || lowerName.endsWith(".min.js")
    || lowerName.endsWith(".min.css");
}

function languageForPath(path: string): string | null {
  const extension = extname(path).toLocaleLowerCase("und");
  return STRUCTURAL_EXTENSIONS.get(extension) ?? OTHER_CODE_EXTENSIONS.get(extension) ?? null;
}

export function classifyRepositoryPath(pathValue: string, content?: Uint8Array): SurfaceCategory {
  const path = normalizeRepositoryPath(pathValue);
  const lower = path.toLocaleLowerCase("und");
  const segments = lower.split("/");
  const first = segments[0] ?? "";
  const extension = extname(lower);
  const name = basename(lower);

  if (segments.some((segment) => DEPENDENCY_SEGMENTS.has(segment))) return "dependencies_assets";
  if (lower.startsWith(".edge-agentic/local/") || lower.startsWith(".local/")) {
    return "evidence_research";
  }
  if (lower.startsWith("project/planning/")
    || lower.startsWith(".edge-agentic/")
    || lower === ".claude/settings.json"
    || lower.startsWith(".claude/commands/")
    || lower.startsWith(".claude/skills/")
    || first === "planning"
    || first === "plans"
    || ["agents.md", "claude.md", "skill.md"].includes(name)
    || segments.some((segment) => ["epics", "stories", "slices", "dispatches", "holdout"].includes(segment))) {
    return "planning_protocol_docs";
  }
  if (first === "research" || first === "evals" || first === "benchmarks" || first === "reports"
    || first === "evidence"
    || lower.startsWith("docs/session-notes/")
    || lower.startsWith("docs/verification/")) {
    return "evidence_research";
  }
  if (isGeneratedPath(path, segments, content)) return "generated";
  if (name === ".ds_store") return "generated";
  if (isTestPath(path, segments)) return "tests";
  if (first === "design" || first === "assets" || ASSET_EXTENSIONS.has(extension)) {
    return "dependencies_assets";
  }
  if (first === ".claude" || first === ".codex" || first === ".crush" || first === ".cursor"
    || first === ".droid" || first === ".github" || first === ".pi" || first === ".zed"
    || first === "config" || first === "scripts") {
    return "config_tooling";
  }
  if (first === "docs" || first === "examples" || first === "references" || first === "templates"
    || DOC_EXTENSIONS.has(extension)
    || /^(?:contributing|license|readme|security)(?:\.|$)/.test(name)) {
    return "public_docs";
  }
  if (CONFIG_EXTENSIONS.has(extension)
    || [".envrc", ".gitignore", ".gitkeep", "dockerfile", "makefile", "version", "sshd_config"].includes(name)
    || name.startsWith("eslint.config.")
    || name.startsWith("vite.config.")
    || name.startsWith("vitest.config.")
    || name.startsWith("tsconfig.")) {
    return "config_tooling";
  }
  if (languageForPath(path) !== null) return "production_code";
  if (first === "deploy" && ["sync"].includes(name)) return "config_tooling";
  throw new Error(`Unclassifiable tracked path: ${path}`);
}

export function classifyIgnoredPath(pathValue: string): IgnoredClass {
  const path = normalizeRepositoryPath(pathValue).toLocaleLowerCase("und");
  const segments = path.split("/");
  if (segments.some((segment) => DEPENDENCY_SEGMENTS.has(segment))) return "dependencies";
  if (segments.some((segment) => GENERATED_SEGMENTS.has(segment))
    || segments.some((segment) => [".cache", ".parcel-cache", ".vite", "tmp", "temp"].includes(segment))) {
    return "build_cache";
  }
  if (segments.some((segment) => ["evidence", "research", "receipts", "traces"].includes(segment))
    || path.startsWith(".edge-agentic/local/")
    || path.startsWith(".local/")) {
    return "local_evidence";
  }
  return "other";
}

function execGit(repository: string, args: readonly string[], input?: string): Buffer {
  try {
    return execFileSync("git", ["--no-optional-locks", "-C", repository, ...args], {
      encoding: null,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      input,
      maxBuffer: 1024 * 1024 * 1024,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`git ${args.join(" ")} failed: ${detail}`, { cause: error });
  }
}

function gitText(repository: string, args: readonly string[]): string {
  return new TextDecoder().decode(execGit(repository, args)).trim();
}

function parseTree(repository: string, commit: string): TreeEntry[] {
  const output = execGit(repository, ["ls-tree", "-r", "-z", "--long", commit]);
  const records = new TextDecoder().decode(output).split("\0").filter(Boolean);
  return records.map((record) => {
    const separator = record.indexOf("\t");
    if (separator < 0) throw new Error(`Malformed git ls-tree record: ${JSON.stringify(record)}`);
    const metadata = record.slice(0, separator).split(/ +/u);
    const [mode, type, object, sizeText] = metadata;
    const path = normalizeRepositoryPath(record.slice(separator + 1));
    if (mode === undefined || type === undefined || object === undefined || sizeText === undefined) {
      throw new Error(`Incomplete git ls-tree record for ${path}`);
    }
    if (type !== "blob" || !/^\d+$/u.test(sizeText)) {
      throw new Error(`Unsupported tracked Git object ${type} at ${path}`);
    }
    return { mode, object, size: Number(sizeText), path };
  }).sort((left, right) => compareCodePoints(left.path, right.path));
}

function readBlobs(repository: string, entries: readonly TreeEntry[]): Map<string, Buffer> {
  const objects = [...new Set(entries.map((entry) => entry.object))].sort(compareCodePoints);
  if (objects.length === 0) return new Map();
  const output = execGit(repository, ["cat-file", "--batch"], `${objects.join("\n")}\n`);
  const result = new Map<string, Buffer>();
  let offset = 0;
  for (const requested of objects) {
    const newline = output.indexOf(0x0a, offset);
    if (newline < 0) throw new Error(`Truncated git cat-file header for ${requested}`);
    const header = new TextDecoder().decode(output.subarray(offset, newline));
    const [object, type, sizeText] = header.split(" ");
    if (object === undefined || type !== "blob" || sizeText === undefined || !/^\d+$/u.test(sizeText)) {
      throw new Error(`Unexpected git cat-file header: ${header}`);
    }
    const size = Number(sizeText);
    const start = newline + 1;
    const end = start + size;
    if (end >= output.length || output[end] !== 0x0a) {
      throw new Error(`Truncated git blob ${object}`);
    }
    const content = Buffer.from(output.subarray(start, end));
    if (object !== requested) throw new Error(`git cat-file returned ${object}; expected ${requested}`);
    result.set(object, content);
    offset = end + 1;
  }
  if (offset !== output.length) throw new Error("Unexpected trailing bytes from git cat-file --batch");
  return result;
}

function decodeContent(content: Buffer): { binary: boolean; text: string | null; physical_lines: number } {
  if (content.length === 0) return { binary: false, text: "", physical_lines: 0 };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return { binary: true, text: null, physical_lines: 0 };
  }
  let physicalLines = 0;
  for (const byte of content) if (byte === 0x0a) physicalLines += 1;
  if (content.at(-1) !== 0x0a) physicalLines += 1;
  return { binary: false, text, physical_lines: physicalLines };
}

function measureTracked(repository: string, commit: string): MeasuredFile[] {
  const entries = parseTree(repository, commit);
  const blobs = readBlobs(repository, entries);
  return entries.map((entry) => {
    const content = blobs.get(entry.object);
    if (content === undefined) throw new Error(`Unreadable tracked blob ${entry.object} at ${entry.path}`);
    if (content.length !== entry.size) {
      throw new Error(`Tracked blob size mismatch at ${entry.path}: tree=${entry.size}, read=${content.length}`);
    }
    const decoded = decodeContent(content);
    const category = classifyRepositoryPath(entry.path, content);
    return {
      path: entry.path,
      category,
      bytes: content.length,
      physical_lines: decoded.physical_lines,
      text: decoded.text,
      binary: decoded.binary,
      symlink: entry.mode === "120000",
      language: category === "production_code" ? languageForPath(entry.path) : null,
      generated_distribution_mirror: isGeneratedDistributionMirror(entry.path, content),
    };
  });
}

function ignoredPaths(repository: string): string[] {
  return new TextDecoder().decode(
    execGit(repository, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"]),
  )
    .split("\0")
    .filter(Boolean)
    .map(normalizeRepositoryPath)
    .sort(compareCodePoints);
}

function measureIgnored(repository: string): { files: MeasuredFile[]; classes: Record<IgnoredClass, SurfaceTotals> } {
  const root = realpathSync(repository);
  const classes = orderedRecord(IGNORED_CLASSES);
  const files = ignoredPaths(root).map((path) => {
    const absolute = resolve(root, ...path.split("/"));
    if (relative(root, absolute).startsWith("..")) throw new Error(`Ignored path escapes repository: ${path}`);
    let content: Buffer;
    let symlink = false;
    try {
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        symlink = true;
        content = Buffer.from(readlinkSync(absolute), "utf8");
      } else if (stat.isFile()) {
        content = readFileSync(absolute);
      } else {
        throw new Error(`unsupported file type`);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Unreadable ignored file ${path}: ${detail}`, { cause: error });
    }
    const decoded = decodeContent(content);
    const category = classifyRepositoryPath(path, content);
    const file: MeasuredFile = {
      path,
      category,
      bytes: content.length,
      physical_lines: decoded.physical_lines,
      text: decoded.text,
      binary: decoded.binary,
      symlink,
      language: category === "production_code" ? languageForPath(path) : null,
      generated_distribution_mirror: isGeneratedDistributionMirror(path, content),
    };
    const ignoredClass = classifyIgnoredPath(path);
    classes[ignoredClass] = addTotals(classes[ignoredClass], totalsForFile(file));
    return file;
  });
  return { files, classes };
}

interface MeasuredRepositoryObjectSurface {
  readonly files: readonly MeasuredFile[];
  readonly reconciliation: RepositoryObjectEntryReconciliation;
}

function measureRepositoryObjectSurface(
  entries: readonly RepositoryObjectSurfaceEntry[],
  repositoryObject: RepositoryObject,
): MeasuredRepositoryObjectSurface {
  let trackedEntries = 0;
  let regularFiles = 0;
  let symlinks = 0;
  let missingTrackedEntries = 0;
  let gitlinks = 0;
  const files: MeasuredFile[] = [];

  for (const entry of entries) {
    if (entry.tracked === null) {
      if (entry.kind !== "regular_file" && entry.kind !== "symlink") {
        throw new Error(`untracked repository-object entry has impossible kind ${entry.kind}: ${entry.path}`);
      }
    } else {
      trackedEntries += 1;
    }
    let category: SurfaceCategory;
    try {
      const sourceBytes = entry.kind === "regular_file"
        ? entry.bytes
        : entry.kind === "symlink" ? entry.target : undefined;
      category = classifyRepositoryPath(entry.path, sourceBytes);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unclassifiable tracked path:")) {
        throw new Error(`Unclassifiable RepositoryObject path: ${entry.path}`, { cause: error });
      }
      throw error;
    }
    if (entry.kind === "missing_tracked_entry") {
      missingTrackedEntries += 1;
      continue;
    }
    if (entry.kind === "missing_gitlink"
      || entry.kind === "uninitialized_gitlink"
      || entry.kind === "checked_out_gitlink") {
      gitlinks += 1;
      continue;
    }

    let symlink: boolean;
    let content: Buffer;
    if (entry.kind === "regular_file") {
      symlink = false;
      content = Buffer.from(entry.bytes);
    } else if (entry.kind === "symlink") {
      symlink = true;
      content = Buffer.from(entry.target);
    } else {
      throw new Error(`repository-object entry kind was not reconciled: ${entry.path}`);
    }
    const decoded = decodeContent(content);
    if (symlink) symlinks += 1;
    else regularFiles += 1;
    files.push({
      path: entry.path,
      category,
      bytes: content.length,
      physical_lines: decoded.physical_lines,
      text: decoded.text,
      binary: decoded.binary,
      symlink,
      language: category === "production_code" ? languageForPath(entry.path) : null,
      generated_distribution_mirror: isGeneratedDistributionMirror(entry.path, content),
    });
  }

  const reconciliation: RepositoryObjectEntryReconciliation = {
    repository_object_entries: entries.length,
    tracked_entries: trackedEntries,
    untracked_entries: entries.length - trackedEntries,
    measured_files: files.length,
    regular_files: regularFiles,
    symlinks,
    missing_tracked_entries: missingTrackedEntries,
    gitlinks,
  };
  const reconciledEntries = regularFiles + symlinks + missingTrackedEntries + gitlinks;
  if (entries.length !== repositoryObject.entry_count || reconciledEntries !== entries.length) {
    throw new Error([
      "repository-object complexity entry reconciliation failed",
      `object=${String(repositoryObject.entry_count)}`,
      `projection=${String(entries.length)}`,
      `classified=${String(reconciledEntries)}`,
    ].join(" "));
  }
  if (files.length !== regularFiles + symlinks) {
    throw new Error("repository-object complexity measured-file reconciliation failed");
  }
  return { files, reconciliation };
}

function validateRepositoryObject(value: unknown, label: string): asserts value is RepositoryObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}: expected RepositoryObject object`);
  }
  const record = value as Record<string, unknown>;
  const expectedKeys = ["entry_count", "head_commit", "record_type", "schema_version", "sha256", "surface"];
  const actualKeys = Object.keys(record).sort(compareCodePoints);
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`${label}: RepositoryObject fields do not match schema 1.0`);
  }
  if (record.record_type !== "mister-clean.repository-object"
    || record.schema_version !== "1.0"
    || record.surface !== "tracked_and_nonignored"
    || typeof record.head_commit !== "string"
    || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(record.head_commit)
    || !Number.isSafeInteger(record.entry_count)
    || Number(record.entry_count) < 0
    || typeof record.sha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(record.sha256)) {
    throw new Error(`${label}: invalid RepositoryObject schema 1.0 value`);
  }
}

function repositoryObjectsEqual(left: RepositoryObject, right: RepositoryObject): boolean {
  return left.record_type === right.record_type
    && left.schema_version === right.schema_version
    && left.head_commit === right.head_commit
    && left.surface === right.surface
    && left.entry_count === right.entry_count
    && left.sha256 === right.sha256;
}

function scriptKind(path: string): ts.ScriptKind {
  switch (extname(path).toLocaleLowerCase("und")) {
    case ".js": case ".mjs": case ".cjs": return ts.ScriptKind.JS;
    case ".jsx": return ts.ScriptKind.JSX;
    case ".tsx": return ts.ScriptKind.TSX;
    default: return ts.ScriptKind.TS;
  }
}

function isMeasuredFunction(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isConstructorDeclaration(node)
    || ts.isGetAccessorDeclaration(node)
    || ts.isSetAccessorDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node);
}

function hasFunctionBody(node: ts.FunctionLikeDeclaration): boolean {
  return "body" in node && node.body !== undefined;
}

function functionName(node: ts.FunctionLikeDeclaration, source: ts.SourceFile, line: number): string {
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if ("name" in node && node.name !== undefined) return node.name.getText(source);
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && parent.name !== undefined) return parent.name.getText(source);
  if (ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) return parent.name.getText(source);
  return `<anonymous@${line}>`;
}

function cyclomaticComplexity(root: ts.FunctionLikeDeclaration): number {
  let complexity = 1;
  const visit = (node: ts.Node): void => {
    if (node !== root && isMeasuredFunction(node)) return;
    if (ts.isIfStatement(node)
      || ts.isForStatement(node)
      || ts.isForInStatement(node)
      || ts.isForOfStatement(node)
      || ts.isWhileStatement(node)
      || ts.isDoStatement(node)
      || ts.isCatchClause(node)
      || ts.isConditionalExpression(node)
      || ts.isCaseClause(node)) {
      complexity += 1;
    } else if (ts.isBinaryExpression(node)
      && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]
        .includes(node.operatorToken.kind)) {
      complexity += 1;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(root, visit);
  return complexity;
}

function parseDiagnostics(source: ts.SourceFile): readonly ts.Diagnostic[] {
  return (source as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
}

function diagnosticText(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
}

function collectImportSpecifiers(source: ts.SourceFile): string[] {
  const result: string[] = [];
  const addLiteral = (node: ts.Expression | undefined): void => {
    if (node !== undefined && ts.isStringLiteralLike(node)) result.push(node.text);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addLiteral(node.moduleSpecifier);
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require")) {
        addLiteral(node.arguments[0]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

function relativeModuleCandidates(importer: string, specifier: string): string[] {
  const base = posix.normalize(posix.join(posix.dirname(importer), specifier));
  const extension = posix.extname(base).toLocaleLowerCase("und");
  const candidates = new Set<string>([base]);
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
    const stem = base.slice(0, -extension.length);
    for (const candidateExtension of STRUCTURAL_EXTENSIONS.keys()) candidates.add(`${stem}${candidateExtension}`);
  }
  if (extension === "") {
    for (const candidateExtension of STRUCTURAL_EXTENSIONS.keys()) {
      candidates.add(`${base}${candidateExtension}`);
      candidates.add(posix.join(base, `index${candidateExtension}`));
    }
  }
  return [...candidates].sort(compareCodePoints);
}

function resolveModule(importer: string, specifier: string, modules: ReadonlySet<string>): string | null {
  if (!specifier.startsWith(".")) return null;
  for (const candidate of relativeModuleCandidates(importer, specifier)) {
    if (modules.has(candidate)) return candidate;
  }
  return null;
}

function isSupportedModuleSpecifier(specifier: string): boolean {
  const extension = posix.extname(specifier).toLocaleLowerCase("und");
  return extension === "" || STRUCTURAL_EXTENSIONS.has(extension);
}

function isDeclaredGeneratedBoundarySpecifier(specifier: string): boolean {
  const segments = specifier.toLocaleLowerCase("und").split("/");
  const name = segments.at(-1) ?? "";
  return segments.includes("generated")
    || name.startsWith("generated-")
    || name.includes(".generated.");
}

function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) return { count: 0, p50: null, p95: null, max: null };
  const sorted = [...values].sort((left, right) => left - right);
  const nearestRank = (percentile: number): number => sorted[Math.ceil(percentile * sorted.length) - 1] ?? 0;
  return {
    count: sorted.length,
    p50: nearestRank(0.5),
    p95: nearestRank(0.95),
    max: sorted.at(-1) ?? null,
  };
}

function stronglyConnectedComponents(
  nodes: readonly string[],
  edges: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const visit = (node: string): void => {
    indices.set(node, nextIndex);
    lowlinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);
    const targets = [...(edges.get(node) ?? [])].sort(compareCodePoints);
    for (const target of targets) {
      if (!indices.has(target)) {
        visit(target);
        lowlinks.set(node, Math.min(lowlinks.get(node) ?? 0, lowlinks.get(target) ?? 0));
      } else if (onStack.has(target)) {
        lowlinks.set(node, Math.min(lowlinks.get(node) ?? 0, indices.get(target) ?? 0));
      }
    }
    if (lowlinks.get(node) !== indices.get(node)) return;
    const component: string[] = [];
    while (stack.length > 0) {
      const member = stack.pop();
      if (member === undefined) break;
      onStack.delete(member);
      component.push(member);
      if (member === node) break;
    }
    components.push(component.sort(compareCodePoints));
  };
  for (const node of [...nodes].sort(compareCodePoints)) if (!indices.has(node)) visit(node);
  return components;
}

function summarizeLanguages(files: readonly MeasuredFile[]): LanguageSummary[] {
  const groups = new Map<string, MeasuredFile[]>();
  for (const file of files) {
    if (file.category !== "production_code" || file.language === null) continue;
    const group = groups.get(file.language) ?? [];
    group.push(file);
    groups.set(file.language, group);
  }
  return [...groups.entries()].map(([language, group]) => ({
    language,
    structural_support: group.some((file) => STRUCTURAL_EXTENSIONS.has(extname(file.path).toLocaleLowerCase("und")))
      ? "typescript_compiler" as const
      : "unsupported" as const,
    ...summarize(group),
  })).sort((left, right) => compareCodePoints(left.language, right.language));
}

function measureStructure(
  files: readonly MeasuredFile[],
  hotspotLimit: number,
  scope: StructuralMetrics["scope"] = "tracked production_code TypeScript/JavaScript",
): StructuralMetrics {
  const supported = files.filter((file) => file.category === "production_code"
    && STRUCTURAL_EXTENSIONS.has(extname(file.path).toLocaleLowerCase("und")));
  const modules = new Set(supported.map((file) => file.path));
  const edges = new Map<string, Set<string>>([...modules].map((path) => [path, new Set()]));
  const hotspots: FunctionHotspot[] = [];
  const functionLines: number[] = [];
  const complexities: number[] = [];
  const unresolved: UnresolvedImport[] = [];
  const presentUnsupported: PresentUnsupportedRelativeImport[] = [];
  const declaredGeneratedBoundary: DeclaredGeneratedBoundaryRelativeImport[] = [];
  const subjectPaths = new Set(files.map((file) => file.path));
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  let importOccurrences = 0;
  let internalImportOccurrences = 0;
  let externalImportOccurrences = 0;

  for (const file of supported) {
    if (file.text === null) throw new Error(`Structural source is not UTF-8 text: ${file.path}`);
    const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, scriptKind(file.path));
    const diagnostics = parseDiagnostics(source);
    if (diagnostics.length > 0) {
      throw new Error(`TypeScript parser rejected ${file.path}: ${diagnosticText(diagnostics[0]!)}`);
    }
    const visit = (node: ts.Node): void => {
      if (isMeasuredFunction(node) && hasFunctionBody(node)) {
        const startLine = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const endPosition = Math.max(node.getStart(source), node.getEnd() - 1);
        const endLine = source.getLineAndCharacterOfPosition(endPosition).line + 1;
        const lines = endLine - startLine + 1;
        const cyclomatic = cyclomaticComplexity(node);
        functionLines.push(lines);
        complexities.push(cyclomatic);
        hotspots.push({
          path: file.path,
          name: functionName(node, source, startLine),
          start_line: startLine,
          physical_lines: lines,
          cyclomatic,
          hotspot_score: lines * cyclomatic,
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);

    for (const specifier of collectImportSpecifiers(source)) {
      importOccurrences += 1;
      if (!specifier.startsWith(".")) {
        externalImportOccurrences += 1;
        continue;
      }
      const target = resolveModule(file.path, specifier, modules);
      if (target === null) {
        const candidates = relativeModuleCandidates(file.path, specifier);
        const present = candidates.find((candidate) => subjectPaths.has(candidate));
        if (present !== undefined) {
          const presentFile = filesByPath.get(present);
          presentUnsupported.push({
            importer: file.path,
            specifier,
            target: present,
            target_language: presentFile === undefined ? null : languageForPath(presentFile.path),
          });
        } else if (isDeclaredGeneratedBoundarySpecifier(specifier)) {
          declaredGeneratedBoundary.push({ importer: file.path, specifier, candidate_paths: candidates });
        } else if (isSupportedModuleSpecifier(specifier)) {
          unresolved.push({ importer: file.path, specifier });
        }
      } else {
        internalImportOccurrences += 1;
        edges.get(file.path)?.add(target);
      }
    }
  }

  const components = stronglyConnectedComponents([...modules], edges);
  const cycles = components.filter((component) => component.length > 1
    || (component.length === 1 && (edges.get(component[0] ?? "")?.has(component[0] ?? "") ?? false)))
    .sort((left, right) => right.length - left.length || compareCodePoints(left.join("\0"), right.join("\0")));
  const moduleEdges = [...edges.values()].reduce((count, targets) => count + targets.size, 0);
  const orderedHotspots = hotspots.sort((left, right) => right.hotspot_score - left.hotspot_score
    || right.cyclomatic - left.cyclomatic
    || right.physical_lines - left.physical_lines
    || compareCodePoints(left.path, right.path)
    || left.start_line - right.start_line).slice(0, hotspotLimit);
  const languages = summarizeLanguages(files);

  return {
    scope,
    supported_files: supported.length,
    unsupported_languages: languages.filter((language) => language.structural_support === "unsupported"),
    functions: functionLines.length,
    function_physical_lines: distribution(functionLines),
    cyclomatic_complexity: distribution(complexities),
    import_occurrences: importOccurrences,
    internal_import_occurrences: internalImportOccurrences,
    external_import_occurrences: externalImportOccurrences,
    unresolved_relative_imports: unresolved.sort((left, right) => compareCodePoints(left.importer, right.importer)
      || compareCodePoints(left.specifier, right.specifier)),
    present_unsupported_relative_imports: presentUnsupported.sort((left, right) =>
      compareCodePoints(left.importer, right.importer)
      || compareCodePoints(left.specifier, right.specifier)
      || compareCodePoints(left.target, right.target)),
    declared_generated_boundary_relative_imports: declaredGeneratedBoundary.sort((left, right) =>
      compareCodePoints(left.importer, right.importer)
      || compareCodePoints(left.specifier, right.specifier)),
    module_nodes: modules.size,
    module_edges: moduleEdges,
    dependency_cycles: cycles.length,
    largest_cycle_modules: cycles[0]?.length ?? 0,
    largest_cycle: cycles[0] ?? [],
    strongly_connected_cycles: cycles,
    top_hotspots: orderedHotspots,
  };
}

interface PrimaryComplexityAnalysis {
  readonly total: SurfaceTotals;
  readonly categories: Record<SurfaceCategory, SurfaceTotals>;
  readonly dependency_asset_breakdown: Record<DependencyAssetClass, SurfaceTotals>;
  readonly generated_distribution_mirrors: SurfaceTotals;
  readonly ratios: {
    readonly docs_to_production: RatioMeasurement;
    readonly public_docs_to_production: RatioMeasurement;
    readonly planning_protocol_docs_to_production: RatioMeasurement;
    readonly tests_to_production: RatioMeasurement;
  };
  readonly languages: LanguageSummary[];
  readonly structural: StructuralMetrics;
}

function analyzePrimarySurface(
  files: readonly MeasuredFile[],
  hotspotLimit: number,
  scope: StructuralMetrics["scope"],
): PrimaryComplexityAnalysis {
  const categories = summarizeByCategory(files);
  const production = categories.production_code;
  const publicDocs = categories.public_docs;
  const planningDocs = categories.planning_protocol_docs;
  const tests = categories.tests;
  return {
    total: summarize(files),
    categories,
    dependency_asset_breakdown: summarizeDependencyAssets(files),
    generated_distribution_mirrors: summarizeGeneratedDistributionMirrors(files),
    ratios: {
      docs_to_production: ratio(addTotals(publicDocs, planningDocs), production),
      public_docs_to_production: ratio(publicDocs, production),
      planning_protocol_docs_to_production: ratio(planningDocs, production),
      tests_to_production: ratio(tests, production),
    },
    languages: summarizeLanguages(files),
    structural: measureStructure(files, hotspotLimit, scope),
  };
}

function policyEvaluations(
  policy: ComplexityPolicy | undefined,
  report: Pick<ComplexityReport, "ratios" | "structural">,
): PolicyEvaluation[] {
  if (policy === undefined) return [];
  const mappings: readonly [
    keyof ComplexityPolicyThresholds,
    "<=" | ">=",
    number | null,
  ][] = [
    ["function_physical_lines_p95_max", "<=", report.structural.function_physical_lines.p95],
    ["function_physical_lines_max", "<=", report.structural.function_physical_lines.max],
    ["cyclomatic_p95_max", "<=", report.structural.cyclomatic_complexity.p95],
    ["cyclomatic_max", "<=", report.structural.cyclomatic_complexity.max],
    ["dependency_cycles_max", "<=", report.structural.dependency_cycles],
    ["largest_cycle_modules_max", "<=", report.structural.largest_cycle_modules],
    ["committed_docs_to_production_bytes_ratio_max", "<=", report.ratios.committed_docs_to_production.bytes],
    ["tests_to_production_physical_lines_ratio_min", ">=", report.ratios.tests_to_production.physical_lines],
    ["ignored_to_committed_bytes_ratio_max", "<=", report.ratios.ignored_to_committed.bytes],
  ];
  return mappings.flatMap(([metric, operator, actual]) => {
    const threshold = policy.thresholds[metric];
    if (threshold === undefined) return [];
    return [{
      metric,
      operator,
      threshold,
      actual,
      status: actual === null
        ? "not_applicable" as const
        : operator === "<=" ? (actual <= threshold ? "pass" as const : "fail" as const)
          : (actual >= threshold ? "pass" as const : "fail" as const),
    }];
  });
}

function repositoryObjectPolicyEvaluations(
  policy: ComplexityPolicy | undefined,
  analysis: PrimaryComplexityAnalysis,
): PolicyEvaluation[] {
  if (policy === undefined) return [];
  if (policy.thresholds.committed_docs_to_production_bytes_ratio_max !== undefined) {
    throw new Error(
      "RepositoryObject complexity refuses committed_docs_to_production_bytes_ratio_max; the subject includes nonignored untracked files",
    );
  }
  if (policy.thresholds.ignored_to_committed_bytes_ratio_max !== undefined) {
    throw new Error(
      "RepositoryObject complexity refuses ignored_to_committed_bytes_ratio_max; ignored files are outside the RepositoryObject",
    );
  }
  const mappings: readonly [
    keyof ComplexityPolicyThresholds,
    "<=" | ">=",
    number | null,
  ][] = [
    ["function_physical_lines_p95_max", "<=", analysis.structural.function_physical_lines.p95],
    ["function_physical_lines_max", "<=", analysis.structural.function_physical_lines.max],
    ["cyclomatic_p95_max", "<=", analysis.structural.cyclomatic_complexity.p95],
    ["cyclomatic_max", "<=", analysis.structural.cyclomatic_complexity.max],
    ["dependency_cycles_max", "<=", analysis.structural.dependency_cycles],
    ["largest_cycle_modules_max", "<=", analysis.structural.largest_cycle_modules],
    ["tests_to_production_physical_lines_ratio_min", ">=", analysis.ratios.tests_to_production.physical_lines],
  ];
  return mappings.flatMap(([metric, operator, actual]) => {
    const threshold = policy.thresholds[metric];
    if (threshold === undefined) return [];
    return [{
      metric,
      operator,
      threshold,
      actual,
      status: actual === null
        ? "not_applicable" as const
        : operator === "<=" ? (actual <= threshold ? "pass" as const : "fail" as const)
          : (actual >= threshold ? "pass" as const : "fail" as const),
    }];
  });
}

function validatePolicy(policy: ComplexityPolicy | undefined): void {
  if (policy === undefined) return;
  if (typeof policy.name !== "string" || policy.name.trim() === "") {
    throw new Error("Complexity policy name must be a non-empty string");
  }
  if (!policy.thresholds || typeof policy.thresholds !== "object" || Array.isArray(policy.thresholds)) {
    throw new Error("Complexity policy thresholds must be an object");
  }
  for (const [key, value] of Object.entries(policy.thresholds)) {
    if (!POLICY_THRESHOLD_KEYS.has(key as keyof ComplexityPolicyThresholds)) {
      throw new Error(`Unknown complexity policy threshold: ${key}`);
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`Complexity policy threshold ${key} must be a finite non-negative number`);
    }
  }
}

export function measureCodebase(options: MeasureCodebaseOptions): ComplexityReport {
  const repository = realpathSync(options.repository);
  const ref = options.ref ?? "HEAD";
  const includeIgnored = options.include_ignored ?? true;
  const hotspotLimit = options.hotspot_limit ?? 20;
  if (!Number.isInteger(hotspotLimit) || hotspotLimit < 0) {
    throw new Error(`hotspot_limit must be a non-negative integer; received ${hotspotLimit}`);
  }
  validatePolicy(options.policy);
  const commit = gitText(repository, ["rev-parse", "--verify", `${ref}^{commit}`]);
  const trackedFiles = measureTracked(repository, commit);
  const analysis = analyzePrimarySurface(
    trackedFiles,
    hotspotLimit,
    "tracked production_code TypeScript/JavaScript",
  );
  const ignored = includeIgnored
    ? measureIgnored(repository)
    : { files: [] as MeasuredFile[], classes: orderedRecord(IGNORED_CLASSES) };
  const ignoredCategories = summarizeByCategory(ignored.files);
  const ignoredTotal = summarize(ignored.files);
  const ratios = {
    committed_docs_to_production: analysis.ratios.docs_to_production,
    public_docs_to_production: analysis.ratios.public_docs_to_production,
    planning_protocol_docs_to_production: analysis.ratios.planning_protocol_docs_to_production,
    tests_to_production: analysis.ratios.tests_to_production,
    ignored_to_committed: includeIgnored
      ? ratio(ignoredTotal, analysis.total)
      : unmeasuredRatio(ignoredTotal, analysis.total),
    ignored_bytes_by_class: Object.fromEntries(
      IGNORED_CLASSES.map((key) => [key, ignored.classes[key].bytes]),
    ) as Record<IgnoredClass, number>,
  };
  const partial = { ratios, structural: analysis.structural };
  const report: ComplexityReport = {
    schema: COMPLEXITY_SCHEMA,
    repository: { label: basename(repository), ref, commit },
    measurement_contract: {
      analyzer: analyzerIdentity(),
      analyzer_runtime: "source_checkout_only_requires_typescript_dev_dependency",
      tracked_basis: "committed Git tree",
      ignored_basis: includeIgnored ? "current worktree ignored files" : "not_measured",
      physical_lines: PHYSICAL_LINES_CONTRACT,
      percentile: "nearest-rank",
      classification_version: CLASSIFIER_VERSION,
      category_precedence: CATEGORY_PRECEDENCE,
      unclassified_tracked_files: 0,
    },
    surfaces: {
      tracked: {
        total: analysis.total,
        categories: analysis.categories,
        dependency_asset_breakdown: analysis.dependency_asset_breakdown,
        generated_distribution_mirrors: analysis.generated_distribution_mirrors,
      },
      ignored: {
        measured: includeIgnored,
        total: ignoredTotal,
        categories: ignoredCategories,
        classes: ignored.classes,
        dependency_asset_breakdown: summarizeDependencyAssets(ignored.files),
      },
    },
    ratios,
    languages: analysis.languages,
    structural: analysis.structural,
    policy: {
      basis: "project_policy_not_industry_truth",
      name: options.policy?.name ?? null,
      evaluations: policyEvaluations(options.policy, partial),
    },
  };
  return report;
}

export function measureRepositoryObjectCodebase(
  options: MeasureRepositoryObjectCodebaseOptions,
): RepositoryObjectComplexityReport {
  const repository = realpathSync(options.repository);
  const hotspotLimit = options.hotspot_limit ?? 20;
  if (!Number.isInteger(hotspotLimit) || hotspotLimit < 0) {
    throw new Error(`hotspot_limit must be a non-negative integer; received ${hotspotLimit}`);
  }
  validatePolicy(options.policy);
  validateRepositoryObject(options.expected_repository_object, "expected_repository_object");
  const capture = captureRepositoryObjectSurface(repository);
  if (!repositoryObjectsEqual(capture.repository_object, options.expected_repository_object)) {
    throw new Error([
      "repository_object_mismatch:",
      `expected=${options.expected_repository_object.sha256}`,
      `actual=${capture.repository_object.sha256}`,
    ].join(" "));
  }
  const measured = measureRepositoryObjectSurface(capture.entries, capture.repository_object);
  const analysis = analyzePrimarySurface(
    measured.files,
    hotspotLimit,
    "RepositoryObject production_code TypeScript/JavaScript",
  );
  const evaluations = repositoryObjectPolicyEvaluations(options.policy, analysis);
  return {
    schema: REPOSITORY_OBJECT_COMPLEXITY_SCHEMA,
    repository: {
      label: basename(repository),
      subject_kind: "repository_object",
      repository_object: capture.repository_object,
    },
    measurement_contract: {
      analyzer: analyzerIdentity(),
      analyzer_runtime: "source_checkout_only_requires_typescript_dev_dependency",
      surface_basis: "verified tracked-plus-nonignored RepositoryObject worktree bytes",
      ignored_basis: "excluded_from_repository_object",
      physical_lines: PHYSICAL_LINES_CONTRACT,
      percentile: "nearest-rank",
      classification_version: CLASSIFIER_VERSION,
      category_precedence: CATEGORY_PRECEDENCE,
      unclassified_subject_entries: 0,
      entry_reconciliation: measured.reconciliation,
    },
    surfaces: {
      subject: {
        total: analysis.total,
        categories: analysis.categories,
        dependency_asset_breakdown: analysis.dependency_asset_breakdown,
        generated_distribution_mirrors: analysis.generated_distribution_mirrors,
      },
    },
    ratios: {
      subject_docs_to_production: analysis.ratios.docs_to_production,
      public_docs_to_production: analysis.ratios.public_docs_to_production,
      planning_protocol_docs_to_production: analysis.ratios.planning_protocol_docs_to_production,
      tests_to_production: analysis.ratios.tests_to_production,
    },
    languages: analysis.languages,
    structural: analysis.structural,
    policy: {
      basis: "project_policy_not_industry_truth",
      name: options.policy?.name ?? null,
      evaluations,
    },
  };
}
