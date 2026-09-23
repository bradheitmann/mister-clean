import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { platform, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";

import { captureRepositoryObject, type RepositoryObject } from "./repository-object.js";
import { repositoryIdentity } from "./repository.js";

const HEX_OBJECT = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const OPERATION_PATHS = [
  ["MERGE_HEAD", "merge"],
  ["CHERRY_PICK_HEAD", "cherry_pick"],
  ["REVERT_HEAD", "revert"],
  ["REBASE_HEAD", "rebase"],
  ["rebase-merge", "rebase"],
  ["rebase-apply", "rebase"],
  ["BISECT_LOG", "bisect"],
  ["sequencer", "sequencer"],
] as const;
const LOCK_SCAN_EXCLUSIONS = new Set(["objects", "logs", "lfs", "rr-cache", "modules"]);

export interface RawProcessObservation {
  readonly pid: number;
  readonly ppid: number;
  readonly start_identity: string;
  readonly executable: string;
}

export interface RawProcessPathObservation {
  readonly cwd: string | null;
  readonly open_paths: readonly string[];
}

export interface ActionHygieneProcessPort {
  processTable(): readonly RawProcessObservation[];
  pathTable(): ReadonlyMap<number, RawProcessPathObservation>;
}

export interface ActionHygieneProcessRow {
  readonly identity: {
    readonly pid: number;
    readonly ppid: number;
    readonly start_identity: string;
    readonly executable: string;
    /** Null is an explicit OS visibility boundary, never an inferred path. */
    readonly cwd: string | null;
    /** Only open paths inside a governed worktree or its Git metadata roots. */
    readonly relevant_open_paths: readonly string[];
  };
  readonly classification: "current_invocation_ancestry" | "unestablished";
}

export interface ActionHygieneProcessCensus {
  readonly record_type: "mister-clean.action-hygiene-process-census";
  readonly schema_version: "1.0";
  readonly status: "complete" | "unsupported" | "unstable";
  readonly platform: string;
  readonly method: "ps+lsof-paths" | "injected";
  readonly coverage: "current_invocation_ancestry_worktree_cwd_and_open_paths";
  readonly current_pid: number;
  readonly rows: readonly ActionHygieneProcessRow[];
  readonly errors: readonly string[];
  readonly state_sha256: string;
}

export interface SuccessorProcessRow {
  readonly identity: string;
  readonly owner: null;
  readonly purpose: string;
  readonly disposition: string;
  readonly blocking: true;
}

export interface ActionHygieneStatusRow {
  readonly kind: "ordinary" | "rename_or_copy" | "unmerged" | "untracked";
  readonly path: string;
  readonly original_path: string | null;
  readonly index_status: string;
  readonly worktree_status: string;
  readonly raw_sha256: string;
}

export interface ActionHygieneIgnoredRow {
  readonly path: string;
  readonly kind: "file" | "collapsed_directory";
  readonly source: string;
  readonly line: number | null;
  readonly pattern: string;
  readonly provenance_sha256: string;
}

export interface ActionHygieneWorktree {
  readonly path: string;
  readonly head: string;
  readonly branch: string | null;
  readonly locked_reason: string | null;
  readonly prunable_reason: string | null;
  readonly status: {
    readonly rows: readonly ActionHygieneStatusRow[];
    readonly state_sha256: string;
  };
  readonly ignored: {
    readonly rows: readonly ActionHygieneIgnoredRow[];
    readonly state_sha256: string;
  };
}

export interface ActionHygieneControlRow {
  readonly scope: "common" | "worktree";
  readonly worktree: string | null;
  readonly git_directory: string;
  readonly path: string;
  readonly kind: "operation" | "lock";
  readonly operation: "merge" | "cherry_pick" | "revert" | "rebase" | "bisect" | "sequencer" | null;
  readonly entry_type: "file" | "directory" | "symlink";
  readonly content_sha256: string;
}

export interface ActionHygieneGitState {
  readonly head: {
    readonly kind: "symbolic" | "detached";
    readonly target: string | null;
    readonly oid: string;
  };
  readonly repository_object: RepositoryObject;
  readonly refs: readonly {
    readonly name: string;
    readonly oid: string;
    readonly object_type: string;
    readonly symref: string | null;
  }[];
  readonly stashes: readonly {
    readonly ordinal: number;
    readonly oid: string;
    readonly selector: string;
    readonly subject_sha256: string;
  }[];
  readonly worktrees: readonly ActionHygieneWorktree[];
  readonly controls: readonly ActionHygieneControlRow[];
  readonly state_sha256: string;
}

export interface ActionHygieneSnapshot {
  readonly record_type: "mister-clean.action-hygiene-snapshot";
  readonly schema_version: "1.0";
  readonly repo_id: string;
  readonly primary_worktree: string;
  readonly observed_at: string;
  readonly git: ActionHygieneGitState;
  readonly processes: ActionHygieneProcessCensus;
  readonly physical_state_sha256: string;
  readonly snapshot_sha256: string;
}

export type ActionHygieneViolationCode =
  | "repository_identity_changed"
  | "primary_head_changed_unexpectedly"
  | "primary_ref_not_advanced_to_after_head"
  | "unexpected_ref_change"
  | "stash_changed"
  | "worktree_topology_changed"
  | "other_worktree_state_changed"
  | "ignored_path_added"
  | "ignored_path_changed"
  | "git_control_changed"
  | "process_census_unestablished"
  | "unestablished_process_added"
  | "process_identity_changed";

export interface ActionHygieneViolation {
  readonly code: ActionHygieneViolationCode;
  readonly key: string;
  readonly before_sha256: string | null;
  readonly after_sha256: string | null;
}

export interface ActionHygieneChange {
  readonly key: string;
  readonly change: "added" | "removed" | "changed";
  readonly before_sha256: string | null;
  readonly after_sha256: string | null;
}

export interface ActionHygieneDelta {
  readonly record_type: "mister-clean.action-hygiene-delta";
  readonly schema_version: "1.0";
  readonly before_snapshot_sha256: string;
  readonly after_snapshot_sha256: string;
  readonly primary_branch: string;
  readonly repository_object_changed: boolean;
  readonly refs: readonly ActionHygieneChange[];
  readonly stashes: readonly ActionHygieneChange[];
  readonly worktrees: readonly ActionHygieneChange[];
  readonly ignored: readonly ActionHygieneChange[];
  readonly controls: readonly ActionHygieneChange[];
  readonly processes: readonly ActionHygieneChange[];
  readonly violations: readonly ActionHygieneViolation[];
  readonly delta_sha256: string;
}

export interface CaptureActionHygieneOptions {
  readonly currentPid?: number;
  readonly now?: () => Date;
  readonly processPort?: ActionHygieneProcessPort;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical action-hygiene evidence refuses non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => compare(left, right));
    if (entries.some(([, item]) => item === undefined)) throw new Error("canonical action-hygiene evidence refuses undefined fields");
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  throw new Error(`canonical action-hygiene evidence refuses ${typeof value}`);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function identity(value: unknown): string {
  return sha256(canonical(value));
}

function decode(bytes: Uint8Array, source: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${source} returned non-UTF-8 data`);
  }
}

const GIT_TIMEOUT_MS = 5 * 60 * 1_000;

// Input is handed to Git as a private regular file, never streamed through a
// spawnSync stdin pipe: that path can stall with the child blocked on read()
// and the parent idle inside spawnSync. The timeout kills a child that still
// makes no progress, so the caller fails instead of hanging.
function gitBytes(repository: string, args: readonly string[], input?: Uint8Array, allowed = [0]): Buffer {
  const inputDirectory = input === undefined ? undefined : mkdtempSync(join(tmpdir(), "mister-clean-git-input-"));
  let inputDescriptor: number | undefined;
  try {
    if (inputDirectory !== undefined && input !== undefined) {
      const inputPath = join(inputDirectory, "stdin");
      writeFileSync(inputPath, input, { mode: 0o600, flag: "wx" });
      inputDescriptor = openSync(inputPath, "r");
    }
    return execFileSync("git", ["--no-optional-locks", "-C", repository, ...args], {
      encoding: "buffer",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      killSignal: "SIGKILL",
      maxBuffer: 128 * 1024 * 1024,
      stdio: [inputDescriptor ?? "ignore", "pipe", "pipe"],
      timeout: GIT_TIMEOUT_MS,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
      throw new Error(`git ${args.join(" ")} did not finish within ${String(GIT_TIMEOUT_MS)} ms and was killed`, { cause: error });
    }
    const code = Number((error as { status?: unknown }).status);
    if (allowed.includes(code)) return Buffer.from((error as { stdout?: Uint8Array }).stdout ?? []);
    throw error;
  } finally {
    if (inputDescriptor !== undefined) closeSync(inputDescriptor);
    if (inputDirectory !== undefined) rmSync(inputDirectory, { recursive: true, force: true });
  }
}

function gitLine(repository: string, args: readonly string[], allowed = [0]): string {
  return decode(gitBytes(repository, args, undefined, allowed), `git ${args[0] ?? "command"}`).trim();
}

function nulRecords(bytes: Uint8Array, source: string): Buffer[] {
  const value = Buffer.from(bytes);
  if (value.length === 0) return [];
  if (value.at(-1) !== 0) throw new Error(`${source} did not end with NUL`);
  const rows: Buffer[] = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== 0) continue;
    rows.push(Buffer.from(value.subarray(start, index)));
    start = index + 1;
  }
  return rows;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseNulFieldLines(bytes: Uint8Array, fieldCount: number, source: string): string[][] {
  const text = decode(bytes, source);
  if (!text) return [];
  return text.split("\n").filter(Boolean).map((line, index) => {
    const fields = line.split("\0");
    if (fields.length !== fieldCount) throw new Error(`${source} row ${index} has ${fields.length} fields, expected ${fieldCount}`);
    return fields;
  });
}

function captureRefs(repository: string): ActionHygieneGitState["refs"] {
  const rows = parseNulFieldLines(gitBytes(repository, [
    "for-each-ref",
    "--sort=refname",
    "--format=%(refname)%00%(objectname)%00%(objecttype)%00%(symref)",
  ]), 4, "git for-each-ref").map(([name = "", oid = "", objectType = "", symref = ""]) => {
    if (!name || !HEX_OBJECT.test(oid) || !objectType) throw new Error("git for-each-ref returned an invalid row");
    return { name, oid, object_type: objectType, symref: symref || null };
  });
  return rows.sort((left, right) => compare(left.name, right.name));
}

function captureStashes(repository: string): ActionHygieneGitState["stashes"] {
  return parseNulFieldLines(gitBytes(repository, ["stash", "list", "--format=%H%x00%gd%x00%gs"]), 3, "git stash list")
    .map(([oid = "", selector = "", subject = ""], ordinal) => {
      if (!HEX_OBJECT.test(oid) || !selector) throw new Error("git stash list returned an invalid row");
      return { ordinal, oid, selector, subject_sha256: sha256(subject) };
    });
}

interface RawWorktree {
  path: string;
  head: string;
  branch: string | null;
  locked_reason: string | null;
  prunable_reason: string | null;
}

function captureWorktreeTopology(repository: string): RawWorktree[] {
  const tokens = nulRecords(gitBytes(repository, ["worktree", "list", "--porcelain", "-z"]), "git worktree list");
  const rows: RawWorktree[] = [];
  let current: Partial<RawWorktree> = {};
  const finish = (): void => {
    if (Object.keys(current).length === 0) return;
    if (!current.path || !current.head) throw new Error("git worktree list returned an incomplete row");
    rows.push({
      path: realpathSync(resolve(current.path)),
      head: current.head,
      branch: current.branch ?? null,
      locked_reason: current.locked_reason ?? null,
      prunable_reason: current.prunable_reason ?? null,
    });
    current = {};
  };
  for (const token of tokens) {
    if (token.length === 0) { finish(); continue; }
    const value = decode(token, "git worktree list");
    const separator = value.indexOf(" ");
    const key = separator < 0 ? value : value.slice(0, separator);
    const payload = separator < 0 ? "" : value.slice(separator + 1);
    if (key === "worktree") current.path = payload;
    else if (key === "HEAD") current.head = payload;
    else if (key === "branch") current.branch = payload;
    else if (key === "detached" || key === "bare") current.branch = null;
    else if (key === "locked") current.locked_reason = payload || "locked";
    else if (key === "prunable") current.prunable_reason = payload || "prunable";
    else throw new Error(`git worktree list returned unsupported key ${JSON.stringify(key)}`);
  }
  finish();
  return rows.sort((left, right) => compare(left.path, right.path));
}

function splitStatusPrefix(value: string, count: number, source: string): { fields: string[]; path: string } {
  const fields: string[] = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const next = value.indexOf(" ", cursor);
    if (next < 0) throw new Error(`${source} returned a truncated row`);
    fields.push(value.slice(cursor, next));
    cursor = next + 1;
  }
  const path = value.slice(cursor);
  if (!path) throw new Error(`${source} returned an empty path`);
  return { fields, path };
}

function captureStatus(repository: string): ActionHygieneWorktree["status"] {
  const tokens = nulRecords(gitBytes(repository, [
    "status", "--porcelain=v2", "-z", "--untracked-files=all", "--ignore-submodules=none",
  ]), "git status --porcelain=v2");
  const rows: ActionHygieneStatusRow[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.length === 0) throw new Error("git status returned an unexpected empty record");
    const value = decode(token, "git status --porcelain=v2");
    const kind = value[0];
    if (kind === "?") {
      if (!value.startsWith("? ") || value.length === 2) throw new Error("git status returned an invalid untracked row");
      rows.push({
        kind: "untracked", path: value.slice(2), original_path: null,
        index_status: "?", worktree_status: "?", raw_sha256: sha256(token),
      });
      continue;
    }
    if (kind === "1") {
      const parsed = splitStatusPrefix(value, 8, "git status ordinary row");
      const xy = parsed.fields[1] ?? "";
      if (xy.length !== 2) throw new Error("git status returned invalid ordinary XY state");
      rows.push({
        kind: "ordinary", path: parsed.path, original_path: null,
        index_status: xy[0]!, worktree_status: xy[1]!, raw_sha256: sha256(token),
      });
      continue;
    }
    if (kind === "2") {
      const parsed = splitStatusPrefix(value, 9, "git status rename row");
      const original = tokens[index + 1];
      if (!original || original.length === 0) throw new Error("git status rename row lacks its original path");
      index += 1;
      const xy = parsed.fields[1] ?? "";
      if (xy.length !== 2) throw new Error("git status returned invalid rename XY state");
      rows.push({
        kind: "rename_or_copy", path: parsed.path, original_path: decode(original, "git status original path"),
        index_status: xy[0]!, worktree_status: xy[1]!,
        raw_sha256: sha256(Buffer.concat([token, Buffer.from([0]), original])),
      });
      continue;
    }
    if (kind === "u") {
      const parsed = splitStatusPrefix(value, 10, "git status unmerged row");
      const xy = parsed.fields[1] ?? "";
      if (xy.length !== 2) throw new Error("git status returned invalid unmerged XY state");
      rows.push({
        kind: "unmerged", path: parsed.path, original_path: null,
        index_status: xy[0]!, worktree_status: xy[1]!, raw_sha256: sha256(token),
      });
      continue;
    }
    throw new Error(`git status returned unsupported record ${JSON.stringify(value.slice(0, 20))}`);
  }
  rows.sort((left, right) => compare(`${left.path}\0${left.original_path ?? ""}\0${left.kind}`, `${right.path}\0${right.original_path ?? ""}\0${right.kind}`));
  return { rows, state_sha256: identity(rows) };
}

function captureIgnored(repository: string): ActionHygieneWorktree["ignored"] {
  const paths = nulRecords(gitBytes(repository, [
    "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "--no-empty-directory", "-z",
  ]), "git ls-files ignored").filter((row) => row.length > 0);
  if (paths.length === 0) return { rows: [], state_sha256: identity([]) };
  const input = Buffer.concat(paths.flatMap((row) => [row, Buffer.from([0])]));
  const provenance = nulRecords(gitBytes(repository, [
    "check-ignore", "-z", "-v", "--no-index", "--stdin",
  ], input), "git check-ignore");
  if (provenance.length % 4 !== 0) throw new Error("git check-ignore returned an incomplete provenance tuple");
  const rows: ActionHygieneIgnoredRow[] = [];
  for (let index = 0; index < provenance.length; index += 4) {
    const source = decode(provenance[index]!, "git check-ignore source");
    const rawLine = decode(provenance[index + 1]!, "git check-ignore line");
    const pattern = decode(provenance[index + 2]!, "git check-ignore pattern");
    const path = decode(provenance[index + 3]!, "git check-ignore path");
    const line = rawLine === "" ? null : Number(rawLine);
    if (!source || !pattern || !path || (line !== null && (!Number.isInteger(line) || line < 0))) {
      throw new Error("git check-ignore returned invalid provenance");
    }
    const evidence = { source, line, pattern, path };
    rows.push({
      path,
      kind: path.endsWith("/") ? "collapsed_directory" : "file",
      source,
      line,
      pattern,
      provenance_sha256: identity(evidence),
    });
  }
  const requested = paths.map((row) => decode(row, "git ls-files ignored path")).sort(compare);
  const returned = rows.map((row) => row.path).sort(compare);
  if (canonical(requested) !== canonical(returned)) throw new Error("git check-ignore provenance does not exactly cover ignored paths");
  rows.sort((left, right) => compare(left.path, right.path));
  return { rows, state_sha256: identity(rows) };
}

function entryEvidence(path: string): { entry_type: "file" | "directory" | "symlink"; content_sha256: string } {
  const root = resolve(path);
  const visit = (current: string, prefix: string): unknown => {
    const stat = lstatSync(current);
    if (stat.isFile()) return { path: prefix, type: "file", sha256: sha256(readFileSync(current)) };
    if (stat.isSymbolicLink()) return { path: prefix, type: "symlink", target: readlinkSync(current) };
    if (stat.isDirectory()) {
      return {
        path: prefix,
        type: "directory",
        entries: readdirSync(current).sort(compare).map((name) => visit(resolve(current, name), prefix ? `${prefix}/${name}` : name)),
      };
    }
    throw new Error(`action hygiene refuses special Git-control entry ${JSON.stringify(current)}`);
  };
  const stat = lstatSync(root);
  const entry_type = stat.isFile() ? "file" : stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "symlink" : undefined;
  if (!entry_type) throw new Error(`action hygiene refuses special Git-control entry ${JSON.stringify(root)}`);
  return { entry_type, content_sha256: identity(visit(root, "")) };
}

function scanLocks(directory: string): string[] {
  const rows: string[] = [];
  const visit = (current: string, prefix: string): void => {
    for (const name of readdirSync(current).sort(compare)) {
      if (!prefix && LOCK_SCAN_EXCLUSIONS.has(name)) continue;
      const absolute = resolve(current, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const stat = lstatSync(absolute);
      if (name.endsWith(".lock")) rows.push(rel);
      if (stat.isDirectory() && !stat.isSymbolicLink()) visit(absolute, rel);
    }
  };
  visit(directory, "");
  return rows;
}

function captureControls(worktrees: readonly RawWorktree[]): ActionHygieneControlRow[] {
  const rows: ActionHygieneControlRow[] = [];
  const scannedLocks = new Set<string>();
  for (const worktree of worktrees) {
    const gitDirectory = realpathSync(gitLine(worktree.path, ["rev-parse", "--absolute-git-dir"]));
    const commonRaw = gitLine(worktree.path, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    const commonDirectory = realpathSync(isAbsolute(commonRaw) ? commonRaw : resolve(worktree.path, commonRaw));
    for (const [path, operation] of OPERATION_PATHS) {
      const absolute = resolve(gitDirectory, path);
      if (!existsSync(absolute)) continue;
      const evidence = entryEvidence(absolute);
      rows.push({
        scope: "worktree", worktree: worktree.path, git_directory: gitDirectory, path,
        kind: "operation", operation, ...evidence,
      });
    }
    for (const [scope, directory] of [["worktree", gitDirectory], ["common", commonDirectory]] as const) {
      const scanKey = `${scope}\0${directory}`;
      if (scannedLocks.has(scanKey)) continue;
      scannedLocks.add(scanKey);
      for (const path of scanLocks(directory)) {
        const evidence = entryEvidence(resolve(directory, path));
        rows.push({
          scope,
          worktree: scope === "worktree" ? worktree.path : null,
          git_directory: directory,
          path,
          kind: "lock",
          operation: null,
          ...evidence,
        });
      }
    }
  }
  rows.sort((left, right) => compare(`${left.scope}\0${left.git_directory}\0${left.path}`, `${right.scope}\0${right.git_directory}\0${right.path}`));
  return rows;
}

function parsePsTable(text: string): RawProcessObservation[] {
  const rows: RawProcessObservation[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;
    const match = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})\s+(\d{4})\s+(.+)$/u.exec(line);
    if (!match) throw new Error(`ps row ${index} is not parseable`);
    const [, pidText = "", ppidText = "", weekday = "", month = "", day = "", time = "", year = "", executable = ""] = match;
    const pid = Number(pidText);
    const ppid = Number(ppidText);
    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(ppid) || ppid < 0 || !executable) throw new Error(`ps row ${index} is invalid`);
    rows.push({ pid, ppid, start_identity: `${weekday} ${month} ${day} ${time} ${year}`, executable });
  }
  return rows;
}

function parseLsofPaths(bytes: Uint8Array): Map<number, RawProcessPathObservation> {
  const fields = decode(bytes, "lsof cwd census").split("\0").filter(Boolean);
  const rows = new Map<number, { cwd: string | null; open_paths: Set<string> }>();
  let pid: number | undefined;
  let descriptor: string | undefined;
  for (const raw of fields) {
    const field = raw.replace(/^\n+/u, "");
    if (!field) continue;
    if (field[0] === "p") {
      const parsed = Number(field.slice(1));
      if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("lsof returned an invalid PID");
      pid = parsed;
      descriptor = undefined;
      if (!rows.has(pid)) rows.set(pid, { cwd: null, open_paths: new Set() });
    } else if (field[0] === "f") {
      descriptor = field.slice(1);
    } else if (field[0] === "n" && pid !== undefined) {
      const path = field.slice(1);
      const row = rows.get(pid)!;
      if (descriptor === "cwd") row.cwd = path;
      else if (isAbsolute(path)) row.open_paths.add(path);
    }
  }
  return new Map([...rows.entries()].map(([key, row]) => [key, {
    cwd: row.cwd,
    open_paths: [...row.open_paths].sort(compare),
  }]));
}

export const nodeProcessPort: ActionHygieneProcessPort = {
  processTable: () => parsePsTable(execFileSync("ps", ["-axo", "pid=,ppid=,lstart=,comm="], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 15_000, stdio: ["ignore", "pipe", "pipe"],
  })),
  pathTable: () => parseLsofPaths(execFileSync("lsof", ["-nP", "-F0pfn"], {
    encoding: "buffer", maxBuffer: 128 * 1024 * 1024, timeout: 15_000, stdio: ["ignore", "pipe", "pipe"],
  })),
};

function within(root: string, candidate: string): boolean {
  const relation = relative(root, candidate);
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

function processKey(row: Pick<ActionHygieneProcessRow, "identity">): string {
  return `${row.identity.pid}:${row.identity.start_identity}`;
}

function observedPath(path: string): string {
  try {
    return existsSync(path) ? realpathSync(path) : resolve(path);
  } catch {
    return resolve(path);
  }
}

function processScopeRoots(worktreePaths: readonly string[]): string[] {
  const roots = new Set<string>();
  for (const worktree of worktreePaths) {
    roots.add(realpathSync(worktree));
    const gitDirectory = gitLine(worktree, ["rev-parse", "--absolute-git-dir"]);
    const commonRaw = gitLine(worktree, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    roots.add(realpathSync(gitDirectory));
    roots.add(realpathSync(isAbsolute(commonRaw) ? commonRaw : resolve(worktree, commonRaw)));
  }
  return [...roots].sort(compare);
}

function relevantOpenPaths(paths: readonly string[], scopeRoots: readonly string[]): string[] {
  return [...new Set(paths.map(observedPath))]
    .filter((path) => scopeRoots.some((root) => within(root, path)))
    .sort(compare);
}

export function captureRelevantProcessCensus(
  worktreePaths: readonly string[],
  options: Pick<CaptureActionHygieneOptions, "currentPid" | "processPort"> = {},
): ActionHygieneProcessCensus {
  const currentPid: number = options.currentPid ?? process.pid;
  const port = options.processPort ?? nodeProcessPort;
  const method: ActionHygieneProcessCensus["method"] = options.processPort ? "injected" : "ps+lsof-paths";
  const base = {
    record_type: "mister-clean.action-hygiene-process-census" as const,
    schema_version: "1.0" as const,
    platform: platform(),
    method,
    coverage: "current_invocation_ancestry_worktree_cwd_and_open_paths" as const,
    current_pid: currentPid,
  };
  try {
    const first = port.processTable();
    const paths = port.pathTable();
    const second = port.processTable();
    const scopeRoots = processScopeRoots(worktreePaths);
    const firstByPid = new Map(first.map((row) => [row.pid, row]));
    const secondByPid = new Map(second.map((row) => [row.pid, row]));
    const ancestry = new Set<number>();
    let cursor = currentPid;
    while (cursor > 0 && !ancestry.has(cursor)) {
      ancestry.add(cursor);
      cursor = secondByPid.get(cursor)?.ppid ?? 0;
    }
    const candidatePids = new Set<number>(ancestry);
    for (const [pid, observed] of paths) {
      const cwd = observed.cwd === null ? null : observedPath(observed.cwd);
      const open = relevantOpenPaths(observed.open_paths, scopeRoots);
      if ((cwd !== null && scopeRoots.some((root) => within(root, cwd))) || open.length > 0) candidatePids.add(pid);
    }
    const errors: string[] = [];
    const rows: ActionHygieneProcessRow[] = [];
    for (const pid of [...candidatePids].sort((left, right) => left - right)) {
      const before = firstByPid.get(pid);
      const after = secondByPid.get(pid);
      const observed = paths.get(pid);
      const cwd = observed?.cwd === null || observed?.cwd === undefined ? undefined : observedPath(observed.cwd);
      const open = relevantOpenPaths(observed?.open_paths ?? [], scopeRoots);
      // A process that has physically disappeared by the closing ps sample is
      // not a live boundary row. New or identity-reused PIDs remain unstable.
      if (!after) continue;
      if (!before || canonical(before) !== canonical(after)) {
        errors.push(`process ${pid} changed identity during census`);
        continue;
      }
      if (!cwd && !ancestry.has(pid)) {
        errors.push(`process ${pid} has no observable cwd`);
        continue;
      }
      rows.push({
        identity: { ...after, cwd: cwd ?? null, relevant_open_paths: open },
        classification: ancestry.has(pid) ? "current_invocation_ancestry" : "unestablished",
      });
    }
    rows.sort((left, right) => compare(processKey(left), processKey(right)));
    const status: ActionHygieneProcessCensus["status"] = errors.length === 0
      && rows.some((row) => row.identity.pid === currentPid) ? "complete" : "unstable";
    if (!rows.some((row) => row.identity.pid === currentPid)) errors.push(`current invocation PID ${currentPid} was not stably observed`);
    const record = { ...base, status, rows, errors };
    return { ...record, state_sha256: identity(record) };
  } catch (error) {
    const errors = [error instanceof Error ? error.message : String(error)];
    const record = { ...base, status: "unsupported" as const, rows: [] as ActionHygieneProcessRow[], errors };
    return { ...record, state_sha256: identity(record) };
  }
}

/**
 * Project the raw process census into the conservative successor-readiness
 * contract. Invocation ancestry is the measuring instrument, not residue.
 * Every other repository-relevant process remains blocking until it stops and
 * a fresh census proves the repository is quiescent.
 */
export function successorProcessRows(
  census: ActionHygieneProcessCensus,
): SuccessorProcessRow[] {
  if (census.status !== "complete") {
    return [{
      identity: `process-census:${census.status}:${census.state_sha256}`,
      owner: null,
      purpose: "repository process state could not be completely observed",
      disposition: "restore process-census support and rerun before closure",
      blocking: true,
    }];
  }
  return census.rows
    .filter((row) => row.classification === "unestablished")
    .map((row) => ({
      identity: `repository-process:${row.identity.pid}:${row.identity.start_identity}:${identity(row.identity)}`,
      owner: null,
      purpose: "repository-relevant process outside the Mister Clean invocation ancestry",
      disposition: "stop the process and rerun the census before closure",
      blocking: true as const,
    }))
    .sort((left, right) => compare(left.identity, right.identity));
}

export function assertActionHygieneProcessCensus(
  census: ActionHygieneProcessCensus,
  label = "action hygiene process census",
): void {
  if (census.record_type !== "mister-clean.action-hygiene-process-census" || census.schema_version !== "1.0") {
    throw new Error(`${label} is not an action-hygiene process census`);
  }
  if (!new Set(["complete", "unsupported", "unstable"]).has(census.status)) {
    throw new Error(`${label}.status is unsupported`);
  }
  if (!new Set(["ps+lsof-paths", "injected"]).has(census.method)) {
    throw new Error(`${label}.method is unsupported`);
  }
  if (census.coverage !== "current_invocation_ancestry_worktree_cwd_and_open_paths") {
    throw new Error(`${label}.coverage is unsupported`);
  }
  if (!Number.isInteger(census.current_pid) || census.current_pid <= 0) {
    throw new Error(`${label}.current_pid is invalid`);
  }
  if (!Array.isArray(census.rows) || !Array.isArray(census.errors)
    || !census.errors.every((error) => typeof error === "string")) {
    throw new Error(`${label} rows or errors are invalid`);
  }
  const keys = new Set<string>();
  for (const [index, row] of census.rows.entries()) {
    const rowLabel = `${label}.rows[${index}]`;
    if (!row || !row.identity || !Number.isInteger(row.identity.pid) || row.identity.pid <= 0
      || !Number.isInteger(row.identity.ppid) || row.identity.ppid < 0
      || typeof row.identity.start_identity !== "string" || !row.identity.start_identity
      || typeof row.identity.executable !== "string" || !row.identity.executable
      || (row.identity.cwd !== null && typeof row.identity.cwd !== "string")
      || !Array.isArray(row.identity.relevant_open_paths)
      || !row.identity.relevant_open_paths.every((path: unknown) => typeof path === "string" && isAbsolute(path))
      || !new Set(["current_invocation_ancestry", "unestablished"]).has(row.classification)) {
      throw new Error(`${rowLabel} is invalid`);
    }
    const key = processKey(row);
    if (keys.has(key)) throw new Error(`${rowLabel} duplicates process identity ${key}`);
    keys.add(key);
  }
  const { state_sha256: reported, ...body } = census;
  if (reported !== identity(body)) throw new Error(`${label}.state_sha256 mismatch`);
}

function captureGitState(repository: string): ActionHygieneGitState {
  const repositoryObject = captureRepositoryObject(repository);
  const symbolic = gitLine(repository, ["symbolic-ref", "--quiet", "HEAD"], [0, 1]);
  const topology = captureWorktreeTopology(repository);
  const worktrees = topology.map((row) => ({
    ...row,
    status: captureStatus(row.path),
    ignored: captureIgnored(row.path),
  }));
  const record = {
    head: {
      kind: symbolic ? "symbolic" as const : "detached" as const,
      target: symbolic || null,
      oid: repositoryObject.head_commit,
    },
    repository_object: repositoryObject,
    refs: captureRefs(repository),
    stashes: captureStashes(repository),
    worktrees,
    controls: captureControls(topology),
  };
  return { ...record, state_sha256: identity(record) };
}

export function captureActionHygiene(
  root: string,
  options: CaptureActionHygieneOptions = {},
): ActionHygieneSnapshot {
  const repository = realpathSync(resolve(root));
  const first = captureGitState(repository);
  const processes = captureRelevantProcessCensus(first.worktrees.map((row) => row.path), options);
  const second = captureGitState(repository);
  if (first.state_sha256 !== second.state_sha256) {
    throw new Error("repository hygiene state changed while its exact boundary was being captured");
  }
  const physical = { git_state_sha256: second.state_sha256, process_state_sha256: processes.state_sha256 };
  const record = {
    record_type: "mister-clean.action-hygiene-snapshot" as const,
    schema_version: "1.0" as const,
    repo_id: repositoryIdentity(repository),
    primary_worktree: repository,
    observed_at: (options.now ?? (() => new Date()))().toISOString(),
    git: second,
    processes,
    physical_state_sha256: identity(physical),
  };
  return { ...record, snapshot_sha256: identity(record) };
}

function rowMap<T>(rows: readonly T[], key: (row: T) => string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const value = key(row);
    if (result.has(value)) throw new Error(`duplicate action-hygiene identity ${JSON.stringify(value)}`);
    result.set(value, row);
  }
  return result;
}

function changes<T>(before: readonly T[], after: readonly T[], key: (row: T) => string): ActionHygieneChange[] {
  const left = rowMap(before, key);
  const right = rowMap(after, key);
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort(compare);
  return keys.flatMap((item): ActionHygieneChange[] => {
    const prior = left.get(item);
    const next = right.get(item);
    const beforeSha = prior === undefined ? null : identity(prior);
    const afterSha = next === undefined ? null : identity(next);
    if (beforeSha === afterSha) return [];
    return [{
      key: item,
      change: prior === undefined ? "added" : next === undefined ? "removed" : "changed",
      before_sha256: beforeSha,
      after_sha256: afterSha,
    }];
  });
}

function violation(code: ActionHygieneViolationCode, change: ActionHygieneChange): ActionHygieneViolation {
  return { code, key: change.key, before_sha256: change.before_sha256, after_sha256: change.after_sha256 };
}

export function assertActionHygieneSnapshot(
  snapshot: ActionHygieneSnapshot,
  label = "action hygiene snapshot",
): void {
  if (snapshot.record_type !== "mister-clean.action-hygiene-snapshot" || snapshot.schema_version !== "1.0") {
    throw new Error(`${label} is not an action-hygiene snapshot`);
  }
  const { snapshot_sha256: reported, ...body } = snapshot;
  if (reported !== identity(body)) throw new Error(`${label}.snapshot_sha256 mismatch`);
  const { state_sha256: gitDigest, ...gitBody } = snapshot.git;
  if (gitDigest !== identity(gitBody)) throw new Error(`${label}.git.state_sha256 mismatch`);
  assertActionHygieneProcessCensus(snapshot.processes, `${label}.processes`);
  const expectedPhysical = identity({
    git_state_sha256: snapshot.git.state_sha256,
    process_state_sha256: snapshot.processes.state_sha256,
  });
  if (snapshot.physical_state_sha256 !== expectedPhysical) {
    throw new Error(`${label}.physical_state_sha256 mismatch`);
  }
  for (const [index, worktree] of snapshot.git.worktrees.entries()) {
    if (worktree.status.state_sha256 !== identity(worktree.status.rows)) {
      throw new Error(`${label}.git.worktrees[${index}].status.state_sha256 mismatch`);
    }
    if (worktree.ignored.state_sha256 !== identity(worktree.ignored.rows)) {
      throw new Error(`${label}.git.worktrees[${index}].ignored.state_sha256 mismatch`);
    }
    for (const [ignoredIndex, row] of worktree.ignored.rows.entries()) {
      if (row.provenance_sha256 !== identity({ source: row.source, line: row.line, pattern: row.pattern, path: row.path })) {
        throw new Error(`${label}.git.worktrees[${index}].ignored.rows[${ignoredIndex}].provenance_sha256 mismatch`);
      }
    }
  }
}

export function deriveActionHygieneDelta(
  before: ActionHygieneSnapshot,
  after: ActionHygieneSnapshot,
  primaryBranch: string,
): ActionHygieneDelta {
  assertActionHygieneSnapshot(before, "before");
  assertActionHygieneSnapshot(after, "after");
  if (!primaryBranch || primaryBranch.startsWith("refs/")) throw new Error("primaryBranch must be a short branch name");
  const refChanges = changes(before.git.refs, after.git.refs, (row) => row.name);
  const stashChanges = changes(before.git.stashes, after.git.stashes, (row) => `${row.ordinal}:${row.selector}:${row.oid}`);
  const worktreeChanges = changes(before.git.worktrees, after.git.worktrees, (row) => row.path);
  const beforeIgnored = before.git.worktrees.flatMap((worktree) => worktree.ignored.rows.map((row) => ({ worktree: worktree.path, ...row })));
  const afterIgnored = after.git.worktrees.flatMap((worktree) => worktree.ignored.rows.map((row) => ({ worktree: worktree.path, ...row })));
  const ignoredChanges = changes(beforeIgnored, afterIgnored, (row) => `${row.worktree}\0${row.path}`);
  const controlChanges = changes(before.git.controls, after.git.controls, (row) => `${row.scope}\0${row.git_directory}\0${row.path}`);
  const processChanges = changes(before.processes.rows, after.processes.rows, processKey);
  const violations: ActionHygieneViolation[] = [];

  if (before.repo_id !== after.repo_id || before.primary_worktree !== after.primary_worktree) {
    violations.push({
      code: "repository_identity_changed",
      key: `${before.repo_id}:${before.primary_worktree}`,
      before_sha256: identity({ repo_id: before.repo_id, worktree: before.primary_worktree }),
      after_sha256: identity({ repo_id: after.repo_id, worktree: after.primary_worktree }),
    });
  }
  const primaryRef = `refs/heads/${primaryBranch}`;
  const beforeRef = before.git.refs.find((row) => row.name === primaryRef);
  const afterRef = after.git.refs.find((row) => row.name === primaryRef);
  const repositoryChanged = before.git.repository_object.sha256 !== after.git.repository_object.sha256;
  if (before.git.head.kind !== "symbolic" || after.git.head.kind !== "symbolic"
    || before.git.head.target !== primaryRef || after.git.head.target !== primaryRef) {
    violations.push({
      code: "primary_head_changed_unexpectedly", key: "HEAD",
      before_sha256: identity(before.git.head), after_sha256: identity(after.git.head),
    });
  }
  if (!beforeRef || !afterRef
    || beforeRef.oid !== before.git.repository_object.head_commit
    || afterRef.oid !== after.git.repository_object.head_commit) {
    violations.push({
      code: "primary_ref_not_advanced_to_after_head", key: primaryRef,
      before_sha256: beforeRef ? identity(beforeRef) : null,
      after_sha256: afterRef ? identity(afterRef) : null,
    });
  }
  for (const change of refChanges) if (change.key !== primaryRef) violations.push(violation("unexpected_ref_change", change));
  for (const change of stashChanges) violations.push(violation("stash_changed", change));

  const beforeWorktrees = rowMap(before.git.worktrees, (row) => row.path);
  const afterWorktrees = rowMap(after.git.worktrees, (row) => row.path);
  for (const change of worktreeChanges) {
    const prior = beforeWorktrees.get(change.key);
    const next = afterWorktrees.get(change.key);
    if (!prior || !next) {
      violations.push(violation("worktree_topology_changed", change));
      continue;
    }
    if (change.key === before.primary_worktree) {
      const priorTopology = { path: prior.path, branch: prior.branch, locked_reason: prior.locked_reason, prunable_reason: prior.prunable_reason };
      const nextTopology = { path: next.path, branch: next.branch, locked_reason: next.locked_reason, prunable_reason: next.prunable_reason };
      if (canonical(priorTopology) !== canonical(nextTopology)
        || next.head !== after.git.repository_object.head_commit
        || next.branch !== primaryRef) {
        violations.push(violation("worktree_topology_changed", change));
      }
    } else {
      violations.push(violation("other_worktree_state_changed", change));
    }
  }

  for (const change of ignoredChanges) {
    const [worktree = ""] = change.key.split("\0", 1);
    if (worktree !== before.primary_worktree) violations.push(violation("other_worktree_state_changed", change));
    else if (change.change === "added") violations.push(violation("ignored_path_added", change));
    else if (change.change === "changed") violations.push(violation("ignored_path_changed", change));
  }
  for (const change of controlChanges) violations.push(violation("git_control_changed", change));

  if (before.processes.status !== "complete" || after.processes.status !== "complete") {
    violations.push({
      code: "process_census_unestablished", key: "process-census",
      before_sha256: before.processes.state_sha256,
      after_sha256: after.processes.state_sha256,
    });
  }
  const afterProcesses = rowMap(after.processes.rows, processKey);
  for (const change of processChanges) {
    if (change.change === "removed") continue;
    const row = afterProcesses.get(change.key);
    if (change.change === "added" && row?.classification === "unestablished") {
      violations.push(violation("unestablished_process_added", change));
    } else if (change.change === "changed") {
      violations.push(violation("process_identity_changed", change));
    }
  }

  violations.sort((left, right) => compare(`${left.code}\0${left.key}`, `${right.code}\0${right.key}`));
  const record = {
    record_type: "mister-clean.action-hygiene-delta" as const,
    schema_version: "1.0" as const,
    before_snapshot_sha256: before.snapshot_sha256,
    after_snapshot_sha256: after.snapshot_sha256,
    primary_branch: primaryBranch,
    repository_object_changed: repositoryChanged,
    refs: refChanges,
    stashes: stashChanges,
    worktrees: worktreeChanges,
    ignored: ignoredChanges,
    controls: controlChanges,
    processes: processChanges,
    violations,
  };
  return { ...record, delta_sha256: identity(record) };
}

export function assertActionHygieneDelta(
  delta: ActionHygieneDelta,
  before?: ActionHygieneSnapshot,
  after?: ActionHygieneSnapshot,
  label = "action hygiene delta",
): void {
  if (delta.record_type !== "mister-clean.action-hygiene-delta" || delta.schema_version !== "1.0") {
    throw new Error(`${label} is not an action-hygiene delta`);
  }
  const { delta_sha256: reported, ...body } = delta;
  if (reported !== identity(body)) throw new Error(`${label}.delta_sha256 mismatch`);
  if (before) {
    assertActionHygieneSnapshot(before, `${label}.before`);
    if (delta.before_snapshot_sha256 !== before.snapshot_sha256) {
      throw new Error(`${label}.before_snapshot_sha256 mismatch`);
    }
  }
  if (after) {
    assertActionHygieneSnapshot(after, `${label}.after`);
    if (delta.after_snapshot_sha256 !== after.snapshot_sha256) {
      throw new Error(`${label}.after_snapshot_sha256 mismatch`);
    }
  }
}
