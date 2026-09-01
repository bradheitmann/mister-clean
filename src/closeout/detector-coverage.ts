/**
 * The small, shared detector universe used by closeout ledgers.
 *
 * Every name here is a ledger family, not a convenience check. Core families
 * always run; policy-gated families remain visible with an explicit
 * applicability disposition instead of silently disappearing from the ledger.
 */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import type { PublicSafetyScanResult } from "./inspection.js";
import {
  causalPlanningAccounting,
  type PlanningAuditResult,
  type PlanningFinding,
} from "./planning.js";
import {
  semanticCandidateSetSha256,
  type SemanticAuditResult,
  type SemanticProbeCandidate,
} from "./semantic.js";
import type { RepositoryObject } from "./repository-object.js";
import type { GitHubActionsAuditResult } from "./github-actions.js";
import {
  isVerifiedServerAttestationBinding,
  type FileRuntimeAttestationBinding,
} from "../runtime-binding.js";

export const DETECTOR_COVERAGE_SCHEMA_VERSION = "5";
export const DETECTOR_RUN_POLICY_VERSION = "1";
// Frozen compatibility identity. Never recompute v1 from a later registry.
const DETECTOR_REGISTRY_V1_SHA256 = "803e6d35762a802e980c874a4e8783c219234fdcaef9b9f2c570df9ba3d66f50";
const DETECTOR_REGISTRY_V2_SHA256 = "bd49c47b93786e215c9e02e6850e55ea9f19c5ff99666e768cd55e6911cfc66a";
const DETECTOR_REGISTRY_V3_SHA256 = "856ea127812f22aa50f0b566fae1350bf5d8c13db5c29548eff112d63027e47e";
const DETECTOR_REGISTRY_V4_SHA256 = "2a6687eac140f4277510c11648f3b0bbf06b104390d8a992b2c021999458c1b1";
const DETECTOR_REGISTRY_V5_SHA256 = "35d8e9e9595c124bdf68eb363621533c99e920e454a6d49749702479f9647ee6";

export const CLOSEOUT_DETECTORS = [
  {
    id: "planning_graph",
    scope: ".",
    command: "mister-clean audit planning . --json",
    detector: "mister-clean/planning_graph@2",
  },
  {
    id: "public_safety",
    scope: "tracked_shippable",
    command: "mister-clean audit public-safety . --tracked --json",
    detector: "mister-clean/public_safety@1",
  },
  {
    id: "github_actions",
    scope: ".",
    command: "mister-clean audit github-actions . --json",
    detector: "mister-clean/github_actions@3",
  },
  {
    id: "semantic_boundary",
    scope: ".",
    command: "mister-clean audit semantic . --json",
    detector: "mister-clean/semantic_boundary@1",
  },
] as const;

// Frozen schema-1 registry. Do not alias this to CLOSEOUT_DETECTORS: future
// registry changes must leave historical 1.3/1.4 evidence independently
// parseable with the exact definitions under which it was minted.
const DETECTOR_REGISTRY_V1 = [
  {
    id: "planning_graph",
    scope: ".",
    command: "mister-clean audit planning . --json",
    detector: "mister-clean/planning_graph@1",
  },
  {
    id: "public_safety",
    scope: "tracked_shippable",
    command: "mister-clean audit public-safety . --tracked --json",
    detector: "mister-clean/public_safety@1",
  },
  {
    id: "semantic_boundary",
    scope: ".",
    command: "mister-clean audit semantic . --json",
    detector: "mister-clean/semantic_boundary@1",
  },
] as const;

const DETECTOR_REGISTRY_V2 = DETECTOR_REGISTRY_V1;

const DETECTOR_REGISTRY_V3 = [
  ...DETECTOR_REGISTRY_V1.slice(0, 2),
  {
    id: "github_actions",
    scope: ".",
    command: "mister-clean audit github-actions . --json",
    detector: "mister-clean/github_actions@1",
  },
  DETECTOR_REGISTRY_V1[2],
] as const;

const DETECTOR_REGISTRY_V4 = [
  DETECTOR_REGISTRY_V1[0],
  DETECTOR_REGISTRY_V1[1],
  {
    id: "github_actions",
    scope: ".",
    command: "mister-clean audit github-actions . --json",
    detector: "mister-clean/github_actions@2",
  },
  DETECTOR_REGISTRY_V1[2],
] as const;

export type DetectorId = (typeof CLOSEOUT_DETECTORS)[number]["id"];
export type DetectorRegistryVersion = "1" | "2" | "3" | "4" | typeof DETECTOR_COVERAGE_SCHEMA_VERSION;

function detectorRegistry(version: DetectorRegistryVersion): typeof CLOSEOUT_DETECTORS {
  return (version === "1"
    ? DETECTOR_REGISTRY_V1
    : version === "2"
      ? DETECTOR_REGISTRY_V2
      : version === "3"
        ? DETECTOR_REGISTRY_V3
        : version === "4"
          ? DETECTOR_REGISTRY_V4
          : CLOSEOUT_DETECTORS) as typeof CLOSEOUT_DETECTORS;
}

export interface DetectorRunPolicy {
  readonly schema_version: typeof DETECTOR_RUN_POLICY_VERSION;
  readonly public_safety: {
    readonly disposition: "required" | "not_applicable";
    readonly basis: "tracked_shippable_surface" | "empty_tracked_surface";
    readonly scope: "tracked_shippable";
    readonly tracked_path_count: number;
  };
}

export interface DetectorApplicability {
  readonly detector_id: DetectorId;
  readonly disposition: "required" | "not_applicable";
  readonly basis: string;
}

export interface DigestRef {
  readonly path: string;
  readonly sha256: string;
}

export interface DetectorInputRef extends DigestRef {
  readonly kind: "public_safety_denylist" | "semantic_evidence_package" | "semantic_probe_manifest" | "semantic_trust_policy";
}

export interface DetectorRuntimeIdentity {
  readonly record_type: "mister-clean.detector-runtime-identity";
  readonly schema_version: "1.0";
  readonly status: "release_attested" | "source_development";
  readonly package: { readonly name: string; readonly version: string } | null;
  readonly claimed_source: { readonly git_commit: string; readonly git_tag: string } | null;
  readonly manifest: {
    readonly path: "./MANIFEST.sha256";
    readonly format: "sha256sum-v1-lf";
    readonly entry_count: number;
    readonly sha256: string;
  } | null;
  readonly entrypoint: { readonly path: string; readonly sha256: string };
  readonly claim_scope: {
    readonly covers: "own_package_regular_file_bytes";
    readonly excludes: readonly [
      "registry_publication_provenance",
      "dependency_resolution_graph",
      "filesystem_mode_bits_xattrs_and_timestamps",
      "release_attestation_self_bytes",
      "claimed_source_authenticity",
    ];
  } | {
    readonly covers: "source_entrypoint_regular_file_bytes_only";
    readonly excludes: readonly [
      "imported_source_module_graph",
      "dependency_resolution_graph",
      "runtime_host",
    ];
  };
  readonly reason: string | null;
}

export interface DetectorCoverageExecution {
  readonly detector_id: DetectorId;
  readonly phase: "baseline";
  readonly object: string;
  readonly repository_object: RepositoryObject;
  readonly scope: "." | "tracked_shippable";
  readonly command: string;
  readonly command_sha256: string;
  readonly detector: string;
  /** Identity of the registry label only; never an implementation-byte claim. */
  readonly detector_registry_sha256: string;
  /** Identity of the exact runtime package or source entrypoint that executed it. */
  readonly runtime_identity_sha256: string;
  /** Bundle-local frozen bytes for optional detector configuration. */
  readonly input_refs: readonly DetectorInputRef[];
  readonly result_ref: DigestRef;
  readonly result_sha256: string;
  readonly exit_code: number;
  readonly observed_at: string;
  readonly finding_fingerprints: readonly string[];
}

export interface DetectorCoverage {
  readonly registry_version: typeof DETECTOR_COVERAGE_SCHEMA_VERSION;
  readonly registry_sha256: string;
  /** Bound policy that independently determines the required subset. */
  readonly run_policy: DetectorRunPolicy;
  readonly run_policy_sha256: string;
  readonly runtime_identity: DetectorRuntimeIdentity;
  readonly runtime_identity_sha256: string;
  /** Every registry entry, including policy-gated non-applicable entries. */
  readonly applicability: readonly DetectorApplicability[];
  readonly baseline_object: string;
  readonly baseline_repository_object: RepositoryObject;
  readonly required_detector_ids: readonly DetectorId[];
  readonly executions: readonly DetectorCoverageExecution[];
  /** Exact sorted union of execution and action-comparator fingerprints. */
  readonly finding_fingerprints: readonly string[];
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function runtimeIdentityRecord(value: DetectorRuntimeIdentity): DetectorRuntimeIdentity {
  const claimScope = value.claim_scope.covers === "own_package_regular_file_bytes"
    ? {
        covers: "own_package_regular_file_bytes" as const,
        excludes: [
          "registry_publication_provenance",
          "dependency_resolution_graph",
          "filesystem_mode_bits_xattrs_and_timestamps",
          "release_attestation_self_bytes",
          "claimed_source_authenticity",
        ] as const,
      }
    : {
        covers: "source_entrypoint_regular_file_bytes_only" as const,
        excludes: [
          "imported_source_module_graph",
          "dependency_resolution_graph",
          "runtime_host",
        ] as const,
      };
  return {
    record_type: value.record_type,
    schema_version: value.schema_version,
    status: value.status,
    package: value.package ? { name: value.package.name, version: value.package.version } : null,
    claimed_source: value.claimed_source
      ? { git_commit: value.claimed_source.git_commit, git_tag: value.claimed_source.git_tag }
      : null,
    manifest: value.manifest
      ? {
          path: value.manifest.path,
          format: value.manifest.format,
          entry_count: value.manifest.entry_count,
          sha256: value.manifest.sha256,
        }
      : null,
    entrypoint: { path: value.entrypoint.path, sha256: value.entrypoint.sha256 },
    claim_scope: claimScope,
    reason: value.reason,
  };
}

export function detectorRuntimeIdentitySha256(value: DetectorRuntimeIdentity): string {
  return digest(JSON.stringify(runtimeIdentityRecord(value)));
}

export function createDetectorRuntimeIdentity(
  binding: FileRuntimeAttestationBinding,
): DetectorRuntimeIdentity {
  if (!isVerifiedServerAttestationBinding(binding)) {
    throw new Error("runtime attestation must be minted by Mister Clean's live verifier");
  }
  if (binding.status === "source_development") {
    if (binding.entrypoint.path !== "./src/cli.ts") {
      throw new Error("source-development detector execution requires the ./src/cli.ts entrypoint");
    }
    return {
      record_type: "mister-clean.detector-runtime-identity",
      schema_version: "1.0",
      status: "source_development",
      package: null,
      claimed_source: null,
      manifest: null,
      entrypoint: { path: binding.entrypoint.path, sha256: binding.entrypoint.sha256 },
      claim_scope: {
        covers: "source_entrypoint_regular_file_bytes_only",
        excludes: ["imported_source_module_graph", "dependency_resolution_graph", "runtime_host"],
      },
      reason: binding.reason ?? "explicit source-development execution",
    };
  }
  if (!binding.package || !binding.claimed_source || !binding.manifest || !binding.claim_scope) {
    throw new Error("release-attested runtime binding is incomplete");
  }
  if (binding.entrypoint.path !== "./bin/mister-clean.js") {
    throw new Error("release-attested detector execution requires the ./bin/mister-clean.js entrypoint");
  }
  return {
    record_type: "mister-clean.detector-runtime-identity",
    schema_version: "1.0",
    status: "release_attested",
    package: binding.package,
    claimed_source: binding.claimed_source,
    manifest: {
      path: binding.manifest.path,
      format: binding.manifest.format,
      entry_count: binding.manifest.entry_count,
      sha256: binding.manifest.sha256,
    },
    entrypoint: { path: binding.entrypoint.path, sha256: binding.entrypoint.sha256 },
    claim_scope: binding.claim_scope,
    reason: null,
  };
}

function object(value: unknown): Record<string, unknown> | undefined {
  return !!value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonempty);
}

function hexSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function requireFields(
  record: Record<string, unknown> | undefined,
  fields: readonly string[],
  path: string,
  errors: string[],
): record is Record<string, unknown> {
  if (!record) {
    errors.push(`${path}: expected object`);
    return false;
  }
  for (const field of fields) if (!(field in record)) errors.push(`${path}.${field}: missing`);
  return true;
}

function exactFields(
  record: Record<string, unknown> | undefined,
  fields: readonly string[],
  path: string,
  errors: string[],
): record is Record<string, unknown> {
  if (!requireFields(record, fields, path, errors)) return false;
  const allowed = new Set(fields);
  for (const field of Object.keys(record)) {
    if (!allowed.has(field)) errors.push(`${path}.${field}: unknown field`);
  }
  return true;
}

export function detectorRuntimeIdentityErrors(value: unknown, path = "$"): string[] {
  const errors: string[] = [];
  const record = object(value);
  const fields = [
    "record_type", "schema_version", "status", "package", "claimed_source", "manifest",
    "entrypoint", "claim_scope", "reason",
  ] as const;
  if (!exactFields(record, fields, path, errors)) return errors;
  if (record.record_type !== "mister-clean.detector-runtime-identity") {
    errors.push(`${path}.record_type: expected mister-clean.detector-runtime-identity`);
  }
  if (record.schema_version !== "1.0") errors.push(`${path}.schema_version: expected 1.0`);
  const status = String(record.status ?? "");
  if (!new Set(["release_attested", "source_development"]).has(status)) {
    errors.push(`${path}.status: expected release_attested or source_development`);
    return errors;
  }
  const entrypoint = object(record.entrypoint);
  if (!exactFields(entrypoint, ["path", "sha256"], `${path}.entrypoint`, errors)) return errors;
  if (!nonempty(entrypoint.path) || !String(entrypoint.path).startsWith("./")
    || String(entrypoint.path).includes("../")) errors.push(`${path}.entrypoint.path: expected safe package-relative path`);
  if (!hexSha256(entrypoint.sha256)) errors.push(`${path}.entrypoint.sha256: expected lowercase SHA-256`);

  if (status === "release_attested") {
    if (entrypoint.path !== "./bin/mister-clean.js") {
      errors.push(`${path}.entrypoint.path: release_attested requires ./bin/mister-clean.js`);
    }
    const packageRecord = object(record.package);
    const claimedSource = object(record.claimed_source);
    const manifest = object(record.manifest);
    if (exactFields(packageRecord, ["name", "version"], `${path}.package`, errors)) {
      if (!nonempty(packageRecord.name) || !nonempty(packageRecord.version)) errors.push(`${path}.package: name and version are required`);
    }
    if (exactFields(claimedSource, ["git_commit", "git_tag"], `${path}.claimed_source`, errors)) {
      if (typeof claimedSource.git_commit !== "string" || !/^[0-9a-f]{40}$/.test(claimedSource.git_commit)) {
        errors.push(`${path}.claimed_source.git_commit: expected 40-character lowercase Git object id`);
      }
      if (!nonempty(claimedSource.git_tag)) errors.push(`${path}.claimed_source.git_tag: required`);
    }
    if (exactFields(manifest, ["path", "format", "entry_count", "sha256"], `${path}.manifest`, errors)) {
      if (manifest.path !== "./MANIFEST.sha256") errors.push(`${path}.manifest.path: expected ./MANIFEST.sha256`);
      if (manifest.format !== "sha256sum-v1-lf") errors.push(`${path}.manifest.format: expected sha256sum-v1-lf`);
      if (!nonnegativeInteger(manifest.entry_count)) errors.push(`${path}.manifest.entry_count: expected nonnegative integer`);
      if (!hexSha256(manifest.sha256)) errors.push(`${path}.manifest.sha256: expected lowercase SHA-256`);
    }
    const scope = object(record.claim_scope);
    if (!exactFields(scope, ["covers", "excludes"], `${path}.claim_scope`, errors)
      || scope.covers !== "own_package_regular_file_bytes"
      || JSON.stringify(scope.excludes) !== JSON.stringify([
        "registry_publication_provenance",
        "dependency_resolution_graph",
        "filesystem_mode_bits_xattrs_and_timestamps",
        "release_attestation_self_bytes",
        "claimed_source_authenticity",
      ])) {
      errors.push(`${path}.claim_scope: release_attested requires the exact own-package claim and exclusions`);
    }
    if (record.reason !== null) errors.push(`${path}.reason: release_attested requires null`);
  } else {
    if (record.package !== null) errors.push(`${path}.package: ${status} requires null`);
    if (record.claimed_source !== null) errors.push(`${path}.claimed_source: ${status} requires null`);
    if (record.manifest !== null) errors.push(`${path}.manifest: ${status} requires null`);
    const scope = object(record.claim_scope);
    if (!exactFields(scope, ["covers", "excludes"], `${path}.claim_scope`, errors)
      || scope.covers !== "source_entrypoint_regular_file_bytes_only"
      || JSON.stringify(scope.excludes) !== JSON.stringify([
        "imported_source_module_graph", "dependency_resolution_graph", "runtime_host",
      ])) {
      errors.push(`${path}.claim_scope: source_development requires the exact source-entrypoint claim and exclusions`);
    }
    if (!nonempty(record.reason)) errors.push(`${path}.reason: ${status} requires an explanation`);
    if (entrypoint.path !== "./src/cli.ts") {
      errors.push(`${path}.entrypoint.path: source_development requires ./src/cli.ts`);
    }
  }
  return errors;
}

function validatePlanningResult(record: Record<string, unknown>, errors: string[]): void {
  const numericFields = [
    "artifactCount", "candidate_probe_count", "planningRootCount", "raw_finding_count",
    "root_debt_count", "structuredArtifactCount", "suppressed_by_typed_nonartifact_count",
  ] as const;
  requireFields(record, [
    ...numericFields, "counts", "exitCode", "findings", "raw_findings", "root_debts", "status",
  ], "$", errors);
  for (const field of numericFields) {
    if (!nonnegativeInteger(record[field])) errors.push(`$.${field}: expected nonnegative integer`);
  }
  const findings = Array.isArray(record.findings) ? record.findings : [];
  const rawFindings = Array.isArray(record.raw_findings) ? record.raw_findings : [];
  const rootDebts = Array.isArray(record.root_debts) ? record.root_debts : [];
  if (!Array.isArray(record.findings)) errors.push("$.findings: expected array");
  if (!Array.isArray(record.raw_findings)) errors.push("$.raw_findings: expected array");
  if (!Array.isArray(record.root_debts)) errors.push("$.root_debts: expected array");
  if (record.raw_finding_count !== rawFindings.length || findings.length !== rawFindings.length) {
    errors.push("$.raw_finding_count: must equal findings and raw_findings lengths");
  }
  if (record.root_debt_count !== rootDebts.length) errors.push("$.root_debt_count: must equal root_debts length");
  if (nonnegativeInteger(record.structuredArtifactCount) && nonnegativeInteger(record.artifactCount)
    && record.structuredArtifactCount > record.artifactCount) {
    errors.push("$.structuredArtifactCount: cannot exceed artifactCount");
  }
  const counts = object(record.counts);
  if (!counts || Object.values(counts).some((value) => !nonnegativeInteger(value))) {
    errors.push("$.counts: expected nonnegative integer values");
  } else if (Object.values(counts).map(Number).reduce((sum, value) => sum + value, 0) !== findings.length) {
    errors.push("$.counts: values must sum to findings length");
  }
  let findingsHaveCanonicalShape = true;
  for (const [index, value] of findings.entries()) {
    const row = object(value);
    requireFields(row, ["code", "detail", "path", "related", "subject"], `$.findings[${index}]`, errors);
    if (row && (!nonempty(row.code) || !nonempty(row.detail) || !nonempty(row.path)
      || !stringArray(row.related) || !nonempty(row.subject))) {
      errors.push(`$.findings[${index}]: invalid canonical planning finding`);
      findingsHaveCanonicalShape = false;
    } else if (!row) {
      findingsHaveCanonicalShape = false;
    }
  }
  const rawIds = new Set<string>();
  for (const [index, value] of rawFindings.entries()) {
    const row = object(value);
    requireFields(row, [
      "code", "detail", "detector", "evidence_refs", "id", "path", "related", "snapshot", "subject",
    ], `$.raw_findings[${index}]`, errors);
    if (!row) continue;
    if (!nonempty(row.id) || rawIds.has(row.id)) errors.push(`$.raw_findings[${index}].id: required unique string`);
    else rawIds.add(row.id);
    if (row.detector !== "planning_graph" || !stringArray(row.evidence_refs) || !nonempty(row.snapshot)) {
      errors.push(`$.raw_findings[${index}]: invalid canonical raw planning finding`);
    }
  }
  const assignedRawIds = new Set<string>();
  const rootIds = new Set<string>();
  for (const [index, value] of rootDebts.entries()) {
    const row = object(value);
    requireFields(row, [
      "affected_paths", "affected_projection_field", "causal_evidence", "cause_key", "class",
      "detector_family", "id", "observation_count", "raw_finding_ids", "repair_boundary", "snapshot",
    ], `$.root_debts[${index}]`, errors);
    if (!row) continue;
    if (!nonempty(row.id) || rootIds.has(row.id)) errors.push(`$.root_debts[${index}].id: required unique string`);
    else rootIds.add(row.id);
    if (!stringArray(row.affected_paths) || !nonempty(row.affected_projection_field)
      || !object(row.causal_evidence) || !nonempty(row.cause_key) || !nonempty(row.class)
      || row.detector_family !== "planning_graph" || !stringArray(row.raw_finding_ids)
      || !nonempty(row.repair_boundary) || !nonempty(row.snapshot)
      || row.observation_count !== (row.raw_finding_ids as string[]).length) {
      errors.push(`$.root_debts[${index}]: invalid canonical planning root debt`);
    }
    if (stringArray(row.raw_finding_ids) && row.raw_finding_ids.length === 0) {
      errors.push(`$.root_debts[${index}].raw_finding_ids: root debt must own at least one canonical raw finding`);
    }
    for (const rawId of stringArray(row.raw_finding_ids) ? row.raw_finding_ids : []) {
      if (!rawIds.has(rawId) || assignedRawIds.has(rawId)) {
        errors.push(`$.root_debts[${index}].raw_finding_ids: must partition canonical raw findings`);
      }
      assignedRawIds.add(rawId);
    }
  }
  if (assignedRawIds.size !== rawIds.size) errors.push("$.root_debts: must account for every raw finding exactly once");
  if (findingsHaveCanonicalShape) {
    const snapshots = new Set<string>();
    for (const value of [...rawFindings, ...rootDebts]) {
      const snapshot = object(value)?.snapshot;
      if (nonempty(snapshot)) snapshots.add(snapshot);
    }
    if (findings.length > 0 && snapshots.size !== 1) {
      errors.push("$.raw_findings: canonical planning projection requires exactly one shared snapshot");
    } else {
      const expected = causalPlanningAccounting(
        findings as PlanningFinding[],
        snapshots.values().next().value ?? "unbound",
      );
      if (!isDeepStrictEqual(rawFindings, expected.rawFindings)) {
        errors.push("$.raw_findings: must equal the deterministic causal projection derived from findings and snapshot");
      }
      if (!isDeepStrictEqual(rootDebts, expected.rootDebts)) {
        errors.push("$.root_debts: must equal the deterministic causal projection derived from findings and snapshot");
      }
    }
  }
  const expectedStatus = Number(record.planningRootCount) === 0 && findings.length === 0
    ? "not_applicable"
    : findings.length > 0 ? "fail" : "pass";
  if (record.status !== expectedStatus) errors.push(`$.status: expected ${expectedStatus}`);
  if (record.exitCode !== (expectedStatus === "fail" ? 1 : 0)) errors.push("$.exitCode: disagrees with status");
}

function validateSemanticResult(record: Record<string, unknown>, errors: string[]): void {
  const semanticKinds = new Set([
    "acceptance_effect_liveness",
    "authoritative_projection",
    "behavioral_dimension",
    "bounded_state_lifecycle",
    "composition_root_reachability",
    "construction_boundary",
    "environment_semantics",
    "executable_surface_coverage",
    "execution_identity_coverage",
    "failure_domain_independence",
    "gate_semantic_bite",
    "historical_evidence_portability",
    "identifier_namespace",
    "instruction_polarity",
    "representation_equivalence",
    "supersession_lineage",
  ]);
  const numericFields = [
    "candidate_probe_count", "confirmed_failure_count", "executed_probe_count",
    "pending_probe_count", "resolved_probe_count",
  ] as const;
  requireFields(record, [
    ...numericFields, "candidate_set_sha256", "candidates", "executions", "exitCode", "findings",
    "resolutions", "snapshot", "status", "working_tree_sha256",
  ], "$", errors);
  for (const field of numericFields) if (!nonnegativeInteger(record[field])) errors.push(`$.${field}: expected nonnegative integer`);
  const candidates = Array.isArray(record.candidates) ? record.candidates : [];
  const executions = Array.isArray(record.executions) ? record.executions : [];
  const findings = Array.isArray(record.findings) ? record.findings : [];
  const resolutions = Array.isArray(record.resolutions) ? record.resolutions : [];
  for (const field of ["candidates", "executions", "findings", "resolutions"] as const) {
    if (!Array.isArray(record[field])) errors.push(`$.${field}: expected array`);
  }
  if (!hexSha256(record.candidate_set_sha256)) errors.push("$.candidate_set_sha256: expected lowercase SHA-256");
  if (!hexSha256(record.working_tree_sha256)) errors.push("$.working_tree_sha256: expected lowercase SHA-256");
  if (!nonempty(record.snapshot)) errors.push("$.snapshot: required");
  if (record.candidate_probe_count !== candidates.length) errors.push("$.candidate_probe_count: must equal candidates length");
  if (record.executed_probe_count !== executions.length) errors.push("$.executed_probe_count: must equal executions length");
  if (record.resolved_probe_count !== resolutions.length) errors.push("$.resolved_probe_count: must equal resolutions length");
  if (record.confirmed_failure_count !== findings.filter((value) => object(value)?.classification === "confirmed_product_defect").length) {
    errors.push("$.confirmed_failure_count: must equal confirmed product-defect findings");
  }
  if (record.pending_probe_count !== findings.filter((value) => object(value)?.classification === "operate_time_pending").length) {
    errors.push("$.pending_probe_count: must equal operate-time-pending findings");
  }
  const candidateIds = new Set<string>();
  for (const [index, value] of candidates.entries()) {
    const row = object(value);
    requireFields(row, ["evidence", "id", "kind", "path", "refs"], `$.candidates[${index}]`, errors);
    if (!row) continue;
    if (!nonempty(row.id) || candidateIds.has(row.id)) errors.push(`$.candidates[${index}].id: required unique string`);
    else candidateIds.add(row.id);
    if (!stringArray(row.evidence) || !semanticKinds.has(String(row.kind))
      || !nonempty(row.path) || !stringArray(row.refs)) errors.push(`$.candidates[${index}]: invalid semantic candidate`);
  }
  if (candidates.every((value) => {
    const row = object(value);
    return row && stringArray(row.evidence) && nonempty(row.id)
      && semanticKinds.has(String(row.kind))
      && nonempty(row.path) && stringArray(row.refs);
  }) && record.candidate_set_sha256 !== semanticCandidateSetSha256(candidates as SemanticProbeCandidate[])) {
    errors.push("$.candidate_set_sha256: must equal the deterministic digest of candidates");
  }
  const executionIds = new Set<string>();
  for (const [index, value] of executions.entries()) {
    const row = object(value);
    requireFields(row, [
      "candidate_id", "command_sha256", "evidence_sha256", "executable", "observed_status",
      "receipt_sha256", "result",
    ], `$.executions[${index}]`, errors);
    if (!row) continue;
    if (!nonempty(row.candidate_id) || executionIds.has(row.candidate_id) || !candidateIds.has(String(row.candidate_id))) {
      errors.push(`$.executions[${index}].candidate_id: must name one unique discovered candidate`);
    } else executionIds.add(row.candidate_id);
    if (!hexSha256(row.command_sha256) || !hexSha256(row.evidence_sha256) || !nonempty(row.executable)
      || !(row.observed_status === null || Number.isInteger(row.observed_status)) || !hexSha256(row.receipt_sha256)
      || !new Set(["error", "fail", "pass"]).has(String(row.result))) {
      errors.push(`$.executions[${index}]: invalid semantic execution`);
    }
  }
  let manifestBoundaryCount = 0;
  for (const [index, value] of findings.entries()) {
    const row = object(value);
    requireFields(row, ["candidate_id", "classification", "code", "detail", "kind", "refs"], `$.findings[${index}]`, errors);
    if (row && (!nonempty(row.candidate_id)
      || !new Set(["confirmed_product_defect", "operate_time_pending", "verification_debt"]).has(String(row.classification))
      || !nonempty(row.code) || !nonempty(row.detail)
      || !semanticKinds.has(String(row.kind))
      || !stringArray(row.refs))) errors.push(`$.findings[${index}]: invalid semantic finding`);
    const typedManifestBoundary = row?.candidate_id === "manifest"
      && row.code === "semantic_probe_manifest_invalid"
      && row.classification === "verification_debt"
      && row.kind === "construction_boundary";
    if (typedManifestBoundary) {
      manifestBoundaryCount += 1;
      if (!stringArray(row?.refs) || row.refs.length === 0) {
        errors.push(`$.findings[${index}].refs: manifest boundary requires a manifest evidence reference`);
      }
    }
    if (row && nonempty(row.candidate_id) && !candidateIds.has(row.candidate_id) && !typedManifestBoundary) {
      errors.push(`$.findings[${index}].candidate_id: must name one discovered candidate`);
    }
  }
  if (manifestBoundaryCount > 0 && !hexSha256(record.manifest_sha256)) {
    errors.push("$.manifest_sha256: manifest boundary requires the observed manifest digest");
  }
  const resolutionIds = new Set<string>();
  for (const [index, value] of resolutions.entries()) {
    const row = object(value);
    requireFields(row, ["candidate_id", "disposition", "evidence_refs", "rationale"], `$.resolutions[${index}]`, errors);
    if (!row) continue;
    if (!nonempty(row.candidate_id) || resolutionIds.has(row.candidate_id) || !candidateIds.has(String(row.candidate_id))) {
      errors.push(`$.resolutions[${index}].candidate_id: must name one unique discovered candidate`);
    } else resolutionIds.add(row.candidate_id);
    const refs = Array.isArray(row.evidence_refs) ? row.evidence_refs : [];
    const disposition = String(row.disposition);
    if (!new Set(["attested_satisfied", "deterministically_satisfied", "not_applicable"]).has(disposition)
      || !Array.isArray(row.evidence_refs) || refs.some((ref) => {
      const item = object(ref);
      return !item || !nonempty(item.path) || !hexSha256(item.sha256);
    }) || ((disposition === "attested_satisfied" || disposition === "not_applicable") && refs.length === 0)
      || !nonempty(row.rationale)) errors.push(`$.resolutions[${index}]: invalid semantic resolution`);
  }
  const expectedStatus = candidates.length === 0 && findings.length === 0
    ? "not_applicable"
    : findings.length > 0 ? "fail" : "pass";
  if (record.status !== expectedStatus) errors.push(`$.status: expected ${expectedStatus}`);
  const acceptedExitCodes = expectedStatus === "fail" ? new Set([1, 2]) : new Set([0]);
  if (!acceptedExitCodes.has(Number(record.exitCode))) errors.push("$.exitCode: disagrees with status");
}

function validatePublicSafetyResult(record: Record<string, unknown>, errors: string[]): void {
  requireFields(record, [
    "exitCode", "findings", "scope", "status", "tracked_path_count", "tracked_paths_sha256", "unassessed",
  ], "$", errors);
  const findings = Array.isArray(record.findings) ? record.findings : [];
  const unassessed = Array.isArray(record.unassessed) ? record.unassessed : [];
  if (!Array.isArray(record.findings)) errors.push("$.findings: expected array");
  if (!Array.isArray(record.unassessed)) errors.push("$.unassessed: expected array");
  if (record.scope !== "tracked_shippable") errors.push("$.scope: expected tracked_shippable");
  if (!nonnegativeInteger(record.tracked_path_count)) errors.push("$.tracked_path_count: expected nonnegative integer");
  if (!hexSha256(record.tracked_paths_sha256)) errors.push("$.tracked_paths_sha256: expected lowercase SHA-256");
  if (record.input_sha256 !== undefined && !hexSha256(record.input_sha256)) errors.push("$.input_sha256: expected lowercase SHA-256");
  for (const [index, value] of findings.entries()) {
    const row = object(value);
    requireFields(row, ["fingerprint", "line", "path", "rule"], `$.findings[${index}]`, errors);
    if (!row || !hexSha256(row.fingerprint) || !Number.isInteger(row.line) || Number(row.line) < 1
      || !nonempty(row.path) || !nonempty(row.rule)
      || row.fingerprint !== digest(`public_safety\0${row.rule}\0${row.path}\0${row.line}`)) {
      errors.push(`$.findings[${index}]: invalid canonical public-safety finding`);
    }
  }
  for (const [index, value] of unassessed.entries()) {
    const row = object(value);
    requireFields(row, ["fingerprint", "path", "reason"], `$.unassessed[${index}]`, errors);
    if (!row || !hexSha256(row.fingerprint) || !nonempty(row.path)
      || !new Set(["binary_content", "invalid_utf8", "missing_or_unreadable", "unsupported_tracked_entry"]).has(String(row.reason))
      || row.fingerprint !== digest(`public_safety_unassessed\0${row.reason}\0${row.path}`)) {
      errors.push(`$.unassessed[${index}]: invalid canonical unassessed public-safety entry`);
    }
  }
  const expectedStatus = findings.length > 0 || unassessed.length > 0 ? "fail" : "pass";
  if (record.status !== expectedStatus) errors.push(`$.status: expected ${expectedStatus}`);
  if (record.exitCode !== (expectedStatus === "fail" ? 1 : 0)) errors.push("$.exitCode: disagrees with status");
}

/**
 * Validate the whole canonical detector result, including internal accounting.
 * A fingerprint-only fragment is evidence of neither coverage nor execution.
 */
export function detectorResultShapeErrors(detectorId: string, value: unknown): string[] {
  const errors: string[] = [];
  const record = object(value);
  if (!record) return ["$: expected object"];
  if (detectorId === "planning_graph") validatePlanningResult(record, errors);
  else if (detectorId === "semantic_boundary") validateSemanticResult(record, errors);
  else if (detectorId === "public_safety") validatePublicSafetyResult(record, errors);
  else if (detectorId === "github_actions") validateGitHubActionsResult(record, errors);
  else errors.push(`$: unknown detector ${detectorId}`);
  return errors;
}

export function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function detectorRegistrySha256(version: DetectorRegistryVersion = DETECTOR_COVERAGE_SCHEMA_VERSION): string {
  const expected = version === "1"
    ? DETECTOR_REGISTRY_V1_SHA256
    : version === "2"
      ? DETECTOR_REGISTRY_V2_SHA256
      : version === "3"
        ? DETECTOR_REGISTRY_V3_SHA256
        : version === "4"
          ? DETECTOR_REGISTRY_V4_SHA256
          : DETECTOR_REGISTRY_V5_SHA256;
  const actual = digest(JSON.stringify({ version, detectors: detectorRegistry(version) }));
  if (actual !== expected) {
    throw new Error(`detector registry ${version} changed without a schema-version bump`);
  }
  return expected;
}

export function createDetectorRunPolicy(input: {
  readonly trackedShippablePathCount: number;
}): DetectorRunPolicy {
  if (!nonnegativeInteger(input.trackedShippablePathCount)) {
    throw new Error("trackedShippablePathCount must be a nonnegative integer");
  }
  const required = input.trackedShippablePathCount > 0;
  return {
    schema_version: DETECTOR_RUN_POLICY_VERSION,
    public_safety: {
      disposition: required ? "required" : "not_applicable",
      basis: required ? "tracked_shippable_surface" : "empty_tracked_surface",
      scope: "tracked_shippable",
      tracked_path_count: input.trackedShippablePathCount,
    },
  };
}

export function detectorRunPolicySha256(policy: DetectorRunPolicy): string {
  return digest(JSON.stringify(policy));
}

function runPolicy(value: unknown): DetectorRunPolicy | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const policy = value as Record<string, unknown>;
  if (policy.schema_version !== DETECTOR_RUN_POLICY_VERSION
    || !policy.public_safety || typeof policy.public_safety !== "object" || Array.isArray(policy.public_safety)) return undefined;
  const publicSafety = policy.public_safety as Record<string, unknown>;
  if (!new Set(["required", "not_applicable"]).has(String(publicSafety.disposition))
    || !new Set(["tracked_shippable_surface", "empty_tracked_surface"]).has(String(publicSafety.basis))
    || publicSafety.scope !== "tracked_shippable" || !nonnegativeInteger(publicSafety.tracked_path_count)) return undefined;
  if ((publicSafety.disposition === "required") !== (publicSafety.tracked_path_count > 0)
    || (publicSafety.basis === "tracked_shippable_surface") !== (publicSafety.tracked_path_count > 0)) return undefined;
  return policy as unknown as DetectorRunPolicy;
}

export function requiredDetectorIdsForPolicy(
  value: unknown,
  version: DetectorRegistryVersion = DETECTOR_COVERAGE_SCHEMA_VERSION,
): DetectorId[] | undefined {
  const policy = runPolicy(value);
  if (!policy) return undefined;
  return detectorRegistry(version)
    .filter((detector) => detector.id !== "public_safety" || policy.public_safety.disposition === "required")
    .map((detector) => detector.id);
}

export function detectorApplicabilityForPolicy(
  value: unknown,
  version: DetectorRegistryVersion = DETECTOR_COVERAGE_SCHEMA_VERSION,
): DetectorApplicability[] | undefined {
  const policy = runPolicy(value);
  if (!policy) return undefined;
  return detectorRegistry(version).map((detector) => detector.id === "public_safety"
    ? {
      detector_id: detector.id,
      disposition: policy.public_safety.disposition,
      basis: policy.public_safety.basis,
    }
    : { detector_id: detector.id, disposition: "required", basis: "core_closeout" });
}

export function detectorById(
  id: string,
  version: DetectorRegistryVersion = DETECTOR_COVERAGE_SCHEMA_VERSION,
): (typeof CLOSEOUT_DETECTORS)[number] | undefined {
  return detectorRegistry(version).find((detector) => detector.id === id);
}

export function planningFindingFingerprint(id: string): string {
  return digest(`planning_graph\0${id}`);
}

export function semanticFindingFingerprint(candidateId: string, code: string): string {
  return digest(`semantic_boundary\0${candidateId}\0${code}`);
}

function validateGitHubActionsResult(record: Record<string, unknown>, errors: string[]): void {
  requireFields(record, [
    "record_type", "schema_version", "status", "exitCode", "workflow_count",
    "sensitive_workflow_count", "findings",
  ], "$", errors);
  if (record.record_type !== "mister-clean.github-actions-audit") {
    errors.push("$.record_type: expected mister-clean.github-actions-audit");
  }
  if (record.schema_version !== "1.0") errors.push("$.schema_version: expected 1.0");
  if (!nonnegativeInteger(record.workflow_count)) errors.push("$.workflow_count: expected nonnegative integer");
  if (!nonnegativeInteger(record.sensitive_workflow_count)) errors.push("$.sensitive_workflow_count: expected nonnegative integer");
  const findings = Array.isArray(record.findings) ? record.findings : [];
  if (!Array.isArray(record.findings)) errors.push("$.findings: expected array");
  const rules = new Set([
    "health_gate_identity_unbound", "health_gate_nonblocking", "manual_sensitive_ref_unbound", "permissions_implicit",
    "privileged_action_mutable", "release_identity_unbound", "workflow_run_checkout_unbound",
    "workflow_run_source_untrusted", "workflow_run_upstream_identity_unbound", "workflow_run_upstream_mutable",
    "workflow_unparseable",
  ]);
  for (const [index, value] of findings.entries()) {
    const row = object(value);
    requireFields(row, ["fingerprint", "path", "rule", "severity", "detail", "refs"], `$.findings[${index}]`, errors);
    if (!row || !hexSha256(row.fingerprint) || !nonempty(row.path) || !rules.has(String(row.rule))
      || !new Set(["P0", "P1", "P2"]).has(String(row.severity)) || !nonempty(row.detail)
      || !stringArray(row.refs)) {
      errors.push(`$.findings[${index}]: invalid GitHub Actions finding`);
      continue;
    }
    const refs = sortedUnique(row.refs as string[]);
    if (!isDeepStrictEqual(refs, row.refs)) errors.push(`$.findings[${index}].refs: expected sorted unique refs`);
    const expected = digest(`github_actions\0${row.rule}\0${row.path}\0${refs.join("\0")}`);
    if (row.fingerprint !== expected) errors.push(`$.findings[${index}].fingerprint: does not match canonical identity`);
  }
  const expectedStatus = Number(record.workflow_count) === 0
    ? "not_applicable"
    : findings.length > 0 ? "fail" : "pass";
  if (record.status !== expectedStatus) errors.push(`$.status: expected ${expectedStatus}`);
  if (record.exitCode !== (expectedStatus === "fail" ? 1 : 0)) errors.push("$.exitCode: disagrees with status");
}

/**
 * Derive the public, redacted fingerprint set from an emitted detector result.
 * Returning undefined means the result did not have the detector's expected
 * machine-readable shape and must not be trusted as coverage.
 */
export function findingFingerprintsFromAudit(detectorId: string, value: unknown): string[] | undefined {
  if (detectorResultShapeErrors(detectorId, value).length > 0) return undefined;
  const record = value as Record<string, unknown>;
  const rows = detectorId === "planning_graph"
    ? record.raw_findings
    : detectorId === "public_safety"
      ? [...(record.findings as unknown[]), ...(record.unassessed as unknown[])]
      : record.findings;
  if (!Array.isArray(rows)) return undefined;
  const fingerprints: string[] = [];
  for (const finding of rows) {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) return undefined;
    const row = finding as Record<string, unknown>;
    if (detectorId === "planning_graph") {
      if (typeof row.id !== "string" || !row.id) return undefined;
      fingerprints.push(planningFindingFingerprint(row.id));
    } else if (detectorId === "semantic_boundary") {
      if (typeof row.candidate_id !== "string" || !row.candidate_id || typeof row.code !== "string" || !row.code) return undefined;
      fingerprints.push(semanticFindingFingerprint(row.candidate_id, row.code));
    } else if (detectorId === "public_safety") {
      if (typeof row.fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(row.fingerprint)
        || typeof row.path !== "string" || !row.path) return undefined;
      const expected = row.rule !== undefined
        ? typeof row.rule === "string" && row.rule && Number.isInteger(row.line)
          ? digest(`public_safety\0${row.rule}\0${row.path}\0${row.line}`)
          : ""
        : typeof row.reason === "string" && row.reason
          ? digest(`public_safety_unassessed\0${row.reason}\0${row.path}`)
          : "";
      if (row.fingerprint !== expected) return undefined;
      fingerprints.push(row.fingerprint);
    } else if (detectorId === "github_actions") {
      if (typeof row.fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(row.fingerprint)) return undefined;
      fingerprints.push(row.fingerprint);
    } else return undefined;
  }
  return sortedUnique(fingerprints);
}

export function createDetectorCoverage(input: {
  readonly baselineRepositoryObject: RepositoryObject;
  readonly observedAt: string;
  readonly runPolicy: DetectorRunPolicy;
  readonly runtimeAttestation: FileRuntimeAttestationBinding;
  readonly planningAudit: PlanningAuditResult;
  readonly planningRef: DigestRef;
  readonly publicSafetyAudit?: PublicSafetyScanResult;
  readonly publicSafetyRef?: DigestRef;
  readonly githubActionsAudit: GitHubActionsAuditResult;
  readonly githubActionsRef: DigestRef;
  readonly semanticAudit: SemanticAuditResult;
  readonly semanticRef: DigestRef;
  readonly inputRefs?: Partial<Record<DetectorId, readonly DetectorInputRef[]>>;
}): DetectorCoverage {
  const requiredDetectorIds = requiredDetectorIdsForPolicy(input.runPolicy);
  const applicability = detectorApplicabilityForPolicy(input.runPolicy);
  if (!requiredDetectorIds || !applicability) throw new Error("invalid detector run policy");
  const runtimeIdentity = runtimeIdentityRecord(createDetectorRuntimeIdentity(input.runtimeAttestation));
  const runtimeIdentitySha256 = detectorRuntimeIdentitySha256(runtimeIdentity);
  const results: Partial<Record<DetectorId, { readonly audit: unknown; readonly ref: DigestRef; readonly exitCode: number }>> = {
    planning_graph: { audit: input.planningAudit, ref: input.planningRef, exitCode: input.planningAudit.exitCode },
    semantic_boundary: { audit: input.semanticAudit, ref: input.semanticRef, exitCode: input.semanticAudit.exitCode },
    github_actions: { audit: input.githubActionsAudit, ref: input.githubActionsRef, exitCode: input.githubActionsAudit.exitCode },
  };
  if (input.runPolicy.public_safety.disposition === "required") {
    if (!input.publicSafetyAudit || !input.publicSafetyRef) throw new Error("public-safety policy requires an audit result and digest reference");
    results.public_safety = {
      audit: input.publicSafetyAudit,
      ref: input.publicSafetyRef,
      exitCode: input.publicSafetyAudit.exitCode,
    };
  }
  const executions = CLOSEOUT_DETECTORS.filter((spec) => requiredDetectorIds.includes(spec.id)).map((spec) => {
    const result = results[spec.id];
    if (!result) throw new Error(`missing ${spec.id} detector result`);
    const findingFingerprints = findingFingerprintsFromAudit(spec.id, result.audit);
    if (!findingFingerprints) throw new Error(`cannot derive ${spec.id} coverage fingerprints`);
    return {
      detector_id: spec.id,
      phase: "baseline" as const,
      object: input.baselineRepositoryObject.sha256,
      repository_object: input.baselineRepositoryObject,
      scope: spec.scope,
      command: spec.command,
      command_sha256: digest(spec.command),
      detector: spec.detector,
      detector_registry_sha256: digest(spec.detector),
      runtime_identity_sha256: runtimeIdentitySha256,
      input_refs: input.inputRefs?.[spec.id] ?? [],
      result_ref: result.ref,
      result_sha256: result.ref.sha256,
      exit_code: result.exitCode,
      observed_at: input.observedAt,
      finding_fingerprints: findingFingerprints,
    };
  });
  return {
    registry_version: DETECTOR_COVERAGE_SCHEMA_VERSION,
    registry_sha256: detectorRegistrySha256(),
    run_policy: input.runPolicy,
    run_policy_sha256: detectorRunPolicySha256(input.runPolicy),
    runtime_identity: runtimeIdentity,
    runtime_identity_sha256: runtimeIdentitySha256,
    applicability,
    baseline_object: input.baselineRepositoryObject.sha256,
    baseline_repository_object: input.baselineRepositoryObject,
    required_detector_ids: requiredDetectorIds,
    executions,
    finding_fingerprints: sortedUnique(executions.flatMap((execution) => execution.finding_fingerprints)),
  };
}
