# LANE rotate-local-stores (owner decision 2026-11-04; SEM-STATE-8CF757A62803, SEM-STATE-C6FB0796C5F5)
Author: Claude dev subagent dev-intake (Claude Opus 5.5). Branch `feat/rotate-local-stores` from main 6a42b5f. The owner decision is f6d76e0. DONE list: `charter/DONE/rotate-local-stores.md`, committed next (c365d57). Toolchain: bun 1.4.0.

## Change
- **New `src/sealed-segments.ts`.** The live segment keeps the store's historical file name, so today's single file simply becomes the first live segment. Sealing happens before a write that would cross the cap:
  1. The live segment is renamed to `<base>.NNNNNN.jsonl` and made read-only (0400).
  2. The segment is recorded in `<base>.segments.json` through a temp file and rename. The entry holds sha256, bytes, records, first and last key, optional groups and an optional per-segment key index (`<base>.NNNNNN.keys.json`, read-only, digest in the manifest).
- **Crash recovery.** If a crash falls between the two steps, the next open finds the numbered file without a manifest entry and completes the entry from that file's bytes.
- **Never deleted.** Sealed segments are never deleted or rewritten. A digest mismatch on a segment or key index is `SealedSegmentTamperedError` (`code: "sealed_segment_tampered"`), never skipped. The module itself never appends, so it raises no finding of its own.
- **Journal.** `INVOCATION_JOURNAL_SEGMENT_MAX_BYTES` is 8 MiB. That is about 25,000 receipts, roughly three times the largest journal seen in use (2.7 MB), so seals are rare while re-reads stay small.
  - Construction now reads the manifest and the live segment only. Previously it read the whole file.
  - The reader walks segments one at a time with the same per-line rules. Cross-line checks, such as terminating an unknown invocation, span segments.
  - Error positions keep the old wording for the live segment, and name the file for sealed ones.
- **Receipt index.** `RECEIPT_INDEX_SEGMENT_MAX_BYTES` is 8 MiB.
  - Lookup by id reads the manifest and the live segment, then key indexes newest first, and only the sealed segment that holds the id.
  - `forRepository` skips sealed segments whose groups lack the repository digest.
  - `index()` walks every segment.
  - Receipt files are never moved or pruned.
- **Test seams.** Both store constructors take optional `segmentMaxBytes` and `betweenSealSteps`, used by the tests only. Every test uses temp roots under the per-run temp directory, and asserts it is not under `~/.local/state`.

## How the detector recognises the bound (proof 7)
The detector flags a file that contains an append call and long-lived-state wording, unless the file also contains a bound word. The bound words are `compact`, `evict`, `expire`, `max_age`, `max_entries`, `max_size`, `maxSize`, `prune`, `retention`, `rotate` or `ttl`, as whole words, anywhere in the file, comments included. The finding ID hashes the first append-matching line. In both files that is the `node:fs` import, which this lane leaves byte-identical, and every name in it is still used.

Two consequences, stated plainly:
- A name like `INVOCATION_JOURNAL_SEGMENT_MAX_BYTES` is **not** recognised, because `\bmax` fails after `_` and `bytes` is not in the list.
- A comment saying "rotate" **would** clear the finding with no bound at all.

So the comments in both store files avoid every bound word. The only matching token in each file is the real `maxSize:` argument passed to `sealLiveSegmentIfFull`, the function that enforces the cap. Removing that call brings back the exact IDs. Follow-up for the detector: the bound check should require a bound token in code that reaches the append, not anywhere in the file.

## Proofs (each green, mutant RED, restored by copying saved originals; `git status` clean after each)
Test file: `src/local-store-rotation.test.ts`. Run with `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run src/local-store-rotation.test.ts -t "<filter>"`.

| # | filter | green | mutant | mutant result |
|---|---|---|---|---|
| 1 | seals at the cap | journal and index: live ≤ cap after every write; ≥ 2 sealed, read-only, manifest sha256, bytes, records, first and last match | no sealing | RED: expected 2080 to be ≤ 2048 |
| 2 | keeps every record | 60 journal records over ≥ 10 seals, all read, counts sum; 30 receipts all listed and readable | delete the oldest sealed segment on seal | RED: segment 000001 missing |
| 3 | lookup by id | id in the oldest of ≥ 3 sealed index segments; reads = manifest, live, key indexes, and exactly that one sealed segment | read every segment (`index().find`) | RED: 7 sealed segments read, expected 1 |
| 4 | one byte changed | one letter changed in a sealed journal segment and in a sealed index segment: typed refusal | skip the digest check | RED: no throw; the changed record was accepted |
| 5 | crash between | crash after the rename, before the manifest write; restart completes the entry, every appended record reads, appending continues | manifest written first without temp+rename | RED: ENOENT on segment 000001 |
| 6 | existing single-file | today's journal (legacy and current starts, link, terminal) and today's index read unchanged; appends keep the original bytes as a prefix; the first sealed segment starts with them | n/a | n/a |

Proof 7, `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun src/cli.ts audit semantic . --json` (SEM ids):
```
before (6a42b5f):            SEM-EXECUTABLE-CBB67799E249, SEM-STATE-8CF757A62803 (journal #line-1), SEM-STATE-C6FB0796C5F5 (run-receipt #line-11)
after (tip):                 SEM-EXECUTABLE-CBB67799E249
mutant (seal call removed
  from both stores):         SEM-EXECUTABLE-CBB67799E249, SEM-STATE-8CF757A62803, SEM-STATE-C6FB0796C5F5
```

## Regression (proof 8)
- `tsc --noEmit` 0. `charter check --strict` (b9323cd) ok. `audit:public` PASS (83 files).
- Two clean `build:raw` runs under bun 1.4.0 gave identical 25-entry hash lists. `bin/mister-clean.js` is now 15193c35… and `dist/control-plane.js` b56369b5…. MANIFEST.sha256 is 7f3b07ba…. `manifest:package:check` PASS (82 entries). Generated files are committed in 299d134, and `git status` is clean after it. SKILL.md is unchanged at 19,975 bytes.
- run-receipt, second-pass, journal, skill-contract and rotation tests pass (65/65 on the final rerun).
- `test:bun` first run at host load 60-100: 209/214. The 5 reds were timeouts (4 at 5 s, 1 at 20 s) in migrations, sqlite-store, snapshot-producer, evaluation-recorder and evaluation-intake e2e. The first three never touch either store.
  - **Classification: environment (host load), not this lane.** The same files on a detached baseline at 6a42b5f reproduced 4 of the timeouts at load ~85. A rerun passed 51/51 on both the baseline and the tip. second-pass took 16.6 s on both. The baseline worktree was created and then removed with `git worktree remove`; this is recorded in the lifecycle ledger.
  - In the same first run, the node-side "keeps every record" proof took 7.3 s against vitest's 5 s default. The rotation describe now has an explicit 60 s budget (a037682).
- origin/main had not moved past 6a42b5f at freeze.
- A targeted node run at the same load also had the second-pass test "classifies persisting, persisting_rewritten and cleared" time out (7 s against 5 s). On rerun, second-pass passed 11/11 on both the baseline and the tip, in 16.6 s each.
- Full `pnpm run test:node` on a037682, which holds the final product, test and generated bytes (only this report follows): 60 files, 933 tests, 927 passed, 6 failed, 3,242 s. Host load peaked above 125 during the run.

### Classification of the 6 full-suite reds
| test | cause | evidence |
|---|---|---|
| 3 in `src/closeout/bundle.test.ts` (native-gate mutation fixtures) | environment: 30 s timeouts under load | passed on rerun at load ~20; listed in the lifecycle ledger as load-sensitive since Lane 3b |
| 2 in `scripts/run_clean_ci.test.ts` (cold clone; bounded Node-matrix timeout) | **pre-existing on main, not this lane** | capsule commands are killed by their timeout (the supervisor reports 128). Reproduced alone on the tip, and identically on a detached baseline at main 6a42b5f, with the same 3 reds (the third, "waits for a rejected supervised run", also fails on both). The file imports nothing this lane changed. |
| `scripts/release_path.test.mjs` real build in a Git capsule | environment: timeout (120 s in the suite; 1,200 s on rerun) | the lifecycle ledger has recorded this test as red since Lane 1 on budget; not re-run on a baseline |

Follow-up obligation: `run_clean_ci` fails on main 6a42b5f at moderate load (~15-30). It needs its own lane to find out whether its capsule budget or something on the host regressed. The previous lane's full suite at f1a3014, load ~8, was green.

## Merge and freeze
- origin/main 24954d2 (PRs #69-#72 and the owner decision "S6 evidence is hosted CI on the exact tip; the local full suite is not a gate") merged at f903928. Only the generated `MANIFEST.sha256` conflicted. It and `bin/mister-clean.js` were regenerated by two clean `build:raw` runs under bun 1.4.0 with identical hash lists: bin dd3cd22f…, MANIFEST 366dfbed…. `manifest:package:check` PASS; `git status` clean after the commit.
- On the merged tip: tsc 0; audit:public PASS; charter strict ok; semantic audit lists only SEM-EXECUTABLE-CBB67799E249 (8CF7 and C6FB stay gone); run-receipt, second-pass, journal, skill-contract and rotation tests 76/76.
- `test:bun` 212/214. The 2 reds are 5 s timeouts at load ~20 (the evaluation-intake e2e and evaluation-recorder tests, both reproduced on the baseline under load earlier). Under the new owner decision this is recorded as **indeterminate under load** and not rerun.
- Per that decision, S6 evidence for this lane is the hosted CI `verify` job on the exact pushed tip. The local full suite was not repeated after the merge. The three local capsule reds are obligation O-LOCAL-CAPSULE-1.
