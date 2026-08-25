#!/usr/bin/env python3
"""Create a collision-free Mister Clean closeout bundle scaffold from live facts.

This prepares evidence mechanics; it never claims CLEAN. The closeout agent
fills the incremental action ledger, pays debt, records gates and independent
review, then validates the completed bundle with validate_bundle.py.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("validate_bundle", ROOT / "scripts" / "validate_bundle.py")
VB = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(VB)


def git(repo: Path, *args: str, allow: tuple[int, ...] = (0,)) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args], text=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False,
    )
    if result.returncode not in allow:
        raise RuntimeError(result.stderr.strip() or f"git {' '.join(args)} exited {result.returncode}")
    return result.stdout.strip()


def load(name: str) -> dict[str, Any]:
    return json.loads((ROOT / "assets" / name).read_text(encoding="utf-8"))


def write(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=False) + "\n", encoding="utf-8")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def repo_identity(repo: Path) -> str:
    remote = git(repo, "config", "--get", "remote.origin.url", allow=(0, 1))
    if remote and not remote.startswith(("/", "file://")):
        if "://" in remote:
            value = urlparse(remote).path.strip("/")
        else:
            value = remote.split(":", 1)[-1]
        value = value.removesuffix(".git").rstrip("/")
        if "/" in value:
            return value
    return repo.name


def classify(relative: str) -> str:
    parts = [part.casefold() for part in Path(relative).parts]
    for lane in ("backlog", "active", "in-progress", "done", "archive", "archived"):
        if lane in parts:
            return lane
    return "planning"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--evidence-home", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--request-ref", required=True)
    request = parser.add_mutually_exclusive_group()
    request.add_argument("--request-source", type=Path)
    request.add_argument(
        "--request-text",
        help="exact operative invocation text; copied into the sidecar as UTF-8 bytes",
    )
    parser.add_argument("--criterion", action="append", default=[], metavar="ID")
    args = parser.parse_args()

    repo = Path(git(args.repo.resolve(), "rev-parse", "--show-toplevel")).resolve()
    bundle_dir = args.evidence_home.resolve() / "mister-clean" / args.run_id
    if bundle_dir.exists():
        print(f"ERROR: refusing to overwrite existing run directory: {bundle_dir}", file=sys.stderr)
        return 2
    bundle_dir.mkdir(parents=True)

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    head = git(repo, "rev-parse", "HEAD")
    branch = git(repo, "branch", "--show-current") or "detached"
    repo_id = repo_identity(repo)
    upstream = git(repo, "rev-parse", "--symbolic-full-name", "@{upstream}", allow=(0, 128))
    target_ref = upstream or (f"refs/heads/{branch}" if branch != "detached" else head)
    target_commit = git(repo, "rev-parse", target_ref)
    merge_base = git(repo, "merge-base", target_commit, head)
    left, right = git(repo, "rev-list", "--left-right", "--count", f"{target_commit}...{head}").split()

    if args.request_source:
        request_bytes = args.request_source.read_bytes()
    elif args.request_text is not None:
        request_bytes = args.request_text.encode("utf-8")
    else:
        request_bytes = args.request_ref.encode("utf-8")
    request_sha = hashlib.sha256(request_bytes).hexdigest()
    request_source_ref = None
    source_kind = "reference_only"
    if args.request_source or args.request_text is not None:
        request_copy = bundle_dir / "operative-request.txt"
        request_copy.write_bytes(request_bytes)
        request_source_ref = {"path": request_copy.name, "sha256": digest(request_copy)}
        source_kind = "exact_bytes"
    criteria_ids = list(dict.fromkeys(args.criterion))
    criteria_record = {
        "record_type": "mister-clean.criteria-source", "request_ref": args.request_ref,
        "request_sha256": request_sha, "criteria_ids": criteria_ids,
    }
    write(bundle_dir / "criteria-source.json", criteria_record)

    planning_roots = sorted(VB._discover_planning_roots(repo))
    systems: list[dict[str, Any]] = []
    if planning_roots:
        for index, root_text in enumerate(planning_roots, start=1):
            root = repo / root_text
            files = sorted(path for path in root.rglob("*") if path.is_file() and ".git" not in path.parts)
            artifacts = [
                {"path": path.relative_to(repo).as_posix(), "class": classify(path.relative_to(repo).as_posix()),
                 "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
                for path in files
            ]
            systems.append({
                "id": f"repository-planning-{index}", "kind": "repo_files",
                "sources": [root_text], "schema_sources": ["repository lane/artifact convention; verify manually"],
                "validators": ["mister-clean live planning census"],
                "corpus": {"roots": [root_text], "include_globs": ["**/*"],
                           "total": len(artifacts), "classified": len(artifacts),
                           "unclassified": 0, "artifacts": artifacts},
            })
    else:
        systems = [{
            "id": "no-repository-planning", "kind": "none", "sources": ["independent shallow root scan"],
            "schema_sources": ["no planning schema found"], "validators": ["mister-clean planning discovery"],
            "corpus": {"roots": [], "include_globs": [], "total": 0, "classified": 0,
                       "unclassified": 0, "artifacts": []},
        }]

    worktrees = []
    for row in VB._parse_worktrees(repo):
        path = Path(row["worktree"])
        dirty_count = len(git(path, "status", "--porcelain=v1", "--untracked-files=all").splitlines())
        worktrees.append({"path": str(path.resolve()), "head": row.get("head", ""),
                          "branch": row.get("branch", "detached"), "dirty_count": dirty_count,
                          "owner": "unassigned", "purpose": "discovered during closeout",
                          "disposition": "requires reconciliation"})
    branches = []
    for line in git(repo, "for-each-ref", "--format=%(refname:short)%09%(objectname)", "refs/heads").splitlines():
        name, commit = line.split("\t", 1)
        merged = subprocess.run(["git", "-C", str(repo), "merge-base", "--is-ancestor", commit, head]).returncode == 0
        branches.append({"name": name, "commit": commit, "merged": merged, "owner": "unassigned",
                         "purpose": "discovered during closeout", "disposition": "requires reconciliation"})
    remote_refs = []
    for line in git(repo, "for-each-ref", "--format=%(refname)%09%(objectname)", "refs/remotes").splitlines():
        name, commit = line.split("\t", 1)
        if name.endswith("/HEAD"):
            continue
        merged = subprocess.run(["git", "-C", str(repo), "merge-base", "--is-ancestor", commit, head]).returncode == 0
        remote_refs.append({"name": name, "commit": commit, "merged": merged, "owner": "unassigned",
                            "purpose": "discovered during closeout", "disposition": "requires reconciliation"})
    stashes = git(repo, "stash", "list", "--format=%gd%09%H%09%gs").splitlines()

    current_candidates = ("CURRENT-STATE.md", "docs/CURRENT-STATE.md", "_STATUS.md", "README.md")
    current_path = next((candidate for candidate in current_candidates if (repo / candidate).is_file()), None)

    policy_ref = None
    if upstream:
        remote = git(repo, "config", "--get", f"branch.{branch}.remote")
        remote_ref = git(repo, "config", "--get", f"branch.{branch}.merge")
        target_observation = {"kind": "remote_ref_resolution", "local_ref": upstream, "remote": remote,
                              "remote_ref": remote_ref, "commit": target_commit, "observed_at": now}
    else:
        policy = {"record_type": "mister-clean.local-target-policy",
                  "policy_ref": "no configured upstream; current branch is the conservative local target"}
        write(bundle_dir / "local-target-policy.json", policy)
        policy_ref = {"path": "local-target-policy.json", "sha256": digest(bundle_dir / "local-target-policy.json")}
        target_observation = {"kind": "local_ref_resolution", "local_ref": target_ref,
                              "commit": target_commit, "observed_at": now, "policy_evidence": policy_ref}

    report = load("closeout-report.json")
    report.update({"generated_at": now, "repo": {"id": repo_id, "commit": head, "branch": branch},
                   "mode": "CLOSE", "actions": [], "completion_debts": [], "residuals": [],
                   "acceptance_criteria": [{"id": item, "source": "operator", "met": False,
                                             "evidence": ["not yet assessed"]} for item in criteria_ids],
                   "verdict": "NOT_CLEAN", "debt_census": {"discovered": 0, "paid": 0, "accepted_exception": 0}})
    report["authorization_basis"]["ref"] = args.request_ref
    report["scope"] = {"included": [f"repository:{repo_id}"], "excluded": [], "policy_sources": []}
    report["target_binding"] = {"target_ref": target_ref, "target_commit": target_commit,
                                "candidate_commit": head, "merge_base": merge_base,
                                "target_commits_missing": int(left), "candidate_commits_ahead": int(right),
                                "target_incorporated": int(left) == 0 and merge_base == target_commit,
                                "measured_at": now,
                                "evidence": [f"git merge-base + rev-list --left-right --count => {left}/{right}"]}
    manifest = load("action-manifest.json")
    manifest["repo"] = {"id": repo_id, "commit": head}
    manifest["request_ref"] = args.request_ref
    manifest["authorization_basis"]["ref"] = args.request_ref

    debris = {"record_type": "mister-clean.debris-census", "removed": 0, "retained": 0, "unclassified": 0}
    write(bundle_dir / "debris-census.json", debris)
    review = {"record_type": "mister-clean.independent-review", "observed_at": now,
              "mechanism": "not yet run", "status": "not_run", "reviewer": "not-assigned",
              "implementer": f"mister-clean:{args.run_id}", "candidate_commit": head,
              "reviewer_execution": {"harness": "not-assigned", "session_id": "not-assigned", "receipt_id": "not-assigned"},
              "implementer_execution": {"harness": "local", "session_id": args.run_id, "receipt_id": f"prepare-{args.run_id}"},
              "criteria_ids": criteria_ids, "planning_system_ids": [item["id"] for item in systems],
              "findings_total": 0, "findings_paid": 0, "unresolved": 0}
    write(bundle_dir / "independent-review.json", review)

    bundle = load("closure-bundle.json")
    bundle.update({"run_id": args.run_id, "request_ref": args.request_ref,
                   "custody": {"mode": "sidecar", "subject_commit": head,
                               "evidence_root": None, "evidence_paths": []},
                   "criteria_discovery": {"source_kind": source_kind, "request_source": request_source_ref,
                                          "source_refs": [{"path": "criteria-source.json", "sha256": digest(bundle_dir / "criteria-source.json")}],
                                          "request_sha256": request_sha, "discovered_count": len(criteria_ids),
                                          "none_found": not criteria_ids, "criteria_ids": criteria_ids},
                   "change_inventory": {"start_commit": head, "subject_commit": head, "changes": []},
                   "planning_discovery": {"unknown": False, "systems": systems}})
    bundle["successor_readiness"] = {
        "snapshots": {"start": {"kind": "repository_snapshot", "object": head,
                                  "command": "git rev-parse HEAD plus full topology census",
                                  "result": head, "observed_at": now},
                      "end": {"kind": "repository_snapshot", "object": head,
                                "command": "initial scaffold; closing snapshot not yet taken",
                                "result": head, "observed_at": now}},
        "target_observation": target_observation,
        "topology": {"worktrees": worktrees, "branches": branches, "remote_refs": remote_refs,
                     "stashes": stashes, "processes": [],
                     "dirty": sum(1 for item in worktrees if item["dirty_count"]),
                     "unowned": len(worktrees) + len(branches) + len(remote_refs),
                     "unmerged": sum(1 for item in branches + remote_refs if not item["merged"]),
                     "blocking_processes": 0},
        "current_state": ({"state": "candidate_unverified", "path": current_path,
                           "sha256": digest(repo / current_path), "commit": head,
                           "generator": "discovered candidate; requires explicit designation",
                           "designation": None}
                          if current_path else
                          {"state": "missing", "path": None, "sha256": None, "commit": head,
                           "generator": "not yet created", "designation": None}),
        "gates": [],
        "debris": {"removed": 0, "retained": 0, "unclassified": 0,
                   "evidence": [{"path": "debris-census.json", "sha256": digest(bundle_dir / "debris-census.json")}]},
        "handoff": {"entrypoints": [current_path] if current_path else [], "next_owner": "unassigned-by-policy",
                    "next_action": "pay the first open debt discovered by Mister Clean"},
        "final_review": {"mechanism": "not yet run", "status": "not_run",
                         "reviewer": "not-assigned", "implementer": f"mister-clean:{args.run_id}",
                         "reviewer_execution": {"harness": "not-assigned", "session_id": "not-assigned", "receipt_id": "not-assigned"},
                         "implementer_execution": {"harness": "local", "session_id": args.run_id, "receipt_id": f"prepare-{args.run_id}"},
                         "criteria_reviewed": False, "planning_reviewed": False,
                         "findings_total": 0, "findings_paid": 0, "unresolved": 0,
                         "evidence_ref": {"path": "independent-review.json", "sha256": digest(bundle_dir / "independent-review.json")}},
    }
    write(bundle_dir / "action-manifest.json", manifest)
    write(bundle_dir / "closeout-report.json", report)
    bundle["manifest"] = {"path": "action-manifest.json", "sha256": digest(bundle_dir / "action-manifest.json")}
    bundle["report"] = {"path": "closeout-report.json", "sha256": digest(bundle_dir / "closeout-report.json")}
    write(bundle_dir / "closure-bundle.json", bundle)
    print(bundle_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
