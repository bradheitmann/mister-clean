import { constants, type Stats } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const FILE_CENSUS_ALGORITHM_ID = "mister-clean.file-census.sha256-path-stream";
export const FILE_CENSUS_ALGORITHM_VERSION = "1.0";

export interface FileCensusEntry {
  readonly path: string;
  readonly byte_length: number;
  readonly sha256: string;
}

export interface FileCensusScope {
  readonly roots: readonly string[];
  readonly recursive: true;
  readonly direct_files: "included";
  readonly entry_kind: "regular_file";
  readonly symlinks: "reject";
  readonly special_files: "reject";
  readonly exclusions: readonly string[];
}

export interface FileCensusSummary {
  readonly file_count: number;
  readonly direct_file_count: number;
  readonly nested_file_count: number;
  readonly total_bytes: number;
  readonly aggregate_sha256: string;
}

export interface FileCensus {
  readonly record_type: "mister-clean.file-census";
  readonly schema_version: "1.0";
  readonly algorithm_id: typeof FILE_CENSUS_ALGORITHM_ID;
  readonly algorithm_version: typeof FILE_CENSUS_ALGORITHM_VERSION;
  readonly scope: FileCensusScope;
  readonly summary: FileCensusSummary;
  readonly entries: readonly FileCensusEntry[];
}

export type FileCensusComparison =
  | { readonly status: "present"; readonly before: FileCensus; readonly after: FileCensus }
  | { readonly status: "absent"; readonly census: FileCensus }
  | { readonly status: "algorithm_mismatch" | "scope_mismatch" | "invalid_summary"; readonly detail: string }
  | { readonly status: "unestablished"; readonly detail: string };

export interface CaptureFileCensusOptions {
  readonly repository_root: string;
  readonly roots: readonly string[];
  readonly exclusions?: readonly string[];
  /** A sidecar may be named here so a caller cannot accidentally measure its own output. */
  readonly output_path?: string;
  /** Deterministic test seam; production callers leave this absent. */
  readonly test_hooks?: {
    readonly between_stability_passes?: () => void | Promise<void>;
  };
}

interface CapturedPass {
  readonly entries: readonly FileCensusEntry[];
  readonly direct: ReadonlySet<string>;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function portablePath(path: string): string {
  return path.split(sep).join("/");
}

function validateRelativePath(path: string, label: string): void {
  if (!path || isAbsolute(path) || path.includes("\\") || /[\u0000-\u001f\u007f]/u.test(path)) {
    throw new Error(`${label}: expected a nonempty portable repository-relative path without control characters`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`${label}: empty, '.' and '..' path segments are forbidden`);
  }
}

function isInside(root: string, candidate: string): boolean {
  const relation = relative(root, candidate);
  return relation === "" || (!isAbsolute(relation) && relation !== ".." && !relation.startsWith(`..${sep}`));
}

function fingerprint(value: Stats): string {
  return [value.dev, value.ino, value.mode, value.size, value.mtimeMs, value.ctimeMs].join(":");
}

async function readStableRegularFile(path: string): Promise<Uint8Array> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Error(`census rejects non-regular entry: ${path}`);
    const bytes = new Uint8Array(await handle.readFile());
    const after = await handle.stat();
    if (fingerprint(before) !== fingerprint(after) || after.size !== bytes.byteLength) {
      throw new Error(`file changed while census was reading it: ${path}`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

function excluded(path: string, exclusions: ReadonlySet<string>): boolean {
  return [...exclusions].some((root) => path === root || path.startsWith(`${root}/`));
}

function withinPortableRoot(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function overlappingRoots(roots: readonly string[]): boolean {
  return roots.some((root, index) => roots.some((other, otherIndex) => (
    index !== otherIndex && withinPortableRoot(root, other)
  )));
}

async function capturePass(
  repositoryRoot: string,
  roots: readonly string[],
  exclusions: ReadonlySet<string>,
): Promise<CapturedPass> {
  const entries: FileCensusEntry[] = [];
  const direct = new Set<string>();
  const seen = new Set<string>();

  async function captureFile(absolute: string, isDirect: boolean): Promise<void> {
    const path = portablePath(relative(repositoryRoot, absolute));
    validateRelativePath(path, "census entry");
    if (excluded(path, exclusions)) return;
    if (seen.has(path)) throw new Error(`overlapping census roots produced duplicate entry: ${path}`);
    const bytes = await readStableRegularFile(absolute);
    seen.add(path);
    if (isDirect) direct.add(path);
    entries.push({ path, byte_length: bytes.byteLength, sha256: sha256(bytes) });
  }

  async function visit(directory: string, rootDirectory: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => compareCodePoints(left.name, right.name));
    for (const child of children) {
      const absolute = resolve(directory, child.name);
      const path = portablePath(relative(repositoryRoot, absolute));
      validateRelativePath(path, "census entry");
      if (excluded(path, exclusions)) continue;
      if (child.isSymbolicLink()) throw new Error(`census rejects symbolic link: ${path}`);
      if (child.isDirectory()) await visit(absolute, rootDirectory);
      else if (child.isFile()) await captureFile(absolute, directory === rootDirectory);
      else throw new Error(`census rejects special filesystem entry: ${path}`);
    }
  }

  for (const root of roots) {
    validateRelativePath(root, "census root");
    const absolute = resolve(repositoryRoot, ...root.split("/"));
    if (!isInside(repositoryRoot, absolute)) throw new Error(`census root escapes repository: ${root}`);
    const canonical = await realpath(absolute);
    if (canonical !== absolute || !isInside(repositoryRoot, canonical)) {
      throw new Error(`census root resolves through a symbolic-link path: ${root}`);
    }
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`census rejects symbolic-link root: ${root}`);
    if (info.isFile()) await captureFile(absolute, true);
    else if (info.isDirectory()) await visit(absolute, absolute);
    else throw new Error(`census rejects special root: ${root}`);
  }

  entries.sort((left, right) => compareCodePoints(left.path, right.path));
  return { entries, direct };
}

function sameEntries(left: readonly FileCensusEntry[], right: readonly FileCensusEntry[]): boolean {
  return left.length === right.length && left.every((entry, index) => {
    const other = right[index];
    return other !== undefined
      && entry.path === other.path
      && entry.byte_length === other.byte_length
      && entry.sha256 === other.sha256;
  });
}

function aggregate(entries: readonly FileCensusEntry[]): string {
  return sha256(entries.map((entry) => `${entry.sha256}  ${entry.path}\n`).join(""));
}

/**
 * Capture twice so enumeration races fail closed. Files are opened with O_NOFOLLOW
 * and fingerprinted before and after their bytes are read.
 */
export async function captureFileCensus(options: CaptureFileCensusOptions): Promise<FileCensus> {
  const repositoryRoot = await realpath(resolve(options.repository_root));
  const roots = [...new Set(options.roots)].sort(compareCodePoints);
  if (roots.length === 0) throw new Error("census requires at least one measured root");
  if (roots.length !== options.roots.length) throw new Error("census roots must be unique");
  if (overlappingRoots(roots)) throw new Error("census roots must not overlap");
  const exclusions = [...new Set(options.exclusions ?? [])].sort(compareCodePoints);
  for (const exclusion of exclusions) {
    validateRelativePath(exclusion, "census exclusion");
    if (!roots.some((root) => withinPortableRoot(root, exclusion))) {
      throw new Error(`census exclusion is outside every measured root: ${exclusion}`);
    }
  }
  if (options.output_path) {
    const output = resolve(await realpath(dirname(resolve(options.output_path))), basename(options.output_path));
    for (const root of roots) {
      const measured = resolve(repositoryRoot, ...root.split("/"));
      if (isInside(measured, output)) throw new Error("census sidecar must be outside every measured root");
    }
  }
  const first = await capturePass(repositoryRoot, roots, new Set(exclusions));
  await options.test_hooks?.between_stability_passes?.();
  const second = await capturePass(repositoryRoot, roots, new Set(exclusions));
  if (!sameEntries(first.entries, second.entries)
    || first.direct.size !== second.direct.size
    || [...first.direct].some((path) => !second.direct.has(path))) {
    throw new Error("census scope changed between stability passes");
  }
  const directFileCount = first.direct.size;
  const summary: FileCensusSummary = {
    file_count: first.entries.length,
    direct_file_count: directFileCount,
    nested_file_count: first.entries.length - directFileCount,
    total_bytes: first.entries.reduce((total, entry) => total + entry.byte_length, 0),
    aggregate_sha256: aggregate(first.entries),
  };
  return {
    record_type: "mister-clean.file-census",
    schema_version: "1.0",
    algorithm_id: FILE_CENSUS_ALGORITHM_ID,
    algorithm_version: FILE_CENSUS_ALGORITHM_VERSION,
    scope: {
      roots,
      recursive: true,
      direct_files: "included",
      entry_kind: "regular_file",
      symlinks: "reject",
      special_files: "reject",
      exclusions,
    },
    summary,
    entries: first.entries,
  };
}

export function validateFileCensus(census: FileCensus): readonly string[] {
  const errors: string[] = [];
  if (census.record_type !== "mister-clean.file-census" || census.schema_version !== "1.0") errors.push("record identity: expected mister-clean.file-census 1.0");
  if (census.algorithm_id !== FILE_CENSUS_ALGORITHM_ID || census.algorithm_version !== FILE_CENSUS_ALGORITHM_VERSION) errors.push("algorithm identity: unsupported file census algorithm");
  if (!census.scope || census.scope.recursive !== true || census.scope.direct_files !== "included"
    || census.scope.entry_kind !== "regular_file" || census.scope.symlinks !== "reject"
    || census.scope.special_files !== "reject") errors.push("scope: canonical regular-file recursion policy is required");
  const roots = census.scope?.roots ?? [];
  const exclusions = census.scope?.exclusions ?? [];
  if (roots.length === 0) errors.push("scope.roots: at least one measured root is required");
  for (const [index, root] of roots.entries()) {
    try { validateRelativePath(root, `scope.roots[${index}]`); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  for (const [index, exclusion] of exclusions.entries()) {
    try { validateRelativePath(exclusion, `scope.exclusions[${index}]`); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  }
  if (new Set(roots).size !== roots.length || roots.some((root, index) => root !== [...roots].sort(compareCodePoints)[index])) errors.push("scope.roots: must be unique and sorted");
  if (overlappingRoots(roots)) errors.push("scope.roots: measured roots must not overlap");
  if (new Set(exclusions).size !== exclusions.length || exclusions.some((item, index) => item !== [...exclusions].sort(compareCodePoints)[index])) errors.push("scope.exclusions: must be unique and sorted");
  for (const [index, exclusion] of exclusions.entries()) {
    if (!roots.some((root) => withinPortableRoot(root, exclusion))) {
      errors.push(`scope.exclusions[${index}]: outside every measured root`);
    }
  }
  const paths = census.entries.map((entry) => entry.path);
  for (const [index, entry] of census.entries.entries()) {
    try { validateRelativePath(entry.path, `entries[${index}].path`); } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    if (!Number.isSafeInteger(entry.byte_length) || entry.byte_length < 0) errors.push(`entries[${index}].byte_length: expected nonnegative safe integer`);
    if (!/^[0-9a-f]{64}$/u.test(entry.sha256)) errors.push(`entries[${index}].sha256: expected lowercase SHA-256`);
    if (!roots.some((root) => withinPortableRoot(root, entry.path))) errors.push(`entries[${index}].path: outside every measured root`);
    if (excluded(entry.path, new Set(exclusions))) errors.push(`entries[${index}].path: excluded by census scope`);
  }
  if (new Set(paths).size !== paths.length) errors.push("entries: paths must be unique");
  if (paths.some((path, index) => path !== [...paths].sort(compareCodePoints)[index])) errors.push("entries: paths must use raw code-point order");
  if (census.summary.file_count !== census.entries.length) errors.push("summary.file_count disagrees with entries");
  if (census.summary.direct_file_count + census.summary.nested_file_count !== census.summary.file_count) errors.push("summary direct+nested must equal file_count");
  const direct = census.entries.filter((entry) => roots.some((root) => entry.path === root
    || (entry.path.startsWith(`${root}/`) && !entry.path.slice(root.length + 1).includes("/")))).length;
  if (census.summary.direct_file_count !== direct) errors.push("summary.direct_file_count disagrees with scope roots");
  if (census.summary.nested_file_count !== census.entries.length - direct) errors.push("summary.nested_file_count disagrees with scope roots");
  const bytes = census.entries.reduce((total, entry) => total + entry.byte_length, 0);
  if (census.summary.total_bytes !== bytes) errors.push("summary.total_bytes disagrees with entries");
  if (census.summary.aggregate_sha256 !== aggregate(census.entries)) errors.push("summary.aggregate_sha256 disagrees with entries");
  return errors;
}

export function compareFileCensuses(before: FileCensus, after: FileCensus): FileCensusComparison {
  const beforeErrors = validateFileCensus(before);
  const afterErrors = validateFileCensus(after);
  if (beforeErrors.length || afterErrors.length) {
    return { status: "invalid_summary", detail: [...beforeErrors, ...afterErrors].join("; ") };
  }
  if (before.algorithm_id !== after.algorithm_id || before.algorithm_version !== after.algorithm_version) {
    return { status: "algorithm_mismatch", detail: "censuses use different measurement algorithms" };
  }
  if (JSON.stringify(before.scope) !== JSON.stringify(after.scope)) {
    return { status: "scope_mismatch", detail: "censuses measure different roots or entry policies" };
  }
  if (sameEntries(before.entries, after.entries)) return { status: "absent", census: after };
  return { status: "present", before, after };
}
