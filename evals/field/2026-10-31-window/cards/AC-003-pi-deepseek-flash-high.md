---
card_id: AC-003
harness: pi
model: deepseek-flash
reasoning_label: high
identity_status: title_only   # model/reasoning read from the pane title or footer; not bound to a runtime receipt
evidence_class: field         # naturalistic; never averaged into a controlled score
window: 2026-10-31T02:37Z/open
model_registry_ref: unbound      # PM to bind to a model-facts registry record id; facts are not copied here
---

# AC-003 — pi / deepseek-flash / high

Inference sources seen (a footnote, not part of the identity): DeepSeek (paid, described by the operator as cheap).

Seats that ran this tuple in the window: DEV-7, QA-2, QA-6

## Work observed
- T-03 (DEV-7): delivered after a correct stop at a contract stop rule; verdict pending.
- QA-6 as verifier: two REJECTs (T-01, T-02), each carrying reproduced evidence, review time 26 and 38 minutes after DONE; plus a corroborating ACCEPT of T-04 (5 of 5 mutants red) that duplicated another verifier's work.
- QA-2: verifying a port, no verdict yet.

## Categorical data (refresh 1, through 03:09Z)
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

## Refresh 2 (data through 04:48Z)
Seven new seats ran this tuple as pair workers for seven repositories (PAIR-A-DEV to PAIR-G-DEV), each verified by an AC-014 seat. The coordinator log names the hygiene tool's own repository's worker as "pi + deepseek-flash high", which is this card, so no new card was made for it.

Work as worker:
- T-16 (PAIR-D-DEV): new core function plus schema, CLI, tool and contracts in 25 min; follow-up 6 min after an upstream merge; coordinator-verified (single rater), independent QA waits.
- T-17 (PAIR-C-DEV): read-only inventory triage in 7.3 min; REJECTED on accuracy items; repaired in 2.7 min; ACCEPTED and landed.
- T-19 (PAIR-A-DEV): author-green in 52 min or less; unreviewed.
- T-20 (PAIR-B-DEV): FAILED on a high functional defect; repaired in 7.5 min; PASS.
- T-21, T-22, T-23 (PAIR-B-DEV): 23, 2.1 and 8.9 min; all unreviewed. T-22's 2.1 min is from the coordinator's dispatch line and may exclude earlier reading.
- T-28 (PAIR-F-DEV): planning-conformance repair merged (findings 311 to 204); verifier not named.
- T-14 (PAIR-E-DEV): not delivered after 69 min; long blocking sleeps on a CI log and a duplicate full suite on an overloaded host (CS-012).
- T-03 (DEV-7): verdict still pending.

Work as verifier:
- QA-6: T-01 rework ACCEPTED (42 min after DONE); T-08 REJECTED (doc shape plus a false provenance claim, with a base replay that cleared one lint finding).
- QA-2: T-10 REJECTED with five findings, including that the dispatch's own planted mutant could not discriminate.

| field | value (cumulative) |
|---|---|
| tasks delivered (as worker) | 9 (T-03, T-16, T-17, T-19, T-20, T-21, T-22, T-23, T-28; T-17 and T-20 each with one repair) |
| first-pass verdict by an independent verifier (as worker) | 0 of 2 accepted (T-17, T-20); T-16 coordinator-verified; T-28 merged without a named verifier; 5 unreviewed or pending |
| rework | 2 of 2 converged in one round (T-17 in 2.7 min, T-20 in 7.5 min) |
| in progress over 60 min | 1 (T-14) |
| reviews issued (as verifier) | 4 reject (T-01, T-02, T-08, T-10), 2 accept (T-04 corroboration, T-01 rework); QA-6 and QA-2, cumulative |
| stalls | 0 confirmed; T-14 is a self-imposed wait, not a stall (CS-012) |
| provider limit events | 0 on the DeepSeek route across up to 10 seats |

Caveat for refresh 2: pair workers and their verifiers came from different model families by design, so every AC-003 verdict as worker is an AC-014 verdict too; neither card's error rate is measurable from the other's.
