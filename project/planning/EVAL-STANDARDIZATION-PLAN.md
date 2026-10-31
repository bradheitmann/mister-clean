---
artifact_type: reference
classification_rationale: Implementation backlog and acceptance contract; task states are explicitly recorded below, not an executed slice or acceptance receipt.
title: Cross-project evaluation standardization
owner: A/PO-ASTRA
date: 2026-10-05
---

# Cross-project evaluation standardization

The [Agent Eval Lab specification](AGENT-EVAL-LAB.md) extends this plan with
role profiles, frozen experiments, answer-key corrections, attempt-level grades
and an interactive comparison workbench. Deliver it through EV-01–EV-06 below.

## Objective and status

**Planned; not dispatched or implemented.** Provide one machine-local,
cross-project evaluation system in which native and registered extension
categories share admission, evidence, query, and report contracts without
confusing operational telemetry with independently verified quality.

Authority: Brad requested this plan on 2026-10-05. A/PO-ASTRA owns scope and
acceptance; the Mister Clean workspace EXEC PM assigns implementation after
Brad confirms staffing. Swarm Hug handles existing-debt remediation only after
its own infrastructure repairs are independently accepted. Herdr is not an
execution dependency. This document grants no publication, fleet, credential,
database migration, or worker-launch authority.

Product alignment: sections 7–10, 14–17 of
[the control-plane contract](../../references/control-plane-product-spec.md).
`project/planning/_NORTH-STAR.md` is absent; use that approved product contract
as the available vision source. Do not create a new vision exercise as a
prerequisite. Existing audit remediation and previously planned objectives
remain in scope; this is an additive backlog, not their replacement.

## Observed baseline, not completion evidence

Read-only inspection on 2026-10-05 targeted local main
`c6297bd70263bd43ecfa72ca514a7828272aa8cb` before these planning changes.

- Main has SQLite evaluation tables, identity/evidence admission, 24 native
  repository capabilities, and a separate protocol-improvement capability.
- Category parsing and evaluator generation are source-controlled, fixed
  vocabularies; inserting arbitrary database rows is not a supported extension.
- The snapshot producer requires the stored taxonomy to equal the native list,
  and snapshot schemas use fixed capability enums. Registration and report
  validation must change together; unrestricted string IDs are not a safe fix.
- Two inspected local-inference campaign `global.sqlite` stores had zero trials,
  trial evaluations, and agent-run events. The October 3 observed campaign
  had 36,569 operational observations, but zero agent tuples and capabilities.
  These are time-bound counts, not an exhaustive all-project census.
- The machine-local invocation journal had 5,422 records. Journal records
  are not evaluations and may include several records per invocation.
- Campaign observation intake exists in separate work, including commit
  `062850d81ab6d155ef3a3002dc56f57027ec481f`, not this main baseline.
  Reuse only after reviewing lineage, ownership, tests, and accepted scope.
- A single authoritative machine-wide evaluation store and universal consumer
  adoption were not established. Campaign stores named `global.sqlite` do not
  establish either claim.

Keep private absolute store paths, raw records, and census receipts outside
the public package. Preserve originals and distinguish live, historical,
quarantined, and synthetic sources before import. Do not reinterpret old
telemetry as a completed prospective evaluation.

## Delivery order and ownership

All rows start **planned/unassigned**. EXEC PM must bind each dispatch to an
exact candidate, write scope, named implementer, independent reviewer, native
gates, and evidence location. Complete existing audit adjudication crosswalks
before implementing overlapping fixes; reuse their stable IDs, never invent
a second debt count.

| ID | Deliverable | Depends on | Primary seams | Size |
|---|---|---|---|---|
| EV-01 | Store/consumer inventory and prior-work disposition | None | existing campaign helpers, intake configuration, external census | M |
| EV-02 | Versioned category/rubric extension contract | EV-01 | contracts/primitives, capability taxonomy and evaluator registry | M |
| EV-03 | Canonical machine-local registry and safe consolidation | EV-01, EV-02 | persistence migrations, SQLite stores, import boundary, runtime configuration | L |
| EV-04 | Supported evaluation lifecycle and consumer adoption | EV-02, EV-03 | evaluation intake/recorder/identity/evaluator adapters, public CLI/MCP/runtime seams | L |
| EV-05 | Shared projections and designed report compatibility | EV-02, EV-03, EV-04 | snapshot contracts/producer, qualification/ranking, Svelte app | M |
| EV-06 | Independent end-to-end acceptance and operator documentation | EV-01 through EV-05 | package consumer tests, isolated fixtures, docs, report proof | M |

EV-01 does not require a fleet-wide crawl or new infrastructure. Inventory
known consumers and record coverage gaps; inaccessible projects remain explicit
unknowns. EV-02 design and EV-03 migration design may be reviewed together, but
shared contract/schema writers serialize. EV-05 fixture work may proceed after
EV-02 freezes; live acceptance still requires EV-04. No estimated effort is a
promise or permission to skip acceptance.

## EV-01 — Establish actual usage and reuse existing work

1. Read-only enumerate configured evaluation consumers and store locations;
   distinguish campaign stores, canonical stores, fixtures, and preserved copies.
2. Bind census to store identity/schema version/time and collect table counts,
   source project, latest event, identity coverage, and admission status without
   exporting secrets or unrelated session contents.
3. Map separate campaign-observer branches to current main and existing audit
   recommendations. Record reuse, supersession, or missing deciding evidence.
4. Select the authoritative local-store configuration and migration ownership;
   do not infer it from a filename or silently merge all discovered databases.

Acceptance: every inspected source has a disposition; missing consumers are
listed honestly; no data is changed; a reproducible query distinguishes
observations, invocation receipts, run events, trials, and qualification.

## EV-02 — Register categories without schema forks

Extend the existing taxonomy rather than replacing it. Use immutable definition
revisions with the following conceptual keys (final SQL names are implementation
details, not a requirement to add redundant tables):

| Record | Required identity and content |
|---|---|
| Category revision | namespace + category ID + version; owner; scope; label; description; applicability; definition digest |
| Rubric revision | category revision; evaluator/version; criterion IDs; Boolean or typed metric result; units/direction; aggregation and missing-value policy; evidence requirements |
| Registry event | registration/approval/deprecation; actor; time; authority and rationale; prior revision where applicable |
| Trial binding | exact category/rubric revisions, task class/difficulty, project, treatment, candidate, evaluator, evidence, outcome |

Namespaces reserve native Mister Clean IDs and permit project or organization
extensions. Definitions begin experimental, may be approved through configured
maintainer authority, and can be deprecated without deletion. Label aliases are
not identity. Version changes never silently recalculate historical results.
Keep native qualification policy separate from extension validity: an approved
custom category does not automatically count toward native clearance.
Definitions are declarative data, not arbitrary executable plugins. Reuse
trusted evaluator adapters; registration must not grant code execution.

Acceptance: native IDs remain compatible; unknown/unregistered categories fail
with actionable errors; valid registered categories work without source edits;
collisions, conflicting same-version definitions, unauthorized approval, and
incompatible rubric comparisons are rejected. Null/not-applicable is not false
or zero. Generic four-dimension judgments alone must not erase a category's
specific success criteria, including Spit-shine and Wayfinding requirements.

## EV-03 — One local authority, recoverable import

Use existing Bun/SQLite persistence with explicit operator-owned configuration
for the canonical machine-local store; repository evidence remains local.
Campaign IDs partition observations, not separate competing qualification truths.
Resolve the current campaign-isolation contract explicitly; do not just point
single-campaign importers at a multi-campaign database.

Add only necessary forward migrations, versioned import envelopes, source-ID
deduplication and transaction boundaries. Preserve immutable source references,
source digests and import receipts. Keep synthetic/test data out of live routing.
Current trials bind an unversioned capability ID. New trials must bind exact
definition/rubric revisions; legacy mappings require evidence, not guessed
versions. Existing migration digests are immutable. Check actual store versions
before choosing the next migration number, including campaign-extended stores.
Retain unmappable records as evidence-only with reasons. Plan rollback through
verified backup/restore and a shadow import before any live cutover; never
downgrade schemas or rewrite historical evidence in place.

Acceptance: duplicate replay adds no credit; conflicting replay fails; interrupted
imports resume without double counting; concurrent writers preserve integrity;
old store versions remain readable through explicit adapters; source totals
reconcile by disposition; restore is tested in isolation. Paths and credentials
do not leak into public reports. No live store is migrated during development
without a separately bounded execution assignment.

## EV-04 — Make genuine evaluations usable

Expose a documented supported flow through existing public boundaries:
register definition/project -> bind actual agent treatment -> start run -> retain
independent evaluator evidence -> admit outcome -> query admission receipt.
Do not bypass identity custody or use deep private imports as the consumer API.

Receipts distinguish accepted trial, evidence-only/telemetry-only, pending, and
rejected with reasons. Record why a requested evaluation did not become a trial.
Keep actual/requested model, harness/version, reasoning, inference route and
identity uncertainty distinct. Provider cost/speed telemetry does not award
quality credit. Existing native 10/25/50 qualification and ongoing sampling
remain unchanged and durable across projects/restarts.

Project-specific evals outside a Mister Clean invocation need their own explicit
submitted external-evaluation cohort. Do not forge an invocation or broaden collection to unrelated
computer activity. Cross-project quality transfer requires an explicit compatible
category/rubric/identity policy, not just a shared model name.

Acceptance: one native and one extension trial complete through the supported
built-package interface with independent evidence; spoofed identity, self-awarded
credit, stale candidates, missing evidence and partial/replayed outcomes fail
safely. At least two authorized consumer repositories demonstrate the same flow
with bounded tasks, without mandatory inference launches or fabricated historical
trials. Consumer writes require their own scoped dispatch. Schema fixtures may
prove mechanics but never production qualification.

## EV-05 — Reports share one meaning

Extend the canonical snapshot/query contract and existing seven-page Svelte
shell, Finder and agent-card details. Do not build a parallel custom report stack.
Definition metadata drives category labels, criterion disclosure, units and
filters. Ranking uses only comparable, eligible trials under an explicit policy;
experimental and incomparable results stay visible but separately labeled.

Show observations collected, runs recorded, evaluations requested/admitted,
pending/rejected/evidence-only records, sample sizes, qualification and freshness
as separate measures. Unknown data remains unknown. Preserve native visual
semantics, category weighting and evidence drill-down. General extensions must
not require a full repository CLOSE result merely to display their eval results.

Acceptance: native and extension fixtures and live records use the same parser
and views; units, version filters and unknown states survive export/re-import;
UI and CLI agree for the same query identity. Use current OKOA server tokens and
validators, zero validation errors/warnings, and responsive/reduced-motion/
keyboard proof under the existing product contract. Do not claim render proof
from screenshots of demo data alone.

## EV-06 — Close the whole loop

Independent QA verifies inventory -> definition registration -> admission ->
storage -> query -> report using one frozen candidate. Include negative controls
for fixture contamination, wrong project, same-ID/different-bytes replay, rubric
version drift, identity fallback, restart sampling drift, custom-category credit
leakage, unreadable evidence and interrupted migration.

Run existing strict TypeScript, control-plane, package and complete native gates
under repository execution leases. `pnpm run ci:check` is the terminal matrix;
discover current focused commands from package scripts rather than inventing a
lint command. The repository's pinned dogfood and independent GUARD obligations
still apply. No candidate may certify itself or inherit an older receipt.

Deliver a concise consumer guide, category registration example, schema/migration
reference, store discovery/recovery guide, and native/extension report examples.
Refresh CURRENT and the roadmap only to the state proven by exact receipts.
Do not publish, update global harness installs or upload telemetry as part of
this planning assignment. Multi-user/cloud and automatic cross-machine sync
remain out of scope.

## Risks and work boundaries

- Existing branch work can be lost or duplicated: EV-01 lineage/disposition
  precedes implementation; preserve all historical source stores.
- Collection can masquerade as evaluation: separate counts and admission reasons.
- Ad hoc rubrics can destroy comparability: immutable versioned definitions and
  explicit qualification mappings, never implicit aggregate score conversion.
- Registry growth can create complexity debt: extend existing contracts/tables
  only as needed; no new daemon, runner framework or generic plugin engine.
- Allowed now: planning documents and navigation links only. Implementation
  scope is assigned later by EXEC PM. No production/store/fleet changes now.
- Use strict TypeScript for the existing TS/Svelte/Bun seams; Rust is the default
  for genuinely separate helpers unless a clear integration reason favors TS.
  No new Python or authored JavaScript; pnpm manages dependencies.

## Closure checklist

- [ ] EV-01 inventory and prior-work dispositions accepted.
- [ ] EV-02 native compatibility and extension registration accepted.
- [ ] EV-03 isolated migration/recovery and source accounting accepted.
- [ ] EV-04 independent native/extension trials and consumer receipts accepted.
- [ ] EV-05 shared query/report and OKOA rendered acceptance complete.
- [ ] EV-06 exact-candidate gates, dogfood, independent QA/GUARD and docs complete.

Until these are evidenced, the feature remains planned/incomplete, regardless
of observation counts or the existence of database tables.
