/**
 * The OS sandbox every native gate runs in (master-gate S1c).
 *
 * S1 and S1b took the operator's credentials off a gate's PATH, environment and
 * git config, but target code can still name them by absolute path, start a
 * login shell that rebuilds the operator's environment, or write through the
 * CARGO_HOME symlinks into the operator's shared caches. The sandbox closes
 * those routes: network is denied, writes are confined to the gate's
 * disposable home, its snapshot and its temp directory, the operator's home is
 * unreadable except for the toolchain directories the gate shim resolves, and
 * the credential locations stay unreadable even inside those.
 *
 * The mechanism is detected, never assumed: macOS sandbox-exec, then Linux
 * bubblewrap, then the markers of a container that is itself the boundary.
 * With none of them a gate is refused unless the operator explicitly allows
 * unsandboxed gates, and such a record can never validate as CLEAN.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { userInfo } from "node:os";
import { basename, dirname, join, relative, resolve, isAbsolute, sep } from "node:path";

import type { ResolvedExecutable } from "./native-gate-runner.js";

export type GateSandboxMechanism = "sandbox-exec" | "bwrap" | "container" | "none";

export const GATE_SANDBOX_MECHANISMS: ReadonlySet<GateSandboxMechanism> = new Set(["sandbox-exec", "bwrap", "container", "none"]);

export const ALLOW_UNSANDBOXED_GATES_FLAG = "--allow-unsandboxed-gates";

export type GateSandboxDetection =
  | { readonly mechanism: "sandbox-exec" | "bwrap"; readonly executable: string }
  | { readonly mechanism: "container"; readonly marker: string }
  | { readonly mechanism: "none" };

/** The host facts detection reads. Injectable for deterministic tests; production uses `realGateSandboxHost`. */
export interface GateSandboxHost {
  readonly platform: NodeJS.Platform;
  readonly exists: (path: string) => boolean;
  readonly readFile: (path: string) => string | undefined;
  /** An executable on the operator's PATH, by absolute path. */
  readonly which: (name: string) => string | undefined;
  /** True when the mechanism at `executable` really confines a trivial command on this host. */
  readonly works: (mechanism: "sandbox-exec" | "bwrap", executable: string) => boolean;
}

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

/** Probe arguments that start /usr/bin/true (or /bin/true) under the mechanism with network denied. */
function probeArguments(mechanism: "sandbox-exec" | "bwrap"): readonly string[] {
  const truePath = existsSync("/usr/bin/true") ? "/usr/bin/true" : "/bin/true";
  return mechanism === "sandbox-exec"
    ? ["-p", "(version 1)\n(allow default)\n(deny network*)\n", truePath]
    : ["--unshare-net", "--die-with-parent", "--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "--", truePath];
}

const probed = new Map<string, boolean>();

export const realGateSandboxHost: GateSandboxHost = {
  platform: process.platform,
  exists: (path) => existsSync(path),
  readFile: (path) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return undefined;
    }
  },
  which: (name) => {
    for (const directory of (process.env.PATH ?? "").split(":")) {
      if (!directory || !isAbsolute(directory)) continue;
      const candidate = join(directory, name);
      if (existsSync(candidate)) return candidate;
    }
    return undefined;
  },
  works: (mechanism, executable) => {
    const key = `${mechanism}\0${executable}`;
    let result = probed.get(key);
    if (result === undefined) {
      const run = spawnSync(executable, probeArguments(mechanism), { stdio: "ignore", timeout: 10_000, env: { PATH: "/usr/bin:/bin" } });
      result = run.error === undefined && run.status === 0;
      probed.set(key, result);
    }
    return result;
  },
};

const CGROUP_CONTAINER = /\b(?:docker|containerd)\b/u;

/** Detect the sandbox mechanism, in order: sandbox-exec, bwrap, container markers, none. */
export function detectGateSandbox(host: GateSandboxHost = realGateSandboxHost): GateSandboxDetection {
  if (host.platform === "darwin" && host.exists(SANDBOX_EXEC) && host.works("sandbox-exec", SANDBOX_EXEC)) {
    return { mechanism: "sandbox-exec", executable: SANDBOX_EXEC };
  }
  if (host.platform === "linux") {
    const bwrap = host.which("bwrap");
    if (bwrap !== undefined && host.works("bwrap", bwrap)) return { mechanism: "bwrap", executable: bwrap };
  }
  for (const marker of ["/.dockerenv", "/run/.containerenv"]) {
    if (host.exists(marker)) return { mechanism: "container", marker };
  }
  const cgroup = host.readFile("/proc/1/cgroup");
  if (cgroup !== undefined && CGROUP_CONTAINER.test(cgroup)) {
    return { mechanism: "container", marker: `/proc/1/cgroup naming ${/\bcontainerd\b/u.test(cgroup) ? "containerd" : "docker"}` };
  }
  return { mechanism: "none" };
}

export class GateSandboxUnavailableError extends Error {
  readonly code = "gate_sandbox_unavailable";
  constructor() {
    super(
      "refusing to run native gates: no OS sandbox is available (macOS sandbox-exec, Linux bwrap, or a detected"
      + ` container boundary). Pass ${ALLOW_UNSANDBOXED_GATES_FLAG} to run them unsandboxed; the gate record then`
      + " says sandbox: \"none\" and the bundle cannot validate CLEAN",
    );
    this.name = "GateSandboxUnavailableError";
  }
}

/** The three directories a gate may write: all disposable, all inside its snapshot container. */
export interface GateSandboxPaths {
  readonly home: string;
  readonly snapshot: string;
  readonly temp: string;
}

/** Toolchain and dependency-cache locations, as `toolchainLocators` reports them. */
export type GateSandboxLocators = Partial<Record<"RUSTUP_HOME" | "CARGO_HOME" | "GOPATH" | "GOMODCACHE", string>>;

export interface GateSandboxPolicy {
  /** Write roots; every other write is denied. */
  readonly writable: readonly string[];
  /** The operator's homes: no file in them may be read, except under `readable`. */
  readonly hidden: readonly string[];
  /** Read-only exceptions inside a hidden root: toolchains and dependency caches. */
  readonly readable: readonly string[];
  /** Credential directories, unreadable even under a readable exception. */
  readonly credential_directories: readonly string[];
  /** Credential files, unreadable even under a readable exception. */
  readonly credential_files: readonly string[];
  /** Path prefixes (CARGO_HOME `credentials*`), unreadable even under a readable exception. */
  readonly credential_prefixes: readonly string[];
}

/** Credential locations under each operator home. */
const HOME_CREDENTIAL_DIRECTORIES = [".ssh", ".aws", join(".config", "gh"), join(".config", "doppler"), join("Library", "Keychains")] as const;
const HOME_CREDENTIAL_FILES = [join(".docker", "config.json")] as const;

/**
 * The real path of `path`, also when it does not exist yet: the deepest
 * existing ancestor is resolved and the rest appended. Sandbox rules match
 * resolved paths (/var is /private/var on macOS), so every rule path is one.
 */
export function canonicalPath(path: string): string {
  const absolute = resolve(path);
  let existing = absolute;
  const rest: string[] = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) return absolute;
    rest.unshift(basename(existing));
    existing = parent;
  }
  return join(realpathSync(existing), ...rest);
}

function inside(root: string, path: string): boolean {
  const relation = relative(root, path);
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

/** The operator's homes: HOME as the process sees it, and the account's home if it differs. */
export function operatorHomes(environment: NodeJS.ProcessEnv = process.env): readonly string[] {
  const homes = new Set<string>();
  if (environment.HOME) homes.add(canonicalPath(environment.HOME));
  try {
    homes.add(canonicalPath(userInfo().homedir));
  } catch {
    // An account without a passwd entry has only HOME.
  }
  return [...homes];
}

/**
 * The directories a resolved toolchain executable needs readable: the one that
 * holds the real file and, for a `bin` directory, its `lib` and `libexec`
 * siblings (node's npm, git's helpers). Never a whole home.
 */
function toolchainDirectories(executable: ResolvedExecutable): readonly string[] {
  const directory = dirname(canonicalPath(executable.resolved));
  if (basename(directory) !== "bin") return [directory];
  const prefix = dirname(directory);
  return [directory, join(prefix, "lib"), join(prefix, "libexec")];
}

/**
 * The per-gate policy. `toolchain` is every executable the gate's shim directory
 * links, plus the gate's own; `locators` are the toolchain homes the gate
 * environment names.
 */
export function gateSandboxPolicy(
  paths: GateSandboxPaths,
  toolchain: readonly ResolvedExecutable[],
  locators: GateSandboxLocators,
  homes: readonly string[] = operatorHomes(),
): GateSandboxPolicy {
  const writable = [...new Set([paths.home, paths.snapshot, paths.temp].map(canonicalPath))];
  const readable = new Set<string>();
  for (const executable of toolchain) for (const directory of toolchainDirectories(executable)) readable.add(directory);
  if (locators.RUSTUP_HOME !== undefined) readable.add(canonicalPath(locators.RUSTUP_HOME));
  if (locators.GOPATH !== undefined) readable.add(canonicalPath(locators.GOPATH));
  if (locators.GOMODCACHE !== undefined) readable.add(canonicalPath(locators.GOMODCACHE));
  const cargoHomes = new Set(homes.map((home) => join(home, ".cargo")));
  if (locators.CARGO_HOME !== undefined) {
    const cargoHome = canonicalPath(locators.CARGO_HOME);
    cargoHomes.add(cargoHome);
    // The registry and git caches are readable, never writable: writes are confined to `writable`.
    for (const cache of ["registry", "git"]) readable.add(join(cargoHome, cache));
  }
  // A readable exception never reopens a whole home.
  for (const directory of readable) if (homes.some((home) => inside(directory, home))) readable.delete(directory);
  return {
    writable,
    hidden: homes,
    readable: [...readable].sort(),
    credential_directories: homes.flatMap((home) => HOME_CREDENTIAL_DIRECTORIES.map((location) => join(home, location))),
    credential_files: homes.flatMap((home) => HOME_CREDENTIAL_FILES.map((location) => join(home, location))),
    credential_prefixes: [...cargoHomes].map((cargoHome) => join(cargoHome, "credentials")),
  };
}

function sbplString(path: string): string {
  if (/["\\\0-\x1f]/u.test(path)) throw new Error(`gate sandbox path cannot be expressed in a sandbox profile: ${JSON.stringify(path)}`);
  return `"${path}"`;
}

/**
 * Credential CLIs a gate may not start by absolute path. Their stores are
 * already unreadable; the Security CLI and keychain helpers reach the keychain
 * through securityd instead, whose services are denied below as well.
 */
const CREDENTIAL_CLI_PATTERN = String.raw`/(security|gh|op|doppler|aws|gcloud|az|vault|git-credential-[^/]*|docker-credential-[^/]*)$`;
const KEYCHAIN_SERVICES = ["com.apple.SecurityServer", "com.apple.securityd", "com.apple.secd"] as const;
const DEVICE_WRITES = ["/dev/null", "/dev/zero", "/dev/tty", "/dev/dtracehelper", "/dev/stdout", "/dev/stderr"] as const;
/** The read operations a hidden root denies and an exception reopens. */
const HIDDEN_READS = "file-read-data file-read-xattr";

/**
 * The sandbox-exec profile for one gate. For the same operation a later rule
 * outranks an earlier one, so each deny that must hold inside an exception
 * comes after it.
 */
export function macosSandboxProfile(policy: GateSandboxPolicy): string {
  const subpaths = (paths: readonly string[]): string => paths.map((path) => ` (subpath ${sbplString(path)})`).join("");
  const lines = [
    "(version 1)",
    "(allow default)",
    // Network, including unix sockets (ssh-agent, docker.sock).
    "(deny network*)",
    // Writes only to the gate's own disposable directories.
    "(deny file-write*)",
    `(allow file-write*${subpaths(policy.writable)}${DEVICE_WRITES.map((path) => ` (literal ${sbplString(path)})`).join("")} (regex #"^/dev/fd/"))`,
  ];
  // The operator's homes: contents unreadable; metadata stays so path resolution works.
  // Precedence is per operation, so each exception names the operations it reopens.
  if (policy.hidden.length > 0) lines.push(`(deny ${HIDDEN_READS}${subpaths(policy.hidden)})`);
  if (policy.readable.length > 0) lines.push(`(allow ${HIDDEN_READS}${subpaths(policy.readable)})`);
  // The gate's own directories are readable even if they sit inside a hidden root.
  lines.push(`(allow ${HIDDEN_READS}${subpaths(policy.writable)})`);
  // Credentials outrank every exception above.
  const credentialFilters = [
    ...policy.credential_directories.map((path) => ` (subpath ${sbplString(path)})`),
    ...policy.credential_files.map((path) => ` (literal ${sbplString(path)})`),
    ...policy.credential_prefixes.map((path) => ` (prefix ${sbplString(path)})`),
  ];
  if (credentialFilters.length > 0) lines.push(`(deny file-read*${credentialFilters.join("")})`);
  lines.push(`(deny process-exec (regex #"${CREDENTIAL_CLI_PATTERN}"))`);
  lines.push(`(deny mach-lookup${KEYCHAIN_SERVICES.map((name) => ` (global-name ${sbplString(name)})`).join("")})`);
  return `${lines.join("\n")}\n`;
}

/**
 * bubblewrap arguments for one gate, up to and including the `--` before the
 * command. Mounts apply in order, so the hidden homes are emptied before the
 * toolchain exceptions are re-exposed read-only, and the credential masks
 * come last.
 */
export function bwrapArguments(policy: GateSandboxPolicy, cwd: string): string[] {
  const args = [
    "--die-with-parent", "--new-session", "--unshare-net", "--unshare-ipc",
    "--ro-bind", "/", "/",
    "--dev", "/dev",
    "--proc", "/proc",
    // Shared temp and runtime directories hold other processes' sockets (ssh-agent, D-Bus, docker.sock).
    "--tmpfs", "/tmp", "--tmpfs", "/var/tmp", "--tmpfs", "/run",
  ];
  for (const home of policy.hidden) args.push("--tmpfs", home);
  for (const path of policy.readable) if (existsSync(path)) args.push("--ro-bind", path, path);
  for (const path of policy.writable) args.push("--bind", path, path);
  const visible = (path: string): boolean => existsSync(path)
    && [...policy.readable, ...policy.writable].some((root) => inside(root, path));
  for (const path of policy.credential_directories) if (visible(path)) args.push("--tmpfs", path, "--remount-ro", path);
  for (const path of [...policy.credential_files, ...policy.credential_prefixes.flatMap((prefix) => [prefix, `${prefix}.toml`])]) {
    if (visible(path)) args.push("--ro-bind", "/dev/null", path);
  }
  args.push("--chdir", cwd, "--");
  return args;
}

export interface WrappedGateCommand {
  readonly executable: string;
  readonly argv: readonly string[];
}

/** The command that actually starts: the gate's own under the detected mechanism. */
export function wrapGateCommand(
  detection: GateSandboxDetection,
  policy: GateSandboxPolicy,
  executable: string,
  argv: readonly string[],
  cwd: string,
): WrappedGateCommand {
  switch (detection.mechanism) {
    case "sandbox-exec":
      return { executable: detection.executable, argv: ["-p", macosSandboxProfile(policy), executable, ...argv] };
    case "bwrap":
      return { executable: detection.executable, argv: [...bwrapArguments(policy, cwd), executable, ...argv] };
    case "container":
    case "none":
      return { executable, argv };
  }
}
