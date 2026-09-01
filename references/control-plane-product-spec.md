# Mister Clean control plane — product specification

Status: approved product contract; implementation active
Architecture: TypeScript + Svelte 5 + Bun + SQLite (`bun:sqlite`)
Scope: local-first repository control plane, reusable across repositories
Authority: operator decisions captured during the original internal case study

## 1. Product promise

The control plane answers one question before all others:

> Is this repository—and Mister Clean itself—moving closer to or farther from
> a clean, coherent, successor-ready state?

It must show the answer within seconds, then let an operator inspect the debt,
choose a safe remediation order, assign an evidence-qualified agent, issue a
bounded directive, and verify what actually happened.

The report is not a post-hoc slideshow. It is a durable operational projection
of an immutable run ledger, an issue graph, a team registry, and verified
receipts. It may recommend and route work, but it must never turn transport
acknowledgement into proof of execution or a favorable score into CLEAN.

## 2. Governing invariants

1. **Pay the debt.** A queue, prompt, review request, plan, or favorable trend
   is not payment. A payable issue closes only when its acceptance boundary has
   passed on the current repository object.
2. **First, do no harm.** Zero debt caused by Mister Clean may cross an action,
   commit, integration, push, checkpoint, or handoff boundary. Net improvement
   never offsets a new regression.
3. **Show actual state.** Improved detection is not repository deterioration.
   Reclassification is not remediation. Delivery is not execution. Execution
   is not acceptance. Each is accounted separately.
4. **Fail closed.** The terminal verdict is `CLEAN` or `NOT CLEAN`. A hard
   boundary is visible and forces `NOT CLEAN`; it is never “clean with
   residuals.”
5. **Preserve history.** Every run and operation is immutable. Detector
   improvements add a current interpretation without rewriting what a prior
   run observed.
6. **Prefer causes to symptoms.** The dependency graph and remediation planner
   should find the smallest coherent change that pays multiple observations
   without increasing complexity or successor burden.
7. **One dispatch truth.** A typed `RemediationWaveManifest` is the sole
   authoritative dispatch object. Human prompts, QA packets, UI cards, and
   routed directives are deterministic projections of that manifest.
8. **One computational truth.** Accounting, dependency planning, qualification,
   and routing are domain functions, not presentation logic. Every surface calls
   the same versioned functions over the same bound inputs and exposes their
   input and result identities.
9. **No demo masquerade.** Synthetic data is an explicitly selected demonstration
   mode, permanently marked in the viewport. If live evidence is unavailable,
   the normal product reports that boundary; it never falls back to a plausible
   success story.

## 3. Headline accounting

The top of every repository report displays one literal number:

> **N real issues remaining**

It also displays:

- normalized first-run baseline;
- issues remaining in the preceding report;
- issues remaining now;
- issues paid since the preceding report;
- newly discovered pre-existing issues;
- issues caused by remediation;
- boundary-blocked issues;
- no-harm status; and
- the exact `CLEAN` or `NOT CLEAN` verdict.

The headline is a transparent vector, not an opaque cleanliness score.

### 3.1 Debt flow identity

For a comparable run interval:

```text
ending_real_issues
  = starting_real_issues
  + discovered_preexisting
  + caused_by_remediation
  + concurrently_introduced
  - paid
  - invalidated_false_positives
  +/- classification_corrections
```

Every term must be inspectable by stable issue ID. The UI must not add counts
from ledgers with different identity rules, scopes, detector versions, or
repository subjects.

### 3.2 Direction rules

- Newly discovered pre-existing debt increases known scope and current
  remaining debt. It does **not** automatically mean the repository moved
  backward.
- Debt caused by remediation is actual negative movement and fails no-harm.
- Evidence that invalidates previously credited remediation reverses that
  credit and may move direction backward.
- A false positive is removed from the normalized `Known now` series but
  remains visible in the raw `Observed then` record and detector-performance
  history.
- Unknown or unestablished origin is not silently assigned. It lowers
  confidence and prevents CLEAN when the distinction is material.

### 3.3 Issue identity

One issue is one independently payable and verifiable obligation.

- Duplicate observations collapse under one stable issue.
- A corpus-wide conformance defect may be one issue only when one atomic
  remediation and one acceptance test close the entire declared corpus.
- A shared root cause remains one root debt with subordinate observations when
  one coherent repair closes them together.
- Separately repairable or separately verifiable obligations remain separate
  issues even when they share a theme.

## 4. Terminal contract

`CLEAN` requires all of these conditions on the same current repository
subject:

- zero payable issues;
- zero unpaid issues caused by Mister Clean;
- zero boundary-blocked, deferred, unassessed, or unestablished material debt;
- fresh repository-native and Mister Clean evidence;
- coherent code, planning, Git/worktree, process, CI/delivery, team, and
  successor surfaces;
- all required independent QA and holdout evidence accepted on the current
  candidate;
- no unexplained complexity regression;
- exact-tree, target, and coordination-domain expectations still current; and
- a live-validated closure bundle reporting `CLEAN`.

Anything else is `NOT CLEAN`. The interface may explain `BLOCKED`, but
`BLOCKED` is a reason for `NOT CLEAN`, not a third cleanliness verdict.

## 5. Seven product pages

All repositories receive the same seven-page shell. Missing information is
shown as `NOT MEASURED`, `NOT CONFIGURED`, or `UNKNOWN`; absent data never
silently removes a contractual section.

### 5.1 Progress / Command

- Current verdict and `N real issues remaining`.
- First-run, previous-run, and current-run comparison.
- Animated longitudinal debt-flow view and an inspectable waterfall.
- No-harm status and caused-debt payback.
- Technical versus agentic/operational debt composition.
- Top blockers, current eligible frontier, and recommended next action.
- Confidence, detector coverage, evidence freshness, current repository
  object, and current team/control-surface topology.
- `ADVISE` or `OPERATE` mode and the authority boundary currently in force.

### 5.2 Issues / Remediation

- Complete issue inventory with stable IDs and full provenance.
- Sort and filter by severity, difficulty, age, confidence, domain, owner,
  unlock value, regression risk, and dependency order.
- Deterministic dependency-aware remediation plan.
- Dynamic `Parallelizable`, `Ordered`, or `Blocked` classification for the
  selected plan—not a permanent property copied onto an issue.
- Recommended agent tuple, runner-up, and best suitable active agent.
- Single-issue prompt and coordinated-wave construction.
- Evidence, history, affected invariants, coordination domains, acceptance
  boundary, blast radius, and directive state.

Default planning policy:

1. Enforce dependencies, authority, no-harm, evidence, and semantic collision
   constraints.
2. Among eligible work, weight severity and remediation difficulty equally;
   high-severity/high-difficulty obligations lead.
3. Use unlock value and regression risk to refine the order.
4. Use cost and speed only as tie-breakers unless the operator selects another
   objective.
5. Never reduce scope merely to improve a metric.

### 5.3 Agent Finder

- Search begins with `Find the best agent for …` and autocompletes remediation
  capabilities rather than model names.
- Selecting a capability applies visible weight `1`; selecting it again cycles
  to `2`, then `3`, then off. The control is keyboard accessible.
- Hard qualification and availability gates run before ranking.
- Remaining tuples rank by the sum of each selected capability score multiplied
  by its selected weight and confidence adjustment.
- Results identify category champions, not a misleading universal champion.
- Each result shows the exact model + harness + reasoning tuple, qualification
  level, sample count, confidence, active availability, inference routes,
  evidence, runner-up, and best-value option where supported.

### 5.4 Team Roster

- Active repository agents first.
- Confirmed machine-global candidates second.
- Compact grouping by model family and harness, expandable to every tested
  reasoning level and exact tuple.
- Clear distinction among current availability, historical qualification,
  repository familiarity, assigned role, office/control surface, and inference
  route.
- Untested does not mean failed; it is displayed as `UNTESTED`.

### 5.5 Raw Agent Inventory

- One sortable row per exact tuple and execution route.
- Sort/filter by model, harness, reasoning level, capability, qualification,
  sample count, verified success, reliability, cost, speed, inference source,
  headless support, local/remote, and repository familiarity.
- Include known-but-untested model/harness/reasoning combinations.
- Show every proven inference source for each model and the invocation adapter
  needed to run it.

### 5.6 Run History

- Every Mister Clean invocation from the first run onward.
- Immutable `Observed then` view bound to that run's detector set.
- Current `Known now` overlay using the current identity and classification
  rules.
- Run identity, time, Mister Clean and detector versions, branch/commit/tree,
  worktree topology, scope and exclusions, start/terminal verdict, all debt
  flows, team topology, directives, outcomes, and receipt bindings.
- Detector misses, false positives, process defects, and classification
  corrections are explicit.
- Apparent regressions caused by improved visibility are explained, never
  silently rebased.

### 5.7 System / Method

- Detector inventory and coverage.
- Issue identity and debt-accounting rules.
- Capability taxonomy and qualification policy.
- Data freshness and evidence provenance.
- Local/global synchronization policy.
- Accepted operator boundaries and unavailable evidence.
- Complexity measurement coverage and limitations.
- Runtime, schema, and product versions.

## 6. Debt domains

The inventory covers both technical and agentic/operational debt:

- code correctness, architecture, coherence, complexity, and sprawl;
- tests, negative controls, and verification coverage;
- documentation, planning, canonical projections, and history;
- Git refs, branches, worktrees, stashes, ignored/untracked/tracked state;
- CI/CD, packaging, deployment, and delivery readiness;
- security, secrets, dependencies, and environment custody;
- repository-relevant processes and runtime residue;
- ownership, writer locks, coordination domains, and stale work;
- team setup, agent offices, panes, harnesses, and control surfaces;
- deadlocks, traffic jams, unavailable actors, and unowned work;
- evidence, receipts, provenance, and successor-readiness; and
- unresolved decisions and genuine hard boundaries.

## 7. Capability taxonomy

Qualification and routing are capability-specific. The initial taxonomy has
24 categories grouped into four families.

### Discovery and judgment

1. Census and detection.
2. Classification and false-positive judgment.
3. Root-cause analysis.
4. Risk and blast-radius analysis.

### Planning and orchestration

5. Dependency/DAG planning.
6. Planning and projection reconciliation.
7. Multi-agent coordination and integration.
8. Routing, ownership, and team topology.

### Remediation

9. Code-correctness remediation.
10. Architecture, coherence, and complexity reduction.
11. Test and negative-control construction.
12. Git, worktree, and integration hygiene.
13. CI/CD, release, and deployment remediation.
14. Security, secrets, and dependency remediation.
15. Documentation minimalism and organization.
16. Runtime and repository-process cleanup.
17. Control-surface and office hygiene.
18. Performance and resource efficiency.
19. UI, design, and accessibility remediation.
20. Canonical conformance and exact-format reconciliation—`Spit-shine`.
21. Semantic naming and structural wayfinding—`Wayfinding`.

### Verification and closeout

22. Independent QA and holdout.
23. Evidence, receipts, and provenance.
24. Successor-readiness and handoff.

Mister Clean detector/protocol improvement is a separate meta-capability so a
model cannot qualify for repository remediation merely by editing the skill.

`Spit-shine` requires 100% mechanical conformance across the declared corpus
and idempotence on the successful trial. `Wayfinding` requires a blind
successor-agent probe that can locate ownership, relevant files, and the safe
change path from the repository's own structure.

## 8. Agent qualification and evaluation

The evaluation unit is an exact **agent tuple**:

```text
model + harness + reasoning level
```

Qualification is per tuple and per capability:

| Level | Minimum evidence |
|---|---|
| `Recommended · supervised` | 10 verified trials |
| `Qualified` | 25 verified trials across at least 2 repositories and at least 90% verified success |
| `Production-cleared` | 50 verified trials across at least 3 repositories, at least 95% verified success, independent evaluation, and zero unresolved no-harm or authority violations |

Failures remain visible. Recency may change confidence but never erase history.
High-impact qualification may not be based solely on the same actor serving as
author, judge, and evidence source.

### 8.1 Monitoring and ongoing sampling

Monitoring is bounded to work performed inside a Mister Clean invocation. The
product does not observe or count an agent's unrelated computer activity.

- Until an exact tuple reaches 50 verified evaluations for an exercised
  capability, every Mister Clean run that exercises that tuple/capability is
  monitored and independently evaluated.
- After the tuple/capability is `Production-cleared`, every Mister Clean run is
  still recorded in the run counter and operational ledger, but routine
  independent evaluation samples one run from every consecutive block of 20
  eligible runs. This is a 5% scheduled sampling floor.
- The sampling counter is deterministic, durable, and scoped to the exact
  tuple/capability. It cannot reset because a repository, process, harness
  session, or inference route restarts.
- No-harm failures, authority violations, detector disagreements, reopened
  work, integration rejection, unexplained quality drift, route identity
  changes, or other material anomalies trigger an evaluation immediately in
  addition to the scheduled sample.
- An event-triggered evaluation is recorded separately and does not silently
  consume the next scheduled sample unless it is also the designated run in
  that 20-run block.
- Each evaluated run contributes provenance-bound evidence to the repository
  record and normalized capability telemetry to the machine-global master
  dataset. Unevaluated post-clearance runs contribute run count and operational
  telemetry, never unearned quality credit.

One run may exercise several capabilities, but each capability receives its own
evaluation disposition and counter. A generic successful run cannot be counted
as evidence for a capability the task did not exercise.

Every trial records the exercised capability, difficulty, starting state,
authority, outcome, debt paid, debt caused, verification quality, intervention,
wall time, token use when reliable, cost when known, evidence, and repository
object. Cross-cutting measures include:

- verified completion and reopen/rework rate;
- no-harm and authority discipline;
- root-cause leverage and complexity delta;
- precision, recall, and calibration where ground truth exists;
- dependency and coordination correctness;
- verification strength and evidence integrity;
- autonomy, intervention, recovery, and handoff quality; and
- time, cost, tokens, and relative token efficiency.

Unsupported measures are `N/A`, not zero.

### 8.2 Complexity and shipped-weight identity

Complexity comparisons bind the same repository object, analyzer source digest,
classifier identity/version, language tooling, and measurement policy. Generated
distribution mirrors remain visible as shipped weight but do not count as
authored production structure. Generated, vendored, public-documentation,
planning, tests, design assets, and authored production denominators stay
separate. Analyzer output must live outside the measured repository object so
measurement cannot create the regression it is measuring.

Repository-size history is an optional immutable set of labeled series. Every
series binds its actual ref and head commit and records commit, observation
time, file count, bytes, and byte delta. A survivor or candidate branch is
never relabeled as `main`; ordinary repositories may provide one series, and a
missing comparison series is `NOT MEASURED`. Tracked-object bytes, authored
source, tests, public documentation, planning, generated output,
dependencies/assets, and ignored-local material remain separate measures.
Total bytes are a sprawl and shipped-weight signal, not authored complexity.

The canonical snapshot carries two orthogonal reconciliations. First, the
repository-object total equals tracked plus nonignored-untracked material.
Second, the same repository-object total equals the mutually exclusive authored
source, tests, public documentation, planning documentation, generated
shippable output, configuration/tooling, evidence/research, and
dependencies/assets categories. Ignored-live material is never folded into
either reconciliation: it is a separately labeled, time-bound observation of
dependencies, build cache, local evidence, and other ignored classes, with an
explicit availability state. Unmeasured surfaces render `NOT MEASURED` or
`UNKNOWN`; zero is reserved for a measured zero.

## 9. Model, inference, and execution identity

Keep these entities distinct:

- **Model:** provider-independent model identity.
- **Inference source:** provider or machine serving inference, such as
  OpenRouter, z.ai, or a local Mac.
- **Deployment:** one model served by one inference source.
- **Agent tuple:** model + harness + reasoning level.
- **Identity lease:** evidence-backed external readbacks of the actual agent
  tuple, execution route, harness session, and process instance immediately
  before dispatch and immediately before evaluation. Surface/tab labels express
  intent only; worker self-report is never authoritative. Restart, relaunch,
  fallback, route/configuration change, or session/process replacement
  invalidates the lease. Unbound work may retain technical findings but adds no
  qualification, category-champion, or leaderboard credit.
- **Execution route:** agent tuple + deployment + invocation method.

Inference source is not a quality treatment by default. Provider-specific
speed, reliability, and cost are operational telemetry; persistent evidence of
quality differences may justify a separately versioned treatment later.

Execution-route metadata may include direct/harness/local mode, OpenAI-compatible
endpoint, provider model ID, machine identity, local/remote status, headless
support, adapter, environment and working-directory policy, secret references,
health check, rate/context/concurrency limits, streaming and usage support, and
start/stop/recovery procedure. SQLite stores secret references only; credentials
remain in the operating system keychain, environment, or an approved secret
store.

### 9.1 Agent execution records

Agent identity and portability use three deliberately separate records:

- **Agent Execution Profile:** the private, machine-local desired recipe. It
  records harness and version; model, version, family, and release date;
  reasoning level and sampling settings; inference deployment, provider,
  gateway, server, endpoint reference, and invocation adapter; tool, plugin,
  MCP, and skill inventory; starting context and context-window limits; and
  provenance for every field. It stores secret references only.
- **Execution Treatment:** the immutable record of what actually ran for one
  evaluated Mister Clean operation. It binds the profile revision and
  fingerprint, external identity disposition, repository cohort token,
  capability, run event, time bounds, telemetry digest, and retained evidence.
  Evaluation and qualification attach to this record, never to a mutable
  desired profile or a pane label.
- **Agent Card:** a drill-down projection combining one profile, its immutable
  treatments, and capability-specific qualification evidence. It is a detail
  view inside Finder, Roster, and Inventory—not an eighth main page.

An A2A Agent Card may be exposed as a public interoperability extension. It is
never the private execution recipe, does not contain secret references or
machine-local topology, and cannot substitute for an externally verified
Execution Treatment.

## 10. Cost, speed, and token efficiency

- Capture input, output, cached, and reasoning tokens only when the route
  reports them reliably.
- Compare token efficiency within a moving cohort of the same capability,
  difficulty, quality threshold, and recent evaluation window.
- Capture time-to-first-token, tokens per second, and route reliability only
  where measurement is consistent; otherwise show `UNKNOWN`.
- Price precedence is: operator custom rate; contract or local amortized rate;
  Models.dev public rate; unknown.
- Custom rates are effective-dated and may specify input, output, cache read,
  cache write, and reasoning costs per million tokens.
- Quality is the default routing objective. Cost and speed are secondary unless
  the operator explicitly changes the weighting.

## 11. Dependency graph and concurrency

The issue graph is a structural data component. It stores prerequisites,
dependents, root-debt/observation relationships, affected invariants,
coordination domains, acceptance boundaries, and evidence edges.

For each selected remediation objective the planner deterministically computes:

- eligible frontier;
- dependency-constrained order and critical path;
- unlock value;
- semantic collisions and coordination domains;
- safe concurrency groups;
- worktree/writer ownership; and
- `Parallelizable`, `Ordered`, or `Blocked` for each issue in that plan.

Changing sort or optimization policy recomputes these values. It never mutates
the underlying issue facts. Coarse coordination domains are acceptable; refine
them only with explicit commutativity evidence.

## 12. RemediationWaveManifest

`RemediationWaveManifest` is the typed name and compatible next evolution of
the existing canonical `action-manifest.json`; it is not a second manifest,
queue, or authority ledger. Existing schema 1.0–1.2 coordination records,
terminal `closeout_guard` schema-1.3 records, packaged schema-1.4 field guides,
and `prepare`-minted schema-1.5 run records remain readable under their own
contracts. Generic action manifests use schema 1.2; every newly prepared GUARD
closeout is schema 1.3 from initialization while reusing schema-1.2 coordination
semantics. Initialized/closed GUARD needs no external authority; live
passed/open or crossed/executed validation requires separately retained
accepted-evaluator and guard-authority inputs, and live schema-1.2 open/crossed
authority is closed. Schema 1.3 is not a replacement operation log or the wave-
manifest version. New wave fields advance the canonical schema without changing
prior bytes or silently granting old records new semantics.

The manifest is an immutable, versioned machine contract. At minimum it binds:

- manifest ID, schema version, creation time, creator, and parent operation;
- repository identity and exact baseline branch/commit/tree/full-object digest;
- issue-graph version and selected issue IDs;
- optimization policy and approved overrides;
- authority mode, hard boundaries, and destructive/external-action policy;
- dependency-closed waves and tracks;
- lanes, roles, owners, worktrees, branches, read/write scope, and leases;
- protected-read custody: exact protected paths, separately permitted metadata
  projections, mechanical enforcement mode, and authenticated enforcement
  evidence; a prose-only prohibition cannot admit a protected lane;
- versioned coordination-domain claims and expected state digests;
- agent tuple, execution route, routing evidence, and fallback;
- task purpose, context budget, acceptance boundary, native gates, QA, holdout,
  no-harm comparators, and rollback;
- target-ref and domain compare-and-swap expectations;
- evidence paths, receipt requirements, and telemetry schema; and
- terminal disposition for every selected issue.

Every projection includes the manifest ID and digest. A route refuses to start
when the repository baseline, issue-graph version, authority, lane lease, or
coordination-domain expectation is stale. Integration rechecks all of them.
It also refuses a lane whose protected path set is nonempty unless the manifest
binds `filesystem_sandbox` or `externalized` enforcement with evidence. Search
and gate roots are expanded before dispatch; an ancestor of a protected body is
not an admissible recursive read root.

Selecting multiple issues creates one coordinated wave manifest by default,
partitioned into parallel, ordered, and blocked work. Individual prompts remain
available, but they are projections of the same manifest rather than an
independent source of instructions.

## 13. Directive states and authority

The product supports two views over one ledger:

- **Executive:** current state, movement, boundaries, and decisions.
- **PM/orchestrator:** issue graph, routing, manifests, delivery, execution,
  verification, and integration.

It supports two modes:

- `ADVISE`: produce a complete copyable packet; do not route it.
- `OPERATE`: a route action authorizes bounded dispatch inside the declared
  repository and control surfaces, subject to the invocation's authority and
  hard boundaries.

Directive state is explicit:

```text
recommended -> projected -> copied
recommended -> projected -> queued -> delivered -> accepted -> running
running -> completed -> verified
running -> failed
queued|delivered -> delivery_uncertain
```

`delivered` requires transport evidence. `accepted` requires visible or
structured proof that the target agent received the turn. `completed` is the
agent's report. `verified` requires independent evidence on the bound output.

### 13.1 State-specific evidence verification

A path and digest are evidence locators, not proof of a directive state. Before
a transition, the runtime loads the exact bytes, validates their complete schema
and digest, binds repository/manifest/directive/actor identity, and applies a
verifier specific to the claimed state:

- delivery evidence proves the declared route received the exact manifest
  projection;
- acceptance evidence proves the intended actor accepted that turn;
- running evidence proves work began under the still-current lease and
  coordination expectations;
- completion evidence binds the produced candidate and claimed outcomes; and
- verification evidence is independent, covers every required role and claim,
  and binds the closing candidate rather than assuming every role must reproduce
  the baseline object.

Authentication proves who supplied bytes; it does not prove that the bytes
establish delivery, acceptance, completion, or verification. Arbitrary local
paths, self-asserted hashes, and actor-authored positive receipts therefore
cannot manufacture progress.

## 14. Local and repository memory

The computer is the current collective-memory unit.

Machine-global local storage may contain normalized model, harness, reasoning,
deployment, route, capability, qualification, trial, price, reliability, and
availability records. Repository-local storage contains repository identity,
paths, issues, manifests, directives, exact evidence, control surfaces, and run
receipts.

SQLite is the local query and projection engine, not a second private queue or
authority source. It stores append-only events and immutable manifest revisions;
derived query tables can be rebuilt deterministically from those records and
their bound evidence. A provenance-preserving NDJSON export provides recovery
and inspection without making two independently writable truths.

Invocation flow:

1. Load relevant global qualifications and routes into the repository routing
   context.
2. Observe and remediate the repository while updating repository-local state.
3. Record provenance-bound agent/task outcomes.
4. Return only normalized, privacy-filtered telemetry to the machine-global
   store.
5. Use the updated evidence for future routing.

No automatic cloud upload, cross-machine merge, or shared community registry is
part of the first implementation. Those require an explicit future privacy,
identity, and reconciliation contract.

### 14.1 Historical evidence import

Legacy repository history enters as an append-only evidence import, never as a
rewritten current truth. Every imported observation binds:

- immutable source bytes, digest, repository-relative locator, and optional
  section/line span;
- source kind and trust tier: tracked machine contract, tracked narrative
  observation, ignored-local quarantine, or fixture/template;
- parser identity/version, extraction rule, and confidence;
- the artifact-declared observed subject separately from the import-time
  repository object; and
- normalized issue/operation/agent projections or an explicit `evidence_only`
  disposition when deterministic normalization is impossible.

The import boundary receives actual bytes or loads them through a configured
immutable content-addressed store; it recomputes size and digest before any
schema or policy decision. Caller-supplied metadata is never sufficient. Source
class is one mutually exclusive value—`tracked_machine_contract`,
`tracked_narrative_observation`, `ignored_local_quarantine`, or
`fixture_template`—established from the frozen repository census and declared
artifact role, never inferred from a suggestive path alone.

Imports use deterministic TypeScript parsers for declared formats. Ambiguous
prose is preserved as evidence rather than synthesized into facts. Ignored-local
evidence may establish chronology or corroboration but cannot alone pay debt;
fixture/template assets cannot enter live history. Artifact retirement is not
debt payment, a prose `CLOSED` label is an unverified closeout claim, and code
that defines receipt behavior is not historical receipt evidence.

Partial historical agent identity remains partial. Missing harness, reasoning,
deployment, or route fields are `UNKNOWN`, never inferred. Legacy dispatches pass
through a versioned bridge record that preserves the source schema and lists
every derived manifest field; incomplete translation remains evidence-only
rather than being coerced into a `RemediationWaveManifest`.

Observed records and interpretations carry stable content identities. Live
history rejects quarantined/rejected artifacts, duplicate observations,
duplicate interpretations, mismatched Known-now bindings, and noncanonical or
order-dependent batches. A dispatch bridge remains `evidence_only` with no
authority until the entire derived manifest—including cross-field invariants—
passes the canonical manifest schema; `complete` is computed, never accepted
from imported bytes.

## 15. Implementation architecture

- **Runtime and services:** Bun + TypeScript.
- **Interactive application:** Svelte 5 + TypeScript.
- **Local data:** SQLite through `bun:sqlite`, WAL mode, foreign keys enabled.
- **Local IPC:** Unix socket with an authenticated local protocol; Computer Use
  is a fallback when no semantic route exists.
- **Packaging:** one deterministic build with a readable server-rendered or
  static baseline; TypeScript enables graph recomputation, sorting, routing,
  and semantic animation.
- **Python:** prohibited.

The initial implementation has three product surfaces:

1. repository report/control plane;
2. machine-global agent registry and finder; and
3. MCP/CLI interfaces for observation, planning, manifest projection, routing,
   and telemetry.

### Current public package boundary

The current supported package export is
`@bradheitmann/mister-clean/control-plane` under Bun. It exposes exactly one
runtime value, `startLocalControlPlaneRuntime`, plus its two public types. The
runtime opens operator-selected repository/global SQLite files and a Unix-socket
or loopback-HTTP query/state-admission adapter. It returns a frozen handle with
`dispatch_supported: false` and `execution_supported: false`; route probes,
evidence verifiers, clocks, stores, services, authenticators, and adapters remain
internal composition capabilities. Inputs are exact own transport properties,
and deep package imports are blocked. This is the bounded implemented local
surface, not a claim that the broader directive-routing roadmap already ships.

Its packaged bytes are bound by the release manifest and claim scope and pass
source, built-package, and packed-consumer gates. `./dist/control-plane.js` is
not a required entrypoint, and the control-plane runtime performs no runtime-
attestation binding before use.

A surface counts as shipped only when it has a composition root and a canonical
type, build, and runtime test reachable from the repository's ordinary gates. A root typecheck
that excludes the Svelte app, a source import that bypasses the built package,
or a deny-only routing stub does not establish a product capability. Local IPC
uses bounded connect/read/write deadlines, closes connections on every terminal
path, and exposes a readiness probe. Route admission must exercise live
baseline, graph-version, authority, lease, and compare-and-swap checks; refusal
tests alone do not prove a usable route.

## 16. Visual and interaction contract

- Use the OKOA design system and its data-visualization lane.
- Animation must encode debt entering, being paid, being caused, becoming
  blocked, or unlocking dependencies; decorative movement is rejected.
- The opening hierarchy is calm and literal: verdict, issues remaining, change,
  and next action before detailed statistics.
- Voltage is the default theme. A compact, keyboard-accessible selector groups
  semantic theme families and offers a light and dark member for every
  selectable family. The initial operator families are Voltage, Stillness,
  Urban Japan, Japandi, and Japandi Warm. Selection is stored locally with a
  safe invalid-value fallback; changing theme never changes signal semantics,
  data classification, or evidence state. Any later developer-familiar family
  must be a restrained OKOA-token reinterpretation with both modes, not an
  imported raw palette.
- Progressive disclosure keeps full receipts, graph edges, tuples, and detector
  details available without crowding the headline.
- Every control is keyboard accessible; reduced-motion preferences preserve the
  same information without animation.
- The document is the one vertical scroll owner for every page. Panels, tables,
  inventories, histories, directives, and sidebars do not create competing or
  trapped vertical scroll regions.
- Changing views resets the document to the new view heading and moves focus to
  the main region without surprising screen-reader users. The mobile menu closes
  after every selection, including selection of the already-active view.
- Responsive reflow, wrapping, stacking, pagination, and progressive disclosure
  solve overflow. `overflow-x: hidden` or `clip` on the page is never used to
  conceal a defect. Dynamic values and 256-character unbroken tokens must wrap
  without overlapping adjacent panels.
- A local horizontal data region is allowed only when a responsive alternative
  cannot preserve meaning. It must be clearly bounded, named, keyboard
  focusable and scrollable, expose a visible affordance, retain accessible sticky
  column headers, and have a usable compact alternative. A collection of
  repeated per-group scrollers is rejected.
- Run History uses a progressively disclosed timeline/card treatment rather
  than a mega-table. Raw Inventory uses a compact summary plus bounded
  pagination and detail disclosure rather than turning every tuple into one
  multi-thousand-pixel wall.
- The app must remain legible and functionally complete at 320, 390, 768, 1024,
  1440, and 1920 CSS pixels and across the 640/641 and 1024/1025 breakpoint
  seams. The same proof covers phone portrait, tablet portrait and landscape,
  desktop, wide desktop, reduced motion, 200% text zoom/reflow, long-token
  fixtures, and a short-height desktop viewport whose last navigation target
  remains reachable.

## 17. Acceptance and adversarial gates

Before this product is called implemented:

- all seven pages render from one typed evidence model;
- the headline consumes the evidenced terminal contract; an empty issue list
  cannot independently produce `CLEAN`;
- the live snapshot passes one strict canonical nested schema and cross-field
  identity/accounting validation before any view renders;
- first/previous/current issue accounting reconciles exactly by stable ID;
- `Observed then` remains immutable while `Known now` updates deterministically;
- false positives cannot masquerade as debt paid;
- newly discovered pre-existing debt cannot masquerade as caused debt;
- a caused regression fails no-harm even when more debt was paid;
- issue duplicates and root-debt observations obey the identity contract;
- DAG order, critical path, and dynamic concurrency are deterministic;
- stale repository, graph, lease, target, or coordination-domain expectations
  refuse routing/integration;
- every prompt and route is reproducible from one manifest digest;
- a manifest-bound projection contains exactly that manifest's selected issues,
  issue graph, repository subject, and projection digest; a mismatch becomes an
  explicitly unbound `ADVISE` draft;
- presentation surfaces call the authoritative accounting, planner,
  qualification, and ranking implementations rather than local approximations;
- missing live evidence produces a visible unavailable/error state; demo data is
  opt-in, conspicuously labeled, and excluded from run history and qualification;
- qualification thresholds and category-weighted ranking are exact;
- untested and unknown data are visible;
- secret values never enter SQLite, reports, prompts, or receipts;
- local/global telemetry boundaries are enforced;
- historical imports preserve source bytes, trust tier, parser provenance,
  source spans, partial identities, artifact-time subjects, and append-only
  `Observed then`/`Known now` separation;
- ignored-local or narrative evidence cannot alone manufacture payment,
  acceptance, receipts, agent qualification, or dispatch authority;
- every complexity comparison binds the same classifier and exact
  tracked-plus-nonignored repository-object surface; a commit-only measurement
  cannot establish a dirty candidate's no-harm disposition;
- generated distribution mirrors count toward shipped weight but never authored
  structural complexity, and analyzer output cannot enter the measured subject;
- directive transitions verify exact evidence bytes, full identity bindings,
  state-specific semantics, actor separation, and the closing candidate;
- the service, app, and MCP/CLI composition roots are built and exercised through
  ordinary gates, including one successful live route-admission path;
- Unix-socket clients and servers pass deadline, disconnect, malformed-message,
  and orderly-shutdown tests without leaving the service hung;
- versioned canonicalization schemes either share one tested authority or carry
  explicit semantic boundaries and cross-domain adversarial fixtures;
- the no-JavaScript baseline remains truthful, while TypeScript enhancements
  are keyboard and reduced-motion accessible;
- the production live-data claim is exercised end to end through a real producer,
  authenticated/session-bound browser request, strict parser, and rendered view;
  mocked fetches and URL-shaped abstractions are insufficient;
- every approved paired theme renders legibly; persisted and invalid theme
  states are tested, and semantic signal meaning is invariant across themes;
- every route passes `document.scrollWidth === document.clientWidth` at 320,
  390, 768, 1024, 1440, and 1920 CSS pixels plus the 640/641 and 1024/1025
  seams, with no page-level clipping and one document vertical scroll owner;
- deep-scroll view changes, active-view mobile selection, sticky headers,
  long-token reflow, short-height navigation reachability, reduced motion, and
  200% text zoom pass rendered behavior tests;
- the complete repository-native suite passes;
- strict OKOA `lint` and `quality_check` each return zero errors and zero
  warnings; and
- the specific OKOA dashboard-lane compliance gate returns zero errors and zero
  warnings in addition to general quality validation; and
- rendered visual proof covers all specified widths, every main page, a light
  and dark representative, and the adverse interaction fixtures above.

### 17.1 Pinned dogfood gate

Mister Clean dogfoods itself without becoming its own authority:

- no Mister Clean commit may enter accepted history until its exact candidate
  tree crosses the complete GUARD barrier and the pinned dogfood treatment passes;
- the evaluator is a previously accepted installed release pinned by version,
  skill digest, and executable/runtime identity;
- the candidate is one frozen tracked-plus-nonignored repository object, and
  matched treatments receive the same blind packet;
- repository writes pause during the matched interval and a changed closing
  object invalidates the result;
- every treatment externally binds exact model + harness + reasoning immediately
  before dispatch and scoring; tab labels and worker self-report cannot bind it;
  evaluator identity,
  timing, commands, findings, mutations, intervention, and start/end object;
- an independent scorer adjudicates false positives, misses, process defects,
  and capability scores before the result enters qualification;
- confirmed misses become general detector/rule/fixture revisions, never
  issue-specific coaching; and
- neither the pinned release nor the working candidate may alone establish
  CLEAN for the candidate release.

Run this gate for every commit candidate, not periodically or only after a
series of commits. The full repository CLOSE treatment also runs at each
story/epic acceptance boundary and immediately before a release candidate.
A release is one closure transaction: the registry package and website must
identify the same accepted version and evidence-bound source. Publishing either
surface alone is an incomplete, `NOT CLEAN` release. Semantic version numbers
still follow the compatibility contract; the strength of this gate does not
mislabel a compatible release as a breaking major version.

## 18. Explicit non-goals for the first implementation

- No cloud or multi-user telemetry registry.
- No automatic cross-machine reconciliation.
- No universal scalar cleanliness score.
- No universal best-model leaderboard.
- No inference-provider quality ranking without supporting evidence.
- No hidden auto-execution beyond declared OPERATE authority.
- No replacement for the repository's native planning, Git, CI, or secret
  systems.
- No Python runtime, generator, migration, or helper.

## 19. Implementation sequence

1. Freeze TypeScript contracts for runs, issues, observations, debt flow,
   agents, deployments, routes, trials, graph edges, manifests, directives,
   receipts, and telemetry.
2. Add forward-only SQLite migrations and repository/global store boundaries.
3. Add deterministic accounting, graph planning, qualification, ranking, and
   manifest-projection libraries with adversarial fixtures.
4. Add the local Bun service, Unix-socket adapter, and MCP/CLI surfaces.
5. Build the Svelte seven-page shell against fixture data, then bind live data.
6. Migrate the original case-study evidence without rewriting its historical
   observations.
7. Run functional, adversarial, accessibility, OKOA, and four-breakpoint visual
   validation.
8. Integrate the control-plane contract into the Mister Clean skill and publish
   only after package, endpoint, and attestation parity are proven.

This sequence is a build order, not a license to stop at scaffolding. The
product is complete only when the live loop can observe, plan, route, verify,
account, and render one real repository without violating the governing
invariants.
