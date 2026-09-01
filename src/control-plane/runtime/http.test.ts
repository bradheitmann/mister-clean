import { mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { StaticBearerAuthenticator } from "./auth.js";
import { readContainedAppFile, startLoopbackHttpAdapter, type ControlPlaneRequestHandler } from "./http.js";
import { CONTROL_PLANE_PROTOCOL_VERSION, type ControlPlaneResponse } from "./protocol.js";
import { parseCanonicalLiveSnapshot } from "../contracts/snapshot.js";
import { demoSnapshot } from "../../../control-plane-app/src/fixture.js";
import { parseSnapshot } from "../../../control-plane-app/src/read-model.js";

const token = "local-control-plane-test-token-0000000001";

function handler(): ControlPlaneRequestHandler & { calls: number } {
  return {
    calls: 0,
    async handle(value: unknown): Promise<ControlPlaneResponse> {
      this.calls += 1;
      const requestId = typeof value === "object" && value !== null && "request_id" in value
        ? String((value as { request_id: unknown }).request_id)
        : "unknown";
      return {
        version: CONTROL_PLANE_PROTOCOL_VERSION,
        request_id: requestId,
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

const requestBody = JSON.stringify({
  version: "1",
  request_id: "http-1",
  kind: "query",
  name: "health",
  input: {},
});

async function rawRequest(port: number, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = createConnection({ host: "127.0.0.1", port }, () => {
      socket.end(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
    });
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    socket.on("error", reject);
  });
}

describe("loopback HTTP control-plane adapter", () => {
  it("preserves one strict SQLite-producer-shaped snapshot through HTTP and the browser parser", async () => {
    const directory = await mkdtemp("/tmp/mc-http-roundtrip-");
    await writeFile(join(directory, "index.html"), "<html><body>control plane</body></html>", "utf8");
    const live = { ...structuredClone(demoSnapshot), source: "live" as const, source_label: "SQLite producer fixture" };
    const producer = { load: async () => parseCanonicalLiveSnapshot(live) };
    const adapter = await startLoopbackHttpAdapter({ service: handler(), authenticator: new StaticBearerAuthenticator(token), app_root: directory, snapshot_producer: producer });
    try {
      const session = await fetch(new URL("session", adapter.app_url!));
      const response = await fetch(new URL("control-plane/snapshot.json", adapter.app_url!), { headers: { Cookie: session.headers.get("set-cookie")! } });
      expect(response.status).toBe(200);
      const wire = await response.json();
      expect(parseCanonicalLiveSnapshot(wire)).toEqual(live);
      expect(parseSnapshot(wire)).toEqual(live);
      expect("run_id" in (wire as Record<string, unknown>)).toBe(false);
      expect("repository_object_sha256" in (wire as Record<string, unknown>)).toBe(false);
    } finally {
      await adapter.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("serves the built app only through a same-origin HttpOnly session", async () => {
    const directory = await mkdtemp("/tmp/mc-http-app-");
    await writeFile(join(directory, "index.html"), "<html><body>control plane</body></html>", "utf8");
    const adapter = await startLoopbackHttpAdapter({
      service: handler(),
      authenticator: new StaticBearerAuthenticator(token),
      app_root: directory,
      request_timeout_ms: 100,
    });
    try {
      const appUrl = adapter.app_url;
      expect(appUrl).not.toBeNull();
      if (appUrl === null) throw new Error("app URL missing");
      const page = await fetch(appUrl);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("control plane");
      const crossOrigin = await fetch(appUrl, { headers: { Origin: "https://example.invalid" } });
      expect(crossOrigin.status).toBe(403);
      const session = await fetch(new URL("session", appUrl));
      expect(session.status).toBe(204);
      const cookie = session.headers.get("set-cookie");
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(await fetch(new URL("control-plane/snapshot.json", appUrl)).then((response) => response.status)).toBe(401);
      expect(await fetch(new URL("control-plane/snapshot.json", appUrl), { headers: { Cookie: cookie! } }).then((response) => response.status)).toBe(503);
    } finally {
      await adapter.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("bounds browser sessions and expires the oldest session deterministically", async () => {
    const directory = await mkdtemp("/tmp/mc-http-sessions-");
    await writeFile(join(directory, "index.html"), "ok", "utf8");
    const adapter = await startLoopbackHttpAdapter({
      service: handler(), authenticator: new StaticBearerAuthenticator(token), app_root: directory,
    });
    try {
      const cookies: string[] = [];
      for (let index = 0; index < 65; index += 1) {
        const response = await fetch(new URL("session", adapter.app_url!));
        cookies.push(response.headers.get("set-cookie")!);
      }
      expect(await fetch(new URL("control-plane/snapshot.json", adapter.app_url!), { headers: { Cookie: cookies[0]! } }).then((response) => response.status)).toBe(401);
      expect(await fetch(new URL("control-plane/snapshot.json", adapter.app_url!), { headers: { Cookie: cookies.at(-1)! } }).then((response) => response.status)).toBe(503);
    } finally {
      await adapter.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects malformed percent escapes without rejecting the next request", async () => {
    const directory = await mkdtemp("/tmp/mc-http-malformed-");
    await writeFile(join(directory, "index.html"), "healthy", "utf8");
    const adapter = await startLoopbackHttpAdapter({
      service: handler(), authenticator: new StaticBearerAuthenticator(token), app_root: directory,
    });
    try {
      expect(await rawRequest(adapter.port, "/%")).toMatch(/^HTTP\/1\.1 400 /u);
      expect(await fetch(adapter.app_url!).then((response) => response.text())).toBe("healthy");
    } finally {
      await adapter.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects escaping, dangling, symlinked, and replaced static resources", async () => {
    const directory = await mkdtemp("/tmp/mc-http-containment-");
    const outside = `${directory}-outside`;
    await writeFile(join(directory, "index.html"), "original", "utf8");
    await writeFile(outside, "outside", "utf8");
    await symlink(outside, join(directory, "escape.html"));
    await symlink(join(directory, "missing.html"), join(directory, "dangling.html"));
    try {
      await expect(readContainedAppFile(directory, "../outside")).rejects.toThrow();
      await expect(readContainedAppFile(directory, "escape.html")).rejects.toThrow();
      await expect(readContainedAppFile(directory, "dangling.html")).rejects.toThrow();
      await expect(readContainedAppFile(directory, "index.html", {
        after_open: async (path) => {
          await rename(path, `${path}.old`);
          await writeFile(path, "replacement", "utf8");
        },
      })).rejects.toThrow(/changed during read/u);
    } finally {
      await rm(directory, { recursive: true, force: true });
      await rm(outside, { force: true });
    }
  });

  it("rejects bearer token configurations containing whitespace", () => {
    expect(() => new StaticBearerAuthenticator("x".repeat(31) + " ")).toThrow(/non-whitespace/u);
    expect(() => new StaticBearerAuthenticator("x".repeat(31) + "\t")).toThrow(/non-whitespace/u);
  });

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
    const adapter = await startLoopbackHttpAdapter({
      service,
      authenticator: new StaticBearerAuthenticator(token),
      request_timeout_ms: 100,
    });
    try {
      const response = await fetch(adapter.url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: requestBody,
      });
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
      expect(aborted).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(appendCount).toBe(0);
    } finally {
      await adapter.close();
    }
  });

  it("refuses a non-loopback bind", async () => {
    const service = handler();
    await expect(startLoopbackHttpAdapter({
      service,
      authenticator: new StaticBearerAuthenticator(token),
      host: "0.0.0.0",
    } as unknown as Parameters<typeof startLoopbackHttpAdapter>[0])).rejects.toThrow(/loopback/);
  });

  it("authenticates before dispatch and never echoes a rejected token", async () => {
    const service = handler();
    const adapter = await startLoopbackHttpAdapter({
      service,
      authenticator: new StaticBearerAuthenticator(token),
      max_request_bytes: 1024,
    });
    try {
      const rejected = await fetch(adapter.url, {
        method: "POST",
        headers: { "Authorization": "Bearer local-control-plane-test-token-WRONG", "Content-Type": "application/json" },
        body: requestBody,
      });
      const text = await rejected.text();
      expect(rejected.status).toBe(401);
      expect(service.calls).toBe(0);
      expect(text).not.toContain("local-control-plane-test-token-WRONG");

      const accepted = await fetch(adapter.url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: requestBody,
      });
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toMatchObject({ ok: true, request_id: "http-1" });
      expect(service.calls).toBe(1);
    } finally {
      await adapter.close();
    }
  });

  it("rejects non-local origins and oversized bodies before dispatch", async () => {
    const service = handler();
    const adapter = await startLoopbackHttpAdapter({
      service,
      authenticator: new StaticBearerAuthenticator(token),
      max_request_bytes: 1024,
    });
    const headers = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" };
    try {
      const originRejected = await fetch(adapter.url, {
        method: "POST",
        headers: { ...headers, "Origin": "https://example.invalid" },
        body: requestBody,
      });
      expect(originRejected.status).toBe(403);
      const oversized = await fetch(adapter.url, {
        method: "POST",
        headers,
        body: "x".repeat(1025),
      });
      expect(oversized.status).toBe(413);
      expect(service.calls).toBe(0);
    } finally {
      await adapter.close();
    }
  });
});
