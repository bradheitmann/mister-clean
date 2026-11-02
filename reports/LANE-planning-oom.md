# LANE planning-oom — localization in progress (no fix yet, no freeze)

Worktree `~/.config/superpowers/worktrees/mister-clean/plan-oom`, branch `fix/planning-oom` from mister-clean origin/main
`5f98f84`. Nothing written outside it; the large workspace will be read-only when I get its path.

## What the PM's artifacts say

`/var/folders/…/pmmc-prof/planning.err` + `oom2.err`: exit 134, `Ineffective mark-compacts near heap limit`, 4092 MB used
of 4128 MB at 759 s, and (per the brief) a repeating frame cycle ending in `Builtins_StringAdd_CheckNone`. Reproduced with
`--max-old-space-size=768`, faster. So it is retention plus string concatenation, not a deadline problem — the 0b0d5f15
deadline cannot catch it, as the brief says.

## Candidates examined and RULED OUT (with the call-path evidence)

- `src/canonical-json.ts:10 canonicalJson` — recursive, builds each level with `[${…join(",")}]` / `{…}` concatenation, an
  exact match for a StringAdd recursion. **Not reachable from `audit planning`**: its callers are `cli.ts:145` (prepare
  plan write), `cli.ts:590` (census write), `bundle-guard-authority.ts:125/201`, and a private copy in
  `native-gates.ts:350`. `audit planning` calls none of them.
- `src/closeout/inspection.ts:347 printableBinaryText` — `result += …` and `run += …` per byte, also an exact StringAdd
  shape. **Not reachable from `audit planning`**: only `inspection.ts:493/498` (the public-safety scan) calls it.

## Live suspects, in order

1. **Every planning artifact's full text is retained at once.** `planning-analysis/repository.ts` pushes
   `{content, path}` for every entry under every planning root into one `sources` array before assessing any of them, and
   `policy.ts` then parses each. On a 14,632-file workspace with a docs-sized corpus that is pure retention; it also
   explains why a smaller `--max-old-space-size` dies sooner.
2. **`yaml` parsing of large planning documents.** `policy.ts:3` imports `parse as parseYaml`; a large or deeply nested
   YAML/Markdown front matter goes through the yaml parser, whose own string building can produce the repeating StringAdd
   cycle the profiler saw.

Both live inside the planning path, and both are fixable by the same shape of change the brief asks for (hash/assess
incrementally, never hold or concatenate the corpus). Distinguishing them needs the heap snapshot the brief prescribes.

## Blocked on one input

The brief's step 1 says to run the source candidate on *that* workspace. I do not have its path: the PM's profile stderr
contains only dyld/libuv/libnode paths, no cwd, and the run directory is outside every repo by design. I need the absolute
path (or the recorded command line) to:
- run `--max-old-space-size=768 --heapsnapshot-near-heap-limit=1` against it read-only,
- read the snapshot's largest retained strings and their retainers,
- name the function and the input that grows it (the brief's step 1 deliverable).

Without it I can only guess between the two live suspects, and a guessed bound on the wrong step is exactly what the
earlier O-PERF-1 split told me not to do.

## Localized and fixed (unblock (c), instrumented bisection)

Temporary stderr counters (never committed; `git diff` is clean apart from the fix) in
`planning-analysis/repository.ts` (files + retained characters at the end of the walk) and
`policy.ts` (chars/ms for every parse over 200k), run under bun with a 300 s timeout on the large
workspace — **nothing is written there, it is read-only**. Counters reverted before the commit.

**The counter that grew with RSS was the corpus walk, not any single parse:**

```
before:  TRACE sources files=75,853  retained_chars=2,392,769,775  rss_mb=4,721   → peak 15,781 MB, no output
after:   TRACE sources files=5,422   retained_chars=   170,958,445  rss_mb=  502   → peak  1,997 MB, exit 0, 401 MB JSON
```
Parses were never the problem: 635 documents over 200k characters all parsed in 0–5 ms.

**Root cause.** `discoverPlanningRoots` descended into the harness's nested agent worktrees
(`.claude/worktrees/<agent>/…`). The workspace holds 13 of them, 223,468 files, each a full checkout with its own
`plans/`, `reports/<lane>/…/tasks/` and `docs/` — so a directory named `tasks` deep inside a nested checkout became a
planning root and the whole nested corpus was read into `sources[]` (2.39 B characters ≈ 4.8 GB as UTF-16), before any
assessment. Retention, exactly as suspected, but the source of the retention is nested worktrees rather than the
repository's own corpus.

**Fix.** `HARNESS_WORKTREE_DIRECTORIES` (`.agents/.claude/.codex/.cursor/.pi` + `/worktrees`) joins the Lane 3b harness
list in `isHarnessDefinitionPath`, so both the audit walk and the bundle validator prune them. Roots on the large
workspace: **126 → 9**, all inside the repository itself.

Proofs:
- `planning-roots.test.ts`: a fixture with nested `.claude/.codex/.agents` worktrees each carrying `plans/` and
  `reports/lane/tasks/` — the worktree paths are pruned, the real `plans` root is kept, and an audit over 200 artifacts
  planted in a nested worktree reports `planningRootCount ≤ 1` and `artifactCount < 200`.
  **Mutant: restore the single-list predicate → both tests RED** (`isHarnessDefinitionPath` false for a worktree path;
  `planningRootCount` 2), then restored.
- Peak memory on the real workspace, same command before/after: **15,781 MB → 1,997 MB**, and the run finishes with
  output instead of aborting at 134.

**Deviation from the unblock recipe, stated:** the fixture test pins the behaviour (nested trees pruned, corpus out of the
audited set) rather than exposing a retained-characters counter to the test. The retained-characters number is the
instrumented trace above (2,392,769,775 → 170,958,445), which is the stronger measurement but cannot be asserted from a
committed test without shipping the counter in production code.

## Rework 1 (PM review of 22110dc6): the root invariant, not one instance

1. **Generalized.** The fix is no longer a list of harness worktree paths. `isNestedCheckout(repository, directory)` refuses
   to descend into any directory below the root that holds a `.git` entry — a file (linked worktree, submodule) or a
   directory (clone) — because that is a different checkout with its own `plans/`, `tasks/`, `reports/`. The audit walk calls
   it before descending; the bundle validator applies the same rule to its row list (any `.git` row's directory prunes its
   subtree). `HARNESS_WORKTREE_DIRECTORIES` is **gone** — the `.git` rule subsumes it; `HARNESS_DEFINITION_DIRECTORIES`
   stays because a harness definition tree (`.claude/commands`, `.codex`, …) carries no `.git` and the rule does not cover it.
2. **Comment placement fixed.** The worktree note had been inserted between the existing `/** … */` JSDoc and the constant
   it documents, so that JSDoc had come to document the wrong constant. Each `/** */` block now sits directly above its own
   constant (`HARNESS_DEFINITION_DIRECTORIES`, `isNestedCheckout`), in the surrounding style.

Proofs (`planning-roots.test.ts`, 5/5):
- **Non-harness nested checkout**: `tmp/wt/.git` (a file) with `tasks/` and `plans/`, and `tmp/clone/.git/` (a directory)
  with `tasks/` — neither is discovered.
- **Near-miss control**: `tmp/notes/tasks/` with the same shape but no `.git` **is** discovered, so the rule is about
  checkouts, not about `tmp/`.
- Harness worktrees (`.claude/.codex/.agents`) still pruned, and their `.git` entries are what prune them now.
- 200 artifacts planted inside a nested worktree stay out of the audited set (`planningRootCount ≤ 1`, `artifactCount < 200`).
- **Mutant: remove the `.git` check → three tests RED** (`tmp/wt` root appears, worktree roots appear, nested corpus counted),
  then restored.

Re-measurement on the large workspace, read-only, same command (`audit planning … --json`):

| | retained characters | in-process RSS peak | process peak (time -l) | wall | exit | output |
|---|---|---|---|---|---|---|
| 22110dc6 (harness list) | 170,958,445 | 1,997 MB | — | — | 1 (findings) | 401,643,253 B |
| before any exclusion | 2,392,769,775 | 15,781 MB | — | ~13 min to OOM | 134 (OOM, no output) | 0 B |
| this rework | 170,958,445 | 1,997 MB | 6,188,974,080 B (5.9 GB) | 128 s | 1 (findings) | 401,643,253 B |

The retained-character and in-process figures are the like-for-like pair from the instrumented trace (counters reverted, not
committed). `time -l` adds the absolute process peak for the fixed build; the pre-fix run under the same instrument would
be a ~13-minute OOM run, so it is recorded from the instrumented trace instead. Planing roots on the workspace: 126 → 9
(unchanged by the generalization, which removes the name list rather than adding reach).
