---
card_id: RC-002
metric: omission of an implicitly required constant field, per worker model, under byte-identical instructions
evidence_class: observational_plus_probe   # 12 project runs (observational) plus a 2+2 controlled probe
identity_status: requested_model_recorded   # model as requested from each provider; provider-reported model not checked
window: 2026-10-29/2026-11-02
model_registry_ref: see data/p02-schema-version-omission.tsv (export 2026.11.03-1)
---

# RC-002: implicit constant omission (does the model write a field the instruction only implies?)

**Question.** One phase of a spec-compiler project asks the worker for an "intent card" JSON artifact. The instruction names its schema id only in a parenthetical, "(schema `<project>.intent-card/1`)". It never lists `schema_version` among the fields to write. So the requirement is neither positive nor negative; it is implicit. Which worker models still write the field?

**Instruction held constant.** All 12 runs received byte-identical instructions:
- the phase instruction sha256 starts `8389804b61`;
- the worker role starts `dc47128937`;
- the wire model starts `9d8e11a65b`.

So instruction wording cannot explain the variation, and the measure is the artifact's own content.

## Data (`data/p02-schema-version-omission.tsv`)
| worker model (provider id) | registry card | attempts | card missing the field | no result (truncated) |
|---|---|---|---|---|
| deepseek-v4-pro | deepseek-v4-pro | 14 | **11 (79%)** | 0 |
| deepseek-flash | deepseek-v4.1-flash | 6 | 2 | 0 |
| nvidia/nemotron-3.5-super-vl:free | none | 5 | 2 | 0 |
| xiaomi/mimo-v2.6-pro | none | 2 | 1 | 0 |
| z-ai/glm-5.3-flash | none | 4 | 0 | 0 |
| anthropic/claude-haiku-5.5 | none | 6 | 0 | 1 |
| openai/gpt-6-luna | none | 2 | 0 | 0 |
| deepseek-v4.1-flash | deepseek-v4.1-flash | 1 | 0 | 0 |
| qwen/qwen3.8-27b | qwen3.8-27b | 4 | 0 | 2 (length cap) |

- deepseek-v4-pro omits the field in 11 of 14 attempts. All other models together omit it in 5 of 30. One-sided Fisher exact test: p = 0.00013.
- Note: `deepseek-flash` and `deepseek-v4.1-flash` are two provider ids that the registry binds to the same card. They are kept as separate rows because they arrived through different routes.

## Probe (`data/falsifier-v4-pro.tsv`)
- Setup: deepseek-v4-pro on one real assembled prompt, JSON-object mode, max 32,768 output tokens.
- Implicit (as served): 1 of 2 runs omitted the field.
- One positive literal line added ("the object starts with `"schema_version": …`"): 0 of 2 omitted it.
- All four runs finished with `stop`. Output ran 16,602 to 27,638 tokens.
- **This is directional support that an explicit positive line helps, not proof** (n = 2 per arm).

## Reading
1. Omitting an implicitly named constant is a property of the model, not of instruction polarity: one model at 79%, five models at 0% under the same bytes.
2. That makes it routing evidence. When a task's artifacts carry constants the instruction only implies, prefer models with a 0 rate here. Or make the constant explicit and positive in the instruction, which is the cheap mitigation the probe supports.
3. The project's own guard stamps an omitted fixed constant and records the stamp, so in that project the omission costs no attempt. This card measures the model behaviour, not the project's outcome.

## Provenance and checks
- Observational table and probe: the tier-ladder PM's instruction-polarity round.
- Second-family check: an independent analyst (a different model family) re-derived the per-model table, the instruction hashes and the probe rows from the raw files, and agrees.
- Gap: a k = 3-per-arm extension of the probe was not run, and is recorded as optional by its owner.

## Caveats
- Small n for several models (1–6 attempts). Only deepseek-v4-pro's rate is well supported.
- The models came through different provider routes. The route is a footnote, and identity is "requested", not provider-confirmed.
- One instruction and one artifact type. Do not generalise to other constants without measuring.

## Refresh rule
Add rows when new runs of this phase land, keeping the instruction hashes as a column if they change. Re-test proposal "explicit positive line" at k ≥ 3 per arm before treating it as established.
