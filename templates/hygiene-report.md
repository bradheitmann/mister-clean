# HYGIENE REPORT — {repo} @ {commit} — {date}

Mode: {AUDIT | CLEAN | CLOSE | CONFORM | GUARD} · Operator: {agent/model/harness} · Session: {id}
Systems (Phase 0): planning = {system + artifact root} · procedure graph =
{the pairs this system declares} · orchestration = {topology} ·
management = {layer or none} · enforcement = {hooks/gates + latest run conclusions}

---

## 1. Verdict — the no-handoff test

**{CLEAN | NOT CLEAN}** — machine-gated: the live-bound closure bundle
is validated (CLEAN is refused while any debt is open/blocked/not_assessed or
any disposition is decision_or_coordination_required). {one paragraph: could a team with no prior
background and no handoff clone this, read the entry points, pick up the
dispatch, and produce conforming work? If NOT CLEAN, the specific artifacts or
open procedures that would mislead them.}

**Verdict gate:** any unpaid completion debt without a recorded operator
ruling forces NOT CLEAN, regardless of everything below.

## No-harm delta

Baseline object: {commit} · Closing object: {commit} · Comparator identity:
{tool/version/digest + scope}. Identity sets come from the digest-bound
schema-1.5 `regression-delta.json`, never from unlike branches, detector
versions, or arithmetic between raw observations and normalized root debts.

Observation ledger: baseline {N + digest} · closing {N + digest} · Root-debt
ledger: baseline-present {N + digest} · closing-present {N + digest}.

| Root-debt origin | Satisfied | Present at close |
|---|---:|---:|
| Baseline | | |
| Newly discovered pre-existing (start-object replay proved) | | |
| Concurrent external | | |
| Introduced by this run | | **0 required for CLEAN** |

Action boundaries: {N/N closed with empty
`open_at_boundary_observation_ids`; list any final interrupted boundary}. Net
improvement does not excuse an introduced regression.

## Explicit acceptance criteria

Any criterion the OPERATOR stated explicitly (a named brand form, an exact
behavior, a required artifact). A positive verdict is INVALID while one is unmet
unless the operator explicitly waived it — a reviewer may not downgrade it.

| Criterion (id) | Source | Met? | Evidence (how verified) | Operator waiver (actor + ref), if unmet |
|---|---|---|---|---|
| {e.g. wordmark-uses-canonical-letterform} | operator | {yes / NO} | {command/bytes/screenshot proving met} | {operator + ruling ref — reviewer waiver does NOT count} |

_No explicit operator criteria this session → write "none"; never omit the section._

## 2. Completion debt — procedures finished before anything was cleaned

Every row carries a DISPOSITION: autonomously_repair · autonomously_validate ·
accepted_exception (authority+scope+rationale) · decision_or_coordination_required
(never CLEAN). Cascades EXECUTED are listed with verdicts, reviewers, and
rerun evidence — a queue entry is not an execution.

**Persistence checkpoint:** {ledger location · latest checkpoint ref · debts
claimed by this run · next resumption action if interrupted}

| Procedure (first half → second half) | First half state | Second half | Action this session |
|---|---|---|---|
| {DEV slice → QA review} | {done/merged, evidence at …} | {RAN → verdict at … / DEFERRED by recorded ruling … / UNPAID} | {dispatched + result / ruling quoted / why unpaid} |
| {QA REJECT → remediation → re-verify} | | | |
| {escalation → recorded ruling} | | | |
| {story complete → holdout run} | | | |

{Every UNPAID row without a ruling = the verdict above is NOT CLEAN.
Self-certified pairs are forbidden — name who/what executed each second half.}

## 3. Git state

**Target binding:** {target ref @ commit} · candidate {commit} · merge-base
{commit} · target commits missing: {0} · candidate commits ahead: {n} ·
measured by {exact command/result}. A stale candidate cannot support CLEAN.

| Surface | Target | Before | After | Status |
|---|---|---|---|---|
| Local branches | {policy-derived allowed set} | | | |
| Remote branches | {policy-derived allowed set} | | | |
| Worktrees | {policy-derived owned/dispositioned set} | | | |
| Stashes | 0 | | | |
| Tracked dirty | 0 | | | |
| Untracked | 0 | | | |
| Ahead / behind origin | 0 / 0 | | | |
| Orphaned remote-tracking refs | 0 | | | |
| Tracked absolute-path symlinks | 0 | | | |
| In-progress ops (merge/rebase) | none | | | |
| Stale repo-holding processes | 0 | | | |

## 4. Planning corpus

**Census** — {counts by artifact type, with locations}

| Artifact | Count | Location |
|---|---|---|

**Integrity**

| Check | Result | Detail |
|---|---|---|
| Pairing parity (artifact-level; execution parity is §2) | | orphans listed by ID |
| Parentage (schema's actual fields) | | missing / dangling by ID |
| Coverage (parents with children or recorded deferral) | | gaps by ID |
| Vocabulary conformance (phase/status enums) | | violations by ID |
| Validator pass (repo's own validators) | | exit codes |
| Ground-truth reconciliation (metadata vs git facts) | | contradictions found + corrected |
| Terminal-state honesty (evidence per done artifact) | | exceptions + their ratified basis |

## 5. Code hygiene — ten dimensions, each clean or dispositioned

| Dimension | State | Findings (evidence-bound envelope) |
|---|---|---|
| Discoverability | {clean-inspected / findings} | |
| Structure | | |
| Naming | | |
| Boundaries | | |
| Dead/duplicate | | {deletions carry the absence proof, all channels} |
| Documentation | | |
| Tests | | {skipped/quarantined: owner + exit condition} |
| Generated artifacts | | |
| Config/dependencies | | |
| Ownership/custody | | |

**Ratchet ledger:** {each repaired systemic defect → the established-runner
enforcement added + its negative-control proof, or the recorded reason
enforcement is inappropriate}

## 5b. File placement — every folder honestly assessed

| Location | Purpose (one line) | Findings | Action |
|---|---|---|---|
| {root} | {…} | {naked docs, unjustified entries} | {moved to … / folded into … / deleted (reason)} |
| {each top-level dir} | | | |

{A directory whose purpose cannot be stated in one line is itself a finding.
Every moved/removed file appears in the debris ledger below.}

## 6. Validation

| Gate / suite | Command | Object measured | Where run | Result |
|---|---|---|---|---|
| | | | worktree / **fresh clone** / CI | |

Fresh-clone authority: {gates re-run in a fresh clone, exit codes. Any green
that exists only in the worktree is a property of the machine — say so.}

CI conclusions: {latest run ID + per-job conclusions on the pushed head —
wiring is not execution.}

Positive controls: {which repaired/added checks were demonstrated to go RED.
"Not demonstrated" is admissible; an undemonstrated check must not be
described as protection.}

Test counts: {N passing / N failing, WITH the exact command per count.}

## 7. Debris ledger — every removal, with proof

| Item | Class | Action | Action exit + POSTCONDITION verified (fresh ground truth) | Content preserved at |
|---|---|---|---|---|
| {branch/ref/file/process/worktree/doc} | | deleted / moved / ignored / committed / reaped | {0-ahead + state-match + anchor; ownership chain; consolidated into …} | {path or "n/a — nothing unique"} |

## 8. Pattern integrity — intelligent momentum

- Most-recent artifacts per type conform to the canonical template: {yes/no, by type}
- Surviving counterexamples an agent could sample: {list, or "none found"}
- Retroactive conformance applied: {N artifacts swept — structure only;
  semantic content preserved}
- Visible half-executed procedures remaining: {none / listed in §2 with rulings}
- Entry-point docs verified current at {commit}: {list}

## 9. Residuals — irreducibly blocked only

{Residuals are items that COULD NOT be executed — needs a principal ruling,
an external system, a human. Payable work does not belong here; it belongs in
§2, paid. An empty section is rare and suspect; a section full of payable
work is a failed close.}

| Residual | Why irreducibly blocked | Ruling recorded at | Owner / next step |
|---|---|---|---|

## 10. Claim boundaries

| Claim | State |
|---|---|
| Committed locally | |
| Pushed to {remote} | |
| CI green on the push | {run ID + conclusions} |
| Deployed | {or "n/a — no deploy in scope"} |
| Independently QA-accepted | {verdict pointer — or the §2 row that pays it} |

## 11. Entry points for the next team

{The ordered list of files a stranger reads first, each verified current at
this commit. This section IS the handoff.}

1. {README / equivalent} — {one line on what it gives them}
2. {dispatch} — {what to execute}
3. {readiness / decisions record} — {what is settled and what is open}
