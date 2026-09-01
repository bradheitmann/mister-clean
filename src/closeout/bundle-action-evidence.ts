/** Action hygiene, native-gate custody, and successor liveness validation. */
import { findPlaceholders } from "./records.js";
import {
  assertActionHygieneDelta,
  assertActionHygieneProcessCensus,
  assertActionHygieneSnapshot,
  successorProcessRows,
  type ActionHygieneDelta,
  type ActionHygieneProcessCensus,
  type ActionHygieneSnapshot,
} from "./action-hygiene.js";
import {
  nativeGateFailureObservations,
  type NativeGateCoverage,
  type NativeGateDiscovery,
} from "./native-gates.js";
import { validateNativeGateCoverage } from "./native-gate-validation.js";
import {
  canonicalObservationId,
  canonicalRootDebtKey,
} from "./regression-accounting.js";
import { sortedUnique } from "./detector-coverage.js";
import type { RepositoryObject } from "./repository-object.js";
import {
  HEX64,
  array,
  contained,
  evidenceRef,
  executedText,
  identity,
  iso,
  object,
  owned,
  requireExactObject,
  requireObject,
  stableEqual,
  text,
  validateRepositoryObject,
  type EvidenceClock,
  type FilePort,
  type GitPort,
  type JsonObject,
} from "./bundle-runtime.js";
import type { CanonicalRootProjection } from "./bundle-detector-evidence.js";

export interface NativeGateControlEvidence {
  readonly control: JsonObject;
  readonly discovery: NativeGateDiscovery;
  readonly coverage: NativeGateCoverage;
  readonly validation: JsonObject;
  readonly evidence_root: string;
  readonly coverage_ref: JsonObject;
}

export function nativeGateRootProjections(
  evidence: NativeGateControlEvidence,
  repoId: string,
): { observation_ids: string[]; roots: CanonicalRootProjection[] } {
  const observationIds: string[] = [];
  const roots: CanonicalRootProjection[] = [];
  for (const projection of nativeGateFailureObservations(evidence.discovery, evidence.coverage)) {
    const observationId = canonicalObservationId({
      source_id: projection.source_id,
      source_native_fingerprint: projection.source_native_fingerprint,
    });
    observationIds.push(observationId);
    roots.push({
      debt_key: canonicalRootDebtKey({
        repo_id: repoId,
        normalizer: projection.normalizer,
        cause_key: projection.cause_key,
      }),
      normalizer: projection.normalizer,
      cause_key: projection.cause_key,
      observation_ids: [observationId],
    });
  }
  return { observation_ids: sortedUnique(observationIds), roots };
}

export function validateNativeGateCatalogTransition(
  before: NativeGateControlEvidence,
  after: NativeGateControlEvidence,
  path: string,
  errors: string[],
): void {
  const afterById = new Map(after.discovery.gates.map((gate) => [gate.id, gate]));
  for (const beforeGate of before.discovery.gates) {
    if (beforeGate.disposition !== "required") continue;
    const afterGate = afterById.get(beforeGate.id);
    if (!afterGate) {
      errors.push(`${path}.discovery_ref: required native gate ${JSON.stringify(beforeGate.id)} disappeared across the action boundary`);
      continue;
    }
    if (afterGate.disposition !== "required") {
      errors.push(`${path}.discovery_ref: required native gate ${JSON.stringify(beforeGate.id)} was weakened to ${afterGate.disposition}`);
    }
    if (afterGate.kind !== beforeGate.kind) {
      errors.push(`${path}.discovery_ref: native gate ${JSON.stringify(beforeGate.id)} changed kind from ${beforeGate.kind} to ${afterGate.kind}`);
    }
    if (afterGate.semantic_contract_sha256 !== beforeGate.semantic_contract_sha256) {
      errors.push(`${path}.discovery_ref: native gate ${JSON.stringify(beforeGate.id)} changed its semantic contract; ordinary cleanup cannot weaken or rewrite repository quality policy`);
    }
  }
}

export const ACTION_HYGIENE_CONTRACT = "mister-clean.action-hygiene/1.0";

export const GATE_KINDS = new Set([
  "isolated_clone", "repository_tests", "lint", "typecheck", "build",
  "planning_validation", "security_scan", "established_ci", "negative_control",
]);

export const EXTERNAL_CLAIMS = new Set(["ci_green_on_push", "deployed", "independently_qa_accepted"]);

export async function validateActionHygieneEvidence(
  action: JsonObject,
  evidence: JsonObject,
  actionResult: JsonObject,
  path: string,
  base: string,
  files: FilePort,
  allowPlaceholders: boolean,
  clock: EvidenceClock | undefined,
  errors: string[],
): Promise<void> {
  if (action.hygiene_contract !== ACTION_HYGIENE_CONTRACT) return;
  const keys = [
    "contract", "primary_branch", "verdict", "violation_count",
    "before_ref", "after_ref", "delta_ref",
  ] as const;
  const hygiene = requireExactObject(evidence.hygiene, keys, `${path}.hygiene`, errors);
  if (!hygiene) return;
  if (!stableEqual(action.action_hygiene, hygiene)) {
    errors.push(`${path}.hygiene: must equal the canonical action hygiene summary`);
  }
  if (!stableEqual(actionResult.hygiene, hygiene)) {
    errors.push(`${path}.evidence_ref.hygiene: must equal the bound outcome hygiene summary`);
  }
  if (hygiene.contract !== ACTION_HYGIENE_CONTRACT) {
    errors.push(`${path}.hygiene.contract: expected ${ACTION_HYGIENE_CONTRACT}`);
  }
  if (!text(hygiene.primary_branch) || String(hygiene.primary_branch).startsWith("refs/")) {
    errors.push(`${path}.hygiene.primary_branch: required short branch name`);
  }
  if (hygiene.verdict !== "NO_HARM") errors.push(`${path}.hygiene.verdict: expected NO_HARM`);
  if (hygiene.violation_count !== 0) errors.push(`${path}.hygiene.violation_count: terminal action requires zero`);

  const beforeRecord = await evidenceRef(
    files, base, hygiene.before_ref, `${path}.hygiene.before_ref`, errors,
    allowPlaceholders, clock, "mister-clean.action-hygiene-snapshot",
  );
  const afterRecord = await evidenceRef(
    files, base, hygiene.after_ref, `${path}.hygiene.after_ref`, errors,
    allowPlaceholders, clock, "mister-clean.action-hygiene-snapshot",
  );
  const deltaRecord = await evidenceRef(
    files, base, hygiene.delta_ref, `${path}.hygiene.delta_ref`, errors,
    allowPlaceholders, clock, "mister-clean.action-hygiene-delta",
  );
  if (!beforeRecord || !afterRecord || !deltaRecord || allowPlaceholders) return;
  try {
    const before = beforeRecord as unknown as ActionHygieneSnapshot;
    const after = afterRecord as unknown as ActionHygieneSnapshot;
    const delta = deltaRecord as unknown as ActionHygieneDelta;
    assertActionHygieneSnapshot(before, `${path}.hygiene.before_ref`);
    assertActionHygieneSnapshot(after, `${path}.hygiene.after_ref`);
    assertActionHygieneDelta(delta, before, after, `${path}.hygiene.delta_ref`);
    if (delta.primary_branch !== hygiene.primary_branch) {
      errors.push(`${path}.hygiene.delta_ref.primary_branch: must equal hygiene.primary_branch`);
    }
    if (delta.violations.length !== hygiene.violation_count || delta.violations.length !== 0) {
      errors.push(`${path}.hygiene.delta_ref.violations: terminal action requires an exact empty violation set`);
    }
    if (before.git.repository_object.sha256 !== action.before_object) {
      errors.push(`${path}.hygiene.before_ref: repository object must equal action.before_object`);
    }
    if (after.git.repository_object.sha256 !== action.after_object) {
      errors.push(`${path}.hygiene.after_ref: repository object must equal action.after_object`);
    }
    const changed = before.git.repository_object.sha256 !== after.git.repository_object.sha256;
    if (delta.repository_object_changed !== changed) {
      errors.push(`${path}.hygiene.delta_ref.repository_object_changed: disagrees with bound snapshots`);
    }
  } catch (error) {
    errors.push(`${path}.hygiene: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function validateBoundExecutionRecords(
  bundle: JsonObject, report: JsonObject, manifest: JsonObject, repo: string | undefined,
  git: GitPort, base: string, files: FilePort, allowPlaceholders: boolean,
  clock: EvidenceClock | undefined, errors: string[],
): Promise<void> {
  for (const [index, raw] of array(manifest.actions).entries()) {
    const action = object(raw);
    if (!action) continue;
    const outcomeEvidence = array(object(action.outcome)?.evidence);
    if ((action.status === "executed" || action.status === "failed")
      && action.hygiene_contract === ACTION_HYGIENE_CONTRACT
      && outcomeEvidence.length !== 1) {
      errors.push(`$.manifest.actions[${JSON.stringify(action.id)}].outcome.evidence: action hygiene contract requires exactly one bound result`);
    }
    for (const [evidenceIndex, rawEvidence] of outcomeEvidence.entries()) {
      const evidence = object(rawEvidence);
      if (!evidence) continue;
      const epath = `$.manifest.actions[${JSON.stringify(action.id)}].outcome.evidence[${evidenceIndex}]`;
      const record = await evidenceRef(files, base, evidence.evidence_ref, `${epath}.evidence_ref`, errors, allowPlaceholders, clock, "mister-clean.action-result");
      if (record && !allowPlaceholders) {
        const expected = {
          action_id: action.id, kind: action.kind, target: action.target,
          object: evidence.object, command: evidence.command, result: evidence.result,
          observed_at: evidence.observed_at,
        };
        for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${epath}: bound result disagrees on ${key}`);
        await validateActionHygieneEvidence(
          action, evidence, record, epath, base, files, allowPlaceholders, clock, errors,
        );
      }
    }
  }

  for (const [index, raw] of array(report.completion_debts).entries()) {
    const debt = object(raw);
    if (!debt) continue;
    if (debt.state === "satisfied") {
      for (const [evidenceIndex, rawEvidence] of array(debt.evidence).entries()) {
        const evidence = object(rawEvidence);
        if (!evidence) continue;
        const epath = `$.report.completion_debts[${index}].evidence[${evidenceIndex}]`;
        const record = await evidenceRef(files, base, evidence.evidence_ref, `${epath}.evidence_ref`, errors, allowPlaceholders, clock, "mister-clean.debt-result");
        if (record && !allowPlaceholders) {
          const expected = {
            debt_id: debt.id, kind: evidence.kind, object: evidence.object,
            command: evidence.command, result: evidence.result, observed_at: evidence.observed_at,
          };
          for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${epath}: bound debt result disagrees on ${key}`);
        }
      }
    }
    if (debt.state === "accepted_exception") {
      const exception = object(debt.exception) ?? {};
      const epath = `$.report.completion_debts[${index}].exception.ref`;
      const record = await evidenceRef(files, base, exception.ref, epath, errors, allowPlaceholders, clock, "mister-clean.operator-ruling");
      if (record && !allowPlaceholders) {
        for (const field of ["actor", "at", "scope", "rationale"] as const) if (record[field] !== exception[field]) errors.push(`${epath}: ruling disagrees on ${field}`);
        if (record.debt_id !== debt.id) errors.push(`${epath}: ruling debt_id mismatch`);
        if (record.request_sha256 !== object(bundle.criteria_discovery)?.request_sha256) errors.push(`${epath}: ruling must bind the exact operative request`);
      }
    }
  }

  for (const [name, raw] of Object.entries(object(report.claims) ?? {})) {
    const claim = object(raw);
    if (claim?.state !== "established") continue;
    for (const [index, rawEvidence] of array(claim.evidence).entries()) {
      const evidence = object(rawEvidence);
      if (!evidence) continue;
      const epath = `$.report.claims.${name}.evidence[${index}]`;
      if (name === "committed_locally") {
        if (repo && !allowPlaceholders && (await git.run(repo, ["cat-file", "-e", `${String(evidence.commit ?? "")}^{commit}`], [0, 128])).code !== 0) errors.push(`${epath}: commit does not exist in live repository`);
      } else if (name === "pushed" && evidence.kind === "remote_ref_resolution") {
        if (repo && !allowPlaceholders) {
          const result = await git.run(repo, ["ls-remote", String(evidence.remote ?? ""), String(evidence.ref ?? "")], [0, 2, 128]);
          const observed = result.stdout.split("\n").filter(Boolean)[0]?.split(/\s+/, 1)[0] ?? "";
          if (observed !== evidence.commit || evidence.commit !== object(report.repo)?.commit) errors.push(`${epath}: live remote resolution does not establish the subject commit`);
        }
      } else if (EXTERNAL_CLAIMS.has(name)) {
        errors.push(`${epath}: local closure bundles cannot establish external claim ${name}; use not_established/not_applicable until a trusted adapter is configured`);
      }
    }
  }
}

export async function validateNativeGateControlRecord(
  controlValue: unknown,
  path: string,
  closingRepositoryObject: JsonObject | undefined,
  base: string,
  files: FilePort,
  requirePassing: boolean,
  required: boolean,
  allowPlaceholders: boolean,
  clock: EvidenceClock | undefined,
  errors: string[],
): Promise<NativeGateControlEvidence | undefined> {
  if (controlValue === undefined) {
    if (required) errors.push(`${path}: requires repository-native gate discovery and execution evidence`);
    return undefined;
  }
  const control = requireObject(controlValue, [
    "discovery_ref", "coverage_ref", "validation_ref", "evidence_root",
    "required_count", "passed_count", "absent_count", "validation_error_count",
  ], path, errors);
  if (!control) return undefined;
  for (const field of ["required_count", "passed_count", "absent_count", "validation_error_count"] as const) {
    if (!Number.isInteger(control[field]) || Number(control[field]) < 0) {
      errors.push(`${path}.${field}: required nonnegative integer`);
    }
  }
  const evidenceRootPlaceholder = allowPlaceholders
    && findPlaceholders(control.evidence_root, `${path}.evidence_root`).length > 0;
  const evidenceRoot = evidenceRootPlaceholder
    ? undefined
    : await contained(files, base, control.evidence_root);
  if (!evidenceRoot && !evidenceRootPlaceholder) {
    errors.push(`${path}.evidence_root: must resolve inside the bundle directory`);
  }
  const discovery = await evidenceRef(
    files, base, control.discovery_ref, `${path}.discovery_ref`, errors,
    allowPlaceholders, clock, "mister-clean.native-gate-discovery",
  );
  const coverage = await evidenceRef(
    files, base, control.coverage_ref, `${path}.coverage_ref`, errors,
    allowPlaceholders, clock, "mister-clean.native-gate-coverage",
  );
  const validation = await evidenceRef(
    files, base, control.validation_ref, `${path}.validation_ref`, errors,
    allowPlaceholders, clock, "mister-clean.native-gate-validation",
  );
  if (allowPlaceholders || !discovery || !coverage || !validation || !evidenceRoot || !closingRepositoryObject) return undefined;

  const typedDiscovery = discovery as unknown as NativeGateDiscovery;
  const typedCoverage = coverage as unknown as NativeGateCoverage;
  if (control.required_count !== array(discovery.required_gate_ids).length) {
    errors.push(`${path}.required_count: must equal native discovery required_gate_ids length`);
  }
  const passedCount = array(coverage.executions).filter((row) => object(row)?.state === "passed").length;
  if (control.passed_count !== passedCount) errors.push(`${path}.passed_count: must equal native coverage passed executions`);
  const absentCount = array(discovery.gates).filter((row) => object(row)?.disposition === "absent").length;
  if (control.absent_count !== absentCount) errors.push(`${path}.absent_count: must equal native discovery absent gates`);
  if (validation.discovery_sha256 !== discovery.catalog_sha256) {
    errors.push(`${path}.validation_ref: discovery_sha256 must bind native discovery`);
  }
  if (validation.coverage_sha256 !== coverage.coverage_sha256) {
    errors.push(`${path}.validation_ref: coverage_sha256 must bind native coverage`);
  }
  const recordedValidationErrors = array(validation.errors);
  if (control.validation_error_count !== recordedValidationErrors.length) {
    errors.push(`${path}.validation_error_count: must equal native validation errors length`);
  }
  if (validation.status !== (recordedValidationErrors.length === 0 ? "pass" : "fail")) {
    errors.push(`${path}.validation_ref.status: disagrees with recorded errors`);
  }
  try {
    const nativeErrors = await validateNativeGateCoverage(
      typedCoverage,
      typedDiscovery,
      closingRepositoryObject as unknown as RepositoryObject,
      evidenceRoot,
      {
        ...(clock ? { validation_time: new Date(clock.latestEventTimeMs) } : {}),
        require_passing: requirePassing,
      },
    );
    for (const error of nativeErrors) errors.push(`${path}: ${error}`);
  } catch (error) {
    errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (requirePassing) {
    if (recordedValidationErrors.length > 0) errors.push(`${path}.validation_ref: passing boundary requires zero recorded native-gate validation errors`);
    if (control.required_count !== control.passed_count) errors.push(`${path}: passing boundary requires every required native gate to pass`);
    if (control.absent_count !== 0) errors.push(`${path}.absent_count: passing boundary requires zero absent native gates`);
  }
  const coverageRef = object(control.coverage_ref);
  if (!coverageRef || typeof coverageRef.path !== "string" || typeof coverageRef.sha256 !== "string") return undefined;
  return {
    control,
    discovery: typedDiscovery,
    coverage: typedCoverage,
    validation,
    evidence_root: evidenceRoot,
    coverage_ref: { path: coverageRef.path, sha256: coverageRef.sha256 },
  };
}

export async function validateNativeGateControl(
  successor: JsonObject,
  closingRepositoryObject: JsonObject | undefined,
  base: string,
  files: FilePort,
  clean: boolean,
  allowPlaceholders: boolean,
  clock: EvidenceClock | undefined,
  errors: string[],
): Promise<void> {
  if (clean && successor.native_gate_control === undefined) {
    errors.push("$.successor_readiness.native_gate_control: CLEAN requires repository-native gate discovery and execution evidence");
    return;
  }
  await validateNativeGateControlRecord(
    successor.native_gate_control,
    "$.successor_readiness.native_gate_control",
    closingRepositoryObject,
    base,
    files,
    clean,
    clean,
    allowPlaceholders,
    clock,
    errors,
  );
}

async function validateSuccessorSnapshots(
  successor: JsonObject, regressionControl: JsonObject | undefined, requiresRepositoryObjects: boolean,
  path: string, base: string, files: FilePort, clean: boolean, allowPlaceholders: boolean,
  clock: EvidenceClock | undefined, errors: string[],
): Promise<void> {
  const snapshots = requireObject(successor.snapshots, ["start", "end"], `${path}.snapshots`, errors);
  if (snapshots) {
    for (const name of ["start", "end"] as const) {
      const snapshot = requireObject(
        snapshots[name],
        ["kind", "object", ...(requiresRepositoryObjects ? ["repository_object", "commit"] : []), "command", "result", "observed_at"],
        `${path}.snapshots.${name}`,
        errors,
      );
      if (!snapshot) continue;
      if (snapshot.kind !== "repository_snapshot") errors.push(`${path}.snapshots.${name}.kind: expected repository_snapshot`);
      for (const field of ["object", "command", "result"] as const) if (!text(snapshot[field])) errors.push(`${path}.snapshots.${name}.${field}: required`);
      if (requiresRepositoryObjects) {
        const repositoryObject = validateRepositoryObject(
          snapshot.repository_object,
          `${path}.snapshots.${name}.repository_object`,
          errors,
          snapshot.object,
        );
        if (snapshot.result !== snapshot.object) errors.push(`${path}.snapshots.${name}.result: must equal repository-object SHA-256`);
        if (repositoryObject && snapshot.commit !== repositoryObject.head_commit) {
          errors.push(`${path}.snapshots.${name}.commit: must equal repository_object.head_commit`);
        }
        const expectedRepositoryObject = name === "start"
          ? regressionControl?.baseline_repository_object
          : regressionControl?.closing_repository_object;
        if (repositoryObject && expectedRepositoryObject && !stableEqual(repositoryObject, expectedRepositoryObject)) {
          errors.push(`${path}.snapshots.${name}.repository_object: must equal report regression-control repository object`);
        }
      }
      if (!allowPlaceholders && !executedText(snapshot.command)) errors.push(`${path}.snapshots.${name}.command: must describe an executed observation, not an assertion`);
      if (!allowPlaceholders && !iso(snapshot.observed_at)) errors.push(`${path}.snapshots.${name}.observed_at: required ISO-8601 timestamp`);
    }
  }
  await validateNativeGateControl(
    successor,
    object(object(snapshots?.end)?.repository_object),
    base,
    files,
    clean,
    allowPlaceholders,
    clock,
    errors,
  );
}

async function validateSuccessorTarget(
  successor: JsonObject, path: string, base: string, files: FilePort,
  allowPlaceholders: boolean, clock: EvidenceClock | undefined, errors: string[],
): Promise<void> {
  const observation = requireObject(successor.target_observation, ["kind", "local_ref", "commit", "observed_at"], `${path}.target_observation`, errors);
  if (observation) {
    if (!new Set(["remote_ref_resolution", "local_ref_resolution"]).has(String(observation.kind))) errors.push(`${path}.target_observation.kind: unsupported`);
    if (!text(observation.local_ref)) errors.push(`${path}.target_observation.local_ref: required`);
    if (!text(observation.commit)) errors.push(`${path}.target_observation.commit: required`);
    if (!allowPlaceholders && !iso(observation.observed_at)) errors.push(`${path}.target_observation.observed_at: required ISO-8601 timestamp`);
    if (observation.kind === "remote_ref_resolution") {
      for (const field of ["remote", "remote_ref"] as const) if (!text(observation[field])) errors.push(`${path}.target_observation.${field}: required`);
    } else if (observation.kind === "local_ref_resolution") {
      await evidenceRef(files, base, observation.policy_evidence, `${path}.target_observation.policy_evidence`, errors, allowPlaceholders, clock, "mister-clean.local-target-policy");
    }
  }
}

async function validateSuccessorTopology(
  bundle: JsonObject, successor: JsonObject, path: string, base: string, files: FilePort,
  clean: boolean, allowPlaceholders: boolean, clock: EvidenceClock | undefined, errors: string[],
): Promise<void> {
  const topology = requireObject(successor.topology, ["worktrees", "branches", "remote_refs", "stashes", "processes", "dirty", "unowned", "unmerged", "blocking_processes"], `${path}.topology`, errors);
  if (topology) {
    for (const field of ["worktrees", "branches", "remote_refs", "stashes", "processes"] as const) {
      if (!Array.isArray(topology[field])) errors.push(`${path}.topology.${field}: required array`);
    }
    if (topology.process_census_ref !== undefined || clean) {
      const censusRecord = await evidenceRef(
        files,
        base,
        topology.process_census_ref,
        `${path}.topology.process_census_ref`,
        errors,
        allowPlaceholders,
        clock,
        "mister-clean.action-hygiene-process-census",
      );
      if (censusRecord && !allowPlaceholders) {
        try {
          const census = censusRecord as unknown as ActionHygieneProcessCensus;
          assertActionHygieneProcessCensus(census, `${path}.topology.process_census_ref`);
          const expectedProcesses = successorProcessRows(census);
          if (!stableEqual(topology.processes, expectedProcesses)) {
            errors.push(`${path}.topology.processes: must equal the bound process-census projection`);
          }
        } catch (error) {
          errors.push(`${path}.topology.process_census_ref: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    let reportedUnowned = 0;
    const specs = {
      worktrees: ["path", "head", "branch", "dirty_count", "owner", "purpose", "disposition"],
      branches: ["name", "commit", "merged", "owner", "purpose", "disposition"],
      remote_refs: ["name", "commit", "merged", "owner", "purpose", "disposition"],
    } as const;
    for (const [field, fields] of Object.entries(specs) as [keyof typeof specs, readonly string[]][]) {
      for (const [index, raw] of array(topology[field]).entries()) {
        const rpath = `${path}.topology.${field}[${index}]`;
        const row = requireObject(raw, fields, rpath, errors);
        if (!row) continue;
        if (!owned(row.owner)) { reportedUnowned += 1; if (clean) errors.push(`${rpath}.owner: CLEAN requires a named owner`); }
        for (const key of ["purpose", "disposition"] as const) if (!text(row[key])) errors.push(`${rpath}.${key}: required`);
        if (field === "worktrees") {
          if (!Number.isInteger(row.dirty_count) || Number(row.dirty_count) < 0) errors.push(`${rpath}.dirty_count: required nonnegative integer`);
          if (clean && Number(row.dirty_count) > 0) {
            errors.push(`${rpath}: unresolved topology row prevents CLEAN`);
            const record = await evidenceRef(files, base, row.policy_ref, `${rpath}.policy_ref`, errors, allowPlaceholders, clock, "mister-clean.topology-policy");
            if (record && !allowPlaceholders) {
              const expected = {
                surface: field, identity: row.path, commit: row.head,
                request_sha256: object(bundle.criteria_discovery)?.request_sha256,
              };
              for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${rpath}.policy_ref: bound topology ruling disagrees on ${key}`);
              for (const key of ["actor", "scope", "rationale", "next_action"] as const) if (!text(record[key])) errors.push(`${rpath}.policy_ref: topology ruling requires ${key}`);
            }
          }
        } else {
          if (typeof row.merged !== "boolean") errors.push(`${rpath}.merged: required boolean`);
          if (clean && row.merged === false) {
            errors.push(`${rpath}: unresolved topology row prevents CLEAN`);
            const record = await evidenceRef(files, base, row.policy_ref, `${rpath}.policy_ref`, errors, allowPlaceholders, clock, "mister-clean.topology-policy");
            if (record && !allowPlaceholders) {
              const expected = {
                surface: field, identity: row.name, commit: row.commit,
                request_sha256: object(bundle.criteria_discovery)?.request_sha256,
              };
              for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${rpath}.policy_ref: bound topology ruling disagrees on ${key}`);
              for (const key of ["actor", "scope", "rationale", "next_action"] as const) if (!text(record[key])) errors.push(`${rpath}.policy_ref: topology ruling requires ${key}`);
            }
          }
        }
      }
    }
    for (const [index, raw] of array(topology.processes).entries()) {
      const ppath = `${path}.topology.processes[${index}]`;
      const process = requireObject(raw, ["identity", "owner", "purpose", "disposition", "blocking"], ppath, errors);
      if (!process) continue;
      if (!text(process.identity)) errors.push(`${ppath}.identity: required`);
      if (!owned(process.owner)) { reportedUnowned += 1; if (clean) errors.push(`${ppath}.owner: CLEAN requires a named owner`); }
      for (const field of ["purpose", "disposition"] as const) if (!text(process[field])) errors.push(`${ppath}.${field}: required`);
      if (typeof process.blocking !== "boolean") errors.push(`${ppath}.blocking: required boolean`);
    }
    for (const field of ["dirty", "unowned", "unmerged", "blocking_processes"] as const) {
      if (!Number.isInteger(topology[field]) || Number(topology[field]) < 0) errors.push(`${path}.topology.${field}: required nonnegative integer`);
      else if (clean && topology[field] !== 0) errors.push(`${path}.topology.${field}: CLEAN requires zero`);
    }
    const reportedBlocking = array(topology.processes).filter((raw) => object(raw)?.blocking === true).length;
    if (topology.blocking_processes !== reportedBlocking) errors.push(`${path}.topology.blocking_processes: must equal blocking process rows (${reportedBlocking})`);
    if (topology.unowned !== reportedUnowned) errors.push(`${path}.topology.unowned: must equal unowned topology rows (${reportedUnowned})`);
    if (clean && array(topology.stashes).length) errors.push(`${path}.topology.stashes: CLEAN requires zero stashes`);
  }
}

async function validateSuccessorCurrentState(
  successor: JsonObject, path: string, base: string, files: FilePort,
  clean: boolean, allowPlaceholders: boolean, clock: EvidenceClock | undefined, errors: string[],
): Promise<void> {
  const currentPath = `${path}.current_state`;
  const current = requireObject(successor.current_state, ["state", "path", "sha256", "commit", "generator", "designation"], currentPath, errors);
  if (current) {
    if (!new Set(["missing", "candidate_unverified", "designated"]).has(String(current.state))) errors.push(`${currentPath}.state: unsupported`);
    if (!text(current.commit) || !text(current.generator)) errors.push(`${currentPath}: commit and generator are required`);
    if (clean && current.state !== "designated") errors.push(`${currentPath}.state: CLEAN requires designated`);
    if (current.state === "missing") {
      if (current.path !== null || current.sha256 !== null || current.designation !== null) errors.push(`${currentPath}: missing state requires null path, sha256, and designation`);
    } else {
      if (!text(current.path)) errors.push(`${currentPath}.path: required`);
      if (!allowPlaceholders && (typeof current.sha256 !== "string" || !HEX64.test(current.sha256))) errors.push(`${currentPath}.sha256: required lowercase SHA-256`);
      if (current.state === "candidate_unverified" && current.designation !== null) errors.push(`${currentPath}.designation: candidate_unverified requires null`);
      if (current.state === "designated") {
        const record = await evidenceRef(files, base, current.designation, `${currentPath}.designation`, errors, allowPlaceholders, clock, "mister-clean.current-state-designation");
        if (record && !allowPlaceholders) {
          for (const field of ["path", "sha256", "commit"] as const) if (record[field] !== current[field]) errors.push(`${currentPath}.designation: bound designation disagrees on ${field}`);
        }
      }
    }
  }
}

async function validateSuccessorGates(
  report: JsonObject, successor: JsonObject, path: string, base: string, files: FilePort,
  clean: boolean, allowPlaceholders: boolean, clock: EvidenceClock | undefined, errors: string[],
): Promise<void> {
  if (!Array.isArray(successor.gates)) errors.push(`${path}.gates: required array`);
  const gates = array(successor.gates);
  if (clean && gates.length === 0) errors.push(`${path}.gates: CLEAN requires nonempty array`);
  for (const [index, raw] of gates.entries()) {
    const gpath = `${path}.gates[${index}]`;
    const gate = requireObject(raw, ["id", "kind", "object", "command", "expected_status", "observed_status", "semantic_status", "verified", "total", "warnings", "debt", "skipped", "evidence_ref"], gpath, errors);
    if (!gate) continue;
    for (const field of ["id", "kind", "object", "command"] as const) if (!text(gate[field])) errors.push(`${gpath}.${field}: required`);
    if (!GATE_KINDS.has(String(gate.kind))) errors.push(`${gpath}.kind: unsupported gate kind`);
    if (!allowPlaceholders && !executedText(gate.command)) errors.push(`${gpath}.command: must describe an executed gate`);
    for (const field of ["expected_status", "observed_status"] as const) if (!Number.isInteger(gate[field])) errors.push(`${gpath}.${field}: required integer`);
    for (const field of ["verified", "total", "warnings", "debt", "skipped"] as const) if (!Number.isInteger(gate[field]) || Number(gate[field]) < 0) errors.push(`${gpath}.${field}: required nonnegative integer`);
    if (clean && gate.expected_status !== gate.observed_status) errors.push(`${gpath}: observed_status must equal expected_status`);
    if (clean && gate.semantic_status !== "pass") errors.push(`${gpath}.semantic_status: CLEAN requires pass`);
    if (clean && gate.total === 0) errors.push(`${gpath}.total: zero-scope gate cannot establish CLEAN`);
    if (clean && gate.verified !== gate.total) errors.push(`${gpath}: verified must equal total`);
    for (const field of ["warnings", "debt", "skipped"] as const) if (clean && gate[field] !== 0) errors.push(`${gpath}.${field}: CLEAN requires zero`);
    const record = await evidenceRef(files, base, gate.evidence_ref, `${gpath}.evidence_ref`, errors, allowPlaceholders, clock, "mister-clean.gate-result");
    if (record && !allowPlaceholders) {
      const expected = {
        gate_id: gate.id, object: gate.object, command: gate.command,
        observed_status: gate.observed_status, semantic_status: gate.semantic_status,
        verified: gate.verified, total: gate.total, warnings: gate.warnings,
        debt: gate.debt, skipped: gate.skipped,
      };
      for (const [key, value] of Object.entries(expected)) if (record[key] !== value) errors.push(`${gpath}.evidence_ref: bound gate record disagrees on ${key}`);
      if (!iso(record.observed_at)) errors.push(`${gpath}.evidence_ref: gate record requires timezone-aware observed_at`);
    }
  }
  if (clean && !gates.some((raw) => { const gate = object(raw); return gate?.kind === "isolated_clone" && gate.object === object(report.repo)?.commit; })) errors.push(`${path}.gates: CLEAN requires an isolated_clone gate bound to the subject commit`);
}

async function validateSuccessorDebris(
  successor: JsonObject, path: string, base: string, files: FilePort,
  clean: boolean, allowPlaceholders: boolean, clock: EvidenceClock | undefined, errors: string[],
): Promise<void> {
  const debris = requireObject(successor.debris, ["removed", "retained", "unclassified", "evidence"], `${path}.debris`, errors);
  if (debris) {
    for (const field of ["removed", "retained", "unclassified"] as const) {
      if (!Number.isInteger(debris[field]) || Number(debris[field]) < 0) errors.push(`${path}.debris.${field}: required nonnegative integer`);
    }
    if (clean && debris.unclassified !== 0) errors.push(`${path}.debris.unclassified: CLEAN requires zero`);
    if (!Array.isArray(debris.evidence) || array(debris.evidence).length === 0) errors.push(`${path}.debris.evidence: required`);
    else {
      for (const [index, ref] of array(debris.evidence).entries()) {
        const record = await evidenceRef(files, base, ref, `${path}.debris.evidence[${index}]`, errors, allowPlaceholders, clock, "mister-clean.debris-census");
        if (record && !allowPlaceholders) for (const field of ["removed", "retained", "unclassified"] as const) {
          if (record[field] !== debris[field]) errors.push(`${path}.debris.evidence[${index}]: bound debris record disagrees on ${field}`);
        }
      }
    }
  }
}

async function validateSuccessorHandoff(
  successor: JsonObject, path: string, clean: boolean, errors: string[],
): Promise<void> {
  const handoff = requireObject(successor.handoff, ["entrypoints", "next_owner", "next_action"], `${path}.handoff`, errors);
  if (handoff) {
    if (!Array.isArray(handoff.entrypoints) || !array(handoff.entrypoints).every(text)) errors.push(`${path}.handoff.entrypoints: required string array`);
    else if (clean && array(handoff.entrypoints).length === 0) errors.push(`${path}.handoff.entrypoints: CLEAN requires at least one entrypoint`);
    for (const field of ["next_owner", "next_action"] as const) if (!text(handoff[field])) errors.push(`${path}.handoff.${field}: required`);
  }
}

async function validateSuccessorFinalReview(
  bundle: JsonObject, report: JsonObject, successor: JsonObject, path: string, base: string, files: FilePort,
  clean: boolean, allowPlaceholders: boolean, clock: EvidenceClock | undefined, errors: string[],
): Promise<void> {
  const review = requireObject(successor.final_review, ["mechanism", "status", "reviewer", "implementer", "reviewer_execution", "implementer_execution", "criteria_reviewed", "planning_reviewed", "findings_total", "findings_paid", "unresolved", "evidence_ref"], `${path}.final_review`, errors);
  if (review) {
    for (const field of ["mechanism", "reviewer", "implementer"] as const) if (!text(review[field])) errors.push(`${path}.final_review.${field}: required`);
    if (identity(review.reviewer) && identity(review.reviewer) === identity(review.implementer)) errors.push(`${path}.final_review: reviewer must differ from implementer`);
    const executionIdentities: unknown[][] = [];
    for (const field of ["reviewer_execution", "implementer_execution"] as const) {
      const execution = requireObject(review[field], ["harness", "session_id", "receipt_id"], `${path}.final_review.${field}`, errors);
      if (!execution) continue;
      for (const key of ["harness", "session_id", "receipt_id"] as const) if (!text(execution[key])) errors.push(`${path}.final_review.${field}.${key}: required`);
      executionIdentities.push([identity(execution.harness), identity(execution.session_id), identity(execution.receipt_id)]);
    }
    if (executionIdentities.length === 2 && stableEqual(executionIdentities[0], executionIdentities[1])) errors.push(`${path}.final_review: reviewer and implementer require distinct execution identities`);
    for (const field of ["criteria_reviewed", "planning_reviewed"] as const) {
      if (typeof review[field] !== "boolean") errors.push(`${path}.final_review.${field}: required boolean`);
      else if (clean && review[field] !== true) errors.push(`${path}.final_review.${field}: CLEAN requires true`);
    }
    if (clean && review.status !== "passed") errors.push(`${path}.final_review.status: CLEAN requires passed`);
    for (const field of ["findings_total", "findings_paid", "unresolved"] as const) if (!Number.isInteger(review[field]) || Number(review[field]) < 0) errors.push(`${path}.final_review.${field}: required nonnegative integer`);
    if (clean && review.unresolved !== 0) errors.push(`${path}.final_review.unresolved: CLEAN requires zero`);
    if (clean && review.findings_total !== review.findings_paid) errors.push(`${path}.final_review: findings_total must equal findings_paid`);
    const record = await evidenceRef(files, base, review.evidence_ref, `${path}.final_review.evidence_ref`, errors, allowPlaceholders, clock, "mister-clean.independent-review");
    if (record && !allowPlaceholders) {
      const criteria = object(bundle.criteria_discovery);
      const planning = object(bundle.planning_discovery);
      const expected = {
        mechanism: review.mechanism, status: review.status,
        reviewer: review.reviewer, implementer: review.implementer,
        reviewer_execution: review.reviewer_execution,
        implementer_execution: review.implementer_execution,
        candidate_commit: object(report.repo)?.commit,
        criteria_ids: criteria?.criteria_ids,
        planning_system_ids: array(planning?.systems).map((item) => object(item)?.id).filter((item) => item !== undefined),
        findings_total: review.findings_total, findings_paid: review.findings_paid,
        unresolved: review.unresolved,
      };
      for (const [key, value] of Object.entries(expected)) if (!stableEqual(record[key], value)) errors.push(`${path}.final_review.evidence_ref: bound review record disagrees on ${key}`);
      if (!iso(record.observed_at)) errors.push(`${path}.final_review.evidence_ref: review record requires timezone-aware observed_at`);
    }
  }
}

export async function validateSuccessor(
  bundle: JsonObject, report: JsonObject, base: string, files: FilePort,
  clean: boolean, allowPlaceholders: boolean, clock: EvidenceClock | undefined, errors: string[],
): Promise<void> {
  const path = "$.successor_readiness";
  const successor = requireObject(bundle.successor_readiness, ["snapshots", "target_observation", "topology", "current_state", "gates", "debris", "handoff", "final_review"], path, errors);
  if (!successor) return;
  const regressionControl = object(report.regression_control);
  const requiresRepositoryObjects = clean || regressionControl?.baseline_repository_object !== undefined
    || regressionControl?.closing_repository_object !== undefined;
  await validateSuccessorSnapshots(successor, regressionControl, requiresRepositoryObjects, path, base, files, clean, allowPlaceholders, clock, errors);
  await validateSuccessorTarget(successor, path, base, files, allowPlaceholders, clock, errors);
  await validateSuccessorTopology(bundle, successor, path, base, files, clean, allowPlaceholders, clock, errors);
  await validateSuccessorCurrentState(successor, path, base, files, clean, allowPlaceholders, clock, errors);
  await validateSuccessorGates(report, successor, path, base, files, clean, allowPlaceholders, clock, errors);
  await validateSuccessorDebris(successor, path, base, files, clean, allowPlaceholders, clock, errors);
  await validateSuccessorHandoff(successor, path, clean, errors);
  await validateSuccessorFinalReview(bundle, report, successor, path, base, files, clean, allowPlaceholders, clock, errors);
}
