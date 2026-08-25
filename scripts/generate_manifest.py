#!/usr/bin/env python3
"""Regenerate the deterministic SHA-256 manifest for public source files."""

from __future__ import annotations

import hashlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "MANIFEST.sha256"
EXCLUDED_DIRS = {".git", ".wrangler", "__pycache__", "coverage", "dist", "node_modules"}
EXCLUDED_FILES = {".DS_Store", "MANIFEST.sha256", "src/generated-materials.ts"}


def public_files() -> list[Path]:
    files = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT)
        if any(part in EXCLUDED_DIRS for part in relative.parts):
            continue
        if relative.as_posix() in EXCLUDED_FILES or path.name.endswith((".pyc", ".skill")):
            continue
        files.append(relative)
    return sorted(files, key=lambda path: path.as_posix())


def main() -> int:
    lines = []
    for relative in public_files():
        digest = hashlib.sha256((ROOT / relative).read_bytes()).hexdigest()
        lines.append(f"{digest}  ./{relative.as_posix()}")
    MANIFEST.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"manifest: wrote {len(lines)} entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
