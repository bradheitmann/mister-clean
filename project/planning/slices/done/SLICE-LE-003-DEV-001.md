---
artifact_type: slice
id: SLICE-LE-003-DEV-001
title: LE-003 DEV — prepare must not abort on an ignored plan.md symlink
status: done
role: dev
top_level: true
opened: 2026-09-22
closed: 2026-09-22
owner: dev lead (Claude Fable 5.1)
ledger_row: LE-003
timezone: America/Denver
---

# SLICE-LE-003-DEV-001 — `prepare` aborts on an ignored `plan.md` symlink

Ledger row: `project/planning/hygiene/MANUAL-LOOSE-ENDS-LEDGER.md` LE-003.
Origin: `project/planning/handoffs/HANDOFF-2026-09-21-SPRINT.md` § Defects observed.

## Defect (reproduced on this candidate before the fix)

Fixture: a Git repository whose `.claude/commands/plan.md` is a gitignored
symbolic link to `skills/plan-skill.md`.

| Entry point | Before fix | After fix |
|---|---|---|
| accepted 6.3.0 `prepare` | `ERROR: ENOTDIR: not a directory, scandir .../.claude/commands/plan.md`, exit 2 | unchanged (6.3.0 is the pinned evaluator; not repaired) |
| 7.0 candidate `prepare` | `ERROR: census root resolves through a symbolic-link path: .claude/commands/plan.md`, exit 2, partial run directory left behind | exit 0, bundle directory printed, `commands/plan.md` absent from every bundle record |
| 7.0 candidate `audit planning` | PASS, artifactCount 1 | PASS, artifactCount 1 |

Root cause: `discoverPlanningRoots()` in `src/closeout/repository.ts` promoted
any entry with a canonical planning stem to an exact-file planning root when
`entry.isFile() || entry.isSymbolicLink()`. A symbolic link is never a
census-bindable planning input (`captureFileCensus` rejects symbolic-link
roots by design), so `prepare` failed closed on a root that `audit planning`
merely reported as unparsed. The two entry points disagreed about the same
object.

## Change

- `src/closeout/repository.ts`: promote only `entry.isFile()` candidates
  (one condition; comment cites LE-003).
- `src/closeout/repository.test.ts`: regression test "does not promote a
  symbolic link with a canonical planning stem to a planning root (LE-003)".
- Regenerated tracked outputs: `bin/mister-clean.js`, `MANIFEST.sha256`
  (`pnpm run build:raw`).

Not changed: census symlink rejection (still fail-closed for symlinks inside a
discovered planning root, covered by the existing planning test "fails closed
on unsupported, binary, and symlinked entries in a discovered planning root");
partial-run-directory cleanup on abort (proposed fix item 3 in the handoff;
tracked as a remaining note on LE-003, not required by its close condition).

## Evidence (machine-local, not committed)

- `/tmp/sprint-20260922/mister-clean/le003-repro-before.log`,
  `le003-repro-after.log` — fixture script `le003-repro.sh`.
- `/tmp/sprint-20260922/mister-clean/le003-focused-tests.log` — vitest
  `repository.test.ts`, `planning.test.ts`, `prepare.test.ts`: 3 files,
  165 tests passed.
- `/tmp/sprint-20260922/mister-clean/build-raw.log` — `build:raw` EXIT=0.

## Acceptance

Independent QA: `SLICE-LE-003-QA-001`. The exact-object receipt is the CI
`ci:check` run on the commit that carries this file (PR #1).
