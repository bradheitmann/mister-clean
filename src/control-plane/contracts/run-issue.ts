import type {
  CleanlinessVerdict,
  DetectorSetId,
  EvidenceRef,
  IsoTimestamp,
  IssueGraphId,
  IssueId,
  ObservationId,
  RepositorySubject,
  RunId,
  Sha256,
} from "./primitives.js";
import * as z from "zod";

export const RUN_STATES = [
  "initializing",
  "auditing",
  "planning",
  "ready",
  "operating",
  "verifying",
  "clean",
  "not_clean_blocked",
  "not_clean_stopped",
  "invalidated",
] as const;

export type RunState = (typeof RUN_STATES)[number];

export const ISSUE_STATES = [
  "open",
  "claimed",
  "in_progress",
  "verification_pending",
  "paid",
  "blocked",
  "false_positive",
] as const;

export type IssueState = (typeof ISSUE_STATES)[number];

export const ISSUE_ORIGINS = [
  "baseline",
  "introduced_by_run",
  "newly_discovered_preexisting",
  "concurrent_external",
  "unestablished",
] as const;

export type IssueOrigin = (typeof ISSUE_ORIGINS)[number];

export const ISSUE_DISPOSITIONS = [
  "autonomously_repair",
  "autonomously_validate",
  "accepted_exception",
  "decision_or_coordination_required",
] as const;

export type IssueDisposition = (typeof ISSUE_DISPOSITIONS)[number];

export const CONCURRENCY_CLASSES = [
  "Parallelizable",
  "Ordered",
  "Blocked",
] as const;

export type ConcurrencyClass = (typeof CONCURRENCY_CLASSES)[number];

export interface DetectorSetBinding {
  readonly detector_set_id: DetectorSetId;
  readonly version: string;
  readonly sha256: Sha256;
  readonly runtime_identity_sha256: Sha256;
  readonly coverage_ref: EvidenceRef;
}

export interface DebtFlow {
  readonly starting_real_issues: number;
  readonly discovered_preexisting: number;
  readonly caused_by_remediation: number;
  readonly concurrently_introduced: number;
  readonly paid: number;
  readonly invalidated_false_positives: number;
  readonly classification_correction_delta: number;
  readonly ending_real_issues: number;
  readonly boundary_blocked: number;
}

export interface RunObservation {
  readonly run_id: RunId;
  readonly observed_at: IsoTimestamp;
  readonly mister_clean_version: string;
  readonly detector_set: DetectorSetBinding;
  readonly subject: RepositorySubject;
  readonly scope: readonly string[];
  readonly exclusions: readonly string[];
  readonly start_verdict: CleanlinessVerdict;
  readonly terminal_verdict: CleanlinessVerdict;
  readonly terminal_state: RunState;
  readonly debt_flow: DebtFlow;
  readonly evidence: readonly EvidenceRef[];
}

export interface RunInterpretation {
  readonly source_run_id: RunId;
  readonly interpreted_at: IsoTimestamp;
  readonly detector_set: DetectorSetBinding;
  readonly real_issue_ids: readonly IssueId[];
  readonly false_positive_issue_ids: readonly IssueId[];
  readonly classification_corrections: readonly IssueClassificationCorrection[];
  readonly debt_flow: DebtFlow;
  readonly evidence: readonly EvidenceRef[];
}

export interface IssueObservation {
  readonly observation_id: ObservationId;
  readonly detector_set_id: DetectorSetId;
  readonly detector_native_fingerprint: string;
  readonly first_observed_run_id: RunId;
  readonly observed_subject: RepositorySubject;
  readonly title: string;
  readonly description: string;
  readonly affected_paths: readonly string[];
  readonly evidence: readonly EvidenceRef[];
}

export interface IssueRoot {
  readonly issue_id: IssueId;
  readonly stable_cause_key: string;
  readonly normalizer: string;
  readonly title: string;
  readonly description: string;
  readonly debt_domain: string;
  readonly technical_or_agentic: "technical" | "agentic_operational";
  readonly state: IssueState;
  readonly origin: IssueOrigin;
  readonly disposition: IssueDisposition;
  readonly severity: 1 | 2 | 3 | 4 | 5;
  readonly remediation_difficulty: 1 | 2 | 3 | 4 | 5;
  readonly confidence: number;
  readonly first_detected_run_id: RunId;
  readonly observation_ids: readonly ObservationId[];
  readonly affected_invariants: readonly string[];
  readonly affected_paths: readonly string[];
  readonly acceptance_boundary: readonly string[];
  readonly evidence: readonly EvidenceRef[];
}

const issueText = z.string().min(1);
const issueDigest = issueText.regex(/^[a-f0-9]{64}$/i);
const issueEvidence = z.object({ path: issueText, sha256: issueDigest, record_type: issueText.optional() }).strict();

/** Canonical repository issue-root authority bytes. */
export const issueRootSchema = z.object({
  issue_id: issueText, stable_cause_key: issueText, normalizer: issueText, title: issueText, description: issueText, debt_domain: issueText,
  technical_or_agentic: z.enum(["technical", "agentic_operational"]), state: z.enum([...ISSUE_STATES] as [string, ...string[]]),
  origin: z.enum([...ISSUE_ORIGINS] as [string, ...string[]]), disposition: z.enum([...ISSUE_DISPOSITIONS] as [string, ...string[]]),
  severity: z.number().int().min(1).max(5).safe(), remediation_difficulty: z.number().int().min(1).max(5).safe(), confidence: z.number().min(0).max(1),
  first_detected_run_id: issueText, observation_ids: z.array(issueText), affected_invariants: z.array(issueText), affected_paths: z.array(issueText),
  acceptance_boundary: z.array(issueText), evidence: z.array(issueEvidence),
}).strict();

export function parseCanonicalIssueRoot(value: unknown): IssueRoot {
  return issueRootSchema.parse(value) as unknown as IssueRoot;
}

export const ISSUE_EDGE_KINDS = [
  "requires",
  "blocks",
  "root_of",
  "duplicate_of",
  "conflicts_with",
  "invalidates",
] as const;

export type IssueEdgeKind = (typeof ISSUE_EDGE_KINDS)[number];

export interface IssueEdge {
  readonly from_issue_id: IssueId;
  readonly to_issue_id: IssueId;
  readonly kind: IssueEdgeKind;
  readonly evidence: readonly EvidenceRef[];
}

export interface IssueGraphSnapshot {
  readonly issue_graph_id: IssueGraphId;
  readonly version: number;
  readonly sha256: Sha256;
  readonly created_at: IsoTimestamp;
  readonly run_id: RunId;
  readonly issue_ids: readonly IssueId[];
  readonly edges: readonly IssueEdge[];
}

export const ISSUE_EVENT_KINDS = [
  "detected",
  "classified",
  "claimed",
  "work_started",
  "verification_requested",
  "paid",
  "blocked",
  "unblocked",
  "false_positive",
  "reopened",
  "merged",
  "split",
] as const;

export type IssueEventKind = (typeof ISSUE_EVENT_KINDS)[number];

export interface IssueEvent {
  readonly issue_id: IssueId;
  readonly run_id: RunId;
  readonly kind: IssueEventKind;
  readonly occurred_at: IsoTimestamp;
  readonly from_state: IssueState | null;
  readonly to_state: IssueState;
  readonly evidence: readonly EvidenceRef[];
}

export interface IssueClassificationCorrection {
  readonly issue_id: IssueId;
  readonly corrected_at: IsoTimestamp;
  readonly prior_classification: string;
  readonly current_classification: string;
  readonly reason: string;
  readonly evidence: readonly EvidenceRef[];
}

export interface PlannedIssue {
  readonly issue_id: IssueId;
  readonly order: number;
  readonly concurrency: ConcurrencyClass;
  readonly prerequisite_issue_ids: readonly IssueId[];
  readonly unlock_value: number;
  readonly regression_risk: number;
  readonly classification_reason: readonly string[];
}
