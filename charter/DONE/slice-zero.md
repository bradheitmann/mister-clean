# DONE: slice-zero (the offline scorer; replaces the CS-001 replay list)
Slice: this list replaces the earlier Slice Zero list (one field failure, CS-001, replayed with its control agent). That list was never dispatched on main; its last attempt was rejected on 2026-11-04 and the owner decision of that day says Slice Zero is redesigned. Decision D2 of 2026-11-10 names the new scope: an offline scorer first (test cases plus saved, identity-bound model answers, negative controls, reopened results, including one decision-shaped task with a label oracle). The record of that decision and of how it reached this repository is charter/owner-decisions/2026-11-10-slice-zero-offline-scorer.md, added by this slice. An offline run is not presented as compliance with the old list. This slice proves the scorer. It does not prove fresh generation, judge accuracy, or any model's quality.

What is built (strict TypeScript, run with bun, outside src/ and outside the published package, beside the existing ablations/ tool):
- evals/offline-scorer/score.ts: reads one case-set file (`eval-case-set/1`) and one JSONL file of saved answers (`eval-answer/1`), calls no model, and prints one report (`eval-score/1`). `S` below stands for `bun evals/offline-scorer/score.ts`.
- Two synthetic case sets in evals/offline-scorer/slice-zero/: json-validity (8 cases, kind `label`, labels `valid` and `invalid`, the decision-shaped task) and canonical-json (6 cases, kind `exact`). Each case carries its full prompt and that prompt's sha256. Each set carries its floors: 3 attempts per case, and at least 7 of 8 (json-validity) or 5 of 6 (canonical-json) cases passed.
- Hand-written fixture answers for both sets, marked `identity_status: "synthetic"`, with the report each must produce committed beside them.
- evals/offline-scorer/slice-zero/oracle-check.ts: recomputes every expected value of both sets from the case's own material.
- Four mutant patches in evals/offline-scorer/mutants/, a README, one hosted CI step, `evals/**/*.ts` in tsconfig.json, and the `[slice_zero]` text of charter/charter.toml.

Rules the scorer keeps (each has a proof below):
- It never reads a recorded verdict. It recomputes pass or fail from the answer's bytes and the case's expected value.
- Every answer names the sha256 of the case-set file it answers, so a case set whose floors or cases changed after the answers were made is refused as a whole.
- A case passes when more than half of its attempts pass. A case with fewer attempts than the set's floor is unanswered. A subject with any unanswered case gets `insufficient_evidence`, never a pass.
- For kind `label`, an output that is not exactly one declared label is `malformed`, counted apart from a wrong label. A case set whose floor a constant answer could meet is refused.
- A subject is `identity_bound` only with `identity_status: "receipt"` and the sha256 of its harness log. Unknown token counts and costs are `null` and make the totals `null`; they are never read as zero.
- Any problem in either input file ends the run with exit 2, every problem printed, and no report.

Real answers and their harness logs are private data. They stay outside this repository, in `P` = `~/.local/share/agent-private/mister-clean/master-gate/slice-zero/real-run`. The script that collects them calls models through a route the owner already provides; it is private adapter code (decision D3) and is not part of this repository.

Base: main 43f49fa. Repair cycles: 1. QA attempts: 2. Review families: 2 (author: this PM, Claude; QA: another model maker). A second QA rejection goes to the owner under S5.

Shell: every reopen and every mutant below runs from the root of a checkout of the frozen head as `bash --noprofile --norc -e -o pipefail -c '<command>'`, with `~/.local/share/mise/installs/bun/1.4.0/bin` first on PATH and `TMPDIR` set to an empty folder outside the checkout. Hosted CI runs the commands of proofs 1, 2 and 5 in one step with no `shell:` line, so under `bash -e {0}`; none of those commands has a pipe, so the two shells behave the same.

Proofs (each re-openable before acceptance):
1. The scorer's self-test passes and fails under each of four planted faults.
   - reopen: `S --self-test` exits 0 and prints `self-test: ok`.
   - mutant: for each of trusts-recorded-hash.patch, unanswered-case-ignored.patch, identity-flip-accepted.patch and floor-allows-constant-label.patch in evals/offline-scorer/mutants/: `git apply <patch>`, then `S --self-test` exits 1 and prints at least one line that starts `self-test:` and names a failed expectation (RED); `git apply -R <patch>` restores the file.
2. The fixture answers reproduce the committed reports byte for byte.
   - reopen, for N in json-validity and canonical-json: `S evals/offline-scorer/slice-zero/N.case-set.json evals/offline-scorer/slice-zero/N.fixture.answers.jsonl > "$TMPDIR/N.report.json"` exits 0, and `cmp "$TMPDIR/N.report.json" evals/offline-scorer/slice-zero/N.fixture.report.json` exits 0.
   - mutant: in a copy of json-validity.fixture.answers.jsonl, change the `output` of the first line of subject FX-PERFECT to the other label and set `output_sha256` to that output's sha256; the run exits 0 and `cmp` exits 1 (RED).
3. The fixture reports hold the declared outcomes, negative controls included.
   - reopen: `jq -c '[.subjects[] | [.subject.id, .outcome, .cases_passed, .constant_label]]' evals/offline-scorer/slice-zero/json-validity.fixture.report.json` prints `[["FX-CONSTANT","below_floor",4,"valid"],["FX-FLAKY","meets_floor",8,null],["FX-MALFORMED","below_floor",5,null],["FX-PARTIAL","insufficient_evidence",7,null],["FX-PERFECT","meets_floor",8,null]]`. The same command on canonical-json.fixture.report.json prints `[["FX-PARTIAL","insufficient_evidence",5,null],["FX-PERFECT","meets_floor",6,null],["FX-WRONG","below_floor",0,null]]`. `jq -c '[.subjects[] | .identity_bound] | unique'` on either report prints `[false]`.
   - mutant: `git apply evals/offline-scorer/mutants/unanswered-case-ignored.patch`; the json-validity run of proof 2 then reports FX-PARTIAL with an outcome other than `insufficient_evidence` (RED).
4. A tampered case set or answer file is refused and never scored.
   - reopen: each of these six changes, made to a copy in `$TMPDIR` of the json-validity fixture files and run as in proof 2, exits 2, prints at least one problem line on stderr and nothing on stdout: (a) one answer's `output` changed with its `output_sha256` left alone; (b) the case set's `floors.min_cases_passed` changed from 7 to 5 with the answers left alone; (c) one answer's `case` set to an id that is not in the case set; (d) one answer of subject FX-PERFECT given another `subject.model`; (e) one answer line repeated; (f) one answer's `subject.identity_status` set to `receipt` with `identity_evidence_sha256` left null.
   - mutant: `git apply evals/offline-scorer/mutants/trusts-recorded-hash.patch`; change (a) then exits 0 and prints a report (RED).
5. Every expected value in both case sets is recomputed from the case's own material and agrees.
   - reopen: `bun evals/offline-scorer/slice-zero/oracle-check.ts` exits 0 and prints `oracle-check: ok (json-validity 8, canonical-json 6)`.
   - mutant: in json-validity.case-set.json change the `expected` of the first case to the other label; the command exits 1 and names that case (RED).
6. The real run: the scorer scores saved answers of at least three model subjects, each bound to its harness log, and the reports reproduce.
   - reopen, for N in json-validity and canonical-json: `S evals/offline-scorer/slice-zero/N.case-set.json P/N.answers.jsonl > "$TMPDIR/N.real.report.json"` exits 0; `shasum -a 256 "$TMPDIR/N.real.report.json"` prints the sum recorded for N in P/REPORTS.sha256; `jq -c '[(.subjects | length), ([.subjects[] | .identity_bound] | unique), ([.subjects[] | .outcome] | unique | map(select(. != "meets_floor" and . != "below_floor" and . != "insufficient_evidence")))]' "$TMPDIR/N.real.report.json"` prints a first number of 3 or more, then `[true]`, then `[]`.
   - reopen: `bash P/verify-evidence.sh` exits 0 and prints `evidence: ok` with the number of answers checked. For every answer line it finds the harness log P/logs/N/<subject id>/<case>.<attempt>.jsonl, compares the log's sha256 with the answer's `identity_evidence_sha256`, and compares the provider, the model and the text of the log's final assistant message with the answer's `subject.provider`, `subject.model` and `output`.
   - mutant: in a copy of P/json-validity.answers.jsonl change one `output` and leave its hash; the run exits 2 (RED).
   No outcome of any model is a criterion. The slice passes whether the models meet the floors or not.
7. charter/charter.toml names the offline-scorer run as Slice Zero, and `proven_on` is still empty in the frozen tree.
   - reopen: `grep -c 'evals/offline-scorer/score.ts' charter/charter.toml` prints 1; `grep -c '^proven_on = ""' charter/charter.toml` prints 1; `grep -c 'CS-001' charter/charter.toml || true` prints 0; `test -f charter/owner-decisions/2026-11-10-slice-zero-offline-scorer.md && echo found` prints `found`.
   - mutant: n/a (records).
8. Unchanged behaviour, and the scorer is not published.
   - reopen, each exits 0: `bun run build:materials` (it writes src/generated-materials.ts, an ignored file the root typecheck needs), then `pnpm exec tsc --noEmit`; `pnpm exec tsc --project tsconfig.campaign.json --noEmit`; `pnpm run audit:public`, which prints `PASS (62 files)`; `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run --allowOnly=false --no-file-parallelism --maxWorkers=1 --testTimeout=120000 src/closeout/inspection.test.ts -t "keeps the prospective public source tree free of private identifiers"`, 1 passed; `bun ablations/view-ab.ts --self-test`, which prints `self-test: ok`.
   - reopen: `git diff --name-only 43f49fa <frozen head>` lists only .github/workflows/ci.yml, tsconfig.json, charter/charter.toml, charter/DONE/slice-zero.md, charter/owner-decisions/2026-11-10-slice-zero-offline-scorer.md, charter/.dispatch/slice-zero.json and .sha256, and files under evals/offline-scorer/. `git diff --name-only 43f49fa <frozen head> -- src dist bin package.json` prints nothing.
   - mutant: n/a (regression set).
9. Hosted CI `verify` is green on the tip that holds the freeze record, and its new step ran the scorer.
   - reopen: `gh run view -R bradheitmann/mister-clean <run id> --json headSha,jobs`; `headSha` is the pushed tip and the job named `verify` has conclusion `success`. `gh run view -R bradheitmann/mister-clean <run id> --log` shows, in the step named `Offline scorer self-test, oracle check and fixture reports (eval-score/1)`, the lines `self-test: ok` and `oracle-check: ok (json-validity 8, canonical-json 6)`. The non-required `charter` job is expected red as NOT CHECKED, the known baseline; its colour is not part of this proof.
   - mutant: n/a (hosted observation; proofs 1 to 5 hold the local negatives).

Landing step (PM, at the merge, not part of the frozen tree and not a proof): after QA has accepted, the merge commit sets `proven_on` in charter/charter.toml to the date of the real run of proof 6, and STATE.md records the two report sums of P/REPORTS.sha256.

Out of scope (recorded obligations, not fixed here):
- The judge-made fixture run, which decision D2 names as the second slice.
- Any model-calling code in this repository, any ranking of models, and any published result of the real run.
- GUARANTEES.yaml G2 still names the earlier proof (a validator of one eval case). Its text is reconciled with this shape in a later slice, with the owner, because INTENT and the guarantees are owner-ratified.
- A subject descriptor shared with src/control-plane/contracts/agent-profile.ts; a held-out flag with private expected values; the eval-record intake that reveng asked for.
- A self-judge of this candidate by the installed 7.5.1 (the change touches no src/ file and nothing published; the next post-merge self-judge of main covers it).
