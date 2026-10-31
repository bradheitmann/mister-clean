---
card_id: AC-002
harness: opencode
model: nemotron-3.5-super (VL, 120B A12B)
reasoning_label: thinking
identity_status: title_only   # model/reasoning read from the pane title or footer; not bound to a runtime receipt
evidence_class: field         # naturalistic; never averaged into a controlled score
window: 2026-10-31T02:37Z/open
model_atlas_ref: unbound      # PM to bind to a model-atlas record id; facts are not copied here
---

# AC-002 — opencode / nemotron-3.5-super (VL, 120B A12B) / thinking

Inference sources seen (a footnote, not part of the identity): OpenRouter free route; an OpenCode free route and an NVIDIA route were also seen on a different seat's label (not yet a task).

Seats that ran this tuple in the window: DEV-6, QA-7

## Work observed
- T-02 (DEV-6): REJECTED, a real functional defect plus the same documentation gate (see CS-002).
- Review of T-03 (QA-7, OpenRouter): pending; context size flat for 20 minutes after the target was delivered, unconfirmed stall (see FINDINGS).

## Categorical data (current refresh)
| field | value |
|---|---|
| tasks delivered | 1 (T-02) |
| first-pass accept | 0 of 1 |
| reject classes | functional-defect 1, process-contract 1 |
| rework | pending |
| speed | context growth 132.9k to 189.4k tokens in 25 min on DEV-6 (context size, not throughput) |
| stalls | 1 candidate (QA-7, unconfirmed) |
| provider limit events | 0 |
| accuracy rating | none yet |

## Caveats
n = 1 task. Same model as AC-001 under a different harness: any difference between AC-001 and AC-002 mixes harness and route.
