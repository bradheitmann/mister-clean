#!/usr/bin/env python3
"""Canonical self-test: discovery across ALL eval modules, with a coverage floor.

A single-module invocation cannot masquerade as full coverage — this asserts
both known modules are discovered and run, and fails if either is missing.
"""
import sys, unittest
from pathlib import Path

EVALS = Path(__file__).resolve().parent
REQUIRED_MODULES = {"test_skill_contract", "test_validate_closeout"}

loader = unittest.TestLoader()
suite = loader.discover(start_dir=str(EVALS), pattern="test_*.py")

discovered = set()
def _walk(s):
    for x in s:
        if isinstance(x, unittest.TestSuite):
            _walk(x)
        else:
            discovered.add(type(x).__module__)
_walk(suite)

missing = REQUIRED_MODULES - discovered
if missing:
    print(f"COVERAGE FAILURE: eval modules not discovered: {sorted(missing)}", file=sys.stderr)
    sys.exit(2)

result = unittest.TextTestRunner(verbosity=1).run(suite)
print(f"\nmodules discovered: {sorted(discovered)}")
sys.exit(0 if result.wasSuccessful() else 1)
