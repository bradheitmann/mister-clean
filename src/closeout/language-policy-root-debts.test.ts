import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { beginAction, finishAction } from "./action-lifecycle.js";
import { nodeProcessPort, type ActionHygieneProcessPort } from "./action-hygiene.js";
import { validateBundleFile } from "./bundle.js";
import { validateLive } from "./bundle-live-validation.js";
import { nodeBundlePorts } from "./bundle-runtime.js";
import { detectorRegistrySha256 } from "./detector-coverage.js";
import { languagePolicyFindingFingerprint, LANGUAGE_POLICY_SCHEMA } from "./language-policy.js";
import { prepareCloseout as prepareCloseoutBound, type PrepareCloseoutOptions } from "./prepare.js";
import { canonicalObservationId, canonicalRootDebtKey } from "./regression-accounting.js";
import { repositoryIdentity } from "./repository.js";
import { mintServerAttestationBinding } from "../runtime-binding.js";
import { createFixtureRepository, fixtureCommit, fixtureGit } from "../test-support/fixture-repo.js";

type Json = Record<string, unknown>;

const roots: string[] = [];
const SOURCE_RUNTIME = mintServerAttestationBinding({
  record_type: "mister-clean.runtime-attestation-binding",
  schema_version: "1.0",
  status: "source_development",
  package_root: "/fixture/mister-clean",
  package_root_realpath: "/fixture/mister-clean",
  entrypoint: { path: "./src/cli.ts", realpath: "/fixture/mister-clean/src/cli.ts", sha256: "a".repeat(64) },
  reason: "language-policy root-debt test source execution",
});
const TEST_PROCESS_PORT: ActionHygieneProcessPort = {
  processTable: () => [{ pid: process.pid, ppid: 0, start_identity: "language-policy-debt-test", executable: process.execPath }],
  pathTable: () => new Map([[process.pid, { cwd: "/", open_paths: [] }]]),
};
const NORMALIZER = "mister-clean/language-policy-root@1";
const DETECTOR = "mister-clean/language_policy@1";
const POLICY = { schema: LANGUAGE_POLICY_SCHEMA, forbid_extensions: [".py", ".mjs"] };

function prepareCloseout(options: Omit<PrepareCloseoutOptions, "runtimeAttestation" | "processPort">) {
  return prepareCloseoutBound({ ...options, processPort: TEST_PROCESS_PORT, runtimeAttestation: SOURCE_RUNTIME });
}

function repository(name: string, policy: boolean, forbidden = "a.py"): { readonly repo: string; readonly evidence: string } {
  const base = mkdtempSync(join(tmpdir(), `mc-language-policy-debts-${name}-`));
  roots.push(base);
  const repo = join(base, "repo");
  mkdirSync(repo);
  createFixtureRepository(repo);
  writeFileSync(join(repo, "README.md"), "fixture\n");
  writeFileSync(join(repo, "c.ts"), "export {};\n");
  mkdirSync(join(repo, forbidden, ".."), { recursive: true });
  writeFileSync(join(repo, forbidden), "print('a')\n");
  if (policy) {
    mkdirSync(join(repo, ".mister-clean"));
    writeFileSync(join(repo, ".mister-clean", "language-policy.json"), `${JSON.stringify(POLICY)}\n`);
  }
  fixtureCommit(repo);
  return { repo, evidence: join(base, "evidence") };
}

function json(path: string): Json {
  return JSON.parse(readFileSync(path, "utf8")) as Json;
}

function writeJson(path: string, value: unknown): string {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, text);
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function languageDebts(bundleDirectory: string): Json[] {
  const report = json(join(bundleDirectory, "closeout-report.json"));
  return (report.completion_debts as Json[]).filter((debt) => debt.normalizer === NORMALIZER);
}

/** Rewrite the report and re-bind it from the closure bundle, as a forger with file access would. */
function rebindReport(bundleDirectory: string, report: Json): void {
  const reportSha = writeJson(join(bundleDirectory, "closeout-report.json"), report);
  const bundle = json(join(bundleDirectory, "closure-bundle.json"));
  (bundle.report as Json).sha256 = reportSha;
  writeJson(join(bundleDirectory, "closure-bundle.json"), bundle);
}

/**
 * The bytes 7.0-7.5 write for the same repository: regression 1.5 bound to the
 * frozen registry 5, no language_policy execution, applicability row,
 * accounting block or audit file.
 */
function asRegistryFiveBundle(bundleDirectory: string): void {
  const regressionPath = join(bundleDirectory, "regression-delta.json");
  const regression = json(regressionPath);
  const coverage = regression.detector_coverage as Json;
  regression.schema_version = "1.5";
  coverage.registry_version = "5";
  coverage.registry_sha256 = detectorRegistrySha256("5");
  coverage.required_detector_ids = (coverage.required_detector_ids as string[]).filter((id) => id !== "language_policy");
  coverage.applicability = (coverage.applicability as Json[]).filter((row) => row.detector_id !== "language_policy");
  coverage.executions = (coverage.executions as Json[]).filter((row) => row.detector_id !== "language_policy");
  const regressionSha = writeJson(regressionPath, regression);
  const report = json(join(bundleDirectory, "closeout-report.json"));
  ((report.regression_control as Json).evidence_ref as Json).sha256 = regressionSha;
  delete report.language_policy_accounting;
  rebindReport(bundleDirectory, report);
  unlinkSync(join(bundleDirectory, "language-policy-audit.json"));
}

beforeEach(() => {
  vi.spyOn(nodeProcessPort, "processTable").mockReturnValue(TEST_PROCESS_PORT.processTable());
  vi.spyOn(nodeProcessPort, "pathTable").mockReturnValue(TEST_PROCESS_PORT.pathTable());
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("language_policy root debts (registry 6, regression 1.6)", () => {
  it("debt: a tracked forbidden file is one language_policy root debt; the CLOSE run is NOT_CLEAN and the bundle validates", async () => {
    const { repo, evidence } = repository("debt", true);
    const prepared = await prepareCloseout({ repo, evidenceHome: evidence, runId: "debt", requestRef: "request-1" });
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));
    const regression = json(join(prepared.bundleDirectory, "regression-delta.json"));
    const fingerprint = languagePolicyFindingFingerprint("a.py", ".py");
    const causeKey = { detector_family: "language_policy", path: "a.py", extension: ".py" };
    expect(report.verdict).toBe("NOT_CLEAN");
    expect(regression.schema_version).toBe("1.6");
    expect((regression.detector_coverage as Json).registry_version).toBe("6");
    const debts = languageDebts(prepared.bundleDirectory);
    expect(debts).toHaveLength(1);
    expect(debts[0]).toMatchObject({
      normalizer: NORMALIZER,
      cause_key: causeKey,
      debt_key: canonicalRootDebtKey({ repo_id: repositoryIdentity(repo), normalizer: NORMALIZER, cause_key: causeKey }),
      observation_ids: [canonicalObservationId({ source_id: DETECTOR, source_native_fingerprint: fingerprint })],
      detector_finding_fingerprints: [fingerprint],
      disposition: "autonomously_repair",
      state: "open",
      origin: { class: "baseline" },
      repair_boundary: "file:a.py",
    });
    expect(report.language_policy_accounting).toMatchObject({ status: "fail", finding_count: 1, root_debt_count: 1 });
    await expect(validateBundleFile(prepared.bundlePath, { repoPath: repo })).resolves.toEqual({ errors: [], ok: true });
  }, 60_000);

  it("no policy: a not_applicable language_policy execution with zero fingerprints, zero debts, and a valid bundle", async () => {
    const { repo, evidence } = repository("no-policy", false);
    const prepared = await prepareCloseout({ repo, evidenceHome: evidence, runId: "no-policy", requestRef: "request-1" });
    const coverage = json(join(prepared.bundleDirectory, "regression-delta.json")).detector_coverage as Json;
    const execution = (coverage.executions as Json[]).find((row) => row.detector_id === "language_policy");
    expect(execution).toMatchObject({ detector: DETECTOR, exit_code: 0, finding_fingerprints: [] });
    expect(coverage.applicability).toContainEqual({ detector_id: "language_policy", disposition: "required", basis: "core_closeout" });
    expect(json(join(prepared.bundleDirectory, "language-policy-audit.json"))).toMatchObject({ status: "not_applicable", findings: [] });
    expect(languageDebts(prepared.bundleDirectory)).toEqual([]);
    await expect(validateBundleFile(prepared.bundlePath, { repoPath: repo })).resolves.toEqual({ errors: [], ok: true });
  }, 60_000);

  it("regression 1.5 / registry 5: a bundle in the shape 7.0-7.5 write still validates, and 1.5 cannot claim registry 6", async () => {
    const { repo, evidence } = repository("schema-15", false);
    const prepared = await prepareCloseout({ repo, evidenceHome: evidence, runId: "schema-15", requestRef: "request-1" });
    asRegistryFiveBundle(prepared.bundleDirectory);
    expect(existsSync(join(prepared.bundleDirectory, "language-policy-audit.json"))).toBe(false);
    await expect(validateBundleFile(prepared.bundlePath, { repoPath: repo })).resolves.toEqual({ errors: [], ok: true });
    // No either-or: a 1.5 record carrying registry 6 is refused.
    const regressionPath = join(prepared.bundleDirectory, "regression-delta.json");
    const regression = json(regressionPath);
    const coverage = regression.detector_coverage as Json;
    coverage.registry_version = "6";
    coverage.registry_sha256 = detectorRegistrySha256("6");
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));
    ((report.regression_control as Json).evidence_ref as Json).sha256 = writeJson(regressionPath, regression);
    rebindReport(prepared.bundleDirectory, report);
    const refused = await validateBundleFile(prepared.bundlePath, { repoPath: repo });
    expect(refused.ok).toBe(false);
    expect(refused.errors).toContain("$.report.regression_control.evidence_ref.detector_coverage.registry_version: expected 5");
  }, 60_000);

  it("tampered: a bundle whose language_policy debt was removed is refused", async () => {
    const { repo, evidence } = repository("tampered", true);
    const prepared = await prepareCloseout({ repo, evidenceHome: evidence, runId: "tampered", requestRef: "request-1" });
    const report = json(join(prepared.bundleDirectory, "closeout-report.json"));
    const debts = report.completion_debts as Json[];
    const removed = debts.find((debt) => debt.normalizer === NORMALIZER)!;
    report.completion_debts = debts.filter((debt) => debt !== removed);
    const census = report.debt_census as Json;
    census.discovered = Number(census.discovered) - 1;
    rebindReport(prepared.bundleDirectory, report);
    const result = await validateBundleFile(prepared.bundlePath, { repoPath: repo });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes(String(removed.debt_key)))).toBe(true);
  }, 60_000);

  it("rerun: the live rerun and the action boundary both re-execute language_policy", async () => {
    const { repo, evidence } = repository("rerun", true, "legacy/a.py");
    const prepared = await prepareCloseout({ repo, evidenceHome: evidence, runId: "rerun", requestRef: "request-1" });
    const read = (name: string): Json => json(join(prepared.bundleDirectory, name));
    // Live: the forbidden file is still tracked, so the live row reports it.
    const liveErrors: string[] = [];
    await validateLive(read("closure-bundle.json"), read("closeout-report.json"), read("action-manifest.json"), prepared.bundlePath, repo, nodeBundlePorts, undefined, { pins: [], used: new Set() }, liveErrors);
    expect(liveErrors).toContain("$.live_detector_coverage.language_policy: CLEAN requires zero payable findings after owner-signed exceptions (got 1)");
    // Action boundary: port the file through the public lifecycle; the comparator reruns language_policy.
    const debt = languageDebts(prepared.bundleDirectory)[0]!;
    await beginAction({
      bundleDirectory: prepared.bundleDirectory,
      id: "port-a",
      debtKey: String(debt.debt_key),
      kind: "local_edit",
      target: "legacy",
      purpose: "port legacy/a.py out of the forbidden language",
      runtimeAttestation: SOURCE_RUNTIME,
    });
    fixtureGit(repo, ["mv", "legacy/a.py", "legacy/a.ts"]);
    writeFileSync(join(repo, "legacy", "a.ts"), "export const a = 'a';\n");
    fixtureCommit(repo, "port legacy/a.py to TypeScript");
    const closed = await finishAction({ bundleDirectory: prepared.bundleDirectory, id: "port-a", status: "closed", runtimeAttestation: SOURCE_RUNTIME });
    expect(closed.state).toBe("closed");
    const check = ((read("regression-delta.json").action_checks as Json[]).at(-1))!;
    const comparator = (check.comparators as Json[]).find((row) => row.detector_id === "language_policy");
    expect(comparator).toBeDefined();
    const observations = comparator!.observations as Json[];
    const fingerprint = languagePolicyFindingFingerprint("legacy/a.py", ".py");
    expect(observations.find((row) => row.phase === "before")?.finding_fingerprints).toEqual([fingerprint]);
    expect(observations.find((row) => row.phase === "after")?.finding_fingerprints).toEqual([]);
    expect(languageDebts(prepared.bundleDirectory)[0]).toMatchObject({ debt_key: debt.debt_key, state: "satisfied" });
    await expect(validateBundleFile(prepared.bundlePath, { repoPath: repo })).resolves.toEqual({ errors: [], ok: true });
  }, 120_000);
});
