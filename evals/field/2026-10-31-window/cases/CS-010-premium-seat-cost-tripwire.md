# CS-010 — a premium model on an advisory seat cost about 0.50 USD per call and was replaced twice in 20 minutes

status: observation; routing datum
class: cost tripwire (not a failure)

## What happened
An advisory seat was seated on a paid premium model at high reasoning. The operator reported about 0.50 USD per call and replaced it within about 6 minutes with a free model, then about 11 minutes later with a larger free-hosted model chosen for model-family diversity in a three-way vote. No quality finding is attached to the first model; it never produced a scored answer.

## Why it matters
The owner note's free-inference tripwire needs a cost-per-call trigger as well as a failure trigger. This is a cost trigger firing before any quality data exists.

## Replication plan
- Not replayable as a failure. Record cost per call at dispatch and compare with a per-seat budget.

## Durable eval case
input: per-seat budget plus a price table; oracle: dispatcher refuses or flags a seat whose projected per-call cost exceeds the budget; pass: flagged before first call

## Replay hint
Pair with the provider notes: price is a model-facts registry fact, the tripwire is a router rule.

## Scrub notes
Dollar figure is operator-reported, rounded.

failure_class: not a failure (a cost observation); routing decisions belong to orchestration
