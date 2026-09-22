import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateBundle } from "./bundle.js";
import type { ActionHygieneProcessPort } from "./action-hygiene.js";
import {
  prepareCloseout as prepareCloseoutBound,
  type PrepareCloseoutOptions,
} from "./prepare.js";
import { isoTimestamp, validateManifest } from "./records.js";
import { mintServerAttestationBinding } from "../runtime-binding.js";

type JsonObject = Record<string, unknown>;
const roots: string[] = [];
const SOURCE_RUNTIME = mintServerAttestationBinding({
  record_type: "mister-clean.runtime-attestation-binding",
  schema_version: "1.0",
  status: "source_development",
  package_root: "/fixture/mister-clean",
  package_root_realpath: "/fixture/mister-clean",
  entrypoint: { path: "./src/cli.ts", realpath: "/fixture/mister-clean/src/cli.ts", sha256: "b".repeat(64) },
  reason: "hardening test source execution",
});

const TEST_PROCESS_PORT: ActionHygieneProcessPort = {
  processTable: () => [{
    pid: process.pid,
    ppid: 0,
    start_identity: "hardening-test-process",
    executable: process.execPath,
  }],
  pathTable: () => new Map([[process.pid, { cwd: "/", open_paths: [] }]]),
};

function prepareCloseout(options: Omit<PrepareCloseoutOptions, "runtimeAttestation">) {
  return prepareCloseoutBound({ ...options, processPort: options.processPort ?? TEST_PROCESS_PORT, runtimeAttestation: SOURCE_RUNTIME });
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(path: string): JsonObject {
  return JSON.parse(readFileSync(path, "utf8")) as JsonObject;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function command(cwd: string, executable: string, ...args: string[]): string {
  return execFileSync(executable, args, { cwd, encoding: "utf8" }).trim();
}

function manifestAction(target: string): JsonObject {
  return {
    id: "A-1", kind: "local_edit", target, purpose: "edit", risk: "reversible_local",
    authorization: { state: "granted", source: "skill_invocation", ref: "request-1" },
    preconditions: [], verification: [],
  };
}

async function prepared(name: string): Promise<{ repo: string; proof: string; bundlePath: string }> {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-hardening-" + name + "-"));
  roots.push(root);
  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  command(repo, "git", "init", "-b", "main");
  command(repo, "git", "config", "user.name", "Hardening Test");
  command(repo, "git", "config", "user.email", "hardening.invalid");
  mkdirSync(join(repo, "planning", "done"), { recursive: true });
  mkdirSync(join(repo, "planning", "backlog"), { recursive: true });
  writeFileSync(join(repo, "planning", "done", "done.md"), "done\n");
  writeFileSync(join(repo, "planning", "backlog", "next.md"), "next\n");
  writeFileSync(join(repo, "CURRENT-STATE.md"), "state\n");
  command(repo, "git", "add", ".");
  command(repo, "git", "commit", "-m", "fixture");
  const result = await prepareCloseout({
    repo, evidenceHome: root, runId: "run-1", requestRef: "request-1",
    requestText: "$mister-clean", now: () => new Date("2026-08-25T10:00:00Z"),
  });
  return { repo, proof: result.bundleDirectory, bundlePath: result.bundlePath };
}

function persistBundle(proof: string, bundle: JsonObject, report?: JsonObject): void {
  if (report) {
    writeJson(join(proof, "closeout-report.json"), report);
    (bundle.report as JsonObject).sha256 = sha(readFileSync(join(proof, "closeout-report.json"), "utf8"));
  }
  writeJson(join(proof, "closure-bundle.json"), bundle);
}

function addGate(fixture: { proof: string; bundlePath: string }): JsonObject {
  const bundle = json(fixture.bundlePath);
  const gate: JsonObject = {
    id: "fresh-clone", kind: "isolated_clone", object: "fixture",
    command: "fixture gate", expected_status: 0, observed_status: 0,
    semantic_status: "pass", verified: 1, total: 1, warnings: 0, debt: 0, skipped: 0,
    evidence_ref: { path: "gate-result.json", sha256: "pending" },
  };
  (bundle.successor_readiness as JsonObject).gates = [gate];
  writeJson(join(fixture.proof, "gate-result.json"), {
    record_type: "mister-clean.gate-result", gate_id: gate.id, object: gate.object,
    command: gate.command, observed_status: gate.observed_status,
    semantic_status: gate.semantic_status, verified: gate.verified, total: gate.total,
    warnings: gate.warnings, debt: gate.debt, skipped: gate.skipped,
    observed_at: "2026-08-25T10:00:00Z",
  });
  (gate.evidence_ref as JsonObject).sha256 = sha(readFileSync(join(fixture.proof, "gate-result.json"), "utf8"));
  persistBundle(fixture.proof, bundle);
  return bundle;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("record hardening regressions", () => {
  it("rejects nested traversal after normalization", () => {
    const errors = validateManifest({
      record_type: "mister-clean.action-manifest", schema_version: "1.0",
      execution_state: "authorized", repo: { id: "repo", commit: "a".repeat(40) },
      mode: "CLOSE", request_ref: "request-1",
      authorization_basis: { source: "skill_invocation", ref: "request-1", scope: "named_repository_and_current_task", standing: true },
      policy_sources: [], actions: [manifestAction("foo/../../etc/hosts")], excluded_actions: [],
    });
    expect(errors.some((error) => error.includes("repository-relative"))).toBe(true);
  });

  it("rejects impossible rollover timestamps", () => {
    expect(isoTimestamp("2026-02-30T10:00:00Z")).toBe(false);
    expect(isoTimestamp("0000-01-01T00:00:00Z")).toBe(false);
  });
});

describe("bundle hardening regressions", () => {
  it("requires typed criteria discovery fields", async () => {
    const fixture = await prepared("criteria-types");
    const bundle = json(fixture.bundlePath);
    const criteria = bundle.criteria_discovery as JsonObject;
    criteria.criteria_ids = null;
    criteria.discovered_count = false;
    criteria.none_found = "yes";
    persistBundle(fixture.proof, bundle);
    const result = await validateBundle(bundle, fixture.bundlePath, { repoPath: fixture.repo });
    expect(result.errors.some((error) => error.includes("criteria_ids: required string array"))).toBe(true);
    expect(result.errors.some((error) => error.includes("discovered_count: required nonnegative integer"))).toBe(true);
    expect(result.errors.some((error) => error.includes("none_found: required boolean"))).toBe(true);
  });

  it("requires typed criteria IDs in the bound source record", async () => {
    const fixture = await prepared("criteria-source-types");
    const bundle = json(fixture.bundlePath);
    const criteria = bundle.criteria_discovery as JsonObject;
    const sourceRef = (criteria.source_refs as JsonObject[])[0]!;
    const sourcePath = join(fixture.proof, String(sourceRef.path));
    const sourceRecord = json(sourcePath);
    sourceRecord.criteria_ids = null;
    writeJson(sourcePath, sourceRecord);
    sourceRef.sha256 = sha(readFileSync(sourcePath, "utf8"));
    persistBundle(fixture.proof, bundle);
    const result = await validateBundle(bundle, fixture.bundlePath, { repoPath: fixture.repo });
    expect(result.errors.some((error) => error.includes("criteria-source record requires criteria_ids string array"))).toBe(true);
  });


  it("rejects invalid planning kinds", async () => {
    const fixture = await prepared("planning-kind");
    const bundle = json(fixture.bundlePath);
    const systems = (bundle.planning_discovery as JsonObject).systems as JsonObject[];
    systems[0]!.kind = "invented";
    persistBundle(fixture.proof, bundle);
    const result = await validateBundle(bundle, fixture.bundlePath, { repoPath: fixture.repo });
    expect(result.errors.some((error) => error.includes("expected one of"))).toBe(true);
  });

  it("rejects duplicate planning systems and requires their source arrays", async () => {
    const fixture = await prepared("planning-duplicates");
    const bundle = json(fixture.bundlePath);
    const planning = bundle.planning_discovery as JsonObject;
    const systems = planning.systems as JsonObject[];
    systems.push(structuredClone(systems[0]) as JsonObject);
    systems[0]!.sources = [];
    systems[0]!.schema_sources = [];
    systems[0]!.validators = [];
    persistBundle(fixture.proof, bundle);
    const result = await validateBundle(bundle, fixture.bundlePath, { repoPath: fixture.repo });
    expect(result.errors.some((error) => error.includes("duplicate"))).toBe(true);
    expect(result.errors.some((error) => error.includes("required nonempty string array"))).toBe(true);
  });

  it("rejects executed-early planning artifacts with unexecuted later review", async () => {
    const fixture = await prepared("cascade");
    const bundle = json(fixture.bundlePath);
    const report = json(join(fixture.proof, "closeout-report.json"));
    report.verdict = "CLEAN";
    writeFileSync(join(fixture.repo, "planning", "done", "done.md"), "implementation done; acceptance review not_run\n");
    persistBundle(fixture.proof, bundle, report);
    const result = await validateBundle(bundle, fixture.bundlePath, { repoPath: fixture.repo });
    expect(result.errors.some((error) => error.includes("executed-early/unexecuted-later"))).toBe(true);
  });

  it("requires complete process topology rows", async () => {
    const fixture = await prepared("process-row");
    const bundle = json(fixture.bundlePath);
    const topology = (bundle.successor_readiness as JsonObject).topology as JsonObject;
    topology.processes = [{ blocking: false }];
    persistBundle(fixture.proof, bundle);
    const result = await validateBundle(bundle, fixture.bundlePath, { repoPath: fixture.repo });
    expect(result.errors.some((error) => error.includes("topology.processes[0].identity"))).toBe(true);
  });

  it("requires gate kind and executed-command semantics", async () => {
    const fixture = await prepared("gate-contract");
    const bundle = addGate(fixture);
    const gate = ((bundle.successor_readiness as JsonObject).gates as JsonObject[])[0]!;
    gate.kind = "invented";
    gate.command = "";
    persistBundle(fixture.proof, bundle);
    const result = await validateBundle(bundle, fixture.bundlePath, { repoPath: fixture.repo });
    expect(result.errors.some((error) => error.includes("unsupported gate kind"))).toBe(true);
    expect(result.errors.some((error) => error.includes("executed gate"))).toBe(true);
  });

  it("binds gate evidence to every reported gate field", async () => {
    const fixture = await prepared("gate-binding");
    const bundle = addGate(fixture);
    const gate = ((bundle.successor_readiness as JsonObject).gates as JsonObject[])[0]!;
    gate.observed_status = 7;
    persistBundle(fixture.proof, bundle);
    const result = await validateBundle(bundle, fixture.bundlePath, { repoPath: fixture.repo });
    expect(result.errors.some((error) => error.includes("bound gate record disagrees on observed_status"))).toBe(true);
  });

  it("requires debris evidence and binds its counters", async () => {
    const fixture = await prepared("debris-binding");
    const bundle = json(fixture.bundlePath);
    const debris = (bundle.successor_readiness as JsonObject).debris as JsonObject;
    debris.removed = 1;
    persistBundle(fixture.proof, bundle);
    const result = await validateBundle(bundle, fixture.bundlePath, { repoPath: fixture.repo });
    expect(result.errors.some((error) => error.includes("bound debris record disagrees on removed"))).toBe(true);
  });

  it("requires final-review identities and binds the review receipt", async () => {
    const fixture = await prepared("review-binding");
    const bundle = json(fixture.bundlePath);
    const review = (bundle.successor_readiness as JsonObject).final_review as JsonObject;
    review.reviewer = "";
    review.status = "passed";
    persistBundle(fixture.proof, bundle);
    const result = await validateBundle(bundle, fixture.bundlePath, { repoPath: fixture.repo });
    expect(result.errors.some((error) => error.includes("final_review.reviewer: required"))).toBe(true);

    review.reviewer = "reviewer";
    review.findings_total = 3;
    persistBundle(fixture.proof, bundle);
    const rebound = await validateBundle(bundle, fixture.bundlePath, { repoPath: fixture.repo });
    expect(rebound.errors.some((error) => error.includes("final_review.evidence_ref: bound review record disagrees on findings_total"))).toBe(true);
  });

  it("case-folds Unicode final-review aliases before judging independence", async () => {
    const fixture = await prepared("review-unicode-alias");
    const bundle = json(fixture.bundlePath);
    const review = (bundle.successor_readiness as JsonObject).final_review as JsonObject;
    review.reviewer = "ẞ";
    review.implementer = "SS";
    persistBundle(fixture.proof, bundle);
    const result = await validateBundle(bundle, fixture.bundlePath, { repoPath: fixture.repo });
    expect(result.errors.some((error) => error.includes("reviewer must differ from implementer"))).toBe(true);
  });

  it("requires a structurally valid designated current-state surface and bound designation", async () => {
    const fixture = await prepared("current-state");
    const bundle = json(fixture.bundlePath);
    const current = (bundle.successor_readiness as JsonObject).current_state as JsonObject;
    current.state = "designated";
    current.path = null;
    current.sha256 = null;
    current.designation = { path: "current-state-designation.json", sha256: "pending" };
    writeJson(join(fixture.proof, "current-state-designation.json"), {
      record_type: "mister-clean.current-state-designation", path: null, sha256: null, commit: current.commit,
    });
    (current.designation as JsonObject).sha256 = sha(readFileSync(join(fixture.proof, "current-state-designation.json"), "utf8"));
    persistBundle(fixture.proof, bundle);
    const result = await validateBundle(bundle, fixture.bundlePath, { repoPath: fixture.repo });
    expect(result.errors.some((error) => error.includes("current_state.path: required"))).toBe(true);

    current.path = "CURRENT-STATE.md";
    current.sha256 = "b".repeat(64);
    persistBundle(fixture.proof, bundle);
    const rebound = await validateBundle(bundle, fixture.bundlePath, { repoPath: fixture.repo });
    expect(rebound.errors.some((error) => error.includes("designation: bound designation disagrees on sha256"))).toBe(true);
  });

  it("requires policy evidence for local target resolution", async () => {
    const fixture = await prepared("local-policy");
    const bundle = json(fixture.bundlePath);
    const observation = (bundle.successor_readiness as JsonObject).target_observation as JsonObject;
    observation.kind = "local_ref_resolution";
    observation.policy_evidence = null;
    persistBundle(fixture.proof, bundle);
    const result = await validateBundle(bundle, fixture.bundlePath, { repoPath: fixture.repo });
    expect(result.errors.some((error) => error.includes("target_observation.policy_evidence"))).toBe(true);
  });
});
