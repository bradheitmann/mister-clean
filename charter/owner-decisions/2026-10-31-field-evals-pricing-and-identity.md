# Owner decision — 2026-10-31 field-evals-pricing-and-identity

## Context

The field-evals plan (`project/planning/FIELD-EVALS-PLAN.md`) left three questions open: whether a window may spend inference on deliberate latency probes, whether the record schema ships in the package, and whether the first window's bare role-number seat labels stay. The first field window also measured agents and inference routes in the same tables, and recorded free routes with no price. The owner answered through the coordinating PM on 2026-10-31; the answers are recorded here in spirit, not verbatim.

## Decision

1. **Probe calls are allowed.** A window may make deliberate probe calls to measure time to first token and tokens per second, capped at **USD 1 per window**. Cost is computed as tokens multiplied by **models.dev list pricing** (input, output and prompt-cache rates). models.dev is the standard price source even though the owner's actual cost is lower (monthly plans).
2. **Free models carry an implied price.** A free route is priced at the market price of the same model from a comparable paid provider (or the average of several paid providers), recorded with its source. Reports mark such routes visibly as actually free (for example, a distinct colour in HTML). Rationale: free will not always stay free, and free carries hidden costs (training on submitted data, reliability, call limits).
3. **Agent and inference route are separate.** The agent is harness + model + reasoning level and is accountable for work quality (code quality, accept rate, rework). The inference provider or route is not part of the agent ("the car it is driving"); it owns speed (time to first token, tokens per second), reliability, limits and stalls. They are separate record types, and route reliability is never blended into an agent's quality score.
4. **Defaults, unless the owner objects later:** do not ship the schema in the package until FE-3 has proven it on a second project; keep the bare role-number seat labels in public ledgers.

## Rejected alternative

- Pricing at the owner's actual cost (monthly plans): rejected because it is private, varies by account, and is not comparable across projects or users.
- Recording free routes with no price: rejected for the hidden-cost reasons above.
- One combined agent score that includes route reliability: rejected; it would penalise an agent for its provider.

## Follow-ups

- FE-1 schema: price fields on route and probe records (`cost_basis`: `list` / `implied` / `actual`; `price_source`; `is_free`), a `probe` record type with its cost, and a per-window probe budget check that refuses a probe that would exceed USD 1.
- FE-1 schema: agent quality records and route performance records stay separate; any projection that joins them must label which side each figure belongs to.
- Price facts belong to the model-facts registry; this repository records the price basis and source it used, by reference.
- Reports: a visible "actually free" marker on implied-price routes.

## Amendment — 2026-10-31 (owner follow-up)

1. **Mister Clean sets the standard for model-eval data across repositories.** The `field-evals/1` format and its validator ship in the Mister Clean package. Prepare for it now; the release that ships them follows FE-3's proof on a second project. This replaces decision 4's "do not ship the schema" default.
2. **Extensible.** Agent cards and eval records support repository-local extensions (evals that exist in one repository only, for specific roles or purposes) through namespaced extension fields or local eval types that validate against the core schema without changing it.
3. **One machine-wide database by default.** One local SQLite store per machine (the existing machine-local store, EV-03) tracks eval data across all projects on that machine. A repository-local database is the user's own choice and configuration.
4. **Build order** FE-1, FE-2, FE-3, FE-4 is agreed; FE-4 (store import) comes after FE-2, timed by the coordinating PM.
5. **Pseudonymise seat labels in public ledgers.** Seat names can reveal repository names, and bare role-number labels could carry identity later. Use stable opaque ids (for example `seat-7f3a`), with the mapping kept only under the private data root. Apply this to the existing ledger in a follow-up change; earlier history stays as is unless the owner decides otherwise. This replaces decision 4's "keep the bare role-number seat labels" default.
