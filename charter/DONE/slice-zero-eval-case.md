# Done list — slice-zero-eval-case (written BEFORE dispatch; does not grow during it)
Base bytes: main fca67edf224a6877f3d181307392ea1f36336016 (v7.3.0); branch feat/slice-zero-eval-case
Proofs (each: name, what it guarantees, reopen step, fail-without mutant):
1. fixture-record-binds (G2): a valid fixture record whose every citation binds to fixture files in a temp repo → exit 0, typed `eval_case_valid`. Reopen: run `src/eval-case.test.ts`. Mutant: flip one cited sha256 → exit 2 naming that citation → RED when the sha256 check is removed.
2. agent-cards-count (G2): a record with one or three agent cards → exit 2 `agent_cards_count`. Reopen: same test file. Mutant: remove the count check → RED.
3. verifier-unbound (G2): a record whose verifier carries `binding: "unbound"` → exit 2 `verifier_unbound` (the slice requires a constant verifier). Reopen: same test file. Mutant: treat unbound as valid → RED.
4. registry-export-mismatch (G2): a registry ref whose export version differs from the pinned one in `customer-tests/model-atlas/registry-join.json` → exit 2 `registry_export_mismatch`. Reopen: same test file. Mutant: remove the export comparison → RED.
5. real-record-readback (G2): the real record `field-evals/2026-10-31-window/cases/CS-001.eval.json` validates, or refuses with the exact unbound citation; the result is recorded verbatim in `reports/LANE-slice-zero-eval-case.md`, and the `charter.toml [slice_zero].command` runs as written from the worktree root. Reopen: run that command from a fresh checkout and compare the output with the recorded one. Mutant: none (a read-back of real data; the mutants live in proofs 1 to 4).
6. gates-unchanged: `src/skill-contract.test.ts` green; SKILL.md byte count unchanged (19,975); `manifest:package:check` PASS after two byte-identical clean `build:raw` runs under bun 1.4.0; `tsc --noEmit` clean; `charter check --strict` ok (charter b9323cd). Reopen: rerun each command on the frozen tip. Mutant: none (gates).
Gates (exact commands):
- tsc --noEmit
- MISTER_CLEAN_SOURCE_DEVELOPMENT=1 nice -n 10 node ./node_modules/vitest/vitest.mjs run --allowOnly=false --no-file-parallelism --testTimeout=120000 src/eval-case.test.ts src/skill-contract.test.ts
- nice -n 10 pnpm run test:node (full, once at the end; each red classified)
- pnpm run build:raw twice from a clean dist/ under bun 1.4.0, identical hash lists; pnpm run manifest:package:check
- bun run audit:public
- node bin/mister-clean.js eval-case validate field-evals/2026-10-31-window/cases/CS-001.eval.json --repo .
- ~/.local/share/charter/bin/b9323cd119f2ef2fe83db21b8ed8f844215e8852/bin/charter check --strict
Out of scope (recorded obligations, not fixed here):
- running the CS-001 treatment A/B/C replays themselves (the record cites the replay already done in field-evals/2026-11-01-reviewer-controls)
- a schema for agent cards (G3 card-identity-check; separate slice)
- SKILL.md documentation of the verb (the byte budget is full; README and the CLI usage string only)
Owner decision points:
- none; if the verifier or base commit cannot be bound from the repository's own records, the record says so and `proven_on` stays empty
