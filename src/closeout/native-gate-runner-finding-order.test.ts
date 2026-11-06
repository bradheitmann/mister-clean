import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";
import { auditVerificationRunnerSafety } from "./native-gates.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const UNSAFE_WRAPPER = `
import { execFileSync } from "node:child_process";
import { it } from "vitest";
it("runs broad verification", { timeout: 120_000 }, () => {
  execFileSync("pnpm", ["run", "ci:check"], { stdio: "inherit" });
});
`;

describe("verification runner finding order", () => {
  // ICU collation puts `alpha.test.ts` before `Zeta.test.ts`; the module's rule
  // is UTF-8 byte order (never locale collation), which puts `Zeta` first.
  it("orders findings by path in UTF-8 byte order, not locale collation", { timeout: 120_000 }, () => {
    const root = mkdtempSync(join(tmpdir(), "mister-clean-runner-finding-order-"));
    roots.push(root);
    const repo = join(root, "repo");
    createFixtureRepository(repo, { identity: { name: "Runner Finding Order Fixture", email: "runner-finding-order.invalid" } });
    writeFileSync(join(repo, "alpha.test.ts"), UNSAFE_WRAPPER);
    writeFileSync(join(repo, "Zeta.test.ts"), UNSAFE_WRAPPER);
    fixtureCommit(repo, "fixture");

    expect(auditVerificationRunnerSafety(repo).map((finding) => finding.path)).toEqual([
      "Zeta.test.ts",
      "alpha.test.ts",
    ]);
  });
});
