import { describe, expect, it } from "vitest";

import { MATERIALS, MATERIALS_SHA256, PACKAGE_VERSION } from "./generated-materials.js";
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
    await expect(result.json()).resolves.toEqual({
      service: "mister-clean-mcp-server",
      status: "ok",
      version: PACKAGE_VERSION,
      attestation: {
        scope: "bundled_canonical_material_bytes_only",
        materials_sha256: MATERIALS_SHA256,
        material_count: MATERIALS.length,
      },
    });
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
    expect(dashboard.headers.get("content-security-policy")).toContain(
      "script-src 'unsafe-inline' https://static.cloudflareinsights.com; connect-src 'self'",
    );
    expect(await dashboard.text()).toContain("MISTER_CLEAN_DASHBOARD_STATE");

    const indexAlias = await worker.fetch(
      request("https://mister-clean.example/dashboard/index.html"),
      environment,
      context,
    );
    expect(indexAlias.status).toBe(200);

    const scorecard = await worker.fetch(
      request("https://mister-clean.example/dashboard/model-scorecard.html"),
      environment,
      context,
    );
    expect(scorecard.status).toBe(200);
    const scorecardHtml = await scorecard.text();
    expect(scorecardHtml).toContain("MISTER_CLEAN_SCORECARD_INTERACTIONS_START");
    expect(scorecardHtml).toContain("data-scorecard-body");
    expect(scorecardHtml).toContain("Production-cleared");
    expect(scorecardHtml).toContain('rel="icon" href="./product-mark.svg" type="image/svg+xml"');
    expect(scorecardHtml).toContain('<img class="product-mark" src="./product-mark.svg" alt=""');

    const productMark = await worker.fetch(
      request("https://mister-clean.example/dashboard/product-mark.svg"),
      environment,
      context,
    );
    expect(productMark.status).toBe(200);
    expect(productMark.headers.get("content-type")).toContain("image/svg+xml");
    const productMarkSvg = await productMark.text();
    expect(productMarkSvg).toContain("<svg");
    expect(productMarkSvg).toContain("Repository paths converging through a clean passage");

    const styles = await worker.fetch(
      request("https://mister-clean.example/dashboard/dashboard-tokens.css"),
      environment,
      context,
    );
    expect(styles.status).toBe(200);
    expect(styles.headers.get("content-type")).toContain("text/css");
    const css = await styles.text();
    expect(css).toContain("--okoa-");
    expect(css).not.toContain("./fonts/");
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
