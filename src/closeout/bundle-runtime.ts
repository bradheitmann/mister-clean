/**
 * Shared, side-effect-bounded runtime for closure-bundle validators.
 *
 * Domain validators import this module instead of reimplementing filesystem,
 * Git, reference loading, canonical comparison, or evidence-clock rules.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import { canonicalIdentity } from "./normalization.js";
import { isoTimestamp } from "./records.js";
import { nodeProcessPort, type ActionHygieneProcessPort } from "./action-hygiene.js";
import type { FileRuntimeAttestationBinding } from "../runtime-binding.js";

export type JsonObject = Record<string, unknown>;

export interface FilePort {
  readBytes(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  isFile(path: string): Promise<boolean>;
  realpath(path: string): Promise<string>;
  /** Repository mode preserves hygiene ignores; exact_package enumerates a shipped package without omissions. */
  walk(root: string, options?: { readonly mode?: "repository" | "exact_package" }): Promise<readonly FileObservation[]>;
}

export interface FileObservation {
  readonly absolute: string;
  readonly relative: string;
  readonly kind: "file" | "directory" | "symlink" | "other";
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
  /** Trusted adapter boundary; omitted only by deterministic legacy test ports. */
  readonly processes?: ActionHygieneProcessPort;
}

export interface BundleValidationOptions {
  /** Absolute path to the externally retained accepted-release record. */
  readonly acceptedEvaluatorPath?: string;
  /** Absolute path to the external closeout GUARD authority envelope. */
  readonly guardAuthorityPath?: string;
  readonly allowPlaceholders?: boolean;
  readonly maxFutureSkewMs?: number;
  readonly ports?: BundlePorts;
  readonly repoPath?: string;
  /** Live-verifier-minted identity of the CLI performing validation. */
  readonly runtimeAttestation?: FileRuntimeAttestationBinding;
  readonly validationTime?: Date;
  readonly verifyLive?: boolean;
}

export interface BundleValidationResult {
  readonly errors: readonly string[];
  readonly failureKind?: "load";
  readonly ok: boolean;
}

export interface EvidenceClock {
  readonly latestEventTimeMs: number;
  readonly latestEventTimeIso: string;
}

export const HEX64 = /^[0-9a-f]{64}$/;

const EVENT_TIMESTAMP_FIELDS = new Set([
  "acquired_at", "at", "finished_at", "generated_at", "measured_at",
  "manifest_observed_at", "minted_at", "mutation_observed_at", "observed_at", "opened_at",
  "recorded_at", "released_at", "started_at",
]);
const IGNORED_WALK = new Set([".git", "node_modules", "vendor", ".venv", "venv", "dist", "build", ".cache"]);
const execFileAsync = promisify(execFile);

export function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

export function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

export function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function identity(value: unknown): string {
  return canonicalIdentity(value);
}

export function owned(value: unknown): boolean {
  const normalized = identity(value);
  return normalized.length > 0 && !new Set([
    "unknown", "unowned", "unassigned", "none", "n/a", "na", "tbd", "not assigned", "not-assigned",
  ]).has(normalized);
}

export function iso(value: unknown): boolean {
  return isoTimestamp(value);
}

export function validateRepositoryObject(
  value: unknown,
  path: string,
  errors: string[],
  expectedSha256?: unknown,
): JsonObject | undefined {
  const record = requireObject(value, [
    "record_type", "schema_version", "head_commit", "surface", "entry_count", "sha256",
  ], path, errors);
  if (!record) return undefined;
  if (record.record_type !== "mister-clean.repository-object") {
    errors.push(`${path}.record_type: expected mister-clean.repository-object`);
  }
  if (record.schema_version !== "1.0") errors.push(`${path}.schema_version: expected 1.0`);
  if (typeof record.head_commit !== "string" || !/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(record.head_commit)) {
    errors.push(`${path}.head_commit: required full lowercase Git commit object id`);
  }
  if (record.surface !== "tracked_and_nonignored") {
    errors.push(`${path}.surface: expected tracked_and_nonignored`);
  }
  if (!Number.isSafeInteger(record.entry_count) || Number(record.entry_count) < 0) {
    errors.push(`${path}.entry_count: required nonnegative safe integer`);
  }
  if (typeof record.sha256 !== "string" || !HEX64.test(record.sha256)) {
    errors.push(`${path}.sha256: required lowercase SHA-256`);
  }
  if (expectedSha256 !== undefined && record.sha256 !== expectedSha256) {
    errors.push(`${path}.sha256: must equal the bound repository object`);
  }
  return record;
}

export function validateEvidenceClock(
  value: unknown,
  path: string,
  clock: EvidenceClock,
  errors: string[],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateEvidenceClock(entry, `${path}[${index}]`, clock, errors));
    return;
  }
  const item = object(value);
  if (!item) return;
  for (const [field, entry] of Object.entries(item)) {
    const entryPath = `${path}.${field}`;
    if (EVENT_TIMESTAMP_FIELDS.has(field) && iso(entry)
      && Date.parse(String(entry)) > clock.latestEventTimeMs) {
      errors.push(`${entryPath}: timestamp exceeds validation time plus max future skew (${clock.latestEventTimeIso})`);
    }
    validateEvidenceClock(entry, entryPath, clock, errors);
  }
}

export function evidenceClock(options: BundleValidationOptions, errors: string[]): EvidenceClock | undefined {
  const validationTime = options.validationTime ?? new Date();
  const validationTimeMs = validationTime instanceof Date ? validationTime.getTime() : Number.NaN;
  const maxFutureSkewMs = options.maxFutureSkewMs ?? 0;
  if (!Number.isFinite(validationTimeMs)) {
    errors.push("$.validation_options.validationTime: required valid Date");
  }
  if (!Number.isSafeInteger(maxFutureSkewMs) || maxFutureSkewMs < 0) {
    errors.push("$.validation_options.maxFutureSkewMs: required nonnegative safe integer");
  }
  if (!Number.isFinite(validationTimeMs) || !Number.isSafeInteger(maxFutureSkewMs)
    || maxFutureSkewMs < 0) return undefined;
  const latestEventTimeMs = validationTimeMs + maxFutureSkewMs;
  if (!Number.isFinite(latestEventTimeMs) || latestEventTimeMs > 8_640_000_000_000_000) {
    errors.push("$.validation_options: validation time plus max future skew exceeds the Date range");
    return undefined;
  }
  return { latestEventTimeMs, latestEventTimeIso: new Date(latestEventTimeMs).toISOString() };
}

export function executedText(value: unknown): boolean {
  if (!text(value)) return false;
  return !new Set(["not run", "not executed", "not measured", "claim", "anything", "pass"])
    .has(value.trim().split(/\s+/).join(" ").toLocaleLowerCase("und"));
}

export function posix(path: string): string {
  return path.split(sep).join("/");
}

export function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function stableEqual(left: unknown, right: unknown): boolean {
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

export function requireObject(value: unknown, keys: readonly string[], path: string, errors: string[]): JsonObject | undefined {
  const item = object(value);
  if (!item) {
    errors.push(`${path}: expected object`);
    return undefined;
  }
  for (const key of [...keys].sort()) if (!(key in item)) errors.push(`${path}.${key}: missing`);
  return item;
}

export function requireExactObject(
  value: unknown,
  keys: readonly string[],
  path: string,
  errors: string[],
): JsonObject | undefined {
  const item = requireObject(value, keys, path, errors);
  if (!item) return undefined;
  const allowed = new Set(keys);
  for (const key of Object.keys(item).sort(compareCodePoints)) {
    if (!allowed.has(key)) errors.push(`${path}.${key}: unexpected field`);
  }
  return item;
}

export const nodeFilePort: FilePort = {
  async readBytes(path) { return new Uint8Array(await readFile(path)); },
  async readText(path) { return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path)); },
  async exists(path) { try { await access(path); return true; } catch { return false; } },
  async isFile(path) { try { return (await lstat(path)).isFile(); } catch { return false; } },
  async realpath(path) { return realpath(path); },
  async walk(root, options = {}) {
    const rootPath = resolve(root);
    const rows: FileObservation[] = [];
    async function visit(directory: string): Promise<void> {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (options.mode !== "exact_package" && IGNORED_WALK.has(entry.name)) continue;
        const absolute = resolve(directory, entry.name);
        const rel = posix(relative(rootPath, absolute));
        if (entry.isSymbolicLink()) rows.push({ absolute, relative: rel, kind: "symlink" });
        else if (entry.isDirectory()) { rows.push({ absolute, relative: rel, kind: "directory" }); await visit(absolute); }
        else if (entry.isFile()) rows.push({ absolute, relative: rel, kind: "file" });
        else rows.push({ absolute, relative: rel, kind: "other" });
      }
    }
    await visit(rootPath);
    return rows.sort((a, b) => compareCodePoints(a.relative, b.relative));
  },
};

export const nodeGitPort: GitPort = {
  async run(repo, args, allowed = [0]) {
    try {
      const environment = { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" };
      let result: { readonly stdout: string; readonly stderr: string };
      if (args.length === 1 && args[0] === "write-tree") {
        const temporary = await mkdtemp(join(tmpdir(), "mc-readonly-index-"));
        try {
          const sourceIndex = (await execFileAsync("git", ["--no-optional-locks", "-C", repo, "rev-parse", "--path-format=absolute", "--git-path", "index"], { encoding: "utf8", env: environment })).stdout.trim();
          const sourceObjects = (await execFileAsync("git", ["--no-optional-locks", "-C", repo, "rev-parse", "--path-format=absolute", "--git-path", "objects"], { encoding: "utf8", env: environment })).stdout.trim();
          const externalIndex = join(temporary, "index");
          const externalObjects = join(temporary, "objects");
          await mkdir(externalObjects, { recursive: true });
          await copyFile(sourceIndex, externalIndex);
          result = await execFileAsync("git", ["--no-optional-locks", "-C", repo, "write-tree"], {
            encoding: "utf8",
            env: {
              ...environment,
              GIT_ALTERNATE_OBJECT_DIRECTORIES: sourceObjects,
              GIT_INDEX_FILE: externalIndex,
              GIT_OBJECT_DIRECTORY: externalObjects,
            },
          });
        } finally {
          await rm(temporary, { recursive: true, force: true });
        }
      } else {
        result = await execFileAsync("git", ["--no-optional-locks", "-C", repo, ...args], { encoding: "utf8", env: environment });
      }
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

export const nodeBundlePorts: BundlePorts = {
  files: nodeFilePort,
  git: nodeGitPort,
  processes: nodeProcessPort,
};

export async function contained(files: FilePort, root: string, candidate: unknown): Promise<string | undefined> {
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

export async function loadBytesRef(
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

export async function loadRef(
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

export async function evidenceRef(
  files: FilePort,
  base: string,
  ref: unknown,
  path: string,
  errors: string[],
  allowPlaceholders: boolean,
  clock: EvidenceClock | undefined,
  recordType?: string,
): Promise<JsonObject | undefined> {
  const loaded = await loadRef(files, base, ref, path, errors, allowPlaceholders);
  if (loaded.data && clock) validateEvidenceClock(loaded.data, path, clock, errors);
  if (loaded.data && recordType && loaded.data.record_type !== recordType) {
    errors.push(`${path}: expected evidence record_type ${recordType}`);
  }
  return loaded.data;
}
