# DONE: mg-s2b-git-runner (master-gate S2b, one git runner, including D5)
Slice: every judge git call goes through `hardenedGitArgs` and `hardenedGitEnv` today, but the spawn itself is written 28 times in 15 modules. Each copy picks its own `--no-optional-locks`, `LC_ALL`, timeout, buffer and stdio. The remote-contact invariant (S1b QA D5) lives at the two call sites instead of in the helper (A2-44, A1-4 git part). Leave one runner in src/closeout/git-hardening.ts and move every site onto it.

The argv, environment and options of every site stay as they are, apart from the declared deltas in proof 2. The runner keeps each site's child_process API (execFileSync, spawnSync, promisified execFile or spawn), so exit, throw and timeout semantics don't change. Unifying those APIs is later work (the repository snapshot, A1-4).

Base bytes: main 74e23b1. Counted there:
- 28 `hardenedGitArgs(` call sites in 15 files outside git-hardening.ts:
  - attestation.ts:533, :600
  - action-hygiene.ts:255
  - action-lifecycle.ts:177, :774, :846
  - bundle-runtime.ts:311, :312, :317, :330
  - execution-lease.ts:200
  - finding-anchors.ts:133
  - github-actions.ts:547, :560
  - native-gates.ts:579, :627, :900
  - repository-boundaries.ts:79, :138
  - repository-object.ts:85, :126
  - repository.ts:397, :416
  - semantic.ts:926, :1094
  - control-plane/runtime/evaluation-recorder.ts:240
  - metrics/codebase-complexity.ts:620
  - planning.ts:14
- 2 more spawns inside git-hardening.ts: :127 and :235.
- 19 non-test files import node:child_process.

The slice branch's first commit (the "golden commit") adds only test infrastructure and passes on base.

`R` below stands for `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run --allowOnly=false --testTimeout=120000`.
`L` stands for `MISTER_CLEAN_GIT_LEDGER=<dir> R --config vitest.ledger.config.ts`.

Repair cycles: 1. QA attempts: 2. Review families: 2. These are declared before dispatch (stop rule S1). A second QA rejection goes to the owner under S5.

Proofs (each re-openable before acceptance):
1. Every site's spawn is unchanged apart from the declared deltas (spawn ledger, differential).
   - Instrument: vitest.ledger.config.ts extends vitest.config.ts with one setup file, src/test-support/git-spawn-ledger.ts. When `MISTER_CLEAN_GIT_LEDGER` is set, it wraps node:child_process `execFileSync`, `spawnSync`, `execFile` (copying `execFile[util.promisify.custom]`, so promisified callers still receive `{stdout, stderr}`) and `spawn`. For every call whose program is `git`, it appends one JSON line per test:
     - the API name;
     - the argv;
     - the options without `env`;
     - the env, as the exact values of every `GIT_*`, `LC_*` and `LANG` key, plus the set of other keys and whether each equals the parent's;
     - the site: the first stack frame outside git-hardening.ts and test files, as file plus function name.

     Normalisation: the scratch and tmpdir roots become placeholders, and duplicate records within one test collapse to one.
   - Liveness: the ledger refuses an empty run. A run that reached fewer than all 28 base sites fails, and its report names the missed sites.
   - Run: the suites in proof 9 (node), plus src/control-plane/runtime/evaluation-recorder.test.ts, once on the golden commit and once on head, with `L`.
   - Compare: src/test-support/git-spawn-ledger-compare.test.ts applies the declared delta transforms of proof 2 to the base ledger, then requires that the transformed base and head hold the same record set for every test id.
   - reopen: `L <proof 9 node files> src/control-plane/runtime/evaluation-recorder.test.ts` on the golden commit and on head (two ledger directories), then `MISTER_CLEAN_GIT_LEDGER_BASE=<dir1> MISTER_CLEAN_GIT_LEDGER_HEAD=<dir2> R src/test-support/git-spawn-ledger-compare.test.ts`
   - mutants (each changes a recorded field, so each discriminates):
     - the runner drops `maxBuffer` from the options it passes → RED at native-gates, repository-object and the other sites that set one;
     - the runner passes `stdio: "pipe"` where repository-boundaries.ts:138 passed `"ignore"` → RED;
     - the runner stops adding `LC_ALL=C` → RED (proof 2 delta (b) is expected in the transformed base);
     - the instrument wrapper is removed → the liveness check is RED.
2. Declared deltas. Each has its own test, and the ledger transform encodes exactly these:
   - (a) `--no-optional-locks` is added at the 3 sites that lack it: repository-boundaries.ts:79, :138 and planning.ts:14. This changes argv only. Behaviour cannot change, because `hardenedGitEnv` already sets `GIT_OPTIONAL_LOCKS=0` on every call (git-hardening.ts:101), and git treats the two as equivalent. No behavioural mutant is claimed for (a); its proof is the ledger and the unit test in proof 3.
   - (b) `LC_ALL=C` is set on every call. 18 call sites gain it: the 16 listed sites that lacked it, plus git-hardening.ts:127 and :235. The 12 sites that already set it are attestation.ts:600, bundle-runtime.ts ×4, execution-lease.ts:200, native-gates.ts ×3, repository-object.ts ×2 and evaluation-recorder.ts:240. Today, the other sites inherit the operator's `LANG` and `LC_ALL` through the allowlist at git-hardening.ts:55.
   - (c) planning.ts:14 passes `-C <packageRoot>` in place of `cwd: packageRoot`, which names the same repository.
   - (d) D5 (proof 4).
   - (e) repository.ts:668 `runCommand` is deleted. It has zero callers and could spawn any program, git included, unhardened.
   - reopen: `R src/closeout/git-runner.test.ts -t "declared deltas"`
   - mutant, one per part: (a) the runner omits the flag → the argv assertion is RED. (b) It omits LC_ALL → the env assertion is RED. (c) planning keeps `cwd` → the planning argv assertion is RED. (e) Restoring `runCommand` → proof 5's guard is RED.
3. The runner owns every hardening property. src/closeout/git-runner.test.ts `-t "runner contract"` asserts:
   - argv is `[...hardened -c overrides, "--no-optional-locks", "-C", repo, ...args]`;
   - env is `hardenedGitEnv(...)` with `LC_ALL=C`, plus only these extra names: GIT_INDEX_FILE, GIT_OBJECT_DIRECTORY and GIT_ALTERNATE_OBJECT_DIRECTORIES (used by bundle-runtime.ts:317), and GIT_CONFIG_GLOBAL and GIT_CEILING_DIRECTORIES (used inside the contact helper);
   - any other extra env name, such as GIT_DIR or GIT_SSH_COMMAND, throws a typed `GitRunnerEnvError` before any spawn;
   - a parent GIT_DIR does not reach the child: a fixture where an inherited GIT_DIR would redirect `rev-parse --show-toplevel` still reports the fixture repo.
   - reopen: `R src/closeout/git-runner.test.ts -t "runner contract"`
   - mutants:
     - accept any extra env name → the GIT_DIR extra-env case is RED;
     - spread the caller's raw env in place of `hardenedGitEnv` → the inherited-GIT_DIR case is RED. Check that the fixture's GIT_DIR names a second real repository, so git really would redirect without the scrub. The test asserts that first: the unhardened control call does report the second repository.
4. D5: the remote-contact invariant lives in the helper. git-hardening.ts exports one `contactConfiguredRemote(repository, remote, ref, flags, git)`. It checks the ref, then the remote name and its configured membership, then resolves the URL, then checks the transport, and only then contacts. That transport check is the only one in the source. `hardenedRemoteUrl` and `contactRemote` stop being exported, and bundle-live-validation.ts:89-103 and bundle-action-evidence.ts:286-299 call the one helper. They map its typed errors to today's exact strings:
   - `$.successor_readiness.target_observation.remote_ref: a remote ref may not begin with '-'`;
   - `${epath}: a pushed ref may not begin with '-'`;
   - the `.remote: <message>` forms.

   The cases:
   - A configured remote whose URL is a plain local path to a fixture repository holding `refs/heads/main` is refused with `GitRemoteTransportError`, and the ledger records zero `ls-remote` spawns. This is the discriminating fixture: `git ls-remote <path>` really succeeds on it, which the test asserts first with an unhardened control call.
   - An https remote is not refused by the transport check: the contact is attempted and returns a nonzero code without throwing.
   - A ref starting with `-` is refused before any spawn at both callers, with the exact strings above.
   - An option-shaped remote name keeps the `begin with '-'` message.
   - reopen: `R src/closeout/git-runner.test.ts -t "remote contact"` and `R src/closeout/execution-safety.test.ts -t "git program keys"`
   - mutants (each checked against git's behaviour):
     - delete the transport check → the plain-path remote is contacted, and ls-remote returns the fixture's sha with code 0 → RED;
     - delete the helper's ref check → ls-remote runs, because `--end-of-options` keeps the ref from becoming an option, so no marker could ever discriminate this. The callers then report "remote ref differs from live target" or "does not establish the subject commit" instead of the exact refusal string → RED on the string;
     - delete the name's dash check → the configured-membership check still refuses, but with "not a configured remote", so the existing `/begin with '-'/` assertion at execution-safety.test.ts:459 is RED.
5. No direct git spawn outside the runner. src/backbone-single-implementation.test.ts, `describe("git runner")`, reads every tracked non-test `.ts` file under src/, scripts/ and tools/ and asserts:
   - (a) only these 7 files import node:child_process (down from 19): git-hardening.ts, action-hygiene.ts (ps, lsof), execution-lease.ts (ps), execution-supervisor.ts, native-gate-runner.ts (gates), semantic.ts (probe commands) and control-plane/runtime/cmux-visual-readback.ts;
   - (b) the literal `"git"` appears as a spawn program only in git-hardening.ts;
   - (c) in the other 6 allowed files, every spawn's program expression is on a per-file list. Base lists:
     - action-hygiene `"ps"` and `"lsof"`;
     - execution-lease `"ps"`;
     - execution-supervisor `"/bin/ps"`, `"taskkill"`, `spec.executable` and `process.execPath`;
     - native-gate-runner `"taskkill"` plus its gate spawn;
     - semantic `command`;
     - cmux-visual-readback `DEFAULT_CMUX_BINARY`.

     The dev records the exact expressions on the golden commit. A new program expression, including a variable that could hold "git", is RED;
   - (d) `hardenedGitArgs(` and `hardenedGitEnv(` are called outside git-hardening.ts only at native-gate-runner.ts (the gate environment, not a git spawn);
   - (e) scripts/ keeps its frozen per-file git-spawn counts: generate_codebase_history.ts 1, release_capsule.ts 6, verify_generated_candidate.ts 4 and verify_packed_cli.ts 5. These are self-facing release scripts, recorded as an S6 obligation. A new one is RED.

   The test prints file:line for every offender. The existing execution-safety.test.ts:686 regex guard stays.
   - reopen: `R src/backbone-single-implementation.test.ts -t "git runner"`
   - mutants (textual, so each discriminates):
     - add `import { execFileSync } from "node:child_process"` and `execFileSync("git", ["status"])` to github-actions.ts → RED on (a) and (b);
     - add `const tool = "git"; spawnSync(tool, [])` to semantic.ts → RED on (c);
     - add a fifth git spawn to scripts/verify_packed_cli.ts → RED on (e).
6. One `trackedPaths`. native-gates.ts:897 `trackedPaths` (`ls-files --cached --full-name -z`, raw bytes) is replaced by a runner-backed helper with the same argv and options. The ledger (proof 1) shows identical records. The duplicate `repositoryIdentity` (repository.ts:489 and bundle-guard-authority.ts:265) is NOT merged here, because the two are sync and port-based; it is recorded for S2e.
   - reopen: `R src/closeout/native-gates.test.ts src/closeout/native-gate-budget.test.ts src/closeout/gate-evidence-subject-change.test.ts`
   - mutant: drop `--full-name` from the helper → the proof 1 ledger comparison is RED on the argv field. No behavioural RED is claimed, because no existing test is known to call native-gates with a subdirectory root, where `--full-name` changes the output.
7. Carried declaration S2A-QA-D1. The shared encoder also refuses `undefined` and NaN inside arrays and at the top level. This is stated here because S2a's delta 2(b) named only object fields. One test per input: `canonicalJson(undefined)`, `canonicalJson(NaN)`, `canonicalJson([undefined])` and `canonicalJson([NaN])` each throw.
   - reopen: `R src/canonical-json.golden.test.ts -t "S2A-QA-D1"`
   - mutant: encode an array `undefined` as `null` in src/canonical-json.ts → RED.
8. The S1b fsmonitor, program-key, env-scrub and credential protections still hold on the new route:
   - reopen: `R src/closeout/execution-safety.test.ts` (all describes)
   - New discriminating case: src/closeout/git-runner.test.ts `-t "fsmonitor control"`. The existing fsmonitor tests have no control, so they don't prove that their marker could ever appear. The new case plants the same hook (execution-safety.test.ts:106 `plantFsmonitor`), then:
     - first asserts that an unhardened `git status` in the fixture writes the marker;
     - deletes the marker;
     - asserts that the runner's `status` call does not write it.
   - reopen: also `R src/closeout/git-runner.test.ts -t "fsmonitor control"`
   - mutant: the runner skips `hardenedGitArgs` → the marker appears → RED. If the control assertion fails on some git version (no fsmonitor query on `status`), the case is RED rather than vacuous, and the dev reports the git version instead of weakening it.
9. Regression set:
   - build the gitignored outputs first with `bun run build:raw` (bun 1.4.0), then commit the regenerated bin/mister-clean.js and MANIFEST.sha256;
   - `pnpm exec tsc --noEmit` is clean;
   - `bun run sync:cli:check` and `bun run manifest:package:check` pass;
   - `bun run audit:public` passes, and `charter check --strict` is ok;
   - node: `R src/closeout/execution-safety.test.ts src/closeout/git-runner.test.ts src/attestation.test.ts src/planning.test.ts src/closeout/action-hygiene.test.ts src/closeout/action-lifecycle.test.ts src/closeout/bundle.test.ts src/closeout/execution-lease.test.ts src/closeout/finding-anchors.test.ts src/closeout/github-actions.test.ts src/closeout/native-gates.test.ts src/closeout/native-gate-budget.test.ts src/closeout/gate-evidence-subject-change.test.ts src/closeout/repository-boundaries.test.ts src/closeout/repository-object.test.ts src/closeout/repository.test.ts src/closeout/semantic.test.ts src/closeout/semantic-native-routes.test.ts src/closeout/prepare.test.ts src/metrics/codebase-complexity.test.ts src/backbone-single-implementation.test.ts src/canonical-json.golden.test.ts src/skill-contract.test.ts` is green;
   - bun: `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun ./node_modules/vitest/vitest.mjs run --allowOnly=false src/control-plane/runtime/evaluation-recorder.test.ts` is green;
   - cargo, which hosted CI does not run (an S6 obligation; S1b's importer regression was caught only here): `cargo test --manifest-path tools/campaign-observer/Cargo.toml` and `cargo test --manifest-path tools/campaign-query/Cargo.toml` are green;
   - no test is deleted. Changed assertions are listed in the slice report with their old and new text. execution-safety.test.ts:442-534 move from `hardenedRemoteUrl` and `contactRemote` to `contactConfiguredRemote`.
   - reopen: the commands as named.
   - mutant: n/a (regression set).
10. Hosted CI `verify` passes on the frozen head. QA is dispatched only after this is green (the S6 deviation recorded in STATE).
    - reopen: `gh run view <run id> --repo bradheitmann/mister-clean --json jobs,headSha`
    - mutant: n/a (an external result, cited by run id and head sha).
11. The pre-merge self-judge. The installed judge judges the frozen candidate in the Linux judge container, and no debt class appears beyond main's known baseline: the carried semantic re-attestation, plus DEBT-NATIVE-GATE-17ED5EBED7B18D8C (the load-dependent sqlite and HTTP timeouts, owned by S6).
    - reopen: the container command and the debt list recorded in the slice report and LIFECYCLE.md.
    - mutant: n/a (comparison with the baseline).

Gates (exact commands): the commands in proofs 1-11. Paired QA comes from two model families. Repair cycles: 1. QA attempts: 2.

Out of scope (recorded obligations, not fixed here):
- Unifying the four child_process APIs and their exit semantics behind one result type, and merging the two `repositoryIdentity` implementations → S2e (repository snapshot, A1-4).
- scripts/ git spawns (16 in 4 files, self-facing) → S6. Their counts are frozen by proof 5(e).
- semantic.ts:1791 probe-command spawns (target-declared commands, not judge git) → S1c, the sandbox.
- The S1c CHQA items on pushInsteadOf and a global or system insteadOf at contact time → stay with S1c. contactRemote's isolation is unchanged here.

Decision points (decided by the PM on 2026-11-06, before dispatch): deltas 2(a)-(e) ACCEPTED (runCommand has no callers and is not reachable from any package export). (a) and (c) are argv-only; (b) is the A2-44 uniformity.

After acceptance, NOT proofs: merge into main in the canonical landing shape, with the acceptance records inside the merge commit and the trailer `Charter-Slice: mg-s2b-git-runner`. Then the post-merge self-judge, recorded in STATE, and a COST.jsonl row.
