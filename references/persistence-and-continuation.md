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
