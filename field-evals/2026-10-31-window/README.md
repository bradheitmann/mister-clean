# Field window 2026-10-31 (naturalistic evidence ledger)

What this is: an observational record of a multi-agent team working a Rust spec-compiler project, kept as the field ledger that `evals/model-hygiene-trial.md` says must stay separate from controlled scores. The source project is not named; paths, branches, slice ids and product details are removed.

Concepts (owner definitions): an agent is harness + model + reasoning level; provider is a routing footnote; failures become case studies and then replayable eval cases; agent cards carry categorical data; provider facts belong in model-facts registry.

## Layout
| path | content |
|---|---|
| `FINDINGS.md` | answers to the three questions, with sample sizes; replaced at each refresh |
| `cards/AC-nnn-*.md` | one card per agent tuple (identity, sources seen, work, categorical data, caveats) |
| `cases/CS-nnn-*.md` | failure and observation case studies in the owner-note format, each with a replay hint |
| `data/seat-tuples.tsv` | seat to card map with identity status |
| `data/tasks.tsv` | per-task rows (class, times, verifier, verdict, reject class, note) |
| `data/limits.tsv` | limit events and detector false positives |
| `data/meter-summary.tsv`, `data/meter-intervals.tsv` | derived from the 5-minute pane sampler by the scripts in `tools/` |
| `tools/` | `derive-meter.sh`, `derive-intervals.sh`, `refresh-derived.sh` (awk, no interpreters beyond bash) |
| `NOTE-for-model-registry-PM.md` | provider observations to bind or reject |
| `NOTE-for-mister-clean-PM.md` | what this is, how it was gathered, what to replay first |

## Rules this ledger follows
- Nothing here ranks agents. Every identity is title_only or weaker until a runtime receipt binds model, harness, level and route (CS-009).
- Reasoning levels are never merged on one card.
- Task ids (T-nn) are anonymised; the private mapping from ids to project slices is kept outside this repository.
- Seats appear only as stable opaque ids (`seat-` plus four hex characters), with a generic `role` column in `data/seat-tuples.tsv` (worker, verifier, coordinator, …). The ids are salted hashes; the salt and the id map live only under the private data root, never in this repository. Team prefixes, pane identifiers, seat names and repository names are removed. (Owner decision amendment, 2026-10-31; earlier commits keep their original labels.)
- The raw sampler file is not committed (pane scrollback carries project text). Derived tables are.
- Single-rater scores are labelled as such.

## Regenerating the derived tables
`SEAT_MAP_SED=<private combined seat map> tools/refresh-derived.sh /absolute/path/to/raw-meter.tsv` (input columns: utc, surface, title, model, footer, banner). The combined map is the private seat map followed by the private opaque-id map, so derived tables only ever contain opaque ids.

## Registry binding (2026-11-02)
Every agent card's `model_registry_ref` now names a model-registry card id in the form `<id>@<export_version>` (export 2026.11.03-1), or `none@2026.11.03-1` when that export carries no card for the model. Bound: deepseek-v4.1-flash (3 cards; re-bound from the superseded deepseek-v4-flash on 2026-11-03), deepseek-v4-pro (1), xiaomi-mimo-v2.6-flash (2). No card: nemotron-3.5-super (3; its routes exist without a card), and step-5-preview, inkling, mimo-v2.6-pro, nemotron-3-ultra and muse-wonder (6). Routes stay unbound, because these cards' identity is title_only (CS-009). Join other repositories' model data on the card id, never on a free-text model name.
