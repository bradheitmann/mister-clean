# Stack adapters — ecosystem-specific hygiene checks

Loaded selectively by `mister-clean detect stack` (rubric §7). Each section
lists the stack's KNOWN debris classes and boundary risks; a CLEAN verdict on
a detected stack includes these checks. Extend with new sections as stacks
are encountered — the detector picks up any `## <ecosystem>` header.

## node
- `node_modules/` tracked or nested inside fixtures; stray `npm-debug.log*`.
- `package.json` scripts referencing deleted files; phantom `bin` entries.
- Workspace globs vs actual directories drift (packages exist that no
  manifest reaches — the unreachable-suite defect).
- Production `.js`/`.mjs`/`.cjs` packages that no reachable syntax, static,
  type, build, or test route actually reads. A root recursive command covers
  only member scripts it reaches; zero-build deployment is not zero-check
  permission. Use the native linter, `node --check`, TypeScript `checkJs`, or a
  stronger repository-specific route and retain a file-removal/parse-error
  negative control.
- Engines/volta/nvmrc pinning disagreement across docs and manifests.

## node-bun
- `bun.lock` drift or a second package-manager lockfile selecting a different
  dependency graph.
- Install scripts silently skipped because required packages are absent from
  `trustedDependencies`.
- Runtime code that depends on `Bun.*` even though the published package
  promises Node compatibility.
- CLI behavior that passes from source under Bun but fails from the packed
  `dist/` artifact under the minimum supported Node version.

## node-pnpm
- `pnpm-lock.yaml` hand-edits (NEVER hand-edit; regenerate).
- `pnpm-workspace.yaml` vs root `package.json.workspaces` selecting different
  member sets — document the inclusion rule or unify.
- Store/virtual-store paths leaked into committed config.

## node-npm
- `package-lock.json` merge-conflict artifacts; lockfileVersion drift.

## node-yarn
- Mixed yarn/npm lockfiles present simultaneously (competing managers).

## typescript
- Emitted `*.js`/`*.d.ts` beside sources, tracked but stale vs `tsc` output.
- `tsconfig` `paths` aliases pointing at moved/deleted directories.
- A green root `tsc` whose include/exclude graph omits production packages,
  JSDoc JavaScript, Svelte/Vue sources, generated runtime entry points, or
  workspace members. Enumerate source-to-gate coverage; do not infer it from
  the script name.
- `@ts-expect-error`/`@ts-ignore` without owner + exit condition (same rule
  as skipped tests).

## python
- `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.mypy_cache/` tracked.
- Competing `requirements.txt` / `pyproject.toml` / `Pipfile` without a
  stated authority; unpinned transitive-critical deps.
- Virtualenvs (`.venv/`, `venv/`) inside the tree untracked-but-unignored.

## rust
- `target/` unignored; `Cargo.lock` policy mismatched to crate type
  (committed for bins, per-policy for libs); `#[allow(...)]` without
  owner/rationale.

## go
- `go.sum` drift vs `go.mod`; `vendor/` half-updated (vendored without
  `go mod vendor` regeneration); build tags gating dead platforms.

## shell
- Scripts without `set -euo pipefail` doing state mutation.
- Unquoted globs/vars in paths (the zsh-nomatch and word-splitting traps).
- `#!/bin/bash` vs POSIX drift against the repo's stated runner.

## docker
- Stale stage names/COPY paths after refactors (the runtime-copyset defect
  class); `latest` base tags in pinned-build repos; secrets via ARG.

## github-actions
- Workflow steps invoking commands that no longer exist in manifests.
- `--no-bail`-class masking: a matrix/step whose failure hides successors.
- Comments asserting expected-red/known state that has since changed
  (stale-baseline class); untrusted-input interpolation into `run:`.
- A privileged `workflow_dispatch` deploy that checks out the selected ref
  without an explicit allowed-ref guard. Manual dispatch is not main-bound by
  implication: fail closed on every branch/tag outside the authorized ref and
  prove that behavior with negative fixtures.
- A step named “verify” that only prints, warns, or tees health output while a
  later public promotion remains reachable. Every prerequisite health leg must
  exit nonzero on non-passing/empty/malformed evidence; test each failure path.
- Mutable third-party action refs in credential-bearing or release-writing
  jobs; missing least-privilege `permissions`; checkout credentials retained
  before they are needed. Pin privileged dependencies to immutable commits.
- Treat every workflow named by an effectful `workflow_run.workflows` trigger
  as part of the same trust boundary. Its success authorizes the downstream
  effect, so mutable actions or implicit permissions upstream can forge the
  very green signal CD trusts. Pin and least-privilege the whole transitive
  authorization chain, not only the deploy job.
- A `workflow_run` source bound only to `head_sha` and a branch named `main`.
  Before any candidate-controlled code receives credentials, bootstrap policy
  from trusted main, bind `head_repository.full_name` to the current repository,
  require a trusted upstream event, and prove the SHA belongs to freshly fetched
  trusted main. A same-named fork branch is the mandatory negative control.
- Health evidence that proves every observed row is green but never proves the
  required named check exists. Bind each plane to an explicit check manifest;
  reject missing, duplicate, substituted, empty, malformed, or nonpassing rows.
- Workflow syntax/semantics absent from the established CI gate. Run a pinned
  workflow-aware validator, but retain behavioral negative tests: syntax green
  does not prove authorization or fail-closed promotion.
