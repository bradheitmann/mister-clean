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

## Proof 2: judge accepts and refuses

- MC/QA signed at 2026-11-04T21:25:54Z: `semantic-attestation.json` (sha256 `93b074d4…`), attester
  `MC/QA:pi:openai/gpt-6.1-terra:openrouter`, key `mc-qa-ed25519-20261104`, role `independent_qa`; three judgments, all
  `supports`; `case_plan_adequacy: adequate`; five limitations recorded by the attester. Its `binding` is byte-equal
  to the runner's template binding. The signature was made with `scripts/attest_sign.ts` under
  `doppler run --project mister-clean --config attest`.
- Trust policy: `materialize-policy.sh` (kept with the evidence; `set -euo pipefail`, cwd assertion, refuses a target
  inside any checkout) ran under `doppler run` and wrote `printf '%s' "$MISTER_CLEAN_TRUST_POLICY_JSON"` into a fresh
  `mktemp -d` directory: 538 bytes, sha256 equal to `MISTER_CLEAN_TRUST_POLICY_SHA256` and to the owner-decision value
  `b384b2016f6152cdf9b2dfce2baaf4b5cd8e7cebd650e4f00b8e8b77c6e4c4a9`. A copy of those exact bytes is kept as
  `trust-policy.materialized.json` (0600) in the evidence directory for reopening; the temp directory was removed.
- Package: `assemble-package.ts` (kept with the evidence) built `semantic-evidence-package.json` (plan, the runner's
  observations, the signed attestation, 7 inline evidence files) after checking that the inline-file digest, the
  evidence-root digest and the attestation's `evidence_root_sha256` agree, and wrote the mutant package with the first
  character of the attestation's `binding.repository_object_sha256` changed (`7` → `0`).
- GREEN: `MISTER_CLEAN_RECEIPT_ROOT=<evidence>/receipts node ~/.claude/skills/mister-clean/bin/mister-clean.js audit semantic
  $TMPDIR/sem-exec-lane/clone --evidence-package semantic-evidence-package.json --trust-policy <policy> --json`
  (installed 7.4.0; subject snapshot `24954d22c3808cf5279f9a4975ab3b5f6a55410d`) → `verdict-7.4.0.json`:
  resolution `SEM-EXECUTABLE-CBB67799E249 attested_satisfied`, execution `result: pass`. The audit's overall status is
  still `fail`, exit 1, because the two pre-existing `SEM-STATE-*` candidates remain `semantic_probe_unexecuted`
  (`verification_debt`), as the DONE list states; this lane does not pay them.
- RED (mutant): the same command over `semantic-evidence-package.mutant-binding.json` → `verdict-7.4.0.mutant-binding.json`:
  `SEM-EXECUTABLE-CBB67799E249 semantic_probe_execution_error verification_debt` with
  `semantic attestation binding mismatch: repository_object_sha256; semantic attestation signed-payload digest is
  invalid; semantic attestation signature is invalid`; no resolution; execution `result: error`.
- Both receipts were written under scratch roots inside the evidence directory, never under the real state root.

## Proof 3: no secret bytes

`git grep -c -E -- "-----BEGIN [A-Z ]*PRIVATE KEY-----" -- . ':!src/closeout/inspection.ts' ':!bin/mister-clean.js'` on the
branch tip prints nothing (the two excluded files hold the public-safety detector's own rule), and the same pattern over
the evidence directory reports 0 for every file (the test's throwaway key never reaches a file; the end-to-end test
asserts the signed output and stdout contain no PEM header). Re-checked after the signature and the verify runs, with
the attester's `QA-RUN.log` and both receipts present in the evidence directory: still 0 everywhere.

## Verdict digests (evidence directory)

`verdict-7.4.0.json` `cef9743a9d93…`; `verdict-7.4.0.mutant-binding.json` `4817313166bf…`;
`semantic-evidence-package.json` `b98d0988dea6…`; `semantic-attestation.json` `93b074d43ca2…`.

## Gates on this tip

`tsc --noEmit` clean; `scripts/attest_sign.test.ts` 5/5; `src/closeout/semantic-v2.test.ts` 22/22; `bun run audit:public`
PASS; `charter check --strict` ok. No full local suite (owner decision 2026-11-04: S6 evidence is hosted CI on the tip).
