# Tool liveness — the instrument must be verified before it is trusted

The closeout's own tools run inside a harness the closeout did not build. A
search that hangs, an alias that shadows a binary, a snapshot that resolves
`grep` to a different program — these make every probe unreliable and turn a
fast check into a 120-second stall producing nothing. This is
mechanism-claims-more-than-it-measures applied to the closeout's own hands:
before trusting a probe's result (or its silence), verify the probe ran the
program you meant.

## 0. Bind the repository-native toolchain

Before installing dependencies or writing an inspection helper, identify the
repository's canonical package manager and runtime from policy,
`packageManager`, lockfiles, workspace configuration, and established runners.
Use that manager. `pnpm-lock.yaml` means `pnpm`; `bun.lock` plus a Bun policy
means Bun; do not run `npm install` in either and create a competing dependency
graph or lockfile. If signals disagree, resolve the conflict before install.

Prefer the repository's existing runtime or a verified OS primitive for small
probes. Path resolution, text filtering, and file enumeration do not justify
an ad hoc Python/other-interpreter script when `realpath`, `pwd -P`, `rg`,
Node/Bun, or an existing repository script already performs the operation.
When the task is removing a runtime, invocation of that runtime is itself
closeout-sensitive: permit it only for a still-live migration/validation
contract, scope it to that proof, and record why it remains necessary.

## 1. Normalize discovery tools at session start

- Prefer `rg` (ripgrep) for content search: faster, .gitignore-aware, and
  not the target of the common `grep`-shadowing aliases. Verify it exists
  (`command -v rg`); fall back deliberately if absent.
- **A bare tool name is not the tool.** Shells resolve names through
  aliases, functions, and snapshot rewrites before PATH. A known live hazard:
  a shell snapshot resolving `grep` to `ugrep`, which hangs on patterns plain
  grep answers instantly. Detect shadowing: `type -a grep` / `type -a rg` —
  if the first resolution is an alias or function, it is shadowed.
- When shadowed and you need the real program, invoke the absolute system
  binary (`/usr/bin/grep`, `/usr/bin/find`) or the verified `rg` — do not
  fight the alias, bypass it.
- **Process/name detection in a census must be portable and exact, or it
  under-reports.** `grep -E '\b(bfs|ugrep)\b'` over `ps` output is a silent
  trap: BSD/macOS grep does not honor `\b` the way GNU does, so real hung
  `ugrep`/`bfs` processes are OMITTED and a census reads "clean" while probes
  are still wedged. **Incident:** a `\b`-anchored census missed every orphaned
  `ugrep` and declared a false fixed point. Match the process's `comm`
  base-name by EQUALITY (enumerate `ps -axo pid,comm,args`, split the path,
  compare `base == 'ugrep'`), not by a word-boundary regex; do the filtering
  in code, not in a nonportable shell one-liner. Prove the census sees a
  known-present probe before trusting it to prove absence.

## 2. Time-bound every probe

Wrap discovery probes in a timeout. A probe that exceeds a few seconds on a
task Codex-class checks finish in <1s is not measuring the repository — it is
measuring a hung tool. Kill it, do not wait it out.
- **The timeout binary itself must be discovered, not assumed.** macOS ships
  no `/usr/bin/timeout`; assuming it fails with exit 127 and the probe then
  runs UNBOUNDED — the worst outcome, since the guard you added is the thing
  that broke. Resolve it once: `TO=$(command -v timeout || command -v
  gtimeout)`; if empty, use the harness's own time-bound (background + kill
  after N, or the platform run-with-deadline) or an in-process deadline —
  never fall through to an unbounded call. A time-bound that only works on
  Linux is not a time-bound.

## 3. Distinguish three causes of slowness

A slow or empty probe has three causes, and they demand different responses:

1. **Repository slowness** (genuinely large tree, cold cache) — legitimate;
   scope the probe (path filters, `--max-count`) and continue.
2. **Tool shadowing/hang** (alias, snapshot rewrite, wrong binary) — the
   instrument is broken; normalize per §1 and re-probe.
3. **Harness latency** (message/delivery, not the tool) — the work
   completed; look for the result elsewhere before re-running.

Never treat (2) or (3) as (1). A hung tool reads exactly like a slow repo and
exactly like a silent agent — the same false-negative wearing three masks.

## 4a. Normalization is INHERITED by every delegated worker

Normalizing your own shell is not enough: every subagent, reviewer, or dev you
dispatch runs in its own shell with the same shadowing hazard. A dispatch that
does not carry the tool-liveness protocol reproduces the stall in the delegate.
Every delegation prompt states: no bare `grep`/`find` (including inside pipes
— `rg ... | grep -v ...` still hangs on the shadowed `grep`); use `rg` or
absolute `/usr/bin/*`; time-bound probes; a hung probe becomes a finding,
never a stall. Verify inheritance by outcome — a worker still issuing bare
`grep` on output filtering or holdout probes is an un-normalized delegate.

**A prompt instruction is NOT a control — require a liveness handshake.**
Telling a delegate "use rg, not grep" does not verify it did; a fresh delegate
routinely hangs on its FIRST bare `find`/`grep` before it ever reads the
instruction's intent. The control is a verified handshake, not prose:

- Before any substantive work, the delegate proves its tool resolution and
  commits to safe tools — runs `type -a grep`, `command -v rg`, reports what
  resolved, and states it will use `rg`/absolute `/usr/bin/*` only. No
  handshake, no dispatch of substantive work.
- Monitor by ACTUAL COMMANDS AND OUTCOMES, not by the prompt you sent. Capture
  argv UNTRUNCATED (`ps -ww` / `ps -o command=` with no width clip — a
  truncated command line hides the very `| grep` that is hanging, and reading
  a clipped argv produces false negatives about what a process is doing).
- Intervene at the FIRST unnormalized invocation: a delegate observed issuing
  bare `grep`/`find` (including inside a pipe, `rg ... | grep -v ...`) is
  re-briefed or restarted with the handshake — not left to stall.
- **The handshake must gate the FIRST tool call, not merely precede
  "substantive" work.** A delegate's very first probe is where it hangs, so a
  handshake that is only aspirational prose fails. **Incident:** across one
  session, three freshly dispatched workers each hung on a bare `find`/`grep`
  as their first tool use despite prompts telling
  them not to — repeated live proof that instruction-as-control does not hold.
  Treat normalization as a precondition mechanically enforced before the first
  substantive tool call (handshake output required, or a wrapper that routes
  bare `grep`/`find` to `rg`/`/usr/bin/*`), and count every first-call bare
  invocation as an enforcement defect to fix, not a one-off to re-brief.

**Propagate to ALREADY-RUNNING delegates, not only future prompts.** The rule
is not deployed until every live delegate has ACKNOWLEDGED the bootstrap.
Notify each running delegate; reconcile its confirmed-stalled probe trees only
after exact owner+purpose+result proof (preserve any produced output — the
`rg` half of `rg|grep` may hold results the hung `grep` never consumed), then
rerun the probe normalized. Incomplete deployment is itself a finding: a rule
that reaches only future prompts is a rule claiming more reach than it has.

## 4b. Preserve partial evidence; replace without repeating the mechanism

- Checkpoint findings as they are produced, so a stall never zeroes the run.
- When an agent crosses a stall threshold (repeated timeouts, no verdict on a
  task peers finish quickly), retire it, preserve its partial evidence, and
  dispatch a fresh agent — **with the normalized mechanism**, never a repeat
  of the shadowed one. Replacing a stalled agent that then inherits the same
  hung tool reproduces the stall.

## 5a. Governed process-reconciliation mechanisms — use them, do not bypass

During policy discovery (Phase 0/1), identify the repository's process-
reconciliation procedures, wrappers, and hooks — a fleet guard, a `safe-kill`
wrapper, a denylist. **Invocation authorizes USING the governed mechanism with
an auditable reason; it does not authorize bypassing it with a raw signal, and
a blocking guard is not a reason to stop or ask permission.** The correct
sequence: prove eligibility (§5b four facts) → read the named local procedure →
invoke the repo's safe-kill/reconcile mechanism with the auditable reason and
its required argv-pattern/ownership/age arguments → re-enumerate. Treat it as a
hard boundary ONLY if the governed mechanism itself cannot execute (missing,
broken, refuses a proven-eligible target for a reason you cannot satisfy) —
and then it is `decision_or_coordination_required`, recorded, never a silent
raw-signal workaround. A repo-local guard blocking your raw `kill` is the
mechanism working; route through it.

## 5b. Stale-process hygiene — eligibility is ownership+purpose, not age

Tool hangs and abandoned probes leave processes behind. Enumerate processes
touching the repo at session boundaries — a clean `git status` does NOT prove
their absence, and process KIND does not prove what they hold.

**Never assume a process holds nothing.** A hung or stalled process can
retain: an index/ref lock (`.git/index.lock`, `.git/*.lock`), open file
descriptors, sockets/ports, child subprocesses, and other repo resources.
Inspect what it actually holds before deciding — do not infer "harmless" from
"looks like a search."

**Age is diagnostic evidence, never the eligibility rule.** A minutes-old
process can be definitively stale (its task stalled or completed, its result
already preserved); a long-lived process can be legitimately active. The
reaping test is a conjunction, established per process:

1. **Exact ownership — resolved from durable records, because ownership
   survives PPID orphaning.** A process whose worker died is reparented to
   PID 1: its live parent-chain no longer leads to your session, yet it is
   still yours to reconcile. So a parent-chain test ALONE both under-claims
   (misses your orphans) and a command-string match over-claims (hits
   look-alikes). **Incident:** orphaned `ugrep`/`bfs` probes at `ppid 1` were
   wrongly disowned as "ancient/not mine" on the strength of PPID and age; the
   transcript/task records proved they were current-session mc5/holdout
   probes. Resolve ownership from the DURABLE record — the task ledger and
   session transcripts that name which task spawned which probe — cross-checked
   with PID + start-time (guard against PID reuse), never from the live PPID or
   age. Re-verify at the moment of the signal.
2. **Purpose stalled or completed** — the work it was doing is abandoned or
   done, not in progress.
3. **Result preserved** — for any commit/push/write job, its effect actually
   landed (verify on the remote/tree), so reaping loses nothing.
4. **No continuing need** — nothing live depends on a resource it still holds
   (release/inherit held locks and FDs deliberately, not by force-kill
   surprise).

When all four hold, reconcile and reap the task-owned process REGARDLESS OF
AGE. When they do not, leave it and record why. Held locks are released or
inherited as an explicit step; a hung process is not made safe by assuming it
was idle.

**Reconcile TREES to a fixed point, not leaves in one pass.** A stalled
wrapper shell RESPAWNS search children — kill the leaf `ugrep`/`bfs` and the
source wrapper spawns another. One-pass leaf matching never converges. The
correct operation, per proven task-owned tree:

1. Identify the SOURCE (the stalled wrapper/shell), not just its current leaf.
2. Establish ALL FOUR eligibility facts PER TREE, affirmatively —
   **eligibility is NEVER inferred from executable class or the absence of a
   `node`/`pnpm` descendant.** A session-direct shell with no node child can
   be an active `git`, a Python task, a commit hook, or a worker mid-action.
   Required affirmative evidence: (a) exact task ownership; (b) purpose
   stalled or completed — e.g. the tree's active binary is a hung `ugrep`/
   `bfs` search idle past its answer time, or the spawning caller is gone;
   (c) result preserved or provably abandoned; (d) no continuing need (no held
   lock/FD/socket a live actor depends on). Absence of proof is a reason to
   LEAVE or QUERY the tree, never to reap it.
3. **Snapshot descendants BEFORE signaling.** Atomically capture the whole
   eligible tree's identity first — each descendant's PID + start-time +
   executable + command + purpose. Killing the parent first ORPHANS its
   children to PID 1 and DESTROYS the parent-chain ownership evidence,
   manufacturing unowned-looking debris a later pass cannot safely attribute.
4. Preserve any result, then terminate the tree COHERENTLY — by process group
   (kill the pgid) or children-before-parent — so no descendant is orphaned
   and no new child is spawned mid-teardown.
5. **Identity-bound orphan pass.** Reconcile any survivors ONLY against the
   pre-signal snapshot: match PID + start-time + executable (guard against PID
   reuse — a recycled PID with a different start-time is a DIFFERENT process,
   never reaped on the strength of the old identity). Never pattern-kill
   global PID-1 processes; only snapshot-bound descendants are eligible.
6. RE-ENUMERATE. Repeat until no PROVEN-stale owned node remains (a fixed
   point over the eligible set only), bounding total passes and logging each.
   Re-run any interrupted proof with normalized tools before concluding.

Known-stale sources may be checked individually; current or UNKNOWN wrappers
are left or queried, not swept. Classify the hung SEARCH by BINARY (`comm`) —
a `bfs` over a path containing `node_modules`/`test` is a search, not a test —
but binary class identifies the *hang*, it does not by itself establish
*eligibility*, which still needs the four affirmative facts. The monitor's own
probes use normalized primitives (no bare grep in the census) and are excluded
from its own reconciliation, or the auditor reproduces the hang it audits.

## 6. The packaging/freeze step is itself a probe — build it liveness-safe

The final "freeze" (purge litter → rebuild manifest → zip the bundle) runs the
same shadowing hazard as any search, and it runs at the moment the operator is
waiting on the deliverable — so a hang here is maximally expensive.
**Incident:** a freeze recipe used `find . \( -name '.DS_Store' ... \) -exec rm
-rf {} +` to purge litter. The bare `find` resolved to the alias-shadowed
`bfs`, which wedged; the wrapper timed out at 2 minutes, the `.DS_Store` was
never removed, and the independent checker still failed — the very defect the
freeze was meant to close, reintroduced by the freeze's own tooling. This is
§1 and §15-of-verification-doctrine (unreachable/masked work) in the packaging
lane.
**Rules for the freeze step:**
- Enumerate and delete with absolute binaries or repository-native in-process
  code, never a bare `find`/`grep`: `/usr/bin/find ... -print`, or the
  repository's existing runtime and file APIs. Do not introduce an auxiliary
  interpreter solely for cleanup.
- A shell `rm -rf` may additionally be refused by a repo's damage-control gate
  (a PreToolUse hook matching destructive patterns). Prefer `git clean -fdX`
  for ignored litter, or a precise in-process unlink per matched path through
  the repository-native file API — both are auditable and
  neither trips a blanket `rm -rf` rule.
- Build the archive from the SAME file list the manifest hashes (one
  enumeration, reused), so the packaged set and the checksummed set cannot
  diverge. Excluding `.DS_Store` and caches happens in that single enumeration.
- Verify the postcondition from fresh ground truth BEFORE claiming frozen: zero
  litter on a re-enumeration, zero `.DS_Store` entries inside the built archive
  (`zipfile.namelist()`), and the reported hash recomputed from the file on
  disk. A freeze that reports success without re-reading its own output is the
  wrapper-exit fallacy again.
- **A source-tree zero is NON-TERMINAL for OS-regenerated ephemera — prove the
  shipped artifact, not the working directory.** Finder rewrites `.DS_Store`
  into any directory it browses, so `.DS_Store` reappears in the source seconds
  after you delete it; a freeze that claimed CLEAN on a momentary source zero
  fails an audit run minutes later. **Incident:** a post-freeze audit found
  `.DS_Store` back in the package source even though the built archive was
  clean. Resolve it by CLASS, not by chasing zero: (1) PREVENT — carry a
  package `.gitignore` (`.DS_Store`, `__pycache__/`, `*.pyc`) so it never
  enters VCS; (2) EXCLUDE STRUCTURALLY — the build filters these in its single
  enumeration, so the artifact is clean regardless of transient source state;
  (3) PROVE ON THE ARTIFACT — extract the built archive to a fresh temp dir and
  assert zero `.DS_Store` in the EXTRACTED tree, after a short settle/re-check
  boundary, because the archive (not the browsed source dir) is what the
  successor receives. CLEAN is a property of the shipped artifact plus a
  standing exclusion rule — never of a source-dir snapshot that the OS will
  dirty again.
