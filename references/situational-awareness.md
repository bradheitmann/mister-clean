# Situational Awareness — establish the systems before touching the repo

This skill runs inside orchestration and management systems it did not choose,
for a successor team whose systems it cannot predict. Acting before
establishing the four axes below produces confident work aimed at the wrong
target. Detect what you can; **ask the user what you cannot detect** — one
round of questions is cheaper than one wrong sweep.

## Axis 1 — Planning system

**Questions:** Where do planning artifacts live? What lifecycle lanes exist?
What schema and templates govern each artifact type? What validates them?

**Detection:**

```
# artifact store candidates
ls project/planning/ planning/ docs/planning/ .plan/ 2>/dev/null
# lanes
ls project/planning/slices/ 2>/dev/null        # backlog/todo/active/done...
# templates and validators
/usr/bin/find . -path ./node_modules -prune -o -name "*template*" -print 2>/dev/null | /usr/bin/head   # absolute find: a bare `find` may be alias-shadowed to bfs and hang (see tool-liveness §1)
ls .git/hooks/ scripts/ci/ .github/workflows/ 2>/dev/null
```

**Example — file-based planning** (one instantiation of the primitives, not a
dependency): artifacts may live under `planning/` with `epics/`, `stories/`,
and lifecycle lanes such as `work/{backlog,active,done,archived}/`; YAML
frontmatter schemas; paired implementation/review templates; validators run by
an established local gate plus CI. When such a system is present, **read the
canonical templates before judging conformance** and run its validators rather
than inventing checks.

**Other instantiations:** Linear or similar trackers (artifacts live outside
the repo — the census must query the tracker's API/export, and "uniformity"
means field discipline, not file format); GitHub Issues/Projects; plain
documents. Whatever the system, the skill operates on the same primitives:
**artifact store · lifecycle lanes · schema · validators**. Identify all four
explicitly in the report; never assume the folder layout.

**Schema-first rule:** before reporting any integrity failure, verify the
field you checked is the field the schema uses. A parentage check that reads
`parent_id` on an artifact type whose schema links by `story_id` + `epic_id`
reports 100% failure on a perfectly healthy corpus.

## Axis 2 — Orchestration topology

**Questions:** Who works in this repo and how? One harness with subagents?
Multiple terminal surfaces with parallel agents? A fleet manager or external
orchestrator?

**Why it matters:**

- **Worktree ownership.** In multi-agent sessions, worktrees belong to live
  agents. Mid-session, never prune a worktree you cannot prove abandoned; at
  session close, every worktree must be gone — which means agents finishing
  work must clean up as part of finishing.
- **Process ownership.** Multiple harnesses mean multiple process trees
  touching the repo. Before killing anything: walk the parent chain to a
  session you own, re-verified in the same execution as the kill. A matching
  command string is not ownership.
- **In-flight state.** "Nothing actionable" can only be declared after
  checking every surface's in-flight work, not just your own.

## Axis 3 — Management layer

**Questions:** Is a management system directing the work through receipts,
delegation packets, session reports, or closeout checklists? Or is the harness
self-directed?

**If present:** session close must also satisfy the management layer's
closeout artifacts, and hygiene findings that implicate the *system* rather
than the repository should be routed to that system's durable intake, not
patched silently downstream.

**If absent:** the report itself is the closeout artifact; make it durable in
the repo or the location the operator designates.

## Axis 4 — Enforcement

**Questions:** What hooks, CI gates, allowlists, and policy files exist? What
does each actually measure, and which route does each cover?

**Rules learned the hard way:**

- **Run the repo's own gates; never re-derive them.** Your reimplementation
  will drift from the real one and certify the wrong thing.
- **Map gates to routes.** A pre-commit hook does not run on merge commits
  (`pre-merge-commit` does), and nothing local covers a fast-forward. A gate
  that covers one route while work flows through another is absent where it
  matters.
- **Never bypass.** No `--no-verify`. A blocking gate is right until proven
  defective, and a defective gate is fixed through governed change with
  independent review — not routed around at 4am.
- **Know each gate's inputs.** A gate reading gitignored or machine-local
  state (local tool configuration, private evidence bundles) measures the machine, not the
  commit. Record scope honestly: a green from such a gate is not a property of
  the repository.

## The successor rule

The current stack (harness, validators, management layer) is **temporary**.
The next team may run entirely different tooling, with none of the current
session's hooks or orchestration surfaces.

Therefore: every hygiene decision optimizes for **a reader with none of your
systems**. Self-contained entry-point docs (no absolute paths, no
tool-specific instructions without generic equivalents). Standards implied by
the uniform corpus, not just enforced by hooks. Counts and claims verified at
a named commit so they can be re-verified by anyone, with anything.
