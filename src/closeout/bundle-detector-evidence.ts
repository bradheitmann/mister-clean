/** Detector execution, replay-origin, and comparator evidence validation. */
import { isAbsolute } from "node:path";

import {
  DETECTOR_COVERAGE_SCHEMA_VERSION,
  detectorApplicabilityForPolicy,
  detectorById,
  detectorRegistrySha256,
  detectorResultShapeErrors,
  detectorRunPolicySha256,
  detectorRuntimeIdentityErrors,
  detectorRuntimeIdentitySha256,
  findingFingerprintsFromAudit,
  planningFindingFingerprint,
  requiredDetectorIdsForPolicy,
  semanticFindingFingerprint,
  sortedUnique,
  type DetectorRuntimeIdentity,
} from "./detector-coverage.js";
import {
  canonicalObservationId,
  canonicalRootDebtKey,
} from "./regression-accounting.js";
import {
  HEX64,
  array,
  evidenceRef,
  iso,
  loadBytesRef,
  loadRef,
  object,
  requireExactObject,
  requireObject,
  sha256,
  stableEqual,
  text,
  validateEvidenceClock,
  validateRepositoryObject,
  type EvidenceClock,
  type FilePort,
  type JsonObject,
} from "./bundle-runtime.js";

export interface CanonicalRootProjection {
  readonly debt_key: string;
  readonly normalizer: string;
  readonly cause_key: JsonObject;
  readonly observation_ids: readonly string[];
}

export interface ActionRepositoryBoundary {
  readonly before: JsonObject;
  readonly after: JsonObject;
}

export function detectorRootProjections(
  detectorId: string,
  value: unknown,
  repoId: string,
): CanonicalRootProjection[] {
  const result = object(value);
  if (!result) return [];
  const rows: Array<{ normalizer: string; causeKey: JsonObject; fingerprints: string[] }> = [];
  if (detectorId === "planning_graph") {
    for (const rawDebt of array(result.root_debts)) {
      const debt = object(rawDebt);
      if (!debt) continue;
      const fingerprints = array(debt.raw_finding_ids)
        .filter((id): id is string => typeof id === "string")
        .map(planningFindingFingerprint);
      rows.push({
        normalizer: "mister-clean/planning-root@1",
        causeKey: {
          detector_family: "planning_graph",
          source_cause_key: debt.cause_key,
          repair_boundary: debt.repair_boundary,
        },
        fingerprints,
      });
    }
  } else if (detectorId === "semantic_boundary") {
    const findings = array(result.findings).map(object).filter((finding): finding is JsonObject => Boolean(finding));
    const unassigned = findings.filter((finding) => finding.code === "semantic_probe_unassigned"
      && typeof finding.candidate_id === "string");
    if (unassigned.length > 0 && typeof result.candidate_set_sha256 === "string") {
      rows.push({
        normalizer: "mister-clean/semantic-candidate-set@1",
        causeKey: {
          detector_family: "semantic_boundary",
          candidate_set_sha256: result.candidate_set_sha256,
          code: "semantic_probe_unassigned",
        },
        fingerprints: unassigned.map((finding) => semanticFindingFingerprint(
          String(finding.candidate_id),
          "semantic_probe_unassigned",
        )).sort(),
      });
    }
    for (const finding of findings.filter((row) => row.code !== "semantic_probe_unassigned")) {
      if (!finding || typeof finding.candidate_id !== "string" || typeof finding.code !== "string") continue;
      rows.push({
        normalizer: "mister-clean/semantic-root@1",
        causeKey: {
          detector_family: "semantic_boundary",
          candidate_id: finding.candidate_id,
          code: finding.code,
        },
        fingerprints: [semanticFindingFingerprint(finding.candidate_id, finding.code)],
      });
    }
  } else if (detectorId === "public_safety") {
    for (const rawFinding of array(result.findings)) {
      const finding = object(rawFinding);
      if (!finding || typeof finding.fingerprint !== "string") continue;
      rows.push({
        normalizer: "mister-clean/public-safety-root@1",
        causeKey: {
          detector_family: "public_safety",
          rule: finding.rule,
          path: finding.path,
          line: finding.line,
        },
        fingerprints: [finding.fingerprint],
      });
    }
    for (const rawFinding of array(result.unassessed)) {
      const finding = object(rawFinding);
      if (!finding || typeof finding.fingerprint !== "string") continue;
      rows.push({
        normalizer: "mister-clean/public-safety-root@1",
        causeKey: {
          detector_family: "public_safety",
          reason: finding.reason,
          path: finding.path,
        },
        fingerprints: [finding.fingerprint],
      });
    }
  } else if (detectorId === "github_actions") {
    const grouped = new Map<string, JsonObject[]>();
    for (const rawFinding of array(result.findings)) {
      const finding = object(rawFinding);
      if (!finding || typeof finding.fingerprint !== "string"
        || typeof finding.path !== "string" || typeof finding.rule !== "string") continue;
      const key = `${finding.path}\0${finding.rule}`;
      grouped.set(key, [...(grouped.get(key) ?? []), finding]);
    }
    for (const findings of grouped.values()) {
      const first = findings[0];
      if (!first) continue;
      rows.push({
        normalizer: "mister-clean/github-actions-root@1",
        causeKey: {
          detector_family: "github_actions",
          path: first.path,
          rule: first.rule,
        },
        fingerprints: findings
          .map((finding) => String(finding.fingerprint))
          .sort(),
      });
    }
  }
  const sourceId = detectorById(detectorId)?.detector;
  if (!sourceId) return [];
  return rows.map(({ normalizer, causeKey, fingerprints }) => ({
    debt_key: canonicalRootDebtKey({ repo_id: repoId, normalizer, cause_key: causeKey as never }),
    normalizer,
    cause_key: causeKey,
    observation_ids: sortedUnique(fingerprints.map((fingerprint) => canonicalObservationId({
      source_id: sourceId,
      source_native_fingerprint: fingerprint,
    }))),
  }));
}

export async function validateBaselineReplayOrigin(
  ref: unknown,
  debt: JsonObject,
  debtPath: string,
  baselineObject: unknown,
  baselineRepositoryObject: JsonObject | undefined,
  runtimeIdentitySha256: unknown,
  repoId: string,
  base: string,
  files: FilePort,
  allowPlaceholders: boolean,
  clock: EvidenceClock | undefined,
  errors: string[],
): Promise<void> {
  const path = `${debtPath}.origin.baseline_replay_ref`;
  const replay = await evidenceRef(
    files,
    base,
    ref,
    path,
    errors,
    allowPlaceholders,
    clock,
    "mister-clean.baseline-replay",
  );
  if (!replay) return;
  requireExactObject(replay, [
    "record_type", "schema_version", "detector_id", "baseline_object",
    "baseline_repository_object", "detector_registry_sha256", "runtime_identity_sha256",
    "result_ref", "observed_at",
  ], path, errors);
  if (replay.schema_version !== "1.0") errors.push(`${path}.schema_version: expected 1.0`);
  if (replay.baseline_object !== baselineObject) {
    errors.push(`${path}.baseline_object: must equal the immutable regression baseline object`);
  }
  const replayRepositoryObject = validateRepositoryObject(
    replay.baseline_repository_object,
    `${path}.baseline_repository_object`,
    errors,
    baselineObject,
  );
  if (baselineRepositoryObject && replayRepositoryObject
    && !stableEqual(replayRepositoryObject, baselineRepositoryObject)) {
    errors.push(`${path}.baseline_repository_object: must equal the immutable regression baseline repository object`);
  }
  const detectorId = String(replay.detector_id ?? "");
  const detector = detectorById(detectorId, DETECTOR_COVERAGE_SCHEMA_VERSION);
  if (!detector) errors.push(`${path}.detector_id: must name a canonical detector family`);
  const causalDetector = String(object(debt.cause_key)?.detector_family ?? "");
  if (detector && detectorId !== causalDetector) {
    errors.push(`${path}.detector_id: must equal the debt causal detector family`);
  }
  if (replay.detector_registry_sha256 !== detectorRegistrySha256(DETECTOR_COVERAGE_SCHEMA_VERSION)) {
    errors.push(`${path}.detector_registry_sha256: must equal the canonical detector registry`);
  }
  if (replay.runtime_identity_sha256 !== runtimeIdentitySha256) {
    errors.push(`${path}.runtime_identity_sha256: must equal the regression detector runtime identity`);
  }
  if (!iso(replay.observed_at)) errors.push(`${path}.observed_at: required ISO-8601 timestamp`);
  const loaded = await loadRef(
    files,
    base,
    replay.result_ref,
    `${path}.result_ref`,
    errors,
    allowPlaceholders,
  );
  if (!loaded.data || !detector) return;
  if (clock) validateEvidenceClock(loaded.data, `${path}.result_ref`, clock, errors);
  if (loaded.data.object !== baselineObject) {
    errors.push(`${path}.result_ref.object: must equal the immutable regression baseline object`);
  }
  const resultRepositoryObject = validateRepositoryObject(
    loaded.data.repository_object,
    `${path}.result_ref.repository_object`,
    errors,
    baselineObject,
  );
  if (baselineRepositoryObject && resultRepositoryObject
    && !stableEqual(resultRepositoryObject, baselineRepositoryObject)) {
    errors.push(`${path}.result_ref.repository_object: must equal the immutable regression baseline repository object`);
  }
  const shapeErrors = detectorResultShapeErrors(detectorId, loaded.data);
  const fingerprints = findingFingerprintsFromAudit(detectorId, loaded.data);
  if (!fingerprints) {
    errors.push(`${path}.result_ref: does not contain the canonical detector result (${shapeErrors.join("; ")})`);
    return;
  }
  const matchingRoot = detectorRootProjections(detectorId, loaded.data, repoId)
    .find((projection) => projection.debt_key === debt.debt_key);
  if (!matchingRoot
    || matchingRoot.normalizer !== debt.normalizer
    || !stableEqual(matchingRoot.cause_key, debt.cause_key)
    || !stableEqual(matchingRoot.observation_ids, debt.observation_ids)) {
    errors.push(`${path}: exact-baseline replay does not independently reproduce this root debt and its observations`);
  }
}

export async function validateExternalChangeOrigin(
  ref: unknown,
  debt: JsonObject,
  debtPath: string,
  earliestActionId: string | undefined,
  actionBoundaries: ReadonlyMap<string, ActionRepositoryBoundary>,
  base: string,
  files: FilePort,
  allowPlaceholders: boolean,
  clock: EvidenceClock | undefined,
  errors: string[],
): Promise<void> {
  const path = `${debtPath}.origin.change_ref`;
  const transition = await evidenceRef(
    files,
    base,
    ref,
    path,
    errors,
    allowPlaceholders,
    clock,
    "mister-clean.external-change",
  );
  if (!transition) return;
  requireExactObject(transition, [
    "record_type", "schema_version", "observed_during_action_id",
    "before_repository_object", "after_repository_object", "observation_ids",
    "changed_paths", "writer", "observer", "observed_at",
  ], path, errors);
  if (transition.schema_version !== "1.0") errors.push(`${path}.schema_version: expected 1.0`);
  if (!earliestActionId) {
    errors.push(`${path}.observed_during_action_id: concurrent_external requires an observation first seen at an action boundary`);
  } else if (transition.observed_during_action_id !== earliestActionId) {
    errors.push(`${path}.observed_during_action_id: must equal the earliest action where the root observation appeared`);
  }
  const boundary = earliestActionId ? actionBoundaries.get(earliestActionId) : undefined;
  const before = validateRepositoryObject(
    transition.before_repository_object,
    `${path}.before_repository_object`,
    errors,
  );
  const after = validateRepositoryObject(
    transition.after_repository_object,
    `${path}.after_repository_object`,
    errors,
  );
  if (boundary && before && !stableEqual(before, boundary.before)) {
    errors.push(`${path}.before_repository_object: must equal that action's exact before object`);
  }
  if (boundary && after && !stableEqual(after, boundary.after)) {
    errors.push(`${path}.after_repository_object: must equal that action's exact after object`);
  }
  if (before && after && stableEqual(before, after)) {
    errors.push(`${path}: external-change evidence requires a real repository-object transition`);
  }
  const observationIds = array(transition.observation_ids)
    .filter((id): id is string => typeof id === "string" && HEX64.test(id));
  if (!Array.isArray(transition.observation_ids)
    || observationIds.length !== array(transition.observation_ids).length
    || !stableEqual(observationIds, sortedUnique(observationIds))) {
    errors.push(`${path}.observation_ids: required sorted unique lowercase SHA-256 array`);
  }
  if (!stableEqual(observationIds, debt.observation_ids)) {
    errors.push(`${path}.observation_ids: must exactly equal the attributed root observations`);
  }
  const changedPaths = array(transition.changed_paths)
    .filter((entry): entry is string => typeof entry === "string");
  if (!Array.isArray(transition.changed_paths)
    || changedPaths.length === 0
    || changedPaths.length !== array(transition.changed_paths).length
    || !stableEqual(changedPaths, sortedUnique(changedPaths))
    || changedPaths.some((entry) => isAbsolute(entry)
      || entry.includes("\\")
      || entry.split("/").some((part) => part === "" || part === "." || part === ".."))) {
    errors.push(`${path}.changed_paths: required nonempty sorted unique safe repository-relative path array`);
  }
  const writer = requireExactObject(
    transition.writer,
    ["kind", "execution_id", "receipt_ref"],
    `${path}.writer`,
    errors,
  );
  if (writer && !new Set(["external_agent", "external_process", "operator"]).has(String(writer.kind))) {
    errors.push(`${path}.writer.kind: expected external_agent, external_process, or operator`);
  }
  if (writer && !text(writer.execution_id)) errors.push(`${path}.writer.execution_id: required`);
  if (writer && !text(writer.receipt_ref)) errors.push(`${path}.writer.receipt_ref: required durable writer receipt reference`);
  const observer = requireExactObject(
    transition.observer,
    ["kind", "action_id", "execution_id"],
    `${path}.observer`,
    errors,
  );
  if (observer?.kind !== "mister_clean_action_lane") {
    errors.push(`${path}.observer.kind: expected mister_clean_action_lane`);
  }
  if (observer && observer.action_id !== earliestActionId) {
    errors.push(`${path}.observer.action_id: must equal the earliest observing action`);
  }
  if (observer && !text(observer.execution_id)) errors.push(`${path}.observer.execution_id: required`);
  if (writer && observer && writer.execution_id === observer.execution_id) {
    errors.push(`${path}: writer and observer execution identities must be independent`);
  }
  if (!iso(transition.observed_at)) errors.push(`${path}.observed_at: required ISO-8601 timestamp`);
}

export async function validateDetectorCoverage(
  record: JsonObject,
  report: JsonObject,
  base: string,
  files: FilePort,
  clean: boolean,
  allowPlaceholders: boolean,
  clock: EvidenceClock | undefined,
  comparatorFingerprints: ReadonlySet<string>,
  liveRuntimeIdentity: DetectorRuntimeIdentity | undefined,
  errors: string[],
): Promise<void> {
  const path = "$.report.regression_control.evidence_ref.detector_coverage";
  const schemaVersion = String(record.schema_version ?? "");
  if (!new Set(["1.3", "1.4", "1.5"]).has(schemaVersion)) {
    if (clean) errors.push("$.report.regression_control.evidence_ref.schema_version: CLEAN requires regression-delta schema 1.5 runtime and repository-object coverage");
    return;
  }
  if (clean && schemaVersion !== "1.5") {
    errors.push("$.report.regression_control.evidence_ref.schema_version: CLEAN requires regression-delta schema 1.5 runtime and repository-object coverage");
  }
  const requiresRepositoryObjects = schemaVersion === "1.4" || schemaVersion === "1.5";
  const requiresRuntimeIdentity = schemaVersion === "1.5";
  const coverage = requireObject(record.detector_coverage, [
    "registry_version", "registry_sha256", "run_policy", "run_policy_sha256", "applicability",
    ...(requiresRuntimeIdentity ? ["runtime_identity", "runtime_identity_sha256"] : []),
    "baseline_object", ...(requiresRepositoryObjects ? ["baseline_repository_object"] : []), "required_detector_ids",
    "executions", "finding_fingerprints",
  ], path, errors);
  if (!coverage) return;
  const expectedCoverageVersion = requiresRuntimeIdentity ? DETECTOR_COVERAGE_SCHEMA_VERSION : "1";
  if (coverage.registry_version !== expectedCoverageVersion) {
    errors.push(`${path}.registry_version: expected ${expectedCoverageVersion}`);
  }
  if (coverage.registry_sha256 !== detectorRegistrySha256(expectedCoverageVersion)) {
    errors.push(`${path}.registry_sha256: does not match the canonical detector registry`);
  }
  let runtimeIdentitySha256: string | undefined;
  if (requiresRuntimeIdentity) {
    const runtimeErrors = detectorRuntimeIdentityErrors(coverage.runtime_identity, `${path}.runtime_identity`);
    errors.push(...runtimeErrors);
    if (runtimeErrors.length === 0) {
      runtimeIdentitySha256 = detectorRuntimeIdentitySha256(coverage.runtime_identity as never);
      if (coverage.runtime_identity_sha256 !== runtimeIdentitySha256) {
        errors.push(`${path}.runtime_identity_sha256: must bind the exact normalized runtime identity`);
      }
      if (clean && object(coverage.runtime_identity)?.status !== "release_attested") {
        errors.push(`${path}.runtime_identity.status: CLEAN requires a release_attested detector runtime`);
      }
      if (liveRuntimeIdentity && !stableEqual(coverage.runtime_identity, liveRuntimeIdentity)) {
        errors.push(`${path}.runtime_identity: must exactly equal the live verifier-minted runtime identity`);
      }
    }
  }
  const policyRequiredIds = requiredDetectorIdsForPolicy(coverage.run_policy, expectedCoverageVersion);
  const expectedApplicability = detectorApplicabilityForPolicy(coverage.run_policy, expectedCoverageVersion);
  if (!policyRequiredIds || !expectedApplicability) {
    errors.push(`${path}.run_policy: invalid or unsupported bound detector policy`);
  } else {
    if (coverage.run_policy_sha256 !== detectorRunPolicySha256(coverage.run_policy as never)) {
      errors.push(`${path}.run_policy_sha256: does not bind the exact detector run policy`);
    }
    if (!stableEqual(coverage.applicability, expectedApplicability)) {
      errors.push(`${path}.applicability: must explicitly classify every canonical detector from the bound run policy`);
    }
  }
  if (coverage.baseline_object !== record.baseline_object) {
    errors.push(`${path}.baseline_object: must equal regression baseline_object`);
  }
  if (requiresRepositoryObjects) {
    const repositoryObject = validateRepositoryObject(
      coverage.baseline_repository_object,
      `${path}.baseline_repository_object`,
      errors,
      coverage.baseline_object,
    );
    if (repositoryObject && !stableEqual(repositoryObject, record.baseline_repository_object)) {
      errors.push(`${path}.baseline_repository_object: must equal regression baseline_repository_object`);
    }
  }
  const requiredIds = array(coverage.required_detector_ids);
  const registryIds = policyRequiredIds ?? [];
  if (!stableEqual(requiredIds, registryIds)) {
    errors.push(`${path}.required_detector_ids: must exactly equal the required detector set derived from the bound run policy`);
  }
  if (!Array.isArray(coverage.executions)) {
    errors.push(`${path}.executions: required array`);
    return;
  }
  const executionIds: unknown[] = [];
  const executionFingerprints = new Set<string>();
  for (const [index, raw] of array(coverage.executions).entries()) {
    const executionPath = `${path}.executions[${index}]`;
    const execution = requireObject(raw, [
      "detector_id", "phase", "object", "scope", "command", "command_sha256", "detector",
      ...(requiresRuntimeIdentity
        ? ["detector_registry_sha256", "runtime_identity_sha256"]
        : ["detector_sha256"]),
      ...(requiresRepositoryObjects ? ["repository_object"] : []),
      "input_refs", "result_ref", "result_sha256", "exit_code", "observed_at", "finding_fingerprints",
    ], executionPath, errors);
    if (!execution) continue;
    executionIds.push(execution.detector_id);
    const spec = detectorById(String(execution.detector_id ?? ""), expectedCoverageVersion);
    if (!spec) {
      errors.push(`${executionPath}.detector_id: unknown detector family`);
      continue;
    }
    if (execution.phase !== "baseline") errors.push(`${executionPath}.phase: expected baseline`);
    if (execution.object !== record.baseline_object) errors.push(`${executionPath}.object: must equal regression baseline_object`);
    if (requiresRepositoryObjects) {
      const repositoryObject = validateRepositoryObject(
        execution.repository_object,
        `${executionPath}.repository_object`,
        errors,
        execution.object,
      );
      if (repositoryObject && !stableEqual(repositoryObject, coverage.baseline_repository_object)) {
        errors.push(`${executionPath}.repository_object: must equal detector coverage baseline_repository_object`);
      }
    }
    const identityFields: readonly (readonly [string, unknown])[] = requiresRuntimeIdentity
      ? [
          ["detector_registry_sha256", sha256(new TextEncoder().encode(spec.detector))],
          ["runtime_identity_sha256", runtimeIdentitySha256],
        ]
      : [["detector_sha256", sha256(new TextEncoder().encode(spec.detector))]];
    for (const [field, expected] of [
      ["scope", spec.scope], ["command", spec.command], ["detector", spec.detector],
      ["command_sha256", sha256(new TextEncoder().encode(spec.command))],
      ...identityFields,
    ] as const) {
      if (execution[field] !== expected) errors.push(`${executionPath}.${field}: must match canonical ${spec.id} registry entry`);
    }
    if (!Number.isInteger(execution.exit_code)) errors.push(`${executionPath}.exit_code: required integer`);
    if (!iso(execution.observed_at)) errors.push(`${executionPath}.observed_at: required ISO-8601 timestamp`);
    if (!Array.isArray(execution.input_refs)) {
      errors.push(`${executionPath}.input_refs: required array`);
    } else {
      const expectedInputKinds = spec.id === "public_safety"
        ? new Set(["public_safety_denylist"])
        : spec.id === "semantic_boundary"
          ? new Set(["semantic_evidence_package", "semantic_probe_manifest", "semantic_trust_policy"])
          : new Set<string>();
      const inputKinds = new Set<string>();
      for (const [inputIndex, rawInput] of array(execution.input_refs).entries()) {
        const inputPath = `${executionPath}.input_refs[${inputIndex}]`;
        const input = requireObject(rawInput, ["kind", "path", "sha256"], inputPath, errors);
        if (!input) continue;
        if (!expectedInputKinds.has(String(input.kind))) {
          errors.push(`${inputPath}.kind: unsupported frozen input for ${spec.id}`);
        }
        if (inputKinds.has(String(input.kind ?? ""))) errors.push(`${inputPath}.kind: duplicate detector input kind`);
        inputKinds.add(String(input.kind ?? ""));
        const loadedInput = await loadBytesRef(files, base, input, inputPath, errors, allowPlaceholders);
        if (clock && (input.kind === "semantic_probe_manifest" || input.kind === "semantic_evidence_package") && loadedInput.bytes) {
          try {
            validateEvidenceClock(
              JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(loadedInput.bytes)),
              inputPath,
              clock,
              errors,
            );
          } catch (error) {
            errors.push(`${inputPath}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      if (spec.id === "public_safety") {
        const denylistInputs = array(execution.input_refs)
          .map(object)
          .filter((input) => input?.kind === "public_safety_denylist");
        if (denylistInputs.length > 1) {
          errors.push(`${executionPath}.input_refs: public-safety permits at most one optional frozen denylist input`);
        }
      }
      if (spec.id === "semantic_boundary") {
        const semanticInputs = array(execution.input_refs).map(object).filter(Boolean);
        const legacyCount = semanticInputs.filter((input) => input?.kind === "semantic_probe_manifest").length;
        const packageCount = semanticInputs.filter((input) => input?.kind === "semantic_evidence_package").length;
        const policyCount = semanticInputs.filter((input) => input?.kind === "semantic_trust_policy").length;
        if (!((legacyCount === 0 && packageCount === 0 && policyCount === 0)
          || (legacyCount === 1 && packageCount === 0 && policyCount === 0)
          || (legacyCount === 0 && packageCount === 1 && policyCount === 1))) {
          errors.push(`${executionPath}.input_refs: semantic inputs require either one legacy manifest or one v2 evidence-package/trust-policy pair`);
        }
      }
    }
    const loaded = await loadBytesRef(files, base, execution.result_ref, `${executionPath}.result_ref`, errors, allowPlaceholders);
    if (loaded.digest && execution.result_sha256 !== loaded.digest) {
      errors.push(`${executionPath}.result_sha256: must equal digest-bound result_ref bytes`);
    }
    if (!(allowPlaceholders && text(execution.result_sha256) && execution.result_sha256.includes("<"))
      && (typeof execution.result_sha256 !== "string" || !HEX64.test(execution.result_sha256))) {
      errors.push(`${executionPath}.result_sha256: required lowercase SHA-256 of exact detector output`);
    }
    if (!loaded.bytes) continue;
    try {
      const result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(loaded.bytes));
      if (clock) validateEvidenceClock(result, `${executionPath}.result_ref`, clock, errors);
      const resultRecord = object(result);
      if (requiresRepositoryObjects) {
        if (resultRecord?.object !== execution.object) {
          errors.push(`${executionPath}.result_ref: object must equal the detector execution object`);
        }
        const resultRepositoryObject = validateRepositoryObject(
          resultRecord?.repository_object,
          `${executionPath}.result_ref.repository_object`,
          errors,
          execution.object,
        );
        if (resultRepositoryObject && !stableEqual(resultRepositoryObject, execution.repository_object)) {
          errors.push(`${executionPath}.result_ref: repository_object must equal the detector execution repository_object`);
        }
      }
      const frozenInput = array(execution.input_refs)
        .map(object)
        .find((input) => input?.kind === (spec.id === "public_safety"
          ? "public_safety_denylist"
          : spec.id === "semantic_boundary" && array(execution.input_refs).some((ref) => object(ref)?.kind === "semantic_evidence_package")
            ? "semantic_evidence_package"
            : spec.id === "semantic_boundary" ? "semantic_probe_manifest" : ""));
      if (spec.id === "public_safety" && frozenInput && resultRecord?.input_sha256 !== frozenInput.sha256) {
        errors.push(`${executionPath}.result_ref: public-safety result must bind its frozen denylist SHA-256`);
      }
      if (spec.id === "public_safety" && resultRecord?.scope !== "tracked_shippable") {
        errors.push(`${executionPath}.result_ref: public-safety result must attest the tracked_shippable scope`);
      }
      if (spec.id === "public_safety") {
        const policyCount = object(object(coverage.run_policy)?.public_safety)?.tracked_path_count;
        if (resultRecord?.tracked_path_count !== policyCount) {
          errors.push(`${executionPath}.result_ref: tracked_path_count must equal the bound detector policy`);
        }
      }
      if (spec.id === "semantic_boundary" && frozenInput && resultRecord?.manifest_sha256 !== frozenInput.sha256) {
        errors.push(`${executionPath}.result_ref: semantic result must bind its frozen manifest SHA-256`);
      }
      if (spec.id === "semantic_boundary") {
        const trustInput = array(execution.input_refs).map(object).find((input) => input?.kind === "semantic_trust_policy");
        if (trustInput && resultRecord?.trust_policy_sha256 !== trustInput.sha256) {
          errors.push(`${executionPath}.result_ref: semantic v2 result must bind its frozen trust-policy SHA-256`);
        }
      }
      if (!resultRecord || !Number.isInteger(resultRecord.exitCode)) {
        errors.push(`${executionPath}.result_ref: registered detector result requires integer exitCode`);
      } else if (resultRecord.exitCode !== execution.exit_code) {
        errors.push(`${executionPath}.exit_code: must equal the registered detector result exitCode`);
      }
      const shapeErrors = detectorResultShapeErrors(spec.id, result);
      const derived = findingFingerprintsFromAudit(spec.id, result);
      if (!derived) {
        errors.push(`${executionPath}.result_ref: does not contain the registered detector's complete canonical result (${shapeErrors.join("; ")})`);
      }
      const reported = array(execution.finding_fingerprints).filter((fingerprint): fingerprint is string => typeof fingerprint === "string");
      if (!Array.isArray(execution.finding_fingerprints)
        || reported.length !== array(execution.finding_fingerprints).length
        || reported.some((fingerprint) => !HEX64.test(fingerprint))
        || !stableEqual(reported, sortedUnique(reported))) {
        errors.push(`${executionPath}.finding_fingerprints: required sorted unique lowercase SHA-256 array`);
      }
      if (derived && !stableEqual(reported, derived)) {
        errors.push(`${executionPath}.finding_fingerprints: must equal the exact result-derived fingerprint set`);
      }
      for (const fingerprint of reported) executionFingerprints.add(fingerprint);
    } catch (error) {
      errors.push(`${executionPath}.result_ref: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!stableEqual(executionIds, registryIds)) {
    errors.push(`${path}.executions: must exactly cover every policy-required detector once, in registry order`);
  }
  const reportedUnion = array(coverage.finding_fingerprints).filter((fingerprint): fingerprint is string => typeof fingerprint === "string");
  if (!Array.isArray(coverage.finding_fingerprints)
    || reportedUnion.length !== array(coverage.finding_fingerprints).length
    || reportedUnion.some((fingerprint) => !HEX64.test(fingerprint))
    || !stableEqual(reportedUnion, sortedUnique(reportedUnion))) {
    errors.push(`${path}.finding_fingerprints: required sorted unique lowercase SHA-256 array`);
  }
  const derivedUnion = sortedUnique([...executionFingerprints, ...comparatorFingerprints]);
  if (!stableEqual(reportedUnion, derivedUnion)) {
    errors.push(`${path}.finding_fingerprints: must equal the exact union of detector executions and action comparators`);
  }
  const linked = new Set<string>();
  for (const [index, rawDebt] of array(report.completion_debts).entries()) {
    const debt = object(rawDebt);
    if (!debt || debt.detector_finding_fingerprints === undefined) continue;
    const fingerprints = array(debt.detector_finding_fingerprints).filter((fingerprint): fingerprint is string => typeof fingerprint === "string");
    for (const fingerprint of fingerprints) {
      if (!derivedUnion.includes(fingerprint)) {
        errors.push(`$.report.completion_debts[${index}].detector_finding_fingerprints: fingerprint is absent from detector coverage`);
      }
      linked.add(fingerprint);
    }
  }
  for (const fingerprint of derivedUnion) {
    if (!linked.has(fingerprint)) errors.push(`${path}.finding_fingerprints: ${fingerprint} is not mapped to a completion debt`);
  }
}

export interface RegressionComparatorInputs {
  readonly modern: boolean;
  readonly requiresRepositoryObjects: boolean;
  readonly requiresRuntimeIdentity: boolean;
  readonly requiresDetectorCoverage: boolean;
  readonly coverageRuntimeIdentitySha256: unknown;
  readonly actionRequiredDetectorIds: readonly string[];
  readonly base: string;
  readonly files: FilePort;
  readonly allowPlaceholders: boolean;
  readonly clock: EvidenceClock | undefined;
  readonly errors: string[];
  readonly regressionRepoId: string;
  readonly typedComparatorObservationIds: Set<string>;
  readonly typedComparatorObservationByFamily: Map<string, string>;
  readonly actionObservationEvidenceRefs: Map<string, Map<string, JsonObject[]>>;
  readonly observationEvidenceRefs: Map<string, JsonObject[]>;
  readonly comparatorFindingFingerprints: Set<string>;
  readonly addObservationEvidenceRef: (observationId: string, rawRef: unknown) => void;
  readonly addExpectedRoot: (projection: CanonicalRootProjection) => void;
}

export interface RegressionComparatorState {
  readonly derivedIntroduced: Set<string>;
  readonly derivedPaid: Set<string>;
  readonly derivedOpen: Set<string>;
  readonly beforeObservationIds: Set<string>;
  readonly intermediateObservationIds: Set<string>;
  readonly afterObservationIds: Set<string>;
  readonly seenComparatorDetectorIds: Set<string>;
}

export async function validateRegressionComparatorEvidence(
  check: JsonObject,
  checkPath: string,
  input: RegressionComparatorInputs,
): Promise<RegressionComparatorState> {
  const {
    modern,
    requiresRepositoryObjects,
    requiresRuntimeIdentity,
    requiresDetectorCoverage,
    coverageRuntimeIdentitySha256,
    actionRequiredDetectorIds,
    base,
    files,
    allowPlaceholders,
    clock,
    errors,
    regressionRepoId,
    typedComparatorObservationIds,
    typedComparatorObservationByFamily,
    actionObservationEvidenceRefs,
    observationEvidenceRefs,
    comparatorFindingFingerprints,
    addObservationEvidenceRef,
    addExpectedRoot,
  } = input;
  const derivedIntroduced = new Set<string>();
  const derivedPaid = new Set<string>();
  const derivedOpen = new Set<string>();
  const beforeObservationIds = new Set<string>();
  const intermediateObservationIds = new Set<string>();
  const afterObservationIds = new Set<string>();
  const comparatorIds = new Set<string>();
  const seenComparatorDetectorIds = new Set<string>();
  for (const [comparatorIndex, rawComparator] of array(check.comparators).entries()) {
    const comparatorPath = `${checkPath}.comparators[${comparatorIndex}]`;
    const comparator = requireObject(rawComparator, [
      "id", "command", "scope", "detector", "observations",
      ...(requiresDetectorCoverage ? ["detector_id"] : []),
    ], comparatorPath, errors);
    if (!comparator) continue;
    for (const field of ["id", "command", "scope", "detector"] as const) {
      if (!text(comparator[field])) errors.push(`${comparatorPath}.${field}: required`);
    }
    const comparatorId = String(comparator.id ?? "");
    let registeredDetectorId: string | undefined;
    if (requiresDetectorCoverage) {
      const spec = detectorById(
        String(comparator.detector_id ?? ""),
        requiresRuntimeIdentity ? DETECTOR_COVERAGE_SCHEMA_VERSION : "1",
      );
      if (!spec) errors.push(`${comparatorPath}.detector_id: must name a canonical detector family`);
      else {
        registeredDetectorId = spec.id;
        if (!actionRequiredDetectorIds.includes(spec.id)) {
          errors.push(`${comparatorPath}.detector_id: ${spec.id} is not required by the bound run policy`);
        }
        if (seenComparatorDetectorIds.has(spec.id)) {
          errors.push(`${comparatorPath}.detector_id: duplicate detector family within action check`);
        }
        seenComparatorDetectorIds.add(spec.id);
        for (const [field, expected] of [["scope", spec.scope], ["command", spec.command], ["detector", spec.detector]] as const) {
          if (comparator[field] !== expected) errors.push(`${comparatorPath}.${field}: must match canonical ${spec.id} registry entry`);
        }
      }
    }
    if (comparatorIds.has(comparatorId)) errors.push(`${comparatorPath}.id: duplicate within action check`);
    else comparatorIds.add(comparatorId);
    const observations = array(comparator.observations);
    if (observations.length < 2) errors.push(`${comparatorPath}.observations: requires before and after observations`);
    const commandSha256 = sha256(new TextEncoder().encode(String(comparator.command ?? "")));
    const detectorSha256 = sha256(new TextEncoder().encode(String(comparator.detector ?? "")));
    const fingerprintsByObservation: Set<string>[] = [];
    let priorObservedAt = -Infinity;
    for (const [observationIndex, rawObservation] of observations.entries()) {
      const observationPath = `${comparatorPath}.observations[${observationIndex}]`;
      const observation = requireObject(rawObservation, [
        "phase", "object", "command_sha256",
        ...(requiresRuntimeIdentity
          ? ["detector_registry_sha256", "runtime_identity_sha256"]
          : ["detector_sha256"]),
        "result_sha256", "result_ref",
        ...(requiresRepositoryObjects ? ["action_id", "comparator_id", "repository_object"] : []),
        "finding_fingerprints", "exit_code", "observed_at",
      ], observationPath, errors);
      if (!observation) continue;
      const phase = observation.phase;
      const expectedPhase = observationIndex === 0 ? "before" : observationIndex === observations.length - 1 ? "after" : "intermediate";
      if (phase !== expectedPhase) errors.push(`${observationPath}.phase: expected ${expectedPhase}`);
      if (!text(observation.object)) errors.push(`${observationPath}.object: required`);
      if (requiresRepositoryObjects) {
        if (observation.action_id !== check.action_id) errors.push(`${observationPath}.action_id: must equal action-check action_id`);
        if (observation.comparator_id !== comparator.id) errors.push(`${observationPath}.comparator_id: must equal comparator id`);
        const observationRepositoryObject = validateRepositoryObject(
          observation.repository_object,
          `${observationPath}.repository_object`,
          errors,
          observation.object,
        );
        const boundaryRepositoryObject = observationIndex === 0
          ? check.before_repository_object
          : observationIndex === observations.length - 1 ? check.after_repository_object : undefined;
        if (boundaryRepositoryObject && observationRepositoryObject
          && !stableEqual(observationRepositoryObject, boundaryRepositoryObject)) {
          errors.push(`${observationPath}.repository_object: must equal the action boundary repository_object`);
        }
      }
      if (observationIndex === 0 && observation.object !== check.before_object) errors.push(`${observationPath}.object: must equal action-check before_object`);
      if (observationIndex === observations.length - 1 && observation.object !== check.after_object) errors.push(`${observationPath}.object: must equal action-check after_object`);
      const observationIdentityFields: readonly (readonly [string, unknown, string])[] = requiresRuntimeIdentity
        ? [
            ["detector_registry_sha256", detectorSha256, "detector registry label"],
            ["runtime_identity_sha256", coverageRuntimeIdentitySha256, "bound detector runtime identity"],
          ]
        : [["detector_sha256", detectorSha256, "detector registry label"]];
      for (const [field, expected, description] of [
        ["command_sha256", commandSha256, "comparator command"],
        ...observationIdentityFields,
      ] as const) {
        if (!(allowPlaceholders && text(observation[field]) && String(observation[field]).includes("<")) && observation[field] !== expected) {
          errors.push(`${observationPath}.${field}: must equal the SHA-256 of the ${description}`);
        }
      }
      if (!(allowPlaceholders && text(observation.result_sha256) && observation.result_sha256.includes("<"))
        && (typeof observation.result_sha256 !== "string" || !HEX64.test(observation.result_sha256))) {
        errors.push(`${observationPath}.result_sha256: required lowercase SHA-256 of exact comparator output`);
      }
      const comparatorResult = await loadBytesRef(
        files,
        base,
        observation.result_ref,
        `${observationPath}.result_ref`,
        errors,
        allowPlaceholders,
      );
      if (comparatorResult.digest
        && !(allowPlaceholders && text(observation.result_sha256) && observation.result_sha256.includes("<"))
        && observation.result_sha256 !== comparatorResult.digest) {
        errors.push(`${observationPath}.result_sha256: must equal the digest-bound result_ref bytes`);
      }
      if (!Number.isInteger(observation.exit_code)) errors.push(`${observationPath}.exit_code: required integer`);
      if (!iso(observation.observed_at)) errors.push(`${observationPath}.observed_at: required ISO-8601 timestamp`);
      else {
        const observedAt = Date.parse(String(observation.observed_at));
        if (observedAt < priorObservedAt) errors.push(`${observationPath}.observed_at: observations must be chronological`);
        priorObservedAt = observedAt;
      }
      if (!Array.isArray(observation.finding_fingerprints)) {
        errors.push(`${observationPath}.finding_fingerprints: required array`);
        fingerprintsByObservation.push(new Set());
        continue;
      }
      const rawFingerprints = array(observation.finding_fingerprints);
      const fingerprints = rawFingerprints.filter((item): item is string => typeof item === "string");
      if (fingerprints.length !== rawFingerprints.length
        || fingerprints.some((item) => !(allowPlaceholders && item.includes("<")) && !HEX64.test(item))) {
        errors.push(`${observationPath}.finding_fingerprints: entries must be lowercase SHA-256 values`);
      }
      if (new Set(fingerprints).size !== fingerprints.length) errors.push(`${observationPath}.finding_fingerprints: duplicates are forbidden`);
      if (!stableEqual(fingerprints, [...fingerprints].sort())) errors.push(`${observationPath}.finding_fingerprints: must be sorted`);
      if (modern && registeredDetectorId) {
        const sourceId = detectorById(
          registeredDetectorId,
          requiresRuntimeIdentity ? DETECTOR_COVERAGE_SCHEMA_VERSION : "1",
        )?.detector;
        const target = expectedPhase === "before"
          ? beforeObservationIds
          : expectedPhase === "after" ? afterObservationIds : intermediateObservationIds;
        if (sourceId) {
          for (const fingerprint of fingerprints) {
            if (!HEX64.test(fingerprint)) continue;
            const observationId = canonicalObservationId({
              source_id: sourceId,
              source_native_fingerprint: fingerprint,
            });
            target.add(observationId);
            typedComparatorObservationIds.add(observationId);
            typedComparatorObservationByFamily.set(`${registeredDetectorId}\0${fingerprint}`, observationId);
            addObservationEvidenceRef(observationId, observation.result_ref);
            if (expectedPhase !== "before") {
              const actionRefs = actionObservationEvidenceRefs.get(String(check.action_id)) ?? new Map<string, JsonObject[]>();
              const refs = actionRefs.get(observationId) ?? [];
              const ref = object(observation.result_ref);
              if (ref && typeof ref.path === "string" && typeof ref.sha256 === "string") {
                const normalizedRef = { path: ref.path, sha256: ref.sha256 };
                if (!refs.some((candidate) => stableEqual(candidate, normalizedRef))) refs.push(normalizedRef);
                actionRefs.set(observationId, refs);
                actionObservationEvidenceRefs.set(String(check.action_id), actionRefs);
              }
            }
          }
        }
      }
      if ((requiresRepositoryObjects || (requiresDetectorCoverage && registeredDetectorId)) && comparatorResult.bytes) {
        try {
          const registeredResult = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(comparatorResult.bytes));
          if (clock) validateEvidenceClock(registeredResult, `${observationPath}.result_ref`, clock, errors);
          const registeredRecord = object(registeredResult);
          if (requiresRepositoryObjects) {
            if (registeredRecord?.action_id !== check.action_id) errors.push(`${observationPath}.result_ref: action_id must equal action-check action_id`);
            if (registeredRecord?.comparator_id !== comparator.id) errors.push(`${observationPath}.result_ref: comparator_id must equal comparator id`);
            if (registeredRecord?.phase !== observation.phase) errors.push(`${observationPath}.result_ref: phase must equal comparator observation phase`);
            if (registeredRecord?.object !== observation.object) errors.push(`${observationPath}.result_ref: object must equal comparator observation object`);
            const resultRepositoryObject = validateRepositoryObject(
              registeredRecord?.repository_object,
              `${observationPath}.result_ref.repository_object`,
              errors,
              observation.object,
            );
            if (resultRepositoryObject && !stableEqual(resultRepositoryObject, observation.repository_object)) {
              errors.push(`${observationPath}.result_ref: repository_object must equal comparator observation repository_object`);
            }
          }
          if (registeredDetectorId) {
            const shapeErrors = detectorResultShapeErrors(registeredDetectorId, registeredResult);
            const derived = findingFingerprintsFromAudit(registeredDetectorId, registeredResult);
            if (!derived) {
              errors.push(`${observationPath}.result_ref: does not contain the registered detector's complete canonical result (${shapeErrors.join("; ")})`);
            } else if (!stableEqual(fingerprints, derived)) {
              errors.push(`${observationPath}.finding_fingerprints: must equal the exact result-derived fingerprint set`);
            }
            if (derived) {
              for (const projection of detectorRootProjections(
                registeredDetectorId,
                registeredResult,
                regressionRepoId,
              )) addExpectedRoot(projection);
            }
          }
          if (!registeredRecord || !Number.isInteger(registeredRecord.exitCode)) {
            errors.push(`${observationPath}.result_ref: registered detector result requires integer exitCode`);
          } else if (registeredRecord.exitCode !== observation.exit_code) {
            errors.push(`${observationPath}.exit_code: must equal the registered detector result exitCode`);
          }
        } catch (error) {
          errors.push(`${observationPath}.result_ref: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      for (const fingerprint of fingerprints) comparatorFindingFingerprints.add(fingerprint);
      fingerprintsByObservation.push(new Set(fingerprints));
    }
    if (fingerprintsByObservation.length === observations.length && observations.length >= 2) {
      const before = fingerprintsByObservation[0] ?? new Set<string>();
      const after = fingerprintsByObservation.at(-1) ?? new Set<string>();
      const introduced = new Set(fingerprintsByObservation.flatMap((set) => [...set]).filter((item) => !before.has(item)));
      for (const fingerprint of introduced) {
        const namespaced = `${comparatorId}\0${fingerprint}`;
        derivedIntroduced.add(namespaced);
        if (after.has(fingerprint)) derivedOpen.add(namespaced);
        else derivedPaid.add(namespaced);
      }
    }
  }
  return {
    derivedIntroduced,
    derivedPaid,
    derivedOpen,
    beforeObservationIds,
    intermediateObservationIds,
    afterObservationIds,
    seenComparatorDetectorIds,
  };
}
