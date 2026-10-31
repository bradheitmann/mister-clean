# Note for the model-facts registry PM (provider facts seen in a field window)

From: the eval seat, 2026-10-31, refresh 1. These are observations, not verified records. Agent cards point at model-facts registry ids; they do not copy these facts. Bind or reject each line.

## Observed provider facts (all low confidence unless stated)
| fact | value | source | n | confidence |
|---|---|---|---|---|
| Nemotron 3.5 Super, first-probe latency on OpenRouter free | 0.35 s (one tiny prompt) | operator probe | 1 | low |
| Same model, NVIDIA hosted | 9.2 s (same prompt) | operator probe | 1 | low |
| Rate-limit headers | none returned by either route | operator probe | 1 each | low |
| Naming | OpenRouter label "nemotron-3.5-super-vl:free" vs NVIDIA id "nemotron-3.5-super-vl-120b-a12b" | seat titles | many | medium; same weights unverified |
| Free-tier ceilings reached | none in 31 minutes of sampling across about 9 free-route seats | meter | 173 samples | cannot bound a ceiling |
| Step 5 Preview (NVIDIA) speed | operator reports about 0.5 tok/s; a document seat finished a task in 2 minutes, so re-measure | operator | 1 | low, contradictory |
| Nemotron 3 Ultra 550B A55B (NVIDIA) | 12.8 tok/s on one 6 m 41 s answer | operator | 1 | low |
| Inkling (OpenRouter free), max reasoning | 47 s for one advisory answer | operator | 1 | low |
| A premium paid model on OpenRouter | about 0.50 USD per call at high reasoning | operator, rounded | 1 | low |
| DeepSeek flash | paid, described as cheap and good value (no price recorded here) | operator | n/a | qualitative |
| MiMo V2.6 flash and pro | paid on OpenRouter | operator | n/a | qualitative |
| Host input cap on one coordinator harness | 1,048,576 characters | seat message | 1 | medium (explicit message) |

## What this window cannot give you
- Per-hour allowance of any free tier: no limit was hit, so only a lower bound exists.
- Latency distributions: one probe per route. A usable measurement needs 20 or more probes per route at different times of day and a time-to-first-token field.
- Whether two routes serve the same weights.

## Suggested records to add
- A per-route record with fields: route id, model id, observed latency samples (n, p50, p95), observed limit events (text class, time), header presence.
- A cost-per-call field for premium routes (see the cost tripwire case in the eval folder).

## Correction (refresh 2)
The "host input cap" row is not a model-facts registry fact: 1,048,576 characters is the source project's configured input budget for one host profile, enforced by its own guard (see case CS-008). Sent to model-facts registry as delta 1, which recorded it as rejected-not-a-model-facts registry-fact. The premium-model cost row's subject is now named in delta 1 as well.

## Refresh 2 delta (data through 2026-10-31T04:48:40Z)
Rows are shaped like `the registry route/1 schema`. Route ids follow the schema's `route.<provider>.<provider-model-id>` form where the provider model id is visible in the pane title; otherwise UNATTRIBUTED. Every model id is title_only (read from a pane title, not a request receipt). Window for every row: 2026-10-31T02:37:33Z to 04:48:40Z unless stated. Only facts with evidence are listed; nothing here is a tariff.

| route id | model id (as titled) | provider | observation (n, window) | context |
|---|---|---|---|---|
| route.openrouter.xiaomi-mimo-v2.6-flash | xiaomi/mimo-v2.6-flash | openrouter (paid, per operator) | limit_events: 0 rate-limit events over 7 seats, 03:37Z to 04:48Z (12 to 13 samples each, about 70 min) | Pi harness, reasoning label high; cross-family verifier seats |
| route.openrouter.xiaomi-mimo-v2.6-flash | xiaomi/mimo-v2.6-flash | openrouter | limit_events: 1 transport error, text_class "upstream idle timeout exceeded", at 2026-10-31T04:43:37Z, headers_present unknown; recovered by the next sample (n = 1) | one verifier seat mid-review; it issued a verdict 4 min later. Not a quota event |
| route.deepseek.deepseek-flash | deepseek-flash | deepseek (paid, per operator) | limit_events: 0 over 12 Pi seats, 02:37Z to 04:48Z (3 more OpenCode seats carry a DeepSeek flash label at other reasoning levels) | 7 of the 12 are new pair workers from about 03:35Z |
| route.deepseek.deepseek-v4-pro | deepseek-v4-pro | deepseek (paid) | limit_events: 0 over 1 seat, 131 min | one seconded worker seat |
| route.openrouter.nvidia-nemotron-3.5-super-vl-free | nvidia/nemotron-3.5-super-vl:free | openrouter (free) | limit_events: 0 over 3 seats, 131 min; latency: no new probe (still n = 1 from refresh 1) | Pi and OpenCode harnesses; at least 12 task events across all free routes in the window |
| route.nvidia.nvidia-nemotron-3.5-super-vl-120b-a12b | nvidia/nemotron-3.5-super-vl-120b-a12b | nvidia | limit_events: 0 over 2 seats, about 125 min | same-weights question against the OpenRouter free route still open |
| UNATTRIBUTED | Step 5 Preview (OpenCode label) | nvidia | limit_events: 0 over 2 seats, 131 min; no task after 02:23Z, so no new speed data | the provider model id is not visible in the OpenCode title |
| UNATTRIBUTED | Nemotron 3 Ultra 550B A55B (OpenCode label) | nvidia | limit_events: 0 over 1 seat, 131 min; no new answer timed | advisory seat |
| UNATTRIBUTED | MiMo-V2.6-Pro, MiMo-V2.6-Flash, Inkling (free) (OpenCode labels) | openrouter | limit_events: 0 over 4 seats, 131 min | provider model ids not visible in OpenCode titles |

Correction to refresh 1 row "Free-tier ceilings reached": still none, now over 131 minutes and 1,099 samples. Still a lower bound only.

What this delta cannot give you: tariffs for any paid route (none recorded in the log), headers on the timeout (not visible in a pane), and whether a mimo-flash call on the Pi harness and on the OpenCode harness resolve to the same provider model (the OpenCode title shows no provider id).

## Final delta (meter 2026-10-31T02:37:33Z to 14:33:26Z; event log through 14:40:25Z)
Rows are shaped like the registry's route/1 schema, with the same conventions as the refresh 2 delta. Every model id is title_only. The window for every row is the whole meter window unless stated. Throughput figures are output tokens summed over the 5-minute intervals in which a Pi footer counter moved, divided by that active time. The counters are rounded by the harness and include tool time, so they are observations of a seat, not API rate measurements. Evidence only; nothing here is a tariff or a quota.

| route id | model id (as titled) | provider | observation (n, window) | context |
|---|---|---|---|---|
| route.openrouter.nvidia-nemotron-3.5-super-vl-free | nvidia/nemotron-3.5-super-vl:free | openrouter (free) | limit_events: 0 rate-limit or quota events over 4 seats (2 Pi, 2 OpenCode), 6,783 samples in total, about 11 h 56 min | Pi harness level high; OpenCode level thinking |
| route.openrouter.nvidia-nemotron-3.5-super-vl-free | nvidia/nemotron-3.5-super-vl:free | openrouter (free) | limit_events: 1 transport error, text_class "Retry failed after 3 attempts: Upstream idle timeout exceeded", at 2026-10-31T05:59:20Z; not recovered (same text for 103 samples, to 14:33Z); headers_present unknown (n = 1) | Pi harness; ended a worker's lane. Not a quota text; whether the free tier signals throttling this way is unknown |
| route.openrouter.nvidia-nemotron-3.5-super-vl-free | nvidia/nemotron-3.5-super-vl:free | openrouter (free) | throughput: about 129k output tokens in 75 active minutes on 1 Pi seat (about 103k per active hour; at most 120k in any 60 minutes), 04:43Z to 05:54Z | n = 1 seat; input delta not measurable (counter at 22M to 23M, 1M steps) |
| route.nvidia.nvidia-nemotron-3.5-super-vl-120b-a12b | nvidia/nemotron-3.5-super-vl-120b-a12b | nvidia | limit_events: 0 over 2 Pi seats, about 02:45Z to 14:33Z; throughput: 36k and 47k output over 35 active minutes each (about 62k and 80k per active hour) | Pi harness, level high; the same-weights question against the OpenRouter free route is still open |
| route.deepseek.deepseek-flash | deepseek-flash | deepseek (paid, per operator) | limit_events: 0 over 12 Pi seats and 3 OpenCode seats; throughput: about 1.57M output over 13 active seat-hours on 11 Pi seats (about 121k per active hour; highest seat-hour 169k); 7 seats active in parallel 03:40Z to 04:30Z | Pi level high; OpenCode labels at levels max and low |
| route.deepseek.deepseek-v4-pro | deepseek-v4-pro | deepseek (paid) | limit_events: 0 over 1 seat; throughput: 126k output over 45 active minutes, 03:28Z to 04:48Z (coarse: the output counter moves in 100k steps above 1M) | one seconded worker seat |
| route.openrouter.xiaomi-mimo-v2.6-flash | xiaomi/mimo-v2.6-flash | openrouter (paid, per operator) | limit_events: 0 rate-limit events over 7 seats, 03:37Z to 14:33Z; transport errors: 1, recovered (reported in the refresh 2 delta; no further one); throughput: about 1.44M output over 11.9 active seat-hours (about 121k per active hour; highest seat-hour 218k); input about 10.3M (rounded), 6.6M of it on one seat | Pi harness, level high; verifier seats |
| UNATTRIBUTED | MiMo-V2.6-Pro (OpenCode label) | openrouter | limit_events: 0 over 2 seats; no task in the window, and context counters were flat or nearly flat | nothing here characterises this model |
| UNATTRIBUTED | MiMo-V2.6-Flash (OpenCode label) | openrouter | limit_events: 0 over 1 seat; no activity after 04:48Z | level thinking |
| UNATTRIBUTED | Step 5 Preview; Nemotron 3 Ultra 550B A55B (OpenCode labels) | nvidia | limit_events: 0 over 3 seats; no new task or timed answer after refresh 2 | no new speed data; the 0.5 tok/s operator report for Step 5 Preview was never re-measured |
| UNATTRIBUTED | Inkling (free) (OpenCode label) | openrouter (free) | limit_events: 0 over 1 seat; no new task after 03:05Z | |
| UNATTRIBUTED | Nemotron 3.5 Super VL Free (OpenCode label, "OpenCode" as the route) | opencode free route | label seen briefly on 1 seat before 03:00Z; no work | a third route for the same model name; provider model id not visible |

Correction to the refresh 1 row "Free-tier ceilings reached": still none, now over about 12 hours and 6,783 samples. Lower bound only.

What this delta cannot give you:
- time to first token or tokens per second for any route (no probes after refresh 1);
- tariffs for the paid routes;
- response headers on either transport error;
- whether the Pi and OpenCode labels for the same model resolve to the same provider model.

Orchestrator subagent lanes (log-named Claude models) are not route observations: no route or provider id is visible for them.
