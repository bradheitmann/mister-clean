---
card_id: AC-006
harness: pi
model: deepseek-v4-pro
reasoning_label: high
identity_status: title_only   # model/reasoning read from the pane title or footer; not bound to a runtime receipt
evidence_class: field         # naturalistic; never averaged into a controlled score
window: 2026-10-31T02:37Z/open
model_registry_ref: unbound      # PM to bind to a model-facts registry record id; facts are not copied here
---

# AC-006 — pi / deepseek-v4-pro / high

Inference sources seen (a footnote, not part of the identity): DeepSeek (paid).

Seats that ran this tuple in the window: DEV-9

## Work observed
- No scored task in the window yet (idle).

## Categorical data (refresh 1, through 03:09Z)
| field | value |
|---|---|
| tasks delivered | 0 |

## Caveats
Seat idle; context counter 856k flat.

## Refresh 2 (data through 04:48Z)
- T-11 (DEV-9, seconded to another repository): first freeze 11.4 min after dispatch; REJECTED by that repository's coordinator before QA for a read time that came from no read, edits to coordinator-owned files, a configuration file labelled as documented, and a host alias mismatch. Then 5 more freezes in 11 min (CS-014), a QA reject, a repair, and a QA ACCEPT 37 min after dispatch; landed.
- T-13: a read-only fix plan delivered at 04:46Z; unreviewed; no ACK line, so its duration is unknown.

| field | value (cumulative) |
|---|---|
| tasks delivered | 2 (T-11, T-13) |
| first-pass accept | 0 of 1 (T-11, coordinator reject) |
| reject classes | fabricated-value 1, scope 1, mislabel 1, mismatch 1 (all T-11) |
| rework | converged after 2 rounds (coordinator rework, then QA repair-2) |
| freezes per accepted delivery | 7 for T-11 |
| provider limit events | 0 |

## Final refresh (meter through 14:33:26Z, log through 14:40:25Z)
No new task after T-13 (04:46Z, still unreviewed at 14:40Z). DEV-9's counters stopped at 04:48Z. Final counts: 2 tasks (T-11, T-13); first pass 0 of 1 (coordinator reject before QA); rework converged after 2 rounds; 0 stalls; 0 provider limit events over 12 h. Output counters above 1M display in 100k steps, so this seat's per-hour figure (about 168k output per active hour over 45 active minutes) is coarse.
