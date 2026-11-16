# DONE: mg-charter-spec-refresh (step 2 of the charter re-pin to 98055d7, and the obligations of mg-pin-readers)
Slice: mg-pin-readers (merge a353fd2) moved every reader of this repository's charter files to charter 98055d7d3ebd679a30d417963812b39e387fcf72. Charter's pin notes put the spec text second: only when no reader is on an older build may charter/SPEC.md take the new text, because the v0.1.0 build refuses it under `check --strict`. This slice takes that step and pays what mg-pin-readers left open.

Change:
- `charter init --refresh-spec`, run with the 98055d7 build, replaces charter/SPEC.md (sha256 56f03db2…, the first published text) with that build's text (sha256 7479871a8ec7dda46411154b64f335d805e87bb2232da91de815d3c89a2ef6d8) and installs charter/GOVERNANCE.md and charter/schemas/charter-toml.schema.json beside it.
- charter/charter.toml's first line named a schema path that never existed in this repository (`../schemas/charter-toml.schema.json`). It now names the installed file.
- The two Rust steps in .github/workflows/ci.yml declare `shell: bash`. GitHub then runs them as `bash --noprofile --norc -e -o pipefail {0}`; without the line it runs `bash -e {0}`, with no pipefail (QA-PR-D2 of mg-pin-readers).
- charter/DONE-TEMPLATE.md gains five rules for proofs, each from a recorded miss.

No new charter file shape is used (no `[state]` table, no `models.authors`, no DONE-LEGACY.txt): step 3 of the notes is optional and nothing here needs it.

Corrections to charter/DONE/mg-pin-readers.md, recorded here because an accepted DONE list is not edited:
- QA-PR-D1: its proof 4 said the root run fails because "the channel is empty and the version check fails". It stops one line earlier: `sed` cannot open rust-toolchain.toml and the script exits there. The claim (non-zero exit before any cargo command) held.
- QA-PR-D2: it called `bash -eo pipefail` the shell GitHub Actions uses for `run:` steps. At that commit GitHub used `bash -e {0}`. From this slice on the statement is true for the two Rust steps.
- Its proof 1 reopens against the row marked `current` in a pin table that charter rewrites. It will stop passing when charter announces its next pin, with no change here. The proofs below name the pin as a literal.

Base: main 5c8b2c2. Repair cycles: 1. QA attempts: 2. Review families: 2 (author: this PM, Claude; QA: another model maker). A second QA rejection goes to the owner under S5.

`C` below stands for the charter build of the pin, by its literal path: `~/.local/share/charter/bin/98055d7d3ebd679a30d417963812b39e387fcf72/bin/charter`.
`S` is the observer step's script and `Q` the query step's script, extracted from ci.yml as in mg-pin-readers:
`awk '/name: Verify campaign observer on its pinned toolchain/{f=1;next} f&&/^      - /{f=0} f&&/^          /{sub(/^          /,"");print}' .github/workflows/ci.yml > "$TMPDIR/observer-step.sh"` (and the same with `Verify campaign SQLite reader on its pinned toolchain`, to `$TMPDIR/query-step.sh`).
Each runs as `bash --noprofile --norc -eo pipefail <file>`, the shell hosted CI uses for these two steps once proof 4 holds, with `$HOME/.cargo/bin` first on PATH.

Proofs (each re-openable before acceptance):
1. charter/SPEC.md is the text of the 98055d7 build.
   - reopen: `shasum -a 256 charter/SPEC.md` prints 7479871a8ec7dda46411154b64f335d805e87bb2232da91de815d3c89a2ef6d8, and `C check --strict` prints `charter: ok` with no line that contains `earlier published spec`.
   - mutant: `git show 5c8b2c2:charter/SPEC.md > charter/SPEC.md`; the sum differs and `C check --strict` prints the `earlier published spec` warning (RED).
2. The files beside the spec are the build's own, and the refresh is complete.
   - reopen: `C init --refresh-spec` exits 0, prints `already this binary's spec` and `kept` for charter/GOVERNANCE.md and charter/schemas/charter-toml.schema.json, and leaves `git status --porcelain` empty.
   - mutant: append one line to charter/GOVERNANCE.md; `C init --refresh-spec` exits 1 and says the file differs from the binary's text (RED).
3. charter/charter.toml's schema line names a file that exists.
   - reopen: `test -f "charter/$(sed -n 's/^#:schema //p' charter/charter.toml)" && echo found` prints `found`.
   - mutant: put the base line `#:schema ../schemas/charter-toml.schema.json` back; the command prints nothing and exits 1 (RED).
4. Both Rust steps declare `shell: bash`.
   - reopen: `awk '/name: Verify campaign (SQLite reader|observer) on its pinned toolchain/{f=1;next} f&&/^      - /{f=0} f&&/^        shell: bash$/{n++} END{print n+0}' .github/workflows/ci.yml` prints 2.
   - mutant: delete the `shell: bash` line of the observer step; the command prints 1 (RED).
5. Hosted CI `verify` is green on the frozen head, and the two Rust steps ran under pipefail on the pinned toolchain.
   - reopen: `gh run view -R bradheitmann/mister-clean <run id> --log`; the job `verify` concludes success; each of the two steps logs `shell: /usr/bin/bash --noprofile --norc -e -o pipefail {0}` and `rustc 1.95.0`; the observer step logs `clippy 0.1.95`.
   - mutant: n/a (hosted observation; proof 4 holds the local negative).
6. charter/DONE-TEMPLATE.md carries the five rules.
   - reopen: each of these prints 1: `grep -c 'Number every proof with a whole number' charter/DONE-TEMPLATE.md`; `grep -c 'State one criterion per proof' charter/DONE-TEMPLATE.md`; `grep -c 'A reopen reads no file that another repository can rewrite' charter/DONE-TEMPLATE.md`; `grep -c 'Say which shell a reopen runs under' charter/DONE-TEMPLATE.md`; `grep -c 'The regression set names the public-safety tree test' charter/DONE-TEMPLATE.md`.
   - mutant: delete the whole-number line; the first command prints 0 (RED).
7. Unchanged behaviour.
   - reopen, each exits 0: `(cd tools/campaign-query && bash --noprofile --norc -eo pipefail "$TMPDIR/query-step.sh")`, whose output shows `rustc 1.95.0`; `(cd tools/campaign-observer && bash --noprofile --norc -eo pipefail "$TMPDIR/observer-step.sh")`, whose output shows `rustc 1.95.0`, `clippy 0.1.95`, `10 passed; 0 failed` and `15 passed; 0 failed`; `pnpm exec tsc --project tsconfig.campaign.json --noEmit`; `pnpm run audit:public`, which prints PASS; `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run --allowOnly=false --no-file-parallelism --maxWorkers=1 --testTimeout=120000 src/closeout/inspection.test.ts -t "keeps the prospective public source tree free of private identifiers"`, 1 passed.
   - reopen: `git diff --name-only 5c8b2c2 <frozen head>` lists only .github/workflows/ci.yml, charter/SPEC.md, charter/GOVERNANCE.md, charter/schemas/charter-toml.schema.json, charter/charter.toml, charter/DONE-TEMPLATE.md, charter/DONE/mg-charter-spec-refresh.md and charter/.dispatch/mg-charter-spec-refresh.json and .sha256.
   - mutant: n/a (regression set).

Landing step (PM, at the merge, not part of the frozen tree and not a proof): `C hooks status` in the main checkout prints `match`. If charter has announced a newer pin by then, it is taken in a later slice, not here.

Out of scope: charter's follow-up pin; any new charter file shape; the non-required `charter` CI job's reachability (it fails as NOT CHECKED while the charter source is unreachable from the runner, the known baseline); a self-judge of this candidate by the installed 7.5.1 (the change touches no src/ file; the next post-merge self-judge of main covers it).
