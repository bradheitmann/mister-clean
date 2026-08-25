#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { nodeCloseoutEngine } from "./closeout/engine.js";
import { packageRoot } from "./closeout/repository.js";

export interface CliIO {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

class UsageError extends Error {}

function defaultIO(): CliIO {
  return {
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
  };
}

function removeFlag(args: string[], flag: string): boolean {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function removeOption(args: string[], option: string, required = false): string | undefined {
  const index = args.indexOf(option);
  if (index < 0) {
    if (required) throw new UsageError(`${option} is required`);
    return undefined;
  }
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new UsageError(`${option} requires a value`);
  args.splice(index, 2);
  return value;
}

function removeRepeatedOption(args: string[], option: string): string[] {
  const values: string[] = [];
  while (args.includes(option)) values.push(removeOption(args, option, true) as string);
  return values;
}

function assertNoArgs(args: readonly string[]): void {
  if (args.length) throw new UsageError(`unexpected argument(s): ${args.join(" ")}`);
}

function inside(root: string, candidate: string): boolean {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  const relation = relative(
    existsSync(rootPath) ? realpathSync(rootPath) : rootPath,
    existsSync(candidatePath) ? realpathSync(candidatePath) : candidatePath,
  );
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !relation.startsWith("/"));
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function runPrepare(args: string[], io: CliIO): Promise<number> {
  const repo = removeOption(args, "--repo", true) as string;
  const evidenceHome = removeOption(args, "--evidence-home", true) as string;
  const runId = removeOption(args, "--run-id", true) as string;
  const requestRef = removeOption(args, "--request-ref", true) as string;
  const requestSource = removeOption(args, "--request-source");
  const requestText = removeOption(args, "--request-text");
  const criteria = removeRepeatedOption(args, "--criterion");
  assertNoArgs(args);
  if (requestSource !== undefined && requestText !== undefined) {
    throw new UsageError("--request-source and --request-text are mutually exclusive");
  }
  const prepared = nodeCloseoutEngine.prepare({
    repo,
    evidenceHome,
    runId,
    requestRef,
    ...(requestSource === undefined ? {} : { requestSource }),
    ...(requestText === undefined ? {} : { requestText }),
    criteria,
  });
  io.stdout(prepared.bundleDirectory);
  return 0;
}

async function runValidate(args: string[], io: CliIO): Promise<number> {
  const kind = args.shift();
  const path = args.shift();
  if (!kind || !new Set(["report", "manifest", "bundle"]).has(kind)) {
    throw new UsageError("validate requires report, manifest, or bundle");
  }
  if (!path) throw new UsageError(`validate ${kind} requires a path`);
  const template = removeFlag(args, "--template");
  const structural = removeFlag(args, "--structural");
  const repo = removeOption(args, "--repo");
  assertNoArgs(args);
  if (kind !== "bundle" && (structural || repo !== undefined)) {
    throw new UsageError("--structural and --repo are only valid for bundle validation");
  }
  if (template && !inside(join(packageRoot(import.meta.url), "assets"), path)) {
    io.stderr("ERROR: --template is only valid for the skill's bundled assets/ templates; a real record must validate without placeholders");
    return 2;
  }

  if (kind === "bundle") {
    const result = await nodeCloseoutEngine.validateBundle(path, {
      allowPlaceholders: template,
      verifyLive: !structural,
      ...(repo === undefined ? {} : { repoPath: repo }),
    });
    if (!result.ok) {
      result.errors.forEach((error) => io.stderr(`ERROR: ${error}`));
      if (result.failureKind === "load") return 2;
      io.stderr(`FAIL errors=${result.errors.length}`);
      return 1;
    }
    io.stdout(`PASS kind=bundle path=${path} live=${!structural}`);
    return 0;
  }

  let data: unknown;
  try {
    data = readJson(path);
  } catch (error) {
    io.stderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  const errors = nodeCloseoutEngine.validateRecord(kind === "report" ? "report" : "manifest", data, template);
  if (errors.length) {
    errors.forEach((error) => io.stderr(`ERROR: ${error}`));
    io.stderr(`FAIL errors=${errors.length}`);
    return 1;
  }
  io.stdout(`PASS kind=${kind} path=${path}`);
  return 0;
}

async function runDetect(args: string[], io: CliIO): Promise<number> {
  if (args.shift() !== "stack") throw new UsageError("detect requires stack");
  const root = args.shift();
  if (!root) throw new UsageError("detect stack requires a repository path");
  const listOnly = removeFlag(args, "--list");
  assertNoArgs(args);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    io.stderr(`ERROR: not a directory: ${resolve(root)}`);
    return 2;
  }
  const result = await nodeCloseoutEngine.detectStack(root);
  if (result.status === "unknown") {
    io.stdout("NO KNOWN ECOSYSTEM DETECTED -- inspect manually; adapter checks may not be silently skipped");
    return result.exitCode;
  }
  io.stdout(`detected: ${result.ecosystems.join(" ")}`);
  if (listOnly) return 0;
  const reference = join(packageRoot(import.meta.url), "references", "stack-adapters.md");
  if (!existsSync(reference)) return 0;
  const text = readFileSync(reference, "utf8");
  for (const ecosystem of result.ecosystems) {
    const header = `## ${ecosystem}`;
    const start = text.indexOf(header);
    if (start < 0) continue;
    const next = text.indexOf("\n## ", start + header.length);
    io.stdout(`\n${text.slice(start, next < 0 ? undefined : next).trimEnd()}`);
  }
  return 0;
}

async function runAudit(args: string[], io: CliIO): Promise<number> {
  if (args.shift() !== "public-safety") throw new UsageError("audit requires public-safety");
  const root = args[0]?.startsWith("--") === false ? (args.shift() as string) : process.cwd();
  const denylist = removeOption(args, "--denylist-file");
  assertNoArgs(args);
  const result = await nodeCloseoutEngine.scanPublicSafety(root, denylist);
  for (const finding of result.findings) io.stdout(`${finding.path}:${finding.line}: ${finding.rule}`);
  if (result.status === "fail") io.stderr(`public-safety: FAIL (${result.findings.length} finding(s))`);
  else io.stdout("public-safety: PASS");
  return result.exitCode;
}

async function runManifest(args: string[], io: CliIO): Promise<number> {
  const root = args.shift() ?? packageRoot(import.meta.url);
  const check = removeFlag(args, "--check");
  assertNoArgs(args);
  const result = await nodeCloseoutEngine.generateManifest(root);
  const path = join(resolve(root), "MANIFEST.sha256");
  if (check) {
    if (!existsSync(path) || readFileSync(path, "utf8") !== result.content) {
      io.stderr("manifest: FAIL (MANIFEST.sha256 is stale)");
      return 1;
    }
    io.stdout(`manifest: PASS (${result.entries.length} entries)`);
    return 0;
  }
  writeFileSync(path, result.content, "utf8");
  io.stdout(`manifest: wrote ${result.entries.length} entries`);
  return 0;
}

function usage(io: CliIO): void {
  io.stderr("usage: mister-clean <prepare|validate|detect|audit|manifest> ...");
}

export async function runCli(argv: readonly string[], io: CliIO = defaultIO()): Promise<number> {
  const args = [...argv];
  const command = args.shift();
  try {
    if (command === "prepare") return await runPrepare(args, io);
    if (command === "validate") return await runValidate(args, io);
    if (command === "detect") return await runDetect(args, io);
    if (command === "audit") return await runAudit(args, io);
    if (command === "manifest") return await runManifest(args, io);
    usage(io);
    return 2;
  } catch (error) {
    io.stderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof UsageError) usage(io);
    return 2;
  }
}

export function isDirectInvocation(argvPath: string | undefined, moduleUrl: string): boolean {
  if (!argvPath) return false;
  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    const invokedPath = resolve(argvPath);
    return invokedPath === fileURLToPath(moduleUrl) || pathToFileURL(invokedPath).href === moduleUrl;
  }
}

if (isDirectInvocation(process.argv[1], import.meta.url)) {
  process.exitCode = await runCli(process.argv.slice(2));
}
