# Lane report: customer-test-pin-unconditional (red-team CROSS from PM-MODEL-ATLAS, polyswarm R12)
Author: PM-MISTER-CLEAN (Claude). Base main f1a3014. DONE list charter/DONE/customer-test-pin-unconditional.md (committed first, 2df83f3; proof 4 narrowed before any QA dispatch — see below).

## Finding
registry-join.ts checked the export's sha256 only when a second argument was given, so `bun registry-join.ts <fixture>` accepted a hand-edited copy of the vendored, pinned fixture. Peers (lumbr, charter, model-tier-drop) assert their pins unconditionally.

## Change
- `pinnedSha256For(path)`: the vendored fixture named in registry-join.json is always checked against that file's recorded `artifact.sha256`; a sha argument, if given, must equal it.
- Any other artifact (the publisher's current main, which the shared customer-test protocol runs without a sha by design) keeps semantic-only checking and its PASS/FAIL line now says `(UNPINNED: semantic checks only)`.
- `registry-join.test.ts`: fixture-equals-pin (unconditional), one-byte-edited fixture fails with no argument, unpinned label.

## Proofs and mutants
| # | Proof | Mutant | Observed |
|---|---|---|---|
| 1 | edited fixture fails with no sha argument | "only when given" restored | RED |
| 2 | fixture sha equals registry-join.json | json sha off by one digit | RED |
| 3 | non-fixture artifact labelled UNPINNED | label dropped | RED |
CLI on the real fixture: PASS with no argument and with the correct argument.

## DONE-list change (recorded honestly)
Proof 4 (re-pin to 2026.11.03-2) was moved out before dispatch: Slice Zero's eval-case validator (PR #60) requires card refs to cite the pinned export version, and CS-001 cites cards @2026.11.03-1, so re-pinning here would make Slice Zero refuse its own record. The re-pin lands as one coordinated re-pin + card re-bind lane after Slice Zero merges.

## Gates
tsc clean; audit:public PASS; charter strict ok. No packaged bytes change (customer-tests is not in the package).
