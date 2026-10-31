# Field window findings — refresh 1 (data through 2026-10-31T03:09Z)

Evidence class: field (naturalistic). Under `evals/model-hygiene-trial.md` this is a separate ledger: nothing here is averaged into a controlled score and no row supports a ranking. Every identity is `title_only` or weaker (CS-009). Sample sizes are stated per claim; guesses are marked "guess".

Window so far: 31 minutes of 5-minute pane samples (173 samples, 29 seats) plus about 4 hours of task events from the operator log. The sampler keeps running to about 14:35Z; later refreshes replace this file.

## Q1. Same model, three routes: work per hour before limits, latency, truncation

| question | what the data says | n | confidence |
|---|---|---|---|
| Latency, OpenRouter free vs NVIDIA hosted, same model name | first-probe 0.35 s vs 9.2 s on one tiny prompt (operator probe, before the window) | 1 probe per route | low: one probe, no repeat |
| Limits hit | none on any route in 31 min; neither route returned rate-limit headers (operator probe) | 173 samples | cannot bound a ceiling from 25 min |
| Work per hour before a limit | not defined yet (no limit seen) | 0 events | none |
| Truncation | none observed (the sampler does not see output text) | 0 | none |
| Route switch mid-task | one worker was moved OpenRouter to NVIDIA mid-task and kept working | 1 | anecdote |
| Output rate on the NVIDIA route | about 48k and about 68k output tokens/h on two seats (counters rounded, windows of 15 to 20 min) | 2 seats | low |
| OpenRouter route output rate | not measurable: the comparable Pi seat on it showed flat counters (no task) | 0 | none |

Design problems found for the two planned pairs:
- Pair DEV-4 (OpenRouter) vs DEV-5 (NVIDIA), same harness (Pi): DEV-4 produced no task in the window and its identity is conflicted (CS-009). As an A/B it has no data yet.
- Pair QA-7 (OpenCode, OpenRouter) vs QA-5 (Pi, NVIDIA): harness differs, so provider and harness are confounded. Suggested fix: run the twin on the same harness (Pi on OpenRouter) before reading anything into it. The QA-7 side shows a possible stall (CS-011, B), unconfirmed.
- "Same model" on the two routes is a naming match (OpenRouter label "Nemotron 3.5 Super VL (free)", NVIDIA id "nemotron-3.5-super-vl-120b-a12b"). Same weights and quantisation are unverified.

What would answer Q1: one frozen task, same harness, both routes, 3 runs each, with a runtime receipt of the resolved model per request (CS-009 fix), measured in tokens per minute and time to first token.

## Q2. Free workhorses and how many tasks before free inference runs out

| model (card) | tasks delivered | first-pass accepted | notes |
|---|---|---|---|
| nemotron-3.5-super, Pi (AC-001) | 2 (one is the rework of T-01) | 0 of 1 reviewed | all functional proofs verified; rejected on doc shape (CS-001); rework delivered, re-review pending; second task unreviewed |
| nemotron-3.5-super, OpenCode (AC-002) | 1 | 0 of 1 | real defect plus doc shape (CS-002) |
| step-5-preview, OpenCode (AC-007) | 2 | 1 of 1 reviewed | operator reports it slow; not confirmed by the meter |
| inkling free, max (AC-013) / high (AC-008) | 2 (1 advisory, 1 audit) | n/a | advisory answer adopted with five faults (CS-004); audit delivered in about 46 min, unchecked |
| nemotron-3-ultra 550B (AC-011) | 1 | n/a (advice) | adopted; citation faults (CS-003); overall about 8 vs about 7 for Inkling, single rater |

- Tasks before a free route runs out: no limit event was observed, so this is a lower bound only: at least 8 tasks (6 worker deliveries, 2 advisory answers) and at least 31 minutes of about 9 free-route seats without a limit banner. That says almost nothing about a ceiling (guess: any ceiling that exists is a day-scale quota, not visible in 31 minutes).
- The two Nemotron Super rejections share one gate (CS-001, CS-002). Until the contract-vs-gate hypothesis is tested, they are not evidence about the model's coding quality.
- Viable workhorse is not decided by this window. A model is a viable worker only if rework converges; no rework has completed yet.

## Q3. Per agent (task, first-pass verdict, reason, rework, speed, stalls, ratings)

Full per-task rows are in `data/tasks.tsv`, per-card tables in `cards/`. Summary:

| card | tasks | first-pass | reject class | rework | speed (ack to done) | stalls | rating |
|---|---|---|---|---|---|---|---|
| AC-001 pi nemotron super | 2 | 0/1 reviewed | process-contract | 1 rework delivered | 30 min, 26 min | 1 candidate | none |
| AC-002 opencode nemotron super | 1 | 0/1 | functional + process | pending | 26 min | 1 candidate | none |
| AC-003 pi deepseek-flash high | 1 as worker, 3 reviews | worker pending | n/a | n/a | 53 min incl. about 23 min wait | 0 | verifier: 2 rejects, both evidence-backed, plus 1 corroborating accept |
| AC-007 opencode step-5-preview | 2 | 1/1 | none | none | 23 min; 2 min for a document | 0 | none |
| AC-009 opencode mimo-flash | 1 review | accept | n/a | n/a | review 17 min | 0 | none |
| AC-011 / AC-013 / AC-008 | advisory x2, audit x1 | n/a | n/a | n/a | 6.7 min / 0.8 min / 46 min | 0 | about 8 / about 7 / unchecked |

Verifier timings (minutes from DONE to verdict): 26 and 38 (AC-003, rejects), 17 (AC-009, accept). One verifier per task; no verifier was cross-checked, so verifier accuracy is unknown.

## What changed my confidence and what to replay first
1. CS-001 treatments A/B/C: cheapest test, and it decides whether two rejections belong to the tuple or to the contract.
2. CS-003: a citation trap with a deliberately wrong premise and a mechanical resolver; cheap and decays slowly.
3. CS-009 / CS-007: fix identity binding and the limit detector before trusting any limits or provider table.
4. CS-011: confirm or drop both stall candidates next refresh.

Not yet covered (next refreshes): rework outcomes for the two rejected tasks, the A/B twin verdicts, the audit of 15 claims by a free model, per-hour counters over a longer window, and the Claude Code subagents (identity not recorded in the log, so they would be `identity_unbound` rows).

## Refresh-1 additions (03:09Z)
- A second verifier on the same lane independently corroborated an ACCEPT (5 of 5 mutants red). Two verdicts on one lane is wasted effort and also the only cross-check of a verifier so far: agreement 1 of 1.
- The rework of the first rejected task arrived after the reject (renumbered proofs plus a mutant), consistent with the contract-versus-gate hypothesis but not a test of it (CS-001 update).
- An audit seat on a free model checked 15 claims in two reports: location 9 of 15 exact or approximate, value 7 of 15 (4 approximate), effect 15 of 15. That scores the audited reports, not the auditor.
- A truncation and stall marker watcher was reported implemented by the operator (markers: truncated, max output tokens, stream ended, context window exceeded; up to 3 continue pings 5 minutes apart, then a stall line). Next refresh can count truncations per route from its log lines.
