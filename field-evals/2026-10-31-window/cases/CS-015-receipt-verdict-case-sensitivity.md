# CS-015 — a receipt checker skips its acceptance checks on any verdict not spelled exactly in lowercase

status: observation; measurement validity (n = 1 defect, found by a coordinator in a sibling repository)
source: the governance tool the source team uses to accept work; found while landing a slice zero
class: oracle validity (affects every ACCEPTED count in this ledger that rests on a receipt)

## What happened
The tool that validates verifier receipts compares the verdict string case-sensitively. A receipt whose top-level verdict is any spelling other than lowercase "accepted" skips all acceptance checks and still exits 0. The orchestrator audited the source project's main branch: 173 landing receipts carry lowercase "accepted" (so no landing went through unvalidated), and 6 receipts carry nonstandard verdict words (pass, changes, partial, author-validated). All QA seats were then told to write lowercase verdicts until a fix lands; the tool's maintainer took a fix into a slice.

In this ledger, verdicts come from event-log lines (for example "[QA … ACCEPTED …]", "[QA PASS …]"), not from validated receipts. The log uses mixed words (ACCEPTED, PASS, accepted receipt). A receipt checker that silently passes unknown verdict words means a log-line ACCEPTED is not evidence that the receipt was checked.

## Why it matters for evals
A field verdict is only as good as its oracle. Two oracle defects are now known in the same pipeline: this one, and the numbered-proof gate in CS-001 (which refuses correct work for a formatting difference). One fails open, one fails closed.

## Replication plan
- Fixture receipts with verdicts "accepted", "ACCEPTED", "Accepted", "pass", "PASS", "rejected", and an unknown word; each paired with a tree that fails one acceptance check.
- Oracle: the checker exits non-zero for every receipt whose tree fails a check, and refuses every verdict outside the schema's enumeration.
- No model is involved; this belongs in the governance tool's own tests.

## Durable eval case
input: 7 fixture receipts; oracle: exit status and refusal reason per receipt; pass: 7 of 7

## Replay hint
Re-tally this ledger's ACCEPTED rows against validated receipts once the fix lands; until then, read every verdict in `data/tasks.tsv` as a log verdict, not a validated receipt.

## Scrub notes
Tool, repository, file and line references removed.

failure_class: target_repo (in the governance tool used by the source team; not a Mister Clean or model defect)
