/**
 * Master-gate S1c: every native gate runs inside an OS sandbox, or is refused.
 * S1 and S1b took the operator's credentials off the gate's PATH, environment
 * and git config; these proofs show a gate cannot reach them by absolute path,
 * through a login shell, or by writing into shared caches either.
 *
 * Every credential here is a planted fake under a temporary operator HOME. The
 * operator's real credential stores are never read.
 */
import { createServer, type Server } from "node:net";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../cli.js";
import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";
import {
  GateSandboxUnavailableError,
  bwrapArguments,
  detectGateSandbox,
  gateSandboxPolicy,
  macosSandboxProfile,
  realGateSandboxHost,
  type GateSandboxHost,
} from "./gate-sandbox.js";
import { discoverNativeGates } from "./native-gates.js";
import { validateNativeGateCoverage } from "./native-gate-validation.js";
import { resolveExecutable, runNativeGates, toolchainLocators } from "./native-gate-runner.js";
import { captureRepositoryObject } from "./repository-object.js";

const SANDBOX_EXEC_PRESENT = process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
const BWRAP = process.platform === "linux" ? resolveExecutable("bwrap", process.env.PATH ?? "") : undefined;
const CONTAINER_MARKED = process.platform === "linux"
  && (existsSync("/.dockerenv") || existsSync("/run/.containerenv"));
// Split so the fixture's own source is not a credential assignment the public-safety scan finds.
const SENTINEL = ["fixture", "not", "a", "real", "credential"].join("-");

const roots: string[] = [];
const saved = { HOME: process.env.HOME, CARGO_HOME: process.env.CARGO_HOME };
afterEach(() => {
  if (saved.HOME === undefined) delete process.env.HOME; else process.env.HOME = saved.HOME;
  if (saved.CARGO_HOME === undefined) delete process.env.CARGO_HOME; else process.env.CARGO_HOME = saved.CARGO_HOME;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function scratch(name: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `mister-clean-gate-sandbox-${name}-`)));
  roots.push(root);
  return root;
}

function plant(path: string, content: string): string {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  return path;
}

/**
 * A temporary operator HOME with a fake credential in every location the
 * profile must deny, and a CARGO_HOME inside it. It becomes process.env.HOME
 * for the test, so the sandbox treats it as the operator's home.
 */
function operatorHome(): { readonly home: string; readonly cargo: string; readonly credentials: Readonly<Record<string, string>> } {
  const home = join(scratch("operator"), "home");
  const cargo = join(home, ".cargo");
  const credentials = {
    ssh: plant(join(home, ".ssh", "id_fixture"), `${SENTINEL}\n`),
    aws: plant(join(home, ".aws", "credentials"), `${SENTINEL}\n`),
    gh: plant(join(home, ".config", "gh", "hosts.yml"), `${SENTINEL}\n`),
    doppler: plant(join(home, ".config", "doppler", ".doppler.yaml"), `${SENTINEL}\n`),
    docker: plant(join(home, ".docker", "config.json"), `${SENTINEL}\n`),
    keychain: plant(join(home, "Library", "Keychains", "fixture.keychain-db"), `${SENTINEL}\n`),
    cargo_credentials: plant(join(cargo, "credentials"), `${SENTINEL}\n`),
    cargo_credentials_toml: plant(join(cargo, "credentials.toml"), `${SENTINEL}\n`),
  };
  plant(join(cargo, "registry", "cache", "crate.txt"), "cached crate\n");
  mkdirSync(join(cargo, "git", "db"), { recursive: true });
  process.env.HOME = home;
  process.env.CARGO_HOME = cargo;
  return { home, cargo, credentials };
}

/** A repository whose one native gate is `bun run test` -> `sh probe.sh`. */
function probeRepository(
  name: string,
  probe: string,
  files: Readonly<Record<string, string>> = {},
): { readonly repo: string; readonly evidence: string } {
  const root = scratch(name);
  const repo = join(root, "repo");
  createFixtureRepository(repo, { identity: { name: "Gate Sandbox Fixture", email: "gate-sandbox.invalid" } });
  writeFileSync(join(repo, "package.json"), `${JSON.stringify({
    name: "gate-sandbox-fixture",
    private: true,
    packageManager: "bun@1.0.0",
    scripts: { test: "sh probe.sh" },
  }, null, 2)}\n`);
  writeFileSync(join(repo, "bun.lock"), "fixture lock\n");
  writeFileSync(join(repo, "probe.sh"), probe);
  for (const [path, content] of Object.entries(files)) writeFileSync(join(repo, path), content);
  fixtureCommit(repo, "fixture");
  return { repo, evidence: join(root, "evidence") };
}

async function runProbe(repo: string, evidence: string, options: Parameters<typeof runNativeGates>[3] = {}) {
  const discovery = discoverNativeGates(repo, captureRepositoryObject(repo));
  const coverage = await runNativeGates(repo, discovery, evidence, { timeout_ms: 60_000, ...options });
  const execution = coverage.executions[0]!;
  const stdout = readFileSync(join(evidence, execution.stdout_ref.path), "utf8");
  const stderr = readFileSync(join(evidence, execution.stderr_ref.path), "utf8");
  return { discovery, coverage, execution, stdout, stderr };
}

/** A fake host for detection: only the named files exist. */
function fakeHost(platform: NodeJS.Platform, files: Readonly<Record<string, string>>, bwrap?: string): GateSandboxHost {
  return {
    platform,
    exists: (path) => Object.hasOwn(files, path),
    readFile: (path) => files[path],
    which: (name) => (name === "bwrap" ? bwrap : undefined),
    works: () => true,
  };
}

/** A real-host view in which no sandbox mechanism and no container marker exists. */
const NO_SANDBOX_HOST: GateSandboxHost = { ...realGateSandboxHost, exists: () => false, which: () => undefined };

function listen(): Promise<{ readonly server: Server; readonly port: number }> {
  return new Promise((resolveListen) => {
    const server = createServer((socket) => socket.end("hello\n"));
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveListen({ server, port: typeof address === "object" && address !== null ? address.port : 0 });
    });
  });
}

/** Connects to the loopback port given as its argument; exits zero only if the connection opens. */
const NET_PROBE = {
  "net-probe.ts": [
    "const port = Number(process.argv[2]);",
    "const socket = await Bun.connect({ hostname: \"127.0.0.1\", port, socket: { data() {} } });",
    "socket.end();",
    "console.log(\"net:connected\");",
    "",
  ].join("\n"),
};

/** Shell that prints `denied:<name>` when reading `path` fails, `read:<name>` when it succeeds. */
function readAttempt(name: string, path: string): string {
  return `if cat "${path}" >/dev/null 2>&1; then echo "read:${name}"; else echo "denied:${name}"; fi`;
}

describe("gate sandbox (master-gate S1c)", { timeout: 240_000 }, () => {
  describe("macos profile", () => {
    beforeEach(() => {
      if (!SANDBOX_EXEC_PRESENT) process.stderr.write("macos profile: skipped, not macOS with /usr/bin/sandbox-exec\n");
    });

    it.skipIf(!SANDBOX_EXEC_PRESENT)("macos profile: a gate that reads each credential location by absolute path is denied, and the record says sandbox-exec", async () => {
      const { credentials } = operatorHome();
      const { repo, evidence } = probeRepository("macos-credentials", [
        "#!/bin/sh",
        ...Object.entries(credentials).map(([name, path]) => readAttempt(name, path)),
        "",
      ].join("\n"));
      const { execution, stdout, stderr } = await runProbe(repo, evidence);
      expect(execution.sandbox).toBe("sandbox-exec");
      for (const name of Object.keys(credentials)) expect(stdout, stderr).toContain(`denied:${name}\n`);
      expect(stdout).not.toContain(SENTINEL);
      expect(stdout).not.toMatch(/^read:/mu);
      expect(execution.state, stderr).toBe("passed");
    });

    it.skipIf(!SANDBOX_EXEC_PRESENT)("macos profile: network is denied, even to a listener on loopback", async () => {
      const { server, port } = await listen();
      try {
        const { repo, evidence } = probeRepository("macos-network", [
          "#!/bin/sh",
          `bun net-probe.ts ${String(port)} 2>/dev/null || echo "net:denied"`,
          "",
        ].join("\n"), NET_PROBE);
        const { execution, stdout, stderr } = await runProbe(repo, evidence);
        expect(execution.sandbox).toBe("sandbox-exec");
        expect(stdout, stderr).toBe("net:denied\n");
      } finally {
        server.close();
      }
    });

    it.skipIf(!SANDBOX_EXEC_PRESENT)("macos profile: writes land in the gate home and temp dir, and nowhere outside them", async () => {
      operatorHome();
      const outside = scratch("macos-outside");
      const { repo, evidence } = probeRepository("macos-writes", [
        "#!/bin/sh",
        "echo ok > \"$HOME/inside\" && echo \"write:home\"",
        "echo ok > \"$TMPDIR/inside-temp\" && echo \"write:temp\"",
        `echo escaped > "${outside}/escaped" 2>/dev/null || echo "denied:outside"`,
        "",
      ].join("\n"));
      const { execution, stdout, stderr } = await runProbe(repo, evidence);
      expect(execution.sandbox).toBe("sandbox-exec");
      expect(stdout, stderr).toBe("write:home\nwrite:temp\ndenied:outside\n");
      expect(existsSync(join(outside, "escaped"))).toBe(false);
    });

    it("macos profile: the generated profile names every write root, credential location and network denial", () => {
      const { home, cargo } = operatorHome();
      const gate = scratch("macos-profile-text");
      const policy = gateSandboxPolicy({ home: join(gate, "home"), snapshot: join(gate, "repository"), temp: join(gate, "home") }, [], toolchainLocators());
      const profile = macosSandboxProfile(policy);
      expect(profile).toMatch(/^\(version 1\)/u);
      expect(profile).toContain("(deny network*)");
      expect(profile).toContain("(deny file-write*)");
      expect(profile).toContain(`(subpath "${join(gate, "home")}")`);
      expect(profile).toContain(`(subpath "${join(gate, "repository")}")`);
      for (const location of [".ssh", ".aws", ".config/gh", ".config/doppler", "Library/Keychains"]) {
        expect(profile).toContain(`(subpath "${join(home, location)}")`);
      }
      expect(profile).toContain(`(literal "${join(home, ".docker", "config.json")}")`);
      expect(profile).toContain(`(prefix "${join(cargo, "credentials")}")`);
    });
  });

  describe("linux sandbox", () => {
    beforeEach(() => {
      if (process.platform !== "linux") process.stderr.write("linux sandbox: execution cases skipped, not Linux\n");
    });

    it("linux sandbox detection: bwrap on PATH is chosen before container markers", () => {
      expect(detectGateSandbox(fakeHost("linux", { "/.dockerenv": "" }, "/usr/bin/bwrap"))).toEqual({ mechanism: "bwrap", executable: "/usr/bin/bwrap" });
    });

    it.each([
      ["/.dockerenv", { "/.dockerenv": "" }],
      ["/run/.containerenv", { "/run/.containerenv": "" }],
      ["/proc/1/cgroup naming docker", { "/proc/1/cgroup": "0::/system.slice/docker-0123abcd.scope\n" }],
      ["/proc/1/cgroup naming containerd", { "/proc/1/cgroup": "0::/kubepods/containerd/0123abcd\n" }],
    ] as const)("linux sandbox detection: with no bwrap, the container marker %s makes the container the boundary", (marker, files) => {
      expect(detectGateSandbox(fakeHost("linux", files))).toEqual({ mechanism: "container", marker });
    });

    it("linux sandbox detection: no bwrap and no container marker is no sandbox, never an assumed container", () => {
      expect(detectGateSandbox(fakeHost("linux", { "/proc/1/cgroup": "0::/user.slice/user-1000.slice\n" }))).toEqual({ mechanism: "none" });
    });

    it("linux sandbox detection: a bwrap that cannot confine a trivial command is not chosen", () => {
      const broken = { ...fakeHost("linux", { "/.dockerenv": "" }, "/usr/bin/bwrap"), works: () => false };
      expect(detectGateSandbox(broken)).toEqual({ mechanism: "container", marker: "/.dockerenv" });
    });

    it("linux sandbox: the bwrap arguments deny network, mount the system read-only, hide the operator home and bind only the gate's write roots", () => {
      const { home, cargo } = operatorHome();
      const gate = scratch("linux-args");
      const policy = gateSandboxPolicy({ home: join(gate, "home"), snapshot: join(gate, "repository"), temp: join(gate, "home") }, [], toolchainLocators());
      const args = bwrapArguments(policy, join(gate, "repository"));
      const has = (...sequence: readonly string[]): boolean => args.some((_, start) => sequence.every((item, offset) => args[start + offset] === item));
      expect(args).toContain("--unshare-net");
      expect(args).toContain("--die-with-parent");
      expect(has("--ro-bind", "/", "/")).toBe(true);
      expect(has("--tmpfs", home)).toBe(true);
      expect(has("--bind", join(gate, "home"), join(gate, "home"))).toBe(true);
      expect(has("--bind", join(gate, "repository"), join(gate, "repository"))).toBe(true);
      expect(has("--ro-bind", join(cargo, "registry"), join(cargo, "registry"))).toBe(true);
      // Only the caches are re-exposed, so the emptied home already hides the cargo credentials beside them.
      expect(has("--ro-bind", "/dev/null", join(cargo, "credentials"))).toBe(false);
      expect(args.at(-1)).toBe("--");
      // The operator's home is hidden before anything under it is re-exposed read-only.
      expect(args.indexOf(home)).toBeLessThan(args.indexOf(join(cargo, "registry")));
    });

    it.skipIf(process.platform !== "linux" || BWRAP === undefined)("linux sandbox: a gate runs under bwrap and cannot read a credential by absolute path, write outside its roots, or reach the network", async () => {
      const { credentials } = operatorHome();
      const outside = scratch("linux-outside");
      const { server, port } = await listen();
      try {
        const { repo, evidence } = probeRepository("linux-bwrap", [
          "#!/bin/sh",
          ...Object.entries(credentials).map(([name, path]) => readAttempt(name, path)),
          `echo escaped > "${outside}/escaped" 2>/dev/null || echo "denied:outside"`,
          `bun net-probe.ts ${String(port)} 2>/dev/null || echo "net:denied"`,
          "",
        ].join("\n"), NET_PROBE);
        const { execution, stdout, stderr } = await runProbe(repo, evidence);
        expect(execution.sandbox).toBe("bwrap");
        for (const name of Object.keys(credentials)) expect(stdout, stderr).toContain(`denied:${name}\n`);
        expect(stdout).toContain("denied:outside\n");
        expect(stdout).toContain("net:denied\n");
        expect(stdout).not.toContain(SENTINEL);
        expect(existsSync(join(outside, "escaped"))).toBe(false);
      } finally {
        server.close();
      }
    });

    it.skipIf(process.platform !== "linux" || !CONTAINER_MARKED)("linux sandbox: inside a container without bwrap, the gate record carries sandbox: container from the real markers", async () => {
      const { repo, evidence } = probeRepository("linux-container", "#!/bin/sh\necho ran\n");
      const { execution, stdout } = await runProbe(repo, evidence, {
        sandbox_host: { ...realGateSandboxHost, which: () => undefined },
      });
      expect(stdout).toBe("ran\n");
      expect(execution.sandbox).toBe("container");
    });
  });

  describe("no sandbox refuses", () => {
    it("no sandbox refuses: with no mechanism, the run is refused with a typed error and no gate executes", async () => {
      const marker = join(scratch("refused-marker"), "gate-ran");
      const { repo, evidence } = probeRepository("refused", `#!/bin/sh\necho ran > "${marker}"\n`);
      const discovery = discoverNativeGates(repo, captureRepositoryObject(repo));
      const refusal = await runNativeGates(repo, discovery, evidence, { sandbox_host: NO_SANDBOX_HOST }).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(refusal).toBeInstanceOf(GateSandboxUnavailableError);
      expect((refusal as GateSandboxUnavailableError).code).toBe("gate_sandbox_unavailable");
      expect((refusal as Error).message).toContain("--allow-unsandboxed-gates");
      expect(existsSync(marker)).toBe(false);
    });

    it("no sandbox refuses: --allow-unsandboxed-gates runs the gate, the record says none, and validation is not CLEAN", async () => {
      const { repo, evidence } = probeRepository("allowed-unsandboxed", "#!/bin/sh\necho ran\n");
      const { discovery, coverage, execution, stdout } = await runProbe(repo, evidence, {
        sandbox_host: NO_SANDBOX_HOST,
        allow_unsandboxed_gates: true,
      });
      expect(stdout).toBe("ran\n");
      expect(execution.state).toBe("passed");
      expect(execution.sandbox).toBe("none");
      const errors = await validateNativeGateCoverage(coverage, discovery, coverage.closing_repository_object, evidence, { repository: repo });
      expect(errors).toContainEqual(expect.stringMatching(/ran without an OS sandbox/u));
    });

    it("no sandbox refuses: a sandboxed passing record validates with no sandbox observation", async () => {
      const host: GateSandboxHost = SANDBOX_EXEC_PRESENT ? realGateSandboxHost : NO_SANDBOX_HOST;
      const { repo, evidence } = probeRepository("sandboxed-clean", "#!/bin/sh\necho ran\n");
      const { discovery, coverage } = await runProbe(repo, evidence, { sandbox_host: host, allow_unsandboxed_gates: !SANDBOX_EXEC_PRESENT });
      const errors = await validateNativeGateCoverage(coverage, discovery, coverage.closing_repository_object, evidence, { repository: repo });
      if (SANDBOX_EXEC_PRESENT) expect(errors).toEqual([]);
      else expect(errors).toContainEqual(expect.stringMatching(/ran without an OS sandbox/u));
    });

    it("no sandbox refuses: the CLI accepts --allow-unsandboxed-gates only where gates run (prepare and live bundle validation)", async () => {
      const stderr: string[] = [];
      const io = { stderr: (line: string) => stderr.push(line), stdout: () => undefined };
      const report = join(scratch("cli-flag"), "report.json");
      writeFileSync(report, "{}\n");
      expect(await runCli(["validate", "report", report, "--allow-unsandboxed-gates"], io)).toBe(2);
      expect(await runCli(["validate", "bundle", report, "--structural", "--allow-unsandboxed-gates"], io)).toBe(2);
      expect(stderr.filter((line) => line.includes("--allow-unsandboxed-gates is only valid for live bundle validation"))).toHaveLength(2);
    });

    it("no sandbox refuses: a record that claims an unknown sandbox mechanism is invalid", async () => {
      const { repo, evidence } = probeRepository("unknown-mechanism", "#!/bin/sh\necho ran\n");
      const { discovery, coverage } = await runProbe(repo, evidence, { sandbox_host: NO_SANDBOX_HOST, allow_unsandboxed_gates: true });
      const forged = { ...coverage, executions: coverage.executions.map((execution) => ({ ...execution, sandbox: "jail" })) };
      const errors = await validateNativeGateCoverage(forged as unknown as typeof coverage, discovery, coverage.closing_repository_object, evidence, { repository: repo, require_passing: false });
      expect(errors).toContainEqual(expect.stringMatching(/\.sandbox is invalid/u));
    });
  });

  describe("escape", () => {
    beforeEach(() => {
      if (!SANDBOX_EXEC_PRESENT) process.stderr.write("escape: macOS cases skipped, not macOS with /usr/bin/sandbox-exec\n");
    });

    it.skipIf(!SANDBOX_EXEC_PRESENT)("escape: a login shell (bash -l) pointed at the operator's home cannot source its profile", async () => {
      const { home } = operatorHome();
      for (const profile of [".bash_profile", ".profile"]) {
        plant(join(home, profile), `export FIXTURE_TOKEN=${SENTINEL}\n`);
      }
      const { repo, evidence } = probeRepository("escape-login-shell", [
        "#!/bin/sh",
        `HOME="${home}" /bin/bash -l -c 'echo "token:\${FIXTURE_TOKEN:-none}"' 2>/dev/null`,
        "",
      ].join("\n"));
      const { execution, stdout, stderr } = await runProbe(repo, evidence);
      expect(execution.sandbox).toBe("sandbox-exec");
      expect(stdout, stderr).toBe("token:none\n");
    });

    it.skipIf(!SANDBOX_EXEC_PRESENT)("escape: a credential CLI started by absolute path does not run", async () => {
      operatorHome();
      // A credential CLI outside the operator's home, the Homebrew layout (/opt/homebrew/bin/doppler).
      const prefix = join(scratch("escape-cli-prefix"), "bin");
      plant(join(prefix, "doppler"), "#!/bin/sh\necho cli-ran\n");
      chmodSync(join(prefix, "doppler"), 0o755);
      const { repo, evidence } = probeRepository("escape-cli", [
        "#!/bin/sh",
        `"${join(prefix, "doppler")}" 2>/dev/null || echo "denied:doppler"`,
        "/usr/bin/security help >/dev/null 2>&1 && echo \"ran:security\" || echo \"denied:security\"",
        "",
      ].join("\n"));
      const { execution, stdout, stderr } = await runProbe(repo, evidence);
      expect(execution.sandbox).toBe("sandbox-exec");
      expect(stdout, stderr).toBe("denied:doppler\ndenied:security\n");
    });

    it.skipIf(!SANDBOX_EXEC_PRESENT)("escape: a write into the real cargo registry or git cache through the CARGO_HOME symlinks is blocked", async () => {
      const { cargo } = operatorHome();
      const { repo, evidence } = probeRepository("escape-cargo-cache", [
        "#!/bin/sh",
        "cat \"$CARGO_HOME/registry/cache/crate.txt\" || exit 5",
        "echo poisoned > \"$CARGO_HOME/registry/cache/planted.crate\" 2>/dev/null || echo \"denied:registry\"",
        "echo poisoned > \"$CARGO_HOME/git/db/planted\" 2>/dev/null || echo \"denied:git\"",
        "",
      ].join("\n"));
      const { execution, stdout, stderr } = await runProbe(repo, evidence);
      expect(execution.sandbox).toBe("sandbox-exec");
      expect(stdout, stderr).toBe("cached crate\ndenied:registry\ndenied:git\n");
      expect(readdirSync(join(cargo, "registry", "cache"))).toEqual(["crate.txt"]);
      expect(readdirSync(join(cargo, "git", "db"))).toEqual([]);
    });
  });

  describe("toolchains under sandbox", () => {
    const has = (name: string): boolean => resolveExecutable(name, process.env.PATH ?? "") !== undefined;
    beforeEach(() => {
      if (!SANDBOX_EXEC_PRESENT && BWRAP === undefined) process.stderr.write("toolchains under sandbox: skipped, no OS sandbox on this host\n");
    });

    it.skipIf((!SANDBOX_EXEC_PRESENT && BWRAP === undefined) || !has("pnpm"))("toolchains under sandbox: a pnpm gate runs node", async () => {
      const root = scratch("toolchain-pnpm");
      const repo = join(root, "repo");
      createFixtureRepository(repo, { identity: { name: "Toolchain Fixture", email: "toolchain.invalid" } });
      writeFileSync(join(repo, "package.json"), `${JSON.stringify({
        name: "pnpm-sandbox-fixture",
        private: true,
        scripts: { test: "node --version && echo node-ran" },
      }, null, 2)}\n`);
      writeFileSync(join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
      fixtureCommit(repo, "fixture");
      const { execution, stdout, stderr } = await runProbe(repo, join(root, "evidence"));
      expect(execution.sandbox).toBe(SANDBOX_EXEC_PRESENT ? "sandbox-exec" : "bwrap");
      expect(stdout, stderr.slice(-1500)).toContain("node-ran");
      expect(`${execution.state}:${String(execution.failure_reason)}`, stderr.slice(-1500)).toBe("passed:null");
    });

    /** A cfg-if release already downloaded and unpacked in the operator's cargo registry, if any. */
    function cachedCfgIf(): string | undefined {
      const cargoHome = process.env.CARGO_HOME ?? join(process.env.HOME ?? "", ".cargo");
      const sources = join(cargoHome, "registry", "src");
      if (!existsSync(sources)) return undefined;
      for (const index of readdirSync(sources)) {
        const release = readdirSync(join(sources, index)).find((name) => /^cfg-if-1\.\d+\.\d+$/u.test(name));
        if (release !== undefined) return release.slice("cfg-if-".length);
      }
      return undefined;
    }

    it.skipIf((!SANDBOX_EXEC_PRESENT && BWRAP === undefined) || !has("cargo") || !has("cc") || cachedCfgIf() === undefined)(
      "toolchains under sandbox: a cargo gate builds offline against the read-only registry cache",
      async () => {
        const version = cachedCfgIf()!;
        const root = scratch("toolchain-cargo");
        const repo = join(root, "repo");
        createFixtureRepository(repo, { identity: { name: "Toolchain Fixture", email: "toolchain.invalid" } });
        writeFileSync(join(repo, ".gitignore"), "target/\nCargo.lock\n");
        writeFileSync(join(repo, "Cargo.toml"), [
          "[package]", "name = \"sandbox-fixture\"", "version = \"0.1.0\"", "edition = \"2021\"",
          "[dependencies]", `cfg-if = "=${version}"`, "",
        ].join("\n"));
        mkdirSync(join(repo, "src"));
        writeFileSync(join(repo, "src", "lib.rs"), "cfg_if::cfg_if! { if #[cfg(test)] { #[test] fn links() { assert_eq!(1 + 1, 2); } } }\n");
        fixtureCommit(repo, "fixture");
        const { execution, stderr } = await runProbe(repo, join(root, "evidence"));
        expect(execution.sandbox).toBe(SANDBOX_EXEC_PRESENT ? "sandbox-exec" : "bwrap");
        expect(`${execution.state}:${String(execution.failure_reason)}`, stderr.slice(-2500)).toBe("passed:null");
      },
    );
  });
});
