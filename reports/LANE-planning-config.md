# Lane: prepare on a large repository, and a repository-level planning config

Branch `fix/prepare-large-repo-and-planning-config`, from main 87c8d73.

## What changed

- **Defect 1 (`prepare` ENOBUFS).** The fix (`maxBuffer: GIT_OUTPUT_LIMIT_BYTES`
  in `gitNullPaths`) was already on main. This lane adds the missing regression
  test on `prepare`'s own path: `src/closeout/tracked-shippable-paths.test.ts`
  builds a fixture repository whose `git ls-files --cached -z` output is
  1,084,800 bytes (1,200 entries of about 900-byte paths) and asserts that
  `trackedShippablePaths` returns every path. The fixture is index-only: the
  entries go into the index with one `git update-index --index-info` and are
  marked skip-worktree with one `git update-index --stdin`, so no worktree
  files are created or removed. Teardown is one `rmSync` of a tree holding
  only `.git`.
- **Defect 2 (heuristic-only planning discovery).** New
  `.mister-clean/planning.json` (`mister-clean.planning-config/1`, keys
  `schema`, `roots`, `exclude`), loaded and validated by one function,
  `loadPlanningConfig` in `src/closeout/repository.ts`.
  - `discoverPlanningRoots` (used by `audit planning`, `prepare` and the
    semantic audit) and the bundle validator's discovery (now exported as
    `discoverBundlePlanningRoots` in `src/closeout/bundle.ts`) both use it.
  - Declared `roots` replace the heuristic (`[]` = no roots). `exclude`
    prefixes bound the heuristic walk and the unprojected-planning probe in
    both modes.
  - The config file itself is never a root, although `planning.json` is a
    canonical planning file name.
  - Invalid configs throw `PlanningConfigInvalidError`
    (`code: "planning_config_invalid"`, `path`, `reason`). `audit planning`
    exits 2 and prints `{code, path, reason}` with `--json`. The bundle
    validator records it as a planning error. Nothing falls back to the
    heuristic.
  - Beyond the brief's list, two more cases are refused: a declared root that
    is a symbolic link, which the census cannot bind; and a non-array
    `roots`/`exclude`. Nested declared roots reduce to the outermost one, as
    heuristic roots already do.
  - `audit planning --json` reports `planning_config: {path, sha256} | null`.
    `prepare` gets it in `planning-audit.json`, and each planning system's
    `schema_sources` names the config and its digest.
  - Documented in the doc comment on `PlanningConfig` and in README's planning
    section; no file under `references/` covers planning discovery.
- Packaged bytes were regenerated through the normal scripts:
  `bin/mister-clean.js` and `MANIFEST.sha256`.

## Proofs (vitest, synthetic fixture repos; each mutant applied, observed RED, restored)

| # | Test | Mutant | Result |
|---|------|--------|--------|
| 1 | `planning-config.test.ts` "proof 1" (`exclude: ["reports"]` drops `reports/x/tasks`) | `exclude` forced to `[]` in `discoverPlanningRoots` | RED: 4 roots, expected 3 |
| 2 | "proof 2" (`roots: ["plans"]` with heuristic `misc/tasks`) | declared roots merged into heuristic candidates | RED: 4 roots, expected `["plans"]` |
| 3 | "proof 3" (`roots: []`: no roots, 0 artifacts, CLI JSON `planning_config`) | `[]` treated as absent | RED: 4 roots, expected `[]` |
| 4 | "proof 4" (10 cases: `../x`, absolute, unknown key, missing root, root under exclude, malformed JSON, unknown schema, non-string, harness root, nested-checkout root) | default config load swallows errors (heuristic fallback) | RED: 10/10 failed |
| 5 | "proof 5" (parity, 3 fixtures: none, exclude-only, declared) | bundle discovery ignores the config | RED: exclude-only and declared failed; no-config passed (expected) |
| 6 | `tracked-shippable-paths.test.ts` | `maxBuffer` removed from `gitNullPaths` | RED: `GitOutputTooLargeError: git ls-files --cached -z produced at least 1084800 bytes` (the ENOBUFS, typed); re-observed on the index-only fixture |

All 18 tests are green after the mutants were restored.

### Fixture timing for proof 6 (QA defect D1)

The first fixture wrote 1,600 files and its teardown ran over vitest's 10 s
hook budget under load. The index-only fixture, measured on this host at load
average 8-11 (`nice -n 10`, default vitest timeouts):

| phase | runs (ms) |
|---|---|
| `git init` (shared `createFixtureRepository`) | 4,930 / 11,472 / 14,684; 10-30 when the host is quiet |
| `hash-object` + two `update-index` + two `ls-files` | 390 / 3,200 / 3,400 |
| teardown `rmSync` | 222 / 297 / 535 (was about 11,000 and up with 1,600 files) |
| whole test body, five vitest runs | 3,092 / 5,461 / 12,002 / 12,721 / 15,900 |

The fixture's own work is 0.4-3.5 s, and teardown is well inside the hook
budget. The 5 s target is not met on this host because `git init` alone
takes 4-17 s under this load (`GIT_TRACE_PERFORMANCE` attributes the whole
time to the one `init` command, at 0% CPU, and the same command takes 10-30 ms
when the host is quiet). That cost is paid by every test that uses the shared
fixture helper and is not specific to this test. `test:node` runs with
`--testTimeout=120000`, under which the test passes.

## Real-repo acceptance (throwaway local clone of the large workspace)

The config was `{"schema":"mister-clean.planning-config/1","exclude":["reports/LANE-p00-depth-assessment-artifact-2"]}`.

| | before (no config) | after |
|---|---|---|
| findings | 29,137 | 633 |
| JSON output bytes | 401,643,280 | 5,809,497 |
| artifacts / planning roots | 5,422 / 9 | 382 / 5 |
| wall time / peak RSS | 712 s / 9.37 GB | 15.4 s / 1.18 GB |
| `planning_config` | `null` | `{path, sha256: 9434d559…}` |

Both runs exit 1 (findings remain). The brief's 57,008 is not what this run
printed: `findings` and `raw_finding_count` were both 29,137 here.

## Commands run

- `tsc --noEmit -p tsconfig.json` (after `bun run build:materials`): pass
- `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run --allowOnly=false --testTimeout=120000 src/closeout/planning-config.test.ts src/closeout/tracked-shippable-paths.test.ts`: 18/18 pass
- `bun run audit:public`: PASS
- `bun run build:raw`: stops at `package:source-surface:check`. One socket
  test in `public-surface.test.ts` times out, the known socket environment
  class on this host. The remaining build steps were run by hand: `tsup`,
  `control-plane:build`, `package:surface:check` (pass), `sync:cli`,
  `manifest:package`.
- `bun run manifest:package:check`: PASS; `bun run sync:cli:check`: pass
- Rebuild after QA defect D2 (stale `dist/` bytes at 218898be: the first
  hand-run build had generated `src/generated-materials.ts` while
  `build:scorecard`'s reordered dashboard assets were on disk, so the public
  and stdio bundles embedded the wrong dashboard HTML). Fix: restore the
  committed assets, `bun run build:materials` (check passes), remove `dist/`,
  run `tsup`, `control-plane:build`, `package:surface:check`, `sync:cli`,
  `manifest:package`; then remove `dist/` and run the same list a second
  time. Both builds produced identical `MANIFEST.sha256` and identical hashes:
  `bin/mister-clean.js` 5072720b…, `dist/public.js` 68632526…,
  `dist/stdio.js` f7eb06ac…, `dist/planning.js` d079be0c…,
  `dist/control-plane.js` b9433691…. Against main, the manifest now differs
  only in `README.md` and `bin/mister-clean.js`; `manifest:package:check`
  PASS.
- `charter check --strict` (pinned b9323cd): ok
- `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun src/cli.ts audit planning <clone> --json`: before and after, as above

## Baseline red, not caused by this lane

- `build:scorecard` (and `build:scorecard:check`) on this host's bun 1.3.9
  reorders the export list in the two scorecard dashboard assets, so the
  check is red identically on main. The regenerated assets were restored and
  are not part of this change.
