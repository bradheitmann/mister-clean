---
artifact_type: reference
classification_rationale: Manual loose-ends tracking ledger; carries no planning lifecycle of its own. Referenced by the 2026-09-08 PM handoff as a required path.
title: Manual loose-ends ledger
timezone: America/Denver
---

# Manual loose-ends ledger

This ledger records manually tracked loose ends that are not represented as
typed planning artifacts. It creates no cleanup mandate by itself; every row
must point at the artifact, receipt, or commit that discharges it.

Counts are computed from the table below. Before this file existed the counts
were UNKNOWN (see `HANDOFF-2026-09-08-PM.md`), not zero.

| ID | Opened | Loose end | Owner | Closes when | Status |
|---|---|---|---|---|---|
| LE-001 | 2026-09-21 | `fix/detector-fp-classes` (4efb0ee) retained after subsumption proof; textual reverse-apply diff is non-empty so the branch is kept until a human confirms deletion. | operator | branch deleted or re-based with an empty `git log main..fix/detector-fp-classes` | open |
| LE-002 | 2026-09-21 | Local Bun is 1.3.9; `ci:check` requires `node:sqlite` (Bun 1.4.0 as pinned in `.github/workflows/ci.yml`). Sprint runs used a pinned Bun 1.4.0 outside the repo. | operator | a repo-local Bun version pin (`.bun-version` or `engines.bun`) lands | open |
| LE-003 | 2026-09-21 | `prepare` (skill bundle v6.3.1, `bin/mister-clean.js`) aborts with `ENOTDIR: not a directory, scandir <repo>/.claude/commands/plan.md` when a gitignored `plan.md` symlink-to-file is promoted to a planning-root candidate by `isCanonicalPlanningFileName()` and then `scandir`'d; `audit planning` on the same tree does not crash (lists it as `planning_input_unparsed`), so the two entry points disagree. A partial run dir is left behind on abort. Observed in the holden closeout run `mc-20260921-closeout`; condensed with diagnosis and fix sketch in `project/planning/handoffs/HANDOFF-2026-09-21-SPRINT.md` § Defects observed. | maintainer | `prepare` succeeds on a fixture repo with an ignored `plan.md` symlink-to-file, the closure bundle does not list the symlink, and a regression test is committed | open |

Open: 3 · Previous: 2 · Delta: +1 · New: 1 · Closed: 0
