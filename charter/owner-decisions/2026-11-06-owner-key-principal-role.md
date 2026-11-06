# Owner decision 2026-11-06: the owner's key gets the principal role (trust policy v3)

## Owner's words
2026-11-06, in the project PM's session, answering the open decision "a principal role for the owner key, so exceptions can be signed": "Give my key the owner role."

## What changed
- Mister Clean's trust policy in Doppler (`mister-clean` / `attest`) is now v3: policy id `mister-clean-semantic-trust-2026-11-06`, sha256 over the stored bytes `fc0b0677dafb1c4c714830261ddb2a3d3882f28bbb83097198f1da6a99fef5a9`. It supersedes v2, `b65bfdbf…` (charter/owner-decisions/2026-11-05-owner-signer-trust-policy-v2.md). v2 is kept in Doppler as `MISTER_CLEAN_TRUST_POLICY_JSON_V2` / `MISTER_CLEAN_TRUST_POLICY_SHA256_V2`.
- The only content change: the owner's key `owner-bradheitmann-ed25519-20261105` now has roles `["independent_qa", "principal"]`, where it previously had only `independent_qa`. The MC/QA key is unchanged. Validity windows are unchanged.
- Effect: since master-gate S0, an accepted exception counts toward CLEAN only when it carries a signature by a key holding the owner or principal role in the pinned policy. With v3, the owner can sign exceptions. "principal" is the role S0 accepts; the owner asked for "the owner role", and S0 treats owner and principal alike.

## Limits
- Signing an exception stays the owner's own act. His private key reaches a signer only through `doppler run` by the owner. An agent never signs as the owner.
- Validators that pin the trust policy (`validate --trust-policy-sha256`) must now pin `fc0b0677…`. The installed 7.5.1 judge checks only that a key's roles include the claimed attester role, so adding "principal" does not affect it.
