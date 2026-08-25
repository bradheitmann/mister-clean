#!/usr/bin/env python3
"""Validate Mister Clean action manifests and closeout reports."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


DIMENSION_STATES = {"satisfied", "open", "blocked", "not_assessed", "not_applicable"}
CLAIM_STATES = {"established", "not_established", "not_assessed", "not_applicable"}
DEBT_STATES = {"satisfied", "open", "blocked", "deferred", "not_assessed"}
RECOMMENDATIONS = {"proceed", "proceed_with_conditions", "do_not_proceed", "not_assessed"}
MODES = {"AUDIT", "CLEAN", "CLOSE", "CONFORM"}
EXECUTION_STATES = {"authorized", "executed"}
RISKS = {"reversible_local", "consequential_external", "unrecoverable"}
AUTH_STATES = {"granted"}
STANDING_AUTH_SOURCES = {"skill_invocation", "explicit_user", "explicit_operator"}
CONSEQUENTIAL_KINDS = {
    "git_push",
    "branch_delete_local",
    "branch_delete_remote",
    "worktree_remove",
    "process_signal",
    "tracker_write",
}
PROHIBITED_KINDS = {
    "history_rewrite",
    "force_push",
    "secret_destroy",
    "production_deploy",
    "production_mutation",
    "external_dispatch",
}
ALLOWED_ACTION_KINDS = {
    # Dispatch of a review/work agent THROUGH THE OPERATIVE ORCHESTRATION
    # PARADIGM -- in-session subagent OR externally orchestrated visible agent
    # (cmux/tmux surface via a central orchestrator), whichever the
    # environment sanctions. Distinct from prohibited external_dispatch,
    # which means humans or third-party services that incur cost or affect
    # non-consenting parties.
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
    "handoff_update",
}
PLACEHOLDER = re.compile(r"<[^<>]+>")
GENERIC_FILLER = {"measured", "fixture-value", "n/a", "na", "done", "ok",
                  "verified", "pass", "true", "yes", "-", "tbd", "todo",
                  "checked", "clean", "good"}


def _is_generic(v):
    """A single generic adjective/filler token is not evidence."""
    if isinstance(v, str):
        return v.strip().casefold() in GENERIC_FILLER or len(v.strip()) < 3
    if isinstance(v, (list, tuple)):
        return all(_is_generic(x) for x in v) if v else True
    return False
def _debt_meaningful(x):
    if isinstance(x, str):
        return bool(x.strip())
    if isinstance(x, dict):
        return any(_debt_meaningful(v) for v in x.values())
    if isinstance(x, list):
        return any(_debt_meaningful(v) for v in x)
    return x is not None


DISPOSITIONS = {
    "autonomously_repair",
    "autonomously_validate",
    "accepted_exception",
    "decision_or_coordination_required",
}
VERDICTS = {"CLEAN", "NOT_CLEAN"}
OPEN_DEBT_STATES = {"open", "blocked", "not_assessed"}
STALE_DOC_CLASSES = {"stale_doc", "stale_comment", "stale_documentation", "doc_drift"}
OPERATOR_ACTORS = {"operator", "principal"}


def _norm_actor(s):
    return " ".join(str(s).split()).casefold() if s is not None else ""


def _criterion_waived(c):
    """An unmet acceptance criterion is only waived by a well-formed waiver, and
    an OPERATOR-source criterion may be waived ONLY by the operator."""
    w = c.get("waiver")
    if not (isinstance(w, dict) and nonempty(w.get("actor")) and nonempty(w.get("ref"))):
        return False
    if c.get("source") in OPERATOR_ACTORS and _norm_actor(w.get("actor")) not in OPERATOR_ACTORS:
        return False
    return True
REQUIRED_DIMENSIONS = {
    "completion_debt",
    "repository_state",
    "planning_integrity",
    "verification",
    "handoff_readiness",
}
REQUIRED_CLAIMS = {
    "committed_locally",
    "pushed",
    "ci_green_on_push",
    "deployed",
    "independently_qa_accepted",
}


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def require_keys(obj: Any, keys: set[str], path: str, errors: list[str]) -> None:
    if not isinstance(obj, dict):
        errors.append(f"{path}: expected object")
        return
    for key in sorted(keys - set(obj)):
        errors.append(f"{path}.{key}: missing")


def find_placeholders(value: Any, path: str = "$") -> list[str]:
    found: list[str] = []
    if isinstance(value, str) and PLACEHOLDER.search(value):
        found.append(path)
    elif isinstance(value, dict):
        for key, item in value.items():
            found.extend(find_placeholders(item, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            found.extend(find_placeholders(item, f"{path}[{index}]"))
    return found


def validate_authorization_basis(basis: Any, path: str, errors: list[str]) -> None:
    require_keys(basis, {"source", "ref", "scope", "standing"}, path, errors)
    if not isinstance(basis, dict):
        return
    if basis.get("source") not in STANDING_AUTH_SOURCES:
        errors.append(f"{path}.source: expected skill_invocation, explicit_user, or explicit_operator")
    if not nonempty(basis.get("ref")):
        errors.append(f"{path}.ref: required")
    if basis.get("scope") != "named_repository_and_current_task":
        errors.append(f"{path}.scope: expected named_repository_and_current_task")
    if basis.get("standing") is not True:
        errors.append(f"{path}.standing: expected true")


def validate_report(data: Any, allow_placeholders: bool = False) -> list[str]:
    errors: list[str] = []
    require_keys(
        data,
        {
            "record_type",
            "schema_version",
            "generated_at",
            "repo",
            "mode",
            "authorization_basis",
            "scope",
            "dimensions",
            "completion_debts",
            "claims",
            "actions",
            "residuals",
            "handoff_assessment",
            "verdict",
        },
        "$",
        errors,
    )
    if errors:
        return errors
    if data["record_type"] != "mister-clean.closeout":
        errors.append("$.record_type: expected mister-clean.closeout")
    if data["schema_version"] != "1.0":
        errors.append("$.schema_version: expected 1.0")
    if data["mode"] not in MODES:
        errors.append(f"$.mode: unsupported value {data['mode']!r}")
    validate_authorization_basis(data["authorization_basis"], "$.authorization_basis", errors)

    dimensions = data["dimensions"]
    require_keys(dimensions, REQUIRED_DIMENSIONS, "$.dimensions", errors)
    if isinstance(dimensions, dict):
        for name in REQUIRED_DIMENSIONS & set(dimensions):
            item = dimensions[name]
            require_keys(item, {"state", "evidence", "notes"}, f"$.dimensions.{name}", errors)
            if isinstance(item, dict):
                state = item.get("state")
                evidence = item.get("evidence")
                if state not in DIMENSION_STATES:
                    errors.append(f"$.dimensions.{name}.state: unsupported value {state!r}")
                if not isinstance(evidence, list):
                    errors.append(f"$.dimensions.{name}.evidence: expected array")
                elif state == "satisfied" and not evidence:
                    errors.append(f"$.dimensions.{name}: satisfied requires evidence")

    debts = data["completion_debts"]
    if not isinstance(debts, list):
        errors.append("$.completion_debts: expected array")
        debts = []
    for index, debt in enumerate(debts):
        path = f"$.completion_debts[{index}]"
        require_keys(debt, {"id", "procedure", "state", "evidence"}, path, errors)
        if not isinstance(debt, dict):
            continue
        state = debt.get("state")
        if state not in DEBT_STATES:
            errors.append(f"{path}.state: unsupported value {state!r}")
        if state == "blocked":
            require_keys(debt, {"blocker", "next_owner", "next_action"}, path, errors)
            if not debt.get("evidence"):
                errors.append(f"{path}.evidence: blocked debt requires evidence")
            for field in ("blocker", "next_owner", "next_action"):
                if not nonempty(debt.get(field)):
                    errors.append(f"{path}.{field}: required for blocked debt")
        if state == "deferred":
            ruling = debt.get("ruling")
            require_keys(ruling, {"actor", "date", "reason", "ref", "next_owner"}, f"{path}.ruling", errors)
            if isinstance(ruling, dict):
                for field in ("actor", "date", "reason", "ref", "next_owner"):
                    if not nonempty(ruling.get(field)):
                        errors.append(f"{path}.ruling.{field}: required for deferred debt")

    claims = data["claims"]
    require_keys(claims, REQUIRED_CLAIMS, "$.claims", errors)
    if isinstance(claims, dict):
        for name in REQUIRED_CLAIMS & set(claims):
            item = claims[name]
            require_keys(item, {"state", "evidence"}, f"$.claims.{name}", errors)
            if not isinstance(item, dict):
                continue
            state = item.get("state")
            evidence = item.get("evidence")
            if state not in CLAIM_STATES:
                errors.append(f"$.claims.{name}.state: unsupported value {state!r}")
            if not isinstance(evidence, list):
                errors.append(f"$.claims.{name}.evidence: expected array")
                continue
            if state == "established" and not evidence:
                errors.append(f"$.claims.{name}: established requires evidence")
            if state == "established":
                validate_established_claim(name, evidence, errors)

    assessment = data["handoff_assessment"]
    require_keys(assessment, {"recommendation", "reasons", "conditions"}, "$.handoff_assessment", errors)
    recommendation = assessment.get("recommendation") if isinstance(assessment, dict) else None
    if recommendation not in RECOMMENDATIONS:
        errors.append(f"$.handoff_assessment.recommendation: unsupported value {recommendation!r}")
    if isinstance(assessment, dict):
        if recommendation in {"proceed", "proceed_with_conditions", "do_not_proceed"} and not assessment.get("reasons"):
            errors.append("$.handoff_assessment.reasons: recommendation requires reasons")
        if recommendation == "proceed_with_conditions" and not assessment.get("conditions"):
            errors.append("$.handoff_assessment.conditions: conditional recommendation requires conditions")

    debt_states = {d.get("state") for d in debts if isinstance(d, dict)}
    if recommendation == "proceed" and debt_states & {"open", "blocked", "deferred", "not_assessed"}:
        errors.append("$.handoff_assessment: unconditional proceed conflicts with unresolved or deferred completion debt")
    if recommendation == "proceed" and isinstance(dimensions, dict):
        unresolved = {
            name
            for name, item in dimensions.items()
            if isinstance(item, dict) and item.get("state") in {"open", "blocked", "not_assessed"}
        }
        if unresolved:
            errors.append("$.handoff_assessment: unconditional proceed conflicts with unresolved dimensions: " + ", ".join(sorted(unresolved)))

    # --- v5 ruling: verdict gating, dispositions, provenance honesty ---
    verdict = data.get("verdict")
    if verdict not in VERDICTS:
        errors.append(f"$.verdict: required, CLEAN or NOT_CLEAN (got {verdict!r})")
    debts = data.get("completion_debts") or []
    seen_ids = set()
    docr = []
    for i, d in enumerate(debts):
        if not isinstance(d, dict):
            errors.append(f"$.completion_debts[{i}]: expected object")
            continue
        did = d.get("id")
        if not nonempty(did):
            errors.append(f"$.completion_debts[{i}].id: required nonempty")
        elif did in seen_ids:
            errors.append(f"$.completion_debts[{i}].id: duplicate {did!r}")
        else:
            seen_ids.add(did)
        if not nonempty(d.get("procedure")):
            errors.append(f"$.completion_debts[{i}].procedure: required nonempty")
        disp = d.get("disposition")
        if disp is None:
            errors.append(f"$.completion_debts[{i}].disposition: required (one of {sorted(DISPOSITIONS)})")
        elif disp not in DISPOSITIONS:
            errors.append(f"$.completion_debts[{i}].disposition: unsupported {disp!r}")
        if disp == "accepted_exception":
            for k in ("authority", "scope", "rationale"):
                if not nonempty(d.get(k)):
                    errors.append(f"$.completion_debts[{i}].{k}: required for accepted_exception")
        if d.get("class") in STALE_DOC_CLASSES and disp == "accepted_exception":
            errors.append(f"$.completion_debts[{i}].disposition: a reviewer-reported stale doc/comment is PAYABLE regardless of severity label -- accepted_exception is for irreparable historical limits only; fix the doc before CLEAN")
        if disp == "decision_or_coordination_required":
            docr.append(did or f"#{i}")
        if d.get("state") == "satisfied":
            ev = d.get("evidence")
            if isinstance(ev, str):
                errors.append(f"$.completion_debts[{i}].evidence: satisfied debt requires a TYPED evidence list, not a bare string")
            elif not (isinstance(ev, list) and any(_debt_meaningful(x) for x in ev)):
                errors.append(f"$.completion_debts[{i}].evidence: satisfied debt requires a nonempty list of meaningful entries")
    # residuals must be typed; CLEAN constrains their kinds
    residuals = data.get("residuals") or []
    for i, r in enumerate(residuals):
        if not isinstance(r, dict):
            errors.append(f"$.residuals[{i}]: expected object with kind (roadmap|accepted_exception|blocked)")
            continue
        rk = r.get("kind")
        if rk not in ("roadmap", "accepted_exception", "blocked"):
            errors.append(f"$.residuals[{i}].kind: required, one of roadmap|accepted_exception|blocked")
        elif rk == "accepted_exception":
            for k in ("authority", "scope", "rationale"):
                if not nonempty(r.get(k)):
                    errors.append(f"$.residuals[{i}].{k}: required for accepted_exception residual")
        elif rk == "roadmap":
            if not nonempty(r.get("represented_at")):
                errors.append(f"$.residuals[{i}].represented_at: roadmap residual must cite where it is consistently represented")
        if r.get("class") in STALE_DOC_CLASSES:
            errors.append(f"$.residuals[{i}]: a reviewer-reported stale doc/comment is payable debt, not a residual -- move it to completion_debts and fix it before CLEAN")
    # acceptance_criteria: a reviewer may NOT downgrade an operator's explicit criterion.
    for i, c in enumerate(data.get("acceptance_criteria") or []):
        if not isinstance(c, dict):
            errors.append(f"$.acceptance_criteria[{i}]: expected object")
            continue
        if not nonempty(c.get("id")):
            errors.append(f"$.acceptance_criteria[{i}].id: required")
        if not isinstance(c.get("met"), bool):
            errors.append(f"$.acceptance_criteria[{i}].met: required boolean")
        if not nonempty(c.get("source")):
            errors.append(f"$.acceptance_criteria[{i}].source: required (who set the criterion, e.g. operator)")
        w = c.get("waiver")
        if w is not None and not (isinstance(w, dict) and nonempty(w.get("actor")) and nonempty(w.get("ref"))):
            errors.append(f"$.acceptance_criteria[{i}].waiver: requires actor AND ref")
        elif isinstance(w, dict) and c.get("source") in OPERATOR_ACTORS and _norm_actor(w.get("actor")) not in OPERATOR_ACTORS:
            errors.append(f"$.acceptance_criteria[{i}].waiver: an operator-source criterion may be waived ONLY by the operator, not by a reviewer ({w.get('actor')!r})")
    if verdict == "CLEAN":
        # debts: only satisfied or bound accepted_exception may remain
        for i, d in enumerate(debts):
            if not isinstance(d, dict):
                continue
            st, disp = d.get("state"), d.get("disposition")
            if st in OPEN_DEBT_STATES:
                errors.append(f"$.verdict: CLEAN forbidden -- completion_debts[{i}] ({d.get('id','?')}) is {st!r} (payable debt remains)")
            elif st == "deferred":
                errors.append(f"$.verdict: CLEAN forbidden -- completion_debts[{i}] ({d.get('id','?')}) is deferred (unpaid work cannot be CLEAN regardless of disposition)")
        for i, c in enumerate(data.get("acceptance_criteria") or []):
            if isinstance(c, dict) and c.get("met") is False and not _criterion_waived(c):
                errors.append(f"$.acceptance_criteria[{i}] ({c.get('id','?')}): CLEAN/positive verdict is INVALID while an acceptance criterion is unmet -- an independent reviewer may not downgrade an operator criterion to a non-blocking nuance; pay it or record an explicit operator waiver (actor+ref)")
        if docr:
            errors.append("$.verdict: CLEAN forbidden -- decision_or_coordination_required present: " + ", ".join(docr))
        for i, r in enumerate(residuals):
            if isinstance(r, dict) and r.get("kind") == "blocked":
                errors.append(f"$.verdict: CLEAN forbidden -- residuals[{i}] is blocked")
        # dimensions: satisfied, or not_applicable with evidence; in CLOSE mode not all N/A
        dims = data.get("dimensions") or {}
        na = 0
        for name in REQUIRED_DIMENSIONS:
            dd = dims.get(name) or {}
            st = dd.get("state")
            if st == "satisfied":
                if _is_generic(dd.get("evidence")):
                    errors.append(f"$.dimensions.{name}: CLEAN requires SPECIFIC satisfied evidence (a command/count/sha/path), not a generic token like 'measured'")
                continue
            if st == "not_applicable":
                na += 1
                if not (dd.get("evidence") or dd.get("notes")):
                    errors.append(f"$.dimensions.{name}: CLEAN requires evidence/notes rationale for not_applicable")
            else:
                errors.append(f"$.dimensions.{name}: CLEAN requires satisfied (or evidenced not_applicable), got {st!r}")
        if data.get("mode") == "CLOSE" and na == len(REQUIRED_DIMENSIONS):
            errors.append("$.dimensions: CLEAN in CLOSE mode cannot mark every dimension not_applicable")
        # claims: CLEAN cannot rest on an UNMEASURED claim set
        for cname, claim in (data.get("claims") or {}).items():
            if not isinstance(claim, dict):
                continue
            cst = claim.get("state")
            if cst in (None, "not_assessed"):
                errors.append(f"$.claims.{cname}: CLEAN forbids an unassessed claim (state={cst!r}); establish it or mark not_applicable with policy_ref")
            elif cst == "established" and _is_generic(claim.get("evidence")):
                errors.append(f"$.claims.{cname}: CLEAN requires SPECIFIC established evidence, not a generic token")
        # census arithmetic: an empty ledger is not a census
        census = data.get("debt_census")
        if not isinstance(census, dict):
            errors.append("$.debt_census: required for CLEAN (discovered/paid/accepted_exception ints; empty ledger is not a census)")
        else:
            try:
                disc = int(census.get("discovered")); paid = int(census.get("paid")); acc = int(census.get("accepted_exception"))
                if disc != paid + acc:
                    errors.append(f"$.debt_census: discovered ({disc}) must equal paid ({paid}) + accepted_exception ({acc})")
                sat = sum(1 for d in debts if isinstance(d, dict) and d.get("state") == "satisfied")
                exc = sum(1 for d in debts if isinstance(d, dict) and d.get("disposition") == "accepted_exception")
                if paid != sat:
                    errors.append(f"$.debt_census.paid ({paid}) != satisfied ledger entries ({sat})")
                if acc != exc:
                    errors.append(f"$.debt_census.accepted_exception ({acc}) != accepted_exception ledger entries ({exc})")
            except (TypeError, ValueError):
                errors.append("$.debt_census: discovered/paid/accepted_exception must be integers")
        rec = (data.get("handoff_assessment") or {}).get("recommendation")
        if rec not in ("proceed",):
            errors.append(f"$.verdict: CLEAN requires handoff_assessment.recommendation 'proceed' (got {rec!r})")
    else:
        rec = (data.get("handoff_assessment") or {}).get("recommendation")
        if rec == "proceed":
            errors.append("$.handoff_assessment.recommendation: unconditional proceed conflicts with NOT_CLEAN verdict")
    # repo binding: a report must be bound to a real object
    if not allow_placeholders:
        repo = data.get("repo") or {}
        import re as _re
        if not (isinstance(repo.get("path"), str) and repo["path"].startswith("/")):
            errors.append("$.repo.path: required absolute path")
        if not (isinstance(repo.get("commit"), str) and _re.fullmatch(r"[0-9a-f]{7,40}", repo.get("commit") or "")):
            errors.append("$.repo.commit: required 7-40 char hex object id")
        if not nonempty(data.get("generated_at")):
            errors.append("$.generated_at: required")
    claims = data.get("claims") or {}
    for name, claim in claims.items():
        if not isinstance(claim, dict):
            continue
        for ev in claim.get("evidence") or []:
            if isinstance(ev, dict) and ev.get("independence") is not None:
                if ev["independence"] not in ("established", "not_established", "legacy_unrecoverable"):
                    errors.append(f"$.claims.{name}: independence must be established|not_established|legacy_unrecoverable")
                elif ev["independence"] == "legacy_unrecoverable":
                    for k in ("authority", "scope"):
                        if not nonempty(ev.get(k)):
                            errors.append(f"$.claims.{name}: legacy_unrecoverable requires {k}")
    # --- withheld-run closure: 4 classes ---
    for name, claim in claims.items():
        if not isinstance(claim, dict):
            continue
        # normalized actor provenance: whitespace/case aliases are the same actor
        for ev in claim.get("evidence") or []:
            if isinstance(ev, dict) and ev.get("kind") == "independent_qa_verdict":
                rv, im = _norm_actor(ev.get("reviewer")), _norm_actor(ev.get("implementer"))
                if rv and im and rv == im and claim.get("state") == "established":
                    errors.append(f"$.claims.{name}: reviewer and implementer normalize to the same actor ({ev.get('reviewer')!r}) -- independence cannot be established")
        # policy-bound N/A: generic rationale is not applicability
        if claim.get("state") == "not_applicable":
            if not nonempty(claim.get("na_reason")) or not nonempty(claim.get("policy_ref")):
                errors.append(f"$.claims.{name}: not_applicable requires na_reason AND policy_ref (a policy-bound citation, not generic rationale)")
    # same-object binding: established object-bearing claims must agree
    _obj = {}
    for name, claim in claims.items():
        if isinstance(claim, dict) and claim.get("state") == "established":
            for ev in claim.get("evidence") or []:
                if isinstance(ev, dict) and nonempty(ev.get("commit")):
                    _obj[name] = ev["commit"]
                    break
    if len(set(_obj.values())) > 1:
        errors.append("$.claims: same-object violation -- established claims bind different commits: " + ", ".join(f"{k}={v}" for k, v in sorted(_obj.items())))
    if verdict == "CLEAN":
        # object identity must also match the report's own bound commit
        _rc = (data.get("repo") or {}).get("commit")
        for k, v in _obj.items():
            if _rc and v != _rc:
                errors.append(f"$.claims.{k}: CLEAN requires claim commit {v!r} to equal repo.commit {_rc!r}")
        # report actions must be finished or explicitly skipped-with-reason
        for i, a in enumerate(data.get("actions") or []):
            if not isinstance(a, dict):
                errors.append(f"$.actions[{i}]: expected object")
                continue
            st = a.get("status")
            if st in ("planned", "failed", "blocked", None):
                errors.append(f"$.actions[{i}]: CLEAN forbidden with unfinished/failed action (status={st!r})")
            elif st == "skipped" and not nonempty(a.get("skip_reason")):
                errors.append(f"$.actions[{i}]: skipped action requires skip_reason")
        # CLOSE mode: the claim set cannot be entirely not_applicable
        if data.get("mode") == "CLOSE" and claims:
            if all(isinstance(c, dict) and c.get("state") == "not_applicable" for c in claims.values()):
                errors.append("$.claims: CLEAN in CLOSE mode cannot mark every claim not_applicable")
    if not allow_placeholders:
        for ppath in find_placeholders(data):
            errors.append(f"{ppath}: unresolved template placeholder")
    return errors


def validate_established_claim(name: str, evidence: list[Any], errors: list[str]) -> None:
    objects = [item for item in evidence if isinstance(item, dict)]
    required: dict[str, set[str]] = {
        "committed_locally": {"kind", "commit"},
        "pushed": {"kind", "remote", "ref", "commit", "observed_at"},
        "ci_green_on_push": {"kind", "provider", "run_id", "commit", "conclusion"},
        "deployed": {"kind", "environment", "deployment_ref", "observed_state", "observed_at"},
        "independently_qa_accepted": {
            "kind",
            "verdict_ref",
            "reviewer",
            "implementer",
            "conclusion",
        },
    }
    fields = required[name]
    if not any(all(nonempty(item.get(field)) for field in fields) for item in objects):
        errors.append(f"$.claims.{name}: evidence must include one object with {', '.join(sorted(fields))}")
    if name == "ci_green_on_push" and not any(item.get("conclusion") == "success" for item in objects):
        errors.append("$.claims.ci_green_on_push: established requires conclusion=success")
    if name == "ci_green_on_push" and not any(item.get("kind") == "established_ci" for item in objects):
        errors.append("$.claims.ci_green_on_push: established requires kind=established_ci")
    expected_kind = {
        "committed_locally": "git_commit",
        "pushed": "remote_ref_resolution",
        "deployed": "observed_deployment",
        "independently_qa_accepted": "independent_qa_verdict",
    }.get(name)
    if expected_kind and not any(item.get("kind") == expected_kind for item in objects):
        errors.append(f"$.claims.{name}: established requires kind={expected_kind}")
    if name == "deployed" and not any(item.get("observed_state") == "active" for item in objects):
        errors.append("$.claims.deployed: established requires observed_state=active")
    if name == "independently_qa_accepted":
        accepted = [
            item
            for item in objects
            if item.get("kind") == "independent_qa_verdict"
            and item.get("conclusion") == "accepted"
            and nonempty(item.get("reviewer"))
            and nonempty(item.get("implementer"))
            and item.get("reviewer") != item.get("implementer")
        ]
        if not accepted:
            errors.append(
                "$.claims.independently_qa_accepted: established requires accepted verdict and distinct reviewer/implementer"
            )


def validate_manifest(data: Any, allow_placeholders: bool = False) -> list[str]:
    errors: list[str] = []
    require_keys(
        data,
        {
            "record_type",
            "schema_version",
            "execution_state",
            "repo",
            "mode",
            "request_ref",
            "authorization_basis",
            "policy_sources",
            "actions",
            "excluded_actions",
        },
        "$",
        errors,
    )
    if errors:
        return errors
    if data["record_type"] != "mister-clean.action-manifest":
        errors.append("$.record_type: expected mister-clean.action-manifest")
    if data["schema_version"] != "1.0":
        errors.append("$.schema_version: expected 1.0")
    execution_state = data["execution_state"]
    if execution_state not in EXECUTION_STATES:
        errors.append(f"$.execution_state: unsupported value {execution_state!r}")
    if data["mode"] not in {"CLEAN", "CLOSE", "CONFORM"}:
        errors.append("$.mode: action manifest requires CLEAN, CLOSE, or CONFORM")
    if not nonempty(data["request_ref"]):
        errors.append("$.request_ref: required")
    validate_authorization_basis(data["authorization_basis"], "$.authorization_basis", errors)
    if not isinstance(data["excluded_actions"], list):
        errors.append("$.excluded_actions: expected array")

    actions = data["actions"]
    if not isinstance(actions, list):
        errors.append("$.actions: expected array")
        return errors
    seen: set[str] = set()
    for index, action in enumerate(actions):
        path = f"$.actions[{index}]"
        require_keys(action, {"id", "kind", "target", "purpose", "risk", "authorization", "preconditions", "verification"}, path, errors)
        if not isinstance(action, dict):
            continue
        action_id = action.get("id")
        if not nonempty(action_id):
            errors.append(f"{path}.id: required")
        elif action_id in seen:
            errors.append(f"{path}.id: duplicate {action_id}")
        else:
            seen.add(action_id)
        risk = action.get("risk")
        kind = action.get("kind")
        if kind in PROHIBITED_KINDS:
            errors.append(f"{path}: unrecoverable or prohibited action is outside Mister Clean")
        elif kind not in ALLOWED_ACTION_KINDS:
            errors.append(f"{path}.kind: unsupported action kind {kind!r}")
        if not nonempty(action.get("target")):
            errors.append(f"{path}.target: required")
        if not nonempty(action.get("purpose")):
            errors.append(f"{path}.purpose: required")
        if risk not in RISKS:
            errors.append(f"{path}.risk: unsupported value {risk!r}")
        if risk == "unrecoverable":
            errors.append(f"{path}: unrecoverable or prohibited action is outside Mister Clean")
        if kind in CONSEQUENTIAL_KINDS and risk != "consequential_external":
            errors.append(f"{path}.risk: {kind} requires consequential_external")
        if not isinstance(action.get("preconditions"), list):
            errors.append(f"{path}.preconditions: expected array")
        if not isinstance(action.get("verification"), list):
            errors.append(f"{path}.verification: expected array")
        auth = action.get("authorization")
        require_keys(auth, {"state", "source", "ref"}, f"{path}.authorization", errors)
        if not isinstance(auth, dict):
            continue
        auth_state = auth.get("state")
        if auth_state not in AUTH_STATES:
            errors.append(f"{path}.authorization.state: unsupported value {auth_state!r}")
        if execution_state in {"authorized", "executed"} and auth_state != "granted":
            errors.append(f"{path}.authorization.state: {execution_state} manifest requires granted")
        if kind in CONSEQUENTIAL_KINDS or risk == "consequential_external":
            if auth_state == "granted" and auth.get("source") not in STANDING_AUTH_SOURCES:
                errors.append(
                    f"{path}.authorization.source: consequential action requires skill_invocation, explicit_user, or explicit_operator"
                )
            if auth_state == "granted" and not nonempty(auth.get("ref")):
                errors.append(f"{path}.authorization.ref: consequential action requires a reference")
            if not action.get("preconditions"):
                errors.append(f"{path}.preconditions: consequential action requires a bounded preflight")
            if not action.get("verification"):
                errors.append(f"{path}.verification: consequential action requires an exact postcondition")
        if execution_state == "executed" and not action.get("verification"):
            errors.append(f"{path}.verification: executed action requires evidence")
        if execution_state == "executed":
            outcome = action.get("outcome")
            require_keys(outcome, {"state", "evidence"}, f"{path}.outcome", errors)
            if isinstance(outcome, dict):
                if outcome.get("state") != "verified":
                    errors.append(f"{path}.outcome.state: executed action requires verified")
                oev = outcome.get("evidence")
                if not (isinstance(oev, list) and any(_debt_meaningful(x) for x in oev)):
                    errors.append(f"{path}.outcome.evidence: executed action requires meaningful typed evidence (not [], [null], or [{{}}])")
    if not allow_placeholders:
        for path in find_placeholders(data):
            errors.append(f"{path}: unresolved template placeholder")
    # --- v5 hardening: execution arithmetic, typed evidence, destructive proofs ---
    ps = data.get("policy_sources")
    if ps is not None and not isinstance(ps, list):
        errors.append("$.policy_sources: expected list")
    ex = data.get("excluded_actions")
    if ex is not None and not isinstance(ex, list):
        errors.append("$.excluded_actions: expected list")
    if not allow_placeholders:
        if not nonempty(data.get("request_ref")):
            errors.append("$.request_ref: required nonempty")
        _tb = (data.get("authorization_basis") or {})
        if _tb.get("source") == "skill_invocation" and not nonempty(_tb.get("ref")):
            errors.append("$.authorization_basis.ref: required nonempty for skill_invocation")
    state = data.get("execution_state")
    acts = data.get("actions") or []
    if state == "executed" and not acts:
        errors.append("$.execution_state: executed with zero actions is not an execution record")
    def _meaningful(x):
        if isinstance(x, str):
            return bool(x.strip())
        if isinstance(x, dict):
            return any(_meaningful(v) for v in x.values())
        if isinstance(x, list):
            return any(_meaningful(v) for v in x)
        return x is not None
    DESTRUCTIVE = {"stash_drop", "recoverable_delete", "branch_delete_local", "branch_delete_remote", "worktree_remove", "process_signal", "git_push"}
    for i, a in enumerate(acts):
        if not isinstance(a, dict):
            continue
        st = a.get("status")
        if st is not None and st not in ("planned", "executed", "failed", "blocked", "skipped"):
            errors.append(f"$.actions[{i}].status: unsupported {st!r}")
        if (state == "executed" or st == "executed"):
            ver = a.get("verification")
            if not (isinstance(ver, list) and any(_meaningful(v) for v in ver)):
                errors.append(f"$.actions[{i}].verification: executed action requires meaningful evidence (not empty/null placeholders)")
        if not allow_placeholders:
            LOCAL_KINDS = {"local_edit", "local_move", "recoverable_delete", "doc_update", "planning_record_update", "historical_conform", "handoff_update"}
            repo_path = ((data.get("repo") or {}).get("path")) or ""
            tgt = a.get("target")
            if a.get("kind") in LOCAL_KINDS and isinstance(tgt, str) and tgt:
                import posixpath as _pp
                base = repo_path.rstrip("/") if repo_path else ""
                # resolve BOTH absolute and relative (traversal) targets against the repo root
                resolved = _pp.normpath(tgt if tgt.startswith("/") else _pp.join(base, tgt))
                if not (base and (resolved == base or resolved.startswith(base + "/"))):
                    errors.append(f"$.actions[{i}].target: {a.get('kind')} target {tgt!r} resolves to {resolved!r}, outside the authorized repository {base!r} (traversal/out-of-scope rejected)")
            if a.get("kind") == "agent_dispatch":
                mech = a.get("mechanism")
                if mech not in ("in_session_subagent", "external_orchestrated_agent"):
                    errors.append(f"$.actions[{i}].mechanism: agent_dispatch requires in_session_subagent|external_orchestrated_agent (human/paid external dispatch is prohibited external_dispatch)")
            top_ref = (data.get("authorization_basis") or {}).get("ref")
            auth = a.get("authorization") or {}
            if auth.get("source") == "skill_invocation" and auth.get("ref") != top_ref:
                errors.append(f"$.actions[{i}].authorization.ref: must correlate with authorization_basis.ref for skill_invocation actions")
        if a.get("kind") in DESTRUCTIVE:
            pre = a.get("preconditions")
            ver = a.get("verification")
            if not (isinstance(pre, list) and any(_meaningful(v) for v in pre)):
                errors.append(f"$.actions[{i}].preconditions: {a.get('kind')} requires meaningful preflight facts")
            if not (isinstance(ver, list) and any(_meaningful(v) for v in ver)):
                errors.append(f"$.actions[{i}].verification: {a.get('kind')} requires recovery/postcondition proof")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=("report", "manifest"))
    parser.add_argument("path", type=Path)
    parser.add_argument(
        "--template",
        action="store_true",
        help="validate a bundled template while allowing angle-bracket placeholders",
    )
    args = parser.parse_args()
    try:
        if args.template:
            _skill_assets = Path(__file__).resolve().parent.parent / "assets"
            if _skill_assets not in args.path.resolve().parents:
                print("ERROR: --template is only valid for the skill's bundled assets/ templates; a real report must validate without placeholders", file=sys.stderr)
                return 2
        data = json.loads(args.path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    errors = (
        validate_report(data, allow_placeholders=args.template)
        if args.kind == "report"
        else validate_manifest(data, allow_placeholders=args.template)
    )
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(f"FAIL errors={len(errors)}", file=sys.stderr)
        return 1
    print(f"PASS kind={args.kind} path={args.path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
