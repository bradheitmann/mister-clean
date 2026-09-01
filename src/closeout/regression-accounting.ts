import { createHash } from "node:crypto";

/**
 * Regression accounting has two deliberately different identity spaces:
 * detector/native observations and normalized completion debts. An observation
 * can change without creating a new root debt, and several observations can be
 * evidence for one debt. Keeping the ledgers separate prevents count arithmetic
 * from silently comparing unlike units.
 */

export const OBSERVATION_IDENTITY_SCHEME = "mister-clean.observation.v1" as const;
export const ROOT_DEBT_IDENTITY_SCHEME = "mister-clean.root-debt.v1" as const;
export const REGRESSION_ACCOUNTING_SCHEMA_VERSION = "1.5" as const;
/**
 * `repo_id` is supplied by the integration layer and included without
 * transformation in the canonical UTF-8 preimage. This module deliberately
 * does not case-fold, Unicode-normalize, resolve, or infer it. A caller changing
 * the spelling has selected a different identity domain.
 */
export const ROOT_DEBT_IDENTITY_CONTRACT = Object.freeze({
  scheme: ROOT_DEBT_IDENTITY_SCHEME,
  repo_id: "exact_opaque_utf8_no_normalization",
  preimage: "[scheme,repo_id,normalizer,cause_key]",
} as const);

const SHA256 = /^[0-9a-f]{64}$/;
const SOURCE_ID = /^[a-z0-9][a-z0-9._:/@+~-]{0,255}$/;
const STABLE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/@+~-]{0,255}$/;
const NORMALIZER_ID = /^[a-z0-9][a-z0-9._:/@+~-]{0,255}$/;

export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

export interface StableObservationInput {
  source_id: string;
  source_native_fingerprint: string;
}

export interface RootDebtKeyInput {
  repo_id: string;
  normalizer: string;
  cause_key: CanonicalJsonValue;
}

export type ActionObservationPhase = "before" | "intermediate" | "after";

export interface ActionObservationSnapshot {
  phase: ActionObservationPhase;
  observation_ids: readonly string[];
}

export interface ActionObservationSets {
  action_id: string;
  before_observation_ids: readonly string[];
  observed_observation_ids: readonly string[];
  closing_observation_ids: readonly string[];
  appeared_observation_ids: readonly string[];
  resolved_before_boundary_observation_ids: readonly string[];
  open_at_boundary_observation_ids: readonly string[];
}

export type RootDebtState =
  | "satisfied"
  | "accepted_exception"
  | "open"
  | "blocked"
  | "deferred"
  | "not_assessed";

export type RootDebtDisposition =
  | "autonomously_repair"
  | "autonomously_validate"
  | "accepted_exception"
  | "decision_or_coordination_required";

export type RootDebtOriginClass =
  | "baseline"
  | "introduced_by_run"
  | "newly_discovered_preexisting"
  | "concurrent_external"
  | "unestablished";

export interface AccountingEvidenceRef {
  path: string;
  sha256: string;
}

/**
 * A concurrent-external attribution needs evidence of the external change,
 * not merely another generic receipt. The discriminator is part of the
 * canonical ledger projection so it cannot be changed without changing the
 * ledger digest.
 */
export interface ExternalChangeEvidenceRef extends AccountingEvidenceRef {
  kind: "external_change";
}

export type RootDebtOrigin =
  | {
      class: "baseline";
      action_id?: never;
      observation_evidence_ref?: never;
      baseline_replay_ref?: never;
      change_ref?: never;
    }
  | {
      class: "introduced_by_run";
      action_id: string;
      observation_evidence_ref: AccountingEvidenceRef;
      baseline_replay_ref?: never;
      change_ref?: never;
    }
  | {
      class: "newly_discovered_preexisting";
      action_id?: never;
      observation_evidence_ref: AccountingEvidenceRef;
      baseline_replay_ref: AccountingEvidenceRef;
      change_ref?: never;
    }
  | {
      class: "concurrent_external";
      action_id?: never;
      observation_evidence_ref: AccountingEvidenceRef;
      baseline_replay_ref?: never;
      change_ref: ExternalChangeEvidenceRef;
    }
  | {
      class: "unestablished";
      action_id?: never;
      observation_evidence_ref?: never;
      baseline_replay_ref?: never;
      change_ref?: never;
    };

export interface RootDebtAccountingRow {
  debt_key: string;
  normalizer: string;
  cause_key: CanonicalJsonValue;
  state: RootDebtState;
  disposition: RootDebtDisposition;
  origin: RootDebtOrigin;
  observation_ids: readonly string[];
}

export interface RegressionAccountingEvidence {
  repo_id: string;
  baseline_observation_ids: readonly string[];
  closing_observation_ids: readonly string[];
  action_observations: readonly ActionObservationSets[];
  root_debts: readonly RootDebtAccountingRow[];
}

export interface RegressionAccounting {
  schema_version: typeof REGRESSION_ACCOUNTING_SCHEMA_VERSION;
  observation_ledger: {
    identity_scheme: typeof OBSERVATION_IDENTITY_SCHEME;
    ledger_sha256: string;
    baseline_observation_ids: readonly string[];
    closing_observation_ids: readonly string[];
    observed_observation_ids: readonly string[];
  };
  root_debt_ledger: {
    identity_scheme: typeof ROOT_DEBT_IDENTITY_SCHEME;
    ledger_sha256: string;
    baseline_present_debt_keys: readonly string[];
    closing_present_debt_keys: readonly string[];
  };
}

const ROOT_DEBT_STATES = new Set<RootDebtState>([
  "satisfied",
  "accepted_exception",
  "open",
  "blocked",
  "deferred",
  "not_assessed",
]);
const ROOT_DEBT_DISPOSITIONS = new Set<RootDebtDisposition>([
  "autonomously_repair",
  "autonomously_validate",
  "accepted_exception",
  "decision_or_coordination_required",
]);
const ROOT_DEBT_ORIGINS = new Set<RootDebtOriginClass>([
  "baseline",
  "introduced_by_run",
  "newly_discovered_preexisting",
  "concurrent_external",
  "unestablished",
]);
const UNRESOLVED_STATES = new Set<RootDebtState>([
  "open",
  "blocked",
  "deferred",
  "not_assessed",
]);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Unicode scalar-value order is identical to lexicographic UTF-8 order. */
function compareCanonicalText(left: string, right: string): number {
  const leftIterator = left[Symbol.iterator]();
  const rightIterator = right[Symbol.iterator]();
  for (;;) {
    const leftNext = leftIterator.next();
    const rightNext = rightIterator.next();
    if (leftNext.done || rightNext.done) {
      if (leftNext.done === rightNext.done) return 0;
      return leftNext.done ? -1 : 1;
    }
    const leftPoint = leftNext.value.codePointAt(0)!;
    const rightPoint = rightNext.value.codePointAt(0)!;
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
  }
}

function assertWellFormedUnicode(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error(`${path}: canonical UTF-8 text cannot contain an unpaired surrogate`);
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error(`${path}: canonical UTF-8 text cannot contain an unpaired surrogate`);
    }
  }
}

function canonicalJson(value: unknown, path = "$", active = new Set<object>()): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    assertWellFormedUnicode(value, path);
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path}: canonical JSON requires a finite number`);
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value !== "object") {
    throw new Error(`${path}: value is not canonical JSON`);
  }
  if (active.has(value)) throw new Error(`${path}: canonical JSON cannot contain a cycle`);
  active.add(value);
  try {
    if (Array.isArray(value)) {
      const encoded: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) throw new Error(`${path}[${index}]: canonical JSON cannot contain an array hole`);
        encoded.push(canonicalJson(value[index], `${path}[${index}]`, active));
      }
      return `[${encoded.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path}: canonical JSON requires a plain object`);
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key === "symbol")) {
      throw new Error(`${path}: canonical JSON cannot contain symbol keys`);
    }
    const keys = (ownKeys as string[]).sort(compareCanonicalText);
    const encoded = keys.map((key) => {
      assertWellFormedUnicode(key, `${path} object key`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new Error(`${path}.${key}: canonical JSON requires enumerable data properties`);
      }
      return `${JSON.stringify(key)}:${canonicalJson(descriptor.value, `${path}.${key}`, active)}`;
    });
    return `{${encoded.join(",")}}`;
  } finally {
    active.delete(value);
  }
}

function assertExactLabel(value: string, name: string): void {
  if (value.length === 0 || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${name}: must be a non-empty exact string without controls or surrounding whitespace`);
  }
  assertWellFormedUnicode(value, name);
}

function assertSourceId(value: string): void {
  if (!SOURCE_ID.test(value)) {
    throw new Error("source_id: must be a lowercase, whitespace-free, versionable stable identifier");
  }
}

function assertStableToken(value: string, name: string): void {
  if (!STABLE_TOKEN.test(value)) throw new Error(`${name}: must be a stable identifier`);
}

function assertNormalizer(value: string): void {
  if (!NORMALIZER_ID.test(value)) {
    throw new Error("normalizer: must be a lowercase, whitespace-free, versioned stable identifier");
  }
}

function assertSha256(value: string, name: string): void {
  if (!SHA256.test(value)) throw new Error(`${name}: must be a lowercase SHA-256 digest`);
}

export function canonicalObservationId(input: StableObservationInput): string {
  assertSourceId(input.source_id);
  assertSha256(input.source_native_fingerprint, "source_native_fingerprint");
  return sha256(canonicalJson([
    OBSERVATION_IDENTITY_SCHEME,
    input.source_id,
    input.source_native_fingerprint,
  ]));
}

export function canonicalRootDebtKey(input: RootDebtKeyInput): string {
  assertExactLabel(input.repo_id, "repo_id");
  assertNormalizer(input.normalizer);
  return sha256(canonicalJson([
    ROOT_DEBT_IDENTITY_SCHEME,
    input.repo_id,
    input.normalizer,
    input.cause_key,
  ]));
}

export function canonicalObservationSet(observationIds: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const id of observationIds) {
    assertSha256(id, "observation id");
    unique.add(id);
  }
  return [...unique].sort(compareCanonicalText);
}

function difference(left: readonly string[], right: ReadonlySet<string>): string[] {
  return left.filter((value) => !right.has(value));
}

function intersection(left: readonly string[], right: ReadonlySet<string>): string[] {
  return left.filter((value) => right.has(value));
}

export function deriveActionObservationSets(
  actionId: string,
  snapshots: readonly ActionObservationSnapshot[],
): ActionObservationSets {
  assertStableToken(actionId, "action_id");
  if (snapshots.length < 2
    || snapshots[0]?.phase !== "before"
    || snapshots.at(-1)?.phase !== "after"
    || snapshots.slice(1, -1).some((snapshot) => snapshot.phase !== "intermediate")) {
    throw new Error("action snapshots must start with before, contain only intermediate snapshots, and end with after");
  }

  const canonicalSnapshots = snapshots.map((snapshot) => canonicalObservationSet(snapshot.observation_ids));
  const before = canonicalSnapshots[0]!;
  const closing = canonicalSnapshots.at(-1)!;
  const observed = canonicalObservationSet(canonicalSnapshots.flat());
  const beforeSet = new Set(before);
  const closingSet = new Set(closing);
  const appeared = difference(observed, beforeSet);
  const resolved = difference(appeared, closingSet);
  const open = intersection(appeared, closingSet);

  return {
    action_id: actionId,
    before_observation_ids: before,
    observed_observation_ids: observed,
    closing_observation_ids: closing,
    appeared_observation_ids: appeared,
    resolved_before_boundary_observation_ids: resolved,
    open_at_boundary_observation_ids: open,
  };
}

function originProjection(origin: RootDebtOrigin): CanonicalJsonValue {
  const projection: Record<string, CanonicalJsonValue> = { class: origin.class };
  if (origin.action_id !== undefined) projection.action_id = origin.action_id;
  if (origin.observation_evidence_ref !== undefined) {
    projection.observation_evidence_ref = {
      path: origin.observation_evidence_ref.path,
      sha256: origin.observation_evidence_ref.sha256,
    };
  }
  if (origin.baseline_replay_ref !== undefined) {
    projection.baseline_replay_ref = {
      path: origin.baseline_replay_ref.path,
      sha256: origin.baseline_replay_ref.sha256,
    };
  }
  if (origin.change_ref !== undefined) {
    projection.change_ref = {
      kind: origin.change_ref.kind,
      path: origin.change_ref.path,
      sha256: origin.change_ref.sha256,
    };
  }
  return projection;
}

export function rootDebtLedgerDigest(
  repoId: string,
  rootDebts: readonly RootDebtAccountingRow[],
): string {
  assertExactLabel(repoId, "repo_id");
  const rows = [...rootDebts]
    .sort((left, right) => compareCanonicalText(left.debt_key, right.debt_key))
    .map((row): CanonicalJsonValue => ({
      debt_key: row.debt_key,
      normalizer: row.normalizer,
      cause_key: row.cause_key,
      state: row.state,
      disposition: row.disposition,
      origin: originProjection(row.origin),
      observation_ids: canonicalObservationSet(row.observation_ids),
    }));
  return sha256(canonicalJson({
    identity_scheme: ROOT_DEBT_IDENTITY_SCHEME,
    repo_id: repoId,
    rows,
  }));
}

function actionProjection(action: ActionObservationSets): CanonicalJsonValue {
  return {
    action_id: action.action_id,
    before_observation_ids: canonicalObservationSet(action.before_observation_ids),
    observed_observation_ids: canonicalObservationSet(action.observed_observation_ids),
    closing_observation_ids: canonicalObservationSet(action.closing_observation_ids),
    appeared_observation_ids: canonicalObservationSet(action.appeared_observation_ids),
    resolved_before_boundary_observation_ids: canonicalObservationSet(action.resolved_before_boundary_observation_ids),
    open_at_boundary_observation_ids: canonicalObservationSet(action.open_at_boundary_observation_ids),
  };
}

export function observationLedgerDigest(
  baselineObservationIds: readonly string[],
  closingObservationIds: readonly string[],
  actionObservations: readonly ActionObservationSets[],
): string {
  const actions = [...actionObservations]
    .sort((left, right) => compareCanonicalText(left.action_id, right.action_id))
    .map(actionProjection);
  return sha256(canonicalJson({
    identity_scheme: OBSERVATION_IDENTITY_SCHEME,
    baseline_observation_ids: canonicalObservationSet(baselineObservationIds),
    closing_observation_ids: canonicalObservationSet(closingObservationIds),
    actions,
  }));
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function canonicalSetErrors(values: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!Array.isArray(values)) return [`${path}: required array`];
  for (const [index, value] of values.entries()) {
    if (typeof value !== "string" || !SHA256.test(value)) {
      errors.push(`${path}[${index}]: must be a lowercase SHA-256 observation id`);
    }
  }
  const valid = values.filter((value): value is string => typeof value === "string" && SHA256.test(value));
  const expected = [...new Set(valid)].sort(compareCanonicalText);
  if (valid.length !== values.length || !arraysEqual(valid, expected)) {
    errors.push(`${path}: must be sorted and duplicate-free`);
  }
  return errors;
}

function validateActionObservationSets(action: ActionObservationSets, path: string): string[] {
  const errors: string[] = [];
  if (!STABLE_TOKEN.test(action.action_id)) errors.push(`${path}.action_id: must be a stable identifier`);
  const fields = [
    "before_observation_ids",
    "observed_observation_ids",
    "closing_observation_ids",
    "appeared_observation_ids",
    "resolved_before_boundary_observation_ids",
    "open_at_boundary_observation_ids",
  ] as const;
  for (const field of fields) errors.push(...canonicalSetErrors(action[field], `${path}.${field}`));
  if (errors.length > 0) return errors;

  const observedSet = new Set(action.observed_observation_ids);
  for (const id of [...action.before_observation_ids, ...action.closing_observation_ids]) {
    if (!observedSet.has(id)) errors.push(`${path}.observed_observation_ids: must include boundary observation ${id}`);
  }
  const beforeSet = new Set(action.before_observation_ids);
  const closingSet = new Set(action.closing_observation_ids);
  const appeared = difference(action.observed_observation_ids, beforeSet);
  const resolved = difference(appeared, closingSet);
  const open = intersection(appeared, closingSet);
  if (!arraysEqual(action.appeared_observation_ids, appeared)) {
    errors.push(`${path}.appeared_observation_ids: must equal observed minus before`);
  }
  if (!arraysEqual(action.resolved_before_boundary_observation_ids, resolved)) {
    errors.push(`${path}.resolved_before_boundary_observation_ids: must equal appeared minus closing`);
  }
  if (!arraysEqual(action.open_at_boundary_observation_ids, open)) {
    errors.push(`${path}.open_at_boundary_observation_ids: must equal appeared intersect closing`);
  }
  return errors;
}

function evidenceRefErrors(ref: AccountingEvidenceRef | undefined, path: string): string[] {
  if (ref === undefined) return [`${path}: required`];
  const errors: string[] = [];
  const raw = ref as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (key !== "path" && key !== "sha256") errors.push(`${path}.${key}: unexpected field`);
  }
  if (typeof ref.path !== "string"
    || ref.path.length === 0
    || ref.path.startsWith("/")
    || ref.path.includes("\\")
    || /[\u0000-\u001f\u007f]/u.test(ref.path)
    || ref.path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    errors.push(`${path}.path: must be a safe repository-relative path`);
  }
  if (typeof ref.sha256 !== "string" || !SHA256.test(ref.sha256)) {
    errors.push(`${path}.sha256: must be a lowercase SHA-256 digest`);
  }
  return errors;
}

function externalChangeRefErrors(
  ref: ExternalChangeEvidenceRef | undefined,
  path: string,
): string[] {
  if (ref === undefined) return [`${path}: required`];
  const errors: string[] = [];
  const raw = ref as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (key !== "kind" && key !== "path" && key !== "sha256") {
      errors.push(`${path}.${key}: unexpected field`);
    }
  }
  if (ref.kind !== "external_change") {
    errors.push(`${path}.kind: must equal external_change`);
  }
  const untyped = { path: ref.path, sha256: ref.sha256 };
  errors.push(...evidenceRefErrors(untyped, path));
  return errors;
}

function originContractErrors(origin: RootDebtOrigin, path: string): string[] {
  const errors: string[] = [];
  const raw = origin as unknown as Record<string, unknown>;
  const allowed = origin.class === "introduced_by_run"
    ? ["class", "action_id", "observation_evidence_ref"]
    : origin.class === "newly_discovered_preexisting"
      ? ["class", "observation_evidence_ref", "baseline_replay_ref"]
      : origin.class === "concurrent_external"
        ? ["class", "observation_evidence_ref", "change_ref"]
        : ["class"];
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(raw)) {
    if (!allowedSet.has(key)) errors.push(`${path}.${key}: unexpected field`);
  }
  const hasActionId = hasOwn(raw, "action_id");
  const hasObservationEvidenceRef = hasOwn(raw, "observation_evidence_ref");
  const hasBaselineReplayRef = hasOwn(raw, "baseline_replay_ref");
  const hasChangeRef = hasOwn(raw, "change_ref");
  if (origin.class === "baseline" || origin.class === "unestablished") {
    if (hasActionId) errors.push(`${path}.action_id: forbidden for ${origin.class} origin`);
    if (hasObservationEvidenceRef) {
      errors.push(`${path}.observation_evidence_ref: forbidden for ${origin.class} origin`);
    }
    if (hasBaselineReplayRef) {
      errors.push(`${path}.baseline_replay_ref: forbidden for ${origin.class} origin`);
    }
    if (hasChangeRef) errors.push(`${path}.change_ref: forbidden for ${origin.class} origin`);
  } else if (origin.class === "introduced_by_run") {
    if (!hasActionId || typeof origin.action_id !== "string") {
      errors.push(`${path}.action_id: introduced_by_run requires an action id`);
    }
    if (!hasObservationEvidenceRef) errors.push(`${path}.observation_evidence_ref: required`);
    else errors.push(...evidenceRefErrors(
      origin.observation_evidence_ref,
      `${path}.observation_evidence_ref`,
    ));
  } else if (origin.class === "newly_discovered_preexisting") {
    if (hasActionId) errors.push(`${path}.action_id: forbidden for ${origin.class} origin`);
    if (!hasObservationEvidenceRef) errors.push(`${path}.observation_evidence_ref: required`);
    else errors.push(...evidenceRefErrors(
      origin.observation_evidence_ref,
      `${path}.observation_evidence_ref`,
    ));
    if (!hasBaselineReplayRef) errors.push(`${path}.baseline_replay_ref: required`);
    else errors.push(...evidenceRefErrors(origin.baseline_replay_ref, `${path}.baseline_replay_ref`));
  } else if (origin.class === "concurrent_external") {
    if (hasActionId) errors.push(`${path}.action_id: forbidden for ${origin.class} origin`);
    if (!hasObservationEvidenceRef) errors.push(`${path}.observation_evidence_ref: required`);
    else errors.push(...evidenceRefErrors(
      origin.observation_evidence_ref,
      `${path}.observation_evidence_ref`,
    ));
    if (!hasChangeRef) errors.push(`${path}.change_ref: required`);
    else errors.push(...externalChangeRefErrors(origin.change_ref, `${path}.change_ref`));
  }
  return errors;
}

function regressionEvidenceErrors(evidence: RegressionAccountingEvidence): string[] {
  const errors: string[] = [];
  try {
    assertExactLabel(evidence.repo_id, "repo_id");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "repo_id: invalid");
  }
  errors.push(...canonicalSetErrors(evidence.baseline_observation_ids, "$.baseline_observation_ids"));
  errors.push(...canonicalSetErrors(evidence.closing_observation_ids, "$.closing_observation_ids"));

  const actionsById = new Map<string, ActionObservationSets>();
  const earliestAppearanceByObservation = new Map<string, string>();
  for (const [index, action] of evidence.action_observations.entries()) {
    const path = `$.action_observations[${index}]`;
    errors.push(...validateActionObservationSets(action, path));
    if (actionsById.has(action.action_id)) errors.push(`${path}.action_id: duplicate action id`);
    else actionsById.set(action.action_id, action);
    for (const id of action.appeared_observation_ids) {
      if (!earliestAppearanceByObservation.has(id)) {
        earliestAppearanceByObservation.set(id, action.action_id);
      }
    }
  }

  const universe = new Set<string>();
  for (const id of evidence.baseline_observation_ids) if (SHA256.test(id)) universe.add(id);
  for (const id of evidence.closing_observation_ids) if (SHA256.test(id)) universe.add(id);
  for (const action of evidence.action_observations) {
    for (const id of action.observed_observation_ids) if (SHA256.test(id)) universe.add(id);
  }
  const baseline = new Set(evidence.baseline_observation_ids);
  const closing = new Set(evidence.closing_observation_ids);
  const owners = new Map<string, number>();
  const debtKeys = new Set<string>();

  for (const [index, row] of evidence.root_debts.entries()) {
    const path = `$.root_debts[${index}]`;
    if (!SHA256.test(row.debt_key)) errors.push(`${path}.debt_key: must be a lowercase SHA-256 digest`);
    if (debtKeys.has(row.debt_key)) errors.push(`${path}.debt_key: duplicate root debt key`);
    else debtKeys.add(row.debt_key);
    if (!NORMALIZER_ID.test(row.normalizer)) errors.push(`${path}.normalizer: must be a versioned stable identifier`);
    try {
      const expected = canonicalRootDebtKey({
        repo_id: evidence.repo_id,
        normalizer: row.normalizer,
        cause_key: row.cause_key,
      });
      if (row.debt_key !== expected) errors.push(`${path}.debt_key: does not match repo, normalizer, and cause_key`);
    } catch (error) {
      errors.push(`${path}.cause_key: ${error instanceof Error ? error.message : "not canonical JSON"}`);
    }
    if (!ROOT_DEBT_STATES.has(row.state)) errors.push(`${path}.state: unsupported root debt state`);
    if (!ROOT_DEBT_DISPOSITIONS.has(row.disposition)) errors.push(`${path}.disposition: unsupported disposition`);
    errors.push(...canonicalSetErrors(row.observation_ids, `${path}.observation_ids`));
    if (row.observation_ids.length === 0) errors.push(`${path}.observation_ids: root debt must own at least one observation`);
    for (const id of row.observation_ids) {
      if (!universe.has(id)) errors.push(`${path}.observation_ids: ${id} is absent from observation universe`);
      owners.set(id, (owners.get(id) ?? 0) + 1);
    }

    const baselinePresent = row.observation_ids.some((id) => baseline.has(id));
    const closingPresent = row.observation_ids.some((id) => closing.has(id));
    if (!ROOT_DEBT_ORIGINS.has(row.origin.class)) errors.push(`${path}.origin.class: unsupported origin`);
    errors.push(...originContractErrors(row.origin, `${path}.origin`));
    if (baselinePresent && row.origin.class !== "baseline") {
      errors.push(`${path}.origin.class: a baseline-present root debt must have baseline origin`);
    }
    if (!baselinePresent && row.origin.class === "baseline") {
      errors.push(`${path}.origin.class: baseline origin requires a baseline observation`);
    }
    const earliestAction = evidence.action_observations.find((action) => (
      row.observation_ids.some((id) => earliestAppearanceByObservation.get(id) === action.action_id)
    ));
    if (row.origin.class === "introduced_by_run") {
      if (earliestAction === undefined) {
        errors.push(`${path}.origin: introduced_by_run must own an observation that appeared in an ordered action`);
      } else if (row.origin.action_id !== earliestAction.action_id) {
        errors.push(`${path}.origin.action_id: must equal earliest ordered action where any root observation first appeared (${earliestAction.action_id})`);
      }
    }
    if (!baselinePresent && earliestAction !== undefined && row.origin.class !== "introduced_by_run") {
      const contraryEvidenceValid = row.origin.class === "newly_discovered_preexisting"
        ? evidenceRefErrors(
          row.origin.baseline_replay_ref,
          `${path}.origin.baseline_replay_ref`,
        ).length === 0
        : row.origin.class === "concurrent_external"
          ? externalChangeRefErrors(row.origin.change_ref, `${path}.origin.change_ref`).length === 0
          : false;
      if (!contraryEvidenceValid) {
        errors.push(
          `${path}.origin.class: a root observation first appeared in action ${earliestAction.action_id}; `
          + "requires introduced_by_run unless typed contrary evidence proves preexistence or an external change",
        );
      }
    }
    if (closingPresent && row.state === "satisfied") {
      errors.push(`${path}.state: a closing-present root debt cannot be satisfied`);
    }
    if (!closingPresent && UNRESOLVED_STATES.has(row.state)) {
      errors.push(`${path}.state: an unresolved root debt requires a closing observation`);
    }
    if ((row.state === "accepted_exception") !== (row.disposition === "accepted_exception")) {
      errors.push(`${path}: accepted_exception state and disposition must agree`);
    }
  }

  for (const id of [...universe].sort(compareCanonicalText)) {
    const count = owners.get(id) ?? 0;
    if (count !== 1) errors.push(`observation ${id}: must map to exactly one root debt (${count} owners)`);
  }
  return errors;
}

function observationUniverse(evidence: RegressionAccountingEvidence): string[] {
  return canonicalObservationSet([
    ...evidence.baseline_observation_ids,
    ...evidence.closing_observation_ids,
    ...evidence.action_observations.flatMap((action) => action.observed_observation_ids),
  ]);
}

function presentDebtKeys(
  observations: readonly string[],
  rootDebts: readonly RootDebtAccountingRow[],
): string[] {
  const present = new Set(observations);
  return canonicalObservationSet(rootDebts
    .filter((row) => row.observation_ids.some((id) => present.has(id)))
    .map((row) => row.debt_key));
}

function uncheckedAccounting(evidence: RegressionAccountingEvidence): RegressionAccounting {
  return {
    schema_version: REGRESSION_ACCOUNTING_SCHEMA_VERSION,
    observation_ledger: {
      identity_scheme: OBSERVATION_IDENTITY_SCHEME,
      ledger_sha256: observationLedgerDigest(
        evidence.baseline_observation_ids,
        evidence.closing_observation_ids,
        evidence.action_observations,
      ),
      baseline_observation_ids: [...evidence.baseline_observation_ids],
      closing_observation_ids: [...evidence.closing_observation_ids],
      observed_observation_ids: observationUniverse(evidence),
    },
    root_debt_ledger: {
      identity_scheme: ROOT_DEBT_IDENTITY_SCHEME,
      ledger_sha256: rootDebtLedgerDigest(evidence.repo_id, evidence.root_debts),
      baseline_present_debt_keys: presentDebtKeys(evidence.baseline_observation_ids, evidence.root_debts),
      closing_present_debt_keys: presentDebtKeys(evidence.closing_observation_ids, evidence.root_debts),
    },
  };
}

export function deriveRegressionAccounting(evidence: RegressionAccountingEvidence): RegressionAccounting {
  const errors = regressionEvidenceErrors(evidence);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return uncheckedAccounting(evidence);
}

function requireRecordShape(value: unknown, path: string, errors: string[]): Record<string, unknown> | undefined {
  const data = record(value);
  if (data === undefined) errors.push(`${path}: required object`);
  return data;
}

function requireStringShape(data: Record<string, unknown>, field: string, path: string, errors: string[]): void {
  if (typeof data[field] !== "string") errors.push(`${path}.${field}: required string`);
}

function requireArrayShape(data: Record<string, unknown>, field: string, path: string, errors: string[]): unknown[] | undefined {
  const value = data[field];
  if (!Array.isArray(value)) {
    errors.push(`${path}.${field}: required array`);
    return undefined;
  }
  return value;
}

function rejectUnexpectedKeys(
  data: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(data)) {
    if (!allowedSet.has(key)) errors.push(`${path}.${key}: unexpected field`);
  }
}

function regressionEvidenceShapeErrors(value: unknown): string[] {
  const errors: string[] = [];
  const data = requireRecordShape(value, "$.evidence", errors);
  if (data === undefined) return errors;
  rejectUnexpectedKeys(data, [
    "repo_id", "baseline_observation_ids", "closing_observation_ids",
    "action_observations", "root_debts",
  ], "$.evidence", errors);
  requireStringShape(data, "repo_id", "$.evidence", errors);
  requireArrayShape(data, "baseline_observation_ids", "$.evidence", errors);
  requireArrayShape(data, "closing_observation_ids", "$.evidence", errors);

  const actions = requireArrayShape(data, "action_observations", "$.evidence", errors);
  for (const [index, rawAction] of (actions ?? []).entries()) {
    const path = `$.evidence.action_observations[${index}]`;
    const action = requireRecordShape(rawAction, path, errors);
    if (action === undefined) continue;
    rejectUnexpectedKeys(action, [
      "action_id", "before_observation_ids", "observed_observation_ids",
      "closing_observation_ids", "appeared_observation_ids",
      "resolved_before_boundary_observation_ids", "open_at_boundary_observation_ids",
    ], path, errors);
    requireStringShape(action, "action_id", path, errors);
    for (const field of [
      "before_observation_ids",
      "observed_observation_ids",
      "closing_observation_ids",
      "appeared_observation_ids",
      "resolved_before_boundary_observation_ids",
      "open_at_boundary_observation_ids",
    ]) requireArrayShape(action, field, path, errors);
  }

  const debts = requireArrayShape(data, "root_debts", "$.evidence", errors);
  for (const [index, rawDebt] of (debts ?? []).entries()) {
    const path = `$.evidence.root_debts[${index}]`;
    const debt = requireRecordShape(rawDebt, path, errors);
    if (debt === undefined) continue;
    rejectUnexpectedKeys(debt, [
      "debt_key", "normalizer", "cause_key", "state", "disposition", "origin", "observation_ids",
    ], path, errors);
    for (const field of ["debt_key", "normalizer", "state", "disposition"]) {
      requireStringShape(debt, field, path, errors);
    }
    if (!hasOwn(debt, "cause_key")) errors.push(`${path}.cause_key: required`);
    requireArrayShape(debt, "observation_ids", path, errors);
    const origin = requireRecordShape(debt.origin, `${path}.origin`, errors);
    if (origin === undefined) continue;
    requireStringShape(origin, "class", `${path}.origin`, errors);
    const originClass = origin.class;
    const allowed = originClass === "introduced_by_run"
      ? ["class", "action_id", "observation_evidence_ref"]
      : originClass === "newly_discovered_preexisting"
        ? ["class", "observation_evidence_ref", "baseline_replay_ref"]
        : originClass === "concurrent_external"
          ? ["class", "observation_evidence_ref", "change_ref"]
          : ["class"];
    rejectUnexpectedKeys(origin, allowed, `${path}.origin`, errors);
    if (originClass === "introduced_by_run") {
      requireStringShape(origin, "action_id", `${path}.origin`, errors);
    }
    if (originClass === "introduced_by_run"
      || originClass === "newly_discovered_preexisting"
      || originClass === "concurrent_external") {
      const refPath = `${path}.origin.observation_evidence_ref`;
      const ref = requireRecordShape(origin.observation_evidence_ref, refPath, errors);
      if (ref !== undefined) {
        rejectUnexpectedKeys(ref, ["path", "sha256"], refPath, errors);
        requireStringShape(ref, "path", refPath, errors);
        requireStringShape(ref, "sha256", refPath, errors);
      }
    }
    if (originClass === "newly_discovered_preexisting") {
      const refPath = `${path}.origin.baseline_replay_ref`;
      const ref = requireRecordShape(origin.baseline_replay_ref, refPath, errors);
      if (ref !== undefined) {
        rejectUnexpectedKeys(ref, ["path", "sha256"], refPath, errors);
        requireStringShape(ref, "path", refPath, errors);
        requireStringShape(ref, "sha256", refPath, errors);
      }
    }
    if (originClass === "concurrent_external") {
      const refPath = `${path}.origin.change_ref`;
      const ref = requireRecordShape(origin.change_ref, refPath, errors);
      if (ref !== undefined) {
        rejectUnexpectedKeys(ref, ["kind", "path", "sha256"], refPath, errors);
        requireStringShape(ref, "kind", refPath, errors);
        requireStringShape(ref, "path", refPath, errors);
        requireStringShape(ref, "sha256", refPath, errors);
      }
    }
  }
  return errors;
}

function regressionAccountingShapeErrors(value: unknown): string[] {
  const errors: string[] = [];
  const data = requireRecordShape(value, "$.accounting", errors);
  if (data === undefined) return errors;
  rejectUnexpectedKeys(
    data,
    ["schema_version", "observation_ledger", "root_debt_ledger"],
    "$.accounting",
    errors,
  );
  requireStringShape(data, "schema_version", "$.accounting", errors);
  const observation = requireRecordShape(data.observation_ledger, "$.accounting.observation_ledger", errors);
  if (observation !== undefined) {
    rejectUnexpectedKeys(observation, [
      "identity_scheme", "ledger_sha256", "baseline_observation_ids",
      "closing_observation_ids", "observed_observation_ids",
    ], "$.accounting.observation_ledger", errors);
    requireStringShape(observation, "identity_scheme", "$.accounting.observation_ledger", errors);
    requireStringShape(observation, "ledger_sha256", "$.accounting.observation_ledger", errors);
    requireArrayShape(observation, "baseline_observation_ids", "$.accounting.observation_ledger", errors);
    requireArrayShape(observation, "closing_observation_ids", "$.accounting.observation_ledger", errors);
    requireArrayShape(observation, "observed_observation_ids", "$.accounting.observation_ledger", errors);
  }
  const root = requireRecordShape(data.root_debt_ledger, "$.accounting.root_debt_ledger", errors);
  if (root !== undefined) {
    rejectUnexpectedKeys(root, [
      "identity_scheme", "ledger_sha256", "baseline_present_debt_keys",
      "closing_present_debt_keys",
    ], "$.accounting.root_debt_ledger", errors);
    requireStringShape(root, "identity_scheme", "$.accounting.root_debt_ledger", errors);
    requireStringShape(root, "ledger_sha256", "$.accounting.root_debt_ledger", errors);
    requireArrayShape(root, "baseline_present_debt_keys", "$.accounting.root_debt_ledger", errors);
    requireArrayShape(root, "closing_present_debt_keys", "$.accounting.root_debt_ledger", errors);
  }
  return errors;
}

function validateRegressionAccountingUnsafe(accountingValue: unknown, evidenceValue: unknown): string[] {
  const shapeErrors = [
    ...regressionAccountingShapeErrors(accountingValue),
    ...regressionEvidenceShapeErrors(evidenceValue),
  ];
  if (shapeErrors.length > 0) return shapeErrors;
  const accounting = accountingValue as RegressionAccounting;
  const evidence = evidenceValue as RegressionAccountingEvidence;
  const errors = regressionEvidenceErrors(evidence);
  if (errors.length > 0) return errors;
  const expected = uncheckedAccounting(evidence);
  if (accounting.schema_version !== REGRESSION_ACCOUNTING_SCHEMA_VERSION) {
    errors.push(`$.schema_version: must equal ${REGRESSION_ACCOUNTING_SCHEMA_VERSION}`);
  }
  if (accounting.observation_ledger.identity_scheme !== OBSERVATION_IDENTITY_SCHEME) {
    errors.push(`$.observation_ledger.identity_scheme: must equal ${OBSERVATION_IDENTITY_SCHEME}`);
  }
  if (accounting.root_debt_ledger.identity_scheme !== ROOT_DEBT_IDENTITY_SCHEME) {
    errors.push(`$.root_debt_ledger.identity_scheme: must equal ${ROOT_DEBT_IDENTITY_SCHEME}`);
  }
  const comparisons: Array<[readonly string[], readonly string[], string]> = [
    [accounting.observation_ledger.baseline_observation_ids, expected.observation_ledger.baseline_observation_ids, "$.observation_ledger.baseline_observation_ids"],
    [accounting.observation_ledger.closing_observation_ids, expected.observation_ledger.closing_observation_ids, "$.observation_ledger.closing_observation_ids"],
    [accounting.observation_ledger.observed_observation_ids, expected.observation_ledger.observed_observation_ids, "$.observation_ledger.observed_observation_ids"],
    [accounting.root_debt_ledger.baseline_present_debt_keys, expected.root_debt_ledger.baseline_present_debt_keys, "$.root_debt_ledger.baseline_present_debt_keys"],
    [accounting.root_debt_ledger.closing_present_debt_keys, expected.root_debt_ledger.closing_present_debt_keys, "$.root_debt_ledger.closing_present_debt_keys"],
  ];
  for (const [actual, wanted, path] of comparisons) {
    errors.push(...canonicalSetErrors(actual, path));
    if (!arraysEqual(actual, wanted)) errors.push(`${path}: must equal the evidence-derived set`);
  }
  if (accounting.observation_ledger.ledger_sha256 !== expected.observation_ledger.ledger_sha256) {
    errors.push("$.observation_ledger.ledger_sha256: must match the canonical observation ledger");
  }
  if (accounting.root_debt_ledger.ledger_sha256 !== expected.root_debt_ledger.ledger_sha256) {
    errors.push("$.root_debt_ledger.ledger_sha256: must match the canonical root-debt ledger");
  }
  return errors;
}

/** Validation is a trust boundary: malformed JSON-like input is evidence, not an exception. */
export function validateRegressionAccounting(accounting: unknown, evidence: unknown): string[] {
  try {
    return validateRegressionAccountingUnsafe(accounting, evidence);
  } catch {
    return ["$: malformed regression accounting input could not be inspected safely"];
  }
}

const LEGACY_REGRESSION_NUMERIC_FIELDS = [
  "baseline_findings",
  "closing_findings",
  "baseline_paid",
  "baseline_open",
  "newly_discovered_preexisting_paid",
  "newly_discovered_preexisting_open",
  "concurrent_external_paid",
  "concurrent_external_open",
  "introduced_by_run_paid",
  "introduced_by_run_open",
] as const;
const LEGACY_ACTION_NUMERIC_FIELDS = [
  "introduced",
  "paid_before_boundary",
  "open_at_boundary",
] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function hasOwn(value: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

/**
 * Schema 1.5 must not carry the numeric claims whose units were historically
 * ambiguous. This helper is intentionally separate so older evidence remains
 * parseable while a 1.5 producer cannot emit both the old and new truths.
 */
export function schema15LegacyNumericFieldErrors(value: unknown, path = "$"): string[] {
  const data = record(value);
  if (data?.schema_version !== REGRESSION_ACCOUNTING_SCHEMA_VERSION) return [];
  const errors: string[] = [];
  for (const field of LEGACY_REGRESSION_NUMERIC_FIELDS) {
    if (hasOwn(data, field)) {
      errors.push(`${path}.${field}: legacy numeric regression field is forbidden by schema 1.5 accounting`);
    }
  }
  if (hasOwn(data, "action_checks") && !Array.isArray(data.action_checks)) {
    errors.push(`${path}.action_checks: legacy numeric regression field is forbidden by schema 1.5 accounting`);
  } else if (Array.isArray(data.action_checks)) {
    for (const [index, rawAction] of data.action_checks.entries()) {
      const action = record(rawAction);
      if (action === undefined) continue;
      for (const field of LEGACY_ACTION_NUMERIC_FIELDS) {
        if (hasOwn(action, field)) {
          errors.push(`${path}.action_checks[${index}].${field}: legacy numeric action field is forbidden by schema 1.5 accounting`);
        }
      }
    }
  }
  return errors;
}
