# Concurrent remediation — one transaction, four controls

Parallel cleanup is useful only when it shortens the path to a cleaner integrated
tree. This protocol combines four compatible ideas without requiring any
particular VCS, router, or agent harness:

1. **Worktree isolation:** contain every modifying lane in its own branch and
   worktree.
2. **Operation accounting:** record each material action as an append-only,
   parent-linked state transition.
3. **Mutex + compare-and-swap integration:** serialize the shared-ref mutation
   with a short lease and fencing token, then integrate only against the target
   object the integrator actually measured; reject and rebind when it moved.
4. **Task-boundary routing:** route bounded work by dependencies, collision
   domains, context fit, and demonstrated competency; evaluate what actually
   ran, not the requested label.

These are one transaction protocol. Isolation without accounting loses the
causal story. Accounting without compare-and-swap records stale integrations
beautifully. Routing without coordination-domain claims creates traffic. Integration
without final combined validation creates a green collection of parts and an
untested whole.

## Roles

- **Dispatcher:** the one accountable scheduler. It owns the task DAG, lane
  queue, local-inference baton, and owner transitions. It does not become the
  sole source of truth; repository and evidence records remain authoritative.
- **Integrator:** the only active writer to the shared closing candidate and
  shared projections. It may be the dispatcher, but the two responsibilities
  remain explicit.
- **Worker:** owns one bounded lane and stops after publishing its candidate,
  write set, gates, and unresolved findings. It never merges itself into the
  shared candidate unless it is also the recorded integrator.
- **Independent verifier:** tests a candidate or combined object it did not
  implement. Verification does not authorize it to mutate the worker's lane.

Role authority survives continuation and compaction unchanged. A `continue`
message resumes the assigned task; it never converts a read-only verifier into
a writer, expands its read set, or grants repository repair authority. If a
read-only lane writes anyway, freeze it immediately, preserve the exact diff
and partial result, mark the receipt authority-contaminated, and require a new
independent verifier. Do not let a useful finding launder the ownership breach.

Mister Clean may act as dispatcher/integrator in a single-agent close. During a
larger project, the project orchestrator normally dispatches while Mister Clean
audits the transaction and refuses false closure.

## Admission gate before the first write

Before a lane's first modifying command, commit, or generated repository artifact:

1. Re-read every worktree, branch, owner claim, and observed writer.
2. Prove the worker has a distinct owned worktree and branch. The shared
   integration worktree is not a worker lane, even for a bare Mister Clean
   invocation.
3. Register its baseline, write boundary, versioned coordination-domain claims,
   and operation parent.
4. If any writer or ownership fact is unknown, remain read-only until the
   dispatcher resolves it.

If the integration branch moves unexpectedly, freeze all writers and preserve
the new object. Record who created it if knowable, inspect its exact diff and
gate evidence, rebind the expected target, and let the integrator explicitly
accept or reject it. Do not reset it away, build more work on an unreviewed
object, or push it merely because the operator asked to keep the remote current.
The push authorization remains valid after the object is accepted; target
verification is part of executing that authorization correctly.

Classify Git commands by effects, not by the operator's intent. `git
write-tree`, index refreshes, worktree administration, and object/ref probes
may acquire locks or write object-database state even when invoked only to
"read" a candidate. They belong to the owning write lane and run sequentially.
A transient `index.lock` collision invalidates that observation; remove no lock
by assumption, first prove the owning process is gone and the index/tree bytes
are unchanged, then repeat the probe once under exclusive custody.

## Protected-read custody

Protected holdout, evaluator, secret, and sealed-evidence bodies are a read
boundary, not a prompt preference. Before admitting any lane that must remain
blind:

1. Enumerate protected bodies, separately exposed metadata projections, and
   every planned read/search/gate root.
2. Expand globs and batch inputs. A recursive root that is an ancestor of a
   protected body is forbidden even when the search term appears harmless.
   Exclusion syntax is tool-specific: a Git pathspec is not an `rg` glob, and
   an accepted command line is not proof of the files it will read. Before the
   substantive command, use that exact tool's native file-list/dry-run mode to
   materialize the read set and reject it if any protected path appears.
3. Externalize protected bodies from the lane or enforce a filesystem/harness
   deny boundary. Sparse visibility or a path-guard may prevent accidental
   traversal, but adversarial independence requires a boundary the actor
   cannot override. A prose-only prohibition is never sufficient custody.
4. Give native gates only the authenticated metadata projection they actually
   require. If a gate cannot run without protected scenario, criteria,
   verdict, or execution content, the dispatch contract is impossible and the
   lane stays unadmitted.
5. Bind the enforcement mode and its evidence in the lane receipt. Check it
   again after continuation, harness restart, worktree replacement, or scope
   expansion.

If protected bytes are exposed, stop immediately. Preserve the candidate and
the exact exposure, revoke the actor's positive authority for the affected
implementation/review, and assign an uncontaminated replacement. The exposed
actor's technical observations may remain diagnostic evidence, but cannot
certify the candidate. Repeating the same warning to a new actor without
installing the missing boundary is a process-defect loop, not remediation.

## The canonical record

Do not create a second queue or private coordination database. Generic
coordination and operation history use `action-manifest.json` schema 1.2:

- `coordination` records dispatcher, integrator, target expectation, policy,
  versioned coordination domains, and the current lane registry.
- `coordination.lanes[]` records the task boundary and execution identity.
- `actions[]` is the operation log. Each action is an operation whose parents
  must already appear in the array.
- `git_integrate` actions carry the compare-and-swap attempt and result.
- `planning_record_update` actions carry one atomic projection transaction.
- Every newly prepared GUARD closeout is `closeout_guard` schema 1.3 from
  initialization, reuses these schema-1.2 coordination semantics, and carries
  the exact staged tree, role receipts, deterministic gates, no-harm receipt,
  and commit-barrier state.
- `git_push` actions carry the release barrier and remote compare-and-swap
  observation. A push is never inferred safe from a generic action receipt.

A lane records:

```text
id + task_id + owner
role: read_only | writer | integrator
state: queued | active | ready | integrated | retired | blocked
execution_class: hosted | local_inference
actual model + reasoning + harness + verified safe context limit
estimated context + evaluation mode + routing reason
worktree + branch + baseline commit (required for modifying lanes)
bootstrap: observed cwd/worktree + branch + HEAD + time + digest-bound receipt
read paths + write paths + versioned coordination claims
dependencies + invariants + acceptance boundary
```

An action additionally records:

```text
lane_id + task_id
parent_operation_ids
before_object + after_object
recorded_at
```

This is Jujutsu-style in the useful sense: the log explains how repository
state moved, supports branching causal histories, and lets a successor resume
from the last verified object. It does not claim to reproduce Jujutsu or
require `jj`.

Schema 1.0 remains readable only with
`legacy_schema_acknowledged: true`; schema 1.1 retains string-valued
`collision_keys` for prior records. Neither silently inherits the stale-plan
protections that schema 1.2 records. New coordination runs use 1.2.

Schema 1.3 does not replace the schema-1.2 operation graph. Its
initialized/closed state needs no external inputs. Live passed/open or
crossed/executed validation requires separately retained accepted-evaluator and
guard-authority files; live schema-1.2 open/crossed authority is closed. Never
copy either external file inline and treat the copy as authority; the validator
must load and recheck both against the live repository.

## Route by boundaries, not filenames alone

Before dispatch:

1. Name one independently verifiable task outcome.
2. Name its dependencies and parent operation IDs.
3. Bound reads and writes. Read scope may be broad when discovery requires it;
   write scope stays narrow.
4. Claim **versioned coordination domains** for shared invariants such as
   `planning-projections`, `package-lock`, `generated-index`, `acceptance-seal`,
   or a composition root. `coordination_key` is the canonical machine concept;
   **semantic conflict key** is its discovery alias. Bind every read or write
   claim to the domain version and state digest against which the plan was
   authored.
5. State protected invariants and acceptance checks, including the no-harm
   comparator.
6. Estimate context demand and route below the candidate's verified safe
   context limit.
7. Match the task to demonstrated competency: scouting, implementing,
   integrating, verifying, and full closeout are different abilities.

Build waves from the dependency DAG and coordination graph. Tasks may share a
domain only when all claims are read-only or symmetric commutativity is
explicitly proven by the same digest-bound policy. Otherwise combine the work
into one coherent task or serialize it. A wave is a concurrency ceiling, never
a new completion prerequisite. Do not create work merely to fill seats.

Execution resources are coordination domains even when all lanes are read-only.
Declare expensive shared-machine gates such as `full-root-suite`,
`vendored-tree-hash`, and `browser` before dispatch; admit one owner per domain.
Record planned concurrency, actual start/end intervals, overlap, and machine
conditions in the evidence. A timeout during overlap is `resource_contention`
or `unestablished`, not candidate failure, until the exact gate reruns
quiescently. Do not raise the timeout as the first remedy, and do not use the
queue as permission to skip payment.

## Versioned coordination domains — serialize the plan, not only the write

A lock can serialize two writes while still admitting a stale plan: lane B may
wait politely for lane A, then execute assumptions authored before A changed
the shared invariant. Git can merge that result without a textual conflict.

Schema 1.2 closes that front door. Each `coordination.domains[]` entry records:

```text
key + monotonic version + invariant-state SHA-256
observed_at + digest-bound observation evidence
```

Each lane's `coordination_claims[]` records:

```text
key + access(read|write)
expected_version + expected_state_digest
operation_class
commutes_with + commutativity_ref
```

Admission compares the claim with the live domain before the first mutation.
Integration repeats the comparison in `coordination_cas[]` for every domain the
source plan read or wrote. A mismatch rejects integration and requires a new
plan and new attestations; a clean textual merge is irrelevant. A successful
write advances the domain by exactly one and binds its new state digest. Read
claims preserve both values.

Commutativity is a bilateral proof obligation. Two active claims sharing a
domain may overlap only when both are reads, or when each operation class names
the other in `commutes_with` and both cite the same digest-bound policy. Never
infer commutativity from disjoint paths. Coarse domains are acceptable at
first; refine them only with evidence that the narrower operations preserve the
invariant.

This is Switchyard/Wayfinder-style in the useful sense: routing happens at a
declared task boundary with explicit eligibility and fallback. It does not
require either project and never treats a router's requested model name as
execution evidence.

## Local inference is an exclusive lane

Local inference has one baton. The dispatcher may have many queued local
lanes, but at most one local model may be loaded or generating at a time.

Before handing off the baton:

1. Record the prior result or failure.
2. Observe the prior runtime finished and unloaded or quiescent.
3. Record the new owner, exact installed model, reasoning mode, harness/router,
   safe context limit, and any verified extension configuration.
4. Dispatch a packet whose estimated context fits below that limit.

A backend collision invalidates the trial as orchestration evidence; it is not
a model-quality failure. Do not pulse-check a working model. Slow local
generation is expected. In Pi, `Error: request exceeded the total time budget`
can be a recoverable harness/configuration pause, especially for local models;
it is not by itself a model failure or a terminal task timeout. Preserve the
same task and sample, send `continue` plus Enter, verify visible resumption, and
record the pause count and added wall time as harness observations. Do not
dispatch a duplicate or hand the local-inference baton to another model while
the resumed task remains live.

## Append-only operation accounting

Add an action immediately before or when it becomes concrete. Never rewrite a
failed or rejected operation into success; append the repair or retry as a child
operation. An operation closes only when:

- its output object is recorded;
- its stated acceptance and no-harm comparators ran on that output;
- every changed repository object has its own bound post-state native-gate
  control, even when the operation was interrupted;
- cleanup-introduced open debt is zero;
- its evidence is time- and object-bound; and
- any shared projection changed by the operation moved atomically.

One root cause may affect many observations. The operation names the causal
repair once and retains every impacted observation; it does not manufacture one
independent debt or action per symptom.

### Atomic planning projections

A `planning_record_update` records one `projection_transaction`: stable
`cause_key`, canonical `source_of_truth`, the complete `required_projections`,
the exact `updated_projections`, `atomic: true`, and a digest-bound post-update
coherence audit on the resulting object. Required and updated projection sets
must be equal. The lane owns a versioned write claim on the
`planning-projections` coordination domain, so no second writer can terminalize
a story or alter its epic/rollup concurrently.
Updating the story without its affected epic, index, dispatch, or management
rollup is an open action boundary, not partial success.

## Mutex plus compare-and-swap integration

The integrator processes ready candidates sequentially:

1. Prepare and validate the combined candidate in the exclusive integration
   worktree without holding the shared-ref lock.
2. Acquire the target ref's short-lived integration lease. Record its unique
   lease ID, integrator lane, monotonically increasing fencing token, acquired
   time, expiry, and maximum duration. Never hold the lease while implementing,
   waiting for an agent, or running the long suite.
3. While the lease is live, resolve and record `expected_target_commit`, then
   resolve `observed_target_commit` again at the actual mutation boundary.
4. If they differ, record `rejected_target_moved`; do not apply the stale
   candidate. Rebind, incorporate the new target, and rerun affected lane gates.
5. If they match, apply the already-validated shared-ref mutation using the
   current fencing token, then release the lease immediately. An expired lease
   or superseded fencing token has no write authority even if its former holder
   wakes up later.
6. Run focused checks, then the full affected suite and same-detector debt
   delta on the resulting combined object.
7. If any established gate regresses or new debt appears, record
   `rejected_regression`, preserve the candidate, and route the failure back to
   its owner. Do not integrate the next candidate through a broken barrier.
8. On success, record `applied`, the resulting commit, evidence, and atomic
   projection updates; then update the next expected target.

The mutex and CAS are not substitutes. The mutex prevents simultaneous shared
writers. CAS prevents the sole lock holder from writing assumptions made
against an older target. A lease prevents a crashed holder from blocking the
system forever; the fencing token prevents that stale holder from resuming and
writing after its lease was replaced.

This is Origin-style in the useful sense: a candidate cannot silently write
through a stale target expectation. No force-push or history rewrite is
implied.

## Push barrier — publication follows proof

`git_push` is an integration operation, not routine synchronization. Its
`push_gate` binds the candidate, expected and freshly observed remote object,
remote ref, timestamp, frozen-writer state, clean integration worktree,
digest-bound review, affected/full validation, no-harm evidence, and prior
remote CI state. `expected_remote_commit` must equal
`observed_remote_commit`; otherwise reject and rebind.

There are only two push intents:

- `coherent_wave`: the direct parent is the applied `git_integrate` operation
  that produced the candidate, and the prior remote CI is green (or CI is
  explicitly not configured).
- `minimal_ci_repair`: the prior remote CI is red and the direct parent is the
  reviewed, validated repair commit. This is the narrow exception that lets a
  broken remote be repaired without smuggling an unrelated wave through it.

Both require zero `known_failing_gates`. A failure already discovered by a
verifier is push-blocking even when someone labels it test infrastructure,
historical, low severity, or outside the product surface. Classification routes
ownership; it never waives an established gate. An executed push also records a
`remote_ref_resolution` receipt and watches the resulting CI to a terminal
state before the next publication.

## Honest evaluation

Keep two ledgers conceptually separate inside the same evidence home:

- **Naturalistic field evidence:** what a model actually did on live work. Score
  only the competency exercised and whether the result survived integration.
- **Controlled trial evidence:** the same frozen corpus, prompt, policy, time
  boundary, and scorecard for every candidate.

Always record actual model, reasoning, harness, fallback, context ceiling,
elapsed time, mutations, ownership violations, integration regressions, and
survival after merge. Hard-gate failures override weighted scores. Never rank a
scout as a full closeout runner without full-runner evidence.

The dispatcher stamps model identity and runtime provenance from externally
observed execution state immediately before dispatch and immediately before
scoring. A pane/tab title is only an intended label; worker self-report is only
an untrusted comparison. Bind model, harness, reasoning, route, harness session,
and process instance to an evidence-backed identity lease. Restart, relaunch,
provider fallback, route/configuration change, or session/process replacement
invalidates that lease. Preserve dispatcher observations and any worker
self-report as separate evidence fields. If they disagree, the task is
`identity_unbound`: keep its technical findings, but do not attribute its
performance to either model tuple or use it in a model ranking until an
independent runtime receipt resolves the discrepancy. A mismatch blocks a new
dispatch; a missing or changed scoring-time readback contributes zero quality
credit. Do not consume a
worker's task budget asking it to reverse engineer its own model card, and
never let the worker infer an unknown reasoning level or provider fallback. A
declared experiment deadline reached without the required artifact is a
completion failure even when the visible reasoning looked promising. A
recoverable Pi total-time-budget pause is not that deadline: resume it in place
with `continue` plus Enter and attribute the pause to the harness, not the
model.

Reasoning level is part of execution identity, not a monotonic quality setting.
Use the progressive model-by-reasoning trial in
[`evals/model-hygiene-trial.md`](../evals/model-hygiene-trial.md): screen every
available tuple read-only, run every model from its lowest exposed reasoning
level upward on fresh calibrated tasks, then qualify finalists on identical
disposable closeout repositories. Treat the first harness-native campaign as an
ecological comparison: hash the relevant harness configuration and defer a
minimal clean-room confirmation to a separately frozen environment.
Measure prerequisite inflation, change amplification, artifact residue,
cleanup-introduced debt, and time to independently verified CLEAN. A smaller or
lower-reasoning model that reaches the same end state with less residue is the
better runner for that task class.

## CLEAN gate

A concurrent close cannot be CLEAN while any of these hold:

- two active modifying lanes share a worktree or branch, overlap on write
  roots, or hold incompatible claims on one coordination domain;
- two active modifying lanes have parent/child-overlapping write roots;
- more than one local-inference model is active;
- an active/ready modifying lane lacks a digest-bound cwd/HEAD/branch bootstrap;
- a dispatched task lacks invariants or an acceptance boundary;
- an action's parent is absent or appears later in the log;
- an executed action lacks a resulting object;
- an integration was applied after its target expectation changed;
- an integration mutation lacks a live non-overlapping lease and fresh fencing
  token;
- a candidate has not survived combined-object validation;
- a planning update changed fewer projections than its declared affected set;
- a push lacks a direct candidate-producing parent, fresh remote CAS evidence,
  a clean/frozen boundary, or has any known failing gate;
- an active/ready lane is unowned, over its verified context ceiling, or absent
  from the manifest; or
- the operation log, repository topology, and observed agent surfaces disagree.

When the records disagree, stop integrating, freeze writers if necessary, and
reconcile truth before more work. Traffic management is part of hygiene, not an
excuse to hand debt forward.
