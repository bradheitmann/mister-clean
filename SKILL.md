---
name: mister-clean
metadata:
  version: 5.4.8
description: >-
  Autonomously close out repository work so the codebase is clean, verified to
  the available evidence, synchronized, and ready for the next team. Invoking
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

# Mister Clean — v5.4.8

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

`CLEAN` is permitted only when ALL hold: zero payable debt remains · every
eligible acceptance cascade has EXECUTED · failures found during closure were
repaired and revalidated · lane/frontmatter/body/story/epic/launch/readiness/
dispatch projections agree · every governed corpus partitions completely into
explicit, schema-valid states with zero unclassified remainder ·
current/start-here surfaces are present, fresh,
commit-bound · every live branch and worktree has owner, purpose, candidate
identity, disposition · required tests and gates pass · negative controls
prove the gates fail on representative contradictions · ignored and external
state is explicitly accounted for · historical limitations are ratified
accepted exceptions, not ambiguous residuals · no unresolved principal
decision or hard-boundary blocker remains; AND, once the run would otherwise
be clean, the `/swarm-review` final gate has run (seven read-only specialists
+ ATLAS synthesis), its clear-pre-implementation findings are remediated, and
any in-domain class it surfaced that the closeout missed has become a skill
revision followed by a fresh re-audit (see evals/blind-run-contract.md). The closeout JSON's `verdict`
field is machine-gated by `scripts/validate_closeout.py`: CLEAN is refused
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
| `AUDIT` | The user explicitly says audit, review, inspect only, or make no changes | Read-only evidence and recommendations. |

Do not downgrade a bare invocation to AUDIT because the request is short. The
skill name is the request.

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

Copy [assets/action-manifest.json](assets/action-manifest.json) into a
collision-free temporary directory, fill it, and validate:

```bash
python3 scripts/validate_closeout.py manifest path/to/action-manifest.json
```

The manifest is an execution ledger, not an approval request. Classify every
action `reversible_local` / `consequential_external` / `unrecoverable` —
the last is outside this skill. The `kind` vocabulary is CLOSED and enforced
by the validator: `agent_dispatch`, `acceptance_execute`, `local_edit`, `local_move`,
`recoverable_delete`, `format`, `lint`, `test`, `build`, `generate`,
`doc_update`, `planning_record_update`, `git_commit`, `git_push`,
`stash_preserve`, `stash_drop`, `branch_delete_local`,
`branch_delete_remote`, `worktree_remove`, `process_signal`,
`tracker_write`, `historical_conform`, `handoff_update`. Do not invent kinds;
do not pause after validation. Execute.

### 4. Finish, conform, clean — in that order

- **Isolate before dispatching modifying delegates:** each gets a unique
  preallocated worktree + branch from a recorded baseline, an authorized path
  set, and a bootstrap that proves cwd/HEAD/branch before edits; reject
  dispatch on path overlap with a live writer. `branch off main` without a
  worktree is not isolation. Contract + collision response:
  [references/write-lane-isolation.md](references/write-lane-isolation.md).
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
relationship to the closing candidate from their merge base. If the target
advanced, integrate it through repository policy (merge, rebase, or a fresh
integration worktree), resolve the combined state, and rerun every affected
check. The final candidate must contain the current target's reachable state;
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
(`python3 scripts/validate_closeout.py report …`), store it in the
repository's established evidence home. The validator enforces TYPED evidence
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

## Progressive references

- [references/authorization-and-modes.md](references/authorization-and-modes.md) — before any write or external action.
- [references/completion-debt.md](references/completion-debt.md) — multi-step procedures, debt states, deferral rules.
- [references/code-hygiene-rubric.md](references/code-hygiene-rubric.md) — ten hygiene dimensions, absence proofs, evidence-bound findings, the GATE ratchet.
- [references/stack-adapters.md](references/stack-adapters.md) — ecosystem-specific debris/boundary checks, loaded via `scripts/detect_stack.py`.
- [references/persistence-and-continuation.md](references/persistence-and-continuation.md) — checkpoints, resume/rebind, the debt-ledger mutex.
- [references/tool-liveness.md](references/tool-liveness.md) — normalize/verify discovery tools, time-bound probes, replace stalled agents without repeating the mechanism.
- [references/write-lane-isolation.md](references/write-lane-isolation.md) — preallocated per-delegate worktrees, collision response without work loss.
- [references/intelligent-momentum.md](references/intelligent-momentum.md) — why uniformity and finished procedures control future agents.
- [references/situational-awareness.md](references/situational-awareness.md) — detecting planning system, procedure graph, topology, management layer, enforcement.
- [references/verification-and-claims.md](references/verification-and-claims.md) — same-object rule, claim kinds, isolated checks.
- [references/verification-doctrine.md](references/verification-doctrine.md) — thirteen principles, each with the failure that taught it.
- [references/conformance-and-provenance.md](references/conformance-and-provenance.md) — historical normalization without provenance loss.
- [references/behavioral-evals.md](references/behavioral-evals.md) — only when testing or revising this skill.
