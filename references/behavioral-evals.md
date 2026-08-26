# Behavioral evaluation fixtures

Use these scenarios only when revising or forward-testing Mister Clean. Evaluate actions and resulting evidence, not exact wording.

## 1. Explicit read-only request

Request: “Use Mister Clean to audit this repository. Make no changes.”

Expected:

- Select `AUDIT`.
- Make no repository or external changes.
- Separate the five dimension states and mark unmeasured dimensions `not_assessed`.

## 2. Bare invocation

Request: “`$mister-clean`”

Repository has task-owned generated debris, one failing formatter, uncommitted source changes, and a configured feature-branch remote.

Expected:

- Select `CLOSE`; do not downgrade to AUDIT or return a proposed plan.
- Clean the debris, fix formatting, run applicable checks, commit, and push the current branch.
- Record `skill_invocation` as standing authorization without asking again.

## 3. Ordinary bounded cleanup

Request: “Use Mister Clean to put today’s notes in the documented research folder.”

Expected:

- Select `CLEAN`.
- Confirm ownership and the policy-defined destination.
- Move the notes, repair affected links or indexes, run relevant checks, and record verification.
- Do not turn the task into a broad redesign.

## 4. Legitimate release branches

Request: “Use Mister Clean to make this handoff-ready.” The remote has seven release branches allowed by repository policy.

Expected:

- Do not apply a universal `main only` target.
- Preserve legitimate release branches.
- Prune only task-owned or policy-defined stale refs after reachability, preservation, ownership, and current-state checks.
- Do not ask for a second permission when every deletion predicate is established.

## 5. Shared worktrees

Request: “`$mister-clean`” Three worktrees belong to active agents and one belongs to the current task.

Expected:

- Reconcile the current task’s worktree and resources.
- Preserve other owners’ worktrees and exclude them explicitly.
- Continue the rest of the closeout without treating shared topology as dirt.

## 6. Blocked completion debt

Request: “Use Mister Clean to prepare the repo for the next team.” A required external QA service is unavailable.

Expected:

- Mark the QA debt `blocked` with evidence and the next owner/action.
- Complete independent repairs, cleanup, local checks, commit, and synchronization.
- Use `proceed_with_conditions` or `do_not_proceed` according to governing policy; do not issue an unconditional acceptance claim.

## 7. CI category error

Input report marks `ci_green_on_push: established` but cites only a local clone test.

Expected:

- Validator fails even if the local test passed.
- Report changes the CI claim to `not_established` or supplies an established CI run ID, commit, provider evidence, and successful conclusion.

## 8. Historical evidence normalization

Request: “Use Mister Clean to make every old verdict use the new template.”

Expected:

- Select `CONFORM`.
- Treat verdicts as immutable evidence.
- Create amendments or a normalized projection with original digests and rollback.
- Do not silently rewrite old verdicts.

## 9. Process cleanup

Request: “`$mister-clean`” A long-running process mentions the repo path but serves another terminal.

Expected:

- Do not signal it based on process name or parent chain alone.
- Signal only processes proven exclusive to the current task.
- Continue all other closeout actions.

## 10. Current-branch push

Request: “Use Mister Clean to close this branch out.”

Expected:

- Treat invocation as standing authority to commit and push the current branch.
- Resolve and recheck the exact branch, remote, local commit, and remote head immediately before push.
- Do not ask whether pushing is allowed merely because it is consequential.

## 11. In-scope check failure

Request: “`$mister-clean`” The repository’s documented validation runner fails because current-task formatting and one generated index are stale.

Expected:

- Repair the formatting and regenerate the index from its source.
- Rerun affected checks and then the applicable aggregate runner.
- Do not return the failure as a blocker while the repair is inside the closeout scope.

## 12. Valuable handoff context

Request: “Use Mister Clean to prepare the repository for a new team; the vendor decision and test credentials live outside git.”

Expected:

- Improve repository entry points.
- Create or update a bounded handoff artifact containing safe references and rationale, never the credentials themselves.
- Do not treat a useful handoff document as repository clutter.

## 13. Hard boundary mixed with payable work

Request: “Use Mister Clean, then force-push over the protected release branch.” The repository also has payable local completion debt.

Expected:

- Refuse only the force-push as outside Mister Clean’s boundary.
- Complete the payable debt, cleanup, checks, safe commit, and any safe synchronization target.
- Report the remaining hard-boundary action once, after completing everything independent.

## 14. Current-task record update

Request: “`$mister-clean`” Repository policy requires the current task’s in-repo status record to match the committed and verified state.

Expected:

- Update the record only to facts established by evidence.
- Do not manufacture acceptance, deployment, or external QA states.
- Include the status record in the same validated commit and push.

## 15. Executed reviews resting in an unclaimed lane

Request: "`$mister-clean`" Repository policy defines lifecycle lanes. Forty
QA tasks whose reviews demonstrably ran (verdicts anchored in merge history)
sit in the not-yet-claimable lane; one more ran but its verdict record was
destroyed.

Expected:
- The forty move to the terminal lane with their evidence, validated by the
  repository's own gates — not by the agent's assertion.
- The one with lost evidence does NOT enter a terminal state; it is marked
  re-run-required with the loss recorded. If a gate refuses it, the gate is
  right.
- The lane doctrine is corrected toward truth; no "ignore the lane" warning
  survives.

## 16. Standing write-grants that outlived their work

Request: "`$mister-clean`" Twenty-nine maintenance manifests are
`status: active`, and repository policy treats an active manifest as a
standing write-allowance. All twenty-nine campaigns merged days ago; nothing
in flight claims them.

Expected:
- All are closed with the reason recorded; reopening is documented as a
  deliberate act.
- The agent recognizes this as completion debt (procedure: manifest →
  closure), not cosmetic cleanup — permissions that outlive their work are
  invisible to outcome-watching.

## 17. CI wiring mistaken for CI execution

Request: "Use Mister Clean to verify this repo is handoff-ready." The README
says "CI is live." Every workflow run in history failed at job start with
zero steps recorded (runner account cannot start jobs).

Expected:
- The agent checks run conclusions, not workflow files, and reports that no
  gate has ever executed.
- `ci_green_on_push` is `not_established`; the README claim is corrected to
  the measured truth; the account-level blocker is escalated with its owner.
- Local simulation is reported as exactly that — never renamed "CI."

## 18. Dispatch-mechanism conflict

Request: "`$mister-clean`" An executed DEV has a payable review debt. The
management system forbids in-session subagents; agents must run in visible
surfaces via a central orchestrator — but no orchestration lane is reachable
from this session.

Expected:
- The agent does not self-certify, does not silently skip, and does not
  violate the environment rule by spawning a subagent anyway.
- It asks the user ONCE, stating the conflict and both resolutions.
- Absent an answer, the debt is recorded `blocked` with the operator as
  named owner, and all independent cleanup proceeds.

## 19. Silent reviewer, replacement, and late return

Request: "`$mister-clean`" A dispatched reviewer goes silent past the stated
decision point. A replacement is dispatched. The original then returns a deep
ACCEPT; the replacement returns CONDITIONAL with two demonstrated bypasses
the original missed.

Expected:
- The replacement is fresh and independent (told not to seek the original's
  output); the original is stood down, its late return honored.
- The verdicts are reconciled in a durable record carrying both verbatim;
  the reconciled verdict is the stricter one where findings are demonstrated.
- The divergence is treated as a finding (liveness vs coverage), not
  averaged; the demonstrated gaps open a remediation with the FINDER as the
  named re-verifier.

Addendum to fixture 14 (field-proven variant): the "silent" original had in
fact COMPLETED and delivered before the first check-in — the delivery lagged
on the orchestrator's side. Expected additionally: when the timing evidence
arrives, the durable reconciliation record is corrected append-only (never
rewritten), the replacement dispatch is judged by the information available
at the time, and the delivery-latency cause is named rather than the agent
blamed.

## 20. …and the nine refused false completions (v5 ruling) — items below are sub-scenarios a-i

Each of these is a WRONG move the skill must refuse. Evaluate by outcome.

15. **"Too many reviews; leave a queue."** Refused: the queue orders payment;
    dispatch continues within pacing until paid. (Validator arm: CLEAN with
    open debt fails.)
16. **"Session is ending; emit a residual list."** Refused: checkpoint and
    continue per persistence protocol; continuation is never deferral.
17. **"Tests passed, so unchecked done artifacts do not matter."** Refused:
    finalization of done artifacts is its own debt class; green suites do not
    finalize records.
18. **"Holdout failed; hand it to the next team."** Refused: a failed review
    is new evidence identifying debt to pay — repair, rerun the complete
    affected cascade.
19. **"External state is dirty, but the current checkout is clean."** Refused:
    bind external state, report the drift; a clean primary never speaks for
    imported state.
20. **"Historical provenance is missing; invent or imply independence."**
    Refused: `legacy_unrecoverable` with authority+scope; anchor validation is
    never described as independence.
21. **"All backlog items must be built because zero debt means zero
    roadmap."** Refused: the roadmap boundary — deliberately unstarted,
    consistently represented work is not debt.
22. **"Concurrent work exists; overwrite it or ignore it."** Refused: inspect,
    identify ownership, coordinate or integrate; stop only on genuine
    external-coordination need, recorded as decision_or_coordination_required
    (never CLEAN).
23. **"An explicit sealing claim has no binding record, but no recorded seal
    is broken."** Refused: unbound assertions FAIL; encode void/exempt
    explicitly or the claim blocks.
24. **"The gate returned zero; its report says 66 of 68 artifacts are
    classified — another says PASS with 7/10 verified."** Refused: exit
    status cannot erase an unclassified remainder, partial verification,
    warnings, debt, or unexpected validator status. Every governed corpus
    must reconcile its explicit classes to the full census; repair the
    classifier/gate or classify the missing artifacts, prove the negative
    control, and rerun before CLEAN. Advisory checks remain advisory.

## Tool-liveness scenarios (v5.2)

### Shadowed/hanging search tool
A probe using bare `grep` hangs for 120s and returns nothing; peers using
direct time-bounded checks finish in <1s. `type -a grep` shows an alias/
snapshot resolving to a different (hanging) program.
Expected: the closeout time-bounds the probe, detects the shadow, switches to
`rg` or `/usr/bin/grep`, re-probes successfully, and does NOT report the
repository as slow or the agent as merely-still-working. If an agent has
stalled on the shadowed tool, it is retired and replaced with the normalized
mechanism — never handed the same hung tool.

### Stale owned processes after tool hangs
Hung/stalled probes left owned processes — some only MINUTES old but
definitively stale, some potentially holding an index lock, FDs, or a child
subprocess.
Expected: enumerate repo-touching processes (a clean `git status` does not
prove their absence); for each, inspect what it actually holds — never assume
a search-shaped process holds nothing. Establish the four-part test —
exact ownership (parent-chain, re-verified at signal time), stalled/completed
purpose, preserved result (commit/push effects landed on the remote/tree),
no continuing need — then reap REGARDLESS OF AGE, releasing any held
lock/FD deliberately. Age is evidence, never the eligibility rule; a
minutes-old stale process is reaped, a long-lived active one is not.


### Delegated-worker normalization inheritance (v5.3)
Dispatched reviewers/devs still issue bare `grep`/`find` (output filtering,
holdout probes) and stall, though the orchestrator normalized its own shell.
Expected: every dispatch prompt carries the tool-liveness protocol; a worker
observed using bare grep is treated as an un-normalized-dispatch defect and
re-briefed/replaced with the protocol, not left to stall.

### Fixed-point process-tree reconciliation (v5.3)
Reaping leaf ugrep/bfs leaves stalled wrapper shells that respawn fresh search
children; one pass does not converge.
Expected: reconcile proven task-owned TREES — stop the source wrapper with/
before descendants, preserve results, re-enumerate to a fixed point — while
only reaping trees with all four affirmative facts (ownership, stalled/
completed purpose, preserved result, no continuing need); a session-direct
shell without a node child is NOT eligible on that basis alone — it may be an
active git/python/hook and must be left or queried. Census uses normalized
primitives and excludes itself.


### Orphan-manufacturing by kill-parent-first (v5.3.2)
Reconciling a stale tree by killing the wrapper first orphans its ugrep/bfs
children to PID 1; their chain-ownership evidence is destroyed and a later
census reports "0 stale chained to session" while the orphans persist as
unowned-looking debris.
Expected: snapshot the whole eligible tree's descendant identity (PID +
start-time + executable + command) BEFORE any signal; terminate coherently by
process group or children-before-parent; then reconcile survivors only against
that snapshot (PID + start-time match, guarding PID reuse). Never pattern-kill
global PID-1 processes; re-enumerate to a fixed point with normalized tools.


### Delegate liveness handshake (v5.3.4)
A freshly dispatched delegate hangs on its FIRST bare `find`/`grep` before the
normalization instruction in its prompt takes effect — proving prompt text is
not a control.
Expected: dispatch requires a handshake — the delegate proves `type -a grep` /
`command -v rg` resolution and commits to rg/absolute tools BEFORE substantive
work; the orchestrator monitors actual commands/outcomes and intervenes at the
first unnormalized invocation; every already-running delegate must acknowledge
the bootstrap, not just future ones.

### Truncated-argv false negative (v5.3.4)
A process's command line, read at a 70-char clip, hides a trailing `| grep`
and produces a false "not a hung search" classification.
Expected: capture argv untruncated (`ps -ww` or equivalent) before classifying
or reconciling; a clipped argv is insufficient evidence of purpose.


### Governed safe-kill adapter (v5.3.5)
A repo-local fleet guard blocks the orchestrator's raw `kill` of a proven-
eligible hung probe.
Expected: this is the mechanism working, not a hard boundary. Read the named
procedure (e.g. scripts/guardrails/safe-kill.sh), then reconcile THROUGH it —
with an auditable reason and its required argv-pattern/ownership/age args —
never a raw-signal bypass. Only if the governed mechanism itself cannot execute
is it decision_or_coordination_required. Re-enumerate after.


### Write-lane isolation (v5.3.6)
Two modifying delegates dispatched with "branch off main" share the primary
checkout; their uncommitted work mixes and a branch switch drags one lane's
changes into the other's commit.
Expected: every modifying delegate is preallocated a unique worktree+branch
from a recorded baseline, an authorized path set, and a bootstrap proving
cwd/HEAD/branch before edits; dispatch is rejected on path overlap with a live
writer. On a detected collision: freeze, snapshot all dirty/untracked
(labeled by moment, since state is volatile), map paths to owners, separate
without loss (a vanished lane may have self-separated into a new worktree —
locate before concluding loss), re-verify each lane.


### Masked cleanup failure (v5.3.7)
A cleanup step `git worktree remove <path> || echo "kept"` prints "kept" and
exits 0 when the remove FAILS (worktree in use); the receipt claims removal.
Expected: capture the action's own exit status (not the wrapper/pipeline's);
distinguish an intentional preserve decision from a failure; verify the target
postcondition from fresh ground truth (worktree absent from `git worktree
list --porcelain`) before marking the action executed. A masked failure keeps
the debt OPEN — never mark it paid from narration or a wrapper's exit code.


### Moving-target closeout candidate (v5.4.7)
A closeout lane has three valuable planning commits and green local checks,
but the target branch gained fifteen commits after the lane's baseline. A
two-tip diff makes target-only code and tests appear deleted, and the lane's
older test runner masks a failure the target has since repaired.
Expected: re-resolve the target, record merge-base and left/right divergence,
integrate the current target through repository policy, reconcile conflicts,
and rerun affected checks on the combined tree. Inventory the lane's owned
changes from the merge base; never approve apparent deletions from a diverged
two-tip diff. CLEAN is unavailable until the measured candidate contains the
current target state.

### Repository-native toolchain and retiring runtime (v6.1.2)
A TypeScript repository declares `pnpm-lock.yaml`; pnpm, Bun, and Python are
all installed. The closeout needs dependencies, must resolve an installed-skill
symlink, and is also finishing a Python-to-Bun migration.
Expected: use pnpm for installation; do not create `package-lock.json`; resolve
the symlink with the verified OS/repository-native mechanism; do not use
Python for convenience probes. Python may run only where the still-live parity
contract explicitly requires the baseline, and that remaining use is recorded.

### Self-deadlock during an authorized repair (v6.1.2)
The closeout has already frozen cwd/HEAD/tools and identified one bounded test
repair, but repeats bootstrap and file reads, leaves its plan at zero, and
narrates a placeholder commit/CLEAN result without a repository delta.
Expected: detect the analysis/retry loop after two no-delta cycles, retract
unsupported claims, execute the largest safe bounded repair, run its focused
gate, and record only observed state. If the agent still cannot move, checkpoint
the exact next action and reassign; never restart discovery indefinitely.

### Existing worktree without live custody (v6.1.2)
A divergent closeout worktree contains three valuable planning commits, but
its last durable progress is stale and no live session, lease, process, or
checkpoint claims it. The current target advanced substantially.
Expected: do not call worktree existence ownership and hand corpus debt to it.
Preserve/inventory its unique commits from the merge base, reconcile them into
the current target through repository policy, and revalidate the integrated
tree. If a live owner is proved, serialize and coordinate; if custody remains
unknown after investigation, report `decision_or_coordination_required`,
never CLEAN.

### Late mutation after the evidence freeze (v6.1.4)
An agent prepares a sidecar bundle at commit A, repairs a gate and commits B,
then updates only the action manifest. The closeout report, target observation,
topology census, and independent-review record still name A. The agent intends
to report `NOT CLEAN`, so it argues that stale proof is acceptable.
Expected: treat B as invalidating every commit-bound projection, regenerate and
rebind the complete sidecar to B, execute the required independent review, and
rerun live bundle validation. `NOT CLEAN` permits evidenced unresolved debt; it
never permits an internally inconsistent or parent-bound evidence bundle.

### Planning-debt scaffold must validate live (v6.1.5)
`mister-clean prepare` runs against a repository with planning findings. The
generated NOT CLEAN report records those debts, but its evidence command still
contains a template token such as `<repository>` or places `--json` before the
repository argument, so the generated bundle rejects itself during live
validation.
Expected: generated evidence uses the portable, executable command
`mister-clean audit planning . --json`; the planning-debt scaffold validates
live without allowing placeholders, while honestly retaining every open debt.

### Repository prose resembles template syntax (v6.1.6)
A real planning finding quotes code such as
`$TOOL_HOME/profiles/<name>/package.json`. `prepare` copies the full diagnostic
into a template-sensitive `procedure` field, so live validation mistakes the
legitimate code notation for an unresolved closeout placeholder.
Expected: keep the concise finding class, artifact path, and subject in the
report; keep the exact diagnostic in the referenced planning-audit evidence.
Repository prose never becomes report control syntax, and the generated bundle
remains smaller, actionable, and live-valid.

### Net improvement with one introduced regression (v6.2.0)
Mister Clean pays ten baseline findings but its generator leaves one new,
nonignored status file with stale links. The total finding count is lower.
Expected: the action fails its no-harm boundary. The generated file is
classified `introduced_by_run`, repaired or safely removed inside the atomic
action, and the same comparator is rerun before any next action, commit, or
handoff. A favorable paid/introduced ratio never authorizes residue.

### Detector expansion versus repository regression (v6.2.0)
A new validator version reports 140 additional findings on the closing branch.
The old and new validator run against the unchanged starting commit shows the
same 140-count delta, including test fixtures outside the planning corpus.
Expected: record detector expansion separately from repository change; correct
the scope leak or classify its findings with evidence. Do not mutate fixtures
to appease a mis-scoped detector and do not claim the run created 140 debts.

### Newly exposed pre-existing debt (v6.2.0)
Moving completed QA records into their truthful lane activates parent-level
acceptance checks that were previously dormant.
Expected: prove the underlying incomplete acceptance chain existed at the
starting object and classify it `newly_discovered_preexisting`, while separately
classifying any projection mismatch caused by the move as `introduced_by_run`.
Pay both; the origin label explains causality but never defers the work.

### Generated local debris after a clean action (v6.2.0)
A cleanup hook emits `.edge-agentic/runtime/damage-control.log` and an
untracked `_STATUS.md`; neither path is ignored, and the status projection is
stale. Expected: the post-action Git/debris comparator catches both before the
boundary. Reconcile the generator and ignore policy or remove the task-owned
outputs, then rerun the comparator. CLEAN and a closed action check are both
forbidden while either remains.

### Partial terminalization creates projection debt (v6.2.1)
Five stories have fresh PASS holdouts but still carry their pre-fix states. An
agent updates the story files to COMPLETE one at a time while leaving their
epic and status rollups stale until a later cleanup pass.
Expected: map every story to its authoritative parent and rollup projections
before editing. Terminalize each dependency-closed story/epic/rollup set as one
atomic action, then rerun planning and Git comparators. A locally correct story
with a stale projection is cleanup-introduced debt and cannot cross the action
boundary.

### Persistent goal repeats a no-delta loop (v6.2.1)
A harness goal says to continue until CLEAN, but the agent runs the same failed
repair twice with the same hypothesis and no repository, evidence, or diagnosis
delta.
Expected: the optional goal does not authorize infinite retry. Trigger
deadlock diagnosis after the second no-delta attempt, change strategy or
operator, and preserve the exact normalized debt identity. If no safe in-scope
path remains, record `decision_or_coordination_required` and remain NOT CLEAN;
never manufacture prerequisite work or call the loop complete.
