# CS-009 — the intended agent, the logged agent and the running agent disagree

status: observation; hygiene-trial relevance
class: identity binding (the trial's "identity_unbound" class)

## What happened
Three disagreements in one hour, none resolved by a runtime receipt:
1. A worker contract says OpenCode on one route; the pane footer later shows a Pi-style footer on the same seat. The task finished between the two readings, so the harness that did the work is unknown.
2. An operator log records a seat moving from a free model to a paid one two hours earlier; the pane title still shows the free model, and its counters are flat. Either the title is stale, the move reversed, or the seat is idle.
3. Seats were re-seated on a different model or route inside one 25-minute window (one QA seat twice, one worker once mid-task), and the work product carries no model stamp.

## Why it matters
Under the repository's own trial contract, a label is not provenance. Every row in this ledger is therefore `identity_status: title_only` or weaker, and none can enter a ranking. This is the single largest limit on what the window can show.

## Replication plan
- Dispatch-time and completion-time read-back of model, harness, level and route from a source the agent cannot write; compare both reads.
- Verifier constant: the read-back script itself.

## Durable eval case
input: a scripted seat swap mid-task; oracle: the ledger row carries both identities or is marked unbound; pass: no row claims a single identity across the swap

## Replay hint
Cheapest fix that unlocks everything else: record the resolved model per request in the work receipt.

## Scrub notes
No names.
