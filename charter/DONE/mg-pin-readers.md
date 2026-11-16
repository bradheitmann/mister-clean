# DONE: mg-pin-readers (step 1 of the charter re-pin to 98055d7, and Rust gates on their pinned toolchains)
Slice: two kinds of pinned reader in this repository do not run what their pin says.
- Charter. Hosted CI installs charter at `CHARTER_REV` cf05eb5, a superseded pin, while the local hooks resolve ef2b92e (v0.1.0). Charter's fleet pin is now 98055d7 (~/.local/share/charter/PINS.tsv, status `current`; notes ~/.local/share/charter/PIN-NOTES-2026-11-16.md). The notes' step 1 moves every reader to the new pin in one change: the CI `CHARTER_REV` and the hooks. Steps 2 (`charter init --refresh-spec`) and 3 (charter/PIN.toml and other new file shapes) are out of scope and come after this lands.
- Rust. `.github/workflows/ci.yml` ran `cargo test` and `cargo clippy` with `--manifest-path tools/<crate>/Cargo.toml` from the repository root. rustup picks the toolchain from the working directory, not from `--manifest-path`, so the gates ran on the runner's default toolchain and never on tools/campaign-observer/rust-toolchain.toml (1.95.0). On this host the same command from the root resolves 1.88.0 (`clippy 0.1.88`). tools/campaign-query has no toolchain file (STATE.md obligation, owned by S6).

Change: CI `CHARTER_REV` becomes 98055d7d3ebd679a30d417963812b39e387fcf72. The cargo steps run inside each crate's folder (`working-directory`). Each step installs the channel its rust-toolchain.toml names and refuses to continue unless `rustc --version` (and, for the observer, `cargo clippy --version`) names that channel. tools/campaign-query gets a rust-toolchain.toml at 1.95.0, and the observer's file lists the clippy component, because the minimal profile has none. At landing, the PM re-runs `charter hooks install` from the 98055d7 binary in the main checkout (the hooks are not tracked, so this is a landing step, proof 6).

Base: main 0c61895. Repair cycles: 1. QA attempts: 2. Review families: 2 (author: this PM, Claude; QA: another model maker). A second QA rejection goes to the owner under S5.

`S` below stands for the observer step's script, extracted from ci.yml:
`awk '/name: Verify campaign observer on its pinned toolchain/{f=1;next} f&&/^      - /{f=0} f&&/^          /{sub(/^          /,"");print}' .github/workflows/ci.yml > "$TMPDIR/observer-step.sh"`
`Q` is the same for `Verify campaign SQLite reader on its pinned toolchain`, written to `$TMPDIR/query-step.sh`. Both run as `bash -eo pipefail <file>`, the shell GitHub Actions uses for `run:` steps, with `$HOME/.cargo/bin` first on PATH.

Proofs (each re-openable before acceptance):
1. CI installs the current fleet pin of charter.
   - reopen: `test "$(sed -n 's/^ *CHARTER_REV: //p' .github/workflows/ci.yml)" = "$(awk -F'\t' '$2=="current"{print $1}' ~/.local/share/charter/PINS.tsv)" && echo same`, which prints `same`.
   - mutant: set `CHARTER_REV` back to cf05eb5c9a1f1768d7aed8edee087e992bd9ad16; the command prints nothing and exits 1 (RED).
2. No Rust gate in CI selects its crate by `--manifest-path`.
   - reopen: `grep -c -e '--manifest-path' .github/workflows/ci.yml` prints 0, and `grep -c 'working-directory: tools/campaign-' .github/workflows/ci.yml` prints 2.
   - mutant: restore the base line `cargo clippy --manifest-path tools/campaign-observer/Cargo.toml --all-targets --locked -- -D warnings` in the root step; the first count is at least 1 (RED).
3. Each step runs on its pinned toolchain and passes.
   - reopen: `(cd tools/campaign-query && bash -eo pipefail "$TMPDIR/query-step.sh")` and `(cd tools/campaign-observer && bash -eo pipefail "$TMPDIR/observer-step.sh")` both exit 0. Their output shows `rustc 1.95.0`, and the observer's output shows `clippy 0.1.95` and the test result lines `10 passed; 0 failed` and `15 passed; 0 failed`.
   - mutant: run the observer step with `RUSTUP_TOOLCHAIN=1.88.0` (an override that beats the toolchain file); it exits non-zero at the `rustc --version` check, and no `cargo test` output appears (RED).
4. A step run away from its crate folder refuses rather than falling back to the default toolchain.
   - reopen: `bash -eo pipefail "$TMPDIR/observer-step.sh"` run from the repository root exits non-zero before any cargo command runs (the toolchain file is not found, so the channel is empty and the version check fails).
   - mutant: n/a (this proof is itself the negative control for the `working-directory` lines).
5. Hosted CI `verify` is green on the frozen head, and the two Rust steps ran on 1.95.0.
   - reopen: `gh run view <run id> --log` for the `verify` job of the frozen head; the step `Verify campaign observer on its pinned toolchain` prints `rustc 1.95.0` and `clippy 0.1.95`, and `Verify campaign SQLite reader on its pinned toolchain` prints `rustc 1.95.0`. The job conclusion is success.
   - mutant: n/a (hosted observation; proofs 3 and 4 hold the local negatives).
6. Landing (PM, at the merge): the hooks resolve the 98055d7 binary.
   - reopen: after `~/.local/share/charter/bin/98055d7d3ebd679a30d417963812b39e387fcf72/bin/charter hooks install` in the main checkout, `… hooks status` reports no drift for pre-commit and pre-push, and the pre-push hook text names 98055d7d3ebd679a30d417963812b39e387fcf72 as its install-time binary.
   - mutant: n/a (landing step, not part of the frozen tree; QA checks only that this proof is stated and that proofs 1 to 5 do not depend on it).
7. Unchanged: `charter check --strict` is ok on the frozen head under both ef2b92e (the old pin, whose spec text is still committed) and 98055d7; `pnpm exec tsc --project tsconfig.campaign.json --noEmit` clean; `pnpm run audit:public` PASS; no tracked file outside .github/workflows/ci.yml, the two rust-toolchain.toml files and this slice's charter records changes (`git diff --name-only 0c61895 <frozen head>`).
   - reopen: the commands as named.
   - mutant: n/a (regression set).

Out of scope: `charter init --refresh-spec`, charter/PIN.toml, `[state]`, `models.authors`/`models.verifiers`, and any other new charter file shape (re-pin steps 2 and 3, a later slice). The non-required `charter` CI job's reachability (it fails as NOT CHECKED while the charter source is unreachable from the runner, the known baseline). Any Rust code change.
