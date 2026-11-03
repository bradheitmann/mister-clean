# DONE: gate-evidence-subject-change (O-GATE-EVIDENCE-1)
Slice: when the subject repository changes while a native gate is being prepared and an early step then fails (snapshot unavailable, executable changed, invalid cwd, …), the runner recorded the early step's reason while its own start and end subject states differed, so `prepare`'s validator rejected the run as "structurally invalid … subject state transition disagrees with failure_reason". A subject change outranks every other reason; record it, keep the superseded reason in the diagnostic.

1. Snapshot failure during which the subject changed (a branch is created, then the snapshot throws): the execution's `failure_reason` is `subject_repository_changed`, `state` is `blocked`, stderr names the superseded reason, and `validateNativeGateCoverage` returns no error.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/closeout/gate-evidence-subject-change.test.ts -t "snapshot"`
   - mutant: record the passed-in reason regardless of the states → the validator reports "subject state transition disagrees with failure_reason" → RED.
2. Snapshot failure with an unchanged subject still records `snapshot_unavailable` (the override is conditional).
   - reopen: `… -t "unchanged"`
   - mutant: always record subject_repository_changed → RED.
3. An operator skip during which the subject changed is recorded as blocked/subject_repository_changed, not skipped, and validates.
   - reopen: `… -t "skip"`
   - mutant: keep the "skipped" state when the subject changed → RED.
4. Unchanged: `src/closeout/native-gates.test.ts`, `src/closeout/bundle.test.ts`, `src/skill-contract.test.ts` green; SKILL.md byte count unchanged; `tsc --noEmit`; `charter check --strict`; `audit:public`; packaged bytes double-built under bun 1.4.0 with `manifest:package:check` PASS.
   - reopen: the commands as named.
   - mutant: n/a (regression set).
