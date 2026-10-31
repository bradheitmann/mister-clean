---
card_id: AC-004
harness: opencode
model: deepseek-flash
reasoning_label: max
identity_status: title_only   # model/reasoning read from the pane title or footer; not bound to a runtime receipt
evidence_class: field         # naturalistic; never averaged into a controlled score
window: 2026-10-31T02:37Z/open
model_registry_ref: unbound      # PM to bind to a model-facts registry record id; facts are not copied here
---

# AC-004 — opencode / deepseek-flash / max

Inference sources seen (a footnote, not part of the identity): DeepSeek (paid).

Seats that ran this tuple in the window: seat-7c34, seat-ccbb (later label)

## Work observed
- No scored task in the window yet.

## Categorical data (refresh 1, through 03:09Z)
| field | value |
|---|---|
| tasks delivered | 0 |
| stalls | 0 observed (context flat, seat idle) |
| provider limit events | 0 |

## Caveats
seat-ccbb's pane label moved Nemotron (OpenCode free) to Nemotron (NVIDIA) to this tuple within 25 minutes; any seat-ccbb output must be matched to the label active at its start.

## Refresh 2 (data through 04:48Z)
No new task in the log for this tuple between 03:09Z and 04:48Z; counts above are unchanged. Per-seat counter activity is in `data/meter-summary.tsv` (activity without a logged task is not counted as work).

## Final refresh (meter through 14:33:26Z, log through 14:40:25Z)
- T-38 (seat-7c34): read-only scoping of a pre-launch check, 26 min or less per the coordinator; recommendation (a scripted check, 0 model calls) adopted as the next lane.
- T-39 (seat-7c34): ran the scripted check in 69.8 min including a wait for a heavy-suite slot; result FAIL (the staged pairs do not qualify; this scores the pairs, not the worker); repeated on an updated base with the same result. Not reviewed by the window's end.
- seat-ccbb kept this label for the rest of the window and issued no verdict.

| field | value (final) |
|---|---|
| tasks delivered | 2 (T-38, T-39) |
| first-pass verdict | n/a (T-38 adopted by the coordinator; T-39 unreviewed) |
| speed | 26 or less; 69.8 including a queue wait |
| context growth | 672.2k to 715.5k tokens on seat-7c34 (OpenCode context size, not throughput) |
| stalls | 0 |
| provider limit events | 0 |
