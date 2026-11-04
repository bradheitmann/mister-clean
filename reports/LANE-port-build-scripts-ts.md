# LANE port-build-scripts-ts — eight build/report scripts from .mjs to strict TypeScript (O-LANG-1)

Worktree `~/.config/superpowers/worktrees/mister-clean/port-build-scripts`, branch `chore/port-build-scripts-ts` from
origin/main `a1f39eb`. DONE list committed first as `charter/DONE/port-build-scripts-ts.md` (`0e82021`); it did not grow.
Toolchain for every build and check below: bun 1.4.0 (`$TMPDIR/bun140/bin`, `bun --version` = `1.4.0`), node v26.12.0,
TypeScript 6.0.3. Author: Claude Opus 5.5 (Claude Code dev subagent).

## What changed

- `9979749`: pure `git mv` of the eight scripts (`sync_cli`, `verify_package_exports`, `build_model_scorecard_interactions`,
  `generate_materials`, `generate_codebase_history`, `report_snapshot`, `render_model_scorecard`,
  `render_case_study_report`) from `.mjs` to `.ts`, content unchanged, so history follows each file.
- `37fd24a`: strict typing. Each file is listed in tsconfig `include`. Edits are type-only: annotations, input
  interfaces for the local JSON report projections (only the fields each renderer reads), erased casts and non-null
  assertions. The release cluster is untouched.
- References: package.json scripts (`build:scorecard[:check]`, `build:materials[:check]`, `package:import:check`,
  `report:case-study`, `report:scorecard`, `report:history`, `sync:cli[:check]`); four tests that pin a script path
  (`skill-contract`, `model-scorecard-interactions`, `package-surface`, `report-snapshot`, which now imports the typed
  module instead of an `@ts-expect-error` untyped import).
- `package:import:check` stays on `node` (it checks the export surface under the engine users run). Node runs the `.ts`
  file through its built-in type stripping; every construct in the file is erasable.

Three typing decisions, each commented inline:
- No Bun type package is installed and the lane adds no dependency, so `build_model_scorecard_interactions.ts` declares
  the one `Bun.build` call narrowed to the fields it uses.
- Under the repository's combined Node and Workers type set, `readFileSync` returns a Buffer type without Node's
  `toString(encoding)` and `equals`. `report_snapshot.ts` exports `FileBytes`, naming those two methods; this was
  confirmed with a throwaway probe file (removed).
- `render_model_scorecard.ts` replaces each tuple's locator strings with bound receipt links in place. The receipt call
  therefore takes `state as unknown as ReceiptScorecard` at the one point where evidence is still strings.

No `any` appears in the eight files (`grep -nE ':\s*any\b|as any\b|<any>'` returns nothing); every `JSON.parse` result
is cast to a declared input type.

## Behaviour identity (supporting evidence)

`bun build --no-bundle --target=bun` of each `.mjs` (base) and each `.ts` (port), compared byte for byte:
five files identical; three differ only in an intended path string (the history usage line names `.ts`; the two
renderers import `./report_snapshot.js`, the repository's NodeNext convention, which Bun and Vitest resolve to the
`.ts` file). Smoke runs: both renderers resolve the import and stop at their own first guard
(`MISTER_CLEAN_REPORT_TARGET_REPOSITORY is required`); `generate_codebase_history.ts` `--help` exits 0, an unknown option
exits 2, `--ref HEAD` emits the report. A live render with the real OKGO inputs was attempted on the base and fails
there too (the inputs cite `/tmp` evidence that no longer exists and an unlabelled `$LOCAL_EVIDENCE_ROOT` locator), so
it cannot serve as a before/after comparison; the placeholders created for that attempt were removed.

## Proofs and observed-RED mutants

1. **lang-guard.** Before (base): `17 untyped file(s): 2 .js, 15 .mjs`. After: `9 untyped file(s): 2 .js, 7 .mjs`.
   The diff removes exactly the eight ported files; the two generated bundles
   (`assets/codebase-state-dashboard/model-scorecard-interactions.js`, `bin/mister-clean.js`) remain; the remaining seven
   `.mjs` are the release cluster. Mutant: `git mv scripts/sync_cli.ts scripts/sync_cli.mjs` → `10 untyped file(s): 2 .js,
   8 .mjs` (RED, off by one); restored → 9.
2. **Byte identity.** Hash set: every file under `dist/` (23), `bin/mister-clean.js`, `src/generated-materials.ts`,
   `model-scorecard-interactions.js`, `model-scorecard.html`, `MANIFEST.sha256` (28 entries). Base: two clean
   `pnpm run build:raw` (dist and generated materials removed before each) → identical lists. Port: the same twice →
   identical lists. Base versus port: 27 of 28 identical; only `MANIFEST.sha256` differs, and inside it only one entry,
   `./package.json` (`e65b8735…` → `b6b8beaa…`), whose script paths name the renamed files. No script is a manifest
   entry, so no moved file appears in it. Tracked outputs were unchanged by every build (`git status` clean apart from
   the intended edits). Mutant: the generator's emitted header changed to `generate_materials.MUTANT` →
   `src/generated-materials.ts` `051c4661…` → `2a6aec99…` (RED); restored → `051c4661…`.
3. **Six checks PASS:** `build:scorecard:check` (Verified `64d3db8619cf`), `build:materials:check` (40 materials),
   `sync:cli:check`, `manifest:package:check` (PASS, 82 entries), `package:surface:check` (6/6),
   `package:source-surface:check` (31/31). Also `package:import:check` (node, PASS). Mutants, each RED then restored
   green: an extra line inside the template's inline-module markers → scorecard check "stale" (exit 1); a byte
   appended to `src/generated-materials.ts` → materials check exit 1; `bin/mister-clean.js` moved aside → sync check
   exit 1; a byte appended to README.md → `manifest: FAIL (MANIFEST.sha256 is stale)`; `package:import:check` reverted
   to `.mjs` in package.json → package-surface test expects `.ts` (exit 1); an extra runtime export in
   `src/control-plane.ts` → source-surface check exit 1. The lang-guard hook refuses shell writes to `.js` files, so the
   scorecard and sync mutants target the template and the bin location instead of the compiled module bytes.
4. **tsc.** `tsc --listFilesOnly` lists all eight `scripts/*.ts`; `tsc --noEmit` exit 0. Mutant:
   `const typeMutant: number = "not a number"` appended to `report_snapshot.ts` → TS2322, exit 2; restored → exit 0.
5. **Regression.** `skill-contract`, `report-snapshot`, `model-scorecard-interactions` tests: 3 files, 48/48.
   Mutant: the three path pins reverted to `.mjs` → 3 files failed (2 tests failed, `report-snapshot` failed to
   import); restored → 48/48. `audit:public` PASS (83 files). `charter check --strict` ok. SKILL.md 19975 bytes on
   base and branch. Full `pnpm run test:node`: see below.

## Full test:node

`pnpm run test:node` once on `37fd24a` (bun 1.4.0 on PATH, `nice -n 10`, host load 11 to 15 from other lanes):
`Test Files 3 failed | 50 passed (53)`, `Tests 9 failed | 893 passed (902)`, exit 1. Every red is classified
environment; none touches a ported script (`grep` of the three failing test files and `verify_generated_candidate.ts`
for the eight script names returns nothing).

| Red | Count | Classification | Evidence |
|---|---|---|---|
| `scripts/verify_generated_candidate.test.ts`, all five | 5 | environment (host hook) | Each fixture commit is refused by the host's lang-guard commit hook ("this commit adds untyped code: model-scorecard-interactions.js, bin/mister-clean.js"), files that exist on base. Base replay at `a1f39eb`: the same five fail with the same message. |
| `src/closeout/bundle.test.ts`, three native-gate tests | 3 | environment (load budget) | Each hits its in-test 30 s timeout (30.6 to 31.7 s). Base replay of the same three at load 11: one times out at 30.9 s, two pass just under budget. Matches the load-budget reds already recorded in the worktree ledger. |
| `scripts/run_clean_ci.test.ts`, cold-clone build | 1 | environment (transient) | `supervised command exited 128: pnpm` with no stderr captured. Not reproduced: an immediate rerun of the file on the same sha passed 8/8, and that test runs `build:raw` with the ported scripts from a cold clone. Base replay also passed. |

Baseline replays ran in an own detached worktree at `a1f39eb` (`baseline-pbs`), since closed with `git worktree remove`.

## Recorded obligations (next bounded slice; not fixed here)

- O-LANG-1a: `src/generated-materials.ts` still begins `// Generated by scripts/generate_materials.mjs.` Proof 2
  requires those bytes unchanged, so the emitted header was kept. Changing it is a one-line generator edit that
  intentionally changes the generated bytes (not `MATERIALS_SHA256`, which hashes the material list only).
- O-LANG-1b: the release cluster (seven `.mjs`) waits for the owner-approved workflow edit, as the brief states.
- `reports/LANE-run-receipts.md` quotes `bun scripts/sync_cli.mjs` as the command run in that past lane; it is a
  historical record and was left as written.

## Freeze addendum (merge of origin/main d70f722)

`0e0a931` merges origin/main `d70f722` (PR #56, PR #57). The one conflict, tsconfig `include`, keeps both sides: the
eight ported scripts plus `scripts/test-tmp-root.ts`, `scripts/test-tmp-root.test.ts` and `vitest.config.ts`. The
incoming changes reference none of the eight old `.mjs` paths.

Proof 2 rerun against the new base. Base `d70f722` was built in an own detached worktree (`baseline-pbs2`, since
closed). Two clean `build:raw` runs on the base and two on the merged branch, all under bun 1.4.0, each gave identical
hash lists. Base versus branch: 27 of 28 outputs identical; `MANIFEST.sha256` differs only in the `./package.json`
entry (`e65b8735…` → `b6b8beaa…`), the same single entry as against `a1f39eb`.

On the merged tree: the six checks and `package:import:check` PASS; `tsc --noEmit` exit 0; skill-contract,
report-snapshot and model-scorecard-interactions 48/48; lang-guard `9 untyped file(s): 2 .js, 7 .mjs`;
`charter check --strict` ok. The full suite was not rerun at the freeze, at the PM's direction.
