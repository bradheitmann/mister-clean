# Done list — run-receipts (written BEFORE dispatch; does not grow during it)
Base bytes: origin/main aa40491 (branch feat/run-receipts-second-pass)
Proofs (each: name, what it guarantees, reopen step, fail-without mutant):
1. fingerprint-line-shift: a finding's fingerprint survives inserting one line above the offending line in a fixture (anchor is content, not position). Reopen: run `src/closeout/finding-anchors.test.ts`. Mutant: include `line` in the hashed tuple → RED.
2. miss-decided-by-git: an offending line committed before the baseline receipt, absent from that receipt, is classified `persisting_unseen` (MISS) by the second pass. Reopen: run `src/closeout/second-pass.test.ts`. Mutant: drop the `git cat-file` earlier-blob check → classified `introduced` → RED.
3. introduced-decided-by-git: a line added after the baseline is classified `introduced`. Reopen: same test file. Mutant: skip the earlier-tree existence check and treat every new finding as MISS → RED.
4. receipt-root-outside-repo: a receipt root inside the audited repository is refused with a typed error (`receipt_root_inside_repository`) before any write. Reopen: run `src/run-receipt.test.ts`. Mutant: remove the containment check → RED.
5. receipt-privacy: a receipt that would carry a matched public-safety value (not its digest) is refused before any write. Reopen: same test file. Mutant: remove the privacy check → RED.
6. legacy-join: `second-pass --against` a pre-7.3 closeout bundle (only `legacy_fingerprint`s in `regression-delta.json`) still joins, with anchor kind `legacy`. Reopen: run `src/closeout/second-pass.test.ts`. Mutant: drop the legacy path → RED.
7. receipt-round-trip: every written receipt validates against `mister-clean.run-receipt/1` on read-back and the index lists it. Reopen: run `src/run-receipt.test.ts`. Mutant: corrupt one key set on disk → reader refuses → RED.
8. audit-close-parity: AUDIT and CLOSE derive the same fingerprint for the same finding (one derivation path from the emitted audit result). Reopen: run `src/closeout/finding-anchors.test.ts`. Mutant: diverge one family's rule between the two entry points → RED.
Gates (exact commands):
- tsc --noEmit
- touched test files only: pnpm exec -- bun ./node_modules/vitest/vitest.mjs run --allowOnly=false src/run-receipt.test.ts src/closeout/finding-anchors.test.ts src/closeout/second-pass.test.ts
- bun run audit:public
- bun run manifest:package:check (after regenerating packaged bytes through the normal scripts)
- charter check --strict (charter b9323cd) equals main's baseline
- real-repo smoke, read-only, receipts only under the scratch root named by MISTER_CLEAN_RECEIPT_ROOT
Out of scope (recorded obligations, not fixed here):
- native-gate failures as receipt findings (a read-only second pass cannot re-execute gates)
- importing receipts into the machine-wide eval store (EV-03 migration)
- MCP server receipts (the server does not share the CLI journal path)
Owner decision points:
- none; agent identity enters only via `--agent-card` / `MISTER_CLEAN_AGENT_CARD`, else `unobserved`
