# Successor-Readiness — the closure contract

This reference exists because a field audit proved the gap: a repository can
have regular identifiers, systematic pairing, durable verdicts, and green
gates — and still fail takeover, because **too many artifacts appear current
while describing different points in time or different meanings of "state."**
Tidiness and provenance are necessary; they are not closure. The target:

> A new agent reads ONE current-state artifact, verifies ONE receipt, sees
> every live worktree and its owner, understands which local evidence is
> intentionally absent, and can name the next safe action — without
> reconstructing history from contradictory documents.

Everything below is MUST unless marked SHOULD.

## 1. Snapshot and custody

1. **Freeze and rebind at both ends.** At start AND immediately before
   declaring completion, record: timestamp, HEAD, all branches, upstream
   divergence, every worktree, stashes, staged/unstaged files, nonignored
   untracked files. If state changed during the run, label every finding by
   snapshot — never silently mix observations from different states.
2. **Inventory ALL worktrees, not only the current checkout.** Every dirty or
   unmerged worktree maps to: artifact, owner, branch, candidate SHA, and
   disposition. An unmapped dirty worktree fails the close. A clean-looking
   primary checkout must never mask the others.
3. **Separate four truth classes and never conflate them:**
   - committed repository truth;
   - ignored local evidence (legitimate to keep local — see §5);
   - imported/external protocol state (symlinked systems, external task
     lists);
   - observed runtime/deployment state.
   A claim sourced from one class must not be reported as another.
4. **Zero nonignored untracked items, or an exact explained manifest.** Never
   delete or commit ignored evidence merely to reach zero.

## 2. Planning lifecycle reconciliation — projections must agree

5. **Coherence across every projection of the same fact:** physical lane ↔
   frontmatter ↔ body status blocks ↔ parent (story) tables ↔ grandparent
   (epic) tables/counts. Where history matters, it lives in a **clearly
   labeled history section** excluded from current-state reading — historical
   prose beside current-state fields, unlabeled, is a defect.
6. **Validate every lane — including done, backlog, and archived.** "Done"
   implies finalized current metadata and a closure record. "Archived" stays
   connected to the canonical graph (machine-readable id linkage, not only a
   human wrapper).
7. **Projections are DERIVED, not hand-maintained.** Child tables and counts
   in parent artifacts are generated from the children (or verified equal to
   such a generation). A hand-edited rollup is stale the day it is written.
8. **Close the cascade — and PAY it.** When all of a parent's children reach
   done, the parent's acceptance step (story review, holdout execution) is
   OPEN, PAYABLE completion debt like any other: pay it by dispatching the
   review through the system's own mechanism, honoring independence rules and
   the operator's pacing/concurrency rulings. "It is a lot of reviews" is a
   size observation, not a deferral basis, and neither is session length:
   THE SKILL'S JOB IS TO PAY THE DEBT. Keep dispatching within the operator's
   pacing ceiling until it is paid. The queue exists to ORDER the payment,
   never to excuse stopping; stopping short requires a named blocker or an
   operator interrupt, and the receipt then says NOT CLEAN with exactly what
   remains and who owns it.
   Per-item exceptions, narrowly: an acceptance whose PRECONDITIONS cross an
   operator hard boundary (live deployment, real-connector operation) is
   `blocked` with the boundary named; and remediation arising from a FAILED
   acceptance is new implementation work for the normal finding→fix pipeline
   — the acceptance run that surfaced it was still closeout's debt to pay.
9. **A pre-execution parent state (DRAFT or equivalent) with started
   children is a contradiction** — reject it unless an explicit, time-bounded
   exception is recorded on the parent.
10. **Supersession archives the whole graph as a unit:** parent, children,
    holdout/acceptance artifacts, and the references from dispatches,
    remediation, and launch criteria — with a tombstone and successor pointer
    at every layer. Partial archival leaves a graph that lies.

## 3. Finalize completed artifacts

11. **No unfinished current markers in done artifacts.** Unchecked acceptance
    boxes, `PENDING` approvals, `<unassigned>` fields, stale body status
    blocks, broken evidence paths, and contradictory current-state prose are
    resolved or explicitly dispositioned. (Unchecked boxes in templates or
    genuinely-open work are fine; in a completed record they assert
    non-performance beside a verdict that says otherwise.)
12. **History preserved without masquerading.** Append-only amendments are
    correct — AND the operational header (status, owner, session, evidence
    pointers) is normalized afterward so the artifact's top reads current.
13. **Temporal sanity:** created ≤ claimed ≤ updated ≤ verdict, with
    documented exceptions only.

## 4. Current-state and handoff surfaces

14. **One harness-neutral CURRENT-STATE artifact**, generated from git,
    worktrees, planning lanes, durable verdicts, review queues, and
    unresolved gates. Committed, or generated by a required cross-harness
    command — never dependent on one harness's hook. If the repo already
    declares such an artifact (a `_STATUS`-class index), it must EXIST,
    its generator must actually work (its input directories and glob
    patterns must match reality), and its generation path must be
    harness-neutral.
15. **Every current/start-here/READY directive must be fresh.** Baseline
    SHAs, branch names, path preflights, and counts inside anything that
    presents as executable must match the closing snapshot — or the artifact
    is retired (see 16). Broken references from live artifacts to missing
    files (guides, north stars, renamed stories) are defects of this class.
16. **Retire or quarantine expired dispatches, audits, and readiness
    documents.** Historical material announces its status BEFORE any
    actionable content — a superseded banner at the top, not a footnote.
17. **Name the exact next owner and next action.** If priority lives outside
    the repo (an external task list, a management system), include a durable
    locator and state exactly what cannot be inferred locally.
18. **Produce a cleanup receipt:** snapshot SHAs (start and end),
    validations run with conclusions, changes made, items archived or
    superseded, retained-local-evidence classes, unresolved risks, decisions
    reserved to the operator, and the next safe action.

## 5. Portability and evidence

19. **Fresh-clone simulation is a closing gate.** Fail the close if required
    instructions, MCP/config surfaces, current planning, or validators
    depend on: ignored symlinks, hard-coded machine paths, absent generated
    files, or unlocated external task lists. What a fresh clone cannot
    reach, the handoff cannot rely on.
20. **Keep the shippable surface light.** Commit durable verdict anchors,
    minimal indexes, schemas, and required operating instructions. Raw
    evidence may stay ignored — that is policy, not debt.
21. **Classify every evidence reference** with an explicit vocabulary:
    `expected-not-created` · `present-local` · `durable-closure-recorded` ·
    `replaced-by-committed-verdict` · `missing-error`. A live artifact
    asserting a local path that does not exist, with no durable fallback and
    no classification, is a defect.

## 6. Validation quality

22. **A successor-readiness gate, distinct from syntax/provenance gates.** It
    validates the projections and surfaces above: lane↔frontmatter↔body,
    parent tables and counts vs. children, reference existence (status
    index, guides, north-star format), dispatch baselines and path
    preflights vs. the live tree, worktree↔owner↔candidate mapping, and
    generated-surface freshness.
23. **Unbound assertions fail.** A sealing/immutability claim with no seal
    record is fail-open — make it fail, or encode the exemption (void /
    superseded / exempt) explicitly. Lifecycle vocabularies must distinguish
    unstarted, scheduled, void, superseded, archived, and executed — one
    catch-all "not run" hides five different meanings.
24. **Negative controls before trusting any new gate:** deliberately
    introduce one lane mismatch, one stale baseline, one missing review
    directory, one unbound seal claim, and one unmapped dirty worktree —
    prove each is caught, then remove them. A gate that has never failed is
    unproven.

## 7. SHOULD — entropy reduction without product bloat

25. Canonicalize status schemas per artifact type and document the
    cross-type projection (what a child transition implies for its parent).
26. Give maintenance, remediation, dispatch, escalation, review, and archive
    records one minimal common lifecycle envelope (id, type, status from a
    closed vocabulary, created, superseded_by) so current vs. retired is
    machine-separable.
27. Exclude deliberate vendor payloads and ignored local evidence from
    default newcomer search/inventory guidance, while keeping them
    discoverable.
28. Document workspace/package-manifest inclusion rules so two manifests
    cannot silently select different test surfaces.
29. Readiness and launch summaries regenerate or visibly expire when HEAD
    advances materially — a summary without a freshness bound is a future
    lie.

## Authority note

Everything in this contract is ordinary closeout work under the standing
invocation: reconciling documents, finalizing records, moving/archiving
artifacts, generating indexes, repairing validators (through the repo's own
governed path), and running checks. Pause only for the genuinely
nondelegable: destructive deletion without recoverable provenance, secrets,
irreversible external actions, operator/product decisions, or overlapping
live-work ownership that cannot be resolved safely.

## Authority note — a stale/narrow work manifest is not a stop sign

A payable, in-domain remediation sometimes collides with a governance record
scoped to earlier work: the change touches a governed tree (e.g. an admitted
plugin whose integrity digest must be re-pinned), and the *existing* narrow
work manifest does not list those paths, so the governed-commit gate refuses.

Two wrong responses, one right one:
- WRONG — stop and hand the debt forward ("blocked on governance"). The
  invocation authorizes paying the debt; a stale manifest's silence is not an
  operator decision.
- WRONG — self-grant by widening the existing manifest's allow-list to cover
  paths it was never scoped for. That reproduces the exact overreach the
  manifest exists to prevent, and it launders new scope through an old record.
- RIGHT — **create the next conforming work unit.** Open a NEW governed
  slice/manifest (or the repo's formal extension mechanism) that properly
  declares the remediation's paths and the consequent re-pin, commit under it,
  then dispatch fresh independent review.

The distinguishing fact: an integrity RE-PIN that follows an **owned source
repair** is a mechanical consequence of a change you were authorized to make —
not the admission of a new plugin, capability, or trust boundary. Re-pinning
after repairing your own code is bookkeeping; admitting a new capability is a
decision. Only the latter is `decision_or_coordination_required`.
**Genuine product/security boundaries still fail closed** — this rule speeds
legitimate in-domain repair, it does not authorize crossing an operator hard
boundary (live deploy, real-connector cutover, a new external surface). The
test: is the blocked change a repair to code/artifacts already in scope, or the
introduction of something new? Repair → create the conforming unit and proceed.
New surface/authority → pause for the operator.
