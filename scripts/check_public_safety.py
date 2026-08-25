#!/usr/bin/env python3
"""Fail when a prospective public source tree contains private identifiers."""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path


EXCLUDED_PARTS = {".git", ".venv", ".wrangler", "coverage", "dist", "node_modules"}
BUILTIN_RULES = {
    "posix-home-path": re.compile(r"/(?:Users|home)/[^/\s]+/"),
    "windows-home-path": re.compile(r"\b[A-Za-z]:\\Users\\[^\\\s]+\\"),
    "email-address": re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE),
    "file-url": re.compile(r"\bfile:" + r"//[^\s)>'\"]+", re.IGNORECASE),
    "private-key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "credential-assignment": re.compile(
        r"\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)"
        r"\s*[:=]\s*['\"]?[A-Za-z0-9_./+=-]{8,}",
        re.IGNORECASE,
    ),
}


@dataclass(frozen=True)
class Finding:
    path: Path
    line: int
    rule: str


def text_files(root: Path):
    for path in sorted(root.rglob("*")):
        if any(part in EXCLUDED_PARTS for part in path.parts):
            continue
        if path.is_symlink():
            yield path, f"SYMLINK_TARGET={path.readlink()}"
            continue
        if not path.is_file():
            continue
        data = path.read_bytes()
        if b"\0" in data:
            continue
        try:
            yield path, data.decode("utf-8")
        except UnicodeDecodeError:
            continue


def load_denylist(path: Path | None) -> list[str]:
    if path is None:
        return []
    return [
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def scan(root: Path, custom_terms: list[str]) -> list[Finding]:
    findings: list[Finding] = []
    for path, text in text_files(root):
        relative = path.relative_to(root)
        for line_number, line in enumerate(text.splitlines(), start=1):
            for name, pattern in BUILTIN_RULES.items():
                if pattern.search(line):
                    findings.append(Finding(relative, line_number, name))
            folded = line.casefold()
            for index, term in enumerate(custom_terms, start=1):
                if term.casefold() in folded:
                    findings.append(Finding(relative, line_number, f"custom-denylist-{index}"))
    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", type=Path, default=Path.cwd())
    parser.add_argument(
        "--denylist-file",
        type=Path,
        help="Optional uncommitted newline-delimited project/private term list.",
    )
    args = parser.parse_args(argv)

    root = args.root.resolve()
    findings = scan(root, load_denylist(args.denylist_file))
    if findings:
        for finding in findings:
            print(f"{finding.path}:{finding.line}: {finding.rule}")
        print(f"public-safety: FAIL ({len(findings)} finding(s))", file=sys.stderr)
        return 1

    print("public-safety: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
