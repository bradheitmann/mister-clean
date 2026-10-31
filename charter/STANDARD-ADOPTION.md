# COMMON-STANDARD adoption map — mister-clean (standard v0.2)
Each section maps to an existing gate or to an obligation. Obligations are bounded work, not exceptions.

| § | Requirement | This repository | Status |
|---|---|---|---|
| 1 | Public-safety check on the prospective published files | `bun run audit:public` (package file list plus identifier denylist) in CI | met |
| 1 | Denylist not committed in plain form | `config/public-package-identifiers.txt` is committed in plain form | obligation O-STD-1: hashed form, then move the plain list to the private root |
| 1 | Private data under `AGENT_PRIVATE_ROOT` | the control-plane store and eval id maps use their own paths today | obligation O-STD-2: honor `AGENT_PRIVATE_ROOT/mister-clean/<kind>` with the existing paths as overrides |
| 1 | No machine specifics or private names in committed text | `charter/` and planning docs rewritten without them; a private case-study identifier remains in `.gitignore` and two build scripts (ignored local asset file names; 36 hits) | met for charter/; obligation O-STD-3: rename those asset paths generically and drop the identifier from code |
| 2 | Cloud-ready; 127.0.0.1; fresh clone runs every gate | clean-capsule CI rebuilds the candidate from a fresh materialization | met |
| 3 | Languages: strict TypeScript; no plain JavaScript source | strict TypeScript with `tsc --noEmit`; several `scripts/*.mjs` and `bin/mister-clean.js` are JavaScript (the latter is a generated, synced build output) | obligation O-STD-4: port `scripts/*.mjs` to strict TypeScript |
| 3 | One package manager, one lockfile, pinned toolchain | pnpm with `pnpm-lock.yaml`; Bun and Node pinned in CI and `packageManager` | met |
| 4 | Entry points and one current-state surface | README.md, AGENTS.md, `charter/`; `CURRENT.md` is the release-state projection and `charter/STATE.md` the work state | met; v1 should say whether a release projection may coexist with STATE |
| 5 | Ten hygiene dimensions | this repository's own audits (`audit planning`, `github-actions`, `repository-boundaries`) | met; scheduled dependency audit failing until fix/undici-advisories lands |
| 6 | Exact-candidate gates, fail-without mutants, independent verification, one heavy suite at a time | clean-capsule CI; repository-wide verification lease; GUARD four-role barrier | met; local full runs deferred to hosted CI while the shared machine is overloaded |
| 7 | `charter/` check before push | `charter check --strict` locally; CI cannot fetch the tool | limitation recorded in STATE; owner decision |
| 7 | Plan and work-contract schema pin | not yet used here | obligation O-STD-5: record the schema pin when this repository first emits or consumes work contracts |
| 8 | Worktree lifecycle, merge or kill, archive tags | lifecycle record outside the repository; `archive/<branch>` tags pushed before deletion | met |
| 9 | Linked from AGENTS.md | yes | met |
