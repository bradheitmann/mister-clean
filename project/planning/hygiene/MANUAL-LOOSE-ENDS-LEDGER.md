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

Open: 2 · Previous: UNKNOWN · Delta: n/a (first ledger) · New: 2 · Closed: 0
