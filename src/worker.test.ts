import { describe, expect, it } from "vitest";

import worker from "./worker.js";

const environment = {};
const context = {} as ExecutionContext;
type WorkerRequest = Parameters<typeof worker.fetch>[0];

function request(url: string): WorkerRequest {
  return new Request(url) as WorkerRequest;
}

describe("Mister Clean Worker routes", () => {
  it("serves a no-store health contract", async () => {
    const result = await worker.fetch(
      request("https://mister-clean.example/health"),
      environment,
      context,
    );
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    await expect(result.json()).resolves.toEqual({ service: "mister-clean-mcp-server", status: "ok" });
  });

  it("serves the bundled dashboard and its public token pack", async () => {
    const dashboard = await worker.fetch(
      request("https://mister-clean.example/dashboard/"),
      environment,
      context,
    );
    expect(dashboard.status).toBe(200);
    expect(dashboard.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'self' https://bradheitmann.ai https://www.bradheitmann.ai http://localhost:* http://127.0.0.1:*",
    );
    expect(await dashboard.text()).toContain("MISTER_CLEAN_DASHBOARD_STATE");

    const styles = await worker.fetch(
      request("https://mister-clean.example/dashboard/dashboard-tokens.css"),
      environment,
      context,
    );
    expect(styles.status).toBe(200);
    expect(styles.headers.get("content-type")).toContain("text/css");
    expect(await styles.text()).toContain("--mc-");
  });

  it("keeps unrelated paths closed", async () => {
    const result = await worker.fetch(
      request("https://mister-clean.example/private"),
      environment,
      context,
    );
    expect(result.status).toBe(404);
  });
});
