# Lane report: test-tmp-isolation (O-TEST-TMP-1; test side of O-TMP-1)
Author: PM-MISTER-CLEAN (Claude). Base main a1f39eb. DONE list charter/DONE/test-tmp-isolation.md (committed first, 1be5420).

## Finding
77 fixture dirs (`mister-clean-census-*`, `mister-clean-clean-ci-*`, `mister-clean-bundle-*`, …) accumulated in the shared temp directory over four days, and the native-gates "makes no progress" test flaked whenever another suite ran concurrently, because it looks for leftover snapshot dirs in the shared temp directory. The fixtures have teardown (e.g. bundle.test.ts afterEach removes every root); the leaks came from teardown that did not run or failed (hook timeouts under load, killed runs, an ENOTEMPTY race with a child still writing). Product code was checked: all four product temp roots (native-gate snapshot, live-native evidence, read-only index, git input) are removed in finally/catch, so the product leaks seen earlier were runs killed mid-way.

## Change
- `vitest.config.ts` (new; no other option changed, default include/exclude kept): `globalSetup: ["./scripts/test-tmp-root.ts"]`.
- `scripts/test-tmp-root.ts`: creates `mister-clean-test-run-*` under the starting temp directory, sets `TMPDIR` to it for the run (workers and child processes inherit it, `os.tmpdir()` reads it), and on teardown restores TMPDIR and removes the root (`maxRetries` for ENOTEMPTY/EBUSY races).
- tsconfig includes the three new TypeScript files.

## Proofs and mutants
| # | Proof | Mutant | Observed |
|---|---|---|---|
| 1 | tmpdir() is the run root | TMPDIR not set | RED |
| 2 | teardown removes nested non-empty root | teardown no-op | RED (and its root was left behind, removed by the PM afterwards) |
| 3 | live: during a run the root exists in the shared temp dir with the fixtures inside it, and is gone after the run | — | run root `mister-clean-test-run-Dipvbd`-style seen during a run, absent after (05:29:58 run); a first sampler using the `lsd` alias for `ls` was unreliable (it errors when entries vanish) and is not used as evidence |
Restore verified by hash (b99111aab870).

## Gates
Packaged bytes unchanged (no product file touched). tsc clean (covers the new files); bundle + gate-snapshot tests 131/131 and planning-config 20/20 under the config; skill-contract green; charter strict ok; audit:public PASS.
