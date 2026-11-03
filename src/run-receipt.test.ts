import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type CliIO, runCli } from "./cli.js";
import { createFixtureRepository, fixtureCommit, fixtureGit } from "./test-support/fixture-repo.js";
import {
  LocalRunReceiptStore,
  RECEIPT_INDEX_FILE,
  ReceiptPrivacyError,
  ReceiptRootInsideRepositoryError,
  RunReceiptInvalidError,
  agentFromCard,
  receiptRootFromEnvironment,
  runReceiptErrors,
  type RunReceipt,
} from "./run-receipt.js";

const roots: string[] = [];

function scratch(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `mc-receipt-${name}-`));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function capture(): { io: CliIO; stderr: string[]; stdout: string[] } {
  const stderr: string[] = [];
  const stdout: string[] = [];
  return { io: { stderr: (line) => stderr.push(line), stdout: (line) => stdout.push(line) }, stderr, stdout };
}

const HEAD = "1".repeat(40);
const PLANTED = `${"person"}@${"example.org"}`;

function validReceipt(overrides: Partial<RunReceipt> = {}): RunReceipt {
  return {
    record_type: "mister-clean.run-receipt",
    schema_version: "1",
    receipt_id: "mc-receipt:123e4567-e89b-42d3-a456-426614174000",
    invocation_id: null,
    mode: "AUDIT",
    repository_id: `local-path-sha256:${"2".repeat(64)}`,
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
    findings: [{
      fingerprint: "7".repeat(64),
      family: "public_safety",
      rule: "email-address",
      path: "notes.txt",
      anchor: { kind: "value_digest", blob_oid: null, content_sha256: "8".repeat(64), line_hint: 1 },
      severity: null,
      legacy_fingerprint: "9".repeat(64),
    }],
    verdict: "AUDIT_ONLY",
    exit_code: 1,
    observed_at: "2026-11-03T00:00:00.000Z",
    finished_at: "2026-11-03T00:00:01.000Z",
    ...overrides,
  };
}

describe("run receipts", () => {
  it("receipt-root-outside-repo: a root inside the audited repository is refused with a typed error before any write", () => {
    const repo = scratch("inside");
    createFixtureRepository(repo);
    const inside = new LocalRunReceiptStore(join(repo, ".mister-clean", "receipts"));
    expect(() => inside.write(validReceipt(), repo)).toThrow(ReceiptRootInsideRepositoryError);
    try { inside.write(validReceipt(), repo); } catch (error) { expect((error as ReceiptRootInsideRepositoryError).code).toBe("receipt_root_inside_repository"); }
    expect(existsSync(join(repo, ".mister-clean"))).toBe(false);
    // The repository root itself is also inside.
    expect(() => new LocalRunReceiptStore(repo).assertOutsideRepository(repo)).toThrow(ReceiptRootInsideRepositoryError);
    // A sibling root is fine.
    expect(() => new LocalRunReceiptStore(join(scratch("outside"), "receipts")).assertOutsideRepository(repo)).not.toThrow();
  });

  it("receipt-privacy: a receipt carrying a matched public-safety value is refused before any write", () => {
    const repo = scratch("privacy-repo");
    createFixtureRepository(repo);
    const store = new LocalRunReceiptStore(join(scratch("privacy-root"), "receipts"));
    // A repository-relative path that nevertheless carries a matched email value.
    const leaky = validReceipt({ findings: [{ ...validReceipt().findings[0]!, path: `docs/${PLANTED}.md` }] });
    expect(runReceiptErrors(leaky)).toEqual([]);
    expect(() => store.write(leaky, repo)).toThrow(ReceiptPrivacyError);
    try { store.write(leaky, repo); } catch (error) { expect((error as ReceiptPrivacyError).code).toBe("receipt_privacy_violation"); }
    expect(existsSync(store.root)).toBe(false);
    // A matched value in place of a digest is refused too (not a digest at all).
    const rawValue = validReceipt({ findings: [{ ...validReceipt().findings[0]!, anchor: { ...validReceipt().findings[0]!.anchor, content_sha256: PLANTED } }] });
    expect(() => store.write(rawValue, repo)).toThrow(RunReceiptInvalidError);
    // An absolute path is never repository-relative.
    const absolute = validReceipt({ findings: [{ ...validReceipt().findings[0]!, path: "/tmp/notes.txt" }] });
    expect(() => store.write(absolute, repo)).toThrow(RunReceiptInvalidError);
    expect(existsSync(store.root)).toBe(false);
  });

  it("receipt-round-trip: a written receipt reads back equal, is indexed, and a corrupted key set is refused", () => {
    const repo = scratch("roundtrip-repo");
    createFixtureRepository(repo);
    const store = new LocalRunReceiptStore(join(scratch("roundtrip-root"), "receipts"));
    const receipt = validReceipt();
    const path = store.write(receipt, repo);
    expect(store.read(receipt.receipt_id)).toEqual(receipt);
    expect(store.read(path)).toEqual(receipt);
    const index = store.index();
    expect(index).toHaveLength(1);
    expect(index[0]).toMatchObject({ receipt_id: receipt.receipt_id, mode: "AUDIT", head_commit: HEAD, finding_count: 1, families: ["public_safety"] });
    expect(store.forRepository(receipt.repository_id)).toHaveLength(1);
    expect(readFileSync(join(store.root, RECEIPT_INDEX_FILE), "utf8").endsWith("\n")).toBe(true);
    // Corrupt one key set on disk: an extra key in a finding.
    const onDisk = JSON.parse(readFileSync(path, "utf8")) as { findings: Record<string, unknown>[] };
    onDisk.findings[0]!.excerpt = "leaked";
    writeFileSync(path, `${JSON.stringify(onDisk)}\n`);
    expect(() => store.read(receipt.receipt_id)).toThrow(RunReceiptInvalidError);
    // And a missing top-level key.
    const { dirty: _dirty, ...withoutDirty } = receipt;
    writeFileSync(path, `${JSON.stringify(withoutDirty)}\n`);
    expect(() => store.read(receipt.receipt_id)).toThrow(RunReceiptInvalidError);
    expect(runReceiptErrors(withoutDirty)).toEqual([expect.stringContaining("$: expected exactly the keys")]);
  });

  it("validates agent identity, enumerations and the subject binding", () => {
    expect(runReceiptErrors(validReceipt())).toEqual([]);
    expect(runReceiptErrors(validReceipt({ agent: { identity_status: "unobserved", card_ref: "card-1", source: "flag" } }))).toContainEqual(expect.stringContaining("$.agent"));
    expect(runReceiptErrors(validReceipt({ agent: { identity_status: "receipt", card_ref: null, source: null } }))).toContainEqual(expect.stringContaining("$.agent"));
    expect(runReceiptErrors(validReceipt({ mode: "GUARD" as never }))).toContainEqual(expect.stringContaining("$.mode"));
    expect(runReceiptErrors(validReceipt({ families: [] }))).toContainEqual(expect.stringContaining("$.findings[0].family"));
    const unbound = validReceipt();
    expect(runReceiptErrors({ ...unbound, subject: { ...unbound.subject, head_commit: "a".repeat(40) } })).toContainEqual(expect.stringContaining("$.subject.repository_object"));
    expect(runReceiptErrors(validReceipt({ subject: { ...unbound.subject, repository_object: null } }))).toEqual([]);
  });

  it("resolves the receipt root from the environment and refuses relative overrides", () => {
    expect(receiptRootFromEnvironment({ HOME: "/h" })).toBe("/h/.local/state/mister-clean/receipts");
    expect(receiptRootFromEnvironment({ HOME: "/h", XDG_STATE_HOME: "/s" })).toBe("/s/mister-clean/receipts");
    expect(receiptRootFromEnvironment({ HOME: "/h", MISTER_CLEAN_RECEIPT_ROOT: "/r" })).toBe("/r");
    expect(() => receiptRootFromEnvironment({ HOME: "/h", MISTER_CLEAN_RECEIPT_ROOT: "relative" })).toThrow(/absolute/);
    expect(() => receiptRootFromEnvironment({})).toThrow(/HOME/);
  });

  it("admits agent identity only through an explicit card, never by inference", () => {
    const directory = scratch("card");
    expect(agentFromCard(undefined, "env")).toEqual({ identity_status: "unobserved", card_ref: null, source: null });
    const card = join(directory, "card.json");
    writeFileSync(card, JSON.stringify({ card_id: "agent-card-1", identity_status: "receipt" }));
    expect(agentFromCard(card, "flag")).toEqual({ identity_status: "receipt", card_ref: "agent-card-1", source: "flag" });
    writeFileSync(card, JSON.stringify({ identity_status: "title_only" }));
    expect(agentFromCard(card, "env")).toMatchObject({ identity_status: "title_only", source: "env", card_ref: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) });
    writeFileSync(card, JSON.stringify({ model: "x" }));
    expect(() => agentFromCard(card, "flag")).toThrow(/identity_status/);
  });

  it("writes an AUDIT receipt through the CLI only into the supplied store, outside the repository", async () => {
    const repo = scratch("cli-repo");
    createFixtureRepository(repo);
    writeFileSync(join(repo, "notes.txt"), `contact=${PLANTED}\n`);
    fixtureCommit(repo);
    const store = new LocalRunReceiptStore(join(scratch("cli-root"), "receipts"));
    const output = capture();
    const code = await runCli(["audit", "public-safety", repo, "--tracked", "--json"], output.io, undefined, undefined, store);
    expect(code).toBe(1);
    expect(output.stderr).toEqual([expect.stringMatching(/^receipt: WROTE id=mc-receipt:[0-9a-f-]{36} mode=AUDIT families=public_safety findings=1$/)]);
    const entries = store.index();
    expect(entries).toHaveLength(1);
    const receipt = store.read(entries[0]!.receipt_id);
    expect(receipt).toMatchObject({ mode: "AUDIT", verdict: "AUDIT_ONLY", exit_code: 1, dirty: false, agent: { identity_status: "unobserved" } });
    expect(receipt.subject.head_commit).toBe(fixtureGit(repo, ["rev-parse", "HEAD"]));
    expect(receipt.findings[0]).toMatchObject({ family: "public_safety", rule: "email-address", path: "notes.txt", anchor: { kind: "value_digest" } });
    expect(readFileSync(join(store.root, entries[0]!.path), "utf8")).not.toContain(PLANTED);
    // Nothing was written into the repository.
    expect(readdirSync(repo).filter((name) => name !== ".git")).toEqual(["notes.txt"]);
    // The same store refuses when it would sit inside the audited repository.
    const insideStore = new LocalRunReceiptStore(join(repo, "receipts"));
    const refused = capture();
    expect(await runCli(["audit", "public-safety", repo, "--tracked", "--json"], refused.io, undefined, undefined, insideStore)).toBe(2);
    expect(refused.stderr.join("\n")).toContain("receipt root must not be inside the audited repository");
  });
});
