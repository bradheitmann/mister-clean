# LANE run-receipts — 7.3.0 run receipts and second pass (frozen)

Worktree `~/.config/superpowers/worktrees/mister-clean/run-receipts`, branch `feat/run-receipts-second-pass` from
origin/main `aa40491`. Design of record: the PM's `DESIGN-7.3.0-run-receipts-second-pass.md` (private ledger). DONE list
committed first as `charter/DONE/run-receipts.md` (`0e850c5`); it did not grow.

## What was built (additive only)

- `src/run-receipt.ts`: schema `mister-clean.run-receipt/1` (exact key sets, enumerations, digests), privacy refusal,
  `LocalRunReceiptStore` (0600 receipt per `<root>/<repository_id_sha256>/<uuid>.json` plus `receipts.index.jsonl`),
  `MISTER_CLEAN_RECEIPT_ROOT` / `XDG_STATE_HOME` / `HOME` resolution, typed errors `receipt_root_inside_repository`,
  `receipt_privacy_violation`, `run_receipt_invalid`; agent identity only from `--agent-card` / `MISTER_CLEAN_AGENT_CARD`.
- `src/closeout/finding-anchors.ts`: one fingerprint rule `sha256(family \0 rule \0 path \0 anchor.kind \0 content_sha256)`;
  anchors per the design (public-safety `value_digest`, github-actions `line_content` of trimmed ref lines, planning and
  boundaries `detail_digest`, semantic `whole_repo` = candidate_set_sha256); `legacy_fingerprint` kept from the existing
  derivations; one `git hash-object --stdin-paths` batch per run for `blob_oid`.
- `src/closeout/second-pass.ts`: subject capture (toplevel, HEAD, HEAD tree, RepositoryObject 1.0 unless
  `--no-subject-hash`, dirty flag, `repositoryIdentity()`), read-only family runner, Git port (`cat-file -e/-p`,
  `rev-parse <head>:<path>`), pure classifier, legacy-bundle baseline reader, flaky detection, `runSecondPass`.
- `src/cli.ts`: receipts after `audit` (AUDIT) and `prepare` (CLOSE; read from the bundle's own audit files and
  `baseline_repository_object`), new `second-pass <repo> [--against <receipt_id|bundle>] [--json]`, usage. The store is
  injected like the journal (`runCli(..., receipts)`), so tests that call `runCli` directly never write to the real state root.
- `src/closeout/inspection.ts`: one additive export `publicSafetyValueDigestsInText` (same rule table and value digest as
  the scanner) used by the privacy check and the earlier-blob value search.
- README "Receipts and second pass"; SKILL.md modes table row `second-pass` (read-only). `public.ts` untouched.

## Proofs and observed-RED mutants

Green run: `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run --allowOnly=false
--no-file-parallelism --testTimeout=120000 src/run-receipt.test.ts src/closeout/finding-anchors.test.ts
src/closeout/second-pass.test.ts` → 3 files, 19 tests passed. Each mutant was applied with the editor, the proof test run,
the failure observed, the edit reverted, and all three modules verified byte-identical to their pre-mutation SHA-256
(`shasum -c`), with `git status` showing only the intended changes.

| # | Proof | Mutant applied | Observed |
|---|---|---|---|
| 1 | fingerprint-line-shift (public-safety and GitHub Actions) | public-safety content digest also hashes `line_hint` | RED: fingerprint changed after the inserted line (`466519d5…` expected, `85845f11…` received) |
| 2 | miss-decided-by-git | new-only branch: `holds = false` (no `git cat-file` check) | RED: `persisting_unseen` became `introduced` |
| 3 | introduced-decided-by-git | new-only branch: `holds = true` (no earlier-tree check) | RED: `introduced` became `persisting_unseen` |
| 4 | receipt-root-outside-repo | `assertOutsideRepository` containment check disabled | RED: no throw; CLI inside-root run exited 1 instead of 2 |
| 5 | receipt-privacy | `write()` skips `receiptPrivacyViolations` | RED: receipt with a matched email value in `path` was written |
| 6 | legacy-join | `legacyJoin = false` | RED: `persisting` became `cleared` + `unresolvable_earlier_bytes` |
| 7 | receipt-round-trip | `exactKeys` returns true for every record | RED: corrupted key sets (extra `excerpt`, missing `dirty`) were accepted |
| 8 | audit-close-parity | public-safety rule suffixed `@tracked` when `scope === "tracked_shippable"` | RED: tracked (CLOSE) and walked (AUDIT) fingerprints differed |

## Gates (all green on the frozen tip)

- `tsc --noEmit` → 0.
- Touched test files only (command above) → 19/19. The full suite was not run (brief).
- `bun run audit:public` → `prospective package public-safety: PASS (83 files)`.
- Packaged bytes: `bun run build:raw` was not run as one step (it stops on this host at a socket test, as the previous lane
  recorded). The remaining steps were run by hand, per the PM's added gate, twice from a clean `dist/`:
  `rm -rf dist && tsup && pnpm run control-plane:build && pnpm run package:surface:check && bun scripts/sync_cli.mjs &&
  MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun src/cli.ts manifest . --package`. Build 1 and build 2 hash lists (every `dist/`
  file plus `bin/mister-clean.js` and `MANIFEST.sha256`, 25 entries) were identical: list sha256
  `1ea06434bbfbdecf8ed2caccc18c332cc83a259874eeece0ea90f27ccaef7b8a` both times;
  `bin/mister-clean.js` = `dist/cli.js` = `856c6ec7703861d0b005fe9d583a6c075d1302454be03d6e429d16273ebc8bbe`,
  `MANIFEST.sha256` = `6f5ff9a69ba583c2360bd84db92f2ac718c1e572d9092d7a8ed8260cf9aa36f5`.
  `manifest:package:check` → PASS (82 entries); `sync:cli:check` → verified.
- `charter check --strict` with charter b9323cd → `charter: ok`, equal to main's baseline (also ok). Both commit hooks
  (charter, language guard) passed on every commit; nothing bypassed.

## Real-repo smoke (read-only, receipts only under `$TMPDIR/lane-receipts/root`)

A. `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 MISTER_CLEAN_RECEIPT_ROOT=$TMPDIR/lane-receipts/root bun src/cli.ts audit planning . --json`
on this checkout at `4a8017c`: exit 0, `status=pass artifacts=13 findings=0`,
`receipt: WROTE id=mc-receipt:54e1d4d8-… mode=AUDIT families=planning_graph findings=0`; index entry `dirty:false`,
`subject_sha256 879fb727…`. Scratch copy (`git clone` to `$TMPDIR/lane-receipts/copy`, origin URL set to the same remote
so the identity matches), one line inserted at the top of README.md, then
`second-pass $TMPDIR/lane-receipts/copy --against mc-receipt:54e1d4d8-…`: exit 0,
`second-pass: MISSES=0 against=receipt:4a8017ceb74e cleared=0 persisting=0 persisting_rewritten=0 persisting_unseen=0
introduced=0 unresolvable_earlier_bytes=0 flaky=0` (this repository has no planning findings, so nothing to classify).

B. Inside the scratch copy only (the repository was never touched): plant one tracked `email-address` line in
`SMOKE-NOTES.txt`, commit; `audit public-safety <copy> --tracked` → exit 1, `SMOKE-NOTES.txt:1: email-address`,
`receipt: WROTE … mode=AUDIT families=public_safety findings=1`. Insert one line above the offender, commit;
`second-pass <copy> --against <that receipt>` → exit 1,
`persisting  public_safety  email-address  SMOKE-NOTES.txt  anchored bytes found at e3ac4c9f4d29:SMOKE-NOTES.txt`,
`MISSES=0 … persisting=1`. Then commit a second offender in a new file and re-run: `persisting SMOKE-NOTES.txt` plus
`introduced public_safety email-address SMOKE-OTHER.txt | path absent at e3ac4c9f4d29`;
counts `{"persisting":1,"introduced":1, others 0}`, `miss_count 0`. Five receipts in the scratch root; the planted value
appears in none of them (`grep -rl` → 0). `git status` of the worktree clean throughout.

## Decisions taken here (report, not design changes)

- Receipt schema carries an additive `families` list (which families the run examined). Without it an empty family is
  indistinguishable from an unexamined one and a second pass could report false `cleared`. `subject` is
  `{repository_object | null, head_commit, head_tree}` so `--no-subject-hash` keeps the RepositoryObject verbatim or null.
- `prepare --mode GUARD` also writes a receipt, recorded as mode `CLOSE` (the schema enumerates CLOSE|AUDIT|SECOND_PASS and
  the detector run is the same baseline run).
- Second-pass public-safety scope is the registry's `tracked_shippable` scope (the CLOSE scope); an AUDIT receipt taken
  with the untracked walk may therefore see untracked-file findings as `cleared`.
- `flaky` requires the presence sequence to turn at least twice at one identical subject (present, absent, present); a
  single turn is a corrected miss, not flakiness.
- A `custom-denylist-*` finding cannot be searched for in an earlier blob (the terms are not in the receipt); a new-only one
  is reported `unresolvable_earlier_bytes`, never guessed.
- A legacy bundle cannot say whether its subject was dirty; `dirty: null` is treated as dirty (conservative).

## Not done / obligations

- Native-gate failures are not receipt findings (a read-only second pass cannot re-execute gates); the design's
  whole-repo anchor for them is reserved.
- No import into the machine-wide eval store (EV-03); no MCP-server receipts.
- Local full suite not run (brief). `bun run build:raw` not run as one step (host socket test); steps run by hand, twice.
- Test fixtures spawn `git` per fixture repository (init, identity, hermetic hook policy, commits); teardown is one
  recursive `rmSync` per fixture in `afterEach`, no hook timeouts widened. The three files take about three minutes on
  this loaded host, dominated by transform/import time.

## Rework 1 (PM, after the MC/DEV rejection of e7fed741)
- Rejection: MANIFEST.sha256 at e7fed741 did not match the tip's own dist bytes. Root cause found on the 7.2.0 bump the same hour: the dist bundles hash differently per bun version (1.3.9 host default, 1.4.3 Homebrew, 1.4.0 CI pin); only a bun 1.4.0 build reproduces CI (STATE: O-TOOLCHAIN-1).
- Rebased onto main e1f0090 (v7.2.0). `pnpm run build:raw` twice from a clean `dist/` under bun 1.4.0: identical both times — dist/public.js `b79cf045f022f82e…`, dist/stdio.js `8584c95baa9708db…`, bin/mister-clean.js `beec2f4792d3f699…` (unchanged from the committed bin), MANIFEST.sha256 `168948bf690fde39…`. `manifest:package:check` PASS (82 entries).
- Re-run at this tip: `tsc --noEmit` clean; `audit:public` PASS (83 files); `charter check --strict` ok; the three proof files 19/19 with the `test:node` flags and `MISTER_CLEAN_SOURCE_DEVELOPMENT=1`.
- Only MANIFEST.sha256 and this section changed in the rework.
