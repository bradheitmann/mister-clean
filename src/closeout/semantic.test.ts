import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
      expect(result.status).toBe("pass");
      expect(result.findings).toEqual([]);
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

  it("resolves an honest non-operative candidate only with explicit evidence", () => {
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
      expect(result.status).toBe("pass");
      expect(result.findings).toEqual([]);
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
      expect(result.status).toBe("pass");
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
