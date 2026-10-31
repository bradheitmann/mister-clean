# CS-011 — two stall candidates, neither confirmed

status: observation only; no pane was inspected for this record
class: stall candidates (to be confirmed or dropped at the next refresh)

## Candidate A — NVIDIA route, worker seat
A worker on the NVIDIA-hosted route (same model as the OpenRouter free route) showed zero counter change for one 5-minute interval, then the delivery tool saw it busy on four attempts over about three minutes, and counters moved again in the next interval. This fits one long generation, a slow route, a harness hang, or the CS-006 false-busy read. The first-probe latency measured earlier by the operator on this route was 9.2 s against 0.35 s on the OpenRouter route (one tiny prompt, n = 1).

## Candidate B — OpenRouter free route, QA seat
A QA seat on the OpenRouter free route had a context size flat at 73.5k tokens for the last 20 minutes of the sample after its review target was delivered (it was told to poll every 10 minutes). Its A/B twin on the NVIDIA route kept moving. Could be a missed poll, a long silent generation, or an idle wait.

## Next verification
Read the next two refreshes of the interval table; look for a posted limit or failure line from either seat; if none and counters stay flat for 30 minutes, record a stall with the seat's own explanation.

## Durable eval case
Do not create one until confirmed.

## Scrub notes
No names.

## Refresh 2 (data through 04:48Z)
- Candidate A: dropped. The worker delivered twice after the flat interval (T-01 rework at 03:09Z, T-08 re-confirmed at 03:09Z), and its counters moved later.
- Candidate B: persists, still unconfirmed. The QA seat's context size stayed flat for 26 of 27 samples (about 2 h 10 min). No verdict for its review task appears in the log, no limit or failure line was posted, and the stall watcher reported no truncation marker. Per the rule above (flat over 30 minutes with no posted line) this now qualifies to be recorded as a stall, but the seat's own explanation has not been collected, because this ledger does not read panes. Recorded as "stall, cause unknown" for the next refresh; a pane read by the operator would decide between idle-waiting and hung.
- Idle seats are not stall candidates: several seats had flat counters for the whole window with no assigned task in the log (see `data/meter-summary.tsv`, column max_flat_run).

failure_class: harness (if confirmed: a hang or a missed poll); not yet classifiable
