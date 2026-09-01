import { verify } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { canonicalJson, sha256Bytes } from "../canonical-json.js";
import {
  auditSemanticRepository,
  discoverSemanticProbeCandidates,
  semanticCandidateSetSha256,
  semanticWorkingTreeSha256,
  type SemanticProbeCandidate,
  type SemanticAuditResult,
  type SemanticFindingCode,
  type SemanticProbeExecution,
  type SemanticProbeFinding,
  type SemanticProbeResolution,
  type SemanticProbeKind,
} from "./semantic.js";

export type SemanticCandidateVerdictV2 =
  | "attested_satisfied"
  | "confirmed_failure"
  | "deterministically_satisfied"
  | "operate_time_pending"
  | "verification_debt";

export type DirectSemanticKindV2 =
  | "authoritative_projection"
  | "bounded_state_lifecycle"
  | "executable_surface_coverage"
  | "execution_identity_coverage"
  | "historical_evidence_portability"
  | "identifier_namespace"
  | "instruction_polarity"
  | "supersession_lineage";

export type RuntimeSemanticKindV2 =
  | "acceptance_effect_liveness"
  | "behavioral_dimension"
  | "composition_root_reachability"
  | "construction_boundary"
  | "environment_semantics"
  | "failure_domain_independence"
  | "gate_semantic_bite"
  | "representation_equivalence";

export interface SemanticEvidenceRefV2 {
  captured_at: string;
  media_type: string;
  path: string;
  sha256: string;
  store: "evidence_bundle";
}

export interface SemanticEvidenceFileV2 {
  bytes_base64url: string;
  path: string;
  sha256: string;
}

export interface SemanticSourceRefV2 {
  line?: number;
  path: string;
  sha256: string;
}

export interface SemanticSubjectBindingV2 {
  candidate_set_sha256: string;
  challenge_nonce: string;
  observed_at: string;
  repository_object_sha256: string;
  run_id: string;
}

interface SemanticCandidateBaseV2 {
  candidate_id: string;
  contract_sha256: string;
  kind: SemanticProbeKind;
  legacy_candidate_ids: string[];
  refs: SemanticSourceRefV2[];
  subject_key: string;
}

export interface DirectSemanticCandidateV2 extends SemanticCandidateBaseV2 {
  checker: {
    definition_sha256: string;
    id: string;
    version: string;
  };
  kind: DirectSemanticKindV2;
  resolution_mode: "direct_check";
}

export interface RuntimeSemanticCaseV2 {
  case_id: string;
  intent: string;
  required_observations: string[];
}

export interface RuntimeSemanticCandidateV2 extends SemanticCandidateBaseV2 {
  case_plan: {
    cases: RuntimeSemanticCaseV2[];
    plan_sha256: string;
  };
  kind: RuntimeSemanticKindV2;
  resolution_mode: "runtime_attested";
}

export type SemanticCandidateV2 = DirectSemanticCandidateV2 | RuntimeSemanticCandidateV2;

export interface SemanticPlanV2 {
  binding: SemanticSubjectBindingV2;
  candidates: SemanticCandidateV2[];
  plan_sha256: string;
  producer: {
    actor_id: "mister-clean";
    protocol_version: "2.0";
  };
  record_type: "mister-clean.semantic-plan";
  schema_version: "2.0";
}

export interface SemanticObservationsV2 {
  binding: SemanticSubjectBindingV2;
  candidate_id: string;
  cases: Array<{
    case_id: string;
    ended_at: string;
    exit_status: number | null;
    observations: Array<{
      evidence_refs: SemanticEvidenceRefV2[];
      name: string;
      type: "boolean" | "digest" | "event_count" | "integer" | "string";
      value: boolean | number | string;
    }>;
    signal: string | null;
    started_at: string;
    stderr_ref: SemanticEvidenceRefV2;
    stdout_ref: SemanticEvidenceRefV2;
  }>;
  observations_sha256: string;
  plan_sha256: string;
  record_type: "mister-clean.semantic-observations";
  runner: {
    actor_id: string;
    argv_sha256: string;
    cwd: "subject_root";
    executable_sha256: string;
  };
  schema_version: "2.0";
  supervisor: {
    actor_id: "mister-clean";
    checker_version: string;
  };
  tree_after_sha256: string;
  tree_before_sha256: string;
}

export interface SemanticAttestationV2 {
  attested_at: string;
  attester: {
    actor_id: string;
    independence_policy_sha256: string;
    key_id: string;
    role: "domain_evaluator" | "independent_qa";
  };
  binding: {
    candidate_id: string;
    challenge_nonce: string;
    evidence_root_sha256: string;
    observations_sha256: string;
    plan_sha256: string;
    repository_object_sha256: string;
    run_id: string;
  };
  judgments: Array<{
    case_id: string;
    disposition: "inconclusive" | "refutes" | "supports";
    evidence_refs: SemanticEvidenceRefV2[];
    rationale: string;
  }>;
  record_type: "mister-clean.semantic-attestation";
  schema_version: "2.0";
  scope: {
    case_plan_adequacy: "adequate" | "inadequate" | "inconclusive";
    limitations: string[];
  };
  signature: {
    algorithm: "Ed25519";
    key_id: string;
    signature_base64url: string;
    signed_payload_sha256: string;
  };
}

export interface SemanticTrustPolicyV2 {
  keys: Array<{
    actor_id: string;
    key_id: string;
    public_key_pem: string;
    roles: Array<"domain_evaluator" | "independent_qa">;
    valid_from: string;
    valid_to?: string;
  }>;
  policy_id: string;
  record_type: "mister-clean.semantic-trust-policy";
  schema_version: "1.0";
}

export interface SemanticEvidencePackageV2 {
  plan: SemanticPlanV2;
  record_type: "mister-clean.semantic-evidence-package";
  runtime_records: Array<{
    attestation: SemanticAttestationV2;
    candidate_id: string;
    evidence_files: SemanticEvidenceFileV2[];
    observations: SemanticObservationsV2;
  }>;
  schema_version: "2.0";
}

export interface SemanticV2VerificationResult {
  errors: string[];
  verdict: SemanticCandidateVerdictV2;
}

const HEX_64 = /^[0-9a-f]{64}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/u;
const VERDICT_KEYS = new Set(["disposition", "failed_cases", "passed_cases", "result", "verdict"]);

const DIRECT_CHECKERS: Record<DirectSemanticKindV2, { readonly id: string; readonly version: string }> = {
  authoritative_projection: { id: "mister-clean/authoritative-projection", version: "2.0.0" },
  bounded_state_lifecycle: { id: "mister-clean/bounded-state-lifecycle", version: "2.0.0" },
  executable_surface_coverage: { id: "mister-clean/executable-surface-coverage", version: "2.0.0" },
  execution_identity_coverage: { id: "mister-clean/execution-identity-coverage", version: "2.0.0" },
  historical_evidence_portability: { id: "mister-clean/historical-evidence-portability", version: "2.0.0" },
  identifier_namespace: { id: "mister-clean/identifier-namespace", version: "2.0.0" },
  instruction_polarity: { id: "mister-clean/instruction-polarity", version: "2.0.0" },
  supersession_lineage: { id: "mister-clean/supersession-lineage", version: "2.0.0" },
};

const DIRECT_KINDS = new Set<SemanticProbeKind>(Object.keys(DIRECT_CHECKERS) as DirectSemanticKindV2[]);

function isInside(root: string, path: string): boolean {
  const relation = relative(root, path);
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

function validIsoTimestamp(value: string): boolean {
  return ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}

function sourceRef(repository: string, rawRef: string): SemanticSourceRefV2 {
  const [rawPath, fragment = ""] = rawRef.split("#", 2);
  if (!rawPath || isAbsolute(rawPath) || rawPath === ".." || rawPath.startsWith("../")) {
    throw new Error(`semantic source reference is not repository-relative: ${rawRef}`);
  }
  const absolute = resolve(repository, rawPath);
  if (!isInside(resolve(repository), absolute) || !existsSync(absolute) || !lstatSync(absolute).isFile() || lstatSync(absolute).isSymbolicLink()) {
    throw new Error(`semantic source reference is missing, non-file, symlinked, or outside the repository: ${rawRef}`);
  }
  const lineMatch = /^line-(\d+)$/u.exec(fragment);
  return {
    ...(lineMatch ? { line: Number(lineMatch[1]) } : {}),
    path: rawPath.replaceAll("\\", "/"),
    sha256: sha256Bytes(readFileSync(absolute)),
  };
}

function directChecker(kind: DirectSemanticKindV2): DirectSemanticCandidateV2["checker"] {
  const checker = DIRECT_CHECKERS[kind];
  return {
    ...checker,
    definition_sha256: sha256Bytes(canonicalJson({ ...checker, kind, owner: "mister-clean-compiled-registry" })),
  };
}

function planDigest(plan: Omit<SemanticPlanV2, "plan_sha256">): string {
  return sha256Bytes(canonicalJson({ ...plan, plan_sha256: "" }));
}

function observationDigest(observations: SemanticObservationsV2): string {
  return sha256Bytes(canonicalJson({ ...observations, observations_sha256: "" }));
}

function assertNoRunnerVerdict(value: unknown, path = "observations"): string[] {
  if (Array.isArray(value)) return value.flatMap((entry, index) => assertNoRunnerVerdict(entry, `${path}[${index}]`));
  if (!value || typeof value !== "object") return [];
  const errors: string[] = [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (VERDICT_KEYS.has(key)) errors.push(`runner-authored verdict field ${path}.${key} is forbidden`);
    errors.push(...assertNoRunnerVerdict(entry, `${path}.${key}`));
  }
  return errors;
}

function unsignedAttestation(attestation: SemanticAttestationV2): Omit<SemanticAttestationV2, "signature"> {
  const { signature: _signature, ...unsigned } = attestation;
  return unsigned;
}

function exactSet(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}

function evidenceRefsIn(value: SemanticObservationsV2 | SemanticAttestationV2): SemanticEvidenceRefV2[] {
  return value.record_type === "mister-clean.semantic-observations"
    ? value.cases.flatMap((item) => [
      item.stdout_ref,
      item.stderr_ref,
      ...item.observations.flatMap((observation) => observation.evidence_refs),
    ])
    : value.judgments.flatMap((item) => item.evidence_refs);
}

function walkEvidenceFiles(root: string, directory = root): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`semantic evidence root rejects symlink: ${relative(root, absolute)}`);
    if (entry.isDirectory()) result.push(...walkEvidenceFiles(root, absolute));
    else if (entry.isFile()) result.push(relative(root, absolute).split(sep).join("/"));
    else throw new Error(`semantic evidence root rejects special entry: ${relative(root, absolute)}`);
  }
  return result.sort();
}

function semanticEvidenceRootSha256Once(evidenceRoot: string): string {
  const root = realpathSync(resolve(evidenceRoot));
  const paths = walkEvidenceFiles(root);
  const hashInput: Array<string | Uint8Array> = [];
  for (const path of paths) {
    const bytes = readFileSync(resolve(root, path));
    hashInput.push(`${path.length}:${path}\0${bytes.byteLength}:`, bytes, "\0");
  }
  return sha256Bytes(Buffer.concat(hashInput.map((item) => typeof item === "string" ? Buffer.from(item) : Buffer.from(item))));
}

export function semanticEvidenceRootSha256(evidenceRoot: string): string {
  const first = semanticEvidenceRootSha256Once(evidenceRoot);
  const second = semanticEvidenceRootSha256Once(evidenceRoot);
  if (first !== second) throw new Error("semantic evidence root changed during capture");
  return first;
}

function verifyEvidenceRefs(evidenceRoot: string, refs: readonly SemanticEvidenceRefV2[]): string[] {
  const errors: string[] = [];
  const root = realpathSync(resolve(evidenceRoot));
  for (const ref of refs) {
    if (ref.store !== "evidence_bundle" || !validIsoTimestamp(ref.captured_at)
      || !ref.media_type.trim() || !ref.path.trim() || isAbsolute(ref.path)
      || ref.path === ".." || ref.path.startsWith("../") || !HEX_64.test(ref.sha256)) {
      errors.push(`semantic evidence reference is malformed: ${ref.path || "<blank>"}`);
      continue;
    }
    const absolute = resolve(root, ref.path);
    if (!isInside(root, absolute) || !existsSync(absolute) || !lstatSync(absolute).isFile() || lstatSync(absolute).isSymbolicLink()) {
      errors.push(`semantic evidence reference is missing, symlinked, or outside the evidence root: ${ref.path}`);
      continue;
    }
    if (sha256Bytes(readFileSync(absolute)) !== ref.sha256) errors.push(`semantic evidence reference digest mismatch: ${ref.path}`);
  }
  return errors;
}

function evidenceFilesMap(files: readonly SemanticEvidenceFileV2[]): { readonly errors: string[]; readonly files: Map<string, Uint8Array> } {
  const errors: string[] = [];
  const result = new Map<string, Uint8Array>();
  for (const file of files) {
    if (!file.path.trim() || isAbsolute(file.path) || file.path === ".." || file.path.startsWith("../")
      || !HEX_64.test(file.sha256) || result.has(file.path)) {
      errors.push(`semantic evidence package has an invalid or duplicate path: ${file.path || "<blank>"}`);
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = Buffer.from(file.bytes_base64url, "base64url");
    } catch {
      errors.push(`semantic evidence package has invalid base64url bytes: ${file.path}`);
      continue;
    }
    if (sha256Bytes(bytes) !== file.sha256) errors.push(`semantic evidence package file digest mismatch: ${file.path}`);
    result.set(file.path, bytes);
  }
  return { errors, files: result };
}

export function semanticEvidenceFilesSha256(files: readonly SemanticEvidenceFileV2[]): string {
  const parsed = evidenceFilesMap(files);
  if (parsed.errors.length > 0) throw new Error(parsed.errors.join("; "));
  const hashInput: Array<string | Uint8Array> = [];
  for (const [path, bytes] of [...parsed.files].sort(([left], [right]) => left.localeCompare(right))) {
    hashInput.push(`${path.length}:${path}\0${bytes.byteLength}:`, bytes, "\0");
  }
  return sha256Bytes(Buffer.concat(hashInput.map((item) => typeof item === "string" ? Buffer.from(item) : Buffer.from(item))));
}

function verifyPackagedEvidenceRefs(
  files: readonly SemanticEvidenceFileV2[],
  refs: readonly SemanticEvidenceRefV2[],
): string[] {
  const parsed = evidenceFilesMap(files);
  const errors = [...parsed.errors];
  for (const ref of refs) {
    if (ref.store !== "evidence_bundle" || !validIsoTimestamp(ref.captured_at)
      || !ref.media_type.trim() || !ref.path.trim() || !HEX_64.test(ref.sha256)) {
      errors.push(`semantic evidence reference is malformed: ${ref.path || "<blank>"}`);
      continue;
    }
    const bytes = parsed.files.get(ref.path);
    if (!bytes) errors.push(`semantic evidence reference is absent from the package: ${ref.path}`);
    else if (sha256Bytes(bytes) !== ref.sha256) errors.push(`semantic evidence reference digest mismatch: ${ref.path}`);
  }
  return errors;
}

export function createSemanticPlanV2(input: {
  readonly candidateSetSha256: string;
  readonly candidates: readonly SemanticProbeCandidate[];
  readonly challengeNonce: string;
  readonly observedAt: string;
  readonly repository: string;
  readonly repositoryObjectSha256: string;
  readonly runId: string;
  readonly runtimeCases: Readonly<Record<string, readonly RuntimeSemanticCaseV2[]>>;
}): SemanticPlanV2 {
  if (!HEX_64.test(input.candidateSetSha256) || !HEX_64.test(input.repositoryObjectSha256)) {
    throw new Error("semantic v2 plan requires SHA-256 candidate-set and RepositoryObject bindings");
  }
  if (!input.runId.trim() || !input.challengeNonce.trim() || !validIsoTimestamp(input.observedAt)) {
    throw new Error("semantic v2 plan requires run id, unique challenge nonce, and timezone-aware observed_at");
  }
  const repository = resolve(input.repository);
  const discovered = discoverSemanticProbeCandidates(repository);
  if (semanticCandidateSetSha256(discovered) !== input.candidateSetSha256
    || semanticCandidateSetSha256(input.candidates) !== input.candidateSetSha256) {
    throw new Error("semantic v2 plan candidate census does not match Mister Clean discovery");
  }
  if (semanticWorkingTreeSha256(repository) !== input.repositoryObjectSha256) {
    throw new Error("semantic v2 plan RepositoryObject binding does not match the audited repository");
  }
  const candidates = input.candidates.map((candidate): SemanticCandidateV2 => {
    const refs = candidate.refs.map((ref) => sourceRef(repository, ref))
      .sort((left, right) => left.path.localeCompare(right.path) || (left.line ?? 0) - (right.line ?? 0));
    const contractSha256 = sha256Bytes(canonicalJson({
      evidence: [...candidate.evidence].sort(),
      kind: candidate.kind,
      legacy_candidate_id: candidate.id,
      path: candidate.path,
      refs,
    }));
    const candidateId = sha256Bytes(`semantic-v2\0${candidate.kind}\0${candidate.path}\0${contractSha256}`);
    const base: SemanticCandidateBaseV2 = {
      candidate_id: candidateId,
      contract_sha256: contractSha256,
      kind: candidate.kind,
      legacy_candidate_ids: [candidate.id],
      refs,
      subject_key: candidate.path,
    };
    if (DIRECT_KINDS.has(candidate.kind)) {
      const kind = candidate.kind as DirectSemanticKindV2;
      return { ...base, checker: directChecker(kind), kind, resolution_mode: "direct_check" };
    }
    const kind = candidate.kind as RuntimeSemanticKindV2;
    const cases = input.runtimeCases[candidate.id];
    if (!cases?.length) throw new Error(`runtime semantic candidate ${candidate.id} requires a nonempty Mister Clean case plan`);
    const normalizedCases = cases.map((item) => ({
      case_id: item.case_id.trim(),
      intent: item.intent.trim(),
      required_observations: [...new Set(item.required_observations.map((entry) => entry.trim()))].filter(Boolean).sort(),
    }));
    if (normalizedCases.some((item) => !item.case_id || !item.intent || item.required_observations.length === 0)
      || new Set(normalizedCases.map((item) => item.case_id)).size !== normalizedCases.length) {
      throw new Error(`runtime semantic candidate ${candidate.id} has an invalid or duplicate case plan`);
    }
    return {
      ...base,
      case_plan: {
        cases: normalizedCases,
        plan_sha256: sha256Bytes(canonicalJson(normalizedCases)),
      },
      kind,
      resolution_mode: "runtime_attested",
    };
  }).sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
  const unsigned: Omit<SemanticPlanV2, "plan_sha256"> = {
    binding: {
      candidate_set_sha256: input.candidateSetSha256,
      challenge_nonce: input.challengeNonce.trim(),
      observed_at: input.observedAt,
      repository_object_sha256: input.repositoryObjectSha256,
      run_id: input.runId.trim(),
    },
    candidates,
    producer: { actor_id: "mister-clean", protocol_version: "2.0" },
    record_type: "mister-clean.semantic-plan",
    schema_version: "2.0",
  };
  return { ...unsigned, plan_sha256: planDigest(unsigned) };
}

function validatePlanAgainstRepository(plan: SemanticPlanV2, repository: string): string[] {
  const errors: string[] = [];
  const { plan_sha256: _planSha256, ...unsignedPlan } = plan;
  if (plan.record_type !== "mister-clean.semantic-plan" || plan.schema_version !== "2.0"
    || plan.producer.actor_id !== "mister-clean" || plan.plan_sha256 !== planDigest(unsignedPlan)) {
    errors.push("semantic plan is not a valid Mister Clean-generated v2 plan");
  }
  const currentCandidates = discoverSemanticProbeCandidates(repository);
  if (semanticWorkingTreeSha256(repository) !== plan.binding.repository_object_sha256
    || semanticCandidateSetSha256(currentCandidates) !== plan.binding.candidate_set_sha256) {
    errors.push("semantic plan does not bind the current RepositoryObject and complete candidate census");
    return errors;
  }
  try {
    const runtimeCases = Object.fromEntries(plan.candidates
      .filter((item): item is RuntimeSemanticCandidateV2 => item.resolution_mode === "runtime_attested")
      .map((item) => [item.legacy_candidate_ids[0]!, item.case_plan.cases]));
    const expectedPlan = createSemanticPlanV2({
      candidateSetSha256: plan.binding.candidate_set_sha256,
      candidates: currentCandidates,
      challengeNonce: plan.binding.challenge_nonce,
      observedAt: plan.binding.observed_at,
      repository,
      repositoryObjectSha256: plan.binding.repository_object_sha256,
      runId: plan.binding.run_id,
      runtimeCases,
    });
    if (canonicalJson(expectedPlan) !== canonicalJson(plan)) errors.push("semantic plan content was not generated from the current Mister Clean census");
  } catch (error) {
    errors.push(`semantic plan cannot be reproduced: ${error instanceof Error ? error.message : String(error)}`);
  }
  return errors;
}

export function verifyDirectSemanticCandidateV2(input: {
  readonly candidateId: string;
  readonly plan: SemanticPlanV2;
  readonly repository: string;
}): SemanticV2VerificationResult {
  const repository = realpathSync(resolve(input.repository));
  const errors = validatePlanAgainstRepository(input.plan, repository);
  const candidate = input.plan.candidates.find((item) => item.candidate_id === input.candidateId);
  if (!candidate || candidate.resolution_mode !== "direct_check") {
    errors.push("direct semantic candidate is absent from the reproduced plan");
  }
  if (errors.length > 0 || !candidate || candidate.resolution_mode !== "direct_check") {
    return { errors, verdict: "verification_debt" };
  }
  // These candidates exist only when the compiled census has mechanically
  // observed a missing identity binding or a source-to-gate reachability gap.
  // Other direct-class discoveries remain verification debt until their
  // authority is represented structurally rather than inferred from prose.
  const verdict: SemanticCandidateVerdictV2 = candidate.kind === "execution_identity_coverage"
    || candidate.kind === "executable_surface_coverage"
    || candidate.kind === "historical_evidence_portability"
    || candidate.kind === "supersession_lineage"
    ? "confirmed_failure"
    : "verification_debt";
  return {
    errors: verdict === "verification_debt"
      ? ["direct candidate requires a stronger structured authority contract before deterministic adjudication"]
      : [],
    verdict,
  };
}

export function verifyRuntimeSemanticCandidateV2(input: {
  readonly attestation: SemanticAttestationV2;
  readonly consumedNonces?: Set<string>;
  readonly evidenceFiles?: readonly SemanticEvidenceFileV2[];
  readonly evidenceRoot?: string;
  readonly observations: SemanticObservationsV2;
  readonly plan: SemanticPlanV2;
  readonly repository: string;
  readonly trustPolicyPath: string;
}): SemanticV2VerificationResult {
  const { attestation, observations, plan } = input;
  const errors: string[] = [];
  const repository = realpathSync(resolve(input.repository));
  const policyPath = realpathSync(resolve(input.trustPolicyPath));
  if (isInside(repository, policyPath)) errors.push("semantic trust policy must live outside the audited repository");
  let evidenceRootSha256 = "";
  let verifyBoundEvidence: (refs: readonly SemanticEvidenceRefV2[]) => string[];
  if ((input.evidenceRoot === undefined) === (input.evidenceFiles === undefined)) {
    errors.push("semantic verification requires exactly one external evidence root or inline evidence-file set");
    verifyBoundEvidence = () => [];
  } else if (input.evidenceRoot !== undefined) {
    const evidenceRoot = realpathSync(resolve(input.evidenceRoot));
    if (isInside(repository, evidenceRoot)) errors.push("semantic evidence root must live outside the audited repository");
    evidenceRootSha256 = semanticEvidenceRootSha256(evidenceRoot);
    verifyBoundEvidence = (refs) => verifyEvidenceRefs(evidenceRoot, refs);
  } else {
    const files = input.evidenceFiles ?? [];
    try {
      evidenceRootSha256 = semanticEvidenceFilesSha256(files);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    verifyBoundEvidence = (refs) => verifyPackagedEvidenceRefs(files, refs);
  }

  let policy: SemanticTrustPolicyV2 | undefined;
  const policyBytes = readFileSync(policyPath);
  try {
    policy = JSON.parse(new TextDecoder().decode(policyBytes)) as SemanticTrustPolicyV2;
  } catch {
    errors.push("semantic trust policy is not valid JSON");
  }
  if (policy?.record_type !== "mister-clean.semantic-trust-policy" || policy.schema_version !== "1.0" || !Array.isArray(policy.keys)) {
    errors.push("semantic trust policy record_type, schema_version, or keys are invalid");
  }

  errors.push(...validatePlanAgainstRepository(plan, repository));
  const candidate = plan.candidates.find((item) => item.candidate_id === observations.candidate_id);
  if (!candidate || candidate.resolution_mode !== "runtime_attested") {
    errors.push("observations do not identify one runtime-attested candidate in the plan");
  }
  if (observations.record_type !== "mister-clean.semantic-observations" || observations.schema_version !== "2.0") {
    errors.push("semantic observations record_type or schema_version is invalid");
  }
  if (observations.plan_sha256 !== plan.plan_sha256 || canonicalJson(observations.binding) !== canonicalJson(plan.binding)) {
    errors.push("semantic observations do not bind the exact plan and subject");
  }
  if (observations.observations_sha256 !== observationDigest(observations)) {
    errors.push("semantic observations self-digest is invalid");
  }
  if (observations.supervisor.actor_id !== "mister-clean") errors.push("semantic observations were not supervised by Mister Clean");
  if (observations.tree_before_sha256 !== plan.binding.repository_object_sha256
    || observations.tree_after_sha256 !== plan.binding.repository_object_sha256) {
    errors.push("semantic probe subject changed before or during observation capture");
  }
  errors.push(...assertNoRunnerVerdict(observations.cases));
  errors.push(...verifyBoundEvidence(evidenceRefsIn(observations)));

  if (candidate?.resolution_mode === "runtime_attested") {
    const plannedCases = candidate.case_plan.cases.map((item) => item.case_id);
    const observedCases = observations.cases.map((item) => item.case_id);
    if (!exactSet(plannedCases, observedCases) || observedCases.length !== new Set(observedCases).size) {
      errors.push("semantic observations must contain each planned case exactly once");
    }
    for (const plannedCase of candidate.case_plan.cases) {
      const observed = observations.cases.find((item) => item.case_id === plannedCase.case_id);
      if (!observed) continue;
      const names = observed.observations.map((item) => item.name);
      if (!plannedCase.required_observations.every((name) => names.includes(name))) {
        errors.push(`semantic observation case ${plannedCase.case_id} omits a required observation`);
      }
    }
  }

  if (attestation.record_type !== "mister-clean.semantic-attestation" || attestation.schema_version !== "2.0"
    || !validIsoTimestamp(attestation.attested_at)) {
    errors.push("semantic attestation record_type, schema_version, or attested_at is invalid");
  }
  const expectedBinding = {
    candidate_id: observations.candidate_id,
    challenge_nonce: plan.binding.challenge_nonce,
    observations_sha256: observations.observations_sha256,
    plan_sha256: plan.plan_sha256,
    repository_object_sha256: plan.binding.repository_object_sha256,
    run_id: plan.binding.run_id,
  };
  for (const [key, value] of Object.entries(expectedBinding)) {
    if (attestation.binding[key as keyof typeof expectedBinding] !== value) errors.push(`semantic attestation binding mismatch: ${key}`);
  }
  if (!HEX_64.test(attestation.binding.evidence_root_sha256)) errors.push("semantic attestation evidence-root digest is invalid");
  else if (evidenceRootSha256 !== attestation.binding.evidence_root_sha256) {
    errors.push("semantic attestation evidence-root digest does not match the supplied evidence bundle");
  }
  errors.push(...verifyBoundEvidence(evidenceRefsIn(attestation)));
  if (attestation.attester.actor_id === observations.runner.actor_id
    || attestation.attester.actor_id === observations.supervisor.actor_id) {
    errors.push("semantic attester must be independent of the runner and supervisor");
  }
  const policySha256 = sha256Bytes(policyBytes);
  if (attestation.attester.independence_policy_sha256 !== policySha256) {
    errors.push("semantic attestation does not bind the external trust policy bytes");
  }
  const key = policy?.keys.find((item) => item.key_id === attestation.attester.key_id);
  if (!key || key.actor_id !== attestation.attester.actor_id
    || !key.roles.includes(attestation.attester.role)) {
    errors.push("semantic attester is not authorized by the external trust policy");
  }
  if (key && (!validIsoTimestamp(key.valid_from) || Date.parse(attestation.attested_at) < Date.parse(key.valid_from)
    || (key.valid_to !== undefined && (!validIsoTimestamp(key.valid_to) || Date.parse(attestation.attested_at) > Date.parse(key.valid_to))))) {
    errors.push("semantic attester key is outside its validity window");
  }
  if (attestation.signature.algorithm !== "Ed25519" || attestation.signature.key_id !== attestation.attester.key_id) {
    errors.push("semantic attestation signature algorithm or key id is invalid");
  }
  const payload = canonicalJson(unsignedAttestation(attestation));
  if (attestation.signature.signed_payload_sha256 !== sha256Bytes(payload)) {
    errors.push("semantic attestation signed-payload digest is invalid");
  }
  if (key) {
    try {
      const signature = Buffer.from(attestation.signature.signature_base64url, "base64url");
      if (!verify(null, Buffer.from(payload), key.public_key_pem, signature)) errors.push("semantic attestation signature is invalid");
    } catch {
      errors.push("semantic attestation signature or public key is invalid");
    }
  }

  const plannedCases = candidate?.resolution_mode === "runtime_attested"
    ? candidate.case_plan.cases.map((item) => item.case_id)
    : [];
  const judgedCases = attestation.judgments.map((item) => item.case_id);
  if (!exactSet(plannedCases, judgedCases) || judgedCases.length !== new Set(judgedCases).size) {
    errors.push("semantic attestation must judge every planned case exactly once");
  }
  if (input.consumedNonces?.has(plan.binding.challenge_nonce)) {
    errors.push("semantic challenge nonce was already consumed");
  }
  if (errors.length > 0) return { errors, verdict: "verification_debt" };

  input.consumedNonces?.add(plan.binding.challenge_nonce);
  if (attestation.scope.case_plan_adequacy !== "adequate"
    || attestation.judgments.some((item) => item.disposition === "inconclusive")) {
    return { errors, verdict: "operate_time_pending" };
  }
  if (attestation.judgments.some((item) => item.disposition === "refutes")) {
    return { errors, verdict: "confirmed_failure" };
  }
  return { errors, verdict: "attested_satisfied" };
}

function failureCode(kind: SemanticProbeKind): SemanticFindingCode {
  return ({
    acceptance_effect_liveness: "acceptance_effect_liveness_failure",
    authoritative_projection: "authoritative_projection_failure",
    behavioral_dimension: "behavioral_dimension_failure",
    bounded_state_lifecycle: "bounded_state_lifecycle_failure",
    composition_root_reachability: "mechanism_unwired_at_composition_root",
    construction_boundary: "construction_boundary_failure",
    environment_semantics: "environment_semantics_failure",
    executable_surface_coverage: "executable_surface_coverage_failure",
    execution_identity_coverage: "execution_identity_coverage_failure",
    failure_domain_independence: "failure_domain_independence_failure",
    gate_semantic_bite: "gate_semantic_bite_failure",
    historical_evidence_portability: "historical_evidence_portability_failure",
    identifier_namespace: "identifier_namespace_failure",
    instruction_polarity: "instruction_polarity_failure",
    representation_equivalence: "representation_equivalence_failure",
    supersession_lineage: "supersession_lineage_failure",
  } satisfies Record<SemanticProbeKind, SemanticFindingCode>)[kind];
}

function packageFinding(
  candidate: SemanticProbeCandidate,
  code: SemanticFindingCode,
  classification: SemanticProbeFinding["classification"],
  detail: string,
): SemanticProbeFinding {
  return {
    candidate_id: candidate.id,
    classification,
    code,
    detail,
    kind: candidate.kind,
    refs: candidate.refs,
  };
}

export function auditSemanticEvidencePackageV2(
  repository: string,
  packagePath: string,
  trustPolicyPath: string,
): SemanticAuditResult {
  const root = realpathSync(resolve(repository));
  const externalPackagePath = realpathSync(resolve(packagePath));
  const externalTrustPolicyPath = realpathSync(resolve(trustPolicyPath));
  const base = auditSemanticRepository(root);
  const packageBytes = readFileSync(externalPackagePath);
  const manifestSha256 = sha256Bytes(packageBytes);
  const findings: SemanticProbeFinding[] = [];
  const executions: SemanticProbeExecution[] = [];
  const resolutions: SemanticProbeResolution[] = [];
  let evidencePackage: SemanticEvidencePackageV2 | undefined;
  try {
    evidencePackage = JSON.parse(new TextDecoder().decode(packageBytes)) as SemanticEvidencePackageV2;
  } catch {
    // Diagnosed below as one package-level binding failure.
  }
  const packageErrors: string[] = [];
  if (isInside(root, externalPackagePath)) packageErrors.push("semantic evidence package must live outside the audited repository");
  if (isInside(root, externalTrustPolicyPath)) packageErrors.push("semantic trust policy must live outside the audited repository");
  if (evidencePackage?.record_type !== "mister-clean.semantic-evidence-package"
    || evidencePackage.schema_version !== "2.0" || !Array.isArray(evidencePackage.runtime_records)
    || !evidencePackage.plan) {
    packageErrors.push("semantic evidence package must be schema 2.0 with one plan and runtime_records array");
  }
  try {
    const trustPolicy = JSON.parse(readFileSync(externalTrustPolicyPath, "utf8")) as SemanticTrustPolicyV2;
    if (trustPolicy.record_type !== "mister-clean.semantic-trust-policy"
      || trustPolicy.schema_version !== "1.0" || !Array.isArray(trustPolicy.keys)) {
      packageErrors.push("semantic trust policy record_type, schema_version, or keys are invalid");
    }
  } catch {
    packageErrors.push("semantic trust policy is not valid JSON");
  }
  if (evidencePackage?.plan) {
    try {
      packageErrors.push(...validatePlanAgainstRepository(evidencePackage.plan, root));
    } catch (error) {
      packageErrors.push(`semantic plan cannot be validated: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (packageErrors.length > 0 || !evidencePackage) {
    findings.push({
      candidate_id: "manifest",
      classification: "verification_debt",
      code: "semantic_probe_manifest_invalid",
      detail: [...new Set(packageErrors)].join("; "),
      kind: "construction_boundary",
      refs: ["external-semantic-evidence-package"],
    });
  } else {
    const plan = evidencePackage.plan;
    const runtimeByCandidate = new Map<string, SemanticEvidencePackageV2["runtime_records"][number]>();
    for (const record of evidencePackage.runtime_records) {
      if (!record || typeof record.candidate_id !== "string" || runtimeByCandidate.has(record.candidate_id)) {
        packageErrors.push(`semantic evidence package has a missing or duplicate runtime candidate: ${String(record?.candidate_id ?? "<blank>")}`);
        continue;
      }
      runtimeByCandidate.set(record.candidate_id, record);
    }
    const plannedLegacyIds = new Set(plan.candidates.flatMap((candidate) => candidate.legacy_candidate_ids));
    for (const candidate of base.candidates) {
      if (!plannedLegacyIds.has(candidate.id)) packageErrors.push(`semantic v2 plan omits discovered candidate ${candidate.id}`);
    }
    for (const planned of plan.candidates) {
      const legacyId = planned.legacy_candidate_ids[0];
      const candidate = base.candidates.find((item) => item.id === legacyId);
      if (!candidate) {
        packageErrors.push(`semantic v2 plan includes a candidate outside the live census: ${planned.candidate_id}`);
        continue;
      }
      if (planned.resolution_mode === "direct_check") {
        const result = verifyDirectSemanticCandidateV2({ candidateId: planned.candidate_id, plan, repository: root });
        if (result.verdict === "deterministically_satisfied") {
          resolutions.push({ candidate_id: candidate.id, disposition: result.verdict, evidence_refs: [], rationale: "compiled Mister Clean direct checker satisfied the structured contract" });
        } else if (result.verdict === "confirmed_failure") {
          findings.push(packageFinding(candidate, failureCode(candidate.kind), "confirmed_product_defect", "compiled Mister Clean direct checker confirmed the bound violation"));
        } else {
          findings.push(packageFinding(candidate, "semantic_probe_incomplete", "verification_debt", result.errors.join("; ") || "compiled direct check is inconclusive"));
        }
        continue;
      }
      const record = runtimeByCandidate.get(planned.candidate_id);
      if (!record) {
        findings.push(packageFinding(candidate, "semantic_probe_unexecuted", "verification_debt", "semantic v2 package omits supervised observations and independent attestation"));
        continue;
      }
      let result: SemanticV2VerificationResult;
      try {
        result = verifyRuntimeSemanticCandidateV2({
          attestation: record.attestation,
          evidenceFiles: record.evidence_files,
          observations: record.observations,
          plan,
          repository: root,
          trustPolicyPath: externalTrustPolicyPath,
        });
      } catch (error) {
        result = { errors: [error instanceof Error ? error.message : String(error)], verdict: "verification_debt" };
      }
      const statuses = record.observations?.cases?.map((item) => item.exit_status) ?? [];
      const oneStatus = new Set(statuses).size === 1 ? statuses[0] ?? null : null;
      executions.push({
        candidate_id: candidate.id,
        command_sha256: record.observations?.runner?.argv_sha256 ?? "0".repeat(64),
        evidence_sha256: record.observations?.observations_sha256 ?? "0".repeat(64),
        executable: "v2-supervised-runtime",
        observed_status: oneStatus,
        receipt_sha256: record.attestation?.signature?.signed_payload_sha256 ?? "0".repeat(64),
        result: result.verdict === "attested_satisfied" ? "pass" : result.verdict === "confirmed_failure" ? "fail" : "error",
      });
      if (result.verdict === "attested_satisfied") {
        const evidenceRefs = record.attestation.judgments.flatMap((judgment) => judgment.evidence_refs)
          .map((ref) => ({ path: ref.path, sha256: ref.sha256 }));
        resolutions.push({
          candidate_id: candidate.id,
          disposition: result.verdict,
          evidence_refs: evidenceRefs,
          rationale: "external independent attestation satisfied every adequate planned case",
        });
      } else if (result.verdict === "confirmed_failure") {
        findings.push(packageFinding(candidate, failureCode(candidate.kind), "confirmed_product_defect", "independent semantic attestation refuted one or more required cases"));
      } else if (result.verdict === "operate_time_pending") {
        findings.push(packageFinding(candidate, "semantic_probe_operate_time_pending", "operate_time_pending", "independent semantic attestation remains inadequate or inconclusive"));
      } else {
        findings.push(packageFinding(candidate, "semantic_probe_execution_error", "verification_debt", result.errors.join("; ") || "semantic v2 verification failed"));
      }
    }
    for (const candidateId of runtimeByCandidate.keys()) {
      if (!plan.candidates.some((candidate) => candidate.candidate_id === candidateId && candidate.resolution_mode === "runtime_attested")) {
        packageErrors.push(`semantic evidence package contains an orphan runtime record: ${candidateId}`);
      }
    }
    if (packageErrors.length > 0) {
      findings.splice(0, findings.length, {
        candidate_id: "manifest",
        classification: "verification_debt",
        code: "semantic_probe_manifest_invalid",
        detail: [...new Set(packageErrors)].sort().join("; "),
        kind: "construction_boundary",
        refs: ["external-semantic-evidence-package"],
      });
      executions.splice(0);
      resolutions.splice(0);
    }
  }
  const status = base.candidates.length === 0 && findings.length === 0
    ? "not_applicable"
    : findings.length > 0 ? "fail" : "pass";
  return {
    candidate_probe_count: base.candidates.length,
    candidate_set_sha256: base.candidate_set_sha256,
    candidates: base.candidates,
    confirmed_failure_count: findings.filter((finding) => finding.classification === "confirmed_product_defect").length,
    executed_probe_count: executions.length,
    executions,
    exitCode: status === "fail" ? 1 : 0,
    findings,
    ...(evidencePackage?.plan?.binding?.observed_at
      ? { manifest_observed_at: evidencePackage.plan.binding.observed_at }
      : {}),
    manifest_sha256: manifestSha256,
    pending_probe_count: findings.filter((finding) => finding.classification === "operate_time_pending").length,
    resolved_probe_count: resolutions.length,
    resolutions,
    snapshot: base.snapshot,
    status,
    trust_policy_sha256: sha256Bytes(readFileSync(externalTrustPolicyPath)),
    working_tree_sha256: base.working_tree_sha256,
  };
}
