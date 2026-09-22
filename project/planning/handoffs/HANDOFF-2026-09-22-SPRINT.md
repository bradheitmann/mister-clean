---
artifact_type: reference
classification_rationale: Sprint handoff for the 2026-09-22 accept-and-ship run; historical record of what was executed, what blocked, and the exact next commands. Not a cleanliness verdict and not a lifecycle-bearing planning artifact.
title: Sprint handoff 2026-09-22 (mister-clean, accept and ship 7.0)
timezone: America/Denver
---

# Sprint handoff — mister-clean, 2026-09-22

Dev lead: Claude Fable 5.1 (autonomous, one writer). Independent QA seat:
Claude Opus 5.5, read-only, spawned headless; it wrote only its verdict
files. Time-box 150 min from 13:31 PDT. `CURRENT.md` carries the receipt
table; this file carries the narrative and the next commands.

## What shipped

1. **PR 1 merged.** `fix/gate-execution-leases` -> `main` as merge commit
   0248c95, tree `312c9d0d516e4f9cc63185ecf576aa859dc9f67a`, history
   preserved. Gates on that exact tree: CI `ci:check` PASS (run
   35783607000), independent QA PASS (initial verdict on ff33cad, delta on
   312c9d0), pinned 6.3.0 GUARD dogfood PASS with negative controls 4/4.
2. **LE-003 fixed and closed** (531391d): `discoverPlanningRoots()` promotes
   only regular files to exact-file planning roots; regression test;
   DEV/QA pair under `project/planning/slices/done/`.
3. **Node 22 parity fixed** (3b443bd): `node:sqlite` is loaded lazily in the
   execution lease, so the standalone CLI no longer prints the
   ExperimentalWarning on commands that never take a lease. This was the
   red CI on the first PR head (run 35780981335) and was caught only by the
   pristine-store CI receipt the earlier sprint could not produce locally.
4. **Tag `v7.0.0`** at 0248c95, pushed. Release archive built and verified
   locally from that tagged checkout (`verified_not_published`, sha256
   `9e90a98f551e2c800494d084b7fc98dfd82625b46342a285c1dac7be1c049479`).

## What blocked, and what this branch does about it

- **Tag CI release step failed** (run 35784649561): the workflow never
  builds the tagged checkout in place, so `--source-check` sees a 60-entry
  surface against the tracked 79-entry manifest. Fixed here in
  `.github/workflows/ci.yml` (in-place `pnpm install` + `build:raw` +
  `manifest:package:check` before the release step, tag refs only).
- **Publish helper argv is pnpm-10 era.** `--@bradheitmann:registry=...` is
  rejected by pnpm 11.0.3 and 12.5.1 on both `view` and `publish`
  (`publish-attempt.log`). Fixed here in `scripts/publish_release_archive.mjs`,
  `scripts/prepare_release_archive.mjs`, `scripts/release_path.test.mjs`
  (`--config.@bradheitmann:registry=`, verified to parse on 11.0.3 and
  12.5.1 with `pnpm view` and `pnpm publish --dry-run`). The helper's
  absent-version classifier also accepted only the pnpm-10 `E404` text; it
  now recognises pnpm 11+'s `ERR_PNPM_PACKAGE_NOT_FOUND` JSON (found by the
  independent QA seat on PR 2), and the test's fake pnpm models pnpm 11.
  Because the receipt
  binds the helper bytes and the attestation binds `git_tag == v<version>`,
  7.0.0 can never be published from `v7.0.0`; the version is bumped to
  **7.0.1** here (LE-005). Tags are never moved.
- **No valid npmjs token.** Doppler `dev-env`/`dev` `NPM_TOKEN` gets HTTP 401
  from `/-/whoami` (`npm-whoami-401.log`, LE-004). Nothing on this machine can mint one. The
  publish therefore stops at the helper's registry observation, and the
  global install and skill bundle stay at 6.3.0 / 6.3.1.

## Exact next commands (after this branch merges as PR 2 and CI is green)

```sh
cd <open_protocols>/mister-clean && git checkout main && git pull --ff-only
git tag -a v7.0.1 <merge-commit> -m "Mister Clean 7.0.1" && git push origin refs/tags/v7.0.1
# wait for the tag CI run: ci:check + in-place build + release archive must all pass
export PATH=<bun-1.4.0>/bin:$PATH   # Bun 1.4.0, Node >= 22, pnpm 11.0.3 (packageManager)
pnpm run build:raw && pnpm run manifest:package:check
node scripts/prepare_release_archive.mjs --destination /tmp/mister-clean-release-7.0.1
# publication needs a valid npmjs token for @bradheitmann in Doppler (LE-004):
doppler run -p dev-env -c dev -- node /tmp/mister-clean-release-7.0.1/publish_release_archive.mjs \
  --receipt /tmp/mister-clean-release-7.0.1/release-archive-receipt.json
pnpm add -g @bradheitmann/mister-clean@7.0.1 && pnpm ls -g --depth 0 | grep mister-clean   # the CLI has no --version output
# skill bundle: replace ~/.claude/skills/mister-clean with the published package contents
```

## Branch and worktree disposition

- `fix/gate-execution-leases`: merged; `git log main..fix/gate-execution-leases`
  is empty. Local branch, its worktree `../.mc-wt/gate-execution-leases`, and
  the remote branch are deleted by this sprint's closeout with that proof
  recorded in the sprint handoff outside the repository.
- `fix/detector-fp-classes`: unchanged (LE-001).
- `fix/release-path-7.0.1`: this branch; PR 2.

## Not done, honestly

- 7.0.x is not on the registry; the global install (`pnpm ls -g --depth 0`)
  is still `@bradheitmann/mister-clean@6.3.0`; the skill bundle
  `~/.claude/skills/mister-clean/SKILL.md` is 6.3.1.
- No live schema-1.3 crossed GUARD barrier was produced (see the GUARD scope
  decision in `CURRENT.md`).
- `THIRD_PARTY_NOTICES.md:8` email-address remains a 6.3.0-only finding,
  accepted by the 7.0 denylist policy.
