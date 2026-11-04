import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";
import { discoverSemanticProbeCandidates } from "./semantic.js";

const roots: string[] = [];

function put(repository: string, path: string, content: string): void {
  const absolute = join(repository, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

const WORKFLOW_WITH_BUILD = `name: CI
on: [push]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: Build and test
        run: |
          pnpm install --frozen-lockfile
          FIXTURE_MODE=1 pnpm run build
          FIXTURE_MODE=1 pnpm run test
`;

const WORKFLOW_WITHOUT_BUILD = WORKFLOW_WITH_BUILD.replace("          FIXTURE_MODE=1 pnpm run build\n", "");

/**
 * An ordinary repository: env-prefixed bun/pnpm/node/tsc scripts, declared
 * runtime targets under dist/ that only the tsup build produces, and a CI
 * workflow that runs the build and the test runner.
 */
function ordinaryRepository(name: string, options: { readonly workflow?: string; readonly extraTarget?: string } = {}): string {
  const repository = join(mkdtempSync(join(tmpdir(), `mister-clean-native-routes-${name}-`)), "repo");
  roots.push(dirname(repository));
  createFixtureRepository(repository, { branch: "main" });
  put(repository, "src/public.ts", 'import { helper } from "./helper.js";\nexport const publicApi = helper;\n');
  put(repository, "src/helper.ts", "export const helper = 1;\n");
  put(repository, "src/cli.ts", 'import { publicApi } from "./public.js";\nconsole.log(publicApi);\n');
  put(repository, "scripts/materials.ts", "export const materials = true;\n");
  put(repository, "tsup.config.ts", 'export default { entry: ["src/public.ts", "src/cli.ts"], format: ["esm"] };\n');
  put(repository, "tsconfig.json", '{"include":["src/**/*"]}\n');
  put(repository, "package.json", `${JSON.stringify({
    name: "ordinary",
    private: true,
    type: "module",
    exports: { ".": "./dist/public.js", ...(options.extraTarget ? { "./extra": options.extraTarget } : {}) },
    bin: { ordinary: "dist/cli.js" },
    scripts: {
      "build:materials": "FIXTURE_MODE=1 bun scripts/materials.ts",
      build: "FIXTURE_MODE=1 pnpm run build:materials && tsc --noEmit && tsup",
      typecheck: "tsc --noEmit",
      test: "FIXTURE_MODE=1 node --test",
      check: "pnpm run typecheck && node scripts/materials.ts",
    },
  }, null, 2)}\n`);
  put(repository, ".github/workflows/ci.yml", options.workflow ?? WORKFLOW_WITH_BUILD);
  fixtureCommit(repository, "fixture");
  return repository;
}

function executableCandidate(repository: string) {
  return discoverSemanticProbeCandidates(repository).find((candidate) => candidate.kind === "executable_surface_coverage");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("executable-surface native routes (CI steps route scripts and built targets)", () => {
  it("proof 1: env-prefixed runner scripts and CI-built dist targets leave no coverage gap", () => {
    const repository = ordinaryRepository("ordinary");
    const candidate = executableCandidate(repository);
    expect(candidate).toBeUndefined();
  });

  it("proof 1 (evidence): when a gap remains, every credit names the workflow step that is the route", () => {
    // Same repository plus one unrelated release script no step executes, so a
    // candidate is emitted and its evidence shows the credited routes.
    const repository = ordinaryRepository("ordinary-evidence", { extraTarget: "./dist/extra.js" });
    const candidate = executableCandidate(repository);
    const evidence = candidate?.evidence.join("\n") ?? "";
    expect(evidence).not.toContain("unsupported command: bun");
    expect(evidence).not.toContain("unsupported command: FIXTURE_MODE=1");
    expect(evidence).toContain("declared target ./dist/public.js built by .github/workflows/ci.yml#verify step 'Build and test' -> build (tsup tsup.config.ts)");
    expect(evidence).toContain("native route: src/helper.ts <- .github/workflows/ci.yml#verify step 'Build and test' -> build (tsup tsup.config.ts) (import closure of src/public.ts)");
    expect(evidence).toContain("unresolved declared runtime target: ./dist/extra.js");
  });

  it("proof 2: a dist target no workflow step builds stays coverage-unestablished (fail closed)", () => {
    const repository = ordinaryRepository("unbuilt", { extraTarget: "./dist/extra.js" });
    const candidate = executableCandidate(repository);
    expect(candidate?.evidence.join(" ")).toContain("coverage-unestablished");
    expect(candidate?.evidence.join(" ")).toContain("unresolved declared runtime target: ./dist/extra.js");
    expect(candidate?.refs).toContain("package.json");
  });

  it("proof 3 (shape): the same repository without the build step in CI is listed again with the dist targets unresolved", () => {
    const repository = ordinaryRepository("no-build", { workflow: WORKFLOW_WITHOUT_BUILD });
    const candidate = executableCandidate(repository);
    const evidence = candidate?.evidence.join(" ") ?? "";
    expect(evidence).toContain("unresolved declared runtime target: ./dist/public.js");
    expect(evidence).toContain("unresolved declared runtime target: dist/cli.js");
    expect(evidence).toContain("release input closure requires native evidence: build");
  });

  it("recognizes a test runner invoked through its installed node_modules entry as the test matrix", () => {
    // No build step: the dist targets stay unresolved, but every source file
    // gets a native route from the installed-runner test step instead of a
    // "validation route unestablished" reason.
    const repository = ordinaryRepository("installed-runner", {
      workflow: WORKFLOW_WITHOUT_BUILD.replace(
        "          FIXTURE_MODE=1 pnpm run test\n",
        "          FIXTURE_MODE=1 pnpm exec -- bun ./node_modules/vitest/vitest.mjs run --allowOnly=false\n",
      ),
    });
    const candidate = executableCandidate(repository);
    const evidence = candidate?.evidence.join(" ") ?? "";
    expect(evidence).toContain("unresolved declared runtime target: ./dist/public.js");
    expect(evidence).not.toContain("validation route unestablished");
    expect(evidence).not.toContain("is not a tracked source file");
    expect(evidence).toContain("native route: src/public.ts <- .github/workflows/ci.yml#verify step 'Build and test' (test matrix of .)");
  });

  it("credits no step whose condition it cannot classify", () => {
    const repository = ordinaryRepository("conditional", {
      workflow: WORKFLOW_WITH_BUILD.replace("      - name: Build and test\n", "      - name: Build and test\n        if: github.event_name == 'workflow_dispatch'\n"),
    });
    const candidate = executableCandidate(repository);
    const evidence = candidate?.evidence.join(" ") ?? "";
    expect(evidence).toContain("unresolved declared runtime target: ./dist/public.js");
    expect(evidence).toContain("step condition not credited: github.event_name == 'workflow_dispatch'");
  });
});
