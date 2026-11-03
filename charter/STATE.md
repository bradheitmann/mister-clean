# State — mister-clean — 2026-11-03T04:17Z (from `date -u`), written by the project PM (Claude Code) at the 7.2.0 release
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
- Two customer defects (77a0b7a4; MC/DEV, a second model family, REJECTED 218898be and ACCEPTED 77a0b7a4; merged as 4bddae5 with hosted CI green on the exact tip):
  - `prepare` on a large repository: `trackedShippablePaths` goes through the bounded Git listing; a regression test lists more than 1 MiB of tracked paths through an index-only fixture;
  - repository planning config `.mister-clean/planning.json` (`mister-clean.planning-config/1`; `roots`, `exclude`); invalid config is a typed `planning_config_invalid` refusal; honored identically by `audit planning`, `prepare` and the bundle validator; on the 14,600-file workspace with a config: findings 29,137 → 633, output 401 MB → 5.8 MB, 712 s → 15 s.
- Field-evals:
  - the 2026-10-31 window;
  - reviewer-control card RC-001 with per-replay evidence and defect attribution (3d5280e). Flash is the stricter reviewer: false rejects 4/36 vs v4-pro 3/115 (p = 0.056), and the planted defect is sufficient in 10/36 vs 68/113 (p = 0.0006);
  - instruction-polarity card RC-002 (implicit-constant omission; v4-pro 11/14 vs flash 5/30, p = 0.00013; the k=3 probe is directional only);
  - every card and the customer test are bound to model-registry export 2026.11.03-1 (PR #44, e542257); both customer-test mutants observed RED.
- Generic view-ablation A/B comparator, `ablations/view-ab.ts` (`ablation-replay/1`, 634038e): self-test plus a fail-without mutant (observed RED). The project consumed it in its round-18 ablation.
- Charter: pinned binary b9323cd locally (hooks reinstalled); SPEC 56f03db2 unchanged since 7b12eea.
- 7.2.0 candidate (this branch, on main 4bddae5): version 7.2.0 in package.json and SKILL.md; MANIFEST.sha256 regenerated from two byte-identical clean `build:raw` runs under bun 1.4.0, the version CI pins (dist/public.js fbcd5577…, dist/stdio.js adbb6e1e…, bin 5072720b…); `manifest:package:check` PASS (82 entries); `charter check --strict` ok; prospective-package public-safety PASS (83 files). The release proof is the CI tag run's verified archive, never this checkout.
- Packaged bytes depend on the bun version (found when the first bump commit dcd368e failed CI's capsule check): under bun 1.3.9 the same tree bundles to dist/public.js 4acf097e… / dist/stdio.js 94cd6f13…, under 1.4.0 to fbcd5577… / adbb6e1e…; `build:scorecard` output differs likewise. Only a bun 1.4.0 build reproduces CI. This also explains the two MANIFEST disagreements between lanes and QA on 2026-11-03.
Not proven / known gaps:
- INTENT and COMMON-STANDARD v0.2 await owner ratification.
- Release state: v7.1.0 was published 2026-10-19 (49fc8207) as a source release whose lightweight tag never triggered CI, so it has no verified archive and consumers still run 7.0.2. 7.2.0 is every fix merged since v7.1.0 plus the two defect fixes above, released with an annotated tag pushed from git so that CI builds the verified archive. The field-study version is 7.3.0 (run receipts, second pass): its lane was frozen at e7fed741 and REJECTED by MC/DEV on one defect (MANIFEST carried the previous lane's dist hashes; all 19 proofs, 4 mutants and the privacy sweep were green); rework is a rebase onto 4bddae5 and a regenerated MANIFEST.
- Local full suite on this host: NOT VERIFIED. Hosted CI is the full-suite verdict. Two environment classes:
  - capsule commits refused by the host-global language guard (owner decision pending);
  - socket and process-kill tests failing in the operator agent's shell.
- The repository pins bun only in the CI workflow (1.4.0); the host's default bun is 1.3.9 and Homebrew's is 1.4.3, so a lane or QA seat that builds with the PATH default produces a MANIFEST CI rejects. New obligation O-TOOLCHAIN-1: pin the bun version in the repository (a `.bun-version` or `packageManager`-style pin that CI reads) and make the manifest and determinism gates record and refuse a mismatched toolchain. Until then: build with bun 1.4.0 (a private install under `$TMPDIR/bun140` was used here).
- The formal Mister Clean prepare/closure bundle is not produced (it needs a local full suite).
- **CI pins charter 7b12eea while local is b9323cd.** The CI bump, and wiring `bun ablations/view-ab.ts --self-test` into CI, both need a workflow edit. The host's security-guidance hook blocked that edit (its warning is about untrusted event input, which neither change uses), and it was deliberately not routed around.
- **Model-registry joins:** 9 field-window cards still name `none` because the export has no card for them (nemotron-3.5-super, step-5-preview, inkling, mimo-v2.6-pro, nemotron-3-ultra, muse-wonder); they bind when the registry publishes cards.
- Obligations:
  - O-STD-1..5, O-PLAN-1, O-RET-2 (self-ratification gap; interim rule: commit the owner's ruling before the retirement record);
  - O-PERF-2, narrowed: with a planning config the large-workspace `audit planning` output is 5.8 MB; the heuristic path (no config) is still about 401 MB of JSON at 6.35 GB peak RSS;
  - O-CENSUS-1 (`src/census.ts` walk has no nested-checkout check);
  - O-ABL-1 (the CI wiring above);
  - O-R18-2 (a by-reference false-fail check, waiting for a P05 reconciler item that passes inline);
  - O-FE1-SCHEMA (seam-sync with the main customer project): FE-1 reads a customer project's published telemetry schemas (named in that project's seam record, not here), with raw task-dir reads only where no schema exists. Today mister-clean evals read raw task dirs.
Exact last-green command(s):
- charter check --strict (charter b9323cd), exit 0, on this candidate
- MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun src/cli.ts manifest . --package --check: PASS (82 entries), on this candidate after two byte-identical clean builds
- bun scripts/verify_public_package.ts . --denylist-file config/public-package-identifiers.txt: PASS (83 files)
- bun ablations/view-ab.ts --self-test: ok
- hosted CI verify, dependency-audit and charter on 77a0b7a4 (PR #45) and on main 4bddae5: success
- mister-clean (installed release 7.0.2) audit github-actions: pass, 0 findings
Exact last-red command(s) and why:
- local `bun run test` at 1ba6d13: `build:verified` stops at its capsule commit (host-global language guard). Environment; red identically at base.
- local test:node / test:bun at 1ba6d13: 14 and 9 failures in the environment classes above.
- hosted CI verify on the first bump commit dcd368e: `clean ci: FAIL (build:raw changed the candidate RepositoryObject)`; cause: MANIFEST dist hashes from a bun 1.3.9 build. Fixed forward in the next commit with a bun 1.4.0 build. (`bun run build:raw` completes on this host under bun 1.4.0; the earlier "stops at a socket test" note was wrong for this path.)
Next three bounded items (in order):
1. Tag v7.2.0 (annotated, from git), verify the CI archive, install it, and re-run prepare on the large workspace.
2. 7.3.0: rework e7fed741 (rebase, MANIFEST), re-QA, land, tag; then the self-clean loop on this repository, then the field study across the other repositories.
3. The data-product slice (O-DATA-1): store, importer, starter-set derivation per charter/owner-decisions/2026-11-03-starter-eval-set.md, redacting export. O-CENSUS-1 remains.
Housekeeping done at wind-down (2026-11-03):
- Branches: only `main` plus the two early field-observation branches behind PR #8 and PR #9 remain on origin. Merged or superseded branches were deleted after confirming each tip has an `archive/*` tag on origin.
- The PM's local private data was consolidated into two roots (the product state directory and the agent private root) plus a tool cache. It was verified by an independent reviewer. Nothing private is in this repository.
- New obligation O-DATA-1 (owner request): consolidate eval, case and field-study data from every repository that uses Mister Clean into one store, as a usable data product. Inventory first, then the FE-1 schema, store and importer, then a redacting export. The owner decided the starter set (charter/owner-decisions/2026-11-03-starter-eval-set.md); what else is public is still open.

Open owner decisions:
- Ratify INTENT and COMMON-STANDARD v0.2.
- Capsule hook disabling for the clean-CI and generated-candidate capsules.
- Allow the CI workflow edit (charter pin bump and comparator self-test).
- Deletion of four retired agent worktrees that still hold untracked files (contents preserved externally with verified hashes), and of listed scratch files.
