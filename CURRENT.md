---
artifact_type: maintenance
maint_id: MC-CAPABILITY-SEAMS-7.1
title: Mister Clean 7.1 capability seams
status: active
timezone: America/Denver
owner: repository maintainer
contract: references/control-plane-product-spec.md
current_projection_source: machine
current_projection_command: mister-clean inspect repository-object . --json
current_step: independently validate the 7.1.0 candidate and its package archive
next_step: publish only after exact-candidate QA, holdout, commit guard, and release gates pass
closing_gate: exact-object native suite, independent acceptance, GUARD, and verified release archive
---

# Mister Clean 7.1 current state

**7.1.0 CANDIDATE — NOT CLEAN; publication and acceptance are not established by this file.**

The package and skill version are 7.1.0. The full default CLI, skill, MCP, and
control-plane behavior remain available. The additive `./planning` export
provides supplied-document assessment without activating a target repository,
SQLite, transports, or a CLI. Its result labels the limited scope and omitted
repository checks explicitly; a passing assessment is not repository closeout.

Planning policy and parsing now reside behind a private capability seam separate
from repository discovery and live Git/current-projection observation. Existing
internal imports and repository audit signatures remain compatible. Full audits
retain their live verification and discovery checks.

## Planning addendum — 2026-10-05 (carried forward 2026-10-31)

Cross-project evaluation standardization is **planned, not implemented or
dispatched**. See the [roadmap](project/planning/ROADMAP.md) and
[EV-01–EV-06 execution plan](project/planning/EVAL-STANDARDIZATION-PLAN.md).
The observed campaign telemetry does not establish admitted capability trials.
This addendum has not reverified publication or any older receipt. Dispatch of
new evaluation work is governed by the project charter (`charter/`, Slice Zero)
once it lands.

## Acceptance and release obligations

1. Build with the pinned Bun 1.4.0 and pnpm 11.0.3 toolchain; independently verify
   compatibility, package exports, source development, and tamper rejection.
2. Regenerate materials, CLI bundle, and package manifest from the candidate.
3. Run the complete clean-capsule matrix on that exact candidate. A sandbox that
   cannot observe process birth identity or create Unix sockets is a blocker,
   not a passing result or permission to skip a gate.
4. Obtain independent adversarial QA, holdout, and commit guard on one frozen
   object. Changed bytes invalidate earlier candidate acceptance.
5. Build the receipt-bound release archive from the accepted Git object; publish
   only with the required release credentials and archive custody.

Historical 7.0.x test runs and accepted-release attestations cover only their
named objects. They do not certify 7.1.0. This current-state projection replaces
the stale September 7.0.1 release-in-flight narrative; historical records remain
in Git history and their original evidence artifacts. No npm publication,
remote signer identity, or production qualification is asserted here.

The product contract remains
[`references/control-plane-product-spec.md`](references/control-plane-product-spec.md).
The adoption contract is [`references/capability-adoption.md`](references/capability-adoption.md).
