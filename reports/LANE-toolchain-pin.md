# Lane report: toolchain-pin (O-TOOLCHAIN-1)
Author: PM-MISTER-CLEAN (Claude). Base main 890687a. DONE list: charter/DONE/toolchain-pin.md (committed first, c0d2a02).

## Why
On 2026-11-03 the same tree bundled to three different dist hashes under bun 1.3.9 (host default), 1.4.0 (CI pin) and 1.4.3 (Homebrew). Two QA rejections (e7fed741, and the planning-config lane's first freeze) and one CI failure (dcd368e: "build:raw changed the candidate RepositoryObject") were this, each first misread as a stale manifest.

## Change
- `.bun-version` (tracked): `1.4.0`, the repository's pin.
- `src/toolchain-pin.ts`: `readBunPin`, `checkToolchainPin(root, actual)`, `runningBunVersion()`. A missing pin is not refused (unpinned repositories unchanged); a non-bun runtime is not refused (it only reads packaged bytes).
- `src/cli.ts` `runManifest`: with `--package` (write or `--check`), a mismatched bun is refused with exit 2 and `manifest: TOOLCHAIN MISMATCH (bun <actual>; repository pins <pinned> in .bun-version)` before anything is generated, compared or written.
- No env override exists (a test seam is a mocked module function, not a variable a user could set).

## Proofs (src/toolchain-pin.test.ts, 4/4 green) and observed-RED mutants
| # | Proof | Mutant | Observed |
|---|---|---|---|
| 1 | ci pin equals .bun-version | `.bun-version` → 1.3.9 | RED (1 failed) |
| 2 | mismatch named | comparison never refuses | RED (2 failed: mismatch, cli) |
| 3 | unpinned not refused | missing pin treated as mismatch | RED (1 failed) |
| 4 | cli refuses before writing | refusal branch disabled in runManifest | RED (1 failed) |
Restore verified by hash (b5a1bac63526 before and after).

## Live negative control (real toolchains, this tree)
- `~/.bun/bin/bun` 1.3.9: `manifest: TOOLCHAIN MISMATCH (bun 1.3.9; repository pins 1.4.0 in .bun-version)`, exit 2.
- `/opt/homebrew/bin/bun` 1.4.3: same message with 1.4.3, exit 2.
- bun 1.4.0: `manifest: PASS (82 entries)`.

## Gates
- Double clean `pnpm run build:raw` under bun 1.4.0, identical: dist/public.js 6c1fa211…, dist/stdio.js b65d5ed5… (unchanged from main), bin/mister-clean.js 6ebe7620…, MANIFEST.sha256 88da3512…; `manifest:package:check` PASS.
- `tsc --noEmit` clean; `audit:public` PASS (83 files); `charter check --strict` ok; skill-contract + toolchain-pin + cli tests 70/70; SKILL.md unchanged (19,975 bytes).
- Full local suite not re-run for this small lane (known environment reds on this host); hosted CI on the exact sha is the suite verdict.

## Follow-up (needs a workflow edit, owner batch)
CI could read `bun-version-file: .bun-version` instead of a literal; until then proof 1 keeps the two equal.
