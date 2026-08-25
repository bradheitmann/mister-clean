#!/usr/bin/env python3

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "public_safety", ROOT / "scripts" / "check_public_safety.py"
)
PUBLIC_SAFETY = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = PUBLIC_SAFETY
SPEC.loader.exec_module(PUBLIC_SAFETY)


class PublicSafetyTests(unittest.TestCase):
    def test_current_source_tree_is_public_safe(self):
        self.assertEqual([], PUBLIC_SAFETY.scan(ROOT, []))

    def test_detects_email_and_home_path_without_echoing_content(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            private_text = "contact=" + "person" + "@" + "example.org\n"
            private_text += "root=" + "/" + "Users" + "/person/project\n"
            (root / "sample.txt").write_text(private_text, encoding="utf-8")
            rules = {finding.rule for finding in PUBLIC_SAFETY.scan(root, [])}
            self.assertEqual({"email-address", "posix-home-path"}, rules)

    def test_uncommitted_custom_denylist_catches_project_terms(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "sample.txt").write_text("internal-campaign-name", encoding="utf-8")
            findings = PUBLIC_SAFETY.scan(root, ["internal-campaign-name"])
            self.assertEqual(1, len(findings))
            self.assertEqual("custom-denylist-1", findings[0].rule)


if __name__ == "__main__":
    unittest.main()
