# Instruction polarity 2026-11-02 (observational ledger plus one probe)

What this is: per-worker-model rates of omitting a field that an instruction implies but never lists, measured from a spec-compiler project's runs under byte-identical instructions, plus one small controlled probe. The source project is not named, and its paths and run ids are removed.

## Layout
| path | content |
|---|---|
| `data/p02-schema-version-omission.tsv` | one row per worker model: registry card ref, attempts, omissions, truncations, run count |
| `data/falsifier-v4-pro.tsv` | the 2+2 probe: implicit vs one explicit positive line |
| `cards/RC-002-implicit-constant-omission.md` | the card: question, data, test, reading, provenance, caveats |

## Rules this ledger follows
- Models are named by the provider's model id. Each row also gives the model-registry card it binds to (`<id>@<export_version>`), or `none@` when that export has no card for it.
- Counts are attempts of one phase. "No result" (truncated at the output cap) is counted separately and is never scored as an omission.
- Nothing here ranks models overall. It measures one behaviour on one instruction.
