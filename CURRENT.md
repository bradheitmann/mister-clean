---
artifact_type: maintenance
maint_id: MC-CONTROL-PLANE-7.0
title: Mister Clean 7.0 control-plane candidate
status: active
timezone: America/Denver
owner: Codex Desktop primary
contract: references/control-plane-product-spec.md
current_projection_source: machine
current_projection_command: mister-clean inspect repository-object . --json
completed_steps:
  - typed Bun and SQLite control-plane contracts
  - deterministic dual-ledger debt accounting
  - dependency-aware ordering and dynamic concurrency planning
  - tuple-by-capability qualification and category-champion ranking
  - repository-local and machine-global telemetry schemas
  - exact RepositoryObject complexity measurement
  - ten-theme OKOA Svelte control plane
  - public package, CLI, MCP, and local-runtime boundaries
  - machine-local evaluation intake, invocation reconciliation, and custody-gated quality credit
  - generated-output, archive, and release-capsule negative controls
  - exact clean-capsule CI and prospective-package privacy checks
  - repository-boundary and protected-search detector controls
  - responsive browser proof across 26 configured viewports
  - operational-truth probes for projection, behavior, state lifecycle, executable-gate reachability, and identifier namespace
current_step: bind exact-object CI, independent acceptance, and GUARD dogfood receipts to PR 1 head (sprint 2026-09-22)
next_step: merge PR 1 with history preserved, tag v7.0.0, publish the receipt-bound release archive, bump the global install
closing_gate: exact-object native suite, prior-release dogfood, independent code/package/design review, OKOA validation, GUARD, and clean Git custody
---

# Mister Clean 7.0 current state

The governing product contract is
[`references/control-plane-product-spec.md`](references/control-plane-product-spec.md).
This is the designated successor-facing current-state projection. It describes
the working candidate; it does not declare that candidate clean.

## Current verdict

**NOT CLEAN — active candidate checkpoint, 2026-09-22 (acceptance in flight).**

The working lane is `fix/gate-execution-leases` at main base
`4694bfed34dcc3e77fc422c03245ce62f951ed75`, published as pull request 1.
This file does not certify the object containing it. Acceptance of the commit
that carries this text is established only by external receipts bound to that
exact commit: the `CI` workflow `ci:check` run for that commit on pull
request 1, the independent QA/acceptance verdict file named in
`project/planning/slices/done/SLICE-LE-003-QA-001.md`, and the pinned 6.3.0
GUARD dogfood bundle recorded in the sprint 2026-09-22 section below. If any
of those is missing or not PASS for this commit, the candidate is not
accepted and must not be merged. No production qualification or cryptographic
identity claim is made.

Machine-local evaluation intake is integrated and covered by focused runtime
tests. Direct CLI invocations are retained as `UNOBSERVED` receipts; runtime
reconciliation records them without fabricating a tuple, route, capability,
trial, sampling ordinal, or quality credit. A strict evaluation may bind many
such receipts to one run, while each receipt can bind to at most one run. Only
startup-configured, two-phase receipt custody can make an evaluated outcome
eligible for quality credit. This is same-OS-user local custody, not a claim of
remote principal identity or cryptographic authenticity.

The current small slice makes unlinked imported receipts inspectable through
the authenticated local query plane. It does not add a command-obligation
table, turn commands into trials, alter journal retention, or change the
10/25/50 qualification policy.

Historic repair findings remain historical. The earlier `7ffa77d637821d421f6973c8530a79731b58b67fc86860da39689befdc2ac124`
clean-CI receipt is immutable evidence for that exact object only; later bytes
do not inherit its pass. F03 is a historical partial-observation worktree
finding: its source behavior is subsumed by active reporting code and detached
worktree cleanup is paid by external
`F03_PARTIAL_OBSERVATION_WORKTREE_CLEANUP_RECEIPT_20260908.md`
(`be30d16bf2b31fb750b3f6329918e4852418e38bf0dbe240aef3d89f946c0b3e`).
Detector-fp retirement is likewise historical external evidence; neither
receipt accepts this newer candidate.

Outstanding work is semantic executable-surface proof, independent acceptance,
and verification/GUARD custody on one newly frozen object. These close through
bound executed evidence, not this document or historic focused tests.

## Git topology disposition (2026-09-21)

One Git-topology obligation is now dispositioned: `fix/detector-fp-classes`
(4efb0ee, "fix(detector): repair five empirically-proven false-positive classes
(v6.3.1)") is **SUPERSEDED** by `7500a0b` on `main` (and therefore by this
candidate). Proof, run 2026-09-21: every implementation identifier introduced by
4efb0ee (`PRIMARY_STATE_KEYS`, decisive-status projection, `archived_<type>`
resolution, `struckRow`, `GOVERNANCE_CODE_EXTENSIONS`,
`contextualizeGovernanceValidatorSources`) is present in
`src/closeout/planning.ts` at 2a8aed0 (`git grep -F <id> 2a8aed0 --
src/closeout/`), and all nine 4efb0ee test cases have equivalent tests in
`src/closeout/planning.test.ts` under reworded titles (`git log -S
PRIMARY_STATE_KEYS --oneline main` -> 7500a0b). The textual reverse-apply of
the 4efb0ee patch onto 2a8aed0 is non-empty (comments and titles were
reworded during the seam refactor), so the branch is **retained, not
deleted**, until a human confirms deletion; no worktree for it exists (the
former `../.mc-wt/detector-fp` reference was stale and is removed here).
There are no stashes. `main` remains the sole writer.

## Historical exact-object CI evidence

The retained clean-CI receipt for RepositoryObject
`7ffa77d637821d421f6973c8530a79731b58b67fc86860da39689befdc2ac124` recorded
`268` tracked-plus-nonignored entries, no source mutation, and eight matrix
commands passing. It is historical evidence, not acceptance of this current
working object. A new object requires regenerated outputs, a fresh object
capture, and its own verification receipt.

## Terminal evidence contract

This source file never self-certifies the object containing it. The external
release receipt must bind one RepositoryObject and record all of the following:

| Surface | Evidence required on the exact candidate |
|---|---|
| Bun/SQLite control plane | established only by a fresh `pnpm run ci:check` receipt bound to the named candidate; historical counts are not reusable |
| Node/native package | every discovered file and test passes with `--allowOnly=false` and serialized filesystem fixtures |
| No-harm lifecycle | ignored-debris rejection, harmful-close rejection, and successful retry all pass |
| Generated outputs | isolated regeneration matches all four tracked outputs; a real build leaves the RepositoryObject unchanged |
| Release boundary | raw USTAR, AppleDouble/PAX/link/traversal rejection, external Git capsule build, pnpm install, and attestation pass |
| Complexity | same-object measurement is reproducible; unsupported languages and generated boundaries remain explicit |
| Product surface | all seven views, ten themes, category weighting, dependency closure, and responsive layouts pass |
| Independent acceptance | contract, package, and design reviewers accept the same frozen object without source mutation |
| Self-dogfood | the pinned accepted 6.3 package runs Mister Clean against the same object and its negative controls fail as designed |
| Git/release | GUARD binds the accepted tree; branch/worktree disposition is explicit; publication follows acceptance |

Historical baseline browser evidence exercised all seven views, dependency-
closed directive selection, every requested theme, terminal-blocker progressive
disclosure, and the capability autocomplete/weighting path. It found and paid
one UI defect: selecting `Spit-shine` had filtered agent names instead of
applying a capability weight. That historical repair ranks category champions
and supports both pointer and Enter-key selection. It is not a render proof or
exact-object visual acceptance for this active candidate; fresh independent
render proof remains required. Demo mode remains visibly labeled
`DEMONSTRATION DATA — NOT A CLEANLINESS VERDICT`; live evidence absence remains
fail-closed.

## Required sequence

1. Finish and independently review the pending-invocation visibility slice;
   regenerate all affected derived surfaces and bind a fresh RepositoryObject.
2. Capture the semantic executable-surface plan, supervised observations, and
   external independent attestation required for the current object.
3. Run the complete clean-capsule matrix once for that frozen object, retaining
   its raw receipt and source pre/post identity.
4. Obtain independent frozen-object package, contract, and design review;
   then run the accepted evaluator and its negative controls against that same
   object.
5. Cross GUARD and reconcile branch/worktree custody before any commit,
   publication, or release action.

## Pinned evaluator

Dogfood uses the operator-custodied immutable accepted package named
`mister-clean-accepted-release-6.3.0`. Its machine-local location remains
outside the public repository and is supplied only to the closing run. The
package is bound to release `6.3.0`, registry integrity
`sha512-tSUQvVNg82M2kD+5DvXRfQVN5dsmB64fplpmIqIZCBk9XFCLRYHTBYaFEqV4CWpqXxpyOimaKmStokoGyK0wvA==`,
skill SHA-256 `62b9dd0cff8a5361c014d32e2b0a6f8cff034c39d9cbd9ef6f189cebe92a45ff`,
CLI SHA-256 `10a098af2ca6a3ace69af19f853c937a32d8e00547980479e3aa713bb671a60d`,
and package-manifest SHA-256
`bdc4515530c38ab746d4b5fa3a73c2d0fc671b6f80add556c3bb2c8b74339544`.
All 43 pinned package-manifest entries must rehash successfully before it is
allowed to judge the candidate. Current-candidate bytes cannot substitute for
that evaluator.

## Sprint 2026-09-21 receipts (wave 1, dev lead: Claude Fable 5.1)

These receipts bind evidence to commit `2a8aed0` (the candidate before this
documentation reconciliation). They do not change the verdict above: the
candidate remains **NOT CLEAN** pending independent exact-object QA.

### Toolchain finding

`pnpm run ci:check` requires `node:sqlite` (imported by
`src/closeout/execution-lease.ts`). Bun 1.3.9, the machine default, has no
such built-in and the gate fails before creating a capsule. `.github/workflows/
ci.yml` pins Bun 1.4.0, which provides it. Sprint runs used a pinned Bun 1.4.0
installed outside the repository; no global tool was changed. A repository-
local Bun pin is tracked as LE-002 in
[`project/planning/hygiene/MANUAL-LOOSE-ENDS-LEDGER.md`](project/planning/hygiene/MANUAL-LOOSE-ENDS-LEDGER.md).

### Clean-capsule CI on 2a8aed0

| Attempt | Environment | Result |
|---|---|---|
| 1 | Bun 1.3.9 | FAIL before capsule: `No such built-in module: node:sqlite` |
| 2 | Bun 1.4.0, pristine capsule store | FAIL in `pnpm install`: registry throughput ~150 KiB/s; undici request timeout on large native tarballs (workerd, rolldown, esbuild, typescript) |
| 3 | Bun 1.4.0, pristine store, env-based fetch tolerance | FAIL identically (pnpm ignored env settings) |
| 4 | Bun 1.4.0, `--fetch-retries` flag | FAIL: flag does not exist in pnpm 11 (`ci-check-attempt4-badflag.log`) |
| 5 | Bun 1.4.0, warm-store shim through the `pnpm` launcher (pnpm 12) | FAIL: the launcher's self-download of pnpm 11.0.3 exceeded the 10-minute supervisor timeout; supervised command exited 128 (`ci-check-attempt5-pnpm12-selfdownload-timeout.log`, 11:32:51Z–11:43:36Z) |
| 6 | Bun 1.4.0, **warm-store variant**: PATH shim execs pnpm 11.0.3 directly and gives `pnpm install` `--store-dir=<operator pnpm store v11> --fetch-timeout=900000 --network-concurrency=4`; dependency set still governed by the frozen lockfile | **PASS** — 8 matrix commands, source RepositoryObject unchanged before/after; test:node 38 files / 795 tests, test:bun 30 files / 199 tests, control-plane:check 7 files / 67 tests, package-surface 6 and public-surface 31 tests, pack/public/boundaries/generated checks green (`ci-check.log`, START 2026-09-21T11:44:33Z, END 12:00:19Z, 15 min 46 s wall clock) |

The warm-store variant deviates from the capsule doctrine that a release child
never sees ambient package-manager state. It is recorded as bounded evidence
only; the terminal receipt still requires a pristine-store `pnpm run ci:check`
on adequate bandwidth. RepositoryObject reported by attempt 6: `96cc89fccfe92075216eec04b6db93fd88621bacff03910d01cf6712271ca946`.
Logs: `/tmp/sprint-20260921/mister-clean/ci-check*.log` (machine-local, not
committed).

Independent QA re-ran the same warm-store variant on the documentation
commit `60c62b8` (`qa-ci-check.log`, START 2026-09-21T12:09:02Z, END
12:25:27Z): PASS, 8 matrix commands, identical test counts, RepositoryObject
`5bba9764bd05d4cad2c087b4ed42bab5a9221bf19a16ed413d504f3b2bb1427f`. Both
receipts are bounded warm-store evidence for their exact objects only; the
commit that records this paragraph is a new object and inherits neither pass.

A closeout review on 2026-09-21 corrected this table: the first committed
version (e5ce729) listed five attempts, omitted the pnpm-12 launcher timeout,
and cited a 12:03Z / 18-minute window that did not match the receipt.

### Pristine-store attempt 7 on 7f50acd (closeout, 2026-09-21)

The closeout ran the first genuinely pristine-store capsule: PATH shim execs
the pinned pnpm 11.0.3 binary directly (no launcher self-download) and adds
only `--fetch-timeout=900000 --network-concurrency=4` to `pnpm install`;
no `--store-dir`, so the capsule used its own empty store
(`resolved 308, reused 0, downloaded 308`). Result: **FAIL**, START
12:33:11Z, END 12:55:02Z. The install and 794 of 795 node tests passed; the
single failure is `scripts/release_path.test.mjs > release archive boundary
> runs this package's real build inside an exact external Git capsule`,
which timed out at its 120 s limit after 285 s. That test performs a second,
nested cold `pnpm install` inside its own release capsule; at this machine's
~466 KiB/s registry throughput that install alone exceeds the limit. The same
test passes in the warm-store variant and in established CI on `main`
(4694bfe, GitHub runner bandwidth). Classification: bandwidth-bound
environment failure, not a candidate defect; the pristine receipt remains
owed and is obtainable by running `pnpm run ci:check` where a cold 308-
package install completes well under 120 s, or by opening a pull request so
the `CI` workflow (which runs `pnpm run ci:check`) measures the branch.
Log: `closeout-ci-check-attempt7-pristine.log` (machine-local).

### Evaluator runs (AUDIT only, no source mutation)

| Evaluator | Target | Command | Result |
|---|---|---|---|
| accepted 6.3.0 global CLI | `main` @ 4694bfe | `mister-clean audit planning .` | PASS (artifacts=1, findings=0) |
| accepted 6.3.0 global CLI | `main` @ 4694bfe | `mister-clean audit public-safety .` | FAIL (3): untracked root handoff x2 `posix-home-path`, `THIRD_PARTY_NOTICES.md:8` `email-address` |
| accepted 6.3.0 global CLI | `main` @ 4694bfe | `mister-clean detect stack .` | exit 0 |
| 7.0 candidate (source) | itself @ 2a8aed0 | `audit planning .` | PASS (artifacts=1, findings=0) |
| 7.0 candidate (source) | itself @ 2a8aed0 | `audit repository-boundaries .` | PASS (parsers=70, findings=0) |
| 7.0 candidate (source) | itself @ 2a8aed0 | `audit public-safety .` | PASS |
| 7.0 candidate (source) | itself @ 2a8aed0 | `detect stack .` | exit 0 |
| accepted 6.3.0 global CLI | this branch @ 60c62b8 | `audit planning .` | PASS (artifacts=4, structured=4, findings=0) |
| accepted 6.3.0 global CLI | this branch @ 60c62b8 | `audit public-safety .` | FAIL (1): `THIRD_PARTY_NOTICES.md:8` `email-address` only; both `posix-home-path` findings discharged |
| 7.0 candidate (source) | itself @ 60c62b8 | `audit planning .` / `audit repository-boundaries .` / `audit public-safety .` | PASS / PASS (parsers=70) / PASS |

The 6.3.0 `email-address` finding on `THIRD_PARTY_NOTICES.md` is pre-existing
and is accepted by the 7.0 denylist policy; it is not repaired here. The two
6.3.0 `posix-home-path` findings are discharged by the handoff adoption below.

### Handoff adoption and planning root

`HANDOFF-2026-09-08-PM.md` (untracked at the repository root since 2026-09-08)
is adopted at
[`project/planning/handoffs/HANDOFF-2026-09-08-PM.md`](project/planning/handoffs/HANDOFF-2026-09-08-PM.md)
with a `reference` classification header and a marked redaction of two
operator home paths. `project/planning` is auto-discovered as a planning root
by both evaluators; every file placed there carries `artifact_type: reference`
plus a classification rationale, verified with `audit planning` under both
6.3.0 and 7.0 before commit (a frontmatter-less copy reports
`planning_input_unparsed`). The root copy is left in place on `main` until
this branch is reviewed; it is not deleted.

## Sprint 2026-09-22 (dev lead: Claude Fable 5.1) — acceptance and ship lane

Scope: accept and ship 7.0 from this branch through pull request 1
(`fix/gate-execution-leases` -> `main`, history preserved). Nothing in this
section is a verdict on the commit that contains it; each row names the
external receipt that binds the exact object.

### LE-003 repaired on this branch

`SLICE-LE-003-DEV-001` / `SLICE-LE-003-QA-001` under
`project/planning/slices/done/`. One-condition change in
`src/closeout/repository.ts` (`discoverPlanningRoots()` promotes only regular
files to exact-file planning roots), regression test in
`src/closeout/repository.test.ts`, regenerated `bin/mister-clean.js` and
`MANIFEST.sha256`. Fixture reproduction before/after, focused tests (3 files /
165 tests), and `build:raw` receipts are machine-local under
`/tmp/sprint-20260922/mister-clean/`. Ledger LE-003 is closed; LE-001 and
LE-002 remain open.

### Pinned evaluator custody check (2026-09-22)

All 43 `MANIFEST.sha256` entries of `mister-clean-accepted-release-6.3.0`
rehashed OK; `SKILL.md`, `bin/mister-clean.js`, and `MANIFEST.sha256` SHA-256
match the pins above (`evaluator-rehash.log`). The evaluator is therefore
allowed to judge this candidate.

### Evaluator AUDIT runs on this working tree (pre-commit, bounded)

| Evaluator | Command | Result |
|---|---|---|
| pinned 6.3.0 (custodied package, not the global install) | `audit planning .` | PASS artifacts=4 structured=4 findings=0 |
| pinned 6.3.0 | `audit public-safety .` | FAIL (1): `THIRD_PARTY_NOTICES.md:8 email-address` (pre-existing, accepted by the 7.0 denylist policy) |
| 7.0 candidate (source) | `audit planning .` / `audit public-safety .` / `audit repository-boundaries .` | PASS / PASS / PASS (parsers=70) |

These runs preceded the planning-pair and current-state edits; the QA seat
re-runs `audit planning` on the frozen tree.

### Receipts owed by the exact commit (recorded outside this file)

| Receipt | Where | Binding |
|---|---|---|
| Pristine-store `pnpm run ci:check` | `CI` workflow run for the PR 1 head commit (GitHub) ; polled log `ci-check-<sha>.log` | commit SHA |
| Independent QA + exact-object acceptance (contract, package, design review; LE-003 QA) | `/tmp/sprint-20260922/mister-clean/qa-verdict-le003-and-acceptance.md` | `git write-tree` SHA; commit must satisfy `commit^{tree}` = that tree |
| GUARD dogfood by the pinned 6.3.0 evaluator (`prepare --mode GUARD`, read-only) plus `validate bundle --structural` | `/tmp/sprint-20260922/mister-clean/guard-630/` | RepositoryObject of the frozen tree |
| Accepted-evaluator negative controls | same directory, `guard-630-negative-controls.log` | fixture objects, must FAIL as designed |

GUARD scope decision: the live schema-1.3 `closeout_guard` crossed/executed
boundary requires an operator-authored external `guard-precommit-authority`
record (four-role receipts, commit-barrier chronology, precommit authority)
for which this repository ships validators but no producer. This sprint runs
the read-only pinned-evaluator GUARD dogfood and structural bundle validation
on the frozen object and records that as bounded GUARD evidence; it does not
claim a crossed live GUARD boundary. The pull-request merge is the ref
advance, executed only after the CI, QA, and dogfood receipts above are PASS
for the same commit.
