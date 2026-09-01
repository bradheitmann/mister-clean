import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";

import { acceptedReleaseRecordBytes, type AcceptedReleaseRecordV1 } from "./accepted-release.js";
import { prepareCloseout } from "./prepare.js";
import { captureRepositoryObject } from "./repository-object.js";
import { canonicalJson, sha256Bytes } from "../control-plane/runtime/authority.js";
import type { FileRuntimeAttestationBinding } from "../runtime-binding.js";

export type TestRecord = Record<string, any>;

const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
const sha512 = (value: string | Uint8Array): string => createHash("sha512").update(value).digest("hex");
const sri = (value: string | Uint8Array): string => `sha512-${createHash("sha512").update(value).digest("base64")}`;
const execute = promisify(execFile);

async function put(path: string, value: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

function octal(value: number, width: number): string {
  return `${value.toString(8).padStart(width - 1, "0")}\0`;
}

function tarHeader(path: string, length: number): Buffer {
  const block = Buffer.alloc(512);
  block.write(path, 0, "ascii");
  block.write(octal(0o644, 8), 100, "ascii");
  block.write(octal(0, 8), 108, "ascii");
  block.write(octal(0, 8), 116, "ascii");
  block.write(octal(length, 12), 124, "ascii");
  block.write(octal(0, 12), 136, "ascii");
  block.fill(32, 148, 156);
  block[156] = "0".charCodeAt(0);
  block.write("ustar\0", 257, "ascii");
  block.write("00", 263, "ascii");
  let sum = 0;
  for (const value of block) sum += value;
  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
  return block;
}

function archive(files: ReadonlyMap<string, string>): Uint8Array {
  const chunks: Buffer[] = [];
  for (const [path, body] of files) {
    const bytes = Buffer.from(body);
    chunks.push(tarHeader(`package/${path}`, bytes.byteLength), bytes);
    const padding = (512 - (bytes.byteLength % 512)) % 512;
    if (padding > 0) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks));
}

export interface SyntheticAcceptedRelease {
  readonly acceptedEvaluatorPath: string;
  readonly evaluator: TestRecord;
  readonly record: AcceptedReleaseRecordV1;
}

export async function createSyntheticAcceptedRelease(
  repo: string,
  externalRoot: string,
): Promise<SyntheticAcceptedRelease> {
  const packageRoot = join(externalRoot, "accepted", "package");
  const archivePath = join(externalRoot, "accepted", "archive.tgz");
  const evidencePath = join(externalRoot, "accepted", "registry.json");
  const recordPath = join(externalRoot, "accepted", "accepted-release.json");
  const packageJson = `${JSON.stringify({
    name: "@example/mister-clean-dogfood",
    version: "1.2.3",
    bin: { "mister-clean": "bin/mister-clean.js" },
  }, null, 2)}\n`;
  const files = new Map<string, string>([
    ["package.json", packageJson],
    ["SKILL.md", "# Retained accepted evaluator\n"],
    ["bin/mister-clean.js", "#!/usr/bin/env node\nconsole.log('accepted');\n"],
    ["dist/index.js", "export const accepted = true;\n"],
  ]);
  files.set("MANIFEST.sha256", [...files].map(([path, body]) => `${sha256(body)}  ./${path}`).join("\n") + "\n");
  const archiveBytes = archive(files);
  for (const [path, body] of files) await put(join(packageRoot, path), body);
  await put(archivePath, archiveBytes);

  const registryIntegrity = sri(archiveBytes);
  const response = {
    name: "@example/mister-clean-dogfood",
    version: "1.2.3",
    dist: {
      tarball: "https://registry.npmjs.org/@example%2fmister-clean-dogfood/-/mister-clean-dogfood-1.2.3.tgz",
      integrity: registryIntegrity,
    },
  };
  const evidence = `${JSON.stringify({
    record_type: "mister-clean.npm-registry-release-evidence",
    schema_version: "1.0",
    authority: "npm_registry",
    verdict: "accepted_release",
    package_name: response.name,
    version: response.version,
    tarball_url: response.dist.tarball,
    dist_integrity: response.dist.integrity,
    archive: { sha512: sha512(archiveBytes), byte_length: archiveBytes.byteLength },
    retrieved_at: "2026-08-25T08:58:00.000Z",
    response,
    response_sha256: sha256(canonicalJson(response)),
  }, null, 2)}\n`;
  await put(evidencePath, evidence);
  const record: AcceptedReleaseRecordV1 = {
    record_type: "mister-clean.accepted-release",
    schema_version: "1.0",
    package_name: response.name,
    version: response.version,
    registry_integrity: registryIntegrity,
    archive: { path: archivePath, byte_length: archiveBytes.byteLength, sha512: sha512(archiveBytes) },
    installed_package_root: packageRoot,
    entrypoint: "bin/mister-clean.js",
    files: {
      package_json: { path: "package.json", sha256: sha256(files.get("package.json")!) },
      skill: { path: "SKILL.md", sha256: sha256(files.get("SKILL.md")!) },
      executable: { path: "bin/mister-clean.js", sha256: sha256(files.get("bin/mister-clean.js")!) },
      manifest: { path: "MANIFEST.sha256", sha256: sha256(files.get("MANIFEST.sha256")!) },
    },
    accepted_at: "2026-08-25T08:59:00.000Z",
    evidence_ref: { path: evidencePath, sha256: sha256(evidence) },
  };
  const recordBytes = acceptedReleaseRecordBytes(record);
  await put(recordPath, recordBytes);

  // The accepted-release verifier reads candidate package metadata, while Git's
  // exact candidate object intentionally ignores this test-only package identity.
  await put(join(repo, ".git", "info", "exclude"), "package.json\n");
  await put(join(repo, "package.json"), `${JSON.stringify({ name: "candidate", version: "1.2.4" })}\n`);
  return {
    acceptedEvaluatorPath: recordPath,
    record,
    evaluator: {
      package_name: record.package_name,
      version: record.version,
      release_state: "accepted_release",
      registry_integrity: record.registry_integrity,
      skill_sha256: record.files.skill.sha256,
      executable_sha256: record.files.executable.sha256,
      manifest_sha256: record.files.manifest.sha256,
      entrypoint: record.entrypoint,
      resolved_package_root: record.installed_package_root,
      resolved_at: record.accepted_at,
      evidence_ref: record.evidence_ref,
      accepted_release_ref: { path: recordPath, sha256: sha256(recordBytes) },
    },
  };
}

export interface GuardAuthorityFixture {
  readonly tuple: { run_id: string; round_id: string; pod_id: string; task_id: string };
  readonly receipts: TestRecord[];
  readonly deterministicGates: TestRecord;
  readonly noHarm: TestRecord;
  readonly commitBarrier: TestRecord;
  readonly alternateReceiptSeals: TestRecord[];
  readonly precommit: TestRecord;
  readonly precommitPath: string;
  readonly precommitSha256: string;
}

export async function createGuardPrecommitAuthority(options: {
  readonly externalRoot: string;
  readonly bundle: TestRecord;
  readonly manifest: TestRecord;
  readonly candidate: TestRecord;
  readonly evaluator: TestRecord;
  readonly evidenceRef: TestRecord;
}): Promise<GuardAuthorityFixture> {
  const tuple = { run_id: options.bundle.run_id, round_id: `round-${randomUUID()}`, pod_id: `pod-${randomUUID()}`, task_id: `task-${randomUUID()}` };
  const common = {
    ...tuple,
    reasoning_level: "high",
    baseline_commit: options.candidate.baseline_commit,
    candidate_tree: options.candidate.candidate_tree,
    prompt_sha256: "1".repeat(64), policy_sha256: "2".repeat(64), criteria_sha256: "3".repeat(64), checks_sha256: "4".repeat(64),
    conclusion: "pass", findings_total: 0, findings_paid: 0, unresolved: 0,
    repository_mutated: false, mutation_owner_transfer: null, evidence_ref: options.evidenceRef,
  };
  const roles = ["dev", "qa", "mister_clean", "holdout"] as const;
  const receipts = [...roles, ...roles].map((role, index) => {
    const sequence = index % roles.length;
    const alternate = index >= roles.length;
    const content = {
      id: `receipt-${role}${alternate ? "-alternate" : ""}`,
      ...common,
      role,
      actor: `actor-${role}${alternate ? "-alternate" : ""}`,
      actual_model: `model-${role}`,
      harness: `harness-${role}${alternate ? "-alternate" : ""}`,
      session_id: `session-${role}${alternate ? "-alternate" : ""}`,
      started_at: `2026-08-25T08:59:0${sequence * 2}Z`,
      finished_at: `2026-08-25T08:59:0${sequence * 2 + 1}Z`,
      mister_clean_evaluator: role === "mister_clean" ? options.evaluator : null,
    };
    return { ...content, receipt_sha256: sha256Bytes(canonicalJson(content)) };
  });
  const deterministicGates = {
    candidate_tree: options.candidate.candidate_tree, state: "passed", required_count: 1, passed_count: 1,
    known_failures: [], evidence_ref: options.evidenceRef,
  };
  const noHarm = {
    candidate_tree: options.candidate.candidate_tree, state: "passed", introduced_by_run_open: 0,
    evidence_ref: options.evidenceRef,
  };
  const seals = (selected: readonly TestRecord[]) => selected.map((receipt) => ({
    receipt_id: receipt.id,
    receipt_sha256: receipt.receipt_sha256,
  }));
  const commitBarrier = {
    state: "open",
    approved_tree: options.candidate.candidate_tree,
    receipt_ids: seals(receipts.slice(0, 4)),
    opened_at: "2026-08-25T08:59:30Z",
    crossed_action_id: null,
  };
  const precommit = {
    record_type: "mister-clean.guard-precommit-authority", schema_version: "1.0",
    repo: structuredClone(options.manifest.repo), request_ref: options.manifest.request_ref, ...tuple,
    target: { ref: "refs/heads/main", expected_commit: options.candidate.baseline_commit },
    candidate: options.candidate, receipts, deterministic_gates: deterministicGates, no_harm: noHarm,
    commit_barrier: commitBarrier,
  };
  const precommitPath = join(options.externalRoot, "guard", "precommit.json");
  const bytes = canonicalJson(precommit);
  await put(precommitPath, bytes);
  return {
    tuple, receipts, deterministicGates, noHarm, commitBarrier,
    alternateReceiptSeals: seals(receipts.slice(4)),
    precommit, precommitPath, precommitSha256: sha256(bytes),
  };
}

export async function writeCanonicalTestRecord(path: string, value: unknown): Promise<string> {
  const bytes = canonicalJson(value);
  await put(path, bytes);
  return sha256(bytes);
}

export const testSha256 = sha256;

export interface OpenGuardValidationFixture {
  readonly root: string;
  readonly repo: string;
  readonly bundleDirectory: string;
  readonly bundlePath: string;
  readonly acceptedEvaluatorPath: string;
  readonly candidate: TestRecord;
  readonly authority: GuardAuthorityFixture;
  bundle: TestRecord;
  manifest: TestRecord;
  report: TestRecord;
  persist(): Promise<void>;
}

async function git(repo: string, ...args: string[]): Promise<string> {
  return (await execute("git", ["-C", repo, ...args], { encoding: "utf8" })).stdout.trim();
}

export async function createOpenGuardValidationFixture(options: {
  readonly root: string;
  readonly runtimeAttestation: FileRuntimeAttestationBinding;
}): Promise<OpenGuardValidationFixture> {
  await mkdir(options.root, { recursive: true });
  const root = await realpath(options.root);
  const repo = join(root, "repo");
  await mkdir(repo, { recursive: true });
  await execute("git", ["init", "-b", "main", repo]);
  await git(repo, "config", "user.name", "GUARD Fixture");
  await git(repo, "config", "user.email", "guard-fixture.invalid");
  await put(join(repo, "CURRENT-STATE.md"), "Baseline state.\n");
  await git(repo, "add", ".");
  await git(repo, "commit", "-m", "baseline");
  const baseline = await git(repo, "rev-parse", "HEAD");
  await put(join(repo, "CURRENT-STATE.md"), "Current staged GUARD candidate.\n");
  await git(repo, "add", "CURRENT-STATE.md");
  const candidateTree = await git(repo, "write-tree");
  const candidateObject = captureRepositoryObject(repo);
  const prepared = await prepareCloseout({
    repo,
    evidenceHome: join(root, "guard-evidence"),
    runId: `guard-${randomUUID()}`,
    requestRef: "request-guard-permanent",
    requestText: "$mister-clean guard permanent fixture",
    mode: "GUARD",
    now: () => new Date("2026-08-25T09:00:00Z"),
    runtimeAttestation: options.runtimeAttestation,
  });
  const bundlePath = prepared.bundlePath;
  const bundleDirectory = prepared.bundleDirectory;
  let bundle = JSON.parse(await readFile(bundlePath, "utf8")) as TestRecord;
  let manifest = JSON.parse(await readFile(join(bundleDirectory, "action-manifest.json"), "utf8")) as TestRecord;
  let report = JSON.parse(await readFile(join(bundleDirectory, "closeout-report.json"), "utf8")) as TestRecord;
  const externalRoot = join(root, "external-authority");
  await mkdir(externalRoot, { recursive: true });
  const canonicalExternalRoot = await realpath(externalRoot);
  const accepted = await createSyntheticAcceptedRelease(repo, canonicalExternalRoot);
  const evidenceRef = {
    path: "criteria-source.json",
    sha256: sha256(await readFile(join(bundleDirectory, "criteria-source.json"))),
  };
  const candidate = {
    baseline_commit: baseline,
    candidate_tree: candidateTree,
    minted_at: "2026-08-25T08:58:30Z",
    repository_object: candidateObject,
    staged_paths: ["CURRENT-STATE.md"],
    writers_frozen: true,
  };
  const authority = await createGuardPrecommitAuthority({
    externalRoot: canonicalExternalRoot,
    bundle,
    manifest,
    candidate,
    evaluator: accepted.evaluator,
    evidenceRef,
  });
  manifest.guard = {
    status: "passed", baseline_commit: baseline, candidate_tree: candidateTree,
    minted_at: "2026-08-25T08:58:30Z", staged_paths: ["CURRENT-STATE.md"], writers_frozen: true,
    receipts: authority.receipts, deterministic_gates: authority.deterministicGates, no_harm: authority.noHarm,
    commit_barrier: structuredClone(authority.commitBarrier),
    authority: { kind: "external_custody", precommit_sha256: authority.precommitSha256, crossing_sha256: null },
  };
  manifest.coordination.target = { ref: "refs/heads/main", expected_commit: baseline, observed_at: "2026-08-25T09:00:00Z" };
  const value: OpenGuardValidationFixture = {
    root, repo, bundleDirectory, bundlePath, acceptedEvaluatorPath: accepted.acceptedEvaluatorPath,
    candidate, authority, bundle, manifest, report,
    async persist() {
      await put(join(bundleDirectory, "action-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
      await put(join(bundleDirectory, "closeout-report.json"), `${JSON.stringify(report, null, 2)}\n`);
      bundle.manifest.sha256 = sha256(await readFile(join(bundleDirectory, "action-manifest.json")));
      bundle.report.sha256 = sha256(await readFile(join(bundleDirectory, "closeout-report.json")));
      await put(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
      value.bundle = bundle;
      value.manifest = manifest;
      value.report = report;
    },
  };
  await value.persist();
  return value;
}
