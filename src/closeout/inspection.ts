/**
 * Repository inspection primitives used by the closeout CLI.
 *
 * These functions deliberately return exit-relevant state instead of printing
 * or terminating a process.  The CLI owns presentation; callers can preserve
 * an unknown stack or public-safety failure in a closeout record.
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, readlinkSync } from "node:fs";
import {
  readFile,
  readdir,
  readlink,
  stat,
} from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";

import { generateAttestedPackageManifest } from "../attestation.js";
import { foldCase } from "./normalization.js";

export const STACK_MARKERS = {
  node: ["package.json"],
  "node-bun": ["bun.lock", "bun.lockb"],
  "node-pnpm": ["pnpm-lock.yaml", "pnpm-workspace.yaml"],
  "node-npm": ["package-lock.json"],
  "node-yarn": ["yarn.lock"],
  typescript: ["tsconfig.json"],
  python: ["pyproject.toml", "setup.py", "requirements.txt", "Pipfile"],
  rust: ["Cargo.toml"],
  go: ["go.mod"],
  docker: ["Dockerfile", "docker-compose.yml", "compose.yaml"],
  "github-actions": [".github/workflows"],
} as const;

export type Ecosystem = keyof typeof STACK_MARKERS | "shell";

export interface StackDetectionResult {
  readonly ecosystems: readonly Ecosystem[];
  /** Matches the legacy detector: 0 when an adapter applies, 3 when manual inspection is required. */
  readonly exitCode: 0 | 3;
  readonly status: "detected" | "unknown";
}

export interface PublicSafetyFinding {
  /** Redacted, stable identity. It never contains the matched source text. */
  readonly fingerprint: string;
  readonly line: number;
  readonly path: string;
  readonly rule: string;
}

export type PublicSafetyUnassessedReason =
  | "binary_content"
  | "invalid_utf8"
  | "missing_or_unreadable"
  | "unsupported_tracked_entry";

export interface PublicSafetyUnassessed {
  /** Stable identity without source bytes or filesystem error text. */
  readonly fingerprint: string;
  readonly path: string;
  readonly reason: PublicSafetyUnassessedReason;
}

export interface PublicSafetyScanResult {
  readonly exitCode: 0 | 1;
  readonly findings: readonly PublicSafetyFinding[];
  /** SHA-256 of the exact frozen denylist bytes, when one configured this run. */
  readonly input_sha256?: string;
  /** Present when the caller supplied the precise tracked/shippable surface. */
  readonly scope?: "tracked_shippable";
  readonly status: "pass" | "fail";
  /** Canonical tracked path-set binding for tracked/shippable scans. */
  readonly tracked_path_count?: number;
  readonly tracked_paths_sha256?: string;
  /** Files that could not honestly be assessed are debt, never silent skips. */
  readonly unassessed: readonly PublicSafetyUnassessed[];
}

export interface SelectedPublicSafetyScanResult extends PublicSafetyScanResult {
  readonly selected_path_count: number;
  readonly selected_paths_sha256: string;
}

export interface ManifestEntry {
  readonly path: string;
  readonly sha256: string;
}

export interface ManifestResult {
  /** Text is ready to write as MANIFEST.sha256, but this pure inspection API never writes it. */
  readonly content: string;
  readonly entries: readonly ManifestEntry[];
  readonly exitCode: 0;
}

export const PUBLIC_SAFETY_EXCLUDED_PARTS = new Set([
  ".git",
  ".venv",
  ".wrangler",
  "__pycache__",
  "coverage",
  "dist",
  "node_modules",
]);

export const MANIFEST_EXCLUDED_DIRS = new Set([
  ".git",
  ".wrangler",
  "__pycache__",
  "coverage",
  "dist",
  "node_modules",
]);

export const MANIFEST_EXCLUDED_FILES = new Set([
  ".DS_Store",
  "MANIFEST.sha256",
  "src/generated-materials.ts",
]);

const PUBLIC_SAFETY_RULES: ReadonlyArray<readonly [string, RegExp]> = [
  ["posix-home-path", /\/(?:Users|home)\/[^/\s]+\//],
  ["windows-home-path", /\b[A-Za-z]:\\Users\\[^\\\s]+\\/],
  ["email-address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["file-url", /\bfile:\/\/[^\s)>'\"]+/i],
  ["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  [
    "credential-assignment",
    /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*['"]?[A-Za-z0-9_./+=-]{8,}/i,
  ],
];

const YAML_PUBLIC_CONTACT = ["eemeli", "gmail.com"].join("@");
const PUBLIC_THIRD_PARTY_LEGAL_LINES = new Set([
  `email-address\0THIRD_PARTY_NOTICES.md\0Copyright Eemeli Aro <${YAML_PUBLIC_CONTACT}>`,
]);

function isPublicThirdPartyLegalIdentifier(path: string, line: string, rule: string): boolean {
  return PUBLIC_THIRD_PARTY_LEGAL_LINES.has(`${rule}\0${path}\0${line}`);
}

interface WalkedPath {
  readonly absolute: string;
  readonly relative: string;
  readonly symlink: boolean;
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
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

function hasExcludedPart(path: string, excluded: ReadonlySet<string>): boolean {
  return path.split(/[\\/]/).some((part) => excluded.has(part));
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(root: string, excluded: ReadonlySet<string>): Promise<WalkedPath[]> {
  const absoluteRoot = resolve(root);
  const files: WalkedPath[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (excluded.has(entry.name)) continue;
      const absolute = resolve(directory, entry.name);
      const rel = toPosix(relative(absoluteRoot, absolute));
      if (entry.isSymbolicLink()) {
        files.push({ absolute, relative: rel, symlink: true });
      } else if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.push({ absolute, relative: rel, symlink: false });
      }
    }
  }

  await visit(absoluteRoot);
  return files.sort((left, right) => compareCodePoints(left.relative, right.relative));
}

function walkFilesSync(root: string, excluded: ReadonlySet<string>): WalkedPath[] {
  const absoluteRoot = resolve(root);
  const files: WalkedPath[] = [];

  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (excluded.has(entry.name)) continue;
      const absolute = resolve(directory, entry.name);
      const rel = toPosix(relative(absoluteRoot, absolute));
      if (entry.isSymbolicLink()) files.push({ absolute, relative: rel, symlink: true });
      else if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push({ absolute, relative: rel, symlink: false });
    }
  }

  visit(absoluteRoot);
  return files.sort((left, right) => compareCodePoints(left.relative, right.relative));
}

async function containsShellFile(root: string): Promise<boolean> {
  try {
    return (await walkFiles(root, new Set([".git", "node_modules"]))).some((file) => file.relative.endsWith(".sh"));
  } catch {
    // The Python detector deliberately treats an unreadable recursive glob as
    // no shell evidence; the unknown-stack result still prevents a false pass.
    return false;
  }
}

/** Ordered marker and shell detection semantics for the stack adapter router. */
export async function detectStack(root: string): Promise<StackDetectionResult> {
  const absoluteRoot = resolve(root);
  const ecosystems: Ecosystem[] = [];

  for (const [ecosystem, markers] of Object.entries(STACK_MARKERS) as Array<
    [Exclude<Ecosystem, "shell">, readonly string[]]
  >) {
    if ((await Promise.all(markers.map((marker) => exists(resolve(absoluteRoot, marker))))).some(Boolean)) {
      ecosystems.push(ecosystem);
    }
  }
  if (await containsShellFile(absoluteRoot)) ecosystems.push("shell");

  return ecosystems.length > 0
    ? { ecosystems, exitCode: 0, status: "detected" }
    : { ecosystems, exitCode: 3, status: "unknown" };
}

/** Load the legacy newline-delimited denylist without exposing the terms in results. */
export async function loadDenylist(path?: string): Promise<readonly string[]> {
  if (!path) return [];
  return (await readFile(path, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/** Synchronous form for closeout preparation. */
export function loadDenylistSync(path?: string): readonly string[] {
  if (!path) return [];
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function lines(text: string): readonly string[] {
  return text.split(/\r\n|\n|\r/);
}

/** Extract redacted-searchable ASCII runs from binary or non-UTF-8 assets. */
function printableBinaryText(bytes: Uint8Array): string {
  let result = "";
  let run = "";
  const flush = (): void => {
    if (run.length >= 4) result += `${run}\n`;
    run = "";
  };
  for (const byte of bytes) {
    if (byte >= 0x20 && byte <= 0x7e) run += String.fromCharCode(byte);
    else flush();
  }
  flush();
  return result;
}

/**
 * Stable redacted finding identity. The rule, repository-relative path, and
 * line are sufficient to bind ledger rows without serialising secret text.
 */
export function publicSafetyFingerprint(finding: Pick<PublicSafetyFinding, "line" | "path" | "rule">): string {
  return createHash("sha256")
    .update(`public_safety\0${finding.rule}\0${finding.path}\0${finding.line}`, "utf8")
    .digest("hex");
}

export function publicSafetyUnassessedFingerprint(
  finding: Pick<PublicSafetyUnassessed, "path" | "reason">,
): string {
  return createHash("sha256")
    .update(`public_safety_unassessed\0${finding.reason}\0${finding.path}`, "utf8")
    .digest("hex");
}

function publicSafetyUnassessed(
  path: string,
  reason: PublicSafetyUnassessedReason,
): PublicSafetyUnassessed {
  return { fingerprint: publicSafetyUnassessedFingerprint({ path, reason }), path, reason };
}

function selectedPathSetSha256(paths: readonly string[]): string {
  return createHash("sha256")
    .update(JSON.stringify([...new Set(paths)].sort(compareCodePoints)), "utf8")
    .digest("hex");
}

function publicSafetyFinding(path: string, line: number, rule: string): PublicSafetyFinding {
  return { fingerprint: publicSafetyFingerprint({ path, line, rule }), path, line, rule };
}

/**
 * Public-safety scanner. It never returns matched source text, so a
 * caller can report a violation without reflecting a secret into its output.
 */
export async function scanPublicSafety(
  root: string,
  customTerms: readonly string[] = [],
): Promise<PublicSafetyScanResult> {
  return scanPublicSafetySync(root, customTerms);
}

/** Synchronous form for closeout preparation, which is intentionally sync. */
export function scanPublicSafetySync(
  root: string,
  customTerms: readonly string[] = [],
): PublicSafetyScanResult {
  return scanPublicSafetyFilesSync(walkFilesSync(root, PUBLIC_SAFETY_EXCLUDED_PARTS), customTerms);
}

/**
 * Scan exactly the caller-selected tracked/shippable paths. This deliberately
 * does not walk untracked agent logs, evidence caches, or ignored worktrees.
 */
export function scanTrackedPublicSafetySync(
  root: string,
  trackedPaths: readonly string[],
  customTerms: readonly string[] = [],
): PublicSafetyScanResult {
  const selected = scanSelectedPublicSafetySync(root, trackedPaths, customTerms);
  return {
    findings: selected.findings,
    unassessed: selected.unassessed,
    exitCode: selected.exitCode,
    status: selected.status,
    scope: "tracked_shippable",
    tracked_path_count: selected.selected_path_count,
    tracked_paths_sha256: selected.selected_paths_sha256,
  };
}

/** Scan an exact caller-supplied surface without assuming Git or package semantics. */
export function scanSelectedPublicSafetySync(
  root: string,
  selectedPaths: readonly string[],
  customTerms: readonly string[] = [],
): SelectedPublicSafetyScanResult {
  const absoluteRoot = resolve(root);
  const files: WalkedPath[] = [];
  const canonicalPaths = [...new Set(selectedPaths)].sort(compareCodePoints);
  const unassessed: PublicSafetyUnassessed[] = [];
  for (const path of canonicalPaths) {
    if (!path || path.startsWith("/") || path.split(/[\\/]/).includes("..")) {
      unassessed.push(publicSafetyUnassessed(path || "<empty>", "unsupported_tracked_entry"));
      continue;
    }
    const absolute = resolve(absoluteRoot, path);
    const rel = relative(absoluteRoot, absolute);
    if (rel === ".." || rel.startsWith(`..${sep}`)) {
      unassessed.push(publicSafetyUnassessed(path, "unsupported_tracked_entry"));
      continue;
    }
    try {
      const stat = lstatSync(absolute);
      if (stat.isFile() || stat.isSymbolicLink()) {
        files.push({ absolute, relative: toPosix(rel), symlink: stat.isSymbolicLink() });
      } else {
        unassessed.push(publicSafetyUnassessed(toPosix(rel), "unsupported_tracked_entry"));
      }
    } catch {
      unassessed.push(publicSafetyUnassessed(toPosix(rel), "missing_or_unreadable"));
    }
  }
  return {
    ...scanPublicSafetyFilesSync(files, customTerms, unassessed),
    selected_path_count: canonicalPaths.length,
    selected_paths_sha256: selectedPathSetSha256(canonicalPaths),
  };
}

function scanPublicSafetyFilesSync(
  files: readonly WalkedPath[],
  customTerms: readonly string[],
  initialUnassessed: readonly PublicSafetyUnassessed[] = [],
): PublicSafetyScanResult {
  const findings: PublicSafetyFinding[] = [];
  const unassessed = [...initialUnassessed];

  for (const file of files) {
    let text: string;
    try {
      if (file.symlink) {
        text = `SYMLINK_TARGET=${readlinkSync(file.absolute)}`;
      } else {
        const bytes = readFileSync(file.absolute);
        if (bytes.includes(0)) text = printableBinaryText(bytes);
        else {
          try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch {
            text = printableBinaryText(bytes);
          }
        }
      }
    } catch (error) {
      void error;
      unassessed.push(publicSafetyUnassessed(file.relative, "missing_or_unreadable"));
      continue;
    }

    for (const [index, line] of lines(text).entries()) {
      for (const [rule, expression] of PUBLIC_SAFETY_RULES) {
        if (expression.test(line) && !isPublicThirdPartyLegalIdentifier(file.relative, line, rule)) {
          findings.push(publicSafetyFinding(file.relative, index + 1, rule));
        }
      }
      const folded = foldCase(line);
      for (const [termIndex, term] of customTerms.entries()) {
        if (folded.includes(foldCase(term))) {
          findings.push(publicSafetyFinding(file.relative, index + 1, `custom-denylist-${termIndex + 1}`));
        }
      }
    }
  }

  return findings.length === 0 && unassessed.length === 0
    ? { findings, unassessed, exitCode: 0, status: "pass" }
    : { findings, unassessed, exitCode: 1, status: "fail" };
}

/**
 * Deterministic source manifest as a no-write operation. The CLI can opt to
 * write `content`; closeout logic can compare it without mutating the source tree.
 */
export async function generateManifest(root: string): Promise<ManifestResult> {
  const absoluteRoot = resolve(root);
  const entries: ManifestEntry[] = [];
  const files = await walkFiles(absoluteRoot, MANIFEST_EXCLUDED_DIRS);

  for (const file of files) {
    if (MANIFEST_EXCLUDED_FILES.has(file.relative)) continue;
    if (basename(file.relative).endsWith(".pyc") || basename(file.relative).endsWith(".skill")) continue;
    if (hasExcludedPart(file.relative, MANIFEST_EXCLUDED_DIRS)) continue;
    // pathlib's is_file() follows a file symlink but rejects a symlink to a
    // directory. Public-safety inspection deliberately treats every symlink
    // as text; manifest generation has the narrower historical behavior.
    if (file.symlink && !(await stat(file.absolute)).isFile()) continue;
    const bytes = await readFile(file.absolute);
    entries.push({
      path: `./${file.relative}`,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  entries.sort((left, right) => compareCodePoints(left.path, right.path));
  return {
    entries,
    content: entries.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n") + (entries.length ? "\n" : ""),
    exitCode: 0,
  };
}

/**
 * Deterministic manifest of the files the package declares as public. This is
 * deliberately distinct from the source-tree manifest: a shipped manifest
 * must validate the installed artifact, not files its consumer never receives.
 */
export async function generatePackageManifest(root: string): Promise<ManifestResult> {
  return generateAttestedPackageManifest(root);
}
