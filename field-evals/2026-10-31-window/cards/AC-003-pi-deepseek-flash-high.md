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

Seats that ran this tuple in the window: seat-324c, seat-eab2, seat-9eec

## Work observed
- T-03 (seat-324c): delivered after a correct stop at a contract stop rule; verdict pending.
- seat-9eec as verifier: two REJECTs (T-01, T-02), each carrying reproduced evidence, review time 26 and 38 minutes after DONE; plus a corroborating ACCEPT of T-04 (5 of 5 mutants red) that duplicated another verifier's work.
- seat-eab2: verifying a port, no verdict yet.

## Categorical data (refresh 1, through 03:09Z)
| field | value |
|---|---|
| tasks delivered (as worker) | 1 (T-03) |
| first-pass accept (as worker) | pending |
| reviews issued | 2 reject, 1 accept (seat-9eec; the accept independently corroborates another verifier on the same lane) |
| review minutes after DONE | 26 (T-01), 38 (T-02) |
| stalls | 0 observed |
| provider limit events | 0 |
| accuracy rating | none yet; both rejects are traceable to evidence (T-01 on a documented gate rule, T-02 on a reproduced failure) |

## Caveats
A verifier that rejects 2 of 2 may be strict or correct; the rework outcome decides which. Not yet known.

## Refresh 2 (data through 04:48Z)
Seven new seats ran this tuple as pair workers for seven repositories (seat-1219 to seat-e100), each verified by an AC-014 seat. The coordinator log names the hygiene tool's own repository's worker as "pi + deepseek-flash high", which is this card, so no new card was made for it.

Work as worker:
- T-16 (seat-a7a9): new core function plus schema, CLI, tool and contracts in 25 min; follow-up 6 min after an upstream merge; coordinator-verified (single rater), independent QA waits.
- T-17 (seat-ef95): read-only inventory triage in 7.3 min; REJECTED on accuracy items; repaired in 2.7 min; ACCEPTED and landed.
- T-19 (seat-1219): author-green in 52 min or less; unreviewed.
- T-20 (seat-424d): FAILED on a high functional defect; repaired in 7.5 min; PASS.
- T-21, T-22, T-23 (seat-424d): 23, 2.1 and 8.9 min; all unreviewed. T-22's 2.1 min is from the coordinator's dispatch line and may exclude earlier reading.
- T-28 (seat-ecd1): planning-conformance repair merged (findings 311 to 204); verifier not named.
- T-14 (seat-cf0a): not delivered after 69 min; long blocking sleeps on a CI log and a duplicate full suite on an overloaded host (CS-012).
- T-03 (seat-324c): verdict still pending.

Work as verifier:
- seat-9eec: T-01 rework ACCEPTED (42 min after DONE); T-08 REJECTED (doc shape plus a false provenance claim, with a base replay that cleared one lint finding).
- seat-eab2: T-10 REJECTED with five findings, including that the dispatch's own planted mutant could not discriminate.

| field | value (cumulative) |
|---|---|
| tasks delivered (as worker) | 9 (T-03, T-16, T-17, T-19, T-20, T-21, T-22, T-23, T-28; T-17 and T-20 each with one repair) |
| first-pass verdict by an independent verifier (as worker) | 0 of 2 accepted (T-17, T-20); T-16 coordinator-verified; T-28 merged without a named verifier; 5 unreviewed or pending |
| rework | 2 of 2 converged in one round (T-17 in 2.7 min, T-20 in 7.5 min) |
| in progress over 60 min | 1 (T-14) |
| reviews issued (as verifier) | 4 reject (T-01, T-02, T-08, T-10), 2 accept (T-04 corroboration, T-01 rework); seat-9eec and seat-eab2, cumulative |
| stalls | 0 confirmed; T-14 is a self-imposed wait, not a stall (CS-012) |
| provider limit events | 0 on the DeepSeek route across up to 10 seats |

Caveat for refresh 2: pair workers and their verifiers came from different model families by design, so every AC-003 verdict as worker is an AC-014 verdict too; neither card's error rate is measurable from the other's.

## Final refresh (meter through 14:33:26Z, log through 14:40:25Z)
Work as worker after 04:48Z:
- T-14 (seat-cf0a): DONE 05:25Z, 106 min after dispatch; ACCEPTED first pass 12 min later with a fail-without and hosted CI green on the exact commit; landed 08:29Z.
- T-35 (seat-cf0a): a tool fix in 13 min or less; ACCEPTED (verdict line mis-stamped, CS-019). Proof 4 was host-blocked and recorded, with no hook override.
- seat-424d: T-21, T-22, T-23 ACCEPTED (70 to 78 min after DONE, queued); then T-30 (6.8 min), T-31 (2.6), T-32 (5.7), T-33 (no dispatch line), T-34 (2.9 min, REJECTED on a ruling mismatch and missing exit codes, repaired in 2 min, PASS). Every seat-f471 lane landed.
- T-19 (seat-1219): REJECTED first pass (05:12Z, a design defect); remediated; landed 06:18Z.
- T-16 (seat-a7a9): independent verifier ACCEPTED 13:47Z.
- T-37 (seat-324c): read-only inventory and unapplied patch in 8.6 min; unreviewed. The worker self-reported one `rm -rf` of its own scratch (CS-017 additions).

Work as verifier: seat-9eec ACCEPTED the T-08 rework (05:38Z). seat-eab2 never re-reviewed the T-10 rework.

| field | value (final, whole window) |
|---|---|
| tasks delivered (as worker) | 17 (T-03, T-14, T-16, T-17, T-19, T-20, T-21, T-22, T-23, T-28, T-30, T-31, T-32, T-33, T-34, T-35, T-37) |
| first-pass verdict by an independent verifier (as worker) | 9 accepted of 13 (accepted: T-14, T-16, T-21, T-22, T-23, T-30, T-31, T-32, T-35; rejected: T-17, T-19, T-20, T-34) |
| not independently verified | T-03 (twin never reported), T-28 and T-33 (merged, no verdict line), T-37 (unreviewed) |
| rework | 4 of 4 rejects converged in one round (3 by a verdict line, T-19 by its landing line) |
| speed, ack to done (min) | median about 11 over 16 timed deliveries (range 2.1 to 106); many acks are dispatch lines, so reading time may be excluded |
| output tokens per active hour (Pi counters, rounded) | about 121k across 11 seats (about 1.57M output over 13 active hours); highest seat-hour 169k |
| reviews issued (as verifier, cumulative) | 4 reject, 3 accept (T-01 rework, T-04 corroboration, T-08 rework) |
| stalls | 0; T-14's long wait was self-imposed (CS-012) |
| provider limit events | 0 on the DeepSeek route across 11 seats over up to 12 h |

Caveat (final): all PAIR verdicts on this card are AC-014 verdicts; the two cards' error rates still cannot be separated.
