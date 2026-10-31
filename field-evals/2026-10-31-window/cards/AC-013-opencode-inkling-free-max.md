---
card_id: AC-013
harness: opencode
model: inkling (free)
reasoning_label: max
identity_status: operator_reported   # max level was stated by the operator, not read from a pane title
evidence_class: field
window: 2026-10-31T02:15Z/02:26Z
model_registry_ref: unbound
---

# AC-013 — opencode / inkling (free) / max

Inference sources seen (a footnote, not part of the identity): OpenRouter free route.

Seats that ran this tuple in the window: seat-4b3c (about 11 minutes, then re-seated)

## Work observed
- T-06: decision advice (6-part format), 47 s at max reasoning, adopted with faults (CS-004).

## Categorical data (refresh 1, through 03:09Z)
| field | value |
|---|---|
| tasks delivered | 1 (T-06) |
| answer latency | 47 s (one answer) |
| fault classes | mechanism-stated-as-fact, missed pending dependency, half scope, unsupported likelihood, misspelled name |
| provider limit events | 0 |
| accuracy rating | about 7 of 10 overall (single rater, subjective) |

## Caveats
n = 1. The seat was re-seated on a larger model for family diversity in a vote, not because of a failure. The answer is one draw.

## Refresh 2 (data through 04:48Z)
No new task in the log for this tuple between 03:09Z and 04:48Z; counts above are unchanged. Per-seat counter activity is in `data/meter-summary.tsv` (activity without a logged task is not counted as work).

## Final refresh (meter through 14:33:26Z, log through 14:40:25Z)
No new task. Final counts: 1 advisory answer (T-06, single-rater score); 0 provider limit events.
