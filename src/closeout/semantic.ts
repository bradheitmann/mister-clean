import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  assertDirectory,
  discoverPlanningRoots,
  git,
  listEntriesRecursively,
} from "./repository.js";

export type SemanticProbeKind = "composition_root_reachability" | "construction_boundary";
export type SemanticFindingCode =
  | "construction_boundary_failure"
  | "mechanism_unwired_at_composition_root"
  | "semantic_probe_execution_error"
  | "semantic_probe_incomplete"
  | "semantic_probe_manifest_invalid"
  | "semantic_probe_operate_time_pending"
  | "semantic_probe_unassigned"
  | "semantic_probe_unexecuted";

export interface SemanticEvidenceRef {
  readonly path: string;
  readonly sha256: string;
}

export interface SemanticProbeCandidate {
  readonly evidence: readonly string[];
  readonly id: string;
  readonly kind: SemanticProbeKind;
  readonly path: string;
  readonly refs: readonly string[];
}

export interface SemanticProbeFinding {
  readonly candidate_id: string;
  readonly classification: "confirmed_product_defect" | "operate_time_pending" | "verification_debt";
  readonly code: SemanticFindingCode;
  readonly detail: string;
  readonly kind: SemanticProbeKind;
  readonly refs: readonly string[];
}

export interface SemanticProbeExecution {
  readonly candidate_id: string;
  readonly command_sha256: string;
  readonly evidence_sha256: string;
  readonly executable: string;
  readonly observed_status: number | null;
  readonly receipt_sha256: string;
  readonly result: "error" | "fail" | "pass";
}

export interface SemanticProbeResolution {
  readonly candidate_id: string;
  readonly disposition: "not_applicable";
  readonly evidence_refs: readonly SemanticEvidenceRef[];
  readonly rationale: string;
}

export interface SemanticAuditResult {
  readonly candidate_probe_count: number;
  readonly candidate_set_sha256: string;
  readonly candidates: readonly SemanticProbeCandidate[];
  readonly confirmed_failure_count: number;
  readonly executed_probe_count: number;
  readonly executions: readonly SemanticProbeExecution[];
  readonly exitCode: 0 | 1 | 2;
  readonly findings: readonly SemanticProbeFinding[];
  readonly pending_probe_count: number;
  readonly manifest_observed_at?: string;
  readonly manifest_sha256?: string;
  readonly resolved_probe_count: number;
  readonly resolutions: readonly SemanticProbeResolution[];
  readonly snapshot: string;
  readonly working_tree_sha256: string;
  readonly status: "fail" | "not_applicable" | "pass";
}

export interface SemanticAuditOptions {
  readonly execute?: boolean;
  readonly manifestPath?: string;
}

interface ProbeDefinition {
  readonly boundary: string;
  readonly candidateId: string;
  readonly command: readonly string[];
  readonly contractRefs: readonly string[];
  readonly disposition: "execute" | "not_applicable" | "operate_time_pending";
  readonly evidenceRequired?: string;
  readonly exercisedCases: readonly string[];
  readonly expectedStatus: number;
  readonly kind: SemanticProbeKind;
  readonly notApplicableEvidence?: readonly SemanticEvidenceRef[];
  readonly notApplicableReason?: string;
  readonly nextAction?: string;
  readonly observedEndpoint: string;
  readonly owner?: string;
  readonly requiredCases: readonly string[];
  readonly timeoutMs: number;
}

interface ParsedManifest {
  readonly definitions: readonly ProbeDefinition[];
  readonly errors: readonly SemanticProbeFinding[];
  readonly observedAt?: string;
  readonly sha256: string;
}

interface ProbeReceipt {
  readonly candidateId: string;
  readonly candidateSetSha256: string;
  readonly exercisedCases: readonly string[];
  readonly failedCases: readonly string[];
  readonly passedCases: readonly string[];
  readonly result: "fail" | "pass";
  readonly subjectCommit: string;
  readonly subjectTreeSha256: string;
}

const TEXT_EXTENSIONS = new Set([".json", ".md", ".mdx", ".txt", ".yaml", ".yml"]);
const CONSTRUCTION_ASSERTION = /\b(choke point|construction[- ]enforced|redact(?:ion|or)?|safe by construction|saniti[sz](?:e|er|ation)|validator)\b/i;
const CRITICAL_BOUNDARY = /\b(auth(?:entication|orization)?|credential|privacy|policy|redact|secret|security|telemetry|token)\b/i;
const COMPOSITION_ROOT = /\b(app factory|bootstrap|composition root|production root|server factory)\b/i;
const ROOT_BEHAVIOR = /\b(consumer|guard|inject|mount|policy|register|sink|state|wire|wired|wiring)\b/i;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function strings(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) return undefined;
  return [...new Set(value.map((item) => String(item).trim()))].sort();
}

function argv(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) return undefined;
  return value.map((item) => String(item).trim());
}

function evidenceRefs(value: unknown): SemanticEvidenceRef[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const refs: SemanticEvidenceRef[] = [];
  for (const raw of value) {
    const ref = object(raw);
    if (!ref || typeof ref.path !== "string" || !ref.path.trim()
      || isAbsolute(ref.path) || ref.path === ".." || ref.path.startsWith("../")
      || typeof ref.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(ref.sha256)) return undefined;
    refs.push({ path: ref.path.trim().replaceAll("\\", "/"), sha256: ref.sha256 });
  }
  return refs.sort((left, right) => left.path.localeCompare(right.path) || left.sha256.localeCompare(right.sha256));
}

function isoTimestamp(value: unknown): boolean {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeClaim(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("und");
}

function candidateId(kind: SemanticProbeKind, path: string, claim: string): string {
  const prefix = kind === "construction_boundary" ? "CONSTRUCTION" : "COMPOSITION";
  return `SEM-${prefix}-${sha256(`${kind}\0${path}\0${normalizeClaim(claim)}`).slice(0, 12).toUpperCase()}`;
}

export function semanticCandidateSetSha256(candidates: readonly SemanticProbeCandidate[]): string {
  return sha256(JSON.stringify(candidates.map((candidate) => ({
    evidence: candidate.evidence.map(normalizeClaim).sort(),
    id: candidate.id,
    kind: candidate.kind,
    path: candidate.path,
  }))));
}

export function semanticWorkingTreeSha256(repository: string, excludedPath?: string): string {
  const root = resolve(repository);
  const excluded = excludedPath ? resolve(excludedPath) : undefined;
  const listed = spawnSync("git", ["-C", root, "ls-files", "-co", "--exclude-standard", "-z"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (listed.error) throw listed.error;
  if (listed.status !== 0) throw new Error(String(listed.stderr || "git ls-files failed"));
  const hash = createHash("sha256");
  const paths = String(listed.stdout).split("\0").filter(Boolean).sort();
  for (const portablePath of paths) {
    const absolute = resolve(root, portablePath);
    if (excluded && absolute === excluded) continue;
    hash.update(`${portablePath.length}:`);
    hash.update(portablePath);
    if (!existsSync(absolute)) {
      hash.update("\0missing\0");
      continue;
    }
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      hash.update("\0symlink\0");
      hash.update(readlinkSync(absolute));
    } else if (stat.isFile()) {
      hash.update("\0file\0");
      hash.update(readFileSync(absolute));
    } else {
      hash.update("\0other\0");
    }
  }
  return hash.digest("hex");
}

function visibleLines(content: string): Array<{ readonly line: number; readonly text: string }> {
  const result: Array<{ line: number; text: string }> = [];
  let fence: { character: string; length: number } | undefined;
  let inComment = false;
  for (const [index, raw] of content.split(/\r?\n/).entries()) {
    let text = raw;
    if (inComment) {
      const end = text.indexOf("-->");
      if (end < 0) continue;
      inComment = false;
      text = text.slice(end + 3);
    }
    while (text.includes("<!--")) {
      const start = text.indexOf("<!--");
      const end = text.indexOf("-->", start + 4);
      if (end < 0) {
        text = text.slice(0, start);
        inComment = true;
        break;
      }
      text = `${text.slice(0, start)}${text.slice(end + 3)}`;
    }
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(text)?.[1];
    if (marker) {
      const character = marker[0] ?? "";
      if (!fence) fence = { character, length: marker.length };
      else if (character === fence.character && marker.length >= fence.length) fence = undefined;
      continue;
    }
    if (!fence && text.trim()) result.push({ line: index + 1, text: text.trim() });
  }
  return result;
}

export function discoverSemanticProbeCandidates(repository: string): SemanticProbeCandidate[] {
  const root = resolve(repository);
  assertDirectory(root);
  const groups = new Map<string, { claim: string; evidence: string[]; kind: SemanticProbeKind; path: string; refs: string[] }>();
  const add = (kind: SemanticProbeKind, path: string, line: number, text: string): void => {
    const claim = normalizeClaim(text);
    const key = `${kind}\0${path}\0${claim}`;
    const group = groups.get(key) ?? { claim, evidence: [], kind, path, refs: [] };
    group.refs.push(`${path}#line-${line}`);
    group.evidence.push(text.slice(0, 240));
    groups.set(key, group);
  };
  for (const rootText of discoverPlanningRoots(root)) {
    const planningRoot = resolve(root, rootText);
    const stat = lstatSync(planningRoot);
    const entries = stat.isFile()
      ? [{ kind: "file" as const, path: planningRoot }]
      : listEntriesRecursively(planningRoot);
    for (const entry of entries) {
      if (entry.kind !== "file" || !TEXT_EXTENSIONS.has(extname(entry.path).toLocaleLowerCase("und"))) continue;
      let content: string;
      try {
        content = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(entry.path));
      } catch {
        continue;
      }
      if (content.includes("\0")) continue;
      const path = relative(root, entry.path).split(sep).join("/");
      for (const item of visibleLines(content)) {
        if (CONSTRUCTION_ASSERTION.test(item.text) && CRITICAL_BOUNDARY.test(item.text)) {
          add("construction_boundary", path, item.line, item.text);
        }
        if (COMPOSITION_ROOT.test(item.text) && (ROOT_BEHAVIOR.test(item.text) || CRITICAL_BOUNDARY.test(item.text))) {
          add("composition_root_reachability", path, item.line, item.text);
        }
      }
    }
  }
  return [...groups.values()].map((group) => ({
    evidence: [...new Set(group.evidence)].sort(),
    id: candidateId(group.kind, group.path, group.claim),
    kind: group.kind,
    path: group.path,
    refs: [...new Set(group.refs)].sort(),
  })).sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind));
}

function invalidFinding(detail: string, refs: readonly string[] = []): SemanticProbeFinding {
  return {
    candidate_id: "manifest",
    classification: "verification_debt",
    code: "semantic_probe_manifest_invalid",
    detail,
    kind: "construction_boundary",
    refs,
  };
}

function parseManifest(
  manifestPath: string,
  manifestRef: string,
  repository: string,
  expectedCommit: string,
  expectedTreeSha256: string,
  expectedCandidateSetSha256: string,
): ParsedManifest {
  let content = "";
  let raw: unknown;
  try {
    content = readFileSync(manifestPath, "utf8");
    raw = JSON.parse(content);
  } catch (error) {
    return {
      definitions: [],
      errors: [invalidFinding(`cannot read semantic probe manifest: ${error instanceof Error ? error.message : String(error)}`, [manifestRef])],
      sha256: sha256(content),
    };
  }
  const manifest = object(raw);
  if (!manifest) return { definitions: [], errors: [invalidFinding("semantic probe manifest root must be an object", [manifestRef])], sha256: sha256(content) };
  const errors: SemanticProbeFinding[] = [];
  if (manifest.record_type !== "mister-clean.semantic-probes") errors.push(invalidFinding("record_type must be mister-clean.semantic-probes", [manifestRef]));
  if (manifest.schema_version !== "1.1") errors.push(invalidFinding("schema_version must be 1.1", [manifestRef]));
  if (manifest.subject_commit !== expectedCommit) errors.push(invalidFinding(`subject_commit must equal current HEAD ${expectedCommit}`, [manifestRef]));
  if (manifest.subject_tree_sha256 !== expectedTreeSha256) errors.push(invalidFinding("subject_tree_sha256 must equal the current non-ignored working-tree snapshot", [manifestRef]));
  if (manifest.candidate_set_sha256 !== expectedCandidateSetSha256) errors.push(invalidFinding("candidate_set_sha256 must equal the complete discovered semantic candidate set", [manifestRef]));
  if (!isoTimestamp(manifest.observed_at)) errors.push(invalidFinding("observed_at must be a timezone-aware ISO timestamp", [manifestRef]));
  if (!Array.isArray(manifest.probes)) {
    errors.push(invalidFinding("probes must be an array", [manifestRef]));
    return { definitions: [], errors, ...(isoTimestamp(manifest.observed_at) ? { observedAt: String(manifest.observed_at) } : {}), sha256: sha256(content) };
  }
  const definitions: ProbeDefinition[] = [];
  const seen = new Set<string>();
  for (const [index, rawProbe] of manifest.probes.entries()) {
    const path = `${manifestRef}#probes[${index}]`;
    const probe = object(rawProbe);
    if (!probe) {
      errors.push(invalidFinding("probe must be an object", [path]));
      continue;
    }
    const candidate = typeof probe.candidate_id === "string" ? probe.candidate_id.trim() : "";
    const kind = probe.kind === "construction_boundary" || probe.kind === "composition_root_reachability"
      ? probe.kind
      : undefined;
    const contractRefs = strings(probe.contract_refs);
    const requiredCases = strings(probe.required_cases);
    const exercisedCases = strings(probe.exercised_cases);
    const disposition = probe.disposition === "operate_time_pending" || probe.disposition === "execute" || probe.disposition === "not_applicable"
      ? probe.disposition
      : undefined;
    const command = argv(probe.command);
    const timeout = probe.timeout_ms;
    const expectedStatus = probe.expected_status;
    const boundary = typeof probe.boundary === "string" ? probe.boundary.trim() : "";
    const endpoint = typeof probe.observed_endpoint === "string" ? probe.observed_endpoint.trim() : "";
    const localErrors: string[] = [];
    if (!candidate) localErrors.push("candidate_id is required");
    else if (seen.has(candidate)) localErrors.push(`duplicate candidate_id ${candidate}`);
    if (!kind) localErrors.push("kind must be construction_boundary or composition_root_reachability");
    if (!contractRefs?.length) localErrors.push("contract_refs must be a nonempty string array");
    if (disposition !== "not_applicable" && !requiredCases?.length) localErrors.push("required_cases must be a nonempty string array");
    if (disposition !== "not_applicable" && !exercisedCases) localErrors.push("exercised_cases must be a string array");
    if (!disposition) localErrors.push("disposition must explicitly be execute, operate_time_pending, or not_applicable");
    if (!boundary) localErrors.push("boundary is required");
    if (!endpoint) localErrors.push("observed_endpoint is required");
    if (disposition === "execute") {
      if (!command?.length) localErrors.push("command must be a nonempty argv array");
      if (!Number.isInteger(timeout) || Number(timeout) < 100 || Number(timeout) > 30_000) localErrors.push("timeout_ms must be an integer from 100 through 30000");
      if (expectedStatus !== 0) localErrors.push("expected_status must be 0; the probe harness must translate correct behavior to success");
    }
    const owner = typeof probe.owner === "string" ? probe.owner.trim() : "";
    const nextAction = typeof probe.required_next_action === "string" ? probe.required_next_action.trim() : "";
    const evidenceRequired = typeof probe.evidence_required === "string" ? probe.evidence_required.trim() : "";
    const notApplicableReason = typeof probe.not_applicable_reason === "string" ? probe.not_applicable_reason.trim() : "";
    const notApplicableEvidence = evidenceRefs(probe.not_applicable_evidence);
    if (disposition === "operate_time_pending" && (!owner || !nextAction || !evidenceRequired)) {
      localErrors.push("operate_time_pending requires owner, required_next_action, and evidence_required");
    }
    if (disposition === "not_applicable" && (!notApplicableReason || !notApplicableEvidence?.length)) {
      localErrors.push("not_applicable requires not_applicable_reason and nonempty portable digest-bound not_applicable_evidence");
    } else if (disposition === "not_applicable" && notApplicableEvidence) {
      for (const ref of notApplicableEvidence) {
        const evidencePath = resolve(repository, ref.path);
        const relation = relative(repository, evidencePath);
        if (relation === ".." || relation.startsWith(`..${sep}`) || !existsSync(evidencePath) || !lstatSync(evidencePath).isFile()) {
          localErrors.push(`not_applicable_evidence path is missing or outside the repository: ${ref.path}`);
          continue;
        }
        if (createHash("sha256").update(readFileSync(evidencePath)).digest("hex") !== ref.sha256) {
          localErrors.push(`not_applicable_evidence digest mismatch: ${ref.path}`);
        }
      }
    }
    if (localErrors.length > 0 || !kind || !contractRefs || !disposition) {
      errors.push(invalidFinding(localErrors.join("; "), [path]));
      continue;
    }
    seen.add(candidate);
    definitions.push({
      boundary,
      candidateId: candidate,
      command: disposition === "execute" ? command ?? [] : [],
      contractRefs,
      disposition,
      ...(evidenceRequired ? { evidenceRequired } : {}),
      exercisedCases: exercisedCases ?? [],
      expectedStatus: disposition === "execute" ? Number(expectedStatus) : 0,
      kind,
      ...(notApplicableEvidence?.length ? { notApplicableEvidence } : {}),
      ...(notApplicableReason ? { notApplicableReason } : {}),
      ...(nextAction ? { nextAction } : {}),
      observedEndpoint: endpoint,
      ...(owner ? { owner } : {}),
      requiredCases: requiredCases ?? [],
      timeoutMs: disposition === "execute" ? Number(timeout) : 0,
    });
  }
  return {
    definitions,
    errors,
    ...(isoTimestamp(manifest.observed_at) ? { observedAt: String(manifest.observed_at) } : {}),
    sha256: sha256(content),
  };
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify([...new Set(left)].sort()) === JSON.stringify([...new Set(right)].sort());
}

function parseProbeReceipt(
  stdout: string,
  definition: ProbeDefinition,
  candidate: SemanticProbeCandidate,
  subjectCommit: string,
  subjectTreeSha256: string,
  candidateSetSha256: string,
): { readonly error?: string; readonly receipt?: ProbeReceipt; readonly receiptSha256: string } {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const receiptRows: Array<{ raw: string; value: Record<string, unknown> }> = [];
  for (const line of lines) {
    try {
      const value = object(JSON.parse(line));
      if (value?.record_type === "mister-clean.semantic-probe-receipt") receiptRows.push({ raw: line, value });
    } catch {
      // Human-readable runner output may surround the one canonical receipt line.
    }
  }
  if (receiptRows.length !== 1) {
    return { error: `probe stdout must contain exactly one single-line mister-clean.semantic-probe-receipt; found ${receiptRows.length}`, receiptSha256: sha256(stdout) };
  }
  const row = receiptRows[0]!;
  const receipt = row.value;
  const exercisedCases = strings(receipt.exercised_cases);
  const passedCases = strings(receipt.passed_cases) ?? [];
  const failedCases = strings(receipt.failed_cases) ?? [];
  const result = receipt.result === "pass" || receipt.result === "fail" ? receipt.result : undefined;
  const errors: string[] = [];
  if (receipt.schema_version !== "1.0") errors.push("schema_version must be 1.0");
  if (receipt.candidate_id !== candidate.id) errors.push("candidate_id does not match the executing candidate");
  if (receipt.subject_commit !== subjectCommit) errors.push("subject_commit does not match current HEAD");
  if (receipt.subject_tree_sha256 !== subjectTreeSha256) errors.push("subject_tree_sha256 does not match the bound working tree");
  if (receipt.candidate_set_sha256 !== candidateSetSha256) errors.push("candidate_set_sha256 does not match the complete discovered set");
  if (!exercisedCases || !sameStringSet(exercisedCases, definition.requiredCases)) errors.push("exercised_cases must exactly equal required_cases");
  if (!sameStringSet([...passedCases, ...failedCases], definition.requiredCases)
    || passedCases.some((item) => failedCases.includes(item))) {
    errors.push("passed_cases and failed_cases must be a disjoint exact partition of required_cases");
  }
  if (!result) errors.push("result must be pass or fail");
  if (result === "pass" && (failedCases.length > 0 || !sameStringSet(passedCases, definition.requiredCases))) {
    errors.push("pass requires every required case in passed_cases and zero failed_cases");
  }
  if (result === "fail" && failedCases.length === 0) errors.push("fail requires at least one failed case");
  if (errors.length > 0 || !result || !exercisedCases) {
    return { error: errors.join("; "), receiptSha256: sha256(row.raw) };
  }
  return {
    receipt: {
      candidateId: candidate.id,
      candidateSetSha256,
      exercisedCases,
      failedCases,
      passedCases,
      result,
      subjectCommit,
      subjectTreeSha256,
    },
    receiptSha256: sha256(row.raw),
  };
}

export function auditSemanticRepository(
  repository: string,
  options: SemanticAuditOptions = {},
): SemanticAuditResult {
  const root = resolve(repository);
  assertDirectory(root);
  const snapshot = git(root, "rev-parse", "HEAD");
  const manifestPath = options.manifestPath ? resolve(root, options.manifestPath) : undefined;
  const manifestRelation = manifestPath ? relative(root, manifestPath) : "";
  const manifestRef = manifestPath
    ? (manifestRelation !== ".." && !manifestRelation.startsWith(`..${sep}`) && !isAbsolute(manifestRelation)
      ? manifestRelation.split(sep).join("/")
      : `external-semantic-manifest/${basename(manifestPath)}`)
    : undefined;
  const workingTreeSha256 = semanticWorkingTreeSha256(root, manifestPath);
  const candidates = discoverSemanticProbeCandidates(root);
  const candidateSetSha256 = semanticCandidateSetSha256(candidates);
  const findings: SemanticProbeFinding[] = [];
  const executions: SemanticProbeExecution[] = [];
  const resolutions: SemanticProbeResolution[] = [];
  let manifestSha256: string | undefined;
  let manifestObservedAt: string | undefined;
  if (!manifestPath || !manifestRef) {
    for (const candidate of candidates) {
      findings.push({
        candidate_id: candidate.id,
        classification: "verification_debt",
        code: "semantic_probe_unassigned",
        detail: "critical contract candidate has no bound construction or composition-root probe",
        kind: candidate.kind,
        refs: candidate.refs,
      });
    }
  } else {
    const parsed = parseManifest(
      manifestPath,
      manifestRef,
      root,
      snapshot,
      workingTreeSha256,
      candidateSetSha256,
    );
    manifestSha256 = parsed.sha256;
    manifestObservedAt = parsed.observedAt;
    const candidateIds = new Set(candidates.map((candidate) => candidate.id));
    const bindingErrors: string[] = [];
    if (parsed.errors.length > 0) {
      bindingErrors.push(...parsed.errors.map((error) => error.detail));
    } else {
      const definitions = new Map(parsed.definitions.map((definition) => [definition.candidateId, definition]));
      for (const definition of parsed.definitions) {
        if (!candidateIds.has(definition.candidateId)) bindingErrors.push(`probe ${definition.candidateId} does not match the bound candidate set`);
      }
      for (const candidate of candidates) {
        const definition = definitions.get(candidate.id);
        if (!definition) bindingErrors.push(`candidate ${candidate.id} is absent from the manifest`);
        else if (definition.kind !== candidate.kind || !candidate.refs.every((ref) => definition.contractRefs.includes(ref))) {
          bindingErrors.push(`candidate ${candidate.id} has incomplete kind or contract_refs coverage`);
        }
      }
    }
    if (bindingErrors.length > 0) {
      findings.push(invalidFinding(
        `semantic probe manifest requires one repair: ${[...new Set(bindingErrors)].sort().join(" | ")}`,
        [manifestRef],
      ));
    } else {
      const byCandidate = new Map(parsed.definitions.map((definition) => [definition.candidateId, definition]));
      for (const candidate of candidates) {
        const definition = byCandidate.get(candidate.id)!;
        if (definition.disposition === "not_applicable") {
          resolutions.push({
            candidate_id: candidate.id,
            disposition: "not_applicable",
            evidence_refs: definition.notApplicableEvidence ?? [],
            rationale: definition.notApplicableReason ?? "",
          });
          continue;
        }
        const missingCases = definition.requiredCases.filter((item) => !definition.exercisedCases.includes(item));
        if (missingCases.length > 0) {
          findings.push({
            candidate_id: candidate.id,
            classification: "verification_debt",
            code: "semantic_probe_incomplete",
            detail: `probe omits required cases: ${missingCases.join(", ")}`,
            kind: candidate.kind,
            refs: candidate.refs,
          });
          continue;
        }
        if (definition.disposition === "operate_time_pending") {
          findings.push({
            candidate_id: candidate.id,
            classification: "operate_time_pending",
            code: "semantic_probe_operate_time_pending",
            detail: `${definition.nextAction}; owner=${definition.owner}; evidence=${definition.evidenceRequired}`,
            kind: candidate.kind,
            refs: candidate.refs,
          });
          continue;
        }
        if (!options.execute) {
          findings.push({
            candidate_id: candidate.id,
            classification: "verification_debt",
            code: "semantic_probe_unexecuted",
            detail: "probe is defined but was not executed; rerun with --execute under CLOSE authority",
            kind: candidate.kind,
            refs: candidate.refs,
          });
          continue;
        }
        const [command, ...args] = definition.command;
        if (!command) continue;
        const result = spawnSync(command, args, {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            MISTER_CLEAN_CANDIDATE_ID: candidate.id,
            MISTER_CLEAN_CANDIDATE_SET_SHA256: candidateSetSha256,
            MISTER_CLEAN_REQUIRED_CASES_JSON: JSON.stringify(definition.requiredCases),
            MISTER_CLEAN_SUBJECT_COMMIT: snapshot,
            MISTER_CLEAN_SUBJECT_TREE_SHA256: workingTreeSha256,
          },
          stdio: ["ignore", "pipe", "pipe"],
          timeout: definition.timeoutMs,
        });
        const stdout = String(result.stdout ?? "");
        const evidence = `${stdout}\n${result.stderr ?? ""}`;
        if (result.error || result.status === null) {
          findings.push({
            candidate_id: candidate.id,
            classification: "verification_debt",
            code: "semantic_probe_execution_error",
            detail: result.error?.message ?? `probe ended without an exit status${result.signal ? ` (${result.signal})` : ""}`,
            kind: candidate.kind,
            refs: candidate.refs,
          });
          continue;
        }
        const receiptResult = parseProbeReceipt(
          stdout,
          definition,
          candidate,
          snapshot,
          workingTreeSha256,
          candidateSetSha256,
        );
        const changedTree = semanticWorkingTreeSha256(root, manifestPath) !== workingTreeSha256;
        const statusMismatch = receiptResult.receipt
          ? (receiptResult.receipt.result === "pass" ? result.status !== 0 : result.status === 0)
          : false;
        const executionResult = receiptResult.error || changedTree || statusMismatch
          ? "error"
          : receiptResult.receipt!.result;
        executions.push({
          candidate_id: candidate.id,
          command_sha256: sha256(JSON.stringify(definition.command)),
          evidence_sha256: sha256(evidence),
          executable: basename(command),
          observed_status: result.status,
          receipt_sha256: receiptResult.receiptSha256,
          result: executionResult,
        });
        if (executionResult === "error") {
          const detail = receiptResult.error
            ?? (changedTree ? "probe mutated the bound working tree" : "probe receipt result and process exit status disagree");
          findings.push({
            candidate_id: candidate.id,
            classification: "verification_debt",
            code: "semantic_probe_execution_error",
            detail,
            kind: candidate.kind,
            refs: candidate.refs,
          });
          continue;
        }
        if (executionResult === "fail") {
          findings.push({
            candidate_id: candidate.id,
            classification: "confirmed_product_defect",
            code: candidate.kind === "construction_boundary"
              ? "construction_boundary_failure"
              : "mechanism_unwired_at_composition_root",
            detail: `${definition.boundary} -> ${definition.observedEndpoint} failed cases: ${receiptResult.receipt!.failedCases.join(", ")}`,
            kind: candidate.kind,
            refs: candidate.refs,
          });
        }
      }
    }
  }
  const status = candidates.length === 0 && findings.length === 0
    ? "not_applicable"
    : findings.length > 0
      ? "fail"
      : "pass";
  return {
    candidate_probe_count: candidates.length,
    candidate_set_sha256: candidateSetSha256,
    candidates,
    confirmed_failure_count: findings.filter((finding) => finding.classification === "confirmed_product_defect").length,
    executed_probe_count: executions.length,
    executions,
    exitCode: status === "fail" ? 1 : 0,
    findings,
    ...(manifestObservedAt ? { manifest_observed_at: manifestObservedAt } : {}),
    ...(manifestSha256 ? { manifest_sha256: manifestSha256 } : {}),
    pending_probe_count: findings.filter((finding) => finding.classification === "operate_time_pending").length,
    resolved_probe_count: resolutions.length,
    resolutions,
    snapshot,
    status,
    working_tree_sha256: workingTreeSha256,
  };
}
