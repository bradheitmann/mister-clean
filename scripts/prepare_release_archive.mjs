import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  acquireReleaseArchiveCustody,
  inspectReleaseArchiveCustody,
  releaseArchiveToolEnvironment,
} from "./release_archive_contract.mjs";
import { createExternalPnpmArchive, createPortablePackageArchive } from "./release_capsule.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function usage() {
  console.error("usage: node scripts/prepare_release_archive.mjs [--destination <new-directory>]");
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

function assertSourceFileAtCommit(relativePath, commit) {
  const currentPath = join(root, relativePath);
  const committed = execFileSync(
    "git",
    ["--no-optional-locks", "-C", root, "show", `${commit}:${relativePath}`],
    {
      encoding: null,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const current = readFileSync(currentPath);
  if (createHash("sha256").update(current).digest("hex")
    !== createHash("sha256").update(committed).digest("hex")) {
    throw new Error(`release helper differs from claimed source ${commit}: ${relativePath}`);
  }
}

function sourceConsistency() {
  const output = execFileSync(
    "bun",
    [join(root, "scripts", "generate_release_attestation.mjs"), "--source-check", "--root", root, "--json"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const result = JSON.parse(output);
  if (result.status !== "pass" || !result.source?.git_commit) {
    throw new Error(`release source consistency failed: ${output}`);
  }
  for (const path of [
    "scripts/prepare_release_archive.mjs",
    "scripts/release_capsule.mjs",
    "scripts/verify_packed_cli.mjs",
    "scripts/publish_release_archive.mjs",
    "scripts/release_archive_contract.mjs",
  ]) assertSourceFileAtCommit(path, result.source.git_commit);
  return result;
}

function sourceTreeFingerprint(directory) {
  const records = [];
  function visit(absolute, relativePath) {
    for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const path = relativePath === "" ? entry.name : `${relativePath}/${entry.name}`;
      const fullPath = join(absolute, entry.name);
      const metadata = lstatSync(fullPath, { bigint: true });
      const common = {
        path,
        mode: metadata.mode.toString(),
        mtime_ns: metadata.mtimeNs.toString(),
        size: metadata.size.toString(),
      };
      if (metadata.isDirectory()) {
        records.push({ ...common, type: "directory" });
        visit(fullPath, path);
      } else if (metadata.isFile()) {
        records.push({ ...common, type: "file", sha256: sha256File(fullPath) });
      } else if (metadata.isSymbolicLink()) {
        records.push({ ...common, type: "symlink", target: readlinkSync(fullPath) });
      } else {
        throw new Error(`source checkout contains unsupported filesystem object: ${path}`);
      }
    }
  }
  visit(directory, "");
  return createHash("sha256").update(JSON.stringify(records)).digest("hex");
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function inside(parent, candidate) {
  const relation = relative(resolve(parent), resolve(candidate));
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}

function projectedRealpath(path) {
  let ancestor = resolve(path);
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) throw new Error(`cannot resolve an existing ancestor for ${path}`);
    ancestor = parent;
  }
  const canonicalAncestor = realpathSync(ancestor);
  return resolve(canonicalAncestor, relative(ancestor, resolve(path)));
}

function assertDestinationAllowed(requested) {
  if (requested) {
    if (!isAbsolute(requested)) throw new Error("--destination must be an absolute path");
    const destination = resolve(requested);
    if (inside(realpathSync(root), projectedRealpath(destination))) {
      throw new Error("release destination must resolve outside the source repository");
    }
  }
}

function makeDestination(requested, packageVersion) {
  if (requested) {
    const destination = resolve(requested);
    mkdirSync(destination, { recursive: false, mode: 0o700 });
    return destination;
  }
  const parent = join(tmpdir(), "mister-clean-releases");
  mkdirSync(parent, { recursive: true });
  return mkdtempSync(join(parent, `mister-clean-${packageVersion}-`));
}

const args = process.argv.slice(2);
const requestedDestination = option(args, "--destination");
if (args.length) {
  usage();
  process.exit(2);
}

const packageData = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assertDestinationAllowed(requestedDestination);
const sourceBeforeVerification = sourceConsistency();
const sourceTreeBefore = sourceTreeFingerprint(root);
const destination = makeDestination(requestedDestination, packageData.version);
const staging = mkdtempSync(join(tmpdir(), "mister-clean-pnpm-capsule-"));
let archivePath;
let capsuleAttestation;
let finalCustody;
try {
  const intermediate = createExternalPnpmArchive({
    sourceRoot: root,
    commit: sourceBeforeVerification.source.git_commit,
    staging,
  });
  const intermediateCustody = acquireReleaseArchiveCustody(intermediate);
  const unpacked = join(staging, "unpacked");
  mkdirSync(unpacked, { mode: 0o700 });
  try {
    execFileSync("tar", ["-xzf", intermediateCustody.path, "-C", unpacked], {
      env: releaseArchiveToolEnvironment(intermediateCustody.path, unpacked),
      stdio: "pipe",
    });
  } finally {
    intermediateCustody.dispose();
  }

  const capsuleOutput = execFileSync("bun", [
    join(root, "scripts", "generate_release_attestation.mjs"),
    "--capsule-write",
    "--root", join(unpacked, "package"),
    "--source-root", root,
    "--json",
  ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  capsuleAttestation = JSON.parse(capsuleOutput);
  if (capsuleAttestation.status !== "pass") {
    throw new Error(`release capsule attestation failed: ${capsuleOutput}`);
  }

  const archiveFile = basename(intermediate);
  rmSync(intermediate, { force: true });
  const candidateArchive = resolve(staging, archiveFile);
  createPortablePackageArchive({ packageParent: unpacked, archive: candidateArchive });
  finalCustody = acquireReleaseArchiveCustody(candidateArchive);
  try {
    inspectReleaseArchiveCustody(finalCustody);
  } catch (error) {
    finalCustody.dispose();
    finalCustody = undefined;
    throw error;
  }
  archivePath = resolve(destination, archiveFile);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
if (!archivePath || !sourceBeforeVerification || !capsuleAttestation || !finalCustody) {
  throw new Error("release capsule construction did not produce a complete result");
}
let verification;
let archiveSha256;
try {
  const verificationOutput = execFileSync(
    process.execPath,
    [join(root, "scripts", "verify_packed_cli.mjs"), "--archive", finalCustody.path],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  verification = JSON.parse(verificationOutput);
  if (verification.status !== "pass" || verification.archive_sha256 !== finalCustody.archive_sha256) {
    throw new Error(`release archive verification did not bind the custodied bytes: ${verificationOutput}`);
  }
  if (verification.claimed_source?.git_commit !== sourceBeforeVerification.source.git_commit
    || verification.claimed_source?.git_tag !== sourceBeforeVerification.source.git_tag) {
    throw new Error("release archive claimed source differs from the exact verified helper source");
  }
  if (JSON.stringify(verification.manifest) !== JSON.stringify(capsuleAttestation.manifest)) {
    throw new Error("release archive manifest identity differs from the exact pnpm-normalized capsule");
  }
  archiveSha256 = finalCustody.archive_sha256;
  finalCustody.retainAs(archivePath, 0o444);
const immutableArchive = lstatSync(archivePath);
if (!immutableArchive.isFile() || immutableArchive.isSymbolicLink() || immutableArchive.nlink !== 1) {
  throw new Error("verified release archive is not a unique regular file");
}
if ((immutableArchive.mode & 0o777) !== 0o444) {
  throw new Error("verified release archive did not become read-only");
}

const npmjsRegistry = "https://registry.npmjs.org/";
const archiveFile = basename(archivePath);
const scopedRegistryOverride = `--config.@bradheitmann:registry=${npmjsRegistry}`;
const publishArgv = [
  "publish", "--access", "public", "--registry", npmjsRegistry,
  scopedRegistryOverride,
  archiveFile,
];
const publisherSource = join(root, "scripts", "publish_release_archive.mjs");
const publisher = join(destination, "publish_release_archive.mjs");
copyFileSync(publisherSource, publisher, constants.COPYFILE_EXCL);
chmodSync(publisher, 0o444);
const publisherMetadata = lstatSync(publisher);
if (!publisherMetadata.isFile() || publisherMetadata.isSymbolicLink() || publisherMetadata.nlink !== 1
  || (publisherMetadata.mode & 0o777) !== 0o444) {
  throw new Error("retained publisher helper is not a unique read-only regular file");
}
if (sha256File(publisher) !== sha256File(publisherSource)) {
  throw new Error("retained publisher helper differs from the claimed-source helper bytes");
}
const verifierSource = join(root, "scripts", "release_archive_contract.mjs");
const verifier = join(destination, "release_archive_contract.mjs");
copyFileSync(verifierSource, verifier, constants.COPYFILE_EXCL);
chmodSync(verifier, 0o444);
const verifierMetadata = lstatSync(verifier);
if (!verifierMetadata.isFile() || verifierMetadata.isSymbolicLink() || verifierMetadata.nlink !== 1
  || (verifierMetadata.mode & 0o777) !== 0o444) {
  throw new Error("retained archive verifier is not a unique read-only regular file");
}
if (sha256File(verifier) !== sha256File(verifierSource)) {
  throw new Error("retained archive verifier differs from the claimed-source helper bytes");
}
const sourceAfterVerification = sourceConsistency();
if (sourceAfterVerification.source.git_commit !== sourceBeforeVerification.source.git_commit
  || sourceAfterVerification.source.git_tag !== sourceBeforeVerification.source.git_tag) {
  throw new Error("release source changed during archive verification and helper retention");
}
if (sourceTreeFingerprint(root) !== sourceTreeBefore) {
  throw new Error("release preparation mutated the source checkout, including an identical-byte rewrite");
}
const receiptPath = join(destination, "release-archive-receipt.json");
const receipt = {
  record_type: "mister-clean.release-archive-receipt",
  schema_version: "1.1",
  status: "verified_not_published",
  created_at: new Date().toISOString(),
  package: verification.package,
  claimed_source: verification.claimed_source,
  claim_scope: verification.claim_scope,
  origin_authenticity: verification.origin_authenticity,
  manifest: verification.manifest,
  archive: {
    path: archiveFile,
    created_absolute_path: archivePath,
    sha256: archiveSha256,
    size_bytes: statSync(archivePath).size,
    mode: "0444",
  },
  verification: {
    status: verification.status,
    checks: verification.checks,
  },
  publisher: {
    entrypoint: {
      path: basename(publisher),
      sha256: sha256File(publisher),
      size_bytes: publisherMetadata.size,
      mode: "0444",
    },
    verifier: {
      path: basename(verifier),
      sha256: sha256File(verifier),
      size_bytes: verifierMetadata.size,
      mode: "0444",
    },
  },
  publish: {
    status: "not_executed",
    tool: "pnpm",
    registry: npmjsRegistry,
    concurrency_policy: "single_authorized_publication_lane",
    cwd_policy: "system_temp_root_outside_package_project",
    argv: publishArgv,
    shell_command: `node ${shellQuote(`./${basename(publisher)}`)} --receipt ${shellQuote(`./${basename(receiptPath)}`)}`,
  },
};
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o444 });

console.log(JSON.stringify({
  ...receipt,
  receipt_path: receiptPath,
}, null, 2));
} finally {
  finalCustody.dispose();
}
