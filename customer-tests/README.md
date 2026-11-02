# Customer tests

Tests this repository keeps against artifacts other repositories publish, in the `customer-test/1` format (`project/planning/BATTERY-RUNNER-PLAN.md`). Each test consumes a pinned, published artifact by version and sha256, never a live dependency on another repository, and carries fail-without mutants.

| Test | Focus | What this repository needs | Artifact |
|---|---|---|---|
| `model-atlas/registry-join` | the model-facts registry | Field-evaluation records cite registry records as `<id>@<export_version>` and agent cards bind a reasoning level: the export must keep its schema, give ref-safe unique record ids, and state each card's reasoning levels as a fact (a value or an explicit unknown). | `model-atlas.export/1` 2026.11.02-3 |

Run one: `bun customer-tests/model-atlas/registry-join.ts customer-tests/model-atlas/fixtures/model-atlas.export-2026.11.02-3.json <sha256>`.

The vendored export is redistributed here with its publisher's clearance (2026-11-01): its private-source entries are generic, hashed stubs by design.

Pin history: 2026.11.01-2 (2026-11-01) → 2026.11.02-3 (2026-11-02, the export marked `current` in the publisher's PINS.tsv). The publisher cleared vendoring any version in its PINS.tsv byte for byte. The old fixture stays in `fixtures/` as history; only the manifest's pin is tested.
