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
