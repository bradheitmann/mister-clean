# CS-001 — verifier rejects a functionally correct change for unnumbered proofs

status: unreplicated (n = 1 observation, one verifier)
source: a Rust spec-compiler project run by a multi-agent team; task T-01 in the field window
agent: AC-001 (pi / nemotron-3.5-super / high), harness at task time unbound (contract says OpenCode, footer says Pi)
verifier: AC-003 (pi / deepseek-flash / high)
class: process-contract (documentation shape), not a functional failure

## What happened
A worker was told to make a CI shell step (a `jq` loop over JSON receipt files under `set -e`) report a malformed file and continue instead of aborting the whole loop. The worker delivered in 30 minutes. The verifier reproduced all four stated proofs, including a planted mutant that restored the abort and turned the proof red. It then rejected the change because the worker's spec document listed its proofs with letters, not numbers, and the project's strict gate counts numbered proofs, so the strict refusal count rose by one against the baseline.

## Attribution (hypotheses, ranked, none tested)
1. The dispatch contract specified proofs as "(a)", "(b)", "(c)" while the gate expects numbers. The same gate rejected a second, unrelated task (CS-002) in the same hour from a different worker tuple with the same omission. Two workers, one hidden rule: suspect the contract or the template, not the model.
2. The worker did not read the gate rule. Not checked.
3. A weak instruction-following floor of the tuple. Cannot be separated from 1 and 2 on n = 1.

## Replication plan (owner procedure, steps 3 to 6)
- Worktree at the commit before the worker's change; same tuple as control; 3 replays; only a repeating rejection qualifies.
- Treatment A: contract unchanged (lettered). Treatment B: contract says "number the proofs 1..n". Treatment C: contract unchanged but the template file provides numbered headings.
- Candidates: the same model on the other harness; a different small model; the same model at another reasoning level.
- Verifier constant: the same gate script plus the same mutant check.

## Durable eval case
input: a small repo with a `set -e` loop step, a one-page spec template, a contract text (variant A/B/C)
oracle: functional proof (loop continues, count of processed files, final status unchanged for valid input) AND the doc-shape check (numbered proofs)
pass: both; report the two sub-results separately so a doc-shape fail is not scored as a functional fail

## Replay hint
Run treatments A/B/C three times each on the control tuple before adding candidates. If B and C pass and A fails, the finding is about the dispatch contract and the tuple earns no negative mark.

## Scrub notes
Project name, paths, branch names, slice ids and file names removed. Description is generic.

## Update at refresh 1 (03:10Z)
The worker delivered the rework 38 minutes or less after the reject (queue time inside that is unknown): proofs renumbered 1 to 4, a fail-without mutant added, strict count equal to the baseline. That supports hypothesis 1 only weakly: the fix was a renumbering, so the worker could do it once told, but nothing shows it would have numbered unprompted under treatment B. Re-review is pending.

## Corroboration at refresh 2 (PM review, 2026-10-31)
A second, model-free instance of hypothesis 1: adopting the same governance tool in another repository, the tool's own scaffolded done-list template failed the tool's strict check for the same reason (no numbered proof). The tool's maintainer confirmed it as a tooling defect. A gate that counts numbered proofs, paired with a template or contract that does not produce them, rejects work with no model involved. This raises the prior on hypothesis 1. It does not replace the treatment A/B/C replays, which remain the qualifying test.
