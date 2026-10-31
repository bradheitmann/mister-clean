# Note for the Mister Clean PM

status: FINAL (meter 2026-10-31T02:37:33Z to 14:33:26Z, the sampler's 12-hour window, closed; event log read through 14:40:25Z). No further refresh is planned for this window.

## What this is
A field ledger of one multi-agent session on a Rust spec-compiler project that grew from one repository to eight during the window. It holds agent cards, failure case studies in the owner-note format (`OWNER-NOTE-2026-10-29`, section 2), derived meter tables, and a providers note for the model-facts registry. It is roadmap input for the evals-from-failures work, not a score.

## How it was gathered
- Read-only reads of the source team's sampler file (5-minute pane samples of title, footer counters and limit-scan text), its event log (acks, deliveries, verdicts, coordinator lines) and its seat contracts.
- One read-only look at a lost lane's worktree state, for CS-020.
- No pane was typed into.
- Identities are pane titles and footers, never runtime receipts (CS-009). Verdicts are log verdicts, not validated receipts (CS-015).
- Seat names are anonymised with a private map kept outside the repository. Orchestrator subagent lanes that appear only in the log are `SUB-*` and carry no card.

## Sample sizes (final)
- 6,783 sampler samples, 50 seat titles, about 11 h 56 min.
- 44 task rows: 34 worker deliveries or lost lanes; 2 advisory answers; 8 verifier-only rows (coordinator-authored, earlier or salvage work).
- 15 cards (1 new: AC-015, a label with no work). 21 case files (3 new: CS-019 to CS-021; appended sections on CS-006, CS-011, CS-016, CS-017).
- Provider rate-limit or quota events: 0. Transport errors: 2 (one recovered on a paid route, one terminal on a free route).

## What the window shows
1. No route hit a provider limit in 12 hours: free (OpenRouter, NVIDIA hosted) or paid (DeepSeek, OpenRouter MiMo). Every allowance figure is a lower bound. Free inference never ran out; the lower bound is 13 completed free-route task events.
2. The free routes carried little work after the team grew; paid DeepSeek flash workers and MiMo flash verifiers did nearly all of it. So "are free models viable workhorses" is still open. The free-route first pass is 1 of 5, and every reject carries the CS-001 numbering gate.
3. After the field adopted CS-001 treatment B (the contract states the exact numbering form), free-route reworks went 2 of 2 and paid first passes went 9 of 13 accepted. This is uncontrolled, but it is the strongest signal in the window.
4. The one lane lost was not a limit. A free-route transport error ended it, and the lane sat unnoticed for 8.5 hours with a damaged worktree index (CS-020).
5. Record integrity is the other recurring theme: a fabricated read time (CS-014), case-sensitive receipt verdicts (CS-015), and a verdict stamped in local time labelled UTC (CS-019). Four agents deleted their own scratch despite the rule (CS-017).
6. Your own tool appears in the window. Mister Clean's CLOSE native gate gave false NOT CLEAN results on Rust repositories (gap 12 below), and the pair lane in this repository fixed it (T-35, accepted).

## Replay first
1. CS-001 treatments A/B/C, with the governance tool version pinned.
2. CS-020 treatment C (flat counters plus no DONE forces a pane read and a stall line), then the transport-drop fixture.
3. CS-012 treatment C (non-blocking wait primitive) and CS-021 treatment C (a lease that refuses a forbidden heavy suite).
4. CS-014 treatment B (schema allows "unknown") and CS-019 treatment C (the log tool stamps the time).
5. CS-009, CS-007, CS-015 fixtures before any provider table or verdict tally is trusted.
6. CS-017 treatment B (a sanctioned scratch area).

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
| 9 | (from the refresh-2 addendum) a single map of shipped surfaces | the package file list is checked, but generator input roots (for example `evals/` feeding the generated materials file) are not, so documentation changes can alter release bytes unnoticed (CS-018) | found by review after the fact |
| 10 | (from the refresh-2 addendum) a local baseline for the generated-materials check | the local generated-materials `--check` fails on a clean main while hosted CI passes, so it cannot serve as a local baseline | hosted CI used as the baseline |
| 11 | (from the refresh-2 addendum) local full suites on a host with a global pre-commit hook | local full suites cannot pass on a host whose global pre-commit hook refuses the tests' own fixture commits (CS-016); hosted CI is the only full-suite verdict there until the owner decides on a test-capsule exemption | final: the two later deliveries recorded hook-blocked proofs as blocked and relied on hosted CI on the exact commit (T-14, T-35) |
| 12 | a CLOSE native gate that runs the repository's real test command | version 7.0.2 spawned the toolchain through its resolved real path, so a multi-call proxy ran under the wrong name and tests never ran: a false native_gate_failed / NOT CLEAN in every Rust repository using toolchain proxies; the orchestrator told all Rust-repository PMs to record it as a coordination item and run tests themselves | fix delivered and accepted in the window (T-35); landing not seen in the log by 14:40Z |
| 13 | a spawn path with no check-to-exec gap | the T-35 verifier reported (report-only) that the re-check before exec spans supervisor startup, so a symlink retargeted inside that window runs a new target against evidence digested from the old one; closing it needs fd-based exec, which the runtime's spawn cannot express. A relative PATH entry would also give a relative invoked path that the validator rejects (theoretical) | recorded as a finding; no change in the window |
| 14 | closeout that notices a damaged worktree index | nothing compares a lane worktree's index with its HEAD tree at close; the lost lane's index held 121 of about 14,500 paths, so a successor's `git add -A` would stage deleting the tree (CS-020) | found by this ledger's read-only check, after the window |
| 15 | a stall signal that combines "task assigned", "counters flat" and "no DONE" | neither this ledger's derive scripts nor the source team's tools join the three; `banner_candidate` was 0 for the seat that showed a terminal transport error for 8.5 h, because the text has no rate-limit phrase (extends gap 6) | found by hand while classifying banner text |
| 16 | timestamps that cannot drift from UTC | log lines carry hand-written stamps; one verdict used local time with a "Z" (CS-019), and only the meter's independent clock exposed it | corrected by hand in `data/tasks.tsv` |
| 17 | derived tables in a stable order | `tools/refresh-derived.sh` sorts rows before anonymising, so the summary's row order follows the private seat names, not the published ones | left as is; row order carries no meaning |

Gap 5 status (final): the private seat map now has a rule for every seat title in the final meter, and the final derived tables passed the scrub. The anonymiser itself still does not fail closed.

## Seams and cautions
- Your campaign observation intake (`docs/campaign-observation-intake.md`) wants per-observation model ids, source digests and private custody. This ledger still does not use it: its rows lack source hashes. The owner chose a machine-local SQLite store for eval data; mapping these TSVs into it is the next design step.
- Adding files under `field-evals/` changes the tree against `MANIFEST.sha256`. I did not regenerate the manifest.
- Public repo: scan before any push. Scrub results are in the commit message.
- The raw sampler and event log are not committed and will not be, because pane scrollback carries project text. Anyone re-deriving needs the private files and the private seat map.
