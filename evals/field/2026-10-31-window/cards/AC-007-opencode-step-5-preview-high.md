---
card_id: AC-007
harness: opencode
model: step-5-preview
reasoning_label: high
identity_status: title_only   # model/reasoning read from the pane title or footer; not bound to a runtime receipt
evidence_class: field         # naturalistic; never averaged into a controlled score
window: 2026-10-31T02:37Z/open
model_registry_ref: unbound      # PM to bind to a model-facts registry record id; facts are not copied here
---

# AC-007 — opencode / step-5-preview / high

Inference sources seen (a footnote, not part of the identity): NVIDIA hosted.

Seats that ran this tuple in the window: DEV-8, HLDT-2

## Work observed
- T-04 (DEV-8): ACCEPTED first pass by an independent verifier.
- T-05 (HLDT-2): pre-mortem document produced 2 minutes after ACK; not yet audited.

## Categorical data (refresh 1, through 03:09Z)
| field | value |
|---|---|
| tasks delivered | 2 (T-04, T-05) |
| first-pass accept | 1 of 1 reviewed |
| reject classes | none |
| speed | operator-reported about 0.5 tok/s for DEV-8; not confirmed by the meter, and T-05 finished in 2 minutes, so the figure needs a re-measure |
| stalls | 0 observed |
| provider limit events | 0 |
| accuracy rating | none yet |

## Caveats
n = 1 reviewed task.

## Refresh 2 (data through 04:48Z)
No new task in the log for this tuple between 03:09Z and 04:48Z; counts above are unchanged. Per-seat counter activity is in `data/meter-summary.tsv` (activity without a logged task is not counted as work).
