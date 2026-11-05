# Done list — runner-findings-byte-order (written BEFORE dispatch; does not grow during it)
Base bytes: c8b2663 (branch claude/tender-galileo-fuwg10)
Defect: `verificationRunnerSafetyFindings` in src/closeout/native-gates.ts sorts findings by path with ICU `localeCompare` (`alpha.test.ts` < `Zeta.test.ts`), while every other ordering in the module uses the shared `compareUtf8Bytes` comparator added in c8b2663. Finding order is therefore locale-dependent and disagrees with the module's own byte-order rule (`Zeta.test.ts` < `alpha.test.ts`).
Proofs (each: name, what it guarantees, reopen step, fail-without mutant):
1. runner-findings-byte-order: a fixture repository with unsafe synchronous gate wrappers in `Zeta.test.ts` and `alpha.test.ts` yields `auditVerificationRunnerSafety` findings in UTF-8 byte order of path (`Zeta.test.ts`, then `alpha.test.ts`), ties broken by line.
   - reopen: `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run --allowOnly=false src/closeout/native-gate-runner-finding-order.test.ts`
   - mutant: restore the `localeCompare` sort (c8b2663 bytes) → RED (findings come back `alpha.test.ts` first).
2. existing-gates-green: native-gate discovery and source-ref-order tests green; `tsc --noEmit`; generated CLI bundle regenerated under the pinned bun 1.4.0 so `generated:check` and `generated:postbuild:check` pass.
   - reopen: the gate commands below.
   - mutant: n/a (regression set).
Gates (exact commands):
- pnpm install --frozen-lockfile
- bun run build:materials
- pnpm exec tsc --noEmit
- MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run --allowOnly=false --no-file-parallelism --testTimeout=120000 src/closeout/native-gate-runner-finding-order.test.ts src/closeout/native-gate-source-ref-order.test.ts src/closeout/native-gates.test.ts
- bun run build:raw (bun 1.4.0 first on PATH; regenerates bin/mister-clean.js and MANIFEST.sha256), then bun run generated:check && bun run generated:postbuild:check
- charter check
Out of scope (recorded obligations, not fixed here):
- O-GATE-SNAPSHOT-PERF-1 (prepare snapshot performance): recorded in charter/STATE.md, not attempted.
- `localeCompare` orderings outside native-gates.ts (carried from gate-source-ref-byte-order).
Owner decision points:
- none; no release, no version bump.
