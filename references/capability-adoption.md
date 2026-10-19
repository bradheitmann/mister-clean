# Capability adoption

The default Mister Clean deployment retains the complete skill, CLI, MCP, and
control-plane feature sets. Selective adoption is additive: no global flag can
silently disable a validator or reinterpret missing evidence as passing.

| Need | Supported entrypoint | Scope |
| --- | --- | --- |
| Complete repository closeout | skill and `mister-clean` CLI | Discovery, live evidence, execution lifecycle, validation, and guard contracts |
| MCP materials | package root and stdio executable | Existing attested server interface |
| Local state/query service | `@bradheitmann/mister-clean/control-plane` | Existing authenticated local runtime; dispatch and execution remain unsupported |
| Planning checks in an existing application | `@bradheitmann/mister-clean/planning` | Supplied documents only; no target discovery, command execution, Git ancestry, or closeout |

```ts
import { assessPlanningSources, type PlanningSource } from "@bradheitmann/mister-clean/planning";

const sources: PlanningSource[] = [{
  path: "planning/tasks/TASK-1.md",
  content: "---\nartifact_type: task\ntask_id: TASK-1\ntop_level: true\nstatus: active\n---\n",
}];
const result = assessPlanningSources(sources);
console.log(result.scope, result.analysis.findings);
```

A source path is a label, never a filesystem read request. Inputs must be plain
records with own string data fields. Unknown fields, accessors, and inherited
record prototypes are rejected. The assessment does not accept repository paths,
trust callbacks, live-observation overrides, or caller-selected snapshot claims.
Its analysis snapshot is `unbound`; callers must retain the actual supplied
contents if they need reproducibility. Empty input is `not_applicable`, never
proof of an empty or clean repository.

Importing the installed planning subpath verifies its own package against the
release attestation and manifest before exposing the function. This is package
byte consistency, not authenticated source origin. It necessarily reads its own
package, while assessment performs no target-repository filesystem or process
I/O. Explicit Git-root-verified source development uses the same development
escape hatch as other source entrypoints; installed distributions cannot use it.

The planning subpath exposes exactly one function and four safe data types.
Private parser, accounting, repository observation, and lifecycle modules are
not supported deep imports. The export map is an adoption boundary, not a
sandbox against arbitrary same-user code execution.

Internally `src/closeout/planning.ts` remains the compatibility facade.
`planning-analysis/policy.ts` owns content interpretation, graph rules, and debt accounting;
`planning-analysis/repository.ts` owns discovery, filesystem decoding, Git, and live
projection observations; `planning-analysis/lifecycle.ts` shares the lane vocabulary.
Repository audits call the same policy implementation with private observations.
No checker was disabled to make the limited API work.

The private code directory is named `planning-analysis`, separating executable
capability code from canonical `planning/` document corpora. Discovery rules are
unchanged; real planning documents remain discoverable and payable.
