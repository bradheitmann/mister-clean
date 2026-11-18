# DONE: mg-charter-pin-69c421a (charter's fleet pin 69c421a, superseding f006adb, taken with `charter repin --commit`)
Slice: on 2026-11-17 charter announced fleet pin 69c421a16ffaa93677ade0796f302d967b3553b8, superseding f006adb (announcement ~/.local/share/charter/evidence/owner-steer-20261117/PIN-69c421a-ANNOUNCE.md; cut record cut-pin-69c421a.out beside it; pin table on charter main 8fe257f). It carries `charter repin`, `charter status`, dispatch-first, the stop-rules check, STATE's opt-in generated block, and the receipt privacy fix (an acceptance whose receipt sits outside the repository records its sha256 and no path). By the owner's decision of 2026-11-17 no owner approval is needed. Unlike f006adb, this pin refreshes the spec text: charter/SPEC.md moves from 3ecb03eca8b39cb1497b7f32f9b2b553729fd824a5b0ec11d0e222e5bf20c5a4 to 940595cc89563d23f4fdd95f9fa7eb9cc987a66dc751b74dd06e39e20fe2dd1d.

Change (one commit, made by `C --root <slice worktree> repin --commit` after the dispatch record):
- .github/workflows/ci.yml: the `CHARTER_REV` line names 69c421a16ffaa93677ade0796f302d967b3553b8. No other line of the file changes.
- charter/PIN.toml: its one line names 69c421a16ffaa93677ade0796f302d967b3553b8.
- charter/SPEC.md: refreshed by repin to the 69c421a spec text. charter/GOVERNANCE.md and charter/schemas/ are kept unchanged (repin reports both kept).
- Outside the tree: repin installs the 69c421a build's pre-commit and pre-push hooks. Hooks live in the repository's common git directory, so the main checkout and every worktree share them.

Order of commits: this list and the dispatch record are committed while the tree still declares f006adb, with the f006adb build and its hooks. The change commit (repin's) and the freeze record are made with the 69c421a build and its hooks. Records already committed that name f006adb (receipts, freeze and dispatch records, accepted DONE lists, STATE history) keep the old id. Hand-written STATE lines that name the old pin as current are rewritten in the STATE commit at the landing (STATE is rewritten after every acceptance); this repository does not adopt STATE's generated block in this slice.

Base: main 16f3357. Repair cycles: 1. QA attempts: 2. Review families: 2 (author: this PM, Claude; QA: MC/QA, pi, a non-Anthropic family). A second QA rejection goes to the owner under S5.

`C` below stands for the charter build of the pin, by its literal path: `~/.local/share/charter/bin/69c421a16ffaa93677ade0796f302d967b3553b8/bin/charter`.

Shell: every reopen and every mutant below runs from the root of a checkout of the frozen head as `bash --noprofile --norc -e -o pipefail -c '<command>'`. Hosted CI runs no step for proofs 1 to 5 (its `charter` job cannot reach the charter source). The three commands of proof 7 that hosted CI also runs have no pipe, so they behave the same under `bash -e {0}`, the shell hosted CI uses for a step with no `shell:` line.

Proofs (each re-openable before acceptance):
1. The tree declares pin 69c421a and passes that build's strict check.
   - reopen: `cat charter/PIN.toml` prints exactly `commit = "69c421a16ffaa93677ade0796f302d967b3553b8"`. `C check --strict` exits 0, prints a line that contains `charter/PIN.toml declares 69c421a16ffa (this binary)`, and ends with `charter: ok`.
   - mutant: `printf 'commit = "%s"\n' f006adbed3b89f43be8f6c79e6d791a7865cc994 > charter/PIN.toml`; `C check --strict` exits 1 and its last line names both commits (RED).
2. Hosted CI installs charter at commit 69c421a, and no file outside charter/ and qa/ names the old id.
   - reopen: `sed -n 's/^ *CHARTER_REV: //p' .github/workflows/ci.yml` prints one line, `69c421a16ffaa93677ade0796f302d967b3553b8`. `git grep -l f006adb -- . ':!charter' ':!qa' || echo none` prints `none`.
   - mutant: put back the f006adb revision on the `CHARTER_REV` line with sed into a copy; the first command prints the f006adb commit and the second prints `.github/workflows/ci.yml` (RED).
3. The build is the one charter's cut record names, and the spec text is the 69c421a text, with its companions unchanged.
   - reopen: `shasum -a 256 <the literal path of C>` prints 238d3e457ed6b0c460b2f0543a560374405f88e8e51f81e69c44a6e1d81e2d50, and `C --version` prints `charter 0.1.0 (69c421a16ffaa93677ade0796f302d967b3553b8)`. `shasum -a 256 charter/SPEC.md` prints 940595cc89563d23f4fdd95f9fa7eb9cc987a66dc751b74dd06e39e20fe2dd1d. `git diff --quiet 16f3357 <frozen head> -- charter/schemas charter/GOVERNANCE.md` exits 0.
   - mutant: `git show 16f3357:charter/SPEC.md > charter/SPEC.md`; `shasum -a 256 charter/SPEC.md` prints 3ecb03eca8b39cb1497b7f32f9b2b553729fd824a5b0ec11d0e222e5bf20c5a4, and `C check --strict` prints a line that contains `earlier published spec` (RED: a warning; this build exits 0 on it, so the RED signal is the sum and the warning line, not the exit code).
4. The installed hooks are the 69c421a build's and match the declared pin.
   - reopen, in the slice worktree (its hooks are the repository's): `C hooks status` exits 0, names the literal path of `C` for pre-commit and for pre-push, and ends with `charter: hooks status: match`.
   - mutant: in a fresh clone of the frozen head, which has no hooks, `C hooks status` exits 1 and ends with `drift in 2 of 2 hooks` (RED).
5. Every dispatch record in the tree still verifies under the 69c421a build.
   - reopen: `for f in charter/.dispatch/*.json; do C gate "$(basename "$f" .json)" --verify; done; echo all-verified` prints one line that contains `verified` for each of the 15 records at the frozen head (14 at the base plus this slice's), then `all-verified`.
   - mutant: `printf '\n' >> charter/DONE/mg-pin-readers.md`; the loop stops with exit 1 at mg-pin-readers, on a line that contains `changed after mg-pin-readers was accepted`, and never prints `all-verified` (RED).
6. Hosted CI `verify` is green on the tip that holds the freeze record.
   - reopen: `gh run view -R bradheitmann/mister-clean <run id> --json headSha,jobs`; `headSha` is the pushed tip and the job named `verify` has conclusion `success`. The non-required `charter` job is expected red as NOT CHECKED, the known baseline; its colour is not part of this proof.
   - mutant: n/a (hosted observation).
7. Unchanged behaviour.
   - reopen: `git diff --numstat 16f3357 <frozen head> -- .github/workflows/ci.yml` prints one line that starts `1	1`.
   - reopen, each exits 0: `pnpm exec tsc --project tsconfig.campaign.json --noEmit`; `pnpm run audit:public`, which prints PASS; `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run --allowOnly=false --no-file-parallelism --maxWorkers=1 --testTimeout=120000 src/closeout/inspection.test.ts -t "keeps the prospective public source tree free of private identifiers"`, 1 passed.
   - reopen: `git diff --name-only 16f3357 <frozen head>` lists only .github/workflows/ci.yml, charter/PIN.toml, charter/SPEC.md, charter/DONE/mg-charter-pin-69c421a.md, and charter/.dispatch/mg-charter-pin-69c421a.json and .sha256.
   - mutant: n/a (regression set).

Landing step (PM, at the merge, not part of the frozen tree and not a proof): `C hooks status` in the main checkout prints `match`, and `C land-check origin/main..main` passes before the push. Until the merge, the shared hooks hold every commit to a tree that declares 69c421a, so no commit lands on main or on the paused branch mg/s2e-finding-reducer before then. mg-s2e-finding-reducer merges main after this lands and before its freeze, so its tree declares the same pin as its hooks.

Out of scope: adopting STATE's generated block or VERIFY-LEGACY.txt (both optional; neither is used here); the non-required `charter` CI job's reachability (the known baseline); a self-judge of this candidate by the installed 7.5.1 (the change touches no src/ file; the next post-merge self-judge of main covers it); rewriting records that name the old id.
