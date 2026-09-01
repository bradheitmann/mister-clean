/** Schema, clock, evidence-byte, and closing-object validation for native gates. */
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import type { RepositoryObject } from "./repository-object.js";
import {
  COVERAGE_RECORD_TYPE,
  HEX64,
  NATIVE_GATE_FAILURE_REASONS,
  NATIVE_GATE_KINDS,
  NATIVE_GATE_STATES,
  SCHEMA_VERSION,
  digestFile,
  errorMessage,
  identity,
  record,
  repositoryRelation,
  stableEqual,
  validateCommand,
  validateDiscoveryIntegrity,
  validateExactKeys,
  validatePortablePath,
  validateRepositoryObjectSchema,
  withoutField,
  type NativeGateCoverage,
  type NativeGateDefinition,
  type NativeGateDiscovery,
  type NativeGateExecutionState,
  type NativeGateFailureReason,
  type NativeGateKind,
  type NativeGateSubjectState,
  type ValidateNativeGateOptions,
} from "./native-gates.js";

export function validateSubjectState(value: unknown, label: string, errors: string[]): value is NativeGateSubjectState {
  const before = errors.length;
  const raw = validateExactKeys(value, [
    "record_type", "schema_version", "repository_object", "refs_sha256",
    "stash_sha256", "worktree_topology_sha256", "state_sha256",
  ], label, errors);
  if (!raw) return false;
  if (raw.record_type !== "mister-clean.native-gate-subject-state") errors.push(`${label}.record_type is invalid`);
  if (raw.schema_version !== "1.0") errors.push(`${label}.schema_version is invalid`);
  validateRepositoryObjectSchema(raw.repository_object, `${label}.repository_object`, errors);
  for (const field of ["refs_sha256", "stash_sha256", "worktree_topology_sha256"] as const) {
    if (typeof raw[field] !== "string" || !HEX64.test(raw[field] as string)) errors.push(`${label}.${field} is invalid`);
  }
  if (raw.state_sha256 !== identity(withoutField(raw, "state_sha256"))) errors.push(`${label}.state_sha256 mismatch`);
  return errors.length === before;
}

export async function validateOutputRef(
  value: unknown,
  label: string,
  evidenceRoot: string,
): Promise<readonly string[]> {
  const errors: string[] = [];
  const raw = validateExactKeys(value, ["path", "sha256", "byte_count", "complete"], label, errors);
  if (!raw) return errors;
  if (typeof raw.path !== "string") return [...errors, `${label}.path: required string`];
  try {
    validatePortablePath(raw.path, label);
  } catch (error) {
    return [`${label}.path: ${errorMessage(error)}`];
  }
  const absolute = resolve(evidenceRoot, raw.path);
  try {
    repositoryRelation(evidenceRoot, absolute);
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) return [`${label}.path: must reference a regular non-symlink file`];
    const actual = await realpath(absolute);
    repositoryRelation(evidenceRoot, actual);
    if (!Number.isSafeInteger(raw.byte_count) || Number(raw.byte_count) < 0) errors.push(`${label}.byte_count: invalid`);
    else if (stat.size !== raw.byte_count) errors.push(`${label}.byte_count: does not match evidence bytes`);
    if (typeof raw.sha256 !== "string" || !HEX64.test(raw.sha256)) errors.push(`${label}.sha256: invalid`);
    else if (await digestFile(actual) !== raw.sha256) errors.push(`${label}.sha256: digest mismatch`);
    if (typeof raw.complete !== "boolean") errors.push(`${label}.complete: required boolean`);
  } catch (error) {
    errors.push(`${label}.path: cannot validate evidence (${errorMessage(error)})`);
  }
  return errors;
}

export function validClock(value: string): number | undefined {
  if (typeof value !== "string") return undefined;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value ? milliseconds : undefined;
}

export async function validateNativeGateCoverage(
  coverage: NativeGateCoverage,
  discovery: NativeGateDiscovery,
  closingRepositoryObject: RepositoryObject,
  evidenceDirectory: string,
  options: ValidateNativeGateOptions = {},
): Promise<readonly string[]> {
  const errors: string[] = [...validateDiscoveryIntegrity(discovery)];
  const requirePassing = options.require_passing ?? true;
  const discoveryGates = Array.isArray(discovery.gates)
    ? discovery.gates.filter((gate): gate is NativeGateDefinition => record(gate) !== undefined)
    : [];
  const discoveryRequiredIds = Array.isArray(discovery.required_gate_ids)
    ? discovery.required_gate_ids.filter((id): id is string => typeof id === "string")
    : [];
  const rawCoverage = validateExactKeys(coverage, [
    "record_type", "schema_version", "discovery_sha256", "closing_repository_object",
    "required_gate_ids", "executions", "coverage_sha256",
  ], "coverage", errors);
  if (!rawCoverage) return errors;
  if (rawCoverage.record_type !== COVERAGE_RECORD_TYPE) errors.push("coverage.record_type is invalid");
  if (rawCoverage.schema_version !== SCHEMA_VERSION) errors.push("coverage.schema_version is invalid");
  if (typeof rawCoverage.discovery_sha256 !== "string" || !HEX64.test(rawCoverage.discovery_sha256)) {
    errors.push("coverage.discovery_sha256 is invalid");
  } else if (rawCoverage.discovery_sha256 !== discovery.catalog_sha256) {
    errors.push("coverage discovery_sha256 does not match the current discovery");
  }
  if (!Array.isArray(rawCoverage.required_gate_ids)
    || rawCoverage.required_gate_ids.some((id) => typeof id !== "string")
    || !stableEqual(rawCoverage.required_gate_ids, discovery.required_gate_ids)) {
    errors.push("coverage.required_gate_ids does not match discovery");
  }
  if (!stableEqual(discovery.repository_object, closingRepositoryObject)) {
    errors.push("discovery.repository_object does not match the requested closing object");
  }
  if (rawCoverage.coverage_sha256 !== identity(withoutField(rawCoverage, "coverage_sha256"))) {
    errors.push("coverage.coverage_sha256 mismatch");
  }
  const validClosingObject = validateRepositoryObjectSchema(
    rawCoverage.closing_repository_object,
    "coverage.closing_repository_object",
    errors,
  );
  validateRepositoryObjectSchema(closingRepositoryObject, "requested_closing_repository_object", errors);
  if (validClosingObject && !stableEqual(rawCoverage.closing_repository_object, closingRepositoryObject)) {
    errors.push("coverage.closing_repository_object does not match the requested closing object");
  }
  for (const gate of discoveryGates) {
    if (requirePassing && gate.disposition === "absent") {
      errors.push(`discovery gate ${JSON.stringify(gate.id)} is absent: ${gate.basis}`);
    }
  }

  let evidenceRoot: string | undefined;
  try {
    evidenceRoot = await realpath(resolve(evidenceDirectory));
    const evidenceStat = await lstat(evidenceRoot);
    if (!evidenceStat.isDirectory() || evidenceStat.isSymbolicLink()) {
      errors.push("evidence directory must be a real directory");
      evidenceRoot = undefined;
    }
  } catch (error) {
    errors.push(`evidence directory is unavailable: ${errorMessage(error)}`);
  }
  const validationTime = (options.validation_time ?? new Date()).getTime();
  if (!Number.isFinite(validationTime)) errors.push("validation_time is invalid");
  const futureSkew = options.max_future_skew_ms ?? 5 * 60 * 1_000;
  if (!Number.isSafeInteger(futureSkew) || futureSkew < 0) errors.push("max_future_skew_ms is invalid");

  const byId = new Map<string, Record<string, unknown>[]>();
  if (!Array.isArray(rawCoverage.executions)) errors.push("coverage.executions must be an array");
  for (const [index, value] of (Array.isArray(rawCoverage.executions) ? rawCoverage.executions : []).entries()) {
    const label = `coverage.executions[${String(index)}]`;
    const execution = validateExactKeys(value, [
      "gate_id", "kind", "isolation", "state", "failure_reason", "command", "command_sha256",
      "resolved_executable", "executable_sha256", "started_at", "finished_at",
      "start_repository_object", "end_repository_object", "subject_start_state", "subject_end_state",
      "exit_code", "signal", "stdout_ref", "stderr_ref",
    ], label, errors);
    if (!execution) continue;
    if (typeof execution.gate_id !== "string" || !/^[a-z0-9][a-z0-9:._-]*$/u.test(execution.gate_id)) {
      errors.push(`${label}.gate_id is invalid`);
      continue;
    }
    const entries = byId.get(execution.gate_id) ?? [];
    entries.push(execution);
    byId.set(execution.gate_id, entries);
    if (!discoveryRequiredIds.includes(execution.gate_id)) {
      errors.push(`execution ${JSON.stringify(execution.gate_id)} is not a required discovery gate`);
    }
  }

  for (const gate of discoveryGates) {
    if (gate.disposition !== "required" || !gate.command) continue;
    const executions = byId.get(gate.id) ?? [];
    if (executions.length !== 1) {
      errors.push(`required gate ${JSON.stringify(gate.id)} must have exactly one execution`);
      continue;
    }
    const execution = executions[0]!;
    const label = `execution[${JSON.stringify(gate.id)}]`;
    if (typeof execution.kind !== "string" || !NATIVE_GATE_KINDS.has(execution.kind as NativeGateKind)) {
      errors.push(`${label}.kind is invalid`);
    }
    if (execution.kind !== gate.kind) errors.push(`${label}.kind does not match discovery`);
    if (execution.isolation !== "disposable_exact_object_snapshot") errors.push(`${label}.isolation is invalid`);
    validateCommand(execution.command, `${label}.command`, errors);
    if (!stableEqual(execution.command, gate.command)) errors.push(`${label}.command does not match discovery`);
    if (execution.command_sha256 !== identity(execution.command)) errors.push(`${label}.command_sha256 mismatch`);
    if (typeof execution.state !== "string" || !NATIVE_GATE_STATES.has(execution.state as NativeGateExecutionState)) {
      errors.push(`${label}.state is invalid`);
    }
    if (requirePassing && execution.state !== "passed") errors.push(`${label}: required gate did not pass (${execution.state})`);
    const reason = execution.failure_reason;
    if (reason !== null && (typeof reason !== "string" || !NATIVE_GATE_FAILURE_REASONS.has(reason as NativeGateFailureReason))) {
      errors.push(`${label}.failure_reason is invalid`);
    }
    if (execution.state === "passed") {
      if (reason !== null) errors.push(`${label}.failure_reason must be null for passed gate`);
      if (execution.exit_code !== 0 || execution.signal !== null) errors.push(`${label}: passed gate must exit zero without signal`);
      if (record(execution.stdout_ref)?.complete !== true) errors.push(`${label}.stdout_ref.complete must be true for passed gate`);
      if (record(execution.stderr_ref)?.complete !== true) errors.push(`${label}.stderr_ref.complete must be true for passed gate`);
    } else if (execution.state === "skipped") {
      if (reason !== "operator_skip") errors.push(`${label}.failure_reason must be operator_skip for skipped gate`);
    } else if (execution.state === "timed_out") {
      if (reason !== "timeout") errors.push(`${label}.failure_reason must be timeout for timed_out gate`);
    } else if (execution.state === "failed") {
      if (!new Set(["repository_mutated", "output_limit_exceeded", "nonzero_exit", "terminated_by_signal"]).has(String(reason))) {
        errors.push(`${label}.failure_reason is not valid for failed state`);
      }
    } else if (execution.state === "blocked") {
      if (!new Set([
        "repository_object_mismatch", "invalid_cwd", "executable_unavailable", "executable_unreadable",
        "snapshot_unavailable", "subject_repository_changed", "spawn_error", "process_cleanup_failed",
      ]).has(String(reason))) {
        errors.push(`${label}.failure_reason is not valid for blocked state`);
      }
    }
    if (execution.exit_code !== null && (!Number.isSafeInteger(execution.exit_code) || Number(execution.exit_code) < 0)) {
      errors.push(`${label}.exit_code is invalid`);
    }
    if (execution.signal !== null && (typeof execution.signal !== "string" || !/^[A-Z][A-Z0-9]+$/u.test(execution.signal))) {
      errors.push(`${label}.signal is invalid`);
    }
    if (reason === "nonzero_exit"
      && (!Number.isSafeInteger(execution.exit_code) || Number(execution.exit_code) === 0 || execution.signal !== null)) {
      errors.push(`${label}: nonzero_exit requires a nonzero exit code and no signal`);
    }
    if (reason === "terminated_by_signal" && execution.signal === null) {
      errors.push(`${label}: terminated_by_signal requires a signal`);
    }
    if (reason === "operator_skip" && (execution.exit_code !== null || execution.signal !== null)) {
      errors.push(`${label}: operator_skip cannot carry a process result`);
    }
    const validStart = validateRepositoryObjectSchema(execution.start_repository_object, `${label}.start_repository_object`, errors);
    if (validStart && !stableEqual(execution.start_repository_object, closingRepositoryObject)) {
      errors.push(`${label}.start_repository_object does not match the closing object`);
    }
    const validEnd = validateRepositoryObjectSchema(execution.end_repository_object, `${label}.end_repository_object`, errors);
    if (validEnd) {
      const mutated = !stableEqual(execution.end_repository_object, closingRepositoryObject);
      if (reason === "repository_mutated" ? !mutated : mutated) {
        errors.push(`${label}.end_repository_object disagrees with failure_reason`);
      }
    }
    const validSubjectStart = validateSubjectState(execution.subject_start_state, `${label}.subject_start_state`, errors);
    const validSubjectEnd = validateSubjectState(execution.subject_end_state, `${label}.subject_end_state`, errors);
    if (validSubjectStart && !stableEqual(
      (execution.subject_start_state as NativeGateSubjectState).repository_object,
      closingRepositoryObject,
    )) {
      errors.push(`${label}.subject_start_state does not bind the closing object`);
    }
    if (validSubjectStart && validSubjectEnd) {
      const subjectChanged = !stableEqual(execution.subject_start_state, execution.subject_end_state);
      if (reason === "subject_repository_changed" ? !subjectChanged : subjectChanged) {
        errors.push(`${label}.subject state transition disagrees with failure_reason`);
      }
    }
    const started = validClock(execution.started_at as string);
    const finished = validClock(execution.finished_at as string);
    if (started === undefined) errors.push(`${label}.started_at is not canonical ISO time`);
    if (finished === undefined) errors.push(`${label}.finished_at is not canonical ISO time`);
    if (started !== undefined && finished !== undefined && started > finished) errors.push(`${label}: clock order is invalid`);
    if (started !== undefined && started > validationTime + futureSkew) errors.push(`${label}.started_at is in the future`);
    if (finished !== undefined && finished > validationTime + futureSkew) errors.push(`${label}.finished_at is in the future`);
    const hasExecutable = typeof execution.resolved_executable === "string" && isAbsolute(execution.resolved_executable);
    const hasExecutableDigest = typeof execution.executable_sha256 === "string" && HEX64.test(execution.executable_sha256);
    if (execution.resolved_executable !== null && !hasExecutable) errors.push(`${label}.resolved_executable is invalid`);
    if (execution.executable_sha256 !== null && !hasExecutableDigest) errors.push(`${label}.executable_sha256 is invalid`);
    if (hasExecutable !== hasExecutableDigest) errors.push(`${label}: executable path and digest must be present together`);
    if (execution.state !== "blocked" && execution.state !== "skipped" && (!hasExecutable || !hasExecutableDigest)) {
      errors.push(`${label}: an executed gate requires executable provenance`);
    }
    if (evidenceRoot) {
      errors.push(...await validateOutputRef(execution.stdout_ref, `${label}.stdout_ref`, evidenceRoot));
      errors.push(...await validateOutputRef(execution.stderr_ref, `${label}.stderr_ref`, evidenceRoot));
    }
  }
  return errors;
}
