---
artifact_type: reference
classification_rationale: Cross-repository engineering standard; adopted per repository by its maintainer. Not a lifecycle-bearing planning artifact.
title: Common engineering standard
version: 0.2-reviewed
ratification: pending-owner
---

# Common engineering standard (v0.2, co-author reviewed)

One standard for every repository an agent team works in: how code stays clean,
how quality is proven, and how public code is kept apart from private data. It
is generic on purpose. A repository adopts it by linking it from `AGENTS.md`
and recording any exception (see §9).

Status: **reviewed by all three co-authors; awaiting owner ratification**. Drafted by the Mister Clean maintainer
with the governance-contract and plan-schema maintainers as co-authors.

Where this standard and a repository's `charter/` disagree, the charter governs
that repository until its owner records a decision.

## 1. Public by default, private kept outside

Every repository must be shareable publicly at any commit.

- **In the repository:** code, schemas, migrations, generators, shipped
  defaults, synthetic fixtures, and documentation.
- **Outside the repository, at configurable paths:** private data, eval corpora,
  field evidence, id maps back to real names, handoffs that name people or
  projects, and local databases. Each path has a documented default under the
  user's data or config directory and an environment or config override. Code
  never hard-codes a private path.
- **One private root for every tool and repository.** The variable is
  `AGENT_PRIVATE_ROOT`. Its default is `${XDG_DATA_HOME:-$HOME/.local/share}/agent-private`,
  which works on a workstation and on a mounted cloud volume alike. Layout:
  `<root>/<repo>/{evidence,handoffs,agent-state,maps,db}`, where `<repo>` is the
  repository's name. A tool may also honor its own more specific variable
  (for example a tool-named `*_EVIDENCE_ROOT`); resolution order is the
  tool-specific variable, then `AGENT_PRIVATE_ROOT/<repo>/<kind>`, then the
  default. Where a tool still hard-codes an in-repository path, a gitignored
  symlink into the private root is the bridge until the tool honors the
  variable.
- **The public verification set stays committed:** content-hash manifests of
  private evidence bundles (plus a manifest of those manifests), verdict
  records, and the tests that prove each guarantee. These let anyone check
  that evidence existed and was unchanged without publishing it.
- **Moving private files out of Git** removes them from the index only
  (`git rm --cached`) after they are copied to the private root and verified.
  Rewriting history to scrub earlier commits is an owner decision.
- **Secrets** come only from the environment or a secrets manager at runtime.
  Never commit them. Never print them: check presence and length, never the
  value.
- **No machine specifics in committed text:** no absolute home paths, user
  names, host names, machine names, or local network addresses in code,
  committed docs, or test fixtures. Use `<repo>`, `$HOME`-relative placeholders
  or config keys.
- **Refer to private work generically** ("a Rust compiler project with a
  multi-agent team"), never by name, in anything committed or contributed.
- **Live databases are never placed in synced folders.** Back them up as a
  verified snapshot (online backup plus a hash).
- **Proof:** every repository runs a public-safety check on the exact candidate
  that scans the prospective published file list against an identifier
  denylist and secret patterns, plus a secret scan of the diff before any push.
  A check that only covers packaged files must say so, and ignored local files
  are reported separately from exposed ones.

## 2. Cloud-ready

Development may move off any one machine.

- Do not assume a particular workstation, local model fleet, terminal
  multiplexer, or local service. Anything machine-specific sits behind a
  config key or adapter with a default that works in a clean cloud container.
- Bind local services to `127.0.0.1` on a configurable, unused port. Never bind
  `0.0.0.0` by default.
- Start only what you need, and stop what you start.
- A fresh clone plus the documented toolchain must reach every entry point and
  run every gate. No gate depends on ignored, cached or untracked local state
  unless it is rebuilt from the exact candidate in one clean materialization.

## 3. Languages and toolchain

- **Rust is the default.** Also approved: Swift, Kotlin, Go, Zig, WebAssembly,
  WebGPU, BAML, and strict TypeScript (with Bun, Svelte, Astro, TanStack or
  Three.js where useful).
- **TypeScript means strict:** `"strict": true`, checked with `tsc --noEmit`.
  No plain JavaScript source, including config files. Generated JavaScript is
  allowed only as a build output that is traceable to its generator.
- **No Python by default.** An exception exists only for an adapter around a
  library that exists only in Python, isolated behind a port in its own pinned
  runtime, with a written necessity note beside it.
- **Existing code in a non-approved language** is not expanded. Fix what you
  were asked to fix and record a porting obligation.
- One package manager and one lockfile per repository. Pin toolchain versions
  in the repository (toolchain file, `packageManager`, CI pins).

## 4. Entry points and current state

A successor must find the truth without asking.

- `README.md`: what the project is, how to build and test it, where to start.
- `AGENTS.md`: binding instructions for agents, including the governance block.
- `charter/`: intent, guarantees, loops, stop rules, done lists and state (§7).
- **One designated current-state surface** (for example `charter/STATE.md` or a
  `CURRENT.md`). It states what is proven, what is not, the exact last-green and
  last-red commands, the next bounded items, and open owner decisions. Other
  documents point to it and do not compete with it.
- Directories have a purpose stateable in one line; names predict contents.

## 5. Code cleanliness

Inspect all ten dimensions and end each one either clean or with a recorded
disposition: discoverability, structure, naming, boundaries, dead or duplicate
code, documentation, tests, generated artifacts, configuration and
dependencies, and ownership and custody.

- **Boundaries:** domain logic stays out of transport, UI and storage adapters;
  no circular dependencies; no environment-specific code in the portable core;
  domain types instead of ambiguous primitives at contracts.
- **Dead code** is removed or carries a reason and an owner. Duplicates converge
  on one implementation.
- **Generated artifacts** are never hand-edited and can be regenerated by a
  committed generator; a check fails when they drift.
- **Dependencies:** a scheduled audit runs, and a high-severity advisory is
  fixed or carries a dated, owned exception. Pin GitHub Actions and other CI
  inputs to immutable references.
- **Comments and docs** explain why; they do not restate code and are not left
  stale.

## 6. Quality is proven, not claimed

- **Gates are exact commands** that run on the exact candidate bytes in CI and
  locally: format, lint with warnings denied, strict type check, tests, and the
  public-safety check.
- **Every guarantee has a proof that fails without it.** A new test or check
  includes a fail-without mutant: a deliberate change that turns it red.
- **Independent verification:** the verifier is not the author. Where two model
  families are available, they differ. The verifier names the exact frozen
  commit it checked; if the candidate moves, verification restarts.
- **Results are reopenable:** a claimed result can be re-run from the recorded
  inputs and compared.
- **Each verification run uses its own build output directory.** A shared
  build directory can reuse a stale test binary and report a false result.
  (Field case 2026-10-31: a fail-without mutant appeared to survive because a
  test binary built against the control tree was reused.)
- **One heavy suite per repository at a time.** Full suites take a
  repository-wide lease; a busy lease is a typed "resource contention" result,
  not a failure and not a duplicate run.
- **Labels say what is known.** Unknowns, small samples and guesses are marked as such.
  Identity (which model, harness and reasoning level did the work) is recorded
  with how it was observed: runtime receipt, display title, or contract.
- **Checks measure by default and refuse only for** safety, provenance or
  integrity, fabrication, or a contradiction with a cited source. Every other
  check records a typed limitation and a measurement, and lets work proceed.

## 7. Governance and plans

- **Governance contract:** every repository carries `charter/`: an intent
  card, guarantees each with an owner, a proof and a cost, loops each with a
  finite bound, a cost per trip and a stop condition, stop rules, done lists,
  and current state. Its check (`charter check`; `--strict` before a push or a
  "ready" claim) runs on the exact candidate.
  - **Done means proven:** a slice is done when every proof on its done list,
    written before dispatch, has run, been reopened from the frozen bytes and
    been compared. "No findings" is never done; new findings become
    obligations on the next bounded slice unless they break a listed
    guarantee.
  - **Pinned and frozen:** the done list is pinned at dispatch
    (`charter gate <slice> --dispatch`) and must still match at acceptance
    (`--accept`). The candidate is frozen from its committed tree
    (`charter freeze`), and the verifier's receipt is validated against those
    bytes (`charter receipt <r> --verify-tree <checkout>`).
  - **Verification is bounded:** one remediation per rejection. A second
    rejection of the same slice goes to the owner, and is never an automatic
    loop.
  - **Rules change only by record:** a stop rule changes only through an
    owner-decision file in `charter/owner-decisions/`, and relaxing one needs
    two signers. No agent relaxes a stop rule.
  - **Install:** pin the charter tool to a commit or release and build it from
    source at that pin; CI uses the same pin.
- **Plans and work contracts** use the shared plan and work-contract schema
  maintained by the plan-schema project, so planners, executors and verifiers
  exchange one shape. A repository does not invent a parallel format, and
  extends the shape only through an amendment to that schema.
  - **Pin:** the v5 work-contract schema, identified by the specification
    package's payload root (a content hash of the whole specification), plus
    the validator release that checks it. Record both in the repository. A
    commit, branch or neighbouring checkout of the specification is not a pin.
  - **Producers** emit the *authoring* form (objective, resource scope,
    acceptance criterion, budget, target selector) and validate it before
    handing it on. They never hand-write the *admitted* form: admission is
    the compiler's output, carrying identity, authority and evidence
    requirements.
  - **Consumers** accept only admitted contracts that validate against the
    pinned schema, and consume each one once, within the scope it states.
  - Until a packaged validator release exists, adopters record the schema pin
    and list validation as an open obligation in `charter/`; they do not
    substitute a home-made check.
  - Keep three relations distinct: a semantic prerequisite (B needs A's
    result), a schedule order (B runs after A), and an edit conflict (A and B
    write the same paths). Do not encode one as another.
  - Identities do not cast: a raw SHA-256 of bytes, a Git object ID and a
    schema content identifier are different kinds, and are never substituted
    for one another.
- **Decisions live in the repository.** No decision, rule or receipt lives only
  in a chat, terminal pane or transcript.

## 8. Workspace hygiene

- **Temporary worktrees** live outside the primary checkout, each with a named
  owner, purpose and completion condition recorded outside the tree. At
  completion: preserve work, release dependents, remove through Git (never a
  forced removal), and verify the path is gone from both Git and the filesystem.
  The lifecycle record (owner, purpose, completion condition, branch and head)
  lives outside the tree being removed, for example in `charter/STATE.md` or
  the task ledger.
- **Branch deletion is a separate action** from worktree removal and is never
  implied by it.
- **Merge or kill:** finished work does not sit unmerged. Before a branch is
  deleted, an `archive/<branch>` tag at its exact tip is pushed and verified.
- **No destructive shortcuts:** no force-push, no history rewrite, no bulk
  deletion. Deletions are listed and approved by the owner.
- **No detritus:** scratch files, caches, stray clones, untracked notes and
  temporary processes are cleaned up or relocated by whoever created them.

## 9. Adoption and exceptions

1. Link this standard from the repository's `AGENTS.md`.
2. Map each section to the repository's existing gates; list the gaps as
   obligations in `charter/`.
3. Record any exception in the repository with its reason, owner and expiry.
   An exception is a decision, not a silent omission.

## Open questions for co-authors

- Plan schema (§7): answered by the plan-schema maintainer: pin v5 by
  specification payload root plus the validator release. Open: the first
  packaged validator release (a versioned command with a JSON interface) does
  not exist yet.
- Governance (§7): answered by the governance-contract maintainer: yes, as a
  warning, never a refusal (a missing link is not a safety, provenance,
  fabrication or contradiction failure). When `charter.toml` has a
  `[standard]` table (name, version, location), `charter check --strict` warns
  if `AGENTS.md` does not link it, and `charter sync-agents` can add the link.
  Planned after owner ratification of v1.
- Languages (§3): confirmed aligned with the governance block's language line.
- Public-safety (§1): whether to standardize one shared denylist format.
