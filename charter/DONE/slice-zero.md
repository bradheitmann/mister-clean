# Done list — slice-zero (written BEFORE dispatch; does not grow during it)
Base bytes: origin/main 49fc820 plus branch evals/field-window-2026-10-31 at 99d47aa (case CS-001 source)
Proofs (each: name, what it guarantees, reopen step, fail-without mutant):
1. eval-case-readback (G2): the CS-001 eval case file validates and names case id, both agent-card ids, verifier identity, base commit and replay count. Reopen: run the validator on the committed file from a fresh checkout and compare its output byte-for-byte with the recorded output. Mutant: delete the verifier field or set the replay count below the declared floor; the validator must refuse.
2. control-replay (G2): CS-001 is replayed with its control agent in a separate worktree at the commit before the failure, at most 5 times (LOOPS L1), and every replay's transcript digest and outcome are recorded. Reopen: re-hash the stored transcripts and compare with the recorded digests. Mutant: record a verdict with only 1 replay; proof 1's validator must refuse it.
3. card-identity-check (G3): both cited agent cards carry identity_status and every numeric limit has a source and date or UNKNOWN. Reopen: rerun the card check on the committed cards. Mutant: drop identity_status from one card; the check must refuse.
4. audit-public (G1): `bun run audit:public` passes on the candidate and a secret scan of the diff reports 0 hits; no source project or seat name appears. Reopen: rerun both on the frozen tip. Mutant: add a denylisted identifier to a case file; audit:public must fail.
Gates (exact commands):
- charter check --strict
- bun run audit:public
- the eval-case validator command named in charter.toml [slice_zero].command, once it exists
Out of scope (recorded obligations, not fixed here):
- the router, community/user data switch and telemetry intake (later slices)
- regenerating MANIFEST.sha256 for evals/field (release work)
- porting the repo's .js/.mjs scripts to strict TypeScript or Rust (language rule; offered to owner)
Owner decision points:
- ratify INTENT (pending-owner)
- where private eval data lives, separate from this public repo
