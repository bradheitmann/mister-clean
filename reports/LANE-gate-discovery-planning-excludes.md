# Lane: planning-excluded roots prune native-gate discovery, visibly (O-GATE-SCOPE-1)

Branch `feat/gate-discovery-planning-excludes`, from main 890687a. Ruling:
`charter/owner-decisions/2026-11-03-gate-discovery-planning-excludes.md`. DONE
list: `charter/DONE/gate-discovery-planning-excludes.md` (committed first,
unchanged since).

## What changed

- **Planning config (`mister-clean.planning-config/1`, additive).** An
  `exclude` entry is a string (planning-only, unchanged) or an object
  `{ "path": "...", "kind": "evidence" | "archive" }`. `loadPlanningConfig`
  (the one loader in `src/closeout/repository.ts`) validates the object form
  with the same path rules, refuses unknown keys and unknown kinds with the
  existing typed `planning_config_invalid`, and now returns `exclude` (every
  path, whatever its kind, for planning discovery) plus `gateExclude` (only
  `evidence`/`archive` paths). Schema version unchanged.
- **Native-gate discovery (`src/closeout/native-gates.ts`).**
  `discoverNativeGates` loads the same config; `package.json`, `Cargo.toml`
  and `go.mod` under a `gateExclude` root are not turned into gates and are
  not gate source refs. Each one is recorded as
  `{ kind: "gate_candidate_excluded_by_planning_policy", path, manifest, exclude_root }`
  in a new `excluded_candidates` array of the discovery record, in canonical
  path order, bound by `catalog_sha256`. Discovery schema goes 1.3 -> 1.4;
  `validateDiscoveryIntegrity` validates the new array on 1.4 records and still
  accepts a legacy 1.3 record without it. Runner-safety findings are not
  pruned (out of scope, recorded in the DONE list).
- **Report (`src/closeout/prepare.ts`).** Each exclusion is appended to the
  closeout report's `dimensions.verification.evidence` (the typed record) and
  `dimensions.verification.notes` (the line
  `gate candidate excluded by planning policy: <path>`), after any native-gate
  debt summary already there. The bundle's `native-gate-discovery.json` carries
  the same records.
- **README** planning section documents the object form and its effect.
- Packaged bytes regenerated under bun 1.4.0 (`bin/mister-clean.js`,
  `MANIFEST.sha256`). `SKILL.md` unchanged (19,975 bytes).

## Proofs (vitest, synthetic fixture repos; each mutant applied, observed RED, restored)

Test file: `src/closeout/native-gate-planning-excludes.test.ts`. Fixture: a
repository with `Cargo.toml` under `reports/artifact/` and `tools/real/`, a
heuristic planning corpus (`plans/ROADMAP.md`, `reports/x/tasks/T-1.md`), and
the config under test.

| # | Test | Green (unmutated) | Mutant | Observed RED |
|---|------|-------------------|--------|--------------|
| 1 | "proof 1" (object form `{path: "reports", kind: "archive"}`): one cargo gate (`tools/real`, id `cargo:tools:real:test`), `excluded_candidates` = one record naming `reports/artifact/Cargo.toml` with `exclude_root: "reports"`, the skipped manifest absent from `source_refs`, `validateDiscoveryIntegrity` = [], note text exact | pass | the record is never pushed (manifest still pruned) | `expected [] to deeply equal [ { …(4) } ]` |
| 1 (report) | "proof 1 (report)" (`kind: "evidence"`, archived manifest only): `prepare` writes the note and the typed evidence entry under `dimensions.verification`, `native-gate-discovery.json` has the record and no required gates, `validateBundleFile` `{ errors: [], ok: true }` | pass | same mutant | `expected [] to include 'gate candidate excluded by planning p…'` |
| 2 | "proof 2" (string form `"reports"`): `gateExclude` = [], both cargo gates discovered, `excluded_candidates` = [] | pass | discovery prunes on `exclude` instead of `gateExclude` | `expected [ 'tools/real' ] to deeply equal [ 'reports/artifact', 'tools/real' ]` |
| 3 | "proof 3" (`kind: "scratch"`): `loadPlanningConfig`, `discoverPlanningRoots`, `discoverNativeGates`, `discoverBundlePlanningRoots` all refuse with `PlanningConfigInvalidError` (code, path, reason `exclude[0].kind "scratch" is not one of ["archive","evidence"]`); CLI `audit planning --json` exits 2 with `{code, path}` | pass | any string kind accepted | `expected undefined to be an instance of PlanningConfigInvalidError` |
| 4 | "proof 4" (parity): string and object forms both yield planning roots `["plans"]` from `discoverPlanningRoots`, from `discoverBundlePlanningRoots`, and from `audit planning --json` (`planningRootCount` 1); the loaders' `exclude` lists are equal | pass | object-form entries dropped from the planning `exclude` list | `expected [ 'plans', 'reports/x/tasks' ] to deeply equal [ 'plans' ]` |
| 5 | existing gates (below) | pass | loader keeps only object-form entries in `exclude` (string excludes stop bounding planning discovery) | `planning-config.test.ts` "proof 1: exclude removes a heuristic false positive": `expected [ Array(4) ] to deeply equal [ Array(3) ]` |

One extra test, not a DONE proof: a legacy 1.3 discovery record (no
`excluded_candidates`) still validates, and a 1.4 record without the key is
reported `discovery is missing keys: excluded_candidates`.

All 6 tests in the new file pass after the mutants were restored (`git
checkout -- <file>`; `git status` clean before every gate run).

## Gates (exact commands, run in the worktree with `PATH=$TMPDIR/bun140/bin:$PATH`, bun 1.4.0)

| command | result |
|---|---|
| `pnpm exec tsc --noEmit` (after `bun run build:materials`) | exit 0 |
| `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 nice -n 10 node ./node_modules/vitest/vitest.mjs run --allowOnly=false --no-file-parallelism --testTimeout=120000 src/closeout/native-gate-planning-excludes.test.ts src/closeout/planning-config.test.ts src/closeout/native-gates.test.ts src/closeout/prepare.test.ts src/skill-contract.test.ts` | first run before the packaged build: 110 passed, 4 failed. Three were `skill-contract.test.ts` reading `dist/` that did not exist yet in this worktree (expected until the build below); the fourth is the native-gates "snapshot Git child makes no progress" leftover check, classified below. After the build: `skill-contract.test.ts` 43/43 pass; the native-gates test passes solo. |
| `pnpm run build:raw`, twice, `dist/` removed in between | both exit 0; identical hashes: `bin/mister-clean.js` = `dist/cli.js` 8ec4da7c…, `dist/public.js` 6c1fa211…, `dist/stdio.js` b65d5ed5…, `dist/planning.js` d079be0c…, `dist/control-plane.js` b9433691…; `MANIFEST.sha256` 4ac3723b… |
| `bun run manifest:package:check` | PASS (82 entries) |
| `bun run audit:public` | PASS (83 files) |
| `charter check --strict` (charter 0.1.0 b9323cd) | ok |
| `pnpm run test:node` | see below |

## Full `pnpm run test:node`

Run at tip 21885a3 (the packaged bytes committed), `nice -n 10`, bun 1.4.0 on
PATH, started 2026-11-03T09:46Z while three other lanes ran their suites:

```
Test Files  1 failed | 49 passed (50)
     Tests  5 failed | 883 passed (888)
  Duration  752.64s
```

The five reds are all in `scripts/verify_generated_candidate.test.ts`
("accepts fresh generated bytes…", "adjudicates the staged candidate…",
"computes a staged tree…", "preserves a tracked deletion…", "rejects
coherently stale generated bytes…"). Each fails at the same step: the fixture
commits its own temp repository and the host's lang-guard commit hook refuses
it with `lang-guard: this commit adds untyped code: assets/…/model-scorecard-interactions.js, bin/mister-clean.js`.
Both files exist unchanged in kind on main; the hook runs on this host, not in
the product. **Environment class (host commit hook), not candidate.** No
closeout, planning-config, native-gate, prepare, bundle or skill-contract test
is red; the native-gates leftover check (below) passed in this full run.

## Baseline red, not caused by this lane

- `src/closeout/native-gates.test.ts` "fails closed with NativeGateGitTimeoutError
  when a snapshot Git child makes no progress" asserts that `$TMPDIR` holds no
  `mister-clean-native-gate-snapshot-*` directory after the test. During the
  first gate run it found `mister-clean-native-gate-snapshot-LnCngZ`, which no
  longer existed by the time the run finished, and three other worktrees
  (`flaky-per-family`, `qa-public-safety-provenance`, `slice-zero`) had vitest
  running against the same shared `$TMPDIR`. The test passes solo on this
  branch. Environment class: shared-tmpdir crosstalk between concurrent lanes
  (the product-side leftover question is already O-TMP-1 in `charter/STATE.md`).

## After merging main 56c00cc (provenance, `.bun-version` pin, CURRENT.md)

`git merge --no-edit origin/main` (no rebase). One conflict, the generated
`MANIFEST.sha256`, resolved by taking main's copy and regenerating. The
auto-merged `bin/mister-clean.js` equals the fresh build byte for byte.

| command | result |
|---|---|
| `bun run build:materials` then `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm run build:raw` twice, `dist/` removed before each | identical hashes: `bin/mister-clean.js` 53b28eca…, `dist/public.js` 1e160172…, `dist/stdio.js` e6ae7768…, `dist/planning.js` d079be0c…, `dist/control-plane.js` b9433691…; `MANIFEST.sha256` 39bd7787… |
| `bun run manifest:package:check` | PASS (82 entries) |
| proofs + `planning-config`, `native-gates`, `skill-contract`, `toolchain-pin` tests (same vitest flags) | 5 files, 97/97 pass |
| `bun run audit:public` | PASS (83 files) |
| `charter check --strict` | ok |
| `SKILL.md` | unchanged, 19,975 bytes |
| `pnpm run test:node` | see "Full suite after the merge" below |

### Compatibility of the 1.4 discovery record with released 7.3.0 evidence

The released 7.3.0 CLI (`bin/mister-clean.js` on main) writes
`DISCOVERY_SCHEMA_VERSION = "1.3"` and no `excluded_candidates` key. The
validator keeps a legacy path for exactly that shape: a `1.3` record without
the key validates (covered by the "legacy 1.3 discovery record" test). Only a
record that claims `1.4` and lacks the key is refused, and no released writer
produces that shape. So bundles and evidence written by 7.3.0 keep validating.
The key stays required on `1.4` rather than optional-on-read because the
discovery record is validated by exact keys and bound by `catalog_sha256`; an
absent key would make two different byte shapes mean the same catalog, which
is the ambiguity the exact-key rule exists to refuse.

### Full suite after merging 56c00cc (tip 3bcf82f bytes plus the regenerated manifest)

```
Test Files  4 failed | 48 passed (52)
     Tests  9 failed | 889 passed (898)
  Duration  1226.06s
```

Every red is a class already recorded by prior lanes (`reports/LANE-public-safety-provenance.md`, `charter/STATE.md`); none is a candidate defect:

| Red | Test(s) | Class | Evidence |
|---|---|---|---|
| 1–5 | `scripts/verify_generated_candidate.test.ts` (5) | environment: capsule commit refused | `git commit` in the scratch capsule refused by the host-global lang-guard hook ("this commit adds untyped code: … bin/mister-clean.js"); same five as the first run. |
| 6–7 | `scripts/run_clean_ci.test.ts` (2) | environment: capsule commit refused | `supervised command exited 128: pnpm` in the cold-clone capsule, downstream of the same hook. Known class. |
| 8 | `scripts/release_path.test.mjs` real build in external capsule | environment: budget under load | `Hook timed out in 10000ms` with three other lanes' suites running. Known class. |
| 9 | `src/closeout/native-gates.test.ts` no-progress timeout | environment: shared `$TMPDIR` | the leftover check found another lane's `mister-clean-native-gate-snapshot-*` (a `bundle.test.ts` run from a sibling worktree was live); passed solo and in the first full run. |

## After merging main 8344246 (PR #52, snapshot carries local excludes)

Main advanced again during the run above. `git merge --no-edit origin/main`:
`src/closeout/native-gates.ts` auto-merged cleanly (the two changes touch
different functions); `MANIFEST.sha256` taken from main and regenerated.

| command | result |
|---|---|
| `bun run build:materials` then `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm run build:raw` twice, `dist/` removed before each | identical hashes: `bin/mister-clean.js` 8a835c0d…, `dist/public.js` 1e160172…, `dist/stdio.js` e6ae7768…, `dist/planning.js` d079be0c…, `dist/control-plane.js` b9433691…; `MANIFEST.sha256` 8297ed96… |
| `bun run manifest:package:check` | PASS (82 entries) |
| proofs + `planning-config`, `native-gates`, `gate-snapshot-local-excludes`, `skill-contract`, `toolchain-pin` (same vitest flags) | 6 files, 100/100 pass |
| `bun run audit:public` | PASS (83 files) |
| `charter check --strict` | ok |
| `SKILL.md` | unchanged, 19,975 bytes |
| `pnpm run test:node` | see below |

### Full suite after merging 8344246 (these exact bytes: 6bf7f2b plus the regenerated manifest)

```
Test Files  3 failed | 50 passed (53)
     Tests  9 failed | 892 passed (901)
  Duration  1742.12s
```

| Red | Test(s) | Class | Evidence |
|---|---|---|---|
| 1–5 | `scripts/verify_generated_candidate.test.ts` (5) | environment: capsule commit refused | the host-global lang-guard hook refuses the capsule's `git commit` ("this commit adds untyped code"), five occurrences in the log. |
| 6–8 | `scripts/run_clean_ci.test.ts` (3: cold clone, bounded Node-matrix timeout, rejected supervised run) | environment: capsule commit refused | all three see `supervised command exited 128: pnpm` from the cold-clone capsule, downstream of the same hook (the third expected exit 1 and got 128). Known class. |
| 9 | `scripts/release_path.test.mjs` real build in external capsule | environment: budget under load | `Test timed out in 120000ms` then `Hook timed out in 10000ms`; the file took 556 s with sibling lanes' suites running. Known class. |

No closeout, planning, native-gate, bundle, prepare, receipt, skill-contract
or toolchain test is red; the native-gates leftover check passed in this run.

## After merging main 9d7b6c8 (PR #53 gate-evidence subject change, PR #54 second-pass flaky per family)

Main advanced a third time. `git merge --no-edit origin/main`: only the
generated `MANIFEST.sha256` conflicted (taken from main, regenerated); no
source conflicts.

| command | result |
|---|---|
| `bun run build:materials` then `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm run build:raw` twice, `dist/` removed before each | identical hashes: `bin/mister-clean.js` 4a6cd51d…, `dist/public.js` 1e160172…, `dist/stdio.js` e6ae7768…, `dist/planning.js` d079be0c…, `dist/control-plane.js` b9433691…; `MANIFEST.sha256` 8b116a2d… |
| `bun run manifest:package:check` | PASS (82 entries) |
| proofs + `planning-config`, `native-gates`, `gate-snapshot-local-excludes`, `gate-evidence-subject-change`, `skill-contract`, `toolchain-pin` (same vitest flags) | 7 files, 103/103 pass |
| `bun run audit:public` | PASS (83 files) |
| `charter check --strict` | ok |
| `SKILL.md` | unchanged, 19,975 bytes |
| `pnpm run test:node` | see below |

### Full suite after merging 9d7b6c8 (these exact bytes: 8679a45 plus the regenerated manifest)

```
Test Files  1 failed | 53 passed (54)
     Tests  5 failed | 903 passed (908)
  Duration  676.99s
```

The five reds are the five `scripts/verify_generated_candidate.test.ts` tests,
each refused by the host-global lang-guard commit hook inside the test's own
scratch capsule ("this commit adds untyped code", five occurrences). Environment
class (host hook), not candidate. Every other file passed, including
`run_clean_ci`, `release_path` and the native-gates leftover check that were
red under heavier load in the two earlier runs.

## After merging main a1f39eb (PR #55, release 7.4.0)

Main advanced a fourth time with the release bump (version, MANIFEST, SKILL.md,
STATE.md). `git merge --no-edit origin/main` merged cleanly; the rebuilt
`MANIFEST.sha256` equals the merged one, so the tree stayed clean after the
build. `bin/mister-clean.js` is unchanged from the previous merge (it does not
embed the version).

| command | result |
|---|---|
| `bun run build:materials` then `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm run build:raw` twice, `dist/` removed before each | identical hashes: `bin/mister-clean.js` 4a6cd51d…, `dist/public.js` ed0b1f53…, `dist/stdio.js` 1c06f7a4…, `dist/planning.js` d079be0c…, `dist/control-plane.js` b9433691…; `MANIFEST.sha256` bd1597fd… |
| `bun run manifest:package:check` | PASS (82 entries) |
| proofs + `planning-config`, `native-gates`, `gate-snapshot-local-excludes`, `gate-evidence-subject-change`, `skill-contract`, `toolchain-pin` (same vitest flags) | 7 files, 103/103 pass |
| `bun run audit:public` | PASS (83 files) |
| `charter check --strict` | ok |
| `SKILL.md` | as on main 7.4.0, 19,975 bytes; this lane did not change it |
| `pnpm run test:node` | see below |

### Full suite after merging a1f39eb (these exact bytes: c50777e; the report commit after it changes no test input)

```
Test Files  1 failed | 53 passed (54)
     Tests  5 failed | 903 passed (908)
  Duration  765.59s
```

The five reds are again the five `scripts/verify_generated_candidate.test.ts`
tests refused by the host-global lang-guard commit hook in their scratch
capsule (five occurrences in the log). Environment class (host hook), not
candidate. Every other file passed.

## Out of scope (recorded obligations)

- Runner-safety findings (`repository:runner-safety`) under evidence/archive
  roots are still reported; the ruling covers manifests only.
- No CLI flag or environment override for the exclusion; policy lives only in
  `.mister-clean/planning.json`.
- Bundles recorded under discovery schema 1.3 still validate structurally, but
  a live revalidation of such a bundle will see a 1.4 fresh discovery differ
  from the recorded one (as any discovery change does); a fresh `prepare`
  resolves it.
