import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import { parseCanonicalLiveSnapshot } from "../../src/control-plane/contracts/snapshot.js";
import App from "./App.svelte";
import { demoSnapshot } from "./fixture.js";

const zeroFlow = {
  starting_real_issues: 0,
  discovered_preexisting: 0,
  caused_by_remediation: 0,
  concurrently_introduced: 0,
  paid: 0,
  invalidated_false_positives: 0,
  classification_correction_delta: 0,
  ending_real_issues: 0,
  boundary_blocked: 0,
} as const;

const zeroSnapshot = parseCanonicalLiveSnapshot({
  ...demoSnapshot,
  source: "live",
  source_label: "VALID EMPTY LIVE SNAPSHOT",
  current_observation: { kind: "FULL_MISTER_CLEAN_RUN", evidence_binding: { kind: "REPOSITORY_OBJECT", sha256: demoSnapshot.current_subject.repository_object_sha256 }, current_debt_flow: "MEASURED", remediation_no_harm: "MEASURED", live_topology: "MEASURED", current_complexity: "UNKNOWN" },
  current_flow: zeroFlow,
  previous_flow: null,
  first_flow: null,
  issues: [],
  agents: [],
  runs: [{
    ...demoSnapshot.runs.at(-1)!,
    debt_flow: zeroFlow,
    real_issue_ids: [],
    known_now_issue_ids: [],
    false_positive_issue_ids: [],
    terminal_verdict: "NOT_CLEAN",
    note: "No issue or evaluation evidence is present; cleanliness remains unestablished.",
  }],
  complexity: {
    availability: "UNKNOWN",
    object_sha256: null,
    repository_object_total: { bytes: 0, lines: 0, files: 0 },
    tracked_object: { bytes: 0, lines: 0, files: 0 },
    untracked_nonignored: { bytes: 0, lines: 0, files: 0 },
    authored_source: { bytes: 0, lines: 0, files: 0 },
    tests: { bytes: 0, lines: 0, files: 0 },
    public_documentation: { bytes: 0, lines: 0, files: 0 },
    planning_documentation: { bytes: 0, lines: 0, files: 0 },
    generated_shippable: { bytes: 0, lines: 0, files: 0 },
    config_tooling: { bytes: 0, lines: 0, files: 0 },
    evidence_research: { bytes: 0, lines: 0, files: 0 },
    dependencies_assets: { bytes: 0, lines: 0, files: 0 },
    ignored_live: {
      availability: "UNKNOWN", observed_at: null, subject_relation: "outside_repository_object",
      total: { bytes: 0, lines: 0, files: 0 }, dependencies: { bytes: 0, lines: 0, files: 0 },
      build_cache: { bytes: 0, lines: 0, files: 0 }, local_evidence: { bytes: 0, lines: 0, files: 0 }, other: { bytes: 0, lines: 0, files: 0 },
    },
    docs_to_authored_code: { bytes: null, lines: null, files: null },
    structural_coverage: "NOT MEASURED",
    limitations: ["No complexity observation is bound to this repository object."],
    functions: { p50: null, p95: null, max: null, cyclomatic_p95: null },
    cycles: [],
    hotspots: [],
    trend: [],
    repository_size_history: [],
  },
  manifest: null,
  terminal_contract: { declared_verdict: null, subject: null, contract: null, evidence: [] },
  current_authority: "ADVISE",
  detector_coverage: "UNKNOWN",
  evidence_freshness: "UNKNOWN",
});

const partialSnapshot = parseCanonicalLiveSnapshot({
  ...demoSnapshot,
  source: "live",
  source_label: "PARTIAL OBSERVATION — NOT A FRESH MISTER CLEAN RUN",
  current_subject: { ...demoSnapshot.current_subject, repository_object_sha256: null },
  current_observation: { kind: "PARTIAL", evidence_binding: { kind: "OBSERVATION_RECEIPT", sha256: "a".repeat(64) }, current_debt_flow: "UNKNOWN", remediation_no_harm: "UNKNOWN", live_topology: "UNKNOWN", current_complexity: "UNKNOWN" },
  issues: demoSnapshot.issues.map((issue) => ({ ...issue, state: issue.issue_id === "MC-101" ? "paid" as const : issue.state, runner_recommendation: { ...issue.runner_recommendation, runner_card: null } })),
  agents: demoSnapshot.agents.map((agent) => ({ ...agent, available: false, availability: "unknown" as const, active_in_repository: false, role: `HISTORICAL INVENTORY ONLY — ${agent.role}` })),
  runs: demoSnapshot.runs.map((run) => run.run_id === demoSnapshot.current_run_id ? { ...run, subject: { ...run.subject, repository_object_sha256: null }, real_issue_ids: [], known_now_issue_ids: [], false_positive_issue_ids: [] } : run),
  complexity: { ...demoSnapshot.complexity, availability: "UNKNOWN", object_sha256: null },
  manifest: null,
  terminal_contract: { declared_verdict: null, subject: null, contract: null, evidence: [] },
  evidence_freshness: "Partial receipt only; no current census.",
}, { allow_demo: true });

const views = [
  ["Progress / Command", "Are we moving closer?", "UNKNOWN"],
  ["Issues / Remediation", "Remediation workbench", "No issue roots are recorded"],
  ["Agent Finder", "Find the best agent for", "Choose at least one capability"],
  ["Team Roster", "Seats, readiness, and evidence", "No agent tuples are recorded"],
  ["Raw Agent Inventory", "All observed agent tuples", "No machine-local roster has been imported"],
  ["Run History", "What changed", "No issue or evaluation evidence is present"],
  ["System / Method", "A local control plane", "NOT MEASURED"],
] as const;

describe("valid zero-data control-plane snapshot", () => {
  for (const [view, heading, honestState] of views) {
    it(`renders ${view} without inferring evidence`, () => {
      const { body } = render(App, { props: { initialSnapshot: zeroSnapshot, initialView: view } });
      expect(body).toContain(heading);
      expect(body).toContain(honestState);
      expect(body).not.toContain("Evidence could not be read");
    });
  }

  it("keeps all seven views in one product shell", () => {
    const { body } = render(App, { props: { initialSnapshot: zeroSnapshot } });
    for (const [view] of views) expect(body).toContain(view);
    expect((body.match(/class="nav-button"/gu) ?? []).length).toBe(14);
  });

  it("does not render unknown complexity counts as measured zeroes", () => {
    const { body } = render(App, { props: { initialSnapshot: zeroSnapshot, initialView: "Progress / Command" } });
    expect(body).toContain("<strong>UNKNOWN</strong><span>Tracked object bytes</span>");
    expect(body).toContain("Ignored-live classes · UNKNOWN");
    expect(body).toContain("Longitudinal complexity is NOT MEASURED");
  });

  it("renders a partial receipt observation without green no-harm, live-zero topology, or debt bars", () => {
    const { body } = render(App, { props: { initialSnapshot: partialSnapshot, initialView: "Progress / Command" } });
    expect(body).toContain("Partial current observation");
    expect(body).toContain("No-harm: NOT ESTABLISHED");
    expect(body).toContain("NOT OBSERVED");
    expect(body).toContain("Debt-flow magnitudes are withheld");
    expect(body).not.toContain("debt-track");
    expect(body).not.toContain("No-harm: holding");
  });

  it("labels receipt evidence and retains historical roster records without a live claim", () => {
    const { body } = render(App, { props: { initialSnapshot: partialSnapshot, initialView: "System / Method" } });
    expect(body).toContain("Observation receipt digest — not repository object hash");
    expect(body).toContain("Historical inventory retained; current availability and identity NOT REVERIFIED");
  });
});
