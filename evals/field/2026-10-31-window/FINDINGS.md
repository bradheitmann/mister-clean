# Field window findings — refresh 2 (data through 2026-10-31T04:48:40Z)

Evidence class: field (naturalistic). Under `evals/model-hygiene-trial.md` this is a separate ledger: nothing here is averaged into a controlled score, and no row supports a ranking. Every identity is `title_only` or weaker (CS-009). Sample sizes are stated per claim; guesses are marked "guess". Every verdict is a verdict as written in the event log, not a validated receipt (CS-015).

Window: 131 minutes of 5-minute pane samples (1,099 samples, 49 seats; 02:37Z to 04:48Z) plus task events from the operator log since about 01:35Z. At 03:30Z the team grew from one repository to eight: seven new worker/verifier pairs, one per sibling repository, all on paid low-cost routes. The ledger now has 29 task rows, 14 agent cards and 15 case files.

## Q1. Same model (Nemotron 3.5 Super), three routes: work before limits, latency, truncation

| question | what the data says | n | confidence |
|---|---|---|---|
| Limits hit, any Nemotron route | none in 131 min (OpenRouter free, NVIDIA hosted, OpenCode free label) | 1,099 samples; 5 seats on these routes | lower bound only |
| Work on the NVIDIA route (Pi, AC-001) | T-01 rework accepted; T-08 delivered in 26 min, rejected (doc shape plus a false provenance claim; functional result held); 1 verifier accept (T-29) | 3 task events | low |
| Work on the OpenRouter free route (OpenCode, AC-002) | T-02 and T-10 delivered in 26 and 46.6 min, both rejected first pass (each with a real defect plus the doc-shape gate); T-10 rework in 5 min, pending | 2 tasks, 1 rework | low |
| Work on the OpenRouter free route (Pi, AC-001) | none: the seat had no task in the whole window | 0 | none |
| A/B twin review of one task (QA-7 OpenRouter/OpenCode vs QA-5 NVIDIA/Pi) | no verdict from either twin in the log after more than 2 h; QA-7 flat for 26 of 27 samples (CS-011 B) | 0 verdict pairs | none |
| Latency | still only the operator's one probe (0.35 s vs 9.2 s first response) | 1 per route | low |
| Truncation | none: the stall watcher reports no truncation marker on any seat | all seats, 01:16Z to 04:48Z | medium for "none seen" |

Reading: provider and harness remain confounded (AC-001 is Pi on NVIDIA, AC-002 is OpenCode on OpenRouter), and the one same-task twin produced no data. The route comparison is not answered by this window. What would answer it: one frozen task, one harness, both routes, 3 runs each, with a per-request receipt of the resolved model (CS-009) and a time-to-first-token field.

## Q2. Viable free workhorses; how many tasks before free inference ran out

| card | route | tasks (cumulative) | first pass | rework | notes |
|---|---|---|---|---|---|
| AC-001 pi nemotron super high | NVIDIA, OpenRouter free | 2 plus 1 rework; 1 review | 0 of 2 | 1 of 1 accepted (T-01) | both rejects carry the doc-shape gate; T-08 adds a false claim |
| AC-002 opencode nemotron super thinking | OpenRouter free | 2 plus 1 rework | 0 of 2 | T-10 rework pending; T-02 none seen | real defects on both tasks |
| AC-007 opencode step-5-preview high | NVIDIA | 2 | 1 of 1 | none needed | no new task since refresh 1 |
| AC-008 / AC-013 inkling free | OpenRouter free | 2 (audit, advice) | n/a | n/a | no new task since refresh 1 |
| AC-011 nemotron 3 ultra | NVIDIA | 1 (advice) | n/a | n/a | no new task since refresh 1 |

- Tasks before free inference ran out: it did not run out. Across 131 minutes, free-route seats produced at least 12 task events (9 worker deliveries including reworks, 2 advisory answers, 1 verifier verdict) with 0 limit events. This is a lower bound. Guess: any ceiling is a day-scale quota, not visible in two hours.
- The free routes carried less work after 03:09Z than before. All 14 new pair seats ran paid, low-cost routes (DeepSeek and an OpenRouter paid route). The log does not say why. So the window says nothing about free routes at 14-seat scale.
- Viable free workhorse: not decided. Rework converged for 1 of 1 completed free-route reworks. First pass is 1 of 5 reviewed free-route worker tasks accepted. All 4 rejects include the gate that rejects correct work on numbering (CS-001); 3 of them also carry a real defect or a false claim. The free-route results cannot be read as model quality until treatment B (contract states the exact numbering form) is in force. In the field it has been in force since 03:51Z, and no free-route delivery has been reviewed since.
- For contrast (paid, low-cost; not free): AC-003 as a pair worker delivered 9 tasks. Both independent first-pass verdicts were rejects, and both reworks converged in one round (2.7 and 7.5 minutes).

## Q3. Per agent: tasks, first-pass verdict, rework, speed, stalls

Full rows are in `data/tasks.tsv` and per-card tables in `cards/`. "First pass" counts only verdicts by an independent verifier on worker deliveries.

| card | tasks as worker | first pass | rework converged | speed, ack to done (min) | reviews issued | stalls |
|---|---|---|---|---|---|---|
| AC-001 pi nemotron super high | 2 (+1 rework) | 0/2 | 1/1 (1 pending) | 30, 26 | 1 accept | 0 confirmed (A dropped) |
| AC-002 opencode nemotron super thinking | 2 (+1 rework) | 0/2 | 0/0 (1 pending) | 26, 46.6; rework 5 | 0 | 1 candidate (QA-7) |
| AC-003 pi deepseek-flash high | 9 (+2 repairs), 1 in progress | 0/2 (5 unreviewed or pending, 1 coordinator-verified, 1 merged without a named verifier) | 2/2 | 53, 25, 7.3, 52 or less, 19 or less, 23, 2.1, 8.9, 38 or less; T-14 over 69 | 4 reject, 2 accept | 0; 1 self-imposed wait (CS-012) |
| AC-006 pi deepseek-v4-pro high | 2 | 0/1 (coordinator reject before QA) | 1/1 after 2 rounds | 11.4 to first freeze; 37 to QA accept | 0 | 0 |
| AC-007 opencode step-5-preview high | 2 | 1/1 | n/a | 23, 2 | 0 | 0 |
| AC-008 opencode inkling high | 1 (audit) | unreviewed | n/a | 46 | 0 | 0 |
| AC-009 opencode mimo-flash thinking | 0 | n/a | n/a | n/a | 3 accept, 1 reject; 3 partial reviews voided by freeze churn (CS-014) | 0 |
| AC-011 / AC-013 advisors | 1 / 1 | n/a (advice) | n/a | 6.7 / 0.8 | 0 | 0 |
| AC-014 pi mimo-flash high (new) | 1 (a review task, merged) | n/a | n/a | 38 or less | 4 reject or fail, 5 accept or pass, on 6 lanes | 0; 1 upstream timeout, recovered |
| AC-004, AC-005, AC-010, AC-012 | 0 | n/a | n/a | n/a | 0 | 0 |

Verifier cross-checks: still 1 (T-04, two verifiers agreed). For 3 of 3 AC-014 rejects that have a second round, the worker repaired the named defects and the re-review accepted. That supports the rejects being substantive; it does not measure false-reject or false-accept rates.

Times marked "or less" are bounded by coordinator log lines, not worker ACK lines. T-22's 2.1 minutes runs from a dispatch line and may exclude reading time.

## Quality under constraint (what evidence exists per agent, and what is UNKNOWN)

| dimension | evidence that exists | UNKNOWN |
|---|---|---|
| Quality | log verdicts per task (first pass, reject class, rework rounds) for AC-001, AC-002, AC-003, AC-006, AC-007; verifier mutant batteries recorded in log lines; single-rater advice scores for AC-011 and AC-013 | false-accept and false-reject rate of any verifier (1 cross-check in the window); whether log verdicts match validated receipts (CS-015); quality on any task class seen once |
| Privacy | every agent in the window ran on a hosted route (OpenRouter free and paid, NVIDIA hosted, DeepSeek, an OpenCode free route); no local inference was used | each route's data retention and training-use terms (not recorded in the log; a model-facts registry question); what each seat sent off-host (no request logging) |
| Latency | one first-response probe per Nemotron route; task wall-clock times (ack to done) in `data/tasks.tsv`; operator-reported answer times for two advisors; one upstream idle timeout on a paid OpenRouter route | time to first token, tokens per second per route, p50/p95; how much of any task time was queueing, waiting on rulings, or host load (the host ran at load about 16 to 20 on 18 cores during CS-012) |
| Cost | routes are labelled free or paid; one premium call cost about 0.50 USD (operator, rounded, CS-010); token counters per Pi seat in `data/meter-intervals.tsv` | price per token for the DeepSeek and OpenRouter paid routes used by the 14 pair seats; total spend in the window; cost per accepted task |

None of these rows ranks agents. A per-agent quality claim needs the controlled minimums in `evals/model-hygiene-trial.md`.

## Replay first (updated)
1. CS-001 treatments A/B/C: still the cheapest test, and now 4 field instances. Pin the governance tool version, because its maintainer is changing the gate.
2. CS-012 treatment C (non-blocking wait): decides whether the inbox block belongs to the harness.
3. CS-014 treatment B (allow "unknown"): decides whether a fabricated timestamp is schema-invited.
4. CS-009, CS-007 and CS-015: identity read-back, a limit detector with a transport-error class, and validated receipts, before any provider table or verdict tally is trusted.
5. CS-011 B: one pane read by the operator converts it to stall or idle.
