import { generateKeyPairSync, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalJson, sha256Bytes } from "../canonical-json.js";
import {
  auditSemanticEvidencePackageV2,
  createSemanticPlanV2,
  semanticEvidenceRootSha256,
  verifyDirectSemanticCandidateV2,
  verifyRuntimeSemanticCandidateV2,
  type SemanticAttestationV2,
  type SemanticObservationsV2,
  type SemanticTrustPolicyV2,
} from "./semantic-v2.js";
import {
  discoverSemanticProbeCandidates,
  semanticCandidateSetSha256,
  semanticWorkingTreeSha256,
} from "./semantic.js";

function fixture(): { readonly evidenceRoot: string; readonly root: string; readonly policyPath: string } {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-semantic-v2-subject-"));
  mkdirSync(join(root, "planning"));
  writeFileSync(join(root, "planning", "STORY.md"), `---
artifact_type: story
story_id: STORY-1
status: active
top_level: true
---
The credential validator is a security choke point and is safe by construction.
`);
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
  execFileSync("git", ["-C", root, "config", "user.email", "fixture.invalid"]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-qm", "fixture"]);
  const policyDirectory = mkdtempSync(join(tmpdir(), "mister-clean-semantic-v2-policy-"));
  const evidenceRoot = mkdtempSync(join(tmpdir(), "mister-clean-semantic-v2-evidence-"));
  mkdirSync(join(evidenceRoot, "evidence"));
  writeFileSync(join(evidenceRoot, "evidence", "stdout.txt"), "rejected\n");
  writeFileSync(join(evidenceRoot, "evidence", "stderr.txt"), "");
  return { evidenceRoot, root, policyPath: join(policyDirectory, "trust-policy.json") };
}

function runtimeRecords(root: string, policyPath: string, evidenceRoot: string, coverage = false) {
  const caseId = coverage ? "canonical-gate-inputs" : "forged-credential";
  const observationName = coverage ? "validated_inputs" : "decision";
  const candidates = discoverSemanticProbeCandidates(root);
  const plan = createSemanticPlanV2({
    candidates,
    candidateSetSha256: semanticCandidateSetSha256(candidates),
    challengeNonce: "nonce-001",
    observedAt: "2026-08-28T00:00:00Z",
    repository: root,
    repositoryObjectSha256: semanticWorkingTreeSha256(root),
    runId: "run-001",
    runtimeCases: {
      [candidates[0]!.id]: [{
        case_id: caseId,
        intent: coverage ? "prove the canonical gate validates the declared runtime source and its dependencies" : "reject a forged credential",
        required_observations: [observationName],
      }],
    },
  });
  const candidate = plan.candidates[0]!;
  const evidence = {
    captured_at: "2026-08-28T00:01:00Z",
    media_type: "text/plain",
    path: "evidence/stdout.txt",
    sha256: sha256Bytes(readFileSync(join(evidenceRoot, "evidence", "stdout.txt"))),
    store: "evidence_bundle" as const,
  };
  const observations: SemanticObservationsV2 = {
    record_type: "mister-clean.semantic-observations",
    schema_version: "2.0",
    binding: plan.binding,
    candidate_id: candidate.candidate_id,
    plan_sha256: plan.plan_sha256,
    supervisor: { actor_id: "mister-clean", checker_version: "7.0.0" },
    runner: {
      actor_id: "runner-1",
      argv_sha256: "2".repeat(64),
      executable_sha256: "3".repeat(64),
      cwd: "subject_root",
    },
    tree_before_sha256: plan.binding.repository_object_sha256,
    tree_after_sha256: plan.binding.repository_object_sha256,
    cases: [{
      case_id: caseId,
      ended_at: "2026-08-28T00:01:01Z",
      exit_status: 0,
      observations: [{
        evidence_refs: [evidence],
        name: observationName,
        type: "string",
        value: coverage ? "index.mjs" : "rejected",
      }],
      signal: null,
      started_at: "2026-08-28T00:01:00Z",
      stderr_ref: { ...evidence, path: "evidence/stderr.txt", sha256: sha256Bytes(readFileSync(join(evidenceRoot, "evidence", "stderr.txt"))) },
      stdout_ref: evidence,
    }],
    observations_sha256: "",
  };
  observations.observations_sha256 = sha256Bytes(canonicalJson({ ...observations, observations_sha256: "" }));

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const policy: SemanticTrustPolicyV2 = {
    record_type: "mister-clean.semantic-trust-policy",
    schema_version: "1.0",
    policy_id: "machine-global-semantic-qa",
    keys: [{
      actor_id: "qa-1",
      key_id: "qa-key-1",
      public_key_pem: publicKey.export({ format: "pem", type: "spki" }).toString(),
      roles: ["independent_qa"],
      valid_from: "2026-01-01T00:00:00Z",
    }],
  };
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
  const policySha256 = sha256Bytes(readFileSync(policyPath));
  const unsigned: Omit<SemanticAttestationV2, "signature"> = {
    record_type: "mister-clean.semantic-attestation",
    schema_version: "2.0",
    attested_at: "2026-08-28T00:02:00Z",
    binding: {
      candidate_id: candidate.candidate_id,
      challenge_nonce: plan.binding.challenge_nonce,
      evidence_root_sha256: semanticEvidenceRootSha256(evidenceRoot),
      observations_sha256: observations.observations_sha256,
      plan_sha256: plan.plan_sha256,
      repository_object_sha256: plan.binding.repository_object_sha256,
      run_id: plan.binding.run_id,
    },
    attester: {
      actor_id: "qa-1",
      independence_policy_sha256: policySha256,
      key_id: "qa-key-1",
      role: "independent_qa",
    },
    judgments: [{
      case_id: caseId,
      disposition: "supports",
      evidence_refs: [evidence],
      rationale: coverage ? "The native gate input receipt includes the complete declared runtime source set." : "The observed production decision rejects the forged credential.",
    }],
    scope: { case_plan_adequacy: "adequate", limitations: [] },
  };
  const payload = canonicalJson(unsigned);
  const attestation: SemanticAttestationV2 = {
    ...unsigned,
    signature: {
      algorithm: "Ed25519",
      key_id: "qa-key-1",
      signature_base64url: Buffer.from(sign(null, Buffer.from(payload), privateKey)).toString("base64url"),
      signed_payload_sha256: sha256Bytes(payload),
    },
  };
  const resign = (): void => {
    const { signature: _signature, ...unsignedAttestation } = attestation;
    const nextPayload = canonicalJson(unsignedAttestation);
    attestation.signature = {
      algorithm: "Ed25519",
      key_id: "qa-key-1",
      signature_base64url: Buffer.from(sign(null, Buffer.from(nextPayload), privateKey)).toString("base64url"),
      signed_payload_sha256: sha256Bytes(nextPayload),
    };
  };
  return { attestation, candidate, observations, plan, policy, resign };
}

describe("semantic evidence protocol v2", () => {
  it("rejects a stale empty-census plan instead of accepting vacuous not-applicable evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "mister-clean-semantic-v2-empty-subject-"));
    const policyDirectory = mkdtempSync(join(tmpdir(), "mister-clean-semantic-v2-empty-policy-"));
    try {
      writeFileSync(join(root, "README.md"), "plain fixture\n");
      execFileSync("git", ["init", "-q", root]);
      execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
      execFileSync("git", ["-C", root, "config", "user.email", "fixture.invalid"]);
      execFileSync("git", ["-C", root, "add", "."]);
      execFileSync("git", ["-C", root, "commit", "-qm", "fixture"]);
      const candidates = discoverSemanticProbeCandidates(root);
      expect(candidates).toEqual([]);
      const plan = createSemanticPlanV2({
        candidates,
        candidateSetSha256: semanticCandidateSetSha256(candidates),
        challengeNonce: "nonce-empty",
        observedAt: "2026-08-28T00:00:00Z",
        repository: root,
        repositoryObjectSha256: semanticWorkingTreeSha256(root),
        runId: "run-empty",
        runtimeCases: {},
      });
      plan.binding.repository_object_sha256 = "f".repeat(64);
      const { plan_sha256: _oldDigest, ...unsignedPlan } = plan;
      plan.plan_sha256 = sha256Bytes(canonicalJson(unsignedPlan));
      const packagePath = join(policyDirectory, "semantic-evidence-package.json");
      const policyPath = join(policyDirectory, "semantic-trust-policy.json");
      writeFileSync(packagePath, `${JSON.stringify({
        record_type: "mister-clean.semantic-evidence-package",
        schema_version: "2.0",
        plan,
        runtime_records: [],
      })}\n`);
      writeFileSync(policyPath, `${JSON.stringify({
        record_type: "mister-clean.semantic-trust-policy",
        schema_version: "1.0",
        policy_id: "empty-fixture",
        keys: [],
      })}\n`);

      const result = auditSemanticEvidencePackageV2(root, packagePath, policyPath);

      expect(result.status).toBe("fail");
      expect(result.findings).toContainEqual(expect.objectContaining({
        code: "semantic_probe_manifest_invalid",
      }));
      expect(result.findings.map((finding) => finding.detail).join(" ")).toMatch(/current RepositoryObject/i);
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(policyDirectory, { force: true, recursive: true });
    }
  });

  it("binds source-reference bytes into the generated plan", () => {
    const { evidenceRoot, root, policyPath } = fixture();
    try {
      const candidates = discoverSemanticProbeCandidates(root);
      const before = createSemanticPlanV2({
        candidates,
        candidateSetSha256: semanticCandidateSetSha256(candidates),
        challengeNonce: "nonce-001",
        observedAt: "2026-08-28T00:00:00Z",
        repository: root,
        repositoryObjectSha256: semanticWorkingTreeSha256(root),
        runId: "run-001",
        runtimeCases: { [candidates[0]!.id]: [{ case_id: "case-a", intent: "exercise", required_observations: ["decision"] }] },
      });
      writeFileSync(join(root, "planning", "STORY.md"), readFileSync(join(root, "planning", "STORY.md"), "utf8").replace("credential", "token"));
      const afterCandidates = discoverSemanticProbeCandidates(root);
      const after = createSemanticPlanV2({
        candidates: afterCandidates,
        candidateSetSha256: semanticCandidateSetSha256(afterCandidates),
        challengeNonce: "nonce-001",
        observedAt: "2026-08-28T00:00:00Z",
        repository: root,
        repositoryObjectSha256: semanticWorkingTreeSha256(root),
        runId: "run-001",
        runtimeCases: { [afterCandidates[0]!.id]: [{ case_id: "case-a", intent: "exercise", required_observations: ["decision"] }] },
      });
      expect(after.candidates[0]?.candidate_id).not.toBe(before.candidates[0]?.candidate_id);
      expect(after.plan_sha256).not.toBe(before.plan_sha256);
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(dirname(policyPath), { force: true, recursive: true });
      rmSync(evidenceRoot, { force: true, recursive: true });
    }
  });

  it("accepts an externally rooted independent Ed25519 attestation", () => {
    const { evidenceRoot, root, policyPath } = fixture();
    try {
      const records = runtimeRecords(root, policyPath, evidenceRoot);
      const result = verifyRuntimeSemanticCandidateV2({
        attestation: records.attestation,
        evidenceRoot,
        observations: records.observations,
        plan: records.plan,
        repository: root,
        trustPolicyPath: policyPath,
      });
      expect(result).toMatchObject({ errors: [], verdict: "attested_satisfied" });
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(dirname(policyPath), { force: true, recursive: true });
      rmSync(evidenceRoot, { force: true, recursive: true });
    }
  });

  it("reduces one portable v2 evidence package into the canonical semantic audit", () => {
    const { evidenceRoot, root, policyPath } = fixture();
    try {
      const records = runtimeRecords(root, policyPath, evidenceRoot);
      const packagePath = join(dirname(policyPath), "semantic-evidence-package.json");
      const evidenceFiles = ["evidence/stderr.txt", "evidence/stdout.txt"].map((path) => {
        const bytes = readFileSync(join(evidenceRoot, path));
        return { bytes_base64url: Buffer.from(bytes).toString("base64url"), path, sha256: sha256Bytes(bytes) };
      });
      writeFileSync(packagePath, `${JSON.stringify({
        record_type: "mister-clean.semantic-evidence-package",
        schema_version: "2.0",
        plan: records.plan,
        runtime_records: [{
          attestation: records.attestation,
          candidate_id: records.candidate.candidate_id,
          evidence_files: evidenceFiles,
          observations: records.observations,
        }],
      })}\n`);
      const result = auditSemanticEvidencePackageV2(root, packagePath, policyPath);
      expect(result).toMatchObject({
        candidate_probe_count: 1,
        confirmed_failure_count: 0,
        executed_probe_count: 1,
        resolved_probe_count: 1,
        status: "pass",
      });
      expect(result.resolutions[0]?.disposition).toBe("attested_satisfied");
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(dirname(policyPath), { force: true, recursive: true });
      rmSync(evidenceRoot, { force: true, recursive: true });
    }
  });

  it("rejects a trust policy stored inside the audited repository", () => {
    const { evidenceRoot, root, policyPath } = fixture();
    try {
      const records = runtimeRecords(root, policyPath, evidenceRoot);
      const inRepoPolicy = join(root, "semantic-trust-policy.json");
      writeFileSync(inRepoPolicy, readFileSync(policyPath));
      const result = verifyRuntimeSemanticCandidateV2({
        attestation: records.attestation,
        evidenceRoot,
        observations: records.observations,
        plan: records.plan,
        repository: root,
        trustPolicyPath: inRepoPolicy,
      });
      expect(result.verdict).toBe("verification_debt");
      expect(result.errors.join(" ")).toMatch(/outside the audited repository/i);
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(dirname(policyPath), { force: true, recursive: true });
      rmSync(evidenceRoot, { force: true, recursive: true });
    }
  });

  it("rejects signer-producer overlap even when the signature is valid", () => {
    const { evidenceRoot, root, policyPath } = fixture();
    try {
      const records = runtimeRecords(root, policyPath, evidenceRoot);
      records.observations.runner.actor_id = records.attestation.attester.actor_id;
      records.observations.observations_sha256 = sha256Bytes(canonicalJson({ ...records.observations, observations_sha256: "" }));
      const result = verifyRuntimeSemanticCandidateV2({
        attestation: records.attestation,
        evidenceRoot,
        observations: records.observations,
        plan: records.plan,
        repository: root,
        trustPolicyPath: policyPath,
      });
      expect(result.verdict).toBe("verification_debt");
      expect(result.errors.join(" ")).toMatch(/independent/i);
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(dirname(policyPath), { force: true, recursive: true });
      rmSync(evidenceRoot, { force: true, recursive: true });
    }
  });

  it("rejects evidence bytes changed after independent attestation", () => {
    const { evidenceRoot, root, policyPath } = fixture();
    try {
      const records = runtimeRecords(root, policyPath, evidenceRoot);
      writeFileSync(join(evidenceRoot, "evidence", "stdout.txt"), "accepted\n");
      const result = verifyRuntimeSemanticCandidateV2({
        attestation: records.attestation,
        evidenceRoot,
        observations: records.observations,
        plan: records.plan,
        repository: root,
        trustPolicyPath: policyPath,
      });
      expect(result.verdict).toBe("verification_debt");
      expect(result.errors.join(" ")).toMatch(/evidence-root digest|evidence reference digest/i);
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(dirname(policyPath), { force: true, recursive: true });
      rmSync(evidenceRoot, { force: true, recursive: true });
    }
  });

  it("rejects runner-authored verdict fields instead of treating them as observations", () => {
    const { evidenceRoot, root, policyPath } = fixture();
    try {
      const records = runtimeRecords(root, policyPath, evidenceRoot);
      (records.observations.cases[0] as unknown as Record<string, unknown>).result = "pass";
      records.observations.observations_sha256 = sha256Bytes(canonicalJson({ ...records.observations, observations_sha256: "" }));
      const result = verifyRuntimeSemanticCandidateV2({
        attestation: records.attestation,
        evidenceRoot,
        observations: records.observations,
        plan: records.plan,
        repository: root,
        trustPolicyPath: policyPath,
      });
      expect(result.verdict).toBe("verification_debt");
      expect(result.errors.join(" ")).toMatch(/runner-authored verdict/i);
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(dirname(policyPath), { force: true, recursive: true });
      rmSync(evidenceRoot, { force: true, recursive: true });
    }
  });

  it("keeps an inconclusive independent judgment operate-time pending", () => {
    const { evidenceRoot, root, policyPath } = fixture();
    try {
      const records = runtimeRecords(root, policyPath, evidenceRoot);
      records.attestation.judgments[0]!.disposition = "inconclusive";
      records.resign();
      const result = verifyRuntimeSemanticCandidateV2({
        attestation: records.attestation,
        evidenceRoot,
        observations: records.observations,
        plan: records.plan,
        repository: root,
        trustPolicyPath: policyPath,
      });
      expect(result).toMatchObject({ errors: [], verdict: "operate_time_pending" });
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(dirname(policyPath), { force: true, recursive: true });
      rmSync(evidenceRoot, { force: true, recursive: true });
    }
  });

  it("rejects nonce replay after a valid attestation was consumed", () => {
    const { evidenceRoot, root, policyPath } = fixture();
    try {
      const records = runtimeRecords(root, policyPath, evidenceRoot);
      const consumedNonces = new Set<string>();
      expect(verifyRuntimeSemanticCandidateV2({
        attestation: records.attestation,
        consumedNonces,
        evidenceRoot,
        observations: records.observations,
        plan: records.plan,
        repository: root,
        trustPolicyPath: policyPath,
      }).verdict).toBe("attested_satisfied");
      const replay = verifyRuntimeSemanticCandidateV2({
        attestation: records.attestation,
        consumedNonces,
        evidenceRoot,
        observations: records.observations,
        plan: records.plan,
        repository: root,
        trustPolicyPath: policyPath,
      });
      expect(replay.verdict).toBe("verification_debt");
      expect(replay.errors.join(" ")).toMatch(/nonce.*already consumed/i);
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(dirname(policyPath), { force: true, recursive: true });
      rmSync(evidenceRoot, { force: true, recursive: true });
    }
  });

  it("recomputes direct results with the compiled checker instead of accepting a supplied verdict", () => {
    const { evidenceRoot, root, policyPath } = fixture();
    try {
      mkdirSync(join(root, "planning", "todo"));
      writeFileSync(join(root, "planning", "todo", "DEV.yaml"), "artifact_type: slice\nslice_type: DEV\nstatus: To Do\n");
      const candidates = discoverSemanticProbeCandidates(root);
      const plan = createSemanticPlanV2({
        candidates,
        candidateSetSha256: semanticCandidateSetSha256(candidates),
        challengeNonce: "nonce-002",
        observedAt: "2026-08-28T00:00:00Z",
        repository: root,
        repositoryObjectSha256: semanticWorkingTreeSha256(root),
        runId: "run-002",
        runtimeCases: { [candidates.find((item) => item.kind === "construction_boundary")!.id]: [{ case_id: "case-a", intent: "exercise", required_observations: ["decision"] }] },
      });
      const direct = plan.candidates.find((item) => item.resolution_mode === "direct_check")!;
      expect(verifyDirectSemanticCandidateV2({
        candidateId: direct.candidate_id,
        plan,
        repository: root,
      }).verdict).toBe("confirmed_failure");
      direct.checker.id = "repository/forged-checker";
      expect(verifyDirectSemanticCandidateV2({
        candidateId: direct.candidate_id,
        plan,
        repository: root,
      }).verdict).toBe("verification_debt");
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(dirname(policyPath), { force: true, recursive: true });
      rmSync(evidenceRoot, { force: true, recursive: true });
    }
  });

  it("routes heuristic bounded-state findings through runtime evidence and rejects a missing state case", () => {
    const { evidenceRoot, root, policyPath } = fixture();
    try {
      writeFileSync(join(root, "invocation-journal.ts"), 'import { appendFileSync } from "node:fs";\nappendFileSync("invocation-journal.jsonl", "event\\n");\n');
      const candidates = discoverSemanticProbeCandidates(root);
      const state = candidates.find((candidate) => candidate.kind === "bounded_state_lifecycle")!;
      const base = { candidates, candidateSetSha256: semanticCandidateSetSha256(candidates), challengeNonce: "state-route", observedAt: "2026-08-28T00:00:00Z", repository: root, repositoryObjectSha256: semanticWorkingTreeSha256(root), runId: "state-route" };
      expect(() => createSemanticPlanV2({ ...base, runtimeCases: {} })).toThrow(/case plan/);
      const plan = createSemanticPlanV2({ ...base, runtimeCases: Object.fromEntries(candidates.map((candidate) => [candidate.id, [{ case_id: `case-${candidate.id}`, intent: "observe bounded state", required_observations: ["append_restart_tail"] }]])) });
      expect(plan.candidates.find((candidate) => candidate.legacy_candidate_ids.includes(state.id))?.resolution_mode).toBe("runtime_attested");
    } finally { rmSync(root, { force: true, recursive: true }); rmSync(dirname(policyPath), { force: true, recursive: true }); rmSync(evidenceRoot, { force: true, recursive: true }); }
  });

  it("admits and refutes a discovered bounded-state candidate through signed runtime evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "mister-clean-semantic-v2-state-"));
    const policyDirectory = mkdtempSync(join(tmpdir(), "mister-clean-semantic-v2-state-policy-"));
    const evidenceRoot = mkdtempSync(join(tmpdir(), "mister-clean-semantic-v2-state-evidence-"));
    try {
      writeFileSync(join(root, "invocation-journal.ts"), 'import { appendFileSync } from "node:fs";\nappendFileSync("invocation-journal.jsonl", "event\\n");\n');
      execFileSync("git", ["init", "-q", root]); execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]); execFileSync("git", ["-C", root, "config", "user.email", "fixture.invalid"]); execFileSync("git", ["-C", root, "add", "."]); execFileSync("git", ["-C", root, "commit", "-qm", "fixture"]);
      mkdirSync(join(evidenceRoot, "evidence")); writeFileSync(join(evidenceRoot, "evidence", "stdout.txt"), "append restart tail observed\n"); writeFileSync(join(evidenceRoot, "evidence", "stderr.txt"), "");
      const records = runtimeRecords(root, join(policyDirectory, "trust-policy.json"), evidenceRoot);
      expect(records.candidate.kind).toBe("bounded_state_lifecycle");
      expect(records.candidate.resolution_mode).toBe("runtime_attested");
      expect(verifyRuntimeSemanticCandidateV2({ attestation: records.attestation, evidenceRoot, observations: records.observations, plan: records.plan, repository: root, trustPolicyPath: join(policyDirectory, "trust-policy.json") }).verdict).toBe("attested_satisfied");
      records.attestation.judgments[0]!.disposition = "refutes"; records.resign();
      expect(verifyRuntimeSemanticCandidateV2({ attestation: records.attestation, evidenceRoot, observations: records.observations, plan: records.plan, repository: root, trustPolicyPath: join(policyDirectory, "trust-policy.json") }).verdict).toBe("confirmed_failure");
    } finally { rmSync(root, { force: true, recursive: true }); rmSync(policyDirectory, { force: true, recursive: true }); rmSync(evidenceRoot, { force: true, recursive: true }); }
  });

  it("resolves unknown coverage through native observations and independent attestation", () => {
    const { evidenceRoot, root, policyPath } = fixture();
    try {
      writeFileSync(join(root, "planning", "STORY.md"), "Ordinary planning note.\n");
      writeFileSync(join(root, "index.mjs"), "export const shipped = true;\n");
      writeFileSync(join(root, "package.json"), JSON.stringify({
        name: "unknown-coverage", main: "index.mjs", scripts: { check: "custom-validator --config validator.json" },
      }));
      writeFileSync(join(evidenceRoot, "evidence", "stdout.txt"), "native input receipt: index.mjs\n");
      const records = runtimeRecords(root, policyPath, evidenceRoot, true);
      expect(records.candidate.kind).toBe("executable_surface_coverage");
      expect(records.candidate.resolution_mode).toBe("runtime_attested");
      expect(records.candidate.mechanical_proof).toBeUndefined();
      expect(verifyDirectSemanticCandidateV2({
        candidateId: records.candidate.candidate_id, plan: records.plan, repository: root,
      }).verdict).toBe("verification_debt");
      expect(verifyRuntimeSemanticCandidateV2({
        attestation: records.attestation, evidenceRoot, observations: records.observations,
        plan: records.plan, repository: root, trustPolicyPath: policyPath,
      })).toMatchObject({ errors: [], verdict: "attested_satisfied" });
      records.attestation.judgments[0]!.disposition = "refutes";
      records.attestation.judgments[0]!.rationale = "The native input receipt omits a required runtime input.";
      records.resign();
      expect(verifyRuntimeSemanticCandidateV2({
        attestation: records.attestation, evidenceRoot, observations: records.observations,
        plan: records.plan, repository: root, trustPolicyPath: policyPath,
      }).verdict).toBe("confirmed_failure");
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(dirname(policyPath), { force: true, recursive: true });
      rmSync(evidenceRoot, { force: true, recursive: true });
    }
  });

  it("binds missing declared targets to existing authority without crashing plan creation", () => {
    const { evidenceRoot, root, policyPath } = fixture();
    try {
      writeFileSync(join(root, "planning", "STORY.md"), "Ordinary planning note.\n");
      writeFileSync(join(root, "package.json"), '{"name":"missing-entry","main":"dist/missing.js"}\n');
      const candidates = discoverSemanticProbeCandidates(root);
      expect(candidates[0]?.refs).toEqual(["package.json"]);
      expect(candidates[0]?.evidence.join(" ")).toContain("dist/missing.js");
      const input = {
        candidates, candidateSetSha256: semanticCandidateSetSha256(candidates),
        challengeNonce: "missing-target", observedAt: "2026-08-28T00:00:00Z", repository: root,
        repositoryObjectSha256: semanticWorkingTreeSha256(root), runId: "missing-target",
      };
      expect(() => createSemanticPlanV2({ ...input, runtimeCases: {} })).toThrow(/case plan/);
      const plan = createSemanticPlanV2({
        ...input, runtimeCases: { [candidates[0]!.id]: [{
          case_id: "target-resolution", intent: "resolve the declared target from native build evidence",
          required_observations: ["resolved_target"],
        }] },
      });
      expect(plan.candidates[0]?.resolution_mode).toBe("runtime_attested");
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(dirname(policyPath), { force: true, recursive: true });
      rmSync(evidenceRoot, { force: true, recursive: true });
    }
  });
  it.each([["blank", ""], ["whitespace", "   "], ["padded", " runner-1 "], ["missing", undefined]])(
    "rejects a %s runner actor identity with a validly rebound and resigned attestation",
    (_label, actorId) => {
      const { evidenceRoot, root, policyPath } = fixture();
      try {
        const records = runtimeRecords(root, policyPath, evidenceRoot);
        if (actorId === undefined) delete (records.observations as unknown as Record<string, unknown>).runner;
        else records.observations.runner.actor_id = actorId;
        records.observations.observations_sha256 = sha256Bytes(canonicalJson({ ...records.observations, observations_sha256: "" }));
        records.attestation.binding.observations_sha256 = records.observations.observations_sha256;
        records.resign();
        const result = verifyRuntimeSemanticCandidateV2({
          attestation: records.attestation,
          evidenceRoot,
          observations: records.observations,
          plan: records.plan,
          repository: root,
          trustPolicyPath: policyPath,
        });
        expect(result.verdict).toBe("verification_debt");
        expect(result.errors.join(" ")).toMatch(/runner actor_id must be a canonical nonempty string/i);
      } finally {
        rmSync(root, { force: true, recursive: true });
        rmSync(dirname(policyPath), { force: true, recursive: true });
        rmSync(evidenceRoot, { force: true, recursive: true });
      }
    },
  );

  it.each([
    ["argv_sha256", "not-a-digest", "semantic runner argv_sha256"],
    ["executable_sha256", "not-a-digest", "semantic runner executable_sha256"],
    ["cwd", "/tmp", "semantic runner cwd"],
  ])("rejects invalid runner %s despite a valid independent signature", (field, value, expectedError) => {
    const { evidenceRoot, root, policyPath } = fixture();
    try {
      const records = runtimeRecords(root, policyPath, evidenceRoot);
      (records.observations.runner as unknown as Record<string, unknown>)[field!] = value;
      records.observations.observations_sha256 = sha256Bytes(canonicalJson({ ...records.observations, observations_sha256: "" }));
      records.attestation.binding.observations_sha256 = records.observations.observations_sha256;
      records.resign();
      const result = verifyRuntimeSemanticCandidateV2({
        attestation: records.attestation, evidenceRoot, observations: records.observations,
        plan: records.plan, repository: root, trustPolicyPath: policyPath,
      });
      expect(result.verdict).toBe("verification_debt");
      expect(result.errors.join(" ")).toContain(expectedError);
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(dirname(policyPath), { force: true, recursive: true });
      rmSync(evidenceRoot, { force: true, recursive: true });
    }
  });
});
