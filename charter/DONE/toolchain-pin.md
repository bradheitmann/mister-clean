# DONE: toolchain-pin (O-TOOLCHAIN-1)
Slice: packaged bytes are reproducible only under the bun version CI pins; make that pin a tracked repository fact and make the packaging manifest refuse a mismatched toolchain with a typed message instead of reporting a stale manifest.

1. `.bun-version` is tracked and equals the `bun-version` in `.github/workflows/ci.yml`.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/toolchain-pin.test.ts -t "ci pin"`
   - mutant: change `.bun-version` to `1.3.9` → the drift test fails (RED).
2. `checkToolchainPin(root, "1.4.0")` passes when the pin is 1.4.0; `checkToolchainPin(root, "1.3.9")` returns a mismatch naming both versions.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/toolchain-pin.test.ts -t "mismatch"`
   - mutant: make the comparison always succeed → RED.
3. A repository without `.bun-version` is not refused (unpinned repositories keep today's behaviour) and the result says `pinned: false`.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/toolchain-pin.test.ts -t "unpinned"`
   - mutant: treat a missing pin as a mismatch → RED.
4. `mister-clean manifest <root> --package [--check]` refuses with exit 2 and `manifest: TOOLCHAIN MISMATCH (bun <actual>; repository pins <pinned>)` when the running bun differs from the pin, before writing or comparing anything.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/toolchain-pin.test.ts -t "cli"`
   - mutant: remove the call in `runManifest` → RED.
5. Unchanged: `manifest:package:check` PASS under bun 1.4.0 on this tree; `src/skill-contract.test.ts` green; SKILL.md byte count unchanged; `tsc --noEmit` clean; `charter check --strict` ok; `audit:public` PASS.
   - reopen: the commands as named.
   - mutant: n/a (regression set).
