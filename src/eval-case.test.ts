import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type CliIO, runCli } from "./cli.js";
import { type EvalCase, type EvalCaseValidationResult, REGISTRY_PIN_PATH } from "./eval-case.js";

const roots: string[] = [];
const PIN = "2031.01.01-1";

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function capture(): { io: CliIO; stderr: string[]; stdout: string[] } {
  const stderr: string[] = [];
  const stdout: string[] = [];
  return { io: { stderr: (line) => stderr.push(line), stdout: (line) => stdout.push(line) }, stderr, stdout };
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** A temp repository root holding every file a valid record cites, plus the registry pin. */
function fixtureRepository(): { root: string; record: EvalCase } {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-eval-case-"));
  roots.push(root);
  const files = {
    "field-evals/window/cases/CS-900-fixture.md": "# CS-900\nphenomenon narrative\n",
    "field-evals/controls/data/tallies.tsv": "session\treviewer\tgood_passed\nS-01\tr\t2\n",
    "field-evals/controls/cards/RC-900.md": "---\ncard_id: RC-900\n---\n",
    [REGISTRY_PIN_PATH]: `${JSON.stringify({ schema: "customer-test/1", artifact: { name: "model-atlas.export/1", version: PIN } })}\n`,
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, ...path.split("/").slice(0, -1)), { recursive: true });
    writeFileSync(join(root, ...path.split("/")), content);
  }
  const record: EvalCase = {
    record_type: "mister-clean.eval-case",
    schema_version: "1",
    case_id: "CS-900",
    field_case: { path: "field-evals/window/cases/CS-900-fixture.md", sha256: sha256(files["field-evals/window/cases/CS-900-fixture.md"]) },
    phenomenon: "A reviewer refuses a known-good control.",
    agent_cards: [
      { card_id: "AC-901", model_registry_ref: `fixture-flash@${PIN}`, role: "subject" },
      { card_id: "AC-902", model_registry_ref: `fixture-pro@${PIN}`, role: "control" },
    ],
    verifier: { name: "control-pair gate", kind: "shell gate script plus mutant check", sha256: "a".repeat(64) },
    base_commit: { repository: "fixture-project", sha: "b".repeat(40) },
    replay: {
      floor: "2/3",
      sessions: 3,
      rows_source: { path: "field-evals/controls/data/tallies.tsv", sha256: sha256(files["field-evals/controls/data/tallies.tsv"]) },
      outcome: "met",
      per_reviewer: [
        { card_id: "AC-901", reviewer_model: "fixture-flash", pair_set: "B", sessions: 2, good_replays: 24, false_rejects: 3, populations_at_floor: 1, floor_breaches: 1, bad_passes: 0 },
        { card_id: "AC-902", reviewer_model: "fixture-pro", pair_set: "B", sessions: 1, good_replays: 12, false_rejects: 0, populations_at_floor: 0, floor_breaches: 0, bad_passes: 0 },
      ],
    },
    derived_from: { path: "field-evals/controls/cards/RC-900.md", sha256: sha256(files["field-evals/controls/cards/RC-900.md"]) },
    created_at: "2026-11-03T07:00:00Z",
  };
  return { root, record };
}

async function validate(root: string, record: unknown): Promise<{ code: number; result: EvalCaseValidationResult; stderr: string[] }> {
  const path = join(root, "CS-900.eval.json");
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
  const output = capture();
  const code = await runCli(["eval-case", "validate", path, "--repo", root, "--json"], output.io);
  return { code, result: JSON.parse(output.stdout.join("\n")) as EvalCaseValidationResult, stderr: output.stderr };
}

describe("eval-case validate", () => {
  it("proof 1: a fixture record whose every citation binds is valid; a flipped sha256 is refused by name", async () => {
    const { root, record } = fixtureRepository();
    const valid = await validate(root, record);
    expect(valid.code).toBe(0);
    expect(valid.result.status).toBe("eval_case_valid");
    expect(valid.result.case_id).toBe("CS-900");
    expect(valid.result.registry_export_version).toBe(PIN);
    expect(valid.result.refusals).toEqual([]);
    expect(valid.result.bound).toEqual([
      "$.field_case",
      "$.agent_cards[0].model_registry_ref",
      "$.agent_cards[1].model_registry_ref",
      "$.verifier",
      "$.base_commit",
      "$.replay.rows_source",
      "$.derived_from",
    ]);

    const flipped = await validate(root, { ...record, derived_from: { ...record.derived_from, sha256: "0".repeat(64) } });
    expect(flipped.code).toBe(2);
    expect(flipped.result.status).toBe("eval_case_refused");
    expect(flipped.result.refusals).toEqual([
      expect.objectContaining({ code: "sha256_mismatch", citation: "$.derived_from" }),
    ]);
    expect(flipped.result.bound).not.toContain("$.derived_from");

    const text = capture();
    expect(await runCli(["eval-case", "validate", join(root, "CS-900.eval.json"), "--repo", root], text.io)).toBe(2);
    expect(text.stderr).toEqual([expect.stringMatching(/^ERROR: sha256_mismatch \$\.derived_from: /u)]);
    expect(text.stdout).toEqual([`eval-case: REFUSED case=CS-900 bound=6 refusals=1 registry_export=${PIN}`]);
  });

  it("proof 2: exactly two agent cards; one or three cards is refused as agent_cards_count", async () => {
    const { root, record } = fixtureRepository();
    const one = await validate(root, { ...record, agent_cards: [record.agent_cards[0]] });
    expect(one.code).toBe(2);
    expect(one.result.refusals.map((refusal) => refusal.code)).toContain("agent_cards_count");

    const third = { card_id: "AC-903", model_registry_ref: `fixture-third@${PIN}`, role: "control" as const };
    const three = await validate(root, { ...record, agent_cards: [...record.agent_cards, third] });
    expect(three.code).toBe(2);
    expect(three.result.refusals).toEqual([
      expect.objectContaining({ code: "agent_cards_count", citation: "$.agent_cards", detail: "expected exactly 2 agent cards; got 3" }),
    ]);
  });

  it("proof 3: a verifier with binding unbound is refused as verifier_unbound even when every file citation binds", async () => {
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
    expect(unbound.result.bound).toEqual([
      "$.field_case",
      "$.agent_cards[0].model_registry_ref",
      "$.agent_cards[1].model_registry_ref",
      "$.base_commit",
      "$.replay.rows_source",
      "$.derived_from",
    ]);
  });

  it("proof 4: a registry ref whose export version differs from the pinned one is refused as registry_export_mismatch", async () => {
    const { root, record } = fixtureRepository();
    const stale = await validate(root, {
      ...record,
      agent_cards: [record.agent_cards[0], { ...record.agent_cards[1], model_registry_ref: "fixture-pro@2030.12.31-9" }],
    });
    expect(stale.code).toBe(2);
    expect(stale.result.refusals).toEqual([
      { code: "registry_export_mismatch", citation: "$.agent_cards[1].model_registry_ref", detail: `fixture-pro@2030.12.31-9: expected export ${PIN}` },
    ]);
    expect(stale.result.bound).toContain("$.agent_cards[0].model_registry_ref");
  });
});
