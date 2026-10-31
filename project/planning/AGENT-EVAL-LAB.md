---
artifact_type: reference
classification_rationale: Combined evaluation product and interface specification; planned requirements, not implementation or acceptance evidence.
title: Agent Eval Lab
owner: Product maintainer
date: 2026-10-09
---

# Agent Eval Lab

Status: combined product specification; implementation not dispatched. Extends
[EV-01–EV-06](EVAL-STANDARDIZATION-PLAN.md), not a second backlog or database.

## Purpose

Test whether a specific agent configuration can perform a defined role while
meeting the project's standards. Preserve enough evidence to explain the
answer, compare alternatives fairly, and detect later regressions.

Standards define expectations. Role profiles select relevant capabilities.
Versioned test suites exercise them. Independent grading establishes outcomes.
The existing Mister Clean registry stores the evidence and qualification.

## Combined data model

Extend existing records through forward migrations; do not create a competing
agent identity or qualification system. Use these concepts and relationships:

- **Role revision:** purpose, instruction digest, input/output contracts,
  capability mappings, named failure classes, permitted tools, access policy,
  budgets and qualification policy revision.
- **Case revision:** content-addressed input, expected task/environment state,
  difficulty, defect tags and data classification. Answer material is separate.
- **Suite revision:** sealed case membership, split (development, qualification,
  monitoring), ordering policy and digest.
- **Key revision:** expected results, allowed alternatives, claim-matching rules,
  independent adjudication and correction basis. Changes never overwrite keys.
- **Experiment:** preregistered role, suite, key, candidate treatments, repetitions,
  budgets, comparison and stopping rules. One experiment has many attempts.
- **Attempt:** one case execution by an observed treatment; start/end identity,
  environment, trace/artifact references, events and resource observations.
- **Grade:** attempt + key/rubric/scorer revision + retained evidence + result.
  Regrading appends a new grade; it never changes the original attempt.
- **Qualification decision:** derives from eligible grades under a named policy;
  records scope and limitations. Benchmark grades do not automatically become
  native production-work trials.
- **Exposure and audit events:** record case visibility, canary use and later
  production audit outcomes without claiming unseen data is unexposed.

Keep `experiment` distinct from Mister Clean's existing `trial` terminology:
write an explicit adapter/mapping before admitting experiment evidence into
native trials. No multiplication of credits across repeated grades or keys.

Identity binds harness/version, model/build, reasoning, instructions/tools/skills
and budgets. Execution route binds provider/deployment, serving configuration,
transport, retry/timeout policy and observed service conditions. Unknown values
are explicit. Provider changes remain available as comparison strata even where
qualification policy allows pooling with supporting evidence.

Execution configuration uses independent axes, not overlapping mode numbers:
visible/headless; local/remote execution; local/remote inference; isolation type;
adapter and evidence availability. Explicit flags are verified against observed
identity. No automatic local inference startup or account-exhaustion testing.

## Grading and decision rules

1. Preregister comparison inputs and scoring before candidate outputs arrive.
2. Prefer deterministic graders for decidable outcomes; permit versioned,
   calibrated independent semantic graders where exact matching is insufficient.
3. Separate format, substantive correctness, false rejection, missed defects,
   authority/no-harm, reliability and cost. Never hide them in one average.
4. Include clean cases, realistic failures, planted defects and held-out cases.
   Development examples must not masquerade as unseen qualification cases.
5. Repetitions measure consistency, not additional independent task breadth.
   Report unique cases and repetitions separately; use paired comparisons and
   uncertainty methods that respect repeated cases. Interval overlap alone is
   not a test of equivalence. Sample-size floors are not confidence guarantees.
6. A corrected key appends regrades for every eligible comparable candidate;
   preserve the prior interpretation and explain changed rankings.
7. Read coverage is role-specific process evidence, not proof of comprehension.
   Audit capture limitations; enforce protected material with isolation rather
   than assuming traces reveal every read. Missing trace evidence is incomplete
   or invalid where required, never fabricated success.
8. Invalid environment, incomplete evidence, infrastructure error and actual
   task failure have separate outcomes. All remain in attempted-run accounting.
   Do not classify ordinary model mistakes as VOID to improve accuracy.
9. Different model families are not presumed statistically independent. Measure
   joint failures when comparing multi-reviewer policies.
10. Native qualification thresholds remain compatible. Review the existing
    count-only supervised recommendation rule before presenting it as quality
    endorsement; any policy change requires explicit versioning and acceptance.

Provider metrics distinguish first provider token, first visible output, total
task latency, generation speed, throttling, retries and terminal failures.
Retain measurement method and denominator. Unknown usage after cancellation is
unknown. Cost per accepted task includes failed/retried attempts where known.
Use redacted structured error events, not unrestricted raw credential-bearing
banners. Credentials are references only; traces are private by default.

## User interface

Proposed surface: an interactive Eval Lab within the existing TypeScript/Svelte
control plane. Reuse the shell, themes, evidence components and query contracts;
do not replace the existing repository pages. Confirm distribution posture
before visual implementation and run the current OKOA design protocol.

### Overview / experiments

Lead with actual counts: experiments running, attempts completed, independently
graded results, provisional role decisions and blocked/invalid attempts.
Filter by role, capability, model, harness, reasoning, provider, suite and date.
Every result is addressable; non-sensitive filter state is reproducible in URLs.

### Workbench

Three progressive steps: define role and cases; select observed configurations
and budgets; review the frozen experiment before launch. Use input/rubric and
expected-output editors with validation, import/export, examples and readable
diffs. Sealed answer keys are never delivered to candidates. Demonstration mode
is visibly separate; unavailable execution adapters disable launch with a reason.

### Compare

Side-by-side configurations, per-defect catch/false-rejection rates, sample sizes,
uncertainty, evidence quality, reliability, latency and cost. Comparability badges
explain differing keys, suites, versions or conditions. No universal winner.
Show quality-eligible choices before optional cost/speed preferences.

### Experiment and attempt detail

Drill from experiment to attempts to per-case expected/observed result, grade,
evidence and chronological events. Regrade is an explicit authorized append-only
action. Show requested versus observed identity and missing evidence prominently.

### Roles, suites and keys

Manage immutable revisions, exposure history, rubric differences, key correction
basis and qualification policy. Experimental extensions remain visible without
silently granting native clearance. Reuse agent-card details rather than making
a duplicate model registry.

### Reliability / operating policies

Compare measured review policies and route reliability. Label projected estimates
and assumptions separately from observations; do not assert that more reviewers
necessarily reduce errors. Bounded load tests are optional, separately authorized
work, not a prerequisite to basic evaluation.

## JEV-RLCD reuse decision

Source inspection found a useful browser playground: state/question editors,
selectable model connections, side-by-side or stacked layout, normalized/raw
results, examples, validation, and import/export. Adapt these interaction patterns
into Svelte after token validation; do not copy its imperative DOM implementation
or project-specific decision vocabulary wholesale.

Its current usage dialog explicitly says detailed results remain in tab memory.
That is not suitable as Eval Lab persistence. Use Mister Clean's SQLite-backed
admission/query layer. JEV's golden comparison, frozen-holdout hashes and choice
permutations are useful possible test adapters, not replacements for truth,
exposure proof or general role evaluation. Golden behavior is not an answer key.

Do not change JEV-RLCD or connect to its providers during this integration.
Direct code reuse, if later selected, requires revision pinning, license review,
attribution, tests and a maintained dependency boundary.

## Integration into EV delivery

- EV-01: inventory existing experiment artifacts and JEV reuse candidates.
- EV-02: role/suite/key/grade revisions and experiment-to-native-trial mapping.
- EV-03: immutable evidence storage, attempt/grade import, replay and recovery.
- EV-04: one supported adapter completing bounded judge-role experiments;
  preserve the existing no-dispatch public contract until deliberately extended.
- EV-05: Eval Lab views above, using shared query and design contracts.
- EV-06: native and extension experiment acceptance, independent scorer checks,
  negative controls, report regrade/replay and built-package consumer proof.

First vertical slice: a source-fidelity judge with clean and planted-defect cases,
at least two configurations for comparison, repeated attempts, hidden key,
independent scoring, durable SQLite results and a readable comparison view.
No claim of statistical superiority or production clearance follows merely
from completing this demonstration. Broader modes and load tests follow proven
adapter needs; they are not initial delivery prerequisites.

UI acceptance requires persisted results surviving process/browser restart,
working deep links, truthful empty/error/demo states, accessible controls,
responsive rendering and current OKOA validation. A mock-only interface is
not a completed eval harness. No inference or production-data use is authorized
by this design document alone.
