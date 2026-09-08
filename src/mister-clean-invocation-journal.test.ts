import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { readMisterCleanInvocationJournal } from "./mister-clean-invocation-journal.js";
import { canonicalJson } from "./canonical-json.js";
import { AppendOnlyLocalMisterCleanInvocationJournal } from "./mister-clean-invocation-journal.js";

describe("canonical Mister Clean invocation journal", () => {
  it("records a direct hygiene invocation before its non-success exit without inventing identity", () => {
    const directory = mkdtempSync(join(tmpdir(), "mc-invocation-journal-"));
    try {
      const stateRoot = join(directory, "state");
      const journal = join(stateRoot, "mister-clean", "invocations.jsonl");
      const result = spawnSync(process.execPath, [join(process.cwd(), "bin", "mister-clean.js"), "detect", "stack", directory], {
        cwd: process.cwd(), encoding: "utf8", env: { ...process.env, MISTER_CLEAN_SOURCE_DEVELOPMENT: "1", XDG_STATE_HOME: stateRoot, MISTER_CLEAN_INVOCATION_JOURNAL_PATH: "" },
      });
      // The rebuilt package bin reaches its normal unattested-capsule failure
      // in this source fixture, after the receipt has already been retained.
      expect(result.status).toBe(2);
      const records = readFileSync(journal, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(records).toHaveLength(2);
      expect(records[0]).toEqual(expect.objectContaining({ record_type: "mister-clean.invocation-receipt", event: "started", command: "detect", identity_provenance: "UNOBSERVED", evaluation_run_event_id: null, argv_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) }));
      expect(records[1]).toEqual(expect.objectContaining({ record_type: "mister-clean.invocation-receipt", event: "finished", status: "FAILED", exit_code: 2, run_event_id: null }));
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("fails closed before a hygiene command when the default journal is corrupt", () => {
    const directory = mkdtempSync(join(tmpdir(), "mc-invocation-journal-corrupt-"));
    try {
      const stateRoot = join(directory, "state");
      const journal = join(stateRoot, "mister-clean", "invocations.jsonl");
      mkdirSync(join(stateRoot, "mister-clean"), { recursive: true });
      writeFileSync(journal, "not-json\n");
      const result = spawnSync(process.execPath, [join(process.cwd(), "bin", "mister-clean.js"), "detect", "stack", directory], {
        cwd: process.cwd(), encoding: "utf8", env: { ...process.env, MISTER_CLEAN_SOURCE_DEVELOPMENT: "1", XDG_STATE_HOME: stateRoot, MISTER_CLEAN_INVOCATION_JOURNAL_PATH: "" },
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("invocation journal is not valid JSONL");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("rejects blank, noncanonical, and incomplete pending receipts before runtime import", () => {
    const directory = mkdtempSync(join(tmpdir(), "mc-invocation-journal-integrity-"));
    try {
      const journal = join(directory, "invocations.jsonl");
      writeFileSync(journal, `${JSON.stringify({ schema_version: "1.0", record_type: "mister-clean.invocation-receipt", event: "started", invocation_id: "mc-invocation:forged", command: "detect", argv_sha256: "0".repeat(64), observed_at: "2026-09-08T00:00:00.000Z", identity_provenance: "UNOBSERVED", evaluation_status: "PENDING_IDENTITY_EVALUATION", evaluation_run_event_id: null })}\n\n`);
      expect(() => readMisterCleanInvocationJournal(journal)).toThrow(/non-canonical receipt|blank receipt/);
      writeFileSync(journal, '{"event":"started"}');
      expect(() => readMisterCleanInvocationJournal(journal)).toThrow(/canonical JSONL newline/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("retains canonical legacy and current receipts as pending without rewriting their original bytes", () => {
    const directory = mkdtempSync(join(tmpdir(), "mc-invocation-journal-legacy-"));
    try {
      const journal = join(directory, "invocations.jsonl");
      const legacy = canonicalJson({ record_type: "mister-clean.invocation-receipt", schema_version: "1.0", event: "started", invocation_id: "mc-invocation:legacy", command: "detect", argv_sha256: "1".repeat(64), observed_at: "2026-09-08T00:00:00.000Z", identity_provenance: "UNOBSERVED", evaluation_run_event_id: null });
      writeFileSync(journal, `${legacy}\n`);
      const current = new AppendOnlyLocalMisterCleanInvocationJournal(journal);
      current.recordStart({ command: "detect", argv: ["current"], occurred_at: "2026-09-08T00:00:01.000Z" });
      const contents = readFileSync(journal, "utf8");
      const imported = readMisterCleanInvocationJournal(journal);
      expect(contents.startsWith(`${legacy}\n`)).toBe(true);
      expect(imported.map((record) => record.invocation_id)).toContain("mc-invocation:legacy");
      expect(imported).toHaveLength(2);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("records attest through the same direct package-bin boundary", () => {
    const directory = mkdtempSync(join(tmpdir(), "mc-invocation-journal-attest-"));
    try {
      const stateRoot = join(directory, "state");
      const journal = join(stateRoot, "mister-clean", "invocations.jsonl");
      const result = spawnSync(process.execPath, [join(process.cwd(), "bin", "mister-clean.js"), "attest", directory, "--json"], {
        cwd: process.cwd(), encoding: "utf8", env: { ...process.env, MISTER_CLEAN_SOURCE_DEVELOPMENT: "1", XDG_STATE_HOME: stateRoot },
      });
      expect(result.status).not.toBe(0);
      const records = readFileSync(journal, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(records[0]).toMatchObject({ event: "started", command: "attest", identity_provenance: "UNOBSERVED" });
      expect(records[1]).toMatchObject({ event: "finished", status: "FAILED" });
      expect(records[1]?.exit_code).toBeTypeOf("number");
      expect(records[1]?.exit_code).not.toBe(0);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("imports a terminal process event without turning it into evaluation or quality credit", () => {
    const directory = mkdtempSync(join(tmpdir(), "mc-invocation-journal-finish-"));
    try {
      const journal = join(directory, "invocations.jsonl");
      const writer = new AppendOnlyLocalMisterCleanInvocationJournal(journal);
      const invocationId = writer.recordStart({ command: "audit", argv: ["planning"], occurred_at: "2026-09-08T00:00:00.000Z" });
      writer.recordEnd({ invocation_id: invocationId, run_event_id: "run-1", status: "SUCCEEDED", exit_code: 0, occurred_at: "2026-09-08T00:00:01.000Z" });
      expect(readMisterCleanInvocationJournal(journal)).toMatchObject([{ invocation_id: invocationId, terminal_status: "SUCCEEDED", terminal_exit_code: 0, terminal_run_event_id: "run-1" }]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("does not require or create a journal for help/version-style input", () => {
    const result = spawnSync(process.execPath, [join(process.cwd(), "bin", "mister-clean.js"), "--help"], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, MISTER_CLEAN_SOURCE_DEVELOPMENT: "1", XDG_STATE_HOME: join(tmpdir(), "unused-mc-state"), MISTER_CLEAN_INVOCATION_JOURNAL_PATH: "" },
    });
    expect(result.status).toBe(2);
    expect(result.stderr).not.toContain("invocation journal");
  });
});
