import { lstatSync, readFileSync } from "node:fs";
import { basename, extname, relative, resolve, sep } from "node:path";

import { parse as parseYaml } from "yaml";

import { foldCase } from "./normalization.js";
import {
  assertDirectory,
  discoverPlanningRoots,
  listEntriesRecursively,
  planningLaneLifecycle,
} from "./repository.js";

export type PlanningFindingCode =
  | "acceptance_cascade_unexecuted"
  | "acceptance_failure_unpaid"
  | "acceptance_gate_identity_conflict"
  | "acceptance_gate_undiscovered"
  | "acceptance_gate_unknown"
  | "archive_classification_conflict"
  | "body_projection_conflict"
  | "completed_parent_unexecuted_acceptance"
  | "duplicate_artifact_id"
  | "lane_status_conflict"
  | "lifecycle_state_unknown"
  | "orphan_parent_reference"
  | "parent_child_projection_conflict"
  | "parent_completion_stale"
  | "planning_input_unparsed"
  | "planning_relationship_conflict"
  | "planning_relationship_unresolved"
  | "preexecution_parent_has_started_children";

export interface PlanningSource {
  readonly classificationRationale?: string;
  readonly content: string;
  readonly declaredClass?: string;
  readonly path: string;
}

export interface PlanningFinding {
  readonly code: PlanningFindingCode;
  readonly detail: string;
  readonly path: string;
  readonly related: readonly string[];
  readonly subject: string;
}

export interface PlanningAuditResult {
  readonly artifactCount: number;
  readonly counts: Readonly<Record<PlanningFindingCode, number>>;
  readonly exitCode: 0 | 1;
  readonly findings: readonly PlanningFinding[];
  readonly planningRootCount: number;
  readonly status: "pass" | "fail" | "not_applicable";
  readonly structuredArtifactCount: number;
}

type JsonObject = Record<string, unknown>;
type Lifecycle = "active" | "archived" | "done" | "preexecution" | "unknown";
type Acceptance = "failed" | "not_applicable" | "passed" | "unknown" | "unrun";
type ChildRelationshipRole = "child_parentage" | "rollup_projection";

interface TableChild {
  readonly id: string;
  readonly ref: string;
  readonly state: Lifecycle;
}

interface RelationshipError {
  readonly code: "planning_relationship_conflict" | "planning_relationship_unresolved";
  readonly detail: string;
  readonly related: readonly string[];
}

interface ParentReference {
  readonly id: string;
  readonly ref: string;
  readonly state: Lifecycle;
}

interface TableScan {
  readonly children: readonly TableChild[];
  readonly errors: readonly RelationshipError[];
}

interface Artifact {
  readonly acceptance: boolean;
  readonly bodyGateObservations: readonly GateObservation[];
  readonly bodyProjection: StateProjection;
  readonly content: string;
  readonly declared: Lifecycle;
  readonly declaredClass: Lifecycle;
  readonly declaredProjection: StateProjection;
  readonly id: string;
  readonly lane: Lifecycle;
  readonly metadata: JsonObject;
  readonly nonArtifact: boolean;
  readonly nonArtifactRequested: boolean;
  readonly nonArtifactRationale: boolean;
  readonly parentIds: readonly string[];
  readonly parentReferences: readonly ParentReference[];
  readonly parseError?: string;
  readonly path: string;
  readonly state: Lifecycle;
  readonly structured: boolean;
  readonly tableChildren: readonly TableChild[];
  readonly topLevel: boolean;
  readonly type: string;
  readonly childRelationshipRole: ChildRelationshipRole;
  readonly relationshipErrors: readonly RelationshipError[];
}

interface GateObservation {
  readonly kind: string;
  readonly rationale: boolean;
  readonly ref: string;
  readonly state: Acceptance;
}

interface AcceptanceGate {
  readonly kind: string;
  readonly refs: readonly string[];
  readonly state: Acceptance;
  readonly states: readonly Acceptance[];
}

interface ParsedSource {
  readonly metadata: JsonObject;
  readonly parseError?: string;
  readonly structured: boolean;
}

interface ScannedBodyLine {
  readonly historical: boolean;
  readonly lineNumber: number;
  readonly text: string;
}

interface StateProjection {
  readonly state: Lifecycle;
  readonly states: readonly Lifecycle[];
  readonly values: readonly string[];
}

const TEXT_EXTENSIONS = new Set([".json", ".md", ".mdx", ".txt", ".yaml", ".yml"]);
const DONE = new Set([
  "accept", "accepted", "approved", "closed", "complete", "completed", "dev complete",
  "done", "implemented", "merged", "pass", "passed", "shipped", "verified",
]);
const ACTIVE = new Set([
  "active", "blocked", "claimed", "doing", "escalated", "executing", "failed",
  "in progress", "inprogress", "ready for acceptance", "ready for qa", "ready for review",
  "rejected", "revise", "underway",
]);
const PREEXECUTION = new Set([
  "backlog", "draft", "not started", "notstarted", "pending", "planned", "ready", "to do",
  "todo", "unstarted",
]);
const ARCHIVED = new Set(["archive", "archived", "historical", "history", "superseded"]);
const FAILED = new Set(["deny", "denied", "fail", "failed", "reject", "rejected", "revise"]);
const PASSED = new Set([...DONE, "approve"]);
const UNRUN = new Set([
  "backlog", "blocked", "not executed", "not run", "notexecuted", "notrun", "pending",
  "planned", "to do", "todo", "unexecuted", "unrun",
]);
const NOT_APPLICABLE = new Set(["n/a", "na", "not applicable", "not required", "waived"]);
const NON_ARTIFACT_CLASSES = new Set(["guidance", "non artifact", "reference", "schema", "template"]);
const ACCEPTANCE_KINDS = ["acceptance", "holdout", "qa", "review"] as const;
const ACCEPTANCE_WORDS = new Set<string>(ACCEPTANCE_KINDS);
const LEAF_ARTIFACT_TYPES = new Set(["slice", "task"]);
const ROLLUP_ARTIFACT_TYPES = new Set(["index", "rollup", "status_index"]);
const HIERARCHY_ARTIFACT_TYPES = new Set(["epic", "feature", "slice", "story", "task", "work_item"]);
const PLANNING_ARTIFACT_TYPES = new Set([
  ...HIERARCHY_ARTIFACT_TYPES,
  ...ROLLUP_ARTIFACT_TYPES,
  "acceptance", "holdout", "qa", "review",
]);
const CHILD_PARENTAGE_ROLE_ALIASES = new Set(["child_parentage", "hierarchy", "parent", "parentage"]);
const ROLLUP_PROJECTION_ROLE_ALIASES = new Set(["index", "projection", "rollup", "rollup_projection", "status_index"]);
const CANONICAL_PARENT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  feature: ["epic", "epic_id"],
  slice: ["story", "story_id", "feature", "feature_id", "epic", "epic_id"],
  story: ["feature", "feature_id", "epic", "epic_id"],
  task: ["slice", "slice_id", "story", "story_id", "feature", "feature_id", "epic", "epic_id"],
  work_item: ["story", "story_id", "feature", "feature_id", "epic", "epic_id"],
};
const ACCEPTANCE_VALUE_FIELDS = [
  "current_lifecycle", "current_phase", "current_stage", "current_state", "current_status",
  "implementation_status", "lifecycle", "outcome", "phase", "result", "stage", "state", "status", "verdict",
] as const;
const ACCEPTANCE_OUTCOME_WORDS = new Set([
  "lifecycle", "outcome", "phase", "result", "stage", "state", "status", "verdict",
]);
const EXPLICIT_ACCEPTANCE_FIELDS: readonly string[] = [
  ...ACCEPTANCE_KINDS.flatMap((kind) => ACCEPTANCE_VALUE_FIELDS.map((field) => `${kind}_${field}`)),
  "outcome", "result", "verdict",
];
const DECISIVE_ACCEPTANCE_FIELDS: readonly string[] = [
  ...ACCEPTANCE_KINDS.flatMap((kind) => ["outcome", "result", "verdict"].map((field) => `${kind}_${field}`)),
  "outcome", "result", "verdict",
];
const HISTORICAL_HEADINGS = /\b(archive|archived|changelog|historical|history|prior|previous|superseded)\b/i;
const PARENTAGE_TARGET_HEADERS = new Set([
  "artifact", "artifact id", "artifacts", "child", "child id", "children", "epic", "epic id",
  "epics", "feature", "feature id", "features", "id", "ids", "item", "item id", "items",
  "planning artifact", "planning artifact id", "planning artifacts", "slice", "slice id", "slices",
  "stories", "story", "story id", "task", "task id", "tasks", "work item", "work item id",
  "work items",
]);
const ROLLUP_TARGET_HEADERS = new Set([
  "artifact", "artifact id", "artifacts", "child", "child id", "children", "epic", "epic id",
  "epics", "feature", "feature id", "features", "id", "ids", "item", "item id", "items",
  "planning artifact", "planning artifact id", "planning artifacts", "slice", "slice id", "slices",
  "stories", "story", "story id", "task", "task id", "tasks", "work item", "work item id",
  "work items",
]);
const STRUCTURED_CHILD_KEYS = new Set([
  "artifact", "artifact_ids", "artifacts", "artifacts_ids", "child", "child_ids", "children", "children_ids",
  "epic", "epic_ids", "epics", "epics_ids", "feature", "feature_ids", "features", "features_ids",
  "ids", "item", "item_ids", "items", "items_ids", "planning_artifact", "planning_artifact_ids",
  "planning_artifacts", "planning_artifacts_ids", "slice", "slice_ids", "slices", "slices_ids",
  "stories", "stories_ids", "story", "story_ids", "task", "task_ids", "tasks", "tasks_ids",
  "work_item", "work_item_ids", "work_items", "work_items_ids",
]);
const STRUCTURED_ID_KEYS = [
  "id", "artifact_id", "child_id", "epic_id", "feature_id", "item_id", "planning_artifact_id",
  "slice_id", "story_id", "task_id", "work_item_id",
] as const;
const STRUCTURED_STATE_KEYS = [
  "current_lifecycle", "current_phase", "current_stage", "current_state", "current_status",
  "implementation_status", "lifecycle", "phase", "stage", "state", "status",
] as const;
const STATE_HEADERS = new Set(STRUCTURED_STATE_KEYS.map(normalize));
const STATE_HEADER_WORDS = new Set(["lifecycle", "phase", "stage", "state", "status"]);
const ACCEPTANCE_ID_FIELDS = ["acceptance_id", "holdout_id", "qa_id", "review_id"] as const;

const FINDING_CODES: readonly PlanningFindingCode[] = [
  "acceptance_cascade_unexecuted",
  "acceptance_failure_unpaid",
  "acceptance_gate_identity_conflict",
  "acceptance_gate_undiscovered",
  "acceptance_gate_unknown",
  "archive_classification_conflict",
  "body_projection_conflict",
  "completed_parent_unexecuted_acceptance",
  "duplicate_artifact_id",
  "lane_status_conflict",
  "lifecycle_state_unknown",
  "orphan_parent_reference",
  "parent_child_projection_conflict",
  "parent_completion_stale",
  "planning_input_unparsed",
  "planning_relationship_conflict",
  "planning_relationship_unresolved",
  "preexecution_parent_has_started_children",
];

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function normalize(value: string): string {
  return foldCase(value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2"))
    .replace(/[`*"']/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNonArtifactPlanningClass(value: string): boolean {
  return NON_ARTIFACT_CLASSES.has(normalize(value));
}

function normalizedId(value: string): string {
  return foldCase(value).trim();
}

function keyToken(value: string): string {
  return normalize(value).replace(/ /g, "_");
}

function scalar(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalizedId(trimmed);
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function topEntries(metadata: JsonObject, keys: readonly string[]): Array<[string, unknown]> {
  const priorities = new Map<string, number>();
  for (const [index, key] of keys.entries()) {
    const token = keyToken(key);
    if (!priorities.has(token)) priorities.set(token, index);
  }
  return Object.entries(metadata)
    .filter(([key]) => priorities.has(keyToken(key)))
    .sort(([left], [right]) =>
      (priorities.get(keyToken(left)) ?? Number.MAX_SAFE_INTEGER)
      - (priorities.get(keyToken(right)) ?? Number.MAX_SAFE_INTEGER)
      || keyToken(left).localeCompare(keyToken(right))
      || left.localeCompare(right));
}

function lifecycle(value: string | undefined): Lifecycle {
  if (!value) return "unknown";
  const token = normalize(value);
  if (DONE.has(token)) return "done";
  if (ACTIVE.has(token)) return "active";
  if (PREEXECUTION.has(token)) return "preexecution";
  if (ARCHIVED.has(token)) return "archived";
  return "unknown";
}

function acceptance(value: string | undefined): Acceptance {
  if (!value) return "unknown";
  const token = normalize(value);
  if (FAILED.has(token)) return "failed";
  if (UNRUN.has(token)) return "unrun";
  if (NOT_APPLICABLE.has(token)) return "not_applicable";
  if (PASSED.has(token)) return "passed";
  return "unknown";
}

function stateProjection(values: readonly string[]): StateProjection {
  const orderedValues = unique(values).sort((left, right) =>
    normalize(left).localeCompare(normalize(right)) || left.localeCompare(right));
  const states = [...new Set(orderedValues.map(lifecycle))].sort();
  return {
    state: states.length === 1 ? states[0] ?? "unknown" : "unknown",
    states,
    values: orderedValues,
  };
}

function frontmatterRange(content: string): { end: number; lines: string[]; start: number } | undefined {
  const lines = content.split(/\r?\n/);
  let start = 0;
  while (start < lines.length) {
    while (lines[start]?.trim() === "") start += 1;
    if (lines[start]?.trim().startsWith("<!--")) {
      while (start < lines.length && !lines[start]?.includes("-->")) start += 1;
      if (start < lines.length) start += 1;
      continue;
    }
    break;
  }
  if (lines[start]?.trim() !== "---") return undefined;
  for (let end = start + 1; end < lines.length; end += 1) {
    if (lines[end]?.trim() === "---") return { end, lines, start };
  }
  return undefined;
}

function parseStructured(content: string, kind: "json" | "yaml"): ParsedSource {
  try {
    // JSON.parse is last-key-wins and would erase contradictory duplicate
    // declarations before the planning graph can reconcile them. YAML's parser
    // rejects duplicate mapping keys, so use it as a duplicate-key sentinel
    // while retaining JSON.parse as the strict JSON grammar and value source.
    if (kind === "json") parseYaml(content);
    const value: unknown = kind === "json" ? JSON.parse(content) : parseYaml(content);
    const metadata = object(value);
    if (!metadata) return { metadata: {}, parseError: `${kind} root is not an object`, structured: false };
    return { metadata, structured: true };
  } catch (error) {
    const parseError = error instanceof Error ? error.message.split("\n", 1)[0] : undefined;
    return {
      metadata: {},
      parseError: parseError ?? `${kind} parse failed`,
      structured: false,
    };
  }
}

function parseSource(source: PlanningSource): ParsedSource {
  const extension = extname(source.path).toLocaleLowerCase("und");
  if (extension === ".json") return parseStructured(source.content, "json");
  if (extension === ".yaml" || extension === ".yml") return parseStructured(source.content, "yaml");
  const range = frontmatterRange(source.content);
  if (!range) return { metadata: {}, structured: false };
  const raw = range.lines.slice(range.start + 1, range.end).join("\n");
  return parseStructured(raw, "yaml");
}

function topValues(metadata: JsonObject, keys: readonly string[]): string[] {
  const values: string[] = [];
  for (const [, value] of topEntries(metadata, keys)) {
    const item = scalar(value);
    if (item) values.push(item);
  }
  return unique(values);
}

function scalarAliasValues(
  metadata: JsonObject,
  keys: readonly string[],
  label: string,
): { error?: string; present: boolean; values: readonly string[] } {
  const entries = topEntries(metadata, keys);
  const values: string[] = [];
  const invalid: string[] = [];
  for (const [key, raw] of entries) {
    const value = scalar(raw);
    if (value) values.push(value);
    else invalid.push(key);
  }
  return {
    ...(invalid.length > 0
      ? { error: `${label} aliases must each contain one nonempty scalar; invalid: ${invalid.map((key) => JSON.stringify(key)).join(", ")}` }
      : {}),
    present: entries.length > 0,
    values: unique(values),
  };
}

function scalarListAliasValues(
  metadata: JsonObject,
  keys: readonly string[],
  label: string,
): { error?: string; present: boolean; values: readonly string[] } {
  const entries = topEntries(metadata, keys);
  const values: string[] = [];
  const invalid: string[] = [];
  const add = (raw: unknown, ref: string): void => {
    const value = scalar(raw);
    if (value) {
      values.push(value);
      return;
    }
    if (Array.isArray(raw) && raw.length > 0) {
      raw.forEach((entry, index) => add(entry, `${ref}[${index}]`));
      return;
    }
    invalid.push(ref);
  };
  for (const [key, raw] of entries) add(raw, key);
  return {
    ...(invalid.length > 0
      ? { error: `${label} entries must each contain one nonempty scalar; invalid: ${invalid.map((key) => JSON.stringify(key)).join(", ")}` }
      : {}),
    present: entries.length > 0,
    values: unique(values),
  };
}

function lifecycleAliasProjection(
  metadata: JsonObject,
  label: string,
  allowAcceptance = false,
): { error?: string; projection: StateProjection } {
  const aliases = scalarAliasValues(metadata, STRUCTURED_STATE_KEYS, label);
  const projection = stateProjection(aliases.values);
  const unsupported = aliases.values.filter((value) =>
    lifecycle(value) === "unknown" && !(allowAcceptance && acceptance(value) !== "unknown"));
  const lifecycleStates = [...new Set(aliases.values
    .map(lifecycle)
    .filter((state) => state !== "unknown"))];
  const errors = [
    aliases.error,
    ...(unsupported.length > 0
      ? [`${label} contains unsupported lifecycle values: ${unsupported.map((value) => JSON.stringify(value)).join(", ")}`]
      : []),
    ...(lifecycleStates.length > 1
      ? [`${label} contains conflicting lifecycle values: ${aliases.values.map((value) => JSON.stringify(value)).join(", ")}`]
      : []),
  ].filter((error): error is string => Boolean(error));
  return {
    ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
    projection,
  };
}

function topLevelProjection(metadata: JsonObject): { error?: string; value: boolean } {
  const projection = scalarAliasValues(metadata, ["top_level"], "top_level");
  const normalized = projection.values.map(normalize);
  const supported = new Set(["0", "1", "false", "no", "true", "yes"]);
  const errors = [
    projection.error,
    ...(normalized.length > 1
      ? [`top_level aliases conflict: ${projection.values.map((value) => JSON.stringify(value)).join(", ")}`]
      : []),
    ...(normalized.some((value) => !supported.has(value))
      ? [`top_level must be one of true, false, yes, no, 1, or 0; received ${projection.values.map((value) => JSON.stringify(value)).join(", ")}`]
      : []),
  ].filter((error): error is string => Boolean(error));
  return {
    ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
    value: normalized.length === 1 && new Set(["1", "true", "yes"]).has(normalized[0] ?? ""),
  };
}

function unsupportedStateAliasError(metadata: JsonObject, label: string): string | undefined {
  const supported = new Set([
    ...STRUCTURED_STATE_KEYS.map(keyToken),
    ...EXPLICIT_ACCEPTANCE_FIELDS.map(keyToken),
  ]);
  const unsupported = Object.keys(metadata).filter((key) => {
    const token = keyToken(key);
    const words = normalize(key).split(" ");
    return words.some((word) => STATE_HEADER_WORDS.has(word)) && !supported.has(token);
  });
  return unsupported.length > 0
    ? `${label} contains unsupported state-like aliases: ${unsupported.map((key) => JSON.stringify(key)).join(", ")}`
    : undefined;
}

function deepEntries(value: unknown, path: readonly string[] = []): Array<{ path: readonly string[]; value: unknown }> {
  const item = object(value);
  if (item) {
    return Object.entries(item).flatMap(([key, child]) => deepEntries(child, [...path, keyToken(key)]));
  }
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => deepEntries(child, [...path, String(index)]));
  }
  return [{ path, value }];
}

function hasRawPlanningSignal(metadata: JsonObject, type: string): boolean {
  const keys = new Set(Object.keys(metadata).map(keyToken));
  const recognized = new Set([
    ...STRUCTURED_CHILD_KEYS,
    ...STRUCTURED_ID_KEYS,
    ...STRUCTURED_STATE_KEYS,
    "child_relationship_role", "child_relationship_role_rationale", "child_target_column",
    "child_target_column_rationale", "non_relationship_table_columns",
    "non_relationship_table_rationale", "non_relationship_table_target_columns", "parent", "parent_id",
    "parent_ids", "parents", "parents_ids", "relationship_role", "relationship_role_rationale", "relationship_target_column",
    "relationship_target_column_rationale", "rollup_target_column", "rollup_target_column_rationale",
    "top_level", `${type}_id`,
  ]);
  return [...keys].some((key) => recognized.has(key));
}

function pathLane(path: string): Lifecycle {
  for (const part of path.split("/")) {
    const state = planningLaneLifecycle(part);
    if (state) return state;
  }
  return "unknown";
}

function acceptanceDeclarationKinds(value: unknown): string[] {
  const kinds: string[] = [];
  const visit = (current: unknown): void => {
    const item = object(current);
    if (!item) {
      if (Array.isArray(current)) current.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(item)) {
      const token = keyToken(key);
      const identityKind = ACCEPTANCE_ID_FIELDS.find((field) => token === field)?.replace(/_id$/, "");
      if (identityKind) kinds.push(identityKind);
      if (new Set(["artifact_type", "kind", "type"]).has(token)) {
        const declaredType = keyToken(scalar(child) ?? "");
        if (ACCEPTANCE_WORDS.has(declaredType)) kinds.push(declaredType);
      }
      for (const kind of ACCEPTANCE_KINDS) {
        if (token === kind || token === `${kind}s`
          || ACCEPTANCE_VALUE_FIELDS.some((field) => token === `${kind}_${field}`)) {
          kinds.push(kind);
        }
      }
      visit(child);
    }
  };
  visit(value);
  return unique(kinds);
}

function hasNestedCanonicalPlanningSignal(metadata: JsonObject): boolean {
  const semanticKeys = new Set([
    ...ACCEPTANCE_ID_FIELDS,
    ...EXPLICIT_ACCEPTANCE_FIELDS,
    ...STRUCTURED_STATE_KEYS,
    "artifact_id", "child_id", "epic_id", "feature_id", "parent", "parent_id", "parent_ids",
    "parents", "parents_ids", "planning_artifact_id", "review_of", "reviewed_id", "slice_id",
    "story_id", "subject_id", "target_id", "task_id", "top_level", "work_item_id",
  ].map(keyToken));
  return deepEntries(metadata).some((entry) => {
    if (entry.path.length < 2) return false;
    if (entry.path.some((part, index) => index > 0 && (
      semanticKeys.has(part)
      || ACCEPTANCE_WORDS.has(part)
      || ACCEPTANCE_WORDS.has(part.replace(/s$/, ""))
    ))) return true;
    const last = entry.path.at(-1) ?? "";
    return new Set(["artifact_type", "kind", "type"]).has(last)
      && PLANNING_ARTIFACT_TYPES.has(keyToken(scalar(entry.value) ?? ""));
  });
}

function inferredArtifactType(
  path: string,
  metadata: JsonObject,
  declaredType?: string,
): { error?: string; strongAcceptanceType?: string; type: string } {
  const acceptanceKinds = ACCEPTANCE_ID_FIELDS
    .filter((key) => topEntries(metadata, [key]).length > 0)
    .map((key) => key.replace(/_id$/, ""));
  const outcomeKinds = ACCEPTANCE_KINDS.filter((kind) => topEntries(
    metadata,
    ACCEPTANCE_VALUE_FIELDS.map((field) => `${kind}_${field}`),
  ).length > 0);
  const declarationKinds = acceptanceDeclarationKinds(metadata);
  const hasGenericOutcome = topEntries(metadata, ["outcome", "result", "verdict"]).length > 0;
  const reviewRelation = topEntries(metadata, ["review_of", "reviewed_id"]).length > 0;
  const genericRelation = topEntries(metadata, ["subject_id", "target_id"]).length > 0;
  const genericIds = scalarAliasValues(metadata, ["id"], "generic identity").values;
  const hierarchyRelationKeys = [
    "epic", "epic_id", "feature", "feature_id", "parent", "parent_id", "parent_ids",
    "slice", "slice_id", "story", "story_id", "task", "task_id", "work_item", "work_item_id",
  ];
  const hierarchyRelation = genericIds.length > 0 && topEntries(metadata, hierarchyRelationKeys).some(([, raw]) => {
    const value = scalar(raw);
    return !value || !genericIds.some((id) => normalizedId(id) === normalizedId(value));
  });
  const relationType = reviewRelation ? "review" : genericRelation || hierarchyRelation ? "acceptance" : undefined;
  const errors: string[] = [];
  const hierarchyAliases = [...HIERARCHY_ARTIFACT_TYPES]
    .map((kind) => ({ kind, projection: scalarAliasValues(metadata, [`${kind}_id`], `${kind} identity`) }))
    .filter((entry) => entry.projection.present);
  if (acceptanceKinds.length > 1) {
    errors.push(`acceptance identity aliases imply multiple artifact types: ${acceptanceKinds.map((value) => JSON.stringify(value)).join(", ")}`);
  }
  if (relationType && outcomeKinds.length > 1) {
    errors.push(`acceptance outcome aliases imply multiple artifact types: ${outcomeKinds.map((value) => JSON.stringify(value)).join(", ")}`);
  }
  if (relationType && declarationKinds.length > 1) {
    errors.push(`acceptance declarations imply multiple artifact types: ${declarationKinds.map((value) => JSON.stringify(value)).join(", ")}`);
  }
  if (reviewRelation && outcomeKinds.length === 1 && outcomeKinds[0] !== "review") {
    errors.push(`review parentage conflicts with ${JSON.stringify(outcomeKinds[0])} outcome aliases`);
  }
  const strongAcceptanceType = acceptanceKinds.length === 1
    ? acceptanceKinds[0]
    : reviewRelation
      ? "review"
      : relationType && declarationKinds.length === 1
        ? declarationKinds[0]
        : relationType && (hasGenericOutcome || declarationKinds.length > 0)
          ? relationType
          : undefined;
  let inferredHierarchyType: string | undefined;
  if (!strongAcceptanceType && hierarchyAliases.length > 0
    && (!declaredType || !PLANNING_ARTIFACT_TYPES.has(declaredType))) {
    for (const entry of hierarchyAliases) if (entry.projection.error) errors.push(entry.projection.error);
    if (declaredType) {
      errors.push(`custom artifact type ${JSON.stringify(declaredType)} cannot silently reinterpret canonical hierarchy aliases: ${hierarchyAliases.map((entry) => JSON.stringify(`${entry.kind}_id`)).join(", ")}`);
    } else if (hierarchyAliases.length !== 1) {
      errors.push(`type-unresolved artifact declares multiple canonical hierarchy aliases: ${hierarchyAliases.map((entry) => JSON.stringify(`${entry.kind}_id`)).join(", ")}`);
    } else {
      const entry = hierarchyAliases[0];
      const values = entry?.projection.values ?? [];
      if (values.length !== 1) {
        errors.push(`type-unresolved artifact cannot resolve ${JSON.stringify(`${entry?.kind ?? "artifact"}_id`)} to one identity`);
      } else if (genericIds.length > 0 && !genericIds.some((id) => normalizedId(id) === normalizedId(values[0] ?? ""))) {
        errors.push(`type-unresolved artifact has ambiguous generic identity ${JSON.stringify(genericIds[0])} and canonical ${JSON.stringify(`${entry?.kind ?? "artifact"}_id`)} ${JSON.stringify(values[0])}`);
      } else {
        inferredHierarchyType = entry?.kind;
      }
    }
  }
  const pathParts = path.split("/").slice(0, -1).map(normalize);
  let pathType = "planning";
  if (pathParts.some((part) => new Set(["acceptance", "acceptances"]).has(part))) pathType = "acceptance";
  else if (pathParts.some((part) => new Set(["holdout", "holdouts"]).has(part))) pathType = "holdout";
  else if (pathParts.includes("qa")) pathType = "qa";
  else if (pathParts.some((part) => new Set(["review", "reviews", "story review", "story reviews"]).has(part))) pathType = "review";
  else if (pathParts.some((part) => new Set(["stories", "story"]).has(part))) pathType = "story";
  else if (pathParts.some((part) => new Set(["slices", "slice", "tasks", "task"]).has(part))) pathType = "slice";
  else if (pathParts.some((part) => new Set(["epics", "epic"]).has(part))) pathType = "epic";
  if (strongAcceptanceType) return {
    ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
    strongAcceptanceType,
    type: strongAcceptanceType,
  };
  if (inferredHierarchyType) return {
    ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
    type: inferredHierarchyType,
  };
  return {
    ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
    type: pathType,
  };
}

function artifactType(path: string, metadata: JsonObject): { error?: string; type: string } {
  const projection = scalarAliasValues(metadata, ["artifact_type", "kind", "type"], "artifact type");
  const types = unique(projection.values.map(keyToken));
  const inferred = inferredArtifactType(path, metadata, types.length === 1 ? types[0] : undefined);
  if (types.length === 0) {
    const errors = [projection.error, inferred.error].filter((error): error is string => Boolean(error));
    return { ...(errors.length > 0 ? { error: errors.join("; ") } : {}), type: inferred.type };
  }
  const acceptanceKinds = ACCEPTANCE_ID_FIELDS
    .filter((key) => topEntries(metadata, [key]).length > 0)
    .map((key) => key.replace(/_id$/, ""));
  const errors = [
    projection.error,
    inferred.error,
    ...(types.length > 1
      ? [`artifact type projections conflict: ${projection.values.map((value) => JSON.stringify(value)).join(", ")}`]
      : []),
    ...(acceptanceKinds.some((kind) => kind !== types[0])
      ? [`artifact type ${JSON.stringify(types[0])} conflicts with acceptance identity aliases for ${acceptanceKinds.map((value) => JSON.stringify(value)).join(", ")}`]
      : []),
    ...(inferred.strongAcceptanceType && inferred.strongAcceptanceType !== types[0]
      ? [`artifact type ${JSON.stringify(types[0])} conflicts with acceptance-shaped metadata for ${JSON.stringify(inferred.strongAcceptanceType)}`]
      : []),
  ].filter((error): error is string => Boolean(error));
  return {
    ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
    type: types[0] ?? inferred.type,
  };
}

function artifactIdentity(
  path: string,
  type: string,
  metadata: JsonObject,
): { error?: string; explicit: boolean; id: string } {
  const projection = scalarAliasValues(metadata, [`${type}_id`, "id"], "artifact identity");
  const ids = unique(projection.values);
  const errors = [
    projection.error,
    ...(ids.length > 1
      ? [`artifact identity projections conflict: ${projection.values.map((value) => JSON.stringify(value)).join(", ")}`]
      : []),
  ].filter((error): error is string => Boolean(error));
  return ids.length > 0
    ? {
      ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
      explicit: true,
      id: ids[0] ?? basename(path, extname(path)),
    }
    : {
      ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
      explicit: false,
      id: basename(path, extname(path)),
    };
}

function acceptanceArtifact(path: string, type: string): boolean {
  if (/(^|_)(acceptance|holdout|qa|review)($|_)/.test(type)) return true;
  return path.split("/").slice(0, -1).map(normalize).some((part) => new Set([
    "acceptance", "acceptances", "holdout", "holdouts", "qa", "review", "reviews", "story review", "story reviews",
  ]).has(part));
}

function parentReferenceKeys(type: string, isAcceptance: boolean): string[] {
  const keys = ["parent", "parent_id", "parent_ids", "parents", "parents_ids"];
  if (isAcceptance) {
    keys.push(...[
      ["review_of", "reviewed_id", "subject_id", "target_id"],
      ["story", "story_id"],
      ["feature", "feature_id", "slice", "slice_id", "task", "task_id", "work_item", "work_item_id"],
      ["epic", "epic_id"],
      ["reviews"],
    ].flat());
  } else {
    keys.push(...(CANONICAL_PARENT_FIELDS[type] ?? []));
  }
  return unique(keys);
}

function parentReferences(
  metadata: JsonObject,
  type: string,
  isAcceptance: boolean,
  path: string,
): { errors: readonly RelationshipError[]; ids: readonly string[]; references: readonly ParentReference[] } {
  const keys = parentReferenceKeys(type, isAcceptance);
  const ids: string[] = [];
  const references: ParentReference[] = [];
  const errors: RelationshipError[] = [];
  const referenceObjectKeys = [
    ...STRUCTURED_ID_KEYS, "epic", "feature", "item", "parent", "parent_id", "parent_ids", "parents", "parents_ids", "slice", "story", "task", "work_item",
  ];
  const parseEntry = (value: unknown, ref: string): void => {
    const direct = scalar(value);
    if (direct) {
      ids.push(direct);
      references.push({ id: direct, ref, state: "unknown" });
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        errors.push({
          code: "planning_relationship_unresolved",
          detail: "parent reference declares an empty target collection",
          related: [ref],
        });
      }
      for (const [index, entry] of value.entries()) parseEntry(entry, `${ref}[${index}]`);
      return;
    }
    const item = object(value);
    const unsupportedState = item ? unsupportedStateAliasError(item, "parent reference") : undefined;
    if (unsupportedState) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: unsupportedState,
        related: [ref],
      });
    }
    const identityScan = item
      ? scalarAliasValues(item, referenceObjectKeys, "parent reference identity")
      : { present: false, values: [] as readonly string[] };
    const candidates = identityScan.values;
    if (identityScan.error) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: identityScan.error,
        related: [ref],
      });
    }
    if (candidates.length === 1) {
      const id = candidates[0] ?? "";
      const stateScan = lifecycleAliasProjection(item ?? {}, "parent reference lifecycle");
      if (stateScan.error) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: stateScan.error,
          related: [ref],
        });
      }
      ids.push(id);
      references.push({ id, ref, state: stateScan.projection.state });
      return;
    }
    errors.push({
      code: candidates.length > 1 ? "planning_relationship_conflict" : "planning_relationship_unresolved",
      detail: candidates.length > 1
        ? `parent reference resolves to ${candidates.length} identities`
        : "parent reference has no scalar or recognized identity",
      related: [ref],
    });
  };
  for (const [key, value] of topEntries(metadata, keys)) parseEntry(value, `${path}#${keyToken(key)}`);
  return { errors, ids: unique(ids), references };
}

function childRelationshipRole(
  metadata: JsonObject,
  type: string,
): { error?: string; role: ChildRelationshipRole } {
  const defaultRole: ChildRelationshipRole = ROLLUP_ARTIFACT_TYPES.has(type)
    ? "rollup_projection"
    : "child_parentage";
  const projection = scalarAliasValues(
    metadata,
    ["relationship_role", "child_relationship_role"],
    "relationship role",
  );
  const rationale = scalarAliasValues(metadata, [
    "relationship_role_rationale", "child_relationship_role_rationale",
  ], "relationship role rationale");
  const errors = [projection.error, rationale.error].filter((error): error is string => Boolean(error));
  const values = projection.values;
  if (values.length === 0) {
    return { ...(errors.length > 0 ? { error: errors.join("; ") } : {}), role: defaultRole };
  }

  const roles = new Set<ChildRelationshipRole>();
  const unsupported: string[] = [];
  for (const value of values) {
    const token = keyToken(value);
    if (CHILD_PARENTAGE_ROLE_ALIASES.has(token)) {
      roles.add("child_parentage");
    } else if (ROLLUP_PROJECTION_ROLE_ALIASES.has(token)) {
      roles.add("rollup_projection");
    } else {
      unsupported.push(value);
    }
  }
  if (unsupported.length > 0 || roles.size !== 1) {
    errors.push(`relationship_role must resolve to exactly one of child_parentage or rollup_projection; received ${values.map((value) => JSON.stringify(value)).join(", ")}`);
    return { error: errors.join("; "), role: defaultRole };
  }

  const role = [...roles][0] ?? defaultRole;
  if (role !== defaultRole && (HIERARCHY_ARTIFACT_TYPES.has(type) || ROLLUP_ARTIFACT_TYPES.has(type))) {
    errors.push(`${JSON.stringify(type)} has immutable relationship role ${JSON.stringify(defaultRole)}`);
    return { error: errors.join("; "), role: defaultRole };
  }
  if (role !== defaultRole && rationale.values.length === 0) {
    errors.push(`relationship_role overrides the ${JSON.stringify(defaultRole)} default without relationship_role_rationale`);
    return { error: errors.join("; "), role: defaultRole };
  }
  return { ...(errors.length > 0 ? { error: errors.join("; ") } : {}), role };
}

function relationshipTargetHeaders(
  metadata: JsonObject,
  role: ChildRelationshipRole,
): { error?: string; headers: ReadonlySet<string> } {
  const defaults = role === "rollup_projection" ? ROLLUP_TARGET_HEADERS : PARENTAGE_TARGET_HEADERS;
  const keys = role === "rollup_projection"
    ? ["relationship_target_column", "rollup_target_column"]
    : ["child_target_column", "relationship_target_column"];
  const projection = scalarAliasValues(metadata, keys, "relationship target column");
  const values = projection.values;
  const rationaleKeys = role === "rollup_projection"
    ? ["relationship_target_column_rationale", "rollup_target_column_rationale"]
    : ["child_target_column_rationale", "relationship_target_column_rationale"];
  const rationale = scalarAliasValues(metadata, rationaleKeys, "relationship target-column rationale");
  const errors = [projection.error, rationale.error].filter((error): error is string => Boolean(error));
  if (values.length === 0) {
    return { ...(errors.length > 0 ? { error: errors.join("; ") } : {}), headers: defaults };
  }
  if (values.length > 1) {
    errors.push(`relationship target column must resolve to exactly one header; received ${values.map((value) => JSON.stringify(value)).join(", ")}`);
    return { error: errors.join("; "), headers: defaults };
  }
  if (rationale.values.length === 0) {
    errors.push(`custom relationship target column ${JSON.stringify(values[0])} requires a target-column rationale`);
    return { error: errors.join("; "), headers: defaults };
  }
  const custom = normalize(values[0] ?? "");
  if (STATE_HEADERS.has(custom)) {
    errors.push(`relationship target column ${JSON.stringify(values[0])} overlaps the lifecycle vocabulary`);
    return { error: errors.join("; "), headers: defaults };
  }
  return {
    ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
    headers: new Set([...defaults, custom]),
  };
}

function nonRelationshipTableHeaders(
  metadata: JsonObject,
  role: ChildRelationshipRole,
): { error?: string; headers: ReadonlySet<string> } {
  const projection = scalarListAliasValues(metadata, [
    "non_relationship_table_columns", "non_relationship_table_target_columns",
  ], "non-relationship table columns");
  const rationale = scalarAliasValues(
    metadata,
    ["non_relationship_table_rationale"],
    "non-relationship table rationale",
  );
  const errors = [projection.error, rationale.error].filter((error): error is string => Boolean(error));
  if (!projection.present) {
    return { ...(errors.length > 0 ? { error: errors.join("; ") } : {}), headers: new Set() };
  }
  const values = projection.values.map(normalize);
  if (values.length === 0) {
    errors.push("non-relationship table classification declares no target columns");
    return { error: errors.join("; "), headers: new Set() };
  }
  if (role !== "child_parentage") {
    errors.push("rollup artifacts cannot suppress state-bearing tables as non-relationship");
    return { error: errors.join("; "), headers: new Set() };
  }
  if (rationale.values.length === 0) {
    errors.push("non-relationship table classification requires non_relationship_table_rationale");
    return { error: errors.join("; "), headers: new Set() };
  }
  const overlaps = values.filter((value) => PARENTAGE_TARGET_HEADERS.has(value));
  const lifecycleOverlaps = values.filter((value) => STATE_HEADERS.has(value));
  if (overlaps.length > 0 || lifecycleOverlaps.length > 0) {
    errors.push(`relationship or lifecycle columns cannot be suppressed: ${[...overlaps, ...lifecycleOverlaps].map((value) => JSON.stringify(value)).join(", ")}`);
    return { error: errors.join("; "), headers: new Set() };
  }
  return {
    ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
    headers: new Set(values),
  };
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim();
  const cells: string[] = [];
  let cell = "";
  let codeDelimiter = 0;
  let endedWithDelimiter = false;
  let index = 0;
  while (index < trimmed.length) {
    const character = trimmed[index] ?? "";
    if (character === "`") {
      let end = index + 1;
      while (trimmed[end] === "`") end += 1;
      const runLength = end - index;
      cell += trimmed.slice(index, end);
      if (codeDelimiter === 0) codeDelimiter = runLength;
      else if (codeDelimiter === runLength) codeDelimiter = 0;
      endedWithDelimiter = false;
      index = end;
      continue;
    }
    if (character === "\\" && codeDelimiter === 0) {
      let end = index + 1;
      while (trimmed[end] === "\\") end += 1;
      const runLength = end - index;
      const next = trimmed[end];
      if (next === "|" || next === "`") {
        cell += "\\".repeat(Math.floor(runLength / 2));
        if (runLength % 2 === 1) {
          cell += next;
          endedWithDelimiter = false;
          index = end + 1;
          continue;
        }
      } else {
        cell += "\\".repeat(runLength);
      }
      endedWithDelimiter = false;
      index = end;
      continue;
    }
    if (character === "|" && codeDelimiter === 0) {
      cells.push(cell.trim());
      cell = "";
      endedWithDelimiter = true;
      index += 1;
      continue;
    }
    cell += character;
    endedWithDelimiter = false;
    index += 1;
  }
  cells.push(cell.trim());
  if (trimmed.startsWith("|")) cells.shift();
  if (endedWithDelimiter) cells.pop();
  return cells;
}

function separatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function stateLikeHeader(value: string): boolean {
  return STATE_HEADER_WORDS.has(normalize(value).split(" ").at(-1) ?? "");
}

function scanBody(content: string): ScannedBodyLine[] {
  const range = frontmatterRange(content);
  const lines = range?.lines ?? content.split(/\r?\n/);
  const start = range ? range.end + 1 : 0;
  const scanned: ScannedBodyLine[] = [];
  let historicalLevel: number | undefined;
  let fence: { character: string; length: number } | undefined;
  let inHtmlComment = false;
  const visibleText = (raw: string): string => {
    let remaining = raw;
    let visible = "";
    while (remaining.length > 0) {
      if (inHtmlComment) {
        const end = remaining.indexOf("-->");
        if (end < 0) return visible;
        inHtmlComment = false;
        remaining = remaining.slice(end + 3);
        continue;
      }
      const startComment = remaining.indexOf("<!--");
      if (startComment < 0) return visible + remaining;
      visible += remaining.slice(0, startComment);
      remaining = remaining.slice(startComment + 4);
      inHtmlComment = true;
    }
    return visible;
  };
  for (let index = start; index < lines.length; index += 1) {
    const text = visibleText(lines[index] ?? "");
    const fenceMarker = /^\s{0,3}(`{3,}|~{3,})/.exec(text)?.[1];
    if (fenceMarker) {
      const character = fenceMarker[0] ?? "";
      if (!fence) fence = { character, length: fenceMarker.length };
      else if (character === fence.character && fenceMarker.length >= fence.length) fence = undefined;
      scanned.push({ historical: true, lineNumber: index + 1, text: "" });
      continue;
    }
    if (fence || inHtmlComment) {
      scanned.push({ historical: true, lineNumber: index + 1, text: "" });
      continue;
    }
    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(text);
    if (heading) {
      const level = (heading[1] ?? "").length;
      if (historicalLevel !== undefined && level <= historicalLevel) historicalLevel = undefined;
      if (historicalLevel === undefined && HISTORICAL_HEADINGS.test(heading[2] ?? "")) {
        historicalLevel = level;
      }
    }
    scanned.push({ historical: historicalLevel !== undefined, lineNumber: index + 1, text });
  }
  return scanned;
}

function tableChildren(
  lines: readonly ScannedBodyLine[],
  path: string,
  role: ChildRelationshipRole,
  targetHeaders: ReadonlySet<string>,
  nonRelationshipHeaders: ReadonlySet<string>,
): TableScan {
  const children: TableChild[] = [];
  const errors: RelationshipError[] = [];
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const header = lines[index];
    const separator = lines[index + 1];
    if (!header || !separator || header.historical || separator.historical) continue;
    const headerLine = header.text;
    const separatorLine = separator.text;
    if (!headerLine.includes("|") || !separatorLine.includes("|")) continue;
    const headers = splitTableRow(headerLine).map(normalize);
    const childIndexes = headers.flatMap((header, headerIndex) => targetHeaders.has(header) ? [headerIndex] : []);
    const stateIndexes = headers.flatMap((header, headerIndex) => STATE_HEADERS.has(header) ? [headerIndex] : []);
    const unsupportedStateIndexes = headers.flatMap((header, headerIndex) =>
      stateLikeHeader(header) && !STATE_HEADERS.has(header) ? [headerIndex] : []);
    const nonRelationshipIndexes = headers.flatMap((header, headerIndex) =>
      nonRelationshipHeaders.has(header) ? [headerIndex] : []);
    const childIndex = childIndexes[0] ?? -1;
    const stateIndex = stateIndexes[0] ?? -1;
    const hasSeparator = separatorRow(splitTableRow(separatorLine));
    if (childIndexes.length > 1 || stateIndexes.length > 1) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: `relationship table must have exactly one target column and at most one state column; found ${childIndexes.length} targets and ${stateIndexes.length} state columns`,
        related: [`${path}#table-header-${header.lineNumber}`],
      });
    }
    if (childIndexes.length === 0 && nonRelationshipIndexes.length === 1) continue;
    if (childIndexes.length === 0 && nonRelationshipIndexes.length > 1) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: `non-relationship table classification is ambiguous across ${nonRelationshipIndexes.length} columns`,
        related: [`${path}#table-header-${header.lineNumber}`],
      });
      continue;
    }
    if (unsupportedStateIndexes.length > 0) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: `state-like table headers must use a recognized lifecycle column name; unsupported: ${unsupportedStateIndexes.map((headerIndex) => JSON.stringify(headers[headerIndex])).join(", ")}`,
        related: [`${path}#table-header-${header.lineNumber}`],
      });
    }
    if (childIndex < 0) {
      if (stateIndex >= 0 || unsupportedStateIndexes.length > 0) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: `${role} table has a state column but no recognized or declared target column (${headers.map((header) => JSON.stringify(header)).join(", ")})`,
          related: [`${path}#table-header-${header.lineNumber}`],
        });
      }
      continue;
    }
    let row = index + (hasSeparator ? 2 : 1);
    while (row < lines.length && !lines[row]?.historical && (lines[row]?.text ?? "").includes("|")) {
      const bodyLine = lines[row];
      const cells = splitTableRow(bodyLine?.text ?? "");
      const id = cells[childIndex]?.replace(/[`*]/g, "").trim();
      const ref = `${path}#table-row-${bodyLine?.lineNumber ?? row + 1}`;
      const stateValue = stateIndex < 0 ? undefined : cells[stateIndex]?.trim();
      if (!id) {
        if (cells.some((cell) => cell.trim() !== "")) {
          errors.push({
            code: "planning_relationship_unresolved",
            detail: "relationship table row has no target identity",
            related: [ref],
          });
        }
        row += 1;
        continue;
      }
      const state = lifecycle(stateValue);
      if (stateIndex >= 0 && state === "unknown") {
        errors.push({
          code: "planning_relationship_conflict",
          detail: `relationship table row has missing or unrecognized lifecycle ${JSON.stringify(stateValue ?? "")}`,
          related: [ref],
        });
      }
      children.push({ id, ref, state });
      row += 1;
    }
    index = row - 1;
  }
  const uniqueProjections = new Map<string, TableChild>();
  for (const child of children) {
    const key = `${normalizedId(child.id)}\u0000${child.state}`;
    const prior = uniqueProjections.get(key);
    if (!prior || child.ref.localeCompare(prior.ref) < 0) uniqueProjections.set(key, child);
  }
  return {
    children: [...uniqueProjections.values()].sort((left, right) =>
      normalizedId(left.id).localeCompare(normalizedId(right.id))
      || left.state.localeCompare(right.state)
      || left.ref.localeCompare(right.ref)),
    errors,
  };
}

function structuredChildren(
  metadata: JsonObject,
  path: string,
  parentKeys: ReadonlySet<string>,
): TableScan {
  const children: TableChild[] = [];
  const errors: RelationshipError[] = [];
  const parseEntry = (value: unknown, ref: string): void => {
    const direct = scalar(value);
    if (direct) {
      children.push({ id: direct, ref, state: "unknown" });
      return;
    }
    const item = object(value);
    if (!item) {
      errors.push({
        code: "planning_relationship_unresolved",
        detail: "structured relationship entry has no scalar or recognized identity",
        related: [ref],
      });
      return;
    }
    const identityScan = scalarAliasValues(item, STRUCTURED_ID_KEYS, "structured relationship identity");
    const ids = identityScan.values;
    const unsupportedState = unsupportedStateAliasError(item, "structured relationship entry");
    if (unsupportedState) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: unsupportedState,
        related: [ref],
      });
    }
    const nestedParentage = topEntries(item, [
      "artifact_type", "kind", "parent", "parent_id", "parent_ids", "parents", "parents_ids", "review_of", "reviewed_id",
      "subject_id", "target_id", "top_level", "type",
    ]);
    if (nestedParentage.length > 0) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: `structured child projection cannot redeclare type, top-level status, or parentage: ${nestedParentage.map(([key]) => JSON.stringify(key)).join(", ")}`,
        related: [ref],
      });
    }
    if (identityScan.error) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: identityScan.error,
        related: [ref],
      });
    }
    if (ids.length !== 1) {
      errors.push({
        code: ids.length > 1 ? "planning_relationship_conflict" : "planning_relationship_unresolved",
        detail: ids.length > 1
          ? `structured relationship entry resolves to ${ids.length} identities`
          : "structured relationship entry has no recognized identity",
        related: [ref],
      });
      return;
    }
    const stateScan = lifecycleAliasProjection(item, "structured relationship lifecycle");
    if (stateScan.error) {
      errors.push({
        code: "planning_relationship_conflict",
        detail: stateScan.error,
        related: [ref],
      });
    }
    children.push({ id: ids[0] ?? "", ref, state: stateScan.projection.state });
  };

  for (const [key, value] of Object.entries(metadata)) {
    const token = keyToken(key);
    if (!STRUCTURED_CHILD_KEYS.has(token) || parentKeys.has(token)) continue;
    const ref = `${path}#${token}`;
    if (Array.isArray(value)) {
      for (const [index, entry] of value.entries()) parseEntry(entry, `${ref}[${index}]`);
      continue;
    }
    parseEntry(value, ref);
  }
  return { children, errors };
}

function bodyProjection(lines: readonly ScannedBodyLine[]): StateProjection {
  const values: string[] = [];
  for (const line of lines) {
    if (line.historical) continue;
    const match = /^\s*(?:>\s*)*(?:#{1,6}\s*)?(?:[-*]\s*)?(?:\*\*)?(?:(?:current|implementation)[_ -]+)?(?:lifecycle|phase|stage|state|status)(?:\*\*)?\s*:\s*(.+?)\s*$/i.exec(line.text);
    if (match?.[1]) values.push(match[1]);
  }
  return stateProjection(values);
}

function bodyAcceptanceObservations(
  lines: readonly ScannedBodyLine[],
  path: string,
): GateObservation[] {
  const observations: GateObservation[] = [];
  const kindPattern = "(acceptance|holdout|qa|review)";
  const fieldPattern = "(?:(?:current|implementation)[ _-]+)?(?:lifecycle|outcome|phase|result|stage|state|status|verdict)";
  const label = new RegExp(`^${kindPattern}(?:\\s+${fieldPattern})?\\s*:\\s*(.+?)\\s*$`, "i");
  const acceptanceKind = (value: string): string | undefined =>
    ACCEPTANCE_KINDS.find((kind) => new RegExp(`\\b${kind}\\b`, "i").test(value));
  for (const line of lines) {
    if (line.historical) continue;
    const visible = line.text
      .replace(/^\s*(?:>\s*)*/, "")
      .replace(/^\s*#{1,6}\s*/, "")
      .replace(/^\s*[-*+]\s*/, "");
    const unchecked = /^\[\s\]\s*(.+)$/i.exec(visible);
    if (unchecked?.[1]) {
      const kind = acceptanceKind(unchecked[1]);
      if (kind) {
        observations.push({
          kind,
          rationale: false,
          ref: `${path}#line-${line.lineNumber}`,
          state: "unrun",
        });
        continue;
      }
    }
    const plain = visible.replace(/\*\*|__|`/g, "").trim();
    const labelled = label.exec(plain);
    if (labelled?.[1] && labelled[2]) {
      observations.push({
        kind: normalize(labelled[1]),
        rationale: false,
        ref: `${path}#line-${line.lineNumber}`,
        state: acceptance(labelled[2]),
      });
      continue;
    }
    if (/\bpending\b/i.test(plain)) {
      const kind = acceptanceKind(plain);
      if (kind) {
        observations.push({
          kind,
          rationale: false,
          ref: `${path}#line-${line.lineNumber}`,
          state: "unrun",
        });
      }
    }
  }
  return observations;
}

function validAcceptanceScope(value: unknown): boolean {
  const direct = scalar(value);
  if (direct) return acceptance(direct) !== "unknown";
  if (Array.isArray(value)) return value.length > 0 && value.every(validAcceptanceScope);
  const item = object(value);
  if (!item || Object.keys(item).length === 0) return false;
  const entries = Object.entries(item);
  const outcomeTokens = new Set([
    ...ACCEPTANCE_VALUE_FIELDS.map(keyToken),
    ...EXPLICIT_ACCEPTANCE_FIELDS.map(keyToken),
  ]);
  const directOutcomes = entries.filter(([key]) => outcomeTokens.has(keyToken(key)));
  const decisiveTokens = new Set(DECISIVE_ACCEPTANCE_FIELDS.map(keyToken));
  const decisiveOutcomes = directOutcomes.filter(([key]) => decisiveTokens.has(keyToken(key)));
  const selectedOutcomes = decisiveOutcomes.length > 0 ? decisiveOutcomes : directOutcomes;
  const nestedScopes = entries.filter(([key]) => {
    const token = keyToken(key);
    return ACCEPTANCE_KINDS.some((kind) => token === kind || token === `${kind}s`);
  });
  if (selectedOutcomes.length > 0) {
    return selectedOutcomes.every(([, outcome]) => acceptance(scalar(outcome)) !== "unknown");
  }
  if (nestedScopes.length > 0) return true;
  const collectionEntries = entries.filter(([key]) =>
    !new Set(["justification", "rationale", "reason"]).has(keyToken(key)));
  return collectionEntries.length > 0
    && collectionEntries.every(([, child]) => object(child) !== undefined && validAcceptanceScope(child));
}

function unsupportedAcceptanceAliasError(metadata: JsonObject): string | undefined {
  const supported = new Set([
    ...ACCEPTANCE_VALUE_FIELDS.map(keyToken),
    ...EXPLICIT_ACCEPTANCE_FIELDS.map(keyToken),
  ]);
  const unsupported = Object.keys(metadata).filter((key) => {
    const token = keyToken(key);
    const words = normalize(key).split(" ");
    return words.some((word) => ACCEPTANCE_OUTCOME_WORDS.has(word)) && !supported.has(token);
  });
  return unsupported.length > 0
    ? `acceptance scope contains unsupported outcome-like aliases: ${unsupported.map((key) => JSON.stringify(key)).join(", ")}`
    : undefined;
}

function acceptanceDeclarationErrors(
  metadata: JsonObject,
  path: string,
  artifactTypeValue: string,
  isAcceptance: boolean,
): RelationshipError[] {
  const errors: RelationshipError[] = [];
  const fields = ACCEPTANCE_VALUE_FIELDS;
  const kinds = ACCEPTANCE_KINDS;
  const visit = (value: unknown, trail: readonly string[]): void => {
    const item = object(value);
    if (!item) {
      if (Array.isArray(value)) value.forEach((entry, index) => visit(entry, [...trail, String(index)]));
      return;
    }
    const trailWords = trail.flatMap((part) => normalize(part).split(" "));
    if (trailWords.some((word) => ACCEPTANCE_WORDS.has(word) || ACCEPTANCE_WORDS.has(word.replace(/s$/, "")))) {
      const unsupportedState = unsupportedStateAliasError(item, "acceptance scope");
      const unsupportedOutcome = unsupportedAcceptanceAliasError(item);
      if (unsupportedState) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: unsupportedState,
          related: [`${path}#${trail.join(".")}`],
        });
      }
      if (unsupportedOutcome) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: unsupportedOutcome,
          related: [`${path}#${trail.join(".")}`],
        });
      }
    }
    for (const [scopeKey, scopeValue] of Object.entries(item)) {
      const scope = keyToken(scopeKey);
      if (!kinds.some((kind) => scope === kind || scope === `${kind}s`)) continue;
      if (!validAcceptanceScope(scopeValue)) {
        errors.push({
          code: "planning_relationship_unresolved",
          detail: `acceptance scope ${JSON.stringify(scopeKey)} is empty or malformed`,
          related: [`${path}#${[...trail, scope].join(".")}`],
        });
      }
    }
    for (const kind of kinds) {
      const contextual = trailWords.some((word) => word === kind || word === `${kind}s`)
        || (trail.length === 0 && isAcceptance && gateKind([artifactTypeValue, path]) === kind);
      const prefixedKeys = fields.map((field) => `${kind}_${field}`);
      const keys = contextual ? [...prefixedKeys, ...fields] : prefixedKeys;
      const decisiveKeys = contextual
        ? [`${kind}_outcome`, `${kind}_result`, `${kind}_verdict`, "outcome", "result", "verdict"]
        : [`${kind}_outcome`, `${kind}_result`, `${kind}_verdict`];
      const projection = scalarAliasValues(
        item,
        topEntries(item, decisiveKeys).length > 0 ? decisiveKeys : keys,
        `${kind} outcome`,
      );
      const rationaleFields = ["justification", "rationale", "reason"] as const;
      const prefixedRationaleKeys = rationaleFields.map((field) => `${kind}_${field}`);
      const rationaleKeys = contextual
        ? [...prefixedRationaleKeys, ...rationaleFields]
        : prefixedRationaleKeys;
      const rationale = scalarAliasValues(item, rationaleKeys, `${kind} rationale`);
      if (!projection.present && !rationale.present) continue;
      if (projection.error) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: projection.error,
          related: [`${path}#${[...trail, kind].join(".")}`],
        });
      }
      const unknownOutcomes = projection.values.filter((value) => acceptance(value) === "unknown");
      if (unknownOutcomes.length > 0) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: `${kind} outcome contains unsupported values: ${unknownOutcomes.map((value) => JSON.stringify(value)).join(", ")}`,
          related: [`${path}#${[...trail, kind].join(".")}`],
        });
      }
      if (rationale.error) {
        errors.push({
          code: "planning_relationship_conflict",
          detail: rationale.error,
          related: [`${path}#${[...trail, kind, "rationale"].join(".")}`],
        });
      }
    }
    for (const [key, child] of Object.entries(item)) visit(child, [...trail, keyToken(key)]);
  };
  visit(metadata, []);
  return errors;
}

function parseArtifact(source: PlanningSource): Artifact {
  const parsed = parseSource(source);
  const typeProjection = artifactType(source.path, parsed.metadata);
  const type = typeProjection.type;
  const isAcceptance = acceptanceArtifact(source.path, type);
  const lane = pathLane(source.path);
  const declaredScan = lifecycleAliasProjection(parsed.metadata, "artifact lifecycle", isAcceptance);
  const unsupportedStateError = unsupportedStateAliasError(parsed.metadata, "artifact");
  const declaredProjection = declaredScan.projection;
  const declared = declaredProjection.state;
  const identity = artifactIdentity(source.path, type, parsed.metadata);
  const nonArtifactRequested = isNonArtifactPlanningClass(source.declaredClass ?? "")
    || isNonArtifactPlanningClass(type);
  const classificationRationale = scalarAliasValues(
    parsed.metadata,
    ["classification_rationale", "justification", "non_artifact_rationale", "rationale", "reason"],
    "classification rationale",
  );
  const nonArtifactRationale = Boolean(source.classificationRationale?.trim())
    || classificationRationale.values.length > 0;
  const topLevelScan = topLevelProjection(parsed.metadata);
  const topLevel = topLevelScan.value;
  const extension = extname(source.path).toLocaleLowerCase("und");
  const scannedBody = new Set([".md", ".mdx", ".txt"]).has(extension)
    ? scanBody(source.content)
    : [];
  const currentBody = bodyProjection(scannedBody);
  const bodyGateObservations = bodyAcceptanceObservations(scannedBody, source.path);
  const parentScan = parentReferences(parsed.metadata, type, isAcceptance, source.path);
  const parentIds = parentScan.ids;
  const relationshipRole = childRelationshipRole(parsed.metadata, type);
  const targetHeaders = relationshipTargetHeaders(parsed.metadata, relationshipRole.role);
  const nonRelationshipHeaders = nonRelationshipTableHeaders(parsed.metadata, relationshipRole.role);
  const scannedTables = tableChildren(
    scannedBody,
    source.path,
    relationshipRole.role,
    targetHeaders.headers,
    nonRelationshipHeaders.headers,
  );
  const structuredRelationships = structuredChildren(
    parsed.metadata,
    source.path,
    new Set(parentReferenceKeys(type, isAcceptance).map(keyToken)),
  );
  const acceptanceErrors = acceptanceDeclarationErrors(parsed.metadata, source.path, type, isAcceptance);
  const relationshipErrors: RelationshipError[] = [
    ...(typeProjection.error ? [{ code: "planning_relationship_conflict" as const, detail: typeProjection.error, related: [] }] : []),
    ...(identity.error ? [{ code: "planning_relationship_conflict" as const, detail: identity.error, related: [] }] : []),
    ...(declaredScan.error ? [{ code: "planning_relationship_conflict" as const, detail: declaredScan.error, related: [] }] : []),
    ...(unsupportedStateError ? [{ code: "planning_relationship_conflict" as const, detail: unsupportedStateError, related: [] }] : []),
    ...(classificationRationale.error ? [{ code: "planning_relationship_conflict" as const, detail: classificationRationale.error, related: [] }] : []),
    ...(topLevelScan.error ? [{ code: "planning_relationship_conflict" as const, detail: topLevelScan.error, related: [] }] : []),
    ...(relationshipRole.error ? [{ code: "planning_relationship_conflict" as const, detail: relationshipRole.error, related: [] }] : []),
    ...(targetHeaders.error ? [{ code: "planning_relationship_conflict" as const, detail: targetHeaders.error, related: [] }] : []),
    ...(nonRelationshipHeaders.error ? [{ code: "planning_relationship_conflict" as const, detail: nonRelationshipHeaders.error, related: [] }] : []),
    ...parentScan.errors,
    ...scannedTables.errors,
    ...structuredRelationships.errors,
    ...acceptanceErrors,
  ];
  const table = [
    ...scannedTables.children,
    ...structuredRelationships.children,
  ];
  const metadataHasAcceptanceSignal = deepEntries(parsed.metadata).some((entry) =>
    [...ACCEPTANCE_WORDS].some((word) => entry.path.join("_").includes(word)));
  const nestedCanonicalPlanningSignal = hasNestedCanonicalPlanningSignal(parsed.metadata);
  const typedPlanningArtifact = PLANNING_ARTIFACT_TYPES.has(type);
  const hasPlanningSignals = lane !== "unknown" || declaredProjection.values.length > 0 || currentBody.values.length > 0
    || identity.explicit || isAcceptance || parentIds.length > 0 || table.length > 0
    || bodyGateObservations.length > 0 || metadataHasAcceptanceSignal || nestedCanonicalPlanningSignal
    || topLevel || typedPlanningArtifact
    || relationshipErrors.length > 0 || hasRawPlanningSignal(parsed.metadata, type)
    || topEntries(parsed.metadata, [
      "child_relationship_role", "child_target_column", "relationship_role", "relationship_target_column",
      "rollup_target_column",
    ]).length > 0;
  const nonArtifact = nonArtifactRequested && nonArtifactRationale && !hasPlanningSignals;
  const structuredSurface = parsed.structured || table.length > 0 || currentBody.values.length > 0;
  const structured = parsed.parseError === undefined && (nonArtifact || (structuredSurface && hasPlanningSignals));
  const state = lane !== "unknown"
    ? lane
    : declaredProjection.values.length > 0
      ? declared
      : currentBody.state;
  return {
    acceptance: isAcceptance,
    bodyGateObservations,
    bodyProjection: currentBody,
    childRelationshipRole: relationshipRole.role,
    content: source.content,
    declared,
    declaredClass: lifecycle(source.declaredClass),
    declaredProjection,
    id: identity.id,
    lane,
    metadata: parsed.metadata,
    nonArtifact,
    nonArtifactRationale,
    nonArtifactRequested,
    parentIds,
    parentReferences: parentScan.references,
    ...(parsed.parseError === undefined ? {} : { parseError: parsed.parseError }),
    path: source.path,
    relationshipErrors,
    state,
    structured,
    tableChildren: table,
    topLevel,
    type,
  };
}

function finding(
  code: PlanningFindingCode,
  artifact: Artifact,
  detail: string,
  related: readonly string[] = [],
): PlanningFinding {
  return { code, detail, path: artifact.path, related: [...new Set(related)].sort(), subject: artifact.id };
}

function gateKind(path: readonly string[], fallback = "acceptance"): string {
  const words = path.flatMap((part) => normalize(part).split(" "));
  for (const kind of ["holdout", "review", "qa", "acceptance"]) if (words.includes(kind)) return kind;
  return fallback;
}

function gateHasRationale(metadata: JsonObject, kind: string, outcomePath: readonly string[]): boolean {
  const outcomeContainer = outcomePath.slice(0, -1).join(".");
  return deepEntries(metadata).some((entry) => {
    const last = entry.path.at(-1) ?? "";
    const rationaleFields = new Set(["justification", "rationale", "reason"]);
    const base = last.startsWith(`${kind}_`) ? last.slice(kind.length + 1) : last;
    if (!rationaleFields.has(base) || !scalar(entry.value)) return false;
    return entry.path.slice(0, -1).join(".") === outcomeContainer;
  });
}

function embeddedGateObservations(parent: Artifact): GateObservation[] {
  const candidates: Array<GateObservation & { readonly explicit: boolean; readonly scope: string }> = [];
  const stateFields = new Set([
    "current_lifecycle", "current_phase", "current_stage", "current_state", "current_status",
    "implementation_status", "lifecycle", "phase", "stage", "state", "status",
  ]);
  const outcomeFields = new Set(["outcome", "result", "verdict"]);
  for (const entry of deepEntries(parent.metadata)) {
    const last = entry.path.at(-1) ?? "";
    const joined = entry.path.join("_");
    const hasAcceptance = [...ACCEPTANCE_WORDS].some((word) => joined.includes(word));
    const scopeKind = [...entry.path].reverse().flatMap((part) =>
      [...ACCEPTANCE_WORDS].filter((word) => part === word || part === `${word}s`)).at(0);
    if (scopeKind && (last === scopeKind || last === `${scopeKind}s` || /^\d+$/.test(last))) {
      candidates.push({
        explicit: true,
        kind: scopeKind,
        rationale: gateHasRationale(parent.metadata, scopeKind, entry.path),
        ref: `${parent.path}#${entry.path.join(".")}`,
        scope: `${scopeKind}\u0000${entry.path.slice(0, -1).join(".")}`,
        state: acceptance(scalar(entry.value)),
      });
      continue;
    }
    const genericField = stateFields.has(last);
    const explicitField = outcomeFields.has(last)
      || [...ACCEPTANCE_WORDS].some((word) =>
        new Set([...outcomeFields, ...stateFields]).has(last.replace(`${word}_`, ""))
        && last.startsWith(`${word}_`));
    const stateField = genericField || explicitField;
    if (!hasAcceptance || !stateField) continue;
    const kind = gateKind(entry.path);
    candidates.push({
      explicit: explicitField,
      kind,
      rationale: gateHasRationale(parent.metadata, kind, entry.path),
      ref: `${parent.path}#${entry.path.join(".")}`,
      scope: `${kind}\u0000${entry.path.slice(0, -1).join(".")}`,
      state: acceptance(scalar(entry.value)),
    });
  }
  const explicitScopes = new Set(candidates.filter((candidate) => candidate.explicit).map((candidate) => candidate.scope));
  return candidates
    .filter((candidate) => candidate.explicit || !explicitScopes.has(candidate.scope))
    .map(({ kind, rationale, ref, state }) => ({ kind, rationale, ref, state }));
}

function artifactGateObservations(artifact: Artifact): GateObservation[] {
  const explicit = topEntries(artifact.metadata, EXPLICIT_ACCEPTANCE_FIELDS);
  const selected = explicit.length > 0 ? explicit : topEntries(artifact.metadata, ["status"]);
  const kind = gateKind([artifact.type, artifact.path], artifact.type);
  const rationale = topValues(artifact.metadata, ["justification", "rationale", "reason"]).length > 0;
  const direct: GateObservation[] = selected.length === 0
    ? [{ kind, rationale, ref: artifact.path, state: "unknown" }]
    : selected.map(([, value]) => ({
    kind,
    rationale,
    ref: artifact.path,
    state: acceptance(scalar(value)),
  }));
  return [...direct, ...embeddedGateObservations(artifact), ...artifact.bodyGateObservations];
}

function acceptanceGates(parent: Artifact, artifacts: readonly Artifact[]): AcceptanceGate[] {
  const observations = [...embeddedGateObservations(parent), ...parent.bodyGateObservations];
  for (const artifact of artifacts) {
    if (!artifact.acceptance || artifact.state === "archived") continue;
    if (!artifact.parentIds.some((id) => normalizedId(id) === normalizedId(parent.id))) continue;
    observations.push(...artifactGateObservations(artifact));
  }
  const grouped = new Map<string, GateObservation[]>();
  for (const observation of observations) {
    const current = grouped.get(observation.kind) ?? [];
    current.push(observation);
    grouped.set(observation.kind, current);
  }
  return [...grouped.entries()].map(([kind, values]) => {
    const states = [...new Set(values.map((value) => value.state))].sort();
    const unreasonedExemption = values.some((value) => value.state === "not_applicable" && !value.rationale);
    const state: Acceptance = states.includes("failed") ? "failed"
      : states.includes("unrun") ? "unrun"
        : states.includes("unknown") || unreasonedExemption ? "unknown"
          : states.includes("not_applicable") ? "not_applicable"
            : "passed";
    return {
      kind,
      refs: unique(values.map((value) => value.ref)).sort(),
      state,
      states,
    };
  }).sort((left, right) => left.kind.localeCompare(right.kind));
}

function sameProjection(left: Lifecycle, right: Lifecycle): boolean {
  return left === "unknown" || right === "unknown" || left === right;
}

function addRelationship(
  childrenByParent: Map<Artifact, Set<Artifact>>,
  parent: Artifact,
  child: Artifact,
): void {
  const children = childrenByParent.get(parent) ?? new Set<Artifact>();
  children.add(child);
  childrenByParent.set(parent, children);
}

function relationshipCycles(childrenByParent: ReadonlyMap<Artifact, ReadonlySet<Artifact>>): Artifact[][] {
  const nodes = new Set<Artifact>();
  for (const [parent, children] of childrenByParent) {
    nodes.add(parent);
    for (const child of children) nodes.add(child);
  }
  const indexByNode = new Map<Artifact, number>();
  const lowLink = new Map<Artifact, number>();
  const onStack = new Set<Artifact>();
  const stack: Artifact[] = [];
  const cycles: Artifact[][] = [];
  let nextIndex = 0;

  const visit = (node: Artifact): void => {
    const nodeIndex = nextIndex;
    nextIndex += 1;
    indexByNode.set(node, nodeIndex);
    lowLink.set(node, nodeIndex);
    stack.push(node);
    onStack.add(node);

    const children = [...(childrenByParent.get(node) ?? [])]
      .sort((left, right) => left.path.localeCompare(right.path));
    for (const child of children) {
      if (!indexByNode.has(child)) {
        visit(child);
        lowLink.set(node, Math.min(lowLink.get(node) ?? nodeIndex, lowLink.get(child) ?? nodeIndex));
      } else if (onStack.has(child)) {
        lowLink.set(node, Math.min(lowLink.get(node) ?? nodeIndex, indexByNode.get(child) ?? nodeIndex));
      }
    }

    if (lowLink.get(node) !== nodeIndex) return;
    const component: Artifact[] = [];
    while (stack.length > 0) {
      const member = stack.pop();
      if (!member) break;
      onStack.delete(member);
      component.push(member);
      if (member === node) break;
    }
    const selfLoop = component.length === 1 && Boolean(childrenByParent.get(node)?.has(node));
    if (component.length > 1 || selfLoop) {
      cycles.push(component.sort((left, right) => left.path.localeCompare(right.path)));
    }
  };

  for (const node of [...nodes].sort((left, right) => left.path.localeCompare(right.path))) {
    if (!indexByNode.has(node)) visit(node);
  }
  return cycles.sort((left, right) => (left[0]?.path ?? "").localeCompare(right[0]?.path ?? ""));
}

export function isPlanningTextPath(path: string): boolean {
  return TEXT_EXTENSIONS.has(extname(path).toLocaleLowerCase("und"));
}

export function auditPlanningArtifacts(
  sources: readonly PlanningSource[],
  planningRootCount = sources.length > 0 ? 1 : 0,
): PlanningAuditResult {
  const artifacts = sources.map(parseArtifact);
  const findings: PlanningFinding[] = [];

  for (const artifact of artifacts) {
    if (artifact.nonArtifactRequested && !artifact.nonArtifact) {
      findings.push(finding(
        "planning_input_unparsed",
        artifact,
        artifact.nonArtifactRationale
          ? "non-artifact classification conflicts with lifecycle, identity, relationship, table-child, or acceptance signals"
          : "non-artifact classification requires an explicit structured rationale and cannot be established by class label alone",
      ));
    } else if (!artifact.structured && !artifact.nonArtifact) {
      findings.push(finding(
        "planning_input_unparsed",
        artifact,
        `planning input could not be structurally interpreted: ${artifact.parseError ?? "no lifecycle, relationship, or explicit non-artifact classification"}`,
      ));
    }
    if (artifact.structured && !artifact.nonArtifact) {
      for (const error of artifact.relationshipErrors) {
        findings.push(finding(
          error.code,
          artifact,
          error.detail,
          error.related,
        ));
      }
    }
    if (artifact.declaredClass === "archived" && artifact.lane !== "archived" && artifact.declared !== "archived") {
      findings.push(finding(
        "archive_classification_conflict",
        artifact,
        "bundle class claims archive but neither physical lane nor artifact lifecycle proves archival state",
      ));
    }
    if (!artifact.structured || artifact.nonArtifact) continue;
    const declaredProjection = artifact.declaredProjection;
    const declaredStates = declaredProjection.states.filter((state) => state !== "unknown");
    if (declaredProjection.values.length > 0 && artifact.declared === "unknown") {
      findings.push(finding(
        "lifecycle_state_unknown",
        artifact,
        declaredStates.length > 1
          ? `declared lifecycle fields have conflicting recognized projections: ${declaredStates.join(", ")}`
          : declaredStates.length === 1
            ? `declared lifecycle fields mix recognized and unrecognized projections: ${declaredProjection.values.map((value) => JSON.stringify(value)).join(", ")}`
            : `declared lifecycle ${declaredProjection.values.map((value) => JSON.stringify(value)).join(", ")} is outside the recognized vocabulary`,
      ));
    } else if (declaredProjection.values.length === 0 && artifact.state === "unknown" && !artifact.acceptance) {
      findings.push(finding(
        "lifecycle_state_unknown",
        artifact,
        "planning artifact has no recognized lifecycle in its lane, metadata, or current body",
      ));
    }
    if (artifact.lane !== "unknown" && artifact.declared !== "unknown" && !sameProjection(artifact.lane, artifact.declared)) {
      findings.push(finding(
        "lane_status_conflict",
        artifact,
        `physical lane is ${artifact.lane} but declared lifecycle is ${artifact.declared}`,
      ));
    }
    const bodyProjection = artifact.bodyProjection;
    const bodyStates = bodyProjection.states.filter((state) => state !== "unknown");
    if (bodyProjection.values.length > 0 && bodyProjection.state === "unknown") {
      findings.push(finding(
        "body_projection_conflict",
        artifact,
        bodyStates.length > 1
          ? `current body has conflicting recognized lifecycle projections: ${bodyStates.join(", ")}`
          : `current body includes an unrecognized lifecycle projection: ${bodyProjection.values.map((value) => JSON.stringify(value)).join(", ")}`,
      ));
    } else if (bodyProjection.state !== "unknown" && artifact.state !== "unknown" && !sameProjection(artifact.state, bodyProjection.state)) {
      findings.push(finding(
        "body_projection_conflict",
        artifact,
        `effective lifecycle is ${artifact.state} but current body projects ${bodyProjection.state}`,
      ));
    }
  }

  const byId = new Map<string, Artifact[]>();
  for (const artifact of artifacts) {
    if (!artifact.structured || artifact.nonArtifact) continue;
    const key = normalizedId(artifact.id);
    const current = byId.get(key) ?? [];
    current.push(artifact);
    byId.set(key, current);
  }
  for (const duplicates of byId.values()) {
    if (duplicates.length < 2) continue;
    for (const artifact of duplicates) {
      findings.push(finding(
        "duplicate_artifact_id",
        artifact,
        `artifact id ${JSON.stringify(artifact.id)} resolves from ${duplicates.length} artifacts`,
        duplicates.filter((item) => item !== artifact).map((item) => item.path),
      ));
    }
  }

  for (const artifact of artifacts) {
    if (!artifact.structured || artifact.acceptance || artifact.nonArtifact) continue;
    if (artifact.childRelationshipRole !== "child_parentage"
      || !LEAF_ARTIFACT_TYPES.has(artifact.type)
      || artifact.tableChildren.length === 0) continue;
    findings.push(finding(
      "planning_relationship_conflict",
      artifact,
      `leaf ${artifact.type} artifact declares ${artifact.tableChildren.length} child projection${artifact.tableChildren.length === 1 ? "" : "s"}`,
      artifact.tableChildren.map((child) => child.ref),
    ));
  }

  const childrenByParent = new Map<Artifact, Set<Artifact>>();
  const explicitParents = new Map<Artifact, Set<Artifact>>();
  const archiveBoundaryEdges = new Set<string>();
  const archiveCompatible = (parent: Artifact, child: Artifact, ref: string): boolean => {
    const parentArchived = parent.state === "archived";
    const childArchived = child.state === "archived";
    if (parentArchived === childArchived) return true;
    const key = `${parent.path}\u0000${child.path}`;
    if (!archiveBoundaryEdges.has(key)) {
      archiveBoundaryEdges.add(key);
      findings.push(finding(
        "planning_relationship_conflict",
        child,
        `partial archive graph: child is ${childArchived ? "archived" : "live"} but parent ${JSON.stringify(parent.id)} is ${parentArchived ? "archived" : "live"}`,
        [parent.path, ref],
      ));
    }
    return false;
  };
  for (const child of artifacts) {
    if (!child.structured || child.acceptance || child.nonArtifact) continue;
    const resolved = new Set<Artifact>();
    for (const observation of child.parentReferences) {
      const parentId = observation.id;
      const matches = (byId.get(normalizedId(parentId)) ?? [])
        .filter((item) => !item.acceptance && !item.nonArtifact);
      if (matches.length === 0) {
        findings.push(finding(
          "orphan_parent_reference",
          child,
          `declared parent ${JSON.stringify(parentId)} does not resolve to an artifact`,
        ));
        continue;
      }
      if (matches.length > 1) {
        findings.push(finding(
          "planning_relationship_conflict",
          child,
          `declared parent ${JSON.stringify(parentId)} resolves ambiguously to ${matches.length} artifacts`,
          matches.map((item) => item.path),
        ));
        continue;
      }
      const parent = matches[0];
      if (!parent) continue;
      if (observation.state !== "unknown" && parent.state !== "unknown"
        && !sameProjection(observation.state, parent.state)) {
        findings.push(finding(
          "parent_child_projection_conflict",
          child,
          `declared parent ${JSON.stringify(parent.id)} is ${parent.state} but the parent reference projects ${observation.state}`,
          [parent.path, observation.ref],
        ));
      }
      if (!archiveCompatible(parent, child, observation.ref)) continue;
      resolved.add(parent);
      addRelationship(childrenByParent, parent, child);
    }
    explicitParents.set(child, resolved);
    if (child.topLevel && child.parentReferences.length > 0) {
      findings.push(finding(
        "planning_relationship_conflict",
        child,
        "top-level artifact also declares parentage",
        child.parentReferences.map((reference) => reference.ref),
      ));
    }
    if (resolved.size > 1) {
      findings.push(finding(
        "planning_relationship_conflict",
        child,
        `child resolves to ${resolved.size} distinct explicit parents`,
        [...resolved].map((item) => item.path),
      ));
    }
  }

  for (const gate of artifacts) {
    if (!gate.structured || !gate.acceptance || gate.nonArtifact) continue;
    if (gate.parentIds.length === 0) {
      findings.push(finding(
        "planning_relationship_unresolved",
        gate,
        "acceptance artifact is not paired to a parent",
      ));
      continue;
    }
    const matchedParents = new Map<string, Artifact>();
    for (const observation of gate.parentReferences) {
      for (const parent of byId.get(normalizedId(observation.id)) ?? []) {
        if (parent.acceptance || parent.nonArtifact) continue;
        matchedParents.set(parent.path, parent);
        if (observation.state !== "unknown" && parent.state !== "unknown"
          && !sameProjection(observation.state, parent.state)) {
          findings.push(finding(
            "parent_child_projection_conflict",
            gate,
            `declared parent ${JSON.stringify(parent.id)} is ${parent.state} but the acceptance reference projects ${observation.state}`,
            [parent.path, observation.ref],
          ));
        }
      }
    }
    const eligibleParents = [...matchedParents.values()]
      .filter((parent) => gate.state === "archived" || archiveCompatible(parent, gate, `${gate.path}#parent`))
      .sort((left, right) => left.path.localeCompare(right.path));
    if (matchedParents.size === 0) {
      findings.push(finding(
        "orphan_parent_reference",
        gate,
        `acceptance parent references do not resolve: ${gate.parentIds.map((id) => JSON.stringify(id)).join(", ")}`,
      ));
    } else if (eligibleParents.length === 0) {
      findings.push(finding(
        "planning_relationship_unresolved",
        gate,
        "live acceptance artifact resolves only to archived parents",
        [...matchedParents.keys()].sort(),
      ));
    } else if (eligibleParents.length > 1) {
      findings.push(finding(
        "planning_relationship_conflict",
        gate,
        `acceptance artifact resolves to ${eligibleParents.length} parents`,
        eligibleParents.map((parent) => parent.path),
      ));
    }
  }

  for (const parent of artifacts) {
    if (!parent.structured || parent.acceptance || parent.nonArtifact) continue;
    for (const tableChild of parent.tableChildren) {
      const matches = (byId.get(normalizedId(tableChild.id)) ?? [])
        .filter((item) => !item.acceptance && !item.nonArtifact);
      if (matches.length === 0) {
        findings.push(finding(
          "planning_relationship_unresolved",
          parent,
          `declared child ${JSON.stringify(tableChild.id)} does not resolve to an artifact`,
          [tableChild.ref],
        ));
        continue;
      }
      if (matches.length > 1) {
        findings.push(finding(
          "planning_relationship_conflict",
          parent,
          `declared child ${JSON.stringify(tableChild.id)} resolves ambiguously to ${matches.length} artifacts`,
          [tableChild.ref, ...matches.map((item) => item.path)],
        ));
        continue;
      }
      const child = matches[0];
      if (!child) continue;
      if (tableChild.state !== "unknown" && child.state !== "unknown" && !sameProjection(tableChild.state, child.state)) {
        findings.push(finding(
          "parent_child_projection_conflict",
          parent,
          `${child.id} is ${child.state} but the ${parent.childRelationshipRole === "rollup_projection" ? "rollup" : "parent"} projects ${tableChild.state}`,
          [child.path, tableChild.ref],
        ));
      }
      if (parent.childRelationshipRole === "rollup_projection") continue;
      if (!archiveCompatible(parent, child, tableChild.ref)) continue;
      if (child.topLevel) {
        findings.push(finding(
          "planning_relationship_conflict",
          child,
          `top-level artifact is projected as a child of ${JSON.stringify(parent.id)}`,
          [parent.path, tableChild.ref],
        ));
      }
      const parents = explicitParents.get(child) ?? new Set<Artifact>();
      if (parents.size > 0 && !parents.has(parent)) {
        findings.push(finding(
          "planning_relationship_conflict",
          child,
          `${parent.id} projects this child but its explicit parent resolves elsewhere`,
          [parent.path, tableChild.ref, ...[...parents].map((item) => item.path)],
        ));
      }
      addRelationship(childrenByParent, parent, child);
    }
  }

  for (const cycle of relationshipCycles(childrenByParent)) {
    for (const member of cycle) {
      findings.push(finding(
        "planning_relationship_conflict",
        member,
        `planning relationship cycle contains ${cycle.length} artifact${cycle.length === 1 ? "" : "s"}`,
        cycle.filter((artifact) => artifact !== member).map((artifact) => artifact.path),
      ));
    }
  }

  for (const child of artifacts) {
    if (!child.structured || child.acceptance || child.nonArtifact || child.topLevel) continue;
    if (!LEAF_ARTIFACT_TYPES.has(child.type)) continue;
    const parents = [...childrenByParent.entries()]
      .filter(([, children]) => children.has(child))
      .map(([parent]) => parent);
    if (parents.length === 0) {
      findings.push(finding(
        "planning_relationship_unresolved",
        child,
        "leaf planning artifact is not paired to exactly one parent; declare parent_id, place it in an exact parent child table, or mark top_level: true",
        child.parentIds,
      ));
    } else if (parents.length > 1) {
      findings.push(finding(
        "planning_relationship_conflict",
        child,
        `leaf planning artifact resolves to ${parents.length} parents`,
        parents.map((parent) => parent.path),
      ));
    }
  }

  for (const parent of artifacts) {
    if (!parent.structured || parent.acceptance || parent.state === "archived" || parent.nonArtifact) continue;
    const children = [...(childrenByParent.get(parent) ?? [])]
      .sort((left, right) => left.path.localeCompare(right.path));
    const started = children.filter((child) => new Set<Lifecycle>(["active", "done"]).has(child.state));
    const unfinished = children.filter((child) => child.state !== "done");
    if (parent.state === "done" && unfinished.length > 0) {
      findings.push(finding(
        "parent_child_projection_conflict",
        parent,
        `parent is done while ${unfinished.length}/${children.length} direct children are not done`,
        unfinished.map((child) => child.path),
      ));
    }
    if (parent.declared === "preexecution" && started.length > 0) {
      findings.push(finding(
        "preexecution_parent_has_started_children",
        parent,
        `parent is preexecution while ${started.length}/${children.length} direct children have started`,
        started.map((child) => child.path),
      ));
    }

    const gates = acceptanceGates(parent, artifacts);
    for (const gate of gates) {
      if (gate.states.length > 1) {
        findings.push(finding(
          "acceptance_gate_identity_conflict",
          parent,
          `${gate.kind} gate has conflicting projections: ${gate.states.join(", ")}`,
          gate.refs,
        ));
      }
      if (gate.state === "unknown") {
        findings.push(finding(
          "acceptance_gate_unknown",
          parent,
          gate.states.includes("not_applicable")
            ? `${gate.kind} gate claims not_applicable without a structured rationale`
            : `${gate.kind} gate state is missing or outside the recognized vocabulary`,
          gate.refs,
        ));
      }
    }

    const allChildrenDone = children.length > 0 && children.every((child) => child.state === "done");
    if (allChildrenDone && gates.length === 0) {
      findings.push(finding(
        "acceptance_gate_undiscovered",
        parent,
        `all ${children.length} direct children are done but no acceptance gate can be identified`,
        children.map((child) => child.path),
      ));
    }
    const unrun = gates.filter((gate) => gate.state === "unrun");
    const failed = gates.filter((gate) => gate.state === "failed");
    if (allChildrenDone && unrun.length > 0) {
      findings.push(finding(
        "acceptance_cascade_unexecuted",
        parent,
        `all ${children.length} direct children are done but ${unrun.length}/${gates.length} acceptance gates are unexecuted`,
        unrun.flatMap((gate) => gate.refs),
      ));
    }
    if (failed.length > 0) {
      findings.push(finding(
        "acceptance_failure_unpaid",
        parent,
        `${failed.length}/${gates.length} acceptance gates record failure`,
        failed.flatMap((gate) => gate.refs),
      ));
    }
    if (!allChildrenDone && parent.state === "done" && unrun.length > 0) {
      findings.push(finding(
        "completed_parent_unexecuted_acceptance",
        parent,
        `completed parent has ${unrun.length}/${gates.length} unexecuted acceptance gates`,
        unrun.flatMap((gate) => gate.refs),
      ));
    }
    if (allChildrenDone && gates.length > 0
      && gates.every((gate) => new Set<Acceptance>(["not_applicable", "passed"]).has(gate.state))
      && parent.declared !== "done") {
      findings.push(finding(
        "parent_completion_stale",
        parent,
        `all ${children.length} direct children and all ${gates.length} acceptance gates are complete but the parent is ${parent.declared}`,
        gates.flatMap((gate) => gate.refs),
      ));
    }
  }

  const ordered = findings.sort((left, right) =>
    left.code.localeCompare(right.code)
    || left.path.localeCompare(right.path)
    || left.detail.localeCompare(right.detail));
  const counts = Object.fromEntries(
    FINDING_CODES.map((code) => [code, ordered.filter((item) => item.code === code).length]),
  ) as Record<PlanningFindingCode, number>;
  const status = planningRootCount === 0 ? "not_applicable" : ordered.length > 0 ? "fail" : "pass";
  return {
    artifactCount: artifacts.length,
    counts,
    exitCode: ordered.length > 0 ? 1 : 0,
    findings: ordered,
    planningRootCount,
    status,
    structuredArtifactCount: artifacts.filter((artifact) => artifact.structured).length,
  };
}

export function auditPlanningRepository(repository: string): PlanningAuditResult {
  const root = resolve(repository);
  assertDirectory(root);
  const planningRoots = discoverPlanningRoots(root);
  const sources: PlanningSource[] = [];
  const appendEntry = (entry: { readonly kind: "file" | "other" | "symlink"; readonly path: string }): void => {
    const relativePath = relative(root, entry.path).split(sep).join("/");
    if (entry.kind !== "file" || !isPlanningTextPath(entry.path)) {
      sources.push({ content: "", path: relativePath });
      return;
    }
    let content = "";
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(entry.path));
    } catch {
      sources.push({ content: "", path: relativePath });
      return;
    }
    sources.push({ content: content.includes("\0") ? "" : content, path: relativePath });
  };
  for (const rootText of planningRoots) {
    const rootPath = resolve(root, rootText);
    const rootStat = lstatSync(rootPath);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      appendEntry({ kind: rootStat.isFile() ? "file" : rootStat.isSymbolicLink() ? "symlink" : "other", path: rootPath });
      continue;
    }
    for (const entry of listEntriesRecursively(rootPath)) appendEntry(entry);
  }
  return auditPlanningArtifacts(sources, planningRoots.length);
}
