import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Packaged bytes (dist bundles, the standalone CLI) are reproducible only under
 * the bun version CI pins: the same tree bundles to different bytes under other
 * versions. The repository records that pin in `.bun-version`; packaging refuses
 * a mismatched toolchain instead of reporting a stale manifest.
 */
export const BUN_VERSION_FILE = ".bun-version";

export type ToolchainPinResult =
  | { readonly ok: true; readonly pinned: false }
  | { readonly ok: true; readonly pinned: true; readonly version: string; readonly actual: string | null }
  | { readonly ok: false; readonly pinned: true; readonly version: string; readonly actual: string };

/** The bun version running this process, or null under another runtime. */
export function runningBunVersion(): string | null {
  return process.versions.bun ?? null;
}

export function readBunPin(root: string): string | undefined {
  const path = join(resolve(root), BUN_VERSION_FILE);
  if (!existsSync(path)) return undefined;
  const version = readFileSync(path, "utf8").trim();
  if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error(`${BUN_VERSION_FILE} must hold one exact version, got ${JSON.stringify(version)}`);
  return version;
}

/**
 * A null `actual` (not running under bun) is not refused: only a bun build can
 * produce the packaged bytes, and other runtimes merely read them.
 */
export function checkToolchainPin(root: string, actual: string | null): ToolchainPinResult {
  const version = readBunPin(root);
  if (version === undefined) return { ok: true, pinned: false };
  if (actual !== null && actual !== version) return { ok: false, pinned: true, version, actual };
  return { ok: true, pinned: true, version, actual };
}
