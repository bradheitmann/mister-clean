# DONE: language-policy-root-debts (O-LANG-POLICY-2)
Slice: language_policy findings become closeout root debts, so a CLOSE run cannot report CLEAN while a declared language policy is violated. Detector registry v6 (v5 plus `language_policy`, always required, basis `core_closeout`); regression delta schema 1.6 binds registry "6"; schema 1.5 stays pinned to registry "5".
Base bytes: feat/language-policy-detector 177d7102640a79fd9350d1839ab00bd65b48462c (PR #66).
Ships in: 7.6.0.

Reopen prefix for every test command: `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run --testTimeout=120000`.

Proofs (each: green, mutant RED, restore; recorded in reports/LANE-language-policy-root-debts.md):
1. The registry v6 hash is frozen; the v1 to v5 hashes are unchanged.
   - reopen: `src/closeout/detector-coverage.test.ts`
   - mutant: edit a v5 entry → RED.
2. CLOSE on a fixture with a tracked forbidden file → NOT_CLEAN with exactly one language_policy root debt (normalizer `mister-clean/language-policy-root@1`, cause key `{detector_family, path, extension}`, observation id from `mister-clean/language_policy@1`), and the bundle validates.
   - reopen: `src/closeout/language-policy-root-debts.test.ts -t "debt"`
   - mutant: drop the debts → RED.
3. No policy file → a not_applicable language_policy execution with zero fingerprints, zero language_policy debts, and a valid bundle.
   - reopen: `src/closeout/language-policy-root-debts.test.ts -t "no policy"`
   - mutant: emit a debt anyway → RED.
4. A fixture bundle minted at registry 5 / regression 1.5 (as 7.4.0 writes) still validates.
   - reopen: `src/closeout/language-policy-root-debts.test.ts -t "1.5"`
   - mutant: accept only the current registry version → RED.
5. A tampered bundle missing its language_policy debt is refused by the validator.
   - reopen: `src/closeout/language-policy-root-debts.test.ts -t "tampered"`
   - mutant: remove the language_policy projection branch → RED.
6. The live and action-boundary reruns include language_policy.
   - reopen: `src/closeout/language-policy-root-debts.test.ts -t "rerun"`
   - mutant: leave language_policy out of the live row → RED.
7. This repository: `prepare` on a frozen clone of the lane tip lists the remaining hand-written .mjs files as language_policy root debts; the count is recorded verbatim.
   - reopen: `mister-clean prepare <frozen clone>` and read `closeout-report.json` completion_debts.
   - mutant: n/a (observation).
8. Regression: bundle, prepare, regression, detector-coverage, skill-contract and action-lifecycle tests green; `tsc --noEmit`; `charter check --strict`; `audit:public`; double clean `build:raw` identical under bun 1.4.0 plus `manifest:package:check`; full `pnpm run test:node` once, every red classified.
   - reopen: the commands as named.
   - mutant: n/a (regression set).

Out of scope (recorded obligations): porting the remaining .mjs files; the 7.6.0 version bump and release.
Owner decision points: none open (7.6.0, v6 always required, 1.6 binds 6, 1.5 pinned to 5 decided by PM).
