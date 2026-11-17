/**
 * The phase registry and what is derived from it
 * (charter/DONE/mg-s2d-phase-registry.md, proofs 2, 5 and 9).
 *
 * The base values come from phase-oracles.test-fixture.ts, which holds the
 * lists and tables exactly as main caa59e9 wrote them by hand.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Records the calls the second pass's read-only run makes to the six entry
 * functions, and to the two helpers that compute the public-safety arguments.
 * While `active` is false every function behaves as written.
 */
const recorder = vi.hoisted(() => {
  const state = {
    active: false,
    calls: [] as { entry: string; args: unknown[] }[],
    helperCalls: [] as { entry: string; args: unknown[] }[],
    results: new Map<string, unknown>(),
    helperResults: new Map<string, unknown>(),
    entry(name: string, args: unknown[]): unknown {
      state.calls.push({ entry: name, args });
      return state.results.get(name);
    },
    helper(name: string, args: unknown[]): unknown {
      state.helperCalls.push({ entry: name, args });
      return state.helperResults.get(name);
    },
  };
  return state;
});

vi.mock("./planning.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./planning.js")>();
  return {
    ...actual,
    auditPlanningRepository: (...args: Parameters<typeof actual.auditPlanningRepository>) => recorder.active
      ? recorder.entry("auditPlanningRepository", args) as ReturnType<typeof actual.auditPlanningRepository>
      : actual.auditPlanningRepository(...args),
  };
});

vi.mock("./inspection.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./inspection.js")>();
  return {
    ...actual,
    scanTrackedPublicSafetySync: (...args: Parameters<typeof actual.scanTrackedPublicSafetySync>) => recorder.active
      ? recorder.entry("scanTrackedPublicSafetySync", args) as ReturnType<typeof actual.scanTrackedPublicSafetySync>
      : actual.scanTrackedPublicSafetySync(...args),
    loadDenylistSync: (...args: Parameters<typeof actual.loadDenylistSync>) => recorder.active
      ? recorder.helper("loadDenylistSync", args) as ReturnType<typeof actual.loadDenylistSync>
      : actual.loadDenylistSync(...args),
  };
});

vi.mock("./repository.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./repository.js")>();
  return {
    ...actual,
    trackedShippablePaths: (...args: Parameters<typeof actual.trackedShippablePaths>) => recorder.active
      ? recorder.helper("trackedShippablePaths", args) as ReturnType<typeof actual.trackedShippablePaths>
      : actual.trackedShippablePaths(...args),
  };
});

vi.mock("./github-actions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./github-actions.js")>();
  return {
    ...actual,
    auditGitHubActionsRepository: (...args: Parameters<typeof actual.auditGitHubActionsRepository>) => recorder.active
      ? recorder.entry("auditGitHubActionsRepository", args) as ReturnType<typeof actual.auditGitHubActionsRepository>
      : actual.auditGitHubActionsRepository(...args),
  };
});

vi.mock("./repository-boundaries.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./repository-boundaries.js")>();
  return {
    ...actual,
    auditRepositoryBoundaries: (...args: Parameters<typeof actual.auditRepositoryBoundaries>) => recorder.active
      ? recorder.entry("auditRepositoryBoundaries", args) as ReturnType<typeof actual.auditRepositoryBoundaries>
      : actual.auditRepositoryBoundaries(...args),
  };
});

vi.mock("./language-policy.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./language-policy.js")>();
  return {
    ...actual,
    auditLanguagePolicy: (...args: Parameters<typeof actual.auditLanguagePolicy>) => recorder.active
      ? recorder.entry("auditLanguagePolicy", args) as ReturnType<typeof actual.auditLanguagePolicy>
      : actual.auditLanguagePolicy(...args),
  };
});

vi.mock("./semantic.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./semantic.js")>();
  return {
    ...actual,
    auditSemanticRepository: (...args: Parameters<typeof actual.auditSemanticRepository>) => recorder.active
      ? recorder.entry("auditSemanticRepository", args) as ReturnType<typeof actual.auditSemanticRepository>
      : actual.auditSemanticRepository(...args),
  };
});

import { detectorRootProjections } from "./bundle-detector-evidence.js";
import {
  CLOSEOUT_DETECTORS,
  detectorRegistrySha256,
  detectorResultShapeErrors,
  findingFingerprintsFromAudit,
} from "./detector-coverage.js";
import { RECEIPT_FAMILIES, receiptFindingsFromAudit, type ReceiptFamily } from "./finding-anchors.js";
import {
  oracle_AUDIT_KIND_FAMILIES,
  oracle_CLI_AUDIT_KINDS,
  oracle_CLI_AUDIT_USAGE_ERROR,
  oracle_CLI_RECEIPT_TABLE,
  oracle_CLI_USAGE,
  oracle_CLOSEOUT_DETECTORS,
  oracle_LEGACY_DETECTOR_FAMILIES,
  oracle_RECEIPT_FAMILIES,
  oracle_readOnlyEntryCalls,
  type OracleEntryCall,
} from "./phase-oracles.test-fixture.js";
import {
  AUDIT_KINDS,
  CLOSEOUT_BUNDLE_FILES,
  CLOSEOUT_PHASE_IDS,
  CLOSEOUT_PHASES,
  PHASE_IDS,
  PHASES,
  isPhaseId,
  phaseByAuditKind,
  phaseById,
} from "./phase-registry.js";
import { LEGACY_BASELINE_FAMILIES, runReadOnlyFamilies, type ReadOnlyAuditOptions, type ReceiptSubjectCapture } from "./second-pass.js";
import { semanticCandidateSetSha256 } from "./semantic.js";
import { type CliIO, runCli } from "../cli.js";
import { LocalRunReceiptStore } from "../run-receipt.js";
import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";

const roots: string[] = [];

function scratch(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `mc-phase-registry-${name}-`));
  roots.push(root);
  return root;
}

afterEach(() => {
  recorder.active = false;
  recorder.calls = [];
  recorder.helperCalls = [];
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function cliOutput(): { io: CliIO; stderr: string[]; stdout: string[] } {
  const stderr: string[] = [];
  const stdout: string[] = [];
  return { io: { stderr: (line) => stderr.push(line), stdout: (line) => stdout.push(line) }, stderr, stdout };
}

/** A capture for a directory that is no worktree: results without findings never reach Git. */
function captureFor(repository: string): ReceiptSubjectCapture {
  return {
    repository,
    subject: { repository_object: null, head_commit: "1".repeat(40), head_tree: "2".repeat(40) },
    dirty: false,
    repository_id: `local-path-sha256:${"3".repeat(64)}`,
    path_prefix: "",
  };
}

/** One canonical result without findings per entry function, so the receipt projection accepts what the recorder returns. */
const EMPTY_RESULTS: Readonly<Record<string, unknown>> = {
  auditPlanningRepository: {
    artifactCount: 0, candidate_probe_count: 0, counts: {}, exitCode: 0, findings: [], planningRootCount: 0,
    raw_finding_count: 0, raw_findings: [], root_debt_count: 0, root_debts: [], status: "not_applicable",
    structuredArtifactCount: 0, suppressed_by_typed_nonartifact_count: 0,
  },
  scanTrackedPublicSafetySync: { exitCode: 0, findings: [], status: "pass", unassessed: [] },
  auditGitHubActionsRepository: {
    record_type: "mister-clean.github-actions-audit", schema_version: "1.0", status: "not_applicable", exitCode: 0,
    workflow_count: 0, sensitive_workflow_count: 0, findings: [],
  },
  auditRepositoryBoundaries: {
    record_type: "mister-clean.repository-boundary-audit", schema_version: "1.0", status: "pass", exitCode: 0,
    candidate_path_count: 0, parser_surfaces: [], external_contract_count: 0, findings: [],
  },
  auditSemanticRepository: {
    candidate_probe_count: 0, candidate_set_sha256: semanticCandidateSetSha256([]), candidates: [], confirmed_failure_count: 0,
    executed_probe_count: 0, executions: [], exitCode: 0, findings: [], pending_probe_count: 0, resolved_probe_count: 0,
    resolutions: [], snapshot: "a".repeat(40), status: "not_applicable", working_tree_sha256: "1".repeat(64),
  },
  auditLanguagePolicy: {
    record_type: "mister-clean.language-policy-audit", schema_version: "1.0", status: "not_applicable", exitCode: 0, policy: null,
    tracked_path_count: 0, allowed_count: 0, generated_exempt: { count: 0, paths: [] }, findings: [],
  },
};

const TRACKED_PATHS = Object.freeze(["tracked-paths-sentinel"]);
const DENYLIST_TERMS = Object.freeze(["denylist-terms-sentinel"]);

function startRecording(): void {
  recorder.results = new Map(Object.entries(EMPTY_RESULTS));
  recorder.helperResults = new Map<string, unknown>([["trackedShippablePaths", TRACKED_PATHS], ["loadDenylistSync", DENYLIST_TERMS]]);
  recorder.calls = [];
  recorder.helperCalls = [];
  recorder.active = true;
}

describe("derived lists", () => {
  it("lists the six families in the order the contract fixes", () => {
    expect(PHASES.map((phase) => phase.id)).toEqual([
      "planning_graph", "public_safety", "github_actions", "repository_boundaries", "semantic_boundary", "language_policy",
    ]);
    expect(PHASE_IDS).toEqual(PHASES.map((phase) => phase.id));
    // repository_boundaries is audit-only: it has no closeout part.
    expect(PHASES.filter((phase) => phase.closeout === null).map((phase) => phase.id)).toEqual(["repository_boundaries"]);
    expect(CLOSEOUT_PHASES.map((phase) => phase.id)).toEqual(CLOSEOUT_PHASE_IDS);
  });

  it("CLOSEOUT_DETECTORS equals the base literal, key order included", () => {
    expect(CLOSEOUT_DETECTORS).toStrictEqual([...oracle_CLOSEOUT_DETECTORS]);
    // The registry digest hashes this JSON: the bytes, not only the values, must match.
    expect(JSON.stringify(CLOSEOUT_DETECTORS)).toBe(JSON.stringify(oracle_CLOSEOUT_DETECTORS));
    for (const detector of CLOSEOUT_DETECTORS) expect(Object.keys(detector)).toEqual(["id", "scope", "command", "detector"]);
    expect(detectorRegistrySha256()).toBe("0dac946a95de2c084c76502f7274fad45d757750c8277a052adbfde6a9965317");
  });

  it("RECEIPT_FAMILIES equals the base literal, order included", () => {
    expect([...RECEIPT_FAMILIES]).toStrictEqual([...oracle_RECEIPT_FAMILIES]);
  });

  it("the command line's receipt table equals the base table: family, file and order", () => {
    expect(JSON.stringify(CLOSEOUT_BUNDLE_FILES)).toBe(JSON.stringify(oracle_CLI_RECEIPT_TABLE));
    expect(CLOSEOUT_BUNDLE_FILES).toStrictEqual(oracle_CLI_RECEIPT_TABLE);
  });

  it("the command line's audit kinds equal the base set", () => {
    expect(new Set(AUDIT_KINDS)).toEqual(oracle_CLI_AUDIT_KINDS);
    expect(AUDIT_KINDS).toHaveLength(oracle_CLI_AUDIT_KINDS.size);
    for (const kind of AUDIT_KINDS) expect(phaseByAuditKind(kind)?.auditKind).toBe(kind);
    expect(phaseByAuditKind("probe")).toBeUndefined();
  });

  it("the usage texts that name the audit kinds keep the base bytes", async () => {
    const refused = cliOutput();
    expect(await runCli(["audit", "not-a-kind"], refused.io)).toBe(2);
    expect(refused.stderr).toEqual([`ERROR: ${oracle_CLI_AUDIT_USAGE_ERROR}`, oracle_CLI_USAGE]);
    const missing = cliOutput();
    expect(await runCli(["audit"], missing.io)).toBe(2);
    expect(missing.stderr).toEqual([`ERROR: ${oracle_CLI_AUDIT_USAGE_ERROR}`, oracle_CLI_USAGE]);
    const unknownCommand = cliOutput();
    expect(await runCli(["not-a-command"], unknownCommand.io)).toBe(2);
    expect(unknownCommand.stderr).toEqual([oracle_CLI_USAGE]);
  });

  it("the legacy baseline set equals the base set plus language_policy", () => {
    expect([...LEGACY_BASELINE_FAMILIES].sort()).toEqual([...oracle_LEGACY_DETECTOR_FAMILIES, "language_policy"].sort());
    expect(oracle_LEGACY_DETECTOR_FAMILIES.has("language_policy")).toBe(false);
    // Every closeout family, and never the audit-only one.
    expect([...LEGACY_BASELINE_FAMILIES]).toEqual([...CLOSEOUT_PHASE_IDS]);
    expect(LEGACY_BASELINE_FAMILIES.has("repository_boundaries")).toBe(false);
  });
});

describe("entry dispatch", () => {
  const OPTION_SETS: readonly ReadOnlyAuditOptions[] = [
    {},
    { denylistPath: "denylist-path-sentinel", deadline_ms: 4321 },
  ];

  it.each(oracle_RECEIPT_FAMILIES.flatMap((family) => OPTION_SETS.map((options, index) => [family, index, options] as const)))(
    "%s (option set %i) calls the entry function the base called, with the same arguments",
    (family, _index, options) => {
      const root = scratch("entry");
      // The base table computes its two helper values eagerly; record what it asks them for.
      const expectedHelperCalls: OracleEntryCall[] = [];
      const expected = oracle_readOnlyEntryCalls(root, options, {
        trackedShippablePaths: (...args) => { expectedHelperCalls.push({ entry: "trackedShippablePaths", args }); return TRACKED_PATHS; },
        loadDenylistSync: (...args) => { expectedHelperCalls.push({ entry: "loadDenylistSync", args }); return DENYLIST_TERMS; },
      })[family];

      startRecording();
      const { anchored, results } = runReadOnlyFamilies(captureFor(root), root, [family], options);
      recorder.active = false;

      expect(recorder.calls).toStrictEqual([expected]);
      expect(recorder.helperCalls).toStrictEqual(family === "public_safety" ? expectedHelperCalls : []);
      expect(results).toStrictEqual({ [family]: EMPTY_RESULTS[expected.entry] });
      expect(anchored).toEqual([]);
    },
  );

  it("runs several families in the order asked, one entry function each", () => {
    const root = scratch("entry-order");
    const order: readonly ReceiptFamily[] = ["language_policy", "planning_graph", "semantic_boundary", "public_safety", "repository_boundaries", "github_actions"];
    const table = oracle_readOnlyEntryCalls(root, {}, { trackedShippablePaths: () => TRACKED_PATHS, loadDenylistSync: () => DENYLIST_TERMS });
    startRecording();
    const { results } = runReadOnlyFamilies(captureFor(root), root, order);
    recorder.active = false;
    expect(recorder.calls).toStrictEqual(order.map((family) => table[family]));
    expect(Object.keys(results)).toEqual([...order]);
  });

  it("runAudit reports, for each audit kind, the family the base reported", async () => {
    const repository = scratch("audit-kinds");
    createFixtureRepository(repository);
    writeFileSync(join(repository, "README.md"), "clean\n");
    fixtureCommit(repository);
    const observed: [string, readonly string[]][] = [];
    for (const [kind] of oracle_AUDIT_KIND_FAMILIES) {
      const store = new LocalRunReceiptStore(join(scratch(`audit-${kind}`), "receipts"));
      const output = cliOutput();
      expect(await runCli(["audit", kind, repository, "--json"], output.io, undefined, undefined, store), kind).toBe(0);
      const entries = store.index();
      expect(entries, kind).toHaveLength(1);
      expect(entries[0]).toMatchObject({ mode: "AUDIT", finding_count: 0 });
      observed.push([kind, entries[0]!.families]);
    }
    expect(observed).toEqual(oracle_AUDIT_KIND_FAMILIES.map(([kind, family]) => [kind, [family]]));
    // The table covers every audit kind of the registry, and each maps to the registry's family.
    expect(oracle_AUDIT_KIND_FAMILIES.map(([kind]) => kind).sort()).toEqual([...AUDIT_KINDS].sort());
    for (const [kind, family] of oracle_AUDIT_KIND_FAMILIES) expect(phaseByAuditKind(kind)?.id).toBe(family);
  }, 120_000);
});

describe("unknown family", () => {
  const UNKNOWN = "not_a_family" as ReceiptFamily;

  it("the entry dispatch refuses an id outside the registry and runs no entry function", () => {
    const root = scratch("unknown-entry");
    startRecording();
    expect(() => runReadOnlyFamilies(captureFor(root), root, [UNKNOWN])).toThrow(/not_a_family/u);
    recorder.active = false;
    // The base ran the semantic audit for any id it did not list.
    expect(recorder.calls).toEqual([]);
  });

  it("the entry dispatch refuses the unknown id even after known families", () => {
    const root = scratch("unknown-entry-later");
    startRecording();
    expect(() => runReadOnlyFamilies(captureFor(root), root, ["github_actions", UNKNOWN])).toThrow(/not_a_family/u);
    recorder.active = false;
    expect(recorder.calls.map((call) => call.entry)).toEqual(["auditGitHubActionsRepository"]);
  });

  it("receiptFindingsFromAudit refuses an id outside the registry, whatever the result holds", () => {
    const context = { repository: scratch("unknown-receipt"), blobOids: () => new Map<string, string>() };
    for (const result of [EMPTY_RESULTS.auditSemanticRepository, EMPTY_RESULTS.auditLanguagePolicy, {}, null]) {
      expect(() => receiptFindingsFromAudit(UNKNOWN, result, context)).toThrow(/not_a_family/u);
    }
  });

  it("a key every object inherits is not a family", () => {
    const context = { repository: scratch("inherited-key"), blobOids: () => new Map<string, string>() };
    for (const id of ["constructor", "toString", "hasOwnProperty", "__proto__", ""]) {
      expect(isPhaseId(id), id).toBe(false);
      expect(phaseById(id), id).toBeUndefined();
      expect(() => receiptFindingsFromAudit(id as ReceiptFamily, EMPTY_RESULTS.auditSemanticRepository, context), id).toThrow(new RegExp(`^${id}: not a registered detector family$`, "u"));
      expect(() => runReadOnlyFamilies(captureFor(context.repository), context.repository, [id as ReceiptFamily]), id).toThrow(new RegExp(`^${id}: not a registered detector family$`, "u"));
      // These three kept their base answer for an unknown id: an error row, no fingerprints, no rows.
      expect(detectorResultShapeErrors(id, {}), id).toEqual([`$: unknown detector ${id}`]);
      expect(findingFingerprintsFromAudit(id, EMPTY_RESULTS.auditSemanticRepository), id).toBeUndefined();
      expect(detectorRootProjections(id, EMPTY_RESULTS.auditSemanticRepository, "repo:unknown"), id).toEqual([]);
    }
  });

  it("repository_boundaries is a family without a closeout part", () => {
    expect(isPhaseId("repository_boundaries")).toBe(true);
    expect(phaseById("repository_boundaries")?.closeout).toBeNull();
    expect(detectorResultShapeErrors("repository_boundaries", EMPTY_RESULTS.auditRepositoryBoundaries)).toEqual(["$: unknown detector repository_boundaries"]);
  });
});
