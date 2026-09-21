# Mister Clean primer

Successor-facing orientation for this repository. The authoritative current
state is [`CURRENT.md`](../CURRENT.md); the product contract is
[`references/control-plane-product-spec.md`](../references/control-plane-product-spec.md).

## Read in this order

1. `CURRENT.md` — verdict, measured repository object, required sequence.
2. `SKILL.md` and `README.md` — the public skill/CLI/MCP surface.
3. `references/` — product spec and doctrine.
4. `project/planning/handoffs/` — dated PM handoffs (historical, never self-certifying).
5. `project/planning/hygiene/MANUAL-LOOSE-ENDS-LEDGER.md` — manually tracked loose ends.

## Toolchain

- Node >= 22 (`engines.node`), pnpm 11 (`packageManager`), Bun 1.4.0 (as pinned in
  `.github/workflows/ci.yml`; `node:sqlite` is required by the execution lease).
- `pnpm run ci:check` is the only command that produces a clean-capsule receipt.
  It refuses to run if the source RepositoryObject changes during the run, so do
  not edit the tree while it executes.

## Custody

`main` is the sole writer. Feature work lives in `../.mc-wt/<name>` worktrees.
No merge, publish, or global-install change happens without independent QA and
GUARD, as recorded in `CURRENT.md`.
