/**
 * Second pass: a fresh read-only audit joined to an earlier receipt by stable
 * finding fingerprint, classified from Git rather than opinion.
 *
 *   cleared                    earlier finding no longer observed
 *   persisting                 observed both times; the anchored bytes exist at the earlier HEAD
 *   persisting_rewritten       observed both times; the file at the earlier HEAD does not hold them
 *   persisting_unseen  (MISS)  new now, but the bytes were already committed at the earlier HEAD
 *   introduced                 new now, and the earlier HEAD did not hold them
 *   unresolvable_earlier_bytes new now, not at the earlier HEAD, and the earlier subject was dirty
 *   flaky                      alternates across three or more receipts of one identical subject
 *                              that examined the finding's family
 *
 * A pre-7.3 closeout bundle, which carries only legacy fingerprints, still
 * joins: its findings are read with anchor kind `legacy` and matched on
 * `legacy_fingerprint`.
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  detectorRegistrySha256,
  createDetectorRuntimeIdentity,
  detectorRuntimeIdentitySha256,
  findingFingerprintsFromAudit,
} from "./detector-coverage.js";
import {
  RECEIPT_FAMILIES,
  receiptFindingsFromAudit,
  trimmedLineSha256,
  type AnchoredFinding,
  type EarlierBytesProbe,
  type ReceiptFamily,
  type ReceiptFinding,
} from "./finding-anchors.js";
import { auditGitHubActionsRepository } from "./github-actions.js";
import { loadDenylistSync, publicSafetyValueDigestsInText, scanTrackedPublicSafetySync } from "./inspection.js";
import { auditLanguagePolicy } from "./language-policy.js";
import { auditPlanningRepository } from "./planning.js";
import { auditRepositoryBoundaries } from "./repository-boundaries.js";
import { captureRepositoryObject } from "./repository-object.js";
import { repositoryIdentity, runGit, trackedShippablePaths } from "./repository.js";
import { auditSemanticRepository } from "./semantic.js";
import type { FileRuntimeAttestationBinding } from "../runtime-binding.js";
import {
  newReceiptId,
  type LocalRunReceiptStore,
  type ReceiptAgent,
  type ReceiptMode,
  type ReceiptSubject,
  type ReceiptValidation,
  type ReceiptVerdict,
  type RunReceipt,
} from "../run-receipt.js";

export const SECOND_PASS_CLASSES = [
  "cleared", "persisting", "persisting_rewritten", "persisting_unseen", "introduced", "unresolvable_earlier_bytes", "flaky",
] as const;
export type SecondPassClass = (typeof SECOND_PASS_CLASSES)[number];

export interface SecondPassRow {
  readonly fingerprint: string;
  readonly legacy_fingerprint: string;
  readonly family: ReceiptFamily;
  readonly rule: string;
  readonly path: string;
  readonly classification: SecondPassClass;
  /** Which observation the row comes from. */
  readonly observed: "earlier_only" | "both" | "current_only";
  readonly basis: string;
}

export interface EarlierBaseline {
  readonly kind: "receipt" | "legacy_bundle";
  readonly ref: string;
  readonly head_commit: string;
  /** null when the earlier record cannot say (a legacy bundle); treated as dirty. */
  readonly dirty: boolean | null;
  readonly families: readonly ReceiptFamily[];
  readonly findings: readonly ReceiptFinding[];
  readonly subject_sha256: string | null;
}

export interface SecondPassResult {
  readonly record_type: "mister-clean.second-pass";
  readonly schema_version: "1";
  readonly repository_id: string;
  readonly against: { readonly kind: EarlierBaseline["kind"]; readonly ref: string; readonly head_commit: string; readonly dirty: boolean | null };
  readonly current: { readonly receipt_id: string; readonly head_commit: string; readonly dirty: boolean };
  readonly families: readonly ReceiptFamily[];
  readonly rows: readonly SecondPassRow[];
  readonly counts: Readonly<Record<SecondPassClass, number>>;
  readonly miss_count: number;
  readonly exitCode: 0 | 1;
}

export interface EarlierBytesGitPort {
  /** Blob id of `path` at `head`, or undefined when the path is absent there. */
  blobOidAt(head: string, path: string): string | undefined;
  /** Text of `path` at `head`, or undefined when absent. */
  blobTextAt(head: string, path: string): string | undefined;
}

export function gitPortFor(repository: string): EarlierBytesGitPort {
  return {
    blobOidAt(head, path) {
      const result = runGit(repository, ["rev-parse", "--verify", "-q", `${head}:${path}`], [0, 1]);
      return result.status === 0 && result.stdout.length > 0 ? result.stdout : undefined;
    },
    blobTextAt(head, path) {
      const exists = runGit(repository, ["cat-file", "-e", `${head}:${path}`], [0, 1, 128]);
      if (exists.status !== 0) return undefined;
      return runGit(repository, ["cat-file", "-p", `${head}:${path}`]).stdout;
    },
  };
}

/** Does the earlier HEAD hold the anchored bytes of `finding`? undefined = path absent there. */
function earlierHolds(
  git: EarlierBytesGitPort,
  head: string,
  path: string,
  probe: EarlierBytesProbe,
  earlierWholeRepoHashes: ReadonlySet<string>,
): boolean | undefined {
  if (probe.kind === "whole_repo") return earlierWholeRepoHashes.has(probe.content_sha256);
  if (probe.kind === "legacy") return undefined;
  // A path-level finding (its language): the earlier HEAD held it when it tracked the path.
  if (probe.kind === "file") return git.blobOidAt(head, path) === undefined ? undefined : true;
  if (probe.kind === "detail_digest") {
    const oid = git.blobOidAt(head, path);
    if (oid === undefined) return undefined;
    return probe.blob_oid !== null && oid === probe.blob_oid;
  }
  const text = git.blobTextAt(head, path);
  if (text === undefined) return undefined;
  if (probe.kind === "line_content") {
    const present = new Set(text.split(/\r?\n/u).map(trimmedLineSha256));
    return probe.line_sha256s.every((digest) => present.has(digest));
  }
  if (probe.rule.startsWith("custom-denylist-")) return undefined;
  return publicSafetyValueDigestsInText(text).some((match) => match.rule === probe.rule && match.value_sha256 === probe.value_sha256);
}

/** One earlier receipt as the flaky history sees it: which families it examined and what it found. */
export interface FlakyHistoryEntry {
  readonly receipt_id: string;
  readonly subject_sha256: string | null;
  readonly families: readonly ReceiptFamily[];
  readonly findings: readonly { readonly fingerprint: string; readonly family: ReceiptFamily }[];
}

/** Why a fingerprint is flaky: the receipts of its family, on one identical subject, that it alternated across. */
export interface FlakyEvidence {
  readonly family: ReceiptFamily;
  /** Receipt ids in observation order; every one examined `family`. */
  readonly receipt_ids: readonly string[];
}

/**
 * Fingerprints that alternate across three or more receipts of one identical
 * subject (`history` in observation order) that examined the finding's family:
 * the detector, not the repository, changed its mind. A receipt that did not
 * run the family (a single-family AUDIT of another family) could not have seen
 * the finding and contributes no turn. Alternation means the presence sequence
 * turns at least twice (present, absent, present); a single turn is a miss that
 * was later seen, or a finding that stopped being reported, and is not flaky.
 * A SECOND_PASS receipt examined the families it re-audited and counts like an
 * audit receipt of those families.
 */
export function flakyFingerprints(history: readonly FlakyHistoryEntry[]): Map<string, FlakyEvidence> {
  const groups = new Map<string, readonly FlakyHistoryEntry[]>();
  for (const entry of history) {
    if (entry.subject_sha256 === null) continue;
    groups.set(entry.subject_sha256, [...(groups.get(entry.subject_sha256) ?? []), entry]);
  }
  const flaky = new Map<string, FlakyEvidence>();
  for (const receipts of groups.values()) {
    for (const family of RECEIPT_FAMILIES) {
      const runs = receipts.filter((entry) => entry.families.includes(family));
      if (runs.length < 3) continue;
      const observed = runs.map((run) => new Set(run.findings.filter((finding) => finding.family === family).map((finding) => finding.fingerprint)));
      const universe = new Set(observed.flatMap((fingerprints) => [...fingerprints]));
      for (const fingerprint of universe) {
        const presence = observed.map((fingerprints) => fingerprints.has(fingerprint));
        const turns = presence.filter((value, index) => index > 0 && value !== presence[index - 1]).length;
        if (turns >= 2) flaky.set(fingerprint, { family, receipt_ids: runs.map((run) => run.receipt_id) });
      }
    }
  }
  return flaky;
}

export interface ClassifyInput {
  readonly earlier: EarlierBaseline;
  readonly current: readonly AnchoredFinding[];
  readonly git: EarlierBytesGitPort;
  readonly flaky?: ReadonlyMap<string, FlakyEvidence>;
}

/** Pure join and classification; Git is reached only through the port. */
export function classifySecondPass(input: ClassifyInput): SecondPassRow[] {
  const legacyJoin = input.earlier.kind === "legacy_bundle";
  const key = (finding: ReceiptFinding): string => legacyJoin ? finding.legacy_fingerprint : finding.fingerprint;
  const earlierByKey = new Map(input.earlier.findings.map((finding) => [key(finding), finding]));
  const currentByKey = new Map(input.current.map((item) => [key(item.finding), item]));
  const earlierWholeRepo = new Set(input.earlier.findings.filter((finding) => finding.anchor.kind === "whole_repo").map((finding) => finding.anchor.content_sha256));
  const earlierDirty = input.earlier.dirty !== false;
  const flaky = input.flaky ?? new Map<string, FlakyEvidence>();
  const rows: SecondPassRow[] = [];
  const row = (finding: ReceiptFinding, observed: SecondPassRow["observed"], classification: SecondPassClass, basis: string): SecondPassRow => {
    const evidence = flaky.get(finding.fingerprint);
    return {
      fingerprint: finding.fingerprint,
      legacy_fingerprint: finding.legacy_fingerprint,
      family: finding.family,
      rule: finding.rule,
      path: finding.path,
      classification: evidence === undefined ? classification : "flaky",
      observed,
      basis: evidence === undefined
        ? basis
        : `alternates across ${evidence.family} receipts ${evidence.receipt_ids.join(", ")} of one identical subject; underlying: ${classification}`,
    };
  };
  for (const [joinKey, earlier] of earlierByKey) {
    if (!input.earlier.families.includes(earlier.family)) continue;
    const current = currentByKey.get(joinKey);
    if (current === undefined) {
      rows.push(row(earlier, "earlier_only", "cleared", "earlier finding not observed by the second pass"));
      continue;
    }
    if (legacyJoin) {
      rows.push(row(current.finding, "both", "persisting", "legacy fingerprint joined; no anchor to test for a rewrite"));
      continue;
    }
    const holds = earlierHolds(input.git, input.earlier.head_commit, current.finding.path, current.probe, earlierWholeRepo);
    rows.push(holds === true
      ? row(current.finding, "both", "persisting", `anchored bytes found at ${input.earlier.head_commit.slice(0, 12)}:${current.finding.path}`)
      : row(current.finding, "both", "persisting_rewritten", `anchored bytes not found at ${input.earlier.head_commit.slice(0, 12)}:${current.finding.path}`));
  }
  for (const [joinKey, current] of currentByKey) {
    if (earlierByKey.has(joinKey) && input.earlier.families.includes(current.finding.family)) continue;
    if (!input.earlier.families.includes(current.finding.family)) continue;
    const holds = earlierHolds(input.git, input.earlier.head_commit, current.finding.path, current.probe, earlierWholeRepo);
    if (holds === true) {
      rows.push(row(current.finding, "current_only", "persisting_unseen", `MISS: anchored bytes already committed at ${input.earlier.head_commit.slice(0, 12)}:${current.finding.path}`));
    } else if (earlierDirty) {
      rows.push(row(current.finding, "current_only", "unresolvable_earlier_bytes", input.earlier.dirty === null
        ? "earlier record cannot say whether its subject was dirty; not guessing"
        : "earlier subject was dirty; the committed tree cannot prove absence"));
    } else {
      rows.push(row(current.finding, "current_only", "introduced", holds === undefined
        ? `path absent at ${input.earlier.head_commit.slice(0, 12)}`
        : `anchored bytes absent at ${input.earlier.head_commit.slice(0, 12)}:${current.finding.path}`));
    }
  }
  return rows.sort((left, right) => left.family.localeCompare(right.family) || left.path.localeCompare(right.path) || left.fingerprint.localeCompare(right.fingerprint));
}

export interface ReceiptSubjectCapture {
  readonly repository: string;
  readonly subject: ReceiptSubject;
  readonly dirty: boolean;
  readonly repository_id: string;
  readonly path_prefix: string;
}

/** Resolve the worktree root, identity, HEAD, tree, and (unless declined) the RepositoryObject. */
export function captureReceiptSubject(root: string, options: { readonly subject_hash?: boolean } = {}): ReceiptSubjectCapture | undefined {
  if (!existsSync(resolve(root)) || !statSync(resolve(root)).isDirectory()) return undefined;
  const resolved = realpathSync(resolve(root));
  const toplevel = runGit(resolved, ["rev-parse", "--show-toplevel"], [0, 128]);
  if (toplevel.status !== 0 || toplevel.stdout.length === 0) return undefined;
  const repository = realpathSync(resolve(toplevel.stdout));
  const headCommit = runGit(repository, ["rev-parse", "--verify", "HEAD^{commit}"], [0, 128]);
  if (headCommit.status !== 0) return undefined;
  const headTree = runGit(repository, ["rev-parse", "--verify", "HEAD^{tree}"]).stdout;
  const dirty = runGit(repository, ["status", "--porcelain", "--untracked-files=normal"]).stdout.length > 0;
  const relation = relative(repository, resolved).split(sep).join("/");
  return {
    repository,
    subject: {
      repository_object: options.subject_hash === false ? null : captureRepositoryObject(repository),
      head_commit: headCommit.stdout,
      head_tree: headTree,
    },
    dirty,
    repository_id: repositoryIdentity(repository),
    path_prefix: relation,
  };
}

export interface AssembleReceiptInput {
  readonly capture: ReceiptSubjectCapture;
  readonly mode: ReceiptMode;
  readonly invocation_id: string | null;
  readonly runtimeAttestation: FileRuntimeAttestationBinding;
  readonly agent: ReceiptAgent;
  readonly families: readonly ReceiptFamily[];
  readonly findings: readonly ReceiptFinding[];
  readonly verdict: ReceiptVerdict;
  readonly exit_code: number;
  readonly observed_at: string;
  readonly finished_at: string;
  readonly validation?: ReceiptValidation;
}

export function assembleRunReceipt(input: AssembleReceiptInput): RunReceipt {
  return {
    record_type: "mister-clean.run-receipt",
    schema_version: "1",
    receipt_id: newReceiptId(),
    invocation_id: input.invocation_id,
    mode: input.mode,
    repository_id: input.capture.repository_id,
    subject: input.capture.subject,
    dirty: input.capture.dirty,
    detector_registry_sha256: detectorRegistrySha256(),
    runtime_identity_sha256: detectorRuntimeIdentitySha256(createDetectorRuntimeIdentity(input.runtimeAttestation)),
    agent: input.agent,
    families: [...input.families].sort(),
    findings: [...input.findings].sort((left, right) => left.fingerprint.localeCompare(right.fingerprint)),
    verdict: input.verdict,
    exit_code: input.exit_code,
    observed_at: input.observed_at,
    finished_at: input.finished_at,
    ...(input.validation === undefined ? {} : { validation: input.validation }),
  };
}

export interface ReadOnlyAuditOptions {
  readonly denylistPath?: string;
  readonly deadline_ms?: number;
}

/** Run the named families read-only against `root` and return anchored findings. */
export function runReadOnlyFamilies(
  capture: ReceiptSubjectCapture,
  root: string,
  families: readonly ReceiptFamily[],
  options: ReadOnlyAuditOptions = {},
): { readonly anchored: AnchoredFinding[]; readonly results: Partial<Record<ReceiptFamily, unknown>> } {
  const results: Partial<Record<ReceiptFamily, unknown>> = {};
  const anchored: AnchoredFinding[] = [];
  const context = { repository: capture.repository, path_prefix: capture.path_prefix };
  for (const family of families) {
    let result: unknown;
    if (family === "planning_graph") result = auditPlanningRepository(root, options.deadline_ms === undefined ? undefined : { deadline_ms: options.deadline_ms });
    else if (family === "public_safety") result = scanTrackedPublicSafetySync(root, trackedShippablePaths(root), loadDenylistSync(options.denylistPath));
    else if (family === "github_actions") result = auditGitHubActionsRepository(root);
    else if (family === "repository_boundaries") result = auditRepositoryBoundaries(root);
    else if (family === "language_policy") result = auditLanguagePolicy(root);
    else result = auditSemanticRepository(root, { execute: false });
    results[family] = result;
    anchored.push(...receiptFindingsFromAudit(family, result, context));
  }
  return { anchored, results };
}

const LEGACY_DETECTOR_FAMILIES: ReadonlySet<string> = new Set(["planning_graph", "public_safety", "github_actions", "semantic_boundary"]);

/**
 * Read a pre-7.3 closeout bundle (a bundle directory, its closeout-report.json
 * or its regression-delta.json) as an earlier baseline of legacy fingerprints.
 */
export function legacyBaselineFromBundle(reference: string): EarlierBaseline | undefined {
  const path = resolve(reference);
  if (!existsSync(path)) return undefined;
  const directory = statSync(path).isDirectory() ? path : dirname(path);
  const deltaPath = join(directory, "regression-delta.json");
  if (!existsSync(deltaPath)) return undefined;
  const delta = JSON.parse(readFileSync(deltaPath, "utf8")) as Record<string, unknown>;
  const coverage = delta.detector_coverage as Record<string, unknown> | undefined;
  const executions = Array.isArray(coverage?.executions) ? coverage.executions as Record<string, unknown>[] : undefined;
  const baseline = coverage?.baseline_repository_object as Record<string, unknown> | undefined;
  const headCommit = typeof baseline?.head_commit === "string" ? baseline.head_commit : undefined;
  if (!executions || headCommit === undefined) return undefined;
  const families: ReceiptFamily[] = [];
  const findings: ReceiptFinding[] = [];
  for (const execution of executions) {
    const detectorId = String(execution.detector_id);
    if (!LEGACY_DETECTOR_FAMILIES.has(detectorId)) continue;
    const family = detectorId as ReceiptFamily;
    families.push(family);
    // Prefer recomputing from the bundle's own result file; fall back to the recorded list.
    const resultRef = execution.result_ref as Record<string, unknown> | undefined;
    const resultPath = typeof resultRef?.path === "string" ? join(directory, resultRef.path) : undefined;
    let fingerprints: readonly string[] | undefined;
    if (resultPath !== undefined && existsSync(resultPath)) {
      fingerprints = findingFingerprintsFromAudit(detectorId, JSON.parse(readFileSync(resultPath, "utf8")));
    }
    fingerprints ??= Array.isArray(execution.finding_fingerprints) ? execution.finding_fingerprints as string[] : [];
    for (const legacy of fingerprints) {
      findings.push({
        fingerprint: legacy,
        family,
        rule: "legacy",
        path: ".",
        anchor: { kind: "legacy", blob_oid: null, content_sha256: legacy, line_hint: null },
        severity: null,
        legacy_fingerprint: legacy,
      });
    }
  }
  return {
    kind: "legacy_bundle",
    ref: relative(process.cwd(), deltaPath) || deltaPath,
    head_commit: headCommit,
    dirty: null,
    families,
    findings,
    subject_sha256: typeof baseline?.sha256 === "string" ? baseline.sha256 : null,
  };
}

export function baselineFromReceipt(receipt: RunReceipt): EarlierBaseline {
  return {
    kind: "receipt",
    ref: receipt.receipt_id,
    head_commit: receipt.subject.head_commit,
    dirty: receipt.dirty,
    families: receipt.families,
    findings: receipt.findings,
    subject_sha256: receipt.subject.repository_object?.sha256 ?? null,
  };
}

/** Resolve `--against`: a receipt id, a receipt path, a legacy bundle, or the latest receipt for this repository. */
export function resolveEarlierBaseline(store: LocalRunReceiptStore, repositoryId: string, against: string | undefined): EarlierBaseline {
  if (against === undefined) {
    const entries = store.forRepository(repositoryId).filter((entry) => entry.mode !== "SECOND_PASS" && entry.mode !== "VALIDATE");
    const latest = entries.at(-1) ?? store.forRepository(repositoryId).at(-1);
    if (latest === undefined) throw new Error("no earlier receipt for this repository; pass --against <receipt_id|bundle>");
    return baselineFromReceipt(store.read(latest.receipt_id));
  }
  if (!against.startsWith("mc-receipt:")) {
    const legacy = legacyBaselineFromBundle(against);
    if (legacy !== undefined) return legacy;
  }
  const receipt = store.read(against);
  if (receipt.repository_id !== repositoryId) throw new Error("the earlier receipt belongs to a different repository identity");
  return baselineFromReceipt(receipt);
}

export interface SecondPassInput {
  readonly store: LocalRunReceiptStore;
  readonly root: string;
  readonly against?: string;
  readonly runtimeAttestation: FileRuntimeAttestationBinding;
  readonly agent: ReceiptAgent;
  readonly invocation_id: string | null;
  readonly subject_hash?: boolean;
  readonly denylistPath?: string;
  readonly git?: EarlierBytesGitPort;
  readonly now?: () => Date;
}

/** Run the second pass end to end; writes the fresh SECOND_PASS receipt and returns the classification. */
export function runSecondPass(input: SecondPassInput): { readonly result: SecondPassResult; readonly receipt: RunReceipt; readonly receipt_path: string } {
  const clock = input.now ?? (() => new Date());
  const observedAt = clock().toISOString();
  const capture = captureReceiptSubject(input.root, { subject_hash: input.subject_hash ?? true });
  if (capture === undefined) throw new Error("second-pass requires a Git worktree with at least one commit");
  input.store.assertOutsideRepository(capture.repository);
  const earlier = resolveEarlierBaseline(input.store, capture.repository_id, input.against);
  const families = earlier.families.filter((family) => RECEIPT_FAMILIES.includes(family));
  const { anchored } = runReadOnlyFamilies(capture, input.root, families, input.denylistPath === undefined ? {} : { denylistPath: input.denylistPath });
  const receipt = assembleRunReceipt({
    capture,
    mode: "SECOND_PASS",
    invocation_id: input.invocation_id,
    runtimeAttestation: input.runtimeAttestation,
    agent: input.agent,
    families,
    findings: anchored.map((item) => item.finding),
    verdict: "AUDIT_ONLY",
    exit_code: anchored.length > 0 ? 1 : 0,
    observed_at: observedAt,
    finished_at: clock().toISOString(),
  });
  const receiptPath = input.store.write(receipt, capture.repository);
  const history: FlakyHistoryEntry[] = input.store.forRepository(capture.repository_id).map((entry) => {
    const record = input.store.read(entry.receipt_id);
    return {
      receipt_id: record.receipt_id,
      subject_sha256: record.subject.repository_object?.sha256 ?? null,
      families: record.families,
      findings: record.findings.map((finding) => ({ fingerprint: finding.fingerprint, family: finding.family })),
    };
  });
  const rows = classifySecondPass({ earlier, current: anchored, git: input.git ?? gitPortFor(capture.repository), flaky: flakyFingerprints(history) });
  const counts = Object.fromEntries(SECOND_PASS_CLASSES.map((name) => [name, rows.filter((item) => item.classification === name).length])) as Record<SecondPassClass, number>;
  const result: SecondPassResult = {
    record_type: "mister-clean.second-pass",
    schema_version: "1",
    repository_id: capture.repository_id,
    against: { kind: earlier.kind, ref: earlier.ref, head_commit: earlier.head_commit, dirty: earlier.dirty },
    current: { receipt_id: receipt.receipt_id, head_commit: capture.subject.head_commit, dirty: capture.dirty },
    families,
    rows,
    counts,
    miss_count: counts.persisting_unseen,
    exitCode: anchored.length > 0 ? 1 : 0,
  };
  return { result, receipt, receipt_path: receiptPath };
}
