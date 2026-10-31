---
card_id: AC-001
harness: pi
model: nemotron-3.5-super (VL, 120B A12B)
reasoning_label: high
identity_status: title_only   # model/reasoning read from the pane title or footer; not bound to a runtime receipt
evidence_class: field         # naturalistic; never averaged into a controlled score
window: 2026-10-31T02:37Z/open
model_registry_ref: unbound      # PM to bind to a model-facts registry record id; facts are not copied here
---

# AC-001 — pi / nemotron-3.5-super (VL, 120B A12B) / high

Inference sources seen (a footnote, not part of the identity): OpenRouter free route; NVIDIA hosted route (both seen). Whether the two routes serve the same weights/quantisation is unverified.

Seats that ran this tuple in the window: DEV-4, DEV-5, QA-5

## Work observed
- T-01 (DEV-5): functional proofs all verified by the verifier, REJECTED on documentation shape (see CS-001). Harness during T-01 is unbound (contract says OpenCode, footer says Pi).
- T-08 (DEV-5, after the route switch): fixture repair delivered in 26 min, unreviewed.
- A/B twin review of T-03 (QA-5, NVIDIA route): pending.
- DEV-4: no task recorded in the window; token counters flat for 25 minutes (cause unknown).

## Categorical data (refresh 1, through 03:09Z)
| field | value |
|---|---|
| tasks delivered | 2 (T-01 plus its rework, T-08 unreviewed) |
| first-pass accept | 0 of 1 |
| reject classes | process-contract 1 |
| rework | 1 delivered after the reject (T-01 renumbering fix), re-review pending |
| speed (NVIDIA route, 2 seats) | output about 48k tokens/h (QA-5) and about 68k tokens/h (DEV-5), counters rounded, 15-20 min windows |
| stalls | 1 candidate (DEV-5 on NVIDIA: flat counters one 5-min interval plus a long busy state, unconfirmed) |
| provider limit events | 0 |
| accuracy rating | none yet |

## Caveats
n = 1 task. Nothing here supports a ranking. DEV-4 and DEV-5 share the card but their routes differ.

## Refresh 2 (data through 04:48Z)
- T-01 rework ACCEPTED by the same verifier (03:51Z), 42 min after the rework DONE. First pass stays a reject; the rework converged in one round.
- T-08 REJECTED (QA-6, 03:56Z): proofs unnumbered again (CS-001, fourth instance) and a fixture README claim of byte-for-byte provenance that its own checksum file contradicts. The functional result held (test green, mutant red, derivation exact).
- T-29 (QA-5, NVIDIA route, as verifier): ACCEPTED a runner-pinning change with 3 mutants (2 red; the third checked independently). First verifier datum for this card.
- DEV-4: still no task; counters flat for 25 of 27 samples (idle, not a stall).
- Stall candidate A (CS-011) dropped: DEV-5 delivered twice after the flat interval.

| field | value (cumulative) |
|---|---|
| tasks delivered | 2 tasks plus 1 rework (T-01, T-01 rework, T-08) |
| first-pass accept | 0 of 2 reviewed (T-01, T-08) |
| reject classes | process-contract 2 (both doc-shape, CS-001), false-claim 1 (T-08) |
| rework | 1 of 1 completed rework accepted (T-01); T-08 pending |
| reviews issued (as verifier) | 1 accept (T-29) |
| stalls | 0 confirmed |
| provider limit events | 0 in 131 min on both routes |

## Final refresh (meter through 14:33:26Z, log through 14:40:25Z)
- T-08 rework (DEV-5, NVIDIA route): dispatched about 05:31Z, delivered 05:36Z, ACCEPTED by QA-6 05:38Z (proofs numbered, provenance text corrected), landed 05:42Z. The T-08 reject converged in one round.
- T-36 (DEV-4, OpenRouter free route): took a test-file lane at about 04:41Z, produced about 129k output tokens in 75 active minutes, then hit "Retry failed after 3 attempts: Upstream idle timeout exceeded" at 05:59Z. The seat never moved again (8.5 h) and posted no DONE or limit line; nobody in the log noticed. Its worktree has no commit and an index that lost almost every tracked path (CS-020).
- T-03 twin review (QA-5): never posted.
- Window: DEV-5 and QA-5 counters stopped moving at 05:44Z and 03:33Z respectively; neither seat had a further task.

| field | value (final, whole window) |
|---|---|
| tasks delivered | 2 tasks plus 2 reworks (T-01, T-01 rework, T-08, T-08 rework); 1 lane lost (T-36) |
| first-pass accept | 0 of 2 reviewed (T-01, T-08) |
| reject classes | process-contract 2 (doc shape, CS-001), false-claim 1 (T-08) |
| rework | 2 of 2 accepted, each in one round |
| reviews issued (as verifier) | 1 accept (T-29); 1 twin review never posted (T-03) |
| output tokens per active hour (Pi counters, rounded) | OpenRouter free: about 103k (DEV-4, 75 active min); NVIDIA: about 62k (DEV-5, 35 min) and 80k (QA-5, 35 min) |
| stalls | 1 terminal transport error (DEV-4, OpenRouter free); 0 on NVIDIA |
| provider limit events | 0 rate-limit or quota events on either route |
