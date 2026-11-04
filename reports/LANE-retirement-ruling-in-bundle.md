# Lane report: retirement-ruling-in-bundle (field defect reported by PM-ODIN against 7.4.0)
Author: PM-MISTER-CLEAN (Claude). Base main ef4987a. DONE list charter/DONE/retirement-ruling-in-bundle.md (committed first, 4d67491).

## Field report
odin PR #34 (head 81e3fec), record charter/retirements/2026-11-01-legacy-planning.json: `prepare` retired 962 debts; `validate bundle … --repo <tree>` then failed with 962 errors `exception.ref.path: file not found … <bundle-dir>/charter/owner-decisions/…`. Control: the same tree without the record, and a clean clone, validate PASS. Every adopter of retirement records hits it.

## Two layers found
1. The exception ref cited the ruling by its repository-relative path, but the validator resolves refs inside the bundle and `prepare` never staged the ruling there (odin's finding).
2. Under it (found by this lane's test once 1 was fixed): the validator accepts an `accepted_exception` only through a JSON `mister-clean.operator-ruling` record carrying the debt id, the exception fields and the run's request digest (src/closeout/bundle-action-evidence.ts:241-250); the ref pointed at a Markdown ruling, so even a staged file failed as "not valid JSON".

## Change (src/closeout/prepare.ts)
- `stageRetirementRulings`: every cited ruling is copied into the bundle at its repository-relative path, after re-checking its bytes against the bound digest (readRetirements already refuses a mismatch; the re-check closes the window between read and copy).
- `bindRetirementRulings`: each retired debt gets `retirement-rulings/<debt id>.json` (`mister-clean.operator-ruling` 1.0: debt_id, actor, at, scope, rationale, request_sha256, ruling_ref {path, sha256} of the staged ruling); the debt's `exception.ref` points at it. The bundle is self-contained: it validates without the live checkout's files.

## Proofs and mutants (src/closeout/prepare.test.ts)
| # | Proof | Mutant | Observed |
|---|---|---|---|
| 1 | ruling staged in the bundle with the bound digest | staging skipped | RED |
| 2 | bundle validation has no `exception.ref` error; per-debt record binds debt id + staged ruling | per-debt records skipped | RED |
| 3 | a mismatched ruling digest refuses | — | green; enforced already by readRetirements, so no distinct mutant exists for the staging re-check (stated honestly; defence in depth only) |
Restore verified by hash (9d226c1541f9).

## Gates
Double clean build:raw under bun 1.4.0 identical (bin 073937dd…, MANIFEST 0ff102c6…); manifest:package:check PASS; tsc; audit:public PASS; charter strict ok; prepare + bundle + retirements + skill-contract 201/201; SKILL.md 19,975.
Cost note for large retirements: one small record per retired debt (odin: 962 files of a few hundred bytes).
