#!/usr/bin/env python3

import importlib.util
import json
import re
import unittest
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("validate_closeout", SKILL_DIR / "scripts" / "validate_closeout.py")
VALIDATOR = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(VALIDATOR)


def load_asset(name: str):
    return json.loads((SKILL_DIR / "assets" / name).read_text(encoding="utf-8"))


def fill_placeholders(value):
    if isinstance(value, str):
        return re.sub(r"<[^<>]+>", "fixture-value", value)
    if isinstance(value, list):
        return [fill_placeholders(item) for item in value]
    if isinstance(value, dict):
        return {key: fill_placeholders(item) for key, item in value.items()}
    return value


def bind_report(r):
    """canonical binding: make a filled report satisfy v5 repo-binding checks"""
    r["generated_at"] = "2026-08-25T04:00:00Z"
    r["repo"] = {"id": "fixture/repo", "commit": "a" * 40, "branch": "main"}
    r["target_binding"] = {
        "target_ref": "origin/main",
        "target_commit": "a" * 40,
        "candidate_commit": "a" * 40,
        "merge_base": "a" * 40,
        "target_commits_missing": 0,
        "candidate_commits_ahead": 0,
        "target_incorporated": True,
        "measured_at": "2026-08-25T04:00:00Z",
        "evidence": ["git merge-base origin/main HEAD; git rev-list --left-right --count origin/main...HEAD -> 0 0"],
    }
    return r


def load_filled_asset(name: str):
    value = bind_report(fill_placeholders(load_asset(name)))
    if name == "action-manifest.json" and not value["actions"]:
        value["actions"] = [sample_local_action()]
    return value


def clean_claims(commit):
    """A genuinely-assessed CLOSE claim set: one established (bound to repo.commit),
    the external ones policy-bound not_applicable. No claim left not_assessed."""
    na = lambda: {"state": "not_applicable", "evidence": ["no such surface in scope"],
                  "na_reason": "no external/deploy surface in this closeout",
                  "policy_ref": "RATIFICATION.md#scope"}
    return {
        "committed_locally": {"state": "established",
                              "evidence": [{"kind": "git_commit", "commit": commit}]},
        "pushed": na(), "ci_green_on_push": na(), "deployed": na(),
        "independently_qa_accepted": na(),
    }


def specific_dims():
    return {name: {"state": "satisfied",
                   "evidence": [{"kind": next(iter(VALIDATOR.DIMENSION_EVIDENCE_KINDS[name])),
                                 "object": "a" * 40,
                                 "command": f"verify {name}",
                                 "result": "exit 0; 12/12 verified",
                                 "observed_at": "2026-08-25T04:00:00Z"}],
                   "notes": []}
            for name in VALIDATOR.REQUIRED_DIMENSIONS}


def typed_debt_evidence():
    return [{"kind": "acceptance_execution", "object": "a" * 40,
             "command": "run independent acceptance review", "result": "accepted 1/1",
             "observed_at": "2026-08-25T04:00:00Z",
             "evidence_ref": {"path": "debt-result.json", "sha256": "c" * 64}}]


def ruling_ref():
    return {"path": "operator-ruling.json", "sha256": "b" * 64}


def sample_local_action():
    return {
        "id": "A-LOCAL", "kind": "local_edit", "target": "docs/current.md",
        "purpose": "repair handoff state", "risk": "reversible_local",
        "authorization": {"state": "granted", "source": "skill_invocation", "ref": "fixture-value"},
        "preconditions": [], "verification": ["document validator passed"],
    }


def push_action():
    return {
        "id": "A-PUSH",
        "kind": "git_push",
        "target": "origin/feature/docs",
        "purpose": "Synchronize the handoff commit",
        "risk": "consequential_external",
        "authorization": {
            "state": "granted",
            "source": "skill_invocation",
            "ref": "fixture-value",
        },
        "preconditions": [
            "resolve current branch and configured remote",
            "recheck remote head and intended commit",
        ],
        "verification": [
            "remote-resolve origin/feature/docs and compare the commit",
        ],
    }


class ReportValidationTests(unittest.TestCase):
    def test_template_structure_is_valid(self):
        self.assertEqual(
            VALIDATOR.validate_report(load_asset("closeout-report.json"), allow_placeholders=True),
            [],
        )

    def test_unfilled_template_is_not_an_executed_report(self):
        errors = VALIDATOR.validate_report(load_asset("closeout-report.json"))
        self.assertTrue(any("unresolved template placeholder" in error for error in errors))

    def test_local_clone_cannot_establish_ci(self):
        report = load_filled_asset("closeout-report.json")
        report["claims"]["ci_green_on_push"] = {
            "state": "established",
            "evidence": [
                {
                    "kind": "local_clone",
                    "provider": "local-shell",
                    "run_id": "local-1",
                    "commit": "abc123def",
                    "conclusion": "success",
                }
            ],
        }
        errors = VALIDATOR.validate_report(report)
        self.assertTrue(any("kind=established_ci" in error for error in errors))

    def test_established_ci_evidence_is_accepted(self):
        report = load_filled_asset("closeout-report.json")
        report["claims"]["ci_green_on_push"] = {
            "state": "established",
            "evidence": [
                {
                    "kind": "established_ci",
                    "provider": "github-actions",
                    "run_id": "ci-1042",
                    "commit": "abc123def",
                    "conclusion": "success",
                }
            ],
        }
        self.assertEqual(VALIDATOR.validate_report(report), [])

    def test_unconditional_proceed_rejects_open_debt(self):
        report = load_filled_asset("closeout-report.json")
        for item in report["dimensions"].values():
            item["state"] = "satisfied"
            item["evidence"] = ["measured"]
        report["completion_debts"] = [
            {"id": "D-1", "procedure": "implementation -> review", "state": "open", "evidence": ["review absent"]}
        ]
        report["handoff_assessment"] = {
            "recommendation": "proceed",
            "reasons": ["repository checks passed"],
            "conditions": [],
        }
        errors = VALIDATOR.validate_report(report)
        self.assertTrue(any("completion debt" in error for error in errors))

    def test_deferred_debt_requires_complete_ruling(self):
        report = load_filled_asset("closeout-report.json")
        report["completion_debts"] = [
            {"id": "D-1", "procedure": "implementation -> review", "state": "deferred", "evidence": [], "ruling": {}}
        ]
        errors = VALIDATOR.validate_report(report)
        self.assertTrue(any("ruling" in error for error in errors))

    def test_blocked_debt_requires_owner_and_next_action(self):
        report = load_filled_asset("closeout-report.json")
        report["completion_debts"] = [
            {
                "id": "D-1",
                "procedure": "implementation -> independent QA",
                "state": "blocked",
                "evidence": ["QA service unavailable"],
            }
        ]
        errors = VALIDATOR.validate_report(report)
        self.assertTrue(any("next_owner" in error for error in errors))

    def test_qa_acceptance_requires_distinct_reviewer(self):
        report = load_filled_asset("closeout-report.json")
        report["claims"]["independently_qa_accepted"] = {
            "state": "established",
            "evidence": [
                {
                    "kind": "independent_qa_verdict",
                    "verdict_ref": "qa-17",
                    "reviewer": "agent-a",
                    "implementer": "agent-a",
                    "conclusion": "accepted",
                }
            ],
        }
        errors = VALIDATOR.validate_report(report)
        self.assertTrue(any("distinct reviewer/implementer" in error for error in errors))

    def test_clean_refuses_candidate_behind_target(self):
        report = load_filled_asset("closeout-report.json")
        report["verdict"] = "CLEAN"
        report["dimensions"] = specific_dims()
        report["completion_debts"] = []
        report["claims"] = clean_claims(report["repo"]["commit"])
        report["residuals"] = []
        report["acceptance_criteria"] = []
        report["debt_census"] = {"discovered": 0, "paid": 0, "accepted_exception": 0}
        report["handoff_assessment"] = {"recommendation": "proceed", "reasons": ["measured"], "conditions": []}
        report["target_binding"]["target_commits_missing"] = 15
        report["target_binding"]["target_incorporated"] = False
        errors = VALIDATOR.validate_report(report)
        self.assertTrue(any("target_commits_missing=0" in error for error in errors), errors)
        self.assertTrue(any("target_incorporated=true" in error for error in errors), errors)

    def test_clean_refuses_target_binding_for_another_candidate(self):
        report = load_filled_asset("closeout-report.json")
        report["verdict"] = "CLEAN"
        report["dimensions"] = specific_dims()
        report["completion_debts"] = []
        report["claims"] = clean_claims(report["repo"]["commit"])
        report["residuals"] = []
        report["acceptance_criteria"] = []
        report["debt_census"] = {"discovered": 0, "paid": 0, "accepted_exception": 0}
        report["handoff_assessment"] = {"recommendation": "proceed", "reasons": ["measured"], "conditions": []}
        report["target_binding"]["candidate_commit"] = "b" * 40
        errors = VALIDATOR.validate_report(report)
        self.assertTrue(any("equality with repo.commit" in error for error in errors), errors)


class ManifestValidationTests(unittest.TestCase):
    def test_authorized_template_structure_is_valid(self):
        self.assertEqual(
            VALIDATOR.validate_manifest(load_asset("action-manifest.json"), allow_placeholders=True),
            [],
        )

    def test_unfilled_template_is_not_an_executable_manifest(self):
        errors = VALIDATOR.validate_manifest(load_asset("action-manifest.json"))
        self.assertTrue(any("unresolved template placeholder" in error for error in errors))

    def test_invocation_authorizes_bounded_push(self):
        manifest = load_filled_asset("action-manifest.json")
        manifest["actions"] = [push_action()]
        self.assertEqual(VALIDATOR.validate_manifest(manifest), [])

    def test_repo_policy_alone_does_not_authorize_push(self):
        manifest = load_filled_asset("action-manifest.json")
        action = push_action()
        action["authorization"] = {"state": "granted", "source": "repo_policy", "ref": "policy.md"}
        manifest["actions"] = [action]
        errors = VALIDATOR.validate_manifest(manifest)
        self.assertTrue(any("skill_invocation" in error for error in errors))

    def test_consequential_action_requires_preflight(self):
        manifest = load_filled_asset("action-manifest.json")
        action = push_action()
        action["preconditions"] = []
        manifest["actions"] = [action]
        errors = VALIDATOR.validate_manifest(manifest)
        self.assertTrue(any("bounded preflight" in error for error in errors))

    def test_executed_action_requires_verified_outcome(self):
        manifest = load_filled_asset("action-manifest.json")
        manifest["execution_state"] = "executed"
        manifest["actions"] = [push_action()]
        errors = VALIDATOR.validate_manifest(manifest)
        self.assertTrue(any(".outcome" in error for error in errors))

    def test_executed_action_with_evidence_is_accepted(self):
        manifest = load_filled_asset("action-manifest.json")
        manifest["execution_state"] = "executed"
        action = push_action()
        action["outcome"] = {
            "state": "verified",
            "evidence": [{"kind": "remote_ref_resolution", "object": "origin/feature/docs",
                          "command": "git ls-remote origin refs/heads/feature/docs",
                          "result": "abc123def", "observed_at": "2026-08-25T04:00:00Z",
                          "evidence_ref": {"path": "action-result.json", "sha256": "d" * 64}}],
        }
        manifest["actions"] = [action]
        self.assertEqual(VALIDATOR.validate_manifest(manifest), [])

    def test_unrecoverable_action_is_rejected(self):
        manifest = load_filled_asset("action-manifest.json")
        action = manifest["actions"][0]
        action["kind"] = "history_rewrite"
        action["risk"] = "unrecoverable"
        errors = VALIDATOR.validate_manifest(manifest)
        self.assertTrue(any("outside Mister Clean" in error for error in errors))

    def test_unknown_action_kind_is_rejected(self):
        manifest = load_filled_asset("action-manifest.json")
        manifest["actions"][0]["kind"] = "totally_safe_force_overwrite"
        errors = VALIDATOR.validate_manifest(manifest)
        self.assertTrue(any("unsupported action kind" in error for error in errors))

    def test_proposed_manifest_is_rejected(self):
        manifest = load_filled_asset("action-manifest.json")
        manifest["execution_state"] = "proposed"
        errors = VALIDATOR.validate_manifest(manifest)
        self.assertTrue(any("execution_state" in error for error in errors))

    def test_external_dispatch_is_outside_closeout_authority(self):
        manifest = load_filled_asset("action-manifest.json")
        action = manifest["actions"][0]
        action["kind"] = "external_dispatch"
        action["risk"] = "consequential_external"
        action["preconditions"] = ["recipient resolved"]
        errors = VALIDATOR.validate_manifest(manifest)
        self.assertTrue(any("outside Mister Clean" in error for error in errors))




class V5RulingGateTests(unittest.TestCase):
    """Adversarial: the validator must refuse false completions (v5 ruling)."""

    def _base(self):
        r = load_filled_asset("closeout-report.json")
        r["verdict"] = "CLEAN"
        r["completion_debts"] = []
        return r

    def test_clean_with_open_debt_is_refused(self):
        r = self._base()
        r["completion_debts"] = [{"id": "D1", "procedure": "x->y", "state": "open",
                                  "disposition": "autonomously_validate", "evidence": "e"}]
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("CLEAN forbidden" in e and "payable debt" in e for e in errs), errs)

    def test_clean_with_blocked_debt_is_refused(self):
        r = self._base()
        r["completion_debts"] = [{"id": "D2", "procedure": "x->y", "state": "blocked",
                                  "disposition": "autonomously_repair", "evidence": "e",
                                  "blocker": "b", "next_owner": "o", "next_action": "a"}]
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("CLEAN forbidden" in e for e in errs), errs)

    def test_clean_with_decision_required_is_refused(self):
        r = self._base()
        r["completion_debts"] = [{"id": "D3", "procedure": "x->y", "state": "deferred",
                                  "disposition": "decision_or_coordination_required",
                                  "evidence": "e", "ruling": {"actor": "principal", "date": "2026-08-25", "reason": "r", "next_owner": "o", "ref": "ref"}}]
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("decision_or_coordination_required" in e for e in errs), errs)

    def test_accepted_exception_without_authority_is_refused(self):
        r = self._base()
        r["verdict"] = "NOT_CLEAN"
        r["completion_debts"] = [{"id": "D4", "procedure": "x->y", "state": "accepted_exception",
                                  "disposition": "accepted_exception", "evidence": "e"}]
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any(".exception" in e for e in errs), errs)

    def test_accepted_exception_with_authority_passes(self):
        r = self._base()
        r["verdict"] = "NOT_CLEAN"
        r["completion_debts"] = [{"id": "D5", "procedure": "x->y", "state": "accepted_exception",
                                  "disposition": "accepted_exception", "evidence": "e",
                                  "exception": {"actor": "principal", "at": "2026-08-25T04:00:00Z",
                                                "ref": ruling_ref(), "scope": "historical reviewer provenance only",
                                                "rationale": "history cannot be un-authored"}}]
        self.assertEqual(VALIDATOR.validate_report(r), [])

    def test_legacy_unrecoverable_requires_authority_and_scope(self):
        r = self._base()
        r["verdict"] = "NOT_CLEAN"
        r["claims"]["independently_qa_accepted"] = {
            "state": "not_established",
            "evidence": [{"kind": "independent_qa_verdict", "conclusion": "ACCEPT",
                          "reviewer": "x", "implementer": "y", "verdict_ref": "z",
                          "independence": "legacy_unrecoverable"}]}
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("legacy_unrecoverable requires authority" in e for e in errs), errs)
        self.assertTrue(any("legacy_unrecoverable requires scope" in e for e in errs), errs)

    def test_bare_clean_with_empty_ledger_is_refused(self):
        # Codex adversarial: an empty ledger is not a census; not_assessed dims are not satisfaction
        r = self._base()
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("CLEAN requires satisfied" in e for e in errs), errs)
        r2 = self._base()
        r2.pop("debt_census", None)
        errs2 = VALIDATOR.validate_report(r2)
        self.assertTrue(any("debt_census: required for CLEAN" in e for e in errs2), errs2)

    def test_fully_evidenced_clean_passes(self):
        r = self._base()
        r["dimensions"] = specific_dims()
        r["claims"] = clean_claims((r.get("repo") or {}).get("commit"))
        r["debt_census"] = {"discovered": 1, "paid": 1, "accepted_exception": 0}
        r["completion_debts"] = [{"id": "D-OK", "procedure": "x->y", "state": "satisfied",
                                  "disposition": "autonomously_validate", "evidence": typed_debt_evidence()}]
        r["residuals"] = []
        r["handoff_assessment"] = {"recommendation": "proceed", "reasons": ["all debt paid"], "conditions": []}
        self.assertEqual(VALIDATOR.validate_report(r, bundle_context=True), [])

    def test_clean_with_blocked_residual_is_refused(self):
        r = self._base()
        for name in VALIDATOR.REQUIRED_DIMENSIONS:
            r["dimensions"][name] = {"state": "satisfied", "evidence": ["measured"], "notes": []}
        r["debt_census"] = {"discovered": 0, "paid": 0, "accepted_exception": 0}
        r["handoff_assessment"] = {"recommendation": "proceed", "reasons": ["x"], "conditions": []}
        r["residuals"] = [{"kind": "blocked", "id": "R1", "note": "hidden payable work"}]
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("residuals[0] is blocked" in e for e in errs), errs)

    def test_clean_deferred_accepted_exception_is_refused(self):
        # the exact bypass Codex isolated: CLEAN + deferred + accepted_exception
        r = self._base()
        for name in VALIDATOR.REQUIRED_DIMENSIONS:
            r["dimensions"][name] = {"state": "satisfied", "evidence": ["measured"], "notes": []}
        r["debt_census"] = {"discovered": 1, "paid": 0, "accepted_exception": 1}
        r["handoff_assessment"] = {"recommendation": "proceed", "reasons": ["x"], "conditions": []}
        r["completion_debts"] = [{"id": "D6", "procedure": "x->y", "state": "deferred",
                                  "disposition": "accepted_exception", "evidence": "e",
                                  "authority": "a", "scope": "s", "rationale": "r",
                                  "ruling": {"actor": "principal", "date": "2026-08-25", "reason": "r",
                                             "next_owner": "o", "ref": "ref"}}]
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("deferred (unpaid work cannot be CLEAN" in e for e in errs), errs)

    def test_accepted_exception_is_one_exclusive_census_bucket(self):
        r = self._base()
        r["dimensions"] = specific_dims()
        r["claims"] = clean_claims(r["repo"]["commit"])
        r["completion_debts"] = [{
            "id": "D-HIST", "procedure": "historical provenance -> disposition",
            "state": "accepted_exception", "disposition": "accepted_exception",
            "evidence": [{"kind": "historical_record", "ref": "history.md"}],
            "exception": {"actor": "principal", "at": "2026-08-25T04:00:00Z",
                          "ref": ruling_ref(), "scope": "historical provenance",
                          "rationale": "cannot be reconstructed without fabrication"},
        }]
        r["debt_census"] = {"discovered": 1, "paid": 0, "accepted_exception": 1}
        r["residuals"] = []
        r["handoff_assessment"] = {"recommendation": "proceed", "reasons": ["bound exception"], "conditions": []}
        self.assertEqual(VALIDATOR.validate_report(r, bundle_context=True), [])

    def test_satisfied_plus_accepted_exception_double_count_is_refused(self):
        r = self._base()
        r["verdict"] = "NOT_CLEAN"
        r["completion_debts"] = [{
            "id": "D-DOUBLE", "procedure": "x->y", "state": "satisfied",
            "disposition": "accepted_exception", "evidence": [{"kind": "result", "ref": "x"}],
            "exception": {"actor": "principal", "at": "2026-08-25T04:00:00Z",
                          "ref": ruling_ref(), "scope": "s", "rationale": "r"},
        }]
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("one row, one terminal bucket" in e for e in errs), errs)

    def test_missing_verdict_is_refused(self):
        r = self._base()
        del r["verdict"]
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("verdict" in e for e in errs), errs)

    def test_not_clean_with_unconditional_proceed_is_refused(self):
        r = self._base()
        r["verdict"] = "NOT_CLEAN"
        r["handoff_assessment"] = {"recommendation": "proceed", "reasons": ["x"], "conditions": []}
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("proceed conflicts with NOT_CLEAN" in e for e in errs), errs)




class V5CheckerClassTests(unittest.TestCase):
    """Codex checker classes: typed evidence, outcome meaningfulness, containment, ref correlation."""

    def test_satisfied_debt_string_evidence_refused(self):
        r = load_filled_asset("closeout-report.json")
        r["verdict"] = "NOT_CLEAN"
        r["completion_debts"] = [{"id": "S1", "procedure": "x->y", "state": "satisfied",
                                  "disposition": "autonomously_validate", "evidence": "a bare string"}]
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("allowlisted" in e for e in errs), errs)

    def test_satisfied_debt_typed_list_passes(self):
        r = load_filled_asset("closeout-report.json")
        r["verdict"] = "NOT_CLEAN"
        r["completion_debts"] = [{"id": "S2", "procedure": "x->y", "state": "satisfied",
                                  "disposition": "autonomously_validate",
                                  "evidence": typed_debt_evidence()}]
        self.assertEqual(VALIDATOR.validate_report(r, bundle_context=True), [])

    def _mani(self):
        m = fill_placeholders(load_asset("action-manifest.json"))
        m["repo"] = {"id": "fixture/repo", "commit": "a" * 40}
        m["request_ref"] = "operator invocation"
        m["authorization_basis"]["ref"] = "operator invocation"
        m["actions"] = [sample_local_action()]
        for a in m["actions"]:
            a["authorization"]["ref"] = "operator invocation"
            a["target"] = "file.md"
        return m

    def test_executed_outcome_empty_object_evidence_refused(self):
        m = self._mani()
        m["execution_state"] = "executed"
        m["actions"][0]["outcome"] = {"state": "verified", "evidence": [{}]}
        m["actions"][0]["status"] = "executed"
        m["actions"][0]["verification"] = ["real check"]
        errs = VALIDATOR.validate_manifest(m)
        self.assertTrue(any("allowlisted" in e for e in errs), errs)

    def test_local_edit_outside_repo_refused(self):
        m = self._mani()
        m["actions"][0]["kind"] = "local_edit"
        m["actions"][0]["target"] = "/etc/hosts"
        errs = VALIDATOR.validate_manifest(m)
        self.assertTrue(any("repository-relative" in e for e in errs), errs)

    def test_agent_dispatch_without_mechanism_refused(self):
        m = self._mani()
        m["actions"][0]["kind"] = "agent_dispatch"
        m["actions"][0].pop("mechanism", None)
        errs = VALIDATOR.validate_manifest(m)
        self.assertTrue(any("mechanism" in e for e in errs), errs)

    def test_action_ref_mismatch_refused(self):
        m = self._mani()
        m["actions"][0]["authorization"]["ref"] = "a different ref"
        errs = VALIDATOR.validate_manifest(m)
        self.assertTrue(any("must correlate with authorization_basis.ref" in e for e in errs), errs)




class V5WithheldRunTests(unittest.TestCase):
    """The final four withheld-run classes."""

    def _clean(self):
        r = load_filled_asset("closeout-report.json")
        r["verdict"] = "CLEAN"
        r["dimensions"] = specific_dims()
        r["claims"] = clean_claims((r.get("repo") or {}).get("commit"))
        r["debt_census"] = {"discovered": 0, "paid": 0, "accepted_exception": 0}
        r["completion_debts"] = []
        r["residuals"] = []
        r["actions"] = []
        r["handoff_assessment"] = {"recommendation": "proceed", "reasons": ["paid"], "conditions": []}
        return r

    def test_clean_with_unfinished_action_refused(self):
        r = self._clean()
        r["actions"] = [{"id": "A1", "kind": "local_edit", "status": "failed", "note": "x"}]
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("unfinished/failed action" in e for e in errs), errs)

    def test_clean_with_mismatched_object_ids_refused(self):
        r = self._clean()
        r["claims"]["committed_locally"] = {"state": "established",
            "evidence": [{"kind": "git_commit", "commit": "a" * 40}]}
        r["claims"]["pushed"] = {"state": "established",
            "evidence": [{"kind": "remote_ref_resolution", "remote": "origin", "ref": "refs/heads/main",
                          "commit": "b" * 40, "observed_at": "t"}]}
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("same-object violation" in e for e in errs), errs)

    def test_whitespace_alias_independence_refused(self):
        r = load_filled_asset("closeout-report.json")
        r["verdict"] = "NOT_CLEAN"
        r["claims"]["independently_qa_accepted"] = {"state": "established",
            "evidence": [{"kind": "independent_qa_verdict", "conclusion": "ACCEPT",
                          "reviewer": "agent-a ", "implementer": "agent-a",
                          "verdict_ref": "x"}]}
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("normalize to the same actor" in e for e in errs), errs)

    def test_generic_na_rationale_refused(self):
        r = self._clean()
        for name in list(r["claims"].keys()):
            r["claims"][name] = {"state": "not_applicable", "evidence": [], "na_reason": "n/a"}
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("policy_ref" in e for e in errs), errs)
        self.assertTrue(any("cannot mark every claim not_applicable" in e for e in errs), errs)

    def test_clean_commit_must_match_repo_binding(self):
        r = self._clean()
        r["claims"]["committed_locally"] = {"state": "established",
            "evidence": [{"kind": "git_commit", "commit": "b" * 40}]}
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("equal repo.commit" in e for e in errs), errs)




class AcceptanceCriteriaContractTests(unittest.TestCase):
    """Contract: the canonical report EXPOSES acceptance_criteria and validation traverses it."""

    def test_canonical_asset_carries_acceptance_criteria(self):
        raw = load_asset("closeout-report.json")
        self.assertIn("acceptance_criteria", raw, "blank/canonical report must expose acceptance_criteria")
        self.assertTrue(isinstance(raw["acceptance_criteria"], list) and raw["acceptance_criteria"],
                        "acceptance_criteria must be a non-empty example list")

    def test_template_with_acceptance_criteria_still_valid(self):
        self.assertEqual(
            VALIDATOR.validate_report(load_asset("closeout-report.json"), allow_placeholders=True), [])

    def test_validation_traverses_acceptance_criteria(self):
        # a malformed criterion in a filled report must be caught -> proves traversal
        r = load_filled_asset("closeout-report.json")
        r["acceptance_criteria"] = [{"id": "x", "source": "operator"}]  # missing met:bool
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("acceptance_criteria[0].met" in e for e in errs), errs)


class V55VerdictIntegrityTests(unittest.TestCase):
    """Operator ruling: a reviewer may not downgrade an operator acceptance
    criterion; reviewer-reported stale docs are payable regardless of severity."""

    def _clean(self):
        r = load_filled_asset("closeout-report.json")
        r["verdict"] = "CLEAN"
        r["dimensions"] = specific_dims()
        r["claims"] = clean_claims((r.get("repo") or {}).get("commit"))
        r["debt_census"] = {"discovered": 0, "paid": 0, "accepted_exception": 0}
        r["completion_debts"] = []; r["residuals"] = []; r["actions"] = []
        r["handoff_assessment"] = {"recommendation": "proceed", "reasons": ["paid"], "conditions": []}
        return r

    def test_clean_invalid_while_operator_criterion_unmet(self):
        r = self._clean()
        r["acceptance_criteria"] = [{"id": "brand-wordmark", "source": "operator", "met": False}]
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("acceptance criterion is unmet" in e for e in errs), errs)

    def test_reviewer_cannot_waive_operator_criterion(self):
        r = self._clean()
        r["acceptance_criteria"] = [{"id": "brand-wordmark", "source": "operator", "met": False,
                                     "waiver": {"actor": "qa-reviewer", "ref": "REVIEW-X.md"}}]
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("waived ONLY by the operator" in e for e in errs), errs)
        # and CLEAN still blocked because the reviewer waiver does not count
        self.assertTrue(any("acceptance criterion is unmet" in e for e in errs), errs)

    def test_operator_waiver_permits_clean(self):
        r = self._clean()
        r["acceptance_criteria"] = [{"id": "brand-wordmark", "source": "operator", "met": False,
                                     "waiver": {"actor": "operator", "ref": "ruling 2026-08-25"}}]
        self.assertEqual(VALIDATOR.validate_report(r, bundle_context=True), [])

    def test_met_criterion_permits_clean(self):
        r = self._clean()
        r["acceptance_criteria"] = [{"id": "brand-wordmark", "source": "operator", "met": True}]
        self.assertEqual(VALIDATOR.validate_report(r, bundle_context=True), [])

    def test_stale_doc_debt_cannot_be_accepted_exception(self):
        r = self._clean()
        r["verdict"] = "NOT_CLEAN"
        r["completion_debts"] = [{"id": "SD1", "class": "stale_doc", "procedure": "x->y",
                                  "state": "deferred", "disposition": "accepted_exception",
                                  "evidence": "e", "authority": "a", "scope": "s", "rationale": "low severity"}]
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("stale doc/comment is PAYABLE regardless of severity" in e for e in errs), errs)

    def test_stale_doc_cannot_be_parked_as_residual(self):
        r = self._clean()
        r["residuals"] = [{"kind": "roadmap", "class": "stale_comment", "represented_at": "docs/x.md"}]
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("payable debt, not a residual" in e for e in errs), errs)


class V54FalseGreenTests(unittest.TestCase):
    """Codex rebound findings: unmeasured CLEAN + relative-traversal target."""

    def _clean_specific(self):
        r = load_filled_asset("closeout-report.json")
        r["verdict"] = "CLEAN"
        r["dimensions"] = specific_dims()
        r["claims"] = clean_claims((r.get("repo") or {}).get("commit"))
        r["debt_census"] = {"discovered": 0, "paid": 0, "accepted_exception": 0}
        r["completion_debts"] = []
        r["residuals"] = []
        r["actions"] = []
        r["handoff_assessment"] = {"recommendation": "proceed", "reasons": ["paid"], "conditions": []}
        return r

    def test_specific_evidence_clean_passes(self):
        self.assertEqual(VALIDATOR.validate_report(self._clean_specific(), bundle_context=True), [])

    def test_generic_dimension_evidence_refused_for_clean(self):
        r = self._clean_specific()
        for name in VALIDATOR.REQUIRED_DIMENSIONS:
            r["dimensions"][name] = {"state": "satisfied", "evidence": ["measured"], "notes": []}
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("requires time-bound evidence kind" in e for e in errs), errs)

    def test_not_assessed_claim_refused_for_clean(self):
        r = self._clean_specific()
        r["claims"]["committed_locally"] = {"state": "not_assessed", "evidence": []}
        errs = VALIDATOR.validate_report(r)
        self.assertTrue(any("forbids an unassessed claim" in e for e in errs), errs)

    def test_relative_traversal_target_refused(self):
        m = fill_placeholders(load_asset("action-manifest.json"))
        m["repo"] = {"id": "fixture/repo", "commit": "a" * 40}
        m["request_ref"] = "op"; m["authorization_basis"]["ref"] = "op"
        m["actions"] = [sample_local_action()]
        for a in m["actions"]:
            a["authorization"]["ref"] = "op"
            a["kind"] = "local_edit"; a["target"] = "../../etc/hosts"
        errs = VALIDATOR.validate_manifest(m)
        self.assertTrue(any("repository-relative" in e for e in errs), errs)

    def test_in_repo_relative_target_allowed(self):
        m = fill_placeholders(load_asset("action-manifest.json"))
        m["repo"] = {"id": "fixture/repo", "commit": "a" * 40}
        m["request_ref"] = "op"; m["authorization_basis"]["ref"] = "op"
        m["actions"] = [sample_local_action()]
        for a in m["actions"]:
            a["authorization"]["ref"] = "op"
            a["kind"] = "local_edit"; a["target"] = "src/x.ts"
        errs = VALIDATOR.validate_manifest(m)
        self.assertFalse(any("traversal" in e or "outside the authorized" in e for e in errs), errs)


if __name__ == "__main__":
    unittest.main()
