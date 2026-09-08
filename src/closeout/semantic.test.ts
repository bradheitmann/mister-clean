import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  auditSemanticRepository,
  discoverSemanticProbeCandidates,
  semanticCandidateSetSha256,
  semanticWorkingTreeSha256,
} from "./semantic.js";

function repository(contract: string): string {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-semantic-"));
  mkdirSync(join(root, "planning"));
  writeFileSync(join(root, "planning", "STORY.md"), `---
artifact_type: story
story_id: STORY-1
status: active
top_level: true
---
${contract}
`);
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
  execFileSync("git", ["-C", root, "config", "user.email", "fixture.invalid"]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-qm", "fixture"]);
  return root;
}

function manifest(root: string, probe: Record<string, unknown>): string {
  const path = join(root, "semantic-probes.json");
  const head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const candidates = discoverSemanticProbeCandidates(root);
  writeFileSync(path, `${JSON.stringify({
    record_type: "mister-clean.semantic-probes",
    schema_version: "1.1",
    candidate_set_sha256: semanticCandidateSetSha256(candidates),
    observed_at: new Date().toISOString(),
    subject_commit: head,
    subject_tree_sha256: semanticWorkingTreeSha256(root, path),
    probes: [probe],
  }, null, 2)}\n`);
  return path;
}

function evidenceRef(root: string, portablePath: string): { path: string; sha256: string } {
  return {
    path: portablePath,
    sha256: createHash("sha256").update(readFileSync(join(root, portablePath))).digest("hex"),
  };
}

function writeReceiptProbe(root: string, result: "fail" | "pass", failedCases: readonly string[] = []): void {
  const source = `
const required = JSON.parse(process.env.MISTER_CLEAN_REQUIRED_CASES_JSON ?? "[]");
const failed = ${JSON.stringify(failedCases)};
const passed = required.filter((item) => !failed.includes(item));
console.log(JSON.stringify({
  record_type: "mister-clean.semantic-probe-receipt",
  schema_version: "1.0",
  candidate_id: process.env.MISTER_CLEAN_CANDIDATE_ID,
  subject_commit: process.env.MISTER_CLEAN_SUBJECT_COMMIT,
  subject_tree_sha256: process.env.MISTER_CLEAN_SUBJECT_TREE_SHA256,
  candidate_set_sha256: process.env.MISTER_CLEAN_CANDIDATE_SET_SHA256,
  exercised_cases: required,
  passed_cases: passed,
  failed_cases: failed,
  result: ${JSON.stringify(result)},
}));
process.exit(${result === "pass" ? 0 : 1});
`;
  writeFileSync(join(root, "probe.mjs"), source);
}

describe("semantic boundary probes", () => {
  it.each(["retired", "archived", "historical", "rejected", "superseded", "done", "completed", "closed"]
    .flatMap((status) => ["planning/active", "contracts"].map((directory) => ({ status, directory }))))(
    "applies the same $status contract lifecycle in $directory", ({ status, directory }) => {
      const root = repository("ordinary description");
      try {
        mkdirSync(join(root, directory), { recursive: true });
        const path = `${directory}/CONTRACT.yaml`;
        writeFileSync(join(root, path), `artifact_type: product_contract\nstatus: ${status}\nclaim: The canonical CI gate proves every production parser rejects malformed input.\n`);
        const discovered = discoverSemanticProbeCandidates(root).some((candidate) => (
          candidate.kind === "gate_semantic_bite" && candidate.path === path
        ));
        expect(discovered).toBe(["done", "completed", "closed"].includes(status));
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    },
  );

  it.each(["done", "completed", "closed"])("keeps %s structured contracts subject to semantic verification", (status) => {
    const root = repository("ordinary description");
    try {
      mkdirSync(join(root, "planning", "done"));
      writeFileSync(join(root, "planning", "done", "CONTRACT.md"), `---
artifact_type: story
story_id: COMPLETED-CONTRACT
status: ${status}
---
The canonical CI gate proves every production parser rejects malformed input.
`);
      expect(discoverSemanticProbeCandidates(root).some((candidate) => (
        candidate.kind === "gate_semantic_bite" && candidate.path === "planning/done/CONTRACT.md"
      ))).toBe(true);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("respects explicit contract retirement even in an active folder", () => {
    const root = repository("ordinary description");
    try {
      mkdirSync(join(root, "planning", "active"));
      writeFileSync(join(root, "planning", "active", "RETIRED.md"), `---
artifact_type: story
story_id: RETIRED-CONTRACT
status: superseded
---
The canonical CI gate proves every production parser rejects malformed input.
`);
      expect(discoverSemanticProbeCandidates(root).some((candidate) => (
        candidate.kind === "gate_semantic_bite" && candidate.path === "planning/active/RETIRED.md"
      ))).toBe(false);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("does not traverse a canonical planning-file symlink as a directory", () => {
    const root = repository("The security sanitizer is the credential choke point and must be safe by construction.");
    try {
      mkdirSync(join(root, ".claude", "commands"), { recursive: true });
      symlinkSync("../../planning/STORY.md", join(root, ".claude", "commands", "plan.md"));
      const candidates = discoverSemanticProbeCandidates(root);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.path).toBe("planning/STORY.md");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("keeps static candidates distinct from confirmed product defects", () => {
    const root = repository("The security sanitizer is the credential choke point and must be safe by construction.");
    try {
      const result = auditSemanticRepository(root);
      expect(result.candidate_probe_count).toBe(1);
      expect(result.confirmed_failure_count).toBe(0);
      expect(result.findings[0]?.code).toBe("semantic_probe_unassigned");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("does not manufacture semantic debt from generic sanitizer, validator, or bootstrap prose", () => {
    const root = repository([
      "The security sanitizer redacts credential fields.",
      "The telemetry validator checks token shape.",
      "Bootstrap QA is complete for the policy documentation.",
    ].join("\n"));
    try {
      expect(discoverSemanticProbeCandidates(root)).toEqual([]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("does not treat unstructured planning prose as an operative product contract", () => {
    const root = repository("ordinary description");
    try {
      writeFileSync(join(root, "planning", "SECURITY.md"), "The credential validator is a security choke point and must be safe by construction.\n");
      expect(discoverSemanticProbeCandidates(root)).toEqual([]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("admits gate-bite claims only from operative planning or structured product contracts", () => {
    const root = repository("The canonical CI gate proves every shipped parser rejects malformed input.");
    try {
      writeFileSync(join(root, "README.md"), "The documentation gate proves every example is current.\n");
      mkdirSync(join(root, "contracts"));
      writeFileSync(join(root, "contracts", "runtime.yaml"), `artifact_type: product_contract
status: active
gate_guarantee: The release gate proves the shipped decoder rejects a corrupt envelope.
`);
      const gateBites = discoverSemanticProbeCandidates(root).filter((candidate) => candidate.kind === "gate_semantic_bite");
      expect(gateBites.map((candidate) => candidate.path)).toEqual([
        "contracts/runtime.yaml",
        "planning/STORY.md",
      ]);
      expect(gateBites.flatMap((candidate) => candidate.refs)).not.toContain("README.md#line-1");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("keeps tests, examples, eval fixtures, regex literals, diagnostics, and detector self-source non-blocking", () => {
    const root = repository("The formatter has an ordinary package-local test.");
    try {
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, "src", "semantic.ts"), `
const GATE_BITE_CLAIM = /gate.*proves.*rejects/i;
throw new Error("the validator rejects malformed input when the check proves coverage");
// Handwritten typed-React twin; keep in sync with server renderer.
`);
      writeFileSync(join(root, "src", "semantic.test.ts"), `
it("proves the gate rejects a broken fixture", () => {});
const diagnostic = "declared handwritten mirror/twin has no bound canonical equivalence contract";
`);
      mkdirSync(join(root, "planning", "examples"));
      writeFileSync(join(root, "planning", "examples", "sample.md"), "The gate proves the validator rejects this example.\n");
      mkdirSync(join(root, "planning", "evals"));
      writeFileSync(join(root, "planning", "evals", "case.md"), "Expected: reject; the check proves the gate catches it.\n");
      mkdirSync(join(root, "fixtures"));
      writeFileSync(join(root, "fixtures", "contract.yaml"), "artifact_type: product_contract\ngate: The gate proves the validator rejects input.\n");
      const selfMatches = discoverSemanticProbeCandidates(root).filter((candidate) => (
        candidate.kind === "gate_semantic_bite" || candidate.kind === "representation_equivalence"
      ));
      expect(selfMatches).toEqual([]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("discovers declared behavioral dimensions and contradictory authority projections", () => {
    const root = repository([
      "C-48 remains PROPOSED pending ratification.",
      "Task-specific routing selects agents according to declared fitness and cost.",
    ].join("\n"));
    try {
      writeFileSync(join(root, "planning", "RATIFICATION.md"), "C-48 is RATIFIED and effective.\n");
      const candidates = discoverSemanticProbeCandidates(root);
      expect(candidates.map((candidate) => candidate.kind).sort()).toEqual([
        "authoritative_projection",
        "behavioral_dimension",
      ]);
      expect(candidates.find((candidate) => candidate.kind === "authoritative_projection")?.refs).toHaveLength(2);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("discovers punctuation-insensitive identifier namespace collisions", () => {
    const root = repository([
      "P-3 names the live product problem.",
      "P3 names the canonical execution plane.",
    ].join("\n"));
    try {
      const candidate = discoverSemanticProbeCandidates(root).find((item) => item.kind === "identifier_namespace");
      expect(candidate?.evidence).toEqual(["P3: P-3 | P3"]);
      expect(candidate?.refs).toHaveLength(2);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("discovers identical short identifiers defined by distinct authority namespaces", () => {
    const root = repository("Current authority definitions are machine readable.");
    try {
      writeFileSync(join(root, "planning", "CANON.md"), `---
artifact_type: reference
authority_definition:
  namespace: canon
  id: D-14
---
# Canon decision
`);
      writeFileSync(join(root, "planning", "AUDIT.md"), `---
artifact_type: reference
authority_definition:
  namespace: audit
  id: D-14
---
# Audit defect
`);
      const candidate = discoverSemanticProbeCandidates(root).find((item) => item.kind === "identifier_namespace");
      expect(candidate?.evidence).toEqual([
        "D-14: audit::D-14 | canon::D-14",
      ]);
      expect(candidate?.refs).toEqual([
        "planning/AUDIT.md#authority_definition",
        "planning/CANON.md#authority_definition",
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("discovers every systemic observer class without upgrading discovery into a product verdict", () => {
    const root = repository([
      "The canonical CI gate proves every production parser rejects malformed input.",
      "The handwritten client twin mirrors the server renderer.",
    ].join("\n"));
    try {
      writeFileSync(join(root, ".gitignore"), ".edge-agentic/local/\n");
      mkdirSync(join(root, "planning", "done"), { recursive: true });
      writeFileSync(join(root, "planning", "done", "REVIEW.yaml"), `artifact_type: review
review_id: REVIEW-1
status: Complete
evidence_ref: .edge-agentic/local/reviews/REVIEW-1/verdict.json
`);
      writeFileSync(join(root, "planning", "done", "OLD.yaml"), `artifact_type: review
review_id: OLD-1
status: superseded
superseded_by: MISSING-1
`);
      writeFileSync(join(root, "planning", "done", "PLAYBACK.yaml"), `artifact_type: holdout
holdout_id: PLAYBACK-1
status: PASS
effect_kind: live_external
proof_kind: url_shape
`);
      mkdirSync(join(root, "config"));
      writeFileSync(join(root, "config", "routing.yaml"), `resilience_claim: true
fallbacks:
  - id: primary
    provider: one-gateway
    account: shared
  - id: backup
    provider: one-gateway
    account: shared
`);
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, "src", "client.ts"), "// Handwritten typed-React twin; keep in sync with server renderer.\nexport const state = true;\n");
      writeFileSync(join(root, "planning", "FORBIDDEN.md"), "Do not execute this recipe:\n```sh\nln -s ../../secret ./public/secret\n```\n");
      mkdirSync(join(root, "scripts"));
      writeFileSync(join(root, "scripts", "check.sh"), "#!/bin/sh\nset -e\ngrep TODO\nfor f in reports/*.json; do test -f \"$f\"; done\n");
      const result = auditSemanticRepository(root);
      expect(result.confirmed_failure_count).toBe(0);
      expect(new Set(result.candidates.map((candidate) => candidate.kind))).toEqual(new Set([
        "acceptance_effect_liveness",
        "environment_semantics",
        "failure_domain_independence",
        "gate_semantic_bite",
        "historical_evidence_portability",
        "instruction_polarity",
        "representation_equivalence",
        "supersession_lineage",
      ]));
      expect(result.candidates.find((candidate) => candidate.kind === "representation_equivalence")?.refs)
        .toEqual(["planning/STORY.md#line-8"]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("does not manufacture systemic debt when durable, live, independent, and typed controls are explicit", () => {
    const root = repository("The formatter has an ordinary package-local test.");
    try {
      mkdirSync(join(root, "evidence"));
      writeFileSync(join(root, "evidence", "verdict.json"), "{}\n");
      mkdirSync(join(root, "planning", "done"), { recursive: true });
      writeFileSync(join(root, "planning", "done", "CURRENT.yaml"), `artifact_type: review
review_id: CURRENT-1
status: Complete
evidence_ref: evidence/verdict.json
`);
      writeFileSync(join(root, "planning", "done", "OLD.yaml"), `artifact_type: review
review_id: OLD-1
status: superseded
superseded_by: CURRENT-1
`);
      writeFileSync(join(root, "planning", "done", "PLAYBACK.yaml"), `artifact_type: holdout
holdout_id: PLAYBACK-1
status: PASS
effect_kind: live_external
proof_kind: operate_time
`);
      writeFileSync(join(root, "planning", "FORBIDDEN.md"), `---
instruction_polarity: forbidden_counterexample
---
Do not execute this recipe:
\`\`\`sh
ln -s ../../secret ./public/secret
\`\`\`
`);
      mkdirSync(join(root, "config"));
      writeFileSync(join(root, "config", "routing.yaml"), `resilience_claim: true
fallbacks:
  - id: primary
    provider: provider-a
    account: account-a
  - id: backup
    provider: provider-b
    account: account-b
`);
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, "src", "client.ts"), "export const viewModel = { state: true };\n");
      mkdirSync(join(root, "scripts"));
      writeFileSync(join(root, "scripts", "check.sh"), "#!/bin/sh\nset -e\ngrep TODO README.md || test $? -eq 1\nprintf 'MISTER_CLEAN_SENTINEL\\n'\n");
      const systemicKinds = new Set([
        "acceptance_effect_liveness",
        "environment_semantics",
        "failure_domain_independence",
        "gate_semantic_bite",
        "historical_evidence_portability",
        "instruction_polarity",
        "representation_equivalence",
        "supersession_lineage",
      ]);
      expect(discoverSemanticProbeCandidates(root).filter((candidate) => systemicKinds.has(candidate.kind))).toEqual([]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("derives semantic candidates only from the bound tracked and nonignored path census", () => {
    const root = repository("P-3 names the tracked product problem.");
    try {
      writeFileSync(join(root, ".gitignore"), ".local-evidence/\n");
      mkdirSync(join(root, ".local-evidence", "planning"), { recursive: true });
      const ignored = join(root, ".local-evidence", "planning", "plan.md");
      writeFileSync(ignored, "P3 names an ignored local note.\n");

      expect(discoverSemanticProbeCandidates(root).some((item) => item.kind === "identifier_namespace")).toBe(false);
      const before = semanticWorkingTreeSha256(root);
      writeFileSync(ignored, "P3 changed outside the RepositoryObject.\n");
      expect(semanticWorkingTreeSha256(root)).toBe(before);
      expect(discoverSemanticProbeCandidates(root).some((item) => item.kind === "identifier_namespace")).toBe(false);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("binds candidate refs into the candidate-set digest while preserving stable candidate identity", () => {
    const contract = "The security sanitizer is the credential choke point and must be safe by construction.";
    const root = repository(contract);
    try {
      const before = discoverSemanticProbeCandidates(root);
      const beforeDigest = semanticCandidateSetSha256(before);
      const story = join(root, "planning", "STORY.md");
      writeFileSync(story, readFileSync(story, "utf8").replace(contract, `Preface.\n${contract}`));
      const after = discoverSemanticProbeCandidates(root);
      expect(after[0]?.id).toBe(before[0]?.id);
      expect(after[0]?.refs).not.toEqual(before[0]?.refs);
      expect(semanticCandidateSetSha256(after)).not.toBe(beforeDigest);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("discovers every current or future DEV/QA record without an execution-identity binding", () => {
    const root = repository("Current work must retain externally verified execution identity.");
    const record = (id: string, type: "DEV" | "QA", extra = "") => `---
artifact_type: slice
slice_id: ${id}
slice_type: ${type}
status: To Do
${extra}---
# ${id}
`;
    try {
      mkdirSync(join(root, "planning", "todo"));
      mkdirSync(join(root, "planning", "active"));
      mkdirSync(join(root, "planning", "done"));
      writeFileSync(join(root, "planning", "todo", "SLICE-DEV.md"), record("SLICE-DEV", "DEV"));
      writeFileSync(join(root, "planning", "active", "SLICE-QA.md"), `<!-- protected QA primacy instructions -->\n${record("SLICE-QA", "QA")}`);
      writeFileSync(join(root, "planning", "done", "SLICE-HISTORICAL.md"), record("SLICE-HISTORICAL", "DEV"));

      const candidate = discoverSemanticProbeCandidates(root).find((item) => item.kind === "execution_identity_coverage");
      expect(candidate?.refs).toEqual([
        "planning/active/SLICE-QA.md",
        "planning/todo/SLICE-DEV.md",
      ]);
      expect(candidate?.evidence).toHaveLength(2);
      expect(candidate?.evidence.join("\n")).toContain("missing control_surface");

      writeFileSync(join(root, "planning", "todo", "SLICE-DEV.md"), record(
        "SLICE-DEV",
        "DEV",
        "execution_identity_ref: null\n",
      ));
      writeFileSync(join(root, "planning", "active", "SLICE-QA.md"), record(
        "SLICE-QA",
        "QA",
        [
          "control_surface: surface-1",
          "inference_provider: provider",
          "inference_backend: backend",
          "model_id: model",
          "model_version: version",
          "reasoning_level: high",
          "harness_id: harness",
          "harness_version: version",
          "permission_mode: read-only",
          "",
        ].join("\n"),
      ));
      const invalidReference = discoverSemanticProbeCandidates(root).find((item) => item.kind === "execution_identity_coverage");
      expect(invalidReference?.refs).toEqual(["planning/todo/SLICE-DEV.md"]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("covers JSON and YAML DEV/QA records in every current lifecycle lane and rejects blank identity values", () => {
    const root = repository("Current work must retain externally verified execution identity.");
    try {
      mkdirSync(join(root, "planning", "ready"));
      mkdirSync(join(root, "planning", "doing"));
      writeFileSync(join(root, "planning", "ready", "DEV.json"), `${JSON.stringify({
        artifact_type: "slice",
        slice_type: "DEV",
        status: "ready",
        execution_identity_ref: null,
      }, null, 2)}\n`);
      writeFileSync(join(root, "planning", "doing", "QA.yaml"), `artifact_type: slice
slice_type: QA
status: doing
control_surface: ""
inference_provider: provider
inference_backend: backend
model_id: model
model_version: version
reasoning_level: high
harness_id: harness
harness_version: version
permission_mode: read-only
`);
      const candidate = discoverSemanticProbeCandidates(root).find((item) => item.kind === "execution_identity_coverage");
      expect(candidate?.refs).toEqual([
        "planning/doing/QA.yaml",
        "planning/ready/DEV.json",
      ]);
      expect(candidate?.evidence.join("\n")).toContain("blank control_surface");
      expect(candidate?.evidence.join("\n")).toContain("invalid execution_identity_ref");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("does not parse a negated ratification as an effective authority status", () => {
    const root = repository("C-48 remains PROPOSED and is not ratified.");
    try {
      expect(discoverSemanticProbeCandidates(root).some((item) => item.kind === "authoritative_projection")).toBe(false);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("recognizes versioned authority identifiers without borrowing a nonce substring", () => {
    const root = repository("LEIT-ISO-v0.4 remains PROPOSED.");
    try {
      writeFileSync(join(root, "planning", "RATIFICATION.md"), "LEIT-ISO-v0.4 is RATIFIED and effective.\n");
      const candidate = discoverSemanticProbeCandidates(root).find((item) => item.kind === "authoritative_projection");
      expect(candidate?.path).toBe("authority-projection/LEIT-ISO-v0.4");
      expect(candidate?.refs).toHaveLength(2);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("discovers a long-lived state container without a lifecycle bound and accepts an explicit bound", () => {
    const root = repository("The executor processes requests.");
    try {
      mkdirSync(join(root, "src"));
      const path = join(root, "src", "executor.ts");
      writeFileSync(path, "export class Executor { readonly #done = new Map<string, string>(); record(id: string) { this.#done.set(id, id); } }\n");
      expect(discoverSemanticProbeCandidates(root)).toContainEqual(expect.objectContaining({
        kind: "bounded_state_lifecycle",
        path: "src/executor.ts",
      }));

      writeFileSync(path, "export function scan(ids: string[]) { const seen = new Set<string>(); for (const id of ids) seen.add(id); return seen.size; }\n");
      expect(discoverSemanticProbeCandidates(root).some((candidate) => candidate.kind === "bounded_state_lifecycle")).toBe(false);

      writeFileSync(path, "export class Executor { readonly #done = new Map<string, string>(); record(id: string) { this.#done.set(id, id); } clearExpired() { this.#done.delete('expired'); } }\n");
      expect(discoverSemanticProbeCandidates(root).some((candidate) => candidate.kind === "bounded_state_lifecycle")).toBe(true);

      writeFileSync(path, "export class Executor { readonly #done = new Map<string, string>(); readonly #inflight = new Map<string, string>(); record(id: string) { this.#done.set(id, id); this.#inflight.set(id, id); this.#inflight.delete(id); } }\n");
      const fieldSpecific = discoverSemanticProbeCandidates(root).filter((candidate) => candidate.kind === "bounded_state_lifecycle");
      expect(fieldSpecific).toHaveLength(1);
      expect(fieldSpecific[0]?.evidence.join(" ")).toContain("#done");

      writeFileSync(path, "export class Executor { readonly done = new Map<string, string>(); record(id: string) { this.done.set(id, id); } }\n");
      expect(discoverSemanticProbeCandidates(root)).toContainEqual(expect.objectContaining({
        kind: "bounded_state_lifecycle",
        path: "src/executor.ts",
      }));

      writeFileSync(path, "const receiptHistory: string[] = []; export function record(id: string) { receiptHistory.push(id); }\n");
      expect(discoverSemanticProbeCandidates(root)).toContainEqual(expect.objectContaining({
        kind: "bounded_state_lifecycle",
        path: "src/executor.ts",
      }));

      writeFileSync(path, "const receiptHistory: string[] = []; export function record(id: string) { receiptHistory.push(id); if (receiptHistory.length > 100) receiptHistory.splice(0, receiptHistory.length - 100); }\n");
      expect(discoverSemanticProbeCandidates(root).some((candidate) => candidate.kind === "bounded_state_lifecycle")).toBe(false);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("discovers a production executable package outside a canonical quality gate", () => {
    const root = repository("The service package is part of the production runtime.");
    try {
      const packageRoot = join(root, "packages", "service");
      mkdirSync(packageRoot, { recursive: true });
      writeFileSync(join(packageRoot, "index.mjs"), "export const service = true;\n");
      writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({
        name: "fixture-service",
        type: "module",
        main: "index.mjs",
      }, null, 2)}\n`);
      const uncovered = discoverSemanticProbeCandidates(root).find((candidate) => candidate.kind === "executable_surface_coverage");
      expect(uncovered?.refs).toEqual(expect.arrayContaining([
        "packages/service/index.mjs",
        "packages/service/package.json",
      ]));
      expect(uncovered?.mechanical_proof).toBeUndefined();
      expect(uncovered?.evidence.join(" ")).toContain("coverage-unestablished");

      writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({
        name: "fixture-service",
        type: "module",
        main: "index.mjs",
        scripts: { test: "true" },
      }, null, 2)}\n`);
      expect(discoverSemanticProbeCandidates(root).some((candidate) => candidate.kind === "executable_surface_coverage")).toBe(true);

      writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({
        name: "fixture-service",
        type: "module",
        main: "index.mjs",
        scripts: { check: "node --check index.mjs" },
      }, null, 2)}\n`);
      expect(discoverSemanticProbeCandidates(root).some((candidate) => candidate.kind === "executable_surface_coverage")).toBe(false);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("retains an explicitly exported generated bundle while leaving unrelated development sources out", () => {
    const root = repository("The formatter has an ordinary package-local test.");
    try {
      const packageRoot = join(root, "packages", "surface");
      mkdirSync(join(packageRoot, "scripts"), { recursive: true });
      mkdirSync(join(packageRoot, "fixtures"));
      writeFileSync(join(packageRoot, "index.test.ts"), "export const testOnly = true;\n");
      writeFileSync(join(packageRoot, "index.spec.mts"), "export const specOnly = true;\n");
      writeFileSync(join(packageRoot, "index.d.ts"), "export declare const declared: boolean;\n");
      writeFileSync(join(packageRoot, "fixtures", "input.ts"), "export const fixture = true;\n");
      writeFileSync(join(packageRoot, "scripts", "report.mjs"), "export const report = true;\n");
      writeFileSync(join(packageRoot, "bundle.js"), [
        "var __defProp = Object.defineProperty;",
        "var __commonJS = (cb) => cb;",
        "var __copyProps = (to, from) => to;",
      ].join("\n"));
      writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({
        name: "fixture-surface",
        exports: { types: "./index.d.ts", import: "./bundle.js" },
        scripts: { "report:history": "node scripts/report.mjs" },
      }, null, 2)}\n`);
      const candidate = discoverSemanticProbeCandidates(root).find((item) => item.kind === "executable_surface_coverage");
      expect(candidate?.refs).toEqual(["packages/surface/bundle.js", "packages/surface/package.json"]);
      expect(candidate?.mechanical_proof).toBeUndefined();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it.each([
    "eslint --exclude index.mjs",
    "eslint --exclude=index.mjs",
  ])("never treats negative command input %s as positive gate coverage", (command) => {
    const root = repository("The formatter has an ordinary package-local test.");
    try {
      const packageRoot = join(root, "packages", "excluded");
      mkdirSync(packageRoot, { recursive: true });
      writeFileSync(join(packageRoot, "index.mjs"), "export const shipped = true;\n");
      writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({
        name: "fixture-excluded",
        main: "index.mjs",
        scripts: { lint: command },
      }, null, 2)}\n`);
      const candidate = discoverSemanticProbeCandidates(root).find((item) => item.kind === "executable_surface_coverage");
      expect(candidate?.refs).toContain("packages/excluded/index.mjs");
      expect(candidate?.mechanical_proof).toBeUndefined();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("resolves command inputs after cd before evaluating gate reachability", () => {
    const root = repository("The formatter has an ordinary package-local test.");
    try {
      const packageRoot = join(root, "packages", "cd-service");
      mkdirSync(join(packageRoot, "app"), { recursive: true });
      writeFileSync(join(packageRoot, "app", "index.mjs"), "export const shipped = true;\n");
      writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({
        name: "fixture-cd-service",
        main: "app/index.mjs",
        scripts: { check: "cd app && node --check index.mjs" },
      }, null, 2)}\n`);
      expect(discoverSemanticProbeCandidates(root).some((candidate) => candidate.kind === "executable_surface_coverage")).toBe(false);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("requires native test-input evidence for a cross-package test route", () => {
    const root = repository("The audit plugin is exercised from the repository surface tests.");
    try {
      const packageRoot = join(root, "packages", "audit");
      mkdirSync(packageRoot, { recursive: true });
      writeFileSync(join(packageRoot, "index.mjs"), "export const audit = true;\n");
      writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({
        name: "fixture-audit",
        type: "module",
        main: "index.mjs",
      }, null, 2)}\n`);
      mkdirSync(join(root, "tests", "surfaces"), { recursive: true });
      writeFileSync(join(root, "tests", "surfaces", "audit.test.mjs"), "import '../../packages/audit/index.mjs';\n");
      writeFileSync(join(root, "package.json"), `${JSON.stringify({
        name: "fixture-root",
        private: true,
        scripts: { test: "node --test tests/**/*.test.mjs" },
      }, null, 2)}\n`);
      const candidate = discoverSemanticProbeCandidates(root).find((item) => item.kind === "executable_surface_coverage");
      expect(candidate?.refs).toContain("packages/audit/index.mjs");
      expect(candidate?.mechanical_proof).toBeUndefined();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it.each([
    ["compiler excludes", "tsc --project tsconfig.json", "tsconfig.json", '{"include":["src/**/*"],"exclude":["src/runtime.mjs"]}'],
    ["compiler JSONC", "tsc --project tsconfig.json", "tsconfig.json", '{/* valid JSONC */"include":["src/**/*"]}'],
    ["compiler inheritance", "tsc --project tsconfig.json", "tsconfig.json", '{"extends":"./tsconfig.base.json"}'],
    ["config ignores", "eslint --config eslint.config.js src/safe.mjs", "eslint.config.js", 'export default [{ignores:["src/runtime.mjs"]}];'],
    ["positive and negative inputs", "eslint src --ignore-pattern src/runtime.mjs", "", ""],
    ["arbitrary script argument", 'node -e "console.log(1)" src/runtime.mjs', "", ""],
    ["non-validator", "wc -l src/runtime.mjs", "", ""],
    ["unreachable branch", "true || node --check src/runtime.mjs", "", ""],
    ["masked failure", "node --check src/runtime.mjs || true", "", ""],
    ["ignored early failure", "node --check src/runtime.mjs; true", "", ""],
    ["compound echo", "echo src/runtime.mjs && true", "", ""],
    ["environment expansion", "VALIDATOR=node node --check src/runtime.mjs", "", ""],
    ["unknown command before validator", "custom-command && node --check src/runtime.mjs", "", ""],
  ])("keeps %s as coverage debt without inventing validation or a negative proof", (_label, command, configPath, configContent) => {
    const root = repository("Ordinary package task.");
    try {
      mkdirSync(join(root, "src"));
      writeFileSync(join(root, "src", "runtime.mjs"), "export const runtime = 1;\n");
      writeFileSync(join(root, "src", "safe.mjs"), "export const safe = 1;\n");
      writeFileSync(join(root, "tsconfig.base.json"), '{"include":["src/**/*"]}\n');
      if (configPath) writeFileSync(join(root, configPath), configContent);
      writeFileSync(join(root, "package.json"), JSON.stringify({
        name: "coverage-adversary", main: "src/runtime.mjs", scripts: { check: command },
      }));
      const candidate = discoverSemanticProbeCandidates(root).find((item) => item.kind === "executable_surface_coverage");
      expect(candidate?.refs).toContain("src/runtime.mjs");
      expect(candidate?.evidence.join(" ")).toContain("coverage-unestablished");
      expect(candidate?.mechanical_proof).toBeUndefined();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it.each(["dist/runtime.js", "src/runtime.mjs", "src/runtime.test.mjs", "examples/runtime.mjs"])(
    "keeps explicit shipped target %s visible regardless of path or generated header",
    (entry) => {
      const root = repository("Ordinary package task.");
      try {
        mkdirSync(join(root, entry.split("/")[0]!), { recursive: true });
        writeFileSync(join(root, entry), "// Do not edit this user-facing value without approval\nexport const runtime = 1;\n");
        writeFileSync(join(root, "package.json"), JSON.stringify({ name: "shipped-target", main: entry }));
        const candidate = discoverSemanticProbeCandidates(root).find((item) => item.kind === "executable_surface_coverage");
        expect(candidate?.refs).toContain(entry);
        expect(candidate?.mechanical_proof).toBeUndefined();
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    },
  );

  it("collects possible runtime dependencies without crediting lint or syntax checks with import coverage", () => {
    const root = repository("Ordinary package task.");
    try {
      writeFileSync(join(root, "index.mjs"), 'import "./unguarded.mjs";\n');
      writeFileSync(join(root, "unguarded.mjs"), "export const runtime = 1;\n");
      for (const command of ["eslint index.mjs", "node --check index.mjs"]) {
        writeFileSync(join(root, "package.json"), JSON.stringify({
          name: "import-closure", main: "index.mjs", scripts: { check: command },
        }));
        const candidate = discoverSemanticProbeCandidates(root).find((item) => item.kind === "executable_surface_coverage");
        expect(candidate?.refs).toContain("unguarded.mjs");
        expect(candidate?.evidence.join(" ")).toContain("validation route unestablished: unguarded.mjs");
        expect(candidate?.mechanical_proof).toBeUndefined();
      }
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("keeps an implicit package entrypoint and unsupported dependency resolution visible", () => {
    const root = repository("Ordinary package task.");
    try {
      writeFileSync(join(root, "index.js"), 'import "@workspace/runtime";\n');
      writeFileSync(join(root, "package.json"), JSON.stringify({
        name: "implicit-entry", scripts: { check: "node --check index.js" },
      }));
      const candidate = discoverSemanticProbeCandidates(root).find((item) => item.kind === "executable_surface_coverage");
      expect(candidate?.refs).toContain("index.js");
      expect(candidate?.evidence.join(" ")).toContain("runtime dependency closure requires native evidence");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("resolves a literal delegated syntax-check route without claiming execution success", () => {
    const root = repository("Ordinary package task.");
    try {
      writeFileSync(join(root, "index.mjs"), "export const runtime = 1;\n");
      writeFileSync(join(root, "package.json"), JSON.stringify({
        name: "literal-delegation", main: "index.mjs",
        scripts: { check: "npm run syntax", syntax: "node --check index.mjs" },
      }));
      expect(discoverSemanticProbeCandidates(root).filter((item) => item.kind === "executable_surface_coverage")).toEqual([]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("does not mistake a node option-looking token for a file operand", () => {
    const root = repository("Ordinary package task.");
    try {
      writeFileSync(join(root, "-runtime.mjs"), "export const runtime = 1;\n");
      writeFileSync(join(root, "package.json"), JSON.stringify({
        name: "option-boundary", main: "./-runtime.mjs", scripts: { check: "node --check -runtime.mjs" },
      }));
      const candidate = discoverSemanticProbeCandidates(root).find((item) => item.kind === "executable_surface_coverage");
      expect(candidate?.refs).toContain("-runtime.mjs");
      expect(candidate?.mechanical_proof).toBeUndefined();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("fingerprints each semantic claim independently and keeps identity stable when only its line moves", () => {
    const first = "The security sanitizer is the credential choke point and must be safe by construction.";
    const second = "The privacy validator is a telemetry choke point and is construction-enforced.";
    const root = repository(`${first}\n${second}`);
    try {
      const before = discoverSemanticProbeCandidates(root);
      expect(before).toHaveLength(2);
      expect(new Set(before.map((candidate) => candidate.id)).size).toBe(2);
      const story = join(root, "planning", "STORY.md");
      writeFileSync(story, readFileSync(story, "utf8").replace(first, `An ordinary preface.\n${first}`));
      const after = discoverSemanticProbeCandidates(root);
      expect(after.map((candidate) => candidate.id).sort()).toEqual(before.map((candidate) => candidate.id).sort());
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("confirms a construction failure only after the bounded adversarial command reproduces it", () => {
    const root = repository("The telemetry sanitizer is a privacy choke point that must be safe by construction.");
    try {
      writeReceiptProbe(root, "fail", ["error_class:email"]);
      const candidate = discoverSemanticProbeCandidates(root)[0]!;
      const path = manifest(root, {
        boundary: "sanitizeAttributes",
        candidate_id: candidate.id,
        command: [process.execPath, "probe.mjs"],
        contract_refs: candidate.refs,
        disposition: "execute",
        exercised_cases: ["error_class:email", "refusal_code:token"],
        expected_status: 0,
        kind: candidate.kind,
        observed_endpoint: "telemetry sink",
        required_cases: ["error_class:email", "refusal_code:token"],
        timeout_ms: 2_000,
      });
      const result = auditSemanticRepository(root, { execute: true, manifestPath: path });
      expect(result.executed_probe_count).toBe(1);
      expect(result.confirmed_failure_count).toBe(1);
      expect(result.findings[0]?.code).toBe("construction_boundary_failure");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("passes an exhaustive construction probe that rejects the same cross-product", () => {
    const root = repository("The authorization validator is a security choke point and is construction-enforced.");
    try {
      writeReceiptProbe(root, "pass");
      const candidate = discoverSemanticProbeCandidates(root)[0]!;
      const cases = ["authority:forged", "key_id:separator"];
      const path = manifest(root, {
        boundary: "validateAuthorization",
        candidate_id: candidate.id,
        command: [process.execPath, "probe.mjs"],
        contract_refs: candidate.refs,
        disposition: "execute",
        exercised_cases: cases,
        expected_status: 0,
        kind: candidate.kind,
        observed_endpoint: "authorization decision",
        required_cases: cases,
        timeout_ms: 2_000,
      });
      const result = auditSemanticRepository(root, { execute: true, manifestPath: path });
      expect(result.status).toBe("fail");
      expect(result.findings.map((finding) => finding.code)).toContain("semantic_probe_independent_attestation_required");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("does not accept exit zero without a case-complete object-bound receipt", () => {
    const root = repository("The authorization validator is a security choke point and is construction-enforced.");
    try {
      writeFileSync(join(root, "probe.mjs"), "process.exit(0);\n");
      const candidate = discoverSemanticProbeCandidates(root)[0]!;
      const cases = ["authority:forged"];
      const path = manifest(root, {
        boundary: "validateAuthorization",
        candidate_id: candidate.id,
        command: [process.execPath, "probe.mjs"],
        contract_refs: candidate.refs,
        disposition: "execute",
        exercised_cases: cases,
        expected_status: 0,
        kind: candidate.kind,
        observed_endpoint: "authorization decision",
        required_cases: cases,
        timeout_ms: 2_000,
      });
      const result = auditSemanticRepository(root, { execute: true, manifestPath: path });
      expect(result.executed_probe_count).toBe(1);
      expect(result.executions[0]?.result).toBe("error");
      expect(result.findings[0]?.code).toBe("semantic_probe_execution_error");
      expect(result.findings[0]?.detail).toMatch(/exactly one.*receipt/);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("confirms an unwired mechanism from the production composition-root probe", () => {
    const root = repository("The production bootstrap must wire the authorization policy sink at the composition root.");
    try {
      writeReceiptProbe(root, "fail", ["production-root:policy-binding"]);
      const candidate = discoverSemanticProbeCandidates(root)[0]!;
      const path = manifest(root, {
        boundary: "bootstrap",
        candidate_id: candidate.id,
        command: [process.execPath, "probe.mjs"],
        contract_refs: candidate.refs,
        disposition: "execute",
        exercised_cases: ["production-root:policy-binding"],
        expected_status: 0,
        kind: candidate.kind,
        observed_endpoint: "guarded request",
        required_cases: ["production-root:policy-binding"],
        timeout_ms: 2_000,
      });
      const result = auditSemanticRepository(root, { execute: true, manifestPath: path });
      expect(result.findings[0]?.code).toBe("mechanism_unwired_at_composition_root");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it.each([
    [
      "behavioral_dimension",
      "Task-specific routing selects agents according to declared fitness and cost.",
      "behavioral_dimension_failure",
    ],
    [
      "bounded_state_lifecycle",
      "The durable idempotency journal has a bounded-state lifecycle.",
      "bounded_state_lifecycle_failure",
    ],
    [
      "executable_surface_coverage",
      "The service package is part of the production runtime.",
      "executable_surface_coverage_failure",
    ],
    [
      "execution_identity_coverage",
      "Current DEV and QA records bind externally verified execution identity.",
      "execution_identity_coverage_failure",
    ],
    [
      "identifier_namespace",
      "P-3 names one authority while P3 names another authority.",
      "identifier_namespace_failure",
    ],
  ] as const)("maps a failed %s probe to its own product-defect class", (kind, contract, expectedCode) => {
    const root = repository(contract);
    try {
      if (kind === "bounded_state_lifecycle") {
        mkdirSync(join(root, "src"));
        writeFileSync(join(root, "src", "journal.ts"), "export class Journal { readonly #done = new Map<string, string>(); record(id: string) { this.#done.set(id, id); } }\n");
      }
      if (kind === "executable_surface_coverage") {
        mkdirSync(join(root, "packages", "service"), { recursive: true });
        writeFileSync(join(root, "packages", "service", "index.mjs"), "export const service = true;\n");
        writeFileSync(join(root, "packages", "service", "package.json"), "{\"name\":\"fixture-service\",\"main\":\"index.mjs\",\"type\":\"module\"}\n");
      }
      if (kind === "execution_identity_coverage") {
        mkdirSync(join(root, "planning", "todo"));
        writeFileSync(join(root, "planning", "todo", "SLICE-DEV.md"), "---\nartifact_type: slice\nslice_id: SLICE-DEV\nslice_type: DEV\nstatus: To Do\n---\n# DEV\n");
      }
      writeReceiptProbe(root, "fail", ["negative-control"]);
      const candidate = discoverSemanticProbeCandidates(root).find((item) => item.kind === kind)!;
      const path = manifest(root, {
        boundary: kind,
        candidate_id: candidate.id,
        command: [process.execPath, "probe.mjs"],
        contract_refs: candidate.refs,
        disposition: "execute",
        exercised_cases: ["negative-control"],
        expected_status: 0,
        kind,
        observed_endpoint: "observable behavior",
        required_cases: ["negative-control"],
        timeout_ms: 2_000,
      });
      const result = auditSemanticRepository(root, { execute: true, manifestPath: path });
      expect(result.findings[0]?.code).toBe(expectedCode);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("keeps a declared operate-time seam partial instead of calling it unwired", () => {
    const root = repository("The production bootstrap must wire the privacy policy sink at the composition root.");
    try {
      const candidate = discoverSemanticProbeCandidates(root)[0]!;
      const path = manifest(root, {
        boundary: "bootstrap",
        candidate_id: candidate.id,
        contract_refs: candidate.refs,
        disposition: "operate_time_pending",
        evidence_required: "signed live adapter receipt",
        exercised_cases: ["production-root:external-adapter"],
        kind: candidate.kind,
        observed_endpoint: "external adapter",
        owner: "deployment operator",
        required_cases: ["production-root:external-adapter"],
        required_next_action: "exercise the live adapter",
      });
      const result = auditSemanticRepository(root, { execute: true, manifestPath: path });
      expect(result.confirmed_failure_count).toBe(0);
      expect(result.pending_probe_count).toBe(1);
      expect(result.findings[0]?.code).toBe("semantic_probe_operate_time_pending");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("retains a legacy non-operative resolution but requires independent attestation before clearing it", () => {
    const root = repository("Historical note: the production bootstrap once wired the privacy policy sink at the composition root.");
    try {
      const candidate = discoverSemanticProbeCandidates(root)[0]!;
      const path = manifest(root, {
        boundary: "historical bootstrap description",
        candidate_id: candidate.id,
        contract_refs: candidate.refs,
        disposition: "not_applicable",
        kind: candidate.kind,
        not_applicable_evidence: [evidenceRef(root, "planning/STORY.md")],
        not_applicable_reason: "the sentence is explicitly historical and makes no current runtime claim",
        observed_endpoint: "none; historical record only",
      });
      const result = auditSemanticRepository(root, { execute: true, manifestPath: path });
      expect(result.status).toBe("fail");
      expect(result.findings.map((finding) => finding.code)).toContain("semantic_probe_independent_attestation_required");
      expect(result.resolved_probe_count).toBe(1);
      expect(result.resolutions[0]).toMatchObject({
        candidate_id: candidate.id,
        disposition: "not_applicable",
      });
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects a not-applicable disposition without evidence instead of suppressing debt", () => {
    const root = repository("Historical note: the production bootstrap once wired the privacy policy sink at the composition root.");
    try {
      const candidate = discoverSemanticProbeCandidates(root)[0]!;
      const path = manifest(root, {
        boundary: "historical bootstrap description",
        candidate_id: candidate.id,
        contract_refs: candidate.refs,
        disposition: "not_applicable",
        kind: candidate.kind,
        not_applicable_reason: "historical",
        observed_endpoint: "none",
      });
      const result = auditSemanticRepository(root, { execute: true, manifestPath: path });
      expect(result.executed_probe_count).toBe(0);
      expect(result.resolved_probe_count).toBe(0);
      expect(result.findings.map((finding) => finding.code)).toContain("semantic_probe_manifest_invalid");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects a not-applicable evidence reference whose digest does not match the portable file", () => {
    const root = repository("Historical note: the production bootstrap once wired the privacy policy sink at the composition root.");
    try {
      const candidate = discoverSemanticProbeCandidates(root)[0]!;
      const path = manifest(root, {
        boundary: "historical bootstrap description",
        candidate_id: candidate.id,
        contract_refs: candidate.refs,
        disposition: "not_applicable",
        kind: candidate.kind,
        not_applicable_evidence: [{ path: "planning/STORY.md", sha256: "0".repeat(64) }],
        not_applicable_reason: "the claim is explicitly historical",
        observed_endpoint: "none",
      });
      const result = auditSemanticRepository(root, { execute: true, manifestPath: path });
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.detail).toMatch(/digest mismatch/);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("does not trigger on an ordinary formatter with no critical-boundary contract", () => {
    const root = repository("The formatter normalizes whitespace before display.");
    try {
      const result = auditSemanticRepository(root);
      expect(result.status).toBe("not_applicable");
      expect(result.candidate_probe_count).toBe(0);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("fails incomplete required-case coverage without executing the command", () => {
    const root = repository("The credential sanitizer is a security choke point and must be safe by construction.");
    try {
      writeFileSync(join(root, "probe.mjs"), "process.exit(0);\n");
      const candidate = discoverSemanticProbeCandidates(root)[0]!;
      const path = manifest(root, {
        boundary: "sanitize",
        candidate_id: candidate.id,
        command: [process.execPath, "probe.mjs"],
        contract_refs: candidate.refs,
        disposition: "execute",
        exercised_cases: ["field-a"],
        expected_status: 0,
        kind: candidate.kind,
        observed_endpoint: "sink",
        required_cases: ["field-a", "field-b"],
        timeout_ms: 2_000,
      });
      const result = auditSemanticRepository(root, { execute: true, manifestPath: path });
      expect(result.executed_probe_count).toBe(0);
      expect(result.findings[0]?.code).toBe("semantic_probe_incomplete");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("preserves argv order and duplicates when executing a probe", () => {
    const root = repository("The credential validator is a security choke point and is construction-enforced.");
    try {
      writeFileSync(join(root, "probe.mjs"), `
const ok = process.argv.slice(2).join("|") === "z|a|z";
const required = JSON.parse(process.env.MISTER_CLEAN_REQUIRED_CASES_JSON ?? "[]");
console.log(JSON.stringify({
  record_type: "mister-clean.semantic-probe-receipt",
  schema_version: "1.0",
  candidate_id: process.env.MISTER_CLEAN_CANDIDATE_ID,
  subject_commit: process.env.MISTER_CLEAN_SUBJECT_COMMIT,
  subject_tree_sha256: process.env.MISTER_CLEAN_SUBJECT_TREE_SHA256,
  candidate_set_sha256: process.env.MISTER_CLEAN_CANDIDATE_SET_SHA256,
  exercised_cases: required,
  passed_cases: ok ? required : [],
  failed_cases: ok ? [] : required,
  result: ok ? "pass" : "fail",
}));
process.exit(ok ? 0 : 1);
`);
      const candidate = discoverSemanticProbeCandidates(root)[0]!;
      const path = manifest(root, {
        boundary: "validateCredential",
        candidate_id: candidate.id,
        command: [process.execPath, "probe.mjs", "z", "a", "z"],
        contract_refs: candidate.refs,
        disposition: "execute",
        exercised_cases: ["argv-order"],
        expected_status: 0,
        kind: candidate.kind,
        observed_endpoint: "security decision",
        required_cases: ["argv-order"],
        timeout_ms: 2_000,
      });
      const result = auditSemanticRepository(root, { execute: true, manifestPath: path });
      expect(result.status).toBe("fail");
      expect(result.findings.map((finding) => finding.code)).toContain("semantic_probe_independent_attestation_required");
      expect(result.executions[0]?.executable).toBe(basename(process.execPath));
      expect(result.executions[0]?.command_sha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("refuses to execute any probe when the manifest snapshot is stale", () => {
    const root = repository("The telemetry sanitizer is a privacy choke point and must be safe by construction.");
    try {
      writeReceiptProbe(root, "pass");
      const candidate = discoverSemanticProbeCandidates(root)[0]!;
      const path = manifest(root, {
        boundary: "sanitizeTelemetry",
        candidate_id: candidate.id,
        command: [process.execPath, "probe.mjs"],
        contract_refs: candidate.refs,
        disposition: "execute",
        exercised_cases: ["privacy-field"],
        expected_status: 0,
        kind: candidate.kind,
        observed_endpoint: "telemetry sink",
        required_cases: ["privacy-field"],
        timeout_ms: 2_000,
      });
      const record = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      record.subject_commit = "0000000000000000000000000000000000000000";
      writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
      const result = auditSemanticRepository(root, { execute: true, manifestPath: path });
      expect(result.executed_probe_count).toBe(0);
      expect(result.findings.map((finding) => finding.code)).toContain("semantic_probe_manifest_invalid");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("refuses to execute when uncommitted repository content moved after the manifest was bound", () => {
    const root = repository("The telemetry sanitizer is a privacy choke point and must be safe by construction.");
    try {
      writeReceiptProbe(root, "pass");
      const candidate = discoverSemanticProbeCandidates(root)[0]!;
      const cases = ["privacy-field"];
      const path = manifest(root, {
        boundary: "sanitizeTelemetry",
        candidate_id: candidate.id,
        command: [process.execPath, "probe.mjs"],
        contract_refs: candidate.refs,
        disposition: "execute",
        exercised_cases: cases,
        expected_status: 0,
        kind: candidate.kind,
        observed_endpoint: "telemetry sink",
        required_cases: cases,
        timeout_ms: 2_000,
      });
      const story = join(root, "planning", "STORY.md");
      writeFileSync(story, `${readFileSync(story, "utf8")}\nPost-manifest drift.\n`);
      const result = auditSemanticRepository(root, { execute: true, manifestPath: path });
      expect(result.executed_probe_count).toBe(0);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.detail).toMatch(/subject_tree_sha256/);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects nonzero expected statuses instead of treating command failure as proof", () => {
    const root = repository("The authorization validator is a security choke point and is construction-enforced.");
    try {
      writeFileSync(join(root, "probe.mjs"), "process.exit(1);\n");
      const candidate = discoverSemanticProbeCandidates(root)[0]!;
      const path = manifest(root, {
        boundary: "authorize",
        candidate_id: candidate.id,
        command: [process.execPath, "probe.mjs"],
        contract_refs: candidate.refs,
        disposition: "execute",
        exercised_cases: ["denial"],
        expected_status: 1,
        kind: candidate.kind,
        observed_endpoint: "authorization decision",
        required_cases: ["denial"],
        timeout_ms: 2_000,
      });
      const result = auditSemanticRepository(root, { execute: true, manifestPath: path });
      expect(result.executed_probe_count).toBe(0);
      expect(result.findings[0]?.detail).toMatch(/expected_status must be 0/);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects orphaned manifest probes instead of silently passing them", () => {
    const root = repository("The production bootstrap must wire the privacy policy sink at the composition root.");
    try {
      const candidate = discoverSemanticProbeCandidates(root)[0]!;
      const path = manifest(root, {
        boundary: "bootstrap",
        candidate_id: "SEM-COMPOSITION-DOES-NOT-EXIST",
        command: [process.execPath, "-e", "process.exit(0)"],
        contract_refs: candidate.refs,
        disposition: "execute",
        exercised_cases: ["production-root"],
        expected_status: 0,
        kind: candidate.kind,
        observed_endpoint: "policy sink",
        required_cases: ["production-root"],
        timeout_ms: 2_000,
      });
      const result = auditSemanticRepository(root, { execute: true, manifestPath: path });
      expect(result.executed_probe_count).toBe(0);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.code).toBe("semantic_probe_manifest_invalid");
      expect(result.findings[0]?.refs.every((ref) => !ref.startsWith("/"))).toBe(true);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

  it.each([
    ["root pre-hook", { check: "npm run syntax", precheck: "false", syntax: "node --check index.mjs" }],
    ["root post-hook", { check: "npm run syntax", postcheck: "false", syntax: "node --check index.mjs" }],
    ["nested pre-hook", { check: "cd service && npm run syntax", service: { syntax: "node --check index.mjs", presyntax: "false" } }],
    ["nested post-hook", { check: "cd service && npm run syntax", service: { syntax: "node --check index.mjs", postsyntax: "false" } }],
  ])("keeps %s package-manager lifecycle hooks as runtime evidence debt", (_label, fixture) => {
    const root = repository("Ordinary package task.");
    try {
      writeFileSync(join(root, "index.mjs"), "export const runtime = 1;\n");
      if ("service" in fixture) {
        mkdirSync(join(root, "service"), { recursive: true });
        writeFileSync(join(root, "service", "index.mjs"), "export const runtime = 1;\n");
        writeFileSync(join(root, "service", "package.json"), JSON.stringify({
          name: "nested-lifecycle", main: "index.mjs", scripts: fixture.service,
        }));
        writeFileSync(join(root, "package.json"), JSON.stringify({
          name: "root-lifecycle", scripts: { check: fixture.check },
        }));
      } else {
        writeFileSync(join(root, "package.json"), JSON.stringify({
          name: "root-lifecycle", main: "index.mjs", scripts: fixture,
        }));
      }
      const candidate = discoverSemanticProbeCandidates(root).find((item) => item.kind === "executable_surface_coverage");
      expect(candidate?.evidence.join(" ")).toContain("package script lifecycle hooks require native evidence");
      expect(candidate?.mechanical_proof).toBeUndefined();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it.each(["release-build", "release_build", "foo-release"])(
    "retains %s as a release-input obligation even when it contains a literal syntax check",
    (scriptName) => {
      const root = repository("Ordinary package task.");
      try {
        writeFileSync(join(root, "cli.js"), "export const runtime = 1;\n");
        writeFileSync(join(root, "package.json"), JSON.stringify({
          name: "release-role", bin: "cli.js", scripts: { [scriptName]: "node --check cli.js" },
        }));
        const candidate = discoverSemanticProbeCandidates(root).find((item) => item.kind === "executable_surface_coverage");
        expect(candidate?.evidence.join(" ")).toContain(`release input closure requires native evidence: ${scriptName}`);
        expect(candidate?.mechanical_proof).toBeUndefined();
      } finally {
        rmSync(root, { force: true, recursive: true });
      }
    },
  );
