/**
 * Golden test of mg-s2e-finding-reducer (charter/DONE/mg-s2e-finding-reducer.md, proof 1).
 * Written on the golden commit against the base code (main 803fd4c) and never edited
 * afterwards; the slice declares no behaviour change, so it holds on base and on head.
 *
 * It builds two fixture repositories, runs `prepareCloseout` on each with a fixed clock,
 * fixed commit dates, a fixed run id and a remote-named repository identity, and compares
 * with prepare-golden.test-fixture.ts, which was recorded by running the same capture on
 * the base code:
 *
 * - from closeout-report.json: `completion_debts`, `retirement_applications`,
 *   `debt_census`, `public_safety_debt_accounting` and the five per-family accounting
 *   blocks, each as the bytes `JSON.stringify(value, null, 2)` gives, so key order counts;
 * - the bytes of regression-delta.json.
 *
 * Two normalizations, and no other, are applied to both sides: the fixture's temporary
 * root is replaced by `<FIXTURE_ROOT>` in the captured text before it is parsed; and each
 * native-gate debt's `evidence[0].evidence_ref.sha256`, once the test has asserted that it
 * equals the sha256 of that run's native-gate-validation.json bytes, is replaced by
 * `<NATIVE_GATE_VALIDATION_SHA256>`. That file binds a random lease id and a digest of the
 * Git common-directory path, so its digest differs between two runs of the same code.
 *
 * "families" reaches every root-debt builder and both dispositions: planning, public
 * safety (a value finding, an unassessed tracked gitlink, a finding exempted outside the
 * retired root and one exempted under it), GitHub Actions (one group of two findings),
 * language policy, the unassigned semantic set, one absent native gate, and a retirement
 * record that retires the public-safety debt under `legacy/`. "semantic-confirmed" binds a
 * v1 probe manifest whose first probe executes a trivial shell script that reports a
 * failed case (a confirmed product defect) and whose second is operate-time pending.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { ActionHygieneProcessPort } from "./action-hygiene.js";
import { PREPARE_GOLDEN, type PrepareGoldenCapture } from "./prepare-golden.test-fixture.js";
import { prepareCloseout } from "./prepare.js";
import { discoverSemanticProbeCandidates, semanticCandidateSetSha256, semanticWorkingTreeSha256 } from "./semantic.js";
import { mintServerAttestationBinding } from "../runtime-binding.js";
import { createFixtureRepository, fixtureCommit, fixtureGit } from "../test-support/fixture-repo.js";

export const FIXTURE_ROOT_TOKEN = "<FIXTURE_ROOT>";

/** The closeout-report.json fields proof 1 names, in the order they are compared. */
export const GOLDEN_REPORT_FIELDS = [
  "completion_debts",
  "retirement_applications",
  "debt_census",
  "public_safety_debt_accounting",
  "planning_accounting",
  "public_safety_accounting",
  "github_actions_accounting",
  "language_policy_accounting",
  "semantic_accounting",
] as const;

const FIXED_INSTANT = "2026-11-17T00:00:00.000Z";
const COMMIT_DATE = "2026-11-17T00:00:00Z";
const DENYLIST_TERM = "internal campaign";

const SOURCE_RUNTIME = mintServerAttestationBinding({
  record_type: "mister-clean.runtime-attestation-binding",
  schema_version: "1.0",
  status: "source_development",
  package_root: "/fixture/mister-clean",
  package_root_realpath: "/fixture/mister-clean",
  entrypoint: { path: "./src/cli.ts", realpath: "/fixture/mister-clean/src/cli.ts", sha256: "a".repeat(64) },
  reason: "prepare golden test source execution",
});

const PROCESS_PORT: ActionHygieneProcessPort = {
  processTable: () => [{ pid: process.pid, ppid: 0, start_identity: "prepare-golden-process", executable: "/fixture/node" }],
  pathTable: () => new Map([[process.pid, { cwd: "/", open_paths: [] }]]),
};

const roots: string[] = [];

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function write(repo: string, path: string, content: string): void {
  mkdirSync(join(repo, path, ".."), { recursive: true });
  writeFileSync(join(repo, path), content);
}

/** A hermetic fixture repository whose commits, and so whose repository object, are the same on every host. */
function goldenRepository(base: string, slug: string): string {
  const repo = join(base, "repo");
  createFixtureRepository(repo, { branch: "main" });
  fixtureGit(repo, ["config", "commit.gpgsign", "false"]);
  fixtureGit(repo, ["config", "core.hooksPath", ".git/no-hooks"]);
  // A remote-named identity: a local-only identity digests the checkout path.
  fixtureGit(repo, ["config", "remote.origin.url", `https://fixture.invalid/golden/${slug}.git`]);
  return repo;
}

function goldenCommit(repo: string): void {
  fixtureCommit(repo, "golden fixture", {
    env: { ...process.env, GIT_AUTHOR_DATE: COMMIT_DATE, GIT_COMMITTER_DATE: COMMIT_DATE },
  });
}

const WORKFLOW = `name: CD
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
  workflow_dispatch: {}
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: vendor/setup@master
      - run: flyctl deploy --app production
      - name: Verify health
        run: flyctl checks list --app production --json
      - name: Verify health again
        run: flyctl checks list --app production --json
`;

function buildFamilies(base: string): { readonly repo: string; readonly denylist: string } {
  const repo = goldenRepository(base, "families");
  const denylist = join(base, "denylist.txt");
  writeFileSync(denylist, `${DENYLIST_TERM}\n`);
  write(repo, "README.md", "Golden fixture for the completion-debt reducer.\n");
  // planning_graph: a done task whose body disagrees with its front matter.
  write(repo, "planning/done/TASK.md", "---\nartifact_type: task\ntask_id: TASK\nstatus: done\ntop_level: true\n---\nStatus: active\n");
  // semantic_boundary: two critical-contract candidates and no manifest, so one unassigned set.
  write(repo, "planning/SECURITY.md", [
    "---",
    "artifact_type: product_contract",
    "status: active",
    "---",
    "The credential validator is a security choke point and must be safe by construction.",
    "The production composition root must wire the credential validator.",
    "",
  ].join("\n"));
  // public_safety: one payable value finding, one exempted, and two under the retired root.
  write(repo, "source.txt", `${DENYLIST_TERM} marker\n`);
  write(repo, "fixtures/sample.txt", `${DENYLIST_TERM} sample\n`);
  write(repo, "legacy/notes.md", `${DENYLIST_TERM} notes\n`);
  write(repo, "legacy/fixture.md", `${DENYLIST_TERM} fixture\n`);
  write(repo, "charter/public-safety-exemptions/2026-11-17-fixtures.json", `${JSON.stringify({
    record_type: "mister-clean.public-safety-exemption",
    schema_version: "1.0",
    entries: [
      { file: "fixtures/sample.txt", rule: "custom-denylist-1", value_sha256: sha256Hex(DENYLIST_TERM), rationale: "synthetic sample string" },
      { file: "legacy/fixture.md", rule: "custom-denylist-1", value_sha256: sha256Hex(DENYLIST_TERM), rationale: "synthetic legacy fixture string" },
    ],
  }, null, 2)}\n`);
  // Retirement: the legacy corpus, under a committed ruling.
  const rulingPath = "charter/owner-decisions/2026-11-17-retire-legacy.md";
  const ruling = "Owner ruling: the legacy corpus is frozen.\n";
  write(repo, rulingPath, ruling);
  write(repo, "charter/retirements/2026-11-17-legacy.json", `${JSON.stringify({
    record_type: "mister-clean.retirement",
    schema_version: "1.0",
    slug: "legacy-corpus",
    roots: ["legacy"],
    ruling: {
      author: "operator",
      at: "2026-11-17T00:00:00Z",
      scope: "Retire the frozen legacy corpus",
      evidence: { path: rulingPath, sha256: sha256Hex(ruling) },
    },
  }, null, 2)}\n`);
  // github_actions: an unbound deploy workflow.
  write(repo, ".github/workflows/cd.yml", WORKFLOW);
  // language_policy: one tracked file in a forbidden language.
  write(repo, ".mister-clean/language-policy.json", `${JSON.stringify({ schema: "mister-clean.language-policy/1", forbid_extensions: [".rb"] })}\n`);
  write(repo, "tools/legacy.rb", "puts 1\n");
  // Native gate: a package manifest with no lockfile, so its gate is absent and never runs.
  write(repo, "package.json", `${JSON.stringify({ name: "golden-families", private: true, scripts: { test: "true" } }, null, 2)}\n`);
  // public_safety unassessed: a tracked gitlink whose directory is present and empty.
  mkdirSync(join(repo, "vendor", "module"), { recursive: true });
  fixtureGit(repo, ["update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},vendor/module`]);
  goldenCommit(repo);
  return { repo, denylist };
}

const PROBE_SCRIPT = [
  "printf '{\"record_type\":\"mister-clean.semantic-probe-receipt\",\"schema_version\":\"1.0\",\"candidate_id\":\"%s\",\"subject_commit\":\"%s\",\"subject_tree_sha256\":\"%s\",\"candidate_set_sha256\":\"%s\",\"exercised_cases\":[\"wired\"],\"passed_cases\":[],\"failed_cases\":[\"wired\"],\"result\":\"fail\"}\\n'",
  "\"$MISTER_CLEAN_CANDIDATE_ID\" \"$MISTER_CLEAN_SUBJECT_COMMIT\" \"$MISTER_CLEAN_SUBJECT_TREE_SHA256\" \"$MISTER_CLEAN_CANDIDATE_SET_SHA256\";",
  "exit 1",
].join(" ");

function buildSemanticConfirmed(base: string): { readonly repo: string; readonly manifest: string } {
  const repo = goldenRepository(base, "semantic-confirmed");
  write(repo, "planning/SECURITY.md", [
    "---",
    "artifact_type: product_contract",
    "status: active",
    "---",
    "The credential validator is a security choke point and must be safe by construction.",
    "The production composition root must wire the credential validator.",
    "",
  ].join("\n"));
  goldenCommit(repo);
  const candidates = discoverSemanticProbeCandidates(repo);
  if (candidates.length !== 2) throw new Error(`semantic-confirmed fixture expected two candidates, found ${candidates.length}`);
  const [executed, pending] = candidates as [typeof candidates[number], typeof candidates[number]];
  const manifest = join(base, "semantic-probes.json");
  writeFileSync(manifest, `${JSON.stringify({
    record_type: "mister-clean.semantic-probes",
    schema_version: "1.1",
    subject_commit: fixtureGit(repo, ["rev-parse", "HEAD"]),
    subject_tree_sha256: semanticWorkingTreeSha256(repo),
    candidate_set_sha256: semanticCandidateSetSha256(candidates),
    observed_at: "2026-11-17T00:00:00Z",
    probes: [
      {
        candidate_id: executed.id,
        kind: executed.kind,
        contract_refs: executed.refs,
        required_cases: ["wired"],
        exercised_cases: ["wired"],
        disposition: "execute",
        command: ["/bin/sh", "-c", PROBE_SCRIPT],
        timeout_ms: 10_000,
        expected_status: 0,
        boundary: "credential validator",
        observed_endpoint: "composition root",
      },
      {
        candidate_id: pending.id,
        kind: pending.kind,
        contract_refs: pending.refs,
        required_cases: ["operated"],
        exercised_cases: ["operated"],
        disposition: "operate_time_pending",
        boundary: "credential validator",
        observed_endpoint: "production deployment",
        owner: "operator",
        required_next_action: "observe the deployed validator",
        evidence_required: "a production trace",
      },
    ],
  }, null, 2)}\n`);
  return { repo, manifest };
}

type Debt = Record<string, unknown>;

const NATIVE_GATE_VALIDATION_FILE = "native-gate-validation.json";
export const NATIVE_GATE_VALIDATION_TOKEN = "<NATIVE_GATE_VALIDATION_SHA256>";

function isNativeGateDebt(debt: Debt): boolean {
  return String(debt.normalizer).startsWith("mister-clean/native-gate-root@");
}

/** The captured text with the fixture's temporary root replaced by a fixed token. */
function normalized(text: string, base: string): string {
  const real = realpathSync(base);
  return text.split(real).join(FIXTURE_ROOT_TOKEN).split(base).join(FIXTURE_ROOT_TOKEN);
}

export const GOLDEN_FIXTURE_NAMES = ["families", "semantic-confirmed"] as const;
export type GoldenFixtureName = (typeof GOLDEN_FIXTURE_NAMES)[number];

/** Build one fixture, run prepare on it, and return the normalized capture. */
export async function capturePrepareGolden(name: GoldenFixtureName): Promise<PrepareGoldenCapture> {
  const base = mkdtempSync(join(tmpdir(), "mister-clean-prepare-golden-"));
  roots.push(base);
  const common = {
    evidenceHome: join(base, "evidence"),
    runId: `golden-${name}`,
    requestRef: "golden-request",
    now: () => new Date(FIXED_INSTANT),
    processPort: PROCESS_PORT,
    runtimeAttestation: SOURCE_RUNTIME,
  };
  let prepared;
  if (name === "families") {
    const { repo, denylist } = buildFamilies(base);
    prepared = await prepareCloseout({ ...common, repo, publicSafetyDenylistPath: denylist });
  } else {
    const { repo, manifest } = buildSemanticConfirmed(base);
    prepared = await prepareCloseout({ ...common, repo, semanticManifestPath: manifest, executeSemanticProbes: true });
  }
  const reportText = normalized(readFileSync(join(prepared.bundleDirectory, "closeout-report.json"), "utf8"), base);
  const regressionText = normalized(readFileSync(join(prepared.bundleDirectory, "regression-delta.json"), "utf8"), base);
  const report = JSON.parse(reportText) as Record<string, unknown>;
  // The second normalization: native-gate-validation.json binds a random lease id and a
  // digest of the Git common-directory path, so its digest differs between runs. Each
  // native-gate debt must cite exactly this run's file before its digest becomes a token.
  const validationSha256 = sha256Hex(readFileSync(join(prepared.bundleDirectory, NATIVE_GATE_VALIDATION_FILE)));
  for (const debt of report.completion_debts as Debt[]) {
    if (!isNativeGateDebt(debt)) continue;
    const ref = (debt.evidence as Debt[])[0]!.evidence_ref as Record<string, unknown>;
    expect(ref.path, `${String(debt.id)} evidence_ref.path`).toBe(NATIVE_GATE_VALIDATION_FILE);
    expect(ref.sha256, `${String(debt.id)} evidence_ref.sha256`).toBe(validationSha256);
    ref.sha256 = NATIVE_GATE_VALIDATION_TOKEN;
  }
  const captured: Record<string, unknown> = {};
  for (const field of GOLDEN_REPORT_FIELDS) captured[field] = report[field];
  return { report: captured, regression_delta_lines: regressionText.split("\n") };
}

function family(debt: Debt): string {
  const key = debt.cause_key as Record<string, unknown> | undefined;
  if (typeof key?.detector_family === "string") return key.detector_family;
  if (isNativeGateDebt(debt)) return "native_gate";
  return String(debt.class);
}

/** The counts proof 1 requires to be non-zero, over both fixtures together. */
function requiredCounts(captures: readonly PrepareGoldenCapture[]): Record<string, number> {
  const debts = captures.flatMap((capture) => capture.report.completion_debts as Debt[]);
  const of = (name: string) => debts.filter((debt) => family(debt) === name);
  const semantic = of("semantic_boundary");
  return {
    planning_graph: of("planning_graph").length,
    public_safety_value: of("public_safety").filter((debt) => !String(debt.class).startsWith("public_safety_unassessed_")).length,
    public_safety_unassessed: of("public_safety").filter((debt) => String(debt.class).startsWith("public_safety_unassessed_")).length,
    github_actions_group_of_two: of("github_actions").filter((debt) => debt.observation_count === 2).length,
    language_policy: of("language_policy").length,
    semantic_confirmed: semantic.filter((debt) => !String(debt.id).startsWith("DEBT-SEMANTIC-SET-") && debt.disposition === "autonomously_repair").length,
    semantic_unassigned_set: semantic.filter((debt) => String(debt.id).startsWith("DEBT-SEMANTIC-SET-")).length,
    native_gate: of("native_gate").length,
    public_safety_exempted: captures.reduce((sum, capture) => sum + Number((capture.report.public_safety_debt_accounting as Record<string, unknown>).exempted_finding_count), 0),
    retired_debts: captures.flatMap((capture) => capture.report.retirement_applications as Debt[])
      .reduce((sum, application) => sum + (application.debt_ids as unknown[]).length, 0),
  };
}

function familyCounts(capture: PrepareGoldenCapture): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const debt of capture.report.completion_debts as Debt[]) counts[family(debt)] = (counts[family(debt)] ?? 0) + 1;
  return counts;
}

describe("prepare golden output", { timeout: 120_000 }, () => {
  const captures = new Map<GoldenFixtureName, PrepareGoldenCapture>();

  for (const name of GOLDEN_FIXTURE_NAMES) {
    it(`${name}: closeout-report fields and regression-delta.json bytes equal the recording`, async () => {
      const actual = await capturePrepareGolden(name);
      captures.set(name, actual);
      const golden = PREPARE_GOLDEN[name];
      expect(golden, `no recording for ${name}`).toBeDefined();
      for (const field of GOLDEN_REPORT_FIELDS) {
        expect(JSON.stringify(actual.report[field], null, 2), field).toBe(JSON.stringify(golden!.report[field], null, 2));
      }
      expect(actual.regression_delta_lines.join("\n"), "regression-delta.json").toBe(golden!.regression_delta_lines.join("\n"));
      writeSync(1, `prepare golden ${name}: debts per family ${JSON.stringify(familyCounts(actual))}\n`);
    });
  }

  it("reaches every builder and both dispositions, and holds no absolute temporary path", () => {
    expect([...captures.keys()].sort()).toEqual([...GOLDEN_FIXTURE_NAMES].sort());
    const counts = requiredCounts([...captures.values()]);
    writeSync(1, `prepare golden required counts ${JSON.stringify(counts)}\n`);
    expect(Object.entries(counts).filter(([, count]) => count === 0).map(([name]) => name)).toEqual([]);
    const recorded = JSON.stringify(PREPARE_GOLDEN);
    for (const prefix of new Set([tmpdir(), realpathSync(tmpdir()), homedir()])) expect(recorded.includes(prefix)).toBe(false);
  });
});
