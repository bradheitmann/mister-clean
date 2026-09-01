import { Buffer } from "node:buffer";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { StaticBearerAuthenticator } from "./auth.js";
import type { ControlPlaneRequestHandler } from "./http.js";
import { CONTROL_PLANE_PROTOCOL_VERSION, type ControlPlaneResponse } from "./protocol.js";
import { startUnixSocketAdapter } from "./unix-socket.js";

const token = "local-control-plane-test-token-0000000001";
const body = JSON.stringify({
  version: "1",
  request_id: "unix-1",
  kind: "query",
  name: "health",
  input: {},
});

function handler(): ControlPlaneRequestHandler & { calls: number } {
  return {
    calls: 0,
    async handle(): Promise<ControlPlaneResponse> {
      this.calls += 1;
      return {
        version: CONTROL_PLANE_PROTOCOL_VERSION,
        request_id: "unix-1",
        ok: true,
        result: {
          status: "ok", protocol_version: CONTROL_PLANE_PROTOCOL_VERSION, global_inventory_available: false,
          route_admission_configured: false, evidence_verification_configured: false,
          dispatch_supported: false, execution_supported: false,
        },
      };
    },
  };
}

function frame(authorization: string, payload = body, declaredLength = Buffer.byteLength(payload)): string {
  return `Authorization: ${authorization}\nContent-Length: ${declaredLength}\n\n${payload}`;
}

async function roundTrip(path: string, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = createConnection(path, () => socket.end(payload));
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("end", () => resolve(new TextDecoder().decode(Buffer.concat(chunks))));
    socket.on("error", reject);
  });
}

function responseBody(frameText: string): unknown {
  const separator = frameText.indexOf("\n\n");
  if (separator < 0) throw new Error("Response is not framed");
  return JSON.parse(frameText.slice(separator + 2)) as unknown;
}

describe("authenticated Unix-socket control-plane adapter", () => {
  it("returns a bounded failure when the handler never settles", async () => {
    let aborted = false;
    let appendCount = 0;
    const service: ControlPlaneRequestHandler = {
      handle(_value, signal): Promise<ControlPlaneResponse> {
        signal?.addEventListener("abort", () => { aborted = true; }, { once: true });
        return new Promise<ControlPlaneResponse>((resolve) => {
          setTimeout(() => {
            if (signal?.aborted !== true) appendCount += 1;
            resolve({
              version: CONTROL_PLANE_PROTOCOL_VERSION,
              request_id: "late",
              ok: true,
              result: {
                status: "ok", protocol_version: CONTROL_PLANE_PROTOCOL_VERSION, global_inventory_available: false,
                route_admission_configured: false, evidence_verification_configured: false,
                dispatch_supported: false, execution_supported: false,
              },
            });
          }, 150);
        });
      },
    };
    const directory = await mkdtemp("/tmp/mc-runtime-timeout-");
    const path = join(directory, "control.sock");
    const adapter = await startUnixSocketAdapter({
      path,
      service,
      authenticator: new StaticBearerAuthenticator(token),
      connection_timeout_ms: 100,
    });
    try {
      const response = await roundTrip(path, frame(`Bearer ${token}`));
      expect(responseBody(response)).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
      expect(aborted).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(appendCount).toBe(0);
    } finally {
      await adapter.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("never replaces a pre-existing filesystem entry", async () => {
    const directory = await mkdtemp("/tmp/mc-runtime-");
    const path = join(directory, "control.sock");
    await writeFile(path, "operator-owned", "utf8");
    try {
      await expect(startUnixSocketAdapter({
        path,
        service: handler(),
        authenticator: new StaticBearerAuthenticator(token),
      })).rejects.toThrow(/already exists/);
      expect(await readFile(path, "utf8")).toBe("operator-owned");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("creates a mode-0600 socket and serves one authenticated frame", async () => {
    const directory = await mkdtemp("/tmp/mc-runtime-");
    const path = join(directory, "control.sock");
    const service = handler();
    const adapter = await startUnixSocketAdapter({
      path,
      service,
      authenticator: new StaticBearerAuthenticator(token),
      max_request_bytes: 1024,
    });
    try {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      const response = await roundTrip(path, frame(`Bearer ${token}`));
      expect(responseBody(response)).toMatchObject({ ok: true, request_id: "unix-1" });
      expect(service.calls).toBe(1);
    } finally {
      await adapter.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects bad authentication without echoing it or invoking the service", async () => {
    const directory = await mkdtemp("/tmp/mc-runtime-");
    const path = join(directory, "control.sock");
    const service = handler();
    const adapter = await startUnixSocketAdapter({
      path,
      service,
      authenticator: new StaticBearerAuthenticator(token),
      max_request_bytes: 1024,
    });
    try {
      const badToken = "local-control-plane-test-token-WRONG";
      const response = await roundTrip(path, frame(`Bearer ${badToken}`));
      expect(responseBody(response)).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
      expect(response).not.toContain(badToken);
      expect(service.calls).toBe(0);
    } finally {
      await adapter.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects duplicate headers and bytes beyond Content-Length", async () => {
    const directory = await mkdtemp("/tmp/mc-runtime-");
    const path = join(directory, "control.sock");
    const service = handler();
    const adapter = await startUnixSocketAdapter({
      path,
      service,
      authenticator: new StaticBearerAuthenticator(token),
      max_request_bytes: 1024,
    });
    try {
      const duplicate = `Authorization: Bearer ${token}\nAuthorization: Bearer ${token}\nContent-Length: ${Buffer.byteLength(body)}\n\n${body}`;
      expect(responseBody(await roundTrip(path, duplicate))).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
      expect(responseBody(await roundTrip(path, `${frame(`Bearer ${token}`)}x`))).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
      expect(service.calls).toBe(0);
    } finally {
      await adapter.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("tears down incomplete clients and removes only its own socket deterministically", async () => {
    const directory = await mkdtemp("/tmp/mc-runtime-close-");
    const path = join(directory, "control.sock");
    const adapter = await startUnixSocketAdapter({
      path,
      service: handler(),
      authenticator: new StaticBearerAuthenticator(token),
      connection_timeout_ms: 100,
    });
    const client = createConnection(path);
    try {
      await new Promise<void>((resolve, reject) => {
        client.once("connect", resolve);
        client.once("error", reject);
      });
      await expect(adapter.close()).resolves.toBeUndefined();
      await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      client.destroy();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
