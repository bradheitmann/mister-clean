import { createHash } from "node:crypto";
import { constants, closeSync, createReadStream, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";

import type { OpenControlPlaneDatabase } from "../persistence/sqlite.js";
import { canonicalJson, sha256Bytes } from "../../canonical-json.js";

const OBSERVATION_KEYS = [
  "schema_version", "observation_id", "campaign_id", "project", "slice", "activity",
  "event_kind", "tool_name", "timestamp", "session_id", "model_id", "reasoning",
  "requested_model_id", "requested_reasoning", "candidate_revision", "integrated_revision",
  "metrics", "source",
] as const;
const SOURCE_KEYS = ["path", "line", "record_sha256"] as const;
const SHA256 = /^[0-9a-f]{64}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const MAX_JOURNAL_BYTES = 16 * 1024 * 1024;

export interface CampaignExecutionObservation {
  readonly schema_version: "1.0";
  readonly observation_id: string;
  readonly campaign_id: string;
  readonly project: string;
  readonly slice: string | null;
  readonly activity: string;
  readonly event_kind: string;
  readonly tool_name: string | null;
  readonly timestamp: string;
  readonly session_id: string | null;
  readonly model_id: string | null;
  readonly reasoning: string | null;
  readonly requested_model_id: string | null;
  readonly requested_reasoning: string | null;
  readonly candidate_revision: string | null;
  readonly integrated_revision: string | null;
  readonly metrics: Readonly<Record<string, number>>;
  readonly source: Readonly<{ path: string; line: number | null; record_sha256: string }>;
}

function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const found = Object.keys(value);
  if (found.length !== keys.length || found.some((key) => !keys.includes(key))) {
    throw new Error(`${label} must contain exactly ${keys.join(", ")}`);
  }
  return value as Record<string, unknown>;
}

function boundedText(value: unknown, label: string, maximum = 1024): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(`${label} must be bounded nonempty text without controls`);
  }
  return value;
}

function nullableText(value: unknown, label: string): string | null {
  return value === null ? null : boundedText(value, label);
}

function parseObservation(value: unknown): CampaignExecutionObservation {
  const item = record(value, OBSERVATION_KEYS, "campaign observation");
  if (item.schema_version !== "1.0") throw new Error("unsupported campaign observation schema_version");
  const source = record(item.source, SOURCE_KEYS, "campaign observation source");
  const sourcePath = boundedText(source.path, "source.path", 4096);
  if (!isAbsolute(sourcePath)) throw new Error("source.path must be absolute");
  if (source.line !== null && (!Number.isSafeInteger(source.line) || (source.line as number) < 1)) {
    throw new Error("source.line must be a positive integer or null");
  }
  if (typeof source.record_sha256 !== "string" || !SHA256.test(source.record_sha256)) {
    throw new Error("source.record_sha256 must be lowercase SHA-256");
  }
  const metrics = item.metrics;
  if (typeof metrics !== "object" || metrics === null || Array.isArray(metrics)) throw new Error("metrics must be an object");
  for (const [key, metric] of Object.entries(metrics)) {
    if (!/^[a-z][a-z0-9_]*$/u.test(key) || !Number.isSafeInteger(metric) || (metric as number) < 0) {
      throw new Error("metrics must contain only snake_case nonnegative safe integers");
    }
  }
  const timestamp = boundedText(item.timestamp, "timestamp", 32);
  if (!ISO_TIMESTAMP.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) throw new Error("timestamp must be ISO UTC");
  const { observation_id: suppliedId, ...identity } = item;
  const expectedId = `obs:${sha256Bytes(canonicalJson(identity))}`;
  if (suppliedId !== expectedId) throw new Error("campaign observation_id does not match canonical record digest");
  return {
    schema_version: "1.0",
    observation_id: expectedId,
    campaign_id: boundedText(item.campaign_id, "campaign_id"),
    project: boundedText(item.project, "project"),
    slice: nullableText(item.slice, "slice"),
    activity: boundedText(item.activity, "activity"),
    event_kind: boundedText(item.event_kind, "event_kind"),
    tool_name: nullableText(item.tool_name, "tool_name"),
    timestamp,
    session_id: nullableText(item.session_id, "session_id"),
    model_id: nullableText(item.model_id, "model_id"),
    reasoning: nullableText(item.reasoning, "reasoning"),
    requested_model_id: nullableText(item.requested_model_id, "requested_model_id"),
    requested_reasoning: nullableText(item.requested_reasoning, "requested_reasoning"),
    candidate_revision: nullableText(item.candidate_revision, "candidate_revision"),
    integrated_revision: nullableText(item.integrated_revision, "integrated_revision"),
    metrics: metrics as Record<string, number>,
    source: { path: sourcePath, line: source.line as number | null, record_sha256: source.record_sha256 },
  };
}

function readPrivateJournal(path: string): string | null {
  let metadata;
  try { metadata = lstatSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1
    || metadata.uid !== process.getuid?.() || (metadata.mode & 0o077) !== 0
    || metadata.size > MAX_JOURNAL_BYTES) {
    throw new Error("campaign observation journal must be an owned, private, bounded regular file");
  }
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || opened.uid !== metadata.uid
      || opened.dev !== metadata.dev || opened.ino !== metadata.ino || opened.size > MAX_JOURNAL_BYTES) {
      throw new Error("campaign observation journal changed during verification");
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(descriptor));
  } finally { closeSync(descriptor); }
}

export interface CampaignObservationImportReceipt {
  readonly imported: number;
  readonly replayed: number;
}

async function verifySourceDigests(rows: readonly CampaignExecutionObservation[]): Promise<void> {
  const byPath = new Map<string, CampaignExecutionObservation[]>();
  for (const row of rows) {
    const group = byPath.get(row.source.path) ?? [];
    group.push(row);
    byPath.set(row.source.path, group);
  }
  for (const [path, observations] of byPath) {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1
      || metadata.uid !== process.getuid?.() || (metadata.mode & 0o022) !== 0) {
      throw new Error(`campaign observation source must be an owned regular file not writable by others: ${path}`);
    }
    const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const opened = fstatSync(descriptor);
      if (!opened.isFile() || opened.nlink !== 1 || opened.uid !== metadata.uid
        || opened.dev !== metadata.dev || opened.ino !== metadata.ino || (opened.mode & 0o022) !== 0) {
        throw new Error(`campaign observation source changed during verification: ${path}`);
      }
      const requestedLines = new Map<number, Set<string>>();
      const wholeDigests = new Set<string>();
      for (const observation of observations) {
        if (observation.source.line === null) wholeDigests.add(observation.source.record_sha256);
        else {
          const expected = requestedLines.get(observation.source.line) ?? new Set<string>();
          expected.add(observation.source.record_sha256);
          requestedLines.set(observation.source.line, expected);
        }
      }
      const whole = wholeDigests.size > 0 ? createHash("sha256") : null;
      let line = 1;
      let lineHash = createHash("sha256");
      let lineHasBytes = false;
      const matched = new Set<number>();
      const finishLine = () => {
        const expected = requestedLines.get(line);
        if (expected !== undefined) {
          const actual = lineHash.digest("hex");
          if (expected.size !== 1 || !expected.has(actual)) throw new Error(`campaign observation source digest mismatch: ${path}:${line}`);
          matched.add(line);
        }
        line += 1;
        lineHash = createHash("sha256");
        lineHasBytes = false;
      };
      if (opened.size > 0) {
        for await (const chunk of createReadStream(path, { fd: descriptor, autoClose: false, end: opened.size - 1 })) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          whole?.update(bytes);
          let start = 0;
          for (let index = 0; index < bytes.length; index += 1) {
            if (bytes[index] !== 10) continue;
            if (index > start) { lineHash.update(bytes.subarray(start, index)); lineHasBytes = true; }
            finishLine();
            start = index + 1;
          }
          if (start < bytes.length) { lineHash.update(bytes.subarray(start)); lineHasBytes = true; }
        }
      }
      if (lineHasBytes) finishLine();
      if (matched.size !== requestedLines.size) throw new Error(`campaign observation source line is missing: ${path}`);
      if (whole !== null) {
        const actual = whole.digest("hex");
        if (wholeDigests.size !== 1 || !wholeDigests.has(actual)) throw new Error(`campaign observation source digest mismatch: ${path}`);
      }
      const final = fstatSync(descriptor);
      if (final.dev !== opened.dev || final.ino !== opened.ino || (final.mode & 0o022) !== 0) {
        throw new Error(`campaign observation source changed during verification: ${path}`);
      }
    } finally { closeSync(descriptor); }
  }
}

/** Trusted local importer; it deliberately has no trial, identity, or
 * qualification writer. A conflicting replay rolls the entire batch back. */
export async function importCampaignExecutionObservations(
  global: OpenControlPlaneDatabase,
  journalPath: string,
  importedAt = new Date().toISOString(),
): Promise<CampaignObservationImportReceipt> {
  if (global.kind !== "global") throw new Error("campaign observations require the global store");
  const content = readPrivateJournal(journalPath);
  if (content === null || content.length === 0) return { imported: 0, replayed: 0 };
  if (!content.endsWith("\n")) throw new Error("campaign observation journal has an incomplete final line");
  const rows = content.slice(0, -1).split("\n").map((line, index) => {
    if (line.length === 0 || Buffer.byteLength(line) > 131_072) throw new Error(`campaign observation line ${index + 1} is empty or too large`);
    try { return parseObservation(JSON.parse(line) as unknown); }
    catch (error) { throw new Error(`campaign observation line ${index + 1}: ${String(error)}`); }
  });
  await verifySourceDigests(rows);
  return global.database.transaction(() => {
    let imported = 0;
    let replayed = 0;
    for (const row of rows) {
      const canonical = canonicalJson(row);
      const prior = global.database.query<{ canonical_record_json: string }>(
        "SELECT canonical_record_json FROM campaign_execution_observations WHERE observation_id = ?",
      ).get(row.observation_id);
      if (prior !== null) {
        if (prior.canonical_record_json !== canonical) throw new Error(`conflicting campaign observation replay: ${row.observation_id}`);
        replayed += 1;
        continue;
      }
      global.database.query(`INSERT INTO campaign_execution_observations (
        observation_id, campaign_id, project, slice, activity, event_kind, tool_name, observed_at,
        session_id, model_id, reasoning, requested_model_id, requested_reasoning,
        candidate_revision, integrated_revision, metrics_json, source_path, source_line,
        source_record_sha256, canonical_record_json, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        row.observation_id, row.campaign_id, row.project, row.slice, row.activity, row.event_kind, row.tool_name,
        row.timestamp, row.session_id, row.model_id, row.reasoning,
        row.requested_model_id, row.requested_reasoning, row.candidate_revision, row.integrated_revision,
        canonicalJson(row.metrics),
        row.source.path, row.source.line, row.source.record_sha256, canonical, importedAt,
      );
      imported += 1;
    }
    return { imported, replayed };
  })();
}
