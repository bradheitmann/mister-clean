import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => ({ version: null as string | null }));
vi.mock("./toolchain-pin.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./toolchain-pin.js")>();
  return { ...original, runningBunVersion: () => probe.version };
});

const { checkToolchainPin, readBunPin } = await import("./toolchain-pin.js");
const { runCli } = await import("./cli.js");

const repositoryRoot = resolve(import.meta.dirname, "..");
const scratch: string[] = [];

function fixture(pin?: string): string {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-toolchain-pin-"));
  scratch.push(root);
  if (pin !== undefined) writeFileSync(join(root, ".bun-version"), `${pin}\n`);
  return root;
}

afterEach(() => {
  probe.version = null;
  for (const root of scratch.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("toolchain pin", () => {
  it("ci pin: .bun-version equals the bun-version CI installs", () => {
    const workflow = readFileSync(join(repositoryRoot, ".github/workflows/ci.yml"), "utf8");
    const pins = [...workflow.matchAll(/^\s*bun-version:\s*([0-9.]+)\s*$/gmu)].map((match) => match[1]);
    expect(pins.length).toBeGreaterThan(0);
    for (const ciPin of pins) expect(readBunPin(repositoryRoot)).toBe(ciPin);
  });

  it("mismatch: a different running bun is refused with both versions named", () => {
    const root = fixture("1.4.0");
    expect(checkToolchainPin(root, "1.4.0")).toMatchObject({ ok: true, pinned: true, version: "1.4.0" });
    expect(checkToolchainPin(root, "1.3.9")).toEqual({ ok: false, pinned: true, version: "1.4.0", actual: "1.3.9" });
  });

  it("unpinned: a repository without .bun-version is not refused", () => {
    expect(checkToolchainPin(fixture(), "1.3.9")).toEqual({ ok: true, pinned: false });
  });

  it("cli: manifest --package refuses a mismatched bun before writing anything", async () => {
    const root = fixture("1.4.0");
    probe.version = "1.3.9";
    const stderr: string[] = [];
    const code = await runCli(["manifest", root, "--package"], { stderr: (line) => stderr.push(line), stdout: () => undefined });
    expect(code).toBe(2);
    expect(stderr.join("\n")).toContain("manifest: TOOLCHAIN MISMATCH (bun 1.3.9; repository pins 1.4.0 in .bun-version)");
    expect(existsSync(join(root, "MANIFEST.sha256"))).toBe(false);
  });
});
