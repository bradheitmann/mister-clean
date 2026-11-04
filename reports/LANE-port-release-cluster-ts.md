# LANE port-release-cluster-ts — seven release scripts from .mjs to strict TypeScript (O-LANG-1, part 2)

Worktree `~/.config/superpowers/worktrees/mister-clean/port-release`, branch `chore/port-release-cluster-ts` from
origin/main `ea50cb9`. DONE list committed first as `charter/DONE/port-release-cluster-ts.md` (`491981a`); it did not
grow. Toolchain: bun 1.4.0 (`$TMPDIR/bun140/bin`, `bun --version` = `1.4.0`) for every build; TypeScript 6.0.3; node
v22.23.4 (the latest 22.x, which setup-node `node-version: 22` resolves; official darwin-arm64 tarball, SHASUMS256
verified, unpacked in lane scratch) for the release dry run and the shipped-file proofs; host node v26.12.0 for the
vitest runs (`test:node`). Author: Claude Opus 5.5 (Claude Code dev subagent dev-port-release).

## Owner action required before a TAG build can pass

`.github/workflows/ci.yml` still runs `node scripts/prepare_release_archive.mjs` in the tagged-release step. Agents
cannot edit that file. `reports/owner-ci-release-script.patch` is the one-line change to
`node scripts/prepare_release_archive.ts`. `git apply --check` is clean against origin/main, and `patch --dry-run`
is clean against the open ci-workflow PR #63 version of the file. Until the owner applies it, a `v*` tag build fails at
that step. PR builds do not run that step, so PR CI stays meaningful. The workflow's comment on line 40 still names
`generate_release_attestation.mjs`; it is cosmetic, outside the one-line patch, and recorded below as an obligation.

## What changed

- `8133722`: pure `git mv` of the seven scripts to `.ts`, content unchanged, so history follows each file.
- `e03c5ae`: strict typing plus every reference except ci.yml.
  - Each file is in tsconfig `include`; `tsc --noEmit` exit 0; no `any` in the seven (`grep -nE ':\s*any\b|as any\b|<any>'`
    returns nothing).
  - Files that run under plain node use only erasable syntax and `.ts` import specifiers. That set is wider than the two
    shipped files: CI runs the preparer with node, the preparer imports the contract and the capsule module, and it
    spawns `verify_packed_cli.ts` with `process.execPath`. Type-only imports use `import type`.
  - tsconfig gains `rewriteRelativeImportExtensions: true`, so tsc accepts `.ts` specifiers without forcing `noEmit`
    onto tsup's declaration build. No `src` file uses a `.ts` specifier, and proof 3 shows no dist byte changed.
  - `engines.node` `>=22` → `>=22.18`. Reason: the receipt-bound publisher and archive contract now ship as `.ts` and
    consumers run them with plain `node`; 22.18 is the first 22.x line where type stripping is on by default.
  - References: package.json (`pack:smoke`, `release:attestation:{check,source-check,write}`, `release:check`); the
    preparer's source-consistency list, retained helper names and the receipt `publish.shell_command`; the publisher's
    verifier filename; `run_clean_ci.ts` and `verify_generated_candidate.ts` imports; the test fixtures; README.
  - `run_clean_ci.ts`: `import.meta.dir` → `import.meta.dirname`. The test now pulls this file into tsc, and the Bun-only
    property is untyped. Both names give the same directory in Bun.
- `a8f9458`: MANIFEST.sha256 regenerated (proof 3) and `reports/owner-ci-release-script.patch`.

Typing decisions, each commented inline:
- `@cloudflare/workers-types` declares `process` as `any`, so `process.argv` was an `any` leak in every script and
  `process.exit()` never narrows. Each `args` is annotated `string[]`. Values guarded by an exiting usage check carry a
  commented non-null assertion.
- Under the combined Node and Workers type set, `Buffer` hides Node's `equals` and `toString(encoding)` (part 1 found
  the same; confirmed with a throwaway probe file, removed). The contract exports a narrow `NodeBytes` type and an
  identity `nodeBytes()` view. These are the only byte-type casts.
- Untrusted JSON (the receipt, the attestation, registry output) is typed with `unknown` leaves. The existing runtime
  checks stay the authority. The attestation validator reuses the objects `exactKeys` returns, which are the same
  objects it checked.

## Behaviour identity (supporting evidence)

`bun build --no-bundle --target=node` of each base file (origin/main, saved as `.ts` because the host hook refuses
shell writes of `.mjs`) and each port, compared. Every difference is one of three kinds:
- a `.mjs` → `.ts` path string;
- the identity `nodeBytes(...)` wrapper (contract, verifier, test);
- the attestation validator binding `exactKeys`' return value, `String(x)` around a RegExp#test argument (test already
  applies ToString), and a `typeof === "string"` guard before `Map#get` (every key is a string, so the lookup result is
  unchanged).
No check was added, removed or reordered.

## Proofs and observed-RED mutants

1. **lang-guard.** Base (origin/main): `17 untyped file(s): 2 .js, 15 .mjs`. Branch alone:
   `10 untyped file(s): 2 .js, 8 .mjs`; the eight are exactly part 1's scripts (PR #61, not yet on main). Combined: an
   uncommitted trial merge of `origin/chore/port-build-scripts-ts` into this tip, in the baseline worktree, scans
   `2 untyped file(s): 2 .js`, the two generated bundles; the merge was aborted. Mutant: `git mv` one ported file back
   to `.mjs` → `11 untyped file(s)` (RED); restored → 10. The "exactly 2" end state therefore holds once both PRs land.
   The trial merge shows the second PR to land will conflict in `package.json` (adjacent script lines, both sides
   `.ts`) and `MANIFEST.sha256` (regenerate); `tsconfig.json` merges cleanly.
2. **Release dry run.** Independent scratch clone of the tip `a8f9458` with a local-only `v7.4.0` tag. A local-path
   clone copies every ref despite `--no-tags`, so the clone's own `v7.4.0` was retargeted inside that clone only; the
   shared repository's tag still points at `a1f39eb`. Under node 22.23.4 and bun 1.4.0, `pnpm install
   --frozen-lockfile && pnpm run build:raw && pnpm run manifest:package:check` (PASS, 82 entries, tree clean), then
   `node scripts/prepare_release_archive.ts --destination <scratch>/release-out`: exit 0 in 49 s, empty stderr.
   Reopened receipt: `status: verified_not_published`, `verification.status: pass` with all 18 checks,
   `claimed_source` `a8f945881dd56a25e334ba0ed5015d9bc1374c09` / `v7.4.0`, archive `f564b2ba…` (5978737 bytes),
   retained `publish_release_archive.ts` and `release_archive_contract.ts`, and
   `shell_command: node './publish_release_archive.ts' --receipt './release-archive-receipt.json'`.
   Publisher: 7.4.0 is absent from npm, so the publisher would reach `pnpm publish`. `~/.npmrc` holds an auth-token
   line, so it ran under `env -i` with an empty scratch HOME and XDG config and empty user and global npm config.
   `pnpm whoami` in that environment first returned `ERR_PNPM_WHOAMI_UNAUTHORIZED`. Then, from the scratch directory
   outside the repository, `node ./publish_release_archive.ts --receipt ./release-archive-receipt.json` passed every
   receipt, custody and archive-identity check. Its registry observation found the version absent, and the
   unauthenticated publish request was rejected:
   `ERR_PNPM_FAILED_TO_PUBLISH … (status 404 Not Found): {"error":"Not found"}`. The publisher then refused with
   `Error: pnpm publish failed with status 1 and registry still lacks the version` (exit 1). No
   `publication-receipt.json` was written; `pnpm view @bradheitmann/mister-clean@7.4.0` still returns
   `ERR_PNPM_PACKAGE_NOT_FOUND`. Nothing was published.
   Mutants, on scratch copies of the retained files under node 22.23.4: an `enum` appended to the publisher →
   `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript enum is not supported in strip-only mode` (RED); a class
   with a parameter property appended to the contract → `… parameter property is not supported in strip-only mode`
   (RED); both restored → the contract loads (exit 0) and the publisher prints its usage (exit 2).
3. **Package bytes.** Hash set: every file under `dist/` (23), `bin/mister-clean.js`, `src/generated-materials.ts`,
   `model-scorecard-interactions.js`, `model-scorecard.html`, `MANIFEST.sha256` (28). Base `ea50cb9` (detached worktree
   `baseline-prc`) two clean `build:raw` → identical; port two clean `build:raw` → identical. Base versus port: 27 of 28
   identical; only `MANIFEST.sha256` (`22b445ea…` → `c6b3c177…`), and inside it only `./package.json`
   (`e65b8735…` → `43cb9cc7…`: script paths and `engines`) and `./README.md` (`9777de28…` → `7d192b6a…`: the
   publisher command name in the release section). No script is a manifest entry. The README entry is the one change
   outside "renamed scripts and package.json"; it is the required documentation reference.
   `manifest:package:check` PASS (82 entries). Mutant: one byte appended to README.md →
   `manifest: FAIL (MANIFEST.sha256 is stale)`, exit 1 (RED); restored → PASS.
4. **tsc.** `tsc --listFilesOnly` lists all seven; `tsc --noEmit` exit 0. Mutant:
   `const typeMutant: number = "not a number"` appended to the publisher → TS2322, exit 2 (RED); restored → exit 0.
5. **Regression.** `release_path.test.ts`, `run_clean_ci.test.ts`, `verify_generated_candidate.test.ts`,
   `skill-contract.test.ts` under node: 4 files, 88/88. Mutant: `release:check` reverted to `prepare_release_archive.mjs`
   → `expected 'bun run ci:check && node scripts/prep…' to contain 'prepare_release_archive.ts'` (RED); restored →
   pass. `audit:public` PASS (83 files). `charter check --strict` ok (pinned binary `b9323cd`; `charter` is not on PATH).
   SKILL.md 19975 bytes on base and branch. Full `pnpm run test:node`: see below.

## Full test:node

`pnpm run test:node` once on `a8f9458` (the exact code and package bytes of this lane; bun 1.4.0 on PATH, host node
v26.12.0, `nice -n 10`, host load 9.6 to 10.7 from other lanes): `Test Files  57 passed (57)`, `Tests  915 passed (915)`,
`Duration  629.37s`, exit 0. No red to classify. The log includes stderr from fixtures that fail on purpose
(`intentional clean-ci fixture rejection`, `fresh build output absent`); those tests passed. After the run only this
report was added (docs only, outside the package surface and MANIFEST).

## Recorded obligations (next bounded slice; not fixed here)

- O-LANG-1c: ci.yml line 40's comment still names `generate_release_attestation.mjs` (cosmetic; owner-only file).
- O-LANG-1d: `verify_packed_cli.ts` writes three consumer smoke programs as `.mjs` files into its temporary consumer
  directory at run time. They are generated strings, not repository files, so lang-guard does not see them. Porting
  them to `.ts` would change what the release smoke executes, so they were left as they are.
- Historical records name the old `.mjs` paths and were left as written: `project/planning/handoffs/HANDOFF-2026-09-22-SPRINT.md`,
  `project/planning/hygiene/MANUAL-LOOSE-ENDS-LEDGER.md` (LE-004, LE-005) and three earlier lane reports.
- Process note: one exploratory command in this lane carried a stray inline `node -e` probe with no effect, against
  the lane rule. It was not repeated.

## Freeze addendum (merge of origin/main 98923cb, PR #61)

`4731adb` merges origin/main `98923cb`, which brings part 1 (PR #61, the eight build/report scripts). The one content
conflict, `package.json`, sat on adjacent script lines; the resolution keeps both sides' `.ts` names. `tsconfig.json`
merged cleanly with both lanes' includes. `MANIFEST.sha256` was regenerated by two identical clean `build:raw` runs on
the merged tree under bun 1.4.0.

Rerun on the merged tip `4731adb`:
- Proof 1 now holds on the branch itself: `lang-guard scan .` → `2 untyped file(s): 2 .js`
  (`assets/codebase-state-dashboard/model-scorecard-interactions.js`, `bin/mister-clean.js`). Mutant: `git mv
  scripts/verify_packed_cli.ts scripts/verify_packed_cli.mjs` → `3 untyped file(s): 2 .js, 1 .mjs` (RED); restored → 2.
- Proof 2: the same scratch clone, fast-forwarded to `4731adb`, local-only tag retargeted, `pnpm install
  --frozen-lockfile && pnpm run build:raw && manifest:package:check` PASS under node 22.23.4 and bun 1.4.0, then
  `node scripts/prepare_release_archive.ts --destination <scratch>/release-out-2`: exit 0, empty stderr,
  `verification.status: pass`, `claimed_source.git_commit 4731adb04c70641dd170418fc3ce53418f10b32c`, the same
  `shell_command`. The sterile publisher run there gave the same refusal
  (`ERR_PNPM_FAILED_TO_PUBLISH … 404`, then `pnpm publish failed with status 1 and registry still lacks the version`,
  exit 1); no publication receipt; npm still lacks 7.4.0.
- Proof 3 against the new base: base `98923cb` two clean builds identical; merged tip two clean builds identical; base
  versus tip 27 of 28 identical; `MANIFEST.sha256` (`0ad62a21…` → `e7499bbc…`) differs only in `./package.json`
  (`b6b8beaa…` → `0ae448eb…`) and `./README.md` (`9777de28…` → `7d192b6a…`). `manifest:package:check` PASS (82).
- `tsc --noEmit` exit 0; `build:scorecard:check`, `build:materials:check`, `sync:cli:check`, `package:import:check`
  exit 0; `audit:public` PASS (83 files); `charter check --strict` ok; SKILL.md 19975 bytes.
- Full `pnpm run test:node` once on `4731adb` (host load 11 to 12): `Test Files  57 passed (57)`,
  `Tests  915 passed (915)`, `Duration  571.98s`, exit 0. No red to classify.

Last green: `pnpm run test:node` on `4731adb` (above). Last red: none on the tip; each mutant's RED is recorded above.
Scratch for deletion after QA: `$TMPDIR/port-release-lane/` (logs, hashes, the node 22.23.4 tarball, the dry-run scratch
clone `dryrun-src`, `release-out` and `release-out-2` with their receipts, mutant copies, the sterile HOME).

## Correction: the publisher run reached the public registry (PM ruling, 2026-11-04)

What was run: twice, once for each dry-run archive, the retained `publish_release_archive.ts` ran against the real
https://registry.npmjs.org/ under `env -i`. It ran with an empty scratch HOME and XDG config and empty user and global
npm config, after `pnpm whoami` returned unauthorized. Each run made read-only `pnpm view` requests and one
unauthenticated `pnpm publish` request, which npm rejected with 404. The PM verified that nothing was published. This
was an outward action the owner has ruled out, and its safety depended on no token being found. From now on, release
work exercises the publisher only against a fail-closed local registry URL (for example `http://127.0.0.1:9`) or a
dry-run mode, never the public registry. Finding (O-REL-PUBLISH-DRYRUN-1, next bounded slice): the publisher has no such
mode. It hard-codes `https://registry.npmjs.org/` in every `pnpm` call and in the receipt binding it enforces, and it
refuses any receipt bound to another registry. The only fail-closed route today is the one `release_path.test.ts` uses,
a fake `pnpm` placed first on PATH.

## Owner CI patch superseded (2026-11-04)

The owner's combined workflow patch, committed by the PM as `7aa83ac` against main's post-#63 `ci.yml`, supersedes
`reports/owner-ci-release-script.patch`, which is removed. It runs `node scripts/prepare_release_archive.ts`, fixes the
line-42 comment (closing O-LANG-1c), sets `persist-credentials: false` on the verify checkout and adopts charter
template v3. `ci.yml` names no `.mjs` file. After merging main `6a42b5f` (`4229d6a`) and the patch, two clean
`build:raw` runs under bun 1.4.0 are identical to each other and to the pre-patch merge build. MANIFEST differs from
main only in `./package.json` and `./README.md`. `manifest:package:check` PASS; lang-guard `2 untyped file(s): 2 .js`.

## Full test:node on 6424b77 (after main 6a42b5f and the owner patch): RED, every red classified environment

`pnpm run test:node` once on `6424b77` (host load 46 to 93 from other workloads, against 10 to 12 for the earlier
runs): `Test Files  6 failed | 53 passed (59)`, `Tests  10 failed | 915 passed (925)`, `Duration  2959.06s`, exit 1.
Rule S6 (full suite green on exact bytes) is therefore NOT met on this tip. None of the reds is caused by this lane.

| Red | Count | Classification | Evidence |
|---|---|---|---|
| `src/closeout/bundle.test.ts`, three native-gate tests | 3 | environment (load budget) | 30 s in-test timeouts. Same sha at load 12: all three pass. |
| `src/cli.test.ts` GUARD authority, `src/closeout/planning.test.ts` acceptance vocabulary | 2 | environment (load budget) | 15 s timeouts. Rerun of both files on the same sha: pass. |
| `src/closeout/execution-lease.test.ts` successor admission | 1 | environment (load) | `recorded process group PID … is alive but its process birth identity cannot be verified`. Rerun of the file: pass. |
| `scripts/run_clean_ci.test.ts` "waits for a rejected supervised run" | 1 | environment (load budget) | 116 s under load. Same sha at load 12: pass. |
| `scripts/run_clean_ci.test.ts` "cold clone" and "bounded Node-matrix timeout" | 2 | pre-existing on main in this environment | Reproduced at load 12 to 15 on this sha and on a detached baseline at origin/main `6a42b5f`, with the same messages on both (`supervised command exited 128: pnpm`; `expected 'rejected' to be 'fulfilled'`; marker `expected false to be true`). Both passed on `4731adb` at load 11 to 12. |
| `scripts/release_path.test.ts` real build in external capsule | 1 | environment (load budget), also red on main | `Test timed out in 120000ms` then `Hook timed out in 10000ms` on this sha (load 16 to 18) and on origin/main `6a42b5f` (358 s, load 16 to 20). It passed on `4731adb` at load 11 to 12. |

Last green: `pnpm run test:node` on `4731adb` (915/915). Last red: `pnpm run test:node` on `6424b77` (above). The
targeted reproduction commands are recorded under `$TMPDIR/port-release-lane/logs/` (`branch-targeted.log`,
`base-targeted.log`, `branch-release-path.log`, `base-release-path.log`, `rerun3.log`). Recommendation: one more full
suite on this exact tip when host load is back near 10 to 12, before QA dispatch.
