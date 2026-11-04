# Owner decision 2026-11-04: approval of the executable-surface attestation for 7.5.0

## Owner's words
2026-11-04, about 22:20Z: "Consider this my signature on the executable surface attestation." After the PM explained that the judge accepts only an Ed25519 signature from a key named in the trust policy: "if you think our current approach is the right one, let's stick with it."

## What this decides
1. The owner approves the result of the executable-surface attestation (SEM-EXECUTABLE) on the 7.5.0 release commit: the same three runtime cases as the frozen run on 24954d2 (declared runtime targets materialize, the CLI composition root responds, package exports import), judged and signed by the trusted seat MC/QA under the approved trust policy (sha256 b384b201…).
2. This statement is not itself a signature and does not change the trust policy. The cryptographic signature comes only from MC/QA's key, held in Doppler (`mister-clean` / `attest`).
3. No fallback attester is added. If MC/QA cannot sign, the PM returns to the owner.
