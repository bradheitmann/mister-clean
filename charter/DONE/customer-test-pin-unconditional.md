# DONE: customer-test-pin-unconditional (red-team CROSS from PM-MODEL-ATLAS, polyswarm R12)
Slice: `customer-tests/model-atlas/registry-join.ts` checked the export's sha256 only when a second argument was given, so a hand-edited copy of the vendored, pinned fixture passed with no argument. The pinned fixture is now always checked against the sha256 recorded in `registry-join.json`; any other artifact (the publisher's current main, which the shared protocol runs unpinned by design) is checked semantically and labelled UNPINNED. Re-pin to export 2026.11.03-2 in the same slice.

1. The pinned fixture with one byte changed fails with NO sha argument ("pinned sha256 mismatch").
   - reopen: `node ./node_modules/vitest/vitest.mjs run customer-tests/model-atlas/registry-join.test.ts -t "pinned fixture"`
   - mutant: restore the "only when given" behaviour → RED.
2. A repository test asserts the vendored fixture's sha256 equals `registry-join.json` `artifact.sha256`, unconditionally.
   - reopen: `… -t "fixture matches the pin"`
   - mutant: change the json sha by one hex digit → RED.
3. A non-fixture artifact without a sha argument is checked semantically and the output says UNPINNED.
   - reopen: `… -t "unpinned"`
   - mutant: drop the label → RED.
4. Re-pin: `registry-join.json` names 2026.11.03-2 with sha256 657f8150c7867d9795dc71c50ee6920757e04194ad2e0b902c8122bd52100556 (publisher's PINS.tsv row, producing commit ae93b43); the fixture is the publisher's file byte for byte; both declared mutants still fail.
   - reopen: `bun customer-tests/model-atlas/registry-join.ts customer-tests/model-atlas/fixtures/model-atlas.export-2026.11.03-2.json` exits 0; each mutant patch applied → exits 1.
   - mutant: n/a (the declared mutants are the negative controls).
5. Regression: field-eval card bindings unaffected (no card or route id changed between 03-1 and 03-2); skill-contract; tsc covers the new test; charter strict; audit:public.
   - reopen: the commands as named.
   - mutant: n/a.
