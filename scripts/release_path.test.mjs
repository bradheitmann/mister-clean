import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  symlinkSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import {
  acquireReleaseArchiveCustody,
  assertSafeArchiveMembers,
  inspectReleaseArchive,
  inspectReleaseArchiveCustody,
} from "./release_archive_contract.mjs";
import {
  copyIsolatedPnpmTree,
  createExternalPnpmArchive,
  createPortablePackageArchive,
  releaseProcessEnvironment,
} from "./release_capsule.mjs";
import {
  createReleaseAttestation,
  generateAttestedPackageManifest,
  releaseAttestationBytes,
} from "../src/attestation.js";
import { CLEAN_CI_MATRIX } from "./run_clean_ci.ts";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const verifier = join(root, "scripts", "verify_packed_cli.mjs");
const preparer = join(root, "scripts", "prepare_release_archive.mjs");
const publisher = join(root, "scripts", "publish_release_archive.mjs");
const archiveContract = join(root, "scripts", "release_archive_contract.mjs");
const attestationGenerator = join(root, "scripts", "generate_release_attestation.mjs");
const npmjsRegistry = "https://registry.npmjs.org/";
const scopedRegistryOverride = `--config.@bradheitmann:registry=${npmjsRegistry}`;
const temporaryRoots = [];

function temporaryRoot() {
  const path = mkdtempSync(join(tmpdir(), "mister-clean-release-path-test-"));
  temporaryRoots.push(path);
  return path;
}

function writeFrozenPnpmLock(root) {
  execFileSync("pnpm", ["install", "--lockfile-only", "--ignore-scripts"], {
    cwd: root,
    stdio: "pipe",
  });
}

function archiveFixture(configure) {
  const temporary = temporaryRoot();
  const packageRoot = join(temporary, "package");
  mkdirSync(packageRoot);
  writeFileSync(join(packageRoot, "package.json"), '{"name":"fixture","version":"1.0.0"}\n', "utf8");
  configure?.(packageRoot);
  const archive = join(temporary, "fixture.tgz");
  const metadataFlags = process.platform === "darwin" ? ["--no-xattrs", "--no-mac-metadata"] : [];
  execFileSync("tar", [...metadataFlags, "--format=ustar", "-czf", archive, "-C", temporary, "package"], {
    env: { ...process.env, COPYFILE_DISABLE: "1", COPY_EXTENDED_ATTRIBUTES_DISABLE: "1" },
    stdio: "pipe",
  });
  return archive;
}

function writeTarChecksum(header) {
  header.fill(0x20, 148, 156);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
}

function writeUstarFixture(archive, members) {
  const blocks = [];
  for (const member of members) {
    const bytes = Buffer.from(member.content ?? "", "utf8");
    const header = Buffer.alloc(512);
    header.write(member.path, 0, 100, "utf8");
    header.write("0000644\0", 100, 8, "ascii");
    header.write("0000000\0", 108, 8, "ascii");
    header.write("0000000\0", 116, 8, "ascii");
    header.write(`${bytes.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
    header.write("00000000000\0", 136, 12, "ascii");
    header[156] = (member.type ?? "0").charCodeAt(0);
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");
    writeTarChecksum(header);
    blocks.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  writeFileSync(archive, gzipSync(Buffer.concat(blocks)));
  return archive;
}

function rewriteUstarFixture(archive, mutate) {
  const tar = Buffer.from(gunzipSync(readFileSync(archive)));
  mutate(tar);
  writeFileSync(archive, gzipSync(tar));
  return archive;
}

function validReleaseArchiveFixture(configurePackageData, configureFinalTree) {
  return archiveFixture((packageRoot) => {
    const packageData = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    packageData.version = "9.9.9-test";
    packageData.dependencies = {};
    packageData.devDependencies = {};
    delete packageData.packageManager;
    delete packageData.scripts.prepack;
    configurePackageData?.(packageData);
    writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify(packageData, null, 2)}\n`, "utf8");
    const fileContents = new Map([
      ["SKILL.md", "---\nname: mister-clean\n---\n"],
      ["bin/mister-clean.js", "#!/usr/bin/env node\n"],
      ["dist/public.js", "export const fixture = true;\n"],
      ["dist/stdio.js", "export const fixture = true;\n"],
    ]);
    for (const [path, content] of fileContents) {
      mkdirSync(dirname(join(packageRoot, path)), { recursive: true });
      writeFileSync(join(packageRoot, path), content, "utf8");
    }
    const manifestPaths = ["package.json", ...fileContents.keys()].sort();
    const manifest = `${manifestPaths.map((path) => `${sha256File(join(packageRoot, path))}  ./${path}`).join("\n")}\n`;
    writeFileSync(join(packageRoot, "MANIFEST.sha256"), manifest, "utf8");
    const digestByPath = new Map(manifestPaths.map((path) => [`./${path}`, sha256File(join(packageRoot, path))]));
    writeFileSync(join(packageRoot, "RELEASE_ATTESTATION.json"), `${JSON.stringify({
      record_type: "mister-clean.release-attestation",
      schema_version: "1.1",
      package: { name: packageData.name, version: packageData.version },
      claimed_source: { git_commit: "a".repeat(40), git_tag: `v${packageData.version}` },
      claim_scope: {
        covers: "own_package_regular_file_bytes",
        excludes: [
          "registry_publication_provenance",
          "dependency_resolution_graph",
          "filesystem_mode_bits_xattrs_and_timestamps",
          "release_attestation_self_bytes",
          "claimed_source_authenticity",
        ],
      },
      manifest: {
        path: "./MANIFEST.sha256",
        format: "sha256sum-v1-lf",
        entry_count: manifestPaths.length,
        sha256: createHash("sha256").update(manifest).digest("hex"),
      },
      required_entrypoints: [
        "./SKILL.md", "./bin/mister-clean.js", "./dist/public.js", "./dist/stdio.js",
      ].map((path) => ({ path, sha256: digestByPath.get(path) })),
    }, null, 2)}\n`, "utf8");
    configureFinalTree?.(packageRoot);
  });
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function copyRepositoryObject(source, destination) {
  mkdirSync(destination);
  const paths = execFileSync("git", ["-C", source, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
  }).toString("utf8").split("\0").filter(Boolean);
  for (const path of paths) {
    const from = join(source, path);
    const to = join(destination, path);
    mkdirSync(dirname(to), { recursive: true });
    let metadata;
    try {
      metadata = lstatSync(from);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") continue;
      throw error;
    }
    if (metadata.isSymbolicLink()) symlinkSync(readlinkSync(from), to);
    else if (metadata.isFile()) copyFileSync(from, to);
    else throw new Error(`unsupported RepositoryObject test entry: ${path}`);
  }
}

function registryDigests(path) {
  const bytes = readFileSync(path);
  return {
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    shasum: createHash("sha1").update(bytes).digest("hex"),
  };
}

afterEach(() => {
  while (temporaryRoots.length) rmSync(temporaryRoots.pop(), { recursive: true, force: true });
});

describe("release archive boundary", () => {
  it("rejects a raw AppleDouble member before consulting platform tar listings", () => {
    const temporary = temporaryRoot();
    const archive = writeUstarFixture(join(temporary, "appledouble.tgz"), [
      { path: "package/", type: "5" },
      { path: "package/package.json", content: '{"name":"fixture","version":"1.0.0"}\n' },
      { path: "package/._SKILL.md", content: "forbidden\n" },
    ]);
    expect(() => assertSafeArchiveMembers(archive)).toThrow(/AppleDouble/u);
  });

  it.each([
    ["PAX metadata", "x"],
    ["non-regular member", "2"],
  ])("rejects raw %s members", (_label, type) => {
    const archive = writeUstarFixture(join(temporaryRoot(), `${type}.tgz`), [
      { path: "package/", type: "5" },
      { path: "package/package.json", content: "{}\n" },
      { path: "package/forbidden", type, content: type === "x" ? "24 path=package/value\n" : "" },
    ]);
    expect(() => assertSafeArchiveMembers(archive)).toThrow(type === "x" ? /PAX metadata/u : /non-regular member/u);
  });

  it("rejects traversal and duplicate semantic paths in raw headers", () => {
    const traversal = writeUstarFixture(join(temporaryRoot(), "traversal.tgz"), [
      { path: "package/", type: "5" },
      { path: "package/package.json", content: "{}\n" },
      { path: "package/../escape", content: "bad\n" },
    ]);
    expect(() => assertSafeArchiveMembers(traversal)).toThrow(/non-canonical/u);
    const duplicate = writeUstarFixture(join(temporaryRoot(), "duplicate.tgz"), [
      { path: "package/", type: "5" },
      { path: "package/package.json", content: "{}\n" },
      { path: "package/package.json", content: "again\n" },
    ]);
    expect(() => assertSafeArchiveMembers(duplicate)).toThrow(/duplicate archive member/u);
  });

  it("rejects non-NFC names and ASCII-casefold path aliases in raw headers", () => {
    const nonNfc = writeUstarFixture(join(temporaryRoot(), "non-nfc.tgz"), [
      { path: "package/", type: "5" },
      { path: "package/package.json", content: "{}\n" },
      { path: "package/e\u0301.txt", content: "alias\n" },
    ]);
    expect(() => assertSafeArchiveMembers(nonNfc)).toThrow(/Unicode NFC/u);

    const caseAlias = writeUstarFixture(join(temporaryRoot(), "case-alias.tgz"), [
      { path: "package/", type: "5" },
      { path: "package/package.json", content: "{}\n" },
      { path: "package/Foo.txt", content: "one\n" },
      { path: "package/foo.txt", content: "two\n" },
    ]);
    expect(() => assertSafeArchiveMembers(caseAlias)).toThrow(/path collision/u);
  });

  it("binds inspection and retention to one closed byte string despite caller-path replacement", () => {
    const archive = validReleaseArchiveFixture();
    const expectedBytes = readFileSync(archive);
    const custody = acquireReleaseArchiveCustody(archive);
    try {
      writeFileSync(archive, "replaced after custody\n", "utf8");
      expect(inspectReleaseArchiveCustody(custody)).toMatchObject({
        archive_sha256: createHash("sha256").update(expectedBytes).digest("hex"),
        package: { name: "@bradheitmann/mister-clean", version: "9.9.9-test" },
      });
      const retained = join(temporaryRoot(), "retained.tgz");
      custody.retainAs(retained);
      expect(readFileSync(retained)).toEqual(expectedBytes);
      expect(() => custody.retainAs(retained)).toThrow(/EEXIST/u);
    } finally {
      custody.dispose();
    }
  });

  it("rejects raw files and directories outside the manifest-implied closure", () => {
    const extraFile = validReleaseArchiveFixture(undefined, (packageRoot) => {
      writeFileSync(join(packageRoot, "undeclared.txt"), "not in manifest\n", "utf8");
    });
    expect(() => inspectReleaseArchive(extraFile)).toThrow(/raw archive file set differs/u);

    const extraDirectory = validReleaseArchiveFixture(undefined, (packageRoot) => {
      mkdirSync(join(packageRoot, "empty-undeclared-directory"));
    });
    expect(() => inspectReleaseArchive(extraDirectory)).toThrow(/raw archive directory set differs/u);
  });

  it("rejects a raw payload whose bytes no longer match its manifest", () => {
    const archive = validReleaseArchiveFixture(undefined, (packageRoot) => {
      writeFileSync(join(packageRoot, "SKILL.md"), "changed after manifest\n", "utf8");
    });
    expect(() => inspectReleaseArchive(archive)).toThrow(/raw archive payload digest mismatch/u);
  });

  it("refuses to acquire archive custody through a symbolic-link alias", () => {
    const archive = validReleaseArchiveFixture();
    const alias = join(temporaryRoot(), "archive-alias.tgz");
    symlinkSync(archive, alias);
    expect(() => acquireReleaseArchiveCustody(alias)).toThrow();
  });

  it.each([
    "https://registry.npmjs.org/",
    "https://example.invalid/registry/",
  ])("rejects a publishConfig field even when its registry is %s", (registry) => {
    const archive = validReleaseArchiveFixture((packageData) => {
      packageData.publishConfig = { registry };
    });
    expect(() => inspectReleaseArchive(archive)).toThrow(/package\.json: expected exact keys/u);
  });

  it("rejects corrupt checksums, base-256 sizes, padding, and short terminators", () => {
    const members = [
      { path: "package/", type: "5" },
      { path: "package/package.json", content: "{}\n" },
    ];
    const checksum = writeUstarFixture(join(temporaryRoot(), "checksum.tgz"), members);
    rewriteUstarFixture(checksum, (tar) => { tar[0] ^= 1; });
    expect(() => assertSafeArchiveMembers(checksum)).toThrow(/checksum mismatch/u);

    const base256 = writeUstarFixture(join(temporaryRoot(), "base256.tgz"), members);
    rewriteUstarFixture(base256, (tar) => {
      const header = tar.subarray(512, 1024);
      header[124] = 0x80;
      writeTarChecksum(header);
    });
    expect(() => assertSafeArchiveMembers(base256)).toThrow(/base-256 member size/u);

    const padding = writeUstarFixture(join(temporaryRoot(), "padding.tgz"), members);
    rewriteUstarFixture(padding, (tar) => { tar[1024 + Buffer.byteLength("{}\n")] = 1; });
    expect(() => assertSafeArchiveMembers(padding)).toThrow(/non-zero payload padding/u);

    const terminator = writeUstarFixture(join(temporaryRoot(), "terminator.tgz"), members);
    rewriteUstarFixture(terminator, (tar) => tar.fill(1, tar.length - 512));
    expect(() => assertSafeArchiveMembers(terminator)).toThrow(/two-block zero terminator|non-zero bytes after/u);
  });

  it("copies pnpm-style dependency links into an inode-independent tree", () => {
    const temporary = temporaryRoot();
    const source = join(temporary, "dependencies");
    const destination = join(temporary, "isolated");
    mkdirSync(join(source, ".pnpm", "fixture@1.0.0", "node_modules", "fixture"), { recursive: true });
    const sourceFile = join(source, ".pnpm", "fixture@1.0.0", "node_modules", "fixture", "index.js");
    writeFileSync(sourceFile, "export const fixture = true;\n", "utf8");
    chmodSync(sourceFile, 0o755);
    symlinkSync(".pnpm/fixture@1.0.0/node_modules/fixture", join(source, "fixture"));
    copyIsolatedPnpmTree(source, destination);
    expect(readlinkSync(join(destination, "fixture"))).toBe(".pnpm/fixture@1.0.0/node_modules/fixture");
    const copiedFile = join(destination, ".pnpm", "fixture@1.0.0", "node_modules", "fixture", "index.js");
    expect(readFileSync(copiedFile, "utf8")).toBe(readFileSync(sourceFile, "utf8"));
    expect(`${statSync(copiedFile).dev}:${statSync(copiedFile).ino}`).not.toBe(`${statSync(sourceFile).dev}:${statSync(sourceFile).ino}`);
    expect(statSync(copiedFile).mode & 0o777).toBe(0o755);
  });

  it("constructs a hermetic release-child environment from locator keys only", () => {
    const capsule = temporaryRoot();
    const working = join(capsule, "work");
    mkdirSync(working);
    const environment = releaseProcessEnvironment(capsule, {
      PATH: "/trusted/bin",
      HOME: "/source/home",
      PWD: "/source/repository",
      INIT_CWD: "/source/repository",
      NODE_OPTIONS: "--require=/source/inject.js",
      TAR_OPTIONS: "--checkpoint-action=exec=bad",
      npm_config_userconfig: "/source/.npmrc",
      HTTPS_PROXY: "https://proxy.invalid",
      NPM_TOKEN: "secret",
      SSH_AUTH_SOCK: "/source/agent.sock",
      MISTER_CLEAN_SOURCE_DEVELOPMENT: "1",
    }, working);
    expect(environment.PATH).toBe("/trusted/bin");
    for (const key of ["HOME", "PWD", "OLDPWD", "INIT_CWD", "TMPDIR", "XDG_CONFIG_HOME", "BUN_INSTALL", "PNPM_HOME"]) {
      expect(environment[key].startsWith(capsule), `${key}=${environment[key]}`).toBe(true);
    }
    for (const forbidden of [
      "NODE_OPTIONS", "TAR_OPTIONS", "npm_config_userconfig", "HTTPS_PROXY", "NPM_TOKEN",
      "SSH_AUTH_SOCK", "MISTER_CLEAN_SOURCE_DEVELOPMENT",
    ]) expect(environment).not.toHaveProperty(forbidden);
    expect(environment).toMatchObject({ CI: "true", TZ: "UTC", LANG: "C", LC_ALL: "C" });
  });

  it("rejects unsafe dependency links, special files, and preexisting destinations", () => {
    const absoluteRoot = join(temporaryRoot(), "absolute");
    mkdirSync(absoluteRoot);
    symlinkSync("/tmp", join(absoluteRoot, "escape"));
    expect(() => copyIsolatedPnpmTree(absoluteRoot, `${absoluteRoot}-copy`)).toThrow(/absolute/u);

    const relativeRoot = join(temporaryRoot(), "relative");
    mkdirSync(relativeRoot);
    symlinkSync("../outside", join(relativeRoot, "escape"));
    expect(() => copyIsolatedPnpmTree(relativeRoot, `${relativeRoot}-copy`)).toThrow(/escapes lexically/u);

    const danglingRoot = join(temporaryRoot(), "dangling");
    mkdirSync(danglingRoot);
    symlinkSync("missing", join(danglingRoot, "dangling"));
    expect(() => copyIsolatedPnpmTree(danglingRoot, `${danglingRoot}-copy`)).toThrow(/dangling/u);

    const specialRoot = join(temporaryRoot(), "special");
    mkdirSync(specialRoot);
    execFileSync("mkfifo", [join(specialRoot, "pipe")]);
    expect(() => copyIsolatedPnpmTree(specialRoot, `${specialRoot}-copy`)).toThrow(/unsupported filesystem entry/u);

    const existingRoot = join(temporaryRoot(), "existing");
    const existingDestination = join(temporaryRoot(), "existing-copy");
    mkdirSync(existingRoot);
    mkdirSync(existingDestination);
    expect(() => copyIsolatedPnpmTree(existingRoot, existingDestination)).toThrow(/already exists/u);

    const brokenLinkRoot = join(temporaryRoot(), "broken-link-destination");
    const brokenLinkDestination = join(temporaryRoot(), "broken-link-destination-copy");
    mkdirSync(brokenLinkRoot);
    symlinkSync("missing", brokenLinkDestination);
    expect(() => copyIsolatedPnpmTree(brokenLinkRoot, brokenLinkDestination)).toThrow(/already exists/u);

    const portableParent = temporaryRoot();
    mkdirSync(join(portableParent, "package"));
    mkdirSync(join(portableParent, ".release-process-state"));
    writeFileSync(join(portableParent, ".release-process-state", "owned.txt"), "preserve\n", "utf8");
    expect(() => createPortablePackageArchive({
      packageParent: portableParent,
      archive: join(portableParent, "forbidden.tgz"),
    })).toThrow(/already contains release process state/u);
    expect(readFileSync(join(portableParent, ".release-process-state", "owned.txt"), "utf8")).toBe("preserve\n");
  });

  it("builds and packs from an external Git capsule without touching the source checkout", () => {
    const temporary = temporaryRoot();
    const source = join(temporary, "source");
    const staging = join(temporary, "staging");
    mkdirSync(source);
    mkdirSync(staging);
    const dependencies = join(temporary, "dependencies");
    mkdirSync(dependencies);
    const packagePath = join(source, "package.json");
    const packageBytes = `${JSON.stringify({
      name: "external-capsule-fixture",
      version: "1.0.0",
      files: ["built.txt"],
      scripts: {
        "build:raw": "node -e \"const fs=require('node:fs');fs.writeFileSync('built.txt','built\\\\n');fs.writeFileSync('node_modules/CAPSULE_WRITE_PROBE','isolated\\\\n')\"",
        prepack: "node -e \"require('node:fs').writeFileSync('SOURCE_MUTATED', 'bad')\"",
      },
    }, null, 2)}\n`;
    writeFileSync(packagePath, packageBytes, "utf8");
    writeFrozenPnpmLock(source);
    execFileSync("git", ["init", "-b", "main"], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["config", "user.name", "Release Fixture"], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "release-fixture.invalid"], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["add", "."], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "source"], { cwd: source, stdio: "pipe" });
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
    const sourceMtime = statSync(packagePath).mtimeMs;

    const archive = createExternalPnpmArchive({ sourceRoot: source, commit, staging });

    expect(readFileSync(packagePath, "utf8")).toBe(packageBytes);
    expect(statSync(packagePath).mtimeMs).toBe(sourceMtime);
    expect(existsSync(join(source, "built.txt"))).toBe(false);
    expect(existsSync(join(source, "SOURCE_MUTATED"))).toBe(false);
    expect(existsSync(join(dependencies, "CAPSULE_WRITE_PROBE"))).toBe(false);
    const unpacked = join(temporary, "external-unpacked");
    mkdirSync(unpacked);
    execFileSync("tar", ["-xzf", archive, "-C", unpacked], { stdio: "pipe" });
    expect(readFileSync(join(unpacked, "package", "built.txt"), "utf8")).toBe("built\n");
    expect(existsSync(join(unpacked, "package", "SOURCE_MUTATED"))).toBe(false);
  }, 120_000);

  it("keeps source and dependency trees exact when the external build fails", () => {
    const temporary = temporaryRoot();
    const source = join(temporary, "source");
    const staging = join(temporary, "staging");
    const dependencies = join(temporary, "dependencies");
    mkdirSync(source);
    mkdirSync(staging);
    mkdirSync(dependencies);
    const packagePath = join(source, "package.json");
    const packageBytes = `${JSON.stringify({
      name: "failing-external-capsule-fixture",
      version: "1.0.0",
      scripts: {
        "build:raw": "node -e \"const fs=require('node:fs');fs.writeFileSync('capsule-only.txt','written\\\\n');fs.writeFileSync('node_modules/capsule-only.txt','written\\\\n');process.exit(23)\"",
      },
    }, null, 2)}\n`;
    writeFileSync(packagePath, packageBytes, "utf8");
    writeFrozenPnpmLock(source);
    execFileSync("git", ["init", "-b", "main"], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["config", "user.name", "Release Fixture"], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "release-fixture.invalid"], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["add", "."], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "source"], { cwd: source, stdio: "pipe" });
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
    expect(() => createExternalPnpmArchive({ sourceRoot: source, commit, staging })).toThrow();
    expect(readFileSync(packagePath, "utf8")).toBe(packageBytes);
    expect(existsSync(join(source, "capsule-only.txt"))).toBe(false);
    expect(existsSync(join(dependencies, "capsule-only.txt"))).toBe(false);
  }, 120_000);

  it("runs this package's real build inside an exact external Git capsule", () => {
    const temporary = temporaryRoot();
    const source = join(temporary, "source");
    const staging = join(temporary, "staging");
    copyRepositoryObject(root, source);
    mkdirSync(staging);
    execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["config", "user.name", "Release Fixture"], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "release-fixture.invalid"], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["add", "--all", "--force"], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["commit", "--quiet", "-m", "exact candidate"], { cwd: source, stdio: "pipe" });
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim();
    expect(existsSync(join(source, "dist"))).toBe(false);
    const committedPaths = execFileSync("git", ["ls-tree", "-r", "--name-only", commit], { cwd: source, encoding: "utf8" }).trim().split("\n").filter(Boolean);
    expect(committedPaths.some((path) => path.startsWith("dist/"))).toBe(false);

    const archive = createExternalPnpmArchive({ sourceRoot: source, commit, staging });
    const unpacked = join(temporary, "real-package-unpacked");
    mkdirSync(unpacked);
    execFileSync("tar", ["-xzf", archive, "-C", unpacked], { stdio: "pipe" });
    const packageRoot = join(unpacked, "package");
    const sourceVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
    expect(JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version).toBe(sourceVersion);
    const manifest = readFileSync(join(packageRoot, "MANIFEST.sha256"), "utf8");
    expect(manifest).toContain("./bin/mister-clean.js");
    expect(existsSync(join(packageRoot, "bin", "mister-clean.js"))).toBe(true);
    const distRows = manifest.trimEnd().split("\n").map((row) => {
      const [sha256, path] = row.split("  ");
      return { sha256, path };
    }).filter((row) => row.path?.startsWith("./dist/"));
    expect(distRows).toHaveLength(19);
    for (const row of distRows) {
      const path = row.path?.slice(2);
      expect(path).toBeTruthy();
      expect(sha256File(join(packageRoot, path))).toBe(row.sha256);
    }
    expect(existsSync(join(packageRoot, ".git"))).toBe(false);
  }, 120_000);

  it("strips extended metadata and installs the exact manifest-bound package tree with pnpm", () => {
    const temporary = temporaryRoot();
    const sourceArchive = validReleaseArchiveFixture();
    const unpacked = join(temporary, "portable-source");
    mkdirSync(unpacked);
    execFileSync("tar", ["-xzf", sourceArchive, "-C", unpacked], {
      env: { ...process.env, COPYFILE_DISABLE: "1", COPY_EXTENDED_ATTRIBUTES_DISABLE: "1" },
      stdio: "pipe",
    });
    const xattr = spawnSync("xattr", ["-w", "com.mister-clean.release-test", "present", join(unpacked, "package", "SKILL.md")], {
      encoding: "utf8",
    });
    if (process.platform === "darwin") expect(xattr.status).toBe(0);
    if (xattr.status === 0) {
      const contaminated = join(temporary, "contaminated.tgz");
      execFileSync("tar", ["-czf", contaminated, "-C", unpacked, "package"], { stdio: "pipe" });
      expect(() => assertSafeArchiveMembers(contaminated)).toThrow(/AppleDouble|PAX metadata|extended metadata/i);
    }

    const portable = createPortablePackageArchive({
      packageParent: unpacked,
      archive: join(temporary, "portable.tgz"),
    });
    expect(() => assertSafeArchiveMembers(portable)).not.toThrow();
    expect(inspectReleaseArchive(portable)).toMatchObject({
      package: { name: "@bradheitmann/mister-clean", version: "9.9.9-test" },
    });

    const consumer = join(temporary, "consumer");
    mkdirSync(consumer);
    writeFileSync(join(consumer, "package.json"), '{"name":"consumer","version":"1.0.0","private":true}\n', "utf8");
    execFileSync("pnpm", ["add", "--ignore-scripts", portable], { cwd: consumer, stdio: "pipe" });
    const installed = join(consumer, "node_modules", "@bradheitmann", "mister-clean");
    const actual = [];
    const visit = (directory, prefix = "") => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
        const absolute = join(directory, entry.name);
        if (path === "node_modules" || path.startsWith("node_modules/")) continue;
        if (entry.isDirectory()) visit(absolute, path);
        else {
          expect(lstatSync(absolute).isFile()).toBe(true);
          actual.push(path);
        }
      }
    };
    visit(installed);
    const manifestPaths = readFileSync(join(installed, "MANIFEST.sha256"), "utf8")
      .trimEnd().split("\n").map((line) => line.slice(68));
    expect(actual.sort()).toEqual([...manifestPaths, "MANIFEST.sha256", "RELEASE_ATTESTATION.json"].sort());
    expect(actual.some((path) => path.split("/").some((segment) => segment.startsWith("._")))).toBe(false);
    execFileSync(process.execPath, [join(installed, "bin", "mister-clean.js"), "--help"], { stdio: "pipe" });
  });

  it("keeps ordinary CI independent from release-only attestation and packing", () => {
    const packageData = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const scripts = packageData.scripts;
    expect(packageData.scripts["ci:check"]).not.toMatch(/pack:smoke|prepare_release_archive|release:attestation/u);
    expect(scripts["build:raw"].split(" && ")).toEqual([
      "bun run build:scorecard",
      "bun run build:materials",
      "bun run control-plane:typecheck",
      "tsc --noEmit",
      "bun run package:source-surface:check",
      "tsup",
      "bun run control-plane:build",
      "bun run package:surface:check",
      "bun run sync:cli",
      "bun run manifest:package",
    ]);
    expect(scripts["generated:postbuild:check"]).toBe(
      "bun run build:scorecard:check && bun run build:materials:check && bun run sync:cli:check && bun run manifest:package:check",
    );
    expect(scripts["generated:check"]).toBe("bun scripts/verify_generated_candidate.ts --candidate=worktree");
    expect(scripts["generated:staged:check"]).toBe("bun scripts/verify_generated_candidate.ts --candidate=staged");
    expect(scripts.test.indexOf("build:verified")).toBeLessThan(scripts.test.indexOf("test:node"));
    expect(scripts.test.indexOf("test:node")).toBeLessThan(scripts.test.indexOf("test:bun"));
    expect(scripts.test.indexOf("test:bun")).toBeLessThan(scripts.test.indexOf("control-plane:check"));
    expect(scripts["ci:check"]).toBe("bun scripts/run_clean_ci.ts --candidate=worktree");
    expect(CLEAN_CI_MATRIX).toEqual([
      "test:node",
      "test:bun",
      "control-plane:check",
      "pack:check",
      "audit:public",
      "audit:repository-boundaries",
      "generated:check",
      "generated:postbuild:check",
    ]);
    expect(scripts["release:check"]).toContain("prepare_release_archive.mjs");
    expect(scripts.prepack).toContain("Direct source packing is disabled");
    expect(scripts.prepack).not.toMatch(/bun run build|release:attestation:write/u);
    const verifiedBuild = readFileSync(join(root, "scripts", "run_verified_build.ts"), "utf8");
    expect(verifiedBuild).not.toContain('"build:raw"');
    expect(verifiedBuild).not.toContain('"generated:postbuild:check"');
  });

  it("pins every external workflow action and container image immutably", () => {
    const workflows = readdirSync(join(root, ".github", "workflows"))
      .filter((name) => /\.ya?ml$/u.test(name));
    expect(workflows.length).toBeGreaterThan(0);
    for (const workflow of workflows) {
      const source = readFileSync(join(root, ".github", "workflows", workflow), "utf8");
      for (const match of source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gmu)) {
        const reference = match[1];
        if (reference.startsWith("./")) continue;
        expect(reference, `${workflow}: mutable action ${reference}`).toMatch(/^[^@\s]+@[0-9a-f]{40}$/u);
      }
      for (const match of source.matchAll(/^\s*image:\s*["']?([^\s"'#]+)/gmu)) {
        const image = match[1];
        expect(image, `${workflow}: mutable container ${image}`).toMatch(/@sha256:[0-9a-f]{64}$/u);
      }
      const visit = (value, path = "$") => {
        if (Array.isArray(value)) {
          value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
          return;
        }
        if (value === null || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value)) {
          const childPath = `${path}.${key}`;
          if ((key === "image" || key === "container") && typeof child === "string") {
            expect(child, `${workflow}:${childPath}: mutable container ${child}`).toMatch(/@sha256:[0-9a-f]{64}$/u);
          }
          visit(child, childPath);
        }
      };
      visit(parseYaml(source));
    }
  });

  it("requires an absolute archive path", () => {
    const result = spawnSync(process.execPath, [verifier, "--archive", "fixture.tgz"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--archive must be an absolute path");
  });

  it("requires the retained release directory to be outside the source repository", () => {
    const destination = join(root, ".forbidden-release-output");
    const result = spawnSync(process.execPath, [preparer, "--destination", destination], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("release destination must resolve outside the source repository");
    expect(existsSync(destination)).toBe(false);
  });

  it("resolves a symlinked destination parent before enforcing the outside-repository boundary", () => {
    const temporary = temporaryRoot();
    const alias = join(temporary, "source-alias");
    symlinkSync(root, alias);
    const destination = join(alias, "forbidden-release-output");
    const result = spawnSync(process.execPath, [preparer, "--destination", destination], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("release destination must resolve outside the source repository");
    expect(existsSync(destination)).toBe(false);
  });

  it("fails closed when RELEASE_ATTESTATION.json is absent", () => {
    const archive = archiveFixture((packageRoot) => {
      const digest = sha256File(join(packageRoot, "package.json"));
      writeFileSync(join(packageRoot, "MANIFEST.sha256"), `${digest}  ./package.json\n`, "utf8");
    });
    const result = spawnSync(process.execPath, [verifier, "--archive", archive], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("archive is missing required RELEASE_ATTESTATION.json");
  });

  it("independently derives package, tagged source, and manifest identity from a valid archive", () => {
    const archive = validReleaseArchiveFixture();
    const observed = inspectReleaseArchive(archive);
    expect(observed).toMatchObject({
      archive_sha256: sha256File(archive),
      package: { name: "@bradheitmann/mister-clean", version: "9.9.9-test" },
      claimed_source: { git_commit: "a".repeat(40), git_tag: "v9.9.9-test" },
      manifest: { format: "sha256sum-v1-lf", entry_count: 5 },
    });
  });

  it("attests the exact package.json bytes normalized by a real pnpm pack", async () => {
    const temporary = temporaryRoot();
    const source = join(temporary, "source");
    const packed = join(temporary, "packed");
    const unpacked = join(temporary, "unpacked");
    mkdirSync(source);
    mkdirSync(packed);
    mkdirSync(unpacked);

    const packageData = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    packageData.version = "9.9.9-test";
    packageData.files = [
      "SKILL.md",
      "bin/mister-clean.js",
      "dist/public.js",
      "dist/stdio.js",
      "MANIFEST.sha256",
      "RELEASE_ATTESTATION.json",
    ];
    packageData.scripts = {
      test: "node -e \"process.exit(0)\"",
      prepack: "node -e \"process.exit(0)\"",
    };
    const sourcePackageBytes = `${JSON.stringify(packageData, null, 2)}\n`;
    writeFileSync(join(source, "package.json"), sourcePackageBytes, "utf8");
    for (const [path, content] of [
      ["SKILL.md", "---\nname: mister-clean\n---\n"],
      ["bin/mister-clean.js", "#!/usr/bin/env node\n"],
      ["dist/public.js", "export const fixture = true;\n"],
      ["dist/stdio.js", "export const fixture = true;\n"],
      ["MANIFEST.sha256", "pre-pack placeholder\n"],
      ["RELEASE_ATTESTATION.json", "{}\n"],
    ]) {
      mkdirSync(dirname(join(source, path)), { recursive: true });
      writeFileSync(join(source, path), content, "utf8");
    }

    execFileSync("pnpm", ["--config.ignore-scripts=true", "pack", "--pack-destination", packed], {
      cwd: source,
      stdio: "pipe",
    });
    const archives = readdirSync(packed).filter((name) => name.endsWith(".tgz"));
    expect(archives).toHaveLength(1);
    const intermediate = join(packed, archives[0]);
    execFileSync("tar", ["-xzf", intermediate, "-C", unpacked], { stdio: "pipe" });
    const capsule = join(unpacked, "package");
    const packedPackageBytes = readFileSync(join(capsule, "package.json"), "utf8");
    const packedPackageData = JSON.parse(packedPackageBytes);
    expect(packedPackageBytes).not.toBe(sourcePackageBytes);
    expect(packedPackageData).not.toHaveProperty("packageManager");
    expect(packedPackageData.scripts).not.toHaveProperty("prepack");

    const manifest = await generateAttestedPackageManifest(capsule);
    writeFileSync(join(capsule, "MANIFEST.sha256"), manifest.content, "utf8");
    const attestation = await createReleaseAttestation(capsule, {
      git_commit: "a".repeat(40),
      git_tag: "v9.9.9-test",
    });
    writeFileSync(join(capsule, "RELEASE_ATTESTATION.json"), releaseAttestationBytes(attestation), "utf8");

    const finalArchive = join(temporary, "pnpm-normalized-final.tgz");
    createPortablePackageArchive({ packageParent: unpacked, archive: finalArchive });
    expect(inspectReleaseArchive(finalArchive)).toMatchObject({
      package: { name: "@bradheitmann/mister-clean", version: "9.9.9-test" },
      claimed_source: { git_commit: "a".repeat(40), git_tag: "v9.9.9-test" },
    });
    const packageRow = manifest.entries.find((entry) => entry.path === "./package.json");
    expect(packageRow?.sha256).toBe(createHash("sha256").update(packedPackageBytes).digest("hex"));
  });

  it("writes a capsule attestation from a separately verified tagged source", async () => {
    const temporary = temporaryRoot();
    const source = join(temporary, "source");
    const capsule = join(temporary, "capsule");
    mkdirSync(source);
    mkdirSync(capsule);
    const packageData = {
      name: "@bradheitmann/mister-clean",
      version: "9.9.9-test",
      type: "module",
      files: ["SKILL.md", "bin/mister-clean.js", "dist/public.js", "dist/stdio.js", "MANIFEST.sha256", "RELEASE_ATTESTATION.json"],
    };
    for (const packageRoot of [source, capsule]) {
      writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify(packageData, null, 2)}\n`, "utf8");
      for (const [path, content] of [
        ["SKILL.md", "---\nname: mister-clean\n---\n"],
        ["bin/mister-clean.js", "#!/usr/bin/env node\n"],
        ["dist/public.js", "export const fixture = true;\n"],
        ["dist/stdio.js", "export const fixture = true;\n"],
      ]) {
        mkdirSync(dirname(join(packageRoot, path)), { recursive: true });
        writeFileSync(join(packageRoot, path), content, "utf8");
      }
    }
    const sourceManifest = await generateAttestedPackageManifest(source);
    writeFileSync(join(source, "MANIFEST.sha256"), sourceManifest.content, "utf8");
    execFileSync("git", ["init", "-b", "main"], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["config", "user.name", "Release Fixture"], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "release-fixture.invalid"], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["add", "."], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "release fixture"], { cwd: source, stdio: "pipe" });
    execFileSync("git", ["tag", "v9.9.9-test"], { cwd: source, stdio: "pipe" });

    const output = execFileSync("bun", [
      attestationGenerator,
      "--capsule-write",
      "--root", capsule,
      "--source-root", source,
      "--json",
    ], { cwd: root, encoding: "utf8" });
    expect(JSON.parse(output)).toMatchObject({
      status: "pass",
      package: { name: "@bradheitmann/mister-clean", version: "9.9.9-test" },
      claimed_source: { git_tag: "v9.9.9-test" },
    });
    const capsuleManifest = await generateAttestedPackageManifest(capsule);
    expect(readFileSync(join(capsule, "MANIFEST.sha256"), "utf8")).toBe(capsuleManifest.content);
  });

  it("rejects symlinks before extracting an archive", () => {
    const archive = archiveFixture((packageRoot) => {
      symlinkSync("package.json", join(packageRoot, "alias.json"));
    });
    const result = spawnSync(process.execPath, [verifier, "--archive", archive], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("archive contains non-regular member type");
  });

  it("rehashes the retained archive before pnpm publication", () => {
    const archive = archiveFixture();
    const retainedRoot = dirname(archive);
    chmodSync(archive, 0o444);
    const retainedPublisher = join(retainedRoot, "publish_release_archive.mjs");
    const retainedVerifier = join(retainedRoot, "release_archive_contract.mjs");
    copyFileSync(publisher, retainedPublisher);
    copyFileSync(archiveContract, retainedVerifier);
    chmodSync(retainedPublisher, 0o444);
    chmodSync(retainedVerifier, 0o444);
    const receipt = join(retainedRoot, "release-archive-receipt.json");
    writeFileSync(receipt, `${JSON.stringify({
      record_type: "mister-clean.release-archive-receipt",
      schema_version: "1.1",
      status: "verified_not_published",
      package: { name: "fixture", version: "1.0.0" },
      archive: {
        path: "fixture.tgz",
        created_absolute_path: archive,
        sha256: "0".repeat(64),
        size_bytes: readFileSync(archive).length,
      },
      publisher: {
        entrypoint: {
          path: "publish_release_archive.mjs",
          sha256: sha256File(retainedPublisher),
          size_bytes: readFileSync(retainedPublisher).length,
        },
        verifier: {
          path: "release_archive_contract.mjs",
          sha256: sha256File(retainedVerifier),
          size_bytes: readFileSync(retainedVerifier).length,
        },
      },
      publish: {
        tool: "pnpm",
        registry: "https://registry.npmjs.org/",
        cwd_policy: "system_temp_root_outside_package_project",
        argv: ["publish", "--access", "public", "--registry", "https://registry.npmjs.org/", "fixture.tgz"],
      },
    })}\n`, "utf8");
    chmodSync(receipt, 0o444);
    const result = spawnSync(process.execPath, [retainedPublisher, "--receipt", receipt], {
      cwd: root,
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("release archive digest differs from its verification receipt");
  });

  it("refuses a forged receipt even when npmjs metadata is made to match the arbitrary archive", () => {
    const archive = archiveFixture();
    const retainedRoot = dirname(archive);
    chmodSync(archive, 0o444);
    const retainedPublisher = join(retainedRoot, "publish_release_archive.mjs");
    copyFileSync(publisher, retainedPublisher);
    chmodSync(retainedPublisher, 0o444);
    const retainedVerifier = join(retainedRoot, "release_archive_contract.mjs");
    copyFileSync(archiveContract, retainedVerifier);
    chmodSync(retainedVerifier, 0o444);
    const fakeBin = join(retainedRoot, "fake-bin");
    mkdirSync(fakeBin);
    const fakePnpm = join(fakeBin, "pnpm");
    writeFileSync(fakePnpm, [
      "#!/usr/bin/env node",
      "const [command, subcommand] = process.argv.slice(2);",
      "if (command === 'config' && subcommand === 'get') console.log('https://registry.npmjs.org/');",
      "else if (command === 'view') console.log(JSON.stringify({ version: process.env.MC_VERSION, 'dist.integrity': process.env.MC_INTEGRITY, 'dist.shasum': process.env.MC_SHASUM }));",
      "else if (command === 'publish') process.exit(97);",
      "else process.exit(98);",
      "",
    ].join("\n"), "utf8");
    chmodSync(fakePnpm, 0o755);

    const archiveDigests = registryDigests(archive);
    const receipt = join(retainedRoot, "release-archive-receipt.json");
    writeFileSync(receipt, `${JSON.stringify({
      record_type: "mister-clean.release-archive-receipt",
      schema_version: "1.1",
      status: "verified_not_published",
      package: { name: "@bradheitmann/mister-clean", version: "9.9.9-test" },
      archive: {
        path: "fixture.tgz",
        created_absolute_path: archive,
        sha256: sha256File(archive),
        size_bytes: readFileSync(archive).length,
      },
      publisher: {
        entrypoint: {
          path: "publish_release_archive.mjs",
          sha256: sha256File(retainedPublisher),
          size_bytes: readFileSync(retainedPublisher).length,
        },
        verifier: {
          path: "release_archive_contract.mjs",
          sha256: sha256File(retainedVerifier),
          size_bytes: readFileSync(retainedVerifier).length,
        },
      },
      publish: {
        tool: "pnpm",
        registry: "https://registry.npmjs.org/",
        cwd_policy: "system_temp_root_outside_package_project",
        argv: ["publish", "--access", "public", "--registry", "https://registry.npmjs.org/", "fixture.tgz"],
      },
    })}\n`, "utf8");
    chmodSync(receipt, 0o444);

    const result = spawnSync(process.execPath, [retainedPublisher, "--receipt", receipt], {
      cwd: retainedRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        MC_VERSION: "9.9.9-test",
        MC_INTEGRITY: archiveDigests.integrity,
        MC_SHASUM: archiveDigests.shasum,
      },
    });
    expect(result.status).toBe(1);
    expect(existsSync(join(retainedRoot, "publication-receipt.json"))).toBe(false);
    expect(result.stderr).toContain("MANIFEST.sha256");
  });

  it("publishes an exact relocated receipt capsule through its own portable command", () => {
    const sourceArchive = validReleaseArchiveFixture();
    const identity = inspectReleaseArchive(sourceArchive);
    const rootPath = temporaryRoot();
    const sourceCapsule = join(rootPath, "source-capsule");
    const relocated = join(rootPath, "relocated-capsule");
    const fakeBin = join(rootPath, "fake-bin");
    mkdirSync(sourceCapsule);
    mkdirSync(relocated);
    mkdirSync(fakeBin);

    const archiveName = "mister-clean-9.9.9-test.tgz";
    const capsuleArchive = join(sourceCapsule, archiveName);
    const capsulePublisher = join(sourceCapsule, "publish_release_archive.mjs");
    const capsuleVerifier = join(sourceCapsule, "release_archive_contract.mjs");
    copyFileSync(sourceArchive, capsuleArchive);
    copyFileSync(publisher, capsulePublisher);
    copyFileSync(archiveContract, capsuleVerifier);

    const receipt = {
      record_type: "mister-clean.release-archive-receipt",
      schema_version: "1.1",
      status: "verified_not_published",
      package: identity.package,
      claimed_source: identity.claimed_source,
      claim_scope: identity.claim_scope,
      origin_authenticity: identity.origin_authenticity,
      manifest: identity.manifest,
      archive: {
        path: archiveName,
        created_absolute_path: capsuleArchive,
        sha256: sha256File(capsuleArchive),
        size_bytes: readFileSync(capsuleArchive).length,
        mode: "0444",
      },
      publisher: {
        entrypoint: {
          path: "publish_release_archive.mjs",
          sha256: sha256File(capsulePublisher),
          size_bytes: readFileSync(capsulePublisher).length,
          mode: "0444",
        },
        verifier: {
          path: "release_archive_contract.mjs",
          sha256: sha256File(capsuleVerifier),
          size_bytes: readFileSync(capsuleVerifier).length,
          mode: "0444",
        },
      },
      publish: {
        status: "not_executed",
        tool: "pnpm",
        registry: npmjsRegistry,
        concurrency_policy: "single_authorized_publication_lane",
        cwd_policy: "system_temp_root_outside_package_project",
        argv: [
          "publish", "--access", "public", "--registry", npmjsRegistry,
          scopedRegistryOverride,
          archiveName,
        ],
        shell_command: "node './publish_release_archive.mjs' --receipt './release-archive-receipt.json'",
      },
    };
    const sourceReceipt = join(sourceCapsule, "release-archive-receipt.json");
    writeFileSync(sourceReceipt, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

    for (const filename of [archiveName, "publish_release_archive.mjs", "release_archive_contract.mjs", "release-archive-receipt.json"]) {
      copyFileSync(join(sourceCapsule, filename), join(relocated, filename));
      chmodSync(join(relocated, filename), 0o644);
    }
    const relocatedReceipt = join(relocated, "release-archive-receipt.json");
    const parentReceiptSha256 = sha256File(relocatedReceipt);
    const digests = registryDigests(join(relocated, archiveName));
    const argvLog = join(rootPath, "pnpm-argv.jsonl");
    const fakePnpm = join(fakeBin, "pnpm");
    writeFileSync(fakePnpm, [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "fs.appendFileSync(process.env.MC_ARGV_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');",
      // Model pnpm 11+ (Rust CLI): the pnpm-10 `--@scope:registry=` spelling is rejected at argument parsing,
      // and an unpublished version is reported as a JSON error object on stdout, not "E404 Not Found".
      "if (process.argv.slice(2).some((argument) => argument.startsWith('--@'))) { console.error(\"error: unexpected argument '--@bradheitmann:registry' found\"); process.exit(2); }",
      "if (process.argv[2] === 'view' && !fs.existsSync(process.env.MC_PUBLISHED_MARK)) { console.log(JSON.stringify({ error: { code: 'ERR_PNPM_PACKAGE_NOT_FOUND', message: 'No matching version found for ' + process.argv[3] } })); process.exit(1); }",
      "else if (process.argv[2] === 'view') console.log(JSON.stringify({ version: process.env.MC_VERSION, 'dist.integrity': process.env.MC_INTEGRITY, 'dist.shasum': process.env.MC_SHASUM }));",
      "else if (process.argv[2] === 'publish') { fs.writeFileSync(process.env.MC_PUBLISHED_MARK, 'published\\n'); process.exit(97); }",
      "else process.exit(98);",
      "",
    ].join("\n"), "utf8");
    chmodSync(fakePnpm, 0o755);

    const result = spawnSync("sh", ["-c", receipt.publish.shell_command], {
      cwd: relocated,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        MC_ARGV_LOG: argvLog,
        MC_PUBLISHED_MARK: join(rootPath, "published.mark"),
        MC_VERSION: identity.package.version,
        MC_INTEGRITY: digests.integrity,
        MC_SHASUM: digests.shasum,
      },
    });
    expect(result.status, result.stderr).toBe(0);
    const publication = JSON.parse(readFileSync(join(relocated, "publication-receipt.json"), "utf8"));
    expect(publication).toMatchObject({
      record_type: "mister-clean.publication-receipt",
      schema_version: "1.1",
      status: "published_verified",
      publication_mode: "reconciled_after_ambiguous_publish_exit",
      package: identity.package,
      claimed_source: identity.claimed_source,
      origin_authenticity: identity.origin_authenticity,
      source_receipt: {
        path: "release-archive-receipt.json",
        sha256: parentReceiptSha256,
      },
    });
    expect(publication).not.toHaveProperty("published_at");
    expect(JSON.stringify(publication)).not.toContain(rootPath);
    const calls = readFileSync(argvLog, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(calls).toHaveLength(4);
    expect(calls.every((call) => call.includes(scopedRegistryOverride))).toBe(true);
    expect(calls.every((call) => call.includes(npmjsRegistry))).toBe(true);
    const publishCall = calls.find((call) => call[0] === "publish");
    expect(publishCall).toBeDefined();
    const publishedArchive = publishCall.find((argument) => argument.endsWith(".tgz"));
    expect(publishedArchive).toContain("mister-clean-archive-custody-");
    expect(publishedArchive).not.toContain(relocated);
  });
});
