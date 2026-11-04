# Done list — executable-surface-native-routes (written BEFORE implementation; does not grow during it)
Base bytes: main 24954d2 (branch feat/executable-surface-native-routes)
Finding: SEM-EXECUTABLE-CBB67799E249 on main 7.4.0 (every bun/pnpm/node/tsc script "unsupported command"; CI-built dist/*.js "unresolved declared runtime target"; every release-named script an unconditional obligation).
Proofs (each: name, what it guarantees, reopen step, fail-without mutant):
1. ci-route-resolves-scripts-and-dist: a fixture repository whose package.json uses env-prefixed bun/pnpm/node/tsc scripts, declares `exports` on `dist/*.js` that a `tsup` build produces, and whose `.github/workflows/ci.yml` runs `pnpm run build` and the test runner, yields no executable-surface candidate: zero "unsupported command" and zero "unresolved declared runtime target", because each surface is mapped to a native route whose evidence names the workflow step. Reopen: run `src/closeout/semantic-native-routes.test.ts`. Mutant: drop the env-prefix parsing on the native route → the env-prefixed build script is no longer followed → RED.
2. unbuilt-dist-stays-closed: the same fixture with a `dist/*.js` target that no workflow step builds stays `coverage-unestablished` with "unresolved declared runtime target" naming it (fail closed). Reopen: same test file. Mutant: resolve declared targets by name alone (any `dist/` path) → RED.
3. this-repository: `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun src/cli.ts audit semantic . --json` on the branch no longer lists `SEM-EXECUTABLE-…` for this repository, and the listing returns when ci.yml's verify job stops running the build (both outputs recorded in the lane report). If a listing remains, the report names every remaining reason verbatim and why it is a real gap under fail-closed, not a detector weakness. Reopen: run the command on the tip, then on a scratch copy of ci.yml with the build step removed.
4. existing-gates-green: `src/closeout/semantic.test.ts` (all existing executable-surface adversary cases, including `VALIDATOR=node node --check …` staying debt without a CI step), `tsc --noEmit`, `charter check --strict`, double clean `pnpm run build:raw` under bun 1.4.0 with identical hashes, `manifest:package:check`, `SKILL.md` unchanged. Mutant: let the static package-script recognizer (no CI step) credit env-prefixed commands → the "environment expansion" adversary case goes RED.
Gates (exact commands):
- tsc --noEmit
- MISTER_CLEAN_SOURCE_DEVELOPMENT=1 nice -n 10 node ./node_modules/vitest/vitest.mjs run --allowOnly=false --no-file-parallelism --testTimeout=120000 src/closeout/semantic-native-routes.test.ts src/closeout/semantic.test.ts src/skill-contract.test.ts
- bun run audit:public; bun run manifest:package:check (after the double clean build); charter check --strict
- no full local suite (owner decision 24954d2: S6 evidence is hosted CI on the exact tip)
Out of scope (recorded obligations, not fixed here):
- workflow steps guarded by an `if:` other than a plain `startsWith(github.ref, 'refs/tags/…')` / branch-ref condition are not credited (named in evidence as skipped)
- reading a bun/node script's body to infer what it executes (e.g. a CI capsule script that runs the build internally) stays forbidden; only shell-visible commands route
- non-GitHub CI systems
Owner decision points:
- none expected; if proof 3 leaves a listing, the remaining reasons go to the PM as a repository finding, not a detector change
