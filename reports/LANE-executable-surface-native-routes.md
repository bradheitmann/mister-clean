# Lane: the executable-surface detector routes scripts and built targets through hosted CI steps

Branch `feat/executable-surface-native-routes`, from main 24954d2. DONE list:
`charter/DONE/executable-surface-native-routes.md` (committed first; unchanged
after its two strict-check wording fixes, which preceded any implementation).
Finding fixed: SEM-EXECUTABLE-CBB67799E249 on main 7.4.0.

## What changed (`src/closeout/semantic.ts`)

- **Native routes from workflow steps.** `nativeRoutes` parses every tracked
  `.github/workflows/*.yml`, and for each `run:` step whose `if:` is absent or a
  plain `startsWith(github.ref, 'refs/tags|heads/…')` / `github.ref ==
  'refs/heads/…'` condition, feeds each line to `nativeRouteChain`. Steps or
  jobs with any other condition are never credited and are named in evidence
  as `workflow step not credited: …`.
- **The native grammar.** Same literal-token discipline as the static
  recognizer (no control flow, expansion, redirection or quoting beyond
  `&&`), plus: leading `NAME=value` env prefixes are stripped; `pnpm|npm|yarn|bun
  run <script>` recurses into the package script (recorded as executed);
  `pnpm exec [--] tool` / `npx` / `bunx` unwrap to the tool; `bun|node|tsx
  <tracked source file>` records that file as executed; `tsup` reads the
  `entry` list of a tracked `tsup.config.*` (or positional entries) and records
  the entries as compiled and `<outDir>/<stem>.{js,mjs,cjs}` as built; `bun
  build <entry> --outfile|--outdir` likewise; `vitest`, `jest`, `mocha`, `bun
  test`, `node --test`, `cargo test` record a test matrix for the package
  directory; `cd` changes cwd; shell-state builtins (`export`, `source`,
  `eval`, …) stop crediting the rest of the chain; any other command is
  recorded as unknown (never credited, never poisoning a CI route).
- **Gap computation.** A declared runtime target absent from the tree is
  resolved only through a credited build that produces it; its entry sources
  become seeds. A required file has a native route when a credited step
  executed or compiled it, when it is in the static import closure of such a
  file, or when a credited step runs the test matrix of its package. A
  release-named script is discharged by a credited step that executes it, or
  when its whole chain parses on the native grammar, names no unmodelled tool,
  and every entry it reaches has a native route. Static "unsupported command"
  diagnostics are dropped for scripts a credited step executes. When a gap
  remains, every credit is listed with the workflow, job and step that is the
  route.
- **Unchanged.** The static package-script recognizer (`staticGateRoute`) and
  every adversary case without a CI step: `VALIDATOR=node node --check …`
  stays debt, compiler and linter configs still prove nothing, no script body
  is read.

## Proofs (vitest, fixture repos; each mutant applied, observed RED, restored)

Test file: `src/closeout/semantic-native-routes.test.ts`. Fixture: env-prefixed
bun/pnpm/node/tsc scripts, `exports`/`bin` on `dist/public.js` and
`dist/cli.js` produced only by `tsup`, and a CI step running
`FIXTURE_MODE=1 pnpm run build` and `FIXTURE_MODE=1 pnpm run test`.

| # | Test | Green | Mutant | Observed RED |
|---|------|-------|--------|--------------|
| 1 | "proof 1": no executable-surface candidate at all (zero "unsupported command", zero "unresolved declared runtime target"); "proof 1 (evidence)": with one extra unbuilt target the evidence names `… ci.yml#verify step 'Build and test' -> build (tsup tsup.config.ts)` for each credit and contains no `unsupported command: bun` / `FIXTURE_MODE=1` | pass | env prefixes not stripped on the native route | `expected { …(5) } to be undefined`; `not to contain 'unsupported command: FIXTURE_MODE=1'` |
| 2 | "proof 2": `./dist/extra.js` that no step builds stays `coverage-unestablished` with `unresolved declared runtime target: ./dist/extra.js` | pass | any `dist/` target resolved by name | candidate vanished (`undefined`) |
| 3 | "proof 3 (shape)": without the build step the targets and `build` obligation return; plus the real-repository runs below | pass | release scripts credited by name alone | `to contain 'release input closure requires native evidence: build'` missing |
| 4 | existing gates (below) | pass | static recognizer strips env prefixes | `semantic.test.ts` "environment expansion" case: candidate vanished |

Also: "credits no step whose condition it cannot classify"
(`github.event_name == 'workflow_dispatch'` step → targets unresolved,
`step condition not credited` named).

### Proof 3 on this repository (`MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun src/cli.ts audit semantic . --json`)

**Before (main 24954d2):** `SEM-EXECUTABLE-CBB67799E249` with 37 "unsupported
command" notes, 4 "unresolved declared runtime target" (`./dist/control-plane.js`,
`./dist/planning.js`, `./dist/public.js`, `dist/stdio.js`), 16 "release input
closure requires native evidence" and 14 "runtime dependency closure" reasons.

**After (this branch):** the candidate is still listed, but with exactly three
obligations and nothing else:

```
release input closure requires native evidence: deploy
release input closure requires native evidence: pack:check
release input closure requires native evidence: prepack
```

All four dist targets resolve (`declared target … built by ci.yml#verify step
'Build the tagged checkout in place for the release source check' (if:
startsWith(github.ref, 'refs/tags/v')) -> build:raw (tsup tsup.config.ts)`), 98
files have named native routes, zero "unsupported command", zero "validation
route unestablished", zero "runtime dependency closure". The three that remain
are real gaps under fail-closed, not detector weaknesses: `deploy` ends in
`wrangler deploy` (an unmodelled tool whose inputs come from its own config),
`pack:check` ends in `pnpm … pack --dry-run` (unmodelled tool), and `prepack`
is an inline `node -e "…"` (quoted inline interpreter; also outside the
owner's language rule). No workflow step executes any of the three.
Repository finding for the PM, not a detector change.

**Build step removed** (scratch edit of ci.yml deleting the tag-conditional
build step, restored with `git checkout` afterwards): the listing widens again
to the four `unresolved declared runtime target` reasons plus `release input
closure requires native evidence: build:raw` and `control-plane:build`, as the
DONE list requires.

## Gates (worktree, `PATH=$TMPDIR/bun140/bin:$PATH`, bun 1.4.0)

| command | result |
|---|---|
| `pnpm exec tsc --noEmit` | exit 0 |
| `… vitest run … src/closeout/semantic-native-routes.test.ts src/closeout/semantic.test.ts` | 2 files, 98/98 pass |
| `… vitest run … src/skill-contract.test.ts` (after the build) | 43/43 pass |
| `pnpm run build:raw` twice, `dist/` removed before each | identical hashes: `bin/mister-clean.js` 6c2e7e7a…, `dist/public.js` 88a82bf5…, `dist/stdio.js` bcde43da…, `dist/planning.js` d079be0c…, `dist/control-plane.js` 0606fa5d…; `MANIFEST.sha256` 77602a25… |
| `bun run manifest:package:check` | PASS (82 entries) |
| `bun run audit:public` | PASS (83 files) |
| `charter check --strict` (pinned b9323cd binary) | ok |
| `SKILL.md` | unchanged (19,975 bytes, no diff against main) |
| full local suite | not run (owner decision 24954d2: S6 evidence is hosted CI on the exact tip) |

A test runner invoked through its installed entry
(`bun ./node_modules/vitest/vitest.mjs run …`, as this repository's
`package:surface:check` does) is recognized as the same test matrix as the bare
runner command; covered by the "installed node_modules entry" test.

## Out of scope (as declared in the DONE list)

- Steps with conditions other than plain ref checks (for example
  `steps.probe.outputs.reachable == 'true'`) are never credited.
- Non-GitHub CI systems; `tsc` emit outputs (`outDir`) as built targets.
