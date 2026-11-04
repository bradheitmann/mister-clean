# DONE: retirement-authority (red-team finding from PM-ODIN on #64; blocks 7.5.0)
Slice: after #64, `prepare` writes `retirement-rulings/<debt id>.json` (`mister-clean.operator-ruling`) for every retired debt, with actor and at copied from a retirement record that any agent can commit. The validator treats an operator-ruling record as an operator's act, so an agent-committed ruling plus a retirement record naming `author: "A/EXEC-PM"` yields a validating bundle with every debt under those roots accepted_exception, and no human involved. Minted records must declare themselves tool-minted and bind the retirement record's bytes. Each applied retirement adds one open `retirement-ratification` decision debt (normalizer `mister-clean/retirement-ratification@1`, cause key `{record_path, record_sha256}`, disposition `decision_or_coordination_required`, affected paths = the retired roots), so the verdict cannot be CLEAN while ratification is not verifiable (O-RET-2). The validator projects the expected ratification debts from `retirement_applications` and refuses missing, altered or unmatched ones, and with `--repo` refuses a `source` digest that no longer matches the retirement record.

1. The exploit as a fixture (agent-committed ruling + retirement record with author "A/EXEC-PM"): prepare → verdict NOT CLEAN with exactly one `retirement-ratification` decision debt per application; validate bundle passes structurally.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/closeout/retirement-authority.test.ts -t "exploit"`
   - mutant: omit the ratification debt → the verdict could be CLEAN → RED.
2. Minted records carry `minted_by` and a `source` sha256 equal to the retirement record's bytes.
   - reopen: `… -t "minted"`
   - mutant: drop `minted_by` → RED.
3. Tamper: delete the ratification debt from a bundle (keeping the minted records) → validator refuses.
   - reopen: `… -t "deleted ratification"`
   - mutant: remove the projection → RED.
4. Tamper: change the retirement record after prepare and validate with `--repo` → `source` mismatch refused.
   - reopen: `… -t "changed retirement record"`
   - mutant: skip the source check → RED.
5. #64's proofs still green (ruling staged, no exception.ref error); a 7.4.0-minted bundle (no retirements) still validates.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/closeout/prepare.test.ts -t "retirement"` and `… src/closeout/retirement-authority.test.ts -t "no retirements"`
   - mutant: n/a (preservation).
6. Regression: prepare, bundle, retirements, records, skill-contract tests; `tsc --noEmit`; `charter check --strict`; `audit:public`; double clean build under bun 1.4.0 + `manifest:package:check`; full `pnpm run test:node` on the exact bytes (S6), reds classified.
   - reopen: the commands as named.
   - mutant: n/a (regression set).

Each proof: green, mutant RED, restore; recorded in reports/LANE-retirement-authority.md.
