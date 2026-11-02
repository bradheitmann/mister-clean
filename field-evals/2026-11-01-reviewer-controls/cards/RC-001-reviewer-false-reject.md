---
card_id: RC-001
metric: reviewer false-reject rate on known-good controls
evidence_class: controlled_replay   # same control bytes within a pair set; k=3 per population
identity_status: requested_model_recorded   # model on each replay observation; provider-reported model not checked
window: 2026-11-01T05:55Z/2026-11-02T01:02Z
model_registry_ref: unbound   # bind deepseek-flash and deepseek-v4-pro to model-facts registry ids
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
