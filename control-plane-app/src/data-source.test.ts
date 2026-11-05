import { describe, expect, it } from "vitest";
import { demoBanner, SameOriginSnapshotSource, sessionTokenFromFragment, sourceForLocation } from "./data-source.js";
import { demoSnapshot } from "./fixture.js";

describe("control-plane snapshot boundary", () => {
  it("keeps demonstration data explicit and opt-in", async () => {
    const source = sourceForLocation("?demo=1", { load: async () => demoSnapshot });
    const snapshot = await source.load();
    expect(snapshot.source).toBe("demo");
    expect(demoBanner(snapshot)).toContain("NOT A CLEANLINESS VERDICT");
  });

  it("does not silently turn an unavailable live snapshot into fixture data", async () => {
    const source = new SameOriginSnapshotSource({ fetcher: async () => new Response("missing", { status: 404 }) });
    await expect(source.load()).rejects.toThrow("evidence unavailable");
  });

  it("rejects a response without a live evidence binding", async () => {
    const source = new SameOriginSnapshotSource({ fetcher: async () => new Response(JSON.stringify({ source: "demo" }), { status: 200 }) });
    await expect(source.load()).rejects.toThrow("missing a live evidence binding");
  });
});

describe("control-plane browser session", () => {
  it("sends the runtime bearer token from the launch fragment when it mints a session", async () => {
    const seen: Array<string | null> = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("authorization"));
      return String(input).endsWith("session") ? new Response(null, { status: 401 }) : new Response("{}", { status: 200 });
    }) as typeof fetch;
    const token = sessionTokenFromFragment("#session_token=local-control-plane-test-token-0000000001");
    expect(token).toBe("local-control-plane-test-token-0000000001");
    const source = new SameOriginSnapshotSource({ fetcher, sessionToken: token! });
    await expect(source.load()).rejects.toThrow("browser session (401)");
    expect(seen).toEqual(["Bearer local-control-plane-test-token-0000000001"]);
    expect(sessionTokenFromFragment("")).toBeUndefined();
  });
});
