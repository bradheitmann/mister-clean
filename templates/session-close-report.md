# SESSION CLOSE — {repo} @ {commit} — {date}

Operator: {agent/model/harness} · Session: {id} · Duration: {hours}
**Verdict: {CLEAN | NOT CLEAN}** {— NOT CLEAN whenever the pair check below has
an unpaid row without a recorded ruling}

> The end state of this session is the starting state of the next one.

## Paired-work check — no half-executed procedures left behind

| Started this session (first half) | Its second half | State at close |
|---|---|---|
| {DEV slice implemented} | {QA review} | {RAN — verdict at … / DEFERRED by recorded ruling … / **UNPAID — verdict is NOT CLEAN**} |
| {QA REJECT raised} | {remediation + same-finder re-verify} | |
| {enforcement/security fix by me} | {independent review} | |
| {escalation raised} | {ruling recorded on artifact} | |

{Every second half names who/what executed it — never the same agent that
implemented the first half where the system mandates separation.}

## Explicit acceptance criteria

Any criterion the OPERATOR stated explicitly (a named brand form, an exact
behavior, a required artifact). A positive verdict is INVALID while one is unmet
unless the operator explicitly waived it — a reviewer may not downgrade it.

| Criterion (id) | Source | Met? | Evidence (how verified) | Operator waiver (actor + ref), if unmet |
|---|---|---|---|---|
| {e.g. wordmark-uses-canonical-letterform} | operator | {yes / NO} | {command/bytes/screenshot proving met} | {operator + ruling ref — reviewer waiver does NOT count} |

_No explicit operator criteria this session → write "none"; never omit the section._

## Git

| | Target | Actual |
|---|---|---|
| Branches (local / remote) | main+≤1 / main | |
| Worktrees | 1 | |
| Stashes / dirty / untracked | 0 / 0 / 0 | |
| Ahead / behind | 0 / 0 | |
| In-progress ops | none | |
| Stale processes reaped (ownership-proven) | — | {n, ages} |

## Today's work, reconciled

| Item | Claim boundary reached |
|---|---|
| {slice/branch/change} | committed / pushed / CI green / QA-accepted |

## Metadata reconciled against git facts

{lane/status corrections made, or "none needed — metadata matched ground truth"}

## File placement

{files created today that landed outside their home → moved/folded/deleted;
or "everything created today is in its designated home"}

## Debris removed

{one line per item: what, proof it was safe, where content is preserved}

## Verification

- Repo's own gates: {exit codes} — run in {worktree AND fresh clone}
- Suite: {N passing / N failing} via {exact command}
- CI conclusions on the pushed head: {run ID, per-job}
- {management-layer closeout satisfied: yes / n-a}

## Left for tomorrow — irreducibly blocked only, with rulings

| Item | Why it could not be finished | Ruling recorded at | First action tomorrow |
|---|---|---|---|

## Pattern check

Most recent artifact of each type written today conforms to canon: {yes / fixed / no(why)}
No visible half-executed procedure survives into tomorrow: {confirmed / listed above with rulings}
