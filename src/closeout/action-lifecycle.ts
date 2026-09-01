import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { dirname, isAbsolute, join, posix as pathPosix, relative, resolve, sep } from "node:path";

import {
  type BundleValidationResult,
  validateBundleFile,
} from "./bundle.js";
import {
  captureActionHygiene,
  deriveActionHygieneDelta,
  type ActionHygieneDelta,
  type ActionHygieneSnapshot,
} from "./action-hygiene.js";
import {
  detectorById,
  type DetectorCoverage,
} from "./detector-coverage.js";
import {
  nativeGateFailureObservations,
  type NativeGateCoverage,
  type NativeGateDiscovery,
} from "./native-gates.js";
import { prepareCloseout } from "./prepare.js";
import {
  canonicalObservationId,
  deriveActionObservationSets,
  deriveRegressionAccounting,
  type ActionObservationSets,
  type RootDebtAccountingRow,
} from "./regression-accounting.js";
import { captureRepositoryObject, type RepositoryObject } from "./repository-object.js";
import { sha256File } from "./repository.js";
import type { FileRuntimeAttestationBinding } from "../runtime-binding.js";
import {
  HEX64,
  array,
  canonical,
  clone,
  digestBytes,
  digestRef,
  equal,
  frozenDetectorPolicyEqual,
  jsonBytes,
  lifecyclePath,
  loadContext,
  lockPath,
  object,
  portablePath,
  readActionHygieneSnapshot,
  readJson,
  rehashBundle,
  replaceJson,
  requireValidBundle,
  resolveContained,
  text,
  transactionalWrite,
  writeEvidenceRecord,
  writeExclusive,
  type BundleContext,
  type JsonObject,
} from "./action-lifecycle-runtime.js";

const ACTION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ACTION_HYGIENE_CONTRACT = "mister-clean.action-hygiene/1.0";
const UNRESOLVED_DEBT_STATES = new Set(["open", "blocked", "deferred", "not_assessed"]);
const CONSEQUENT_ACTION_KINDS = new Set([
  "git_push", "branch_delete_local", "branch_delete_remote", "worktree_remove",
  "process_signal", "tracker_write",
]);
const GIT_CHANGE_KINDS = new Set([
  "local_edit", "local_move", "recoverable_delete", "format", "generate", "doc_update",
  "planning_record_update", "git_commit", "git_integrate", "historical_conform", "handoff_update",
]);
const ACTION_LIFECYCLE_KINDS = new Set([
  "local_edit", "local_move", "recoverable_delete", "format", "generate", "doc_update",
  "git_commit", "historical_conform", "handoff_update",
]);
const SPECIALIZED_ACTION_PROTOCOLS: Readonly<Record<string, string>> = {
  agent_dispatch: "a dispatch mechanism and a fully attributed execution lane",
  git_integrate: "an integration mutex, compare-and-swap receipt, and versioned source-lane checks",
  git_push: "a push gate, remote compare-and-swap observation, review, validation, and prior-CI evidence",
  planning_record_update: "an atomic projection transaction and a post-update coherence audit",
};

export interface ActionBeginOptions {
  readonly bundleDirectory: string;
  readonly id: string;
  readonly debtKey: string;
  readonly kind: string;
  readonly target: string;
  readonly purpose: string;
  readonly runtimeAttestation: FileRuntimeAttestationBinding;
  readonly now?: () => Date;
}

export interface ActionFinishOptions {
  readonly bundleDirectory: string;
  readonly id: string;
  readonly status: "closed" | "interrupted";
  readonly runtimeAttestation: FileRuntimeAttestationBinding;
  readonly now?: () => Date;
}

export interface ActionLifecycleResult {
  readonly actionId: string;
  readonly bundleDirectory: string;
  readonly bundlePath: string;
  readonly repositoryObject: RepositoryObject;
  readonly state: "open" | "closed" | "interrupted";
}

interface Snapshot {
  readonly directory: string;
  readonly prefix: string;
  readonly bundle: JsonObject;
  readonly report: JsonObject;
  readonly manifest: JsonObject;
  readonly regression: JsonObject;
  readonly repositoryObject: RepositoryObject;
  readonly detectorCoverage: DetectorCoverage;
  readonly nativeControl: JsonObject;
  readonly nativeDiscovery: NativeGateDiscovery;
  readonly nativeCoverage: NativeGateCoverage;
}

interface NativeControlEvidence {
  readonly control: JsonObject;
  readonly discovery: NativeGateDiscovery;
  readonly coverage: NativeGateCoverage;
}

interface LifecycleRecord extends JsonObject {
  record_type: "mister-clean.action-lifecycle";
  schema_version: "1.0";
  state: "open" | "closed" | "interrupted";
  action: JsonObject;
  owner: JsonObject;
  opened_at: string;
  before_repository_object: RepositoryObject;
  frozen_detector_policy: JsonObject;
  pre_snapshot: JsonObject;
  action_hygiene: JsonObject;
  prior_boundary_native_gate_control: JsonObject;
  finished_at?: string;
  after_repository_object?: RepositoryObject;
  final_bundle_sha256?: string;
}

interface ActionHygieneEvidence {
  readonly contract: typeof ACTION_HYGIENE_CONTRACT;
  readonly primary_branch: string;
  readonly verdict: "NO_HARM";
  readonly violation_count: 0;
  readonly before_ref: JsonObject;
  readonly after_ref: JsonObject;
  readonly delta_ref: JsonObject;
}

function currentBranch(repository: string): string {
  try {
    return execFileSync("git", ["--no-optional-locks", "-C", repository, "symbolic-ref", "--quiet", "--short", "HEAD"], {
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    }).trim();
  } catch {
    throw new Error("action begin requires a named branch; a modifying lifecycle cannot honestly assign a detached worktree");
  }
}

function normalizedActionTarget(target: string): { readonly role: "writer" | "integrator"; readonly paths: string[] } {
  if (target === "." || target === "repository") return { role: "integrator", paths: ["**/*"] };
  const normalized = pathPosix.normalize(target.replaceAll("\\", "/"));
  if (pathPosix.isAbsolute(normalized)
    || normalized === "."
    || normalized === ".."
    || normalized.startsWith("../")
    || normalized === ".git"
    || normalized.startsWith(".git/")
    || /[?*[\]{}]/u.test(normalized)) {
    throw new Error("--target must be repository, ., or one concrete repository-relative path outside .git");
  }
  return { role: "writer", paths: [normalized] };
}

function actionCoordination(
  context: BundleContext,
  actionId: string,
  debt: JsonObject,
  target: string,
  before: RepositoryObject,
  branch: string,
  openedAt: string,
  owner: string,
): { readonly actionFields: JsonObject; readonly coordination: JsonObject } {
  if (context.manifest.schema_version !== "1.2") {
    throw new Error("action lifecycle requires action-manifest schema 1.2 versioned coordination records");
  }
  const coordination = clone(object(context.manifest.coordination, "$.manifest.coordination"));
  const lanes = array(coordination.lanes, "$.manifest.coordination.lanes")
    .map((raw, index) => object(raw, `$.manifest.coordination.lanes[${index}]`));
  if (lanes.some((lane) => lane.state === "active" || lane.state === "ready")) {
    throw new Error("action begin requires a quiescent coordination manifest; an active or ready lane still owns repository work");
  }
  const domains = array(coordination.domains, "$.manifest.coordination.domains")
    .map((raw, index) => object(raw, `$.manifest.coordination.domains[${index}]`));
  const domainKey = `root-debt-${text(debt.debt_key, "completion debt debt_key")}`;
  if (domains.some((domain) => domain.key === domainKey)) {
    throw new Error(`coordination domain already exists for ${domainKey}; this debt cannot be opened twice`);
  }
  const targetAssignment = normalizedActionTarget(target);
  const laneId = `action-${actionId}`;
  const taskId = `pay-${text(debt.debt_key, "completion debt debt_key")}`;
  if (lanes.some((lane) => lane.id === laneId || lane.task_id === taskId)) {
    throw new Error(`coordination lane/task already exists for action ${actionId}`);
  }
  const stateDigest = digestBytes(canonical({
    debt_key: debt.debt_key,
    disposition: debt.disposition,
    observation_ids: rowObservationIds(debt),
    repository_object: before,
    state: debt.state,
  }));
  const domainPath = `action-evidence/${actionId}/coordination/domain-observation.json`;
  const domainEvidence = writeEvidenceRecord(context, domainPath, {
    record_type: "mister-clean.coordination-domain-observation",
    schema_version: "1.0",
    key: domainKey,
    version: 0,
    state_digest: stateDigest,
    debt_key: debt.debt_key,
    repository_object: before,
    observed_at: openedAt,
  });
  const bootstrapPath = `action-evidence/${actionId}/coordination/lane-bootstrap.json`;
  const bootstrapEvidence = writeEvidenceRecord(context, bootstrapPath, {
    record_type: "mister-clean.lane-bootstrap",
    schema_version: "1.0",
    lane_id: laneId,
    task_id: taskId,
    owner,
    worktree: context.repository,
    branch,
    head: before.head_commit,
    repository_object: before,
    observed_at: openedAt,
  });
  const claim = {
    key: domainKey,
    access: "write",
    expected_version: 0,
    expected_state_digest: stateDigest,
    operation_class: "pay-root-debt",
    commutes_with: [],
    commutativity_ref: null,
  };
  const lane = {
    id: laneId,
    task_id: taskId,
    owner,
    role: targetAssignment.role,
    state: "active",
    execution_class: "hosted",
    model: "external-actor-unspecified",
    reasoning: "not-recorded",
    harness: "mister-clean-cli",
    safe_context_limit_tokens: null,
    estimated_context_tokens: 0,
    evaluation_mode: "none",
    routing_reason: `exclusive public action lifecycle for root debt ${String(debt.debt_key)}`,
    worktree: context.repository,
    branch,
    baseline_commit: before.head_commit,
    read_paths: targetAssignment.paths,
    write_paths: targetAssignment.paths,
    dependencies: [],
    invariants: [
      `full repository object begins at ${before.sha256}`,
      "frozen registered detectors and repository-native gates do not weaken",
    ],
    acceptance: [
      `root debt ${String(debt.debt_key)} is satisfied`,
      "zero action-introduced observations remain open",
      "the updated closure bundle passes live validation",
    ],
    bootstrap: {
      worktree: context.repository,
      branch,
      head: before.head_commit,
      observed_at: openedAt,
      evidence_ref: bootstrapEvidence,
    },
    coordination_claims: [claim],
  };
  coordination.domains = [...domains.map(clone), {
    key: domainKey,
    version: 0,
    state_digest: stateDigest,
    observed_at: openedAt,
    evidence_ref: domainEvidence,
  }];
  coordination.lanes = [...lanes.map(clone), lane];
  const priorActions = array(context.manifest.actions, "$.manifest.actions")
    .map((raw, index) => object(raw, `$.manifest.actions[${index}]`));
  const priorOperation = priorActions.at(-1);
  return {
    actionFields: {
      lane_id: laneId,
      task_id: taskId,
      parent_operation_ids: priorOperation ? [text(priorOperation.id, "prior action id")] : [],
      before_object: before.sha256,
      after_object: null,
      recorded_at: openedAt,
    },
    coordination,
  };
}

function finishCoordination(
  manifest: JsonObject,
  laneId: string,
  status: "closed" | "interrupted",
): void {
  const coordination = object(manifest.coordination, "$.manifest.coordination");
  let matched = false;
  coordination.lanes = array(coordination.lanes, "$.manifest.coordination.lanes").map((raw, index) => {
    const lane = clone(object(raw, `$.manifest.coordination.lanes[${index}]`));
    if (lane.id === laneId) {
      matched = true;
      lane.state = status === "closed" ? "integrated" : "blocked";
    }
    return lane;
  });
  if (!matched) throw new Error(`action lane ${JSON.stringify(laneId)} disappeared from the coordination manifest`);
}

function originalInputPath(context: BundleContext, detectorId: string, kind: string): string | undefined {
  const coverage = object(context.regression.detector_coverage, "$.regression.detector_coverage");
  const execution = array(coverage.executions, "$.regression.detector_coverage.executions")
    .map((raw, index) => object(raw, `$.regression.detector_coverage.executions[${index}]`))
    .find((row) => row.detector_id === detectorId);
  const input = execution
    ? array(execution.input_refs, `$.regression.detector_coverage.executions[${detectorId}].input_refs`)
      .map((raw, index) => object(raw, `$.regression.detector_coverage.executions[${detectorId}].input_refs[${index}]`))
      .find((row) => row.kind === kind)
    : undefined;
  return input ? resolveContained(context.base, input.path, `${detectorId}.${kind}.path`) : undefined;
}

function semanticExecutionEnabled(context: BundleContext): boolean {
  const coverage = object(context.regression.detector_coverage, "$.regression.detector_coverage");
  const execution = array(coverage.executions, "$.regression.detector_coverage.executions")
    .map((raw, index) => object(raw, `$.regression.detector_coverage.executions[${index}]`))
    .find((row) => row.detector_id === "semantic_boundary");
  if (!execution) return false;
  const resultRef = object(execution.result_ref, "semantic result_ref");
  const result = readJson(resolveContained(context.base, resultRef.path, "semantic result_ref.path"));
  return Number(result.executed_probe_count ?? 0) > 0;
}

function requestSource(context: BundleContext): string | undefined {
  const criteria = object(context.bundle.criteria_discovery, "$.criteria_discovery");
  if (criteria.source_kind !== "exact_bytes" || criteria.request_source === null) return undefined;
  const ref = object(criteria.request_source, "$.criteria_discovery.request_source");
  return resolveContained(context.base, ref.path, "$.criteria_discovery.request_source.path");
}

function criteriaIds(context: BundleContext): string[] {
  return array(object(context.bundle.criteria_discovery, "$.criteria_discovery").criteria_ids, "$.criteria_discovery.criteria_ids")
    .map((value, index) => text(value, `$.criteria_discovery.criteria_ids[${index}]`));
}

async function prepareSnapshot(
  context: BundleContext,
  evidenceHome: string,
  runId: string,
  runtimeAttestation: FileRuntimeAttestationBinding,
  now: () => Date,
  frozenInputs?: {
    readonly publicSafety?: string;
    readonly semantic?: string;
    readonly semanticEvidencePackage?: string;
    readonly semanticTrustPolicy?: string;
    readonly executeSemantic?: boolean;
  },
): Promise<Snapshot> {
  const exactRequestSource = requestSource(context);
  const prepared = await prepareCloseout({
    repo: context.repository,
    evidenceHome,
    runId,
    requestRef: text(context.bundle.request_ref, "$.request_ref"),
    ...(exactRequestSource === undefined ? {} : { requestSource: exactRequestSource }),
    ...(frozenInputs?.publicSafety === undefined ? {} : { publicSafetyDenylistPath: frozenInputs.publicSafety }),
    ...(frozenInputs?.semantic === undefined ? {} : { semanticManifestPath: frozenInputs.semantic }),
    ...(frozenInputs?.semanticEvidencePackage === undefined ? {} : {
      semanticEvidencePackagePath: frozenInputs.semanticEvidencePackage,
    }),
    ...(frozenInputs?.semanticTrustPolicy === undefined ? {} : {
      semanticTrustPolicyPath: frozenInputs.semanticTrustPolicy,
    }),
    executeSemanticProbes: frozenInputs?.executeSemantic ?? semanticExecutionEnabled(context),
    criteria: criteriaIds(context),
    mode: "CLOSE",
    runtimeAttestation,
    now,
  });
  const directory = realpathSync(prepared.bundleDirectory);
  const prefix = portablePath(context.base, directory);
  const bundle = readJson(prepared.bundlePath);
  const report = readJson(join(directory, "closeout-report.json"));
  const manifest = readJson(join(directory, "action-manifest.json"));
  const regression = readJson(join(directory, "regression-delta.json"));
  const detectorCoverage = object(regression.detector_coverage, "snapshot.regression.detector_coverage") as unknown as DetectorCoverage;
  const nativeControl = object(object(bundle.successor_readiness, "snapshot.successor_readiness").native_gate_control, "snapshot.native_gate_control");
  const discoveryRef = object(nativeControl.discovery_ref, "snapshot.native_gate_control.discovery_ref");
  const coverageRef = object(nativeControl.coverage_ref, "snapshot.native_gate_control.coverage_ref");
  const nativeDiscovery = readJson(resolveContained(directory, discoveryRef.path, "snapshot.discovery_ref.path")) as unknown as NativeGateDiscovery;
  const nativeCoverage = readJson(resolveContained(directory, coverageRef.path, "snapshot.coverage_ref.path")) as unknown as NativeGateCoverage;
  const repositoryObject = object(regression.closing_repository_object, "snapshot.closing_repository_object") as unknown as RepositoryObject;
  return {
    directory,
    prefix,
    bundle,
    report,
    manifest,
    regression,
    repositoryObject,
    detectorCoverage,
    nativeControl,
    nativeDiscovery,
    nativeCoverage,
  };
}

function rebaseDigestRefs<T>(value: T, prefix: string): T {
  const visit = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(visit);
    if (!input || typeof input !== "object") return input;
    const record = input as JsonObject;
    const output: JsonObject = {};
    const digestReference = typeof record.path === "string"
      && typeof record.sha256 === "string"
      && HEX64.test(record.sha256)
      && !("commit" in record);
    for (const [key, child] of Object.entries(record)) {
      output[key] = digestReference && key === "path"
        ? `${prefix}/${String(child)}`
        : visit(child);
    }
    return output;
  };
  return visit(value) as T;
}

function rebasedControl(snapshot: Snapshot): JsonObject {
  const control = rebaseDigestRefs(clone(snapshot.nativeControl), snapshot.prefix);
  control.evidence_root = `${snapshot.prefix}/${String(snapshot.nativeControl.evidence_root)}`;
  return control;
}

function loadNativeControl(base: string, rawControl: unknown): NativeControlEvidence {
  const control = object(rawControl, "native_gate_control");
  const discoveryRef = object(control.discovery_ref, "native_gate_control.discovery_ref");
  const coverageRef = object(control.coverage_ref, "native_gate_control.coverage_ref");
  return {
    control,
    discovery: readJson(resolveContained(base, discoveryRef.path, "native_gate_control.discovery_ref.path")) as unknown as NativeGateDiscovery,
    coverage: readJson(resolveContained(base, coverageRef.path, "native_gate_control.coverage_ref.path")) as unknown as NativeGateCoverage,
  };
}

function detectorObservationIds(coverage: DetectorCoverage): string[] {
  const ids: string[] = [];
  for (const execution of coverage.executions) {
    const spec = detectorById(execution.detector_id);
    if (!spec) throw new Error(`snapshot contains unknown detector ${execution.detector_id}`);
    for (const fingerprint of execution.finding_fingerprints) {
      ids.push(canonicalObservationId({
        source_id: spec.detector,
        source_native_fingerprint: fingerprint,
      }));
    }
  }
  return [...new Set(ids)].sort();
}

function nativeObservationIds(discovery: NativeGateDiscovery, coverage: NativeGateCoverage): string[] {
  return nativeGateFailureObservations(discovery, coverage).map((projection) => canonicalObservationId({
    source_id: projection.source_id,
    source_native_fingerprint: projection.source_native_fingerprint,
  })).sort();
}

function comparatorRecords(
  context: BundleContext,
  before: Snapshot,
  after: Snapshot,
  actionId: string,
): { readonly afterObservationRefs: Map<string, JsonObject>; readonly records: JsonObject[] } {
  const beforeById = new Map(before.detectorCoverage.executions.map((execution) => [execution.detector_id, execution]));
  const afterById = new Map(after.detectorCoverage.executions.map((execution) => [execution.detector_id, execution]));
  const afterObservationRefs = new Map<string, JsonObject>();
  if (!equal(before.detectorCoverage.required_detector_ids, after.detectorCoverage.required_detector_ids)) {
    throw new Error("registered detector applicability changed across the action; tracked-surface policy drift cannot be represented by the frozen action comparator contract");
  }
  const records = before.detectorCoverage.required_detector_ids.map((detectorId) => {
    const first = beforeById.get(detectorId);
    const last = afterById.get(detectorId);
    if (!first || !last) throw new Error(`missing ${detectorId} action-bound detector execution`);
    for (const field of ["scope", "command", "detector", "command_sha256", "detector_registry_sha256", "runtime_identity_sha256"] as const) {
      if (first[field] !== last[field]) throw new Error(`${detectorId} ${field} changed across the frozen action boundary`);
    }
    const comparatorId = `${actionId}:${detectorId}`;
    const observation = (phase: "before" | "after", execution: typeof first, snapshot: Snapshot): JsonObject => {
      const sourceRef = object(execution.result_ref, `${detectorId}.${phase}.result_ref`);
      const sourceResult = readJson(resolveContained(snapshot.directory, sourceRef.path, `${detectorId}.${phase}.result_ref.path`));
      const boundResult = {
        ...clone(sourceResult),
        action_id: actionId,
        comparator_id: comparatorId,
        phase,
        object: execution.object,
        repository_object: execution.repository_object,
      };
      const resultPath = `${after.prefix}/action-comparators/${detectorId}-${phase}.json`;
      const resultRef = writeEvidenceRecord(context, resultPath, boundResult);
      if (phase === "after") {
        const spec = detectorById(detectorId);
        if (!spec) throw new Error(`snapshot contains unknown detector ${detectorId}`);
        for (const fingerprint of execution.finding_fingerprints) {
          afterObservationRefs.set(canonicalObservationId({
            source_id: spec.detector,
            source_native_fingerprint: fingerprint,
          }), resultRef);
        }
      }
      return {
        phase,
        action_id: actionId,
        comparator_id: comparatorId,
        object: execution.object,
        repository_object: execution.repository_object,
        command_sha256: execution.command_sha256,
        detector_registry_sha256: execution.detector_registry_sha256,
        runtime_identity_sha256: execution.runtime_identity_sha256,
        result_sha256: resultRef.sha256,
        result_ref: resultRef,
        finding_fingerprints: [...execution.finding_fingerprints],
        exit_code: execution.exit_code,
        observed_at: execution.observed_at,
      };
    };
    return {
      id: comparatorId,
      detector_id: detectorId,
      command: first.command,
      scope: first.scope,
      detector: first.detector,
      observations: [observation("before", first, before), observation("after", last, after)],
    };
  });
  return { afterObservationRefs, records };
}

function controlCatalogErrors(before: NativeControlEvidence, after: NativeControlEvidence): string[] {
  const errors: string[] = [];
  const afterById = new Map(after.discovery.gates.map((gate) => [gate.id, gate]));
  for (const gate of before.discovery.gates) {
    if (gate.disposition !== "required") continue;
    const successor = afterById.get(gate.id);
    if (!successor) errors.push(`required native gate ${JSON.stringify(gate.id)} disappeared`);
    else if (successor.disposition !== "required") errors.push(`required native gate ${JSON.stringify(gate.id)} was weakened to ${successor.disposition}`);
    else if (successor.kind !== gate.kind) errors.push(`native gate ${JSON.stringify(gate.id)} changed kind from ${gate.kind} to ${successor.kind}`);
  }
  return errors;
}

function debtRows(report: JsonObject): JsonObject[] {
  return array(report.completion_debts, "$.completion_debts").map((raw, index) => object(raw, `$.completion_debts[${index}]`));
}

function rowsByKey(rows: readonly JsonObject[]): Map<string, JsonObject> {
  return new Map(rows.map((row) => [text(row.debt_key, "completion_debt.debt_key"), row]));
}

function rowObservationIds(row: JsonObject): string[] {
  return array(row.observation_ids, "completion_debt.observation_ids")
    .map((id, index) => text(id, `completion_debt.observation_ids[${index}]`));
}

function writeDebtResult(
  context: BundleContext,
  id: string,
  row: JsonObject,
  after: RepositoryObject,
  status: "closed" | "interrupted",
  observedAt: string,
): JsonObject {
  const path = `action-evidence/${id}/debt-results/${text(row.debt_key, "debt_key")}.json`;
  const absolute = resolveContained(context.base, path, "debt result path");
  mkdirSync(dirname(absolute), { recursive: true, mode: 0o700 });
  const command = `mister-clean action finish ${JSON.stringify(context.base)} --id ${JSON.stringify(id)} --status ${status}`;
  const result = "root debt absent from the post-action registered detector/native observation set";
  writeFileSync(absolute, jsonBytes({
    record_type: "mister-clean.debt-result",
    debt_id: row.id,
    kind: "gate_result",
    object: after.sha256,
    command,
    result,
    observed_at: observedAt,
  }), { encoding: "utf8", mode: 0o600 });
  return {
    kind: "gate_result",
    object: after.sha256,
    command,
    result,
    observed_at: observedAt,
    evidence_ref: digestRef(context.base, path),
  };
}

function mergeRootDebts(
  context: BundleContext,
  lifecycle: LifecycleRecord,
  before: Snapshot,
  after: Snapshot,
  closingObservationIds: readonly string[],
  actionObservationRefs: ReadonlyMap<string, JsonObject>,
  status: "closed" | "interrupted",
  observedAt: string,
): JsonObject[] {
  const existingRows = debtRows(context.report);
  const beforeRows = debtRows(before.report).map((row) => rebaseDigestRefs(clone(row), before.prefix));
  const afterRows = debtRows(after.report).map((row) => rebaseDigestRefs(clone(row), after.prefix));
  const existing = rowsByKey(existingRows);
  const pre = rowsByKey(beforeRows);
  const post = rowsByKey(afterRows);
  const allKeys = [...new Set([...existing.keys(), ...pre.keys(), ...post.keys()])].sort();
  const closing = new Set(closingObservationIds);
  const rows: JsonObject[] = [];
  for (const key of allKeys) {
    const old = existing.get(key);
    const preRow = pre.get(key);
    const postRow = post.get(key);
    const base = clone(postRow ?? preRow ?? old) as JsonObject;
    const observationIds = [...new Set([
      ...(old ? rowObservationIds(old) : []),
      ...(preRow ? rowObservationIds(preRow) : []),
      ...(postRow ? rowObservationIds(postRow) : []),
    ])].sort();
    base.observation_ids = observationIds;
    const fingerprints = [...new Set([old, preRow, postRow].flatMap((row) => (
      row && Array.isArray(row.detector_finding_fingerprints) ? row.detector_finding_fingerprints as string[] : []
    )))].sort();
    if (fingerprints.length > 0) base.detector_finding_fingerprints = fingerprints;
    const present = observationIds.some((id) => closing.has(id));
    if (!old && preRow) {
      throw new Error(
        `pre-action root debt ${key} is absent from the prior live-validated boundary; `
        + "the current exports cannot establish immutable-baseline preexistence, so finish refuses to fabricate newly_discovered_preexisting evidence",
      );
    }
    if (old?.state === "accepted_exception") {
      base.state = "accepted_exception";
      base.disposition = "accepted_exception";
      base.exception = clone(old.exception);
      base.origin = clone(old.origin);
      base.evidence = clone(old.evidence);
    } else if (present) {
      base.state = postRow?.state ?? old?.state ?? "open";
      if (base.state === "satisfied") base.state = "open";
      base.disposition = postRow?.disposition ?? old?.disposition ?? "autonomously_repair";
      base.origin = old
        ? clone(old.origin)
        : {
            class: "introduced_by_run",
            action_id: lifecycle.action.id,
            observation_evidence_ref: actionObservationRefs.get(rowObservationIds(postRow as JsonObject)[0] ?? ""),
          };
      base.evidence = clone(postRow?.evidence ?? preRow?.evidence ?? old?.evidence ?? []);
    } else {
      base.state = "satisfied";
      if (base.disposition === "accepted_exception") base.disposition = "autonomously_validate";
      base.origin = old
        ? clone(old.origin)
        : {
            class: "introduced_by_run",
            action_id: lifecycle.action.id,
            observation_evidence_ref: actionObservationRefs.get(rowObservationIds(postRow as JsonObject)[0] ?? ""),
          };
      const alreadySatisfied = old?.state === "satisfied" && Array.isArray(old.evidence) && old.evidence.length > 0;
      base.evidence = alreadySatisfied
        ? clone(old.evidence)
        : [writeDebtResult(context, text(lifecycle.action.id, "action.id"), base, after.repositoryObject, status, observedAt)];
    }
    const origin = object(base.origin, `completion debt ${key}.origin`);
    if (origin.class === "introduced_by_run"
      && !object(origin.observation_evidence_ref, `completion debt ${key}.origin.observation_evidence_ref`).path) {
      throw new Error(`cannot bind introduced-by-run observation evidence for root debt ${key}`);
    }
    if (origin.class === "newly_discovered_preexisting"
      && (!object(origin.observation_evidence_ref, `completion debt ${key}.origin.observation_evidence_ref`).path
        || !object(origin.baseline_replay_ref, `completion debt ${key}.origin.baseline_replay_ref`).path)) {
      throw new Error(`cannot bind observation and immutable-baseline replay evidence for root debt ${key}`);
    }
    if (origin.class === "concurrent_external"
      && (!object(origin.observation_evidence_ref, `completion debt ${key}.origin.observation_evidence_ref`).path
        || object(origin.change_ref, `completion debt ${key}.origin.change_ref`).kind !== "external_change")) {
      throw new Error(`cannot bind observation and typed external-change evidence for root debt ${key}`);
    }
    rows.push(base);
  }
  return rows;
}

function actionEvidenceKind(kind: unknown): "git_change" | "validation_result" {
  return GIT_CHANGE_KINDS.has(String(kind)) ? "git_change" : "validation_result";
}

function writeActionResult(
  context: BundleContext,
  lifecycle: LifecycleRecord,
  after: RepositoryObject,
  status: "closed" | "interrupted",
  observedAt: string,
  hygiene: ActionHygieneEvidence,
): JsonObject {
  const action = object(lifecycle.action, "lifecycle.action");
  const path = `action-evidence/${text(action.id, "action.id")}/action-result.json`;
  const absolute = resolveContained(context.base, path, "action result path");
  const command = `mister-clean action finish ${JSON.stringify(context.base)} --id ${JSON.stringify(action.id)} --status ${status}`;
  const result = status === "closed" ? "closed without open action-introduced observations" : "interrupted with action-introduced observations preserved";
  const record = {
    record_type: "mister-clean.action-result",
    action_id: action.id,
    kind: action.kind,
    target: action.target,
    object: after.sha256,
    command,
    result,
    observed_at: observedAt,
    hygiene,
  };
  writeFileSync(absolute, jsonBytes(record), { encoding: "utf8", mode: 0o600 });
  return {
    kind: actionEvidenceKind(action.kind),
    object: after.sha256,
    command,
    result,
    observed_at: observedAt,
    hygiene,
    evidence_ref: digestRef(context.base, path),
  };
}

function gitLines(repository: string, args: readonly string[]): string[] {
  const output = execFileSync("git", ["--no-optional-locks", "-C", repository, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  }).trim();
  return output ? output.split("\n") : [];
}

function changeMap(
  context: BundleContext,
  lifecycle: LifecycleRecord,
  before: RepositoryObject,
  after: RepositoryObject,
): JsonObject {
  const oldInventory = object(context.bundle.change_inventory, "$.change_inventory");
  const startCommit = text(oldInventory.start_commit, "$.change_inventory.start_commit");
  const prior = new Map<string, JsonObject>(array(oldInventory.changes, "$.change_inventory.changes").map((raw, index) => {
    const row = object(raw, `$.change_inventory.changes[${index}]`);
    return [text(row.path, `$.change_inventory.changes[${index}].path`), row];
  }));
  const action = object(lifecycle.action, "lifecycle.action");
  const target = text(action.target, "action.target").replace(/\/$/u, "");
  const covers = (path: string): boolean => target === "." || target === "repository" || path === target || path.startsWith(`${target}/`);
  const touched = new Set(gitLines(context.repository, ["diff", "--name-only", "--no-renames", before.head_commit, after.head_commit]));
  for (const path of touched) if (!covers(path)) {
    throw new Error(`action target ${JSON.stringify(target)} does not cover changed path ${JSON.stringify(path)}`);
  }
  const liveRows = gitLines(context.repository, ["diff", "--name-status", "--no-renames", startCommit, after.head_commit]);
  const changes = liveRows.map((line) => {
    const [status = "", path = ""] = line.split("\t", 2);
    const old = prior.get(path);
    const actionIds = [...new Set([
      ...(old && Array.isArray(old.action_ids) ? old.action_ids as string[] : []),
      ...(touched.has(path) ? [text(action.id, "action.id")] : []),
    ])];
    if (actionIds.length === 0) throw new Error(`no action owns changed path ${JSON.stringify(path)}`);
    return { status, path, action_ids: actionIds, exclusion: null };
  });
  return { start_commit: startCommit, subject_commit: after.head_commit, changes };
}

function postSuccessor(context: BundleContext, snapshot: Snapshot): JsonObject {
  const original = object(context.bundle.successor_readiness, "$.successor_readiness");
  const successor = rebaseDigestRefs(clone(object(snapshot.bundle.successor_readiness, "post.successor_readiness")), snapshot.prefix);
  const snapshots = object(successor.snapshots, "post.successor_readiness.snapshots");
  snapshots.start = clone(object(object(original.snapshots, "$.successor_readiness.snapshots").start, "$.successor_readiness.snapshots.start"));
  return successor;
}

function updateDebtCensus(report: JsonObject, rows: readonly JsonObject[]): void {
  report.debt_census = {
    discovered: rows.length,
    paid: rows.filter((row) => row.state === "satisfied").length,
    accepted_exception: rows.filter((row) => row.state === "accepted_exception").length,
  };
}

function actionRows(regression: JsonObject): ActionObservationSets[] {
  return array(regression.action_checks, "$.regression.action_checks").map((raw, index) => {
    const row = object(raw, `$.regression.action_checks[${index}]`);
    return {
      action_id: text(row.action_id, `$.regression.action_checks[${index}].action_id`),
      before_observation_ids: array(row.before_observation_ids, "before_observation_ids") as string[],
      observed_observation_ids: array(row.observed_observation_ids, "observed_observation_ids") as string[],
      closing_observation_ids: array(row.closing_observation_ids, "closing_observation_ids") as string[],
      appeared_observation_ids: array(row.appeared_observation_ids, "appeared_observation_ids") as string[],
      resolved_before_boundary_observation_ids: array(row.resolved_before_boundary_observation_ids, "resolved_before_boundary_observation_ids") as string[],
      open_at_boundary_observation_ids: array(row.open_at_boundary_observation_ids, "open_at_boundary_observation_ids") as string[],
    };
  });
}

function ensureCleanWorkingTree(repository: string): void {
  const status = execFileSync("git", ["--no-optional-locks", "-C", repository, "status", "--porcelain=v1", "--untracked-files=all"], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
  if (status.trim()) throw new Error("action finish requires a clean working tree; commit or otherwise resolve the action's repository changes first");
}

function verifyLock(context: BundleContext, id: string): JsonObject {
  const path = lockPath(context);
  if (!existsSync(path)) throw new Error("no open Mister Clean action lock exists");
  const lock = readJson(path);
  if (lock.action_id !== id) throw new Error(`action lock belongs to ${JSON.stringify(lock.action_id)}, not ${JSON.stringify(id)}`);
  return lock;
}

function finishInputs(context: BundleContext, lifecycle: LifecycleRecord): {
  publicSafety?: string;
  semantic?: string;
  semanticEvidencePackage?: string;
  semanticTrustPolicy?: string;
  executeSemantic: boolean;
} {
  const frozen = object(lifecycle.frozen_detector_policy, "lifecycle.frozen_detector_policy");
  const inputs = object(frozen.inputs, "lifecycle.frozen_detector_policy.inputs");
  const path = (name: string): string | undefined => typeof inputs[name] === "string"
    ? resolveContained(context.base, inputs[name], `lifecycle.frozen_detector_policy.inputs.${name}`)
    : undefined;
  const publicSafety = path("public_safety");
  const semantic = path("semantic");
  const semanticEvidencePackage = path("semantic_evidence_package");
  const semanticTrustPolicy = path("semantic_trust_policy");
  return {
    ...(publicSafety === undefined ? {} : { publicSafety }),
    ...(semantic === undefined ? {} : { semantic }),
    ...(semanticEvidencePackage === undefined ? {} : { semanticEvidencePackage }),
    ...(semanticTrustPolicy === undefined ? {} : { semanticTrustPolicy }),
    executeSemantic: frozen.execute_semantic === true,
  };
}

function lifecycleSnapshot(context: BundleContext, lifecycle: LifecycleRecord): Snapshot {
  const pre = object(lifecycle.pre_snapshot, "lifecycle.pre_snapshot");
  const directory = resolveContained(context.base, pre.directory, "lifecycle.pre_snapshot.directory");
  const prefix = portablePath(context.base, directory);
  const bundle = readJson(join(directory, "closure-bundle.json"));
  const report = readJson(join(directory, "closeout-report.json"));
  const manifest = readJson(join(directory, "action-manifest.json"));
  const regression = readJson(join(directory, "regression-delta.json"));
  const detectorCoverage = object(regression.detector_coverage, "pre.detector_coverage") as unknown as DetectorCoverage;
  const nativeControl = object(object(bundle.successor_readiness, "pre.successor_readiness").native_gate_control, "pre.native_gate_control");
  const discoveryRef = object(nativeControl.discovery_ref, "pre.native_gate_control.discovery_ref");
  const coverageRef = object(nativeControl.coverage_ref, "pre.native_gate_control.coverage_ref");
  return {
    directory,
    prefix,
    bundle,
    report,
    manifest,
    regression,
    repositoryObject: object(regression.closing_repository_object, "pre.closing_repository_object") as unknown as RepositoryObject,
    detectorCoverage,
    nativeControl,
    nativeDiscovery: readJson(resolveContained(directory, discoveryRef.path, "pre.discovery_ref.path")) as unknown as NativeGateDiscovery,
    nativeCoverage: readJson(resolveContained(directory, coverageRef.path, "pre.coverage_ref.path")) as unknown as NativeGateCoverage,
  };
}

export async function beginAction(options: ActionBeginOptions): Promise<ActionLifecycleResult> {
  if (!ACTION_ID.test(options.id)) throw new Error("--id must match [A-Za-z0-9][A-Za-z0-9._-]{0,127}");
  if (!HEX64.test(options.debtKey)) throw new Error("--debt-key must be a lowercase SHA-256 root-debt key");
  const kind = text(options.kind, "--kind");
  if (SPECIALIZED_ACTION_PROTOCOLS[kind]) {
    throw new Error(
      `--kind ${JSON.stringify(kind)} requires ${SPECIALIZED_ACTION_PROTOCOLS[kind]}; `
      + "the generic public lifecycle refuses to fabricate that specialized protocol",
    );
  }
  if (!ACTION_LIFECYCLE_KINDS.has(kind)) {
    throw new Error(
      `--kind ${JSON.stringify(kind)} is not supported by the public repository-mutation lifecycle; `
      + `supported kinds: ${[...ACTION_LIFECYCLE_KINDS].sort().join(", ")}`,
    );
  }
  text(options.target, "--target");
  text(options.purpose, "--purpose");
  const context = loadContext(options.bundleDirectory);
  if (context.report.mode !== "CLOSE" || context.manifest.mode !== "CLOSE") {
    throw new Error("the public action lifecycle currently supports CLOSE bundles; GUARD uses its exact-tree commit barrier");
  }
  await requireValidBundle(context, options.runtimeAttestation, true);
  if (existsSync(lockPath(context))) throw new Error("another Mister Clean action already owns this evidence home");
  const actions = array(context.manifest.actions, "$.manifest.actions").map((raw, index) => object(raw, `$.manifest.actions[${index}]`));
  if (actions.some((row) => row.id === options.id)) throw new Error(`action id already exists: ${options.id}`);
  if (actions.some((row) => row.status === "planned")) throw new Error("an action is already planned; finish it before beginning another");
  if (actions.some((row) => row.status === "failed")) throw new Error("an interrupted action is terminal and must remain the final action in this bundle");
  const debt = debtRows(context.report).find((row) => row.debt_key === options.debtKey);
  if (!debt) throw new Error(`--debt-key is not present in the bundle: ${options.debtKey}`);
  if (!UNRESOLVED_DEBT_STATES.has(String(debt.state))) throw new Error(`root debt ${options.debtKey} is already terminal (${String(debt.state)})`);

  const now = options.now ?? (() => new Date());
  const openedAt = now().toISOString();
  const before = captureRepositoryObject(context.repository);
  const regressionClosing = object(context.regression.closing_repository_object, "$.regression.closing_repository_object");
  if (!equal(before, regressionClosing)) throw new Error("current full repository object does not equal the prior validated action boundary");
  const lock = {
    record_type: "mister-clean.action-lock",
    schema_version: "1.0",
    action_id: options.id,
    debt_key: options.debtKey,
    owner: { pid: process.pid, host: hostname(), identity: `mister-clean:${String(context.bundle.run_id)}` },
    bundle_sha256: sha256File(context.bundlePath),
    repository_object: before,
    acquired_at: openedAt,
  };
  writeExclusive(lockPath(context), lock);
  const actionRoot = join(context.base, "action-evidence", options.id);
  try {
    if (existsSync(actionRoot)) throw new Error(`action evidence directory already exists: ${actionRoot}`);
    mkdirSync(actionRoot, { recursive: true, mode: 0o700 });
    const branch = currentBranch(context.repository);
    const beforeHygiene = captureActionHygiene(context.repository, { now });
    if (beforeHygiene.processes.status !== "complete") {
      throw new Error(
        `action begin requires a complete physical process census; observed ${beforeHygiene.processes.status}: `
        + beforeHygiene.processes.errors.join("; "),
      );
    }
    if (!equal(beforeHygiene.git.repository_object, before)
      || beforeHygiene.git.head.target !== `refs/heads/${branch}`) {
      throw new Error("repository object or named branch changed while capturing the action hygiene boundary");
    }
    const beforeHygieneRef = writeEvidenceRecord(
      context,
      `action-evidence/${options.id}/hygiene/before.json`,
      beforeHygiene as unknown as JsonObject,
    );
    const frozenPublicSafety = originalInputPath(context, "public_safety", "public_safety_denylist");
    const frozenSemantic = originalInputPath(context, "semantic_boundary", "semantic_probe_manifest");
    const frozenSemanticEvidencePackage = originalInputPath(
      context,
      "semantic_boundary",
      "semantic_evidence_package",
    );
    const frozenSemanticTrustPolicy = originalInputPath(
      context,
      "semantic_boundary",
      "semantic_trust_policy",
    );
    const pre = await prepareSnapshot(
      context,
      join(actionRoot, "pre-snapshot"),
      "pre",
      options.runtimeAttestation,
      now,
      {
        ...(frozenPublicSafety === undefined ? {} : { publicSafety: frozenPublicSafety }),
        ...(frozenSemantic === undefined ? {} : { semantic: frozenSemantic }),
        ...(frozenSemanticEvidencePackage === undefined ? {} : {
          semanticEvidencePackage: frozenSemanticEvidencePackage,
        }),
        ...(frozenSemanticTrustPolicy === undefined ? {} : {
          semanticTrustPolicy: frozenSemanticTrustPolicy,
        }),
        executeSemantic: semanticExecutionEnabled(context),
      },
    );
    if (!equal(pre.repositoryObject, before)) throw new Error("repository changed while capturing the action pre-state");
    const baselineCoverage = object(context.regression.detector_coverage, "$.regression.detector_coverage");
    if (!equal(pre.detectorCoverage.run_policy, baselineCoverage.run_policy)) {
      throw new Error("pre-state detector applicability differs from the bundle's frozen registered policy");
    }
    if (pre.detectorCoverage.runtime_identity_sha256 !== baselineCoverage.runtime_identity_sha256) {
      throw new Error("pre-state detector runtime differs from the bundle's validated runtime identity");
    }
    const priorControl = loadNativeControl(context.base, object(context.bundle.successor_readiness, "$.successor_readiness").native_gate_control);
    const priorClosingObservationIds = array(
      object(
        object(context.regression.accounting, "$.regression.accounting").observation_ledger,
        "$.regression.accounting.observation_ledger",
      ).closing_observation_ids,
      "$.regression.accounting.observation_ledger.closing_observation_ids",
    ) as string[];
    const freshPreObservationIds = [...new Set([
      ...detectorObservationIds(pre.detectorCoverage),
      ...nativeObservationIds(pre.nativeDiscovery, pre.nativeCoverage),
    ])].sort();
    if (pre.nativeDiscovery.catalog_sha256 !== priorControl.discovery.catalog_sha256
      || !equal(pre.nativeDiscovery.required_gate_ids, priorControl.discovery.required_gate_ids)
      || controlCatalogErrors(priorControl, { control: pre.nativeControl, discovery: pre.nativeDiscovery, coverage: pre.nativeCoverage }).length > 0
      || !equal(nativeObservationIds(priorControl.discovery, priorControl.coverage), nativeObservationIds(pre.nativeDiscovery, pre.nativeCoverage))) {
      throw new Error("pre-state native-gate catalog or failure observations drifted from the prior validated boundary");
    }
    if (!equal(freshPreObservationIds, priorClosingObservationIds)) {
      throw new Error(
        "fresh pre-state observations do not equal the prior causal-accounting boundary; "
        + "action begin refuses detector drift that would require unproved baseline-replay or external-change attribution",
      );
    }
    const preInputs = {
      ...(originalInputPath(context, "public_safety", "public_safety_denylist") === undefined ? {} : {
        public_safety: portablePath(context.base, originalInputPath(context, "public_safety", "public_safety_denylist") as string),
      }),
      ...(originalInputPath(context, "semantic_boundary", "semantic_probe_manifest") === undefined ? {} : {
        semantic: portablePath(context.base, originalInputPath(context, "semantic_boundary", "semantic_probe_manifest") as string),
      }),
      ...(originalInputPath(context, "semantic_boundary", "semantic_evidence_package") === undefined ? {} : {
        semantic_evidence_package: portablePath(
          context.base,
          originalInputPath(context, "semantic_boundary", "semantic_evidence_package") as string,
        ),
      }),
      ...(originalInputPath(context, "semantic_boundary", "semantic_trust_policy") === undefined ? {} : {
        semantic_trust_policy: portablePath(
          context.base,
          originalInputPath(context, "semantic_boundary", "semantic_trust_policy") as string,
        ),
      }),
    };
    const ownerIdentity = text(object(lock.owner, "action lock owner").identity, "action lock owner identity");
    const assigned = actionCoordination(
      context,
      options.id,
      debt,
      options.target,
      before,
      branch,
      openedAt,
      ownerIdentity,
    );
    const action: JsonObject = {
      id: options.id,
      debt_key: options.debtKey,
      kind,
      target: options.target,
      purpose: options.purpose,
      hygiene_contract: ACTION_HYGIENE_CONTRACT,
      risk: CONSEQUENT_ACTION_KINDS.has(options.kind) ? "consequential_external" : "reversible_local",
      authorization: {
        state: "granted",
        source: object(context.manifest.authorization_basis, "$.manifest.authorization_basis").source,
        ref: object(context.manifest.authorization_basis, "$.manifest.authorization_basis").ref,
      },
      preconditions: [
        `root debt ${options.debtKey} is unresolved`,
        `full repository object ${before.sha256} equals the prior validated boundary`,
        `physical repository/process state ${beforeHygiene.physical_state_sha256} is stably captured`,
        `evidence home is locked by action ${options.id}`,
      ],
      verification: [
        "rerun every frozen registered detector against the post-action repository object",
        "rerun repository-native gates when the full repository object changes",
        "prove the action created no ref, stash, worktree, ignored-path, Git-control, or process hygiene regression",
        "derive observation and root-debt accounting and live-validate the updated closure bundle",
      ],
      status: "planned",
      ...assigned.actionFields,
    };
    const lifecycle: LifecycleRecord = {
      record_type: "mister-clean.action-lifecycle",
      schema_version: "1.0",
      state: "open",
      action,
      owner: object(clone(lock.owner), "action lock owner"),
      opened_at: openedAt,
      before_repository_object: before,
      frozen_detector_policy: {
        registry_version: baselineCoverage.registry_version,
        registry_sha256: baselineCoverage.registry_sha256,
        run_policy: clone(baselineCoverage.run_policy),
        run_policy_sha256: baselineCoverage.run_policy_sha256,
        runtime_identity_sha256: baselineCoverage.runtime_identity_sha256,
        required_detector_ids: clone(baselineCoverage.required_detector_ids),
        inputs: preInputs,
        execute_semantic: semanticExecutionEnabled(context),
      },
      pre_snapshot: {
        directory: pre.prefix,
        bundle_ref: digestRef(context.base, `${pre.prefix}/closure-bundle.json`),
        regression_ref: digestRef(context.base, `${pre.prefix}/regression-delta.json`),
      },
      action_hygiene: {
        contract: ACTION_HYGIENE_CONTRACT,
        primary_branch: branch,
        before_ref: beforeHygieneRef,
      },
      prior_boundary_native_gate_control: clone(object(
        object(context.bundle.successor_readiness, "$.successor_readiness").native_gate_control,
        "$.successor_readiness.native_gate_control",
      )),
    };
    replaceJson(lifecyclePath(context, options.id), lifecycle);
    const report = clone(context.report);
    const manifest = clone(context.manifest);
    report.actions = [...array(report.actions, "$.report.actions"), clone(action)];
    manifest.actions = [...array(manifest.actions, "$.manifest.actions"), clone(action)];
    manifest.coordination = assigned.coordination;
    manifest.execution_state = "authorized";
    const bundle = rehashBundle(context.bundle, report, manifest, context.base);
    lock.bundle_sha256 = digestBytes(jsonBytes(bundle));
    replaceJson(lockPath(context), lock);
    await transactionalWrite(context, { report, manifest, bundle }, options.runtimeAttestation);
    return {
      actionId: options.id,
      bundleDirectory: context.base,
      bundlePath: context.bundlePath,
      repositoryObject: before,
      state: "open",
    };
  } catch (error) {
    rmSync(lockPath(context), { force: true });
    rmSync(actionRoot, { force: true, recursive: true });
    throw error;
  }
}

export async function finishAction(options: ActionFinishOptions): Promise<ActionLifecycleResult> {
  if (!ACTION_ID.test(options.id)) throw new Error("--id must match [A-Za-z0-9][A-Za-z0-9._-]{0,127}");
  const context = loadContext(options.bundleDirectory);
  const lock = verifyLock(context, options.id);
  if (lock.bundle_sha256 !== sha256File(context.bundlePath)) {
    throw new Error("the locked evidence home changed after action begin; finish refuses an unowned bundle mutation");
  }
  await requireValidBundle(context, options.runtimeAttestation, false);
  const lifecycle = readJson(lifecyclePath(context, options.id)) as LifecycleRecord;
  if (lifecycle.record_type !== "mister-clean.action-lifecycle" || lifecycle.state !== "open") {
    throw new Error(`action ${options.id} does not have a matching open lifecycle record`);
  }
  const action = object(lifecycle.action, "lifecycle.action");
  if (action.id !== options.id || action.status !== "planned") throw new Error(`action ${options.id} is not the matching planned action`);
  if (action.hygiene_contract !== ACTION_HYGIENE_CONTRACT) {
    throw new Error(`action ${options.id} does not carry the required ${ACTION_HYGIENE_CONTRACT} contract`);
  }
  const hygieneBoundary = object(lifecycle.action_hygiene, "lifecycle.action_hygiene");
  if (hygieneBoundary.contract !== ACTION_HYGIENE_CONTRACT) {
    throw new Error(`action ${options.id} lifecycle hygiene contract is missing or unsupported`);
  }
  const primaryBranch = text(hygieneBoundary.primary_branch, "lifecycle.action_hygiene.primary_branch");
  const beforeHygiene = readActionHygieneSnapshot(
    context,
    hygieneBoundary.before_ref,
    "lifecycle.action_hygiene.before_ref",
  );
  if (lock.debt_key !== action.debt_key
    || !equal(lock.owner, lifecycle.owner)
    || !equal(lock.repository_object, lifecycle.before_repository_object)) {
    throw new Error(`action ${options.id} lock, lifecycle intent, and repository boundary do not agree`);
  }
  const manifestAction = array(context.manifest.actions, "$.manifest.actions")
    .map((raw, index) => object(raw, `$.manifest.actions[${index}]`))
    .find((row) => row.id === options.id);
  if (!manifestAction || !equal(manifestAction, action)) throw new Error(`action ${options.id} differs from the locked lifecycle intent`);
  ensureCleanWorkingTree(context.repository);
  const before = lifecycle.before_repository_object;
  if (!equal(beforeHygiene.git.repository_object, before)) {
    throw new Error("action hygiene pre-state does not equal the locked repository-object boundary");
  }
  const currentBoundary = object(context.regression.closing_repository_object, "$.regression.closing_repository_object");
  if (!equal(before, currentBoundary)) throw new Error("open action no longer begins at the bundle's current repository-object boundary");
  const afterObject = captureRepositoryObject(context.repository);
  const now = options.now ?? (() => new Date());
  const observedAt = now().toISOString();
  const pre = lifecycleSnapshot(context, lifecycle);
  const inputs = finishInputs(context, lifecycle);
  const attemptId = `post-${randomUUID()}`;
  const post = await prepareSnapshot(
    context,
    join(context.base, "action-evidence", options.id, "finish-attempts", attemptId),
    "post",
    options.runtimeAttestation,
    now,
    inputs,
  );
  if (!equal(post.repositoryObject, afterObject)) throw new Error("repository changed while capturing the action post-state");
  const frozen = object(lifecycle.frozen_detector_policy, "lifecycle.frozen_detector_policy");
  if (!frozenDetectorPolicyEqual(post.detectorCoverage.run_policy, frozen.run_policy)) {
    throw new Error("registered detector policy or scope changed across the action; this lifecycle cannot rewrite the frozen comparator policy safely");
  }
  if (post.detectorCoverage.runtime_identity_sha256 !== frozen.runtime_identity_sha256) {
    throw new Error("post-state detector runtime differs from the frozen action runtime identity");
  }
  const priorNative = loadNativeControl(context.base, lifecycle.prior_boundary_native_gate_control);
  const postNative: NativeControlEvidence = {
    control: rebasedControl(post),
    discovery: post.nativeDiscovery,
    coverage: post.nativeCoverage,
  };
  const changed = !equal(before, afterObject);
  const catalogErrors = changed ? controlCatalogErrors(priorNative, postNative) : [];
  if (catalogErrors.length > 0) {
    throw new Error(`closed action would weaken repository-native gates:\n${catalogErrors.join("\n")}`);
  }
  if (!changed && !equal(
    nativeObservationIds(priorNative.discovery, priorNative.coverage),
    nativeObservationIds(post.nativeDiscovery, post.nativeCoverage),
  )) {
    throw new Error("repository-native gate observations changed without a repository-object change; the boundary is nondeterministic and cannot be closed automatically");
  }

  const comparatorEvidence = comparatorRecords(context, pre, post, options.id);
  const beforeDetectorIds = detectorObservationIds(pre.detectorCoverage);
  const afterDetectorIds = detectorObservationIds(post.detectorCoverage);
  if (!changed && !equal(beforeDetectorIds, afterDetectorIds)) {
    throw new Error("registered detector observations changed without a repository-object change; the boundary is nondeterministic and cannot be closed automatically");
  }
  const beforeNativeIds = nativeObservationIds(priorNative.discovery, priorNative.coverage);
  const afterNativeIds = changed
    ? nativeObservationIds(post.nativeDiscovery, post.nativeCoverage)
    : beforeNativeIds;
  const actionObservationRefs = new Map(comparatorEvidence.afterObservationRefs);
  const postNativeCoverageRef = rebaseDigestRefs(clone(post.nativeControl.coverage_ref), post.prefix) as unknown as JsonObject;
  for (const id of afterNativeIds) actionObservationRefs.set(id, postNativeCoverageRef);
  const derived = deriveActionObservationSets(options.id, [
    { phase: "before", observation_ids: [...beforeDetectorIds, ...beforeNativeIds] },
    { phase: "after", observation_ids: [...afterDetectorIds, ...afterNativeIds] },
  ]);
  if (options.status === "closed" && derived.open_at_boundary_observation_ids.length > 0) {
    throw new Error(`closed action refused: ${derived.open_at_boundary_observation_ids.length} action-introduced observation(s) remain open`);
  }
  if (options.status === "interrupted" && derived.open_at_boundary_observation_ids.length === 0) {
    throw new Error("interrupted requires at least one action-introduced observation at the boundary; use closed when the action caused no open regression");
  }

  const afterHygiene = captureActionHygiene(context.repository, { now });
  if (!equal(afterHygiene.git.repository_object, afterObject)) {
    throw new Error("action hygiene post-state does not equal the detector-validated repository-object boundary");
  }
  const hygieneDelta: ActionHygieneDelta = deriveActionHygieneDelta(beforeHygiene, afterHygiene, primaryBranch);
  const afterHygieneRef = writeEvidenceRecord(
    context,
    `${post.prefix}/action-hygiene/after.json`,
    afterHygiene as unknown as JsonObject,
  );
  const hygieneDeltaRef = writeEvidenceRecord(
    context,
    `${post.prefix}/action-hygiene/delta.json`,
    hygieneDelta as unknown as JsonObject,
  );
  if (hygieneDelta.violations.length > 0) {
    throw new Error(
      "action hygiene boundary refused cleanup-created debt: "
      + hygieneDelta.violations.map((row) => `${row.code}:${row.key}`).join(", "),
    );
  }
  const hygieneEvidence: ActionHygieneEvidence = {
    contract: ACTION_HYGIENE_CONTRACT,
    primary_branch: primaryBranch,
    verdict: "NO_HARM",
    violation_count: 0,
    before_ref: object(hygieneBoundary.before_ref, "lifecycle.action_hygiene.before_ref"),
    after_ref: afterHygieneRef,
    delta_ref: hygieneDeltaRef,
  };

  const rows = mergeRootDebts(
    context,
    lifecycle,
    pre,
    post,
    derived.closing_observation_ids,
    actionObservationRefs,
    options.status,
    observedAt,
  );
  const targetRow = rows.find((row) => row.debt_key === lock.debt_key);
  if (options.status === "closed" && targetRow?.state !== "satisfied") {
    throw new Error(`closed action did not pay its targeted root debt ${String(lock.debt_key)}`);
  }

  const actionResult = writeActionResult(context, lifecycle, afterObject, options.status, observedAt, hygieneEvidence);
  const finalAction = clone(action);
  finalAction.status = options.status === "closed" ? "executed" : "failed";
  finalAction.after_object = afterObject.sha256;
  finalAction.action_hygiene = hygieneEvidence;
  finalAction.outcome = { state: "verified", evidence: [actionResult] };
  const actions = array(context.manifest.actions, "$.manifest.actions").map((raw, index) => {
    const row = object(raw, `$.manifest.actions[${index}]`);
    return row.id === options.id ? clone(finalAction) : clone(row);
  });
  const regression = clone(context.regression);
  const check: JsonObject = {
    before_object: before.sha256,
    before_repository_object: before,
    after_object: afterObject.sha256,
    after_repository_object: afterObject,
    comparators: comparatorEvidence.records,
    action_hygiene: hygieneEvidence,
    ...derived,
    boundary_status: options.status,
    observed_at: observedAt,
    ...(changed ? { native_gate_control: rebasedControl(post) } : {}),
  };
  regression.closing_object = afterObject.sha256;
  regression.closing_repository_object = afterObject;
  regression.action_checks = [...array(regression.action_checks, "$.regression.action_checks"), check];
  const detectorCoverage = object(regression.detector_coverage, "$.regression.detector_coverage");
  detectorCoverage.finding_fingerprints = [...new Set([
    ...array(detectorCoverage.finding_fingerprints, "$.regression.detector_coverage.finding_fingerprints") as string[],
    ...comparatorEvidence.records.flatMap((rawComparator) => (
      array(object(rawComparator, "action comparator").observations, "action comparator observations")
        .flatMap((rawObservation) => (
          array(object(rawObservation, "action comparator observation").finding_fingerprints, "action comparator fingerprints") as string[]
        ))
    )),
  ])].sort();
  if (changed && regression.baseline_native_gate_control === undefined) {
    regression.baseline_native_gate_control = clone(lifecycle.prior_boundary_native_gate_control);
  }
  const baselineIds = array(object(object(regression.accounting, "$.regression.accounting").observation_ledger, "$.regression.accounting.observation_ledger").baseline_observation_ids, "baseline_observation_ids") as string[];
  regression.accounting = deriveRegressionAccounting({
    repo_id: text(object(context.report.repo, "$.report.repo").id, "$.report.repo.id"),
    baseline_observation_ids: baselineIds,
    closing_observation_ids: derived.closing_observation_ids,
    action_observations: [...actionRows(context.regression), derived],
    root_debts: rows as unknown as RootDebtAccountingRow[],
  });

  const report = rebaseDigestRefs(clone(post.report), post.prefix);
  report.actions = clone(actions);
  report.completion_debts = rows;
  report.verdict = "NOT_CLEAN";
  report.regression_control = {
    policy: regression.policy,
    baseline_object: regression.baseline_object,
    baseline_repository_object: regression.baseline_repository_object,
    closing_object: regression.closing_object,
    closing_repository_object: regression.closing_repository_object,
    accounting_schema: "1.5",
    evidence_ref: { path: portablePath(context.base, context.regressionPath), sha256: digestBytes(jsonBytes(regression)) },
  };
  updateDebtCensus(report, rows);
  const manifest = clone(context.manifest);
  manifest.repo = { id: object(report.repo, "post.report.repo").id, commit: object(report.repo, "post.report.repo").commit };
  manifest.actions = clone(actions);
  const terminalStatuses = new Set(["executed", "failed", "blocked", "skipped"]);
  manifest.execution_state = actions.every((row) => terminalStatuses.has(String(object(row, "action").status)))
    ? "executed"
    : "authorized";
  object(manifest.coordination, "$.manifest.coordination").target = clone(object(object(post.manifest.coordination, "post.manifest.coordination").target, "post.manifest.coordination.target"));
  finishCoordination(manifest, text(finalAction.lane_id, "action.lane_id"), options.status);

  const bundle = clone(context.bundle);
  bundle.custody = {
    mode: "sidecar",
    subject_commit: object(report.repo, "post.report.repo").commit,
    evidence_root: null,
    evidence_paths: [],
  };
  bundle.change_inventory = changeMap(context, lifecycle, before, afterObject);
  bundle.planning_discovery = clone(post.bundle.planning_discovery);
  bundle.successor_readiness = postSuccessor(context, post);
  const hashedBundle = rehashBundle(bundle, report, manifest, context.base);
  const finalLifecycle = clone(lifecycle);
  finalLifecycle.state = options.status;
  finalLifecycle.action = finalAction;
  finalLifecycle.finished_at = observedAt;
  finalLifecycle.after_repository_object = afterObject;
  finalLifecycle.action_hygiene = {
    ...clone(hygieneBoundary),
    after_ref: afterHygieneRef,
    delta_ref: hygieneDeltaRef,
    verdict: "NO_HARM",
  };
  finalLifecycle.final_bundle_sha256 = digestBytes(jsonBytes(hashedBundle));
  await transactionalWrite(context, {
    report,
    manifest,
    regression,
    bundle: hashedBundle,
    sidecars: [{ path: lifecyclePath(context, options.id), value: finalLifecycle }],
  }, options.runtimeAttestation);
  rmSync(lockPath(context), { force: true });
  return {
    actionId: options.id,
    bundleDirectory: context.base,
    bundlePath: context.bundlePath,
    repositoryObject: afterObject,
    state: options.status,
  };
}
