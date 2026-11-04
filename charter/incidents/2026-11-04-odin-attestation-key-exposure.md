# Incident 2026-11-04: odin's attestation private key printed to a reviewer seat

## What happened
During review of odin PR #36, odin's independent reviewer seat (OD/QA, Pi with xiaomi/mimo-v2.6-flash via OpenRouter) ran a command meant to list the names in odin's Doppler `attest` config. It used a `sed` that strips only the first line of each multi-line value, so the base64 body of `MISTER_CLEAN_ATTESTATION_PRIVATE_KEY_PEM` printed to the seat's terminal. The terminal content went to the seat's model provider, and it stays in the seat's local session log and scrollback. The seat reported it unprompted.

- Exposed key: `odin-attest-ed25519-20261104`, SPKI DER sha256 `39056681657cf2ea4d74c38f323a7db79a2d16f04eb15a4d8e65585620fd937c`.
- The key had signed nothing; odin had no consumer yet.

## Response (same hour)
1. Revoked. The private key and the policy trusting it (sha256 `2dce07712af270bd133ba6e0603e0d494c5c0abc581524bc297a232724b459dd`) were deleted from odin's `attest` config. `MISTER_CLEAN_ATTESTATION_REVOKED` there names the key, its fingerprint and the reason.
2. Rotated. New key `odin-attest-ed25519-20261104b`, SPKI DER sha256 `6f9b3aaf46da3ff3331cfbb780d9359cb97db2b6e2991a7e03fdec9e9cd3c6e1`, checked by sign, verify and tamper-rejection. A new draft policy for the same seat, sha256 `cc052efd1f3283b0773fd0dc55f032e73c44f45267962c93b4cdd9dca7bf1ad4`, waits for the owner's approval because its bytes differ from the approved one.
3. Swept. A single pass over every agent log root on this Mac (Pi, Claude Code, Codex, opencode; 206,502 files) searched for each of the ten live private keys and printed only counts: zero files contain any live key. A positive control (a throwaway key planted in a scratch root) was found, and a negative control was not. Not covered: scrollback held in memory by the terminal app, and copies already at a provider. That is why rotation, not scrubbing, is the remedy.
4. Audited. The PMs of lumbr, plangraph, polyswarm, model-tier-drop, model-atlas and holden-mcp each reviewed every command run against their `attest` config: no value was ever printed, so none rotates.
5. Odin's PM chose not to edit the reviewer seat's session log, because the key is revoked and that log is odin's cost-measurement record. The owner can override.

## Root cause
The PM provisioned keys and a storage convention but no safe way to look at them. Every reviewer therefore composed its own Doppler commands against a config holding a secret, and one of them got the text filtering wrong.

## Rule (binding for every repository using Mister Clean attestation)
- Agents look at an `attest` config only through the read-only helper `attest-inspect <doppler-project>`, kept beside Mister Clean's local attestation notes in the owner's local state root. It prints the key id, the public fingerprint, whether the private key is present and its length, policy hashes against the recorded values, and any revocation note. It never prints a secret value.
- The helper runs with `zsh -f` and refuses when `bun` is missing from PATH or resolves into a temporary directory.
- No agent composes its own Doppler command against an `attest` config. Signers receive the key only through `doppler run --project <repo> --config attest -- <signer>`.
- Every brief that touches attestation carries this rule.

## Lesson
When you provision a secret, ship the only allowed way to inspect it at the same moment.

## Obligations
- O-ATTEST-INSPECT-1: move the helper into Mister Clean as a packaged command, with a test proving that no byte of any secret value can reach its output.
- Owner: approve odin's new policy `cc052efd…`; until then odin has no active policy.
