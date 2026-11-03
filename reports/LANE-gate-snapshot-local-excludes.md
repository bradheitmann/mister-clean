# Lane report: gate-snapshot-local-excludes (O-GATE-SNAPSHOT-2)
Author: PM-MISTER-CLEAN (Claude). Base main 4728316, merged with main 56c00cc. DONE list charter/DONE/gate-snapshot-local-excludes.md (committed first, 2432070).

## Finding (self-clean cycle 1)
The installed 7.3.0 `prepare` on this repository failed every native gate with "disposable native-gate snapshot does not reproduce the exact subject repository object", then rejected its own gate evidence. Reproduced in two minutes with a TypeScript probe calling `createExecutionSnapshot`: a fresh `git clone --no-local` of the same commit snapshots fine (20 s); the primary checkout fails. Cause: the snapshot is a fresh `git init`. The subject's `$GIT_DIR/info/exclude` (here written by the Claude Code harness: `**/.claude/scheduled_tasks.lock` and nine more) is not carried over, so a file ignored only by it (`.claude/scheduled_tasks.lock`) is untracked-nonignored in the snapshot and the objects differ. Every repository worked on through such a harness has this; the gate dimension was blind for all of them.

## Change
- `copyLocalExcludeRules(subject, snapshot)` in src/closeout/native-gates.ts: resolves `info/exclude` through `git rev-parse --path-format=absolute --git-path info/exclude` on both sides (follows a linked worktree to its common directory) and copies it before the snapshot object is captured. Missing file = nothing to copy.
- The refusal now names both objects: `(subject <sha256> entries=<n>; snapshot <sha256> entries=<m>)`.
- Not changed here: the snapshot still copies ignored content (node_modules, dist, target); that is O-GATE-SNAPSHOT-1 (cost on large workspaces), a separate slice.

## Proofs (src/closeout/gate-snapshot-local-excludes.test.ts, 3/3) and mutants
| # | Proof | Mutant | Observed |
|---|---|---|---|
| 1 | info/exclude-only ignored file snapshots equal | copy call removed | RED (2 failed) |
| 2 | linked worktree subject | literal `<subject>/.git/info/exclude` | RED (1 failed) |
| 3 | real change still refused, message names both objects | comparison disabled | RED (1 failed) |
Restore verified by hash (d90fec55a5e0).

## End to end
Probe with this lane's code against the primary checkout (main, clean, `.claude/scheduled_tasks.lock` present): `snapshot OK` (150 s). With main's code: `snapshot FAILED: … does not reproduce …` (119 s).

## Gates
Double clean build:raw under bun 1.4.0 identical (bin e3a1f13f…, MANIFEST d509fad7…, dist unchanged); manifest:package:check PASS; tsc clean; audit:public PASS; charter strict ok; new + native-gates + skill-contract + toolchain-pin tests 77/77; SKILL.md 19,975 bytes. Full suite: hosted CI is the arbiter.
