/**
 * Master-gate S1: the judge must not hand a target repository the operator's
 * powers. Gates get a minimal PATH and a credential-free CARGO_HOME, and no git
 * call against a target runs a program its own .git/config names.
 */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { runCli, type CliIO } from "../cli.js";
import { LocalRunReceiptStore } from "../run-receipt.js";
import { mintServerAttestationBinding } from "../runtime-binding.js";
import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";
import { fixture as cleanBundleFixture, removeTemporaryRoots, validateBundle } from "./bundle.test-fixture.js";
import { hardenedGitArgs, hardenedGitEnv } from "./git-hardening.js";
import { discoverNativeGates } from "./native-gates.js";
import { gateShimDirectory, materializeGateShims, resolveExecutable, runNativeGates, scrubbedEnvironment } from "./native-gate-runner.js";
import { prepareCloseout } from "./prepare.js";
import { captureRepositoryObject } from "./repository-object.js";

const SOURCE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FAKE_CREDENTIAL_CLI = "fake-credential-cli";
const SIBLING_CREDENTIAL_CLI = "fake-sibling-credential-cli";
const SOURCE_RUNTIME = mintServerAttestationBinding({
  record_type: "mister-clean.runtime-attestation-binding",
  schema_version: "1.0",
  status: "source_development",
  package_root: "/fixture/mister-clean",
  package_root_realpath: "/fixture/mister-clean",
  entrypoint: { path: "./src/cli.ts", realpath: "/fixture/mister-clean/src/cli.ts", sha256: "a".repeat(64) },
  reason: "execution safety test source execution",
});

// A credential CLI on the operator's PATH, in a directory that holds no
// toolchain. Planted before any gate resolves its toolchain for this process.
const credentialBin = mkdtempSync(join(tmpdir(), "mister-clean-credential-bin-"));
writeFileSync(join(credentialBin, FAKE_CREDENTIAL_CLI), "#!/bin/sh\necho secret\n");
chmodSync(join(credentialBin, FAKE_CREDENTIAL_CLI), 0o755);
// A credential CLI in the SAME directory as a toolchain binary (here a fake `go`),
// the Homebrew layout where op, gh and gcloud sit beside node and git.
const toolchainBin = mkdtempSync(join(tmpdir(), "mister-clean-toolchain-bin-"));
for (const name of [SIBLING_CREDENTIAL_CLI, "go"]) {
  writeFileSync(join(toolchainBin, name), "#!/bin/sh\necho sibling\n");
  chmodSync(join(toolchainBin, name), 0o755);
}
process.env.PATH = `${toolchainBin}${delimiter}${credentialBin}${delimiter}${process.env.PATH ?? ""}`;

const roots: string[] = [credentialBin, toolchainBin];
afterEach(async () => {
  for (const root of roots.splice(2)) rmSync(root, { recursive: true, force: true });
  await removeTemporaryRoots();
});

function scratch(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `mister-clean-execution-safety-${name}-`));
  roots.push(root);
  return root;
}

function capture(): { io: CliIO; stderr: string[]; stdout: string[] } {
  const stderr: string[] = [];
  const stdout: string[] = [];
  return { io: { stderr: (line) => stderr.push(line), stdout: (line) => stdout.push(line) }, stderr, stdout };
}

/** A repository whose one native gate is `bun run test` -> `sh probe.sh`. */
function probeRepository(name: string, probe: string): { readonly repo: string; readonly evidence: string } {
  const root = scratch(name);
  const repo = join(root, "repo");
  const evidence = join(root, "evidence");
  createFixtureRepository(repo, { identity: { name: "Execution Safety Fixture", email: "execution-safety.invalid" } });
  writeFileSync(join(repo, "package.json"), `${JSON.stringify({
    name: "execution-safety-fixture",
    private: true,
    packageManager: "bun@1.0.0",
    scripts: { test: "sh probe.sh" },
  }, null, 2)}\n`);
  writeFileSync(join(repo, "bun.lock"), "fixture lock\n");
  writeFileSync(join(repo, "probe.sh"), probe);
  fixtureCommit(repo, "fixture");
  return { repo, evidence };
}

async function runProbe(repo: string, evidence: string) {
  const discovery = discoverNativeGates(repo, captureRepositoryObject(repo));
  const coverage = await runNativeGates(repo, discovery, evidence, { timeout_ms: 30_000 });
  const execution = coverage.executions[0]!;
  const stdout = readFileSync(join(evidence, execution.stdout_ref.path), "utf8");
  return { execution, stdout };
}

/** A script git runs as core.fsmonitor; it records each invocation in `marker`. */
function plantFsmonitor(repo: string, root: string): string {
  const marker = join(root, "fsmonitor-ran");
  const hook = join(root, "fsmonitor-hook.sh");
  writeFileSync(hook, `#!/bin/sh\necho ran >> "${marker}"\nexit 1\n`);
  chmodSync(hook, 0o755);
  writeFileSync(join(repo, ".git", "config"), `${readFileSync(join(repo, ".git", "config"), "utf8")}[core]\n\tfsmonitor = ${hook}\n`);
  return marker;
}

describe("execution safety (master-gate S1)", { timeout: 180_000 }, () => {
  describe("minimal path", () => {
    it("the gate PATH is one per-gate shim directory holding only the resolved toolchain executables", () => {
      const home = scratch("path-home");
      materializeGateShims(home);
      const path = scrubbedEnvironment(home).PATH ?? "";
      expect(path.split(delimiter)).toEqual([gateShimDirectory(home)]);
      const shims = readdirSync(gateShimDirectory(home)).sort();
      expect(shims).toContain("node");
      expect(shims).toContain("go");
      expect(shims).not.toContain(FAKE_CREDENTIAL_CLI);
      expect(shims).not.toContain(SIBLING_CREDENTIAL_CLI);
      const node = resolveExecutable("node", process.env.PATH ?? "");
      expect(realpathSync(join(gateShimDirectory(home), "node"))).toBe(node!.resolved);
    });

    it("a credential CLI in the same directory as a toolchain binary is not reachable by name", async () => {
      const { repo, evidence } = probeRepository("sibling-credential-cli", [
        "#!/bin/sh",
        `if command -v ${SIBLING_CREDENTIAL_CLI} >/dev/null 2>&1; then echo "reachable"; exit 7; fi`,
        "command -v go >/dev/null 2>&1 || { echo \"no go\"; exit 8; }",
        "echo isolated",
        "",
      ].join("\n"));
      const { execution, stdout } = await runProbe(repo, evidence);
      expect(stdout).toBe("isolated\n");
      expect(execution.state).toBe("passed");
    });

    it("a gate cannot reach a credential CLI on the operator's PATH by name, but still finds its toolchain", async () => {
      const { repo, evidence } = probeRepository("credential-cli", [
        "#!/bin/sh",
        `if command -v ${FAKE_CREDENTIAL_CLI} >/dev/null 2>&1; then echo "reachable"; exit 7; fi`,
        "command -v node >/dev/null 2>&1 || { echo \"no node\"; exit 8; }",
        "echo isolated",
        "",
      ].join("\n"));
      const { execution, stdout } = await runProbe(repo, evidence);
      expect(stdout).toBe("isolated\n");
      expect(execution.state).toBe("passed");
    });
  });

  describe("minimal path toolchains", () => {
    const has = (name: string): boolean => resolveExecutable(name, process.env.PATH ?? "") !== undefined;

    it.skipIf(!has("npm") || !has("pnpm"))("npm and pnpm gates still run node from the shim PATH", async () => {
      for (const manager of ["npm", "pnpm"] as const) {
        const root = scratch(`${manager}-node`);
        const repo = join(root, "repo");
        createFixtureRepository(repo, { identity: { name: "Toolchain Fixture", email: "toolchain.invalid" } });
        writeFileSync(join(repo, ".gitignore"), "node_modules/\n");
        writeFileSync(join(repo, "package.json"), `${JSON.stringify({
          name: `${manager}-node-fixture`,
          private: true,
          scripts: { test: "node -e \"process.stdout.write('node ran\\\\n')\"" },
        }, null, 2)}\n`);
        // The lockfile alone selects the manager. A declared packageManager makes pnpm
        // manage its own version and rewrite the lockfile, which the gate's mutation
        // guard rightly refuses.
        writeFileSync(join(repo, manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml"), manager === "npm" ? "{}\n" : "lockfileVersion: '9.0'\n");
        if (manager === "pnpm") {
          // In the clean-CI capsule pnpm rewrites a placeholder lockfile before it runs a
          // script (seen: " M pnpm-lock.yaml"). Settle it once, in the exact gate
          // environment, so the gate run has nothing to write.
          const settleHome = scratch("pnpm-settle-home");
          const pnpm = resolveExecutable("pnpm", process.env.PATH ?? "")!;
          materializeGateShims(settleHome, pnpm);
          const settled = spawnSync(pnpm.invoked, ["install", "--lockfile-only", "--offline"], { cwd: repo, env: scrubbedEnvironment(settleHome, pnpm), encoding: "utf8" });
          expect(settled.status, settled.stderr).toBe(0);
        }
        fixtureCommit(repo, "fixture");
        const { execution, stdout } = await runProbe(repo, join(root, "evidence"));
        const stderr = readFileSync(join(root, "evidence", execution.stderr_ref.path), "utf8");
        expect(stdout, `${manager}: ${stderr.slice(-1500)}`).toContain("node ran");
        expect(`${manager}:${execution.state}:${String(execution.failure_reason)}`, stderr.slice(-1500)).toBe(`${manager}:passed:null`);
      }
    });

    it.skipIf(!has("cargo") || !has("cc"))("a cargo gate still runs rustc (through the rustup proxy) and links with cc", async () => {
      const root = scratch("cargo-rustc");
      const repo = join(root, "repo");
      createFixtureRepository(repo, { identity: { name: "Toolchain Fixture", email: "toolchain.invalid" } });
      writeFileSync(join(repo, ".gitignore"), "target/\nCargo.lock\n");
      writeFileSync(join(repo, "Cargo.toml"), "[package]\nname = \"shim-fixture\"\nversion = \"0.1.0\"\nedition = \"2021\"\n");
      mkdirSync(join(repo, "src"));
      writeFileSync(join(repo, "src", "lib.rs"), "#[test]\nfn links() { assert_eq!(1 + 1, 2); }\n");
      fixtureCommit(repo, "fixture");
      const { execution } = await runProbe(repo, join(root, "evidence"));
      const stderr = readFileSync(join(root, "evidence", execution.stderr_ref.path), "utf8");
      expect(`${execution.state}:${String(execution.failure_reason)}`, stderr.slice(-2000)).toBe("passed:null");
    });
  });

  describe("cargo credentials", () => {
    it("a gate sees a CARGO_HOME without credentials files or registry tokens, whose registry cache stays readable", async () => {
      const operatorCargo = join(scratch("operator-cargo"), "cargo");
      mkdirSync(join(operatorCargo, "registry", "cache"), { recursive: true });
      mkdirSync(join(operatorCargo, "git", "db"), { recursive: true });
      writeFileSync(join(operatorCargo, "registry", "cache", "crate.txt"), "cached crate\n");
      writeFileSync(join(operatorCargo, "credentials.toml"), "[registry]\ntoken = \"planted-registry-token\"\n");
      writeFileSync(join(operatorCargo, "credentials"), "[registry]\ntoken = \"planted-registry-token\"\n");
      const saved = { home: process.env.CARGO_HOME, token: process.env.CARGO_REGISTRY_TOKEN };
      process.env.CARGO_HOME = operatorCargo;
      process.env.CARGO_REGISTRY_TOKEN = "planted-env-token";
      try {
        const { repo, evidence } = probeRepository("cargo-credentials", [
          "#!/bin/sh",
          "if [ \"$CARGO_HOME\" = \"\" ]; then echo \"no cargo home\"; exit 2; fi",
          "if [ -e \"$CARGO_HOME/credentials.toml\" ] || [ -e \"$CARGO_HOME/credentials\" ]; then echo \"credentials readable\"; exit 3; fi",
          "if env | grep -q REGISTRY_TOKEN; then echo \"token in env\"; exit 4; fi",
          "cat \"$CARGO_HOME/registry/cache/crate.txt\" || exit 5",
          "[ -d \"$CARGO_HOME/git/db\" ] || { echo \"no git cache\"; exit 6; }",
          "",
        ].join("\n"));
        const { execution, stdout } = await runProbe(repo, evidence);
        expect(stdout).toBe("cached crate\n");
        expect(execution.state).toBe("passed");
      } finally {
        if (saved.home === undefined) delete process.env.CARGO_HOME; else process.env.CARGO_HOME = saved.home;
        if (saved.token === undefined) delete process.env.CARGO_REGISTRY_TOKEN; else process.env.CARGO_REGISTRY_TOKEN = saved.token;
      }
    });
  });

  describe("git config hardening", () => {
    it("audit runs no program the target's core.fsmonitor names", async () => {
      const root = scratch("fsmonitor-audit");
      const repo = join(root, "repo");
      createFixtureRepository(repo, { identity: { name: "Fsmonitor Fixture", email: "fsmonitor.invalid" } });
      writeFileSync(join(repo, "README.md"), "fixture\n");
      fixtureCommit(repo, "fixture");
      const marker = plantFsmonitor(repo, root);
      const store = new LocalRunReceiptStore(join(root, "receipts"));
      for (const family of [["planning"], ["public-safety", "--tracked"], ["semantic"], ["github-actions"], ["language-policy"], ["repository-boundaries"]]) {
        const [name, ...flags] = family;
        await runCli(["audit", name!, repo, ...flags, "--json"], capture().io, undefined, undefined, store);
      }
      expect(existsSync(marker)).toBe(false);
    });

    it("prepare and validate run no program the target's core.fsmonitor names", async () => {
      const root = scratch("fsmonitor-prepare");
      const repo = join(root, "repo");
      createFixtureRepository(repo, { identity: { name: "Fsmonitor Fixture", email: "fsmonitor.invalid" } });
      writeFileSync(join(repo, "README.md"), "fixture\n");
      fixtureCommit(repo, "fixture");
      const marker = plantFsmonitor(repo, root);
      const prepared = await prepareCloseout({
        repo,
        evidenceHome: join(root, "evidence"),
        runId: "fsmonitor",
        requestRef: "request-1",
        runtimeAttestation: SOURCE_RUNTIME,
        processPort: {
          processTable: () => [{ pid: process.pid, ppid: 0, start_identity: "execution-safety", executable: process.execPath }],
          pathTable: () => new Map([[process.pid, { cwd: "/", open_paths: [] }]]),
        },
      });
      expect(existsSync(marker)).toBe(false);
      await runCli(["validate", "bundle", prepared.bundlePath, "--repo", repo], capture().io, undefined, undefined, new LocalRunReceiptStore(join(root, "receipts")));
      expect(existsSync(marker)).toBe(false);
    });

    it("live validation of a CLEAN bundle runs no program the target's core.fsmonitor names", async () => {
      const value = await cleanBundleFixture();
      const marker = plantFsmonitor(value.repo, value.root);
      await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
      expect(existsSync(marker)).toBe(false);
    });

    it("neutralises filter drivers, hooks, ssh, external diff and credential helpers, and drops system config", () => {
      const root = scratch("filter-driver");
      const repo = join(root, "repo");
      createFixtureRepository(repo, { identity: { name: "Filter Fixture", email: "filter.invalid" } });
      const marker = join(root, "filter-ran");
      writeFileSync(join(repo, ".gitattributes"), "*.txt filter=evil\n");
      writeFileSync(join(repo, "a.txt"), "a\n");
      fixtureCommit(repo, "fixture");
      writeFileSync(join(repo, ".git", "config"), `${readFileSync(join(repo, ".git", "config"), "utf8")}[filter "evil"]\n\tclean = sh -c 'echo ran >> "${marker}"; cat'\n\trequired = true\n`);
      writeFileSync(join(repo, "a.txt"), "changed\n");
      const args = hardenedGitArgs(["--no-optional-locks", "-C", repo, "hash-object", "a.txt"]);
      for (const override of ["core.fsmonitor=false", "core.hooksPath=/dev/null", "core.sshCommand=ssh", "diff.external=", "credential.helper=", "filter.evil.clean=", "filter.evil.required=false"]) {
        expect(args).toContain(override);
      }
      expect(hardenedGitEnv({}).GIT_CONFIG_NOSYSTEM).toBe("1");
      const result = spawnSync("git", args, { encoding: "utf8", env: hardenedGitEnv() });
      expect(result.status).toBe(0);
      expect(existsSync(marker)).toBe(false);
    });

    it("every git spawn in the source routes through the hardened argv and environment", () => {
      const offenders: string[] = [];
      const walk = (directory: string): void => {
        for (const name of readdirSync(directory, { withFileTypes: true })) {
          const path = join(directory, name.name);
          if (name.isDirectory()) { if (name.name !== "test-support") walk(path); continue; }
          if (!name.name.endsWith(".ts") || name.name.endsWith(".test.ts") || name.name.includes("test-fixture")) continue;
          if (name.name === "git-hardening.ts" || name.name === "generated-materials.ts") continue;
          const text = readFileSync(path, "utf8");
          for (const match of text.matchAll(/\b(?:spawnSync|execFileSync|execFileAsync|execFile|spawn)\(\s*"git",\s*([^\n]*)/gu)) {
            if (!match[1]!.startsWith("hardenedGitArgs(")) offenders.push(`${relative(SOURCE_ROOT, path)}: ${match[0].slice(0, 80)}`);
          }
          if (text.includes("hardenedGitArgs(") && !text.includes("hardenedGitEnv(")) offenders.push(`${relative(SOURCE_ROOT, path)}: git argv hardened without hardenedGitEnv`);
        }
      };
      walk(SOURCE_ROOT);
      expect(offenders).toEqual([]);
    });
  });
});
