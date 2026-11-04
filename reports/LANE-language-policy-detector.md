# LANE language-policy-detector (O-LANG-POLICY-1)
Author: Claude dev subagent (Claude Code, Opus 5.5) under PM-MISTER-CLEAN. Branch `feat/language-policy-detector`, base origin/main d70f722, merged origin/main ef4987a (merge, no rebase).
DONE list: `charter/DONE/language-policy-detector.md`, committed first (e8be267), unchanged.

## What changed
- `src/closeout/language-policy.ts`: policy loader (`mister-clean.language-policy/1`; keys schema, forbid_extensions, allow, generated; anything else refuses with `language_policy_invalid`), `.lang-guard-allow` read as extra allow, detection over `trackedShippablePaths` (tracked, extant; never a walk).
- `mister-clean audit language-policy <repo> [--json]`: exit 0 pass or not_applicable, 1 findings, 2 invalid policy (JSON refusal `{code, path, reason}`).
- `prepare` writes `language-policy-audit.json` into every bundle; the CLOSE receipt reads it as family `language_policy`.
- Receipts: family `language_policy`, new anchor kind `file`; content digest = sha256(rule\0extension), so editing the file keeps the fingerprint; second-pass treats the finding as held at the earlier HEAD when that HEAD tracked the path.
- This repository: `.mister-clean/language-policy.json` mirroring the owner rule, the two bundles as `generated`.
- Docs: README section and one paragraph in `references/verification-and-claims.md`. SKILL.md untouched.

## Proofs (reopen with `MISTER_CLEAN_SOURCE_DEVELOPMENT=1`, as `test:node` sets; the CLI-driven cases refuse without it. The DONE reopen lines omit the prefix.)
| # | Green | Mutant | Mutant result | Restored |
|---|---|---|---|---|
| 1 tracked | 2 passed | candidate listing = `git ls-files -co --exclude-standard` (working tree) | RED: d.py appears | green, file byte-identical |
| 2 no policy | 1 passed | absent policy falls back to a built-in forbid list | RED | green |
| 3 invalid | 1 passed | parse errors swallowed into not_applicable | RED | green |
| 4 lang-guard-allow | 1 passed | `.lang-guard-allow` ignored | RED | green |
| 5 second-pass | 2 passed (cleared after `git mv b.mjs b.ts` + commit; MISS case persisting_unseen) | `language_policy` removed from RECEIPT_FAMILIES | RED (receipt refused, 2 failed) | green |

## Proof 6: this repository at the lane tip
`MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun src/cli.ts audit language-policy . --json` exit 1 (summary of the JSON):
```
status fail, tracked_path_count 449, allowed_count 0
generated_exempt 2: assets/codebase-state-dashboard/model-scorecard-interactions.js, bin/mister-clean.js
findings 15:
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
It is 15, not 7, because the port of eight build/report scripts (chore/port-build-scripts-ts, PR #61) is not on main at ef4987a. Once it merges, the same command should list the remaining 7.

## Proof 7: regression
- skill-contract, prepare, bundle, second-pass, run-receipt, finding-anchors, cli, language-policy: 8 files, 245/245 passed (pre-merge bytes).
- `tsc --noEmit` clean; `charter check --strict` ok (pinned binary b9323cd); `audit:public` PASS (83 files); SKILL.md 19,975 bytes, unchanged.
- Packaged bytes, bun 1.4.0, two clean `build:raw` after the merge, identical: bin 8f31559d…, MANIFEST 0da41aa5…, dist tree 91fd982b…; `manifest:package:check` PASS (82 entries).
- Full `pnpm run test:node` on the merged tip f71c61d: 58 files, 917 passed / 5 failed. All 5 are `scripts/verify_generated_candidate.test.ts`. They fail because the host lang-guard hook refuses that test's scratch commit of a generated .js candidate. They are environment-class reds, the same five seen on the gate-scope lane, and not caused by this change.

## Recorded obligations (not in this slice)
- Language-policy findings are evidence and receipt findings, but not yet closeout root debts. A CLOSE run does not turn NOT_CLEAN on them. Promoting them needs a detector-registry v6 entry and bundle-validator support.
- The DONE reopen commands need the `MISTER_CLEAN_SOURCE_DEVELOPMENT=1` prefix.
