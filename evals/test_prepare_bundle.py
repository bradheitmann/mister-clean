#!/usr/bin/env python3

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(cwd: Path, *args: str) -> str:
    result = subprocess.run(args, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    return result.stdout.strip()


class PrepareBundleTests(unittest.TestCase):
    def test_request_text_creates_exact_byte_source_for_clean_route(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            repo = base / "repo"
            evidence = base / "evidence"
            repo.mkdir()
            run(repo, "git", "init", "-b", "main")
            run(repo, "git", "config", "user.name", "Fixture")
            run(repo, "git", "config", "user.email", "fixture.invalid")
            (repo / "README.md").write_text("fixture\n", encoding="utf-8")
            run(repo, "git", "add", ".")
            run(repo, "git", "commit", "-m", "fixture")
            invocation = "$mister-clean\nClose this repository for the next team."
            output = run(
                ROOT, "python3", "scripts/prepare_bundle.py", "--repo", str(repo),
                "--evidence-home", str(evidence), "--run-id", "exact", "--request-ref", "request-1",
                "--request-text", invocation,
            )
            bundle_dir = Path(output)
            bundle = json.loads((bundle_dir / "closure-bundle.json").read_text(encoding="utf-8"))
            self.assertEqual(bundle["criteria_discovery"]["source_kind"], "exact_bytes")
            self.assertEqual((bundle_dir / "operative-request.txt").read_text(encoding="utf-8"), invocation)

    def test_initializer_creates_portable_honest_scaffold(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            repo = base / "repo"
            evidence = base / "evidence"
            repo.mkdir()
            run(repo, "git", "init", "-b", "main")
            run(repo, "git", "config", "user.name", "Fixture")
            run(repo, "git", "config", "user.email", "fixture.invalid")
            (repo / "planning" / "done").mkdir(parents=True)
            (repo / "planning" / "done" / "x.md").write_text("done\n", encoding="utf-8")
            (repo / "CURRENT-STATE.md").write_text("Ready to inspect.\n", encoding="utf-8")
            run(repo, "git", "add", ".")
            run(repo, "git", "commit", "-m", "fixture")

            output = run(
                ROOT,
                "python3", "scripts/prepare_bundle.py",
                "--repo", str(repo), "--evidence-home", str(evidence),
                "--run-id", "run-1", "--request-ref", "request-1",
                "--criterion", "criterion-1",
            )
            bundle_dir = Path(output)
            report = json.loads((bundle_dir / "closeout-report.json").read_text(encoding="utf-8"))
            manifest = json.loads((bundle_dir / "action-manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(report["verdict"], "NOT_CLEAN")
            self.assertEqual(report["repo"]["id"], "repo")
            self.assertNotIn("path", report["repo"])
            self.assertEqual(manifest["actions"], [])
            bundle = json.loads((bundle_dir / "closure-bundle.json").read_text(encoding="utf-8"))
            self.assertEqual(bundle["successor_readiness"]["current_state"]["state"], "candidate_unverified")
            run(
                ROOT,
                "python3", "scripts/validate_bundle.py", str(bundle_dir / "closure-bundle.json"),
                "--repo", str(repo),
            )

    def test_initializer_refuses_to_overwrite_run(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            repo = base / "repo"
            evidence = base / "evidence"
            repo.mkdir()
            run(repo, "git", "init", "-b", "main")
            run(repo, "git", "config", "user.name", "Fixture")
            run(repo, "git", "config", "user.email", "fixture.invalid")
            (repo / "README.md").write_text("fixture\n", encoding="utf-8")
            run(repo, "git", "add", ".")
            run(repo, "git", "commit", "-m", "fixture")
            command = [
                "python3", "scripts/prepare_bundle.py", "--repo", str(repo),
                "--evidence-home", str(evidence), "--run-id", "same", "--request-ref", "request-1",
            ]
            run(ROOT, *command)
            result = subprocess.run(command, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            self.assertEqual(result.returncode, 2)
            self.assertIn("refusing to overwrite", result.stderr)

    def test_missing_current_state_is_scaffolded_as_payable_not_a_prerequisite(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            repo = base / "repo"
            evidence = base / "evidence"
            repo.mkdir()
            run(repo, "git", "init", "-b", "main")
            run(repo, "git", "config", "user.name", "Fixture")
            run(repo, "git", "config", "user.email", "fixture.invalid")
            (repo / "source.txt").write_text("source\n", encoding="utf-8")
            run(repo, "git", "add", ".")
            run(repo, "git", "commit", "-m", "fixture")
            output = run(
                ROOT, "python3", "scripts/prepare_bundle.py", "--repo", str(repo),
                "--evidence-home", str(evidence), "--run-id", "missing", "--request-ref", "request-1",
            )
            bundle_dir = Path(output)
            bundle = json.loads((bundle_dir / "closure-bundle.json").read_text(encoding="utf-8"))
            self.assertEqual(bundle["successor_readiness"]["current_state"]["state"], "missing")
            self.assertEqual(bundle["successor_readiness"]["handoff"]["entrypoints"], [])
            run(ROOT, "python3", "scripts/validate_bundle.py", str(bundle_dir / "closure-bundle.json"),
                "--repo", str(repo))


if __name__ == "__main__":
    unittest.main()
