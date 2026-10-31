---
artifact_type: reference
classification_rationale: Plan for recurring, standardized field-window evaluations; planned, not implemented. Not a lifecycle-bearing planning artifact.
title: Field evaluations — recurring, standardized, one home
date: 2026-10-31
---

# Field evaluations — recurring, standardized, one home

Planned, not implemented. The first field window (`field-evals/2026-10-31-window/`) was assembled by hand with bash/awk helpers. This plan turns it into a repeatable procedure that any project can run, with one record schema and one home for each kind of data. It extends the existing evaluation plan ([EVAL-STANDARDIZATION-PLAN.md](EVAL-STANDARDIZATION-PLAN.md), EV-01 to EV-06) rather than replacing it. A field window becomes one more evidence cohort for the machine-local registry (EV-03).

## 1. What a field window produces (unchanged in spirit)

For one multi-agent working session, a window answers:
- for each agent (harness + model + reasoning level): tasks, first-pass accept or reject, rework, speed, stalls, and what is unknown;
- for each inference route: work per active hour, limit and transport events, and the allowance as a lower bound unless a limit was actually hit;
- which failures deserve a case study and a controlled replay.

Field evidence is naturalistic. It is never averaged into controlled scores (`evals/model-hygiene-trial.md`), and nothing in it ranks agents.

## 2. One schema: `field-evals/1`

Records are JSON Lines, one file per record type per window, each record carrying `schema: "field-evals/1"` and `window_id`. Identities are stable across windows, so new windows and new models extend the same tables.

| Record | Key fields | Notes |
|---|---|---|
| `window` | window_id, project_alias, start/end UTC, source digests (sha256 of each private source file), producer version | the project is an alias, never its name |
| `agent_card` | card_id (stable across windows), harness, model_label, reasoning_label, identity_status (`receipt` / `title_only` / `contract_only`), model_registry_ref (`<registry id>@<export version>` or `unbound`), routes_seen | one card per tuple; reasoning levels are never merged |
| `task_outcome` | task_id (anonymised), card_id, task_class, ack/done UTC, verdict, verifier card_id, reject_class, rework_round, failure_class | |
| `review_verdict` | verdict_id, task_id, verifier card_id, verdict, checks run (exit codes), frozen-tip match (yes/no), hosted-CI read (yes/no) | the verifier's own record |
| `limit_event` | route_id, card_id, UTC, kind (`rate_limit` / `quota` / `transport` / `detector_false_positive`), text_class, recovered | text classes, never raw pane text |
| `stall_event` | card_id, start/end UTC, cause (`blocking_wait` / `lost_lane` / `unknown` …), detected_by (`watcher` / `eval_read` / `human`) | |
| `route_observation` | route_id, model id as titled, provider, observation (n, window), is_free, cost_basis (`list` / `implied` / `actual`), price_source, implied_from (paid route ids, required when implied), input/cached_input/output USD per million tokens, cost_per_call_usd by reasoning level, context | field names match the model-facts registry's route schema (v1.2) so it can ingest and bind the rows |
| `probe` | probe_id, route_id, model id, UTC, tokens in/out/cached, time to first token (ms), output tokens per second, method (`probe`), cost (USD), cost_basis, price_source | deliberate latency probes; the window's probe budget is USD 1 at list price. Seat-counter throughput (output tokens per active hour, method `seat_counter`) is a different measure and is never compared with probe throughput |
| `case_study` | case_id, status, n, failure_class, replay treatments, durable-eval oracle | stays Markdown with a front-matter block; replays use the Slice Zero eval-case format |

**Agent and route are separate** (owner decision, `charter/owner-decisions/2026-10-31-field-evals-pricing-and-identity.md`). The agent (harness + model + reasoning level) owns work quality: accept rate, rework, code quality. The inference route owns speed, reliability, limits and stalls. `agent_card`, `task_outcome` and `review_verdict` describe the agent; `route_observation`, `probe` and `limit_event` describe the route. No projection blends route reliability into an agent's quality figures, and any joined table labels which side each figure belongs to.

**Pricing.** Costs are tokens multiplied by models.dev list prices (input, output and prompt-cache rates), recorded as `cost_basis: list` with `price_source` naming a dated models.dev snapshot and its sha256. This is the standard even where the owner's actual cost is lower. Free routes use `cost_basis: implied`, priced from a comparable paid provider of the same model or an average of several (listed in `implied_from`); spend actually measured in a window is `cost_basis: actual`. Reports mark them visibly as actually free. Price facts live in the model-facts registry; records cite the source they used.

A validator in the Mister Clean CLI refuses a record missing a required field, a probe that would take the window over its USD 1 probe budget, a card without an identity status, a numeric limit without source and date (or `UNKNOWN`), and any public file that fails the public-safety scan. The comparison tables in `FINDINGS.md` become a generated projection of the records, not hand-written prose.

## 3. One home for each kind of data

| Data | Home |
|---|---|
| Public ledger: records, cards, cases, generated findings | this repository, `field-evals/<window>/` (not a shipped material) |
| Schema and validator | this repository (`field-evals/1` schema files plus the CLI validator) |
| Raw sources (meter samples, event-log copies, receipts) and the id maps back to real names | `$AGENT_PRIVATE_ROOT/<project>/field-evals/{raw,maps}` (COMMON-STANDARD §1), never committed |
| Private, queryable history across windows | the machine-local evaluation store (EV-03), under the same private root |
| Model and provider facts | the model-facts registry; the ledger cites its ids and sends dated route observations |

## 4. Recurring-window recipe (any project)

Prerequisites: the Mister Clean CLI; `AGENT_PRIVATE_ROOT` set; a project adapter that says where the project's three sources are and how to read them.

1. **Declare the sources once** in a small adapter file (in the project's private root, not its repository): the meter (5-minute samples of seat, model label, token counters, limit-banner text), the event log (task start and finish, verdicts, limit and stall lines) and the receipts directory. The first adapter reads the formats used in the first window; other formats get their own adapter.
2. **Open a window** with a name, start time and planned end. The CLI records the source digests and creates the private window directory.
3. **Refresh on a cadence** (default every 2 hours, bounded by the planned end). Each refresh reads the sources read-only, applies the private id maps, writes the public records, regenerates the findings projection and runs the validator and the public-safety scan. A refresh that fails the scan writes nothing public.
4. **Turn failures into cases.** A failure seen once is a case study. The owner procedure (case study, clean extraction, controlled replay in a separate worktree, constant verifier) promotes repeatable ones to durable eval cases.
5. **Close the window.** Write the final comparison, send the route observations to the model-facts registry, and land the public ledger by pull request.
6. **Add new models by running the next window.** Cards are keyed by tuple, so a new model appears as a new card and new routes as new route ids; the comparison grows without changing the schema.

## 5. Bounded slices (each with its own done list under `charter/DONE/`)

1. **Slice Zero first** (already chartered): the eval-case validator and the agent-card identity check that `field-evals/1` reuses.
2. **FE-1 Schema and validator:** `field-evals/1` record definitions, the CLI validator, fail-without mutants for each refusal.
3. **FE-2 Refresh in the CLI:** replace the window's bash/awk helpers with a strict-TypeScript `field` subcommand (open, refresh, close), plus the first source adapter. Proof: rebuilding the 2026-10-31 window from its private sources reproduces the committed findings figures exactly.
4. **FE-3 Second window, second project:** run the recipe end to end on a different project's session, unchanged. That run sets the slice's proof date.
5. **FE-4 Store intake (EV-03):** windows import into the machine-local store; the community-versus-user data switch reads from it.

Out of scope here: a meter sampler for every harness (projects supply samples in the declared format; the first project's sampler is the reference), routing decisions, and any ranking.

## 6. Decided (owner, 2026-10-31)

Recorded in `charter/owner-decisions/2026-10-31-field-evals-pricing-and-identity.md`:
- Probe calls are allowed, capped at USD 1 per window at models.dev list price.
- Free routes carry an implied price and a visible "actually free" marker.
- Agent and inference route stay separate record types; route reliability never enters an agent's quality figures.
- The schema does not ship in the package until FE-3 has proven it on a second project.
- Bare role-and-number seat labels stay.
