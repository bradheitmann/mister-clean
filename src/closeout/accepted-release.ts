import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";

export interface AcceptedReleaseFileObservation {
  readonly absolute: string;
  readonly relative: string;
  readonly kind: "file" | "directory" | "symlink" | "other";
}

/** The accepted-release boundary needs only this safe subset of FilePort. */
export interface AcceptedReleaseFilePort {
  readBytes(path: string): Promise<Uint8Array>;
  exists(path: string): Promise<boolean>;
  isFile(path: string): Promise<boolean>;
  realpath(path: string): Promise<string>;
  walk(root: string, options?: { readonly mode?: "repository" | "exact_package" }): Promise<readonly AcceptedReleaseFileObservation[]>;
}

export interface AcceptedReleaseDigestRef { path: string; sha256: string; }
export interface AcceptedReleaseFileRef { path: string; sha256: string; }
export interface AcceptedReleaseRecordV1 {
  record_type: "mister-clean.accepted-release";
  schema_version: "1.0";
  package_name: string;
  version: string;
  registry_integrity: string;
  archive: { path: string; byte_length: number; sha512: string; };
  installed_package_root: string;
  entrypoint: string;
  files: { package_json: AcceptedReleaseFileRef; skill: AcceptedReleaseFileRef; executable: AcceptedReleaseFileRef; manifest: AcceptedReleaseFileRef; };
  accepted_at: string;
  evidence_ref: AcceptedReleaseDigestRef;
}
export interface AcceptedReleaseBoundaryInput { readonly acceptedEvaluatorPath: string; readonly candidateRepoPath: string; readonly evaluator: unknown; readonly files: AcceptedReleaseFilePort; }
export interface AcceptedReleaseBoundaryResult { readonly errors: readonly string[]; readonly ok: boolean; }

type Json = Record<string, unknown>;
type ArchiveFile = { readonly path: string; readonly bytes: Uint8Array; readonly sha256: string; };
type Semver = { readonly major: number; readonly minor: number; readonly patch: number; readonly prerelease: readonly string[]; };

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SRI512 = /^sha512-[A-Za-z0-9+/]+={0,2}$/;
const utf8 = new TextDecoder("utf-8", { fatal: true });
// FilePort's repository walk intentionally omits these roots. An accepted
// release cannot rely on an unenumerable runtime tree as content authority.
const FORBIDDEN_PACKAGE_ROOTS = [".git", "node_modules", ".venv", "venv", ".cache", "cache"] as const;

const sha256 = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
const sha512 = (bytes: Uint8Array): string => createHash("sha512").update(bytes).digest("hex");
const sri512 = (bytes: Uint8Array): string => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const obj = (value: unknown): Json | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : undefined;
const iso = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value) && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && !Number.isNaN(Date.parse(value));
const safePath = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.trim() === value && !isAbsolute(value) && !value.includes("\\") && !value.split("/").includes("") && !value.split("/").includes("..") && value !== ".";
const inside = (root: string, candidate: string): boolean => { const path = relative(root, candidate); return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path)); };
const overlaps = (left: string, right: string): boolean => inside(left, right) || inside(right, left);

function exact(value: unknown, names: readonly string[], path: string, errors: string[]): Json | undefined {
  const record = obj(value);
  if (!record) { errors.push(`${path}: expected object`); return undefined; }
  const allowed = new Set(names);
  for (const key of Object.keys(record)) if (!allowed.has(key)) errors.push(`${path}.${key}: unexpected field`);
  for (const key of names) if (!(key in record)) errors.push(`${path}.${key}: missing field`);
  return record;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Json;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function parseRecord(value: unknown, errors: string[]): AcceptedReleaseRecordV1 | undefined {
  const record = exact(value, ["record_type", "schema_version", "package_name", "version", "registry_integrity", "archive", "installed_package_root", "entrypoint", "files", "accepted_at", "evidence_ref"], "$.accepted_release", errors);
  if (!record) return undefined;
  if (record.record_type !== "mister-clean.accepted-release") errors.push("$.accepted_release.record_type: expected mister-clean.accepted-release");
  if (record.schema_version !== "1.0") errors.push("$.accepted_release.schema_version: expected 1.0");
  if (typeof record.package_name !== "string" || record.package_name.length === 0) errors.push("$.accepted_release.package_name: required");
  if (typeof record.version !== "string" || !SEMVER.test(record.version)) errors.push("$.accepted_release.version: required exact SemVer");
  if (typeof record.registry_integrity !== "string" || !SRI512.test(record.registry_integrity)) errors.push("$.accepted_release.registry_integrity: required npm SHA-512 SRI");
  if (typeof record.installed_package_root !== "string" || !isAbsolute(record.installed_package_root)) errors.push("$.accepted_release.installed_package_root: required absolute path");
  if (!safePath(record.entrypoint)) errors.push("$.accepted_release.entrypoint: required safe package-relative path");
  if (!iso(record.accepted_at)) errors.push("$.accepted_release.accepted_at: required timezone-aware ISO timestamp");
  const archive = exact(record.archive, ["path", "byte_length", "sha512"], "$.accepted_release.archive", errors);
  if (archive) {
    if (typeof archive.path !== "string" || !isAbsolute(archive.path)) errors.push("$.accepted_release.archive.path: required absolute path");
    if (!Number.isSafeInteger(archive.byte_length) || Number(archive.byte_length) < 0) errors.push("$.accepted_release.archive.byte_length: required nonnegative safe integer");
    if (typeof archive.sha512 !== "string" || !HEX128.test(archive.sha512)) errors.push("$.accepted_release.archive.sha512: required lowercase SHA-512");
  }
  const files = exact(record.files, ["package_json", "skill", "executable", "manifest"], "$.accepted_release.files", errors);
  if (files) for (const name of ["package_json", "skill", "executable", "manifest"] as const) {
    const ref = exact(files[name], ["path", "sha256"], `$.accepted_release.files.${name}`, errors);
    if (!ref) continue;
    if (!safePath(ref.path)) errors.push(`$.accepted_release.files.${name}.path: required safe package-relative path`);
    if (typeof ref.sha256 !== "string" || !HEX64.test(ref.sha256)) errors.push(`$.accepted_release.files.${name}.sha256: required lowercase SHA-256`);
  }
  const evidence = exact(record.evidence_ref, ["path", "sha256"], "$.accepted_release.evidence_ref", errors);
  if (evidence) {
    if (typeof evidence.path !== "string" || !isAbsolute(evidence.path)) errors.push("$.accepted_release.evidence_ref.path: required absolute path");
    if (typeof evidence.sha256 !== "string" || !HEX64.test(evidence.sha256)) errors.push("$.accepted_release.evidence_ref.sha256: required lowercase SHA-256");
  }
  return record as unknown as AcceptedReleaseRecordV1;
}

interface RegistryEvidence { package_name: string; version: string; tarball_url: string; dist_integrity: string; archive: { sha512: string; byte_length: number; }; retrieved_at: string; }
function parseEvidence(value: unknown, errors: string[]): RegistryEvidence | undefined {
  const evidence = exact(value, ["record_type", "schema_version", "authority", "verdict", "package_name", "version", "tarball_url", "dist_integrity", "archive", "retrieved_at", "response", "response_sha256"], "$.accepted_release.evidence", errors);
  if (!evidence) return undefined;
  if (evidence.record_type !== "mister-clean.npm-registry-release-evidence") errors.push("$.accepted_release.evidence.record_type: expected npm registry release evidence");
  if (evidence.schema_version !== "1.0") errors.push("$.accepted_release.evidence.schema_version: expected 1.0");
  if (evidence.authority !== "npm_registry") errors.push("$.accepted_release.evidence.authority: expected npm_registry");
  if (evidence.verdict !== "accepted_release") errors.push("$.accepted_release.evidence.verdict: expected accepted_release");
  if (typeof evidence.package_name !== "string" || evidence.package_name.length === 0) errors.push("$.accepted_release.evidence.package_name: required");
  if (typeof evidence.version !== "string" || !SEMVER.test(evidence.version)) errors.push("$.accepted_release.evidence.version: required exact SemVer");
  let url: URL | undefined;
  try { url = new URL(typeof evidence.tarball_url === "string" ? evidence.tarball_url : ""); } catch { errors.push("$.accepted_release.evidence.tarball_url: required HTTPS npm registry URL"); }
  if (url && (url.protocol !== "https:" || url.hostname !== "registry.npmjs.org")) errors.push("$.accepted_release.evidence.tarball_url: required HTTPS npm registry URL");
  if (typeof evidence.dist_integrity !== "string" || !SRI512.test(evidence.dist_integrity)) errors.push("$.accepted_release.evidence.dist_integrity: required npm SHA-512 SRI");
  const archive = exact(evidence.archive, ["sha512", "byte_length"], "$.accepted_release.evidence.archive", errors);
  if (archive) {
    if (typeof archive.sha512 !== "string" || !HEX128.test(archive.sha512)) errors.push("$.accepted_release.evidence.archive.sha512: required lowercase SHA-512");
    if (!Number.isSafeInteger(archive.byte_length) || Number(archive.byte_length) < 0) errors.push("$.accepted_release.evidence.archive.byte_length: required nonnegative safe integer");
  }
  if (!iso(evidence.retrieved_at)) errors.push("$.accepted_release.evidence.retrieved_at: required timezone-aware ISO timestamp");
  const response = exact(evidence.response, ["name", "version", "dist"], "$.accepted_release.evidence.response", errors);
  const dist = response ? exact(response.dist, ["tarball", "integrity"], "$.accepted_release.evidence.response.dist", errors) : undefined;
  if (response && (response.name !== evidence.package_name || response.version !== evidence.version)) errors.push("$.accepted_release.evidence.response: package/version do not bind registry response");
  if (dist && (dist.tarball !== evidence.tarball_url || dist.integrity !== evidence.dist_integrity)) errors.push("$.accepted_release.evidence.response.dist: tarball/integrity do not bind registry response");
  if (typeof evidence.response_sha256 !== "string" || !HEX64.test(evidence.response_sha256)) errors.push("$.accepted_release.evidence.response_sha256: required lowercase SHA-256");
  else if (response && sha256(canonical(response)) !== evidence.response_sha256) errors.push("$.accepted_release.evidence.response_sha256: registry response digest mismatch");
  if (errors.length > 0) return undefined;
  return { package_name: evidence.package_name as string, version: evidence.version as string, tarball_url: evidence.tarball_url as string, dist_integrity: evidence.dist_integrity as string, archive: archive as unknown as { sha512: string; byte_length: number }, retrieved_at: evidence.retrieved_at as string };
}

export function acceptedReleaseRecordBytes(record: AcceptedReleaseRecordV1): string { return `${JSON.stringify(record, null, 2)}\n`; }

async function real(files: AcceptedReleaseFilePort, path: string, label: string, errors: string[]): Promise<string | undefined> { try { return await files.realpath(path); } catch { errors.push(`${label}: path does not exist`); return undefined; } }
async function bytes(files: AcceptedReleaseFilePort, path: string, label: string, errors: string[]): Promise<Uint8Array | undefined> { try { if (!await files.isFile(path)) { errors.push(`${label}: required regular file`); return undefined; } return await files.readBytes(path); } catch { errors.push(`${label}: required readable file`); return undefined; } }
async function installed(files: AcceptedReleaseFilePort, root: string, path: string, label: string, errors: string[]): Promise<string | undefined> { if (!safePath(path)) return undefined; const target = await real(files, resolve(root, path), label, errors); if (target && !inside(root, target)) { errors.push(`${label}: installed path escapes package root`); return undefined; } return target; }

function tarText(bytes: Uint8Array, offset: number, size: number): string { const field = bytes.slice(offset, offset + size); const end = field.indexOf(0); return new TextDecoder("ascii", { fatal: true }).decode(end === -1 ? field : field.slice(0, end)); }
function tarNumber(bytes: Uint8Array, offset: number, size: number): number | undefined { const text = tarText(bytes, offset, size).trim(); if (text === "") return 0; if (!/^[0-7]+$/.test(text)) return undefined; const number = Number.parseInt(text, 8); return Number.isSafeInteger(number) ? number : undefined; }
function checksum(header: Uint8Array): number { let value = 0; for (let i = 0; i < 512; i += 1) value += i >= 148 && i < 156 ? 32 : header[i]!; return value; }
function zeros(block: Uint8Array): boolean { return block.every((value) => value === 0); }
function archivePath(raw: string, directory: boolean, errors: string[]): string | undefined {
  if (!raw.startsWith("package/") || raw.startsWith("/") || raw.includes("\\")) { errors.push("$.accepted_release.archive: tar entry must be a normalized package/ path"); return undefined; }
  const result = raw.slice(8);
  if (directory && result === "") return "";
  if ((directory && !raw.endsWith("/")) || (!directory && raw.endsWith("/")) || !safePath(result)) { errors.push(`$.accepted_release.archive: unsafe tar entry ${JSON.stringify(raw)}`); return undefined; }
  return result;
}
function archiveFiles(input: Uint8Array, errors: string[]): Map<string, ArchiveFile> | undefined {
  let gzip: { buffer: Uint8Array; engine: { bytesWritten: number } };
  try { gzip = gunzipSync(input, { info: true }) as unknown as { buffer: Uint8Array; engine: { bytesWritten: number } }; } catch { errors.push("$.accepted_release.archive: invalid gzip stream"); return undefined; }
  if (gzip.engine.bytesWritten !== input.byteLength) { errors.push("$.accepted_release.archive: nonzero gzip trailing garbage"); return undefined; }
  const tar = gzip.buffer, output = new Map<string, ArchiveFile>(), seen = new Set<string>();
  let offset = 0;
  while (offset < tar.byteLength) {
    if (offset + 512 > tar.byteLength) { errors.push("$.accepted_release.archive: truncated tar header"); return undefined; }
    const header = tar.slice(offset, offset + 512);
    if (zeros(header)) {
      if (offset + 1024 > tar.byteLength || !zeros(tar.slice(offset + 512, offset + 1024))) { errors.push("$.accepted_release.archive: tar requires two zero terminator blocks"); return undefined; }
      for (let i = offset + 1024; i < tar.byteLength; i += 1) if (tar[i] !== 0) { errors.push("$.accepted_release.archive: nonzero tar trailing garbage"); return undefined; }
      return output;
    }
    const expected = tarNumber(header, 148, 8), size = tarNumber(header, 124, 12);
    if (expected === undefined || expected !== checksum(header)) { errors.push("$.accepted_release.archive: tar header checksum mismatch"); return undefined; }
    if (size === undefined) { errors.push("$.accepted_release.archive: unsupported tar size encoding"); return undefined; }
    const name = tarText(header, 0, 100), prefix = tarText(header, 345, 155), raw = prefix ? `${prefix}/${name}` : name;
    const type = header[156] === 0 ? "0" : String.fromCharCode(header[156]!);
    const directory = type === "5";
    if (type !== "0" && !directory) { errors.push(`$.accepted_release.archive: unsupported tar entry type ${JSON.stringify(type)}`); return undefined; }
    const path = archivePath(raw, directory, errors);
    if (path === undefined || seen.has(path)) { if (path !== undefined) errors.push(`$.accepted_release.archive: duplicate tar entry ${path}`); return undefined; }
    seen.add(path);
    const start = offset + 512, padded = Math.ceil(size / 512) * 512;
    if (start + padded > tar.byteLength) { errors.push("$.accepted_release.archive: truncated tar payload"); return undefined; }
    if (directory && size !== 0) { errors.push(`$.accepted_release.archive: directory ${path || "package"} has payload`); return undefined; }
    if (!directory) { const body = tar.slice(start, start + size); output.set(path, { path, bytes: body, sha256: sha256(body) }); }
    offset = start + padded;
  }
  errors.push("$.accepted_release.archive: missing tar terminator");
  return undefined;
}

async function walkedFiles(port: AcceptedReleaseFilePort, root: string, errors: string[]): Promise<Map<string, ArchiveFile>> {
  const output = new Map<string, ArchiveFile>();
  let rows: readonly AcceptedReleaseFileObservation[];
  try { rows = await port.walk(root, { mode: "exact_package" }); } catch { errors.push("$.accepted_release.installed_package_root: unable to walk installed package"); return output; }
  for (const row of rows) {
    if (!safePath(row.relative)) { errors.push(`$.accepted_release.installed_package_root: unsafe walked path ${JSON.stringify(row.relative)}`); continue; }
    if (row.kind === "directory") continue;
    if (row.kind !== "file") { errors.push(`$.accepted_release.installed_package_root: unsupported installed entry kind ${row.kind} at ${row.relative}`); continue; }
    const target = await real(port, row.absolute, "$.accepted_release.installed_package_root", errors);
    if (!target || !inside(root, target)) { if (target) errors.push("$.accepted_release.installed_package_root: installed path escapes package root"); continue; }
    const body = await bytes(port, target, "$.accepted_release.installed_package_root", errors);
    if (!body) continue;
    if (output.has(row.relative)) errors.push(`$.accepted_release.installed_package_root: duplicate walked path ${row.relative}`);
    else output.set(row.relative, { path: row.relative, bytes: body, sha256: sha256(body) });
  }
  return output;
}
function equals(actual: ReadonlyMap<string, ArchiveFile>, expected: ReadonlyMap<string, string>, label: string, errors: string[]): void {
  for (const [path, digest] of expected) { const file = actual.get(path); if (!file) errors.push(`${label}: missing file ${path}`); else if (file.sha256 !== digest) errors.push(`${label}: digest mismatch for ${path}`); }
  for (const path of actual.keys()) if (!expected.has(path)) errors.push(`${label}: unexpected file ${path}`);
}
function manifest(text: string, errors: string[]): Map<string, string> {
  const output = new Map<string, string>();
  for (const [index, line] of text.split("\n").entries()) {
    if (line === "") continue;
    const row = /^([0-9a-f]{64})  (.+)$/.exec(line);
    const rawPath = row?.[2];
    if (!row || typeof rawPath !== "string" || !rawPath.startsWith("./") || rawPath.slice(2).startsWith("./") || !safePath(rawPath.slice(2)) || rawPath.slice(2).split("/").includes(".")) {
      errors.push(`$.accepted_release.files.manifest: invalid canonical ./path entry at line ${index + 1}`);
      continue;
    }
    const path = rawPath.slice(2);
    if (output.has(path)) errors.push(`$.accepted_release.files.manifest: duplicate MANIFEST entry ${path}`);
    else output.set(path, row[1]!);
  }
  if (output.size === 0) errors.push("$.accepted_release.files.manifest: MANIFEST requires at least one entry");
  return output;
}
function semver(value: string): Semver { const match = SEMVER.exec(value); if (!match) throw new Error("invalid SemVer"); return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] ? match[4].split(".") : [] }; }
function compare(left: Semver, right: Semver): number {
  for (const key of ["major", "minor", "patch"] as const) if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  if (left.prerelease.length === 0 || right.prerelease.length === 0) return left.prerelease.length === right.prerelease.length ? 0 : left.prerelease.length === 0 ? 1 : -1;
  for (let i = 0; i < Math.max(left.prerelease.length, right.prerelease.length); i += 1) { const a = left.prerelease[i], b = right.prerelease[i]; if (a === undefined || b === undefined) return a === undefined ? -1 : 1; if (a === b) continue; const an = /^\d+$/.test(a), bn = /^\d+$/.test(b); if (an && bn) return Number(a) < Number(b) ? -1 : 1; if (an !== bn) return an ? -1 : 1; return a < b ? -1 : 1; }
  return 0;
}

function evaluatorValue(record: AcceptedReleaseRecordV1, field: string): unknown {
  if (field === "release_state") return "accepted_release";
  if (field === "skill_sha256") return record.files.skill.sha256;
  if (field === "executable_sha256") return record.files.executable.sha256;
  if (field === "manifest_sha256") return record.files.manifest.sha256;
  if (field === "resolved_package_root") return record.installed_package_root;
  if (field === "resolved_at") return record.accepted_at;
  return (record as unknown as Json)[field];
}

export async function verifyAcceptedReleaseBoundary(input: AcceptedReleaseBoundaryInput): Promise<AcceptedReleaseBoundaryResult> {
  const errors: string[] = [], evaluator = obj(input.evaluator);
  if (!evaluator) return { errors: ["$.mister_clean_evaluator: required selected Mister Clean evaluator"], ok: false };
  if (!isAbsolute(input.acceptedEvaluatorPath)) return { errors: ["$.accepted_release_ref.path: --accepted-evaluator requires an absolute path"], ok: false };
  if (!isAbsolute(input.candidateRepoPath)) return { errors: ["$.candidate_repo: required absolute candidate repository path"], ok: false };
  const [candidateRoot, recordPath] = await Promise.all([real(input.files, input.candidateRepoPath, "$.candidate_repo", errors), real(input.files, input.acceptedEvaluatorPath, "$.accepted_release_ref.path", errors)]);
  if (candidateRoot && (overlaps(candidateRoot, resolve(input.acceptedEvaluatorPath)) || (recordPath && overlaps(candidateRoot, recordPath)))) errors.push("$.accepted_release_ref.path: accepted-release record and candidate repository must not overlap");
  const recordBytes = recordPath ? await bytes(input.files, recordPath, "$.accepted_release_ref.path", errors) : undefined;
  const ref = obj(evaluator.accepted_release_ref);
  if (!ref) errors.push("$.accepted_release_ref: selected evaluator requires an accepted-release record reference");
  else {
    if (typeof ref.path !== "string" || !isAbsolute(ref.path)) errors.push("$.accepted_release_ref.path: selected evaluator requires an absolute accepted-release path");
    else { const selected = await real(input.files, ref.path, "$.accepted_release_ref.path", errors); if (selected && recordPath && selected !== recordPath) errors.push("$.accepted_release_ref.path: --accepted-evaluator does not match selected evaluator reference"); }
    if (typeof ref.sha256 !== "string" || !HEX64.test(ref.sha256)) errors.push("$.accepted_release_ref.sha256: required lowercase SHA-256");
    else if (recordBytes && sha256(recordBytes) !== ref.sha256) errors.push("$.accepted_release_ref.sha256: accepted-release record digest mismatch");
  }
  if (!recordBytes) return { errors, ok: false };
  let raw: unknown; try { raw = JSON.parse(utf8.decode(recordBytes)); } catch { return { errors: [...errors, "$.accepted_release_ref.path: required JSON accepted-release record"], ok: false }; }
  const parseErrors: string[] = [], record = parseRecord(raw, parseErrors); errors.push(...parseErrors); if (!record || parseErrors.length > 0) return { errors, ok: false };
  for (const field of ["package_name", "version", "release_state", "registry_integrity", "skill_sha256", "executable_sha256", "manifest_sha256", "entrypoint", "resolved_package_root", "resolved_at"]) if (evaluator[field] !== evaluatorValue(record, field)) errors.push(`$.mister_clean_evaluator.${field}: does not match accepted-release record`);
  const evaluatorEvidence = obj(evaluator.evidence_ref); if (!evaluatorEvidence || evaluatorEvidence.path !== record.evidence_ref.path || evaluatorEvidence.sha256 !== record.evidence_ref.sha256) errors.push("$.mister_clean_evaluator.evidence_ref: does not match accepted-release record");
  const packageRoot = isAbsolute(record.installed_package_root) ? await real(input.files, record.installed_package_root, "$.accepted_release.installed_package_root", errors) : undefined;
  const archivePath = isAbsolute(record.archive.path) ? await real(input.files, record.archive.path, "$.accepted_release.archive.path", errors) : undefined;
  const evidencePath = isAbsolute(record.evidence_ref.path) ? await real(input.files, record.evidence_ref.path, "$.accepted_release.evidence_ref.path", errors) : undefined;
  if (candidateRoot && (overlaps(candidateRoot, resolve(record.installed_package_root)) || (packageRoot && overlaps(candidateRoot, packageRoot)))) errors.push("$.accepted_release.installed_package_root: accepted package and candidate repository must not overlap");
  if (candidateRoot && (overlaps(candidateRoot, resolve(record.archive.path)) || (archivePath && overlaps(candidateRoot, archivePath)))) errors.push("$.accepted_release.archive.path: retained archive and candidate repository must not overlap");
  if (candidateRoot && (overlaps(candidateRoot, resolve(record.evidence_ref.path)) || (evidencePath && overlaps(candidateRoot, evidencePath)))) errors.push("$.accepted_release.evidence_ref.path: acceptance evidence and candidate repository must not overlap");
  if (candidateRoot) {
    const candidatePath = await installed(input.files, candidateRoot, "package.json", "$.candidate_repo.package_json", errors), candidateBytes = candidatePath ? await bytes(input.files, candidatePath, "$.candidate_repo.package_json", errors) : undefined;
    if (candidateBytes) try { const candidate = obj(JSON.parse(utf8.decode(candidateBytes))); if (!candidate || typeof candidate.version !== "string" || !SEMVER.test(candidate.version)) errors.push("$.candidate_repo.package_json.version: required exact SemVer"); else if (compare(semver(record.version), semver(candidate.version)) >= 0) errors.push("$.accepted_release.version: must be strictly lower than candidate package.json version"); } catch { errors.push("$.candidate_repo.package_json: required JSON object"); }
  }
  const now = Date.now(); if (Date.parse(record.accepted_at) > now) errors.push("$.accepted_release.accepted_at: must not be in the future at validation time");
  let archive: Map<string, ArchiveFile> | undefined;
  if (archivePath) { const value = await bytes(input.files, archivePath, "$.accepted_release.archive.path", errors); if (value) { if (value.byteLength !== record.archive.byte_length) errors.push("$.accepted_release.archive.byte_length: retained archive byte length mismatch"); if (sha512(value) !== record.archive.sha512) errors.push("$.accepted_release.archive.sha512: retained archive digest mismatch"); if (sri512(value) !== record.registry_integrity) errors.push("$.accepted_release.registry_integrity: npm SHA-512 SRI does not match retained archive bytes"); archive = archiveFiles(value, errors); } }
  if (evidencePath) { const value = await bytes(input.files, evidencePath, "$.accepted_release.evidence_ref.path", errors); if (value) { if (sha256(value) !== record.evidence_ref.sha256) errors.push("$.accepted_release.evidence_ref.sha256: evidence digest mismatch"); else { let rawEvidence: unknown; try { rawEvidence = JSON.parse(utf8.decode(value)); } catch { errors.push("$.accepted_release.evidence_ref.path: required JSON registry evidence"); } const evidenceErrors: string[] = [], evidence = parseEvidence(rawEvidence, evidenceErrors); errors.push(...evidenceErrors); if (evidence) { if (evidence.package_name !== record.package_name || evidence.version !== record.version) errors.push("$.accepted_release.evidence: package/version do not match accepted release"); if (evidence.dist_integrity !== record.registry_integrity) errors.push("$.accepted_release.evidence: SRI does not match accepted release"); if (evidence.archive.sha512 !== record.archive.sha512 || evidence.archive.byte_length !== record.archive.byte_length) errors.push("$.accepted_release.evidence: archive does not match accepted release"); if (Date.parse(evidence.retrieved_at) > now) errors.push("$.accepted_release.evidence.retrieved_at: must not be in the future at validation time"); if (Date.parse(evidence.retrieved_at) > Date.parse(record.accepted_at)) errors.push("$.accepted_release.accepted_at: must not precede registry retrieval evidence"); } } }
  }
  if (!packageRoot || !archive) return { errors, ok: false };
  for (const root of FORBIDDEN_PACKAGE_ROOTS) {
    if ([...archive.keys()].some((path) => path === root || path.startsWith(`${root}/`))) errors.push(`$.accepted_release.archive: forbidden package root ${root}`);
    if (await input.files.exists(resolve(packageRoot, root))) errors.push(`$.accepted_release.installed_package_root: forbidden package root ${root}`);
  }
  const tree = await walkedFiles(input.files, packageRoot, errors), allArchive = new Map<string, string>([...archive].map(([path, file]) => [path, file.sha256]));
  equals(tree, allArchive, "$.accepted_release.installed_package_root", errors);
  for (const name of ["package_json", "skill", "executable", "manifest"] as const) if (archive.get(record.files[name].path)?.sha256 !== record.files[name].sha256) errors.push(`$.accepted_release.files.${name}: archive does not match declared file`);
  const manifestFile = archive.get(record.files.manifest.path);
  if (!manifestFile) errors.push("$.accepted_release.files.manifest: archive does not contain MANIFEST");
  else {
    let entries: Map<string, string> | undefined; try { entries = manifest(utf8.decode(manifestFile.bytes), errors); } catch { errors.push("$.accepted_release.files.manifest: MANIFEST must be UTF-8"); }
    if (entries) { if (entries.has(record.files.manifest.path)) errors.push("$.accepted_release.files.manifest: MANIFEST must not self-enumerate"); const payload = new Map(allArchive); payload.delete(record.files.manifest.path); const listed = new Map([...entries].map(([path, digest]) => [path, { path, bytes: new Uint8Array(), sha256: digest }])); equals(listed, payload, "$.accepted_release.files.manifest", errors); for (const name of ["package_json", "skill", "executable"] as const) if (entries.get(record.files[name].path) !== record.files[name].sha256) errors.push(`$.accepted_release.files.manifest: missing or mismatched declared ${name} entry`); }
  }
  if (record.entrypoint !== record.files.executable.path) errors.push("$.accepted_release.entrypoint: must equal declared executable path");
  await installed(input.files, packageRoot, record.entrypoint, "$.accepted_release.entrypoint", errors);
  const packageBytes = tree.get(record.files.package_json.path)?.bytes;
  if (packageBytes) try {
    const pkg = obj(JSON.parse(utf8.decode(packageBytes)));
    if (!pkg) errors.push("$.accepted_release.files.package_json: package.json must contain an object");
    else {
      if (pkg.name !== record.package_name) errors.push("$.accepted_release.files.package_json: package.json name does not match accepted release");
      if (pkg.version !== record.version) errors.push("$.accepted_release.files.package_json: package.json version does not match accepted release");
      const binObject = obj(pkg.bin);
      const bin = typeof pkg.bin === "string" ? [pkg.bin] : binObject ? Object.values(binObject).filter((value): value is string => typeof value === "string") : [];
      if (!bin.map((value) => value.startsWith("./") ? value.slice(2) : value).includes(record.entrypoint)) errors.push("$.accepted_release.entrypoint: installed package.json bin does not expose accepted entrypoint");
    }
  } catch { errors.push("$.accepted_release.files.package_json: required JSON object"); }
  return { errors, ok: errors.length === 0 };
}
