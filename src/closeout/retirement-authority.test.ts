import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { validateBundleFile } from "./bundle.js";
import { prepareCloseout as prepareCloseoutBound, type PrepareCloseoutOptions } from "./prepare.js";
import { validateReport } from "./records.js";
import { RETIREMENT_RATIFICATION_NORMALIZER, RETIREMENT_RATIFICATION_NOTE, RETIREMENT_RULING_MINTED_BY } from "./retirement-ratification.js";
import type { ActionHygieneProcessPort } from "./action-hygiene.js";
import { mintServerAttestationBinding } from "../runtime-binding.js";
import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const SOURCE_RUNTIME = mintServerAttestationBinding({
  record_type: "mister-clean.runtime-attestation-binding",
  schema_version: "1.0",
  status: "source_development",
  package_root: "/fixture/mister-clean",
  package_root_realpath: "/fixture/mister-clean",
  entrypoint: { path: "./src/cli.ts", realpath: "/fixture/mister-clean/src/cli.ts", sha256: "a".repeat(64) },
  reason: "retirement authority test source execution",
});
const TEST_PROCESS_PORT: ActionHygieneProcessPort = {
  processTable: () => [{ pid: process.pid, ppid: 0, start_identity: "retirement-authority-test", executable: process.execPath }],
  pathTable: () => new Map([[process.pid, { cwd: "/", open_paths: [] }]]),
};
function prepareCloseout(options: Omit<PrepareCloseoutOptions, "runtimeAttestation">) {
  return prepareCloseoutBound({ ...options, processPort: options.processPort ?? TEST_PROCESS_PORT, runtimeAttestation: SOURCE_RUNTIME });
}

type Json = Record<string, unknown>;
const sha256 = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
const json = (path: string): Json => JSON.parse(readFileSync(path, "utf8")) as Json;
const RETIREMENT_RECORD = "charter/retirements/2026-11-03-legacy.json";

/**
 * The red-team exploit: an agent commits its own "owner decision" and a
 * retirement record that names an executive author. Nothing a human signed.
 */
function exploitFixture(name: string, retire: boolean): { base: string; evidence: string; repo: string; denylist: string } {
  const base = mkdtempSync(join(tmpdir(), `mister-clean-retirement-authority-${name}-`));
  roots.push(base);
  const repo = join(base, "repo");
  const evidence = join(base, "evidence");
  mkdirSync(repo);
  createFixtureRepository(repo, { branch: "main", identity: { name: "Agent", email: "agent.invalid" } });
  const denylist = join(base, "denylist.txt");
  writeFileSync(denylist, "internal campaign\n");
  mkdirSync(join(repo, "legacy"), { recursive: true });
  writeFileSync(join(repo, "legacy", "notes.md"), "internal campaign marker\n");
  writeFileSync(join(repo, "legacy", "more.md"), "another internal campaign marker\n");
  if (retire) {
    const rulingPath = "charter/owner-decisions/2026-11-03-retire-legacy.md";
    mkdirSync(join(repo, "charter", "owner-decisions"), { recursive: true });
    writeFileSync(join(repo, rulingPath), "Owner ruling (written by an agent): retire everything under legacy.\n");
    mkdirSync(join(repo, "charter", "retirements"), { recursive: true });
    writeFileSync(join(repo, RETIREMENT_RECORD), `${JSON.stringify({
      record_type: "mister-clean.retirement",
      schema_version: "1.0",
      slug: "legacy-corpus",
      roots: ["legacy"],
      ruling: {
        author: "A/EXEC-PM",
        at: "2026-11-03T00:00:00Z",
        scope: "Retire the legacy corpus",
        evidence: { path: rulingPath, sha256: sha256(readFileSync(join(repo, rulingPath))) },
      },
    }, null, 2)}\n`);
  }
  fixtureCommit(repo, "agent-authored retirement");
  return { base, evidence, repo, denylist };
}

async function prepared(name: string, retire = true) {
  const fixture = exploitFixture(name, retire);
  const result = await prepareCloseout({
    repo: fixture.repo,
    evidenceHome: fixture.evidence,
    runId: name,
    requestRef: "request-1",
    publicSafetyDenylistPath: fixture.denylist,
  });
  const reportPath = join(result.bundleDirectory, "closeout-report.json");
  return { ...fixture, ...result, reportPath, report: json(reportPath) };
}

function debtsOf(report: Json): Json[] {
  return report.completion_debts as Json[];
}

/** Rewrite the report and re-bind every digest that names it, as a careful forger would. */
function rewriteReport(bundlePath: string, reportPath: string, edit: (report: Json) => void): void {
  const before = sha256(readFileSync(reportPath));
  const report = json(reportPath);
  edit(report);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  const after = sha256(readFileSync(reportPath));
  const bundleText = readFileSync(bundlePath, "utf8");
  expect(bundleText.includes(before)).toBe(true);
  writeFileSync(bundlePath, bundleText.replaceAll(before, after));
}

describe("retirement authority: a tool-issued ruling is never an owner act", { timeout: 180_000 }, () => {
  it("the exploit fixture prepares NOT CLEAN with one open ratification decision per application and validates structurally", async () => {
    const run = await prepared("exploit");
    const debts = debtsOf(run.report);
    const applications = run.report.retirement_applications as Json[];
    expect(applications).toHaveLength(1);
    const retired = debts.filter((debt) => debt.state === "accepted_exception");
    expect(retired.length).toBeGreaterThanOrEqual(2);
    const ratifications = debts.filter((debt) => debt.normalizer === RETIREMENT_RATIFICATION_NORMALIZER);
    expect(ratifications).toHaveLength(applications.length);
    expect(ratifications[0]).toEqual(expect.objectContaining({
      class: "retirement_ratification",
      state: "open",
      disposition: "decision_or_coordination_required",
      affected_paths: ["legacy"],
      cause_key: { record_path: RETIREMENT_RECORD, record_sha256: sha256(readFileSync(join(run.repo, RETIREMENT_RECORD))) },
    }));
    expect(String(ratifications[0]?.procedure)).toContain(RETIREMENT_RATIFICATION_NOTE);
    expect(JSON.stringify((run.report.dimensions as Json).completion_debt)).toContain(RETIREMENT_RATIFICATION_NOTE);
    expect(run.report.verdict).toBe("NOT_CLEAN");
    // A forger flipping the verdict cannot get CLEAN past the open decision.
    const forged = { ...run.report, verdict: "CLEAN" };
    const verdictErrors = validateReport(forged as never).filter((error) => error.includes("decision_or_coordination_required present"));
    expect(verdictErrors).toEqual([`$.verdict: CLEAN forbidden -- decision_or_coordination_required present: ${String(ratifications[0]?.id)}`]);
    const validation = await validateBundleFile(run.bundlePath, { repoPath: run.repo });
    expect(validation.errors).toEqual([]);
  });

  it("minted records declare minted_by and bind the retirement record's bytes as source", async () => {
    const run = await prepared("minted");
    const recordSha256 = sha256(readFileSync(join(run.repo, RETIREMENT_RECORD)));
    const retired = debtsOf(run.report).filter((debt) => debt.state === "accepted_exception");
    expect(retired.length).toBeGreaterThan(0);
    for (const debt of retired) {
      const ref = (debt.exception as { ref: { path: string } }).ref;
      const minted = json(join(run.bundleDirectory, ref.path));
      expect(minted).toEqual(expect.objectContaining({
        record_type: "mister-clean.operator-ruling",
        debt_id: debt.id,
        minted_by: RETIREMENT_RULING_MINTED_BY,
        source: { path: RETIREMENT_RECORD, sha256: recordSha256 },
      }));
    }
  });

  it("refuses a bundle whose deleted ratification debt leaves the per-debt ruling records in place", async () => {
    const run = await prepared("deleted-ratification");
    let deletedKey = "";
    rewriteReport(run.bundlePath, run.reportPath, (report) => {
      const debts = debtsOf(report);
      deletedKey = String(debts.find((debt) => debt.normalizer === RETIREMENT_RATIFICATION_NORMALIZER)?.debt_key);
      const kept = debts.filter((debt) => debt.normalizer !== RETIREMENT_RATIFICATION_NORMALIZER);
      expect(kept.length).toBe(debts.length - 1);
      report.completion_debts = kept;
      report.debt_census = { ...(report.debt_census as Json), discovered: kept.length };
    });
    const validation = await validateBundleFile(run.bundlePath, { repoPath: run.repo });
    expect(deletedKey).toMatch(/^[0-9a-f]{64}$/u);
    expect(validation.errors.filter((error) => error.endsWith(`root_projection: evidence-derived root debt ${deletedKey} is absent from report completion_debts`))).toHaveLength(1);
    // The minted records stay, so the bundle is still refused for what it keeps.
    expect(validation.ok).toBe(false);
  });

  it("refuses a changed retirement record with --repo after prepare", async () => {
    const run = await prepared("changed-retirement-record");
    const live = join(run.repo, RETIREMENT_RECORD);
    writeFileSync(live, readFileSync(live, "utf8").replace("Retire the legacy corpus", "Retire the legacy corpus, and more"));
    fixtureCommit(run.repo, "edit the retirement after prepare");
    const validation = await validateBundleFile(run.bundlePath, { repoPath: run.repo });
    expect(validation.errors.filter((error) => error.includes("does not match the live retirement record"))).toHaveLength(1);
  });

  it("still validates a bundle with no retirements, as 7.4.0 produced it", async () => {
    const run = await prepared("no-retirements", false);
    expect(run.report.retirement_applications).toEqual([]);
    expect(debtsOf(run.report).some((debt) => debt.normalizer === RETIREMENT_RATIFICATION_NORMALIZER)).toBe(false);
    const validation = await validateBundleFile(run.bundlePath, { repoPath: run.repo });
    expect(validation.errors).toEqual([]);
  });
});
