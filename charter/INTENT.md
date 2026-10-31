# Intent card — mister-clean
- Ratification: pending-owner. Drafted 2026-10-31 by PM-MISTER-CLEAN (Claude Opus 5.5) from repo evidence, the Captain Brain Damage handoff (2026-10-29), the owner note on evals from failures (2026-10-29) and the owner routing decision of 2026-10-31; goes to the owner in A/EXEC-PM's batch. Open owner question: where private eval data lives, separate from this public repo.
- Underlying job (not the symptom): Make every repository an agent team touches trustworthy to inherit, and turn what those teams actually do (cleanups that recur in every codebase, and the failures they hit) into comparable, replayable evaluation evidence about agents. An agent is harness + model + reasoning level; the inference provider is a routing footnote. That evidence is what will later let a router choose an agent for a task.
- Beneficiary: Brad (owner/operator) and the systems below (detail follows).
  - every project an agent team works in: CLOSE pays completion debt, GUARD keeps unclean work out of accepted history;
  - planners and dispatchers (REVENG/Prefab, ODIN-governed teams) that need to know which agents are qualified for a task;
  - open-source users, who get shipped community defaults or can switch to their own evals only;
  - model-tier-drop, which qualifies tiers and consumes routing evidence; model-atlas, which receives measured model and provider observations as dated evidence.
- Situation: hygiene machinery exists; eval evidence is scattered and anecdotal (detail follows).
  - Version 7.1.0 ships the skill, CLI, MCP and a local control plane; 7.1.0 is a candidate, not yet independently accepted or published.
  - Failures across the fleet are noticed in panes and event logs but are not turned into repeatable cases; identity is often a pane title, not a runtime receipt.
  - Eval contracts exist (blind-run contract, model-hygiene trial, rotation campaign), but no agent-card or case-study format is committed.
  - The repo is public: returned data must carry no secrets, PII or proprietary project content.
- Outcome (observable): the parts below (detail follows).
  1. CLOSE and GUARD keep working as released, with their existing independent QA/GUARD authority;
  2. a failure case study → controlled replay in an isolated worktree with the same agent → classified, repeatable failure → durable eval case that re-runs as new agents arrive, with the verifier held constant;
  3. one agent card per agent (stable id; harness, model, reasoning level; known inference sources; categorical eval results), citing model-atlas records by id rather than copying them;
  4. community eval data kept distinct from the user's own, with a switch to use only the user's evals;
  5. later, and only after qualification: a router that classifies a task and returns eligible agents with evidence ids, a fallback, uncertainty and adjacent escalation options (more reasoning; same tier, other family; one tier up; one tier down to a specialist; never multiple tiers).

  Test: given a recorded field failure, an agent can replay it, show it repeats with the control agent, run one candidate agent under the same verifier, and read back a result that cites the case, both cards and the commit it ran on.
- Non-goals: everything other systems already own (detail follows).
  - not model or provider facts (model-atlas), not the tier ladder or its adjacency data (model-tier-drop), not serving or the fleet (llm-serve), not governance (Charter), not team delivery doctrine (ODIN);
  - not a router today: nothing here may imply Mister Clean routes models before the routing slice is qualified;
  - not an unlimited telemetry collector: field incidents carry confidence, privacy and provenance, plus only the evidence needed to remediate;
  - no design bound to the name "Mister Clean" (it may change).
- The 3 guarantees that matter: G1 clean public data, G2 replayable evidence, G3 honest identity (detail follows).
  - G1 **Clean public data:** nothing committed or contributed contains secrets, PII or proprietary project content; a secret/identifier scan passes on every commit.
  - G2 **Replayable evidence:** every eval result names its case, agent cards, verifier and commit, and can be re-run from those; a single non-repeated failure is a case study, never an eval verdict.
  - G3 **Honest identity and unknowns:** agent identity is labelled by how it was observed (runtime receipt vs pane title vs contract); unknown limits, sample sizes and guesses are marked, never filled in.
- Largest uncertainty: the private/public split and replay cost (detail follows).
  - where Brad's private eval data and the private id maps live, and how community contributions are kept clean;
  - whether field failures replay repeatably at acceptable cost on free inference;
  - the exact seams with reveng (task requirement in, eligible agents out), model-tier-drop (adjacent()) and model-atlas (card ids).
- Premise check — symptom named by the requester: "keep projects clean and know which models fail where." **Job it actually serves:** choose the agent that can do a given task well under its constraints (quality, privacy, cost, latency), with evidence, and keep every repo inheritable while doing it.
- Evidence lines: the sources below (detail follows).
  - README.md, SKILL.md, CURRENT.md (7.1.0 candidate) on origin/main 49fc820;
  - evals/blind-run-contract.md, evals/model-hygiene-trial.md, evals/rotation-campaign.md;
  - CAPTAIN-BRAIN-DAMAGE-HANDOFF.md and OWNER-NOTE-2026-10-29-EVALS-FROM-FAILURES.md (untracked, read in place);
  - reveng charter/owner-decisions/2026-10-31-model-routing-and-escalation.md and the seams survey of 2026-10-30 (C1, C5, C8, C9, C14);
  - the field-window ledger on branch evals/field-window-2026-10-31 (13 cards, 11 case studies, refresh 1).
