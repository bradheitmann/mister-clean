import { spawnSync } from "node:child_process";
import { chmodSync, lstatSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function run(stateDir: string) {
  return spawnSync(process.execPath, [join(process.cwd(), "scripts/reconcile_campaign_invocations.ts"), stateDir], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
  });
}

it("refuses a broad caller-owned directory without changing its permissions", () => {
  const directory = mkdtempSync(join(tmpdir(), "mc-campaign-helper-"));
  directories.push(directory);
  chmodSync(directory, 0o755);
  const before = lstatSync(directory).mode & 0o777;
  expect(run(directory).status).not.toBe(0);
  expect(lstatSync(directory).mode & 0o777).toBe(before);
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
