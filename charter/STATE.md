# State — mister-clean — 2026-11-06T02:55Z (from `date -u`), written by the project PM (Claude Code) at the acceptance of master-gate S1b
HEAD: 8100826f9cce113ade647e604435bdb169a2e2e2 (branch mg/s1b-git-env-hardening at its acceptance, before this STATE refresh). Every claim below was verified on this object; successors compare before trusting a line.
Program: master-gate. The owner directed on 2026-11-05 that Mister Clean become "the master code quality and hygiene gate". The work order: review Mister Clean with every review skill, plan the integration, repair it, then absorb the skills as phases. v7.5.1 (a47c00d) stays the fleet pin until the next release is judged CLEAN. Program records live outside this repository, in the PM's private ledger (master-gate/).
Proven (with the proof names):
- Release 7.5.1 (a47c00d, tag v7.5.1, npm latest), judged CLEAN by the installed 7.5.0. That verdict rested in part on records the closer wrote and the judge did not verify: the dimensions, the isolated-clone gate and final_review (master-gate finding A4-1, A4-2, A4-16). Also, CURRENT.md at a47c00d still names 7.5.0 (finding A8-1).
- Master-gate Phase A: every review skill on the machine run read-only on main 2fb1d17 in 8 lanes, giving 239 findings (8 critical, 85 major). Synthesis and integration plan are recorded.
- S0 trust root, merged e00b19c (PR #84). The changes:
  - an externally pinned trust policy (`--trust-policy-sha256`);
  - key-bound attester identity;
  - owner-signed exceptions;
  - no bundle-chosen live path;
  - VALIDATE receipts.
  The proofs are charter/DONE/mg-s0-trust-root.md items 1–6, in src/closeout/trust-root.test.ts. MC/QA accepted after rework 1. Full ci:check PASS in the Linux container at be0f78d.
- S1 execution safety, merged 3d46c86. The changes:
  - a per-gate shim PATH;
  - a credential-free CARGO_HOME;
  - one hardened git helper;
  - an authenticated control-plane /session;
  - CLI pins replace environment pins;
  - the receipt binds the validated bytes;
  - rustup-derived toolchain locators.
  The proofs are charter/DONE/mg-s1-execution-safety.md items 1–7. MC/QA accepted after reworks 1–3. Full ci:check PASS in the container at 4e296cf.
- S1b git and environment hardening, ACCEPTED through the full charter lifecycle. The changes:
  - gate git cannot obtain a credential;
  - inherited GIT_* is scrubbed;
  - program-naming git keys are neutralised;
  - validate's remote proof refuses option-shaped names and contacts the checked URL outside any repository, which defeats chained insteadOf rewrites (cross-family MC/QA finding MCQA-D1);
  - driver enumeration fails closed;
  - the token fragment is cleared;
  - locator derivation is guarded.
  The record trail: dispatch recorded late at the DONE pin 3640278; frozen at 13ca364 (manifest 14301572…); proofs 1–7 re-run by CH/QA xiaomi/mimo-v2.6-flash; the receipt by MC/QA openai/gpt-6.1-terra (cross-family from the Claude author); `charter receipt --verify-tree` matched the freeze; `gate --accept` recorded accepted. Hosted CI verify passed on 8100826 (run 42124483760). Proof 8, the pre-merge self-judge, showed no introduced debt. Its failing gates are pre-existing on main 3d46c86: the bun importer flake and the sqlite tests in the container. CH/QA established both independently.
- Self-judge after each merge (installed 7.5.1, Linux container): e00b19c and 3d46c86 each carry 1 debt, the semantic re-attestation carried over from the baseline (2fb1d17). 0 debts were introduced by either slice.
Not proven / known gaps:
- Charter lifecycle deviation: S0 and S1 ran without `charter gate --dispatch`, `freeze`, `receipt` or `gate --accept`, and with same-family QA. S1b's dispatch was recorded late, at its DONE pin, and the slice otherwise followed the full lifecycle. mg-release-7.5.2 and every later slice run the full lifecycle from dispatch. A harness guard (~/.claude/hooks/guard-charter.sh) now refuses unaccounted code pushes to mister-clean main and every hook bypass.
- SEM-EXECUTABLE re-attestation: every new commit needs a fresh signed attestation, because the attestation binds the commit and not the surface content. Slice S4 makes attested reviews content-bound.
- Exceptions: after S0 they need an owner or principal signature under the pinned policy. The owner key in policy b65bfdbf has role independent_qa, so no exception can be signed today. That is an owner decision.
- Native gates run without an OS sandbox. Judges run only in the Linux container until slice S1c. Git network-program keys and inherited GIT_* are handled by S1b (in rework): A3-8 stays open until S1b lands.
- Slice Zero: `proven_on` is EMPTY (unchanged; charter/owner-decisions/2026-11-04-s5-slice-zero.md).
- Local full suite on this host: not a gate (charter/owner-decisions/2026-11-04-s6-evidence-is-hosted-ci.md). Under load, control-plane tests time out at vitest's 5 s default; that is recorded for slice S6.
- Carried obligations from 7.5.1 (folded into the master-gate slices; none is a judge debt on 7.5.1): O-PUBSAFE-1 (S5), O-RELEASE-CLOSURE-1 (S6), O-CAPSULE-NOTES-1, O-ATTEST-INSPECT-1, O-SUITE-LEASE-1, O-LOAD-1 (S6), O-LOCAL-CAPSULE-1, O-STD-TITLE-1, O-GATE-SNAPSHOT-1, O-TMP-1, O-PS-PROV-2/3, O-GEN-MERGE-1, O-TOOLCHAIN-2, O-STD-1..5, O-PLAN-1, O-RET-2, O-PERF-2, O-CENSUS-1, O-ABL-1, O-R18-2, O-FE1-SCHEMA, O-DATA-1, O-CI-PIN-1.
- S1b obligations (charter receipt new_defects): pushInsteadOf has no test (medium); three low test-coverage items; DONE proof 5's reopen command needs the app config; the bun importer flake in the gate snapshot (pre-existing); sqlite tests failing on main in the container (pre-existing). Owned by S1c, S5 and S6.
Exact last-green command(s):
- `charter receipt qa/mg-s1b-git-env-hardening/receipt.json --verify-tree <frozen checkout 13ca364>`: matches the recorded freeze; `charter gate mg-s1b-git-env-hardening --accept`: accepted
- hosted CI verify on 8100826 (S1b frozen 13ca364 plus its freeze record), run 42124483760: success
- self-judge `mister-clean prepare --mode CLOSE` (installed 7.5.1, container) on 3d46c86: exit 0, 1 baseline-carried debt
- charter check (pre-commit hook, charter v0.1.0) on 3d46c86: ok
Exact last-red command(s) and why:
- self-judge (installed 7.5.1, container) of the S1b candidate 8100826: 3 debts. The baseline semantic re-attestation, plus 2 native gates (ci-check sqlite tests; campaign-observer importer), both shown pre-existing on main 3d46c86 by CH/QA's independent stress runs.
Next three bounded items (in order):
1. mg-release-7.5.2: patch release of the byte-order fixes (c8b2663, 31ec5dd) on the v7.5.1 line, requested by the owner for dsgncrsh. Full lifecycle; tag; CI-verified archive; GitHub release; forward merge into main.
2. mg-pii-name-1: replace the three whole-word mentions of the owner's first name in project/planning/ (public repository) with "the owner".
3. S1c, OS sandbox, then S2 backbone (phase registry, finding model, reducer, shared primitives).
Open owner decisions:
- A principal role for the owner key, so exceptions can be signed.
- A package split of the control plane and Worker out of the CLI package.
- Slice Zero redesign scope.
