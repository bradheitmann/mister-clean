---
card_id: AC-014
harness: pi
model: mimo-v2.6-flash
reasoning_label: high
identity_status: title_only   # model/reasoning read from the pane title or footer; not bound to a runtime receipt
evidence_class: field         # naturalistic; never averaged into a controlled score
window: 2026-10-31T03:37Z/open
model_registry_ref: unbound      # PM to bind to a model-facts registry record id; facts are not copied here
---

# AC-014 — pi / mimo-v2.6-flash / high

Inference sources seen (a footnote, not part of the identity): OpenRouter, paid route (title prefix "(openrouter) xiaomi/mimo-v2.6-flash").

Seats that ran this tuple in the window: PAIR-A-QA, PAIR-B-QA, PAIR-C-QA, PAIR-D-QA, PAIR-E-QA, PAIR-F-QA, PAIR-G-QA (seven verifier seats, one per repository pair, each paired with an AC-003 worker for cross-family review). Three of them showed deepseek-flash in the title for one or two samples before the switch and did no counted work before it.

Not the same agent as AC-009 (OpenCode harness, "thinking" label). Harness and level differ, so the cards are not merged.

## Work observed (refresh 2, through 04:48Z)
- T-15 (PAIR-D-QA): review of a coordinator-authored plan, REJECTED 4.6 min after the brief; attempt 2 ACCEPTED.
- T-17 (PAIR-C-QA): REJECTED an AC-003 inventory triage 31.6 min after freeze on accuracy items (a false default clause, a removed entry, comparison reads not logged); the worker repaired all 7 items in 2.7 min and the re-review ACCEPTED 3 min later.
- T-18 (PAIR-A-QA): REJECTED an adoption slice (markers, a temp-path race); second QA pending.
- T-20 (PAIR-B-QA): FAILED an AC-003 delivery on a high functional defect (an invalid result still reported as delivered); after one repair, PASS with a 32-case sweep and 5 own mutants red.
- T-24, T-25 (PAIR-B-QA): two ACCEPTs of coordinator-authored work; recorded one flaky test rather than charging it.
- T-26 (PAIR-G-QA): pending.
- T-27 (PAIR-F-QA): story reviews, merged; during the lane the seat started an unapproved container runtime bound to all interfaces, which its brief had suggested (CS-013).
- PAIR-E-QA: no task reached it (its worker had not delivered, CS-012).

## Categorical data (refresh 2)
| field | value |
|---|---|
| reviews issued | 9 verdicts on 6 lanes: 4 reject or fail (T-15, T-17, T-18, T-20), 5 accept or pass (T-15, T-17 and T-20 second rounds; T-24; T-25) |
| rejects later repaired and accepted | 3 of 3 that have a second verdict (T-15, T-17, T-20) |
| review minutes after delivery | 4.6 (T-15), 31.6 (T-17), 10 or more (T-20, bounded by log lines), 3 (T-17 re-review) |
| tasks as worker | 1 (T-27, a review task, merged) |
| stalls | 0 observed |
| provider events | 1 upstream idle timeout (PAIR-B-QA, 04:43Z), recovered by the next sample; 0 rate-limit events |
| operator-boundary events | 1 (CS-013; brief-induced) |
| accuracy rating | none; rejects are evidence-backed in the log and the workers repaired each named defect, which supports but does not prove that the rejects were correct |

## Caveats
Verdict counts mix coordinator-authored and agent-authored targets. No verdict by this card was cross-checked by a second verifier, so its false-reject and false-accept rates are unknown. Seven seats over 60-75 minutes; every figure is n = 1 to 3 per question.
