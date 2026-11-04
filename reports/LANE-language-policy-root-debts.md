# LANE language-policy-root-debts (O-LANG-POLICY-2)
Author: Claude dev subagent dev-lang-policy (Claude Code, Opus 5.5) under PM-MISTER-CLEAN. Ships in 7.6.0.
Branch `feat/language-policy-root-debts`, stacked on `feat/language-policy-detector` 177d710 (PR #66, still open; main is merged in once it lands, on the PM's word).
DONE list: `charter/DONE/language-policy-root-debts.md`, committed first (b964d0f), unchanged.

## What changed
- **Registry 6** (`src/closeout/detector-coverage.ts`): the previous current list is now the frozen `DETECTOR_REGISTRY_V5`, unchanged, so its hash `35d8e9e9…47ee6` holds. `CLOSEOUT_DETECTORS` is v5 plus `language_policy` (scope `tracked_shippable`, command `mister-clean audit language-policy . --json`, detector `mister-clean/language_policy@1`). It is always required with basis `core_closeout`. The new frozen hash is `0dac946a95de2c084c76502f7274fad45d757750c8277a052adbfde6a9965317`.
- **One registry per schema**: `registryVersionForRegressionSchema` maps 1.6 to 6, 1.5 to 5, and older schemas to 1. There is no either-or.
- **Coverage writer**: `createDetectorCoverage` takes the registry version (default 6). The result-shape and fingerprint validators now cover the language-policy result.
- **Regression delta 1.6**: `prepare` writes 1.6, which keeps the schema-1.5 accounting. `bundle-regression.ts` and `bundle-detector-evidence.ts` accept 1.6 and resolve the registry from the record's schema at every former current-registry default:
  - the coverage version gate;
  - action-comparator required ids;
  - comparator detector lookups;
  - observation source ids;
  - the baseline-replay registry hash.
- **Debts** (`prepare`): one root debt per finding via `baselineDebt`:
  - normalizer `mister-clean/language-policy-root@1`;
  - cause key `{detector_family, path, extension}`;
  - disposition `autonomously_repair`;
  - repair boundary `file:<path>`;
  - observation id from `mister-clean/language_policy@1`.

  The report gains `language_policy_accounting` and a census count.
- **Validator**: `detectorRootProjections` has a language_policy branch.
- **Live rerun** (`bundle-live-validation.ts`): reruns under the bundle's own registry. Registry 5 never runs language_policy; registry 6 does. A malformed live policy is reported as an error, not a crash.
- **Action boundary**: snapshots come from `prepare`, so comparators rerun language_policy. `beginAction` also refuses a bundle minted under another registry.
- **Tests**: the bundle.test fixture keeps minting regression 1.5 / registry 5, so its 120 tests keep exercising the 7.0 to 7.5 shape. prepare.test and detector-coverage.test expectations moved to 1.6 / 6. One validator message changed to "schema 1.5 or later".
- **Release check**: `scripts/verify_packed_cli.mjs` now expects schema 1.6. This is one literal plus its message, and the file is still open port debt.
- **Docs**: README and `references/no-harm-and-debt-delta.md`. SKILL.md is unchanged at 19,975 bytes.

## Proofs
Reopen prefix: `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run --testTimeout=120000`. Each mutant was applied by sed (the script refuses a mutant that does not change the file), run, and restored from a byte copy (cmp identical). The test was then rerun green.

| # | Test | Green | Mutant | Mutant result | Restored |
|---|---|---|---|---|---|
| 1 | `detector-coverage.test.ts -t "canonical ledger universe"` | 1 passed | v5 entry `github_actions@3` changed to `@4` | RED | 1 passed |
| 2 | `language-policy-root-debts.test.ts -t "debt:"` | 1 passed | `...languagePolicyRootDebts` removed from the completion debts | RED | 1 passed |
| 3 | `-t "no policy"` | 1 passed | a fake debt emitted for a not_applicable result | RED | 1 passed |
| 4 | `-t "1.5"` | 1 passed | coverage gate set to `requiresRuntimeIdentity ? "6" : "1"` | RED | 1 passed |
| 5 | `-t "tampered"` | 1 passed | language_policy projection branch renamed away | RED | 1 passed |
| 6 | `-t "rerun"` | 1 passed | live row disabled | RED | 1 passed |

Proof 4 cross-version evidence, beyond the in-suite 1.5 bundle:
- A temporary detached v7.4.0 worktree (a1f39eb) ran `prepare` on a fixture repository that declares a policy and tracks a forbidden file. The worktree was removed afterwards and recorded in LIFECYCLE.md.
- The minted bundle has `schema_version 1.5`, `registry_version 5`, `registry_sha256 35d8e9e9…47ee6`, and four required detectors.
- `validateBundleFile` returns `{"errors":[],"ok":true}` for it, both with this lane's code and with 177d710.
- `mister-clean validate bundle` refuses it identically with both codebases, with one error: `runtime_identity: must exactly equal the live verifier-minted runtime identity`. That is the existing binding to the exact runtime doing the validation, unrelated to the registry.

## Proof 7: this repository
`prepare` ran on a frozen `--no-hardlinks` clone of b718408 for 11 minutes, with native gates included. The verdict is NOT_CLEAN with 18 total root debts, of which 15 are language_policy debts. `language_policy_accounting` reports:

```
status fail, tracked_path_count 452, finding_count 15, generated_exempt_count 2, allowed_count 0, root_debt_count 15
```

The 15 debt paths:
```
scripts/build_model_scorecard_interactions.mjs
scripts/generate_codebase_history.mjs
scripts/generate_materials.mjs
scripts/generate_release_attestation.mjs
scripts/prepare_release_archive.mjs
scripts/publish_release_archive.mjs
scripts/release_archive_contract.mjs
scripts/release_capsule.mjs
scripts/release_path.test.mjs
scripts/render_case_study_report.mjs
scripts/render_model_scorecard.mjs
scripts/report_snapshot.mjs
scripts/sync_cli.mjs
scripts/verify_package_exports.mjs
scripts/verify_packed_cli.mjs
```
The count is 15, not 7, because PR #61, which ports eight of these, is not on this base.

## Proof 8: regression
- Targeted tests, all green:
  - detector-coverage, prepare, regression-accounting, both language-policy files, second-pass, run-receipt, finding-anchors, records and hardening: 144/144;
  - bundle and action-lifecycle: 134/134;
  - skill-contract and cli: 66/66.
- `tsc --noEmit` is clean. `charter check --strict` is ok (pinned b9323cd). `audit:public` PASS (83 files).
- Two clean `build:raw` runs under bun 1.4.0 are identical: bin `c97344df…6d05`, MANIFEST `d5f6bf03…0cd0`, dist tree `075aa61c…336d`. `manifest:package:check` PASS (82 entries).
- Full `pnpm run test:node` on b718408: 59 files, 922 passed and 5 failed. All 5 are `scripts/verify_generated_candidate.test.ts`. The host lang-guard hook refuses that test's scratch commit of a generated `.js` (5 lang-guard refusals in the log). These are environment-class failures. Main fixes them in 94a991a (the fixture carries the owner's `.lang-guard-allow`), which is not on this stacked base. They should clear when main is merged in.

## Recorded obligations
- Merge origin/main once PR #66 lands, then rebuild the packaged bytes under bun 1.4.0.
- The 7.6.0 version bump and release.
- Port the remaining .mjs files, including `verify_packed_cli.mjs`.
