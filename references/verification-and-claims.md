# Verification and claim boundaries

Use this reference whenever Mister Clean runs or reports a test, gate, CI job, deployment, or independent review.

## Same-object rule

For every positive claim, record:

- the exact command or external run;
- the commit, tree, artifact digest, or working-tree snapshot measured;
- where it ran;
- material inputs not contained in that object;
- exit code or conclusion;
- timestamp or run identifier when state can change.

Do not substitute a nearby object: local simulation is not CI, file existence is not state-match, a merge flag is not deployment, and a planned review is not an executed verdict.

## Isolated checks

An isolated clone or exported tracked tree can reveal dependence on ignored or machine-local files. It is one useful execution environment, not automatically authoritative and not identical to CI.

Create collision-free temporary directories and account for:

- submodules and LFS;
- generated files and build ordering;
- caches and environment variables;
- network services and credentials;
- shallow history or sparse checkout;
- platform-specific behavior.

State exactly what the isolated check established.

## Evidence locators are not claims

An evidence reference establishes neither its own bytes nor the meaning claimed
for them. Before advancing a state:

- load the referenced bytes from the declared custody boundary without
  following an unowned replacement;
- recompute the digest and validate the full schema, identifier, manifest,
  RepositoryObject, timestamp, and row/JSON bindings;
- run the state-specific semantic verifier; and
- evaluate every declared required role and required claim, not one convenient
  receipt.

Authentication proves only possession of the authenticating capability. A
successful write to a terminal, socket, or queue is not visible acceptance; an
`accepted` state is not execution; a completion message is not independent
verification. Receipts bind the exact closing output object while retaining a
separate reference to the baseline they changed.

## Coverage of new product surfaces

A positive repository-wide check names the directories and file kinds it
actually reaches. When a new app, package entry, runtime adapter, generated
mirror, test directory, or language surface appears:

- extend or add the canonical type/build/test command for that surface;
- prove the runner reaches the tests under the repository's canonical runtime;
- exercise the built or packed entry point, not only source imports; and
- keep static fixtures visibly labeled and outside live state, qualification,
  routing, and cleanliness claims.

Passing a root TypeScript configuration that excludes a Svelte app is not a
passing Svelte typecheck. Passing a Node-launched test subset is not evidence for
`bun:sqlite`; execute the canonical Bun-native command and preserve the runtime
identity.

## Controls and reachability

- A check that cannot demonstrate a relevant failure may be a false assurance.
- When adding or repairing an important gate, use a bounded positive control that makes the guarded defect observable and then restore the state.
- A test suite is a control only when a named runner or CI step reaches it.
- Control wiring and control execution are distinct. For CI claims, inspect the actual run conclusion and steps for the measured commit.

Repository-native gates are action-bound controls, not only final ceremony.
Freeze one baseline control before a mutating run. Every action that changes the
full repository object carries a post-state control for that exact object,
including an interrupted action; a same-object action may omit the duplicate
run. A required gate cannot disappear, be downgraded, or change kind across the
boundary. The final successor control agrees with the final action state, and
all required gates pass there before `CLEAN`.

## Validation results are tuples, not exit codes

For every validation used as closure evidence, inspect all three dimensions:

1. the command returned the documented expected status (an unknown or
   environment-error status is failure, not a fallback);
2. the semantic result contains no in-scope warning, debt, conditional,
   skipped, partial, or failure state; and
3. coverage is complete — verified/total and all class counts reconcile to
   the independently measured census.

An advisory or intentionally fail-open hook can inform the cleanup, but it
cannot establish CLEAN. A line such as `PASS (7/10 verified)` or `66 of 68
classified` is not a pass merely because its process exited zero.
For shell controls, unexpected stderr, parser diagnostics, or substitutions
unsupported by the repository's oldest declared shell are semantic failures
even when the wrapper exits zero. Run a representative positive and negative
case under that oldest shell and require the documented stderr contract.

## Volatile actions

Recheck volatile facts immediately before consequential actions such as deletion, push, worktree removal, or process signaling. Preserve unique evidence before removal and compare content or reachable state, not merely names or file existence.

## Required claim separation

Report these independently:

| Claim | Minimum evidence for `established` |
|---|---|
| Committed locally | `kind=git_commit` and commit identifier containing the intended tree |
| Pushed | `kind=remote_ref_resolution`, remote, ref, remote-resolved commit, and observation time |
| CI green on push | `kind=established_ci`, provider, run ID, measured commit, and successful conclusion |
| Deployed | `kind=observed_deployment`, environment, deployment identifier/digest, active observed state, and observation time |
| Independently QA-accepted | `kind=independent_qa_verdict`, accepted conclusion, verdict reference, and reviewer distinct from implementer |

If the evidence is unavailable, use `not_established` or `not_assessed`. Do not fill a positive cell with an explanation of a different check.

## Handoff readiness

Handoff readiness is a mandatory dimension in `CLOSE` and whenever the user
asks for successor readiness. The newcomer test establishes whether entry
points, current work, decisions, and next actions are discoverable; it does
not by itself establish product correctness or policy compliance. In narrower
`CLEAN`, `CONFORM`, or `AUDIT` work it is advisory unless the requested scope
or repository policy makes it a gate.

## Accepted evaluator releases at a GUARD boundary

Any live bundle that records an executed `git_commit` requires an
operator-selected accepted release outside the candidate repository. A live passed/open
or crossed `mode: GUARD`, `manifest_kind: closeout_guard`, schema-1.3 boundary
additionally requires a separately retained current guard authority. That GUARD
case therefore supplies both inputs:

```text
mister-clean validate bundle <bundle> --repo <candidate> \
  --accepted-evaluator /absolute/path/to/accepted-release.json \
  --guard-authority /absolute/path/to/guard-authority.json
```

Every newly prepared GUARD closeout is schema 1.3 from initialization while
reusing schema-1.2 coordination semantics. Initialized/closed GUARD requires
neither external input; live schema-1.2 open/crossed/executed-commit authority
is closed. Both paths must be absolute, are valid only for live bundle
validation, and are rejected with `--structural`.

The accepted-release record binds the retained registry archive, installed
package bytes and manifest, package identity, executable entrypoint, and
acceptance evidence. In the schema-1.3 GUARD case, the guard-authority record binds the selected receipt
seals, barrier chronology, task tuple, candidate mint or resulting commit,
retained precommit authority, and the live repository state. The validator
independently reads, hashes, and rereads both external inputs and requires the
bundle and current repository to match them.

This establishes current exact-object and record coherence. It does not prove
actor authorship, recover an unrecorded historical mutex or compare-and-swap
execution, or prove that an evaluator actually ran without separate bound
execution evidence. `--structural` checks only bundle shape; it reads neither
external authority and cannot establish live GUARD acceptance.
