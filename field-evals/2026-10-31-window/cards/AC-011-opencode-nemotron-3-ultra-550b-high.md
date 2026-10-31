---
card_id: AC-011
harness: opencode
model: nemotron-3-ultra (550B A55B)
reasoning_label: high
identity_status: title_only   # model/reasoning read from the pane title or footer; not bound to a runtime receipt
evidence_class: field         # naturalistic; never averaged into a controlled score
window: 2026-10-31T02:37Z/open
model_registry_ref: unbound      # PM to bind to a model-facts registry record id; facts are not copied here
---

# AC-011 — opencode / nemotron-3-ultra (550B A55B) / high

Inference sources seen (a footnote, not part of the identity): NVIDIA hosted.

Seats that ran this tuple in the window: ADVISOR

## Work observed
- T-07: decision advice, 6 m 41 s at 12.8 tok/s, adopted with faults (CS-003).

## Categorical data (refresh 1, through 03:09Z)
| field | value |
|---|---|
| tasks delivered | 1 (T-07) |
| answer latency | 6 m 41 s (one answer), 12.8 tok/s |
| fault classes | wrong-citation, off-target citation |
| accuracy rating | judgment 9, accuracy 6, overall about 8 (single rater, subjective) |
| provider limit events | 0 |

## Caveats
n = 1. It repaired every fault from the previous advisor answer (feedback was in context), so the second answer is not an independent draw.

## Refresh 2 (data through 04:48Z)
No new task in the log for this tuple between 03:09Z and 04:48Z; counts above are unchanged. Per-seat counter activity is in `data/meter-summary.tsv` (activity without a logged task is not counted as work).

## Final refresh (meter through 14:33:26Z, log through 14:40:25Z)
No new timed answer in the window. A fourth advisory question was written at 14:40Z, after the meter closed; its answer is outside this ledger. Final counts: 1 advisory answer (T-07, single-rater score); 0 provider limit events over 12 h.
