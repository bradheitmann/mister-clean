---
artifact_type: reference
classification_rationale: Park handoff written under the owner's 2026-11-06 supporting-repository save-and-handoff directive; a historical record of state, open work and seams at the park point. Not a cleanliness verdict and not a lifecycle-bearing planning artifact.
title: Park handoff 2026-11-06 (mister-clean, master-gate program parked)
timezone: UTC
---

# Park handoff — mister-clean, 2026-11-06

Written by the project PM (Claude Code, anthropic/claude-opus-5.5) under the owner's directive "supporting repositories finish, save, hand off and stop" (relayed by A/EXEC-PM via A/PO-ASTRA, 2026-11-06). The repository is PARKED: no new slices start. This file is the inventory; `charter/STATE.md` on main points here. Paths are written `~/`. No secret values and no personal data appear here.

## 1. Purpose, strategy, architecture

**Purpose.** Mister Clean is a closeout judge: it pays completion debt and leaves a repository that an unfamiliar team can trust. Its CLEAN verdict is supposed to mean "verifiable, successor-ready, and reviewed".

**Owner direction (2026-11-05).** Mister Clean becomes "the master code quality and hygiene gate". Every review skill on the owner's machine is absorbed into it as a phase or module, internally consistent, with no two phases contradicting each other. The reviews are code-hygiene, improve-codebase-architecture, architecture-patterns, code-review, security-scan and security-review, qa-review, swarm-review, qa-swarm-review, taste-judge, web-perf and others; about 24 apply to every repo and about 60 are triggered by stack.

**Architecture today, and its known defects.**
- One TypeScript CLI (`src/`, bundled to `bin/mister-clean.js`), a control plane (`src/control-plane`, `control-plane-app/`) and a Worker (`src/worker.ts`), all in one package.
- The judge lives in `src/closeout/` (42 flat files).
- The same rule is enforced in several places that disagree:
  - public-safety exemptions are applied in `prepare.ts` and ignored in `bundle-live-validation.ts`;
  - planning classification lives in two classifiers plus a re-export;
  - detectors are invoked from six call sites.
- This duplication is the root cause of the contradictions seen in the field runs.

**Strategy, the master-gate program.**
1. Review Mister Clean with every review skill (Phase A, done).
2. Repair verdict integrity and execution safety (S0, S1, S1b, done).
3. Build one backbone: a phase registry, one finding model and one reducer (S2).
4. Absorb the review skills as modules on that backbone, one or two at a time (S7).
5. Rewrite the instruction surfaces (S8).
6. Release.

The next pinned release must map every row of the skill inventory as absorbed, conditional, or rejected with an owner-approved reason.

## 2. Exact state (refs, pins, releases)

| Ref | Commit | State |
|---|---|---|
| `main` | `d547fc5` at the park point (a park records commit lands on top; see §9) | S0, S1 and S1b merged. Unreleased. |
| `release/7.5.x` | `c966510` | 7.5.1 line plus mg-release-7.5.2, accepted. |
| tag `v7.5.2` | `1d06f2a` (tag object `3cb2eb1`) | Released as a patch for the dsgncrsh prepare refusal. See §6 for the archive. |
| tag `v7.5.1` | `a47c00d` | The FLEET PIN, installed at `~/.claude/skills/mister-clean` and in every agent skill directory; npm `latest`. |
| tag `v7.5.0` | `1471d57` | Previous. |
| `handoff/park-20261106` | this file | Park handoff branch. |

**Tested vs installed.**
- 7.5.1 is installed and attested (`attest --strict` pass) in all 55 skill copies plus 19 symlinks.
- 7.5.2 is tagged and released on GitHub but NOT installed by this PM. dsgncrsh installs it.
- main (S0, S1, S1b) is tested (Linux container ci:check and hosted CI) but not released.

**Honesty notes on 7.5.1** (recorded, not re-litigated):
- Its CLEAN verdict rested partly on records the closer wrote and the judge did not verify: the five dimensions, the isolated-clone gate, and final_review. The filler labelled the owner's chat approval "third-family independent review", which was false.
- Its `CURRENT.md` still names 7.5.0.
- S0 and S4 close these gaps.

## 3. Work done in this session (artifact-backed)

- **Phase A review.** Eight read-only lanes ran every review skill on main `2fb1d17`: 239 findings (8 critical, 85 major, 124 minor, 22 advisory). Private evidence: `~/.local/share/agent-private/mister-clean/master-gate/findings/A1..A8.md`, plus `SYNTHESIS.md`, `INTEGRATION-PLAN.md` and `ARCHITECTURE-ASSESSMENT.md` beside them.
- **S0, trust root** (merge `e00b19c`). Pays all 8 criticals:
  - an externally pinned trust policy (`validate --trust-policy-sha256` or the environment variable);
  - key-bound attester identity, with `valid_to` required;
  - owner-signed exceptions;
  - no bundle-chosen live path (no GUARD skip; the judge's own registry; v1 semantic does not count);
  - VALIDATE receipts.
- **S1, execution safety** (merge `3d46c86`):
  - a per-gate shim PATH;
  - a credential-free CARGO_HOME;
  - one hardened git helper for every target-facing call;
  - an authenticated control-plane `/session`;
  - CLI pins replace environment pins;
  - the receipt binds the validated bytes;
  - rustup-derived toolchain locators.
- **S1b, git and environment hardening** (merge `d547fc5`, the first slice landed through the full charter lifecycle):
  - gates cannot obtain a credential through git;
  - inherited `GIT_*` is scrubbed;
  - program-naming git keys are neutralised;
  - validate's remote proof refuses option-shaped names and contacts the checked URL outside any repository, which defeats chained `insteadOf` rewrites;
  - driver enumeration fails closed;
  - the token fragment is cleared;
  - locator derivation is guarded.
- **mg-release-7.5.2.** The byte-order fixes `c8b2663` and `31ec5dd` (authored by a Claude cloud session) released as 7.5.2 on the 7.5.x line, through the full lifecycle.
- **mg-pii-name-1.** Three public planning lines no longer name the owner. Status at the park point is in §9.

## 4. Unfinished work, defects and debts

All of these are measured unless marked otherwise. The detail lives in the private ledgers named.

**Ordered future work (not started).**
1. **S1c, OS sandbox:**
   - native gates in an OS sandbox, or refused on the host;
   - closing the absolute-path, login-shell and CARGO_HOME-write escapes;
   - the S1 and S1b QA obligations: the network-program git keys not proven by markers; `pushInsteadOf` has no test (medium); three low test gaps; DONE proof 5's reopen command needs the app config.
   - Until S1c lands, judges run only in the Linux container (finding A3-3).
2. **S2, backbone:**
   - one phase registry, one finding model and one reducer, used by prepare, validate, second-pass and the audits;
   - one canonical-JSON encoder (there are 3 today), one timestamp grammar (7 validators, 4 of which accept 2026-02-30), one front-matter parser and one git runner;
   - a parity test: validate accepts exactly what prepare accepted.
3. **S3, one planning classifier.** It must also recognise a singular `plan/` directory; model-tier-drop's `plan/` is unaudited today.
4. **S4, judge-minted evidence:**
   - the judge runs the isolated-clone gate itself;
   - final_review becomes a verified receipt bound to the bytes validate checks; today the review sees the pre-fill bundle and validate the post-fill one;
   - derived dimensions;
   - content-bound attestations, because today every commit needs a fresh signature;
   - a fleet verdict ledger and a trust-policy pin table;
   - the S0 QA obligations D2, D3 and D7.
5. **S5, detector coverage:**
   - credential formats;
   - all matches per line;
   - unassessed encodings;
   - commit-author identities and owner name forms;
   - a pinned public-safety denylist;
   - repository-boundaries and an import-graph architecture detector inside prepare;
   - fail-closed detector errors.
6. **S6, build, CI and release:**
   - about 1,990 untyped script lines (10 tsc errors);
   - a required CI check that can fail (the charter job is red by construction);
   - a gated Worker deploy;
   - the release path in the repository;
   - trimming consumer dependencies;
   - measured per-test budgets: control-plane sqlite/HTTP tests time out at 5 s under load and also fail on main in the container;
   - the cargo tool tests added to CI;
   - the bun resolver flake in the node_modules-free gate snapshot.
7. **S7, phase modules.** Absorb the review skills in related pairs on the S2 registry, per the skill inventory.
8. **S8, instruction surfaces.** Rewrite SKILL.md, references and the example report. Document the control-plane `#session_token=` launch and the system-git-config change.
9. **S9, layout.** Separate product from evidence and research. The package split is an owner choice.
10. **Forward merge of the 7.5.2 fixes into main.** Main still has the localeCompare sort, so dsgncrsh-shaped repos fail prepare on main too.
11. **PlanGraph-shaped plan.** The master-gate plan exists as a 13-node, 18-edge fixture handed to PlanGraph's PLAN-OF-SLICES-V1. Converting it waits for planctl to compile multi-slice plans.

**Charter lifecycle deviations (recorded).**
- S0 and S1 ran without the dispatch, freeze, receipt and accept commands, and with same-family QA.
- S1b was dispatched late, at its DONE pin.
- S1b landed with its acceptance records on the branch, which charter's `land-check-1` refuses. The canonical shape puts those records inside the merge commit.

**Open owner decisions.**
- A `principal` role for the owner's key, so exceptions can be signed. Today none can be.
- The package split.
- Slice Zero redesign scope.
- Optionally, a GitHub purge of cached revisions holding owner identifiers.

## 5. Team protocols in force

- **Roles.** PM (this session), MC/DEV (a Claude sub-agent), cross-family QA: CH/QA (xiaomi/mimo-v2.6-flash) and MC/QA (openai/gpt-6.1-terra), through `pi`.
- **Charter lifecycle.**
  1. A DONE list before code, with no post-merge proofs.
  2. `charter gate <slice> --dispatch`, with the record committed on its own.
  3. The branch's last commit is `charter freeze`.
  4. A cross-family `charter receipt --verify-tree`.
  5. In the `--no-ff` merge commit itself: the receipt, the reopen attestations, `gate --accept`, STATE, and the trailer `Charter-Slice: <id>`.
  6. Afterwards, records only.
  The binary is `~/.local/share/charter/bin/ef2b92e911540155af27759ffadb2d9d3a04fd2a/bin/charter`.
- **Harness guards** (`~/.claude/hooks/`):
  - `guard-charter.sh`:
    - blocks hook bypasses everywhere;
    - blocks pushes whose added lines match the owner-PII patterns;
    - blocks unaccounted code pushes to mister-clean main.
  - `guard-owner-email.sh` blocks `gh pr merge` and personal commit identities.
- **No merging on GitHub.** Merge locally `--no-ff` with the no-reply identity and push.
- **Judges run only in the Linux container.** Image `mister-clean-judge:7.5.0d`, which now includes rsync. Dockerfile at `~/.local/share/agent-private/mister-clean/evidence/judge-container/`.
- **Owner PII.**
  - The patterns live only in `~/.local/share/agent-private/owner-pii-patterns.txt` and `owner-first-name.txt`, and are never copied anywhere.
  - Redact; never exempt.
  - PII-check every verifier-written record before committing it.
- **Clean as you go.** After every merged slice, the installed release judges main in the container, and introduced debt is paid before the next slice.
- **Loop control.**
  - One review round, one fix merge and one re-check per slice; a rework cap of 2, with exceptions recorded.
  - One rerun on an environment failure, then hosted CI is the evidence.
  - Owner decision 2026-11-04: hosted CI is the S6 evidence.
- **Adopted vs implemented.**
  - Implemented: charter `land-check-1` is installed as a read-only report (binary `63fe271c…`).
  - Pending: enforcement waits for `land-check-2`.

## 6. Cloud-resume instructions

1. **Checkout.** `git clone https://github.com/bradheitmann/mister-clean.git`, then:
   - `git checkout main` (at or after `d547fc5`), for the master-gate line;
   - `git checkout release/7.5.x`, for the patch line.
2. **Prerequisites:**
   - bun 1.4.0 (`.bun-version`);
   - pnpm 11.0.3;
   - node 22;
   - Rust as pinned in `tools/*/rust-toolchain.toml` for the cargo tools;
   - charter binary v0.1.0 (from the charter repository, which is private and needs access).
3. **Entry points.** This file; `charter/STATE.md`; `charter/DONE/`; `CURRENT.md` (stale, names 7.5.0).
4. **Safe first commands:** `pnpm install --frozen-lockfile`, then `pnpm run ci:check` on a Linux host.
5. **First three bounded tasks:**
   1. The forward merge of the 7.5.2 fixes into main, as a slice.
   2. S1c.
   3. S2.
6. **Secrets, by name only.** They come from Doppler (project `mister-clean`, config `attest`): `MISTER_CLEAN_ATTESTATION_PRIVATE_KEY_PEM`, `MISTER_CLEAN_ATTESTATION_KEY_ID`, `MISTER_CLEAN_TRUST_POLICY_JSON`, `MISTER_CLEAN_TRUST_POLICY_SHA256`, and the owner's key `MISTER_CLEAN_OWNER_ATTESTATION_PRIVATE_KEY_PEM`, which only the owner signs with. Access is through the owner's Doppler account.
7. **Local-only, not in the cloud:**
   - the private ledgers and evidence (`~/.local/share/agent-private/mister-clean/`);
   - the judge container images;
   - the PII pattern files;
   - the charter binary build;
   - `pi` seat configuration (`~/.pi/agent/models.json`, provider-pinned for xiaomi/mimo);
   - the field-run bundles.
8. **What can't be resumed in the cloud** without those: cross-family QA through `pi`, PII checks against the pattern files, and Doppler signing.

## 7. Services

This repository runs no shared service. Parking stops no service. The control-plane Worker deploy is owner-run, and nothing was deployed in this session.

## 8. Pairwise seams with every other workspace repository

| Repo | mister-clean → it (provides) | it → mister-clean (consumes / provides) | Implemented and verified | Planned or unproven | Remaining actions (owner of the action) |
|---|---|---|---|---|---|
| charter | Field-run judge; charter judged CLEAN at v0.1.0 (`ef2b92e`) on 2026-11-05. Supplied the data for charter's `CLEAN.tsv` row. | The charter contract, hooks and binary, pinned at v0.1.0 in hooks and CI. `land-check-1` and the canonical landing order. | Hooks enforce `check`, `check --strict` and acceptance (they refused two of this PM's steps). Charter's CLEAN verdict validated live with the 7.5.1 judge. | land-check enforcement (`land-check-2`); a fleet verdict ledger (S4). The CI charter job is red by construction (charter source private). | charter: land-check-2 (TODO 105), ADOPTION landing docs, the release workflow cross-build. mister-clean: switch the guard to `land-check` after land-check-2; the S4 verdict ledger; the charter CI job via the released binary (S6). |
| model-tier-drop | Planned future consumer: Mister Clean as router chooses moves (`project/planning/seams/ESCALATION-ADJACENCY-SEAM.md`). | The tier ladder registry and schemas. Not pinnable yet (live Worker URL only). | None. Mister Clean does not read tier-drop's registry. | The router pins the committed schema by commit plus sha256 when built. | tier-drop: committed versioned schemas (S-15, deferred until a consumer exists). mister-clean: S3 must audit tier-drop's singular `plan/`, which is unaudited today. Trust policy: KEEP plus a route fix; AMEND is owner-only. |
| model-atlas | Customer test of the model-atlas export (`customer-tests/model-atlas/`). | `model-atlas.export/1`, pinned; mister-clean has a `CONSUMERS.tsv` row there. | The customer-test pin is checked unconditionally (PR #68). | model-atlas will run a CLOSE with 7.5.x; its attestation key's first use is the first SEM-* candidate. | model-atlas: run a CLOSE and canary its QA route. mister-clean: none open. |
| odin | Field-run judge, in progress and parked: P4 shows 0 findings, the semantic check attested, and 1 native-gate debt (node test timeouts under load; a missing rsync in the judge image was fixed). | Red-team findings against Mister Clean (retirement authority, #64), and the odin SCP governance tooling used fleet-wide. | P4 runs odin-close-2 and odin-close-3 in the container. The B2 attestation was signed by OD/QA (v2 `fe8e3513`). | odin-close-4 at low load; the retired-corpus run under 7.5.x (inputs preserved privately); P5 and validate. | odin: declare the rsync and shasum dependencies; measured test budgets. mister-clean: run odin-close-4 and the retirement run when unparked. |
| plangraph | The master-gate plan as the first customer fixture for PLAN-OF-SLICES-V1. | The plan format: intents, edges and compile. | Only `planctl lint --input` validates one intent. `lint --json` accepts any JSON, so it's no check at all. | Multi-slice plan compile and graph validation; plangraph's field-run CLOSE. | plangraph: PLAN-OF-SLICES-V1 plus a pairing edge. mister-clean: re-author the plan with planctl once it compiles. Trust key: first use at plangraph's CLOSE. |
| lumbr | None established beyond fleet tooling. | Earlier MAINT-parser disposition A (optional). Trust policy dormant (LU/QA silent since 2026-11-03). | None verified in this session. | The first use of lumbr's attestation key is the rebuild G1 fail-closed proof. | lumbr: keep the key dormant to 2027-02-02 and re-check at the rebuild. |
| polyswarm | Feedback entries each round (R14–R18), in the iCloud feedback directory. | The feedback protocol and lenses (FEEDBACK-FORMAT v2), plus cross-seat route evidence (mimo through pi). | Entries filed through R18. | The R14 polyswarm feedback item (deferred earlier). | polyswarm: none on mister-clean. mister-clean: resume rounds when unparked. |
| reveng | `ablations/view-ab.ts`, consumed in reveng's round-18 ablation. Reveng is last in the field-run order. | None in this session. | The ablation consumption, recorded in an earlier STATE. | reveng's Mister Clean deep clean (last, by owner order). | None now. Reveng continues and is exempt from the park directive. |
| dsgncrsh (outside this workspace) | 7.5.2, which fixes the prepare refusal on mixed-case gate source refs. | None. | 7.5.2 released; see §9 for the archive digest. | dsgncrsh installs and attests 7.5.2 itself. | dsgncrsh: install and attest. |

## 9. Park-point completion (filled in at the park point)

- **mg-pii-name-1:** LANDED on main as merge f44fe0e (land-check: passed as an accepted slice). Public main now has 0 whole-word hits on the owner's first name and 0 owner-PII pattern matches. Earlier revisions still contain the name, because history is not rewritten.
- **v7.5.2:** RELEASED. GitHub release v7.5.2, tag on 1d06f2a; asset bradheitmann-mister-clean-7.5.2.tgz, sha256 c2cc2d71a5d070906f3bd549e515dce504f22feaced414fff2646b5b2da1e15c, built and verified by CI tag run 42173874345. Not installed by this PM; sent to dsgncrsh-95. No npm publish.
- **Final refs:**
  - main: 6b71440 (unmeasured cost rows, records only);
  - release/7.5.x: d225c03;
  - handoff/park-20261106: this commit.
  All were pushed non-force, and each remote ref was read back after the push.
- **Pin disposition:** the fleet pin stays v7.5.1 (recent and usable). v7.5.2 is an owner-requested patch for one consumer and does not repin the fleet. main is a checkpoint (S0, S1, S1b), not a release.
- **Odin field-run support:** odin-close-4 and the retired-corpus run were disarmed before they started; their inputs are preserved privately and deferred into odin's handoff.
- **PARKED: no new work.**
