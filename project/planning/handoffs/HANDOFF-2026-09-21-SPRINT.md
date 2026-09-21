---
artifact_type: reference
classification_rationale: Sprint handoff for the 2026-09-21 wave-1 dev-lead run; historical record of what was executed, skipped, and what to run next. Not a cleanliness verdict.
title: Sprint handoff 2026-09-21 (mister-clean, wave 1)
---

# Sprint handoff — mister-clean, 2026-09-21 wave 1

Dev lead: Claude Fable 5.1 (autonomous, one-writer). Time-box 100 min from
04:04 PDT. Branch: `fix/gate-execution-leases` in `../.mc-wt/gate-execution-leases`.
`main` untouched (4694bfe). Nothing merged, published, or globally installed.

## Commits on fix/gate-execution-leases (base 2a8aed0)

- b8e626a docs(handoff): adopt 2026-09-08 PM handoff under project/planning/handoffs
- 807ed39 docs(planning): add manual loose-ends ledger and successor primer
- e5ce729 docs(current): record 2026-09-21 CI attempts, evaluator runs, detector disposition
- (this file) docs(handoff): sprint 2026-09-21 handoff

## Done

1. **Clean-capsule CI on 2a8aed0** — six attempts; see the receipts section of
   `CURRENT.md`. Terminal result of attempt 6 (warm-store variant): PASS (8 matrix commands; RepositoryObject 96cc89fccfe92075216eec04b6db93fd88621bacff03910d01cf6712271ca946; warm-store variant).
   Logs: `/tmp/sprint-20260921/mister-clean/ci-check*.log` (machine-local).
   Toolchain finding: `node:sqlite` needs Bun 1.4.0 (CI pin); local Bun 1.3.9
   fails before creating a capsule. A pinned Bun 1.4.0 was used from `/tmp`;
   the global Bun was not changed.
2. **Detector branch disposition** — `fix/detector-fp-classes` (4efb0ee) is
   SUPERSEDED by 7500a0b. Proof commands (all read-only):
   `git log -S PRIMARY_STATE_KEYS --oneline main` -> 7500a0b;
   `git grep -F contextualizeGovernanceValidatorSources 2a8aed0 -- src/closeout/`;
   nine test titles cross-checked in `src/closeout/planning.test.ts`.
   `git log main..fix/detector-fp-classes` is NOT empty and the reverse-apply
   diff is NOT empty, so the branch was **retained** (also published on origin).
3. **Handoff adoption** — root `HANDOFF-2026-09-08-PM.md` committed under
   `project/planning/handoffs/` with a reference header and a marked home-path
   redaction. Root copy left in place on `main` (not deleted).
4. **Stubs** — `project/planning/hygiene/MANUAL-LOOSE-ENDS-LEDGER.md` and
   `docs/PRIMER.md` created; both detector-clean under 6.3.0 and 7.0.
5. **Evaluator runs (AUDIT only)** — 6.3.0 global vs main: planning PASS,
   public-safety FAIL(3: handoff home paths x2, THIRD_PARTY_NOTICES email),
   detect stack exit 0. 7.0 candidate vs itself: planning PASS,
   repository-boundaries PASS, public-safety PASS, detect stack exit 0.
   Logs: `/tmp/sprint-20260921/mister-clean/mc630-*.log`, `mc70-*.log`.

## Skipped / not claimed

- No merge to main, no publish, no global bump (forbidden by plan and CURRENT.md).
- No branch or worktree deleted (subsumption diff non-empty).
- Pristine-store `ci:check` receipt NOT obtained (bandwidth ~150 KiB/s during
  the sprint); attempt 6 reused the operator's content-addressed pnpm store.
- `THIRD_PARTY_NOTICES.md:8 email-address` (6.3.0 finding) left as-is; the
  7.0 denylist policy accepts it.
- main's `CURRENT.md` still carries the stale `../.mc-wt/detector-fp`
  reference; it is superseded by the branch's `CURRENT.md`, not edited on main.

## Exact next commands

```sh
cd <open_protocols>/.mc-wt/gate-execution-leases
git log --oneline main..HEAD                      # the sprint commits
export PATH=/tmp/sprint-20260921/mister-clean/bun-1.4.0/bin:$PATH   # or install Bun 1.4.0
pnpm run ci:check                                 # pristine-store receipt on adequate bandwidth
MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun src/cli.ts audit planning .
```
Then: independent frozen-object QA on the new HEAD (CURRENT.md "Required
sequence" steps 3-8). Human decision: delete `fix/detector-fp-classes`
(local + origin) on the strength of the disposition, or keep.

## Upstream intake

`/tmp/sprint-20260921/upstream-intake/mister-clean-handoff-layout-assumes-planning-root.md`
