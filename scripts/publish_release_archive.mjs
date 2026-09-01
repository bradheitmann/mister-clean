import { spawnSync } from "node:child_process";
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

const NPMJS_REGISTRY = "https://registry.npmjs.org/";
const SCOPED_REGISTRY_OVERRIDE = `--@bradheitmann:registry=${NPMJS_REGISTRY}`;

function usage() {
  console.error("usage: node publish_release_archive.mjs --receipt <release-archive-receipt.json>");
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function archiveRegistryDigests(bytes) {
  return {
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    shasum: createHash("sha1").update(bytes).digest("hex"),
  };
}

function assertNeutralPublishCwd(path) {
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

function assertArchiveLocation(receipt, receiptPath) {
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

function assertRetainedProgram(binding, receiptPath, expectedFile, label) {
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

function assertPublisher(receipt, receiptPath) {
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
    realpathSync(join(retained, "release_archive_contract.mjs")),
    "archive verifier",
  );
  return { entrypoint, verifier };
}

function pnpm(args, cwd, stdio = ["ignore", "pipe", "pipe"]) {
  const result = spawnSync("pnpm", args, { cwd, encoding: "utf8", stdio });
  if (result.error) throw result.error;
  return result;
}

function observeRegistry(spec, cwd) {
  const result = pnpm([
    "view", spec, "version", "dist.integrity", "dist.shasum", "--json",
    "--registry", NPMJS_REGISTRY, SCOPED_REGISTRY_OVERRIDE,
  ], cwd);
  if (result.status !== 0) {
    const diagnostic = `${String(result.stdout)}\n${String(result.stderr)}`;
    if (/\bE404\b|404 Not Found|is not in this registry/iu.test(diagnostic)) return { status: "absent" };
    throw new Error(`registry observation failed before publication truth was established: ${diagnostic.trim()}`);
  }
  let value;
  try {
    value = JSON.parse(String(result.stdout));
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

function assertExactRegistryArchive(observation, expected, spec) {
  if (observation.status !== "present"
    || observation.version !== expected.version
    || observation.integrity !== expected.integrity
    || observation.shasum !== expected.shasum) {
    throw new Error(`registry ${spec} does not match the exact retained release archive`);
  }
}

const args = process.argv.slice(2);
const receiptValue = option(args, "--receipt");
if (!receiptValue || args.length || (!isAbsolute(receiptValue) && dirname(receiptValue) !== ".")) {
  usage();
  process.exit(2);
}

const receiptPath = resolve(receiptValue);
const receiptMetadata = lstatSync(receiptPath);
if (!receiptMetadata.isFile() || receiptMetadata.isSymbolicLink() || receiptMetadata.nlink !== 1) {
  throw new Error("release receipt must be a unique regular file");
}
const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
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
const verifierModule = await import(verifierModuleUrl.href);
if (typeof verifierModule.acquireReleaseArchiveCustody !== "function"
  || typeof verifierModule.inspectReleaseArchiveCustody !== "function") {
  throw new Error("receipt-bound archive verifier does not export the custody contract");
}
const custody = verifierModule.acquireReleaseArchiveCustody(archiveLocation.path);
if (custody.archive_sha256 !== receipt.archive.sha256 || custody.size_bytes !== receipt.archive.size_bytes) {
  custody.dispose();
  throw new Error("release archive digest differs from its verification receipt");
}
try {
const archiveIdentity = verifierModule.inspectReleaseArchiveCustody(custody);
for (const field of ["package", "claimed_source", "claim_scope", "origin_authenticity", "manifest"]) {
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
for (const field of ["entrypoint", "verifier"]) {
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
      path: receipt.publisher.entrypoint.path,
      sha256: retainedPrograms.entrypoint.digest,
      size_bytes: retainedPrograms.entrypoint.size_bytes,
    },
    verifier: {
      path: receipt.publisher.verifier.path,
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
