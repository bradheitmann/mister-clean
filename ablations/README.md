# Ablations

Controlled A/B evaluations that change ONE thing about what a judge sees and hold everything else fixed. The judge is the model, harness and reasoning level, plus the route. This is not field evidence (that lives in `field-evals/`), and these files are not shipped.

## View ablation (`ablation-replay/1`)
Question: does changing how an input is presented to a judge change the judge's verdicts or findings by more than the judge's own run-to-run variance? Examples of a change: inline content versus content served by reference, or a full document versus a delta.

Design rules:
- **Same input, same judge, same settings in both arms.** Arm A is the baseline view; arm B is the changed view. Record the judge identity (model, harness, reasoning level, route) on every replay.
- **k ≥ 3 replays per arm and item.** The k replays inside an arm are the noise floor. A difference between arms counts only when it exceeds that floor.
- **Name the cost cap before the first call**, and stop when it is reached. Record per-replay tokens and cost.
- Only findings the judge marks `blocking` are compared, keyed by `affected ref | defect class`. Advisory findings are reported but not scored.

Record format and metrics: see the header of `view-ab.ts`. Per item, the report gives:
- each arm's pass count and majority verdict;
- `flip` (the majority verdict differs between arms);
- `cross_verdict_agreement` (the share of A×B replay pairs with the same verdict);
- within-arm and cross-arm Jaccard of blocking-finding sets;
- `findings_moved_beyond_noise` (cross-arm Jaccard below the lower within-arm Jaccard);
- the blocking findings that hold in a majority of one arm and appear in none of the other.

Run: `bun ablations/view-ab.ts <replays.jsonl>`. Self-test: `bun ablations/view-ab.ts --self-test`.
Fail-without mutant: `mutants/noise-test-never-fires.patch` makes the noise test unreachable, and the self-test then fails.

The comparator is generic. A consuming project owns producing the replay records from its own judge path, and keeps the record files and any project text out of this repository.
