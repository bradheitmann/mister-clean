import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { nodeFilePort } from "./bundle.js";
import { acceptedReleaseRecordBytes, verifyAcceptedReleaseBoundary, type AcceptedReleaseRecordV1 } from "./accepted-release.js";

const roots: string[] = [];
const digest = (bytes: string | Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const sha512 = (bytes: string | Uint8Array): string => createHash("sha512").update(bytes).digest("hex");
const sri = (bytes: string | Uint8Array): string => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const tarballUrl = "https://registry.npmjs.org/@example%2fmister-clean-dogfood/-/mister-clean-dogfood-1.2.3.tgz";
const execFileAsync = promisify(execFile);

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

interface TarEntry { readonly path: string; readonly bytes: Uint8Array; readonly type?: "0" | "1" | "2" | "5"; }
function octal(value: number, width: number): string { return `${value.toString(8).padStart(width - 1, "0")}\0`; }
function header(entry: TarEntry): Buffer {
  const block = Buffer.alloc(512);
  block.write(entry.path, 0, "ascii");
  block.write(octal(0o644, 8), 100, "ascii");
  block.write(octal(0, 8), 108, "ascii"); block.write(octal(0, 8), 116, "ascii");
  block.write(octal(entry.type === "5" ? 0 : entry.bytes.byteLength, 12), 124, "ascii");
  block.write(octal(0, 12), 136, "ascii"); block.fill(32, 148, 156);
  block[156] = (entry.type ?? "0").charCodeAt(0); block.write("ustar\0", 257, "ascii"); block.write("00", 263, "ascii");
  let sum = 0; for (const value of block) sum += value;
  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
  return block;
}
function tgz(entries: readonly TarEntry[], trailing = Buffer.alloc(0)): Uint8Array {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    chunks.push(header(entry));
    if (entry.type !== "5") { const body = Buffer.from(entry.bytes); chunks.push(body); const padding = (512 - (body.byteLength % 512)) % 512; if (padding > 0) chunks.push(Buffer.alloc(padding)); }
  }
  chunks.push(Buffer.alloc(1024), trailing);
  return gzipSync(Buffer.concat(chunks));
}
async function put(path: string, bytes: string | Uint8Array): Promise<void> { await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); }

interface Fixture {
  readonly candidate: string;
  readonly archivePath: string;
  readonly evidencePath: string;
  readonly packageRoot: string;
  readonly recordPath: string;
  readonly files: Map<string, string>;
  readonly evaluator: Record<string, unknown>;
  readonly record: AcceptedReleaseRecordV1;
  sync(): Promise<void>;
}

async function fixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "mister-clean-accepted-release-")); roots.push(root);
  const candidate = join(root, "candidate"), accepted = join(root, "accepted"), packageRoot = join(accepted, "installed", "package");
  const archivePath = join(accepted, "archives", "mister-clean-1.2.3.tgz"), evidencePath = join(accepted, "evidence", "registry.json"), recordPath = join(accepted, "records", "accepted-release.json");
  const packageJson = `${JSON.stringify({ name: "@example/mister-clean-dogfood", version: "1.2.3", bin: { "mister-clean": "bin/mister-clean.js" } }, null, 2)}\n`;
  const files = new Map<string, string>([["package.json", packageJson], ["SKILL.md", "# Accepted skill\n"], ["bin/mister-clean.js", "#!/usr/bin/env node\nconsole.log('accepted');\n"], ["dist/index.js", "export const accepted = true;\n"], ["vendor/runtime.js", "export const vendored = true;\n"]]);
  files.set("MANIFEST.sha256", [...files].map(([path, body]) => `${digest(body)}  ./${path}`).join("\n") + "\n");
  const record: AcceptedReleaseRecordV1 = {
    record_type: "mister-clean.accepted-release", schema_version: "1.0", package_name: "@example/mister-clean-dogfood", version: "1.2.3", registry_integrity: "",
    archive: { path: archivePath, byte_length: 0, sha512: "" }, installed_package_root: packageRoot, entrypoint: "bin/mister-clean.js",
    files: { package_json: { path: "package.json", sha256: digest(files.get("package.json")!) }, skill: { path: "SKILL.md", sha256: digest(files.get("SKILL.md")!) }, executable: { path: "bin/mister-clean.js", sha256: digest(files.get("bin/mister-clean.js")!) }, manifest: { path: "MANIFEST.sha256", sha256: digest(files.get("MANIFEST.sha256")!) } },
    accepted_at: "2026-08-26T20:00:00.000Z", evidence_ref: { path: evidencePath, sha256: "" },
  };
  const evaluator: Record<string, unknown> = { package_name: record.package_name, version: record.version, release_state: "accepted_release", registry_integrity: "", skill_sha256: record.files.skill.sha256, executable_sha256: record.files.executable.sha256, manifest_sha256: record.files.manifest.sha256, entrypoint: record.entrypoint, resolved_package_root: packageRoot, resolved_at: record.accepted_at, evidence_ref: record.evidence_ref, accepted_release_ref: { path: recordPath, sha256: "" } };
  const value: Fixture = {
    candidate, archivePath, evidencePath, packageRoot, recordPath, files, evaluator, record,
    async sync() {
      const archive = tgz([...files].map(([path, body]) => ({ path: `package/${path}`, bytes: Buffer.from(body) })));
      record.archive.byte_length = archive.byteLength; record.archive.sha512 = sha512(archive); record.registry_integrity = sri(archive); evaluator.registry_integrity = record.registry_integrity;
      for (const [path, body] of files) await put(join(packageRoot, path), body);
      await put(archivePath, archive);
      const response = { name: record.package_name, version: record.version, dist: { tarball: tarballUrl, integrity: record.registry_integrity } };
      const evidence = JSON.stringify({ record_type: "mister-clean.npm-registry-release-evidence", schema_version: "1.0", authority: "npm_registry", verdict: "accepted_release", package_name: record.package_name, version: record.version, tarball_url: tarballUrl, dist_integrity: record.registry_integrity, archive: { sha512: record.archive.sha512, byte_length: record.archive.byte_length }, retrieved_at: "2026-08-26T19:59:00.000Z", response, response_sha256: digest(canonical(response)) }, null, 2) + "\n";
      record.evidence_ref.sha256 = digest(evidence); evaluator.evidence_ref = record.evidence_ref; await put(evidencePath, evidence);
      const serialized = acceptedReleaseRecordBytes(record); await put(recordPath, serialized); (evaluator.accepted_release_ref as Record<string, unknown>).sha256 = digest(serialized);
    },
  };
  await mkdir(candidate, { recursive: true }); await put(join(candidate, "package.json"), `${JSON.stringify({ name: "candidate", version: "1.2.4" })}\n`); await value.sync();
  return value;
}
async function verify(value: Fixture) { return verifyAcceptedReleaseBoundary({ acceptedEvaluatorPath: value.recordPath, candidateRepoPath: value.candidate, evaluator: value.evaluator, files: nodeFilePort }); }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))); });

describe("accepted external Mister Clean release boundary", () => {
  it("accepts a synthetic retained npm tarball whose installed tree, dist/vendor files, and MANIFEST are exact", async () => {
    const value = await fixture(); await expect(verify(value)).resolves.toEqual({ errors: [], ok: true });
  });
  it("rejects installed archive drift and an extra runtime dependency", async () => {
    const value = await fixture(); await put(join(value.packageRoot, "SKILL.md"), "mutated\n"); await put(join(value.packageRoot, "node_modules", "x", "index.js"), "extra\n");
    const errors = (await verify(value)).errors.join("\n"); expect(errors).toMatch(/digest mismatch for SKILL\.md/); expect(errors).toMatch(/unexpected file node_modules\/x\/index\.js/);
  });
  it("rejects a MANIFEST missing an archive file", async () => {
    const value = await fixture(); value.files.set("MANIFEST.sha256", `${digest(value.files.get("package.json")!)}  ./package.json\n${digest(value.files.get("SKILL.md")!)}  ./SKILL.md\n`); value.record.files.manifest.sha256 = digest(value.files.get("MANIFEST.sha256")!); value.evaluator.manifest_sha256 = value.record.files.manifest.sha256; await value.sync();
    expect((await verify(value)).errors.join("\n")).toMatch(/manifest: missing file bin\/mister-clean\.js/);
  });
  it.each(["package/../escape", "package/\\backslash", "/package/absolute"]) ("rejects unsafe tar path %s", async (path) => {
    const value = await fixture(); const bad = tgz([{ path, bytes: Buffer.from("bad") }]); await put(value.archivePath, bad); value.record.archive.byte_length = bad.byteLength; value.record.archive.sha512 = sha512(bad); value.record.registry_integrity = sri(bad); value.evaluator.registry_integrity = value.record.registry_integrity; await value.sync(); await put(value.archivePath, bad);
    expect((await verify(value)).errors.join("\n")).toMatch(/tar entry|unsafe tar entry/);
  });
  it.each(["2", "1"] as const)("rejects tar link type %s", async (type) => {
    const value = await fixture(); const bad = tgz([{ path: "package/link", bytes: Buffer.alloc(0), type }]); await put(value.archivePath, bad); value.record.archive.byte_length = bad.byteLength; value.record.archive.sha512 = sha512(bad); value.record.registry_integrity = sri(bad); value.evaluator.registry_integrity = value.record.registry_integrity; await value.sync(); await put(value.archivePath, bad);
    expect((await verify(value)).errors.join("\n")).toMatch(/unsupported tar entry type/);
  });
  it("rejects nonzero trailing tar data", async () => {
    const value = await fixture(); const bad = tgz([{ path: "package/x", bytes: Buffer.from("x") }], Buffer.from([1])); await put(value.archivePath, bad); value.record.archive.byte_length = bad.byteLength; value.record.archive.sha512 = sha512(bad); value.record.registry_integrity = sri(bad); value.evaluator.registry_integrity = value.record.registry_integrity; await value.sync(); await put(value.archivePath, bad);
    expect((await verify(value)).errors.join("\n")).toMatch(/trailing garbage/);
  });
  it("rejects arbitrary or structurally no-op registry evidence", async () => {
    const value = await fixture(); const arbitrary = "{\"source\":\"npm-registry\",\"result\":\"accepted\"}\n"; await put(value.evidencePath, arbitrary); value.record.evidence_ref.sha256 = digest(arbitrary); value.evaluator.evidence_ref = value.record.evidence_ref; const serialized = acceptedReleaseRecordBytes(value.record); await put(value.recordPath, serialized); (value.evaluator.accepted_release_ref as Record<string, unknown>).sha256 = digest(serialized);
    expect((await verify(value)).errors.join("\n")).toMatch(/npm registry release evidence|missing field/);
  });
  it("rejects future accepted time and a version not strictly below the candidate", async () => {
    const value = await fixture(); value.record.accepted_at = "2999-01-01T00:00:00.000Z"; value.evaluator.resolved_at = value.record.accepted_at; value.record.version = "1.2.4"; value.evaluator.version = value.record.version; const serialized = acceptedReleaseRecordBytes(value.record); await put(value.recordPath, serialized); (value.evaluator.accepted_release_ref as Record<string, unknown>).sha256 = digest(serialized);
    const errors = (await verify(value)).errors.join("\n"); expect(errors).toMatch(/strictly lower than candidate/); expect(errors).toMatch(/must not be in the future/);
  });
  it("rejects a forged accepted-release record digest", async () => {
    const value = await fixture(); (value.evaluator.accepted_release_ref as Record<string, unknown>).sha256 = "0".repeat(64); expect((await verify(value)).errors).toContain("$.accepted_release_ref.sha256: accepted-release record digest mismatch");
  });
  it("verifies the available retained published 6.3.0 archive without treating it as registry authentication", async () => {
    const archivePath = "/tmp/mister-clean-6.3.0-published.tgz";
    try { await access(archivePath); } catch { return; }
    const root = await mkdtemp(join(tmpdir(), "mister-clean-630-regression-")); roots.push(root);
    await execFileAsync("tar", ["-xzf", archivePath, "-C", root]);
    const packageRoot = join(root, "package"), candidate = join(root, "candidate"), recordPath = join(root, "record.json"), evidencePath = join(root, "evidence.json");
    const archive = await readFile(archivePath), packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as { name: string; version: string };
    const file = async (path: string) => digest(await readFile(join(packageRoot, path)));
    const record: AcceptedReleaseRecordV1 = { record_type: "mister-clean.accepted-release", schema_version: "1.0", package_name: packageJson.name, version: packageJson.version, registry_integrity: sri(archive), archive: { path: archivePath, byte_length: archive.byteLength, sha512: sha512(archive) }, installed_package_root: packageRoot, entrypoint: "bin/mister-clean.js", files: { package_json: { path: "package.json", sha256: await file("package.json") }, skill: { path: "SKILL.md", sha256: await file("SKILL.md") }, executable: { path: "bin/mister-clean.js", sha256: await file("bin/mister-clean.js") }, manifest: { path: "MANIFEST.sha256", sha256: await file("MANIFEST.sha256") } }, accepted_at: "2026-08-26T20:00:00.000Z", evidence_ref: { path: evidencePath, sha256: "" } };
    await put(join(candidate, "package.json"), JSON.stringify({ name: "candidate", version: "6.3.1" }));
    const response = { name: record.package_name, version: record.version, dist: { tarball: "https://registry.npmjs.org/@bradheitmann%2fmister-clean/-/mister-clean-6.3.0.tgz", integrity: record.registry_integrity } };
    const evidence = JSON.stringify({ record_type: "mister-clean.npm-registry-release-evidence", schema_version: "1.0", authority: "npm_registry", verdict: "accepted_release", package_name: record.package_name, version: record.version, tarball_url: response.dist.tarball, dist_integrity: record.registry_integrity, archive: { sha512: record.archive.sha512, byte_length: record.archive.byte_length }, retrieved_at: "2026-08-26T19:59:00.000Z", response, response_sha256: digest(canonical(response)) });
    record.evidence_ref.sha256 = digest(evidence); await put(evidencePath, evidence); const serialized = acceptedReleaseRecordBytes(record); await put(recordPath, serialized);
    const evaluator = { package_name: record.package_name, version: record.version, release_state: "accepted_release", registry_integrity: record.registry_integrity, skill_sha256: record.files.skill.sha256, executable_sha256: record.files.executable.sha256, manifest_sha256: record.files.manifest.sha256, entrypoint: record.entrypoint, resolved_package_root: record.installed_package_root, resolved_at: record.accepted_at, evidence_ref: record.evidence_ref, accepted_release_ref: { path: recordPath, sha256: digest(serialized) } };
    await expect(verifyAcceptedReleaseBoundary({ acceptedEvaluatorPath: recordPath, candidateRepoPath: candidate, evaluator, files: nodeFilePort })).resolves.toEqual({ errors: [], ok: true });
  });
});
