/**
 * Frozen oracles for mg-s2d-phase-registry: verbatim copies, from main caa59e9, of the
 * hand-written family lists and of the four functions that branched on a family id,
 * as they stood before the slice derived them from src/closeout/phase-registry.ts.
 *
 * Each copy sits between a BEGIN and an END marker line that names its base path and
 * line range, so `git show caa59e9:<path> | sed -n <range>p` diffs clean against the
 * lines between the markers once a leading `export ` is removed. Do not reformat them.
 *
 * Helpers the base functions call are imported from their current modules when they are
 * exported and this slice leaves them alone (fingerprint digests, sortedUnique, the
 * receipt fingerprint, the bundle-runtime accessors). The per-family validators and the
 * small predicates of detector-coverage.ts and finding-anchors.ts are private there, so
 * they are copied here too; the golden commit changes no production file.
 *
 * Never import this file from non-test code.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import type { CanonicalRootProjection } from "./bundle-detector-evidence.js";
import { array, object, type JsonObject } from "./bundle-runtime.js";
import {
  languagePolicyFingerprint,
  planningFindingFingerprint,
  semanticFindingFingerprint,
  sortedUnique,
} from "./detector-coverage.js";
import {
  normalizeWhitespace,
  receiptFingerprint,
  sha256Text,
  trimmedLineSha256,
  workingTreeBlobOids,
  type AnchorContext,
  type AnchorKind,
  type AnchoredFinding,
  type EarlierBytesProbe,
} from "./finding-anchors.js";
import { causalPlanningAccounting, type PlanningFinding } from "./planning.js";
import { canonicalObservationId, canonicalRootDebtKey } from "./regression-accounting.js";
import { semanticCandidateSetSha256, type SemanticProbeCandidate } from "./semantic.js";

export const oracle_detector_coverage = (() => {
// BEGIN registry_5 (src/closeout/detector-coverage.ts:43,68 at caa59e9)
const DETECTOR_REGISTRY_V5 = [
  {
    id: "planning_graph",
    scope: ".",
    command: "mister-clean audit planning . --json",
    detector: "mister-clean/planning_graph@2",
  },
  {
    id: "public_safety",
    scope: "tracked_shippable",
    command: "mister-clean audit public-safety . --tracked --json",
    detector: "mister-clean/public_safety@1",
  },
  {
    id: "github_actions",
    scope: ".",
    command: "mister-clean audit github-actions . --json",
    detector: "mister-clean/github_actions@3",
  },
  {
    id: "semantic_boundary",
    scope: ".",
    command: "mister-clean audit semantic . --json",
    detector: "mister-clean/semantic_boundary@1",
  },
] as const;
// END registry_5
// BEGIN closeout_detectors (src/closeout/detector-coverage.ts:73,81 at caa59e9)
const CLOSEOUT_DETECTORS = [
  ...DETECTOR_REGISTRY_V5,
  {
    id: "language_policy",
    scope: "tracked_shippable",
    command: "mister-clean audit language-policy . --json",
    detector: "mister-clean/language_policy@1",
  },
] as const;
// END closeout_detectors
// BEGIN digest (src/closeout/detector-coverage.ts:272,274 at caa59e9)
function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
// END digest
// BEGIN predicates (src/closeout/detector-coverage.ts:371,391 at caa59e9)
function object(value: unknown): Record<string, unknown> | undefined {
  return !!value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonempty);
}

function hexSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
// END predicates
// BEGIN require_fields (src/closeout/detector-coverage.ts:393,405 at caa59e9)
function requireFields(
  record: Record<string, unknown> | undefined,
  fields: readonly string[],
  path: string,
  errors: string[],
): record is Record<string, unknown> {
  if (!record) {
    errors.push(`${path}: expected object`);
    return false;
  }
  for (const field of fields) if (!(field in record)) errors.push(`${path}.${field}: missing`);
  return true;
}
// END require_fields
// BEGIN validators_planning_semantic_public_safety (src/closeout/detector-coverage.ts:499,778 at caa59e9)
function validatePlanningResult(record: Record<string, unknown>, errors: string[]): void {
  const numericFields = [
    "artifactCount", "candidate_probe_count", "planningRootCount", "raw_finding_count",
    "root_debt_count", "structuredArtifactCount", "suppressed_by_typed_nonartifact_count",
  ] as const;
  requireFields(record, [
    ...numericFields, "counts", "exitCode", "findings", "raw_findings", "root_debts", "status",
  ], "$", errors);
  for (const field of numericFields) {
    if (!nonnegativeInteger(record[field])) errors.push(`$.${field}: expected nonnegative integer`);
  }
  const findings = Array.isArray(record.findings) ? record.findings : [];
  const rawFindings = Array.isArray(record.raw_findings) ? record.raw_findings : [];
  const rootDebts = Array.isArray(record.root_debts) ? record.root_debts : [];
  if (!Array.isArray(record.findings)) errors.push("$.findings: expected array");
  if (!Array.isArray(record.raw_findings)) errors.push("$.raw_findings: expected array");
  if (!Array.isArray(record.root_debts)) errors.push("$.root_debts: expected array");
  if (record.raw_finding_count !== rawFindings.length || findings.length !== rawFindings.length) {
    errors.push("$.raw_finding_count: must equal findings and raw_findings lengths");
  }
  if (record.root_debt_count !== rootDebts.length) errors.push("$.root_debt_count: must equal root_debts length");
  if (nonnegativeInteger(record.structuredArtifactCount) && nonnegativeInteger(record.artifactCount)
    && record.structuredArtifactCount > record.artifactCount) {
    errors.push("$.structuredArtifactCount: cannot exceed artifactCount");
  }
  const counts = object(record.counts);
  if (!counts || Object.values(counts).some((value) => !nonnegativeInteger(value))) {
    errors.push("$.counts: expected nonnegative integer values");
  } else if (Object.values(counts).map(Number).reduce((sum, value) => sum + value, 0) !== findings.length) {
    errors.push("$.counts: values must sum to findings length");
  }
  let findingsHaveCanonicalShape = true;
  for (const [index, value] of findings.entries()) {
    const row = object(value);
    requireFields(row, ["code", "detail", "path", "related", "subject"], `$.findings[${index}]`, errors);
    if (row && (!nonempty(row.code) || !nonempty(row.detail) || !nonempty(row.path)
      || !stringArray(row.related) || !nonempty(row.subject))) {
      errors.push(`$.findings[${index}]: invalid canonical planning finding`);
      findingsHaveCanonicalShape = false;
    } else if (!row) {
      findingsHaveCanonicalShape = false;
    }
  }
  const rawIds = new Set<string>();
  for (const [index, value] of rawFindings.entries()) {
    const row = object(value);
    requireFields(row, [
      "code", "detail", "detector", "evidence_refs", "id", "path", "related", "snapshot", "subject",
    ], `$.raw_findings[${index}]`, errors);
    if (!row) continue;
    if (!nonempty(row.id) || rawIds.has(row.id)) errors.push(`$.raw_findings[${index}].id: required unique string`);
    else rawIds.add(row.id);
    if (row.detector !== "planning_graph" || !stringArray(row.evidence_refs) || !nonempty(row.snapshot)) {
      errors.push(`$.raw_findings[${index}]: invalid canonical raw planning finding`);
    }
  }
  const assignedRawIds = new Set<string>();
  const rootIds = new Set<string>();
  for (const [index, value] of rootDebts.entries()) {
    const row = object(value);
    requireFields(row, [
      "affected_paths", "affected_projection_field", "causal_evidence", "cause_key", "class",
      "detector_family", "id", "observation_count", "raw_finding_ids", "repair_boundary", "snapshot",
    ], `$.root_debts[${index}]`, errors);
    if (!row) continue;
    if (!nonempty(row.id) || rootIds.has(row.id)) errors.push(`$.root_debts[${index}].id: required unique string`);
    else rootIds.add(row.id);
    if (!stringArray(row.affected_paths) || !nonempty(row.affected_projection_field)
      || !object(row.causal_evidence) || !nonempty(row.cause_key) || !nonempty(row.class)
      || row.detector_family !== "planning_graph" || !stringArray(row.raw_finding_ids)
      || !nonempty(row.repair_boundary) || !nonempty(row.snapshot)
      || row.observation_count !== (row.raw_finding_ids as string[]).length) {
      errors.push(`$.root_debts[${index}]: invalid canonical planning root debt`);
    }
    if (stringArray(row.raw_finding_ids) && row.raw_finding_ids.length === 0) {
      errors.push(`$.root_debts[${index}].raw_finding_ids: root debt must own at least one canonical raw finding`);
    }
    for (const rawId of stringArray(row.raw_finding_ids) ? row.raw_finding_ids : []) {
      if (!rawIds.has(rawId) || assignedRawIds.has(rawId)) {
        errors.push(`$.root_debts[${index}].raw_finding_ids: must partition canonical raw findings`);
      }
      assignedRawIds.add(rawId);
    }
  }
  if (assignedRawIds.size !== rawIds.size) errors.push("$.root_debts: must account for every raw finding exactly once");
  if (findingsHaveCanonicalShape) {
    const snapshots = new Set<string>();
    for (const value of [...rawFindings, ...rootDebts]) {
      const snapshot = object(value)?.snapshot;
      if (nonempty(snapshot)) snapshots.add(snapshot);
    }
    if (findings.length > 0 && snapshots.size !== 1) {
      errors.push("$.raw_findings: canonical planning projection requires exactly one shared snapshot");
    } else {
      const expected = causalPlanningAccounting(
        findings as PlanningFinding[],
        snapshots.values().next().value ?? "unbound",
      );
      if (!isDeepStrictEqual(rawFindings, expected.rawFindings)) {
        errors.push("$.raw_findings: must equal the deterministic causal projection derived from findings and snapshot");
      }
      if (!isDeepStrictEqual(rootDebts, expected.rootDebts)) {
        errors.push("$.root_debts: must equal the deterministic causal projection derived from findings and snapshot");
      }
    }
  }
  const expectedStatus = Number(record.planningRootCount) === 0 && findings.length === 0
    ? "not_applicable"
    : findings.length > 0 ? "fail" : "pass";
  if (record.status !== expectedStatus) errors.push(`$.status: expected ${expectedStatus}`);
  if (record.exitCode !== (expectedStatus === "fail" ? 1 : 0)) errors.push("$.exitCode: disagrees with status");
}

function validateSemanticResult(record: Record<string, unknown>, errors: string[]): void {
  const semanticKinds = new Set([
    "acceptance_effect_liveness",
    "authoritative_projection",
    "behavioral_dimension",
    "bounded_state_lifecycle",
    "composition_root_reachability",
    "construction_boundary",
    "environment_semantics",
    "executable_surface_coverage",
    "execution_identity_coverage",
    "failure_domain_independence",
    "gate_semantic_bite",
    "historical_evidence_portability",
    "identifier_namespace",
    "instruction_polarity",
    "representation_equivalence",
    "supersession_lineage",
  ]);
  const numericFields = [
    "candidate_probe_count", "confirmed_failure_count", "executed_probe_count",
    "pending_probe_count", "resolved_probe_count",
  ] as const;
  requireFields(record, [
    ...numericFields, "candidate_set_sha256", "candidates", "executions", "exitCode", "findings",
    "resolutions", "snapshot", "status", "working_tree_sha256",
  ], "$", errors);
  for (const field of numericFields) if (!nonnegativeInteger(record[field])) errors.push(`$.${field}: expected nonnegative integer`);
  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  const executions = Array.isArray(record.executions) ? record.executions : [];
  const findings = Array.isArray(record.findings) ? record.findings : [];
  const resolutions = Array.isArray(record.resolutions) ? record.resolutions : [];
  for (const field of ["candidates", "executions", "findings", "resolutions"] as const) {
    if (!Array.isArray(record[field])) errors.push(`$.${field}: expected array`);
  }
  if (!hexSha256(record.candidate_set_sha256)) errors.push("$.candidate_set_sha256: expected lowercase SHA-256");
  if (!hexSha256(record.working_tree_sha256)) errors.push("$.working_tree_sha256: expected lowercase SHA-256");
  if (!nonempty(record.snapshot)) errors.push("$.snapshot: required");
  if (record.candidate_probe_count !== candidates.length) errors.push("$.candidate_probe_count: must equal candidates length");
  if (record.executed_probe_count !== executions.length) errors.push("$.executed_probe_count: must equal executions length");
  if (record.resolved_probe_count !== resolutions.length) errors.push("$.resolved_probe_count: must equal resolutions length");
  if (record.confirmed_failure_count !== findings.filter((value) => object(value)?.classification === "confirmed_product_defect").length) {
    errors.push("$.confirmed_failure_count: must equal confirmed product-defect findings");
  }
  if (record.pending_probe_count !== findings.filter((value) => object(value)?.classification === "operate_time_pending").length) {
    errors.push("$.pending_probe_count: must equal operate-time-pending findings");
  }
  const candidateIds = new Set<string>();
  for (const [index, value] of candidates.entries()) {
    const row = object(value);
    requireFields(row, ["evidence", "id", "kind", "path", "refs"], `$.candidates[${index}]`, errors);
    if (!row) continue;
    if (!nonempty(row.id) || candidateIds.has(row.id)) errors.push(`$.candidates[${index}].id: required unique string`);
    else candidateIds.add(row.id);
    if (!stringArray(row.evidence) || !semanticKinds.has(String(row.kind))
      || !nonempty(row.path) || !stringArray(row.refs)) errors.push(`$.candidates[${index}]: invalid semantic candidate`);
  }
  if (candidates.every((value) => {
    const row = object(value);
    return row && stringArray(row.evidence) && nonempty(row.id)
      && semanticKinds.has(String(row.kind))
      && nonempty(row.path) && stringArray(row.refs);
  }) && record.candidate_set_sha256 !== semanticCandidateSetSha256(candidates as SemanticProbeCandidate[])) {
    errors.push("$.candidate_set_sha256: must equal the deterministic digest of candidates");
  }
  const executionIds = new Set<string>();
  for (const [index, value] of executions.entries()) {
    const row = object(value);
    requireFields(row, [
      "candidate_id", "command_sha256", "evidence_sha256", "executable", "observed_status",
      "receipt_sha256", "result",
    ], `$.executions[${index}]`, errors);
    if (!row) continue;
    if (!nonempty(row.candidate_id) || executionIds.has(row.candidate_id) || !candidateIds.has(String(row.candidate_id))) {
      errors.push(`$.executions[${index}].candidate_id: must name one unique discovered candidate`);
    } else executionIds.add(row.candidate_id);
    if (!hexSha256(row.command_sha256) || !hexSha256(row.evidence_sha256) || !nonempty(row.executable)
      || !(row.observed_status === null || Number.isInteger(row.observed_status)) || !hexSha256(row.receipt_sha256)
      || !new Set(["error", "fail", "pass"]).has(String(row.result))) {
      errors.push(`$.executions[${index}]: invalid semantic execution`);
    }
  }
  let manifestBoundaryCount = 0;
  for (const [index, value] of findings.entries()) {
    const row = object(value);
    requireFields(row, ["candidate_id", "classification", "code", "detail", "kind", "refs"], `$.findings[${index}]`, errors);
    if (row && (!nonempty(row.candidate_id)
      || !new Set(["confirmed_product_defect", "operate_time_pending", "verification_debt"]).has(String(row.classification))
      || !nonempty(row.code) || !nonempty(row.detail)
      || !semanticKinds.has(String(row.kind))
      || !stringArray(row.refs))) errors.push(`$.findings[${index}]: invalid semantic finding`);
    const typedManifestBoundary = row?.candidate_id === "manifest"
      && row.code === "semantic_probe_manifest_invalid"
      && row.classification === "verification_debt"
      && row.kind === "construction_boundary";
    if (typedManifestBoundary) {
      manifestBoundaryCount += 1;
      if (!stringArray(row?.refs) || row.refs.length === 0) {
        errors.push(`$.findings[${index}].refs: manifest boundary requires a manifest evidence reference`);
      }
    }
    if (row && nonempty(row.candidate_id) && !candidateIds.has(row.candidate_id) && !typedManifestBoundary) {
      errors.push(`$.findings[${index}].candidate_id: must name one discovered candidate`);
    }
  }
  if (manifestBoundaryCount > 0 && !hexSha256(record.manifest_sha256)) {
    errors.push("$.manifest_sha256: manifest boundary requires the observed manifest digest");
  }
  const resolutionIds = new Set<string>();
  for (const [index, value] of resolutions.entries()) {
    const row = object(value);
    requireFields(row, ["candidate_id", "disposition", "evidence_refs", "rationale"], `$.resolutions[${index}]`, errors);
    if (!row) continue;
    if (!nonempty(row.candidate_id) || resolutionIds.has(row.candidate_id) || !candidateIds.has(String(row.candidate_id))) {
      errors.push(`$.resolutions[${index}].candidate_id: must name one unique discovered candidate`);
    } else resolutionIds.add(row.candidate_id);
    const refs = Array.isArray(row.evidence_refs) ? row.evidence_refs : [];
    const disposition = String(row.disposition);
    if (!new Set(["attested_satisfied", "deterministically_satisfied", "not_applicable"]).has(disposition)
      || !Array.isArray(row.evidence_refs) || refs.some((ref) => {
      const item = object(ref);
      return !item || !nonempty(item.path) || !hexSha256(item.sha256);
    }) || ((disposition === "attested_satisfied" || disposition === "not_applicable") && refs.length === 0)
      || !nonempty(row.rationale)) errors.push(`$.resolutions[${index}]: invalid semantic resolution`);
  }
  const expectedStatus = candidates.length === 0 && findings.length === 0
    ? "not_applicable"
    : findings.length > 0 ? "fail" : "pass";
  if (record.status !== expectedStatus) errors.push(`$.status: expected ${expectedStatus}`);
  const acceptedExitCodes = expectedStatus === "fail" ? new Set([1, 2]) : new Set([0]);
  if (!acceptedExitCodes.has(Number(record.exitCode))) errors.push("$.exitCode: disagrees with status");
}

function validatePublicSafetyResult(record: Record<string, unknown>, errors: string[]): void {
  requireFields(record, [
    "exitCode", "findings", "scope", "status", "tracked_path_count", "tracked_paths_sha256", "unassessed",
  ], "$", errors);
  const findings = Array.isArray(record.findings) ? record.findings : [];
  const unassessed = Array.isArray(record.unassessed) ? record.unassessed : [];
  if (!Array.isArray(record.findings)) errors.push("$.findings: expected array");
  if (!Array.isArray(record.unassessed)) errors.push("$.unassessed: expected array");
  if (record.scope !== "tracked_shippable") errors.push("$.scope: expected tracked_shippable");
  if (!nonnegativeInteger(record.tracked_path_count)) errors.push("$.tracked_path_count: expected nonnegative integer");
  if (!hexSha256(record.tracked_paths_sha256)) errors.push("$.tracked_paths_sha256: expected lowercase SHA-256");
  if (record.input_sha256 !== undefined && !hexSha256(record.input_sha256)) errors.push("$.input_sha256: expected lowercase SHA-256");
  for (const [index, value] of findings.entries()) {
    const row = object(value);
    requireFields(row, ["fingerprint", "line", "path", "rule"], `$.findings[${index}]`, errors);
    if (!row || !hexSha256(row.fingerprint) || !Number.isInteger(row.line) || Number(row.line) < 1
      || !nonempty(row.path) || !nonempty(row.rule)
      || row.fingerprint !== digest(`public_safety\0${row.rule}\0${row.path}\0${row.line}`)) {
      errors.push(`$.findings[${index}]: invalid canonical public-safety finding`);
    }
  }
  for (const [index, value] of unassessed.entries()) {
    const row = object(value);
    requireFields(row, ["fingerprint", "path", "reason"], `$.unassessed[${index}]`, errors);
    if (!row || !hexSha256(row.fingerprint) || !nonempty(row.path)
      || !new Set(["binary_content", "invalid_utf8", "missing_or_unreadable", "unsupported_tracked_entry"]).has(String(row.reason))
      || row.fingerprint !== digest(`public_safety_unassessed\0${row.reason}\0${row.path}`)) {
      errors.push(`$.unassessed[${index}]: invalid canonical unassessed public-safety entry`);
    }
  }
  const expectedStatus = findings.length > 0 || unassessed.length > 0 ? "fail" : "pass";
  if (record.status !== expectedStatus) errors.push(`$.status: expected ${expectedStatus}`);
  if (record.exitCode !== (expectedStatus === "fail" ? 1 : 0)) errors.push("$.exitCode: disagrees with status");
}
// END validators_planning_semantic_public_safety
// BEGIN validator_language_policy (src/closeout/detector-coverage.ts:785,816 at caa59e9)
function validateLanguagePolicyResult(record: Record<string, unknown>, errors: string[]): void {
  requireFields(record, [
    "allowed_count", "exitCode", "findings", "generated_exempt", "policy", "record_type", "schema_version",
    "status", "tracked_path_count",
  ], "$", errors);
  if (record.record_type !== "mister-clean.language-policy-audit") errors.push("$.record_type: expected mister-clean.language-policy-audit");
  if (record.schema_version !== "1.0") errors.push("$.schema_version: expected 1.0");
  if (!nonnegativeInteger(record.tracked_path_count)) errors.push("$.tracked_path_count: expected nonnegative integer");
  if (!nonnegativeInteger(record.allowed_count)) errors.push("$.allowed_count: expected nonnegative integer");
  const generated = object(record.generated_exempt);
  if (!generated || !nonnegativeInteger(generated.count) || !Array.isArray(generated.paths)
    || generated.paths.length !== generated.count || generated.paths.some((path) => !nonempty(path))) {
    errors.push("$.generated_exempt: expected { count, paths } with one path per count");
  }
  const findings = Array.isArray(record.findings) ? record.findings : [];
  if (!Array.isArray(record.findings)) errors.push("$.findings: expected array");
  for (const [index, value] of findings.entries()) {
    const row = object(value);
    requireFields(row, ["extension", "family", "fingerprint", "path", "rule"], `$.findings[${index}]`, errors);
    if (!row || row.family !== "language_policy" || row.rule !== "forbidden_language"
      || !nonempty(row.path) || !nonempty(row.extension) || !hexSha256(row.fingerprint)
      || row.fingerprint !== languagePolicyFingerprint(String(row.path), String(row.extension))) {
      errors.push(`$.findings[${index}]: invalid canonical language-policy finding`);
    }
  }
  const declared = record.policy !== null;
  if (declared && !object(record.policy)) errors.push("$.policy: expected object or null");
  const expectedStatus = !declared ? "not_applicable" : findings.length > 0 ? "fail" : "pass";
  if (record.status !== expectedStatus) errors.push(`$.status: expected ${expectedStatus}`);
  if (!declared && (findings.length > 0 || generated?.count !== 0)) errors.push("$: an undeclared policy carries no findings and no exemptions");
  if (record.exitCode !== (expectedStatus === "fail" ? 1 : 0)) errors.push("$.exitCode: disagrees with status");
}
// END validator_language_policy
// BEGIN detector_result_shape_errors (src/closeout/detector-coverage.ts:822,833 at caa59e9)
function detectorResultShapeErrors(detectorId: string, value: unknown): string[] {
  const errors: string[] = [];
  const record = object(value);
  if (!record) return ["$: expected object"];
  if (detectorId === "planning_graph") validatePlanningResult(record, errors);
  else if (detectorId === "semantic_boundary") validateSemanticResult(record, errors);
  else if (detectorId === "public_safety") validatePublicSafetyResult(record, errors);
  else if (detectorId === "github_actions") validateGitHubActionsResult(record, errors);
  else if (detectorId === "language_policy") validateLanguagePolicyResult(record, errors);
  else errors.push(`$: unknown detector ${detectorId}`);
  return errors;
}
// END detector_result_shape_errors
// BEGIN validator_github_actions (src/closeout/detector-coverage.ts:935,973 at caa59e9)
function validateGitHubActionsResult(record: Record<string, unknown>, errors: string[]): void {
  requireFields(record, [
    "record_type", "schema_version", "status", "exitCode", "workflow_count",
    "sensitive_workflow_count", "findings",
  ], "$", errors);
  if (record.record_type !== "mister-clean.github-actions-audit") {
    errors.push("$.record_type: expected mister-clean.github-actions-audit");
  }
  if (record.schema_version !== "1.0") errors.push("$.schema_version: expected 1.0");
  if (!nonnegativeInteger(record.workflow_count)) errors.push("$.workflow_count: expected nonnegative integer");
  if (!nonnegativeInteger(record.sensitive_workflow_count)) errors.push("$.sensitive_workflow_count: expected nonnegative integer");
  const findings = Array.isArray(record.findings) ? record.findings : [];
  if (!Array.isArray(record.findings)) errors.push("$.findings: expected array");
  const rules = new Set([
    "health_gate_identity_unbound", "health_gate_nonblocking", "manual_sensitive_ref_unbound", "permissions_implicit",
    "privileged_action_mutable", "release_identity_unbound", "workflow_run_checkout_unbound",
    "workflow_run_source_untrusted", "workflow_run_upstream_identity_unbound", "workflow_run_upstream_mutable",
    "workflow_unparseable",
  ]);
  for (const [index, value] of findings.entries()) {
    const row = object(value);
    requireFields(row, ["fingerprint", "path", "rule", "severity", "detail", "refs"], `$.findings[${index}]`, errors);
    if (!row || !hexSha256(row.fingerprint) || !nonempty(row.path) || !rules.has(String(row.rule))
      || !new Set(["P0", "P1", "P2"]).has(String(row.severity)) || !nonempty(row.detail)
      || !stringArray(row.refs)) {
      errors.push(`$.findings[${index}]: invalid GitHub Actions finding`);
      continue;
    }
    const refs = sortedUnique(row.refs as string[]);
    if (!isDeepStrictEqual(refs, row.refs)) errors.push(`$.findings[${index}].refs: expected sorted unique refs`);
    const expected = digest(`github_actions\0${row.rule}\0${row.path}\0${refs.join("\0")}`);
    if (row.fingerprint !== expected) errors.push(`$.findings[${index}].fingerprint: does not match canonical identity`);
  }
  const expectedStatus = Number(record.workflow_count) === 0
    ? "not_applicable"
    : findings.length > 0 ? "fail" : "pass";
  if (record.status !== expectedStatus) errors.push(`$.status: expected ${expectedStatus}`);
  if (record.exitCode !== (expectedStatus === "fail" ? 1 : 0)) errors.push("$.exitCode: disagrees with status");
}
// END validator_github_actions
// BEGIN finding_fingerprints_from_audit (src/closeout/detector-coverage.ts:980,1017 at caa59e9)
function findingFingerprintsFromAudit(detectorId: string, value: unknown): string[] | undefined {
  if (detectorResultShapeErrors(detectorId, value).length > 0) return undefined;
  const record = value as Record<string, unknown>;
  const rows = detectorId === "planning_graph"
    ? record.raw_findings
    : detectorId === "public_safety"
      ? [...(record.findings as unknown[]), ...(record.unassessed as unknown[])]
      : record.findings;
  if (!Array.isArray(rows)) return undefined;
  const fingerprints: string[] = [];
  for (const finding of rows) {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) return undefined;
    const row = finding as Record<string, unknown>;
    if (detectorId === "planning_graph") {
      if (typeof row.id !== "string" || !row.id) return undefined;
      fingerprints.push(planningFindingFingerprint(row.id));
    } else if (detectorId === "semantic_boundary") {
      if (typeof row.candidate_id !== "string" || !row.candidate_id || typeof row.code !== "string" || !row.code) return undefined;
      fingerprints.push(semanticFindingFingerprint(row.candidate_id, row.code));
    } else if (detectorId === "public_safety") {
      if (typeof row.fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(row.fingerprint)
        || typeof row.path !== "string" || !row.path) return undefined;
      const expected = row.rule !== undefined
        ? typeof row.rule === "string" && row.rule && Number.isInteger(row.line)
          ? digest(`public_safety\0${row.rule}\0${row.path}\0${row.line}`)
          : ""
        : typeof row.reason === "string" && row.reason
          ? digest(`public_safety_unassessed\0${row.reason}\0${row.path}`)
          : "";
      if (row.fingerprint !== expected) return undefined;
      fingerprints.push(row.fingerprint);
    } else if (detectorId === "github_actions" || detectorId === "language_policy") {
      if (typeof row.fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(row.fingerprint)) return undefined;
      fingerprints.push(row.fingerprint);
    } else return undefined;
  }
  return sortedUnique(fingerprints);
}
// END finding_fingerprints_from_audit
  return { CLOSEOUT_DETECTORS, detectorResultShapeErrors, findingFingerprintsFromAudit };
})();

export const oracle_finding_anchors = (() => {
  // The base gate called detector-coverage's detectorResultShapeErrors, which this slice changes.
  const detectorResultShapeErrors = oracle_detector_coverage.detectorResultShapeErrors;
// BEGIN receipt_families (src/closeout/finding-anchors.ts:26,34 at caa59e9)
const RECEIPT_FAMILIES = [
  "planning_graph",
  "public_safety",
  "github_actions",
  "repository_boundaries",
  "semantic_boundary",
  "language_policy",
] as const;
type ReceiptFamily = (typeof RECEIPT_FAMILIES)[number];
// END receipt_families
// BEGIN anchor_helpers (src/closeout/finding-anchors.ts:106,119 at caa59e9)
function object(value: unknown): Record<string, unknown> | undefined {
  return !!value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label}: expected a nonempty string`);
  return value;
}

function posixPath(prefix: string, path: string): string {
  const normalized = path.split("\\").join("/").replace(/^\.\//u, "");
  if (!prefix || normalized === ".") return prefix ? prefix : normalized;
  return `${prefix}/${normalized}`;
}
// END anchor_helpers
// BEGIN github_actions_ref_text (src/closeout/finding-anchors.ts:155,164 at caa59e9)
function githubActionsRefText(repository: string, ref: string): { readonly text: string; readonly line: number | null } {
  const marker = ref.lastIndexOf("#line-");
  const path = marker < 0 ? ref : ref.slice(0, marker);
  const line = marker < 0 ? null : Number(ref.slice(marker + "#line-".length));
  if (line === null || !Number.isInteger(line) || line < 1) return { text: "", line: null };
  let text: string;
  try { text = readFileSync(join(repository, path), "utf8"); } catch { return { text: "", line }; }
  const row = text.split(/\r?\n/u)[line - 1];
  return { text: row === undefined ? "" : row.trim(), line };
}
// END github_actions_ref_text
// BEGIN receipt_findings_from_audit (src/closeout/finding-anchors.ts:171,303 at caa59e9)
function receiptFindingsFromAudit(
  family: ReceiptFamily,
  audit: unknown,
  context: AnchorContext,
): AnchoredFinding[] {
  const record = object(audit);
  if (!record) throw new Error(`${family}: audit result must be an object`);
  if (family === "repository_boundaries") {
    if (record.record_type !== "mister-clean.repository-boundary-audit" || !Array.isArray(record.findings)) {
      throw new Error("repository_boundaries: audit result is not canonical");
    }
  } else if (family === "public_safety") {
    // Both the tracked (closeout) and the walked (audit) scans emit the same
    // finding rows; only the tracked form carries the scope-binding fields.
    if (!Array.isArray(record.findings) || !Array.isArray(record.unassessed)) {
      throw new Error("public_safety: audit result is not canonical");
    }
  } else if (family === "language_policy") {
    if (record.record_type !== "mister-clean.language-policy-audit" || !Array.isArray(record.findings)) {
      throw new Error("language_policy: audit result is not canonical");
    }
  } else {
    const errors = detectorResultShapeErrors(family, audit);
    if (errors.length > 0) throw new Error(`${family}: audit result is not canonical: ${errors[0]}`);
  }
  const prefix = (context.path_prefix ?? "").replace(/\/+$/u, "");
  const rows: { readonly row: Record<string, unknown>; readonly path: string }[] = [];
  const pathsToHash = new Set<string>();
  const semanticCandidatePaths = new Map<string, string>();
  if (family === "semantic_boundary") {
    for (const candidate of (record.candidates as unknown[])) {
      const row = object(candidate);
      if (row && typeof row.id === "string" && typeof row.path === "string") semanticCandidatePaths.set(row.id, row.path);
    }
  }
  const sourceRows = family === "planning_graph"
    ? record.raw_findings
    : family === "public_safety"
      ? [...(record.findings as unknown[]), ...(record.unassessed as unknown[])]
      : record.findings;
  for (const value of sourceRows as unknown[]) {
    const row = object(value);
    if (!row) throw new Error(`${family}: finding must be an object`);
    const rawPath = family === "semantic_boundary"
      ? (semanticCandidatePaths.get(asString(row.candidate_id, `${family}.candidate_id`)) ?? ".")
      : asString(row.path, `${family}.path`);
    const path = posixPath(prefix, rawPath);
    rows.push({ row, path });
    pathsToHash.add(path);
  }
  const oids = (context.blobOids ?? ((paths) => workingTreeBlobOids(context.repository, paths)))([...pathsToHash]);
  const anchored: AnchoredFinding[] = [];
  const seen = new Set<string>();
  for (const { row, path } of rows) {
    const blobOid = oids.get(path) ?? null;
    let rule: string;
    let kind: AnchorKind;
    let content: string;
    let lineHint: number | null = null;
    let severity: string | null = null;
    let legacy: string;
    let probe: EarlierBytesProbe;
    if (family === "public_safety") {
      legacy = asString(row.fingerprint, "public_safety.fingerprint");
      if (typeof row.rule === "string") {
        rule = row.rule;
        kind = "value_digest";
        content = asString(row.value_sha256, "public_safety.value_sha256");
        if (!/^[0-9a-f]{64}$/u.test(content)) throw new Error("public_safety.value_sha256: expected lowercase SHA-256");
        lineHint = typeof row.line === "number" ? row.line : null;
        probe = { kind, rule, value_sha256: content };
      } else {
        rule = `unassessed:${asString(row.reason, "public_safety.reason")}`;
        kind = "detail_digest";
        content = sha256Text(`unassessed\0${row.reason as string}`);
        probe = { kind, blob_oid: blobOid };
      }
    } else if (family === "github_actions") {
      rule = asString(row.rule, "github_actions.rule");
      severity = typeof row.severity === "string" ? row.severity : null;
      legacy = asString(row.fingerprint, "github_actions.fingerprint");
      kind = "line_content";
      // Refs are relative to the audited root, which may be a subdirectory of the worktree.
      const auditRoot = prefix ? join(context.repository, prefix) : context.repository;
      const refs = [...new Set(row.refs as string[])].sort().map((ref) => githubActionsRefText(auditRoot, ref));
      const texts = refs.map((item) => item.text);
      const lineDigests = texts.map(trimmedLineSha256);
      content = sha256Text(texts.join("\n"));
      lineHint = refs.find((item) => item.line !== null)?.line ?? null;
      probe = { kind, line_sha256s: lineDigests };
    } else if (family === "planning_graph") {
      rule = asString(row.code, "planning_graph.code");
      legacy = planningFindingFingerprint(asString(row.id, "planning_graph.id"));
      kind = "detail_digest";
      content = sha256Text([rule, asString(row.subject, "planning_graph.subject"), normalizeWhitespace(asString(row.detail, "planning_graph.detail"))].join("\0"));
      probe = { kind, blob_oid: blobOid };
    } else if (family === "repository_boundaries") {
      rule = asString(row.rule, "repository_boundaries.rule");
      legacy = asString(row.fingerprint, "repository_boundaries.fingerprint");
      kind = "detail_digest";
      content = sha256Text(asString(row.detail, "repository_boundaries.detail"));
      probe = { kind, blob_oid: blobOid };
    } else if (family === "language_policy") {
      rule = asString(row.rule, "language_policy.rule");
      legacy = asString(row.fingerprint, "language_policy.fingerprint");
      kind = "file";
      content = sha256Text(`${rule}\0${asString(row.extension, "language_policy.extension")}`);
      probe = { kind };
    } else {
      rule = asString(row.code, "semantic_boundary.code");
      legacy = semanticFindingFingerprint(asString(row.candidate_id, "semantic_boundary.candidate_id"), rule);
      kind = "whole_repo";
      content = asString(record.candidate_set_sha256, "semantic_boundary.candidate_set_sha256");
      probe = { kind, content_sha256: content };
    }
    const fingerprint = receiptFingerprint({ family, rule, path, anchor_kind: kind, content_sha256: content });
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    anchored.push({
      finding: {
        fingerprint,
        family,
        rule,
        path,
        anchor: { kind, blob_oid: blobOid, content_sha256: content, line_hint: lineHint },
        severity,
        legacy_fingerprint: legacy,
      },
      probe,
    });
  }
  return anchored.sort((left, right) => left.finding.fingerprint.localeCompare(right.finding.fingerprint));
}
// END receipt_findings_from_audit
  return { RECEIPT_FAMILIES, receiptFindingsFromAudit };
})();

export const oracle_bundle_detector_evidence = (() => {
  // Base detectorById(id) with its default registry version read CLOSEOUT_DETECTORS; bound to the
  // verbatim literal above, so a change to the derived list shows up in the projection.
  const detectorById = (id: string): { readonly detector: string } | undefined =>
    oracle_detector_coverage.CLOSEOUT_DETECTORS.find((detector) => detector.id === id);
// BEGIN detector_root_projections (src/closeout/bundle-detector-evidence.ts:59,193 at caa59e9)
function detectorRootProjections(
  detectorId: string,
  value: unknown,
  repoId: string,
): CanonicalRootProjection[] {
  const result = object(value);
  if (!result) return [];
  const rows: Array<{ normalizer: string; causeKey: JsonObject; fingerprints: string[] }> = [];
  if (detectorId === "planning_graph") {
    for (const rawDebt of array(result.root_debts)) {
      const debt = object(rawDebt);
      if (!debt) continue;
      const fingerprints = array(debt.raw_finding_ids)
        .filter((id): id is string => typeof id === "string")
        .map(planningFindingFingerprint);
      rows.push({
        normalizer: "mister-clean/planning-root@1",
        causeKey: {
          detector_family: "planning_graph",
          source_cause_key: debt.cause_key,
          repair_boundary: debt.repair_boundary,
        },
        fingerprints,
      });
    }
  } else if (detectorId === "semantic_boundary") {
    const findings = array(result.findings).map(object).filter((finding): finding is JsonObject => Boolean(finding));
    const unassigned = findings.filter((finding) => finding.code === "semantic_probe_unassigned"
      && typeof finding.candidate_id === "string");
    if (unassigned.length > 0 && typeof result.candidate_set_sha256 === "string") {
      rows.push({
        normalizer: "mister-clean/semantic-candidate-set@1",
        causeKey: {
          detector_family: "semantic_boundary",
          candidate_set_sha256: result.candidate_set_sha256,
          code: "semantic_probe_unassigned",
        },
        fingerprints: unassigned.map((finding) => semanticFindingFingerprint(
          String(finding.candidate_id),
          "semantic_probe_unassigned",
        )).sort(),
      });
    }
    for (const finding of findings.filter((row) => row.code !== "semantic_probe_unassigned")) {
      if (!finding || typeof finding.candidate_id !== "string" || typeof finding.code !== "string") continue;
      rows.push({
        normalizer: "mister-clean/semantic-root@1",
        causeKey: {
          detector_family: "semantic_boundary",
          candidate_id: finding.candidate_id,
          code: finding.code,
        },
        fingerprints: [semanticFindingFingerprint(finding.candidate_id, finding.code)],
      });
    }
  } else if (detectorId === "public_safety") {
    for (const rawFinding of array(result.findings)) {
      const finding = object(rawFinding);
      if (!finding || typeof finding.fingerprint !== "string") continue;
      rows.push({
        normalizer: "mister-clean/public-safety-root@1",
        causeKey: {
          detector_family: "public_safety",
          rule: finding.rule,
          path: finding.path,
          line: finding.line,
        },
        fingerprints: [finding.fingerprint],
      });
    }
    for (const rawFinding of array(result.unassessed)) {
      const finding = object(rawFinding);
      if (!finding || typeof finding.fingerprint !== "string") continue;
      rows.push({
        normalizer: "mister-clean/public-safety-root@1",
        causeKey: {
          detector_family: "public_safety",
          reason: finding.reason,
          path: finding.path,
        },
        fingerprints: [finding.fingerprint],
      });
    }
  } else if (detectorId === "language_policy") {
    // One root debt per tracked forbidden-language path.
    for (const rawFinding of array(result.findings)) {
      const finding = object(rawFinding);
      if (!finding || typeof finding.fingerprint !== "string") continue;
      rows.push({
        normalizer: "mister-clean/language-policy-root@1",
        causeKey: {
          detector_family: "language_policy",
          path: finding.path,
          extension: finding.extension,
        },
        fingerprints: [finding.fingerprint],
      });
    }
  } else if (detectorId === "github_actions") {
    const grouped = new Map<string, JsonObject[]>();
    for (const rawFinding of array(result.findings)) {
      const finding = object(rawFinding);
      if (!finding || typeof finding.fingerprint !== "string"
        || typeof finding.path !== "string" || typeof finding.rule !== "string") continue;
      const key = `${finding.path}\0${finding.rule}`;
      grouped.set(key, [...(grouped.get(key) ?? []), finding]);
    }
    for (const findings of grouped.values()) {
      const first = findings[0];
      if (!first) continue;
      rows.push({
        normalizer: "mister-clean/github-actions-root@1",
        causeKey: {
          detector_family: "github_actions",
          path: first.path,
          rule: first.rule,
        },
        fingerprints: findings
          .map((finding) => String(finding.fingerprint))
          .sort(),
      });
    }
  }
  const sourceId = detectorById(detectorId)?.detector;
  if (!sourceId) return [];
  return rows.map(({ normalizer, causeKey, fingerprints }) => ({
    debt_key: canonicalRootDebtKey({ repo_id: repoId, normalizer, cause_key: causeKey as never }),
    normalizer,
    cause_key: causeKey,
    observation_ids: sortedUnique(fingerprints.map((fingerprint) => canonicalObservationId({
      source_id: sourceId,
      source_native_fingerprint: fingerprint,
    }))),
  }));
}
// END detector_root_projections
  return { detectorRootProjections };
})();

export const oracle_second_pass = (() => {
// BEGIN legacy_detector_families (src/closeout/second-pass.ts:361,361 at caa59e9)
const LEGACY_DETECTOR_FAMILIES: ReadonlySet<string> = new Set(["planning_graph", "public_safety", "github_actions", "semantic_boundary"]);
// END legacy_detector_families
  return { LEGACY_DETECTOR_FAMILIES };
})();

export const oracle_cli = (() => {
  type ReceiptFamily = OracleReceiptFamily;
// BEGIN receipt_table (src/cli.ts:935,941 at caa59e9)
            const families: { readonly family: ReceiptFamily; readonly file: string }[] = [
              { family: "planning_graph", file: "planning-audit.json" },
              { family: "public_safety", file: "public-safety-audit.json" },
              { family: "github_actions", file: "github-actions-audit.json" },
              { family: "semantic_boundary", file: "semantic-audit.json" },
              { family: "language_policy", file: "language-policy-audit.json" },
            ];
// END receipt_table
  return { families };
})();

export type OracleReceiptFamily = (typeof oracle_finding_anchors.RECEIPT_FAMILIES)[number];

/** `CLOSEOUT_DETECTORS` (detector registry 6) as the base wrote it. */
export const oracle_CLOSEOUT_DETECTORS = oracle_detector_coverage.CLOSEOUT_DETECTORS;
/** `RECEIPT_FAMILIES` as the base wrote it. */
export const oracle_RECEIPT_FAMILIES = oracle_finding_anchors.RECEIPT_FAMILIES;
/** The families a legacy bundle baseline could hold on the base (no language_policy). */
export const oracle_LEGACY_DETECTOR_FAMILIES = oracle_second_pass.LEGACY_DETECTOR_FAMILIES;
/** The command line's receipt table (family and bundle file) as the base wrote it. */
export const oracle_CLI_RECEIPT_TABLE = oracle_cli.families;
/** The command line's audit kinds: the Set literal of cli.ts:486 at caa59e9. */
export const oracle_CLI_AUDIT_KINDS = new Set(["github-actions", "language-policy", "planning", "public-safety", "repository-boundaries", "semantic"]);
/** The usage-error message of cli.ts:487 at caa59e9. */
export const oracle_CLI_AUDIT_USAGE_ERROR = "audit requires github-actions, language-policy, planning, public-safety, repository-boundaries, or semantic";
/** The usage line of cli.ts:869 at caa59e9. */
export const oracle_CLI_USAGE = "usage: mister-clean <prepare|action|validate|detect|audit|inspect|census|manifest|semantic|second-pass|attest> ... (action: begin|finish; audit: github-actions|language-policy|planning|public-safety|repository-boundaries|semantic; semantic: plan|verify; inspect: repository-object; census: capture|validate|compare; second-pass <repo> [--against <receipt_id|bundle>] [--json]; audit/prepare/second-pass accept --agent-card <card.json> and --no-subject-hash)";

export const oracle_detectorResultShapeErrors = oracle_detector_coverage.detectorResultShapeErrors;
export const oracle_findingFingerprintsFromAudit = oracle_detector_coverage.findingFingerprintsFromAudit;
export const oracle_receiptFindingsFromAudit = oracle_finding_anchors.receiptFindingsFromAudit;
export const oracle_detectorRootProjections = oracle_bundle_detector_evidence.detectorRootProjections;

/** One call of a family's entry function: its exported name and the arguments it received. */
export interface OracleEntryCall {
  readonly entry: string;
  readonly args: readonly unknown[];
}

/** The two values the public_safety entry computes for its arguments. */
export interface OracleEntryHelpers {
  readonly trackedShippablePaths: (root: string) => unknown;
  readonly loadDenylistSync: (path: string | undefined) => unknown;
}

/**
 * Base table for the read-only run (second-pass.ts:347-357 at caa59e9): for each family,
 * the entry function `runReadOnlyFamilies` called and the arguments it passed.
 */
export function oracle_readOnlyEntryCalls(
  root: string,
  options: { readonly denylistPath?: string; readonly deadline_ms?: number },
  helpers: OracleEntryHelpers,
): Readonly<Record<OracleReceiptFamily, OracleEntryCall>> {
  return {
    planning_graph: { entry: "auditPlanningRepository", args: [root, options.deadline_ms === undefined ? undefined : { deadline_ms: options.deadline_ms }] },
    public_safety: { entry: "scanTrackedPublicSafetySync", args: [root, helpers.trackedShippablePaths(root), helpers.loadDenylistSync(options.denylistPath)] },
    github_actions: { entry: "auditGitHubActionsRepository", args: [root] },
    repository_boundaries: { entry: "auditRepositoryBoundaries", args: [root] },
    language_policy: { entry: "auditLanguagePolicy", args: [root] },
    semantic_boundary: { entry: "auditSemanticRepository", args: [root, { execute: false }] },
  };
}

/**
 * Base table for `runAudit` (cli.ts:490-628 at caa59e9): the family each audit kind
 * reported to its result sink, in the order the base branched on the kinds.
 */
export const oracle_AUDIT_KIND_FAMILIES: readonly (readonly [string, OracleReceiptFamily])[] = [
  ["planning", "planning_graph"],
  ["semantic", "semantic_boundary"],
  ["github-actions", "github_actions"],
  ["language-policy", "language_policy"],
  ["repository-boundaries", "repository_boundaries"],
  ["public-safety", "public_safety"],
];
