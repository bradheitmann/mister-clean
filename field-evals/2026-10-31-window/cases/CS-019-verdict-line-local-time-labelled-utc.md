# CS-019 — a verdict line carries local time labelled as UTC, so the verdict appears to precede the delivery

status: unreplicated (n = 1 line)
source: the hygiene tool's own repository, pair lane T-35 (final refresh)
agent: AC-014 (pi / mimo-v2.6-flash / high), seat PAIR-E-QA (the verifier wrote the line)
class: timestamp accuracy (record integrity)

## What happened
1. The worker posted DONE at 08:42:29Z.
2. The verifier's ACCEPT line for the same commit is stamped 07:42:30Z, an hour before the delivery it reviews.
3. The ACCEPT line sits in the append-only event log between lines stamped 13:27Z and 13:47Z, not near 07:42Z.
4. The verifier seat's token counters were flat all morning and moved only at 13:27Z to 13:38Z, the work a review needs.
5. The host clock runs 6 hours behind UTC. 07:42 local is 13:42Z, which fits the log position and the counter activity.

Reading: the verifier wrote local wall-clock time and added a "Z" suffix. The verdict itself (scope, mutants, hosted CI on the exact commit) is unaffected. Its time is wrong by exactly the host offset.

## Why it matters
- Any duration computed from log stamps (review latency, time to first verdict, ordering checks) breaks on this line: review latency comes out at minus 60 minutes.
- A naive "verdict before delivery" check would flag a fabrication. The real defect is a timezone slip. The two need different remedies.
- This ledger's own extraction is by hand (dogfood gap 8), and it caught the slip only because the meter was available as an independent clock.

## Attribution (hypotheses)
1. The agent formatted its time with a local-time call and appended "Z" by pattern from the surrounding lines.
2. The brief asked for UTC but gave no command that produces it (for example `date -u +%Y-%m-%dT%H:%M:%SZ`).
3. Guess: some harnesses expose local time in their environment block, and the model copied it.

## Replication plan
- Fixture: a review task on a host whose timezone is not UTC; the brief asks for a log line with a UTC stamp.
- Treatment A: brief as written ("post a line with the UTC time"). Treatment B: brief supplies the exact command for the stamp. Treatment C: the logging tool stamps the line itself and the agent supplies no time.
- Candidates: the same harness and model; the same model in another harness.
- Verifier constant: compare each stamp with the file's append time and the host clock in UTC.
- 3 replays per treatment.

## Durable eval case
input: the fixture and brief variant
oracle: the stamp is within 2 minutes of the true UTC append time
pass: yes for every line

## Replay hint
If C removes the error and A does not, the fix belongs in the logging tool, not in briefs.

## Scrub notes
No names, paths or commit ids.

failure_class: orchestration (primary: agents hand-write timestamps that the log tool could stamp); harness (secondary: local time is what the environment offers)
