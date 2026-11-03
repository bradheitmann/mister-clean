# Done list — gate-discovery-planning-excludes (written BEFORE dispatch; does not grow during it)
Base bytes: main 890687a26e9ce13d1ed5f3b65fbf4836285c0543 (branch feat/gate-discovery-planning-excludes)
Ruling: charter/owner-decisions/2026-11-03-gate-discovery-planning-excludes.md (O-GATE-SCOPE-1)
Proofs (each: name, what it guarantees, reopen step, fail-without mutant):
1. archive-exclude-prunes-visibly: a fixture repository with `Cargo.toml` under `reports/artifact/` and `tools/real/`, and a planning.json that excludes `{ "path": "reports", "kind": "archive" }`, yields exactly one cargo gate (`tools/real`) and one typed exclusion record `{ kind: "gate_candidate_excluded_by_planning_policy", path: "reports/artifact/Cargo.toml", manifest, exclude_root: "reports" }`. Reopen: run `src/closeout/native-gate-planning-excludes.test.ts`. Mutant: drop the exclusion record → RED.
2. string-exclude-is-planning-only: the same fixture with the string form `"reports"` discovers both cargo gates and no exclusion record. Reopen: same test file. Mutant: prune on string excludes → RED.
3. unknown-kind-refuses-typed: `{ "path": "reports", "kind": "scratch" }` refuses with `planning_config_invalid` (code, path, reason) from the one loader, so `audit planning`, `prepare`, the bundle validator and gate discovery all refuse. Reopen: same test file. Mutant: accept unknown kinds → RED.
4. planning-roots-unchanged-for-both-forms: `audit planning` discovery and the bundle validator's discovery prune planning roots identically for the string form and the object form (`exclude: ["reports"]` ≡ `exclude: [{ "path": "reports", "kind": "archive" }]`), and the two discoveries agree with each other. Reopen: same test file. Mutant: object-form excludes dropped from the planning exclude list → RED.
5. existing-gates-green: existing planning-config, prepare and native-gate tests green; `src/skill-contract.test.ts` green; `tsc --noEmit`; `charter check --strict`; `audit:public`. Reopen: the gate commands below. Mutant: the loader returns `exclude: []` for string entries (string excludes stop bounding planning discovery) → existing planning-config proof 1 RED.
Gates (exact commands):
- tsc --noEmit
- MISTER_CLEAN_SOURCE_DEVELOPMENT=1 nice -n 10 node ./node_modules/vitest/vitest.mjs run --allowOnly=false --no-file-parallelism --testTimeout=120000 src/closeout/native-gate-planning-excludes.test.ts src/closeout/planning-config.test.ts src/closeout/native-gates.test.ts src/closeout/prepare.test.ts src/skill-contract.test.ts
- bun run audit:public
- bun run manifest:package:check (after regenerating packaged bytes through `pnpm run build:raw` twice under bun 1.4.0 with identical hashes, only if dist or bin change)
- charter check --strict
- full `pnpm run test:node` at the end, each red classified (environment class vs candidate)
Out of scope (recorded obligations, not fixed here):
- pruning runner-safety findings (`repository:runner-safety`) under evidence/archive roots; the ruling covers manifests only
- a CLI flag or env override for the exclusion; policy lives only in `.mister-clean/planning.json`
Owner decision points:
- none; the ruling is recorded as an A/EXEC-PM decision and the owner may override it
