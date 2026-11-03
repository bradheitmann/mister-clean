/**
 * Durable eval cases: `mister-clean.eval-case/1`.
 *
 * One record per replayed field failure (charter Slice Zero, guarantee G2).
 * The record cites, never copies: the narrative case file, the card the replay
 * was derived from, the tallies the counts come from (each by repository-
 * relative path plus sha256), exactly two agent cards by registry ref, the
 * constant verifier by sha256, and the base commit. The validator binds every
 * citation against a repository root and refuses the record when any one does
 * not bind. It is read-only and writes nothing.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { isRepositoryRelativePath } from "./run-receipt.js";

export const EVAL_CASE_RECORD_TYPE = "mister-clean.eval-case";
export const EVAL_CASE_SCHEMA_VERSION = "1";
export const EVAL_CASE_VALIDATION_RECORD_TYPE = "mister-clean.eval-case-validation";
/**
 * The one place this repository pins the model-registry export it joins on:
 * the customer test's manifest (`artifact.version`). Registry refs in an eval
 * case must name that export; the pin is read, never copied here.
 */
export const REGISTRY_PIN_PATH = "customer-tests/model-atlas/registry-join.json";

export type AgentCardRole = "subject" | "control";
export type ReplayOutcome = "met" | "missed";

/** A repository-relative path and the sha256 of its bytes. */
export interface FileCitation {
  readonly path: string;
  readonly sha256: string;
}

export interface EvalCaseAgentCard {
  readonly card_id: string;
  /** `<registry card id>@<export version>`; the version must equal the pinned export. */
  readonly model_registry_ref: string;
  readonly role: AgentCardRole;
}

/** One named digest of an external artifact, supplied by the evidence owner. */
export interface ExternalDigest {
  readonly name: string;
  readonly sha256: string;
}

/**
 * A verifier is bound by digest (`sha256`), bound by an external citation
 * (`binding: "external"`: the bytes live in another repository seam; the
 * digests were supplied by the evidence owner and are recorded, not re-hashed
 * here), or honestly unbound (a refusal).
 */
export type EvalCaseVerifier =
  | { readonly name: string; readonly kind: string; readonly sha256: string }
  | {
    readonly name: string;
    readonly kind: string;
    readonly binding: "external";
    readonly repository: string;
    /** Where the evidence owner's record of these digests can be found. */
    readonly location: string;
    /** The digest of the constant evaluator itself. */
    readonly sha256: string;
    readonly components: readonly ExternalDigest[];
  }
  | { readonly name: string; readonly kind: string; readonly binding: "unbound"; readonly reason: string };

/** One base commit per control-pair set; sessions names the S-nn range it covers. */
export interface PairSetCommit {
  readonly pair_set: string;
  readonly sessions: string;
  readonly sha: string;
}

export type EvalCaseBaseCommit =
  | { readonly repository: string; readonly sha: string }
  | {
    readonly repository: string;
    readonly binding: "external";
    readonly location: string;
    /** Whether the session-to-source map was recorded by the source project or inferred from the tallies. */
    readonly session_map: "recorded" | "inferred";
    readonly commits: readonly PairSetCommit[];
  }
  | { readonly repository: string; readonly binding: "unbound"; readonly reason: string };

/** One row of the replay card's per-reviewer table (RC-001 column names). */
export interface EvalCaseReviewerCounts {
  readonly card_id: string;
  readonly reviewer_model: string;
  readonly pair_set: string;
  readonly sessions: number;
  readonly good_replays: number;
  readonly false_rejects: number;
  /** Populations whose good control passed exactly at the floor. */
  readonly populations_at_floor: number;
  /** Populations whose good control passed below the floor: the phenomenon repeated past the repeat floor. */
  readonly floor_breaches: number;
  readonly bad_passes: number;
}

export interface EvalCaseReplay {
  /** Repeat floor as `k/n`, for example `2/3`. */
  readonly floor: string;
  readonly sessions: number;
  readonly rows_source: FileCitation;
  readonly outcome: ReplayOutcome;
  readonly per_reviewer: readonly EvalCaseReviewerCounts[];
}

export interface EvalCase {
  readonly record_type: typeof EVAL_CASE_RECORD_TYPE;
  readonly schema_version: typeof EVAL_CASE_SCHEMA_VERSION;
  readonly case_id: string;
  readonly field_case: FileCitation;
  readonly phenomenon: string;
  readonly agent_cards: readonly EvalCaseAgentCard[];
  readonly verifier: EvalCaseVerifier;
  readonly base_commit: EvalCaseBaseCommit;
  readonly replay: EvalCaseReplay;
  readonly derived_from: FileCitation;
  readonly created_at: string;
}

export type EvalCaseRefusalCode =
  | "record_shape"
  | "agent_cards_count"
  | "verifier_unbound"
  | "base_commit_unbound"
  | "path_missing"
  | "sha256_mismatch"
  | "registry_pin_missing"
  | "registry_export_mismatch";

export interface EvalCaseRefusal {
  readonly code: EvalCaseRefusalCode;
  /** JSON pointer-like location of the citation that did not bind. */
  readonly citation: string;
  readonly detail: string;
}

export interface EvalCaseValidationResult {
  readonly record_type: typeof EVAL_CASE_VALIDATION_RECORD_TYPE;
  readonly schema_version: "1";
  readonly status: "eval_case_valid" | "eval_case_refused";
  readonly case_id: string | null;
  readonly record_path: string;
  readonly repository_root: string;
  readonly registry_export_version: string | null;
  /** Citations that bound against this repository's bytes or the pinned export, in record order. */
  readonly bound: readonly string[];
  /** Citations accepted as external: digests recorded from the evidence owner, not re-hashed here. */
  readonly external: readonly string[];
  readonly refusals: readonly EvalCaseRefusal[];
}

const HEX64 = /^[0-9a-f]{64}$/u;
const HEX40 = /^[0-9a-f]{40}$/u;
const CASE_ID = /^[A-Z]{2,4}-[0-9]{3,}$/u;
const CARD_ID = /^[A-Z]{2,4}-[0-9]{3,}$/u;
const FLOOR = /^([1-9][0-9]*)\/([1-9][0-9]*)$/u;
const TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?Z$/u;
/** The registry's own record-id rule (customer-tests/model-atlas/registry-join.ts). */
const REGISTRY_RECORD_ID = /^[a-z0-9][a-z0-9.-]*$/u;

function object(value: unknown): Record<string, unknown> | undefined {
  return !!value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[], path: string, refusals: EvalCaseRefusal[]): boolean {
  const keys = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (keys.length === wanted.length && keys.every((key, index) => key === wanted[index])) return true;
  refusals.push({ code: "record_shape", citation: path, detail: `expected exactly the keys ${wanted.join(",")}; got ${keys.join(",")}` });
  return false;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function count(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function shape(refusals: EvalCaseRefusal[], citation: string, detail: string): void {
  refusals.push({ code: "record_shape", citation, detail });
}

function citationShape(value: unknown, path: string, refusals: EvalCaseRefusal[]): value is FileCitation {
  const citation = object(value);
  if (!citation) {
    shape(refusals, path, "expected an object with path and sha256");
    return false;
  }
  if (!exactKeys(citation, ["path", "sha256"], path, refusals)) return false;
  let ok = true;
  if (typeof citation.path !== "string" || !isRepositoryRelativePath(citation.path) || citation.path === ".") {
    shape(refusals, `${path}.path`, "expected a repository-relative file path");
    ok = false;
  }
  if (typeof citation.sha256 !== "string" || !HEX64.test(citation.sha256)) {
    shape(refusals, `${path}.sha256`, "expected lowercase SHA-256");
    ok = false;
  }
  return ok;
}

export function parseRegistryRef(ref: string): { readonly id: string; readonly version: string } | undefined {
  const at = ref.lastIndexOf("@");
  if (at <= 0 || at === ref.length - 1) return undefined;
  const id = ref.slice(0, at);
  const version = ref.slice(at + 1);
  if (!REGISTRY_RECORD_ID.test(id) || version.includes("@") || version.trim().length === 0) return undefined;
  return { id, version };
}

/**
 * Structural refusals for one eval-case record: exact key sets, enumerations,
 * digests, exactly two agent cards (one subject, one control), and an unbound
 * verifier or base commit. Nothing here touches the filesystem.
 */
export function evalCaseShapeRefusals(value: unknown): EvalCaseRefusal[] {
  const refusals: EvalCaseRefusal[] = [];
  const record = object(value);
  if (!record) return [{ code: "record_shape", citation: "$", detail: "expected a JSON object" }];
  if (!exactKeys(record, [
    "record_type", "schema_version", "case_id", "field_case", "phenomenon", "agent_cards", "verifier", "base_commit",
    "replay", "derived_from", "created_at",
  ], "$", refusals)) return refusals;
  if (record.record_type !== EVAL_CASE_RECORD_TYPE) shape(refusals, "$.record_type", `expected ${EVAL_CASE_RECORD_TYPE}`);
  if (record.schema_version !== EVAL_CASE_SCHEMA_VERSION) shape(refusals, "$.schema_version", `expected "${EVAL_CASE_SCHEMA_VERSION}"`);
  if (typeof record.case_id !== "string" || !CASE_ID.test(record.case_id)) shape(refusals, "$.case_id", "expected a case id such as CS-001");
  citationShape(record.field_case, "$.field_case", refusals);
  if (!nonEmptyString(record.phenomenon) || record.phenomenon.includes("\n")) shape(refusals, "$.phenomenon", "expected one sentence");

  const cardIds = new Set<string>();
  const cards = Array.isArray(record.agent_cards) ? record.agent_cards : undefined;
  if (!cards) shape(refusals, "$.agent_cards", "expected an array of agent cards");
  else {
    // Exactly two cards: the agent that showed the phenomenon and its control.
    if (cards.length !== 2) refusals.push({ code: "agent_cards_count", citation: "$.agent_cards", detail: `expected exactly 2 agent cards; got ${cards.length}` });
    const roles: string[] = [];
    for (const [index, value] of cards.entries()) {
      const path = `$.agent_cards[${index}]`;
      const card = object(value);
      if (!card) {
        shape(refusals, path, "expected an object");
        continue;
      }
      if (!exactKeys(card, ["card_id", "model_registry_ref", "role"], path, refusals)) continue;
      if (typeof card.card_id !== "string" || !CARD_ID.test(card.card_id)) shape(refusals, `${path}.card_id`, "expected a card id such as AC-003");
      else if (cardIds.has(card.card_id)) shape(refusals, `${path}.card_id`, "duplicate card id");
      else cardIds.add(card.card_id);
      if (typeof card.model_registry_ref !== "string" || parseRegistryRef(card.model_registry_ref) === undefined) {
        shape(refusals, `${path}.model_registry_ref`, "expected <registry card id>@<export version>");
      }
      if (card.role !== "subject" && card.role !== "control") shape(refusals, `${path}.role`, "expected subject or control");
      else roles.push(card.role);
    }
    if (cards.length === 2 && !(roles.includes("subject") && roles.includes("control"))) {
      shape(refusals, "$.agent_cards", "expected one subject card and one control card");
    }
  }

  const verifier = object(record.verifier);
  if (!verifier) shape(refusals, "$.verifier", "expected an object");
  else if (verifier.binding === "unbound") {
    if (exactKeys(verifier, ["name", "kind", "binding", "reason"], "$.verifier", refusals)) {
      if (!nonEmptyString(verifier.name) || !nonEmptyString(verifier.kind)) shape(refusals, "$.verifier", "name and kind are required");
      if (!nonEmptyString(verifier.reason)) shape(refusals, "$.verifier.reason", "an unbound verifier must state why");
      // The slice requires a constant verifier: a stated unknown is honest, and refused.
      refusals.push({ code: "verifier_unbound", citation: "$.verifier", detail: nonEmptyString(verifier.reason) ? verifier.reason : "verifier bytes are not bound" });
    }
  } else if (verifier.binding === "external") {
    if (exactKeys(verifier, ["name", "kind", "binding", "repository", "location", "sha256", "components"], "$.verifier", refusals)) {
      if (!nonEmptyString(verifier.name) || !nonEmptyString(verifier.kind)) shape(refusals, "$.verifier", "name and kind are required");
      if (!nonEmptyString(verifier.repository)) shape(refusals, "$.verifier.repository", "expected a repository seam id or name");
      if (!nonEmptyString(verifier.location)) shape(refusals, "$.verifier.location", "an external verifier must say where the evidence owner recorded its digests");
      if (typeof verifier.sha256 !== "string" || !HEX64.test(verifier.sha256)) shape(refusals, "$.verifier.sha256", "expected lowercase SHA-256");
      const components = Array.isArray(verifier.components) ? verifier.components : undefined;
      if (!components || components.length === 0) shape(refusals, "$.verifier.components", "expected at least one named digest");
      else {
        const names = new Set<string>();
        for (const [index, value] of components.entries()) {
          const path = `$.verifier.components[${index}]`;
          const component = object(value);
          if (!component || !exactKeys(component, ["name", "sha256"], path, refusals)) {
            if (!component) shape(refusals, path, "expected an object with name and sha256");
            continue;
          }
          if (!nonEmptyString(component.name)) shape(refusals, `${path}.name`, "required");
          else if (names.has(component.name)) shape(refusals, `${path}.name`, "duplicate component name");
          else names.add(component.name);
          if (typeof component.sha256 !== "string" || !HEX64.test(component.sha256)) shape(refusals, `${path}.sha256`, "expected lowercase SHA-256");
        }
      }
    }
  } else if (exactKeys(verifier, ["name", "kind", "sha256"], "$.verifier", refusals)) {
    if (!nonEmptyString(verifier.name) || !nonEmptyString(verifier.kind)) shape(refusals, "$.verifier", "name and kind are required");
    if (typeof verifier.sha256 !== "string" || !HEX64.test(verifier.sha256)) shape(refusals, "$.verifier.sha256", "expected lowercase SHA-256");
  }

  const replayRows = Array.isArray(object(record.replay)?.per_reviewer) ? object(record.replay)?.per_reviewer as unknown[] : [];
  const rowPairSets = new Set(replayRows.map((row) => object(row)?.pair_set).filter((value): value is string => nonEmptyString(value)));
  const base = object(record.base_commit);
  if (!base) shape(refusals, "$.base_commit", "expected an object");
  else if (base.binding === "unbound") {
    if (exactKeys(base, ["repository", "binding", "reason"], "$.base_commit", refusals)) {
      if (!nonEmptyString(base.repository)) shape(refusals, "$.base_commit.repository", "expected a repository seam id or name");
      if (!nonEmptyString(base.reason)) shape(refusals, "$.base_commit.reason", "an unbound base commit must state why");
      refusals.push({ code: "base_commit_unbound", citation: "$.base_commit", detail: nonEmptyString(base.reason) ? base.reason : "base commit is not bound" });
    }
  } else if (base.binding === "external") {
    if (exactKeys(base, ["repository", "binding", "location", "session_map", "commits"], "$.base_commit", refusals)) {
      if (!nonEmptyString(base.repository)) shape(refusals, "$.base_commit.repository", "expected a repository seam id or name");
      if (!nonEmptyString(base.location)) shape(refusals, "$.base_commit.location", "an external base commit must say where the evidence owner recorded it");
      if (base.session_map !== "recorded" && base.session_map !== "inferred") shape(refusals, "$.base_commit.session_map", "expected recorded or inferred");
      const commits = Array.isArray(base.commits) ? base.commits : undefined;
      if (!commits || commits.length === 0) shape(refusals, "$.base_commit.commits", "expected one commit per control-pair set");
      else {
        const pairSets = new Set<string>();
        for (const [index, value] of commits.entries()) {
          const path = `$.base_commit.commits[${index}]`;
          const commit = object(value);
          if (!commit || !exactKeys(commit, ["pair_set", "sessions", "sha"], path, refusals)) {
            if (!commit) shape(refusals, path, "expected an object with pair_set, sessions and sha");
            continue;
          }
          if (!nonEmptyString(commit.pair_set)) shape(refusals, `${path}.pair_set`, "required");
          else if (pairSets.has(commit.pair_set)) shape(refusals, `${path}.pair_set`, "duplicate pair set");
          else pairSets.add(commit.pair_set);
          if (!nonEmptyString(commit.sessions)) shape(refusals, `${path}.sessions`, "expected the S-nn range this commit covers");
          if (typeof commit.sha !== "string" || !HEX40.test(commit.sha)) shape(refusals, `${path}.sha`, "expected a 40-hex commit sha");
        }
        // Every pair set the replay reports must have its base commit.
        for (const pairSet of rowPairSets) {
          if (!pairSets.has(pairSet)) shape(refusals, "$.base_commit.commits", `no base commit for pair set ${pairSet}`);
        }
      }
    }
  } else if (exactKeys(base, ["repository", "sha"], "$.base_commit", refusals)) {
    if (!nonEmptyString(base.repository)) shape(refusals, "$.base_commit.repository", "expected a repository seam id or name");
    if (typeof base.sha !== "string" || !HEX40.test(base.sha)) shape(refusals, "$.base_commit.sha", "expected a 40-hex commit sha");
  }

  const replay = object(record.replay);
  if (!replay) shape(refusals, "$.replay", "expected an object");
  else if (exactKeys(replay, ["floor", "sessions", "rows_source", "outcome", "per_reviewer"], "$.replay", refusals)) {
    const floor = typeof replay.floor === "string" ? replay.floor.match(FLOOR) : null;
    if (!floor || Number(floor[1]) > Number(floor[2])) shape(refusals, "$.replay.floor", "expected a repeat floor k/n with k <= n");
    if (!count(replay.sessions) || replay.sessions < 1) shape(refusals, "$.replay.sessions", "expected a positive session count");
    citationShape(replay.rows_source, "$.replay.rows_source", refusals);
    if (replay.outcome !== "met" && replay.outcome !== "missed") shape(refusals, "$.replay.outcome", "expected met or missed");
    const rows = Array.isArray(replay.per_reviewer) ? replay.per_reviewer : undefined;
    if (!rows || rows.length === 0) shape(refusals, "$.replay.per_reviewer", "expected at least one per-reviewer row");
    else {
      let subjectBreaches = 0;
      const subjectIds = new Set((cards ?? []).filter((card) => object(card)?.role === "subject").map((card) => String(object(card)?.card_id)));
      for (const [index, value] of rows.entries()) {
        const path = `$.replay.per_reviewer[${index}]`;
        const row = object(value);
        if (!row) {
          shape(refusals, path, "expected an object");
          continue;
        }
        if (!exactKeys(row, ["card_id", "reviewer_model", "pair_set", "sessions", "good_replays", "false_rejects", "populations_at_floor", "floor_breaches", "bad_passes"], path, refusals)) continue;
        if (typeof row.card_id !== "string" || !cardIds.has(row.card_id)) shape(refusals, `${path}.card_id`, "expected the id of one of the record's agent cards");
        if (!nonEmptyString(row.reviewer_model)) shape(refusals, `${path}.reviewer_model`, "required");
        if (!nonEmptyString(row.pair_set)) shape(refusals, `${path}.pair_set`, "required");
        for (const key of ["sessions", "good_replays", "false_rejects", "populations_at_floor", "floor_breaches", "bad_passes"] as const) {
          if (!count(row[key])) shape(refusals, `${path}.${key}`, "expected a non-negative integer");
        }
        if (count(row.false_rejects) && count(row.good_replays) && row.false_rejects > row.good_replays) shape(refusals, `${path}.false_rejects`, "cannot exceed good_replays");
        if (count(row.floor_breaches) && typeof row.card_id === "string" && subjectIds.has(row.card_id)) subjectBreaches += row.floor_breaches;
      }
      // The outcome is not free text: met means the subject repeated the phenomenon past the floor at least once.
      if ((replay.outcome === "met" || replay.outcome === "missed") && (replay.outcome === "met") !== (subjectBreaches > 0)) {
        shape(refusals, "$.replay.outcome", `outcome ${String(replay.outcome)} disagrees with the subject's floor_breaches (${subjectBreaches})`);
      }
    }
  }

  citationShape(record.derived_from, "$.derived_from", refusals);
  if (typeof record.created_at !== "string" || !TIMESTAMP.test(record.created_at) || !Number.isFinite(Date.parse(record.created_at))) {
    shape(refusals, "$.created_at", "expected an ISO-8601 UTC timestamp");
  }
  return refusals;
}

function sha256Of(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function containedIn(root: string, candidate: string): boolean {
  const relation = relative(realpathSync(root), realpathSync(candidate));
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}

/** Bind one file citation: the path exists under the root, is a file, and its bytes hash to the cited sha256. */
function bindCitation(root: string, citation: FileCitation, pointer: string, refusals: EvalCaseRefusal[], bound: string[]): void {
  const target = join(root, ...citation.path.split("/"));
  if (!existsSync(target) || !statSync(target).isFile() || !containedIn(root, target)) {
    refusals.push({ code: "path_missing", citation: pointer, detail: `${citation.path} is not a file inside the repository` });
    return;
  }
  const actual = sha256Of(target);
  if (actual !== citation.sha256) {
    refusals.push({ code: "sha256_mismatch", citation: pointer, detail: `${citation.path}: expected ${citation.sha256}, got ${actual}` });
    return;
  }
  bound.push(pointer);
}

/** The pinned registry export version, read from the customer test's manifest; undefined when absent or malformed. */
export function pinnedRegistryExportVersion(root: string): string | undefined {
  const path = join(root, ...REGISTRY_PIN_PATH.split("/"));
  if (!existsSync(path)) return undefined;
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, "utf8")); } catch { return undefined; }
  const artifact = object(object(parsed)?.artifact);
  const version = artifact?.version;
  return typeof version === "string" && version.length > 0 && !version.includes("@") ? version : undefined;
}

export interface ValidateEvalCaseInput {
  readonly record: unknown;
  readonly repositoryRoot: string;
  readonly recordPath: string;
}

/**
 * Validate one eval case against a repository root: structure first, then
 * every citation (file paths and digests, registry export version). Returns a
 * typed result; `eval_case_valid` only when nothing refused.
 */
export function validateEvalCase(input: ValidateEvalCaseInput): EvalCaseValidationResult {
  const root = resolve(input.repositoryRoot);
  const refusals = evalCaseShapeRefusals(input.record);
  const bound: string[] = [];
  const external: string[] = [];
  const record = object(input.record);
  const caseId = typeof record?.case_id === "string" ? record.case_id : null;
  const pin = pinnedRegistryExportVersion(root);

  // Bind citations whenever the record is well-formed, even when it already
  // carries a semantic refusal (unbound verifier, wrong card count), so the
  // result names every citation that did and did not bind.
  if (refusals.every((refusal) => refusal.code !== "record_shape")) {
    const evalCase = input.record as EvalCase;
    bindCitation(root, evalCase.field_case, "$.field_case", refusals, bound);
    if (pin === undefined) {
      refusals.push({ code: "registry_pin_missing", citation: REGISTRY_PIN_PATH, detail: "the pinned model-registry export version could not be read (artifact.version)" });
    } else {
      for (const [index, card] of evalCase.agent_cards.entries()) {
        const pointer = `$.agent_cards[${index}].model_registry_ref`;
        const ref = parseRegistryRef(card.model_registry_ref);
        if (ref === undefined || ref.version !== pin) {
          refusals.push({ code: "registry_export_mismatch", citation: pointer, detail: `${card.model_registry_ref}: expected export ${pin}` });
        } else bound.push(pointer);
      }
    }
    if ("binding" in evalCase.verifier) {
      if (evalCase.verifier.binding === "external") external.push("$.verifier");
    } else bound.push("$.verifier");
    if ("binding" in evalCase.base_commit) {
      if (evalCase.base_commit.binding === "external") external.push("$.base_commit");
    } else bound.push("$.base_commit");
    bindCitation(root, evalCase.replay.rows_source, "$.replay.rows_source", refusals, bound);
    bindCitation(root, evalCase.derived_from, "$.derived_from", refusals, bound);
  }

  return {
    record_type: EVAL_CASE_VALIDATION_RECORD_TYPE,
    schema_version: "1",
    status: refusals.length === 0 ? "eval_case_valid" : "eval_case_refused",
    case_id: caseId,
    record_path: input.recordPath,
    repository_root: root,
    registry_export_version: pin ?? null,
    bound,
    external,
    refusals,
  };
}
