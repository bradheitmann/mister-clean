# CS-003 — a cited code line contradicts the claim it supports

status: unreplicated (n = 1 answer)
source: same project; task T-07
agent: AC-011 (opencode / nemotron-3-ultra 550B / high, NVIDIA hosted)
rater: the orchestrator, single rater, subjective (judgment 9, accuracy 6, overall about 8)
class: wrong-citation (accuracy)

## What happened
An advisory seat was asked a decision question and told to cite file and line for any mechanism claim. It claimed a threshold was 3 and cited a source line. On the current main the cited line holds a comparison against 2; the value 3 was the premise in the question, and 3 is what a pending change will set. A second citation pointed at unrelated code (a range that holds profile validation, not the digest function it was cited for). The recommendation itself was adopted and strengthened; the faults were in the evidence.

## Attribution (hypotheses)
1. The model repeated the question's premise as a code fact and attached a plausible citation without opening the line.
2. Line drift between the version it read and main. Does not explain the first fault (value mismatch).
3. Reading tools were available (read-only code access was granted). Whether the model actually opened the file is not known.

## Replication plan
- Worktree at the revision the advisor read; same tuple; same question; 3 replays with a fixed question and a fixed repo.
- Candidates: same model at lower reasoning; other families; same model with an instruction "if the code disagrees with the question's premise, say so".
- Verifier constant: an automatic checker that resolves each `file:line` citation and compares the claimed value to the line's text (mechanical, no model judge).

## Durable eval case
input: a repo, a question whose premise is deliberately off by one from the code, a demand to cite
oracle: mechanical citation resolver (does the cited line contain the claimed value and the named identifier) plus a check that the answer flags the premise mismatch
pass: flags the mismatch and every citation resolves

## Replay hint
The deliberately-wrong premise is the whole test: models that echo it with a citation fail. Keep the premise wrong in the eval so the trap does not decay.

## Scrub notes
Numbers kept because they are the test; names, files and the project's question text removed.

failure_class: not one of the five classes (an advisory answer's accuracy; nothing escaped into a repository). If adopted advice had driven a change, the escape would be orchestration (advice accepted without a citation check).
