import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export interface GitResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface WorktreeRecord {
  readonly worktree: string;
  readonly head?: string;
  readonly branch?: string;
  readonly bare?: string;
  readonly detached?: string;
  readonly locked?: string;
  readonly prunable?: string;
}

export interface RecursiveEntry {
  readonly kind: "file" | "other" | "symlink";
  readonly path: string;
}

const PLANNING_DIRECTORY_NAMES = new Set([
  "planning",
  "plans",
  "roadmap",
  "project-management",
  "work-items",
  "work_items",
  "tasks",
  "stories",
  "epics",
  "slices",
  "issues",
]);

const PLANNING_FILE_STEMS = new Set([
  "backlog", "current", "milestones", "plan", "planning",
  "project-plan", "project_plan", "roadmap", "status", "tasks", "todo", "work-items", "work_items",
]);

const PLANNING_FILE_EXTENSIONS = new Set([
  ".json", ".md", ".mdx", ".txt", ".yaml", ".yml",
]);

export function isCanonicalPlanningFileName(path: string): boolean {
  const name = basename(path);
  const extension = extname(name).toLocaleLowerCase("und");
  if (!PLANNING_FILE_EXTENSIONS.has(extension)) return false;
  const stem = name.slice(0, -extension.length).toLocaleLowerCase("und");
  return PLANNING_FILE_STEMS.has(stem);
}

/**
 * Agent-harness definition subtrees, repository-relative.
 *
 * A harness ships slash commands, skills and agent definitions under fixed
 * directories, and those files are commonly named like planning inputs
 * (`.claude/commands/plan.md`). They define what an agent may do, they are not
 * a project's planning corpus, so planning-root discovery skips these subtrees
 * whether or not the host ignores them in Git. These trees carry no `.git`
 * entry, so the nested-checkout rule below does not cover them.
 */
export const HARNESS_DEFINITION_DIRECTORIES: readonly string[] = [
  ".agents/skills",
  ".claude/agents",
  ".claude/commands",
  ".claude/skills",
  ".codex",
  ".cursor",
  ".opencode",
  ".pi",
];

/** True when a repository-relative path is a harness definition file or subtree. */
export function isHarnessDefinitionPath(relativePath: string): boolean {
  const normalized = relativePath.split(sep).join("/").replace(/^\.\//u, "");
  return HARNESS_DEFINITION_DIRECTORIES.some(
    (directory) => normalized === directory || normalized.startsWith(`${directory}/`),
  );
}

/**
 * True when `directory` is a separate checkout nested inside `repository`.
 *
 * Any directory below the root that holds a `.git` entry — a file, as a linked
 * worktree or a submodule writes it, or a directory, as a clone does — is a
 * different checkout with its own `plans/`, `tasks/` and `reports/` trees. Those
 * are not this repository's planning corpus, and walking them multiplies the
 * corpus by the number of checkouts (measured on a large workspace: 13 nested
 * worktrees, 223,468 files, 2.39 B characters retained in one `audit planning`
 * run, which exhausted the heap).
 *
 * Every walker in the closeout path shares this one helper, so `audit planning`,
 * the bundle validator and the planning-candidate scan cannot disagree. The rule
 * is deliberately not a list of harness paths: a worktree an operator keeps under
 * `tmp/`, a nested clone and a submodule are all covered. The root itself is
 * always walked, even when the root is a worktree.
 */
export function isNestedCheckout(repository: string, directory: string): boolean {
  if (resolve(directory) === resolve(repository)) return false;
  return existsSync(join(directory, ".git"));
}

/** Repository-relative location of the repository-level planning config. */
export const PLANNING_CONFIG_PATH = ".mister-clean/planning.json";
export const PLANNING_CONFIG_SCHEMA = "mister-clean.planning-config/1";
const PLANNING_CONFIG_KEYS = new Set(["schema", "roots", "exclude"]);

/**
 * A validated repository-level planning config (`.mister-clean/planning.json`):
 *
 * ```json
 * { "schema": "mister-clean.planning-config/1",
 *   "roots": ["plans", "charter/DONE"],
 *   "exclude": ["reports"] }
 * ```
 *
 * - No file: the discovery heuristic runs unchanged.
 * - `roots` present (an array, possibly empty): exactly these repository-relative
 *   paths are the planning roots and the heuristic is off. `[]` declares that the
 *   repository has no planning roots. Nested declared roots reduce to the
 *   outermost one, as heuristic roots do.
 * - `exclude` (optional array of repository-relative path prefixes): discovery
 *   never walks into these paths, in heuristic and declared mode alike, and the
 *   unprojected-planning probe skips them too. A declared root inside an exclude
 *   is an error.
 * - The config file itself is never a planning root, although its name is a
 *   canonical planning file name.
 *
 * Any defect refuses with {@link PlanningConfigInvalidError}; it never falls
 * back to the heuristic. Invalid means: malformed JSON, an unknown schema, an
 * unknown key, a non-array or non-string entry, an absolute path, a `.` / `..` /
 * empty segment, a path that resolves outside the repository, a declared root
 * that does not exist or is a symbolic link, a root that is a harness-definition
 * path or lies inside a nested checkout, or a root inside an exclude.
 *
 * {@link loadPlanningConfig} is the one loader: `audit planning`, `prepare`
 * (through {@link discoverPlanningRoots}) and the bundle validator all use it.
 */
export interface PlanningConfig {
  readonly path: string;
  readonly sha256: string;
  /** Declared roots, sorted and reduced to the outermost; undefined = heuristic mode. */
  readonly roots: readonly string[] | undefined;
  readonly exclude: readonly string[];
}

/** Provenance a report records for the config that applied, or null. */
export type PlanningConfigProvenance = { readonly path: string; readonly sha256: string } | null;

/** Typed refusal for an invalid repository-level planning config. */
export class PlanningConfigInvalidError extends Error {
  readonly code = "planning_config_invalid";
  constructor(readonly path: string, readonly reason: string) {
    super(`planning_config_invalid: ${path}: ${reason}`);
    this.name = "PlanningConfigInvalidError";
  }
}

export function planningConfigProvenance(config: PlanningConfig | null): PlanningConfigProvenance {
  return config ? { path: config.path, sha256: config.sha256 } : null;
}

/** True when a repository-relative path equals an exclude prefix or lies below one. */
export function isPlanningPathExcluded(relativePath: string, exclude: readonly string[]): boolean {
  const normalized = relativePath.split(sep).join("/");
  return exclude.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function planningConfigEntries(
  record: Record<string, unknown>,
  key: "exclude" | "roots",
  invalid: (reason: string) => PlanningConfigInvalidError,
): string[] | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw invalid(`${key} must be an array of repository-relative paths`);
  return value.map((entry: unknown, index) => {
    if (typeof entry !== "string") throw invalid(`${key}[${String(index)}] must be a string`);
    const trimmed = entry.endsWith("/") ? entry.slice(0, -1) : entry;
    if (isAbsolute(entry) || entry.startsWith("/") || entry.startsWith("\\") || /^[A-Za-z]:/u.test(entry)) {
      throw invalid(`${key}[${String(index)}] ${JSON.stringify(entry)} is an absolute path`);
    }
    if (entry.includes("\\")) throw invalid(`${key}[${String(index)}] ${JSON.stringify(entry)} must use "/" separators`);
    const segments = trimmed.split("/");
    if (segments.includes("..")) throw invalid(`${key}[${String(index)}] ${JSON.stringify(entry)} has a ".." segment`);
    if (trimmed === "" || segments.some((segment) => segment === "" || segment === ".")) {
      throw invalid(`${key}[${String(index)}] ${JSON.stringify(entry)} must name a path below the repository root`);
    }
    return trimmed;
  });
}

function insideRepository(repositoryReal: string, path: string): boolean {
  const relation = relative(repositoryReal, path);
  return relation !== "" && relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

/**
 * Load and validate `.mister-clean/planning.json`. Returns null when the file is
 * absent; throws {@link PlanningConfigInvalidError} for any defect.
 */
export function loadPlanningConfig(repository: string): PlanningConfig | null {
  const root = resolve(repository);
  const configPath = join(root, PLANNING_CONFIG_PATH);
  let stat;
  try {
    stat = lstatSync(configPath);
  } catch {
    return null;
  }
  const invalid = (reason: string): PlanningConfigInvalidError => new PlanningConfigInvalidError(PLANNING_CONFIG_PATH, reason);
  if (!stat.isFile()) throw invalid("not a regular file");
  const bytes = readFileSync(configPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw invalid(`malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw invalid("expected a JSON object");
  const record = parsed as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter((key) => !PLANNING_CONFIG_KEYS.has(key)).sort();
  if (unknownKeys.length) throw invalid(`unknown key(s) ${JSON.stringify(unknownKeys)}`);
  if (record.schema !== PLANNING_CONFIG_SCHEMA) {
    throw invalid(`unknown schema ${JSON.stringify(record.schema)}; expected ${JSON.stringify(PLANNING_CONFIG_SCHEMA)}`);
  }
  const declared = planningConfigEntries(record, "roots", invalid);
  const exclude = [...new Set(planningConfigEntries(record, "exclude", invalid) ?? [])].sort(compareCodePoints);
  const repositoryReal = realpathSync(root);
  let roots: string[] | undefined;
  if (declared !== undefined) {
    for (const rootText of declared) {
      const absolute = join(root, ...rootText.split("/"));
      if (isPlanningPathExcluded(rootText, exclude)) throw invalid(`root ${JSON.stringify(rootText)} is inside an exclude`);
      if (isHarnessDefinitionPath(rootText)) throw invalid(`root ${JSON.stringify(rootText)} is a harness-definition path`);
      const segments = rootText.split("/");
      for (let depth = 1; depth <= segments.length; depth += 1) {
        const ancestor = join(root, ...segments.slice(0, depth));
        if (existsSync(ancestor) && lstatSync(ancestor).isDirectory() && isNestedCheckout(root, ancestor)) {
          throw invalid(`root ${JSON.stringify(rootText)} is inside a nested checkout`);
        }
      }
      let rootStat;
      try {
        rootStat = lstatSync(absolute);
      } catch {
        throw invalid(`root ${JSON.stringify(rootText)} does not exist`);
      }
      if (rootStat.isSymbolicLink()) throw invalid(`root ${JSON.stringify(rootText)} is a symbolic link`);
      if (!insideRepository(repositoryReal, realpathSync(absolute))) {
        throw invalid(`root ${JSON.stringify(rootText)} resolves outside the repository`);
      }
    }
    const ordered = [...new Set(declared)].sort((left, right) =>
      left.split("/").length - right.split("/").length || compareCodePoints(left, right));
    roots = ordered
      .filter((candidate, index) => !ordered.slice(0, index).some((parent) => candidate.startsWith(`${parent}/`)))
      .sort();
  }
  return { path: PLANNING_CONFIG_PATH, sha256: sha256Bytes(bytes), roots, exclude };
}

export { PLANNING_LANE_LIFECYCLES, PLANNING_LANE_NAMES, planningLaneLifecycle, type PlanningLaneLifecycle } from "./planning-analysis/lifecycle.js";
import { PLANNING_LANE_NAMES, planningLaneLifecycle, type PlanningLaneLifecycle } from "./planning-analysis/lifecycle.js";

const PLANNING_IGNORED_NAMES = new Set([
  "__fixtures__",
  ".git",
  "examples",
  "fixtures",
  "node_modules",
  "samples",
  "test-data",
  "testdata",
  "vendor",
  ".venv",
  "venv",
  "dist",
  "build",
  ".cache",
]);

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

/**
 * Output bound for every Git child the closeout path starts.
 *
 * Node's spawnSync default is 1 MiB, which is smaller than a real repository's
 * path list: `git ls-files -z` is ~2.1 MB on a 14,600-file workspace, and that
 * shortfall surfaced as an ENOBUFS crash inside `audit repository-boundaries`.
 * One documented bound covers every call site that imports it, and a child that
 * would exceed it is refused as `git_output_too_large` with the bytes observed
 * and the limit, never as a raw ENOBUFS.
 */
export const GIT_OUTPUT_LIMIT_BYTES = 256 * 1024 * 1024;

/** Typed refusal for a Git child whose output would exceed the shared bound. */
export class GitOutputTooLargeError extends Error {
  readonly code = "git_output_too_large";
  constructor(
    readonly command: string,
    readonly observed_bytes: number,
    readonly limit_bytes: number,
  ) {
    super(`${command} produced at least ${String(observed_bytes)} bytes of output, over the ${String(limit_bytes)}-byte Git output bound`);
    this.name = "GitOutputTooLargeError";
  }
}

export interface RunGitOptions {
  /** Lower or raise the output bound for this call; the shared bound by default. */
  readonly max_buffer_bytes?: number;
}

function gitOutputFailure(args: readonly string[], error: unknown, bufferedBytes: number, limit: number): unknown {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
  if (code !== "ENOBUFS") return error;
  return new GitOutputTooLargeError(`git ${args.join(" ")}`, bufferedBytes, limit);
}

export function runGit(
  repository: string,
  args: readonly string[],
  allowedStatuses: readonly number[] = [0],
  options: RunGitOptions = {},
): GitResult {
  const limit = options.max_buffer_bytes ?? GIT_OUTPUT_LIMIT_BYTES;
  const result = spawnSync("git", ["--no-optional-locks", "-C", repository, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    maxBuffer: limit,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw gitOutputFailure(args, result.error, Buffer.byteLength(result.stdout ?? "", "utf8"), limit);
  }
  const status = result.status ?? 1;
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (!allowedStatuses.includes(status)) {
    throw new Error(stderr || `git ${args.join(" ")} exited ${status}`);
  }
  return { status, stdout, stderr };
}

function gitNullPaths(repository: string, args: readonly string[]): string[] {
  const result = spawnSync("git", ["--no-optional-locks", "-C", repository, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    maxBuffer: GIT_OUTPUT_LIMIT_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw gitOutputFailure(args, result.error, Buffer.byteLength(result.stdout ?? "", "utf8"), GIT_OUTPUT_LIMIT_BYTES);
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} exited ${result.status ?? 1}`);
  }
  return result.stdout.split("\0").filter((path) => path.length > 0);
}

/** Exact extant Git-tracked worktree surface; candidate deletions are not shippable bytes. */
export function trackedShippablePaths(repository: string): string[] {
  const deleted = new Set(gitNullPaths(repository, ["ls-files", "--deleted", "-z"]));
  return [...new Set(gitNullPaths(repository, ["ls-files", "--cached", "-z"]))]
    .filter((path) => !deleted.has(path))
    .sort(compareCodePoints);
}

export function git(repository: string, ...args: string[]): string {
  return runGit(repository, args).stdout;
}

export function isGitAncestor(repository: string, ancestor: string, descendant: string): boolean {
  return runGit(repository, ["merge-base", "--is-ancestor", ancestor, descendant], [0, 1]).status === 0;
}

export function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256File(path: string): string {
  return sha256Bytes(readFileSync(path));
}

export function readJson(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: expected a JSON object`);
  }
  return value as Record<string, unknown>;
}

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function packageRoot(fromUrl: string = import.meta.url): string {
  const sourcePath = fileURLToPath(fromUrl);
  const here = dirname(existsSync(sourcePath) ? realpathSync(sourcePath) : sourcePath);
  const candidates = [resolve(here, "..", ".."), resolve(here, "..")];
  const found = candidates.find((candidate) => existsSync(join(candidate, "assets", "closure-bundle.json")));
  if (!found) throw new Error("Cannot locate Mister Clean package assets");
  return found;
}

export function repositoryIdentity(repository: string): string {
  const remote = runGit(repository, ["config", "--get", "remote.origin.url"], [0, 1]).stdout;
  return canonicalRemoteRepositoryIdentity(remote)
    ?? localRepositoryIdentity(realpathSync(repository));
}

/**
 * Portable repository identity v2. Remote identities retain the authority
 * host; local-only identities disclose no path bytes and are scoped to the
 * exact canonical checkout path. Both forms are exact opaque inputs to the
 * regression root-debt identity scheme.
 */
export function canonicalRemoteRepositoryIdentity(remote: string): string | undefined {
  if (!remote || remote.startsWith("/") || remote.startsWith("file://")) return undefined;
  let host = "";
  let pathname = "";
  try {
    if (remote.includes("://")) {
      const parsed = new URL(remote);
      if (parsed.protocol === "file:" || !parsed.hostname) return undefined;
      host = parsed.host.toLocaleLowerCase("und");
      pathname = parsed.pathname;
    } else {
      const match = /^(?:[^@/:]+@)?([^/:]+):(.+)$/u.exec(remote);
      if (!match) return undefined;
      host = (match[1] ?? "").toLocaleLowerCase("und");
      pathname = match[2] ?? "";
    }
  } catch {
    return undefined;
  }
  const normalizedPath = pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/u, "");
  if (!host || !normalizedPath.includes("/") || /[\u0000-\u001f\u007f]/u.test(normalizedPath)) return undefined;
  return `remote:${host}/${normalizedPath}`;
}

export function localRepositoryIdentity(canonicalPath: string): string {
  if (!isAbsolute(canonicalPath) || /[\u0000-\u001f\u007f]/u.test(canonicalPath)) {
    throw new Error("local repository identity requires an absolute canonical path without controls");
  }
  return `local-path-sha256:${createHash("sha256").update(canonicalPath, "utf8").digest("hex")}`;
}

function childEntries(directory: string) {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return [];
  }
}

/**
 * Planning roots of `repository`, repository-relative and sorted.
 *
 * Honors `.mister-clean/planning.json` (see {@link PlanningConfig}): declared
 * roots replace the heuristic, and excludes bound the heuristic walk. Throws
 * {@link PlanningConfigInvalidError} for an invalid config.
 */
export function discoverPlanningRoots(
  repository: string,
  config: PlanningConfig | null = loadPlanningConfig(repository),
): string[] {
  if (config?.roots !== undefined) return [...config.roots];
  const exclude = config?.exclude ?? [];
  const candidates = new Set<string>();

  function visit(directory: string): void {
    const relativePath = relative(repository, directory);
    if (relativePath !== "" && isHarnessDefinitionPath(relativePath)) return;
    if (relativePath !== "" && isPlanningPathExcluded(relativePath, exclude)) return;
    if (isNestedCheckout(repository, directory)) return;
    const name = directory.split(sep).at(-1)?.toLocaleLowerCase() ?? "";
    if (directory !== repository && PLANNING_DIRECTORY_NAMES.has(name)) {
      candidates.add(directory);
      return;
    }
    const entries = childEntries(directory)
      .filter((entry) => !PLANNING_IGNORED_NAMES.has(entry.name));
    for (const entry of entries) {
      // Only a regular file can become an exact canonical-file root. A symbolic
      // link (for example a gitignored `.claude/commands/plan.md` pointing at a
      // skill file) is not a census-bindable planning input: the census rejects
      // symbolic-link roots and `prepare` would abort on it while `audit
      // planning` merely reported it. Skipping it keeps both entry points in
      // agreement (LE-003).
      if (entry.isFile() && isCanonicalPlanningFileName(entry.name)
        && !isPlanningPathExcluded(join(relativePath, entry.name), [...exclude, PLANNING_CONFIG_PATH])) {
        candidates.add(join(directory, entry.name));
      }
    }
    const names = entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name);
    const laneCount = names.filter((child) => PLANNING_LANE_NAMES.has(child.toLocaleLowerCase())).length;
    if (laneCount >= 2 && relativePath !== "") {
      candidates.add(directory);
      return;
    }
    for (const child of names) visit(join(directory, child));
  }

  visit(repository);
  const ordered = [...candidates].sort((left, right) => {
    const depth = left.split(sep).length - right.split(sep).length;
    return depth || compareCodePoints(left, right);
  });
  const minimal: string[] = [];
  for (const candidate of ordered) {
    if (!minimal.some((root) => candidate === root || candidate.startsWith(`${root}${sep}`))) {
      minimal.push(candidate);
    }
  }
  return minimal.map((root) => relative(repository, root).split(sep).join("/")).sort();
}

export function parseWorktrees(repository: string): WorktreeRecord[] {
  const output = git(repository, "worktree", "list", "--porcelain", "-z");
  if (!output) return [];
  const records: WorktreeRecord[] = [];
  const forbiddenKeys = new Set(["__proto__", "constructor", "prototype"]);
  let current: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const item of output.split("\0")) {
    if (!item) continue;
    if (item.startsWith("worktree ") && current.worktree) {
      records.push(current as unknown as WorktreeRecord);
      current = Object.create(null) as Record<string, string>;
    }
    const separator = item.indexOf(" ");
    const rawKey = separator === -1 ? item : item.slice(0, separator);
    const key = rawKey === "HEAD" ? "head" : rawKey.toLocaleLowerCase();
    if (forbiddenKeys.has(key)) throw new Error(`forbidden git worktree porcelain key: ${key}`);
    if (separator === -1) current[key] = "true";
    else current[key] = item.slice(separator + 1);
  }
  if (current.worktree) records.push(current as unknown as WorktreeRecord);
  return records;
}

export function listEntriesRecursively(root: string): RecursiveEntry[] {
  const entries: RecursiveEntry[] = [];
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink() && !isNestedCheckout(root, path)) visit(path);
      else if (entry.isSymbolicLink()) entries.push({ kind: "symlink", path });
      else if (entry.isFile()) entries.push({ kind: "file", path });
      else entries.push({ kind: "other", path });
    }
  }
  visit(root);
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

export function listFilesRecursively(root: string): string[] {
  return listEntriesRecursively(root)
    .filter((entry) => entry.kind === "file")
    .map((entry) => entry.path);
}

export function assertDirectory(path: string): void {
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`not a directory: ${path}`);
}

export function resolveInside(root: string, candidate: string): string | undefined {
  if (isAbsolute(candidate)) return undefined;
  const target = resolve(root, candidate);
  const relation = relative(resolve(root), target);
  if (relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation))) {
    return target;
  }
  return undefined;
}

export function isSymlink(path: string): boolean {
  return lstatSync(path).isSymbolicLink();
}

export function runCommand(command: string, args: readonly string[], cwd?: string): string {
  return execFileSync(command, [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
