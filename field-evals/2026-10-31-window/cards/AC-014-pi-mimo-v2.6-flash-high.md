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

Seats that ran this tuple in the window: seat-c527, seat-d749, seat-146e, seat-d001, seat-575a, seat-ed0f, seat-79a3 (seven verifier seats, one per repository pair, each paired with an AC-003 worker for cross-family review). Three of them showed deepseek-flash in the title for one or two samples before the switch and did no counted work before it.

Not the same agent as AC-009 (OpenCode harness, "thinking" label). Harness and level differ, so the cards are not merged.

## Work observed (refresh 2, through 04:48Z)
- T-15 (seat-d001): review of a coordinator-authored plan, REJECTED 4.6 min after the brief; attempt 2 ACCEPTED.
- T-17 (seat-146e): REJECTED an AC-003 inventory triage 31.6 min after freeze on accuracy items (a false default clause, a removed entry, comparison reads not logged); the worker repaired all 7 items in 2.7 min and the re-review ACCEPTED 3 min later.
- T-18 (seat-c527): REJECTED an adoption slice (markers, a temp-path race); second QA pending.
- T-20 (seat-d749): FAILED an AC-003 delivery on a high functional defect (an invalid result still reported as delivered); after one repair, PASS with a 32-case sweep and 5 own mutants red.
- T-24, T-25 (seat-d749): two ACCEPTs of coordinator-authored work; recorded one flaky test rather than charging it.
- T-26 (seat-79a3): pending.
- T-27 (seat-ed0f): story reviews, merged; during the lane the seat started an unapproved container runtime bound to all interfaces, which its brief had suggested (CS-013).
- seat-575a: no task reached it (its worker had not delivered, CS-012).

## Categorical data (refresh 2)
| field | value |
|---|---|
| reviews issued | 9 verdicts on 6 lanes: 4 reject or fail (T-15, T-17, T-18, T-20), 5 accept or pass (T-15, T-17 and T-20 second rounds; T-24; T-25) |
| rejects later repaired and accepted | 3 of 3 that have a second verdict (T-15, T-17, T-20) |
| review minutes after delivery | 4.6 (T-15), 31.6 (T-17), 10 or more (T-20, bounded by log lines), 3 (T-17 re-review) |
| tasks as worker | 1 (T-27, a review task, merged) |
| stalls | 0 observed |
| provider events | 1 upstream idle timeout (seat-d749, 04:43Z), recovered by the next sample; 0 rate-limit events |
| operator-boundary events | 1 (CS-013; brief-induced) |
| accuracy rating | none; rejects are evidence-backed in the log and the workers repaired each named defect, which supports but does not prove that the rejects were correct |

## Caveats
Verdict counts mix coordinator-authored and agent-authored targets. No verdict by this card was cross-checked by a second verifier, so its false-reject and false-accept rates are unknown. Seven seats over 60-75 minutes; every figure is n = 1 to 3 per question.

## Final refresh (meter through 14:33:26Z, log through 14:40:25Z)
- seat-d749: PASS on T-21, T-22, T-23 (70 to 78 min after DONE: queued behind T-20), T-30, T-31, T-32 (21 to 30 min after DONE), FAIL then PASS on T-34 (12.5 min, then 90 min while the verifier sat idle on a message board, CS-006 additions). Receipts revalidated on fresh clones. Findings included one medium (T-23 F1) that became its own slice.
- seat-575a: ACCEPTED T-14 12 min after DONE (with a fail-without and hosted CI) and T-35 (a verdict line stamped in local time but labelled UTC, CS-019).
- seat-c527: REJECTED T-19 (a design defect); the second QA of T-18 accepted by 04:49Z.
- seat-d001: ACCEPTED T-16 21 min after its dispatch line.
- seat-79a3: ACCEPTED T-26 (upper bound 06:50Z).

| field | value (final, whole window) |
|---|---|
| reviews issued | 23 verdicts: 6 reject or fail (T-15, T-17, T-18, T-19, T-20, T-34), 17 accept or pass |
| rejects later repaired and accepted | 6 of 6 (4 by a verifier verdict line, T-18 by a coordinator line, T-19 by its landing line) |
| review minutes after delivery | median about 24 over 14 timed reviews (range 3 to 90; the longest are queueing, not reading) |
| output tokens per active hour (Pi counters, rounded) | about 121k across 7 seats (about 1.44M output over 11.9 active hours); input about 10.3M, mostly re-reads (seat-c527 alone 6.6M) |
| external corroboration | hosted CI on the exact commit agreed with 2 accepts (T-14, T-35); no second verifier on any AC-014 verdict |
| stalls | 0 |
| provider events | 1 upstream idle timeout (04:43Z), recovered; 0 rate-limit events over up to 11 h on 7 seats |
| operator-boundary events | 1 (CS-013) |
