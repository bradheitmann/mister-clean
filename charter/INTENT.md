# Intent card — mister-clean
- Ratification: pending-owner. Drafted 2026-10-31 by the project PM (Claude Opus 5.5) from repository evidence, the owner's succession handoff and evals-from-failures note (2026-10-29, private) and the owner's routing decision of 2026-10-31; goes to the owner for batch ratification. Open owner question: where private eval data lives, separate from this public repo.
- Underlying job (not the symptom): Make every repository an agent team touches trustworthy to inherit, and turn what those teams actually do (cleanups that recur in every codebase, and the failures they hit) into comparable, replayable evaluation evidence about agents. An agent is harness + model + reasoning level; the inference provider is a routing footnote. That evidence is what will later let a router choose an agent for a task.
- Beneficiary: the owner/operator and the systems below (detail follows).
  - every project an agent team works in: CLOSE pays completion debt, GUARD keeps unclean work out of accepted history;
  - planners and dispatchers (a specification-and-build-contract pipeline, governed agent teams) that need to know which agents are qualified for a task;
  - open-source users, who get shipped community defaults or can switch to their own evals only;
  - a model-tier ladder, which qualifies tiers and consumes routing evidence; a model-facts registry, which receives measured model and provider observations as dated evidence.
- Situation: hygiene machinery exists; eval evidence is scattered and anecdotal (detail follows).
  - Version 7.1.0 ships the skill, CLI, MCP and a local control plane; 7.1.0 is a candidate, not yet independently accepted or published.
  - Failures across the fleet are noticed in panes and event logs but are not turned into repeatable cases; identity is often a pane title, not a runtime receipt.
  - Eval contracts exist (blind-run contract, model-hygiene trial, rotation campaign), but no agent-card or case-study format is committed.
  - The repo is public: returned data must carry no secrets, PII or proprietary project content.
- Outcome (observable): the parts below (detail follows).
  1. CLOSE and GUARD keep working as released, with their existing independent QA/GUARD authority;
  2. a failure case study → controlled replay in an isolated worktree with the same agent → classified, repeatable failure → durable eval case that re-runs as new agents arrive, with the verifier held constant;
  3. one agent card per agent (stable id; harness, model, reasoning level; known inference sources; categorical eval results), citing model-facts registry records by id rather than copying them;
  4. community eval data kept distinct from the user's own, with a switch to use only the user's evals;
  5. later, and only after qualification: a router that classifies a task and returns eligible agents with evidence ids, a fallback, uncertainty and adjacent escalation options (more reasoning; same tier, other family; one tier up; one tier down to a specialist; never multiple tiers).

  Test: given a recorded field failure, an agent can replay it, show it repeats with the control agent, run one candidate agent under the same verifier, and read back a result that cites the case, both cards and the commit it ran on.
- Non-goals: everything other systems already own (detail follows).
  - not model or provider facts (the model-facts registry), not the tier ladder or its adjacency data (the tier-ladder project), not serving or the fleet (the serving project), not governance (the governance contract), not team delivery doctrine (the delivery-doctrine project);
  - not a router today: nothing here may imply Mister Clean routes models before the routing slice is qualified;
  - not an unlimited telemetry collector: field incidents carry confidence, privacy and provenance, plus only the evidence needed to remediate;
  - no design bound to the name "Mister Clean" (it may change).
- The 3 guarantees that matter: G1 clean public data, G2 replayable evidence, G3 truthful identity (detail follows).
  - G1 **Clean public data:** nothing committed or contributed contains secrets, PII or proprietary project content; a secret/identifier scan passes on every commit.
  - G2 **Replayable evidence:** every eval result names its case, agent cards, verifier and commit, and can be re-run from those; a single non-repeated failure is a case study, never an eval verdict.
  - G3 **Truthful identity and unknowns:** agent identity is labelled by how it was observed (runtime receipt vs pane title vs contract); unknown limits, sample sizes and guesses are marked, never filled in.
- Largest uncertainty: the private/public split and replay cost (detail follows).
  - where the owner's private eval data and the private id maps live, and how community contributions are kept clean;
  - whether field failures replay repeatably at acceptable cost on free inference;
  - the exact seams with the specification pipeline (task requirement in, eligible agents out), the tier ladder (adjacent()) and the model-facts registry (card ids).
- Premise check — symptom named by the requester: "keep projects clean and know which models fail where." **Job it actually serves:** choose the agent that can do a given task well under its constraints (quality, privacy, cost, latency), with evidence, and keep every repo inheritable while doing it.
- Evidence lines: the sources below (detail follows).
  - README.md, SKILL.md, CURRENT.md (7.1.0 candidate) on origin/main 49fc820;
  - evals/blind-run-contract.md, evals/model-hygiene-trial.md, evals/rotation-campaign.md;
  - the owner's succession handoff and evals-from-failures note (private, not in this repository);
  - the owner's 2026-10-31 decision on model routing and failure escalation, and a cross-repository seams survey of 2026-10-30 (private);
  - the field-window ledger on branch evals/field-window-2026-10-31 (13 cards, 11 case studies, refresh 1).
