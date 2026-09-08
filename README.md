# Mister Clean

Mister Clean is an agent skill for making repository hygiene durable. `CLOSE`
pays inherited completion debt, reconciles code, planning, and Git into one
trustworthy reality, and leaves the next team ready to build. `GUARD` applies
the same standard at the commit boundary so unclean work never enters accepted
history.

Its premise is simple: the repository is the agent team's shared memory. A
clean inheritance lets every session start with leverage; an ambiguous one
makes every successor pay to reconstruct the same reality. Mister Clean pays
that debt once, at the source, then protects the gain.

Version 7 connects three surfaces around that contract:

- the skill gives an orchestrating agent standing authority and a pay-until-paid
  procedure;
- the CLI and MCP surfaces provide the same validators, templates, and exact
  evidence contracts without making a second cleanliness authority;
- the local Bun, SQLite, and Svelte control plane shows whether debt is actually
  falling, orders remediation through the issue DAG, tracks complexity and
  no-harm movement, and recommends evidence-qualified model + harness +
  reasoning-level tuples by remediation capability.

The report leads with one plain number—real issues remaining—then preserves the
separate flows behind it: pre-existing debt discovered, debt paid, debt caused
by cleanup, false positives invalidated, corrections, and genuine boundaries.
Better detection can expand known scope without falsely claiming the repository
became dirtier; cleanup-created debt is always a regression.

Invocation is standing authorization for the procedures documented in the
skill. Ordinary in-scope cleanup is performed, not queued; hard safety and
ownership boundaries remain hard boundaries.

Its first rule is do no harm: every atomic cleanup action reruns the affected
hygiene comparators, and zero cleanup-introduced debt may cross an action,
commit, checkpoint, or handoff boundary. Net improvement never excuses a new
regression. Schema 1.5 keeps raw detector observations and normalized root
debts in separate identity ledgers, so paying one cause with many symptoms can
never make unlike counts look like progress.

Mister Clean applies that rule to itself. Every commit candidate in this
repository must cross the exact-tree `GUARD` barrier and a read-only dogfood
run by the last accepted release pinned by version and runtime digest; the
working candidate cannot certify itself. Registry publication and the website
are one version-bound release transaction, preceded by a full repository
`CLOSE` treatment and independent acceptance.

## Use the skill

Install this repository as a skill in an agent harness, then invoke:

```text
$mister-clean
```

The entrypoint is [SKILL.md](SKILL.md). It routes to focused references only
when the current repository makes them relevant.

For a closeout expected to span multiple agent turns, the optional
[persistent orchestration-goal template](templates/orchestration-goal.md) keeps
the pay-until-paid loop, no-harm boundary, and terminal condition stable across
continuations. It is not required for invocation and never establishes CLEAN
by itself.

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
references, templates, examples, closeout prompt, and optional persistent-goal
prompt; the invoking agent does the authorized work locally where repository
policy and ownership can be verified.

Installed CLI, stdio MCP, and the root package-library entrypoint verify their
exact packaged file surface before becoming usable. The separately exported
local control-plane bytes are included in the package manifest and claim scope,
and have their own source, built-package, and packed-consumer gates. Its runtime
file `./dist/control-plane.js` is not a required entrypoint, and the control-
plane runtime performs no runtime-attestation binding before use. During capsule construction,
Mister Clean verifies the local clean exact tag and records it as
`claimed_source`. After the capsule is detached, its attestation and receipts
prove internal byte consistency only: they are not signatures and do not
authenticate the Git remote, tag signer, CI run, transport, or capsule origin.
Publication therefore requires a capsule obtained through an operator-trusted
channel. Registry publication, dependency resolution, mode bits, xattrs, and
timestamps remain outside the package attestation. The HTTP worker has no
package filesystem, so its attestation reports the narrower
`bundled_content` status and the digest of only the canonical material table
compiled into that deployment.

## Use the local control plane

The package exposes one supported local runtime entrypoint:

```ts
import { startLocalControlPlaneRuntime } from "@bradheitmann/mister-clean/control-plane";
```

`startLocalControlPlaneRuntime` is the only runtime value; the declaration
surface additionally exports only `LocalControlPlaneRuntimeOptions` and
`RunningLocalControlPlaneRuntime`.

Run this surface with Bun. It uses `bun:sqlite` and accepts only exact own
transport fields for a repository database, bearer token, optional global
database, Unix socket, and loopback HTTP listener. It is a query and
state-admission boundary, not an agent runner: the returned handle reports
`dispatch_supported: false` and `execution_supported: false`. Route probes,
evidence verifiers, clocks, stores, services, authenticators, and adapters are
internal composition capabilities and cannot be injected through the public
function. Package deep imports are blocked; use only the documented export.

For retained logical-project alias admission, startup may additionally receive
`logical_project_registration_receipts`: a bounded list of exact receipt
digest/operator pairs. This is a declarative trusted-runtime allowlist, not a
client bearer claim or callback. Each registration retains bytes whose
canonical content binds that logical project, its physical repository IDs, and
the configured actor; an omitted, altered, or unlisted receipt is denied.

The canonical `runCli` lifecycle accepts one explicitly installed local
evaluation adapter. At CLI run start it submits an already observed,
evidence-bound `evaluation.run.start` envelope to loopback control-plane RPC.
It does not launch a model, inspect providers or unrelated processes, infer an
agent identity, or synthesize an outcome. Without this adapter, no activity is
monitored and no evaluation event is invented.

The shipped CLI resolves its machine-local invocation journal under
`XDG_STATE_HOME/mister-clean/` (or `HOME/.local/state/mister-clean/`), with an
optional absolute `MISTER_CLEAN_INVOCATION_JOURNAL_PATH` override. It appends
an identity-unobserved invocation receipt before every accepted hygiene command
runs, including when it later fails or no evaluator envelope is supplied; only
a retained evaluator start can append a link to an agent run event. A journal
integrity or write failure stops the command. Help/version-style input is not a
hygiene invocation and does not create a receipt. The MCP server exposes
bundled read-only materials and does not share this hygiene execution path;
free-form use of the skill outside the CLI or an explicitly integrated
lifecycle remains unobservable rather than being represented as machine-wide
surveillance.

## Validate a closeout

The authoritative local validators are exposed through one Node-compatible
CLI:

```sh
mister-clean validate report path/to/closeout-report.json
mister-clean validate manifest path/to/action-manifest.json
mister-clean validate bundle path/to/closure-bundle.json --repo path/to/live-checkout
mister-clean audit planning path/to/live-checkout --json
```

Any live bundle with an executed `git_commit` requires an absolute
`--accepted-evaluator` path. A live passed/open or crossed/executed
`closeout_guard` schema-1.3 boundary additionally requires an absolute
`--guard-authority` path, so that GUARD case supplies both:

```sh
mister-clean validate bundle path/to/closure-bundle.json \
  --repo path/to/live-checkout \
  --accepted-evaluator /absolute/path/to/accepted-release.json \
  --guard-authority /absolute/path/to/guard-authority.json
```

The accepted-evaluator record binds the previously accepted installed release;
the guard-authority record binds the current exact candidate or commit, selected
receipt seals, chronology, retained precommit authority, and live repository
state. Inline copies and the working candidate cannot replace either authority.
Both options are valid only for live bundle validation and are rejected with
`--structural`. Generic action manifests use schema 1.2; every newly prepared
GUARD closeout is schema 1.3 from initialization while reusing schema-1.2
coordination semantics. Initialized/closed GUARD scaffolds require neither
external input; live schema-1.2 open/crossed authority is closed.

The planning audit is an executable successor-readiness floor. It parses
Markdown/MDX YAML frontmatter plus top-level JSON and YAML object records,
discovers both planning directories and exact canonical files such as
`ROADMAP.md`, `STATUS.md`, `PLAN.md`, `TASKS.md`, `BACKLOG.md`, and `CURRENT.md`,
and conservatively probes root/docs/reference/spec surfaces for a live
implementation status plus implementation sequence. A planning-shaped live
contract outside canonical discovery fails until a canonical planning artifact
projects its exact path; inactive reference examples remain references.
It reconciles physical lanes and current body state, resolves exact child IDs from
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

`mister-clean prepare` is the sole producer of new schema-1.5 regression
evidence. The packaged schema-1.4 JSON remains a structural, NOT CLEAN teaching
template so it never has to make a self-referential claim about the package
manifest that contains it.

### Prepare and pay one debt through the public action lifecycle

Prepare one live CLOSE boundary. The command prints the created bundle
directory:

```sh
BUNDLE_DIR="$(mister-clean prepare \
  --repo /absolute/path/to/repository \
  --evidence-home /absolute/path/to/private-evidence \
  --run-id closeout-001 \
  --request-ref request-001 \
  --request-source /absolute/path/to/operative-request.txt \
  --mode CLOSE)"

mister-clean validate bundle "$BUNDLE_DIR/closure-bundle.json" \
  --repo /absolute/path/to/repository
```

Choose an unresolved `debt_key` from
`$BUNDLE_DIR/closeout-report.json`, then open the exact action before changing
the repository:

```sh
DEBT_KEY="<lowercase SHA-256 debt_key from closeout-report.json>"

mister-clean action begin "$BUNDLE_DIR" \
  --id pay-planning-projection \
  --debt-key "$DEBT_KEY" \
  --kind local_edit \
  --target planning/done/STORY-17.md \
  --purpose "reconcile the canonical story state"
```

`begin` live-validates the existing boundary, obtains exclusive ownership of
the evidence home, proves that the full repository object still equals the
last boundary, freezes the registered-detector policy, captures detector and
repository-native-gate pre-state, and appends a versioned coordination domain,
owned lane, and planned operation. Make only the declared change, run the
repository's normal checks, and commit it so the working tree is clean. Then
close the same action:

```sh
mister-clean action finish "$BUNDLE_DIR" \
  --id pay-planning-projection \
  --status closed
```

`finish` captures the new full repository object, reruns every frozen
registered detector and the repository-native gates, derives causal regression
accounting from their exact outputs, updates the report, manifest, regression
ledger, change inventory, successor projections, and bundle digests as one
live-validated transaction. It refuses `closed` when the target debt remains
unpaid, an action-introduced observation remains open, a declared target does
not cover every changed path, or a required native gate was weakened.

Use `--status interrupted` only when comparator evidence proves an open
action-introduced observation; the resulting failed action and blocked lane
remain the final NOT_CLEAN boundary. The current regression schema cannot
honestly encode a zero-observation interruption, so that case remains open for
continued repair rather than manufacturing a debt record.

The generic lifecycle supports `local_edit`, `local_move`,
`recoverable_delete`, `format`, `generate`, `doc_update`, `git_commit`,
`historical_conform`, and `handoff_update`. It rejects
`planning_record_update`, `git_integrate`, `git_push`, and `agent_dispatch`
because those operations require their dedicated projection, CAS/mutex, push,
or dispatch receipts; a generic command must not fabricate them.

Run the full project check before proposing a release:

```sh
pnpm install --frozen-lockfile
bun run ci:check
```

The public `build` / `build:verified` command is verification-only: it rebuilds
the candidate in a private external capsule and compares the required generated
outputs byte-for-byte. It never follows a successful private proof with a
second mutating build in the source checkout, and a failed proof cannot leave
half-written source outputs behind.

Development runtime, builds, tests, source-mode CLI, and the local control plane
use Bun 1.4.0. Dependency resolution, package consumption, and registry
publication use pnpm 11.0.3; npm is not part of the toolchain. The published
CLI, stdio MCP entrypoint, and root `.` package export execute on Node.js 22 or
newer.

On the final clean tagged checkout, `bun run release:check` produces and tests
one retained Bun-generated, read-only archive. Publish only that receipt-bound
archive with the receipt's `publish_release_archive.mjs` command. Verification
and publication each acquire the caller-named archive once, close that source
descriptor, and perform parsing, extraction, installation, hashing, and the
fixed `pnpm publish --access public` invocation only against one private
read-only custody copy of those exact bytes. Release builds also run with home,
temporary, Git, Bun, pnpm, and XDG state rebased under the external capsule;
ambient credentials, proxies, hooks, source-directory markers, and code-injection
options are not inherited. Never repack between verification and publication.
Exactly one authorized publication lane may operate for a package name and
version.

## Public-safety boundary

The public distribution contains generalized doctrine and synthetic examples.
Private case studies, local paths, credentials, project names, and operational
evidence do not belong in this repository or its Git history.

## License

MIT
