# Owner decision 2026-11-04: semantic attestation trust policy and key, kept in Doppler

## Decisions
1. The owner approved the semantic attestation key and trust policy. Owner's words, 2026-11-04T19:31Z: "Approve your keys and attestation." and "I approve your keys and attestations."
2. The owner then made Doppler the canonical home for this material, in every repository of the workspace. Owner's words, 2026-11-04: "I want to make sure that each repo here in this workspace has its own separate Doppler project. … make sure they have their own separate key and attestation stored in Doppler … create the separate configs for each of those as well … do everything that needs to be done for Doppler to be the canonical place to do it and for it to be done consistently across all the repos currently in this workspace".

## What was approved for this repository
- One Ed25519 key, key id `mc-qa-ed25519-20261104`, for the independent reviewer seat MC/QA (actor id `MC/QA:pi:openai/gpt-6.1-terra:openrouter`, a third model family). Role `independent_qa` only.
- Public key (SPKI PEM body): `MCowBQYDK2VwAyEANCPLhYR6JSwa4w24rXRwhVsdYJEnXZjwl7WW4RNySdM=` (SPKI DER sha256 begins `1dbd530bafd95503`).
- Validity: 2026-11-04T00:00:00Z to 2027-02-02T00:00:00Z.
- Trust policy `mister-clean-semantic-trust-2026-11-04` (`mister-clean.semantic-trust-policy` schema 1.0). Canonical bytes are the value as stored in Doppler (538 bytes, no trailing newline), sha256 `b384b2016f6152cdf9b2dfce2baaf4b5cd8e7cebd650e4f00b8e8b77c6e4c4a9`. The file the owner approved was those bytes plus one trailing newline, sha256 `8c19bdc71f0171a1ca49b377cce5b548ab10084c01f25ef4ea2a1f1c4b5df80a`; the content is identical.

## Where it lives (the convention for every workspace repository)
- Doppler project named after the repository (`doppler.yaml` at the root links it; default config `dev` for ordinary secrets).
- A config named `attest` in its own Doppler environment ("Attestation"), so it inherits nothing from `dev`. It holds only:
  - `MISTER_CLEAN_ATTESTATION_PRIVATE_KEY_PEM` (masked)
  - `MISTER_CLEAN_ATTESTATION_PUBLIC_KEY_PEM`
  - `MISTER_CLEAN_ATTESTATION_KEY_ID`
  - `MISTER_CLEAN_TRUST_POLICY_JSON` and `MISTER_CLEAN_TRUST_POLICY_SHA256`, once the owner has approved that repository's policy.
- The key reaches a signer only through `doppler run --project <repo> --config attest -- <command>`. It is never written to a file, committed, quoted or sent.
- Digest rule: every policy sha256 is over the exact bytes Doppler stores. Policies are stored without a trailing newline, because Doppler strips one.
- `audit semantic` needs the policy as a file outside the audited repository. Inside `doppler run --project <repo> --config attest`, write it to a fresh directory outside the repository with `printf '%s' "$MISTER_CLEAN_TRUST_POLICY_JSON"` (no newline added), then check that file's sha256 against `MISTER_CLEAN_TRUST_POLICY_SHA256` and the repository's owner-decision record. Do not hash the output of `doppler secrets get --plain`: it appends a newline.
- Run `doppler setup --no-interactive` once in each checkout. The CLI does not read `doppler.yaml` on its own, so a scope set on a parent directory otherwise wins.
- Unapproved policies wait as `MISTER_CLEAN_TRUST_POLICY_DRAFT_JSON` and `MISTER_CLEAN_TRUST_POLICY_DRAFT_SHA256`. On the owner's approval the identical bytes are copied to the active names; the sha does not change.

## How it was made and checked
- The PM generated this repository's key with `openssl genpkey -algorithm ed25519` at the owner's request, then moved it into Doppler; the local files were removed after the Doppler copy was verified.
- Through `doppler run`, a probe signed a message with the private key, verified it with the stored public key, rejected a one-byte change, and matched the stored public key to the private key (PASS). The fingerprint is identical to the approved key. The stored policy bytes hash to the approved sha256.
- First attempt, corrected the same hour: a branch config of `dev` inherited every `dev` secret (here the npm token), so the attestation config moved to its own environment and the branch configs were deleted. Doppler's `restricted` visibility was also tried and dropped: this machine's Doppler login cannot read restricted values even through `doppler run`, so no signer could use the key.

## Limits the owner should know
- Doppler removes the key from disk, logs every fetch and makes rotation a single change. It does not stop a process running under the owner's Doppler login from fetching the key: custody is by rule plus the access log, not enforced. The enforced option (a per-use prompt) would put the owner in every signature.
- The PM, a Claude seat, generated the key. The PM is neither the runner nor the attester, and the code rejects an attester equal to the runner or the supervisor. Any change to the policy bytes needs a new owner approval.

## Use
This authorizes the attestation lane for SEM-EXECUTABLE (the executable surfaces). It does not by itself retire that finding: an attestation signed by MC/QA over a real run, validated by `audit semantic` v2, does.

## Owner approval of every workspace policy (2026-11-04)
Owner's words: "Approve all." This covers the policies below, each trusting one independent_qa seat with that repository's own key, valid 2026-11-04 to 2027-02-02. It also accepts the custody limit as stated above, option (a): independence rests on rule and the Doppler access log, not on separate OS users. Each policy was promoted from its draft only after its stored sha256 matched the approved table; the drafts were then removed.

| Repository | Trusted seat | Policy sha256 (stored bytes) |
|---|---|---|
| mister-clean | MC/QA:pi:openai/gpt-6.1-terra:openrouter | b384b2016f6152cdf9b2dfce2baaf4b5cd8e7cebd650e4f00b8e8b77c6e4c4a9 |
| odin | OD/QA:pi:xiaomi/mimo-v2.6-flash:openrouter | 2dce07712af270bd133ba6e0603e0d494c5c0abc581524bc297a232724b459dd |
| lumbr | LU/QA:pi:xiaomi/mimo-v2.6-flash:openrouter | 8f030e40f25d232edde2f41bae9c3ceb70b12a3f8193828061d05a83f1ed02a8 |
| plangraph | PG/QA:pi:xiaomi/mimo-v2.6-flash:openrouter | 2e2649744efbe04c6f0d6c40e302f60d9b1c561701caf634ac09137c39f78dc8 |
| polyswarm | PS/QA:pi:xiaomi/mimo-v2.6-flash:openrouter | c542232b84835c949e0e7805f9f6fd643ac387ec23e254560bb3f30c1e80597f |
| model-tier-drop | MTD/QA:pi:xiaomi/mimo-v2.6-flash:openrouter | 7fb3ddfbd88c3bc95e5ea1ed315cab76cc4e81361267a11100b851f42944c101 |
| model-atlas | MA/QA:pi:xiaomi/mimo-v2.6-flash:openrouter | a855fd209f2e63127db6bad6181f6b62446cee3f5d479d40e401fa1bcd3f1fa0 |
| charter | CH/QA:pi:xiaomi/mimo-v2.6-flash:openrouter | 41db601aec2a5c843f09b03f22e2000be1e5f78d2b582a78f9587cae91c5a410 |
| reveng | A/CAPTAIN:opencode:xiaomi/mimo-v2.6-pro:openrouter | baa13927991ec71d702c29a9d4aac8455af7779523aeb0f91a871457d7feb405 |
| holden-mcp | SEAT:codex-cli:gpt-6-luna:openai | f9d1e027ffa6df48095d6c5085d23dd023f53fe5ea6f45d35e1db129ff8839d5 |

Each repository's own charter records its row. holden-mcp sits outside this workspace and was included at the owner's request.
