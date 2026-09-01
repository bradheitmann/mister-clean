import * as z from "zod";

import { CAPABILITY_DEFINITIONS, parseRepositoryCapabilityId } from "../contracts/capability-taxonomy.js";
import { repositorySubjectSchema } from "../contracts/import-provenance.js";
import { ISSUE_EDGE_KINDS, ISSUE_EVENT_KINDS, ISSUE_STATES, issueRootSchema } from "../contracts/run-issue.js";
import { parseCanonicalLiveSnapshot, type CanonicalControlPlaneSnapshot } from "../contracts/snapshot.js";
import { parseCanonicalManifest, canonicalJson, sha256Bytes } from "./authority.js";
import type { OpenControlPlaneDatabase } from "../persistence/sqlite.js";
import { SqliteControlPlaneStore } from "./sqlite-store.js";

const text = z.string().min(1);
const digest = text.regex(/^[a-f0-9]{64}$/i);
const timestamp = text.regex(/^\d{4}-\d\d-\d\dT/).refine((value) => !Number.isNaN(Date.parse(value)));
const evidenceRef = z.object({ path: text, sha256: digest }).strict();
const subject = repositorySubjectSchema;
const flow = z.object({
  starting_real_issues: z.number().int().nonnegative().safe(), discovered_preexisting: z.number().int().nonnegative().safe(),
  caused_by_remediation: z.number().int().nonnegative().safe(), concurrently_introduced: z.number().int().nonnegative().safe(),
  paid: z.number().int().nonnegative().safe(), invalidated_false_positives: z.number().int().nonnegative().safe(),
  classification_correction_delta: z.number().int().safe(), ending_real_issues: z.number().int().nonnegative().safe(), boundary_blocked: z.number().int().nonnegative().safe(),
}).strict().superRefine((value, context) => {
  const ending = value.starting_real_issues + value.discovered_preexisting + value.caused_by_remediation
    + value.concurrently_introduced - value.paid - value.invalidated_false_positives + value.classification_correction_delta;
  if (ending !== value.ending_real_issues || value.boundary_blocked > value.ending_real_issues) context.addIssue({ code: "custom", message: "debt flow does not reconcile" });
});
const detectorSet = z.object({ detector_set_id: text, version: text, sha256: digest, runtime_identity_sha256: digest, coverage_ref: evidenceRef }).strict();
const runObservation = z.object({
  run_id: text, observed_at: timestamp, mister_clean_version: text, detector_set: detectorSet, subject,
  scope: z.array(text), exclusions: z.array(text), start_verdict: z.enum(["CLEAN", "NOT_CLEAN"]),
  terminal_verdict: z.enum(["CLEAN", "NOT_CLEAN"]), terminal_state: text, debt_flow: flow, evidence: z.array(evidenceRef),
  known_now_issue_ids: z.array(text).optional(), detector_misses: z.array(text).optional(), process_defects: z.array(text).optional(), note: text.optional(),
}).strict();
const correction = z.object({ issue_id: text, corrected_at: timestamp, prior_classification: text, current_classification: text, reason: text, evidence: z.array(evidenceRef) }).strict();
const runInterpretation = z.object({
  source_run_id: text, interpreted_at: timestamp, detector_set: detectorSet, real_issue_ids: z.array(text), false_positive_issue_ids: z.array(text),
  classification_corrections: z.array(correction), debt_flow: flow, evidence: z.array(evidenceRef),
}).strict();
const complexityCount = z.object({ bytes: z.number().int().nonnegative().safe(), lines: z.number().int().nonnegative().safe(), files: z.number().int().nonnegative().safe() }).strict();
const availability = z.enum(["MEASURED", "NOT_MEASURED", "NOT_CONFIGURED", "UNKNOWN"]);
const ignoredLive = z.object({
  availability,
  observed_at: timestamp.nullable(),
  subject_relation: z.literal("outside_repository_object"),
  total: complexityCount,
  dependencies: complexityCount,
  build_cache: complexityCount,
  local_evidence: complexityCount,
  other: complexityCount,
}).strict().superRefine((value, context) => {
  if ((value.availability === "MEASURED") !== (value.observed_at !== null)) {
    context.addIssue({ code: "custom", message: "ignored-live availability and observation time disagree" });
  }
  for (const dimension of ["bytes", "lines", "files"] as const) {
    if (value.dependencies[dimension] + value.build_cache[dimension] + value.local_evidence[dimension] + value.other[dimension] !== value.total[dimension]) {
      context.addIssue({ code: "custom", message: `ignored-live ${dimension} classes do not reconcile to total` });
    }
  }
});
const complexity = z.object({
  availability, object_sha256: digest.nullable(),
  repository_object_total: complexityCount, tracked_object: complexityCount, untracked_nonignored: complexityCount,
  authored_source: complexityCount, tests: complexityCount, public_documentation: complexityCount,
  planning_documentation: complexityCount, generated_shippable: complexityCount, config_tooling: complexityCount,
  evidence_research: complexityCount, dependencies_assets: complexityCount, ignored_live: ignoredLive,
  docs_to_authored_code: z.object({ bytes: z.number().finite().nonnegative().nullable(), lines: z.number().finite().nonnegative().nullable(), files: z.number().finite().nonnegative().nullable() }).strict(),
  structural_coverage: text, limitations: z.array(text),
  functions: z.object({ p50: z.number().finite().nonnegative().nullable(), p95: z.number().finite().nonnegative().nullable(), max: z.number().finite().nonnegative().nullable(), cyclomatic_p95: z.number().finite().nonnegative().nullable() }).strict(),
  cycles: z.array(text), hotspots: z.array(text), trend: z.array(z.object({ run_id: text, object_sha256: digest, complexity: z.number().finite().nonnegative().nullable(), docs_to_code_lines: z.number().finite().nonnegative().nullable() }).strict()),
  repository_size_history: z.array(z.object({
    series_id: text, label: text, ref: text, head_commit: text, evidence: z.array(evidenceRef),
    points: z.array(z.object({ commit: text, observed_at: timestamp, files: z.number().int().nonnegative().safe(), bytes: z.number().int().nonnegative().safe(), delta_bytes: z.number().int().safe() }).strict()),
  }).strict()).optional(),
}).strict().superRefine((value, context) => {
  for (const dimension of ["bytes", "lines", "files"] as const) {
    if (value.tracked_object[dimension] + value.untracked_nonignored[dimension] !== value.repository_object_total[dimension]) {
      context.addIssue({ code: "custom", message: `repository-object ${dimension} does not reconcile to tracked plus untracked-nonignored` });
    }
    const classified = value.authored_source[dimension] + value.tests[dimension]
      + value.public_documentation[dimension] + value.planning_documentation[dimension]
      + value.generated_shippable[dimension] + value.config_tooling[dimension]
      + value.evidence_research[dimension] + value.dependencies_assets[dimension];
    if (classified !== value.repository_object_total[dimension]) {
      context.addIssue({ code: "custom", message: `repository-object ${dimension} categories do not reconcile to total` });
    }
  }
});
const terminal = z.object({
  declared_verdict: z.enum(["CLEAN", "NOT_CLEAN"]).nullable(), subject: subject.nullable(),
  contract: z.object({ zero_payable_issues: z.boolean(), zero_unpaid_caused_by_mister_clean: z.boolean(), zero_material_boundary_or_unknown_debt: z.boolean(), fresh_repository_and_mister_clean_evidence: z.boolean(), coherent_required_surfaces: z.boolean(), independent_qa_holdout_accepted: z.boolean(), no_unexplained_complexity_regression: z.boolean(), exact_tree_target_coordination_current: z.boolean(), live_validated_closure_bundle: z.boolean() }).strict().nullable(),
  evidence: z.array(evidenceRef),
}).strict();

export type RunComponentKind = "detector_coverage" | "complexity" | "terminal_contract" | "evidence_freshness";

export interface RunComponentAdmission {
  readonly component_id: string;
  readonly run_id: string;
  readonly repository_object_sha256: string;
  readonly component_kind: RunComponentKind;
  readonly schema_version: string;
  readonly parser_identity: string;
  readonly parser_version: string;
  readonly analyzer_identity?: string;
  readonly analyzer_version?: string;
  readonly value: unknown;
  readonly evidence: readonly { readonly path: string; readonly sha256: string }[];
  readonly observed_at: string;
  readonly component_sha256?: string;
}

export interface CurrentRunBindingAdmission {
  readonly binding_id: string;
  readonly repository_id: string;
  readonly run_id: string;
  readonly repository_object_sha256: string;
  readonly sequence: number;
  readonly evidence: readonly { readonly path: string; readonly sha256: string }[];
  readonly bound_at: string;
}

export interface SqliteControlPlaneSnapshotProducerOptions {
  readonly repository: OpenControlPlaneDatabase;
  readonly global: OpenControlPlaneDatabase;
  readonly repository_id?: string;
}

interface DatabaseReadSeal {
  readonly data_version: number;
  readonly total_changes: number;
}

interface AuthorityReadSeal {
  readonly repository: DatabaseReadSeal;
  readonly global: DatabaseReadSeal;
}

type ConsistencyWindowHook = (attempt: number) => void | Promise<void>;

const MAX_CONSISTENCY_ATTEMPTS = 3;

function fail(message: string): never { throw new Error(`Live control-plane evidence is unavailable: ${message}`); }
function readDatabaseSeal(database: OpenControlPlaneDatabase): DatabaseReadSeal {
  const version = database.database.query<{ data_version: number }>("PRAGMA data_version").get();
  const changes = database.database.query<{ total_changes: number }>("SELECT total_changes() AS total_changes").get();
  if (version === null || changes === null || !Number.isSafeInteger(version.data_version) || !Number.isSafeInteger(changes.total_changes)) {
    fail(`${database.kind} database consistency seal is unavailable`);
  }
  return { data_version: version.data_version, total_changes: changes.total_changes };
}
function sameDatabaseSeal(left: DatabaseReadSeal, right: DatabaseReadSeal): boolean {
  return left.data_version === right.data_version && left.total_changes === right.total_changes;
}
function sameAuthoritySeal(left: AuthorityReadSeal, right: AuthorityReadSeal): boolean {
  return sameDatabaseSeal(left.repository, right.repository) && sameDatabaseSeal(left.global, right.global);
}
function parseComponent(kind: RunComponentKind, value: unknown): unknown {
  if (kind === "complexity") return complexity.parse(value);
  if (kind === "terminal_contract") return terminal.parse(value);
  if (kind === "detector_coverage" || kind === "evidence_freshness") return text.parse(value);
  return value;
}
function parseJson(value: string, label: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { fail(`${label} is not valid JSON`); }
}
function parseEvidence(value: unknown, label: string): { readonly path: string; readonly sha256: string }[] {
  try { return z.array(evidenceRef).min(1).parse(value); } catch { fail(`${label} is missing strict evidence references`); }
}
function assertEvidenceAdmitted(database: OpenControlPlaneDatabase, evidence: readonly { readonly path: string; readonly sha256: string }[], repositoryId: string): void {
  for (const entry of evidence) {
    const row = database.database.query<{ evidence_id: string }>(
      "SELECT evidence_id FROM evidence_records WHERE repository_id = ? AND path = ? AND sha256 = ? LIMIT 1",
    ).get(repositoryId, entry.path, entry.sha256);
    if (row === null) fail(`evidence ${entry.path} is not admitted for repository ${repositoryId}`);
  }
}
function assertRunObjectAdmitted(database: OpenControlPlaneDatabase, runId: string, repositoryObjectSha256: string, repositoryId: string): void {
  const row = database.database.query<{ repository_id: string }>("SELECT repository_id FROM runs WHERE run_id = ?").get(runId);
  if (row === null || row.repository_id !== repositoryId) throw new Error("run object admission references an unknown or mismatched run");
  const closing = database.database.query<{ event_id: string }>(
    "SELECT event_id FROM run_events WHERE run_id = ? AND event_kind = 'repository_object.closed' AND repository_object_sha256 = ? LIMIT 1",
  ).get(runId, repositoryObjectSha256);
  if (closing === null) throw new Error("run object admission requires an admitted closing repository object");
}
function rowComponent(row: { component_sha256: string; canonical_json: string; component_kind: string }): unknown {
  const value = parseJson(row.canonical_json, `stored ${row.component_kind} component`);
  if (sha256Bytes(canonicalJson(value)) !== row.component_sha256) fail(`stored ${row.component_kind} component digest mismatch`);
  return value;
}
function sameSubject(left: object, right: object): boolean { return canonicalJson(left) === canonicalJson(right); }
const emptyQualificationProvenance = {
  credited_trial_ids: [], pre_dispatch_observation_ids: [], pre_evaluation_observation_ids: [],
  pre_dispatch_observed_at: [], pre_evaluation_observed_at: [], pre_dispatch_evidence_digests: [], pre_evaluation_evidence_digests: [],
  trial_evidence_digests: [], evaluation_evidence_digest_sets: [], worker_actor_ids: [], author_actor_ids: [],
  pre_dispatch_observer_actor_ids: [], pre_evaluation_observer_actor_ids: [], evaluator_actor_ids: [],
  verified_successes: 0, repository_cohort_count: 0, independent_evaluation: false,
  unresolved_no_harm_violations: 0, unresolved_authority_violations: 0, explicitly_disqualified: false,
} as const;

export function appendRunComponent(database: OpenControlPlaneDatabase, input: RunComponentAdmission): void {
  if (database.kind !== "repository") throw new Error("run components require a repository database");
  text.parse(input.component_id); text.parse(input.run_id); digest.parse(input.repository_object_sha256); text.parse(input.schema_version); text.parse(input.parser_identity); text.parse(input.parser_version); timestamp.parse(input.observed_at);
  const parsed = parseComponent(input.component_kind, input.value);
  const canonical = canonicalJson(parsed);
  const componentSha = sha256Bytes(canonical);
  if (input.component_sha256 !== undefined && input.component_sha256 !== componentSha) throw new Error("run component digest does not match canonical value");
  const evidence = parseEvidence(input.evidence, "run component");
  const run = database.database.query<{ repository_id: string }>("SELECT repository_id FROM runs WHERE run_id = ?").get(input.run_id);
  if (run === null) throw new Error("run component references an unknown run");
  assertRunObjectAdmitted(database, input.run_id, input.repository_object_sha256, run.repository_id);
  assertEvidenceAdmitted(database, evidence, run.repository_id);
  database.database.query(
    `INSERT INTO run_components(component_id, run_id, repository_object_sha256, component_kind, schema_version, parser_identity, parser_version, analyzer_identity, analyzer_version, component_sha256, canonical_json, evidence_json, observed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(input.component_id, input.run_id, input.repository_object_sha256, input.component_kind, input.schema_version, input.parser_identity, input.parser_version, input.analyzer_identity ?? null, input.analyzer_version ?? null, componentSha, canonical, canonicalJson(evidence), input.observed_at);
}

export function appendCurrentRunBinding(database: OpenControlPlaneDatabase, input: CurrentRunBindingAdmission): void {
  if (database.kind !== "repository") throw new Error("current run bindings require a repository database");
  text.parse(input.binding_id); text.parse(input.repository_id); text.parse(input.run_id); timestamp.parse(input.bound_at);
  const evidence = parseEvidence(input.evidence, "current run binding");
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1 || !digest.safeParse(input.repository_object_sha256).success) throw new Error("current run binding identity is invalid");
  assertRunObjectAdmitted(database, input.run_id, input.repository_object_sha256, input.repository_id);
  assertEvidenceAdmitted(database, evidence, input.repository_id);
  database.database.query(
    `INSERT INTO current_run_bindings(binding_id, repository_id, run_id, repository_object_sha256, sequence, evidence_json, bound_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(input.binding_id, input.repository_id, input.run_id, input.repository_object_sha256, input.sequence, canonicalJson(evidence), input.bound_at);
}

export class SqliteControlPlaneSnapshotProducer {
  readonly #repository: OpenControlPlaneDatabase;
  readonly #global: OpenControlPlaneDatabase;
  readonly #repositoryId: string | null;
  readonly #store: SqliteControlPlaneStore;
  readonly #consistencyWindowHook: ConsistencyWindowHook | null;

  constructor(options: SqliteControlPlaneSnapshotProducerOptions, consistencyWindowHook: ConsistencyWindowHook | null = null) {
    if (options.repository.kind !== "repository") throw new Error("Snapshot producer requires a repository database");
    if (options.global.kind !== "global") throw new Error("Snapshot producer requires a global database");
    this.#repository = options.repository;
    this.#global = options.global;
    this.#repositoryId = options.repository_id ?? null;
    this.#store = new SqliteControlPlaneStore(options.repository, options.global);
    this.#consistencyWindowHook = consistencyWindowHook;
  }

  async load(signal?: AbortSignal): Promise<CanonicalControlPlaneSnapshot> {
    for (let attempt = 1; attempt <= MAX_CONSISTENCY_ATTEMPTS; attempt += 1) {
      if (signal?.aborted) throw new Error("Live control-plane snapshot request was cancelled");
      // This is a bounded optimistic read window, not a cross-database
      // transaction. Reverse-order closing seals give the repository and global
      // stability intervals a common overlap across every composition read.
      const opened: AuthorityReadSeal = {
        repository: readDatabaseSeal(this.#repository),
        global: readDatabaseSeal(this.#global),
      };
      if (this.#consistencyWindowHook !== null) await this.#consistencyWindowHook(attempt);
      if (signal?.aborted) throw new Error("Live control-plane snapshot request was cancelled");
      let composition: { readonly ok: true; readonly value: CanonicalControlPlaneSnapshot } | { readonly ok: false; readonly error: unknown };
      try {
        composition = { ok: true, value: parseCanonicalLiveSnapshot(await this.#compose()) };
      } catch (error) {
        composition = { ok: false, error };
      }
      const closed: AuthorityReadSeal = {
        global: readDatabaseSeal(this.#global),
        repository: readDatabaseSeal(this.#repository),
      };
      if (signal?.aborted) throw new Error("Live control-plane snapshot request was cancelled");
      if (!sameAuthoritySeal(opened, closed)) continue;
      if (!composition.ok) throw composition.error;
      return composition.value;
    }
    fail(`repository or global authority changed during ${MAX_CONSISTENCY_ATTEMPTS} consecutive snapshot read windows`);
  }

  #component(repositoryId: string, runId: string, objectSha: string, kind: RunComponentKind): { value: unknown; evidence: readonly { readonly path: string; readonly sha256: string }[] } {
    const rows = this.#repository.database.query<{ component_sha256: string; canonical_json: string; evidence_json: string; component_kind: string }>(
      `SELECT component_sha256, canonical_json, evidence_json, component_kind FROM run_components
       WHERE run_id = ? AND repository_object_sha256 = ? AND component_kind = ? ORDER BY observed_at DESC`,
    ).all(runId, objectSha, kind);
    if (rows.length !== 1) fail(`${kind} component is absent or ambiguous`);
    const row = rows[0]!;
    const evidence = parseEvidence(parseJson(row.evidence_json, `${kind} evidence`), `${kind} evidence`);
    assertEvidenceAdmitted(this.#repository, evidence, repositoryId);
    return { value: parseComponent(kind, rowComponent(row)), evidence };
  }

  async #compose(): Promise<Record<string, unknown>> {
    const repositoryIds = this.#repository.database.query<{ repository_id: string }>("SELECT repository_id FROM repositories ORDER BY repository_id").all().map((row) => row.repository_id);
    const repositoryId = this.#repositoryId ?? (repositoryIds.length === 1 ? repositoryIds[0]! : null);
    if (repositoryId === null || !repositoryIds.includes(repositoryId)) fail("repository scope is absent or ambiguous");
    const bindingRows = this.#repository.database.query<{ repository_id: string; run_id: string; repository_object_sha256: string; sequence: number }>(
      `SELECT repository_id, run_id, repository_object_sha256, sequence FROM current_run_bindings WHERE repository_id = ? ORDER BY sequence DESC LIMIT 1`,
    ).all(repositoryId);
    if (bindingRows.length !== 1) fail(bindingRows.length === 0 ? "current run binding is absent" : "current run binding is ambiguous");
    const binding = bindingRows[0]!;
    const run = this.#repository.database.query<{ run_id: string; repository_id: string; mister_clean_version: string; detector_set_id: string; detector_set_sha256: string; observed_then_json: string; observed_then_sha256: string | null; created_at: string }>(
      `SELECT run_id, repository_id, mister_clean_version, detector_set_id, detector_set_sha256, observed_then_json, observed_then_sha256, created_at FROM runs WHERE run_id = ?`,
    ).get(binding.run_id);
    if (run === null || run.repository_id !== binding.repository_id) fail("current run does not bind repository");
    if (run.observed_then_sha256 === null || sha256Bytes(run.observed_then_json) !== run.observed_then_sha256) fail("run observation digest is absent or incorrect");
    const observation = runObservation.safeParse(parseJson(run.observed_then_json, "run observation"));
    if (!observation.success || observation.data.run_id !== run.run_id || observation.data.subject.repository_id !== run.repository_id || observation.data.detector_set.detector_set_id !== run.detector_set_id || observation.data.detector_set.sha256 !== run.detector_set_sha256) fail("run observation is absent, noncanonical, or row-unbound");
    const observed = observation.data;
    if (observed.subject.repository_object_sha256 !== binding.repository_object_sha256) fail("current run object does not match observation");
    const closingRows = this.#repository.database.query<{ repository_object_sha256: string; payload_json: string }>(
      `SELECT repository_object_sha256, payload_json FROM run_events WHERE run_id = ? AND event_kind = 'repository_object.closed' ORDER BY sequence`,
    ).all(run.run_id);
    if (closingRows.length !== 1) fail("current run has no unique closing repository object");
    const closing = parseJson(closingRows[0]!.payload_json, "closing repository object");
    if (!closing || typeof closing !== "object" || Array.isArray(closing)) fail("closing repository object is malformed");
    const closingRecord = closing as Record<string, unknown>;
    const closingSubject = repositorySubjectSchema.safeParse(closingRecord.repository);
    if (!closingSubject.success || closingRecord.run_id !== run.run_id || closingRows[0]!.repository_object_sha256 !== binding.repository_object_sha256 || !sameSubject(closingSubject.data, observed.subject)) fail("closing repository object is not bound to the run");

    const interpretationRows = this.#repository.database.query<{ known_now_json: string; known_now_sha256: string | null; interpretation_sha256: string; detector_set_sha256: string }>(
      `SELECT known_now_json, known_now_sha256, interpretation_sha256, detector_set_sha256 FROM run_interpretations WHERE source_run_id = ? ORDER BY interpreted_at DESC`,
    ).all(run.run_id);
    if (interpretationRows.length !== 1 || interpretationRows[0]!.detector_set_sha256 !== run.detector_set_sha256 || interpretationRows[0]!.known_now_sha256 === null || sha256Bytes(interpretationRows[0]!.known_now_json) !== interpretationRows[0]!.known_now_sha256 || sha256Bytes(interpretationRows[0]!.known_now_json) !== interpretationRows[0]!.interpretation_sha256) fail("run interpretation is absent, ambiguous, or digest-unbound");
    const interpretation = runInterpretation.safeParse(parseJson(interpretationRows[0]!.known_now_json, "run interpretation"));
    if (!interpretation.success || interpretation.data.source_run_id !== run.run_id || interpretation.data.detector_set.detector_set_id !== run.detector_set_id || interpretation.data.detector_set.sha256 !== run.detector_set_sha256 || canonicalJson(interpretation.data.debt_flow) !== canonicalJson(observed.debt_flow)) fail("run interpretation is malformed, row-unbound, or accounting-divergent");
    const interpreted = interpretation.data;
    const knownNow = observed.known_now_issue_ids;
    if (knownNow === undefined) fail("run observation lacks known-now issue accounting");

    const component = (kind: RunComponentKind) => this.#component(repositoryId, run.run_id, binding.repository_object_sha256, kind);
    const detector = component("detector_coverage");
    const complexityValue = component("complexity");
    const terminalValue = component("terminal_contract");
    const freshness = component("evidence_freshness");
    const manifests = this.#repository.database.query<{ manifest_id: string; revision: number; manifest_sha256: string; canonical_manifest_json: string }>(
      `SELECT manifest_id, revision, manifest_sha256, canonical_manifest_json FROM manifest_revisions WHERE run_id = ? ORDER BY revision DESC`,
    ).all(run.run_id);
    if (manifests.length !== 1) fail("current run manifest is absent or ambiguous");
    const manifestRow = manifests[0]!;
    let manifest: ReturnType<typeof parseCanonicalManifest>;
    try { manifest = parseCanonicalManifest(manifestRow.canonical_manifest_json); } catch { fail("manifest bytes are not canonical"); }
    if (manifest.manifest_id !== manifestRow.manifest_id || manifest.revision !== manifestRow.revision || manifest.run_id !== run.run_id || sha256Bytes(manifestRow.canonical_manifest_json) !== manifestRow.manifest_sha256 || !sameSubject(manifest.repository, observed.subject)) fail("manifest row is not bound to current run/object");
    const directiveIds = this.#repository.database.query<{ directive_id: string }>(
      `SELECT DISTINCT directive_id FROM directive_events WHERE run_id = ? AND manifest_id = ? AND manifest_revision = ? ORDER BY directive_id`,
    ).all(run.run_id, manifest.manifest_id, manifest.revision);
    if (directiveIds.length !== 1) fail("manifest has no unique admitted directive chain");
    const directiveChain = await this.#store.listDirectiveEvents(directiveIds[0]!.directive_id as never);
    if (directiveChain.length === 0) fail("manifest has no admitted directive chain");
    for (const event of directiveChain) {
      assertEvidenceAdmitted(this.#repository, event.evidence, repositoryId);
    }
    const lastDirective = directiveChain.at(-1)!;
    const receiptIds = this.#repository.database.query<{ receipt_id: string }>(
      `SELECT receipt_id FROM receipts WHERE run_id = ? AND manifest_id = ? AND manifest_revision = ? ORDER BY receipt_id`,
    ).all(run.run_id, manifest.manifest_id, manifest.revision);
    const receipts = (await Promise.all(receiptIds.map((row) => this.#store.getReceipt(row.receipt_id as never)))).filter((value): value is NonNullable<typeof value> => value !== null);
    if (receipts.length !== receiptIds.length || receipts.some((value) => value.run_id !== run.run_id || value.manifest_id !== manifest.manifest_id || value.manifest_revision !== manifest.revision || !sameSubject(value.output_repository, observed.subject))) fail("receipt row is not bound to current run/object");
    if (receipts.length === 0) fail("current manifest has no admitted receipts");
    for (const receipt of receipts) assertEvidenceAdmitted(this.#repository, receipt.evidence, repositoryId);

    const issueRows = this.#repository.database.query<{ issue_id: string; repository_id: string; first_detected_run_id: string; immutable_identity_json: string }>(
      `SELECT issue_id, repository_id, first_detected_run_id, immutable_identity_json FROM issue_roots WHERE repository_id = ? ORDER BY issue_id`,
    ).all(run.repository_id);
    const edgeRows = this.#repository.database.query<{ from_issue_id: string; to_issue_id: string; edge_kind: string }>("SELECT from_issue_id, to_issue_id, edge_kind FROM issue_edges").all();
    const issueIds = new Set(issueRows.map((row) => row.issue_id));
    if (new Set(issueRows.map((row) => row.issue_id)).size !== issueRows.length) fail("issue roots contain duplicate identities");
    for (const selectedIssueId of manifest.selected_issue_ids) {
      if (!issueIds.has(selectedIssueId)) fail(`manifest selects unknown issue ${selectedIssueId}`);
    }
    if (edgeRows.some((row) => !issueIds.has(row.from_issue_id) || !issueIds.has(row.to_issue_id) || row.from_issue_id === row.to_issue_id || !ISSUE_EDGE_KINDS.includes(row.edge_kind as typeof ISSUE_EDGE_KINDS[number]))) fail("issue edge orientation or kind is invalid");
    const edges = new Map<string, { prerequisites: string[]; dependents: string[] }>();
    for (const row of edgeRows) { const from = edges.get(row.from_issue_id) ?? { prerequisites: [], dependents: [] }; const to = edges.get(row.to_issue_id) ?? { prerequisites: [], dependents: [] }; if (row.edge_kind === "requires" || row.edge_kind === "blocks") { from.dependents.push(row.to_issue_id); to.prerequisites.push(row.from_issue_id); } edges.set(row.from_issue_id, from); edges.set(row.to_issue_id, to); }
    const issues = issueRows.map((row) => {
      const value = parseJson(row.immutable_identity_json, `issue ${row.issue_id}`);
      const parsed = issueRootSchema.safeParse(value);
      if (!parsed.success || canonicalJson(value) !== row.immutable_identity_json || parsed.data.issue_id !== row.issue_id || row.repository_id !== run.repository_id || parsed.data.first_detected_run_id !== row.first_detected_run_id) fail(`issue ${row.issue_id} identity is not canonical`);
      const item = parsed.data;
      assertEvidenceAdmitted(this.#repository, item.evidence, repositoryId);
      for (const observationId of item.observation_ids) {
        const observation = this.#repository.database.query<{ repository_object_sha256: string; evidence_sha256: string }>(
          `SELECT o.repository_object_sha256, l.evidence_sha256 FROM observations o JOIN issue_observation_links l ON l.observation_id = o.observation_id
           WHERE l.issue_id = ? AND o.observation_id = ? AND o.run_id = ?`,
        ).get(row.issue_id, observationId, item.first_detected_run_id);
        if (observation === null || observation.repository_object_sha256 !== observed.subject.repository_object_sha256) fail(`issue ${row.issue_id} observation link is not bound to current evidence`);
        const linkedEvidence = this.#repository.database.query<{ evidence_id: string }>(
          "SELECT evidence_id FROM evidence_records WHERE repository_id = ? AND sha256 = ? LIMIT 1",
        ).get(repositoryId, observation.evidence_sha256);
        if (linkedEvidence === null) fail(`issue ${row.issue_id} observation link evidence is not admitted`);
      }
      const eventRows = this.#repository.database.query<{ sequence: number; run_id: string; event_kind: string; from_state: string | null; to_state: string }>(
        "SELECT sequence, run_id, event_kind, from_state, to_state FROM issue_events WHERE issue_id = ? ORDER BY sequence",
      ).all(row.issue_id);
      if (eventRows.length === 0) fail(`issue ${row.issue_id} lacks a state event`);
      let priorState: string | null = null;
      for (const [index, event] of eventRows.entries()) {
        if (event.sequence !== index + 1 || event.from_state !== priorState || !ISSUE_EVENT_KINDS.includes(event.event_kind as typeof ISSUE_EVENT_KINDS[number]) || !ISSUE_STATES.includes(event.to_state as typeof ISSUE_STATES[number]) || (event.from_state !== null && !ISSUE_STATES.includes(event.from_state as typeof ISSUE_STATES[number]))) fail(`issue ${row.issue_id} state event chain is not canonical`);
        priorState = event.to_state;
      }
      const state = { to_state: priorState! };
      const relation = edges.get(row.issue_id) ?? { prerequisites: [], dependents: [] };
      const plan = manifest.lanes.find((lane) => lane.issue_ids.some((issueId) => String(issueId) === row.issue_id));
      if (plan === undefined) fail(`issue ${row.issue_id} has no admitted planning lane`);
      const { normalizer: _normalizer, disposition: _disposition, state: _declaredState, ...publicIdentity } = item;
      return { ...publicIdentity, issue_id: row.issue_id, state: state.to_state, prerequisite_issue_ids: relation.prerequisites.sort(), dependent_issue_ids: relation.dependents.sort(), unlock_value: 0, regression_risk: 0, coordination_claims: plan.coordination_claims.map((claim) => ({ key: claim.key, access: claim.access, operation_class: claim.operation_class, commutes_with: claim.commutes_with, commutativity_ref: claim.commutativity_ref === null ? null : { path: "manifest", sha256: claim.commutativity_ref } })), blocked_reasons: [], owner: plan.owner, worktree: plan.worktree, recommended_tuple: plan.assignment.agent_tuple_id, rationale: "Canonical issue identity is admitted; lane assignment is the current planning rationale." };
    });

    const capabilities = this.#global.database.query<{ capability_id: string; family: string; label: string; description: string; taxonomy_version: string }>("SELECT capability_id, family, label, description, taxonomy_version FROM capabilities ORDER BY rowid").all().map((value) => ({ id: parseRepositoryCapabilityId(value.capability_id), scope: "repository", family: value.family, label: value.label, description: value.description, taxonomy_version: value.taxonomy_version }));
    if (capabilities.length !== CAPABILITY_DEFINITIONS.length || canonicalJson(capabilities) !== canonicalJson(CAPABILITY_DEFINITIONS)) fail("global capability taxonomy is absent or noncanonical");
    const agentRows = this.#global.database.query<{ agent_tuple_id: string; model_name: string; model_family: string; harness_name: string; reasoning_level: string; deployment: string | null; inference_source: string | null; execution_route_id: string | null; invocation_adapter: string | null; headless_supported: number | null }>(
      `SELECT a.agent_tuple_id, m.display_name AS model_name, m.family AS model_family, h.display_name AS harness_name, a.reasoning_level,
              d.provider_model_id AS deployment, s.display_name AS inference_source, r.execution_route_id, r.invocation_adapter, r.headless_supported
       FROM agent_tuples a JOIN models m ON m.model_id = a.model_id JOIN harnesses h ON h.harness_id = a.harness_id
       LEFT JOIN execution_routes r ON r.agent_tuple_id = a.agent_tuple_id
       LEFT JOIN deployments d ON d.deployment_id = r.deployment_id
       LEFT JOIN inference_sources s ON s.inference_source_id = d.inference_source_id ORDER BY a.agent_tuple_id`,
    ).all();
    if (new Set(agentRows.map((row) => row.agent_tuple_id)).size !== agentRows.length) fail("global agent tuples are ambiguous");
    if (agentRows.some((row) => row.execution_route_id === null || row.deployment === null || row.inference_source === null || row.invocation_adapter === null)) fail("global agent route joins are incomplete");
    const agentViews = await this.#store.listAgents(null, Math.max(agentRows.length, 1));
    const agentViewById = new Map(agentViews.map((agent) => [String(agent.agent_tuple_id), agent]));
    if (agentViews.length !== agentRows.length || new Set(agentViews.map((agent) => agent.agent_tuple_id)).size !== agentViews.length) fail("global agent qualification projection is absent or ambiguous");
    const agents = agentRows.map((row) => {
      // Historical quality credit is ledger-derived. It is deliberately kept
      // separate from the current execution seat, which remains unbound.
      const agentView = agentViewById.get(row.agent_tuple_id);
      if (agentView === undefined) fail(`global agent ${row.agent_tuple_id} qualification projection is absent`);
      const scoreByCapability = new Map(agentView.capabilities.map((score) => [score.capability_id, score]));
      const capabilityScores = CAPABILITY_DEFINITIONS.map((definition) => {
        const score = scoreByCapability.get(definition.id);
        if (score === undefined) return { capability_id: definition.id, score: 0, confidence: 0, verified_trials: 0, qualification: "UNTESTED" as const, qualification_provenance: emptyQualificationProvenance };
        const proof = score.qualification_provenance;
        return { capability_id: definition.id, score: score.trial_count === 0 ? 0 : score.verified_success_count / score.trial_count, confidence: Math.min(1, score.trial_count / 50), verified_trials: score.trial_count, qualification: score.qualification, qualification_provenance: { ...proof, verified_successes: score.verified_success_count, repository_cohort_count: score.repository_cohort_count, independent_evaluation: score.independently_evaluated, unresolved_no_harm_violations: score.no_harm_violation_count, unresolved_authority_violations: score.authority_violation_count, explicitly_disqualified: score.qualification === "DISQUALIFIED" } };
      });
      const availabilityRow = this.#global.database.query<{ availability: string }>(
        "SELECT availability FROM availability_observations WHERE agent_tuple_id = ? ORDER BY observed_at DESC LIMIT 1",
      ).get(row.agent_tuple_id);
      const availability = availabilityRow?.availability;
      if (availability !== undefined && !new Set(["available", "busy", "paused", "offline", "unknown"]).has(availability)) fail(`agent ${row.agent_tuple_id} availability is not canonical`);
      const normalizedAvailability = (availability ?? "unknown") as "available" | "busy" | "paused" | "offline" | "unknown";
      return { agent_tuple_id: row.agent_tuple_id, model: row.model_name, family: row.model_family, harness: row.harness_name, reasoning_level: row.reasoning_level,
      deployment: row.deployment!, inference_source: row.inference_source!, route: row.execution_route_id!, invocation_adapter: row.invocation_adapter!, headless: row.headless_supported === null ? null : row.headless_supported === 1,
      available: normalizedAvailability === "available", availability: normalizedAvailability, active_in_repository: false, role: "unassigned", control_surface: null, familiarity_runs: 0, capability_scores: capabilityScores, champion_for: [], evidence: [],
      execution_identity: { intended_surface_label: row.agent_tuple_id, disposition: "IDENTITY_UNBOUND" as const, last_external_verification_at: null, evidence: [] },
      metrics: { verified_success_rate: null, reliability: null, cost_per_success_usd: null, tokens_per_success: null, tokens_per_second: null, local: null },
      };
    });
    const historicalRows = this.#repository.database.query<{ run_id: string; repository_id: string; mister_clean_version: string; detector_set_id: string; detector_set_sha256: string; observed_then_json: string; observed_then_sha256: string | null; created_at: string }>(
      `SELECT run_id, repository_id, mister_clean_version, detector_set_id, detector_set_sha256, observed_then_json, observed_then_sha256, created_at FROM runs WHERE repository_id = ? ORDER BY created_at, run_id`,
    ).all(repositoryId);
    const historical = historicalRows.map((row) => {
      if (row.observed_then_sha256 === null || sha256Bytes(row.observed_then_json) !== row.observed_then_sha256) fail(`run ${row.run_id} observation digest is absent or incorrect`);
      const parsedObservation = runObservation.safeParse(parseJson(row.observed_then_json, `run ${row.run_id} observation`));
      if (!parsedObservation.success || parsedObservation.data.run_id !== row.run_id || parsedObservation.data.subject.repository_id !== row.repository_id || parsedObservation.data.detector_set.detector_set_id !== row.detector_set_id || parsedObservation.data.detector_set.sha256 !== row.detector_set_sha256 || parsedObservation.data.known_now_issue_ids === undefined) fail(`run ${row.run_id} observation is not canonical and row-bound`);
      const interpretationRow = this.#repository.database.query<{ known_now_json: string; known_now_sha256: string | null; interpretation_sha256: string; detector_set_sha256: string }>("SELECT known_now_json, known_now_sha256, interpretation_sha256, detector_set_sha256 FROM run_interpretations WHERE source_run_id = ? ORDER BY interpreted_at DESC LIMIT 2").all(row.run_id);
      if (interpretationRow.length !== 1 || interpretationRow[0]!.known_now_sha256 === null || sha256Bytes(interpretationRow[0]!.known_now_json) !== interpretationRow[0]!.known_now_sha256 || sha256Bytes(interpretationRow[0]!.known_now_json) !== interpretationRow[0]!.interpretation_sha256 || interpretationRow[0]!.detector_set_sha256 !== row.detector_set_sha256) fail(`run ${row.run_id} interpretation is absent or digest-unbound`);
      const parsedInterpretation = runInterpretation.safeParse(parseJson(interpretationRow[0]!.known_now_json, `run ${row.run_id} interpretation`));
      if (!parsedInterpretation.success || parsedInterpretation.data.source_run_id !== row.run_id) fail(`run ${row.run_id} interpretation is malformed`);
      const closing = this.#repository.database.query<{ repository_object_sha256: string; payload_json: string }>("SELECT repository_object_sha256, payload_json FROM run_events WHERE run_id = ? AND event_kind = 'repository_object.closed' ORDER BY sequence").all(row.run_id);
      if (closing.length !== 1) fail(`run ${row.run_id} has no unique closing object`);
      const payload = parseJson(closing[0]!.payload_json, `run ${row.run_id} closing object`);
      const parsedSubject = payload && typeof payload === "object" && !Array.isArray(payload) ? repositorySubjectSchema.safeParse((payload as Record<string, unknown>).repository) : null;
      if (parsedSubject === null || !parsedSubject.success || closing[0]!.repository_object_sha256 !== parsedSubject.data.repository_object_sha256 || !sameSubject(parsedSubject.data, parsedObservation.data.subject)) fail(`run ${row.run_id} closing object is not bound`);
      return { row, observation: parsedObservation.data, interpretation: parsedInterpretation.data, subject: parsedSubject.data };
    });
    if (historical.length === 0 || new Set(historical.map((entry) => entry.row.run_id)).size !== historical.length) fail("longitudinal run history is absent or ambiguous");
    const runView = (entry: (typeof historical)[number]) => ({ run_id: entry.row.run_id, observed_at: entry.observation.observed_at, mister_clean_version: entry.observation.mister_clean_version, detector_version: entry.observation.detector_set.version, subject: entry.subject, scope: entry.observation.scope, exclusions: entry.observation.exclusions, start_verdict: entry.observation.start_verdict, terminal_verdict: entry.observation.terminal_verdict, debt_flow: entry.observation.debt_flow, real_issue_ids: entry.interpretation.real_issue_ids, known_now_issue_ids: entry.observation.known_now_issue_ids!, false_positive_issue_ids: entry.interpretation.false_positive_issue_ids, detector_misses: entry.observation.detector_misses ?? [], process_defects: entry.observation.process_defects ?? [], classification_corrections: entry.interpretation.classification_corrections.map((value) => value.issue_id), directives: entry.row.run_id === run.run_id ? [lastDirective.directive_id] : [], receipts: entry.row.run_id === run.run_id ? receipts.flatMap((value) => value.evidence.map((evidence) => ({ path: evidence.path, sha256: evidence.sha256 }))) : [], note: entry.observation.note ?? "No narrative note was admitted; see canonical evidence components." });
    const runViews = historical.map(runView);
    const currentHistory = historical.find((entry) => entry.row.run_id === run.run_id);
    if (currentHistory === undefined) fail("current run is absent from longitudinal history");
    if (canonicalJson(currentHistory.observation.debt_flow) !== canonicalJson(observed.debt_flow)) fail("current run flow does not match current snapshot flow");
    const complexityValueParsed = complexity.parse(complexityValue.value);
    const terminalValueParsed = terminal.parse(terminalValue.value);
    const snapshot = { source: "live", source_label: "Live SQLite authority projection", repository: run.repository_id, current_run_id: run.run_id, current_subject: observed.subject, current_flow: observed.debt_flow, previous_flow: historical.length > 1 ? historical[historical.length - 2]!.observation.debt_flow : null, first_flow: historical[0]!.observation.debt_flow, issues, agents, runs: runViews, capabilities, complexity: complexityValueParsed, manifest: { manifest_id: manifest.manifest_id, revision: manifest.revision, digest: manifestRow.manifest_sha256, projection_digest: sha256Bytes(canonicalJson(manifest.projections)), subject: manifest.repository, authority_mode: manifest.authority_mode, target_ref: manifest.target_ref, expected_target_commit: manifest.expected_target_commit, issue_graph: { issue_graph_id: manifest.issue_graph.issue_graph_id, version: manifest.issue_graph.version, digest: manifest.issue_graph.sha256 }, selected_issue_ids: manifest.selected_issue_ids, lanes: manifest.lanes.map((lane) => ({ owner: lane.owner, role: lane.role, worktree: lane.worktree, route: lane.assignment.execution_route_id })), directive_id: lastDirective.directive_id, directive_state: lastDirective.to_state, receipt_boundary: receipts.map((value) => value.output_repository.repository_object_sha256).join(",") }, terminal_contract: terminalValueParsed, current_authority: manifest.authority_mode, detector_coverage: String(detector.value), evidence_freshness: String(freshness.value) };
    return snapshot;
  }
}
