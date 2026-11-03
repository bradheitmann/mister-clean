# DONE: test-tmp-isolation (O-TEST-TMP-1; test side of O-TMP-1)
Slice: test fixtures and the snapshots they trigger were created in the shared system temp directory. Teardown that timed out under load, a killed run, or an ENOTEMPTY race left 77 fixture dirs over four days, and a test that checks for leftover snapshot dirs flaked whenever another suite ran at the same time. Give every vitest run its own temp root, inherited by workers and child processes, and remove that root at the end of the run.

1. During a test, `os.tmpdir()` is a directory named `mister-clean-test-run-*` directly under the temp directory the run started with, and `process.env.TMPDIR` equals it.
   - reopen: `node ./node_modules/vitest/vitest.mjs run scripts/test-tmp-root.test.ts -t "inside the run root"`
   - mutant: globalSetup does not set TMPDIR → RED.
2. The teardown removes the run root and everything under it, including a nested non-empty directory, and reports what it removed.
   - reopen: `… -t "teardown removes"`
   - mutant: teardown does nothing → RED.
3. Live control: running `src/closeout/bundle.test.ts` and `src/closeout/native-gates.test.ts` leaves zero new `mister-clean-*` entries in the original temp directory.
   - reopen: the command recorded in the lane report (count before and after).
   - mutant: remove `globalSetup` from vitest.config.ts → the count after is non-zero → RED.
4. Unchanged: `pnpm run test:node` file set and flags; skill-contract green; SKILL.md byte count unchanged; `tsc --noEmit` covers the new TypeScript files; `charter check --strict`; `audit:public`; packaged bytes unchanged (no product file changes, so MANIFEST unchanged).
   - reopen: the commands as named.
   - mutant: n/a (regression set).
