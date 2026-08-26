import { posix as pathPosix } from "node:path";

import { canonicalIdentity, foldCase } from "./normalization.js";

/** Pure validation of Mister Clean's closeout report and action-manifest records.
 *
 * This module deliberately has no filesystem, Git, process, or clock dependency.
 * Bundle/live validation belongs above this record boundary. The error strings
 * retain the legacy validator's paths so old evidence and new callers can be
 * compared during the migration.
 */

export const DIMENSION_STATES = new Set(["satisfied", "open", "blocked", "not_assessed", "not_applicable"]);
export const CLAIM_STATES = new Set(["established", "not_established", "not_assessed", "not_applicable"]);
export const DEBT_STATES = new Set(["satisfied", "accepted_exception", "open", "blocked", "deferred", "not_assessed"]);
export const RECOMMENDATIONS = new Set(["proceed", "proceed_with_conditions", "do_not_proceed", "not_assessed"]);
export const MODES = new Set(["AUDIT", "CLEAN", "CLOSE", "CONFORM", "GUARD"]);
export const EXECUTION_STATES = new Set(["authorized", "executed"]);
export const MANIFEST_SCHEMA_VERSIONS = new Set(["1.0", "1.1", "1.2"]);
export const RISKS = new Set(["reversible_local", "consequential_external", "unrecoverable"]);
export const AUTH_STATES = new Set(["granted"]);
export const STANDING_AUTH_SOURCES = new Set(["skill_invocation", "explicit_user", "explicit_operator"]);
export const CONSEQUENT_ACTION_KINDS = new Set([
  "git_push", "branch_delete_local", "branch_delete_remote", "worktree_remove", "process_signal", "tracker_write",
]);
export const PROHIBITED_KINDS = new Set([
  "history_rewrite", "force_push", "secret_destroy", "production_deploy", "production_mutation", "external_dispatch",
]);
export const ALLOWED_ACTION_KINDS = new Set([
  "agent_dispatch", "acceptance_execute", "local_edit", "local_move", "recoverable_delete", "format", "lint", "test",
  "build", "generate", "doc_update", "planning_record_update", "git_commit", "git_push", "stash_preserve", "stash_drop",
  "git_integrate",
  "branch_delete_local", "branch_delete_remote", "worktree_remove", "process_signal", "tracker_write", "historical_conform",
  "handoff_update",
]);
export const ACTION_EVIDENCE_KINDS = new Set([
  "git_change", "validation_result", "remote_ref_resolution", "process_observation", "tracker_receipt", "independent_qa_verdict",
]);
export const DEBT_EVIDENCE_KINDS = new Set(["acceptance_execution", "gate_result", "historical_record"]);
export const DISPOSITIONS = new Set(["autonomously_repair", "autonomously_validate", "accepted_exception", "decision_or_coordination_required"]);
export const VERDICTS = new Set(["CLEAN", "NOT_CLEAN"]);
export const OPEN_DEBT_STATES = new Set(["open", "blocked", "not_assessed"]);
export const STALE_DOC_CLASSES = new Set(["stale_doc", "stale_comment", "stale_documentation", "doc_drift"]);
export const OPERATOR_ACTORS = new Set(["operator", "principal"]);

const GENERIC_FILLER = new Set(["measured", "fixture-value", "n/a", "na", "done", "ok", "verified", "pass", "true", "yes", "-", "tbd", "todo", "checked", "clean", "good"]);
const REQUIRED_DIMENSIONS = ["completion_debt", "repository_state", "planning_integrity", "verification", "handoff_readiness"] as const;
const REQUIRED_CLAIMS = ["committed_locally", "pushed", "ci_green_on_push", "deployed", "independently_qa_accepted"] as const;
const DIMENSION_EVIDENCE_KINDS: Record<string, Set<string>> = {
  completion_debt: new Set(["debt_census", "acceptance_execution"]),
  repository_state: new Set(["git_topology"]),
  planning_integrity: new Set(["planning_census"]),
  verification: new Set(["validation_summary"]),
  handoff_readiness: new Set(["successor_readiness"]),
};
const PLACEHOLDER = /<[^<>]+>/;
const LANE_ROLES = new Set(["read_only", "writer", "integrator"]);
const LANE_STATES = new Set(["queued", "active", "ready", "integrated", "retired", "blocked"]);
const EXECUTION_CLASSES = new Set(["hosted", "local_inference"]);
const EVALUATION_MODES = new Set(["none", "naturalistic", "controlled"]);
const CAS_RESULTS = new Set(["applied", "rejected_target_moved", "rejected_regression", "not_run"]);
const COORDINATION_ACCESS = new Set(["read", "write"]);
const COORDINATION_CAS_RESULTS = new Set(["validated", "applied", "rejected_stale", "not_run"]);
const PUSH_INTENTS = new Set(["coherent_wave", "minimal_ci_repair"]);
const GUARD_STATES = new Set(["initialized", "collecting", "passed", "crossed", "invalidated"]);
const GUARD_ROLES = new Set(["dev", "qa", "mister_clean", "holdout"]);
const GUARD_CONCLUSIONS = new Set(["pass", "fail", "conditional", "not_run"]);
const GUARD_BARRIER_STATES = new Set(["closed", "open", "crossed", "invalidated"]);
const LOCAL_MUTATION_KINDS = new Set([
  "local_edit", "local_move", "recoverable_delete", "format", "generate", "doc_update",
  "planning_record_update", "historical_conform", "handoff_update",
]);
export const REGRESSION_POLICY = "zero_open_run_introduced_debt";
export const REGRESSION_COUNT_FIELDS = [
  "baseline_findings",
  "closing_findings",
  "baseline_paid",
  "baseline_open",
  "newly_discovered_preexisting_paid",
  "newly_discovered_preexisting_open",
  "concurrent_external_paid",
  "concurrent_external_open",
  "introduced_by_run_paid",
  "introduced_by_run_open",
  "action_checks",
] as const;

type ObjectRecord = Record<string, unknown>;

function object(value: unknown): ObjectRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectRecord : undefined;
}

function array(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

export function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isoTimestamp(value: unknown): boolean {
  if (!nonempty(value)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:?\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const zone = match[7] ?? "";
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return false;
  if (zone !== "Z") {
    const offset = zone.slice(1).replace(":", "");
    if (Number(offset.slice(0, 2)) > 23 || Number(offset.slice(2)) > 59) return false;
  }
  return !Number.isNaN(Date.parse(value));
}

export function digestRef(value: unknown): boolean {
  const ref = object(value);
  return !!ref && nonempty(ref.path) && typeof ref.sha256 === "string" && /^[0-9a-f]{64}$/.test(ref.sha256);
}

function requireKeys(value: unknown, keys: readonly string[], path: string, errors: string[]): void {
  const record = object(value);
  if (!record) {
    errors.push(`${path}: expected object`);
    return;
  }
  for (const key of [...keys].sort()) if (!(key in record)) errors.push(`${path}.${key}: missing`);
}

export function findPlaceholders(value: unknown, path = "$"): string[] {
  if (typeof value === "string") return PLACEHOLDER.test(value) ? [path] : [];
  const record = object(value);
  if (record) return Object.entries(record).flatMap(([key, item]) => findPlaceholders(item, `${path}.${key}`));
  const items = array(value);
  return items ? items.flatMap((item, index) => findPlaceholders(item, `${path}[${index}]`)) : [];
}

function meaningful(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  const record = object(value);
  if (record) return Object.values(record).some(meaningful);
  const items = array(value);
  if (items) return items.some(meaningful);
  return value !== null && value !== undefined;
}

function generic(value: unknown): boolean {
  if (typeof value === "string") return GENERIC_FILLER.has(foldCase(value.trim())) || value.trim().length < 3;
  const items = array(value);
  if (items) return items.length === 0 || items.every(generic);
  const record = object(value);
  if (record) return !Object.values(record).some(meaningful);
  return false;
}

function normalizeActor(value: unknown): string {
  return canonicalIdentity(value);
}

function criterionWaived(criterion: ObjectRecord): boolean {
  const waiver = object(criterion.waiver);
  if (!waiver || !nonempty(waiver.actor) || !nonempty(waiver.ref)) return false;
  return !OPERATOR_ACTORS.has(String(criterion.source)) || OPERATOR_ACTORS.has(normalizeActor(waiver.actor));
}

function validateAuthorizationBasis(value: unknown, path: string, errors: string[]): void {
  requireKeys(value, ["source", "ref", "scope", "standing"], path, errors);
  const basis = object(value);
  if (!basis) return;
  if (!STANDING_AUTH_SOURCES.has(String(basis.source))) errors.push(`${path}.source: expected skill_invocation, explicit_user, or explicit_operator`);
  if (!nonempty(basis.ref)) errors.push(`${path}.ref: required`);
  if (basis.scope !== "named_repository_and_current_task") errors.push(`${path}.scope: expected named_repository_and_current_task`);
  if (basis.standing !== true) errors.push(`${path}.standing: expected true`);
}

function validateRegressionControl(
  value: unknown,
  path: string,
  errors: string[],
  clean: boolean,
  allowPlaceholders: boolean,
): void {
  requireKeys(value, [
    "policy", "baseline_object", "closing_object", ...REGRESSION_COUNT_FIELDS, "evidence_ref",
  ], path, errors);
  const control = object(value);
  if (!control) return;
  if (control.policy !== REGRESSION_POLICY) errors.push(`${path}.policy: expected ${REGRESSION_POLICY}`);
  for (const field of ["baseline_object", "closing_object"] as const) {
    if (!nonempty(control[field])) errors.push(`${path}.${field}: required`);
  }
  for (const field of REGRESSION_COUNT_FIELDS) {
    if (!Number.isInteger(control[field]) || Number(control[field]) < 0) {
      errors.push(`${path}.${field}: required nonnegative integer`);
    }
  }
  const countsValid = REGRESSION_COUNT_FIELDS.every((field) => Number.isInteger(control[field]) && Number(control[field]) >= 0);
  if (countsValid) {
    const baseline = Number(control.baseline_findings);
    const expectedBaseline = Number(control.baseline_paid) + Number(control.baseline_open);
    if (baseline !== expectedBaseline) {
      errors.push(`${path}.baseline_findings (${baseline}) must equal baseline_paid + baseline_open (${expectedBaseline})`);
    }
    const closing = Number(control.closing_findings);
    const expectedClosing = Number(control.baseline_open)
      + Number(control.newly_discovered_preexisting_open)
      + Number(control.concurrent_external_open)
      + Number(control.introduced_by_run_open);
    if (closing !== expectedClosing) {
      errors.push(`${path}.closing_findings (${closing}) must equal all open origin buckets (${expectedClosing})`);
    }
  }
  const referenceHasPlaceholder = findPlaceholders(control.evidence_ref, `${path}.evidence_ref`).length > 0;
  if (!(allowPlaceholders && referenceHasPlaceholder) && !digestRef(control.evidence_ref)) {
    errors.push(`${path}.evidence_ref: required digest-bound regression-delta reference {path,sha256}`);
  }
  if (clean && control.introduced_by_run_open !== 0) {
    errors.push(`${path}.introduced_by_run_open: CLEAN requires zero cleanup-introduced open debt`);
  }
}

function validateEstablishedClaim(name: string, evidence: unknown[], errors: string[]): void {
  const objects = evidence.map(object).filter((entry): entry is ObjectRecord => !!entry);
  const required: Record<string, string[]> = {
    committed_locally: ["kind", "commit"],
    pushed: ["kind", "remote", "ref", "commit", "observed_at"],
    ci_green_on_push: ["kind", "provider", "run_id", "commit", "conclusion"],
    deployed: ["kind", "environment", "deployment_ref", "observed_state", "observed_at"],
    independently_qa_accepted: ["kind", "verdict_ref", "reviewer", "implementer", "conclusion"],
  };
  const fields = required[name] ?? [];
  if (!objects.some(item => fields.every(field => nonempty(item[field])))) {
    errors.push(`$.claims.${name}: evidence must include one object with ${[...fields].sort().join(", ")}`);
  }
  if (name === "ci_green_on_push" && !objects.some(item => item.conclusion === "success")) errors.push("$.claims.ci_green_on_push: established requires conclusion=success");
  if (name === "ci_green_on_push" && !objects.some(item => item.kind === "established_ci")) errors.push("$.claims.ci_green_on_push: established requires kind=established_ci");
  const expectedKind: Record<string, string> = { committed_locally: "git_commit", pushed: "remote_ref_resolution", deployed: "observed_deployment", independently_qa_accepted: "independent_qa_verdict" };
  if (expectedKind[name] && !objects.some(item => item.kind === expectedKind[name])) errors.push(`$.claims.${name}: established requires kind=${expectedKind[name]}`);
  if (name === "deployed" && !objects.some(item => item.observed_state === "active")) errors.push("$.claims.deployed: established requires observed_state=active");
  if (name === "independently_qa_accepted" && !objects.some(item => item.kind === "independent_qa_verdict" && item.conclusion === "accepted" && nonempty(item.reviewer) && nonempty(item.implementer) && item.reviewer !== item.implementer)) {
    errors.push("$.claims.independently_qa_accepted: established requires accepted verdict and distinct reviewer/implementer");
  }
}

export function validateReport(data: unknown, allowPlaceholders = false, bundleContext = false): string[] {
  const errors: string[] = [];
  const report = object(data);
  requireKeys(data, ["record_type", "schema_version", "generated_at", "repo", "target_binding", "mode", "authorization_basis", "scope", "dimensions", "completion_debts", "claims", "actions", "residuals", "handoff_assessment", "regression_control", "verdict"], "$", errors);
  if (!report || errors.length > 0) return errors.map(error => error.startsWith("$.") ? error : error.replace("$.", "$."));
  if (report.record_type !== "mister-clean.closeout") errors.push("$.record_type: expected mister-clean.closeout");
  if (report.schema_version !== "1.2") errors.push("$.schema_version: expected 1.2");
  if (!MODES.has(String(report.mode))) errors.push(`$.mode: unsupported value ${JSON.stringify(report.mode)}`);
  validateAuthorizationBasis(report.authorization_basis, "$.authorization_basis", errors);
  const repo = object(report.repo) ?? {};
  if (!allowPlaceholders) {
    if (!nonempty(repo.id)) errors.push("$.repo.id: required portable repository identity");
    if (typeof repo.commit !== "string" || !/^[0-9a-f]{7,40}$/.test(repo.commit)) errors.push("$.repo.commit: required 7-40 char hex object id");
  }
  const target = object(report.target_binding);
  requireKeys(report.target_binding, ["target_ref", "target_commit", "candidate_commit", "merge_base", "target_commits_missing", "candidate_commits_ahead", "target_incorporated", "measured_at", "evidence"], "$.target_binding", errors);
  if (target) {
    for (const field of ["target_ref", "measured_at"]) if (!nonempty(target[field])) errors.push(`$.target_binding.${field}: required`);
    for (const field of ["target_commits_missing", "candidate_commits_ahead"]) if (typeof target[field] !== "number" || !Number.isInteger(target[field]) || target[field] < 0) errors.push(`$.target_binding.${field}: required nonnegative integer`);
    if (typeof target.target_incorporated !== "boolean") errors.push("$.target_binding.target_incorporated: required boolean");
    if (!Array.isArray(target.evidence) || target.evidence.length === 0) errors.push("$.target_binding.evidence: required nonempty array");
  }
  const dimensions = object(report.dimensions);
  requireKeys(report.dimensions, REQUIRED_DIMENSIONS, "$.dimensions", errors);
  if (dimensions) for (const name of REQUIRED_DIMENSIONS) {
    if (!(name in dimensions)) continue;
    const item = object(dimensions[name]);
    requireKeys(item, ["state", "evidence", "notes"], `$.dimensions.${name}`, errors);
    if (!item) continue;
    if (!DIMENSION_STATES.has(String(item.state))) errors.push(`$.dimensions.${name}.state: unsupported value ${JSON.stringify(item.state)}`);
    if (!Array.isArray(item.evidence)) errors.push(`$.dimensions.${name}.evidence: expected array`);
    else if (item.state === "satisfied" && item.evidence.length === 0) errors.push(`$.dimensions.${name}: satisfied requires evidence`);
  }
  const debts = array(report.completion_debts) ?? [];
  if (!Array.isArray(report.completion_debts)) errors.push("$.completion_debts: expected array");
  for (const [index, raw] of debts.entries()) {
    const path = `$.completion_debts[${index}]`; const debt = object(raw); requireKeys(raw, ["id", "procedure", "state", "evidence"], path, errors); if (!debt) continue;
    if (!DEBT_STATES.has(String(debt.state))) errors.push(`${path}.state: unsupported value ${JSON.stringify(debt.state)}`);
    if (debt.state === "blocked") { requireKeys(debt, ["blocker", "next_owner", "next_action"], path, errors); if (!array(debt.evidence)?.length) errors.push(`${path}.evidence: blocked debt requires evidence`); for (const field of ["blocker", "next_owner", "next_action"]) if (!nonempty(debt[field])) errors.push(`${path}.${field}: required for blocked debt`); }
    if (debt.state === "deferred") { const ruling = object(debt.ruling); requireKeys(ruling, ["actor", "date", "reason", "ref", "next_owner"], `${path}.ruling`, errors); if (ruling) for (const field of ["actor", "date", "reason", "ref", "next_owner"]) if (!nonempty(ruling[field])) errors.push(`${path}.ruling.${field}: required for deferred debt`); }
  }
  const claims = object(report.claims); requireKeys(report.claims, REQUIRED_CLAIMS, "$.claims", errors);
  if (claims) for (const name of REQUIRED_CLAIMS) {
    if (!(name in claims)) continue; const item = object(claims[name]); requireKeys(claims[name], ["state", "evidence"], `$.claims.${name}`, errors); if (!item) continue;
    if (!CLAIM_STATES.has(String(item.state))) errors.push(`$.claims.${name}.state: unsupported value ${JSON.stringify(item.state)}`);
    if (!Array.isArray(item.evidence)) errors.push(`$.claims.${name}.evidence: expected array`); else { if (item.state === "established" && item.evidence.length === 0) errors.push(`$.claims.${name}: established requires evidence`); if (item.state === "established") validateEstablishedClaim(name, item.evidence, errors); }
  }
  const assessment = object(report.handoff_assessment); requireKeys(report.handoff_assessment, ["recommendation", "reasons", "conditions"], "$.handoff_assessment", errors); const recommendation = assessment?.recommendation;
  if (!RECOMMENDATIONS.has(String(recommendation))) errors.push(`$.handoff_assessment.recommendation: unsupported value ${JSON.stringify(recommendation)}`);
  if (assessment) { if (["proceed", "proceed_with_conditions", "do_not_proceed"].includes(String(recommendation)) && !array(assessment.reasons)?.length) errors.push("$.handoff_assessment.reasons: recommendation requires reasons"); if (recommendation === "proceed_with_conditions" && !array(assessment.conditions)?.length) errors.push("$.handoff_assessment.conditions: conditional recommendation requires conditions"); }
  const debtStates = new Set(debts.map(debt => object(debt)?.state));
  if (recommendation === "proceed" && ["open", "blocked", "deferred", "not_assessed"].some(state => debtStates.has(state))) errors.push("$.handoff_assessment: unconditional proceed conflicts with unresolved or deferred completion debt");
  if (recommendation === "proceed" && dimensions) { const unresolved = REQUIRED_DIMENSIONS.filter(name => ["open", "blocked", "not_assessed"].includes(String(object(dimensions[name])?.state))); if (unresolved.length) errors.push(`$.handoff_assessment: unconditional proceed conflicts with unresolved dimensions: ${unresolved.sort().join(", ")}`); }
  const verdict = report.verdict;
  if (!VERDICTS.has(String(verdict))) errors.push(`$.verdict: required, CLEAN or NOT_CLEAN (got ${JSON.stringify(verdict)})`);
  validateRegressionControl(report.regression_control, "$.regression_control", errors, verdict === "CLEAN", allowPlaceholders);
  if (verdict === "CLEAN" && !bundleContext) errors.push("$.verdict: CLEAN requires validation through a live-bound mister-clean.closure-bundle; a standalone report is structural evidence only");
  const seenIds = new Set<string>(); const decisionRows: string[] = [];
  for (const [index, raw] of debts.entries()) {
    const path = `$.completion_debts[${index}]`; const debt = object(raw); if (!debt) { errors.push(`${path}: expected object`); continue; }
    if (!nonempty(debt.id)) errors.push(`${path}.id: required nonempty`); else if (seenIds.has(debt.id)) errors.push(`${path}.id: duplicate ${JSON.stringify(debt.id)}`); else seenIds.add(debt.id);
    if (!nonempty(debt.procedure)) errors.push(`${path}.procedure: required nonempty`);
    const disposition = debt.disposition;
    if (disposition === undefined) errors.push(`${path}.disposition: required (one of ${[...DISPOSITIONS].sort().join(", ")})`); else if (!DISPOSITIONS.has(String(disposition))) errors.push(`${path}.disposition: unsupported ${JSON.stringify(disposition)}`);
    if (disposition === "accepted_exception") { if (debt.state !== "accepted_exception") errors.push(`${path}: accepted_exception disposition requires state=accepted_exception (one row, one terminal bucket)`); const exception = object(debt.exception); requireKeys(exception, ["actor", "at", "ref", "scope", "rationale"], `${path}.exception`, errors); if (exception) { for (const key of ["actor", "scope", "rationale"]) if (!nonempty(exception[key])) errors.push(`${path}.exception.${key}: required for accepted_exception`); if (!isoTimestamp(exception.at)) errors.push(`${path}.exception.at: required timezone-aware ISO-8601 timestamp`); if (!digestRef(exception.ref)) errors.push(`${path}.exception.ref: required digest-bound evidence reference {path,sha256}`); } }
    else if (debt.state === "accepted_exception") errors.push(`${path}.disposition: state=accepted_exception requires disposition=accepted_exception`);
    if (STALE_DOC_CLASSES.has(String(debt.class)) && disposition === "accepted_exception") errors.push(`${path}.disposition: a reviewer-reported stale doc/comment is PAYABLE regardless of severity label -- accepted_exception is for irreparable historical limits only; fix the doc before CLEAN`);
    if (disposition === "decision_or_coordination_required") decisionRows.push(nonempty(debt.id) ? debt.id : `#${index}`);
    if (debt.state === "satisfied") { const typed = (array(debt.evidence) ?? []).map(object).filter((entry): entry is ObjectRecord => !!entry); const valid = typed.some(entry => DEBT_EVIDENCE_KINDS.has(String(entry.kind)) && ["object", "command", "result"].every(key => nonempty(entry[key])) && isoTimestamp(entry.observed_at) && digestRef(entry.evidence_ref)); if (!valid) errors.push(`${path}.evidence: satisfied debt requires allowlisted, time-bound, digest-referenced execution evidence`); }
  }
  const residuals = array(report.residuals) ?? [];
  for (const [index, raw] of residuals.entries()) {
    const path = `$.residuals[${index}]`;
    const residual = object(raw);
    if (!residual) { errors.push(`${path}: expected object with kind (roadmap|accepted_exception|blocked)`); continue; }
    const kind = residual.kind;
    if (!["roadmap", "accepted_exception", "blocked"].includes(String(kind))) {
      errors.push(`${path}.kind: required, one of roadmap|accepted_exception|blocked`);
    } else if (kind === "accepted_exception") {
      for (const key of ["authority", "scope", "rationale"]) if (!nonempty(residual[key])) errors.push(`${path}.${key}: required for accepted_exception residual`);
    } else if (kind === "roadmap" && !nonempty(residual.represented_at)) {
      errors.push(`${path}.represented_at: roadmap residual must cite where it is consistently represented`);
    }
    if (STALE_DOC_CLASSES.has(String(residual.class))) errors.push(`${path}: a reviewer-reported stale doc/comment is payable debt, not a residual -- move it to completion_debts and fix it before CLEAN`);
  }
  for (const [index, raw] of (array(report.acceptance_criteria) ?? []).entries()) { const path = `$.acceptance_criteria[${index}]`; const criterion = object(raw); if (!criterion) { errors.push(`${path}: expected object`); continue; } if (!nonempty(criterion.id)) errors.push(`${path}.id: required`); if (typeof criterion.met !== "boolean") errors.push(`${path}.met: required boolean`); if (!nonempty(criterion.source)) errors.push(`${path}.source: required (who set the criterion, e.g. operator)`); if (criterion.waiver !== undefined && (!object(criterion.waiver) || !nonempty(object(criterion.waiver)?.actor) || !nonempty(object(criterion.waiver)?.ref))) errors.push(`${path}.waiver: requires actor AND ref`); else if (object(criterion.waiver) && OPERATOR_ACTORS.has(String(criterion.source)) && !OPERATOR_ACTORS.has(normalizeActor(object(criterion.waiver)?.actor))) errors.push(`${path}.waiver: an operator-source criterion may be waived ONLY by the operator, not by a reviewer (${JSON.stringify(object(criterion.waiver)?.actor)})`); }
  if (verdict === "CLEAN") {
    if (target?.target_incorporated !== true) errors.push("$.target_binding: CLEAN requires target_incorporated=true"); if (target?.target_commits_missing !== 0) errors.push("$.target_binding: CLEAN requires target_commits_missing=0"); if (target?.candidate_commit !== repo.commit) errors.push("$.target_binding.candidate_commit: CLEAN requires equality with repo.commit"); if (target?.merge_base !== target?.target_commit) errors.push("$.target_binding.merge_base: CLEAN requires current target to be an ancestor of the closing candidate");
    for (const [index, raw] of debts.entries()) { const debt = object(raw); if (!debt) continue; if (OPEN_DEBT_STATES.has(String(debt.state))) errors.push(`$.verdict: CLEAN forbidden -- completion_debts[${index}] (${debt.id ?? "?"}) is ${JSON.stringify(debt.state)} (payable debt remains)`); else if (debt.state === "deferred") errors.push(`$.verdict: CLEAN forbidden -- completion_debts[${index}] (${debt.id ?? "?"}) is deferred (unpaid work cannot be CLEAN regardless of disposition)`); }
    for (const [index, raw] of (array(report.acceptance_criteria) ?? []).entries()) { const criterion = object(raw); if (criterion?.met === false && !criterionWaived(criterion)) errors.push(`$.acceptance_criteria[${index}] (${criterion.id ?? "?"}): CLEAN/positive verdict is INVALID while an acceptance criterion is unmet -- an independent reviewer may not downgrade an operator criterion to a non-blocking nuance; pay it or record an explicit operator waiver (actor+ref)`); }
    if (decisionRows.length) errors.push(`$.verdict: CLEAN forbidden -- decision_or_coordination_required present: ${decisionRows.join(", ")}`);
    for (const [index, raw] of residuals.entries()) if (object(raw)?.kind === "blocked") errors.push(`$.verdict: CLEAN forbidden -- residuals[${index}] is blocked`);
    let notApplicable = 0;
    for (const name of REQUIRED_DIMENSIONS) { const dimension = object(dimensions?.[name]) ?? {}; const state = dimension.state; if (state === "satisfied") { const typed = (array(dimension.evidence) ?? []).map(object).filter((entry): entry is ObjectRecord => !!entry); const allowed = DIMENSION_EVIDENCE_KINDS[name] ?? new Set<string>(); if (!typed.some(entry => allowed.has(String(entry.kind)) && ["object", "command", "result"].every(key => nonempty(entry[key])) && isoTimestamp(entry.observed_at))) errors.push(`$.dimensions.${name}: CLEAN requires time-bound evidence kind ${[...allowed].sort().join(", ")} with object/command/result`); } else if (state === "not_applicable") { notApplicable++; if (!array(dimension.evidence)?.length && !nonempty(dimension.notes)) errors.push(`$.dimensions.${name}: CLEAN requires evidence/notes rationale for not_applicable`); } else errors.push(`$.dimensions.${name}: CLEAN requires satisfied (or evidenced not_applicable), got ${JSON.stringify(state)}`); }
    if (report.mode === "CLOSE" && notApplicable === REQUIRED_DIMENSIONS.length) errors.push("$.dimensions: CLEAN in CLOSE mode cannot mark every dimension not_applicable");
    for (const [name, raw] of Object.entries(claims ?? {})) { const claim = object(raw); if (!claim) continue; if (claim.state === undefined || claim.state === "not_assessed") errors.push(`$.claims.${name}: CLEAN forbids an unassessed claim (state=${JSON.stringify(claim.state)}); establish it or mark not_applicable with policy_ref`); else if (claim.state === "established" && generic(claim.evidence)) errors.push(`$.claims.${name}: CLEAN requires SPECIFIC established evidence, not a generic token`); }
    const census = object(report.debt_census); if (!census) errors.push("$.debt_census: required for CLEAN (discovered/paid/accepted_exception ints; empty ledger is not a census)"); else { const discovered = census.discovered, paid = census.paid, accepted = census.accepted_exception; if (![discovered, paid, accepted].every(value => typeof value === "number" && Number.isInteger(value))) errors.push("$.debt_census: discovered/paid/accepted_exception must be integers"); else { const d = discovered as number, p = paid as number, a = accepted as number; if (d !== p + a) errors.push(`$.debt_census: discovered (${d}) must equal paid (${p}) + accepted_exception (${a})`); if (d !== seenIds.size) errors.push(`$.debt_census.discovered (${d}) != unique completion_debts ledger entries (${seenIds.size})`); const satisfied = debts.filter(raw => object(raw)?.state === "satisfied").length; const exceptions = debts.filter(raw => object(raw)?.state === "accepted_exception").length; if (p !== satisfied) errors.push(`$.debt_census.paid (${p}) != satisfied ledger entries (${satisfied})`); if (a !== exceptions) errors.push(`$.debt_census.accepted_exception (${a}) != accepted_exception ledger entries (${exceptions})`); } }
    if (assessment?.recommendation !== "proceed") errors.push(`$.verdict: CLEAN requires handoff_assessment.recommendation 'proceed' (got ${JSON.stringify(assessment?.recommendation)})`);
  } else if (assessment?.recommendation === "proceed") errors.push("$.handoff_assessment.recommendation: unconditional proceed conflicts with NOT_CLEAN verdict");
  if (!allowPlaceholders) {
    if (typeof repo.commit !== "string" || !/^[0-9a-f]{7,40}$/.test(repo.commit)) errors.push("$.repo.commit: required 7-40 char hex object id");
    for (const field of ["target_commit", "candidate_commit", "merge_base"]) if (typeof target?.[field] !== "string" || !/^[0-9a-f]{7,40}$/.test(target[field] as string)) errors.push(`$.target_binding.${field}: required 7-40 char hex object id`);
    if (!isoTimestamp(report.generated_at)) errors.push("$.generated_at: required timezone-aware ISO-8601 timestamp");
  }
  const objectCommits = new Map<string, string>();
  for (const [name, raw] of Object.entries(claims ?? {})) { const claim = object(raw); if (!claim) continue; for (const event of array(claim.evidence) ?? []) { const evidence = object(event); if (evidence?.independence !== undefined && !["established", "not_established", "legacy_unrecoverable"].includes(String(evidence.independence))) errors.push(`$.claims.${name}: independence must be established|not_established|legacy_unrecoverable`); else if (evidence?.independence === "legacy_unrecoverable") for (const key of ["authority", "scope"]) if (!nonempty(evidence[key])) errors.push(`$.claims.${name}: legacy_unrecoverable requires ${key}`); if (evidence?.kind === "independent_qa_verdict" && normalizeActor(evidence.reviewer) && normalizeActor(evidence.reviewer) === normalizeActor(evidence.implementer) && claim.state === "established") errors.push(`$.claims.${name}: reviewer and implementer normalize to the same actor (${JSON.stringify(evidence.reviewer)}) -- independence cannot be established`); } if (claim.state === "not_applicable" && (!nonempty(claim.na_reason) || !nonempty(claim.policy_ref))) errors.push(`$.claims.${name}: not_applicable requires na_reason AND policy_ref (a policy-bound citation, not generic rationale)`); if (claim.state === "established") { const evidence = (array(claim.evidence) ?? []).map(object).find(item => !!item && nonempty(item.commit)); if (evidence) objectCommits.set(name, evidence.commit as string); } }
  if (new Set(objectCommits.values()).size > 1) errors.push(`$.claims: same-object violation -- established claims bind different commits: ${[...objectCommits.entries()].sort().map(([name, commit]) => `${name}=${commit}`).join(", ")}`);
  if (verdict === "CLEAN") { for (const [name, commit] of objectCommits) if (repo.commit && commit !== repo.commit) errors.push(`$.claims.${name}: CLEAN requires claim commit ${JSON.stringify(commit)} to equal repo.commit ${JSON.stringify(repo.commit)}`); const actionIds = new Set<string>(); for (const [index, raw] of (array(report.actions) ?? []).entries()) { const action = object(raw); if (!action) { errors.push(`$.actions[${index}]: expected object`); continue; } if (!nonempty(action.id)) errors.push(`$.actions[${index}].id: required`); else if (actionIds.has(action.id)) errors.push(`$.actions[${index}].id: duplicate ${JSON.stringify(action.id)}`); else actionIds.add(action.id); if (["planned", "failed", "blocked", undefined].includes(action.status as string | undefined)) errors.push(`$.actions[${index}]: CLEAN forbidden with unfinished/failed action (status=${JSON.stringify(action.status)})`); else if (action.status === "skipped" && !nonempty(action.skip_reason)) errors.push(`$.actions[${index}]: skipped action requires skip_reason`); } if (report.mode === "CLOSE" && Object.keys(claims ?? {}).length > 0 && Object.values(claims ?? {}).every(raw => object(raw)?.state === "not_applicable")) errors.push("$.claims: CLEAN in CLOSE mode cannot mark every claim not_applicable"); }
  if (!allowPlaceholders) for (const path of findPlaceholders(data)) errors.push(`${path}: unresolved template placeholder`);
  return errors;
}

function commitObject(value: unknown, allowPlaceholders: boolean): boolean {
  return typeof value === "string"
    && ((allowPlaceholders && PLACEHOLDER.test(value)) || /^[0-9a-f]{7,40}$/.test(value));
}

function exactGitObject(value: unknown, allowPlaceholders: boolean): boolean {
  return typeof value === "string"
    && ((allowPlaceholders && PLACEHOLDER.test(value)) || /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value));
}

function canonicalWriteRoot(value: unknown): string {
  if (!nonempty(value)) return "";
  const normalized = pathPosix.normalize(value.replaceAll("\\", "/"));
  const wildcard = normalized.search(/[?*[\]{}]/);
  const root = wildcard < 0 ? normalized : normalized.slice(0, wildcard);
  return root.replace(/\/+$/, "");
}

function writeRootsOverlap(left: string, right: string): boolean {
  if (!left || !right) return true;
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function targetWithinWritePaths(target: string, writePaths: readonly unknown[]): boolean {
  const normalized = pathPosix.normalize(target.replaceAll("\\", "/"));
  return writePaths.some((pattern) => {
    const root = canonicalWriteRoot(pattern);
    return root === "" || normalized === root || normalized.startsWith(`${root}/`);
  });
}

function digestRefOrPlaceholder(value: unknown, allowPlaceholders: boolean): boolean {
  return digestRef(value) || (allowPlaceholders && findPlaceholders(value).length > 0);
}

function normalizedStringSet(value: unknown): string[] | undefined {
  const values = array(value);
  if (!values || values.some((item) => !nonempty(item))) return undefined;
  return [...new Set(values.map((item) => pathPosix.normalize(String(item).replaceAll("\\", "/"))))].sort();
}

function validatePlanningProjectionTransaction(
  action: ObjectRecord,
  lane: ObjectRecord | undefined,
  path: string,
  errors: string[],
  allowPlaceholders: boolean,
): void {
  requireKeys(action.projection_transaction, [
    "cause_key", "source_of_truth", "required_projections", "updated_projections", "atomic", "post_audit",
  ], `${path}.projection_transaction`, errors);
  const transaction = object(action.projection_transaction);
  if (!transaction) return;
  if (!nonempty(transaction.cause_key)) errors.push(`${path}.projection_transaction.cause_key: required stable debt/root-cause key`);
  if (!nonempty(transaction.source_of_truth)) errors.push(`${path}.projection_transaction.source_of_truth: required`);
  const required = normalizedStringSet(transaction.required_projections);
  const updated = normalizedStringSet(transaction.updated_projections);
  if (!required?.length) errors.push(`${path}.projection_transaction.required_projections: required nonempty exact projection set`);
  if (!updated?.length) errors.push(`${path}.projection_transaction.updated_projections: required nonempty exact projection set`);
  if (required && updated && JSON.stringify(required) !== JSON.stringify(updated)) {
    errors.push(`${path}.projection_transaction: required_projections must equal updated_projections atomically`);
  }
  if (transaction.atomic !== true) errors.push(`${path}.projection_transaction.atomic: expected true`);
  requireKeys(transaction.post_audit, ["status", "object", "evidence_ref"], `${path}.projection_transaction.post_audit`, errors);
  const audit = object(transaction.post_audit);
  if (audit) {
    if (audit.status !== "passed") errors.push(`${path}.projection_transaction.post_audit.status: expected passed`);
    if (audit.object !== action.after_object) errors.push(`${path}.projection_transaction.post_audit.object: must equal the operation after_object`);
    if (!digestRefOrPlaceholder(audit.evidence_ref, allowPlaceholders)) {
      errors.push(`${path}.projection_transaction.post_audit.evidence_ref: required digest-bound projection-coherence evidence`);
    }
  }
  const collisionKeys = new Set((array(lane?.collision_keys) ?? []).map(canonicalIdentity));
  const coordinationClaims = (array(lane?.coordination_claims) ?? [])
    .map(object)
    .filter((item): item is ObjectRecord => !!item);
  const ownsPlanningDomain = coordinationClaims.some((claim) => (
    canonicalIdentity(claim.key) === canonicalIdentity("planning-projections") && claim.access === "write"
  ));
  if (!collisionKeys.has(canonicalIdentity("planning-projections")) && !ownsPlanningDomain) {
    errors.push(`${path}.lane_id: planning_record_update requires a write claim on planning-projections`);
  }
}

function validatePushGate(
  action: ObjectRecord,
  lane: ObjectRecord | undefined,
  coordination: ObjectRecord | undefined,
  repo: ObjectRecord,
  parents: readonly ObjectRecord[],
  path: string,
  errors: string[],
  allowPlaceholders: boolean,
): void {
  if (lane?.role !== "integrator") errors.push(`${path}.lane_id: git_push requires the integrator lane`);
  requireKeys(action.push_gate, [
    "intent", "remote_ref", "candidate_commit", "expected_remote_commit", "observed_remote_commit",
    "observed_at", "writers_frozen", "worktree_clean", "review", "validation", "prior_remote_ci",
  ], `${path}.push_gate`, errors);
  const gate = object(action.push_gate);
  if (!gate) return;
  const intent = String(gate.intent);
  if (!PUSH_INTENTS.has(intent)) errors.push(`${path}.push_gate.intent: expected coherent_wave or minimal_ci_repair`);
  const coordinationTarget = object(coordination?.target);
  if (!nonempty(gate.remote_ref)) errors.push(`${path}.push_gate.remote_ref: required`);
  else if (coordinationTarget && gate.remote_ref !== coordinationTarget.ref) {
    errors.push(`${path}.push_gate.remote_ref: must equal coordination.target.ref`);
  }
  for (const field of ["candidate_commit", "expected_remote_commit", "observed_remote_commit"] as const) {
    if (!commitObject(gate[field], allowPlaceholders)) errors.push(`${path}.push_gate.${field}: required 7-40 char hex object id`);
  }
  if (gate.expected_remote_commit !== gate.observed_remote_commit) {
    errors.push(`${path}.push_gate: compare-and-swap precondition failed; observed remote differs from expected remote`);
  }
  if (gate.candidate_commit !== action.before_object || gate.candidate_commit !== action.after_object) {
    errors.push(`${path}.push_gate.candidate_commit: push must preserve the same local before/after candidate object`);
  }
  if (nonempty(repo.commit) && gate.candidate_commit !== repo.commit) {
    errors.push(`${path}.push_gate.candidate_commit: must equal repo.commit`);
  }
  if (!(allowPlaceholders && findPlaceholders(gate.observed_at).length > 0) && !isoTimestamp(gate.observed_at)) {
    errors.push(`${path}.push_gate.observed_at: required ISO timestamp`);
  }
  if (gate.writers_frozen !== true) errors.push(`${path}.push_gate.writers_frozen: expected true`);
  if (gate.worktree_clean !== true) errors.push(`${path}.push_gate.worktree_clean: expected true`);

  requireKeys(gate.review, ["state", "evidence_ref"], `${path}.push_gate.review`, errors);
  const review = object(gate.review);
  if (review) {
    if (review.state !== "accepted") errors.push(`${path}.push_gate.review.state: expected accepted`);
    if (!digestRefOrPlaceholder(review.evidence_ref, allowPlaceholders)) errors.push(`${path}.push_gate.review.evidence_ref: required digest-bound review`);
  }

  requireKeys(gate.validation, [
    "candidate_commit", "focused_state", "full_applicable_state", "known_failing_gates",
    "evidence_ref", "no_harm_evidence_ref",
  ], `${path}.push_gate.validation`, errors);
  const validation = object(gate.validation);
  if (validation) {
    if (validation.candidate_commit !== gate.candidate_commit) errors.push(`${path}.push_gate.validation.candidate_commit: must equal candidate_commit`);
    if (validation.focused_state !== "passed") errors.push(`${path}.push_gate.validation.focused_state: expected passed`);
    if (validation.full_applicable_state !== "passed") errors.push(`${path}.push_gate.validation.full_applicable_state: expected passed`);
    if (!Array.isArray(validation.known_failing_gates)) errors.push(`${path}.push_gate.validation.known_failing_gates: expected array`);
    else if (validation.known_failing_gates.length > 0) {
      errors.push(`${path}.push_gate.validation.known_failing_gates: push forbidden while any established gate is red, regardless of product/test-infrastructure classification`);
    }
    for (const field of ["evidence_ref", "no_harm_evidence_ref"] as const) {
      if (!digestRefOrPlaceholder(validation[field], allowPlaceholders)) errors.push(`${path}.push_gate.validation.${field}: required digest-bound evidence`);
    }
  }

  requireKeys(gate.prior_remote_ci, ["status", "commit", "evidence_ref"], `${path}.push_gate.prior_remote_ci`, errors);
  const priorCi = object(gate.prior_remote_ci);
  if (priorCi) {
    if (!new Set(["success", "failure", "not_configured"]).has(String(priorCi.status))) {
      errors.push(`${path}.push_gate.prior_remote_ci.status: expected success, failure, or not_configured`);
    }
    if (priorCi.commit !== gate.observed_remote_commit) errors.push(`${path}.push_gate.prior_remote_ci.commit: must equal observed_remote_commit`);
    if (!digestRefOrPlaceholder(priorCi.evidence_ref, allowPlaceholders)) errors.push(`${path}.push_gate.prior_remote_ci.evidence_ref: required digest-bound CI observation`);
    if (intent === "coherent_wave" && !["success", "not_configured"].includes(String(priorCi.status))) {
      errors.push(`${path}.push_gate.prior_remote_ci.status: coherent_wave requires the prior remote to be green or explicitly have no CI`);
    }
    if (intent === "minimal_ci_repair" && priorCi.status !== "failure") {
      errors.push(`${path}.push_gate.prior_remote_ci.status: minimal_ci_repair is reserved for a red remote baseline`);
    }
  }

  const parentMatches = intent === "coherent_wave"
    ? parents.some((parent) => parent.kind === "git_integrate" && parent.status === "executed"
      && object(parent.cas)?.result === "applied" && parent.after_object === gate.candidate_commit)
    : parents.some((parent) => parent.kind === "git_commit" && parent.status === "executed"
      && parent.after_object === gate.candidate_commit);
  if (!parentMatches) {
    errors.push(`${path}.parent_operation_ids: ${intent || "push"} requires the candidate-producing applied integration or minimal-repair commit as a direct parent`);
  }
  if ((action.status === "executed" || action.outcome !== undefined)
    && (array(object(action.outcome)?.evidence) ?? []).map(object).filter(Boolean)
      .every((evidence) => evidence?.kind !== "remote_ref_resolution")) {
    errors.push(`${path}.outcome.evidence: git_push requires a remote_ref_resolution receipt`);
  }
}

type CoordinationDomainState = {
  version: number;
  stateDigest: string;
};

function sha256(value: unknown, allowPlaceholders: boolean): boolean {
  return typeof value === "string"
    && ((allowPlaceholders && PLACEHOLDER.test(value)) || /^[0-9a-f]{64}$/.test(value));
}

function validateCoordinationDomains(
  coordination: ObjectRecord | undefined,
  path: string,
  errors: string[],
  allowPlaceholders: boolean,
): Map<string, CoordinationDomainState> {
  const result = new Map<string, CoordinationDomainState>();
  const domains = array(coordination?.domains);
  if (!domains) {
    errors.push(`${path}.domains: schema 1.2 requires an array of versioned coordination domains`);
    return result;
  }
  for (const [index, raw] of domains.entries()) {
    const domainPath = `${path}.domains[${index}]`;
    requireKeys(raw, ["key", "version", "state_digest", "observed_at", "evidence_ref"], domainPath, errors);
    const domain = object(raw);
    if (!domain) continue;
    const key = canonicalIdentity(domain.key);
    if (!key) errors.push(`${domainPath}.key: required canonical coordination key`);
    else if (result.has(key)) errors.push(`${domainPath}.key: duplicate coordination domain ${JSON.stringify(key)}`);
    if (!Number.isInteger(domain.version) || Number(domain.version) < 0) {
      errors.push(`${domainPath}.version: required nonnegative monotonic integer`);
    }
    if (!sha256(domain.state_digest, allowPlaceholders)) {
      errors.push(`${domainPath}.state_digest: required SHA-256 of the invariant-bearing state`);
    }
    if (!(allowPlaceholders && findPlaceholders(domain.observed_at).length > 0) && !isoTimestamp(domain.observed_at)) {
      errors.push(`${domainPath}.observed_at: required ISO timestamp`);
    }
    if (!digestRefOrPlaceholder(domain.evidence_ref, allowPlaceholders)) {
      errors.push(`${domainPath}.evidence_ref: required digest-bound domain observation`);
    }
    if (key && Number.isInteger(domain.version) && sha256(domain.state_digest, allowPlaceholders)) {
      result.set(key, { version: Number(domain.version), stateDigest: String(domain.state_digest) });
    }
  }
  return result;
}

function coordinationClaimsCommute(left: ObjectRecord, right: ObjectRecord): boolean {
  const leftClass = canonicalIdentity(left.operation_class);
  const rightClass = canonicalIdentity(right.operation_class);
  const leftAllows = new Set((array(left.commutes_with) ?? []).map(canonicalIdentity));
  const rightAllows = new Set((array(right.commutes_with) ?? []).map(canonicalIdentity));
  const leftRef = object(left.commutativity_ref);
  const rightRef = object(right.commutativity_ref);
  return !!leftClass && !!rightClass
    && leftAllows.has(rightClass)
    && rightAllows.has(leftClass)
    && digestRef(leftRef)
    && digestRef(rightRef)
    && leftRef?.sha256 === rightRef?.sha256;
}

function validateLaneCoordinationClaims(
  lane: ObjectRecord,
  lanePath: string,
  domains: ReadonlyMap<string, CoordinationDomainState>,
  errors: string[],
  allowPlaceholders: boolean,
): ObjectRecord[] {
  const rawClaims = array(lane.coordination_claims);
  if (!rawClaims) {
    errors.push(`${lanePath}.coordination_claims: schema 1.2 requires an array`);
    return [];
  }
  const claims: ObjectRecord[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of rawClaims.entries()) {
    const claimPath = `${lanePath}.coordination_claims[${index}]`;
    requireKeys(raw, [
      "key", "access", "expected_version", "expected_state_digest", "operation_class",
      "commutes_with", "commutativity_ref",
    ], claimPath, errors);
    const claim = object(raw);
    if (!claim) continue;
    const key = canonicalIdentity(claim.key);
    if (!key) errors.push(`${claimPath}.key: required canonical coordination key`);
    else if (seen.has(key)) errors.push(`${claimPath}.key: duplicate lane claim ${JSON.stringify(key)}`);
    else seen.add(key);
    if (!COORDINATION_ACCESS.has(String(claim.access))) {
      errors.push(`${claimPath}.access: expected read or write`);
    }
    if (!Number.isInteger(claim.expected_version) || Number(claim.expected_version) < 0) {
      errors.push(`${claimPath}.expected_version: required nonnegative integer`);
    }
    if (!sha256(claim.expected_state_digest, allowPlaceholders)) {
      errors.push(`${claimPath}.expected_state_digest: required SHA-256`);
    }
    if (!nonempty(claim.operation_class)) errors.push(`${claimPath}.operation_class: required`);
    if (!Array.isArray(claim.commutes_with)) errors.push(`${claimPath}.commutes_with: expected array`);
    else if (claim.commutes_with.some((item) => !nonempty(item))) errors.push(`${claimPath}.commutes_with: entries must be nonempty operation classes`);
    const commutes = array(claim.commutes_with) ?? [];
    if (commutes.length > 0 && !digestRefOrPlaceholder(claim.commutativity_ref, allowPlaceholders)) {
      errors.push(`${claimPath}.commutativity_ref: explicit commutativity requires digest-bound policy evidence`);
    }
    if (commutes.length === 0 && claim.commutativity_ref !== null) {
      errors.push(`${claimPath}.commutativity_ref: must be null when no commutativity is claimed`);
    }
    const domain = domains.get(key);
    if (!domain) errors.push(`${claimPath}.key: does not resolve to coordination.domains`);
    else {
      if (claim.expected_version !== domain.version) {
        errors.push(`${claimPath}.expected_version: stale plan; expected ${JSON.stringify(claim.expected_version)} but live domain is ${domain.version}`);
      }
      if (claim.expected_state_digest !== domain.stateDigest) {
        errors.push(`${claimPath}.expected_state_digest: stale plan; invariant state digest has changed`);
      }
    }
    if (key) claims.push(claim);
  }
  return claims;
}

function validateCoordination(
  value: unknown,
  path: string,
  errors: string[],
  allowPlaceholders: boolean,
  schemaVersion: string,
  domains: ReadonlyMap<string, CoordinationDomainState>,
): Map<string, ObjectRecord> {
  const requiredCoordinationKeys = [
    "dispatcher", "integrator", "write_policy", "integration_policy",
    "integration_mutex", "local_inference_max_concurrency", "target", "lanes",
  ];
  if (schemaVersion === "1.2") requiredCoordinationKeys.push("domains");
  requireKeys(value, requiredCoordinationKeys, path, errors);
  const coordination = object(value);
  const laneMap = new Map<string, ObjectRecord>();
  if (!coordination) return laneMap;
  for (const field of ["dispatcher", "integrator"] as const) {
    if (!nonempty(coordination[field])) errors.push(`${path}.${field}: required`);
  }
  if (coordination.write_policy !== "isolated_worktrees") {
    errors.push(`${path}.write_policy: expected isolated_worktrees`);
  }
  if (coordination.integration_policy !== "mutex_and_compare_and_swap") {
    errors.push(`${path}.integration_policy: expected mutex_and_compare_and_swap`);
  }
  requireKeys(coordination.integration_mutex, [
    "required", "kind", "scope", "max_lease_seconds",
  ], `${path}.integration_mutex`, errors);
  const integrationMutex = object(coordination.integration_mutex);
  if (integrationMutex) {
    if (integrationMutex.required !== true) errors.push(`${path}.integration_mutex.required: expected true`);
    if (integrationMutex.kind !== "lease_with_fencing") {
      errors.push(`${path}.integration_mutex.kind: expected lease_with_fencing`);
    }
    if (integrationMutex.scope !== "target_ref") {
      errors.push(`${path}.integration_mutex.scope: expected target_ref`);
    }
    if (!Number.isInteger(integrationMutex.max_lease_seconds)
      || Number(integrationMutex.max_lease_seconds) < 1
      || Number(integrationMutex.max_lease_seconds) > 900) {
      errors.push(`${path}.integration_mutex.max_lease_seconds: expected integer from 1 through 900`);
    }
  }
  if (coordination.local_inference_max_concurrency !== 1) {
    errors.push(`${path}.local_inference_max_concurrency: expected 1`);
  }
  requireKeys(coordination.target, ["ref", "expected_commit", "observed_at"], `${path}.target`, errors);
  const target = object(coordination.target);
  if (target) {
    if (!nonempty(target.ref)) errors.push(`${path}.target.ref: required`);
    if (!commitObject(target.expected_commit, allowPlaceholders)) {
      errors.push(`${path}.target.expected_commit: required 7-40 char hex object id`);
    }
    if (!(allowPlaceholders && findPlaceholders(target.observed_at).length > 0) && !isoTimestamp(target.observed_at)) {
      errors.push(`${path}.target.observed_at: required ISO timestamp`);
    }
  }

  const lanes = array(coordination.lanes);
  if (!lanes) {
    errors.push(`${path}.lanes: expected array`);
    return laneMap;
  }
  const activeCollisionOwners = new Map<string, string>();
  const activeCoordinationClaims = new Map<string, Array<{ laneId: string; claim: ObjectRecord }>>();
  const activeWorktrees = new Map<string, string>();
  const activeBranches = new Map<string, string>();
  const activeWriteRoots: Array<{ readonly root: string; readonly laneId: string }> = [];
  let activeIntegrators = 0;
  let activeLocalInference = 0;
  for (const [index, raw] of lanes.entries()) {
    const lanePath = `${path}.lanes[${index}]`;
    const requiredLaneKeys = [
      "id", "task_id", "owner", "role", "state", "execution_class", "model",
      "reasoning", "harness", "safe_context_limit_tokens", "estimated_context_tokens",
      "evaluation_mode", "routing_reason", "worktree", "branch", "baseline_commit",
      "read_paths", "write_paths", "dependencies", "invariants", "acceptance", "bootstrap",
      schemaVersion === "1.2" ? "coordination_claims" : "collision_keys",
    ];
    requireKeys(raw, requiredLaneKeys, lanePath, errors);
    const lane = object(raw);
    if (!lane) continue;
    const id = String(lane.id ?? "");
    if (!nonempty(lane.id)) errors.push(`${lanePath}.id: required`);
    else if (laneMap.has(id)) errors.push(`${lanePath}.id: duplicate ${JSON.stringify(id)}`);
    else laneMap.set(id, lane);
    for (const field of ["task_id", "owner", "routing_reason"] as const) {
      if (!nonempty(lane[field])) errors.push(`${lanePath}.${field}: required`);
    }
    if (!LANE_ROLES.has(String(lane.role))) errors.push(`${lanePath}.role: unsupported ${JSON.stringify(lane.role)}`);
    if (!LANE_STATES.has(String(lane.state))) errors.push(`${lanePath}.state: unsupported ${JSON.stringify(lane.state)}`);
    if (!EXECUTION_CLASSES.has(String(lane.execution_class))) errors.push(`${lanePath}.execution_class: unsupported ${JSON.stringify(lane.execution_class)}`);
    if (!EVALUATION_MODES.has(String(lane.evaluation_mode))) errors.push(`${lanePath}.evaluation_mode: unsupported ${JSON.stringify(lane.evaluation_mode)}`);
    for (const field of ["read_paths", "write_paths", "dependencies", "invariants", "acceptance"] as const) {
      if (!Array.isArray(lane[field])) errors.push(`${lanePath}.${field}: expected array`);
    }
    if (schemaVersion !== "1.2" && !Array.isArray(lane.collision_keys)) {
      errors.push(`${lanePath}.collision_keys: expected array`);
    }
    const laneClaims = schemaVersion === "1.2"
      ? validateLaneCoordinationClaims(lane, lanePath, domains, errors, allowPlaceholders)
      : [];
    if (["active", "ready", "integrated"].includes(String(lane.state))) {
      for (const field of ["model", "reasoning", "harness"] as const) {
        if (!nonempty(lane[field])) errors.push(`${lanePath}.${field}: required once a lane starts`);
      }
      if (!array(lane.read_paths)?.length) errors.push(`${lanePath}.read_paths: active lane requires a bounded read set`);
      if (!array(lane.invariants)?.length) errors.push(`${lanePath}.invariants: active lane requires protected invariants`);
      if (!array(lane.acceptance)?.length) errors.push(`${lanePath}.acceptance: active lane requires an acceptance boundary`);
    }
    const safe = lane.safe_context_limit_tokens;
    const estimated = lane.estimated_context_tokens;
    if (safe !== null && (!Number.isInteger(safe) || Number(safe) <= 0)) {
      errors.push(`${lanePath}.safe_context_limit_tokens: expected null or positive integer`);
    }
    if (!Number.isInteger(estimated) || Number(estimated) < 0) {
      errors.push(`${lanePath}.estimated_context_tokens: required nonnegative integer`);
    } else if (Number.isInteger(safe) && Number(estimated) > Number(safe)) {
      errors.push(`${lanePath}.estimated_context_tokens: exceeds verified safe context limit`);
    }
    const active = lane.state === "active";
    if (lane.execution_class === "local_inference" && active) {
      activeLocalInference += 1;
      if (!Number.isInteger(safe) || Number(safe) <= 0) {
        errors.push(`${lanePath}.safe_context_limit_tokens: active local inference requires a verified limit`);
      }
    }
    const modifying = lane.role === "writer" || lane.role === "integrator";
    if (modifying) {
      if (typeof lane.worktree !== "string" || !pathPosix.isAbsolute(lane.worktree)) {
        errors.push(`${lanePath}.worktree: modifying lane requires an absolute dedicated worktree`);
      }
      if (!nonempty(lane.branch)) errors.push(`${lanePath}.branch: modifying lane requires a branch`);
      if (!commitObject(lane.baseline_commit, allowPlaceholders)) {
        errors.push(`${lanePath}.baseline_commit: modifying lane requires a 7-40 char hex object id`);
      }
      if (!array(lane.write_paths)?.length) errors.push(`${lanePath}.write_paths: modifying lane requires a bounded write set`);
      if (schemaVersion === "1.2") {
        if (!laneClaims.some((claim) => claim.access === "write")) {
          errors.push(`${lanePath}.coordination_claims: modifying lane requires at least one versioned write claim`);
        }
      } else if (!array(lane.collision_keys)?.length) {
        errors.push(`${lanePath}.collision_keys: modifying lane requires semantic collision keys`);
      }
      for (const [writeIndex, rawPath] of (array(lane.write_paths) ?? []).entries()) {
        if (!nonempty(rawPath)) {
          errors.push(`${lanePath}.write_paths[${writeIndex}]: required nonempty repository-relative path or glob`);
          continue;
        }
        const normalized = pathPosix.normalize(rawPath.replaceAll("\\", "/"));
        if (pathPosix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")
          || normalized === ".git" || normalized.startsWith(".git/")) {
          errors.push(`${lanePath}.write_paths[${writeIndex}]: must be repository-relative, non-traversing, and outside .git`);
        }
        if (lane.role === "writer" && canonicalWriteRoot(rawPath) === "") {
          errors.push(`${lanePath}.write_paths[${writeIndex}]: writer lanes require a bounded root; repository-wide globs are integrator-only`);
        }
      }
      if (["active", "ready", "integrated"].includes(String(lane.state))) {
        requireKeys(lane.bootstrap, [
          "worktree", "branch", "head", "observed_at", "evidence_ref",
        ], `${lanePath}.bootstrap`, errors);
        const bootstrap = object(lane.bootstrap);
        if (bootstrap) {
          if (bootstrap.worktree !== lane.worktree) errors.push(`${lanePath}.bootstrap.worktree: must equal the assigned worktree`);
          if (bootstrap.branch !== lane.branch) errors.push(`${lanePath}.bootstrap.branch: must equal the assigned branch`);
          if (bootstrap.head !== lane.baseline_commit) errors.push(`${lanePath}.bootstrap.head: must equal the assigned baseline_commit`);
          if (!(allowPlaceholders && findPlaceholders(bootstrap.observed_at).length > 0) && !isoTimestamp(bootstrap.observed_at)) {
            errors.push(`${lanePath}.bootstrap.observed_at: required ISO timestamp`);
          }
          if (!(allowPlaceholders && findPlaceholders(bootstrap.evidence_ref).length > 0) && !digestRef(bootstrap.evidence_ref)) {
            errors.push(`${lanePath}.bootstrap.evidence_ref: required digest-bound cwd/HEAD/branch evidence`);
          }
        }
      }
    }
    if (active && schemaVersion === "1.2") {
      if (laneClaims.length === 0) errors.push(`${lanePath}.coordination_claims: active lane requires a bounded coordination domain`);
      for (const claim of laneClaims) {
        const key = canonicalIdentity(claim.key);
        const priorClaims = activeCoordinationClaims.get(key) ?? [];
        for (const prior of priorClaims) {
          const readRead = claim.access === "read" && prior.claim.access === "read";
          if (!readRead && !coordinationClaimsCommute(claim, prior.claim)) {
            errors.push(`${lanePath}.coordination_claims: active lanes ${prior.laneId} and ${id} overlap on ${JSON.stringify(key)} without symmetric, evidence-bound commutativity`);
          }
        }
        priorClaims.push({ laneId: id, claim });
        activeCoordinationClaims.set(key, priorClaims);
      }
    }
    if (active && modifying) {
      if (lane.role === "integrator") activeIntegrators += 1;
      if (typeof lane.worktree === "string") {
        const prior = activeWorktrees.get(lane.worktree);
        if (prior) errors.push(`${lanePath}.worktree: active modifying lanes ${prior} and ${id} share a worktree`);
        else activeWorktrees.set(lane.worktree, id);
      }
      if (nonempty(lane.branch)) {
        const prior = activeBranches.get(lane.branch);
        if (prior) errors.push(`${lanePath}.branch: active modifying lanes ${prior} and ${id} share a branch`);
        else activeBranches.set(lane.branch, id);
      }
      if (schemaVersion !== "1.2") {
        for (const rawKey of array(lane.collision_keys) ?? []) {
          const key = canonicalIdentity(rawKey);
          if (!key) {
            errors.push(`${lanePath}.collision_keys: entries must be nonempty`);
            continue;
          }
          const prior = activeCollisionOwners.get(key);
          if (prior) errors.push(`${lanePath}.collision_keys: active modifying lanes ${prior} and ${id} overlap on ${JSON.stringify(key)}`);
          else activeCollisionOwners.set(key, id);
        }
      }
      for (const rawPath of array(lane.write_paths) ?? []) {
        const root = canonicalWriteRoot(rawPath);
        for (const prior of activeWriteRoots) {
          if (writeRootsOverlap(root, prior.root)) {
            errors.push(`${lanePath}.write_paths: active modifying lanes ${prior.laneId} and ${id} overlap on write roots ${JSON.stringify(prior.root || "**/*")} and ${JSON.stringify(root || "**/*")}`);
          }
        }
        activeWriteRoots.push({ root, laneId: id });
      }
    }
  }
  if (activeIntegrators > 1) errors.push(`${path}.lanes: at most one integrator may be active`);
  if (activeLocalInference > 1) errors.push(`${path}.lanes: local inference is serialized; at most one model may be active`);
  return laneMap;
}

function validateCoordinationCas(
  action: ObjectRecord,
  lanes: ReadonlyMap<string, ObjectRecord>,
  domains: Map<string, CoordinationDomainState>,
  path: string,
  errors: string[],
  allowPlaceholders: boolean,
): void {
  requireKeys(action, ["source_lane_ids", "coordination_cas"], path, errors);
  const sourceLaneIds = array(action.source_lane_ids);
  if (!sourceLaneIds?.length) {
    errors.push(`${path}.source_lane_ids: schema 1.2 integration requires at least one source lane`);
    return;
  }
  const sourceLanes = new Map<string, ObjectRecord>();
  for (const [index, rawId] of sourceLaneIds.entries()) {
    const sourcePath = `${path}.source_lane_ids[${index}]`;
    if (!nonempty(rawId)) {
      errors.push(`${sourcePath}: required lane id`);
      continue;
    }
    const id = String(rawId);
    if (sourceLanes.has(id)) {
      errors.push(`${sourcePath}: duplicate source lane ${JSON.stringify(id)}`);
      continue;
    }
    const source = lanes.get(id);
    if (!source) errors.push(`${sourcePath}: does not resolve to coordination.lanes`);
    else if (source.role !== "writer") errors.push(`${sourcePath}: integration source must be a writer lane`);
    else sourceLanes.set(id, source);
  }

  const expectedClaims = new Map<string, { laneId: string; claim: ObjectRecord }>();
  const writeOwners = new Map<string, string>();
  for (const [laneId, source] of sourceLanes) {
    for (const claim of (array(source.coordination_claims) ?? []).map(object).filter((item): item is ObjectRecord => !!item)) {
      const key = canonicalIdentity(claim.key);
      const pair = `${laneId}\u0000${key}`;
      expectedClaims.set(pair, { laneId, claim });
      if (claim.access === "write") {
        const prior = writeOwners.get(key);
        if (prior) {
          errors.push(`${path}.source_lane_ids: source lanes ${prior} and ${laneId} both write ${JSON.stringify(key)}; combine them into one task or integrate as separate versioned transactions`);
        } else writeOwners.set(key, laneId);
      }
    }
  }

  const entries = array(action.coordination_cas);
  if (!entries) {
    errors.push(`${path}.coordination_cas: expected array`);
    return;
  }
  const seen = new Set<string>();
  const integrationApplied = object(action.cas)?.result === "applied";
  const pendingUpdates = new Map<string, CoordinationDomainState>();
  const startErrorCount = errors.length;
  for (const [index, raw] of entries.entries()) {
    const entryPath = `${path}.coordination_cas[${index}]`;
    requireKeys(raw, [
      "source_lane_id", "key", "access", "operation_class", "expected_version", "observed_version",
      "expected_state_digest", "observed_state_digest", "result", "result_version",
      "result_state_digest", "observed_at", "evidence_ref",
    ], entryPath, errors);
    const entry = object(raw);
    if (!entry) continue;
    const laneId = String(entry.source_lane_id ?? "");
    const key = canonicalIdentity(entry.key);
    const pair = `${laneId}\u0000${key}`;
    if (seen.has(pair)) errors.push(`${entryPath}: duplicate source-lane/domain check`);
    else seen.add(pair);
    const expected = expectedClaims.get(pair);
    if (!expected) errors.push(`${entryPath}: does not correspond to a source lane coordination claim`);
    else {
      for (const field of ["access", "operation_class", "expected_version", "expected_state_digest"] as const) {
        const claimField = field;
        if (entry[field] !== expected.claim[claimField]) errors.push(`${entryPath}.${field}: must equal the source lane claim`);
      }
    }
    if (!COORDINATION_ACCESS.has(String(entry.access))) errors.push(`${entryPath}.access: expected read or write`);
    if (!COORDINATION_CAS_RESULTS.has(String(entry.result))) errors.push(`${entryPath}.result: unsupported coordination CAS result`);
    for (const field of ["expected_version", "observed_version", "result_version"] as const) {
      if (!Number.isInteger(entry[field]) || Number(entry[field]) < 0) errors.push(`${entryPath}.${field}: required nonnegative integer`);
    }
    for (const field of ["expected_state_digest", "observed_state_digest", "result_state_digest"] as const) {
      if (!sha256(entry[field], allowPlaceholders)) errors.push(`${entryPath}.${field}: required SHA-256`);
    }
    if (!(allowPlaceholders && findPlaceholders(entry.observed_at).length > 0) && !isoTimestamp(entry.observed_at)) {
      errors.push(`${entryPath}.observed_at: required ISO timestamp`);
    }
    if (!digestRefOrPlaceholder(entry.evidence_ref, allowPlaceholders)) {
      errors.push(`${entryPath}.evidence_ref: required digest-bound live domain observation`);
    }
    const live = domains.get(key);
    if (!live) errors.push(`${entryPath}.key: does not resolve to a live coordination domain`);
    else {
      if (entry.observed_version !== live.version) errors.push(`${entryPath}.observed_version: must equal the freshly observed live domain version`);
      if (entry.observed_state_digest !== live.stateDigest) errors.push(`${entryPath}.observed_state_digest: must equal the freshly observed live domain digest`);
      const stale = entry.expected_version !== entry.observed_version
        || entry.expected_state_digest !== entry.observed_state_digest;
      if (integrationApplied && stale) {
        errors.push(`${entryPath}: stale plan cannot integrate; re-plan and re-attest against the live coordination domain`);
      }
      if (integrationApplied && entry.access === "read") {
        if (entry.result !== "validated") errors.push(`${entryPath}.result: applied integration requires validated for a read claim`);
        if (entry.result_version !== entry.observed_version || entry.result_state_digest !== entry.observed_state_digest) {
          errors.push(`${entryPath}: a read claim must preserve the observed domain version and digest`);
        }
      }
      if (integrationApplied && entry.access === "write") {
        if (entry.result !== "applied") errors.push(`${entryPath}.result: applied integration requires applied for a write claim`);
        if (entry.result_version !== Number(entry.observed_version) + 1) {
          errors.push(`${entryPath}.result_version: a write must advance the domain by exactly one`);
        }
        if (entry.result_state_digest === entry.observed_state_digest) {
          errors.push(`${entryPath}.result_state_digest: a version-advancing write requires changed invariant state`);
        }
        if (!stale && Number.isInteger(entry.result_version) && sha256(entry.result_state_digest, allowPlaceholders)) {
          pendingUpdates.set(key, { version: Number(entry.result_version), stateDigest: String(entry.result_state_digest) });
        }
      }
      if (!integrationApplied && entry.result === "rejected_stale" && !stale) {
        errors.push(`${entryPath}.result: rejected_stale requires a version or state-digest mismatch`);
      }
    }
  }
  for (const pair of expectedClaims.keys()) {
    if (!seen.has(pair)) errors.push(`${path}.coordination_cas: missing source-lane/domain check for ${JSON.stringify(pair.replace("\u0000", "@"))}`);
  }
  for (const pair of seen) {
    if (!expectedClaims.has(pair)) errors.push(`${path}.coordination_cas: contains an undeclared source-lane/domain check`);
  }
  if (integrationApplied && errors.length === startErrorCount) {
    for (const [key, state] of pendingUpdates) domains.set(key, state);
  }
}

function validateGuard(
  manifest: ObjectRecord,
  actions: readonly unknown[],
  lanes: ReadonlyMap<string, ObjectRecord>,
  errors: string[],
  allowPlaceholders: boolean,
): void {
  const guard = object(manifest.guard);
  requireKeys(manifest.guard, [
    "status", "baseline_commit", "candidate_tree", "minted_at", "staged_paths",
    "writers_frozen", "receipts", "deterministic_gates", "no_harm", "commit_barrier",
  ], "$.guard", errors);
  if (!guard) return;

  const status = String(guard.status);
  if (!GUARD_STATES.has(status)) errors.push(`$.guard.status: unsupported ${JSON.stringify(guard.status)}`);
  const repo = object(manifest.repo) ?? {};
  if (!commitObject(guard.baseline_commit, allowPlaceholders)) {
    errors.push("$.guard.baseline_commit: required 7-40 char baseline commit");
  } else if (nonempty(repo.commit) && guard.baseline_commit !== repo.commit) {
    errors.push("$.guard.baseline_commit: must equal repo.commit at GUARD initialization");
  }
  const candidateBound = status !== "initialized";
  if (candidateBound) {
    if (!exactGitObject(guard.candidate_tree, allowPlaceholders)) {
      errors.push("$.guard.candidate_tree: required exact 40- or 64-character staged-tree object");
    }
    if (!(allowPlaceholders && findPlaceholders(guard.minted_at).length > 0) && !isoTimestamp(guard.minted_at)) {
      errors.push("$.guard.minted_at: required timezone-aware candidate-mint timestamp");
    }
    if (guard.writers_frozen !== true) errors.push("$.guard.writers_frozen: candidate review requires frozen writers");
  } else {
    if (guard.candidate_tree !== null) errors.push("$.guard.candidate_tree: initialized GUARD must not claim a candidate tree");
    if (guard.minted_at !== null) errors.push("$.guard.minted_at: initialized GUARD must be null");
    if (guard.writers_frozen !== false) errors.push("$.guard.writers_frozen: initialized GUARD expects false until a tree is minted");
  }

  const stagedPaths = array(guard.staged_paths);
  if (!stagedPaths) errors.push("$.guard.staged_paths: expected array");
  else {
    const seenPaths = new Set<string>();
    for (const [index, rawPath] of stagedPaths.entries()) {
      const path = `$.guard.staged_paths[${index}]`;
      if (!nonempty(rawPath)) {
        errors.push(`${path}: required nonempty repository-relative path`);
        continue;
      }
      const normalized = pathPosix.normalize(rawPath.replaceAll("\\", "/"));
      if (pathPosix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")
        || normalized === ".git" || normalized.startsWith(".git/")) {
        errors.push(`${path}: must be repository-relative, non-traversing, and outside .git`);
      }
      if (seenPaths.has(normalized)) errors.push(`${path}: duplicate staged path ${JSON.stringify(normalized)}`);
      else seenPaths.add(normalized);
    }
  }

  const receipts = array(guard.receipts);
  const receiptById = new Map<string, ObjectRecord>();
  if (!receipts) errors.push("$.guard.receipts: expected array");
  else for (const [index, raw] of receipts.entries()) {
    const path = `$.guard.receipts[${index}]`;
    requireKeys(raw, [
      "id", "run_id", "round_id", "pod_id", "task_id", "role", "actor",
      "actual_model", "reasoning_level", "harness", "session_id",
      "baseline_commit", "candidate_tree", "prompt_sha256", "policy_sha256", "criteria_sha256", "checks_sha256",
      "started_at", "finished_at", "conclusion", "findings_total", "findings_paid", "unresolved",
      "repository_mutated", "mutation_owner_transfer", "evidence_ref",
    ], path, errors);
    const receipt = object(raw);
    if (!receipt) continue;
    const id = String(receipt.id ?? "");
    if (!nonempty(receipt.id)) errors.push(`${path}.id: required`);
    else if (receiptById.has(id)) errors.push(`${path}.id: duplicate ${JSON.stringify(id)}`);
    else receiptById.set(id, receipt);
    if (!GUARD_ROLES.has(String(receipt.role))) errors.push(`${path}.role: expected dev, qa, mister_clean, or holdout`);
    for (const field of [
      "run_id", "round_id", "pod_id", "task_id", "actor", "actual_model",
      "reasoning_level", "harness", "session_id",
    ] as const) {
      if (!nonempty(receipt[field])) errors.push(`${path}.${field}: required`);
    }
    if (receipt.baseline_commit !== guard.baseline_commit) errors.push(`${path}.baseline_commit: must equal guard baseline_commit`);
    if (receipt.candidate_tree !== guard.candidate_tree) errors.push(`${path}.candidate_tree: receipt is stale or bound to a different tree`);
    for (const field of ["prompt_sha256", "policy_sha256", "criteria_sha256", "checks_sha256"] as const) {
      if (!sha256(receipt[field], allowPlaceholders)) errors.push(`${path}.${field}: required SHA-256`);
    }
    for (const field of ["started_at", "finished_at"] as const) {
      if (!(allowPlaceholders && findPlaceholders(receipt[field]).length > 0) && !isoTimestamp(receipt[field])) {
        errors.push(`${path}.${field}: required timezone-aware ISO timestamp`);
      }
    }
    if (isoTimestamp(receipt.started_at) && isoTimestamp(receipt.finished_at)
      && Date.parse(String(receipt.started_at)) > Date.parse(String(receipt.finished_at))) {
      errors.push(`${path}: started_at cannot follow finished_at`);
    }
    if (!GUARD_CONCLUSIONS.has(String(receipt.conclusion))) {
      errors.push(`${path}.conclusion: expected pass, fail, conditional, or not_run`);
    }
    for (const field of ["findings_total", "findings_paid", "unresolved"] as const) {
      if (!Number.isInteger(receipt[field]) || Number(receipt[field]) < 0) {
        errors.push(`${path}.${field}: required nonnegative integer`);
      }
    }
    if (["findings_total", "findings_paid", "unresolved"].every((field) => Number.isInteger(receipt[field]))) {
      if (Number(receipt.findings_total) !== Number(receipt.findings_paid) + Number(receipt.unresolved)) {
        errors.push(`${path}: findings_total must equal findings_paid plus unresolved`);
      }
    }
    if (typeof receipt.repository_mutated !== "boolean") errors.push(`${path}.repository_mutated: expected boolean`);
    if (["qa", "holdout"].includes(String(receipt.role)) && receipt.repository_mutated !== false) {
      errors.push(`${path}.repository_mutated: QA and holdout are read-only exact-tree roles`);
    }
    if (receipt.repository_mutated === true) {
      if (!digestRefOrPlaceholder(receipt.mutation_owner_transfer, allowPlaceholders)) {
        errors.push(`${path}.mutation_owner_transfer: mutation requires a digest-bound custody transfer`);
      }
    } else if (receipt.mutation_owner_transfer !== null) {
      errors.push(`${path}.mutation_owner_transfer: must be null when the receipt did not mutate the repository`);
    }
    if (!digestRefOrPlaceholder(receipt.evidence_ref, allowPlaceholders)) {
      errors.push(`${path}.evidence_ref: required digest-bound exact-tree receipt`);
    }
  }

  const gates = object(guard.deterministic_gates);
  if (guard.deterministic_gates !== null) {
    requireKeys(guard.deterministic_gates, [
      "candidate_tree", "state", "required_count", "passed_count", "known_failures", "evidence_ref",
    ], "$.guard.deterministic_gates", errors);
    if (gates) {
      if (gates.candidate_tree !== guard.candidate_tree) errors.push("$.guard.deterministic_gates.candidate_tree: must equal guard candidate_tree");
      if (!new Set(["passed", "failed", "not_run"]).has(String(gates.state))) {
        errors.push("$.guard.deterministic_gates.state: expected passed, failed, or not_run");
      }
      for (const field of ["required_count", "passed_count"] as const) {
        if (!Number.isInteger(gates[field]) || Number(gates[field]) < 0) errors.push(`$.guard.deterministic_gates.${field}: required nonnegative integer`);
      }
      if (!Array.isArray(gates.known_failures)) errors.push("$.guard.deterministic_gates.known_failures: expected array");
      if (gates.state === "passed") {
        if (gates.required_count !== gates.passed_count) errors.push("$.guard.deterministic_gates: passed requires every required gate to pass");
        if ((array(gates.known_failures) ?? []).length > 0) errors.push("$.guard.deterministic_gates.known_failures: passed forbids known failures");
      }
      if (!digestRefOrPlaceholder(gates.evidence_ref, allowPlaceholders)) errors.push("$.guard.deterministic_gates.evidence_ref: required digest-bound gate receipt");
    }
  }

  const noHarm = object(guard.no_harm);
  if (guard.no_harm !== null) {
    requireKeys(guard.no_harm, ["candidate_tree", "state", "introduced_by_run_open", "evidence_ref"], "$.guard.no_harm", errors);
    if (noHarm) {
      if (noHarm.candidate_tree !== guard.candidate_tree) errors.push("$.guard.no_harm.candidate_tree: must equal guard candidate_tree");
      if (!new Set(["passed", "failed", "not_run"]).has(String(noHarm.state))) errors.push("$.guard.no_harm.state: expected passed, failed, or not_run");
      if (!Number.isInteger(noHarm.introduced_by_run_open) || Number(noHarm.introduced_by_run_open) < 0) {
        errors.push("$.guard.no_harm.introduced_by_run_open: required nonnegative integer");
      }
      if (noHarm.state === "passed" && noHarm.introduced_by_run_open !== 0) {
        errors.push("$.guard.no_harm.introduced_by_run_open: passed requires zero cleanup-introduced open debt");
      }
      if (!digestRefOrPlaceholder(noHarm.evidence_ref, allowPlaceholders)) errors.push("$.guard.no_harm.evidence_ref: required digest-bound comparator receipt");
    }
  }

  requireKeys(guard.commit_barrier, [
    "state", "approved_tree", "receipt_ids", "opened_at", "crossed_action_id",
  ], "$.guard.commit_barrier", errors);
  const barrier = object(guard.commit_barrier);
  if (!barrier) return;
  const barrierState = String(barrier.state);
  if (!GUARD_BARRIER_STATES.has(barrierState)) errors.push(`$.guard.commit_barrier.state: unsupported ${JSON.stringify(barrier.state)}`);
  if (status === "initialized" || status === "collecting") {
    if (barrierState !== "closed") errors.push("$.guard.commit_barrier.state: initialized or collecting GUARD must remain closed");
  } else if (status === "passed" && barrierState !== "open") {
    errors.push("$.guard.commit_barrier.state: passed GUARD requires an open barrier");
  } else if (status === "crossed" && barrierState !== "crossed") {
    errors.push("$.guard.commit_barrier.state: crossed GUARD requires a crossed barrier");
  } else if (status === "invalidated" && barrierState !== "invalidated") {
    errors.push("$.guard.commit_barrier.state: invalidated GUARD requires an invalidated barrier");
  }

  const selectedIds = array(barrier.receipt_ids);
  const selectedReceipts: ObjectRecord[] = [];
  if (!selectedIds) errors.push("$.guard.commit_barrier.receipt_ids: expected array");
  else {
    const seenIds = new Set<string>();
    for (const [index, rawId] of selectedIds.entries()) {
      const path = `$.guard.commit_barrier.receipt_ids[${index}]`;
      if (!nonempty(rawId)) {
        errors.push(`${path}: required receipt id`);
        continue;
      }
      const id = String(rawId);
      if (seenIds.has(id)) errors.push(`${path}: duplicate receipt id ${JSON.stringify(id)}`);
      else seenIds.add(id);
      const receipt = receiptById.get(id);
      if (!receipt) errors.push(`${path}: does not resolve to guard.receipts`);
      else selectedReceipts.push(receipt);
    }
  }

  const barrierReady = barrierState === "open" || barrierState === "crossed";
  if (barrierReady) {
    if (barrier.approved_tree !== guard.candidate_tree) errors.push("$.guard.commit_barrier.approved_tree: must equal guard candidate_tree");
    if (!(allowPlaceholders && findPlaceholders(barrier.opened_at).length > 0) && !isoTimestamp(barrier.opened_at)) {
      errors.push("$.guard.commit_barrier.opened_at: required timezone-aware timestamp");
    }
    if (selectedReceipts.length !== 4) errors.push("$.guard.commit_barrier.receipt_ids: exact-tree barrier requires exactly four final receipts");
    const byRole = new Map<string, ObjectRecord>();
    const actors = new Set<string>();
    const sessions = new Set<string>();
    const taskBindings = new Set<string>();
    for (const receipt of selectedReceipts) {
      const role = String(receipt.role);
      if (byRole.has(role)) errors.push(`$.guard.commit_barrier.receipt_ids: multiple selected receipts for ${role}`);
      else byRole.set(role, receipt);
      const actor = canonicalIdentity(receipt.actor);
      const session = canonicalIdentity(`${receipt.harness}:${receipt.session_id}`);
      taskBindings.add(JSON.stringify([
        receipt.run_id, receipt.round_id, receipt.pod_id, receipt.task_id,
      ]));
      if (actors.has(actor)) errors.push("$.guard.commit_barrier.receipt_ids: DEV, QA, Mister Clean, and holdout must be distinct actors");
      else actors.add(actor);
      if (sessions.has(session)) errors.push("$.guard.commit_barrier.receipt_ids: final receipts must come from distinct harness/session identities");
      else sessions.add(session);
      if (receipt.candidate_tree !== guard.candidate_tree) errors.push("$.guard.commit_barrier.receipt_ids: selected receipt is bound to a different candidate tree");
      if (receipt.conclusion !== "pass") errors.push("$.guard.commit_barrier.receipt_ids: every selected role receipt must conclude pass");
      if (receipt.unresolved !== 0 || receipt.findings_total !== receipt.findings_paid) {
        errors.push("$.guard.commit_barrier.receipt_ids: every selected receipt requires zero unresolved findings and all findings paid");
      }
      if (receipt.repository_mutated !== false) {
        errors.push("$.guard.commit_barrier.receipt_ids: a receipt that mutated the repository is stale; mint a new tree and obtain a non-mutating final receipt");
      }
    }
    if (taskBindings.size !== 1) {
      errors.push("$.guard.commit_barrier.receipt_ids: all final receipts must bind the same run, round, pod, and task");
    }
    for (const role of GUARD_ROLES) if (!byRole.has(role)) errors.push(`$.guard.commit_barrier.receipt_ids: missing final ${role} receipt`);
    const dev = byRole.get("dev");
    const qa = byRole.get("qa");
    const clean = byRole.get("mister_clean");
    const holdout = byRole.get("holdout");
    if (dev && qa && isoTimestamp(dev.finished_at) && isoTimestamp(qa.started_at)
      && Date.parse(String(dev.finished_at)) > Date.parse(String(qa.started_at))) {
      errors.push("$.guard.commit_barrier.receipt_ids: QA must start after DEV finishes the exact candidate");
    }
    if (dev && clean && isoTimestamp(dev.finished_at) && isoTimestamp(clean.started_at)
      && Date.parse(String(dev.finished_at)) > Date.parse(String(clean.started_at))) {
      errors.push("$.guard.commit_barrier.receipt_ids: Mister Clean must start after DEV finishes the exact candidate");
    }
    for (const prior of [dev, qa, clean]) {
      if (prior && holdout && isoTimestamp(prior.finished_at) && isoTimestamp(holdout.started_at)
        && Date.parse(String(prior.finished_at)) > Date.parse(String(holdout.started_at))) {
        errors.push("$.guard.commit_barrier.receipt_ids: holdout must remain the final independent pass");
      }
    }
    if (gates?.state !== "passed") errors.push("$.guard.deterministic_gates.state: commit barrier requires passed exact-tree gates");
    if (noHarm?.state !== "passed" || noHarm?.introduced_by_run_open !== 0) {
      errors.push("$.guard.no_harm: commit barrier requires a passed exact-tree comparator with zero introduced debt");
    }
  } else {
    if (barrier.approved_tree !== null) errors.push("$.guard.commit_barrier.approved_tree: closed or invalidated barrier must not approve a tree");
    if ((selectedIds ?? []).length > 0) errors.push("$.guard.commit_barrier.receipt_ids: closed or invalidated barrier must not select final receipts");
    if (barrier.opened_at !== null) errors.push("$.guard.commit_barrier.opened_at: closed or invalidated barrier must be null");
  }

  const actionById = new Map<string, ObjectRecord>();
  const executedCommits: ObjectRecord[] = [];
  for (const [actionIndex, raw] of actions.entries()) {
    const action = object(raw);
    if (!action) continue;
    if (nonempty(action.id)) actionById.set(action.id, action);
    if (action.status === "executed" && LOCAL_MUTATION_KINDS.has(String(action.kind))
      && isoTimestamp(action.recorded_at) && isoTimestamp(guard.minted_at)
      && Date.parse(String(action.recorded_at)) > Date.parse(String(guard.minted_at))
      && status !== "invalidated") {
      errors.push(`$.guard: executed mutation ${String(action.id)} occurred after candidate mint; invalidate receipts and mint a new tree`);
    }
    if (action.kind === "git_commit") {
      requireKeys(action.guard_commit, [
        "candidate_tree", "commit", "commit_tree", "receipt_ids", "evidence_ref",
      ], `$.actions[${actionIndex}].guard_commit`, errors);
      const commitProof = object(action.guard_commit);
      const lane = lanes.get(String(action.lane_id));
      if (lane?.role !== "integrator") errors.push(`$.actions[${actionIndex}].lane_id: GUARD git_commit requires the integrator lane`);
      if (commitProof) {
        if (commitProof.candidate_tree !== guard.candidate_tree || commitProof.commit_tree !== guard.candidate_tree) {
          errors.push(`$.actions[${actionIndex}].guard_commit: candidate_tree and commit_tree must equal the approved guard tree`);
        }
        if (action.status === "executed" && commitProof.commit !== action.after_object) {
          errors.push(`$.actions[${actionIndex}].guard_commit.commit: must equal the executed action after_object`);
        }
        const expectedReceipts = [...new Set((selectedIds ?? []).map(String))].sort();
        const actualReceipts = [...new Set((array(commitProof.receipt_ids) ?? []).map(String))].sort();
        if (JSON.stringify(expectedReceipts) !== JSON.stringify(actualReceipts)) {
          errors.push(`$.actions[${actionIndex}].guard_commit.receipt_ids: must equal the commit-barrier receipts`);
        }
        if (!digestRefOrPlaceholder(commitProof.evidence_ref, allowPlaceholders)) {
          errors.push(`$.actions[${actionIndex}].guard_commit.evidence_ref: required digest-bound commit-tree proof`);
        }
      }
      if (action.status === "executed") executedCommits.push(action);
    }
    if (["git_integrate", "git_push"].includes(String(action.kind)) && action.status === "executed" && barrierState !== "crossed") {
      errors.push(`$.actions[${actionIndex}]: GUARD integration or push requires a crossed exact-tree commit barrier`);
    }
  }

  if (barrierState === "crossed") {
    if (!nonempty(barrier.crossed_action_id)) errors.push("$.guard.commit_barrier.crossed_action_id: crossed barrier requires the executed git_commit action id");
    const crossed = actionById.get(String(barrier.crossed_action_id));
    if (!crossed || crossed.kind !== "git_commit" || crossed.status !== "executed") {
      errors.push("$.guard.commit_barrier.crossed_action_id: must resolve to one executed git_commit action");
    }
    if (executedCommits.length !== 1 || executedCommits[0]?.id !== barrier.crossed_action_id) {
      errors.push("$.guard.commit_barrier.crossed_action_id: exactly one executed GUARD commit may cross the barrier");
    }
  } else {
    if (barrier.crossed_action_id !== null) errors.push("$.guard.commit_barrier.crossed_action_id: non-crossed barrier must be null");
    if (executedCommits.length > 0) errors.push("$.guard.commit_barrier.state: executed git_commit forbidden before the exact-tree barrier crosses");
  }
}

export function validateManifest(data: unknown, allowPlaceholders = false): string[] {
  const errors: string[] = []; const manifest = object(data);
  requireKeys(data, ["record_type", "schema_version", "execution_state", "repo", "mode", "request_ref", "authorization_basis", "policy_sources", "actions", "excluded_actions"], "$", errors);
  if (!manifest || errors.length > 0) return errors;
  if (manifest.record_type !== "mister-clean.action-manifest") errors.push("$.record_type: expected mister-clean.action-manifest"); if (!MANIFEST_SCHEMA_VERSIONS.has(String(manifest.schema_version))) errors.push("$.schema_version: expected 1.0, 1.1, or 1.2"); if (!EXECUTION_STATES.has(String(manifest.execution_state))) errors.push(`$.execution_state: unsupported value ${JSON.stringify(manifest.execution_state)}`); if (!["CLEAN", "CLOSE", "CONFORM", "GUARD"].includes(String(manifest.mode))) errors.push("$.mode: action manifest requires CLEAN, CLOSE, CONFORM, or GUARD"); const repo = object(manifest.repo) ?? {}; if (!allowPlaceholders) { if (!nonempty(repo.id)) errors.push("$.repo.id: required portable repository identity"); if (typeof repo.commit !== "string" || !/^[0-9a-f]{7,40}$/.test(repo.commit)) errors.push("$.repo.commit: required 7-40 char hex object id"); } if (!nonempty(manifest.request_ref)) errors.push("$.request_ref: required"); validateAuthorizationBasis(manifest.authorization_basis, "$.authorization_basis", errors); if (!Array.isArray(manifest.excluded_actions)) errors.push("$.excluded_actions: expected array");
  if (manifest.schema_version === "1.0" && manifest.legacy_schema_acknowledged !== true) {
    errors.push("$.legacy_schema_acknowledged: schema 1.0 omits coordination/CAS protections and requires explicit true acknowledgment");
  }
  const actions = array(manifest.actions); if (!actions) { errors.push("$.actions: expected array"); return errors; } const seen = new Set<string>();
  for (const [index, raw] of actions.entries()) { const path = `$.actions[${index}]`; const action = object(raw); requireKeys(raw, ["id", "kind", "target", "purpose", "risk", "authorization", "preconditions", "verification"], path, errors); if (!action) continue; if (!nonempty(action.id)) errors.push(`${path}.id: required`); else if (seen.has(action.id)) errors.push(`${path}.id: duplicate ${action.id}`); else seen.add(action.id); const kind = String(action.kind); if (PROHIBITED_KINDS.has(kind)) errors.push(`${path}: unrecoverable or prohibited action is outside Mister Clean`); else if (!ALLOWED_ACTION_KINDS.has(kind)) errors.push(`${path}.kind: unsupported action kind ${JSON.stringify(action.kind)}`); if (!nonempty(action.target)) errors.push(`${path}.target: required`); if (!nonempty(action.purpose)) errors.push(`${path}.purpose: required`); if (!RISKS.has(String(action.risk))) errors.push(`${path}.risk: unsupported value ${JSON.stringify(action.risk)}`); if (action.risk === "unrecoverable") errors.push(`${path}: unrecoverable or prohibited action is outside Mister Clean`); if (CONSEQUENT_ACTION_KINDS.has(kind) && action.risk !== "consequential_external") errors.push(`${path}.risk: ${kind} requires consequential_external`); if (!Array.isArray(action.preconditions)) errors.push(`${path}.preconditions: expected array`); if (!Array.isArray(action.verification)) errors.push(`${path}.verification: expected array`); const authorization = object(action.authorization); requireKeys(action.authorization, ["state", "source", "ref"], `${path}.authorization`, errors); if (!authorization) continue; if (!AUTH_STATES.has(String(authorization.state))) errors.push(`${path}.authorization.state: unsupported value ${JSON.stringify(authorization.state)}`); if (EXECUTION_STATES.has(String(manifest.execution_state)) && authorization.state !== "granted") errors.push(`${path}.authorization.state: ${manifest.execution_state} manifest requires granted`); if (CONSEQUENT_ACTION_KINDS.has(kind) || action.risk === "consequential_external") { if (authorization.state === "granted" && !STANDING_AUTH_SOURCES.has(String(authorization.source))) errors.push(`${path}.authorization.source: consequential action requires skill_invocation, explicit_user, or explicit_operator`); if (authorization.state === "granted" && !nonempty(authorization.ref)) errors.push(`${path}.authorization.ref: consequential action requires a reference`); if (!array(action.preconditions)?.length) errors.push(`${path}.preconditions: consequential action requires a bounded preflight`); if (!array(action.verification)?.length) errors.push(`${path}.verification: consequential action requires an exact postcondition`); } if (manifest.execution_state === "executed" && !array(action.verification)?.length) errors.push(`${path}.verification: executed action requires evidence`); if (manifest.execution_state === "executed") { const outcome = object(action.outcome); requireKeys(action.outcome, ["state", "evidence"], `${path}.outcome`, errors); if (outcome) { if (outcome.state !== "verified") errors.push(`${path}.outcome.state: executed action requires verified`); const typed = (array(outcome.evidence) ?? []).map(object).filter((entry): entry is ObjectRecord => !!entry); if (!typed.some(entry => ACTION_EVIDENCE_KINDS.has(String(entry.kind)) && ["object", "command", "result"].every(key => nonempty(entry[key])) && isoTimestamp(entry.observed_at) && digestRef(entry.evidence_ref))) errors.push(`${path}.outcome.evidence: executed action requires allowlisted, time-bound, digest-referenced execution evidence`); } } }
  const schemaVersion = String(manifest.schema_version);
  if (manifest.mode === "GUARD" && schemaVersion !== "1.2") {
    errors.push("$.schema_version: GUARD requires schema 1.2 exact-tree enforcement");
  }
  if (manifest.mode !== "GUARD" && manifest.guard !== undefined && manifest.guard !== null) {
    errors.push("$.guard: exact-tree guard record is valid only in GUARD mode");
  }
  const coordination = object(manifest.coordination);
  const coordinationDomains = schemaVersion === "1.2"
    ? validateCoordinationDomains(coordination, "$.coordination", errors, allowPlaceholders)
    : new Map<string, CoordinationDomainState>();
  if (schemaVersion === "1.1" || schemaVersion === "1.2") {
    const lanes = validateCoordination(coordination, "$.coordination", errors, allowPlaceholders, schemaVersion, coordinationDomains);
    const mutexPolicy = object(coordination?.integration_mutex);
    const maxLeaseSeconds = Number(mutexPolicy?.max_lease_seconds);
    const priorLeaseByResource = new Map<string, { readonly effectiveEnd: number; readonly fencingToken: number }>();
    const recordedOperations = new Map<string, ObjectRecord>();
    let expectedTargetCommit = object(coordination?.target)?.expected_commit;
    for (const [index, raw] of actions.entries()) {
      const path = `$.actions[${index}]`;
      const action = object(raw);
      if (!action) continue;
      requireKeys(action, [
        "lane_id", "task_id", "parent_operation_ids", "before_object", "after_object", "recorded_at",
      ], path, errors);
      const lane = lanes.get(String(action.lane_id));
      if (!lane) errors.push(`${path}.lane_id: must resolve to a coordination lane`);
      else if (action.task_id !== lane.task_id) errors.push(`${path}.task_id: must equal the lane task_id`);
      if (!nonempty(action.task_id)) errors.push(`${path}.task_id: required`);
      if (!nonempty(action.before_object)) errors.push(`${path}.before_object: required`);
      if ((manifest.execution_state === "executed" || action.status === "executed") && !nonempty(action.after_object)) {
        errors.push(`${path}.after_object: executed operation requires the resulting object`);
      }
      if (!(allowPlaceholders && findPlaceholders(action.recorded_at).length > 0) && !isoTimestamp(action.recorded_at)) {
        errors.push(`${path}.recorded_at: required ISO timestamp`);
      }
      const parents = array(action.parent_operation_ids);
      const parentOperations: ObjectRecord[] = [];
      if (!parents) errors.push(`${path}.parent_operation_ids: expected array`);
      else for (const [parentIndex, parent] of parents.entries()) {
        if (!nonempty(parent)) errors.push(`${path}.parent_operation_ids[${parentIndex}]: required nonempty operation id`);
        else {
          const parentOperation = recordedOperations.get(parent);
          if (!parentOperation) errors.push(`${path}.parent_operation_ids[${parentIndex}]: parent must precede child in the append-only log`);
          else parentOperations.push(parentOperation);
        }
      }
      if (nonempty(action.id)) recordedOperations.set(action.id, action);

      if (LOCAL_MUTATION_KINDS.has(String(action.kind))) {
        if (lane?.role !== "writer" && lane?.role !== "integrator") {
          errors.push(`${path}.lane_id: ${action.kind} requires a modifying lane`);
        }
        if (nonempty(action.target) && lane && !targetWithinWritePaths(action.target, array(lane.write_paths) ?? [])) {
          errors.push(`${path}.target: must be contained by the lane write_paths`);
        }
      }
      if (action.kind === "planning_record_update") {
        validatePlanningProjectionTransaction(action, lane, path, errors, allowPlaceholders);
      }

      if (action.kind === "agent_dispatch" && lane) {
        if (!array(lane.invariants)?.length || !array(lane.acceptance)?.length) {
          errors.push(`${path}: dispatched lane requires explicit invariants and acceptance boundary`);
        }
      }
      if (action.kind === "git_integrate") {
        if (lane?.role !== "integrator") errors.push(`${path}.lane_id: git_integrate requires the integrator lane`);
        requireKeys(action.cas, [
          "compare_and_swap", "target_ref", "expected_target_commit", "observed_target_commit",
          "candidate_commit", "result", "result_commit", "mutex",
        ], `${path}.cas`, errors);
        const cas = object(action.cas);
        if (cas) {
          if (cas.compare_and_swap !== true) errors.push(`${path}.cas.compare_and_swap: expected true`);
          if (!nonempty(cas.target_ref)) errors.push(`${path}.cas.target_ref: required`);
          const coordinationTarget = object(coordination?.target);
          if (coordinationTarget && cas.target_ref !== coordinationTarget.ref) {
            errors.push(`${path}.cas.target_ref: must equal coordination.target.ref`);
          }
          if (commitObject(expectedTargetCommit, allowPlaceholders) && cas.expected_target_commit !== expectedTargetCommit) {
            errors.push(`${path}.cas.expected_target_commit: must equal the current operation-log target object`);
          }
          if (cas.expected_target_commit !== action.before_object) {
            errors.push(`${path}.before_object: git_integrate must equal cas.expected_target_commit`);
          }
          for (const field of ["expected_target_commit", "observed_target_commit", "candidate_commit"] as const) {
            if (!commitObject(cas[field], allowPlaceholders)) errors.push(`${path}.cas.${field}: required 7-40 char hex object id`);
          }
          if (!CAS_RESULTS.has(String(cas.result))) errors.push(`${path}.cas.result: unsupported ${JSON.stringify(cas.result)}`);
          if (cas.result === "applied") {
            if (action.status !== "executed") errors.push(`${path}.status: applied integration requires executed`);
            if (cas.expected_target_commit !== cas.observed_target_commit) {
              errors.push(`${path}.cas: applied integration requires observed target to equal expected target`);
            }
            if (!commitObject(cas.result_commit, allowPlaceholders)) {
              errors.push(`${path}.cas.result_commit: applied integration requires resulting commit`);
            }
            if (cas.result_commit !== action.after_object) {
              errors.push(`${path}.after_object: applied integration must equal cas.result_commit`);
            }
            expectedTargetCommit = cas.result_commit;
          }
          if (cas.result === "rejected_target_moved" && cas.expected_target_commit === cas.observed_target_commit) {
            errors.push(`${path}.cas: rejected_target_moved requires a changed target object`);
          }
          requireKeys(cas.mutex, [
            "resource", "holder_lane_id", "lease_id", "fencing_token",
            "acquired_at", "mutation_observed_at", "expires_at", "released_at",
          ], `${path}.cas.mutex`, errors);
          const mutex = object(cas.mutex);
          if (mutex) {
            if (!nonempty(mutex.resource) || mutex.resource !== cas.target_ref) {
              errors.push(`${path}.cas.mutex.resource: must equal the CAS target_ref`);
            }
            if (!nonempty(mutex.holder_lane_id) || mutex.holder_lane_id !== action.lane_id) {
              errors.push(`${path}.cas.mutex.holder_lane_id: must equal the integrator lane_id`);
            }
            if (!nonempty(mutex.lease_id)) errors.push(`${path}.cas.mutex.lease_id: required`);
            if (!Number.isInteger(mutex.fencing_token) || Number(mutex.fencing_token) < 1) {
              errors.push(`${path}.cas.mutex.fencing_token: required positive integer`);
            }
            const timestampFields = ["acquired_at", "mutation_observed_at", "expires_at", "released_at"] as const;
            for (const field of timestampFields) {
              if (!(allowPlaceholders && findPlaceholders(mutex[field]).length > 0) && !isoTimestamp(mutex[field])) {
                errors.push(`${path}.cas.mutex.${field}: required ISO timestamp`);
              }
            }
            if (timestampFields.every((field) => isoTimestamp(mutex[field]))) {
              const acquired = Date.parse(String(mutex.acquired_at));
              const mutation = Date.parse(String(mutex.mutation_observed_at));
              const expires = Date.parse(String(mutex.expires_at));
              const released = Date.parse(String(mutex.released_at));
              if (!(acquired <= mutation && mutation <= expires)) {
                errors.push(`${path}.cas.mutex: CAS observation must occur inside the live lease`);
              }
              if (released < mutation) {
                errors.push(`${path}.cas.mutex.released_at: release cannot precede the CAS observation`);
              }
              if (Number.isInteger(maxLeaseSeconds) && (expires - acquired) / 1000 > maxLeaseSeconds) {
                errors.push(`${path}.cas.mutex: lease exceeds coordination max_lease_seconds`);
              }
              const resource = String(mutex.resource);
              const fencingToken = Number(mutex.fencing_token);
              const effectiveEnd = Math.min(expires, released);
              const prior = priorLeaseByResource.get(resource);
              if (prior && acquired < prior.effectiveEnd) {
                errors.push(`${path}.cas.mutex: integration lease overlaps a prior lease for ${JSON.stringify(resource)}`);
              }
              if (prior && fencingToken <= prior.fencingToken) {
                errors.push(`${path}.cas.mutex.fencing_token: must increase monotonically for ${JSON.stringify(resource)}`);
              }
              if (nonempty(mutex.resource) && Number.isInteger(mutex.fencing_token)) {
                priorLeaseByResource.set(resource, { effectiveEnd, fencingToken });
              }
            }
          }
        }
        if (schemaVersion === "1.2") {
          validateCoordinationCas(action, lanes, coordinationDomains, path, errors, allowPlaceholders);
        }
      }
      if (action.kind === "git_push") {
        validatePushGate(action, lane, coordination, repo, parentOperations, path, errors, allowPlaceholders);
      }
    }
    if (manifest.mode === "GUARD" && schemaVersion === "1.2") {
      validateGuard(manifest, actions, lanes, errors, allowPlaceholders);
    }
  }
  if (!allowPlaceholders) for (const path of findPlaceholders(data)) errors.push(`${path}: unresolved template placeholder`);
  if (!Array.isArray(manifest.policy_sources)) errors.push("$.policy_sources: expected list"); if (!Array.isArray(manifest.excluded_actions)) errors.push("$.excluded_actions: expected list"); if (!allowPlaceholders) { if (!nonempty(manifest.request_ref)) errors.push("$.request_ref: required nonempty"); const basis = object(manifest.authorization_basis); if (basis?.source === "skill_invocation" && !nonempty(basis.ref)) errors.push("$.authorization_basis.ref: required nonempty for skill_invocation"); }
  const state = manifest.execution_state; if (state === "executed" && actions.length === 0) errors.push("$.execution_state: executed with zero actions is not an execution record"); const destructive = new Set(["stash_drop", "recoverable_delete", "branch_delete_local", "branch_delete_remote", "worktree_remove", "process_signal", "git_push"]); const local = new Set(["local_edit", "local_move", "recoverable_delete", "doc_update", "planning_record_update", "historical_conform", "handoff_update"]);
  for (const [index, raw] of actions.entries()) { const action = object(raw); if (!action) continue; const path = `$.actions[${index}]`; if (action.status !== undefined && !["planned", "executed", "failed", "blocked", "skipped"].includes(String(action.status))) errors.push(`${path}.status: unsupported ${JSON.stringify(action.status)}`); if ((state === "executed" || action.status === "executed") && !array(action.verification)?.some(meaningful)) errors.push(`${path}.verification: executed action requires meaningful evidence (not empty/null placeholders)`); if (!allowPlaceholders) { const target = action.target; if (local.has(String(action.kind)) && typeof target === "string") { const normalized = pathPosix.normalize(target.replaceAll("\\", "/")); if (pathPosix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../") || normalized === ".git" || normalized.startsWith(".git/")) errors.push(`${path}.target: local mutation target must be repository-relative, non-traversing, and outside .git (got ${JSON.stringify(target)})`); } if (action.kind === "agent_dispatch" && !["in_session_subagent", "external_orchestrated_agent"].includes(String(action.mechanism))) errors.push(`${path}.mechanism: agent_dispatch requires in_session_subagent|external_orchestrated_agent (human/paid external dispatch is prohibited external_dispatch)`); const basis = object(manifest.authorization_basis); const authorization = object(action.authorization); if (authorization?.source === "skill_invocation" && authorization.ref !== basis?.ref) errors.push(`${path}.authorization.ref: must correlate with authorization_basis.ref for skill_invocation actions`); } if (destructive.has(String(action.kind))) { if (!array(action.preconditions)?.some(meaningful)) errors.push(`${path}.preconditions: ${action.kind} requires meaningful preflight facts`); if (!array(action.verification)?.some(meaningful)) errors.push(`${path}.verification: ${action.kind} requires recovery/postcondition proof`); } }
  return errors;
}

export const validateReportRecord = validateReport;
export const validateManifestRecord = validateManifest;
