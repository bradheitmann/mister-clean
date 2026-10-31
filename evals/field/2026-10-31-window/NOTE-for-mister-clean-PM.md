# Note for the Mister Clean PM

status: INTERIM (refresh 1, data through 2026-10-31T03:09Z). Replaced at the final refresh.

## What this is
A field ledger of one multi-agent session: agent cards, failure case studies written in the owner-note format (`OWNER-NOTE-2026-10-29`, section 2), and a providers note for model-atlas. Roadmap input for the evals-from-failures work, not a score. Branch `evals/field-window-2026-10-31`, nothing pushed.

## How it was gathered
Read-only reads of the source team's sampler file (5-minute pane samples of title, footer counters, limit-scan text), its event log (task starts and finishes, verdicts, rater scores) and its seat contracts. No pane was typed into. Identities are pane titles and footers, never runtime receipts. The log and the contracts disagree with the panes in places (CS-009).

## Sample sizes (refresh 1)
173 sampler samples, 29 seats, 31 minutes. 9 task rows: 7 worker deliveries (2 rejected, 1 accepted and corroborated by a second verifier, 1 awaiting review, 3 unreviewed) and 2 advisory answers. 11 case files, 13 cards. Zero provider limit events.

## Replay first
1. CS-001 treatments A/B/C (contract wording vs gate): decides whether two rejections belong to the tuple or the contract.
2. CS-003 citation trap with a mechanical resolver.
3. CS-009 and CS-007: identity read-back and limit-detector fixture, before any limits or provider table is trusted.

## Seams and cautions
- Your campaign observation intake (`docs/campaign-observation-intake.md`) wants per-observation model ids, source digests and private custody. This ledger does not use it: its rows lack source hashes. Mapping later is a design question for you.
- Adding files under `evals/field/` changes the tree against `MANIFEST.sha256`; I did not regenerate the manifest.
- Public repo: scan before any push; see the scrub pass recorded in the commit message.
