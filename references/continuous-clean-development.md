# Continuous-clean development — the candidate tree is the gate

Use this protocol when Mister Clean is assigned as a standing member of an
implementation pod. It prevents debt from entering accepted history instead of
waiting for closeout to remove it.

The invariant is:

> No implementation ref advances to a tree with known debt, an unexecuted
> required check, or a review receipt bound to a different tree.

This is stricter than “fix it in the next commit.” An unverified candidate is
unclean. A later detector may expose a defect that no available gate could see;
classify that as newly discovered pre-existing debt, freeze the next ref
advance, pay it, and improve the detector when the miss is in Mister Clean's
domain. Never rewrite history to pretend the defect was known earlier.

This protocol composes with
[concurrent-remediation.md](concurrent-remediation.md). The project dispatcher
owns scheduling and the integrator owns refs; Mister Clean retains its standing
authority to repair the candidate.

## One pod, four independent roles

1. **DEV** owns the implementation lane and produces the smallest coherent
   candidate. DEV may repair findings but may not approve its own work.
2. **QA** verifies behavior and acceptance criteria on an immutable candidate.
   QA is read-only against that candidate.
3. **Mister Clean** inspects the complete hygiene and planning boundary. It is
   not an advisory reviewer: invocation authorizes it to repair in-scope debt.
4. **Holdout** is the final independent attempt to falsify the candidate after
   QA and Mister Clean have passed. It is read-only and receives no intended
   answer or prior verdict narrative.

The dispatcher and integrator are control-plane responsibilities, not fifth
pod roles. A person may hold both control-plane responsibilities, but no pod
receipt becomes independent merely because its label differs.

## Who owns what

No agent owns an immutable tree object. Its hash names content; it cannot be
edited, locked, or transferred. Keep four forms of responsibility separate:

- **authorship:** which lane produced the bytes;
- **write custody:** the one agent currently holding the lane's revocable write
  lease;
- **attestation:** the independent agent that owns a tree-bound verdict; and
- **ref authority:** the integrator that alone may advance shared history.

DEV begins with write custody. It becomes frozen when the candidate tree is
minted. Mister Clean may receive custody through a recorded handoff to repair
the candidate, but QA and holdout never do. The integrator owns neither the
bytes nor the verdicts; it owns only the guarded ref transaction.

## Exact-tree loop

### 1. Build without committing

Preallocate the DEV worktree and branch from a recorded baseline. Bind the
slice, write paths, versioned coordination-domain claims, acceptance criteria, established
gates, and affected planning projections before the first edit. DEV implements,
runs focused checks, and stages exactly the intended candidate without creating
an accepted commit.

Use `git write-tree` (or a VCS-equivalent immutable tree snapshot) as the
candidate identity. Record the baseline commit, candidate tree object, staged
path inventory, detector versions, and timestamp. Freeze the writer before any
review begins.

### 2. QA the immutable tree

Materialize the candidate tree in an isolated read-only snapshot. QA binds its
receipt to the exact tree object, task criteria, commands, results, model,
harness, reasoning level, session, and evidence digest.

If QA finds debt, QA does not edit the snapshot. Transfer the write lease back
to DEV, repair and restage, mint a new tree object, and invalidate every receipt
for the prior tree.

### 3. Invoke Mister Clean without defanging it

Invoke Mister Clean in `GUARD` mode against the current tree. If the run finds
payable debt, transfer sole write ownership of the implementation lane to the
Mister Clean agent or create one derived repair lane with a disjoint owner; do
not let DEV and Mister Clean write concurrently. Mister Clean pays the debt,
updates every affected authoritative projection atomically, stages the result,
and mints a new tree object.

Any Mister Clean mutation invalidates the earlier QA receipt. Run QA again on
the new tree. Mister Clean's no-harm comparator must also close with zero
cleanup-introduced open debt. A no-change PASS remains bound to the measured
tree and does not authorize a later byte change.

### 4. Run the final holdout

Give the holdout the final tree, criteria, and repository policy, but not the
DEV rationale, QA verdict, Mister Clean verdict, suspected bug, or desired
answer. The holdout attempts to falsify behavior, acceptance truth, planning
coherence, and the claimed repair boundary.

A holdout finding returns ownership to DEV or Mister Clean according to cause.
Any repair creates a new tree and restarts QA, Mister Clean, and holdout for that
tree. There is no severity-based waiver for a known defect.

### 5. Cross the commit barrier once

The integrator may create or advance an implementation ref only when all of the
following bind the same candidate tree:

- DEV candidate inventory and focused checks;
- QA PASS;
- Mister Clean PASS with zero cleanup-introduced open debt;
- holdout PASS;
- all required deterministic gates and affected planning projections; and
- a fresh target observation with no unresolved ownership or collision.

Run repository-required hooks against the exact candidate before the ref
mutation. Do not bypass them. Prefer a pre-ref mechanism that creates the commit
object from the approved tree and advances the ref only after proving
`commit^{tree}` equals the approved tree. If the repository cannot execute a
required hook or external check before ref advance, quarantine that candidate
under explicit policy; it is not accepted history and cannot integrate until
the missing evidence passes.

After creating the commit object, verify its tree identity, message/policy
checks, and clean worktree before the ref advance. A byte-changing hook or
generator creates a new candidate tree and restarts the gate.

## Integration is a second candidate gate

Lane acceptance does not prove the combined target. The integrator prepares the
prospective combined tree without holding the target lease, binds it as a new
candidate, and reruns every check affected by composition. For overlapping
invariants or a nontrivial merge, rerun the full four-role gate; for a proven
fast-forward with no semantic interaction, repository policy may reuse
object-bound lane receipts only when their scope still covers the exact result.

Acquire the short fenced lease only for the target-ref mutation. Compare the
freshly observed target object with the expected object. If it moved, reject
the transaction, rebuild the combined tree, and revalidate. After a successful
compare-and-swap, run the focused postcondition and wave barrier before another
candidate integrates.

## Where parallelism is safe

Use two levels of parallelism:

1. **Across pods:** dependency- and collision-safe stories or slices run in
   separate worktrees at the same time. Each pod owns disjoint write paths and
   coordination domains.
2. **Inside one frozen candidate:** QA and Mister Clean may inspect the same
   immutable tree concurrently in separate read-only snapshots. Consolidate
   their findings into one repair wave. If either causes or requests a byte
   change, mint a new tree and rerun both affected attestations. Holdout remains
   the final independent pass.

Only write custody within one lane and mutation of one target ref are
serialized. The integrator prepares and validates candidates before acquiring
the short lease, so the shared-ref critical section contains only fresh target
comparison and ref mutation. A conflicting coordination-domain claim or unresolved dependency
moves tasks into different waves even when their file paths are disjoint.

## Receipt minimum

Every role receipt records:

```text
run_id + round_id + pod_id + task_id + role
actual_model + reasoning_level + harness + session_id
baseline_commit + candidate_tree
prompt_sha256 + policy_sha256 + criteria_sha256
commands_or_detector_digests + result_refs + result_digests
started_at + finished_at + conclusion
findings_total + findings_paid + unresolved
repository_mutated + mutation_owner_transfer
```

The commit barrier records the four receipt digests, final candidate tree,
created commit, `commit^{tree}`, target expectation, lease/fencing token, CAS
result, and combined-object validation. A stale, missing, conditional, or
self-authored independent receipt blocks the ref.

## Machine contract

New GUARD runs use action-manifest schema 1.2. `guard` records the baseline,
candidate tree, mint time, staged paths, frozen-writer state, role receipts,
exact-tree gates, no-harm result, and commit barrier. Every receipt binds one
run, round, pod, task, actor, actual model, reasoning level, harness/session,
the input-policy digests, the executed-check digest, and its evidence.

The open barrier selects exactly one final PASS receipt for each role. Selected
actors and harness/session identities are distinct, findings reconcile to zero
unresolved, and selected receipts are non-mutating. DEV finishes the exact
candidate before QA and Mister Clean inspect it; holdout starts only after
their final receipts. Earlier failed or mutating attempts may remain in the
ledger but cannot open the barrier.

An executed `git_commit` carries `guard_commit`: approved candidate tree,
created commit, observed `commit^{tree}`, the exact four receipt IDs, and a
digest-bound proof. The validator refuses a changed hook output, a mutation
recorded after tree mint, a conditional verdict, cross-task receipt reuse, or
integration/publication before the barrier crosses.

## Failure routing

- **Product or planning defect:** pay it in the target lane and rerun the tree
  gate.
- **Mister Clean miss or false positive:** pay any real target debt, then add the
  narrow generalized detector/fixture correction to Mister Clean and forward-
  test it on both positive and negative cases.
- **Cleanup-created debt:** repair or safely roll back inside the open action;
  it is a hard gate and a skill/process incident.
- **Dispatch, collision, stale-target, or ownership defect:** fix the
  orchestrator transaction; do not score it as model reasoning unless the
  agent violated an explicit accepted boundary.
- **Harness transport failure:** preserve the sample and attribute the event to
  the harness. Never convert an unsubmitted prompt or recoverable pause into a
  model verdict.
- **Genuine hard boundary:** keep the candidate uncommitted/unintegrated and
  report `NOT CLEAN` with the exact missing authority or external evidence.

## Anti-treadmill rules

- Do not create a commit merely to obtain something QA can name; name the tree.
- Do not let a repair keep receipts from the prior tree.
- Do not allow Mister Clean to become the sole verifier of its own repair.
- Do not fill idle seats with new production prerequisites. The dependency DAG,
  not fleet utilization, decides which tasks exist.
- Do not make one ledger per role. One operation graph references four immutable
  receipts.
- Do not trade one new hygiene issue for many paid issues. Zero introduced debt
  remains the boundary.
