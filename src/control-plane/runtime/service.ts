import type {
  ControlSurfaceId,
  DirectiveId,
  EvidenceRef,
  IsoTimestamp,
  ManifestId,
  ReceiptId,
  RunId,
  Sha256,
} from "../contracts/primitives.js";
import type {
  DirectiveEvent,
  DirectiveState,
  ManifestRevision,
  RemediationWaveManifest,
} from "../contracts/wave-directive.js";
import type { RuntimeBoundReceipt } from "./authority.js";
import {
  denyAuthorityEvidence,
  type AuthorityEvidenceVerifier,
} from "./evidence.js";
import {
  CONTROL_PLANE_PROTOCOL_VERSION,
  ControlPlaneFault,
  type AgentView,
  type ControlPlaneFailure,
  type ControlPlaneRequest,
  type ControlPlaneResponse,
  type ControlPlaneResult,
  type DirectiveEventView,
  type DirectiveTransitionView,
  type EvidenceInput,
  type IssueView,
  type ManifestView,
  type PendingEvaluationInvocationsView,
  type RunView,
  parseControlPlaneRequest,
  requestIdFromUnknown,
} from "./protocol.js";
import {
  sealDirectiveAppend,
  type AuthorizedDirectiveAppendRequest,
} from "./transition-seal.js";
import { denyEvaluationIntake, type EvaluationIntakePort } from "./evaluation-intake.js";

export interface DirectiveAppendResult {
  readonly sequence: number;
  readonly event: DirectiveEventView;
}

export interface RepositoryControlPlaneStore {
  readonly global_inventory_available: boolean;
  getRun(runId: RunId): Promise<RunView | null>;
  getManifest(manifestId: ManifestId, revision: number | null): Promise<ManifestRevision | null>;
  getManifestHead(manifestId: ManifestId): Promise<ManifestRevision | null>;
  listIssues(runId: RunId, limit: number): Promise<readonly IssueView[]>;
  listAgents(capabilityId: string | null, limit: number): Promise<readonly AgentView[]>;
  listPendingEvaluationInvocations(limit: number): Promise<PendingEvaluationInvocationsView>;
  listDirectiveEvents(directiveId: DirectiveId): Promise<readonly DirectiveEventView[]>;
  getReceipt(receiptId: ReceiptId): Promise<RuntimeBoundReceipt | null>;
  getClosingRepositoryObject(runId: RunId): Promise<ClosingRepositoryObject | null>;
  appendDirectiveEvent(request: AuthorizedDirectiveAppendRequest): Promise<DirectiveAppendResult>;
}

export interface RouteAdmissionRequest {
  readonly directive_id: DirectiveId;
  readonly manifest: RemediationWaveManifest;
  readonly control_surface_id: ControlSurfaceId;
  readonly requested_at: IsoTimestamp;
}

export interface RouteAdmissionDecision {
  readonly admitted: boolean;
  readonly reason: string;
  readonly evidence: readonly EvidenceRef[];
}

/**
 * The bounded runtime does not dispatch work. An injected local orchestrator
 * may only attest that a route is presently admissible.
 */
export interface RouteAdmissionPort {
  readonly configured: boolean;
  admit(request: RouteAdmissionRequest): Promise<RouteAdmissionDecision>;
}

export const denyRouteAdmission: RouteAdmissionPort = Object.freeze({
  configured: false,
  async admit(): Promise<RouteAdmissionDecision> {
    return { admitted: false, reason: "No local route-admission authority is configured", evidence: [] };
  },
});

export interface ControlPlaneServiceOptions {
  readonly store: RepositoryControlPlaneStore;
  readonly route_admission?: RouteAdmissionPort;
  readonly evidence_verifier?: AuthorityEvidenceVerifier;
  readonly clock?: () => IsoTimestamp;
  readonly evaluation_intake?: EvaluationIntakePort;
}

export interface ClosingRepositoryObject {
  readonly repository: RemediationWaveManifest["repository"];
  readonly evidence: readonly EvidenceRef[];
}

const TRANSITIONS: ReadonlyMap<DirectiveState | null, ReadonlySet<DirectiveState>> = new Map([
  [null, new Set(["recommended"])],
  ["recommended", new Set(["projected"])],
  ["projected", new Set(["copied", "queued"])],
  ["copied", new Set()],
  ["queued", new Set(["delivered", "failed", "delivery_uncertain"])],
  ["delivered", new Set(["accepted", "failed", "delivery_uncertain"])],
  ["accepted", new Set(["running", "failed"])],
  ["running", new Set(["completed", "failed"])],
  ["completed", new Set(["verified"])],
  ["verified", new Set()],
  ["failed", new Set()],
  ["delivery_uncertain", new Set()],
]);

const EVIDENCE_REQUIRED_STATES = new Set<DirectiveState>([
  "projected",
  "copied",
  "queued",
  "delivered",
  "accepted",
  "completed",
  "running",
  "failed",
  "delivery_uncertain",
]);

const CURRENT_MANIFEST_REQUIRED_STATES = new Set<DirectiveState>([
  "queued",
  "delivered",
  "accepted",
  "running",
  "completed",
  "verified",
]);

const CONTROL_SURFACE_REQUIRED_STATES = new Set<DirectiveState>([
  "queued",
  "delivered",
  "accepted",
  "running",
  "completed",
]);

function defaultClock(): IsoTimestamp {
  return new Date().toISOString() as IsoTimestamp;
}

function failure(requestId: string | null, fault: ControlPlaneFault): ControlPlaneFailure {
  return {
    version: CONTROL_PLANE_PROTOCOL_VERSION,
    request_id: requestId,
    ok: false,
    error: { code: fault.code, message: fault.message },
  };
}

function assertManifestBinding(
  revision: ManifestRevision,
  runId: RunId,
  manifestId: ManifestId,
  manifestRevision: number,
  manifestSha256: Sha256,
): void {
  const manifest = revision.canonical_manifest;
  if (
    revision.manifest_id !== manifestId
    || revision.revision !== manifestRevision
    || revision.manifest_sha256 !== manifestSha256
    || manifest.manifest_id !== manifestId
    || manifest.revision !== manifestRevision
    || manifest.run_id !== runId
  ) {
    throw new ControlPlaneFault("PRECONDITION_FAILED", "Manifest binding does not match the requested command");
  }
}

function toEvidenceRef(input: EvidenceInput): EvidenceRef {
  return input.record_type === null
    ? { path: input.path, sha256: input.sha256 }
    : { path: input.path, sha256: input.sha256, record_type: input.record_type };
}

function toEvidenceInput(input: EvidenceRef): EvidenceInput {
  return {
    path: input.path,
    sha256: input.sha256,
    record_type: input.record_type ?? null,
  };
}

function mergeEvidence(primary: readonly EvidenceInput[], secondary: readonly EvidenceRef[]): readonly EvidenceInput[] {
  const merged = new Map<string, EvidenceInput>();
  for (const item of primary) merged.set(`${item.path}\u0000${item.sha256}`, item);
  for (const item of secondary) {
    const normalized = toEvidenceInput(item);
    merged.set(`${normalized.path}\u0000${normalized.sha256}`, normalized);
  }
  return [...merged.values()];
}

function manifestView(revision: ManifestRevision, currentRevision: number): ManifestView {
  const manifest = revision.canonical_manifest;
  return {
    manifest_id: revision.manifest_id,
    revision: revision.revision,
    run_id: manifest.run_id,
    manifest_sha256: revision.manifest_sha256,
    current: revision.revision === currentRevision,
    authority_mode: manifest.authority_mode,
    target_ref: manifest.target_ref,
    expected_target_commit: manifest.expected_target_commit,
    repository_id: manifest.repository.repository_id,
    selected_issue_count: manifest.selected_issue_ids.length,
    wave_count: manifest.waves.length,
    lane_count: manifest.lanes.length,
    self_audit_status: manifest.self_audit.status,
    created_at: manifest.created_at,
  };
}

function assertReceiptBinding(
  receipt: RuntimeBoundReceipt,
  runId: RunId,
  revision: ManifestRevision,
  closing: ClosingRepositoryObject,
): void {
  const manifest = revision.canonical_manifest;
  if (
    receipt.state !== "verified"
    || receipt.conclusion !== "pass"
    || receipt.sealed_at === null
    || receipt.run_id !== runId
    || receipt.manifest_id !== revision.manifest_id
    || receipt.manifest_revision !== revision.revision
    || receipt.manifest_sha256 !== revision.manifest_sha256
    || receipt.baseline_repository.repository_object_sha256 !== manifest.repository.repository_object_sha256
    || receipt.baseline_repository.repository_id !== manifest.repository.repository_id
    || receipt.output_repository.repository_object_sha256 !== closing.repository.repository_object_sha256
    || receipt.output_repository.repository_id !== closing.repository.repository_id
    || receipt.evidence.length === 0
  ) {
    throw new ControlPlaneFault("PRECONDITION_FAILED", "Receipt is not a sealed verified pass bound to this manifest baseline and closing repository object");
  }
}

export class ControlPlaneService {
  readonly #store: RepositoryControlPlaneStore;
  readonly #routeAdmission: RouteAdmissionPort;
  readonly #evidenceVerifier: AuthorityEvidenceVerifier;
  readonly #clock: () => IsoTimestamp;
  readonly #evaluationIntake: EvaluationIntakePort;

  constructor(options: ControlPlaneServiceOptions) {
    this.#store = options.store;
    this.#routeAdmission = options.route_admission ?? denyRouteAdmission;
    this.#evidenceVerifier = options.evidence_verifier ?? denyAuthorityEvidence;
    this.#clock = options.clock ?? defaultClock;
    this.#evaluationIntake = options.evaluation_intake ?? denyEvaluationIntake;
  }

  /** Parse an untrusted local payload and return a non-throwing RPC response. */
  async handle(value: unknown, signal?: AbortSignal): Promise<ControlPlaneResponse> {
    let request: ControlPlaneRequest;
    try {
      request = parseControlPlaneRequest(value);
    } catch (error) {
      const fault = error instanceof ControlPlaneFault
        ? error
        : new ControlPlaneFault("INVALID_REQUEST", "Invalid control-plane request");
      return failure(requestIdFromUnknown(value), fault);
    }
    try {
      this.#assertNotAborted(signal);
      return {
        version: CONTROL_PLANE_PROTOCOL_VERSION,
        request_id: request.request_id,
        ok: true,
        result: await this.execute(request, signal),
      };
    } catch (error) {
      const fault = error instanceof ControlPlaneFault
        ? error
        : new ControlPlaneFault("INTERNAL", "Local control-plane operation failed");
      return failure(request.request_id, fault);
    }
  }

  async execute(request: ControlPlaneRequest, signal?: AbortSignal): Promise<ControlPlaneResult> {
    this.#assertNotAborted(signal);
    switch (request.name) {
      case "health":
        return {
          status: "ok",
          protocol_version: CONTROL_PLANE_PROTOCOL_VERSION,
          global_inventory_available: this.#store.global_inventory_available,
          route_admission_configured: this.#routeAdmission.configured,
          evidence_verification_configured: this.#evidenceVerifier.configured,
          dispatch_supported: false,
          execution_supported: false,
        };
      case "run.get": {
        const run = await this.#store.getRun(request.input.run_id);
        this.#assertNotAborted(signal);
        if (run === null) throw new ControlPlaneFault("NOT_FOUND", "Run was not found");
        return run;
      }
      case "manifest.get": {
        const revision = await this.#store.getManifest(request.input.manifest_id, request.input.revision);
        this.#assertNotAborted(signal);
        if (revision === null) throw new ControlPlaneFault("NOT_FOUND", "Manifest revision was not found");
        const head = await this.#store.getManifestHead(request.input.manifest_id);
        this.#assertNotAborted(signal);
        if (head === null) throw new ControlPlaneFault("INTERNAL", "Manifest head is unavailable");
        return manifestView(revision, head.revision);
      }
      case "issues.list": {
        const issues = await this.#store.listIssues(request.input.run_id, request.input.limit);
        this.#assertNotAborted(signal);
        return issues;
      }
      case "agents.list": {
        const agents = await this.#store.listAgents(request.input.capability_id, request.input.limit);
        this.#assertNotAborted(signal);
        return agents;
      }
      case "evaluation.invocations.pending.list": {
        const pending = await this.#store.listPendingEvaluationInvocations(request.input.limit);
        this.#assertNotAborted(signal);
        return pending;
      }
      case "directive.events": {
        const events = await this.#store.listDirectiveEvents(request.input.directive_id);
        this.#assertNotAborted(signal);
        return events;
      }
      case "evaluation.project.register":
        return this.#evaluationIntake.register(request.input);
      case "evaluation.run.start":
        return this.#evaluationIntake.start(request.input);
      case "evaluation.run.outcome":
        return this.#evaluationIntake.outcome(request.input);
      case "directive.transition":
        return this.#transitionDirective(request, signal);
    }
  }

  #assertNotAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new ControlPlaneFault("INTERNAL", "Local control-plane operation was cancelled");
  }

  async #transitionDirective(request: DirectiveTransitionCommand, signal?: AbortSignal): Promise<DirectiveTransitionView> {
    this.#assertNotAborted(signal);
    const input = request.input;
    const allowed = TRANSITIONS.get(input.expected_state);
    if (allowed === undefined || !allowed.has(input.to_state)) {
      throw new ControlPlaneFault("PRECONDITION_FAILED", `Directive transition ${input.expected_state ?? "null"} -> ${input.to_state} is not allowed`);
    }
    if (EVIDENCE_REQUIRED_STATES.has(input.to_state) && input.to_state !== "queued" && input.evidence.length === 0) {
      throw new ControlPlaneFault("PRECONDITION_FAILED", `${input.to_state} requires evidence`);
    }
    if (CONTROL_SURFACE_REQUIRED_STATES.has(input.to_state) && input.control_surface_id === null) {
      throw new ControlPlaneFault("PRECONDITION_FAILED", `${input.to_state} requires a control surface`);
    }
    if (input.to_state !== "verified" && input.receipt_ids.length !== 0) {
      throw new ControlPlaneFault("INVALID_REQUEST", "receipt_ids are only valid for a verified transition");
    }

    const revision = await this.#store.getManifest(input.manifest_id, input.manifest_revision);
    this.#assertNotAborted(signal);
    if (revision === null) throw new ControlPlaneFault("NOT_FOUND", "Manifest revision was not found");
    assertManifestBinding(revision, input.run_id, input.manifest_id, input.manifest_revision, input.manifest_sha256);

    let evidence = input.evidence;
    let evidenceRepository = revision.canonical_manifest.repository;
    if (input.to_state === "queued") {
      if (revision.canonical_manifest.authority_mode !== "OPERATE") {
        throw new ControlPlaneFault("FORBIDDEN", "ADVISE manifests cannot queue directives");
      }
      if (revision.canonical_manifest.self_audit.status !== "passed" || revision.canonical_manifest.self_audit.evidence.length === 0) {
        throw new ControlPlaneFault("PRECONDITION_FAILED", "An OPERATE manifest must pass its evidence-bound self-audit before queueing");
      }
      this.#assertNotAborted(signal);
      const admission = await this.#routeAdmission.admit({
        directive_id: input.directive_id,
        manifest: revision.canonical_manifest,
        control_surface_id: input.control_surface_id!,
        requested_at: this.#clock(),
      });
      this.#assertNotAborted(signal);
      if (!admission.admitted) throw new ControlPlaneFault("PRECONDITION_FAILED", "Local route admission denied this directive");
      if (admission.evidence.length === 0) {
        throw new ControlPlaneFault("PRECONDITION_FAILED", "Route admission must be evidence-bound");
      }
      evidence = mergeEvidence(evidence, admission.evidence);
    }

    if (input.to_state === "completed") {
      const closing = await this.#store.getClosingRepositoryObject(input.run_id);
      this.#assertNotAborted(signal);
      if (closing === null) throw new ControlPlaneFault("PRECONDITION_FAILED", "completed requires one append-only closing repository-object binding");
      evidenceRepository = closing.repository;
    }

    if (input.to_state === "verified") {
      const requirements = revision.canonical_manifest.receipt_requirements;
      if (input.evidence.length !== 0) throw new ControlPlaneFault("INVALID_REQUEST", "verified evidence is derived from bound receipts, not caller-supplied paths");
      if (input.receipt_ids.length !== requirements.length || new Set(input.receipt_ids).size !== input.receipt_ids.length) {
        throw new ControlPlaneFault("PRECONDITION_FAILED", "verified requires one distinct receipt for every manifest receipt requirement");
      }
      const closing = await this.#store.getClosingRepositoryObject(input.run_id);
      this.#assertNotAborted(signal);
      if (closing === null) throw new ControlPlaneFault("PRECONDITION_FAILED", "verified requires one append-only closing repository-object binding");
      evidenceRepository = closing.repository;
      const receipts: RuntimeBoundReceipt[] = [];
      for (const receiptId of input.receipt_ids) {
        const receipt = await this.#store.getReceipt(receiptId);
        this.#assertNotAborted(signal);
        if (receipt === null) throw new ControlPlaneFault("NOT_FOUND", "Receipt was not found");
        assertReceiptBinding(receipt, input.run_id, revision, closing);
        receipts.push(receipt);
      }
      const unused = new Set(receipts);
      const nonIndependentActors = new Set<string>([
        revision.canonical_manifest.created_by,
        ...revision.canonical_manifest.lanes.filter((lane) => lane.role !== "read_only").map((lane) => lane.owner),
      ]);
      const receiptEvidence: EvidenceRef[] = [];
      const independentActors = new Set<string>();
      const requiredRoles = new Set<string>();
      for (const requirement of requirements) {
        if (requiredRoles.has(requirement.role)) {
          throw new ControlPlaneFault("PRECONDITION_FAILED", `Manifest contains a duplicate ${requirement.role} receipt requirement`);
        }
        requiredRoles.add(requirement.role);
        const receipt = [...unused].find((candidate) => candidate.role === requirement.role
          && requirement.required_claims.every((claim) => candidate.claims.includes(claim))
          && (!requirement.independent
            || (!nonIndependentActors.has(candidate.actor) && !independentActors.has(candidate.actor))));
        if (receipt === undefined) {
          throw new ControlPlaneFault("PRECONDITION_FAILED", `No receipt satisfies the ${requirement.role} role, claims, and independence requirement`);
        }
        unused.delete(receipt);
        if (requirement.independent) independentActors.add(receipt.actor);
        try {
          this.#assertNotAborted(signal);
          const verifiedReceiptEvidence = await this.#evidenceVerifier.verifyReceipt({
            directive_id: input.directive_id,
            run_id: input.run_id,
            revision,
            receipt,
          });
          this.#assertNotAborted(signal);
          receiptEvidence.push(...verifiedReceiptEvidence);
        } catch {
          throw new ControlPlaneFault("PRECONDITION_FAILED", "Receipt evidence failed local custody, digest, actor, or semantic verification");
        }
      }
      evidence = mergeEvidence([], receiptEvidence);
    } else if (EVIDENCE_REQUIRED_STATES.has(input.to_state)) {
      try {
        this.#assertNotAborted(signal);
        const verified = await this.#evidenceVerifier.verifyDirective({
          state: input.to_state as Exclude<DirectiveState, "recommended" | "verified">,
          directive_id: input.directive_id,
          run_id: input.run_id,
          revision,
          repository: evidenceRepository,
          control_surface_id: input.control_surface_id,
          evidence,
        });
        this.#assertNotAborted(signal);
        evidence = verified.map(toEvidenceInput);
      } catch {
        throw new ControlPlaneFault("PRECONDITION_FAILED", `${input.to_state} evidence failed local custody, digest, actor, or semantic verification`);
      }
    }

    const occurredAt = this.#clock();
    this.#assertNotAborted(signal);
    const event: DirectiveEvent = {
      directive_id: input.directive_id,
      manifest_id: input.manifest_id,
      manifest_revision: input.manifest_revision,
      manifest_sha256: input.manifest_sha256,
      from_state: input.expected_state,
      to_state: input.to_state,
      occurred_at: occurredAt,
      control_surface: input.control_surface_id,
      evidence: evidence.map(toEvidenceRef),
    };
    const appended = await this.#store.appendDirectiveEvent(sealDirectiveAppend({
      run_id: input.run_id,
      event,
      expected_state: input.expected_state,
      control_surface_id: input.control_surface_id,
      receipt_ids: input.receipt_ids,
      require_current_manifest: CURRENT_MANIFEST_REQUIRED_STATES.has(input.to_state),
    }));
    this.#assertNotAborted(signal);
    return {
      directive_id: input.directive_id,
      sequence: appended.sequence,
      state: input.to_state,
      occurred_at: occurredAt,
    };
  }
}

// Kept as a named import below to avoid widening the public request union.
type DirectiveTransitionCommand = Extract<ControlPlaneRequest, { readonly name: "directive.transition" }>;
