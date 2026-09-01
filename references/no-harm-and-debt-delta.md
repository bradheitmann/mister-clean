# No-harm and debt-delta protocol

Mister Clean is authorized to act; that authority includes responsibility for
the consequences of every action. The governing invariant is:

> Zero debt introduced by this run may cross an action, commit, merge,
> checkpoint, or handoff boundary.

This is stricter than net improvement. Ratios such as "ten paid, one created"
are useful telemetry for recognizing a poor approach, but never an acceptance
threshold. One new high-severity defect cannot be offset by any number of
cosmetic repairs.

## 1. Bind the comparison before mutation

For each atomic action, select the smallest complete comparator set affected
by that action. It always includes fresh Git status and the intended diff; add
the established formatter, linter, type checker, tests, planning validator,
generator reproducibility check, dependency/lock check, or topology/debris
census when the action can affect them. Record the exact command, scope,
detector version or digest, measured object, and result before mutation.

### File-corpus measurement is one canonical operation

Every seal, transfer, before/after comparison, and evidence-corpus count uses
`mister-clean census capture`. The producer record binds the algorithm version,
explicit roots, recursion policy, direct-root inclusion, exclusion set, regular
file policy, per-entry byte length and SHA-256, direct/nested totals, and the
aggregate digest. The sidecar lives outside the measured roots. Symlinks and
special files fail closed; enumeration and file reads are repeated and
stability-checked.

A seal additionally binds the full manifest to the exact RepositoryObject. It
is minted only after a quiescence barrier proves every writer stopped and
ownership released, then retained under immutable/read-only custody or as a
copied frozen object. The reviewer cannot make its first capture authoritative:
acceptance or integration requires a fresh post-review recapture against the
original seal. Any byte, path, executable metadata, or object-binding change
invalidates PASS and forces a new freeze; never overwrite or silently
regenerate the original evidence in place.

Do not compare counts emitted by different commands. `algorithm_mismatch`,
`scope_mismatch`, and `invalid_summary` are measurement failures; they neither
establish nor refute mutation. Only two valid compatible censuses can produce
`present` or `absent`. If a historical record lacks content-bound entries,
retain it as legacy evidence but do not let it establish CLEAN or a mutation
claim. This prevents a nested-only census from being mislabeled as a full-root
census and forwarding false remediation work.

The generic public action lifecycle always captures the wider physical state:
all refs and stashes; every worktree's topology, staged/unstaged/untracked
status, and ignored-path provenance; in-progress Git operations and locks; and
repository-relevant process identity. Process relevance includes a working
directory or open filesystem descriptor inside any governed worktree or its
Git metadata roots; a process is not invisible merely because it changed cwd.
Both process censuses must be complete.
The successor-readiness topology is derived from a digest-bound process census,
not initialized to an assumed empty list. Every repository-relevant process
outside the measuring invocation's ancestry is blocking, including a process
whose cwd is elsewhere but which still holds a governed file descriptor open;
live verification repeats the census before CLEAN.
The terminal action result digest-binds the before snapshot, after snapshot,
and exact delta. Any added stash, unexpected ref, secondary-worktree change,
ignored debris, Git control residue, or unestablished process blocks the
boundary even when every content detector improved.

An atomic action includes its necessary repair and focused validation. A
temporary red state inside that action is permitted; an open regression at its
boundary is not. If the action introduces debt, repair it within the same
atomic action or safely roll the action back, then rerun the same comparator.
Do not begin the next action while the boundary is open.

### Stateful transition symmetry

A fresh-instance end state cannot verify a toggle or configuration migration.
Enumerate every legal host for its value or marker, including fallback roots,
late-bound targets, storage, and duplicated runtime paths. Reuse the same state
for `A -> B`, `B -> A`, and every derived/system fallback in both directions;
normalize all possible prior hosts before applying the current state. Assert the
complete owned surface: keys, attributes, classes, listeners, caches, and
persisted values must be set, replaced, or removed symmetrically.

The matrix includes value transitions and host materialization/handoff:
pre-target -> post-target and direct -> alternate runtime path. Feed boot,
live-update, worker, generated, and packaged paths the same ordered trace where
applicable, then prove no stale representation remains anywhere. Keep the
matrix topology-specific; this is not a general state-machine analyzer.

### Repository-native controls follow changed objects

If any action will change the full repository object, capture one native-gate
control on the frozen baseline. Every action that actually produces a different
repository object then requires a distinct post-state control bound to that
exact object. This applies to `closed` and `interrupted` actions alike: an
interruption is not permission to leave the mutated state unmeasured. An action
whose before and after repository objects are identical may omit a redundant
native run and carry the prior state forward.

At each changed boundary, compare the prior and post discovery catalogs. A
previously required gate may not disappear, become non-required, or change its
kind. A legitimate gate-policy migration needs an explicit, separately
authorized contract; ordinary cleanup cannot weaken the instrument that judges
it. Definition changes remain visible through their content identity and the
new definition must be executed on the new object.

Preexisting native failures remain baseline debt; they are not falsely charged
to the action merely because the action reran them. A native failure that first
appears after the action is action debt and blocks a `closed` boundary. The
successor native control must agree with the last changed action's catalog and
derived observation set. `CLEAN` additionally requires that final control to be
directly passing. Never reuse a baseline proof as post-state evidence.

## 2. Classify causality; never infer it from one total

Every finding present at the end belongs to exactly one origin:

- `baseline` — the same finding is evidenced at the frozen start object.
- `newly_discovered_preexisting` — a later or improved detector exposed it,
  but replay against the start object proves the underlying defect was already
  present.
- `concurrent_external` — another owned writer or moving target introduced it
  after the start; bind the writer/change evidence and integrate or coordinate.
- `introduced_by_run` — it first appears because of a Mister Clean action,
  including generated debris, stale projections, broken gates, scope leakage
  added to a detector, or an incomplete multi-file repair.
- `unestablished` — the observation is real but the available evidence does not
  establish its cause. This is honest uncertainty and forbids CLEAN.

Origin is not disposition. All payable findings are still paid. The origin
prevents false diagnosis and makes Mister Clean repair its own damage first.
The run may not self-label a finding pre-existing without replay or equivalent
start-object evidence.

Every non-baseline origin reference is bundle-contained and digest-checked.
`observation_evidence_ref` must be one of the detector/native references that
actually produced an owned observation. `introduced_by_run` additionally names
the earliest ordered action where an owned observation appeared and cites that
action's bound result. `newly_discovered_preexisting` also carries a
`baseline_replay_ref`: a canonical registered-detector replay over the exact
frozen baseline repository object that reproduces the same normalized root and
observation set. `concurrent_external` also carries a typed `change_ref` binding
the exact before/after repository objects, earliest observing action, changed
paths, and distinct writer/observer execution identities. A generic receipt or
an existing but unrelated file proves neither origin nor causality.

### Raw observations are not payable root debts

Retain every atomic detector observation with its stable ID, detector, bound
snapshot, subject path, and evidence references. A nonzero raw observation
count forbids CLEAN until triage, but it does not authorize one completion-debt
row per symptom.

A payable root debt is one independently repairable cause. It records a stable
`cause_key`, normalized affected field/invariant, all impacted raw-finding IDs,
affected paths, observation count, and repair boundary. Cross-artifact grouping
requires causal evidence: a common remedial commit or range, one declared
reconciliation record, or one connected artifact component violating the same
invariant on the same bound snapshot. Without that evidence, cluster only
within one artifact. Expose `raw_finding_count`, `root_debt_count`,
`suppressed_by_typed_nonartifact_count`, and `candidate_probe_count`
separately; never substitute one cardinality for another.

## 3. Keep detector change separate from repository change

Never compare different branches, commits, scopes, or detector versions as if
they were one time series. When a census changes unexpectedly, run the old and
new detector against the same frozen object and the same corpus. Partition the
delta into rule expansion, scope change, false positives, and repository
change. Fix a detector scope leak in the detector; do not edit test fixtures or
historical evidence merely to reduce its count.

Use stable finding fingerprints made from detector identity, rule, canonical
subject, and evidence location. Human-readable wording is not identity.

## 4. Regression-delta record

The closeout report binds a digest-referenced
`mister-clean.regression-delta` schema-1.5 sidecar minted by `mister-clean
prepare`. Schemas 1.2 through 1.4 remain legacy-readable for honest NOT CLEAN
records; none can establish CLEAN. The packaged 1.4 JSON is an illustrative
template only. It cannot be promoted by filling placeholders or relabeling its
verdict.

Schema 1.5 never adds raw observations to normalized debts. It carries two
separate identity ledgers:

- the observation ledger identifies each detector/native observation as the
  canonical hash of its versioned source ID and source-native fingerprint;
- the root-debt ledger identifies each independently repairable cause as the
  canonical hash of the exact portable repository identity, versioned
  normalizer, and canonical cause key.

Every observed ID maps to exactly one root debt. One root debt may own many
observations. Baseline, observed, appeared, resolved-before-boundary, open-at-
boundary, and closing sets are exact sorted identity sets, never arithmetic
over unlike units. Schema 1.5 rejects every legacy count field by presence,
even when a producer disguises the value as text or null.

The validator independently recomputes every expected root partition from the
preserved detector and native-gate bytes. Every expected root must appear in
the report, every root must own at least one observation, and one observation
cannot be projected into two different repair causes. Report omission is an
error, not a zero-debt claim. Native failure fingerprints and cause partitions
come from one shared generator/validator function so the preparer cannot create
the very identity drift the validator later calls debt.

Every comparator observation also binds the exact raw output bytes through a
bundle-contained `{path, sha256}` `result_ref`; `result_sha256` must equal that
file's independently recomputed digest. A plausible hash with missing or
different result bytes is not evidence and cannot close an action boundary.
For registered comparators, the preserved bytes must also parse as
that detector's machine-readable result; the validator derives the finding
fingerprints and exit status from those bytes rather than trusting duplicated
ledger claims.

Schema 1.5 additionally binds the frozen detector registry, exact run policy
and digest, an applicability row for every detector family, complete baseline
executions, full portable repository objects, and the exact runtime that
executed and now validates the evidence. Registry-label identity and runtime-
package identity are separate hashes. CLEAN requires a live verifier-minted,
release-attested capability whose exact package manifest and CLI entrypoint
match the recorded runtime; source-development and bundled HTTP-worker
identities remain honest NOT CLEAN evidence only.

Every detector fingerprint maps to one completion debt; omissions do not
become silence. An action uses the smallest nonempty policy-applicable detector
subset that can observe what it may disturb, while the final CLEAN boundary
reruns the complete required universe against the exact closing object.
Public-safety applicability follows the bound tracked-shippable-surface policy;
a supplied denylist is frozen and digest-bound.

The identity sets must reconcile. A `closed` action boundary has zero open debt.
An `interrupted` boundary is honest only in a NOT CLEAN report, as the last
observed action, with no later action performed. CLEAN requires an empty
evidence-derived closing observation set, complete ordered action coverage,
matching full repository-object snapshots, a digest-valid sidecar, fresh live
detector reruns, and green repository-native gates.

## 5. Response to harm

The first newly introduced regression becomes the action's highest-priority
debt. Pause unrelated cleanup, repair or safely roll back, rerun the affected
comparators, and only then resume the debt queue. Two consecutive action
rollbacks or repeated reintroduction of the same class triggers a strategy
review: choose a smaller or more systemic repair, but do not turn review into
an off-ramp. The skill continues paying debt.

This protocol does not defang Mister Clean. It prevents the skill from buying
apparent progress with successor cost — the exact hand-forward it exists to
eliminate.
