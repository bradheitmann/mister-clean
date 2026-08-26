# Four-role rotation campaign

Use this optional campaign to operate continuous-clean development with a large
agent fleet while learning which execution tuples are reliable in DEV, QA,
Mister Clean, and holdout roles. Read
[model-hygiene-trial.md](model-hygiene-trial.md) for controlled-trial scoring and
[`../references/continuous-clean-development.md`](../references/continuous-clean-development.md)
for the commit barrier.

The unit being evaluated is always:

```text
actual model artifact × harness fingerprint × observed reasoning level × role ×
difficulty × task family × Mister Clean version
```

A model name alone is not a result.

## Campaign shape

The 16-seat profile runs four independent pods per full round:

```text
4 pods × (DEV + QA + Mister Clean + holdout) = 16 role assignments
```

The dispatcher/integrator is outside those 16 role assignments. Seats remain
visually and operationally stable; model or reasoning changes occur only at a
task boundary after the seat has no live candidate, receipt, or write lease.
Local-inference seats may be marked `eligible: false` for production roles and
kept in a separately serialized experimental lane.

Do not invent work to keep four pods full. Build each round from the dependency
DAG and versioned coordination-domain graph. When fewer than four production tasks are
runnable, leave seats idle or use bounded read-only controlled packets that do
not delay the critical path or touch a production worktree.

## Seat registry

Keep one operator-side registry; do not commit machine-specific pane IDs or
account details to a public repository.

```text
seat_id + stable_surface_location
actual_model_artifact + provider/router
harness_name + harness_version + harness_fingerprint
observed_reasoning_level + exposed_reasoning_levels
cost_band: premium | middle | value
family_band: premium | glm | value | other
safe_context_limit + tool_policy
role_qualifications + difficulty_qualifications
current_task + lane + candidate_tree + state
```

Cost/family bands are scheduling covariates, not quality judgments. Demonstrated
role fitness overrides price once enough evidence exists.

## Pod topology by difficulty

Every full pod contains at least one premium/high-capability seat, one GLM seat,
and one value seat; the fourth is selected by task risk and missing evaluation
coverage. If the live roster cannot satisfy that constraint, run fewer pods
rather than silently weakening it.

| Difficulty | Required topology |
|---|---|
| Hard | At least two tuples already qualified for their assigned role and difficulty; at least one premium/high-capability seat and one GLM seat; DEV and Mister Clean must both have passed writable exact-tree trials; the strongest independent tuple takes holdout. No first-ever role sample on a critical write path. |
| Medium | One premium/high-capability anchor, one GLM, one value seat, and one flex; DEV and Mister Clean are role-qualified; one read-only role may collect a new reasoning-level sample. |
| Easy | One premium/high-capability anchor, one GLM, one value seat, and one flex; exactly one tuple may take its first sample in the assigned role, protected by the other three roles and deterministic gates. |

Never equate “expensive” with “safe” or “budget” with “weak.” These constraints
preserve diversity during evidence collection; promotion is based on verified
outcomes.

## Rotation constraints

Generate the schedule before each balanced window and validate it. For a fully
populated 20-round window:

- each seat receives 20 assignments;
- each seat receives each of the four roles exactly 5 times;
- each round contains one hard pod, two medium pods, and one easy pod;
- each seat receives hard 5 times, medium 10 times, and easy 5 times;
- each full pod satisfies the tier-mixture rule;
- no seat changes model, harness, or reasoning while work is in flight;
- repeated teammate pairs and repeated role/difficulty combinations are
  minimized, with empty coverage cells preferred; and
- no two concurrent pods share a non-commuting write root or coordination domain.

Those exact counts are consequences of 16 seats, 4 pods, and 20 full rounds;
they are not universal constants. A partial round records its actual coverage
and carries the deficit forward. Never fabricate an assignment to make the
matrix look balanced.

Use 20-round windows as the balancing unit. A 100-round campaign contains 5
windows; 120 rounds contains 6; 180 rounds contains 9; 200 rounds contains 10.
Before repeating a saturated tuple, fill a safe empty role, reasoning, harness,
task-family, or difficulty cell. Publish the generated schedule and its
constraint-check report before dispatching the window.

### Rotation priority

For each runnable task, choose the eligible pod that minimizes this ordered
cost vector:

1. hard-constraint violations — always zero;
2. unqualified write-role assignments;
3. missing role coverage for a seat;
4. missing model × harness × reasoning × role cells;
5. difficulty imbalance;
6. repeated teammate pairs and same-role streaks;
7. expected monetary cost among equally safe choices.

Use lexicographic ordering, not a weighted sum that lets cheapness purchase a
safety violation.

## Reasoning-level staircase in production

Start each model/harness tuple at its lowest exposed reasoning level on an easy,
unseen, role-appropriate task. Step up exactly one exposed level on its next
fresh matched task only after the prior sample completed and was independently
scored. Keep at least one stable anchor level for cross-harness comparisons.

Hard tasks use already qualified settings. A low-level exploration never
displaces the qualified anchor simply to fill an experimental cell. Reasoning
labels are ordinal only within the same model/provider; `high` in one family is
not treated as equal to `high` in another.

## Canonical event record

Use append-only NDJSON as portable source evidence. An optional SQLite index may
be derived with the repository-native runtime for querying and dashboards; it
is a projection, not a hidden source of truth. Keep bulky telemetry outside the
product repository unless repository operation genuinely depends on it.

Record these event transitions separately:

```text
scheduled -> dispatch_attempted -> accepted_by_harness -> working ->
candidate_frozen -> role_completed -> receipt_valid -> independently_scored ->
commit_barrier_passed -> integrated -> ci_terminal
```

Minimum campaign event fields:

```text
campaign_id + round_id + pod_id + task_id + slice_id + difficulty + role
seat_id + actual_model + provider + harness + harness_fingerprint
observed_reasoning_level + skill_version + tool/context policy hashes
baseline_commit + expected_target + candidate_tree + final_commit
read_paths + write_paths + coordination_claims + dependency_ids
prompt/corpus/criteria/policy hashes
dispatch, transport, pause, continuation, and completion timestamps
token and cost observations when available
result and receipt paths/digests
findings by origin, detector behavior, disposition, and severity
receipt invalidations and the tree change that caused each invalidation
CAS attempt/result + integrated tree + established CI conclusion
```

An input left unsubmitted in a composer is `dispatch_attempted`, not
`accepted_by_harness`. A recoverable harness pause is a transport event within
the same sample, not a new attempt. Requested and observed model identities are
stored separately.

## Judge performance by role

Apply hard gates first: ownership violation, false CLEAN, cleanup-introduced
debt, stale-tree approval, unverified terminalization, or an unapproved ref
advance fails the sample regardless of other quality.

Do not collapse all roles into one prestige score. Report these outcome groups:

- **DEV:** first-pass exact-tree acceptance; independently confirmed defects
  introduced; repair cycles; root-cause compression; change amplification;
  integrated survival; post-integration escapes.
- **QA:** confirmed true positives; false positives; later misses found by
  Mister Clean, holdout, or CI; acceptance-criterion coverage; evidence and
  tree binding; actionable minimality.
- **Mister Clean:** genuine debt found and paid; detector false positives and
  misses; cleanup-introduced debt; projection atomicity; artifact residue;
  prerequisite inflation; stop correctness; integrated survival.
- **Holdout:** novel confirmed defects after prior gates; false rejects; missed
  escapes; independence; criteria coverage; exact-tree binding.
- **Harness/orchestration:** delivery failures, recoverable pauses, provider
  fallbacks, context overflow, lane collision, ownership ambiguity, stale-target
  rejection, and operator intervention. Attribute these to the model only when
  the agent caused the violation after visibly accepting the boundary.

Compare passing tuples on a Pareto frontier of correctness, residue, repair
cycles, time, tokens, and cost. Require the controlled and naturalistic evidence
minimums in [model-hygiene-trial.md](model-hygiene-trial.md) before making a
selection claim.

## Failure-to-capability loop

Classify every confirmed escape before changing Mister Clean:

1. `target_repo` — a product, planning, test, or configuration defect. Pay it
   in the candidate and rerun the four-role tree gate.
2. `mister_clean` — a detector miss, false positive, ambiguous instruction, or
   unsafe repair caused by the skill. Add the smallest generalized correction,
   a dirty fixture that must fail, and a clean/edge fixture that must pass.
3. `orchestration` — bad decomposition, collision, ownership, receipt, or
   integration sequencing. Fix the campaign/transaction protocol.
4. `harness` — delivery, timeout, provider fallback, tool, or context behavior.
   Fix or document the adapter; preserve model-score separation.
5. `operator_boundary` — a real decision, credential, production effect, or
   unavailable external evidence. Keep the candidate unintegrated and name the
   authority required.

When the class is `mister_clean`, the revised skill is not accepted from prose
alone. Run its focused tests, negative and positive fixtures, a fresh bare
invocation by an agent that did not author the revision, and the same candidate
scenario that exposed the miss. Version and distribute it only after those
checks pass. One anecdote becomes a skill rule only when the rule states the
general invariant and does not create new false positives or navigation debt.

## Campaign stop and review points

At every 20-round boundary:

- reconcile schedule versus actual assignments and carry forward deficits;
- freeze role-specific outcome tables and confidence/sample counts;
- inspect all hard-gate incidents and later escapes;
- identify skill, target, orchestration, and harness changes separately;
- retire disproven routing assumptions; and
- generate the next window from the live DAG and coverage gaps.

The campaign does not stop development merely because the experimental matrix
is incomplete. Product risk chooses work; safe empty cells break ties. The
campaign succeeds when accepted history remains clean while model selection and
the Mister Clean capability become better evidenced over time.
