# LANE public-safety-provenance — self-clean cycle 1, general detector fix O-PS-PROV-1

Worktree `~/.config/superpowers/worktrees/mister-clean/cycle-1-provenance`, branch `fix/public-safety-provenance`
from main `fca67edf224a6877f3d181307392ea1f36336016` (v7.3.0). Brief: `BRIEFS/LANE-self-clean-cycle-1-provenance.md`
(PM ledger, outside the repository). DONE list committed first as `charter/DONE/public-safety-provenance.md`
(`666fdf9`); it did not grow. Author: Claude dev subagent; QA: MC/DEV (second family) after freeze.

## Why

`mister-clean audit public-safety <repo> --json` walks the working tree, including ignored paths, and its findings carried
no provenance. A reader could not tell a publication leak (tracked bytes) from a local hazard (ignored bytes) or an
unstaged one (untracked). The detector output now says which, derived from Git and never guessed.

## What changed (general; no repository-specific case)

- `src/closeout/repository.ts`: two additive exports through the existing bounded null-separated listing
  (`GIT_OUTPUT_LIMIT_BYTES`, typed `git_output_too_large`): `trackedPaths` = `git ls-files -z`;
  `ignoredPaths` = `git ls-files -z --others --ignored --exclude-standard`. No raw `spawnSync`.
- `src/closeout/inspection.ts`:
  - `PublicSafetyFinding.provenance: "tracked" | "untracked" | "ignored" | "unknown"` (required).
  - `PublicSafetyScanResult.provenance_counts: { tracked, untracked, ignored, unknown }` (sums to `findings.length`),
    `provenance_source: "git" | "scope" | "unavailable"`, and `provenance_unavailable_reason` present exactly when the
    source is `unavailable`. The reason is a closed set (`not_a_git_repository`, `git_unavailable`,
    `git_output_too_large`, `git_listing_failed`, `selected_surface`); Git's message text never enters the result.
  - Walk scan (`scanPublicSafety` / `scanPublicSafetySync`, the `audit public-safety` path): both listings run once per
    scan; tracked wins over ignored; everything else the walk visits is untracked. Any listing failure, including the
    typed too-large refusal, yields `unknown` with its reason.
  - `scanTrackedPublicSafetySync` (`tracked_shippable`; `prepare`, bundle validation, `second-pass`, `--tracked`):
    every finding `tracked`, source `scope`.
  - `scanSelectedPublicSafetySync` (arbitrary caller surface; `scripts/verify_public_package.ts`): `unknown`, source
    `unavailable`, reason `selected_surface`. That script reads only `findings` and `unassessed`.
  - Fingerprint (`publicSafetyFingerprint`: rule, path, line), `value_sha256`, unassessed rows and exit codes are
    unchanged. `receiptFindingsFromAudit` ignores the new keys, so receipts and second-pass joins are unaffected.
- `README.md` (Public-safety boundary) and `references/verification-doctrine.md` (section 24): one sentence each.
  `SKILL.md` untouched (19,975 bytes).
- Packaged bytes regenerated because the scanner is part of the CLI bundle (see Gates).
- Text-mode output of `audit public-safety` is unchanged (the `path:line: rule` lines and the `FAIL (n finding(s))` line
  are asserted exactly by existing tests); the field is in `--json`, which is the form the brief names.

## Proofs and observed-RED mutants

Proof file: `src/closeout/public-safety-provenance.test.ts` (6 tests). Green run, unmutated:
`MISTER_CLEAN_SOURCE_DEVELOPMENT=1 nice -n 10 node ./node_modules/vitest/vitest.mjs run --allowOnly=false
--no-file-parallelism --testTimeout=120000 src/closeout/public-safety-provenance.test.ts` → 6/6 passed (31.4 s).
Each mutant was applied with the editor, the named proof run with `-t`, the failure observed, the edit reverted, and
`src/closeout/inspection.ts` and `src/closeout/repository.ts` verified byte-identical to their pre-mutation SHA-256
(`shasum -a 256 -c`; `dfed2c9b…` and `5208bad2…`) after every round.

| # | Proof | Mutant applied | Observed |
|---|---|---|---|
| 1 | three-provenances | `ignored.has(path)` branch removed from the Git resolver | RED: `ignored/local.txt` reported `untracked` (expected `ignored`) |
| 2 | fingerprint-unchanged | provenance folded into the fingerprint input (`rule\0provenance`) | RED: fingerprint `8e0f8510…` received, `1c73f5b1…` expected (= independent sha256 of `public_safety\0rule\0path\0line`) |
| 3 | tracked-scope-all-tracked | tracked wrapper annotated through the unknown resolver instead of the scope | RED: `provenance_source` `unavailable` (expected `scope`) |
| 4 | non-git-unknown | listing failure replaced by a guess of `tracked`, source `git` | RED: `['tracked','tracked']` (expected `['unknown','unknown']`) |
| 5 | existing-green | finding rows emitted under a renamed key (`rows`) | RED: 7 second-pass tests and the proof-5 round-trip failed with `public_safety: audit result is not canonical` |
| 6 | bounded-listing | `trackedPaths` replaced by plain `spawnSync` at Node's default 1 MiB buffer | RED: ENOBUFS surfaced as `provenance_source` `unavailable` (expected `git`) on a 1,200-entry index-only fixture whose listing exceeds 1 MiB |

Proof 5 reopen (existing tests): `src/closeout/inspection.test.ts` 15/15, `src/cli.test.ts`, `src/skill-contract.test.ts`
43/43, `src/closeout/second-pass.test.ts`, `src/run-receipt.test.ts`, `src/closeout/finding-anchors.test.ts`,
`src/closeout/tracked-shippable-paths.test.ts`: all green in the lane set below.

## Gates (all green on the frozen tip)

- `pnpm exec tsc --noEmit` → 0.
- Lane set: `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 nice -n 10 node ./node_modules/vitest/vitest.mjs run --allowOnly=false
  --no-file-parallelism --testTimeout=120000 src/closeout/public-safety-provenance.test.ts src/closeout/inspection.test.ts
  src/cli.test.ts src/skill-contract.test.ts src/closeout/second-pass.test.ts src/run-receipt.test.ts
  src/closeout/tracked-shippable-paths.test.ts src/closeout/finding-anchors.test.ts` → 8 files, 107/107 (94.7 s).
- `bun run audit:public` → `prospective package public-safety: PASS (83 files)`.
- Packaged bytes: `bin/mister-clean.js` changes (the scanner is bundled into the CLI), so `pnpm run build:raw` was run
  twice under bun 1.4.0 (`export PATH=$TMPDIR/bun140/bin:$PATH`; `bun --version` → 1.4.0), each from no `dist/` at all
  (the worktree was fresh; `dist/` was removed between the runs). Both runs identical:
  dist/public.js `1e1601727941634e72c93c692b3016b9455c4d7a0d83dfc190fbd0571fad4c79`,
  dist/stdio.js `e6ae7768f6540fcc1679ad185e72ca8ec1009a36c2ee8197a98f0f006e38757b`,
  bin/mister-clean.js `5cfb08c42f35833d48480c377eeef784d58d6130d6428912fd944c332a384fe9`,
  MANIFEST.sha256 `7b2aebfc997039e4a6bf2ff1c514c19077b54c8004829ba09c268853a73bbfb0`.
  `bun run manifest:package:check` → PASS (82 entries); `bun run sync:cli:check` → verified.
- `charter check --strict` (charter b9323cd) → ok.
- Full `pnpm run test:node` under `nice -n 10`: see the section below (run once, after the implementation commit).

## Dogfood on this worktree

`MISTER_CLEAN_RECEIPT_ROOT=<mktemp -d> MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun src/cli.ts audit public-safety . --json`
(receipt root outside the repository) before the docs edits: `provenance_source: "git"`, counts
`{tracked: 1, untracked: 0, ignored: 0, unknown: 0}`. The one finding was `tracked`: the DONE list's own proof 1 wording
quoted a literal home-path pattern, and the repository's existing self-scan test (`inspection.test.ts`, "keeps the
prospective public source tree free of private identifiers") went red on it. The wording was changed to "a POSIX
home-directory path (the `posix-home-path` rule)"; no proof was added or removed. The 41 ignored-directory hits named
in the brief do not exist in this fresh worktree (that data directory is local to the PM's primary checkout).

## Decisions taken

- The DONE commit was amended once before any push: the first draft lacked an explicit reopen step on proofs 2–6 and a
  mutant on proofs 3 and 5, and `charter check --strict` refused it. The six proofs are the brief's six; only the
  reopen/mutant wording was added. Amend, not a second commit, because nothing had been pushed.
- `provenance_unavailable_reason` is a closed enumeration rather than Git's stderr: a receipt refuses any text that
  matches a public-safety rule, and Git's "not a git repository" message carries the probed absolute path.
- Tracked membership is checked before ignored membership, so a tracked file that also matches an ignore pattern is
  `tracked` (Git's `--others` would not list it anyway).
- The ignored listing is the brief's exact command (per file, no `--directory`). On this worktree with `node_modules`
  present it completes well inside the bound; a tree with more ignored files than the 256 MiB bound allows becomes a
  typed `git_output_too_large` → `unknown`, never a crash and never a guess.
- One `bun -e` one-liner was used to pretty-print the dogfood JSON; it should have been `jq`. No code or proof depends on it.

## Observations for the PM (not fixed here; obligations, not DONE-list growth)

- O-PS-PROV-2: a nested checkout inside the audited root: `git ls-files` lists neither its files (tracked) nor them as
  ignored, so the walk labels them `untracked`. Correct from the outer repository's view, but worth one sentence of
  doctrine or a `nested_checkout` provenance if the self-clean loop meets one.
- O-PS-PROV-3: path normalisation. Membership is exact-string against Git's own listing; on macOS a non-ASCII file
  name can be returned by the filesystem in a different Unicode normalisation than Git stores, which would label a
  tracked file `untracked`. No fixture in this repository has such a name.
- Text-mode output could carry the counts on the `FAIL` line; left unchanged to keep the existing exact-string
  assertions green (brief: existing tests stay green).

## Full `test:node` result

(filled in below after the run)
