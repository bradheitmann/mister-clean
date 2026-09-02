import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { assertSafeArchiveMembers } from "./release_archive_contract.mjs";

const METADATA_FREE_ENV = Object.freeze({
  COPYFILE_DISABLE: "1",
  COPY_EXTENDED_ATTRIBUTES_DISABLE: "1",
});

const WINDOWS_LOCATOR_KEYS = Object.freeze([
  "ComSpec",
  "PATHEXT",
  "SystemDrive",
  "SystemRoot",
  "WINDIR",
]);

/**
 * A release child receives executable-location data, never the caller's ambient
 * credentials, hooks, proxies, package-manager state, or source-directory
 * markers. Every writable home/cache/temp/config location is rebased beneath
 * the external capsule boundary.
 */
export function releaseProcessEnvironment(capsuleRoot, inherited = process.env, cwd = capsuleRoot) {
  const capsule = resolve(capsuleRoot);
  const workingDirectory = resolve(cwd);
  if (!contained(capsule, workingDirectory)) {
    throw new Error("release child working directory escapes its capsule boundary");
  }
  const state = join(capsule, ".release-process-state");
  const home = join(state, "home");
  const temporary = join(state, "tmp");
  const xdg = join(state, "xdg");
  const bun = join(state, "bun");
  const pnpm = join(state, "pnpm");
  for (const directory of [state, home, temporary, xdg, bun, pnpm]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
  }
  const environment = {
    ...METADATA_FREE_ENV,
    NODE_ENV: "production",
    BUN_ENV: "production",
    CI: "true",
    TZ: "UTC",
    LANG: "C",
    LC_ALL: "C",
    NO_COLOR: "1",
    SOURCE_DATE_EPOCH: "0",
    PWD: workingDirectory,
    OLDPWD: workingDirectory,
    INIT_CWD: workingDirectory,
    HOME: home,
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    XDG_CONFIG_HOME: join(xdg, "config"),
    XDG_CACHE_HOME: join(xdg, "cache"),
    XDG_DATA_HOME: join(xdg, "data"),
    XDG_STATE_HOME: join(xdg, "state"),
    XDG_RUNTIME_DIR: join(xdg, "runtime"),
    BUN_INSTALL: bun,
    BUN_INSTALL_CACHE_DIR: join(bun, "cache"),
    PNPM_HOME: pnpm,
    COREPACK_HOME: join(state, "corepack"),
    npm_config_cache: join(state, "npm-cache"),
    npm_config_store_dir: join(state, "pnpm-store"),
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
  };
  if (typeof inherited.PATH === "string") environment.PATH = inherited.PATH;
  for (const key of WINDOWS_LOCATOR_KEYS) {
    if (typeof inherited[key] === "string") environment[key] = inherited[key];
  }
  return environment;
}

function codePointOrder(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function contained(root, path) {
  const relationship = relative(root, path);
  return relationship === "" || (!isAbsolute(relationship) && relationship !== ".." && !relationship.startsWith(`..${sep}`));
}

function filesystemEntryExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function snapshotDependencyTree(root, includeMtime) {
  const rows = [];
  function visit(directory) {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => codePointOrder(left.name, right.name));
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).split(sep).join("/");
      const metadata = lstatSync(absolute, { bigint: true });
      const common = {
        path,
        mode: Number(metadata.mode & 0o7777n),
        ...(includeMtime ? { mtime_ns: metadata.mtimeNs.toString() } : {}),
      };
      if (metadata.isDirectory()) {
        rows.push({ ...common, type: "directory" });
        visit(absolute);
      } else if (metadata.isFile()) {
        rows.push({ ...common, type: "file", size: Number(metadata.size), sha256: sha256File(absolute) });
      } else if (metadata.isSymbolicLink()) {
        rows.push({ ...common, type: "symlink", target: readlinkSync(absolute) });
      } else {
        throw new Error(`dependency tree contains unsupported filesystem entry ${path}`);
      }
    }
  }
  visit(root);
  return rows;
}

function assertRelativeContainedSymlink(root, path) {
  const target = readlinkSync(path);
  if (isAbsolute(target)) throw new Error(`dependency symlink target is absolute: ${relative(root, path)}`);
  const lexicalTarget = resolve(dirname(path), target);
  if (!contained(root, lexicalTarget)) throw new Error(`dependency symlink target escapes lexically: ${relative(root, path)}`);
  let canonicalTarget;
  try {
    canonicalTarget = realpathSync(path);
  } catch {
    throw new Error(`dependency symlink is dangling: ${relative(root, path)}`);
  }
  if (!contained(realpathSync(root), canonicalTarget)) {
    throw new Error(`dependency symlink target escapes canonically: ${relative(root, path)}`);
  }
}

/** Copy pnpm's relative-link topology without leaving a write path to source. */
export function copyIsolatedPnpmTree(sourceRoot, destinationRoot) {
  const source = resolve(sourceRoot);
  const destination = resolve(destinationRoot);
  const sourceMetadata = lstatSync(source);
  if (!sourceMetadata.isDirectory() || sourceMetadata.isSymbolicLink()) {
    throw new Error("source dependency root must be a real directory");
  }
  if (filesystemEntryExists(destination)) throw new Error("isolated dependency destination already exists");
  const canonicalSource = realpathSync(source);
  for (const row of snapshotDependencyTree(source, false).filter((entry) => entry.type === "symlink")) {
    assertRelativeContainedSymlink(canonicalSource, join(canonicalSource, row.path));
  }
  const sourceIdentity = snapshotDependencyTree(source, false);
  const sourceIntegrity = snapshotDependencyTree(source, true);
  mkdirSync(destination, { mode: sourceMetadata.mode & 0o7777 });
  function copyDirectory(sourceDirectory, destinationDirectory) {
    const entries = readdirSync(sourceDirectory, { withFileTypes: true }).sort((left, right) => codePointOrder(left.name, right.name));
    for (const entry of entries) {
      const sourcePath = join(sourceDirectory, entry.name);
      const destinationPath = join(destinationDirectory, entry.name);
      const metadata = lstatSync(sourcePath);
      if (metadata.isDirectory()) {
        mkdirSync(destinationPath, { mode: metadata.mode & 0o7777 });
        chmodSync(destinationPath, metadata.mode & 0o7777);
        copyDirectory(sourcePath, destinationPath);
      } else if (metadata.isFile()) {
        copyFileSync(sourcePath, destinationPath, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
        chmodSync(destinationPath, metadata.mode & 0o7777);
        const copied = lstatSync(destinationPath);
        if (metadata.dev === copied.dev && metadata.ino === copied.ino) {
          throw new Error(`isolated dependency copy shares an inode: ${relative(source, sourcePath)}`);
        }
      } else if (metadata.isSymbolicLink()) {
        symlinkSync(readlinkSync(sourcePath), destinationPath);
      } else {
        throw new Error(`dependency tree contains unsupported filesystem entry ${relative(source, sourcePath)}`);
      }
    }
  }
  try {
    copyDirectory(source, destination);
    chmodSync(destination, sourceMetadata.mode & 0o7777);
    const destinationIdentity = snapshotDependencyTree(destination, false);
    if (JSON.stringify(destinationIdentity) !== JSON.stringify(sourceIdentity)) {
      throw new Error("isolated dependency tree differs from source dependency identity");
    }
    const canonicalDestination = realpathSync(destination);
    for (const row of destinationIdentity.filter((entry) => entry.type === "symlink")) {
      assertRelativeContainedSymlink(canonicalDestination, join(canonicalDestination, row.path));
    }
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    throw error;
  }
  return Object.freeze({ source, source_integrity: Object.freeze(sourceIntegrity) });
}

/**
 * Give source-development build tools a real Git-root boundary without exposing
 * or mutating the source checkout. The staged index must reconstruct the exact
 * source commit tree before any generated byte is allowed to exist.
 */
function initializeExactCapsuleGitBoundary({ source, commit, buildRoot, environment }) {
  execFileSync("git", ["--no-optional-locks", "init", "--quiet", buildRoot], { env: environment, stdio: "pipe" });
  execFileSync("git", ["--no-optional-locks", "-C", buildRoot, "add", "--all", "--force"], { env: environment, stdio: "pipe" });
  const expectedTree = execFileSync("git", ["--no-optional-locks", "-C", source, "rev-parse", `${commit}^{tree}`], {
    encoding: "utf8",
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const capsuleTree = execFileSync("git", ["--no-optional-locks", "-C", buildRoot, "write-tree"], {
    encoding: "utf8",
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (capsuleTree !== expectedTree) {
    throw new Error(`external build capsule tree differs from source commit: expected ${expectedTree}, observed ${capsuleTree}`);
  }
  execFileSync("git", ["--no-optional-locks",
    "-C", buildRoot,
    "-c", "user.name=Mister Clean Release Capsule",
    "-c", "user.email=release-capsule.invalid",
    "commit", "--quiet", "--no-gpg-sign", "--no-verify", "-m", "exact release capsule",
  ], { env: environment, stdio: "pipe" });
}

/**
 * Build and pack a committed Git tree entirely outside its source checkout.
 * Dependency installation is reconstructed from the committed pnpm lockfile;
 * the source checkout's node_modules tree is never an input.
 */
export function createExternalPnpmArchive({
  sourceRoot,
  commit,
  staging,
}) {
  const source = resolve(sourceRoot);
  const external = resolve(staging);
  const sourceTar = join(external, "source-tree.tar");
  const buildRoot = join(external, "source-tree");
  mkdirSync(buildRoot, { mode: 0o700 });
  const externalEnvironment = releaseProcessEnvironment(external, process.env, external);
  const buildEnvironment = releaseProcessEnvironment(external, process.env, buildRoot);
  execFileSync("git", ["--no-optional-locks", "-C", source, "archive", "--format=tar", `--output=${sourceTar}`, commit], {
    env: externalEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  execFileSync("tar", ["-xf", sourceTar, "-C", buildRoot], {
    env: externalEnvironment,
    stdio: "pipe",
  });
  initializeExactCapsuleGitBoundary({ source, commit, buildRoot, environment: buildEnvironment });

  const externalDependencies = join(buildRoot, "node_modules");
  let capsuleFailure = null;
  try {
    execFileSync("pnpm", ["install", "--frozen-lockfile", "--prod=false", "--ignore-scripts"], {
      cwd: buildRoot,
      env: buildEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    execFileSync("bun", ["run", "build"], {
      cwd: buildRoot,
      env: buildEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    capsuleFailure = error;
  }
  let cleanupFailure = null;
  try {
    rmSync(externalDependencies, { recursive: true, force: true });
  } catch (error) {
    cleanupFailure = error;
  }
  const failures = [capsuleFailure, cleanupFailure].filter((failure) => failure !== null);
  if (failures.length > 1) throw new AggregateError(failures, "external build capsule failed multiple isolation checks");
  if (failures.length === 1) throw failures[0];
  if (existsSync(externalDependencies)) {
    throw new Error("isolated dependency tree remains after external build cleanup");
  }

  execFileSync("pnpm", ["--config.ignore-scripts=true", "pack", "--pack-destination", external], {
    cwd: buildRoot,
    env: buildEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const archives = readdirSync(external).filter((name) => name.endsWith(".tgz"));
  if (archives.length !== 1) throw new Error(`expected one pnpm archive, found ${archives.length}`);
  const archive = resolve(external, archives[0]);
  assertSafeArchiveMembers(archive);
  return archive;
}

/** Create a package archive while suppressing platform metadata at the writer. */
export function createPortablePackageArchive({ packageParent, archive }) {
  const metadataFlags = process.platform === "darwin"
    ? ["--no-xattrs", "--no-mac-metadata"]
    : [];
  const capsule = resolve(packageParent);
  const processState = join(capsule, ".release-process-state");
  if (filesystemEntryExists(processState)) {
    throw new Error("portable package capsule already contains release process state");
  }
  const environment = releaseProcessEnvironment(capsule, process.env, capsule);
  try {
    execFileSync("tar", [...metadataFlags, "--format=ustar", "-czf", resolve(archive), "-C", capsule, "package"], {
      env: environment,
      stdio: "pipe",
    });
  } finally {
    rmSync(processState, { recursive: true, force: true });
  }
  assertSafeArchiveMembers(resolve(archive));
  return resolve(archive);
}
