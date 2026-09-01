/** Action-chain and root-debt regression accounting for closure bundles. */
import { REGRESSION_COUNT_FIELDS, REGRESSION_POLICY } from "./records.js";
import {
  DETECTOR_COVERAGE_SCHEMA_VERSION,
  detectorById,
  requiredDetectorIdsForPolicy,
  sortedUnique,
  type DetectorRuntimeIdentity,
} from "./detector-coverage.js";
import {
  canonicalObservationId,
  deriveActionObservationSets,
  schema15LegacyNumericFieldErrors,
  validateRegressionAccounting,
  type ActionObservationSets,
} from "./regression-accounting.js";
import {
  HEX64,
  array,
  compareCodePoints,
  evidenceRef,
  iso,
  loadBytesRef,
  loadRef,
  object,
  requireObject,
  stableEqual,
  text,
  validateRepositoryObject,
  type EvidenceClock,
  type FilePort,
  type JsonObject,
} from "./bundle-runtime.js";
import {
  detectorRootProjections,
  validateBaselineReplayOrigin,
  validateDetectorCoverage,
  validateExternalChangeOrigin,
  validateRegressionComparatorEvidence,
  type ActionRepositoryBoundary,
  type CanonicalRootProjection,
} from "./bundle-detector-evidence.js";
import {
  ACTION_HYGIENE_CONTRACT,
  nativeGateRootProjections,
  validateNativeGateCatalogTransition,
  validateNativeGateControlRecord,
  type NativeGateControlEvidence,
} from "./bundle-action-evidence.js";

export interface RegressionValidationContext {
  readonly bundle: JsonObject;
  readonly report: JsonObject;
  readonly manifest: JsonObject;
  readonly base: string;
  readonly files: FilePort;
  readonly clean: boolean;
  readonly allowPlaceholders: boolean;
  readonly clock: EvidenceClock | undefined;
  readonly liveRuntimeIdentity: DetectorRuntimeIdentity | undefined;
  readonly errors: string[];
  readonly path: string;
  readonly control: JsonObject;
  readonly record: JsonObject;
  readonly recordPath: string;
  readonly modern: boolean;
  readonly requiresRepositoryObjects: boolean;
  readonly requiresRuntimeIdentity: boolean;
  readonly baselineRepositoryObject: JsonObject | undefined;
  readonly closingRepositoryObject: JsonObject | undefined;
}

export interface RegressionValidationState {
  readonly checks: readonly unknown[];
  readonly comparatorFindingFingerprints: Set<string>;
  readonly typedComparatorObservationIds: Set<string>;
  readonly typedComparatorObservationByFamily: Map<string, string>;
  readonly actionObservationEvidenceRefs: Map<string, Map<string, JsonObject[]>>;
  readonly actionRepositoryBoundaries: Map<string, ActionRepositoryBoundary>;
  readonly observationEvidenceRefs: Map<string, JsonObject[]>;
  readonly expectedRootProjections: Map<string, CanonicalRootProjection>;
  readonly expectedRootByObservation: Map<string, string>;
  readonly nativeObservationIds: Set<string>;
  readonly baselineNativeObservationIds: Set<string>;
  readonly derivedActionObservations: ActionObservationSets[];
  readonly regressionRepoId: string;
  readonly addObservationEvidenceRef: (observationId: string, rawRef: unknown) => void;
  readonly addExpectedRoot: (projection: CanonicalRootProjection) => void;
  readonly hasChangedRepositoryBoundary: boolean;
  readonly requiresDetectorCoverage: boolean;
  readonly coverageRuntimeIdentitySha256: unknown;
  readonly actionRequiredDetectorIds: readonly string[];
  readonly priorNativeEvidence: NativeGateControlEvidence | undefined;
}

export async function loadRegressionValidationContext(
  bundle: JsonObject,
  report: JsonObject,
  manifest: JsonObject,
  base: string,
  files: FilePort,
  clean: boolean,
  allowPlaceholders: boolean,
  clock: EvidenceClock | undefined,
  liveRuntimeIdentity: DetectorRuntimeIdentity | undefined,
  errors: string[],
): Promise<RegressionValidationContext | undefined> {

  const path = "$.report.regression_control";
  const rawControl = object(report.regression_control);
  const modernControl = rawControl?.accounting_schema === "1.5";
  const control = requireObject(report.regression_control, modernControl
    ? [
        "policy", "baseline_object", "baseline_repository_object", "closing_object",
        "closing_repository_object", "accounting_schema", "evidence_ref",
      ]
    : ["policy", "baseline_object", "closing_object", ...REGRESSION_COUNT_FIELDS, "evidence_ref"], path, errors);
  if (!control) return;
  const record = await evidenceRef(
    files,
    base,
    control.evidence_ref,
    `${path}.evidence_ref`,
    errors,
    allowPlaceholders,
    clock,
    "mister-clean.regression-delta",
  );
  if (!record) return;
  const recordPath = `${path}.evidence_ref`;
  const schemaVersion = String(record.schema_version ?? "");
  const modern = schemaVersion === "1.5";
  requireObject(record, modern
    ? [
        "record_type", "schema_version", "policy", "baseline_object", "closing_object",
        "baseline_repository_object", "closing_repository_object", "accounting", "action_checks", "detector_coverage",
      ]
    : [
        "record_type", "schema_version", "policy", "baseline_object", "closing_object",
        ...REGRESSION_COUNT_FIELDS.filter((field) => field !== "action_checks"), "action_checks",
      ], recordPath, errors);
  if (!new Set(["1.2", "1.3", "1.4", "1.5"]).has(String(record.schema_version ?? ""))) {
    errors.push(`${recordPath}.schema_version: expected 1.2, 1.3, 1.4, or 1.5`);
  }
  const requiresRepositoryObjects = schemaVersion === "1.4" || schemaVersion === "1.5";
  const requiresRuntimeIdentity = schemaVersion === "1.5";
  if (clean && !requiresRuntimeIdentity) {
    errors.push(`${recordPath}.schema_version: CLEAN requires 1.5 runtime and repository-object binding`);
  }
  if (record.policy !== REGRESSION_POLICY) {
    errors.push(`${recordPath}.policy: expected ${REGRESSION_POLICY}`);
  }
  for (const field of ["policy", "baseline_object", "closing_object"] as const) {
    if (control[field] !== record[field]) errors.push(`${recordPath}: bound regression record disagrees on ${field}`);
  }
  if (modern) {
    if (control.accounting_schema !== "1.5") errors.push(`${path}.accounting_schema: must equal 1.5 for regression schema 1.5`);
    errors.push(...schema15LegacyNumericFieldErrors(record, recordPath));
    errors.push(...schema15LegacyNumericFieldErrors({ ...control, schema_version: "1.5" }, path));
  } else {
    for (const field of REGRESSION_COUNT_FIELDS) {
      const recordValue = field === "action_checks" ? array(record.action_checks).length : record[field];
      if (control[field] !== recordValue) errors.push(`${recordPath}: bound regression record disagrees on ${field}`);
    }
  }

  let baselineRepositoryObject: JsonObject | undefined;
  let closingRepositoryObject: JsonObject | undefined;
  if (requiresRepositoryObjects) {
    baselineRepositoryObject = validateRepositoryObject(
      record.baseline_repository_object,
      `${recordPath}.baseline_repository_object`,
      errors,
      record.baseline_object,
    );
    closingRepositoryObject = validateRepositoryObject(
      record.closing_repository_object,
      `${recordPath}.closing_repository_object`,
      errors,
      record.closing_object,
    );
    if (!stableEqual(control.baseline_repository_object, record.baseline_repository_object)) {
      errors.push(`${recordPath}: bound regression record disagrees on baseline_repository_object`);
    }
    if (!stableEqual(control.closing_repository_object, record.closing_repository_object)) {
      errors.push(`${recordPath}: bound regression record disagrees on closing_repository_object`);
    }
  }

  const snapshots = object(object(bundle.successor_readiness)?.snapshots);
  const startSnapshot = object(snapshots?.start);
  const endSnapshot = object(snapshots?.end);
  const startObject = startSnapshot?.object;
  const endObject = endSnapshot?.object;
  const closingCommit = object(report.repo)?.commit;
  if (record.baseline_object !== startObject) errors.push(`${recordPath}.baseline_object: must equal successor start snapshot`);
  if (record.closing_object !== endObject) {
    errors.push(`${recordPath}.closing_object: must equal successor end snapshot`);
  }
  if (requiresRepositoryObjects) {
    if (baselineRepositoryObject && !stableEqual(baselineRepositoryObject, startSnapshot?.repository_object)) {
      errors.push(`${recordPath}.baseline_repository_object: must equal successor start snapshot repository_object`);
    }
    if (closingRepositoryObject && !stableEqual(closingRepositoryObject, endSnapshot?.repository_object)) {
      errors.push(`${recordPath}.closing_repository_object: must equal successor end snapshot repository_object`);
    }
    if (closingRepositoryObject?.head_commit !== closingCommit) {
      errors.push(`${recordPath}.closing_repository_object.head_commit: must equal report repo.commit`);
    }
    const startCommit = object(bundle.change_inventory)?.start_commit;
    if (baselineRepositoryObject?.head_commit !== startCommit) {
      errors.push(`${recordPath}.baseline_repository_object.head_commit: must equal change_inventory.start_commit`);
    }
  } else if (record.closing_object !== closingCommit) {
    errors.push(`${recordPath}.closing_object: legacy record must equal report repo.commit`);
  }

  if (!modern) {
    for (const field of REGRESSION_COUNT_FIELDS.filter((name) => name !== "action_checks")) {
      if (!Number.isInteger(record[field]) || Number(record[field]) < 0) {
        errors.push(`${recordPath}.${field}: required nonnegative integer`);
      }
    }
    const countsValid = REGRESSION_COUNT_FIELDS
      .filter((field) => field !== "action_checks")
      .every((field) => Number.isInteger(record[field]) && Number(record[field]) >= 0);
    if (countsValid) {
      const baselineExpected = Number(record.baseline_paid) + Number(record.baseline_open);
      if (record.baseline_findings !== baselineExpected) {
        errors.push(`${recordPath}.baseline_findings: must equal baseline_paid + baseline_open (${baselineExpected})`);
      }
      const closingExpected = Number(record.baseline_open)
        + Number(record.newly_discovered_preexisting_open)
        + Number(record.concurrent_external_open)
        + Number(record.introduced_by_run_open);
      if (record.closing_findings !== closingExpected) {
        errors.push(`${recordPath}.closing_findings: must equal all open origin buckets (${closingExpected})`);
      }
    }
  }


  return {
    bundle,
    report,
    manifest,
    base,
    files,
    clean,
    allowPlaceholders,
    clock,
    liveRuntimeIdentity,
    errors,
    path,
    control,
    record,
    recordPath,
    modern,
    requiresRepositoryObjects,
    requiresRuntimeIdentity,
    baselineRepositoryObject,
    closingRepositoryObject,
  };
}

async function validateActionNativeBoundary(input: {
  readonly modern: boolean;
  readonly check: JsonObject;
  readonly checkPath: string;
  readonly beforeRepositoryObject: JsonObject | undefined;
  readonly afterRepositoryObject: JsonObject | undefined;
  readonly priorNativeEvidence: NativeGateControlEvidence | undefined;
  readonly base: string;
  readonly files: FilePort;
  readonly allowPlaceholders: boolean;
  readonly clock: EvidenceClock | undefined;
  readonly errors: string[];
  readonly regressionRepoId: string;
  readonly beforeObservationIds: Set<string>;
  readonly afterObservationIds: Set<string>;
  readonly nativeObservationIds: Set<string>;
  readonly actionObservationEvidenceRefs: Map<string, Map<string, JsonObject[]>>;
  readonly addObservationEvidenceRef: (observationId: string, rawRef: unknown) => void;
  readonly addExpectedRoot: (projection: CanonicalRootProjection) => void;
}): Promise<NativeGateControlEvidence | undefined> {
  let { priorNativeEvidence } = input;
  const {
    modern, check, checkPath, beforeRepositoryObject, afterRepositoryObject,
    base, files, allowPlaceholders, clock, errors, regressionRepoId,
    beforeObservationIds, afterObservationIds, nativeObservationIds,
    actionObservationEvidenceRefs, addObservationEvidenceRef, addExpectedRoot,
  } = input;
    if (modern) {
      const changedRepositoryObject = !!beforeRepositoryObject && !!afterRepositoryObject
        && !stableEqual(beforeRepositoryObject, afterRepositoryObject);
      let afterNativeEvidence: NativeGateControlEvidence | undefined;
      if (changedRepositoryObject) {
        afterNativeEvidence = await validateNativeGateControlRecord(
          check.native_gate_control,
          `${checkPath}.native_gate_control`,
          afterRepositoryObject,
          base,
          files,
          false,
          true,
          allowPlaceholders,
          clock,
          errors,
        );
      } else if (check.native_gate_control !== undefined) {
        afterNativeEvidence = await validateNativeGateControlRecord(
          check.native_gate_control,
          `${checkPath}.native_gate_control`,
          afterRepositoryObject,
          base,
          files,
          false,
          false,
          allowPlaceholders,
          clock,
          errors,
        );
      }
      if (priorNativeEvidence && afterNativeEvidence) {
        validateNativeGateCatalogTransition(
          priorNativeEvidence,
          afterNativeEvidence,
          `${checkPath}.native_gate_control`,
          errors,
        );
      }
      const beforeNativeProjection = priorNativeEvidence
        ? nativeGateRootProjections(priorNativeEvidence, regressionRepoId)
        : undefined;
      const effectiveAfterNativeEvidence = afterNativeEvidence ?? priorNativeEvidence;
      const afterNativeProjection = effectiveAfterNativeEvidence
        ? nativeGateRootProjections(effectiveAfterNativeEvidence, regressionRepoId)
        : undefined;
      for (const id of beforeNativeProjection?.observation_ids ?? []) {
        beforeObservationIds.add(id);
        nativeObservationIds.add(id);
      }
      for (const root of beforeNativeProjection?.roots ?? []) addExpectedRoot(root);
      for (const id of afterNativeProjection?.observation_ids ?? []) {
        afterObservationIds.add(id);
        nativeObservationIds.add(id);
        if (effectiveAfterNativeEvidence) addObservationEvidenceRef(id, effectiveAfterNativeEvidence.coverage_ref);
      }
      for (const root of afterNativeProjection?.roots ?? []) addExpectedRoot(root);
      if (afterNativeEvidence) {
        if (changedRepositoryObject) {
          const actionRefs = actionObservationEvidenceRefs.get(String(check.action_id)) ?? new Map<string, JsonObject[]>();
          for (const id of afterNativeProjection?.observation_ids ?? []) {
            const refs = actionRefs.get(id) ?? [];
            if (!refs.some((candidate) => stableEqual(candidate, afterNativeEvidence.coverage_ref))) {
              refs.push(afterNativeEvidence.coverage_ref);
            }
            actionRefs.set(id, refs);
          }
          actionObservationEvidenceRefs.set(String(check.action_id), actionRefs);
        }
        if (!priorNativeEvidence) {
          for (const id of afterNativeProjection?.observation_ids ?? []) beforeObservationIds.add(id);
        }
        priorNativeEvidence = afterNativeEvidence;
      }
    }
  return priorNativeEvidence;
}

function validateActionObservationAccounting(input: {
  readonly modern: boolean;
  readonly check: JsonObject;
  readonly checkPath: string;
  readonly beforeObservationIds: Set<string>;
  readonly intermediateObservationIds: Set<string>;
  readonly afterObservationIds: Set<string>;
  readonly derivedIntroduced: Set<string>;
  readonly derivedPaid: Set<string>;
  readonly derivedOpen: Set<string>;
  readonly derivedActionObservations: ActionObservationSets[];
  readonly errors: string[];
}): { readonly modernAction: ActionObservationSets | undefined; readonly introducedPaid: number; readonly introducedOpen: number } {
  const {
    modern, check, checkPath, beforeObservationIds, intermediateObservationIds,
    afterObservationIds, derivedIntroduced, derivedPaid, derivedOpen,
    derivedActionObservations, errors,
  } = input;
  let introducedPaidDelta = 0;
  let introducedOpenDelta = 0;
    let modernAction: ActionObservationSets | undefined;
    if (modern && text(check.action_id)) {
      try {
        modernAction = deriveActionObservationSets(check.action_id, [
          { phase: "before", observation_ids: [...beforeObservationIds] },
          ...(intermediateObservationIds.size > 0
            ? [{ phase: "intermediate" as const, observation_ids: [...intermediateObservationIds] }]
            : []),
          { phase: "after", observation_ids: [...afterObservationIds] },
        ]);
        derivedActionObservations.push(modernAction);
        for (const field of [
          "before_observation_ids", "observed_observation_ids", "closing_observation_ids",
          "appeared_observation_ids", "resolved_before_boundary_observation_ids",
          "open_at_boundary_observation_ids",
        ] as const) {
          if (!stableEqual(check[field], modernAction[field])) {
            errors.push(`${checkPath}.${field}: must equal the comparator-evidence-derived observation set`);
          }
        }
      } catch (error) {
        errors.push(`${checkPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (!modern) {
      if (Number.isInteger(check.introduced) && check.introduced !== derivedIntroduced.size) {
        errors.push(`${checkPath}.introduced: must equal fingerprint-derived total (${derivedIntroduced.size})`);
      }
      if (Number.isInteger(check.paid_before_boundary) && check.paid_before_boundary !== derivedPaid.size) {
        errors.push(`${checkPath}.paid_before_boundary: must equal fingerprint-derived total (${derivedPaid.size})`);
      }
      if (Number.isInteger(check.open_at_boundary) && check.open_at_boundary !== derivedOpen.size) {
        errors.push(`${checkPath}.open_at_boundary: must equal fingerprint-derived total (${derivedOpen.size})`);
      }
      introducedPaidDelta += derivedPaid.size;
      introducedOpenDelta += derivedOpen.size;
    }
  return { modernAction, introducedPaid: introducedPaidDelta, introducedOpen: introducedOpenDelta };
}

function validateActionBoundaryStatus(input: {
  readonly check: JsonObject;
  readonly checkPath: string;
  readonly manifestActions: readonly JsonObject[];
  readonly modern: boolean;
  readonly modernAction: ActionObservationSets | undefined;
  readonly index: number;
  readonly interruptedAt: number[];
  readonly clean: boolean;
  readonly errors: string[];
}): void {
  const { check, checkPath, manifestActions, modern, modernAction, index, interruptedAt, clean, errors } = input;
    const action = manifestActions.find((candidate) => candidate.id === check.action_id);
    if (check.boundary_status === "closed") {
      const openCount = modern ? modernAction?.open_at_boundary_observation_ids.length : check.open_at_boundary;
      if (openCount !== 0) errors.push(`${checkPath}: closed boundary requires zero open observations`);
      if (action?.status !== "executed") errors.push(`${checkPath}: closed boundary requires an executed action status`);
    } else if (check.boundary_status === "interrupted") {
      interruptedAt.push(index);
      const openCount = modern ? modernAction?.open_at_boundary_observation_ids.length : check.open_at_boundary;
      if (openCount === 0) errors.push(`${checkPath}: interrupted boundary requires open observations`);
      if (clean) errors.push(`${checkPath}: CLEAN forbids an interrupted action boundary`);
      if (action?.status !== "failed") errors.push(`${checkPath}: interrupted boundary requires a failed action status`);
    } else errors.push(`${checkPath}.boundary_status: expected closed or interrupted`);
}

export async function validateRegressionActionChain(
  context: RegressionValidationContext,
): Promise<RegressionValidationState> {
  const {
    bundle,
    report,
    manifest,
    base,
    files,
    clean,
    allowPlaceholders,
    clock,
    errors,
    path,
    record,
    recordPath,
    modern,
    requiresRepositoryObjects,
    requiresRuntimeIdentity,
    baselineRepositoryObject,
    closingRepositoryObject,
  } = context;
  if (!Array.isArray(record.action_checks)) errors.push(`${recordPath}.action_checks: required array`);
  const checks = array(record.action_checks);
  const manifestActions = array(manifest.actions).map(object).filter((item): item is JsonObject => !!item);
  const expectedActionIds = manifestActions
    .filter((action) => manifest.execution_state === "executed" || action.status === "executed" || action.status === "failed")
    .map((action) => action.id);
  const checkedActionIds: unknown[] = [];
  let introducedPaid = 0;
  let introducedOpen = 0;
  const derivedActionObservations: ActionObservationSets[] = [];
  const interruptedAt: number[] = [];
  const comparatorFindingFingerprints = new Set<string>();
  const typedComparatorObservationIds = new Set<string>();
  const typedComparatorObservationByFamily = new Map<string, string>();
  const actionObservationEvidenceRefs = new Map<string, Map<string, JsonObject[]>>();
  const actionRepositoryBoundaries = new Map<string, ActionRepositoryBoundary>();
  const observationEvidenceRefs = new Map<string, JsonObject[]>();
  const addObservationEvidenceRef = (observationId: string, rawRef: unknown): void => {
    const evidenceRef = object(rawRef);
    if (!evidenceRef || typeof evidenceRef.path !== "string" || typeof evidenceRef.sha256 !== "string") return;
    const normalizedRef = { path: evidenceRef.path, sha256: evidenceRef.sha256 };
    const refs = observationEvidenceRefs.get(observationId) ?? [];
    if (!refs.some((candidate) => stableEqual(candidate, normalizedRef))) refs.push(normalizedRef);
    observationEvidenceRefs.set(observationId, refs);
  };
  const expectedRootProjections = new Map<string, CanonicalRootProjection>();
  const expectedRootByObservation = new Map<string, string>();
  const nativeObservationIds = new Set<string>();
  const baselineNativeObservationIds = new Set<string>();
  const addExpectedRoot = (projection: CanonicalRootProjection): void => {
    if (projection.observation_ids.length === 0) {
      errors.push(`${recordPath}.root_projection: evidence-derived root ${projection.debt_key} owns no observations`);
      return;
    }
    for (const observationId of projection.observation_ids) {
      const priorKey = expectedRootByObservation.get(observationId);
      if (priorKey && priorKey !== projection.debt_key) {
        errors.push(`${recordPath}.root_projection: observation ${observationId} maps to multiple evidence-derived root debt keys ${priorKey}, ${projection.debt_key}`);
      } else expectedRootByObservation.set(observationId, projection.debt_key);
    }
    const prior = expectedRootProjections.get(projection.debt_key);
    if (!prior) {
      expectedRootProjections.set(projection.debt_key, projection);
      return;
    }
    if (!stableEqual(prior.normalizer, projection.normalizer)
      || !stableEqual(prior.cause_key, projection.cause_key)) {
      errors.push(`${recordPath}.root_projection: canonical debt key collision`);
      return;
    }
    expectedRootProjections.set(projection.debt_key, {
      ...prior,
      observation_ids: sortedUnique([...prior.observation_ids, ...projection.observation_ids]),
    });
  };
  const regressionRepoId = String(object(report.repo)?.id ?? "");
  const hasChangedRepositoryBoundary = modern && checks.some((rawCheck) => {
    const check = object(rawCheck);
    return !!check && !stableEqual(check.before_repository_object, check.after_repository_object);
  });
  let priorNativeEvidence: NativeGateControlEvidence | undefined;
  if (modern && hasChangedRepositoryBoundary) {
    priorNativeEvidence = await validateNativeGateControlRecord(
      record.baseline_native_gate_control,
      `${recordPath}.baseline_native_gate_control`,
      baselineRepositoryObject,
      base,
      files,
      false,
      true,
      allowPlaceholders,
      clock,
      errors,
    );
    if (priorNativeEvidence) {
      const projection = nativeGateRootProjections(priorNativeEvidence, regressionRepoId);
      for (const id of projection.observation_ids) {
        baselineNativeObservationIds.add(id);
        nativeObservationIds.add(id);
        addObservationEvidenceRef(id, priorNativeEvidence.coverage_ref);
      }
      for (const root of projection.roots) addExpectedRoot(root);
    }
  }
  const requiresDetectorCoverage = record.schema_version === "1.3"
    || record.schema_version === "1.4"
    || record.schema_version === "1.5";
  const coverageRuntimeIdentitySha256 = requiresRuntimeIdentity
    ? object(record.detector_coverage)?.runtime_identity_sha256
    : undefined;
  const actionRequiredDetectorIds = requiresDetectorCoverage
    ? requiredDetectorIdsForPolicy(
        object(record.detector_coverage)?.run_policy,
        requiresRuntimeIdentity ? DETECTOR_COVERAGE_SCHEMA_VERSION : "1",
      ) ?? []
    : [];
  let expectedBeforeObject = record.baseline_object;
  let expectedBeforeRepositoryObject = baselineRepositoryObject;
  for (const [index, raw] of checks.entries()) {
    const checkPath = `${recordPath}.action_checks[${index}]`;
    const check = requireObject(raw, [
      "action_id", "before_object", "after_object", "comparators",
      ...(requiresRepositoryObjects ? ["before_repository_object", "after_repository_object"] : []),
      ...(modern
        ? [
            "before_observation_ids", "observed_observation_ids", "closing_observation_ids",
            "appeared_observation_ids", "resolved_before_boundary_observation_ids",
            "open_at_boundary_observation_ids",
          ]
        : ["introduced", "paid_before_boundary", "open_at_boundary"]),
      "boundary_status", "observed_at",
    ], checkPath, errors);
    if (!check) continue;
    checkedActionIds.push(check.action_id);
    const manifestAction = manifestActions.find((candidate) => candidate.id === check.action_id);
    if (manifestAction?.hygiene_contract === ACTION_HYGIENE_CONTRACT
      && !stableEqual(check.action_hygiene, manifestAction.action_hygiene)) {
      errors.push(`${checkPath}.action_hygiene: must equal the canonical terminal action hygiene summary`);
    }
    for (const field of ["action_id", "before_object", "after_object"] as const) {
      if (!text(check[field])) errors.push(`${checkPath}.${field}: required`);
    }
    let beforeRepositoryObject: JsonObject | undefined;
    let afterRepositoryObject: JsonObject | undefined;
    if (requiresRepositoryObjects) {
      if (check.before_object !== expectedBeforeObject) {
        errors.push(`${checkPath}.before_object: must continue the repository-object chain from regression baseline_object or the prior action after_object`);
      }
      beforeRepositoryObject = validateRepositoryObject(
        check.before_repository_object,
        `${checkPath}.before_repository_object`,
        errors,
        check.before_object,
      );
      afterRepositoryObject = validateRepositoryObject(
        check.after_repository_object,
        `${checkPath}.after_repository_object`,
        errors,
        check.after_object,
      );
      if (beforeRepositoryObject && expectedBeforeRepositoryObject
        && !stableEqual(beforeRepositoryObject, expectedBeforeRepositoryObject)) {
        errors.push(`${checkPath}.before_repository_object: must continue the full repository-object chain`);
      }
      if (text(check.action_id) && beforeRepositoryObject && afterRepositoryObject) {
        actionRepositoryBoundaries.set(check.action_id, {
          before: beforeRepositoryObject,
          after: afterRepositoryObject,
        });
      }
      expectedBeforeObject = check.after_object;
      expectedBeforeRepositoryObject = afterRepositoryObject;
    }
    if (!iso(check.observed_at)) errors.push(`${checkPath}.observed_at: required ISO-8601 timestamp`);
    if (!modern) {
      for (const field of ["introduced", "paid_before_boundary", "open_at_boundary"] as const) {
        if (!Number.isInteger(check[field]) || Number(check[field]) < 0) errors.push(`${checkPath}.${field}: required nonnegative integer`);
      }
      if (Number.isInteger(check.introduced) && Number.isInteger(check.paid_before_boundary) && Number.isInteger(check.open_at_boundary)) {
        const accounted = Number(check.paid_before_boundary) + Number(check.open_at_boundary);
        if (check.introduced !== accounted) errors.push(`${checkPath}.introduced: must equal paid_before_boundary + open_at_boundary (${accounted})`);
      }
    }
    if (!Array.isArray(check.comparators) || array(check.comparators).length === 0) {
      errors.push(`${checkPath}.comparators: required nonempty array`);
    }
    const comparatorState = await validateRegressionComparatorEvidence(check, checkPath, {
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
    });
    const {
      derivedIntroduced,
      derivedPaid,
      derivedOpen,
      beforeObservationIds,
      intermediateObservationIds,
      afterObservationIds,
      seenComparatorDetectorIds,
    } = comparatorState;
    if (requiresDetectorCoverage) {
      for (const detectorId of actionRequiredDetectorIds) {
        if (!seenComparatorDetectorIds.has(detectorId)) {
          errors.push(`${checkPath}.comparators: every mutating action requires ${detectorId}`);
        }
      }
    }
    priorNativeEvidence = await validateActionNativeBoundary({
      modern, check, checkPath, beforeRepositoryObject, afterRepositoryObject, priorNativeEvidence,
      base, files, allowPlaceholders, clock, errors, regressionRepoId,
      beforeObservationIds, afterObservationIds, nativeObservationIds,
      actionObservationEvidenceRefs, addObservationEvidenceRef, addExpectedRoot,
    });
    const accounting = validateActionObservationAccounting({
      modern, check, checkPath, beforeObservationIds, intermediateObservationIds, afterObservationIds,
      derivedIntroduced, derivedPaid, derivedOpen, derivedActionObservations, errors,
    });
    introducedPaid += accounting.introducedPaid;
    introducedOpen += accounting.introducedOpen;
    validateActionBoundaryStatus({
      check, checkPath, manifestActions, modern, modernAction: accounting.modernAction,
      index, interruptedAt, clean, errors,
    });
  }
  if (requiresRepositoryObjects && expectedBeforeObject !== record.closing_object) {
    errors.push(`${recordPath}.action_checks: repository-object chain must terminate at regression closing_object`);
  }
  if (requiresRepositoryObjects && expectedBeforeRepositoryObject && closingRepositoryObject
    && !stableEqual(expectedBeforeRepositoryObject, closingRepositoryObject)) {
    errors.push(`${recordPath}.action_checks: full repository-object chain must terminate at regression closing_repository_object`);
  }
  if (!stableEqual(checkedActionIds, expectedActionIds)) {
    errors.push(`${recordPath}.action_checks: ordered action ids must exactly cover every executed or failed action`);
  }
  if (interruptedAt.some((index) => index !== checks.length - 1) || interruptedAt.length > 1) {
    errors.push(`${recordPath}.action_checks: exactly one interrupted boundary may appear, and only as the final observed action`);
  }
  if (!modern) {
    if (introducedPaid !== record.introduced_by_run_paid) {
      errors.push(`${recordPath}.introduced_by_run_paid: must equal action-check total (${introducedPaid})`);
    }
    if (introducedOpen !== record.introduced_by_run_open) {
      errors.push(`${recordPath}.introduced_by_run_open: must equal action-check total (${introducedOpen})`);
    }
    if (clean && record.introduced_by_run_open !== 0) {
      errors.push(`${recordPath}.introduced_by_run_open: CLEAN requires zero`);
    }
  }

  return {
    checks,
    comparatorFindingFingerprints,
    typedComparatorObservationIds,
    typedComparatorObservationByFamily,
    actionObservationEvidenceRefs,
    actionRepositoryBoundaries,
    observationEvidenceRefs,
    expectedRootProjections,
    expectedRootByObservation,
    nativeObservationIds,
    baselineNativeObservationIds,
    derivedActionObservations,
    regressionRepoId,
    addObservationEvidenceRef,
    addExpectedRoot,
    hasChangedRepositoryBoundary,
    requiresDetectorCoverage,
    coverageRuntimeIdentitySha256,
    actionRequiredDetectorIds,
    priorNativeEvidence,
  };
}

export async function validateModernRegressionClosure(
  context: RegressionValidationContext,
  state: RegressionValidationState,
): Promise<void> {
  const {
    bundle,
    report,
    manifest,
    base,
    files,
    clean,
    allowPlaceholders,
    clock,
    errors,
    record,
    recordPath,
    modern,
    requiresRepositoryObjects,
    requiresRuntimeIdentity,
    baselineRepositoryObject,
    closingRepositoryObject,
    liveRuntimeIdentity,
  } = context;
  const {
    checks,
    comparatorFindingFingerprints,
    typedComparatorObservationIds,
    typedComparatorObservationByFamily,
    actionObservationEvidenceRefs,
    actionRepositoryBoundaries,
    observationEvidenceRefs,
    expectedRootProjections,
    expectedRootByObservation,
    nativeObservationIds,
    baselineNativeObservationIds,
    derivedActionObservations,
    regressionRepoId,
    addObservationEvidenceRef,
    addExpectedRoot,
    hasChangedRepositoryBoundary,
    coverageRuntimeIdentitySha256,
    priorNativeEvidence,
  } = state;
  const rootDebts: JsonObject[] = [];
  const baselineObservationIds = new Set<string>(baselineNativeObservationIds);
  const detectorObservationIds = new Set<string>(typedComparatorObservationIds);
  const detectorObservationByFamily = new Map(typedComparatorObservationByFamily);
  const reportedRootDebts: Array<{ debt: JsonObject; path: string }> = [];
  for (const [index, rawDebt] of array(report.completion_debts).entries()) {
    const debtPath = `$.report.completion_debts[${index}]`;
    const debt = requireObject(rawDebt, [
      "debt_key", "normalizer", "cause_key", "state", "disposition", "origin", "observation_ids",
    ], debtPath, errors);
    if (!debt) continue;
    rootDebts.push({
      debt_key: debt.debt_key,
      normalizer: debt.normalizer,
      cause_key: debt.cause_key,
      state: debt.state,
      disposition: debt.disposition,
      origin: debt.origin,
      observation_ids: debt.observation_ids,
    });
    reportedRootDebts.push({ debt, path: debtPath });
    const observationIds = array(debt.observation_ids).filter((id): id is string => typeof id === "string");
    if (!Array.isArray(debt.observation_ids)
      || observationIds.length !== array(debt.observation_ids).length
      || observationIds.some((id) => !HEX64.test(id))
      || !stableEqual(observationIds, sortedUnique(observationIds))) {
      errors.push(`${debtPath}.observation_ids: required sorted unique lowercase SHA-256 array`);
    }
    const origin = object(debt.origin);
    if (clean && origin?.class === "unestablished") {
      errors.push(`${debtPath}.origin.class: CLEAN requires established causal attribution`);
    }
    if (debt.state === "accepted_exception" && origin?.class === "introduced_by_run") {
      errors.push(`${debtPath}.origin.class: cleanup-introduced debt must be repaired or rolled back, never accepted as an exception`);
    }
  }

  const coverage = object(record.detector_coverage);
  for (const rawExecution of array(coverage?.executions)) {
    const execution = object(rawExecution);
    const sourceId = detectorById(String(execution?.detector_id ?? ""))?.detector;
    if (!sourceId || execution?.phase !== "baseline") continue;
    for (const rawFingerprint of array(execution.finding_fingerprints)) {
      if (typeof rawFingerprint !== "string" || !HEX64.test(rawFingerprint)) continue;
      const id = canonicalObservationId({
        source_id: sourceId,
        source_native_fingerprint: rawFingerprint,
      });
      detectorObservationIds.add(id);
      detectorObservationByFamily.set(`${String(execution?.detector_id)}\0${rawFingerprint}`, id);
      baselineObservationIds.add(id);
      addObservationEvidenceRef(id, execution.result_ref);
    }
    const loaded = await loadRef(
      files,
      base,
      execution.result_ref,
      `${recordPath}.detector_coverage.executions[${JSON.stringify(execution.detector_id)}].result_ref`,
      errors,
      allowPlaceholders,
    );
    if (loaded.data) {
      for (const projection of detectorRootProjections(
        String(execution.detector_id),
        loaded.data,
        regressionRepoId,
      )) addExpectedRoot(projection);
    }
  }

  const successorNativeEvidence = await validateNativeGateControlRecord(
    object(bundle.successor_readiness)?.native_gate_control,
    "$.successor_readiness.native_gate_control",
    closingRepositoryObject,
    base,
    files,
    false,
    false,
    allowPlaceholders,
    clock,
    errors,
  );
  if (successorNativeEvidence) {
    const successorProjection = nativeGateRootProjections(successorNativeEvidence, regressionRepoId);
    for (const id of successorProjection.observation_ids) {
      nativeObservationIds.add(id);
      addObservationEvidenceRef(id, successorNativeEvidence.coverage_ref);
    }
    for (const root of successorProjection.roots) addExpectedRoot(root);
    if (!hasChangedRepositoryBoundary) {
      for (const id of successorProjection.observation_ids) {
        baselineNativeObservationIds.add(id);
        baselineObservationIds.add(id);
      }
    } else if (priorNativeEvidence) {
      validateNativeGateCatalogTransition(
        priorNativeEvidence,
        successorNativeEvidence,
        "$.successor_readiness.native_gate_control",
        errors,
      );
      const priorProjection = nativeGateRootProjections(priorNativeEvidence, regressionRepoId);
      if (successorNativeEvidence.discovery.catalog_sha256 !== priorNativeEvidence.discovery.catalog_sha256) {
        errors.push("$.successor_readiness.native_gate_control.discovery_ref: must equal the final action boundary native-gate catalog");
      }
      if (!stableEqual(successorProjection.observation_ids, priorProjection.observation_ids)) {
        errors.push("$.successor_readiness.native_gate_control: native-gate observations must equal the final action boundary state");
      }
    } else {
      errors.push("$.successor_readiness.native_gate_control: cannot reconcile final native gates without the changed action chain's baseline and post-state evidence");
    }
  }

  const evidenceObservationIds = new Set<string>(detectorObservationIds);
  for (const id of nativeObservationIds) evidenceObservationIds.add(id);
  for (const action of derivedActionObservations) {
    for (const id of action.observed_observation_ids) evidenceObservationIds.add(id);
  }
  const reportedRootKeys = new Set<string>();
  for (const { debt, path: debtPath } of reportedRootDebts) {
    if (typeof debt.debt_key === "string") reportedRootKeys.add(debt.debt_key);
    const observationIds = array(debt.observation_ids)
      .filter((id): id is string => typeof id === "string" && HEX64.test(id));
    const expectedRoot = expectedRootProjections.get(String(debt.debt_key ?? ""));
    if (!expectedRoot) {
      errors.push(`${debtPath}.debt_key: root is absent from independently normalized detector/native evidence`);
    } else {
      if (debt.normalizer !== expectedRoot.normalizer) {
        errors.push(`${debtPath}.normalizer: must equal the evidence-derived allowlisted normalizer`);
      }
      if (!stableEqual(debt.cause_key, expectedRoot.cause_key)) {
        errors.push(`${debtPath}.cause_key: must equal the evidence-derived causal partition`);
      }
      if (!stableEqual(observationIds, expectedRoot.observation_ids)) {
        errors.push(`${debtPath}.observation_ids: must equal the evidence-derived root partition`);
      }
    }
    for (const id of observationIds) {
      if (!evidenceObservationIds.has(id)) {
        errors.push(`${debtPath}.observation_ids: ${id} is absent from independently bound detector/action evidence`);
      }
    }
    if (debt.detector_finding_fingerprints !== undefined) {
      const fingerprints = array(debt.detector_finding_fingerprints)
        .filter((fingerprint): fingerprint is string => typeof fingerprint === "string" && HEX64.test(fingerprint));
      const detectorFamily = String(object(debt.cause_key)?.detector_family ?? "");
      const sourceId = detectorById(detectorFamily)?.detector;
      if (!sourceId) {
        errors.push(`${debtPath}.cause_key.detector_family: must identify the canonical source of detector fingerprints`);
      } else {
        const expectedIds = sortedUnique(fingerprints.map((fingerprint) => canonicalObservationId({
          source_id: sourceId,
          source_native_fingerprint: fingerprint,
        })));
        if (fingerprints.some((fingerprint) => detectorObservationByFamily.get(`${detectorFamily}\0${fingerprint}`)
          !== canonicalObservationId({ source_id: sourceId, source_native_fingerprint: fingerprint }))) {
          errors.push(`${debtPath}.detector_finding_fingerprints: family/fingerprint pair is absent from bound detector evidence`);
        }
        if (!stableEqual(observationIds, expectedIds)) {
          errors.push(`${debtPath}.observation_ids: must equal canonical IDs derived from detector_finding_fingerprints`);
        }
      }
    }
    const origin = object(debt.origin);
    const observationEvidenceRef = object(origin?.observation_evidence_ref);
    if (observationEvidenceRef) {
      await loadBytesRef(
        files,
        base,
        observationEvidenceRef,
        `${debtPath}.origin.observation_evidence_ref`,
        errors,
        allowPlaceholders,
      );
    }
    const earliestAction = derivedActionObservations.find((action) => (
      observationIds.some((id) => action.appeared_observation_ids.includes(id))
    ));
    if (origin?.class === "introduced_by_run" && typeof origin.action_id === "string") {
      const refsByObservation = actionObservationEvidenceRefs.get(origin.action_id);
      const expectedRefs = observationIds.flatMap((id) => refsByObservation?.get(id) ?? []);
      if (!observationEvidenceRef || !expectedRefs.some((candidate) => stableEqual(candidate, {
        path: observationEvidenceRef.path,
        sha256: observationEvidenceRef.sha256,
      }))) {
        errors.push(`${debtPath}.origin.observation_evidence_ref: must equal bound evidence for a root observation at its attributed action`);
      }
    } else if (origin?.class === "newly_discovered_preexisting" || origin?.class === "concurrent_external") {
      const expectedRefs = observationIds.flatMap((id) => observationEvidenceRefs.get(id) ?? []);
      if (!observationEvidenceRef || !expectedRefs.some((candidate) => stableEqual(candidate, {
        path: observationEvidenceRef.path,
        sha256: observationEvidenceRef.sha256,
      }))) {
        errors.push(`${debtPath}.origin.observation_evidence_ref: must equal independently bound detector/native evidence for a root observation`);
      }
      if (origin.class === "newly_discovered_preexisting") {
        await validateBaselineReplayOrigin(
          origin.baseline_replay_ref,
          debt,
          debtPath,
          record.baseline_object,
          baselineRepositoryObject,
          coverageRuntimeIdentitySha256,
          regressionRepoId,
          base,
          files,
          allowPlaceholders,
          clock,
          errors,
        );
      } else {
        await validateExternalChangeOrigin(
          origin.change_ref,
          debt,
          debtPath,
          earliestAction?.action_id,
          actionRepositoryBoundaries,
          base,
          files,
          allowPlaceholders,
          clock,
          errors,
        );
      }
    }
  }
  for (const key of expectedRootProjections.keys()) {
    if (!reportedRootKeys.has(key)) {
      errors.push(`${recordPath}.root_projection: evidence-derived root debt ${key} is absent from report completion_debts`);
    }
  }

  const closingObservationIds = new Set(baselineObservationIds);
  for (const action of derivedActionObservations) {
    for (const id of action.before_observation_ids) {
      if (!closingObservationIds.has(id)) {
        errors.push(`${recordPath}.action_checks[${JSON.stringify(action.action_id)}].before_observation_ids: ${id} is absent from the preceding observation state`);
      }
      closingObservationIds.delete(id);
    }
    for (const id of action.closing_observation_ids) closingObservationIds.add(id);
  }
  if (checks.length === 0 && record.baseline_object !== record.closing_object) {
    errors.push(`${recordPath}.action_checks: a changed closing object requires an exact ordered action-observation chain`);
  }
  const repoId = String(object(report.repo)?.id ?? "");
  const accountingErrors = validateRegressionAccounting(record.accounting, {
    repo_id: repoId,
    baseline_observation_ids: [...baselineObservationIds].sort(compareCodePoints),
    closing_observation_ids: [...closingObservationIds].sort(compareCodePoints),
    action_observations: derivedActionObservations,
    root_debts: rootDebts,
  });
  for (const error of accountingErrors) errors.push(`${recordPath}.accounting: ${error}`);
  const acceptedObservationIds = new Set<string>();
  for (const debt of rootDebts) {
    if (debt.state !== "accepted_exception" || debt.disposition !== "accepted_exception") continue;
    for (const id of array(debt.observation_ids)) {
      if (typeof id === "string" && HEX64.test(id)) acceptedObservationIds.add(id);
    }
  }
  const payableClosingObservationIds = [...closingObservationIds]
    .filter((id) => !acceptedObservationIds.has(id));
  if (clean && payableClosingObservationIds.length !== 0) {
    errors.push(`${recordPath}.accounting: CLEAN requires zero evidence-derived payable closing observations`);
  }

}

export async function validateRegressionDelta(
  bundle: JsonObject,
  report: JsonObject,
  manifest: JsonObject,
  base: string,
  files: FilePort,
  clean: boolean,
  allowPlaceholders: boolean,
  clock: EvidenceClock | undefined,
  liveRuntimeIdentity: DetectorRuntimeIdentity | undefined,
  errors: string[],
): Promise<void> {
  const context = await loadRegressionValidationContext(
    bundle,
    report,
    manifest,
    base,
    files,
    clean,
    allowPlaceholders,
    clock,
    liveRuntimeIdentity,
    errors,
  );
  if (!context) return;
  const state = await validateRegressionActionChain(context);
  if (context.modern) await validateModernRegressionClosure(context, state);
  await validateDetectorCoverage(
    context.record,
    context.report,
    context.base,
    context.files,
    context.clean,
    context.allowPlaceholders,
    context.clock,
    state.comparatorFindingFingerprints,
    context.liveRuntimeIdentity,
    context.errors,
  );
}
