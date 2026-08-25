# Persistence and continuation — work that outlives one context

The debt does not expire when a context window does. This protocol makes a
closeout resumable, idempotent, and safe under concurrency.

## Checkpoint

At every material step, and always before a context may end, write a durable
checkpoint to the run's ledger (the action manifest's home, or the branch the
closeout works on): current snapshot (HEAD, worktrees, branches), the debt
ledger with per-debt state and disposition, validations run with conclusions,
and the exact next action. A checkpoint is a resume point, not a report — it
exists so the NEXT context starts by rebinding, not rediscovering.

## Resume

On continuation (same agent, a successor agent, or the orchestrator):

1. Read the latest checkpoint.
2. **Rebind**: re-freeze git/branches/worktrees/planning state and diff
   against the checkpoint's snapshot; label anything that moved.
3. Re-verify claimed-paid debts spot-wise (paid means evidenced, not
   remembered).
4. Continue paying from the exact next action. **Continuation is never
   deferral** — a resumed run inherits the founding contract whole.

## Forward-motion watchdog

Measure progress by changed repository/evidence state, not by another plan or
another read. If two consecutive cycles repeat bootstrap, reread the same
inputs, or restate the same intended patch without producing a new diff,
executed gate, ledger fact, or hard-boundary proof, name the loop and take the
largest safe executable increment. Do not restart discovery, fabricate a
commit/result, or substitute a placeholder. If the current agent still cannot
move, checkpoint the exact next action and replace/reassign it through the
orchestrator; the work remains open.

## Concurrency lock — no double payment

Before paying any debt, CLAIM it in the ledger (debt id + payer + timestamp).
A debt claimed by a live payer is not claimable; a debt claimed by a dead or
expired payer is reclaimed explicitly with the takeover recorded. Two agents
paying the same debt concurrently is how repositories get conflicting
verdicts — the ledger is the mutex.

## Pacing

The operator's concurrency ceiling bounds SIMULTANEOUS dispatches, never
total work. When the ceiling is reached, the payer waits on completions and
continues — it does not conclude.
