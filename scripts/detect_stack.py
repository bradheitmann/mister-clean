#!/usr/bin/env python3
"""Stack detector for the code-hygiene rubric (§7).

Detects a repository's ecosystems from manifest/lock/config files and prints
the adapter sections of references/stack-adapters.md that apply. Stdlib only.

Usage: python3 scripts/detect_stack.py /path/to/repo [--list]
Exit: 0 with >=1 ecosystem detected; 3 if none (unknown stack -- inspect
manually; a CLEAN verdict may not silently skip adapter checks).
"""
import sys
from pathlib import Path

MARKERS = {
    "node": ["package.json"],
    "node-pnpm": ["pnpm-lock.yaml", "pnpm-workspace.yaml"],
    "node-npm": ["package-lock.json"],
    "node-yarn": ["yarn.lock"],
    "typescript": ["tsconfig.json"],
    "python": ["pyproject.toml", "setup.py", "requirements.txt", "Pipfile"],
    "rust": ["Cargo.toml"],
    "go": ["go.mod"],
    "shell": [],  # detected by glob below
    "docker": ["Dockerfile", "docker-compose.yml", "compose.yaml"],
    "github-actions": [".github/workflows"],
}

def detect(root: Path) -> list[str]:
    found = []
    for eco, markers in MARKERS.items():
        for m in markers:
            if (root / m).exists():
                found.append(eco)
                break
    try:
        if any(root.glob("**/*.sh")):
            found.append("shell")
    except OSError:
        pass
    # dedupe preserving order
    seen, out = set(), []
    for e in found:
        if e not in seen:
            seen.add(e)
            out.append(e)
    return out

def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    root = Path(sys.argv[1]).resolve()
    if not root.is_dir():
        print(f"ERROR: not a directory: {root}", file=sys.stderr)
        return 2
    ecos = detect(root)
    if not ecos:
        print("NO KNOWN ECOSYSTEM DETECTED -- inspect manually; adapter checks may not be silently skipped")
        return 3
    print("detected:", " ".join(ecos))
    ref = Path(__file__).resolve().parent.parent / "references" / "stack-adapters.md"
    if "--list" in sys.argv or not ref.exists():
        return 0
    text = ref.read_text(encoding="utf-8")
    for eco in ecos:
        header = f"## {eco}"
        if header in text:
            sect = text.split(header, 1)[1]
            nxt = sect.find("\n## ")
            print(f"\n{header}{sect[: nxt if nxt > 0 else len(sect)]}".rstrip())
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
