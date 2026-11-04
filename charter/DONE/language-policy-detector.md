# DONE: language-policy-detector (O-LANG-POLICY-1)
Slice: a repository's declared language policy (`.mister-clean/language-policy.json`) becomes a detector family, so the first pass catches tracked files in forbidden languages instead of leaving them for an owner's own scanner.
Base bytes: origin/main d70f722.

Proofs (each: green, mutant RED, restore; recorded in reports/LANE-language-policy-detector.md):
1. Fixture repository with a declared policy and tracked a.py, b.mjs, c.ts, a generated g.js listed in `generated`, and an untracked d.py: findings are exactly a.py and b.mjs; g.js is counted as generated_exempt; d.py is ignored because it is untracked.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/closeout/language-policy.test.ts -t "tracked"`
   - mutant: walk the working tree instead of tracked paths → d.py appears → RED.
2. No policy file → `not_applicable`, zero findings.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/closeout/language-policy.test.ts -t "no policy"`
   - mutant: default to a built-in forbid list → RED.
3. Invalid policy (unknown key, bad schema) → typed `language_policy_invalid`; CLI exit 2.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/closeout/language-policy.test.ts -t "invalid"`
   - mutant: ignore the error → RED.
4. `.lang-guard-allow` globs at the root are honoured as allow.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/closeout/language-policy.test.ts -t "lang-guard-allow"`
   - mutant: ignore the file → RED.
5. Receipt and second-pass: an AUDIT receipt carries a language_policy finding; the file is ported (renamed .mjs to .ts) and committed; `second-pass` classifies it `cleared`.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/closeout/language-policy.test.ts -t "second-pass"`
   - mutant: family missing from receipt families → RED.
6. On this repository at the lane tip, `audit language-policy . --json` reports exactly the remaining hand-written .mjs files and 2 generated_exempt; recorded verbatim in the report.
   - reopen: `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun src/cli.ts audit language-policy . --json`
   - mutant: n/a (observation of this repository).
7. Regression: skill-contract, prepare, bundle, second-pass and receipt tests green; `tsc --noEmit`; `charter check --strict`; `audit:public`; SKILL.md byte count unchanged; full `pnpm run test:node` once with every red classified.
   - reopen: the commands as named.
   - mutant: n/a (regression set).

Gates: packaged bytes under bun 1.4.0 only; double clean `build:raw` identical; `manifest:package:check` PASS.
Out of scope (recorded obligations): porting the remaining release .mjs files.
Owner decision points: none.
