---
card_id: AC-004
harness: opencode
model: deepseek-flash
reasoning_label: max
identity_status: title_only   # model/reasoning read from the pane title or footer; not bound to a runtime receipt
evidence_class: field         # naturalistic; never averaged into a controlled score
window: 2026-10-31T02:37Z/open
model_registry_ref: unbound      # PM to bind to a model-facts registry record id; facts are not copied here
---

# AC-004 — opencode / deepseek-flash / max

Inference sources seen (a footnote, not part of the identity): DeepSeek (paid).

Seats that ran this tuple in the window: DEV-10, QA-10 (later label)

## Work observed
- No scored task in the window yet.

## Categorical data (refresh 1, through 03:09Z)
| field | value |
|---|---|
| tasks delivered | 0 |
| stalls | 0 observed (context flat, seat idle) |
| provider limit events | 0 |

## Caveats
QA-10's pane label moved Nemotron (OpenCode free) to Nemotron (NVIDIA) to this tuple within 25 minutes; any QA-10 output must be matched to the label active at its start.

## Refresh 2 (data through 04:48Z)
No new task in the log for this tuple between 03:09Z and 04:48Z; counts above are unchanged. Per-seat counter activity is in `data/meter-summary.tsv` (activity without a logged task is not counted as work).
