# Done list — clean-planning-check-reference (written BEFORE implementation; does not grow during it)
Base bytes: main 716caa7 (branch fix/clean-planning-check-reference)
Finding: rehearsing the CLEAN validation of the 7.5.0 closeout bundle (2026-11-05), `validate bundle` refused project/planning/AGENT-EVAL-LAB.md, EVAL-STANDARDIZATION-PLAN.md and ROADMAP.md as "executed-early/unexecuted-later" procedures. All three declare `artifact_type: reference` and describe planned, undispatched work. The check in src/closeout/bundle.ts matches words anywhere in a file and ignores the declared type, although the planning policy already treats `reference` as a non-procedure class (NON_ARTIFACT_CLASSES in src/closeout/planning-analysis/policy.ts). Owner approved fixing it inside 7.5.0 (option 1).
Proofs (each: name, what it guarantees, reopen step, fail-without mutant):
1. reference-document-not-a-procedure: a planning file whose front matter declares `artifact_type: reference` and whose prose contains "implementation done" and "acceptance review pending" is not refused by the CLEAN executed-early/unexecuted-later check. Reopen: rerun the new test in src/closeout/hardening.test.ts on the frozen tip. Mutant: remove the declared-type skip → the test goes RED.
2. procedures-still-refused: the existing test "rejects executed-early planning artifacts with unexecuted later review" (a file with no non-procedure type) still fails CLEAN, and a file declaring `artifact_type: slice` with the same words is also refused. Reopen: rerun both tests. Mutant: skip the check for every file → both go RED.
3. this-repository: the three project/planning files above are no longer refused when the check is applied to this repository's tree. Reopen: rerun proof 1's code path against the real files in a scratch test that reads them. Mutant: as in proof 1.
4. existing-gates-green: tsc --noEmit; src/closeout/hardening.test.ts; charter check --strict; double clean build:raw identical and manifest:package:check PASS; SKILL.md not grown. Reopen: rerun the gate commands below on the frozen tip and compare. Mutant: a deliberate type error in bundle.ts makes tsc RED.
Gates (exact commands):
- pnpm exec tsc --noEmit
- MISTER_CLEAN_SOURCE_DEVELOPMENT=1 nice -n 10 node ./node_modules/vitest/vitest.mjs run --allowOnly=false --testTimeout=120000 src/closeout/hardening.test.ts
- bun run manifest:package:check (after the double clean build); charter check --strict
- no full local suite (owner decision 24954d2: S6 evidence is hosted CI on the exact tip)
Out of scope: nothing else changes.
