# Owner decision 2026-11-05: the owner is a trusted signer (trust policy v2)

## Owner's words
2026-11-05, during the 7.5.1 closeout, after ruling that no other agent may take part: "Fine, I'll sign it." The owner then signed the SEM-EXECUTABLE attestation for run sem-exec-20261105-5 himself and later approved the final review ("approved").

## What changed
- Mister Clean's trust policy in Doppler (`mister-clean` / `attest`) now names two keys: MC/QA (`mc-qa-ed25519-20261104`, unchanged) and the owner (`owner-bradheitmann-ed25519-20261105`, actor `OWNER:bradheitmann`, role `independent_qa`, valid 2026-11-05 to 2027-02-02).
- Policy id `mister-clean-semantic-trust-2026-11-05`, sha256 over the stored bytes `b65bfdbf1d637ad32e84cffeb90eeb358243c2a882c823de2e2555f825ed1334`. It supersedes `b384b201…` recorded in charter/owner-decisions/2026-11-04-semantic-attestation-trust.md.
- The owner's private key lives only in Doppler (`MISTER_CLEAN_OWNER_ATTESTATION_PRIVATE_KEY_PEM`, masked) and reaches the signer only through `doppler run`.

## Limits
- The owner signed judgments the PM wrote from the raw outputs; the attestation states that in its limitations.
- The judge still refuses an attester who is also the runner; the owner did not run the evidence.

## Result
With this policy, the installed 7.5.0 judged a47c00d (v7.5.1) CLEAN: `validate bundle --repo` PASS, verdict CLEAN, live.
