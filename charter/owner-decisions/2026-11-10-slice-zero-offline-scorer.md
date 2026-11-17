# Decision 2026-11-10 (relayed): Slice Zero is the offline scorer

## What this record is, and is not
This file records a decision that reached this repository through the acting EXEC-PM (seat A), not in the owner's own words. The project PM did not hear the owner state the rule quoted below. It is filed here because the owner decision of 2026-11-04 (2026-11-04-s5-slice-zero.md) says Slice Zero is "redesigned with the owner", and this is the answer that came back. The owner can overrule it in one line; if he does, this file gets an "Overruled" section and charter/DONE/slice-zero.md is replaced again.

## The rule, as relayed
From the decision packet A sent to two reviewers on 2026-11-10 at about 16:35Z (PACKET-1-2026-11-10.md in the fan-out folder's a-decisions directory, private):

"The owner's standing rule (today): product and engineering decisions are made by the orchestrator; two independent second opinions from other model families that agree with the recommendation make it approved; he is told afterwards."

## The decision
Item D2 of that packet asked what this repository's redone foundation proof should be. The options were (a) an offline scorer that reads test cases plus saved model answers and calls no model, (b) a judge-made fixture run end to end, and (c) a replay of the old failure. A recommended (a), with (b) as the second slice. Both reviewers agreed, each without reading the other: a Codex seat (GPT) and a Kimi seat. A's record of the outcome (DECISIONS-1-2026-11-10.md, same directory, about 16:43Z):

"D2 mister-clean's foundation proof: the offline scorer first (test cases plus saved, identity-bound model answers, negative controls, reopened results, including one decision-shaped task with a label oracle); the judge-made fixture run is the second slice. The existing Slice Zero DONE (CS-001 replay) is REPLACED through that repo's charter by its PM citing this decision; an offline run is not relabelled as compliance with the old proof. It proves the scorer, not fresh generation or judge accuracy."

Item D3 of the same record bears on how the answers are collected: "Model-calling eval code: private adapter first, excluded from the public package and its advertised capabilities; revisit after the first qualified verdict. Private cases and secrets stay outside the repository".

## What the reviewers added, and where it went
- The Codex reviewer: offline scoring proves neither fresh generation nor judge accuracy and qualifies no model; replace the old scope through the charter before claiming Slice Zero. Both points are in the DONE list's first paragraph.
- The Kimi reviewer: the fixed cases must include correct, wrong, malformed, unknown and persisted-cost cases, and must expose insufficient evidence instead of blessing it; saved answers without subject identity or stable expected values would certify noise. These are the fixture subjects, the `insufficient_evidence` outcome, the `identity_bound` field and the oracle check of the DONE list.

## What changed in this repository
- charter/DONE/slice-zero.md is replaced as a whole. The earlier list (the CS-001 replay) stays in git history; it was never dispatched on main.
- charter/charter.toml `[slice_zero]` names the offline-scorer run. `proven_on` is set only from the real run that the DONE list's proof 6 describes, after an independent reviewer of another model maker has reopened it.
- The scorer and its case sets live in offline-scorer/, outside the published package.

## Limits
- This decision schedules one slice. The judge-made fixture run, any model-calling code in this repository, and any routing work each need their own DONE list.
- INTENT.md and GUARANTEES.yaml are owner-ratified and are not edited by this slice. G2's proof text still names the earlier shape; reconciling it is an open item for the owner.
