import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { lstatSync, mkdirSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";

import { startLocalControlPlaneRuntime } from "../src/control-plane.js";

const stateDir = process.argv[2];
if (!stateDir || !isAbsolute(stateDir) || !basename(stateDir).startsWith("campaign-")) {
  throw new Error("usage: bun scripts/reconcile_campaign_invocations.ts <absolute-campaign-leaf-dir>");
}

const parent = lstatSync(dirname(stateDir));
if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o022) !== 0 || parent.uid !== process.getuid?.()) {
  throw new Error("campaign parent must be an owned, non-writable-by-others directory");
}
function lstatIfPresent(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

if (!lstatIfPresent(stateDir)) mkdirSync(stateDir, { mode: 0o700 });
const state = lstatSync(stateDir);
if (!state.isDirectory() || state.isSymbolicLink() || (state.mode & 0o077) !== 0 || state.uid !== process.getuid?.()) {
  throw new Error("campaign state directory must be an owned, private, non-symlink directory");
}
for (const filename of [
  "repository.sqlite", "global.sqlite", "invocations.jsonl",
  "repository.sqlite-wal", "repository.sqlite-shm", "repository.sqlite-journal",
  "global.sqlite-wal", "global.sqlite-shm", "global.sqlite-journal",
]) {
  const file = join(stateDir, filename);
  const metadata = lstatIfPresent(file);
  if (!metadata) continue;
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || (metadata.mode & 0o077) !== 0 || metadata.uid !== process.getuid?.()) {
    throw new Error(`campaign state file is not owned and private: ${filename}`);
  }
}

const token = Buffer.from(randomBytes(32)).toString("hex");
const previousUmask = process.umask(0o077);
try {
  const runtime = await startLocalControlPlaneRuntime({
    repository_database_path: join(stateDir, "repository.sqlite"),
    global_database_path: join(stateDir, "global.sqlite"),
    invocation_journal_path: join(stateDir, "invocations.jsonl"),
    bearer_token: token,
    http: { host: "127.0.0.1", port: 0 },
  });

  try {
    if (!runtime.http) throw new Error("loopback query endpoint unavailable");
    const response = await fetch(runtime.http.url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        version: "1",
        request_id: "campaign-pending-invocations",
        kind: "query",
        name: "evaluation.invocations.pending.list",
        input: { limit: 10 },
      }),
    });
    const result: unknown = await response.json();
    if (!response.ok || typeof result !== "object" || result === null || !("ok" in result) || result.ok !== true) {
      throw new Error("control-plane query failed");
    }
    console.log(JSON.stringify(result));
  } finally {
    await runtime.close();
  }
} finally {
  process.umask(previousUmask);
}
