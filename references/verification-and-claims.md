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

## Controls and reachability

- A check that cannot demonstrate a relevant failure may be a false assurance.
- When adding or repairing an important gate, use a bounded positive control that makes the guarded defect observable and then restore the state.
- A test suite is a control only when a named runner or CI step reaches it.
- Control wiring and control execution are distinct. For CI claims, inspect the actual run conclusion and steps for the measured commit.

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

Handoff readiness is advisory. A newcomer test can assess whether entry points, current work, decisions, and next actions are discoverable. It does not establish product correctness or policy compliance.
