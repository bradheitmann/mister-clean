---
card_id: AC-002
harness: opencode
model: nemotron-3.5-super (VL, 120B A12B)
reasoning_label: thinking
identity_status: title_only   # model/reasoning read from the pane title or footer; not bound to a runtime receipt
evidence_class: field         # naturalistic; never averaged into a controlled score
window: 2026-10-31T02:37Z/open
model_registry_ref: unbound      # PM to bind to a model-facts registry record id; facts are not copied here
---

# AC-002 — opencode / nemotron-3.5-super (VL, 120B A12B) / thinking

Inference sources seen (a footnote, not part of the identity): OpenRouter free route; an OpenCode free route and an NVIDIA route were also seen on a different seat's label (not yet a task).

Seats that ran this tuple in the window: DEV-6, QA-7

## Work observed
- T-02 (DEV-6): REJECTED, a real functional defect plus the same documentation gate (see CS-002).
- Review of T-03 (QA-7, OpenRouter): pending; context size flat for 20 minutes after the target was delivered, unconfirmed stall (see FINDINGS).

## Categorical data (refresh 1, through 03:09Z)
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

## Refresh 2 (data through 04:48Z)
- T-10 (DEV-6): a Rust port of a pane meter, delivered in 46.6 min, REJECTED 21 min later: "## Proof N" headings where the strict gate counts top-level "N. " items (CS-001, third instance), a false parity claim in the done list, two panics on multibyte text, an overclaim that the old tool could retire, and a miscounted test total. Tests, lint and scope passed. Rework delivered 5 min after the reject; re-review pending.
- T-02 rework: none seen in the log.
- QA-7 (A/B twin reviewer of T-03): no verdict in the log by 04:48Z; context counter flat for 26 of 27 samples (CS-011 candidate B persists, unconfirmed).

| field | value (cumulative) |
|---|---|
| tasks delivered | 2 plus 1 rework (T-02, T-10, T-10 rework) |
| first-pass accept | 0 of 2 |
| reject classes | functional-defect 2, process-contract 2, false-claim 1, overclaim 1 |
| rework | T-10 rework delivered, pending; T-02 none seen |
| stalls | 1 candidate (QA-7), unconfirmed after 2 h |
| provider limit events | 0 |

## Final refresh (meter through 14:33:26Z, log through 14:40:25Z)
No new task. The T-10 rework (delivered 03:53Z) was never re-reviewed: its verifier (QA-2, AC-003) did not move after 03:53Z. QA-7 never posted its T-03 review; its context counter was flat for 142 of 143 samples across the whole window (CS-011 B, still unconfirmed: no pane read). DEV-6's context counter did not change after 04:48Z.

| field | value (final) |
|---|---|
| tasks delivered | 2 plus 1 rework (T-02, T-10, T-10 rework) |
| first-pass accept | 0 of 2 |
| rework | 1 delivered, never re-reviewed; T-02 rework never seen |
| stalls | 1 candidate (QA-7), unconfirmed after 12 h |
| provider limit events | 0 |
