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

# Rework 1 — after MC/QA REJECTED 01b20677

QA's two blocking findings: `bound` overstated verification (a bare verifier digest and a fabricated commit were
reported bound; forged external digests validated), and the repeat floor was taken from the record, never recomputed.
DONE list for the rework committed first as `charter/DONE/slice-zero-eval-case-rework-1.md` (`e81d787`; proof 7's
reopen clause added at `697fa8c` after `charter check --strict` named it, wording only). The five QA probes
(forged-verifier-commit, false-bound, fabricated-external, all-external, zero-replays) are now generic fixtures in
`src/eval-case.test.ts`; the private evidence path is not in any public file.

## What changed (`f8ebca5`)

- Three citation classes, never conflated, each named in the text line and listed in JSON: `bound` (re-verified
  here), `external` (`binding: "external"`; digests recorded from the evidence owner, not re-hashed), `unverified`
  (a bare verifier digest with no local file; a commit sha that is not an object in the checkout, checked with
  `git cat-file -e`). A verifier bound by local file is `{name, kind, path, sha256}` and is re-hashed.
- Agent cards cite their card file by `path` + `sha256`; the file's frontmatter `card_id` and `model_registry_ref`
  must equal the record's (`card_ref_mismatch`), and the ref's export version must equal the pin.
- The replay table is recomputed from the cited tallies TSV (strict 9-column parse; `rows_source_unparsable`):
  per-reviewer sessions, good replays, false rejects, populations at and below the floor, bad passes, the total
  session count, every tallied population carrying the floor's replay count (`replay_floor_mismatch`), and the
  outcome (`met` iff the subject reviewer breached the floor at least once; `replay_floor_not_met` otherwise). Any
  difference from the record's claim is `replay_counts_mismatch` at the exact field. Closes O-EVAL-CASE-1 and -2.
- `--require-bound verifier,base_commit`: an external or unverified citation there is `binding_required`. The
  charter command uses it; `--json` carries `require_bound`, `unverified` and `replay_recomputed`.

## The real record under the new validator (through the built bin, merged tip)

```
$ node bin/mister-clean.js eval-case validate field-evals/2026-10-31-window/cases/CS-001.eval.json --repo . --require-bound verifier,base_commit
ERROR: binding_required $.verifier: external citation; --require-bound verifier demands one re-verified in this repository
ERROR: binding_required $.base_commit: external citation; --require-bound base_commit demands one re-verified in this repository
eval-case: REFUSED case=CS-001 bound=7 external=$.verifier,$.base_commit unverified=none refusals=2 require_bound=verifier,base_commit registry_export=2026.11.03-1
exit=2

$ node bin/mister-clean.js eval-case validate field-evals/2026-10-31-window/cases/CS-001.eval.json --repo .
eval-case: VALID case=CS-001 bound=7 external=$.verifier,$.base_commit unverified=none refusals=0 require_bound=none registry_export=2026.11.03-1
exit=0
```

So **`proven_on` is cleared to `""`**: the strict charter command refuses, correctly. The seven bound citations are the
case file, both card files (frontmatter ids and refs equal), both registry refs against the pin, the tallies and
RC-001; every per-reviewer count, the 13-session total and the `met` outcome were recomputed from
`control-tallies.tsv` and equal the record. What stays external is exactly the verifier and the base commits.

**What would bind them** (the cross-repository artifact; recorded obligation O-EVAL-CASE-3): the evidence owner
publishes a digest-pinned evidence manifest (version + sha256, like the model-atlas export) that lists, for this
replay, the evaluator component digests (`validator_source`, `review_source`, the receipt-tool countercases) and the
base commit per pair set with the session map and its status (recorded or inferred). Mister Clean vendors it under
`customer-tests/` with its pin, the validator re-hashes the vendored manifest and matches the record's external
digests against it, and only then are `$.verifier` and `$.base_commit` `bound`. Until that route exists, a fresh clone
of this repository cannot re-verify them, and `proven_on` stays empty.

## Proofs and observed-RED mutants (all nine on the final module `3d756654…`; each restored and verified `cmp`-identical)

| # | Proof | Mutant | Observed |
|---|---|---|---|
| 1 | fixture-record-binds (original) | `if (actual !== citation.sha256)` → `if (false)` | RED: flipped sha256 exited 0 |
| 2 | agent-cards-count (original) | count check → `if (false)` | RED: `agent_cards_count` absent |
| 3 | verifier-unbound (original) | `verifier_unbound` push deleted | RED: exited 0 |
| 4 | registry-export-mismatch (original) | `ref.version !== pin` dropped | RED: `registry_export_mismatch` absent |
| R1 | bound-means-reverified (false-bound) | bare values pushed to `bound` | RED: `unverified` was `[]` |
| R2 | card-resolution (fabricated refs) | frontmatter comparison skipped | RED: exited 0 |
| R3 | replay-recomputed (zero-replays) | recompute block disabled | RED: exited 0 |
| R4 | require-bound (forged-verifier-commit) | flag loop emptied | RED: exited 0 |
| R5 | file-citations-local (all-external) | `citationShape` returns true for `binding: external` | RED: test failed (no `record_shape`) |
| R6 | real-record-strict | none | exit 2, verbatim above; `proven_on = ""` |

Green: `src/eval-case.test.ts` 10/10 (`MISTER_CLEAN_SOURCE_DEVELOPMENT=1 nice -n 10 node ./node_modules/vitest/vitest.mjs run
--allowOnly=false --no-file-parallelism --testTimeout=120000 src/eval-case.test.ts`).

## Gates on the frozen tip

- Merged origin/main `ef4987a` (PR #59) with `git merge --no-edit`; conflict only in generated `MANIFEST.sha256`.
- Two clean `build:raw` runs under bun 1.4.0: identical hash lists (list sha256
  `3757fa5f58b1a4cd62b2689db4a261dac7ed54f782ed7cd6181c0d626d2981c6`; `bin/mister-clean.js`
  `a25eaa87cae92eb3fad7c48c976c4ec21f013b74a5c73ec854ff5cfd99884343`; `MANIFEST.sha256`
  `eb65091ba0226e297ff938724549d2ed123eb882429443730b19434b0eff92eb`); `manifest:package:check` PASS (82);
  `sync:cli:check` verified.
- `tsc --noEmit` 0; `src/eval-case.test.ts` + `src/skill-contract.test.ts` 53/53; SKILL.md 19,975 bytes = main's;
  `charter check --strict` ok; `audit:public` PASS (83 files); a `git grep` for the source project's name is empty (the name is quoted only in the private evidence root).
- Full `nice -n 10 pnpm run test:node` on `697fa8c` (the frozen bytes minus this report): 920 passed, 5 failed, 58 files, 762 s. The five reds are all `scripts/verify_generated_candidate.test.ts` fixture commits refused by the host-global lang-guard hook (environment class CS-016; the same five MC/QA saw on 01b20677); nothing in this lane. Hosted CI arbitrates.

# Rework 2 — the evidence root and the recompute route (proven_on set from a live run)

DONE list committed first as `charter/DONE/slice-zero-eval-case-rework-2.md` (`bfdea45`; its grep lines reworded at
`de81760` so the public file quotes neither the manifest's header text nor the source project's name: wording only).
Evidence: the evidence owner's RC-001 evidence manifest, revision 2 (source commit `90c6f9a0`, sha256
`a7464d17dd860d8d2d4091b2c325a660255fd02018cfed49f57cd2cbfc3f3cac`). It names the source project, so it is never
vendored into this public repository (G1); it lives in a private evidence root outside every repository, together with
a provenance line (seam, source commit, path, sha256, vendored_at).

## What changed (`de81760`)

- `binding: "pinned_external"` for the verifier and the base commit: the record cites the manifest by seam, source
  commit, bare file name and sha256 (`manifest`), plus the same digests and per-pair-set commits as before.
- `--evidence-root <dir>` (or `MISTER_CLEAN_EVIDENCE_ROOT`): a directory outside the validated repository (inside is
  `evidence_root_inside_repository`, exit 2, before any read). The validator finds the manifest by file name under the
  root (depth ≤ 4), re-hashes it against the cited sha256 (`evidence_manifest_mismatch` when a same-named file hashes
  differently; absent → the citation stays `external`), parses it strictly (`evidence_manifest_unparsable`; the
  composite header is decoded from `algorithm.header`: `bytes_hex` must equal `text` plus one NUL and have the stated
  length; no header constant exists in this source), and checks the record against it: evaluator composite at every
  base commit, the digest set (composite, review, receipt tool) both ways, each pair set's base commit, every manifest
  pair set present, and the session-map basis (`recorded` only when every session was recorded). Class `pinned_external`.
- `--source <seam>=<clone>` (or `MISTER_CLEAN_SOURCE_<SEAM>`): with a bound manifest, the validator reads the manifest's
  listed files at each base commit from the clone through `git show` (read-only), recomputes the composite (header,
  byte-sorted paths relative to the manifest's prefix, u64 big-endian length prefixes), the review digest and the
  receipt-tool digest, and requires each to equal the manifest and the record (`recompute_mismatch`;
  `source_commit_missing` when a commit or file is absent or the path is not a clone). Class `recomputed`.
- `--require-bound` accepts `local`, `pinned_external` and `recomputed`; `external` and `unverified` stay
  `binding_required`. The text line names every class member and whether an evidence root and which sources were used;
  `--json` carries `classes`, `pinned_external`, `recomputed`, `evidence_root` and `sources`.
- `charter.toml`: the command is unchanged and carries no private path; a comment names the two environment variables
  as the command's real infrastructure. README: the classes, the environment variables and how a third party reproduces
  the strict run (obtain the manifest from the evidence owner; optionally clone the seam).

## Live control (through the built bin, merged tip; private paths supplied by environment, never printed here)

```
$ node bin/mister-clean.js eval-case validate field-evals/2026-10-31-window/cases/CS-001.eval.json --repo . --require-bound verifier,base_commit
(no evidence environment)
ERROR: binding_required $.verifier: external citation; --require-bound verifier demands one re-verified in this repository, through an evidence manifest under --evidence-root, or recomputed from --source
ERROR: binding_required $.base_commit: external citation; --require-bound base_commit demands one re-verified in this repository, through an evidence manifest under --evidence-root, or recomputed from --source
eval-case: REFUSED case=CS-001 bound=7 pinned_external=none recomputed=none external=$.verifier,$.base_commit unverified=none refusals=2 require_bound=verifier,base_commit evidence_root=none sources=none registry_export=2026.11.03-1
exit=2

(MISTER_CLEAN_EVIDENCE_ROOT set)
eval-case: VALID case=CS-001 bound=7 pinned_external=$.verifier,$.base_commit recomputed=none external=none unverified=none refusals=0 require_bound=verifier,base_commit evidence_root=set sources=none registry_export=2026.11.03-1
exit=0

(MISTER_CLEAN_EVIDENCE_ROOT and MISTER_CLEAN_SOURCE_SPECIFICATION_PIPELINE set; 2026-11-04T03:55:20Z)
eval-case: VALID case=CS-001 bound=7 pinned_external=none recomputed=$.verifier,$.base_commit external=none unverified=none refusals=0 require_bound=verifier,base_commit evidence_root=set sources=specification-pipeline registry_export=2026.11.03-1
exit=0
```

`--json` on the last run: `status: eval_case_valid`, `classes: { "$.verifier": "recomputed", "$.base_commit": "recomputed" }`.
The recompute read 38 files at each of the two base commits from the local source clone and reproduced the manifest's
composite `ca5ca4da…` and review digest `2b7a1560…` at both, plus the receipt-tool digest `df37fb1c…`; the per-reviewer
table, 13 sessions and `met` outcome were recomputed from `control-tallies.tsv` as in rework 1. **`proven_on` is
therefore set to `2026-11-04`** (`c423a04`): the strict charter command exited 0 on real infrastructure. On a host without
the evidence root the same command refuses, which is the correct answer there.

## Proofs and observed-RED mutants (fourteen on the final module `d1220049…`; each restored and verified `cmp`-identical)

| # | Proof | Mutant | Observed |
|---|---|---|---|
| 1-4, R1-R5 | the nine earlier proofs | the nine earlier mutants | all RED again (same assertions as rework 1) |
| W1 | manifest-pinned | manifest accepted without re-hashing (`found = sameName[0]`) | RED: wrong cited sha256 exited 0 |
| W2 | manifest-values | value comparison skipped | RED: altered verifier digest exited 0 |
| W3 | recomputed | manifest's stated composite trusted instead of recomputed | RED: one-byte-changed clone exited 0 |
| W4 | header-from-manifest | header hard-coded to a constant | RED: the fixture header (`fixture.tree/1`, not the real one) no longer reproduced the fixture composite |
| W5 | evidence-root-outside-repo | containment check dropped | RED: an evidence root inside the fixture repository exited 0 |
| W6 | live-control | none | exit 0 verbatim above; `proven_on` set |

Green: `src/eval-case.test.ts` 15/15. The fixture manifest uses a header text that differs from the real one, so a
header constant in the source cannot pass the fixture; the real header is read only from the manifest at run time.

## Gates on the frozen tip

- Merged origin/main `ea50cb9` (`7bc14ce`, no conflicts); two clean `build:raw` runs under bun 1.4.0: identical hash
  lists (list sha256 `a85eb8129897e9ceaefe67b5d041545607a529bbe086343434c8905825346408`; `bin/mister-clean.js`
  `aa2c5d2265dd84f8d8cea92758340565b0557fce71fbdea2d375b6a6010395aa`; `MANIFEST.sha256`
  `623e903a6a027644b5657cd6307747081f3308cbd6f3f7981094db67e93e5e93`); `manifest:package:check` PASS (82);
  `sync:cli:check` verified.
- `tsc --noEmit` 0; `src/eval-case.test.ts` + `src/skill-contract.test.ts` 58/58; SKILL.md 19,975 bytes = main's;
  `charter check --strict` ok; `audit:public` PASS (83 files).
- Leak greps over src, bin, README.md, charter, field-evals and this report: the manifest's header text, the source
  project's name and the private evidence-root path all absent (the name had appeared in the rework-1 section's gate
  line and in the rework-2 DONE list's grep commands; both reworded here, and recorded as a finding: those strings remain
  in the history of `8e2343d`, `bfdea45` and `de81760`, which only the owner can decide to rewrite).
- Full `nice -n 10 pnpm run test:node` on `c423a04`: 930 passed, 0 failed, 58 files, 630 s, exit 0 (the earlier lang-guard reds are gone: main now carries `.lang-guard-allow`).

## Out of scope (recorded obligation)

- A public, project-free form of the evidence manifest vendored under `customer-tests/` would let a fresh clone reach
  `pinned_external` without the private root; the evidence owner decides whether such a form can exist.

## Freeze for QA: merge with main `31ffc65` (PRs #60-#64)

`git merge --no-edit origin/main` (`f869887`) conflicted only on the generated `bin/mister-clean.js` and
`MANIFEST.sha256`, regenerated by two clean `build:raw` runs under bun 1.4.0: identical hash lists (list sha256
`94af4936e1073ccc94acb08d192f54096ff9b8046ec1bd36ce1f97b1834b1d23`; `bin/mister-clean.js`
`ab58ba9aeae8405a0d154cfe619067543df78d8a8ed6fe68b28dd5ed50a81278`; `MANIFEST.sha256`
`b46f94b86e1797e18bcc6316d99b0a36551710b629d31a7ae6c8b4a29962d06f`); `manifest:package:check` PASS (82);
`sync:cli:check`: verified. On the frozen tip: the live control through the bin with the evidence environment →
`eval-case: VALID case=CS-001 bound=7 pinned_external=none recomputed=$.verifier,$.base_commit external=none
unverified=none refusals=0 require_bound=verifier,base_commit evidence_root=set sources=specification-pipeline
registry_export=2026.11.03-1`, exit 0 (2026-11-04T14:15:00Z); without the environment → `binding_required` on both,
exit 2. `tsc --noEmit` 0; `src/eval-case.test.ts` + `src/skill-contract.test.ts` 58/58; SKILL.md 19,975 bytes = main's;
`charter check --strict` ok; `audit:public` PASS (83); the three leak greps empty. `src/eval-case.ts` is byte-identical
to `de81760` (the mutant runs and the 930/930 suite on `c423a04` stand for it; the merge touched no lane file).
