# Owner decision 2026-11-04: semantic attestation trust policy and key, kept in Doppler

## Decisions
1. The owner approved the semantic attestation key and trust policy. Owner's words, 2026-11-04T19:31Z: "Approve your keys and attestation." and "I approve your keys and attestations."
2. The owner then made Doppler the canonical home for this material, in every repository of the workspace. Owner's words, 2026-11-04: "I want to make sure that each repo here in this workspace has its own separate Doppler project. … make sure they have their own separate key and attestation stored in Doppler … create the separate configs for each of those as well … do everything that needs to be done for Doppler to be the canonical place to do it and for it to be done consistently across all the repos currently in this workspace".

## What was approved for this repository
- One Ed25519 key, key id `mc-qa-ed25519-20261104`, for the independent reviewer seat MC/QA (actor id `MC/QA:pi:openai/gpt-6.1-terra:openrouter`, a third model family). Role `independent_qa` only.
- Public key (SPKI PEM body): `MCowBQYDK2VwAyEANCPLhYR6JSwa4w24rXRwhVsdYJEnXZjwl7WW4RNySdM=` (SPKI DER sha256 begins `1dbd530bafd95503`).
- Validity: 2026-11-04T00:00:00Z to 2027-02-02T00:00:00Z.
- Trust policy `mister-clean-semantic-trust-2026-11-04` (`mister-clean.semantic-trust-policy` schema 1.0), sha256 `8c19bdc71f0171a1ca49b377cce5b548ab10084c01f25ef4ea2a1f1c4b5df80a`.

## Where it lives (the convention for every workspace repository)
- Doppler project named after the repository (`doppler.yaml` at the root links it; default config `dev` for ordinary secrets).
- A config named `attest` in its own Doppler environment ("Attestation"), so it inherits nothing from `dev`. It holds only:
  - `MISTER_CLEAN_ATTESTATION_PRIVATE_KEY_PEM` (masked)
  - `MISTER_CLEAN_ATTESTATION_PUBLIC_KEY_PEM`
  - `MISTER_CLEAN_ATTESTATION_KEY_ID`
  - `MISTER_CLEAN_TRUST_POLICY_JSON` and `MISTER_CLEAN_TRUST_POLICY_SHA256`, once the owner has approved that repository's policy.
- The key reaches a signer only through `doppler run --project <repo> --config attest -- <command>`. It is never written to a file, committed, quoted or sent.
- `audit semantic` needs the policy as a file outside the audited repository: materialize `MISTER_CLEAN_TRUST_POLICY_JSON` into a fresh directory outside the repository for that run and check its sha256 against `MISTER_CLEAN_TRUST_POLICY_SHA256` and against this record before use.

## How it was made and checked
- The PM generated this repository's key with `openssl genpkey -algorithm ed25519` at the owner's request, then moved it into Doppler; the local files were removed after the Doppler copy was verified.
- Through `doppler run`, a probe signed a message with the private key, verified it with the stored public key, rejected a one-byte change, and matched the stored public key to the private key (PASS). The fingerprint is identical to the approved key. The stored policy bytes hash to the approved sha256.
- First attempt, corrected the same hour: a branch config of `dev` inherited every `dev` secret (here the npm token), so the attestation config moved to its own environment and the branch configs were deleted. Doppler's `restricted` visibility was also tried and dropped: this machine's Doppler login cannot read restricted values even through `doppler run`, so no signer could use the key.

## Limits the owner should know
- Doppler removes the key from disk, logs every fetch and makes rotation a single change. It does not stop a process running under the owner's Doppler login from fetching the key: custody is by rule plus the access log, not enforced. The enforced option (a per-use prompt) would put the owner in every signature.
- The PM, a Claude seat, generated the key. The PM is neither the runner nor the attester, and the code rejects an attester equal to the runner or the supervisor. Any change to the policy bytes needs a new owner approval.

## Use
This authorizes the attestation lane for SEM-EXECUTABLE (the executable surfaces). It does not by itself retire that finding: an attestation signed by MC/QA over a real run, validated by `audit semantic` v2, does.
