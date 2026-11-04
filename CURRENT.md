---
artifact_type: maintenance
maint_id: MC-CURRENT-7.5
title: Mister Clean 7.5 current state
status: active
timezone: UTC
owner: repository maintainer; operated by the project PM
contract: references/control-plane-product-spec.md
current_projection_source: machine
current_projection_command: mister-clean inspect repository-object . --json
current_release: 7.5.0
current_release_commit: the commit tagged v7.5.0 (`git rev-list -n 1 v7.5.0`); this file cannot name its own commit
current_step: 7.5.0 released from a commit the installed 7.4.0 judged CLEAN, with an independent signed attestation for its executable surfaces
next_step: 7.6.0 batch (see charter/STATE.md), then the field study of the skill across the owner's repositories
closing_gate: exact-object hosted CI, second-family QA on the exact tip, independent semantic attestation, CLEAN closure bundle, annotated tag, verified release archive
---

# Mister Clean 7.5 current state

**Released: 7.5.0** (annotated tag `v7.5.0`; the CI tag run builds the verified archive
`bradheitmann-mister-clean-7.5.0.tgz` and its receipt on the GitHub release). 7.4.0 (`a1f39ebb`,
tag `v7.4.0`) preceded it. No npm publication is asserted by this file.

What 7.5.0 adds over 7.4.0: retirement rulings staged into bundles and never treated as owner
authority when tool-minted; language-policy audit and root debts; sealed, digest-checked segments
for the invocation journal and the run-receipt store; the executable-surface detector following
hosted CI steps as native routes; `scripts/attest_sign.ts` for independent semantic attestations;
rustup and Go toolchain locators in the gate environment; release and build scripts in strict
TypeScript. The full list is in the release notes on the GitHub release and in `charter/STATE.md`.

## How a successor verifies this projection

- `node bin/mister-clean.js attest <installed-root> --json --strict` on an installed release
  reports `claimed_source.git_commit` and `git_tag`; compare with `git rev-list -n 1 v7.5.0`.
- `charter/STATE.md` carries the proven / not-proven ledger, the exact last-green and last-red
  commands, and the next three bounded items.
- `git tag --points-at <commit>` and the CI tag run bind the release to the object.
- Attestation keys and trust policies live in Doppler, never in this repository
  (`charter/owner-decisions/2026-11-04-semantic-attestation-trust.md`).

## Standing obligations (detail and owners in `charter/STATE.md`)

Slice Zero redesign with the owner (`charter/charter.toml`, `proven_on` empty); the 7.6.0 batch:
public-safety credential rules from PM-ODIN, the three release-closure scripts no CI step runs,
the remaining static script notes behind the opaque `ci:check` capsule, the packaged
`attest-inspect` helper, suite overlap and load-aware tests, and the capsule's package-manager
download.

The product contract remains
[`references/control-plane-product-spec.md`](references/control-plane-product-spec.md).
The adoption contract is [`references/capability-adoption.md`](references/capability-adoption.md).
