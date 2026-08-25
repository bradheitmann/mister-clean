#!/usr/bin/env python3

import hashlib
import importlib.util
import json
import copy
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("validate_bundle", ROOT / "scripts" / "validate_bundle.py")
BUNDLE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(BUNDLE)


def run(cwd: Path, *args: str) -> str:
    result = subprocess.run(args, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    return result.stdout.strip()


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def evidence(command: str, result: str, kind: str = "validation_summary", object_id: str = "closing-tree"):
    return {
        "kind": kind, "object": object_id,
        "command": command, "result": result,
        "observed_at": "2026-08-25T09:00:00Z",
    }


class LiveBundleContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.repo = self.base / "repo"
        self.proof = self.base / "proof"
        self.repo.mkdir(); self.proof.mkdir()
        run(self.repo, "git", "init", "-b", "main")
        run(self.repo, "git", "config", "user.name", "Bundle Test")
        run(self.repo, "git", "config", "user.email", "bundle.invalid")
        (self.repo / "planning" / "done").mkdir(parents=True)
        (self.repo / "planning" / "backlog").mkdir(parents=True)
        (self.repo / "planning" / "done" / "done.md").write_text("done\n", encoding="utf-8")
        (self.repo / "planning" / "backlog" / "next.md").write_text("roadmap\n", encoding="utf-8")
        (self.repo / "CURRENT-STATE.md").write_text("Current and successor-ready.\n", encoding="utf-8")
        run(self.repo, "git", "add", ".")
        run(self.repo, "git", "commit", "-m", "fixture")
        self.head = run(self.repo, "git", "rev-parse", "HEAD")
        self.report = self._report()
        self.manifest = self._manifest()
        self.bundle = self._bundle()
        self._write()

    def tearDown(self):
        self.temp.cleanup()

    def _report(self):
        dimensions = {
            name: {
                "state": "satisfied",
                "evidence": [evidence(f"verify {name}", "pass 1/1", next(iter(BUNDLE.VC.DIMENSION_EVIDENCE_KINDS[name])))],
                "notes": [],
            }
            for name in BUNDLE.VC.REQUIRED_DIMENSIONS
        }
        na = {"state": "not_applicable", "evidence": ["outside bounded fixture"],
              "na_reason": "no corresponding external surface in this fixture",
              "policy_ref": "fixture-policy#scope"}
        return {
            "record_type": "mister-clean.closeout", "schema_version": "1.1",
            "generated_at": "2026-08-25T09:00:00Z",
            "repo": {"id": "repo", "commit": self.head, "branch": "main"},
            "target_binding": {
                "target_ref": "refs/heads/main", "target_commit": self.head,
                "candidate_commit": self.head, "merge_base": self.head,
                "target_commits_missing": 0, "candidate_commits_ahead": 0,
                "target_incorporated": True, "measured_at": "2026-08-25T09:00:00Z",
                "evidence": [evidence("git merge-base + rev-list", "0 missing; 0 ahead")],
            },
            "mode": "CLOSE",
            "authorization_basis": {"source": "skill_invocation", "ref": "request-1",
                                    "scope": "named_repository_and_current_task", "standing": True},
            "scope": {"included": [str(self.repo)], "excluded": [], "policy_sources": ["fixture-policy"]},
            "dimensions": dimensions, "completion_debts": [],
            "claims": {
                "committed_locally": {"state": "established", "evidence": [{"kind": "git_commit", "commit": self.head}]},
                "pushed": dict(na), "ci_green_on_push": dict(na), "deployed": dict(na),
                "independently_qa_accepted": dict(na),
            },
            "actions": [], "residuals": [],
            "acceptance_criteria": [{"id": "criterion-1", "source": "operator", "met": True,
                                     "evidence": ["fixture assertion"]}],
            "handoff_assessment": {"recommendation": "proceed", "reasons": ["bundle verified"], "conditions": []},
            "verdict": "CLEAN", "debt_census": {"discovered": 0, "paid": 0, "accepted_exception": 0},
        }

    def _manifest(self):
        return {
            "record_type": "mister-clean.action-manifest", "schema_version": "1.0",
            "execution_state": "authorized", "repo": {"id": "repo", "commit": self.head},
            "mode": "CLOSE", "request_ref": "request-1",
            "authorization_basis": {"source": "skill_invocation", "ref": "request-1",
                                    "scope": "named_repository_and_current_task", "standing": True},
            "policy_sources": ["fixture-policy"], "actions": [],
            "excluded_actions": ["unrecoverable destruction"],
        }

    def _bundle(self):
        artifacts = [
            {"path": relative, "class": artifact_class, "sha256": digest(self.repo / relative)}
            for relative, artifact_class in (("planning/done/done.md", "done"),
                                             ("planning/backlog/next.md", "roadmap"))
        ]
        worktree = {"path": str(self.repo), "head": self.head, "branch": "refs/heads/main",
                    "dirty_count": 0, "owner": "fixture", "purpose": "closing candidate",
                    "disposition": "retain canonical worktree"}
        branch = {"name": "main", "commit": self.head, "merged": True, "owner": "fixture",
                  "purpose": "canonical branch", "disposition": "retain"}
        return {
            "record_type": "mister-clean.closure-bundle", "schema_version": "1.0",
            "run_id": "run-1", "request_ref": "request-1",
            "report": {"path": "report.json", "sha256": "pending"},
            "manifest": {"path": "manifest.json", "sha256": "pending"},
            "custody": {"mode": "sidecar", "subject_commit": self.head,
                        "evidence_root": None, "evidence_paths": []},
            "criteria_discovery": {
                "source_kind": "exact_bytes",
                "request_source": {"path": "operative-request.txt", "sha256": "pending"},
                "source_refs": [{"path": "criteria-source.json", "sha256": "pending"}],
                "request_sha256": hashlib.sha256(b"request-1").hexdigest(),
                "discovered_count": 1, "none_found": False, "criteria_ids": ["criterion-1"],
            },
            "change_inventory": {"start_commit": self.head, "subject_commit": self.head, "changes": []},
            "planning_discovery": {"unknown": False, "systems": [{
                "id": "planning", "kind": "repo_files", "sources": ["planning/"],
                "schema_sources": ["fixture class convention"], "validators": ["bundle live census"],
                "corpus": {"roots": ["planning"], "include_globs": ["**/*.md"], "total": 2,
                           "classified": 2, "unclassified": 0, "artifacts": artifacts},
            }]},
            "successor_readiness": {
                "snapshots": {"start": evidence("git snapshot start", self.head, "repository_snapshot", self.head),
                              "end": evidence("git snapshot end", self.head, "repository_snapshot", self.head)},
                "target_observation": {"kind": "local_ref_resolution", "local_ref": "refs/heads/main", "commit": self.head,
                                       "observed_at": "2026-08-25T09:00:00Z",
                                       "policy_evidence": {"path": "local-target-policy.json", "sha256": "pending"}},
                "topology": {"worktrees": [worktree], "branches": [branch], "remote_refs": [], "stashes": [],
                             "processes": [], "dirty": 0, "unowned": 0, "unmerged": 0,
                             "blocking_processes": 0},
                "current_state": {"state": "designated", "path": "CURRENT-STATE.md",
                                  "sha256": digest(self.repo / "CURRENT-STATE.md"),
                                  "commit": self.head, "generator": "authored source",
                                  "designation": {"path": "current-state-designation.json", "sha256": "pending"}},
                "gates": [{"id": "fresh-clone", "kind": "isolated_clone", "object": self.head,
                           "command": "fixture validation", "expected_status": 0, "observed_status": 0,
                           "semantic_status": "pass", "verified": 1, "total": 1,
                           "warnings": 0, "debt": 0, "skipped": 0,
                           "evidence_ref": {"path": "gate-result.json", "sha256": "pending"}}],
                "debris": {"removed": 0, "retained": 0, "unclassified": 0,
                           "evidence": [{"path": "debris-census.json", "sha256": "pending"}]},
                "handoff": {"entrypoints": ["CURRENT-STATE.md"], "next_owner": "next team",
                            "next_action": "read CURRENT-STATE.md"},
                "final_review": {"mechanism": "independent fixture review", "status": "passed",
                                 "reviewer": "fixture-reviewer", "implementer": "fixture-implementer",
                                 "reviewer_execution": {"harness": "test", "session_id": "review-1", "receipt_id": "rr-1"},
                                 "implementer_execution": {"harness": "test", "session_id": "implement-1", "receipt_id": "ir-1"},
                                 "criteria_reviewed": True, "planning_reviewed": True,
                                 "findings_total": 0, "findings_paid": 0, "unresolved": 0,
                                 "evidence_ref": {"path": "independent-review.json", "sha256": "pending"}},
            },
        }

    def _write(self):
        (self.proof / "operative-request.txt").write_text("request-1", encoding="utf-8")
        criteria = {
            "record_type": "mister-clean.criteria-source", "request_ref": "request-1",
            "request_sha256": self.bundle["criteria_discovery"]["request_sha256"],
            "criteria_ids": self.bundle["criteria_discovery"]["criteria_ids"],
        }
        gates = self.bundle["successor_readiness"]["gates"]
        gate_record = None
        if gates:
            gate = gates[0]
            gate_record = {"record_type": "mister-clean.gate-result", "observed_at": "2026-08-25T09:00:00Z"}
            for key in ("id", "object", "command", "observed_status", "semantic_status", "verified", "total", "warnings", "debt", "skipped"):
                gate_record["gate_id" if key == "id" else key] = gate[key]
        debris = self.bundle["successor_readiness"]["debris"]
        debris_record = {"record_type": "mister-clean.debris-census", **{key: debris[key] for key in ("removed", "retained", "unclassified")}}
        review = self.bundle["successor_readiness"]["final_review"]
        review_record = {
            "record_type": "mister-clean.independent-review", "observed_at": "2026-08-25T09:00:00Z",
            **{key: review[key] for key in ("mechanism", "status", "reviewer", "implementer", "reviewer_execution", "implementer_execution", "findings_total", "findings_paid", "unresolved")},
            "candidate_commit": self.head,
            "criteria_ids": self.bundle["criteria_discovery"]["criteria_ids"],
            "planning_system_ids": ["planning"],
        }
        policy_record = {"record_type": "mister-clean.local-target-policy", "policy_ref": "fixture-policy#local-target"}
        current = self.bundle["successor_readiness"]["current_state"]
        designation_record = {"record_type": "mister-clean.current-state-designation",
                              **{key: current[key] for key in ("path", "sha256", "commit")},
                              "policy_ref": "fixture-policy#current-state"}
        records = {
            "criteria-source.json": criteria,
            "debris-census.json": debris_record,
            "independent-review.json": review_record,
            "local-target-policy.json": policy_record,
            "current-state-designation.json": designation_record,
        }
        for action in self.manifest.get("actions") or []:
            for evidence in (action.get("outcome") or {}).get("evidence") or []:
                if not isinstance(evidence, dict):
                    continue
                records[f"action-result-{action['id']}.json"] = {
                    "record_type": "mister-clean.action-result", "action_id": action["id"],
                    "kind": action["kind"], "target": action["target"],
                    **{key: evidence[key] for key in ("object", "command", "result", "observed_at")},
                }
        if gate_record is not None:
            records["gate-result.json"] = gate_record
        for name, record in records.items():
            (self.proof / name).write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        for action in self.manifest.get("actions") or []:
            for evidence in (action.get("outcome") or {}).get("evidence") or []:
                if isinstance(evidence, dict):
                    evidence["evidence_ref"]["sha256"] = digest(self.proof / f"action-result-{action['id']}.json")
        manifest_by_id = {action.get("id"): action for action in self.manifest.get("actions") or []}
        for report_action in self.report.get("actions") or []:
            source = manifest_by_id.get(report_action.get("id"))
            if source and (report_action.get("outcome") or {}).get("evidence"):
                report_action["outcome"]["evidence"][0]["evidence_ref"] = copy.deepcopy(
                    source["outcome"]["evidence"][0]["evidence_ref"]
                )
        self.bundle["criteria_discovery"]["source_refs"][0]["sha256"] = digest(self.proof / "criteria-source.json")
        request_source = self.bundle["criteria_discovery"].get("request_source")
        if isinstance(request_source, dict):
            request_source["sha256"] = digest(self.proof / "operative-request.txt")
        self.bundle["successor_readiness"]["target_observation"]["policy_evidence"]["sha256"] = digest(self.proof / "local-target-policy.json")
        designation = self.bundle["successor_readiness"]["current_state"].get("designation")
        if isinstance(designation, dict):
            designation["sha256"] = digest(self.proof / "current-state-designation.json")
        if gates:
            gates[0]["evidence_ref"]["sha256"] = digest(self.proof / "gate-result.json")
        self.bundle["successor_readiness"]["debris"]["evidence"][0]["sha256"] = digest(self.proof / "debris-census.json")
        self.bundle["successor_readiness"]["final_review"]["evidence_ref"]["sha256"] = digest(self.proof / "independent-review.json")
        report_path, manifest_path, bundle_path = self.proof / "report.json", self.proof / "manifest.json", self.proof / "bundle.json"
        report_path.write_text(json.dumps(self.report, indent=2) + "\n", encoding="utf-8")
        manifest_path.write_text(json.dumps(self.manifest, indent=2) + "\n", encoding="utf-8")
        self.bundle["report"]["sha256"] = digest(report_path)
        self.bundle["manifest"]["sha256"] = digest(manifest_path)
        bundle_path.write_text(json.dumps(self.bundle, indent=2) + "\n", encoding="utf-8")
        self.bundle_path = bundle_path

    def validate(self, *, live=True, repo_path=None):
        self._write()
        return BUNDLE.validate_bundle(self.bundle, self.bundle_path, verify_live=live,
                                      repo_path=self.repo if repo_path is None else repo_path)

    def executed_action(self, target="planning/done/done.md"):
        return {
            "id": "A-1", "kind": "planning_record_update", "target": target,
            "purpose": "make planning state truthful", "risk": "reversible_local",
            "authorization": {"state": "granted", "source": "skill_invocation", "ref": "request-1"},
            "preconditions": ["target inspected"], "verification": ["planning validator passed"],
            "status": "executed",
            "outcome": {"state": "verified", "evidence": [{
                "kind": "git_change", "object": self.head, "command": "git diff --check",
                "result": "exit 0", "observed_at": "2026-08-25T09:00:00Z",
                "evidence_ref": {"path": "action-result-A-1.json", "sha256": "pending"},
            }]},
        }

    def test_canonical_bundle_template_validates(self):
        asset = ROOT / "assets" / "closure-bundle.json"
        data = json.loads(asset.read_text(encoding="utf-8"))
        self.assertEqual(BUNDLE.validate_bundle(data, asset, allow_placeholders=True), [])

    def test_live_bound_bundle_passes(self):
        self.assertEqual(self.validate(), [])

    def test_standalone_clean_report_is_refused(self):
        errors = BUNDLE.VC.validate_report(self.report)
        self.assertTrue(any("closure-bundle" in error for error in errors), errors)

    def test_nonexistent_repository_is_refused(self):
        errors = self.validate(repo_path=Path("/definitely/not/a/repository"))
        self.assertTrue(any("repository not found" in error for error in errors), errors)

    def test_declared_repository_identity_must_match_live_origin_or_root(self):
        self.report["repo"]["id"] = "different/target"
        self.manifest["repo"]["id"] = "different/target"
        self.assertTrue(any("live repository identity" in error for error in self.validate()))

    def test_structural_mode_cannot_establish_clean(self):
        self.assertTrue(any("requires live verification" in error for error in self.validate(live=False)))

    def test_invalid_timestamp_is_refused(self):
        self.bundle["successor_readiness"]["target_observation"]["observed_at"] = "not-a-time"
        self.assertTrue(any("ISO-8601" in error for error in self.validate()))

    def test_invalid_report_measurement_time_is_refused(self):
        self.report["target_binding"]["measured_at"] = "not-a-time"
        self.assertTrue(any("target_binding.measured_at" in error for error in self.validate()))

    def test_empty_dimension_evidence_is_refused(self):
        self.report["dimensions"]["planning_integrity"]["evidence"] = [{}]
        self.assertTrue(any("planning_census" in error for error in self.validate()))

    def test_partial_gate_is_refused_despite_zero_exit(self):
        gate = self.bundle["successor_readiness"]["gates"][0]
        gate["verified"], gate["total"] = 7, 10
        self.assertTrue(any("verified must equal total" in error for error in self.validate()))

    def test_omitted_planning_artifact_is_refused(self):
        corpus = self.bundle["planning_discovery"]["systems"][0]["corpus"]
        corpus["artifacts"] = corpus["artifacts"][:1]
        corpus["total"] = corpus["classified"] = 1
        self.assertTrue(any("live census mismatch" in error for error in self.validate()))

    def test_declaring_no_planning_cannot_hide_a_live_planning_root(self):
        self.bundle["planning_discovery"]["systems"] = [{
            "id": "none", "kind": "none", "sources": ["root scan"],
            "schema_sources": ["no schema found"], "validators": ["common-root scan"],
            "corpus": {"roots": [], "include_globs": [], "total": 0,
                       "classified": 0, "unclassified": 0, "artifacts": []},
        }]
        self.assertTrue(any("contradicts live planning candidates" in error for error in self.validate()))

    def test_omitted_operator_criterion_is_refused(self):
        proof = self.bundle["criteria_discovery"]
        proof["criteria_ids"], proof["discovered_count"], proof["none_found"] = [], 0, True
        self.assertTrue(any("acceptance_criteria ids" in error for error in self.validate()))

    def test_reference_only_request_source_cannot_establish_clean(self):
        proof = self.bundle["criteria_discovery"]
        proof["source_kind"] = "reference_only"
        proof["request_source"] = None
        self.assertTrue(any("exact operative request bytes" in error for error in self.validate()))

    def test_report_manifest_action_sets_must_match(self):
        self.report["actions"] = [{"id": "A-1", "status": "executed"}]
        self.assertTrue(any("exact action id sets" in error for error in self.validate()))

    def test_report_manifest_action_contents_must_match(self):
        action = self.executed_action()
        self.report["actions"] = [copy.deepcopy(action)]
        self.manifest["actions"] = [copy.deepcopy(action)]
        self.manifest["execution_state"] = "executed"
        self.report["actions"][0]["target"] = "planning/backlog/next.md"
        self.assertTrue(any("canonical action records" in error for error in self.validate()))

    def test_duplicate_report_action_id_is_refused(self):
        action = self.executed_action()
        self.report["actions"] = [copy.deepcopy(action), copy.deepcopy(action)]
        self.manifest["actions"] = [copy.deepcopy(action)]
        self.manifest["execution_state"] = "executed"
        self.assertTrue(any("unique id" in error or "duplicate" in error for error in self.validate()))

    def test_zero_scope_gate_is_refused(self):
        gate = self.bundle["successor_readiness"]["gates"][0]
        gate["verified"] = gate["total"] = 0
        self.assertTrue(any("zero-scope" in error for error in self.validate()))

    def test_narrow_planning_root_is_refused(self):
        corpus = self.bundle["planning_discovery"]["systems"][0]["corpus"]
        corpus["roots"] = ["planning/done"]
        corpus["artifacts"] = corpus["artifacts"][:1]
        corpus["total"] = corpus["classified"] = 1
        self.assertTrue(any("independently discovered planning roots" in error for error in self.validate()))

    def test_nonstandard_work_items_planning_root_is_discovered(self):
        root = self.repo / "ops" / "work-items" / "closed"
        root.mkdir(parents=True)
        (root / "story.md").write_text("implementation DONE; required review NOT RUN\n", encoding="utf-8")
        self.assertTrue(any("independently discovered planning roots" in error for error in self.validate()))

    def test_nonexistent_gate_evidence_is_refused(self):
        self.bundle["successor_readiness"]["gates"][0]["evidence_ref"]["path"] = "missing.json"
        self.assertTrue(any("file not found" in error for error in self.validate()))

    def test_fake_snapshot_object_is_refused(self):
        self.bundle["successor_readiness"]["snapshots"]["start"]["object"] = "0" * 40
        self.assertTrue(any("must be an existing full commit" in error for error in self.validate()))

    def test_git_metadata_cannot_be_current_state(self):
        head_path = self.repo / ".git" / "HEAD"
        current = self.bundle["successor_readiness"]["current_state"]
        current["path"] = ".git/HEAD"
        current["sha256"] = digest(head_path)
        self.assertTrue(any("Git metadata" in error for error in self.validate()))

    def test_unverified_readme_candidate_cannot_establish_clean(self):
        current = self.bundle["successor_readiness"]["current_state"]
        current["state"] = "candidate_unverified"
        current["designation"] = None
        self.assertTrue(any("CLEAN requires designated" in error for error in self.validate()))

    def test_handoff_entrypoint_must_resolve_inside_repo(self):
        self.bundle["successor_readiness"]["handoff"]["entrypoints"] = ["/etc/passwd"]
        self.assertTrue(any("repository-relative" in error for error in self.validate()))

    def test_configured_upstream_forbids_local_only_target_proof(self):
        bare = self.base / "remote.git"
        run(self.base, "git", "init", "--bare", str(bare))
        run(self.repo, "git", "remote", "add", "origin", str(bare))
        run(self.repo, "git", "push", "-u", "origin", "main")
        self.bundle["successor_readiness"]["topology"]["remote_refs"] = [{
            "name": "refs/remotes/origin/main", "commit": self.head, "merged": True,
            "owner": "fixture", "purpose": "configured upstream", "disposition": "retain",
        }]
        errors = self.validate()
        self.assertTrue(any("configured upstream forbids local-only" in error for error in errors), errors)

    def test_uninventoried_remote_tracking_ref_is_refused(self):
        run(self.repo, "git", "update-ref", "refs/remotes/origin/forgotten", self.head)
        errors = self.validate()
        self.assertTrue(any("remote-ref set differs" in error for error in errors), errors)

    def test_bound_policy_does_not_suppress_divergent_branch(self):
        run(self.repo, "git", "switch", "-c", "divergent")
        (self.repo / "side.txt").write_text("side branch\n", encoding="utf-8")
        run(self.repo, "git", "add", "side.txt")
        run(self.repo, "git", "commit", "-m", "divergent work")
        side_commit = run(self.repo, "git", "rev-parse", "HEAD")
        run(self.repo, "git", "switch", "main")
        policy = {
            "record_type": "mister-clean.topology-policy",
            "surface": "branches", "identity": "divergent", "commit": side_commit,
            "request_sha256": self.bundle["criteria_discovery"]["request_sha256"],
            "actor": "fixture", "scope": "divergent branch",
            "rationale": "retain temporarily", "next_action": "integrate or remove",
        }
        policy_path = self.proof / "topology-policy.json"
        policy_path.write_text(json.dumps(policy, indent=2) + "\n", encoding="utf-8")
        self.bundle["successor_readiness"]["topology"]["branches"].append({
            "name": "divergent", "commit": side_commit, "merged": False,
            "owner": "fixture", "purpose": "side work", "disposition": "retain temporarily",
            "policy_ref": {"path": "topology-policy.json", "sha256": digest(policy_path)},
        })
        errors = self.validate()
        self.assertTrue(any("unmerged=1" in error for error in errors), errors)

    def test_satisfied_debt_rejects_textual_assertion(self):
        self.report["completion_debts"] = [{
            "id": "D-1", "procedure": "implementation -> review", "state": "satisfied",
            "disposition": "autonomously_validate", "evidence": ["fake textual assertion"],
        }]
        self.report["debt_census"] = {"discovered": 1, "paid": 1, "accepted_exception": 0}
        self.assertTrue(any("allowlisted" in error for error in self.validate()))

    def test_symlink_escape_action_is_refused_live(self):
        external = self.base / "external"
        external.mkdir()
        (self.repo / "escape").symlink_to(external, target_is_directory=True)
        run(self.repo, "git", "add", "escape")
        run(self.repo, "git", "commit", "-m", "add symlink")
        self.head = run(self.repo, "git", "rev-parse", "HEAD")
        # Rebind the otherwise valid proof to the new subject.
        self.report["repo"]["commit"] = self.head
        self.manifest["repo"]["commit"] = self.head
        self.report["target_binding"].update({"target_commit": self.head, "candidate_commit": self.head, "merge_base": self.head})
        self.report["claims"]["committed_locally"]["evidence"][0]["commit"] = self.head
        self.bundle["custody"]["subject_commit"] = self.head
        self.bundle["change_inventory"] = {"start_commit": self.head, "subject_commit": self.head, "changes": []}
        for snapshot in self.bundle["successor_readiness"]["snapshots"].values():
            snapshot["object"] = snapshot["result"] = self.head
        self.bundle["successor_readiness"]["target_observation"]["commit"] = self.head
        self.bundle["successor_readiness"]["topology"]["worktrees"][0]["head"] = self.head
        self.bundle["successor_readiness"]["topology"]["branches"][0]["commit"] = self.head
        self.bundle["successor_readiness"]["current_state"]["commit"] = self.head
        self.bundle["successor_readiness"]["gates"][0]["object"] = self.head
        action = self.executed_action("escape/secret")
        self.report["actions"] = [copy.deepcopy(action)]
        self.manifest["actions"] = [copy.deepcopy(action)]
        self.manifest["execution_state"] = "executed"
        self.assertTrue(any("symlink" in error for error in self.validate()))

    def test_not_clean_bundle_can_record_unresolved_state(self):
        self.report["verdict"] = "NOT_CLEAN"
        self.report["handoff_assessment"] = {"recommendation": "do_not_proceed", "reasons": ["review unresolved"], "conditions": []}
        self.report["dimensions"]["verification"] = {"state": "open", "evidence": [], "notes": ["review pending"]}
        self.bundle["successor_readiness"]["gates"] = []
        self.bundle["successor_readiness"]["topology"]["stashes"] = ["stash@{0}"]
        review = self.bundle["successor_readiness"]["final_review"]
        review.update({"status": "conditional", "findings_total": 1, "findings_paid": 0, "unresolved": 1})
        self.assertEqual(self.validate(), [])

    def test_unresolved_final_review_is_refused(self):
        review = self.bundle["successor_readiness"]["final_review"]
        review.update({"status": "conditional", "findings_total": 1, "findings_paid": 0, "unresolved": 1})
        self.assertTrue(any("final_review" in error for error in self.validate()))

    def test_reviewer_identity_alias_is_not_independent(self):
        review = self.bundle["successor_readiness"]["final_review"]
        review["reviewer"] = " FIXTURE-IMPLEMENTER "
        self.assertTrue(any("reviewer must differ" in error for error in self.validate()))

    def test_changed_path_requires_action_even_with_bound_exclusion(self):
        start = self.head
        changed = self.repo / "planning" / "done" / "done.md"
        changed.write_text("done and amended\n", encoding="utf-8")
        run(self.repo, "git", "add", ".")
        run(self.repo, "git", "commit", "-m", "material change")
        self.head = run(self.repo, "git", "rev-parse", "HEAD")
        self.report["repo"]["commit"] = self.head
        self.manifest["repo"]["commit"] = self.head
        self.report["target_binding"].update({"target_commit": self.head, "candidate_commit": self.head, "merge_base": self.head})
        self.report["claims"]["committed_locally"]["evidence"][0]["commit"] = self.head
        self.bundle["custody"]["subject_commit"] = self.head
        self.bundle["change_inventory"] = {"start_commit": start, "subject_commit": self.head,
                                           "changes": [{"status": "M", "path": "planning/done/done.md",
                                                        "action_ids": [], "exclusion": None}]}
        self.bundle["successor_readiness"]["snapshots"]["start"]["object"] = start
        self.bundle["successor_readiness"]["snapshots"]["end"]["object"] = self.head
        self.bundle["successor_readiness"]["target_observation"]["commit"] = self.head
        self.bundle["successor_readiness"]["topology"]["worktrees"][0]["head"] = self.head
        self.bundle["successor_readiness"]["topology"]["branches"][0]["commit"] = self.head
        current = self.bundle["successor_readiness"]["current_state"]
        current["commit"] = self.head
        self.bundle["successor_readiness"]["gates"][0]["object"] = self.head
        artifacts = self.bundle["planning_discovery"]["systems"][0]["corpus"]["artifacts"]
        next(item for item in artifacts if item["path"] == "planning/done/done.md")["sha256"] = digest(changed)
        exclusion_record = {
            "record_type": "mister-clean.change-exclusion",
            "path": "planning/done/done.md", "status": "M",
            "start_commit": start, "subject_commit": self.head,
            "request_sha256": self.bundle["criteria_discovery"]["request_sha256"],
            "actor": "fixture", "scope": "preexisting concurrent change",
            "rationale": "adopted into the closing subject",
        }
        exclusion_path = self.proof / "change-exclusion.json"
        exclusion_path.write_text(json.dumps(exclusion_record, indent=2) + "\n", encoding="utf-8")
        self.bundle["change_inventory"]["changes"][0]["exclusion"] = {
            "path": "change-exclusion.json", "sha256": digest(exclusion_path),
        }
        self.assertTrue(any("requires an executed action mapping" in error for error in self.validate()))


if __name__ == "__main__":
    unittest.main()
