/**
 * Content anchors and stable fingerprints for run receipts.
 *
 * A receipt finding is keyed by what the detector saw, never by where it sat:
 * the matched value's digest, the offending line's trimmed text, the finding's
 * normalized detail, or the whole-repository contract hash. A line inserted
 * above the offender therefore leaves the fingerprint unchanged, which is what
 * lets a second pass join its findings to an earlier receipt and decide, from
 * Git, whether a finding was missed or introduced.
 *
 * Every family's legacy fingerprint (the one closeout bundles already carry) is
 * kept beside the new one so pre-7.3 evidence still joins.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  detectorResultShapeErrors,
  planningFindingFingerprint,
  semanticFindingFingerprint,
} from "./detector-coverage.js";
import { GIT_OUTPUT_LIMIT_BYTES } from "./repository.js";
import { gitSpawnSync } from "./git-hardening.js";

export const RECEIPT_FAMILIES = [
  "planning_graph",
  "public_safety",
  "github_actions",
  "repository_boundaries",
  "semantic_boundary",
  "language_policy",
] as const;
export type ReceiptFamily = (typeof RECEIPT_FAMILIES)[number];

/**
 * `file`: the finding is about a tracked path itself (its language), not about
 * bytes inside it; the content digest binds the rule and the extension, so an
 * edit to the file leaves the fingerprint unchanged.
 */
export const ANCHOR_KINDS = ["line_content", "value_digest", "detail_digest", "whole_repo", "legacy", "file"] as const;
export type AnchorKind = (typeof ANCHOR_KINDS)[number];

export interface FindingAnchor {
  readonly kind: AnchorKind;
  /** Git blob id of the working-tree file the finding sits in, when it is a regular file. */
  readonly blob_oid: string | null;
  /** The content digest the fingerprint binds; a digest, never the content. */
  readonly content_sha256: string;
  /** Advisory only; never part of the fingerprint. */
  readonly line_hint: number | null;
}

export interface ReceiptFinding {
  readonly fingerprint: string;
  readonly family: ReceiptFamily;
  readonly rule: string;
  /** Repository-relative POSIX path, or "." for whole-repository findings. */
  readonly path: string;
  readonly anchor: FindingAnchor;
  readonly severity: string | null;
  readonly legacy_fingerprint: string;
}

/**
 * What a second pass needs to look for the same finding in an earlier blob.
 * It lives only in memory: it may name trimmed line digests or a blob id, but
 * it is never written to a receipt.
 */
export type EarlierBytesProbe =
  | { readonly kind: "line_content"; readonly line_sha256s: readonly string[] }
  | { readonly kind: "value_digest"; readonly rule: string; readonly value_sha256: string }
  | { readonly kind: "detail_digest"; readonly blob_oid: string | null }
  | { readonly kind: "whole_repo"; readonly content_sha256: string }
  | { readonly kind: "file" }
  | { readonly kind: "legacy" };

export interface AnchoredFinding {
  readonly finding: ReceiptFinding;
  readonly probe: EarlierBytesProbe;
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** The one fingerprint rule for every family: family, rule, path, anchor kind, content digest. */
export function receiptFingerprint(input: {
  readonly family: ReceiptFamily;
  readonly rule: string;
  readonly path: string;
  readonly anchor_kind: AnchorKind;
  readonly content_sha256: string;
}): string {
  return sha256Text([input.family, input.rule, input.path, input.anchor_kind, input.content_sha256].join("\0"));
}

export function normalizeWhitespace(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

export function trimmedLineSha256(line: string): string {
  return sha256Text(line.trim());
}

function object(value: unknown): Record<string, unknown> | undefined {
  return !!value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label}: expected a nonempty string`);
  return value;
}

function posixPath(prefix: string, path: string): string {
  const normalized = path.split("\\").join("/").replace(/^\.\//u, "");
  if (!prefix || normalized === ".") return prefix ? prefix : normalized;
  return `${prefix}/${normalized}`;
}

/**
 * Git blob ids for the working-tree bytes of `paths`, in one `git hash-object
 * --stdin-paths` child. Paths that are not regular files get no entry.
 */
export function workingTreeBlobOids(repository: string, paths: readonly string[]): ReadonlyMap<string, string> {
  const regular = [...new Set(paths)].filter((path) => {
    const absolute = join(repository, path);
    try { return existsSync(absolute) && statSync(absolute).isFile(); } catch { return false; }
  }).sort();
  const oids = new Map<string, string>();
  if (regular.length === 0) return oids;
  const result = gitSpawnSync(repository, ["hash-object", "--stdin-paths"], {
    encoding: "utf8",
    input: `${regular.join("\n")}\n`,
    maxBuffer: GIT_OUTPUT_LIMIT_BYTES,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) throw new Error(result.stderr.trim() || "git hash-object --stdin-paths failed");
  const lines = result.stdout.trim().split("\n");
  if (lines.length !== regular.length) throw new Error("git hash-object returned an unexpected number of object ids");
  regular.forEach((path, index) => { oids.set(path, lines[index] ?? ""); });
  return oids;
}

export interface AnchorContext {
  /** Git worktree root the receipt is relative to. */
  readonly repository: string;
  /** Repository-relative prefix when the audit root was a subdirectory; "" otherwise. */
  readonly path_prefix?: string;
  /** Injectable for tests; the Git batch by default. */
  readonly blobOids?: (paths: readonly string[]) => ReadonlyMap<string, string>;
}

function githubActionsRefText(repository: string, ref: string): { readonly text: string; readonly line: number | null } {
  const marker = ref.lastIndexOf("#line-");
  const path = marker < 0 ? ref : ref.slice(0, marker);
  const line = marker < 0 ? null : Number(ref.slice(marker + "#line-".length));
  if (line === null || !Number.isInteger(line) || line < 1) return { text: "", line: null };
  let text: string;
  try { text = readFileSync(join(repository, path), "utf8"); } catch { return { text: "", line }; }
  const row = text.split(/\r?\n/u)[line - 1];
  return { text: row === undefined ? "" : row.trim(), line };
}

/**
 * Derive receipt findings from one emitted detector result. The same function
 * serves AUDIT (the in-process result) and CLOSE (the result the bundle wrote),
 * so the two entry points cannot disagree on a fingerprint.
 */
export function receiptFindingsFromAudit(
  family: ReceiptFamily,
  audit: unknown,
  context: AnchorContext,
): AnchoredFinding[] {
  const record = object(audit);
  if (!record) throw new Error(`${family}: audit result must be an object`);
  if (family === "repository_boundaries") {
    if (record.record_type !== "mister-clean.repository-boundary-audit" || !Array.isArray(record.findings)) {
      throw new Error("repository_boundaries: audit result is not canonical");
    }
  } else if (family === "public_safety") {
    // Both the tracked (closeout) and the walked (audit) scans emit the same
    // finding rows; only the tracked form carries the scope-binding fields.
    if (!Array.isArray(record.findings) || !Array.isArray(record.unassessed)) {
      throw new Error("public_safety: audit result is not canonical");
    }
  } else if (family === "language_policy") {
    if (record.record_type !== "mister-clean.language-policy-audit" || !Array.isArray(record.findings)) {
      throw new Error("language_policy: audit result is not canonical");
    }
  } else {
    const errors = detectorResultShapeErrors(family, audit);
    if (errors.length > 0) throw new Error(`${family}: audit result is not canonical: ${errors[0]}`);
  }
  const prefix = (context.path_prefix ?? "").replace(/\/+$/u, "");
  const rows: { readonly row: Record<string, unknown>; readonly path: string }[] = [];
  const pathsToHash = new Set<string>();
  const semanticCandidatePaths = new Map<string, string>();
  if (family === "semantic_boundary") {
    for (const candidate of (record.candidates as unknown[])) {
      const row = object(candidate);
      if (row && typeof row.id === "string" && typeof row.path === "string") semanticCandidatePaths.set(row.id, row.path);
    }
  }
  const sourceRows = family === "planning_graph"
    ? record.raw_findings
    : family === "public_safety"
      ? [...(record.findings as unknown[]), ...(record.unassessed as unknown[])]
      : record.findings;
  for (const value of sourceRows as unknown[]) {
    const row = object(value);
    if (!row) throw new Error(`${family}: finding must be an object`);
    const rawPath = family === "semantic_boundary"
      ? (semanticCandidatePaths.get(asString(row.candidate_id, `${family}.candidate_id`)) ?? ".")
      : asString(row.path, `${family}.path`);
    const path = posixPath(prefix, rawPath);
    rows.push({ row, path });
    pathsToHash.add(path);
  }
  const oids = (context.blobOids ?? ((paths) => workingTreeBlobOids(context.repository, paths)))([...pathsToHash]);
  const anchored: AnchoredFinding[] = [];
  const seen = new Set<string>();
  for (const { row, path } of rows) {
    const blobOid = oids.get(path) ?? null;
    let rule: string;
    let kind: AnchorKind;
    let content: string;
    let lineHint: number | null = null;
    let severity: string | null = null;
    let legacy: string;
    let probe: EarlierBytesProbe;
    if (family === "public_safety") {
      legacy = asString(row.fingerprint, "public_safety.fingerprint");
      if (typeof row.rule === "string") {
        rule = row.rule;
        kind = "value_digest";
        content = asString(row.value_sha256, "public_safety.value_sha256");
        if (!/^[0-9a-f]{64}$/u.test(content)) throw new Error("public_safety.value_sha256: expected lowercase SHA-256");
        lineHint = typeof row.line === "number" ? row.line : null;
        probe = { kind, rule, value_sha256: content };
      } else {
        rule = `unassessed:${asString(row.reason, "public_safety.reason")}`;
        kind = "detail_digest";
        content = sha256Text(`unassessed\0${row.reason as string}`);
        probe = { kind, blob_oid: blobOid };
      }
    } else if (family === "github_actions") {
      rule = asString(row.rule, "github_actions.rule");
      severity = typeof row.severity === "string" ? row.severity : null;
      legacy = asString(row.fingerprint, "github_actions.fingerprint");
      kind = "line_content";
      // Refs are relative to the audited root, which may be a subdirectory of the worktree.
      const auditRoot = prefix ? join(context.repository, prefix) : context.repository;
      const refs = [...new Set(row.refs as string[])].sort().map((ref) => githubActionsRefText(auditRoot, ref));
      const texts = refs.map((item) => item.text);
      const lineDigests = texts.map(trimmedLineSha256);
      content = sha256Text(texts.join("\n"));
      lineHint = refs.find((item) => item.line !== null)?.line ?? null;
      probe = { kind, line_sha256s: lineDigests };
    } else if (family === "planning_graph") {
      rule = asString(row.code, "planning_graph.code");
      legacy = planningFindingFingerprint(asString(row.id, "planning_graph.id"));
      kind = "detail_digest";
      content = sha256Text([rule, asString(row.subject, "planning_graph.subject"), normalizeWhitespace(asString(row.detail, "planning_graph.detail"))].join("\0"));
      probe = { kind, blob_oid: blobOid };
    } else if (family === "repository_boundaries") {
      rule = asString(row.rule, "repository_boundaries.rule");
      legacy = asString(row.fingerprint, "repository_boundaries.fingerprint");
      kind = "detail_digest";
      content = sha256Text(asString(row.detail, "repository_boundaries.detail"));
      probe = { kind, blob_oid: blobOid };
    } else if (family === "language_policy") {
      rule = asString(row.rule, "language_policy.rule");
      legacy = asString(row.fingerprint, "language_policy.fingerprint");
      kind = "file";
      content = sha256Text(`${rule}\0${asString(row.extension, "language_policy.extension")}`);
      probe = { kind };
    } else {
      rule = asString(row.code, "semantic_boundary.code");
      legacy = semanticFindingFingerprint(asString(row.candidate_id, "semantic_boundary.candidate_id"), rule);
      kind = "whole_repo";
      content = asString(record.candidate_set_sha256, "semantic_boundary.candidate_set_sha256");
      probe = { kind, content_sha256: content };
    }
    const fingerprint = receiptFingerprint({ family, rule, path, anchor_kind: kind, content_sha256: content });
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    anchored.push({
      finding: {
        fingerprint,
        family,
        rule,
        path,
        anchor: { kind, blob_oid: blobOid, content_sha256: content, line_hint: lineHint },
        severity,
        legacy_fingerprint: legacy,
      },
      probe,
    });
  }
  return anchored.sort((left, right) => left.finding.fingerprint.localeCompare(right.finding.fingerprint));
}
