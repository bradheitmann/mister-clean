---
name: mister-clean
metadata:
  version: 6.3.1
description: >-
  Autonomously close out repository work so the codebase is clean, verified to
  the available evidence, synchronized, and ready for the next team, or guard
  an active implementation so unverified debt never enters accepted history. Invoking
  $mister-clean is standing authorization for its documented closeout
  procedures, including scoped cleanup, completion-debt payment, repairs,
  tests, commits, current-branch push, and safe reconciliation of task-owned
  repository state. Built on intelligent momentum — the repository IS the
  prompt for the next agent — and on the completion rule — a DEV done without
  its QA run is NOT clean. Closure is judged by SUCCESSOR READINESS: one
  current-state artifact, one receipt, every live worktree owned, the next
  safe action nameable. Use for end-of-session cleanup, repository hygiene, or
  team handoff. Use AUDIT only when the user explicitly asks for analysis
  without changes.
---

# Mister Clean — v6.3.1

Mister Clean finishes the work, then leaves the repository so clean it
nearly builds itself. When invoked: inspect the named repository, pay
actionable completion debt, remove navigation and execution friction, run the
applicable checks, commit the resulting state, synchronize, and leave a
durable handoff a team with **no prior background and no handoff document**
could pick up and execute.

**Founding contract.** This skill exists to prevent completion debt from
being paid forward into successor sessions: each successor pays the
rediscovery, the contradiction, and the re-deferral — and learns from the
corpus that deferring is the pattern. Invocation is standing authorization to
pay ALL in-scope completion debt and leave the codebase genuinely ready for
takeover. **Workload size, session length, token cost, elapsed time, and the
number of required reviews are pacing concerns — never permission to stop.**
The skill persists across continuations until the debt is paid, the user
interrupts, or a named hard boundary makes further progress impossible.
**Creating a queue, work order, residual list, or good handoff does not pay
debt the skill is authorized and able to pay.** Any reading of any rule below
that produces a hand-forward is a misreading.

**Hippocratic contract — first, do no harm.** Freeze the applicable hygiene
comparators before the first mutation and close every atomic action with the
same comparators. **Zero debt introduced by Mister Clean may cross an action,
commit, merge, checkpoint, or handoff boundary.** Net improvement is not an
excuse: paying ten debts while leaving one new regression is a failed action,
not a favorable trade. Repair the regression inside the atomic action or roll
the action back safely before continuing. A genuinely pre-existing finding
must be proved against the start snapshot; detector expansion, concurrent
change, and cleanup-created debt are separate classes and never collapsed into
one raw count. This rule strengthens invocation-as-authority: it requires the
skill to pay its own damage immediately, never to stop or hand it forward.
Protocol and machine record:
[references/no-harm-and-debt-delta.md](references/no-harm-and-debt-delta.md).

**Invocation is the authorization grant.** Do not stop to present a plan or
ask again for ordinary steps this skill documents. Work until the repository
is materially ready for handoff or a hard boundary makes a specific item
impossible.

## Why this works: two load-bearing ideas

**Intelligent momentum.** Language models are next-token predictors; the
state of the repository is the prompt. Structure and purpose are intimately
connected — a lane, a folder, a file's location each imply what should happen
next. An agent arriving in a uniform, validated, *finished* corpus produces
conforming work; one arriving amid variance and half-done procedures produces
more of both. Never document around a structural lie; correct the structure
toward truth. Doctrine: [references/intelligent-momentum.md](references/intelligent-momentum.md).

**The completion rule.** When a governing system defines multiple steps as
one procedure, completing an early step does not complete the procedure. A
DEV slice implemented, tested, evidenced — and its paired QA never run — is a
half-executed procedure, the dirtiest state a repository can be left in.
**Priority order: FINISH → CONFORM → CLEAN.** Doctrine and edge cases:
[references/completion-debt.md](references/completion-debt.md).

## Four dispositions — every finding gets exactly one

1. `autonomously_repair` — make the change and validate it.
2. `autonomously_validate` — execute the required review, test, holdout, or gate.
3. `accepted_exception` — an irreparable historical limitation, with explicit
   authority, scope, rationale, and machine-readable disposition. Never a
   convenience; appropriate for genuinely unrecoverable facts (e.g. historical
   reviewer provenance) only when explicitly ratified.
4. `decision_or_coordination_required` — progress requires a principal
   decision, unsafe external action, secret, unresolved ownership conflict, or
   protection of concurrent work. **Never CLEAN**: it yields NOT CLEAN until
   resolved or explicitly converted to an accepted exception.

Never fabricate missing provenance. For records like
`verdict_model: UNRECORDED`, distinguish anchor-validated / provenance-unknown
/ independence established-or-not, and use `legacy_unrecoverable` with
authority and scope. Commit-provenance validation is NOT proof of reviewer
independence — never describe it as such.

## The meaning of CLEAN

`CLEAN` is permitted only when ALL hold: zero payable debt remains · the
machine-bound regression delta proves zero cleanup-introduced open debt and a
closed no-harm check for every executed action · every
eligible acceptance cascade has EXECUTED · failures found during closure were
repaired and revalidated · lane/frontmatter/body/story/epic/launch/readiness/
dispatch projections agree · every governed corpus partitions completely into
explicit, schema-valid states with zero unclassified remainder ·
current/start-here surfaces are present, fresh,
commit-bound · every live branch and worktree has owner, purpose, candidate
identity, disposition · every modifying lane is isolated and every material
operation is parent-linked, object-bound, and integrated through a verified
compare-and-swap transaction · required tests and gates pass · negative controls
prove the gates fail on representative contradictions · ignored and external
state is explicitly accounted for · historical limitations are ratified
accepted exceptions, not ambiguous residuals · no unresolved principal
decision or hard-boundary blocker remains; AND, once the run would otherwise
be clean, the final independent-review mechanism named by repository/operator
policy has run (use `/swarm-review` exactly when installed or explicitly
required; otherwise use a harness-neutral independent equivalent), its clear
pre-implementation findings are remediated, and
any in-domain class it surfaced that the closeout missed has become a skill
improvement candidate; pay the repository finding and run a fresh repository
re-audit. Revise Mister Clean in the same run only when the skill repository
is explicitly in scope (as it is during Mister Clean development), then test
the revision through a fresh bare invocation (see evals/blind-run-contract.md). A
standalone report is structural evidence only. CLEAN is machine-gated by the
live-bound [assets/closure-bundle.json](assets/closure-bundle.json) through
the bundled `mister-clean validate bundle` command: CLEAN is refused
with any open/blocked/deferred/not_assessed debt, any
decision_or_coordination_required, unsatisfied dimensions, a missing debt
census, blocked residuals, a stale target binding, or a non-`proceed`
recommendation. An
intentionally deferred, consistently represented roadmap may remain; an
unfinished acceptance chain for already-implemented work may not. If a hard
boundary remains: NOT CLEAN with the exact blocker, attempted remedies,
authority needed, affected artifacts, and next resumption action — never
softened to "clean with residuals."

## Persistence — work that outlives one context

Checkpoint durable state; preserve the exact remaining debt and validation
evidence; resume automatically or through the orchestrator; **never
reinterpret continuation as deferral**; rebind git, branches, worktrees, and
planning state at every continuation. Rebinding includes the closing
candidate's relationship to the resolved target branch: a candidate that is
behind a moving target is not a closing state, and green checks on it do not
establish the integrated result. Prevent two cleanup agents from paying
the same debt concurrently (claim debts in the ledger before paying). A
pacing ceiling limits SIMULTANEOUS work, not TOTAL work. Protocol:
[references/persistence-and-continuation.md](references/persistence-and-continuation.md).
When more than one agent participates, use the unified isolation, operation,
routing, and integration contract in
[references/concurrent-remediation.md](references/concurrent-remediation.md).
**Multi-writer admission gate:** before the first repository mutation, prove
that the modifying agent owns a distinct worktree and branch. A bare invocation
never authorizes a worker to write directly in a shared integration worktree.
Only the recorded integrator may mutate the target ref, and only inside the
short fenced-lease + compare-and-swap window. If an unexpected commit appears
on the integration branch, freeze writers, preserve the object, rebind and
review its provenance/diff before integrating or pushing; “keep the remote up
to date” never means publish an object the integrator has not accepted.

When a harness supports persistent goal state and the close is likely to span
turns, the operator may seed it with
[templates/orchestration-goal.md](templates/orchestration-goal.md). The
template is optional, non-authoritative orchestration state: bare invocation
still starts the complete procedure, the goal never proves CLEAN, should not be
committed unless repository policy designates it, and never widens this skill's
scope or hard boundaries.

## Authority contract

- User instructions, operator policy, and repository policy govern the target
  state — in that order. Repository policy defines procedure and topology; it
  cannot widen scope to another repository, environment, or person's work.
- Invoking `$mister-clean` grants standing authority for the closeout
  procedures in [references/authorization-and-modes.md](references/authorization-and-modes.md):
  scoped edits and repairs, recoverable cleanup, applicable tests and
  formatters, documentation and handoff repair, commits, current-branch push,
  CI observation, and safe reconciliation of task-owned branches, worktrees,
  stashes, temporary files, and processes.
- Standing authority removes permission theater; it does **not** remove
  target verification. Recheck volatile targets immediately before push,
  deletion, worktree removal, or process signaling.
- Never cross the hard boundaries: unrecoverable destruction, force-push or
  history rewrite, security-control bypass, secret exposure, another owner’s live work, unrelated repositories or environments, production deployment,
  or effects on non-consenting third parties. Never bypass enforcement
  (`--no-verify` never): a blocking gate is right until proven otherwise, and
  a defective gate is a finding fixed through governed change.
- **Concurrency is not an automatic off-ramp.** Inspect it, identify
  ownership, coordinate or integrate safely when possible; stop only when
  safe resolution genuinely requires external coordination — and that stop is
  `decision_or_coordination_required`, which is never CLEAN.
- **External repositories are not automatically mutable** merely because this
  one imports them: bind their version and state, detect material drift, and
  modify them only when the invocation's scope includes them.
- If one item hits a hard boundary, do everything else and report only that
  blocked residue.
- Establish only the exact claims supported by named evidence. "Ready for
  handoff" is not a synonym for "deployed," "CI green," or "independently
  accepted."

## Select a mode

| Mode | Trigger | Behavior |
|---|---|---|
| `CLOSE` | Bare `$mister-clean`, "finish cleanup," "close this out," "make this handoff-ready" | Default. Execute the complete closeout loop. |
| `CLEAN` | A specifically bounded cleanup request | Execute that cleanup plus the checks and reconciliation needed to leave it stable. |
| `CONFORM` | Normalize a named historical or generated corpus | Provenance-preserving migration per [references/conformance-and-provenance.md](references/conformance-and-provenance.md). |
| `GUARD` | `$mister-clean guard`, "clean this candidate before commit," or Mister Clean assigned inside an implementation pod | Gate one staged candidate tree through DEV, QA, authorized Mister Clean repair, and independent holdout before any accepted ref advances. Read [references/continuous-clean-development.md](references/continuous-clean-development.md). |
| `AUDIT` | The user explicitly says audit, review, inspect only, or make no changes | Read-only evidence and recommendations. |

Do not downgrade a bare invocation to AUDIT because the request is short. The
skill name is the request.

In `GUARD`, the immutable staged tree object is the review unit. Any byte change
creates a new tree and expires every receipt for the prior tree. Mister Clean
retains repair authority, but it never becomes the sole verifier of its own
repair. The integrator creates or advances a commit/ref only after DEV, QA,
Mister Clean, holdout, deterministic gates, and the no-harm comparator bind the
same tree. For long campaigns that rotate models, harnesses, reasoning levels,
roles, and task difficulty, read
[evals/rotation-campaign.md](evals/rotation-campaign.md).

## Fast route

1. Freeze the live Git, worktree, process, planning, request, and applicable
   hygiene-comparator baseline.
2. Discover the repository's actual procedure graph and acceptance criteria.
3. Start the schema-1.2 coordination transaction and empty incremental action
   ledger; pass the multi-writer admission gate before any mutation; register
   task boundaries and operation parents only as work becomes concrete. Do not
   pre-plan the whole close.
4. Pay executable debt before conformance and cosmetic cleanup; after each
   atomic action, rerun its comparators and repair or safely roll back every
   introduced regression before the next action.
5. Integrate the current target and rerun every affected established gate.
6. Produce the committed current-state/handoff surface a fresh clone needs.
7. Run independent final review; pay its in-scope findings; re-audit.
8. Build and live-validate one colocated closure bundle against the subject.
9. Return CLEAN only when that bundle passes; otherwise return precise NOT CLEAN.

## The verdict model

The headline verdict is **CLEAN or NOT CLEAN**, and it is gated on completion
debt: **payable debt left unpaid without a recorded operator ruling forces
NOT CLEAN**, whatever else was polished. Beneath the headline, keep five
dimensions separate — each `satisfied`, `open`, `blocked`, `not_assessed`, or
`not_applicable`, with evidence (`not_assessed` beats an unsupported claim):

1. `completion_debt` — required procedure steps and their *executed* state.
2. `repository_state` — worktree, branch, stash, dirty-state, ownership facts.
3. `planning_integrity` — artifact relationships, lifecycle metadata, validators.
4. `verification` — checks run, their inputs, measured object, and conclusions.
5. `handoff_readiness` — can a successor execute without excavation? This is
   the no-handoff test, and it is the *standard*, not an afterthought.

A blocked (not payable) debt does not hold unrelated reversible cleanup
hostage — but it caps the recommendation at `proceed_with_conditions`, with
the condition and owner explicit. **A debt mid-payment is still `open`: the
report states the instant, not the trajectory** — a dispatched fix with a
named re-verifier is honest progress and still not CLEAN.

**Acceptance-criterion gate.** When the operator set an EXPLICIT acceptance
criterion, the report carries it in `acceptance_criteria` (each `{id, source,
met}`, optional `waiver{actor,ref}`). A CLEAN/positive verdict is INVALID while
any criterion is `met: false` unless an explicit **operator** waiver is
recorded — an independent reviewer may not downgrade an operator criterion to a
non-blocking nuance, and a reviewer-authored waiver of an operator criterion
does not count (verification-doctrine §17). Reviewer-reported stale docs/comments
are payable regardless of severity label — never `accepted_exception`, never a
residual.

**Second verdict gate — successor readiness.** Tidiness and durable evidence
are not closure. The close also fails while any of these hold: projections of
the same fact disagree (lane vs frontmatter vs body vs parent tables vs
grandparent counts); a completed artifact still carries unfinished current
markers; a start-here/READY directive is stale against the closing snapshot;
a dirty or unmerged worktree lacks an owner and candidate SHA; a declared
current-state index is missing or its generator is broken or harness-bound;
a fresh clone cannot reach something the handoff relies on. Full contract:
[references/successor-readiness.md](references/successor-readiness.md).

## Closeout loop

### 1. Bind scope and target state

**Freeze a start snapshot first**: timestamp, HEAD, all branches, upstream
divergence, EVERY worktree (not just the current checkout), stashes,
staged/unstaged, nonignored untracked. You will rebind this snapshot before
declaring completion; findings are labeled by snapshot if state moves.
Classify what you see into the four truth classes (committed / ignored-local
/ imported-external / runtime-observed) and never report one as another.
Map every dirty or unmerged worktree to owner + branch + candidate SHA +
disposition — unmapped is a blocking finding, and a clean primary checkout
never speaks for the others.

**A worktree's existence is not evidence of a live owner.** Classify each
noncurrent lane `active`, `parked`, `stale`, or `unknown` from durable
claims/checkpoints, current session or process evidence, and observed
progress. A parked or stale lane cannot own completion debt indefinitely: if
it is in scope, preserve its unique commits and reconcile them into the
current target through repository policy. Serialize/coordinate with a proven
active owner. Use `decision_or_coordination_required` only when ownership is
still unknown after investigation or a live owner cannot safely coordinate;
never use "another worktree owns it" as an off-ramp without live-owner
evidence.

Identify the repository, branch and commit, applicable policy, the
**procedure graph** (what this system declares as paired or
mandatory-sequential — cite every edge to policy, tracker workflow, or
operator instruction; never invent DEV/QA, review, or holdout pairings),
task-owned resources, active workers, validators, and any handoff contract.
Full detection procedure, with generic file-based and externally managed
examples: [references/situational-awareness.md](references/situational-awareness.md).

Derive targets in this order: **operator ruling → repository policy →
evidence.** Do not assume a healthy repository has one branch, one worktree,
no stashes, or a branch named `main` — release branches and multi-agent
worktrees are legitimate where policy says so. Absent any policy, the
conservative default topology at close is: primary branch + at most one
working branch, one worktree, zero stashes, zero dirty/untracked, in sync.

**Verify your own instruments first.** The closeout's tools run in a harness
it did not build; a shadowed alias or hung search reads exactly like a slow
repo and a silent agent. Normalize discovery tools, time-bound probes, and
distinguish repo-slowness from tool-shadowing from harness-latency before
trusting any probe or its silence:
[references/tool-liveness.md](references/tool-liveness.md).

**Bind the repository-native toolchain before any install or helper script.**
Infer the canonical package manager and runtime from operator/repository
policy, `packageManager`, lockfiles, workspace configuration, and established
runners. Use that manager; never create a competing lockfile as a side effect
of closeout. Prefer already-present repository-native or verified OS tools for
simple inspection. Do not invoke Python or another auxiliary/retiring runtime
merely to resolve a path, parse text, or enumerate files when the repository's
runtime, `realpath`/`pwd -P`, `rg`, or an existing script can do it. If the
current work removes a runtime, using it is permitted only when a still-live
validation contract requires it; scope and record that use. Convenience is
not a requirement.

**The successor rule:** the next team's systems may differ entirely. Your
validators will not travel — the artifact pattern must carry the standard by
itself. Optimize every decision for a reader with none of your tooling.

### 2. Measure — debt first, because it gates everything else

**Completion debt** (per [references/completion-debt.md](references/completion-debt.md)):
every cited procedure with an executed early step and an unexecuted later
step. Artifact existence is not execution — a QA slice *file* does not
establish a review verdict; a workflow *file* does not establish a run.
Classify each: `satisfied` / `open` (payable now) / `blocked` (named
dependency, named owner) / `deferred` (durable operator ruling, recorded **on
the artifact**) / `not_assessed`.

**Repository state:** branches (local, remote, orphaned tracking refs),
worktrees and their owners, stashes, dirty/untracked, sync, tracked
absolute-path symlinks, in-progress operations (use
`git rev-parse --verify MERGE_HEAD`, never `.git`-path file tests — `.git`
is a file in linked worktrees), and repo-holding processes with ages.

**Projection coherence (successor-readiness §2):** for every planning
artifact, the physical lane, YAML frontmatter, body status blocks, parent
(story) tables, and grandparent (epic) tables/counts must agree — measure
disagreements across EVERY lane including done, backlog, and archived, and
treat hand-maintained rollups as stale until proven derived. Measure
finalization of completed artifacts (unchecked acceptance boxes, PENDING
approvals, unassigned fields, stale body blocks, broken evidence paths — in
done records these are defects, not template history). Check temporal sanity
(created ≤ claimed ≤ updated ≤ verdict). Measure cascade debt: parents whose
children are all done but whose own acceptance step has not EXECUTED — this
is open payable debt and THE SKILL'S JOB IS TO PAY IT — dispatch reviews
continuously within the operator's pacing ceiling until paid; the queue
orders the payment, never excuses stopping; only a named hard-boundary
blocker or operator interrupt stops short, recorded as NOT CLEAN; pre-execution parents (DRAFT-class) with started children;
supersession applied to part of a graph. Verify current-state surfaces: the
declared status index EXISTS, its generator's input paths and glob patterns
match reality and are harness-neutral; every start-here/READY/dispatch
directive's baseline SHAs and path preflights match the live tree (stale →
retire with a top banner, never leave executable-looking); every reference
from a live artifact resolves (guides, north stars, renamed stories).
Classify every evidence reference per the §5 vocabulary.

Run `mister-clean audit planning <repository> --json` before reasoning from
parent status. Its executable graph audit parses Markdown/MDX YAML frontmatter
and top-level JSON/YAML objects; discovers planning directories plus exact
canonical files (`ROADMAP`, `STATUS`, `PLAN`, `TASKS`, `BACKLOG`, `CURRENT`)
without promoting an entire generic docs directory; derives readiness from
exact direct-child IDs;
compares lane, current-body, and parent-table projections; groups duplicate
projections only when they share a proven acceptance identity; retains every
raw observation while grouping payable work into causally evidenced root
debts; and fails closed on malformed
structured input, unsupported lifecycle or gate states, contradictory or
unresolved parentage, unproved archive classifications, missing gates after
completed children, and unexecuted or failed acceptance. A nonzero result is
not automatically one debt per row: any raw finding forbids CLEAN until
triaged, while each payable completion debt is one independently repairable
cause with a `cause_key`, bound snapshot, impacted raw-finding IDs, affected
paths, and repair boundary. Cross-artifact clustering requires a shared
remedial record or a connected artifact component violating the same
invariant; otherwise observations remain separate. Report raw-finding and
root-debt cardinalities explicitly. The audit is a conservative floor,
not a claim that arbitrary repository-specific schemas were understood; run
their validators and inspect any system the gate cannot structurally infer.
Every planning item must be structurally placed in one verified lifecycle and
relationship graph or explicitly classified as non-artifact guidance. A leaf
task/slice has exactly one parent unless it declares `top_level: true`; a
parent whose children are complete has an explicit acceptance gate even when
the parent already says done. `not_applicable` is a gate state, not silence,
and requires a structured rationale. A `guidance`, `template`, `schema`,
`reference`, or `non_artifact` label also requires a rationale and is invalid
if the file contains lifecycle, identity, relationship, child-table, or
acceptance signals — classification never suppresses live planning debt.
Relationship-bearing surfaces must declare or inherit one semantic role:
ordinary work artifacts use `child_parentage`, while `index`, `status_index`,
and `rollup` artifacts use `rollup_projection`. Parentage creates graph edges;
rollups resolve each exact target and reconcile its projected state without
becoming another parent. Repository-specific overrides use
`relationship_role: child_parentage|rollup_projection` and must include
`relationship_role_rationale`; built-in hierarchy and rollup types cannot be
relabelled. Canonical rollup target columns are recognized directly. A custom
column requires `rollup_target_column` plus
`rollup_target_column_rationale`; custom parent-table columns use
`child_target_column` plus `child_target_column_rationale`. A state-bearing
relationship table without a recognized or declared target column fails
closed. Ambiguous identities, missing targets, stale rollup states, unknown
roles, and unexplained overrides are payable debt.
Markdown rows and structured relationship collections are entry-total: every
entry resolves to one identity, every supplied state is recognized, and every
projection agrees. Snake/camel/Pascal key styles map to the same schema. A
hierarchy artifact may classify a genuine checklist or decision-table target
column with `non_relationship_table_columns` and
`non_relationship_table_rationale`; rollups and canonical relationship or
lifecycle columns cannot be suppressed this way. A parent marked done while
any direct child is not done is contradictory payable debt regardless of a
passing acceptance label.
Every declared singular artifact type, identity, lifecycle, role, target,
rationale, or `top_level` alias contains one nonempty scalar, and equivalent
aliases reconcile to one value. Inference and defaults apply only when the
corresponding alias is absent. Duplicate JSON keys, unsupported state-like
aliases, and compound lifecycle prose fail closed. Own identity comes only
from the role-specific `<type>_id` or generic `id`; a parent's ID never becomes
the child's fallback identity. Singular/plural and snake/camel/Pascal
child-parent aliases are entry-total. Lifecycle carried by a parent-reference
object must agree with the resolved parent. Acceptance discovery traverses
supported structured scopes and parent relations recursively; every declared
outcome scope is validated, and a `not_applicable` rationale authorizes only
its own scope. Structured JSON/YAML is not rescanned as prose. Markdown code
fences and HTML comments are inert examples, while visible heading and
blockquote status labels, acceptance labels, and pending review language remain
current projections. Unchecked items in a completed artifact are current
**unfinished-completion markers**: they are payable finalization debt, but they
do not invent a second acceptance execution when stronger gate evidence exists.
Nested canonical work
declarations and absent/custom-type hierarchy aliases must reconcile or fail;
they never disappear inside generic metadata or a non-artifact label.
Unsupported, binary, special, and symlinked entries in a discovered planning
root are part of the census, not invisible debris. The standalone audit fails
them closed; CLEAN bundle validation requires every live entry and permits an
unsupported regular file only as an explicitly reasoned non-artifact.

**Planning integrity:** census against the schema; pairing parity
(artifact-level); parentage using the schema's *actual* fields (verify the
field name on a sample first); coverage with recorded deferrals; vocabulary
conformance; **partition completeness** — the counts for all explicit states,
exceptions, and lifecycle classes must sum to the full corpus, and any
unclassified remainder fails even when the validator exits zero; **ground
truth** — lifecycle metadata reconciled against git
facts, because *lane metadata is an assertion; git state is a fact; when they
disagree, the metadata is what's wrong*; terminal-state honesty — never
fabricate a terminal state to clear a lane.

**Code hygiene (ten dimensions + ratchet):** navigation entropy is a
first-class closeout defect. Inspect all ten dimensions of
[references/code-hygiene-rubric.md](references/code-hygiene-rubric.md) —
discoverability, structure, naming, boundaries, dead/duplicate, docs, tests,
generated artifacts, config/dependencies, ownership/custody. Each ends
CLEAN-inspected or with paid/dispositioned findings; no scores, no
partial-inspection-to-clean. Deletion requires the rubric's absence-proof
obligations; skipped tests require owner + exit condition; lockfiles are
never hand-edited; findings use the evidence-bound envelope; and every
repaired SYSTEMIC defect triggers the GATE ratchet (rubric §9): enforce the
invariant through an established runner with a negative control, or record
why not.

**File placement:** walk proportionally to risk and change surface. Of each
inspected directory: can its purpose be stated in one line, and does
everything in it serve that purpose? Naked documents outside their
consolidated home, misfiled planning artifacts, machine-specific leaks,
generated-vs-source separation, entry-point docs current **at the stated
commit**, and every test suite reachable from a named runner — a suite
nobody runs is not a control.

### 3. Record the execution ledger

Resolve `MISTER_CLEAN_ROOT` to the directory containing **this installed
`SKILL.md`**. Validator paths are always relative to that root, never the
target repository's current directory. Create this collision-free layout in
the target repository's established evidence home (which may be ignored-local
when a fresh clone does not need the proof files):

```text
<evidence-home>/mister-clean/<run-id>/
  action-manifest.json
  closeout-report.json
  closure-bundle.json
  criteria-source.json
  gate-*.json
  debris-census.json
  independent-review.json
```

Copy [assets/action-manifest.json](assets/action-manifest.json) into that
directory. It intentionally starts with `actions: []`. Add each material
action immediately before or when it becomes concrete; do not predict the
entire repair program before beginning. Validate only the incremental ledger
at this stage:

Prefer the bounded initializer when available; it creates the layout and
records the live Git/topology/planning census while making **no CLEAN claim**:

```bash
node "$MISTER_CLEAN_ROOT/bin/mister-clean.js" prepare \
  --repo "<live-checkout-root>" --evidence-home "<evidence-home>" \
  --run-id "<run-id>" --request-ref "<invocation-ref>" \
  --request-text "<exact operative invocation text>" \
  --criterion "<criterion-id>"
```

Repeat `--criterion` for every explicit criterion. Capture the exact operative
invocation at initialization with `--request-text`; if a durable exact-byte
source already exists, use `--request-source` instead. Omit both only for an
audit or interim NOT CLEAN scaffold: that records `reference_only` and can
never establish CLEAN. Independent review must examine the extracted criteria
set before close.

```bash
node "$MISTER_CLEAN_ROOT/bin/mister-clean.js" validate manifest \
  "<evidence-home>/mister-clean/<run-id>/action-manifest.json"
```

The manifest is an execution ledger, not an approval request. Classify every
action `reversible_local` / `consequential_external` / `unrecoverable` —
the last is outside this skill. The `kind` vocabulary is CLOSED and enforced
by the validator: `agent_dispatch`, `acceptance_execute`, `local_edit`, `local_move`,
`recoverable_delete`, `format`, `lint`, `test`, `build`, `generate`,
`doc_update`, `planning_record_update`, `git_commit`, `git_integrate`, `git_push`,
`stash_preserve`, `stash_drop`, `branch_delete_local`,
`branch_delete_remote`, `worktree_remove`, `process_signal`,
`tracker_write`, `historical_conform`, `handoff_update`. Do not invent kinds;
do not pause after validation. Execute. Schema 1.2 makes
`coordination.lanes` the task-boundary/custody registry and `actions` the
append-only operation DAG: each action names its lane, task, prior operations,
before/after objects, and record time. The validator binds every local mutation
to its lane's write set and versioned coordination-domain claims, requires a
digest-bound cwd/HEAD/branch bootstrap,
requires an exact atomic projection transaction for `planning_record_update`,
and rejects `git_push` unless its direct candidate-producing parent, frozen
writers, clean tree, review, zero-known-failure validation, no-harm proof, and
fresh remote compare-and-swap observation all agree. `git_integrate`
additionally records the short lease, fencing token, target compare-and-swap,
and an invariant-level CAS for every domain the source plan read or wrote.
GUARD manifests add the exact-tree four-role commit barrier. Schemas 1.0 and
1.1 are legacy-readable only; start new runs on 1.2. Full contract:
[references/concurrent-remediation.md](references/concurrent-remediation.md).
Keep the report's action rows exactly
equal to this canonical ledger; the live bundle rejects merely matching IDs.

### 4. Finish, conform, clean — in that order

- **Isolate before dispatching modifying delegates:** each gets a unique
  preallocated worktree + branch from a recorded baseline, an authorized path
  set, versioned coordination-domain claims (semantic conflict keys), and a bootstrap that proves cwd/HEAD/branch
  before edits; reject dispatch on path or invariant overlap with a live
  writer. Name one dispatcher and one active integration writer. `branch off
  main` without a worktree is not isolation. Worktree mechanics:
  [references/write-lane-isolation.md](references/write-lane-isolation.md).
  Unified routing, operation-accounting, local-inference, and integration
  contract: [references/concurrent-remediation.md](references/concurrent-remediation.md).
- **Finish:** pay every `open` debt through the system's own mechanism,
  honoring actual separation-of-duty rules — never self-certify a pair you
  implemented. The dispatch mechanism is paradigm-relative: in-session
  subagents or externally orchestrated visible agents are equally sanctioned;
  the environment's orchestration rules decide, and a GENUINE conflict
  between requirement and environment is the one case that asks the user
  (see authorization-and-modes.md, Dispatch mechanism).
  **Silent is not dead — and the inbox is part of the instrument.** Observed
  silence has three causes: the agent is still working, the agent died, or
  the agent FINISHED and delivery lagged (field-proven: a completed review
  read as two check-ins of silence). A dispatched agent silent past a stated
  decision point gets a fresh, independent replacement (told not to seek or
  trust the original's output) while the original is stood down with an
  invitation to return partial evidence. If both return, reconcile
  explicitly — divergence between independent reviews is itself a finding,
  never noise to average away. Prefer paying debt over cosmetic cleanup. A debt that cannot
  be paid is escalated NOW and its deferral recorded on the artifact, so the
  next team reads a decision, not an accident.
- **Repair (code hygiene):** pay hygiene findings with the smallest coherent
  repair (rubric §2); prove absence before deletion (§3); dedupe shared
  change-reason, not syntax; behavior-affecting repairs get independent QA;
  systemic repairs ratchet into established-runner enforcement (§9).
- **Conform (successor-readiness):** finalize every done-lane artifact
  (resolve or disposition its unfinished markers; normalize operational
  headers after amendments; label history sections as history); regenerate
  parent/grandparent projections as DERIVED outputs; create the claimable,
  owned next-step work orders for every completed-children parent; archive
  superseded graphs as complete units with tombstones and successor pointers
  at every layer; retire expired dispatches/audits/readiness docs with
  top-of-file banners; produce or repair the harness-neutral CURRENT-STATE
  artifact; write the cleanup receipt (start+end snapshots, validations,
  changes, archived items, evidence classes retained, reserved decisions,
  next owner + next safe action).
- **Conform:** normalize current artifacts to the canonical form; migrate
  historical planning artifacts under the migration contract (digests,
  mechanical-vs-judgment classification, rollback); treat evidence, verdicts,
  and receipts as immutable — amend, never rewrite. Correct structure toward
  truth: a lane, folder, or location that disagrees with ground truth is
  what's wrong, and if a convention mandates the disagreement, the
  convention is the finding.
- **Clean:** preserve before delete (state-match, not existence); re-verify
  at the moment of action, not from an earlier snapshot; never
  `git reset --hard` (branch + stash + `--mixed`); prove process ownership by
  parent chain, re-verified in the same execution as the signal — and stop a
  task-owned process only when it blocks validation, holds a resource
  closeout must release, or policy requires shutdown. Ownership alone is not a reason to terminate it. Every removal enters the debris ledger with its
  safety proof and preservation location.

### 5. Verify and synchronize

Read [references/verification-and-claims.md](references/verification-and-claims.md)
before reporting any test, gate, CI, deployment, or review — the same-object
rule and claim-evidence kinds live there; the incident-backed
principles behind them live in
[references/verification-doctrine.md](references/verification-doctrine.md).

Run the complete applicable local validation set from documented runners,
then re-run in an isolated clone — a working tree satisfies gates with
ignored, machine-local inputs; state exactly what the isolated check
established. Treat every validation result as a tuple of expected exit/status,
semantic outcome, and complete coverage: `exit 0` cannot overrule warnings,
reported debt, unexpected statuses, skipped items, or unequal verified/total
counts. Advisory checks may inform cleanup but never establish CLEAN. Bounded
positive controls when repairing important gates: a gate
that cannot fail is indistinguishable from an absent one. For CI, check run
**conclusions on the measured commit** — wiring is not execution.

Before final verification, resolve the target branch again and measure its
relationship to the closing candidate from their merge base. Integration is a
mutex-plus-compare-and-swap action: acquire the target ref's short lease with a
fresh fencing token, record the expected target object, re-resolve it at the
mutation boundary, and reject/rebind rather than applying when it moved. Never
hold the lease during implementation, agent waits, or long validation.
Integrate candidates sequentially through the one active integration worktree.
After each accepted candidate run focused checks; at the wave barrier rerun the
full affected suite and same-detector no-harm delta on the combined object. The
final candidate must contain the current target's reachable state;
a two-tip `target..candidate` diff on diverged histories is not an owned-change
inventory and must never be used to approve apparent deletions. Prove the
integrated tree itself accounts for every target-only path and contains only
intended closeout changes; any removal needs its ordinary ownership and
absence proof.

Commit the intended state with a clear message. Push the current branch to
its configured remote unless policy forbids it, rechecking branch, remote,
and commit immediately before pushing. Observe established CI; do not rename
local execution "CI."

### 6. Stress-test the handoff, then report in the past tense

From durable artifacts alone, confirm a newcomer can find: entry points and
how to run; the current branch or delivered change; decisions and
constraints; validation commands and results; genuine residual work with
owner and next action.

Validate a filled [assets/closeout-report.json](assets/closeout-report.json)
and [assets/action-manifest.json](assets/action-manifest.json), then bind both
through [assets/closure-bundle.json](assets/closure-bundle.json). Do this
**after** the final subject commit, target observation, current-state artifact,
planning census, topology census, gate records, debris census, and independent
review exist:

```bash
node "$MISTER_CLEAN_ROOT/bin/mister-clean.js" validate manifest \
  "<bundle-dir>/action-manifest.json"
node "$MISTER_CLEAN_ROOT/bin/mister-clean.js" validate bundle \
  "<bundle-dir>/closure-bundle.json" --repo "<live-checkout-root>"
```

**The evidence freeze is the last state transition, not an early receipt.** Any
repository mutation after a report, review, census, target observation, or
bundle was produced invalidates every commit-bound projection of that evidence.
Regenerate and rebind them to the new subject, then rerun live bundle validation
before reporting. This applies equally to `NOT CLEAN`: unresolved debt may be
honest, but stale HEADs, digests, topology, review identity, or action-ledger
coverage are not. Never append a late commit only to the action manifest while
leaving the report and bundle bound to its parent.

The primary JSON files and every referenced proof record remain colocated.
Repository identity in the durable records is portable (`repo.id` + subject
commit), never a machine-specific absolute path; `--repo` supplies the live
checkout only during validation. `custody.mode: sidecar` binds a clean live
HEAD to the subject without a self-referential commit. Receipt-commit custody
is deliberately unsupported: embedding a receipt's own commit identity creates
a circular proof and makes target/topology binding ambiguous. A fresh clone
must never depend
on ignored/sidecar proof files to operate; committed current-state and handoff
surfaces carry the operational truth.

Current-state discovery is tri-state: `missing` and `candidate_unverified`
are honest, payable states during the run; only `designated` may establish
CLEAN. Never silently promote a generic README. A designated surface binds
its path, digest, subject commit, and repository/operator designation through
`mister-clean.current-state-designation` evidence.

The package's own template self-check is separate and never a closeout gate:

```bash
node "$MISTER_CLEAN_ROOT/bin/mister-clean.js" validate bundle \
  "$MISTER_CLEAN_ROOT/assets/closure-bundle.json" --template --structural
```

The validator enforces TYPED evidence
(learned by failing it in the field): claim evidence entries are objects —
`git_commit{commit}`, `remote_ref_resolution{remote,ref,commit,observed_at}`,
`established_ci{provider,run_id,commit,conclusion}`,
`independent_qa_verdict{conclusion,reviewer,implementer,verdict_ref}` — every
debt carries an `id`, and every `deferred` debt carries a full
`ruling{actor,date,reason,next_owner,ref}`. **A CONDITIONAL verdict does not
establish `independently_qa_accepted`** — the validator refuses it, and it is
right: conditional is not acceptance. Store it (avoid inventing a parallel reporting
system), and render the human report from
[templates/hygiene-report.md](templates/hygiene-report.md) or
[templates/session-close-report.md](templates/session-close-report.md). A
filled public-safe example: [examples/example-report.md](examples/example-report.md).

The end bundle also reconciles the full start-commit → subject-commit Git diff
against the canonical action ledger. Every changed path maps to a concrete
executed action; an empty ledger is valid only when the two commits have no
material diff. A preexisting or concurrent change adopted into the subject is
still an integration action, not an exclusion. Action and satisfied-
debt outcomes require allowlisted, time-bound execution records, not prose.
Reviewer/implementer labels are normalized and their harness/session/receipt
identities must be distinct. A local bundle may live-resolve Git commits and
remote refs, but it cannot promote local assertions into established CI,
deployment, or independent-QA claims without a configured trusted adapter;
keep those claims `not_established` or policy-bound `not_applicable`.

The report additionally binds `regression-delta.json`. Its baseline and closing
objects must match the bundle snapshots; its action-check IDs must cover the
executed action ledger; its counts distinguish baseline debt, newly discovered
pre-existing debt, concurrent external debt, and debt introduced by this run.
A closed action check requires `open_at_boundary: 0`; CLEAN additionally
requires `introduced_by_run_open: 0`. A ratio is telemetry for diagnosing a
bad strategy, never an acceptance threshold.

**Trust boundary.** These validators prevent accidental false closure by a
cooperating agent; they are not a cryptographic defense against an actor that
can rewrite both evidence and validator code. Local execution records prove
schema, digest, time, object, and cross-artifact agreement. Claims that require
an external authority remain unestablished without a trusted adapter. Do not
inflate ordinary repository closeout into hardware attestation or an
unobtainable independent trust root.

**Optional state instrument.** When a visual overview materially helps an
operator see convergence across Git, planning, code, validation, completion
debt, and successor readiness, copy
[assets/codebase-state-dashboard/index.html](assets/codebase-state-dashboard/index.html)
with its adjacent `dashboard-tokens.css`, then replace only the embedded
`MISTER_CLEAN_DASHBOARD_STATE` snapshot and evidence-bound narrative. The
instrument preferences token-driven animated data visualizations and includes
a reduced-motion path. It is a **derived projection, never a proof surface or
prerequisite**: it does not establish CLEAN, authorize an action, replace the
machine closeout report, or excuse paying debt. If it disagrees with the
repository or report, it is stale debt and must be regenerated or removed.

Do not return a proposed plan when executable work remained. A valid result
is changed repository state plus evidence, or a precise hard-boundary report
after every independent action has been completed.

An honest `NOT CLEAN` report does not wait for a passing CLEAN bundle. The
bundle validator accepts evidenced unresolved dimensions, gates, review
findings, stashes, and blockers when the report verdict is NOT CLEAN; the
zero-debt/passing-state requirements activate only for CLEAN.

## Red flags — thoughts that mean you are about to fail

| Thought | Reality |
|---|---|
| "The DEV is done; QA can wait for the next team" | Half-executed procedure — the dirtiest close state. Pay it, or record the operator's deferral on the artifact. |
| "I'll list the unrun review as a residual" | Residuals are for blocked items with named owners — not payable work. |
| "Status says Ready for QA — dispatch QA" | Metadata is an assertion. Is there a branch? A verdict anchor? Reconcile against git first. |
| "The branch is merged, safe to delete" | Merged ≠ preserved. Prove 0-ahead AND state-match at deletion time. |
| "Gates are green, we're clean" | Green *where*, measuring *what object*? Isolated-clone and CI conclusions or it is a machine-local fact. |
| "CI exists, so the gates run" | Wiring is not execution. Check run conclusions on the measured commit. |
| "That old artifact shipped — no point fixing its format" | A future agent may imitate it. Normalize under the migration contract; never rewrite evidence. |
| "Kill it, the process name matches" | Pattern is not ownership. Walk the chain; and ownership alone still isn't a reason. |
| "The suite has 400 tests, it's covered" | Reachable by which runner? A suite nobody executes is documentation of an intention. |
| "It's probably dead code, delete it" | Prove absence through all seven channels (static, dynamic, generators, tests, deploy, docs, exports) first. |
| "These two blocks look the same, merge them" | Dedupe shared change-reason, not similar syntax. Rule of three. |
| "Skip that flaky test for now" | Skipped without owner + exit condition is deferred debt in disguise. |
| "I fixed it everywhere, done" | A repaired systemic defect without its ratchet gate returns. Enforce via an established runner + negative control, or record why not. |
| "The probe is taking a while, the repo must be big" | Or the tool is shadowed/hung. Time-bound it; `type -a` the tool; prefer rg / absolute binary. |
| "The repo has `pnpm-lock.yaml`, but `npm install` is convenient" | Bind the canonical manager first. A second manager or lockfile is new debt created by cleanup. |
| "I'll use Python for this tiny path/text probe" | Use the repository-native runtime or verified OS tool. A retiring runtime is allowed only for a still-live validation contract, not convenience. |
| "I should repeat bootstrap and reread the same file once more" | If no state or evidence changed, this is an analysis loop. Name the exact next action and execute the largest safe increment; never invent a result. |
| "That worktree exists, so it owns the debt" | Existence is topology, not custody. Prove a live owner; otherwise preserve and reconcile parked/stale work instead of handing debt forward. |
| "The report says NOT CLEAN, so its old commit is harmless" | Verdict honesty does not cure stale evidence. Any late mutation invalidates every commit-bound projection; rebind the whole bundle and rerun live validation. |
| "The agent went quiet, it's still working" | Three causes: working, dead, or tool-hung. A hung probe reads as all three. Replace with the NORMALIZED mechanism, not the same one. |
| "It's just a hung search, kill it / leave it" | Inspect what it holds (locks, FDs, children) first; reap on ownership+purpose+preserved-result, never on age or process kind. |
| "Dispatch both devs, they'll branch off main" | Shared checkout = mixed uncommitted work + cross-lane commits. Preallocate a worktree per modifying delegate. |
| "I fixed the gate, ship it" | You cannot certify your own enforcement change — the independent review is completion debt. |
| "One debt is blocked, so stop everything" | Blocked debt caps the recommendation; it does not hold unrelated reversible cleanup hostage. |
| "This repo should look like the last one" | Targets come from operator ruling → policy → evidence. Release branches and agent worktrees are legitimate where policy says so. |
| "Gates are green, so planning is coherent" | Syntax and provenance gates do not prove takeover coherence. Run the successor-readiness gate; projections must agree. |
| "The body text is just template history" | In a DONE artifact, unchecked boxes and PENDING fields assert non-performance beside a verdict. Finalize or disposition. |
| "The parent says DRAFT, whatever" | A pre-execution parent with started children is a contradiction, not a style choice. |
| "The dispatch is old but harmless" | An executable-looking directive with an expired baseline is a trap. Retire it with a top banner before its content. |
| "My checkout is clean, ship the receipt" | The OTHER worktrees are the question. Every dirty/unmerged one needs owner + candidate SHA + disposition. |
| "The closeout branch is green; main can catch up afterward" | A stale candidate is not the closing state. Incorporate the current target, inspect the merge-base delta, and revalidate the integrated tree. |
| "The cleanup script said removed" | A wrapper's `|| echo` exit is not the action's. Capture the action's own status and verify the postcondition from fresh ground truth. |
| "The status index is generated by the hook" | Generated by WHOSE hook? A one-harness generator is a broken dependency for every other successor. |
| "I fixed ten issues and created only one" | One cleanup-created regression is still harm. Keep the repair atomic: pay it or safely roll back before crossing the action boundary. Net improvement never purchases permission to leave new debt. |
| "The new census is larger, so cleanup made things worse" | Maybe — or the detector exposed old debt, its scope leaked into fixtures, or another writer changed the subject. Compare the same object with the same detector, then classify every delta before acting. |
| "I'll commit it so QA has a SHA to review" | The staged tree already has an immutable identity. Bind every role receipt to `git write-tree`; advance an accepted ref only after the exact-tree barrier passes. |

## Progressive references

- [references/authorization-and-modes.md](references/authorization-and-modes.md) — before any write or external action.
- [references/completion-debt.md](references/completion-debt.md) — multi-step procedures, debt states, deferral rules.
- [references/code-hygiene-rubric.md](references/code-hygiene-rubric.md) — ten hygiene dimensions, absence proofs, evidence-bound findings, the GATE ratchet.
- [references/no-harm-and-debt-delta.md](references/no-harm-and-debt-delta.md) — per-action no-harm boundary, debt-origin classification, detector-change controls, and the regression-delta record.
- [references/stack-adapters.md](references/stack-adapters.md) — ecosystem-specific debris/boundary checks, loaded via `mister-clean detect stack`.
- [references/persistence-and-continuation.md](references/persistence-and-continuation.md) — checkpoints, resume/rebind, the debt-ledger mutex.
- [references/tool-liveness.md](references/tool-liveness.md) — normalize/verify discovery tools, time-bound probes, replace stalled agents without repeating the mechanism.
- [references/write-lane-isolation.md](references/write-lane-isolation.md) — preallocated per-delegate worktrees, collision response without work loss.
- [references/continuous-clean-development.md](references/continuous-clean-development.md) — only when guarding active implementation: four-role exact-tree loop and no-unclean-commit barrier.
- [references/semantic-boundary-probes.md](references/semantic-boundary-probes.md) — claim-level candidate binding, digest-backed N/A disposition, and anti-vacuity executable receipts.
- [references/intelligent-momentum.md](references/intelligent-momentum.md) — why uniformity and finished procedures control future agents.
- [references/situational-awareness.md](references/situational-awareness.md) — detecting planning system, procedure graph, topology, management layer, enforcement.
- [references/verification-and-claims.md](references/verification-and-claims.md) — same-object rule, claim kinds, isolated checks.
- [references/verification-doctrine.md](references/verification-doctrine.md) — seventeen principles, each with the failure that taught it.
- [references/conformance-and-provenance.md](references/conformance-and-provenance.md) — historical normalization without provenance loss.
- [references/behavioral-evals.md](references/behavioral-evals.md) — only when testing or revising this skill.
- [evals/model-hygiene-trial.md](evals/model-hygiene-trial.md) — only when comparing runner models, harnesses, reasoning levels, or task-role fitness; use tuple-level coverage and matched contrasts, never an impressionistic leaderboard.
- [evals/rotation-campaign.md](evals/rotation-campaign.md) — only when running a multi-round DEV/QA/Mister Clean/holdout campaign; tier-aware rotation, reasoning staircase, event capture, and failure-to-capability feedback.
