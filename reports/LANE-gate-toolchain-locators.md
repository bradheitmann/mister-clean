# Lane report: gate-toolchain-locators (O-GATE-RUSTUP-1)
Author: PM-MISTER-CLEAN (Claude). Base main a1f39eb. DONE list charter/DONE/gate-toolchain-locators.md (committed first, 0c06fa0).

## Finding (self-clean cycle 2)
With 7.4.0 the gates finally ran on this repository, and both Cargo gates failed with "rustup could not choose a version of cargo to run … no default is configured". `scrubbedEnvironment` replaces HOME with an empty snapshot home and passes only PATH and locale through; rustup resolves toolchains under `$HOME/.rustup`, cargo its registry under `$HOME/.cargo`, and Go its module cache under `$HOME/go` (which `GOPROXY=off` makes mandatory). So every Cargo gate was impossible on a rustup host, and Go gates could not reach their cache.

## Change
`toolchainLocators()` in src/closeout/native-gate-runner.ts: RUSTUP_HOME, CARGO_HOME, GOPATH, GOMODCACHE take the operator's value when set, otherwise the conventional directory under the operator's real home when it exists (never invented). `scrubbedEnvironment` spreads them in; HOME stays the snapshot home; CARGO_NET_OFFLINE / GOPROXY=off / NPM_CONFIG_OFFLINE unchanged.
Trade-off, stated: gates now read the operator's toolchain and dependency caches, the same class of input as the copied node_modules they already use; network stays off.

## Proofs (src/closeout/gate-toolchain-locators.test.ts, 3/3) and mutants
| # | Proof | Mutant | Observed |
|---|---|---|---|
| 1 | explicit locators pass through; HOME scrubbed; offline vars intact | pass-through removed | RED |
| 2 | defaults only for existing directories | defaults always set | RED |
| 3 | live: `cargo --version` through the rustup proxy in the scrubbed env exits 0 | pass-through removed | RED with exactly "rustup could not choose a version of cargo" (cycle-2 error reproduced) |
Restore verified by hash (f9a785766f3e).

## Gates
Double clean build:raw under bun 1.4.0 identical (bin d083e60a…, MANIFEST fc423fb2…; dist unchanged); manifest:package:check PASS; tsc; audit:public PASS; charter strict ok; locators + native-gates + gate-evidence + skill-contract 76/76; SKILL.md 19,975 bytes.
