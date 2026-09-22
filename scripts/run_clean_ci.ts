#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { materializeRepositoryObjectSurface } from "../src/closeout/repository-materialization.js";
import {
  acquireRepositoryVerificationLease,
  executionContentionJson,
  ExecutionResourceBusyError,
  type ExecutionLeaseReceipt,
} from "../src/closeout/execution-lease.js";
import { runSupervisedCommand } from "../src/closeout/execution-supervisor.js";
import {
  DEFAULT_TERMINATION_GRACE_MS,
  DEFAULT_TIMEOUT_MS,
} from "../src/closeout/native-gates.js";
import { safeIntegerOption } from "../src/closeout/native-gate-runner.js";
import {
  captureRepositoryObject,
  captureRepositoryObjectSurface,
  type RepositoryObject,
  type RepositoryObjectSurfaceCapture,
} from "../src/closeout/repository-object.js";
import { releaseProcessEnvironment } from "./release_capsule.mjs";

export const CLEAN_CI_MATRIX = Object.freeze([
  "test:node",
  "test:bun",
  "control-plane:check",
  "pack:check",
  "audit:public",
  "audit:repository-boundaries",
  "generated:check",
  "generated:postbuild:check",
] as const);

/** The serialized Node matrix measured 1,103,583 ms in a retained clean capsule. */
export const TEST_NODE_MATRIX_TIMEOUT_MS = 1_500_000;

export interface CleanCiReceipt {
  readonly record_type: "mister-clean.clean-ci-receipt";
  readonly schema_version: "1.1";
  readonly status: "pass";
  readonly source_repository_object: RepositoryObject;
  readonly capsule_repository_object_before_install: RepositoryObject;
  readonly capsule_repository_object_after_build: RepositoryObject;
  readonly source_repository_object_after: RepositoryObject;
  readonly dependency_command: "pnpm install --frozen-lockfile --config.production=false --ignore-scripts";
  readonly build_command: "pnpm run build:raw";
  readonly matrix: readonly string[];
  readonly execution_lease: ExecutionLeaseReceipt;
}

export interface CleanCiOptions {
  readonly keepCapsule?: boolean;
  readonly now?: () => Date;
  readonly command_timeout_ms?: number;
  readonly termination_grace_ms?: number;
}

export function cleanCiCommandTimeoutMs(
  command: string,
  configuredTimeoutMs: number | undefined,
): number {
  const defaultTimeoutMs = safeIntegerOption(configuredTimeoutMs, DEFAULT_TIMEOUT_MS, "command_timeout_ms");
  return command === "test:node" && configuredTimeoutMs === undefined
    ? TEST_NODE_MATRIX_TIMEOUT_MS
    : defaultTimeoutMs;
}

type Command = (
  executable: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly stdio: "inherit" },
) => Promise<unknown>;

function sameObject(left: RepositoryObject, right: RepositoryObject): boolean {
  return left.head_commit === right.head_commit
    && left.entry_count === right.entry_count
    && left.sha256 === right.sha256;
}

async function run(
  command: Command,
  executable: string,
  args: readonly string[],
  cwd: string,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  await command(executable, [...args], {
    cwd,
    env: environment,
    stdio: "inherit",
  });
}

async function initializeExactGitMetadata(
  source: string,
  destination: string,
  capture: RepositoryObjectSurfaceCapture,
  command: Command,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  await run(command, "git", [
    "--no-optional-locks", "clone", "--quiet", "--no-checkout", "--no-local", "--config", "core.autocrlf=false",
    "--", source, destination,
  ], resolve(destination, ".."), environment);
  await run(command, "git", ["--no-optional-locks", "-C", destination, "symbolic-ref", "HEAD", "refs/heads/clean-ci-candidate"], destination, environment);
  await run(command, "git", [
    "--no-optional-locks", "-C", destination, "update-ref", "refs/heads/clean-ci-candidate",
    capture.repository_object.head_commit,
  ], destination, environment);
  await run(command, "git", ["--no-optional-locks", "-C", destination, "read-tree", "--empty"], destination, environment);
  for (const entry of capture.entries) {
    if (entry.tracked === null) continue;
    await run(command, "git", [
      "--no-optional-locks", "-C", destination, "update-index", "--add", "--info-only", "--cacheinfo",
      `${entry.tracked.mode},${entry.tracked.oid},${entry.path}`,
    ], destination, environment);
  }
}

/**
 * Materialize and verify one exact dirty worktree candidate in a pristine Git
 * capsule. The source's ignored files and dependency tree are never copied.
 */
async function createCleanCandidateCapsuleWithCommand(
  sourceRoot: string,
  capsuleRoot: string,
  command: Command,
): Promise<{ readonly repository: string; readonly source_capture: RepositoryObjectSurfaceCapture }> {
  const source = resolve(sourceRoot);
  const capsule = resolve(capsuleRoot);
  const repository = join(capsule, "repository");
  if (existsSync(repository)) throw new Error("clean CI capsule repository already exists");
  mkdirSync(capsule, { recursive: true, mode: 0o700 });
  const sourceCapture = captureRepositoryObjectSurface(source);
  const environment = releaseProcessEnvironment(capsule, process.env, capsule);
  await initializeExactGitMetadata(source, repository, sourceCapture, command, environment);
  materializeRepositoryObjectSurface(sourceCapture, repository);
  const reconstructed = captureRepositoryObject(repository);
  if (!sameObject(sourceCapture.repository_object, reconstructed)) {
    throw new Error(
      `clean CI reconstruction changed RepositoryObject: source=${sourceCapture.repository_object.sha256} capsule=${reconstructed.sha256}`,
    );
  }
  return Object.freeze({ repository, source_capture: sourceCapture });
}

export async function createCleanCandidateCapsule(
  sourceRoot: string,
  capsuleRoot: string,
): Promise<{ readonly repository: string; readonly source_capture: RepositoryObjectSurfaceCapture }> {
  return createCleanCandidateCapsuleWithCommand(
    sourceRoot,
    capsuleRoot,
    async (executable, args, commandOptions) => {
      execFileSync(executable, [...args], commandOptions);
    },
  );
}

export async function runCleanCi(sourceRoot: string, options: CleanCiOptions = {}): Promise<CleanCiReceipt> {
  const source = resolve(sourceRoot);
  const now = options.now ?? (() => new Date());
  const timeoutMs = cleanCiCommandTimeoutMs("non-matrix", options.command_timeout_ms);
  const terminationGraceMs = safeIntegerOption(
    options.termination_grace_ms,
    DEFAULT_TERMINATION_GRACE_MS,
    "termination_grace_ms",
  );
  const executionLease = acquireRepositoryVerificationLease(source, now);
  const command: Command = async (executable, args, commandOptions) => {
    await runSupervisedCommand(
      executionLease.supervisor_binding,
      executable,
      args,
      commandOptions,
      timeoutMs,
      terminationGraceMs,
    );
  };
  let capsule: string | undefined;
  let sourceBefore: RepositoryObject | undefined;
  let receipt: Omit<CleanCiReceipt, "execution_lease"> | undefined;
  let executionLeaseReceipt: ExecutionLeaseReceipt | undefined;
  let primaryFailure: unknown;
  try {
    capsule = mkdtempSync(join(tmpdir(), "mister-clean-ci-capsule-"));
    const materialized = await createCleanCandidateCapsuleWithCommand(source, capsule, command);
    sourceBefore = materialized.source_capture.repository_object;
    const candidate = materialized.repository;
    const environment = {
      ...releaseProcessEnvironment(capsule, process.env, candidate),
      MISTER_CLEAN_CLEAN_CAPSULE: "1",
      MISTER_CLEAN_SOURCE_DEVELOPMENT: "1",
    };
    const beforeInstall = captureRepositoryObject(candidate);
    if (!sameObject(sourceBefore, beforeInstall)) throw new Error("clean CI capsule drifted before dependency installation");

    await run(command, "pnpm", ["install", "--frozen-lockfile", "--config.production=false", "--ignore-scripts"], candidate, environment);
    const afterInstall = captureRepositoryObject(candidate);
    if (!sameObject(sourceBefore, afterInstall)) {
      throw new Error("dependency installation changed the exact candidate RepositoryObject");
    }

    await run(command, "pnpm", ["run", "build:raw"], candidate, environment);
    const afterBuild = captureRepositoryObject(candidate);
    if (!sameObject(sourceBefore, afterBuild)) {
      throw new Error(
        `build:raw changed the candidate RepositoryObject: source=${sourceBefore.sha256} capsule=${afterBuild.sha256}`,
      );
    }
    for (const script of CLEAN_CI_MATRIX) {
      const matrixTimeoutMs = cleanCiCommandTimeoutMs(script, options.command_timeout_ms);
      const matrixCommand: Command = async (executable, args, commandOptions) => {
        await runSupervisedCommand(
          executionLease.supervisor_binding,
          executable,
          args,
          commandOptions,
          matrixTimeoutMs,
          terminationGraceMs,
        );
      };
      await run(matrixCommand, "pnpm", ["run", script], candidate, environment);
    }
    const sourceAfter = captureRepositoryObject(source);
    if (!sameObject(sourceBefore, sourceAfter)) throw new Error("clean CI changed the source RepositoryObject");
    receipt = Object.freeze({
      record_type: "mister-clean.clean-ci-receipt",
      schema_version: "1.1",
      status: "pass",
      source_repository_object: sourceBefore,
      capsule_repository_object_before_install: beforeInstall,
      capsule_repository_object_after_build: afterBuild,
      source_repository_object_after: sourceAfter,
      dependency_command: "pnpm install --frozen-lockfile --config.production=false --ignore-scripts",
      build_command: "pnpm run build:raw",
      matrix: CLEAN_CI_MATRIX,
    });
  } catch (error) {
    primaryFailure = error;
  } finally {
    let sourceFailure: unknown;
    if (sourceBefore !== undefined) {
      try {
        const sourceAfterFailure = captureRepositoryObject(source);
        if (!sameObject(sourceBefore, sourceAfterFailure)) {
          sourceFailure = new Error(
            `clean CI source changed during a failed run: before=${sourceBefore.sha256} after=${sourceAfterFailure.sha256}`,
          );
        }
      } catch (error) {
        sourceFailure = error;
      }
    }
    if (capsule !== undefined && !options.keepCapsule) rmSync(capsule, { recursive: true, force: true });
    let leaseFailure: unknown;
    try {
      executionLeaseReceipt = executionLease.release();
    } catch (error) {
      leaseFailure = error;
    }
    if (sourceFailure !== undefined || leaseFailure !== undefined) {
      const failures = [primaryFailure, sourceFailure, leaseFailure].filter((value) => value !== undefined);
      if (failures.length > 1) {
        throw new AggregateError(failures, "clean CI, source-custody verification, or execution-lease release failed");
      }
      throw failures[0];
    }
  }
  if (primaryFailure !== undefined) throw primaryFailure;
  if (receipt === undefined) throw new Error("clean CI ended without a receipt");
  if (executionLeaseReceipt === undefined) throw new Error("clean CI ended without a terminal execution-lease receipt");
  return Object.freeze({ ...receipt, execution_lease: executionLeaseReceipt });
}

function parseArguments(args: readonly string[]): void {
  if (args.length !== 1 || args[0] !== "--candidate=worktree") {
    throw new Error("usage: bun scripts/run_clean_ci.ts --candidate=worktree");
  }
  if (process.env.MISTER_CLEAN_CLEAN_CAPSULE === "1") {
    throw new Error("clean CI refuses recursive invocation from inside a clean capsule");
  }
}

if (import.meta.main) {
  try {
    parseArguments(process.argv.slice(2));
    const receipt = await runCleanCi(resolve(import.meta.dir, ".."));
    process.stdout.write(
      `clean ci: PASS (${receipt.matrix.length} matrix commands; RepositoryObject ${receipt.source_repository_object.sha256})\n`,
    );
  } catch (error) {
    if (error instanceof ExecutionResourceBusyError) process.stderr.write(`${executionContentionJson(error)}\n`);
    process.stderr.write(`clean ci: FAIL (${error instanceof Error ? error.message : String(error)})\n`);
    process.exitCode = 1;
  }
}
