# CS-004 — inferred mechanism stated as fact; pending change missed; half the scope answered

status: unreplicated (n = 1 answer)
source: same project; task T-06
agent: AC-013 (opencode / inkling free / max)
rater: the orchestrator, single rater, subjective (about 7 overall)
class: mechanism-stated-as-fact; missed-dependency; partial-scope

## What happened
The advisory seat answered in 47 seconds. Defects found by the rater: (1) it said a component classified every rejection, when the component is consulted only after a number of same-class rejections, so one of its two objections described a failure that cannot occur; (2) it validated a check against a past change and missed a pending change that would invalidate the check; (3) the question named two items and the answer covered the reasoning for one; (4) it called an outcome "likely" with no stated basis; (5) a name was misspelled.

## Attribution (hypotheses)
1. Inference presented without an "assumption" marker when the text given did not state the mechanism.
2. Short wall time at max reasoning (47 s) suggests little deliberation; reasoning level is a label, effort not verified.
3. The seat was forbidden to read the repository in that round, so (1) may be a context limit, not a model fault.

## Replication plan
- Same question, same context packet, same tuple, 3 replays. Then the same packet with read access granted.
- Candidates: other free models; same model at other levels; harness variants.
- Verifier constant: a checklist of the five defect types applied by a fixed rubric (two independent raters, report agreement).

## Durable eval case
input: a one-page state document with a pending change described in a subordinate line, a two-part question
oracle: rubric: names the pending dependency and when a check must run; covers every named item or says which it drops; marks every inference
pass: all three

## Replay hint
Cheap: the packet is one page. Run it first against every candidate before spending on harder cases.

## Scrub notes
Project facts removed; only the defect structure kept.

failure_class: not one of the five classes (an advisory answer's accuracy; nothing escaped into a repository). Nearest: orchestration, if the missed pending dependency had been acted on.
