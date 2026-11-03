---
card_id: RC-001
metric: reviewer false-reject rate on known-good controls
evidence_class: controlled_replay   # same control bytes within a pair set; k=3 per population
identity_status: requested_model_recorded   # model on each replay observation; provider-reported model not checked
window: 2026-11-01T05:55Z/2026-11-02T01:02Z
model_registry_ref: [deepseek-v4.1-flash@2026.11.03-1, deepseek-v4-pro@2026.11.03-1]   # see "Registry binding" below
---

# RC-001: reviewer false-reject rate (deepseek-flash vs deepseek-v4-pro)

Why it matters: the owner made deepseek-flash the default reviewer. A higher false-reject rate on known-good controls would cost runs, because the gate refuses a run when a good control passes fewer than 2 of 3 times. This card holds the evidence that would justify deepseek-v4-pro as a named reviewer need. So far it is not strong enough to.

## Definitions
- **False reject:** one replay in which the reviewer refused a known-good control.
- **Rate:** false rejects divided by good-control replays.
- **Floor breach:** a population whose good control passed fewer than 2 of 3 times. A breach refuses the run.
- **Bad pass:** one replay in which the reviewer passed a known-bad control.

## Data (from `data/control-tallies.tsv`)
| reviewer | pair set | sessions | good replays | false rejects | rate | populations at 2/3 | floor breaches | bad passes |
|---|---|---|---|---|---|---|---|---|
| deepseek-v4-pro | A | 2 (S-01, S-02) | 24 | 1 | 4.2% | 1 (S-01 P03) | 0 | 0 of 24 |
| deepseek-v4-pro | B | 8 (S-03 to S-10) | 96 | 3 | 3.1% | 3 (S-04 P03, S-07 P03, S-10 P00) | 0 | 0 of 96 |
| deepseek-flash | B | 3 (S-11 to S-13) | 36 | 4 | 11.1% | 2 (S-11 P00, S-12 P01) | 1 (S-13 P03, 1 of 3) | 0 of 36 |

**Like-for-like comparison, set B only (same control bytes):** flash rejected 4 of 36 good replays and v4-pro 3 of 96. One-sided Fisher exact test: p = 0.088. Pooling set A as well (4 of 120 for v4-pro) gives p = 0.083.

## Reading
- Flash's false-reject rate is about 3.6 times v4-pro's on the same controls. Every flash session had at least one good population at or below the floor (3 of 3), against 3 of 8 for v4-pro on set B. Flash produced the only floor breach, a refused run.
- **Not significant at this sample size** (p ≈ 0.09, n = 36 flash replays). This is a signal to keep measuring, not yet a finding.
- Both reviewers refused every bad control (0 of 156 bad passes), so neither is lenient. The difference is only in rejecting good work.
- Where the misses fall: v4-pro's set-B misses are 2 on P03 and 1 on P00. Flash's are spread across P00, P01 and P03 (P03 twice). The P03 control is the hardest for both.

## Caveats
- One reviewer model per session, but the worker model that produced each session's candidates differs. The controls are fixed bytes, so the worker should not affect these tallies; that is assumed, not tested.
- Flash sessions all ran in one 2-hour window (23:08Z to 01:02Z). v4-pro sessions ran earlier. Provider-side drift between the windows is not ruled out.
- S-13's counts come from the gate's refusal line, because the session stopped at the floor and wrote no tally file.
- The reviewer's reasoning level is whatever the session's host profile set; it is not recorded per replay here.

## Refresh rule
Append a row to `data/control-tallies.tsv` for every new qualification session, keyed by pair set, and recompute the table and the test. Report the result when the flash sample reaches 72 good replays, or sooner if a second floor breach occurs.

## Refresh 1 (2026-11-02): per-replay evidence and defect attribution
Source: `data/replays-dedup.tsv`. It has one row per recorded replay, deduplicated by session, population, replay and response hash, and covers pair set B only (14 sessions; S-14 to S-16 are partial sessions that stopped early). The reviewer model is read from each replay's own observation, and stored verdicts were reproduced with the project's own scoring code (149/149 bad, by an independent offline rescoring).

| reviewer | good replays | false rejects | rate | bad replays | bad passed |
|---|---|---|---|---|---|
| deepseek-v4-pro | 115 | 3 | 2.6% | 113 | 0 |
| deepseek-flash | 36 | 4 | 11.1% | 36 | 0 |

- The false-reject gap holds with the larger v4-pro denominator: one-sided Fisher exact p = 0.056 (it was 0.088 in the original table). This is still a signal, not a finding.
- The original table's set-B row (3/96) counted completed sessions from tallies only. This refresh adds the replays of three partial sessions (S-14, S-15 and S-16: 19 good replays, none rejected).

**New column: `defect_sufficient` (bad controls only).** It is true when the refusal survives with the planted defect alone, i.e. the bad would pass once the planted defect's blocking findings are removed. A false value means the reviewer also blocked the bad for other reasons.

| reviewer | P00 | P01 | P02 | P03 | all |
|---|---|---|---|---|---|
| deepseek-v4-pro | 31/33 | 18/27 | 2/27 | 17/26 | **68/113 (60%)** |
| deepseek-flash | 7/9 | 3/9 | 0/9 | 0/9 | **10/36 (28%)** |

- Flash refuses the same bad controls with additional blocking findings far more often (one-sided Fisher exact p = 0.0006). The direction holds in every population. This matches flash's higher false-reject rate: it is the stricter reviewer, not just a noisier one.
- **Caveat that limits both tables:** the bad controls are not minimal pairs. They are synthetic placeholder projects, and the good controls are real extractions. So "additional blocking findings" are partly legitimate placeholder catches. The defect-attribution numbers measure reviewer strictness on these specific controls, not detection of the planted defect alone. The project has adopted minimal-pair controls; re-measure on them.

## Registry binding (2026-11-02, seam-sync with the model-facts registry)
The reviewer names in this card's data are provider model ids as the project's host reports them. They bind to registry cards through the registry's own route records (export 2026.11.03-1):
- `deepseek-flash` → route `route.deepseek.deepseek-flash` → card `deepseek-v4.1-flash` (export 2026.11.03-1; the earlier card `deepseek-v4-flash` is superseded, because the provider serves `deepseek-flash` as DeepSeek-V4.1-Flash);
- `deepseek-v4-pro` → route `route.deepseek.deepseek-v4-pro` → card `deepseek-v4-pro`.
Join other repositories' model data on the CARD id (the form `<id>@<export_version>`), not on the provider model id. Re-bound 2026-11-03 to export 2026.11.03-1, where `route.deepseek.deepseek-flash` binds `deepseek-v4.1-flash`.
