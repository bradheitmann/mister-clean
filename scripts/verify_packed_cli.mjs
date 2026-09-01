import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import {
  acquireReleaseArchiveCustody,
  inspectReleaseArchiveCustody,
  ORIGIN_AUTHENTICITY,
  releaseArchiveToolEnvironment,
} from "./release_archive_contract.mjs";

const RELEASE_ATTESTATION_FILE = "RELEASE_ATTESTATION.json";
const MANIFEST_FILE = "MANIFEST.sha256";

function usage() {
  console.error("usage: node scripts/verify_packed_cli.mjs --archive <absolute-path.tgz>");
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  args.splice(index, 2);
  return value;
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function toPosix(path) {
  return path.split(sep).join("/");
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
    if (!match) throw new Error(`${MANIFEST_FILE}:${index + 1}: invalid manifest row`);
    const [, sha256, path] = match;
    if (isAbsolute(path) || path.includes("\\") || path.split("/").includes("..")) {
      throw new Error(`${MANIFEST_FILE}:${index + 1}: unsafe path ${JSON.stringify(path)}`);
    }
    if (paths.has(path)) throw new Error(`${MANIFEST_FILE}:${index + 1}: duplicate path ${JSON.stringify(path)}`);
    paths.add(path);
    entries.push({ path, sha256 });
  }
  return entries;
}

function declarationExports(path) {
  const source = readFileSync(path, "utf8");
  if (/export\s+(?:default|\*)/u.test(source)) {
    throw new Error(`${path}: wildcard or default declaration exports are forbidden`);
  }
  const blocks = [...source.matchAll(/^export\s*\{([^}]*)\};?$/gmu)];
  if (blocks.length !== 1) throw new Error(`${path}: expected one exact declaration export block`);
  return blocks[0][1].split(",").map((entry) => {
    const normalized = entry.trim().replace(/^type\s+/u, "");
    return normalized.split(/\s+as\s+/u).at(-1);
  }).filter(Boolean).sort();
}

function assertExactDeclarationSurfaces(unpacked) {
  const rootExports = declarationExports(join(unpacked, "dist", "public.d.ts"));
  if (JSON.stringify(rootExports) !== JSON.stringify(["createMisterCleanServer"])) {
    throw new Error(`unexpected root declaration exports: ${JSON.stringify(rootExports)}`);
  }
  const controlPlaneExports = declarationExports(join(unpacked, "dist", "control-plane.d.ts"));
  const expected = [
    "LocalControlPlaneRuntimeOptions",
    "RunningLocalControlPlaneRuntime",
    "startLocalControlPlaneRuntime",
  ].sort();
  if (JSON.stringify(controlPlaneExports) !== JSON.stringify(expected)) {
    throw new Error(`unexpected control-plane declaration exports: ${JSON.stringify(controlPlaneExports)}`);
  }
}

function assertExactPackageTree(unpacked) {
  const attestationPath = join(unpacked, RELEASE_ATTESTATION_FILE);
  const manifestPath = join(unpacked, MANIFEST_FILE);
  if (!existsSync(attestationPath)) throw new Error(`archive is missing required ${RELEASE_ATTESTATION_FILE}`);
  if (!existsSync(manifestPath)) throw new Error(`archive is missing required ${MANIFEST_FILE}`);
  const attestationMetadata = lstatSync(attestationPath);
  const manifestMetadata = lstatSync(manifestPath);
  if (!attestationMetadata.isFile() || attestationMetadata.isSymbolicLink()) {
    throw new Error(`${RELEASE_ATTESTATION_FILE} must be a regular file`);
  }
  if (!manifestMetadata.isFile() || manifestMetadata.isSymbolicLink()) {
    throw new Error(`${MANIFEST_FILE} must be a regular file`);
  }

  const manifestBytes = readFileSync(manifestPath);
  const entries = parseManifest(manifestBytes.toString("utf8"));
  const expected = new Set([
    ...entries.map((entry) => entry.path),
    MANIFEST_FILE,
    RELEASE_ATTESTATION_FILE,
  ]);
  const actual = new Set(regularFiles(unpacked));
  const unexpected = [...actual].filter((path) => !expected.has(path)).sort();
  const missing = [...expected].filter((path) => !actual.has(path)).sort();
  if (unexpected.length || missing.length) {
    throw new Error(`archive tree mismatch unexpected=${JSON.stringify(unexpected)} missing=${JSON.stringify(missing)}`);
  }

  for (const entry of entries) {
    const observed = sha256File(join(unpacked, entry.path));
    if (observed !== entry.sha256) {
      throw new Error(`manifest digest mismatch for ${entry.path}: expected ${entry.sha256}, observed ${observed}`);
    }
  }

  const attestation = JSON.parse(readFileSync(attestationPath, "utf8"));
  if (attestation?.manifest?.sha256 !== sha256Bytes(manifestBytes)) {
    throw new Error("release attestation does not bind the exact MANIFEST.sha256 bytes");
  }
  if (attestation?.manifest?.entry_count !== entries.length) {
    throw new Error("release attestation entry count does not match MANIFEST.sha256");
  }
  return { attestation, entryCount: entries.length };
}

async function within(milliseconds, label, promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds}ms`)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function smokeStdioMcp(installedMcp, consumer) {
  const transport = new StdioClientTransport({ command: installedMcp, cwd: consumer, stderr: "pipe" });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const client = new Client({ name: "mister-clean-release-smoke", version: "1.0.0" });
  try {
    await within(20_000, "MCP initialize", client.connect(transport));
    const tools = await within(10_000, "MCP tools/list", client.listTools());
    const names = new Set(tools.tools.map((tool) => tool.name));
    for (const required of ["mister_clean_attestation", "mister_clean_list_materials", "mister_clean_read_material"]) {
      if (!names.has(required)) throw new Error(`installed MCP is missing tool ${required}`);
    }
    const attestation = await within(10_000, "MCP attestation call", client.callTool({
      name: "mister_clean_attestation",
      arguments: { response_format: "json" },
    }));
    if (attestation.isError || attestation.structuredContent?.status !== "pass") {
      throw new Error(`installed MCP returned invalid runtime attestation: ${JSON.stringify(attestation.structuredContent)}`);
    }
    const materials = await within(10_000, "MCP material call", client.callTool({
      name: "mister_clean_list_materials",
      arguments: { limit: 1, offset: 0, response_format: "json" },
    }));
    if (materials.isError || materials.structuredContent?.count !== 1) {
      throw new Error(`installed MCP material call failed: ${JSON.stringify(materials.structuredContent)}`);
    }
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}${stderr ? `; stderr=${stderr.trim()}` : ""}`);
  } finally {
    await client.close().catch(() => undefined);
  }
}

function smokeInstalledPrepare(installedCli, packageTree, temporaryRoot) {
  const repository = join(temporaryRoot, "prepare-repository");
  const evidenceHome = join(temporaryRoot, "prepare-evidence");
  mkdirSync(repository);
  mkdirSync(evidenceHome);
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: repository, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "Mister Clean Release Smoke"], { cwd: repository, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "release-smoke.invalid"], { cwd: repository, stdio: "pipe" });
  writeFileSync(join(repository, "README.md"), "# Release smoke repository\n", "utf8");
  writeFileSync(join(repository, "CURRENT-STATE.md"), "# Current state\n\nRelease smoke fixture.\n", "utf8");
  execFileSync("git", ["add", "README.md", "CURRENT-STATE.md"], { cwd: repository, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "release smoke fixture"], { cwd: repository, stdio: "pipe" });

  const output = execFileSync(installedCli, [
    "prepare", "--repo", repository, "--evidence-home", evidenceHome,
    "--run-id", "installed-release-smoke", "--request-ref", "release-archive-smoke",
    "--request-text", "Prepare this repository for an exact installed-package release smoke.",
    "--criterion", "The prepared evidence is internally valid.",
  ], { cwd: repository, encoding: "utf8" }).trim();
  const bundleDirectory = output.split("\n").filter(Boolean).at(-1);
  if (!bundleDirectory || !isAbsolute(bundleDirectory)) {
    throw new Error(`installed prepare did not return an absolute bundle directory: ${output}`);
  }
  const regressionPath = join(bundleDirectory, "regression-delta.json");
  const regression = JSON.parse(readFileSync(regressionPath, "utf8"));
  const coverage = regression.detector_coverage;
  const runtime = coverage?.runtime_identity;
  const expectedEntrypoint = packageTree.attestation.required_entrypoints
    .find((entrypoint) => entrypoint.path === "./bin/mister-clean.js");
  if (regression.schema_version !== "1.5"
    || runtime?.status !== "release_attested"
    || JSON.stringify(runtime.package) !== JSON.stringify(packageTree.attestation.package)
    || JSON.stringify(runtime.claimed_source) !== JSON.stringify(packageTree.attestation.claimed_source)
    || JSON.stringify(runtime.manifest) !== JSON.stringify(packageTree.attestation.manifest)
    || JSON.stringify(runtime.claim_scope) !== JSON.stringify(packageTree.attestation.claim_scope)
    || JSON.stringify(runtime.entrypoint) !== JSON.stringify(expectedEntrypoint)) {
    throw new Error("installed prepare did not bind schema 1.5 to the exact release package identity");
  }
  if (!coverage.runtime_identity_sha256
    || !coverage.executions.every((execution) => execution.runtime_identity_sha256 === coverage.runtime_identity_sha256)) {
    throw new Error("installed prepare detector executions do not share the exact release runtime digest");
  }
  const validation = execFileSync(
    installedCli,
    ["validate", "bundle", join(bundleDirectory, "closure-bundle.json"), "--repo", repository],
    { cwd: repository, encoding: "utf8" },
  );
  if (!validation.includes("PASS kind=bundle")) {
    throw new Error(`installed prepared bundle did not validate under the same installed CLI: ${validation}`);
  }
}

function smokeInstalledControlPlane(consumer) {
  const namespaceSmoke = join(consumer, "control-plane-namespace-smoke.mjs");
  writeFileSync(namespaceSmoke, [
    'import * as surface from "@bradheitmann/mister-clean/control-plane";',
    'const actual = Object.keys(surface).sort();',
    'const expected = ["startLocalControlPlaneRuntime"];',
    'if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`unexpected control-plane exports: ${JSON.stringify(actual)}`);',
    'if (typeof surface.startLocalControlPlaneRuntime !== "function") throw new Error("control-plane runtime export is unavailable");',
    'for (const specifier of [',
    '  "@bradheitmann/mister-clean/dist/control-plane.js",',
    '  "@bradheitmann/mister-clean/control-plane/runtime/local-runtime",',
    '  "@bradheitmann/mister-clean/dist/control-plane/runtime/local-runtime.js",',
    ']) {',
    '  try {',
    '    await import(specifier);',
    '  } catch (error) {',
    '    if (error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED") continue;',
    '    throw new Error(`hidden control-plane subpath ${specifier} failed with ${String(error?.code)}`);',
    '  }',
    '  throw new Error(`hidden control-plane subpath was importable: ${specifier}`);',
    '}',
    'console.log("control-plane namespace: PASS");',
    "",
  ].join("\n"), "utf8");
  const namespaceOutput = execFileSync(process.execPath, [namespaceSmoke], { cwd: consumer, encoding: "utf8" });
  if (!namespaceOutput.includes("control-plane namespace: PASS")) {
    throw new Error(`unexpected control-plane namespace output: ${namespaceOutput}`);
  }

  const runtimeSmoke = join(consumer, "control-plane-runtime-smoke.mjs");
  writeFileSync(runtimeSmoke, [
    'import { existsSync } from "node:fs";',
    'import { mkdtemp, rm } from "node:fs/promises";',
    'import { tmpdir } from "node:os";',
    'import { join } from "node:path";',
    'import { startLocalControlPlaneRuntime } from "@bradheitmann/mister-clean/control-plane";',
    'const directory = await mkdtemp(join(tmpdir(), "mister-clean-packed-control-plane-"));',
    'const socketDirectory = await mkdtemp("/tmp/mc-");',
    'try {',
    '  const pollutionKeys = ["unix_socket_path", "live_route_probes", "route_admission", "evidence_verifier", "clock"];',
    '  const pollutionReads = Object.fromEntries(pollutionKeys.map((key) => [key, 0]));',
    '  const pollutedSocketPath = join(socketDirectory, "polluted.sock");',
    '  const pollutedRejectedDatabase = join(directory, "polluted-must-not-exist.sqlite");',
    '  const pollutionValues = {',
    '    unix_socket_path: pollutedSocketPath,',
    '    live_route_probes: undefined,',
    '    route_admission: { configured: true, async admit() { return { admitted: true, reason: "polluted", evidence: [] }; } },',
    '    evidence_verifier: {',
    '      configured: true,',
    '      async verifyDirective() { return []; },',
    '      async verifyReceipt() { return []; },',
    '    },',
    '    clock: () => "2000-01-01T00:00:00.000Z",',
    '  };',
    '  const pollutionPrior = new Map();',
    '  let pollutionRejectedError = null;',
    '  let pollutionRejectedRuntimeReturned = false;',
    '  let pollutedDatabaseActivated = false;',
    '  let pollutedSocketActivated = false;',
    '  let observedPollutionReads = null;',
    '  let pollutionRuntime = null;',
    '  try {',
    '    for (const key of pollutionKeys) {',
    '      pollutionPrior.set(key, Object.getOwnPropertyDescriptor(Object.prototype, key));',
    '      Object.defineProperty(Object.prototype, key, {',
    '        configurable: true,',
    '        get() { pollutionReads[key] += 1; return pollutionValues[key]; },',
    '      });',
    '    }',
    '    try {',
    '      const unexpected = await startLocalControlPlaneRuntime({',
    '        repository_database_path: pollutedRejectedDatabase,',
    '        bearer_token: "packed-control-plane-test-token-00000001",',
    '      });',
    '      pollutionRejectedRuntimeReturned = true;',
    '      pollutedDatabaseActivated = existsSync(pollutedRejectedDatabase);',
    '      pollutedSocketActivated = existsSync(pollutedSocketPath);',
    '      await unexpected.close();',
    '    } catch (error) {',
    '      pollutionRejectedError = error;',
    '      pollutedDatabaseActivated = existsSync(pollutedRejectedDatabase);',
    '      pollutedSocketActivated = existsSync(pollutedSocketPath);',
    '    }',
    '    pollutionRuntime = await startLocalControlPlaneRuntime({',
    '      repository_database_path: join(directory, "pollution-accepted.sqlite"),',
    '      bearer_token: "packed-control-plane-test-token-00000001",',
    '      http: { port: 0 },',
    '    });',
    '    pollutedSocketActivated ||= existsSync(pollutedSocketPath);',
    '    observedPollutionReads = { ...pollutionReads };',
    '  } finally {',
    '    for (const key of [...pollutionKeys].reverse()) {',
    '      const descriptor = pollutionPrior.get(key);',
    '      if (descriptor === undefined) delete Object.prototype[key];',
    '      else Object.defineProperty(Object.prototype, key, descriptor);',
    '    }',
    '  }',
    '  if (pollutionRejectedRuntimeReturned',
    '    || !(pollutionRejectedError instanceof Error)',
    '    || !pollutionRejectedError.message.includes("requires at least one IPC adapter")',
    '    || pollutedDatabaseActivated',
    '    || pollutedSocketActivated',
    '    || JSON.stringify(observedPollutionReads) !== JSON.stringify(Object.fromEntries(pollutionKeys.map((key) => [key, 0])))',
    '    || pollutionRuntime?.unix_socket !== null',
    '    || pollutionRuntime?.http === null) {',
    '    await pollutionRuntime?.close();',
    '    throw new Error("Object.prototype pollution reactivated public transport or authority configuration");',
    '  }',
    '  try {',
    '    const pollutionBody = JSON.stringify({ version: "1", request_id: "health-packed-pollution", kind: "query", name: "health", input: {} });',
    '    const pollutionResponse = await fetch(pollutionRuntime.http.url, {',
    '      method: "POST",',
    '      headers: { Authorization: "Bearer packed-control-plane-test-token-00000001", "Content-Type": "application/json" },',
    '      body: pollutionBody,',
    '    });',
    '    const pollutionHealth = await pollutionResponse.json();',
    '    if (pollutionHealth?.ok !== true',
    '      || pollutionHealth?.result?.route_admission_configured !== false',
    '      || pollutionHealth?.result?.evidence_verification_configured !== false) {',
    '      throw new Error("Object.prototype authority pollution reached packed runtime health");',
    '    }',
    '  } finally {',
    '    await pollutionRuntime.close();',
    '  }',
    '  const rejectionCases = [',
    '    {',
    '      name: "top-level nonstandard prototype",',
    '      expected: "Local control-plane runtime options must have Object.prototype or null prototype",',
    '      make(databasePath, socketPath) {',
    '        return Object.assign(Object.create({ http: { port: 0 } }), {',
    '          repository_database_path: databasePath,',
    '          bearer_token: "packed-control-plane-test-token-00000001",',
    '          unix_socket_path: socketPath,',
    '        });',
    '      },',
    '    },',
    '    {',
    '      name: "nested HTTP nonstandard prototype",',
    '      expected: "Local control-plane HTTP options must have Object.prototype or null prototype",',
    '      make(databasePath, socketPath) {',
    '        return {',
    '          repository_database_path: databasePath,',
    '          bearer_token: "packed-control-plane-test-token-00000001",',
    '          unix_socket_path: socketPath,',
    '          http: Object.assign(Object.create({ host: "127.0.0.1" }), { port: 0 }),',
    '        };',
    '      },',
    '    },',
    '    {',
    '      name: "symbol own key",',
    '      expected: "unsupported option Symbol(unsupported)",',
    '      make(databasePath, socketPath) {',
    '        return {',
    '          repository_database_path: databasePath,',
    '          bearer_token: "packed-control-plane-test-token-00000001",',
    '          unix_socket_path: socketPath,',
    '          [Symbol("unsupported")]: true,',
    '        };',
    '      },',
    '    },',
    '    {',
    '      name: "unknown nested HTTP own key",',
    '      expected: "unsupported option unexpected_nested_option",',
    '      make(databasePath, socketPath) {',
    '        return {',
    '          repository_database_path: databasePath,',
    '          bearer_token: "packed-control-plane-test-token-00000001",',
    '          unix_socket_path: socketPath,',
    '          http: { port: 0, unexpected_nested_option: true },',
    '        };',
    '      },',
    '    },',
    '  ];',
    '  for (const [index, testCase] of rejectionCases.entries()) {',
    '    const databasePath = join(directory, `rejected-${index}.sqlite`);',
    '    const socketPath = join(socketDirectory, `rejected-${index}.sock`);',
    '    let rejected = false;',
    '    try {',
    '      await startLocalControlPlaneRuntime(testCase.make(databasePath, socketPath));',
    '    } catch (error) {',
    '      rejected = error instanceof Error && error.message.includes(testCase.expected);',
    '    }',
    '    if (!rejected || existsSync(databasePath) || existsSync(socketPath)) {',
    '      throw new Error(`${testCase.name} was not rejected before filesystem mutation`);',
    '    }',
    '  }',
    '  const socketPath = join(socketDirectory, "control.sock");',
    '  const httpOptions = Object.assign(Object.create(null), { port: 0 });',
    '  const runtimeOptions = Object.assign(Object.create(null), {',
    '    repository_database_path: join(directory, "repository.sqlite"),',
    '    bearer_token: "packed-control-plane-test-token-00000001",',
    '    unix_socket_path: socketPath,',
    '    http: httpOptions,',
    '  });',
    '  const runtime = await startLocalControlPlaneRuntime(runtimeOptions);',
    '  try {',
    '    const keys = Object.keys(runtime).sort();',
    '    const expected = ["close", "dispatch_supported", "execution_supported", "http", "unix_socket"];',
    '    if (JSON.stringify(keys) !== JSON.stringify(expected) || !Object.isFrozen(runtime)) throw new Error(`unsafe runtime shape: ${JSON.stringify(keys)}`);',
    '    if (runtime.dispatch_supported !== false || runtime.execution_supported !== false) throw new Error("runtime capability flags are dishonest");',
    '    if (!runtime.unix_socket || JSON.stringify(Object.keys(runtime.unix_socket).sort()) !== JSON.stringify(["path"]) || !Object.isFrozen(runtime.unix_socket)) throw new Error("unsafe Unix-socket metadata");',
    '    if (!runtime.http || JSON.stringify(Object.keys(runtime.http).sort()) !== JSON.stringify(["app_url", "host", "port", "url"]) || !Object.isFrozen(runtime.http)) throw new Error("unsafe HTTP metadata");',
    '    for (const forbidden of ["service", "execute", "store"]) if (Object.hasOwn(runtime, forbidden)) throw new Error(`runtime exposes ${forbidden}`);',
    '    for (const metadata of [runtime.unix_socket, runtime.http]) for (const forbidden of ["service", "execute", "store", "close"]) if (Object.hasOwn(metadata, forbidden)) throw new Error(`adapter metadata exposes ${forbidden}`);',
    '    await runtime.close();',
    '    await runtime.close();',
    '  } finally {',
    '    await runtime.close();',
    '  }',
    '} finally {',
    '  await Promise.all([',
    '    rm(directory, { recursive: true, force: true }),',
    '    rm(socketDirectory, { recursive: true, force: true }),',
    '  ]);',
    '}',
    'console.log("control-plane runtime: PASS");',
    "",
  ].join("\n"), "utf8");
  const runtimeOutput = execFileSync("bun", [runtimeSmoke], { cwd: consumer, encoding: "utf8" });
  if (!runtimeOutput.includes("control-plane runtime: PASS")) {
    throw new Error(`unexpected control-plane runtime output: ${runtimeOutput}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const archiveValue = option(args, "--archive");
  if (!archiveValue || args.length) {
    usage();
    process.exitCode = 2;
    return;
  }
  if (!isAbsolute(archiveValue)) throw new Error("--archive must be an absolute path");
  const archive = resolve(archiveValue);
  const custody = acquireReleaseArchiveCustody(archive);
  let temporaryRoot;
  try {
    const archiveSha256 = custody.archive_sha256;
    const archiveIdentity = inspectReleaseArchiveCustody(custody);
    temporaryRoot = mkdtempSync(join(tmpdir(), "mister-clean-packed-cli-"));
    const standalone = join(temporaryRoot, "standalone");
    const consumer = join(temporaryRoot, "consumer");
    mkdirSync(standalone);
    mkdirSync(consumer);
    execFileSync("tar", ["-xzf", custody.path, "-C", standalone], {
      env: releaseArchiveToolEnvironment(custody.path, standalone),
      stdio: "pipe",
    });
    const unpacked = join(standalone, "package");
    const packageTree = assertExactPackageTree(unpacked);
    assertExactDeclarationSurfaces(unpacked);

    const standaloneAttestation = execFileSync(
      process.execPath,
      [join(unpacked, "bin", "mister-clean.js"), "attest", unpacked, "--json", "--strict"],
      { cwd: standalone, encoding: "utf8" },
    );
    if (JSON.parse(standaloneAttestation).status !== "pass") {
      throw new Error(`unexpected standalone attestation output: ${standaloneAttestation}`);
    }
    const standaloneOutput = execFileSync(
      process.execPath,
      [join(unpacked, "bin", "mister-clean.js"), "validate", "bundle", join(unpacked, "assets", "closure-bundle.json"), "--template", "--structural"],
      { cwd: standalone, encoding: "utf8" },
    );
    if (!standaloneOutput.includes("PASS kind=bundle")) {
      throw new Error(`unexpected standalone skill CLI output: ${standaloneOutput}`);
    }

    writeFileSync(join(consumer, "package.json"), '{"private":true,"type":"module"}\n', "utf8");
    execFileSync("pnpm", ["add", custody.path, "--ignore-scripts"], { cwd: consumer, stdio: "pipe" });
    const installed = join(consumer, "node_modules", "@bradheitmann", "mister-clean");
    const installedCli = join(consumer, "node_modules", ".bin", "mister-clean");
    const installedMcp = join(consumer, "node_modules", ".bin", "mister-clean-mcp");

    const output = execFileSync(
      installedCli,
      ["validate", "bundle", join(installed, "assets", "closure-bundle.json"), "--template", "--structural"],
      { cwd: consumer, encoding: "utf8" },
    );
    if (!output.includes("PASS kind=bundle")) throw new Error(`unexpected installed CLI output: ${output}`);
    const installedAttestation = execFileSync(
      installedCli,
      ["attest", installed, "--json", "--strict"],
      { cwd: consumer, encoding: "utf8" },
    );
    if (JSON.parse(installedAttestation).status !== "pass") {
      throw new Error(`unexpected installed attestation output: ${installedAttestation}`);
    }
    smokeInstalledPrepare(installedCli, packageTree, temporaryRoot);

    const exportSmoke = join(consumer, "package-export-smoke.mjs");
    writeFileSync(exportSmoke, [
      'import * as packageExports from "@bradheitmann/mister-clean";',
      'const keys = Object.keys(packageExports).sort();',
      'if (JSON.stringify(keys) !== JSON.stringify(["createMisterCleanServer"])) throw new Error(`unexpected package exports: ${JSON.stringify(keys)}`);',
      'const { createMisterCleanServer } = packageExports;',
      'if (typeof createMisterCleanServer !== "function") throw new Error("package export is unavailable");',
      'const server = createMisterCleanServer();',
      'if (!server || typeof server.connect !== "function") throw new Error("package export did not create an MCP server");',
      'await server.close();',
      'console.log("package export: PASS");',
      "",
    ].join("\n"), "utf8");
    const exportOutput = execFileSync(process.execPath, [exportSmoke], { cwd: consumer, encoding: "utf8" });
    if (!exportOutput.includes("package export: PASS")) throw new Error(`unexpected package export output: ${exportOutput}`);

    smokeInstalledControlPlane(consumer);

    await smokeStdioMcp(installedMcp, consumer);
    const finalArchiveSha256 = sha256File(custody.path);
    if (finalArchiveSha256 !== archiveSha256) {
      throw new Error("release archive changed while it was being verified");
    }
    console.log(JSON.stringify({
      record_type: "mister-clean.release-archive-smoke",
      schema_version: "1.0",
      status: "pass",
      archive,
      archive_sha256: archiveSha256,
      package: archiveIdentity.package,
      claimed_source: archiveIdentity.claimed_source,
      claim_scope: archiveIdentity.claim_scope,
      origin_authenticity: ORIGIN_AUTHENTICITY,
      manifest: archiveIdentity.manifest,
      checks: [
        "single_read_private_archive_custody",
        "safe_archive_members",
        "raw_ustar_manifest_and_directory_closure",
        "exact_extracted_tree",
        "manifest_digests",
        "standalone_cli",
        "pnpm_installed_cli",
        "pnpm_installed_prepare_and_validate",
        "package_export",
        "package_declaration_exports_exact",
        "control_plane_export_exact",
        "control_plane_hidden_subpaths_blocked",
        "control_plane_runtime_capability_scoped",
        "control_plane_prototype_pollution_isolated",
        "stdio_mcp_initialize_list_call",
      ],
    }, null, 2));
  } finally {
    if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
    custody.dispose();
  }
}

await main();
