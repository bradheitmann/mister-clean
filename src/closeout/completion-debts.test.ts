/**
 * The completion-debt reducer (charter/DONE/mg-s2e-finding-reducer.md, proofs 3 and 4).
 * Inputs are built by hand: each family's detector result holds only the fields its
 * builder reads.
 */
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  COMPLETION_DEBT_ORDER,
  reduceCompletionDebts,
  type CompletionDebtDispositions,
  type CompletionDebtInput,
  type CompletionDebtSource,
} from "./completion-debts.js";
import type { PublicSafetyFinding } from "./inspection.js";
import type { NativeGateCoverage, NativeGateDiscovery } from "./native-gates.js";
import type { PlanningRootDebt } from "./planning.js";
import type { PublicSafetyExemptionEntry, RetirementRecord } from "./retirements.js";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const ref = (path: string) => ({ path, sha256: sha(path) });

function publicSafetyFinding(path: string, value: string): PublicSafetyFinding {
  return { fingerprint: sha(`finding\0${path}`), line: 1, path, provenance: "tracked", rule: "custom-denylist-1", value_sha256: sha(value) };
}

function input(overrides: Partial<CompletionDebtInput> = {}): CompletionDebtInput {
  return {
    repoId: "repo:completion-debts",
    now: "2026-11-17T00:00:00Z",
    baselineRepositoryObject: { sha256: sha("object") },
    planningAudit: { root_debts: [] },
    planningAuditRef: ref("planning"),
    publicSafetyAudit: { findings: [], unassessed: [] },
    publicSafetyAuditRef: ref("public-safety"),
    publicSafetyCommand: "mister-clean audit public-safety . --tracked --json",
    githubActionsAudit: { findings: [] },
    githubActionsAuditRef: ref("github-actions"),
    languagePolicyAudit: { findings: [] },
    languagePolicyAuditRef: ref("language-policy"),
    semanticAudit: { findings: [], candidate_set_sha256: sha("candidates") },
    semanticAuditRef: ref("semantic"),
    semanticCommand: "mister-clean audit semantic . --json",
    nativeGateDiscovery: { gates: [] } as unknown as NativeGateDiscovery,
    nativeGateCoverage: { executions: [] } as unknown as NativeGateCoverage,
    nativeGateValidationRef: ref("native-gate-validation"),
    ...overrides,
  };
}

const NO_DISPOSITIONS: CompletionDebtDispositions = { publicSafetyExemptions: [], retirements: [] };

type Debt = Record<string, unknown>;

describe("disposition order", () => {
  const exemptedRetired = publicSafetyFinding("legacy/fixture.md", "synthetic value");
  const retired = publicSafetyFinding("legacy/notes.md", "real value");
  const open = publicSafetyFinding("src/active.md", "real value");
  const exemption: PublicSafetyExemptionEntry = {
    record_path: "charter/public-safety-exemptions/2026-11-17-fixture.json",
    file: exemptedRetired.path,
    rule: exemptedRetired.rule,
    value_sha256: exemptedRetired.value_sha256,
    rationale: "synthetic fixture string",
  };
  const retirement: RetirementRecord = {
    record_path: "charter/retirements/2026-11-17-legacy.json",
    record_sha256: sha("retirement"),
    slug: "legacy-corpus",
    roots: ["legacy"],
    ruling: { author: "operator", at: "2026-11-17T00:00:00Z", scope: "Retire the legacy corpus", evidence: { path: "charter/owner-decisions/ruling.md", sha256: sha("ruling") } },
  };
  const debtId = (finding: PublicSafetyFinding): string => `DEBT-PUBLIC-SAFETY-${finding.fingerprint.slice(0, 16).toUpperCase()}`;

  it("applies exemptions before it builds debts, and retirements after", () => {
    const reduction = reduceCompletionDebts(
      input({ publicSafetyAudit: { findings: [exemptedRetired, retired, open], unassessed: [] } }),
      { publicSafetyExemptions: [exemption], retirements: [retirement] },
    );
    const debts = reduction.retirementOutcome.debts;
    const byId = new Map(debts.map((debt) => [String(debt.id), debt]));

    // Exempted and under the retired root: no debt, and in no retirement application.
    expect(byId.has(debtId(exemptedRetired))).toBe(false);
    expect(reduction.completionDebts.map((debt) => String((debt as unknown as Debt).id))).not.toContain(debtId(exemptedRetired));
    expect(reduction.retirementOutcome.applications.flatMap((application) => application.debt_ids)).not.toContain(debtId(exemptedRetired));
    expect(reduction.exempted.map((row) => row.finding)).toEqual([exemptedRetired]);

    // Under the retired root and not exempted: retired.
    expect(byId.get(debtId(retired))).toMatchObject({ state: "accepted_exception", disposition: "accepted_exception" });
    expect(reduction.retirementOutcome.applications).toEqual([{
      record_path: retirement.record_path,
      slug: retirement.slug,
      root: "legacy",
      debt_ids: [debtId(retired)],
    }]);

    // Outside the root: open.
    expect(byId.get(debtId(open))).toMatchObject({ state: "open", disposition: "autonomously_repair" });
    expect(debts).toHaveLength(2);
  });
});

describe("debt order", () => {
  const planningRoot = (id: string, path: string): PlanningRootDebt => ({
    affected_paths: [path],
    affected_projection_field: "status",
    causal_evidence: { component_refs: [path], kind: "single_artifact", violated_invariant: "status agrees" },
    cause_key: `cause:${id}`,
    class: "body_projection_conflict",
    detector_family: "planning_graph",
    id: `ROOT-PLANNING-${id}`,
    observation_count: 1,
    raw_finding_ids: [`raw-${id}`],
    repair_boundary: `artifact:${path}`,
    snapshot: sha("snapshot"),
  });
  const everySource = input({
    planningAudit: { root_debts: [planningRoot("A", "planning/a.md"), planningRoot("B", "planning/b.md")] },
    publicSafetyAudit: {
      findings: [publicSafetyFinding("src/a.txt", "value")],
      unassessed: [{ fingerprint: sha("unassessed"), path: "vendor/module", reason: "unsupported_tracked_entry" }],
    },
    githubActionsAudit: {
      findings: [
        { fingerprint: sha("gha-1"), path: ".github/workflows/cd.yml", rule: "permissions_implicit", severity: "P1", detail: "implicit", refs: [".github/workflows/cd.yml#line-1"] },
        { fingerprint: sha("gha-2"), path: ".github/workflows/ci.yml", rule: "permissions_implicit", severity: "P1", detail: "implicit", refs: [".github/workflows/ci.yml#line-1"] },
      ],
    },
    languagePolicyAudit: {
      findings: [{ fingerprint: sha("lang"), family: "language_policy", rule: "forbidden_language", path: "tools/a.rb", extension: ".rb" }],
    },
    semanticAudit: {
      candidate_set_sha256: sha("candidates"),
      findings: [
        { candidate_id: "SEM-1", classification: "confirmed_product_defect", code: "construction_boundary_failure", detail: "failed", kind: "construction_boundary", refs: ["planning/SECURITY.md#line-5"] },
        { candidate_id: "SEM-2", classification: "verification_debt", code: "semantic_probe_unassigned", detail: "unassigned", kind: "construction_boundary", refs: ["planning/SECURITY.md#line-6"] },
      ],
    },
    nativeGateDiscovery: {
      gates: [{
        id: "node:.:native-quality",
        kind: "repository_tests",
        disposition: "absent",
        basis: "manager_unresolved",
        semantic_contract_sha256: sha("contract"),
        source_refs: [{ path: "package.json", sha256: sha("package") }],
      }],
    } as unknown as NativeGateDiscovery,
  });

  function sourceOf(debt: Debt): CompletionDebtSource {
    if (String(debt.normalizer).startsWith("mister-clean/native-gate-root@")) return "native_gate";
    return (debt.cause_key as { detector_family: CompletionDebtSource }).detector_family;
  }

  it("is data: planning_graph, public_safety, github_actions, language_policy, semantic_boundary, native gate", () => {
    expect(COMPLETION_DEBT_ORDER).toEqual(["planning_graph", "public_safety", "github_actions", "language_policy", "semantic_boundary", "native_gate"]);
  });

  it("groups a reducer run's debts by source in that order", () => {
    const reduction = reduceCompletionDebts(everySource, NO_DISPOSITIONS);
    const sources = reduction.retirementOutcome.debts.map(sourceOf);
    expect(sources).toEqual([
      "planning_graph", "planning_graph",
      "public_safety", "public_safety",
      "github_actions", "github_actions",
      "language_policy",
      "semantic_boundary", "semantic_boundary",
      "native_gate",
    ]);
    // Grouped: each source is one run, and the runs follow COMPLETION_DEBT_ORDER.
    const runs = sources.filter((source, index) => index === 0 || sources[index - 1] !== source);
    expect(runs).toEqual([...COMPLETION_DEBT_ORDER]);
    for (const source of COMPLETION_DEBT_ORDER) {
      expect(reduction.rootDebts[source].map((debt) => sourceOf(debt as unknown as Debt))).toEqual(sources.filter((candidate) => candidate === source));
    }
  });
});
