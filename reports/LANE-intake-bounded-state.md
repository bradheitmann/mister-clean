# LANE intake-bounded-state (SEM-STATE-E79E176AE0FA)
Author: Claude dev subagent (Claude Opus 5.5). Branch `fix/intake-bounded-state` from origin/main d70f722. DONE list: `charter/DONE/intake-bounded-state.md`, committed first (a1a9515). Toolchain: bun 1.4.0.

## Change
`src/control-plane/runtime/evaluation-intake.ts`:
- `CAPTURED_DISPATCH_RECEIPTS_MAX_ENTRIES = 1024` caps the collector-bound dispatch receipt map. When the map is full, `start()` evicts the oldest entry in insertion order.
- `outcome()` refuses with `CapturedDispatchReceiptUnavailableFault` (a `ControlPlaneFault`, code `PRECONDITION_FAILED`) when the run's dispatch identity was bound by this intake's collector after this intake started, but the receipt is no longer held. Recognition is durable and needs no extra memory: a `pre_dispatch` row in `evaluation_identity_receipt_verifications` with this collector's observer id and `active_harness_selection`, whose rowid is above the high-water mark read at construction. The refusal runs before any evaluator, capture or write. Runs recorded before the intake started keep the existing restart path.
- The lease-binding check now runs before evaluator execution. Everything after it sits in `try/finally`, which removes the entry, so a throwing outcome cannot leak it.

**Deviation from the brief, stated.** The brief lists the lease-mismatch throw as one the `finally` should cover. That would let any caller holding the bearer release a genuine run's receipt by sending a forged lease. It would also break the existing end-to-end test, which sends a forged outcome and then expects the genuine one to earn credit. The forged-lease refusal therefore stays before the `try`, and the entry survives it. A new test asserts this. Evaluator failures and recorder failures after the lease matched do release the entry.

**Consequence to note.** A genuine outcome that throws after the lease matched cannot be retried for that run. The retry is refused with the typed fault. This is the fail-closed reading of proof 3.

## Proofs (each green, mutant RED, restored; original sha256 e43be599… re-verified after every mutant)
Test file: `src/control-plane/runtime/evaluation-intake-bounded-state.test.ts` (runs under `test:bun`). Reopen with `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 pnpm exec -- bun ./node_modules/vitest/vitest.mjs run src/control-plane/runtime/evaluation-intake-bounded-state.test.ts -t "<filter>"`.

| # | filter | green | mutant | mutant result |
|---|---|---|---|---|
| 1 | never exceeds | pass | eviction loop disabled | RED: expected 1025 to be 1024 |
| 2 | evicted run | pass | refusal line removed (fall-through) | RED: expected null to be an instance of CapturedDispatchReceiptUnavailableFault. The evicted run's outcome was accepted and recorded. |
| 3 | throwing outcome | pass | `finally` emptied, delete moved back to the success path | RED: expected 1024 to be 1023 |
| 4 | semantic audit | finding absent | constant and eviction removed | finding returns |

Proof 2 also asserts that the refusal leaves the row counts of trials, identity observations, receipt verifications and evaluation evidence unchanged, and that the collector was not called. A positive control in the same test shows a still-held run's outcome is recorded.

Proof 4 command: `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun src/cli.ts audit semantic . --json`, bounded_state_lifecycle ids:
```
before (d70f722):        SEM-STATE-E79E176AE0FA (evaluation-intake.ts), SEM-STATE-8CF757A62803, SEM-STATE-C6FB0796C5F5
after:                   SEM-STATE-8CF757A62803, SEM-STATE-C6FB0796C5F5
mutant (no constant,
  no eviction):          SEM-STATE-E79E176AE0FA, SEM-STATE-8CF757A62803, SEM-STATE-C6FB0796C5F5
```
The detector accepts the map because a `max…entries` identifier sits next to a real access of the field: the eviction loop condition. The insert and delete keys differ, so the balanced-key rule does not apply. The mutant confirms the bound is what clears it.

## Regression (proof 5)
- `pnpm run test:bun`: 32 files, 214 tests, all passed.
- Node suite files touching intake: none outside `src/control-plane/`. `src/skill-contract.test.ts` and `src/mister-clean-invocation-journal.test.ts`: 50/50 passed.
- `tsc --noEmit`: exit 0, after `build:materials` generated the ignored `src/generated-materials.ts` in the fresh worktree.
- `charter check --strict` (charter b9323cd): ok. `audit:public`: PASS (83 files).
- Packaged bytes: two clean `build:raw` runs under bun 1.4.0 gave identical 25-entry hash lists. Only `dist/control-plane.js` changed (b9433691… to 0606fa5d…). MANIFEST.sha256 is now ca19e67a…. `manifest:package:check` PASS (82 entries). SKILL.md is unchanged at 19,975 bytes.
- Full `pnpm run test:node`, pre-merge tip a98ebf5: 55 files, 907 tests, 902 passed, 5 failed.
- Merge: origin/main ef4987a merged at 38b44a6 with no conflicts. On the merged tree, two more clean `build:raw` runs under bun 1.4.0 gave identical hash lists. The merged MANIFEST.sha256 (dc577a49…) already matched, and `manifest:package:check` PASS. Post-merge results: tsc 0; audit:public PASS; charter strict ok; semantic audit still without SEM-STATE-E79E…; test:bun 214/214; skill-contract and journal 50/50; SKILL.md 19,975 bytes.
- Full `pnpm run test:node`, merged tip 38b44a6: 57 files, 915 tests, 910 passed, 5 failed.

### Classification of the reds (both runs, the same 5)
All five are in `scripts/verify_generated_candidate.test.ts`, a file this lane does not touch. **Environment, not this lane.** Each `git commit` in the test's temporary fixture repo is rejected by the host's global lang-guard commit hook ("this commit adds untyped code: bin/mister-clean.js, assets/codebase-state-dashboard/model-scorecard-interactions.js"). The fixture does not use the shared hermetic hook policy, so the host hook reaches it. Hosted CI has no such hook. Follow-up obligation for a later slice: make that fixture hermetic with `applyHermeticHookPolicy`.
