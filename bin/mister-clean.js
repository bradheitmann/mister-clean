#!/usr/bin/env node

// src/cli.ts
import { existsSync as existsSync3, readFileSync as readFileSync4, realpathSync as realpathSync2, statSync as statSync2, writeFileSync as writeFileSync3 } from "fs";
import { join as join3, relative as relative6, resolve as resolve6, sep as sep6 } from "path";
import { fileURLToPath as fileURLToPath2, pathToFileURL } from "url";

// src/closeout/bundle.ts
import { createHash as createHash2 } from "crypto";
import { execFile } from "child_process";
import { access, lstat, readFile, readdir, realpath } from "fs/promises";
import { basename as basename3, dirname as dirname2, isAbsolute as isAbsolute2, relative as relative3, resolve as resolve3, sep as sep3 } from "path";
import { promisify } from "util";

// src/closeout/records.ts
import { posix as pathPosix } from "path";

// src/closeout/normalization.ts
function foldCase(value) {
  let folded = value.normalize("NFKC");
  for (; ; ) {
    const next = folded.toLocaleUpperCase("und").toLocaleLowerCase("und");
    if (next === folded) return next;
    folded = next;
  }
}
function canonicalIdentity(value) {
  if (value === void 0 || value === null) return "";
  return foldCase(String(value).trim().split(/\s+/u).join(" "));
}

// src/closeout/records.ts
var DIMENSION_STATES = /* @__PURE__ */ new Set(["satisfied", "open", "blocked", "not_assessed", "not_applicable"]);
var CLAIM_STATES = /* @__PURE__ */ new Set(["established", "not_established", "not_assessed", "not_applicable"]);
var DEBT_STATES = /* @__PURE__ */ new Set(["satisfied", "accepted_exception", "open", "blocked", "deferred", "not_assessed"]);
var RECOMMENDATIONS = /* @__PURE__ */ new Set(["proceed", "proceed_with_conditions", "do_not_proceed", "not_assessed"]);
var MODES = /* @__PURE__ */ new Set(["AUDIT", "CLEAN", "CLOSE", "CONFORM"]);
var EXECUTION_STATES = /* @__PURE__ */ new Set(["authorized", "executed"]);
var RISKS = /* @__PURE__ */ new Set(["reversible_local", "consequential_external", "unrecoverable"]);
var AUTH_STATES = /* @__PURE__ */ new Set(["granted"]);
var STANDING_AUTH_SOURCES = /* @__PURE__ */ new Set(["skill_invocation", "explicit_user", "explicit_operator"]);
var CONSEQUENT_ACTION_KINDS = /* @__PURE__ */ new Set([
  "git_push",
  "branch_delete_local",
  "branch_delete_remote",
  "worktree_remove",
  "process_signal",
  "tracker_write"
]);
var PROHIBITED_KINDS = /* @__PURE__ */ new Set([
  "history_rewrite",
  "force_push",
  "secret_destroy",
  "production_deploy",
  "production_mutation",
  "external_dispatch"
]);
var ALLOWED_ACTION_KINDS = /* @__PURE__ */ new Set([
  "agent_dispatch",
  "acceptance_execute",
  "local_edit",
  "local_move",
  "recoverable_delete",
  "format",
  "lint",
  "test",
  "build",
  "generate",
  "doc_update",
  "planning_record_update",
  "git_commit",
  "git_push",
  "stash_preserve",
  "stash_drop",
  "branch_delete_local",
  "branch_delete_remote",
  "worktree_remove",
  "process_signal",
  "tracker_write",
  "historical_conform",
  "handoff_update"
]);
var ACTION_EVIDENCE_KINDS = /* @__PURE__ */ new Set([
  "git_change",
  "validation_result",
  "remote_ref_resolution",
  "process_observation",
  "tracker_receipt",
  "independent_qa_verdict"
]);
var DEBT_EVIDENCE_KINDS = /* @__PURE__ */ new Set(["acceptance_execution", "gate_result", "historical_record"]);
var DISPOSITIONS = /* @__PURE__ */ new Set(["autonomously_repair", "autonomously_validate", "accepted_exception", "decision_or_coordination_required"]);
var VERDICTS = /* @__PURE__ */ new Set(["CLEAN", "NOT_CLEAN"]);
var OPEN_DEBT_STATES = /* @__PURE__ */ new Set(["open", "blocked", "not_assessed"]);
var STALE_DOC_CLASSES = /* @__PURE__ */ new Set(["stale_doc", "stale_comment", "stale_documentation", "doc_drift"]);
var OPERATOR_ACTORS = /* @__PURE__ */ new Set(["operator", "principal"]);
var GENERIC_FILLER = /* @__PURE__ */ new Set(["measured", "fixture-value", "n/a", "na", "done", "ok", "verified", "pass", "true", "yes", "-", "tbd", "todo", "checked", "clean", "good"]);
var REQUIRED_DIMENSIONS = ["completion_debt", "repository_state", "planning_integrity", "verification", "handoff_readiness"];
var REQUIRED_CLAIMS = ["committed_locally", "pushed", "ci_green_on_push", "deployed", "independently_qa_accepted"];
var DIMENSION_EVIDENCE_KINDS = {
  completion_debt: /* @__PURE__ */ new Set(["debt_census", "acceptance_execution"]),
  repository_state: /* @__PURE__ */ new Set(["git_topology"]),
  planning_integrity: /* @__PURE__ */ new Set(["planning_census"]),
  verification: /* @__PURE__ */ new Set(["validation_summary"]),
  handoff_readiness: /* @__PURE__ */ new Set(["successor_readiness"])
};
var PLACEHOLDER = /<[^<>]+>/;
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function array(value) {
  return Array.isArray(value) ? value : void 0;
}
function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isoTimestamp(value) {
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
function digestRef(value) {
  const ref = object(value);
  return !!ref && nonempty(ref.path) && typeof ref.sha256 === "string" && /^[0-9a-f]{64}$/.test(ref.sha256);
}
function requireKeys(value, keys, path, errors) {
  const record = object(value);
  if (!record) {
    errors.push(`${path}: expected object`);
    return;
  }
  for (const key of [...keys].sort()) if (!(key in record)) errors.push(`${path}.${key}: missing`);
}
function findPlaceholders(value, path = "$") {
  if (typeof value === "string") return PLACEHOLDER.test(value) ? [path] : [];
  const record = object(value);
  if (record) return Object.entries(record).flatMap(([key, item]) => findPlaceholders(item, `${path}.${key}`));
  const items = array(value);
  return items ? items.flatMap((item, index) => findPlaceholders(item, `${path}[${index}]`)) : [];
}
function meaningful(value) {
  if (typeof value === "string") return value.trim().length > 0;
  const record = object(value);
  if (record) return Object.values(record).some(meaningful);
  const items = array(value);
  if (items) return items.some(meaningful);
  return value !== null && value !== void 0;
}
function generic(value) {
  if (typeof value === "string") return GENERIC_FILLER.has(foldCase(value.trim())) || value.trim().length < 3;
  const items = array(value);
  if (items) return items.length === 0 || items.every(generic);
  const record = object(value);
  if (record) return !Object.values(record).some(meaningful);
  return false;
}
function normalizeActor(value) {
  return canonicalIdentity(value);
}
function criterionWaived(criterion) {
  const waiver = object(criterion.waiver);
  if (!waiver || !nonempty(waiver.actor) || !nonempty(waiver.ref)) return false;
  return !OPERATOR_ACTORS.has(String(criterion.source)) || OPERATOR_ACTORS.has(normalizeActor(waiver.actor));
}
function validateAuthorizationBasis(value, path, errors) {
  requireKeys(value, ["source", "ref", "scope", "standing"], path, errors);
  const basis = object(value);
  if (!basis) return;
  if (!STANDING_AUTH_SOURCES.has(String(basis.source))) errors.push(`${path}.source: expected skill_invocation, explicit_user, or explicit_operator`);
  if (!nonempty(basis.ref)) errors.push(`${path}.ref: required`);
  if (basis.scope !== "named_repository_and_current_task") errors.push(`${path}.scope: expected named_repository_and_current_task`);
  if (basis.standing !== true) errors.push(`${path}.standing: expected true`);
}
function validateEstablishedClaim(name, evidence, errors) {
  const objects = evidence.map(object).filter((entry) => !!entry);
  const required = {
    committed_locally: ["kind", "commit"],
    pushed: ["kind", "remote", "ref", "commit", "observed_at"],
    ci_green_on_push: ["kind", "provider", "run_id", "commit", "conclusion"],
    deployed: ["kind", "environment", "deployment_ref", "observed_state", "observed_at"],
    independently_qa_accepted: ["kind", "verdict_ref", "reviewer", "implementer", "conclusion"]
  };
  const fields = required[name] ?? [];
  if (!objects.some((item) => fields.every((field) => nonempty(item[field])))) {
    errors.push(`$.claims.${name}: evidence must include one object with ${[...fields].sort().join(", ")}`);
  }
  if (name === "ci_green_on_push" && !objects.some((item) => item.conclusion === "success")) errors.push("$.claims.ci_green_on_push: established requires conclusion=success");
  if (name === "ci_green_on_push" && !objects.some((item) => item.kind === "established_ci")) errors.push("$.claims.ci_green_on_push: established requires kind=established_ci");
  const expectedKind = { committed_locally: "git_commit", pushed: "remote_ref_resolution", deployed: "observed_deployment", independently_qa_accepted: "independent_qa_verdict" };
  if (expectedKind[name] && !objects.some((item) => item.kind === expectedKind[name])) errors.push(`$.claims.${name}: established requires kind=${expectedKind[name]}`);
  if (name === "deployed" && !objects.some((item) => item.observed_state === "active")) errors.push("$.claims.deployed: established requires observed_state=active");
  if (name === "independently_qa_accepted" && !objects.some((item) => item.kind === "independent_qa_verdict" && item.conclusion === "accepted" && nonempty(item.reviewer) && nonempty(item.implementer) && item.reviewer !== item.implementer)) {
    errors.push("$.claims.independently_qa_accepted: established requires accepted verdict and distinct reviewer/implementer");
  }
}
function validateReport(data, allowPlaceholders = false, bundleContext = false) {
  const errors = [];
  const report = object(data);
  requireKeys(data, ["record_type", "schema_version", "generated_at", "repo", "target_binding", "mode", "authorization_basis", "scope", "dimensions", "completion_debts", "claims", "actions", "residuals", "handoff_assessment", "verdict"], "$", errors);
  if (!report || errors.length > 0) return errors.map((error) => error.startsWith("$.") ? error : error.replace("$.", "$."));
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
    const path = `$.completion_debts[${index}]`;
    const debt = object(raw);
    requireKeys(raw, ["id", "procedure", "state", "evidence"], path, errors);
    if (!debt) continue;
    if (!DEBT_STATES.has(String(debt.state))) errors.push(`${path}.state: unsupported value ${JSON.stringify(debt.state)}`);
    if (debt.state === "blocked") {
      requireKeys(debt, ["blocker", "next_owner", "next_action"], path, errors);
      if (!array(debt.evidence)?.length) errors.push(`${path}.evidence: blocked debt requires evidence`);
      for (const field of ["blocker", "next_owner", "next_action"]) if (!nonempty(debt[field])) errors.push(`${path}.${field}: required for blocked debt`);
    }
    if (debt.state === "deferred") {
      const ruling = object(debt.ruling);
      requireKeys(ruling, ["actor", "date", "reason", "ref", "next_owner"], `${path}.ruling`, errors);
      if (ruling) {
        for (const field of ["actor", "date", "reason", "ref", "next_owner"]) if (!nonempty(ruling[field])) errors.push(`${path}.ruling.${field}: required for deferred debt`);
      }
    }
  }
  const claims = object(report.claims);
  requireKeys(report.claims, REQUIRED_CLAIMS, "$.claims", errors);
  if (claims) for (const name of REQUIRED_CLAIMS) {
    if (!(name in claims)) continue;
    const item = object(claims[name]);
    requireKeys(claims[name], ["state", "evidence"], `$.claims.${name}`, errors);
    if (!item) continue;
    if (!CLAIM_STATES.has(String(item.state))) errors.push(`$.claims.${name}.state: unsupported value ${JSON.stringify(item.state)}`);
    if (!Array.isArray(item.evidence)) errors.push(`$.claims.${name}.evidence: expected array`);
    else {
      if (item.state === "established" && item.evidence.length === 0) errors.push(`$.claims.${name}: established requires evidence`);
      if (item.state === "established") validateEstablishedClaim(name, item.evidence, errors);
    }
  }
  const assessment = object(report.handoff_assessment);
  requireKeys(report.handoff_assessment, ["recommendation", "reasons", "conditions"], "$.handoff_assessment", errors);
  const recommendation = assessment?.recommendation;
  if (!RECOMMENDATIONS.has(String(recommendation))) errors.push(`$.handoff_assessment.recommendation: unsupported value ${JSON.stringify(recommendation)}`);
  if (assessment) {
    if (["proceed", "proceed_with_conditions", "do_not_proceed"].includes(String(recommendation)) && !array(assessment.reasons)?.length) errors.push("$.handoff_assessment.reasons: recommendation requires reasons");
    if (recommendation === "proceed_with_conditions" && !array(assessment.conditions)?.length) errors.push("$.handoff_assessment.conditions: conditional recommendation requires conditions");
  }
  const debtStates = new Set(debts.map((debt) => object(debt)?.state));
  if (recommendation === "proceed" && ["open", "blocked", "deferred", "not_assessed"].some((state) => debtStates.has(state))) errors.push("$.handoff_assessment: unconditional proceed conflicts with unresolved or deferred completion debt");
  if (recommendation === "proceed" && dimensions) {
    const unresolved = REQUIRED_DIMENSIONS.filter((name) => ["open", "blocked", "not_assessed"].includes(String(object(dimensions[name])?.state)));
    if (unresolved.length) errors.push(`$.handoff_assessment: unconditional proceed conflicts with unresolved dimensions: ${unresolved.sort().join(", ")}`);
  }
  const verdict = report.verdict;
  if (!VERDICTS.has(String(verdict))) errors.push(`$.verdict: required, CLEAN or NOT_CLEAN (got ${JSON.stringify(verdict)})`);
  if (verdict === "CLEAN" && !bundleContext) errors.push("$.verdict: CLEAN requires validation through a live-bound mister-clean.closure-bundle; a standalone report is structural evidence only");
  const seenIds = /* @__PURE__ */ new Set();
  const decisionRows = [];
  for (const [index, raw] of debts.entries()) {
    const path = `$.completion_debts[${index}]`;
    const debt = object(raw);
    if (!debt) {
      errors.push(`${path}: expected object`);
      continue;
    }
    if (!nonempty(debt.id)) errors.push(`${path}.id: required nonempty`);
    else if (seenIds.has(debt.id)) errors.push(`${path}.id: duplicate ${JSON.stringify(debt.id)}`);
    else seenIds.add(debt.id);
    if (!nonempty(debt.procedure)) errors.push(`${path}.procedure: required nonempty`);
    const disposition = debt.disposition;
    if (disposition === void 0) errors.push(`${path}.disposition: required (one of ${[...DISPOSITIONS].sort().join(", ")})`);
    else if (!DISPOSITIONS.has(String(disposition))) errors.push(`${path}.disposition: unsupported ${JSON.stringify(disposition)}`);
    if (disposition === "accepted_exception") {
      if (debt.state !== "accepted_exception") errors.push(`${path}: accepted_exception disposition requires state=accepted_exception (one row, one terminal bucket)`);
      const exception = object(debt.exception);
      requireKeys(exception, ["actor", "at", "ref", "scope", "rationale"], `${path}.exception`, errors);
      if (exception) {
        for (const key of ["actor", "scope", "rationale"]) if (!nonempty(exception[key])) errors.push(`${path}.exception.${key}: required for accepted_exception`);
        if (!isoTimestamp(exception.at)) errors.push(`${path}.exception.at: required timezone-aware ISO-8601 timestamp`);
        if (!digestRef(exception.ref)) errors.push(`${path}.exception.ref: required digest-bound evidence reference {path,sha256}`);
      }
    } else if (debt.state === "accepted_exception") errors.push(`${path}.disposition: state=accepted_exception requires disposition=accepted_exception`);
    if (STALE_DOC_CLASSES.has(String(debt.class)) && disposition === "accepted_exception") errors.push(`${path}.disposition: a reviewer-reported stale doc/comment is PAYABLE regardless of severity label -- accepted_exception is for irreparable historical limits only; fix the doc before CLEAN`);
    if (disposition === "decision_or_coordination_required") decisionRows.push(nonempty(debt.id) ? debt.id : `#${index}`);
    if (debt.state === "satisfied") {
      const typed = (array(debt.evidence) ?? []).map(object).filter((entry) => !!entry);
      const valid = typed.some((entry) => DEBT_EVIDENCE_KINDS.has(String(entry.kind)) && ["object", "command", "result"].every((key) => nonempty(entry[key])) && isoTimestamp(entry.observed_at) && digestRef(entry.evidence_ref));
      if (!valid) errors.push(`${path}.evidence: satisfied debt requires allowlisted, time-bound, digest-referenced execution evidence`);
    }
  }
  const residuals = array(report.residuals) ?? [];
  for (const [index, raw] of residuals.entries()) {
    const path = `$.residuals[${index}]`;
    const residual = object(raw);
    if (!residual) {
      errors.push(`${path}: expected object with kind (roadmap|accepted_exception|blocked)`);
      continue;
    }
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
  for (const [index, raw] of (array(report.acceptance_criteria) ?? []).entries()) {
    const path = `$.acceptance_criteria[${index}]`;
    const criterion = object(raw);
    if (!criterion) {
      errors.push(`${path}: expected object`);
      continue;
    }
    if (!nonempty(criterion.id)) errors.push(`${path}.id: required`);
    if (typeof criterion.met !== "boolean") errors.push(`${path}.met: required boolean`);
    if (!nonempty(criterion.source)) errors.push(`${path}.source: required (who set the criterion, e.g. operator)`);
    if (criterion.waiver !== void 0 && (!object(criterion.waiver) || !nonempty(object(criterion.waiver)?.actor) || !nonempty(object(criterion.waiver)?.ref))) errors.push(`${path}.waiver: requires actor AND ref`);
    else if (object(criterion.waiver) && OPERATOR_ACTORS.has(String(criterion.source)) && !OPERATOR_ACTORS.has(normalizeActor(object(criterion.waiver)?.actor))) errors.push(`${path}.waiver: an operator-source criterion may be waived ONLY by the operator, not by a reviewer (${JSON.stringify(object(criterion.waiver)?.actor)})`);
  }
  if (verdict === "CLEAN") {
    if (target?.target_incorporated !== true) errors.push("$.target_binding: CLEAN requires target_incorporated=true");
    if (target?.target_commits_missing !== 0) errors.push("$.target_binding: CLEAN requires target_commits_missing=0");
    if (target?.candidate_commit !== repo.commit) errors.push("$.target_binding.candidate_commit: CLEAN requires equality with repo.commit");
    if (target?.merge_base !== target?.target_commit) errors.push("$.target_binding.merge_base: CLEAN requires current target to be an ancestor of the closing candidate");
    for (const [index, raw] of debts.entries()) {
      const debt = object(raw);
      if (!debt) continue;
      if (OPEN_DEBT_STATES.has(String(debt.state))) errors.push(`$.verdict: CLEAN forbidden -- completion_debts[${index}] (${debt.id ?? "?"}) is ${JSON.stringify(debt.state)} (payable debt remains)`);
      else if (debt.state === "deferred") errors.push(`$.verdict: CLEAN forbidden -- completion_debts[${index}] (${debt.id ?? "?"}) is deferred (unpaid work cannot be CLEAN regardless of disposition)`);
    }
    for (const [index, raw] of (array(report.acceptance_criteria) ?? []).entries()) {
      const criterion = object(raw);
      if (criterion?.met === false && !criterionWaived(criterion)) errors.push(`$.acceptance_criteria[${index}] (${criterion.id ?? "?"}): CLEAN/positive verdict is INVALID while an acceptance criterion is unmet -- an independent reviewer may not downgrade an operator criterion to a non-blocking nuance; pay it or record an explicit operator waiver (actor+ref)`);
    }
    if (decisionRows.length) errors.push(`$.verdict: CLEAN forbidden -- decision_or_coordination_required present: ${decisionRows.join(", ")}`);
    for (const [index, raw] of residuals.entries()) if (object(raw)?.kind === "blocked") errors.push(`$.verdict: CLEAN forbidden -- residuals[${index}] is blocked`);
    let notApplicable = 0;
    for (const name of REQUIRED_DIMENSIONS) {
      const dimension = object(dimensions?.[name]) ?? {};
      const state = dimension.state;
      if (state === "satisfied") {
        const typed = (array(dimension.evidence) ?? []).map(object).filter((entry) => !!entry);
        const allowed = DIMENSION_EVIDENCE_KINDS[name] ?? /* @__PURE__ */ new Set();
        if (!typed.some((entry) => allowed.has(String(entry.kind)) && ["object", "command", "result"].every((key) => nonempty(entry[key])) && isoTimestamp(entry.observed_at))) errors.push(`$.dimensions.${name}: CLEAN requires time-bound evidence kind ${[...allowed].sort().join(", ")} with object/command/result`);
      } else if (state === "not_applicable") {
        notApplicable++;
        if (!array(dimension.evidence)?.length && !nonempty(dimension.notes)) errors.push(`$.dimensions.${name}: CLEAN requires evidence/notes rationale for not_applicable`);
      } else errors.push(`$.dimensions.${name}: CLEAN requires satisfied (or evidenced not_applicable), got ${JSON.stringify(state)}`);
    }
    if (report.mode === "CLOSE" && notApplicable === REQUIRED_DIMENSIONS.length) errors.push("$.dimensions: CLEAN in CLOSE mode cannot mark every dimension not_applicable");
    for (const [name, raw] of Object.entries(claims ?? {})) {
      const claim = object(raw);
      if (!claim) continue;
      if (claim.state === void 0 || claim.state === "not_assessed") errors.push(`$.claims.${name}: CLEAN forbids an unassessed claim (state=${JSON.stringify(claim.state)}); establish it or mark not_applicable with policy_ref`);
      else if (claim.state === "established" && generic(claim.evidence)) errors.push(`$.claims.${name}: CLEAN requires SPECIFIC established evidence, not a generic token`);
    }
    const census = object(report.debt_census);
    if (!census) errors.push("$.debt_census: required for CLEAN (discovered/paid/accepted_exception ints; empty ledger is not a census)");
    else {
      const discovered = census.discovered, paid = census.paid, accepted = census.accepted_exception;
      if (![discovered, paid, accepted].every((value) => typeof value === "number" && Number.isInteger(value))) errors.push("$.debt_census: discovered/paid/accepted_exception must be integers");
      else {
        const d = discovered, p = paid, a = accepted;
        if (d !== p + a) errors.push(`$.debt_census: discovered (${d}) must equal paid (${p}) + accepted_exception (${a})`);
        if (d !== seenIds.size) errors.push(`$.debt_census.discovered (${d}) != unique completion_debts ledger entries (${seenIds.size})`);
        const satisfied = debts.filter((raw) => object(raw)?.state === "satisfied").length;
        const exceptions = debts.filter((raw) => object(raw)?.state === "accepted_exception").length;
        if (p !== satisfied) errors.push(`$.debt_census.paid (${p}) != satisfied ledger entries (${satisfied})`);
        if (a !== exceptions) errors.push(`$.debt_census.accepted_exception (${a}) != accepted_exception ledger entries (${exceptions})`);
      }
    }
    if (assessment?.recommendation !== "proceed") errors.push(`$.verdict: CLEAN requires handoff_assessment.recommendation 'proceed' (got ${JSON.stringify(assessment?.recommendation)})`);
  } else if (assessment?.recommendation === "proceed") errors.push("$.handoff_assessment.recommendation: unconditional proceed conflicts with NOT_CLEAN verdict");
  if (!allowPlaceholders) {
    if (typeof repo.commit !== "string" || !/^[0-9a-f]{7,40}$/.test(repo.commit)) errors.push("$.repo.commit: required 7-40 char hex object id");
    for (const field of ["target_commit", "candidate_commit", "merge_base"]) if (typeof target?.[field] !== "string" || !/^[0-9a-f]{7,40}$/.test(target[field])) errors.push(`$.target_binding.${field}: required 7-40 char hex object id`);
    if (!isoTimestamp(report.generated_at)) errors.push("$.generated_at: required timezone-aware ISO-8601 timestamp");
  }
  const objectCommits = /* @__PURE__ */ new Map();
  for (const [name, raw] of Object.entries(claims ?? {})) {
    const claim = object(raw);
    if (!claim) continue;
    for (const event of array(claim.evidence) ?? []) {
      const evidence = object(event);
      if (evidence?.independence !== void 0 && !["established", "not_established", "legacy_unrecoverable"].includes(String(evidence.independence))) errors.push(`$.claims.${name}: independence must be established|not_established|legacy_unrecoverable`);
      else if (evidence?.independence === "legacy_unrecoverable") {
        for (const key of ["authority", "scope"]) if (!nonempty(evidence[key])) errors.push(`$.claims.${name}: legacy_unrecoverable requires ${key}`);
      }
      if (evidence?.kind === "independent_qa_verdict" && normalizeActor(evidence.reviewer) && normalizeActor(evidence.reviewer) === normalizeActor(evidence.implementer) && claim.state === "established") errors.push(`$.claims.${name}: reviewer and implementer normalize to the same actor (${JSON.stringify(evidence.reviewer)}) -- independence cannot be established`);
    }
    if (claim.state === "not_applicable" && (!nonempty(claim.na_reason) || !nonempty(claim.policy_ref))) errors.push(`$.claims.${name}: not_applicable requires na_reason AND policy_ref (a policy-bound citation, not generic rationale)`);
    if (claim.state === "established") {
      const evidence = (array(claim.evidence) ?? []).map(object).find((item) => !!item && nonempty(item.commit));
      if (evidence) objectCommits.set(name, evidence.commit);
    }
  }
  if (new Set(objectCommits.values()).size > 1) errors.push(`$.claims: same-object violation -- established claims bind different commits: ${[...objectCommits.entries()].sort().map(([name, commit]) => `${name}=${commit}`).join(", ")}`);
  if (verdict === "CLEAN") {
    for (const [name, commit] of objectCommits) if (repo.commit && commit !== repo.commit) errors.push(`$.claims.${name}: CLEAN requires claim commit ${JSON.stringify(commit)} to equal repo.commit ${JSON.stringify(repo.commit)}`);
    const actionIds = /* @__PURE__ */ new Set();
    for (const [index, raw] of (array(report.actions) ?? []).entries()) {
      const action = object(raw);
      if (!action) {
        errors.push(`$.actions[${index}]: expected object`);
        continue;
      }
      if (!nonempty(action.id)) errors.push(`$.actions[${index}].id: required`);
      else if (actionIds.has(action.id)) errors.push(`$.actions[${index}].id: duplicate ${JSON.stringify(action.id)}`);
      else actionIds.add(action.id);
      if (["planned", "failed", "blocked", void 0].includes(action.status)) errors.push(`$.actions[${index}]: CLEAN forbidden with unfinished/failed action (status=${JSON.stringify(action.status)})`);
      else if (action.status === "skipped" && !nonempty(action.skip_reason)) errors.push(`$.actions[${index}]: skipped action requires skip_reason`);
    }
    if (report.mode === "CLOSE" && Object.keys(claims ?? {}).length > 0 && Object.values(claims ?? {}).every((raw) => object(raw)?.state === "not_applicable")) errors.push("$.claims: CLEAN in CLOSE mode cannot mark every claim not_applicable");
  }
  if (!allowPlaceholders) for (const path of findPlaceholders(data)) errors.push(`${path}: unresolved template placeholder`);
  return errors;
}
function validateManifest(data, allowPlaceholders = false) {
  const errors = [];
  const manifest = object(data);
  requireKeys(data, ["record_type", "schema_version", "execution_state", "repo", "mode", "request_ref", "authorization_basis", "policy_sources", "actions", "excluded_actions"], "$", errors);
  if (!manifest || errors.length > 0) return errors;
  if (manifest.record_type !== "mister-clean.action-manifest") errors.push("$.record_type: expected mister-clean.action-manifest");
  if (manifest.schema_version !== "1.0") errors.push("$.schema_version: expected 1.0");
  if (!EXECUTION_STATES.has(String(manifest.execution_state))) errors.push(`$.execution_state: unsupported value ${JSON.stringify(manifest.execution_state)}`);
  if (!["CLEAN", "CLOSE", "CONFORM"].includes(String(manifest.mode))) errors.push("$.mode: action manifest requires CLEAN, CLOSE, or CONFORM");
  const repo = object(manifest.repo) ?? {};
  if (!allowPlaceholders) {
    if (!nonempty(repo.id)) errors.push("$.repo.id: required portable repository identity");
    if (typeof repo.commit !== "string" || !/^[0-9a-f]{7,40}$/.test(repo.commit)) errors.push("$.repo.commit: required 7-40 char hex object id");
  }
  if (!nonempty(manifest.request_ref)) errors.push("$.request_ref: required");
  validateAuthorizationBasis(manifest.authorization_basis, "$.authorization_basis", errors);
  if (!Array.isArray(manifest.excluded_actions)) errors.push("$.excluded_actions: expected array");
  const actions = array(manifest.actions);
  if (!actions) {
    errors.push("$.actions: expected array");
    return errors;
  }
  const seen = /* @__PURE__ */ new Set();
  for (const [index, raw] of actions.entries()) {
    const path = `$.actions[${index}]`;
    const action = object(raw);
    requireKeys(raw, ["id", "kind", "target", "purpose", "risk", "authorization", "preconditions", "verification"], path, errors);
    if (!action) continue;
    if (!nonempty(action.id)) errors.push(`${path}.id: required`);
    else if (seen.has(action.id)) errors.push(`${path}.id: duplicate ${action.id}`);
    else seen.add(action.id);
    const kind = String(action.kind);
    if (PROHIBITED_KINDS.has(kind)) errors.push(`${path}: unrecoverable or prohibited action is outside Mister Clean`);
    else if (!ALLOWED_ACTION_KINDS.has(kind)) errors.push(`${path}.kind: unsupported action kind ${JSON.stringify(action.kind)}`);
    if (!nonempty(action.target)) errors.push(`${path}.target: required`);
    if (!nonempty(action.purpose)) errors.push(`${path}.purpose: required`);
    if (!RISKS.has(String(action.risk))) errors.push(`${path}.risk: unsupported value ${JSON.stringify(action.risk)}`);
    if (action.risk === "unrecoverable") errors.push(`${path}: unrecoverable or prohibited action is outside Mister Clean`);
    if (CONSEQUENT_ACTION_KINDS.has(kind) && action.risk !== "consequential_external") errors.push(`${path}.risk: ${kind} requires consequential_external`);
    if (!Array.isArray(action.preconditions)) errors.push(`${path}.preconditions: expected array`);
    if (!Array.isArray(action.verification)) errors.push(`${path}.verification: expected array`);
    const authorization = object(action.authorization);
    requireKeys(action.authorization, ["state", "source", "ref"], `${path}.authorization`, errors);
    if (!authorization) continue;
    if (!AUTH_STATES.has(String(authorization.state))) errors.push(`${path}.authorization.state: unsupported value ${JSON.stringify(authorization.state)}`);
    if (EXECUTION_STATES.has(String(manifest.execution_state)) && authorization.state !== "granted") errors.push(`${path}.authorization.state: ${manifest.execution_state} manifest requires granted`);
    if (CONSEQUENT_ACTION_KINDS.has(kind) || action.risk === "consequential_external") {
      if (authorization.state === "granted" && !STANDING_AUTH_SOURCES.has(String(authorization.source))) errors.push(`${path}.authorization.source: consequential action requires skill_invocation, explicit_user, or explicit_operator`);
      if (authorization.state === "granted" && !nonempty(authorization.ref)) errors.push(`${path}.authorization.ref: consequential action requires a reference`);
      if (!array(action.preconditions)?.length) errors.push(`${path}.preconditions: consequential action requires a bounded preflight`);
      if (!array(action.verification)?.length) errors.push(`${path}.verification: consequential action requires an exact postcondition`);
    }
    if (manifest.execution_state === "executed" && !array(action.verification)?.length) errors.push(`${path}.verification: executed action requires evidence`);
    if (manifest.execution_state === "executed") {
      const outcome = object(action.outcome);
      requireKeys(action.outcome, ["state", "evidence"], `${path}.outcome`, errors);
      if (outcome) {
        if (outcome.state !== "verified") errors.push(`${path}.outcome.state: executed action requires verified`);
        const typed = (array(outcome.evidence) ?? []).map(object).filter((entry) => !!entry);
        if (!typed.some((entry) => ACTION_EVIDENCE_KINDS.has(String(entry.kind)) && ["object", "command", "result"].every((key) => nonempty(entry[key])) && isoTimestamp(entry.observed_at) && digestRef(entry.evidence_ref))) errors.push(`${path}.outcome.evidence: executed action requires allowlisted, time-bound, digest-referenced execution evidence`);
      }
    }
  }
  if (!allowPlaceholders) for (const path of findPlaceholders(data)) errors.push(`${path}: unresolved template placeholder`);
  if (!Array.isArray(manifest.policy_sources)) errors.push("$.policy_sources: expected list");
  if (!Array.isArray(manifest.excluded_actions)) errors.push("$.excluded_actions: expected list");
  if (!allowPlaceholders) {
    if (!nonempty(manifest.request_ref)) errors.push("$.request_ref: required nonempty");
    const basis = object(manifest.authorization_basis);
    if (basis?.source === "skill_invocation" && !nonempty(basis.ref)) errors.push("$.authorization_basis.ref: required nonempty for skill_invocation");
  }
  const state = manifest.execution_state;
  if (state === "executed" && actions.length === 0) errors.push("$.execution_state: executed with zero actions is not an execution record");
  const destructive = /* @__PURE__ */ new Set(["stash_drop", "recoverable_delete", "branch_delete_local", "branch_delete_remote", "worktree_remove", "process_signal", "git_push"]);
  const local = /* @__PURE__ */ new Set(["local_edit", "local_move", "recoverable_delete", "doc_update", "planning_record_update", "historical_conform", "handoff_update"]);
  for (const [index, raw] of actions.entries()) {
    const action = object(raw);
    if (!action) continue;
    const path = `$.actions[${index}]`;
    if (action.status !== void 0 && !["planned", "executed", "failed", "blocked", "skipped"].includes(String(action.status))) errors.push(`${path}.status: unsupported ${JSON.stringify(action.status)}`);
    if ((state === "executed" || action.status === "executed") && !array(action.verification)?.some(meaningful)) errors.push(`${path}.verification: executed action requires meaningful evidence (not empty/null placeholders)`);
    if (!allowPlaceholders) {
      const target = action.target;
      if (local.has(String(action.kind)) && typeof target === "string") {
        const normalized = pathPosix.normalize(target.replaceAll("\\", "/"));
        if (pathPosix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../") || normalized === ".git" || normalized.startsWith(".git/")) errors.push(`${path}.target: local mutation target must be repository-relative, non-traversing, and outside .git (got ${JSON.stringify(target)})`);
      }
      if (action.kind === "agent_dispatch" && !["in_session_subagent", "external_orchestrated_agent"].includes(String(action.mechanism))) errors.push(`${path}.mechanism: agent_dispatch requires in_session_subagent|external_orchestrated_agent (human/paid external dispatch is prohibited external_dispatch)`);
      const basis = object(manifest.authorization_basis);
      const authorization = object(action.authorization);
      if (authorization?.source === "skill_invocation" && authorization.ref !== basis?.ref) errors.push(`${path}.authorization.ref: must correlate with authorization_basis.ref for skill_invocation actions`);
    }
    if (destructive.has(String(action.kind))) {
      if (!array(action.preconditions)?.some(meaningful)) errors.push(`${path}.preconditions: ${action.kind} requires meaningful preflight facts`);
      if (!array(action.verification)?.some(meaningful)) errors.push(`${path}.verification: ${action.kind} requires recovery/postcondition proof`);
    }
  }
  return errors;
}

// src/closeout/repository.ts
import { createHash } from "crypto";
import { execFileSync, spawnSync } from "child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  readdirSync,
  statSync,
  writeFileSync
} from "fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
var PLANNING_DIRECTORY_NAMES = /* @__PURE__ */ new Set([
  "planning",
  "plans",
  "roadmap",
  "project-management",
  "work-items",
  "work_items",
  "tasks",
  "stories",
  "epics",
  "slices",
  "issues"
]);
var PLANNING_FILE_STEMS = /* @__PURE__ */ new Set([
  "backlog",
  "current",
  "milestones",
  "plan",
  "planning",
  "project-plan",
  "project_plan",
  "roadmap",
  "status",
  "tasks",
  "todo",
  "work-items",
  "work_items"
]);
var PLANNING_FILE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".json",
  ".md",
  ".mdx",
  ".txt",
  ".yaml",
  ".yml"
]);
function isCanonicalPlanningFileName(path) {
  const name = basename(path);
  const extension = extname(name).toLocaleLowerCase("und");
  if (!PLANNING_FILE_EXTENSIONS.has(extension)) return false;
  const stem = name.slice(0, -extension.length).toLocaleLowerCase("und");
  return PLANNING_FILE_STEMS.has(stem);
}
var PLANNING_LANE_LIFECYCLES = /* @__PURE__ */ new Map([
  ["backlog", "preexecution"],
  ["todo", "preexecution"],
  ["to-do", "preexecution"],
  ["to_do", "preexecution"],
  ["ready", "preexecution"],
  ["planned", "preexecution"],
  ["active", "active"],
  ["doing", "active"],
  ["in-progress", "active"],
  ["in_progress", "active"],
  ["inprogress", "active"],
  ["failed", "active"],
  ["done", "done"],
  ["complete", "done"],
  ["completed", "done"],
  ["closed", "done"],
  ["history", "archived"],
  ["historical", "archived"],
  ["archive", "archived"],
  ["archived", "archived"],
  ["superseded", "archived"]
]);
var PLANNING_LANE_NAMES = new Set(PLANNING_LANE_LIFECYCLES.keys());
function planningLaneLifecycle(name) {
  return PLANNING_LANE_LIFECYCLES.get(name.toLocaleLowerCase("und"));
}
var PLANNING_IGNORED_NAMES = /* @__PURE__ */ new Set([
  ".git",
  "node_modules",
  "vendor",
  ".venv",
  "venv",
  "dist",
  "build",
  ".cache"
]);
function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference) return difference;
  }
  return leftPoints.length - rightPoints.length;
}
function runGit(repository, args, allowedStatuses = [0]) {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const status = result.status ?? 1;
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  if (result.error) throw result.error;
  if (!allowedStatuses.includes(status)) {
    throw new Error(stderr || `git ${args.join(" ")} exited ${status}`);
  }
  return { status, stdout, stderr };
}
function git(repository, ...args) {
  return runGit(repository, args).stdout;
}
function isGitAncestor(repository, ancestor, descendant) {
  return runGit(repository, ["merge-base", "--is-ancestor", ancestor, descendant], [0, 1]).status === 0;
}
function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}
function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}
function readJson(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: expected a JSON object`);
  }
  return value;
}
function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}
`, "utf8");
}
function packageRoot(fromUrl = import.meta.url) {
  const sourcePath = fileURLToPath(fromUrl);
  const here = dirname(existsSync(sourcePath) ? realpathSync(sourcePath) : sourcePath);
  const candidates = [resolve(here, "..", ".."), resolve(here, "..")];
  const found = candidates.find((candidate) => existsSync(join(candidate, "assets", "closure-bundle.json")));
  if (!found) throw new Error("Cannot locate Mister Clean package assets");
  return found;
}
function repositoryIdentity(repository) {
  const remote = runGit(repository, ["config", "--get", "remote.origin.url"], [0, 1]).stdout;
  if (remote && !remote.startsWith("/") && !remote.startsWith("file://")) {
    let value;
    if (remote.includes("://")) {
      value = new URL(remote).pathname.replace(/^\/+|\/+$/g, "");
    } else {
      value = remote.split(":", 2).at(-1) ?? remote;
    }
    value = value.replace(/\.git$/, "").replace(/\/+$/, "");
    if (value.includes("/")) return value;
  }
  return repository.split(sep).filter(Boolean).at(-1) ?? repository;
}
function childEntries(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return [];
  }
}
function discoverPlanningRoots(repository) {
  const candidates = /* @__PURE__ */ new Set();
  function visit(directory) {
    const relativePath = relative(repository, directory);
    const name = directory.split(sep).at(-1)?.toLocaleLowerCase() ?? "";
    if (directory !== repository && PLANNING_DIRECTORY_NAMES.has(name)) {
      candidates.add(directory);
      return;
    }
    const entries = childEntries(directory).filter((entry) => !PLANNING_IGNORED_NAMES.has(entry.name));
    for (const entry of entries) {
      if ((entry.isFile() || entry.isSymbolicLink()) && isCanonicalPlanningFileName(entry.name)) {
        candidates.add(join(directory, entry.name));
      }
    }
    const names = entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => entry.name);
    const laneCount = names.filter((child) => PLANNING_LANE_NAMES.has(child.toLocaleLowerCase())).length;
    if (laneCount >= 2 && relativePath !== "") {
      candidates.add(directory);
      return;
    }
    for (const child of names) visit(join(directory, child));
  }
  visit(repository);
  const ordered = [...candidates].sort((left, right) => {
    const depth = left.split(sep).length - right.split(sep).length;
    return depth || compareCodePoints(left, right);
  });
  const minimal = [];
  for (const candidate of ordered) {
    if (!minimal.some((root) => candidate === root || candidate.startsWith(`${root}${sep}`))) {
      minimal.push(candidate);
    }
  }
  return minimal.map((root) => relative(repository, root).split(sep).join("/")).sort();
}
function parseWorktrees(repository) {
  const output = git(repository, "worktree", "list", "--porcelain", "-z");
  if (!output) return [];
  const records = [];
  let current = {};
  for (const item of output.split("\0")) {
    if (!item) continue;
    if (item.startsWith("worktree ") && current.worktree) {
      records.push(current);
      current = {};
    }
    const separator = item.indexOf(" ");
    const rawKey = separator === -1 ? item : item.slice(0, separator);
    const key = rawKey === "HEAD" ? "head" : rawKey.toLocaleLowerCase();
    if (separator === -1) current[key] = "true";
    else current[key] = item.slice(separator + 1);
  }
  if (current.worktree) records.push(current);
  return records;
}
function listEntriesRecursively(root) {
  const entries = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(path);
      else if (entry.isSymbolicLink()) entries.push({ kind: "symlink", path });
      else if (entry.isFile()) entries.push({ kind: "file", path });
      else entries.push({ kind: "other", path });
    }
  }
  visit(root);
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}
function listFilesRecursively(root) {
  return listEntriesRecursively(root).filter((entry) => entry.kind === "file").map((entry) => entry.path);
}
function assertDirectory(path) {
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`not a directory: ${path}`);
}

// src/closeout/planning.ts
import { lstatSync as lstatSync2, readFileSync as readFileSync2 } from "fs";
import { basename as basename2, extname as extname2, relative as relative2, resolve as resolve2, sep as sep2 } from "path";
import { parse as parseYaml } from "yaml";
var TEXT_EXTENSIONS = /* @__PURE__ */ new Set([".json", ".md", ".mdx", ".txt", ".yaml", ".yml"]);
var DONE = /* @__PURE__ */ new Set([
  "accept",
  "accepted",
  "approved",
  "closed",
  "complete",
  "completed",
  "dev complete",
  "done",
  "implemented",
  "merged",
  "pass",
  "passed",
  "shipped",
  "verified"
]);
var ACTIVE = /* @__PURE__ */ new Set([
  "active",
  "blocked",
  "claimed",
  "doing",
  "escalated",
  "executing",
  "failed",
  "in progress",
  "inprogress",
  "ready for acceptance",
  "ready for qa",
  "ready for review",
  "rejected",
  "revise",
  "underway"
]);
var PREEXECUTION = /* @__PURE__ */ new Set([
  "backlog",
  "draft",
  "not started",
  "notstarted",
  "pending",
  "planned",
  "ready",
  "to do",
  "todo",
  "unstarted"
]);
var ARCHIVED = /* @__PURE__ */ new Set(["archive", "archived", "historical", "history", "superseded"]);
var FAILED = /* @__PURE__ */ new Set(["deny", "denied", "fail", "failed", "reject", "rejected", "revise"]);
var PASSED = /* @__PURE__ */ new Set([...DONE, "approve"]);
var UNRUN = /* @__PURE__ */ new Set([
  "backlog",
  "blocked",
  "not executed",
  "not run",
  "notexecuted",
  "notrun",
  "pending",
  "planned",
  "to do",
  "todo",
  "unexecuted",
  "unrun"
]);
var NOT_APPLICABLE = /* @__PURE__ */ new Set(["n/a", "na", "not applicable", "not required", "waived"]);
var NON_ARTIFACT_CLASSES = /* @__PURE__ */ new Set(["guidance", "non artifact", "reference", "schema", "template"]);
var ACCEPTANCE_KINDS = ["acceptance", "holdout", "qa", "review"];
var ACCEPTANCE_WORDS = new Set(ACCEPTANCE_KINDS);
var LEAF_ARTIFACT_TYPES = /* @__PURE__ */ new Set(["slice", "task"]);
var ROLLUP_ARTIFACT_TYPES = /* @__PURE__ */ new Set(["index", "rollup", "status_index"]);
var HIERARCHY_ARTIFACT_TYPES = /* @__PURE__ */ new Set(["epic", "feature", "slice", "story", "task", "work_item"]);
var PLANNING_ARTIFACT_TYPES = /* @__PURE__ */ new Set([
  ...HIERARCHY_ARTIFACT_TYPES,
  ...ROLLUP_ARTIFACT_TYPES,
  "acceptance",
  "holdout",
  "qa",
  "review"
]);
var CHILD_PARENTAGE_ROLE_ALIASES = /* @__PURE__ */ new Set(["child_parentage", "hierarchy", "parent", "parentage"]);
var ROLLUP_PROJECTION_ROLE_ALIASES = /* @__PURE__ */ new Set(["index", "projection", "rollup", "rollup_projection", "status_index"]);
var CANONICAL_PARENT_FIELDS = {
  feature: ["epic", "epic_id"],
  slice: ["story", "story_id", "feature", "feature_id", "epic", "epic_id"],
  story: ["feature", "feature_id", "epic", "epic_id"],
  task: ["slice", "slice_id", "story", "story_id", "feature", "feature_id", "epic", "epic_id"],
  work_item: ["story", "story_id", "feature", "feature_id", "epic", "epic_id"]
};
var ACCEPTANCE_VALUE_FIELDS = [
  "current_lifecycle",
  "current_phase",
  "current_stage",
  "current_state",
  "current_status",
  "implementation_status",
  "lifecycle",
  "outcome",
  "phase",
  "result",
  "stage",
  "state",
  "status",
  "verdict"
];
var ACCEPTANCE_OUTCOME_WORDS = /* @__PURE__ */ new Set([
  "lifecycle",
  "outcome",
  "phase",
  "result",
  "stage",
  "state",
  "status",
  "verdict"
]);
var EXPLICIT_ACCEPTANCE_FIELDS = [
  ...ACCEPTANCE_KINDS.flatMap((kind) => ACCEPTANCE_VALUE_FIELDS.map((field) => `${kind}_${field}`)),
  "outcome",
  "result",
  "verdict"
];
var DECISIVE_ACCEPTANCE_FIELDS = [
  ...ACCEPTANCE_KINDS.flatMap((kind) => ["outcome", "result", "verdict"].map((field) => `${kind}_${field}`)),
  "outcome",
  "result",
  "verdict"
];
var HISTORICAL_HEADINGS = /\b(archive|archived|changelog|historical|history|prior|previous|superseded)\b/i;
var PARENTAGE_TARGET_HEADERS = /* @__PURE__ */ new Set([
  "artifact",
  "artifact id",
  "artifacts",
  "child",
  "child id",
  "children",
  "epic",
  "epic id",
  "epics",
  "feature",
  "feature id",
  "features",
  "id",
  "ids",
  "item",
  "item id",
  "items",
  "planning artifact",
  "planning artifact id",
  "planning artifacts",
  "slice",
  "slice id",
  "slices",
  "stories",
  "story",
  "story id",
  "task",
  "task id",
  "tasks",
  "work item",
  "work item id",
  "work items"
]);
var ROLLUP_TARGET_HEADERS = /* @__PURE__ */ new Set([
  "artifact",
  "artifact id",
  "artifacts",
  "child",
  "child id",
  "children",
  "epic",
  "epic id",
  "epics",
  "feature",
  "feature id",
  "features",
  "id",
  "ids",
  "item",
  "item id",
  "items",
  "planning artifact",
  "planning artifact id",
  "planning artifacts",
  "slice",
  "slice id",
  "slices",
  "stories",
  "story",
  "story id",
  "task",
  "task id",
  "tasks",
  "work item",
  "work item id",
  "work items"
]);
var STRUCTURED_CHILD_KEYS = /* @__PURE__ */ new Set([
  "artifact",
  "artifact_ids",
  "artifacts",
  "artifacts_ids",
  "child",
  "child_ids",
  "children",
  "children_ids",
  "epic",
  "epic_ids",
  "epics",
  "epics_ids",
  "feature",
  "feature_ids",
  "features",
  "features_ids",
  "ids",
  "item",
  "item_ids",
  "items",
  "items_ids",
  "planning_artifact",
  "planning_artifact_ids",
  "planning_artifacts",
  "planning_artifacts_ids",
  "slice",
  "slice_ids",
  "slices",
  "slices_ids",
  "stories",
  "stories_ids",
  "story",
  "story_ids",
  "task",
  "task_ids",
  "tasks",
  "tasks_ids",
  "work_item",
  "work_item_ids",
  "work_items",
  "work_items_ids"
]);
var STRUCTURED_ID_KEYS = [
  "id",
  "artifact_id",
  "child_id",
  "epic_id",
  "feature_id",
  "item_id",
  "planning_artifact_id",
  "slice_id",
  "story_id",
  "task_id",
  "work_item_id"
];
var STRUCTURED_STATE_KEYS = [
  "current_lifecycle",
  "current_phase",
  "current_stage",
  "current_state",
  "current_status",
  "implementation_status",
  "lifecycle",
  "phase",
  "stage",
  "state",
  "status"
];
var STATE_HEADERS = new Set(STRUCTURED_STATE_KEYS.map(normalize));
var STATE_HEADER_WORDS = /* @__PURE__ */ new Set(["lifecycle", "phase", "stage", "state", "status"]);
var ACCEPTANCE_ID_FIELDS = ["acceptance_id", "holdout_id", "qa_id", "review_id"];
var FINDING_CODES = [
  "acceptance_cascade_unexecuted",
  "acceptance_failure_unpaid",
  "acceptance_gate_identity_conflict",
  "acceptance_gate_undiscovered",
  "acceptance_gate_unknown",
  "archive_classification_conflict",
  "body_projection_conflict",
  "completed_parent_unexecuted_acceptance",
  "duplicate_artifact_id",
  "lane_status_conflict",
  "lifecycle_state_unknown",
  "orphan_parent_reference",
  "parent_child_projection_conflict",
  "parent_completion_stale",
  "planning_input_unparsed",
  "planning_relationship_conflict",
  "planning_relationship_unresolved",
  "preexecution_parent_has_started_children"
];
function object2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function normalize(value) {
  return foldCase(value.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/([a-z\d])([A-Z])/g, "$1 $2")).replace(/[`*"']/g, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}
function isNonArtifactPlanningClass(value) {
  return NON_ARTIFACT_CLASSES.has(normalize(value));
}
function normalizedId(value) {
  return foldCase(value).trim();
}
function keyToken(value) {
  return normalize(value).replace(/ /g, "_");
}
function scalar(value) {
  if (typeof value === "string") return value.trim() || void 0;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return void 0;
}
function unique(values) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizedId(trimmed);
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
function topEntries(metadata, keys) {
  const priorities = /* @__PURE__ */ new Map();
  for (const [index, key] of keys.entries()) {
    const token = keyToken(key);
    if (!priorities.has(token)) priorities.set(token, index);
  }
  return Object.entries(metadata).filter(([key]) => priorities.has(keyToken(key))).sort(([left], [right]) => (priorities.get(keyToken(left)) ?? Number.MAX_SAFE_INTEGER) - (priorities.get(keyToken(right)) ?? Number.MAX_SAFE_INTEGER) || keyToken(left).localeCompare(keyToken(right)) || left.localeCompare(right));
}
function lifecycle(value) {
  if (!value) return "unknown";
  const token = normalize(value);
  if (DONE.has(token)) return "done";
  if (ACTIVE.has(token)) return "active";
  if (PREEXECUTION.has(token)) return "preexecution";
  if (ARCHIVED.has(token)) return "archived";
  return "unknown";
}
function acceptance(value) {
  if (!value) return "unknown";
  const token = normalize(value);
  if (FAILED.has(token)) return "failed";
  if (UNRUN.has(token)) return "unrun";
  if (NOT_APPLICABLE.has(token)) return "not_applicable";
  if (PASSED.has(token)) return "passed";
  return "unknown";
}
function stateProjection(values) {
  const orderedValues = unique(values).sort((left, right) => normalize(left).localeCompare(normalize(right)) || left.localeCompare(right));
  const states = [...new Set(orderedValues.map(lifecycle))].sort();
  return {
    state: states.length === 1 ? states[0] ?? "unknown" : "unknown",
    states,
    values: orderedValues
  };
}
function frontmatterRange(content) {
  const lines2 = content.split(/\r?\n/);
  let start = 0;
  while (start < lines2.length) {
    while (lines2[start]?.trim() === "") start += 1;
    if (lines2[start]?.trim().startsWith("<!--")) {
      while (start < lines2.length && !lines2[start]?.includes("-->")) start += 1;
      if (start < lines2.length) start += 1;
      continue;
    }
    break;
  }
  if (lines2[start]?.trim() !== "---") return void 0;
  for (let end = start + 1; end < lines2.length; end += 1) {
    if (lines2[end]?.trim() === "---") return { end, lines: lines2, start };
  }
  return void 0;
}
function parseStructured(content, kind) {
  try {
    if (kind === "json") parseYaml(content);
    const value = kind === "json" ? JSON.parse(content) : parseYaml(content);
    const metadata = object2(value);
    if (!metadata) return { metadata: {}, parseError: `${kind} root is not an object`, structured: false };
    return { metadata, structured: true };
  } catch (error) {
    const parseError = error instanceof Error ? error.message.split("\n", 1)[0] : void 0;
    return {
      metadata: {},
      parseError: parseError ?? `${kind} parse failed`,
      structured: false
    };
  }
}
function parseSource(source) {
  const extension = extname2(source.path).toLocaleLowerCase("und");
  if (extension === ".json") return parseStructured(source.content, "json");
  if (extension === ".yaml" || extension === ".yml") return parseStructured(source.content, "yaml");
  const range = frontmatterRange(source.content);
  if (!range) return { metadata: {}, structured: false };
  const raw = range.lines.slice(range.start + 1, range.end).join("\n");
  return parseStructured(raw, "yaml");
}
function topValues(metadata, keys) {
  const values = [];
  for (const [, value] of topEntries(metadata, keys)) {
    const item = scalar(value);
    if (item) values.push(item);
  }
  return unique(values);
}
function scalarAliasValues(metadata, keys, label) {
  const entries = topEntries(metadata, keys);
  const values = [];
  const invalid = [];
  for (const [key, raw] of entries) {
    const value = scalar(raw);
    if (value) values.push(value);
    else invalid.push(key);
  }
  return {
    ...invalid.length > 0 ? { error: `${label} aliases must each contain one nonempty scalar; invalid: ${invalid.map((key) => JSON.stringify(key)).join(", ")}` } : {},
    present: entries.length > 0,
    values: unique(values)
  };
}
function scalarListAliasValues(metadata, keys, label) {
  const entries = topEntries(metadata, keys);
  const values = [];
  const invalid = [];
  const add = (raw, ref) => {
    const value = scalar(raw);
    if (value) {
      values.push(value);
      return;
    }
    if (Array.isArray(raw) && raw.length > 0) {
      raw.forEach((entry, index) => add(entry, `${ref}[${index}]`));
      return;
    }
    invalid.push(ref);
  };
  for (const [key, raw] of entries) add(raw, key);
  return {
    ...invalid.length > 0 ? { error: `${label} entries must each contain one nonempty scalar; invalid: ${invalid.map((key) => JSON.stringify(key)).join(", ")}` } : {},
    present: entries.length > 0,
    values: unique(values)
  };
}
function lifecycleAliasProjection(metadata, label, allowAcceptance = false) {
  const aliases = scalarAliasValues(metadata, STRUCTURED_STATE_KEYS, label);
  const projection = stateProjection(aliases.values);
  const unsupported = aliases.values.filter((value) => lifecycle(value) === "unknown" && !(allowAcceptance && acceptance(value) !== "unknown"));
  const lifecycleStates = [...new Set(aliases.values.map(lifecycle).filter((state) => state !== "unknown"))];
  const errors = [
    aliases.error,
    ...unsupported.length > 0 ? [`${label} contains unsupported lifecycle values: ${unsupported.map((value) => JSON.stringify(value)).join(", ")}`] : [],
    ...lifecycleStates.length > 1 ? [`${label} contains conflicting lifecycle values: ${aliases.values.map((value) => JSON.stringify(value)).join(", ")}`] : []
  ].filter((error) => Boolean(error));
  return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    projection
  };
}
function topLevelProjection(metadata) {
  const projection = scalarAliasValues(metadata, ["top_level"], "top_level");
  const normalized = projection.values.map(normalize);
  const supported = /* @__PURE__ */ new Set(["0", "1", "false", "no", "true", "yes"]);
  const errors = [
    projection.error,
    ...normalized.length > 1 ? [`top_level aliases conflict: ${projection.values.map((value) => JSON.stringify(value)).join(", ")}`] : [],
    ...normalized.some((value) => !supported.has(value)) ? [`top_level must be one of true, false, yes, no, 1, or 0; received ${projection.values.map((value) => JSON.stringify(value)).join(", ")}`] : []
  ].filter((error) => Boolean(error));
  return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    value: normalized.length === 1 && (/* @__PURE__ */ new Set(["1", "true", "yes"])).has(normalized[0] ?? "")
  };
}
function unsupportedStateAliasError(metadata, label) {
  const supported = /* @__PURE__ */ new Set([
    ...STRUCTURED_STATE_KEYS.map(keyToken),
    ...EXPLICIT_ACCEPTANCE_FIELDS.map(keyToken)
  ]);
  const unsupported = Object.keys(metadata).filter((key) => {
    const token = keyToken(key);
    const words = normalize(key).split(" ");
    return words.some((word) => STATE_HEADER_WORDS.has(word)) && !supported.has(token);
  });
  return unsupported.length > 0 ? `${label} contains unsupported state-like aliases: ${unsupported.map((key) => JSON.stringify(key)).join(", ")}` : void 0;
}
function deepEntries(value, path = []) {
  const item = object2(value);
  if (item) {
    return Object.entries(item).flatMap(([key, child]) => deepEntries(child, [...path, keyToken(key)]));
  }
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => deepEntries(child, [...path, String(index)]));
  }
  return [{ path, value }];
}
function hasRawPlanningSignal(metadata, type) {
  const keys = new Set(Object.keys(metadata).map(keyToken));
  const recognized = /* @__PURE__ */ new Set([
    ...STRUCTURED_CHILD_KEYS,
    ...STRUCTURED_ID_KEYS,
    ...STRUCTURED_STATE_KEYS,
    "child_relationship_role",
    "child_relationship_role_rationale",
    "child_target_column",
    "child_target_column_rationale",
    "non_relationship_table_columns",
    "non_relationship_table_rationale",
    "non_relationship_table_target_columns",
    "parent",
    "parent_id",
    "parent_ids",
    "parents",
    "parents_ids",
    "relationship_role",
    "relationship_role_rationale",
    "relationship_target_column",
    "relationship_target_column_rationale",
    "rollup_target_column",
    "rollup_target_column_rationale",
    "top_level",
    `${type}_id`
  ]);
  return [...keys].some((key) => recognized.has(key));
}
function pathLane(path) {
  for (const part of path.split("/")) {
    const state = planningLaneLifecycle(part);
    if (state) return state;
  }
  return "unknown";
}
function acceptanceDeclarationKinds(value) {
  const kinds = [];
  const visit = (current) => {
    const item = object2(current);
    if (!item) {
      if (Array.isArray(current)) current.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(item)) {
      const token = keyToken(key);
      const identityKind = ACCEPTANCE_ID_FIELDS.find((field) => token === field)?.replace(/_id$/, "");
      if (identityKind) kinds.push(identityKind);
      if ((/* @__PURE__ */ new Set(["artifact_type", "kind", "type"])).has(token)) {
        const declaredType = keyToken(scalar(child) ?? "");
        if (ACCEPTANCE_WORDS.has(declaredType)) kinds.push(declaredType);
      }
      for (const kind of ACCEPTANCE_KINDS) {
        if (token === kind || token === `${kind}s` || ACCEPTANCE_VALUE_FIELDS.some((field) => token === `${kind}_${field}`)) {
          kinds.push(kind);
        }
      }
      visit(child);
    }
  };
  visit(value);
  return unique(kinds);
}
function hasNestedCanonicalPlanningSignal(metadata) {
  const semanticKeys = new Set([
    ...ACCEPTANCE_ID_FIELDS,
    ...EXPLICIT_ACCEPTANCE_FIELDS,
    ...STRUCTURED_STATE_KEYS,
    "artifact_id",
    "child_id",
    "epic_id",
    "feature_id",
    "parent",
    "parent_id",
    "parent_ids",
    "parents",
    "parents_ids",
    "planning_artifact_id",
    "review_of",
    "reviewed_id",
    "slice_id",
    "story_id",
    "subject_id",
    "target_id",
    "task_id",
    "top_level",
    "work_item_id"
  ].map(keyToken));
  return deepEntries(metadata).some((entry) => {
    if (entry.path.length < 2) return false;
    if (entry.path.some((part, index) => index > 0 && (semanticKeys.has(part) || ACCEPTANCE_WORDS.has(part) || ACCEPTANCE_WORDS.has(part.replace(/s$/, ""))))) return true;
    const last = entry.path.at(-1) ?? "";
    return (/* @__PURE__ */ new Set(["artifact_type", "kind", "type"])).has(last) && PLANNING_ARTIFACT_TYPES.has(keyToken(scalar(entry.value) ?? ""));
  });
}
function inferredArtifactType(path, metadata, declaredType) {
  const acceptanceKinds = ACCEPTANCE_ID_FIELDS.filter((key) => topEntries(metadata, [key]).length > 0).map((key) => key.replace(/_id$/, ""));
  const outcomeKinds = ACCEPTANCE_KINDS.filter((kind) => topEntries(
    metadata,
    ACCEPTANCE_VALUE_FIELDS.map((field) => `${kind}_${field}`)
  ).length > 0);
  const declarationKinds = acceptanceDeclarationKinds(metadata);
  const hasGenericOutcome = topEntries(metadata, ["outcome", "result", "verdict"]).length > 0;
  const reviewRelation = topEntries(metadata, ["review_of", "reviewed_id"]).length > 0;
  const genericRelation = topEntries(metadata, ["subject_id", "target_id"]).length > 0;
  const genericIds = scalarAliasValues(metadata, ["id"], "generic identity").values;
  const hierarchyRelationKeys = [
    "epic",
    "epic_id",
    "feature",
    "feature_id",
    "parent",
    "parent_id",
    "parent_ids",
    "slice",
    "slice_id",
    "story",
    "story_id",
    "task",
    "task_id",
    "work_item",
    "work_item_id"
  ];
  const hierarchyRelation = genericIds.length > 0 && topEntries(metadata, hierarchyRelationKeys).some(([, raw]) => {
    const value = scalar(raw);
    return !value || !genericIds.some((id) => normalizedId(id) === normalizedId(value));
  });
  const relationType = reviewRelation ? "review" : genericRelation || hierarchyRelation ? "acceptance" : void 0;
  const errors = [];
  const hierarchyAliases = [...HIERARCHY_ARTIFACT_TYPES].map((kind) => ({ kind, projection: scalarAliasValues(metadata, [`${kind}_id`], `${kind} identity`) })).filter((entry) => entry.projection.present);
  if (acceptanceKinds.length > 1) {
    errors.push(`acceptance identity aliases imply multiple artifact types: ${acceptanceKinds.map((value) => JSON.stringify(value)).join(", ")}`);
  }
  if (relationType && outcomeKinds.length > 1) {
    errors.push(`acceptance outcome aliases imply multiple artifact types: ${outcomeKinds.map((value) => JSON.stringify(value)).join(", ")}`);
  }
  if (relationType && declarationKinds.length > 1) {
    errors.push(`acceptance declarations imply multiple artifact types: ${declarationKinds.map((value) => JSON.stringify(value)).join(", ")}`);
  }
  if (reviewRelation && outcomeKinds.length === 1 && outcomeKinds[0] !== "review") {
    errors.push(`review parentage conflicts with ${JSON.stringify(outcomeKinds[0])} outcome aliases`);
  }
  const strongAcceptanceType = acceptanceKinds.length === 1 ? acceptanceKinds[0] : reviewRelation ? "review" : relationType && declarationKinds.length === 1 ? declarationKinds[0] : relationType && (hasGenericOutcome || declarationKinds.length > 0) ? relationType : void 0;
  let inferredHierarchyType;
  if (!strongAcceptanceType && hierarchyAliases.length > 0 && (!declaredType || !PLANNING_ARTIFACT_TYPES.has(declaredType))) {
    for (const entry of hierarchyAliases) if (entry.projection.error) errors.push(entry.projection.error);
    if (declaredType) {
      errors.push(`custom artifact type ${JSON.stringify(declaredType)} cannot silently reinterpret canonical hierarchy aliases: ${hierarchyAliases.map((entry) => JSON.stringify(`${entry.kind}_id`)).join(", ")}`);
    } else if (hierarchyAliases.length !== 1) {
      errors.push(`type-unresolved artifact declares multiple canonical hierarchy aliases: ${hierarchyAliases.map((entry) => JSON.stringify(`${entry.kind}_id`)).join(", ")}`);
    } else {
      const entry = hierarchyAliases[0];
      const values = entry?.projection.values ?? [];
      if (values.length !== 1) {
        errors.push(`type-unresolved artifact cannot resolve ${JSON.stringify(`${entry?.kind ?? "artifact"}_id`)} to one identity`);
      } else if (genericIds.length > 0 && !genericIds.some((id) => normalizedId(id) === normalizedId(values[0] ?? ""))) {
        errors.push(`type-unresolved artifact has ambiguous generic identity ${JSON.stringify(genericIds[0])} and canonical ${JSON.stringify(`${entry?.kind ?? "artifact"}_id`)} ${JSON.stringify(values[0])}`);
      } else {
        inferredHierarchyType = entry?.kind;
      }
    }
  }
  const pathParts = path.split("/").slice(0, -1).map(normalize);
  let pathType = "planning";
  if (pathParts.some((part) => (/* @__PURE__ */ new Set(["acceptance", "acceptances"])).has(part))) pathType = "acceptance";
  else if (pathParts.some((part) => (/* @__PURE__ */ new Set(["holdout", "holdouts"])).has(part))) pathType = "holdout";
  else if (pathParts.includes("qa")) pathType = "qa";
  else if (pathParts.some((part) => (/* @__PURE__ */ new Set(["review", "reviews", "story review", "story reviews"])).has(part))) pathType = "review";
  else if (pathParts.some((part) => (/* @__PURE__ */ new Set(["stories", "story"])).has(part))) pathType = "story";
  else if (pathParts.some((part) => (/* @__PURE__ */ new Set(["slices", "slice", "tasks", "task"])).has(part))) pathType = "slice";
  else if (pathParts.some((part) => (/* @__PURE__ */ new Set(["epics", "epic"])).has(part))) pathType = "epic";
  if (strongAcceptanceType) return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    strongAcceptanceType,
    type: strongAcceptanceType
  };
  if (inferredHierarchyType) return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    type: inferredHierarchyType
  };
  return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    type: pathType
  };
}
function artifactType(path, metadata) {
  const projection = scalarAliasValues(metadata, ["artifact_type", "kind", "type"], "artifact type");
  const types = unique(projection.values.map(keyToken));
  const inferred = inferredArtifactType(path, metadata, types.length === 1 ? types[0] : void 0);
  if (types.length === 0) {
    const errors2 = [projection.error, inferred.error].filter((error) => Boolean(error));
    return { ...errors2.length > 0 ? { error: errors2.join("; ") } : {}, type: inferred.type };
  }
  const acceptanceKinds = ACCEPTANCE_ID_FIELDS.filter((key) => topEntries(metadata, [key]).length > 0).map((key) => key.replace(/_id$/, ""));
  const errors = [
    projection.error,
    inferred.error,
    ...types.length > 1 ? [`artifact type projections conflict: ${projection.values.map((value) => JSON.stringify(value)).join(", ")}`] : [],
    ...acceptanceKinds.some((kind) => kind !== types[0]) ? [`artifact type ${JSON.stringify(types[0])} conflicts with acceptance identity aliases for ${acceptanceKinds.map((value) => JSON.stringify(value)).join(", ")}`] : [],
    ...inferred.strongAcceptanceType && inferred.strongAcceptanceType !== types[0] ? [`artifact type ${JSON.stringify(types[0])} conflicts with acceptance-shaped metadata for ${JSON.stringify(inferred.strongAcceptanceType)}`] : []
  ].filter((error) => Boolean(error));
  return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    type: types[0] ?? inferred.type
  };
}
function artifactIdentity(path, type, metadata) {
  const projection = scalarAliasValues(metadata, [`${type}_id`, "id"], "artifact identity");
  const ids = unique(projection.values);
  const errors = [
    projection.error,
    ...ids.length > 1 ? [`artifact identity projections conflict: ${projection.values.map((value) => JSON.stringify(value)).join(", ")}`] : []
  ].filter((error) => Boolean(error));
  return ids.length > 0 ? {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    explicit: true,
    id: ids[0] ?? basename2(path, extname2(path))
  } : {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    explicit: false,
    id: basename2(path, extname2(path))
  };
}
function acceptanceArtifact(path, type) {
  if (/(^|_)(acceptance|holdout|qa|review)($|_)/.test(type)) return true;
  return path.split("/").slice(0, -1).map(normalize).some((part) => (/* @__PURE__ */ new Set([
    "acceptance",
    "acceptances",
    "holdout",
    "holdouts",
    "qa",
    "review",
    "reviews",
    "story review",
    "story reviews"
  ])).has(part));
}
function parentReferenceKeys(type, isAcceptance) {
  const keys = ["parent", "parent_id", "parent_ids", "parents", "parents_ids"];
  if (isAcceptance) {
    keys.push(...[
      ["review_of", "reviewed_id", "subject_id", "target_id"],
      ["story", "story_id"],
      ["feature", "feature_id", "slice", "slice_id", "task", "task_id", "work_item", "work_item_id"],
      ["epic", "epic_id"],
      ["reviews"]
    ].flat());
  } else {
    keys.push(...CANONICAL_PARENT_FIELDS[type] ?? []);
  }
  return unique(keys);
}
function parentReferences(metadata, type, isAcceptance, path) {
  const keys = parentReferenceKeys(type, isAcceptance);
  const ids = [];
  const references = [];
  const errors = [];
  const referenceObjectKeys = [
    ...STRUCTURED_ID_KEYS,
    "epic",
    "feature",
    "item",
    "parent",
    "parent_id",
    "parent_ids",
    "parents",
    "parents_ids",
    "slice",
    "story",
    "task",
    "work_item"
  ];
  const parseEntry = (value, ref) => {
    const direct = scalar(value);
    if (direct) {
      ids.push(direct);
      references.push({ id: direct, ref, state: "unknown" });
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        errors.push({
          code: "planning_relationship_unresolved",
          detail: "parent reference declares an empty target collection",
          related: [ref]
        });
      }
      for (const [index, entry] of value.entries()) parseEntry(entry, `${ref}[${index}]`);
      return;
    }
    const item = object2(value);
    const unsupportedState = item ? unsupportedStateAliasError(item, "parent reference") : void 0;
    if (unsupportedState) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: unsupportedState,
        related: [ref]
      });
    }
    const identityScan = item ? scalarAliasValues(item, referenceObjectKeys, "parent reference identity") : { present: false, values: [] };
    const candidates = identityScan.values;
    if (identityScan.error) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: identityScan.error,
        related: [ref]
      });
    }
    if (candidates.length === 1) {
      const id = candidates[0] ?? "";
      const stateScan = lifecycleAliasProjection(item ?? {}, "parent reference lifecycle");
      if (stateScan.error) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: stateScan.error,
          related: [ref]
        });
      }
      ids.push(id);
      references.push({ id, ref, state: stateScan.projection.state });
      return;
    }
    errors.push({
      code: candidates.length > 1 ? "planning_relationship_conflict" : "planning_relationship_unresolved",
      detail: candidates.length > 1 ? `parent reference resolves to ${candidates.length} identities` : "parent reference has no scalar or recognized identity",
      related: [ref]
    });
  };
  for (const [key, value] of topEntries(metadata, keys)) parseEntry(value, `${path}#${keyToken(key)}`);
  return { errors, ids: unique(ids), references };
}
function childRelationshipRole(metadata, type) {
  const defaultRole = ROLLUP_ARTIFACT_TYPES.has(type) ? "rollup_projection" : "child_parentage";
  const projection = scalarAliasValues(
    metadata,
    ["relationship_role", "child_relationship_role"],
    "relationship role"
  );
  const rationale = scalarAliasValues(metadata, [
    "relationship_role_rationale",
    "child_relationship_role_rationale"
  ], "relationship role rationale");
  const errors = [projection.error, rationale.error].filter((error) => Boolean(error));
  const values = projection.values;
  if (values.length === 0) {
    return { ...errors.length > 0 ? { error: errors.join("; ") } : {}, role: defaultRole };
  }
  const roles = /* @__PURE__ */ new Set();
  const unsupported = [];
  for (const value of values) {
    const token = keyToken(value);
    if (CHILD_PARENTAGE_ROLE_ALIASES.has(token)) {
      roles.add("child_parentage");
    } else if (ROLLUP_PROJECTION_ROLE_ALIASES.has(token)) {
      roles.add("rollup_projection");
    } else {
      unsupported.push(value);
    }
  }
  if (unsupported.length > 0 || roles.size !== 1) {
    errors.push(`relationship_role must resolve to exactly one of child_parentage or rollup_projection; received ${values.map((value) => JSON.stringify(value)).join(", ")}`);
    return { error: errors.join("; "), role: defaultRole };
  }
  const role = [...roles][0] ?? defaultRole;
  if (role !== defaultRole && (HIERARCHY_ARTIFACT_TYPES.has(type) || ROLLUP_ARTIFACT_TYPES.has(type))) {
    errors.push(`${JSON.stringify(type)} has immutable relationship role ${JSON.stringify(defaultRole)}`);
    return { error: errors.join("; "), role: defaultRole };
  }
  if (role !== defaultRole && rationale.values.length === 0) {
    errors.push(`relationship_role overrides the ${JSON.stringify(defaultRole)} default without relationship_role_rationale`);
    return { error: errors.join("; "), role: defaultRole };
  }
  return { ...errors.length > 0 ? { error: errors.join("; ") } : {}, role };
}
function relationshipTargetHeaders(metadata, role) {
  const defaults = role === "rollup_projection" ? ROLLUP_TARGET_HEADERS : PARENTAGE_TARGET_HEADERS;
  const keys = role === "rollup_projection" ? ["relationship_target_column", "rollup_target_column"] : ["child_target_column", "relationship_target_column"];
  const projection = scalarAliasValues(metadata, keys, "relationship target column");
  const values = projection.values;
  const rationaleKeys = role === "rollup_projection" ? ["relationship_target_column_rationale", "rollup_target_column_rationale"] : ["child_target_column_rationale", "relationship_target_column_rationale"];
  const rationale = scalarAliasValues(metadata, rationaleKeys, "relationship target-column rationale");
  const errors = [projection.error, rationale.error].filter((error) => Boolean(error));
  if (values.length === 0) {
    return { ...errors.length > 0 ? { error: errors.join("; ") } : {}, headers: defaults };
  }
  if (values.length > 1) {
    errors.push(`relationship target column must resolve to exactly one header; received ${values.map((value) => JSON.stringify(value)).join(", ")}`);
    return { error: errors.join("; "), headers: defaults };
  }
  if (rationale.values.length === 0) {
    errors.push(`custom relationship target column ${JSON.stringify(values[0])} requires a target-column rationale`);
    return { error: errors.join("; "), headers: defaults };
  }
  const custom = normalize(values[0] ?? "");
  if (STATE_HEADERS.has(custom)) {
    errors.push(`relationship target column ${JSON.stringify(values[0])} overlaps the lifecycle vocabulary`);
    return { error: errors.join("; "), headers: defaults };
  }
  return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    headers: /* @__PURE__ */ new Set([...defaults, custom])
  };
}
function nonRelationshipTableHeaders(metadata, role) {
  const projection = scalarListAliasValues(metadata, [
    "non_relationship_table_columns",
    "non_relationship_table_target_columns"
  ], "non-relationship table columns");
  const rationale = scalarAliasValues(
    metadata,
    ["non_relationship_table_rationale"],
    "non-relationship table rationale"
  );
  const errors = [projection.error, rationale.error].filter((error) => Boolean(error));
  if (!projection.present) {
    return { ...errors.length > 0 ? { error: errors.join("; ") } : {}, headers: /* @__PURE__ */ new Set() };
  }
  const values = projection.values.map(normalize);
  if (values.length === 0) {
    errors.push("non-relationship table classification declares no target columns");
    return { error: errors.join("; "), headers: /* @__PURE__ */ new Set() };
  }
  if (role !== "child_parentage") {
    errors.push("rollup artifacts cannot suppress state-bearing tables as non-relationship");
    return { error: errors.join("; "), headers: /* @__PURE__ */ new Set() };
  }
  if (rationale.values.length === 0) {
    errors.push("non-relationship table classification requires non_relationship_table_rationale");
    return { error: errors.join("; "), headers: /* @__PURE__ */ new Set() };
  }
  const overlaps = values.filter((value) => PARENTAGE_TARGET_HEADERS.has(value));
  const lifecycleOverlaps = values.filter((value) => STATE_HEADERS.has(value));
  if (overlaps.length > 0 || lifecycleOverlaps.length > 0) {
    errors.push(`relationship or lifecycle columns cannot be suppressed: ${[...overlaps, ...lifecycleOverlaps].map((value) => JSON.stringify(value)).join(", ")}`);
    return { error: errors.join("; "), headers: /* @__PURE__ */ new Set() };
  }
  return {
    ...errors.length > 0 ? { error: errors.join("; ") } : {},
    headers: new Set(values)
  };
}
function splitTableRow(line) {
  const trimmed = line.trim();
  const cells = [];
  let cell = "";
  let codeDelimiter = 0;
  let endedWithDelimiter = false;
  let index = 0;
  while (index < trimmed.length) {
    const character = trimmed[index] ?? "";
    if (character === "`") {
      let end = index + 1;
      while (trimmed[end] === "`") end += 1;
      const runLength = end - index;
      cell += trimmed.slice(index, end);
      if (codeDelimiter === 0) codeDelimiter = runLength;
      else if (codeDelimiter === runLength) codeDelimiter = 0;
      endedWithDelimiter = false;
      index = end;
      continue;
    }
    if (character === "\\" && codeDelimiter === 0) {
      let end = index + 1;
      while (trimmed[end] === "\\") end += 1;
      const runLength = end - index;
      const next = trimmed[end];
      if (next === "|" || next === "`") {
        cell += "\\".repeat(Math.floor(runLength / 2));
        if (runLength % 2 === 1) {
          cell += next;
          endedWithDelimiter = false;
          index = end + 1;
          continue;
        }
      } else {
        cell += "\\".repeat(runLength);
      }
      endedWithDelimiter = false;
      index = end;
      continue;
    }
    if (character === "|" && codeDelimiter === 0) {
      cells.push(cell.trim());
      cell = "";
      endedWithDelimiter = true;
      index += 1;
      continue;
    }
    cell += character;
    endedWithDelimiter = false;
    index += 1;
  }
  cells.push(cell.trim());
  if (trimmed.startsWith("|")) cells.shift();
  if (endedWithDelimiter) cells.pop();
  return cells;
}
function separatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}
function stateLikeHeader(value) {
  return STATE_HEADER_WORDS.has(normalize(value).split(" ").at(-1) ?? "");
}
function scanBody(content) {
  const range = frontmatterRange(content);
  const lines2 = range?.lines ?? content.split(/\r?\n/);
  const start = range ? range.end + 1 : 0;
  const scanned = [];
  let historicalLevel;
  let fence;
  let inHtmlComment = false;
  const visibleText = (raw) => {
    let remaining = raw;
    let visible = "";
    while (remaining.length > 0) {
      if (inHtmlComment) {
        const end = remaining.indexOf("-->");
        if (end < 0) return visible;
        inHtmlComment = false;
        remaining = remaining.slice(end + 3);
        continue;
      }
      const startComment = remaining.indexOf("<!--");
      if (startComment < 0) return visible + remaining;
      visible += remaining.slice(0, startComment);
      remaining = remaining.slice(startComment + 4);
      inHtmlComment = true;
    }
    return visible;
  };
  for (let index = start; index < lines2.length; index += 1) {
    const text2 = visibleText(lines2[index] ?? "");
    const fenceMarker = /^\s{0,3}(`{3,}|~{3,})/.exec(text2)?.[1];
    if (fenceMarker) {
      const character = fenceMarker[0] ?? "";
      if (!fence) fence = { character, length: fenceMarker.length };
      else if (character === fence.character && fenceMarker.length >= fence.length) fence = void 0;
      scanned.push({ historical: true, lineNumber: index + 1, text: "" });
      continue;
    }
    if (fence || inHtmlComment) {
      scanned.push({ historical: true, lineNumber: index + 1, text: "" });
      continue;
    }
    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(text2);
    if (heading) {
      const level = (heading[1] ?? "").length;
      if (historicalLevel !== void 0 && level <= historicalLevel) historicalLevel = void 0;
      if (historicalLevel === void 0 && HISTORICAL_HEADINGS.test(heading[2] ?? "")) {
        historicalLevel = level;
      }
    }
    scanned.push({ historical: historicalLevel !== void 0, lineNumber: index + 1, text: text2 });
  }
  return scanned;
}
function tableChildren(lines2, path, role, targetHeaders, nonRelationshipHeaders) {
  const children = [];
  const errors = [];
  for (let index = 0; index + 1 < lines2.length; index += 1) {
    const header = lines2[index];
    const separator = lines2[index + 1];
    if (!header || !separator || header.historical || separator.historical) continue;
    const headerLine = header.text;
    const separatorLine = separator.text;
    if (!headerLine.includes("|") || !separatorLine.includes("|")) continue;
    const headers = splitTableRow(headerLine).map(normalize);
    const childIndexes = headers.flatMap((header2, headerIndex) => targetHeaders.has(header2) ? [headerIndex] : []);
    const stateIndexes = headers.flatMap((header2, headerIndex) => STATE_HEADERS.has(header2) ? [headerIndex] : []);
    const unsupportedStateIndexes = headers.flatMap((header2, headerIndex) => stateLikeHeader(header2) && !STATE_HEADERS.has(header2) ? [headerIndex] : []);
    const nonRelationshipIndexes = headers.flatMap((header2, headerIndex) => nonRelationshipHeaders.has(header2) ? [headerIndex] : []);
    const childIndex = childIndexes[0] ?? -1;
    const stateIndex = stateIndexes[0] ?? -1;
    const hasSeparator = separatorRow(splitTableRow(separatorLine));
    if (childIndexes.length > 1 || stateIndexes.length > 1) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: `relationship table must have exactly one target column and at most one state column; found ${childIndexes.length} targets and ${stateIndexes.length} state columns`,
        related: [`${path}#table-header-${header.lineNumber}`]
      });
    }
    if (childIndexes.length === 0 && nonRelationshipIndexes.length === 1) continue;
    if (childIndexes.length === 0 && nonRelationshipIndexes.length > 1) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: `non-relationship table classification is ambiguous across ${nonRelationshipIndexes.length} columns`,
        related: [`${path}#table-header-${header.lineNumber}`]
      });
      continue;
    }
    if (unsupportedStateIndexes.length > 0) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: `state-like table headers must use a recognized lifecycle column name; unsupported: ${unsupportedStateIndexes.map((headerIndex) => JSON.stringify(headers[headerIndex])).join(", ")}`,
        related: [`${path}#table-header-${header.lineNumber}`]
      });
    }
    if (childIndex < 0) {
      if (stateIndex >= 0 || unsupportedStateIndexes.length > 0) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: `${role} table has a state column but no recognized or declared target column (${headers.map((header2) => JSON.stringify(header2)).join(", ")})`,
          related: [`${path}#table-header-${header.lineNumber}`]
        });
      }
      continue;
    }
    let row = index + (hasSeparator ? 2 : 1);
    while (row < lines2.length && !lines2[row]?.historical && (lines2[row]?.text ?? "").includes("|")) {
      const bodyLine = lines2[row];
      const cells = splitTableRow(bodyLine?.text ?? "");
      const id = cells[childIndex]?.replace(/[`*]/g, "").trim();
      const ref = `${path}#table-row-${bodyLine?.lineNumber ?? row + 1}`;
      const stateValue = stateIndex < 0 ? void 0 : cells[stateIndex]?.trim();
      if (!id) {
        if (cells.some((cell) => cell.trim() !== "")) {
          errors.push({
            code: "planning_relationship_unresolved",
            detail: "relationship table row has no target identity",
            related: [ref]
          });
        }
        row += 1;
        continue;
      }
      const state = lifecycle(stateValue);
      if (stateIndex >= 0 && state === "unknown") {
        errors.push({
          code: "planning_relationship_conflict",
          detail: `relationship table row has missing or unrecognized lifecycle ${JSON.stringify(stateValue ?? "")}`,
          related: [ref]
        });
      }
      children.push({ id, ref, state });
      row += 1;
    }
    index = row - 1;
  }
  const uniqueProjections = /* @__PURE__ */ new Map();
  for (const child of children) {
    const key = `${normalizedId(child.id)}\0${child.state}`;
    const prior = uniqueProjections.get(key);
    if (!prior || child.ref.localeCompare(prior.ref) < 0) uniqueProjections.set(key, child);
  }
  return {
    children: [...uniqueProjections.values()].sort((left, right) => normalizedId(left.id).localeCompare(normalizedId(right.id)) || left.state.localeCompare(right.state) || left.ref.localeCompare(right.ref)),
    errors
  };
}
function structuredChildren(metadata, path, parentKeys) {
  const children = [];
  const errors = [];
  const parseEntry = (value, ref) => {
    const direct = scalar(value);
    if (direct) {
      children.push({ id: direct, ref, state: "unknown" });
      return;
    }
    const item = object2(value);
    if (!item) {
      errors.push({
        code: "planning_relationship_unresolved",
        detail: "structured relationship entry has no scalar or recognized identity",
        related: [ref]
      });
      return;
    }
    const identityScan = scalarAliasValues(item, STRUCTURED_ID_KEYS, "structured relationship identity");
    const ids = identityScan.values;
    const unsupportedState = unsupportedStateAliasError(item, "structured relationship entry");
    if (unsupportedState) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: unsupportedState,
        related: [ref]
      });
    }
    const nestedParentage = topEntries(item, [
      "artifact_type",
      "kind",
      "parent",
      "parent_id",
      "parent_ids",
      "parents",
      "parents_ids",
      "review_of",
      "reviewed_id",
      "subject_id",
      "target_id",
      "top_level",
      "type"
    ]);
    if (nestedParentage.length > 0) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: `structured child projection cannot redeclare type, top-level status, or parentage: ${nestedParentage.map(([key]) => JSON.stringify(key)).join(", ")}`,
        related: [ref]
      });
    }
    if (identityScan.error) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: identityScan.error,
        related: [ref]
      });
    }
    if (ids.length !== 1) {
      errors.push({
        code: ids.length > 1 ? "planning_relationship_conflict" : "planning_relationship_unresolved",
        detail: ids.length > 1 ? `structured relationship entry resolves to ${ids.length} identities` : "structured relationship entry has no recognized identity",
        related: [ref]
      });
      return;
    }
    const stateScan = lifecycleAliasProjection(item, "structured relationship lifecycle");
    if (stateScan.error) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: stateScan.error,
        related: [ref]
      });
    }
    children.push({ id: ids[0] ?? "", ref, state: stateScan.projection.state });
  };
  for (const [key, value] of Object.entries(metadata)) {
    const token = keyToken(key);
    if (!STRUCTURED_CHILD_KEYS.has(token) || parentKeys.has(token)) continue;
    const ref = `${path}#${token}`;
    if (Array.isArray(value)) {
      for (const [index, entry] of value.entries()) parseEntry(entry, `${ref}[${index}]`);
      continue;
    }
    parseEntry(value, ref);
  }
  return { children, errors };
}
function bodyProjection(lines2) {
  const values = [];
  for (const line of lines2) {
    if (line.historical) continue;
    const match = /^\s*(?:>\s*)*(?:#{1,6}\s*)?(?:[-*]\s*)?(?:\*\*)?(?:(?:current|implementation)[_ -]+)?(?:lifecycle|phase|stage|state|status)(?:\*\*)?\s*:\s*(.+?)\s*$/i.exec(line.text);
    if (match?.[1]) values.push(match[1]);
  }
  return stateProjection(values);
}
function bodyAcceptanceObservations(lines2, path) {
  const observations = [];
  const kindPattern = "(acceptance|holdout|qa|review)";
  const fieldPattern = "(?:(?:current|implementation)[ _-]+)?(?:lifecycle|outcome|phase|result|stage|state|status|verdict)";
  const label = new RegExp(`^${kindPattern}(?:\\s+${fieldPattern})?\\s*:\\s*(.+?)\\s*$`, "i");
  const acceptanceKind = (value) => ACCEPTANCE_KINDS.find((kind) => new RegExp(`\\b${kind}\\b`, "i").test(value));
  for (const line of lines2) {
    if (line.historical) continue;
    const visible = line.text.replace(/^\s*(?:>\s*)*/, "").replace(/^\s*#{1,6}\s*/, "").replace(/^\s*[-*+]\s*/, "");
    const unchecked = /^\[\s\]\s*(.+)$/i.exec(visible);
    if (unchecked?.[1]) {
      const kind = acceptanceKind(unchecked[1]);
      if (kind) {
        observations.push({
          kind,
          rationale: false,
          ref: `${path}#line-${line.lineNumber}`,
          state: "unrun"
        });
        continue;
      }
    }
    const plain = visible.replace(/\*\*|__|`/g, "").trim();
    const labelled = label.exec(plain);
    if (labelled?.[1] && labelled[2]) {
      observations.push({
        kind: normalize(labelled[1]),
        rationale: false,
        ref: `${path}#line-${line.lineNumber}`,
        state: acceptance(labelled[2])
      });
      continue;
    }
    if (/\bpending\b/i.test(plain)) {
      const kind = acceptanceKind(plain);
      if (kind) {
        observations.push({
          kind,
          rationale: false,
          ref: `${path}#line-${line.lineNumber}`,
          state: "unrun"
        });
      }
    }
  }
  return observations;
}
function validAcceptanceScope(value) {
  const direct = scalar(value);
  if (direct) return acceptance(direct) !== "unknown";
  if (Array.isArray(value)) return value.length > 0 && value.every(validAcceptanceScope);
  const item = object2(value);
  if (!item || Object.keys(item).length === 0) return false;
  const entries = Object.entries(item);
  const outcomeTokens = /* @__PURE__ */ new Set([
    ...ACCEPTANCE_VALUE_FIELDS.map(keyToken),
    ...EXPLICIT_ACCEPTANCE_FIELDS.map(keyToken)
  ]);
  const directOutcomes = entries.filter(([key]) => outcomeTokens.has(keyToken(key)));
  const decisiveTokens = new Set(DECISIVE_ACCEPTANCE_FIELDS.map(keyToken));
  const decisiveOutcomes = directOutcomes.filter(([key]) => decisiveTokens.has(keyToken(key)));
  const selectedOutcomes = decisiveOutcomes.length > 0 ? decisiveOutcomes : directOutcomes;
  const nestedScopes = entries.filter(([key]) => {
    const token = keyToken(key);
    return ACCEPTANCE_KINDS.some((kind) => token === kind || token === `${kind}s`);
  });
  if (selectedOutcomes.length > 0) {
    return selectedOutcomes.every(([, outcome]) => acceptance(scalar(outcome)) !== "unknown");
  }
  if (nestedScopes.length > 0) return true;
  const collectionEntries = entries.filter(([key]) => !(/* @__PURE__ */ new Set(["justification", "rationale", "reason"])).has(keyToken(key)));
  return collectionEntries.length > 0 && collectionEntries.every(([, child]) => object2(child) !== void 0 && validAcceptanceScope(child));
}
function unsupportedAcceptanceAliasError(metadata) {
  const supported = /* @__PURE__ */ new Set([
    ...ACCEPTANCE_VALUE_FIELDS.map(keyToken),
    ...EXPLICIT_ACCEPTANCE_FIELDS.map(keyToken)
  ]);
  const unsupported = Object.keys(metadata).filter((key) => {
    const token = keyToken(key);
    const words = normalize(key).split(" ");
    return words.some((word) => ACCEPTANCE_OUTCOME_WORDS.has(word)) && !supported.has(token);
  });
  return unsupported.length > 0 ? `acceptance scope contains unsupported outcome-like aliases: ${unsupported.map((key) => JSON.stringify(key)).join(", ")}` : void 0;
}
function acceptanceDeclarationErrors(metadata, path, artifactTypeValue, isAcceptance) {
  const errors = [];
  const fields = ACCEPTANCE_VALUE_FIELDS;
  const kinds = ACCEPTANCE_KINDS;
  const visit = (value, trail) => {
    const item = object2(value);
    if (!item) {
      if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, [...trail, String(index)]));
      return;
    }
    const trailWords = trail.flatMap((part) => normalize(part).split(" "));
    if (trailWords.some((word) => ACCEPTANCE_WORDS.has(word) || ACCEPTANCE_WORDS.has(word.replace(/s$/, "")))) {
      const unsupportedState = unsupportedStateAliasError(item, "acceptance scope");
      const unsupportedOutcome = unsupportedAcceptanceAliasError(item);
      if (unsupportedState) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: unsupportedState,
          related: [`${path}#${trail.join(".")}`]
        });
      }
      if (unsupportedOutcome) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: unsupportedOutcome,
          related: [`${path}#${trail.join(".")}`]
        });
      }
    }
    for (const [scopeKey, scopeValue] of Object.entries(item)) {
      const scope = keyToken(scopeKey);
      if (!kinds.some((kind) => scope === kind || scope === `${kind}s`)) continue;
      if (!validAcceptanceScope(scopeValue)) {
        errors.push({
          code: "planning_relationship_unresolved",
          detail: `acceptance scope ${JSON.stringify(scopeKey)} is empty or malformed`,
          related: [`${path}#${[...trail, scope].join(".")}`]
        });
      }
    }
    for (const kind of kinds) {
      const contextual = trailWords.some((word) => word === kind || word === `${kind}s`) || trail.length === 0 && isAcceptance && gateKind([artifactTypeValue, path]) === kind;
      const prefixedKeys = fields.map((field) => `${kind}_${field}`);
      const keys = contextual ? [...prefixedKeys, ...fields] : prefixedKeys;
      const decisiveKeys = contextual ? [`${kind}_outcome`, `${kind}_result`, `${kind}_verdict`, "outcome", "result", "verdict"] : [`${kind}_outcome`, `${kind}_result`, `${kind}_verdict`];
      const projection = scalarAliasValues(
        item,
        topEntries(item, decisiveKeys).length > 0 ? decisiveKeys : keys,
        `${kind} outcome`
      );
      const rationaleFields = ["justification", "rationale", "reason"];
      const prefixedRationaleKeys = rationaleFields.map((field) => `${kind}_${field}`);
      const rationaleKeys = contextual ? [...prefixedRationaleKeys, ...rationaleFields] : prefixedRationaleKeys;
      const rationale = scalarAliasValues(item, rationaleKeys, `${kind} rationale`);
      if (!projection.present && !rationale.present) continue;
      if (projection.error) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: projection.error,
          related: [`${path}#${[...trail, kind].join(".")}`]
        });
      }
      const unknownOutcomes = projection.values.filter((value2) => acceptance(value2) === "unknown");
      if (unknownOutcomes.length > 0) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: `${kind} outcome contains unsupported values: ${unknownOutcomes.map((value2) => JSON.stringify(value2)).join(", ")}`,
          related: [`${path}#${[...trail, kind].join(".")}`]
        });
      }
      if (rationale.error) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: rationale.error,
          related: [`${path}#${[...trail, kind, "rationale"].join(".")}`]
        });
      }
    }
    for (const [key, child] of Object.entries(item)) visit(child, [...trail, keyToken(key)]);
  };
  visit(metadata, []);
  return errors;
}
function parseArtifact(source) {
  const parsed = parseSource(source);
  const typeProjection = artifactType(source.path, parsed.metadata);
  const type = typeProjection.type;
  const isAcceptance = acceptanceArtifact(source.path, type);
  const lane = pathLane(source.path);
  const declaredScan = lifecycleAliasProjection(parsed.metadata, "artifact lifecycle", isAcceptance);
  const unsupportedStateError = unsupportedStateAliasError(parsed.metadata, "artifact");
  const declaredProjection = declaredScan.projection;
  const declared = declaredProjection.state;
  const identity2 = artifactIdentity(source.path, type, parsed.metadata);
  const nonArtifactRequested = isNonArtifactPlanningClass(source.declaredClass ?? "") || isNonArtifactPlanningClass(type);
  const classificationRationale = scalarAliasValues(
    parsed.metadata,
    ["classification_rationale", "justification", "non_artifact_rationale", "rationale", "reason"],
    "classification rationale"
  );
  const nonArtifactRationale = Boolean(source.classificationRationale?.trim()) || classificationRationale.values.length > 0;
  const topLevelScan = topLevelProjection(parsed.metadata);
  const topLevel = topLevelScan.value;
  const extension = extname2(source.path).toLocaleLowerCase("und");
  const scannedBody = (/* @__PURE__ */ new Set([".md", ".mdx", ".txt"])).has(extension) ? scanBody(source.content) : [];
  const currentBody = bodyProjection(scannedBody);
  const bodyGateObservations = bodyAcceptanceObservations(scannedBody, source.path);
  const parentScan = parentReferences(parsed.metadata, type, isAcceptance, source.path);
  const parentIds = parentScan.ids;
  const relationshipRole = childRelationshipRole(parsed.metadata, type);
  const targetHeaders = relationshipTargetHeaders(parsed.metadata, relationshipRole.role);
  const nonRelationshipHeaders = nonRelationshipTableHeaders(parsed.metadata, relationshipRole.role);
  const scannedTables = tableChildren(
    scannedBody,
    source.path,
    relationshipRole.role,
    targetHeaders.headers,
    nonRelationshipHeaders.headers
  );
  const structuredRelationships = structuredChildren(
    parsed.metadata,
    source.path,
    new Set(parentReferenceKeys(type, isAcceptance).map(keyToken))
  );
  const acceptanceErrors = acceptanceDeclarationErrors(parsed.metadata, source.path, type, isAcceptance);
  const relationshipErrors = [
    ...typeProjection.error ? [{ code: "planning_relationship_conflict", detail: typeProjection.error, related: [] }] : [],
    ...identity2.error ? [{ code: "planning_relationship_conflict", detail: identity2.error, related: [] }] : [],
    ...declaredScan.error ? [{ code: "planning_relationship_conflict", detail: declaredScan.error, related: [] }] : [],
    ...unsupportedStateError ? [{ code: "planning_relationship_conflict", detail: unsupportedStateError, related: [] }] : [],
    ...classificationRationale.error ? [{ code: "planning_relationship_conflict", detail: classificationRationale.error, related: [] }] : [],
    ...topLevelScan.error ? [{ code: "planning_relationship_conflict", detail: topLevelScan.error, related: [] }] : [],
    ...relationshipRole.error ? [{ code: "planning_relationship_conflict", detail: relationshipRole.error, related: [] }] : [],
    ...targetHeaders.error ? [{ code: "planning_relationship_conflict", detail: targetHeaders.error, related: [] }] : [],
    ...nonRelationshipHeaders.error ? [{ code: "planning_relationship_conflict", detail: nonRelationshipHeaders.error, related: [] }] : [],
    ...parentScan.errors,
    ...scannedTables.errors,
    ...structuredRelationships.errors,
    ...acceptanceErrors
  ];
  const table = [
    ...scannedTables.children,
    ...structuredRelationships.children
  ];
  const metadataHasAcceptanceSignal = deepEntries(parsed.metadata).some((entry) => [...ACCEPTANCE_WORDS].some((word) => entry.path.join("_").includes(word)));
  const nestedCanonicalPlanningSignal = hasNestedCanonicalPlanningSignal(parsed.metadata);
  const typedPlanningArtifact = PLANNING_ARTIFACT_TYPES.has(type);
  const hasPlanningSignals = lane !== "unknown" || declaredProjection.values.length > 0 || currentBody.values.length > 0 || identity2.explicit || isAcceptance || parentIds.length > 0 || table.length > 0 || bodyGateObservations.length > 0 || metadataHasAcceptanceSignal || nestedCanonicalPlanningSignal || topLevel || typedPlanningArtifact || relationshipErrors.length > 0 || hasRawPlanningSignal(parsed.metadata, type) || topEntries(parsed.metadata, [
    "child_relationship_role",
    "child_target_column",
    "relationship_role",
    "relationship_target_column",
    "rollup_target_column"
  ]).length > 0;
  const nonArtifact = nonArtifactRequested && nonArtifactRationale && !hasPlanningSignals;
  const structuredSurface = parsed.structured || table.length > 0 || currentBody.values.length > 0;
  const structured = parsed.parseError === void 0 && (nonArtifact || structuredSurface && hasPlanningSignals);
  const state = lane !== "unknown" ? lane : declaredProjection.values.length > 0 ? declared : currentBody.state;
  return {
    acceptance: isAcceptance,
    bodyGateObservations,
    bodyProjection: currentBody,
    childRelationshipRole: relationshipRole.role,
    content: source.content,
    declared,
    declaredClass: lifecycle(source.declaredClass),
    declaredProjection,
    id: identity2.id,
    lane,
    metadata: parsed.metadata,
    nonArtifact,
    nonArtifactRationale,
    nonArtifactRequested,
    parentIds,
    parentReferences: parentScan.references,
    ...parsed.parseError === void 0 ? {} : { parseError: parsed.parseError },
    path: source.path,
    relationshipErrors,
    state,
    structured,
    tableChildren: table,
    topLevel,
    type
  };
}
function finding(code, artifact, detail, related = []) {
  return { code, detail, path: artifact.path, related: [...new Set(related)].sort(), subject: artifact.id };
}
function gateKind(path, fallback = "acceptance") {
  const words = path.flatMap((part) => normalize(part).split(" "));
  for (const kind of ["holdout", "review", "qa", "acceptance"]) if (words.includes(kind)) return kind;
  return fallback;
}
function gateHasRationale(metadata, kind, outcomePath) {
  const outcomeContainer = outcomePath.slice(0, -1).join(".");
  return deepEntries(metadata).some((entry) => {
    const last = entry.path.at(-1) ?? "";
    const rationaleFields = /* @__PURE__ */ new Set(["justification", "rationale", "reason"]);
    const base = last.startsWith(`${kind}_`) ? last.slice(kind.length + 1) : last;
    if (!rationaleFields.has(base) || !scalar(entry.value)) return false;
    return entry.path.slice(0, -1).join(".") === outcomeContainer;
  });
}
function embeddedGateObservations(parent) {
  const candidates = [];
  const stateFields = /* @__PURE__ */ new Set([
    "current_lifecycle",
    "current_phase",
    "current_stage",
    "current_state",
    "current_status",
    "implementation_status",
    "lifecycle",
    "phase",
    "stage",
    "state",
    "status"
  ]);
  const outcomeFields = /* @__PURE__ */ new Set(["outcome", "result", "verdict"]);
  for (const entry of deepEntries(parent.metadata)) {
    const last = entry.path.at(-1) ?? "";
    const joined = entry.path.join("_");
    const hasAcceptance = [...ACCEPTANCE_WORDS].some((word) => joined.includes(word));
    const scopeKind = [...entry.path].reverse().flatMap((part) => [...ACCEPTANCE_WORDS].filter((word) => part === word || part === `${word}s`)).at(0);
    if (scopeKind && (last === scopeKind || last === `${scopeKind}s` || /^\d+$/.test(last))) {
      candidates.push({
        explicit: true,
        kind: scopeKind,
        rationale: gateHasRationale(parent.metadata, scopeKind, entry.path),
        ref: `${parent.path}#${entry.path.join(".")}`,
        scope: `${scopeKind}\0${entry.path.slice(0, -1).join(".")}`,
        state: acceptance(scalar(entry.value))
      });
      continue;
    }
    const genericField = stateFields.has(last);
    const explicitField = outcomeFields.has(last) || [...ACCEPTANCE_WORDS].some((word) => (/* @__PURE__ */ new Set([...outcomeFields, ...stateFields])).has(last.replace(`${word}_`, "")) && last.startsWith(`${word}_`));
    const stateField = genericField || explicitField;
    if (!hasAcceptance || !stateField) continue;
    const kind = gateKind(entry.path);
    candidates.push({
      explicit: explicitField,
      kind,
      rationale: gateHasRationale(parent.metadata, kind, entry.path),
      ref: `${parent.path}#${entry.path.join(".")}`,
      scope: `${kind}\0${entry.path.slice(0, -1).join(".")}`,
      state: acceptance(scalar(entry.value))
    });
  }
  const explicitScopes = new Set(candidates.filter((candidate) => candidate.explicit).map((candidate) => candidate.scope));
  return candidates.filter((candidate) => candidate.explicit || !explicitScopes.has(candidate.scope)).map(({ kind, rationale, ref, state }) => ({ kind, rationale, ref, state }));
}
function artifactGateObservations(artifact) {
  const explicit = topEntries(artifact.metadata, EXPLICIT_ACCEPTANCE_FIELDS);
  const selected = explicit.length > 0 ? explicit : topEntries(artifact.metadata, ["status"]);
  const kind = gateKind([artifact.type, artifact.path], artifact.type);
  const rationale = topValues(artifact.metadata, ["justification", "rationale", "reason"]).length > 0;
  const direct = selected.length === 0 ? [{ kind, rationale, ref: artifact.path, state: "unknown" }] : selected.map(([, value]) => ({
    kind,
    rationale,
    ref: artifact.path,
    state: acceptance(scalar(value))
  }));
  return [...direct, ...embeddedGateObservations(artifact), ...artifact.bodyGateObservations];
}
function acceptanceGates(parent, artifacts) {
  const observations = [...embeddedGateObservations(parent), ...parent.bodyGateObservations];
  for (const artifact of artifacts) {
    if (!artifact.acceptance || artifact.state === "archived") continue;
    if (!artifact.parentIds.some((id) => normalizedId(id) === normalizedId(parent.id))) continue;
    observations.push(...artifactGateObservations(artifact));
  }
  const grouped = /* @__PURE__ */ new Map();
  for (const observation of observations) {
    const current = grouped.get(observation.kind) ?? [];
    current.push(observation);
    grouped.set(observation.kind, current);
  }
  return [...grouped.entries()].map(([kind, values]) => {
    const states = [...new Set(values.map((value) => value.state))].sort();
    const unreasonedExemption = values.some((value) => value.state === "not_applicable" && !value.rationale);
    const state = states.includes("failed") ? "failed" : states.includes("unrun") ? "unrun" : states.includes("unknown") || unreasonedExemption ? "unknown" : states.includes("not_applicable") ? "not_applicable" : "passed";
    return {
      kind,
      refs: unique(values.map((value) => value.ref)).sort(),
      state,
      states
    };
  }).sort((left, right) => left.kind.localeCompare(right.kind));
}
function sameProjection(left, right) {
  return left === "unknown" || right === "unknown" || left === right;
}
function addRelationship(childrenByParent, parent, child) {
  const children = childrenByParent.get(parent) ?? /* @__PURE__ */ new Set();
  children.add(child);
  childrenByParent.set(parent, children);
}
function relationshipCycles(childrenByParent) {
  const nodes = /* @__PURE__ */ new Set();
  for (const [parent, children] of childrenByParent) {
    nodes.add(parent);
    for (const child of children) nodes.add(child);
  }
  const indexByNode = /* @__PURE__ */ new Map();
  const lowLink = /* @__PURE__ */ new Map();
  const onStack = /* @__PURE__ */ new Set();
  const stack = [];
  const cycles = [];
  let nextIndex = 0;
  const visit = (node) => {
    const nodeIndex = nextIndex;
    nextIndex += 1;
    indexByNode.set(node, nodeIndex);
    lowLink.set(node, nodeIndex);
    stack.push(node);
    onStack.add(node);
    const children = [...childrenByParent.get(node) ?? []].sort((left, right) => left.path.localeCompare(right.path));
    for (const child of children) {
      if (!indexByNode.has(child)) {
        visit(child);
        lowLink.set(node, Math.min(lowLink.get(node) ?? nodeIndex, lowLink.get(child) ?? nodeIndex));
      } else if (onStack.has(child)) {
        lowLink.set(node, Math.min(lowLink.get(node) ?? nodeIndex, indexByNode.get(child) ?? nodeIndex));
      }
    }
    if (lowLink.get(node) !== nodeIndex) return;
    const component = [];
    while (stack.length > 0) {
      const member = stack.pop();
      if (!member) break;
      onStack.delete(member);
      component.push(member);
      if (member === node) break;
    }
    const selfLoop = component.length === 1 && Boolean(childrenByParent.get(node)?.has(node));
    if (component.length > 1 || selfLoop) {
      cycles.push(component.sort((left, right) => left.path.localeCompare(right.path)));
    }
  };
  for (const node of [...nodes].sort((left, right) => left.path.localeCompare(right.path))) {
    if (!indexByNode.has(node)) visit(node);
  }
  return cycles.sort((left, right) => (left[0]?.path ?? "").localeCompare(right[0]?.path ?? ""));
}
function isPlanningTextPath(path) {
  return TEXT_EXTENSIONS.has(extname2(path).toLocaleLowerCase("und"));
}
function auditPlanningArtifacts(sources, planningRootCount = sources.length > 0 ? 1 : 0) {
  const artifacts = sources.map(parseArtifact);
  const findings = [];
  for (const artifact of artifacts) {
    if (artifact.nonArtifactRequested && !artifact.nonArtifact) {
      findings.push(finding(
        "planning_input_unparsed",
        artifact,
        artifact.nonArtifactRationale ? "non-artifact classification conflicts with lifecycle, identity, relationship, table-child, or acceptance signals" : "non-artifact classification requires an explicit structured rationale and cannot be established by class label alone"
      ));
    } else if (!artifact.structured && !artifact.nonArtifact) {
      findings.push(finding(
        "planning_input_unparsed",
        artifact,
        `planning input could not be structurally interpreted: ${artifact.parseError ?? "no lifecycle, relationship, or explicit non-artifact classification"}`
      ));
    }
    if (artifact.structured && !artifact.nonArtifact) {
      for (const error of artifact.relationshipErrors) {
        findings.push(finding(
          error.code,
          artifact,
          error.detail,
          error.related
        ));
      }
    }
    if (artifact.declaredClass === "archived" && artifact.lane !== "archived" && artifact.declared !== "archived") {
      findings.push(finding(
        "archive_classification_conflict",
        artifact,
        "bundle class claims archive but neither physical lane nor artifact lifecycle proves archival state"
      ));
    }
    if (!artifact.structured || artifact.nonArtifact) continue;
    const declaredProjection = artifact.declaredProjection;
    const declaredStates = declaredProjection.states.filter((state) => state !== "unknown");
    if (declaredProjection.values.length > 0 && artifact.declared === "unknown") {
      findings.push(finding(
        "lifecycle_state_unknown",
        artifact,
        declaredStates.length > 1 ? `declared lifecycle fields have conflicting recognized projections: ${declaredStates.join(", ")}` : declaredStates.length === 1 ? `declared lifecycle fields mix recognized and unrecognized projections: ${declaredProjection.values.map((value) => JSON.stringify(value)).join(", ")}` : `declared lifecycle ${declaredProjection.values.map((value) => JSON.stringify(value)).join(", ")} is outside the recognized vocabulary`
      ));
    } else if (declaredProjection.values.length === 0 && artifact.state === "unknown" && !artifact.acceptance) {
      findings.push(finding(
        "lifecycle_state_unknown",
        artifact,
        "planning artifact has no recognized lifecycle in its lane, metadata, or current body"
      ));
    }
    if (artifact.lane !== "unknown" && artifact.declared !== "unknown" && !sameProjection(artifact.lane, artifact.declared)) {
      findings.push(finding(
        "lane_status_conflict",
        artifact,
        `physical lane is ${artifact.lane} but declared lifecycle is ${artifact.declared}`
      ));
    }
    const bodyProjection2 = artifact.bodyProjection;
    const bodyStates = bodyProjection2.states.filter((state) => state !== "unknown");
    if (bodyProjection2.values.length > 0 && bodyProjection2.state === "unknown") {
      findings.push(finding(
        "body_projection_conflict",
        artifact,
        bodyStates.length > 1 ? `current body has conflicting recognized lifecycle projections: ${bodyStates.join(", ")}` : `current body includes an unrecognized lifecycle projection: ${bodyProjection2.values.map((value) => JSON.stringify(value)).join(", ")}`
      ));
    } else if (bodyProjection2.state !== "unknown" && artifact.state !== "unknown" && !sameProjection(artifact.state, bodyProjection2.state)) {
      findings.push(finding(
        "body_projection_conflict",
        artifact,
        `effective lifecycle is ${artifact.state} but current body projects ${bodyProjection2.state}`
      ));
    }
  }
  const byId = /* @__PURE__ */ new Map();
  for (const artifact of artifacts) {
    if (!artifact.structured || artifact.nonArtifact) continue;
    const key = normalizedId(artifact.id);
    const current = byId.get(key) ?? [];
    current.push(artifact);
    byId.set(key, current);
  }
  for (const duplicates of byId.values()) {
    if (duplicates.length < 2) continue;
    for (const artifact of duplicates) {
      findings.push(finding(
        "duplicate_artifact_id",
        artifact,
        `artifact id ${JSON.stringify(artifact.id)} resolves from ${duplicates.length} artifacts`,
        duplicates.filter((item) => item !== artifact).map((item) => item.path)
      ));
    }
  }
  for (const artifact of artifacts) {
    if (!artifact.structured || artifact.acceptance || artifact.nonArtifact) continue;
    if (artifact.childRelationshipRole !== "child_parentage" || !LEAF_ARTIFACT_TYPES.has(artifact.type) || artifact.tableChildren.length === 0) continue;
    findings.push(finding(
      "planning_relationship_conflict",
      artifact,
      `leaf ${artifact.type} artifact declares ${artifact.tableChildren.length} child projection${artifact.tableChildren.length === 1 ? "" : "s"}`,
      artifact.tableChildren.map((child) => child.ref)
    ));
  }
  const childrenByParent = /* @__PURE__ */ new Map();
  const explicitParents = /* @__PURE__ */ new Map();
  const archiveBoundaryEdges = /* @__PURE__ */ new Set();
  const archiveCompatible = (parent, child, ref) => {
    const parentArchived = parent.state === "archived";
    const childArchived = child.state === "archived";
    if (parentArchived === childArchived) return true;
    const key = `${parent.path}\0${child.path}`;
    if (!archiveBoundaryEdges.has(key)) {
      archiveBoundaryEdges.add(key);
      findings.push(finding(
        "planning_relationship_conflict",
        child,
        `partial archive graph: child is ${childArchived ? "archived" : "live"} but parent ${JSON.stringify(parent.id)} is ${parentArchived ? "archived" : "live"}`,
        [parent.path, ref]
      ));
    }
    return false;
  };
  for (const child of artifacts) {
    if (!child.structured || child.acceptance || child.nonArtifact) continue;
    const resolved = /* @__PURE__ */ new Set();
    for (const observation of child.parentReferences) {
      const parentId = observation.id;
      const matches = (byId.get(normalizedId(parentId)) ?? []).filter((item) => !item.acceptance && !item.nonArtifact);
      if (matches.length === 0) {
        findings.push(finding(
          "orphan_parent_reference",
          child,
          `declared parent ${JSON.stringify(parentId)} does not resolve to an artifact`
        ));
        continue;
      }
      if (matches.length > 1) {
        findings.push(finding(
          "planning_relationship_conflict",
          child,
          `declared parent ${JSON.stringify(parentId)} resolves ambiguously to ${matches.length} artifacts`,
          matches.map((item) => item.path)
        ));
        continue;
      }
      const parent = matches[0];
      if (!parent) continue;
      if (observation.state !== "unknown" && parent.state !== "unknown" && !sameProjection(observation.state, parent.state)) {
        findings.push(finding(
          "parent_child_projection_conflict",
          child,
          `declared parent ${JSON.stringify(parent.id)} is ${parent.state} but the parent reference projects ${observation.state}`,
          [parent.path, observation.ref]
        ));
      }
      if (!archiveCompatible(parent, child, observation.ref)) continue;
      resolved.add(parent);
      addRelationship(childrenByParent, parent, child);
    }
    explicitParents.set(child, resolved);
    if (child.topLevel && child.parentReferences.length > 0) {
      findings.push(finding(
        "planning_relationship_conflict",
        child,
        "top-level artifact also declares parentage",
        child.parentReferences.map((reference) => reference.ref)
      ));
    }
    if (resolved.size > 1) {
      findings.push(finding(
        "planning_relationship_conflict",
        child,
        `child resolves to ${resolved.size} distinct explicit parents`,
        [...resolved].map((item) => item.path)
      ));
    }
  }
  for (const gate of artifacts) {
    if (!gate.structured || !gate.acceptance || gate.nonArtifact) continue;
    if (gate.parentIds.length === 0) {
      findings.push(finding(
        "planning_relationship_unresolved",
        gate,
        "acceptance artifact is not paired to a parent"
      ));
      continue;
    }
    const matchedParents = /* @__PURE__ */ new Map();
    for (const observation of gate.parentReferences) {
      for (const parent of byId.get(normalizedId(observation.id)) ?? []) {
        if (parent.acceptance || parent.nonArtifact) continue;
        matchedParents.set(parent.path, parent);
        if (observation.state !== "unknown" && parent.state !== "unknown" && !sameProjection(observation.state, parent.state)) {
          findings.push(finding(
            "parent_child_projection_conflict",
            gate,
            `declared parent ${JSON.stringify(parent.id)} is ${parent.state} but the acceptance reference projects ${observation.state}`,
            [parent.path, observation.ref]
          ));
        }
      }
    }
    const eligibleParents = [...matchedParents.values()].filter((parent) => gate.state === "archived" || archiveCompatible(parent, gate, `${gate.path}#parent`)).sort((left, right) => left.path.localeCompare(right.path));
    if (matchedParents.size === 0) {
      findings.push(finding(
        "orphan_parent_reference",
        gate,
        `acceptance parent references do not resolve: ${gate.parentIds.map((id) => JSON.stringify(id)).join(", ")}`
      ));
    } else if (eligibleParents.length === 0) {
      findings.push(finding(
        "planning_relationship_unresolved",
        gate,
        "live acceptance artifact resolves only to archived parents",
        [...matchedParents.keys()].sort()
      ));
    } else if (eligibleParents.length > 1) {
      findings.push(finding(
        "planning_relationship_conflict",
        gate,
        `acceptance artifact resolves to ${eligibleParents.length} parents`,
        eligibleParents.map((parent) => parent.path)
      ));
    }
  }
  for (const parent of artifacts) {
    if (!parent.structured || parent.acceptance || parent.nonArtifact) continue;
    for (const tableChild of parent.tableChildren) {
      const matches = (byId.get(normalizedId(tableChild.id)) ?? []).filter((item) => !item.acceptance && !item.nonArtifact);
      if (matches.length === 0) {
        findings.push(finding(
          "planning_relationship_unresolved",
          parent,
          `declared child ${JSON.stringify(tableChild.id)} does not resolve to an artifact`,
          [tableChild.ref]
        ));
        continue;
      }
      if (matches.length > 1) {
        findings.push(finding(
          "planning_relationship_conflict",
          parent,
          `declared child ${JSON.stringify(tableChild.id)} resolves ambiguously to ${matches.length} artifacts`,
          [tableChild.ref, ...matches.map((item) => item.path)]
        ));
        continue;
      }
      const child = matches[0];
      if (!child) continue;
      if (tableChild.state !== "unknown" && child.state !== "unknown" && !sameProjection(tableChild.state, child.state)) {
        findings.push(finding(
          "parent_child_projection_conflict",
          parent,
          `${child.id} is ${child.state} but the ${parent.childRelationshipRole === "rollup_projection" ? "rollup" : "parent"} projects ${tableChild.state}`,
          [child.path, tableChild.ref]
        ));
      }
      if (parent.childRelationshipRole === "rollup_projection") continue;
      if (!archiveCompatible(parent, child, tableChild.ref)) continue;
      if (child.topLevel) {
        findings.push(finding(
          "planning_relationship_conflict",
          child,
          `top-level artifact is projected as a child of ${JSON.stringify(parent.id)}`,
          [parent.path, tableChild.ref]
        ));
      }
      const parents = explicitParents.get(child) ?? /* @__PURE__ */ new Set();
      if (parents.size > 0 && !parents.has(parent)) {
        findings.push(finding(
          "planning_relationship_conflict",
          child,
          `${parent.id} projects this child but its explicit parent resolves elsewhere`,
          [parent.path, tableChild.ref, ...[...parents].map((item) => item.path)]
        ));
      }
      addRelationship(childrenByParent, parent, child);
    }
  }
  for (const cycle of relationshipCycles(childrenByParent)) {
    for (const member of cycle) {
      findings.push(finding(
        "planning_relationship_conflict",
        member,
        `planning relationship cycle contains ${cycle.length} artifact${cycle.length === 1 ? "" : "s"}`,
        cycle.filter((artifact) => artifact !== member).map((artifact) => artifact.path)
      ));
    }
  }
  for (const child of artifacts) {
    if (!child.structured || child.acceptance || child.nonArtifact || child.topLevel) continue;
    if (!LEAF_ARTIFACT_TYPES.has(child.type)) continue;
    const parents = [...childrenByParent.entries()].filter(([, children]) => children.has(child)).map(([parent]) => parent);
    if (parents.length === 0) {
      findings.push(finding(
        "planning_relationship_unresolved",
        child,
        "leaf planning artifact is not paired to exactly one parent; declare parent_id, place it in an exact parent child table, or mark top_level: true",
        child.parentIds
      ));
    } else if (parents.length > 1) {
      findings.push(finding(
        "planning_relationship_conflict",
        child,
        `leaf planning artifact resolves to ${parents.length} parents`,
        parents.map((parent) => parent.path)
      ));
    }
  }
  for (const parent of artifacts) {
    if (!parent.structured || parent.acceptance || parent.state === "archived" || parent.nonArtifact) continue;
    const children = [...childrenByParent.get(parent) ?? []].sort((left, right) => left.path.localeCompare(right.path));
    const started = children.filter((child) => (/* @__PURE__ */ new Set(["active", "done"])).has(child.state));
    const unfinished = children.filter((child) => child.state !== "done");
    if (parent.state === "done" && unfinished.length > 0) {
      findings.push(finding(
        "parent_child_projection_conflict",
        parent,
        `parent is done while ${unfinished.length}/${children.length} direct children are not done`,
        unfinished.map((child) => child.path)
      ));
    }
    if (parent.declared === "preexecution" && started.length > 0) {
      findings.push(finding(
        "preexecution_parent_has_started_children",
        parent,
        `parent is preexecution while ${started.length}/${children.length} direct children have started`,
        started.map((child) => child.path)
      ));
    }
    const gates = acceptanceGates(parent, artifacts);
    for (const gate of gates) {
      if (gate.states.length > 1) {
        findings.push(finding(
          "acceptance_gate_identity_conflict",
          parent,
          `${gate.kind} gate has conflicting projections: ${gate.states.join(", ")}`,
          gate.refs
        ));
      }
      if (gate.state === "unknown") {
        findings.push(finding(
          "acceptance_gate_unknown",
          parent,
          gate.states.includes("not_applicable") ? `${gate.kind} gate claims not_applicable without a structured rationale` : `${gate.kind} gate state is missing or outside the recognized vocabulary`,
          gate.refs
        ));
      }
    }
    const allChildrenDone = children.length > 0 && children.every((child) => child.state === "done");
    if (allChildrenDone && gates.length === 0) {
      findings.push(finding(
        "acceptance_gate_undiscovered",
        parent,
        `all ${children.length} direct children are done but no acceptance gate can be identified`,
        children.map((child) => child.path)
      ));
    }
    const unrun = gates.filter((gate) => gate.state === "unrun");
    const failed = gates.filter((gate) => gate.state === "failed");
    if (allChildrenDone && unrun.length > 0) {
      findings.push(finding(
        "acceptance_cascade_unexecuted",
        parent,
        `all ${children.length} direct children are done but ${unrun.length}/${gates.length} acceptance gates are unexecuted`,
        unrun.flatMap((gate) => gate.refs)
      ));
    }
    if (failed.length > 0) {
      findings.push(finding(
        "acceptance_failure_unpaid",
        parent,
        `${failed.length}/${gates.length} acceptance gates record failure`,
        failed.flatMap((gate) => gate.refs)
      ));
    }
    if (!allChildrenDone && parent.state === "done" && unrun.length > 0) {
      findings.push(finding(
        "completed_parent_unexecuted_acceptance",
        parent,
        `completed parent has ${unrun.length}/${gates.length} unexecuted acceptance gates`,
        unrun.flatMap((gate) => gate.refs)
      ));
    }
    if (allChildrenDone && gates.length > 0 && gates.every((gate) => (/* @__PURE__ */ new Set(["not_applicable", "passed"])).has(gate.state)) && parent.declared !== "done") {
      findings.push(finding(
        "parent_completion_stale",
        parent,
        `all ${children.length} direct children and all ${gates.length} acceptance gates are complete but the parent is ${parent.declared}`,
        gates.flatMap((gate) => gate.refs)
      ));
    }
  }
  const ordered = findings.sort((left, right) => left.code.localeCompare(right.code) || left.path.localeCompare(right.path) || left.detail.localeCompare(right.detail));
  const counts = Object.fromEntries(
    FINDING_CODES.map((code) => [code, ordered.filter((item) => item.code === code).length])
  );
  const status = planningRootCount === 0 ? "not_applicable" : ordered.length > 0 ? "fail" : "pass";
  return {
    artifactCount: artifacts.length,
    counts,
    exitCode: ordered.length > 0 ? 1 : 0,
    findings: ordered,
    planningRootCount,
    status,
    structuredArtifactCount: artifacts.filter((artifact) => artifact.structured).length
  };
}
function auditPlanningRepository(repository) {
  const root = resolve2(repository);
  assertDirectory(root);
  const planningRoots = discoverPlanningRoots(root);
  const sources = [];
  const appendEntry = (entry) => {
    const relativePath = relative2(root, entry.path).split(sep2).join("/");
    if (entry.kind !== "file" || !isPlanningTextPath(entry.path)) {
      sources.push({ content: "", path: relativePath });
      return;
    }
    let content = "";
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync2(entry.path));
    } catch {
      sources.push({ content: "", path: relativePath });
      return;
    }
    sources.push({ content: content.includes("\0") ? "" : content, path: relativePath });
  };
  for (const rootText of planningRoots) {
    const rootPath = resolve2(root, rootText);
    const rootStat = lstatSync2(rootPath);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      appendEntry({ kind: rootStat.isFile() ? "file" : rootStat.isSymbolicLink() ? "symlink" : "other", path: rootPath });
      continue;
    }
    for (const entry of listEntriesRecursively(rootPath)) appendEntry(entry);
  }
  return auditPlanningArtifacts(sources, planningRoots.length);
}

// src/closeout/bundle.ts
var execFileAsync = promisify(execFile);
var HEX64 = /^[0-9a-f]{64}$/;
var PLANNING_NAMES = /* @__PURE__ */ new Set([
  "planning",
  "plans",
  "roadmap",
  "project-management",
  "work-items",
  "work_items",
  "tasks",
  "stories",
  "epics",
  "slices",
  "issues"
]);
var PLANNING_KINDS = /* @__PURE__ */ new Set(["repo_files", "external_snapshot", "none"]);
var GATE_KINDS = /* @__PURE__ */ new Set([
  "isolated_clone",
  "repository_tests",
  "lint",
  "typecheck",
  "build",
  "planning_validation",
  "security_scan",
  "established_ci",
  "negative_control"
]);
var IGNORED_WALK = /* @__PURE__ */ new Set([".git", "node_modules", "vendor", ".venv", "venv", "dist", "build", ".cache"]);
var LOCAL_ACTION_KINDS = /* @__PURE__ */ new Set([
  "local_edit",
  "local_move",
  "recoverable_delete",
  "doc_update",
  "planning_record_update",
  "historical_conform",
  "handoff_update"
]);
var EXTERNAL_CLAIMS = /* @__PURE__ */ new Set(["ci_green_on_push", "deployed", "independently_qa_accepted"]);
function object3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function array2(value) {
  return Array.isArray(value) ? value : [];
}
function text(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function identity(value) {
  return canonicalIdentity(value);
}
function owned(value) {
  const normalized = identity(value);
  return normalized.length > 0 && !(/* @__PURE__ */ new Set([
    "unknown",
    "unowned",
    "unassigned",
    "none",
    "n/a",
    "na",
    "tbd",
    "not assigned",
    "not-assigned"
  ])).has(normalized);
}
function iso(value) {
  return isoTimestamp(value);
}
function executedText(value) {
  if (!text(value)) return false;
  return !(/* @__PURE__ */ new Set(["not run", "not executed", "not measured", "claim", "anything", "pass"])).has(value.trim().split(/\s+/).join(" ").toLocaleLowerCase("und"));
}
function posix(path) {
  return path.split(sep3).join("/");
}
function compareCodePoints2(left, right) {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference) return difference;
  }
  return leftPoints.length - rightPoints.length;
}
function sha256(bytes) {
  return createHash2("sha256").update(bytes).digest("hex");
}
function stableEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => stableEqual(value, right[index]));
  }
  const leftObject = object3(left);
  const rightObject = object3(right);
  if (!leftObject || !rightObject) return false;
  const leftKeys = Object.keys(leftObject).sort();
  const rightKeys = Object.keys(rightObject).sort();
  return stableEqual(leftKeys, rightKeys) && leftKeys.every((key) => stableEqual(leftObject[key], rightObject[key]));
}
function requireObject(value, keys, path, errors) {
  const item = object3(value);
  if (!item) {
    errors.push(`${path}: expected object`);
    return void 0;
  }
  for (const key of [...keys].sort()) if (!(key in item)) errors.push(`${path}.${key}: missing`);
  return item;
}
var nodeFilePort = {
  async readBytes(path) {
    return new Uint8Array(await readFile(path));
  },
  async readText(path) {
    return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path));
  },
  async exists(path) {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
  async isFile(path) {
    try {
      return (await lstat(path)).isFile();
    } catch {
      return false;
    }
  },
  async realpath(path) {
    return realpath(path);
  },
  async walk(root) {
    const rootPath = resolve3(root);
    const rows = [];
    async function visit(directory) {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_WALK.has(entry.name)) continue;
        const absolute = resolve3(directory, entry.name);
        const rel = posix(relative3(rootPath, absolute));
        if (entry.isSymbolicLink()) rows.push({ absolute, relative: rel, kind: "symlink" });
        else if (entry.isDirectory()) {
          rows.push({ absolute, relative: rel, kind: "directory" });
          await visit(absolute);
        } else if (entry.isFile()) rows.push({ absolute, relative: rel, kind: "file" });
      }
    }
    await visit(rootPath);
    return rows.sort((a, b) => compareCodePoints2(a.relative, b.relative));
  }
};
var nodeGitPort = {
  async run(repo, args, allowed = [0]) {
    try {
      const result = await execFileAsync("git", ["-C", repo, ...args], { encoding: "utf8" });
      return { code: 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
    } catch (error) {
      const failure = error;
      const result = {
        code: typeof failure.code === "number" ? failure.code : 128,
        stdout: (failure.stdout ?? "").trim(),
        stderr: (failure.stderr ?? failure.message ?? "").trim()
      };
      if (!allowed.includes(result.code)) throw new Error(result.stderr || `git ${args.join(" ")} exited ${result.code}`);
      return result;
    }
  }
};
var nodeBundlePorts = { files: nodeFilePort, git: nodeGitPort };
async function contained(files, root, candidate) {
  if (!text(candidate) || isAbsolute2(candidate)) return void 0;
  const lexical = resolve3(root, candidate);
  const rel = relative3(resolve3(root), lexical);
  if (rel === ".." || rel.startsWith(`..${sep3}`) || isAbsolute2(rel)) return void 0;
  try {
    const rootReal = await files.realpath(root);
    let existing = lexical;
    const tail = [];
    while (!await files.exists(existing) && dirname2(existing) !== existing) {
      tail.unshift(basename3(existing));
      existing = dirname2(existing);
    }
    const targetReal = resolve3(await files.realpath(existing), ...tail);
    const realRel = relative3(rootReal, targetReal);
    if (realRel === ".." || realRel.startsWith(`..${sep3}`) || isAbsolute2(realRel)) return void 0;
    return targetReal;
  } catch {
    return lexical;
  }
}
async function loadRef(files, base, value, path, errors, allowPlaceholders) {
  const ref = requireObject(value, ["path", "sha256"], path, errors);
  if (!ref) return {};
  if (allowPlaceholders && [ref.path, ref.sha256].some((entry) => typeof entry === "string" && entry.includes("<"))) return {};
  const target = await contained(files, base, ref.path);
  if (!target) {
    errors.push(`${path}.path: must resolve inside the bundle directory`);
    return {};
  }
  if (!await files.isFile(target)) {
    errors.push(`${path}.path: file not found or not a regular file: ${target}`);
    return { file: target };
  }
  const bytes = await files.readBytes(target);
  if (!allowPlaceholders) {
    if (typeof ref.sha256 !== "string" || !HEX64.test(ref.sha256)) errors.push(`${path}.sha256: required lowercase SHA-256`);
    else if (sha256(bytes) !== ref.sha256) errors.push(`${path}.sha256: digest mismatch`);
  }
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!object3(parsed)) errors.push(`${path}.path: expected JSON object`);
    const data = object3(parsed);
    return data ? { data, file: target } : { file: target };
  } catch (error) {
    errors.push(`${path}.path: ${error instanceof Error ? error.message : String(error)}`);
    return { file: target };
  }
}
async function evidenceRef(files, base, ref, path, errors, allowPlaceholders, recordType) {
  const loaded = await loadRef(files, base, ref, path, errors, allowPlaceholders);
  if (loaded.data && recordType && loaded.data.record_type !== recordType) {
    errors.push(`${path}: expected evidence record_type ${recordType}`);
  }
  return loaded.data;
}
async function repositoryIdentity2(repo, git2) {
  const remote = (await git2.run(repo, ["config", "--get", "remote.origin.url"], [0, 1])).stdout;
  if (remote && !remote.startsWith("/") && !remote.startsWith("file://")) {
    const path = remote.includes("://") ? new URL(remote).pathname.replace(/^\/+|\/+$/g, "") : remote.split(":", 2).at(-1) ?? "";
    const normalized = path.replace(/\.git$/, "").replace(/\/+$/, "");
    if (normalized.includes("/")) return normalized;
  }
  return basename3(repo);
}
async function discoverPlanningRoots2(repo, files) {
  const rows = await files.walk(repo);
  const directories = rows.filter((row) => row.kind === "directory");
  const childrenByDirectory = /* @__PURE__ */ new Map();
  for (const row of directories) {
    const parent = dirname2(row.relative);
    const children = childrenByDirectory.get(parent) ?? /* @__PURE__ */ new Set();
    children.add(basename3(row.relative).toLocaleLowerCase("und"));
    childrenByDirectory.set(parent, children);
  }
  const candidates = /* @__PURE__ */ new Set();
  for (const row of rows) {
    if (row.kind !== "directory" && isCanonicalPlanningFileName(row.relative)) {
      candidates.add(row.relative);
    }
  }
  for (const row of directories) {
    const parts = row.relative.split("/");
    if (PLANNING_NAMES.has(parts.at(-1)?.toLocaleLowerCase("und") ?? "")) candidates.add(row.relative);
    const children = childrenByDirectory.get(row.relative) ?? /* @__PURE__ */ new Set();
    if ([...children].filter((name) => PLANNING_LANE_NAMES.has(name)).length >= 2) candidates.add(row.relative);
  }
  const minimal = [...candidates].sort((a, b) => a.split("/").length - b.split("/").length || compareCodePoints2(a, b));
  return new Set(minimal.filter((candidate, index) => !minimal.slice(0, index).some((parent) => candidate === parent || candidate.startsWith(`${parent}/`))));
}
async function validateCriteria(bundle, report, base, files, clean, allowPlaceholders, errors) {
  const path = "$.criteria_discovery";
  const proof = requireObject(
    bundle.criteria_discovery,
    ["source_kind", "request_source", "source_refs", "request_sha256", "discovered_count", "none_found", "criteria_ids"],
    path,
    errors
  );
  if (!proof) return;
  if (!(/* @__PURE__ */ new Set(["exact_bytes", "reference_only"])).has(String(proof.source_kind))) errors.push(`${path}.source_kind: expected exact_bytes or reference_only`);
  if (clean && proof.source_kind !== "exact_bytes") errors.push(`${path}.source_kind: CLEAN requires exact operative request bytes`);
  if (proof.source_kind === "exact_bytes") {
    const ref = requireObject(proof.request_source, ["path", "sha256"], `${path}.request_source`, errors);
    if (ref && !(allowPlaceholders && String(ref.path).includes("<"))) {
      const request = await contained(files, base, ref.path);
      if (!request || !await files.isFile(request)) errors.push(`${path}.request_source.path: file not found, not a regular file, or outside bundle directory`);
      else {
        const digest = sha256(await files.readBytes(request));
        if (digest !== ref.sha256) errors.push(`${path}.request_source.sha256: digest mismatch`);
        if (digest !== proof.request_sha256) errors.push(`${path}.request_source: exact request bytes do not match request_sha256`);
      }
    }
  } else if (proof.request_source !== null) errors.push(`${path}.request_source: reference_only requires null`);
  if (!Array.isArray(proof.criteria_ids) || !array2(proof.criteria_ids).every(text)) errors.push(`${path}.criteria_ids: required string array`);
  if (!Number.isInteger(proof.discovered_count) || Number(proof.discovered_count) < 0) errors.push(`${path}.discovered_count: required nonnegative integer`);
  if (typeof proof.none_found !== "boolean") errors.push(`${path}.none_found: required boolean`);
  const ids = array2(proof.criteria_ids).filter(text);
  const refs = array2(proof.source_refs);
  if (refs.length === 0) errors.push(`${path}.source_refs: required nonempty digest-bound evidence array`);
  if (!allowPlaceholders && (typeof proof.request_sha256 !== "string" || !HEX64.test(proof.request_sha256))) errors.push(`${path}.request_sha256: required lowercase SHA-256`);
  if (proof.discovered_count !== ids.length) errors.push(`${path}: discovered_count (${String(proof.discovered_count)}) != criteria_ids (${ids.length})`);
  if (proof.none_found !== (ids.length === 0)) errors.push(`${path}.none_found: must be true exactly when discovered_count is zero`);
  const reportIds = array2(report.acceptance_criteria).map((item) => object3(item)?.id).filter(text).sort();
  if (!stableEqual([...ids].sort(), reportIds)) errors.push(`${path}.criteria_ids: must equal report acceptance_criteria ids`);
  const records = await Promise.all(refs.map((ref, index) => evidenceRef(files, base, ref, `${path}.source_refs[${index}]`, errors, allowPlaceholders, "mister-clean.criteria-source")));
  for (const [index, record] of records.entries()) if (record && (!Array.isArray(record.criteria_ids) || !array2(record.criteria_ids).every(text))) {
    errors.push(`${path}.source_refs[${index}]: criteria-source record requires criteria_ids string array`);
  }
  if (!allowPlaceholders && !records.some((record) => record !== void 0 && record.request_ref === bundle.request_ref && record.request_sha256 === proof.request_sha256 && stableEqual([...array2(record.criteria_ids)].sort(), [...ids].sort()))) {
    errors.push(`${path}.source_refs: no bound source record matches request_ref, request_sha256, and criteria_ids`);
  }
}
async function validatePlanning(bundle, repo, files, clean, allowPlaceholders, errors) {
  const path = "$.planning_discovery";
  const planning = requireObject(bundle.planning_discovery, ["unknown", "systems"], path, errors);
  if (!planning) return;
  if (clean && planning.unknown !== false) errors.push(`${path}.unknown: CLEAN requires false`);
  const systems = array2(planning.systems);
  if (systems.length === 0) {
    errors.push(`${path}.systems: required nonempty array`);
    return;
  }
  const discovered = repo ? await discoverPlanningRoots2(repo, files) : /* @__PURE__ */ new Set();
  const declared = /* @__PURE__ */ new Set();
  const none = systems.filter((item) => object3(item)?.kind === "none");
  if (none.length && systems.length !== 1) errors.push(`${path}.systems: kind=none is only valid as the sole discovered planning system`);
  if (repo && none.length && discovered.size) errors.push(`${path}.systems: kind=none contradicts live planning candidates ${JSON.stringify([...discovered].sort())}`);
  const systemIds = /* @__PURE__ */ new Set();
  const globalArtifacts = /* @__PURE__ */ new Set();
  const planningSourcePaths = /* @__PURE__ */ new Set();
  const planningSources = [];
  for (const [index, raw] of systems.entries()) {
    const spath = `${path}.systems[${index}]`;
    const system = requireObject(raw, ["id", "kind", "sources", "schema_sources", "validators", "corpus"], spath, errors);
    if (!system) continue;
    if (!text(system.id)) errors.push(`${spath}.id: required`);
    else if (systemIds.has(system.id)) errors.push(`${spath}.id: duplicate ${JSON.stringify(system.id)}`);
    else systemIds.add(system.id);
    if (!PLANNING_KINDS.has(String(system.kind))) errors.push(`${spath}.kind: expected one of ${JSON.stringify([...PLANNING_KINDS].sort())}`);
    for (const field of ["sources", "schema_sources", "validators"]) {
      if (!Array.isArray(system[field]) || array2(system[field]).length === 0 || !array2(system[field]).every(text)) {
        errors.push(`${spath}.${field}: required nonempty string array`);
      }
    }
    const corpus = requireObject(system.corpus, ["roots", "include_globs", "total", "classified", "unclassified", "artifacts"], `${spath}.corpus`, errors);
    if (!corpus) continue;
    if (!Array.isArray(corpus.roots) || !array2(corpus.roots).every(text)) errors.push(`${spath}.corpus.roots: required string array`);
    if (!Array.isArray(corpus.include_globs) || !array2(corpus.include_globs).every(text)) errors.push(`${spath}.corpus.include_globs: required string array`);
    if (!Array.isArray(corpus.artifacts)) errors.push(`${spath}.corpus.artifacts: required array`);
    const roots = array2(corpus.roots).filter(text);
    const includeGlobs = array2(corpus.include_globs).filter(text);
    const artifacts = array2(corpus.artifacts);
    if (system.kind === "repo_files" && roots.length === 0) errors.push(`${spath}.corpus.roots: repo_files requires at least one repository root`);
    if (system.kind === "repo_files" && includeGlobs.length === 0) errors.push(`${spath}.corpus.include_globs: repo_files requires at least one discovery glob`);
    if (system.kind === "none" && (roots.length || includeGlobs.length)) errors.push(`${spath}.corpus: kind=none requires empty roots and include_globs`);
    if (system.kind === "repo_files") roots.forEach((root) => declared.add(root.replace(/\/$/, "")));
    const seen = /* @__PURE__ */ new Set();
    let unclassified = 0;
    for (const [artifactIndex, rawArtifact] of artifacts.entries()) {
      const apath = `${spath}.corpus.artifacts[${artifactIndex}]`;
      const artifact = requireObject(rawArtifact, ["path", "class", "sha256"], apath, errors);
      if (!artifact) continue;
      if (!text(artifact.path) || seen.has(artifact.path)) errors.push(`${apath}.path: required unique repository-relative path`);
      else {
        seen.add(artifact.path);
        if (globalArtifacts.has(artifact.path)) errors.push(`${apath}.path: artifact appears in more than one planning system`);
        globalArtifacts.add(artifact.path);
      }
      if (!text(artifact.class)) {
        errors.push(`${apath}.class: required explicit class`);
        unclassified += 1;
      } else if ((/* @__PURE__ */ new Set(["not assessed", "not_assessed", "unclassified", "unknown"])).has(identity(artifact.class))) {
        unclassified += 1;
      }
      if (text(artifact.class) && isNonArtifactPlanningClass(artifact.class) && !text(artifact.classification_rationale)) {
        errors.push(`${apath}.classification_rationale: non-artifact class requires an explicit rationale`);
      }
      if (!allowPlaceholders && (typeof artifact.sha256 !== "string" || !HEX64.test(artifact.sha256))) errors.push(`${apath}.sha256: required lowercase SHA-256`);
      if (repo && system.kind === "repo_files" && text(artifact.path)) {
        const target = await contained(files, repo, artifact.path);
        if (!target || !await files.isFile(target)) errors.push(`${apath}.path: missing, not a regular file, or outside repository`);
        else if (typeof artifact.sha256 === "string" && HEX64.test(artifact.sha256) && sha256(await files.readBytes(target)) !== artifact.sha256) errors.push(`${apath}.sha256: live digest mismatch`);
      }
    }
    if (corpus.total !== seen.size) errors.push(`${spath}.corpus.total (${String(corpus.total)}) != unique artifacts (${seen.size})`);
    if (corpus.classified !== seen.size - unclassified) errors.push(`${spath}.corpus.classified (${String(corpus.classified)}) != classified artifact rows (${seen.size - unclassified})`);
    if (corpus.unclassified !== unclassified) errors.push(`${spath}.corpus.unclassified (${String(corpus.unclassified)}) != unclassified artifact rows (${unclassified})`);
    if (clean && corpus.unclassified !== 0) errors.push(`${spath}.corpus.unclassified: CLEAN requires zero`);
    if (repo && system.kind === "repo_files") {
      const live = /* @__PURE__ */ new Set();
      const repositoryRoot = await files.realpath(repo);
      for (const root of roots) {
        const target = await contained(files, repo, root);
        if (!target || !await files.exists(target)) {
          errors.push(`${spath}.corpus.roots: missing or outside repository: ${JSON.stringify(root)}`);
          continue;
        }
        if (await files.isFile(target)) live.add(posix(relative3(repositoryRoot, target)));
        else (await files.walk(target)).filter((row) => row.kind !== "directory").forEach((row) => live.add(posix(relative3(repositoryRoot, row.absolute))));
      }
      if (!stableEqual([...live].sort(), [...seen].sort())) errors.push(`${spath}.corpus: live census mismatch missing_from_bundle=${JSON.stringify([...live].filter((item) => !seen.has(item)).sort())} absent_from_live=${JSON.stringify([...seen].filter((item) => !live.has(item)).sort())}`);
      if (clean) {
        for (const rawArtifact of artifacts) {
          const artifact = object3(rawArtifact);
          if (!artifact || !text(artifact.path)) continue;
          if (!isPlanningTextPath(artifact.path)) {
            if (!text(artifact.class) || !isNonArtifactPlanningClass(artifact.class) || !text(artifact.classification_rationale)) {
              errors.push(`${spath}.corpus: unsupported planning entry ${artifact.path} requires an explicit non-artifact class and classification_rationale`);
            }
            continue;
          }
          const target = await contained(files, repo, artifact.path);
          if (!target || !await files.exists(target)) continue;
          let content;
          try {
            content = await files.readText(target);
          } catch {
            errors.push(`${spath}.corpus: planning entry ${artifact.path} is not valid UTF-8 text`);
            continue;
          }
          if (content.includes("\0")) {
            errors.push(`${spath}.corpus: planning entry ${artifact.path} contains binary NUL bytes`);
            continue;
          }
          const earlyDone = /\b(implementation|dev|code)\b/i.test(content) && /\b(done|complete|completed|merged)\b/i.test(content);
          const laterUnrun = /\b(review|qa|acceptance|holdout)\b/i.test(content) && /\b(not[_ -]?run|pending|todo|backlog|unexecuted)\b/i.test(content);
          if (earlyDone && laterUnrun) errors.push(`${spath}.corpus: ${artifact.path} contains an executed-early/unexecuted-later procedure and cannot be CLEAN`);
          if (planningSourcePaths.has(artifact.path)) continue;
          planningSourcePaths.add(artifact.path);
          planningSources.push({
            ...text(artifact.classification_rationale) ? { classificationRationale: artifact.classification_rationale } : {},
            content,
            declaredClass: String(artifact.class),
            path: artifact.path
          });
        }
      }
    }
  }
  if (clean && repo) {
    const audit = auditPlanningArtifacts(planningSources, declared.size);
    for (const finding2 of audit.findings) {
      errors.push(`${path}.corpus: ${finding2.code} at ${finding2.path} (${finding2.subject}): ${finding2.detail}; related=${JSON.stringify(finding2.related)}`);
    }
  }
  if (repo) {
    const uncovered = [...discovered].filter((candidate) => ![...declared].some((root) => candidate === root || candidate.startsWith(`${root}/`))).sort();
    if (uncovered.length) errors.push(`${path}.systems: independently discovered planning roots are not fully covered: ${JSON.stringify(uncovered)}`);
  }
}
async function validateChangeInventory(bundle, report, manifest, repo, git2, base, files, clean, allowPlaceholders, errors) {
  const path = "$.change_inventory";
  const inventory = requireObject(bundle.change_inventory, ["start_commit", "subject_commit", "changes"], path, errors);
  if (!inventory) return;
  const subject = object3(report.repo)?.commit;
  if (!allowPlaceholders && inventory.subject_commit !== subject) errors.push(`${path}.subject_commit: must equal report repo.commit`);
  const startSnapshot = object3(object3(object3(bundle.successor_readiness)?.snapshots)?.start)?.object;
  if (!allowPlaceholders && inventory.start_commit !== startSnapshot) errors.push(`${path}.start_commit: must equal start snapshot object`);
  const actions = new Map(array2(manifest.actions).map((raw) => object3(raw)).filter(Boolean).map((item) => [String(item.id), item]));
  const reported = /* @__PURE__ */ new Map();
  if (!Array.isArray(inventory.changes)) {
    errors.push(`${path}.changes: required array`);
    return;
  }
  for (const [index, raw] of array2(inventory.changes).entries()) {
    const cpath = `${path}.changes[${index}]`;
    const change = requireObject(raw, ["status", "path", "action_ids", "exclusion"], cpath, errors);
    if (!change || !text(change.path)) continue;
    if (isAbsolute2(change.path) || change.path.split(/[\\/]/).includes("..") || reported.has(change.path)) errors.push(`${cpath}.path: required unique repository-relative path`);
    reported.set(change.path, String(change.status));
    if (!(/* @__PURE__ */ new Set(["A", "M", "D", "T"])).has(String(change.status))) errors.push(`${cpath}.status: expected A, M, D, or T`);
    if (!Array.isArray(change.action_ids) || !array2(change.action_ids).every(text)) errors.push(`${cpath}.action_ids: required string array`);
    const ids = array2(change.action_ids).filter(text);
    for (const id of ids) {
      const action = actions.get(String(id));
      if (!action) errors.push(`${cpath}.action_ids: unknown action ${JSON.stringify(id)}`);
      else {
        const target = String(action.target ?? "");
        if (![change.path, ".", "repository"].includes(target) && !change.path.startsWith(`${target.replace(/\/$/, "")}/`)) errors.push(`${cpath}.action_ids: action ${JSON.stringify(id)} target does not cover ${change.path}`);
      }
    }
    if (clean && ids.length === 0) errors.push(`${cpath}: CLEAN requires an executed action mapping`);
    if (change.exclusion !== null) {
      const record = await evidenceRef(files, base, change.exclusion, `${cpath}.exclusion`, errors, allowPlaceholders, "mister-clean.change-exclusion");
      if (record && !allowPlaceholders) {
        const expected = {
          path: change.path,
          status: change.status,
          start_commit: inventory.start_commit,
          subject_commit: subject,
          request_sha256: object3(bundle.criteria_discovery)?.request_sha256
        };
        for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${cpath}.exclusion: bound exclusion disagrees on ${key}`);
        for (const key of ["actor", "scope", "rationale"]) if (!text(record[key])) errors.push(`${cpath}.exclusion: requires ${key}`);
      }
    }
  }
  if (repo && text(inventory.start_commit) && text(subject)) {
    const output = (await git2.run(repo, ["diff", "--name-status", "--no-renames", inventory.start_commit, subject])).stdout;
    const live = new Map(output.split("\n").filter(Boolean).map((line) => {
      const [status = "", path2 = ""] = line.split("	", 2);
      return [path2, status];
    }));
    if (!stableEqual([...live.entries()].sort(), [...reported.entries()].sort())) errors.push(`${path}.changes: live start-to-subject diff differs`);
  }
}
async function validateBoundExecutionRecords(bundle, report, manifest, repo, git2, base, files, allowPlaceholders, errors) {
  for (const [index, raw] of array2(manifest.actions).entries()) {
    const action = object3(raw);
    if (!action) continue;
    for (const [evidenceIndex, rawEvidence] of array2(object3(action.outcome)?.evidence).entries()) {
      const evidence = object3(rawEvidence);
      if (!evidence) continue;
      const epath = `$.manifest.actions[${JSON.stringify(action.id)}].outcome.evidence[${evidenceIndex}]`;
      const record = await evidenceRef(files, base, evidence.evidence_ref, `${epath}.evidence_ref`, errors, allowPlaceholders, "mister-clean.action-result");
      if (record && !allowPlaceholders) {
        const expected = {
          action_id: action.id,
          kind: action.kind,
          target: action.target,
          object: evidence.object,
          command: evidence.command,
          result: evidence.result,
          observed_at: evidence.observed_at
        };
        for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${epath}: bound result disagrees on ${key}`);
      }
    }
  }
  for (const [index, raw] of array2(report.completion_debts).entries()) {
    const debt = object3(raw);
    if (!debt) continue;
    if (debt.state === "satisfied") {
      for (const [evidenceIndex, rawEvidence] of array2(debt.evidence).entries()) {
        const evidence = object3(rawEvidence);
        if (!evidence) continue;
        const epath = `$.report.completion_debts[${index}].evidence[${evidenceIndex}]`;
        const record = await evidenceRef(files, base, evidence.evidence_ref, `${epath}.evidence_ref`, errors, allowPlaceholders, "mister-clean.debt-result");
        if (record && !allowPlaceholders) {
          const expected = {
            debt_id: debt.id,
            kind: evidence.kind,
            object: evidence.object,
            command: evidence.command,
            result: evidence.result,
            observed_at: evidence.observed_at
          };
          for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${epath}: bound debt result disagrees on ${key}`);
        }
      }
    }
    if (debt.state === "accepted_exception") {
      const exception = object3(debt.exception) ?? {};
      const epath = `$.report.completion_debts[${index}].exception.ref`;
      const record = await evidenceRef(files, base, exception.ref, epath, errors, allowPlaceholders, "mister-clean.operator-ruling");
      if (record && !allowPlaceholders) {
        for (const field of ["actor", "at", "scope", "rationale"]) if (record[field] !== exception[field]) errors.push(`${epath}: ruling disagrees on ${field}`);
        if (record.debt_id !== debt.id) errors.push(`${epath}: ruling debt_id mismatch`);
        if (record.request_sha256 !== object3(bundle.criteria_discovery)?.request_sha256) errors.push(`${epath}: ruling must bind the exact operative request`);
      }
    }
  }
  for (const [name, raw] of Object.entries(object3(report.claims) ?? {})) {
    const claim = object3(raw);
    if (claim?.state !== "established") continue;
    for (const [index, rawEvidence] of array2(claim.evidence).entries()) {
      const evidence = object3(rawEvidence);
      if (!evidence) continue;
      const epath = `$.report.claims.${name}.evidence[${index}]`;
      if (name === "committed_locally") {
        if (repo && !allowPlaceholders && (await git2.run(repo, ["cat-file", "-e", `${String(evidence.commit ?? "")}^{commit}`], [0, 128])).code !== 0) errors.push(`${epath}: commit does not exist in live repository`);
      } else if (name === "pushed" && evidence.kind === "remote_ref_resolution") {
        if (repo && !allowPlaceholders) {
          const result = await git2.run(repo, ["ls-remote", String(evidence.remote ?? ""), String(evidence.ref ?? "")], [0, 2, 128]);
          const observed = result.stdout.split("\n").filter(Boolean)[0]?.split(/\s+/, 1)[0] ?? "";
          if (observed !== evidence.commit || evidence.commit !== object3(report.repo)?.commit) errors.push(`${epath}: live remote resolution does not establish the subject commit`);
        }
      } else if (EXTERNAL_CLAIMS.has(name)) {
        errors.push(`${epath}: local closure bundles cannot establish external claim ${name}; use not_established/not_applicable until a trusted adapter is configured`);
      }
    }
  }
}
async function validateSuccessor(bundle, report, base, files, clean, allowPlaceholders, errors) {
  const path = "$.successor_readiness";
  const successor = requireObject(bundle.successor_readiness, ["snapshots", "target_observation", "topology", "current_state", "gates", "debris", "handoff", "final_review"], path, errors);
  if (!successor) return;
  const snapshots = requireObject(successor.snapshots, ["start", "end"], `${path}.snapshots`, errors);
  if (snapshots) {
    for (const name of ["start", "end"]) {
      const snapshot = requireObject(snapshots[name], ["kind", "object", "command", "result", "observed_at"], `${path}.snapshots.${name}`, errors);
      if (!snapshot) continue;
      if (snapshot.kind !== "repository_snapshot") errors.push(`${path}.snapshots.${name}.kind: expected repository_snapshot`);
      for (const field of ["object", "command", "result"]) if (!text(snapshot[field])) errors.push(`${path}.snapshots.${name}.${field}: required`);
      if (!allowPlaceholders && !executedText(snapshot.command)) errors.push(`${path}.snapshots.${name}.command: must describe an executed observation, not an assertion`);
      if (!allowPlaceholders && !iso(snapshot.observed_at)) errors.push(`${path}.snapshots.${name}.observed_at: required ISO-8601 timestamp`);
    }
  }
  const observation = requireObject(successor.target_observation, ["kind", "local_ref", "commit", "observed_at"], `${path}.target_observation`, errors);
  if (observation) {
    if (!(/* @__PURE__ */ new Set(["remote_ref_resolution", "local_ref_resolution"])).has(String(observation.kind))) errors.push(`${path}.target_observation.kind: unsupported`);
    if (!text(observation.local_ref)) errors.push(`${path}.target_observation.local_ref: required`);
    if (!text(observation.commit)) errors.push(`${path}.target_observation.commit: required`);
    if (!allowPlaceholders && !iso(observation.observed_at)) errors.push(`${path}.target_observation.observed_at: required ISO-8601 timestamp`);
    if (observation.kind === "remote_ref_resolution") {
      for (const field of ["remote", "remote_ref"]) if (!text(observation[field])) errors.push(`${path}.target_observation.${field}: required`);
    } else if (observation.kind === "local_ref_resolution") {
      await evidenceRef(files, base, observation.policy_evidence, `${path}.target_observation.policy_evidence`, errors, allowPlaceholders, "mister-clean.local-target-policy");
    }
  }
  const topology = requireObject(successor.topology, ["worktrees", "branches", "remote_refs", "stashes", "processes", "dirty", "unowned", "unmerged", "blocking_processes"], `${path}.topology`, errors);
  if (topology) {
    for (const field of ["worktrees", "branches", "remote_refs", "stashes", "processes"]) {
      if (!Array.isArray(topology[field])) errors.push(`${path}.topology.${field}: required array`);
    }
    let reportedUnowned = 0;
    const specs = {
      worktrees: ["path", "head", "branch", "dirty_count", "owner", "purpose", "disposition"],
      branches: ["name", "commit", "merged", "owner", "purpose", "disposition"],
      remote_refs: ["name", "commit", "merged", "owner", "purpose", "disposition"]
    };
    for (const [field, fields] of Object.entries(specs)) {
      for (const [index, raw] of array2(topology[field]).entries()) {
        const rpath = `${path}.topology.${field}[${index}]`;
        const row = requireObject(raw, fields, rpath, errors);
        if (!row) continue;
        if (!owned(row.owner)) {
          reportedUnowned += 1;
          if (clean) errors.push(`${rpath}.owner: CLEAN requires a named owner`);
        }
        for (const key of ["purpose", "disposition"]) if (!text(row[key])) errors.push(`${rpath}.${key}: required`);
        if (field === "worktrees") {
          if (!Number.isInteger(row.dirty_count) || Number(row.dirty_count) < 0) errors.push(`${rpath}.dirty_count: required nonnegative integer`);
          if (clean && Number(row.dirty_count) > 0) {
            errors.push(`${rpath}: unresolved topology row prevents CLEAN`);
            const record = await evidenceRef(files, base, row.policy_ref, `${rpath}.policy_ref`, errors, allowPlaceholders, "mister-clean.topology-policy");
            if (record && !allowPlaceholders) {
              const expected = {
                surface: field,
                identity: row.path,
                commit: row.head,
                request_sha256: object3(bundle.criteria_discovery)?.request_sha256
              };
              for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${rpath}.policy_ref: bound topology ruling disagrees on ${key}`);
              for (const key of ["actor", "scope", "rationale", "next_action"]) if (!text(record[key])) errors.push(`${rpath}.policy_ref: topology ruling requires ${key}`);
            }
          }
        } else {
          if (typeof row.merged !== "boolean") errors.push(`${rpath}.merged: required boolean`);
          if (clean && row.merged === false) {
            errors.push(`${rpath}: unresolved topology row prevents CLEAN`);
            const record = await evidenceRef(files, base, row.policy_ref, `${rpath}.policy_ref`, errors, allowPlaceholders, "mister-clean.topology-policy");
            if (record && !allowPlaceholders) {
              const expected = {
                surface: field,
                identity: row.name,
                commit: row.commit,
                request_sha256: object3(bundle.criteria_discovery)?.request_sha256
              };
              for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${rpath}.policy_ref: bound topology ruling disagrees on ${key}`);
              for (const key of ["actor", "scope", "rationale", "next_action"]) if (!text(record[key])) errors.push(`${rpath}.policy_ref: topology ruling requires ${key}`);
            }
          }
        }
      }
    }
    for (const [index, raw] of array2(topology.processes).entries()) {
      const ppath = `${path}.topology.processes[${index}]`;
      const process2 = requireObject(raw, ["identity", "owner", "purpose", "disposition", "blocking"], ppath, errors);
      if (!process2) continue;
      if (!text(process2.identity)) errors.push(`${ppath}.identity: required`);
      if (!owned(process2.owner)) {
        reportedUnowned += 1;
        if (clean) errors.push(`${ppath}.owner: CLEAN requires a named owner`);
      }
      for (const field of ["purpose", "disposition"]) if (!text(process2[field])) errors.push(`${ppath}.${field}: required`);
      if (typeof process2.blocking !== "boolean") errors.push(`${ppath}.blocking: required boolean`);
    }
    for (const field of ["dirty", "unowned", "unmerged", "blocking_processes"]) {
      if (!Number.isInteger(topology[field]) || Number(topology[field]) < 0) errors.push(`${path}.topology.${field}: required nonnegative integer`);
      else if (clean && topology[field] !== 0) errors.push(`${path}.topology.${field}: CLEAN requires zero`);
    }
    const reportedBlocking = array2(topology.processes).filter((raw) => object3(raw)?.blocking === true).length;
    if (topology.blocking_processes !== reportedBlocking) errors.push(`${path}.topology.blocking_processes: must equal blocking process rows (${reportedBlocking})`);
    if (topology.unowned !== reportedUnowned) errors.push(`${path}.topology.unowned: must equal unowned topology rows (${reportedUnowned})`);
    if (clean && array2(topology.stashes).length) errors.push(`${path}.topology.stashes: CLEAN requires zero stashes`);
  }
  const currentPath = `${path}.current_state`;
  const current = requireObject(successor.current_state, ["state", "path", "sha256", "commit", "generator", "designation"], currentPath, errors);
  if (current) {
    if (!(/* @__PURE__ */ new Set(["missing", "candidate_unverified", "designated"])).has(String(current.state))) errors.push(`${currentPath}.state: unsupported`);
    if (!text(current.commit) || !text(current.generator)) errors.push(`${currentPath}: commit and generator are required`);
    if (clean && current.state !== "designated") errors.push(`${currentPath}.state: CLEAN requires designated`);
    if (current.state === "missing") {
      if (current.path !== null || current.sha256 !== null || current.designation !== null) errors.push(`${currentPath}: missing state requires null path, sha256, and designation`);
    } else {
      if (!text(current.path)) errors.push(`${currentPath}.path: required`);
      if (!allowPlaceholders && (typeof current.sha256 !== "string" || !HEX64.test(current.sha256))) errors.push(`${currentPath}.sha256: required lowercase SHA-256`);
      if (current.state === "candidate_unverified" && current.designation !== null) errors.push(`${currentPath}.designation: candidate_unverified requires null`);
      if (current.state === "designated") {
        const record = await evidenceRef(files, base, current.designation, `${currentPath}.designation`, errors, allowPlaceholders, "mister-clean.current-state-designation");
        if (record && !allowPlaceholders) {
          for (const field of ["path", "sha256", "commit"]) if (record[field] !== current[field]) errors.push(`${currentPath}.designation: bound designation disagrees on ${field}`);
        }
      }
    }
  }
  if (!Array.isArray(successor.gates)) errors.push(`${path}.gates: required array`);
  const gates = array2(successor.gates);
  if (clean && gates.length === 0) errors.push(`${path}.gates: CLEAN requires nonempty array`);
  for (const [index, raw] of gates.entries()) {
    const gpath = `${path}.gates[${index}]`;
    const gate = requireObject(raw, ["id", "kind", "object", "command", "expected_status", "observed_status", "semantic_status", "verified", "total", "warnings", "debt", "skipped", "evidence_ref"], gpath, errors);
    if (!gate) continue;
    for (const field of ["id", "kind", "object", "command"]) if (!text(gate[field])) errors.push(`${gpath}.${field}: required`);
    if (!GATE_KINDS.has(String(gate.kind))) errors.push(`${gpath}.kind: unsupported gate kind`);
    if (!allowPlaceholders && !executedText(gate.command)) errors.push(`${gpath}.command: must describe an executed gate`);
    for (const field of ["expected_status", "observed_status"]) if (!Number.isInteger(gate[field])) errors.push(`${gpath}.${field}: required integer`);
    for (const field of ["verified", "total", "warnings", "debt", "skipped"]) if (!Number.isInteger(gate[field]) || Number(gate[field]) < 0) errors.push(`${gpath}.${field}: required nonnegative integer`);
    if (clean && gate.expected_status !== gate.observed_status) errors.push(`${gpath}: observed_status must equal expected_status`);
    if (clean && gate.semantic_status !== "pass") errors.push(`${gpath}.semantic_status: CLEAN requires pass`);
    if (clean && gate.total === 0) errors.push(`${gpath}.total: zero-scope gate cannot establish CLEAN`);
    if (clean && gate.verified !== gate.total) errors.push(`${gpath}: verified must equal total`);
    for (const field of ["warnings", "debt", "skipped"]) if (clean && gate[field] !== 0) errors.push(`${gpath}.${field}: CLEAN requires zero`);
    const record = await evidenceRef(files, base, gate.evidence_ref, `${gpath}.evidence_ref`, errors, allowPlaceholders, "mister-clean.gate-result");
    if (record && !allowPlaceholders) {
      const expected = {
        gate_id: gate.id,
        object: gate.object,
        command: gate.command,
        observed_status: gate.observed_status,
        semantic_status: gate.semantic_status,
        verified: gate.verified,
        total: gate.total,
        warnings: gate.warnings,
        debt: gate.debt,
        skipped: gate.skipped
      };
      for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${gpath}.evidence_ref: bound gate record disagrees on ${key}`);
      if (!iso(record.observed_at)) errors.push(`${gpath}.evidence_ref: gate record requires timezone-aware observed_at`);
    }
  }
  if (clean && !gates.some((raw) => {
    const gate = object3(raw);
    return gate?.kind === "isolated_clone" && gate.object === object3(report.repo)?.commit;
  })) errors.push(`${path}.gates: CLEAN requires an isolated_clone gate bound to the subject commit`);
  const debris = requireObject(successor.debris, ["removed", "retained", "unclassified", "evidence"], `${path}.debris`, errors);
  if (debris) {
    for (const field of ["removed", "retained", "unclassified"]) {
      if (!Number.isInteger(debris[field]) || Number(debris[field]) < 0) errors.push(`${path}.debris.${field}: required nonnegative integer`);
    }
    if (clean && debris.unclassified !== 0) errors.push(`${path}.debris.unclassified: CLEAN requires zero`);
    if (!Array.isArray(debris.evidence) || array2(debris.evidence).length === 0) errors.push(`${path}.debris.evidence: required`);
    else {
      for (const [index, ref] of array2(debris.evidence).entries()) {
        const record = await evidenceRef(files, base, ref, `${path}.debris.evidence[${index}]`, errors, allowPlaceholders, "mister-clean.debris-census");
        if (record && !allowPlaceholders) for (const field of ["removed", "retained", "unclassified"]) {
          if (record[field] !== debris[field]) errors.push(`${path}.debris.evidence[${index}]: bound debris record disagrees on ${field}`);
        }
      }
    }
  }
  const handoff = requireObject(successor.handoff, ["entrypoints", "next_owner", "next_action"], `${path}.handoff`, errors);
  if (handoff) {
    if (!Array.isArray(handoff.entrypoints) || !array2(handoff.entrypoints).every(text)) errors.push(`${path}.handoff.entrypoints: required string array`);
    else if (clean && array2(handoff.entrypoints).length === 0) errors.push(`${path}.handoff.entrypoints: CLEAN requires at least one entrypoint`);
    for (const field of ["next_owner", "next_action"]) if (!text(handoff[field])) errors.push(`${path}.handoff.${field}: required`);
  }
  const review = requireObject(successor.final_review, ["mechanism", "status", "reviewer", "implementer", "reviewer_execution", "implementer_execution", "criteria_reviewed", "planning_reviewed", "findings_total", "findings_paid", "unresolved", "evidence_ref"], `${path}.final_review`, errors);
  if (review) {
    for (const field of ["mechanism", "reviewer", "implementer"]) if (!text(review[field])) errors.push(`${path}.final_review.${field}: required`);
    if (identity(review.reviewer) && identity(review.reviewer) === identity(review.implementer)) errors.push(`${path}.final_review: reviewer must differ from implementer`);
    const executionIdentities = [];
    for (const field of ["reviewer_execution", "implementer_execution"]) {
      const execution = requireObject(review[field], ["harness", "session_id", "receipt_id"], `${path}.final_review.${field}`, errors);
      if (!execution) continue;
      for (const key of ["harness", "session_id", "receipt_id"]) if (!text(execution[key])) errors.push(`${path}.final_review.${field}.${key}: required`);
      executionIdentities.push([identity(execution.harness), identity(execution.session_id), identity(execution.receipt_id)]);
    }
    if (executionIdentities.length === 2 && stableEqual(executionIdentities[0], executionIdentities[1])) errors.push(`${path}.final_review: reviewer and implementer require distinct execution identities`);
    for (const field of ["criteria_reviewed", "planning_reviewed"]) {
      if (typeof review[field] !== "boolean") errors.push(`${path}.final_review.${field}: required boolean`);
      else if (clean && review[field] !== true) errors.push(`${path}.final_review.${field}: CLEAN requires true`);
    }
    if (clean && review.status !== "passed") errors.push(`${path}.final_review.status: CLEAN requires passed`);
    for (const field of ["findings_total", "findings_paid", "unresolved"]) if (!Number.isInteger(review[field]) || Number(review[field]) < 0) errors.push(`${path}.final_review.${field}: required nonnegative integer`);
    if (clean && review.unresolved !== 0) errors.push(`${path}.final_review.unresolved: CLEAN requires zero`);
    if (clean && review.findings_total !== review.findings_paid) errors.push(`${path}.final_review: findings_total must equal findings_paid`);
    const record = await evidenceRef(files, base, review.evidence_ref, `${path}.final_review.evidence_ref`, errors, allowPlaceholders, "mister-clean.independent-review");
    if (record && !allowPlaceholders) {
      const criteria = object3(bundle.criteria_discovery);
      const planning = object3(bundle.planning_discovery);
      const expected = {
        mechanism: review.mechanism,
        status: review.status,
        reviewer: review.reviewer,
        implementer: review.implementer,
        reviewer_execution: review.reviewer_execution,
        implementer_execution: review.implementer_execution,
        candidate_commit: object3(report.repo)?.commit,
        criteria_ids: criteria?.criteria_ids,
        planning_system_ids: array2(planning?.systems).map((item) => object3(item)?.id).filter((item) => item !== void 0),
        findings_total: review.findings_total,
        findings_paid: review.findings_paid,
        unresolved: review.unresolved
      };
      for (const [key, value] of Object.entries(expected)) if (!stableEqual(record[key], value)) errors.push(`${path}.final_review.evidence_ref: bound review record disagrees on ${key}`);
      if (!iso(record.observed_at)) errors.push(`${path}.final_review.evidence_ref: review record requires timezone-aware observed_at`);
    }
  }
}
async function validateLive(bundle, report, manifest, bundlePath, repo, ports, errors) {
  const { files, git: git2 } = ports;
  if (!await files.exists(repo)) {
    errors.push(`$.live_repo: repository not found: ${repo}`);
    return;
  }
  try {
    const top = await files.realpath(resolve3((await git2.run(repo, ["rev-parse", "--show-toplevel"])).stdout));
    const requestedRoot = await files.realpath(resolve3(repo));
    if (top !== requestedRoot) errors.push(`$.live_repo: expected worktree root ${top}, got ${requestedRoot}`);
    const head = (await git2.run(repo, ["rev-parse", "HEAD"])).stdout;
    const subject = object3(report.repo)?.commit;
    if ((await git2.run(repo, ["cat-file", "-e", `${String(subject ?? "")}^{commit}`], [0, 128])).code !== 0) errors.push("$.report.repo.commit: subject commit does not exist in live repository");
    const custody = object3(bundle.custody) ?? {};
    if (custody.mode !== "sidecar") errors.push("$.custody.mode: only sidecar is supported");
    else if (head !== subject) errors.push(`$.custody: sidecar validation requires live HEAD ${head} == subject ${String(subject)}`);
    if (object3(report.repo)?.id !== await repositoryIdentity2(repo, git2)) errors.push("$.report.repo.id: does not match independently resolved live repository identity");
    if ((await git2.run(repo, ["status", "--porcelain=v1", "--untracked-files=all"])).stdout) errors.push("$.report.repo: CLEAN requires a clean live working tree");
    const successor = object3(bundle.successor_readiness) ?? {};
    const observation = object3(successor.target_observation) ?? {};
    const target = object3(report.target_binding) ?? {};
    if (observation.local_ref !== target.target_ref) errors.push("$.successor_readiness.target_observation.local_ref: must equal report target_binding.target_ref");
    const liveTarget = (await git2.run(repo, ["rev-parse", String(observation.local_ref ?? "")])).stdout;
    if (liveTarget !== target.target_commit) errors.push("$.report.target_binding.target_commit: live target differs");
    if (observation.commit !== liveTarget) errors.push("$.successor_readiness.target_observation.commit: must equal live target");
    const mergeBase = (await git2.run(repo, ["merge-base", liveTarget, String(subject ?? "")])).stdout;
    if (mergeBase !== target.merge_base) errors.push("$.report.target_binding.merge_base: live merge base differs");
    const divergence = (await git2.run(repo, ["rev-list", "--left-right", "--count", `${liveTarget}...${String(subject ?? "")}`])).stdout.split(/\s+/, 2).map(Number);
    if (divergence[0] !== target.target_commits_missing || divergence[1] !== target.candidate_commits_ahead) errors.push("$.report.target_binding: live left/right divergence differs");
    const upstream = (await git2.run(repo, ["rev-parse", "--symbolic-full-name", "@{upstream}"], [0, 128])).stdout;
    const remotes = (await git2.run(repo, ["remote"])).stdout.split("\n").filter(Boolean);
    if (observation.kind === "remote_ref_resolution") {
      const remote = String(observation.remote ?? "");
      const remoteRef = String(observation.remote_ref ?? "");
      const result = await git2.run(repo, ["ls-remote", "--heads", remote, remoteRef], [0, 2, 128]);
      const observed = result.stdout.split("\n").filter(Boolean)[0]?.split(/\s+/, 1)[0] ?? "";
      if (observed !== liveTarget) errors.push("$.successor_readiness.target_observation: remote ref differs from live target");
    }
    if (upstream && observation.kind !== "remote_ref_resolution") errors.push("$.successor_readiness.target_observation: configured upstream forbids local-only target proof");
    if (upstream) {
      if (observation.local_ref !== upstream) errors.push(`$.successor_readiness.target_observation.local_ref: must equal configured upstream ${upstream}`);
      const branch = String(object3(report.repo)?.branch ?? "");
      const remoteName = (await git2.run(repo, ["config", "--get", `branch.${branch}.remote`], [0, 1])).stdout;
      const mergeRef = (await git2.run(repo, ["config", "--get", `branch.${branch}.merge`], [0, 1])).stdout;
      if (observation.remote !== remoteName || observation.remote_ref !== mergeRef) errors.push("$.successor_readiness.target_observation: remote/ref tuple differs from configured upstream");
    } else if (remotes.length && observation.kind === "local_ref_resolution") errors.push("$.successor_readiness.target_observation: CLEAN cannot use local-only target proof while remotes exist");
    const topology = object3(successor.topology) ?? {};
    const worktreeOutput = (await git2.run(repo, ["worktree", "list", "--porcelain"])).stdout;
    const liveWorktrees = worktreeOutput.split(/\n\n+/).filter(Boolean).map((block) => {
      const row = {};
      for (const line of block.split("\n")) {
        const [key = "", ...rest] = line.split(" ");
        if ((/* @__PURE__ */ new Set(["worktree", "HEAD", "branch"])).has(key)) row[key.toLocaleLowerCase("und")] = rest.join(" ");
        else if (key === "detached") row.branch = "detached";
      }
      return row;
    });
    const reportedWorktrees = /* @__PURE__ */ new Map();
    for (const raw of array2(topology.worktrees)) {
      const row = object3(raw);
      if (row && text(row.path)) reportedWorktrees.set(await files.realpath(resolve3(row.path)), row);
    }
    const liveWorktreePaths = /* @__PURE__ */ new Set();
    let dirty = 0;
    let unowned = 0;
    let unmerged = 0;
    for (const row of liveWorktrees) {
      const livePath = await files.realpath(resolve3(row.worktree ?? ""));
      liveWorktreePaths.add(livePath);
      const reported = reportedWorktrees.get(livePath) ?? {};
      if (!owned(reported.owner)) unowned += 1;
      const dirtyCount = (await git2.run(livePath, ["status", "--porcelain=v1", "--untracked-files=all"])).stdout.split("\n").filter(Boolean).length;
      if (dirtyCount > 0) dirty += 1;
      if (reported.head !== row.head || reported.branch !== row.branch) errors.push(`$.successor_readiness.topology.worktrees[${JSON.stringify(livePath)}]: live head/branch differs`);
      if (reported.dirty_count !== dirtyCount) errors.push(`$.successor_readiness.topology.worktrees[${JSON.stringify(livePath)}].dirty_count: live count differs`);
      if ((await git2.run(repo, ["merge-base", "--is-ancestor", row.head ?? "", head], [0, 1])).code !== 0) unmerged += 1;
    }
    if (!stableEqual([...liveWorktreePaths].sort(), [...reportedWorktrees.keys()].sort())) errors.push("$.successor_readiness.topology.worktrees: live path set differs");
    const branchLines = (await git2.run(repo, ["for-each-ref", "--format=%(refname:short)%09%(objectname)", "refs/heads"])).stdout.split("\n").filter(Boolean);
    const liveBranches = new Map(branchLines.map((line) => line.split("	", 2)));
    const reportedBranches = new Map(array2(topology.branches).map(object3).filter(Boolean).map((row) => [String(row.name), row]));
    if (!stableEqual([...liveBranches.keys()].sort(), [...reportedBranches.keys()].sort())) errors.push("$.successor_readiness.topology.branches: live branch set differs");
    for (const [name, commit] of liveBranches) {
      const reported = reportedBranches.get(name) ?? {};
      if (!owned(reported.owner)) unowned += 1;
      const merged = (await git2.run(repo, ["merge-base", "--is-ancestor", commit, head], [0, 1])).code === 0;
      if (reported.commit !== commit || reported.merged !== merged) errors.push(`$.successor_readiness.topology.branches[${JSON.stringify(name)}]: live commit/merged differs`);
      if (!merged) unmerged += 1;
    }
    const remoteLines = (await git2.run(repo, ["for-each-ref", "--format=%(refname)%09%(objectname)", "refs/remotes"])).stdout.split("\n").filter((line) => line && !line.split("	", 1)[0].endsWith("/HEAD"));
    const liveRemoteRefs = new Map(remoteLines.map((line) => line.split("	", 2)));
    const reportedRemoteRefs = new Map(array2(topology.remote_refs).map(object3).filter(Boolean).map((row) => [String(row.name), row]));
    if (!stableEqual([...liveRemoteRefs.keys()].sort(), [...reportedRemoteRefs.keys()].sort())) errors.push("$.successor_readiness.topology.remote_refs: live remote-ref set differs");
    for (const [name, commit] of liveRemoteRefs) {
      const reported = reportedRemoteRefs.get(name) ?? {};
      if (!owned(reported.owner)) unowned += 1;
      const merged = (await git2.run(repo, ["merge-base", "--is-ancestor", commit, String(subject ?? "")], [0, 1])).code === 0;
      if (reported.commit !== commit || reported.merged !== merged) errors.push(`$.successor_readiness.topology.remote_refs[${JSON.stringify(name)}]: live commit/merged differs`);
      if (!merged) unmerged += 1;
    }
    const liveStashes = (await git2.run(repo, ["stash", "list", "--format=%gd%09%H%09%gs"])).stdout.split("\n").filter(Boolean);
    if (!stableEqual(topology.stashes, liveStashes)) errors.push("$.successor_readiness.topology.stashes: live stash set differs");
    if (topology.dirty !== dirty || topology.unowned !== unowned || topology.unmerged !== unmerged) errors.push(`$.successor_readiness.topology: live counts dirty=${dirty} unowned=${unowned} unmerged=${unmerged} differ`);
    const current = object3(successor.current_state) ?? {};
    if (text(current.path)) {
      const relCurrent = current.path;
      const currentPath = await contained(files, repo, relCurrent);
      if (relCurrent === ".git" || relCurrent.startsWith(".git/")) errors.push("$.successor_readiness.current_state.path: Git metadata cannot be a successor entrypoint");
      else if (!currentPath || !await files.isFile(currentPath)) errors.push("$.successor_readiness.current_state.path: missing, not a file, or outside repository");
      else if (sha256(await files.readBytes(currentPath)) !== current.sha256) errors.push("$.successor_readiness.current_state.sha256: live digest differs");
      else if ((await git2.run(repo, ["cat-file", "-e", `${String(subject)}:${relCurrent}`], [0, 128])).code !== 0) errors.push("$.successor_readiness.current_state.path: must exist in the subject commit");
    }
    if (current.commit !== subject) errors.push("$.successor_readiness.current_state.commit: must equal subject commit");
    for (const [index, entry] of array2(object3(successor.handoff)?.entrypoints).entries()) {
      const resolved = await contained(files, repo, entry);
      if (!text(entry) || isAbsolute2(entry) || entry === ".git" || entry.startsWith(".git/") || !resolved || !await files.isFile(resolved)) errors.push(`$.successor_readiness.handoff.entrypoints[${index}]: must be an existing repository-relative file outside .git`);
    }
    for (const name of ["start", "end"]) {
      const snapshot = object3(object3(successor.snapshots)?.[name]) ?? {};
      const commit = String(snapshot.object ?? "");
      if (!/^[0-9a-f]{40}$/.test(commit) || (await git2.run(repo, ["cat-file", "-e", `${commit}^{commit}`], [0, 128])).code !== 0) errors.push(`$.successor_readiness.snapshots.${name}.object: must be an existing full commit`);
    }
    if (object3(object3(successor.snapshots)?.end)?.object !== subject) errors.push("$.successor_readiness.snapshots.end.object: must equal subject commit");
    for (const [index, raw] of array2(manifest.actions).entries()) {
      const action = object3(raw);
      if (action && LOCAL_ACTION_KINDS.has(String(action.kind))) {
        const actionPath = await contained(files, repo, action.target);
        if (!actionPath) errors.push(`$.manifest.actions[${index}].target: resolves outside repository through traversal or symlink`);
      }
    }
    void bundlePath;
  } catch (error) {
    errors.push(`$.live_git: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function validateBundle(data, bundlePath, options = {}) {
  const errors = [];
  const allowPlaceholders = options.allowPlaceholders ?? false;
  const verifyLive = options.verifyLive ?? true;
  const ports = options.ports ?? nodeBundlePorts;
  const bundle = requireObject(data, ["record_type", "schema_version", "run_id", "request_ref", "report", "manifest", "custody", "criteria_discovery", "change_inventory", "planning_discovery", "successor_readiness"], "$", errors);
  if (!bundle) return { errors, ok: false };
  if (bundle.record_type !== "mister-clean.closure-bundle") errors.push("$.record_type: expected mister-clean.closure-bundle");
  if (bundle.schema_version !== "1.0") errors.push("$.schema_version: expected 1.0");
  for (const field of ["run_id", "request_ref"]) if (!text(bundle[field])) errors.push(`$.${field}: required`);
  const base = dirname2(resolve3(bundlePath));
  const reportLoad = await loadRef(ports.files, base, bundle.report, "$.report", errors, allowPlaceholders);
  const manifestLoad = await loadRef(ports.files, base, bundle.manifest, "$.manifest", errors, allowPlaceholders);
  const report = reportLoad.data;
  const manifest = manifestLoad.data;
  if (!report || !manifest) return { errors, ok: errors.length === 0 };
  errors.push(...validateReport(report, allowPlaceholders, true).map((error) => `$.report::${error}`));
  errors.push(...validateManifest(manifest, allowPlaceholders).map((error) => `$.manifest::${error}`));
  if (!allowPlaceholders && !iso(report.generated_at)) errors.push("$.report.generated_at: required ISO-8601 timestamp");
  if (!allowPlaceholders && !iso(object3(report.target_binding)?.measured_at)) errors.push("$.report.target_binding.measured_at: required ISO-8601 timestamp");
  if (bundle.request_ref !== object3(report.authorization_basis)?.ref) errors.push("$.request_ref: must equal report authorization_basis.ref");
  if (bundle.request_ref !== manifest.request_ref) errors.push("$.request_ref: must equal manifest request_ref");
  for (const field of ["id", "commit"]) if (object3(report.repo)?.[field] !== object3(manifest.repo)?.[field]) errors.push(`$.report/manifest.repo.${field}: must match`);
  if (report.mode !== manifest.mode) errors.push("$.report/manifest.mode: must match");
  const reportActions = array2(report.actions).map(object3).filter(Boolean);
  const manifestActions = array2(manifest.actions).map(object3).filter(Boolean);
  const reportIds = reportActions.map((item) => item.id);
  const manifestIds = manifestActions.map((item) => item.id);
  if (new Set(reportIds).size !== reportActions.length) errors.push("$.report.actions: every action requires a unique id");
  if (!stableEqual([...reportIds].sort(), [...manifestIds].sort())) errors.push("$.report/manifest.actions: exact action id sets must match");
  else if (!stableEqual(reportActions, manifestActions)) errors.push("$.report/manifest.actions: canonical action records must match exactly");
  const clean = report.verdict === "CLEAN";
  if (clean && manifestActions.length > 0 && manifest.execution_state !== "executed") errors.push("$.manifest.execution_state: CLEAN with actions requires executed");
  if (clean) {
    for (const action of reportActions) if (action.status !== "executed") errors.push(`$.report.actions[${JSON.stringify(action.id)}].status: CLEAN requires executed`);
  }
  const custody = requireObject(bundle.custody, ["mode", "subject_commit", "evidence_root", "evidence_paths"], "$.custody", errors);
  if (custody) {
    if (custody.mode !== "sidecar") errors.push("$.custody.mode: only sidecar is supported");
    if (!allowPlaceholders && custody.subject_commit !== object3(report.repo)?.commit) errors.push("$.custody.subject_commit: must equal report repo.commit");
    if (!Array.isArray(custody.evidence_paths) || !array2(custody.evidence_paths).every((entry) => text(entry) && !isAbsolute2(entry) && !entry.split(/[\\/]/).includes(".."))) errors.push("$.custody.evidence_paths: required repository-relative string array");
    if (custody.evidence_root !== null || !stableEqual(custody.evidence_paths, [])) errors.push("$.custody: sidecar mode requires null evidence_root and empty evidence_paths");
  }
  let repo = options.repoPath ? resolve3(options.repoPath) : void 0;
  if (verifyLive && !allowPlaceholders && !repo) {
    const probe = await ports.git.run(base, ["rev-parse", "--show-toplevel"], [0, 128]);
    if (probe.code === 0 && probe.stdout) repo = resolve3(probe.stdout);
    else errors.push("$.live_repo: pass --repo or store the bundle inside the repository");
  }
  const repoExists = repo ? await ports.files.exists(repo) : false;
  if (verifyLive && !allowPlaceholders && repo && !repoExists) errors.push(`$.live_repo: repository not found: ${repo}`);
  const structuralRepo = repoExists ? repo : void 0;
  await validateCriteria(bundle, report, base, ports.files, clean, allowPlaceholders, errors);
  await validateBoundExecutionRecords(bundle, report, manifest, structuralRepo, ports.git, base, ports.files, allowPlaceholders, errors);
  await validateChangeInventory(bundle, report, manifest, structuralRepo, ports.git, base, ports.files, clean, allowPlaceholders, errors);
  await validatePlanning(bundle, structuralRepo, ports.files, clean, allowPlaceholders, errors);
  await validateSuccessor(bundle, report, base, ports.files, clean, allowPlaceholders, errors);
  if (!allowPlaceholders) for (const path of findPlaceholders(bundle)) errors.push(`${path}: unresolved template placeholder`);
  if (clean) {
    if (!verifyLive) errors.push("$.verdict: CLEAN requires live verification");
    else if (repo && repoExists) await validateLive(bundle, report, manifest, bundlePath, repo, ports, errors);
  }
  return { errors, ok: errors.length === 0 };
}
async function validateBundleFile(bundlePath, options = {}) {
  const ports = options.ports ?? nodeBundlePorts;
  try {
    const data = JSON.parse(await ports.files.readText(bundlePath));
    return validateBundle(data, bundlePath, { ...options, ports });
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : String(error)], failureKind: "load", ok: false };
  }
}

// src/closeout/inspection.ts
import { createHash as createHash3 } from "crypto";
import {
  readFile as readFile2,
  readdir as readdir2,
  readlink,
  stat
} from "fs/promises";
import { basename as basename4, relative as relative4, resolve as resolve4, sep as sep4 } from "path";
var STACK_MARKERS = {
  node: ["package.json"],
  "node-bun": ["bun.lock", "bun.lockb"],
  "node-pnpm": ["pnpm-lock.yaml", "pnpm-workspace.yaml"],
  "node-npm": ["package-lock.json"],
  "node-yarn": ["yarn.lock"],
  typescript: ["tsconfig.json"],
  python: ["pyproject.toml", "setup.py", "requirements.txt", "Pipfile"],
  rust: ["Cargo.toml"],
  go: ["go.mod"],
  docker: ["Dockerfile", "docker-compose.yml", "compose.yaml"],
  "github-actions": [".github/workflows"]
};
var PUBLIC_SAFETY_EXCLUDED_PARTS = /* @__PURE__ */ new Set([
  ".git",
  ".venv",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules"
]);
var MANIFEST_EXCLUDED_DIRS = /* @__PURE__ */ new Set([
  ".git",
  ".wrangler",
  "__pycache__",
  "coverage",
  "dist",
  "node_modules"
]);
var MANIFEST_EXCLUDED_FILES = /* @__PURE__ */ new Set([
  ".DS_Store",
  "MANIFEST.sha256",
  "src/generated-materials.ts"
]);
var PUBLIC_SAFETY_RULES = [
  ["posix-home-path", /\/(?:Users|home)\/[^/\s]+\//],
  ["windows-home-path", /\b[A-Za-z]:\\Users\\[^\\\s]+\\/],
  ["email-address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ["file-url", /\bfile:\/\/[^\s)>'\"]+/i],
  ["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  [
    "credential-assignment",
    /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*['"]?[A-Za-z0-9_./+=-]{8,}/i
  ]
];
function toPosix(path) {
  return path.split(sep4).join("/");
}
function compareCodePoints3(left, right) {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    if (difference) return difference;
  }
  return leftPoints.length - rightPoints.length;
}
function hasExcludedPart(path, excluded) {
  return path.split(/[\\/]/).some((part) => excluded.has(part));
}
async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
async function walkFiles(root, excluded) {
  const absoluteRoot = resolve4(root);
  const files = [];
  async function visit(directory) {
    const entries = await readdir2(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (excluded.has(entry.name)) continue;
      const absolute = resolve4(directory, entry.name);
      const rel = toPosix(relative4(absoluteRoot, absolute));
      if (entry.isSymbolicLink()) {
        files.push({ absolute, relative: rel, symlink: true });
      } else if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.push({ absolute, relative: rel, symlink: false });
      }
    }
  }
  await visit(absoluteRoot);
  return files.sort((left, right) => compareCodePoints3(left.relative, right.relative));
}
async function containsShellFile(root) {
  try {
    return (await walkFiles(root, /* @__PURE__ */ new Set([".git", "node_modules"]))).some((file) => file.relative.endsWith(".sh"));
  } catch {
    return false;
  }
}
async function detectStack(root) {
  const absoluteRoot = resolve4(root);
  const ecosystems = [];
  for (const [ecosystem, markers] of Object.entries(STACK_MARKERS)) {
    if ((await Promise.all(markers.map((marker) => exists(resolve4(absoluteRoot, marker))))).some(Boolean)) {
      ecosystems.push(ecosystem);
    }
  }
  if (await containsShellFile(absoluteRoot)) ecosystems.push("shell");
  return ecosystems.length > 0 ? { ecosystems, exitCode: 0, status: "detected" } : { ecosystems, exitCode: 3, status: "unknown" };
}
async function loadDenylist(path) {
  if (!path) return [];
  return (await readFile2(path, "utf8")).split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith("#"));
}
function lines(text2) {
  return text2.split(/\r\n|\n|\r/);
}
async function scanPublicSafety(root, customTerms = []) {
  const findings = [];
  const files = await walkFiles(root, PUBLIC_SAFETY_EXCLUDED_PARTS);
  for (const file of files) {
    let text2;
    if (file.symlink) {
      text2 = `SYMLINK_TARGET=${await readlink(file.absolute)}`;
    } else {
      const bytes = await readFile2(file.absolute);
      if (bytes.includes(0)) continue;
      try {
        text2 = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        continue;
      }
    }
    for (const [index, line] of lines(text2).entries()) {
      for (const [rule, expression] of PUBLIC_SAFETY_RULES) {
        if (expression.test(line)) findings.push({ path: file.relative, line: index + 1, rule });
      }
      const folded = foldCase(line);
      for (const [termIndex, term] of customTerms.entries()) {
        if (folded.includes(foldCase(term))) {
          findings.push({ path: file.relative, line: index + 1, rule: `custom-denylist-${termIndex + 1}` });
        }
      }
    }
  }
  return findings.length === 0 ? { findings, exitCode: 0, status: "pass" } : { findings, exitCode: 1, status: "fail" };
}
async function generateManifest(root) {
  const absoluteRoot = resolve4(root);
  const entries = [];
  const files = await walkFiles(absoluteRoot, MANIFEST_EXCLUDED_DIRS);
  for (const file of files) {
    if (MANIFEST_EXCLUDED_FILES.has(file.relative)) continue;
    if (basename4(file.relative).endsWith(".pyc") || basename4(file.relative).endsWith(".skill")) continue;
    if (hasExcludedPart(file.relative, MANIFEST_EXCLUDED_DIRS)) continue;
    if (file.symlink && !(await stat(file.absolute)).isFile()) continue;
    const bytes = await readFile2(file.absolute);
    entries.push({
      path: `./${file.relative}`,
      sha256: createHash3("sha256").update(bytes).digest("hex")
    });
  }
  entries.sort((left, right) => compareCodePoints3(left.path, right.path));
  return {
    entries,
    content: entries.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n") + (entries.length ? "\n" : ""),
    exitCode: 0
  };
}

// src/closeout/prepare.ts
import { createHash as createHash4 } from "crypto";
import { existsSync as existsSync2, lstatSync as lstatSync3, mkdirSync, readFileSync as readFileSync3, writeFileSync as writeFileSync2 } from "fs";
import { join as join2, relative as relative5, resolve as resolve5, sep as sep5 } from "path";
function asObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected object`);
  return value;
}
function sha2562(value) {
  return createHash4("sha256").update(value).digest("hex");
}
function isoTimestamp2(date) {
  return date.toISOString();
}
function planningClass(path) {
  const parts = path.split("/").map((part) => part.toLocaleLowerCase());
  for (const part of parts) if (PLANNING_LANE_NAMES.has(part)) return part;
  return "planning";
}
function loadTemplate(root, name) {
  return structuredClone(readJson(join2(root, "assets", name)));
}
function unique2(values) {
  return [...new Set(values)];
}
function splitLines(value) {
  return value ? value.split(/\r?\n/) : [];
}
function prepareCloseout(options) {
  if (options.requestSource !== void 0 && options.requestText !== void 0) {
    throw new Error("requestSource and requestText are mutually exclusive");
  }
  if (!options.runId.trim()) throw new Error("runId is required");
  if (!options.requestRef.trim()) throw new Error("requestRef is required");
  const requestedRepository = resolve5(options.repo);
  const repository = resolve5(git(requestedRepository, "rev-parse", "--show-toplevel"));
  const bundleDirectory = join2(resolve5(options.evidenceHome), "mister-clean", options.runId);
  if (existsSync2(bundleDirectory)) {
    throw new Error(`refusing to overwrite existing run directory: ${bundleDirectory}`);
  }
  mkdirSync(bundleDirectory, { recursive: true });
  const templates = options.templateRoot ?? packageRoot();
  const now = isoTimestamp2((options.now ?? (() => /* @__PURE__ */ new Date()))());
  const head = git(repository, "rev-parse", "HEAD");
  const branch = git(repository, "branch", "--show-current") || "detached";
  const repoId = repositoryIdentity(repository);
  const upstream = runGit(
    repository,
    ["rev-parse", "--symbolic-full-name", "@{upstream}"],
    [0, 128]
  ).stdout;
  const targetRef = upstream || (branch === "detached" ? head : `refs/heads/${branch}`);
  const targetCommit = git(repository, "rev-parse", targetRef);
  const mergeBase = git(repository, "merge-base", targetCommit, head);
  const divergence = git(
    repository,
    "rev-list",
    "--left-right",
    "--count",
    `${targetCommit}...${head}`
  ).split(/\s+/);
  const left = Number(divergence[0] ?? 0);
  const right = Number(divergence[1] ?? 0);
  let requestBytes;
  if (options.requestSource !== void 0) requestBytes = readFileSync3(options.requestSource);
  else if (options.requestText !== void 0) requestBytes = Buffer.from(options.requestText, "utf8");
  else requestBytes = Buffer.from(options.requestRef, "utf8");
  const requestSha256 = sha2562(requestBytes);
  let requestSource = null;
  let sourceKind = "reference_only";
  if (options.requestSource !== void 0 || options.requestText !== void 0) {
    const path = join2(bundleDirectory, "operative-request.txt");
    writeFileSync2(path, requestBytes);
    requestSource = { path: "operative-request.txt", sha256: sha256File(path) };
    sourceKind = "exact_bytes";
  }
  const criteriaIds = unique2(options.criteria ?? []);
  writeJson(join2(bundleDirectory, "criteria-source.json"), {
    record_type: "mister-clean.criteria-source",
    request_ref: options.requestRef,
    request_sha256: requestSha256,
    criteria_ids: criteriaIds
  });
  const planningRoots = discoverPlanningRoots(repository);
  const planningAudit = auditPlanningRepository(repository);
  const unclassifiedPlanningPaths = new Set(
    planningAudit.findings.filter((finding2) => finding2.code === "planning_input_unparsed").map((finding2) => finding2.path)
  );
  writeJson(join2(bundleDirectory, "planning-audit.json"), planningAudit);
  const planningAuditRef = {
    path: "planning-audit.json",
    sha256: sha256File(join2(bundleDirectory, "planning-audit.json"))
  };
  let planningSystems;
  if (planningRoots.length) {
    planningSystems = planningRoots.map((rootText, index) => {
      const root = join2(repository, ...rootText.split("/"));
      const rootStat = lstatSync3(root);
      const rootFiles = rootStat.isFile() ? [root] : rootStat.isDirectory() ? listFilesRecursively(root) : [];
      const artifacts = rootFiles.filter((path) => !relative5(repository, path).split(sep5).includes(".git")).map((path) => {
        const repoPath = relative5(repository, path).split(sep5).join("/");
        return {
          path: repoPath,
          class: unclassifiedPlanningPaths.has(repoPath) ? "unclassified" : planningClass(repoPath),
          sha256: sha256File(path)
        };
      });
      const unclassified = artifacts.filter((artifact) => artifact.class === "unclassified").length;
      return {
        id: `repository-planning-${index + 1}`,
        kind: "repo_files",
        sources: [rootText],
        schema_sources: ["repository lane/artifact convention; verify manually"],
        validators: ["mister-clean audit planning --json <repository>", "mister-clean live planning census"],
        corpus: {
          roots: [rootText],
          include_globs: ["**/*"],
          total: artifacts.length,
          classified: artifacts.length - unclassified,
          unclassified,
          artifacts
        }
      };
    });
  } else {
    planningSystems = [
      {
        id: "no-repository-planning",
        kind: "none",
        sources: ["independent shallow root scan"],
        schema_sources: ["no planning schema found"],
        validators: ["mister-clean planning discovery"],
        corpus: {
          roots: [],
          include_globs: [],
          total: 0,
          classified: 0,
          unclassified: 0,
          artifacts: []
        }
      }
    ];
  }
  const worktrees = parseWorktrees(repository).map((row) => {
    const path = resolve5(row.worktree);
    const dirtyCount = splitLines(git(path, "status", "--porcelain=v1", "--untracked-files=all")).length;
    return {
      path,
      head: row.head ?? "",
      branch: row.branch ?? "detached",
      dirty_count: dirtyCount,
      owner: "unassigned",
      purpose: "discovered during closeout",
      disposition: "requires reconciliation"
    };
  });
  const branches = splitLines(
    git(repository, "for-each-ref", "--format=%(refname:short)%09%(objectname)", "refs/heads")
  ).map((line) => {
    const [name = "", commit = ""] = line.split("	", 2);
    return {
      name,
      commit,
      merged: isGitAncestor(repository, commit, head),
      owner: "unassigned",
      purpose: "discovered during closeout",
      disposition: "requires reconciliation"
    };
  });
  const remoteRefs = splitLines(
    git(repository, "for-each-ref", "--format=%(refname)%09%(objectname)", "refs/remotes")
  ).map((line) => line.split("	", 2)).filter(([name]) => !name?.endsWith("/HEAD")).map(([name = "", commit = ""]) => ({
    name,
    commit,
    merged: isGitAncestor(repository, commit, head),
    owner: "unassigned",
    purpose: "discovered during closeout",
    disposition: "requires reconciliation"
  }));
  const stashes = splitLines(git(repository, "stash", "list", "--format=%gd%09%H%09%gs"));
  const currentCandidates = ["CURRENT-STATE.md", "docs/CURRENT-STATE.md", "_STATUS.md", "README.md"];
  const currentPath = currentCandidates.find((candidate) => existsSync2(join2(repository, candidate)));
  let policyRef = null;
  let targetObservation;
  if (upstream) {
    const remote = git(repository, "config", "--get", `branch.${branch}.remote`);
    const remoteRef = git(repository, "config", "--get", `branch.${branch}.merge`);
    targetObservation = {
      kind: "remote_ref_resolution",
      local_ref: upstream,
      remote,
      remote_ref: remoteRef,
      commit: targetCommit,
      observed_at: now
    };
  } else {
    writeJson(join2(bundleDirectory, "local-target-policy.json"), {
      record_type: "mister-clean.local-target-policy",
      policy_ref: "no configured upstream; current branch is the conservative local target"
    });
    policyRef = {
      path: "local-target-policy.json",
      sha256: sha256File(join2(bundleDirectory, "local-target-policy.json"))
    };
    targetObservation = {
      kind: "local_ref_resolution",
      local_ref: targetRef,
      commit: targetCommit,
      observed_at: now,
      policy_evidence: policyRef
    };
  }
  const report = loadTemplate(templates, "closeout-report.json");
  const validationDebtClasses = /* @__PURE__ */ new Set([
    "acceptance_cascade_unexecuted",
    "acceptance_gate_unknown",
    "completed_parent_unexecuted_acceptance"
  ]);
  const planningDebts = planningAudit.findings.map((finding2, index) => ({
    id: `DEBT-PLANNING-${String(index + 1).padStart(4, "0")}`,
    class: finding2.code,
    procedure: `${finding2.code}: ${finding2.path}: ${finding2.detail}`,
    state: "open",
    disposition: validationDebtClasses.has(finding2.code) ? "autonomously_validate" : "autonomously_repair",
    evidence: [{
      kind: "planning_census",
      object: finding2.subject,
      command: "mister-clean audit planning --json <repository>",
      result: finding2.code,
      observed_at: now,
      evidence_ref: planningAuditRef
    }]
  }));
  Object.assign(report, {
    generated_at: now,
    repo: { id: repoId, commit: head, branch },
    mode: "CLOSE",
    actions: [],
    completion_debts: planningDebts,
    residuals: [],
    acceptance_criteria: criteriaIds.map((id) => ({
      id,
      source: "operator",
      met: false,
      evidence: ["not yet assessed"]
    })),
    verdict: "NOT_CLEAN",
    debt_census: { discovered: planningDebts.length, paid: 0, accepted_exception: 0 }
  });
  if (planningDebts.length > 0) {
    Object.assign(asObject(asObject(report.dimensions, "closeout-report.dimensions").completion_debt, "closeout-report.dimensions.completion_debt"), {
      state: "open",
      evidence: [{ kind: "debt_census", object: head, command: "mister-clean audit planning --json <repository>", result: `${planningDebts.length} open planning debts`, observed_at: now }],
      notes: ["Executable planning audit found payable successor-readiness debt."]
    });
    Object.assign(asObject(asObject(report.dimensions, "closeout-report.dimensions").planning_integrity, "closeout-report.dimensions.planning_integrity"), {
      state: "open",
      evidence: [{ kind: "planning_census", object: head, command: "mister-clean audit planning --json <repository>", result: `${planningDebts.length} findings`, observed_at: now }],
      notes: ["Physical lanes, structured metadata, exact parent projections, and acceptance-gate identity do not yet agree."]
    });
  }
  asObject(report.authorization_basis, "closeout-report.authorization_basis").ref = options.requestRef;
  report.scope = { included: [`repository:${repoId}`], excluded: [], policy_sources: [] };
  report.target_binding = {
    target_ref: targetRef,
    target_commit: targetCommit,
    candidate_commit: head,
    merge_base: mergeBase,
    target_commits_missing: left,
    candidate_commits_ahead: right,
    target_incorporated: left === 0 && mergeBase === targetCommit,
    measured_at: now,
    evidence: [`git merge-base + rev-list --left-right --count => ${left}/${right}`]
  };
  const manifest = loadTemplate(templates, "action-manifest.json");
  manifest.repo = { id: repoId, commit: head };
  manifest.request_ref = options.requestRef;
  asObject(manifest.authorization_basis, "action-manifest.authorization_basis").ref = options.requestRef;
  writeJson(join2(bundleDirectory, "debris-census.json"), {
    record_type: "mister-clean.debris-census",
    removed: 0,
    retained: 0,
    unclassified: 0
  });
  writeJson(join2(bundleDirectory, "independent-review.json"), {
    record_type: "mister-clean.independent-review",
    observed_at: now,
    mechanism: "not yet run",
    status: "not_run",
    reviewer: "not-assigned",
    implementer: `mister-clean:${options.runId}`,
    candidate_commit: head,
    reviewer_execution: { harness: "not-assigned", session_id: "not-assigned", receipt_id: "not-assigned" },
    implementer_execution: { harness: "local", session_id: options.runId, receipt_id: `prepare-${options.runId}` },
    criteria_ids: criteriaIds,
    planning_system_ids: planningSystems.map((item) => item.id),
    findings_total: 0,
    findings_paid: 0,
    unresolved: 0
  });
  const bundle = loadTemplate(templates, "closure-bundle.json");
  Object.assign(bundle, {
    run_id: options.runId,
    request_ref: options.requestRef,
    custody: { mode: "sidecar", subject_commit: head, evidence_root: null, evidence_paths: [] },
    criteria_discovery: {
      source_kind: sourceKind,
      request_source: requestSource,
      source_refs: [
        { path: "criteria-source.json", sha256: sha256File(join2(bundleDirectory, "criteria-source.json")) }
      ],
      request_sha256: requestSha256,
      discovered_count: criteriaIds.length,
      none_found: criteriaIds.length === 0,
      criteria_ids: criteriaIds
    },
    change_inventory: { start_commit: head, subject_commit: head, changes: [] },
    planning_discovery: { unknown: unclassifiedPlanningPaths.size > 0, systems: planningSystems }
  });
  bundle.successor_readiness = {
    snapshots: {
      start: {
        kind: "repository_snapshot",
        object: head,
        command: "git rev-parse HEAD plus full topology census",
        result: head,
        observed_at: now
      },
      end: {
        kind: "repository_snapshot",
        object: head,
        command: "initial scaffold; closing snapshot not yet taken",
        result: head,
        observed_at: now
      }
    },
    target_observation: targetObservation,
    topology: {
      worktrees,
      branches,
      remote_refs: remoteRefs,
      stashes,
      processes: [],
      dirty: worktrees.filter((item) => item.dirty_count > 0).length,
      unowned: worktrees.length + branches.length + remoteRefs.length,
      unmerged: [...branches, ...remoteRefs].filter((item) => !item.merged).length,
      blocking_processes: 0
    },
    current_state: currentPath ? {
      state: "candidate_unverified",
      path: currentPath,
      sha256: sha256File(join2(repository, currentPath)),
      commit: head,
      generator: "discovered candidate; requires explicit designation",
      designation: null
    } : {
      state: "missing",
      path: null,
      sha256: null,
      commit: head,
      generator: "not yet created",
      designation: null
    },
    gates: [],
    debris: {
      removed: 0,
      retained: 0,
      unclassified: 0,
      evidence: [
        { path: "debris-census.json", sha256: sha256File(join2(bundleDirectory, "debris-census.json")) }
      ]
    },
    handoff: {
      entrypoints: currentPath ? [currentPath] : [],
      next_owner: "unassigned-by-policy",
      next_action: "pay the first open debt discovered by Mister Clean"
    },
    final_review: {
      mechanism: "not yet run",
      status: "not_run",
      reviewer: "not-assigned",
      implementer: `mister-clean:${options.runId}`,
      reviewer_execution: { harness: "not-assigned", session_id: "not-assigned", receipt_id: "not-assigned" },
      implementer_execution: { harness: "local", session_id: options.runId, receipt_id: `prepare-${options.runId}` },
      criteria_reviewed: false,
      planning_reviewed: false,
      findings_total: 0,
      findings_paid: 0,
      unresolved: 0,
      evidence_ref: {
        path: "independent-review.json",
        sha256: sha256File(join2(bundleDirectory, "independent-review.json"))
      }
    }
  };
  writeJson(join2(bundleDirectory, "action-manifest.json"), manifest);
  writeJson(join2(bundleDirectory, "closeout-report.json"), report);
  bundle.manifest = {
    path: "action-manifest.json",
    sha256: sha256File(join2(bundleDirectory, "action-manifest.json"))
  };
  bundle.report = {
    path: "closeout-report.json",
    sha256: sha256File(join2(bundleDirectory, "closeout-report.json"))
  };
  const bundlePath = join2(bundleDirectory, "closure-bundle.json");
  writeJson(bundlePath, bundle);
  return { bundleDirectory, bundlePath };
}

// src/closeout/engine.ts
var nodeCloseoutEngine = {
  prepare: prepareCloseout,
  validateRecord(kind, data, allowPlaceholders = false) {
    return kind === "report" ? validateReport(data, allowPlaceholders) : validateManifest(data, allowPlaceholders);
  },
  validateBundle: validateBundleFile,
  detectStack,
  async auditPlanning(root) {
    return auditPlanningRepository(root);
  },
  async scanPublicSafety(root, denylistPath) {
    return scanPublicSafety(root, await loadDenylist(denylistPath));
  },
  generateManifest
};

// src/cli.ts
var UsageError = class extends Error {
};
function defaultIO() {
  return {
    stdout: (line) => process.stdout.write(`${line}
`),
    stderr: (line) => process.stderr.write(`${line}
`)
  };
}
function removeFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}
function removeOption(args, option, required = false) {
  const index = args.indexOf(option);
  if (index < 0) {
    if (required) throw new UsageError(`${option} is required`);
    return void 0;
  }
  const value = args[index + 1];
  if (value === void 0 || value.startsWith("--")) throw new UsageError(`${option} requires a value`);
  args.splice(index, 2);
  return value;
}
function removeRepeatedOption(args, option) {
  const values = [];
  while (args.includes(option)) values.push(removeOption(args, option, true));
  return values;
}
function assertNoArgs(args) {
  if (args.length) throw new UsageError(`unexpected argument(s): ${args.join(" ")}`);
}
function inside(root, candidate) {
  const rootPath = resolve6(root);
  const candidatePath = resolve6(candidate);
  const relation = relative6(
    existsSync3(rootPath) ? realpathSync2(rootPath) : rootPath,
    existsSync3(candidatePath) ? realpathSync2(candidatePath) : candidatePath
  );
  return relation === "" || !relation.startsWith(`..${sep6}`) && relation !== ".." && !relation.startsWith("/");
}
function readJson2(path) {
  return JSON.parse(readFileSync4(path, "utf8"));
}
async function runPrepare(args, io) {
  const repo = removeOption(args, "--repo", true);
  const evidenceHome = removeOption(args, "--evidence-home", true);
  const runId = removeOption(args, "--run-id", true);
  const requestRef = removeOption(args, "--request-ref", true);
  const requestSource = removeOption(args, "--request-source");
  const requestText = removeOption(args, "--request-text");
  const criteria = removeRepeatedOption(args, "--criterion");
  assertNoArgs(args);
  if (requestSource !== void 0 && requestText !== void 0) {
    throw new UsageError("--request-source and --request-text are mutually exclusive");
  }
  const prepared = nodeCloseoutEngine.prepare({
    repo,
    evidenceHome,
    runId,
    requestRef,
    ...requestSource === void 0 ? {} : { requestSource },
    ...requestText === void 0 ? {} : { requestText },
    criteria
  });
  io.stdout(prepared.bundleDirectory);
  return 0;
}
async function runValidate(args, io) {
  const kind = args.shift();
  const path = args.shift();
  if (!kind || !(/* @__PURE__ */ new Set(["report", "manifest", "bundle"])).has(kind)) {
    throw new UsageError("validate requires report, manifest, or bundle");
  }
  if (!path) throw new UsageError(`validate ${kind} requires a path`);
  const template = removeFlag(args, "--template");
  const structural = removeFlag(args, "--structural");
  const repo = removeOption(args, "--repo");
  assertNoArgs(args);
  if (kind !== "bundle" && (structural || repo !== void 0)) {
    throw new UsageError("--structural and --repo are only valid for bundle validation");
  }
  if (template && !inside(join3(packageRoot(import.meta.url), "assets"), path)) {
    io.stderr("ERROR: --template is only valid for the skill's bundled assets/ templates; a real record must validate without placeholders");
    return 2;
  }
  if (kind === "bundle") {
    const result = await nodeCloseoutEngine.validateBundle(path, {
      allowPlaceholders: template,
      verifyLive: !structural,
      ...repo === void 0 ? {} : { repoPath: repo }
    });
    if (!result.ok) {
      result.errors.forEach((error) => io.stderr(`ERROR: ${error}`));
      if (result.failureKind === "load") return 2;
      io.stderr(`FAIL errors=${result.errors.length}`);
      return 1;
    }
    io.stdout(`PASS kind=bundle path=${path} live=${!structural}`);
    return 0;
  }
  let data;
  try {
    data = readJson2(path);
  } catch (error) {
    io.stderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  const errors = nodeCloseoutEngine.validateRecord(kind === "report" ? "report" : "manifest", data, template);
  if (errors.length) {
    errors.forEach((error) => io.stderr(`ERROR: ${error}`));
    io.stderr(`FAIL errors=${errors.length}`);
    return 1;
  }
  io.stdout(`PASS kind=${kind} path=${path}`);
  return 0;
}
async function runDetect(args, io) {
  if (args.shift() !== "stack") throw new UsageError("detect requires stack");
  const root = args.shift();
  if (!root) throw new UsageError("detect stack requires a repository path");
  const listOnly = removeFlag(args, "--list");
  assertNoArgs(args);
  if (!existsSync3(root) || !statSync2(root).isDirectory()) {
    io.stderr(`ERROR: not a directory: ${resolve6(root)}`);
    return 2;
  }
  const result = await nodeCloseoutEngine.detectStack(root);
  if (result.status === "unknown") {
    io.stdout("NO KNOWN ECOSYSTEM DETECTED -- inspect manually; adapter checks may not be silently skipped");
    return result.exitCode;
  }
  io.stdout(`detected: ${result.ecosystems.join(" ")}`);
  if (listOnly) return 0;
  const reference = join3(packageRoot(import.meta.url), "references", "stack-adapters.md");
  if (!existsSync3(reference)) return 0;
  const text2 = readFileSync4(reference, "utf8");
  for (const ecosystem of result.ecosystems) {
    const header = `## ${ecosystem}`;
    const start = text2.indexOf(header);
    if (start < 0) continue;
    const next = text2.indexOf("\n## ", start + header.length);
    io.stdout(`
${text2.slice(start, next < 0 ? void 0 : next).trimEnd()}`);
  }
  return 0;
}
async function runAudit(args, io) {
  const kind = args.shift();
  if (!(/* @__PURE__ */ new Set(["planning", "public-safety"])).has(String(kind))) {
    throw new UsageError("audit requires planning or public-safety");
  }
  const root = args[0]?.startsWith("--") === false ? args.shift() : process.cwd();
  if (kind === "planning") {
    const json = removeFlag(args, "--json");
    assertNoArgs(args);
    const result2 = await nodeCloseoutEngine.auditPlanning(root);
    if (json) io.stdout(JSON.stringify(result2, null, 2));
    else {
      for (const finding2 of result2.findings) {
        io.stdout(`${finding2.code}	${finding2.path}	${finding2.subject}	${finding2.detail}`);
      }
      io.stdout(`planning: ${result2.status.toLocaleUpperCase("und")} artifacts=${result2.artifactCount} structured=${result2.structuredArtifactCount} findings=${result2.findings.length}`);
    }
    return result2.exitCode;
  }
  const denylist = removeOption(args, "--denylist-file");
  assertNoArgs(args);
  const result = await nodeCloseoutEngine.scanPublicSafety(root, denylist);
  for (const finding2 of result.findings) io.stdout(`${finding2.path}:${finding2.line}: ${finding2.rule}`);
  if (result.status === "fail") io.stderr(`public-safety: FAIL (${result.findings.length} finding(s))`);
  else io.stdout("public-safety: PASS");
  return result.exitCode;
}
async function runManifest(args, io) {
  const root = args.shift() ?? packageRoot(import.meta.url);
  const check = removeFlag(args, "--check");
  assertNoArgs(args);
  const result = await nodeCloseoutEngine.generateManifest(root);
  const path = join3(resolve6(root), "MANIFEST.sha256");
  if (check) {
    if (!existsSync3(path) || readFileSync4(path, "utf8") !== result.content) {
      io.stderr("manifest: FAIL (MANIFEST.sha256 is stale)");
      return 1;
    }
    io.stdout(`manifest: PASS (${result.entries.length} entries)`);
    return 0;
  }
  writeFileSync3(path, result.content, "utf8");
  io.stdout(`manifest: wrote ${result.entries.length} entries`);
  return 0;
}
function usage(io) {
  io.stderr("usage: mister-clean <prepare|validate|detect|audit|manifest> ... (audit: planning|public-safety)");
}
async function runCli(argv, io = defaultIO()) {
  const args = [...argv];
  const command = args.shift();
  try {
    if (command === "prepare") return await runPrepare(args, io);
    if (command === "validate") return await runValidate(args, io);
    if (command === "detect") return await runDetect(args, io);
    if (command === "audit") return await runAudit(args, io);
    if (command === "manifest") return await runManifest(args, io);
    usage(io);
    return 2;
  } catch (error) {
    io.stderr(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof UsageError) usage(io);
    return 2;
  }
}
function isDirectInvocation(argvPath, moduleUrl) {
  if (!argvPath) return false;
  try {
    return realpathSync2(argvPath) === realpathSync2(fileURLToPath2(moduleUrl));
  } catch {
    const invokedPath = resolve6(argvPath);
    return invokedPath === fileURLToPath2(moduleUrl) || pathToFileURL(invokedPath).href === moduleUrl;
  }
}
if (isDirectInvocation(process.argv[1], import.meta.url)) {
  process.exitCode = await runCli(process.argv.slice(2));
}
export {
  isDirectInvocation,
  runCli
};
