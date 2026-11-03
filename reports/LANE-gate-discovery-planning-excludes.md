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

## Out of scope (recorded obligations)

- Runner-safety findings (`repository:runner-safety`) under evidence/archive
  roots are still reported; the ruling covers manifests only.
- No CLI flag or environment override for the exclusion; policy lives only in
  `.mister-clean/planning.json`.
- Bundles recorded under discovery schema 1.3 still validate structurally, but
  a live revalidation of such a bundle will see a 1.4 fresh discovery differ
  from the recorded one (as any discovery change does); a fresh `prepare`
  resolves it.
