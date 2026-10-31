---
card_id: AC-001
harness: pi
model: nemotron-3.5-super (VL, 120B A12B)
reasoning_label: high
identity_status: title_only   # model/reasoning read from the pane title or footer; not bound to a runtime receipt
evidence_class: field         # naturalistic; never averaged into a controlled score
window: 2026-10-31T02:37Z/open
model_atlas_ref: unbound      # PM to bind to a model-atlas record id; facts are not copied here
---

# AC-001 — pi / nemotron-3.5-super (VL, 120B A12B) / high

Inference sources seen (a footnote, not part of the identity): OpenRouter free route; NVIDIA hosted route (both seen). Whether the two routes serve the same weights/quantisation is unverified.

Seats that ran this tuple in the window: DEV-4, DEV-5, QA-5

## Work observed
- T-01 (DEV-5): functional proofs all verified by the verifier, REJECTED on documentation shape (see CS-001). Harness during T-01 is unbound (contract says OpenCode, footer says Pi).
- T-08 (DEV-5, after the route switch): fixture repair delivered in 26 min, unreviewed.
- A/B twin review of T-03 (QA-5, NVIDIA route): pending.
- DEV-4: no task recorded in the window; token counters flat for 25 minutes (cause unknown).

## Categorical data (current refresh)
| field | value |
|---|---|
| tasks delivered | 2 (T-01 plus its rework, T-08 unreviewed) |
| first-pass accept | 0 of 1 |
| reject classes | process-contract 1 |
| rework | 1 delivered after the reject (T-01 renumbering fix), re-review pending |
| speed (NVIDIA route, 2 seats) | output about 48k tokens/h (QA-5) and about 68k tokens/h (DEV-5), counters rounded, 15-20 min windows |
| stalls | 1 candidate (DEV-5 on NVIDIA: flat counters one 5-min interval plus a long busy state, unconfirmed) |
| provider limit events | 0 |
| accuracy rating | none yet |

## Caveats
n = 1 task. Nothing here supports a ranking. DEV-4 and DEV-5 share the card but their routes differ.
