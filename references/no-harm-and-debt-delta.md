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

An atomic action includes its necessary repair and focused validation. A
temporary red state inside that action is permitted; an open regression at its
boundary is not. If the action introduces debt, repair it within the same
atomic action or safely roll the action back, then rerun the same comparator.
Do not begin the next action while the boundary is open.

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

Origin is not disposition. All payable findings are still paid. The origin
prevents false diagnosis and makes Mister Clean repair its own damage first.
The run may not self-label a finding pre-existing without replay or equivalent
start-object evidence.

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
`mister-clean.regression-delta` sidecar. It records:

- baseline and closing objects;
- baseline findings split into paid and still open;
- newly discovered pre-existing and concurrent-external findings, paid/open;
- run-introduced findings, paid/open;
- one ordered no-harm check for every executed action, including its before and
  after snapshot, exact comparators, introduced/paid/open counts, timestamp,
  and boundary status.

The arithmetic must reconcile. A `closed` action boundary has zero open debt.
An `interrupted` boundary is honest only in a NOT CLEAN report, as the last
observed action, with no later action performed. CLEAN requires zero
`introduced_by_run_open`, complete action coverage, matching bundle snapshots,
and a digest-valid sidecar.

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
