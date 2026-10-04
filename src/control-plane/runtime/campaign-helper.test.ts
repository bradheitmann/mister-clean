import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { canonicalJson, sha256Bytes } from "../../canonical-json.js";
import { openControlPlaneDatabase } from "../persistence/sqlite.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function run(stateDir: string, campaignId = "dogfood-2026", batch?: string) {
  return spawnSync(process.execPath, [join(process.cwd(), "scripts/reconcile_campaign_invocations.ts"), stateDir, campaignId, ...(batch ? [batch] : [])], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
  });
}

it("refuses a broad caller-owned directory without changing its permissions", () => {
  const directory = mkdtempSync(join(tmpdir(), "mc-campaign-helper-"));
  directories.push(directory);
  const leaf = join(directory, "campaign-broad");
  mkdirSync(leaf, { mode: 0o755 });
  chmodSync(leaf, 0o755);
  const before = lstatSync(leaf).mode & 0o777;
  expect(before).toBe(0o755);
  const result = run(leaf);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("campaign state directory must be an owned, private, non-symlink directory");
  expect(lstatSync(leaf).mode & 0o777).toBe(before);
});

it("rejects mixed campaign journals atomically and refuses a foreign reused store even with no journal", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mc-campaign-helper-"));
  directories.push(directory);
  const leaf = join(directory, "campaign-mixed");
  mkdirSync(leaf, { mode: 0o700 });
  const source = join(leaf, "source.jsonl");
  writeFileSync(source, "fixture\n", { mode: 0o600 });
  const observation = (campaign_id: string) => {
    const base = {
      schema_version: "1.0", campaign_id, project: "fixture", slice: null,
      activity: "test", event_kind: "token_usage", tool_name: null,
      timestamp: "2026-10-03T00:00:00Z", session_id: "fixture", model_id: null, reasoning: null,
      requested_model_id: null, requested_reasoning: null, candidate_revision: null, integrated_revision: null,
      metrics: { delta_input_tokens: 100 }, source: { path: source, line: 1, record_sha256: sha256Bytes("fixture") },
    };
    return { ...base, observation_id: `obs:${sha256Bytes(canonicalJson(base))}` };
  };
  const journal = join(leaf, "campaign-observations.jsonl");
  writeFileSync(journal, `${JSON.stringify(observation("dogfood-2026"))}\n${JSON.stringify(observation("foreign"))}\n`, { mode: 0o600 });
  const rejected = run(leaf);
  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toContain("does not match expected campaign_id");
  const global = await openControlPlaneDatabase("global", join(leaf, "global.sqlite"));
  try {
    expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM campaign_execution_observations").get()?.count).toBe(0);
  } finally { global.close(); }
  writeFileSync(journal, `${JSON.stringify(observation("dogfood-2026"))}\n`);
  expect(run(leaf).status).toBe(0);
  writeFileSync(journal, "");
  const foreign = run(leaf, "foreign");
  expect(foreign.status).not.toBe(0);
  expect(foreign.stderr).toContain("store contains observations for a different campaign");
});

it("binds digest-named import batches and retains the journal size ceiling", () => {
  const directory = mkdtempSync(join(tmpdir(), "mc-campaign-helper-"));
  directories.push(directory);
  const leaf = join(directory, "campaign-batches");
  mkdirSync(leaf, { mode: 0o700 });
  const batches = join(leaf, "import-batches");
  mkdirSync(batches, { mode: 0o700 });
  const correct = join(batches, `${sha256Bytes("")}.jsonl`);
  writeFileSync(correct, "", { mode: 0o600 });
  expect(run(leaf, "fixture", correct).status).toBe(0);
  const wrong = join(batches, `${"0".repeat(64)}.jsonl`);
  writeFileSync(wrong, "", { mode: 0o600 });
  const mismatch = run(leaf, "fixture", wrong);
  expect(mismatch.status).not.toBe(0);
  expect(mismatch.stderr).toContain("batch filename does not match its content digest");
  expect(run(leaf, "fixture", join(batches, `${"1".repeat(64)}.jsonl`)).status).not.toBe(0);
  writeFileSync(join(leaf, "campaign-observations.jsonl"), "x".repeat(16 * 1024 * 1024 + 1), { mode: 0o600 });
  const oversized = run(leaf, "fixture");
  expect(oversized.status).not.toBe(0);
  expect(oversized.stderr).toContain("owned, private, bounded regular file");
});

it("creates only a private dedicated leaf and replays it idempotently", () => {
  const directory = mkdtempSync(join(tmpdir(), "mc-campaign-helper-"));
  directories.push(directory);
  const leaf = join(directory, "campaign-test");
  const first = run(leaf);
  expect(first.status, first.stderr).toBe(0);
  expect(JSON.parse(first.stdout)).toMatchObject({ ok: true, result: { pending_count: 0 } });
  expect(lstatSync(leaf).mode & 0o777).toBe(0o700);
  const second = run(leaf);
  expect(second.status, second.stderr).toBe(0);
  expect(JSON.parse(second.stdout)).toMatchObject({ ok: true, result: { pending_count: 0 } });
});

it("replays after SQLite leaves 0644 shared-memory sidecars", () => {
  const directory = mkdtempSync(join(tmpdir(), "mc-campaign-helper-"));
  directories.push(directory);
  const leaf = join(directory, "campaign-test");
  const first = run(leaf);
  expect(first.status, first.stderr).toBe(0);
  for (const filename of ["repository.sqlite-shm", "global.sqlite-shm"]) {
    const sidecar = join(leaf, filename);
    writeFileSync(sidecar, "", { mode: 0o644 });
    chmodSync(sidecar, 0o644);
  }

  const second = run(leaf);
  expect(second.status, second.stderr).toBe(0);
  expect(JSON.parse(second.stdout)).toMatchObject({ ok: true, result: { pending_count: 0 } });
  for (const filename of ["repository.sqlite-shm", "global.sqlite-shm"]) {
    const sidecar = join(leaf, filename);
    if (existsSync(sidecar)) expect(lstatSync(sidecar).mode & 0o077).toBe(0);
  }
});

it("imports private campaign observations once and rolls back a conflicting replay", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mc-campaign-helper-"));
  directories.push(directory);
  const leaf = join(directory, "campaign-observations");
  mkdirSync(leaf, { mode: 0o700 });
  const sourcePath = join(leaf, "source.jsonl");
  const sourceLine = '{"fixture":"retained private source"}';
  writeFileSync(sourcePath, `${sourceLine}\n`, { mode: 0o644 });
  chmodSync(sourcePath, 0o644);
  expect(lstatSync(sourcePath).mode & 0o777).toBe(0o644);
  const base = {
    schema_version: "1.0", campaign_id: "dogfood-2026", project: "mister-clean", slice: "intake",
    activity: "test", event_kind: "tool_result", tool_name: "fixture_tool", timestamp: "2026-10-03T00:00:00.000Z",
    session_id: "session-fixture", model_id: null, reasoning: null,
    requested_model_id: null, requested_reasoning: null,
    candidate_revision: null, integrated_revision: null,
    metrics: { tool_calls: 1 },
    source: { path: sourcePath, line: 1, record_sha256: sha256Bytes(sourceLine) },
  };
  const first = { ...base, observation_id: `obs:${sha256Bytes(canonicalJson(base))}` };
  const journal = join(leaf, "campaign-observations.jsonl");
  writeFileSync(journal, `${JSON.stringify(first)}\n`, { mode: 0o600 });

  const imported = run(leaf);
  expect(imported.status, imported.stderr).toBe(0);
  expect(JSON.parse(imported.stdout)).toMatchObject({ campaign_observations: { imported: 1, replayed: 0 } });
  const replayed = run(leaf);
  expect(replayed.status, replayed.stderr).toBe(0);
  expect(JSON.parse(replayed.stdout)).toMatchObject({ campaign_observations: { imported: 0, replayed: 1 } });
  expect(lstatSync(sourcePath).mode & 0o777).toBe(0o644);

  chmodSync(sourcePath, 0o664);
  const writableSource = run(leaf);
  expect(writableSource.status).not.toBe(0);
  expect(writableSource.stderr).toContain("source must be an owned regular file not writable by others");
  expect(lstatSync(sourcePath).mode & 0o777).toBe(0o664);
  chmodSync(sourcePath, 0o644);

  writeFileSync(sourcePath, '{"fixture":"tampered"}\n');
  const sourceMismatch = run(leaf);
  expect(sourceMismatch.status).not.toBe(0);
  expect(sourceMismatch.stderr).toContain("campaign observation source digest mismatch");
  writeFileSync(sourcePath, `${sourceLine}\n`);

  const nextBase = {
    ...base,
    timestamp: "2026-10-03T00:01:00.000Z",
    source: { path: sourcePath, line: null, record_sha256: sha256Bytes(`${sourceLine}\n`) },
  };
  const next = { ...nextBase, observation_id: `obs:${sha256Bytes(canonicalJson(nextBase))}` };
  writeFileSync(journal, `${JSON.stringify(first)}\n${JSON.stringify(next)}\n`);
  const wholeReceipt = run(leaf);
  expect(wholeReceipt.status, wholeReceipt.stderr).toBe(0);
  expect(JSON.parse(wholeReceipt.stdout)).toMatchObject({ campaign_observations: { imported: 1, replayed: 1 } });
  const conflict = { ...first, activity: "tampered" };
  writeFileSync(journal, `${JSON.stringify(first)}\n${JSON.stringify(next)}\n${JSON.stringify(conflict)}\n`, { mode: 0o600 });
  const rejected = run(leaf);
  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toContain("observation_id does not match canonical record digest");

  const global = await openControlPlaneDatabase("global", join(leaf, "global.sqlite"));
  try {
    const rows = global.database.query<{ observation_id: string }>(
      "SELECT observation_id FROM campaign_execution_observations ORDER BY observed_at",
    ).all();
    expect(rows).toEqual([{ observation_id: first.observation_id }, { observation_id: next.observation_id }]);
    expect(global.database.query<{ count: number }>("SELECT COUNT(*) AS count FROM trials").get()?.count).toBe(0);
    expect(() => global.database.query("DELETE FROM campaign_execution_observations WHERE observation_id = ?")
      .run(first.observation_id)).toThrow("campaign_execution_observations is append-only");
  } finally { global.close(); }

  // Seed a malformed prior row through the test database to simulate a hash
  // collision or corrupted store, then prove the earlier valid insert rolls back.
  const collisionBase = { ...base, timestamp: "2026-10-03T00:02:00.000Z" };
  const collision = { ...collisionBase, observation_id: `obs:${sha256Bytes(canonicalJson(collisionBase))}` };
  const pendingBase = { ...base, timestamp: "2026-10-03T00:03:00.000Z" };
  const pending = { ...pendingBase, observation_id: `obs:${sha256Bytes(canonicalJson(pendingBase))}` };
  const seeded = await openControlPlaneDatabase("global", join(leaf, "global.sqlite"));
  try {
    const template = seeded.database.query<Record<string, unknown>>(
      "SELECT * FROM campaign_execution_observations WHERE observation_id = ?",
    ).get(first.observation_id);
    expect(template).not.toBeNull();
    const fields = Object.keys(template!);
    const values = fields.map((field) => field === "observation_id" ? collision.observation_id : template![field]);
    seeded.database.query(`INSERT INTO campaign_execution_observations (${fields.join(", ")}) VALUES (${fields.map(() => "?").join(", ")})`)
      .run(...values);
  } finally { seeded.close(); }
  writeFileSync(journal, `${JSON.stringify(pending)}\n${JSON.stringify(collision)}\n`);
  const collisionResult = run(leaf);
  expect(collisionResult.status).not.toBe(0);
  expect(collisionResult.stderr).toContain("conflicting campaign observation replay");
  const afterConflict = await openControlPlaneDatabase("global", join(leaf, "global.sqlite"));
  try {
    expect(afterConflict.database.query("SELECT observation_id FROM campaign_execution_observations WHERE observation_id = ?")
      .get(pending.observation_id)).toBeNull();
  } finally { afterConflict.close(); }
});

it("hashes a source line across read buffers and reports an early mismatch without descriptor errors", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mc-campaign-helper-"));
  directories.push(directory);
  const leaf = join(directory, "campaign-buffer-boundary");
  mkdirSync(leaf, { mode: 0o700 });
  const sourcePath = join(leaf, "source.jsonl");
  const firstLine = "x".repeat(64 * 1024 + 17);
  const laterLine = "z".repeat(64 * 1024 + 17);
  writeFileSync(sourcePath, `${firstLine}\n${laterLine}\n`, { mode: 0o644 });
  chmodSync(sourcePath, 0o644);
  const base = {
    schema_version: "1.0", campaign_id: "dogfood-2026", project: "mister-clean", slice: "intake",
    activity: "test", event_kind: "tool_result", tool_name: null, timestamp: "2026-10-03T00:00:00.000Z",
    session_id: null, model_id: null, reasoning: null,
    requested_model_id: null, requested_reasoning: null,
    candidate_revision: null, integrated_revision: null,
    metrics: { tool_calls: 1 },
    source: { path: sourcePath, line: 1, record_sha256: sha256Bytes(firstLine) },
  };
  const observation = { ...base, observation_id: `obs:${sha256Bytes(canonicalJson(base))}` };
  const journal = join(leaf, "campaign-observations.jsonl");
  writeFileSync(journal, `${JSON.stringify(observation)}\n`, { mode: 0o600 });

  const imported = run(leaf);
  expect(imported.status, imported.stderr).toBe(0);
  expect(JSON.parse(imported.stdout)).toMatchObject({ campaign_observations: { imported: 1, replayed: 0 } });

  const wrong = { ...base, source: { ...base.source, record_sha256: sha256Bytes("different source line") } };
  const mismatch = { ...wrong, observation_id: `obs:${sha256Bytes(canonicalJson(wrong))}` };
  writeFileSync(journal, `${JSON.stringify(mismatch)}\n`);
  const rejected = run(leaf);
  expect(rejected.status).not.toBe(0);
  expect(rejected.stderr).toContain("campaign observation source digest mismatch");
  expect(rejected.stderr).not.toContain("EBADF");

  const global = await openControlPlaneDatabase("global", join(leaf, "global.sqlite"));
  try {
    expect(global.database.query<{ count: number }>(
      "SELECT COUNT(*) AS count FROM campaign_execution_observations",
    ).get()?.count).toBe(1);
  } finally { global.close(); }
});

it.each(["global.sqlite", "repository.sqlite", "global.sqlite-wal", "global.sqlite-shm", "campaign-observations.jsonl"])(
  "rejects a dangling %s symlink without creating its outside target",
  (filename) => {
    const directory = mkdtempSync(join(tmpdir(), "mc-campaign-helper-"));
    directories.push(directory);
    const leaf = join(directory, "campaign-test");
    const escape = join(directory, "escape");
    mkdirSync(leaf, { mode: 0o700 });
    mkdirSync(escape, { mode: 0o700 });
    const outside = join(escape, filename);
    symlinkSync(outside, join(leaf, filename));

    expect(run(leaf).status).not.toBe(0);
    expect(existsSync(outside)).toBe(false);
  },
);
