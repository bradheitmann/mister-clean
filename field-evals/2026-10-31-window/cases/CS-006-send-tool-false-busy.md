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

## Refresh 2 (data through 04:48Z)
A pair worker in a sibling repository delivered a sender sidecar (T-23) whose stated purpose is live-line busy detection that ignores scrollback, with a bounded wait and typed refusal records. It is unreviewed. When it lands, the fixture plan above is its acceptance test. CS-012 is a different case: there the pane really was mid-turn, so a correct busy detector still refuses delivery.

failure_class: harness

## Final refresh additions (log through 14:40:25Z)
- The opposite error, now evidenced: at 05:21Z the orchestrator logged that its sender refuses every mid-turn pane, while one harness (Pi) queues mid-turn input and shows it on a "Steering:" line. The refusal had blocked a STOP message for 50 minutes. A sibling repository then shipped a per-harness mid-turn policy (T-30): queue only where a captured read-back proves the queue, refuse elsewhere. Its verifier passed it with 0 defects. The sender sidecar from refresh 2 (T-23) was accepted with one medium finding, which became its own slice (T-32), also accepted.
- A message board tried in place of pane typing fixed the busy-recipient case (13 messages, 0 resends), but it left a message unread for 80 minutes when the recipient was idle and nothing woke it (T-34's re-review waited 90 minutes). A content-free one-line pane nudge got the message read in about 2 minutes. The source team's design conclusion: a board-backed queue plus a nudge plus an idle re-check.
- Fixture additions for the replication plan: a Pi pane mid-turn (expected: queue and read back); an idle pane with an unread board message (expected: nudge).
