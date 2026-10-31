---
artifact_type: reference
classification_rationale: Seam agreement between this project and the model-tier ladder project; planned interface, not shipped functionality.
title: Failure escalation seam — ladder adjacency and the router's choice
date: 2026-10-31
---

# Failure escalation seam

Planned, not implemented. Mister Clean does not route models today. This note
records how a failed agent run escalates once a router exists. Each project
owns its half, and neither copies the other's records. The mirror of this note
lives in the tier-ladder project's plan.

## Owner rule being implemented

When a recommended agent fails a task, the failure becomes a case study here.
It unlocks adjacent options for the next run: a higher reasoning level; another
model family or architecture at the same tier; one tier up; or one tier down to
a specialized model that fits the task. A run never jumps more than one tier.

## Who owns what

| Concern | Owner |
|---|---|
| Ladder data: tiers, families, task shapes, deployment and QoS, cost | tier ladder |
| `adjacent()`: the lawful moves from a position | tier ladder |
| The routing decision record (the move taken) | tier ladder, append-only ledger |
| Choosing among moves: failure class, eval evidence, privacy, quota | Mister Clean (router) |
| Harness: turning a move into an agent (harness + model + reasoning level) | Mister Clean |
| Failure case study and next-run outcome, citing the decision id | Mister Clean |
| Evidence that a tier boundary is wrong | Mister Clean sends a dated observation; the ladder binds or rejects it |

## Interface

```
adjacent(from: {model_id, reasoning_level}, task, registry, policy) -> [Move]
Move = {kind, to: {model_id, reasoning_level}, tier_from, tier_to}
kind ∈ more_reasoning | same_tier_other_family | one_tier_up | one_tier_down_specialist
```

- The function is pure and deterministic. The task is an input: tier 1 accepts
  only decision-shaped tasks, and a specialist move needs a model bound to the
  task's family.
- It never returns a move that spans more than one tier, and it never returns a
  target that fails the ladder's QoS gate.
- An empty list is valid and means a human is next.
- The ladder does not model harnesses. Mister Clean adds the harness when it
  turns a move into an agent card.

## Mister Clean's half

1. Classify the failure: quality, capacity, quota or transport. Quota and
   transport failures go through the free-inference tripwire first (same agent,
   another free provider, then paid) and are not agent failures.
2. Call `adjacent()`. Filter the moves by qualified eval evidence, privacy and
   egress rights, and quota. Pick one, recording a rationale, evidence ids and
   uncertainty.
3. Record the case study and the next run's outcome, citing the ladder's
   decision id.

## Open

- Whether moves should echo the harness back as an opaque string.
- The eval-evidence filter depends on the eval-case and agent-card formats
  (charter Slice Zero).
