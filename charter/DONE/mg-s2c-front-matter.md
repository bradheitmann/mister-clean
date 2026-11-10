# DONE: mg-s2c-front-matter (master-gate S2c, one front-matter parser, and the validator's procedure gate agrees with the audit)
Slice: Mister Clean reads the YAML front matter of a planning document with three separate parsers that disagree on what a front-matter block is (A1-2, A2-3, A2-48 part):
- bundle.ts:88-96 `declaredPlanningType`: one anchored regex, then one regex per key (artifact_type, kind, type; first match wins). Feeds the validator's executed-early/unexecuted-later gate at bundle.ts:375-376. It ignores the bundle-declared class and rationale.
- planning-analysis/policy.ts:685-702 `frontmatterRange`: line-based range. Feeds `parseSource` (:725-733, then YAML), `scanBody` (:1418, which skips the block) and, through `parseSource`, `parseArtifact` (:1920) and both contextualizers (:2535-2570).
- semantic.ts:255-264 `frontmatter`: regex pair, used by `planningRecord` (:266-278), whose callers are :325 (`missingExecutionIdentityFields`), :1206 and :1250/:1257. It runs on every tracked `.md`/`.mdx`, not only planning files.

Leave one parser (src/closeout/planning-analysis/front-matter.ts, the policy.ts form, next to lifecycle.ts), used by policy.ts and semantic.ts. Delete `declaredPlanningType`. bundle.ts takes the procedure verdict from the same classification the audit uses (policy.ts), so validate and audit stop disagreeing on the four shapes of A2-3 (D3-D6).

Base bytes: main 469d740. Counted there:
- 3 front-matter parsers; 5 delimiter-literal lines in 3 files (bundle.ts:89, policy.ts:697 and :699, semantic.ts:256 and :262). No other `---` parse exists in src/, scripts/ or tools/ (git grep, 0 further hits). The whole-file YAML/JSON parsers (policy.ts `parseStructured`, semantic.ts:269-270) are not front-matter parsers and stay (see out of scope).
- How the three disagree today (measured with a probe of verbatim copies, 40 hand rows; probe in `~/.local/share/agent-private/mister-clean/master-gate/s2c/probe/probe-parsers.ts`):

| shape | bundle.ts regex | policy.ts range | semantic.ts |
|---|---|---|---|
| BOM before opener | not framed | framed | not framed |
| CRLF | framed | framed | framed |
| missing closing delimiter | none | none | none |
| duplicate keys (same or different value) | first match wins, no error | YAML error, `parseError`, not structured | YAML error, record undefined |
| key nested under another key | not seen | parsed, not a top-level key | parsed, same |
| indented top-level key | not seen | seen | seen |
| non-string scalar (`type: 1`, `true`, `null`, `[a, b]`) | the raw text as a string | typed value | typed value |
| empty block (`---` then `---`) | not framed, but `---`,`---`,`type: x`,`---` frames across the first three delimiters | framed, root not an object, `parseError` | empty text, record undefined |
| leading blank line or `<!-- -->` comment | not framed | skipped | skipped |
| comment line followed by text on the same line | not framed | skipped as a whole line | not framed |
| closing `--- ` (trailing space) | not framed | framed | framed |
| closing `...` | not framed | not a closer | a closer |
| indented delimiters (` ---`) | not framed | framed | not framed |
| lone CR line breaks | none | none | framed |
| `kind: reference` plus `type: slice` | reads `reference` (fails open) | both keys seen, type conflict | both keys seen |

- Validator versus audit on the same document, measured on main (`probe-audit-vs-validator.ts`, `probe-compound.ts`): D3 (bundle class reference + rationale, no front matter), D4 (leading comment; closing `--- `) and D5 (`glossary.yaml`) are audit-clean and validator-blocked; D6 and a compound dispatch internal (`execution-dag.md` beside a typed `dispatch.md`) are the same; D6 is audit-blocked and validator-exempt (fail-open). A `reference` document with no rationale, or under a lane directory, is audit-blocked and validator-exempt (A2-2, owned by S3, pinned here).
- When the procedure check runs on base: only inside `if (repo && system.kind === "repo_files" && fileCensus)` (bundle.ts:318) and then `if (clean)` (:351), at :373-379. So it never runs for a validation without a repository, for a system of another kind or without a census, or for a bundle that is not CLEAN. This is pinned in proof 4a and must not change.
- Real-repo impact of the semantic grammar change, measured: of 177 tracked `.md` files in this repository, 32 start with front matter, and none has a BOM, a CR, or a `...` line in the first 59 lines.

The slice branch's first commit (the "golden commit") adds only test files and fixtures. They pass on base.

`R` below stands for `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run --allowOnly=false --no-file-parallelism --testTimeout=120000`.
`RB` stands for `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 bun ./node_modules/vitest/vitest.mjs run --allowOnly=false`.

Repair cycles: 1. QA attempts: 2. Review families: 2. These are declared before dispatch (stop rule S1). A second QA rejection goes to the owner under S5.

Reopen prerequisites (carried S2B-QA-D1). Every reopen below runs in a checkout that has (i) a git root, (ii) `bun run build:raw` done under bun 1.4.0 (the gitignored dist/ outputs; `.bun-version` pins it, and a host bun of 1.3.9 is not enough), and (iii) `pnpm install --frozen-lockfile` done. A `git archive` export has none of these; provision it first (`git init`, `git add -A`, `git commit`, then `bun run build:raw`) and record the provisioning in the evidence. This applies to every `R`/`RB` reopen, and in particular to src/backbone-single-implementation.test.ts (needs a git root), src/skill-contract.test.ts (needs dist/) and src/planning.test.ts (needs the `.git` package root).

Corpus (defined once, in src/closeout/front-matter-corpus.test-fixture.ts, 55,280 documents plus hand rows):
- Cartesian, 35,280 = 2 line endings (LF; CRLF applied to the whole document) × 9 prefixes (empty; U+FEFF; one blank line; whitespace-only line; one-line comment; multi-line comment; comment followed by text on its line; plain text line; U+FEFF then a comment) × 7 openers (`---`, ` ---`, `--- `, `---<TAB>`, `--- x`, `----`, `-- -`) × 10 blocks (empty; `type: reference`; `kind: a`+`type: b`; `type: a`+`type: b` (duplicate); nested `meta:`/`  type: a`; `type: 1`; `type: [a, b]`; `[unclosed`; a comment-only line; one space) × 7 closers (`---`, `--- `, ` ---`, `...`, `----`, `--- x`, none) × 4 tails (empty; `body`; `body`+`---`+`more`; `...`+`more`).
- Seeded, 20,000: mulberry32 seed 20261110; each document has 0 to 8 lines drawn from `---`, `--- `, `...`, empty, `type: reference`, `kind: x`, `<!-- c -->`, ` ---`, `text`, `U+FEFF---`, `a: 1`, `----`, joined with LF (70%) or CRLF (30%).
- Hand rows: the 40 named rows of the probe (one or more per shape in the table above; the D3-D6 and compound documents are the rows of proof 5).
- Grid, 3,528 = the cartesian without the block axis (2 × 9 × 7 × 7 × 4), with one fixed block per consumer. Used where a proof must go through a real public entry point and so costs more per document.

Proofs (each re-openable before acceptance):
1. The oracles are faithful to base (golden commit).
   - Setup: src/closeout/front-matter-oracles.test-fixture.ts holds verbatim copies of the three base parsers, each headed with its base path and line range at 469d740: bundle.ts:88-96, policy.ts:685-702, semantic.ts:255-264. It also holds the two compositions around them: policy `parseSource` for a non-structured extension (:725-733) and semantic `planningRecord`'s `.md` branch (:266-278), and the bundle gate expression (:375-376, `declaredType === undefined || !isNonArtifactPlanningClass(declaredType)`).
   - Layout: each oracle sits between the marker lines `// BEGIN oracle_bundle` and `// END oracle_bundle` (likewise `oracle_policy`, `oracle_semantic`), with the base lines verbatim between them and the `export` lines after the END marker.
   - Text check, three commands run under bash from the repository root; each prints nothing and exits 0 (run against a mock fixture built from the base lines on 2026-11-10, all three printed nothing):
     - `diff <(git show 469d740:src/closeout/bundle.ts | sed -n 88,96p) <(awk '/^\/\/ BEGIN oracle_bundle$/{f=1;next} /^\/\/ END oracle_bundle$/{f=0} f' src/closeout/front-matter-oracles.test-fixture.ts)`
     - `diff <(git show 469d740:src/closeout/planning-analysis/policy.ts | sed -n 685,702p) <(awk '/^\/\/ BEGIN oracle_policy$/{f=1;next} /^\/\/ END oracle_policy$/{f=0} f' src/closeout/front-matter-oracles.test-fixture.ts)`
     - `diff <(git show 469d740:src/closeout/semantic.ts | sed -n 255,264p) <(awk '/^\/\/ BEGIN oracle_semantic$/{f=1;next} /^\/\/ END oracle_semantic$/{f=0} f' src/closeout/front-matter-oracles.test-fixture.ts)`
   - Behavioural check, through the real public entry points on the golden commit:
     - policy: over the grid with the fixed block `artifact_type: story` / `story_id: S<n>` / `status: done`, `auditPlanningArtifacts([{path:"docs/x.md",content}])` has no `planning_input_unparsed` finding if and only if the oracle frames the document and its YAML parses to an object (the oracle's own prediction, no other input);
     - semantic: the grid written as 3,528 tracked files `planning/active/<n>.md` with the fixed block `role: dev` in one temporary git repository; `auditSemanticRepository` reports a missing-execution-identity row for a path if and only if the semantic oracle returns an object for that document;
     - bundle: for the 40 hand rows written as the planning file of the hardening.test.ts `prepared("cascade")` fixture with the body "implementation done; acceptance review not_run" appended, `validateBundle` returns the `executed-early/unexecuted-later` error if and only if the oracle gate says procedure.
   - The behavioural checks hold only on base (the semantic and bundle readers change by the declared deltas), so `describe("front matter oracle fidelity")` runs only when `MISTER_CLEAN_FM_BASE=1` is set and otherwise skips with a message naming the variable; the skip is expected on head. The text checks do not depend on the variable.
   - reopen: `MISTER_CLEAN_FM_BASE=1 R src/closeout/front-matter.golden.test.ts -t "front matter oracle fidelity"` on the golden commit (needs the reopen prerequisites above).
   - The golden test file is never edited after the golden commit; `git diff --quiet <golden> <head> -- src/closeout/front-matter.golden.test.ts` is part of the reopen.
   - mutant: change the policy oracle's `trim()` to no trim → the text check shows a diff and the policy behavioural check is RED. RED-checked: this mutant ("no-trim") changes the framed range on 13,273 of the 55,280 corpus documents (probe-corpus.ts, run on 2026-11-10).
2. The shared parser is byte-identical to the policy parser (differential), and policy output is unchanged end to end.
   - Assertion: for every corpus document, `frontMatterRange(doc)` deep-equals the policy oracle's range: `start`, `end` and the full `lines` array (the lines are what `scanBody` reads). `frontMatterBlock(doc)` equals `lines.slice(start + 1, end).join("\n")`, or undefined where the range is. Run under node and under bun.
   - Recorded vectors, written on the golden commit by the base code through `auditPlanningArtifacts`: the sha256 of the canonical JSON (src/canonical-json.ts) of the findings of every grid document under the fixed policy block, and of the 40 hand rows, one digest per row set. Asserted equal on head. `git diff --quiet <golden> <head> -- src/closeout/front-matter.golden.test.ts src/closeout/front-matter-oracles.test-fixture.ts src/closeout/front-matter-corpus.test-fixture.ts` shows nothing was edited.
   - reopen: `R src/closeout/front-matter.test.ts -t "front matter policy parity"` and `RB src/closeout/front-matter.test.ts -t "front matter policy parity"`, on head.
   - mutants, each RED-checked on the corpus with the probe (documents whose range differs from the base parser): drop the `trim()` on the delimiter test → 13,273; drop the comment skip → 5,468; also accept `...` as a closer → 5,448; take the last `---` instead of the first closer → 4,214; split lines on `\n` only → 0 range differences but 6,456 differences in `lines`, which is why the test compares `lines` and not only the indexes.
3. The semantic reader is identical to base except on the declared delta classes (differential).
   - Composition under test: `object(parseYaml(frontMatterBlock(doc)))`, the same composition `planningRecord` uses. Its link to the real `planningRecord` is the semantic behavioural check of proof 1 repeated on head over the same 3,528-file repository.
   - Assertion: for every corpus document, the shared composition equals the semantic oracle's record, except for documents with at least one delta class: C1 a delimiter-shaped line with leading whitespace or any U+FEFF; C2 a comment line followed by text on that line; C3 a line `...`; C4 a CR not followed by LF. A disagreement outside the classes fails and prints the document. Each class has at least one hand row that disagrees as declared in proof 4.
   - Recorded on the golden commit, asserted on head: the number of documents on which the two disagree (3,868 of 55,280 in the draft probe, all explained by C1-C4 once C1 covers a U+FEFF inside a delimiter line) and a per-class count.
   - reopen: `R src/closeout/front-matter.test.ts -t "front matter semantic parity"` and the same with `RB`, on head.
   - mutant: also accept `...` as a closer in the shared parser → the C3 rows no longer disagree as declared (5,448 range differences on the corpus) → RED. Remove the U+FEFF trim → the C1 BOM rows flip back → RED. RED-checked: same probe counts; the 61 rows that a narrower C1 (BOM only at the start) leaves unexplained were found by running the probe, which is why C1 says "any U+FEFF".
4. Declared deltas, one named test each, in `describe("front matter declared deltas")` of src/closeout/front-matter.test.ts. Each states the old result (from the oracle) and the new result:
   - Δ1 (semantic.ts reads the policy grammar). Direction: a, b widen what is read as a record; c, d narrow it.
     - Δ1a `semantic: an indented or BOM-prefixed delimiter is framed` (rows: indented-delims, bom-prefix, a U+FEFF closer).
     - Δ1b `semantic: a comment line with trailing text is skipped` (row: comment+text-same-line).
     - Δ1c `semantic: a dots line does not close the block` (rows: close-dots, close-dots-then-hr).
     - Δ1d `semantic: lone CR is not a line break` (row: lone-cr).
   - Δ2 (the validator's procedure gate takes the audit's verdict; measured on main in the header). The rule is `exempt = nonArtifact || (isNonArtifactPlanningClass(type) && no type-projection error)`, both from the policy classification of the same sources the audit gets [PM decision 1]. Direction: a, b, c, e widen the exemption; d narrows it.
     - Δ2a `validator: a bundle class reference with a rationale and no front matter is exempt` (D3).
     - Δ2b `validator: a leading comment, or a closing "--- ", does not hide the declared type` (D4, two rows).
     - Δ2c `validator: a yaml planning file is classified like the audit` (D5, glossary.yaml).
     - Δ2d `validator: a type conflict in front matter is not exempt` (D6, kind: reference plus type: slice; this closes the fail-open). The assertion is the procedure gate's verdict for that document (the `executed-early/unexecuted-later` error is present), not that the bundle is not CLEAN: the audit already blocks the document, so a CLEAN-ness assertion would stay green when the gate is wrong.
     - Δ2e `validator: a compound dispatch internal is exempt` (execution-dag.md beside a typed dispatch.md).
   - Δ3 `validator: procedure errors follow their sibling corpus errors and precede the audit findings`. The procedure check runs once all planning sources are collected, because the audit's classification depends on sibling files. The set of procedure errors, their text, and the conditions under which they are emitted do not change (proof 4a); only their position in the `errors` array moves. Pinned fixture: one system whose artifact A is a planning-text file carrying the procedure words, and whose later artifact B is not planning text and has a class that is not a non-artifact class (so the loop at bundle.ts:354-359 emits "unsupported planning entry" for B), and where the audit reports at least one finding (A with no front matter gives `planning_input_unparsed`; if the fixture produces none, stop). The test finds the three indexes `iB` (the B error), `iP` (the procedure error for A) and `iF` (the first `${path}.corpus: <finding code>` audit error) and asserts `iB < iP < iF` on head. The base relationship `iP < iB < iF` is recorded once by running the same fixture on the golden commit and keeping the log in the evidence; it is not a live assertion, because the golden test file must stay green on head. If the sibling error cannot be produced, Δ3 cannot be tested and the dev stops.
   - Δ4 is not a separate test. That `declaredPlanningType` is gone from bundle.ts is asserted by proof 6(b), and its mutant is proof 6(b)'s mutant (re-add the function to bundle.ts). Listing a second test for it would add no discrimination.
   - reopen: `R src/closeout/front-matter.test.ts -t "front matter declared deltas"` and, for Δ2/Δ3, `R src/closeout/hardening.test.ts src/closeout/bundle.test.ts`, on head.
   - mutants, one per part. RED-checked, with results:
     - Δ1a-d: route the semantic reader back to its oracle → RED (the two base parsers separate on all those rows: probe-parsers.ts, rows indented-delims, bom-prefix, comment+text-same-line, close-dots, close-dots-then-hr, lone-cr).
     - Δ2a-c, Δ2e: restore `declaredPlanningType` as the gate → RED. Run 2026-11-10 on a prototype of the rule (`~/.local/share/agent-private/mister-clean/master-gate/s2c/proto/probe-proto.ts`, a copy of policy.ts with the proposed export): the base gate and the proposed gate give opposite verdicts on exactly D3, D4a, D4b, D5, D6 and the compound row, and the same verdict on the other seven rows.
     - Δ2d: drop the type-error condition from the Δ2 rule → RED on the D6 row only. Run on the same prototype: the proposed rule blocks D6 (`kind: reference`, `type: slice`), and with the condition dropped it exempts D6 (policy `type` resolves to `reference`, and the audit reports `planning_relationship_conflict` for it). All other rows keep their verdict. Run `always-exempt` too: the slice control, the no-front-matter row (hardening.test.ts:199) and D6 flip.
     - Δ3: emit the procedure errors inside the loop again → `iB < iP` fails → RED. The mutant can fail only because of the pinned fixture; with one entry and one error, in-loop and post-loop output are identical.
4a. The procedure check is emitted under exactly the conditions of base (verdict pins; they pass on base and run in the golden commit):
   - the rows are recorded at the point where base emits, inside `repo && system.kind === "repo_files" && fileCensus` and `clean` (bundle.ts:318, :351), and the post-pass emits only for recorded rows. It is not gated on `clean && repo` afterwards, and it is not widened;
   - (a) `validateBundle` without `repoPath` for a CLEAN-claiming bundle whose corpus holds an executed-early/unexecuted-later file reports no procedure error. This is the base behaviour (the check needs file access); the pin is assertion-only, because with no repository there is no content to read and so no mutant of the emission can make it fail. The reason is recorded in the test title;
   - (a') the same file with `repoPath` but a system whose `kind` is not `repo_files` or whose `corpus.census` is absent reports no procedure error. Mutant: record the rows outside `if (repo && system.kind === "repo_files" && fileCensus)` → RED;
   - (b) the same bundle with `clean=false` (a NOT_CLEAN verdict) reports no procedure error. Mutant: record the rows outside `if (clean)` → RED;
   - (c) the control: the same file, repository, `repo_files` and census, CLEAN → the procedure error is present (hardening.test.ts:199 already does this).
   - reopen: `R src/closeout/front-matter.golden.test.ts -t "procedure check conditions"`, on the golden commit and again on head (the cases hold on both, so they live in the golden file).
   - If (a), (a') or (b) reports a procedure error on base, stop: the reading of bundle.ts above is wrong and the draft needs another pass.
5. The validator and the audit agree, through the real public surfaces, on a fixed table; the known residuals are pinned.
   - Each row is built as a planning file in the hardening.test.ts `prepared("cascade")` fixture, with the body "implementation done; acceptance review not_run", and judged by `auditPlanningArtifacts` and by `validateBundle`:
     | row | audit | validator on base | validator on head |
     |---|---|---|---|
     | reference + rationale, outside a lane directory | clean | exempt | exempt |
     | D3 | clean | blocks | exempt |
     | D4 leading comment; D4 closing `--- ` | clean | blocks | exempt |
     | D5 glossary.yaml | clean | blocks | exempt |
     | D6 | blocks | exempt | blocks |
     | compound dispatch internal | clean | blocks | exempt |
     | slice (control) | blocks | blocks | blocks |
     | no front matter, class story (control, hardening.test.ts:199) | blocks | blocks | blocks |
     | residual: reference with no rationale, lane `done/` (hardening.test.ts:210) | blocks | exempt | exempt |
     | residual: reference with rationale, lane `history/` (A2-2 D1) | blocks | exempt | exempt |
     | residual: reference with no rationale, outside a lane directory | blocks | exempt | exempt |
   - The three residual rows are pinned as known divergences owned by S3 (A2-2); S3 flips them on purpose. No existing assertion changes. All three were run on the prototype of the Δ2 rule on 2026-11-10: audit blocks (`planning_input_unparsed`), validator exempt on base and on head.
   - reopen: `R src/closeout/front-matter.test.ts -t "front matter validator parity"` on head, and `R src/closeout/hardening.test.ts` (the three existing procedure tests, :199, :210, :221, pass unchanged).
   - mutant: the gate ignores the audit and reads front matter itself (restore the base gate) → the D3-D6 and compound rows are RED. Make the gate always exempt → the slice control, the no-front-matter row and D6 are RED. Both RED-checked on the prototype, as in proof 4.
6. No second front-matter parser remains. src/backbone-single-implementation.test.ts, `describe("front matter")`, reads every tracked non-test `.ts` file under src/, scripts/, tools/, customer-tests/ and ablations/ (the same non-test filter as the other two describes, with a wider root list for this describe only; customer-tests/ and ablations/ hold no delimiter literal today, so the widening costs nothing now and lets the guard see a parser added there later) and asserts:
   - (a) a delimiter literal (a string literal `"---"` or a regex starting `^---` or `^(?:---`) occurs only in src/closeout/planning-analysis/front-matter.ts (5 lines in 3 files on base);
   - (b) no function or const named `declaredPlanningType`, `frontmatterRange` or `frontmatter` is defined outside front-matter.ts;
   - (c) the set of non-test files that import `front-matter.js` equals exactly {policy.ts, semantic.ts}: bundle.ts and every other module import nothing from it. (That the two do import it is already forced by (a), (b) and tsc: without the import they would carry their own parser or not compile.)
   - The test prints file:line for every offender.
   - reopen: `R src/backbone-single-implementation.test.ts -t "front matter"` (needs a git root).
   - mutants (textual): put `lines[0]?.trim() === "---"` into bundle.ts → RED on (a). Add `function frontmatter(` to semantic.ts → RED on (b). Add `function declaredPlanningType(` to bundle.ts → RED on (b) (this is also the mutant for Δ4). Add `import { frontMatterRange } from "../closeout/planning-analysis/front-matter.js";` to any other module, bundle.ts included → RED on (c). Put a file with `"---"` under customer-tests/ or ablations/ → RED on (a). RED-checked: the (a) pattern was run with git grep on main and returns exactly the 5 lines above, so the guard is RED on base at those lines and green only when they are gone; the dev runs the textual mutants after the migration.
7. Carried S2B-QA-D2: the spawn-ledger compare sets aside only what delta (d) changes.
   - Today `transformBase` (src/test-support/git-spawn-ledger-compare.test.ts) drops every `remote`, `get-url` and `ls-remote` record of the four DELTA_D_TESTS (8 records) on both sides, which is broader than the move of the transport check. Narrow it to an explicit list of the records that differ between base and head, keyed by test id and argv, with a count.
   - Evidence is the retained QA ledgers (`~/.local/share/agent-private/mister-clean/master-gate/s2/qa-s2b/ledger-base` and `ledger-head`; 415 base tests, 8,442 compared records at the S2b QA); no ledger is rebuilt in this slice.
   - reopen: `MISTER_CLEAN_GIT_LEDGER_BASE=<qa-s2b/ledger-base> MISTER_CLEAN_GIT_LEDGER_HEAD=<qa-s2b/ledger-head> R src/test-support/git-spawn-ledger-compare.test.ts`: 0 differences, 28 of 28 sites, with `counts.d` equal to the length of the explicit list. Needs no git root or dist/; it reads two directories.
   - mutant: in a copy of the head ledger, change one `ls-remote` record of a DELTA_D test that is not in the explicit list → RED after the change, and still green before it (that is the gap: the current compare would pass the perturbed ledger; the dev shows both runs).
   - If the PM strikes this proof [PM decision 4], S2B-QA-D2 moves to mg-s2d as its proof 0.
8. Regression set:
   - build the gitignored outputs first with `bun run build:raw` (bun 1.4.0), then commit the regenerated bin/mister-clean.js and MANIFEST.sha256;
   - `pnpm exec tsc --noEmit` is clean;
   - `bun run sync:cli:check` and `bun run manifest:package:check` pass;
   - `bun run audit:public` passes, and `charter check --strict` is ok;
   - node: `R src/closeout/front-matter.golden.test.ts src/closeout/front-matter.test.ts src/closeout/hardening.test.ts src/closeout/bundle.test.ts src/closeout/planning.test.ts src/closeout/planning-config.test.ts src/closeout/planning-roots.test.ts src/closeout/planning-deadline.test.ts src/closeout/native-gate-planning-excludes.test.ts src/closeout/semantic.test.ts src/closeout/semantic-native-routes.test.ts src/closeout/semantic-v2.test.ts src/closeout/prepare.test.ts src/closeout/execution-safety.test.ts src/backbone-single-implementation.test.ts src/canonical-json.golden.test.ts src/skill-contract.test.ts src/test-support/git-spawn-ledger-compare.test.ts` is green;
   - bun: `RB src/closeout/front-matter.test.ts` is green (the control-plane suites are untouched by this slice);
   - cargo, which hosted CI does not run (S6 obligation), each from inside its own tool directory so that its rust-toolchain.toml (1.95.0) applies; from the repository root rustup falls back to the host default 1.88: `(cd tools/campaign-observer && cargo test)` and `(cd tools/campaign-query && cargo test)` are green. The campaign-observer importer flake is a known baseline class (S2A-QA-D3, owned by S6); on a red, rerun that test alone and record both runs;
   - carried S2A-QA-D1 is not a proof of this slice: S2b already declared it and proved it (mg-s2b-git-runner proof 7, src/canonical-json.golden.test.ts `describe("S2A-QA-D1")`, accepted in the S2b receipt). Its four cases run inside the `src/canonical-json.golden.test.ts` item above, and the PM should correct the stale line in STATE.md;
   - on head the golden file's `front matter oracle fidelity` describe skips (it needs `MISTER_CLEAN_FM_BASE=1`, proof 1); the slice report counts that skip as expected and no other skip;
   - no test is deleted and no existing assertion changes. Any change is listed in the slice report with old and new text (expected: none);
   - reopen: the commands as named.
   - mutant: n/a (regression set).
9. Hosted CI `verify` passes on the frozen head. QA is dispatched only after this is green.
   - reopen: `gh run view <run id> --repo bradheitmann/mister-clean --json jobs,headSha`
   - mutant: n/a (an external result, cited by run id and head sha).
10. The pre-merge self-judge. The installed judge judges the frozen candidate in the Linux judge container, and no debt class appears beyond main's known baseline: the carried semantic re-attestation, the four `public_safety` `file-url` instances in files from main (flagged only by the pinned 7.5.1 rule), plus DEBT-NATIVE-GATE-17ED5EBED7B18D8C (the load-dependent sqlite and HTTP timeouts, owned by S6) if it recurs. The branch must be pushed first; the script clones it from the remote and refuses any other head.
    - Files: a directory `<dir>` holding `request.txt` (copy `~/.local/share/agent-private/mister-clean/master-gate/s2/selfjudge-s2b/request.txt`, edit the last line to name this slice) and `judge.sh`:
      ```
      #!/bin/bash
      set -uo pipefail
      git config --global user.email bradheitmann@users.noreply.github.com; git config --global user.name bradheitmann
      cd /home/runner && git clone -q --branch mg/s2c-front-matter https://github.com/bradheitmann/mister-clean.git c && echo "HEAD $(git -C c rev-parse HEAD) up $(git -C c rev-parse --abbrev-ref @{u})"
      [ "$(git -C c rev-parse HEAD)" = "<frozen head sha, 40 hex>" ] || { echo WRONG-HEAD; exit 2; }
      mkdir -p ev
      node /home/runner/mc/bin/mister-clean.js prepare --repo /home/runner/c --evidence-home /home/runner/ev --run-id mg-s2c-selfjudge-1 --request-ref owner-2026-11-06 --request-source /work/request.txt --mode CLOSE > /work/prepare.out 2> /work/prepare.err; echo "prepare exit $?"
      rm -rf /work/out && cp -R ev /work/out
      ```
      (This is `selfjudge-s2b/judge.sh` with the branch, the expected head and the run id replaced.)
    - Run: `docker run --rm --cpus=6 -v <dir>:/work -v ~/.claude/skills/mister-clean:/home/runner/mc:ro mister-clean-judge:7.5.0d /work/judge.sh`. The expected output ends `prepare exit 0`.
    - Read the result (the baseline list of S2b is the form to compare with):
      - `jq -r '.completion_debts[] | "\(.id) \(.cause_key.detector_family) \(.cause_key.rule // .cause_key.code)"' <dir>/out/mister-clean/mg-s2c-selfjudge-1/closeout-report.json`
      - `jq -c '.native_gate_accounting | {required_count, executed_count, passed_count, absent_count}' <dir>/out/mister-clean/mg-s2c-selfjudge-1/closeout-report.json` (every required gate executed and passed).
    - reopen: the commands above, with the frozen head sha filled in; the output directory is kept in the evidence with the DEV log.
    - mutant: n/a (comparison with the baseline).

Gates (exact commands): the commands in proofs 1-10. Paired QA comes from two model families. Repair cycles: 1. QA attempts: 2.

Out of scope (recorded obligations, not fixed here):
- The classifier itself (A2-2): lane directories and `hasPlanningSignals` make `nonArtifact` false under `history/`, `done/` and similar, and the Δ2 rule keeps the declared-type exemption beside it. S3 (one planning classifier) replaces the second clause with one `isProcedureExempt`; proof 5's three residual rows are its starting points.
- The procedure heuristic itself (A2-4: whole-file word co-occurrence, over- and under-matching) → a later slice.
- Planning-root discovery in the validator (A2-5) → S3.
- The whole-file structured parsers: policy.ts `parseStructured` rejects duplicate keys even in JSON, while semantic.ts:269-270 uses plain `JSON.parse` (last key wins). A different grammar from front matter → S2e/S3.
- The 11-name planning-root lists and the three text-extension sets (A1-2, the other parts) → S3.
- A single parse of each planning source shared by the procedure check and the audit. The second pass costs one more `parseArtifact` per planning source in CLEAN validate; the dev reports the planning-source count and the timing of bundle.test.ts before and after, and the PM records the cost in COST.jsonl.
- S2A-QA-D3 (flaky importer diagnostic) and S2A-QA-D5 (encoder template in two excluded fixtures) → S6.

Decision points (decided by the PM on 2026-11-10, before dispatch: 1 to 4 all ACCEPTED as recommended, after a DEV-seat mutant review and a QA-seat red-team of the draft):
- (1) Δ2 rule. Recommended (as written): `nonArtifact || (declared type is non-artifact && no type error)`. It closes D3-D6 and the compound case, changes no existing assertion, and leaves A2-2 to S3. Alternative: `nonArtifact` alone (the A2-3 text, full agreement). It would make hardening.test.ts:210 fail, and it reverses an accepted behaviour (clean-planning-check-reference proof 1) for reference documents with no rationale or under lane directories; those documents are already audit-blocked, so no judge-produced CLEAN bundle can contain them.
- (2) Δ1c and Δ1d narrow the semantic reader: a document closed with `...` (a standard YAML document end marker), or using bare CR line breaks, stops yielding a record. Accepted by the PM as a recorded risk with zero measured instances; the slice report must restate it. None exists in this repository (measured), and the policy form is the reference the audit already uses.
- (3) Δ3 (procedure errors move after the loop). Recommended: accept. The alternative, a per-file classification inside the loop, cannot see the sibling dispatch.md and so keeps the compound-internal disagreement.
- (4) Proof 7 (S2B-QA-D2) in or out. Recommended: in, because the retained ledgers make it test-only and about half an hour; strike it only if the slice must stay at the two parser changes.

After acceptance, NOT proofs: merge into main in the canonical landing shape, with the acceptance records inside the merge commit and the trailer `Charter-Slice: mg-s2c-front-matter`. Then the post-merge self-judge, recorded in STATE, and a COST.jsonl row.
