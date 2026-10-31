# CS-020 — a free-route transport error ends a worker's lane; nobody notices for 8.5 hours

status: unreplicated (n = 1 lane)
source: the source project, worker lane T-36 (final refresh)
agent: AC-001 (pi / nemotron-3.5-super / high), seat DEV-4, OpenRouter free route (title prefix "(openrouter) nvidia/nemotron-3.5-super-vl:free")
class: lane loss on transport failure (detection and recovery)

## What happened
1. At about 04:41Z the seat got a test-only lane: make integration-test scratch directories delete themselves. The contract required a DONE line in the event log.
2. Its counters moved from 04:43Z to 05:54Z: about 129k output tokens in 75 active minutes. This is the seat's first recorded work in the window.
3. At 05:59:20Z the pane showed `Error: Retry failed after 3 attempts: Upstream idle timeout exceeded`. The same text was still there in every later sample: 103 samples, until the meter closed at 14:33Z.
4. No DONE, limit or stall line was posted by the seat, the coordinator or any watcher. The log does not mention the lane again. (The pair-seat stall watcher was stopped as stale at 04:52Z. Whether any watcher still covered this seat is UNKNOWN.)
5. A read-only look at the lane's worktree after the window: no commit on the lane branch, one test file modified, and an index holding 121 of about 14,500 tracked paths. Every other path shows as a staged deletion plus an untracked file. The working files are intact. The index was last written at 05:18Z, while the seat was active and 40 minutes before the transport error.

## What is and is not shown
- Shown: a terminal transport error on a free route, with no retry after the harness's three attempts, and a lane lost without any signal in the log.
- Shown: the derived limit detector did not flag it. `banner_candidate` is 0 for this seat because the text has no rate-limit phrase (CS-007, dogfood gap 6).
- Not shown: whether a free-tier throttle presents itself as an idle timeout. The text names no quota and the other free routes saw no limit, but the window cannot rule it out (guess: a transport fault, not a quota).
- Not shown: how the index lost its entries. The seat's commands were not logged. Guesses: a git command with a narrow pathspec that rewrote the index, or an interrupted index write. The two events are 40 minutes apart, so the transport error did not cause it directly.

## Why it matters
- For the provider comparison, this is the only free-route event that ended work, and it was not a limit. "How many tasks before free inference ran out" stays unanswered, but "how many tasks before a free route dropped a lane" is now 1 in this window.
- A lane can die quietly. Every signal was available (the pane text, counters flat after 05:54Z, a missing DONE), but no rule turned them into an alert.
- A damaged index in a lane worktree is a successor trap: the next agent who runs `git add -A` there would stage the deletion of the whole tree.

## Attribution (hypotheses)
1. Harness: after three failed retries the turn ends with no further retry and no notification.
2. Orchestration: no rule of the form "a seat with a task, flat counters for 30 minutes and no DONE triggers a pane read", even though CS-011 proposed one.
3. Route: the free route's upstream dropped long idle streams (the paid MiMo route showed the same error text once, at 04:43Z, and recovered).

## Replication plan
- Fixture: a long agent turn through a proxy that drops the stream after a configurable idle gap.
- Treatment A: harness defaults. Treatment B: a harness retry policy with backoff beyond 3 attempts. Treatment C: A plus an orchestrator rule (task assigned, flat counters for 30 minutes, no DONE: read the pane and post a SEAT-STALL line).
- Verifier constant: the proxy's drop log and the event log.
- 3 replays per treatment; also replay the worktree state check (index entry count against the commit's tree) at lane close.

## Durable eval case
input: the fixture and treatment
oracle: (a) a stall or failure line within 35 minutes of the drop; (b) the lane is resumed or handed off; (c) at close the worktree index matches HEAD's tree count, or the difference is reported
pass: (a) and (c), plus (b) when a successor exists

## Replay hint
If C alone fixes detection, the gap is orchestration. If B removes the drop, the harness's retry ceiling is the cause.

## Scrub notes
No paths, branch names or project names. Counts are rounded.

failure_class: harness (primary: a terminal transport error after a fixed retry count, with no notification); orchestration (secondary: no flat-counter rule raised the lost lane)

## Resolution and second failure (team orchestrator, 2026-10-31, after the window)
The lane's worktree was worse than an uncommitted lane. Its index was broken (it tracked only a small fraction of the repository's files), and about 10,200 tracked files were missing from the working tree. Committing there with a stage-all command would have recorded a mass deletion. The team's orchestrator rebuilt the index from HEAD, restored the tracked files, and saved the lane's real partial work as a patch. Nothing was committed and nothing was lost.
- Detection: this ledger's read-only eval pass found it, not any watcher. The stall and delivery watchers saw a quiet pane, which is how a dead lane and an idle lane look alike. No check covered "a lane's worktree no longer matches its own HEAD".
- So the case has three failures in sequence: (1) a free-route transport error ended the lane (not a quota message); (2) the lane's worktree was left corrupted; (3) neither was noticed for about 8.5 hours.
- Replay addition: treatment D adds a periodic worktree-integrity probe to the watcher (index entry count versus HEAD tree count, plus tracked files missing from disk) and measures time to detection.
- Durable eval case addition: oracle (e) is the time from the terminal error to a human-visible alert. Pass: at most 15 minutes.
failure_class (addendum): orchestration (primary for detection: no integrity watch on lane worktrees); harness (secondary: the terminal transport error left no handoff or alert); environment (a free route's upstream timeout)
