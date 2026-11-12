# First-position ladder 2026-11-12 (observational ledger)

What this is: the attempt outcomes of the first model on a fixed retry ladder, across four consecutive runs of a multi-stage evidence pipeline, and the finding kinds its first attempts drew. The source project is not named, and its paths and run ids are removed.

## Layout
| path | content |
|---|---|
| `data/ladder-attempts-by-model.tsv` | one row per ladder model: its position, accepted, rejected and uncharged attempts, and acceptance of charged attempts |
| `data/deepseek-flash-non-accepted.tsv` | the first model's non-accepted attempts by outcome, failure class and cause |
| `data/attempt1-finding-kinds.tsv` | the reviewers' findings on attempt 1, by kind |
| `cases/CS-022-first-position-model-rarely-accepted.md` | the case: what happened, why the comparison is confounded, the controlled replication plan |

## Rules this ledger follows
- Models are named by the provider's model id, as the runs recorded them. Identity is the route label only (`identity_status: route_label`); no row binds to a model-registry card.
- An uncharged attempt (provider pause or failure before a charged result) is counted separately and never scored as a rejection.
- Nothing here ranks models overall. The first model always made attempt 1, so ladder position and model are confounded.
