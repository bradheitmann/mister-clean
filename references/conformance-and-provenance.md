# Conformance without provenance loss

Uniform current artifacts reduce navigation friction and give agents clearer local examples. Historical variance can also encode real changes in schema, policy, and understanding. Normalize deliberately.

## Classify before changing

| Artifact class | Preferred treatment |
|---|---|
| Current operational artifact | Update to the current canonical form when authorized. |
| Generated output | Regenerate from its source; do not hand-edit. |
| Historical planning record | Migrate with an explicit rule and retain original provenance. |
| Evidence, verdict, receipt, or signed record | Treat as immutable; add an amendment or normalized view. |
| Scratch or generated debris | Remove recoverably when ownership and uniqueness are established. |

## Migration contract

For historical conformance, record:

- source and destination schema versions;
- exact corpus and exclusions;
- mechanical versus judgment-bearing transformations;
- original digest or preservation location;
- migration tool or rule;
- rollback procedure;
- validation performed on the result.

Prefer append-only amendments, adapters, indices, or normalized projections when rewriting would blur what was known or asserted at the original time.

## Declared-schema closure

Once repository canon declares a field, label, header, ordering rule, or exact
character shape required for an artifact class, enumerate the complete eligible
corpus and validate every instance against that declaration. A template, a
sample pass, or a count of files is not conformance evidence. Missing current or
future execution identity is payable; unknown historical identity remains
explicitly `UNRECORDED` and is never guessed merely to make the corpus uniform.

## Repository-as-context principle

The repository influences future contributors, but uniformity is not automatically truth. Optimize the current entry points and active examples first. Preserve legitimate alternatives and historical evidence rather than deleting counterexamples solely because an agent might imitate them.

Use repository policy to distinguish unwanted drift from intentional evolution.

## File placement

Assess navigation friction proportionally:

- Can a newcomer find the primary entry points?
- Does each inspected directory have a discoverable purpose?
- Are planning, evidence, generated output, and source separated?
- Are machine-specific artifacts excluded?
- Can generated files be traced to a generator?
- Are tests reachable from named runners?

Do not require an exhaustive directory walk for every closeout. Scope inspection by risk, change surface, repository policy, and the user’s directive.


## Resolution of the momentum-vs-provenance tension (operator-ruled)

Two goods pull against each other here: intelligent momentum says surviving
counterexamples train future agents into drift; provenance says history can
encode legitimate change. The operator's standing ruling resolves it by
artifact class:

- **Planning and structural artifacts** (slices, stories, lane metadata,
  vocabulary): momentum wins. Normalize them to the current canon — including
  already-executed ones — using the migration contract above (digests,
  mechanical-vs-judgment classification, rollback). "Preserve the
  counterexample" is not the default here; the operator ruled that uniformity
  of the pattern is the point (wax on, wax off), and provenance is preserved
  by the contract's digests, not by leaving the drift in place.
- **Evidence, verdicts, receipts, signed records**: provenance wins,
  absolutely. Immutable — append amendments or normalized views, never
  rewrite. A rewritten verdict is a forged verdict.
- **Legitimate alternatives** (a deliberately different design, a recorded
  exception): neither drift nor evidence — keep them, and make the
  deliberateness legible on the artifact so a future agent reads a decision,
  not a precedent for variance.
