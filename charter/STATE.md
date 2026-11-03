# State — mister-clean — 2026-11-03T11:48Z (from `date -u`), written by the project PM (Claude Code) at the 7.4.0 release
HEAD: 9d7b6c822a4293ab3f88db8b7aaba5849c7c14aa (main before this bump) — the object every claim below was verified on; successors compare before trusting a line.
Proven (with the proof names):
- Nothing under this charter's Slice Zero yet; proven_on is empty.
- Dependency advisories cleared, native-gate spawn fix (60e748d), hermetic test fixtures (5b83a44) and discovery-and-retirement (c5a85c9): each independently verified on its exact tip, as recorded in earlier states.
- Large-repository audits (5f98f84; verified by MC/QA on 0b0d5f15): bounded Git child output with a typed `git_output_too_large` refusal; stack markers in subdirectories (`detect stack --json`); an unreleased source checkout named as such; `audit planning` deadline with a typed partial result.
- Planning-audit out-of-memory fix (c8e388c; a Claude reviewer REJECTED the first freeze and ACCEPTED a3253787): no walk descends into a nested checkout; 15.8 GB (OOM) → 2.0 GB on a 14,600-file workspace.
- Two customer defects (77a0b7a4; MC/DEV REJECTED 218898be, ACCEPTED 77a0b7a4; merged 4bddae5, hosted CI green): `prepare` lists tracked paths through the bounded Git listing (regression test over 1 MiB of paths); repository planning config `.mister-clean/planning.json` (`mister-clean.planning-config/1`; typed `planning_config_invalid`; honored identically by `audit planning`, `prepare`, bundle validator). On the 14,600-file workspace with a config: findings 29,137 → 633, output 401 MB → 5.8 MB, 712 s → 15 s.
- **Release 7.2.0** (main e1f0090; annotated tag v7.2.0, tag object fedafb02; CI tag run 41579332552 green; archive bradheitmann-mister-clean-7.2.0.tgz sha256 8fceda2aceead917e2f27127cf96752896e8b9368578c9b1c26757f755193824 with receipt on the GitHub release; installed at the maintainer's `~/.claude/skills/mister-clean`, `attest --strict` pass, 7.0.2 preserved). First installable release since 7.0.2. The first bump commit dcd368e failed CI's capsule check and was fixed forward at 9cac717 (see O-TOOLCHAIN-1).
- **7.3.0 lane: run receipts and the second pass** (feat/run-receipts-second-pass; charter/DONE/run-receipts.md, 8 proofs, 19 tests): `mister-clean.run-receipt/1` under `<state>/mister-clean/receipts/` (0600; a root inside the audited repository is a typed refusal, exit 2; repo-relative paths and digests only; privacy refusal on matched public-safety values); stable fingerprints `sha256(family\0rule\0path\0anchor.kind\0content_sha256)` with legacy fingerprints preserved; `second-pass` classifies cleared / persisting / persisting_rewritten / persisting_unseen (MISS) / introduced / unresolvable_earlier_bytes / flaky through Git, never guessed. QA by MC/DEV (second family): REJECTED e7fed741 (MANIFEST), ACCEPTED e9bceb1 2026-11-03T04:49:34Z (4 mutants RED, privacy sweep clean, probes ok); hosted CI then failed e9bceb1 on the SKILL.md budget; rework 2 at 2f95687 (SKILL.md trimmed with no doctrine change; 19,975 bytes), hosted CI green, MC/DEV re-check: ACCEPTED 2f956879 at 2026-11-03T06:32:44Z (checks a, b, d green; local full suite 15 red classified to known environment classes with hosted CI 882/882 as the arbiter).
- **Release 7.3.0** (fca67edf, tag v7.3.0, CI tag run 41592441023, archive sha256 b97250c7605fdea4c3c213334a3ac87165dbdb33160299730a73df0bc1257ff9; installed, attest pass).
- **Self-clean cycle 1 fixes** (each: DONE list first, mutants RED, MC/DEV ACCEPTED on the exact tip, hosted CI green): PR #49 CURRENT.md 7.3.0 + STATE HEAD line + README archive-only files (9e0af3c2); PR #50 public-safety finding provenance (6d63f86e; O-PS-PROV-1); PR #51 `.bun-version` pin + typed TOOLCHAIN MISMATCH in `manifest --package` (4cc87d4a; O-TOOLCHAIN-1; live control: bun 1.3.9 and 1.4.3 refused); PR #52 native-gate snapshot carries `info/exclude` (97f7708a; O-GATE-SNAPSHOT-2: every gate had been refused on repositories with harness-written local excludes); PR #53 a subject change outranks early gate failure reasons (44ad3488; O-GATE-EVIDENCE-1: prepare had rejected its own evidence); PR #54 second-pass flaky history per family (22a63b1d; O-SP-FLAKY-1: cleared findings had been stamped flaky).
- 7.4.0 candidate (this branch): version 7.4.0; MANIFEST from two byte-identical clean `build:raw` runs under bun 1.4.0 (dist/public.js ed0b1f53…, dist/stdio.js 1c06f7a4…, bin bfd104b5…, MANIFEST 71dbf20e…); `manifest:package:check` PASS. The release proof is the CI tag run's verified archive, never this checkout.
- Field-evals: the 2026-10-31 window; RC-001 (flash false rejects 4/36 vs v4-pro 3/115, p = 0.056; defect sufficient 10/36 vs 68/113, p = 0.0006); RC-002 (implicit-constant omission; 11/14 vs 5/30, p = 0.00013; k=3 probe directional); all bound to model-registry export 2026.11.03-1 (PR #44); customer-test mutants RED.
- `ablations/view-ab.ts` (`ablation-replay/1`, 634038e): self-test plus a fail-without mutant (RED).
- Charter: pinned binary b9323cd locally; SPEC 56f03db2 unchanged since 7b12eea.
- Self-clean baseline (read-only, judge = installed 7.2.0, subject main e1f0090): `audit planning`, `audit github-actions`, `audit repository-boundaries` each 0 findings. The loop's first pass must therefore be the full CLOSE procedure, not the bounded audits.
Not proven / known gaps:
- INTENT and COMMON-STANDARD v0.2 await owner ratification.
- `prepare` end to end on the 14,850-file / 576 MB workspace with the installed 7.2.0: the listing and audit phases complete in ~2 min (the DEFECT 1 scope); native-gate execution then materializes one full snapshot checkout per discovered gate (9 Cargo projects), and under host load 9–11 each checkout exceeded the 300 s no-progress limit (typed NativeGateGitTimeoutError, fails closed; a plain `git worktree add --detach` of the same tree took 694 s at the time). The run ended in a correct refusal (`subject repository changed`) caused by the PM's own worktree test inside the clone. A quiet-slot rerun with nothing else touching the clone is owed before "prepare on the large workspace" is called proven.
- Local full suite on this host: NOT VERIFIED (capsule commits refused by the host-global language guard; socket and process-kill tests fail in the operator shell). Hosted CI is the full-suite verdict. Under bun 1.4.0, `build:raw` completes on this host.
- **CI pins charter 7b12eea while local is b9323cd.** The CI bump and `bun ablations/view-ab.ts --self-test` wiring need a workflow edit the host's security hook blocked; not routed around.
- **Model-registry joins:** 9 field-window cards name `none` because the export has no card for them.
- Obligations:
  - O-TOOLCHAIN-2: a malformed `.bun-version` exits 2 with a generic ERROR line, not the typed TOOLCHAIN MISMATCH format (MC/DEV note on 4cc87d4a). CI still reads a literal `bun-version`; switching it to `bun-version-file` is a workflow edit (owner batch); a test keeps the two equal meanwhile.
  - O-GATE-SNAPSHOT-1: one snapshot per run reused across native gates (or a sparse checkout of the gate root), and a progress-aware timeout that counts checked-out entries as progress.
  - O-GATE-SCOPE-1: A/EXEC-PM ruled 2026-11-03 that planning excludes of kind evidence/archive prune native-gate discovery, visibly; lane feat/gate-discovery-planning-excludes implementing it (next release).
  - O-GATE-SNAPSHOT-1 detail: the snapshot copies ignored content (node_modules, dist, target); 150 s on this repository, timeouts on the 576 MB workspace.
  - O-TEST-TMP-1: the native-gates "makes no progress" test scans the shared tmpdir for leftover snapshot dirs and flakes when other suites run; tests should own their TMPDIR.
  - O-GEN-MERGE-1: every lane commits regenerated bin + MANIFEST, so each merge to main forces every open lane through a conflict and a double rebuild.
  - O-PS-PROV-2 (nested checkouts label as untracked), O-PS-PROV-3 (macOS Unicode normalisation of file names).
  - O-SLICE-ZERO-1: lane feat/slice-zero-eval-case: validator + CS-001.eval.json; evidence owner supplied the verifier pin and base commits as external citations; proven_on only from a real validator exit 0.
  - Semantic ×4 (`runtime_attested`: executable surface; invocation journal, evaluation intake, run-receipt store bounds): need the external Ed25519 attestation route; carried as verification_debt.
  - O-TMP-1: the product left 14 temp dirs (`mister-clean-bundle-*`, `mister-clean-native-gate-snapshot-*`) and the tests 77 fixture dirs in `$TMPDIR` over four days; remove temp roots in exit handlers and list unremovable ones in the receipt; tests tear down in `finally`.
  - O-QA-BRIEF-1: lane QA briefs require the full suite under the pinned toolchain (applied in briefs since 2026-11-03), and lanes merge origin/main before freeze (a conflicting PR runs no CI at all).
  - O-STD-1..5, O-PLAN-1, O-RET-2; O-PERF-2 (narrowed: heuristic path still ~401 MB); O-CENSUS-1; O-ABL-1; O-R18-2; O-FE1-SCHEMA; O-DATA-1 (data product; starter set per charter/owner-decisions/2026-11-03-starter-eval-set.md).
Exact last-green command(s):
- hosted CI verify, dependency-audit and charter on the exact tips of PRs #49–#54 and on main 9d7b6c8: success
- native-gate snapshot probe (strict TS, outside the repository) on the primary checkout: base 56c00cc FAILED "does not reproduce", candidate 97f7708 OK (150 s)
- charter check --strict (charter b9323cd), exit 0, on this candidate
- MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun src/cli.ts manifest . --package --check: PASS (82 entries) after two byte-identical clean `build:raw` runs under bun 1.4.0
- hosted CI verify, dependency-audit and charter on 2f95687 (PR #47) and on main e1f0090: success; CI tag run 41579332552 (v7.2.0): success
- node ~/.claude/skills/mister-clean/bin/mister-clean.js attest ~/.claude/skills/mister-clean --json --strict: pass (7.2.0)
- bun scripts/verify_public_package.ts . --denylist-file config/public-package-identifiers.txt: PASS (83 files)
Exact last-red command(s) and why:
- hosted CI verify on dcd368e: `clean ci: FAIL (build:raw changed the candidate RepositoryObject)` — MANIFEST from a bun 1.3.9 build; fixed at 9cac717.
- hosted CI verify on e9bceb1: `src/skill-contract.test.ts` SKILL.md 20,289 > 20,000 bytes; fixed at 2f95687.
- installed 7.2.0 `prepare` on the large clone: exit 2 after 2661 s, `subject repository changed while native-gate isolation was being proven` (PM interference; see above).
- local `bun run test` at 1ba6d13: `build:verified` stops at its capsule commit (host-global language guard). Environment.
Next three bounded items (in order):
1. Land 7.4.0: merge this bump on hosted green, annotated tag v7.4.0, verify the CI archive, GitHub release, install, attest; then the official cycle-1 second pass with the installed 7.4.0 against the cycle-1 first-pass receipts, and a fresh full first pass for cycle 2 on a frozen clone (prepare with gates).
2. Cycle 2: land gate-scope (O-GATE-SCOPE-1) and Slice Zero (O-SLICE-ZERO-1); fix O-GATE-SNAPSHOT-1 (snapshot copies ignored trees), O-TMP-1 / O-TEST-TMP-1, and design the semantic attestation route; release; heat-1 review (/deadlock-breaker, /code-red) after cycle 3.
3. Quiet-slot prepare on the large workspace with 7.4.0+, then the field study across the other repositories.
Housekeeping (2026-11-03):
- Branches on origin: `main`, the two early field-observation branches (PR #8, #9), and live lanes only; every merged or superseded branch has an `archive/*` tag (including archive/run-receipts-rejected-e7fed741). The 7.3.0 lane branch was once pushed as a forced update after a rebase (lease on e7fed741); the PM recorded it as a rule breach to avoid (merge main into a pushed lane instead).
- The PM's local private data lives in two roots plus a tool cache; nothing private is in this repository. Owner decision 2026-11-03: the release ships a synthetic, derived starter eval set.

Open owner decisions:
- Ratify INTENT and COMMON-STANDARD v0.2.
- Capsule hook disabling for the clean-CI and generated-candidate capsules.
- Allow the CI workflow edit (charter pin bump and comparator self-test).
- Deletion of four retired agent worktrees that still hold untracked files (contents preserved externally with verified hashes), and of listed scratch files.
