# State — mister-clean — 2026-11-05T19:20Z (from `date -u`), written by the project PM (Claude Code) during the master-gate program
HEAD: 3d46c8638311fb37e9a40df63b134106a28c5cd4 (main, after master-gate S1, before this STATE refresh). Every claim below was verified on this object; successors compare before trusting a line.
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
- Self-judge after each merge (installed 7.5.1, Linux container): e00b19c and 3d46c86 each carry 1 debt, the semantic re-attestation carried over from the baseline (2fb1d17). 0 debts were introduced by either slice.
Not proven / known gaps:
- Charter lifecycle deviation (S0, S1 and the S1b now in rework): each DONE list was committed before dispatch and never changed, but `charter gate --dispatch`, `charter freeze`, `charter receipt` and `charter gate --accept` were NOT run, so no proof carries `reopened:` markers. Both MC/DEV and MC/QA ran on the same model family, so the receipts would also fail charter's cross-family rule. The dispatch pins cannot be backdated. Evidence for each slice (DONE commit, QA reports, container runs, merge commit) is in the PM ledger. From S1c onward, every slice runs the full lifecycle with a cross-family QA seat.
- SEM-EXECUTABLE re-attestation: every new commit needs a fresh signed attestation, because the attestation binds the commit and not the surface content. Slice S4 makes attested reviews content-bound.
- Exceptions: after S0 they need an owner or principal signature under the pinned policy. The owner key in policy b65bfdbf has role independent_qa, so no exception can be signed today. That is an owner decision.
- Native gates run without an OS sandbox. Judges run only in the Linux container until slice S1c. Git network-program keys and inherited GIT_* are handled by S1b (in rework): A3-8 stays open until S1b lands.
- Slice Zero: `proven_on` is EMPTY (unchanged; charter/owner-decisions/2026-11-04-s5-slice-zero.md).
- Local full suite on this host: not a gate (charter/owner-decisions/2026-11-04-s6-evidence-is-hosted-ci.md). Under load, control-plane tests time out at vitest's 5 s default; that is recorded for slice S6.
- Carried obligations from 7.5.1 (folded into the master-gate slices; none is a judge debt on 7.5.1): O-PUBSAFE-1 (S5), O-RELEASE-CLOSURE-1 (S6), O-CAPSULE-NOTES-1, O-ATTEST-INSPECT-1, O-SUITE-LEASE-1, O-LOAD-1 (S6), O-LOCAL-CAPSULE-1, O-STD-TITLE-1, O-GATE-SNAPSHOT-1, O-TMP-1, O-PS-PROV-2/3, O-GEN-MERGE-1, O-TOOLCHAIN-2, O-STD-1..5, O-PLAN-1, O-RET-2, O-PERF-2, O-CENSUS-1, O-ABL-1, O-R18-2, O-FE1-SCHEMA, O-DATA-1, O-CI-PIN-1.
Exact last-green command(s):
- `pnpm run ci:check` in the Linux judge container (mister-clean-judge:7.5.0d) on 4e296cf: `clean ci: PASS (8 matrix commands)`
- hosted CI verify on PR #85 (S1b, e4d5e46): success
- self-judge `mister-clean prepare --mode CLOSE` (installed 7.5.1, container) on 3d46c86: exit 0, 1 baseline-carried debt
- charter check (pre-commit hook, charter v0.1.0) on 3d46c86: ok
Exact last-red command(s) and why:
- MC/QA review of S1b at e4d5e46: REJECTED. D1 (critical): a bundle-controlled remote name reaches `git ls-remote` argv unseparated. D2: `core.gitProxy` is not neutralised (false green). Rework in progress.
- the container ci:check on S1b e4d5e46 (my runs 1 and 2): load timeouts at the 5 s default. Hosted CI on the same commit passed.
Next three bounded items (in order):
1. S1b: land its rework (D1 option injection, D2 gitProxy plus multi-valued keys), with QA re-check, hosted CI, local merge and self-judge.
2. S1c, OS sandbox: write the DONE list, then run the full charter lifecycle (dispatch, freeze, receipt, accept) with a cross-family QA seat.
3. S2, backbone: one phase registry, finding model and reducer, plus shared primitives. This is the base every absorbed review skill plugs into.
Open owner decisions:
- A principal role for the owner key, so exceptions can be signed.
- A package split of the control plane and Worker out of the CLI package.
- Slice Zero redesign scope.
