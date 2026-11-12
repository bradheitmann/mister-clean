# CS-022: the first model on a retry ladder was accepted once in 39 charged attempts

status: observation; model-failure case study (the source project's owner rule: a failed model run becomes a case study here)
class: first-pass quality of the ladder's first model

## What happened
A multi-stage evidence pipeline gives every phase up to three models in a fixed order, called a ladder. Its quality rule keeps a phase's retries on the same model, changing only the scope or the detail of the request. The ladder moves to the next model only on a provider failure, an unavailable model or a measured model fault. So the first model carries most of a run's attempts.

In four consecutive runs, deepseek-flash held position 1. Its attempts ended like this (data/ladder-attempts-by-model.tsv):
- 1 accepted, 38 rejected, 6 uncharged (uncharged: the provider paused or failed before a charged result);
- of the 38 rejections, 33 were judged bad candidates on quality, and 5 are labelled provider_failure with the cause still marked "quality" (data/deepseek-flash-non-accepted.tsv).

The same runs' other two models had higher acceptance of charged attempts: glm-5.3-flash 6 of 37 and mimo-v2.6-pro 4 of 28.

The reviewers' findings on attempt 1 (326 findings; data/attempt1-finding-kinds.tsv) were mostly omissions (108), then semantics (63), completeness (49) and fabrication (44).

The project replaced deepseek-flash with glm-5.3-flash as the first model for its next run. It counted that as the same tier in another family: both are cheap generalists in the model-tier registry.

## Why the comparison is weaker than it looks
- **Position confound.** deepseek-flash always made attempt 1 of a phase. The other two models saw a phase only after attempt 1 had failed, or after a provider failure, often with the reviewer's findings in hand. This data cannot separate "worse model" from "harder position".
- **No model does well.** The best rate here is 16%. The finding kinds (omission, completeness) point at least as much at the size of the request per call as at the model.
- **Identity is the route label only.** The events record the requested model and provider. No served-model receipt was read, so every row is `identity_status: route_label`. None binds to a model-registry card.
- **Mixed labels.** Five rejections carry failure class provider_failure with cause quality. Until that labelling is resolved, they cannot be charged to the model or to the route.

## Replication plan (controlled)
- Take a fixed set of phases with their recorded inputs, and give each one fresh to each of the three models at position 1, with the same request and the same reviewer. That is 3 models × N phases, with the order randomized.
- The oracle is the reviewer's accept/reject on the frozen input, with the reviewer constant and blind to the model.
- Record served model ids, and record a timeout or provider pause as uncharged, never as a rejection.

## Durable eval case
input: one phase's frozen request at attempt 1; oracle: the reviewer's verdict and the finding kinds; pass: a model's first-attempt acceptance rate measured at position 1 for every model, not inferred from ladder order.

## What this case does not show
It does not rank the three models overall, and it does not show that glm-5.3-flash will do better at position 1. The project's next run is the first observation of that.

## Scrub notes
The source project, its paths and its run ids are removed. Model names are the provider's model ids, as the runs recorded them. Counts were recomputed by this PM from the four runs' event logs (operation `ladder_attempt`: model and outcome) and agree with the source project's own counts for deepseek-flash. For glm-5.3-flash, one source opinion counted 37 rejections where the event logs give 31 rejected and 23 uncharged; this file uses the event-log counts.

failure_class: model (first-pass quality), confounded by ladder position
