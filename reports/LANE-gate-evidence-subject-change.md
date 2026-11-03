# Lane report: gate-evidence-subject-change (O-GATE-EVIDENCE-1)
Author: PM-MISTER-CLEAN (Claude). Base main 56c00cc, merged with main 8344246. DONE list charter/DONE/gate-evidence-subject-change.md (committed first, 2741b16).

## Finding (self-clean cycle 1)
The installed 7.3.0 `prepare` on this repository ended "repository-native gate evidence is structurally invalid; closeout preparation stopped: execution[node:.:ci-check].subject state transition disagrees with failure_reason". The runner's early-return branches (snapshot unavailable, executable changed/unavailable/unreadable, invalid cwd, operator skip) each recorded their own reason while passing a freshly captured end state. The PM had cut lane branches in the subject during the run (refs are part of the subject state), so start ≠ end while the reason said `snapshot_unavailable`. The validator (native-gate-validation.ts:306) was right; the runner was wrong.

## Change
`blockedExecution` (src/closeout/native-gate-runner.ts): when the subject's start and end states differ, it records `failure_reason: subject_repository_changed` and `state: blocked`, and prepends `subject repository changed while the gate was being prepared; superseded reason: <reason>` to the diagnostic. One place covers every early branch.

## Proofs (src/closeout/gate-evidence-subject-change.test.ts, 3/3) and mutants
The snapshot step is mocked to create a branch in the subject and then throw: a deterministic copy of the cycle-1 run.
| # | Proof | Mutant | Observed |
|---|---|---|---|
| 1 | changed subject + snapshot failure → subject_repository_changed, blocked, superseded reason in stderr, validator returns no "disagrees" error | record the passed-in reason | RED (1 failed; the `failure_reason` assertion fails first, before the validator assertion) |
| 2 | unchanged subject keeps snapshot_unavailable | always override | RED (1 failed) |
| 3 | operator skip with a changed subject is blocked, not skipped | keep the skipped state | RED (1 failed) |
Restore verified by hash (6fe26ed6f144).

## Gates
Double clean build:raw under bun 1.4.0 identical (pre-merge: bin a92a3d6b…, MANIFEST 12901723…); manifest:package:check PASS; tsc clean; audit:public PASS; charter strict ok; new + native-gates + bundle + skill-contract 201/201; SKILL.md 19,975 bytes. Post-merge hashes in the merge commit message. Full suite: hosted CI arbitrates.
