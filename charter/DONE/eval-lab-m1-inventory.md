# DONE: eval-lab-m1-inventory (milestone 1 of the Eval Lab brief: a read-only inventory)
Slice: the owner's brief of 2026-11-11, "automatic coding-session evidence and Eval Lab" (relayed by the acting EXEC-PM and accepted in STATE.md), asks first for an inventory: what collector, intake and interface capability exists, what store is configured, which seams are missing, and what existing work to reuse. This slice writes that inventory and the answers the brief asks the PM for. It changes no source file, builds nothing, calls no model and starts nothing.

What is written:
- docs/EVAL-LAB-INVENTORY.md: one table of rows. Each row has an id, the capability, one status (`implemented`, `partial`, `missing` or `not applicable`), and a short note. After the table, a section headed `Answers to the brief` with six headed answers.
- docs/EVAL-LAB-INVENTORY.citations.tsv: one line per citation, tab-separated: row id, repository path, line number, and a text that must appear on that line. A header line comes first. A row with status `missing` cites the place where the capability would have to be, or the plan line that asks for it.
- Both files are in docs/, not in project/planning/: the planning audit reads every file there as a planning input and refuses a data file it cannot classify.
- Facts about the installed package and the configured local store are private. They are in `P` = `~/.local/share/agent-private/mister-clean/eval-lab/m1/INSTALLED-AND-STORE.md`, with the command behind each fact. The public table states them without any path, alias or count that identifies a project.

Row ids that must each appear exactly once:
- C1 to C7: the seven points of the brief's cross-repository contract (enroll once; capture at the harness and task boundary; local durable outbox; verify, not trust; recover safely; quality apart from route performance; private by default).
- V1 to V6: the brief's interface (repository coverage page; assignment timeline; case inbox; controlled-eval workbench; comparison page; truthful empty and error states with deep links).
- S1 to S6: the sources the brief names (FIELD-EVALS-PLAN.md; EVAL-STANDARDIZATION-PLAN.md; AGENT-EVAL-LAB.md; evaluation-intake.ts; evaluation-recorder.ts; the identity-receipt contracts).
- P1 to P3: the installed package (its command-line surface for evaluation records; its MCP surface for them; the configured store).
- H1 to H6: a capture adapter for each harness the brief lists (Claude Code, Codex, OpenCode, Droid, Pi, Grok).
- Z1: Slice Zero's offline scorer and its three record formats, as existing work to reuse.

Base: main f14ecce. Repair cycles: 1. QA attempts: 2. Review families: 2 (author: this PM, Claude, with read-only subagents of the same family collecting facts; QA: another model maker). A second QA rejection goes to the owner under S5.

`D` below stands for docs/EVAL-LAB-INVENTORY.md and `T` for docs/EVAL-LAB-INVENTORY.citations.tsv.

Shell: every reopen and every mutant below runs from the root of a checkout of the frozen head as `bash --noprofile --norc -e -o pipefail -c '<command>'`, with `~/.local/share/mise/installs/bun/1.4.0/bin` first on PATH. Hosted CI has no step for proofs 1 to 5; the commands of proof 6 that hosted CI also runs have no pipe, so they behave the same under `bash -e {0}`.

Proofs (each re-openable before acceptance):
1. Every citation resolves: the cited line of the cited file holds the cited text.
   - reopen: `awk -F'\t' 'NR>1 { cmd = "sed -n " $3 "p " $2; line = ""; cmd | getline line; close(cmd); n++; if (index(line, $4) == 0) { bad++; print "citation fails: " $1 " " $2 ":" $3 } } END { if (bad) { print "citations: FAILED " bad " of " n; exit 1 } print "citations: ok (" n ")" }' T` exits 0 and prints `citations: ok (N)` with N at least 60.
   - mutant: in a copy of the tree, add 1 to the line number of the first citation of row S4; the command exits 1 and prints `citation fails: S4` (RED).
2. Every row id of the list above is in the table exactly once, has one of the four statuses, and has at least one citation.
   - reopen: `for id in C1 C2 C3 C4 C5 C6 C7 V1 V2 V3 V4 V5 V6 S1 S2 S3 S4 S5 S6 P1 P2 P3 H1 H2 H3 H4 H5 H6 Z1; do rows=$(grep -c -E "^\| $id \| .* \| (implemented|partial|missing|not applicable) \| " D || true); cites=$(awk -F'\t' -v id="$id" 'NR>1 && $1==id' T | wc -l | tr -d ' '); [ "$rows" = 1 ] && [ "$cites" -ge 1 ] || { echo "row $id: rows=$rows citations=$cites"; exit 1; }; done; echo rows: ok` prints `rows: ok`.
   - mutant: delete the table line of row V3 from D; the command prints `row V3: rows=0` and exits 1 (RED).
3. The statuses are right for a sample the reviewer chooses.
   - reopen: the reviewer picks at least 12 rows, with at least 3 of each status that the table uses, reads the cited code and plan lines and whatever else it needs, and writes its own status for each before comparing. Its evidence file lists the 12 or more rows with both statuses. No row differs by more than a wording of the note.
   - mutant: n/a (independent review).
4. The facts about the installed package are reproducible.
   - reopen: each command that `P` lists under its heading `Installed package` is rerun and prints what `P` records for it (the version, the attestation verdict, and the presence or absence of each command and tool named in rows P1 and P2). The commands only read.
   - mutant: n/a (observation of the installed package).
5. The answers the brief asks for are present.
   - reopen: `for h in "Implemented, partial and missing" "First bounded slice, author and verifier" "Consumer API and CLI to use" "Identity and restart handling" "Interface acceptance" "Second-repository pilot and scheduling"; do grep -c -x "### $h" D | grep -q -x 1 || { echo "missing answer: $h"; exit 1; }; done; echo answers: ok` prints `answers: ok`, and each of the six sections has at least one sentence under it.
   - mutant: n/a (records).
6. Nothing else changes, and nothing private is published.
   - reopen, each exits 0: `pnpm run audit:public`, which prints `PASS (62 files)`; `bun run build:materials`, which prints `Generated 40 MCP materials`; `MISTER_CLEAN_SOURCE_DEVELOPMENT=1 node ./node_modules/vitest/vitest.mjs run --allowOnly=false --no-file-parallelism --maxWorkers=1 --testTimeout=120000 src/closeout/inspection.test.ts -t "keeps the prospective public source tree free of private identifiers"`, 1 passed; `node ~/.claude/skills/mister-clean/bin/mister-clean.js audit planning . --json`, whose output has `"status":"pass"` and no finding.
   - reopen: `git diff --name-only f14ecce <frozen head>` lists only D, T, charter/DONE/eval-lab-m1-inventory.md, and charter/.dispatch/eval-lab-m1-inventory.json and .sha256. `grep -c -E '[/]Users[/]|[.]local[/]share|agent-private' D T || true` prints 0 for both files.
   - mutant: n/a (regression set).
7. Hosted CI `verify` is green on the tip that holds the freeze record.
   - reopen: `gh run view -R bradheitmann/mister-clean <run id> --json headSha,jobs`; `headSha` is the pushed tip and the job named `verify` has conclusion `success`. The non-required `charter` job is expected red as NOT CHECKED, the known baseline; its colour is not part of this proof.
   - mutant: n/a (hosted observation).

Out of scope (recorded obligations, not fixed here): every implementation the inventory finds missing; enrolling any repository; any change to the plans the inventory reads (it records where they disagree with the source, and changes none); a self-judge by the installed 7.5.1 (no src/ file and nothing published changes).
