---
artifact_type: reference
classification_rationale: Specification for customer-test batteries, a holdout bank and a battery runner; planned, not implemented. Not a lifecycle-bearing planning artifact.
title: Customer-test batteries — manifest, holdout bank and runner
date: 2026-11-01
---

# Customer-test batteries — manifest, holdout bank and runner

Planned, not implemented. A team of repositories scores each repository by the tests its *customers* keep against it. This document defines the parts Mister Clean owns: the manifest each customer test carries, a bank of sealed tests the repositories do not see, and a runner that executes a battery and reports the measured cells of a scoreboard row. The scoring rules themselves belong to the team's protocol; this specifies only the mechanism.

## 1. Customer-test manifest: `customer-test/1`

One JSON file per test, in the **consumer** repository, at `customer-tests/<focus-repo>/<test-id>.json`.

```json
{
  "schema": "customer-test/1",
  "id": "<consumer>.<focus>.<n>",
  "focus": "<focus repository>",
  "owner": "<maintainer seat>",
  "created": "<YYYY-MM-DD>",
  "artifact": {
    "name": "<published export, schema or fixture>",
    "version": "<version>",
    "sha256": "<hex>",
    "fetch": "<path or URL in the publisher's release>"
  },
  "run": {
    "argv": ["<executable>", "<arg>", "..."],
    "cwd": "<repository-relative>",
    "timeout_s": 120,
    "env": { "<VARIABLE>": "{artifact}" }
  },
  "mutant": { "kind": "artifact_patch", "ref": "<repository-relative patch>", "expect": "fail" },
  "expect": "pass",
  "writes": "none"
}
```

Rules:
- The test consumes the focus repository's **published, pinned artifact** (name, version, sha256), never a live dependency on a sibling checkout. The runner places the artifact at a path and substitutes it for `{artifact}`. The placeholder `{sha256}` expands to the pin's sha256 on the pinned run and is dropped (the argument removed) on the current-main run, so a test may assert the pin without failing the current-main run on the hash alone. A test may also vendor the pinned bytes (`fixture`) when its publisher has cleared redistribution. `mutant` may be one object or a list.
- `run.argv` is executed without a shell. `writes` is `none`: the test may use temporary directories only.
- `mutant` describes a deliberate change (to the pinned artifact copy or to a fixture) that must turn the test red. A test whose mutant has never been observed red does not count.
- A consumer with no genuine need writes no test; a test is never invented to fill a quota.

## 2. Holdout bank

Sealed tests live outside every repository, at `$AGENT_PRIVATE_ROOT/<team>/holdout-bank/<focus>/<id>/` (`<team>` is the configured name of the team of repositories) (the manifest plus its files). Only the inspector seat and the runner read it. The runner reports a sealed test by id and result, never its contents. When a sealed test is revealed, it moves to `revealed/<date>/` and is no longer drawn.

## 3. Runner

A `battery run` subcommand of the Mister Clean CLI (strict TypeScript):

```
mister-clean battery run --focus <repo> --repos <registry file> --bank <dir> --out <jsonl> [--seed <n>]
```

For each consumer repository listed in the registry, the runner collects `customer-tests/<focus>/*.json` at that repository's main, and draws about 20 percent of the battery from the bank with a recorded seed. Each test runs twice:
- (a) against the pinned artifact;
- (b) against the artifact as published from the focus repository's current main.

A test passes only if both pass. Each test's mutant runs once and must fail.

Output, one JSON line per test: `id`, `sealed`, `pass_pinned`, `pass_current`, `mutant_red`, `duration_ms`, `exit` codes. A summary line gives the three scoreboard cells the runner owns: `battery`, `sealed`, `pass_pct`. Everything else in the row (defect dispositions, the floor, the anchor, saturation) is the inspector's.

Resource use: a battery run is heavy. It takes a host-wide slot (at most two concurrent runs); a busy slot yields a typed `resource_contention` result, not a failure.

Refusals: a manifest that fails `customer-test/1` validation; an artifact whose sha256 does not match; a test that writes outside its temporary directory; a mutant that cannot be applied.

## 4. Slice

After the release candidate lane: the manifest validator, the runner, the bank draw and retirement, and fixtures with fail-without mutants for each refusal. Proof: a two-repository fixture battery with one sealed test produces the expected per-test lines and scoreboard cells, and a mutated artifact turns its test red. Until the runner exists, the inspector scores by hand from the same manifests.
