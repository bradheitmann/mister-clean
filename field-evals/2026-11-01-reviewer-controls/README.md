# Reviewer controls 2026-11-01 (control-pair replay ledger)

What this is: the per-reviewer-model tallies from a spec-compiler project's control-pair qualification gate. The gate runs before every evaluation run. For each of four phase populations (P00 to P03), the reviewer model judges a known-good control 3 times and a known-bad control 3 times. The gate refuses the run when a good control passes fewer than 2 of 3 times. The source project is not named, and its paths and run ids are removed.

This ledger is kept separate from `field-evals/2026-10-31-window/`. That ledger is naturalistic. This one is a controlled replay: within a pair set, every session judges the same control bytes.

## Layout
| path | content |
|---|---|
| `data/control-tallies.tsv` | one row per session and population: reviewer model, pass counts for good and bad controls, and where the row came from |
| `cards/RC-nnn-*.md` | one card per reviewer metric, with the derivation, sample sizes and caveats |

## Rules this ledger follows
- Sessions appear only as `S-nn`. The map from session to source directory, with the sha256 of each session's control pairs, lives under the private data root, never in this repository.
- `pair_set` names the exact control bytes: sessions are compared only within one set. Set A and set B are different control pairs.
- `reviewer_model` is the model recorded on every replay observation of that session. Each session used exactly one reviewer model. The provider-reported model was not checked separately.
- `source` is `tallies` when the row comes from the session's own tally file. It is `failure_line` when the session stopped at the floor and wrote no tally file; the counts then come from the gate's refusal line and the team log.
- Nothing here ranks models on its own. Each card states its sample size and its test.
