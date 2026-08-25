# Write-lane isolation — every modifying delegate gets its own worktree

A closeout that dispatches multiple modifying delegates against ONE checkout
corrupts itself: two devs told to "branch off main" both land in the primary
working tree, their uncommitted changes mix, and a branch switch drags one
lane's work into the other's commit. **`branch off main` without a dedicated
worktree is not isolation** — it is a shared mutable buffer with no lock.

## Pre-dispatch contract (before ANY modifying delegate)

1. **Preallocate a unique worktree + branch from a recorded baseline.**
   `git worktree add <unique-path> -b <lane-branch> <baseline-sha>`. The
   baseline SHA is recorded so the lane's provenance is exact.
2. **Record the lane in the custody ledger:** owner, purpose, the path globs
   it is authorized to modify, the worktree absolute path, the branch, the
   baseline/candidate SHA.
3. **Reject the dispatch if any LIVE writer already owns an overlapping path.**
   Two lanes authorized to modify the same files is the collision, pre-empted.
   Serialize them or split the path ownership before dispatch.
4. **Prompt with the ABSOLUTE worktree path** and forbid: branch switching
   inside it, `git checkout <other-branch>`, and any write outside the
   worktree. The delegate works in exactly one tree.
5. **Require a bootstrap acknowledgment BEFORE edits:** the delegate proves
   `pwd -P`, `git rev-parse HEAD`, and `git rev-parse --abbrev-ref HEAD` match
   its assigned worktree/branch. (Compose with the tool-liveness handshake —
   one bootstrap covers both: prove tools AND prove location before work.)

## Integration closure — isolation ends in one current tree

Parallel lanes may begin from recorded baselines; the closing candidate may
not remain there while the target moves. Before a lane is accepted for final
integration, resolve the target ref again, record merge-base plus left/right
counts, and incorporate the current target by the repository's approved merge
or rebase policy. Validate the combined tree, not only the lane tip. When both
sides advanced, `git diff target..candidate` conflates target-only additions
with candidate deletions; inventory the lane from the merge base, then prove
the integrated result accounts for every target-only path and treats any
removal as an owned, proved closeout action. A lane that cannot yet integrate
remains owned in-flight state, never a clean closeout.

## Collision response (when isolation was not in place, or was breached)

1. **Freeze all writers** to the contended tree immediately.
2. **Snapshot ALL dirty + untracked state** to a durable location before any
   git operation — tracked diff as a patch, untracked files copied verbatim,
   stashes, reflog. State is volatile under active agents; label the snapshot
   by the moment it was taken (the tree may move between snapshots — a lane
   that vanished may have self-separated into a new worktree, not been lost;
   locate it via worktree list / reflog / fsck before concluding loss).
3. **Map every path to its owner** (which delegate authored which change).
4. **Separate without loss:** move each lane's changes into its own owned
   worktree/branch; never let one lane's commit include another's work.
5. **Re-verify each lane** independently after separation (owner confirms its
   file set; both trees build/test in isolation).

Isolation is cheaper than separation: preallocating worktrees costs a command
per dispatch; untangling a mixed tree risks losing uncommitted work under
live agents. Pay the cheap cost.
