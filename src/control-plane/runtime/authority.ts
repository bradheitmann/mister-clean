import * as z from "zod";

import { canonicalJson, sha256Bytes } from "../../canonical-json.js";
import type { RepositorySubject, Sha256 } from "../contracts/primitives.js";
import type { RemediationWaveManifest } from "../contracts/wave-directive.js";

export { canonicalJson, sha256Bytes };

const CONTROL_FREE = /^[^\u0000-\u001f\u007f]+$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SHA256 = /^[0-9a-f]{64}$/;

const boundedString = (maximum = 4096) => z.string().min(1).max(maximum).regex(CONTROL_FREE);
const identifier = boundedString(512);
const sha256 = z.string().regex(SHA256);
const isoTimestamp = z.string().regex(ISO_TIMESTAMP).refine((value) => Number.isFinite(Date.parse(value)));

const evidenceRefSchema = z.object({
  path: boundedString(4096),
  sha256,
  record_type: boundedString(256).optional(),
}).strict();

export const repositorySubjectSchema = z.object({
  repository_id: identifier,
  branch: boundedString(1024),
  commit: boundedString(512),
  tree: boundedString(512),
  repository_object_sha256: sha256,
  observed_at: isoTimestamp,
}).strict();

const coordinationExpectationSchema = z.object({
  key: identifier,
  access: z.enum(["read", "write"]),
  expected_version: z.number().int().nonnegative(),
  expected_state_digest: sha256,
  operation_class: boundedString(256),
  commutes_with: z.array(boundedString(256)).max(1_000),
  commutativity_ref: evidenceRefSchema.nullable(),
}).strict();

const leaseExpectationSchema = z.object({
  lease_id: identifier,
  fencing_token: z.number().int().positive(),
  worktree: boundedString(4096),
  branch: boundedString(1024),
  owner: identifier,
  expires_at: isoTimestamp,
}).strict();

const assignmentSchema = z.object({
  agent_tuple_id: identifier,
  execution_route_id: identifier,
  required_capabilities: z.array(identifier).min(1).max(24),
  routing_evidence: z.array(evidenceRefSchema).min(1).max(1_000),
  fallback_agent_tuple_id: identifier.nullable(),
  fallback_execution_route_id: identifier.nullable(),
}).strict();

const readCustodySchema = z.object({
  protected_paths: z.array(boundedString(4096)).max(10_000),
  permitted_metadata_paths: z.array(boundedString(4096)).max(10_000),
  enforcement: z.enum(["not_applicable", "filesystem_sandbox", "externalized"]),
  evidence: z.array(evidenceRefSchema).max(1_000),
}).strict().superRefine((custody, context) => {
  if (custody.protected_paths.length > 0 && custody.enforcement === "not_applicable") {
    context.addIssue({ code: "custom", message: "protected read paths require mechanical enforcement" });
  }
  if (custody.protected_paths.length > 0 && custody.evidence.length === 0) {
    context.addIssue({ code: "custom", message: "protected read custody requires enforcement evidence" });
  }
  if (custody.protected_paths.length === 0 && custody.enforcement !== "not_applicable") {
    context.addIssue({ code: "custom", message: "read-custody enforcement requires an explicit protected path set" });
  }
});

const laneSchema = z.object({
  lane_id: identifier,
  task_id: identifier,
  role: z.enum(["read_only", "writer", "integrator"]),
  state: z.enum(["queued", "active", "ready", "integrated", "retired", "blocked"]),
  owner: identifier,
  issue_ids: z.array(identifier).max(10_000),
  dependencies: z.array(identifier).max(10_000),
  worktree: boundedString(4096).nullable(),
  branch: boundedString(1024).nullable(),
  baseline_commit: boundedString(512),
  read_paths: z.array(boundedString(4096)).max(10_000),
  read_custody: readCustodySchema,
  write_paths: z.array(boundedString(4096)).max(10_000),
  invariants: z.array(boundedString(4096)).max(10_000),
  acceptance: z.array(boundedString(4096)).min(1).max(10_000),
  context_budget_tokens: z.number().int().positive(),
  assignment: assignmentSchema,
  lease: leaseExpectationSchema.nullable(),
  coordination_claims: z.array(coordinationExpectationSchema).max(10_000),
}).strict().superRefine((lane, context) => {
  if (lane.role === "read_only" && (lane.worktree !== null || lane.branch !== null || lane.lease !== null || lane.write_paths.length > 0)) {
    context.addIssue({ code: "custom", message: "read-only lanes cannot carry writer state" });
  }
  if (lane.role !== "read_only" && (lane.worktree === null || lane.branch === null || lane.lease === null || lane.write_paths.length === 0)) {
    context.addIssue({ code: "custom", message: "writer and integrator lanes require worktree, branch, lease, and write scope" });
  }
  if (lane.lease !== null && (lane.worktree !== lane.lease.worktree || lane.branch !== lane.lease.branch || lane.owner !== lane.lease.owner)) {
    context.addIssue({ code: "custom", message: "lane identity must match its writer lease" });
  }
});

const trackSchema = z.object({
  track_id: identifier,
  lane_ids: z.array(identifier).min(1).max(10_000),
  issue_ids: z.array(identifier).min(1).max(10_000),
}).strict();

const waveSchema = z.object({
  wave_id: identifier,
  sequence: z.number().int().positive(),
  state: z.enum(["planned", "admitted", "running", "verifying", "ready_to_integrate", "integrating", "integrated", "blocked", "stale", "aborted"]),
  prerequisite_wave_ids: z.array(identifier).max(10_000),
  tracks: z.array(trackSchema).min(1).max(10_000),
  integration_barrier: z.array(boundedString(4096)).min(1).max(10_000),
}).strict();

const optimizationSchema = z.object({
  policy_id: identifier,
  severity_weight: z.number().finite().nonnegative(),
  difficulty_weight: z.number().finite().nonnegative(),
  unlock_value_weight: z.number().finite().nonnegative(),
  regression_risk_weight: z.number().finite().nonnegative(),
  cost_tiebreak: z.boolean(),
  speed_tiebreak: z.boolean(),
  overrides: z.array(z.object({
    what: boundedString(4096),
    why: boundedString(4096),
    risk: boundedString(4096),
    approver: identifier,
    evidence: z.array(evidenceRefSchema).min(1).max(1_000),
  }).strict()).max(1_000),
}).strict();

export const remediationWaveManifestSchema = z.object({
  record_type: z.literal("mister-clean.action-manifest"),
  schema_version: z.literal("1.3"),
  manifest_kind: z.literal("remediation_wave"),
  manifest_id: identifier,
  revision: z.number().int().positive(),
  parent_manifest_sha256: sha256.nullable(),
  run_id: identifier,
  created_at: isoTimestamp,
  created_by: identifier,
  authority_mode: z.enum(["ADVISE", "OPERATE"]),
  repository: repositorySubjectSchema,
  target_ref: boundedString(1024),
  expected_target_commit: boundedString(512),
  detector_set_sha256: sha256,
  policy_sha256: sha256,
  issue_graph: z.object({
    issue_graph_id: identifier,
    version: z.number().int().positive(),
    sha256,
  }).strict(),
  selected_issue_ids: z.array(identifier).max(10_000),
  optimization: optimizationSchema,
  waves: z.array(waveSchema).max(10_000),
  lanes: z.array(laneSchema).max(10_000),
  parent_operation_ids: z.array(identifier).max(10_000),
  no_harm_comparators: z.array(boundedString(4096)).min(1).max(10_000),
  native_gates: z.array(boundedString(4096)).min(1).max(10_000),
  rollback: z.array(boundedString(4096)).min(1).max(10_000),
  receipt_requirements: z.array(z.object({
    role: z.enum(["dev", "qa", "mister_clean", "holdout", "integrator"]),
    independent: z.boolean(),
    required_claims: z.array(identifier).min(1).max(1_000),
  }).strict()).min(1).max(100),
  projections: z.array(z.object({
    kind: z.enum(["human_prompt", "qa_packet", "holdout_packet", "ui_directive"]),
    schema_version: identifier,
    sha256,
  }).strict()).min(1).max(1_000),
  terminal_issue_dispositions: z.array(z.object({
    issue_id: identifier,
    required_terminal_state: z.enum(["paid", "false_positive"]),
  }).strict()).max(10_000),
  hard_boundaries: z.array(boundedString(4096)).max(10_000),
  excluded_actions: z.array(boundedString(4096)).max(10_000),
  self_audit: z.object({
    status: z.enum(["passed", "failed"]),
    checked_at: isoTimestamp,
    evidence: z.array(evidenceRefSchema).min(1).max(1_000),
  }).strict(),
}).strict().superRefine((manifest, context) => {
  const laneIds = new Set(manifest.lanes.map((lane) => lane.lane_id));
  const selectedIssues = new Set(manifest.selected_issue_ids);
  for (const wave of manifest.waves) {
    for (const track of wave.tracks) {
      for (const laneId of track.lane_ids) if (!laneIds.has(laneId)) context.addIssue({ code: "custom", message: `track references unknown lane ${laneId}` });
      for (const issueId of track.issue_ids) if (!selectedIssues.has(issueId)) context.addIssue({ code: "custom", message: `track references unselected issue ${issueId}` });
    }
  }
  for (const lane of manifest.lanes) {
    for (const dependency of lane.dependencies) if (!laneIds.has(dependency)) context.addIssue({ code: "custom", message: `lane references unknown dependency ${dependency}` });
    for (const issueId of lane.issue_ids) if (!selectedIssues.has(issueId)) context.addIssue({ code: "custom", message: `lane references unselected issue ${issueId}` });
  }
  const receiptRoles = new Set<string>();
  for (const requirement of manifest.receipt_requirements) {
    if (receiptRoles.has(requirement.role)) context.addIssue({ code: "custom", message: `duplicate receipt requirement role ${requirement.role}` });
    receiptRoles.add(requirement.role);
  }
});

export interface RuntimeBoundReceipt {
  readonly receipt_id: string;
  readonly state: "draft" | "sealed" | "verified" | "rejected";
  readonly run_id: string;
  readonly manifest_id: string;
  readonly manifest_revision: number;
  readonly manifest_sha256: Sha256;
  readonly baseline_repository: RepositorySubject;
  readonly output_repository: RepositorySubject;
  readonly role: "dev" | "qa" | "mister_clean" | "holdout" | "integrator";
  readonly actor: string;
  readonly claims: readonly string[];
  readonly conclusion: "pass" | "fail";
  readonly sealed_at: string | null;
  readonly evidence: readonly { readonly path: string; readonly sha256: Sha256; readonly record_type?: string }[];
}

export const runtimeBoundReceiptSchema = z.object({
  receipt_id: identifier,
  state: z.enum(["draft", "sealed", "verified", "rejected"]),
  run_id: identifier,
  manifest_id: identifier,
  manifest_revision: z.number().int().positive(),
  manifest_sha256: sha256,
  baseline_repository: repositorySubjectSchema,
  output_repository: repositorySubjectSchema,
  role: z.enum(["dev", "qa", "mister_clean", "holdout", "integrator"]),
  actor: identifier,
  claims: z.array(identifier).min(1).max(1_000),
  conclusion: z.enum(["pass", "fail"]),
  sealed_at: isoTimestamp.nullable(),
  evidence: z.array(evidenceRefSchema).min(1).max(1_000),
}).strict();

export function parseCanonicalManifest(bytes: string): RemediationWaveManifest {
  const parsed = remediationWaveManifestSchema.parse(JSON.parse(bytes)) as unknown as RemediationWaveManifest;
  if (canonicalJson(parsed) !== bytes) throw new Error("Stored manifest bytes are not canonical JSON");
  return parsed;
}

export function parseCanonicalReceipt(bytes: string): RuntimeBoundReceipt {
  const parsed = runtimeBoundReceiptSchema.parse(JSON.parse(bytes)) as unknown as RuntimeBoundReceipt;
  if (canonicalJson(parsed) !== bytes) throw new Error("Stored receipt bytes are not canonical JSON");
  return parsed;
}
