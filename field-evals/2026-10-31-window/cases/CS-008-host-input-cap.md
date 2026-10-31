# CS-008 — a coordinator prompt refused at a host input-size cap

status: observation; n = 1
class: platform limit (not model quality); recorded by the operator as an uncharged coordinator limitation

## What happened
A coordinator seat tried to send a 1,398,846-character input to a host with a 1,048,576-character cap (1 MiB) and the job paused. The operator recorded it as a coordinator limitation, charged to nobody. The text stays visible in the pane, so it appeared in every sample.

## Replication plan
- Size ladder: inputs of 0.5, 0.9, 1.0, 1.1 and 1.4 times the cap against the same harness.
- Candidates: harness variants. Verifier: accepted or refused with the exact message.

## Durable eval case
input: ladder of generated filler documents with a canary line at the end; oracle: canary retrieved or refusal observed; pass: refusal is explicit, never silent truncation

## Replay hint
The failure to catch is silent truncation near the cap, not the explicit refusal.

## Scrub notes
Numbers kept (they define the test); no names.

## Correction at refresh 2 (PM review, 2026-10-31)
Reclassified: **project policy, not a platform limit.** The 1,048,576-character figure is the source project's own configured default input budget for one host profile (also used when no profile is set); the pause was that project's guard enforcing its configuration. Other profiles in the same project carry different configured budgets. No harness or provider transport cap was observed. The replay plan above tests the project's guard, not a host, so this case does not describe any agent or inference source and stays out of agent cards. The silent-truncation question remains a valid eval idea for real transport limits, but it needs a measured limit first.

failure_class: target_repo (the source project's own configured budget and guard, per the refresh-2 correction)
