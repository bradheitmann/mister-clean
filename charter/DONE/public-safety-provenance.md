# Done list — public-safety-provenance (written BEFORE dispatch; does not grow during it)
Base bytes: main fca67edf224a6877f3d181307392ea1f36336016 (v7.3.0); branch fix/public-safety-provenance
Lane brief: self-clean cycle 1, general detector fix O-PS-PROV-1 (walk-based `audit public-safety` findings carry no provenance, so a reader cannot tell tracked bytes from ignored or untracked ones).
Proofs (each: name, what it guarantees, reopen step, fail-without mutant):
1. three-provenances: a fixture repository with one tracked, one untracked and one ignored file, each holding a `/Users/<name>/` path: the walk scan reports three findings with provenances tracked/untracked/ignored respectively and `provenance_counts` {1,1,1,0}. Reopen: run `src/closeout/public-safety-provenance.test.ts`. Mutant: remove the ignored-set lookup → the ignored file reports `untracked` → RED.
2. fingerprint-unchanged: fingerprints of those findings equal `publicSafetyFingerprint({path,line,rule})` computed independently in the test; `value_sha256` unchanged. Reopen: run `src/closeout/public-safety-provenance.test.ts`. Mutant: fold provenance into the fingerprint → RED.
3. tracked-scope-all-tracked: `tracked_shippable` scoped scan over the same fixture: every finding `provenance: "tracked"`, counts {n,0,0,0}. Reopen: run `src/closeout/public-safety-provenance.test.ts`. Mutant: the tracked wrapper annotates through the unknown resolver instead of the scope → RED.
4. non-git-unknown: scan of a non-Git directory: every finding `provenance: "unknown"`, `provenance_source: "unavailable"` present with a reason; never guessed. Reopen: run `src/closeout/public-safety-provenance.test.ts`. Mutant: guess `tracked` when Git listing fails → RED.
5. existing-green: existing public-safety tests, `src/skill-contract.test.ts`, and `src/closeout/second-pass.test.ts` stay green (a receipt from the new scan round-trips and second-pass joins by fingerprint). Reopen: run `src/closeout/inspection.test.ts src/cli.test.ts src/skill-contract.test.ts src/closeout/second-pass.test.ts src/run-receipt.test.ts`. Mutant: emit the finding rows under a renamed key → `receiptFindingsFromAudit` refuses the result as not canonical → RED.
6. bounded-listing: tracked-path listing goes through the bounded helper: a fixture with > 1 MiB of tracked paths completes with `provenance_source: "git"` (reuse the index-only fixture technique from `src/closeout/tracked-shippable-paths.test.ts`). Reopen: run `src/closeout/public-safety-provenance.test.ts`. Mutant: replace the helper with plain spawnSync at Node's default 1 MiB buffer → RED (or document why not reproducible and give the PM the exact reason).
Each proof: run unmutated (green), apply the mutant, observe RED, restore, record both in `reports/LANE-public-safety-provenance.md`.
Gates (exact commands):
- tsc --noEmit
- nice -n 10 pnpm exec -- node ./node_modules/vitest/vitest.mjs run --allowOnly=false --no-file-parallelism --testTimeout=120000 src/closeout/public-safety-provenance.test.ts src/closeout/inspection.test.ts src/cli.test.ts src/skill-contract.test.ts src/closeout/second-pass.test.ts src/run-receipt.test.ts src/closeout/tracked-shippable-paths.test.ts
- bun run audit:public
- if `bin/mister-clean.js` changes: two clean `pnpm run build:raw` under bun 1.4.0 (`export PATH=$TMPDIR/bun140/bin:$PATH`, `bun --version` = 1.4.0), byte-identical, then `bun run manifest:package:check` PASS; hashes in the report
- ~/.local/share/charter/bin/b9323cd119f2ef2fe83db21b8ed8f844215e8852/bin/charter check --strict
- once at the end: nice -n 10 pnpm run test:node, every red classified (environment class vs candidate)
Out of scope (recorded obligations, not fixed here):
- policy about ignored findings (exit code stays 1 on any finding; this lane only makes provenance legible)
- SKILL.md bytes (25 bytes under its 20,000-byte budget; no doctrine text added there)
- provenance for `scanSelectedPublicSafetySync` callers that supply an arbitrary surface (`scripts/verify_public_package.ts`): reported as `unknown` / `unavailable` with reason `selected_surface`, never guessed
Owner decision points:
- none
