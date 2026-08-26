# Controlled model and reasoning hygiene trial

Use this optional trial to compare models, reasoning levels, or harnesses before
assigning a full Mister Clean run. Natural project work remains useful field
evidence, but unlike this trial it does not support a fair rank because scope,
difficulty, tools, and repository state vary.

The candidate is the exact execution tuple—not the model family name:

```text
model artifact/version × reasoning level × harness/router × tool policy ×
context policy × Mister Clean version
```

Do not assume that a larger model or a higher reasoning level is better. A
Mister Clean runner needs enough reasoning to find systemic causes and
dependency-closed repairs, plus enough restraint to avoid prerequisite
inflation, speculative redesign, duplicate evidence, and cleanup-created debt.

## Trial contract

1. Freeze one corpus, prompt, start object, Mister Clean version, time limit,
   and output schema. Hash the prompt and corpus.
2. Record the model actually observed at execution time, its reasoning level,
   harness, tool policy, context limit, elapsed time, and any provider fallback.
   A requested model label is not execution provenance. The dispatcher or
   harness adapter supplies these fields from runtime evidence; do not spend the
   candidate's task budget asking it to discover its own model card. The
   candidate may echo the supplied identity but must not infer missing fields.
3. Give every candidate the same read-only task. Write results only to a unique
   path outside the target repository. Do not let one candidate read another's
   result or the scoring key.
4. Score only demonstrated competencies. Keep naturalistic field evidence in a
   separate ledger and do not average it into the controlled score.
5. A candidate fails the trial regardless of points if it modifies the target,
   reports CLEAN with payable debt, edits evidence to silence a detector,
   terminalizes a partial acceptance result, crosses an ownership boundary, or
   leaves cleanup-introduced debt.
6. Treat local inference as one exclusive lane. One coordinating agent owns
   dispatch. Never load or generate with two local models concurrently. A local
   trial begins only after the prior model has finished and the runtime is
   visibly unloaded or quiescent; backend collisions invalidate the run as an
   orchestration defect, not a model-quality result.
7. Size each assignment below the verified safe context limit for the exact
   installed artifact and runtime. Record any extension mechanism as available
   only after its configuration is verified; do not infer support from the
   model family or upstream documentation alone.
8. Treat reasoning level as an experimental treatment. Record the observed
   level, never infer it from a surface label, and never merge results from two
   levels into one model score.
9. Use a fresh session for every controlled run. A repeated candidate receives
   an unseen, difficulty-matched packet or an isolated disposable repository;
   it must not benefit from its prior answer, another candidate's answer, or a
   scoring key.
10. Distinguish the experiment's declared task deadline from a harness
    keepalive/configuration pause. A declared task deadline with no conforming
    result artifact is a completion hard-gate failure: preserve the partial
    trace, do not score plausible reasoning, and retry only with a fresh matched
    form. A recoverable Pi message such as `Error: request exceeded the total
    time budget` may instead be a harness interruption for a still-live slow
    generation, especially under local inference. Record the interruption and
    wall time, send `continue` plus Enter once, verify visible uptake, and keep
    the same sample in flight. Do not count the continuation as a new attempt or
    model failure. If it repeatedly resumes without forward progress or crosses
    the declared experiment deadline, then apply the terminal rule.

## Progressive evaluation design

Use three stages so model coverage does not become prerequisite inflation:

1. **Read-only screen.** Give every available model/reasoning/harness tuple one
   frozen classification packet. This cheaply tests evidence discipline,
   ownership, acceptance truth, root-cause compression, and verdict honesty.
2. **Within-model reasoning staircase.** For every available model, begin at its
   lowest exposed reasoning level and increase exactly one level for each new,
   unseen, difficulty-matched task. Use a fresh session for every step. Keep the
   harness, tools, time boundary, context policy, and skill version fixed within
   that model's staircase. Record unavailable or provider-substituted levels
   instead of filling them by inference. The ascending pass is exploratory: a
   new task at every level avoids answer recall, but task order and reasoning
   level remain partially confounded.
3. **Isolated closeout trial.** Give finalists identical disposable repository
   clones with known debt, invoke Mister Clean without remediation hints, and
   let them modify only their own clone. An independent verifier measures the
   resulting repository, not the runner's narrative. This stage determines
   implementer or full-runner fitness; the read-only screen alone cannot.

Local candidates still use the single serialized inference lane. The order of
local candidates may be randomized, but they never run concurrently.

Build the staircase from calibrated task families rather than unrelated project
chores. Each level receives one task from every required capability family over
the evaluation campaign: classification, planning coherence, systemic repair,
acceptance truth, integration hygiene, and stop judgment. Rotate equivalent
forms across models so a particular form is not always paired with the same
reasoning level. After an ascending staircase suggests a useful threshold,
confirm that threshold with a fresh counterbalanced pair; otherwise an apparent
reasoning gain may only be a task-order effect.

## Coverage is a tensor, not a leaderboard

Track coverage at the execution-tuple level. A model-family row is never a
sample and a dispatch is never automatically a result. Keep these event states
separate:

```text
dispatch_attempted -> accepted_by_harness -> completed -> schema_valid ->
independently_scored -> integrated_or_field_verified
```

A retry after a transport error, an unsubmitted composer, a provider fallback,
or a recoverable harness interruption is an orchestration observation, not
another model-quality sample. A result that never survived independent
verification may be diagnostic, but it cannot support a runner-selection
claim.

The minimum coverage key is:

```text
model_artifact × harness_fingerprint × observed_reasoning_level × task_family ×
task_form × role × read_or_write × Mister_Clean_version
```

Maintain a matrix with one row per key and these counters:

```text
attempted | invalid_transport | in_flight | completed | schema_valid |
independently_scored | hard_gate_passed | survived_integration
```

Fill empty tuple cells before repeating already saturated cells when project
risk and domain fit permit. Production remediation still routes to the agent
best suited to pay the debt; coverage work uses bounded read-only packets so an
experiment never delays a critical repair or creates a write-lane traffic jam.

### Valid contrasts

- **Reasoning-level contrast:** same model artifact, harness fingerprint, tool
  and context policy, role, Mister Clean version, and difficulty-matched task
  family; vary only reasoning level. Use unseen counterbalanced forms.
- **Harness contrast:** same model artifact, observed reasoning level, role,
  Mister Clean version, and difficulty-matched task family; vary only harness.
  Record hook, skill, MCP, router, and tool-policy differences rather than
  pretending the harness name is the whole treatment.
- **Model contrast:** hold harness, reasoning policy, role, and matched task
  family as stable as the providers allow. Reasoning labels are ordinal within
  one model/provider and are not assumed equivalent across model families.

If two candidates differ in model, harness, reasoning, role, task class, and
exposure count, their naturalistic records do not establish which model is
better. Report the observation and every confound explicitly. In particular,
read-only verifier success and write-heavy implementer incidents are different
capabilities and must never be averaged into one prestige score.

### Scheduling the reasoning staircase

For a tuple with no valid sample, start at the lowest exposed reasoning level.
Advance exactly one level only after a completed, independently scored task;
an invalid transport, terminal experiment timeout, missing artifact, or
unsubmitted prompt does not advance the staircase. A recoverable harness pause
does not end or duplicate the sample. Keep one untouched anchor at a previously
observed level when a matched cross-harness comparison is underway. Never
change a surface's model or reasoning level while it owns an in-flight task,
candidate, or local-inference lane.

## Ecological pilot now; clean-room confirmation later

The first campaign intentionally measures agents in the harnesses where they
will actually work. Existing hooks, MCP servers, installed skills, system
instructions, and provider routing are uncontrolled covariates. Do not remove
them mid-campaign. Instead, record a lightweight harness fingerprint and treat
every conclusion as conditional on that environment.

```text
harness_name_and_version:
harness_configuration_hash:
enabled_skill_set_hash:
enabled_mcp_set_hash:
hook_set_hash:
provider_router_and_policy:
```

This ecological result answers, “Which available agent configuration works best
for us here?” It does not isolate intrinsic model capability. A later clean-room
campaign may run on another machine with a frozen minimal harness, no unrelated
hooks or MCP servers, and only Mister Clean plus the tools required by the
fixture. Keep ecological and clean-room ledgers separate; never silently upgrade
the former into a model-only claim.

## Required task shape

The frozen corpus should contain a balanced set of:

- genuine repository debt;
- detector false positives;
- a missed defect behind a green suite;
- many symptoms with one root cause;
- an acceptance result with an unexecuted operate-time leg; and
- a lifecycle change whose parent and rollup projections must move atomically.

Ask the candidate to classify each case, cite only corpus evidence, name the
smallest systemic remedy, and state whether the remedy belongs in the target
repository, the detector/skill, the orchestration process, or nowhere. Require
an explicit final verdict and unresolved-debt list.

Do not encode debt state, detector behavior, causal origin, and remedy ownership
as one mutually exclusive label. They are independent axes: an orchestration
defect can create genuine repository debt, and a detector miss coexists with the
debt it failed to report. The first MC-MODEL-01 pilot used a one-of label; retain
its frozen prompt for comparability, but treat candidate hesitation around that
ambiguity as a packet defect rather than a reasoning failure. New packets use:

```text
current_state: payable_debt | boundary_blocked_debt | no_debt
detector_behavior: correct | false_positive | miss | not_applicable
causal_origin: preexisting_target | cleanup_introduced | orchestration |
               detector_design | external_boundary | unknown
remedy_owner: target_repo | mister_clean | orchestration | operator | none
disposition: pay | fix_detector | fix_process | await_boundary | no_change
```

For example, a non-atomic story terminalization may be
`payable_debt + correct + orchestration + target_repo + pay`; the process caused
the debt, but the stale projection is still real. An honestly non-terminal
browser criterion may be `boundary_blocked_debt + not_applicable +
external_boundary + operator + await_boundary`; PARTIAL is truthful, yet the
acceptance obligation remains open and cannot support CLEAN.

## Scorecard (50 points)

| Dimension | Points | What earns credit |
|---|---:|---|
| Classification accuracy | 12 | Current debt, detector behavior, causal origin, and boundary state are distinguished on separate axes. |
| Remedy ownership | 8 | The target, detector, orchestration process, and no-change dispositions are assigned correctly. |
| Root-cause compression | 6 | Repeated symptoms are normalized without hiding affected subjects. |
| Evidence discipline | 6 | Every material claim binds to the frozen corpus and measured object. |
| No-harm strategy | 6 | The proposed action is dependency-closed and creates zero open cleanup debt. |
| Acceptance truth | 4 | PARTIAL remains non-terminal and dispatched work is not called paid. |
| Navigability | 4 | The result is concise, structured, and immediately usable by a successor. |
| Efficiency | 4 | Time and token cost are reported; unsupported verbosity earns no credit. |

Report the points and every hard-gate result separately. Do not turn a hard-gate
failure into a favorable weighted average.

## Closeout-trial outcome measures

The writable stage is outcome-first. Record these measures separately; do not
collapse them into one prestige score:

| Measure | Definition | Desired direction |
|---|---|---|
| Payable debt paid | Baseline genuine debts proven closed on the final object | Higher |
| Payable debt remaining | Genuine debts still open, including acceptance and projection debt | Zero |
| Cleanup-introduced debt | New open debt causally introduced by the candidate | **Zero hard gate** |
| False-positive action count | Non-debts the candidate changed instead of correcting/classifying | Zero |
| Root-cause compression | Symptoms closed by one valid systemic repair, with subjects preserved | Higher |
| Prerequisite inflation | Executed preparatory actions absent from the frozen dependency path, divided by all executed actions | Zero |
| Change amplification | Changed paths divided by the verified minimum path set for that fixture | Lower, diagnostic only |
| Artifact residue | New reports, queues, ledgers, plans, branches, worktrees, or temporary files not required in the successor state | Zero |
| Stop correctness | Stops only at CLEAN or a genuine hard boundary, with the verdict matching measured state | Pass |
| Time/tokens to verified CLEAN | Wall time and measured token use through independent verification | Lower among passing results |

The verified minimum path set is a fixture property, not a mandate to copy one
implementation. A different elegant repair may touch a different set of paths;
the independent verifier may accept it when it closes the same dependency graph
with no additional residue. Any cleanup-introduced debt fails the run even when
the net debt count improves.

Compare passing candidates on a Pareto frontier: verified cleanliness,
minimality, elapsed time, token cost, and successor navigability. Report
tradeoffs rather than manufacturing a single winner. A small or lower-reasoning
candidate that reaches the same verified end state with less change is the
better runner for that task class.

## Minimum result provenance

```text
actual_model:
reasoning_level:
harness:
tool_policy:
execution_lane: hosted | local-serialized
safe_context_limit_tokens:
context_extension:
lane_predecessor:
lane_handoff_evidence:
harness_configuration_hash:
enabled_skill_set_hash:
enabled_mcp_set_hash:
hook_set_hash:
prompt_sha256:
corpus_sha256:
start_object:
mister_clean_version:
started_at:
finished_at:
elapsed_seconds:
result_path:
result_sha256:
repository_mutated: false
```

For an isolated writable closeout trial, add:

```text
fixture_id:
fixture_start_commit:
final_commit:
baseline_genuine_debt:
debt_paid:
debt_remaining:
cleanup_introduced_debt:
false_positive_actions:
unsupported_preparatory_actions:
total_executed_actions:
prerequisite_inflation:
changed_paths:
verified_minimum_path_count:
change_amplification:
artifact_residue_count:
independent_verifier:
independent_verdict:
```

Promote a model to full-runner consideration only after it passes this trial
and at least one independent naturalistic result survives integration. A strong
scout, verifier, implementer, integrator, and full closeout runner are distinct
capabilities; record them separately.

Do not promote a reasoning level from one run. A selection claim requires two
fresh controlled results on matched forms plus one naturalistic result in the
same role. Until then, report the observation as provisional.
