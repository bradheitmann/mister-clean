/**
 * Master-gate S0: a CLEAN verdict from `validate bundle` must be impossible to
 * reach with records the closer can forge. Every key here is generated inside
 * the test; no real key or policy is used.
 */
import { generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalJson, sha256Bytes } from "../canonical-json.js";
import { runCli, type CliIO } from "../cli.js";
import { LocalRunReceiptStore, runReceiptErrors } from "../run-receipt.js";
import { captureFileCensus } from "../census.js";
import {
  NEXT_PLANNING,
  DONE_PLANNING,
  digest,
  fixture,
  git,
  persistRegressionMutation,
  publicSafetyDebtFixture,
  put,
  putJson,
  rebind,
  removeTemporaryRoots,
  temporaryRoots,
  validateBundle,
  type Fixture,
  type RecordValue,
} from "./bundle.test-fixture.js";
import { deriveRegressionAccounting } from "./regression-accounting.js";
import {
  auditSemanticEvidencePackageV2,
  createSemanticPlanV2,
  semanticEvidenceFilesSha256,
  verifyRuntimeSemanticCandidateV2,
  type SemanticAttestationV2,
  type SemanticEvidenceFileV2,
  type SemanticObservationsV2,
  type SemanticPlanV2,
} from "./semantic-v2.js";
import {
  auditSemanticRepository,
  discoverSemanticProbeCandidates,
  semanticCandidateSetSha256,
  semanticWorkingTreeSha256,
} from "./semantic.js";
import {
  TRUST_POLICY_PIN_ENV,
  trustPolicyPins,
  validateReceiptVerdict,
} from "./trust-root.js";

const CONTRACT_PLANNING = [
  "---",
  "artifact_type: story",
  "story_id: FIXTURE-CONTRACT",
  "status: backlog",
  "---",
  "The credential validator is a security choke point and is safe by construction.",
  "",
].join("\n");
const ATTESTED_AT = "2026-08-25T09:00:00Z";
const KEY_WINDOW = { valid_from: "2026-01-01T00:00:00Z", valid_to: "2027-01-01T00:00:00Z" } as const;

const scratch: string[] = [];
afterEach(async () => {
  for (const path of scratch.splice(0)) rmSync(path, { force: true, recursive: true });
  await removeTemporaryRoots();
});

interface TestKey {
  readonly privateKey: KeyObject;
  readonly publicPem: string;
}

function testKey(): TestKey {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { privateKey, publicPem: publicKey.export({ format: "pem", type: "spki" }).toString() };
}

function policyKey(key: TestKey, actorId: string, keyId: string, roles: readonly string[], window: Record<string, string> = KEY_WINDOW): RecordValue {
  return { actor_id: actorId, key_id: keyId, public_key_pem: key.publicPem, roles: [...roles], ...window };
}

function policyBytes(keys: readonly RecordValue[]): string {
  return `${JSON.stringify({
    record_type: "mister-clean.semantic-trust-policy",
    schema_version: "1.0",
    policy_id: "trust-root-fixture",
    keys,
  }, null, 2)}\n`;
}

function signRecord<T extends RecordValue>(record: T, key: TestKey): string {
  return Buffer.from(sign(null, Buffer.from(canonicalJson(record)), key.privateKey)).toString("base64url");
}

/** One runtime-attested candidate's plan, observations, and attester-signed attestation. */
function runtimeEvidence(repo: string, policySha256: string, attester: TestKey, options: {
  readonly attesterActor?: string;
  readonly attesterKeyId?: string;
  readonly runnerActor?: string;
} = {}): {
  readonly plan: SemanticPlanV2;
  readonly observations: SemanticObservationsV2;
  readonly attestation: SemanticAttestationV2;
  readonly evidenceFiles: SemanticEvidenceFileV2[];
} {
  const candidates = discoverSemanticProbeCandidates(repo);
  const runtimeCandidate = candidates[0];
  if (!runtimeCandidate || candidates.length !== 1) throw new Error(`fixture expects one semantic candidate, found ${candidates.length}`);
  const plan = createSemanticPlanV2({
    candidates,
    candidateSetSha256: semanticCandidateSetSha256(candidates),
    challengeNonce: "trust-root-nonce",
    observedAt: ATTESTED_AT,
    repository: repo,
    repositoryObjectSha256: semanticWorkingTreeSha256(repo),
    runId: "trust-root-run",
    runtimeCases: {
      [runtimeCandidate.id]: [{ case_id: "forged-credential", intent: "reject a forged credential", required_observations: ["decision"] }],
    },
  });
  const candidate = plan.candidates[0]!;
  const stdout = Buffer.from("rejected\n");
  const stderr = Buffer.from("");
  const evidenceFiles: SemanticEvidenceFileV2[] = [
    { path: "evidence/stdout.txt", sha256: sha256Bytes(stdout), bytes_base64url: stdout.toString("base64url") },
    { path: "evidence/stderr.txt", sha256: sha256Bytes(stderr), bytes_base64url: stderr.toString("base64url") },
  ];
  const stdoutRef = { captured_at: ATTESTED_AT, media_type: "text/plain", path: "evidence/stdout.txt", sha256: sha256Bytes(stdout), store: "evidence_bundle" as const };
  const observations: SemanticObservationsV2 = {
    record_type: "mister-clean.semantic-observations",
    schema_version: "2.0",
    binding: plan.binding,
    candidate_id: candidate.candidate_id,
    plan_sha256: plan.plan_sha256,
    supervisor: { actor_id: "mister-clean", checker_version: "7.5.1" },
    runner: { actor_id: options.runnerActor ?? "runner-1", argv_sha256: "2".repeat(64), executable_sha256: "3".repeat(64), cwd: "subject_root" },
    tree_before_sha256: plan.binding.repository_object_sha256,
    tree_after_sha256: plan.binding.repository_object_sha256,
    cases: [{
      case_id: "forged-credential",
      started_at: ATTESTED_AT,
      ended_at: ATTESTED_AT,
      exit_status: 0,
      signal: null,
      observations: [{ evidence_refs: [stdoutRef], name: "decision", type: "string", value: "rejected" }],
      stdout_ref: stdoutRef,
      stderr_ref: { ...stdoutRef, path: "evidence/stderr.txt", sha256: sha256Bytes(stderr) },
    }],
    observations_sha256: "",
  };
  observations.observations_sha256 = sha256Bytes(canonicalJson({ ...observations, observations_sha256: "" }));
  const keyId = options.attesterKeyId ?? "qa-key";
  const unsigned: Omit<SemanticAttestationV2, "signature"> = {
    record_type: "mister-clean.semantic-attestation",
    schema_version: "2.0",
    attested_at: ATTESTED_AT,
    binding: {
      candidate_id: candidate.candidate_id,
      challenge_nonce: plan.binding.challenge_nonce,
      evidence_root_sha256: semanticEvidenceFilesSha256(evidenceFiles),
      observations_sha256: observations.observations_sha256,
      plan_sha256: plan.plan_sha256,
      repository_object_sha256: plan.binding.repository_object_sha256,
      run_id: plan.binding.run_id,
    },
    attester: { actor_id: options.attesterActor ?? "qa-1", independence_policy_sha256: policySha256, key_id: keyId, role: "independent_qa" },
    judgments: [{ case_id: "forged-credential", disposition: "supports", evidence_refs: [stdoutRef], rationale: "The observed decision rejects the forged credential." }],
    scope: { case_plan_adequacy: "adequate", limitations: [] },
  };
  const payload = canonicalJson(unsigned);
  const attestation: SemanticAttestationV2 = {
    ...unsigned,
    signature: {
      algorithm: "Ed25519",
      key_id: keyId,
      signature_base64url: Buffer.from(sign(null, Buffer.from(payload), attester.privateKey)).toString("base64url"),
      signed_payload_sha256: sha256Bytes(payload),
    },
  };
  return { plan, observations, attestation, evidenceFiles };
}

/** Commit a semantic contract so the live census has one runtime-attested candidate. */
async function addSemanticContract(value: Fixture): Promise<void> {
  await put(join(value.repo, "planning/backlog/contract.md"), CONTRACT_PLANNING);
  await git(value.repo, "add", ".");
  await git(value.repo, "commit", "-m", "semantic contract");
  rebind(value, await git(value.repo, "rev-parse", "HEAD"));
  const system = ((value.bundle.planning_discovery as RecordValue).systems as RecordValue[])[0]!;
  const corpus = system.corpus as RecordValue;
  corpus.total = 3;
  corpus.classified = 3;
  corpus.census = await captureFileCensus({ repository_root: value.repo, roots: ["planning"] });
  corpus.artifacts = [
    { path: "planning/backlog/contract.md", class: "backlog", sha256: digest(CONTRACT_PLANNING), byte_length: Buffer.byteLength(CONTRACT_PLANNING) },
    { path: "planning/backlog/next.md", class: "backlog", sha256: digest(NEXT_PLANNING), byte_length: Buffer.byteLength(NEXT_PLANNING) },
    { path: "planning/done/done.md", class: "done", sha256: digest(DONE_PLANNING), byte_length: Buffer.byteLength(DONE_PLANNING) },
  ];
}

/**
 * A CLEAN bundle whose semantic boundary rests on a v2 attestation signed by a
 * key the closer minted, listed in a trust policy the closer wrote and froze
 * into the bundle.
 */
async function selfAttestedBundle(): Promise<{ readonly value: Fixture; readonly policySha256: string }> {
  const value = await fixture();
  await addSemanticContract(value);
  const attester = testKey();
  const policy = policyBytes([policyKey(attester, "qa-1", "qa-key", ["independent_qa"])]);
  const policyPath = join(value.proof, "semantic-trust-policy.json");
  const packagePath = join(value.proof, "semantic-evidence-package.json");
  writeFileSync(policyPath, policy);
  const policySha256 = sha256Bytes(policy);
  const evidence = runtimeEvidence(value.repo, policySha256, attester);
  writeFileSync(packagePath, `${JSON.stringify({
    record_type: "mister-clean.semantic-evidence-package",
    schema_version: "2.0",
    plan: evidence.plan,
    runtime_records: [{
      attestation: evidence.attestation,
      candidate_id: evidence.observations.candidate_id,
      evidence_files: evidence.evidenceFiles,
      observations: evidence.observations,
    }],
  }, null, 2)}\n`);
  value.semantic = {
    audit: () => auditSemanticEvidencePackageV2(value.repo, packagePath, policyPath),
    inputRefs: [
      { kind: "semantic_evidence_package", path: "semantic-evidence-package.json", sha256: digest(readFileSync(packagePath)) },
      { kind: "semantic_trust_policy", path: "semantic-trust-policy.json", sha256: policySha256 },
    ],
  };
  await value.persist();
  return { value, policySha256 };
}

describe("trust root (master-gate S0)", { timeout: 120_000 }, () => {
  describe("pin", () => {
    it("refuses CLEAN when a self-minted key in a self-supplied policy verified the attestation and the judge gave no pin", async () => {
      const { value, policySha256 } = await selfAttestedBundle();
      const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining(`trust policy sha256 ${policySha256} matches no judge-supplied pin (pins: none)`));
    });

    it("refuses a judge pin that differs from the bound policy and names both digests", async () => {
      const { value, policySha256 } = await selfAttestedBundle();
      const other = "a".repeat(64);
      const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo, trustPolicyPins: [other] });
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining(`trust policy sha256 ${policySha256} matches no judge-supplied pin (pins: ${other})`));
    });

    it("validates CLEAN when the bound policy matches one of several judge pins and reports the pin it used", async () => {
      const { value, policySha256 } = await selfAttestedBundle();
      await expect(validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo, trustPolicyPins: ["b".repeat(64), policySha256] }))
        .resolves.toEqual({ errors: [], ok: true, trustPolicyPinsUsed: [policySha256] });
    });

    it("reads judge pins from repeatable flags and the environment, refusing a malformed one", () => {
      const first = "c".repeat(64);
      const second = "d".repeat(64);
      expect(trustPolicyPins([first], { [TRUST_POLICY_PIN_ENV]: `${second}, ${first}` })).toEqual([first, second]);
      expect(trustPolicyPins([], {})).toEqual([]);
      expect(() => trustPolicyPins(["not-a-digest"], {})).toThrow(/--trust-policy-sha256/);
      expect(() => trustPolicyPins([], { [TRUST_POLICY_PIN_ENV]: "ABC" })).toThrow(new RegExp(TRUST_POLICY_PIN_ENV));
    });

    it("the CLI refuses a malformed --trust-policy-sha256 as a usage error", async () => {
      const output = capture();
      expect(await runCli(["validate", "bundle", "/nonexistent/bundle.json", "--trust-policy-sha256", "xyz"], output.io)).toBe(2);
      expect(output.stderr.join("\n")).toContain("--trust-policy-sha256");
    });
  });

  describe("attester identity", () => {
    function subject(): string {
      const root = mkdtempSync(join(tmpdir(), "mister-clean-trust-root-policy-"));
      scratch.push(root);
      return root;
    }

    async function repoWithContract(): Promise<string> {
      const value = await fixture();
      await addSemanticContract(value);
      return value.repo;
    }

    function verify(repo: string, keys: readonly RecordValue[], attester: TestKey, options: Parameters<typeof runtimeEvidence>[3] = {}) {
      const directory = subject();
      const policyPath = join(directory, "policy.json");
      const bytes = policyBytes(keys);
      writeFileSync(policyPath, bytes);
      const evidence = runtimeEvidence(repo, sha256Bytes(bytes), attester, options);
      return verifyRuntimeSemanticCandidateV2({ ...evidence, repository: repo, trustPolicyPath: policyPath });
    }

    it("accepts an attester whose policy key is distinct from every runner and supervisor identity", async () => {
      const repo = await repoWithContract();
      const attester = testKey();
      expect(verify(repo, [policyKey(attester, "qa-1", "qa-key", ["independent_qa"])], attester))
        .toEqual({ errors: [], verdict: "attested_satisfied" });
    });

    it("refuses an attester whose verifying key the policy also grants to the runner, even under another actor_id", async () => {
      const repo = await repoWithContract();
      const shared = testKey();
      const result = verify(repo, [
        policyKey(shared, "runner-1", "runner-key", ["runner"]),
        policyKey(shared, "qa-1", "qa-key", ["independent_qa"]),
      ], shared);
      expect(result.verdict).toBe("verification_debt");
      expect(result.errors).toContainEqual(expect.stringContaining("semantic attester must be independent of the runner and supervisor"));
    });

    it("refuses a signature verified by a key that the policy grants only the runner role", async () => {
      const repo = await repoWithContract();
      const runner = testKey();
      const result = verify(repo, [policyKey(runner, "qa-1", "qa-key", ["runner"])], runner);
      expect(result.verdict).toBe("verification_debt");
      expect(result.errors).toContain("semantic attester is not authorized by the external trust policy");
    });

    it("refuses an attester key the policy binds to the runner's identity", async () => {
      const repo = await repoWithContract();
      const attester = testKey();
      const result = verify(repo, [policyKey(attester, "runner-1", "qa-key", ["independent_qa"])], attester, { attesterActor: "runner-1" });
      expect(result.verdict).toBe("verification_debt");
      expect(result.errors).toContainEqual(expect.stringContaining("semantic attester must be independent of the runner and supervisor"));
    });

    it("refuses a policy key without valid_to", async () => {
      const repo = await repoWithContract();
      const attester = testKey();
      const result = verify(repo, [policyKey(attester, "qa-1", "qa-key", ["independent_qa"], { valid_from: KEY_WINDOW.valid_from })], attester);
      expect(result.verdict).toBe("verification_debt");
      expect(result.errors).toContainEqual(expect.stringContaining("valid_to"));
    });
  });

  describe("exception signature", () => {
    interface ExceptionCase {
      readonly value: Fixture;
      readonly debt: RecordValue;
      readonly ruling: RecordValue;
    }

    /** A CLEAN bundle whose only live finding is held as an accepted exception by an operator ruling. */
    async function acceptedExceptionBundle(): Promise<ExceptionCase> {
      const { value, debt, observationId } = await publicSafetyDebtFixture();
      const ruling: RecordValue = {
        record_type: "mister-clean.operator-ruling",
        debt_id: debt.id,
        actor: "principal",
        at: "2026-08-25T09:00:00Z",
        scope: "irreparable historical fixture path retained as explicit test evidence",
        rationale: "the fixture deliberately preserves the historical string to test the exception path",
        request_sha256: (value.bundle.criteria_discovery as RecordValue).request_sha256,
      };
      debt.state = "accepted_exception";
      debt.disposition = "accepted_exception";
      value.report.verdict = "CLEAN";
      value.report.debt_census = { discovered: 1, paid: 0, accepted_exception: 1 };
      value.report.handoff_assessment = {
        recommendation: "proceed",
        reasons: ["the only remaining physical finding is an owner-ruled irreparable historical exception"],
        conditions: [],
      };
      value.regression.accounting = deriveRegressionAccounting({
        repo_id: String((value.report.repo as RecordValue).id),
        baseline_observation_ids: [observationId],
        closing_observation_ids: [observationId],
        action_observations: [],
        root_debts: [debt as never],
      });
      return { value, debt, ruling };
    }

    /** Write the ruling (and the policy it names) into the bundle and bind the debt's exception to it. */
    async function persistRuling(item: ExceptionCase): Promise<void> {
      const { value, debt, ruling } = item;
      await putJson(join(value.proof, "operator-ruling.json"), ruling);
      debt.exception = {
        actor: ruling.actor,
        at: ruling.at,
        scope: ruling.scope,
        rationale: ruling.rationale,
        ref: { path: "operator-ruling.json", sha256: digest(await readFile(join(value.proof, "operator-ruling.json"))) },
      };
      await persistRegressionMutation(value);
    }

    /** Bind the ruling to its debt and policy, then sign its canonical bytes. */
    async function signRuling(item: ExceptionCase, keys: readonly RecordValue[], signer: TestKey, keyId: string): Promise<string> {
      const policy = policyBytes(keys);
      await put(join(item.value.proof, "owner-trust-policy.json"), policy);
      const policySha256 = sha256Bytes(policy);
      Object.assign(item.ruling, {
        debt_key: item.debt.debt_key,
        detector_finding_fingerprints: item.debt.detector_finding_fingerprints,
        observation_ids: item.debt.observation_ids,
        trust_policy_ref: { path: "owner-trust-policy.json", sha256: policySha256 },
      });
      const unsigned = { ...item.ruling };
      delete unsigned.signature;
      item.ruling.signature = { algorithm: "Ed25519", key_id: keyId, signature_base64url: signRecord(unsigned, signer) };
      return policySha256;
    }

    it("refuses CLEAN on an unsigned operator ruling; the exception stays payable", async () => {
      const item = await acceptedExceptionBundle();
      await persistRuling(item);
      const result = await validateBundle(item.value.bundle, item.value.bundlePath, { repoPath: item.value.repo });
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual(expect.stringMatching(/completion_debts\[0\]\.exception: .*stays payable.*unsigned/));
      expect(result.errors).toContainEqual(expect.stringContaining("$.live_detector_coverage.public_safety: CLEAN requires zero payable findings"));
    });

    it("refuses CLEAN on a ruling signed by an agent key that holds no owner or principal role", async () => {
      const item = await acceptedExceptionBundle();
      const agent = testKey();
      const pin = await signRuling(item, [policyKey(agent, "principal", "agent-key", ["independent_qa"])], agent, "agent-key");
      await persistRuling(item);
      const result = await validateBundle(item.value.bundle, item.value.bundlePath, { repoPath: item.value.repo, trustPolicyPins: [pin] });
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual(expect.stringMatching(/completion_debts\[0\]\.exception: .*stays payable.*owner or principal role/));
    });

    it("refuses CLEAN on an owner-signed ruling whose trust policy the judge did not supply", async () => {
      const item = await acceptedExceptionBundle();
      const owner = testKey();
      const policySha256 = await signRuling(item, [policyKey(owner, "principal", "owner-key", ["owner"])], owner, "owner-key");
      await persistRuling(item);
      const result = await validateBundle(item.value.bundle, item.value.bundlePath, { repoPath: item.value.repo });
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining(`trust policy sha256 ${policySha256} matches no judge-supplied pin (pins: none)`));
    });

    it("refuses CLEAN when a signed ruling names a different finding set than its debt", async () => {
      const item = await acceptedExceptionBundle();
      const owner = testKey();
      const pin = await signRuling(item, [policyKey(owner, "principal", "owner-key", ["owner"])], owner, "owner-key");
      item.debt.detector_finding_fingerprints = ["e".repeat(64)];
      await persistRuling(item);
      const result = await validateBundle(item.value.bundle, item.value.bundlePath, { repoPath: item.value.repo, trustPolicyPins: [pin] });
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual(expect.stringMatching(/completion_debts\[0\]\.exception: .*detector_finding_fingerprints/));
    });

    it("refuses CLEAN when a ruling naming the judge-supplied owner key was tampered with after signing", async () => {
      const item = await acceptedExceptionBundle();
      const owner = testKey();
      const pin = await signRuling(item, [policyKey(owner, "principal", "owner-key", ["owner"])], owner, "owner-key");
      item.ruling.scope = `${String(item.ruling.scope)} (widened after signing)`;
      await persistRuling(item);
      const result = await validateBundle(item.value.bundle, item.value.bundlePath, { repoPath: item.value.repo, trustPolicyPins: [pin] });
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual(expect.stringMatching(/completion_debts\[0\]\.exception: .*stays payable.*does not verify over its canonical bytes/));
      expect(result.errors).toContainEqual(expect.stringContaining("$.live_detector_coverage.public_safety: CLEAN requires zero payable findings"));
    });

    it("refuses CLEAN when a ruling naming the judge-supplied owner key carries random signature bytes", async () => {
      const item = await acceptedExceptionBundle();
      const owner = testKey();
      const pin = await signRuling(item, [policyKey(owner, "principal", "owner-key", ["owner"])], owner, "owner-key");
      item.ruling.signature = { algorithm: "Ed25519", key_id: "owner-key", signature_base64url: Buffer.from(randomBytes(64)).toString("base64url") };
      await persistRuling(item);
      const result = await validateBundle(item.value.bundle, item.value.bundlePath, { repoPath: item.value.repo, trustPolicyPins: [pin] });
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual(expect.stringMatching(/completion_debts\[0\]\.exception: .*stays payable.*does not verify over its canonical bytes/));
      expect(result.errors).toContainEqual(expect.stringContaining("$.live_detector_coverage.public_safety: CLEAN requires zero payable findings"));
    });

    it("counts an owner-signed ruling under a judge-supplied policy toward CLEAN", async () => {
      const item = await acceptedExceptionBundle();
      const owner = testKey();
      const pin = await signRuling(item, [policyKey(owner, "principal", "owner-key", ["owner"])], owner, "owner-key");
      await persistRuling(item);
      await expect(validateBundle(item.value.bundle, item.value.bundlePath, { repoPath: item.value.repo, trustPolicyPins: [pin] }))
        .resolves.toEqual({ errors: [], ok: true, trustPolicyPinsUsed: [pin] });
    });
  });

  describe("live path", () => {
    it("(a) gives a GUARD-mode bundle marked CLEAN the full live recheck", async () => {
      const value = await fixture();
      value.report.mode = "GUARD";
      value.manifest.mode = "GUARD";
      await value.persist();
      await put(join(value.repo, "untracked-live-drift.txt"), "drift\n");
      const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("$.report.repo: CLEAN requires a clean live working tree");
    });

    it("(b) reruns the judge's current detector registry, not the registry 5 a schema 1.5 bundle declares", async () => {
      const value = await fixture();
      await put(join(value.repo, ".mister-clean/language-policy.json"), `${JSON.stringify({
        schema: "mister-clean.language-policy/1",
        forbid_extensions: [".rb"],
        allow: [],
        generated: [],
      })}\n`);
      await put(join(value.repo, "tool.rb"), "puts 1\n");
      await git(value.repo, "add", ".");
      await git(value.repo, "commit", "-m", "forbidden language");
      rebind(value, await git(value.repo, "rev-parse", "HEAD"));
      await value.persist();
      expect((value.regression.detector_coverage as RecordValue).registry_version).toBe("5");
      const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("$.live_detector_coverage.language_policy: CLEAN requires zero payable findings after owner-signed exceptions (got 1)");
    });

    it("(c) never counts the legacy v1 semantic manifest toward CLEAN", async () => {
      const value = await fixture();
      // A complete, binding v1 manifest for a repository with no semantic candidates.
      const manifestPath = join(value.proof, "semantic-probe-manifest.json");
      const manifestBytes = `${JSON.stringify({
        record_type: "mister-clean.semantic-probes",
        schema_version: "1.1",
        subject_commit: value.head,
        subject_tree_sha256: semanticWorkingTreeSha256(value.repo),
        candidate_set_sha256: semanticCandidateSetSha256(discoverSemanticProbeCandidates(value.repo)),
        observed_at: "2026-08-25T09:00:00Z",
        probes: [],
      })}\n`;
      await put(manifestPath, manifestBytes);
      value.semantic = {
        audit: () => auditSemanticRepository(value.repo, { manifestPath }),
        inputRefs: [{ kind: "semantic_probe_manifest", path: "semantic-probe-manifest.json", sha256: digest(manifestBytes) }],
      };
      await value.persist();
      const result = await validateBundle(value.bundle, value.bundlePath, { repoPath: value.repo });
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining("$.live_detector_coverage.semantic_boundary: the legacy v1 semantic probe manifest never counts toward CLEAN"));
    });
  });

  describe("validate receipt", () => {
    it("validate bundle writes a VALIDATE run receipt with its verdict, bundle digest, subject commit and trust-policy digests", async () => {
      const value = await fixture();
      const store = new LocalRunReceiptStore(join(tmpdir(), `mister-clean-trust-root-receipts-${crypto.randomUUID()}`));
      temporaryRoots.push(store.root);
      const pin = "f".repeat(64);
      const output = capture();
      const code = await runCli(["validate", "bundle", value.bundlePath, "--repo", value.repo, "--trust-policy-sha256", pin], output.io, undefined, undefined, store);
      expect(code).toBe(1);
      expect(output.stderr).toContainEqual(expect.stringMatching(/^receipt: WROTE id=mc-receipt:[0-9a-f-]{36} mode=VALIDATE families= findings=0$/));
      const entries = store.index();
      expect(entries).toHaveLength(1);
      const receipt = store.read(entries[0]!.receipt_id);
      expect(receipt).toMatchObject({
        mode: "VALIDATE",
        verdict: "NOT_CLEAN",
        exit_code: 1,
        families: [],
        findings: [],
        validation: {
          bundle_sha256: digest(await readFile(value.bundlePath)),
          subject_commit: value.head,
          trust_policy_pins: [pin],
          trust_policy_pins_used: [],
          live: true,
        },
      });
      expect(receipt.subject.head_commit).toBe(value.head);
    });

    it("only a passing live validation of a CLEAN report yields a CLEAN receipt verdict", () => {
      expect(validateReceiptVerdict({ ok: true, live: true, reportVerdict: "CLEAN" })).toBe("CLEAN");
      expect(validateReceiptVerdict({ ok: false, live: true, reportVerdict: "CLEAN" })).toBe("NOT_CLEAN");
      expect(validateReceiptVerdict({ ok: true, live: false, reportVerdict: "CLEAN" })).toBe("NOT_CLEAN");
      expect(validateReceiptVerdict({ ok: true, live: true, reportVerdict: "NOT_CLEAN" })).toBe("NOT_CLEAN");
      expect(validateReceiptVerdict({ ok: true, live: true, reportVerdict: undefined })).toBe("NOT_CLEAN");
    });

    it("a receipt records CLEAN only from validate, never from a closer-written CLOSE report", () => {
      const receipt = {
        record_type: "mister-clean.run-receipt",
        schema_version: "1",
        receipt_id: "mc-receipt:00000000-0000-4000-8000-000000000000",
        invocation_id: null,
        mode: "CLOSE",
        repository_id: `local-path-sha256:${"1".repeat(64)}`,
        subject: { repository_object: null, head_commit: "2".repeat(40), head_tree: "3".repeat(40) },
        dirty: false,
        detector_registry_sha256: "4".repeat(64),
        runtime_identity_sha256: "5".repeat(64),
        agent: { identity_status: "unobserved", card_ref: null, source: null },
        families: [],
        findings: [],
        verdict: "CLEAN",
        exit_code: 0,
        observed_at: "2026-08-25T09:00:00.000Z",
        finished_at: "2026-08-25T09:00:00.000Z",
      };
      expect(runReceiptErrors(receipt)).toContain("$.verdict: CLEAN is recorded only by a VALIDATE receipt");
      expect(runReceiptErrors({ ...receipt, verdict: "NOT_CLEAN" })).toEqual([]);
    });
  });
});

function capture(): { io: CliIO; stderr: string[]; stdout: string[] } {
  const stderr: string[] = [];
  const stdout: string[] = [];
  return { io: { stderr: (line) => stderr.push(line), stdout: (line) => stdout.push(line) }, stderr, stdout };
}
