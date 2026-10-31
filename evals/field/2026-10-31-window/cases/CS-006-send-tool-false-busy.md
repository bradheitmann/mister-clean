# CS-006 — delivery tool reads an idle pane as busy (harness defect, not a model result)

status: observation; n = 1 seat, repeated attempts
class: infrastructure (excluded from any model rating)

## What happened
The orchestrator's message-delivery tool treats the word "Thinking:" left in a pane's scrollback as a live busy state. For one seat (an OpenCode pane) it returned "still thinking" for about 20 consecutive retries while the pane was idle. During the same window, a second seat's repeated "still thinking" results (four attempts over about three minutes) coincided with flat token counters for one 5-minute interval, so for that seat the busy state may be real (see CS-011). The two cases need different handling and one detector cannot tell them apart.

## Replication plan
- Fixture panes: idle with stale "Thinking:" text above the prompt; idle clean; truly generating; generating with a long silent reasoning phase.
- Detector must read only the live input and footer region.
- Verifier constant: a tool-state oracle, not a model.

## Durable eval case
input: four recorded pane screens; oracle: busy or idle label per screen; pass: 4 of 4

## Replay hint
Replay the screen captures offline. No model is involved, so this belongs in the harness test suite, not a model scorecard.

## Scrub notes
No project names.
