# DONE: mg-s1b-git-env-hardening (master-gate S1b)
Slice: finish the git and environment hardening that S1 QA left open. This pays the S1 QA findings F1, D2, D4, D5 and D6, plus the low-priority locator tests. The OS sandbox (rest of A3-3, and D3) is slice S1c. Every proof starts as a failing test against today's code (RED), then passes after the fix.

1. (F1) A gate can't obtain a credential through git. The gate environment sets GIT_CONFIG_NOSYSTEM=1, GIT_TERMINAL_PROMPT=0 and an empty credential.helper (through GIT_CONFIG_COUNT injection, which outranks every config file).
   - Fixture: a system or global config with a fake credential.helper that writes a marker. After a gate runs `git credential fill`, the marker is absent and no credential comes back.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/closeout/execution-safety.test.ts -t "gate git credentials"`
   - mutant: drop the injection → the marker appears (RED).
2. (D4) Target-facing git calls in the judge, and every gate, run with the inherited `GIT_*` variables removed. Only the hardening's own `GIT_*` variables are added back.
   - Fixture: the parent sets GIT_DIR, GIT_EXEC_PATH, GIT_SSH_COMMAND and GIT_CONFIG_PARAMETERS. None reaches the child.
   - reopen: `... -t "git env scrub"`
   - mutant: pass the parent's environment through → RED.
3. (D2) The hardened git helper also neutralises config keys that name a program or a command-carrying transport:
   - core.askPass, core.pager, core.editor, sequence.editor, gpg.program, gpg.*.program, core.alternateRefsCommand;
   - remote.*.vcs, url.*.insteadOf and url.*.pushInsteadOf that rewrite to an `ext::` or other command transport;
   - protocol.ext.allow (set to never).
   Validate's remote target proof resolves its remote URL from the hardened config and refuses any transport other than https or ssh.
   - Fixture: each key pointing at a marker-writing program. No marker appears after audit, prepare or validate.
   - reopen: `... -t "git program keys"`
   - mutant: remove one key from the list → RED, for every key.
4. (D5) The filter and driver enumeration fails CLOSED. If enumerating config drivers errors or times out, the protected git call is refused with a typed message instead of running without the per-name overrides. Enumeration and call use one config snapshot, not two independent reads.
   - reopen: `... -t "driver enumeration fails closed"`
   - mutant: swallow the enumeration error → RED.
5. (D6) The control-plane app removes `#session_token=` from the address (history.replaceState) immediately after reading it, and the token never appears in the history entry.
   - reopen: `node ./node_modules/vitest/vitest.mjs run control-plane-app -t "token fragment cleared"`
   - mutant: skip replaceState → RED.
6. Locator negative tests (S1 QA re-check 2): toolchainLocators doesn't derive when a home is already set in the environment, doesn't use a sibling without settings.toml, and doesn't derive when rustup's parent directory isn't named `bin`.
   - reopen: `... src/closeout/gate-toolchain-locators.test.ts -t "derivation guards"`
   - mutant: remove each guard → RED.
7. Regression set: the full `pnpm run ci:check` passes in the Linux container (the clean-CI capsule); `tsc --noEmit` is clean; `charter check --strict` is ok; no test is deleted; changed assertions are listed. Platform limit stated in the slice report: Windows keeps the directory PATH form (S1 QA).
   - reopen: the commands as named.
   - mutant: n/a.
8. Self-judge after the merge: the installed 7.5.1 judges the new main in the container, and introduced debt is paid before S1c.
   - reopen: the container command recorded in LIFECYCLE.md.
   - mutant: n/a.
