# DONE: intake-bounded-state (SEM-STATE-E79E176AE0FA)
Slice: the machine-local evaluation intake keeps collector-bound dispatch receipts in a process-local map. It is filled when a run starts and emptied only after a successful outcome, so a run that never gets an outcome, or whose outcome throws, stays in the map for the life of the process. Give the map a named maximum, evict the oldest entry when full, refuse a later outcome for an evicted run with a typed error (fail closed), and remove the entry in a `finally` so a throwing outcome cannot leak it.

1. Start MAX+1 runs without outcomes: the map never exceeds MAX.
   - reopen: `pnpm exec -- bun ./node_modules/vitest/vitest.mjs run src/control-plane/runtime/evaluation-intake-bounded-state.test.ts -t "never exceeds"`
   - mutant: remove the eviction → RED.
2. `outcome()` for an evicted run is refused with the typed error and records nothing.
   - reopen: `… -t "evicted run"`
   - mutant: let it fall through → RED.
3. An `outcome()` that throws still removes its entry.
   - reopen: `… -t "throwing outcome"`
   - mutant: remove the `finally` → RED.
4. The semantic audit (`MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun src/cli.ts audit semantic . --json`) no longer reports SEM-STATE-E79E176AE0FA; with the constant and eviction removed it reports it again. Both outputs are recorded in the lane report.
   - reopen: the command as named.
   - mutant: remove the constant and the eviction → the finding returns → RED.
5. Regression: control-plane tests (`pnpm run test:bun`) and the node suite files touching intake green; skill-contract; `tsc --noEmit`; `charter check --strict`; `audit:public`; full `pnpm run test:node` once, reds classified.
   - reopen: the commands as named.
   - mutant: n/a (regression set).

Each proof: green, mutant RED, restore; recorded in reports/LANE-intake-bounded-state.md.
