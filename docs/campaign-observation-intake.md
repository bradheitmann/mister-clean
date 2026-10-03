# Campaign execution observation intake

This is retrospective operational telemetry. It does not create evaluation runs,
trials, identity assurance, sampling ordinals, or qualification credit.

Place `campaign-observations.jsonl` with mode `0600` in an owned `0700`
`campaign-*` state leaf. Each line is one UTF-8 JSON object with exactly these
fields:

`schema_version`, `observation_id`, `campaign_id`, `project`, `slice`,
`activity`, `event_kind`, `tool_name`, `timestamp`, `session_id`, `model_id`,
`reasoning`, `requested_model_id`, `requested_reasoning`,
`candidate_revision`, `integrated_revision`, `metrics`, and `source`.

Set `schema_version` to `"1.0"`. All nullable fields must be present as strings
or `null`; `metrics` is a flat object of snake_case keys and nonnegative safe
integers. Do not put raw tool arguments, output, secrets, or reasoning text in
the observation. `source` has exactly `path` (absolute), `line` (1-based or
`null`), and `record_sha256` (lowercase hex). The original source file must be
an owned regular file without group or other write permission; existing `0644`
Codex logs are accepted and `0664` is rejected. The importer reads them in
place without changing permissions or copying raw bytes into campaign state.
For a line number, hash the original line bytes excluding the newline; for
`null`, hash the complete retained receipt file bytes. The campaign journal,
database, and retained forge receipts still require private `0600` custody.

Compute `observation_id` as `"obs:"` followed by SHA-256 of canonical JSON of
the full observation with only `observation_id` omitted. Canonical JSON sorts
object keys recursively and uses compact UTF-8 encoding. The importer checks
that ID and reads each retained source file once in bounded 64 KiB chunks to
verify the source digest.
It rejects an incomplete journal line, a changed source, or a conflicting
replay before committing any row in the batch.

Run `bun scripts/reconcile_campaign_invocations.ts /absolute/path/to/campaign-<id>`.
The reconciler returns its existing pending-invocation result plus
`campaign_observations: { imported, replayed }`. Identical records replay
without mutation. New records go only to the global store's append-only
`campaign_execution_observations` table. Read that table for aggregates; it has
no path into the strict trial or qualification tables.
