# LANE slice-zero-eval-case — the durable eval case and `eval-case validate` (frozen)

Worktree `~/.config/superpowers/worktrees/mister-clean/slice-zero`, branch `feat/slice-zero-eval-case` from main
`fca67edf224a6877f3d181307392ea1f36336016` (v7.3.0), merged with origin/main `890687a` (PR #49) before the final build.
Brief: the PM's `LANE-slice-zero-eval-case.md`. DONE list committed first as `charter/DONE/slice-zero-eval-case.md`
(`db3d810`); it did not grow. Author: Claude dev subagent (Claude Fable 5.1). Toolchain: bun 1.4.0 for every packaged byte.

## What was built (additive only)

- `src/eval-case.ts`: schema `mister-clean.eval-case/1` (exact key sets, enumerations, digests) and the read-only validator
  `validateEvalCase`. A record cites the narrative case file, the card it derives from and the tallies its counts come from
  (repository-relative path plus sha256, bound by re-hashing under `--repo`), exactly two agent cards as
  `<registry card id>@<export version>` (one `subject`, one `control`), the verifier, the base commit, and the replay
  (`floor` k/n, `sessions`, `outcome`, per-reviewer rows in RC-001's column names). Registry refs must name the export
  pinned by `customer-tests/model-atlas/registry-join.json` (`artifact.version`); the pin is read, never copied.
  The verifier and base commit take three forms: bound by digest; `binding: "external"` (repository seam, evidence
  location, digests: an evaluator pin with named components; one base commit per control-pair set with `session_map`
  `recorded` or `inferred`; reported under `external`, never re-hashed); or `binding: "unbound"` with a reason, which is
  a typed refusal. `outcome` is not free text: `met` iff the subject's rows record at least one floor breach.
- `src/cli.ts`: `eval-case validate <file.eval.json> [--repo <root>] [--json]`; exit 0 with `eval_case_valid`, 2 with a
  typed refusal listing each citation that did not bind (`path_missing`, `sha256_mismatch`, `registry_export_mismatch`,
  `agent_cards_count`, `verifier_unbound`, `base_commit_unbound`, `registry_pin_missing`, `record_shape`). It runs before
  the runtime attestation, like `attest`: `bin/mister-clean.js` is never a source-development entrypoint, so without
  this the charter command could not run from a checkout; the verb asserts nothing about the runtime. It writes nothing
  to the repository (the direct CLI still appends its invocation to the machine-local journal, as every verb does).
- `field-evals/2026-10-31-window/cases/CS-001.eval.json`: the real record from RC-001's `data/control-tallies.tsv`.
- `charter/charter.toml`: `command = "node bin/mister-clean.js eval-case validate field-evals/2026-10-31-window/cases/CS-001.eval.json --repo ."`,
  `proven_on = "2026-11-03"` (from `date -u`, after the command exited 0 on the real record through the built bin).
- README section "Eval cases"; the CLI usage string. SKILL.md untouched (19,975 bytes before and after).
- `src/eval-case.test.ts`: proofs 1 to 4 plus one test for the external forms.

## The real record: two passes

Pass 1 (commit `ba6c723`): verifier and base commit stated `unbound`, because the repository's own records carry
neither (RC-001 and the reviewer-controls README remove the source project's paths, run ids and commits; the
session-to-source map lives under the private data root). Verbatim output of the charter command through the built bin:

```
ERROR: verifier_unbound $.verifier: RC-001 records the gate's rule and that stored verdicts were reproduced by the source project's own scoring code (149 of 149), but neither the gate script's bytes nor its sha256 appear in this repository; the session-to-source map with each session's control-pair sha256 lives under the private data root (field-evals/2026-11-01-reviewer-controls/README.md, rules).
ERROR: base_commit_unbound $.base_commit: RC-001 and the reviewer-controls ledger remove the source project's paths and run ids and record no commit; CS-001's replication plan names the commit before the worker's change without a sha.
eval-case: REFUSED case=CS-001 bound=5 refusals=2 registry_export=2026.11.03-1
exit=2
```

Pass 2 (commit `2b2cfdb`): the evidence owner (A/EXEC-PM) supplied the provenance from the source project's tracked
WAVES snapshot: no constant gate script existed (per-session drivers differ); the constant was the evaluator pin
(validator_source `ca5ca4da…`, review_source `2b7a1560…`, receipt-tool countercases `df37fb1c…` as the mutant-check
analogue, recomputed at both base commits); base commits per pair set (A `10acd276…`, B `9a5d527a…`, same 24 controls);
the S-nn to session map is INFERRED from the tallies, not recorded. The record carries these as `binding: "external"`
with `session_map: "inferred"`. The source project stays generic (`specification-pipeline`): its name appears nowhere
in this public repository and the field-evals ledger's rule is that it is unnamed and its paths removed (G1). Verbatim:

```
$ node bin/mister-clean.js eval-case validate field-evals/2026-10-31-window/cases/CS-001.eval.json --repo .
eval-case: VALID case=CS-001 bound=5 external=2 refusals=0 registry_export=2026.11.03-1
exit=0
```

`--json`: `status: eval_case_valid`, `bound: [$.field_case, $.agent_cards[0].model_registry_ref,
$.agent_cards[1].model_registry_ref, $.replay.rows_source, $.derived_from]`, `external: [$.verifier, $.base_commit]`.

Caveats carried into the record and this report: the agent cards AC-003 and AC-006 bind by registry ref (their
`model_registry_ref` lines equal RC-001's binding); RC-001 did not record the reviewers' harness or reasoning level, so
those are the field-window cards' values, not measured by the replay. `outcome: "met"` rests on one floor breach
(S-13 P03, 1 of 3 passes, source `failure_line`); the per-reviewer rows carry the full counts so it is not over-read.

## Proofs and observed-RED mutants

Green: `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 nice -n 10 node ./node_modules/vitest/vitest.mjs run --allowOnly=false
--no-file-parallelism --testTimeout=120000 src/eval-case.test.ts` → 5/5 (4 proofs plus the external-form test). Each
mutant was applied with `sed -i ''` on one line of `src/eval-case.ts`, the proof run with `-t "proof N"`, the failure
observed, the file restored from a scratch copy and verified byte-identical (`cmp`; sha256 `0d37e241…` before and
after). The same four mutants were also run RED on the pass-1 module (`32f33485…`).

| # | Proof | Mutant | Observed |
|---|---|---|---|
| 1 | fixture-record-binds | `if (actual !== citation.sha256)` → `if (false)` | RED: flipped sha256 exited 0 instead of 2 |
| 2 | agent-cards-count | `if (cards.length !== 2) refusals.push` → `if (false) refusals.push` | RED: refusal codes lacked `agent_cards_count` |
| 3 | verifier-unbound | the `verifier_unbound` push line deleted | RED: unbound verifier exited 0 instead of 2 |
| 4 | registry-export-mismatch | `ref.version !== pin` dropped from the condition | RED: stale export exited 0 instead of 2 |
| 5 | real-record-readback | none (read-back; recorded verbatim above); the charter command runs as written from the worktree root | exit 0 |
| 6 | gates-unchanged | none | below |

## Gates (all on the frozen tip)

- `tsc --noEmit` → 0 (after `bun run build:materials` generated the ignored materials module).
- `src/skill-contract.test.ts` → 43/43; `wc -c SKILL.md` → 19,975 before and after.
- Packaged bytes, bun 1.4.0, twice from `rm -rf dist` + `pnpm run build:raw` on the merged tree: hash lists (every
  `dist/` file plus `bin/mister-clean.js` and `MANIFEST.sha256`, 25 entries) identical, list sha256
  `c8bbfd0f9806cb664a9e4b95cb4c8063c9fd9bbe9c11953503d54d2a8a4e6545`; `bin/mister-clean.js`
  `8275dd8167e2f64ff87d4501b2d7b9b222c7f2e998a26c4b592d9dee35a1ebd7`; `MANIFEST.sha256`
  `37125ae655f618284bacd08b36cda62bfb2fe87633f1da6e2ba26433af5a7f84`; `manifest:package:check` → PASS (82 entries);
  `sync:cli:check` verified. (Pass-1 build, pre-merge: list `38b12106…`, bin `c349a247…`, also identical twice.)
  The bin diff beyond the new verb is the bundler renaming colliding identifiers (`count`→`count2`, `sep21`→`sep22`);
  deterministic, as the identical hashes show.
- `bun run audit:public` → `prospective package public-safety: PASS (83 files)`.
- `charter check --strict` (b9323cd) → `charter: ok` at every commit; both commit hooks passed, nothing bypassed.
- Merge: `git merge --no-edit origin/main` (never rebase); the only conflict was `MANIFEST.sha256`, resolved by
  regenerating it (`manifest:package`, then `--check` PASS) and again by the final double build.

## Full `pnpm run test:node` (`nice -n 10`, once per pass)

Run 1 (pass-1 bytes, pre-merge): 879 passed, 7 failed, 50 files, 1,768 s. Every red is an environment class, none in this lane:
- `scripts/verify_generated_candidate.test.ts` (5): the host-global lang-guard pre-commit hook refuses the tests' own
  fixture commits ("this commit adds untyped code"); known class (CS-016; STATE: "capsule commits refused by the
  host-global language guard").
- `scripts/release_path.test.mjs` real build in a capsule: timed out at 120 s (476 s under load); baseline red since Lane 1.
- `scripts/run_clean_ci.test.ts` cold clone: supervised `pnpm` exited 128 inside the capsule (same hook class).

Run 2 (lane bytes `2b2cfdb`, after the first merge): 881 passed, 6 failed, 50 files, 1,030 s. Reds: `scripts/verify_generated_candidate.test.ts` (5), the same host lang-guard hook class; `src/closeout/native-gates.test.ts` "fails closed with NativeGateGitTimeoutError when a snapshot Git child makes no progress" (`expected [ Array(1) ] to deeply equal []`), a native-gate snapshot timing test under host load (this lane touched nothing under `src/closeout`; the lifecycle ledger records native-gate tests exceeding their budgets at load). Run 1's `release_path` and `run_clean_ci` reds did not recur. Hosted CI arbitrates the merged tree.

## Out of scope (recorded obligations)

- O-EVAL-CASE-1: recompute the per-reviewer counts from `replay.rows_source` instead of accepting them as declared.
- O-EVAL-CASE-2: a `card_id` is not yet resolved to its card file; bind `agent_cards[].card_id` to the card's path+sha256
  and check its `model_registry_ref` equals the record's.
- O-EVAL-CASE-3: external digests are accepted on the evidence owner's word; a cross-repository re-hash route (the seam
  publishing its digests as a customer-test artifact) would make them bound rather than external.
- The CS-001 treatment A/B/C replays themselves; the agent-card schema (G3); SKILL.md documentation of the verb (budget full).

## Final tip after the 7.4.0 merge

Main moved to `a1f39eb` (7.4.0) while run 2 executed. `git merge --no-edit origin/main` (never rebase) conflicted only
on the generated `bin/mister-clean.js` and `MANIFEST.sha256`; `src/cli.ts` and README auto-merged. Both generated
files were regenerated by two clean `build:raw` runs under bun 1.4.0 (now also `.bun-version`): hash lists identical,
list sha256 `1a2bc6675686f1ff5f943be5e9e120014c2cc2f1f4ded905dec205189e1321f1`; `bin/mister-clean.js`
`69693b43b70f201b3ab2ff596dc595d9af5148c739c3e5e68d12ed320d05c97a`; `MANIFEST.sha256`
`ac64dd2a28bffecf7f93f5f226053f709f2fbce241039a347b0617004d5c60b2`; `manifest:package:check` PASS (82 entries);
`sync:cli:check` verified. On the merged tip: the charter command through the bin → `eval-case: VALID case=CS-001
bound=5 external=2 refusals=0 registry_export=2026.11.03-1`, exit 0; `src/eval-case.test.ts` + `src/skill-contract.test.ts`
→ 48/48; SKILL.md 19,975 bytes, equal to origin/main's; `charter check --strict` ok; `audit:public` PASS (83 files).
`src/eval-case.ts`, `src/eval-case.test.ts`, `CS-001.eval.json` and `charter.toml` are byte-identical to `2b2cfdb`, so
the mutant observations and run 2 stand for them; the full suite was not re-run on the merged tree (PM decision:
one run suffices, hosted CI arbitrates).

## Freeze: merge with main `d70f722` (PRs #56, #57)

Same procedure: `git merge --no-edit origin/main` conflicted only on the generated `bin/mister-clean.js` and
`MANIFEST.sha256`; two clean `build:raw` runs under bun 1.4.0 regenerated both with identical hash lists (list sha256
`8b42b5e02fc5339c2af53d7de0e6689782cc423e6ce9cbbe42ddfabe240d8266`; `bin/mister-clean.js`
`95a49b2abaaf81847cc23438648a4dda4f4127e45ab45f8f70bfa70eba252ad1`; `MANIFEST.sha256`
`333adc5bf9339cde4229c489b0ce949697db132f4f3617b57285355849a4d464`); `manifest:package:check` PASS (82 entries);
`sync:cli:check` verified. On the frozen tip: the charter command through the bin → `eval-case: VALID case=CS-001
bound=5 external=2 refusals=0 registry_export=2026.11.03-1`, exit 0; `src/eval-case.test.ts` + `src/skill-contract.test.ts`
→ 48/48 (under the new `vitest.config.ts` per-run temp root); SKILL.md 19,975 bytes, equal to main's; `charter check
--strict` ok; `audit:public` PASS (83 files). The lane's own files are still byte-identical to `2b2cfdb`. No full suite
on this merge (PM decision; hosted CI arbitrates).
