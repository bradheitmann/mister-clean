# State — mister-clean — 2026-11-02T07:20Z, written by the project PM (Claude Code, Opus 5.5)
Proven (with the proof names):
- Nothing under this charter's Slice Zero yet; proven_on is empty.
- Dependency advisories: the six high advisories (undici, zod, body-parser) are cleared on main. Independently verified (author and verifier from different model families) on the exact merged tip.
- Native-gate spawn fix landed (60e748d). Gates spawn through the invoked PATH name; identity stays on the resolved path, with an immediate re-check (executable_changed). Verified on the exact tip fc1f68a.
- Hermetic test fixtures landed (5b83a44). Test-created repositories disable inherited hooks repo-locally and never touch the operator's configuration. Verified on the exact tip 53471f4.
- Discovery and retirement landed (c5a85c9). Three changes, verified on the exact tip 1fa2fcd:
  - harness definition folders are not planning roots;
  - ratified retirements are read from charter/retirements/ with an in-repository evidence {path, sha256};
  - every debt family reports a real repair boundary, and fixture exemptions are keyed by {file, rule, value_sha256}.
- Customer test for the model-facts registry export accepts additive record kinds (2452aa9).
- Field-evals:
  - the 2026-10-31 window (opaque seat ids);
  - reviewer-control card RC-001 (1ba6d13): reviewer false-reject rate from control-pair replays; a signal, not yet significant.
- Charter pinned at 7b12eea (this change). Hooks are installed in the common hook directory: pre-commit runs check; pre-push runs check --strict plus gate. The host's language guard runs beside them.
Not proven / known gaps:
- INTENT and COMMON-STANDARD v0.2 await owner ratification.
- The 7.1.0 candidate's packaged bytes changed (dependency, native-gate, hermetic and discovery fixes). Its independent acceptance restarts at the release lane. Publication is not established; the installed judge is still 7.0.2.
- O-RET-2 (open): a retirement record and its evidence can land in the same commit, so an agent could ratify its own retirement. Interim rule: the owner's ruling is committed before the record, and a human reviews every retirement.
- O-NG-1 (report-only): an inherent window between the re-check and exec; closing it needs descriptor-based exec.
- G2 eval-case-readback and G3 card-identity-check validators do not exist yet (Slice Zero).
- CI cannot run `charter check`: the governance tool's source is not reachable from the runner. Typed limitation. The check runs locally before every merge; the CI job is pattern C template v2 at the same pin.
- Local full suite on this host: NOT VERIFIED. Hosted CI on the same commit (1ba6d13) is green and is the full-suite verdict. In the quiet slot of 2026-11-02 the local parts were:
  - build:raw: 30/31;
  - test:node: 814/828;
  - test:bun: 202/211;
  - control-plane:check: 67/67.
  The failures fall in three environment classes:
  - capsule commits refused by the host-global language guard (an owner decision is pending on capsule hook disabling);
  - local socket and process-kill tests that fail deterministically in the operator agent's shell (fast, identical on rerun alone);
  - stale build outputs that follow from the first two.
  Origin class: `unestablished` until a host without the guard reproduces green.
- The formal Mister Clean prepare/closure bundle is not produced (needs a local full suite; see above).
- Lane 3c (large-repository audits) is in progress on fix/large-repo-audits:
  - O-BUF-1, O-STACK-1 and O-ATT-1 are done but not yet verified;
  - O-PERF-1 is split into a deadline with a typed partial result, plus a profile on the real repository.
- Obligations:
  - O-STD-1..5;
  - O-PLAN-1 (backlog register shape);
  - O-RET-2;
  - O-PERF-1 (b);
  - the two archived early field-observation branches, to be imported after FE-1.
Exact last-green command(s):
- charter check --strict (charter 7b12eea), exit 0
- mister-clean (installed release 7.0.2) audit github-actions: pass, 0 findings
- bun scripts/verify_public_package.ts . --denylist-file config/public-package-identifiers.txt: PASS
- hosted CI verify and dependency-audit on main 1ba6d13: success
Exact last-red command(s) and why:
- local `bun run test` at 1ba6d13: build:verified stops at its capsule commit (host-global language guard). Environment, red identically at base.
- local test:node / test:bun at 1ba6d13: 14 and 9 failures in the environment classes above.
Next three bounded items (in order):
1. Lane 3c: verify, merge, then the read-only acceptance run against the large repository.
2. Slice Zero: replay CS-001 with its control agent and build the eval-case validator (DONE/slice-zero.md).
3. FE-1: field-evals/1 schema and validator, aligned with the model-facts registry's route schema.
Open owner decisions:
- Ratify INTENT and COMMON-STANDARD v0.2.
- Capsule hook disabling for the clean-CI and generated-candidate capsules (needed for a local full suite on a guarded host).
- Deletion of retired agent worktrees that still hold untracked files (contents preserved externally with verified hashes), and of listed scratch files.
