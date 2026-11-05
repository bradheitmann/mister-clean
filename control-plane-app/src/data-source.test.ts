import { describe, expect, it } from "vitest";
import { demoBanner, SameOriginSnapshotSource, sessionTokenFromFragment, sourceForLocation, takeSessionTokenFromFragment } from "./data-source.js";
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

describe("control-plane launch fragment", () => {
  it("token fragment cleared: reading the token removes it from the address and leaves no history entry", () => {
    const calls: Array<readonly [unknown, string, string]> = [];
    const location = { hash: "#session_token=local-control-plane-test-token-0000000001&view=issues", pathname: "/app", search: "?x=1" };
    const history = { replaceState: (state: unknown, title: string, url: string) => { calls.push([state, title, url]); location.hash = new URL(url, "http://127.0.0.1").hash; }, pushState: () => { throw new Error("a new history entry would keep the token"); } };

    const token = takeSessionTokenFromFragment({ location, history } as never);

    expect(token).toBe("local-control-plane-test-token-0000000001");
    expect(calls).toHaveLength(1);
    expect(calls[0]![2]).toBe("/app?x=1#view=issues");
    expect(location.hash).not.toContain("local-control-plane-test-token-0000000001");
    expect(takeSessionTokenFromFragment({ location, history } as never)).toBeUndefined();
  });

  it("token fragment cleared: an address with no token is left alone", () => {
    const calls: string[] = [];
    const location = { hash: "#view=issues", pathname: "/app", search: "" };
    const history = { replaceState: (_state: unknown, _title: string, url: string) => calls.push(url) };
    expect(takeSessionTokenFromFragment({ location, history } as never)).toBeUndefined();
    expect(calls).toEqual([]);
    expect(location.hash).toBe("#view=issues");
  });
});
