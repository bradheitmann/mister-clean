# Code-hygiene rubric — navigation entropy as a closeout defect

Imported from the `code-hygiene` skill by vNext ruling (2026-08-24, America/Denver — operator-local dates govern skill records), under
Mister Clean's stronger semantics. **Deliberately NOT imported** (they
conflict with invocation-as-authority and pay-until-paid): the bounded
cleanup packet, the 20-finding cap, the 2-iteration cap, the bonus-cleanup
quota, and AUDIT-by-default. The `code-hygiene` **no-new-failures baseline is
imported and strengthened**: no cleanup-introduced regression may survive an
atomic action boundary, even when total debt falls. Severity orders
work; it never permits leaving payable debt.

## 1. The ten dimensions — inspected clean, or paid/dispositioned

Navigation entropy — the avoidable work a successor spends finding, trusting,
and safely changing things — is a first-class closeout defect. Inspect ALL
ten dimensions; each ends the run either CLEAN-inspected or carrying
paid/dispositioned findings. **No numeric scores, no partial-inspection
laundered into clean.**

1. **Discoverability** — entry points, start-here surfaces, README truth.
2. **Structure** — directories whose purpose is stateable in one line.
3. **Naming** — names that predict contents; no misleading or stale names.
4. **Boundaries** — module/context edges honored; no business logic leaked
   into transport/UI/storage adapters; no cross-context imports; no circular
   dependencies; no environment-specific code in portable core; no exposed
   internals; no ambiguous primitive-typed APIs where a domain type is the
   contract.
5. **Dead/duplicate code** — see §3 proof obligations.
6. **Documentation** — see §6 quality contract.
7. **Tests** — see §4 hygiene beyond "tests ran".
8. **Generated artifacts** — traceable to generators; never hand-edited;
   regenerable.
9. **Config/dependencies** — see §5.
10. **Ownership/custody** — every live surface (branch, worktree, lock,
    scheduled job, external binding) has an owner and disposition.

## 2. Source-architecture repairs — smallest coherent repair

Findings in this class: generic dumping grounds (`utils/`, `misc/`,
`helpers/` accreting unrelated concerns); names that do not predict contents;
adapter layers carrying business logic; cross-context/circular imports;
environment leaks into portable code; exposed internals; primitive-obsessed
APIs. Repair with the **smallest coherent change** that removes the defect —
never an imposed architecture, never speculative redesign (the roadmap
boundary applies).

## 3. Dead/duplicate proof obligations

Before deleting anything, prove absence through ALL of: static references;
dynamic registration/reflection/string-keyed lookup; generators and build
outputs; tests and examples; deployment/runtime config; docs and runbooks;
exported/public surface and backward compatibility. Deduplicate **shared
knowledge and shared change-reason**, not similar syntax — two similar blocks
with different reasons to change are not duplicates. When the right
abstraction is unclear, apply the rule of three: tolerate two occurrences,
abstract at the third.

## 4. Test hygiene beyond "tests ran"

- Every suite discoverable by a named runner and owned.
- Test kinds separated and labeled (unit / integration / e2e / holdout) so a
  successor knows cost and preconditions before running.
- Fixtures and snapshots owned, with a documented regeneration path; a
  snapshot nobody can regenerate is dead weight asserting nothing.
- **Every skipped or quarantined test carries an owner and an exit
  condition** — skip-without-exit is deferred debt in disguise.

## 5. Config/dependency hygiene

Competing package managers or duplicate lockfiles; config precedence
conflicts (two sources answering the same question differently); stale
feature flags, env vars, bindings, and secrets references; workspace version
drift; abandoned dependencies; checked-in machine-specific paths. **Never
hand-edit a lockfile** — regenerate through the manager.

## 6. Documentation/comment quality

Preserve: rationale, rejected alternatives, invariants, safety/concurrency/
migration contracts, decision provenance. Remove: narration of what the code
plainly does, stale duplicated prose. Every duplicated document names its
canonical source or becomes one.

## 7. Stack-aware adapters — equipped, not prose

Run `mister-clean detect stack <repo>`: it detects the repository's
ecosystems from manifests/locks/config and prints the applicable sections of
[stack-adapters.md](stack-adapters.md) — the stack's KNOWN debris classes and
boundary risks. A CLEAN verdict on a detected stack includes those checks; an
UNDETECTED stack (exit 3) must be inspected manually and said so in the
report — adapter checks are never silently skipped. New ecosystems extend
stack-adapters.md with a `## <name>` section; the detector picks headers up
automatically — no parallel framework.

## 8. Evidence-bound finding envelope

Every hygiene finding records: exact path + evidence; the successor friction
it causes; severity; confidence; behavior-change risk; the repair applied or
proposed; and the validation that proves the repair. **Severity controls
order of work only — never permission to leave payable work unpaid.**

## Interaction with the founding contract

These dimensions feed the same debt ledger, the same four dispositions, the
same machine-gated verdict. A hygiene finding is payable debt like any other:
pay it, validate it, or disposition it with authority. Mister Clean's
persistence, same-object verification, independent QA for behavior/
enforcement changes, and NOT-CLEAN-on-residue rules apply unchanged.

## 9. The GATE ratchet — repaired invariants become enforced invariants

For each recurring or systemic defect Mister Clean repairs, ask: can the
repository enforce this invariant through its ESTABLISHED formatter, linter,
schema, generator, test, preflight, or CI path? Where proportionate and in
scope: add that enforcement and prove it with a negative control (plant the
defect, watch the gate bite, remove it). Where not: record explicitly why
enforcement is inappropriate. **Never create a parallel bespoke gate when an
established runner can own the rule** — a second gate system is itself
navigation entropy. This ratchet is how a clean inherited codebase stays
clean: every paid systemic debt leaves behind the mechanism that prevents its
return.
