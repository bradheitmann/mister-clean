import { spawnSync } from "node:child_process";
import type { StdioOptions } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

import type { ReleaseArchiveCustody } from "./release_archive_contract.ts";

// This file ships inside the verified release archive and runs under plain
// `node` (>= 22.18, built-in type stripping). Keep every construct erasable:
// no enums, namespaces or parameter properties; type-only imports use
// `import type`.

/** One receipt-bound retained program. Values are untrusted until checked. */
interface ProgramBinding {
  path: unknown;
  sha256: unknown;
  size_bytes: unknown;
}

/**
 * The fields of release-archive-receipt.json this publisher reads. The receipt is
 * untrusted input: leaves are `unknown` and every one is checked at runtime
 * before it is relied on.
 */
interface ReleaseArchiveReceiptInput {
  record_type: unknown;
  schema_version: unknown;
  status: unknown;
  package: { name: unknown; version: unknown };
  claimed_source: unknown;
  claim_scope: unknown;
  origin_authenticity: unknown;
  manifest: unknown;
  archive: { path: unknown; created_absolute_path: unknown; sha256: unknown; size_bytes: unknown };
  publisher: { entrypoint: ProgramBinding | undefined; verifier: ProgramBinding | undefined };
  publish: { tool: unknown; registry: unknown; concurrency_policy: unknown; cwd_policy: unknown; argv: unknown };
}

interface RetainedProgram {
  digest: string;
  path: string;
  size_bytes: number;
}

type RegistryObservation =
  | { status: "absent" }
  | { status: "present"; version: unknown; integrity: unknown; shasum: unknown };

interface ExpectedRegistryArchive {
  version: unknown;
  integrity: string;
  shasum: string;
}

/** The receipt-bound verifier module, imported by URL; its exports are checked before use. */
type ArchiveVerifierModule = Partial<typeof import("./release_archive_contract.ts")>;

const NPMJS_REGISTRY = "https://registry.npmjs.org/";
const SCOPED_REGISTRY_OVERRIDE = `--config.@bradheitmann:registry=${NPMJS_REGISTRY}`;

function usage() {
  console.error("usage: node publish_release_archive.ts --receipt <release-archive-receipt.json>");
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function archiveRegistryDigests(bytes: Uint8Array): { integrity: string; shasum: string } {
  return {
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    shasum: createHash("sha1").update(bytes).digest("hex"),
  };
}

function assertNeutralPublishCwd(path: string): string {
  const canonical = realpathSync(path);
  for (let cursor = canonical; ; cursor = dirname(cursor)) {
    for (const marker of ["package.json", "pnpm-workspace.yaml", "pnpm-workspace.yml"]) {
      if (existsSync(join(cursor, marker))) {
        throw new Error(`pnpm publication cwd is beneath a package-manager project: ${join(cursor, marker)}`);
      }
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
  }
  return canonical;
}

function assertArchiveLocation(receipt: ReleaseArchiveReceiptInput, receiptPath: string): { path: string } {
  const archive = receipt?.archive;
  if (receipt?.record_type !== "mister-clean.release-archive-receipt"
    || receipt?.schema_version !== "1.1"
    || receipt?.status !== "verified_not_published"
    || archive?.path === undefined
    || archive?.created_absolute_path === undefined
    || archive?.sha256 === undefined) {
    throw new Error("receipt is not a verified unpublished Mister Clean release archive receipt");
  }
  if (typeof archive.path !== "string" || isAbsolute(archive.path) || dirname(archive.path) !== ".") {
    throw new Error("receipt archive path must be one relocatable filename");
  }
  if (typeof archive.created_absolute_path !== "string" || !isAbsolute(archive.created_absolute_path)) {
    throw new Error("receipt archive created_absolute_path must retain its absolute creation location");
  }
  const path = resolve(dirname(receiptPath), archive.path);
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
    throw new Error("release archive must remain a unique regular file");
  }
  if (metadata.size !== archive.size_bytes || statSync(path).size !== archive.size_bytes) {
    throw new Error("release archive size differs from its receipt");
  }
  if (realpathSync(dirname(receiptPath)) !== realpathSync(dirname(path))) {
    throw new Error("receipt and release archive must remain in the same retained directory");
  }
  if ((metadata.mode & 0o777) !== 0o444) chmodSync(path, 0o444);
  return { path };
}

function assertRetainedProgram(
  binding: ProgramBinding | undefined,
  receiptPath: string,
  expectedFile: string,
  label: string,
): RetainedProgram {
  if (!binding || typeof binding.path !== "string" || isAbsolute(binding.path) || dirname(binding.path) !== ".") {
    throw new Error(`receipt does not bind one relocatable ${label} filename`);
  }
  const retained = realpathSync(dirname(receiptPath));
  const unresolved = resolve(dirname(receiptPath), binding.path);
  const metadata = lstatSync(unresolved);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1
  ) {
    throw new Error(`${label} must remain a unique regular file`);
  }
  const path = realpathSync(unresolved);
  if (dirname(path) !== retained) throw new Error(`${label} must remain inside the retained directory`);
  if (path !== expectedFile) throw new Error(`invoked ${label} differs from the receipt-bound file`);
  const digest = sha256File(path);
  if (metadata.size !== binding.size_bytes || digest !== binding.sha256) {
    throw new Error(`${label} differs from its release receipt`);
  }
  if ((metadata.mode & 0o777) !== 0o444) chmodSync(path, 0o444);
  return { digest, path, size_bytes: metadata.size };
}

function assertPublisher(
  receipt: ReleaseArchiveReceiptInput,
  receiptPath: string,
): { entrypoint: RetainedProgram; verifier: RetainedProgram } {
  const retained = realpathSync(dirname(receiptPath));
  const actualEntrypoint = realpathSync(resolve(fileURLToPath(import.meta.url)));
  const entrypoint = assertRetainedProgram(
    receipt?.publisher?.entrypoint,
    receiptPath,
    actualEntrypoint,
    "publisher helper",
  );
  const verifier = assertRetainedProgram(
    receipt?.publisher?.verifier,
    receiptPath,
    realpathSync(join(retained, "release_archive_contract.ts")),
    "archive verifier",
  );
  return { entrypoint, verifier };
}

function pnpm(args: string[], cwd: string, stdio: StdioOptions = ["ignore", "pipe", "pipe"]) {
  const result = spawnSync("pnpm", args, { cwd, encoding: "utf8", stdio });
  if (result.error) throw result.error;
  return result;
}

// An unpublished version is reported differently across pnpm generations:
// pnpm 10 (JavaScript CLI) printed "E404 Not Found" text; pnpm 11+ (Rust CLI)
// prints a JSON error object with code ERR_PNPM_PACKAGE_NOT_FOUND and
// "No matching version found for <spec>". Only these exact shapes count as
// "absent"; every other non-zero exit stays a hard failure.
function registryReportsAbsent(stdout: string, diagnostic: string): boolean {
  try {
    const parsed = JSON.parse(stdout) as { error?: { code?: unknown; message?: unknown } } | null;
    const code = parsed?.error?.code;
    const message = String(parsed?.error?.message ?? "");
    if (code === "ERR_PNPM_PACKAGE_NOT_FOUND" || code === "ERR_PNPM_NO_MATCHING_VERSION"
      || /No matching version found/iu.test(message)) return true;
  } catch {
    // not JSON; fall through to the text patterns
  }
  return /\bE404\b|404 Not Found|is not in this registry|ERR_PNPM_PACKAGE_NOT_FOUND|No matching version found/iu.test(diagnostic);
}

function observeRegistry(spec: string, cwd: string): RegistryObservation {
  const result = pnpm([
    "view", spec, "version", "dist.integrity", "dist.shasum", "--json",
    "--registry", NPMJS_REGISTRY, SCOPED_REGISTRY_OVERRIDE,
  ], cwd);
  if (result.status !== 0) {
    const diagnostic = `${String(result.stdout)}\n${String(result.stderr)}`;
    if (registryReportsAbsent(String(result.stdout), diagnostic)) return { status: "absent" };
    throw new Error(`registry observation failed before publication truth was established: ${diagnostic.trim()}`);
  }
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(String(result.stdout)) as Record<string, unknown>;
  } catch {
    throw new Error("registry observation did not return JSON");
  }
  return {
    status: "present",
    version: value.version,
    integrity: value["dist.integrity"],
    shasum: value["dist.shasum"],
  };
}

function assertExactRegistryArchive(
  observation: RegistryObservation,
  expected: ExpectedRegistryArchive,
  spec: string,
): asserts observation is Extract<RegistryObservation, { status: "present" }> {
  if (observation.status !== "present"
    || observation.version !== expected.version
    || observation.integrity !== expected.integrity
    || observation.shasum !== expected.shasum) {
    throw new Error(`registry ${spec} does not match the exact retained release archive`);
  }
}

// @cloudflare/workers-types declares `process` as `any`; annotate what is read from it.
const args: string[] = process.argv.slice(2);
const receiptValue = option(args, "--receipt");
if (!receiptValue || args.length || (!isAbsolute(receiptValue) && dirname(receiptValue) !== ".")) {
  usage();
  process.exit(2);
}

// process.exit above does not return, so the value is present here.
const receiptPath = resolve(receiptValue!);
const receiptMetadata = lstatSync(receiptPath);
if (!receiptMetadata.isFile() || receiptMetadata.isSymbolicLink() || receiptMetadata.nlink !== 1) {
  throw new Error("release receipt must be a unique regular file");
}
const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as ReleaseArchiveReceiptInput;
if ((receiptMetadata.mode & 0o777) !== 0o444) chmodSync(receiptPath, 0o444);
const sourceReceipt = {
  path: basename(receiptPath),
  sha256: sha256File(receiptPath),
  size_bytes: receiptMetadata.size,
};
const archiveLocation = assertArchiveLocation(receipt, receiptPath);
const retainedPrograms = assertPublisher(receipt, receiptPath);
const verifierModuleUrl = pathToFileURL(retainedPrograms.verifier.path);
verifierModuleUrl.searchParams.set("sha256", retainedPrograms.verifier.digest);
const verifierModule: ArchiveVerifierModule = await import(verifierModuleUrl.href);
if (typeof verifierModule.acquireReleaseArchiveCustody !== "function"
  || typeof verifierModule.inspectReleaseArchiveCustody !== "function") {
  throw new Error("receipt-bound archive verifier does not export the custody contract");
}
const custody: ReleaseArchiveCustody = verifierModule.acquireReleaseArchiveCustody(archiveLocation.path);
if (custody.archive_sha256 !== receipt.archive.sha256 || custody.size_bytes !== receipt.archive.size_bytes) {
  custody.dispose();
  throw new Error("release archive digest differs from its verification receipt");
}
try {
const archiveIdentity = verifierModule.inspectReleaseArchiveCustody(custody);
for (const field of ["package", "claimed_source", "claim_scope", "origin_authenticity", "manifest"] as const) {
  if (JSON.stringify(receipt[field]) !== JSON.stringify(archiveIdentity[field])) {
    throw new Error(`receipt ${field} differs from the independently verified release archive`);
  }
}
if (archiveIdentity.archive_sha256 !== custody.archive_sha256) {
  throw new Error("independent archive inspection disagrees with the receipt digest");
}
const expectedReceiptArgv = [
  "publish", "--access", "public", "--registry", NPMJS_REGISTRY,
  SCOPED_REGISTRY_OVERRIDE,
  receipt.archive.path,
];
const expectedArgv = [
  "publish", "--access", "public", "--registry", NPMJS_REGISTRY,
  SCOPED_REGISTRY_OVERRIDE,
  custody.path,
];
if (receipt?.publish?.tool !== "pnpm"
  || receipt.publish.registry !== NPMJS_REGISTRY
  || receipt.publish.concurrency_policy !== "single_authorized_publication_lane"
  || receipt.publish.cwd_policy !== "system_temp_root_outside_package_project"
  || JSON.stringify(receipt.publish.argv) !== JSON.stringify(expectedReceiptArgv)) {
  throw new Error("receipt does not bind the fixed pnpm publication command");
}
const publishCwd = assertNeutralPublishCwd(realpathSync(tmpdir()));
const publicationReceiptPath = join(dirname(receiptPath), "publication-receipt.json");
if (existsSync(publicationReceiptPath)) throw new Error("a publication receipt already exists for this retained archive");
const registry = NPMJS_REGISTRY;
const spec = `${archiveIdentity.package.name}@${archiveIdentity.package.version}`;
const archiveDigests = archiveRegistryDigests(custody.readBytes());
const expectedRegistry = {
  version: receipt.package.version,
  integrity: archiveDigests.integrity,
  shasum: archiveDigests.shasum,
};
const attemptStartedAt = new Date().toISOString();
const beforeRegistry = observeRegistry(spec, publishCwd);

// This check is intentionally adjacent to process launch. Read-only mode is a
// guardrail, not immutability; digest equality is the publication authority.
if (sha256File(custody.path) !== custody.archive_sha256) throw new Error("private archive custody changed immediately before publication");
let publicationMode = "published_by_this_attempt";
if (beforeRegistry.status === "present") {
  assertExactRegistryArchive(beforeRegistry, expectedRegistry, spec);
  publicationMode = "reconciled_exact_existing_archive";
} else {
  const result = pnpm(expectedArgv, publishCwd, ["inherit", "inherit", "inherit"]);
  if (result.status !== 0) {
    const afterFailure = observeRegistry(spec, publishCwd);
    if (afterFailure.status !== "present") {
      throw new Error(`pnpm publish failed with status ${String(result.status)} and registry still lacks the version`);
    }
    assertExactRegistryArchive(afterFailure, expectedRegistry, spec);
    publicationMode = "reconciled_after_ambiguous_publish_exit";
  }
}
if (sha256File(custody.path) !== custody.archive_sha256) throw new Error("private archive custody changed during publication");
const registryObservation = observeRegistry(spec, publishCwd);
assertExactRegistryArchive(registryObservation, expectedRegistry, spec);
const registryObservedAt = new Date().toISOString();

if (sha256File(receiptPath) !== sourceReceipt.sha256) {
  throw new Error("release receipt changed during publication");
}
const afterPrograms = assertPublisher(receipt, receiptPath);
for (const field of ["entrypoint", "verifier"] as const) {
  if (afterPrograms[field].digest !== retainedPrograms[field].digest) {
    throw new Error(`retained ${field} changed during publication`);
  }
}

writeFileSync(publicationReceiptPath, `${JSON.stringify({
  record_type: "mister-clean.publication-receipt",
  schema_version: "1.1",
  status: "published_verified",
  publication_mode: publicationMode,
  attempt_started_at: attemptStartedAt,
  registry_observed_at: registryObservedAt,
  package: receipt.package,
  claimed_source: receipt.claimed_source,
  claim_scope: receipt.claim_scope,
  origin_authenticity: receipt.origin_authenticity,
  manifest: receipt.manifest,
  archive: { path: receipt.archive.path, sha256: custody.archive_sha256, size_bytes: receipt.archive.size_bytes },
  retained_programs: {
    entrypoint: {
      // assertPublisher has already rejected a missing binding.
      path: receipt.publisher.entrypoint!.path,
      sha256: retainedPrograms.entrypoint.digest,
      size_bytes: retainedPrograms.entrypoint.size_bytes,
    },
    verifier: {
      path: receipt.publisher.verifier!.path,
      sha256: retainedPrograms.verifier.digest,
      size_bytes: retainedPrograms.verifier.size_bytes,
    },
  },
  registry: {
    tool: "pnpm",
    url: registry,
    access: "public",
    package_spec: spec,
    version: registryObservation.version,
    integrity: registryObservation.integrity,
    shasum: registryObservation.shasum,
  },
  source_receipt: sourceReceipt,
}, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o444 });

console.log(JSON.stringify({ status: "published_verified", publication_receipt: publicationReceiptPath }, null, 2));
} finally {
  custody.dispose();
}
