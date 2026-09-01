import { describe, expect, it } from "vitest";
import { demoBanner, SameOriginSnapshotSource, sourceForLocation } from "./data-source.js";
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
