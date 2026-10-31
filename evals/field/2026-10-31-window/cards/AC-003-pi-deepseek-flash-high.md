---
card_id: AC-003
harness: pi
model: deepseek-flash
reasoning_label: high
identity_status: title_only   # model/reasoning read from the pane title or footer; not bound to a runtime receipt
evidence_class: field         # naturalistic; never averaged into a controlled score
window: 2026-10-31T02:37Z/open
model_atlas_ref: unbound      # PM to bind to a model-atlas record id; facts are not copied here
---

# AC-003 — pi / deepseek-flash / high

Inference sources seen (a footnote, not part of the identity): DeepSeek (paid, described by the operator as cheap).

Seats that ran this tuple in the window: DEV-7, QA-2, QA-6

## Work observed
- T-03 (DEV-7): delivered after a correct stop at a contract stop rule; verdict pending.
- QA-6 as verifier: two REJECTs (T-01, T-02), each carrying reproduced evidence, review time 26 and 38 minutes after DONE; plus a corroborating ACCEPT of T-04 (5 of 5 mutants red) that duplicated another verifier's work.
- QA-2: verifying a port, no verdict yet.

## Categorical data (current refresh)
| field | value |
|---|---|
| tasks delivered (as worker) | 1 (T-03) |
| first-pass accept (as worker) | pending |
| reviews issued | 2 reject, 1 accept (QA-6; the accept independently corroborates another verifier on the same lane) |
| review minutes after DONE | 26 (T-01), 38 (T-02) |
| stalls | 0 observed |
| provider limit events | 0 |
| accuracy rating | none yet; both rejects are traceable to evidence (T-01 on a documented gate rule, T-02 on a reproduced failure) |

## Caveats
A verifier that rejects 2 of 2 may be strict or correct; the rework outcome decides which. Not yet known.
