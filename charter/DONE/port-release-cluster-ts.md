# DONE: port-release-cluster-ts (O-LANG-1, part 2)
Slice: port the seven release-cluster scripts from hand-written `.mjs` to strict TypeScript (`git mv`, then edit): scripts/prepare_release_archive, publish_release_archive, release_archive_contract, release_capsule, generate_release_attestation, verify_packed_cli, release_path.test. Every reference is updated except `.github/workflows/ci.yml`, which agents cannot edit; the owner receives `reports/owner-ci-release-script.patch` instead, and a TAG build cannot pass until the owner applies it. `publish_release_archive` and `release_archive_contract` ship inside the release archive and run with plain `node` (>= 22.18, built-in type stripping), so they use only erasable TypeScript. This list does not grow.

1. `lang-guard scan .` reports exactly the 2 generated bundles (0 hand-written `.mjs`).
   - reopen: `lang-guard scan .` before (base) and after; diff the listings.
   - mutant: leave one `.mjs` in place → RED (record the scan output both ways).
2. A full local release dry run: `node scripts/prepare_release_archive.ts --destination <scratch>` under bun 1.4.0 and node 22 (latest 22.x) produces an archive whose receipt verification is `pass`; then from a scratch dir OUTSIDE the repository, `node ./publish_release_archive.ts --receipt ./release-archive-receipt.json` runs to the point where it refuses to publish without credentials (no publication; the exact refusal is recorded). The receipt's `publish.shell_command` names the `.ts` publisher.
   - reopen: the two commands as named, with their outputs.
   - mutant: a non-erasable TypeScript construct in a shipped file → node refuses to run it → RED.
3. Package bytes: two clean `pnpm run build:raw` runs give identical outputs; `manifest:package:check` PASS; MANIFEST.sha256 differs from the base only in renamed/shipped script entries and package.json (listed).
   - reopen: `shasum -a 256` over the outputs after each clean build; diff MANIFEST against the base.
   - mutant: a stale MANIFEST → `manifest:package:check` RED.
4. `tsc --noEmit` covers all seven ported files (each in tsconfig `include`; zero errors; no unjustified `any`).
   - reopen: `pnpm exec tsc --noEmit` and `pnpm exec tsc --listFilesOnly | grep scripts/`.
   - mutant: a planted type error in one ported file is reported → RED.
5. Regression: `scripts/release_path.test.ts` and every test referencing these scripts green; skill-contract green; `charter check --strict`; `audit:public`; SKILL.md byte count unchanged; the full `pnpm run test:node` once, reds classified (environment vs candidate).
   - reopen: the commands as named.
   - mutant: a test that pins a script path goes RED when the path is wrong.

Each proof: green, mutant RED, restore; recorded in reports/LANE-port-release-cluster-ts.md.
