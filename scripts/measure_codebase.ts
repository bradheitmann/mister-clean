#!/usr/bin/env bun

import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  measureCodebase,
  measureRepositoryObjectCodebase,
  type ComplexityPolicy,
  type MeasureCodebaseOptions,
} from "../src/metrics/codebase-complexity.js";
import type { RepositoryObject } from "../src/closeout/repository-object.js";

interface Arguments {
  readonly repository: string;
  readonly ref: string;
  readonly repositoryObject: string | null;
  readonly output: string | null;
  readonly policy: ComplexityPolicy | undefined;
  readonly includeIgnored: boolean;
}

function usage(): never {
  process.stderr.write([
    "Usage: bun scripts/measure_codebase.ts --repo PATH [options]",
    "",
    "Options:",
    "  --ref REF           committed Git tree to measure (default: HEAD)",
    "  --repository-object FILE",
    "                      exact RepositoryObject JSON outside the subject surface; mutually exclusive with --ref",
    "  --out FILE          write JSON to FILE instead of stdout",
    "  --policy FILE       optional project-policy threshold JSON",
    "  --no-ignored        omit current-worktree ignored-file measurement",
    "  --help              show this help",
    "",
  ].join("\n"));
  process.exit(2);
}

function requireValue(args: readonly string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function readPolicy(path: string): ComplexityPolicy {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path}: policy must be a JSON object`);
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.name !== "string" || !record.thresholds
    || typeof record.thresholds !== "object" || Array.isArray(record.thresholds)) {
    throw new Error(`${path}: policy requires string name and object thresholds`);
  }
  for (const [key, value] of Object.entries(record.thresholds as Record<string, unknown>)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${path}: threshold ${key} must be a finite number`);
    }
  }
  return parsed as ComplexityPolicy;
}

function parseArguments(args: readonly string[]): Arguments {
  let repository: string | null = null;
  let ref = "HEAD";
  let refExplicit = false;
  let repositoryObject: string | null = null;
  let output: string | null = null;
  let policy: ComplexityPolicy | undefined;
  let includeIgnored = true;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") usage();
    if (argument === "--repo") {
      repository = resolve(requireValue(args, index, argument));
      index += 1;
    } else if (argument === "--ref") {
      ref = requireValue(args, index, argument);
      refExplicit = true;
      index += 1;
    } else if (argument === "--repository-object") {
      repositoryObject = resolve(requireValue(args, index, argument));
      index += 1;
    } else if (argument === "--out") {
      output = resolve(requireValue(args, index, argument));
      index += 1;
    } else if (argument === "--policy") {
      const path = resolve(requireValue(args, index, argument));
      policy = readPolicy(path);
      index += 1;
    } else if (argument === "--no-ignored") {
      includeIgnored = false;
    } else if (argument !== undefined && argument !== "--help") {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (repository === null) usage();
  if (refExplicit && repositoryObject !== null) {
    throw new Error("--ref and --repository-object are mutually exclusive");
  }
  return { repository, ref, repositoryObject, output, policy, includeIgnored };
}

function errorCode(error: unknown): string | null {
  return error && typeof error === "object" && "code" in error ? String(error.code) : null;
}

/** Resolve an output destination through every existing parent symlink. */
function resolvedOutputDestination(path: string): string {
  let cursor = resolve(path);
  const missingSegments: string[] = [];
  for (;;) {
    try {
      const stat = lstatSync(cursor);
      if (stat.isSymbolicLink()) return resolve(realpathSync(cursor), ...missingSegments);
      return resolve(realpathSync(cursor), ...missingSegments);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw new Error(`Cannot resolve output destination: ${path}`);
      missingSegments.unshift(basename(cursor));
      cursor = parent;
    }
  }
}

function isWithin(root: string, candidate: string): boolean {
  const relation = relative(root, candidate);
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}

function assertRepositoryObjectOutputIsExternal(repository: string, output: string): void {
  const subjectRoot = realpathSync(repository);
  const destination = resolvedOutputDestination(output);
  if (isWithin(subjectRoot, destination)) {
    throw new Error(
      "--repository-object refuses --out inside the measured repository; write the report outside its subject surface",
    );
  }
}

try {
  const args = parseArguments(process.argv.slice(2));
  if (args.repositoryObject !== null && args.output !== null) {
    assertRepositoryObjectOutputIsExternal(args.repository, args.output);
  }
  const report = args.repositoryObject === null
    ? measureCodebase({
      repository: args.repository,
      ref: args.ref,
      include_ignored: args.includeIgnored,
      ...(args.policy === undefined ? {} : { policy: args.policy }),
    } satisfies MeasureCodebaseOptions)
    : measureRepositoryObjectCodebase({
      repository: args.repository,
      expected_repository_object: JSON.parse(readFileSync(args.repositoryObject, "utf8")) as RepositoryObject,
      ...(args.policy === undefined ? {} : { policy: args.policy }),
    });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output === null) process.stdout.write(serialized);
  else writeFileSync(args.output, serialized, "utf8");
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`measure_codebase: ${detail}\n`);
  process.exitCode = 1;
}
