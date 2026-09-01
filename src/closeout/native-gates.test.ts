import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { captureRepositoryObject } from "./repository-object.js";
import {
  auditVerificationRunnerSafety,
  discoverNativeGates,
  nativeGateFailureObservations,
} from "./native-gates.js";
import { runNativeGates } from "./native-gate-runner.js";
import { validateNativeGateCoverage } from "./native-gate-validation.js";

const roots: string[] = [];

function command(cwd: string, executable: string, ...args: string[]): string {
  return execFileSync(executable, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fixture(name: string): { evidence: string; repo: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), `mister-clean-native-gates-${name}-`));
  roots.push(root);
  const repo = join(root, "repo");
  const evidence = join(root, "evidence");
  mkdirSync(repo);
  command(repo, "git", "init", "-q", "-b", "main");
  command(repo, "git", "config", "user.name", "Native Gate Fixture");
  command(repo, "git", "config", "user.email", "native-gate.invalid");
  return { evidence, repo, root };
}

function commit(repo: string): void {
  command(repo, "git", "add", ".");
  command(repo, "git", "commit", "-qm", "fixture");
}

function subjectGitState(repo: string): Record<string, string> {
  return {
    head: command(repo, "git", "rev-parse", "HEAD"),
    refs: command(repo, "git", "for-each-ref", "--sort=refname", "--format=%(refname)%00%(objectname)"),
    stash: command(repo, "git", "stash", "list", "--format=%H%x00%gd%x00%gs"),
    status: command(repo, "git", "status", "--porcelain=v2", "--untracked-files=all"),
    worktrees: command(repo, "git", "worktree", "list", "--porcelain"),
  };
}

function writePackage(
  repo: string,
  manager: "bun" | "pnpm" | "npm" | "yarn",
  scripts: Record<string, string>,
): void {
  writeFileSync(join(repo, "package.json"), `${JSON.stringify({
    name: "native-gate-fixture",
    private: true,
    packageManager: `${manager}@1.0.0`,
    scripts,
  }, null, 2)}\n`);
  const lock = {
    bun: "bun.lock",
    pnpm: "pnpm-lock.yaml",
    npm: "package-lock.json",
    yarn: "yarn.lock",
  }[manager];
  writeFileSync(join(repo, lock), "fixture lock\n");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("native gate discovery", () => {
  it("rejects framework deadlines that wrap nonpreemptible synchronous full gates", () => {
    const unsafe = fixture("sync-timeout-unsafe");
    writeFileSync(join(unsafe.repo, "broad.test.ts"), `
import { execFileSync } from "node:child_process";
import { it } from "vitest";
it("runs broad verification", { timeout: 120_000 }, () => {
  execFileSync("pnpm", ["run", "ci:check"], { stdio: "inherit" });
});
`);
    commit(unsafe.repo);
    expect(auditVerificationRunnerSafety(unsafe.repo)).toEqual([{
      line: 5,
      path: "broad.test.ts",
      rule: "synchronous_child_deadline_unenforceable",
    }]);
    expect(discoverNativeGates(unsafe.repo, captureRepositoryObject(unsafe.repo)).gates).toContainEqual(
      expect.objectContaining({
        id: "repository:runner-safety",
        disposition: "absent",
        basis: "nonpreemptible_timeout_wrapper",
      }),
    );

    const safe = fixture("sync-timeout-safe");
    writeFileSync(join(safe.repo, "broad.test.ts"), `
import { execFileSync } from "node:child_process";
import { it } from "vitest";
it("runs broad verification", { timeout: 120_000 }, () => {
  execFileSync("pnpm", ["run", "ci:check"], { stdio: "inherit", timeout: 110_000 });
});
`);
    commit(safe.repo);
    expect(auditVerificationRunnerSafety(safe.repo)).toEqual([]);
  });

  it("prefers one deterministic Bun aggregate over duplicate child gates", () => {
    const { repo } = fixture("bun-aggregate");
    writePackage(repo, "bun", {
      "ci:check": "bun run test && bun run build",
      build: "tsc --noEmit",
      test: "vitest run",
    });
    commit(repo);
    const object = captureRepositoryObject(repo);

    const first = discoverNativeGates(repo, object);
    const second = discoverNativeGates(repo, object);

    expect(second).toEqual(first);
    expect(first.required_gate_ids).toEqual(["node:.:ci-check"]);
    expect(first.gates).toEqual([
      expect.objectContaining({
        id: "node:.:ci-check",
        kind: "established_ci",
        disposition: "required",
        command: {
          adapter: "node-package-script",
          executable: "bun",
          argv: ["run", "ci:check"],
          cwd: ".",
          env_policy: "credential_scrubbed_ci",
        },
      }),
    ]);
    expect(first.catalog_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ["pnpm", ["pnpm", "run", "test"]],
    ["npm", ["npm", "run", "test"]],
    ["yarn", ["yarn", "run", "test"]],
  ] as const)("builds an exact %s package-script adapter", (manager, expected) => {
    const { repo } = fixture(`manager-${manager}`);
    writePackage(repo, manager, { test: "node --test" });
    commit(repo);
    const discovery = discoverNativeGates(repo, captureRepositoryObject(repo));
    const gate = discovery.gates.find((entry) => entry.disposition === "required");
    expect([gate?.command?.executable, ...(gate?.command?.argv ?? [])]).toEqual(expected);
  });

  it("discovers individual pnpm gates in stable semantic order when no aggregate exists", () => {
    const { repo } = fixture("pnpm-individual");
    writePackage(repo, "pnpm", {
      build: "tsc -b",
      lint: "eslint .",
      test: "vitest run",
      typecheck: "tsc --noEmit",
    });
    commit(repo);
    const discovery = discoverNativeGates(repo, captureRepositoryObject(repo));
    expect(discovery.gates.map((gate) => [gate.kind, gate.command?.argv.at(-1)])).toEqual([
      ["repository_tests", "test"],
      ["lint", "lint"],
      ["typecheck", "typecheck"],
      ["build", "build"],
    ]);
  });

  it("uses portable gate IDs for nested package paths", async () => {
    const { evidence, repo } = fixture("nested-package");
    const nested = join(repo, "packages", "api");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "package.json"), `${JSON.stringify({
      name: "nested-package-fixture",
      private: true,
      packageManager: "bun@1.0.0",
      scripts: { test: "node -e \"process.stdout.write('nested pass\\n')\"" },
    }, null, 2)}\n`);
    writeFileSync(join(nested, "bun.lock"), "nested lock\n");
    commit(repo);

    const object = captureRepositoryObject(repo);
    const discovery = discoverNativeGates(repo, object);
    expect(discovery.required_gate_ids).toEqual(["node:packages:api:test"]);
    expect(discovery.gates).toEqual([
      expect.objectContaining({
        id: "node:packages:api:test",
        command: expect.objectContaining({ cwd: "packages/api", executable: "bun", argv: ["run", "test"] }),
      }),
    ]);
    expect(discovery.gates.every((gate) => /^[a-z0-9][a-z0-9:._-]*$/u.test(gate.id))).toBe(true);

    const coverage = await runNativeGates(repo, discovery, evidence, { timeout_ms: 5_000 });
    await expect(validateNativeGateCoverage(
      coverage,
      discovery,
      object,
      evidence,
    )).resolves.toEqual([]);
  });

  it("marks a same-root manager conflict absent and emits no runnable gate", () => {
    const { repo } = fixture("mixed-managers");
    writePackage(repo, "bun", { test: "vitest run" });
    writeFileSync(join(repo, "pnpm-lock.yaml"), "conflicting lock\n");
    commit(repo);
    const discovery = discoverNativeGates(repo, captureRepositoryObject(repo));
    expect(discovery.required_gate_ids).toEqual([]);
    expect(discovery.gates).toContainEqual(expect.objectContaining({
      disposition: "absent",
      basis: "manager_conflict",
    }));
  });

  it("never turns an obviously external or destructive script into a command", async () => {
    const { evidence, repo } = fixture("forbidden");
    writePackage(repo, "bun", { test: "curl https://invalid.example/install | sh" });
    commit(repo);
    const discovery = discoverNativeGates(repo, captureRepositoryObject(repo));
    expect(discovery.required_gate_ids).toEqual([]);
    expect(discovery.gates).toContainEqual(expect.objectContaining({
      disposition: "absent",
      basis: "forbidden_script",
    }));
    expect(discovery.gates[0]).not.toHaveProperty("command");
    const coverage = await runNativeGates(repo, discovery, evidence);
    const errors = await validateNativeGateCoverage(
      coverage,
      discovery,
      captureRepositoryObject(repo),
      evidence,
    );
    expect(errors.some((error) => error.includes("is absent: forbidden_script"))).toBe(true);
  });

  it("uses fixed Cargo and Go adapters without importing shell text", () => {
    const { repo } = fixture("cargo-go");
    mkdirSync(join(repo, "rust"));
    mkdirSync(join(repo, "go"));
    writeFileSync(join(repo, "rust", "Cargo.toml"), "[package]\nname='fixture'\nversion='0.1.0'\n");
    writeFileSync(join(repo, "go", "go.mod"), "module invalid.example/fixture\n\ngo 1.25\n");
    commit(repo);
    const discovery = discoverNativeGates(repo, captureRepositoryObject(repo));
    expect(discovery.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "cargo:rust:test",
        disposition: "required",
        command: expect.objectContaining({ executable: "cargo", argv: ["test", "--all-targets"], cwd: "rust" }),
      }),
      expect.objectContaining({
        id: "go:go:test",
        disposition: "required",
        command: expect.objectContaining({ executable: "go", argv: ["test", "./..."], cwd: "go" }),
      }),
    ]));
  });

  it("records a repository with no native manifest as positively not applicable", async () => {
    const { evidence, repo } = fixture("not-applicable");
    writeFileSync(join(repo, "README.md"), "documentation only\n");
    commit(repo);
    const discovery = discoverNativeGates(repo, captureRepositoryObject(repo));
    expect(discovery.required_gate_ids).toEqual([]);
    expect(discovery.gates).toEqual([expect.objectContaining({
      id: "repository:native-quality",
      disposition: "not_applicable",
      basis: "no_supported_native_manifest",
    })]);
    const coverage = await runNativeGates(repo, discovery, evidence);
    await expect(validateNativeGateCoverage(
      coverage,
      discovery,
      captureRepositoryObject(repo),
      evidence,
    )).resolves.toEqual([]);
  });
});

describe("native gate execution and validation", () => {
  it("captures a passing gate with exact output digests and repository objects", async () => {
    const { evidence, repo } = fixture("pass");
    writePackage(repo, "bun", { test: "node gate.mjs" });
    writeFileSync(join(repo, "gate.mjs"), "process.stdout.write('native gate pass\\n');\n");
    commit(repo);
    const object = captureRepositoryObject(repo);
    const discovery = discoverNativeGates(repo, object);

    const coverage = await runNativeGates(repo, discovery, evidence, { timeout_ms: 5_000 });
    const execution = coverage.executions[0]!;

    expect(execution.state).toBe("passed");
    expect(execution.exit_code).toBe(0);
    expect(execution.start_repository_object).toEqual(object);
    expect(execution.end_repository_object).toEqual(object);
    expect(readFileSync(join(evidence, execution.stdout_ref.path), "utf8")).toContain("native gate pass");
    await expect(validateNativeGateCoverage(
      coverage,
      discovery,
      object,
      evidence,
      { validation_time: new Date(Date.now() + 1_000) },
    )).resolves.toEqual([]);
  });

  it("runs without operator credentials, stdin, or a TTY", async () => {
    const { evidence, repo } = fixture("scrubbed-environment");
    const operatorHome = process.env.HOME;
    writePackage(repo, "bun", { test: "node environment.mjs" });
    writeFileSync(join(repo, "environment.mjs"), [
      "const observed = {",
      "  secret: process.env.MISTER_CLEAN_NATIVE_GATE_SECRET ?? null,",
      "  stdin_tty: Boolean(process.stdin.isTTY),",
      "  stdout_tty: Boolean(process.stdout.isTTY),",
      "  ci: process.env.CI ?? null,",
      `  home_matches_operator: process.env.HOME === ${JSON.stringify(operatorHome)},`,
      "};",
      "process.stdout.write(`${JSON.stringify(observed)}\\n`);",
      "",
    ].join("\n"));
    commit(repo);
    const object = captureRepositoryObject(repo);
    const discovery = discoverNativeGates(repo, object);
    process.env.MISTER_CLEAN_NATIVE_GATE_SECRET = "must-not-leak";
    try {
      const coverage = await runNativeGates(repo, discovery, evidence, { timeout_ms: 5_000 });
      const execution = coverage.executions[0]!;
      const observed = JSON.parse(readFileSync(join(evidence, execution.stdout_ref.path), "utf8")) as unknown;
      expect(execution.state).toBe("passed");
      expect(observed).toEqual({
        secret: null,
        stdin_tty: false,
        stdout_tty: false,
        ci: "1",
        home_matches_operator: false,
      });
    } finally {
      delete process.env.MISTER_CLEAN_NATIVE_GATE_SECRET;
    }
  });

  it("runs a mutating gate on an exact disposable snapshot without touching subject files, refs, stashes, or topology", async () => {
    const { evidence, repo, root } = fixture("mutation");
    writePackage(repo, "bun", { test: "node mutate.mjs" });
    writeFileSync(join(repo, "tracked.txt"), "committed\n");
    writeFileSync(join(repo, "mutate.mjs"), [
      "import { execFileSync } from 'node:child_process';",
      "import { writeFileSync } from 'node:fs';",
      "const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });",
      "if (!git('diff', '--cached', '--name-only').includes('tracked.txt')) process.exit(21);",
      "if (!git('diff', '--name-only').includes('tracked.txt')) process.exit(22);",
      "if (!git('ls-files', '--others', '--exclude-standard').includes('untracked.txt')) process.exit(23);",
      "writeFileSync('generated.txt', 'snapshot-only debt\\n');",
      "git('branch', 'snapshot-only');",
      "process.stdout.write(`snapshot mutation ${Date.now()}\\n`);",
      "",
    ].join("\n"));
    commit(repo);
    command(repo, "git", "branch", "preserved-branch");
    writeFileSync(join(repo, "tracked.txt"), "stash seed\n");
    command(repo, "git", "stash", "push", "-m", "preserved-stash");
    const linked = join(root, "linked-worktree");
    command(repo, "git", "worktree", "add", "-q", "-b", "preserved-worktree", linked, "HEAD");
    writeFileSync(join(repo, "tracked.txt"), "staged\n");
    command(repo, "git", "add", "tracked.txt");
    writeFileSync(join(repo, "tracked.txt"), "dirty-after-stage\n");
    writeFileSync(join(repo, "untracked.txt"), "untracked\n");
    const object = captureRepositoryObject(repo);
    const discovery = discoverNativeGates(repo, object);
    const before = subjectGitState(repo);

    const coverage = await runNativeGates(repo, discovery, evidence, { timeout_ms: 5_000 });
    expect(coverage.executions[0]).toEqual(expect.objectContaining({
      isolation: "disposable_exact_object_snapshot",
      state: "failed",
      failure_reason: "repository_mutated",
      exit_code: 0,
    }));
    expect(coverage.executions[0]!.end_repository_object.sha256).not.toBe(object.sha256);
    expect(coverage.executions[0]!.subject_start_state).toEqual(coverage.executions[0]!.subject_end_state);
    expect(coverage.closing_repository_object).toEqual(object);
    expect(captureRepositoryObject(repo)).toEqual(object);
    expect(subjectGitState(repo)).toEqual(before);
    expect(readFileSync(join(repo, "tracked.txt"), "utf8")).toBe("dirty-after-stage\n");
    expect(readFileSync(join(repo, "untracked.txt"), "utf8")).toBe("untracked\n");
    expect(existsSync(join(repo, "generated.txt"))).toBe(false);
    expect(command(repo, "git", "branch", "--list", "snapshot-only")).toBe("");
    const errors = await validateNativeGateCoverage(
      coverage,
      discovery,
      object,
      evidence,
      { validation_time: new Date(Date.now() + 1_000) },
    );
    expect(errors.some((error) => error.includes("required gate did not pass"))).toBe(true);
    await expect(validateNativeGateCoverage(
      coverage,
      discovery,
      object,
      evidence,
      { validation_time: new Date(Date.now() + 1_000), require_passing: false },
    )).resolves.toEqual([]);
  });

  it("preserves read-only reachability refs for history-aware gates without changing the subject", async () => {
    const { evidence, repo } = fixture("reachability-refs");
    writePackage(repo, "bun", { test: "node check-refs.mjs" });
    writeFileSync(join(repo, "check-refs.mjs"), [
      "import { execFileSync } from 'node:child_process';",
      "const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();",
      "const head = git('rev-parse', 'HEAD');",
      "const main = git('rev-parse', '--verify', 'main');",
      "const originMain = git('rev-parse', '--verify', 'origin/main');",
      "if (head !== main || head !== originMain) process.exit(31);",
      "process.stdout.write(`${head}\\n`);",
      "",
    ].join("\n"));
    commit(repo);
    const head = command(repo, "git", "rev-parse", "HEAD");
    command(repo, "git", "update-ref", "refs/remotes/origin/main", head);
    const before = subjectGitState(repo);
    const object = captureRepositoryObject(repo);
    const discovery = discoverNativeGates(repo, object);

    const coverage = await runNativeGates(repo, discovery, evidence, { timeout_ms: 5_000 });
    const execution = coverage.executions[0]!;

    expect(execution.state).toBe("passed");
    expect(readFileSync(join(evidence, execution.stdout_ref.path), "utf8").trim()).toBe(head);
    await expect(validateNativeGateCoverage(
      coverage,
      discovery,
      object,
      evidence,
      { validation_time: new Date(Date.now() + 1_000) },
    )).resolves.toEqual([]);
    expect(subjectGitState(repo)).toEqual(before);
  });

  it("kills the whole process group on timeout", async () => {
    const { evidence, repo } = fixture("timeout");
    writePackage(repo, "bun", { test: "node timeout.mjs" });
    writeFileSync(join(repo, "timeout.mjs"), [
      "import { spawn } from 'node:child_process';",
      "spawn(process.execPath, ['-e', `setTimeout(() => require('node:fs').writeFileSync('escaped.txt', 'alive'), 500)`]);",
      "setInterval(() => {}, 1_000);",
      "",
    ].join("\n"));
    commit(repo);
    const object = captureRepositoryObject(repo);
    const discovery = discoverNativeGates(repo, object);

    const coverage = await runNativeGates(repo, discovery, evidence, {
      timeout_ms: 100,
      termination_grace_ms: 50,
    });
    expect(coverage.executions[0]).toEqual(expect.objectContaining({
      state: "timed_out",
      failure_reason: "timeout",
    }));
    await new Promise((resolve) => setTimeout(resolve, 650));
    expect(existsSync(join(repo, "escaped.txt"))).toBe(false);
  });

  it("records output-limit failure without pretending the truncated bytes are complete", async () => {
    const { evidence, repo } = fixture("output-limit");
    writePackage(repo, "bun", { test: "node noisy.mjs" });
    writeFileSync(join(repo, "noisy.mjs"), "process.stdout.write('x'.repeat(16_384)); setInterval(() => {}, 1_000);\n");
    commit(repo);
    const object = captureRepositoryObject(repo);
    const discovery = discoverNativeGates(repo, object);
    const coverage = await runNativeGates(repo, discovery, evidence, {
      max_output_bytes: 128,
      timeout_ms: 5_000,
      termination_grace_ms: 50,
    });
    expect(coverage.executions[0]).toEqual(expect.objectContaining({
      state: "failed",
      failure_reason: "output_limit_exceeded",
      stdout_ref: expect.objectContaining({ byte_count: 128, complete: false }),
    }));
  });

  it("distinguishes an explicit skip from absence and refuses it for a required gate", async () => {
    const { evidence, repo } = fixture("skip");
    writePackage(repo, "bun", { test: "node --test" });
    commit(repo);
    const object = captureRepositoryObject(repo);
    const discovery = discoverNativeGates(repo, object);
    const coverage = await runNativeGates(repo, discovery, evidence, {
      skip_gate_ids: discovery.required_gate_ids,
    });
    expect(coverage.executions[0]?.state).toBe("skipped");
    const errors = await validateNativeGateCoverage(
      coverage,
      discovery,
      object,
      evidence,
      { validation_time: new Date(Date.now() + 1_000) },
    );
    expect(errors.some((error) => error.includes("required gate did not pass"))).toBe(true);
  });

  it("keeps failure identity stable across metadata, lockfile, and output churn but changes it with the semantic contract", async () => {
    const { evidence, repo, root } = fixture("stable-failure-identity");
    writePackage(repo, "bun", { test: "node fail.mjs" });
    writeFileSync(join(repo, "fail.mjs"), "process.stderr.write(`${Date.now()}-${Math.random()}\\n`); process.exit(1);\n");
    commit(repo);

    const firstObject = captureRepositoryObject(repo);
    const firstDiscovery = discoverNativeGates(repo, firstObject);
    const firstCoverage = await runNativeGates(repo, firstDiscovery, evidence, { timeout_ms: 5_000 });
    const repeatedCoverage = await runNativeGates(repo, firstDiscovery, join(root, "evidence-repeat"), { timeout_ms: 5_000 });
    const firstGate = firstDiscovery.gates[0]!;
    const firstObservation = nativeGateFailureObservations(firstDiscovery, firstCoverage)[0]!;
    const repeatedObservation = nativeGateFailureObservations(firstDiscovery, repeatedCoverage)[0]!;
    expect(firstCoverage.executions[0]!.stderr_ref.sha256).not.toBe(repeatedCoverage.executions[0]!.stderr_ref.sha256);
    expect(repeatedObservation.source_native_fingerprint).toBe(firstObservation.source_native_fingerprint);
    const limitedCoverage = await runNativeGates(repo, firstDiscovery, join(root, "evidence-limited"), {
      max_output_bytes: 1,
      timeout_ms: 5_000,
    });
    const limitedObservation = nativeGateFailureObservations(firstDiscovery, limitedCoverage)[0]!;
    expect(limitedCoverage.executions[0]!.failure_reason).toBe("output_limit_exceeded");
    expect(limitedObservation.source_native_fingerprint).not.toBe(firstObservation.source_native_fingerprint);

    const manifest = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as Record<string, unknown>;
    manifest.description = "unrelated package metadata";
    writeFileSync(join(repo, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(repo, "bun.lock"), "unrelated lockfile churn\n");
    commit(repo);
    const metadataObject = captureRepositoryObject(repo);
    const metadataDiscovery = discoverNativeGates(repo, metadataObject);
    const metadataCoverage = await runNativeGates(repo, metadataDiscovery, join(root, "evidence-metadata"), { timeout_ms: 5_000 });
    const metadataGate = metadataDiscovery.gates[0]!;
    const metadataObservation = nativeGateFailureObservations(metadataDiscovery, metadataCoverage)[0]!;
    expect(metadataGate.definition_sha256).not.toBe(firstGate.definition_sha256);
    expect(metadataGate.source_refs).not.toEqual(firstGate.source_refs);
    expect(metadataGate.semantic_contract_sha256).toBe(firstGate.semantic_contract_sha256);
    expect(metadataObservation.source_native_fingerprint).toBe(firstObservation.source_native_fingerprint);
    await expect(validateNativeGateCoverage(
      metadataCoverage,
      metadataDiscovery,
      metadataObject,
      join(root, "evidence-metadata"),
      { validation_time: new Date(Date.now() + 1_000), require_passing: false },
    )).resolves.toEqual([]);

    writeFileSync(join(repo, "fail.mjs"), "process.stderr.write('same gate, new failure\\n'); process.exit(2);\n");
    commit(repo);
    const newFailureObject = captureRepositoryObject(repo);
    const newFailureDiscovery = discoverNativeGates(repo, newFailureObject);
    const newFailureCoverage = await runNativeGates(
      repo,
      newFailureDiscovery,
      join(root, "evidence-new-failure"),
      { timeout_ms: 5_000 },
    );
    const newFailureObservation = nativeGateFailureObservations(newFailureDiscovery, newFailureCoverage)[0]!;
    expect(newFailureDiscovery.gates[0]!.semantic_contract_sha256).toBe(firstGate.semantic_contract_sha256);
    expect(newFailureCoverage.executions[0]!.exit_code).toBe(2);
    expect(newFailureObservation.source_native_fingerprint).not.toBe(firstObservation.source_native_fingerprint);

    const changedManifest = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    changedManifest.scripts.test = "node fail.mjs --contract-v2";
    writeFileSync(join(repo, "package.json"), `${JSON.stringify(changedManifest, null, 2)}\n`);
    commit(repo);
    const changedObject = captureRepositoryObject(repo);
    const changedDiscovery = discoverNativeGates(repo, changedObject);
    const changedCoverage = await runNativeGates(repo, changedDiscovery, join(root, "evidence-changed"), { timeout_ms: 5_000 });
    const changedObservation = nativeGateFailureObservations(changedDiscovery, changedCoverage)[0]!;
    expect(changedDiscovery.gates[0]!.semantic_contract_sha256).not.toBe(firstGate.semantic_contract_sha256);
    expect(changedObservation.source_native_fingerprint).not.toBe(firstObservation.source_native_fingerprint);
  }, 60_000);

  it("rejects unexpected discovery keys, invalid source refs, enums, and non-adapter commands", async () => {
    const { evidence, repo } = fixture("strict-discovery");
    writePackage(repo, "bun", { test: "node --test" });
    commit(repo);
    const object = captureRepositoryObject(repo);
    const discovery = discoverNativeGates(repo, object);
    const forged = structuredClone(discovery) as unknown as Record<string, unknown>;
    forged.unexpected = true;
    const refs = forged.source_refs as Array<Record<string, unknown>>;
    refs[0]!.unexpected = "field";
    refs[0]!.kind = "cargo_manifest";
    const gates = forged.gates as Array<Record<string, unknown>>;
    gates[0]!.kind = "quality-ish";
    const forgedCommand = gates[0]!.command as Record<string, unknown>;
    forgedCommand.adapter = "shell";
    forgedCommand.argv = ["-c", "anything"];
    await expect(runNativeGates(
      repo,
      forged as unknown as typeof discovery,
      evidence,
    )).rejects.toThrow(/unexpected keys|kind does not match path|kind is invalid|adapter is invalid/u);
  });

  it("rejects malformed coverage repository objects, executions, failure reasons, output refs, and unexpected fields", async () => {
    const { evidence, repo } = fixture("strict-coverage");
    writePackage(repo, "bun", { test: "node -e \"process.stdout.write('ok')\"" });
    commit(repo);
    const object = captureRepositoryObject(repo);
    const discovery = discoverNativeGates(repo, object);
    const coverage = await runNativeGates(repo, discovery, evidence, { timeout_ms: 5_000 });
    const forged = structuredClone(coverage) as unknown as Record<string, unknown>;
    forged.unexpected = true;
    (forged.closing_repository_object as Record<string, unknown>).unexpected = "field";
    const execution = (forged.executions as Array<Record<string, unknown>>)[0]!;
    execution.unexpected = true;
    execution.state = "mystery";
    execution.failure_reason = "invented_failure";
    (execution.command as Record<string, unknown>).unexpected = "field";
    (execution.stdout_ref as Record<string, unknown>).unexpected = "field";
    (execution.subject_start_state as Record<string, unknown>).unexpected = "field";
    const errors = await validateNativeGateCoverage(
      forged as unknown as typeof coverage,
      discovery,
      object,
      evidence,
      { validation_time: new Date(Date.now() + 1_000) },
    );
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("coverage has unexpected keys"),
      expect.stringContaining("closing_repository_object has unexpected keys"),
      expect.stringContaining("execution[\"node:.:test\"].state is invalid"),
      expect.stringContaining("failure_reason is invalid"),
      expect.stringContaining("command has unexpected keys"),
      expect.stringContaining("stdout_ref has unexpected keys"),
      expect.stringContaining("subject_start_state has unexpected keys"),
    ]));
  });

  it("rejects output tampering and result reuse against another discovery", async () => {
    const first = fixture("tamper-first");
    writePackage(first.repo, "bun", { test: "node gate.mjs" });
    writeFileSync(join(first.repo, "gate.mjs"), "process.stdout.write('first\\n');\n");
    commit(first.repo);
    const firstObject = captureRepositoryObject(first.repo);
    const firstDiscovery = discoverNativeGates(first.repo, firstObject);
    const coverage = await runNativeGates(first.repo, firstDiscovery, first.evidence, { timeout_ms: 5_000 });
    writeFileSync(join(first.evidence, coverage.executions[0]!.stdout_ref.path), "tampered\n");

    const tamperErrors = await validateNativeGateCoverage(
      coverage,
      firstDiscovery,
      firstObject,
      first.evidence,
      { validation_time: new Date(Date.now() + 1_000) },
    );
    expect(tamperErrors.some((error) => error.includes("stdout_ref.sha256"))).toBe(true);

    const commandTamper = structuredClone(coverage);
    Object.assign(commandTamper.executions[0]!.command, { argv: ["run", "build"] });
    const commandErrors = await validateNativeGateCoverage(
      commandTamper,
      firstDiscovery,
      firstObject,
      first.evidence,
      { validation_time: new Date(Date.now() + 1_000) },
    );
    expect(commandErrors.some((error) => error.includes("command does not match discovery"))).toBe(true);
    expect(commandErrors.some((error) => error.includes("coverage_sha256 mismatch"))).toBe(true);

    const second = fixture("tamper-second");
    writePackage(second.repo, "bun", { test: "node different.mjs" });
    writeFileSync(join(second.repo, "different.mjs"), "process.stdout.write('second\\n');\n");
    commit(second.repo);
    const secondObject = captureRepositoryObject(second.repo);
    const secondDiscovery = discoverNativeGates(second.repo, secondObject);
    const reuseErrors = await validateNativeGateCoverage(
      coverage,
      secondDiscovery,
      secondObject,
      first.evidence,
      { validation_time: new Date(Date.now() + 1_000) },
    );
    expect(reuseErrors.some((error) => error.includes("discovery"))).toBe(true);
  });
});
