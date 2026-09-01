import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, posix as posixPath, relative, resolve, sep } from "node:path";
import { TextDecoder } from "node:util";

const ATTESTATION = "RELEASE_ATTESTATION.json";
const MANIFEST = "MANIFEST.sha256";
const REQUIRED_ENTRYPOINTS = [
  "./SKILL.md",
  "./bin/mister-clean.js",
  "./dist/public.js",
  "./dist/stdio.js",
];
const EXPECTED_SCOPE = {
  covers: "own_package_regular_file_bytes",
  excludes: [
    "registry_publication_provenance",
    "dependency_resolution_graph",
    "filesystem_mode_bits_xattrs_and_timestamps",
    "release_attestation_self_bytes",
    "claimed_source_authenticity",
  ],
};
export const ORIGIN_AUTHENTICITY = Object.freeze({
  status: "not_established_by_this_receipt",
  prerequisite: "operator_trusted_capsule_origin",
  excludes: Object.freeze([
    "git_remote_identity",
    "tag_signature",
    "ci_run_identity",
    "artifact_transport_authenticity",
  ]),
});
const FORBIDDEN_ATTESTATION_KEYS = new Set([
  "dist", "integrity", "npm_integrity", "npm_shasum", "npm_shasum_sha1",
  "npm_tarball", "published_at", "registry", "shasum", "tarball",
  "tarball_integrity", "tarball_sha256", "url",
]);
const TAR_BLOCK_BYTES = 512;
const MAX_UNCOMPRESSED_ARCHIVE_BYTES = 512 * 1024 * 1024;
const UTF8_FATAL = new TextDecoder("utf-8", { fatal: true });

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, path) {
  if (!isRecord(value)) throw new Error(`${path}: required object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${path}: expected exact keys ${wanted.join(", ")}`);
  }
  return value;
}

function collectForbiddenKeys(value, path = "$") {
  if (Array.isArray(value)) return value.flatMap((entry, index) => collectForbiddenKeys(entry, `${path}[${index}]`));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(FORBIDDEN_ATTESTATION_KEYS.has(key) ? [`${path}.${key}`] : []),
    ...collectForbiddenKeys(child, `${path}.${key}`),
  ]);
}

function parseTarOctal(header, start, end, label, allowBlank = false) {
  const field = header.subarray(start, end);
  if ((field[0] & 0x80) !== 0) throw new Error(`archive uses unsupported base-256 ${label}`);
  const text = field.toString("ascii").replaceAll("\0", "").trim();
  if (text === "" && allowBlank) return 0;
  if (!/^[0-7]+$/u.test(text)) throw new Error(`archive member has an invalid ${label} field`);
  return Number.parseInt(text, 8);
}

function parseTarSize(header) {
  return parseTarOctal(header, 124, 136, "member size");
}

function parseTarChecksum(header) {
  const field = header.subarray(148, 156);
  if ((field[0] & 0x80) !== 0) throw new Error("archive uses unsupported base-256 checksums");
  const text = field.toString("ascii").replaceAll("\0", "").trim();
  if (!/^[0-7]+$/u.test(text)) throw new Error("archive member has an invalid checksum field");
  return Number.parseInt(text, 8);
}

function assertTarChecksum(header) {
  const expected = parseTarChecksum(header);
  let observed = 0;
  for (let index = 0; index < header.length; index += 1) {
    observed += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  if (observed !== expected) {
    throw new Error(`archive member checksum mismatch: expected ${expected}, observed ${observed}`);
  }
}

function decodeTarField(field, label) {
  const nul = field.indexOf(0);
  const content = nul < 0 ? field : field.subarray(0, nul);
  if (nul >= 0 && field.subarray(nul).some((byte) => byte !== 0)) {
    throw new Error(`archive ${label} contains bytes after its NUL terminator`);
  }
  try {
    return UTF8_FATAL.decode(content);
  } catch {
    throw new Error(`archive ${label} is not valid UTF-8`);
  }
}

function canonicalArchivePath(raw, type) {
  if (raw.length === 0) throw new Error("archive member has an empty path");
  if (/[\u0000-\u001f\u007f]/u.test(raw)) throw new Error(`archive member contains a control character: ${JSON.stringify(raw)}`);
  if (isAbsolute(raw) || raw.includes("\\")) throw new Error(`unsafe archive member: ${JSON.stringify(raw)}`);
  if (type === "file" && raw.endsWith("/")) throw new Error(`regular archive member has a directory path: ${JSON.stringify(raw)}`);
  const path = type === "directory" && raw.endsWith("/") ? raw.slice(0, -1) : raw;
  if (path.normalize("NFC") !== path) {
    throw new Error(`archive member path is not Unicode NFC: ${JSON.stringify(raw)}`);
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`non-canonical archive member: ${JSON.stringify(raw)}`);
  }
  if (posixPath.normalize(path) !== path) throw new Error(`non-canonical archive member: ${JSON.stringify(raw)}`);
  if (segments.some((segment) => segment.startsWith("._"))) {
    throw new Error(`archive contains forbidden AppleDouble member: ${JSON.stringify(raw)}`);
  }
  if (path !== "package" && !path.startsWith("package/")) {
    throw new Error(`archive member escapes package root: ${JSON.stringify(raw)}`);
  }
  return path;
}

function asciiCaseFold(value) {
  return value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
}

/** Authoritative raw USTAR census over one already-custodied byte string. */
function inspectRawUstarBytes(archiveBytes) {
  const tar = gunzipSync(archiveBytes, { maxOutputLength: MAX_UNCOMPRESSED_ARCHIVE_BYTES });
  const members = [];
  const seen = new Set();
  const semanticPaths = new Map();
  let offset = 0;
  let terminated = false;
  while (offset + TAR_BLOCK_BYTES <= tar.length) {
    const header = tar.subarray(offset, offset + TAR_BLOCK_BYTES);
    if (header.every((byte) => byte === 0)) {
      if (offset + (2 * TAR_BLOCK_BYTES) > tar.length
        || !tar.subarray(offset + TAR_BLOCK_BYTES, offset + (2 * TAR_BLOCK_BYTES)).every((byte) => byte === 0)) {
        throw new Error("archive is missing the required two-block zero terminator");
      }
      if (!tar.subarray(offset + (2 * TAR_BLOCK_BYTES)).every((byte) => byte === 0)) {
        throw new Error("archive contains non-zero bytes after its terminator");
      }
      terminated = true;
      break;
    }
    assertTarChecksum(header);
    if (!header.subarray(257, 263).equals(Buffer.from("ustar\0", "ascii"))
      || !header.subarray(263, 265).equals(Buffer.from("00", "ascii"))) {
      throw new Error("archive member is not canonical USTAR");
    }
    parseTarOctal(header, 100, 108, "mode");
    parseTarOctal(header, 108, 116, "uid", true);
    parseTarOctal(header, 116, 124, "gid", true);
    parseTarOctal(header, 136, 148, "mtime", true);
    parseTarOctal(header, 329, 337, "device major", true);
    parseTarOctal(header, 337, 345, "device minor", true);
    const rawType = header[156];
    const type = rawType === 0 || rawType === 0x30
      ? "file"
      : rawType === 0x35
        ? "directory"
        : null;
    if (type === null) {
      const label = rawType === 0x78 || rawType === 0x67
        ? "PAX metadata"
        : rawType === 0x4c || rawType === 0x4b
          ? "GNU long-name metadata"
          : `non-regular member type ${JSON.stringify(String.fromCharCode(rawType))}`;
      throw new Error(`archive contains ${label}`);
    }
    const name = decodeTarField(header.subarray(0, 100), "member name");
    if (decodeTarField(header.subarray(157, 257), "link name") !== "") {
      throw new Error("regular and directory archive members must not carry a link target");
    }
    const prefix = decodeTarField(header.subarray(345, 500), "member prefix");
    const path = canonicalArchivePath(prefix === "" ? name : `${prefix}/${name}`, type);
    if (seen.has(path)) throw new Error(`duplicate archive member: ${JSON.stringify(path)}`);
    seen.add(path);
    const semanticPath = asciiCaseFold(path.normalize("NFC"));
    const collision = semanticPaths.get(semanticPath);
    if (collision !== undefined) {
      throw new Error(`archive member path collision: ${JSON.stringify(collision)} and ${JSON.stringify(path)}`);
    }
    semanticPaths.set(semanticPath, path);
    const size = parseTarSize(header);
    if (type === "directory" && size !== 0) throw new Error(`archive directory has a non-zero payload: ${JSON.stringify(path)}`);
    const payloadStart = offset + TAR_BLOCK_BYTES;
    const payloadEnd = payloadStart + size;
    const paddedEnd = payloadStart + Math.ceil(size / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES;
    if (payloadEnd > tar.length || paddedEnd > tar.length) throw new Error("archive member payload exceeds the archive boundary");
    if (!tar.subarray(payloadEnd, paddedEnd).every((byte) => byte === 0)) {
      throw new Error(`archive member has non-zero payload padding: ${JSON.stringify(path)}`);
    }
    const payload = Buffer.from(tar.subarray(payloadStart, payloadEnd));
    members.push(Object.freeze({
      path,
      type,
      size,
      payload,
      payload_sha256: type === "file" ? sha256Bytes(payload) : null,
    }));
    offset = paddedEnd;
  }
  if (!terminated) throw new Error("archive is missing the required two-block zero terminator");
  if (!seen.has("package/package.json")) throw new Error("archive is missing package/package.json");
  return Object.freeze(members);
}

function publicRawMembers(members) {
  return Object.freeze(members.map(({ path, type, size, payload_sha256 }) => Object.freeze({
    path,
    type,
    size,
    payload_sha256,
  })));
}

export function releaseArchiveToolEnvironment(custodyPath, cwd = dirname(custodyPath)) {
  const custodyDirectory = dirname(resolve(custodyPath));
  const workingDirectory = resolve(cwd);
  return Object.freeze({
    ...(typeof process.env.PATH === "string" ? { PATH: process.env.PATH } : {}),
    COPYFILE_DISABLE: "1",
    COPY_EXTENDED_ATTRIBUTES_DISABLE: "1",
    HOME: custodyDirectory,
    TMPDIR: custodyDirectory,
    TMP: custodyDirectory,
    TEMP: custodyDirectory,
    PWD: workingDirectory,
    OLDPWD: workingDirectory,
    INIT_CWD: workingDirectory,
    LANG: "C",
    LC_ALL: "C",
    TZ: "UTC",
    NO_COLOR: "1",
  });
}

function sameOpenedFile(before, after) {
  return before.dev === after.dev
    && before.ino === after.ino
    && before.size === after.size
    && before.mtimeNs === after.mtimeNs
    && before.ctimeNs === after.ctimeNs
    && before.nlink === after.nlink;
}

/**
 * Read a caller-named archive exactly once, close that descriptor, and move all
 * subsequent authority to a private O_EXCL custody copy of those exact bytes.
 */
export function acquireReleaseArchiveCustody(archive) {
  const source = isAbsolute(archive) ? archive : join(process.cwd(), archive);
  const descriptor = openSync(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let bytes;
  let before;
  try {
    before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n) {
      throw new Error("release archive must be a unique regular file");
    }
    bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!sameOpenedFile(before, after) || BigInt(bytes.byteLength) !== after.size) {
      throw new Error("release archive changed while its bytes were acquired");
    }
  } finally {
    closeSync(descriptor);
  }

  const members = inspectRawUstarBytes(bytes);
  const directory = mkdtempSync(join(tmpdir(), "mister-clean-archive-custody-"));
  chmodSync(directory, 0o700);
  const path = join(directory, "release.tgz");
  const custodyDescriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o400);
  let custodyWriteFailure;
  try {
    writeFileSync(custodyDescriptor, bytes);
    fsyncSync(custodyDescriptor);
  } catch (error) {
    custodyWriteFailure = error;
  } finally {
    closeSync(custodyDescriptor);
  }
  if (custodyWriteFailure !== undefined) {
    rmSync(directory, { recursive: true, force: true });
    throw custodyWriteFailure;
  }
  chmodSync(path, 0o400);
  let disposed = false;
  const assertLive = () => {
    if (disposed) throw new Error("release archive custody has already been disposed");
  };
  const retainAs = (destination, mode = 0o444) => {
    assertLive();
    const output = openSync(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode);
    let retainFailure;
    try {
      writeFileSync(output, bytes);
      fsyncSync(output);
    } catch (error) {
      retainFailure = error;
    } finally {
      closeSync(output);
    }
    if (retainFailure !== undefined) {
      rmSync(destination, { force: true });
      throw retainFailure;
    }
    chmodSync(destination, mode);
    return destination;
  };
  const custody = {
    source,
    path,
    archive_sha256: sha256Bytes(bytes),
    size_bytes: bytes.byteLength,
    raw_members: publicRawMembers(members),
    readBytes() {
      assertLive();
      return Buffer.from(bytes);
    },
    retainAs,
    dispose() {
      if (disposed) return;
      disposed = true;
      rmSync(directory, { recursive: true, force: true });
    },
    _inspect() {
      assertLive();
      return inspectCustodiedArchive(path, bytes, members);
    },
  };
  return Object.freeze(custody);
}

function assertSafeCustodyListings(path, rawMembers) {
  const names = execFileSync("tar", ["-tzf", path], {
    encoding: "utf8",
    env: releaseArchiveToolEnvironment(path),
    stdio: ["ignore", "pipe", "pipe"],
  }).split("\n").filter(Boolean);
  const rows = execFileSync("tar", ["-tvzf", path], {
    encoding: "utf8",
    env: releaseArchiveToolEnvironment(path),
    stdio: ["ignore", "pipe", "pipe"],
  }).split("\n").filter(Boolean);
  if (rows.length !== names.length || names.length !== rawMembers.length) {
    throw new Error("archive member listing differs from the authoritative raw USTAR census");
  }
  for (let index = 0; index < names.length; index += 1) {
    const row = rows[index];
    const listed = names[index];
    const member = rawMembers[index];
    if (!row || !listed || !member) throw new Error("archive member listing is incomplete");
    const listedPath = listed.endsWith("/") ? listed.slice(0, -1) : listed;
    if (listedPath !== member.path || row[0] !== (member.type === "file" ? "-" : "d")) {
      throw new Error(`platform archive listing disagrees at member ${index}`);
    }
  }
  return rawMembers;
}

/** Compatibility wrapper. New release flows should retain one custody object. */
export function inspectRawUstarMembers(archive) {
  const custody = acquireReleaseArchiveCustody(archive);
  try {
    return custody.raw_members;
  } finally {
    custody.dispose();
  }
}

/** Compatibility wrapper. New release flows should retain one custody object. */
export function assertSafeArchiveMembers(archive) {
  const custody = acquireReleaseArchiveCustody(archive);
  try {
    return assertSafeCustodyListings(custody.path, custody.raw_members);
  } finally {
    custody.dispose();
  }
}

function regularFiles(root) {
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const path = toPosix(relative(root, absolute));
      const metadata = lstatSync(absolute);
      if (metadata.isSymbolicLink()) throw new Error(`extracted package contains symlink: ${path}`);
      if (metadata.isDirectory()) visit(absolute);
      else if (metadata.isFile()) files.push(path);
      else throw new Error(`extracted package contains non-regular entry: ${path}`);
    }
  }
  visit(root);
  return files.sort();
}

function parseManifest(text) {
  const entries = [];
  const paths = new Set();
  for (const [index, line] of text.trimEnd().split("\n").filter(Boolean).entries()) {
    const match = /^([0-9a-f]{64})  \.\/(.+)$/u.exec(line);
    if (!match) throw new Error(`${MANIFEST}:${index + 1}: invalid manifest row`);
    const [, sha256, path] = match;
    if (!path || isAbsolute(path) || path.includes("\\") || path.split("/").includes("..")) {
      throw new Error(`${MANIFEST}:${index + 1}: unsafe path`);
    }
    if (paths.has(path)) throw new Error(`${MANIFEST}:${index + 1}: duplicate path`);
    paths.add(path);
    entries.push({ path, sha256 });
  }
  return entries;
}

function validateAttestation(packageBytes, attestationBytes, entries, manifestBytes) {
  const packageData = exactKeys(
    JSON.parse(packageBytes.toString("utf8")),
    ["name", "version", "description", "type", "license", "bin", "exports", "files", "repository", "homepage", "bugs", "keywords", "engines", "scripts", "dependencies", "devDependencies"],
    "package.json",
  );
  if (packageData.name !== "@bradheitmann/mister-clean" || typeof packageData.version !== "string") {
    throw new Error("archive package identity is not @bradheitmann/mister-clean with a version");
  }

  const attestation = JSON.parse(attestationBytes.toString("utf8"));
  const forbidden = collectForbiddenKeys(attestation);
  if (forbidden.length) throw new Error(`${ATTESTATION}: forbidden publication fields ${forbidden.join(", ")}`);
  exactKeys(attestation, [
    "record_type", "schema_version", "package", "claimed_source", "claim_scope", "manifest", "required_entrypoints",
  ], ATTESTATION);
  if (attestation.record_type !== "mister-clean.release-attestation" || attestation.schema_version !== "1.1") {
    throw new Error(`${ATTESTATION}: unsupported record type or schema`);
  }
  exactKeys(attestation.package, ["name", "version"], `${ATTESTATION}.package`);
  if (attestation.package.name !== packageData.name || attestation.package.version !== packageData.version) {
    throw new Error(`${ATTESTATION}: package identity differs from package.json`);
  }
  const source = exactKeys(attestation.claimed_source, ["git_commit", "git_tag"], `${ATTESTATION}.claimed_source`);
  if (!/^[0-9a-f]{40}$/u.test(source.git_commit) || source.git_tag !== `v${packageData.version}`) {
    throw new Error(`${ATTESTATION}: invalid tagged source identity`);
  }
  if (JSON.stringify(attestation.claim_scope) !== JSON.stringify(EXPECTED_SCOPE)) {
    throw new Error(`${ATTESTATION}: unexpected claim scope`);
  }
  const manifest = exactKeys(attestation.manifest, ["path", "format", "entry_count", "sha256"], `${ATTESTATION}.manifest`);
  if (manifest.path !== `./${MANIFEST}`
    || manifest.format !== "sha256sum-v1-lf"
    || manifest.entry_count !== entries.length
    || manifest.sha256 !== sha256Bytes(manifestBytes)) {
    throw new Error(`${ATTESTATION}: manifest binding differs from archive bytes`);
  }
  if (!Array.isArray(attestation.required_entrypoints)) throw new Error(`${ATTESTATION}: required_entrypoints must be an array`);
  const entryByPath = new Map(entries.map((entry) => [`./${entry.path}`, entry.sha256]));
  const entrypointPaths = attestation.required_entrypoints.map((entry, index) => {
    exactKeys(entry, ["path", "sha256"], `${ATTESTATION}.required_entrypoints[${index}]`);
    if (entryByPath.get(entry.path) !== entry.sha256) {
      throw new Error(`${ATTESTATION}: required entrypoint differs from manifest ${String(entry.path)}`);
    }
    return entry.path;
  }).sort();
  if (JSON.stringify(entrypointPaths) !== JSON.stringify([...REQUIRED_ENTRYPOINTS].sort())) {
    throw new Error(`${ATTESTATION}: required entrypoint set is incomplete`);
  }
  return {
    package: { name: packageData.name, version: packageData.version },
    claimed_source: source,
    claim_scope: attestation.claim_scope,
    origin_authenticity: ORIGIN_AUTHENTICITY,
    manifest: {
      path: manifest.path,
      format: manifest.format,
      entry_count: manifest.entry_count,
      sha256: manifest.sha256,
    },
  };
}

function rawArchiveClosure(members) {
  const files = new Map();
  const directories = new Set();
  for (const member of members) {
    if (member.type === "directory") directories.add(member.path);
    else files.set(member.path.slice("package/".length), member);
  }
  const manifestMember = files.get(MANIFEST);
  const attestationMember = files.get(ATTESTATION);
  const packageMember = files.get("package.json");
  if (!manifestMember) throw new Error(`archive is missing required ${MANIFEST}`);
  if (!attestationMember) throw new Error(`archive is missing required ${ATTESTATION}`);
  if (!packageMember) throw new Error("archive is missing package/package.json");

  const entries = parseManifest(manifestMember.payload.toString("utf8"));
  if (entries.some((entry) => entry.path === MANIFEST || entry.path === ATTESTATION)) {
    throw new Error(`${MANIFEST} must not enumerate itself or ${ATTESTATION}`);
  }
  const expectedFiles = new Set([...entries.map((entry) => entry.path), MANIFEST, ATTESTATION]);
  const actualFiles = new Set(files.keys());
  const unexpectedFiles = [...actualFiles].filter((path) => !expectedFiles.has(path)).sort();
  const missingFiles = [...expectedFiles].filter((path) => !actualFiles.has(path)).sort();
  if (unexpectedFiles.length || missingFiles.length) {
    throw new Error(`raw archive file set differs from manifest closure unexpected=${JSON.stringify(unexpectedFiles)} missing=${JSON.stringify(missingFiles)}`);
  }

  const expectedDirectories = new Set(["package"]);
  for (const path of expectedFiles) {
    const segments = path.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      expectedDirectories.add(`package/${segments.slice(0, index).join("/")}`);
    }
  }
  const unexpectedDirectories = [...directories].filter((path) => !expectedDirectories.has(path)).sort();
  const missingDirectories = [...expectedDirectories].filter((path) => !directories.has(path)).sort();
  if (unexpectedDirectories.length || missingDirectories.length) {
    throw new Error(`raw archive directory set differs from implied closure unexpected=${JSON.stringify(unexpectedDirectories)} missing=${JSON.stringify(missingDirectories)}`);
  }
  for (const entry of entries) {
    const member = files.get(entry.path);
    if (!member || member.payload_sha256 !== entry.sha256) {
      throw new Error(`raw archive payload digest mismatch for ${entry.path}`);
    }
  }
  const identity = validateAttestation(
    packageMember.payload,
    attestationMember.payload,
    entries,
    manifestMember.payload,
  );
  return Object.freeze({ entries: Object.freeze(entries), expectedFiles, identity });
}

function inspectCustodiedArchive(custodyPath, archiveBytes, members) {
  const closure = rawArchiveClosure(members);
  assertSafeCustodyListings(custodyPath, publicRawMembers(members));
  const temporary = mkdtempSync(join(tmpdir(), "mister-clean-release-contract-"));
  try {
    mkdirSync(join(temporary, "unpacked"));
    execFileSync("tar", ["-xzf", custodyPath, "-C", join(temporary, "unpacked")], {
      env: releaseArchiveToolEnvironment(custodyPath, temporary),
      stdio: "pipe",
    });
    const unpacked = join(temporary, "unpacked", "package");
    const expected = closure.expectedFiles;
    const actual = new Set(regularFiles(unpacked));
    const unexpected = [...actual].filter((path) => !expected.has(path)).sort();
    const missing = [...expected].filter((path) => !actual.has(path)).sort();
    if (unexpected.length || missing.length) {
      throw new Error(`archive tree mismatch unexpected=${JSON.stringify(unexpected)} missing=${JSON.stringify(missing)}`);
    }
    for (const entry of closure.entries) {
      if (sha256File(join(unpacked, entry.path)) !== entry.sha256) {
        throw new Error(`manifest digest mismatch for ${entry.path}`);
      }
    }
    if (sha256File(custodyPath) !== sha256Bytes(archiveBytes)) {
      throw new Error("private release archive custody changed during inspection");
    }
    return { archive_sha256: sha256Bytes(archiveBytes), ...closure.identity };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function inspectReleaseArchiveCustody(custody) {
  if (!custody || typeof custody._inspect !== "function") {
    throw new Error("inspectReleaseArchiveCustody requires live release archive custody");
  }
  return custody._inspect();
}

/** Compatibility wrapper. New release flows should retain one custody object. */
export function inspectReleaseArchive(archive) {
  const custody = acquireReleaseArchiveCustody(archive);
  try {
    return inspectReleaseArchiveCustody(custody);
  } finally {
    custody.dispose();
  }
}
