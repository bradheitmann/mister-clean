# Field window findings — FINAL (meter 2026-10-31T02:37:33Z to 14:33:26Z; event log through 14:40:25Z)

Evidence class: field (naturalistic). Under `evals/model-hygiene-trial.md` this is a separate ledger. Nothing here is averaged into a controlled score, and no row supports a ranking. Every identity is `title_only` or weaker (CS-009). Every verdict is as written in the event log, not a validated receipt (CS-015). Sample sizes are stated per claim. Guesses are marked "guess".

The window: 6,783 five-minute pane samples over about 11 h 56 min, on 50 seat titles (49 seats plus one untitled pane seen 8 times), plus task events from the operator log since about 01:35Z. One repository grew to eight at 03:30Z: seven worker/verifier pairs on paid low-cost routes. Totals: 44 task rows, 15 agent cards, 21 case files.

How the per-hour figures were made: for each Pi seat, output tokens are summed over the 5-minute intervals in which a counter moved ("active"), then divided by active time. The harness prints counters rounded (k below 1M; 0.1M steps above), so input deltas on seats with more than 1M cumulative input are coarse, and any delta under about 1k is noise. OpenCode seats show context size only, which is not throughput. Intervals that span a model switch are excluded. Source: `data/meter-intervals.tsv`.

## Provider comparison

### Nemotron 3.5 Super: OpenRouter free versus NVIDIA hosted

| measure | OpenRouter free (`nvidia/nemotron-3.5-super-vl:free`) | NVIDIA hosted (`nvidia/nemotron-3.5-super-vl-120b-a12b`) |
|---|---|---|
| seats, harnesses | DEV-4 and DEV-5 (Pi, AC-001); DEV-6 and QA-7 (OpenCode, AC-002) | DEV-5 after about 02:45Z and QA-5 (Pi, AC-001) |
| time window with work | about 01:35Z to 05:59Z | about 02:45Z to 05:44Z |
| tasks (worker) | 4 deliveries: T-01, T-02, T-10, T-10 rework; T-08 began here and finished on NVIDIA; 1 lane lost (T-36) | T-08, T-01 rework, T-08 rework |
| first pass (independent verifier) | 0 of 3 (T-01, T-02, T-10) | 0 of 1 (T-08) |
| rework | T-10 rework never re-reviewed; T-02 rework never seen | 2 of 2 accepted in one round (T-01, T-08) |
| as verifier | QA-7: twin review of T-03 never posted | QA-5: 1 accept (T-29); twin review of T-03 never posted |
| output tokens per active hour (Pi only) | about 103k (DEV-4, 75 active min, 129k output) | about 62k (DEV-5, 35 min) and about 80k (QA-5, 35 min) |
| highest output in any 60 min | 120k (DEV-4) | 47k (QA-5) |
| speed, ack to done (worker, min) | 30, 26, 46.6; rework 5 | 26 (T-08, mixed route); rework about 5 |
| latency | one operator probe: 0.35 s to first response | one operator probe: 9.2 s (same prompt) |
| rate-limit or quota events | 0 | 0 |
| other provider events | 1 terminal transport error ("Retry failed after 3 attempts: Upstream idle timeout exceeded", 05:59Z); the lane was lost and nobody noticed for 8.5 h (CS-020) | 0 |
| stalls | 1 unexplained 12-hour flat seat with an open review (QA-7, CS-011 B); 1 lost lane (DEV-4) | 0 |
| truncations | none seen; UNKNOWN after 04:52Z (the pair stall watcher was stopped, and the meter does not scan for truncation) | same |
| allowance per hour | lower bound only: no limit hit. At least 120k output in 60 min on one seat | lower bound only: no limit hit. At least 47k output in 60 min on one seat |

Reading:
- Provider and harness are still confounded. The OpenRouter evidence is mostly OpenCode; the NVIDIA evidence is all Pi.
- The one same-task twin (T-03) produced no verdict from either route.
- On a single seat, the OpenRouter free route moved more output per active hour than NVIDIA (n = 1 seat versus 2 seats, 35 to 75 active minutes each). The operator's single probe also favoured OpenRouter on latency. Neither is a distribution.
- The only provider event that ended work was a transport error on the free route, not a limit. Whether a free-tier throttle shows up as an idle timeout is UNKNOWN.
- What would answer the route question: one frozen task, one harness, both routes, 3 runs each, a per-request receipt of the resolved model (CS-009), and a time-to-first-token field.

### DeepSeek (flash, v4 pro) and MiMo (V2.6 flash, V2.6 pro)
All paid routes per the operator. No price was recorded, so cost per task is UNKNOWN.

| measure | DeepSeek flash, Pi high (AC-003) | DeepSeek flash, OpenCode max / low (AC-004 / AC-005) | DeepSeek v4 pro, Pi high (AC-006) | MiMo V2.6 flash, Pi high (AC-014) | MiMo V2.6 flash, OpenCode thinking (AC-009) | MiMo V2.6 pro, OpenCode thinking (AC-010) |
|---|---|---|---|---|---|---|
| seats | 12 (7 pair workers, DEV-7, QA-2, QA-3, QA-6, WATCHER) | DEV-10, QA-10 / QA-1 | DEV-9 | 7 pair verifiers | QA-9 | HLDT-1, HLDT-4 |
| time window with work | about 01:41Z to 11:47Z | 13:00Z to 14:40Z / none | 03:28Z to 04:48Z | 03:44Z to 13:47Z | 02:23Z to 04:05Z | none |
| tasks | 17 deliveries as worker; 7 verdicts as verifier | 2 / 0 | 2 | 23 verdicts as verifier; 1 task as worker | 7 review events (3 accept, 1 reject, 3 voided) | 0 |
| first pass | 9 of 13 accepted (worker) | n/a (1 adopted by the coordinator, 1 unreviewed) | 0 of 1 | n/a (verifier) | n/a | n/a |
| rework | 4 of 4 converged in one round | n/a | converged after 2 rounds | 6 of 6 of its rejects later repaired and accepted | n/a | n/a |
| output tokens per active hour | about 121k (1.57M over 13 active seat-hours); highest seat-hour 169k | context only (DEV-10 672k to 716k) | about 168k over 45 active min (coarse: 100k counter steps) | about 121k (1.44M over 11.9 active seat-hours); highest seat-hour 218k | context only | context only; flat |
| speed | worker ack to done: median about 11 min (n = 16, range 2.1 to 106) | 26 or less; 69.8 including a queue | 11.4 to first freeze | review after delivery: median about 24 min (n = 14, range 3 to 90; the long ones are queueing) | 17 min (T-04) | n/a |
| rate-limit or quota events | 0 | 0 | 0 | 0 | 0 | 0 |
| other provider events | 0 | 0 | 0 | 1 upstream idle timeout (04:43Z), recovered by the next sample | 0 | 0 |
| stalls | 0 (T-14's long wait was self-imposed, CS-012) | 0 | 0 | 0 | 0 | n/a |
| allowance per hour | lower bound only: at least 169k output in one seat-hour; 7 pair workers active in parallel at 03:40Z to 04:30Z with no limit | lower bound only | lower bound only | lower bound only: at least 218k output and about 6.6M input (rounded) on one seat over its run; 7 seats in parallel | lower bound only | not exercised |

Reading:
- The DeepSeek flash and MiMo flash Pi routes carried nearly all the work after 03:30Z.
- No route on either provider reported a limit, with up to 7 seats per route active in parallel.
- MiMo V2.6 pro did no work in the window, so nothing here measures it.
- Latency: no time-to-first-token or tokens-per-second figure exists for any of these routes. The per-hour rates above are active-interval throughput from rounded counters, and they include tool time.

### Free models as workhorses; how many tasks before free inference ran out
- Free inference never ran out: not reached in the window. Lower bound: 13 completed task events on free routes (10 worker deliveries including reworks, 2 advisory answers, 1 verifier verdict), with 0 limit events in about 12 hours. Add one lane lost to a transport error (T-36), which was not a limit.
- The free routes (labelled free by the operator: OpenRouter free and NVIDIA hosted) carried little work after 03:30Z. Only 2 lanes after 04:48Z: an accepted rework and the lost lane. The log does not say why. The window therefore says nothing about free routes at 14-seat scale.
- Viable as a workhorse: not decided.
  - First pass on reviewed free-route worker tasks is 1 of 5 (the accept is Step 5 Preview, T-04).
  - Each of the 4 rejects includes the numbering gate that rejects correct work (CS-001); 3 of them also carry a real defect or a false claim.
  - Reworks converged in 2 of 2 reviewed cases. Both came after the field's treatment B (exact numbering form in the contract), so treatment B removed that gate's rejects for this tuple in n = 2.
- For contrast (paid, low-cost): AC-003 workers went from 0 of 2 first-pass accepts at refresh 2 to 9 of 13 by the end. Their later lanes were smaller, and all came after treatment B. Guess: most of the change is lane size and the contract fix, not the model.

## Per agent: tasks, first pass, rework, speed, stalls
Full rows are in `data/tasks.tsv`; per-card tables are in `cards/`. "First pass" counts only verdicts by an independent verifier on worker deliveries.

| card | tasks as worker | first pass | rework converged | speed, ack to done (min) | reviews issued | stalls |
|---|---|---|---|---|---|---|
| AC-001 pi nemotron super high | 2 (+2 reworks); 1 lane lost | 0/2 | 2/2 | 30, 26; T-08 rework about 5 | 1 accept; 1 twin never posted | 1 lost lane (transport error, CS-020) |
| AC-002 opencode nemotron super thinking | 2 (+1 rework) | 0/2 | 0 reviewed (1 never re-reviewed) | 26, 46.6; rework 5 | 0; 1 twin never posted | 1 unexplained (QA-7, 12 h flat) |
| AC-003 pi deepseek-flash high | 17 | 9/13 | 4/4 | median about 11 (n = 16) | 4 reject, 3 accept | 0 |
| AC-004 opencode deepseek-flash max | 2 | n/a | n/a | 26 or less; 69.8 | 0 | 0 |
| AC-006 pi deepseek-v4-pro high | 2 | 0/1 | 1/1 (2 rounds) | 11.4 to first freeze | 0 | 0 |
| AC-007 opencode step-5-preview high | 2 | 1/1 | n/a | 23, 2 | 0 | 0 |
| AC-008 opencode inkling high | 1 (audit) | unreviewed | n/a | 46 | 0 | 0 |
| AC-009 opencode mimo-flash thinking | 0 | n/a | n/a | n/a | 3 accept, 1 reject, 3 voided (CS-014) | 0 |
| AC-011 / AC-013 advisors | 1 / 1 | n/a (advice; single-rater scores) | n/a | 6.7 / 0.8 | 0 | 0 |
| AC-014 pi mimo-flash high | 1 (review task, merged) | n/a | n/a | 38 or less | 6 reject or fail, 17 accept or pass | 0 |
| AC-005, AC-010, AC-012, AC-015 | 0 | n/a | n/a | n/a | 0 | 0 |
| subagent lanes (no card, identity unbound) | 4 author lanes (T-40 to T-43) | 4/4 accepted at the final verdict; T-43's first QA accepted with three defects | n/a | 112 or less to 303 or less (shared-slot waits) | 5 accepts (T-40 to T-44) | 1 lane relieved after retry loops (CS-021) |

Verifier cross-checks: still only 1 two-verifier lane (T-04). Hosted CI on the exact commit agreed with 2 AC-014 accepts (T-14, T-35). AC-014's six rejects were all followed by a repair that the next review accepted. That supports the rejects being substantive; it does not measure false-reject or false-accept rates.

Times marked "or less" are bounded by coordinator lines, not worker ACK lines. One verdict line (T-35) is stamped in local time labelled UTC (CS-019); its corrected time comes from the log position and the meter.

## Quality under constraint (what evidence exists per agent, and what is UNKNOWN)

| dimension | evidence that exists | UNKNOWN |
|---|---|---|
| Quality | log verdicts per task (first pass, reject class, rework rounds) for AC-001, AC-002, AC-003, AC-006, AC-007, AC-014; verifier mutant batteries and hosted CI results in log lines; single-rater advice scores for AC-011 and AC-013 | false-accept and false-reject rate of any verifier (1 two-verifier lane in 12 h); whether log verdicts match validated receipts (CS-015); quality on any task class seen once; anything about MiMo V2.6 pro (no work) |
| Privacy | every agent ran on a hosted route (OpenRouter free and paid, NVIDIA hosted, DeepSeek, an OpenCode free route, and Claude subagents); no local inference | each route's retention and training-use terms (a model-facts registry question); what each seat sent off-host (no request logging) |
| Latency | one first-response probe per Nemotron route; per-task wall-clock times; active-interval output rates from rounded counters per Pi seat; two upstream idle timeouts, one recovered and one terminal | time to first token, tokens per second per route, p50/p95; how much of any task time was queueing, rulings or host load (the host ran several heavy suites at once all morning, CS-012, CS-021) |
| Cost | routes are labelled free or paid; one premium call cost about 0.50 USD (operator, rounded, CS-010); token counters per Pi seat in `data/meter-intervals.tsv` | price per token on the DeepSeek and OpenRouter paid routes; total spend; cost per accepted task |
| Record integrity | the meter's clock let one mis-stamped verdict line be corrected (CS-019) | how many other hand-written stamps are off; nothing checks them |

None of these rows ranks agents. A per-agent quality claim needs the controlled minimums in `evals/model-hygiene-trial.md`.

## Replay first (final)
1. CS-001 treatments A/B/C, with the governance tool version pinned. In the field, treatment B coincided with 2 of 2 free-route reworks and 9 of 13 paid-route first passes accepted. That is the strongest field signal in the window, and it has no control.
2. CS-020 treatment C (flat counters plus no DONE triggers a pane read and a stall line), then the transport-drop fixture. It is the only lane lost in the window.
3. CS-012 treatment C (non-blocking wait), and CS-021 treatment C (a lease that refuses a forbidden heavy suite). Both concern holding direction on a loaded host.
4. CS-014 treatment B (allow "unknown") and CS-019 treatment C (the log tool stamps the time): two record-integrity fixes, both cheap.
5. CS-009, CS-007 and CS-015: identity read-back, a limit detector with a transport-error class, and validated receipts, before any provider table or verdict tally is trusted.
6. CS-017 treatment B (a sanctioned scratch area), now with 4 field instances by 4 agents.
