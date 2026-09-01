#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import {
  loadDenylistSync,
  scanSelectedPublicSafetySync,
  type PublicSafetyFinding,
  type PublicSafetyUnassessed,
} from "../src/closeout/inspection.js";

interface PackFile {
  readonly path?: unknown;
}

interface PackDescription {
  readonly files?: unknown;
  readonly name?: unknown;
  readonly version?: unknown;
}

export interface ProspectivePublicPackageResult {
  readonly record_type: "mister-clean.prospective-package-public-safety";
  readonly schema_version: "1.0";
  readonly status: "pass" | "fail";
  readonly exitCode: 0 | 1;
  readonly scope: "prospective_package";
  readonly package: { readonly name: string; readonly version: string };
  readonly package_path_count: number;
  readonly package_paths_sha256: string;
  readonly findings: readonly PublicSafetyFinding[];
  readonly unassessed: readonly PublicSafetyUnassessed[];
}

function packDescription(root: string): PackDescription {
  const output = execFileSync(
    "pnpm",
    ["--config.ignore-scripts=true", "pack", "--dry-run", "--json"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("pnpm pack --dry-run did not return one JSON package description");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("pnpm pack --dry-run returned an unsupported package description");
  }
  return parsed as PackDescription;
}

function packagePaths(description: PackDescription): readonly string[] {
  if (typeof description.name !== "string" || typeof description.version !== "string") {
    throw new Error("prospective package description lacks name or version");
  }
  if (!Array.isArray(description.files)) throw new Error("prospective package description lacks its file census");
  const paths = description.files.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || typeof (entry as PackFile).path !== "string" || (entry as PackFile).path === "") {
      throw new Error(`prospective package file ${String(index)} lacks a path`);
    }
    return (entry as { readonly path: string }).path;
  });
  if (new Set(paths).size !== paths.length) throw new Error("prospective package contains duplicate paths");
  return paths;
}

/** Scan the exact uncommitted surface pnpm says it would place in the archive. */
export function verifyProspectivePublicPackage(
  root: string,
  denylistPath?: string,
  description: PackDescription = packDescription(resolve(root)),
): ProspectivePublicPackageResult {
  const packageRoot = resolve(root);
  const paths = packagePaths(description);
  const scan = scanSelectedPublicSafetySync(packageRoot, paths, loadDenylistSync(denylistPath));
  return Object.freeze({
    record_type: "mister-clean.prospective-package-public-safety",
    schema_version: "1.0",
    status: scan.status,
    exitCode: scan.exitCode,
    scope: "prospective_package",
    package: { name: description.name as string, version: description.version as string },
    package_path_count: scan.selected_path_count,
    package_paths_sha256: scan.selected_paths_sha256,
    findings: scan.findings,
    unassessed: scan.unassessed,
  });
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a path`);
  args.splice(index, 2);
  return resolve(value);
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    const denylist = option(args, "--denylist-file");
    const json = args.includes("--json");
    if (json) args.splice(args.indexOf("--json"), 1);
    const root = resolve(args.shift() ?? resolve(import.meta.dir, ".."));
    if (args.length > 0) throw new Error("usage: bun scripts/verify_public_package.ts [root] [--denylist-file path] [--json]");
    const result = verifyProspectivePublicPackage(root, denylist);
    if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else if (result.status === "pass") {
      process.stdout.write(`prospective package public-safety: PASS (${result.package_path_count} files)\n`);
    } else {
      process.stderr.write(
        `prospective package public-safety: FAIL (${result.findings.length} finding(s), ${result.unassessed.length} unassessed)\n`,
      );
    }
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`prospective package public-safety: FAIL (${error instanceof Error ? error.message : String(error)})\n`);
    process.exitCode = 1;
  }
}
