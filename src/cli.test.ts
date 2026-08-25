import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type CliIO, isDirectInvocation, runCli } from "./cli.js";

const roots: string[] = [];

function fixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `mister-clean-cli-${name}-`));
  roots.push(root);
  return root;
}

function capture(): { io: CliIO; stderr: string[]; stdout: string[] } {
  const stderr: string[] = [];
  const stdout: string[] = [];
  return {
    io: { stderr: (line) => stderr.push(line), stdout: (line) => stdout.push(line) },
    stderr,
    stdout,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("unified Mister Clean CLI", () => {
  it("keeps an unknown stack exit-relevant", async () => {
    const output = capture();
    const code = await runCli(["detect", "stack", fixture("unknown")], output.io);
    expect(code).toBe(3);
    expect(output.stdout).toEqual([
      "NO KNOWN ECOSYSTEM DETECTED -- inspect manually; adapter checks may not be silently skipped",
    ]);
  });

  it("reports public-safety locations without source contents", async () => {
    const root = fixture("safety");
    const secret = `${"person"}@${"example.org"}`;
    writeFileSync(join(root, "source.txt"), `contact=${secret}\n`);
    const output = capture();
    const code = await runCli(["audit", "public-safety", root], output.io);
    expect(code).toBe(1);
    expect(output.stdout).toEqual(["source.txt:1: email-address"]);
    expect(output.stderr).toEqual(["public-safety: FAIL (1 finding(s))"]);
    expect(JSON.stringify(output)).not.toContain(secret);
  });

  it("writes and then verifies a deterministic manifest", async () => {
    const root = fixture("manifest");
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "index.ts"), "export {};\n");
    const first = capture();
    expect(await runCli(["manifest", root], first.io)).toBe(0);
    expect(first.stdout[0]).toMatch(/^manifest: wrote 1 entries$/);
    const second = capture();
    expect(await runCli(["manifest", root, "--check"], second.io)).toBe(0);
    expect(second.stdout).toEqual(["manifest: PASS (1 entries)"]);
  });

  it("returns usage failure for an incomplete validation command", async () => {
    const output = capture();
    expect(await runCli(["validate", "bundle"], output.io)).toBe(2);
    expect(output.stderr).toContain("ERROR: validate bundle requires a path");
  });

  it("returns an input failure for an unreadable bundle without double-prefixing", async () => {
    const output = capture();
    const code = await runCli(["validate", "bundle", join(fixture("missing-bundle"), "missing.json")], output.io);
    expect(code).toBe(2);
    expect(output.stderr).toHaveLength(1);
    expect(output.stderr[0]).toMatch(/^ERROR: /);
    expect(output.stderr[0]).not.toMatch(/^ERROR: ERROR:/);
  });

  it("recognizes a package-bin symlink as a direct invocation", () => {
    const root = fixture("bin-link");
    const target = new URL("./cli.ts", import.meta.url);
    const link = join(root, "mister-clean");
    symlinkSync(target, link);
    expect(isDirectInvocation(link, target.href)).toBe(true);
  });
});
