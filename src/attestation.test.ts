import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  RELEASE_ATTESTATION_FILE,
  bindRuntimeAttestation,
  checkReleaseSourceConsistency,
  createReleaseAttestation,
  generateAttestedPackageManifest,
  releaseAttestationBytes,
  verifyReleaseAttestation,
} from "./attestation.js";

const temporaryRoots: string[] = [];
const commit = "0123456789abcdef0123456789abcdef01234567";
const tag = "v1.2.3";
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function fixture(name: string): Promise<string> {
  const root = join(tmpdir(), `mister-clean-attestation-${name}-${crypto.randomUUID()}`);
  await mkdir(root, { recursive: true });
  temporaryRoots.push(root);
  return root;
}

async function put(root: string, path: string, content: string): Promise<void> {
  const target = join(root, path);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, content, "utf8");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function packageFixture(name: string): Promise<string> {
  const root = await fixture(name);
  await put(root, "package.json", JSON.stringify({
    name: "@bradheitmann/mister-clean",
    version: "1.2.3",
    files: [
      "RELEASE_ATTESTATION.json",
      "MANIFEST.sha256",
      "SKILL.md",
      "bin/*.js",
      "dist/*.js",
    ],
  }, null, 2) + "\n");
  await put(root, "SKILL.md", "skill\n");
  await put(root, "bin/mister-clean.js", "cli\n");
  await put(root, "dist/public.js", "public server\n");
  await put(root, "dist/stdio.js", "stdio\n");
  const manifest = await generateAttestedPackageManifest(root);
  await put(root, "MANIFEST.sha256", manifest.content);
  const attestation = await createReleaseAttestation(root, { git_commit: commit, git_tag: tag });
  await put(root, RELEASE_ATTESTATION_FILE, releaseAttestationBytes(attestation));
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("release attestation", () => {
  it("binds package identity, source identity, manifest bytes, and required entrypoints", async () => {
    const root = await packageFixture("valid");
    const result = await verifyReleaseAttestation(root);
    expect(result.status).toBe("pass");
    expect(result.errors).toEqual([]);
    expect(result.package).toEqual({ name: "@bradheitmann/mister-clean", version: "1.2.3" });
    expect(result.claimed_source).toEqual({ git_commit: commit, git_tag: tag });
    expect(result.claim_scope).toEqual({
      covers: "own_package_regular_file_bytes",
      excludes: [
        "registry_publication_provenance",
        "dependency_resolution_graph",
        "filesystem_mode_bits_xattrs_and_timestamps",
        "release_attestation_self_bytes",
        "claimed_source_authenticity",
      ],
    });
    expect(result.manifest).toMatchObject({ entry_count: 5, observed_entry_count: 5 });
    expect(result.required_entrypoints?.map((entry) => entry.path).sort()).toEqual([
      "./SKILL.md",
      "./bin/mister-clean.js",
      "./dist/public.js",
      "./dist/stdio.js",
    ]);
  });

  it("excludes RELEASE_ATTESTATION.json from the manifest hash", async () => {
    const root = await packageFixture("excluded");
    const before = await generateAttestedPackageManifest(root);
    await put(root, RELEASE_ATTESTATION_FILE, `${await readFile(join(root, RELEASE_ATTESTATION_FILE), "utf8")}\n`);
    const after = await generateAttestedPackageManifest(root);
    expect(after.content).toBe(before.content);
    expect(hash(after.content)).toBe(hash(before.content));
  });

  it("fails closed on same-version content drift", async () => {
    const root = await packageFixture("drift");
    await put(root, "SKILL.md", "changed skill\n");
    const result = await verifyReleaseAttestation(root);
    expect(result.status).toBe("fail");
    expect(result.errors).toContain("MANIFEST.sha256: stale or not generated from attested package surface");
    expect(result.errors).toContain("$.required_entrypoints[./SKILL.md]: does not match package bytes");
  });

  it("rejects every unexpected file in an extracted package surface", async () => {
    const root = await packageFixture("unexpected-file");
    await put(root, "unexpected-secret.txt", "must not ship\n");
    const result = await verifyReleaseAttestation(root);
    expect(result.status).toBe("fail");
    expect(result.errors).toContain("package surface: unexpected file: unexpected-secret.txt");
  });

  it("rejects registry and tarball facts inside in-package attestation", async () => {
    const root = await packageFixture("registry-fact");
    const attestation = JSON.parse(await readFile(join(root, RELEASE_ATTESTATION_FILE), "utf8")) as Record<string, unknown>;
    attestation.release = { npm_integrity: "sha512-forbidden" };
    await put(root, RELEASE_ATTESTATION_FILE, `${JSON.stringify(attestation, null, 2)}\n`);
    const result = await verifyReleaseAttestation(root);
    expect(result.status).toBe("fail");
    expect(result.errors).toContain(`$.release.npm_integrity: registry/publish fact is forbidden in ${RELEASE_ATTESTATION_FILE}`);
  });

  it("requires the source tag to match the package version exactly", async () => {
    const root = await packageFixture("tag-mismatch");
    const attestation = JSON.parse(await readFile(join(root, RELEASE_ATTESTATION_FILE), "utf8")) as Record<string, unknown>;
    attestation.claimed_source = { git_commit: commit, git_tag: "release-1.2.3" };
    await put(root, RELEASE_ATTESTATION_FILE, `${JSON.stringify(attestation, null, 2)}\n`);
    const result = await verifyReleaseAttestation(root);
    expect(result.status).toBe("fail");
    expect(result.errors).toContain("$.claimed_source.git_tag: must equal v${package.version}");
  });

  it("refuses an overbroad or missing package-attestation claim scope", async () => {
    const root = await packageFixture("claim-scope");
    const attestation = JSON.parse(await readFile(join(root, RELEASE_ATTESTATION_FILE), "utf8")) as Record<string, unknown>;
    delete attestation.claim_scope;
    await put(root, RELEASE_ATTESTATION_FILE, `${JSON.stringify(attestation, null, 2)}\n`);
    const result = await verifyReleaseAttestation(root);
    expect(result.status).toBe("fail");
    expect(result.errors).toContain("$.claim_scope.covers: expected own_package_regular_file_bytes");
    expect(result.errors.some((error) => error.startsWith("$.claim_scope.excludes:"))).toBe(true);
  });

  it("refuses to create an attestation with a non-version source tag", async () => {
    const root = await fixture("create-tag-mismatch");
    await put(root, "package.json", JSON.stringify({
      name: "@bradheitmann/mister-clean",
      version: "1.2.3",
      files: ["SKILL.md"],
    }));
    await put(root, "SKILL.md", "skill\n");
    await expect(createReleaseAttestation(root, { git_commit: commit, git_tag: "release-1.2.3" }))
      .rejects.toThrow("source git_tag must equal v1.2.3");
  });

  it("rejects symlinked files in the package surface", async () => {
    const root = await fixture("symlink");
    await put(root, "package.json", JSON.stringify({
      name: "@bradheitmann/mister-clean",
      version: "1.2.3",
      files: ["SKILL.md"],
    }));
    await put(root, "real-skill.md", "skill\n");
    await symlink("real-skill.md", join(root, "SKILL.md"));
    await expect(generateAttestedPackageManifest(root)).rejects.toThrow("package manifest rejects symlinked package entry: SKILL.md");
  });

  it("allows explicit source-development binding but rejects unattested production roots", async () => {
    const root = await packageFixture("runtime");
    const pass = await bindRuntimeAttestation(root, {
      moduleUrl: pathToFileURL(join(root, "bin", "mister-clean.js")).href,
      expectedEntrypoint: "./bin/mister-clean.js",
    });
    expect(pass.status).toBe("pass");
    expect(pass.entrypoint).toMatchObject({
      path: "./bin/mister-clean.js",
      sha256: hash("cli\n"),
    });
    expect(Object.isFrozen(pass)).toBe(true);
    expect(Object.isFrozen(pass.claim_scope?.excludes)).toBe(true);

    const devRoot = await fixture("dev");
    await put(devRoot, "src/cli.ts", "development cli\n");
    execFileSync("git", ["init", "-q", devRoot]);
    const dev = await bindRuntimeAttestation(devRoot, {
      moduleUrl: pathToFileURL(join(devRoot, "src", "cli.ts")).href,
      expectedEntrypoint: "./bin/mister-clean.js",
      allowSourceDevelopment: true,
      sourceDevelopmentReason: "test source execution",
    });
    expect(dev).toMatchObject({ status: "source_development", reason: "test source execution" });

    const missingRoot = await fixture("prod-missing");
    await put(missingRoot, "bin/mister-clean.js", "unattested\n");
    await expect(bindRuntimeAttestation(missingRoot, {
      moduleUrl: pathToFileURL(join(missingRoot, "bin", "mister-clean.js")).href,
      expectedEntrypoint: "./bin/mister-clean.js",
    })).rejects.toThrow("Mister Clean runtime attestation failed");
  });

  it("rejects a copied or rogue runtime module beneath an otherwise valid package", async () => {
    const root = await packageFixture("rogue-runtime");
    await put(root, "rogue/mister-clean.js", "altered cli\n");
    await expect(bindRuntimeAttestation(root, {
      moduleUrl: pathToFileURL(join(root, "rogue", "mister-clean.js")).href,
      expectedEntrypoint: "./bin/mister-clean.js",
    })).rejects.toThrow("runtime entrypoint mismatch");
  });

  it("does not permit source-development mode from pathname alone", async () => {
    const root = await fixture("source-path-only");
    await put(root, "src/cli.ts", "development cli\n");
    await expect(bindRuntimeAttestation(root, {
      moduleUrl: pathToFileURL(join(root, "src", "cli.ts")).href,
      expectedEntrypoint: "./bin/mister-clean.js",
      allowSourceDevelopment: true,
    })).rejects.toThrow("requires a verified Git repository root");
  });

  it("requires release source consistency before writing final attestation", async () => {
    const root = await packageFixture("source-consistency");
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
    execFileSync("git", ["-C", root, "config", "user.email", "fixture.invalid"]);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", ["-C", root, "commit", "-qm", "release"]);
    execFileSync("git", ["-C", root, "tag", "v1.2.3"]);
    await expect(checkReleaseSourceConsistency(root)).resolves.toMatchObject({ status: "pass" });
    await put(root, "SKILL.md", "dirty\n");
    const result = await checkReleaseSourceConsistency(root);
    expect(result.status).toBe("fail");
    expect(result.errors.some((error) => error.includes("dirty paths"))).toBe(true);
  });

  it("rejects a material input hidden by the repository-local exclude file", async () => {
    const root = await packageFixture("ignored-material-input");
    const packageData = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { files: string[] };
    packageData.files.push("references/*.md");
    await put(root, "package.json", `${JSON.stringify(packageData, null, 2)}\n`);
    await put(root, "MANIFEST.sha256", (await generateAttestedPackageManifest(root)).content);
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
    execFileSync("git", ["-C", root, "config", "user.email", "fixture.invalid"]);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", ["-C", root, "commit", "-qm", "release"]);
    execFileSync("git", ["-C", root, "tag", "v1.2.3"]);

    await put(root, ".git/info/exclude", "references/private/hidden.md\n");
    await put(root, "references/private/hidden.md", "ignored build input\n");
    const result = await checkReleaseSourceConsistency(root);
    expect(result.status).toBe("fail");
    expect(result.errors).toContain(
      `release input: must be tracked at ${execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()}: references/private/hidden.md`,
    );
  });

  it("detects assume-unchanged edits to a release helper", async () => {
    const root = await packageFixture("assume-unchanged-helper");
    await put(root, "scripts/helper.mjs", "export const helper = 'bound';\n");
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
    execFileSync("git", ["-C", root, "config", "user.email", "fixture.invalid"]);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", ["-C", root, "commit", "-qm", "release"]);
    execFileSync("git", ["-C", root, "tag", "v1.2.3"]);
    execFileSync("git", ["-C", root, "update-index", "--assume-unchanged", "scripts/helper.mjs"]);
    await put(root, "scripts/helper.mjs", "export const helper = 'tampered';\n");

    const result = await checkReleaseSourceConsistency(root);
    const head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    expect(result.status).toBe("fail");
    expect(result.errors).toContain(`release input: working bytes differ from ${head}: scripts/helper.mjs`);
  });

  it("keeps generated release attestation ignored but explicitly packaged", async () => {
    const packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8")) as { files?: unknown };
    const gitignore = await readFile(join(repositoryRoot, ".gitignore"), "utf8");
    expect(packageJson.files).toContain("RELEASE_ATTESTATION.json");
    expect(gitignore.split("\n")).toContain("RELEASE_ATTESTATION.json");
  });
});
