import { describe, expect, it } from "vitest";
import { demoSnapshot } from "./fixture.js";
import { cycleCapabilityWeight, issueRunnerRecommendation, manifestBinding, parseSnapshot, rankSnapshotAgents, terminalVerdict } from "./read-model.js";
import { bootstrapTheme } from "./theme-storage.js";
import { parseCanonicalLiveSnapshot } from "../../src/control-plane/contracts/snapshot.js";
import { CONTROL_PLANE_META_CAPABILITY } from "../../src/control-plane/contracts/capability-taxonomy.js";

describe("fail-closed control-plane projections", () => {
  function forgedCleanProjection(): Record<string, unknown> {
    const forged = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    const cleanFlow = { starting_real_issues: 0, discovered_preexisting: 0, caused_by_remediation: 0, concurrently_introduced: 0, paid: 0, invalidated_false_positives: 0, classification_correction_delta: 0, ending_real_issues: 0, boundary_blocked: 0 };
    forged.current_flow = cleanFlow;
    const current = (forged.runs as Record<string, unknown>[]).find((run) => run.run_id === forged.current_run_id)!;
    current.debt_flow = cleanFlow;
    current.terminal_verdict = "CLEAN";
    forged.terminal_contract = {
      ...(forged.terminal_contract as Record<string, unknown>),
      declared_verdict: "CLEAN",
      contract: Object.fromEntries(Object.keys((forged.terminal_contract as Record<string, unknown>).contract as Record<string, unknown>).map((key) => [key, true])),
    };
    return forged;
  }

  it("never derives CLEAN from a zero issue count without every explicit terminal binding", () => {
    const snapshot = { ...demoSnapshot, current_flow: { ...demoSnapshot.current_flow, starting_real_issues: 0, paid: 0, ending_real_issues: 0, boundary_blocked: 0 }, terminal_contract: { ...demoSnapshot.terminal_contract, declared_verdict: "CLEAN" as const } };
    expect(terminalVerdict(snapshot).verdict).toBe("NOT_CLEAN");
  });
  it("rejects a forged CLEAN projection when the bound current run is not CLEAN", () => {
    const forged = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    const cleanFlow = { starting_real_issues: 0, discovered_preexisting: 0, caused_by_remediation: 0, concurrently_introduced: 0, paid: 0, invalidated_false_positives: 0, classification_correction_delta: 0, ending_real_issues: 0, boundary_blocked: 0 };
    forged.current_flow = cleanFlow;
    forged.terminal_contract = {
      ...(forged.terminal_contract as Record<string, unknown>),
      declared_verdict: "CLEAN",
      contract: Object.fromEntries(Object.keys((forged.terminal_contract as Record<string, unknown>).contract as Record<string, unknown>).map((key) => [key, true])),
    };
    const current = (forged.runs as Record<string, unknown>[]).find((run) => run.run_id === forged.current_run_id)!;
    current.debt_flow = cleanFlow;
    expect(() => parseCanonicalLiveSnapshot(forged, { allow_demo: true })).toThrow(/current run is not CLEAN/);
    expect(() => parseSnapshot(forged)).toThrow(/current run is not CLEAN/);
  });
  it("rejects CLEAN when current issue sets or canonical issue states remain payable", () => {
    const staleCurrentSets = forgedCleanProjection();
    for (const issue of staleCurrentSets.issues as Record<string, unknown>[]) issue.state = "paid";
    expect(() => parseCanonicalLiveSnapshot(staleCurrentSets, { allow_demo: true })).toThrow(/current run issue sets/i);
    expect(() => parseSnapshot(staleCurrentSets)).toThrow(/current run issue sets/i);

    const payableCanonicalIssues = forgedCleanProjection();
    expect(() => parseCanonicalLiveSnapshot(payableCanonicalIssues, { allow_demo: true })).toThrow(/CLEAN requires empty current run issue sets/i);
    expect(() => parseSnapshot(payableCanonicalIssues)).toThrow(/CLEAN requires empty current run issue sets/i);
  });
  it("reconciles every current, projected, and historical debt flow", () => {
    const increaseEndingDebt = (flow: Record<string, unknown>): void => {
      if (typeof flow.ending_real_issues !== "number") throw new Error("fixture debt flow is malformed");
      flow.ending_real_issues += 1;
    };
    const cases: readonly [(snapshot: Record<string, unknown>) => void, string][] = [
      [(snapshot) => { increaseEndingDebt(snapshot.previous_flow as Record<string, unknown>); }, "previous flow"],
      [(snapshot) => { increaseEndingDebt(snapshot.first_flow as Record<string, unknown>); }, "first flow"],
      [(snapshot) => { increaseEndingDebt((snapshot.runs as Record<string, unknown>[])[0]!.debt_flow as Record<string, unknown>); }, "historical run flow"],
      [(snapshot) => {
        const flow = snapshot.current_flow as Record<string, unknown>;
        if (typeof flow.ending_real_issues !== "number") throw new Error("fixture debt flow is malformed");
        flow.boundary_blocked = flow.ending_real_issues + 1;
        const current = (snapshot.runs as Record<string, unknown>[]).find((run) => run.run_id === snapshot.current_run_id)!;
        current.debt_flow = structuredClone(flow);
      }, "boundary-blocked flow"],
    ];
    for (const [forge, label] of cases) {
      const forged = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
      forge(forged);
      expect(() => parseCanonicalLiveSnapshot(forged, { allow_demo: true }), `canonical parser accepted ${label}`).toThrow(/debt flow/i);
      expect(() => parseSnapshot(forged), `browser parser accepted ${label}`).toThrow(/debt flow/i);
    }
  });
  it("marks selection mismatch unbound even when a manifest exists", () => {
    const manifest = { manifest_id: "manifest-1", revision: 1, digest: "a".repeat(64), projection_digest: "b".repeat(64), subject: demoSnapshot.current_subject, authority_mode: "ADVISE" as const, target_ref: "main", expected_target_commit: "demo-commit", issue_graph: { issue_graph_id: "graph-1", version: 1, digest: "c".repeat(64) }, selected_issue_ids: ["MC-101"], lanes: [], directive_id: "directive-1", directive_state: "projected" as const, receipt_boundary: "receipt" };
    expect(manifestBinding({ ...demoSnapshot, manifest }, ["MC-102"]).bound).toBe(false);
  });
  it("rejects partial snapshots rather than rendering a plausible fragment", () => {
    expect(() => parseSnapshot({ source: "live" })).toThrow("missing field");
  });
  it("keeps the strict snapshot parser idempotent across its JSON wire boundary", () => {
    const once = parseCanonicalLiveSnapshot(structuredClone(demoSnapshot), { allow_demo: true });
    const twice = parseCanonicalLiveSnapshot(once, { allow_demo: true });
    const transported = parseCanonicalLiveSnapshot(JSON.parse(JSON.stringify(once)), { allow_demo: true });
    expect(twice).toEqual(once);
    expect(transported).toEqual(once);
    expect(Object.keys(once).sort()).toEqual([
      "agents", "capabilities", "complexity", "current_authority", "current_flow", "current_observation", "current_run_id",
      "current_subject", "detector_coverage", "evidence_freshness", "first_flow", "issues", "manifest",
      "previous_flow", "repository", "runs", "source", "source_label", "terminal_contract",
    ].sort());
  });
  it("rejects non-schema complexity aliases and unreconciled surface accounting", () => {
    const alias = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    (alias.complexity as Record<string, unknown>).tests_docs_assets = { bytes: 1, lines: 1, files: 1 };
    expect(() => parseCanonicalLiveSnapshot(alias, { allow_demo: true })).toThrow(/tests_docs_assets|unrecognized/i);
    expect(() => parseSnapshot(alias)).toThrow(/tests_docs_assets|unrecognized/i);

    const unreconciled = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    ((unreconciled.complexity as Record<string, unknown>).public_documentation as Record<string, unknown>).bytes = 50001;
    expect(() => parseCanonicalLiveSnapshot(unreconciled, { allow_demo: true })).toThrow(/categories do not reconcile/i);
    expect(() => parseSnapshot(unreconciled)).toThrow(/categories do not reconcile/i);

    const ignored = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    ((((ignored.complexity as Record<string, unknown>).ignored_live as Record<string, unknown>).other as Record<string, unknown>).files as number) = 11;
    expect(() => parseCanonicalLiveSnapshot(ignored, { allow_demo: true })).toThrow(/ignored-live files classes do not reconcile/i);
    expect(() => parseSnapshot(ignored)).toThrow(/ignored-live files classes do not reconcile/i);
  });
  it("preserves the legal nullable terminal contract identically at canonical and browser boundaries", () => {
    const nullable = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    nullable.terminal_contract = { declared_verdict: null, subject: null, contract: null, evidence: [] };
    const canonical = parseCanonicalLiveSnapshot(nullable, { allow_demo: true });
    const browser = parseSnapshot(nullable);
    expect(browser.terminal_contract).toEqual(canonical.terminal_contract);
    expect(browser.terminal_contract).toEqual({ declared_verdict: null, subject: null, contract: null, evidence: [] });

    const malformed = structuredClone(nullable) as Record<string, unknown>;
    (malformed.terminal_contract as Record<string, unknown>).contract = {};
    expect(() => parseCanonicalLiveSnapshot(malformed, { allow_demo: true })).toThrow(/terminal_contract\.contract/u);
    expect(() => parseSnapshot(malformed)).toThrow(/terminal_contract\.contract/u);
  });
  it("rejects a partial receipt relabeled as a repository object", () => {
    const partial = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    partial.source = "live";
    partial.current_observation = { kind: "PARTIAL", evidence_binding: { kind: "OBSERVATION_RECEIPT", sha256: "a".repeat(64) }, current_debt_flow: "UNKNOWN", remediation_no_harm: "UNKNOWN", live_topology: "UNKNOWN", current_complexity: "UNKNOWN" };
    (partial.current_subject as Record<string, unknown>).repository_object_sha256 = "a".repeat(64);
    const current = (partial.runs as Record<string, unknown>[]).find((run) => run.run_id === partial.current_run_id)!;
    (current.subject as Record<string, unknown>).repository_object_sha256 = "a".repeat(64);
    partial.manifest = null;
    partial.terminal_contract = { declared_verdict: null, subject: null, contract: null, evidence: [] };
    expect(() => parseSnapshot(partial)).toThrow(/partial observation requires a receipt binding/i);
  });
  it("rejects a partial current-surface claim, OPERATE authority, and live historical tuple", () => {
    const partial = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    partial.source = "live";
    partial.current_observation = { kind: "PARTIAL", evidence_binding: { kind: "OBSERVATION_RECEIPT", sha256: "a".repeat(64) }, current_debt_flow: "UNKNOWN", remediation_no_harm: "UNKNOWN", live_topology: "UNKNOWN", current_complexity: "UNKNOWN" };
    (partial.current_subject as Record<string, unknown>).repository_object_sha256 = null;
    const current = (partial.runs as Record<string, unknown>[]).find((run) => run.run_id === partial.current_run_id)!;
    (current.subject as Record<string, unknown>).repository_object_sha256 = null;
    partial.manifest = null;
    partial.terminal_contract = { declared_verdict: null, subject: null, contract: null, evidence: [] };
    (partial.complexity as Record<string, unknown>).availability = "UNKNOWN";
    (partial.complexity as Record<string, unknown>).object_sha256 = null;
    partial.current_authority = "OPERATE";
    expect(() => parseSnapshot(partial)).toThrow(/partial observation is ADVISE-only/i);
    partial.current_authority = "ADVISE";
    (partial.agents as Record<string, unknown>[])[0]!.available = true;
    expect(() => parseSnapshot(partial)).toThrow(/partial observation cannot claim current availability/i);
    for (const agent of partial.agents as Record<string, unknown>[]) {
      agent.available = false;
      agent.active_in_repository = false;
    }
    (partial.current_observation as Record<string, unknown>).live_topology = "MEASURED";
    expect(() => parseSnapshot(partial)).toThrow(/partial observation cannot establish current debt, no-harm, topology, or complexity/i);
  });
  it("rejects protocol meta-capabilities and forged repository capability definitions", () => {
    const meta = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    (meta.capabilities as Record<string, unknown>[])[0] = structuredClone(CONTROL_PLANE_META_CAPABILITY) as unknown as Record<string, unknown>;
    expect(() => parseCanonicalLiveSnapshot(meta, { allow_demo: true })).toThrow(/capabilities/u);
    expect(() => parseSnapshot(meta)).toThrow(/capabilities/u);

    const forged = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    (forged.capabilities as Record<string, unknown>[])[0]!.label = "Forged label";
    expect(() => parseCanonicalLiveSnapshot(forged, { allow_demo: true })).toThrow(/canonical taxonomy/u);
    expect(() => parseSnapshot(forged)).toThrow(/canonical taxonomy/u);
  });
  it("rejects uppercase digests instead of admitting a second noncanonical spelling", () => {
    const forged = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    (forged.current_subject as Record<string, unknown>).repository_object_sha256 = "A".repeat(64);
    expect(() => parseCanonicalLiveSnapshot(forged, { allow_demo: true })).toThrow(/lowercase|invalid string/i);
    expect(() => parseSnapshot(forged)).toThrow(/lowercase|invalid string/i);
  });
  it("rejects the same forged nested records at the shared and browser boundaries", () => {
    const cases: readonly [(snapshot: Record<string, unknown>) => void, string][] = [
      [(snapshot) => { (snapshot.agents as Record<string, unknown>[])[0]!.available = "yes"; }, "agent"],
      [(snapshot) => { (snapshot.issues as Record<string, unknown>[])[0]!.severity = 6; }, "issue"],
      [(snapshot) => { const run = (snapshot.runs as Record<string, unknown>[])[3]!; run.subject = { ...(run.subject as Record<string, unknown>), repository_object_sha256: "0".repeat(64) }; }, "run"],
      [(snapshot) => { if (snapshot.manifest === null) snapshot.manifest = { revision: 0 }; else (snapshot.manifest as Record<string, unknown>).revision = 0; }, "manifest"],
      [(snapshot) => { ((snapshot.complexity as Record<string, unknown>).authored_source as Record<string, unknown>).bytes = -1; }, "complexity"],
    ];
    for (const [forge, label] of cases) {
      const forged = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
      forge(forged);
      let canonicalRejected = false;
      try { parseCanonicalLiveSnapshot(forged, { allow_demo: true }); } catch { canonicalRejected = true; }
      expect(canonicalRejected, `canonical parser accepted forged ${label}`).toBe(true);
      expect(() => parseSnapshot(forged), `browser parser accepted forged ${label}`).toThrow();
    }
  });
  it("rejects cross-field identity and accounting forgeries at both boundaries", () => {
    const manifest = {
      manifest_id: "manifest-1", revision: 1, digest: "a".repeat(64), projection_digest: "b".repeat(64), subject: demoSnapshot.current_subject,
      authority_mode: "ADVISE" as const, target_ref: "main", expected_target_commit: "demo-commit",
      issue_graph: { issue_graph_id: "graph-1", version: 1, digest: "c".repeat(64) }, selected_issue_ids: ["UNKNOWN-ISSUE"], lanes: [],
      directive_id: "directive-1", directive_state: "projected" as const, receipt_boundary: "receipt",
    };
    const cases: readonly [(snapshot: Record<string, unknown>) => void, RegExp][] = [
      [(snapshot) => { const agents = snapshot.agents as Record<string, unknown>[]; snapshot.agents = [...agents, agents[0]]; }, /duplicate agent_tuple_id/],
      [(snapshot) => { snapshot.manifest = manifest; }, /unknown issue ID/],
      [(snapshot) => { snapshot.manifest = { ...manifest, selected_issue_ids: [] as string[], authority_mode: "OPERATE" as const }; }, /current_authority/],
      [(snapshot) => { const run = (snapshot.runs as Record<string, unknown>[]).find((value) => value.run_id === snapshot.current_run_id)!; const flow = { ...(run.debt_flow as Record<string, unknown>), paid: 211, ending_real_issues: 6 }; run.debt_flow = flow; }, /current_flow/],
    ];
    for (const [forge, message] of cases) {
      const forged = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
      forge(forged);
      expect(() => parseCanonicalLiveSnapshot(forged, { allow_demo: true })).toThrow(message);
      expect(() => parseSnapshot(forged)).toThrow(message);
    }
  });
  it("cycles capability selection through 1, 2, 3, then off", () => {
    expect([0, 1, 2, 3].map(cycleCapabilityWeight)).toEqual([1, 2, 3, 0]);
  });
  it("keeps historically qualified global tuples rankable while marking an unbound current route ineligible for dispatch", () => {
    const agents = demoSnapshot.agents.map((agent) => agent.agent_tuple_id === "tuple-glm-pi-high" ? { ...agent, execution_identity: { ...agent.execution_identity, disposition: "IDENTITY_UNBOUND" as const, last_external_verification_at: null, evidence: [] } } : agent);
    const result = rankSnapshotAgents(agents, [{ capability_id: "planning_projection_reconciliation", weight: 3 }]);
    expect(result.ranked.map((item) => item.agent.agent_tuple_id)).toContain("tuple-glm-pi-high");
    expect(result.ranked.find((item) => item.agent.agent_tuple_id === "tuple-glm-pi-high")?.agent.execution_identity.disposition).toBe("IDENTITY_UNBOUND");
  });

  it("keeps the quality-derived runner card distinct from the manifest assignment and bound to an exact execution recipe", () => {
    const fixture = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    const agent = (fixture.agents as Record<string, unknown>[])[0]!;
    const issue = (fixture.issues as Record<string, unknown>[])[0]!;
    const recommendation = issue.runner_recommendation as Record<string, unknown>;
    const snapshot = parseSnapshot(fixture);
    const projection = issueRunnerRecommendation(snapshot, snapshot.issues[0]!.issue_id);
    expect(projection.manifest_assigned_tuple_id).toBe(snapshot.issues[0]!.recommended_tuple);
    expect(projection.required_capabilities).toEqual(snapshot.issues[0]!.runner_recommendation.required_capabilities);
    expect(projection.quality_runner).toMatchObject({ agent_tuple_id: agent.agent_tuple_id, model: agent.model, harness: agent.harness, reasoning_level: agent.reasoning_level });
    expect(snapshot.current_authority).toBe("ADVISE");

    (recommendation.runner_card as Record<string, unknown>).harness = "forged harness";
    expect(() => parseSnapshot(fixture)).toThrow(/runner_card.*identity/i);

    const profileForged = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    const profileCard = (((profileForged.issues as Record<string, unknown>[])[0]!.runner_recommendation as Record<string, unknown>).runner_card as Record<string, unknown>);
    profileCard.profile_fingerprint_sha256 = "0".repeat(64);
    expect(() => parseSnapshot(profileForged)).toThrow(/runner_card.*execution profile/i);
  });

  it("does not turn a profile-unknown quality candidate into a runnable runner card", () => {
    const fixture = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    const agents = fixture.agents as Record<string, unknown>[];
    const recommendations = (fixture.issues as Record<string, unknown>[]).map((issue) => issue.runner_recommendation as Record<string, unknown>);
    for (const agent of agents) agent.execution_profile = null;
    for (const recommendation of recommendations) recommendation.runner_card = null;
    expect(() => parseSnapshot(fixture)).not.toThrow();
  });

  it("rejects a runner card that is offline, unqualified, non-top-ranked, or score-forged", () => {
    const assignmentMismatch = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    (((assignmentMismatch.issues as Record<string, unknown>[])[0]!.runner_recommendation as Record<string, unknown>).provenance as Record<string, unknown>).manifest_assignment_agent_tuple_id = "forged-manifest-assignment";
    expect(() => parseSnapshot(assignmentMismatch)).toThrow(/provenance.*manifest assignment/i);

    const offline = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    const offlineAgent = (offline.agents as Record<string, unknown>[])[0]!;
    offlineAgent.available = false;
    offlineAgent.availability = "offline";
    expect(() => parseSnapshot(offline)).toThrow(/deterministic eligible recommendation/i);

    const scoreForged = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    const category = ((((scoreForged.issues as Record<string, unknown>[])[0]!.runner_recommendation as Record<string, unknown>).runner_card as Record<string, unknown>).category_scores as Record<string, unknown>[])[0]!;
    category.weighted_score = 0.999;
    expect(() => parseSnapshot(scoreForged)).toThrow(/weighted scores/i);
  });

  it("rejects a caller-forged qualification that lacks the policy trial threshold", () => {
    const forged = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    const score = ((forged.agents as Record<string, unknown>[])[0]!.capability_scores as Record<string, unknown>[])[0]!;
    score.qualification = "Production_cleared";
    score.verified_trials = 12;
    expect(() => parseCanonicalLiveSnapshot(forged, { allow_demo: true })).toThrow(/ledger provenance|threshold/);
    expect(() => parseSnapshot(forged)).toThrow(/ledger provenance|threshold/);
  });

  it("rejects caller-provided identity labels as performance attribution without a ledger projection", () => {
    const forged = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    const agent = (forged.agents as Record<string, unknown>[])[2]!;
    (agent.metrics as Record<string, unknown>).verified_success_rate = 0.99;
    expect(() => parseSnapshot(forged)).toThrow(/performance attribution/);
  });
  it("falls back safely when the localStorage getter throws during first-paint bootstrap", () => {
    const dataset: DOMStringMap = {};
    const windowLike = { get localStorage(): Storage { throw new Error("blocked"); } } as Window;
    expect(bootstrapTheme(windowLike, { dataset })).toBe("voltage");
    expect(dataset.style).toBe("voltage");
  });
});
