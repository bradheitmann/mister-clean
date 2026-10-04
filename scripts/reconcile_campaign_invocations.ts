import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";

import { startLocalControlPlaneRuntime } from "../src/control-plane.js";
import { openControlPlaneDatabase } from "../src/control-plane/persistence/sqlite.js";
import { importCampaignExecutionObservations } from "../src/control-plane/runtime/campaign-observation-intake.js";

const stateDir = process.argv[2];
const campaignId = process.argv[3];
const batchPath = process.argv[4];
if (!stateDir || !isAbsolute(stateDir) || !basename(stateDir).startsWith("campaign-")
  || !campaignId || campaignId.length > 1024 || /[\u0000-\u001f\u007f]/u.test(campaignId)
  || process.argv.length > 5) {
  throw new Error("usage: bun scripts/reconcile_campaign_invocations.ts <absolute-campaign-leaf-dir> <expected-campaign-id> [absolute-private-import-batch]");
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
const stateFiles = [
  "repository.sqlite", "global.sqlite", "invocations.jsonl", "campaign-observations.jsonl",
  "repository.sqlite-wal", "repository.sqlite-shm", "repository.sqlite-journal",
  "global.sqlite-wal", "global.sqlite-shm", "global.sqlite-journal",
] as const;

function verifyStateFiles() {
  for (const filename of stateFiles) {
    const file = join(stateDir, filename);
    const metadata = lstatIfPresent(file);
    if (!metadata) continue;
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || metadata.uid !== process.getuid?.()) {
      throw new Error(`campaign state file is not owned and private: ${filename}`);
    }
    if ((metadata.mode & 0o077) === 0) continue;
    if (!filename.endsWith("-shm") && !filename.endsWith("-wal") && !filename.endsWith("-journal")) {
      throw new Error(`campaign state file is not owned and private: ${filename}`);
    }

    // SQLite may create a shared-memory sidecar at 0644 even under a private
    // directory. Normalize only the verified inode, without following links.
    const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const opened = fstatSync(descriptor);
      if (!opened.isFile() || opened.nlink !== 1 || opened.uid !== process.getuid?.()
        || opened.dev !== metadata.dev || opened.ino !== metadata.ino) {
        throw new Error(`campaign state file changed during verification: ${filename}`);
      }
      fchmodSync(descriptor, 0o600);
    } finally {
      closeSync(descriptor);
    }
  }
}
verifyStateFiles();
if (batchPath !== undefined) {
  const batchDir = join(stateDir, "import-batches");
  if (dirname(batchPath) !== batchDir || !/^[a-f0-9]{64}\.jsonl$/u.test(basename(batchPath))) {
    throw new Error("import batch must be a digest-named file in the campaign import-batches directory");
  }
  const metadata = lstatSync(batchDir);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || metadata.uid !== process.getuid?.()
    || (metadata.mode & 0o077) !== 0) throw new Error("import batch directory must be owned and private");
  lstatSync(batchPath); // A named batch is required, unlike an absent default journal.
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

  let result: Record<string, unknown>;
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
    const responseBody: unknown = await response.json();
    if (!response.ok || typeof responseBody !== "object" || responseBody === null || !("ok" in responseBody) || responseBody.ok !== true) {
      throw new Error("control-plane query failed");
    }
    result = responseBody as Record<string, unknown>;
  } finally {
    await runtime.close();
    verifyStateFiles();
  }
  const global = await openControlPlaneDatabase("global", join(stateDir, "global.sqlite"));
  let observationImport;
  try {
    observationImport = await importCampaignExecutionObservations(global, batchPath ?? join(stateDir, "campaign-observations.jsonl"), campaignId);
  } finally {
    global.close();
    verifyStateFiles();
  }
  console.log(JSON.stringify({ ...result, campaign_observations: observationImport }));
} finally {
  process.umask(previousUmask);
}
