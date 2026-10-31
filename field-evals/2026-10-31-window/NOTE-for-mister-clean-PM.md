# Note for the Mister Clean PM

status: INTERIM (refresh 2, data through 2026-10-31T04:48:40Z). Replaced at the final refresh.

## What this is
A field ledger of one multi-agent session that grew from one repository to eight during the window: agent cards, failure case studies in the owner-note format (`OWNER-NOTE-2026-10-29`, section 2), derived meter tables, and a providers note for model-facts registry. Roadmap input for the evals-from-failures work, not a score. Branch `evals/field-window-2026-10-31`, nothing pushed.

## How it was gathered
Read-only reads of the source team's sampler file (5-minute pane samples of title, footer counters and limit-scan text), its event log (acks, deliveries, verdicts, coordinator lines) and its seat contracts. No pane was typed into. Identities are pane titles and footers, never runtime receipts (CS-009). Verdicts are log verdicts, not validated receipts (CS-015). Seat names are anonymised with a private map kept outside the repository; new pair seats are `PAIR-<letter>-DEV` and `PAIR-<letter>-QA`, and pair E is the hygiene tool's own repository.

## Sample sizes (refresh 2)
1,099 sampler samples, 49 seats, 131 minutes. 29 task rows: 20 worker deliveries or in-progress lanes, 2 advisory answers, 7 verifier-only rows (coordinator-authored or earlier work). Verdict events by an independent verifier: 20. 14 cards (1 new: AC-014), 15 case files (4 new: CS-012 to CS-015), every case now carries a `failure_class:` line from `evals/rotation-campaign.md`. Provider rate-limit events: 0. Transport errors: 1 (recovered).

## What changed since refresh 1
- The rework of the first rejected task was accepted; the AC-001 worker's next task was rejected again on the same numbering gate (CS-001, fourth instance). The source team's orchestrator then told every worker to use top-level numbered proofs, which is CS-001 treatment B in the field, without controls.
- Seven pair workers (AC-003) and seven pair verifiers (AC-014, new) ran cross-family on paid low-cost routes. Both AC-003 deliveries with an independent first-pass verdict were rejected; both reworks converged in one round.
- New failures: CS-012 (blocking sleeps lock out the coordinator), CS-013 (a brief-induced, unapproved container runtime), CS-014 (a fabricated read time and freeze churn that voided three partial reviews), CS-015 (a receipt checker that passes unknown verdict spellings).
- Stall candidate A dropped; candidate B persists for more than 2 hours with no explanation collected.

## Replay first
1. CS-001 treatments A/B/C, with the governance tool version pinned.
2. CS-012 treatment C (non-blocking wait primitive), then A versus B.
3. CS-014 treatment B (schema allows "unknown").
4. CS-009, CS-007, CS-015 fixtures before any provider table or verdict tally is trusted.

## Dogfood gaps (where Mister Clean's own tooling fell short in this run)
| # | what was needed | what was missing | what was done instead |
|---|---|---|---|
| 1 | a committed schema for agent cards and eval cases, so cards and cases are checkable | no agent-card or eval-case schema is committed; cards and cases are free-form markdown that follow the first file's shape | kept the shape by hand; consistency checked with grep (one `failure_class:` line per case, one card per tuple) |
| 2 | a way for `prepare` to run its verification on hosted CI when the shared host is overloaded | `prepare` has no hosted-CI route; on a host at load about 16 to 20 on 18 cores, the dependency lane waited on a CI log with long blocking sleeps (CS-012) | the worker slept on the CI log; the coordinator could not reach it until each sleep ended |
| 3 | `audit public-safety` findings split into "ignored and local only" versus "exposed in the tree or history" | the audit reports both classes together, so a clean public tree and a leaking one can look alike until each finding is read | findings triaged by hand |
| 4 | a denylist check that does not publish what it protects | the committed denylist file lists the identifiers it guards, so committing it publishes them | the public-package check was run with the committed list (see scrub results); the ledger's own scrub used a separate pattern list passed on the command line and not committed |
| 5 | an anonymiser in this ledger's `tools/refresh-derived.sh` that fails closed | it strips only single-letter team prefixes; multi-letter pair prefixes and a working-directory path used as a pane title passed through raw, and nothing checks the output against an allowlist of anonymised names | extended the private seat map in a temporary copy outside the repository, re-ran, and scanned the derived tables for every source name before committing; the private map itself still needs the new rules appended (see the operator report) |
| 6 | a limit detector that separates limits, transport errors and task text | `tools/derive-meter.sh` flagged 37 candidate samples, all task text (two seats were building a banner parser), and has no class for the one real transport error (CS-007) | every candidate inspected by hand; results in `data/limits.tsv` |
| 7 | a switch marker that works when a seat's footer was empty before a model change | `tools/derive-intervals.sh` marks a switch only when both samples carry counters; three verifier seats changed model unmarked (no work was mis-attributed) | noted in `data/seat-tuples.tsv` and CS-009 |
| 8 | an extractor for task events in a time window from the operator log | none; 138 log lines read by hand into `data/tasks.tsv` | manual extraction; durations bounded where only coordinator lines exist |
| + | (positive) a guard against duplicate heavy suites | the repository-wide verification lease correctly refused a duplicate full suite during CS-012 | n/a: it worked |

## Seams and cautions
- Your campaign observation intake (`docs/campaign-observation-intake.md`) wants per-observation model ids, source digests and private custody. This ledger still does not use it: its rows lack source hashes. The owner chose a machine-local SQLite store for eval data; mapping these TSVs into it is the next design step.
- Adding files under `field-evals/` changes the tree against `MANIFEST.sha256`; I did not regenerate the manifest.
- Public repo: scan before any push; scrub results are in the commit message.
