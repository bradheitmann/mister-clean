# Eval Lab inventory

Status: milestone 1 of the owner's brief of 2026-11-11, "automatic coding-session evidence and Eval Lab". It records what exists at commit f14ecce and what does not. It builds nothing and changes no plan.

How to read it. Each row has one status:

- `implemented`: the behaviour is in source and a test exercises it.
- `partial`: some of it is in source; the note names what is absent.
- `missing`: nothing implements it; the citation is the place it would have to be, or the plan line that asks for it.

Every row is backed by lines in [EVAL-LAB-INVENTORY.citations.tsv](EVAL-LAB-INVENTORY.citations.tsv): row id, file, line number, and a text that is on that line. Facts about the installed package and the local store were observed on the owner's machine and are kept in a private addendum, with the command behind each; they are stated here without paths or counts.

The short answer: the admission core exists and is tested. Nothing feeds it. No harness is captured automatically, no outbox exists, the installed package has no command or tool for evaluation records, and none of the six requested views exists as a page.

## The inventory

| Id | Capability | Status | What exists, and what is absent |
|---|---|---|---|
| C1 | Enroll once: a repository bound to its Git identity and a private alias; worktrees linked; adapters, sources, privacy policy and coverage recorded | partial | One repository id for a checkout and its linked worktrees, tested. An operator can bind checkouts to a logical project through a receipt listed at start-up. Absent: an enrollment record of adapters, evidence sources, privacy policy, collector version or coverage. The id is derived from the absolute path of the Git common directory, so moving the repository changes it, and that path is stored as plain text. |
| C2 | Capture at the harness and task boundary: start, model or reasoning switch, checkpoint, test, review, completion, cancellation and merge events with stable ids and sequence numbers | partial | The intake records two boundaries: a run start and one outcome per run. A separate Rust observer derives token, tool, human-message, review-verdict and merge events from session logs after the fact. Absent: model-switch, checkpoint, test and cancellation events; an assignment or attempt id apart from the run; sequence numbers. |
| C3 | Local durable outbox: immutable private events, asynchronous flush, acknowledged ids, bounded retry, visible pending and rejected states | partial | The observer keeps immutable, content-addressed batches with owner-only permissions and an importer that counts a replay as a replay, tested. Invocations not yet linked to an evaluation can be listed. Absent: an outbox for harness events; asynchronous flush; per-id acknowledgement; bounded retry; a rejected or unknown state anyone can see. |
| C4 | Verify, do not trust self-report: requested and observed identity apart; segments closed at switches; evidence bound to exact source; late results appended; no credit for duplicates; conflicting replays refused | partial | Requested and observed model, harness and reasoning are stored apart; a mismatch earns no credit; credit needs the evaluated source object and retained evaluator evidence; a reused receipt and a conflicting replay are refused; all tested. Absent: attribution segments (a switch invalidates the whole lease); appending a late review result (a second outcome for a run is refused). |
| C5 | Recover safely: restarts and interruptions keep evidence; identity receipts and durable replay | partial | Rows already written survive a restart, and the observer reloads its batches under a lock. Identity receipts live only in process memory, capped at 1,024. After a restart the earlier binding is gone, the run is recorded as identity-unbound, and its outcome earns no credit. That is the safe direction, and no test exercises the restart path. |
| C6 | Quality apart from route performance; costs with their basis and date; unknown stays unknown | partial | The agent tuple is model, harness and reasoning; route telemetry is a separate type; unknown values stay null or are marked unavailable. Absent: anything that writes the availability and price tables; a measured, list or implied basis for a cost; provider limits, transport and queue time. |
| C7 | Private by default; public export only through a separate redacting path | partial | The local service binds to loopback with a bearer token, its socket is owner-only, journal paths are stored as hashes, and the pending list exposes hashes only, tested. Absent: any redacting export. The store also holds retained evidence bytes and absolute checkout paths with nothing that separates them from an export. |
| V1 | Repository coverage page | missing | A snapshot covers exactly one repository and fails when the scope is ambiguous. Nothing models or shows enrollment, collection state, last event, backlog or missing identity per repository. |
| V2 | Assignment timeline | missing | The nearest view is a timeline of Mister Clean's own runs. No view shows one assignment's starting version, agent segments, changes, tests, reviews, correction cycles and outcome. |
| V3 | Case inbox | missing | The only case concept in source is one fixed evaluator case id per capability. Nothing proposes, edits or reviews a case, and the specification defines case revisions but no inbox. |
| V4 | Controlled-eval workbench | missing | Specified, not built. The runtime reports that it cannot dispatch or execute work, and a test checks that it says so. |
| V5 | Comparison page | partial | Two views compare agent tuples with a capability filter, verified-trial counts and cost per success, tested; a static scorecard page shows placeholder data only. Absent: role and task-class filters; first-pass acceptance, defects, false positives, rework and time; observational and controlled badges; drill-down to evidence. |
| V6 | Truthful empty and error states, accessible controls, restart-persistent results, deep links | partial | Empty, error and demonstration states are tested for all seven existing views, with a minimum control size and focus handling. Absent: deep links (the view is never read from the address); a test that results survive a restart; any view of unsupported harnesses. |
| S1 | FIELD-EVALS-PLAN.md | missing | It calls itself planned, not implemented. Its `field-evals/1` format, validator and `field` command do not exist. Field windows so far are hand-made files. |
| S2 | EVAL-STANDARDIZATION-PLAN.md (EV-01 to EV-06) | partial | It calls itself not dispatched or implemented, which is now stale. EV-03 and EV-04 exist in part (a machine-local store with migrations; register, start and outcome commands, tested end to end) and EV-05 in part (a snapshot producer and an interface). EV-02 (versioned categories and rubrics) and EV-06 (independent acceptance and consumer documents) do not. This document is the inventory EV-01 asks for, in part. |
| S3 | AGENT-EVAL-LAB.md | missing | Its implementation is not dispatched. None of its records (case, suite and key revisions, experiment, attempt, grade) and none of its screens exist. What it builds on does: qualification derivation, agent identity, the store and the recorder. |
| S4 | evaluation-intake.ts | implemented | It admits a registration only from a receipt listed at start-up, a run start with profile, lease, invocation ids and retained evidence, and an outcome only through a configured evaluator. It refuses evaluator results supplied by the caller. |
| S5 | evaluation-recorder.ts | implemented | A start and its evidence are written in one transaction; exactly one outcome per run; credit only when identity is bound before dispatch and before evaluation; a failed task stays in the denominator. |
| S6 | The identity-receipt contracts | implemented | A receipt binds phase, run, lease, requested tuple, route, observation and invocation ids. It is issued from a start-up list or from the start-up collector and checked against the full binding. Its token lives only in process memory. |
| P1 | Installed package: command-line surface for evaluation records | missing | The installed release has eleven commands, all for hygiene; none submits or reads an evaluation record. Every invocation is journalled and receipted, which is evidence about hygiene runs. A client for the run-start command exists in source; the shipped command line does not use it and the package does not export it. |
| P2 | Installed package: MCP surface for evaluation records | missing | The installed server registers an attestation tool, two materials tools and two prompts. None concerns evaluation records. |
| P3 | The configured store | partial | The store schema, the local service and its register, start and outcome commands exist. On the owner's machine the hygiene journal and run receipts are populated; no evaluation adapter is installed, no control plane is running, no repository database is configured, and no evaluation record is stored. |
| H1 | Capture adapter: Claude Code | missing | No hook, plugin or session reader. Identity reaches a receipt only through an agent-card file that someone supplies; it is never observed. |
| H2 | Capture adapter: Codex | partial | The Rust observer reads session logs of this shape after the fact and imports token, tool and merge observations with no quality credit, tested. Absent: assignment, outcome, identity receipts and trials. It polls; it is not a hook. |
| H3 | Capture adapter: OpenCode | missing | Nothing. The generic observation-adapter interface has no reader for it. |
| H4 | Capture adapter: Droid | missing | Nothing. |
| H5 | Capture adapter: Pi | missing | Nothing. |
| H6 | Capture adapter: Grok | missing | Nothing; the name does not occur in the source. |
| Z1 | Existing work to reuse: Slice Zero's offline scorer and its three record formats | implemented | Proven on 2026-11-17. It scores saved answers and binds each to a harness log by hash. It lives outside the package, so nothing in the package can reuse it yet. |

## Where documents and source disagree

- README.md says the command line and the MCP server provide the same validators. The MCP server registers no validator.
- README.md says the command-line lifecycle accepts an installed local evaluation adapter. A consumer cannot install one: the shipped entry point passes none, and the lifecycle client is not exported.
- EVAL-STANDARDIZATION-PLAN.md says nothing is implemented. The intake commands, the store tables and the observation import exist with tests.
- FIELD-EVALS-PLAN.md expects Slice Zero to deliver an eval-case validator and an agent-card check for it to reuse. Slice Zero became the offline scorer, outside the package.
- Two comments in the store and the recorder say logical-project aliasing is not implemented. It is, and aliases already count toward qualification.
- A test of the interface's data source carries a view name in the address fragment. The interface never reads a view from the address.

## Answers to the brief

### Implemented, partial and missing

Implemented: the admission core (S4, S5, S6) and the offline scorer (Z1). Partial: all seven contract points (C1 to C7), the comparison view and the truthful-state rules (V5, V6), the standardization plan (S2), the store (P3) and the Codex observer (H2). Missing: four of six views (V1 to V4), the field-evals format (S1), the Eval Lab records and screens (S3), any command-line or MCP path for evaluation records (P1, P2), and capture for five of six harnesses (H1, H3 to H6).

### First bounded slice, author and verifier

The first slice after this one is the assignment event contract and the outbox, with no intake change: a versioned record for enrollment and for assignment events (start, model or reasoning switch, checkpoint, test, review, completion, cancellation, merge) with assignment, attempt and sequence ids; an append-only private outbox with states pending, accepted, rejected and unknown; and a validator that refuses a gap, a duplicate with different content, and an event before its start. Its proof is a set of saved event files, good and bad, scored the way Slice Zero scores answers. The second slice is one capture adapter that writes to that outbox, for the harness of the first pilot assignment. Author: one implementing seat. Verifier: a seat of another model maker, as the charter's budget requires. The project PM owns the proof lists and the landing.

### Consumer API and CLI to use

Today the only way to submit an evaluation record is the local service's protocol: `evaluation.project.register`, `evaluation.run.start` and `evaluation.run.outcome`, sent to its loopback HTTP endpoint with a bearer token or to its owner-only socket, with the service running under Bun and both databases configured. `evaluation.invocations.pending.list` and the snapshot read back. There is no command-line or MCP path, and an agent card on a receipt is a declared identity, not an observed one. The outbox's flusher will be the first consumer of the three commands; an `enroll` command and a read command belong to that work, not to this slice.

### Identity and restart handling

Identity receipts are held in process memory. A run whose start and outcome arrive in one life of the service can earn credit; after a restart the earlier binding is gone and the outcome is kept as an observation without credit. That must stay: replay never earns credit by weakening admission. Two things are owed before the outbox replays anything: a test of the restart path, which does not exist, and a decision recorded with the owner on whether receipts become durable or a replayed run stays an observation.

### Interface acceptance

The existing interface has seven views of one repository and reads real data from the store when it is configured. The first usable delivery is accepted when a repository coverage page and an assignment timeline show the pilot's actual records; a view can be opened by its address; a test shows results surviving a restart of the service and the browser; and a harness with no adapter appears as missing coverage. The comparison view stays behind sample-size floors until controlled results exist, and nothing is accepted from a screenshot of fixture data.

### Second-repository pilot and scheduling

The brief names the first pilot: one complete assignment in the delivery-pipeline repository, at a task boundary its lead chooses. The second is an assignment in this repository under a different harness: every slice here already has an independent review run on another harness with a session log that names its model. Nothing parked is resumed to collect data. Scheduling: one heavy lane at a time under stop rule S4, and the shared machine's queue decides when the container self-judge that every source change needs can run. The master-gate refactors (S2d to S2f) and these slices take turns in that lane; neither replaces the other.
