# Owner decision 2026-11-04: S6 evidence is hosted CI on the exact tip; the local full suite is not a gate

## Owner's words
2026-11-04, about 20:50Z: "you are getting stuck in a loop. do not allow this." "you need to finish this and get it clean without falling into an endless verification loop." "identify the source of the recursion and decisively cut it off / remove it / stop it."

## The recursion
S6 requires the full suite green on the exact bytes before a QA dispatch. On this host the full suite takes 50 to 60 minutes, times out whenever other sessions raise the load, and three capsule tests (run_clean_ci "cold clone" and "bounded Node-matrix timeout", release_path real build) fail locally on main itself while hosted CI passes them. Four lanes therefore reran the suite in a queue all afternoon and none reached QA. The gate had become the impediment.

## Decision (not a relaxation of S6)
S6 says green on the exact bytes. It does not say green on this laptop. From now on:
1. The S6 evidence for a lane is the hosted CI `verify` job green on the exact tip (it runs `test:node` and the other matrix commands on those bytes). A local full run is optional and never required.
2. A local full run that fails only timing-bound tests under load is recorded as "indeterminate under load" and is not rerun.
3. The three capsule tests that fail locally on main are obligation O-LOCAL-CAPSULE-1 (reproduce the local-environment cause with the capsule's own stderr; fix or scope the tests), owned by the next bounded slice. They do not block any lane.
4. Full suites in this repository must not overlap on one host (O-SUITE-LEASE-1) and timing-bound tests should report resource contention instead of failing (O-LOAD-1). Both are improvement obligations, not gates.

## Effect
Every lane currently open (Slice Zero #60, release-script port #67, language-policy root debts, local-store rotation) goes to QA on hosted CI green, in that order.
