# Decision 2026-11-03: planning-excluded roots prune native-gate discovery, visibly (O-GATE-SCOPE-1)

**Ruling (A/EXEC-PM as customer orchestrator, 2026-11-03T09:0xZ; the owner may override).**

"The planning config's excluded roots also prune native-gate discovery, with two conditions. (1) Only roots the repository declares as evidence or archive in .mister-clean/planning.json count; a Cargo.toml under such a root is an artifact of record, not a production executable surface, and running it as a gate is wrong. (2) The exclusion is visible, never silent: the report lists every excluded manifest as 'gate candidate excluded by planning policy: <path>' so a real executable surface hidden under an archive root cannot vanish from the audit, and a repo that wants one gated moves it out of the archive root."

**Consequences for this repository.**
1. `mister-clean.planning-config/1` gains an optional per-exclude classification: `exclude` entries may be strings (planning-only, today's meaning) or objects `{ "path": "...", "kind": "evidence" | "archive" }`. Only `evidence` and `archive` excludes prune native-gate discovery. An unknown kind refuses with the existing typed `planning_config_invalid`. The schema version does not change (additive).
2. Native-gate discovery skips manifests under `evidence`/`archive` excludes and records each one as `{ kind: "gate_candidate_excluded_by_planning_policy", path, manifest, exclude_root }` in the discovery evidence and in the closeout report, with the human line `gate candidate excluded by planning policy: <path>`.
3. String excludes keep their planning-only meaning, so no existing repository changes behaviour silently.

Recorded by the Claude dev subagent for lane `feat/gate-discovery-planning-excludes` (brief `LANE-gate-discovery-planning-excludes.md`); orchestrator PM-MISTER-CLEAN.
