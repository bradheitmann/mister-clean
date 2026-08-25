# Mister Clean

Mister Clean is an agent skill for closing repository work all the way: paying
completion debt, reconciling planning and Git state, validating the result,
and leaving a successor-ready codebase. Its premise is simple: the repository
is the next team's prompt, so a clean inheritance creates intelligent momentum
while an unfinished one compounds debt across every later session.

Invocation is standing authorization for the procedures documented in the
skill. Ordinary in-scope cleanup is performed, not queued; hard safety and
ownership boundaries remain hard boundaries.

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
npx -y --package @bradheitmann/mister-clean mister-clean-mcp
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
```

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
