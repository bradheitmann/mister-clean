# DONE: gate-toolchain-locators (O-GATE-RUSTUP-1)
Slice: native gates run with a scrubbed environment whose HOME is an empty snapshot home. rustup resolves toolchains under `$HOME/.rustup` and cargo/go resolve dependency caches under `$HOME`, so on a rustup host every Cargo gate failed with "rustup could not choose a version of cargo … no default is configured" (self-clean cycle 2, both Cargo gates of this repository), and Go gates could not reach the module cache that `GOPROXY=off` requires. Pass the toolchain and cache locators through, resolved from the operator's environment; keep network off and HOME scrubbed.

1. With the operator's `RUSTUP_HOME`/`CARGO_HOME`/`GOPATH`/`GOMODCACHE` set, the scrubbed environment carries exactly those values; HOME stays the snapshot home.
   - reopen: `node ./node_modules/vitest/vitest.mjs run src/closeout/gate-toolchain-locators.test.ts -t "explicit"`
   - mutant: drop the locator pass-through → RED.
2. With them unset, each defaults to the conventional location under the operator's real home (`.rustup`, `.cargo`, `go`, `go/pkg/mod`) only when that directory exists; a missing directory is not invented.
   - reopen: `… -t "defaults"`
   - mutant: always set the default even when the directory is absent → RED.
3. Live control on this host: a Cargo crate gate (`cargo --version` through the rustup proxy with the scrubbed environment) succeeds with the change and fails with "rustup could not choose a version of cargo" without it.
   - reopen: `… -t "rustup"` (skipped with a stated reason when no rustup proxy is on PATH).
   - mutant: as 1 → RED on a rustup host.
4. Unchanged: network-off variables (CARGO_NET_OFFLINE, GOPROXY=off, NPM_CONFIG_OFFLINE) still set; native-gates and gate tests green; skill-contract; SKILL.md byte count; tsc; charter strict; audit:public; double build + manifest check.
   - reopen: the commands as named.
   - mutant: n/a (regression set).
