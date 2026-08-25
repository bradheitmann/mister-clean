/**
 * Repository inspection primitives used by the closeout CLI.
 *
 * These functions deliberately return exit-relevant state instead of printing
 * or terminating a process.  The CLI owns presentation; callers can preserve
 * an unknown stack or public-safety failure in a closeout record.
 */
import { createHash } from "node:crypto";
import {
  readFile,
  readdir,
  readlink,
  stat,
} from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";

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
  readonly line: number;
  readonly path: string;
  readonly rule: string;
}

export interface PublicSafetyScanResult {
  readonly exitCode: 0 | 1;
  readonly findings: readonly PublicSafetyFinding[];
  readonly status: "pass" | "fail";
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

function lines(text: string): readonly string[] {
  return text.split(/\r\n|\n|\r/);
}

/**
 * Public-safety scanner. It never returns matched source text, so a
 * caller can report a violation without reflecting a secret into its output.
 */
export async function scanPublicSafety(
  root: string,
  customTerms: readonly string[] = [],
): Promise<PublicSafetyScanResult> {
  const findings: PublicSafetyFinding[] = [];
  const files = await walkFiles(root, PUBLIC_SAFETY_EXCLUDED_PARTS);

  for (const file of files) {
    let text: string;
    if (file.symlink) {
      text = `SYMLINK_TARGET=${await readlink(file.absolute)}`;
    } else {
      const bytes = await readFile(file.absolute);
      if (bytes.includes(0)) continue;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        continue;
      }
    }

    for (const [index, line] of lines(text).entries()) {
      for (const [rule, expression] of PUBLIC_SAFETY_RULES) {
        if (expression.test(line)) findings.push({ path: file.relative, line: index + 1, rule });
      }
      const folded = foldCase(line);
      for (const [termIndex, term] of customTerms.entries()) {
        if (folded.includes(foldCase(term))) {
          findings.push({ path: file.relative, line: index + 1, rule: `custom-denylist-${termIndex + 1}` });
        }
      }
    }
  }

  return findings.length === 0
    ? { findings, exitCode: 0, status: "pass" }
    : { findings, exitCode: 1, status: "fail" };
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
