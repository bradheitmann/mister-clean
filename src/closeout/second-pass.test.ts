import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { receiptFindingsFromAudit, type ReceiptFinding } from "./finding-anchors.js";
import { scanTrackedPublicSafetySync } from "./inspection.js";
import { trackedShippablePaths } from "./repository.js";
import {
  assembleRunReceipt,
  baselineFromReceipt,
  captureReceiptSubject,
  classifySecondPass,
  flakyFingerprints,
  gitPortFor,
  legacyBaselineFromBundle,
  runSecondPass,
  type EarlierBaseline,
} from "./second-pass.js";
import { mintServerAttestationBinding } from "../runtime-binding.js";
import { LocalRunReceiptStore } from "../run-receipt.js";
import { createFixtureRepository, fixtureCommit, fixtureGit } from "../test-support/fixture-repo.js";

const roots: string[] = [];

function scratch(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `mc-second-pass-${name}-`));
  roots.push(root);
  return root;
}

function repository(name: string): string {
  const root = scratch(name);
  createFixtureRepository(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const SOURCE_RUNTIME = mintServerAttestationBinding({
  record_type: "mister-clean.runtime-attestation-binding",
  schema_version: "1.0",
  status: "source_development",
  package_root: "/fixture/mister-clean",
  package_root_realpath: "/fixture/mister-clean",
  entrypoint: { path: "./src/cli.ts", realpath: "/fixture/mister-clean/src/cli.ts", sha256: "a".repeat(64) },
  reason: "second-pass test source execution",
});

const PLANTED = `${"person"}@${"example.org"}`;
const UNOBSERVED = { identity_status: "unobserved", card_ref: null, source: null } as const;

function currentPublicSafety(root: string) {
  return receiptFindingsFromAudit("public_safety", scanTrackedPublicSafetySync(root, trackedShippablePaths(root), []), { repository: root });
}

function baselineAt(root: string, findings: readonly ReceiptFinding[], dirty = false): EarlierBaseline {
  return {
    kind: "receipt",
    ref: "mc-receipt:earlier",
    head_commit: fixtureGit(root, ["rev-parse", "HEAD"]),
    dirty,
    families: ["public_safety"],
    findings,
    subject_sha256: null,
  };
}

describe("second pass classification", () => {
  it("miss-decided-by-git: an offender committed before the baseline that the first run did not report is a MISS", () => {
    const root = repository("miss");
    writeFileSync(join(root, "notes.txt"), `contact=${PLANTED}\n`);
    fixtureCommit(root);
    // The first run reported nothing, although the line was already committed.
    const earlier = baselineAt(root, []);
    const rows = classifySecondPass({ earlier, current: currentPublicSafety(root), git: gitPortFor(root) });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ classification: "persisting_unseen", observed: "current_only", path: "notes.txt", rule: "email-address" });
    expect(rows[0]!.basis).toMatch(/^MISS: anchored bytes already committed at [0-9a-f]{12}:notes\.txt$/);
  });

  it("introduced-decided-by-git: a line added after the baseline is introduced", () => {
    const root = repository("introduced");
    writeFileSync(join(root, "notes.txt"), "clean\n");
    fixtureCommit(root);
    const earlier = baselineAt(root, []);
    writeFileSync(join(root, "notes.txt"), `clean\ncontact=${PLANTED}\n`);
    fixtureCommit(root, "add contact");
    const rows = classifySecondPass({ earlier, current: currentPublicSafety(root), git: gitPortFor(root) });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ classification: "introduced", observed: "current_only", path: "notes.txt" });
    // A file that did not exist at the baseline is introduced too.
    writeFileSync(join(root, "other.txt"), `contact=${PLANTED}\n`);
    fixtureCommit(root, "add other");
    const more = classifySecondPass({ earlier, current: currentPublicSafety(root), git: gitPortFor(root) });
    expect(more.find((row) => row.path === "other.txt")).toMatchObject({ classification: "introduced", basis: expect.stringMatching(/^path absent at [0-9a-f]{12}$/) });
  });

  it("never guesses when the earlier subject was dirty and the committed tree cannot prove absence", () => {
    const root = repository("dirty");
    writeFileSync(join(root, "notes.txt"), "clean\n");
    fixtureCommit(root);
    const earlier = baselineAt(root, [], true);
    writeFileSync(join(root, "notes.txt"), `clean\ncontact=${PLANTED}\n`);
    fixtureCommit(root, "add contact");
    const rows = classifySecondPass({ earlier, current: currentPublicSafety(root), git: gitPortFor(root) });
    expect(rows[0]).toMatchObject({ classification: "unresolvable_earlier_bytes" });
  });

  it("classifies persisting, persisting_rewritten and cleared from the earlier HEAD", () => {
    const root = repository("persisting");
    writeFileSync(join(root, "notes.txt"), `contact=${PLANTED}\n`);
    writeFileSync(join(root, "gone.txt"), `contact=${PLANTED}\n`);
    fixtureCommit(root);
    const earlierFindings = currentPublicSafety(root).map((item) => item.finding);
    const earlier = baselineAt(root, earlierFindings);
    // Same bytes: persisting. Remove one offender: cleared.
    rmSync(join(root, "gone.txt"));
    fixtureCommit(root, "remove gone");
    const rows = classifySecondPass({ earlier, current: currentPublicSafety(root), git: gitPortFor(root) });
    expect(rows.map((row) => [row.path, row.classification])).toEqual([["gone.txt", "cleared"], ["notes.txt", "persisting"]]);
    // Rewritten: the same value now lives in a file that did not hold it at the earlier HEAD.
    const second = repository("rewritten");
    writeFileSync(join(second, "a.txt"), `contact=${PLANTED}\n`);
    writeFileSync(join(second, "b.txt"), "nothing\n");
    fixtureCommit(second);
    const findingsA = currentPublicSafety(second).map((item) => item.finding);
    const earlierB = baselineAt(second, findingsA.map((finding) => ({ ...finding, path: "b.txt" })));
    writeFileSync(join(second, "b.txt"), `contact=${PLANTED}\n`);
    rmSync(join(second, "a.txt"));
    fixtureCommit(second, "move");
    const current = currentPublicSafety(second);
    // Force the join: the earlier finding was recorded against b.txt with this fingerprint.
    const joined = classifySecondPass({
      earlier: { ...earlierB, findings: current.map((item) => item.finding) },
      current,
      git: gitPortFor(second),
    });
    expect(joined).toEqual([expect.objectContaining({ path: "b.txt", classification: "persisting_rewritten" })]);
  });

  it("legacy-join: a pre-7.3 bundle with only legacy fingerprints still joins through anchor kind legacy", () => {
    const root = repository("legacy");
    writeFileSync(join(root, "notes.txt"), `contact=${PLANTED}\n`);
    fixtureCommit(root);
    const scan = scanTrackedPublicSafetySync(root, trackedShippablePaths(root), []);
    const bundle = scratch("legacy-bundle");
    writeFileSync(join(bundle, "public-safety-audit.json"), `${JSON.stringify(scan, null, 2)}\n`);
    writeFileSync(join(bundle, "regression-delta.json"), JSON.stringify({
      record_type: "mister-clean.regression-delta",
      schema_version: "1.5",
      detector_coverage: {
        baseline_repository_object: { record_type: "mister-clean.repository-object", schema_version: "1.0", head_commit: fixtureGit(root, ["rev-parse", "HEAD"]), surface: "tracked_and_nonignored", entry_count: 1, sha256: "3".repeat(64) },
        executions: [{ detector_id: "public_safety", result_ref: { path: "public-safety-audit.json", sha256: "0".repeat(64) }, finding_fingerprints: scan.findings.map((finding) => finding.fingerprint) }],
      },
    }));
    const earlier = legacyBaselineFromBundle(bundle);
    expect(earlier).toMatchObject({ kind: "legacy_bundle", dirty: null, families: ["public_safety"] });
    expect(earlier!.findings).toEqual([expect.objectContaining({ anchor: expect.objectContaining({ kind: "legacy" }), legacy_fingerprint: scan.findings[0]!.fingerprint })]);
    const rows = classifySecondPass({ earlier: earlier!, current: currentPublicSafety(root), git: gitPortFor(root) });
    expect(rows).toEqual([expect.objectContaining({ observed: "both", classification: "persisting", legacy_fingerprint: scan.findings[0]!.fingerprint })]);
    // The report path and the directory resolve to the same bundle.
    expect(legacyBaselineFromBundle(join(bundle, "regression-delta.json"))).toEqual(earlier);
    expect(legacyBaselineFromBundle(join(bundle, "missing.json"))).toBeUndefined();
  });

  it("marks a fingerprint flaky only when it alternates across three or more receipts of one identical subject", () => {
    const subject = "s".repeat(64);
    expect(flakyFingerprints([
      { subject_sha256: subject, fingerprints: ["a", "b"] },
      { subject_sha256: subject, fingerprints: ["a"] },
      { subject_sha256: subject, fingerprints: ["a", "b"] },
      { subject_sha256: "t".repeat(64), fingerprints: ["c"] },
      { subject_sha256: null, fingerprints: ["d"] },
    ])).toEqual(new Set(["b"]));
    expect(flakyFingerprints([{ subject_sha256: subject, fingerprints: ["a"] }, { subject_sha256: subject, fingerprints: [] }])).toEqual(new Set());
    // One turn (a miss later seen, or a finding that stopped being reported) is not alternation.
    expect(flakyFingerprints([
      { subject_sha256: subject, fingerprints: [] },
      { subject_sha256: subject, fingerprints: ["a"] },
      { subject_sha256: subject, fingerprints: ["a"] },
    ])).toEqual(new Set());
  });

  it("runs end to end: writes a SECOND_PASS receipt beside the AUDIT receipt and classifies against it", () => {
    const root = repository("e2e");
    writeFileSync(join(root, "notes.txt"), `contact=${PLANTED}\n`);
    fixtureCommit(root);
    const store = new LocalRunReceiptStore(join(scratch("e2e-root"), "receipts"));
    const capture = captureReceiptSubject(root)!;
    const now = "2026-11-03T00:00:00.000Z";
    // First run: an AUDIT receipt that (wrongly) saw nothing.
    store.write(assembleRunReceipt({
      capture, mode: "AUDIT", invocation_id: null, runtimeAttestation: SOURCE_RUNTIME, agent: UNOBSERVED,
      families: ["public_safety"], findings: [], verdict: "AUDIT_ONLY", exit_code: 0, observed_at: now, finished_at: now,
    }), root);
    const { result, receipt } = runSecondPass({ store, root, runtimeAttestation: SOURCE_RUNTIME, agent: UNOBSERVED, invocation_id: null });
    expect(receipt.mode).toBe("SECOND_PASS");
    expect(result).toMatchObject({ miss_count: 1, exitCode: 1, against: { kind: "receipt", dirty: false }, families: ["public_safety"] });
    expect(result.rows[0]).toMatchObject({ classification: "persisting_unseen" });
    expect(store.index().map((entry) => entry.mode)).toEqual(["AUDIT", "SECOND_PASS"]);
    // Against an explicit receipt id, and against a receipt from another repository: refused.
    const again = runSecondPass({ store, root, against: receipt.receipt_id, runtimeAttestation: SOURCE_RUNTIME, agent: UNOBSERVED, invocation_id: null });
    expect(again.result.rows[0]).toMatchObject({ classification: "persisting", observed: "both" });
    const other = repository("e2e-other");
    mkdirSync(join(other, "docs"));
    writeFileSync(join(other, "docs", "README.md"), "other\n");
    fixtureCommit(other);
    expect(() => runSecondPass({ store, root: other, against: receipt.receipt_id, runtimeAttestation: SOURCE_RUNTIME, agent: UNOBSERVED, invocation_id: null })).toThrow(/different repository identity/);
    expect(baselineFromReceipt(receipt).families).toEqual(["public_safety"]);
  });
});
