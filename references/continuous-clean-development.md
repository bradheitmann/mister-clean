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

The integrator reads and reconciles the receipt body, not only its headline.
`PASS` or `ACCEPT` is invalid while that same receipt substantiates an in-scope,
payable finding, even when the reviewer labels it `LOW`, `non-blocking`, or
`recommend before merge`. Return the finding to its owner, repair it, and
review the replacement tree; do not carry the contradiction across a boundary.

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
- QA PASS whose body contains zero outstanding substantiated payable findings;
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

Preflight the complete intended write set against the repository's governed-
context mechanism before the first mutation. If a canonical active task or
maintenance record is required, create it through the normal gate before the
implementation packet. Discovering missing authority only at commit time does
not authorize `--no-verify`, environment overrides, hook deletion, or a repair
descendant. Preserve the intended byte packet by digest, return to the last
accepted parent, add the truthful active authority record, reconstruct the
candidate, and run the normal hook. A bypassed commit may remain as forensic
evidence but never in prospective accepted history.

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
mister_clean_evaluator (Mister Clean role only; otherwise null)
```

The commit barrier records the four receipt digests, final candidate tree,
created commit, `commit^{tree}`, target expectation, lease/fencing token, CAS
result, and combined-object validation. A stale, missing, conditional, or
self-authored independent receipt blocks the ref.

For the Mister Clean repository itself, every commit barrier also selects a
read-only dogfood receipt produced by the last accepted installed release,
pinned by version, skill digest, executable digest, and runtime identity. The
working candidate may run as a shadow treatment to expose regressions, but it
cannot replace the pinned receipt or certify itself. The dogfood subject is the
same frozen tracked-plus-nonignored repository object as the candidate; any byte
change invalidates the receipt and restarts the barrier. Do not batch several
uncertified commits and test only their aggregate.

The machine record enforces this rather than relying on prose. Every
`mister_clean` role receipt binds `package_name`, exact version, registry
integrity, skill/executable/manifest digests, resolved entrypoint and package
root, resolution time, digest-bound evidence, and an `accepted_release_ref`
with a path and SHA-256. That reference is structural custody only: external
accepted-release verification remains a separate live-bundle authority. The
selected commit-barrier receipt must declare `accepted_release`; a
`candidate_shadow` receipt remains useful evidence but cannot authorize a
commit.

Live candidate or commit custody is also external to the working candidate.
The validator loads a separately retained guard-authority record, binds its
exact bytes, selected receipt seals, chronology, task tuple, candidate mint,
retained precommit authority, and current live Git state, then rereads those
inputs after the live checks. An inline copy is evidence content, not authority.

## Machine contract

Generic action manifests use schema 1.2. Every newly prepared GUARD closeout is
`manifest_kind: closeout_guard` schema 1.3 from initialization while reusing
schema-1.2 coordination semantics. `guard` records the baseline, candidate
tree, mint time, staged paths, frozen-writer state, role receipts, exact-tree
gates, no-harm result, and commit barrier. An initialized/closed scaffold needs
no external authority. A live passed/open or crossed/executed boundary is
validated with both external inputs:

```text
mister-clean validate bundle <bundle> --repo <candidate> \
  --accepted-evaluator <absolute accepted-release path> \
  --guard-authority <absolute guard-authority path>
```

Every receipt binds one run, round, pod, task, actor, actual model, reasoning
level, harness/session, the input-policy digests, the executed-check digest,
and its evidence.

Live schema-1.2 open/crossed/executed-commit GUARD authority is closed; create a
new schema-1.3 closeout instead of treating legacy bytes as newly authorized.

The open barrier selects exactly one final PASS receipt for each role. Each
embedded receipt carries `receipt_sha256`, computed over its canonical content
without that field; the barrier and `guard_commit` bind the exact
`{ receipt_id, receipt_sha256 }` pairs. Selected
actors and harness/session identities are distinct, findings reconcile to zero
unresolved, and selected receipts are non-mutating. DEV finishes the exact
candidate before QA and Mister Clean inspect it; holdout starts only after
their final receipts. Earlier failed or mutating attempts may remain in the
ledger but cannot open the barrier.

An executed `git_commit` carries `guard_commit`: approved candidate tree,
created commit, observed `commit^{tree}`, the exact four receipt seals, and a
digest-bound proof. The validator refuses a changed hook output, a mutation
recorded after tree mint, a conditional verdict, cross-task receipt reuse, or
integration/publication before the barrier crosses.

These checks establish current object and record coherence. They do not recover
actor authorship from labels, prove that historical mutex or compare-and-swap
operations actually executed, or establish an evaluator run without its own
bound execution evidence.

Every action has an explicit status: `planned`, `executed`, `failed`,
`blocked`, or `skipped`. An `executed` manifest contains only terminal action
statuses; an executed action requires verified, typed, time-bound,
digest-referenced evidence. A verified outcome or resulting `git_commit`
cannot be paired with a non-executed status. Once the exact-tree barrier
crosses, its manifest cannot retain a planned, failed, blocked, or skipped
action.

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
