/**
 * Master-gate S1: the judge must not hand a target repository the operator's
 * powers. Gates get a minimal PATH and a credential-free CARGO_HOME, and no git
 * call against a target runs a program its own .git/config names.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { runCli, type CliIO } from "../cli.js";
import { LocalRunReceiptStore } from "../run-receipt.js";
import { mintServerAttestationBinding } from "../runtime-binding.js";
import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";
import { fixture as cleanBundleFixture, git, removeTemporaryRoots, successor, validateBundle, type RecordValue } from "./bundle.test-fixture.js";
import { discoverNativeGates } from "./native-gates.js";
import { gateShimDirectory, materializeGateShims, resolveExecutable, runNativeGates, scrubbedEnvironment } from "./native-gate-runner.js";
import { GitConfigSnapshotError, gitConfigSnapshot, hardenedGitArgs, hardenedGitEnv, hardenedRemoteUrl } from "./git-hardening.js";
import { nodeGitPort } from "./bundle.js";
import { prepareCloseout } from "./prepare.js";
import { captureRepositoryObject } from "./repository-object.js";

const SOURCE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FAKE_CREDENTIAL_CLI = "fake-credential-cli";
const SIBLING_CREDENTIAL_CLI = "fake-sibling-credential-cli";
// Split so the fixture's own source is not a credential assignment the public-safety scan finds.
const CREDENTIAL_SENTINEL = "fixture-not-a-real-credential";
const CREDENTIAL_LINE = ["password", CREDENTIAL_SENTINEL].join("=");
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
function probeRepository(name: string, probe: string, options: { readonly root?: string } = {}): { readonly repo: string; readonly evidence: string } {
  const root = options.root ?? scratch(name);
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
  // DEBUG

  const discovery = discoverNativeGates(repo, captureRepositoryObject(repo));
  const coverage = await runNativeGates(repo, discovery, evidence, { timeout_ms: 30_000 });
  const execution = coverage.executions[0]!;
  if (process.env.S1B_DEBUG === "1") process.stderr.write(`S1B state=${execution.state} reason=${String(execution.failure_reason)}\n`);
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


  describe("gate git credentials", () => {
    it("a gate's git cannot reach a credential helper, even one its own HOME declares", async () => {
      const root = scratch("gate-credentials");
      const marker = join(root, "credential-helper-ran");
      const helper = join(root, "helper.sh");
      writeFileSync(helper, `#!/bin/sh\necho ran >> "${marker}"\necho "${CREDENTIAL_LINE}"\n`);
      chmodSync(helper, 0o755);
      const { repo, evidence } = probeRepository("gate-credentials", [
        "#!/bin/sh",
        // Target code owns its HOME, so it declares the helper in its own global config.
        `git config --global credential.helper "${helper}"`,
        // Scratch goes to the gate HOME: a write inside the repository would be a mutation.
        "printf 'protocol=https\\nhost=example.invalid\\n\\n' | git credential fill > \"$HOME/filled.txt\" 2>\"$HOME/fill-err.txt\" || true",
        `if grep -q ${CREDENTIAL_SENTINEL} "$HOME/filled.txt" "$HOME/fill-err.txt"; then echo leaked; exit 7; fi`,
        "if [ \"$GIT_CONFIG_NOSYSTEM\" != 1 ]; then echo \"system config reachable\"; exit 8; fi",
        "if [ \"$GIT_TERMINAL_PROMPT\" != 0 ]; then echo \"terminal prompt allowed\"; exit 9; fi",
        "echo no-credential",
        "",
      ].join("\n"), { root });
      const { execution, stdout } = await runProbe(repo, evidence);
      const stderr = readFileSync(join(evidence, execution.stderr_ref.path), "utf8");
      expect(existsSync(marker), `${stdout}${stderr.slice(-800)}`).toBe(false);
      expect(stdout, stderr).toBe("no-credential\n");
      expect(execution.state, stderr.slice(-800)).toBe("passed");
    });

    it("the injected credential.helper outranks both a global and a system config that declare one", () => {
      const root = scratch("credential-precedence");
      const marker = join(root, "precedence-helper-ran");
      const helper = join(root, "helper.sh");
      writeFileSync(helper, `#!/bin/sh\necho ran >> "${marker}"\necho "${CREDENTIAL_LINE}"\n`);
      chmodSync(helper, 0o755);
      const home = join(root, "home");
      mkdirSync(home);
      writeFileSync(join(home, ".gitconfig"), `[credential]\n\thelper = ${helper}\n`);
      const systemConfig = join(root, "system-gitconfig");
      writeFileSync(systemConfig, `[credential]\n\thelper = ${helper}\n`);
      const gate = resolveExecutable("git", process.env.PATH ?? "")!;
      materializeGateShims(home, gate);
      const filled = spawnSync(gate.invoked, ["credential", "fill"], {
        cwd: root,
        encoding: "utf8",
        input: "protocol=https\nhost=example.invalid\n\n",
        // GIT_CONFIG_SYSTEM stands in for /etc/gitconfig, which a test cannot write.
        env: { ...scrubbedEnvironment(home, gate), GIT_CONFIG_SYSTEM: systemConfig },
      });
      expect(filled.stdout).not.toContain(CREDENTIAL_SENTINEL);
      expect(existsSync(marker)).toBe(false);
    });
  });

  describe("git env scrub", () => {
    const inherited = {
      GIT_DIR: "/parent/.git",
      GIT_WORK_TREE: "/parent",
      GIT_EXEC_PATH: "/parent/exec",
      GIT_SSH: "/parent/ssh",
      GIT_SSH_COMMAND: "ssh -o StrictHostKeyChecking=no",
      GIT_ASKPASS: "/parent/askpass",
      GIT_EXTERNAL_DIFF: "/parent/diff",
      GIT_CONFIG_GLOBAL: "/parent/gitconfig",
      GIT_CONFIG_PARAMETERS: "'credential.helper=/parent/helper'",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.hooksPath",
      GIT_CONFIG_VALUE_0: "/parent/hooks",
      GIT_ALTERNATE_OBJECT_DIRECTORIES: "/parent/objects",
      GIT_NAMESPACE: "parent",
    } as const;

    it("the hardened git environment keeps no inherited GIT_ variable and adds only the hardening's own", () => {
      const environment = hardenedGitEnv({ ...inherited, PATH: "/usr/bin", HOME: "/home/judge", LC_ALL: "C", SOME_OTHER: "kept" });
      for (const name of Object.keys(inherited)) {
        if (name === "GIT_CONFIG_COUNT" || name.startsWith("GIT_CONFIG_KEY_") || name.startsWith("GIT_CONFIG_VALUE_")) continue;
        expect(environment[name], name).toBeUndefined();
      }
      // The injection is the hardening's own, so it names its own keys and values.
      const count = Number(environment.GIT_CONFIG_COUNT ?? 0);
      expect(count).toBeGreaterThan(0);
      const keys = Array.from({ length: count }, (_, index) => environment[`GIT_CONFIG_KEY_${index}`]);
      expect(keys).toContain("credential.helper");
      expect(keys).not.toContain("core.hooksPath");
      expect(environment.PATH).toBe("/usr/bin");
      expect(environment.HOME).toBe("/home/judge");
      expect(environment.GIT_CONFIG_NOSYSTEM).toBe("1");
      expect(environment.GIT_TERMINAL_PROMPT).toBe("0");
    });

    it("a judge git call ignores a parent GIT_DIR that would otherwise redirect it", async () => {
      const root = scratch("git-env-scrub");
      const repo = join(root, "repo");
      createFixtureRepository(repo, { identity: { name: "Scrub Fixture", email: "scrub.invalid" } });
      writeFileSync(join(repo, "README.md"), "fixture\n");
      fixtureCommit(repo, "fixture");
      const decoy = join(root, "decoy");
      createFixtureRepository(decoy, { identity: { name: "Decoy Fixture", email: "decoy.invalid" } });
      writeFileSync(join(decoy, "DECOY.md"), "decoy\n");
      fixtureCommit(decoy, "decoy");
      const saved = { dir: process.env.GIT_DIR, ssh: process.env.GIT_SSH_COMMAND };
      process.env.GIT_DIR = join(decoy, ".git");
      process.env.GIT_SSH_COMMAND = "/nonexistent/ssh";
      try {
        const tracked = await nodeGitPort.run(repo, ["ls-files"]);
        expect(tracked.stdout.split("\n")).toContain("README.md");
        expect(tracked.stdout).not.toContain("DECOY.md");
      } finally {
        if (saved.dir === undefined) delete process.env.GIT_DIR; else process.env.GIT_DIR = saved.dir;
        if (saved.ssh === undefined) delete process.env.GIT_SSH_COMMAND; else process.env.GIT_SSH_COMMAND = saved.ssh;
      }
    });

    it("a gate's environment carries no inherited GIT_ variable", () => {
      const saved = process.env.GIT_SSH_COMMAND;
      process.env.GIT_SSH_COMMAND = "ssh -o StrictHostKeyChecking=no";
      try {
        const environment = scrubbedEnvironment(scratch("gate-git-env"));
        expect(environment.GIT_SSH_COMMAND).toBeUndefined();
      } finally {
        if (saved === undefined) delete process.env.GIT_SSH_COMMAND; else process.env.GIT_SSH_COMMAND = saved;
      }
    });
  });

  describe("git program keys", () => {
    /** A repository whose own config points one key at a marker-writing program. */
    function configured(name: string, value: (program: string) => string): { readonly repo: string; readonly marker: string; readonly program: string } {
      const root = scratch(`program-key-${name}`);
      const repo = join(root, "repo");
      createFixtureRepository(repo, { identity: { name: "Program Key Fixture", email: "program-key.invalid" } });
      const marker = join(root, "ran");
      const program = join(root, "program.sh");
      writeFileSync(program, `#!/bin/sh\necho ran >> "${marker}"\nexit 1\n`);
      chmodSync(program, 0o755);
      writeFileSync(join(repo, "README.md"), "fixture\n");
      fixtureCommit(repo, "fixture");
      appendFileSync(join(repo, ".git", "config"), value(program));
      return { repo, marker, program };
    }

    const cases: ReadonlyArray<{
      readonly key: string;
      readonly config: (program: string) => string;
      /** What git resolves the key to under the hardening. */
      readonly neutral: string;
      /** A call that really runs the key's program, where one exists without a TTY or an editor. */
      readonly trigger?: (repo: string) => readonly string[];
    }> = [
      { key: "core.askPass", config: (p) => `[core]\n\taskPass = ${p}\n`, neutral: "", trigger: (repo) => ["-C", repo, "credential", "fill"] },
      { key: "gpg.program", config: (p) => `[gpg]\n\tprogram = ${p}\n`, neutral: "false", trigger: (repo) => ["-C", repo, "-c", "commit.gpgsign=true", "commit", "--allow-empty", "-m", "signed"] },
      { key: "core.pager", config: (p) => `[core]\n\tpager = ${p}\n`, neutral: "cat" },
      { key: "core.editor", config: (p) => `[core]\n\teditor = ${p}\n`, neutral: "false" },
      // git runs the sequence editor on the todo file with no terminal, so it gets a marker proof.
      { key: "sequence.editor", config: (p) => `[sequence]\n\teditor = ${p}\n`, neutral: "false", trigger: (repo) => ["-C", repo, "rebase", "-i", "--root"] },
      { key: "core.alternateRefsCommand", config: (p) => `[core]\n\talternateRefsCommand = ${p}\n`, neutral: "" },
      { key: "gpg.ssh.program", config: (p) => `[gpg "ssh"]\n\tprogram = ${p}\n`, neutral: "" },
      { key: "remote.origin.vcs", config: (p) => `[remote "origin"]\n\turl = https://example.invalid/x.git\n\tvcs = ${p}\n`, neutral: "" },
      { key: "remote.origin.proxy", config: (p) => `[remote "origin"]\n\turl = https://example.invalid/x.git\n\tproxy = ${p}\n`, neutral: "" },
    ];

    // Resolution is a valid proof only for a scalar key, where an empty or neutral
    // `-c` value replaces the config value. core.gitProxy is multi-valued, so an
    // empty `-c` only appends; it has a marker proof below instead. The scalar keys
    // here were each checked with `git -c <key>= config --get <key>`: every one
    // returns the override, none keeps the target's program.
    it.each(cases)("neutralises $key, so git resolves it to the hardening's value and not to the program", ({ key, config, neutral }) => {
      const { repo, program } = configured(key.replaceAll(".", "-"), config);
      // Unhardened, git resolves the key to the target's program.
      const declared = spawnSync("git", ["-C", repo, "config", "--get", key], { encoding: "utf8", env: { ...process.env } });
      expect(declared.stdout.trim(), `${key}: the fixture did not declare the key, so the case proves nothing`).toBe(program);

      const hardened = spawnSync("git", hardenedGitArgs(["-C", repo, "config", "--get", key]), { encoding: "utf8", env: hardenedGitEnv() });
      expect(hardened.stdout.trim(), key).toBe(neutral);
    });

    it("neutralises remote.<name>.vcs, so the remote helper it names never runs", () => {
      // remote.<name>.vcs=<v> makes git run the helper git-remote-<v> from PATH, with no terminal.
      const root = scratch("remote-vcs-helper");
      const repo = join(root, "repo");
      createFixtureRepository(repo, { identity: { name: "VCS Fixture", email: "vcs.invalid" } });
      writeFileSync(join(repo, "README.md"), "fixture\n");
      fixtureCommit(repo, "fixture");
      const marker = join(root, "vcs-helper-ran");
      const helpers = join(root, "helpers");
      mkdirSync(helpers);
      writeFileSync(join(helpers, "git-remote-mcfixture"), `#!/bin/sh\necho ran >> "${marker}"\nexit 1\n`);
      chmodSync(join(helpers, "git-remote-mcfixture"), 0o755);
      appendFileSync(join(repo, ".git", "config"), "[remote \"origin\"]\n\turl = https://example.invalid/x.git\n\tvcs = mcfixture\n");
      const path = `${helpers}${delimiter}${process.env.PATH ?? ""}`;
      spawnSync("git", ["-C", repo, "ls-remote", "origin"], { encoding: "utf8", env: { ...process.env, PATH: path, GIT_TERMINAL_PROMPT: "0" }, timeout: 30_000 });
      expect(existsSync(marker), "remote.origin.vcs: the unhardened fixture never ran its helper, so the case proves nothing").toBe(true);
      rmSync(marker);
      spawnSync("git", hardenedGitArgs(["-C", repo, "ls-remote", "origin"]), { encoding: "utf8", env: hardenedGitEnv({ ...process.env, PATH: path }), timeout: 30_000 });
      expect(existsSync(marker), "remote.origin.vcs").toBe(false);
    });

    it("neutralises core.gitProxy, a multi-valued key an empty -c cannot reset, so its program never runs on a git:// fetch", () => {
      const { repo, marker } = configured("core-gitProxy", (p) => `[core]\n\tgitProxy = ${p}\n`);
      // Unhardened, the proxy program runs for a git:// remote; that is what must be prevented.
      spawnSync("git", ["-C", repo, "ls-remote", "git://localhost/x"], { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, timeout: 30_000 });
      expect(existsSync(marker), "core.gitProxy: the unhardened fixture never ran its program, so the case proves nothing").toBe(true);
      rmSync(marker);
      // An empty -c core.gitProxy= would only append to the list; protocol.git.allow=never is what bites.
      spawnSync("git", hardenedGitArgs(["-C", repo, "ls-remote", "git://localhost/x"]), { encoding: "utf8", env: hardenedGitEnv(), timeout: 30_000 });
      expect(existsSync(marker), "core.gitProxy").toBe(false);
    });

    it.each(cases.filter((item) => item.trigger !== undefined))("$key: the program it names never runs", ({ key, config, trigger }) => {
      const { repo, marker } = configured(`${key.replaceAll(".", "-")}-trigger`, config);
      const input = "protocol=https\nhost=example.invalid\n\n";
      // Unhardened, the key's program runs; that is what the hardening must prevent.
      spawnSync("git", [...trigger!(repo)], { encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, input, timeout: 30_000 });
      expect(existsSync(marker), `${key}: the unhardened fixture never ran its program, so the case proves nothing`).toBe(true);
      rmSync(marker);

      spawnSync("git", hardenedGitArgs([...trigger!(repo)]), { encoding: "utf8", env: hardenedGitEnv(), input, timeout: 30_000 });
      expect(existsSync(marker), key).toBe(false);
    });

    it("injects the keys that must outrank every config file", () => {
      // Defence in depth: GIT_TERMINAL_PROMPT already suppresses askPass, and the -c set
      // plus git's protected-config rules already refuse ext:: on the calls we make. Each
      // key is still injected, so no config file can re-enable it on a call we add later.
      const environment = hardenedGitEnv({});
      const injected = new Map(Array.from(
        { length: Number(environment.GIT_CONFIG_COUNT ?? 0) },
        (_, index) => [environment[`GIT_CONFIG_KEY_${index}`], environment[`GIT_CONFIG_VALUE_${index}`]] as const,
      ));
      expect(injected.get("credential.helper")).toBe("");
      expect(injected.get("protocol.ext.allow")).toBe("never");
      expect(injected.get("protocol.git.allow")).toBe("never");
      expect(injected.get("core.askPass")).toBe("");
    });

    it("an option-shaped remote name cannot become a git option, and the transport check binds to the contacted remote", async () => {
      // D1: a bundle-controlled remote name must not reach argv as a leading-dash option,
      // and the URL checked must be the URL contacted (no silent fallback to origin).
      const root = scratch("remote-argv");
      const repo = join(root, "repo");
      createFixtureRepository(repo, { identity: { name: "Argv Fixture", email: "argv.invalid" } });
      writeFileSync(join(repo, "README.md"), "fixture\n");
      fixtureCommit(repo, "fixture");
      // An ordinary https origin, so a fallback-to-origin would pass the transport check.
      await expect(hardenedRemoteUrl(repo, "origin", nodeGitPort)).rejects.toThrow(/not a configured remote/i);
      await git(repo, "remote", "add", "origin", "https://example.invalid/x.git");

      const marker = join(root, "upload-pack-ran");
      const program = join(root, "upload-pack.sh");
      writeFileSync(program, `#!/bin/sh\necho ran >> "${marker}"\n`);
      chmodSync(program, 0o755);
      // The option-shaped name is refused outright, so it never reaches ls-remote argv.
      await expect(hardenedRemoteUrl(repo, `--upload-pack=${program}`, nodeGitPort)).rejects.toThrow(/begin with '-'/i);
      // Even passed straight to ls-remote with the terminator, it cannot become an option.
      spawnSync("git", hardenedGitArgs(["-C", repo, "ls-remote", "--heads", "--end-of-options", `--upload-pack=${program}`, "."]), { encoding: "utf8", env: hardenedGitEnv(), timeout: 30_000 });
      expect(existsSync(marker)).toBe(false);
    });

    it("live validation refuses a target proof whose remote name is option-shaped", async () => {
      const value = await cleanBundleFixture();
      Object.assign(successor(value).target_observation as RecordValue, {
        kind: "remote_ref_resolution",
        remote: "--upload-pack=touch /tmp/mister-clean-should-not-exist",
        remote_ref: "refs/heads/main",
      });
      await value.persist();
      const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual(expect.stringMatching(/target_observation\.remote: .*begin with '-'/i));
    });

    it("refuses an ext:: transport, whether the config names it directly or through an insteadOf rewrite", () => {
      for (const [name, remote] of [["direct", "ext"], ["rewritten", "rewritten"]] as const) {
        const { repo, marker } = configured(`ext-${name}`, (p) => (name === "direct"
          ? `[remote "ext"]\n\turl = ext::${p}\n[protocol "ext"]\n\tallow = always\n`
          : `[remote "rewritten"]\n\turl = https://example.invalid/x\n[url "ext::${p} "]\n\tinsteadOf = https://example.invalid/\n[protocol "ext"]\n\tallow = always\n`));
        spawnSync("git", ["-C", repo, "ls-remote", "--heads", remote], { encoding: "utf8", env: { ...process.env }, timeout: 30_000 });
        expect(existsSync(marker), `${name}: the unhardened fixture never ran its program, so the case proves nothing`).toBe(true);
        rmSync(marker);

        spawnSync("git", hardenedGitArgs(["-C", repo, "ls-remote", "--heads", remote]), { encoding: "utf8", env: hardenedGitEnv(), timeout: 30_000 });
        expect(existsSync(marker), name).toBe(false);
      }
    });

    it("refuses a remote target proof whose transport is neither https nor ssh", async () => {
      const root = scratch("remote-transport");
      const repo = join(root, "repo");
      createFixtureRepository(repo, { identity: { name: "Transport Fixture", email: "transport.invalid" } });
      writeFileSync(join(repo, "README.md"), "fixture\n");
      fixtureCommit(repo, "fixture");
      appendFileSync(join(repo, ".git", "config"), "[remote \"origin\"]\n\turl = ext::sh -c id\n");
      await expect(hardenedRemoteUrl(repo, "origin", nodeGitPort)).rejects.toThrow(/transport/i);
      appendFileSync(join(repo, ".git", "config"), "[remote \"https\"]\n\turl = https://example.invalid/x.git\n");
      await expect(hardenedRemoteUrl(repo, "https", nodeGitPort)).resolves.toBe("https://example.invalid/x.git");
    });

    it("live validation refuses a remote-ref target proof over a command transport", async () => {
      const value = await cleanBundleFixture();
      await git(value.repo, "remote", "add", "origin", "ext::sh -c id");
      await git(value.repo, "config", "protocol.ext.allow", "always");
      Object.assign(successor(value).target_observation as RecordValue, {
        kind: "remote_ref_resolution",
        remote: "origin",
        remote_ref: "refs/heads/main",
      });
      await value.persist();
      const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual(expect.stringMatching(/target_observation.*transport/i));
    });
  });

  describe("driver enumeration fails closed", () => {
    it("refuses the protected call with a typed error instead of running without the per-name overrides", () => {
      const root = scratch("enumeration-failure");
      const repo = join(root, "repo");
      createFixtureRepository(repo, { identity: { name: "Enumeration Fixture", email: "enumeration.invalid" } });
      writeFileSync(join(repo, "README.md"), "fixture\n");
      fixtureCommit(repo, "fixture");
      // An unreadable config makes the enumeration fail the way a timeout would.
      const config = join(repo, ".git", "config");
      writeFileSync(config, "[core]\n\trepositoryformatversion = 0\n[filter \"evil\"\n");
      expect(() => hardenedGitArgs(["--no-optional-locks", "-C", repo, "status", "--porcelain"]))
        .toThrow(GitConfigSnapshotError);
      try {
        hardenedGitArgs(["--no-optional-locks", "-C", repo, "status", "--porcelain"]);
      } catch (error) {
        expect((error as GitConfigSnapshotError).code).toBe("git_config_snapshot_unreadable");
        expect((error as Error).message).toMatch(/refus/i);
      }
    });

    it("derives the per-name overrides from one config snapshot, taken once per call", () => {
      const root = scratch("one-snapshot");
      const repo = join(root, "repo");
      createFixtureRepository(repo, { identity: { name: "Snapshot Fixture", email: "snapshot.invalid" } });
      writeFileSync(join(repo, "README.md"), "fixture\n");
      fixtureCommit(repo, "fixture");
      appendFileSync(join(repo, ".git", "config"), "[filter \"evil\"]\n\tclean = /bin/false\n[remote \"origin\"]\n\turl = https://example.invalid/x.git\n\tuploadpack = /bin/false\n");
      const snapshot = gitConfigSnapshot(repo);
      expect(snapshot.reads).toBe(1);
      const args = hardenedGitArgs(["--no-optional-locks", "-C", repo, "status", "--porcelain"]);
      for (const override of ["filter.evil.clean=", "filter.evil.required=false", "remote.origin.uploadpack=git-upload-pack"]) {
        expect(args).toContain(override);
      }
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
      for (const override of ["core.fsmonitor=false", "core.hooksPath=/dev/null", "core.sshCommand=ssh", "diff.external=", "filter.evil.clean=", "filter.evil.required=false"]) {
        expect(args).toContain(override);
      }
      // credential.helper outranks every config file, so it is injected, not passed as -c.
      const environment = hardenedGitEnv({});
      const injected = Array.from({ length: Number(environment.GIT_CONFIG_COUNT ?? 0) }, (_, index) => environment[`GIT_CONFIG_KEY_${index}`]);
      expect(injected).toContain("credential.helper");
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
