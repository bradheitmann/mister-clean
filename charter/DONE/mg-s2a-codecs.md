# DONE: mg-s2a-codecs (master-gate S2a, backbone primitives: canonical JSON and timestamps)
Slice: Mister Clean has 7 canonical-JSON encoders and 11 timestamp validators (5 grammars), so whether a digest can be computed, and whether a timestamp is valid, depends on which copy a module imports (A6-6, A2-45, A6-10, A1-6). Leave exactly one encoder (src/canonical-json.ts) and one timestamp module (src/timestamp.ts), and migrate every site to them.

Output bytes stay identical for every input a base copy encoded or accepted. The only exceptions are the declared deltas in proofs 2 and 4. Error message text is not part of the byte contract; whether an input throws is.

Base bytes: main at dispatch (the evidence map was taken at 0a9f26b, which differs from main 4240c0e in src only in inspection.ts). The slice branch's first commit (the "golden commit") adds only test files, and they pass on base.

`R` below stands for `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run --allowOnly=false --testTimeout=120000`.

Proofs (each re-openable before acceptance):
1. Canonical JSON is byte-identical to every base encoder (differential).
   - Setup: src/codec-oracles.test-fixture.ts holds verbatim copies of the 7 base encoders, each headed with its base path and line range:
     - canonical-json.ts:10
     - native-gates.ts:489
     - regression-accounting.ts:238
     - accepted-release.ts:71
     - action-lifecycle-runtime.ts:58
     - action-hygiene.ts:222
     - snapshot.ts:454
   - Corpus: a seeded generator of 10,000 plain JSON values: nested objects and arrays; ASCII, BMP, astral and escape-needing strings; integers, floats, 1e21, -1e-7 and -0. Hand rows are added for each encoder's edge domain.
   - Assertion: for each oracle, the shared encoder in that site's mode (omit for native-gates, refuse for the rest) emits identical bytes for every corpus value the oracle encodes. Where the oracle throws, the shared encoder throws too, except on the proof 2 delta rows.
   - Fidelity: on the golden commit, the oracles of exported functions equal the live functions over the same corpus. These are canonical-json `canonicalJson`, native-gates `identity` and `stableEqual`, and action-lifecycle-runtime `canonical` and `equal`. Each private oracle matches its base source text exactly.
   - reopen: `R src/canonical-json.golden.test.ts -t "canonical json differential"`. Fidelity on the golden commit: `R src/canonical-json.golden.test.ts -t "oracle fidelity"`. Text check: `git show <base>:<path> | sed -n '<a>,<b>p' | diff - <(sed -n '<oracle range>p' src/codec-oracles.test-fixture.ts)` for each private oracle.
   - mutant: make the shared encoder sort with `localeCompare` → RED (the keys "B" and "a"). Remove omit mode from the native-gates wrapper → RED (the undefined-field rows).
2. Declared canonical-JSON deltas, one test each:
   - (a) snapshot.ts comparisons are key-order-insensitive inside arrays: key-reordered capability objects at :307 now compare equal (A2-45).
   - (b) action-lifecycle-runtime `canonical` and `equal`, accepted-release `canonical` and snapshot `canonicalJsonForSnapshot` refuse an undefined field and NaN, instead of emitting the text `undefined` or `null`.
   - (c) root-debt and observation keys sort by UTF-16 code units: a row keyed "\uFFFF" against "\u{10000}" orders as RFC 8785 does.
   - (d) the shared encoder refuses a cycle, an array hole, a non-plain prototype (including a Date or Map, which the lax encoders in native-gates, accepted-release, action-lifecycle-runtime, action-hygiene and snapshot wrote as `{}`), a symbol key, a lone surrogate and an accessor property, where the base encoders overflowed the stack or accepted them. Proof 1's differential covers only plain JSON values; these out-of-domain inputs are covered here.
   - reopen: `R src/canonical-json.golden.test.ts -t "canonical json declared deltas"`
   - mutant, one per part: route the site back to its oracle → that part goes RED.
3. Timestamps are byte-identical to every base validator (differential).
   - Setup: src/codec-oracles.test-fixture.ts also holds verbatim copies of the 11 base validators and the 2 formatters:
     - records.ts:117
     - semantic.ts:242
     - semantic-v2.ts:248
     - trust-root.ts:48
     - authority.ts:10/:16
     - import-provenance.ts:14/:21
     - evidence.ts:25
     - campaign-observation-intake.ts:16/:80
     - native-gate-validation.ts:104
     - run-receipt.ts:160
     - mister-clean-invocation-journal.ts:126
     - prepare.ts:109
     - execution-lease.ts:195
   - Corpus: the cartesian product of these field variants, run under node and under bun:
     - year: 0000, 0001, 1970, 2024, 2026, 9999;
     - month: 00, 01, 02, 04, 12, 13;
     - day: 00, 01, 28, 29, 30, 31, 32;
     - hour: 00, 23, 24;
     - minute: 00, 59, 60;
     - second: 00, 59, 60;
     - separator: T, t, space;
     - fraction: none, 1, 3, 9 or 10 digits;
     - zone: Z, z, +00:00, +0000, -23:59, +24:00, +05:30, none.
   - Assertion: for each site, `isTimestamp(value, <site profile>)` equals the oracle on every value outside the proof 4 delta set. The formatters produce identical strings for valid Dates and throw for invalid ones, with execution-lease's labelled message kept.
   - Fidelity: on the golden commit, the oracles of records `isoTimestamp` and native-gate-validation `validClock` equal the live exports over the corpus. The private oracles pass the same text check as proof 1.
   - reopen: `R src/timestamp.golden.test.ts -t "timestamp differential"` and `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun ./node_modules/vitest/vitest.mjs run --allowOnly=false src/timestamp.golden.test.ts -t "timestamp differential"`
   - mutant: widen the `utc_ms` profile's fraction to 1-9 digits → RED. Drop the space separator from the `record` profile → RED.
4. Declared timestamp delta (pays A6-10). Every profile refuses impossible calendar instants: day 0, days past the month's end (2026-02-29, 2026-02-30, 2026-04-31), month 0 or 13, hour 24, minute or second 60, and an offset hour above 23. It accepts 2024-02-29 and 23:59:59.
   - Bound: the delta set is exactly the corpus values that some oracle accepted and that fail the calendar check. The test computes that set per engine and asserts that nothing outside it changed.
   - reopen: `R src/timestamp.golden.test.ts -t "calendar refusal"`
   - mutant: skip the days-in-month check → RED on 2026-02-30. Allow hour 24 → RED.
5. Persisted digest vectors are unchanged. These hex values are recorded on the golden commit by the base code through exported entry points, and asserted unchanged on head:
   - `canonicalObservationId` and `canonicalRootDebtKey` for 6 fixed inputs;
   - `definition_sha256`, `semantic_contract_sha256` and `state_sha256` for every gate definition built in native-gates.test.ts fixtures (A6-6 asks for this);
   - `canonicalJson` and `sha256Bytes` of a run receipt, a journal line and a trust policy taken from the existing test fixtures;
   - the action-lifecycle `stateDigest` of the action-lifecycle.test.ts fixture.

   The existing signed fixtures still verify, which binds the signed bytes: trust-root.test.ts, semantic-v2.test.ts, run-receipt.test.ts and mister-clean-invocation-journal.test.ts.
   - reopen: `R src/canonical-json.golden.test.ts -t "digest vectors"`, on the golden commit and on head. `git diff --quiet <golden commit> <head> -- src/canonical-json.golden.test.ts` shows the vectors were not edited.
   - mutant: change -0 handling, or the omit mode, in the shared encoder → a vector goes RED.
6. No second implementation remains. src/backbone-single-implementation.test.ts, `describe("codecs")`, reads every tracked non-test `.ts` file under src/, scripts/ and tools/ (excluding `*.test.ts`, `*.test-fixture.ts`, src/test-support/ and bin/) and asserts:
   - (a) the encoder template `${JSON.stringify(key)}:` occurs only in src/canonical-json.ts (7 files on base);
   - (b) a date-shaped regex literal (`d{4}` or `(d{4})` followed by `-`) occurs only in src/timestamp.ts, plus exactly these 5 base sites, whose grammar is defined through Date.parse and cannot move byte-identically into a Date.parse-free grammar: src/closeout/accepted-release.ts `iso`, src/closeout/planning-analysis/policy.ts `validTimestampWithZone`, src/control-plane/contracts/agent-profile.ts, src/control-plane/contracts/snapshot.ts and src/control-plane/runtime/snapshot-producer.ts. The test allowlists them by file and function or const name, each labelled as an obligation for mg-s2-ts-dateparse. Any other site fails, including a new one in an allowlisted file (13 sites on base: 8 migrate, 5 allowlisted);
   - (c) `toISOString() ===` occurs only in src/timestamp.ts (3 on base);
   - (d) no function or const named `isoTimestamp`, `validIsoTimestamp`, `canonicalTimestamp`, `ISO_TIMESTAMP` or `canonicalJsonForSnapshot` is defined outside src/timestamp.ts and src/canonical-json.ts.

   The test prints the offending file:line.
   - reopen: `R src/backbone-single-implementation.test.ts -t "codecs"`
   - mutant: restore native-gates.ts's private `canonicalJson` → RED at native-gates.ts. Restore `ISO_TIMESTAMP` in authority.ts → RED at authority.ts.
7. Regression set, unchanged in meaning:
   - build the gitignored outputs first with `bun run build:raw` (bun 1.4.0), then commit the regenerated bin/mister-clean.js and MANIFEST.sha256;
   - `pnpm exec tsc --noEmit` is clean;
   - `bun run sync:cli:check` and `bun run manifest:package:check` pass;
   - `bun run audit:public` passes, and `charter check --strict` is ok;
   - node: `R src/closeout/records.test.ts src/closeout/hardening.test.ts src/closeout/semantic.test.ts src/closeout/semantic-native-routes.test.ts src/closeout/semantic-v2.test.ts src/closeout/trust-root.test.ts src/closeout/native-gates.test.ts src/closeout/native-gate-budget.test.ts src/closeout/gate-evidence-subject-change.test.ts src/closeout/regression-accounting.test.ts src/closeout/accepted-release.test.ts src/closeout/action-lifecycle.test.ts src/closeout/action-hygiene.test.ts src/closeout/prepare.test.ts src/closeout/execution-lease.test.ts src/closeout/bundle.test.ts src/closeout/language-policy-root-debts.test.ts src/run-receipt.test.ts src/mister-clean-invocation-journal.test.ts src/local-store-rotation.test.ts src/skill-contract.test.ts` is green;
   - bun: `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun ./node_modules/vitest/vitest.mjs run --allowOnly=false src/control-plane/runtime/authority.test.ts src/control-plane/contracts/import-provenance.test.ts src/control-plane/runtime/evidence.test.ts src/control-plane/runtime/snapshot-producer.test.ts src/control-plane/runtime/http.test.ts src/control-plane/import` is green;
   - no test is deleted; any changed assertion is listed in the slice report with its old and new text.
   - reopen: the commands as named.
   - mutant: n/a (regression set).
8. Hosted CI `verify` passes on the frozen head (the clean capsule, which runs the full suite).
   - reopen: `gh run view <run id> --repo bradheitmann/mister-clean --json jobs,headSha`
   - mutant: n/a (an external result, cited by run id and head sha).
9. The pre-merge self-judge. The installed 7.5.1 judges the frozen candidate in the Linux judge container, and no debt class appears beyond main's known baseline (the carried semantic re-attestation).
   - reopen: the container command and the debt list recorded in the slice report and LIFECYCLE.md.
   - mutant: n/a (comparison with the baseline).

Gates (exact commands): the commands in proofs 1-9. Paired QA comes from two model families (charter.toml review_families_required = 2). Repair cycles are capped at 1 and QA attempts at 3.

Out of scope (recorded obligations, not fixed here):
- The 5 Date.parse-defined timestamp grammars allowlisted in proof 6(b), plus a measurement of whether node and bun agree on Date.parse over the proof 3 corpus → mg-s2-ts-dateparse.
- bundle-runtime.ts:233 structural `stableEqual` (113 call sites; it differs from canonical equality on -0, NaN and undefined) → mg-s2f-validate-parity.
- Git runners and D5 → mg-s2b-git-runner.
- Front-matter → mg-s2c-front-matter.
- The duplicated `object`/`array` helpers and the records.ts dead enum exports (A1-6, remaining part) → mg-s2e-finding-reducer.
- Unifying the control-plane wire grammar across profiles: NOT done; the profiles stay separate because they are an external contract (PM decision, 2026-11-06).
- The 47 Date.parse comparisons of already-validated values → not debt; recorded only.

Decision points (decided by the PM on 2026-11-06, before dispatch):
- The proof 4 calendar delta and the proof 2 deltas: ACCEPTED (both fail closed on values no valid record can hold).
- Code-unit key order for regression-accounting: ACCEPTED (RFC 8785).

After acceptance, NOT proofs: merge into main in the canonical landing shape, with the acceptance records inside the merge commit and the trailer `Charter-Slice: mg-s2a-codecs`. Then the post-merge self-judge, recorded in STATE, and a COST.jsonl row.
