# LANE second-pass-flaky-per-family — flaky history per family (O-SP-FLAKY-1)

Worktree `~/.config/superpowers/worktrees/mister-clean/flaky-per-family`, branch `fix/second-pass-flaky-per-family` from
main `890687a26e9ce13d1ed5f3b65fbf4836285c0543`. Brief: `BRIEFS/LANE-second-pass-flaky-per-family.md`. DONE list committed
first as `charter/DONE/second-pass-flaky-per-family.md` (`5aa7a20`); it did not grow. Toolchain: bun 1.4.0 for every
packaged byte (`bun --version` → 1.4.0).

## Defect and fix

`flakyFingerprints` counted presence turns of a fingerprint across every receipt of one identical subject. Five
single-family AUDIT receipts on one subject therefore read, for a public_safety fingerprint, absent (planning_graph),
present (public_safety), absent (github_actions, …): two turns, and every correct `cleared` row was stamped `flaky`.

Fix in `src/closeout/second-pass.ts` only (plus one README sentence):
- `FlakyHistoryEntry { receipt_id, subject_sha256, families, findings[{fingerprint, family}] }` replaces the
  `{subject_sha256, fingerprints}` history entry; `runSecondPass` builds it from the receipts it already reads.
- For each identical subject and each family F, only receipts whose `families` include F form the sequence; a receipt
  that did not run F contributes no turn. The ≥3-receipts / ≥2-turns rule is unchanged. SECOND_PASS receipts carry the
  families they re-audited and count like audit receipts of those families (no special case needed).
- `flakyFingerprints` returns `Map<fingerprint, FlakyEvidence { family, receipt_ids }>`; `classifySecondPass` takes that
  map and the flaky row basis reads `alternates across <family> receipts <id, id, id> of one identical subject;
  underlying: <class>`. No receipt schema change; `second-pass` output shape unchanged.

## Proofs: green unmutated, mutant RED, restored

Test command (proofs 1–4 live in `src/closeout/second-pass.test.ts`):
`nice -n 10 env MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run --allowOnly=false
--no-file-parallelism --testTimeout=120000 src/closeout/second-pass.test.ts` → 11/11 on the tip. Pre-mutation
SHA-256 of `src/closeout/second-pass.ts` `2e5f0f8548e1bd1d802747dad1795e3c30bb46d85b358c614d50d14624cea156`; after each
mutant `git checkout -- src/closeout/second-pass.ts` then `shasum -a 256 -c` → OK.

| # | Proof (test name) | Mutant applied | Observed |
|---|---|---|---|
| 1 | family-scoped-history | `const runs = receipts;` (family filter dropped) | RED: `expected Map{ 'x' => … } to deeply equal Map{}`; also RED on proofs 3 and 4 (3 failed / 8 passed) |
| 2 | two-turns-within-family | `if (turns >= 3)` | RED: `expected Map{} to deeply equal Map{ 'x' => … }`; the pre-existing flaky test and proof 4 also RED (3 failed / 8 passed) |
| 3 | cli-cleared-not-flaky | same mutant as 1 | RED: row `"classification": "cleared"` expected, `"flaky"` received (counts cleared 0, flaky 1) |
| 4 | flaky-basis-names-family-receipts | `receipt_ids: receipts.map(…)` (every receipt of the subject) | RED: `receipt_ids` received `mc-receipt:pg-1`, `mc-receipt:pg-2` (1 failed / 10 passed) |

Proof 3 through the real CLI (`bun src/cli.ts`, `MISTER_CLEAN_SOURCE_DEVELOPMENT=1`, `MISTER_CLEAN_RECEIPT_ROOT=$TMPDIR/flaky-lane/receipts-a`,
scratch repository `$TMPDIR/flaky-lane/repo-a` with one committed README and an untracked `notes.txt` holding one
`email-address` value):

```
audit planning <repo>        → planning: NOT_APPLICABLE artifacts=0 … findings=0; receipt mc-receipt:048103bc-… families=planning_graph findings=0
audit public-safety <repo>   → notes.txt:1: email-address; FAIL (1); receipt mc-receipt:dfd0eb80-… families=public_safety findings=1
second-pass <repo> --against mc-receipt:dfd0eb80-…
  receipt: WROTE id=mc-receipt:606817e5-… mode=SECOND_PASS families=public_safety findings=0
  cleared  public_safety  email-address  notes.txt  earlier finding not observed by the second pass
  second-pass: MISSES=0 against=receipt:9379f72558c3 cleared=1 … flaky=0   (exit 0)
index: AUDIT [planning_graph] subject=a1c357ef0383; AUDIT [public_safety] subject=a1c357ef0383; SECOND_PASS [public_safety] subject=a1c357ef0383
```
Three receipts on one identical subject, public_safety absent/present/absent across them: the field defect shape. Under
mutant 1 this same sequence is `flaky` (the vitest proof 3 drives `runCli` with an injected store and shows the flip).

The brief's literal order was also run (`$TMPDIR/flaky-lane/repo-b`, `receipts-b`): `audit public-safety` (1 finding),
`audit planning`, `rm notes.txt`, `second-pass --against <public-safety receipt>` → `cleared … flaky=0`, exit 0. It is
green with and without mutant 1 and so is not the proof: deleting the file changes the subject (index subjects
`6a07420daadf`, `6a07420daadf`, `cadbdd99eb08`), leaving two receipts on the first subject, and present/absent/absent is one
turn anyway. The planted value appears in no receipt of either root (`grep -rl` → 0). Scratch removed after the lane.

## Gates (all on the tip)

- `tsc --noEmit` → 0 (after `bun run build:materials` generated `src/generated-materials.ts`, ignored).
- Proof 5, four files with the `test:node` flags under `nice -n 10`: `src/closeout/second-pass.test.ts` 11,
  `src/run-receipt.test.ts`, `src/closeout/finding-anchors.test.ts`, `src/skill-contract.test.ts` 43 → 66/66 after the
  build (before the build the three skill-contract tests that compare `bin/mister-clean.js` and the manifest with
  `dist/` were red in this fresh worktree, as expected; they are green on the built, committed bytes).
- `bun run audit:public` → `prospective package public-safety: PASS (83 files)`.
- `charter check --strict` (charter b9323cd) → `charter: ok`.
- SKILL.md unchanged: 19,975 bytes.
- Packaged bytes changed (`bin/mister-clean.js` bundles second-pass). `rm -rf dist && pnpm run build:raw` twice under bun
  1.4.0, both exit 0; hash list of every `dist/` file plus `bin/mister-clean.js` and `MANIFEST.sha256` (25 entries) identical
  (`cmp` → IDENTICAL), list sha256 `d0055139f06285f72a3038530353d631f078a8fb1e5a356df197a599f8db0e7b` both times.
  `bin/mister-clean.js` = `dist/cli.js` = `bec2de205e33af364abb280541052ef5926abfeacd9f60077b37e9f3a41d8eaa`;
  `dist/public.js` `6c1fa211d48e67a428ab005c949945418dd790835a42ac0a05b51f5b7653f22d` (unchanged from 7.3.0);
  `dist/stdio.js` `b65d5ed514d39fee8ec75842178b9e6995006d54b5585b0ae8adbc6ba00042bb` (unchanged from 7.3.0);
  `MANIFEST.sha256` `81bfd1bcd3b0e9be8a46e2c530809342ba7dec79813997ec7f2d3abdb365c2e3`.
  `pnpm run manifest:package:check` → `manifest: PASS (82 entries)`.

## Full suite: `nice -n 10 pnpm run test:node` (once, at the end)

Run 2026-11-03T09:18:15Z → 09:47:30Z on this host at load 12–15 (other lanes building concurrently), bun 1.4.0 on PATH,
log `$TMPDIR/flaky-lane/test-node.out`. Result: **49 files, 45 passed / 4 failed; 886 tests, 877 passed / 9 failed**
(1753 s). Every red is outside this lane's surface; none is in `second-pass`, `run-receipt`, `finding-anchors`, `cli` or
`skill-contract`. Classification of each red:

| File | Red | Cause seen in the log | Class |
|---|---|---|---|
| `scripts/verify_generated_candidate.test.ts` | 5 tests | `git commit` inside the isolated candidate capsule refused: `lang-guard: this commit adds untyped code` (host-global hook; STATE "capsule commits refused by the host-global language guard") | environment |
| `scripts/run_clean_ci.test.ts` | 2 tests | capsule `pnpm` build exited 128 (same capsule-commit refusal); the bounded Node-matrix timeout test `expected false to be true` under the same capsule | environment |
| `scripts/release_path.test.mjs` | 1 test | the real build inside an external Git capsule exceeded 120 s at load 12–15, then the 10 s hook timeout | environment (load; capsule class) |
| `src/closeout/execution-lease.test.ts` | 1 test | killed-owner supervised child tree test (`acquireRepositoryVerificationLease`) in the operator shell; STATE: "socket and process-kill tests fail in the operator shell" | environment |

No candidate red. Hosted CI on the pushed branch is the full-suite arbiter, as for the previous lanes (CI 882/882 on main
at 7.3.0). Merge check before push: `git fetch origin` → `origin/main` still `890687a` (the lane base), nothing to merge.

## Merge of main 56c00cc (PM request after the first push)

`git fetch origin && git merge --no-edit origin/main` brought in PR #50 (public-safety provenance) and PR #51 (bun pinned
in `.bun-version`; `manifest --package` refuses a mismatched bun). Only `MANIFEST.sha256` conflicted; no file of this lane
was touched on main, and `pnpm-lock.yaml` / `package.json` are unchanged from the base. Resolution: `bin/mister-clean.js`
and `MANIFEST.sha256` regenerated by two clean `rm -rf dist && pnpm run build:raw` runs under bun 1.4.0, both exit 0,
25-entry hash lists identical (`cmp` → IDENTICAL), list sha256 `bc5e6dbca469f1a6c1f4da7d8b17b1bb623bff0cf86f109d5a0091606a010c07`
both times: `bin/mister-clean.js` = `dist/cli.js` `b78293d52a562fb9c2f1c3820951fe937618f8ed832f677c4058f49aa5e27916`,
`dist/public.js` `1e1601727941634e72c93c692b3016b9455c4d7a0d83dfc190fbd0571fad4c79`, `dist/stdio.js`
`e6ae7768f6540fcc1679ad185e72ca8ec1009a36c2ee8197a98f0f006e38757b`, `MANIFEST.sha256`
`d7999ea692541706131776936103952657beb55028114de6a4f26111fe07c225`. `manifest:package:check` → PASS (82 entries).
On the merged tree: `tsc --noEmit` 0; `src/closeout/second-pass.test.ts` (11, the four proofs included),
`src/skill-contract.test.ts` (43), `src/toolchain-pin.test.ts`, `src/run-receipt.test.ts`,
`src/closeout/finding-anchors.test.ts` → 70/70; `charter check --strict` ok; `audit:public` PASS (83 files); SKILL.md
19,975 bytes. The full `test:node` line above is from the pre-merge tip `2de1c4c`; it was not re-run after the merge (not
requested); hosted CI on the pushed tip is the arbiter.

## Decisions taken here (report, not design changes)

- Proof 3 is ordered planning, public-safety, second-pass with no deletion, so the three receipts share one subject and
  the mutant can go RED (see above). The clearing relies on the already-recorded scope difference (AUDIT walks untracked
  files; `second-pass` scans tracked paths), which this lane does not change.
- `flakyFingerprints`' signature changed (history entries carry receipt id, families and per-finding family; the result is
  a map with evidence). It is an internal export; the pre-existing unit test was rewritten to the new shape with the same
  expectations plus receipt ids.
- Families iterate over `RECEIPT_FAMILIES` so the result order is deterministic; a fingerprint flaky on any one identical
  subject is flaky for the row, as before.

## Not done / obligations

- The AUDIT-vs-second-pass public-safety scope difference stays as recorded in `reports/LANE-run-receipts.md`.
- No pruning of receipt history; `flakyFingerprints` reads every receipt of the repository identity on each second pass.
