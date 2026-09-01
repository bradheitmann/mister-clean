#!/usr/bin/env bun

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  generateAttestedPackageManifest,
  RELEASE_ATTESTATION_FILE,
  checkReleaseSourceConsistency,
  createReleaseAttestation,
  releaseAttestationBytes,
  verifyReleaseAttestation,
} from "../src/attestation.ts";

function usage() {
  console.error("usage: bun scripts/generate_release_attestation.mjs <--source-check|--check|--write|--capsule-write> [--root <path>] [--source-root <path>] [--json]");
}

function removeFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function removeOption(args, option) {
  const index = args.indexOf(option);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  args.splice(index, 2);
  return value;
}

const args = process.argv.slice(2);
const sourceCheck = removeFlag(args, "--source-check");
const check = removeFlag(args, "--check");
const write = removeFlag(args, "--write");
const capsuleWrite = removeFlag(args, "--capsule-write");
const json = removeFlag(args, "--json");
const root = resolve(removeOption(args, "--root") ?? dirname(dirname(fileURLToPath(import.meta.url))));
const sourceRootValue = removeOption(args, "--source-root");

if (args.length || [sourceCheck, check, write, capsuleWrite].filter(Boolean).length !== 1
  || (capsuleWrite && !sourceRootValue)
  || (!capsuleWrite && sourceRootValue)) {
  usage();
  process.exit(2);
}

if (capsuleWrite) {
  const sourceRoot = resolve(sourceRootValue);
  if (sourceRoot === root) throw new Error("capsule root must differ from the source repository root");
  const source = await checkReleaseSourceConsistency(sourceRoot);
  if (source.status !== "pass" || !source.source || !source.package) {
    if (json) console.log(JSON.stringify(source, null, 2));
    else for (const error of source.errors) console.error(`ERROR: ${error}`);
    process.exit(1);
  }
  const manifest = await generateAttestedPackageManifest(root);
  await writeFile(join(root, "MANIFEST.sha256"), manifest.content, "utf8");
  const attestation = await createReleaseAttestation(root, source.source);
  if (attestation.package.name !== source.package.name || attestation.package.version !== source.package.version) {
    throw new Error("capsule package identity differs from the verified source package");
  }
  await writeFile(join(root, RELEASE_ATTESTATION_FILE), releaseAttestationBytes(attestation), "utf8");
  const verified = await verifyReleaseAttestation(root, { exactSurface: true });
  if (verified.status !== "pass") {
    if (json) console.log(JSON.stringify(verified, null, 2));
    else for (const error of verified.errors) console.error(`ERROR: ${error}`);
    process.exit(1);
  }
  const result = {
    record_type: "mister-clean.release-capsule-attestation-result",
    schema_version: "1.0",
    status: "pass",
    package: verified.package,
    claimed_source: verified.claimed_source,
    manifest: attestation.manifest,
  };
  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(`release capsule: PASS ${verified.package?.name}@${verified.package?.version} ${verified.manifest?.sha256}`);
  process.exit(0);
}

const source = await checkReleaseSourceConsistency(root);
if (source.status !== "pass") {
  if (json) console.log(JSON.stringify(source, null, 2));
  else {
    for (const error of source.errors) console.error(`ERROR: ${error}`);
    console.error("release source: FAIL");
  }
  process.exit(1);
}

if (sourceCheck) {
  if (json) console.log(JSON.stringify(source, null, 2));
  else console.log(`release source: PASS ${source.package?.name}@${source.package?.version} ${source.source?.git_commit}`);
  process.exit(0);
}

if (!source.source) throw new Error("release source check did not produce source identity");
const expected = await createReleaseAttestation(root, source.source);
const expectedBytes = releaseAttestationBytes(expected);
const attestationPath = join(root, RELEASE_ATTESTATION_FILE);

if (write) {
  await writeFile(attestationPath, expectedBytes, "utf8");
  console.log(`release attestation: wrote ${RELEASE_ATTESTATION_FILE}`);
  process.exit(0);
}

let actualBytes = "";
try {
  actualBytes = await readFile(attestationPath, "utf8");
} catch (error) {
  console.error(`ERROR: ${RELEASE_ATTESTATION_FILE}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
if (actualBytes !== expectedBytes) {
  console.error(`ERROR: ${RELEASE_ATTESTATION_FILE}: stale or not generated from current release source`);
  process.exit(1);
}

const verified = await verifyReleaseAttestation(root, { strict: true });
if (json) console.log(JSON.stringify(verified, null, 2));
else if (verified.status === "pass") console.log(`release attestation: PASS ${verified.package?.name}@${verified.package?.version} ${verified.manifest?.sha256}`);
else for (const error of verified.errors) console.error(`ERROR: ${error}`);
process.exit(verified.status === "pass" ? 0 : 1);
