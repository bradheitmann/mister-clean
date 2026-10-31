---
card_id: AC-009
harness: opencode
model: mimo-v2.6-flash
reasoning_label: thinking
identity_status: title_only   # model/reasoning read from the pane title or footer; not bound to a runtime receipt
evidence_class: field         # naturalistic; never averaged into a controlled score
window: 2026-10-31T02:37Z/open
model_registry_ref: unbound      # PM to bind to a model-facts registry record id; facts are not copied here
---

# AC-009 — opencode / mimo-v2.6-flash / thinking

Inference sources seen (a footnote, not part of the identity): OpenRouter paid.

Seats that ran this tuple in the window: QA-9

## Work observed
- Verifier for T-04: ACCEPTED, five single-class mutants all red, 17 minutes after DONE.

## Categorical data (refresh 1, through 03:09Z)
| field | value |
|---|---|
| reviews issued | 1 accept |
| review minutes after DONE | 17 |
| provider limit events | 0 |

## Caveats
n = 1. Its ACCEPT was independently corroborated by a second verifier (AC-003), which found the same result.

## Refresh 2 (data through 04:48Z)
- T-12: ACCEPTED a coordinator-authored slice zero 3 min after dispatch (cross-family review).
- T-11: started 3 partial mutant batteries on freezes that the coordinator then voided (CS-014); REJECTED the next freeze 03:54Z; ACCEPTED the repair 04:05Z; amended and re-issued the receipt twice to satisfy the receipt checker.

| field | value (cumulative) |
|---|---|
| reviews issued | 3 accept, 1 reject (T-04, T-12, T-11 x2) |
| review minutes after delivery | 17 (T-04), 3 (T-12), about 5 (T-11 reject, after the last voided freeze), about 8 (T-11 accept, after repair-2) |
| voided partial reviews | 3 (CS-014; caused by freeze churn, not by this verifier) |
| provider limit events | 0 |

## Final refresh (meter through 14:33:26Z, log through 14:40:25Z)
No new review after refresh 2; QA-9's context counter did not change after 04:48Z. Final counts unchanged: 3 accept, 1 reject, 3 partial reviews voided by freeze churn (CS-014); 0 stalls; 0 provider limit events over 12 h.
