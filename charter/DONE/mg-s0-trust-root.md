# DONE: mg-s0-trust-root (master-gate S0, verdict integrity)
Slice: a CLEAN verdict from `validate bundle` must be impossible to reach with records the closer can forge. The findings this slice pays come from the 2026-11-05 master-gate review: A3-1, A2-19, A5-5, A5-6, A3-2, A4-17, A2-18, A5-1, A5-2, A2-6, A3-4 and A1-15. Every proof below starts as a failing test written against today's code (RED), then passes after the fix.

1. Trust root from outside the bundle. When a bundle relies on any semantic v2 attestation, `validate bundle` refuses CLEAN unless the trust policy it verifies against matches a pin supplied from outside the bundle (`--trust-policy-sha256 <hex>`, repeatable for several pins; or the environment variable `MISTER_CLEAN_TRUST_POLICY_SHA256`). The refusal message names the bound digest and the pins.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/closeout/trust-root.test.ts -t "pin"`
   - mutant: skip the pin comparison → the fixture signed with a self-minted key and a self-supplied policy validates CLEAN (RED).
2. Attester identity binds to the key, not to a declared string. The "attester ≠ runner" and "attester ≠ supervisor" checks compare the policy key identity that verified the signature against the runner and supervisor identities. A signature verified by a key that the policy grants only the runner role is refused. A missing `valid_to` on a policy key is refused.
   - reopen: `... -t "attester identity"`
   - mutant: compare the declared `actor_id` strings again → RED.
3. Exceptions need an owner signature. An `accepted_exception` disposition (including operator rulings and public-safety exemptions as accepted exceptions) counts toward CLEAN only if it carries an Ed25519 signature over its canonical bytes by a key holding the owner or principal role in the pinned trust policy. An unsigned ruling, or one signed by an agent key, stays payable.
   - reopen: `... -t "exception signature"`
   - mutant: accept any nonempty actor → the forged-ruling fixture validates CLEAN (RED).
4. The bundle cannot choose its live path:
   - (a) GUARD-mode bundles marked CLEAN get the full live recheck;
   - (b) the detector registry and regression schema used for the live rerun are the judge's current ones, never the bundle's declared versions;
   - (c) the legacy v1 semantic manifest never counts toward CLEAN.
   - reopen: `... -t "live path"`
   - mutant, one per part: restore the GUARD skip / the bundle-declared registry / v1 acceptance → RED.
5. `validate bundle` writes a run receipt recording its verdict (CLEAN or NOT_CLEAN), the bundle digest, the subject commit and the trust-policy pin used. The receipt is the only machine record of CLEAN.
   - reopen: `... -t "validate receipt"`
   - mutant: skip the receipt write → RED.
6. Regression set, unchanged:
   - the full `pnpm run ci:check` passes;
   - `src/skill-contract.test.ts` is green;
   - `tsc --noEmit` is clean;
   - `charter check --strict` is ok;
   - `audit:public` passes;
   - no existing test is deleted. A test that encoded the forgeable behaviour (for example bundle.test.ts:1924, an unsigned ruling validating CLEAN) is changed to assert the refusal, and the change is listed in the slice report with its old and new assertion.
   - reopen: the commands as named.
   - mutant: n/a (regression set).
7. Self-judge: after the merge, the installed 7.5.1 judges the new main in the Linux judge container. Any debt this slice introduced is paid before slice S1 starts.
   - reopen: the container prepare command recorded in the master-gate LIFECYCLE.md.
   - mutant: n/a.
