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
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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

const PLANNING_LANE_NAMES = new Set([
  "backlog",
  "active",
  "in-progress",
  "done",
  "archive",
  "archived",
]);

const PLANNING_IGNORED_NAMES = new Set([
  ".git",
  "node_modules",
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
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
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
  if (remote && !remote.startsWith("/") && !remote.startsWith("file://")) {
    let value: string;
    if (remote.includes("://")) {
      value = new URL(remote).pathname.replace(/^\/+|\/+$/g, "");
    } else {
      value = remote.split(":", 2).at(-1) ?? remote;
    }
    value = value.replace(/\.git$/, "").replace(/\/+$/, "");
    if (value.includes("/")) return value;
  }
  return repository.split(sep).filter(Boolean).at(-1) ?? repository;
}

function childDirectories(directory: string): string[] {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function discoverPlanningRoots(repository: string): string[] {
  const candidates = new Set<string>();

  function visit(directory: string, depth: number): void {
    if (depth > 4) return;
    const relativePath = relative(repository, directory);
    const name = directory.split(sep).at(-1)?.toLocaleLowerCase() ?? "";
    if (directory !== repository && PLANNING_DIRECTORY_NAMES.has(name)) {
      candidates.add(directory);
      return;
    }
    const names = childDirectories(directory).filter((child) => !PLANNING_IGNORED_NAMES.has(child));
    const laneCount = names.filter((child) => PLANNING_LANE_NAMES.has(child.toLocaleLowerCase())).length;
    if (laneCount >= 2 && relativePath !== "") {
      candidates.add(directory);
      return;
    }
    for (const child of names) visit(join(directory, child), depth + 1);
  }

  visit(repository, 0);
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
  let current: Record<string, string> = {};
  for (const item of output.split("\0")) {
    if (!item) continue;
    if (item.startsWith("worktree ") && current.worktree) {
      records.push(current as unknown as WorktreeRecord);
      current = {};
    }
    const separator = item.indexOf(" ");
    const rawKey = separator === -1 ? item : item.slice(0, separator);
    const key = rawKey === "HEAD" ? "head" : rawKey.toLocaleLowerCase();
    if (separator === -1) current[key] = "true";
    else current[key] = item.slice(separator + 1);
  }
  if (current.worktree) records.push(current as unknown as WorktreeRecord);
  return records;
}

export function listFilesRecursively(root: string): string[] {
  const files: string[] = [];
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  visit(root);
  return files.sort();
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
