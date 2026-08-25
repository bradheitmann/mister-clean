import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  detectStack,
  generateManifest,
  generatePackageManifest,
  loadDenylist,
  scanPublicSafety,
} from "./inspection.js";

const temporaryRoots: string[] = [];

async function fixture(name: string): Promise<string> {
  const root = join(tmpdir(), `mister-clean-inspection-${name}-${crypto.randomUUID()}`);
  await mkdir(root, { recursive: true });
  temporaryRoots.push(root);
  return root;
}

async function put(root: string, path: string, content = "fixture\n"): Promise<void> {
  const target = join(root, path);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, content, "utf8");
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("detectStack", () => {
  it("preserves legacy ordered marker detection and shell discovery", async () => {
    const root = await fixture("stacks");
    await Promise.all([
      put(root, "package.json"),
      put(root, "bun.lock"),
      put(root, "pnpm-lock.yaml"),
      put(root, "tsconfig.json"),
      put(root, "scripts/check.sh", "#!/bin/sh\n"),
      put(root, ".github/workflows/check.yml"),
    ]);

    await expect(detectStack(root)).resolves.toEqual({
      ecosystems: ["node", "node-bun", "node-pnpm", "typescript", "github-actions", "shell"],
      exitCode: 0,
      status: "detected",
    });
  });

  it("keeps an unknown stack exit-relevant rather than silently skipping adapters", async () => {
    const root = await fixture("unknown");
    await expect(detectStack(root)).resolves.toEqual({ ecosystems: [], exitCode: 3, status: "unknown" });
  });
});

describe("scanPublicSafety", () => {
  it("matches custom denylist terms with Unicode case folding", async () => {
    const root = await fixture("unicode-denylist");
    await put(root, "note.txt", "STRASSE\nẞ\n");
    const result = await scanPublicSafety(root, ["Straße", "SS"]);
    expect(result.findings.some((finding) => finding.rule === "custom-denylist-1")).toBe(true);
    expect(result.findings.some((finding) => finding.rule === "custom-denylist-2")).toBe(true);
  });

  it("keeps the prospective public source tree free of private identifiers", async () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
    await expect(scanPublicSafety(root)).resolves.toMatchObject({ findings: [], status: "pass" });
  });

  it("reports rules and locations without returning the matched source", async () => {
    const root = await fixture("safety");
    const sensitive = `contact=${"person"}@${"example.org"}\nroot=/${"Users"}/person/project\n`;
    await put(root, "sample.txt", sensitive);

    const result = await scanPublicSafety(root);
    expect(result).toMatchObject({ exitCode: 1, status: "fail" });
    expect(result.findings).toEqual([
      { path: "sample.txt", line: 1, rule: "email-address" },
      { path: "sample.txt", line: 2, rule: "posix-home-path" },
    ]);
    expect(JSON.stringify(result)).not.toContain(`${"person"}@${"example.org"}`);
  });

  it("loads a comment-aware denylist, folds terms, and ignores excluded trees", async () => {
    const root = await fixture("denylist");
    await put(root, "denylist.txt", "# local only\nInternal-Campaign\n");
    await put(root, "source.txt", "internal-campaign\n");
    await put(root, "node_modules/ignored.txt", "internal-campaign\n");

    const terms = await loadDenylist(join(root, "denylist.txt"));
    const result = await scanPublicSafety(root, terms);
    // The historical scanner traverses the local denylist itself; callers that
    // need to keep it private place it outside the prospective public tree.
    expect(result.findings).toEqual([
      { path: "denylist.txt", line: 2, rule: "custom-denylist-1" },
      { path: "source.txt", line: 1, rule: "custom-denylist-1" },
    ]);
  });
});

describe("generateManifest", () => {
  it("produces stable public-source entries without writing MANIFEST.sha256", async () => {
    const root = await fixture("manifest");
    await Promise.all([
      put(root, "z.txt", "z\n"),
      put(root, "a.txt", "a\n"),
      put(root, "MANIFEST.sha256", "old\n"),
      put(root, "dist/ignored.js", "ignored\n"),
      put(root, "src/generated-materials.ts", "generated\n"),
      put(root, "cache.pyc", "cache\n"),
    ]);

    const result = await generateManifest(root);
    const aHash = createHash("sha256").update("a\n").digest("hex");
    const zHash = createHash("sha256").update("z\n").digest("hex");
    expect(result).toEqual({
      entries: [
        { path: "./a.txt", sha256: aHash },
        { path: "./z.txt", sha256: zHash },
      ],
      content: `${aHash}  ./a.txt\n${zHash}  ./z.txt\n`,
      exitCode: 0,
    });
    await expect(readFile(join(root, "MANIFEST.sha256"), "utf8")).resolves.toBe("old\n");
  });
});

describe("generatePackageManifest", () => {
  it("hashes the declared public package surface rather than unshipped source", async () => {
    const root = await fixture("package-manifest");
    await Promise.all([
      put(root, "package.json", JSON.stringify({ files: ["bin/*.js", "dist/**", "SKILL.md", "MANIFEST.sha256"] })),
      put(root, "bin/mister-clean.js", "cli\n"),
      put(root, "dist/server.js", "server\n"),
      put(root, "SKILL.md", "skill\n"),
      put(root, "src/private.ts", "source\n"),
      put(root, "MANIFEST.sha256", "old\n"),
      put(root, "node_modules/ignored.js", "dependency\n"),
    ]);

    const result = await generatePackageManifest(root);
    expect(result.entries.map((entry) => entry.path)).toEqual([
      "./SKILL.md",
      "./bin/mister-clean.js",
      "./dist/server.js",
      "./package.json",
    ]);
    expect(result.entries.some((entry) => entry.path.startsWith("./src/"))).toBe(false);
    expect(result.entries.some((entry) => entry.path === "./MANIFEST.sha256")).toBe(false);
    await expect(readFile(join(root, "MANIFEST.sha256"), "utf8")).resolves.toBe("old\n");
  });
});
