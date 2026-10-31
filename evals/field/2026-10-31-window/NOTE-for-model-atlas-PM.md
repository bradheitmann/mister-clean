# Note for the model-atlas PM (provider facts seen in a field window)

From: the eval seat, 2026-10-31, refresh 1. These are observations, not verified records. Agent cards point at model-atlas ids; they do not copy these facts. Bind or reject each line.

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
