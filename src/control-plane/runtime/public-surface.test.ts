import { access, mkdtemp, rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  startLocalControlPlaneRuntime,
  type LocalControlPlaneRuntimeOptions,
} from "../../control-plane.js";

const token = "public-control-plane-test-token-0000000001";
const expectedRuntimeKeys = [
  "close",
  "dispatch_supported",
  "execution_supported",
  "http",
  "unix_socket",
];

async function roundTrip(path: string, payload: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = createConnection(path, () => socket.end(payload));
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("end", () => {
      const text = new TextDecoder().decode(Buffer.concat(chunks));
      resolve(JSON.parse(text.slice(text.indexOf("\n\n") + 2)) as unknown);
    });
    socket.on("error", reject);
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("public control-plane source surface", () => {
  it("exports exactly one runtime value", async () => {
    const surface = await import("../../control-plane.js");
    expect(Object.keys(surface).sort()).toEqual(["startLocalControlPlaneRuntime"]);
  });

  it.each([
    "live_route_probes",
    "evidence_verifier",
    "clock",
    "service",
    "store",
    "authenticator",
    "adapters",
    "route_admission",
    "authority",
    "logical_project_registration_authority",
    "snapshot_producer",
    "execute",
  ])("rejects unsupported top-level option %s before filesystem mutation", async (key) => {
    const directory = await mkdtemp("/tmp/mc-public-options-");
    const databasePath = join(directory, "must-not-exist.sqlite");
    const socketPath = join(directory, "must-not-exist.sock");
    try {
      const options = {
        repository_database_path: databasePath,
        bearer_token: token,
        unix_socket_path: socketPath,
        [key]: {},
      } as unknown as LocalControlPlaneRuntimeOptions;
      await expect(startLocalControlPlaneRuntime(options)).rejects.toThrow(`unsupported option ${key}`);
      expect(await pathExists(databasePath)).toBe(false);
      expect(await pathExists(socketPath)).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    "live_route_probes",
    "evidence_verifier",
    "clock",
    "service",
    "store",
    "authenticator",
    "adapters",
    "route_admission",
    "authority",
    "logical_project_registration_authority",
    "snapshot_producer",
    "execute",
  ])("rejects unsupported HTTP option %s before filesystem mutation", async (key) => {
    const directory = await mkdtemp("/tmp/mc-public-http-options-");
    const databasePath = join(directory, "must-not-exist.sqlite");
    const socketPath = join(directory, "must-not-exist.sock");
    try {
      const options = {
        repository_database_path: databasePath,
        bearer_token: token,
        unix_socket_path: socketPath,
        http: { port: 0, [key]: {} },
      } as unknown as LocalControlPlaneRuntimeOptions;
      await expect(startLocalControlPlaneRuntime(options)).rejects.toThrow(`unsupported option ${key}`);
      expect(await pathExists(databasePath)).toBe(false);
      expect(await pathExists(socketPath)).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    {
      name: "a nonstandard top-level prototype",
      makeOptions(databasePath: string, socketPath: string): LocalControlPlaneRuntimeOptions {
        return Object.assign(Object.create({ http: { port: 0 } }) as object, {
          repository_database_path: databasePath,
          bearer_token: token,
          unix_socket_path: socketPath,
        }) as LocalControlPlaneRuntimeOptions;
      },
      message: "Local control-plane runtime options must have Object.prototype or null prototype",
    },
    {
      name: "a nonstandard nested HTTP prototype",
      makeOptions(databasePath: string, socketPath: string): LocalControlPlaneRuntimeOptions {
        return {
          repository_database_path: databasePath,
          bearer_token: token,
          unix_socket_path: socketPath,
          http: Object.assign(Object.create({ host: "127.0.0.1" }) as object, { port: 0 }),
        } as LocalControlPlaneRuntimeOptions;
      },
      message: "Local control-plane HTTP options must have Object.prototype or null prototype",
    },
    {
      name: "a symbol own key",
      makeOptions(databasePath: string, socketPath: string): LocalControlPlaneRuntimeOptions {
        const unsupported = Symbol("unsupported");
        return {
          repository_database_path: databasePath,
          bearer_token: token,
          unix_socket_path: socketPath,
          [unsupported]: true,
        } as unknown as LocalControlPlaneRuntimeOptions;
      },
      message: "unsupported option Symbol(unsupported)",
    },
    {
      name: "an unknown nested HTTP own key",
      makeOptions(databasePath: string, socketPath: string): LocalControlPlaneRuntimeOptions {
        return {
          repository_database_path: databasePath,
          bearer_token: token,
          unix_socket_path: socketPath,
          http: { port: 0, unexpected_nested_option: true },
        } as unknown as LocalControlPlaneRuntimeOptions;
      },
      message: "unsupported option unexpected_nested_option",
    },
  ])("rejects $name before reading inherited values or mutating the filesystem", async ({ makeOptions, message }) => {
    const directory = await mkdtemp("/tmp/mc-public-record-shape-");
    const databasePath = join(directory, "must-not-exist.sqlite");
    const socketPath = join(directory, "must-not-exist.sock");
    try {
      await expect(startLocalControlPlaneRuntime(makeOptions(databasePath, socketPath))).rejects.toThrow(message);
      expect(await pathExists(databasePath)).toBe(false);
      expect(await pathExists(socketPath)).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not reactivate transport or authority options inherited from Object.prototype", async () => {
    const directory = await mkdtemp("/tmp/mc-public-prototype-pollution-");
    const rejectedDatabasePath = join(directory, "must-not-exist.sqlite");
    const acceptedDatabasePath = join(directory, "accepted.sqlite");
    const pollutedSocketPath = join(directory, "must-not-exist.sock");
    const keys = [
      "unix_socket_path",
      "live_route_probes",
      "route_admission",
      "evidence_verifier",
      "clock",
    ] as const;
    type PollutedKey = typeof keys[number];
    const reads = Object.fromEntries(keys.map((key) => [key, 0])) as Record<PollutedKey, number>;
    const values: Record<PollutedKey, unknown> = {
      unix_socket_path: pollutedSocketPath,
      live_route_probes: undefined,
      route_admission: { configured: true, async admit() { return { admitted: true, reason: "polluted", evidence: [] }; } },
      evidence_verifier: {
        configured: true,
        async verifyDirective() { return []; },
        async verifyReceipt() { return []; },
      },
      clock: () => "2000-01-01T00:00:00.000Z",
    };
    const prior = new Map<PollutedKey, PropertyDescriptor | undefined>();
    let rejectedError: unknown;
    let rejectedRuntimeReturned = false;
    let inheritedDatabaseActivated = false;
    let inheritedSocketActivated = false;
    let observedReads: Record<PollutedKey, number> | null = null;
    let runtime: Awaited<ReturnType<typeof startLocalControlPlaneRuntime>> | null = null;
    try {
      for (const key of keys) {
        prior.set(key, Object.getOwnPropertyDescriptor(Object.prototype, key));
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          get: () => { reads[key] += 1; return values[key]; },
        });
      }

      try {
        const unexpected = await startLocalControlPlaneRuntime({
          repository_database_path: rejectedDatabasePath,
          bearer_token: token,
        });
        rejectedRuntimeReturned = true;
        inheritedDatabaseActivated = await pathExists(rejectedDatabasePath);
        inheritedSocketActivated = await pathExists(pollutedSocketPath);
        await unexpected.close();
      } catch (error) {
        rejectedError = error;
        inheritedDatabaseActivated = await pathExists(rejectedDatabasePath);
        inheritedSocketActivated = await pathExists(pollutedSocketPath);
      }

      runtime = await startLocalControlPlaneRuntime({
        repository_database_path: acceptedDatabasePath,
        bearer_token: token,
        http: { port: 0 },
      });
      inheritedSocketActivated ||= await pathExists(pollutedSocketPath);
      observedReads = { ...reads };
    } finally {
      for (const key of [...keys].reverse()) {
        const descriptor = prior.get(key);
        if (descriptor === undefined) delete (Object.prototype as Record<string, unknown>)[key];
        else Object.defineProperty(Object.prototype, key, descriptor);
      }
    }

    try {
      expect(rejectedRuntimeReturned).toBe(false);
      expect(rejectedError).toBeInstanceOf(Error);
      expect((rejectedError as Error).message).toContain("requires at least one IPC adapter");
      expect(inheritedDatabaseActivated).toBe(false);
      expect(inheritedSocketActivated).toBe(false);
      expect(observedReads).toEqual(Object.fromEntries(keys.map((key) => [key, 0])));
      expect(runtime).not.toBeNull();
      expect(runtime!.unix_socket).toBeNull();
      expect(runtime!.http).not.toBeNull();
      const body = JSON.stringify({ version: "1", request_id: "health-pollution", kind: "query", name: "health", input: {} });
      const response = await fetch(runtime!.http!.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body,
      });
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        result: {
          route_admission_configured: false,
          evidence_verification_configured: false,
          dispatch_supported: false,
          execution_supported: false,
        },
      });
    } finally {
      await runtime?.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("returns only frozen adapter metadata, false capability flags, and one idempotent close", async () => {
    const directory = await mkdtemp("/tmp/mc-public-runtime-");
    const socketPath = join(directory, "control.sock");
    const reads = { repository: 0, bearer: 0, socket: 0, http: 0, port: 0 };
    const http = Object.create(null) as object;
    Object.defineProperty(http, "port", {
      enumerable: true,
      get: () => { reads.port += 1; return 0; },
    });
    const options = Object.create(null) as LocalControlPlaneRuntimeOptions;
    Object.defineProperties(options, {
      repository_database_path: {
        enumerable: true,
        get: () => { reads.repository += 1; return join(directory, "repository.sqlite"); },
      },
      bearer_token: {
        enumerable: true,
        get: () => { reads.bearer += 1; return token; },
      },
      unix_socket_path: {
        enumerable: true,
        get: () => { reads.socket += 1; return socketPath; },
      },
      http: {
        enumerable: true,
        get: () => { reads.http += 1; return http; },
      },
    });
    const runtime = await startLocalControlPlaneRuntime(options);
    try {
      expect(reads).toEqual({ repository: 1, bearer: 1, socket: 1, http: 1, port: 1 });
      expect(Object.keys(runtime).sort()).toEqual(expectedRuntimeKeys);
      expect(Object.isFrozen(runtime)).toBe(true);
      expect(runtime.dispatch_supported).toBe(false);
      expect(runtime.execution_supported).toBe(false);
      expect(runtime.unix_socket).not.toBeNull();
      expect(Object.keys(runtime.unix_socket!).sort()).toEqual(["path"]);
      expect(Object.isFrozen(runtime.unix_socket)).toBe(true);
      expect(runtime.unix_socket).toEqual({ path: socketPath });
      expect(runtime.http).not.toBeNull();
      expect(Object.keys(runtime.http!).sort()).toEqual(["app_url", "host", "port", "url"]);
      expect(Object.isFrozen(runtime.http)).toBe(true);
      expect(runtime.http).toMatchObject({
        host: "127.0.0.1",
        app_url: null,
      });
      expect(runtime.http!.url).toBe(`http://127.0.0.1:${runtime.http!.port}/rpc`);
      for (const forbidden of ["service", "execute", "store", "close"] as const) {
        expect(Object.hasOwn(runtime.unix_socket!, forbidden)).toBe(false);
        expect(Object.hasOwn(runtime.http!, forbidden)).toBe(false);
      }

      const body = JSON.stringify({ version: "1", request_id: "health-public", kind: "query", name: "health", input: {} });
      const frame = `Authorization: Bearer ${token}\nContent-Length: ${Buffer.byteLength(body)}\n\n${body}`;
      await expect(roundTrip(socketPath, frame)).resolves.toMatchObject({
        ok: true,
        result: {
          route_admission_configured: false,
          evidence_verification_configured: false,
          dispatch_supported: false,
          execution_supported: false,
        },
      });

      await runtime.close();
      await runtime.close();
      expect(await pathExists(socketPath)).toBe(false);
    } finally {
      await runtime.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
