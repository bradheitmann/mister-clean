# DONE: gate-snapshot-local-excludes (O-GATE-SNAPSHOT-2)
Slice: the disposable native-gate snapshot is a fresh repository, so ignore rules that live only in the subject's own Git directory (`$GIT_DIR/info/exclude`) did not apply there; files ignored by them became untracked-nonignored in the snapshot and every gate was refused with "does not reproduce the exact subject repository object". Carry the subject's local exclude rules into the snapshot, and make the refusal name what differs.

1. A fixture repository with a file ignored only through `info/exclude` produces a snapshot whose repository object equals the subject's.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/closeout/gate-snapshot-local-excludes.test.ts -t "info/exclude"`
   - mutant: skip copying the exclude rules → createExecutionSnapshot throws → RED.
2. The same holds for a linked worktree subject (`git worktree add`), whose `info/exclude` is resolved through `git rev-parse --git-path info/exclude` of the common directory, not a literal `.git/info/exclude` path.
   - reopen: `… -t "worktree"`
   - mutant: read the exclude file from `<subject>/.git/info/exclude` literally → RED.
3. When the snapshot genuinely differs (a file created in the subject after `expected` was captured), the refusal still fires and now names the entry counts and the surface digests of both objects.
   - reopen: `… -t "names the difference"`
   - mutant: drop the comparison → RED.
4. Unchanged: existing native-gate tests (`src/closeout/native-gates.test.ts`), `src/skill-contract.test.ts` green; SKILL.md byte count unchanged; `tsc --noEmit`; `charter check --strict`; `audit:public`; packaged bytes double-built under bun 1.4.0 with `manifest:package:check` PASS.
   - reopen: the commands as named.
   - mutant: n/a (regression set).
