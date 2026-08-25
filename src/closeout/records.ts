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
export const MODES = new Set(["AUDIT", "CLEAN", "CLOSE", "CONFORM"]);
export const EXECUTION_STATES = new Set(["authorized", "executed"]);
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
  requireKeys(data, ["record_type", "schema_version", "generated_at", "repo", "target_binding", "mode", "authorization_basis", "scope", "dimensions", "completion_debts", "claims", "actions", "residuals", "handoff_assessment", "verdict"], "$", errors);
  if (!report || errors.length > 0) return errors.map(error => error.startsWith("$.") ? error : error.replace("$.", "$."));
  if (report.record_type !== "mister-clean.closeout") errors.push("$.record_type: expected mister-clean.closeout");
  if (report.schema_version !== "1.1") errors.push("$.schema_version: expected 1.1");
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

export function validateManifest(data: unknown, allowPlaceholders = false): string[] {
  const errors: string[] = []; const manifest = object(data);
  requireKeys(data, ["record_type", "schema_version", "execution_state", "repo", "mode", "request_ref", "authorization_basis", "policy_sources", "actions", "excluded_actions"], "$", errors);
  if (!manifest || errors.length > 0) return errors;
  if (manifest.record_type !== "mister-clean.action-manifest") errors.push("$.record_type: expected mister-clean.action-manifest"); if (manifest.schema_version !== "1.0") errors.push("$.schema_version: expected 1.0"); if (!EXECUTION_STATES.has(String(manifest.execution_state))) errors.push(`$.execution_state: unsupported value ${JSON.stringify(manifest.execution_state)}`); if (!["CLEAN", "CLOSE", "CONFORM"].includes(String(manifest.mode))) errors.push("$.mode: action manifest requires CLEAN, CLOSE, or CONFORM"); const repo = object(manifest.repo) ?? {}; if (!allowPlaceholders) { if (!nonempty(repo.id)) errors.push("$.repo.id: required portable repository identity"); if (typeof repo.commit !== "string" || !/^[0-9a-f]{7,40}$/.test(repo.commit)) errors.push("$.repo.commit: required 7-40 char hex object id"); } if (!nonempty(manifest.request_ref)) errors.push("$.request_ref: required"); validateAuthorizationBasis(manifest.authorization_basis, "$.authorization_basis", errors); if (!Array.isArray(manifest.excluded_actions)) errors.push("$.excluded_actions: expected array");
  const actions = array(manifest.actions); if (!actions) { errors.push("$.actions: expected array"); return errors; } const seen = new Set<string>();
  for (const [index, raw] of actions.entries()) { const path = `$.actions[${index}]`; const action = object(raw); requireKeys(raw, ["id", "kind", "target", "purpose", "risk", "authorization", "preconditions", "verification"], path, errors); if (!action) continue; if (!nonempty(action.id)) errors.push(`${path}.id: required`); else if (seen.has(action.id)) errors.push(`${path}.id: duplicate ${action.id}`); else seen.add(action.id); const kind = String(action.kind); if (PROHIBITED_KINDS.has(kind)) errors.push(`${path}: unrecoverable or prohibited action is outside Mister Clean`); else if (!ALLOWED_ACTION_KINDS.has(kind)) errors.push(`${path}.kind: unsupported action kind ${JSON.stringify(action.kind)}`); if (!nonempty(action.target)) errors.push(`${path}.target: required`); if (!nonempty(action.purpose)) errors.push(`${path}.purpose: required`); if (!RISKS.has(String(action.risk))) errors.push(`${path}.risk: unsupported value ${JSON.stringify(action.risk)}`); if (action.risk === "unrecoverable") errors.push(`${path}: unrecoverable or prohibited action is outside Mister Clean`); if (CONSEQUENT_ACTION_KINDS.has(kind) && action.risk !== "consequential_external") errors.push(`${path}.risk: ${kind} requires consequential_external`); if (!Array.isArray(action.preconditions)) errors.push(`${path}.preconditions: expected array`); if (!Array.isArray(action.verification)) errors.push(`${path}.verification: expected array`); const authorization = object(action.authorization); requireKeys(action.authorization, ["state", "source", "ref"], `${path}.authorization`, errors); if (!authorization) continue; if (!AUTH_STATES.has(String(authorization.state))) errors.push(`${path}.authorization.state: unsupported value ${JSON.stringify(authorization.state)}`); if (EXECUTION_STATES.has(String(manifest.execution_state)) && authorization.state !== "granted") errors.push(`${path}.authorization.state: ${manifest.execution_state} manifest requires granted`); if (CONSEQUENT_ACTION_KINDS.has(kind) || action.risk === "consequential_external") { if (authorization.state === "granted" && !STANDING_AUTH_SOURCES.has(String(authorization.source))) errors.push(`${path}.authorization.source: consequential action requires skill_invocation, explicit_user, or explicit_operator`); if (authorization.state === "granted" && !nonempty(authorization.ref)) errors.push(`${path}.authorization.ref: consequential action requires a reference`); if (!array(action.preconditions)?.length) errors.push(`${path}.preconditions: consequential action requires a bounded preflight`); if (!array(action.verification)?.length) errors.push(`${path}.verification: consequential action requires an exact postcondition`); } if (manifest.execution_state === "executed" && !array(action.verification)?.length) errors.push(`${path}.verification: executed action requires evidence`); if (manifest.execution_state === "executed") { const outcome = object(action.outcome); requireKeys(action.outcome, ["state", "evidence"], `${path}.outcome`, errors); if (outcome) { if (outcome.state !== "verified") errors.push(`${path}.outcome.state: executed action requires verified`); const typed = (array(outcome.evidence) ?? []).map(object).filter((entry): entry is ObjectRecord => !!entry); if (!typed.some(entry => ACTION_EVIDENCE_KINDS.has(String(entry.kind)) && ["object", "command", "result"].every(key => nonempty(entry[key])) && isoTimestamp(entry.observed_at) && digestRef(entry.evidence_ref))) errors.push(`${path}.outcome.evidence: executed action requires allowlisted, time-bound, digest-referenced execution evidence`); } } }
  if (!allowPlaceholders) for (const path of findPlaceholders(data)) errors.push(`${path}: unresolved template placeholder`);
  if (!Array.isArray(manifest.policy_sources)) errors.push("$.policy_sources: expected list"); if (!Array.isArray(manifest.excluded_actions)) errors.push("$.excluded_actions: expected list"); if (!allowPlaceholders) { if (!nonempty(manifest.request_ref)) errors.push("$.request_ref: required nonempty"); const basis = object(manifest.authorization_basis); if (basis?.source === "skill_invocation" && !nonempty(basis.ref)) errors.push("$.authorization_basis.ref: required nonempty for skill_invocation"); }
  const state = manifest.execution_state; if (state === "executed" && actions.length === 0) errors.push("$.execution_state: executed with zero actions is not an execution record"); const destructive = new Set(["stash_drop", "recoverable_delete", "branch_delete_local", "branch_delete_remote", "worktree_remove", "process_signal", "git_push"]); const local = new Set(["local_edit", "local_move", "recoverable_delete", "doc_update", "planning_record_update", "historical_conform", "handoff_update"]);
  for (const [index, raw] of actions.entries()) { const action = object(raw); if (!action) continue; const path = `$.actions[${index}]`; if (action.status !== undefined && !["planned", "executed", "failed", "blocked", "skipped"].includes(String(action.status))) errors.push(`${path}.status: unsupported ${JSON.stringify(action.status)}`); if ((state === "executed" || action.status === "executed") && !array(action.verification)?.some(meaningful)) errors.push(`${path}.verification: executed action requires meaningful evidence (not empty/null placeholders)`); if (!allowPlaceholders) { const target = action.target; if (local.has(String(action.kind)) && typeof target === "string") { const normalized = pathPosix.normalize(target.replaceAll("\\", "/")); if (pathPosix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../") || normalized === ".git" || normalized.startsWith(".git/")) errors.push(`${path}.target: local mutation target must be repository-relative, non-traversing, and outside .git (got ${JSON.stringify(target)})`); } if (action.kind === "agent_dispatch" && !["in_session_subagent", "external_orchestrated_agent"].includes(String(action.mechanism))) errors.push(`${path}.mechanism: agent_dispatch requires in_session_subagent|external_orchestrated_agent (human/paid external dispatch is prohibited external_dispatch)`); const basis = object(manifest.authorization_basis); const authorization = object(action.authorization); if (authorization?.source === "skill_invocation" && authorization.ref !== basis?.ref) errors.push(`${path}.authorization.ref: must correlate with authorization_basis.ref for skill_invocation actions`); } if (destructive.has(String(action.kind))) { if (!array(action.preconditions)?.some(meaningful)) errors.push(`${path}.preconditions: ${action.kind} requires meaningful preflight facts`); if (!array(action.verification)?.some(meaningful)) errors.push(`${path}.verification: ${action.kind} requires recovery/postcondition proof`); } }
  return errors;
}

export const validateReportRecord = validateReport;
export const validateManifestRecord = validateManifest;
