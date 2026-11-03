import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type CliIO, runCli } from "../cli.js";
import { mintServerAttestationBinding } from "../runtime-binding.js";
import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";
import type { ActionHygieneProcessPort } from "./action-hygiene.js";
import { discoverBundlePlanningRoots, nodeFilePort, validateBundleFile } from "./bundle.js";
import {
  discoverNativeGates,
  excludedCandidateNote,
  identity,
  validateDiscoveryIntegrity,
  withoutField,
  type NativeGateDiscovery,
} from "./native-gates.js";
import { prepareCloseout } from "./prepare.js";
import { captureRepositoryObject } from "./repository-object.js";
import {
  discoverPlanningRoots,
  loadPlanningConfig,
  PLANNING_CONFIG_PATH,
  PLANNING_CONFIG_SCHEMA,
  PlanningConfigInvalidError,
} from "./repository.js";

const roots: string[] = [];

const ARCHIVED_MANIFEST = "reports/artifact/Cargo.toml";
const REAL_MANIFEST = "tools/real/Cargo.toml";
const OBJECT_FORM = { schema: PLANNING_CONFIG_SCHEMA, exclude: [{ path: "reports", kind: "archive" }] };
const STRING_FORM = { schema: PLANNING_CONFIG_SCHEMA, exclude: ["reports"] };

const SOURCE_RUNTIME = mintServerAttestationBinding({
  record_type: "mister-clean.runtime-attestation-binding",
  schema_version: "1.0",
  status: "source_development",
  package_root: "/fixture/mister-clean",
  package_root_realpath: "/fixture/mister-clean",
  entrypoint: { path: "./src/cli.ts", realpath: "/fixture/mister-clean/src/cli.ts", sha256: "a".repeat(64) },
  reason: "gate-scope test source execution",
});

const TEST_PROCESS_PORT: ActionHygieneProcessPort = {
  processTable: () => [{
    pid: process.pid,
    ppid: 0,
    start_identity: "gate-scope-test-process",
    executable: process.execPath,
  }],
  pathTable: () => new Map([[process.pid, { cwd: "/", open_paths: [] }]]),
};

function scratch(name: string): string {
  const base = mkdtempSync(join(tmpdir(), `mister-clean-gate-scope-${name}-`));
  roots.push(base);
  return base;
}

function put(repository: string, path: string, content = "x\n"): void {
  const absolute = join(repository, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

function cargoManifest(name: string): string {
  return `[package]\nname = "${name}"\nversion = "0.1.0"\nedition = "2021"\n`;
}

/** Two tracked Cargo manifests: one under the evidence/archive root, one real. */
function repo(name: string, config: unknown, options: { readonly real?: boolean } = {}): string {
  const repository = join(scratch(name), "repo");
  createFixtureRepository(repository, { branch: "main" });
  put(repository, ARCHIVED_MANIFEST, cargoManifest("artifact-of-record"));
  put(repository, "reports/artifact/src/lib.rs", "pub fn archived() {}\n");
  if (options.real !== false) {
    put(repository, REAL_MANIFEST, cargoManifest("real"));
    put(repository, "tools/real/src/lib.rs", "pub fn real() {}\n");
  }
  // Heuristic planning shapes, so planning parity is observable.
  put(repository, "plans/ROADMAP.md", "# Roadmap\n");
  put(repository, "reports/x/tasks/T-1.md", "# evidence\n");
  if (config !== undefined) {
    put(repository, PLANNING_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
  }
  fixtureCommit(repository, "fixture");
  return repository;
}

function capture(): { io: CliIO; stderr: string[]; stdout: string[] } {
  const stderr: string[] = [];
  const stdout: string[] = [];
  return { io: { stderr: (line) => stderr.push(line), stdout: (line) => stdout.push(line) }, stderr, stdout };
}

function cargoCwds(discovery: NativeGateDiscovery): string[] {
  return discovery.gates
    .filter((gate) => gate.command?.adapter === "cargo")
    .map((gate) => gate.command?.cwd ?? "")
    .sort();
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("planning-excluded roots prune native-gate discovery, visibly (O-GATE-SCOPE-1)", () => {
  it("proof 1: an archive exclude yields one gate and one typed exclusion record", () => {
    const repository = repo("archive", OBJECT_FORM);
    const discovery = discoverNativeGates(repository, captureRepositoryObject(repository));
    expect(cargoCwds(discovery)).toEqual(["tools/real"]);
    expect(discovery.required_gate_ids).toEqual(["cargo:tools:real:test"]);
    expect(discovery.excluded_candidates).toEqual([{
      kind: "gate_candidate_excluded_by_planning_policy",
      path: ARCHIVED_MANIFEST,
      manifest: "cargo_manifest",
      exclude_root: "reports",
    }]);
    // The skipped manifest is not an evidence source of any gate either.
    expect(discovery.source_refs.map((ref) => ref.path)).toEqual([REAL_MANIFEST]);
    expect(discovery.schema_version).toBe("1.4");
    expect(validateDiscoveryIntegrity(discovery)).toEqual([]);
    expect(excludedCandidateNote(discovery.excluded_candidates![0]!))
      .toBe(`gate candidate excluded by planning policy: ${ARCHIVED_MANIFEST}`);
  });

  it("proof 1 (report): prepare lists the exclusion as a human line and typed evidence, and the bundle validates", async () => {
    const evidence = join(scratch("archive-prepare-evidence"), "evidence");
    const repository = repo("archive-prepare", {
      schema: PLANNING_CONFIG_SCHEMA,
      exclude: [{ path: "reports", kind: "evidence" }],
    }, { real: false });
    const prepared = await prepareCloseout({
      repo: repository,
      evidenceHome: evidence,
      runId: "gate-scope-archive",
      requestRef: "request-1",
      processPort: TEST_PROCESS_PORT,
      runtimeAttestation: SOURCE_RUNTIME,
    });
    const report = JSON.parse(readFileSync(join(prepared.bundleDirectory, "closeout-report.json"), "utf8")) as {
      dimensions: { verification: { evidence: unknown[]; notes: string[] } };
    };
    expect(report.dimensions.verification.notes)
      .toContain(`gate candidate excluded by planning policy: ${ARCHIVED_MANIFEST}`);
    expect(report.dimensions.verification.evidence).toContainEqual({
      kind: "gate_candidate_excluded_by_planning_policy",
      path: ARCHIVED_MANIFEST,
      manifest: "cargo_manifest",
      exclude_root: "reports",
    });
    const discovery = JSON.parse(readFileSync(join(prepared.bundleDirectory, "native-gate-discovery.json"), "utf8")) as NativeGateDiscovery;
    expect(discovery.excluded_candidates).toHaveLength(1);
    expect(discovery.required_gate_ids).toEqual([]);
    await expect(validateBundleFile(prepared.bundlePath, { repoPath: repository })).resolves.toEqual({ errors: [], ok: true });
  });

  it("proof 2: the string form stays planning-only, so both gates are discovered", () => {
    const repository = repo("string", STRING_FORM);
    expect(loadPlanningConfig(repository)).toMatchObject({ exclude: ["reports"], gateExclude: [] });
    const discovery = discoverNativeGates(repository, captureRepositoryObject(repository));
    expect(cargoCwds(discovery)).toEqual(["reports/artifact", "tools/real"]);
    expect(discovery.excluded_candidates).toEqual([]);
    expect(validateDiscoveryIntegrity(discovery)).toEqual([]);
  });

  it("proof 3: an unknown exclude kind refuses typed from the one loader", async () => {
    const repository = repo("scratch-kind", {
      schema: PLANNING_CONFIG_SCHEMA,
      exclude: [{ path: "reports", kind: "scratch" }],
    });
    let failure: unknown;
    try { loadPlanningConfig(repository); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(PlanningConfigInvalidError);
    expect(failure).toMatchObject({ code: "planning_config_invalid", path: PLANNING_CONFIG_PATH });
    expect((failure as PlanningConfigInvalidError).reason).toMatch(/exclude\[0\]\.kind "scratch" is not one of \["archive","evidence"\]/u);
    expect(() => discoverPlanningRoots(repository)).toThrow(PlanningConfigInvalidError);
    expect(() => discoverNativeGates(repository, captureRepositoryObject(repository))).toThrow(PlanningConfigInvalidError);
    await expect(discoverBundlePlanningRoots(repository, nodeFilePort)).rejects.toBeInstanceOf(PlanningConfigInvalidError);
    const output = capture();
    expect(await runCli(["audit", "planning", repository, "--json"], output.io)).toBe(2);
    expect(JSON.parse(output.stdout.join("\n"))).toMatchObject({ code: "planning_config_invalid", path: PLANNING_CONFIG_PATH });
  });

  it("proof 4: planning roots are pruned identically for the string and object forms", async () => {
    const fromStrings = repo("parity-string", STRING_FORM);
    const fromObjects = repo("parity-object", OBJECT_FORM);
    const stringRoots = discoverPlanningRoots(fromStrings);
    const objectRoots = discoverPlanningRoots(fromObjects);
    expect(stringRoots).toEqual(["plans"]);
    expect(objectRoots).toEqual(stringRoots);
    expect([...await discoverBundlePlanningRoots(fromStrings, nodeFilePort)].sort()).toEqual(stringRoots);
    expect([...await discoverBundlePlanningRoots(fromObjects, nodeFilePort)].sort()).toEqual(objectRoots);
    expect(loadPlanningConfig(fromObjects)?.exclude).toEqual(loadPlanningConfig(fromStrings)?.exclude);
    for (const repository of [fromStrings, fromObjects]) {
      const output = capture();
      // Exit 1 means findings remain in the planning corpus; only 2 is a refusal.
      expect([0, 1]).toContain(await runCli(["audit", "planning", repository, "--json"], output.io));
      const json = JSON.parse(output.stdout.join("\n")) as { planningRootCount: number; planning_config: { path: string } };
      expect(json.planningRootCount).toBe(1);
      expect(json.planning_config.path).toBe(PLANNING_CONFIG_PATH);
    }
  });

  it("still reads a legacy 1.3 discovery record that predates excluded_candidates", () => {
    const repository = repo("legacy", undefined);
    const fresh = discoverNativeGates(repository, captureRepositoryObject(repository));
    const { excluded_candidates: _dropped, ...rest } = withoutField(fresh, "catalog_sha256");
    const legacyBody = { ...rest, schema_version: "1.3" };
    const legacy = { ...legacyBody, catalog_sha256: identity(legacyBody) } as unknown as NativeGateDiscovery;
    expect(validateDiscoveryIntegrity(legacy)).toEqual([]);
    // A 1.4 record without the key is not a legacy record; it is malformed.
    const malformedBody = { ...rest, schema_version: "1.4" };
    const malformed = { ...malformedBody, catalog_sha256: identity(malformedBody) } as unknown as NativeGateDiscovery;
    expect(validateDiscoveryIntegrity(malformed)).toContain("discovery is missing keys: excluded_candidates");
  });
});
