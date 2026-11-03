---
artifact_type: maintenance
maint_id: MC-CURRENT-7.3
title: Mister Clean 7.3 current state
status: active
timezone: UTC
owner: repository maintainer; operated by the project PM
contract: references/control-plane-product-spec.md
current_projection_source: machine
current_projection_command: mister-clean inspect repository-object . --json
current_release: 7.3.0
current_release_commit: fca67edf224a6877f3d181307392ea1f36336016
current_step: self-clean loop cycle 1 (the installed 7.3.0 judges this repository; findings are remediated on lanes and re-judged by second-pass)
next_step: the field study of the skill across the owner's repositories, using run receipts and second-pass
closing_gate: exact-object hosted CI, second-family QA on the exact tip, annotated tag, verified release archive
---

# Mister Clean 7.3 current state

**Released: 7.3.0** (tag `v7.3.0`, commit `fca67edf`; CI tag run 41592441023; verified archive
`bradheitmann-mister-clean-7.3.0.tgz` and its receipt on the GitHub release). 7.2.0 (`e1f0090`,
tag `v7.2.0`) preceded it the same day; v7.1.0 remains a Git source release without a CI archive.
No npm publication is asserted by this file; the receipt's `publish.status` is `not_executed`.

What 7.3.0 adds over 7.2.0: run receipts (`mister-clean.run-receipt/1`, written under the
state root, repository-relative paths and digests only) and `mister-clean second-pass`, which
classifies an earlier run's findings from Git. What 7.2.0 added over 7.0.2: the bounded Git
listing in `prepare` on large repositories, the repository planning config
(`.mister-clean/planning.json`), nested-checkout exclusion, subdirectory stack markers, and the
dependency-advisory clearances. The full list is in each release's notes and in
`charter/STATE.md`.

## How a successor verifies this projection

- `node bin/mister-clean.js attest <installed-root> --json --strict` on an installed release
  reports `claimed_source.git_commit` and `git_tag`; compare with the values above.
- `charter/STATE.md` carries the proven / not-proven ledger, the exact last-green and last-red
  commands, and the next three bounded items; its first lines name the HEAD it was written at.
- `git tag --points-at <commit>` and the CI tag run bind the release to the object.

## Standing obligations (detail and owners in `charter/STATE.md`)

Toolchain pin for reproducible packaged bytes (bun 1.4.0 today; O-TOOLCHAIN-1), one snapshot per
run for native gates on large workspaces (O-GATE-SNAPSHOT-1), temp cleanup in product and tests
(O-TMP-1), the external semantic-attestation route for `runtime_attested` candidates, the data
product and starter eval set (O-DATA-1, owner decision 2026-11-03), and Slice Zero
(`charter/charter.toml`), which is being made real by the eval-case validator lane.

The product contract remains
[`references/control-plane-product-spec.md`](references/control-plane-product-spec.md).
The adoption contract is [`references/capability-adoption.md`](references/capability-adoption.md).
