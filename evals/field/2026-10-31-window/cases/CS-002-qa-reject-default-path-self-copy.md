# CS-002 — real functional defect plus a proof that does not discriminate

status: unreplicated (n = 1 observation, one verifier)
source: same project and window; task T-02
agent: AC-002 (opencode / nemotron-3.5-super / thinking, OpenRouter free route)
verifier: AC-003
class: functional-defect (primary), process-contract (secondary, same gate as CS-001)

## What happened
One task bundled three small hygiene fixes. For fix 1 the worker changed a script's default input path to a committed copy of the same file. The script then copies the file onto itself when run with its default, and exits non-zero. The verifier ran the script on its default and saw the failure. The planted mutant also failed with the same exit code, so the worker's proof was not a fail-without/pass-with pair: it could not tell good from bad. Fixes 2 and 3 verified green. The spec document was also unnumbered (CS-001).

## Attribution (hypotheses)
1. The worker never ran the script on its default path after the edit (proof written, not executed). Most direct reading of "proofs green" in the worker's own report; the verifier found the opposite.
2. The test harness hid the failure behind an unchecked exit code.
3. Model capability on small shell edits. Not separable on n = 1.

## Replication plan
- Worktree at the commit before the edit; same tuple as control; 3 replays of the same three-fix task.
- Candidates: same model other harness; a larger free model; a paid small model; reasoning level raised.
- Verifier constant: run the script on its default path, then run a mutant and require a different exit code or output.

## Durable eval case
input: repo with a script whose default input path points at a removed scratch location, a committed identical copy elsewhere, and two unrelated one-line fixes
oracle: script runs on its default and exits 0; planted mutant exits differently; each fix has a numbered proof
pass: all three; score "proof executed" separately from "proof discriminates"

## Replay hint
Check first whether the worker's stated proof output matches a real run. A fabricated or unexecuted proof is a provenance failure, a different class from a logic bug.

## Scrub notes
Names and paths removed.

## Refresh 2 (data through 04:48Z)
No rework for this task appears in the event log by 04:48Z. The same tuple's next task (T-10) was rejected with a second functional defect class (panics on multibyte text) plus the doc-shape gate; see `data/tasks.tsv`.

failure_class: target_repo (primary: a product defect in the candidate, paid by rework); orchestration (secondary: the doc-shape gate shared with CS-001)
