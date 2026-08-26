# Mister Clean

Mister Clean is an agent skill for closing repository work all the way: paying
completion debt, reconciling planning and Git state, validating the result,
and leaving a successor-ready codebase. Its premise is simple: the repository
is the next team's prompt, so a clean inheritance creates intelligent momentum
while an unfinished one compounds debt across every later session.

Invocation is standing authorization for the procedures documented in the
skill. Ordinary in-scope cleanup is performed, not queued; hard safety and
ownership boundaries remain hard boundaries.

Its first rule is do no harm: every atomic cleanup action reruns the affected
hygiene comparators, and zero cleanup-introduced debt may cross an action,
commit, checkpoint, or handoff boundary. Net improvement never excuses a new
regression; the closeout bundle binds the before/after debt classification and
per-action checks in `regression-delta.json`.

## Use the skill

Install this repository as a skill in an agent harness, then invoke:

```text
$mister-clean
```

The entrypoint is [SKILL.md](SKILL.md). It routes to focused references only
when the current repository makes them relevant.

## Use the MCP server

Run the local stdio server:

```sh
pnpm dlx --package @bradheitmann/mister-clean mister-clean-mcp
```

Or connect a Streamable HTTP client to:

```text
https://mister-clean.bradheitmann.ai/mcp
```

The MCP server is intentionally read-only. It exposes the canonical skill,
references, templates, examples, and closeout prompt; the invoking agent does
the authorized work locally where repository policy and ownership can be
verified.

## Validate a closeout

The authoritative local validators are exposed through one Node-compatible
CLI:

```sh
mister-clean validate report path/to/closeout-report.json
mister-clean validate manifest path/to/action-manifest.json
mister-clean validate bundle path/to/closure-bundle.json --repo path/to/live-checkout
mister-clean audit planning path/to/live-checkout --json
```

The planning audit is an executable successor-readiness floor. It parses
Markdown/MDX YAML frontmatter plus top-level JSON and YAML object records,
discovers both planning directories and exact canonical files such as
`ROADMAP.md`, `STATUS.md`, `PLAN.md`, `TASKS.md`, `BACKLOG.md`, and `CURRENT.md`,
reconciles physical lanes and current body state, resolves exact child IDs from
structured lists and child tables, and groups duplicate projections of the same
acceptance gate. Malformed structured records, unsupported lifecycle or gate
states, contradictory parentage, a bundle-only archive label, missing gates
after completed children, and unexecuted or failed acceptance all return
nonzero. Every planning item must be structurally placed in one verified
lifecycle/relationship graph or explicitly classified as non-artifact
guidance with a rationale. A guidance/template/schema label never overrides
lifecycle, identity, relationship, child-table, or acceptance signals;
acceptance can be `not_applicable` only with a structured rationale.
Repository-specific schemas and validators still run in addition to this
conservative cross-repository gate.

Child references have an explicit semantic role. Normal work artifacts use
`child_parentage`: a child row resolves to exactly one artifact and creates a
graph edge. Artifacts typed `index`, `status_index`, or `rollup` use
`rollup_projection`: every row must still resolve uniquely and match current
state, but it never becomes a second parent. A repository-specific artifact
may override the default with `relationship_role: child_parentage` or
`relationship_role: rollup_projection` plus a
`relationship_role_rationale`; unsupported, conflicting, ambiguous, or
unexplained overrides fail closed. Built-in hierarchy and rollup types have
immutable roles, so a rationale cannot relabel a story/task as an index or an
index as a parent. Rollups recognize canonical work-item target columns; a
repository-specific column requires `rollup_target_column` and
`rollup_target_column_rationale`; a custom parent table uses
`child_target_column` and `child_target_column_rationale`. A state-bearing
relationship table with no recognized or declared target column fails closed.
Every table row and structured child collection entry must contain one
resolvable identity; projected states must be recognized and coherent.
CamelCase and snake_case record keys share the same schema. Ordinary hierarchy
artifacts may exempt a checklist/decision-table target column with
`non_relationship_table_columns` plus
`non_relationship_table_rationale`; rollup artifacts and canonical
relationship/lifecycle columns cannot use that escape.
Artifact type, identity, lifecycle, role, target, rationale, and `top_level`
aliases are presence-aware: each declared singular alias must contain one
nonempty scalar and equivalent aliases must agree. Inference or a default is
allowed only when the corresponding alias is absent. Duplicate JSON keys,
unsupported state-like aliases, malformed relationship scopes, and compound
lifecycle prose fail closed. Only the artifact's own typed ID and generic `id`
establish its identity, never a parent field. Singular, plural, snake-case, and
camel-case child/parent reference aliases are reconciled entry-by-entry;
parent-reference lifecycle must match the resolved parent.

Acceptance discovery follows supported parent relations recursively through
structured records and validates every declared outcome scope; a
`not_applicable` rationale must be in that exact scope. Structured JSON/YAML is
never reinterpreted as prose. Markdown scanning ignores fenced examples and
HTML comments while still reconciling visible heading and blockquote status
labels, acceptance labels, pending review language, and unchecked acceptance
items. Nested canonical work declarations and type-unresolved hierarchy aliases
cannot hide behind generic metadata or non-artifact classification. Unsupported,
binary, and symlinked entries inside a discovered planning root fail the
standalone audit; a CLEAN bundle must include every live entry and explicitly
classify unsupported regular files as reasoned non-artifacts.

The installed skill resolves the same standalone CLI from its own
`bin/mister-clean.js`; it never
assumes the target repository contains Mister Clean tooling. Keep the report,
manifest, bundle, and their digest-bound evidence records together under one
run directory.

Run the full project check before proposing a release:

```sh
bun install --frozen-lockfile
bun run check
bun src/cli.ts audit public-safety .
```

## Public-safety boundary

The public distribution contains generalized doctrine and synthetic examples.
Private case studies, local paths, credentials, project names, and operational
evidence do not belong in this repository or its Git history.

## License

MIT
