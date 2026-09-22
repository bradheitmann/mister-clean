import { Buffer } from "node:buffer";
import type {
  AgentTupleId,
  CapabilityId,
  ControlSurfaceId,
  DetectorSetId,
  DirectiveId,
  HarnessId,
  IsoTimestamp,
  IssueId,
  ManifestId,
  ModelId,
  ReceiptId,
  RepositoryId,
  RunId,
  Sha256,
} from "../contracts/primitives.js";
import { parseRepositoryCapabilityId } from "../contracts/capability-taxonomy.js";
import {
  DIRECTIVE_STATES,
  type DirectiveState,
} from "../contracts/wave-directive.js";
import type { QualificationLevel } from "../contracts/agent-evaluation.js";

export const CONTROL_PLANE_PROTOCOL_VERSION = "1" as const;
export const DEFAULT_MAX_REQUEST_BYTES = 1024 * 1024;

export const QUERY_NAMES = [
  "health",
  "run.get",
  "manifest.get",
  "issues.list",
  "agents.list",
  "evaluation.invocations.pending.list",
  "directive.events",
] as const;

export const COMMAND_NAMES = ["directive.transition", "evaluation.project.register", "evaluation.run.start", "evaluation.run.outcome"] as const;

export type QueryName = (typeof QUERY_NAMES)[number];
export type CommandName = (typeof COMMAND_NAMES)[number];

export interface EvidenceInput {
  readonly path: string;
  readonly sha256: Sha256;
  readonly record_type: string | null;
}

export interface HealthQuery {
  readonly version: typeof CONTROL_PLANE_PROTOCOL_VERSION;
  readonly request_id: string;
  readonly kind: "query";
  readonly name: "health";
  readonly input: Record<string, never>;
}

export interface RunGetQuery {
  readonly version: typeof CONTROL_PLANE_PROTOCOL_VERSION;
  readonly request_id: string;
  readonly kind: "query";
  readonly name: "run.get";
  readonly input: { readonly run_id: RunId };
}

export interface ManifestGetQuery {
  readonly version: typeof CONTROL_PLANE_PROTOCOL_VERSION;
  readonly request_id: string;
  readonly kind: "query";
  readonly name: "manifest.get";
  readonly input: {
    readonly manifest_id: ManifestId;
    readonly revision: number | null;
  };
}

export interface IssuesListQuery {
  readonly version: typeof CONTROL_PLANE_PROTOCOL_VERSION;
  readonly request_id: string;
  readonly kind: "query";
  readonly name: "issues.list";
  readonly input: {
    readonly run_id: RunId;
    readonly limit: number;
  };
}

export interface AgentsListQuery {
  readonly version: typeof CONTROL_PLANE_PROTOCOL_VERSION;
  readonly request_id: string;
  readonly kind: "query";
  readonly name: "agents.list";
  readonly input: {
    readonly capability_id: CapabilityId | null;
    readonly limit: number;
  };
}

/** Imported CLI receipts without a strict evaluation-run binding. They never
 * identify an agent, execution route, capability, trial, or qualification. */
export interface EvaluationInvocationsPendingListQuery {
  readonly version: typeof CONTROL_PLANE_PROTOCOL_VERSION;
  readonly request_id: string;
  readonly kind: "query";
  readonly name: "evaluation.invocations.pending.list";
  readonly input: { readonly limit: number };
}

export interface DirectiveEventsQuery {
  readonly version: typeof CONTROL_PLANE_PROTOCOL_VERSION;
  readonly request_id: string;
  readonly kind: "query";
  readonly name: "directive.events";
  readonly input: { readonly directive_id: DirectiveId };
}

export interface DirectiveTransitionCommand {
  readonly version: typeof CONTROL_PLANE_PROTOCOL_VERSION;
  readonly request_id: string;
  readonly kind: "command";
  readonly name: "directive.transition";
  readonly input: {
    readonly directive_id: DirectiveId;
    readonly run_id: RunId;
    readonly manifest_id: ManifestId;
    readonly manifest_revision: number;
    readonly manifest_sha256: Sha256;
    readonly expected_state: DirectiveState | null;
    readonly to_state: DirectiveState;
    readonly control_surface_id: ControlSurfaceId | null;
    readonly evidence: readonly EvidenceInput[];
    readonly receipt_ids: readonly ReceiptId[];
  };
}

export interface RetainedEvidenceBytesInput {
  readonly sha256: Sha256;
  readonly media_type: string;
  readonly bytes: Uint8Array;
}

export interface EvaluationProjectRegisterCommand {
  readonly version: typeof CONTROL_PLANE_PROTOCOL_VERSION;
  readonly request_id: string;
  readonly kind: "command";
  readonly name: "evaluation.project.register";
  readonly input: {
    readonly logical_project_id: string;
    readonly registration_evidence_sha256: Sha256;
    readonly aliases: readonly { readonly repository_id: string; readonly attestation_evidence_sha256: Sha256 }[];
    readonly registered_at: IsoTimestamp;
    readonly retained_evidence: readonly RetainedEvidenceBytesInput[];
  };
}

export interface EvaluationRunStartCommand {
  readonly version: typeof CONTROL_PLANE_PROTOCOL_VERSION;
  readonly request_id: string;
  readonly kind: "command";
  readonly name: "evaluation.run.start";
  readonly input: { readonly start: Record<string, unknown>; readonly invocation_ids: readonly string[]; readonly retained_evidence: readonly RetainedEvidenceBytesInput[] };
}

export interface EvaluationRunOutcomeCommand {
  readonly version: typeof CONTROL_PLANE_PROTOCOL_VERSION;
  readonly request_id: string;
  readonly kind: "command";
  readonly name: "evaluation.run.outcome";
  readonly input: { readonly outcome: Record<string, unknown>; readonly retained_evidence: readonly RetainedEvidenceBytesInput[] };
}

export type ControlPlaneRequest =
  | HealthQuery
  | RunGetQuery
  | ManifestGetQuery
  | IssuesListQuery
  | AgentsListQuery
  | EvaluationInvocationsPendingListQuery
  | DirectiveEventsQuery
  | DirectiveTransitionCommand
  | EvaluationProjectRegisterCommand
  | EvaluationRunStartCommand
  | EvaluationRunOutcomeCommand;

export interface RunView {
  readonly run_id: RunId;
  readonly repository_id: RepositoryId;
  readonly mister_clean_version: string;
  readonly detector_set_id: DetectorSetId;
  readonly detector_set_sha256: Sha256;
  readonly created_at: IsoTimestamp;
}

export interface ManifestView {
  readonly manifest_id: ManifestId;
  readonly revision: number;
  readonly run_id: RunId;
  readonly manifest_sha256: Sha256;
  readonly current: boolean;
  readonly authority_mode: "ADVISE" | "OPERATE";
  readonly target_ref: string;
  readonly expected_target_commit: string;
  readonly repository_id: RepositoryId;
  readonly selected_issue_count: number;
  readonly wave_count: number;
  readonly lane_count: number;
  readonly self_audit_status: "passed" | "failed";
  readonly created_at: IsoTimestamp;
}

export interface IssueView {
  readonly issue_id: IssueId;
  readonly repository_id: RepositoryId;
  readonly stable_cause_key: string;
  readonly normalizer: string;
  readonly first_detected_run_id: RunId;
  readonly current_state: string | null;
  readonly last_changed_at: IsoTimestamp | null;
}

export interface CapabilityTrialSummary {
  readonly capability_id: CapabilityId;
  readonly trial_count: number;
  readonly verified_success_count: number;
  readonly repository_cohort_count: number;
  readonly independently_evaluated: boolean;
  readonly qualification: QualificationLevel;
  readonly no_harm_violation_count: number;
  readonly authority_violation_count: number;
  readonly qualification_provenance: {
    readonly credited_trial_ids: readonly string[];
    readonly pre_dispatch_observation_ids: readonly string[];
    readonly pre_evaluation_observation_ids: readonly string[];
    readonly pre_dispatch_observed_at: readonly string[];
    readonly pre_evaluation_observed_at: readonly string[];
    readonly pre_dispatch_evidence_digests: readonly string[];
    readonly pre_evaluation_evidence_digests: readonly string[];
    readonly trial_evidence_digests: readonly string[];
    readonly evaluation_evidence_digest_sets: readonly (readonly string[])[];
    readonly worker_actor_ids: readonly string[];
    readonly author_actor_ids: readonly string[];
    readonly pre_dispatch_observer_actor_ids: readonly string[];
    readonly pre_evaluation_observer_actor_ids: readonly string[];
    readonly evaluator_actor_ids: readonly string[];
  };
}

export interface AgentView {
  readonly agent_tuple_id: AgentTupleId;
  readonly model_id: ModelId;
  readonly model_name: string;
  readonly model_family: string;
  readonly harness_id: HarnessId;
  readonly harness_name: string;
  readonly reasoning_level: string;
  readonly capabilities: readonly CapabilityTrialSummary[];
}

export interface PendingEvaluationInvocationView {
  readonly invocation_id: string;
  readonly command: string;
  readonly argv_sha256: Sha256;
  readonly observed_at: IsoTimestamp;
  readonly receipt_sha256: Sha256;
  readonly identity_provenance: "UNOBSERVED";
  readonly quality_credit: false;
}

export interface PendingEvaluationInvocationsView {
  /** Exact total before this request's bounded projection is applied. */
  readonly pending_count: number;
  readonly invocations: readonly PendingEvaluationInvocationView[];
}

export interface DirectiveEventView {
  readonly sequence: number;
  readonly directive_id: DirectiveId;
  readonly run_id: RunId;
  readonly manifest_id: ManifestId;
  readonly manifest_revision: number;
  readonly manifest_sha256: Sha256;
  readonly from_state: DirectiveState | null;
  readonly to_state: DirectiveState;
  readonly control_surface_id: ControlSurfaceId | null;
  readonly occurred_at: IsoTimestamp;
  readonly evidence: readonly EvidenceInput[];
  readonly receipt_ids: readonly ReceiptId[];
}

export interface DirectiveTransitionView {
  readonly directive_id: DirectiveId;
  readonly sequence: number;
  readonly state: DirectiveState;
  readonly occurred_at: IsoTimestamp;
}

export type ControlPlaneResult =
  | {
    readonly status: "ok";
    readonly protocol_version: typeof CONTROL_PLANE_PROTOCOL_VERSION;
    readonly global_inventory_available: boolean;
    readonly route_admission_configured: boolean;
    readonly evidence_verification_configured: boolean;
    readonly dispatch_supported: false;
    readonly execution_supported: false;
  }
  | RunView
  | ManifestView
  | readonly IssueView[]
  | readonly AgentView[]
  | PendingEvaluationInvocationsView
  | readonly DirectiveEventView[]
  | DirectiveTransitionView
  | { readonly logical_project_id: string; readonly alias_count: number; readonly provenance: "OPERATOR_ATTESTED" }
  | { readonly run_event_id: string; readonly repository_id: string; readonly evaluation_required: boolean; readonly qualification_at_dispatch: QualificationLevel }
  | { readonly run_event_id: string; readonly contributes_quality_credit: boolean; readonly qualification_after_outcome: QualificationLevel };

export const CONTROL_PLANE_ERROR_CODES = [
  "INVALID_REQUEST",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "CONFLICT",
  "FORBIDDEN",
  "PRECONDITION_FAILED",
  "PAYLOAD_TOO_LARGE",
  "INTERNAL",
] as const;

export type ControlPlaneErrorCode = (typeof CONTROL_PLANE_ERROR_CODES)[number];

export interface ControlPlaneSuccess {
  readonly version: typeof CONTROL_PLANE_PROTOCOL_VERSION;
  readonly request_id: string;
  readonly ok: true;
  readonly result: ControlPlaneResult;
}

export interface ControlPlaneFailure {
  readonly version: typeof CONTROL_PLANE_PROTOCOL_VERSION;
  readonly request_id: string | null;
  readonly ok: false;
  readonly error: {
    readonly code: ControlPlaneErrorCode;
    readonly message: string;
  };
}

export type ControlPlaneResponse = ControlPlaneSuccess | ControlPlaneFailure;

export class ControlPlaneFault extends Error {
  readonly code: ControlPlaneErrorCode;

  constructor(code: ControlPlaneErrorCode, message: string) {
    super(message);
    this.name = "ControlPlaneFault";
    this.code = code;
  }
}

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "access_token",
  "api_key",
  "apikey",
  "authorization",
  "bearer",
  "client_secret",
  "credential",
  "credentials",
  "password",
  "passwd",
  "private_key",
  "refresh_token",
  "secret",
  "secret_ref",
  "secret_value",
]);

const DIRECTIVE_STATE_SET = new Set<string>(DIRECTIVE_STATES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Reject secret-bearing application fields before parsing or dispatch. */
export function assertPayloadContainsNoSecretFields(value: unknown): void {
  const pending: Array<{ readonly value: unknown; readonly depth: number }> = [{ value, depth: 0 }];
  let visited = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    visited += 1;
    if (visited > 10_000 || current.depth > 32) {
      throw new ControlPlaneFault("INVALID_REQUEST", "Request structure exceeds local control-plane limits");
    }
    if (current.value === null || typeof current.value === "string" || typeof current.value === "boolean") continue;
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) throw new ControlPlaneFault("INVALID_REQUEST", "Request contains a non-finite number");
      continue;
    }
    if (Array.isArray(current.value)) {
      for (const entry of current.value) pending.push({ value: entry, depth: current.depth + 1 });
      continue;
    }
    if (!isRecord(current.value)) throw new ControlPlaneFault("INVALID_REQUEST", "Request is not JSON-compatible");
    for (const [key, entry] of Object.entries(current.value)) {
      // A required provenance field with a null value is an explicit absence,
      // not a transportable secret. Any non-null value remains forbidden.
      const explicitNullableAbsence = isRecord(entry) && entry.value === null && isRecord(entry.provenance);
      if (FORBIDDEN_PAYLOAD_KEYS.has(normalizeKey(key)) && entry !== null && !explicitNullableAbsence) {
        throw new ControlPlaneFault("INVALID_REQUEST", "Secret values are not accepted in control-plane payloads");
      }
      pending.push({ value: entry, depth: current.depth + 1 });
    }
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ControlPlaneFault("INVALID_REQUEST", `${label} must be an object`);
  return value;
}

function requireExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new ControlPlaneFault("INVALID_REQUEST", `Missing required field: ${key}`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ControlPlaneFault("INVALID_REQUEST", `Unknown field: ${key}`);
  }
}

function requireString(value: unknown, label: string, maxLength = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ControlPlaneFault("INVALID_REQUEST", `${label} must be a non-empty string of at most ${maxLength} characters`);
  }
  return value;
}

function requireSha256(value: unknown, label: string): Sha256 {
  const digest = requireString(value, label, 64);
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new ControlPlaneFault("INVALID_REQUEST", `${label} must be a lowercase SHA-256 digest`);
  return digest as Sha256;
}

function requireInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new ControlPlaneFault("INVALID_REQUEST", `${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value as number;
}

function requireNullableInteger(value: unknown, label: string, minimum: number, maximum: number): number | null {
  return value === null ? null : requireInteger(value, label, minimum, maximum);
}

function requireDirectiveState(value: unknown, label: string): DirectiveState {
  if (typeof value !== "string" || !DIRECTIVE_STATE_SET.has(value)) {
    throw new ControlPlaneFault("INVALID_REQUEST", `${label} is not a valid directive state`);
  }
  return value as DirectiveState;
}

function requireNullableDirectiveState(value: unknown, label: string): DirectiveState | null {
  return value === null ? null : requireDirectiveState(value, label);
}

function requireNullableString(value: unknown, label: string): string | null {
  return value === null ? null : requireString(value, label);
}

function parseEvidence(value: unknown): readonly EvidenceInput[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new ControlPlaneFault("INVALID_REQUEST", "evidence must be an array with at most 100 entries");
  }
  return value.map((entry, index) => {
    const record = requireRecord(entry, `evidence[${index}]`);
    requireExactKeys(record, ["path", "sha256", "record_type"]);
    return {
      path: requireString(record.path, `evidence[${index}].path`, 4096),
      sha256: requireSha256(record.sha256, `evidence[${index}].sha256`),
      record_type: requireNullableString(record.record_type, `evidence[${index}].record_type`),
    };
  });
}

function parseReceiptIds(value: unknown): readonly ReceiptId[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new ControlPlaneFault("INVALID_REQUEST", "receipt_ids must be an array with at most 100 entries");
  }
  const ids = value.map((entry, index) => requireString(entry, `receipt_ids[${index}]`) as ReceiptId);
  if (new Set(ids).size !== ids.length) throw new ControlPlaneFault("INVALID_REQUEST", "receipt_ids must not contain duplicates");
  return ids;
}

function parseRetainedEvidenceBytes(value: unknown): readonly RetainedEvidenceBytesInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) throw new ControlPlaneFault("INVALID_REQUEST", "retained_evidence must contain one to 100 entries");
  return value.map((entry, index) => {
    const record = requireRecord(entry, `retained_evidence[${index}]`);
    requireExactKeys(record, ["sha256", "media_type", "bytes_base64"]);
    const encoded = requireString(record.bytes_base64, `retained_evidence[${index}].bytes_base64`, 349_528);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) throw new ControlPlaneFault("INVALID_REQUEST", "retained evidence must use canonical base64");
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.byteLength === 0 || bytes.byteLength > 262_144 || bytes.toString("base64") !== encoded) throw new ControlPlaneFault("INVALID_REQUEST", "retained evidence bytes are invalid or exceed the local bound");
    return { sha256: requireSha256(record.sha256, `retained_evidence[${index}].sha256`), media_type: requireString(record.media_type, `retained_evidence[${index}].media_type`, 256), bytes };
  });
}

function baseRequest(value: Record<string, unknown>): {
  readonly request_id: string;
  readonly kind: "query" | "command";
  readonly name: string;
  readonly input: Record<string, unknown>;
} {
  requireExactKeys(value, ["version", "request_id", "kind", "name", "input"]);
  if (value.version !== CONTROL_PLANE_PROTOCOL_VERSION) {
    throw new ControlPlaneFault("INVALID_REQUEST", `Unsupported control-plane protocol version`);
  }
  const request_id = requireString(value.request_id, "request_id", 256);
  if (value.kind !== "query" && value.kind !== "command") {
    throw new ControlPlaneFault("INVALID_REQUEST", "kind must be query or command");
  }
  return {
    request_id,
    kind: value.kind,
    name: requireString(value.name, "name", 128),
    input: requireRecord(value.input, "input"),
  };
}

export function parseControlPlaneRequest(value: unknown): ControlPlaneRequest {
  assertPayloadContainsNoSecretFields(value);
  const base = baseRequest(requireRecord(value, "request"));
  if (base.kind === "query") {
    switch (base.name) {
      case "health":
        requireExactKeys(base.input, []);
        return { version: CONTROL_PLANE_PROTOCOL_VERSION, request_id: base.request_id, kind: "query", name: "health", input: {} };
      case "run.get":
        requireExactKeys(base.input, ["run_id"]);
        return {
          version: CONTROL_PLANE_PROTOCOL_VERSION,
          request_id: base.request_id,
          kind: "query",
          name: "run.get",
          input: { run_id: requireString(base.input.run_id, "run_id") as RunId },
        };
      case "manifest.get":
        requireExactKeys(base.input, ["manifest_id", "revision"]);
        return {
          version: CONTROL_PLANE_PROTOCOL_VERSION,
          request_id: base.request_id,
          kind: "query",
          name: "manifest.get",
          input: {
            manifest_id: requireString(base.input.manifest_id, "manifest_id") as ManifestId,
            revision: requireNullableInteger(base.input.revision, "revision", 1, Number.MAX_SAFE_INTEGER),
          },
        };
      case "issues.list":
        requireExactKeys(base.input, ["run_id", "limit"]);
        return {
          version: CONTROL_PLANE_PROTOCOL_VERSION,
          request_id: base.request_id,
          kind: "query",
          name: "issues.list",
          input: {
            run_id: requireString(base.input.run_id, "run_id") as RunId,
            limit: requireInteger(base.input.limit, "limit", 1, 500),
          },
        };
      case "agents.list": {
        requireExactKeys(base.input, ["capability_id", "limit"]);
        const capability = requireNullableString(base.input.capability_id, "capability_id");
        let parsedCapability: CapabilityId | null = null;
        try { parsedCapability = capability === null ? null : parseRepositoryCapabilityId(capability); }
        catch { throw new ControlPlaneFault("INVALID_REQUEST", "capability_id is not in the active Mister Clean taxonomy"); }
        return {
          version: CONTROL_PLANE_PROTOCOL_VERSION,
          request_id: base.request_id,
          kind: "query",
          name: "agents.list",
          input: {
            capability_id: parsedCapability,
            limit: requireInteger(base.input.limit, "limit", 1, 500),
          },
        };
      }
      case "evaluation.invocations.pending.list":
        requireExactKeys(base.input, ["limit"]);
        return {
          version: CONTROL_PLANE_PROTOCOL_VERSION,
          request_id: base.request_id,
          kind: "query",
          name: "evaluation.invocations.pending.list",
          input: { limit: requireInteger(base.input.limit, "limit", 1, 500) },
        };
      case "directive.events":
        requireExactKeys(base.input, ["directive_id"]);
        return {
          version: CONTROL_PLANE_PROTOCOL_VERSION,
          request_id: base.request_id,
          kind: "query",
          name: "directive.events",
          input: { directive_id: requireString(base.input.directive_id, "directive_id") as DirectiveId },
        };
      default:
        throw new ControlPlaneFault("INVALID_REQUEST", "Unknown query name");
    }
  }

  if (base.name === "evaluation.project.register") {
    requireExactKeys(base.input, ["logical_project_id", "registration_evidence_sha256", "aliases", "registered_at", "retained_evidence"]);
    if (!Array.isArray(base.input.aliases) || base.input.aliases.length === 0 || base.input.aliases.length > 100) throw new ControlPlaneFault("INVALID_REQUEST", "aliases must contain one to 100 entries");
    const aliases = base.input.aliases.map((entry, index) => {
      const alias = requireRecord(entry, `aliases[${index}]`);
      requireExactKeys(alias, ["repository_id", "attestation_evidence_sha256"]);
      return { repository_id: requireString(alias.repository_id, `aliases[${index}].repository_id`), attestation_evidence_sha256: requireSha256(alias.attestation_evidence_sha256, `aliases[${index}].attestation_evidence_sha256`) };
    });
    if (new Set(aliases.map((alias) => alias.repository_id)).size !== aliases.length) throw new ControlPlaneFault("INVALID_REQUEST", "aliases must not repeat a repository_id");
    return { version: CONTROL_PLANE_PROTOCOL_VERSION, request_id: base.request_id, kind: "command", name: "evaluation.project.register", input: {
      logical_project_id: requireString(base.input.logical_project_id, "logical_project_id"), registration_evidence_sha256: requireSha256(base.input.registration_evidence_sha256, "registration_evidence_sha256"), aliases,
      registered_at: requireString(base.input.registered_at, "registered_at") as IsoTimestamp, retained_evidence: parseRetainedEvidenceBytes(base.input.retained_evidence),
    } };
  }
  if (base.name === "evaluation.run.start" || base.name === "evaluation.run.outcome") {
    requireExactKeys(base.input, base.name === "evaluation.run.start" ? ["start", "invocation_ids", "retained_evidence"] : ["outcome", "retained_evidence"]);
    const key = base.name === "evaluation.run.start" ? "start" : "outcome";
    const invocationIds = base.name === "evaluation.run.start"
      ? (() => {
        if (!Array.isArray(base.input.invocation_ids) || base.input.invocation_ids.length === 0 || base.input.invocation_ids.length > 100) throw new ControlPlaneFault("INVALID_REQUEST", "invocation_ids must contain one to 100 imported CLI invocation IDs");
        const ids = base.input.invocation_ids.map((value, index) => requireString(value, `invocation_ids[${index}]`));
        if (new Set(ids).size !== ids.length) throw new ControlPlaneFault("INVALID_REQUEST", "invocation_ids must not repeat");
        return ids;
      })()
      : undefined;
    const parsed = { version: CONTROL_PLANE_PROTOCOL_VERSION, request_id: base.request_id, kind: "command" as const, name: base.name, input: { [key]: requireRecord(base.input[key], key), ...(invocationIds === undefined ? {} : { invocation_ids: invocationIds }), retained_evidence: parseRetainedEvidenceBytes(base.input.retained_evidence) } };
    return parsed as EvaluationRunStartCommand | EvaluationRunOutcomeCommand;
  }
  if (base.name !== "directive.transition") throw new ControlPlaneFault("INVALID_REQUEST", "Unknown command name");
  requireExactKeys(base.input, [
    "directive_id",
    "run_id",
    "manifest_id",
    "manifest_revision",
    "manifest_sha256",
    "expected_state",
    "to_state",
    "control_surface_id",
    "evidence",
    "receipt_ids",
  ]);
  return {
    version: CONTROL_PLANE_PROTOCOL_VERSION,
    request_id: base.request_id,
    kind: "command",
    name: "directive.transition",
    input: {
      directive_id: requireString(base.input.directive_id, "directive_id") as DirectiveId,
      run_id: requireString(base.input.run_id, "run_id") as RunId,
      manifest_id: requireString(base.input.manifest_id, "manifest_id") as ManifestId,
      manifest_revision: requireInteger(base.input.manifest_revision, "manifest_revision", 1, Number.MAX_SAFE_INTEGER),
      manifest_sha256: requireSha256(base.input.manifest_sha256, "manifest_sha256"),
      expected_state: requireNullableDirectiveState(base.input.expected_state, "expected_state"),
      to_state: requireDirectiveState(base.input.to_state, "to_state"),
      control_surface_id: requireNullableString(base.input.control_surface_id, "control_surface_id") as ControlSurfaceId | null,
      evidence: parseEvidence(base.input.evidence),
      receipt_ids: parseReceiptIds(base.input.receipt_ids),
    },
  };
}

export function requestIdFromUnknown(value: unknown): string | null {
  if (!isRecord(value) || typeof value.request_id !== "string" || value.request_id.length === 0 || value.request_id.length > 256) return null;
  return value.request_id;
}
