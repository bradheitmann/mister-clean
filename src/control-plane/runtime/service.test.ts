import { describe, expect, it } from "vitest";

import type {
  ControlSurfaceId,
  DirectiveId,
  IsoTimestamp,
  ManifestId,
  ReceiptId,
  RepositoryId,
  RunId,
  Sha256,
} from "../contracts/primitives.js";
import type {
  DirectiveState,
  ManifestRevision,
  RemediationWaveManifest,
} from "../contracts/wave-directive.js";
import type { RuntimeBoundReceipt } from "./authority.js";
import type { AuthorityEvidenceVerifier } from "./evidence.js";
import {
  CONTROL_PLANE_PROTOCOL_VERSION,
  ControlPlaneFault,
  type AgentView,
  type ControlPlaneRequest,
  type DirectiveEventView,
  type IssueView,
  type RunView,
} from "./protocol.js";
import {
  ControlPlaneService,
  type DirectiveAppendResult,
  type RepositoryControlPlaneStore,
  type RouteAdmissionPort,
} from "./service.js";
import type { AuthorizedDirectiveAppendRequest } from "./transition-seal.js";

const sha = (character: string): Sha256 => character.repeat(64) as Sha256;
const runId = "run-1" as RunId;
const manifestId = "manifest-1" as ManifestId;
const directiveId = "directive-1" as DirectiveId;
const surfaceId = "surface-1" as ControlSurfaceId;
const now = "2026-08-26T12:00:00.000Z" as IsoTimestamp;

function manifest(authorityMode: "ADVISE" | "OPERATE" = "OPERATE"): ManifestRevision {
  const canonical: RemediationWaveManifest = {
    record_type: "mister-clean.action-manifest",
    schema_version: "1.3",
    manifest_kind: "remediation_wave",
    manifest_id: manifestId,
    revision: 1,
    parent_manifest_sha256: null,
    run_id: runId,
    created_at: now,
    created_by: "manifest-author",
    authority_mode: authorityMode,
    repository: {
      repository_id: "repository-1" as RepositoryId,
      branch: "work",
      commit: "abc",
      tree: "def",
      repository_object_sha256: sha("a"),
      observed_at: now,
    },
    target_ref: "refs/heads/work",
    expected_target_commit: "abc",
    detector_set_sha256: sha("b"),
    policy_sha256: sha("c"),
    issue_graph: { issue_graph_id: "graph-1" as never, version: 1, sha256: sha("d") },
    selected_issue_ids: [],
    optimization: {
      policy_id: "policy-1",
      severity_weight: 1,
      difficulty_weight: 1,
      unlock_value_weight: 0,
      regression_risk_weight: 1,
      cost_tiebreak: false,
      speed_tiebreak: false,
      overrides: [],
    },
    waves: [],
    lanes: [],
    parent_operation_ids: [],
    no_harm_comparators: [],
    native_gates: [],
    rollback: [],
    receipt_requirements: [{ role: "holdout", independent: true, required_claims: ["verified"] }],
    projections: [],
    terminal_issue_dispositions: [],
    hard_boundaries: [],
    excluded_actions: [],
    self_audit: {
      status: "passed",
      checked_at: now,
      evidence: [{ path: "self-audit.json", sha256: sha("e") }],
    },
  };
  return {
    manifest_id: manifestId,
    revision: 1,
    parent_manifest_sha256: null,
    canonical_manifest: canonical,
    manifest_sha256: sha("f"),
  };
}

function receipt(actor = "holdout-agent"): RuntimeBoundReceipt {
  return {
    receipt_id: "receipt-1" as ReceiptId,
    state: "verified",
    run_id: runId,
    manifest_id: manifestId,
    manifest_revision: 1,
    manifest_sha256: sha("f"),
    baseline_repository: manifest().canonical_manifest.repository,
    output_repository: { ...manifest().canonical_manifest.repository, repository_object_sha256: sha("9") },
    role: "holdout",
    actor,
    claims: ["verified"],
    conclusion: "pass",
    sealed_at: now,
    evidence: [{ path: "holdout.json", sha256: sha("1") }],
  };
}

class FakeStore implements RepositoryControlPlaneStore {
  readonly global_inventory_available = false;
  revision = manifest();
  currentState: DirectiveState | null = null;
  readonly receipts = new Map<string, RuntimeBoundReceipt>();
  appendCalls = 0;
  readonly events: DirectiveEventView[] = [];

  async getRun(): Promise<RunView | null> { return null; }
  async getManifest(): Promise<ManifestRevision | null> { return this.revision; }
  async getManifestHead(): Promise<ManifestRevision | null> { return this.revision; }
  async listIssues(): Promise<readonly IssueView[]> { return []; }
  async listAgents(): Promise<readonly AgentView[]> { return []; }
  async listPendingEvaluationInvocations() { return { pending_count: 0, invocations: [] } as const; }
  async listDirectiveEvents(): Promise<readonly DirectiveEventView[]> { return this.events; }
  async getReceipt(receiptId: ReceiptId): Promise<RuntimeBoundReceipt | null> { return this.receipts.get(receiptId) ?? null; }
  async getClosingRepositoryObject() { return { repository: { ...manifest().canonical_manifest.repository, repository_object_sha256: sha("9") }, evidence: [] }; }

  async appendDirectiveEvent(request: AuthorizedDirectiveAppendRequest): Promise<DirectiveAppendResult> {
    this.appendCalls += 1;
    if (this.currentState !== request.expected_state) throw new ControlPlaneFault("CONFLICT", "test CAS conflict");
    this.currentState = request.event.to_state;
    const event: DirectiveEventView = {
      sequence: this.events.length + 1,
      directive_id: request.event.directive_id,
      run_id: request.run_id,
      manifest_id: request.event.manifest_id,
      manifest_revision: request.event.manifest_revision,
      manifest_sha256: request.event.manifest_sha256,
      from_state: request.event.from_state,
      to_state: request.event.to_state,
      control_surface_id: request.control_surface_id,
      occurred_at: request.event.occurred_at,
      evidence: request.event.evidence.map((item) => ({
        path: item.path,
        sha256: item.sha256,
        record_type: item.record_type ?? null,
      })),
      receipt_ids: request.receipt_ids,
    };
    this.events.push(event);
    return { sequence: event.sequence, event };
  }
}

function transition(
  expectedState: DirectiveState | null,
  toState: DirectiveState,
  overrides: Partial<Extract<ControlPlaneRequest, { name: "directive.transition" }>["input"]> = {},
): Extract<ControlPlaneRequest, { name: "directive.transition" }> {
  return {
    version: CONTROL_PLANE_PROTOCOL_VERSION,
    request_id: `request-${toState}`,
    kind: "command",
    name: "directive.transition",
    input: {
      directive_id: directiveId,
      run_id: runId,
      manifest_id: manifestId,
      manifest_revision: 1,
      manifest_sha256: sha("f"),
      expected_state: expectedState,
      to_state: toState,
      control_surface_id: null,
      evidence: [],
      receipt_ids: [],
      ...overrides,
    },
  };
}

describe("local ControlPlane command/query boundary", () => {
  const evidenceVerifier: AuthorityEvidenceVerifier = {
    configured: true,
    async verifyDirective(request) { return request.evidence.map((item) => item.record_type === null ? { path: item.path, sha256: item.sha256 } : { path: item.path, sha256: item.sha256, record_type: item.record_type }); },
    async verifyReceipt(request) { return request.receipt.evidence; },
  };
  it("rejects secret-bearing payloads before the store is called", async () => {
    const store = new FakeStore();
    const service = new ControlPlaneService({ store, clock: () => now });
    const secretField = ["api", "key"].join("_");
    const response = await service.handle({
      version: "1",
      request_id: "secret-test",
      kind: "query",
      name: "health",
      input: { nested: { [secretField]: "must-not-cross" } },
    });
    expect(response).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    expect(JSON.stringify(response)).not.toContain("must-not-cross");
    expect(store.appendCalls).toBe(0);
  });

  it("fails closed when an ADVISE manifest attempts to queue work", async () => {
    const store = new FakeStore();
    store.revision = manifest("ADVISE");
    store.currentState = "projected";
    const admission: RouteAdmissionPort = {
      configured: true,
      async admit() { return { admitted: true, reason: "test", evidence: [{ path: "route.json", sha256: sha("2") }] }; },
    };
    const service = new ControlPlaneService({ store, route_admission: admission, clock: () => now });
    const response = await service.handle(transition("projected", "queued", { control_surface_id: surfaceId }));
    expect(response).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(store.appendCalls).toBe(0);
  });

  it("requires evidence-bound admission and carries that evidence into a queued event", async () => {
    const store = new FakeStore();
    store.currentState = "projected";
    const admission: RouteAdmissionPort = {
      configured: true,
      async admit() { return { admitted: true, reason: "route live", evidence: [{ path: "route.json", sha256: sha("2") }] }; },
    };
    const service = new ControlPlaneService({ store, route_admission: admission, evidence_verifier: evidenceVerifier, clock: () => now });
    const response = await service.handle(transition("projected", "queued", { control_surface_id: surfaceId }));
    expect(response).toMatchObject({ ok: true, result: { state: "queued", sequence: 1 } });
    expect(store.events[0]?.evidence).toEqual([{ path: "route.json", sha256: sha("2"), record_type: null }]);
  });

  it("uses expected state as a compare-and-swap guard", async () => {
    const store = new FakeStore();
    const service = new ControlPlaneService({ store, evidence_verifier: evidenceVerifier, clock: () => now });
    expect(await service.handle(transition(null, "recommended"))).toMatchObject({ ok: true });
    const stale = await service.handle(transition(null, "recommended"));
    expect(stale).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(store.currentState).toBe("recommended");
  });

  it("denies caller-invented delivery evidence when no evidence authority is configured", async () => {
    const store = new FakeStore();
    store.currentState = "queued";
    const service = new ControlPlaneService({ store, clock: () => now });
    const response = await service.handle(transition("queued", "delivered", {
      control_surface_id: surfaceId,
      evidence: [{ path: "invented.json", sha256: sha("7"), record_type: "mister-clean.directive-state-evidence" }],
    }));
    expect(response).toMatchObject({ ok: false, error: { code: "PRECONDITION_FAILED" } });
    expect(store.appendCalls).toBe(0);
  });

  it("requires an independent verified receipt for terminal verification", async () => {
    const store = new FakeStore();
    store.currentState = "completed";
    store.receipts.set("receipt-1", receipt("manifest-author"));
    const service = new ControlPlaneService({ store, evidence_verifier: evidenceVerifier, clock: () => now });
    const command = transition("completed", "verified", {
      receipt_ids: ["receipt-1" as ReceiptId],
      evidence: [],
    });
    expect(await service.handle(command)).toMatchObject({ ok: false, error: { code: "PRECONDITION_FAILED" } });
    store.receipts.set("receipt-1", { ...receipt(), run_id: "run-other" as RunId });
    expect(await service.handle(command)).toMatchObject({ ok: false, error: { code: "PRECONDITION_FAILED" } });
    store.receipts.set("receipt-1", receipt());
    expect(await service.handle(command)).toMatchObject({ ok: true, result: { state: "verified" } });
  });

  it("requires every receipt role and claim and binds receipts to the closing object", async () => {
    const store = new FakeStore();
    store.currentState = "completed";
    const base = manifest();
    store.revision = {
      ...base,
      canonical_manifest: {
        ...base.canonical_manifest,
        receipt_requirements: [
          { role: "holdout", independent: true, required_claims: ["verified"] },
          { role: "qa", independent: true, required_claims: ["no_harm"] },
        ],
      },
    };
    store.receipts.set("receipt-1", receipt());
    const second: RuntimeBoundReceipt = {
      ...receipt("qa-agent"),
      receipt_id: "receipt-2",
      role: "qa",
      claims: ["wrong_claim"],
    };
    store.receipts.set("receipt-2", second);
    const service = new ControlPlaneService({ store, evidence_verifier: evidenceVerifier, clock: () => now });
    const command = transition("completed", "verified", {
      receipt_ids: ["receipt-1" as ReceiptId, "receipt-2" as ReceiptId],
      evidence: [],
    });
    expect(await service.handle(command)).toMatchObject({ ok: false, error: { code: "PRECONDITION_FAILED" } });
    store.receipts.set("receipt-2", { ...second, claims: ["no_harm"] });
    expect(await service.handle(command)).toMatchObject({ ok: true, result: { state: "verified" } });

    store.currentState = "completed";
    store.events.length = 0;
    store.receipts.set("receipt-2", {
      ...second,
      claims: ["no_harm"],
      output_repository: { ...second.output_repository, repository_object_sha256: sha("8") },
    });
    expect(await service.handle(command)).toMatchObject({ ok: false, error: { code: "PRECONDITION_FAILED" } });
  });

  it("requires pairwise-distinct actors across every independent receipt role", async () => {
    const store = new FakeStore();
    store.currentState = "completed";
    const base = manifest();
    store.revision = {
      ...base,
      canonical_manifest: {
        ...base.canonical_manifest,
        receipt_requirements: [
          { role: "holdout", independent: true, required_claims: ["verified"] },
          { role: "qa", independent: true, required_claims: ["no_harm"] },
        ],
      },
    };
    store.receipts.set("receipt-1", receipt("independent-agent"));
    store.receipts.set("receipt-2", {
      ...receipt("independent-agent"),
      receipt_id: "receipt-2",
      role: "qa",
      claims: ["no_harm"],
    });
    const service = new ControlPlaneService({ store, evidence_verifier: evidenceVerifier, clock: () => now });
    const command = transition("completed", "verified", {
      receipt_ids: ["receipt-1" as ReceiptId, "receipt-2" as ReceiptId],
    });
    expect(await service.handle(command)).toMatchObject({ ok: false, error: { code: "PRECONDITION_FAILED" } });

    store.receipts.set("receipt-2", {
      ...receipt("second-independent-agent"),
      receipt_id: "receipt-2",
      role: "qa",
      claims: ["no_harm"],
    });
    expect(await service.handle(command)).toMatchObject({ ok: true, result: { state: "verified" } });
  });

  it("rejects duplicate receipt-role requirements before role labels can manufacture independence", async () => {
    const store = new FakeStore();
    store.currentState = "completed";
    const base = manifest();
    store.revision = {
      ...base,
      canonical_manifest: {
        ...base.canonical_manifest,
        receipt_requirements: [
          { role: "holdout", independent: true, required_claims: ["verified"] },
          { role: "holdout", independent: true, required_claims: ["no_harm"] },
        ],
      },
    };
    store.receipts.set("receipt-1", receipt("holdout-one"));
    store.receipts.set("receipt-2", {
      ...receipt("holdout-two"),
      receipt_id: "receipt-2",
      claims: ["no_harm"],
    });
    const service = new ControlPlaneService({ store, evidence_verifier: evidenceVerifier, clock: () => now });
    expect(await service.handle(transition("completed", "verified", {
      receipt_ids: ["receipt-1" as ReceiptId, "receipt-2" as ReceiptId],
    }))).toMatchObject({ ok: false, error: { code: "PRECONDITION_FAILED" } });
  });

  it("rechecks cancellation after delayed authority reads before append", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    class SlowManifestStore extends FakeStore {
      override async getManifest(): Promise<ManifestRevision | null> {
        await gate;
        return this.revision;
      }
    }
    const store = new SlowManifestStore();
    const service = new ControlPlaneService({ store, evidence_verifier: evidenceVerifier, clock: () => now });
    const controller = new AbortController();
    const pending = service.handle(transition(null, "recommended"), controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    release();
    await expect(pending).resolves.toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect(store.appendCalls).toBe(0);
  });
});
