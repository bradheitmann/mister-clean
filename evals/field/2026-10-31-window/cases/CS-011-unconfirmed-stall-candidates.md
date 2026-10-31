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
