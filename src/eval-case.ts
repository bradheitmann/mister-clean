/**
 * Durable eval cases: `mister-clean.eval-case/1`.
 *
 * One record per replayed field failure (charter Slice Zero, guarantee G2).
 * The record cites, never copies: the narrative case file, the card the replay
 * was derived from, the tallies the counts come from and both agent cards
 * (each by repository-relative path plus sha256), the constant verifier and
 * the base commit. The validator re-verifies every citation it can against a
 * repository root and recomputes the replay counts from the cited tallies.
 *
 * Three classes of citation, never conflated:
 * - `bound`: re-verified here (bytes re-hashed, frontmatter compared, Git
 *   object present, export version equal to the pin);
 * - `external`: the bytes live in another repository seam; the digests were
 *   recorded from the evidence owner and are NOT re-hashed here;
 * - `unverified`: shaped like a bound citation but nothing here can check it
 *   (a bare digest with no local file; a commit sha that is not an object in
 *   this repository).
 * `--require-bound` turns an external or unverified verifier or base commit
 * into a typed refusal. The validator is read-only and writes nothing.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { type Dirent, existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
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
/** Columns of a control-tallies TSV, in order (field-evals/2026-11-01-reviewer-controls). */
export const TALLY_COLUMNS = ["session", "pair_set", "reviewer_model", "population", "good_passed", "good_n", "bad_passed", "bad_n", "source"] as const;

export type AgentCardRole = "subject" | "control";
export type ReplayOutcome = "met" | "missed";
/** Fields `--require-bound` may name. */
export const REQUIRE_BOUND_FIELDS = ["verifier", "base_commit"] as const;
export type RequireBoundField = typeof REQUIRE_BOUND_FIELDS[number];

/** A repository-relative path and the sha256 of its bytes. */
export interface FileCitation {
  readonly path: string;
  readonly sha256: string;
}

export interface EvalCaseAgentCard {
  readonly card_id: string;
  /** The card file; its frontmatter `card_id` and `model_registry_ref` must equal this entry's. */
  readonly path: string;
  readonly sha256: string;
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
 * A digest-pinned evidence manifest the evidence owner published in another
 * repository seam. It is never vendored here (it names the source project);
 * it lives in a private evidence root given by `--evidence-root`, where it is
 * found by file name and re-hashed against `sha256`.
 */
export interface EvidenceManifestCitation {
  readonly seam: string;
  readonly source_commit: string;
  /** The manifest's file name as published (no directories). */
  readonly file: string;
  readonly sha256: string;
}

/**
 * A verifier is bound by a local file (`path` + `sha256`, re-hashed here),
 * unverified by a bare digest (nothing here can check it), external (the
 * bytes live in another repository seam; digests recorded, not re-hashed), or
 * honestly unbound (a refusal).
 */
export type EvalCaseVerifier =
  | { readonly name: string; readonly kind: string; readonly path: string; readonly sha256: string }
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
  | {
    readonly name: string;
    readonly kind: string;
    /** Bound through the evidence manifest (pinned_external) or recomputed from the source clone (recomputed). */
    readonly binding: "pinned_external";
    readonly repository: string;
    readonly location: string;
    readonly manifest: EvidenceManifestCitation;
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

/**
 * A base commit is bound when its sha is a commit object in the validated
 * repository, unverified when it is not, external when it lives in another
 * seam, or unbound (a refusal).
 */
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
  | {
    readonly repository: string;
    readonly binding: "pinned_external";
    readonly location: string;
    readonly manifest: EvidenceManifestCitation;
    readonly session_map: "recorded" | "inferred";
    readonly commits: readonly PairSetCommit[];
  }
  | { readonly repository: string; readonly binding: "unbound"; readonly reason: string };

/** How a verifier or base commit citation was established. */
export type BindingClass = "local" | "pinned_external" | "recomputed" | "external" | "unverified";

/** One row of the replay card's per-reviewer table (RC-001 column names); recomputed from the tallies. */
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
  | "card_ref_mismatch"
  | "registry_pin_missing"
  | "registry_export_mismatch"
  | "rows_source_unparsable"
  | "replay_floor_mismatch"
  | "replay_counts_mismatch"
  | "replay_floor_not_met"
  | "binding_required"
  | "evidence_root_inside_repository"
  | "evidence_manifest_unparsable"
  | "evidence_manifest_mismatch"
  | "source_commit_missing"
  | "recompute_mismatch";

export interface EvalCaseRefusal {
  readonly code: EvalCaseRefusalCode;
  /** JSON pointer-like location of the citation that did not bind. */
  readonly citation: string;
  readonly detail: string;
}

/** Per-reviewer counts as recomputed from the tallies (no card id: the tallies carry reviewer names). */
export interface RecomputedReviewerCounts {
  readonly reviewer_model: string;
  readonly pair_set: string;
  readonly sessions: number;
  readonly good_replays: number;
  readonly false_rejects: number;
  readonly populations_at_floor: number;
  readonly floor_breaches: number;
  readonly bad_passes: number;
}

export interface EvalCaseValidationResult {
  readonly record_type: typeof EVAL_CASE_VALIDATION_RECORD_TYPE;
  readonly schema_version: "1";
  readonly status: "eval_case_valid" | "eval_case_refused";
  readonly case_id: string | null;
  readonly record_path: string;
  readonly repository_root: string;
  readonly registry_export_version: string | null;
  /** Fields `--require-bound` named. */
  readonly require_bound: readonly RequireBoundField[];
  /** Citations re-verified against this repository's bytes, objects or pin, in record order. */
  readonly bound: readonly string[];
  /** Citations accepted as external: digests recorded from the evidence owner, not re-hashed here. */
  readonly external: readonly string[];
  /** Citations shaped as bound that nothing here can check. */
  readonly unverified: readonly string[];
  /** Citations bound through a re-hashed evidence manifest under `--evidence-root`. */
  readonly pinned_external: readonly string[];
  /** Citations recomputed from the source clone named by `--source` and found equal. */
  readonly recomputed: readonly string[];
  /** How the verifier and base commit were established, when the record is well-formed. */
  readonly classes: Readonly<Record<string, BindingClass>>;
  /** The evidence root and source clones the run used (absolute paths), for the record of the run. */
  readonly evidence_root: string | null;
  readonly sources: Readonly<Record<string, string>>;
  /** The per-reviewer table recomputed from the cited tallies, or null when they did not bind or parse. */
  readonly replay_recomputed: readonly RecomputedReviewerCounts[] | null;
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
const COUNT_KEYS = ["sessions", "good_replays", "false_rejects", "populations_at_floor", "floor_breaches", "bad_passes"] as const;

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

function localPath(value: unknown): value is string {
  return typeof value === "string" && isRepositoryRelativePath(value) && value !== ".";
}

/** A file citation is local or nothing: `binding: "external"` is not accepted here. */
function citationShape(value: unknown, path: string, refusals: EvalCaseRefusal[]): value is FileCitation {
  const citation = object(value);
  if (!citation) {
    shape(refusals, path, "expected an object with path and sha256");
    return false;
  }
  if (!exactKeys(citation, ["path", "sha256"], path, refusals)) return false;
  let ok = true;
  if (!localPath(citation.path)) {
    shape(refusals, `${path}.path`, "expected a repository-relative file path");
    ok = false;
  }
  if (typeof citation.sha256 !== "string" || !HEX64.test(citation.sha256)) {
    shape(refusals, `${path}.sha256`, "expected lowercase SHA-256");
    ok = false;
  }
  return ok;
}

const SHORT_SHA = /^[0-9a-f]{7,40}$/u;

/** An evidence-manifest citation: seam equal to the citing field's repository, a short-or-full commit, a bare file name, a sha256. */
function manifestCitationShape(value: unknown, repository: unknown, path: string, refusals: EvalCaseRefusal[]): value is EvidenceManifestCitation {
  const citation = object(value);
  if (!citation) {
    shape(refusals, path, "expected an object with seam, source_commit, file and sha256");
    return false;
  }
  if (!exactKeys(citation, ["seam", "source_commit", "file", "sha256"], path, refusals)) return false;
  let ok = true;
  if (!nonEmptyString(citation.seam) || citation.seam !== repository) {
    shape(refusals, `${path}.seam`, "expected the same repository seam as the citing field");
    ok = false;
  }
  if (typeof citation.source_commit !== "string" || !SHORT_SHA.test(citation.source_commit)) {
    shape(refusals, `${path}.source_commit`, "expected a 7-40 hex commit sha");
    ok = false;
  }
  if (typeof citation.file !== "string" || !/^[A-Za-z0-9._-]+$/u.test(citation.file)) {
    shape(refusals, `${path}.file`, "expected the manifest's bare file name");
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
      if (!exactKeys(card, ["card_id", "path", "sha256", "model_registry_ref", "role"], path, refusals)) continue;
      if (typeof card.card_id !== "string" || !CARD_ID.test(card.card_id)) shape(refusals, `${path}.card_id`, "expected a card id such as AC-003");
      else if (cardIds.has(card.card_id)) shape(refusals, `${path}.card_id`, "duplicate card id");
      else cardIds.add(card.card_id);
      if (!localPath(card.path)) shape(refusals, `${path}.path`, "expected the card file's repository-relative path");
      if (typeof card.sha256 !== "string" || !HEX64.test(card.sha256)) shape(refusals, `${path}.sha256`, "expected lowercase SHA-256");
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
  } else if (verifier.binding === "external" || verifier.binding === "pinned_external") {
    const pinned = verifier.binding === "pinned_external";
    const keys = pinned
      ? ["name", "kind", "binding", "repository", "location", "manifest", "sha256", "components"]
      : ["name", "kind", "binding", "repository", "location", "sha256", "components"];
    if (exactKeys(verifier, keys, "$.verifier", refusals)) {
      if (pinned) manifestCitationShape(verifier.manifest, verifier.repository, "$.verifier.manifest", refusals);
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
  } else {
    const keys = "path" in verifier ? ["name", "kind", "path", "sha256"] : ["name", "kind", "sha256"];
    if (exactKeys(verifier, keys, "$.verifier", refusals)) {
      if (!nonEmptyString(verifier.name) || !nonEmptyString(verifier.kind)) shape(refusals, "$.verifier", "name and kind are required");
      if ("path" in verifier && !localPath(verifier.path)) shape(refusals, "$.verifier.path", "expected a repository-relative file path");
      if (typeof verifier.sha256 !== "string" || !HEX64.test(verifier.sha256)) shape(refusals, "$.verifier.sha256", "expected lowercase SHA-256");
    }
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
  } else if (base.binding === "external" || base.binding === "pinned_external") {
    const pinned = base.binding === "pinned_external";
    const keys = pinned
      ? ["repository", "binding", "location", "manifest", "session_map", "commits"]
      : ["repository", "binding", "location", "session_map", "commits"];
    if (exactKeys(base, keys, "$.base_commit", refusals)) {
      if (pinned) manifestCitationShape(base.manifest, base.repository, "$.base_commit.manifest", refusals);
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
      const seen = new Set<string>();
      for (const [index, value] of rows.entries()) {
        const path = `$.replay.per_reviewer[${index}]`;
        const row = object(value);
        if (!row) {
          shape(refusals, path, "expected an object");
          continue;
        }
        if (!exactKeys(row, ["card_id", "reviewer_model", "pair_set", ...COUNT_KEYS], path, refusals)) continue;
        if (typeof row.card_id !== "string" || !cardIds.has(row.card_id)) shape(refusals, `${path}.card_id`, "expected the id of one of the record's agent cards");
        if (!nonEmptyString(row.reviewer_model)) shape(refusals, `${path}.reviewer_model`, "required");
        if (!nonEmptyString(row.pair_set)) shape(refusals, `${path}.pair_set`, "required");
        const key = `${String(row.reviewer_model)}\u0000${String(row.pair_set)}`;
        if (seen.has(key)) shape(refusals, path, "duplicate reviewer and pair set");
        seen.add(key);
        for (const field of COUNT_KEYS) {
          if (!count(row[field])) shape(refusals, `${path}.${field}`, "expected a non-negative integer");
        }
        if (count(row.false_rejects) && count(row.good_replays) && row.false_rejects > row.good_replays) shape(refusals, `${path}.false_rejects`, "cannot exceed good_replays");
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
function bindCitation(root: string, citation: FileCitation, pointer: string, refusals: EvalCaseRefusal[], bound: string[]): boolean {
  const target = join(root, ...citation.path.split("/"));
  if (!existsSync(target) || !statSync(target).isFile() || !containedIn(root, target)) {
    refusals.push({ code: "path_missing", citation: pointer, detail: `${citation.path} is not a file inside the repository` });
    return false;
  }
  const actual = sha256Of(target);
  if (actual !== citation.sha256) {
    refusals.push({ code: "sha256_mismatch", citation: pointer, detail: `${citation.path}: expected ${citation.sha256}, got ${actual}` });
    return false;
  }
  bound.push(pointer);
  return true;
}

/** `key: value   # comment` lines of a leading `---` frontmatter block; absent or malformed → empty. */
export function cardFrontmatter(text: string): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  const lines = text.split(/\r?\n/u);
  if (lines[0] !== "---") return fields;
  for (const line of lines.slice(1)) {
    if (line === "---") return fields;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).split("#")[0]?.trim() ?? "";
    if (key.length > 0) fields.set(key, value);
  }
  return new Map();
}

/** Is `sha` a commit object in the repository at `root`? False for a non-repository. */
function commitExists(root: string, sha: string): boolean {
  const result = spawnSync("git", ["--no-optional-locks", "-C", root, "cat-file", "-e", `${sha}^{commit}`], { stdio: "ignore" });
  return result.status === 0;
}

export interface TallyRow {
  readonly session: string;
  readonly pair_set: string;
  readonly reviewer_model: string;
  readonly population: string;
  readonly good_passed: number;
  readonly good_n: number;
  readonly bad_passed: number;
  readonly bad_n: number;
  readonly source: string;
}

/** Parse a control-tallies TSV strictly; a problem is returned as a string. */
export function parseTallies(text: string): readonly TallyRow[] | string {
  const lines = text.split(/\r?\n/u);
  if (lines[lines.length - 1] === "") lines.pop();
  if (lines.length < 2) return "expected a header line and at least one row";
  const header = lines[0]?.split("\t") ?? [];
  if (header.length !== TALLY_COLUMNS.length || header.some((column, index) => column !== TALLY_COLUMNS[index])) {
    return `expected the columns ${TALLY_COLUMNS.join(",")}`;
  }
  const rows: TallyRow[] = [];
  for (const [index, line] of lines.slice(1).entries()) {
    const cells = line.split("\t");
    if (cells.length !== TALLY_COLUMNS.length) return `line ${index + 2}: expected ${TALLY_COLUMNS.length} columns, got ${cells.length}`;
    const numbers = cells.slice(4, 8).map((cell) => (/^[0-9]+$/u.test(cell) ? Number(cell) : Number.NaN));
    if (numbers.some((value) => !Number.isSafeInteger(value))) return `line ${index + 2}: counts must be non-negative integers`;
    const [goodPassed, goodN, badPassed, badN] = numbers as [number, number, number, number];
    if (goodPassed > goodN || badPassed > badN) return `line ${index + 2}: passed counts exceed their replay counts`;
    if (cells.slice(0, 4).some((cell) => cell.trim().length === 0)) return `line ${index + 2}: session, pair_set, reviewer_model and population are required`;
    rows.push({
      session: cells[0] as string, pair_set: cells[1] as string, reviewer_model: cells[2] as string, population: cells[3] as string,
      good_passed: goodPassed, good_n: goodN, bad_passed: badPassed, bad_n: badN, source: cells[8] as string,
    });
  }
  return rows;
}

/** Recompute the per-reviewer table (RC-001's derivation) under a floor of k passes out of n replays. */
export function recomputeReviewerCounts(rows: readonly TallyRow[], floorPasses: number): readonly RecomputedReviewerCounts[] {
  const groups = new Map<string, { sessions: Set<string>; good: number; rejects: number; atFloor: number; breaches: number; badPasses: number; reviewer: string; pairSet: string }>();
  for (const row of rows) {
    const key = `${row.reviewer_model}\u0000${row.pair_set}`;
    const group = groups.get(key) ?? { sessions: new Set<string>(), good: 0, rejects: 0, atFloor: 0, breaches: 0, badPasses: 0, reviewer: row.reviewer_model, pairSet: row.pair_set };
    group.sessions.add(row.session);
    group.good += row.good_n;
    group.rejects += row.good_n - row.good_passed;
    if (row.good_passed === floorPasses) group.atFloor += 1;
    if (row.good_passed < floorPasses) group.breaches += 1;
    group.badPasses += row.bad_passed;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    reviewer_model: group.reviewer, pair_set: group.pairSet, sessions: group.sessions.size, good_replays: group.good,
    false_rejects: group.rejects, populations_at_floor: group.atFloor, floor_breaches: group.breaches, bad_passes: group.badPasses,
  }));
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

// ---------------------------------------------------------------------------
// Evidence manifests (`--evidence-root`) and source-clone recomputation (`--source`)
// ---------------------------------------------------------------------------

/** The parts of an evidence manifest this validator consumes. */
export interface EvidenceManifest {
  readonly schema: string;
  readonly pair_sets: Readonly<Record<string, { readonly base_commit: string; readonly sessions: string }>>;
  readonly evaluator_pins: Readonly<Record<string, {
    readonly validator_source: { readonly hashed_paths_relative_to: string; readonly ordered_files: readonly { readonly path: string; readonly sha256: string }[]; readonly composite_sha256: string };
    readonly review_source: { readonly files: readonly { readonly path: string; readonly sha256: string }[]; readonly composite_sha256: string };
  }>>;
  readonly receipt_tool: { readonly path: string; readonly commit: string; readonly sha256: string };
  readonly session_map: readonly { readonly session: string; readonly basis: "recorded" | "inferred" }[];
  /** The composite's header bytes: decoded from the manifest, never a constant in this source. */
  readonly header: Buffer;
}

function fileDigestList(value: unknown): readonly { readonly path: string; readonly sha256: string }[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const list: { path: string; sha256: string }[] = [];
  for (const entry of value) {
    const item = object(entry);
    if (!item || typeof item.path !== "string" || item.path.length === 0 || typeof item.sha256 !== "string" || !HEX64.test(item.sha256)) return undefined;
    list.push({ path: item.path, sha256: item.sha256 });
  }
  return list;
}

/** Decode `algorithm.header`: `bytes_hex` must be `text` plus one NUL and have the stated length. */
function decodeHeader(value: unknown): Buffer | string {
  const header = object(value);
  if (!header) return "algorithm.header is absent";
  if (header.encoding !== "utf8_with_trailing_nul") return "algorithm.header.encoding is not utf8_with_trailing_nul";
  if (typeof header.text !== "string" || header.text.length === 0 || header.text.includes("\u0000")) return "algorithm.header.text must be a non-empty string without NUL";
  if (typeof header.bytes_hex !== "string" || !/^(?:[0-9a-f]{2})+$/u.test(header.bytes_hex)) return "algorithm.header.bytes_hex must be lowercase hex";
  const bytes = Buffer.from(header.bytes_hex, "hex");
  if (!Number.isInteger(header.length) || bytes.length !== header.length) return `algorithm.header.length ${String(header.length)} does not match bytes_hex (${bytes.length} bytes)`;
  const expected = Buffer.concat([Buffer.from(header.text, "utf8"), Buffer.from([0])]);
  if (!bytes.equals(expected)) return "algorithm.header.bytes_hex is not text plus a trailing NUL";
  return bytes;
}

/** Parse an evidence manifest strictly; a problem is returned as a string. */
export function parseEvidenceManifest(text: string): EvidenceManifest | string {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return "not valid JSON"; }
  const manifest = object(parsed);
  if (!manifest) return "not a JSON object";
  if (!nonEmptyString(manifest.schema)) return "schema is required";
  const pairSets = object(manifest.pair_sets);
  if (!pairSets || Object.keys(pairSets).length === 0) return "pair_sets is required";
  const pairSetsOut: Record<string, { base_commit: string; sessions: string }> = {};
  for (const [name, value] of Object.entries(pairSets)) {
    const entry = object(value);
    if (!entry || typeof entry.base_commit !== "string" || !HEX40.test(entry.base_commit) || !nonEmptyString(entry.sessions)) return `pair_sets.${name} needs base_commit (40 hex) and sessions`;
    pairSetsOut[name] = { base_commit: entry.base_commit, sessions: entry.sessions };
  }
  const pins = object(manifest.evaluator_pins);
  if (!pins) return "evaluator_pins is required";
  const pinsOut: Record<string, EvidenceManifest["evaluator_pins"][string]> = {};
  for (const [commit, value] of Object.entries(pins)) {
    const pin = object(value);
    const validator = object(pin?.validator_source);
    const review = object(pin?.review_source);
    const files = fileDigestList(validator?.ordered_files);
    const reviewFiles = fileDigestList(review?.files);
    if (!HEX40.test(commit) || !validator || !review || !files || !reviewFiles || reviewFiles.length !== 1
      || !nonEmptyString(validator.hashed_paths_relative_to) || !validator.hashed_paths_relative_to.endsWith("/")
      || typeof validator.composite_sha256 !== "string" || !HEX64.test(validator.composite_sha256)
      || typeof review.composite_sha256 !== "string" || !HEX64.test(review.composite_sha256)) {
      return `evaluator_pins.${commit} is malformed`;
    }
    if (files.some((file) => !file.path.startsWith(validator.hashed_paths_relative_to as string))) return `evaluator_pins.${commit}: a listed file is outside hashed_paths_relative_to`;
    pinsOut[commit] = {
      validator_source: { hashed_paths_relative_to: validator.hashed_paths_relative_to, ordered_files: files, composite_sha256: validator.composite_sha256 },
      review_source: { files: reviewFiles, composite_sha256: review.composite_sha256 },
    };
  }
  for (const [name, entry] of Object.entries(pairSetsOut)) {
    if (pinsOut[entry.base_commit] === undefined) return `pair_sets.${name}: no evaluator pin for its base commit`;
  }
  const receipt = object(manifest.receipt_tool);
  if (!receipt || !nonEmptyString(receipt.path) || typeof receipt.commit !== "string" || !SHORT_SHA.test(receipt.commit) || typeof receipt.sha256 !== "string" || !HEX64.test(receipt.sha256)) {
    return "receipt_tool needs path, commit and sha256";
  }
  const sessions = Array.isArray(manifest.session_map) ? manifest.session_map : undefined;
  if (!sessions || sessions.length === 0) return "session_map is required";
  const sessionsOut: { session: string; basis: "recorded" | "inferred" }[] = [];
  for (const value of sessions) {
    const entry = object(value);
    if (!entry || !nonEmptyString(entry.session) || (entry.basis !== "recorded" && entry.basis !== "inferred")) return "session_map entries need session and basis (recorded or inferred)";
    sessionsOut.push({ session: entry.session, basis: entry.basis });
  }
  const header = decodeHeader(object(manifest.algorithm)?.header);
  if (typeof header === "string") return header;
  return {
    schema: manifest.schema, pair_sets: pairSetsOut, evaluator_pins: pinsOut,
    receipt_tool: { path: receipt.path, commit: receipt.commit, sha256: receipt.sha256 },
    session_map: sessionsOut, header,
  };
}

const EVIDENCE_WALK_DEPTH = 4;

/** Every regular file named `file` under `root`, at most EVIDENCE_WALK_DEPTH levels down. */
function filesNamed(root: string, file: string, depth = 0): string[] {
  const found: string[] = [];
  let entries: Dirent[];
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return found; }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isFile() && entry.name === file) found.push(path);
    else if (entry.isDirectory() && depth < EVIDENCE_WALK_DEPTH) found.push(...filesNamed(path, file, depth + 1));
  }
  return found.sort();
}

function u64be(value: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(value));
  return buffer;
}

/** The manifest's composite: header, then per file (byte-sorted relative path) u64be(path length), path, u64be(content length), content. */
export function compositeDigest(header: Buffer, files: readonly { readonly relativePath: string; readonly content: Buffer }[]): string {
  const sorted = [...files].sort((left, right) => Buffer.compare(Buffer.from(left.relativePath, "utf8"), Buffer.from(right.relativePath, "utf8")));
  const parts: Buffer[] = [header];
  for (const file of sorted) {
    const path = Buffer.from(file.relativePath, "utf8");
    parts.push(u64be(path.length), path, u64be(file.content.length), file.content);
  }
  return createHash("sha256").update(Buffer.concat(parts)).digest("hex");
}

/** `git show <commit>:<path>` from a clone, read-only; undefined when the object is absent. */
function gitShow(clone: string, commit: string, path: string): Buffer | undefined {
  const result = spawnSync("git", ["--no-optional-locks", "-C", clone, "show", `${commit}:${path}`], { maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : undefined;
}

function isGitClone(path: string): boolean {
  if (!existsSync(path) || !statSync(path).isDirectory()) return false;
  return spawnSync("git", ["--no-optional-locks", "-C", path, "rev-parse", "--git-dir"], { stdio: "ignore" }).status === 0;
}

/** Environment variable that names a source clone for a seam: MISTER_CLEAN_SOURCE_<SEAM>. */
export function sourceEnvironmentName(seam: string): string {
  return `MISTER_CLEAN_SOURCE_${seam.toUpperCase().replace(/[^A-Z0-9]/gu, "_")}`;
}

export interface ValidateEvalCaseInput {
  readonly record: unknown;
  readonly repositoryRoot: string;
  readonly recordPath: string;
  /** Fields whose citation must be bound, pinned_external or recomputed; an external or unverified one is refused. */
  readonly requireBound?: readonly RequireBoundField[];
  /** A directory outside the repository holding evidence manifests; absent → pinned citations stay external. */
  readonly evidenceRoot?: string;
  /** Local clones by seam id for the recompute route. */
  readonly sources?: Readonly<Record<string, string>>;
}

/** Verifier digests as a set: the evaluator composite plus every component. */
function verifierDigests(verifier: Extract<EvalCaseVerifier, { readonly components: readonly ExternalDigest[] }>): Set<string> {
  return new Set([verifier.sha256, ...verifier.components.map((component) => component.sha256)]);
}

/** The session-map basis the manifest supports: recorded only when every session was recorded. */
function manifestSessionBasis(manifest: EvidenceManifest): "recorded" | "inferred" {
  return manifest.session_map.every((entry) => entry.basis === "recorded") ? "recorded" : "inferred";
}

/**
 * Compare the record's pinned citations with a bound manifest; every
 * disagreement is an `evidence_manifest_mismatch` at the exact field.
 */
function manifestValueRefusals(evalCase: EvalCase, manifest: EvidenceManifest, refusals: EvalCaseRefusal[]): boolean {
  const before = refusals.length;
  const mismatch = (citation: string, detail: string): void => { refusals.push({ code: "evidence_manifest_mismatch", citation, detail }); };
  const commits = Object.values(manifest.pair_sets).map((entry) => entry.base_commit);
  const manifestDigests = new Set<string>([manifest.receipt_tool.sha256]);
  for (const commit of commits) {
    const pin = manifest.evaluator_pins[commit] as EvidenceManifest["evaluator_pins"][string];
    manifestDigests.add(pin.validator_source.composite_sha256);
    manifestDigests.add(pin.review_source.composite_sha256);
  }
  const verifier = evalCase.verifier;
  if ("binding" in verifier && verifier.binding === "pinned_external") {
    for (const commit of commits) {
      const pin = manifest.evaluator_pins[commit] as EvidenceManifest["evaluator_pins"][string];
      if (pin.validator_source.composite_sha256 !== verifier.sha256) mismatch("$.verifier.sha256", `manifest composite at ${commit.slice(0, 12)} is ${pin.validator_source.composite_sha256}`);
    }
    const recorded = verifierDigests(verifier);
    for (const digest of manifestDigests) if (!recorded.has(digest)) mismatch("$.verifier.components", `manifest digest ${digest} is not among the record's verifier digests`);
    for (const digest of recorded) if (!manifestDigests.has(digest)) mismatch("$.verifier.components", `record digest ${digest} is not in the manifest`);
  }
  const base = evalCase.base_commit;
  if ("binding" in base && base.binding === "pinned_external") {
    for (const [index, commit] of base.commits.entries()) {
      const entry = manifest.pair_sets[commit.pair_set];
      if (entry === undefined) mismatch(`$.base_commit.commits[${index}].pair_set`, `manifest has no pair set ${commit.pair_set}`);
      else if (entry.base_commit !== commit.sha) mismatch(`$.base_commit.commits[${index}].sha`, `manifest base commit for pair set ${commit.pair_set} is ${entry.base_commit}`);
    }
    for (const name of Object.keys(manifest.pair_sets)) {
      if (!base.commits.some((commit) => commit.pair_set === name)) mismatch("$.base_commit.commits", `manifest pair set ${name} is not in the record`);
    }
    const basis = manifestSessionBasis(manifest);
    if (base.session_map !== basis) mismatch("$.base_commit.session_map", `manifest session map basis is ${basis}`);
  }
  return refusals.length === before;
}

/**
 * Recompute the evaluator pins from a source clone at every manifest base
 * commit and check the base commits and receipt tool exist there. True when
 * everything recomputed equals the record and the manifest.
 */
function recomputeFromSource(evalCase: EvalCase, manifest: EvidenceManifest, clone: string, refusals: EvalCaseRefusal[]): boolean {
  const before = refusals.length;
  const verifier = evalCase.verifier;
  const recordComposite = "binding" in verifier && verifier.binding === "pinned_external" ? verifier.sha256 : undefined;
  const recordDigests = "binding" in verifier && verifier.binding === "pinned_external" ? verifierDigests(verifier) : new Set<string>();
  const header = manifest.header;
  for (const [name, entry] of Object.entries(manifest.pair_sets)) {
    const commit = entry.base_commit;
    if (!commitExists(clone, commit)) {
      refusals.push({ code: "source_commit_missing", citation: "$.base_commit.commits", detail: `pair set ${name}: base commit ${commit} is not in the source clone` });
      continue;
    }
    const pin = manifest.evaluator_pins[commit] as EvidenceManifest["evaluator_pins"][string];
    const prefix = pin.validator_source.hashed_paths_relative_to;
    const files: { relativePath: string; content: Buffer }[] = [];
    let missing = false;
    for (const file of pin.validator_source.ordered_files) {
      const content = gitShow(clone, commit, file.path);
      if (content === undefined) {
        refusals.push({ code: "source_commit_missing", citation: "$.verifier", detail: `${file.path} is not at ${commit.slice(0, 12)} in the source clone` });
        missing = true;
        continue;
      }
      files.push({ relativePath: file.path.slice(prefix.length), content });
    }
    if (missing) continue;
    const composite = compositeDigest(header, files);
    if (composite !== pin.validator_source.composite_sha256 || (recordComposite !== undefined && composite !== recordComposite)) {
      refusals.push({ code: "recompute_mismatch", citation: "$.verifier.sha256", detail: `recomputed ${composite} at ${commit.slice(0, 12)}; manifest ${pin.validator_source.composite_sha256}; record ${recordComposite ?? "(none)"}` });
    }
    const reviewPath = (pin.review_source.files[0] as { path: string }).path;
    const reviewBytes = gitShow(clone, commit, reviewPath);
    if (reviewBytes === undefined) {
      refusals.push({ code: "source_commit_missing", citation: "$.verifier.components", detail: `${reviewPath} is not at ${commit.slice(0, 12)} in the source clone` });
    } else {
      const review = createHash("sha256").update(reviewBytes).digest("hex");
      if (review !== pin.review_source.composite_sha256 || !recordDigests.has(review)) {
        refusals.push({ code: "recompute_mismatch", citation: "$.verifier.components", detail: `recomputed review digest ${review} at ${commit.slice(0, 12)}; manifest ${pin.review_source.composite_sha256}` });
      }
    }
  }
  const receipt = gitShow(clone, manifest.receipt_tool.commit, manifest.receipt_tool.path);
  if (receipt === undefined) {
    refusals.push({ code: "source_commit_missing", citation: "$.verifier.components", detail: `receipt tool ${manifest.receipt_tool.path} is not at ${manifest.receipt_tool.commit} in the source clone` });
  } else {
    const digest = createHash("sha256").update(receipt).digest("hex");
    if (digest !== manifest.receipt_tool.sha256 || !recordDigests.has(digest)) {
      refusals.push({ code: "recompute_mismatch", citation: "$.verifier.components", detail: `recomputed receipt-tool digest ${digest}; manifest ${manifest.receipt_tool.sha256}` });
    }
  }
  return refusals.length === before;
}

/**
 * Validate one eval case against a repository root: structure first, then
 * every citation (file bytes, card frontmatter, Git objects, registry export
 * version), the replay counts recomputed from the cited tallies, and, when an
 * evidence root or source clone is given, the pinned verifier and base commit
 * against the re-hashed manifest or recomputed from the clone. Returns a typed
 * result; `eval_case_valid` only when nothing refused.
 */
export function validateEvalCase(input: ValidateEvalCaseInput): EvalCaseValidationResult {
  const root = resolve(input.repositoryRoot);
  const requireBound = [...(input.requireBound ?? [])];
  const refusals = evalCaseShapeRefusals(input.record);
  const bound: string[] = [];
  const external: string[] = [];
  const unverified: string[] = [];
  const pinnedExternal: string[] = [];
  const recomputed: string[] = [];
  const classes: Record<string, BindingClass> = {};
  let replayRecomputed: readonly RecomputedReviewerCounts[] | null = null;
  const record = object(input.record);
  const caseId = typeof record?.case_id === "string" ? record.case_id : null;
  const pin = pinnedRegistryExportVersion(root);
  const evidenceRoot = input.evidenceRoot === undefined ? undefined : resolve(input.evidenceRoot);
  const sources: Record<string, string> = {};
  for (const [seam, path] of Object.entries(input.sources ?? {})) sources[seam] = resolve(path);

  // The evidence root is private custody: it may never be the repository or inside it.
  if (evidenceRoot !== undefined && existsSync(evidenceRoot) && containedIn(root, evidenceRoot)) {
    refusals.push({ code: "evidence_root_inside_repository", citation: "--evidence-root", detail: "the evidence root must lie outside the validated repository" });
  }

  const result = (): EvalCaseValidationResult => ({
    record_type: EVAL_CASE_VALIDATION_RECORD_TYPE,
    schema_version: "1",
    status: refusals.length === 0 ? "eval_case_valid" : "eval_case_refused",
    case_id: caseId,
    record_path: input.recordPath,
    repository_root: root,
    registry_export_version: pin ?? null,
    require_bound: requireBound,
    bound,
    external,
    unverified,
    pinned_external: pinnedExternal,
    recomputed,
    classes,
    evidence_root: evidenceRoot ?? null,
    sources,
    replay_recomputed: replayRecomputed,
    refusals,
  });
  if (refusals.some((refusal) => refusal.code === "evidence_root_inside_repository")) return result();

  // Bind citations whenever the record is well-formed, even when it already
  // carries a semantic refusal (unbound verifier, wrong card count), so the
  // result names every citation that did and did not bind.
  if (refusals.every((refusal) => refusal.code !== "record_shape")) {
    const evalCase = input.record as EvalCase;
    bindCitation(root, evalCase.field_case, "$.field_case", refusals, bound);

    for (const [index, card] of evalCase.agent_cards.entries()) {
      const pointer = `$.agent_cards[${index}]`;
      if (bindCitation(root, card, pointer, refusals, bound)) {
        // The card file must be the card the record claims: same id, same registry ref.
        const front = cardFrontmatter(readFileSync(join(root, ...card.path.split("/")), "utf8"));
        const mismatches: string[] = [];
        if (front.get("card_id") !== card.card_id) mismatches.push(`card_id ${front.get("card_id") ?? "(none)"} != ${card.card_id}`);
        if (front.get("model_registry_ref") !== card.model_registry_ref) mismatches.push(`model_registry_ref ${front.get("model_registry_ref") ?? "(none)"} != ${card.model_registry_ref}`);
        if (mismatches.length > 0) {
          bound.splice(bound.indexOf(pointer), 1);
          refusals.push({ code: "card_ref_mismatch", citation: pointer, detail: `${card.path}: ${mismatches.join("; ")}` });
        }
      }
      const refPointer = `${pointer}.model_registry_ref`;
      if (pin === undefined) {
        if (index === 0) refusals.push({ code: "registry_pin_missing", citation: REGISTRY_PIN_PATH, detail: "the pinned model-registry export version could not be read (artifact.version)" });
      } else {
        const ref = parseRegistryRef(card.model_registry_ref);
        if (ref === undefined || ref.version !== pin) {
          refusals.push({ code: "registry_export_mismatch", citation: refPointer, detail: `${card.model_registry_ref}: expected export ${pin}` });
        } else bound.push(refPointer);
      }
    }

    // Verifier and base commit: local, bare, external, pinned or unbound.
    const verifier = evalCase.verifier;
    const base = evalCase.base_commit;
    const pinnedCitations: { pointer: "$.verifier" | "$.base_commit"; citation: EvidenceManifestCitation }[] = [];
    if ("binding" in verifier) {
      if (verifier.binding === "external") { external.push("$.verifier"); classes["$.verifier"] = "external"; }
      else if (verifier.binding === "pinned_external") pinnedCitations.push({ pointer: "$.verifier", citation: verifier.manifest });
    } else if ("path" in verifier) {
      if (bindCitation(root, verifier, "$.verifier", refusals, bound)) classes["$.verifier"] = "local";
    } else {
      // A bare digest: nothing here can re-hash it.
      unverified.push("$.verifier");
      classes["$.verifier"] = "unverified";
    }
    if ("binding" in base) {
      if (base.binding === "external") { external.push("$.base_commit"); classes["$.base_commit"] = "external"; }
      else if (base.binding === "pinned_external") pinnedCitations.push({ pointer: "$.base_commit", citation: base.manifest });
    } else if (commitExists(root, base.sha)) { bound.push("$.base_commit"); classes["$.base_commit"] = "local"; }
    else { unverified.push("$.base_commit"); classes["$.base_commit"] = "unverified"; }

    // Pinned citations: find the manifest under the evidence root by file name and re-hash it. One manifest
    // (by sha256) is parsed, value-checked and recomputed once, however many fields cite it.
    type Lookup = { readonly manifest: EvidenceManifest } | { readonly problem: EvalCaseRefusalCode; readonly suffix: string; readonly detail: string } | { readonly absent: true };
    const lookups = new Map<string, Lookup>();
    const manifests = new Map<string, EvidenceManifest>();
    const outcomes = new Map<string, BindingClass>();
    for (const { pointer, citation } of pinnedCitations) {
      let lookup = lookups.get(citation.sha256);
      if (lookup === undefined) {
        lookup = { absent: true };
        if (evidenceRoot !== undefined) {
          const sameName = filesNamed(evidenceRoot, citation.file);
          const found = sameName.find((candidate) => sha256Of(candidate) === citation.sha256);
          if (found === undefined && sameName.length > 0) {
            lookup = { problem: "evidence_manifest_mismatch", suffix: ".manifest.sha256", detail: `${citation.file} under the evidence root hashes to ${sha256Of(sameName[0] as string)}, not the cited ${citation.sha256}` };
          } else if (found !== undefined) {
            const parsed = parseEvidenceManifest(readFileSync(found, "utf8"));
            if (typeof parsed === "string") lookup = { problem: "evidence_manifest_unparsable", suffix: ".manifest", detail: `${citation.file}: ${parsed}` };
            else { lookup = { manifest: parsed }; manifests.set(citation.sha256, parsed); }
          }
        }
        lookups.set(citation.sha256, lookup);
      }
      // A lookup problem is reported once per citing field, so each names where it was cited.
      if ("problem" in lookup) refusals.push({ code: lookup.problem, citation: `${pointer}${lookup.suffix}`, detail: lookup.detail });
      const manifest = manifests.get(citation.sha256);
      if (manifest !== undefined && !outcomes.has(citation.sha256)) {
        if (!manifestValueRefusals(evalCase, manifest, refusals)) outcomes.set(citation.sha256, "external");
        else {
          const seam = citation.seam;
          const clone = sources[seam];
          if (clone !== undefined && !isGitClone(clone)) {
            refusals.push({ code: "source_commit_missing", citation: pointer, detail: `--source ${seam}: ${clone} is not a Git clone` });
            outcomes.set(citation.sha256, "pinned_external");
          } else if (clone !== undefined) {
            outcomes.set(citation.sha256, recomputeFromSource(evalCase, manifest, clone, refusals) ? "recomputed" : "external");
          } else outcomes.set(citation.sha256, "pinned_external");
        }
      }
      // Honest fallback: a manifest cited but not re-verifiable here leaves the citation external.
      const cls = outcomes.get(citation.sha256) ?? "external";
      classes[pointer] = cls;
      if (cls === "recomputed") recomputed.push(pointer);
      else if (cls === "pinned_external") pinnedExternal.push(pointer);
      else external.push(pointer);
    }

    if (bindCitation(root, evalCase.replay.rows_source, "$.replay.rows_source", refusals, bound)) {
      const parsed = parseTallies(readFileSync(join(root, ...evalCase.replay.rows_source.path.split("/")), "utf8"));
      if (typeof parsed === "string") {
        refusals.push({ code: "rows_source_unparsable", citation: "$.replay.rows_source", detail: `${evalCase.replay.rows_source.path}: ${parsed}` });
      } else {
        const floor = evalCase.replay.floor.match(FLOOR) as RegExpMatchArray;
        const floorPasses = Number(floor[1]);
        const floorReplays = Number(floor[2]);
        for (const row of parsed) {
          if (row.good_n !== floorReplays) {
            refusals.push({ code: "replay_floor_mismatch", citation: "$.replay.floor", detail: `${row.session} ${row.population}: ${row.good_n} good replays tallied, floor ${evalCase.replay.floor} needs ${floorReplays}` });
          }
        }
        replayRecomputed = recomputeReviewerCounts(parsed, floorPasses);
        const totalSessions = new Set(parsed.map((row) => row.session)).size;
        if (evalCase.replay.sessions !== totalSessions) {
          refusals.push({ code: "replay_counts_mismatch", citation: "$.replay.sessions", detail: `declared ${evalCase.replay.sessions}, recomputed ${totalSessions}` });
        }
        const subjectIds = new Set(evalCase.agent_cards.filter((card) => card.role === "subject").map((card) => card.card_id));
        let subjectBreaches = 0;
        const matched = new Set<RecomputedReviewerCounts>();
        for (const [index, row] of evalCase.replay.per_reviewer.entries()) {
          const pointer = `$.replay.per_reviewer[${index}]`;
          const group = replayRecomputed.find((entry) => entry.reviewer_model === row.reviewer_model && entry.pair_set === row.pair_set);
          if (group === undefined) {
            refusals.push({ code: "replay_counts_mismatch", citation: pointer, detail: `no tallied rows for reviewer ${row.reviewer_model} in pair set ${row.pair_set}` });
            continue;
          }
          matched.add(group);
          for (const field of COUNT_KEYS) {
            if (row[field] !== group[field]) refusals.push({ code: "replay_counts_mismatch", citation: `${pointer}.${field}`, detail: `declared ${row[field]}, recomputed ${group[field]}` });
          }
          if (subjectIds.has(row.card_id)) subjectBreaches += group.floor_breaches;
        }
        for (const group of replayRecomputed) {
          if (!matched.has(group)) refusals.push({ code: "replay_counts_mismatch", citation: "$.replay.per_reviewer", detail: `tallies carry reviewer ${group.reviewer_model} in pair set ${group.pair_set}, not declared` });
        }
        // A verdict needs the phenomenon to have repeated past the floor; `met` is recomputed, never declared.
        if (evalCase.replay.outcome === "met" && subjectBreaches === 0) {
          refusals.push({ code: "replay_floor_not_met", citation: "$.replay.outcome", detail: `met declared, but the subject's recomputed floor breaches are 0 under floor ${evalCase.replay.floor}` });
        } else if (evalCase.replay.outcome === "missed" && subjectBreaches > 0) {
          refusals.push({ code: "replay_counts_mismatch", citation: "$.replay.outcome", detail: `missed declared, but the subject's recomputed floor breaches are ${subjectBreaches}` });
        }
      }
    }
    bindCitation(root, evalCase.derived_from, "$.derived_from", refusals, bound);

    // Strict mode: a required citation must be re-verified here (local), through the re-hashed manifest, or recomputed.
    for (const field of requireBound) {
      const pointer = `$.${field}`;
      const cls = classes[pointer];
      if (cls === "external" || cls === "unverified") {
        refusals.push({ code: "binding_required", citation: pointer, detail: `${cls} citation; --require-bound ${field} demands one re-verified in this repository, through an evidence manifest under --evidence-root, or recomputed from --source` });
      }
    }
  }

  return result();
}
