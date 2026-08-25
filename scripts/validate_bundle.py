#!/usr/bin/env python3
"""Validate one live-bound Mister Clean closure bundle.

The report describes the close. The manifest describes authorized/executed
actions. This bundle binds both to one invocation and independently rechecks
the Git object, target, topology, planning corpus, and proof arithmetic that a
CLEAN verdict depends on.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
from urllib.parse import urlparse
from datetime import datetime
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("validate_closeout", HERE / "validate_closeout.py")
VC = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(VC)

HEX64 = re.compile(r"^[0-9a-f]{64}$")
KINDS = {"repo_files", "external_snapshot", "none"}
GATE_KINDS = {
    "isolated_clone", "repository_tests", "lint", "typecheck", "build",
    "planning_validation", "security_scan", "established_ci", "negative_control",
}
LOCAL_ACTION_KINDS = {
    "local_edit", "local_move", "recoverable_delete", "doc_update",
    "planning_record_update", "historical_conform", "handoff_update",
}
PLANNING_DIR_NAMES = {
    "planning", "plans", "roadmap", "project-management", "work-items",
    "work_items", "tasks", "stories", "epics", "slices", "issues",
}
PLANNING_LANE_NAMES = {"backlog", "active", "in-progress", "done", "archive", "archived"}


def _nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _executed_text(value: Any) -> bool:
    if not _nonempty(value):
        return False
    normalized = " ".join(str(value).split()).casefold()
    return normalized not in {"not run", "not executed", "not measured", "claim", "anything", "pass"}


def _owned_text(value: Any) -> bool:
    return _nonempty(value) and " ".join(str(value).split()).casefold() not in {
        "unknown", "unassigned", "none", "n/a", "not assigned", "not-assigned",
    }


def _identity(value: Any) -> str:
    return " ".join(str(value).split()).casefold() if value is not None else ""


def _repo_identity(repo: Path) -> str:
    remote = _git(repo, "config", "--get", "remote.origin.url", allow=(0, 1)).stdout.strip()
    if remote and not remote.startswith(("/", "file://")):
        if "://" in remote:
            value = urlparse(remote).path.strip("/")
        else:
            value = remote.split(":", 1)[-1]
        value = value.removesuffix(".git").rstrip("/")
        if "/" in value:
            return value
    return repo.name


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _iso(value: Any) -> bool:
    if not _nonempty(value):
        return False
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.tzinfo is not None
    except ValueError:
        return False


def _contained(root: Path, relative: Any) -> Path | None:
    if not _nonempty(relative):
        return None
    candidate = (root / str(relative)).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return None
    return candidate


def _evidence_ref(
    base: Path,
    ref: Any,
    path: str,
    errors: list[str],
    *,
    record_type: str | None = None,
    allow_placeholders: bool = False,
) -> dict[str, Any] | None:
    if allow_placeholders and isinstance(ref, dict) and any(
        isinstance(ref.get(field), str) and "<" in ref[field]
        for field in ("path", "sha256")
    ):
        _required(ref, {"path", "sha256"}, path, errors)
        return None
    data, _ = _load_ref(base, ref, path, errors, allow_placeholders)
    if data is not None and record_type is not None and data.get("record_type") != record_type:
        errors.append(f"{path}: expected evidence record_type {record_type}")
    return data


def _file_ref(
    base: Path,
    ref: Any,
    path: str,
    errors: list[str],
    allow_placeholders: bool,
) -> Path | None:
    if not _required(ref, {"path", "sha256"}, path, errors):
        return None
    if allow_placeholders and any(isinstance(ref.get(field), str) and "<" in ref[field] for field in ("path", "sha256")):
        return None
    target = _contained(base, ref.get("path"))
    if target is None or not target.is_file():
        errors.append(f"{path}.path: file not found or outside bundle directory")
        return None
    if not (isinstance(ref.get("sha256"), str) and HEX64.fullmatch(ref["sha256"])):
        errors.append(f"{path}.sha256: required lowercase SHA-256")
    elif _sha256(target) != ref["sha256"]:
        errors.append(f"{path}.sha256: digest mismatch")
    return target


def _discover_planning_roots(repo: Path) -> set[str]:
    """Independently find likely repository planning surfaces.

    The declaration cannot define its own completeness. Keep the heuristic
    conservative and deterministic: named planning roots, plus shallow
    directories that contain at least two recognized lifecycle lanes.
    """
    candidates: set[Path] = set()
    ignored = {".git", "node_modules", "vendor", ".venv", "venv", "dist", "build", ".cache"}
    for directory, names, _ in os.walk(repo):
        item = Path(directory)
        rel = item.relative_to(repo)
        names[:] = [name for name in names if name not in ignored and len(rel.parts) < 4]
        if len(rel.parts) > 4:
            names[:] = []
            continue
        if item != repo and item.name.casefold() in PLANNING_DIR_NAMES:
            candidates.add(item)
            names[:] = []
            continue
        lanes = {name.casefold() for name in names}
        if len(lanes & PLANNING_LANE_NAMES) >= 2:
            candidates.add(item)
            names[:] = []
    minimal: set[Path] = set()
    for candidate in sorted(candidates, key=lambda p: len(p.parts)):
        if not any(parent == candidate or parent in candidate.parents for parent in minimal):
            minimal.add(candidate)
    return {path.relative_to(repo).as_posix() for path in minimal}


def _git(repo: Path, *args: str, allow: tuple[int, ...] = (0,)) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode not in allow:
        raise RuntimeError(result.stderr.strip() or f"git {' '.join(args)} exited {result.returncode}")
    return result


def _required(obj: Any, keys: set[str], path: str, errors: list[str]) -> bool:
    if not isinstance(obj, dict):
        errors.append(f"{path}: expected object")
        return False
    for key in sorted(keys - set(obj)):
        errors.append(f"{path}.{key}: missing")
    return True


def _load_ref(
    base: Path,
    ref: Any,
    path: str,
    errors: list[str],
    allow_placeholders: bool,
) -> tuple[dict[str, Any] | None, Path | None]:
    if not _required(ref, {"path", "sha256"}, path, errors):
        return None, None
    target = _contained(base, ref.get("path"))
    if target is None:
        errors.append(f"{path}.path: must resolve inside the bundle directory")
        return None, None
    if not target.is_file():
        errors.append(f"{path}.path: file not found: {target}")
        return None, target
    expected = ref.get("sha256")
    if not allow_placeholders:
        if not (isinstance(expected, str) and HEX64.fullmatch(expected)):
            errors.append(f"{path}.sha256: required lowercase SHA-256")
        elif _sha256(target) != expected:
            errors.append(f"{path}.sha256: digest mismatch")
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"{path}.path: {exc}")
        return None, target
    return data, target


def _validate_criteria(
    bundle: dict[str, Any],
    report: dict[str, Any],
    errors: list[str],
    allow_placeholders: bool,
    base: Path,
    clean: bool,
) -> None:
    proof = bundle.get("criteria_discovery")
    path = "$.criteria_discovery"
    if not _required(proof, {"source_kind", "request_source", "source_refs", "request_sha256", "discovered_count", "none_found", "criteria_ids"}, path, errors):
        return
    refs = proof.get("source_refs")
    ids = proof.get("criteria_ids")
    count = proof.get("discovered_count")
    none_found = proof.get("none_found")
    if proof.get("source_kind") not in {"exact_bytes", "reference_only"}:
        errors.append(f"{path}.source_kind: expected exact_bytes or reference_only")
    if clean and proof.get("source_kind") != "exact_bytes":
        errors.append(f"{path}.source_kind: CLEAN requires exact operative request bytes")
    if proof.get("source_kind") == "exact_bytes":
        request_path = _file_ref(base, proof.get("request_source"), f"{path}.request_source", errors, allow_placeholders)
        if request_path is not None and not allow_placeholders and _sha256(request_path) != proof.get("request_sha256"):
            errors.append(f"{path}.request_source: exact request bytes do not match request_sha256")
    elif proof.get("request_source") is not None:
        errors.append(f"{path}.request_source: reference_only requires null")
    if not (isinstance(refs, list) and refs):
        errors.append(f"{path}.source_refs: required nonempty digest-bound evidence array")
        refs = []
    if not allow_placeholders and not (isinstance(proof.get("request_sha256"), str) and HEX64.fullmatch(proof["request_sha256"])):
        errors.append(f"{path}.request_sha256: required lowercase SHA-256")
    if not (isinstance(ids, list) and all(_nonempty(x) for x in ids)):
        errors.append(f"{path}.criteria_ids: required string array")
        ids = []
    if not isinstance(count, int) or isinstance(count, bool) or count < 0:
        errors.append(f"{path}.discovered_count: required nonnegative integer")
    elif count != len(ids):
        errors.append(f"{path}: discovered_count ({count}) != criteria_ids ({len(ids)})")
    if not isinstance(none_found, bool):
        errors.append(f"{path}.none_found: required boolean")
    elif none_found != (count == 0):
        errors.append(f"{path}.none_found: must be true exactly when discovered_count is zero")
    report_ids = [x.get("id") for x in report.get("acceptance_criteria") or [] if isinstance(x, dict)]
    if sorted(ids) != sorted(report_ids):
        errors.append(f"{path}.criteria_ids: must equal report acceptance_criteria ids")
    source_records: list[dict[str, Any]] = []
    for index, ref in enumerate(refs):
        record = _evidence_ref(
            base,
            ref,
            f"{path}.source_refs[{index}]",
            errors,
            record_type="mister-clean.criteria-source",
            allow_placeholders=allow_placeholders,
        )
        if record is not None:
            source_records.append(record)
    if not allow_placeholders:
        matching = [
            record for record in source_records
            if record.get("request_ref") == bundle.get("request_ref")
            and record.get("request_sha256") == proof.get("request_sha256")
            and sorted(record.get("criteria_ids") or []) == sorted(ids)
        ]
        if not matching:
            errors.append(f"{path}.source_refs: no bound source record matches request_ref, request_sha256, and criteria_ids")


def _validate_planning(
    bundle: dict[str, Any],
    errors: list[str],
    verify_live: bool,
    repo: Path | None,
    clean: bool,
) -> None:
    planning = bundle.get("planning_discovery")
    path = "$.planning_discovery"
    if not _required(planning, {"unknown", "systems"}, path, errors):
        return
    if clean and planning.get("unknown") is not False:
        errors.append(f"{path}.unknown: CLEAN requires false")
    systems = planning.get("systems")
    if not (isinstance(systems, list) and systems):
        errors.append(f"{path}.systems: required nonempty array")
        return
    none_systems = [system for system in systems if isinstance(system, dict) and system.get("kind") == "none"]
    if none_systems and len(systems) != 1:
        errors.append(f"{path}.systems: kind=none is only valid as the sole discovered planning system")
    discovered_roots = _discover_planning_roots(repo) if verify_live and repo is not None else set()
    if verify_live and none_systems:
        present = sorted(discovered_roots)
        if present:
            errors.append(f"{path}.systems: kind=none contradicts live planning candidates {present}")
    system_ids: set[str] = set()
    global_artifacts: set[str] = set()
    declared_repo_roots: set[str] = set()
    for index, system in enumerate(systems):
        spath = f"{path}.systems[{index}]"
        if not _required(system, {"id", "kind", "sources", "schema_sources", "validators", "corpus"}, spath, errors):
            continue
        if not _nonempty(system.get("id")):
            errors.append(f"{spath}.id: required")
        elif system.get("id") in system_ids:
            errors.append(f"{spath}.id: duplicate {system.get('id')!r}")
        else:
            system_ids.add(system.get("id"))
        if system.get("kind") not in KINDS:
            errors.append(f"{spath}.kind: expected one of {sorted(KINDS)}")
        for field in ("sources", "schema_sources", "validators"):
            value = system.get(field)
            if not (isinstance(value, list) and value and all(_nonempty(x) for x in value)):
                errors.append(f"{spath}.{field}: required nonempty string array")
        corpus = system.get("corpus")
        cpath = f"{spath}.corpus"
        if not _required(corpus, {"roots", "include_globs", "total", "classified", "unclassified", "artifacts"}, cpath, errors):
            continue
        roots = corpus.get("roots")
        globs = corpus.get("include_globs")
        artifacts = corpus.get("artifacts")
        if not (isinstance(roots, list) and all(_nonempty(x) for x in roots)):
            errors.append(f"{cpath}.roots: required string array")
            roots = []
        if not (isinstance(globs, list) and all(_nonempty(x) for x in globs)):
            errors.append(f"{cpath}.include_globs: required string array")
            globs = []
        if system.get("kind") == "repo_files" and not roots:
            errors.append(f"{cpath}.roots: repo_files requires at least one repository root")
        if system.get("kind") == "repo_files" and not globs:
            errors.append(f"{cpath}.include_globs: repo_files requires at least one discovery glob")
        if system.get("kind") == "none" and (roots or globs):
            errors.append(f"{cpath}: kind=none requires empty roots and include_globs")
        if not isinstance(artifacts, list):
            errors.append(f"{cpath}.artifacts: required array")
            artifacts = []
        seen: set[str] = set()
        unclassified = 0
        for ai, artifact in enumerate(artifacts):
            apath = f"{cpath}.artifacts[{ai}]"
            if not _required(artifact, {"path", "class", "sha256"}, apath, errors):
                continue
            rel = artifact.get("path")
            if not _nonempty(rel) or rel in seen:
                errors.append(f"{apath}.path: required unique repository-relative path")
                continue
            seen.add(rel)
            if rel in global_artifacts:
                errors.append(f"{apath}.path: artifact appears in more than one planning system")
            global_artifacts.add(rel)
            if not _nonempty(artifact.get("class")):
                errors.append(f"{apath}.class: required explicit class")
                unclassified += 1
            if not (isinstance(artifact.get("sha256"), str) and HEX64.fullmatch(artifact["sha256"])):
                errors.append(f"{apath}.sha256: required lowercase SHA-256")
            if verify_live and repo is not None and system.get("kind") == "repo_files":
                target = _contained(repo, rel)
                if target is None or not target.is_file():
                    errors.append(f"{apath}.path: missing or outside repository")
                elif HEX64.fullmatch(str(artifact.get("sha256", ""))) and _sha256(target) != artifact["sha256"]:
                    errors.append(f"{apath}.sha256: live digest mismatch")
        total = corpus.get("total")
        classified = corpus.get("classified")
        reported_unclassified = corpus.get("unclassified")
        if total != len(seen):
            errors.append(f"{cpath}.total ({total}) != unique artifacts ({len(seen)})")
        if classified != len(seen) - unclassified:
            errors.append(f"{cpath}.classified ({classified}) != classified artifact rows ({len(seen) - unclassified})")
        if reported_unclassified != unclassified:
            errors.append(f"{cpath}.unclassified ({reported_unclassified}) != unclassified artifact rows ({unclassified})")
        if clean and reported_unclassified != 0:
            errors.append(f"{cpath}.unclassified: CLEAN requires zero")
        if verify_live and repo is not None and system.get("kind") == "repo_files":
            live: set[str] = set()
            for root_text in roots:
                root = _contained(repo, root_text)
                if root is None or not root.exists():
                    errors.append(f"{cpath}.roots: missing or outside repository: {root_text!r}")
                    continue
                declared_repo_roots.add(Path(root_text).as_posix().rstrip("/"))
                candidates = [root] if root.is_file() else root.rglob("*")
                for item in candidates:
                    if item.is_file() and ".git" not in item.parts:
                        live.add(item.relative_to(repo).as_posix())
            if live != seen:
                missing = sorted(live - seen)
                extra = sorted(seen - live)
                errors.append(f"{cpath}: live census mismatch missing_from_bundle={missing} absent_from_live={extra}")
            if clean:
                by_path = {item.get("path"): item for item in artifacts if isinstance(item, dict)}
                for relative in sorted(live):
                    artifact = by_path.get(relative) or {}
                    if str(artifact.get("class", "")).casefold() in {"archive", "archived"}:
                        continue
                    target = repo / relative
                    if target.suffix.casefold() not in {".md", ".txt", ".yaml", ".yml", ".json"}:
                        continue
                    try:
                        text = target.read_text(encoding="utf-8", errors="ignore")
                    except OSError:
                        continue
                    early_done = re.search(r"(?i)\b(implementation|dev|code)\b", text) and re.search(r"(?i)\b(done|complete|completed|merged)\b", text)
                    later_unrun = re.search(r"(?i)\b(review|qa|acceptance|holdout)\b", text) and re.search(r"(?i)\b(not[_ -]?run|pending|todo|backlog|unexecuted)\b", text)
                    if early_done and later_unrun:
                        errors.append(f"{cpath}: {relative} contains an executed-early/unexecuted-later procedure and cannot be CLEAN")
    if verify_live and repo is not None:
        uncovered = sorted(
            discovered
            for discovered in discovered_roots
            if not any(
                declared == discovered or Path(declared) in Path(discovered).parents
                for declared in declared_repo_roots
            )
        )
        if uncovered:
            errors.append(f"{path}.systems: independently discovered planning roots are not fully covered: {uncovered}")


def _evidence_object(item: Any, path: str, errors: list[str], allow_placeholders: bool) -> None:
    if not _required(item, {"kind", "object", "command", "result", "observed_at"}, path, errors):
        return
    for key in ("kind", "object", "command", "result"):
        if not _nonempty(item.get(key)):
            errors.append(f"{path}.{key}: required")
    if not allow_placeholders and not _executed_text(item.get("command")):
        errors.append(f"{path}.command: must describe an executed observation, not an assertion")
    if not allow_placeholders and not _iso(item.get("observed_at")):
        errors.append(f"{path}.observed_at: required ISO-8601 timestamp")


def _validate_successor(
    bundle: dict[str, Any],
    report: dict[str, Any],
    errors: list[str],
    allow_placeholders: bool,
    base: Path,
    clean: bool,
) -> None:
    successor = bundle.get("successor_readiness")
    path = "$.successor_readiness"
    required = {"snapshots", "target_observation", "topology", "current_state", "gates", "debris", "handoff", "final_review"}
    if not _required(successor, required, path, errors):
        return
    snapshots = successor.get("snapshots")
    if _required(snapshots, {"start", "end"}, f"{path}.snapshots", errors):
        _evidence_object(snapshots.get("start"), f"{path}.snapshots.start", errors, allow_placeholders)
        _evidence_object(snapshots.get("end"), f"{path}.snapshots.end", errors, allow_placeholders)
        for name in ("start", "end"):
            if isinstance(snapshots.get(name), dict) and snapshots[name].get("kind") != "repository_snapshot":
                errors.append(f"{path}.snapshots.{name}.kind: expected repository_snapshot")
    observation = successor.get("target_observation")
    if _required(observation, {"kind", "local_ref", "commit", "observed_at"}, f"{path}.target_observation", errors):
        if observation.get("kind") not in {"remote_ref_resolution", "local_ref_resolution"}:
            errors.append(f"{path}.target_observation.kind: unsupported")
        if not _nonempty(observation.get("commit")):
            errors.append(f"{path}.target_observation.commit: required")
        if not _nonempty(observation.get("local_ref")):
            errors.append(f"{path}.target_observation.local_ref: required")
        if not allow_placeholders and not _iso(observation.get("observed_at")):
            errors.append(f"{path}.target_observation.observed_at: required ISO-8601 timestamp")
        if observation.get("kind") == "remote_ref_resolution":
            for field in ("remote", "remote_ref"):
                if not _nonempty(observation.get(field)):
                    errors.append(f"{path}.target_observation.{field}: required")
        else:
            _evidence_ref(
                base, observation.get("policy_evidence"), f"{path}.target_observation.policy_evidence",
                errors, record_type="mister-clean.local-target-policy",
                allow_placeholders=allow_placeholders,
            )
    topology = successor.get("topology")
    if _required(topology, {"worktrees", "branches", "remote_refs", "stashes", "processes", "dirty", "unowned", "unmerged", "blocking_processes"}, f"{path}.topology", errors):
        for field in ("worktrees", "branches", "remote_refs", "stashes", "processes"):
            if not isinstance(topology.get(field), list):
                errors.append(f"{path}.topology.{field}: required array")
        row_specs = {
            "worktrees": {"path", "head", "branch", "dirty_count", "owner", "purpose", "disposition"},
            "branches": {"name", "commit", "merged", "owner", "purpose", "disposition"},
            "remote_refs": {"name", "commit", "merged", "owner", "purpose", "disposition"},
        }
        reported_unowned_rows = 0
        for field, required_fields in row_specs.items():
            for index, row in enumerate(topology.get(field) or []):
                rpath = f"{path}.topology.{field}[{index}]"
                if not _required(row, required_fields, rpath, errors):
                    continue
                for name in ("owner", "purpose", "disposition"):
                    if name == "owner" and not _owned_text(row.get(name)):
                        reported_unowned_rows += 1
                        if clean:
                            errors.append(f"{rpath}.{name}: CLEAN requires a named owner")
                    elif name != "owner" and not _nonempty(row.get(name)):
                        errors.append(f"{rpath}.{name}: required")
                if field != "worktrees" and not isinstance(row.get("merged"), bool):
                    errors.append(f"{rpath}.merged: required boolean")
                if field == "worktrees" and (not isinstance(row.get("dirty_count"), int) or isinstance(row.get("dirty_count"), bool) or row.get("dirty_count") < 0):
                    errors.append(f"{rpath}.dirty_count: required nonnegative integer")
                if clean and ((field != "worktrees" and row.get("merged") is False) or (field == "worktrees" and row.get("dirty_count", 0) > 0)):
                    errors.append(f"{rpath}: unresolved topology row prevents CLEAN")
                    record = _evidence_ref(
                        base, row.get("policy_ref"), f"{rpath}.policy_ref", errors,
                        record_type="mister-clean.topology-policy", allow_placeholders=allow_placeholders,
                    )
                    if record is not None and not allow_placeholders:
                        identity_key = "path" if field == "worktrees" else "name"
                        commit_key = "head" if field == "worktrees" else "commit"
                        expected = {
                            "surface": field, "identity": row.get(identity_key),
                            "commit": row.get(commit_key),
                            "request_sha256": (bundle.get("criteria_discovery") or {}).get("request_sha256"),
                        }
                        for key, value in expected.items():
                            if record.get(key) != value:
                                errors.append(f"{rpath}.policy_ref: bound topology ruling disagrees on {key}")
                        for key in ("actor", "scope", "rationale", "next_action"):
                            if not _nonempty(record.get(key)):
                                errors.append(f"{rpath}.policy_ref: topology ruling requires {key}")
        if clean and topology.get("stashes"):
            errors.append(f"{path}.topology.stashes: CLEAN requires zero stashes")
        for index, process in enumerate(topology.get("processes") or []):
            ppath = f"{path}.topology.processes[{index}]"
            if _required(process, {"identity", "owner", "purpose", "disposition", "blocking"}, ppath, errors):
                for field in ("identity", "owner", "purpose", "disposition"):
                    if field == "owner" and not _owned_text(process.get(field)):
                        reported_unowned_rows += 1
                        if clean:
                            errors.append(f"{ppath}.{field}: CLEAN requires a named owner")
                    elif field != "owner" and not _nonempty(process.get(field)):
                        errors.append(f"{ppath}.{field}: required")
                if not isinstance(process.get("blocking"), bool):
                    errors.append(f"{ppath}.blocking: required boolean")
        for field in ("dirty", "unowned", "unmerged", "blocking_processes"):
            value = topology.get(field)
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                errors.append(f"{path}.topology.{field}: required nonnegative integer")
            elif clean and value != 0:
                errors.append(f"{path}.topology.{field}: CLEAN requires zero")
        reported_blocking = sum(
            1 for process in topology.get("processes") or []
            if isinstance(process, dict) and process.get("blocking") is True
        )
        if topology.get("blocking_processes") != reported_blocking:
            errors.append(f"{path}.topology.blocking_processes: must equal blocking process rows ({reported_blocking})")
        if topology.get("unowned") != reported_unowned_rows:
            errors.append(f"{path}.topology.unowned: must equal unowned topology rows ({reported_unowned_rows})")
    current = successor.get("current_state")
    if _required(current, {"state", "path", "sha256", "commit", "generator", "designation"}, f"{path}.current_state", errors):
        state = current.get("state")
        if state not in {"missing", "candidate_unverified", "designated"}:
            errors.append(f"{path}.current_state.state: unsupported")
        if not _nonempty(current.get("commit")) or not _nonempty(current.get("generator")):
            errors.append(f"{path}.current_state: commit and generator are required")
        if clean and state != "designated":
            errors.append(f"{path}.current_state.state: CLEAN requires designated")
        if state == "missing":
            if current.get("path") is not None or current.get("sha256") is not None or current.get("designation") is not None:
                errors.append(f"{path}.current_state: missing state requires null path, sha256, and designation")
        else:
            if not _nonempty(current.get("path")):
                errors.append(f"{path}.current_state.path: required")
            if not allow_placeholders and not (isinstance(current.get("sha256"), str) and HEX64.fullmatch(current["sha256"])):
                errors.append(f"{path}.current_state.sha256: required lowercase SHA-256")
            if state == "candidate_unverified" and current.get("designation") is not None:
                errors.append(f"{path}.current_state.designation: candidate_unverified requires null")
            if state == "designated":
                record = _evidence_ref(
                    base, current.get("designation"), f"{path}.current_state.designation", errors,
                    record_type="mister-clean.current-state-designation", allow_placeholders=allow_placeholders,
                )
                if record is not None and not allow_placeholders:
                    for field in ("path", "sha256", "commit"):
                        if record.get(field) != current.get(field):
                            errors.append(f"{path}.current_state.designation: bound designation disagrees on {field}")
    gates = successor.get("gates")
    if not isinstance(gates, list):
        errors.append(f"{path}.gates: required array")
    elif clean and not gates:
        errors.append(f"{path}.gates: CLEAN requires nonempty array")
    else:
        required_gate = {"id", "kind", "object", "command", "expected_status", "observed_status", "semantic_status", "verified", "total", "warnings", "debt", "skipped", "evidence_ref"}
        for index, gate in enumerate(gates):
            gpath = f"{path}.gates[{index}]"
            if not _required(gate, required_gate, gpath, errors):
                continue
            for field in ("id", "kind", "object", "command", "evidence_ref"):
                if field != "evidence_ref" and not _nonempty(gate.get(field)):
                    errors.append(f"{gpath}.{field}: required")
            if gate.get("kind") not in GATE_KINDS:
                errors.append(f"{gpath}.kind: unsupported gate kind")
            if not allow_placeholders and not _executed_text(gate.get("command")):
                errors.append(f"{gpath}.command: must describe an executed gate")
            for field in ("expected_status", "observed_status"):
                if not isinstance(gate.get(field), int) or isinstance(gate.get(field), bool):
                    errors.append(f"{gpath}.{field}: required integer")
            if clean and gate.get("expected_status") != gate.get("observed_status"):
                errors.append(f"{gpath}: observed_status must equal expected_status")
            if clean and gate.get("semantic_status") != "pass":
                errors.append(f"{gpath}.semantic_status: CLEAN requires pass")
            for field in ("verified", "total", "warnings", "debt", "skipped"):
                value = gate.get(field)
                if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                    errors.append(f"{gpath}.{field}: required nonnegative integer")
            if clean and gate.get("total") == 0:
                errors.append(f"{gpath}.total: zero-scope gate cannot establish CLEAN")
            if clean and gate.get("verified") != gate.get("total"):
                errors.append(f"{gpath}: verified must equal total")
            for field in ("warnings", "debt", "skipped"):
                if clean and gate.get(field) != 0:
                    errors.append(f"{gpath}.{field}: CLEAN requires zero")
            record = _evidence_ref(
                base, gate.get("evidence_ref"), f"{gpath}.evidence_ref", errors,
                record_type="mister-clean.gate-result", allow_placeholders=allow_placeholders,
            )
            if record is not None and not allow_placeholders:
                expected = {
                    "gate_id": gate.get("id"), "object": gate.get("object"),
                    "command": gate.get("command"), "observed_status": gate.get("observed_status"),
                    "semantic_status": gate.get("semantic_status"), "verified": gate.get("verified"),
                    "total": gate.get("total"), "warnings": gate.get("warnings"),
                    "debt": gate.get("debt"), "skipped": gate.get("skipped"),
                }
                for key, value in expected.items():
                    if record.get(key) != value:
                        errors.append(f"{gpath}.evidence_ref: bound gate record disagrees on {key}")
                if not _iso(record.get("observed_at")):
                    errors.append(f"{gpath}.evidence_ref: gate record requires timezone-aware observed_at")
        if clean:
            subject = (report.get("repo") or {}).get("commit")
            isolated = [
                gate for gate in gates
                if isinstance(gate, dict) and gate.get("kind") == "isolated_clone" and gate.get("object") == subject
            ]
            if not isolated:
                errors.append(f"{path}.gates: CLEAN requires an isolated_clone gate bound to the subject commit")
    debris = successor.get("debris")
    if _required(debris, {"removed", "retained", "unclassified", "evidence"}, f"{path}.debris", errors):
        for field in ("removed", "retained", "unclassified"):
            value = debris.get(field)
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                errors.append(f"{path}.debris.{field}: required nonnegative integer")
        if clean and debris.get("unclassified") != 0:
            errors.append(f"{path}.debris.unclassified: CLEAN requires zero")
        if not (isinstance(debris.get("evidence"), list) and debris["evidence"]):
            errors.append(f"{path}.debris.evidence: required")
        else:
            for index, ref in enumerate(debris["evidence"]):
                record = _evidence_ref(
                    base, ref, f"{path}.debris.evidence[{index}]", errors,
                    record_type="mister-clean.debris-census", allow_placeholders=allow_placeholders,
                )
                if record is not None and not allow_placeholders:
                    for field in ("removed", "retained", "unclassified"):
                        if record.get(field) != debris.get(field):
                            errors.append(f"{path}.debris.evidence[{index}]: bound debris record disagrees on {field}")
    handoff = successor.get("handoff")
    if _required(handoff, {"entrypoints", "next_owner", "next_action"}, f"{path}.handoff", errors):
        if not (isinstance(handoff.get("entrypoints"), list) and all(_nonempty(x) for x in handoff["entrypoints"])):
            errors.append(f"{path}.handoff.entrypoints: required string array")
        elif clean and not handoff["entrypoints"]:
            errors.append(f"{path}.handoff.entrypoints: CLEAN requires at least one entrypoint")
        for field in ("next_owner", "next_action"):
            if not _nonempty(handoff.get(field)):
                errors.append(f"{path}.handoff.{field}: required")
    review = successor.get("final_review")
    if _required(review, {"mechanism", "status", "reviewer", "implementer", "reviewer_execution", "implementer_execution", "criteria_reviewed", "planning_reviewed", "findings_total", "findings_paid", "unresolved", "evidence_ref"}, f"{path}.final_review", errors):
        for field in ("mechanism", "reviewer", "implementer"):
            if not _nonempty(review.get(field)):
                errors.append(f"{path}.final_review.{field}: required")
        if _nonempty(review.get("reviewer")) and _identity(review.get("reviewer")) == _identity(review.get("implementer")):
            errors.append(f"{path}.final_review: reviewer must differ from implementer")
        executions = []
        for field in ("reviewer_execution", "implementer_execution"):
            execution = review.get(field)
            epath = f"{path}.final_review.{field}"
            if _required(execution, {"harness", "session_id", "receipt_id"}, epath, errors):
                for key in ("harness", "session_id", "receipt_id"):
                    if not _nonempty(execution.get(key)):
                        errors.append(f"{epath}.{key}: required")
                executions.append((_identity(execution.get("harness")), _identity(execution.get("session_id")), _identity(execution.get("receipt_id"))))
        if len(executions) == 2 and executions[0] == executions[1]:
            errors.append(f"{path}.final_review: reviewer and implementer require distinct execution identities")
        for field in ("criteria_reviewed", "planning_reviewed"):
            if not isinstance(review.get(field), bool):
                errors.append(f"{path}.final_review.{field}: required boolean")
            elif clean and review.get(field) is not True:
                errors.append(f"{path}.final_review.{field}: CLEAN requires true")
        if clean and review.get("status") != "passed":
            errors.append(f"{path}.final_review.status: CLEAN requires passed")
        for field in ("findings_total", "findings_paid", "unresolved"):
            value = review.get(field)
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                errors.append(f"{path}.final_review.{field}: required nonnegative integer")
        if clean and review.get("unresolved") != 0:
            errors.append(f"{path}.final_review.unresolved: CLEAN requires zero")
        if clean and review.get("findings_total") != review.get("findings_paid"):
            errors.append(f"{path}.final_review: findings_total must equal findings_paid")
        record = _evidence_ref(
            base, review.get("evidence_ref"), f"{path}.final_review.evidence_ref", errors,
            record_type="mister-clean.independent-review", allow_placeholders=allow_placeholders,
        )
        if record is not None and not allow_placeholders:
            expected = {
                "mechanism": review.get("mechanism"), "status": review.get("status"),
                "reviewer": review.get("reviewer"), "implementer": review.get("implementer"),
                "reviewer_execution": review.get("reviewer_execution"),
                "implementer_execution": review.get("implementer_execution"),
                "candidate_commit": (report.get("repo") or {}).get("commit"),
                "criteria_ids": (bundle.get("criteria_discovery") or {}).get("criteria_ids"),
                "planning_system_ids": [x.get("id") for x in (bundle.get("planning_discovery") or {}).get("systems") or [] if isinstance(x, dict)],
                "findings_total": review.get("findings_total"), "findings_paid": review.get("findings_paid"),
                "unresolved": review.get("unresolved"),
            }
            for key, value in expected.items():
                if record.get(key) != value:
                    errors.append(f"{path}.final_review.evidence_ref: bound review record disagrees on {key}")
            if not _iso(record.get("observed_at")):
                errors.append(f"{path}.final_review.evidence_ref: review record requires timezone-aware observed_at")


def _parse_worktrees(repo: Path) -> list[dict[str, str]]:
    blocks = _git(repo, "worktree", "list", "--porcelain").stdout.strip().split("\n\n")
    rows: list[dict[str, str]] = []
    for block in blocks:
        row: dict[str, str] = {}
        for line in block.splitlines():
            key, _, value = line.partition(" ")
            if key in {"worktree", "HEAD", "branch"}:
                row[key.lower()] = value
            elif key == "detached":
                row["branch"] = "detached"
        if row:
            rows.append(row)
    return rows


def _validate_claim_proofs(
    report: dict[str, Any],
    base: Path,
    repo: Path | None,
    errors: list[str],
    allow_placeholders: bool,
) -> None:
    claims = report.get("claims") or {}
    subject = (report.get("repo") or {}).get("commit")
    for name, claim in claims.items():
        if not isinstance(claim, dict) or claim.get("state") != "established":
            continue
        for index, evidence in enumerate(claim.get("evidence") or []):
            if not isinstance(evidence, dict):
                continue
            epath = f"$.report.claims.{name}.evidence[{index}]"
            if name == "committed_locally":
                if repo is not None and not allow_placeholders:
                    if _git(repo, "cat-file", "-e", f"{evidence.get('commit')}^{{commit}}", allow=(0, 128)).returncode != 0:
                        errors.append(f"{epath}: commit does not exist in live repository")
                continue
            if name == "pushed" and evidence.get("kind") == "remote_ref_resolution":
                if repo is not None and not allow_placeholders:
                    lines = _git(repo, "ls-remote", evidence.get("remote", ""), evidence.get("ref", ""), allow=(0, 2, 128)).stdout.splitlines()
                    observed = lines[0].split()[0] if lines else ""
                    if observed != evidence.get("commit") or evidence.get("commit") != subject:
                        errors.append(f"{epath}: live remote resolution does not establish the subject commit")
                continue
            if name in {"ci_green_on_push", "deployed", "independently_qa_accepted"}:
                errors.append(
                    f"{epath}: local closure bundles cannot establish external claim {name}; "
                    "use not_established/not_applicable until a trusted adapter is configured"
                )
                continue


def _validate_change_inventory(
    bundle: dict[str, Any],
    report: dict[str, Any],
    manifest: dict[str, Any],
    base: Path,
    repo: Path | None,
    errors: list[str],
    allow_placeholders: bool,
    clean: bool,
) -> None:
    inventory = bundle.get("change_inventory")
    path = "$.change_inventory"
    if not _required(inventory, {"start_commit", "subject_commit", "changes"}, path, errors):
        return
    subject = (report.get("repo") or {}).get("commit")
    if not allow_placeholders and inventory.get("subject_commit") != subject:
        errors.append(f"{path}.subject_commit: must equal report repo.commit")
    start_snapshot = (((bundle.get("successor_readiness") or {}).get("snapshots") or {}).get("start") or {}).get("object")
    if not allow_placeholders and inventory.get("start_commit") != start_snapshot:
        errors.append(f"{path}.start_commit: must equal start snapshot object")
    changes = inventory.get("changes")
    if not isinstance(changes, list):
        errors.append(f"{path}.changes: required array")
        return
    action_rows = {row.get("id"): row for row in manifest.get("actions") or [] if isinstance(row, dict)}
    reported: dict[str, str] = {}
    for index, change in enumerate(changes):
        cpath = f"{path}.changes[{index}]"
        if not _required(change, {"status", "path", "action_ids", "exclusion"}, cpath, errors):
            continue
        rel = change.get("path")
        if not _nonempty(rel) or str(rel).startswith("/") or ".." in Path(str(rel)).parts or rel in reported:
            errors.append(f"{cpath}.path: required unique repository-relative path")
            continue
        reported[rel] = change.get("status")
        if change.get("status") not in {"A", "M", "D", "T"}:
            errors.append(f"{cpath}.status: expected A, M, D, or T")
        action_ids = change.get("action_ids")
        if not isinstance(action_ids, list) or not all(_nonempty(item) for item in action_ids):
            errors.append(f"{cpath}.action_ids: required string array")
            action_ids = []
        for action_id in action_ids:
            action = action_rows.get(action_id)
            if action is None:
                errors.append(f"{cpath}.action_ids: unknown action {action_id!r}")
                continue
            target = str(action.get("target", ""))
            if target not in {rel, ".", "repository"} and not rel.startswith(target.rstrip("/") + "/"):
                errors.append(f"{cpath}.action_ids: action {action_id!r} target does not cover {rel}")
        exclusion = change.get("exclusion")
        if clean and not action_ids:
            errors.append(f"{cpath}: CLEAN requires an executed action mapping")
        if exclusion is not None:
            record = _evidence_ref(
                base, exclusion, f"{cpath}.exclusion", errors,
                record_type="mister-clean.change-exclusion", allow_placeholders=allow_placeholders,
            )
            if record is not None and not allow_placeholders:
                expected = {"path": rel, "status": change.get("status"),
                            "start_commit": inventory.get("start_commit"), "subject_commit": subject,
                            "request_sha256": (bundle.get("criteria_discovery") or {}).get("request_sha256")}
                for key, value in expected.items():
                    if record.get(key) != value:
                        errors.append(f"{cpath}.exclusion: bound exclusion disagrees on {key}")
                for key in ("actor", "scope", "rationale"):
                    if not _nonempty(record.get(key)):
                        errors.append(f"{cpath}.exclusion: requires {key}")
    if repo is not None and not allow_placeholders:
        try:
            lines = _git(repo, "diff", "--name-status", "--no-renames", inventory.get("start_commit", ""), subject).stdout.splitlines()
            live = {line.split("\t", 1)[1]: line.split("\t", 1)[0] for line in lines if "\t" in line}
            if live != reported:
                errors.append(f"{path}.changes: live start-to-subject diff differs")
        except RuntimeError as exc:
            errors.append(f"{path}: {exc}")


def _validate_live(bundle: dict[str, Any], bundle_path: Path, report: dict[str, Any], manifest: dict[str, Any], repo: Path, errors: list[str]) -> None:
    if not repo.is_dir():
        errors.append(f"$.live_repo: repository not found: {repo}")
        return
    try:
        top = Path(_git(repo, "rev-parse", "--show-toplevel").stdout.strip()).resolve()
        if top != repo.resolve():
            errors.append(f"$.live_repo: expected worktree root {top}, got {repo.resolve()}")
        head = _git(repo, "rev-parse", "HEAD").stdout.strip()
        subject = (report.get("repo") or {}).get("commit")
        custody = bundle.get("custody") or {}
        if custody.get("subject_commit") != subject:
            errors.append("$.custody.subject_commit: must equal report repo.commit")
        if custody.get("mode") == "sidecar":
            if head != subject:
                errors.append(f"$.custody: sidecar validation requires live HEAD {head} == subject {subject}")
        else:
            errors.append("$.custody.mode: only sidecar is supported")
        _git(repo, "cat-file", "-e", f"{subject}^{{commit}}")
        if (report.get("repo") or {}).get("id") != _repo_identity(repo):
            errors.append("$.report.repo.id: does not match independently resolved live repository identity")
        if _git(repo, "status", "--porcelain=v1", "--untracked-files=all").stdout.strip():
            errors.append("$.report.repo: CLEAN requires a clean live working tree")
        target = report.get("target_binding") or {}
        successor = bundle.get("successor_readiness") or {}
        observation = successor.get("target_observation") or {}
        if target.get("target_ref") != observation.get("local_ref"):
            errors.append("$.successor_readiness.target_observation.local_ref: must equal report target_binding.target_ref")
        target_commit = _git(repo, "rev-parse", observation.get("local_ref", "")).stdout.strip()
        if target_commit != target.get("target_commit"):
            errors.append("$.report.target_binding.target_commit: live target differs")
        merge_base = _git(repo, "merge-base", target_commit, subject).stdout.strip()
        if merge_base != target.get("merge_base"):
            errors.append("$.report.target_binding.merge_base: live merge base differs")
        left, right = _git(repo, "rev-list", "--left-right", "--count", f"{target_commit}...{subject}").stdout.split()
        if int(left) != target.get("target_commits_missing") or int(right) != target.get("candidate_commits_ahead"):
            errors.append("$.report.target_binding: live left/right divergence differs")
        if observation.get("commit") != target_commit:
            errors.append("$.successor_readiness.target_observation.commit: must equal live target")
        if observation.get("kind") == "remote_ref_resolution":
            remote = observation.get("remote", "")
            ref = observation.get("remote_ref", "")
            lines = _git(repo, "ls-remote", "--heads", remote, ref).stdout.splitlines()
            observed = lines[0].split()[0] if lines else ""
            if observed != target_commit:
                errors.append("$.successor_readiness.target_observation: remote ref differs from live target")
        branch = (report.get("repo") or {}).get("branch")
        upstream = _git(repo, "rev-parse", "--symbolic-full-name", "@{upstream}", allow=(0, 128)).stdout.strip()
        remotes = _git(repo, "remote").stdout.splitlines()
        if upstream:
            if observation.get("kind") != "remote_ref_resolution":
                errors.append("$.successor_readiness.target_observation: configured upstream forbids local-only target proof")
            if observation.get("local_ref") != upstream:
                errors.append(f"$.successor_readiness.target_observation.local_ref: must equal configured upstream {upstream}")
            remote_name = _git(repo, "config", "--get", f"branch.{branch}.remote", allow=(0, 1)).stdout.strip()
            merge_ref = _git(repo, "config", "--get", f"branch.{branch}.merge", allow=(0, 1)).stdout.strip()
            if observation.get("remote") != remote_name or observation.get("remote_ref") != merge_ref:
                errors.append("$.successor_readiness.target_observation: remote/ref tuple differs from configured upstream")
        elif remotes and observation.get("kind") == "local_ref_resolution":
            errors.append("$.successor_readiness.target_observation: CLEAN cannot use local-only target proof while remotes exist")
        topology = successor.get("topology") or {}
        live_worktrees = _parse_worktrees(repo)
        reported_worktrees = topology.get("worktrees") or []
        reported_by_path = {
            str(Path(str(x.get("path"))).resolve()): x
            for x in reported_worktrees if isinstance(x, dict) and _nonempty(x.get("path"))
        }
        live_paths = {str(Path(str(x.get("worktree"))).resolve()) for x in live_worktrees}
        if live_paths != set(reported_by_path):
            errors.append("$.successor_readiness.topology.worktrees: live path set differs")
        dirty = unowned = unmerged = 0
        for row in live_worktrees:
            path = str(Path(row.get("worktree", "")).resolve())
            reported = reported_by_path.get(path) or {}
            for field in ("owner", "purpose", "disposition"):
                if (field == "owner" and not _owned_text(reported.get(field))) or (field != "owner" and not _nonempty(reported.get(field))):
                    errors.append(f"$.successor_readiness.topology.worktrees[{path!r}].{field}: required")
                    unowned += field == "owner"
            live_dirty = len(_git(Path(path), "status", "--porcelain=v1", "--untracked-files=all").stdout.splitlines())
            dirty += int(live_dirty > 0)
            if reported.get("head") != row.get("head") or reported.get("branch") != row.get("branch"):
                errors.append(f"$.successor_readiness.topology.worktrees[{path!r}]: live head/branch differs")
            if reported.get("dirty_count") != live_dirty:
                errors.append(f"$.successor_readiness.topology.worktrees[{path!r}].dirty_count: live count differs")
            if _git(repo, "merge-base", "--is-ancestor", row.get("head", ""), head, allow=(0, 1)).returncode != 0:
                unmerged += 1
        branches_out = _git(repo, "for-each-ref", "--format=%(refname:short)%09%(objectname)", "refs/heads").stdout.splitlines()
        live_branches = {line.split("\t", 1)[0]: line.split("\t", 1)[1] for line in branches_out if "\t" in line}
        reported_branches = {str(x.get("name")): x for x in topology.get("branches") or [] if isinstance(x, dict)}
        if set(live_branches) != set(reported_branches):
            errors.append("$.successor_readiness.topology.branches: live branch set differs")
        for name, commit in live_branches.items():
            reported = reported_branches.get(name) or {}
            for field in ("owner", "purpose", "disposition"):
                if (field == "owner" and not _owned_text(reported.get(field))) or (field != "owner" and not _nonempty(reported.get(field))):
                    errors.append(f"$.successor_readiness.topology.branches[{name!r}].{field}: required")
                    unowned += field == "owner"
            merged = _git(repo, "merge-base", "--is-ancestor", commit, head, allow=(0, 1)).returncode == 0
            if reported.get("commit") != commit or reported.get("merged") is not merged:
                errors.append(f"$.successor_readiness.topology.branches[{name!r}]: live commit/merged differs")
            if not merged:
                unmerged += 1
        remote_out = _git(repo, "for-each-ref", "--format=%(refname)%09%(objectname)", "refs/remotes").stdout.splitlines()
        live_remote_refs = {
            line.split("\t", 1)[0]: line.split("\t", 1)[1]
            for line in remote_out if "\t" in line and not line.split("\t", 1)[0].endswith("/HEAD")
        }
        reported_remote_refs = {
            str(x.get("name")): x for x in topology.get("remote_refs") or [] if isinstance(x, dict)
        }
        if set(live_remote_refs) != set(reported_remote_refs):
            errors.append("$.successor_readiness.topology.remote_refs: live remote-ref set differs")
        for name, commit in live_remote_refs.items():
            reported = reported_remote_refs.get(name) or {}
            for field in ("owner", "purpose", "disposition"):
                if (field == "owner" and not _owned_text(reported.get(field))) or (field != "owner" and not _nonempty(reported.get(field))):
                    errors.append(f"$.successor_readiness.topology.remote_refs[{name!r}].{field}: required")
                    unowned += field == "owner"
            merged = _git(repo, "merge-base", "--is-ancestor", commit, subject, allow=(0, 1)).returncode == 0
            if reported.get("commit") != commit or reported.get("merged") is not merged:
                errors.append(f"$.successor_readiness.topology.remote_refs[{name!r}]: live commit/merged differs")
            if not merged:
                unmerged += 1
        stash_lines = _git(repo, "stash", "list", "--format=%gd%09%H%09%gs").stdout.splitlines()
        live_stashes = [line for line in stash_lines if line]
        if topology.get("stashes") != live_stashes:
            errors.append("$.successor_readiness.topology.stashes: live stash set differs")
        if topology.get("dirty") != dirty or topology.get("unowned") != unowned or topology.get("unmerged") != unmerged:
            errors.append(f"$.successor_readiness.topology: live counts dirty={dirty} unowned={unowned} unmerged={unmerged} differ")
        current = successor.get("current_state") or {}
        current_path = _contained(repo, current.get("path"))
        rel_current = str(current.get("path", ""))
        if rel_current == ".git" or rel_current.startswith(".git/"):
            errors.append("$.successor_readiness.current_state.path: Git metadata cannot be a successor entrypoint")
        elif current_path is None or not current_path.is_file():
            errors.append("$.successor_readiness.current_state.path: missing or outside repository")
        elif _sha256(current_path) != current.get("sha256"):
            errors.append("$.successor_readiness.current_state.sha256: live digest differs")
        else:
            tracked = _git(repo, "cat-file", "-e", f"{subject}:{rel_current}", allow=(0, 128)).returncode == 0
            if not tracked:
                errors.append("$.successor_readiness.current_state.path: must exist in the subject commit")
        if current.get("commit") != subject:
            errors.append("$.successor_readiness.current_state.commit: must equal subject commit")
        for index, entry in enumerate((successor.get("handoff") or {}).get("entrypoints") or []):
            resolved = _contained(repo, entry)
            if str(entry).startswith("/") or str(entry) == ".git" or str(entry).startswith(".git/") or resolved is None or not resolved.is_file():
                errors.append(f"$.successor_readiness.handoff.entrypoints[{index}]: must be an existing repository-relative file outside .git")
        for snap_name in ("start", "end"):
            snap = ((successor.get("snapshots") or {}).get(snap_name) or {})
            obj = snap.get("object", "")
            if not re.fullmatch(r"[0-9a-f]{40}", str(obj)) or _git(repo, "cat-file", "-e", f"{obj}^{{commit}}", allow=(0, 128)).returncode != 0:
                errors.append(f"$.successor_readiness.snapshots.{snap_name}.object: must be an existing full commit")
        if ((successor.get("snapshots") or {}).get("end") or {}).get("object") != subject:
            errors.append("$.successor_readiness.snapshots.end.object: must equal subject commit")
        for index, action in enumerate(manifest.get("actions") or []):
            if isinstance(action, dict) and action.get("kind") in LOCAL_ACTION_KINDS:
                target_path = _contained(repo, action.get("target"))
                if target_path is None:
                    errors.append(f"$.manifest.actions[{index}].target: resolves outside repository through traversal or symlink")
    except RuntimeError as exc:
        errors.append(f"$.live_git: {exc}")


def validate_bundle(
    data: Any,
    bundle_path: Path,
    *,
    allow_placeholders: bool = False,
    verify_live: bool = True,
    repo_path: Path | None = None,
) -> list[str]:
    errors: list[str] = []
    required = {"record_type", "schema_version", "run_id", "request_ref", "report", "manifest", "custody", "criteria_discovery", "change_inventory", "planning_discovery", "successor_readiness"}
    if not _required(data, required, "$", errors):
        return errors
    if data.get("record_type") != "mister-clean.closure-bundle":
        errors.append("$.record_type: expected mister-clean.closure-bundle")
    if data.get("schema_version") != "1.0":
        errors.append("$.schema_version: expected 1.0")
    for field in ("run_id", "request_ref"):
        if not _nonempty(data.get(field)):
            errors.append(f"$.{field}: required")
    base = bundle_path.resolve().parent
    report, _ = _load_ref(base, data.get("report"), "$.report", errors, allow_placeholders)
    manifest, _ = _load_ref(base, data.get("manifest"), "$.manifest", errors, allow_placeholders)
    if report is None or manifest is None:
        return errors
    if not allow_placeholders:
        if not _iso(report.get("generated_at")):
            errors.append("$.report.generated_at: required ISO-8601 timestamp")
        if not _iso((report.get("target_binding") or {}).get("measured_at")):
            errors.append("$.report.target_binding.measured_at: required ISO-8601 timestamp")
    errors.extend(f"$.report::{error}" for error in VC.validate_report(report, allow_placeholders=allow_placeholders, bundle_context=True))
    errors.extend(f"$.manifest::{error}" for error in VC.validate_manifest(manifest, allow_placeholders=allow_placeholders))
    if not allow_placeholders:
        request_ref = data.get("request_ref")
        if request_ref != (report.get("authorization_basis") or {}).get("ref"):
            errors.append("$.request_ref: must equal report authorization_basis.ref")
        if request_ref != manifest.get("request_ref"):
            errors.append("$.request_ref: must equal manifest request_ref")
        for field in ("id", "commit"):
            if (report.get("repo") or {}).get(field) != (manifest.get("repo") or {}).get(field):
                errors.append(f"$.report/manifest.repo.{field}: must match")
        if report.get("mode") != manifest.get("mode"):
            errors.append("$.report/manifest.mode: must match")
        report_action_rows = [x for x in report.get("actions") or [] if isinstance(x, dict)]
        manifest_action_rows = [x for x in manifest.get("actions") or [] if isinstance(x, dict)]
        report_actions = {x.get("id"): x for x in report_action_rows if _nonempty(x.get("id"))}
        manifest_actions = {x.get("id"): x for x in manifest_action_rows if _nonempty(x.get("id"))}
        if len(report_actions) != len(report_action_rows):
            errors.append("$.report.actions: every action requires a unique id")
        if set(report_actions) != set(manifest_actions):
            errors.append("$.report/manifest.actions: exact action id sets must match")
        elif report_action_rows != manifest_action_rows:
            errors.append("$.report/manifest.actions: canonical action records must match exactly")
        if report.get("verdict") == "CLEAN":
            if manifest_actions and manifest.get("execution_state") != "executed":
                errors.append("$.manifest.execution_state: CLEAN with actions requires executed")
            for action_id, action in report_actions.items():
                if action.get("status") != "executed":
                    errors.append(f"$.report.actions[{action_id!r}].status: CLEAN requires executed")
        for action_id, action in manifest_actions.items():
            for index, evidence in enumerate(((action.get("outcome") or {}).get("evidence") or [])):
                if not isinstance(evidence, dict):
                    continue
                record = _evidence_ref(
                    base, evidence.get("evidence_ref"),
                    f"$.manifest.actions[{action_id!r}].outcome.evidence[{index}].evidence_ref",
                    errors, record_type="mister-clean.action-result",
                    allow_placeholders=allow_placeholders,
                )
                if record is not None and not allow_placeholders:
                    expected = {"action_id": action_id, "kind": action.get("kind"), "target": action.get("target")}
                    expected.update({key: evidence.get(key) for key in ("object", "command", "result", "observed_at")})
                    for key, value in expected.items():
                        if record.get(key) != value:
                            errors.append(f"$.manifest.actions[{action_id!r}].outcome.evidence[{index}]: bound result disagrees on {key}")
    clean = report.get("verdict") == "CLEAN"
    custody = data.get("custody")
    if _required(custody, {"mode", "subject_commit", "evidence_root", "evidence_paths"}, "$.custody", errors):
        if custody.get("mode") != "sidecar":
            errors.append("$.custody.mode: only sidecar is supported")
        if not allow_placeholders and custody.get("subject_commit") != (report.get("repo") or {}).get("commit"):
            errors.append("$.custody.subject_commit: must equal report repo.commit")
        if not isinstance(custody.get("evidence_paths"), list) or not all(_nonempty(x) and not str(x).startswith("/") and ".." not in Path(str(x)).parts for x in custody.get("evidence_paths") or []):
            errors.append("$.custody.evidence_paths: required repository-relative string array")
        if custody.get("evidence_root") is not None or custody.get("evidence_paths") != []:
            errors.append("$.custody: sidecar mode requires null evidence_root and empty evidence_paths")
    live_repo = repo_path.resolve() if repo_path is not None else None
    if verify_live and not allow_placeholders and live_repo is None:
        probe = _git(base, "rev-parse", "--show-toplevel", allow=(0, 128))
        if probe.returncode == 0 and probe.stdout.strip():
            live_repo = Path(probe.stdout.strip()).resolve()
        else:
            errors.append("$.live_repo: pass --repo or store the bundle inside the repository")
    _validate_criteria(data, report, errors, allow_placeholders, base, clean)
    _validate_claim_proofs(report, base, live_repo, errors, allow_placeholders)
    _validate_change_inventory(data, report, manifest, base, live_repo, errors, allow_placeholders, clean)
    for index, debt in enumerate(report.get("completion_debts") or []):
        if isinstance(debt, dict) and debt.get("state") == "satisfied":
            for evidence_index, evidence in enumerate(debt.get("evidence") or []):
                if not isinstance(evidence, dict):
                    continue
                record = _evidence_ref(
                    base, evidence.get("evidence_ref"),
                    f"$.report.completion_debts[{index}].evidence[{evidence_index}].evidence_ref",
                    errors, record_type="mister-clean.debt-result",
                    allow_placeholders=allow_placeholders,
                )
                if record is not None and not allow_placeholders:
                    expected = {"debt_id": debt.get("id")}
                    expected.update({key: evidence.get(key) for key in ("kind", "object", "command", "result", "observed_at")})
                    for key, value in expected.items():
                        if record.get(key) != value:
                            errors.append(f"$.report.completion_debts[{index}].evidence[{evidence_index}]: bound debt result disagrees on {key}")
        if not isinstance(debt, dict) or debt.get("state") != "accepted_exception":
            continue
        exception = debt.get("exception") or {}
        record = _evidence_ref(
            base, exception.get("ref"), f"$.report.completion_debts[{index}].exception.ref",
            errors, record_type="mister-clean.operator-ruling",
            allow_placeholders=allow_placeholders,
        )
        if record is not None and not allow_placeholders:
            for field in ("actor", "at", "scope", "rationale"):
                if record.get(field) != exception.get(field):
                    errors.append(f"$.report.completion_debts[{index}].exception.ref: ruling disagrees on {field}")
            if record.get("debt_id") != debt.get("id"):
                errors.append(f"$.report.completion_debts[{index}].exception.ref: ruling debt_id mismatch")
            if record.get("request_sha256") != (data.get("criteria_discovery") or {}).get("request_sha256"):
                errors.append(f"$.report.completion_debts[{index}].exception.ref: ruling must bind the exact operative request")
    _validate_planning(data, errors, verify_live and not allow_placeholders, live_repo, clean)
    _validate_successor(data, report, errors, allow_placeholders, base, clean)
    if not allow_placeholders:
        for placeholder in VC.find_placeholders(data):
            errors.append(f"{placeholder}: unresolved template placeholder")
    if report.get("verdict") == "CLEAN":
        if not verify_live:
            errors.append("$.verdict: CLEAN requires live verification")
        elif not allow_placeholders and live_repo is not None:
            _validate_live(data, bundle_path, report, manifest, live_repo, errors)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--template", action="store_true")
    parser.add_argument("--structural", action="store_true", help="skip live Git checks; cannot validate CLEAN")
    parser.add_argument("--repo", type=Path, help="live checkout root; optional when the bundle is stored inside it")
    args = parser.parse_args()
    try:
        data = json.loads(args.path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    errors = validate_bundle(
        data,
        args.path,
        allow_placeholders=args.template,
        verify_live=not args.structural,
        repo_path=args.repo,
    )
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(f"FAIL errors={len(errors)}", file=sys.stderr)
        return 1
    print(f"PASS kind=bundle path={args.path} live={not args.structural}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
