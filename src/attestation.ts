import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
  realpath,
  stat,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  mintServerAttestationBinding,
  type FileRuntimeAttestationBinding,
} from "./runtime-binding.js";

export const RELEASE_ATTESTATION_FILE = "RELEASE_ATTESTATION.json";
export const RELEASE_ATTESTATION_RECORD_TYPE = "mister-clean.release-attestation";
export const RELEASE_ATTESTATION_SCHEMA_VERSION = "1.1";
export const RUNTIME_ATTESTATION_RECORD_TYPE = "mister-clean.runtime-attestation-binding";
export const RUNTIME_ATTESTATION_SCHEMA_VERSION = "1.0";
export const PACKAGE_MANIFEST_FORMAT = "sha256sum-v1-lf";

export const REQUIRED_ENTRYPOINT_PATHS = [
  "./SKILL.md",
  "./bin/mister-clean.js",
  "./dist/public.js",
  "./dist/stdio.js",
] as const;

const PACKAGE_MANIFEST_EXCLUDED_DIRS = new Set([
  ".git",
  ".wrangler",
  "__pycache__",
  "coverage",
  "node_modules",
]);

const PACKAGE_MANIFEST_EXCLUDED_FILES = new Set([
  "MANIFEST.sha256",
  RELEASE_ATTESTATION_FILE,
]);

const FORBIDDEN_ATTESTATION_KEYS = new Set([
  "dist",
  "integrity",
  "npm_integrity",
  "npm_shasum",
  "npm_shasum_sha1",
  "npm_tarball",
  "published_at",
  "registry",
  "shasum",
  "tarball",
  "tarball_integrity",
  "tarball_sha256",
  "url",
]);

export interface ManifestEntry {
  readonly path: string;
  readonly sha256: string;
}

export interface ManifestResult {
  readonly content: string;
  readonly entries: readonly ManifestEntry[];
  readonly exitCode: 0;
}

export interface ReleaseAttestation {
  readonly record_type: typeof RELEASE_ATTESTATION_RECORD_TYPE;
  readonly schema_version: typeof RELEASE_ATTESTATION_SCHEMA_VERSION;
  readonly package: {
    readonly name: string;
    readonly version: string;
  };
  readonly claimed_source: {
    readonly git_commit: string;
    readonly git_tag: string;
  };
  readonly claim_scope: {
    readonly covers: "own_package_regular_file_bytes";
    readonly excludes: readonly [
      "registry_publication_provenance",
      "dependency_resolution_graph",
      "filesystem_mode_bits_xattrs_and_timestamps",
      "release_attestation_self_bytes",
      "claimed_source_authenticity",
    ];
  };
  readonly manifest: {
    readonly path: "./MANIFEST.sha256";
    readonly format: typeof PACKAGE_MANIFEST_FORMAT;
    readonly entry_count: number;
    readonly sha256: string;
  };
  readonly required_entrypoints: readonly ManifestEntry[];
}

export type RuntimeAttestationBinding = FileRuntimeAttestationBinding;

export interface AttestationVerificationResult {
  readonly record_type: "mister-clean.release-attestation-result";
  readonly schema_version: "1.0";
  readonly status: "pass" | "fail";
  readonly package_root: string;
  readonly package_root_realpath: string;
  readonly errors: readonly string[];
  readonly package?: ReleaseAttestation["package"];
  readonly claimed_source?: ReleaseAttestation["claimed_source"];
  readonly claim_scope?: ReleaseAttestation["claim_scope"];
  readonly manifest?: ReleaseAttestation["manifest"] & {
    readonly observed_sha256: string;
    readonly observed_entry_count: number;
  };
  readonly required_entrypoints?: readonly ManifestEntry[];
}

export interface SourceConsistencyResult {
  readonly record_type: "mister-clean.release-source-consistency";
  readonly schema_version: "1.0";
  readonly status: "pass" | "fail";
  readonly package_root: string;
  readonly errors: readonly string[];
  readonly package?: ReleaseAttestation["package"];
  readonly source?: ReleaseAttestation["claimed_source"];
  readonly manifest?: ReleaseAttestation["manifest"];
}

interface WalkedPath {
  readonly absolute: string;
  readonly relative: string;
  readonly symlink: boolean;
}

interface PackageJson {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly files?: unknown;
}

interface NormalizedPackageJson {
  readonly name: string;
  readonly version: string;
  readonly files: readonly string[];
}

export class RuntimeAttestationError extends Error {
  constructor(readonly result: AttestationVerificationResult) {
    super(`Mister Clean runtime attestation failed: ${result.errors.join("; ")}`);
  }
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function packagePatternExpression(pattern: string): RegExp {
  const normalized = pattern.replace(/^\.\//, "").replace(/\/$/, "");
  let source = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index] as string;
    if (character === "*" && normalized[index + 1] === "*") {
      source += ".*";
      index += 1;
    } else if (character === "*") {
      source += "[^/]*";
    } else {
      source += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`, "u");
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(path: string): Promise<string> {
  return sha256(await readFile(path));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function walkFiles(root: string): Promise<WalkedPath[]> {
  const absoluteRoot = resolve(root);
  const files: WalkedPath[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (PACKAGE_MANIFEST_EXCLUDED_DIRS.has(entry.name)) continue;
      const absolute = resolve(directory, entry.name);
      const rel = toPosix(relative(absoluteRoot, absolute));
      if (entry.isSymbolicLink()) {
        files.push({ absolute, relative: rel, symlink: true });
      } else if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.push({ absolute, relative: rel, symlink: false });
      } else {
        throw new Error(`package surface rejects special filesystem entry: ${rel}`);
      }
    }
  }

  await visit(absoluteRoot);
  return files.sort((left, right) => compareCodePoints(left.relative, right.relative));
}

async function readPackageJson(root: string): Promise<NormalizedPackageJson> {
  const data = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as PackageJson;
  if (typeof data.name !== "string" || data.name.length === 0) throw new Error("package.json name is required");
  if (typeof data.version !== "string" || data.version.length === 0) throw new Error("package.json version is required");
  if (!Array.isArray(data.files) || data.files.some((entry) => typeof entry !== "string")) {
    throw new Error("package.json files must be an array of strings");
  }
  return { name: data.name, version: data.version, files: data.files as string[] };
}

export async function generateAttestedPackageManifest(root: string): Promise<ManifestResult> {
  const absoluteRoot = resolve(root);
  const packageData = await readPackageJson(absoluteRoot);
  const patterns = packageData.files
    .filter((entry): entry is string => !PACKAGE_MANIFEST_EXCLUDED_FILES.has(entry))
    .map(packagePatternExpression);
  const entries: ManifestEntry[] = [];
  const files = await walkFiles(absoluteRoot);

  for (const file of files) {
    if (PACKAGE_MANIFEST_EXCLUDED_FILES.has(file.relative)) continue;
    if (basename(file.relative).endsWith(".pyc") || basename(file.relative).endsWith(".skill")) continue;
    if (file.relative !== "package.json" && !patterns.some((pattern) => pattern.test(file.relative))) continue;
    if (file.symlink) throw new Error(`package manifest rejects symlinked package entry: ${file.relative}`);
    if (!(await stat(file.absolute)).isFile()) continue;
    entries.push({
      path: `./${file.relative}`,
      sha256: await sha256File(file.absolute),
    });
  }

  entries.sort((left, right) => compareCodePoints(left.path, right.path));
  return {
    entries,
    content: entries.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n") + (entries.length ? "\n" : ""),
    exitCode: 0,
  };
}

export function releaseAttestationBytes(attestation: ReleaseAttestation): string {
  return `${JSON.stringify(attestation, null, 2)}\n`;
}

export async function createReleaseAttestation(
  root: string,
  source: ReleaseAttestation["claimed_source"],
): Promise<ReleaseAttestation> {
  const absoluteRoot = resolve(root);
  const packageData = await readPackageJson(absoluteRoot);
  const expectedGitTag = `v${packageData.version}`;
  if (source.git_tag !== expectedGitTag) throw new Error(`source git_tag must equal ${expectedGitTag}`);
  const manifest = await generateAttestedPackageManifest(absoluteRoot);
  const entrypointByPath = new Map(manifest.entries.map((entry) => [entry.path, entry]));
  const required_entrypoints = REQUIRED_ENTRYPOINT_PATHS.map((path) => {
    const entry = entrypointByPath.get(path);
    if (!entry) throw new Error(`required entrypoint missing from package manifest: ${path}`);
    return entry;
  });

  return {
    record_type: RELEASE_ATTESTATION_RECORD_TYPE,
    schema_version: RELEASE_ATTESTATION_SCHEMA_VERSION,
    package: {
      name: packageData.name,
      version: packageData.version,
    },
    claimed_source: source,
    claim_scope: {
      covers: "own_package_regular_file_bytes",
      excludes: [
        "registry_publication_provenance",
        "dependency_resolution_graph",
        "filesystem_mode_bits_xattrs_and_timestamps",
        "release_attestation_self_bytes",
        "claimed_source_authenticity",
      ],
    },
    manifest: {
      path: "./MANIFEST.sha256",
      format: PACKAGE_MANIFEST_FORMAT,
      entry_count: manifest.entries.length,
      sha256: sha256(manifest.content),
    },
    required_entrypoints,
  };
}

function parseManifestEntries(content: string): readonly ManifestEntry[] {
  if (content.length === 0) return [];
  return content.trimEnd().split("\n").filter(Boolean).map((line) => {
    const [digest, path] = line.split("  ");
    return { path: path ?? "", sha256: digest ?? "" };
  });
}

function collectForbiddenKeys(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((entry, index) => collectForbiddenKeys(entry, `${path}[${index}]`));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(FORBIDDEN_ATTESTATION_KEYS.has(key) ? [`${path}.${key}`] : []),
    ...collectForbiddenKeys(child, `${path}.${key}`),
  ]);
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[],
): void {
  const allow = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allow.has(key)) errors.push(`${path}.${key}: unexpected field`);
  }
}

function validateAttestationShape(attestation: unknown): { errors: string[]; value?: ReleaseAttestation } {
  const errors: string[] = [];
  const forbidden = collectForbiddenKeys(attestation);
  for (const path of forbidden) errors.push(`${path}: registry/publish fact is forbidden in ${RELEASE_ATTESTATION_FILE}`);
  if (!isRecord(attestation)) return { errors: [...errors, "$: attestation root must be an object"] };
  rejectUnknownKeys(attestation, [
    "record_type", "schema_version", "package", "claimed_source", "claim_scope", "manifest", "required_entrypoints",
  ], "$", errors);
  if (attestation.record_type !== RELEASE_ATTESTATION_RECORD_TYPE) errors.push("$.record_type: expected mister-clean.release-attestation");
  if (attestation.schema_version !== RELEASE_ATTESTATION_SCHEMA_VERSION) errors.push("$.schema_version: expected 1.1");
  const packageData = isRecord(attestation.package) ? attestation.package : {};
  rejectUnknownKeys(packageData, ["name", "version"], "$.package", errors);
  if (typeof packageData.name !== "string" || !packageData.name) errors.push("$.package.name: required");
  if (typeof packageData.version !== "string" || !packageData.version) errors.push("$.package.version: required");
  const source = isRecord(attestation.claimed_source) ? attestation.claimed_source : {};
  rejectUnknownKeys(source, ["git_commit", "git_tag"], "$.claimed_source", errors);
  if (typeof source.git_commit !== "string" || !/^[0-9a-f]{40}$/.test(source.git_commit)) {
    errors.push("$.claimed_source.git_commit: required full 40-character lowercase commit");
  }
  if (typeof source.git_tag !== "string" || !source.git_tag) errors.push("$.claimed_source.git_tag: required");
  else if (typeof packageData.version === "string" && source.git_tag !== `v${packageData.version}`) {
    errors.push("$.claimed_source.git_tag: must equal v${package.version}");
  }
  const scope = isRecord(attestation.claim_scope) ? attestation.claim_scope : {};
  rejectUnknownKeys(scope, ["covers", "excludes"], "$.claim_scope", errors);
  if (scope.covers !== "own_package_regular_file_bytes") {
    errors.push("$.claim_scope.covers: expected own_package_regular_file_bytes");
  }
  const expectedExcludes = [
    "registry_publication_provenance",
    "dependency_resolution_graph",
    "filesystem_mode_bits_xattrs_and_timestamps",
    "release_attestation_self_bytes",
    "claimed_source_authenticity",
  ];
  if (!Array.isArray(scope.excludes) || JSON.stringify(scope.excludes) !== JSON.stringify(expectedExcludes)) {
    errors.push(`$.claim_scope.excludes: expected exactly ${expectedExcludes.join(", ")}`);
  }
  const manifest = isRecord(attestation.manifest) ? attestation.manifest : {};
  rejectUnknownKeys(manifest, ["path", "format", "entry_count", "sha256"], "$.manifest", errors);
  if (manifest.path !== "./MANIFEST.sha256") errors.push("$.manifest.path: expected ./MANIFEST.sha256");
  if (manifest.format !== PACKAGE_MANIFEST_FORMAT) errors.push("$.manifest.format: expected sha256sum-v1-lf");
  if (!Number.isInteger(manifest.entry_count) || Number(manifest.entry_count) < 0) errors.push("$.manifest.entry_count: required nonnegative integer");
  if (typeof manifest.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(manifest.sha256)) errors.push("$.manifest.sha256: required lowercase SHA-256");
  if (!Array.isArray(attestation.required_entrypoints)) errors.push("$.required_entrypoints: required array");
  else {
    const paths = attestation.required_entrypoints.map((entry) => isRecord(entry) ? entry.path : undefined);
    const sortedPaths = [...paths].sort();
    const expectedPaths = [...REQUIRED_ENTRYPOINT_PATHS].sort();
    if (JSON.stringify(sortedPaths) !== JSON.stringify(expectedPaths)) {
      errors.push(`$.required_entrypoints: expected exactly ${expectedPaths.join(", ")}`);
    }
    for (const [index, entry] of attestation.required_entrypoints.entries()) {
      if (!isRecord(entry)) {
        errors.push(`$.required_entrypoints[${index}]: must be an object`);
        continue;
      }
      rejectUnknownKeys(entry, ["path", "sha256"], `$.required_entrypoints[${index}]`, errors);
      if (typeof entry.path !== "string" || !entry.path.startsWith("./")) errors.push(`$.required_entrypoints[${index}].path: required package path`);
      if (typeof entry.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256)) errors.push(`$.required_entrypoints[${index}].sha256: required lowercase SHA-256`);
    }
  }
  return errors.length ? { errors } : { errors, value: attestation as unknown as ReleaseAttestation };
}

export async function verifyReleaseAttestation(
  root: string,
  options: { strict?: boolean; exactSurface?: boolean } = {},
): Promise<AttestationVerificationResult> {
  const packageRoot = resolve(root);
  const packageRootRealpath = await realpath(packageRoot).catch(() => packageRoot);
  const errors: string[] = [];
  let attestation: ReleaseAttestation | undefined;
  let packageData: Awaited<ReturnType<typeof readPackageJson>> | undefined;
  let manifestText = "";
  let observedManifest: ManifestResult | undefined;

  try {
    const parsed = JSON.parse(await readFile(join(packageRootRealpath, RELEASE_ATTESTATION_FILE), "utf8")) as unknown;
    const validated = validateAttestationShape(parsed);
    errors.push(...validated.errors);
    attestation = validated.value;
  } catch (error) {
    errors.push(`${RELEASE_ATTESTATION_FILE}: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    packageData = await readPackageJson(packageRootRealpath);
  } catch (error) {
    errors.push(`package.json: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    manifestText = await readFile(join(packageRootRealpath, "MANIFEST.sha256"), "utf8");
  } catch (error) {
    errors.push(`MANIFEST.sha256: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    observedManifest = await generateAttestedPackageManifest(packageRootRealpath);
    if (manifestText && manifestText !== observedManifest.content) {
      errors.push("MANIFEST.sha256: stale or not generated from attested package surface");
    }
  } catch (error) {
    errors.push(`package manifest: ${error instanceof Error ? error.message : String(error)}`);
  }

  const observedManifestEntries = parseManifestEntries(manifestText);
  const observedManifestHash = sha256(manifestText);
  if (attestation && packageData) {
    if (attestation.package.name !== packageData.name) errors.push("$.package.name: does not match package.json");
    if (attestation.package.version !== packageData.version) errors.push("$.package.version: does not match package.json");
  }
  if (attestation && manifestText) {
    if (attestation.manifest.sha256 !== observedManifestHash) errors.push("$.manifest.sha256: does not match MANIFEST.sha256 bytes");
    if (attestation.manifest.entry_count !== observedManifestEntries.length) errors.push("$.manifest.entry_count: does not match MANIFEST.sha256");
  }
  if (attestation && observedManifest) {
    const entryByPath = new Map(observedManifest.entries.map((entry) => [entry.path, entry.sha256]));
    for (const entrypoint of attestation.required_entrypoints) {
      if (entryByPath.get(entrypoint.path) !== entrypoint.sha256) {
        errors.push(`$.required_entrypoints[${entrypoint.path}]: does not match package bytes`);
      }
    }
  }
  const requireExactSurface = options.exactSurface ?? !existsSync(join(packageRootRealpath, ".git"));
  if (requireExactSurface && observedManifest) {
    const allowed = new Set([
      ...observedManifest.entries.map((entry) => entry.path.slice(2)),
      "MANIFEST.sha256",
      RELEASE_ATTESTATION_FILE,
    ]);
    try {
      const walked = await walkFiles(packageRootRealpath);
      for (const file of walked) {
        if (file.symlink) errors.push(`package surface: symlink is forbidden: ${file.relative}`);
        else if (!allowed.has(file.relative)) errors.push(`package surface: unexpected file: ${file.relative}`);
      }
    } catch (error) {
      errors.push(`package surface: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (options.strict && attestation && existsSync(join(packageRootRealpath, ".git"))) {
    const commit = runGit(packageRootRealpath, ["rev-parse", "HEAD"]);
    const tag = runGit(packageRootRealpath, ["tag", "--points-at", "HEAD", "--list", attestation.claimed_source.git_tag]);
    if (commit !== attestation.claimed_source.git_commit) errors.push("$.claimed_source.git_commit: does not match source HEAD");
    if (!tag) errors.push("$.claimed_source.git_tag: tag is not present at source HEAD");
    const dirty = releaseRelevantStatus(packageRootRealpath);
    if (dirty.length) errors.push(`source tree: dirty paths other than ${RELEASE_ATTESTATION_FILE}: ${dirty.join(", ")}`);
  }

  return {
    record_type: "mister-clean.release-attestation-result",
    schema_version: "1.0",
    status: errors.length ? "fail" : "pass",
    package_root: packageRoot,
    package_root_realpath: packageRootRealpath,
    errors,
    ...(attestation ? {
      package: attestation.package,
      claimed_source: attestation.claimed_source,
      claim_scope: attestation.claim_scope,
      manifest: {
        ...attestation.manifest,
        observed_sha256: observedManifestHash,
        observed_entry_count: observedManifestEntries.length,
      },
      required_entrypoints: attestation.required_entrypoints,
    } : {}),
  };
}

function runGit(root: string, args: readonly string[]): string {
  return execFileSync("git", ["--no-optional-locks", "-C", root, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function releaseRelevantStatus(root: string): string[] {
  const output = runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  return output.split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => {
      const path = line.slice(3);
      return path !== RELEASE_ATTESTATION_FILE;
    });
}

async function releaseInputErrors(
  root: string,
  commit: string,
  manifest: ManifestResult,
): Promise<string[]> {
  const errors: string[] = [];
  const inputPaths = new Set(manifest.entries
    .map((entry) => entry.path.slice(2))
    .filter((path) => !path.startsWith("dist/")));
  const walked = await walkFiles(root);
  const materialRoots = ["agents/", "assets/", "evals/", "examples/", "references/", "templates/"];
  const materialExtensions = new Set([".css", ".html", ".json", ".md", ".xml", ".yaml", ".yml"]);
  const localEvidenceAssets = new Set([
    "assets/codebase-state-dashboard/case-study-okgo.html",
    "assets/codebase-state-dashboard/model-scorecard-okgo.html",
    "assets/codebase-state-dashboard/okgo-case-study-state.json",
    "assets/codebase-state-dashboard/okgo-main-history.json",
    "assets/codebase-state-dashboard/okgo-model-scorecard.json",
  ]);
  const localEvidencePrefix = "assets/codebase-state-dashboard/receipts/";
  for (const file of walked) {
    if ((file.relative.startsWith("src/") && file.relative !== "src/generated-materials.ts")
      || file.relative.startsWith("scripts/")) {
      inputPaths.add(file.relative);
    }
    const material = file.relative === "SKILL.md"
      || (materialRoots.some((prefix) => file.relative.startsWith(prefix))
        && materialExtensions.has(extname(file.relative)));
    if (material && !localEvidenceAssets.has(file.relative) && !file.relative.startsWith(localEvidencePrefix)) {
      inputPaths.add(file.relative);
    }
  }
  for (const path of [
    "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "tsup.config.ts", "MANIFEST.sha256",
  ]) {
    if (existsSync(join(root, path))) inputPaths.add(path);
  }

  for (const path of [...inputPaths].sort(compareCodePoints)) {
    const absolute = join(root, path);
    const walkedFile = walked.find((candidate) => candidate.relative === path);
    if (walkedFile?.symlink) {
      errors.push(`release input: symlink is forbidden: ${path}`);
      continue;
    }
    let committed: Buffer;
    try {
      committed = execFileSync(
        "git",
        ["--no-optional-locks", "-C", root, "show", `${commit}:${path}`],
        {
          encoding: "buffer",
          env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
          maxBuffer: 256 * 1024 * 1024,
          stdio: ["ignore", "pipe", "ignore"],
        },
      );
    } catch {
      errors.push(`release input: must be tracked at ${commit}: ${path}`);
      continue;
    }
    const current = await readFile(absolute);
    if (sha256(current) !== sha256(committed)) {
      errors.push(`release input: working bytes differ from ${commit}: ${path}`);
    }
  }
  return errors;
}

export async function checkReleaseSourceConsistency(root: string): Promise<SourceConsistencyResult> {
  const packageRoot = resolve(root);
  const errors: string[] = [];
  let packageData: Awaited<ReturnType<typeof readPackageJson>> | undefined;
  let source: ReleaseAttestation["claimed_source"] | undefined;
  let manifest: ReleaseAttestation["manifest"] | undefined;

  try {
    packageData = await readPackageJson(packageRoot);
    const expectedTag = `v${packageData.version}`;
    const commit = runGit(packageRoot, ["rev-parse", "HEAD"]);
    const tag = runGit(packageRoot, ["tag", "--points-at", "HEAD", "--list", expectedTag]);
    source = { git_commit: commit, git_tag: expectedTag };
    if (!tag) errors.push(`source tag: HEAD must be tagged ${expectedTag}`);
    const dirty = releaseRelevantStatus(packageRoot);
    if (dirty.length) errors.push(`source tree: dirty paths other than ${RELEASE_ATTESTATION_FILE}: ${dirty.join(", ")}`);
    const manifestText = await readFile(join(packageRoot, "MANIFEST.sha256"), "utf8");
    const observedManifest = await generateAttestedPackageManifest(packageRoot);
    if (manifestText !== observedManifest.content) errors.push("MANIFEST.sha256: stale or not generated from attested package surface");
    errors.push(...await releaseInputErrors(packageRoot, commit, observedManifest));
    manifest = {
      path: "./MANIFEST.sha256",
      format: PACKAGE_MANIFEST_FORMAT,
      entry_count: observedManifest.entries.length,
      sha256: sha256(observedManifest.content),
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return {
    record_type: "mister-clean.release-source-consistency",
    schema_version: "1.0",
    status: errors.length ? "fail" : "pass",
    package_root: packageRoot,
    errors,
    ...(packageData ? { package: { name: packageData.name, version: packageData.version } } : {}),
    ...(source ? { source } : {}),
    ...(manifest ? { manifest } : {}),
  };
}

export async function bindRuntimeAttestation(
  root: string,
  options: {
    moduleUrl: string;
    expectedEntrypoint: (typeof REQUIRED_ENTRYPOINT_PATHS)[number];
    allowSourceDevelopment?: boolean;
    sourceDevelopmentReason?: string;
  },
): Promise<RuntimeAttestationBinding> {
  const packageRoot = resolve(root);
  const packageRootRealpath = await realpath(packageRoot).catch(() => packageRoot);
  const modulePath = fileURLToPath(options.moduleUrl);
  const moduleStat = await lstat(modulePath);
  if (moduleStat.isSymbolicLink() || !moduleStat.isFile()) {
    throw new Error(`runtime entrypoint must be a regular non-symlink file: ${modulePath}`);
  }
  const moduleRealpath = await realpath(modulePath);
  const moduleRelation = toPosix(relative(packageRootRealpath, moduleRealpath));
  if (!moduleRelation || moduleRelation === ".." || moduleRelation.startsWith("../") || isAbsolute(moduleRelation)) {
    throw new Error(`runtime entrypoint escapes package root: ${moduleRealpath}`);
  }
  const entrypoint = {
    path: `./${moduleRelation}`,
    realpath: moduleRealpath,
    sha256: await sha256File(moduleRealpath),
  };
  if (options.allowSourceDevelopment) {
    if (!moduleRelation.startsWith("src/")) {
      throw new Error("source-development binding requires an entrypoint under src/");
    }
    if (!existsSync(join(packageRootRealpath, ".git"))) {
      throw new Error("source-development binding requires a verified Git repository root");
    }
    const gitRoot = await realpath(runGit(packageRootRealpath, ["rev-parse", "--show-toplevel"]));
    if (gitRoot !== packageRootRealpath) {
      throw new Error("source-development binding root does not match the Git repository root");
    }
    return mintServerAttestationBinding({
      record_type: RUNTIME_ATTESTATION_RECORD_TYPE,
      schema_version: RUNTIME_ATTESTATION_SCHEMA_VERSION,
      status: "source_development",
      package_root: packageRoot,
      package_root_realpath: packageRootRealpath,
      entrypoint,
      reason: options.sourceDevelopmentReason ?? "explicit source-development execution",
    });
  }

  if (entrypoint.path !== options.expectedEntrypoint) {
    throw new Error(`runtime entrypoint mismatch: expected ${options.expectedEntrypoint}, observed ${entrypoint.path}`);
  }
  const result = await verifyReleaseAttestation(packageRootRealpath, { exactSurface: true });
  if (result.status !== "pass") throw new RuntimeAttestationError(result);
  const expectedDigest = result.required_entrypoints
    ?.find((candidate) => candidate.path === options.expectedEntrypoint)?.sha256;
  if (!expectedDigest || expectedDigest !== entrypoint.sha256) {
    throw new Error(`runtime entrypoint digest does not match attested ${options.expectedEntrypoint}`);
  }
  return mintServerAttestationBinding({
    record_type: RUNTIME_ATTESTATION_RECORD_TYPE,
    schema_version: RUNTIME_ATTESTATION_SCHEMA_VERSION,
    status: "pass",
    package_root: packageRoot,
    package_root_realpath: packageRootRealpath,
    entrypoint,
    ...(result.package ? { package: result.package } : {}),
    ...(result.claimed_source ? { claimed_source: result.claimed_source } : {}),
    ...(result.claim_scope ? { claim_scope: result.claim_scope } : {}),
    ...(result.manifest ? {
      manifest: {
        path: result.manifest.path,
        format: result.manifest.format,
        entry_count: result.manifest.entry_count,
        sha256: result.manifest.sha256,
      },
    } : {}),
  });
}

export function isSourceDevelopmentEntrypoint(root: string, moduleUrl: string): boolean {
  try {
    const modulePath = fileURLToPath(moduleUrl);
    const relation = toPosix(relative(resolve(root), resolve(modulePath)));
    return relation.startsWith("src/") && !isAbsolute(relation);
  } catch {
    return false;
  }
}

export async function rootForModule(moduleUrl: string): Promise<string> {
  const modulePath = fileURLToPath(moduleUrl);
  let current = dirname(modulePath);
  while (current !== dirname(current)) {
    if (existsSync(join(current, "assets", "closure-bundle.json"))) return current;
    current = dirname(current);
  }
  throw new Error("Cannot locate Mister Clean package assets");
}

export async function assertPackageSurfaceIsRegular(root: string): Promise<void> {
  const manifest = await generateAttestedPackageManifest(root);
  await Promise.all(manifest.entries.map(async (entry) => {
    const target = join(root, entry.path.slice(2));
    if ((await lstat(target)).isSymbolicLink()) throw new Error(`package manifest rejects symlinked package entry: ${entry.path.slice(2)}`);
  }));
}
