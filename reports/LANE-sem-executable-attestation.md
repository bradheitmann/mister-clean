# LANE sem-executable-attestation — retire SEM-EXECUTABLE-CBB67799E249 under the installed 7.4.0 judge

Branch `feat/attest-sign` from main `24954d22c3808cf5279f9a4975ab3b5f6a55410d` (7.4.0), worktree
`~/.config/superpowers/worktrees/mister-clean/attest-sign`. Runner: dev-provenance (Claude dev subagent). Attester:
MC/QA (`MC/QA:pi:openai/gpt-6.1-terra:openrouter`, key `mc-qa-ed25519-20261104`). Orchestrator: PM. DONE list
committed first as `charter/DONE/sem-executable-attestation.md` (`e442908`); it did not grow. Owner authority:
`charter/owner-decisions/2026-11-04-semantic-attestation-trust.md`.

## What this branch adds

- `scripts/attest_sign.ts` (strict TS, no dependencies): reads an unsigned `mister-clean.semantic-attestation` 2.0
  record, discards any existing `signature`, refuses `<FILL …>` placeholders and a `key_id` that differs from
  `attester.key_id`, canonicalizes with the very `canonicalJson` that `src/closeout/semantic-v2.ts` imports from
  `src/canonical-json.ts`, signs Ed25519 with `MISTER_CLEAN_ATTESTATION_PRIVATE_KEY_PEM` from the environment, self-verifies
  with the derived public key, and writes `{...unsigned, signature: {algorithm, key_id, signature_base64url,
  signed_payload_sha256}}` with `wx` (never overwrites). Without the variable it refuses before reading the input with
  `attest_sign: MISTER_CLEAN_ATTESTATION_PRIVATE_KEY_PEM is not set (private_key_missing)`, exit 2. Stdout carries the key
  id, the public SPKI fingerprint and the signed-payload digest only. The attester runs it solely as
  `doppler run --project mister-clean --config attest -- bun scripts/attest_sign.ts <in> <out>`.
- `scripts/attest_sign.test.ts` (5 tests, throwaway keys only) and both files in `tsconfig.json` include.

## Proof 1: signer round-trip, tamper, no-key refusal

Green: `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 nice -n 10 node ./node_modules/vitest/vitest.mjs run --allowOnly=false
scripts/attest_sign.test.ts` → 5/5. Tests: (a) signature verifies with the public key over `canonicalJson(unsigned)` and
the signed record's payload is byte-equal to the library's canonical form; (b) one changed byte in the payload fails
verification and changes `signed_payload_sha256`; (c) no environment variable → typed refusal, exit 2, empty stdout;
(d) key-id mismatch and placeholder refusals; (e) end to end under bun with the key only in the environment, no key
material in stdout or the output, and a second run refuses to overwrite.
Mutant: payload `JSON.stringify(unsigned)` instead of `canonicalJson(unsigned)` → RED (tests a and e: signature did
not verify over the canonical bytes). Restored; tests 5/5 and `tsc --noEmit` clean again.

## The run (evidence in `~/.local/share/agent-private/mister-clean/evidence/sem-executable-attestation/`, outside every checkout)

- Frozen clone: `git clone --no-local` of origin/main into `$TMPDIR/sem-exec-lane/clone`, checked out at `24954d2`,
  `pnpm install --frozen-lockfile --ignore-scripts`. The primary checkout was not run in.
- Doppler inspected once, read-only, through `attest-inspect mister-clean`: key id `mc-qa-ed25519-20261104`, public
  SPKI fingerprint `1dbd530bafd95503…`, private key present and matching, active policy sha256 `b384b201…` equal to the
  recorded value, no revocation.
- Plan: installed 7.4.0 `semantic plan <clone> --case-proposals … --run-id sem-exec-20261104-1 --nonce <random 32 hex>
  --output <evidence>/semantic-plan.json`: 3 candidates; SEM-EXECUTABLE is `runtime_attested` with three cases
  (`declared-runtime-targets-materialize`, `cli-composition-root-responds`, `package-exports-import`); the two
  `SEM-STATE-*` candidates carry one placeholder case each (plan generation requires one per runtime candidate) and get
  no observations, so they stay `verification_debt` in this package (recorded out of scope in the DONE list).
- Observations: `sem-exec-runner.ts` (kept beside the evidence; cwd assertion, refuses the primary checkout, refuses to
  overwrite a captured run) ran the cases with cwd = clone root and bun 1.4.0 first on PATH, captured raw stdout/stderr
  per case into `evidence-root/<case>/`, and wrote `semantic-observations.json` (schema 2.0; runner actor
  `DEV:claude-code:anthropic/claude-fable-5-1:anthropic`; supervisor `mister-clean` 7.4.0). No pass/fail vocabulary.
  Tree digest before = plan binding = after (the build writes only ignored paths; `MANIFEST.sha256` was already
  current). Case statuses: build case 0 (five declared targets present, `sync:cli:check` and `manifest:package:check`
  both exit 0, bun 1.4.0); CLI case 2 (the usage exit; usage line names all eleven subcommands; node v26.12.0);
  exports case 0 (`package export surfaces: PASS`).
- `attestation-unsigned.template.json`: binding digests and the approved attester block filled; every judgment,
  adequacy and limitation left as `<FILL …>` for MC/QA. `RUN-NOTES.md` tells the attester what to read and the exact
  signing command.

## Proof 2: judge accepts and refuses (pending the MC/QA signature)

To be run after `semantic-attestation.json` exists: materialize the policy with `printf '%s'` under `doppler run`,
check its sha256 against `b384b2016f6152cdf9b2dfce2baaf4b5cd8e7cebd650e4f00b8e8b77c6e4c4a9`, assemble the evidence
package (plan, observations, attestation, inline evidence files), run
`node ~/.claude/skills/mister-clean/bin/mister-clean.js audit semantic <clone> --evidence-package <pkg> --trust-policy <policy> --json`,
then the one-character binding mutant. Results will be appended here with the verdict JSON paths.

## Proof 3: no secret bytes

`git grep -c -E -- "-----BEGIN [A-Z ]*PRIVATE KEY-----" -- . ':!src/closeout/inspection.ts' ':!bin/mister-clean.js'` on the
branch tip prints nothing (the two excluded files hold the public-safety detector's own rule), and the same pattern over
the evidence directory reports 0 for every file (the test's throwaway key never reaches a file; the end-to-end test
asserts the signed output and stdout contain no PEM header). Re-checked at the final tip below.

## Gates on this tip

`tsc --noEmit` clean; `scripts/attest_sign.test.ts` 5/5; `src/closeout/semantic-v2.test.ts` 22/22; `bun run audit:public`
PASS; `charter check --strict` ok. No full local suite (owner decision 2026-11-04: S6 evidence is hosted CI on the tip).
