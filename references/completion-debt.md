# Completion debt — sometimes the only way to get clean is to finish the work

Completion debt exists when an evidenced procedure requires multiple steps and
an earlier step has occurred without the later required step reaching a known
state.

## Why this is the skill's first measurement

Governed work is sequential by design: systems dictate that certain things go
with other things. A DEV slice and its QA slice are separate artifacts and
**one procedure** — implementing the DEV, running its tests, saving its
evidence, and then *not* running the paired QA leaves a half-executed
procedure, and that is the dirtiest state a repository can be in. Debris is
noise; an open procedure is an obligation with no owner. The morning team
inherits an open surgical site: they must reconstruct what was happening,
decide whether the unfinished half is safe to run late, and only then work.

> The idea that you would execute the Dev slice but not the QA is
> incomprehensible. Certain things need to be finished — as a matter of
> procedure, not as a matter of idiosyncratic instance.
> — operator ruling, 2026-08

**Honesty about debt is not payment of debt.** A residual section that lists
payable work is a half-done procedure with good documentation.

## Payable debt, precisely

Payable completion debt includes: unfinished validation or acceptance for
implemented or commenced work; eligible story reviews and holdouts (eligible =
all child work done); failures revealed by those reviews; failing tests, CI
gates, validators, or builds; stale or contradictory planning state;
incomplete done artifacts; broken references and generated current-state
surfaces; stale executable dispatches; unmapped branches, candidates, owners,
or worktrees; known defects and remediation already implied by the accepted
implementation; documentation, provenance, and handoff defects that make
successor work harder or unsafe.

**The roadmap boundary:** a deliberately unstarted roadmap item is NOT
automatically debt. It becomes payable when it has been accepted into the
invoked scope, implementation has begun, a current artifact promises it, or an
already-claimed completion state requires it. Do not expand cleanup into
speculative redesign or unrelated roadmap implementation in pursuit of an
abstract ideal of perfection — zero debt does not mean zero roadmap.

## The acceptance cascade — procedure

Do not blindly execute every acceptance artifact: eligibility first (a story
whose children are not all done is roadmap, not debt). For EVERY eligible
story:

1. Create or repair the story-review lifecycle record.
2. Dispatch an independent reviewer where independence is required.
3. Execute the sealed holdout.
4. On pass: update the story, holdout, epic, projections, and current-state
   surfaces.
5. On an in-scope defect: **a failed review is new evidence identifying debt
   to pay — never a reason to convert the failure into an owned queue and
   stop.** Repair the defect and rerun the COMPLETE affected cascade.
6. Continue until the story is accepted or a genuine hard boundary is reached.

**Never modify product behavior merely to force a holdout to pass. Preserve
holdout independence; never rewrite acceptance criteria after seeing a
failure unless an authorized product decision explicitly changes the
contract.**

## Discover the procedure graph — cited, never invented

Accept an edge only when supported by one of:

- a repository policy or canonical workflow;
- a tracker workflow definition;
- a management-layer contract;
- an explicit operator instruction.

Record the source for every edge. Do not generalize examples such as DEV→QA,
merge→cleanup, rejection→remediation, or story→holdout into universal
requirements — a wrong graph produces false debts and missed ones.

## Debt states

| State | Meaning |
|---|---|
| `satisfied` | The required later step executed and its result is evidenced. |
| `open` | The later step is available and remains to be performed — **payable now**. |
| `blocked` | The later step cannot currently execute because a named dependency is unavailable. |
| `deferred` | An authorized operator explicitly moved the step to another time or owner, with a durable ruling. |
| `not_assessed` | Evidence is insufficient to determine the state. |

**Artifact existence is not execution.** A QA task file does not establish a
review verdict. A workflow file does not establish a run. A remediation
commit does not establish re-verification. Distinguish *artifact parity*
(every DEV has a QA file — a planning check) from *execution parity* (every
done DEV has a QA verdict — the debt check).

A `blocked` record must name the blocker, cite evidence, identify the next
owner, and state the next executable action. "Unavailable" without ownership
and a recovery step is not a handoff.

## Payment rule

When a remaining step is authorized, available, and inside the user's
directive, execute it **before cosmetic cleanup** — FINISH → CONFORM → CLEAN.
Honor any actual independence or separation requirement. The dispatch
MECHANISM is paradigm-relative — in-session subagent or externally
orchestrated visible agent, per the environment's rules (see the Dispatch
mechanism section of authorization-and-modes.md). A genuine conflict between
the two is a hard boundary: finish independent work, preserve the evidence,
and return `NOT CLEAN` unless an interactive operator supplies a ruling.

Do not let one `blocked` debt hold unrelated reversible cleanup hostage.
Preserve the debt honestly, keep the handoff assessment capped at
`proceed_with_conditions`, and improve independent dimensions.

## Deferral rule

A `deferred` debt requires: who ruled; when; the exact step deferred; why;
who owns the next action; and a durable reference **recorded on the artifact
itself**, so the successor reads a decision, not an accident. "The session
ended" and "we ran out of time" are observations, not rulings.

## No self-certification

Do not invent a universal two-agent rule — but when governing policy requires
independent review, the implementer cannot establish that review claim, and a
self-closed pair is worse than an open one because it reads as reviewed. When
policy permits self-checks, label them as self-checks, never as independent
acceptance. If you changed enforcement or security-relevant code, its
independent review IS the paired second half — debt like any other, and a
known limit of your own fix is disclosed in the review's scope, never left
for the reviewer to discover.

## Edge cases, ruled

- **First half failed** (its own tests red): that is unfinished *first*-half
  work, not debt on the second half. Fix or roll back — never dispatch review
  of known-broken work as a formality.
- **The pair spans sessions by design**: legitimate only if policy says so
  AND the in-flight state is recorded on the artifact (who holds it, since
  when, what remains).
- **The second half is blocked by the first half's own defect**: the debt
  escalates to a finding; both are recorded together; the verdict is NOT
  CLEAN.
- **The second half's evidence was lost** (review ran, record destroyed): it
  cannot enter a terminal state — an unprovable review asserted as verified
  is fabrication. The truthful state is "re-run required," which is claimable
  work.

## Reporting

List each debt independently with its state and evidence. Any `open`,
`blocked`, `deferred`, or `not_assessed` debt forces the headline verdict to
NOT CLEAN. A legitimate operator-ratified `deferred` item may support the
separate handoff recommendation `proceed_with_conditions` when its condition
and owner are explicit, but it never satisfies CLEAN. These states do not
erase verified progress elsewhere.

## The momentum argument

A corpus where every DEV visibly has its executed QA teaches the next agent
that pairs are indivisible — it will not occur to a next-token predictor to
stop halfway, because the pattern contains no example of stopping halfway.
Completion is not just this session's obligation; it is the training data
for every session after.

## Why payment cannot wait: debt compounds forward

Unpaid debt is not a static residual — **it is paid forward into every agent
session that follows.** Each successor pays the rediscovery cost (finding the
debt, reconstructing its context), the contradiction cost (reconciling
artifacts that disagree about whether the work happened), and the decision
cost (re-deciding, without authority, whether to pay or defer). And because
the repository is the prompt, every session that visibly deferred teaches the
next one that deferring is the pattern. One unpaid debt, N sessions later,
has cost N × its payment price and trained N agents to tolerate it.

This is why the closeout pays NOW, within the pacing ceiling, until paid or
boundary-blocked: the only session that pays a debt exactly once is the one
that refuses to hand it forward.
