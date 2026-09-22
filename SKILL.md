---
name: mister-clean
metadata:
  version: 7.0.1
description: >-
  Pay in-scope completion debt and leave a verified, successor-ready repository, or guard an active candidate from known debt. Invocation authorizes the documented work; AUDIT is explicit read-only analysis.
---
# Mister Clean

Mister Clean finishes work so an unfamiliar team can trust and continue it.
A bare `$mister-clean` invocation means `CLOSE`: inspect, repair, validate,
synchronize when policy permits, and leave a minimal durable successor surface.

## Three governing contracts

### 1. Pay the debt

Invocation is standing authorization to pay **all in-scope, executable completion debt**. Plans, queues, receipts, trends, and scores are not done. Cost affects pacing, never closure. Persist until:

- the debt is paid and the closing state is verified;
- the user interrupts; or
- a named hard boundary makes the affected work impossible.

Deliberately unstarted roadmap work is not debt; a required later step after
commenced or claimed-complete work is. Artifact existence is not execution.

### 2. First, do no harm

The **full repository object** is tracked plus nonignored state, not merely HEAD/tree. Also bind refs, stashes, worktrees, ignored-path provenance, Git locks, and relevant processes.
Freeze applicable comparators before the first mutation. Each atomic action includes repair and focused validation. **Zero Mister Clean-introduced debt may cross an action, commit, merge, checkpoint, push, or handoff.** Net improvement never offsets regression; repair or roll back before continuing.
Acceptance consuming ignored/generated/cached/untracked artifacts is `NOT VERIFIED` unless those artifacts are reconstructed from the exact candidate in one clean materialization. Prefer positive enumeration of allowed search roots; root-qualify exclusions. Scan the actual prospective package file list with an identifier denylist; see `references/verification-doctrine.md`.
Classify each end finding as `baseline`, `newly_discovered_preexisting`, `concurrent_external`, `introduced_by_run`, or `unestablished`. Preexistence needs exact baseline replay; concurrent change needs an exact object transition and independent identities. Otherwise use `unestablished`, which forbids CLEAN; never compare unlike scopes/detectors as origin evidence.

### 3. Invocation is authority

Do not ask again for ordinary in-scope edits, repairs, formatting, tests, builds, generators, gates, planning/docs reconciliation, recoverable task-owned cleanup, commits, current-branch push, CI observation, or safe task-owned branch/worktree/stash/temp/process reconciliation.
Standing authority never waives target verification. Re-resolve volatile targets immediately before push, deletion, ref mutation, worktree removal, or process signaling.

Hard boundaries are narrow and affect only the blocked action:

- unrecoverable destruction, force-push, or history rewrite;
- secret exposure or security/audit-control bypass;
- another owner's live work or an unresolved ownership collision;
- unrelated repositories, accounts, environments, or third parties;
- production deployment or production-data mutation;
- a consequential product, architecture, security, legal, or principal choice;
- an unavailable credential or external authority required by the procedure.

Complete every independent authorized action first. A hard boundary remains
`decision_or_coordination_required` and forces `NOT CLEAN`; never soften it to
"clean with residuals." Do not self-create a `deferred` state: deferral requires
an attributable operator ruling recorded on the affected artifact.

## Select the mode

| Mode | Trigger | Route |
|---|---|---|
| `CLOSE` | Bare invocation; finish, closeout, or handoff request | Run the complete loop below. |
| `CLEAN` | Specifically bounded cleanup | Perform that cleanup and adjacent reconciliation needed to leave it stable; do not redesign the product. |
| `CONFORM` | Normalize a named current, historical, or generated corpus | Preserve provenance under the conformance contract. |
| `GUARD` | Guard an active implementation before accepted history advances | Use the exact-tree four-role barrier. |
| `AUDIT` | Explicit “audit,” “review only,” “inspect only,” or “make no changes” | Read-only findings and evidence; no repository or external mutation. |

Never downgrade a bare invocation to `AUDIT` because it is short.

## Finding disposition and verdict

Every finding has exactly one disposition:

1. `autonomously_repair` — repair and validate it;
2. `autonomously_validate` — execute the missing test, review, acceptance, or gate;
3. `accepted_exception` — irreparable history explicitly ratified with authority,
   scope, rationale, and machine-readable evidence; or
4. `decision_or_coordination_required` — a genuine hard boundary; never CLEAN.

Never fabricate provenance or independence. Unrecorded historical identity
remains unknown unless independently established.

The headline is `CLEAN` or `NOT CLEAN`; keep `completion_debt`,
`repository_state`, `planning_integrity`, `verification`, and
`handoff_readiness` separate.

`CLEAN` acceptance criteria require all of the following on the same current subject:

- zero payable, blocked, deferred, or not-assessed completion debt;
- zero cleanup-introduced open debt at every action boundary;
- zero unexplained cleanup-introduced complexity regression under frozen measurement;
- every eligible acceptance cascade executed, with failures repaired and rerun;
- planning lifecycle, parentage, acceptance, and rollup projections coherent;
- every live branch, worktree, stash, process, and external dependency owned or
  dispositioned according to repository policy;
- the closing candidate contains the current target state;
- required gates pass on the exact closing object, with complete coverage and
  representative negative controls for newly repaired enforcement;
- a fresh clone can reach the committed entry points and current-state surface;
- final independent review passes with no substantiated payable finding in its
  body, regardless of severity label; and
- the live closure bundle validates and reports `CLEAN`.

If policy requires `/swarm-review`, invoke it; otherwise use the named or a
harness-neutral independent review. If unavailable, report the boundary and
remain `NOT CLEAN`.

## Minimal default loop

### 1. Bind reality before mutation

Resolve root, toolchain, policy, target ref, HEAD/divergence, worktrees, branches, stashes, dirty/nonignored state, relevant processes, planning/procedure graph, criteria, gates, and independent actor.
Cite procedure edges to policy or instruction; never invent a universal DEV/QA/holdout graph.

Resolve `MISTER_CLEAN_ROOT` to the directory containing this installed
`SKILL.md`; never mix prose and executables from different installations.
Before production use, attest that runtime:

```bash
node "$MISTER_CLEAN_ROOT/bin/mister-clean.js" attest \
  "$MISTER_CLEAN_ROOT" --json --strict
```

The Bun entrypoint `@bradheitmann/mister-clean/control-plane` admits queries/state only; it cannot dispatch, execute, create trust, or replace attestation. Deep imports are blocked.

Use the repository's canonical package manager and runtime; never create a competing lockfile or convenience interpreter.

One exclusive modifying actor may use the current checkout when policy permits; record baseline, write boundary, action parents, and target expectation.
If more than one writer exists, custody is unknown, a modifying delegate is dispatched, or shared projections/refs may collide, stop mutation and route to
`concurrent-remediation.md`. Each modifying delegate then receives its own
worktree and branch before its first write.

### 2. Measure debt before cosmetic cleanup

Run repository-native validators and Mister Clean's bounded discovery:

```bash
node "$MISTER_CLEAN_ROOT/bin/mister-clean.js" audit planning . --json
node "$MISTER_CLEAN_ROOT/bin/mister-clean.js" audit github-actions . --json
node "$MISTER_CLEAN_ROOT/bin/mister-clean.js" audit repository-boundaries . --json
node "$MISTER_CLEAN_ROOT/bin/mister-clean.js" detect stack .
```

Inventory completion debt, projection contradictions, hygiene findings, broken entry points, stale instructions, unreachable tests, generated drift, ownership gaps, and unclassified planning artifacts across all ten dimensions.
Declared required fields are corpus-wide: validate every eligible artifact; never sample or invent missing history.
Close identity -> authority -> projection -> behavior -> state. Ambiguous identifiers, stale authority projections, vacuous distinctions, and unbounded state stay payable until semantic probes dispose them; read `references/semantic-boundary-probes.md`. Repository probes may propose cases and raw observations but never grade themselves. Mister Clean owns census, compiled checks, and verdict reduction; arbitrary runtime semantics require an external, independently authorized Ed25519 attestation under an external trust policy. Legacy runner PASS and `not_applicable` remain debt until v2 reproof.
Also close gate-bite, evidence portability, proof-kind liveness, failure-domain independence, mirror equivalence, supersession lineage, instruction polarity, and environment-semantics seams as distinct root invariants.
Map every production executable, including JavaScript/JSDoc zero-build surfaces, to a reachable native validation route; exclusions fail.
GitHub Actions debt includes transitive workflow authorization, candidate provenance, and named health checks; pay root invariants and retain negatives. Read detected `references/stack-adapters.md` sections.
When code, documentation, dependencies, build context, or topology may change, read `references/complexity-debt.md`. Use one analyzer and count generated shippable mirrors in shipped weight, never authored structure; keep evidence outside the measured subject.
Repairs need contradiction/near-miss or rationale. Toggles/migrations need reused A→B/B→A/system/host-handoff traces, clear hosts, and path parity; fresh states fail.

When a corpus is counted, sealed, transferred, or compared, use the canonical census; name every root and keep the sidecar outside it. Never substitute an ad hoc `find`, glob, summary, or nested-only count:

```bash
node "$MISTER_CLEAN_ROOT/bin/mister-clean.js" census capture --repo "." --root "<repository-relative-corpus-root>" --output "<external-evidence-dir>/before-census.json"
```

A seal is not a timestamp, hash, or filesystem lock: stop all writers and release ownership; retain read-only custody or a copied frozen object. Mandatory post-review recapture and compatible comparison precede acceptance/integration. Any byte, path, or metadata change invalidates the seal and forces re-freeze; never regenerate evidence in place; incompatible measurement is measurement debt, not mutation; equal totals prove nothing.

Run `mister-clean prepare` to bind checkout, run, invocation, and criteria; it is a scaffold, never CLEAN. Claim a debt in its action manifest immediately before paying it; require dependency closure, native governance, and active authority. Rebuild hook-rejected bytes on the accepted parent; never bypass the hook.
A proved common cause shapes one action. Only `mister-clean prepare` mints observation/root-debt identities; packaged JSON is a NOT CLEAN field guide.

### 3. Pay dependency-closed actions

Order work `FINISH -> CONFORM -> CLEAN`; choose the smallest dependency-closed action and atomically update its authoritative projections. After each changed or interrupted action, run frozen comparators and exact-object gates; repair or roll back new debt before continuing.
For supported generic local mutations, use `mister-clean action begin`/`finish`; it refuses incomplete physical action-hygiene evidence or cleanup-created ref, stash, worktree, ignored-path, Git-control, or process regression.

For sealed material, install mechanical least-read custody; prose-only prohibition is not custody. Exposure freezes the lane, revokes that actor's positive authority, and requires replacement. Read `references/concurrent-remediation.md`.
When policy requires separation of duty, use a genuinely distinct actor. `continue` resumes the same role, read/write scope, and task; it grants no new authority.
A verifier that writes cannot certify its diff. Tab labels/self-reports are not execution identity. Bind model + harness + reasoning + provider route before dispatch/scoring. Restart, fallback, or mismatch invalidates the lease; never backfill unknown identity. Retain findings as `identity_unbound`.

### 4. Freeze and verify the candidate

Stage intended bytes and bind the immutable tree with `git write-tree` or its VCS equivalent. Any byte change mints a candidate and expires prior receipts; independent QA never edits its review object. A positive headline containing any substantiated payable finding is a rejection.
Serialize Git-stateful commands. Expensive gates claim one-owner resource domains: record overlap, use process-group/child timeouts, rerun INDETERMINATE timeouts quiescent, and never inflate deadlines first.
Focused checks stay local. Full root suites use a Git-common-directory lease and registered supervisor. Atomic registration, birth IDs, and escape custody prevent overlap. Busy emits a typed `resource_contention` no-start receipt excluded from model scoring. Unknown custody is NOT CLEAN; never duplicate a root suite.

In `GUARD`, DEV, QA, Mister Clean, holdout, deterministic gates, and no-harm
evidence must bind the same tree before an accepted ref advances. Mister Clean
retains repair authority, but any repair restarts affected independent checks.

Generic action manifests use schema 1.2; every newly prepared GUARD closeout is `closeout_guard` schema 1.3 from initialization and reuses schema-1.2 coordination semantics. A live passed/open or crossed/executed boundary requires external `--accepted-evaluator` and `--guard-authority`; inline copies cannot replace them.
It proves current object/record coherence, not authorship, historical mutex/CAS execution, or an execution claim without its own evidence.

A path plus digest is an evidence locator, not proof. Load and verify its exact bytes, full bindings, and state-specific semantics; authentication and transport acknowledgement do not establish acceptance, execution, or verification. Read `references/verification-and-claims.md`.

Every production executable surface needs a reachable canonical syntax/static/type/build/test gate. A green root typecheck does not cover excluded
directories. Fixture/demo projections
must identify themselves conspicuously; excluded files and source imports cannot support packaged, live-state, routing, qualification, or CLEAN claims.

When Mister Clean is under test, it cannot certify itself. **Every Mister Clean commit candidate** crosses the exact-tree GUARD barrier and a read-only dogfood run by the last accepted installed release, pinned by version and digest, against one frozen full repository object; any byte change restarts the gate.
Matched comparisons receive the same blind packet, never overlap repository writes, and are independently scored. Route genuine misses to a general detector, rule, or fixture. Read `evals/blind-run-contract.md`.

Before target or remote ref mutation, re-resolve the expected object. If it
moved, reject the stale transaction, incorporate the current target under
repository policy, and rerun affected verification. Multi-writer integration
uses the full mutex, fenced lease, invariant-domain CAS, and combined-tree gate.

### 5. Close the successor surface

Commit only the minimal durable operating truth a fresh clone needs: accurate
entry points, one designated current-state surface, required schemas/generators,
and durable verdict anchors. Raw evidence may remain ignored-local when policy
permits, but committed operation may not depend on it. Retire stale dispatches
before actionable content and preserve immutable evidence through amendments,
never rewrites.

Run the complete applicable suite on the closing object and in an isolated
clone; report local, CI, deployment, push, and independent-acceptance claims
separately. Wiring is not execution and exit zero does not overrule warnings,
partial coverage, skips, or semantic failures.

Run final independent review, pay its in-scope findings, mint a new tree if
needed, and re-review. Then create and live-validate the colocated report,
action manifest, regression delta, review, censuses, and closure bundle:

```bash
node "$MISTER_CLEAN_ROOT/bin/mister-clean.js" validate manifest \
  "<bundle-dir>/action-manifest.json"
node "$MISTER_CLEAN_ROOT/bin/mister-clean.js" validate bundle \
  "<bundle-dir>/closure-bundle.json" --repo "."
```

The evidence freeze is the final state transition. Any later mutation
invalidates commit-bound evidence; regenerate it before either verdict.
An evidence-corpus mutation claim additionally requires two valid, compatible
canonical censuses. Without that pair, mutation is `unestablished`; repair the
measurement before reopening accepted work.

## Continuation and deadlock

Checkpoint the bound snapshot, normalized debt set, executed actions,
verification, custody, and exact next safe action. On continuation, rebind
volatile state and resume; never reinterpret continuation as deferral.

After two attempts on the same debt produce no repository, evidence, or
diagnosis delta, change the hypothesis, action shape, or agent. Do not create
prerequisites merely to show motion. If no safe in-scope path remains, preserve
the proof and report the exact hard boundary as `NOT CLEAN`.

## Trigger index — load only what applies

| Trigger | Read |
|---|---|
| Before any write or external action | `references/authorization-and-modes.md` |
| Commenced CLOSE/CLEAN procedures | `references/completion-debt.md` |
| Any modifying run | `references/no-harm-and-debt-delta.md` |
| Initial discovery | `references/situational-awareness.md` |
| CLOSE/hygiene | `references/code-hygiene-rubric.md`; detected `references/stack-adapters.md` sections |
| Handoff/CLOSE verdict | `references/successor-readiness.md` and `references/verification-and-claims.md` |
| Multi-turn work | `references/persistence-and-continuation.md` |
| Multiple writers/shared state/model routing | `references/concurrent-remediation.md` |
| Modifying delegate/isolation breach | `references/write-lane-isolation.md` |
| GUARD mode | `references/continuous-clean-development.md` |
| Historical/generated conformance | `references/conformance-and-provenance.md` |
| Executable semantic/composition proof | `references/semantic-boundary-probes.md` |
| Tool/process/delegated-shell problems | `references/tool-liveness.md` |
| Gate repair/verification dispute | `references/verification-doctrine.md` |
| Structural judgment | `references/intelligent-momentum.md` |
| Complexity change | `references/complexity-debt.md` |
| Machine record | `mister-clean prepare`; `assets/*.json` are field guides only. |
| Human report | `templates/hygiene-report.md`, `templates/session-close-report.md`, `examples/example-report.md` |
| Optional persistent harness goal | `templates/orchestration-goal.md` |
| Revising/forward-testing | `references/behavioral-evals.md`; `evals/blind-run-contract.md` |
| Evaluating the packaged MCP surface | `evals/mcp-evaluation.xml` |
| Model/harness/reasoning comparison | `evals/model-hygiene-trial.md` |
| Four-role fleet campaign | `evals/rotation-campaign.md` |
| Local report/control plane | `references/control-plane-product-spec.md` |
| Optional visual state projection | `assets/codebase-state-dashboard/index.html` and its adjacent scorecard/tokens |

Do not return a plan while executable in-scope work remains. Return changed,
verified repository state, or a precise `NOT CLEAN` boundary report after all
independent authorized work is complete.
