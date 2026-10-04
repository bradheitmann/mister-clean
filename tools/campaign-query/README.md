# Campaign query

Read-only `rusqlite` access to Mister Clean's existing global SQLite store.
It does not ingest evidence, create evaluation rows, or grant quality credit.
The Bun control plane remains the sole writer and evidence admission boundary.

```sh
cargo run --manifest-path tools/campaign-query/Cargo.toml -- \
  /absolute/private/path/global.sqlite
```

`observed_cli_invocations` counts imported journal receipts. `trials` counts
admitted trial records. `credited_trials` counts only trials whose evidence
admission set `contributes_quality_credit = 1`; unknown agent identity remains
excluded. The database path is passed at run time and never stored in Git.
