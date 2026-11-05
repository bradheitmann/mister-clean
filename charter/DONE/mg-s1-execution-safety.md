# DONE: mg-s1-execution-safety (master-gate S1)
Slice: the judge must not hand a target repository the operator's powers. This slice pays the 2026-11-05 master-gate findings A3-3, A3-8 and A3-9, plus the S0 QA obligations D5 and D6. Every proof starts as a failing test written against today's code (RED), then passes after the fix.

1. Native gates and validate's live reruns run with a minimal PATH. The PATH holds only the directories of the resolved toolchain executables (node, bun, pnpm, npm, cargo, rustc, rustup, go, git, sh), each resolved once at start. Credential CLIs on the operator's PATH (for example doppler, op, gh, aws, gcloud) are not reachable by name from inside a gate.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/closeout/execution-safety.test.ts -t "minimal path"`
   - mutant: pass the operator's PATH through → a fixture gate that runs `command -v <fake-credential-cli>` finds it (RED).
2. Gates never see the operator's real CARGO_HOME or RUSTUP_HOME credentials. The CARGO_HOME a gate sees has no `credentials` or `credentials.toml`, and no registry token comes from the environment. The offline registry cache stays readable, so `--locked` offline builds still work.
   - reopen: `... -t "cargo credentials"`
   - mutant: pass the real CARGO_HOME → the fixture gate reads a planted credentials.toml (RED).
3. Every git call against a target runs with config that can't execute code. That means `core.fsmonitor`, `core.hooksPath`, `core.sshCommand`, `diff.external`, `filter.*` and `credential.helper` are neutralised for the call, with GIT_CONFIG_NOSYSTEM set. A target whose .git/config sets `core.fsmonitor` to a marker-writing script leaves no marker after `audit`, `prepare` or `validate`.
   - reopen: `... -t "git config hardening"`
   - mutant: drop the neutralising flags from the git runner → the marker appears (RED).
4. The control-plane `GET /session` refuses without the same bearer token that guards `/rpc`, and `/control-plane/snapshot.json` is unreadable without a valid session.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/control-plane/runtime/http.test.ts -t "session auth"`
   - mutant: remove the token check → the unauthenticated request gets a session (RED).
5. (S0 D5) Explicit `--trust-policy-sha256` pins REPLACE the environment pin; they never add to it. The environment pin applies only when no CLI pin is given.
   - reopen: `... src/closeout/trust-root.test.ts -t "pin precedence"`
   - mutant: union the two sets → RED.
6. (S0 D6) The VALIDATE receipt's digests are computed from the exact bytes that were validated, read once and held, never re-read from disk after validation.
   - reopen: `... -t "receipt binds validated bytes"`
   - mutant: re-read from disk after validation, with the fixture swapping the file in between → RED.
7. Regression set: the full `pnpm run ci:check` passes in the Linux container; `tsc --noEmit` is clean; `charter check --strict` is ok; no test is deleted; changed assertions are listed in the slice report.
   - reopen: the commands as named.
   - mutant: n/a.
8. Self-judge after the merge: the installed 7.5.1 judges the new main in the container, and introduced debt is paid before S2.
   - reopen: the container command recorded in LIFECYCLE.md.
   - mutant: n/a.
