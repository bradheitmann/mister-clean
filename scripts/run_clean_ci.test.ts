import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { captureRepositoryObject } from "../src/closeout/repository-object.js";
import {
  ExecutionResourceBusyError,
  acquireRepositoryVerificationLease,
} from "../src/closeout/execution-lease.js";
import {
  cleanCiCommandTimeoutMs,
  createCleanCandidateCapsule,
  runCleanCi,
  TEST_NODE_MATRIX_TIMEOUT_MS,
} from "./run_clean_ci.js";

const temporaryRoots: string[] = [];
// The fixture runs 20 serial supervised commands: 4 metadata commands, 6
// tracked-file index commands, install, build, and 8 matrix commands. Give
// each a ten-second command limit, one-second termination grace, and 250 ms
// supervisor scheduling allowance. This configures a 225,000 ms test and hook
// budget; it is not a scheduler wall-clock guarantee. Production defaults stay
// unchanged.
const FIXTURE_SERIAL_SUPERVISED_COMMANDS = 20;
const FIXTURE_COMMAND_TIMEOUT_MS = 10_000;
const FIXTURE_TERMINATION_GRACE_MS = 1_000;
const FIXTURE_SUPERVISOR_SCHEDULING_ALLOWANCE_MS = 250;
const FIXTURE_END_TO_END_BUDGET_MS = FIXTURE_SERIAL_SUPERVISED_COMMANDS
  * (FIXTURE_COMMAND_TIMEOUT_MS + FIXTURE_TERMINATION_GRACE_MS + FIXTURE_SUPERVISOR_SCHEDULING_ALLOWANCE_MS);
const fixtureCleanCiOptions = Object.freeze({
  command_timeout_ms: FIXTURE_COMMAND_TIMEOUT_MS,
  termination_grace_ms: FIXTURE_TERMINATION_GRACE_MS,
});

interface PendingCleanCiRun {
  readonly root: string;
  readonly promise: Promise<unknown>;
  readonly expected: "resolve" | "reject";
  readonly expectedFailure?: RegExp;
  readonly afterSettlement?: () => void;
}

const pendingCleanCiRuns = new Set<PendingCleanCiRun>();

function trackCleanCiRun<T>(
  root: string,
  promise: Promise<T>,
  expected: PendingCleanCiRun["expected"],
  expectedFailure?: RegExp,
  afterSettlement?: () => void,
): Promise<T> {
  const pending: PendingCleanCiRun = { root, promise, expected, expectedFailure, afterSettlement };
  pendingCleanCiRuns.add(pending);
  // A timed-out test may finish before the supervised command settles. Attach
  // a rejection handler immediately; afterEach remains responsible for waiting
  // before it deletes the fixture that the command still owns.
  void promise.catch(() => undefined);
  return promise;
}

function temporaryMarker(): string {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-clean-ci-marker-"));
  temporaryRoots.push(root);
  return join(root, "entered");
}

function put(root: string, path: string, content: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function git(root: string, ...args: string[]): void {
  execFileSync("git", ["--no-optional-locks", "-C", root, ...args], {
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: "pipe",
  });
}

function fixture(buildsGeneratedOutput: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-clean-ci-test-"));
  temporaryRoots.push(root);
  put(root, ".gitignore", "dist/\nnode_modules/\nsrc/generated-materials.ts\n");
  put(root, "package.json", `${JSON.stringify({
    name: "clean-ci-fixture",
    version: "1.0.0",
    private: true,
    type: "module",
    packageManager: "pnpm@11.0.3",
    scripts: {
      "build:raw": "bun scripts/build.ts",
      "test:node": "bun scripts/assert-built.ts",
      "test:bun": "bun scripts/assert-built.ts",
      "control-plane:check": "bun scripts/assert-built.ts",
      "pack:check": "bun scripts/assert-built.ts",
      "audit:public": "bun scripts/assert-built.ts",
      "audit:repository-boundaries": "bun scripts/assert-built.ts",
      "generated:check": "bun scripts/assert-built.ts",
      "generated:postbuild:check": "bun scripts/assert-built.ts",
    },
  }, null, 2)}\n`);
  put(root, "pnpm-lock.yaml", [
    "lockfileVersion: '9.0'",
    "",
    "settings:",
    "  autoInstallPeers: true",
    "  excludeLinksFromLockfile: false",
    "",
    "importers:",
    "",
    "  .: {}",
    "",
  ].join("\n"));
  put(root, "scripts/build.ts", buildsGeneratedOutput
    ? [
      'import { mkdirSync, writeFileSync } from "node:fs";',
      'mkdirSync("dist", { recursive: true });',
      'mkdirSync("src", { recursive: true });',
      'writeFileSync("dist/acceptance.txt", "fresh\\n");',
      'writeFileSync("src/generated-materials.ts", "export const generated = true;\\n");',
      "",
    ].join("\n")
    : "// Deliberately does not create the ignored output consumed by acceptance.\n");
  put(root, "scripts/assert-built.ts", [
    'import { readFileSync } from "node:fs";',
    'if (readFileSync("dist/acceptance.txt", "utf8") !== "fresh\\n") throw new Error("fresh build output absent");',
    "",
  ].join("\n"));
  put(root, "source.txt", "committed\n");
  git(root, "init", "--quiet", "--initial-branch=main");
  git(root, "config", "user.name", "Clean CI Fixture");
  git(root, "config", "user.email", "clean-ci.invalid");
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "fixture");
  return root;
}

afterEach(async () => {
  const pending = [...pendingCleanCiRuns];
  const outcomes = await Promise.allSettled(pending.map((entry) => entry.promise));
  let custodyVerified = false;
  try {
    for (const [index, outcome] of outcomes.entries()) {
      const entry = pending[index]!;
      expect(existsSync(join(entry.root, ".git"))).toBe(true);
      expect(outcome.status).toBe(entry.expected === "resolve" ? "fulfilled" : "rejected");
      if (outcome.status === "rejected" && entry.expectedFailure !== undefined) {
        expect(String(outcome.reason)).toMatch(entry.expectedFailure);
      }
      entry.afterSettlement?.();
      const lease = acquireRepositoryVerificationLease(entry.root);
      expect(lease.release().state).toBe("released");
    }
    custodyVerified = true;
  } finally {
    pendingCleanCiRuns.clear();
    if (custodyVerified) {
      while (temporaryRoots.length > 0) rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
    } else if (temporaryRoots.length > 0) {
      process.stderr.write(`mister-clean clean-ci test retained fixtures after failed custody verification: ${temporaryRoots.join(", ")}\n`);
      // Retained diagnostics must not enter the next test's cleanup batch.
      temporaryRoots.splice(0);
    }
  }
}, FIXTURE_END_TO_END_BUDGET_MS);

describe("clean exact-object CI capsule", () => {
  it("reconstructs staged, unstaged, and untracked candidate state without importing ignored output", async () => {
    const root = fixture(true);
    put(root, "source.txt", "staged\n");
    git(root, "add", "source.txt");
    put(root, "source.txt", "unstaged-after-stage\n");
    put(root, "untracked.txt", "candidate-only\n");
    put(root, "dist/acceptance.txt", "stale\n");
    const expected = captureRepositoryObject(root);
    const capsule = mkdtempSync(join(tmpdir(), "mister-clean-clean-ci-capsule-test-"));
    temporaryRoots.push(capsule);

    const materialized = await createCleanCandidateCapsule(root, capsule);

    expect(captureRepositoryObject(materialized.repository)).toEqual(expected);
    expect(readFileSync(join(materialized.repository, "source.txt"), "utf8")).toBe("unstaged-after-stage\n");
    expect(readFileSync(join(materialized.repository, "untracked.txt"), "utf8")).toBe("candidate-only\n");
    expect(existsSync(join(materialized.repository, "dist", "acceptance.txt"))).toBe(false);
  });

  it("reserves the measured extended budget only for the default Node matrix command", () => {
    expect(cleanCiCommandTimeoutMs("test:node", undefined)).toBe(TEST_NODE_MATRIX_TIMEOUT_MS);
    expect(cleanCiCommandTimeoutMs("test:bun", undefined)).toBe(600_000);
    expect(cleanCiCommandTimeoutMs("test:node", FIXTURE_COMMAND_TIMEOUT_MS)).toBe(FIXTURE_COMMAND_TIMEOUT_MS);
    expect(cleanCiCommandTimeoutMs("build:raw", undefined)).toBe(600_000);
  });

  it("passes from a cold clone because build:raw materializes every ignored prerequisite before the matrix", async () => {
    const root = fixture(true);
    const before = captureRepositoryObject(root);

    const receipt = await trackCleanCiRun(root, runCleanCi(root, fixtureCleanCiOptions), "resolve");

    expect(receipt.status).toBe("pass");
    expect(receipt.matrix).toHaveLength(8);
    expect(receipt.source_repository_object).toEqual(before);
    expect(receipt.capsule_repository_object_before_install).toEqual(before);
    expect(receipt.capsule_repository_object_after_build).toEqual(before);
    expect(receipt.source_repository_object_after).toEqual(before);
    expect(receipt.schema_version).toBe("1.1");
    expect(receipt.dependency_command).toBe("pnpm install --frozen-lockfile --config.production=false --ignore-scripts");
    expect(receipt.execution_lease).toEqual(expect.objectContaining({
      resource: "repository-wide-verification",
      mechanism: "sqlite_exclusive_transaction",
      state: "released",
    }));
    expect(existsSync(join(root, "dist", "acceptance.txt"))).toBe(false);
  }, FIXTURE_END_TO_END_BUDGET_MS);

  it("waits for a rejected supervised run before fixture cleanup", async () => {
    const root = fixture(true);
    const marker = temporaryMarker();
    put(root, "scripts/build.ts", [
      'import { writeFileSync } from "node:fs";',
      `writeFileSync(${JSON.stringify(marker)}, "build entered\\n");`,
      'throw new Error("intentional clean-ci fixture rejection");',
      "",
    ].join("\n"));
    // The command timeout applies to one supervised command, not the test's
    // whole cold-clone lifecycle. The test body deliberately ends while this
    // invocation is active; async afterEach must settle it before rmSync.
    void trackCleanCiRun(
      root,
      runCleanCi(root, fixtureCleanCiOptions),
      "reject",
      /supervised command exited 1: pnpm/,
      () => expect(existsSync(marker)).toBe(true),
    );

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    expect(pendingCleanCiRuns.size).toBe(1);
    expect(existsSync(join(root, ".git"))).toBe(true);
  }, FIXTURE_END_TO_END_BUDGET_MS);

  it("keeps the fixture until an explicitly bounded Node-matrix timeout settles", async () => {
    const root = fixture(true);
    const marker = temporaryMarker();
    put(root, "scripts/hang-node.ts", [
      'import { writeFileSync } from "node:fs";',
      `writeFileSync(${JSON.stringify(marker)}, "node matrix entered\\n");`,
      "setInterval(() => {}, 1_000);",
      "",
    ].join("\n"));
    const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    packageJson.scripts["test:node"] = "bun scripts/hang-node.ts";
    writeFileSync(join(root, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
    void trackCleanCiRun(
      root,
      runCleanCi(root, fixtureCleanCiOptions),
      "reject",
      /supervised command exited 128: pnpm/,
      () => expect(existsSync(marker)).toBe(true),
    );

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    expect(pendingCleanCiRuns.size).toBe(1);
    expect(existsSync(join(root, ".git"))).toBe(true);
  }, FIXTURE_END_TO_END_BUDGET_MS);

  it("refuses to start while another repository-wide verification owns the resource", async () => {
    const root = fixture(true);
    const lease = acquireRepositoryVerificationLease(root);
    try {
      await expect(trackCleanCiRun(root, runCleanCi(root, fixtureCleanCiOptions), "reject")).rejects.toBeInstanceOf(ExecutionResourceBusyError);
    } finally {
      lease.release();
    }
  });

  it("validates options before acquiring the repository-wide resource", async () => {
    const root = fixture(true);

    await expect(trackCleanCiRun(root, runCleanCi(root, { command_timeout_ms: 0 }), "reject")).rejects.toThrow("command_timeout_ms");

    const lease = acquireRepositoryVerificationLease(root);
    expect(lease.release().state).toBe("released");
  });

  it("proves a stale ignored dist in the source cannot satisfy capsule acceptance", async () => {
    const root = fixture(false);
    put(root, "dist/acceptance.txt", "fresh\n");
    const before = captureRepositoryObject(root);

    await expect(trackCleanCiRun(root, runCleanCi(root, fixtureCleanCiOptions), "reject")).rejects.toThrow();

    expect(captureRepositoryObject(root)).toEqual(before);
    expect(readFileSync(join(root, "dist", "acceptance.txt"), "utf8")).toBe("fresh\n");
  }, FIXTURE_END_TO_END_BUDGET_MS);
});
