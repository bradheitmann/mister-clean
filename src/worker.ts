import { createMcpHandler } from "agents/mcp/server";

import { MATERIALS, MATERIALS_SHA256, PACKAGE_VERSION } from "./generated-materials.js";
import { getMaterial } from "./materials.js";
import { mintServerAttestationBinding } from "./runtime-binding.js";
import { createMisterCleanServer } from "./server.js";

const runtimeAttestation = mintServerAttestationBinding({
  record_type: "mister-clean.runtime-attestation-binding",
  schema_version: "1.0",
  status: "bundled_content",
  package: { name: "@bradheitmann/mister-clean", version: PACKAGE_VERSION },
  bundle: {
    kind: "generated_materials",
    format: "canonical-json-sha256-v1",
    entry_count: MATERIALS.length,
    sha256: MATERIALS_SHA256,
  },
  claim_scope: "bundled_canonical_material_bytes_only",
  reason: "Cloudflare runtime has no package filesystem; this binding attests only the generated canonical material table compiled into the worker.",
});

const handleMcp = createMcpHandler(() => createMisterCleanServer({ runtimeAttestation }));

const baseHeaders = {
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
} as const;

const dashboardFrameAncestors = [
  "'self'",
  "https://bradheitmann.ai",
  "https://www.bradheitmann.ai",
  "http://localhost:*",
  "http://127.0.0.1:*",
].join(" ");

function response(body: BodyInit | null, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(baseHeaders)) headers.set(name, value);
  return new Response(body, { ...init, headers });
}

function materialResponse(id: string, contentType: string, extraHeaders: HeadersInit = {}): Response {
  const material = getMaterial(id);
  if (!material) return response("Bundled material unavailable", { status: 500 });
  return response(material.content, {
    headers: {
      "cache-control": "public, max-age=300",
      "content-type": contentType,
      ...Object.fromEntries(new Headers(extraHeaders).entries()),
    },
  });
}

function dashboardStylesResponse(): Response {
  const material = getMaterial("assets/codebase-state-dashboard/dashboard-tokens.css");
  if (!material) return response("Bundled material unavailable", { status: 500 });
  // The packaged dashboard keeps its licensed local font files. The Worker is
  // intentionally text-only, so its public projection removes font URLs and
  // uses the token pack's declared system fallbacks instead of serving broken
  // binary routes.
  const publicCss = material.content.replaceAll(/@font-face\{[^}]*\}/gu, "");
  return response(publicCss, {
    headers: {
      "cache-control": "public, max-age=300",
      "content-type": "text/css; charset=utf-8",
    },
  });
}

function dashboardHtmlResponse(id: string): Response {
  return materialResponse(id, "text/html; charset=utf-8", {
    "content-security-policy": `default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline' https://static.cloudflareinsights.com; connect-src 'self'; img-src 'self' data:; frame-ancestors ${dashboardFrameAncestors}`,
  });
}

function landingPage(origin: string): string {
  const escapedOrigin = origin.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mister Clean MCP</title><meta name="description" content="Read-only MCP access to the Mister Clean successor-readiness skill.">
<style>body{margin:0;background:#0a0a0a;color:#f2f2ef;font:16px/1.55 ui-monospace,Menlo,monospace}main{max-width:760px;margin:0 auto;padding:12vh 24px}p{color:#aaa}a{color:#32ffa0}code{background:#181818;padding:.15em .35em}hr{border:0;border-top:1px solid #333;margin:40px 0}</style></head>
<body><main><p>MISTER CLEAN · READ-ONLY MCP</p><h1>Pay the debt. Leave a clean inheritance.</h1>
<p>The public server exposes the canonical skill, references, templates, examples, and closeout prompt. Repository work remains local to the invoking agent.</p>
<p><a href="/dashboard/">Open the codebase-state dashboard</a> · <a href="https://bradheitmann.ai/mister-clean/">Project page</a> · <a href="https://github.com/bradheitmann/mister-clean">Source</a></p>
<hr><p>Streamable HTTP endpoint: <code>${escapedOrigin}/mcp</code></p></main></body></html>`;
}

export default {
  async fetch(request, env, context): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/mcp" || url.pathname === "/mcp/") {
      return handleMcp(request, env, context);
    }
    if (url.pathname === "/health") {
      const health = {
        service: "mister-clean-mcp-server",
        status: "ok",
        version: PACKAGE_VERSION,
        attestation: {
          scope: runtimeAttestation.claim_scope,
          materials_sha256: runtimeAttestation.bundle.sha256,
          material_count: runtimeAttestation.bundle.entry_count,
        },
      };
      return response(JSON.stringify(health), {
        headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
      });
    }
    if (url.pathname === "/dashboard") {
      return response(null, { status: 308, headers: { location: "/dashboard/" } });
    }
    if (url.pathname === "/dashboard/" || url.pathname === "/dashboard/index.html") {
      return dashboardHtmlResponse("assets/codebase-state-dashboard/index.html");
    }
    if (url.pathname === "/dashboard/model-scorecard.html") {
      return dashboardHtmlResponse("assets/codebase-state-dashboard/model-scorecard.html");
    }
    if (url.pathname === "/dashboard/product-mark.svg") {
      return materialResponse("assets/codebase-state-dashboard/product-mark.svg", "image/svg+xml; charset=utf-8");
    }
    if (url.pathname === "/dashboard/dashboard-tokens.css") {
      return dashboardStylesResponse();
    }
    if (url.pathname === "/" && request.method === "GET") {
      return response(landingPage(url.origin), {
        headers: {
          "cache-control": "public, max-age=300",
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
          "content-type": "text/html; charset=utf-8",
          "x-frame-options": "DENY",
        },
      });
    }
    return response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  },
} satisfies ExportedHandler;
