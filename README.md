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
npx -y @bradheitmann/mister-clean
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

The authoritative local validators remain inside the repository:

```sh
python3 scripts/validate_closeout.py report path/to/closeout-report.json
python3 scripts/validate_closeout.py manifest path/to/action-manifest.json
```

Run the full project check before proposing a release:

```sh
pnpm install
pnpm check
PYTHONDONTWRITEBYTECODE=1 python3 evals/run_all.py
python3 scripts/check_public_safety.py .
```

## Public-safety boundary

The public distribution contains generalized doctrine and synthetic examples.
Private case studies, local paths, credentials, project names, and operational
evidence do not belong in this repository or its Git history.

## License

MIT
