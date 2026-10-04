# Campaign observer — operational evidence, not qualification

The Rust observer streams an operator-selected Codex root session and its
descendants from an explicit campaign cutoff. It exports sanitized append-only
observations to private storage. The existing Bun/SQLite admission path verifies
original source-byte digests and transactionally imports them. Rust uses
`rusqlite` only in read-only mode, not as a second accepted-store writer.

```sh
pnpm install --frozen-lockfile --ignore-scripts
cargo test --manifest-path tools/campaign-observer/Cargo.toml
cargo clippy --manifest-path tools/campaign-observer/Cargo.toml --all-targets -- -D warnings
cargo run --manifest-path tools/campaign-observer/Cargo.toml -- checkpoint /absolute/private/observer-config.json
cargo run --manifest-path tools/campaign-observer/Cargo.toml -- watch /absolute/private/observer-config.json
```

Tests require the repository's Bun runtime and installed dependencies: the
checkpoint regression exercises this checkout's real authoritative intake,
including an empty pre-dispatch store, first import, and idempotent replay.
The observer and intake schema ship together; no separate untracked importer
is required. Empty stores report zero observed counts and an unavailable cache
percentage, not a fabricated cache rate or evaluation credit.

Campaign identity is mandatory at capture, intake and query. Existing receipts
from another campaign are rejected before journal export. Every observation
summary filters its aggregates by the supplied campaign ID, including tools,
payload measurements and merges. Use `summary GLOBAL.sqlite CAMPAIGN_ID`.
The separate campaign-query utility reports a labeled global-store census of
invocations and trials, whose tables have no campaign key; those are never
campaign-attributed counts.

The complete journal may grow beyond 16 MiB without raising the intake cap:
the observer submits private, immutable SHA-256-named batches of at most 8 MiB
through the authoritative importer. Batches are individually atomic, not an
all-or-nothing checkpoint. A rejection stops collection; earlier admitted
batches remain and are idempotently replayed on recovery. Retained batches
consume additional disk space; their hashes bind the exact admitted bytes.

Source-line hashes exclude LF only: CR bytes in CRLF files remain part of the
original-byte evidence. Offset timestamps are normalized to UTC for admission,
without changing already-canonical Z timestamps or rewriting source bytes.
UTC fractional seconds retain their original precision (one through nine digits).
Campaign cutoff and session-creation eligibility compare full instants; only
latency metrics are expressed in milliseconds, never admission boundaries.
On importer rejection the journal survives and a bounded diagnostic receipt is
retained privately under `source-receipts/import-failure-*.json`; the console
prints its path, not importer stderr. These diagnostics may contain private paths
and must never be published.

Private config binds `campaign_id`, `root_session_id`, UTC `cutoff`,
`session_dir`, `state_dir` (owned 0700 `campaign-*` leaf), `intake_worktree`,
`requested_assignments`, and `forge_prs` (repo, number, project, slice).
Do not commit operator paths, transcripts, config, or databases. Watch is finite
(default 60 checkpoints, ceiling 240), checking `observer.stop` between
checkpoints and every second while waiting. Import failure stops the watch;
the complete journal and immutable receipts survive for replay. No inference
service is started.

Forge reads are independent from local observation capture. A failed command,
invalid JSON or malformed PR snapshot produces a `forge_collection_failure`
observation and a private receipt containing exit status, byte counts and output
hashes, never provider output text. The collection result explicitly says
`forge_status: degraded` and lists failed sources; other PRs and local session
observations continue through authoritative admission. This is partial forge
coverage, not a successful fresh observation of the unavailable PR. Subsequent
checkpoints retry it on the normal finite-watch cadence; there is no tight retry
loop. Source-integrity errors, receipt-write errors and importer rejection remain
hard failures, with original evidence preserved.

An absent merge-state field is not evidence that a PR is unmerged: `mergedAt`
must be explicitly present (null or a valid timestamp). File addition/deletion
counts must be nonnegative integers with safe totals, and consumed comment
bodies must be strings and comment IDs must be nonempty bounded strings for
replay deduplication. Incomplete or malformed snapshots are degraded forge
coverage, never silently complete snapshots or fabricated zero-count metrics.

## Measurement definitions, version 1

| Metric | Definition and provenance | Interpretation |
| --- | --- | --- |
| Input/output tokens | Positive differences between runtime cumulative counters after cutoff and session creation | Observed counters, resets flagged, not billing |
| Cache percentage | 100 × cached input / input tokens | Derived; cached input is a subset, never added to input |
| Reasoning output | Runtime reasoning-output counter deltas | Subset of output, never added to output |
| Model / reasoning | Most recent session `turn_context` | Observed separately from requested assignment; unknown is null |
| Activity | Actor-path role classification | Role proxy, not an exact per-step task breakdown |
| Tool calls | Logged outer function/custom-tool envelopes | Nested invocations are not enumerated |
| Tool latency | Matched envelope result timestamp − call timestamp | Milliseconds including waits, not TTFT |
| Result size | UTF-8 byte length for textual logged results | Other result encodings are not measured |
| Payload measurement supplement | UTF-8 text bytes across string or text-block array results; only explicit machine-readable exit statuses counted | Separate observation type, never another invocation |
| PR lead time | Merge time − PR creation time | Excludes pre-PR work, not full slice lead time |
| Accepted additions/deletions | Merged PR file-diff totals | Includes tests/config/docs, not useful-code score |
| Human messages | Root user-message records after cutoff | Message count, not inferred human effort |
| Collector overhead | Wall milliseconds for collect + import + query | Retained per immutable checkpoint |

Token evidence binds original file/line/hash. Merge identity binds its receipt;
diff totals and creation time derive from the retained PR snapshot sharing slice
and candidate revision. Forge collection retains allowlisted metadata and
original-body hashes, not free-form comment bodies. Historical receipts created
before that privacy repair remain historical evidence, not new collection.
Session messages, tool arguments/results, and reasoning text are never copied
into the journal. There is no trial, qualification, or cleanliness promotion.

Missing pricing, actual billing, TTFT, exact skill/MCP overhead, per-task agent
hours, and unseen controlled comparisons remain unavailable—not zero. Natural
campaign outcomes cannot establish a model winner. Controlled trials and blind
invocations follow the installed skill's existing contracts.

## Recursive improvement loop

1. Checkpoint before dispatch; bind assignment, candidate, and criteria.
2. Deliver a real remediation slice with independent acceptance.
3. Checkpoint; inspect quality failures, overhead, and replay gaps.
4. Register one hypothesis: pinned control, one changed factor, primary metric,
   threshold, sample target, caps, stop rules, and rollback.
5. Confirm on fresh productive work with fixed measurement definitions.
6. Independently accept the implementation; promote only supported improvements
   and monitor subsequent work for regressions.

Version 1.1 corrects the initial incomplete text-size measurement with additive
`tool_payload_measurement` records. Initial `result_bytes` totals are labeled
legacy/incomplete, never used as complete output-size data. Guard-comment activity
is normalized to guard in summaries; original historical records stay unchanged.
Cutoff is required valid UTC and timestamps are compared as instants. A kernel
file lock serializes collection and releases on process exit, not stale PID lore.

For a pre-redaction installation, rotate to a fresh private campaign state and
rebuild through the same authoritative intake from original session sources and
allowlisted forge metadata. Retire the old state explicitly as private historical
evidence, never live reporting data. This preserves evidence; it does not erase
historical raw comments or prove they never contained sensitive material. Do not
combine both datasets or count rebuilt rows as additional samples.

Retrospective backfill is not a preregistered baseline. Unimported evidence gates
new campaign dispatch, not unrelated owner work. No fleet mutation is authorized.
