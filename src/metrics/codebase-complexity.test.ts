import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

import { afterEach, describe, expect, it } from "vitest";

import {
  COMPLEXITY_SCHEMA,
  REPOSITORY_OBJECT_COMPLEXITY_SCHEMA,
  classifyRepositoryPath,
  measureCodebase,
  measureRepositoryObjectCodebase,
  type ComplexityPolicy,
} from "./codebase-complexity.js";
import { captureRepositoryObject } from "../closeout/repository-object.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function git(repository: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
}

function write(repository: string, path: string, content: string | Uint8Array): void {
  const absolute = join(repository, ...path.split("/"));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

function createRepository(): string {
  const repository = mkdtempSync(join(tmpdir(), "mister-clean-complexity-"));
  roots.push(repository);
  git(repository, "init", "-b", "main");
  git(repository, "config", "user.name", "Mister Clean Test");
  git(repository, "config", "user.email", "mister-clean.invalid");
  return repository;
}

function createRepresentativeRepository(): string {
  const repository = createRepository();
  write(repository, ".gitignore", [
    "node_modules/",
    "dist/",
    ".cache/",
    ".edge-agentic/local/",
    "",
  ].join("\n"));
  write(repository, "src/a.ts", [
    "import { b } from \"./b.js\";",
    "export function alpha(flag: boolean, value: number): number {",
    "  if (flag && value > 0) return b(value);",
    "  return 0;",
    "}",
    "",
  ].join("\n"));
  write(repository, "src/b.ts", [
    "import { alpha } from \"./a.js\";",
    "export const b = (value: number): number => {",
    "  switch (value) {",
    "    case 1: return alpha(false, 0);",
    "    default: return value;",
    "  }",
    "};",
    "",
  ].join("\n"));
  write(repository, "src/native.rs", "pub fn native() -> u8 { 1 }\n");
  write(repository, "tests/a.test.ts", "import { alpha } from \"../src/a.js\";\ntest(\"alpha\", () => alpha(false, 0));\n");
  write(repository, "README.md", "# Public\n");
  write(repository, "project/planning/PLAN.md", "# Plan\n");
  write(repository, "docs/session-notes/founding.md", "# Evidence\n");
  write(repository, "config/app.yaml", "enabled: true\n");
  write(repository, "generated/schema.generated.ts", "export const generated = true;\n");
  write(repository, "assets/logo.png", new Uint8Array([0xff, 0xfe, 0x00]));
  git(repository, "add", "--all");
  git(repository, "commit", "-m", "fixture");

  write(repository, "node_modules/pkg/index.js", "module.exports = 1;\n");
  write(repository, "dist/bundle.js", "export const bundle = true;\n");
  write(repository, ".cache/state.json", "{}\n");
  write(repository, ".edge-agentic/local/evidence/run.log", "pass\n");
  return repository;
}

function createDistributionMirrorRepository(): { repository: string; generatedCli: string } {
  const repository = createRepository();
  const generatedCli = [
    "#!/usr/bin/env node",
    "var __commonJS = (callback) => callback;",
    "// node_modules/example/index.js",
    "var example = __commonJS(() => {});",
    "export { example };",
    "",
  ].join("\n");
  write(repository, ".gitignore", "dist/\nsrc/generated-materials.ts\n");
  write(repository, "src/main.ts", [
    'import "./App.svelte";',
    'import "./styles.css";',
    'import "../assets/tokens.css";',
    'import "./generated-materials.js";',
    "export const main = true;",
    "",
  ].join("\n"));
  write(repository, "src/App.svelte", "<h1>Control plane</h1>\n");
  write(repository, "src/styles.css", ".app { display: grid; }\n");
  write(repository, "assets/tokens.css", ":root { color: black; }\n");
  write(repository, "src/generated-materials.ts", "export const generated = true;\n");
  write(repository, "bin/cli.js", generatedCli);
  write(repository, "dist/cli.js", generatedCli);
  git(repository, "add", "--all");
  git(repository, "commit", "-m", "distribution fixture");
  return { repository, generatedCli };
}

describe("measureCodebase", () => {
  it("separates committed and ignored surfaces with exact category totals", () => {
    const repository = createRepresentativeRepository();
    const report = measureCodebase({ repository });

    expect(report.schema).toBe(COMPLEXITY_SCHEMA);
    expect(report.repository.commit).toBe(git(repository, "rev-parse", "HEAD"));
    expect(report.measurement_contract.classification_version).toBe(
      report.measurement_contract.analyzer.classifier_version,
    );
    expect(report.surfaces.tracked.total.files).toBe(11);
    expect(report.surfaces.tracked.categories).toMatchObject({
      production_code: { files: 3 },
      tests: { files: 1 },
      public_docs: { files: 1 },
      planning_protocol_docs: { files: 1 },
      generated: { files: 1 },
      config_tooling: { files: 2 },
      evidence_research: { files: 1 },
      dependencies_assets: { files: 1, binary_files: 1, physical_lines: 0 },
    });
    expect(report.surfaces.tracked.dependency_asset_breakdown).toMatchObject({
      vendored_dependencies: { files: 0 },
      design_assets: { files: 1 },
    });
    expect(report.surfaces.ignored.total.files).toBe(4);
    expect(report.surfaces.ignored.classes).toMatchObject({
      dependencies: { files: 1 },
      build_cache: { files: 2 },
      local_evidence: { files: 1 },
      other: { files: 0 },
    });
    expect(report.surfaces.ignored.categories).toMatchObject({
      dependencies_assets: { files: 1 },
      generated: { files: 2 },
      evidence_research: { files: 1 },
    });
    expect(report.surfaces.ignored.dependency_asset_breakdown).toMatchObject({
      vendored_dependencies: { files: 1 },
      design_assets: { files: 0 },
    });
    expect(report.ratios.public_docs_to_production.bytes).toBe(
      report.surfaces.tracked.categories.public_docs.bytes
        / report.surfaces.tracked.categories.production_code.bytes,
    );
    expect(report.ratios.planning_protocol_docs_to_production.physical_lines).toBe(
      report.surfaces.tracked.categories.planning_protocol_docs.physical_lines
        / report.surfaces.tracked.categories.production_code.physical_lines,
    );
    expect(report.ratios.ignored_bytes_by_class.dependencies).toBe(
      report.surfaces.ignored.classes.dependencies.bytes,
    );
  });

  it("measures TypeScript structure, module edges, SCC cycles, and unsupported languages", () => {
    const repository = createRepresentativeRepository();
    const report = measureCodebase({ repository, include_ignored: false });

    expect(report.structural.supported_files).toBe(2);
    expect(report.structural.functions).toBe(2);
    expect(report.structural.function_physical_lines).toEqual({ count: 2, p50: 4, p95: 6, max: 6 });
    expect(report.structural.cyclomatic_complexity).toEqual({ count: 2, p50: 2, p95: 3, max: 3 });
    expect(report.structural.import_occurrences).toBe(2);
    expect(report.structural.internal_import_occurrences).toBe(2);
    expect(report.structural.module_nodes).toBe(2);
    expect(report.structural.module_edges).toBe(2);
    expect(report.structural.dependency_cycles).toBe(1);
    expect(report.structural.largest_cycle).toEqual(["src/a.ts", "src/b.ts"]);
    expect(report.structural.unsupported_languages).toMatchObject([
      { language: "Rust", files: 1, structural_support: "unsupported" },
    ]);
    expect(report.structural.top_hotspots.map((hotspot) => hotspot.name)).toEqual(["alpha", "b"]);
  });

  it("is deterministic and evaluates only explicitly supplied project policy", () => {
    const repository = createRepresentativeRepository();
    const withoutPolicy = measureCodebase({ repository, include_ignored: false });
    expect(measureCodebase({ repository, include_ignored: false })).toEqual(withoutPolicy);
    write(repository, "src/a.ts", "this dirty worktree content is not the committed Git tree\n");
    expect(measureCodebase({ repository, include_ignored: false })).toEqual(withoutPolicy);
    expect(withoutPolicy.ratios.ignored_to_committed.bytes).toBeNull();
    expect(withoutPolicy.policy).toEqual({
      basis: "project_policy_not_industry_truth",
      name: null,
      evaluations: [],
    });

    const policy: ComplexityPolicy = {
      name: "fixture policy",
      thresholds: {
        cyclomatic_max: 2,
        dependency_cycles_max: 1,
      },
    };
    expect(measureCodebase({ repository, include_ignored: false, policy }).policy).toEqual({
      basis: "project_policy_not_industry_truth",
      name: "fixture policy",
      evaluations: [
        { metric: "cyclomatic_max", operator: "<=", threshold: 2, actual: 3, status: "fail" },
        { metric: "dependency_cycles_max", operator: "<=", threshold: 1, actual: 1, status: "pass" },
      ],
    });
    expect(() => measureCodebase({
      repository,
      include_ignored: false,
      policy: { name: "bad", thresholds: { unknown: 1 } } as unknown as ComplexityPolicy,
    })).toThrow("Unknown complexity policy threshold: unknown");
  });

  it("binds dirty tracked and nonignored untracked metrics to the exact RepositoryObject", () => {
    const repository = createRepresentativeRepository();
    write(repository, "src/a.ts", "export function changed(): number { return 2; }\n");
    write(repository, "src/c.ts", "export function candidate(): number { return 3; }\n");
    const expected = captureRepositoryObject(repository);

    const report = measureRepositoryObjectCodebase({
      repository,
      expected_repository_object: expected,
    });

    expect(report.schema).toBe(REPOSITORY_OBJECT_COMPLEXITY_SCHEMA);
    expect(report.repository).toEqual({
      label: repository.split("/").at(-1),
      subject_kind: "repository_object",
      repository_object: expected,
    });
    expect(report.measurement_contract.entry_reconciliation).toEqual({
      repository_object_entries: 12,
      tracked_entries: 11,
      untracked_entries: 1,
      measured_files: 12,
      regular_files: 12,
      symlinks: 0,
      missing_tracked_entries: 0,
      gitlinks: 0,
    });
    expect(report.surfaces.subject.total.files).toBe(12);
    expect(report.surfaces.subject.categories.production_code.files).toBe(4);
    expect(report.structural.scope).toBe("RepositoryObject production_code TypeScript/JavaScript");
    expect(report.structural.supported_files).toBe(3);
    expect(report.measurement_contract.analyzer).toMatchObject({
      analyzer_id: "mister-clean.codebase-complexity",
      analyzer_source_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      classifier_id: "mister-clean.codebase-complexity.classifier",
      classifier_version: "1.1",
      typescript_version: ts.version,
    });
    expect(report.measurement_contract.classification_version).toBe(
      report.measurement_contract.analyzer.classifier_version,
    );
  });

  it("separates content-evidenced generated distribution mirrors from authored complexity", () => {
    const { repository, generatedCli } = createDistributionMirrorRepository();
    const expected = captureRepositoryObject(repository);
    const report = measureRepositoryObjectCodebase({ repository, expected_repository_object: expected });

    expect(report.surfaces.subject.categories.generated).toMatchObject({
      files: 1,
      bytes: Buffer.byteLength(generatedCli),
    });
    expect(report.surfaces.subject.generated_distribution_mirrors).toEqual(
      report.surfaces.subject.categories.generated,
    );
    expect(report.surfaces.subject.categories.production_code.files).toBe(3);
    expect(report.structural.supported_files).toBe(1);
    expect(report.structural.functions).toBe(0);
    expect(report.structural.top_hotspots).toEqual([]);
  });

  it("requires both a distribution path and bundler provenance before excluding authored structure", () => {
    const bundlerShaped = new TextEncoder().encode([
      "var __commonJS = (callback) => callback;",
      "// node_modules/example/index.js",
      "var example = __commonJS(() => {});",
      "",
    ].join("\n"));
    const authoredBin = new TextEncoder().encode("export function run() { return 1; }\n");

    expect(classifyRepositoryPath("bin/hand-authored.js", authoredBin)).toBe("production_code");
    expect(classifyRepositoryPath("src/bundler-shaped.js", bundlerShaped)).toBe("production_code");
    expect(classifyRepositoryPath("bin/generated-cli.js", bundlerShaped)).toBe("generated");
  });

  it("separates present unsupported UI assets and declared generated boundaries from debt imports", () => {
    const { repository } = createDistributionMirrorRepository();
    const expected = captureRepositoryObject(repository);
    const report = measureRepositoryObjectCodebase({ repository, expected_repository_object: expected });

    expect(report.structural.unresolved_relative_imports).toEqual([]);
    expect(report.structural.present_unsupported_relative_imports).toEqual([
      {
        importer: "src/main.ts",
        specifier: "../assets/tokens.css",
        target: "assets/tokens.css",
        target_language: "CSS",
      },
      {
        importer: "src/main.ts",
        specifier: "./App.svelte",
        target: "src/App.svelte",
        target_language: "Svelte",
      },
      {
        importer: "src/main.ts",
        specifier: "./styles.css",
        target: "src/styles.css",
        target_language: "CSS",
      },
    ]);
    expect(report.structural.declared_generated_boundary_relative_imports).toMatchObject([
      { importer: "src/main.ts", specifier: "./generated-materials.js" },
    ]);
  });

  it("excludes ignored mutations from an exact RepositoryObject report", () => {
    const repository = createRepresentativeRepository();
    const expected = captureRepositoryObject(repository);
    const before = measureRepositoryObjectCodebase({ repository, expected_repository_object: expected });
    write(repository, "node_modules/pkg/index.js", "module.exports = 2;\n");
    expect(captureRepositoryObject(repository)).toEqual(expected);
    expect(measureRepositoryObjectCodebase({ repository, expected_repository_object: expected })).toEqual(before);
  });

  it("binds staged index divergence even when worktree metrics are unchanged", () => {
    const repository = createRepresentativeRepository();
    const original = [
      "import { b } from \"./b.js\";",
      "export function alpha(flag: boolean, value: number): number {",
      "  if (flag && value > 0) return b(value);",
      "  return 0;",
      "}",
      "",
    ].join("\n");
    const beforeObject = captureRepositoryObject(repository);
    const before = measureRepositoryObjectCodebase({ repository, expected_repository_object: beforeObject });
    write(repository, "src/a.ts", "export const staged = true;\n");
    git(repository, "add", "src/a.ts");
    write(repository, "src/a.ts", original);
    const afterObject = captureRepositoryObject(repository);
    const after = measureRepositoryObjectCodebase({ repository, expected_repository_object: afterObject });

    expect(afterObject.sha256).not.toBe(beforeObject.sha256);
    expect(after.surfaces).toEqual(before.surfaces);
    expect(after.ratios).toEqual(before.ratios);
    expect(after.languages).toEqual(before.languages);
    expect(after.structural).toEqual(before.structural);
  });

  it("reconciles a deleted tracked path without measuring absent bytes", () => {
    const repository = createRepresentativeRepository();
    unlinkSync(join(repository, "src", "a.ts"));
    const expected = captureRepositoryObject(repository);
    const report = measureRepositoryObjectCodebase({ repository, expected_repository_object: expected });

    expect(expected.entry_count).toBe(11);
    expect(report.measurement_contract.entry_reconciliation).toMatchObject({
      repository_object_entries: 11,
      tracked_entries: 11,
      measured_files: 10,
      regular_files: 10,
      missing_tracked_entries: 1,
    });
    expect(report.surfaces.subject.total.files).toBe(10);
  });

  it("reconciles a missing tracked gitlink without treating it as file bytes", () => {
    const child = createRepository();
    write(child, "src/child.ts", "export const child = true;\n");
    git(child, "add", "--all");
    git(child, "commit", "-m", "child fixture");
    const repository = createRepresentativeRepository();
    git(
      repository,
      "update-index",
      "--add",
      "--cacheinfo",
      `160000,${git(child, "rev-parse", "HEAD")},vendor/child`,
    );
    git(repository, "commit", "-m", "add missing gitlink fixture");
    const expected = captureRepositoryObject(repository);
    const report = measureRepositoryObjectCodebase({ repository, expected_repository_object: expected });

    expect(report.measurement_contract.entry_reconciliation).toMatchObject({
      repository_object_entries: 12,
      tracked_entries: 12,
      measured_files: 11,
      gitlinks: 1,
    });
    expect(report.surfaces.subject.total.files).toBe(11);
  });

  it("refuses stale, malformed, and unclassifiable RepositoryObject subjects", () => {
    const repository = createRepresentativeRepository();
    const expected = captureRepositoryObject(repository);
    write(repository, "src/a.ts", "export const moved = true;\n");
    expect(() => measureRepositoryObjectCodebase({ repository, expected_repository_object: expected }))
      .toThrow("repository_object_mismatch");

    const current = captureRepositoryObject(repository);
    expect(() => measureRepositoryObjectCodebase({
      repository,
      expected_repository_object: { ...current, entry_count: current.entry_count + 1 },
    })).toThrow("repository_object_mismatch");

    write(repository, "mystery.xyz", "unknown\n");
    const unclassifiable = captureRepositoryObject(repository);
    expect(() => measureRepositoryObjectCodebase({
      repository,
      expected_repository_object: unclassifiable,
    })).toThrow("Unclassifiable RepositoryObject path: mystery.xyz");
  });

  it("runs object mode through the source-checkout wrapper and rejects mixed subjects", () => {
    const repository = createRepresentativeRepository();
    write(repository, "src/c.ts", "export const candidate = true;\n");
    const expected = captureRepositoryObject(repository);
    const objectPath = ".edge-agentic/local/repository-object.json";
    write(repository, objectPath, `${JSON.stringify(expected)}\n`);
    const script = fileURLToPath(new URL("../../scripts/measure_codebase.ts", import.meta.url));
    const absoluteObjectPath = join(repository, ...objectPath.split("/"));
    const stdout = execFileSync("bun", [
      script,
      "--repo", repository,
      "--repository-object", absoluteObjectPath,
    ], { encoding: "utf8" });
    const report = JSON.parse(stdout) as ReturnType<typeof measureRepositoryObjectCodebase>;
    expect(report.schema).toBe(REPOSITORY_OBJECT_COMPLEXITY_SCHEMA);
    expect(report.repository.repository_object).toEqual(expected);

    expect(() => execFileSync("bun", [
      script,
      "--repo", repository,
      "--ref", "HEAD",
      "--repository-object", absoluteObjectPath,
    ], { encoding: "utf8", stdio: "pipe" })).toThrow();
  });

  it("refuses RepositoryObject output paths that resolve inside the measured repository", () => {
    const repository = createRepresentativeRepository();
    const expected = captureRepositoryObject(repository);
    const evidenceRoot = mkdtempSync(join(tmpdir(), "mister-clean-complexity-output-"));
    roots.push(evidenceRoot);
    const objectPath = join(evidenceRoot, "repository-object.json");
    writeFileSync(objectPath, `${JSON.stringify(expected)}\n`, "utf8");
    const script = fileURLToPath(new URL("../../scripts/measure_codebase.ts", import.meta.url));

    expect(() => execFileSync("bun", [
      script,
      "--repo", repository,
      "--repository-object", objectPath,
      "--out", join(repository, "report.json"),
    ], { encoding: "utf8", stdio: "pipe" })).toThrow();

    const alias = join(evidenceRoot, "subject-alias");
    symlinkSync(repository, alias);
    expect(() => execFileSync("bun", [
      script,
      "--repo", repository,
      "--repository-object", objectPath,
      "--out", join(alias, "report.json"),
    ], { encoding: "utf8", stdio: "pipe" })).toThrow();
  });

  it("fails closed when a tracked file cannot be classified", () => {
    const repository = createRepository();
    write(repository, "mystery.xyz", "unknown\n");
    git(repository, "add", "mystery.xyz");
    git(repository, "commit", "-m", "unclassifiable");

    expect(() => measureCodebase({ repository, include_ignored: false }))
      .toThrow("Unclassifiable tracked path: mystery.xyz");
  });

  it("runs through the source-checkout Bun wrapper", () => {
    const repository = createRepresentativeRepository();
    const script = fileURLToPath(new URL("../../scripts/measure_codebase.ts", import.meta.url));
    const stdout = execFileSync("bun", [script, "--repo", repository, "--no-ignored"], {
      encoding: "utf8",
    });
    const report = JSON.parse(stdout) as ReturnType<typeof measureCodebase>;

    expect(report.repository.label).toBe(repository.split("/").at(-1));
    expect(report.measurement_contract.analyzer_runtime)
      .toBe("source_checkout_only_requires_typescript_dev_dependency");
    expect(report.surfaces.ignored.measured).toBe(false);
  });
});
