/** Atomic bundle storage, digest-bound evidence, and lifecycle lock custody. */
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { validateBundleFile } from "./bundle.js";
import type { ActionHygieneSnapshot } from "./action-hygiene.js";
import { sha256File } from "./repository.js";
import type { FileRuntimeAttestationBinding } from "../runtime-binding.js";

export type JsonObject = Record<string, unknown>;

export const HEX64 = /^[0-9a-f]{64}$/;

export interface BundleContext {
  readonly base: string;
  readonly bundlePath: string;
  readonly reportPath: string;
  readonly manifestPath: string;
  readonly regressionPath: string;
  readonly repository: string;
  readonly bundle: JsonObject;
  readonly report: JsonObject;
  readonly manifest: JsonObject;
  readonly regression: JsonObject;
}

export function object(value: unknown, path: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected object`);
  return value as JsonObject;
}

export function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path}: expected array`);
  return value;
}

export function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path}: required nonempty string`);
  return value;
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as JsonObject;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function equal(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

export function frozenDetectorPolicyEqual(left: unknown, right: unknown): boolean {
  const normalize = (value: unknown): JsonObject => {
    const policy = clone(object(value, "detector run policy"));
    const publicSafety = object(policy.public_safety, "detector run policy public_safety");
    // This count is an observation of the compared repository object, not a
    // permission to add/remove a detector or narrow its scope.
    publicSafety.tracked_path_count = "object-relative";
    return policy;
  };
  return equal(normalize(left), normalize(right));
}

export function jsonBytes(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function digestBytes(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function readJson(path: string): JsonObject {
  return object(JSON.parse(readFileSync(path, "utf8")), path);
}

export function portablePath(base: string, absolute: string): string {
  return relative(base, absolute).split(sep).join("/");
}

export function resolveContained(base: string, candidate: unknown, label: string): string {
  const path = text(candidate, label);
  if (isAbsolute(path) || path.split(/[\\/]/).includes("..")) throw new Error(`${label}: must be bundle-relative`);
  const absolute = resolve(base, path);
  const relation = relative(base, absolute);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error(`${label}: resolves outside the bundle directory`);
  }
  return absolute;
}

export function digestRef(base: string, path: string): JsonObject {
  const absolute = resolveContained(base, path, "evidence path");
  return { path, sha256: sha256File(absolute) };
}

export function writeEvidenceRecord(context: BundleContext, path: string, record: JsonObject): JsonObject {
  const absolute = resolveContained(context.base, path, "action evidence path");
  mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 });
  writeFileSync(absolute, jsonBytes(record), { encoding: "utf8", mode: 0o600, flag: "wx" });
  return digestRef(context.base, path);
}

export function readBoundEvidenceRecord(context: BundleContext, rawRef: unknown, label: string): JsonObject {
  const ref = object(rawRef, label);
  const path = text(ref.path, `${label}.path`);
  const expected = text(ref.sha256, `${label}.sha256`);
  if (!HEX64.test(expected)) throw new Error(`${label}.sha256: required lowercase SHA-256`);
  const absolute = resolveContained(context.base, path, `${label}.path`);
  const actual = sha256File(absolute);
  if (actual !== expected) throw new Error(`${label}.sha256: digest mismatch`);
  return readJson(absolute);
}

export function readActionHygieneSnapshot(context: BundleContext, rawRef: unknown, label: string): ActionHygieneSnapshot {
  return readBoundEvidenceRecord(context, rawRef, label) as unknown as ActionHygieneSnapshot;
}

export function inferRepository(bundle: JsonObject, report: JsonObject): string {
  const readiness = object(bundle.successor_readiness, "$.successor_readiness");
  const topology = object(readiness.topology, "$.successor_readiness.topology");
  const worktrees = array(topology.worktrees, "$.successor_readiness.topology.worktrees").map((raw, index) => (
    object(raw, `$.successor_readiness.topology.worktrees[${index}]`)
  ));
  const repo = object(report.repo, "$.report.repo");
  const branch = repo.branch === "detached" ? "detached" : `refs/heads/${String(repo.branch)}`;
  const matching = worktrees.filter((row) => row.head === repo.commit && row.branch === branch);
  const candidates = matching.length === 1 ? matching : worktrees.filter((row) => row.head === repo.commit);
  if (candidates.length !== 1) {
    throw new Error(`cannot infer one live worktree from the bundle (found ${candidates.length}); prepare a bundle with an unambiguous current worktree`);
  }
  const path = realpathSync(resolve(text(candidates[0]?.path, "$.successor_readiness.topology.worktrees[].path")));
  if (!statSync(path).isDirectory()) throw new Error(`bundle worktree is not a directory: ${path}`);
  return path;
}

export function loadContext(bundleDirectory: string): BundleContext {
  const base = realpathSync(resolve(bundleDirectory));
  if (!statSync(base).isDirectory()) throw new Error(`bundle directory is not a directory: ${base}`);
  const bundlePath = join(base, "closure-bundle.json");
  const bundle = readJson(bundlePath);
  const reportRef = object(bundle.report, "$.report");
  const manifestRef = object(bundle.manifest, "$.manifest");
  const reportPath = resolveContained(base, reportRef.path, "$.report.path");
  const manifestPath = resolveContained(base, manifestRef.path, "$.manifest.path");
  const report = readJson(reportPath);
  const manifest = readJson(manifestPath);
  const regressionRef = object(object(report.regression_control, "$.report.regression_control").evidence_ref, "$.report.regression_control.evidence_ref");
  const regressionPath = resolveContained(base, regressionRef.path, "$.report.regression_control.evidence_ref.path");
  return {
    base,
    bundlePath,
    reportPath,
    manifestPath,
    regressionPath,
    repository: inferRepository(bundle, report),
    bundle,
    report,
    manifest,
    regression: readJson(regressionPath),
  };
}

export async function requireValidBundle(
  context: BundleContext,
  runtimeAttestation: FileRuntimeAttestationBinding,
  verifyLive: boolean,
): Promise<void> {
  const result = await validateBundleFile(context.bundlePath, {
    verifyLive,
    runtimeAttestation,
    ...(verifyLive ? { repoPath: context.repository } : {}),
  });
  if (!result.ok) throw new Error(`bundle validation failed:\n${result.errors.join("\n")}`);
}

export function lockPath(context: BundleContext): string {
  return join(context.base, ".mister-clean-action.lock.json");
}

export function lifecyclePath(context: BundleContext, id: string): string {
  return join(context.base, "action-evidence", id, "lifecycle.json");
}

export function writeExclusive(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const descriptor = openSync(path, "wx", 0o600);
  try {
    writeFileSync(descriptor, jsonBytes(value), "utf8");
  } finally {
    closeSync(descriptor);
  }
}

export function replaceJson(path: string, value: unknown): void {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temporary, jsonBytes(value), { encoding: "utf8", mode: 0o600, flag: "wx" });
  renameSync(temporary, path);
}

export async function transactionalWrite(
  context: BundleContext,
  values: {
    readonly report: JsonObject;
    readonly manifest: JsonObject;
    readonly regression?: JsonObject;
    readonly bundle: JsonObject;
    readonly sidecars?: readonly { readonly path: string; readonly value: JsonObject }[];
  },
  runtimeAttestation: FileRuntimeAttestationBinding,
): Promise<void> {
  const sidecars = values.sidecars ?? [];
  const paths = [
    context.reportPath,
    context.manifestPath,
    context.bundlePath,
    ...(values.regression ? [context.regressionPath] : []),
    ...sidecars.map((sidecar) => sidecar.path),
  ];
  if (new Set(paths).size !== paths.length) throw new Error("action transaction contains a duplicate output path");
  const backupDirectory = join(context.base, `.action-transaction-${randomUUID()}`);
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  for (const path of paths) {
    resolveContained(context.base, portablePath(context.base, path), "action transaction output");
    copyFileSync(path, join(backupDirectory, portablePath(context.base, path).replaceAll("/", "__")));
  }
  try {
    if (values.regression) replaceJson(context.regressionPath, values.regression);
    replaceJson(context.reportPath, values.report);
    replaceJson(context.manifestPath, values.manifest);
    for (const sidecar of sidecars) replaceJson(sidecar.path, sidecar.value);
    replaceJson(context.bundlePath, values.bundle);
    const candidate = loadContext(context.base);
    await requireValidBundle(candidate, runtimeAttestation, true);
  } catch (error) {
    for (const path of paths) {
      const backup = join(backupDirectory, portablePath(context.base, path).replaceAll("/", "__"));
      const restore = `${path}.restore-${randomUUID()}`;
      copyFileSync(backup, restore);
      renameSync(restore, path);
    }
    throw error;
  } finally {
    rmSync(backupDirectory, { recursive: true, force: true });
  }
}

export function rehashBundle(bundle: JsonObject, report: JsonObject, manifest: JsonObject, base: string): JsonObject {
  const next = clone(bundle);
  const reportRef = object(next.report, "$.report");
  const manifestRef = object(next.manifest, "$.manifest");
  reportRef.sha256 = digestBytes(jsonBytes(report));
  manifestRef.sha256 = digestBytes(jsonBytes(manifest));
  // Paths are intentionally retained; action lifecycle never relocates the
  // canonical report or manifest.
  resolveContained(base, reportRef.path, "$.report.path");
  resolveContained(base, manifestRef.path, "$.manifest.path");
  return next;
}
