import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type CliIO, runCli } from "./cli.js";
import { compositeDigest, type EvalCase, type EvalCaseValidationResult, REGISTRY_PIN_PATH, sourceEnvironmentName } from "./eval-case.js";
import { createFixtureRepository, fixtureCommit } from "./test-support/fixture-repo.js";

const roots: string[] = [];
const PIN = "2031.01.01-1";
const ZERO64 = "0".repeat(64);
const ZERO40 = "0".repeat(40);

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function capture(): { io: CliIO; stderr: string[]; stdout: string[] } {
  const stderr: string[] = [];
  const stdout: string[] = [];
  return { io: { stderr: (line) => stderr.push(line), stdout: (line) => stdout.push(line) }, stderr, stdout };
}

function sha256(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

function scratch(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function writeTree(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, ...path.split("/").slice(0, -1)), { recursive: true });
    writeFileSync(join(root, ...path.split("/")), content);
  }
}

const CASE_PATH = "field-evals/window/cases/CS-900-fixture.md";
const TALLIES_PATH = "field-evals/controls/data/tallies.tsv";
const CARD_RC_PATH = "field-evals/controls/cards/RC-900.md";
const CARD_FLASH_PATH = "field-evals/window/cards/AC-901-fixture-flash.md";
const CARD_PRO_PATH = "field-evals/window/cards/AC-902-fixture-pro.md";
const GATE_PATH = "tools/gate.sh";

/** The same derivation as RC-001: two reviewers, one pair set, floor 2 of 3; flash breaches once (S-02 P00). */
const TALLIES = [
  "session\tpair_set\treviewer_model\tpopulation\tgood_passed\tgood_n\tbad_passed\tbad_n\tsource",
  "S-01\tB\tfixture-flash\tP00\t3\t3\t0\t3\ttallies",
  "S-01\tB\tfixture-flash\tP01\t2\t3\t0\t3\ttallies",
  "S-02\tB\tfixture-flash\tP00\t1\t3\t0\t3\tfailure_line",
  "S-02\tB\tfixture-flash\tP01\t3\t3\t0\t3\tfailure_line",
  "S-03\tB\tfixture-pro\tP00\t3\t3\t0\t3\ttallies",
  "S-03\tB\tfixture-pro\tP01\t3\t3\t0\t3\ttallies",
  "",
].join("\n");

const FILES: Record<string, string> = {
  [CASE_PATH]: "# CS-900\nphenomenon narrative\n",
  [TALLIES_PATH]: TALLIES,
  [CARD_RC_PATH]: "---\ncard_id: RC-900\n---\n",
  [CARD_FLASH_PATH]: `---\ncard_id: AC-901\nharness: fixture\nmodel_registry_ref: fixture-flash@${PIN}   # card only\n---\n\n# AC-901\n`,
  [CARD_PRO_PATH]: `---\ncard_id: AC-902\nharness: fixture\nmodel_registry_ref: fixture-pro@${PIN}   # card only\n---\n\n# AC-902\n`,
  [GATE_PATH]: "#!/bin/sh\nexit 0\n",
  [REGISTRY_PIN_PATH]: `${JSON.stringify({ schema: "customer-test/1", artifact: { name: "model-atlas.export/1", version: PIN } })}\n`,
};

/** A hermetic temp repository holding every file a valid record cites, committed once so a base commit can bind. */
function fixtureRepository(): { root: string; head: string; record: EvalCase } {
  const root = scratch("mister-clean-eval-case-");
  createFixtureRepository(root);
  writeTree(root, FILES);
  const head = fixtureCommit(root);
  const record: EvalCase = {
    record_type: "mister-clean.eval-case",
    schema_version: "1",
    case_id: "CS-900",
    field_case: { path: CASE_PATH, sha256: sha256(FILES[CASE_PATH] as string) },
    phenomenon: "A reviewer refuses a known-good control.",
    agent_cards: [
      { card_id: "AC-901", path: CARD_FLASH_PATH, sha256: sha256(FILES[CARD_FLASH_PATH] as string), model_registry_ref: `fixture-flash@${PIN}`, role: "subject" },
      { card_id: "AC-902", path: CARD_PRO_PATH, sha256: sha256(FILES[CARD_PRO_PATH] as string), model_registry_ref: `fixture-pro@${PIN}`, role: "control" },
    ],
    verifier: { name: "control-pair gate", kind: "shell gate script plus mutant check", path: GATE_PATH, sha256: sha256(FILES[GATE_PATH] as string) },
    base_commit: { repository: "fixture-project", sha: head },
    replay: {
      floor: "2/3",
      sessions: 3,
      rows_source: { path: TALLIES_PATH, sha256: sha256(TALLIES) },
      outcome: "met",
      per_reviewer: [
        { card_id: "AC-901", reviewer_model: "fixture-flash", pair_set: "B", sessions: 2, good_replays: 12, false_rejects: 3, populations_at_floor: 1, floor_breaches: 1, bad_passes: 0 },
        { card_id: "AC-902", reviewer_model: "fixture-pro", pair_set: "B", sessions: 1, good_replays: 6, false_rejects: 0, populations_at_floor: 0, floor_breaches: 0, bad_passes: 0 },
      ],
    },
    derived_from: { path: CARD_RC_PATH, sha256: sha256(FILES[CARD_RC_PATH] as string) },
    created_at: "2026-11-03T07:00:00Z",
  };
  return { root, head, record };
}

const ALL_BOUND = [
  "$.field_case",
  "$.agent_cards[0]",
  "$.agent_cards[0].model_registry_ref",
  "$.agent_cards[1]",
  "$.agent_cards[1].model_registry_ref",
  "$.verifier",
  "$.base_commit",
  "$.replay.rows_source",
  "$.derived_from",
];
const BOUND_WITHOUT_PINNED = ALL_BOUND.filter((pointer) => pointer !== "$.verifier" && pointer !== "$.base_commit");

async function validate(root: string, record: unknown, extra: readonly string[] = []): Promise<{ code: number; result: EvalCaseValidationResult; stderr: string[] }> {
  const path = join(root, "CS-900.eval.json");
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  const output = capture();
  const code = await runCli(["eval-case", "validate", path, "--repo", root, ...extra, "--json"], output.io);
  return { code, result: JSON.parse(output.stdout.join("\n")) as EvalCaseValidationResult, stderr: output.stderr };
}

function codes(result: EvalCaseValidationResult): string[] {
  return result.refusals.map((refusal) => refusal.code);
}

const EXTERNAL_VERIFIER = {
  name: "evaluator pin", kind: "validator source plus review source", binding: "external" as const, repository: "fixture-seam",
  location: "evidence owner note, lines 10-12", sha256: "c".repeat(64),
  components: [{ name: "validator_source", sha256: "c".repeat(64) }, { name: "mutant_check", sha256: "d".repeat(64) }],
};
const EXTERNAL_BASE = {
  repository: "fixture-seam", binding: "external" as const, location: "evidence owner note, line 14", session_map: "inferred" as const,
  commits: [{ pair_set: "B", sessions: "S-01 to S-03", sha: "e".repeat(40) }],
};

// ---------------------------------------------------------------------------
// Rework 2 fixtures: a source clone, an evidence manifest in a private root, a pinned record.
// ---------------------------------------------------------------------------

const SEAM = "fixture-seam";
const MANIFEST_FILE = "FIXTURE-EVIDENCE-MANIFEST.json";
/** Deliberately not the real source project's header: the validator must read it from the manifest. */
const FIXTURE_HEADER_TEXT = "fixture.tree/1";
const SOURCE_PREFIX = "app/src/";
const RECEIPT_PATH = "tools/receipt/main.rs";

interface EvidenceFixture {
  readonly clone: string;
  readonly commit: string;
  readonly evidenceRoot: string;
  readonly manifestSha256: string;
  readonly composite: string;
  readonly review: string;
  readonly receipt: string;
}

function sourceFiles(reviewText: string): Record<string, string> {
  return {
    "app/src/runner.rs": "fn validator() {}\n",
    "app/src/runner/review.rs": reviewText,
    "app/src/runner/data/p00.json": "{\"control\":\"good\"}\n",
    [RECEIPT_PATH]: "fn main() { countercases(); }\n",
  };
}

/** Build a clone, compute the pins with the manifest's algorithm, publish a manifest for them under an evidence root. */
function evidenceFixture(options: { reviewText?: string; header?: Record<string, unknown>; pinsFrom?: { composite: string; review: string } } = {}): EvidenceFixture {
  const clone = scratch("mister-clean-source-clone-");
  createFixtureRepository(clone);
  const files = sourceFiles(options.reviewText ?? "fn review() {}\n");
  writeTree(clone, files);
  const commit = fixtureCommit(clone);
  const headerBytes = Buffer.concat([Buffer.from(FIXTURE_HEADER_TEXT, "utf8"), Buffer.from([0])]);
  const runnerFiles = Object.keys(files).filter((path) => path.startsWith(`${SOURCE_PREFIX}runner`)).sort();
  // pinsFrom publishes another clone's pins over this clone's bytes: what a stale or forged manifest looks like.
  const composite = options.pinsFrom?.composite ?? compositeDigest(headerBytes, runnerFiles.map((path) => ({ relativePath: path.slice(SOURCE_PREFIX.length), content: Buffer.from(files[path] as string, "utf8") })));
  const review = options.pinsFrom?.review ?? sha256(files["app/src/runner/review.rs"] as string);
  const receipt = sha256(files[RECEIPT_PATH] as string);
  const manifest = {
    schema: "fixture.evidence-manifest/1",
    pair_sets: { B: { base_commit: commit, sessions: "S-01..S-03" } },
    evaluator_pins: {
      [commit]: {
        validator_source: {
          hashed_paths_relative_to: SOURCE_PREFIX,
          ordered_files: runnerFiles.map((path) => ({ path, sha256: sha256(files[path] as string) })),
          composite_sha256: composite,
        },
        review_source: { files: [{ path: "app/src/runner/review.rs", sha256: review }], composite_sha256: review },
      },
    },
    receipt_tool: { path: RECEIPT_PATH, commit: commit.slice(0, 8), sha256: receipt },
    session_map: [{ session: "S-01", basis: "inferred" }, { session: "S-02", basis: "inferred" }, { session: "S-03", basis: "inferred" }],
    algorithm: {
      header: options.header ?? { encoding: "utf8_with_trailing_nul", text: FIXTURE_HEADER_TEXT, bytes_hex: headerBytes.toString("hex"), length: headerBytes.length, source: "fixture" },
    },
    manifest_revision: 2,
  };
  const evidenceRoot = scratch("mister-clean-evidence-root-");
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  mkdirSync(join(evidenceRoot, "rc-900"), { recursive: true });
  writeFileSync(join(evidenceRoot, "rc-900", MANIFEST_FILE), bytes);
  return { clone, commit, evidenceRoot, manifestSha256: sha256(bytes), composite, review, receipt };
}

function pinnedRecord(record: EvalCase, evidence: EvidenceFixture): EvalCase {
  const manifest = { seam: SEAM, source_commit: "abcdef0123", file: MANIFEST_FILE, sha256: evidence.manifestSha256 };
  return {
    ...record,
    verifier: {
      name: "evaluator pin", kind: "validator source plus review source; receipt-tool countercases as the mutant check", binding: "pinned_external",
      repository: SEAM, location: "evidence owner manifest (fixture)", manifest, sha256: evidence.composite,
      components: [{ name: "review_source", sha256: evidence.review }, { name: "mutant_check", sha256: evidence.receipt }],
    },
    base_commit: {
      repository: SEAM, binding: "pinned_external", location: "evidence owner manifest (fixture)", manifest, session_map: "inferred",
      commits: [{ pair_set: "B", sessions: "S-01 to S-03", sha: evidence.commit }],
    },
  };
}

describe("eval-case validate", () => {
  it("proof 1: a fixture record whose every citation binds is valid; a flipped sha256 is refused by name", async () => {
    const { root, record } = fixtureRepository();
    const valid = await validate(root, record);
    expect(valid.result.refusals).toEqual([]);
    expect(valid.code).toBe(0);
    expect(valid.result.status).toBe("eval_case_valid");
    expect(valid.result.case_id).toBe("CS-900");
    expect(valid.result.registry_export_version).toBe(PIN);
    expect(valid.result.bound).toEqual(ALL_BOUND);
    expect(valid.result.external).toEqual([]);
    expect(valid.result.unverified).toEqual([]);
    expect(valid.result.classes).toEqual({ "$.verifier": "local", "$.base_commit": "local" });
    expect(valid.result.replay_recomputed).toEqual([
      { reviewer_model: "fixture-flash", pair_set: "B", sessions: 2, good_replays: 12, false_rejects: 3, populations_at_floor: 1, floor_breaches: 1, bad_passes: 0 },
      { reviewer_model: "fixture-pro", pair_set: "B", sessions: 1, good_replays: 6, false_rejects: 0, populations_at_floor: 0, floor_breaches: 0, bad_passes: 0 },
    ]);

    const flipped = await validate(root, { ...record, derived_from: { ...record.derived_from, sha256: ZERO64 } });
    expect(flipped.code).toBe(2);
    expect(flipped.result.status).toBe("eval_case_refused");
    expect(flipped.result.refusals).toEqual([
      expect.objectContaining({ code: "sha256_mismatch", citation: "$.derived_from" }),
    ]);
    expect(flipped.result.bound).not.toContain("$.derived_from");

    const text = capture();
    expect(await runCli(["eval-case", "validate", join(root, "CS-900.eval.json"), "--repo", root], text.io)).toBe(2);
    expect(text.stderr).toEqual([expect.stringMatching(/^ERROR: sha256_mismatch \$\.derived_from: /u)]);
    expect(text.stdout).toEqual([`eval-case: REFUSED case=CS-900 bound=8 pinned_external=none recomputed=none external=none unverified=none refusals=1 require_bound=none evidence_root=none sources=none registry_export=${PIN}`]);
  });

  it("proof 2: exactly two agent cards; one or three cards is refused as agent_cards_count", async () => {
    const { root, record } = fixtureRepository();
    const one = await validate(root, { ...record, agent_cards: [record.agent_cards[0]] });
    expect(one.code).toBe(2);
    expect(codes(one.result)).toContain("agent_cards_count");

    const third = { ...record.agent_cards[1], card_id: "AC-903" as const };
    const three = await validate(root, { ...record, agent_cards: [...record.agent_cards, third] });
    expect(three.code).toBe(2);
    expect(three.result.refusals).toContainEqual(
      expect.objectContaining({ code: "agent_cards_count", citation: "$.agent_cards", detail: "expected exactly 2 agent cards; got 3" }),
    );
  });

  it("proof 3: a verifier with binding unbound is refused as verifier_unbound even when every other citation binds", async () => {
    const { root, record } = fixtureRepository();
    const unbound = await validate(root, {
      ...record,
      verifier: { name: "control-pair gate", kind: "shell gate script plus mutant check", binding: "unbound", reason: "gate bytes are not in this repository" },
    });
    expect(unbound.code).toBe(2);
    expect(unbound.result.status).toBe("eval_case_refused");
    expect(unbound.result.refusals).toEqual([
      { code: "verifier_unbound", citation: "$.verifier", detail: "gate bytes are not in this repository" },
    ]);
    expect(unbound.result.bound).toEqual(ALL_BOUND.filter((pointer) => pointer !== "$.verifier"));
  });

  it("proof 4: a registry ref whose export version differs from the pinned one is refused as registry_export_mismatch", async () => {
    const { root, record } = fixtureRepository();
    const stale = await validate(root, {
      ...record,
      agent_cards: [record.agent_cards[0], { ...record.agent_cards[1], model_registry_ref: "fixture-pro@2030.12.31-9" }],
    });
    expect(stale.code).toBe(2);
    expect(stale.result.refusals).toContainEqual(
      { code: "registry_export_mismatch", citation: "$.agent_cards[1].model_registry_ref", detail: `fixture-pro@2030.12.31-9: expected export ${PIN}` },
    );
    expect(stale.result.bound).toContain("$.agent_cards[0].model_registry_ref");
    expect(stale.result.bound).not.toContain("$.agent_cards[1].model_registry_ref");
  });

  it("external forms: an evaluator pin and per-pair-set base commits are reported as external; a pair set without a commit is refused", async () => {
    const { root, record } = fixtureRepository();
    const externalRecord: EvalCase = { ...record, verifier: EXTERNAL_VERIFIER, base_commit: EXTERNAL_BASE };
    const accepted = await validate(root, externalRecord);
    expect(accepted.result.refusals).toEqual([]);
    expect(accepted.code).toBe(0);
    expect(accepted.result.external).toEqual(["$.verifier", "$.base_commit"]);
    expect(accepted.result.bound).toEqual(BOUND_WITHOUT_PINNED);

    const missingPairSet = await validate(root, {
      ...externalRecord,
      base_commit: { ...EXTERNAL_BASE, commits: [{ pair_set: "A", sessions: "S-01 to S-03", sha: "e".repeat(40) }] },
    });
    expect(missingPairSet.code).toBe(2);
    expect(missingPairSet.result.refusals).toEqual([
      { code: "record_shape", citation: "$.base_commit.commits", detail: "no base commit for pair set B" },
    ]);
  });

  // Rework 1. Fixtures are the MC/QA probes against 01b20677, with generic content.

  it("rework 1 (false-bound): a bare verifier digest and a commit absent from the repository are unverified, named, never bound", async () => {
    const { root, record } = fixtureRepository();
    const bare = await validate(root, {
      ...record,
      verifier: { name: "fiction", kind: "fiction", sha256: ZERO64 },
      base_commit: { repository: "fiction", sha: ZERO40 },
    });
    expect(bare.result.refusals).toEqual([]);
    expect(bare.code).toBe(0);
    expect(bare.result.unverified).toEqual(["$.verifier", "$.base_commit"]);
    expect(bare.result.bound).not.toContain("$.verifier");
    expect(bare.result.bound).not.toContain("$.base_commit");

    const text = capture();
    expect(await runCli(["eval-case", "validate", join(root, "CS-900.eval.json"), "--repo", root], text.io)).toBe(0);
    expect(text.stdout).toEqual([`eval-case: VALID case=CS-900 bound=7 pinned_external=none recomputed=none external=none unverified=$.verifier,$.base_commit refusals=0 require_bound=none evidence_root=none sources=none registry_export=${PIN}`]);
  });

  it("rework 2 (fabricated refs): a card must resolve to its cited file whose frontmatter card_id and model_registry_ref match", async () => {
    const { root, record } = fixtureRepository();
    const invented = await validate(root, {
      ...record,
      agent_cards: [{ ...record.agent_cards[0], model_registry_ref: `does-not-exist@${PIN}` }, record.agent_cards[1]],
    });
    expect(invented.code).toBe(2);
    expect(invented.result.refusals).toEqual([
      { code: "card_ref_mismatch", citation: "$.agent_cards[0]", detail: `${CARD_FLASH_PATH}: model_registry_ref fixture-flash@${PIN} != does-not-exist@${PIN}` },
    ]);
    expect(invented.result.bound).not.toContain("$.agent_cards[0]");

    const wrongFile = await validate(root, {
      ...record,
      agent_cards: [{ ...record.agent_cards[0], path: CARD_PRO_PATH, sha256: sha256(FILES[CARD_PRO_PATH] as string) }, record.agent_cards[1]],
    });
    expect(wrongFile.code).toBe(2);
    expect(wrongFile.result.refusals).toEqual([
      expect.objectContaining({ code: "card_ref_mismatch", citation: "$.agent_cards[0]", detail: expect.stringContaining("card_id AC-902 != AC-901") }),
    ]);
  });

  it("rework 3 (zero-replays): counts, sessions and the floor are recomputed from the tallies; a claim they do not support is refused", async () => {
    const { root, record } = fixtureRepository();
    const zero = await validate(root, {
      ...record,
      replay: {
        ...record.replay,
        floor: "5/5",
        sessions: 1,
        per_reviewer: record.replay.per_reviewer.map((row) => ({ ...row, sessions: 1, good_replays: 0, false_rejects: 0, populations_at_floor: 0, floor_breaches: 1 })),
      },
    });
    expect(zero.code).toBe(2);
    expect(codes(zero.result)).toContain("replay_floor_mismatch");
    expect(zero.result.refusals).toContainEqual({ code: "replay_counts_mismatch", citation: "$.replay.sessions", detail: "declared 1, recomputed 3" });
    expect(zero.result.refusals).toContainEqual({ code: "replay_counts_mismatch", citation: "$.replay.per_reviewer[0].good_replays", detail: "declared 0, recomputed 12" });
    expect(zero.result.replay_recomputed).not.toBeNull();

    // Counts right, verdict wrong: the control (no breach) declared as subject, outcome met.
    const notMet = await validate(root, {
      ...record,
      agent_cards: [{ ...record.agent_cards[0], role: "control" }, { ...record.agent_cards[1], role: "subject" }],
    });
    expect(notMet.code).toBe(2);
    expect(notMet.result.refusals).toEqual([
      { code: "replay_floor_not_met", citation: "$.replay.outcome", detail: "met declared, but the subject's recomputed floor breaches are 0 under floor 2/3" },
    ]);

    const unparsable = await validate(root, {
      ...record,
      replay: { ...record.replay, rows_source: { path: CASE_PATH, sha256: sha256(FILES[CASE_PATH] as string) } },
    });
    expect(unparsable.code).toBe(2);
    expect(unparsable.result.refusals).toEqual([
      expect.objectContaining({ code: "rows_source_unparsable", citation: "$.replay.rows_source" }),
    ]);
    expect(unparsable.result.replay_recomputed).toBeNull();
  });

  it("rework 4 (forged-verifier-commit): --require-bound refuses an external or unverified verifier and base commit by name", async () => {
    const { root, record } = fixtureRepository();
    const forged: EvalCase = {
      ...record,
      verifier: { ...EXTERNAL_VERIFIER, location: "invented", sha256: ZERO64, components: [{ name: "fictional", sha256: "1".repeat(64) }] },
      base_commit: { ...EXTERNAL_BASE, location: "invented", commits: [{ pair_set: "B", sessions: "S-01 to S-03", sha: ZERO40 }] },
    };
    const permissive = await validate(root, forged);
    expect(permissive.code).toBe(0);
    expect(permissive.result.external).toEqual(["$.verifier", "$.base_commit"]);

    const strict = await validate(root, forged, ["--require-bound", "verifier,base_commit"]);
    expect(strict.code).toBe(2);
    expect(strict.result.require_bound).toEqual(["verifier", "base_commit"]);
    expect(strict.result.refusals).toEqual([
      expect.objectContaining({ code: "binding_required", citation: "$.verifier", detail: expect.stringMatching(/^external citation; --require-bound verifier demands/u) }),
      expect.objectContaining({ code: "binding_required", citation: "$.base_commit", detail: expect.stringMatching(/^external citation; --require-bound base_commit demands/u) }),
    ]);

    const bareStrict = await validate(root, { ...record, verifier: { name: "fiction", kind: "fiction", sha256: ZERO64 } }, ["--require-bound", "verifier"]);
    expect(bareStrict.code).toBe(2);
    expect(bareStrict.result.refusals).toEqual([
      expect.objectContaining({ code: "binding_required", citation: "$.verifier", detail: expect.stringMatching(/^unverified citation; --require-bound verifier demands/u) }),
    ]);

    const boundStrict = await validate(root, record, ["--require-bound", "verifier,base_commit"]);
    expect(boundStrict.code).toBe(0);

    const text = capture();
    expect(await runCli(["eval-case", "validate", join(root, "CS-900.eval.json"), "--repo", root, "--require-bound", "verifier,commit"], text.io)).toBe(2);
    expect(text.stderr[0]).toMatch(/--require-bound accepts a comma-separated subset of verifier,base_commit/u);
  });

  it("rework 5 (all-external): the case file, the tallies and the derived card accept only a local path and sha256", async () => {
    const { root, record } = fixtureRepository();
    const externalFile = { binding: "external", repository: "fiction", location: "nowhere", sha256: ZERO64 };
    const allExternal = await validate(root, {
      ...record,
      field_case: externalFile,
      derived_from: externalFile,
      replay: { ...record.replay, rows_source: externalFile },
    });
    expect(allExternal.code).toBe(2);
    expect(allExternal.result.refusals.map((refusal) => [refusal.code, refusal.citation])).toEqual([
      ["record_shape", "$.field_case"],
      ["record_shape", "$.replay.rows_source"],
      ["record_shape", "$.derived_from"],
    ]);
    expect(allExternal.result.bound).toEqual([]);
  });

  // Rework 2: the evidence root (pinned_external) and the source-clone recompute route (recomputed).

  it("rework 2 proof 1 (manifest-pinned): a pinned citation binds only when the manifest under --evidence-root re-hashes to the cited sha256", async () => {
    const { root, record } = fixtureRepository();
    const evidence = evidenceFixture();
    const pinned = pinnedRecord(record, evidence);

    const withRoot = await validate(root, pinned, ["--evidence-root", evidence.evidenceRoot, "--require-bound", "verifier,base_commit"]);
    expect(withRoot.result.refusals).toEqual([]);
    expect(withRoot.code).toBe(0);
    expect(withRoot.result.classes).toEqual({ "$.verifier": "pinned_external", "$.base_commit": "pinned_external" });
    expect(withRoot.result.pinned_external).toEqual(["$.verifier", "$.base_commit"]);
    expect(withRoot.result.bound).toEqual(BOUND_WITHOUT_PINNED);
    expect(withRoot.result.evidence_root).toBe(evidence.evidenceRoot);

    const text = capture();
    expect(await runCli(["eval-case", "validate", join(root, "CS-900.eval.json"), "--repo", root, "--evidence-root", evidence.evidenceRoot], text.io)).toBe(0);
    expect(text.stdout).toEqual([`eval-case: VALID case=CS-900 bound=7 pinned_external=$.verifier,$.base_commit recomputed=none external=none unverified=none refusals=0 require_bound=none evidence_root=set sources=none registry_export=${PIN}`]);

    const wrongSha = pinnedRecord(record, { ...evidence, manifestSha256: ZERO64 });
    const mismatch = await validate(root, wrongSha, ["--evidence-root", evidence.evidenceRoot]);
    expect(mismatch.code).toBe(2);
    expect(mismatch.result.refusals).toEqual([
      expect.objectContaining({ code: "evidence_manifest_mismatch", citation: "$.verifier.manifest.sha256", detail: expect.stringContaining(`hashes to ${evidence.manifestSha256}, not the cited ${ZERO64}`) }),
      expect.objectContaining({ code: "evidence_manifest_mismatch", citation: "$.base_commit.manifest.sha256" }),
    ]);

    const emptyRoot = scratch("mister-clean-empty-evidence-");
    const absent = await validate(root, pinned, ["--evidence-root", emptyRoot, "--require-bound", "verifier,base_commit"]);
    expect(absent.code).toBe(2);
    expect(absent.result.classes).toEqual({ "$.verifier": "external", "$.base_commit": "external" });
    expect(absent.result.refusals.map((refusal) => [refusal.code, refusal.citation])).toEqual([
      ["binding_required", "$.verifier"],
      ["binding_required", "$.base_commit"],
    ]);

    const noRoot = await validate(root, pinned);
    expect(noRoot.code).toBe(0);
    expect(noRoot.result.external).toEqual(["$.verifier", "$.base_commit"]);
  });

  it("rework 2 proof 2 (manifest-values): the record's digests, base commits and session basis must equal the bound manifest's", async () => {
    const { root, record } = fixtureRepository();
    const evidence = evidenceFixture();
    const pinned = pinnedRecord(record, evidence);
    const args = ["--evidence-root", evidence.evidenceRoot];

    const digest = await validate(root, { ...pinned, verifier: { ...pinned.verifier, sha256: ZERO64 } }, args);
    expect(digest.code).toBe(2);
    expect(digest.result.refusals).toContainEqual(expect.objectContaining({ code: "evidence_manifest_mismatch", citation: "$.verifier.sha256" }));
    expect(digest.result.classes["$.verifier"]).toBe("external");

    const base = pinned.base_commit as Extract<EvalCase["base_commit"], { readonly commits: readonly unknown[] }>;
    const commit = await validate(root, { ...pinned, base_commit: { ...base, commits: [{ pair_set: "B", sessions: "S-01 to S-03", sha: ZERO40 }] } }, args);
    expect(commit.code).toBe(2);
    expect(commit.result.refusals).toEqual([
      { code: "evidence_manifest_mismatch", citation: "$.base_commit.commits[0].sha", detail: `manifest base commit for pair set B is ${evidence.commit}` },
    ]);

    const recorded = await validate(root, { ...pinned, base_commit: { ...base, session_map: "recorded" } }, args);
    expect(recorded.code).toBe(2);
    expect(recorded.result.refusals).toEqual([
      { code: "evidence_manifest_mismatch", citation: "$.base_commit.session_map", detail: "manifest session map basis is inferred" },
    ]);
  });

  it("rework 2 proof 3 (recomputed): with --source the pins are recomputed from the clone at the base commit; one changed byte is refused", async () => {
    const { root, record } = fixtureRepository();
    const evidence = evidenceFixture();
    const pinned = pinnedRecord(record, evidence);

    const recomputed = await validate(root, pinned, ["--evidence-root", evidence.evidenceRoot, "--source", `${SEAM}=${evidence.clone}`, "--require-bound", "verifier,base_commit"]);
    expect(recomputed.result.refusals).toEqual([]);
    expect(recomputed.code).toBe(0);
    expect(recomputed.result.classes).toEqual({ "$.verifier": "recomputed", "$.base_commit": "recomputed" });
    expect(recomputed.result.recomputed).toEqual(["$.verifier", "$.base_commit"]);
    expect(recomputed.result.sources).toEqual({ [SEAM]: evidence.clone });

    // A clone whose review file differs by one byte, published under a manifest that copies the first clone's pins.
    const tampered = evidenceFixture({ reviewText: "fn review() {}\n\n", pinsFrom: { composite: evidence.composite, review: evidence.review } });
    const tamperedRecord = pinnedRecord(record, tampered);
    const mismatch = await validate(root, tamperedRecord, ["--evidence-root", tampered.evidenceRoot, "--source", `${SEAM}=${tampered.clone}`, "--require-bound", "verifier,base_commit"]);
    expect(mismatch.code).toBe(2);
    expect(mismatch.result.classes["$.verifier"]).toBe("external");
    expect(mismatch.result.refusals.map((refusal) => refusal.code)).toContain("recompute_mismatch");
    expect(mismatch.result.refusals).toContainEqual(expect.objectContaining({ code: "recompute_mismatch", citation: "$.verifier.sha256" }));

    // The environment may name the clone instead of the flag.
    const variable = sourceEnvironmentName(SEAM);
    expect(variable).toBe("MISTER_CLEAN_SOURCE_FIXTURE_SEAM");
    const previous = process.env[variable];
    process.env[variable] = evidence.clone;
    try {
      const fromEnvironment = await validate(root, pinned, ["--evidence-root", evidence.evidenceRoot]);
      expect(fromEnvironment.code).toBe(0);
      expect(fromEnvironment.result.classes["$.verifier"]).toBe("recomputed");
    } finally {
      if (previous === undefined) delete process.env[variable];
      else process.env[variable] = previous;
    }

    const notAClone = await validate(root, pinned, ["--evidence-root", evidence.evidenceRoot, "--source", `${SEAM}=${scratch("mister-clean-not-a-clone-")}`]);
    expect(notAClone.code).toBe(2);
    expect(notAClone.result.refusals).toContainEqual(expect.objectContaining({ code: "source_commit_missing", citation: "$.verifier", detail: expect.stringContaining("is not a Git clone") }));
  });

  it("rework 2 proof 4 (header-from-manifest): the composite header is decoded from algorithm.header and refused when it disagrees", async () => {
    const { root, record } = fixtureRepository();
    const good = Buffer.concat([Buffer.from(FIXTURE_HEADER_TEXT, "utf8"), Buffer.from([0])]);
    const inconsistent = evidenceFixture({ header: { encoding: "utf8_with_trailing_nul", text: FIXTURE_HEADER_TEXT, bytes_hex: Buffer.from("other.tree/1\u0000", "utf8").toString("hex"), length: 13, source: "fixture" } });
    const refused = await validate(root, pinnedRecord(record, inconsistent), ["--evidence-root", inconsistent.evidenceRoot]);
    expect(refused.code).toBe(2);
    expect(refused.result.refusals).toContainEqual(expect.objectContaining({ code: "evidence_manifest_unparsable", citation: "$.verifier.manifest", detail: expect.stringContaining("text plus a trailing NUL") }));

    const wrongLength = evidenceFixture({ header: { encoding: "utf8_with_trailing_nul", text: FIXTURE_HEADER_TEXT, bytes_hex: good.toString("hex"), length: 21, source: "fixture" } });
    const refusedLength = await validate(root, pinnedRecord(record, wrongLength), ["--evidence-root", wrongLength.evidenceRoot]);
    expect(refusedLength.code).toBe(2);
    expect(refusedLength.result.refusals).toContainEqual(expect.objectContaining({ code: "evidence_manifest_unparsable", detail: expect.stringContaining("algorithm.header.length") }));

    const missing = evidenceFixture({ header: {} });
    const refusedMissing = await validate(root, pinnedRecord(record, missing), ["--evidence-root", missing.evidenceRoot]);
    expect(refusedMissing.code).toBe(2);
    expect(codes(refusedMissing.result)).toContain("evidence_manifest_unparsable");
  });

  it("rework 2 proof 5 (evidence-root-outside-repo): an evidence root inside the validated repository is refused before any read", async () => {
    const { root, record } = fixtureRepository();
    const inside = join(root, "evidence");
    mkdirSync(inside, { recursive: true });
    const refused = await validate(root, record, ["--evidence-root", inside, "--require-bound", "verifier,base_commit"]);
    expect(refused.code).toBe(2);
    expect(refused.result.refusals).toEqual([
      { code: "evidence_root_inside_repository", citation: "--evidence-root", detail: "the evidence root must lie outside the validated repository" },
    ]);
    expect(refused.result.bound).toEqual([]);
    expect(refused.result.classes).toEqual({});
  });
});
