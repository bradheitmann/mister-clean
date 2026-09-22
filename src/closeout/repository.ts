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

export type PlanningLaneLifecycle = "active" | "archived" | "done" | "preexecution";

export const PLANNING_LANE_LIFECYCLES: ReadonlyMap<string, PlanningLaneLifecycle> = new Map([
  ["backlog", "preexecution"],
  ["todo", "preexecution"],
  ["to-do", "preexecution"],
  ["to_do", "preexecution"],
  ["ready", "preexecution"],
  ["planned", "preexecution"],
  ["active", "active"],
  ["doing", "active"],
  ["in-progress", "active"],
  ["in_progress", "active"],
  ["inprogress", "active"],
  ["failed", "active"],
  ["done", "done"],
  ["complete", "done"],
  ["completed", "done"],
  ["closed", "done"],
  ["history", "archived"],
  ["historical", "archived"],
  ["archive", "archived"],
  ["archived", "archived"],
  ["superseded", "archived"],
]);

export const PLANNING_LANE_NAMES: ReadonlySet<string> = new Set(PLANNING_LANE_LIFECYCLES.keys());

export function planningLaneLifecycle(name: string): PlanningLaneLifecycle | undefined {
  return PLANNING_LANE_LIFECYCLES.get(name.toLocaleLowerCase("und"));
}

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

export function runGit(
  repository: string,
  args: readonly string[],
  allowedStatuses: readonly number[] = [0],
): GitResult {
  const result = spawnSync("git", ["--no-optional-locks", "-C", repository, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const status = result.status ?? 1;
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (result.error) throw result.error;
  if (!allowedStatuses.includes(status)) {
    throw new Error(stderr || `git ${args.join(" ")} exited ${status}`);
  }
  return { status, stdout, stderr };
}

function gitNullPaths(repository: string, args: readonly string[]): string[] {
  const result = spawnSync("git", ["--no-optional-locks", "-C", repository, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
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

export function discoverPlanningRoots(repository: string): string[] {
  const candidates = new Set<string>();

  function visit(directory: string): void {
    const relativePath = relative(repository, directory);
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
      if (entry.isFile() && isCanonicalPlanningFileName(entry.name)) {
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
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(path);
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
