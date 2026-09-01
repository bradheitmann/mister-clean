# OPTIONAL ORCHESTRATION GOAL — MISTER CLEAN

Use this template when the closeout is likely to outlive one agent turn and the
harness supports persistent goal state. It is optional: a bare
`$mister-clean` invocation remains sufficient authorization and instruction.
The instantiated goal is orchestration state, not evidence of cleanliness, and
should not be committed unless repository policy explicitly designates it.

## Suggested goal

> Invoke the currently installed canonical `$mister-clean` in `{mode}` mode for
> `{repository}`. Continue operating until a live validation of the current
> repository object returns `CLEAN`; do not stop at an audit, queue, improving
> trend, prepared receipt, or dispatched-but-unverified work. Treat each change
> and every authoritative projection affected by it as one atomic action. No
> cleanup-introduced debt may cross an action, commit, checkpoint, or handoff
> boundary. If progress stalls, change the hypothesis, action shape, or agent;
> do not repeat a no-delta loop. Stop only for the user's interruption or a
> named hard boundary from the skill, and then report `NOT CLEAN` with the exact
> blocked debt, evidence, authority needed, and safe resumption action.

## Bind before acting

Record in the run ledger, not necessarily in the repository:

- target repository identity, target branch/ref, and starting object;
- the installed Mister Clean version plus the package-manifest digest;
- the operator request reference and selected mode;
- the repository's native policy, procedure graph, and established gates;
- each comparator's identity, version/digest, and scope; and
- the normalized open-debt identities claimed by this run.

Rebind volatile Git, worktree, process, planning, target-ref, and comparator
state after every continuation. A persistent goal never makes a stale receipt
current.

## Monotonic loop contract

1. Recompute the live normalized debt set with the same bound comparators.
2. Select the smallest dependency-closed batch that can be completed and
   verified. Include every authoritative projection of a lifecycle change in
   that batch; for example, terminalizing a story and updating its epic and
   rollup are one transaction.
3. Execute the batch under the skill's standing authority and action ledger.
4. Rerun the affected comparators before another action begins.
5. Repair or safely roll back every cleanup-introduced regression. Close the
   action only when its `open_at_boundary_observation_ids` set is empty.
6. Mark debt paid only from execution and verification evidence. A dispatch,
   plan, queue, or favorable paid/introduced ratio is not payment.
7. Repeat from fresh ground truth until the terminal condition is established.

Newly discovered pre-existing debt may increase the census without meaning
the run caused harm. Classify it by replaying the bound comparator against the
starting object. Detector-version or scope changes are recorded separately and
never compared as if they were repository deltas.

## Progress and deadlock

A productive iteration either pays at least one normalized debt identity or
completes a necessary, previously missing verification that makes a named debt
immediately executable. It still leaves zero cleanup-introduced debt open.

After two consecutive attempts on the same debt produce no repository,
evidence, or diagnosis delta, stop repeating them. Run a deadlock diagnosis (or
invoke `$deadlock-breaker` when installed), identify the failed assumption,
and change strategy or operator. Do not expand prerequisites merely to create
motion. If no safe in-scope strategy remains, record
`decision_or_coordination_required`; the result remains `NOT CLEAN`.

## Terminal condition

The goal is achieved only when all of the following are simultaneously true on
the current closing object:

- the digest-bound live closure bundle validates and reports `CLEAN`;
- every actionable completion debt is paid and independently verified where
  required;
- every action boundary has zero cleanup-introduced debt open;
- planning lifecycle, parentage, acceptance, and rollup projections agree;
- the closing candidate contains the current target and affected established
  gates pass on the integrated state;
- Git, debris, ownership, and successor-entry surfaces satisfy the skill; and
- the evidence freeze occurs after the final mutation.

The goal does not widen Mister Clean's scope or hard boundaries. Production
deployment, unrelated repositories, unrecoverable destruction, another
owner's live work, security bypass, and non-consenting third-party effects
still require their own authority.
