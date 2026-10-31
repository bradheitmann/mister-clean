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
- Seats appear as bare role-and-number labels (for example `DEV-4`, `QA-5`) or pseudonyms (`PAIR-E-DEV`, `PM-A`). Team prefixes, pane identifiers and repository names are removed. Role-number labels are kept on purpose so one seat can be followed across cards, cases and tables; they carry no person, project or machine identity.
- The raw sampler file is not committed (pane scrollback carries project text). Derived tables are.
- Single-rater scores are labelled as such.

## Regenerating the derived tables
`tools/refresh-derived.sh /absolute/path/to/raw-meter.tsv` (input columns: utc, surface, title, model, footer, banner).
