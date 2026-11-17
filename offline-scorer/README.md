# Offline scorer

Scores saved model answers against a case set and calls no model. It is the measurement foundation for evaluating agents: it shows that a result can be recomputed from files, by anyone, with the same bytes out. It says nothing about how the answers were produced. These files are not published with the package.

Run: `bun offline-scorer/score.ts <case-set.json> <answers.jsonl>` prints one report. Self-test: `bun offline-scorer/score.ts --self-test`.

Exit codes: 0 with a report on stdout; 2 when either input is refused, with every problem on stderr and nothing on stdout; 1 when the self-test fails.

## The three records

**Case set** (`eval-case-set/1`), one JSON file:

| Field | Meaning |
|---|---|
| `id`, `version`, `task_class`, `provenance` | What the set is and where its cases came from. |
| `kind` | `label`: the answer is one of the declared `labels`. `exact`: the answer is one exact text. |
| `floors.min_attempts_per_case` | How many attempts a subject needs on a case before the case counts as answered. |
| `floors.min_cases_passed` | How many cases a subject must pass to meet the floor. |
| `cases[].input`, `cases[].input_sha256` | The full prompt the subject was given, and the sha256 of its UTF-8 bytes. |
| `cases[].expected` | The label or the exact text. |
| `cases[].material` | Optional. The part of the prompt the expected value is computed from; an oracle check can use it. |

The floors are part of the file, and every answer names the sha256 of the whole file. A floor or a case that changes after the answers were made changes that hash, and the scorer then refuses every answer.

**Answer** (`eval-answer/1`), one JSON object per line:

| Field | Meaning |
|---|---|
| `case_set_sha256`, `case`, `input_sha256` | Which file, case and prompt this answers. |
| `subject` | `id`, `harness`, `model`, `reasoning`, `provider`, and `identity_status`: how the identity was observed. `receipt` means a harness log; `title_only` and `contract_only` mean a weaker source; `synthetic` means a hand-written fixture, not a model. |
| `identity_evidence_sha256` | The sha256 of the harness log of this call. Required with `receipt`, otherwise it may be null. |
| `attempt` | 1, 2, 3 and so on, for repeated attempts at one case. |
| `output`, `output_sha256` | What the subject returned, and the sha256 of its UTF-8 bytes. |
| `tokens_in`, `tokens_out`, `cost_usd` | Numbers, or null when unknown. |

One subject id has one description in a file. The same id with another model, harness or status is refused.

**Report** (`eval-score/1`): the scorer's name, version and the sha256 of its own source; the case set's id, hash and floors; the hash of the answers file; and one entry per subject, sorted by id. The same inputs and the same scorer give the same bytes.

## How a subject is scored

1. Each attempt is judged from its output with outer whitespace removed. For kind `exact` it passes when it equals the expected text. For kind `label` it passes when it equals the expected label, fails when it is another declared label, and is `malformed` when it is anything else.
2. A case is `unanswered` with fewer attempts than the floor. Otherwise it passes when more than half of its attempts pass.
3. The outcome is `insufficient_evidence` when any case is unanswered, `meets_floor` when the passed cases reach the floor, and `below_floor` otherwise.
4. `identity_bound` is true only for `identity_status: "receipt"`. The scorer checks that the log hash is present; whoever holds the logs checks that it is the right log.
5. A total of tokens or cost is null when any attempt's value is unknown.

A case set of kind `label` is refused when answering one label every time would meet its floor. `constant_label` in the report names such a subject.

## Limits

- A report describes saved answers. It is not evidence that a model was called, or how.
- The scorer does not rank subjects, and a result on a few cases says little about a model.
- Case sets with private expected values are not supported; every expected value is in the file.

## Slice Zero files

`slice-zero/` holds two synthetic case sets (`json-validity`, kind `label`; `canonical-json`, kind `exact`), hand-written fixture answers for each, and the report each fixture file must produce. `slice-zero/oracle-check.ts` recomputes every expected value from the case's material.

`mutants/` holds four patches. Each breaks one rule of the scorer, and the self-test fails with each applied:

| Patch | Rule it breaks |
|---|---|
| `trusts-recorded-hash.patch` | An output is checked against its recorded hash. |
| `unanswered-case-ignored.patch` | A case with too few attempts is unanswered. |
| `identity-flip-accepted.patch` | One subject id has one description. |
| `floor-allows-constant-label.patch` | A constant label can never meet the floor. |
