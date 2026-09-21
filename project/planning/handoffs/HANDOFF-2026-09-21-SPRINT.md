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

- `mister-clean-handoff-layout-assumes-planning-root.md` (machine-local packet
  under `/tmp/sprint-20260921/upstream-intake/`) — routed to
  `edge_agentic_orchestration_system` as
  `SLICE-GOVHOOK-HANDOFF-LAYOUT-{DEV,QA}-001` under
  `STORY-GOVHOOK-UPSTREAM-INTAKE-001` (defect HK-C1). The defect is in the
  Edge-Agentic handoff skill/template. The mister-clean behaviour the packet
  describes as a second-order effect (a frontmatter-less file under
  `project/planning/` classified `planning_input_unparsed`) is by design and
  needs no mister-clean change.

## Defects observed during 2026-09-21 sprint

Owner: this repo. Filed as ledger row LE-003 in
`project/planning/hygiene/MANUAL-LOOSE-ENDS-LEDGER.md`; condensed here so the
handoff stays self-contained. Not fixed on this branch (outside the sprint's
scope; `main` was read-only this sprint).

### LE-003 — `prepare` aborts with ENOTDIR on an ignored `plan.md` symlink (skill bundle v6.3.1)

Observed by the holden closeout run `mc-20260921-closeout`. holden carries
`.claude/commands/plan.md`, a gitignored symlink to a skill file. Running

    node <skill-bundle>/bin/mister-clean.js prepare --repo <holden> \
      --evidence-home <holden>/.tmp/evidence --run-id x --request-ref r --request-text t

fails with `ERROR: ENOTDIR: not a directory, scandir <holden>/.claude/commands/plan.md`,
exit 2, and leaves a partial run dir behind (`criteria-source.json`,
`operative-request.txt`, `planning-audit.json`). `audit planning` on the same
tree does not crash and lists the file as `planning_input_unparsed`, so the
two entry points disagree about the same object.

Diagnosis (from the bundled source): `isCanonicalPlanningFileName()` promotes
any `plan.md` to a planning-root candidate; `prepare`'s discovery `scandir`s
each root without an `lstat`, so a file / symlink-to-file throws and nothing
catches it or cleans up; the audit path uses
`git ls-files -co --exclude-standard`, the prepare walk apparently does not,
so ignored machine-local symlinks leak into discovery.

Proposed fix:

1. `lstat` each candidate root; treat file / symlink-to-file candidates as
   single planning inputs (or skip them) instead of `scandir`.
2. Use the same `--exclude-standard` census in `prepare` as in
   `audit planning`, so ignored paths never become roots.
3. On any discovery exception, remove the partially written run directory (or
   write `prepare-failed.json`) so a retry does not collide on `--run-id`.
4. Regression test: fixture repo with an ignored `.claude/commands/plan.md`
   symlink to a file; `prepare` must succeed and the closure bundle must not
   list the symlink.

Workaround used by the reporter: `--repo` pointed at an isolated lane worktree
(no ignored symlinks); the aborted partial dir was moved to ignored scratch and
recorded in that repo's debris census.

Source: sprint 2026-09-21 upstream-intake packet
`mister-clean-prepare-walker-enotdir-on-plan-stem-symlink.md` (machine-local).
