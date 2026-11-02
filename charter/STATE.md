# State — mister-clean — 2026-11-02T23:39Z (from `date -u`), written by the project PM (Claude Code, Opus 5.5) at the owner's wind-down
Proven (with the proof names):
- Nothing under this charter's Slice Zero yet; proven_on is empty.
- Dependency advisories cleared, native-gate spawn fix (60e748d), hermetic test fixtures (5b83a44) and discovery-and-retirement (c5a85c9): each independently verified on its exact tip, as recorded in earlier states.
- Large-repository audits (5f98f84; verified by MC/QA on 0b0d5f15):
  - Git child output is bounded, with a typed `git_output_too_large` refusal;
  - stack markers are found in subdirectories (`detect stack --json`);
  - an unreleased source checkout is named as such;
  - `audit planning` has a deadline that prints a typed partial result.
- Planning-audit out-of-memory fix (c8e388c; a Claude reviewer REJECTED the first freeze and ACCEPTED a3253787):
  - no planning, bundle or analysis walk descends into a nested checkout (a directory holding `.git`);
  - on a 14,600-file workspace, in-process peak memory went from 15.8 GB (OOM, exit 134) to 2.0 GB, and the audit now completes.
- Field-evals:
  - the 2026-10-31 window;
  - reviewer-control card RC-001 with per-replay evidence and defect attribution (3d5280e). Flash is the stricter reviewer: false rejects 4/36 vs v4-pro 3/115 (p = 0.056), and the planted defect is sufficient in 10/36 vs 68/113 (p = 0.0006).
  - RC-001 is bound to model-registry card ids (this change).
- Generic view-ablation A/B comparator, `ablations/view-ab.ts` (`ablation-replay/1`, 634038e): self-test plus a fail-without mutant (observed RED). The project consumed it in its round-18 ablation.
- Charter: pinned binary b9323cd locally (hooks reinstalled); SPEC 56f03db2 unchanged since 7b12eea.
Not proven / known gaps:
- INTENT and COMMON-STANDARD v0.2 await owner ratification.
- The 7.1.0 candidate (all fixes above) is not released; the installed judge is still 7.0.2. Consumers (for example the governance repo's odin) see the fixes only after the release lane (Lane 4: classify the version, full acceptance, stop before publish). Not started.
- Local full suite on this host: NOT VERIFIED. Hosted CI is the full-suite verdict. Two environment classes:
  - capsule commits refused by the host-global language guard (owner decision pending);
  - socket and process-kill tests failing in the operator agent's shell.
- The formal Mister Clean prepare/closure bundle is not produced (it needs a local full suite).
- **CI pins charter 7b12eea while local is b9323cd.** The CI bump, and wiring `bun ablations/view-ab.ts --self-test` into CI, both need a workflow edit. The host's security-guidance hook blocked that edit (its warning is about untrusted event input, which neither change uses), and it was deliberately not routed around.
- **Model-registry joins:**
  - all 15 field-window agent cards and RC-001 now name registry card ids (export 2026.11.02-3), or `none` where the export has no card (9 cards: nemotron-3.5-super, step-5-preview, inkling, mimo-v2.6-pro, nemotron-3-ultra, muse-wonder);
  - the customer test is re-pinned to the current export 2026.11.02-3 (fixture vendored with the publisher's clearance; both mutants observed RED);
  - the registry will retire card deepseek-v4-flash for deepseek-v4.1-flash on route.deepseek.deepseek-flash (its lane flash-identity-1, expected export 2026.11.03-1). The three flash cards and RC-001 are re-bound then.
- Obligations:
  - O-STD-1..5, O-PLAN-1, O-RET-2 (self-ratification gap; interim rule: commit the owner's ruling before the retirement record);
  - O-PERF-2 (`audit planning` emits about 401 MB of JSON on a large workspace; peak RSS 6.35 GB);
  - O-CENSUS-1 (`src/census.ts` walk has no nested-checkout check);
  - O-ABL-1 (the CI wiring above);
  - O-RC-002 (instruction-polarity card, waiting on the evidence owner's second-family check);
  - O-R18-2 (a by-reference false-fail check, waiting for a P05 reconciler item that passes inline).
Exact last-green command(s):
- charter check --strict (charter b9323cd), exit 0
- mister-clean (installed release 7.0.2) audit github-actions: pass, 0 findings
- bun scripts/verify_public_package.ts . --denylist-file config/public-package-identifiers.txt: PASS
- bun ablations/view-ab.ts --self-test: ok
- hosted CI verify, dependency-audit and charter on main 634038e: success
Exact last-red command(s) and why:
- local `bun run test` at 1ba6d13: `build:verified` stops at its capsule commit (host-global language guard). Environment; red identically at base.
- local test:node / test:bun at 1ba6d13: 14 and 9 failures in the environment classes above.
Next three bounded items (in order):
1. Lane 4: the 7.1.0 release candidate. Classify the version, run full acceptance on a host without the guard (or after the owner's capsule decision), stop before publish.
2. Model-registry joins: re-bind the flash cards and RC-001 to deepseek-v4.1-flash when export 2026.11.03-1 lands; re-bind `none` cards when the registry adds them; re-pin the customer test each focus window.
3. O-PERF-2 (bounded/summary planning output) and O-CENSUS-1.
Open owner decisions:
- Ratify INTENT and COMMON-STANDARD v0.2.
- Capsule hook disabling for the clean-CI and generated-candidate capsules.
- Allow the CI workflow edit (charter pin bump and comparator self-test).
- Deletion of four retired agent worktrees that still hold untracked files (contents preserved externally with verified hashes), and of listed scratch files.
