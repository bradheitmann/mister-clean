<!-- charter v1: harness-independent contract. Do not remove. -->
# Charter (binding for every agent, every harness)
1. Before designing, dispatching, or claiming anything done, read `charter/` in this repo: INTENT.md, GUARANTEES.yaml, LOOPS.yaml, STOP-RULES.md, DONE/<your slice>.md, STATE.md. If any is missing or stale, your first task is to produce it with the owner; do not proceed past it.
2. Done means every proof in `charter/DONE/<slice>.md` executed and its run reopened and compared. It never means "no findings". New findings become recorded obligations on the next bounded slice unless they break a guarantee listed in GUARANTEES.yaml.
3. The stop rules in `charter/STOP-RULES.md` bind you. You may not relax them. A change to them exists only as `charter/owner-decisions/<date>-<slug>.md`.
4. Every guarantee you add gets an owner, a proof and a cost. Every loop you add gets a bound, a cost per trip and a stop condition. No exceptions for "small".
5. Nothing scales before `charter.toml [slice_zero]` has `proven_on` set from a real run.
6. Before you stop, hand off, or approach a context limit: rewrite `charter/STATE.md` (proven, not proven, exact last-green and last-red commands, next three bounded items, open owner decisions). No decision may live only in a pane or transcript.
7. Run `charter check` (or `hooks/charter-check.sh`) before any commit or "ready" claim. Rust only; no Python.
<!-- end charter -->

# Engineering standard
This repository follows [COMMON-STANDARD.md](COMMON-STANDARD.md). How each section maps to this repository's gates, and the open gaps, are in [charter/STANDARD-ADOPTION.md](charter/STANDARD-ADOPTION.md).
