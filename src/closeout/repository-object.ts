import { createHash, type Hash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readlinkSync,
  readSync,
  realpathSync,
  type BigIntStats,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export interface RepositoryObject {
  readonly record_type: "mister-clean.repository-object";
  readonly schema_version: "1.0";
  readonly head_commit: string;
  readonly surface: "tracked_and_nonignored";
  readonly entry_count: number;
  readonly sha256: string;
}

export interface RepositoryObjectTrackedEntry {
  readonly mode: string;
  readonly oid: string;
}

interface RepositoryObjectSurfaceEntryBase {
  readonly path: string;
  readonly tracked: RepositoryObjectTrackedEntry | null;
}

export type RepositoryObjectSurfaceEntry =
  | RepositoryObjectSurfaceEntryBase & {
    readonly kind: "regular_file";
    readonly executable: boolean;
    readonly bytes: Uint8Array;
  }
  | RepositoryObjectSurfaceEntryBase & {
    readonly kind: "symlink";
    readonly target: Uint8Array;
  }
  | RepositoryObjectSurfaceEntryBase & {
    readonly kind: "missing_tracked_entry" | "missing_gitlink" | "uninitialized_gitlink";
  }
  | RepositoryObjectSurfaceEntryBase & {
    readonly kind: "checked_out_gitlink";
    readonly submodule_object: RepositoryObject;
  };

export interface RepositoryObjectSurfaceCapture {
  readonly repository_object: RepositoryObject;
  readonly entries: readonly RepositoryObjectSurfaceEntry[];
}

interface SurfaceEntry {
  readonly path: string;
  readonly pathBytes: Buffer;
  readonly tracked: RepositoryObjectTrackedEntry | undefined;
}

interface SurfaceSnapshot {
  readonly entries: readonly SurfaceEntry[];
  readonly signature: string;
}

const RECORD_TYPE = "mister-clean.repository-object";
const SCHEMA_VERSION = "1.0";
const SURFACE = "tracked_and_nonignored";
const MAX_GIT_OUTPUT_BYTES = 128 * 1024 * 1024;
const MAX_U64 = (1n << 64n) - 1n;
const FILE_CHUNK_BYTES = 1024 * 1024;
const INDEX_MODES = new Set(["100644", "100755", "120000", "160000"]);
const UTF8 = new TextDecoder("utf-8", { fatal: true });

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function gitBytes(repository: string, args: readonly string[]): Buffer {
  const result = spawnSync("git", ["--no-optional-locks", "-C", repository, ...args], {
    encoding: null,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw new Error(`git ${args.join(" ")} failed: ${errorMessage(result.error)}`);
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? new TextDecoder().decode(result.stderr).trim() : "";
    throw new Error(stderr || `git ${args.join(" ")} exited ${String(result.status)}`);
  }
  if (!Buffer.isBuffer(result.stdout)) throw new Error(`git ${args.join(" ")} returned non-byte output`);
  return result.stdout;
}

function gitLine(repository: string, args: readonly string[]): string {
  const bytes = gitBytes(repository, args);
  const withoutLineEnding = bytes.subarray(
    0,
    bytes.length >= 2 && bytes.at(-2) === 0x0d && bytes.at(-1) === 0x0a
      ? bytes.length - 2
      : bytes.at(-1) === 0x0a
        ? bytes.length - 1
        : bytes.length,
  );
  let value: string;
  try {
    value = UTF8.decode(withoutLineEnding);
  } catch {
    throw new Error(`git ${args.join(" ")} returned non-UTF-8 output`);
  }
  if (!value || value.includes("\n") || value.includes("\r")) {
    throw new Error(`git ${args.join(" ")} returned an ambiguous line`);
  }
  return value;
}

function gitCheckIgnored(repository: string, path: string, directory: boolean): boolean {
  const candidate = directory ? `${path}/` : path;
  const result = spawnSync(
    "git",
    ["--no-optional-locks", "-C", repository, "check-ignore", "--quiet", "--no-index", "--", candidate],
    {
      encoding: null,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error) throw new Error(`git check-ignore failed: ${errorMessage(result.error)}`);
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  const stderr = Buffer.isBuffer(result.stderr) ? new TextDecoder().decode(result.stderr).trim() : "";
  throw new Error(stderr || `git check-ignore exited ${String(result.status)}`);
}

function nulRecords(bytes: Buffer, source: string): readonly Buffer[] {
  if (bytes.length === 0) return [];
  if (bytes.at(-1) !== 0) throw new Error(`${source} returned a truncated NUL-delimited record`);
  const records: Buffer[] = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0) continue;
    if (index === start) throw new Error(`${source} returned an empty path record`);
    records.push(bytes.subarray(start, index));
    start = index + 1;
  }
  return records;
}

function decodePath(bytes: Buffer, source: string): string {
  let path: string;
  try {
    path = UTF8.decode(bytes);
  } catch {
    throw new Error(`${source} contains a non-UTF-8 path; repository object capture refuses ambiguous paths`);
  }
  if (Buffer.compare(Buffer.from(path, "utf8"), bytes) !== 0) {
    throw new Error(`${source} contains a non-canonical UTF-8 path`);
  }
  validatePortablePath(path, source);
  return path;
}

function validatePortablePath(path: string, source: string): void {
  if (!path || isAbsolute(path) || path.includes("\0")) {
    throw new Error(`${source} contains an unsafe path: ${JSON.stringify(path)}`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`${source} contains path traversal or an ambiguous segment: ${JSON.stringify(path)}`);
  }
  if (sep === "\\" && path.includes("\\")) {
    throw new Error(`${source} contains a platform-ambiguous path: ${JSON.stringify(path)}`);
  }
}

function parseTracked(bytes: Buffer): readonly SurfaceEntry[] {
  const entries: SurfaceEntry[] = [];
  const seen = new Set<string>();
  for (const record of nulRecords(bytes, "git ls-files --stage")) {
    const separator = record.indexOf(0x09);
    if (separator <= 0 || separator === record.length - 1) {
      throw new Error("git ls-files --stage returned a malformed index record");
    }
    const metadataBytes = record.subarray(0, separator);
    if ([...metadataBytes].some((byte) => byte > 0x7f)) {
      throw new Error("git ls-files --stage returned non-ASCII index metadata");
    }
    const metadataText = String.fromCharCode(...metadataBytes);
    const metadata = metadataText.split(" ");
    if (metadata.length !== 3) throw new Error("git ls-files --stage returned malformed index metadata");
    const [mode, oid, stage] = metadata;
    if (!mode || !INDEX_MODES.has(mode) || !oid || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(oid)) {
      throw new Error(`git ls-files --stage returned unsupported index metadata: ${metadataText}`);
    }
    if (stage !== "0") {
      throw new Error("repository object capture refuses an unmerged index");
    }
    const pathBytes = Buffer.from(record.subarray(separator + 1));
    const path = decodePath(pathBytes, "git ls-files --stage");
    if (seen.has(path)) throw new Error(`duplicate tracked path: ${JSON.stringify(path)}`);
    seen.add(path);
    entries.push({ path, pathBytes, tracked: { mode, oid } });
  }
  return entries;
}

function parseUntracked(bytes: Buffer, tracked: ReadonlySet<string>): readonly SurfaceEntry[] {
  const entries: SurfaceEntry[] = [];
  const seen = new Set<string>();
  for (const record of nulRecords(bytes, "git ls-files --others")) {
    const pathBytes = Buffer.from(record);
    const path = decodePath(pathBytes, "git ls-files --others");
    if (tracked.has(path)) throw new Error(`path is both tracked and untracked: ${JSON.stringify(path)}`);
    if (seen.has(path)) throw new Error(`duplicate untracked path: ${JSON.stringify(path)}`);
    seen.add(path);
    entries.push({ path, pathBytes, tracked: undefined });
  }
  return entries;
}

function u64(value: bigint): Buffer {
  if (value < 0n || value > MAX_U64) throw new Error(`canonical length exceeds uint64: ${String(value)}`);
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeBigUInt64BE(value);
  return bytes;
}

function fieldHeader(hash: Hash, label: string, length: bigint): void {
  const labelBytes = Buffer.from(label, "ascii");
  hash.update(u64(BigInt(labelBytes.length)));
  hash.update(labelBytes);
  hash.update(u64(length));
}

function field(hash: Hash, label: string, value: string | Uint8Array): void {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  fieldHeader(hash, label, BigInt(bytes.byteLength));
  hash.update(bytes);
}

function snapshotSignature(entries: readonly SurfaceEntry[]): string {
  const hash = createHash("sha256");
  field(hash, "domain", "mister-clean.repository-surface-list.v1");
  for (const entry of entries) {
    field(hash, "path", entry.pathBytes);
    field(hash, "tracking", entry.tracked ? "tracked" : "untracked");
    if (entry.tracked) {
      field(hash, "index_mode", entry.tracked.mode);
      field(hash, "index_oid", entry.tracked.oid);
    }
  }
  return hash.digest("hex");
}

function assertFilesystemCoverage(repository: string, entries: readonly SurfaceEntry[]): void {
  const known = new Set(entries.map((entry) => entry.path));
  const directoryPrefixes = new Set<string>();
  for (const entry of entries) {
    const segments = entry.path.split("/");
    for (let count = 1; count < segments.length; count += 1) {
      directoryPrefixes.add(segments.slice(0, count).join("/"));
    }
  }

  function walk(directory: string, parentPathBytes: Buffer): void {
    let children: Buffer[];
    try {
      children = readdirSync(directory, { encoding: "buffer" }).map((name) => Buffer.from(name));
    } catch (error) {
      throw new Error(`cannot inspect repository directory ${directory}: ${errorMessage(error)}`);
    }
    children.sort(Buffer.compare);
    for (const nameBytes of children) {
      const pathBytes = parentPathBytes.length === 0
        ? nameBytes
        : Buffer.concat([parentPathBytes, Buffer.from("/", "ascii"), nameBytes]);
      const path = decodePath(pathBytes, "filesystem traversal");
      if (parentPathBytes.length === 0 && path === ".git") continue;
      const absolute = join(repository, ...path.split("/"));
      const stat = tryLstat(absolute);
      if (!stat) throw new Error(`repository changed during filesystem traversal: ${JSON.stringify(path)}`);

      if (stat.isDirectory()) {
        if (known.has(path)) continue;
        if (!directoryPrefixes.has(path) && gitCheckIgnored(repository, path, true)) continue;
        walk(absolute, pathBytes);
        continue;
      }
      if (stat.isFile() || stat.isSymbolicLink()) {
        if (known.has(path) || gitCheckIgnored(repository, path, false)) continue;
        throw new Error(`repository surface changed or Git omitted path ${JSON.stringify(path)}`);
      }
      if (gitCheckIgnored(repository, path, false)) continue;
      throw new Error(`unsupported special entry at ${JSON.stringify(path)}`);
    }
  }

  walk(repository, Buffer.alloc(0));
}

function surfaceSnapshot(repository: string): SurfaceSnapshot {
  const tracked = parseTracked(gitBytes(repository, ["ls-files", "--cached", "--stage", "--full-name", "-z"]));
  const trackedPaths = new Set(tracked.map((entry) => entry.path));
  const untracked = parseUntracked(
    gitBytes(repository, ["ls-files", "--others", "--exclude-standard", "--full-name", "-z"]),
    trackedPaths,
  );
  const entries = [...tracked, ...untracked].sort((left, right) => Buffer.compare(left.pathBytes, right.pathBytes));
  if (!Number.isSafeInteger(entries.length)) throw new Error("repository surface exceeds the safe entry-count range");
  assertFilesystemCoverage(repository, entries);
  return { entries, signature: snapshotSignature(entries) };
}

function tryLstat(path: string): BigIntStats | undefined {
  try {
    return lstatSync(path, { bigint: true });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT" || code === "ENOTDIR") return undefined;
    throw error;
  }
}

function stableStat(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function assertNoSymlinkAncestor(repository: string, path: string): string {
  const segments = path.split("/");
  const absolute = join(repository, ...segments);
  const relation = relative(repository, absolute);
  if (!relation || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error(`repository path escapes its root: ${JSON.stringify(path)}`);
  }
  let parent = repository;
  for (const segment of segments.slice(0, -1)) {
    parent = join(parent, segment);
    const stat = tryLstat(parent);
    if (!stat) break;
    if (stat.isSymbolicLink()) {
      throw new Error(`repository object capture refuses symlink traversal at ${JSON.stringify(path)}`);
    }
    if (!stat.isDirectory()) break;
  }
  return absolute;
}

function hashRegularFile(
  hash: Hash,
  absolute: string,
  path: string,
  before: BigIntStats,
  captureBytes: boolean,
): Uint8Array | undefined {
  if (before.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`regular file exceeds the supported size range: ${JSON.stringify(path)}`);
  }
  field(hash, "kind", "regular_file");
  field(hash, "executable", (before.mode & 0o111n) === 0n ? Uint8Array.of(0) : Uint8Array.of(1));
  fieldHeader(hash, "bytes", before.size);
  const chunks: Buffer[] | undefined = captureBytes ? [] : undefined;
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  let descriptor: number;
  try {
    descriptor = openSync(absolute, constants.O_RDONLY | noFollow);
  } catch (error) {
    throw new Error(`unstable regular file ${JSON.stringify(path)}: ${errorMessage(error)}`);
  }
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || !stableStat(before, opened)) {
      throw new Error(`unstable regular file changed before read: ${JSON.stringify(path)}`);
    }
    const buffer = Buffer.allocUnsafe(FILE_CHUNK_BYTES);
    let remaining = before.size;
    while (remaining > 0n) {
      const requested = Number(remaining > BigInt(buffer.length) ? BigInt(buffer.length) : remaining);
      const count = readSync(descriptor, buffer, 0, requested, null);
      if (count === 0) throw new Error(`unstable regular file ended during read: ${JSON.stringify(path)}`);
      const chunk = buffer.subarray(0, count);
      hash.update(chunk);
      chunks?.push(Buffer.from(chunk));
      remaining -= BigInt(count);
    }
    const afterRead = fstatSync(descriptor, { bigint: true });
    if (!stableStat(opened, afterRead)) {
      throw new Error(`unstable regular file changed during read: ${JSON.stringify(path)}`);
    }
  } finally {
    closeSync(descriptor);
  }
  const after = tryLstat(absolute);
  if (!after || !after.isFile() || !stableStat(before, after)) {
    throw new Error(`unstable regular file changed after read: ${JSON.stringify(path)}`);
  }
  return chunks === undefined ? undefined : Buffer.concat(chunks, Number(before.size));
}

function hashSymlink(hash: Hash, absolute: string, path: string, before: BigIntStats): Buffer {
  let target: Buffer;
  try {
    target = readlinkSync(absolute, { encoding: "buffer" });
  } catch (error) {
    throw new Error(`unstable symlink ${JSON.stringify(path)}: ${errorMessage(error)}`);
  }
  const after = tryLstat(absolute);
  if (!after || !after.isSymbolicLink() || !stableStat(before, after)) {
    throw new Error(`unstable symlink changed during capture: ${JSON.stringify(path)}`);
  }
  field(hash, "kind", "symlink");
  field(hash, "target", target);
  return target;
}

function hashEntry(
  hash: Hash,
  repository: string,
  entry: SurfaceEntry,
  visited: Set<string>,
  projection: RepositoryObjectSurfaceEntry[] | undefined,
): void {
  field(hash, "entry", Uint8Array.of());
  field(hash, "path", entry.pathBytes);
  field(hash, "tracking", entry.tracked ? "tracked" : "untracked");
  if (entry.tracked) {
    field(hash, "index_mode", entry.tracked.mode);
    field(hash, "index_oid", entry.tracked.oid);
  }

  const absolute = assertNoSymlinkAncestor(repository, entry.path);
  const before = tryLstat(absolute);
  if (!before) {
    if (!entry.tracked) throw new Error(`unstable untracked path disappeared: ${JSON.stringify(entry.path)}`);
    const kind = entry.tracked.mode === "160000" ? "missing_gitlink" : "missing_tracked_entry";
    field(hash, "kind", kind);
    projection?.push({ path: entry.path, tracked: entry.tracked, kind });
    return;
  }

  if (entry.tracked?.mode === "160000") {
    if (!before.isDirectory()) {
      throw new Error(`unsupported gitlink worktree entry at ${JSON.stringify(entry.path)}`);
    }
    if (!tryLstat(join(absolute, ".git"))) {
      const children = readdirSync(absolute, { encoding: "buffer" });
      const after = tryLstat(absolute);
      if (!after || !after.isDirectory() || !stableStat(before, after)) {
        throw new Error(`unstable gitlink changed during capture: ${JSON.stringify(entry.path)}`);
      }
      if (children.length !== 0) {
        throw new Error(`gitlink has worktree content but no repository metadata: ${JSON.stringify(entry.path)}`);
      }
      field(hash, "kind", "uninitialized_gitlink");
      projection?.push({ path: entry.path, tracked: entry.tracked, kind: "uninitialized_gitlink" });
      return;
    }
    const submodule = captureStable(absolute, visited);
    const after = tryLstat(absolute);
    if (!after || !after.isDirectory() || !stableStat(before, after)) {
      throw new Error(`unstable gitlink changed during capture: ${JSON.stringify(entry.path)}`);
    }
    field(hash, "kind", "checked_out_gitlink");
    field(hash, "submodule_head_commit", submodule.head_commit);
    field(hash, "submodule_entry_count", u64(BigInt(submodule.entry_count)));
    field(hash, "submodule_sha256", submodule.sha256);
    projection?.push({
      path: entry.path,
      tracked: entry.tracked,
      kind: "checked_out_gitlink",
      submodule_object: submodule,
    });
    return;
  }

  if (before.isFile()) {
    const bytes = hashRegularFile(hash, absolute, entry.path, before, projection !== undefined);
    if (projection && bytes) {
      projection.push({
        path: entry.path,
        tracked: entry.tracked ?? null,
        kind: "regular_file",
        executable: (before.mode & 0o111n) !== 0n,
        bytes,
      });
    }
    return;
  }
  if (before.isSymbolicLink()) {
    const target = hashSymlink(hash, absolute, entry.path, before);
    projection?.push({ path: entry.path, tracked: entry.tracked ?? null, kind: "symlink", target });
    return;
  }
  throw new Error(`unsupported special entry at ${JSON.stringify(entry.path)}`);
}

function captureOnce(
  repository: string,
  visited: Set<string>,
  projection?: RepositoryObjectSurfaceEntry[],
): RepositoryObject {
  const headBefore = gitLine(repository, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(headBefore)) {
    throw new Error(`git returned an invalid HEAD commit: ${JSON.stringify(headBefore)}`);
  }
  const before = surfaceSnapshot(repository);
  const hash = createHash("sha256");
  field(hash, "domain", "mister-clean.repository-object.canonical.v1");
  field(hash, "record_type", RECORD_TYPE);
  field(hash, "schema_version", SCHEMA_VERSION);
  field(hash, "head_commit", headBefore);
  field(hash, "surface", SURFACE);
  field(hash, "entry_count", u64(BigInt(before.entries.length)));
  for (const entry of before.entries) hashEntry(hash, repository, entry, visited, projection);
  const sha256 = hash.digest("hex");

  const after = surfaceSnapshot(repository);
  const headAfter = gitLine(repository, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (headAfter !== headBefore || after.signature !== before.signature) {
    throw new Error("repository changed while its object identity was being captured");
  }
  return {
    record_type: RECORD_TYPE,
    schema_version: SCHEMA_VERSION,
    head_commit: headBefore,
    surface: SURFACE,
    entry_count: before.entries.length,
    sha256,
  };
}

function captureStable(
  root: string,
  visited: Set<string>,
  projection?: RepositoryObjectSurfaceEntry[],
): RepositoryObject {
  const requested = realpathSync(resolve(root));
  const rootStat = lstatSync(requested, { bigint: true });
  if (!rootStat.isDirectory()) throw new Error(`repository root is not a directory: ${requested}`);
  const topLevel = realpathSync(gitLine(requested, ["rev-parse", "--show-toplevel"]));
  if (topLevel !== requested) {
    throw new Error(`repository object root must be the Git worktree root: ${requested}`);
  }
  if (visited.has(requested)) throw new Error(`recursive gitlink traversal detected at ${requested}`);
  visited.add(requested);
  try {
    const first = captureOnce(requested, visited, projection);
    const second = captureOnce(requested, visited);
    if (first.sha256 !== second.sha256
      || first.head_commit !== second.head_commit
      || first.entry_count !== second.entry_count) {
      throw new Error("repository changed between object-identity verification passes");
    }
    return first;
  } finally {
    visited.delete(requested);
  }
}

/**
 * Capture a deterministic, content-addressed identity for the exact Git
 * worktree rooted at `root`. Git is queried with optional locks disabled; the
 * index and worktree are never refreshed or modified by this function.
 */
export function captureRepositoryObject(root: string): RepositoryObject {
  return captureStable(root, new Set<string>());
}

/**
 * Capture the same stable RepositoryObject together with a materialized view of
 * the exact worktree bytes consumed by its first verified hashing pass. The
 * second pass remains projection-free and must reproduce the same object before
 * any entries are returned.
 */
export function captureRepositoryObjectSurface(root: string): RepositoryObjectSurfaceCapture {
  const entries: RepositoryObjectSurfaceEntry[] = [];
  const repositoryObject = captureStable(root, new Set<string>(), entries);
  if (entries.length !== repositoryObject.entry_count) {
    throw new Error(
      `repository surface projection count mismatch: object=${String(repositoryObject.entry_count)} projection=${String(entries.length)}`,
    );
  }
  return { repository_object: repositoryObject, entries };
}
