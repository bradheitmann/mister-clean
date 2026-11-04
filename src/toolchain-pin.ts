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
 * Every `oven-sh/setup-bun` step in a workflow must take its version from the
 * pin: exactly one of `bun-version-file: .bun-version` or a `bun-version`
 * literal equal to the pin. Steps are checked one by one (a step with neither
 * input falls back to the action's default, not the pin; with both, the
 * literal silently wins), so a count over the whole file cannot hide one.
 */
export function ciBunPinErrors(workflow: string, pin: string): string[] {
  const lines = workflow.split("\n");
  const errors: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!/uses:\s*oven-sh\/setup-bun@/u.test(line)) continue;
    const stepIndent = /^\s*-\s/u.test(line) ? line.indexOf("-") : line.search(/\S/u);
    let literal: string | undefined;
    let fromFile: string | undefined;
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next] ?? "";
      if (candidate.trim() === "") continue;
      if (candidate.search(/\S/u) <= stepIndent) break;
      const version = candidate.match(/^\s*bun-version:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/u);
      if (version) literal = version[1];
      const file = candidate.match(/^\s*bun-version-file:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/u);
      if (file) fromFile = file[1];
    }
    const where = `setup-bun step at line ${index + 1}`;
    if (literal !== undefined && fromFile !== undefined) errors.push(`${where} sets both bun-version and bun-version-file (the literal wins silently)`);
    else if (literal === undefined && fromFile === undefined) errors.push(`${where} sets neither bun-version nor bun-version-file (falls back to the action default)`);
    else if (fromFile !== undefined && fromFile !== BUN_VERSION_FILE) errors.push(`${where} reads ${fromFile}, not ${BUN_VERSION_FILE}`);
    else if (literal !== undefined && literal !== pin) errors.push(`${where} pins ${literal}, the repository pins ${pin}`);
  }
  return errors;
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
