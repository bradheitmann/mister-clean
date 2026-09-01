import { Buffer } from "node:buffer";
import { chmod, lstat, unlink } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { createServer, type Socket } from "node:net";

import type { LocalAuthenticator } from "./auth.js";
import { runBoundedControlPlaneOperation, type ControlPlaneRequestHandler } from "./http.js";
import {
  CONTROL_PLANE_PROTOCOL_VERSION,
  DEFAULT_MAX_REQUEST_BYTES,
  type ControlPlaneFailure,
  type ControlPlaneResponse,
} from "./protocol.js";
import { nullPrototypeRecord } from "./null-prototype-record.js";

export interface UnixSocketAdapterOptions {
  readonly path: string;
  readonly service: ControlPlaneRequestHandler;
  readonly authenticator: LocalAuthenticator;
  readonly max_request_bytes?: number;
  readonly max_header_bytes?: number;
  readonly connection_timeout_ms?: number;
}

export interface RunningUnixSocketAdapter {
  readonly path: string;
  close(): Promise<void>;
}

interface ParsedHeaders {
  readonly authorization: string;
  readonly content_length: number;
}

function transportFailure(code: ControlPlaneFailure["error"]["code"], message: string): ControlPlaneFailure {
  return {
    version: CONTROL_PLANE_PROTOCOL_VERSION,
    request_id: null,
    ok: false,
    error: { code, message },
  };
}

function writeResponse(socket: Socket, response: ControlPlaneResponse): void {
  if (!socket.writable) return;
  const body = JSON.stringify(response);
  socket.end(`Content-Length: ${Buffer.byteLength(body)}\nContent-Type: application/json\n\n${body}`);
}

function parseHeaders(buffer: Buffer): ParsedHeaders {
  for (const byte of buffer) {
    if (byte > 0x7f || byte === 0) throw new Error("Frame headers must contain ASCII text");
  }
  const headers = new Map<string, string>();
  for (const line of new TextDecoder("ascii").decode(buffer).replace(/\r\n/g, "\n").split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) throw new Error("Frame header is malformed");
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (headers.has(key)) throw new Error("Duplicate frame header");
    if (key !== "authorization" && key !== "content-length") throw new Error("Unknown frame header");
    headers.set(key, value);
  }
  const authorization = headers.get("authorization");
  const contentLengthText = headers.get("content-length");
  if (authorization === undefined || contentLengthText === undefined || !/^(0|[1-9][0-9]*)$/.test(contentLengthText)) {
    throw new Error("Frame requires Authorization and Content-Length headers");
  }
  const contentLength = Number(contentLengthText);
  if (!Number.isSafeInteger(contentLength)) throw new Error("Frame Content-Length is invalid");
  return { authorization, content_length: contentLength };
}

function findHeaderEnd(buffer: Buffer): { readonly offset: number; readonly delimiterLength: number } | null {
  const find = (needle: readonly number[]): number => {
    outer: for (let index = 0; index <= buffer.length - needle.length; index += 1) {
      for (let offset = 0; offset < needle.length; offset += 1) {
        if (buffer[index + offset] !== needle[offset]) continue outer;
      }
      return index;
    }
    return -1;
  };
  const crlf = find([13, 10, 13, 10]);
  const lf = find([10, 10]);
  if (crlf >= 0 && (lf < 0 || crlf <= lf)) return { offset: crlf, delimiterLength: 4 };
  if (lf >= 0) return { offset: lf, delimiterLength: 2 };
  return null;
}

function serveConnection(
  socket: Socket,
  options: Required<Pick<UnixSocketAdapterOptions, "service" | "authenticator">> & {
    readonly max_request_bytes: number;
    readonly max_header_bytes: number;
    readonly connection_timeout_ms: number;
  },
): void {
  let buffer = Buffer.alloc(0);
  let headers: ParsedHeaders | null = null;
  let bodyOffset = 0;
  let terminal = false;
  const connectionAbort = new AbortController();

  socket.once("close", () => connectionAbort.abort());

  socket.setTimeout(options.connection_timeout_ms, () => {
    terminal = true;
    socket.destroy(new Error("Unix control-plane frame deadline exceeded"));
  });

  const reject = (code: ControlPlaneFailure["error"]["code"], message: string): void => {
    if (terminal) return;
    terminal = true;
    socket.setTimeout(0);
    writeResponse(socket, transportFailure(code, message));
  };

  socket.on("data", (chunk: Buffer) => {
    if (terminal) return;
    buffer = Buffer.concat([buffer, chunk], buffer.length + chunk.length);
    if (headers === null) {
      const end = findHeaderEnd(buffer);
      if (end === null) {
        if (buffer.length > options.max_header_bytes) reject("PAYLOAD_TOO_LARGE", "Frame headers exceed the local limit");
        return;
      }
      if (end.offset > options.max_header_bytes) {
        reject("PAYLOAD_TOO_LARGE", "Frame headers exceed the local limit");
        return;
      }
      try {
        headers = parseHeaders(buffer.subarray(0, end.offset));
      } catch {
        reject("INVALID_REQUEST", "Frame headers are invalid");
        return;
      }
      if (!options.authenticator.authenticateAuthorizationHeader(headers.authorization)) {
        reject("UNAUTHORIZED", "Authentication required");
        return;
      }
      if (headers.content_length === 0 || headers.content_length > options.max_request_bytes) {
        reject(headers.content_length > options.max_request_bytes ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST", "Frame body length is invalid");
        return;
      }
      bodyOffset = end.offset + end.delimiterLength;
    }
    if (headers !== null && buffer.length - bodyOffset > headers.content_length) {
      reject("INVALID_REQUEST", "Frame contains bytes after its declared body");
    }
  });

  socket.on("end", () => {
    if (terminal) return;
    if (headers === null || buffer.length - bodyOffset !== headers.content_length) {
      reject("INVALID_REQUEST", "Frame ended before its declared body was complete");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(buffer.subarray(bodyOffset))) as unknown;
    } catch {
      reject("INVALID_REQUEST", "Frame body is not valid JSON");
      return;
    }
    terminal = true;
    socket.setTimeout(0);
    void runBoundedControlPlaneOperation(options.service, parsed, options.connection_timeout_ms, connectionAbort.signal)
      .then((response) => writeResponse(socket, response));
  });

  socket.on("error", () => {
    terminal = true;
  });
}

export async function startUnixSocketAdapter(options: UnixSocketAdapterOptions): Promise<RunningUnixSocketAdapter> {
  const maximum = options.max_request_bytes ?? DEFAULT_MAX_REQUEST_BYTES;
  const maxHeaders = options.max_header_bytes ?? 8192;
  const connectionTimeout = options.connection_timeout_ms ?? 15_000;
  if (!isAbsolute(options.path) || options.path.includes("\0") || Buffer.byteLength(options.path) > 100) {
    throw new Error("Unix control-plane socket path must be an absolute path of at most 100 bytes");
  }
  if (!Number.isSafeInteger(maximum) || maximum < 1024 || maximum > 16 * 1024 * 1024) {
    throw new Error("Unix control-plane request limit is invalid");
  }
  if (!Number.isSafeInteger(maxHeaders) || maxHeaders < 256 || maxHeaders > 64 * 1024) {
    throw new Error("Unix control-plane header limit is invalid");
  }
  if (!Number.isSafeInteger(connectionTimeout) || connectionTimeout < 100 || connectionTimeout > 300_000) {
    throw new Error("Unix control-plane connection timeout is invalid");
  }
  try {
    await lstat(options.path);
    throw new Error("Unix control-plane socket path already exists");
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  const sockets = new Set<Socket>();
  let closing = false;
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    if (closing) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    serveConnection(socket, nullPrototypeRecord({
      service: options.service,
      authenticator: options.authenticator,
      max_request_bytes: maximum,
      max_header_bytes: maxHeaders,
      connection_timeout_ms: connectionTimeout,
    }));
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once("error", onError);
    server.listen(options.path, () => {
      server.off("error", onError);
      resolve();
    });
  });
  let createdIdentity: { readonly dev: number; readonly ino: number };
  try {
    const created = await lstat(options.path);
    if (!created.isSocket()) throw new Error("Unix control-plane path is not a socket");
    createdIdentity = { dev: created.dev, ino: created.ino };
    await chmod(options.path, 0o600);
    const protectedSocket = await lstat(options.path);
    if (!protectedSocket.isSocket() || (protectedSocket.mode & 0o777) !== 0o600) {
      throw new Error("Unix control-plane socket permissions could not be enforced");
    }
  } catch (error) {
    closing = true;
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw error;
  }

  const cleanupCreatedSocket = async (): Promise<void> => {
    try {
      const current = await lstat(options.path);
      if (!current.isSocket() || current.dev !== createdIdentity.dev || current.ino !== createdIdentity.ino) {
        throw new Error("Refusing to remove a Unix path that is not the socket created by this runtime");
      }
      await unlink(options.path);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
  };
  return {
    path: options.path,
    close: async () => {
      closing = true;
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error));
      });
      await cleanupCreatedSocket();
    },
  };
}
