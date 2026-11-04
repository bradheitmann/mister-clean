import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => ({ version: null as string | null }));
vi.mock("./toolchain-pin.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./toolchain-pin.js")>();
  return { ...original, runningBunVersion: () => probe.version };
});

const { checkToolchainPin, ciBunPinErrors, readBunPin } = await import("./toolchain-pin.js");
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
  it("ci pin: every setup-bun step takes the repository pin, and the pin is a reviewed exact version", () => {
    const workflow = readFileSync(join(repositoryRoot, ".github/workflows/ci.yml"), "utf8");
    const pin = readBunPin(repositoryRoot);
    expect(pin).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(workflow).toMatch(/uses:\s*oven-sh\/setup-bun@/u);
    expect(ciBunPinErrors(workflow, pin!)).toEqual([]);
    // A bump must change both reviewed places: .bun-version and package.json engines.bun.
    const manifest = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")) as { engines?: { bun?: string } };
    expect(manifest.engines?.bun).toBe(pin);
  });

  it("ci steps: each setup-bun step is checked on its own", () => {
    const step = (inputs: string) => `      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6\n        with:\n${inputs}`;
    const ok = `jobs:\n  a:\n    steps:\n${step("          bun-version-file: .bun-version\n")}      - run: echo next\n`;
    expect(ciBunPinErrors(ok, "1.4.0")).toEqual([]);
    const secondUnpinned = `${ok}${step("          node-version: 22\n")}`;
    expect(ciBunPinErrors(secondUnpinned, "1.4.0")).toEqual([expect.stringContaining("sets neither")]);
    expect(ciBunPinErrors(`jobs:\n  a:\n    steps:\n${step("          bun-version: 1.4.0\n          bun-version-file: .bun-version\n")}`, "1.4.0"))
      .toEqual([expect.stringContaining("sets both")]);
    expect(ciBunPinErrors(`jobs:\n  a:\n    steps:\n${step("          bun-version: 1.3.9\n")}`, "1.4.0"))
      .toEqual([expect.stringContaining("pins 1.3.9")]);
  });

  it("ci inputs: only the step's own with inputs count; overrides, expressions and remote reusable workflows fail closed", () => {
    const uses = "      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6\n";
    const wrap = (body: string) => `jobs:\n  a:\n    steps:\n${body}`;
    // QA counterexample 1: the version key under env is not an action input.
    expect(ciBunPinErrors(wrap(`${uses}        env:\n          bun-version-file: .bun-version\n`), "1.4.0"))
      .toEqual([expect.stringContaining("sets neither")]);
    // QA counterexample 2: an alternate download URL replaces version resolution.
    expect(ciBunPinErrors(wrap(`${uses}        with:\n          bun-version-file: .bun-version\n          bun-download-url: https://example.invalid/bun.zip\n`), "1.4.0"))
      .toEqual([expect.stringContaining("bun-download-url")]);
    expect(ciBunPinErrors(wrap(`${uses}        with:\n          bun-version: \${{ matrix.bun }}\n`), "1.4.0"))
      .toEqual([expect.stringContaining("expression")]);
    expect(ciBunPinErrors(`jobs:\n  r:\n    uses: someone/else/.github/workflows/build.yml@main\n`, "1.4.0"))
      .toEqual([expect.stringContaining("remote reusable workflow")]);
    expect(ciBunPinErrors("jobs: [unclosed\n", "1.4.0")).toEqual([expect.stringContaining("not parseable")]);
    // Quoted values and trailing comments parse as plain values.
    expect(ciBunPinErrors(wrap(`${uses}        with:\n          bun-version: "1.4.0" # pinned\n`), "1.4.0")).toEqual([]);
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
