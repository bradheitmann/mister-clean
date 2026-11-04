/**
 * Proofs for the owner decision of 2026-11-04: the invocation journal and the
 * run-receipt index seal into numbered segments and keep everything. Every
 * store here lives under a fresh temporary directory; nothing touches the real
 * machine-local state root.
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { canonicalJson } from "./canonical-json.js";
import { AppendOnlyLocalMisterCleanInvocationJournal, INVOCATION_JOURNAL_SEGMENT_MAX_BYTES, readMisterCleanInvocationJournal } from "./mister-clean-invocation-journal.js";
import { LocalRunReceiptStore, RECEIPT_INDEX_FILE, RECEIPT_INDEX_SEGMENT_MAX_BYTES, type RunReceipt } from "./run-receipt.js";
import { observeSegmentReads, SealedSegmentTamperedError, type SegmentManifest } from "./sealed-segments.js";

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) {
    // Sealed segments are read-only; make them writable so the temp root can be removed.
    for (const name of existsSync(root) ? readdirSync(root, { recursive: true }) as string[] : []) {
      try { chmodSync(join(root, name), 0o700); } catch { /* already gone */ }
    }
    rmSync(root, { recursive: true, force: true });
  }
});

function scratch(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `mc-rotate-${name}-`));
  roots.push(root);
  // Never the real state root.
  expect(root.startsWith(join(homedir(), ".local", "state"))).toBe(false);
  return root;
}

const sha256 = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
const json = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const SEALED_JOURNAL = /^invocations\.\d{6}\.jsonl$/u;
const SEALED_INDEX = /^receipts\.index\.\d{6}\.jsonl$/u;

function sealedFiles(directory: string, pattern: RegExp): string[] {
  return readdirSync(directory).filter((name) => pattern.test(name)).sort();
}

function start(journal: AppendOnlyLocalMisterCleanInvocationJournal, index: number): string {
  return journal.recordStart({ command: "audit", argv: [`arg-${index}`], occurred_at: new Date(Date.UTC(2026, 10, 4, 0, 0, index)).toISOString() });
}

const HEAD = "a".repeat(40);
function receipt(index: number): RunReceipt {
  return {
    record_type: "mister-clean.run-receipt",
    schema_version: "1",
    receipt_id: `mc-receipt:${randomUUID()}`,
    invocation_id: null,
    mode: "AUDIT",
    repository_id: `local-path-sha256:${String(index % 3).repeat(64)}`,
    subject: {
      repository_object: { record_type: "mister-clean.repository-object", schema_version: "1.0", head_commit: HEAD, surface: "tracked_and_nonignored", entry_count: 1, sha256: "3".repeat(64) },
      head_commit: HEAD,
      head_tree: "4".repeat(40),
    },
    dirty: false,
    detector_registry_sha256: "5".repeat(64),
    runtime_identity_sha256: "6".repeat(64),
    agent: { identity_status: "unobserved", card_ref: null, source: null },
    families: ["public_safety"],
    findings: [],
    verdict: "AUDIT_ONLY",
    exit_code: 0,
    observed_at: new Date(Date.UTC(2026, 10, 4, 0, 0, index)).toISOString(),
    finished_at: new Date(Date.UTC(2026, 10, 4, 0, 0, index + 1)).toISOString(),
  };
}

function receiptStore(name: string, options: ConstructorParameters<typeof LocalRunReceiptStore>[1] = {}) {
  const base = scratch(name);
  const repo = join(base, "repo");
  mkdirSync(repo);
  return { base, repo, root: join(base, "receipts"), store: new LocalRunReceiptStore(join(base, "receipts"), options) };
}

describe("local stores seal into segments and keep everything", { timeout: 60_000 }, () => {
  it("named caps are 8 MiB", () => {
    expect(INVOCATION_JOURNAL_SEGMENT_MAX_BYTES).toBe(8 * 1024 * 1024);
    expect(RECEIPT_INDEX_SEGMENT_MAX_BYTES).toBe(8 * 1024 * 1024);
  });

  it("seals at the cap: journal", () => {
    const directory = scratch("seal-journal");
    const path = join(directory, "invocations.jsonl");
    const cap = 2048;
    const journal = new AppendOnlyLocalMisterCleanInvocationJournal(path, { segmentMaxBytes: cap });
    for (let index = 0; index < 20; index += 1) {
      start(journal, index);
      expect(statSync(path).size).toBeLessThanOrEqual(cap);
    }
    const sealed = sealedFiles(directory, SEALED_JOURNAL);
    expect(sealed.length).toBeGreaterThanOrEqual(2);
    const manifest = json<SegmentManifest>(join(directory, "invocations.segments.json"));
    expect(manifest.segments.map((segment) => segment.file)).toEqual(sealed);
    for (const segment of manifest.segments) {
      const file = join(directory, segment.file);
      expect(statSync(file).mode & 0o222).toBe(0);
      const text = readFileSync(file, "utf8");
      expect(segment.sha256).toBe(sha256(text));
      expect(segment.bytes).toBe(new TextEncoder().encode(text).byteLength);
      expect(segment.bytes).toBeLessThanOrEqual(cap);
      const lines = text.trimEnd().split("\n").map((line) => JSON.parse(line) as { observed_at: string });
      expect(segment.records).toBe(lines.length);
      expect(segment.first).toBe(lines[0]?.observed_at);
      expect(segment.last).toBe(lines.at(-1)?.observed_at);
    }
  });

  it("seals at the cap: receipt index", () => {
    const { root, repo, store } = receiptStore("seal-index", { segmentMaxBytes: 1500 });
    for (let index = 0; index < 12; index += 1) {
      store.write(receipt(index), repo);
      expect(statSync(join(root, RECEIPT_INDEX_FILE)).size).toBeLessThanOrEqual(1500);
    }
    const sealed = sealedFiles(root, SEALED_INDEX);
    expect(sealed.length).toBeGreaterThanOrEqual(2);
    const manifest = json<SegmentManifest>(join(root, "receipts.index.segments.json"));
    expect(manifest.segments.map((segment) => segment.file)).toEqual(sealed);
    for (const segment of manifest.segments) {
      expect(statSync(join(root, segment.file)).mode & 0o222).toBe(0);
      expect(segment.sha256).toBe(sha256(readFileSync(join(root, segment.file))));
      expect(segment.key_index).not.toBeNull();
      expect(segment.groups.length).toBeGreaterThan(0);
    }
  });

  it("keeps every record across many seals", () => {
    const directory = scratch("keep-journal");
    const path = join(directory, "invocations.jsonl");
    const journal = new AppendOnlyLocalMisterCleanInvocationJournal(path, { segmentMaxBytes: 1024 });
    const ids = Array.from({ length: 60 }, (_, index) => start(journal, index));
    const manifest = json<SegmentManifest>(join(directory, "invocations.segments.json"));
    expect(manifest.segments.length).toBeGreaterThanOrEqual(10);
    expect(sealedFiles(directory, SEALED_JOURNAL)).toEqual(manifest.segments.map((segment) => segment.file));
    const read = readMisterCleanInvocationJournal(path);
    expect(read).toHaveLength(ids.length);
    expect(read.map((item) => item.invocation_id).sort()).toEqual([...ids].sort());
    expect(manifest.segments.reduce((total, segment) => total + segment.records, 0) + readFileSync(path, "utf8").trimEnd().split("\n").length).toBe(ids.length);

    const { repo, store } = receiptStore("keep-index", { segmentMaxBytes: 1200 });
    const written = Array.from({ length: 30 }, (_, index) => receipt(index));
    for (const item of written) store.write(item, repo);
    expect(store.index().map((entry) => entry.receipt_id)).toEqual(written.map((item) => item.receipt_id));
    for (const item of written) expect(store.read(item.receipt_id).receipt_id).toBe(item.receipt_id);
  });

  it("lookup by id reads the manifest, the live segment and only the sealed segment holding the id", () => {
    const { root, repo, store } = receiptStore("lookup", { segmentMaxBytes: 1200 });
    const written = Array.from({ length: 15 }, (_, index) => receipt(index));
    for (const item of written) store.write(item, repo);
    const manifest = json<SegmentManifest>(join(root, "receipts.index.segments.json"));
    expect(manifest.segments.length).toBeGreaterThanOrEqual(3);
    const target = written[0]!;
    const reads: string[] = [];
    const stop = observeSegmentReads((path) => reads.push(basename(path)));
    try {
      expect(store.read(target.receipt_id).receipt_id).toBe(target.receipt_id);
    } finally { stop(); }
    expect(reads).toContain("receipts.index.segments.json");
    expect(reads).toContain(RECEIPT_INDEX_FILE);
    expect(reads.filter((name) => SEALED_INDEX.test(name))).toEqual([manifest.segments[0]!.file]);
  });

  it("refuses a sealed segment with one byte changed", () => {
    const directory = scratch("tamper-journal");
    const path = join(directory, "invocations.jsonl");
    const journal = new AppendOnlyLocalMisterCleanInvocationJournal(path, { segmentMaxBytes: 1024 });
    for (let index = 0; index < 10; index += 1) start(journal, index);
    const first = join(directory, sealedFiles(directory, SEALED_JOURNAL)[0]!);
    // One byte changed: one ASCII letter, same length.
    const flip = (file: string, from: string, to: string): void => {
      const text = readFileSync(file, "utf8");
      expect(text.includes(from)).toBe(true);
      chmodSync(file, 0o600);
      writeFileSync(file, text.replace(from, to));
      chmodSync(file, 0o400);
    };
    flip(first, "audit", "Audit");
    expect(() => readMisterCleanInvocationJournal(path)).toThrow(SealedSegmentTamperedError);

    const { root, repo, store } = receiptStore("tamper-index", { segmentMaxBytes: 1200 });
    for (let index = 0; index < 8; index += 1) store.write(receipt(index), repo);
    const sealedIndex = join(root, sealedFiles(root, SEALED_INDEX)[0]!);
    flip(sealedIndex, "AUDIT", "BUDIT");
    let refusal: unknown;
    try { store.index(); } catch (error) { refusal = error; }
    expect(refusal).toBeInstanceOf(SealedSegmentTamperedError);
    expect(refusal).toMatchObject({ code: "sealed_segment_tampered" });
  });

  it("crash between the rename and the manifest write leaves a readable, consistent store", () => {
    const directory = scratch("crash-journal");
    const path = join(directory, "invocations.jsonl");
    class Crash extends Error {}
    const crashing = new AppendOnlyLocalMisterCleanInvocationJournal(path, { segmentMaxBytes: 1024, betweenSealSteps: () => { throw new Crash("stopped between sealing steps"); } });
    const ids: string[] = [];
    let crashed = false;
    for (let index = 0; index < 20 && !crashed; index += 1) {
      try { ids.push(start(crashing, index)); } catch (error) {
        if (!(error instanceof Crash)) throw error;
        crashed = true;
      }
    }
    expect(crashed).toBe(true);
    // Restart: a fresh journal over the same path.
    const restarted = new AppendOnlyLocalMisterCleanInvocationJournal(path, { segmentMaxBytes: 1024 });
    expect(readMisterCleanInvocationJournal(path).map((item) => item.invocation_id).sort()).toEqual([...ids].sort());
    const manifest = json<SegmentManifest>(join(directory, "invocations.segments.json"));
    expect(manifest.segments.map((segment) => segment.file)).toEqual(sealedFiles(directory, SEALED_JOURNAL));
    for (const segment of manifest.segments) expect(segment.sha256).toBe(sha256(readFileSync(join(directory, segment.file))));
    ids.push(start(restarted, 99));
    expect(readMisterCleanInvocationJournal(path)).toHaveLength(ids.length);
  });

  it("existing single-file journal and index read and append unchanged and seal at the cap", () => {
    const directory = scratch("existing-journal");
    const path = join(directory, "invocations.jsonl");
    // Today's format: legacy and current start receipts, a link and a terminal receipt, one file.
    const lines = [
      canonicalJson({ record_type: "mister-clean.invocation-receipt", schema_version: "1.0", event: "started", invocation_id: "mc-invocation:legacy", command: "detect", argv_sha256: "1".repeat(64), observed_at: "2026-09-08T00:00:00.000Z", identity_provenance: "UNOBSERVED", evaluation_run_event_id: null }),
      canonicalJson({ record_type: "mister-clean.invocation-receipt", schema_version: "1.0", event: "started", invocation_id: "mc-invocation:current", command: "audit", argv_sha256: "2".repeat(64), observed_at: "2026-11-03T00:00:00.000Z", identity_provenance: "UNOBSERVED", evaluation_status: "PENDING_IDENTITY_EVALUATION", evaluation_run_event_id: null }),
      canonicalJson({ record_type: "mister-clean.invocation-receipt", schema_version: "1.0", event: "evaluation_run_linked", invocation_id: "mc-invocation:current", run_event_id: "run-1", observed_at: "2026-11-03T00:00:01.000Z" }),
      canonicalJson({ record_type: "mister-clean.invocation-receipt", schema_version: "1.0", event: "finished", invocation_id: "mc-invocation:current", run_event_id: "run-1", status: "SUCCEEDED", exit_code: 0, observed_at: "2026-11-03T00:00:02.000Z" }),
    ];
    const original = `${lines.join("\n")}\n`;
    writeFileSync(path, original, { mode: 0o600 });
    const before = readMisterCleanInvocationJournal(path);
    expect(before.map((item) => item.invocation_id)).toEqual(["mc-invocation:current", "mc-invocation:legacy"]);
    const cap = original.length + 1000;
    const journal = new AppendOnlyLocalMisterCleanInvocationJournal(path, { segmentMaxBytes: cap });
    start(journal, 1);
    expect(readFileSync(path, "utf8").startsWith(original)).toBe(true);
    expect(sealedFiles(directory, SEALED_JOURNAL)).toEqual([]);
    for (let index = 2; index < 8; index += 1) start(journal, index);
    const sealed = sealedFiles(directory, SEALED_JOURNAL);
    expect(sealed.length).toBeGreaterThanOrEqual(1);
    expect(readFileSync(join(directory, sealed[0]!), "utf8").startsWith(original)).toBe(true);
    const after = readMisterCleanInvocationJournal(path);
    expect(after).toHaveLength(9);
    for (const item of before) expect(after).toContainEqual(item);

    // Index written by today's store (no cap reached), then reopened with a small cap.
    const { root, repo, store } = receiptStore("existing-index");
    const old = Array.from({ length: 3 }, (_, index) => receipt(index));
    for (const item of old) store.write(item, repo);
    const originalIndex = readFileSync(join(root, RECEIPT_INDEX_FILE), "utf8");
    expect(existsSync(join(root, "receipts.index.segments.json"))).toBe(false);
    const reopened = new LocalRunReceiptStore(root, { segmentMaxBytes: originalIndex.length + 100 });
    expect(reopened.index().map((entry) => entry.receipt_id)).toEqual(old.map((item) => item.receipt_id));
    const fresh = Array.from({ length: 4 }, (_, index) => receipt(10 + index));
    for (const item of fresh) reopened.write(item, repo);
    const sealedIndex = sealedFiles(root, SEALED_INDEX);
    expect(sealedIndex.length).toBeGreaterThanOrEqual(1);
    expect(readFileSync(join(root, sealedIndex[0]!), "utf8").startsWith(originalIndex)).toBe(true);
    expect(reopened.index().map((entry) => entry.receipt_id)).toEqual([...old, ...fresh].map((item) => item.receipt_id));
    for (const item of old) expect(reopened.read(item.receipt_id).receipt_id).toBe(item.receipt_id);
  });
});
