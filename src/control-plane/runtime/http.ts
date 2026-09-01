import { Buffer } from "node:buffer";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { isAbsolute, relative, resolve } from "node:path";

import type { LocalAuthenticator } from "./auth.js";
import { parseCanonicalLiveSnapshot } from "../contracts/snapshot.js";
import {
  CONTROL_PLANE_PROTOCOL_VERSION,
  DEFAULT_MAX_REQUEST_BYTES,
  ControlPlaneFault,
  type ControlPlaneFailure,
  type ControlPlaneResponse,
} from "./protocol.js";
import { nullPrototypeRecord } from "./null-prototype-record.js";

export interface ControlPlaneRequestHandler {
  handle(value: unknown, signal?: AbortSignal): Promise<ControlPlaneResponse>;
}

export interface LoopbackHttpAdapterOptions {
  readonly service: ControlPlaneRequestHandler;
  readonly authenticator: LocalAuthenticator;
  readonly host?: "127.0.0.1" | "::1";
  readonly port?: number;
  readonly max_request_bytes?: number;
  readonly request_timeout_ms?: number;
  /** Optional built Svelte app root and read-only live snapshot producer. */
  readonly app_root?: string;
  readonly snapshot_producer?: { load(signal?: AbortSignal): Promise<unknown> };
}

export interface RunningLoopbackHttpAdapter {
  readonly host: "127.0.0.1" | "::1";
  readonly port: number;
  readonly url: string;
  readonly app_url: string | null;
  close(): Promise<void>;
}

function transportFailure(code: ControlPlaneFailure["error"]["code"], message: string): ControlPlaneFailure {
  return {
    version: CONTROL_PLANE_PROTOCOL_VERSION,
    request_id: null,
    ok: false,
    error: { code, message },
  };
}

/**
 * Bound the server-side operation, independently of client/request deadlines.
 * The signal gives handlers that support cancellation a chance to stop their
 * work; late fulfillment/rejection is always ignored after the fail-closed
 * timeout response has been selected.
 */
export function runBoundedOperation<Value>(
  operation: (signal: AbortSignal) => Promise<Value>,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<Value> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let removeExternalAbort = (): void => undefined;

  return new Promise<Value>((resolve, reject) => {
    const finish = (settle: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      removeExternalAbort();
      settle();
    };

    const abort = (): void => {
      controller.abort();
      finish(() => reject(new Error("bounded operation cancelled")));
    };
    if (externalSignal !== undefined) {
      if (externalSignal.aborted) {
        abort();
        return;
      }
      externalSignal.addEventListener("abort", abort, { once: true });
      removeExternalAbort = () => externalSignal.removeEventListener("abort", abort);
    }

    timer = setTimeout(() => {
      controller.abort();
      finish(() => reject(new Error("bounded operation exceeded its deadline")));
    }, timeoutMs);

    Promise.resolve()
      .then(() => operation(controller.signal))
      .then(
        (result) => finish(() => resolve(result)),
        (error) => finish(() => reject(error)),
      );
  });
}

export function runBoundedControlPlaneOperation(
  service: ControlPlaneRequestHandler,
  value: unknown,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<ControlPlaneResponse> {
  return runBoundedOperation((signal) => service.handle(value, signal), timeoutMs, externalSignal)
    .catch(() => transportFailure("INTERNAL", "Local control-plane operation exceeded its deadline"));
}

function statusFor(response: ControlPlaneResponse): number {
  if (response.ok) return 200;
  switch (response.error.code) {
    case "INVALID_REQUEST": return 400;
    case "UNAUTHORIZED": return 401;
    case "FORBIDDEN": return 403;
    case "NOT_FOUND": return 404;
    case "CONFLICT": return 409;
    case "PRECONDITION_FAILED": return 412;
    case "PAYLOAD_TOO_LARGE": return 413;
    case "INTERNAL": return 500;
  }
}

function sendJson(response: ServerResponse, body: ControlPlaneResponse, status = statusFor(body)): void {
  if (response.writableEnded || response.destroyed) return;
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Connection": "close",
    "Content-Length": Buffer.byteLength(encoded),
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(encoded);
}

const SESSION_COOKIE = "mister_clean_session";
const MAX_BROWSER_SESSIONS = 64;
const BROWSER_SESSION_TTL_MS = 5 * 60_000;

interface BrowserSession {
  readonly expires_at: number;
}

type BrowserSessions = Map<string, BrowserSession>;

function pruneSessions(sessions: BrowserSessions, now = Date.now()): void {
  for (const [session, value] of sessions) {
    if (value.expires_at <= now) sessions.delete(session);
  }
  while (sessions.size >= MAX_BROWSER_SESSIONS) {
    const oldest = sessions.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    sessions.delete(oldest);
  }
}

function newSessionId(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sessionFromCookie(value: string | undefined): string | null {
  if (value === undefined) return null;
  const values = value.split(";").map((entry) => entry.trim()).filter((entry) => entry.startsWith(`${SESSION_COOKIE}=`));
  if (values.length !== 1) return null;
  const session = values[0]!.slice(`${SESSION_COOKIE}=`.length);
  return /^[a-f0-9]{64}$/.test(session) ? session : null;
}

function writeAppJson(response: ServerResponse, body: unknown, status: number): void {
  if (response.writableEnded || response.destroyed) return;
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Connection": "close",
    "Content-Length": Buffer.byteLength(encoded),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(encoded);
}

function appContentType(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

export async function readContainedAppFile(
  appRoot: string,
  requested: string,
  hooks: { readonly after_open?: (path: string) => void | Promise<void> } = {},
): Promise<{ readonly bytes: Buffer; readonly canonical_path: string }> {
  const root = await realpath(resolve(appRoot));
  const candidate = resolve(root, requested);
  const candidateRelative = relative(root, candidate);
  if (isAbsolute(candidateRelative) || candidateRelative === ".." || candidateRelative.startsWith("../")) {
    throw new Error("resource escapes app root");
  }
  const pathMetadata = await lstat(candidate);
  if (pathMetadata.isSymbolicLink() || !pathMetadata.isFile()) throw new Error("resource is not a regular file");
  const canonicalCandidate = await realpath(candidate);
  const canonicalRelative = relative(root, canonicalCandidate);
  if (isAbsolute(canonicalRelative) || canonicalRelative === ".." || canonicalRelative.startsWith("../")) {
    throw new Error("canonical resource escapes app root");
  }
  const handle = await open(candidate, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.dev !== pathMetadata.dev || before.ino !== pathMetadata.ino) {
      throw new Error("resource identity changed before read");
    }
    await hooks.after_open?.(candidate);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const current = await lstat(candidate);
    if (!after.isFile() || current.isSymbolicLink() || !current.isFile()
      || after.dev !== before.dev || after.ino !== before.ino
      || current.dev !== before.dev || current.ino !== before.ino
      || after.size !== before.size || bytes.byteLength !== after.size) {
      throw new Error("resource identity changed during read");
    }
    return { bytes, canonical_path: canonicalCandidate };
  } finally {
    await handle.close();
  }
}

async function handleAppRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: {
    readonly app_root: string;
    readonly sessions: BrowserSessions;
    readonly snapshot_producer?: { load(signal?: AbortSignal): Promise<unknown> };
    readonly operation_timeout_ms: number;
  },
): Promise<void> {
  if (!isLoopbackAddress(request.socket.remoteAddress)) {
    writeAppJson(response, { error: "Only loopback clients may use this adapter" }, 403);
    return;
  }
  if (!validHostHeader(request.headers.host) || !validOrigin(request.headers.origin)) {
    writeAppJson(response, { error: "Request origin is not local" }, 403);
    return;
  }
  let pathname: string;
  try {
    pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  } catch {
    writeAppJson(response, { error: "Request path is invalid" }, 400);
    return;
  }
  if (request.method === "GET" && pathname === "/session") {
    const now = Date.now();
    pruneSessions(options.sessions, now);
    const session = newSessionId();
    options.sessions.set(session, { expires_at: now + BROWSER_SESSION_TTL_MS });
    response.writeHead(204, {
      "Cache-Control": "no-store",
      "Connection": "close",
      "Set-Cookie": `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(BROWSER_SESSION_TTL_MS / 1000)}`,
    });
    response.end();
    return;
  }
  if (request.method === "GET" && pathname === "/control-plane/snapshot.json") {
    const session = sessionFromCookie(request.headers.cookie);
    const active = session === null ? undefined : options.sessions.get(session);
    if (session === null || active === undefined || active.expires_at <= Date.now()) {
      if (session !== null) options.sessions.delete(session);
      writeAppJson(response, { error: "A local browser session is required" }, 401);
      return;
    }
    if (options.snapshot_producer === undefined) {
      writeAppJson(response, { error: "Live control-plane evidence is unavailable" }, 503);
      return;
    }
    const abort = new AbortController();
    request.once("aborted", () => abort.abort());
    response.once("close", () => abort.abort());
    try {
      const snapshot = await runBoundedSnapshotLoad(options.snapshot_producer, options.operation_timeout_ms, abort.signal);
      writeAppJson(response, parseCanonicalLiveSnapshot(snapshot), 200);
    } catch {
      writeAppJson(response, { error: "Live control-plane evidence is unavailable" }, 503);
    }
    return;
  }
  if (request.method !== "GET") {
    writeAppJson(response, { error: "Application resource was not found" }, 404);
    return;
  }
  let requested: string;
  try {
    requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  } catch {
    writeAppJson(response, { error: "Request path is invalid" }, 400);
    return;
  }
  if (requested.includes("\0")) {
    writeAppJson(response, { error: "Request path is invalid" }, 400);
    return;
  }
  try {
    const { bytes, canonical_path } = await readContainedAppFile(options.app_root, requested);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Connection": "close",
      "Content-Length": bytes.byteLength,
      "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
      "Content-Type": appContentType(canonical_path),
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(bytes);
  } catch {
    writeAppJson(response, { error: "Application resource was not found" }, 404);
  }
}

async function runBoundedSnapshotLoad(
  producer: { load(signal?: AbortSignal): Promise<unknown> },
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<unknown> {
  return runBoundedOperation((signal) => producer.load(signal), timeoutMs, externalSignal);
}

function isLoopbackAddress(value: string | undefined): boolean {
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

function isLoopbackHostname(value: string): boolean {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function validHostHeader(value: string | undefined): boolean {
  if (value === undefined) return false;
  try {
    return isLoopbackHostname(new URL(`http://${value}`).hostname);
  } catch {
    return false;
  }
}

function validOrigin(value: string | undefined): boolean {
  if (value === undefined) return true;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && isLoopbackHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function headerOccurrences(request: IncomingMessage, wanted: string): number {
  let count = 0;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === wanted) count += 1;
  }
  return count;
}

async function readBody(request: IncomingMessage, maximum: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    request.on("data", (chunk: Buffer | string) => {
      if (rejected) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > maximum) {
        rejected = true;
        chunks.length = 0;
        reject(new ControlPlaneFault("PAYLOAD_TOO_LARGE", "Request exceeds the local control-plane payload limit"));
        return;
      }
      chunks.push(bytes);
    });
    request.on("end", () => {
      if (!rejected) resolve(Buffer.concat(chunks, size));
    });
    request.on("error", () => {
      if (!rejected) reject(new ControlPlaneFault("INVALID_REQUEST", "Request body could not be read"));
    });
  });
}

async function handleHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: Required<Pick<LoopbackHttpAdapterOptions, "service" | "authenticator">> & {
    readonly max_request_bytes: number;
    readonly operation_timeout_ms: number;
    readonly app_root?: string;
    readonly snapshot_producer?: { load(signal?: AbortSignal): Promise<unknown> };
    readonly sessions: BrowserSessions;
  },
): Promise<void> {
  if (options.app_root !== undefined && request.method === "GET" && request.url !== "/rpc") {
    await handleAppRequest(request, response, nullPrototypeRecord({
      app_root: options.app_root,
      sessions: options.sessions,
      ...(options.snapshot_producer === undefined ? {} : { snapshot_producer: options.snapshot_producer }),
      operation_timeout_ms: options.operation_timeout_ms,
    }));
    return;
  }
  if (!isLoopbackAddress(request.socket.remoteAddress)) {
    sendJson(response, transportFailure("FORBIDDEN", "Only loopback clients may use this adapter"));
    return;
  }
  if (!validHostHeader(request.headers.host) || !validOrigin(request.headers.origin)) {
    sendJson(response, transportFailure("FORBIDDEN", "Request origin is not local"));
    return;
  }
  if (request.method !== "POST" || request.url !== "/rpc") {
    sendJson(response, transportFailure("NOT_FOUND", "Local control-plane endpoint was not found"));
    return;
  }
  if (headerOccurrences(request, "authorization") !== 1) {
    sendJson(response, transportFailure("UNAUTHORIZED", "Authentication required"));
    return;
  }
  const authorization = typeof request.headers.authorization === "string" ? request.headers.authorization : null;
  if (!options.authenticator.authenticateAuthorizationHeader(authorization)) {
    sendJson(response, transportFailure("UNAUTHORIZED", "Authentication required"));
    return;
  }
  if (headerOccurrences(request, "content-type") !== 1 || !request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    sendJson(response, transportFailure("INVALID_REQUEST", "Content-Type must be application/json"));
    return;
  }
  const declaredLength = request.headers["content-length"];
  if (typeof declaredLength === "string") {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      sendJson(response, transportFailure("INVALID_REQUEST", "Content-Length is invalid"));
      return;
    }
    if (length > options.max_request_bytes) {
      sendJson(response, transportFailure("PAYLOAD_TOO_LARGE", "Request exceeds the local control-plane payload limit"));
      return;
    }
  }
  try {
    const body = await readBody(request, options.max_request_bytes);
    if (body.length === 0) throw new ControlPlaneFault("INVALID_REQUEST", "Request body is empty");
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(body)) as unknown;
    } catch {
      throw new ControlPlaneFault("INVALID_REQUEST", "Request body is not valid JSON");
    }
    const operationAbort = new AbortController();
    const abortOperation = (): void => operationAbort.abort();
    request.once("aborted", abortOperation);
    response.once("close", abortOperation);
    try {
      sendJson(response, await runBoundedControlPlaneOperation(options.service, parsed, options.operation_timeout_ms, operationAbort.signal));
    } finally {
      request.off("aborted", abortOperation);
      response.off("close", abortOperation);
    }
  } catch (error) {
    const fault = error instanceof ControlPlaneFault
      ? error
      : new ControlPlaneFault("INTERNAL", "Local control-plane request failed");
    sendJson(response, transportFailure(fault.code, fault.message));
  }
}

export async function startLoopbackHttpAdapter(options: LoopbackHttpAdapterOptions): Promise<RunningLoopbackHttpAdapter> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const maximum = options.max_request_bytes ?? DEFAULT_MAX_REQUEST_BYTES;
  const requestTimeout = options.request_timeout_ms ?? 15_000;
  if (host !== "127.0.0.1" && host !== "::1") throw new Error("HTTP control-plane adapter must bind to a numeric loopback address");
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) throw new Error("HTTP control-plane port is invalid");
  if (!Number.isSafeInteger(maximum) || maximum < 1024 || maximum > 16 * 1024 * 1024) {
    throw new Error("HTTP control-plane request limit is invalid");
  }
  if (!Number.isSafeInteger(requestTimeout) || requestTimeout < 100 || requestTimeout > 300_000) {
    throw new Error("HTTP control-plane request timeout is invalid");
  }
  if (options.app_root !== undefined && !isAbsolute(options.app_root)) throw new Error("HTTP control-plane app root must be absolute");
  const sessions: BrowserSessions = new Map();
  const server = createServer((request, response) => {
    void handleHttpRequest(request, response, nullPrototypeRecord({
      service: options.service,
      authenticator: options.authenticator,
      max_request_bytes: maximum,
      operation_timeout_ms: requestTimeout,
      ...(options.app_root === undefined ? {} : { app_root: options.app_root }),
      ...(options.snapshot_producer === undefined ? {} : { snapshot_producer: options.snapshot_producer }),
      sessions,
    })).catch(() => {
      sendJson(response, transportFailure("INTERNAL", "Local control-plane request failed"));
    });
  });
  server.headersTimeout = requestTimeout;
  server.requestTimeout = requestTimeout;
  server.keepAliveTimeout = 1;
  server.on("clientError", (_error, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  const urlHost = host === "::1" ? "[::1]" : host;
  return {
    host,
    port: address.port,
    url: `http://${urlHost}:${address.port}/rpc`,
    app_url: options.app_root === undefined ? null : `http://${urlHost}:${address.port}/`,
    close: async () => new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error));
      server.closeAllConnections();
      sessions.clear();
    }),
  };
}
