# Complexity debt

Complexity is a vector, not a scalar score. Measure enough independent signals
to detect whether cleanup made the repository harder to understand, change,
verify, or ship. Do not manufacture a universal grade.

## The no-harm rule

Freeze the applicable measurements before the first relevant mutation. Measure
the same subject with the same classifier and tool version after each coherent
action and on the closing candidate.

An increase is not automatically debt: required behavior can require more code,
tests, or explanation. It becomes cleanup-introduced debt when the increase is
avoidable, unexplained, contrary to an adopted repository policy, or leaves the
successor with more places to inspect or change than the outcome requires.
Repair it inside the action or roll the action back. A favorable aggregate does
not offset a new complexity regression.

For every changed signal record:

- subject commit or exact tree;
- classifier and tool version;
- before, after, and delta;
- affected paths or components;
- `necessary_and_minimal`, `payable`, `policy_exception`, or `unestablished`;
- evidence for the disposition and the smallest coherent alternative considered.

`unestablished` forbids `CLEAN`. Do not infer a trend from measurements with
different categories, language coverage, line-count rules, refs, or ignored-file
semantics.

## Version-7 rejected-candidate concentration disposition

The comparison uses analyzer source SHA-256
`db7bc804424762f9b0ae3e2a663b57e74834b67021a9adaeaeb6c6835cb62a53`
for all three subjects. Release 6.3.0 measured 39,927 lines, 639 functions,
maximum function length 554, and maximum cyclomatic complexity 202. The
rejected version-7 RepositoryObject measured 102,456 lines, 2,152 functions,
and maxima 643/213; `auditPlanningArtifacts` alone was 643/213.

The repair extracted repository-wide declaration indexing and completion
rollups while retaining the 137-test planning corpus;
`auditPlanningArtifacts` is now 455/148. It also replaced the 4,322-line bundle
policy blob with cohesive runtime, detector evidence, regression accounting,
action evidence, GUARD authority, and live-validation contracts. The public
`bundle.ts` boundary is 570 lines. Native-gate discovery, sandbox execution,
and evidence validation now have separate contracts; action lifecycle storage
and transaction custody are isolated from lifecycle policy. These are
`necessary_and_minimal` responsibility seams, not wrappers around one moved
monolith: the module graph remains acyclic and the full mutation corpora call
the same public entrypoints.

The newly worsened functions were reduced at their state-transition seams:
`validateSuccessor` 269/190 -> 19/4, `validateLive` 335/143 -> 23/5, and
`validateRegressionActionChain` 397/111 -> 290/59. Their extracted phases have
named inputs and preserve sequential fail-closed error accumulation.

Remaining concentrations are explicit rather than hidden by an aggregate
score:

| Surface | 6.3.0 lines/cyclomatic | Repaired v7 lines/cyclomatic | Disposition and evidence |
|---|---:|---:|---|
| `validateGuard` | 321 / 171 | 364 / 200 | `necessary_and_minimal` for the version-7 four-role receipt, sealed barrier, and schema-1.3 authority fields; covered by the records and bundle mutation corpus. Further work is payable when that policy changes, not as an unrelated repair. |
| `auditPlanningArtifacts` | 554 / 175 | 455 / 148 | `necessary_and_minimal`; indexing and completion rollups are extracted, while this function retains only ordered planning-graph adjudication. |
| `validateManifest` | 186 / 167 | 252 / 186 | `necessary_and_minimal` for versioned coordination and GUARD projections; covered by manifest mutations. Further decomposition belongs with a schema-policy change. |
| `validateDetectorCoverage` | absent | 277 / 113 | `necessary_and_minimal`; one registry-bound execution-census validator, with runtime/reference utilities and regression accounting outside it. |
| `validateRegressionComparatorEvidence` | absent | 263 / 107 | `necessary_and_minimal`; one comparator observation-chain validator, separated from action-chain and debt-rollup policy. |
| `validateGuardLiveAuthority` | absent | 244 / 109 | `necessary_and_minimal`; one external-authority and live-Git transition, isolated from structural bundle validation. |
| `validateNativeGateCoverage` | absent | 201 / 115 | `necessary_and_minimal`; one schema/evidence/closing-object validator, separated from discovery and execution. |
| `src/closeout/bundle.ts` | 1,301 file lines | 570 file lines | `necessary_and_minimal`; public orchestration plus criteria/planning/change-inventory validation, with five evidence-policy modules behind named contracts. |

These are not exceptions and do not combine into a “CLEAN score.” A future
change that adds another responsibility to one of these functions is payable
unless it first extracts a coherent validation phase with its own contract and
mutation controls.

## Minimum measurement vector

Select the signals applicable to the repository and state unsupported portions.
Keep their denominators separate.

1. **Committed composition** — files, bytes, and physical text lines for
   production code, tests, public documentation, planning/protocol, generated
   content, config/tooling, evidence/research, vendored dependencies, and
   design/assets.
2. **Ignored composition** — dependencies, build/cache, local evidence, and
   other ignored material. Nonignored untracked material remains repository
   debt, not an ignored category.
3. **Structural shape** — function length distribution, cyclomatic or cognitive
   complexity where the language supports it, oversized files, module edges,
   unresolved imports, and dependency cycles. Enumerate unsupported languages.
4. **Change amplification** — exact duplication, repeated configuration,
   components touched per change, and size-times-change-frequency hotspots when
   sufficient history exists.
5. **Dependency custody** — direct dependency breadth, vendored package identity,
   pin/checksum evidence, and vendor growth. Report vendor and generated weight
   separately from authored production code.
6. **Shipped boundary** — explicit build context and the measured final package,
   image, or deploy artifact. Repository size and dependency-cache size are not
   substitutes for shipped size.

Physical lines are not logical LOC. Function length and file length are
different measures. A zero-cycle graph does not prove readable code. Keep each
claim bounded to its actual detector.

## Documentation and planning ratios

Classify by purpose, not `.md` extension. A Markdown fixture may be test data;
generated API documentation may be shipped output; a planning artifact is not
public product documentation.

Track at least these ratios independently:

- planning/protocol to production;
- public documentation to production;
- tests to production;
- local ignored evidence to committed production;
- support surface to production, with its included categories named.

There is no universal healthy documentation-to-code ratio. A high ratio is a
review signal, not proof of AI-generated slop. Prefer direction over a single
snapshot: compare fixed-size commit windows and ask whether planning is growing
faster than production plus tests after the decisions it describes are already
settled. Never penalize tests merely for outnumbering production lines.

A repository may adopt explicit local thresholds. Label them as repository
governance, preserve the policy name, and distinguish `warn`, `review`, and
`block`. Mister Clean must not present a case-study heuristic as an industry
standard.

## Repair strategy

Pay causes before symptoms. Prefer one coherent change that removes repeated
decisions or change sites: consolidate a stable configuration, correct the
workspace source of truth, shrink an over-broad build context, retire obsolete
planning, or split a genuine hotspot along an existing responsibility boundary.

Do not chase a metric by scattering files, deleting useful tests or public
documentation, hiding evidence in ignored storage, or replacing understandable
code with dense indirection. A smaller tree can be harder to change. The final
question is whether the successor needs fewer independent facts and change sites
to produce the same correct behavior.

## Current analyzer boundary

The Mister Clean source repository includes
`scripts/measure_codebase.ts`, which emits
`mister-clean.codebase-complexity/1.1` for a requested Git ref and separately
measures the current ignored working surface. It uses the TypeScript compiler API
for TypeScript/JavaScript structure and fails closed on unclassifiable tracked
paths.

For a dirty or uncommitted candidate, pass an exact schema-1.0
`mister-clean.repository-object` through `--repository-object FILE`. This mode
emits `mister-clean.codebase-complexity.repository-object/1.1`, re-captures and
matches every RepositoryObject field, and analyzes the tracked-plus-nonignored
worktree bytes obtained from the same verified traversal that hashes the object.
The report reconciles regular files, symlinks, missing tracked entries, and
gitlinks exactly to `entry_count`. Ignored files are outside this object and are
therefore excluded rather than mixed into its complexity claim.
The RepositoryObject JSON input must live outside the measured repository
surface or in an already-ignored evidence location; placing a digest-bearing
input inside its own subject would create a self-reference.

In RepositoryObject mode, `--out` must also resolve outside the measured
repository. The wrapper resolves existing parent and destination symlinks before
this check, then refuses an output that would create or overwrite a subject
path. Write the object input and report to an external evidence directory (or
use stdout); the measurement command must not itself change the candidate it
claims to describe.

`--ref` and `--repository-object` are mutually exclusive. Commit/ref mode and
the first-parent history generator retain their existing committed-tree
semantics. Compare before/after complexity only when both reports use the same
subject kind, schema, classifier version, line rules, and ignored-file basis.
RepositoryObject mode rejects policy thresholds whose names require committed
or ignored denominators.

### Report identity and generated distribution mirrors

Schema 1.1 preserves every schema-1.0 measurement field and adds an `analyzer`
identity with the analyzer ID, exact source SHA-256, classifier ID/version, and
TypeScript version. A longitudinal comparison is established only when those
identity values, report schema, subject kind, line rules, and ignored-file basis
all match. Schema-1.0 reports remain historical observations; do not silently
compare them to schema-1.1 reports.

Generated distribution mirrors are visible in
`surfaces.*.generated_distribution_mirrors` and in the existing `generated`
category, never in authored `production_code`. The classifier uses two pieces
of evidence rather than a project-specific filename rule: a conventional
distribution/executable root (`bin`, `dist`, `build`, or `out`) and emitted
bundler provenance (`// node_modules/` sections plus a bundler helper). This
keeps bundled/shipped bytes and physical lines inspectable without inflating
authored function counts, hotspots, or documentation-to-production ratios.

`unresolved_relative_imports` in schema 1.1 is limited to absent
TypeScript/JavaScript module targets. Present Svelte, CSS, HTML, and other
unsupported subject assets appear separately in
`present_unsupported_relative_imports`; conventional generated-module imports
outside a RepositoryObject appear in
`declared_generated_boundary_relative_imports`. Neither auxiliary list is a
payable unresolved-import finding without a language-aware detector that
establishes a real defect.

This analyzer is currently a source-checkout development instrument, not a
promised command in the globally packed runtime. An installed runner must use
repository-native tools or another explicitly versioned analyzer and disclose
coverage gaps. Do not claim this measurement exists merely because the reference
describes it.
