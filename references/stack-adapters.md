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
