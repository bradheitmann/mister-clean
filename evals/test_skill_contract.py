#!/usr/bin/env python3

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILL = (ROOT / "SKILL.md").read_text(encoding="utf-8")
AUTHORITY = (ROOT / "references" / "authorization-and-modes.md").read_text(encoding="utf-8")
OPENAI = (ROOT / "agents" / "openai.yaml").read_text(encoding="utf-8")
MANIFEST = json.loads((ROOT / "assets" / "action-manifest.json").read_text(encoding="utf-8"))
PACKAGE = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))


class InvocationContractTests(unittest.TestCase):
    def test_bare_invocation_defaults_to_close(self):
        self.assertIn("Bare " + chr(96) + "$mister-clean" + chr(96), SKILL)
        self.assertIn("Do not downgrade a bare invocation to AUDIT", SKILL)

    def test_invocation_is_standing_authority(self):
        self.assertIn("Invocation is the authorization grant", SKILL)
        self.assertIn("does not need to be reconfirmed", AUTHORITY)

    def test_manifest_starts_authorized_by_invocation(self):
        self.assertEqual(MANIFEST["execution_state"], "authorized")
        self.assertEqual(MANIFEST["authorization_basis"]["source"], "skill_invocation")
        self.assertTrue(MANIFEST["authorization_basis"]["standing"])
        self.assertEqual(MANIFEST["actions"][0]["authorization"]["state"], "granted")

    def test_invocation_is_explicit_only(self):
        # standing authority must never attach to background/implicit selection
        self.assertIn("allow_implicit_invocation: false", OPENAI)
        self.assertNotIn("explicit_invocation_required", OPENAI)
        self.assertNotIn("default_prompt", OPENAI.replace("# NO default_prompt", ""))
        self.assertNotIn("audit this repository", OPENAI)

    def test_push_is_part_of_closeout(self):
        self.assertIn("pushing the current branch", AUTHORITY)
        self.assertIn("Push the current branch", SKILL)

    def test_hard_boundaries_remain_explicit(self):
        for boundary in (
            "unrecoverable destruction",
            "security-control bypass",
            "another owner’s live work",
            "production deployment",
            "non-consenting third parties",
        ):
            self.assertIn(boundary, SKILL)

    def test_process_ownership_alone_is_insufficient(self):
        self.assertIn("Ownership alone is not a reason to terminate it", SKILL)

    def test_closing_candidate_must_contain_current_target(self):
        successor = (ROOT / "references" / "successor-readiness.md").read_text(encoding="utf-8")
        isolation = (ROOT / "references" / "write-lane-isolation.md").read_text(encoding="utf-8")
        normalized_skill = " ".join(SKILL.split())
        self.assertIn("a candidate that is behind a moving target is not a closing state", normalized_skill)
        self.assertIn("The closing candidate contains the current target", successor)
        self.assertIn("merge-base plus left/right", isolation)
        self.assertIn("two-tip `target..candidate` diff", SKILL)

    def test_governed_corpus_must_partition_completely(self):
        successor = (ROOT / "references" / "successor-readiness.md").read_text(encoding="utf-8")
        evals = (ROOT / "references" / "behavioral-evals.md").read_text(encoding="utf-8")
        self.assertIn("zero unclassified remainder", SKILL)
        self.assertIn("class counts reconcile to the census", successor)
        self.assertIn("66 of 68 artifacts are", evals)
        self.assertIn("PASS with 7/10 verified", evals)

    def test_validation_result_is_not_reduced_to_exit_code(self):
        claims = (ROOT / "references" / "verification-and-claims.md").read_text(encoding="utf-8")
        self.assertIn("Validation results are tuples, not exit codes", claims)
        self.assertIn("Advisory checks may inform cleanup but never establish CLEAN", SKILL)




class StackDetectorTests(unittest.TestCase):
    """rubric §7 must be executable equipment, not prose."""

    def _run(self, repo):
        import subprocess, sys as _sys
        return subprocess.run([_sys.executable, str(ROOT / "scripts" / "detect_stack.py"), str(repo)],
                              capture_output=True, text=True)

    def test_detects_node_pnpm_and_python(self):
        import tempfile
        from pathlib import Path as P
        with tempfile.TemporaryDirectory() as d:
            P(d, "package.json").write_text("{}")
            P(d, "pnpm-lock.yaml").write_text("")
            P(d, "pyproject.toml").write_text("")
            r = self._run(d)
            self.assertEqual(r.returncode, 0, r.stderr)
            for eco in ("node", "node-pnpm", "python"):
                self.assertIn(eco, r.stdout)
            self.assertIn("hand-edits (NEVER hand-edit; regenerate)", r.stdout)

    def test_unknown_stack_exits_3_and_says_so(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            r = self._run(d)
            self.assertEqual(r.returncode, 3)
            self.assertIn("may not be silently skipped", r.stdout)

    def test_adapter_sections_exist_for_all_detector_ecosystems(self):
        adapters = (ROOT / "references" / "stack-adapters.md").read_text(encoding="utf-8")
        import importlib.util as iu
        spec = iu.spec_from_file_location("ds", ROOT / "scripts" / "detect_stack.py")
        ds = iu.module_from_spec(spec); spec.loader.exec_module(ds)
        for eco in ds.MARKERS:
            self.assertIn(f"## {eco}", adapters, f"no adapter section for {eco}")


class CanonicalReportSurfaceTests(unittest.TestCase):
    """Every canonical report surface must expose the acceptance-criteria concept,
    so a human-facing report cannot omit the field the validator now depends on."""

    SURFACES = [
        "assets/closeout-report.json",
        "templates/session-close-report.md",
        "templates/hygiene-report.md",
        "examples/example-report.md",
        "SKILL.md",
    ]

    def test_all_surfaces_expose_acceptance_criteria(self):
        from pathlib import Path
        root = Path(__file__).resolve().parents[1]
        missing = []
        for s in self.SURFACES:
            txt = (root / s).read_text(encoding="utf-8").lower()
            if "acceptance crit" not in txt and "acceptance_criteria" not in txt:
                missing.append(s)
        self.assertFalse(missing, f"surfaces missing acceptance-criteria concept: {missing}")


class DashboardArtifactTests(unittest.TestCase):
    """The optional visual projection must stay token-bound, portable, and non-authoritative."""

    @classmethod
    def setUpClass(cls):
        cls.dashboard = (ROOT / "assets" / "codebase-state-dashboard" / "index.html").read_text(encoding="utf-8")
        cls.tokens = ROOT / "assets" / "codebase-state-dashboard" / "dashboard-tokens.css"

    def test_dashboard_is_reachable_from_skill(self):
        self.assertIn("assets/codebase-state-dashboard/index.html", SKILL)
        self.assertTrue(self.tokens.is_file())

    def test_dashboard_uses_animated_dataviz_tokens_and_reduced_motion(self):
        for contract in (
            "--mc-dataviz-count-duration",
            "--mc-dataviz-draw-duration",
            "--mc-dataviz-series",
            "prefers-reduced-motion: reduce",
            "MISTER_CLEAN_DASHBOARD_STATE",
        ):
            self.assertIn(contract, self.dashboard)

    def test_dashboard_is_explicitly_non_authoritative(self):
        self.assertIn("derived projection", self.dashboard.lower())
        self.assertIn("does not establish CLEAN", self.dashboard)
        normalized_skill = " ".join(SKILL.lower().replace("**", "").split())
        self.assertIn("never a proof surface or prerequisite", normalized_skill)

    def test_dashboard_contains_no_logo_surface(self):
        self.assertNotIn("<img", self.dashboard.lower())
        self.assertNotIn("brand-logo", self.dashboard.lower())
        self.assertNotIn("logo_", self.dashboard.lower())

    def test_dashboard_css_uses_tokens_not_raw_colors(self):
        import re
        self.assertIsNone(re.search(r"#[0-9a-fA-F]{3,8}\b", self.dashboard))
        self.assertIsNone(re.search(r"rgba?\s*\(", self.dashboard, flags=re.IGNORECASE))


class DistributionContractTests(unittest.TestCase):
    """The skill, package, and MCP distribution must remain one versioned product."""

    def test_skill_and_package_versions_match(self):
        import re
        frontmatter_version = re.search(r"(?m)^\s*version:\s*([^\s]+)\s*$", SKILL)
        heading_version = re.search(r"(?m)^# Mister Clean — v([^\s]+)\s*$", SKILL)
        self.assertIsNotNone(frontmatter_version)
        self.assertIsNotNone(heading_version)
        self.assertEqual(frontmatter_version.group(1), PACKAGE["version"])
        self.assertEqual(heading_version.group(1), PACKAGE["version"])

    def test_package_has_bounded_stdio_entrypoint(self):
        self.assertEqual(PACKAGE["name"], "@bradheitmann/mister-clean")
        self.assertEqual(PACKAGE["bin"], {"mister-clean-mcp": "dist/stdio.js"})
        self.assertNotIn(".npmrc", PACKAGE["files"])
        self.assertNotIn("src", PACKAGE["files"])

    def test_package_uses_file_type_allowlists_for_generated_directories(self):
        self.assertNotIn("evals", PACKAGE["files"])
        self.assertNotIn("scripts", PACKAGE["files"])
        self.assertIn("evals/*.py", PACKAGE["files"])
        self.assertIn("scripts/*.py", PACKAGE["files"])

    def test_public_mcp_is_described_as_read_only(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        security = (ROOT / "SECURITY.md").read_text(encoding="utf-8")
        self.assertIn("intentionally read-only", readme)
        self.assertIn("public MCP surface is read-only", security)
        self.assertIn("does not receive repository access", security)

    def test_source_manifest_is_complete_and_current(self):
        import hashlib
        import importlib.util

        spec = importlib.util.spec_from_file_location("generate_manifest", ROOT / "scripts" / "generate_manifest.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        expected = module.public_files()
        manifest_lines = (ROOT / "MANIFEST.sha256").read_text(encoding="utf-8").splitlines()
        recorded = {}
        for line in manifest_lines:
            digest, path = line.split("  ./", 1)
            recorded[path] = digest
        self.assertEqual(sorted(recorded), [path.as_posix() for path in expected])
        for relative in expected:
            actual = hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()
            self.assertEqual(recorded[relative.as_posix()], actual, relative.as_posix())

    def test_mcp_evaluation_has_ten_read_only_stationary_pairs(self):
        import xml.etree.ElementTree as ET

        document = ET.parse(ROOT / "evals" / "mcp-evaluation.xml")
        pairs = document.findall("./qa_pair")
        self.assertEqual(len(pairs), 10)
        for pair in pairs:
            self.assertTrue((pair.findtext("question") or "").strip())
            self.assertTrue((pair.findtext("answer") or "").strip())


if __name__ == "__main__":
    unittest.main()
