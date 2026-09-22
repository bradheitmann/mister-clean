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
| LE-003 | 2026-09-21 | `prepare` (skill bundle v6.3.1, `bin/mister-clean.js`) aborts with `ENOTDIR: not a directory, scandir <repo>/.claude/commands/plan.md` when a gitignored `plan.md` symlink-to-file is promoted to a planning-root candidate by `isCanonicalPlanningFileName()` and then `scandir`'d; `audit planning` on the same tree does not crash (lists it as `planning_input_unparsed`), so the two entry points disagree. A partial run dir is left behind on abort. Observed in the holden closeout run `mc-20260921-closeout`; condensed with diagnosis and fix sketch in `project/planning/handoffs/HANDOFF-2026-09-21-SPRINT.md` § Defects observed. **Closed 2026-09-22** by `SLICE-LE-003-DEV-001` / `SLICE-LE-003-QA-001` (`project/planning/slices/done/`): `discoverPlanningRoots()` no longer promotes symbolic links to exact-file roots; the 7.0 candidate `prepare` exits 0 on the fixture and no bundle record lists the symlink; regression test in `src/closeout/repository.test.ts`. The pinned 6.3.0 evaluator keeps the defect (it is not repaired retroactively). Remaining note, not blocking: a partial run directory is still left behind when `prepare` aborts for another reason. | maintainer | `prepare` succeeds on a fixture repo with an ignored `plan.md` symlink-to-file, the closure bundle does not list the symlink, and a regression test is committed | closed |
| LE-004 | 2026-09-22 | The registry publication credential available to this machine (Doppler `dev-env`/`dev` secret `NPM_TOKEN`, consumed by `~/.npmrc`) is rejected by `https://registry.npmjs.org/-/whoami` with HTTP 401, so `publish_release_archive.mjs` cannot complete its `pnpm publish`. `@bradheitmann/mister-clean` 7.0.x is verified and archived but not on the registry; the global install stays at 6.3.0. Evidence: `/tmp/sprint-20260922/mister-clean/npm-whoami-401.log` (`{}` body, `http_status=401`) and `publish-attempt.log` (machine-local). | operator | a valid npmjs publish token for `@bradheitmann` is present in Doppler, `pnpm whoami --registry https://registry.npmjs.org` succeeds, and the receipt-bound publish command below is run and returns a `publication-receipt.json` | open |
| LE-005 | 2026-09-22 | Tag `v7.0.0` (0248c95, tree 312c9d0) is retained but can never be published: its tree ships `scripts/publish_release_archive.mjs` with the pnpm-10-era `--@bradheitmann:registry=` argv, which pnpm 11.0.3 and 12.5.1 reject on `view` and `publish`, and the receipt-bound helper cannot be replaced without a new tag at a new commit. The CI tag job (run 35784649561) also failed its release source check because it never built the checkout in place. Both are repaired at 7.0.1 (`--config.@bradheitmann:registry=`, in-place build step in `ci.yml`), together with the helper's absent-version classifier, which only knew pnpm 10's `E404` text and now also accepts pnpm 11+'s `ERR_PNPM_PACKAGE_NOT_FOUND` JSON (independent QA finding on PR 2). Tags are never moved. | maintainer | 7.0.1 is tagged from `main`, its tag CI run passes the release-archive step, and the 7.0.1 archive is published; `v7.0.0` remains as a historical tag with no registry counterpart | open |

Open: 4 · Previous: 2 · Delta: +2 · New: 2 · Closed: 0 (cumulative closed: 1)
