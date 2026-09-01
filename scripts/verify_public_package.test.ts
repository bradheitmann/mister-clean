import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { verifyProspectivePublicPackage } from "./verify_public_package.js";

const roots: string[] = [];

function put(root: string, path: string, content: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function fixture(publicText: string): string {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-public-package-test-"));
  roots.push(root);
  put(root, "package.json", `${JSON.stringify({
    name: "prospective-package-fixture",
    version: "1.0.0",
    files: ["public.md"],
  })}\n`);
  put(root, "public.md", publicText);
  put(root, "private-identifiers.txt", "Internal Campaign\n");
  return root;
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("prospective public package safety", () => {
  it("passes a safe uncommitted package surface selected by pnpm dry-pack", () => {
    const root = fixture("Reusable public documentation.\n");
    const result = verifyProspectivePublicPackage(root, join(root, "private-identifiers.txt"));

    expect(result).toMatchObject({
      status: "pass",
      scope: "prospective_package",
      findings: [],
      unassessed: [],
      package: { name: "prospective-package-fixture", version: "1.0.0" },
    });
    expect(result.package_path_count).toBe(2);
  });

  it("fails on a configured case-study identifier in the actual prospective package", () => {
    const root = fixture("Internal Campaign migration notes.\n");
    const result = verifyProspectivePublicPackage(root, join(root, "private-identifiers.txt"));

    expect(result.status).toBe("fail");
    expect(result.findings).toEqual([
      expect.objectContaining({ path: "public.md", line: 1, rule: "custom-denylist-1" }),
    ]);
    expect(JSON.stringify(result)).not.toContain("Internal Campaign");
  });

  it("fails closed when a dry-pack path is absent instead of silently shrinking scope", () => {
    const root = fixture("Reusable public documentation.\n");
    const result = verifyProspectivePublicPackage(root, join(root, "private-identifiers.txt"), {
      name: "prospective-package-fixture",
      version: "1.0.0",
      files: [{ path: "missing.md" }],
    });

    expect(result.status).toBe("fail");
    expect(result.unassessed).toEqual([
      expect.objectContaining({ path: "missing.md", reason: "missing_or_unreadable" }),
    ]);
  });
});
