import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveExecutable, scrubbedCargoHome, scrubbedEnvironment, toolchainLocators } from "./native-gate-runner.js";

const roots: string[] = [];
function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-toolchain-locators-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("toolchain locators in the scrubbed gate environment", () => {
  it("explicit: operator-set locators pass through unchanged and HOME stays scrubbed", () => {
    const explicit = {
      RUSTUP_HOME: "/opt/rustup",
      CARGO_HOME: "/opt/cargo",
      GOPATH: "/opt/go",
      GOMODCACHE: "/opt/go/pkg/mod",
    };
    expect(toolchainLocators({ ...explicit, HOME: "/nonexistent-home" })).toEqual(explicit);
    const home = scratch();
    const env = scrubbedEnvironment(home);
    expect(env.HOME).toBe(home);
    expect(env.CARGO_NET_OFFLINE).toBe("true");
    expect(env.GOPROXY).toBe("off");
    // CARGO_HOME is the gate's own credential-free copy (master-gate S1); the other locators pass through.
    for (const [name, value] of Object.entries(toolchainLocators())) {
      expect(env[name]).toBe(name === "CARGO_HOME" ? scrubbedCargoHome(home) : value);
    }
  });

  it("defaults: only conventional directories that exist under the operator's home are used", () => {
    const operatorHome = scratch();
    mkdirSync(join(operatorHome, ".rustup"));
    mkdirSync(join(operatorHome, "go", "pkg", "mod"), { recursive: true });
    expect(toolchainLocators({ HOME: operatorHome }, operatorHome)).toEqual({
      RUSTUP_HOME: join(operatorHome, ".rustup"),
      GOPATH: join(operatorHome, "go"),
      GOMODCACHE: join(operatorHome, "go", "pkg", "mod"),
    });
  });

  it("derived: a rustup install found on PATH yields its CARGO_HOME and sibling RUSTUP_HOME when the environment names neither", () => {
    // The Linux judge capsule replaces HOME and drops RUSTUP_HOME; the rustup
    // docker layout keeps /usr/local/cargo/bin/rustup beside /usr/local/rustup.
    const root = scratch();
    mkdirSync(join(root, "cargo", "bin"), { recursive: true });
    writeFileSync(join(root, "cargo", "bin", "rustup"), "#!/bin/sh\n");
    chmodSync(join(root, "cargo", "bin", "rustup"), 0o755);
    mkdirSync(join(root, "rustup"));
    writeFileSync(join(root, "rustup", "settings.toml"), "default_toolchain = \"fixture\"\n");
    const real = realpathSync(root);
    expect(toolchainLocators({ HOME: "/nonexistent-home", PATH: join(root, "cargo", "bin") }, "/nonexistent-home")).toEqual({
      CARGO_HOME: join(real, "cargo"),
      RUSTUP_HOME: join(real, "rustup"),
    });
  });

  const cargo = resolveExecutable("cargo", process.env.PATH ?? "");
  const rustupProxy = cargo !== undefined && realpathSync(cargo.resolved).endsWith("/rustup");
  const rustupHome = process.env.RUSTUP_HOME ?? join(process.env.HOME ?? homedir(), ".rustup");
  it.skipIf(!rustupProxy || !existsSync(rustupHome))(
    "rustup: cargo through the rustup proxy resolves a toolchain inside the scrubbed environment",
    () => {
      const result = spawnSync(cargo!.invoked, ["--version"], { encoding: "utf8", env: scrubbedEnvironment(scratch()) });
      expect(result.stderr).not.toContain("rustup could not choose a version of cargo");
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/^cargo \d+\.\d+\.\d+/u);
    },
  );
});
