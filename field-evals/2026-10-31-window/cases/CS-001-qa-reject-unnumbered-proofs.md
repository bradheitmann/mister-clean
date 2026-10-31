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

## Third instance (field, 2026-10-31T03:49Z)
A verifier rejected a different worker delivery in the same source project partly for the same cause: the done list used "## Proof N —" headings, while the strict gate counts only top-level "N. " list items. The strict refusal count rose by one, and the delivery's own claim of "identical to baseline" was false. Other gates passed (crate tests twice, lint, scope, pins). The delivery also had unrelated findings, so this is not a single-cause rejection.
- The author was the same model as this case's control agent (Nemotron 3.5 Super; harness unbound). This is therefore a second field observation of the control model failing the same way. It does not separate model from contract.
- Taken together: the Charter-template instance shows the gate/template mismatch rejects work with no model involved; this instance shows the control model repeats the omission when the contract does not ask for numbered top-level items. Treatment B (contract states "top-level 1..n") remains the deciding replay.
- Detector note: "numbered" is ambiguous to authors. The gate's rule is "top-level `N. ` list items", and two of three instances used another numbering form (letters; headings). The eval's oracle must state the exact form it checks.

## Fourth instance and a field treatment (refresh 2, data through 04:48Z)
- Fourth instance: the AC-001 worker's fixture-repair task (T-08) was rejected at 03:56Z partly because its done list was unnumbered (strict 8 against a base of 7). This is the second time the same seat and tuple omitted top-level numbering; its first rework (T-01) was accepted at 03:51Z once numbered.
- Field treatment: at 03:51Z the source team's orchestrator told every worker seat to write proofs as top-level `1.`, `2.` items with indented reopen and fail-without lines. This is treatment B applied to the whole team in the field, without controls. Deliveries after that line are the first observations under B: in this refresh, the later rejections recorded in `data/tasks.tsv` (T-17, T-20) name no doc-shape reason. That is consistent with hypothesis 1, but the later tasks differ in repository, tuple and verifier, so it is not a test.
- The governance tool's maintainer froze a fix that will accept heading-numbered proofs. After it lands, the gate itself changes, and replays must pin the gate version.

failure_class: orchestration (leading hypothesis: the contract or template omits the gate's exact numbering form); the model-free template instance is target_repo in the governance tool; unresolved until treatments A/B/C run
