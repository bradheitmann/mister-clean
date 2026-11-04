# State — mister-clean — 2026-11-04T22:30Z (from `date -u`), written by the project PM (Claude Code) at the 7.5.0 release
HEAD: 7080cdedf03122a2ca59a6b1caa2ed3d4669d6ef (main before this bump) — the object every claim below was verified on; successors compare before trusting a line
Proven (with the proof names):
- Judge census of main with the installed 7.4.0 (frozen clone, 2026-11-04): planning, github-actions, repository-boundaries and public-safety PASS; semantic debt went 3 → 1 today: SEM-STATE-8CF757A62803 and SEM-STATE-C6FB0796C5F5 retired by #73 (sealed segments); SEM-EXECUTABLE-CBB67799E249 is paid by an independent signed attestation on the release commit.
- SEM-EXECUTABLE attestation pipeline (frozen 24954d2): plan by the 7.4.0 judge, raw observations, independent judgment and Ed25519 signature by MC/QA with the Doppler-held key, `semantic verify` → attested_satisfied; one-character binding mutant → verification_debt. Evidence private; runbook kept with it.
- Merged today, each with DONE list first, mutants RED, second- or third-family QA on the exact tip and hosted CI green: #64 retirement rulings in bundles, #65 bounded intake, #66 language-policy audit, #68 customer-test pin, #69 retirement authority (red-team finding from PM-ODIN), #70 INTENT and COMMON-STANDARD ratified, #71 attestation trust in Doppler, #72 odin key incident record, #67 release scripts to strict TS, #73 sealed segments, #74 language-policy root debts, #75 attestation signer, #76 executable-surface native routes.
- Release 7.4.0 (a1f39ebb, tag v7.4.0, verified archive on the GitHub release).
- Field-evals: the 2026-10-31 window; RC-001, RC-002 (see reports).
- Charter: pinned binary b9323cd locally; SPEC unchanged.
Not proven / known gaps:
- Slice Zero: `proven_on` is EMPTY. The owner-authorized final repair was rejected by MC/QA (charter/owner-decisions/2026-11-04-s5-slice-zero.md); redesign with the owner, starting from a written threat model of every field an adversary can flip. Work preserved at tag archive/feat/slice-zero-eval-case.
- Local full suite on this host: not a gate (charter/owner-decisions/2026-11-04-s6-evidence-is-hosted-ci.md). Three capsule tests fail locally because the host's pnpm 12 downloads pnpm 11.0.3 into each fresh capsule at the network's current speed (O-LOCAL-CAPSULE-1).
- Obligations for 7.6.0 (none is a judge debt on 7.5.0):
  - O-PUBSAFE-1: public-safety credential rules from PM-ODIN (secret/token assignment with the dotted-identifier exemption, bearer token, URI credential); odin replays its four probe lines.
  - O-RELEASE-CLOSURE-1: `deploy`, `pack:check`, `prepack` are reached by no workflow step.
  - O-CAPSULE-NOTES-1: 26 static script notes remain behind the opaque `ci:check` capsule (the detector does not read the capsule's internal matrix).
  - O-ATTEST-INSPECT-1: package `attest-inspect` with a test proving no secret byte reaches its output.
  - O-SUITE-LEASE-1 (full suites refuse to overlap), O-LOAD-1 (timing tests report contention), O-LOCAL-CAPSULE-1.
  - O-STD-TITLE-1: COMMON-STANDARD title at its next substantive revision.
  - Carried: O-GATE-SNAPSHOT-1, O-TMP-1, O-PS-PROV-2/3, O-GEN-MERGE-1, O-TOOLCHAIN-2, O-STD-1..5, O-PLAN-1, O-RET-2, O-PERF-2, O-CENSUS-1, O-ABL-1, O-R18-2, O-FE1-SCHEMA, O-DATA-1, O-CI-PIN-1.
Exact last-green command(s):
- hosted CI verify, dependency-audit and charter on the exact tips of #67, #69–#76 and on main 7080cde: success
- `node ~/.claude/skills/mister-clean/bin/mister-clean.js audit {planning,github-actions,repository-boundaries} . --json` on 7080cde: pass
- charter check --strict (charter b9323cd) on this candidate: ok
Exact last-red command(s) and why:
- MC/QA final Slice Zero QA on 8e80c3c0: REJECTED (strict validation accepts a subject-role/outcome flip and an invalid second publisher citation).
- local `pnpm run test:node` under host load 50–130: timing failures (indeterminate under load; not a gate).
Next three bounded items (in order):
1. Land 7.5.0: merge this bump on hosted green, re-attest SEM-EXECUTABLE on the merged commit, judge it CLEAN with the installed 7.4.0, annotated tag v7.5.0 on that exact commit, verify the CI archive, install, attest.
2. 7.6.0 batch: O-PUBSAFE-1 first (odin is waiting), then O-RELEASE-CLOSURE-1, O-ATTEST-INSPECT-1, O-SUITE-LEASE-1, O-LOAD-1, O-LOCAL-CAPSULE-1.
3. Slice Zero redesign session with the owner; then the field study across the other repositories.
Open owner decisions:
- Slice Zero redesign scope.
