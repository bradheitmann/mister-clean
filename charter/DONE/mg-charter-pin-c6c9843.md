# DONE: mg-charter-pin-c6c9843 (charter's follow-up fleet pin c6c9843, taken as one commit)
Slice: on 2026-11-16 charter announced fleet pin c6c9843bfc837e611a1d275a69d7b682f80bbd9c, which supersedes 98055d7. This repository declares its pin in charter/PIN.toml, so each reader refuses every other build: hooks installed from 98055d7 refuse a tree that declares c6c9843, and hooks installed from c6c9843 refuse the old PIN.toml line. Charter's pin notes give one order for a repository that already declares a pin: install the new hooks, move CI's revision, refresh the spec, change the PIN.toml line, check, then one commit, with no push in between. This slice follows that order.

Change (one commit, after the dispatch record):
- .github/workflows/ci.yml: the `CHARTER_REV` line names c6c9843bfc837e611a1d275a69d7b682f80bbd9c. No other line of the file changes.
- charter/PIN.toml: its one line names c6c9843bfc837e611a1d275a69d7b682f80bbd9c.
- `charter init --refresh-spec`, run with the c6c9843 build, moves charter/SPEC.md from sha256 7479871a… to 3ecb03eca8b39cb1497b7f32f9b2b553729fd824a5b0ec11d0e222e5bf20c5a4 and charter/schemas/charter-toml.schema.json from dfe291da… to 314220fea9a84fa266c3b6c295bde41210c0d5d3fa90cc6436278dfb29cf6ec7. It keeps charter/GOVERNANCE.md.
- Outside the tree: `charter hooks install`, run with the c6c9843 build, rewrites the pre-commit and pre-push hooks. Hooks live in the repository's common git directory, so the main checkout and every worktree share them.

Order of commits: this list and the dispatch record are committed while the tree still declares 98055d7, with the 98055d7 build and its hooks. The change commit and the freeze record are made with the c6c9843 build and its hooks.

No new key is set. The spec text now allows `[verification_budget] seat_evidence`; it stays unset here, which means `optional`.

Notes on earlier lists, recorded here because an accepted DONE list is not edited:
- QA-SR-D2 of mg-charter-spec-refresh (the list named a shell only for its Rust reopens) is paid here: the paragraph headed Shell covers every reopen and mutant below.
- The proofs of mg-pin-readers and mg-charter-spec-refresh name the 98055d7 build and its spec hash. They held at their frozen heads and are not reopened against a tree that contains this slice. The same will be true of this list after charter's next pin.

Base: main 363be85. Repair cycles: 1. QA attempts: 2. Review families: 2 (author: this PM, Claude; QA: another model maker). A second QA rejection goes to the owner under S5.

`C` below stands for the charter build of the pin, by its literal path: `~/.local/share/charter/bin/c6c9843bfc837e611a1d275a69d7b682f80bbd9c/bin/charter`.

Shell: every reopen and every mutant below runs from the root of a checkout of the frozen head as `bash --noprofile --norc -e -o pipefail -c '<command>'`. Hosted CI runs no step for proofs 1 to 5 (its `charter` job cannot reach the charter source). The three commands of proof 7 that hosted CI also runs have no pipe, so they behave the same under `bash -e {0}`, the shell hosted CI uses for a step with no `shell:` line.

Proofs (each re-openable before acceptance):
1. The tree declares pin c6c9843 and passes that build's strict check.
   - reopen: `cat charter/PIN.toml` prints exactly `commit = "c6c9843bfc837e611a1d275a69d7b682f80bbd9c"`. `C check --strict` exits 0, prints a line that contains `charter/PIN.toml declares c6c9843bfc83 (this binary)`, and ends with `charter: ok`.
   - mutant: `printf 'commit = "%s"\n' 98055d7d3ebd679a30d417963812b39e387fcf72 > charter/PIN.toml`; `C check --strict` exits 1 and its last line names both commits (RED).
2. Hosted CI installs charter at commit c6c9843, and no file outside charter/ and qa/ names the superseded pin.
   - reopen: `sed -n 's/^ *CHARTER_REV: //p' .github/workflows/ci.yml` prints one line, `c6c9843bfc837e611a1d275a69d7b682f80bbd9c`. `git grep -l 98055d7 -- . ':!charter' ':!qa' || echo none` prints `none`.
   - mutant: `sed -i.bak 's/CHARTER_REV: c6c9843bfc837e611a1d275a69d7b682f80bbd9c/CHARTER_REV: 98055d7d3ebd679a30d417963812b39e387fcf72/' .github/workflows/ci.yml && rm .github/workflows/ci.yml.bak`; the first command prints the 98055d7 commit and the second prints `.github/workflows/ci.yml` (RED).
3. charter/SPEC.md and the schema beside it are the texts of the c6c9843 build.
   - reopen: `shasum -a 256 charter/SPEC.md charter/schemas/charter-toml.schema.json` prints 3ecb03eca8b39cb1497b7f32f9b2b553729fd824a5b0ec11d0e222e5bf20c5a4 and 314220fea9a84fa266c3b6c295bde41210c0d5d3fa90cc6436278dfb29cf6ec7. `C init --refresh-spec` exits 0, prints `already this binary's spec` for charter/SPEC.md and `kept` for charter/GOVERNANCE.md and for the schema, and leaves `git status --porcelain` empty.
   - mutant: `git show 363be85:charter/SPEC.md > charter/SPEC.md`; the first sum differs and `C check --strict` prints a line that contains `earlier published spec` (RED).
4. The installed hooks are the c6c9843 build's and match the declared pin.
   - reopen, in the slice worktree (its hooks are the repository's): `C hooks status` exits 0, names the literal path of `C` for pre-commit and for pre-push, and ends with `charter: hooks status: match`.
   - mutant: in a fresh clone of the frozen head, which has no hooks, `C hooks status` exits 1 and ends with `drift in 2 of 2 hooks` (RED).
5. Every dispatch record in the tree still verifies under the c6c9843 build.
   - reopen: `for f in charter/.dispatch/*.json; do C gate "$(basename "$f" .json)" --verify; done; echo all-verified` prints one line that contains `verified` for each of the 10 records at the frozen head, then `all-verified`.
   - mutant: `printf '\n' >> charter/DONE/mg-pin-readers.md`; the loop stops with exit 1 at mg-pin-readers, on a line that contains `changed after mg-pin-readers was accepted`, and never prints `all-verified` (RED).
6. Hosted CI `verify` is green on the tip that holds the freeze record.
   - reopen: `gh run view -R bradheitmann/mister-clean <run id> --json headSha,jobs`; `headSha` is the pushed tip and the job named `verify` has conclusion `success`. The non-required `charter` job is expected red as NOT CHECKED, the known baseline; its colour is not part of this proof.
   - mutant: n/a (hosted observation; proofs 1 to 5 hold the local negatives).
7. Unchanged behaviour.
   - reopen: `git diff --numstat 363be85 <frozen head> -- .github/workflows/ci.yml` prints one line that starts `1	1`.
   - reopen, each exits 0: `pnpm exec tsc --project tsconfig.campaign.json --noEmit`; `pnpm run audit:public`, which prints PASS; `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run --allowOnly=false --no-file-parallelism --maxWorkers=1 --testTimeout=120000 src/closeout/inspection.test.ts -t "keeps the prospective public source tree free of private identifiers"`, 1 passed.
   - reopen: `git diff --name-only 363be85 <frozen head>` lists only .github/workflows/ci.yml, charter/PIN.toml, charter/SPEC.md, charter/schemas/charter-toml.schema.json, charter/DONE/mg-charter-pin-c6c9843.md, and charter/.dispatch/mg-charter-pin-c6c9843.json and .sha256.
   - mutant: n/a (regression set).

Landing step (PM, at the merge, not part of the frozen tree and not a proof): `C hooks status` in the main checkout prints `match`, and `C land-check origin/main..main` passes before the push.

Out of scope: setting `seat_evidence = "required"`; any new charter file shape; the non-required `charter` CI job's reachability (it fails as NOT CHECKED while the charter source is unreachable from the runner, the known baseline); a self-judge of this candidate by the installed 7.5.1 (the change touches no src/ file; the next post-merge self-judge of main covers it).
