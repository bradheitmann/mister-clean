# Owner decision 2026-11-04: semantic attestation trust policy and key

## Decision
The owner approved the semantic attestation key and trust policy. Owner's words, 2026-11-04T19:31Z: "Approve your keys and attestation." and "I approve your keys and attestations."

## What was approved
- One Ed25519 key, key id `mc-qa-ed25519-20261104`, for the independent reviewer seat MC/QA (actor id `MC/QA:pi:openai/gpt-6.1-terra:openrouter`, a third model family). Role `independent_qa` only.
- Public key (SPKI PEM body): `MCowBQYDK2VwAyEANCPLhYR6JSwa4w24rXRwhVsdYJEnXZjwl7WW4RNySdM=`
- Validity: 2026-11-04T00:00:00Z to 2027-02-02T00:00:00Z.
- Trust policy `mister-clean-semantic-trust-2026-11-04` (`mister-clean.semantic-trust-policy` schema 1.0), sha256 `8c19bdc71f0171a1ca49b377cce5b548ab10084c01f25ef4ea2a1f1c4b5df80a`.

## Where it lives
Outside this repository, in the owner's local Mister Clean state root, as `src/closeout/semantic-v2.ts` requires. The policy file is read-only. The private key is never committed, quoted or sent.

## How it was made
The PM generated the key with `openssl genpkey -algorithm ed25519` at the owner's request. A probe using the same `node:crypto` verify call as `semantic-v2.ts` showed that a signature by the private key verifies against the policy's public key and that a one-byte change is rejected (4/4 PASS). The approved draft was activated by renaming it, with its sha256 re-checked before and after.

## Limits the owner should know
- Custody is by rule, not enforced by the operating system: the private key is a mode-0600 file under the owner's account, so any process running as that account can read it. A stronger option, later and the owner's call, is the macOS keychain behind a per-use prompt.
- The PM, a Claude seat, generated the key. The PM is neither the runner nor the attester, and the code rejects an attester equal to the runner or the supervisor. Any change to the policy bytes needs a new owner approval.

## Use
This authorizes the attestation lane for SEM-EXECUTABLE (the executable surfaces). It does not by itself retire that finding: an attestation signed by MC/QA over a real run, validated by `audit semantic` v2, does.
