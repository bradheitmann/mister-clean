# Verification Doctrine — sixteen principles, each paid for

Every principle below was learned from a real failure during a multi-day
multi-agent hygiene campaign. Each entry: the rule, then the incident that
taught it. They share one root — **a comparison whose operands are not the same
kind of thing** — and one stable fix: *compute the target, then assert the
target.*

## 1. The fresh clone is the authority

A working tree satisfies gates with inputs that are gitignored, machine-local,
or worktree-local. CI is always a fresh clone.
**Incident:** planning gates returned exit 0 in the working tree and exit 2 in
a fresh clone of the *same commit* — evidence bundles lived under a gitignored
path. Every "verified" claim made from the worktree was a claim about the
machine.
**Rule:** `git clone --local . /tmp/check` and run there. The clone's answer
is the real one.

## 2. A check is only as portable as its least portable input

Before trusting any gate, ask: is every input tracked? A gate reading
`~/.something`, an env var, or an untracked file measures the machine, not the
commit — two developers on the same commit legitimately get different answers.
**Incident:** a plugin-state gate documented as "must exit 0" read the local
harness home; it went red on every developer machine with any local tool
installed, for reasons no commit caused.

## 3. Lane metadata is an assertion; git state is a fact

Status fields, lane positions, and phase values are claims *about* state,
written at some past moment. Branches, anchors, and commits *are* state.
**Incident:** five slices read `Ready for QA`; zero unmerged branches existed —
four were already merged with clean verdicts. Dispatching QA on the metadata
would have spawned five agents to review branches that do not exist.
**Rule:** when metadata and git disagree, the metadata is what's wrong. Fix
the metadata; never manufacture git state to match it.

## 4. A gate that cannot fail is indistinguishable from an absent one

— and worse, because it reads as assurance. For every check that matters,
demand evidence it has been seen red.
**Incidents:** a test asserting "missing gate refuses boot" via bare `rc != 0`
kept passing after the boot refused for unrelated reasons — it would have
reported success with the gate deleted. A hand-written Docker assertion exited
1 in *all four* possible states — its pass and its fail were the same event.
**Rule:** positive controls. When you add or repair a check, break the thing
it guards and watch it fail; then verify the failure names the right cause.

## 5. Verify the thing, not the artifact that describes it

READMEs, status tables, and comments describe state at the moment someone last
looked. Re-measure before repeating any number.
**Incident:** the README's "verified" test count was three commits stale; a
runtime-image hazard was certified "discharged" by reading a build line —
`grep -c` on the actual image definition returned 0.

## 6. Existence is not state-match

Before deleting a branch, proving its files *exist* on `main` proves nothing —
the branch may hold different *versions*, including the only copy of a
verdict.
**Incident:** a branch was deleted after an existence check; it held the sole
copy of a QA verdict whose main-side counterpart differed.
**Rule:** preserve first, then compare content (0 commits ahead + state-match
+ anchor reachable from `main`), then delete — all re-proven in the same
execution as the deletion.

## 7. Success and termination are different events

A job can complete its work and then hang forever on an output pipe. It holds
no lock, blocks nothing, and is invisible to every outcome-shaped check.
**Incident:** fifteen shells, 21–36 hours old, all post-success — their
commits had landed and pushed; only process enumeration found them.
**Rule:** at session close, enumerate processes touching the repo and check
ages; verify the *work* of any hung commit/push job actually reached the
remote before reaping it.

## 8. Ownership is proven by chain, not by pattern

A process whose command line mentions your repo is not thereby yours.
**Incidents:** two kills on pattern-match in one prior day — one caught a
live TUI. Conversely, correct reaping required walking each PID's parent chain
to the owning session, re-verified at the moment of the signal, with an
explicit second pass for processes orphaned (PPID 1) by the first pass — with
identity evidence, not force.

## 9. A suite nobody runs is not a control

The count of tests in a directory says nothing about whether any has ever
executed. Check that a named runner (workspace manifest, CI step) reaches
every suite.
**Incident:** 415 tests guarding the repo's security gates had no
`package.json` (invisible to the workspace runner) and zero CI references. Two
had silently rotted into assertions that could not fail. Nothing noticed,
because nothing ran them.

## 10. Claim boundaries — never collapse into "done"

Committed locally · pushed · CI green · deployed · independently QA-accepted
are five different claims. Reporting the first as the last is how unverified
work acquires the reputation of verified work.
**Corollary:** you cannot certify your own enforcement or security change.
Stage the independent review and name the known limits of your fix yourself —
a disclosed hole is a boundary; an undisclosed one is a trap.

## 11. Re-verify at the moment of action

Every proof has a timestamp. State moves between your snapshot and your
action — especially in multi-agent sessions.
**Incidents:** a branch verified safe was re-proven at deletion time (still
safe — but only the re-proof made the deletion sound); process ownership was
re-walked inside the kill loop, which correctly *refused* five PIDs whose
chains had just changed because their parents died in the same pass.

## 12. Report what was measured — no more

A verdict must name its scope. "Conforming" from a gate that skipped half its
checks under a narrower scope is a lie told by a true exit code.
**Incident:** a gate's success line claimed "installed plugin set conforms"
in a mode that never inspected the installed set; the message was corrected to
say what was measured and what was explicitly not.
**Rule:** every green in the report carries: the command, the object measured,
where it ran (worktree/clone/CI), and the commit.

## 13. Wiring is not execution — check conclusions, not existence

A control's presence in the tree says nothing about whether it has ever run.
Workflows, hooks, and scheduled jobs all have an existence state and an
execution state, and only the second one protects anything.
**Incident:** a repo's README declared "CI is live on main." The workflows
were correct, landed, and celebrated — and **12 of 12 runs had failed at job
start** (account billing), zero steps ever recorded. Not one gate, test, or
scan had ever executed on a runner; every "CI-shaped" claim rested on local
simulation. Found only when a heartbeat checked run *conclusions* instead of
trusting the wiring — and the first run that did execute immediately caught a
product defect thousands of local passes structurally could not.
**Rule:** for any control, demand evidence of its most recent *execution* —
run ID, conclusion, steps > 0 — before repeating any claim that depends on it.

## 14. A positive control proves the instrument is alive, not that it is pointed at every door

Two independent reviewers examined the same guard. Reviewer 1 planted a
violation, watched the guard fire, and passed the criterion — a genuine
positive control. Reviewer 2 asked what the guard could not SEE and defeated
it three ways (bracket notation, destructuring, `.call`) without ever
triggering it.
**Incident:** both were right about what they measured. The reconciled verdict
was CONDITIONAL, and the divergence itself was the highest-value finding: a
demonstrated failing arm establishes liveness; only adversarial probing of the
mechanism's blind spots establishes coverage.
**Rule:** when duplicate independent reviews exist, reconcile them explicitly
in a durable record carrying both verbatim — divergence is signal. And never
let "the control fired when I tested it" stand in for "the control catches
what it claims to catch."

## Coda — the family, in one sentence

Every principle above is a case of one defect: **a mechanism claiming more
than it measures.** A substring scan claiming an object-graph property. An
`indexOf(' ')` implementing a `\s`-shaped intent. A lane claiming execution
state it never tracked. A workflow claiming enforcement it never ran. An
anchor-format enforcer writing a non-conforming anchor. None of these are
logic bugs, and no quantity of same-kind tests catches them — what catches
them is a reviewer asking **what does this instrument actually touch?** Ask
it of every green light, every guard, every claim — and first of all, ask it
of your own.
   — distilled at campaign close


## 15. A wrapper's exit code is not the action's outcome

`action || echo "kept"` returns success (echo's exit 0) even when `action`
failed. A broad `catch { continue }`, a `|| true`, a swallowed rc — each lets
a failed operation report success, and a receipt written from that wrapper's
exit narrates a change that did not happen.
**Incident:** a cleanup script's `git worktree remove ... || echo "kept"`
masked a failed removal (the worktree was still in use); the run reported
"removed," and only an independent `git worktree list` re-enumeration showed
it still present. The masked failure had silently closed a debt that was still
open.
**Rule:** capture the ACTION's own exit/status, not the pipeline's or
wrapper's. Distinguish an intentional preserve/skip decision (recorded as
such) from a failure (keeps the debt open). Before updating any receipt to
"executed/verified," confirm the target POSTCONDITION from fresh ground truth
— the worktree absent from `git worktree list`, the branch gone from
`for-each-ref`, the file removed on `stat`, the commit on `origin/main`. A
masked failure must keep the debt open, never mark it paid.

## 16. A check placed after an early exit never runs — unreachable validation measures nothing

A guard is only as strong as its reachability. A validation branch written
*after* an early `continue`/`return`/`break` for the very state it means to
inspect can never execute against that state.
**Incident:** the CLEAN gate's dimension loop did `if state == "satisfied":
continue` and then, below, tried to reject *satisfied* dimensions whose
evidence was a generic token ("measured"). Because every satisfied dimension
had already `continue`d, the generic-evidence check was dead code — a validator
claiming to demand specific evidence while structurally unable to see it. A
withheld-register rebind exposed a CLEAN report that validated on `["measured"]`
alone.
**Rule:** a check for state X must live on the same branch that *handles* X,
before its exit — not after. When adding a guard to a loop with early
`continue`s, place it inside the matching branch, and prove reachability with a
negative control: feed the exact bad input and confirm the guard fires. This is
the wrapper-exit lesson (§15) in control-flow form: an operation that cannot run
reports the same "clean" as one that ran and passed.

## 17. A review may not downgrade an operator's acceptance criterion — and a positive verdict cannot coexist with an acknowledged miss

An independent reviewer establishes whether the work meets the bar; it does not
get to lower the bar. When a review records that the measured artifact differs
from an EXPLICIT operator acceptance criterion, that is a REJECT on that
criterion — not a PASS carrying the gap as a "non-blocking nuance." A verdict
that says PASS/ACCEPT/CLEAN while its own body acknowledges an unmet
higher-priority criterion is internally contradictory: it reports more than it
measured.
**Incident:** an operator required a brand wordmark's letterforms to be derived
from a specific source asset. The reviewer confirmed the letterforms were NOT
so derived, yet returned PASS and filed the mismatch as a low-priority
"design-interpretation" note deferred to the operator. The artifact plainly
missed the stated criterion; the correct verdict was REJECT with that criterion
named. Only the operator may waive or amend their own criterion — and a waiver
is an explicit, attributable act (actor + ref), never a reviewer's severity
label.
**Rules:**
- A criterion set by the operator is met or unmet; a reviewer may not
  reclassify "unmet" as "acceptable." If unmet, the verdict is not positive.
- A positive verdict is INVALID while any acknowledged operator criterion is
  unmet, unless an explicit operator waiver (actor ∈ operator/principal, with a
  ref) is recorded. A reviewer-authored "waiver" of an operator criterion does
  not count.
- **Reviewer-reported stale comments/docs are payable debt before CLEAN,
  regardless of the severity label attached.** "LOW / non-blocking" is a
  priority hint for ordering, not an exemption; a stale comment a reviewer
  surfaced is drift the successor will read as truth. It may not be
  dispositioned `accepted_exception` (reserved for irreparable historical
  limits) nor parked as a residual — it is fixed, then CLEAN.
