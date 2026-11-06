/**
 * Spawn ledger: records every git spawn the modules under test make, so a
 * refactor of the spawn sites can be compared record for record against the
 * base bytes (charter/DONE/mg-s2b-git-runner.md, proof 1).
 *
 * Loaded only by vitest.ledger.config.ts as a setup file. With
 * MISTER_CLEAN_GIT_LEDGER unset the mock returns node:child_process unchanged
 * and nothing is written. With it set, `execFileSync`, `spawnSync`, `execFile`
 * (and its promisified form) and `spawn` are wrapped, and every call whose
 * program is `git` and whose stack reaches a production module under src/
 * appends one JSON line to `<ledger dir>/<test file>.jsonl`. Calls made only by
 * tests and fixtures carry no production site and are not recorded.
 */
import { appendFileSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, vi } from "vitest";

export const LEDGER_ENV = "MISTER_CLEAN_GIT_LEDGER";

/** One recorded spawn. `line` serves the base liveness check only and is never compared. */
export interface GitSpawnRecord {
  readonly api: "execFileSync" | "spawnSync" | "execFile" | "spawn";
  readonly argv: readonly string[];
  readonly options: Readonly<Record<string, unknown>>;
  readonly env: {
    readonly exact: Readonly<Record<string, string>>;
    readonly others: Readonly<Record<string, boolean>>;
  };
  readonly site: { readonly file: string; readonly function: string };
  readonly line: number;
}

export interface GitSpawnLedgerLine {
  readonly test: string;
  readonly record: GitSpawnRecord;
}

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** Env names whose exact value is recorded; every other name records only whether it equals the parent's. */
function exactEnvName(name: string): boolean {
  return name.startsWith("GIT_") || name.startsWith("LC_") || name === "LANG";
}

function realOrSame(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Placeholders for the roots whose names differ between runs: the per-run test
 * root (TMPDIR inside a worker), the temp directory it lives in, and the
 * checkout. Longest first, so the run root wins over its parent. Memoised per
 * temp directory, because a test may repoint TMPDIR.
 */
const rootsByTmpdir = new Map<string, readonly (readonly [string, string])[]>();
function roots(): readonly (readonly [string, string])[] {
  const run = tmpdir();
  const known = rootsByTmpdir.get(run);
  if (known !== undefined) return known;
  const pairs: [string, string][] = [];
  for (const [path, label] of [[run, "<RUN>"], [resolve(run, ".."), "<TMP>"], [REPOSITORY_ROOT, "<REPO>"]] as const) {
    pairs.push([path, label], [realOrSame(path), label]);
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  rootsByTmpdir.set(run, pairs);
  return pairs;
}

/**
 * Normalise a string: roots become placeholders, the random suffix mkdtemp adds
 * to a directory under a placeholder becomes XXXXXX, and object ids (whose
 * values follow fixture commit times) become <OID>.
 */
export function normaliseText(value: string): string {
  let text = value;
  for (const [path, label] of roots()) text = text.split(path).join(label);
  text = text.replace(/(<RUN>|<TMP>)((?:[/\\][^/\\\s"]+)*?[/\\][^/\\\s"]*?)[A-Za-z0-9]{6}(?=[/\\]|$|\s|")/gu, "$1$2XXXXXX");
  return text.replace(/\b[0-9a-f]{40}(?:[0-9a-f]{24})?\b/gu, "<OID>");
}

function normaliseValue(value: unknown): unknown {
  if (typeof value === "string") return normaliseText(value);
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { bytes: normaliseText(Buffer.from(value).toString("utf8")) };
  if (Array.isArray(value)) return value.map(normaliseValue);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined && typeof entry !== "function") result[key] = normaliseValue(entry);
    }
    return result;
  }
  return value;
}

/** Key-sorted JSON, so equal records serialise to equal strings. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function productionFrame(file: string): boolean {
  const rel = relative(REPOSITORY_ROOT, file).split(sep).join("/");
  return rel.startsWith("src/")
    && !/\.test\.ts$|\.test-fixture\.ts$/u.test(rel)
    && !rel.startsWith("src/test-support/")
    && rel !== "src/closeout/git-hardening.ts";
}

const FRAME = /^\s*at (?:async )?(?:(?<fn>.+?) \()?(?<location>.+?):(?<line>\d+):\d+\)?$/u;

/** The first stack frame in a production module under src/, other than git-hardening.ts. */
function siteOf(stack: string): { readonly site: GitSpawnRecord["site"]; readonly line: number } | undefined {
  for (const raw of stack.split("\n").slice(1)) {
    const groups = raw.match(FRAME)?.groups;
    if (groups === undefined) continue;
    let location = groups.location!;
    if (location.startsWith("file:")) location = fileURLToPath(location);
    if (!productionFrame(location)) continue;
    return {
      site: { file: relative(REPOSITORY_ROOT, location).split(sep).join("/"), function: groups.fn ?? "<anonymous>" },
      line: Number(groups.line),
    };
  }
  return undefined;
}

function envRecord(environment: NodeJS.ProcessEnv | undefined): GitSpawnRecord["env"] {
  const child = environment ?? process.env;
  const exact: Record<string, string> = {};
  const others: Record<string, boolean> = {};
  for (const name of Object.keys(child).sort()) {
    const value = child[name];
    if (value === undefined) continue;
    if (exactEnvName(name)) exact[name] = normaliseText(value);
    else others[name] = process.env[name] === value;
  }
  return { exact, others };
}

const written = new Set<string>();

function testIdentity(): { readonly file: string; readonly test: string } {
  const state = expect.getState();
  const path = state.testPath ?? "<unknown>";
  const file = relative(REPOSITORY_ROOT, path).split(sep).join("/");
  return { file, test: `${file} > ${state.currentTestName ?? "<collect>"}` };
}

type Located = ReturnType<typeof siteOf>;

/**
 * Sites by raw (transformed-code) stack. A source-mapped stack string is
 * costly, so it is built once per distinct raw stack; the structured call
 * sites that key the cache are cheap, and an equal raw stack maps to an equal
 * string stack.
 */
const sitesByRawStack = new Map<string, Located>();

function locate(): Located {
  const previousPrepare = Error.prepareStackTrace;
  Error.stackTraceLimit = 64;
  let rawStack: string | undefined;
  try {
    Error.prepareStackTrace = (_error, callSites) => callSites;
    const holder: { stack?: unknown } = {};
    Error.captureStackTrace(holder, locate);
    if (Array.isArray(holder.stack)) {
      rawStack = (holder.stack as NodeJS.CallSite[])
        .map((callSite) => `${callSite.getFileName() ?? ""}:${String(callSite.getLineNumber())}:${String(callSite.getColumnNumber())}`)
        .join("\n");
    }
  } finally {
    Error.prepareStackTrace = previousPrepare;
  }
  if (rawStack !== undefined && sitesByRawStack.has(rawStack)) return sitesByRawStack.get(rawStack);
  const located = siteOf(new Error("git spawn ledger").stack ?? "");
  if (rawStack !== undefined) sitesByRawStack.set(rawStack, located);
  return located;
}

function record(api: GitSpawnRecord["api"], program: unknown, args: unknown, options: unknown): void {
  if (program !== "git") return;
  const previousLimit = Error.stackTraceLimit;
  let located: Located;
  try {
    located = locate();
  } finally {
    Error.stackTraceLimit = previousLimit;
  }
  if (located === undefined) return;
  const { env, ...rest } = (options !== null && typeof options === "object" ? options : {}) as Record<string, unknown>;
  const entry: GitSpawnRecord = {
    api,
    argv: (Array.isArray(args) ? args : []).map((arg) => normaliseText(String(arg))),
    options: normaliseValue(rest) as Record<string, unknown>,
    env: envRecord(env as NodeJS.ProcessEnv | undefined),
    site: located.site,
    line: located.line,
  };
  const { file, test } = testIdentity();
  const line = stableStringify({ test, record: entry } satisfies GitSpawnLedgerLine);
  if (written.has(line)) return;
  written.add(line);
  const directory = process.env[LEDGER_ENV]!;
  mkdirSync(directory, { recursive: true });
  appendFileSync(join(directory, `${file.replace(/[/\\]/gu, "__")}.jsonl`), `${line}\n`);
}

/** Split `(file, args?, options?, callback?)` the way child_process does. */
function splitCall(rest: readonly unknown[]): { readonly args: unknown; readonly options: unknown } {
  const args = Array.isArray(rest[0]) ? rest[0] : [];
  const options = rest[Array.isArray(rest[0]) ? 1 : 0];
  return { args, options: options !== null && typeof options === "object" ? options : undefined };
}

type Spawner = (...input: unknown[]) => unknown;

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  if (process.env[LEDGER_ENV] === undefined || process.env[LEDGER_ENV] === "") return actual;

  const wrap = (api: GitSpawnRecord["api"], original: Spawner): Spawner => (file, ...rest) => {
    const { args, options } = splitCall(rest);
    record(api, file, args, options);
    return original(file, ...rest);
  };
  const execFile = wrap("execFile", actual.execFile as Spawner);
  // promisify(execFile) resolves `{ stdout, stderr }` only through this hook.
  const custom = (actual.execFile as unknown as Record<symbol, Spawner>)[promisify.custom]!;
  Object.defineProperty(execFile, promisify.custom, { value: wrap("execFile", custom) });

  const wrapped = {
    ...actual,
    execFileSync: wrap("execFileSync", actual.execFileSync as Spawner) as typeof actual.execFileSync,
    spawnSync: wrap("spawnSync", actual.spawnSync as Spawner) as typeof actual.spawnSync,
    spawn: wrap("spawn", actual.spawn as Spawner) as typeof actual.spawn,
    execFile: execFile as typeof actual.execFile,
  };
  return { ...wrapped, default: wrapped };
});
