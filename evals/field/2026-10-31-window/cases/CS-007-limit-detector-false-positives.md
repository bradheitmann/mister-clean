# CS-007 — rate-limit banner scan matches instruction text echoed in scrollback

status: observation; measurement validity
class: measurement defect (excluded from model ratings)

## What happened
A 5-minute pane sampler greps each seat's screen for limit phrases (429, rate limit, quota, too many requests, insufficient credit). In the first 30 minutes (173 samples, 29 seats) the raw hit count was 16 samples across 4 seats and the true provider-limit count was 0. Every hit was text the seat itself had printed: a contract line telling it how to report a limit (6 samples), the sampler's own regular expression echoed through a shell command (1 sample), a repeated sampler line (2 samples), and a host input-size cap on a coordinator pane (7 samples, a real limit but not a provider or model one, CS-008).

## Why it matters
Any "limits per hour" figure from this sampler is inflated unless template and echo text are filtered. The derive script in `tools/` filters template markers and shell alternations and reports raw and candidate counts side by side.

## Replication plan
- Replay the committed derive script over a fixture meter file containing known echoes and one injected real banner.
- Verifier constant: the injected banner must count once and the echoes zero.

## Durable eval case
input: synthetic meter TSV (provided later under `tools/fixtures/`); pass: candidate count equals the injected count

## Replay hint
Do this before trusting any limits table from a pane sampler.

## Scrub notes
Counts only.
