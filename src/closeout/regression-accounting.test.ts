import { createHash } from "node:crypto";

import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  OBSERVATION_IDENTITY_SCHEME,
  ROOT_DEBT_IDENTITY_SCHEME,
  ROOT_DEBT_IDENTITY_CONTRACT,
  canonicalObservationId,
  canonicalObservationSet,
  canonicalRootDebtKey,
  deriveActionObservationSets,
  deriveRegressionAccounting,
  observationLedgerDigest,
  rootDebtLedgerDigest,
  schema15LegacyNumericFieldErrors,
  validateRegressionAccounting,
  type ActionObservationSets,
  type RegressionAccountingEvidence,
  type RootDebtAccountingRow,
  type RootDebtOrigin,
} from "./regression-accounting.js";

const REPO_ID = "repo:example.invalid/mister-clean-fixture";

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function observation(label: string, sourceId = "detector:test@1"): string {
  return canonicalObservationId({
    source_id: sourceId,
    source_native_fingerprint: sha(label),
  });
}

function debtRow(
  label: string,
  observationIds: readonly string[],
  overrides: Partial<RootDebtAccountingRow> = {},
): RootDebtAccountingRow {
  const causeKey = { class: "fixture", label } as const;
  return {
    debt_key: canonicalRootDebtKey({
      repo_id: REPO_ID,
      normalizer: "fixture-root-cause@1",
      cause_key: causeKey,
    }),
    normalizer: "fixture-root-cause@1",
    cause_key: causeKey,
    state: "open",
    disposition: "autonomously_repair",
    origin: { class: "baseline" },
    observation_ids: canonicalObservationSet(observationIds),
    ...overrides,
  };
}

describe("canonical regression identities", () => {
  it("domain-separates observation identities and rejects non-canonical fingerprints", () => {
    const fingerprint = sha("native finding");
    const expected = sha(JSON.stringify([
      OBSERVATION_IDENTITY_SCHEME,
      "detector:git-state@2",
      fingerprint,
    ]));

    expect(canonicalObservationId({
      source_id: "detector:git-state@2",
      source_native_fingerprint: fingerprint,
    })).toBe(expected);
    expect(canonicalObservationId({
      source_id: "native-gate:test@1",
      source_native_fingerprint: fingerprint,
    })).not.toBe(expected);
    expect(() => canonicalObservationId({
      source_id: "detector:git-state@2",
      source_native_fingerprint: fingerprint.toUpperCase(),
    })).toThrow(/lowercase SHA-256/);
    expect(() => canonicalObservationId({
      source_id: "Detector With Spaces",
      source_native_fingerprint: fingerprint,
    })).toThrow(/source_id/);
  });

  it("makes root-debt keys invariant to object-key order but sensitive to causal structure", () => {
    const first = canonicalRootDebtKey({
      repo_id: REPO_ID,
      normalizer: "planning-root@3",
      cause_key: { path: "plan/story.md", issue: { code: "stale", line: 7 } },
    });
    const reordered = canonicalRootDebtKey({
      repo_id: REPO_ID,
      normalizer: "planning-root@3",
      cause_key: { issue: { line: 7, code: "stale" }, path: "plan/story.md" },
    });
    const changed = canonicalRootDebtKey({
      repo_id: REPO_ID,
      normalizer: "planning-root@3",
      cause_key: { path: "plan/story.md", issue: { code: "stale", line: 8 } },
    });

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
    expect(() => canonicalRootDebtKey({
      repo_id: REPO_ID,
      normalizer: "planning-root@3",
      cause_key: { unsupported: undefined } as never,
    })).toThrow(/canonical JSON/);
  });

  it("orders canonical JSON by Unicode code point without locale-dependent comparison", () => {
    const bmpKey = "\uE000";
    const astralKey = "\u{10000}";
    const causeKey = { [astralKey]: "astral", [bmpKey]: "bmp" };
    const canonicalCause = `{${JSON.stringify(bmpKey)}:"bmp",${JSON.stringify(astralKey)}:"astral"}`;
    const expectedPreimage = `[`
      + `${JSON.stringify(ROOT_DEBT_IDENTITY_SCHEME)},`
      + `${JSON.stringify(REPO_ID)},`
      + `${JSON.stringify("unicode-root@1")},`
      + `${canonicalCause}]`;
    const localeSpy = vi.spyOn(String.prototype, "localeCompare")
      .mockImplementation(() => { throw new Error("locale comparison is forbidden"); });
    try {
      expect(canonicalRootDebtKey({
        repo_id: REPO_ID,
        normalizer: "unicode-root@1",
        cause_key: causeKey,
      })).toBe(sha(expectedPreimage));

      const a = observation("ordering-a");
      const b = observation("ordering-b");
      expect(() => rootDebtLedgerDigest(REPO_ID, [
        debtRow("b", [b]),
        debtRow("a", [a]),
      ])).not.toThrow();
      expect(() => observationLedgerDigest([], [], [
        deriveActionObservationSets("A-2", [
          { phase: "before", observation_ids: [] },
          { phase: "after", observation_ids: [b] },
        ]),
        deriveActionObservationSets("A-1", [
          { phase: "before", observation_ids: [] },
          { phase: "after", observation_ids: [a] },
        ]),
      ])).not.toThrow();
    } finally {
      localeSpy.mockRestore();
    }
  });

  it("treats repo_id as exact opaque UTF-8 input without Unicode normalization", () => {
    expect(ROOT_DEBT_IDENTITY_CONTRACT.repo_id).toBe("exact_opaque_utf8_no_normalization");
    const composed = canonicalRootDebtKey({
      repo_id: "repo:\u00e9",
      normalizer: "fixture@1",
      cause_key: { class: "same" },
    });
    const decomposed = canonicalRootDebtKey({
      repo_id: "repo:e\u0301",
      normalizer: "fixture@1",
      cause_key: { class: "same" },
    });
    expect(composed).not.toBe(decomposed);
    expect(() => canonicalRootDebtKey({
      repo_id: " repo:\u00e9",
      normalizer: "fixture@1",
      cause_key: { class: "same" },
    })).toThrow(/exact string/);
    expect(() => canonicalRootDebtKey({
      repo_id: "repo:\ud800",
      normalizer: "fixture@1",
      cause_key: { class: "same" },
    })).toThrow(/unpaired surrogate/);
  });
});

describe("action observation accounting", () => {
  it("derives appeared, resolved, and open sets over every action snapshot", () => {
    const [a, b, c, d] = ["a", "b", "c", "d"].map((value) => observation(value)) as [
      string,
      string,
      string,
      string,
    ];
    const result = deriveActionObservationSets("A-17", [
      { phase: "before", observation_ids: [b, a] },
      { phase: "intermediate", observation_ids: [d, c, b, a] },
      { phase: "after", observation_ids: [d, a] },
    ]);

    expect(result).toEqual({
      action_id: "A-17",
      before_observation_ids: canonicalObservationSet([a, b]),
      observed_observation_ids: canonicalObservationSet([a, b, c, d]),
      closing_observation_ids: canonicalObservationSet([a, d]),
      appeared_observation_ids: canonicalObservationSet([c, d]),
      resolved_before_boundary_observation_ids: [c],
      open_at_boundary_observation_ids: [d],
    });
  });

  it("rejects malformed phase order and invalid observation identities", () => {
    const a = observation("a");
    expect(() => deriveActionObservationSets("A-1", [
      { phase: "after", observation_ids: [a] },
      { phase: "before", observation_ids: [a] },
    ])).toThrow(/before.*after/);
    expect(() => deriveActionObservationSets("A-1", [
      { phase: "before", observation_ids: [] },
      { phase: "after", observation_ids: ["not-a-digest"] },
    ])).toThrow(/observation id/);
  });
});

describe("two-ledger regression accounting", () => {
  function validEvidence(): RegressionAccountingEvidence {
    const observations = [1, 2, 3, 4, 5, 6].map((value) => observation(`finding-${value}`));
    const [o1, o2, o3, o4, o5, o6] = observations as [string, string, string, string, string, string];
    return {
      repo_id: REPO_ID,
      baseline_observation_ids: canonicalObservationSet([o1, o2, o3, o4]),
      closing_observation_ids: canonicalObservationSet([o5, o6]),
      action_observations: [],
      root_debts: [
        debtRow("one", [o1, o2, o3], { state: "satisfied" }),
        debtRow("two", [o4, o5, o6]),
      ],
    };
  }

  it("binds observation and normalized root-debt ledgers without count arithmetic", () => {
    const evidence = validEvidence();
    const accounting = deriveRegressionAccounting(evidence);

    expect(accounting).toEqual({
      schema_version: "1.5",
      observation_ledger: {
        identity_scheme: OBSERVATION_IDENTITY_SCHEME,
        ledger_sha256: observationLedgerDigest(
          evidence.baseline_observation_ids,
          evidence.closing_observation_ids,
          evidence.action_observations,
        ),
        baseline_observation_ids: evidence.baseline_observation_ids,
        closing_observation_ids: evidence.closing_observation_ids,
        observed_observation_ids: canonicalObservationSet([
          ...evidence.baseline_observation_ids,
          ...evidence.closing_observation_ids,
        ]),
      },
      root_debt_ledger: {
        identity_scheme: ROOT_DEBT_IDENTITY_SCHEME,
        ledger_sha256: rootDebtLedgerDigest(evidence.repo_id, evidence.root_debts),
        baseline_present_debt_keys: canonicalObservationSet(evidence.root_debts.map((row) => row.debt_key)),
        closing_present_debt_keys: [evidence.root_debts[1]!.debt_key],
      },
    });
    expect(validateRegressionAccounting(accounting, evidence)).toEqual([]);
  });

  it("makes ledger digests stable under row and cause-object order, and sensitive to state", () => {
    const evidence = validEvidence();
    const [first, second] = evidence.root_debts as [RootDebtAccountingRow, RootDebtAccountingRow];
    const reorderedCause: RootDebtAccountingRow = {
      ...first,
      cause_key: { label: "one", class: "fixture" },
    };
    expect(rootDebtLedgerDigest(REPO_ID, [second, reorderedCause]))
      .toBe(rootDebtLedgerDigest(REPO_ID, [first, second]));
    expect(rootDebtLedgerDigest(REPO_ID, [{ ...first, state: "blocked" }, second]))
      .not.toBe(rootDebtLedgerDigest(REPO_ID, [first, second]));
  });

  it("rejects unmapped, multiply-owned, and fabricated observation partitions", () => {
    const unmapped = validEvidence();
    const first = unmapped.root_debts[0]!;
    unmapped.root_debts = [{ ...first, observation_ids: first.observation_ids.slice(1) }, unmapped.root_debts[1]!];
    expect(() => deriveRegressionAccounting(unmapped)).toThrow(/exactly one root debt.*0 owner/);

    const duplicate = validEvidence();
    duplicate.root_debts = [
      duplicate.root_debts[0]!,
      {
        ...duplicate.root_debts[1]!,
        observation_ids: canonicalObservationSet([
          ...duplicate.root_debts[1]!.observation_ids,
          duplicate.root_debts[0]!.observation_ids[0]!,
        ]),
      },
    ];
    expect(() => deriveRegressionAccounting(duplicate)).toThrow(/exactly one root debt.*2 owners/);

    const fabricated = validEvidence();
    fabricated.root_debts = [
      { ...fabricated.root_debts[0]!, observation_ids: canonicalObservationSet([
        ...fabricated.root_debts[0]!.observation_ids,
        observation("fabricated"),
      ]) },
      fabricated.root_debts[1]!,
    ];
    expect(() => deriveRegressionAccounting(fabricated)).toThrow(/absent from observation universe/);
  });

  it("detects digest, identity-scheme, and presence-set tampering", () => {
    const evidence = validEvidence();
    const accounting = deriveRegressionAccounting(evidence);
    const tampered = structuredClone(accounting);
    tampered.observation_ledger.identity_scheme = "mister-clean.observation.v0" as never;
    tampered.root_debt_ledger.ledger_sha256 = sha("forged ledger");
    tampered.root_debt_ledger.closing_present_debt_keys = [];

    expect(validateRegressionAccounting(tampered, evidence)).toEqual(expect.arrayContaining([
      expect.stringMatching(/observation_ledger\.identity_scheme/),
      expect.stringMatching(/root_debt_ledger\.ledger_sha256/),
      expect.stringMatching(/closing_present_debt_keys/),
    ]));
  });

  it("returns validation errors instead of throwing on adversarial malformed shapes", () => {
    const evidence = validEvidence();
    const accounting = deriveRegressionAccounting(evidence);
    const poison = new Proxy({}, {
      get() { throw new Error("hostile getter"); },
    });
    const cases: Array<[unknown, unknown]> = [
      [null, null],
      [{ schema_version: "1.5", observation_ledger: null, root_debt_ledger: [] }, evidence],
      [accounting, { ...evidence, action_observations: [null] }],
      [accounting, { ...evidence, root_debts: [{ origin: null, observation_ids: "not-an-array" }] }],
      [poison, evidence],
    ];

    for (const [candidateAccounting, candidateEvidence] of cases) {
      let errors: string[] = [];
      expect(() => {
        errors = validateRegressionAccounting(candidateAccounting, candidateEvidence);
      }).not.toThrow();
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it("rejects extra schema fields without inspecting opaque cause keys", () => {
    const evidence = validEvidence();
    const accounting = deriveRegressionAccounting(evidence);
    const disguised = structuredClone(accounting) as typeof accounting & { baseline_findings?: unknown };
    disguised.baseline_findings = null;
    expect(validateRegressionAccounting(disguised, evidence)).toContain(
      "$.accounting.baseline_findings: unexpected field",
    );

    const extraEvidence = structuredClone(evidence) as RegressionAccountingEvidence & { closing_findings?: unknown };
    extraEvidence.closing_findings = "forged";
    expect(validateRegressionAccounting(accounting, extraEvidence)).toContain(
      "$.evidence.closing_findings: unexpected field",
    );

    const opaqueCause = structuredClone(evidence);
    opaqueCause.root_debts[0]!.cause_key = { baseline_findings: "opaque-domain-value" };
    opaqueCause.root_debts[0]!.debt_key = canonicalRootDebtKey({
      repo_id: opaqueCause.repo_id,
      normalizer: opaqueCause.root_debts[0]!.normalizer,
      cause_key: opaqueCause.root_debts[0]!.cause_key,
    });
    const recomputed = deriveRegressionAccounting(opaqueCause);
    expect(validateRegressionAccounting(recomputed, opaqueCause)).toEqual([]);
  });

  it("requires introduced roots to bind an observed action appearance and evidence", () => {
    const introduced = observation("introduced");
    const action = deriveActionObservationSets("A-9", [
      { phase: "before", observation_ids: [] },
      { phase: "after", observation_ids: [introduced] },
    ]);
    const validRow = debtRow("introduced", [introduced], {
      origin: {
        class: "introduced_by_run",
        action_id: "A-9",
        observation_evidence_ref: { path: "evidence/action-A-9.json", sha256: sha("action evidence") },
      },
    });
    const evidence: RegressionAccountingEvidence = {
      repo_id: REPO_ID,
      baseline_observation_ids: [],
      closing_observation_ids: [introduced],
      action_observations: [action],
      root_debts: [validRow],
    };
    expect(validateRegressionAccounting(deriveRegressionAccounting(evidence), evidence)).toEqual([]);

    const wrongAction: RegressionAccountingEvidence = {
      ...evidence,
      root_debts: [{
        ...validRow,
        origin: {
          class: "introduced_by_run",
          action_id: "A-missing",
          observation_evidence_ref: validRow.origin.class === "introduced_by_run"
            ? validRow.origin.observation_evidence_ref
            : { path: "unreachable", sha256: sha("unreachable") },
        },
      }],
    };
    expect(() => deriveRegressionAccounting(wrongAction)).toThrow(/earliest ordered action.*A-9/);

    const noEvidence: RegressionAccountingEvidence = {
      ...evidence,
      root_debts: [{
        ...validRow,
        origin: { class: "introduced_by_run", action_id: "A-9" } as never,
      }],
    };
    expect(() => deriveRegressionAccounting(noEvidence)).toThrow(/observation_evidence_ref/);
  });

  it("makes origin a strict tagged union and rejects class-incompatible keys by presence", () => {
    expectTypeOf<{ class: "baseline"; action_id: string }>().not.toMatchTypeOf<RootDebtOrigin>();
    expectTypeOf<{ class: "introduced_by_run"; action_id: string }>().not.toMatchTypeOf<RootDebtOrigin>();
    expectTypeOf<{
      class: "newly_discovered_preexisting";
      observation_evidence_ref: { path: string; sha256: string };
      baseline_replay_ref: { path: string; sha256: string };
    }>().toMatchTypeOf<RootDebtOrigin>();
    expectTypeOf<{
      class: "concurrent_external";
      observation_evidence_ref: { path: string; sha256: string };
      change_ref: { path: string; sha256: string };
    }>().not.toMatchTypeOf<RootDebtOrigin>();
    expectTypeOf<{
      class: "concurrent_external";
      observation_evidence_ref: { path: string; sha256: string };
      change_ref: { kind: "external_change"; path: string; sha256: string };
    }>().toMatchTypeOf<RootDebtOrigin>();

    const evidence = validEvidence();
    const accounting = deriveRegressionAccounting(evidence);
    const cases: Array<{ origin: unknown; expected: string }> = [
      {
        origin: { class: "baseline", action_id: "A-1" },
        expected: "$.evidence.root_debts[0].origin.action_id: unexpected field",
      },
      {
        origin: { class: "baseline", evidence_ref: { path: "evidence/baseline.json", sha256: sha("baseline") } },
        expected: "$.evidence.root_debts[0].origin.evidence_ref: unexpected field",
      },
      {
        origin: { class: "introduced_by_run", action_id: "A-1" },
        expected: "$.evidence.root_debts[0].origin.observation_evidence_ref: required object",
      },
      {
        origin: {
          class: "newly_discovered_preexisting",
          action_id: "A-1",
          observation_evidence_ref: { path: "evidence/observation.json", sha256: sha("observation") },
          baseline_replay_ref: { path: "evidence/replay.json", sha256: sha("replay") },
        },
        expected: "$.evidence.root_debts[0].origin.action_id: unexpected field",
      },
      {
        origin: { class: "concurrent_external" },
        expected: "$.evidence.root_debts[0].origin.observation_evidence_ref: required object",
      },
      {
        origin: {
          class: "unestablished",
          action_id: "A-1",
          evidence_ref: { path: "evidence/claim.json", sha256: sha("claim") },
        },
        expected: "$.evidence.root_debts[0].origin.action_id: unexpected field",
      },
    ];

    for (const testCase of cases) {
      const mutated = structuredClone(evidence) as RegressionAccountingEvidence;
      mutated.root_debts[0]!.origin = testCase.origin as never;
      expect(validateRegressionAccounting(accounting, mutated)).toContain(testCase.expected);
    }
  });

  it("requires typed contrary evidence before an action-first observation can avoid introduced attribution", () => {
    const actionFirst = observation("action-first-origin");
    const action = deriveActionObservationSets("A-origin", [
      { phase: "before", observation_ids: [] },
      { phase: "after", observation_ids: [actionFirst] },
    ]);
    const observationRef = {
      path: "evidence/action-first-observation.json",
      sha256: sha("action-first observation"),
    };
    const makeEvidence = (origin: RootDebtOrigin): RegressionAccountingEvidence => ({
      repo_id: REPO_ID,
      baseline_observation_ids: [],
      closing_observation_ids: [actionFirst],
      action_observations: [action],
      root_debts: [debtRow("action-first-origin", [actionFirst], { origin })],
    });

    const replayProven: RootDebtOrigin = {
      class: "newly_discovered_preexisting",
      observation_evidence_ref: observationRef,
      baseline_replay_ref: {
        path: "evidence/pre-action-baseline-replay.json",
        sha256: sha("baseline replay proves preexistence"),
      },
    };
    const externalProven: RootDebtOrigin = {
      class: "concurrent_external",
      observation_evidence_ref: observationRef,
      change_ref: {
        kind: "external_change",
        path: "evidence/external-change.json",
        sha256: sha("external change proof"),
      },
    };
    for (const origin of [replayProven, externalProven]) {
      const evidence = makeEvidence(origin);
      expect(validateRegressionAccounting(deriveRegressionAccounting(evidence), evidence)).toEqual([]);
    }

    const genericConcurrent = makeEvidence({
      class: "concurrent_external",
      observation_evidence_ref: observationRef,
      change_ref: {
        path: "evidence/generic-receipt.json",
        sha256: sha("generic receipt"),
      } as never,
    });
    expect(() => deriveRegressionAccounting(genericConcurrent)).toThrow(/change_ref\.kind.*external_change/);

    const unestablished = makeEvidence({ class: "unestablished" });
    expect(() => deriveRegressionAccounting(unestablished))
      .toThrow(/first appeared in action A-origin.*requires introduced_by_run/);
  });

  it("rejects missing causal receipts, legacy generic evidence, and unexpected receipt keys", () => {
    const actionFirst = observation("causal-receipt-shape");
    const action = deriveActionObservationSets("A-shape", [
      { phase: "before", observation_ids: [] },
      { phase: "after", observation_ids: [actionFirst] },
    ]);
    const observationRef = {
      path: "evidence/observation.json",
      sha256: sha("observation"),
    };
    const withOrigin = (origin: unknown): RegressionAccountingEvidence => ({
      repo_id: REPO_ID,
      baseline_observation_ids: [],
      closing_observation_ids: [actionFirst],
      action_observations: [action],
      root_debts: [debtRow("causal-receipt-shape", [actionFirst], { origin: origin as never })],
    });

    expect(() => deriveRegressionAccounting(withOrigin({
      class: "newly_discovered_preexisting",
      observation_evidence_ref: observationRef,
    }))).toThrow(/baseline_replay_ref: required/);
    expect(() => deriveRegressionAccounting(withOrigin({
      class: "newly_discovered_preexisting",
      baseline_replay_ref: {
        path: "evidence/replay.json",
        sha256: sha("replay without observation"),
      },
    }))).toThrow(/observation_evidence_ref: required/);
    expect(() => deriveRegressionAccounting(withOrigin({
      class: "concurrent_external",
      observation_evidence_ref: observationRef,
    }))).toThrow(/change_ref: required/);
    expect(() => deriveRegressionAccounting(withOrigin({
      class: "concurrent_external",
      observation_evidence_ref: observationRef,
      evidence_ref: { path: "evidence/generic.json", sha256: sha("generic") },
    }))).toThrow(/evidence_ref: unexpected field/);
    expect(() => deriveRegressionAccounting(withOrigin({
      class: "newly_discovered_preexisting",
      observation_evidence_ref: { ...observationRef, purpose: "trust me" },
      baseline_replay_ref: {
        path: "evidence/replay.json",
        sha256: sha("replay"),
        conclusion: "preexisting",
      },
    }))).toThrow(/unexpected field/);
  });

  it("includes every causal receipt in the canonical root-ledger digest", () => {
    const observed = observation("origin-digest");
    const base = debtRow("origin-digest", [observed], {
      origin: {
        class: "newly_discovered_preexisting",
        observation_evidence_ref: {
          path: "evidence/observation.json",
          sha256: sha("observation-v1"),
        },
        baseline_replay_ref: {
          path: "evidence/replay.json",
          sha256: sha("replay-v1"),
        },
      },
    });
    const observationChanged: RootDebtAccountingRow = {
      ...base,
      origin: {
        ...base.origin as Extract<RootDebtOrigin, { class: "newly_discovered_preexisting" }>,
        observation_evidence_ref: {
          path: "evidence/observation.json",
          sha256: sha("observation-v2"),
        },
      },
    };
    const replayChanged: RootDebtAccountingRow = {
      ...base,
      origin: {
        ...base.origin as Extract<RootDebtOrigin, { class: "newly_discovered_preexisting" }>,
        baseline_replay_ref: {
          path: "evidence/replay.json",
          sha256: sha("replay-v2"),
        },
      },
    };
    const external: RootDebtAccountingRow = {
      ...base,
      origin: {
        class: "concurrent_external",
        observation_evidence_ref: {
          path: "evidence/observation.json",
          sha256: sha("observation-v1"),
        },
        change_ref: {
          kind: "external_change",
          path: "evidence/external-change.json",
          sha256: sha("external-change-v1"),
        },
      },
    };
    const digests = [base, observationChanged, replayChanged, external]
      .map((row) => rootDebtLedgerDigest(REPO_ID, [row]));
    expect(new Set(digests).size).toBe(digests.length);
  });

  it("derives physical closing presence from observations rather than report state", () => {
    const transient = observation("physically-closed");
    const action = deriveActionObservationSets("A-close", [
      { phase: "before", observation_ids: [] },
      { phase: "intermediate", observation_ids: [transient] },
      { phase: "after", observation_ids: [] },
    ]);
    const row = debtRow("physically-closed", [transient], {
      state: "satisfied",
      origin: {
        class: "introduced_by_run",
        action_id: "A-close",
        observation_evidence_ref: {
          path: "evidence/transient-observation.json",
          sha256: sha("transient observation"),
        },
      },
    });
    const evidence: RegressionAccountingEvidence = {
      repo_id: REPO_ID,
      baseline_observation_ids: [],
      closing_observation_ids: [],
      action_observations: [action],
      root_debts: [row],
    };
    expect(deriveRegressionAccounting(evidence).root_debt_ledger.closing_present_debt_keys).toEqual([]);
    expect(() => deriveRegressionAccounting({
      ...evidence,
      root_debts: [{ ...row, state: "open" }],
    })).toThrow(/unresolved root debt requires a closing observation/);
  });

  it("binds introduced origin to the earliest ordered appearance, not a later reappearance", () => {
    const introduced = observation("introduced-twice");
    const first = deriveActionObservationSets("A-1", [
      { phase: "before", observation_ids: [] },
      { phase: "intermediate", observation_ids: [introduced] },
      { phase: "after", observation_ids: [] },
    ]);
    const second = deriveActionObservationSets("A-2", [
      { phase: "before", observation_ids: [] },
      { phase: "after", observation_ids: [introduced] },
    ]);
    const evidenceRef = { path: "evidence/action-A-1.json", sha256: sha("first appearance") };
    const valid: RegressionAccountingEvidence = {
      repo_id: REPO_ID,
      baseline_observation_ids: [],
      closing_observation_ids: [introduced],
      action_observations: [first, second],
      root_debts: [debtRow("introduced-twice", [introduced], {
        origin: {
          class: "introduced_by_run",
          action_id: "A-1",
          observation_evidence_ref: evidenceRef,
        },
      })],
    };
    expect(validateRegressionAccounting(deriveRegressionAccounting(valid), valid)).toEqual([]);

    const fakeSecond: RegressionAccountingEvidence = {
      ...valid,
      root_debts: [{
        ...valid.root_debts[0]!,
        origin: {
          class: "introduced_by_run",
          action_id: "A-2",
          observation_evidence_ref: evidenceRef,
        },
      }],
    };
    expect(() => deriveRegressionAccounting(fakeSecond))
      .toThrow(/earliest ordered action where any root observation first appeared \(A-1\)/);
  });

  it("rejects mixed schema-1.5 legacy numeric claims while leaving older records explicit", () => {
    expect(schema15LegacyNumericFieldErrors({
      schema_version: "1.5",
      baseline_findings: 8,
      action_checks: [{ introduced: 2, paid_before_boundary: 1, open_at_boundary: 1 }],
    })).toEqual([
      "$.baseline_findings: legacy numeric regression field is forbidden by schema 1.5 accounting",
      "$.action_checks[0].introduced: legacy numeric action field is forbidden by schema 1.5 accounting",
      "$.action_checks[0].paid_before_boundary: legacy numeric action field is forbidden by schema 1.5 accounting",
      "$.action_checks[0].open_at_boundary: legacy numeric action field is forbidden by schema 1.5 accounting",
    ]);
    expect(schema15LegacyNumericFieldErrors({
      schema_version: "1.4",
      baseline_findings: 8,
      action_checks: [{ introduced: 2 }],
    })).toEqual([]);
  });

  it("rejects legacy-field presence even when a producer disguises the value type", () => {
    expect(schema15LegacyNumericFieldErrors({
      schema_version: "1.5",
      baseline_findings: "8",
      closing_findings: null,
      introduced_by_run_open: { count: 1 },
      action_checks: [{
        introduced: "2",
        paid_before_boundary: null,
        open_at_boundary: { count: 1 },
      }],
    })).toEqual([
      "$.baseline_findings: legacy numeric regression field is forbidden by schema 1.5 accounting",
      "$.closing_findings: legacy numeric regression field is forbidden by schema 1.5 accounting",
      "$.introduced_by_run_open: legacy numeric regression field is forbidden by schema 1.5 accounting",
      "$.action_checks[0].introduced: legacy numeric action field is forbidden by schema 1.5 accounting",
      "$.action_checks[0].paid_before_boundary: legacy numeric action field is forbidden by schema 1.5 accounting",
      "$.action_checks[0].open_at_boundary: legacy numeric action field is forbidden by schema 1.5 accounting",
    ]);
    expect(schema15LegacyNumericFieldErrors({
      schema_version: "1.5",
      action_checks: "not-an-array",
    })).toEqual([
      "$.action_checks: legacy numeric regression field is forbidden by schema 1.5 accounting",
    ]);
  });
});
