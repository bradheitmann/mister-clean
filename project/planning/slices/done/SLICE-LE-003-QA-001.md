---
artifact_type: review
id: SLICE-LE-003-QA-001
title: LE-003 QA — independent verification of the plan.md symlink repair
status: done
outcome: pass
role: qa
review_of: SLICE-LE-003-DEV-001
opened: 2026-09-22
closed: 2026-09-22
owner: independent QA seat (Claude Opus, read-only, different model from DEV)
ledger_row: LE-003
timezone: America/Denver
---

# SLICE-LE-003-QA-001 — independent QA of the LE-003 repair

Reviews `SLICE-LE-003-DEV-001`. The QA seat is a fresh read-only agent on a
different model from the DEV lead; it edits nothing in the repository and
writes only its verdict file.

## Review object

The staged Git tree that contains this file, bound by `git write-tree`, and
the commit minted from that exact tree (`commit^{tree}` must equal the
reviewed tree). The verdict file records the tree SHA it judged.

## Checks the QA seat performs

1. Read `src/closeout/repository.ts` `discoverPlanningRoots()` and confirm
   the only behavioural change is that symbolic links are no longer promoted
   to exact-file planning roots.
2. Re-run the regression test file and the adjacent planning/prepare tests
   from the reviewed tree (`node ./node_modules/vitest/vitest.mjs run
   --allowOnly=false src/closeout/repository.test.ts
   src/closeout/planning.test.ts src/closeout/prepare.test.ts`).
3. Re-run the fixture reproduction (`/tmp/sprint-20260922/mister-clean/le003-repro.sh`)
   and confirm the 7.0 `prepare` exits 0 and no bundle record lists
   `commands/plan.md`.
4. Confirm `bin/mister-clean.js` and `MANIFEST.sha256` are regenerated from
   the reviewed source (`pnpm run sync:cli:check` and
   `pnpm run manifest:package:check` after a local `tsup`), or defer that
   byte check to the CI `generated:check` step and say so.
5. Confirm no other source file changed relative to `ad963ce` except the
   files named in the DEV slice plus planning/current-state documents.

## Verdict

Recorded outside the repository at
`/tmp/sprint-20260922/mister-clean/qa-verdict-le003-and-acceptance.md`,
binding the reviewed tree SHA. A verdict other than PASS on that exact tree
reopens LE-003 and returns this pair to `active`.
