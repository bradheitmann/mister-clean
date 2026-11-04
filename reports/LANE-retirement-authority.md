# LANE retirement-authority (PM-ODIN red-team finding on #64; blocks 7.5.0)
Author: Claude dev subagent (Claude Opus 5.5). Branch `fix/retirement-authority` from origin/main f1a3014. DONE list: `charter/DONE/retirement-authority.md`, committed first (cc3b073). Toolchain: bun 1.4.0.

## Change
- **New module** `src/closeout/retirement-ratification.ts`, with no file-system access. It holds the normalizer `mister-clean/retirement-ratification@1`, the `minted_by` value and the report sentence "retirement ratification: not verifiable (O-RET-2) — owner decision required". It also groups applications into one ratification per retirement record and gives the projection that prepare and the validator share.
- **Retirements module.** `readRetirements` now records each retirement record's own byte digest (`record_sha256`).
- **Prepare.** Each per-debt `mister-clean.operator-ruling` record now carries `minted_by: "mister-clean prepare"` and `source: {path, sha256}` for the retirement record. Each applied retirement record adds one open root debt, `retirement_ratification`. Its cause key is `{record_path, record_sha256}`, its disposition is `decision_or_coordination_required`, and its affected paths are the retired roots. Its procedure begins with the sentence above. The completion_debt dimension notes repeat it. `retirement_applications` now carry `record_sha256`. Retired debts stay accepted_exception.
- **Regression validator.** It adds the ratification roots, projected from `retirement_applications` only, to its evidence-derived roots. A report that drops or re-keys one fails "evidence-derived root debt … is absent from report completion_debts" or the cause-key checks.
- **Bundle validator.**
  - An accepted_exception with a `retired root` scope must cite a record with the tool's `minted_by`. Such a record is never treated as an operator's act.
  - Every minted record must bind the applied record's path and digest, and must belong to an application.
  - The ratification debt must stay open as a decision over exactly the retired roots.
  - With `--repo`, the live retirement record must still hash to the applied digest.

**Grouping.** A record with two roots yields two applications but one decision debt. That follows the brief's per-record cause key and plural roots. For the fixture's single-root record, one debt per record equals one debt per application.

**Out of scope, unchanged.** An agent who hand-forges a whole bundle, with a non-retirement scope and no applications, is the general exception-authority question (O-RET-2). It predates #64.

## Proofs (each green, mutant RED, restored with `cmp` against saved originals)
Test file: `src/closeout/retirement-authority.test.ts`. Reopen with `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run src/closeout/retirement-authority.test.ts -t "<filter>"`. Each filter selects exactly one test.

| # | filter | green | mutant | mutant result |
|---|---|---|---|---|
| 1 | exploit | NOT_CLEAN, 1 ratification debt for 1 application, bundle validates with zero errors; a forged CLEAN verdict is refused for the open decision | ratification debt omitted from prepare | RED: expected [] to have a length of 1 |
| 2 | minted | every minted record has `minted_by` and `source.sha256` equal to the record bytes' digest | `minted_by` dropped | RED: record does not match `minted_by` |
| 3 | deleted ratification | debt deleted, census and bundle digests re-bound as a careful forger would; refused with the projection error naming the deleted key | projection removed from the regression validator | RED: expected [] to have a length of 1 |
| 4 | changed retirement record | record edited and committed after prepare; `--repo` refuses the source mismatch | live source check removed | RED: expected [] to have a length of 1 |
| 5 | no retirements, and #64's `prepare.test.ts -t retirement` | no-retirement bundle validates with zero errors; #64's two retirement tests green (ruling staged, no exception.ref error, mismatch refused) | n/a | n/a |

## Regression (proof 6)
- Prepare, bundle, retirements, records, skill-contract and the new tests: 6 files, 249/249, after the rebuild. Before the rebuild, skill-contract had 3 reds because `bin/` was stale. The rebuild cleared them.
- `tsc --noEmit` 0. `charter check --strict` (b9323cd) ok. `audit:public` PASS (83 files).
- Two clean `build:raw` runs under bun 1.4.0 gave identical 25-entry hash lists. `bin/mister-clean.js` is now fc01d280… and `MANIFEST.sha256` 09140e56…. `manifest:package:check` PASS (82 entries). The generated files are committed in b80f41b, and `git status` is clean after that commit. SKILL.md is unchanged at 19,975 bytes.
- origin/main had not moved past f1a3014, so no merge was needed.
- Full `pnpm run test:node` on b80f41b, which holds exactly the bytes being pushed apart from this report: 59 files, 928/928 passed, 0 red, 482 s. The five `verify_generated_candidate` reds seen on earlier lanes do not occur on this base.
- Merge: origin/main dcb2c01 (PR #63, CI workflow, toolchain-pin test and an owner decision; no product code) merged at ae8fc13 with no conflicts. Two more clean builds gave hash lists identical to each other and to the pre-merge build, and `git status` was clean. Post-merge: `manifest:package:check` PASS; tsc 0; audit:public PASS; charter strict ok. Full `pnpm run test:node` on ae8fc13: 59 files, 927/927 passed, 0 red. The merge removed one toolchain-pin test.
