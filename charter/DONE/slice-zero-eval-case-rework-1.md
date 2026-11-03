# Done list — slice-zero-eval-case rework 1 (written BEFORE dispatch; does not grow during it)
Base bytes: feat/slice-zero-eval-case 01b20677fbe3e05e8c8d027617c1e51d51aa7fb1 (REJECTED by MC/QA; the five QA probes are the fixtures below, copied into the tests with generic content)
Proofs (each: name, what it guarantees, reopen step, fail-without mutant):
1. bound-means-reverified (G2): a bare verifier digest with no local file, and a base commit whose sha is not an object in the repository, are classified `unverified` (named in the text line and in JSON), never `bound`; a verifier cited by local path+sha256 and a commit present in the repository are `bound`. Fixture: false-bound. Reopen: run `src/eval-case.test.ts`. Mutant: classify bare values as bound → RED.
2. card-resolution (G2/G3): every agent card must cite its card file by path+sha256; the file's frontmatter `card_id` and `model_registry_ref` must equal the record's, else `card_ref_mismatch`. Fixture: fabricated-external (invented refs). Reopen: same test file. Mutant: skip the frontmatter comparison → RED.
3. replay-recomputed (G2): the per-reviewer counts, the session count and the floor are recomputed from the cited tallies TSV and must equal the record's claims (`replay_counts_mismatch`); every tallied population must carry the floor's replay count (`replay_floor_mismatch`); `outcome: met` with no recomputed subject floor breach is `replay_floor_not_met`; an unparsable tallies file is `rows_source_unparsable`. Fixture: zero-replays. Reopen: same test file. Mutant: trust the declared counts → RED.
4. require-bound (G2): `--require-bound verifier,base_commit` refuses any named citation that is `external` or `unverified` with `binding_required`, naming it; without the flag the same record is valid with the citations named under `external`/`unverified`. Fixture: forged-verifier-commit. Reopen: same test file. Mutant: ignore the flag → RED.
5. file-citations-local (G2): `field_case`, `replay.rows_source` and `derived_from` accept only a local path+sha256; an `external` form there is `record_shape`. Fixture: all-external. Reopen: same test file. Mutant: accept external file citations → RED.
6. real-record-strict: the charter command (`--require-bound verifier,base_commit`) on `CS-001.eval.json` is recorded verbatim; `proven_on` is set only if it exits 0, else cleared to "" and the report names the cross-repository artifact that would bind the verifier and base commits. Reopen: run the command from a fresh checkout and compare. Mutant: none (read-back).
7. gates-unchanged: proofs 1-4 of `charter/DONE/slice-zero-eval-case.md` and their mutants still hold; `src/skill-contract.test.ts` green; SKILL.md bytes equal to main's; two byte-identical clean `build:raw` runs under bun 1.4.0 and `manifest:package:check` PASS; `tsc --noEmit` clean; `charter check --strict` ok; full `pnpm run test:node` once on the frozen bytes, each red classified. Mutant: none (gates).
Gates (exact commands):
- tsc --noEmit
- MISTER_CLEAN_SOURCE_DEVELOPMENT=1 nice -n 10 node ./node_modules/vitest/vitest.mjs run --allowOnly=false --no-file-parallelism --testTimeout=120000 src/eval-case.test.ts src/skill-contract.test.ts
- nice -n 10 pnpm run test:node
- pnpm run build:raw twice from a clean dist/ under bun 1.4.0, identical hash lists; pnpm run manifest:package:check
- bun run audit:public
- node bin/mister-clean.js eval-case validate field-evals/2026-10-31-window/cases/CS-001.eval.json --repo . --require-bound verifier,base_commit
- ~/.local/share/charter/bin/b9323cd119f2ef2fe83db21b8ed8f844215e8852/bin/charter check --strict
Out of scope (recorded obligations, not fixed here):
- a cross-repository re-hash route for external citations (a published, digest-pinned evidence manifest from the evidence owner, vendored like the model-atlas export) that would turn `external` into `bound`
Owner decision points:
- none; a correctly empty proven_on is a valid outcome
