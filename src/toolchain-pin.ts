import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDocument } from "yaml";

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

/** setup-bun inputs that replace version resolution with another binary source. */
const SETUP_BUN_OVERRIDE_INPUTS = ["bun-download-url"] as const;

/**
 * Every `oven-sh/setup-bun` step must take its version from the pin, judged on
 * the parsed workflow, step by step, from that step's own `with` inputs only
 * (an `env` key of the same name is not an action input): exactly one of
 * `bun-version-file: .bun-version` or a `bun-version` literal equal to the pin.
 * Both (the literal wins silently), neither (the action falls back to its own
 * default), an expression (unresolvable here), an override such as
 * `bun-download-url` (skips version resolution), unparseable YAML, and a remote
 * reusable workflow (whose steps this scanner cannot see) all fail closed.
 */
export function ciBunPinErrors(workflow: string, pin: string): string[] {
  const document = parseDocument(workflow, { prettyErrors: false, uniqueKeys: true });
  if (document.errors.length > 0) return [`workflow is not parseable YAML: ${document.errors[0]?.message ?? "unknown error"}`];
  const root = document.toJS() as { jobs?: Record<string, { uses?: unknown; steps?: unknown }> } | null;
  const errors: string[] = [];
  for (const [jobId, job] of Object.entries(root?.jobs ?? {})) {
    if (typeof job?.uses === "string" && !job.uses.startsWith("./")) {
      errors.push(`job ${jobId} calls the remote reusable workflow ${job.uses}; its setup-bun steps cannot be verified here`);
    }
    const steps = Array.isArray(job?.steps) ? job.steps : [];
    steps.forEach((raw: unknown, index: number) => {
      const step = raw as { uses?: unknown; with?: unknown } | null;
      if (typeof step?.uses !== "string" || !step.uses.startsWith("oven-sh/setup-bun@")) return;
      const where = `job ${jobId} step ${index + 1} (${step.uses.split("@")[0]})`;
      const inputs = (step.with ?? {}) as Record<string, unknown>;
      const literal = inputs["bun-version"];
      const fromFile = inputs["bun-version-file"];
      for (const override of SETUP_BUN_OVERRIDE_INPUTS) {
        if (override in inputs) errors.push(`${where} sets ${override}, which replaces version resolution`);
      }
      const isExpression = (value: unknown) => typeof value === "string" && value.includes("${{");
      if (isExpression(literal) || isExpression(fromFile)) errors.push(`${where} takes its version from an expression, which cannot be verified`);
      else if (literal !== undefined && fromFile !== undefined) errors.push(`${where} sets both bun-version and bun-version-file (the literal wins silently)`);
      else if (literal === undefined && fromFile === undefined) errors.push(`${where} sets neither bun-version nor bun-version-file in its with inputs (falls back to the action default)`);
      else if (fromFile !== undefined && String(fromFile) !== BUN_VERSION_FILE) errors.push(`${where} reads ${String(fromFile)}, not ${BUN_VERSION_FILE}`);
      else if (literal !== undefined && String(literal) !== pin) errors.push(`${where} pins ${String(literal)}, the repository pins ${pin}`);
    });
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
