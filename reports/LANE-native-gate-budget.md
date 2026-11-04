# Lane: repository-declared native-gate time budgets

Branch `feat/native-gate-budget`, from main e61d0d7 (7.5.0). DONE list:
`charter/DONE/native-gate-budget.md` (committed first; unchanged). Finding
fixed: DEBT-NATIVE-GATE-8EE43DE5895D0E3B (installed 7.4.0 `prepare` on
e61d0d7: `node:.:ci-check` `timed_out` at the fixed 10-minute default).

## What changed

- **Declaration (`.mister-clean/native-gates.json`, `mister-clean.native-gates/1`).**
  `{ "schema": …, "gates": { "<gate id>": { "timeout_ms": N, "reason": "…" } } }`.
  `loadNativeGateBudgets` in `src/closeout/native-gates.ts` reads it against the
  discovery's gate ids and refuses, typed (`NativeGateBudgetInvalidError`,
  `code: "native_gate_budget_invalid"`, `path`, `reason`), for malformed JSON,
  an unknown schema or key, a gate id the discovery does not define, a
  `timeout_ms` that is not a positive safe integer or exceeds
  `NATIVE_GATE_TIMEOUT_MAX_MS` (2 hours), or an empty reason. No file → null.
- **Runner (`src/closeout/native-gate-runner.ts`).** `runNativeGates` loads
  the budgets once, after discovery integrity and before any gate executes;
  a refusal aborts the whole run with no coverage record and no gate output.
  Each gate runs under `declared ?? run default` (the `timeout_ms` option or
  `DEFAULT_TIMEOUT_MS`). `executeGate` now takes the budget record and every
  execution carries `budget`: `{ source: "default", timeout_ms }` or
  `{ source: "repository", timeout_ms, path, sha256, reason, default_timeout_ms }`.
- **Coverage schema 1.4 → 1.5** (`src/closeout/native-gate-validation.ts`):
  `budget` is a required execution key on 1.5 and validated
  (`validateBudgetEvidence`: shape, positive integer ≤ maximum, the declared
  path, a hex digest, a nonempty reason); legacy 1.4 records without it still
  validate. Fresh runs always write 1.5.
- **This repository** declares `node:.:ci-check` at 2,400,000 ms (40 min) with
  the reason: the clean-CI capsule's serialized Node matrix needs ~25 min
  (`TEST_NODE_MATRIX_TIMEOUT_MS` 1,500,000), so the default could never pass
  the judge's own gate.

## Proofs (vitest, fixture repositories; each mutant applied, observed RED, restored)

Test file `src/closeout/native-gate-budget.test.ts`. Fixture: a bun-managed
package whose `test` gate (`node sleep.mjs`) sleeps 2.5 s; the run default is
1 s; the declared budget 20 s.

| # | Test | Green | Mutant | Observed RED |
|---|------|-------|--------|--------------|
| 1 | declared budget → `passed`, coverage `1.5`, `budget` = `{source:"repository", timeout_ms 20000, path, sha256 of the file, reason, default_timeout_ms 1000}`, validator `[]` | pass | runner ignores the file | `expected 'timed_out' to be 'passed'` |
| 2 | 8 invalid files (above max, non-integer, non-positive, unknown gate id, missing reason, unknown key, unknown schema, malformed JSON) → `NativeGateBudgetInvalidError` with code/path/reason, and no gate output written | pass | silent clamp to the maximum | "above the maximum": `expected undefined to be an instance of NativeGateBudgetInvalidError` (the gate ran) |
| 3 | file naming only `node:.:lint`: lint `passed` under the declared budget, test `timed_out` with `budget.source "default"`; no file at all: `timed_out`, `source "default"` | pass | any declared budget applied to every gate | `node:.:test` no longer `timed_out` |
| 5 | `validateBudgetEvidence` rejects a fractional `timeout_ms` and a foreign path | pass | integer check dropped | `expected true to be false` |

## Proof 4: source `prepare` on a frozen clone of this branch

`MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun src/cli.ts prepare --repo <clone> --evidence-home <scratch> --run-id … --request-ref …`,
run from this worktree against `git clone --no-local` copies of the branch in
`$TMPDIR` (never the primary checkout), bun 1.4.0, host load 8–13 with other
lanes' suites running.

**Run 1 (clone at 9a8b3a4, the implementation commit, before the packaged
bytes were regenerated):** `node:.:ci-check` ran 5 min 9 s and ended `failed`
(`clean ci: FAIL (build:raw changed the candidate RepositoryObject …)`): the
capsule's own build rewrote `bin/mister-clean.js` and `MANIFEST.sha256`
because that commit did not yet carry them. A real failure of that clone, not
a timeout, and not the final bytes; superseded by run 2.

**Run 2 (clone at e841d08, the final bytes of this lane):** coverage schema
`1.5`, validation `fail` with exactly two "required gate did not pass" errors
(the two failures below), `prepare` exit 0, verdict `NOT_CLEAN`.

| gate | state | budget evidence | ran | what happened |
|---|---|---|---|---|
| `node:.:ci-check` | `failed` (`nonzero_exit`, exit 1) — **not `timed_out`** | `source: "repository"`, `timeout_ms: 2400000`, `path: .mister-clean/native-gates.json`, `sha256: 44393c01…`, reason as declared, `default_timeout_ms: 600000` | 23:32:54 → 23:49:02 (16 min 8 s) | the capsule completed its matrix and reported a real result; the one failing test is `scripts/release_path.test.ts` "runs this package's real build inside an exact external Git capsule": `Hook timed out in 10000ms` in `afterEach` (fixture removal), the environment class recorded by prior lanes for this host under load. Under the former 10-minute default this gate ended `timed_out` at 10:00 with no result at all (the finding on e61d0d7). |
| `cargo:tools:campaign-observer:test` | `failed` (`nonzero_exit`, exit 101) | `source: "default"`, `timeout_ms: 600000` | 17 s | `error: rustc 1.88.0 is not supported … requires rustc 1.89`: this host's rustup default toolchain is 1.88.0 (`rustup show`), the crate declares `rust-version = "1.89"` and no `rust-toolchain.toml`; hosted CI's runner rustc is newer and passes. Environment class (operator host toolchain), not the candidate and not this lane; #56's locators are in place (the gate reached cargo). |
| `cargo:tools:campaign-query:test` | `passed` | `source: "default"`, `timeout_ms: 600000` | 14 s | — |

So the budget mechanism does what the finding needed: the judge's own gate
now runs to completion under a declared, capped, recorded budget. "Both cargo
gates pass" is not shown on this host because of its 1.88 default toolchain;
it is for hosted CI to show.

## Gates (worktree, `PATH=$TMPDIR/bun140/bin:$PATH`, bun 1.4.0)

| command | result |
|---|---|
| `pnpm exec tsc --noEmit` | exit 0 |
| `… vitest run … native-gate-budget.test.ts native-gates.test.ts prepare.test.ts` | 3 files, 60/60 pass |
| `… vitest run … src/skill-contract.test.ts` (after the build) | 43/43 pass |
| `pnpm run build:raw` twice, `dist/` removed before each | identical hashes: `bin/mister-clean.js` 2c256b54…, `dist/public.js` 07a07185…, `dist/stdio.js` 3bac1b57…, `dist/planning.js` d079be0c…, `dist/control-plane.js` b56369b5…; `MANIFEST.sha256` 32b14832… |
| `bun run manifest:package:check` | PASS (82 entries) |
| `bun run audit:public` | PASS (83 files) |
| `charter check --strict` (pinned b9323cd) | ok |
| `SKILL.md` | not grown (19,975 bytes) |
| full local suite | not run (owner decision 24954d2: S6 evidence is hosted CI on the exact tip) |

## Out of scope

- none recorded (owner rule: no new debt); the two cargo gates' 7.4.0
  failures are fixed on main by #56 and only verified in proof 4.
