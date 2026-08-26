# Semantic boundary probes — prove the mechanism, not the label

Static language such as “safe by construction” or “wired at the production
composition root” identifies a **candidate contract**. It is not evidence that
the product is defective or correct. Mister Clean turns each distinct claim
into a stable candidate and requires one explicit disposition:

- `execute`: run an adversarial construction/composition probe;
- `operate_time_pending`: name the operator, exact next action, and required
  live evidence; this remains NOT CLEAN; or
- `not_applicable`: prove the sentence is genuinely non-operative with
  repository-relative, SHA-256-bound evidence.

## Bind the whole observation surface

Use semantic-manifest schema 1.1. It binds:

```json
{
  "record_type": "mister-clean.semantic-probes",
  "schema_version": "1.1",
  "observed_at": "<timezone-aware ISO timestamp>",
  "subject_commit": "<current HEAD>",
  "subject_tree_sha256": "<non-ignored working-tree snapshot, excluding this manifest>",
  "candidate_set_sha256": "<complete discovered candidate-set digest>",
  "probes": []
}
```

Candidate identity is a fingerprint of kind + repository-relative path +
normalized claim. Moving a claim to another line does not rename it; two claims
in one document do not collapse into one debt. The candidate-set digest prevents
a manifest from proving only the convenient subset. The working-tree digest
prevents a manifest bound to HEAD from silently reading different dirty content.
The audit result records both digests plus the manifest digest and never embeds
an absolute manifest path.

An invalid manifest creates one manifest-repair root debt. It does not fan out
one unassigned debt per candidate while the common binding record is unusable.

## Executable receipt contract

Exit zero is necessary but not sufficient. The probe must print exactly one
single-line JSON receipt amongst any human-readable runner output:

```json
{"record_type":"mister-clean.semantic-probe-receipt","schema_version":"1.0","candidate_id":"<injected id>","subject_commit":"<injected HEAD>","subject_tree_sha256":"<injected tree digest>","candidate_set_sha256":"<injected set digest>","exercised_cases":["case-a"],"passed_cases":["case-a"],"failed_cases":[],"result":"pass"}
```

Mister Clean injects the bound values as
`MISTER_CLEAN_CANDIDATE_ID`, `MISTER_CLEAN_SUBJECT_COMMIT`,
`MISTER_CLEAN_SUBJECT_TREE_SHA256`,
`MISTER_CLEAN_CANDIDATE_SET_SHA256`, and
`MISTER_CLEAN_REQUIRED_CASES_JSON`. The receipt must exactly partition every
required case into passed/failed sets. A pass requires all cases passed, zero
failed cases, and process status zero. A fail requires at least one failed case
and nonzero status. A missing/malformed receipt, status disagreement, or probe
that mutates the bound working tree is verification debt—not a product defect.

## Commands

```bash
mister-clean audit semantic . --json
mister-clean audit semantic . --manifest <manifest.json> --json
mister-clean audit semantic . --manifest <manifest.json> --execute --json
```

Run the first command to discover candidates and obtain their IDs/digests. Build
the complete bound manifest, inspect it, then execute under CLOSE authority.
