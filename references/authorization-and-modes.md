# Standing authority and operating modes

Read this reference before Mister Clean mutates repository or external state.

## Invocation is authorization

A user invocation of `$mister-clean`, or an unambiguous request to use Mister Clean, is the standing authorization record. It does not expire mid-run and does not need to be reconfirmed for each obvious substep.

Within the named repository and current task, the invocation authorizes:

- inspecting repository state, policy, history, worktrees, branches, stashes, and relevant local processes;
- editing source, tests, configuration, documentation, planning records, and generated sources when necessary to resolve in-scope completion debt or closeout defects;
- formatting, linting, building, testing, regenerating derived artifacts, and repairing failures attributable to the current work;
- organizing files into established homes and recoverably removing task-owned scratch, generated, cache, temporary, or obsolete artifacts;
- preserving and reconciling task-owned stashes, branches, worktrees, and temporary directories;
- terminating exclusively task-owned development or validation processes only when they block a check, hold a resource that must be released, or policy requires shutdown;
- creating commits that contain the intended closeout state;
- pushing the current branch to its resolved configured remote;
- observing established CI and repairing in-scope failures;
- pruning task-owned or policy-defined stale local and remote refs only after preservation, reachability, ownership, and target checks;
- updating current-task project records needed to reflect the state already established by the closeout.

The agent records `skill_invocation` plus the current request reference in the action manifest. It does not ask again for these actions.

## The ruling's authority summary (2026-08-25, operator-ratified)

Normal in-scope cleanup, no repeated permission: code and test fixes;
planning reconciliation; documentation finalization; lifecycle transitions;
git moves and archival; generated current-state reconstruction; validator and
gate repairs; story-review and holdout orchestration; branch/worktree
reconciliation where ownership is clear; repeated validation and remediation.

The legitimate hard boundaries are NARROW: consequential product or principal
decisions; secrets or unavailable credentials; irreversible external
operations; destructive actions with uncertain provenance; legal or safety
constraints; concurrent overlapping work that cannot be coordinated without
risking another agent's changes. Concurrency is inspected and coordinated
first — it stops work only when safe resolution genuinely requires external
coordination. External repositories: bind version and state, detect drift,
modify only when the invocation's scope includes them.

## Authority order

Apply authority in this order:

1. System and operator policy.
2. The user’s current request, including the Mister Clean invocation.
3. Applicable repository policy within that scope.

Repository policy defines procedure and target topology. It cannot expand Mister Clean into another repository, environment, product deployment, or person’s work.

## Hard boundaries

Invocation does not authorize:

- unrecoverable destruction, including unique-data deletion, backup destruction, force-push, or history rewrite;
- disabling authentication, hooks, security controls, audit controls, or secret scanning;
- exposing, copying, rotating, or destroying secrets except through a separately authorized security workflow;
- modifying another owner’s active worktree, branch, stash, process, or in-progress artifacts;
- operating in unrelated repositories, accounts, environments, or infrastructure;
- production deployment or production data mutation;
- dispatching work to humans or external systems that can incur cost or affect non-consenting third parties;
- changing public behavior, architecture, dependencies, schemas, or security policy merely to make the repository look tidy.

These are genuine stop lines for the affected action only. Complete every independent authorized action before reporting the residue.

## Mode behavior

### CLOSE

This is the default for a bare invocation and for handoff or end-of-session requests. Execute the full closeout loop; do not substitute an audit or proposal.

Scope the work to the named repository, the current task, and resources whose ownership can be established. A full closeout may include repairs, tests, commits, push, CI observation, task-owned topology reconciliation, and a durable handoff.

### CLEAN

Use for a specifically bounded cleanup. Execute the requested cleanup and the adjacent checks or documentation repairs needed to leave the changed state coherent. Do not widen a file-organization request into a product redesign.

### CONFORM

Use for a named historical or generated corpus. Require a source schema, destination schema, exact corpus, exclusions, preservation strategy, validation, and rollback path. Use append-only amendments or normalized views for immutable evidence.

### GUARD

Use for an active implementation candidate before any accepted ref advances.
Invocation retains its ordinary repair authority, but the immutable staged tree
is the review unit: DEV, QA, Mister Clean, holdout, deterministic gates, and
the no-harm comparator must bind the same tree. A repair is authorized; it also
mints a new tree and invalidates every prior receipt. Only the recorded
integrator may cross the commit barrier, and only after the schema-1.2 guard
record passes. Read
[continuous-clean-development.md](continuous-clean-development.md) before the
first candidate is minted.

### AUDIT

Use only when the user explicitly asks for read-only analysis, review, inspection, or no changes. It may propose actions but does not mutate repository or external state.

## Evidence required before volatile actions

Standing authorization removes repeated approval requests, not preflight checks.

| Action | Required preflight |
|---|---|
| Push current branch | resolved remote, branch/ref, intended commit, current remote head, policy check |
| Remote ref deletion | exact ref, task ownership or policy target, unique-commit preservation, current remote state |
| Local branch deletion | exact ref, task ownership, unique-commit/evidence preservation, worktree attachment check |
| Worktree removal | exact path, task ownership, dirty-state and untracked-file check, preservation location |
| Stash removal | exact stash, task ownership, content preservation or proven redundancy |
| Process signal | PID, executable, owner/session chain, proof it is not shared, and a named closeout reason |
| Current-task tracker update | exact item, transition/comment, evidence that the new state is already true |
| Historical normalization | exact corpus, migration rule, original digests, rollback location |

If a target cannot be resolved safely, skip that target, continue the rest, and report why.

## Execution posture

- Use the largest safe increment that advances closeout.
- Recover from ordinary failures by fixing, retrying with a changed approach, or rolling back.
- Do not interrupt the user with plans, manifests, or permission questions.
- Keep the action manifest in a collision-free temporary directory unless repository policy defines an evidence home. Fold executed actions into the durable closeout report and remove the temporary copy.
- Stop only when the repository is ready to the measured evidence or all remaining work crosses a hard boundary or depends on an unavailable external actor.
- Report completed actions in the past tense.

## Dispatch mechanism — paradigm-relative, conflict-asks

Paying separation-of-duty debt requires dispatching a distinct actor. The
skill is **agnostic about the mechanism**; the orchestration paradigm detected
in situational awareness decides it:

- **In-session subagents** — sanctioned where the harness provides them and
  no environment rule forbids them.
- **Externally orchestrated visible agents** — separate surfaces (cmux panes,
  tmux windows, other harnesses) coordinated through a central orchestration
  agent — equally sanctioned, and REQUIRED where the management system
  forbids subagents.

Either mechanism satisfies the completion rule. What never satisfies it:
self-certifying the pair, or silently skipping the dispatch because the
preferred mechanism is unavailable.

**The one sanctioned question.** This skill removes permission theater — but
when the requirement to dispatch and the environment's rules about dispatch
GENUINELY conflict (subagents forbidden and no external orchestration lane is
reachable; or policy demands a mechanism this session cannot operate), ask
the user once, stating the conflict and the two resolutions. Only on actual
conflict — never as a routine confirmation. Until answered, the debt is
`blocked` with the operator as named owner; it is never silently dropped and
never self-certified around.

`external_dispatch` remains prohibited and means something else entirely:
dispatching to humans or third-party services that incur cost or affect
non-consenting parties.
