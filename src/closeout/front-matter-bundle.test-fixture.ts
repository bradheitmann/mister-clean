/**
 * The `prepared("cascade")` bundle fixture of hardening.test.ts, copied for the
 * mg-s2c-front-matter tests (charter/DONE/mg-s2c-front-matter.md, proofs 1, 4, 4a and 5)
 * so that hardening.test.ts stays untouched. It prepares one real closeout of a small
 * fixture repository, then lets a test rewrite planning files, the bundle's planning
 * corpus rows and the report verdict before running the real `validateBundle`.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { validateBundle } from "./bundle.js";
import type { ActionHygieneProcessPort } from "./action-hygiene.js";
import {
  prepareCloseout as prepareCloseoutBound,
  type PrepareCloseoutOptions,
} from "./prepare.js";
import { mintServerAttestationBinding } from "../runtime-binding.js";
import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";

type JsonObject = Record<string, unknown>;

const SOURCE_RUNTIME = mintServerAttestationBinding({
  record_type: "mister-clean.runtime-attestation-binding",
  schema_version: "1.0",
  status: "source_development",
  package_root: "/fixture/mister-clean",
  package_root_realpath: "/fixture/mister-clean",
  entrypoint: { path: "./src/cli.ts", realpath: "/fixture/mister-clean/src/cli.ts", sha256: "b".repeat(64) },
  reason: "front matter test source execution",
});

const TEST_PROCESS_PORT: ActionHygieneProcessPort = {
  processTable: () => [{
    pid: process.pid,
    ppid: 0,
    start_identity: "front-matter-test-process",
    executable: process.execPath,
  }],
  pathTable: () => new Map([[process.pid, { cwd: "/", open_paths: [] }]]),
};

const roots: string[] = [];

function prepareCloseout(options: Omit<PrepareCloseoutOptions, "runtimeAttestation">) {
  return prepareCloseoutBound({ ...options, processPort: options.processPort ?? TEST_PROCESS_PORT, runtimeAttestation: SOURCE_RUNTIME });
}

function sha(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function json(path: string): JsonObject {
  return JSON.parse(readFileSync(path, "utf8")) as JsonObject;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export interface BundleFixture {
  readonly repo: string;
  readonly proof: string;
  readonly bundlePath: string;
}

/** hardening.test.ts `prepared("cascade")`: a prepared closeout of a repository with planning/done/done.md. */
export async function preparedCascade(): Promise<BundleFixture> {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-front-matter-cascade-"));
  roots.push(root);
  const repo = join(root, "repo");
  mkdirSync(repo, { recursive: true });
  createFixtureRepository(repo, {
    branch: "main",
    identity: { name: "Front Matter Test", email: "front-matter.invalid" },
  });
  mkdirSync(join(repo, "planning", "done"), { recursive: true });
  mkdirSync(join(repo, "planning", "backlog"), { recursive: true });
  writeFileSync(join(repo, "planning", "done", "done.md"), "done\n");
  writeFileSync(join(repo, "planning", "backlog", "next.md"), "next\n");
  writeFileSync(join(repo, "CURRENT-STATE.md"), "state\n");
  fixtureCommit(repo, "fixture");
  const result = await prepareCloseout({
    repo, evidenceHome: root, runId: "run-1", requestRef: "request-1",
    requestText: "$mister-clean", now: () => new Date("2026-08-25T10:00:00Z"),
  });
  const fixture = { repo, proof: result.bundleDirectory, bundlePath: result.bundlePath };
  prepared.set(fixture, {
    bundle: readFileSync(fixture.bundlePath, "utf8"),
    report: readFileSync(join(fixture.proof, "closeout-report.json"), "utf8"),
    files: new Map(),
  });
  return fixture;
}

/** The prepared state of a fixture, restored before every validation so that calls do not leak into each other. */
interface PreparedState {
  readonly bundle: string;
  readonly report: string;
  /** Every repository path a call wrote, with its prepared content (undefined: the path did not exist). */
  readonly files: Map<string, string | undefined>;
}

const prepared = new WeakMap<BundleFixture, PreparedState>();

function restore(fixture: BundleFixture): PreparedState {
  const state = prepared.get(fixture);
  if (!state) throw new Error("front matter bundle fixture: not created by preparedCascade");
  writeFileSync(fixture.bundlePath, state.bundle, "utf8");
  writeFileSync(join(fixture.proof, "closeout-report.json"), state.report, "utf8");
  for (const [path, content] of state.files) {
    const target = join(fixture.repo, path);
    if (content === undefined) rmSync(target, { force: true });
    else writeFileSync(target, content, "utf8");
  }
  state.files.clear();
  return state;
}

/** Remove every fixture this module created (call from afterEach or afterAll). */
export function cleanupBundleFixtures(): void {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
}

/** One planning file: written into the repository and, when `class` is given, recorded as a corpus row. */
export interface PlanningEntry {
  readonly path: string;
  readonly content: string;
  readonly class?: string;
  readonly rationale?: string;
}

export interface ValidateOptions {
  /** The report verdict; CLEAN by default (the procedure check runs only for CLEAN). */
  readonly verdict?: string;
  /** Pass the repository to validateBundle; true by default. */
  readonly withRepo?: boolean;
  /** Edit the first planning system before the bundle is persisted. */
  readonly system?: (system: JsonObject) => void;
}

/**
 * Restore the prepared state, write the entries, update the bundle's first planning
 * system and the report verdict, persist both, and return the errors of the real
 * `validateBundle`. An entry with a `class` replaces or adds its corpus row (class,
 * rationale, digest, byte length); an entry without one only rewrites the file, as
 * hardening.test.ts does for done.md.
 */
export async function validateWithPlanningEntries(
  fixture: BundleFixture,
  entries: readonly PlanningEntry[],
  options: ValidateOptions = {},
): Promise<readonly string[]> {
  const state = restore(fixture);
  for (const entry of entries) {
    if (state.files.has(entry.path)) continue;
    const target = join(fixture.repo, entry.path);
    state.files.set(entry.path, existsSync(target) ? readFileSync(target, "utf8") : undefined);
  }
  const bundle = json(fixture.bundlePath);
  const reportPath = join(fixture.proof, "closeout-report.json");
  const report = json(reportPath);
  report.verdict = options.verdict ?? "CLEAN";
  const system = ((bundle.planning_discovery as JsonObject).systems as JsonObject[])[0]!;
  const corpus = system.corpus as JsonObject;
  const artifacts = corpus.artifacts as JsonObject[];
  let rowsChanged = false;
  for (const entry of entries) {
    const target = join(fixture.repo, entry.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry.content, "utf8");
    if (entry.class === undefined) continue;
    rowsChanged = true;
    const bytes = readFileSync(target);
    const row: JsonObject = {
      path: entry.path,
      class: entry.class,
      sha256: sha(bytes),
      byte_length: bytes.byteLength,
      ...(entry.rationale === undefined ? {} : { classification_rationale: entry.rationale }),
    };
    const index = artifacts.findIndex((artifact) => artifact.path === entry.path);
    if (index >= 0) artifacts[index] = row;
    else artifacts.push(row);
  }
  if (rowsChanged) {
    corpus.total = artifacts.length;
    corpus.classified = artifacts.length;
    corpus.unclassified = 0;
  }
  options.system?.(system);
  writeJson(reportPath, report);
  (bundle.report as JsonObject).sha256 = sha(readFileSync(reportPath, "utf8"));
  writeJson(fixture.bundlePath, bundle);
  const result = await validateBundle(bundle, fixture.bundlePath, options.withRepo === false ? {} : { repoPath: fixture.repo });
  return result.errors;
}

/** The validator's executed-early/unexecuted-later error for `path`, if any (the text is unchanged by the slice). */
export function procedureError(errors: readonly string[], path: string): string | undefined {
  return errors.find((error) => error.endsWith(`.corpus: ${path} contains an executed-early/unexecuted-later procedure and cannot be CLEAN`));
}
