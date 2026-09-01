import {
  startLocalControlPlaneRuntime as startInternalLocalControlPlaneRuntime,
} from "./control-plane/runtime/local-runtime.js";
import { nullPrototypeRecord } from "./control-plane/runtime/null-prototype-record.js";

const PUBLIC_OPTION_KEYS = new Set([
  "repository_database_path",
  "global_database_path",
  "bearer_token",
  "unix_socket_path",
  "http",
]);

const PUBLIC_HTTP_OPTION_KEYS = new Set([
  "host",
  "port",
  "app_root",
]);

export interface LocalControlPlaneRuntimeOptions {
  readonly repository_database_path: string;
  readonly global_database_path?: string;
  readonly bearer_token: string;
  readonly unix_socket_path?: string;
  readonly http?: {
    readonly host?: "127.0.0.1" | "::1";
    readonly port?: number;
    readonly app_root?: string;
  };
}

export interface RunningLocalControlPlaneRuntime {
  readonly unix_socket: Readonly<{ readonly path: string }> | null;
  readonly http: Readonly<{
    readonly host: "127.0.0.1" | "::1";
    readonly port: number;
    readonly url: string;
    readonly app_url: string | null;
  }> | null;
  readonly dispatch_supported: false;
  readonly execution_supported: false;
  close(): Promise<void>;
}

function assertExactOwnKeys(
  value: unknown,
  allowed: ReadonlySet<string>,
  required: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must have Object.prototype or null prototype`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      throw new Error(`${label} contains unsupported option ${String(key)}`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label} requires own option ${key}`);
  }
}

/**
 * Start the supported local query/state-admission boundary. The public package
 * accepts transport configuration only: repository-owned admission probes,
 * evidence authorities, services, stores, authenticators, adapters, and clocks
 * remain internal composition capabilities.
 */
export async function startLocalControlPlaneRuntime(
  options: LocalControlPlaneRuntimeOptions,
): Promise<RunningLocalControlPlaneRuntime> {
  assertExactOwnKeys(
    options,
    PUBLIC_OPTION_KEYS,
    ["repository_database_path", "bearer_token"],
    "Local control-plane runtime options",
  );
  const httpOptions = Object.hasOwn(options, "http") ? options.http : undefined;
  if (httpOptions !== undefined) {
    assertExactOwnKeys(httpOptions, PUBLIC_HTTP_OPTION_KEYS, [], "Local control-plane HTTP options");
  }

  const repositoryDatabasePath = options.repository_database_path;
  const bearerToken = options.bearer_token;
  const globalDatabasePath = Object.hasOwn(options, "global_database_path")
    ? options.global_database_path
    : undefined;
  const unixSocketPath = Object.hasOwn(options, "unix_socket_path")
    ? options.unix_socket_path
    : undefined;

  let httpHost: "127.0.0.1" | "::1" | undefined;
  let httpPort: number | undefined;
  let httpAppRoot: string | undefined;
  if (httpOptions !== undefined) {
    httpHost = Object.hasOwn(httpOptions, "host") ? httpOptions.host : undefined;
    httpPort = Object.hasOwn(httpOptions, "port") ? httpOptions.port : undefined;
    httpAppRoot = Object.hasOwn(httpOptions, "app_root") ? httpOptions.app_root : undefined;
  }

  const internalHttpOptions = httpOptions === undefined
    ? undefined
    : nullPrototypeRecord({
      ...(httpHost === undefined ? {} : { host: httpHost }),
      ...(httpPort === undefined ? {} : { port: httpPort }),
      ...(httpAppRoot === undefined ? {} : { app_root: httpAppRoot }),
    });
  const internal = await startInternalLocalControlPlaneRuntime(nullPrototypeRecord({
    repository_database_path: repositoryDatabasePath,
    ...(globalDatabasePath === undefined ? {} : { global_database_path: globalDatabasePath }),
    bearer_token: bearerToken,
    ...(unixSocketPath === undefined ? {} : { unix_socket_path: unixSocketPath }),
    ...(internalHttpOptions === undefined ? {} : { http: internalHttpOptions }),
  }));

  const unixSocket = internal.unix_socket === null
    ? null
    : Object.freeze({ path: internal.unix_socket.path });
  const http = internal.http === null
    ? null
    : Object.freeze({
      host: internal.http.host,
      port: internal.http.port,
      url: internal.http.url,
      app_url: internal.http.app_url,
    });

  return Object.freeze({
    unix_socket: unixSocket,
    http,
    dispatch_supported: false,
    execution_supported: false,
    close: () => internal.close(),
  });
}
