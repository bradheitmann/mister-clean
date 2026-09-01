import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bindRuntimeAttestation } from "./attestation.js";
import { MATERIALS, MATERIALS_SHA256, PACKAGE_VERSION } from "./generated-materials.js";
import { mintServerAttestationBinding } from "./runtime-binding.js";
import { createMisterCleanServer } from "./server.js";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

describe("Mister Clean MCP server", () => {
  let client: Client;
  let server: ReturnType<typeof createMisterCleanServer>;

  beforeEach(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "mister-clean-test-client", version: "1.0.0" });
    server = createMisterCleanServer();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(async () => {
    await Promise.all([client.close(), server.close()]);
  });

  it("advertises two bounded read-only tools and the closeout prompts", async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "mister_clean_list_materials",
      "mister_clean_read_material",
    ]);
    expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(tools.tools.every((tool) => tool.annotations?.destructiveHint === false)).toBe(true);

    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name)).toEqual([
      "mister_clean_closeout",
      "mister_clean_orchestration_goal",
    ]);
  });

  it("exposes a startup attestation tool when the stdio entrypoint binds one", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const boundClient = new Client({ name: "mister-clean-bound-test-client", version: "1.0.0" });
    const runtimeAttestation = await bindRuntimeAttestation(repositoryRoot, {
      moduleUrl: import.meta.url,
      expectedEntrypoint: "./dist/public.js",
      allowSourceDevelopment: true,
      sourceDevelopmentReason: "server test source execution",
    });
    const boundServer = createMisterCleanServer({ runtimeAttestation });
    try {
      await Promise.all([boundServer.connect(serverTransport), boundClient.connect(clientTransport)]);
      const tools = await boundClient.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain("mister_clean_attestation");
      const result = await boundClient.callTool({
        name: "mister_clean_attestation",
        arguments: { response_format: "json" },
      });
      expect(result.structuredContent).toMatchObject({
        record_type: "mister-clean.runtime-attestation-diagnostic",
        capability: false,
        status: "source_development",
        entrypoint: { path: "./src/server.test.ts" },
      });
      expect(result.structuredContent).not.toHaveProperty("package_root");
      expect(result.structuredContent).not.toHaveProperty("package_root_realpath");
      expect(result.structuredContent).not.toHaveProperty("entrypoint.realpath");
      expect(JSON.stringify(result.structuredContent)).not.toContain(repositoryRoot);
      const roundTripped = JSON.parse(JSON.stringify(result.structuredContent));
      expect(() => createMisterCleanServer({ runtimeAttestation: roundTripped }))
        .toThrow("must be minted by Mister Clean's live verifier");
    } finally {
      await Promise.all([boundClient.close(), boundServer.close()]);
    }
  });

  it("rejects a structurally valid but unverified runtime attestation", () => {
    expect(() => createMisterCleanServer({
      runtimeAttestation: {
        record_type: "mister-clean.runtime-attestation-binding",
        schema_version: "1.0",
        status: "pass",
        package_root: "/tmp/mister-clean",
        package_root_realpath: "/tmp/mister-clean",
        entrypoint: {
          path: "./dist/stdio.js",
          realpath: "/tmp/mister-clean/dist/stdio.js",
          sha256: "1".repeat(64),
        },
      },
    })).toThrow("must be minted by Mister Clean's live verifier");
  });

  it("reports the worker's bounded bundled-content claim without implying package-filesystem verification", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const boundClient = new Client({ name: "mister-clean-worker-test-client", version: "1.0.0" });
    const binding = mintServerAttestationBinding({
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
      reason: "test worker binding",
    });
    const boundServer = createMisterCleanServer({ runtimeAttestation: binding });
    try {
      await Promise.all([boundServer.connect(serverTransport), boundClient.connect(clientTransport)]);
      const result = await boundClient.callTool({
        name: "mister_clean_attestation",
        arguments: { response_format: "json" },
      });
      expect(result.structuredContent).toMatchObject({
        record_type: "mister-clean.runtime-attestation-diagnostic",
        capability: false,
        status: "bundled_content",
        bundle: { entry_count: MATERIALS.length, sha256: MATERIALS_SHA256 },
        claim_scope: "bundled_canonical_material_bytes_only",
      });
      expect(result.structuredContent).not.toHaveProperty("package_root");
    } finally {
      await Promise.all([boundClient.close(), boundServer.close()]);
    }
  });

  it("lists and reads canonical content through the protocol", async () => {
    const listed = await client.callTool({
      name: "mister_clean_list_materials",
      arguments: { category: "entrypoint", response_format: "json" },
    });
    expect(listed.isError).not.toBe(true);
    expect(listed.structuredContent).toMatchObject({
      count: 1,
      total_count: 1,
      items: [{ id: "SKILL.md" }],
    });

    const read = await client.callTool({
      name: "mister_clean_read_material",
      arguments: { material_id: "SKILL.md", line_count: 12, response_format: "json" },
    });
    expect(read.isError).not.toBe(true);
    expect(read.structuredContent).toMatchObject({
      id: "SKILL.md",
      start_line: 1,
      end_line: 12,
      has_more: true,
    });
  });

  it("lists and reads every evaluation routed by SKILL.md", async () => {
    const expected = [
      "evals/blind-run-contract.md",
      "evals/mcp-evaluation.xml",
      "evals/model-hygiene-trial.md",
      "evals/rotation-campaign.md",
    ];
    const listed = await client.callTool({
      name: "mister_clean_list_materials",
      arguments: { category: "evaluation", limit: 100, response_format: "json" },
    });
    const ids = (listed.structuredContent as { items?: Array<{ id?: string }> })?.items
      ?.map((item) => item.id);
    expect(ids).toEqual(expected);
    for (const materialId of expected) {
      const read = await client.callTool({
        name: "mister_clean_read_material",
        arguments: { material_id: materialId, line_count: 1, response_format: "json" },
      });
      expect(read.isError, materialId).not.toBe(true);
      expect(read.structuredContent).toMatchObject({ id: materialId });
    }
  });

  it("returns a tool error for an unknown or path-like material ID", async () => {
    const result = await client.callTool({
      name: "mister_clean_read_material",
      arguments: { material_id: "../../SKILL.md" },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: "text" });
  });

  it("publishes every listed material as an MCP resource", async () => {
    const resources = await client.listResources();
    expect(resources.resources.length).toBeGreaterThan(20);
    const skill = resources.resources.find((resource) => resource.uri.includes("SKILL.md"));
    expect(skill).toBeDefined();
    if (!skill) return;
    const read = await client.readResource({ uri: skill.uri });
    const content = read.contents[0];
    expect(content).toBeDefined();
    if (!content) return;
    expect(content).toMatchObject({ mimeType: "text/markdown" });
    expect("text" in content ? content.text : "").toBe(
      MATERIALS.find((material) => material.id === "SKILL.md")?.content,
    );
  });

  it("produces a closeout prompt that preserves authority and boundaries", async () => {
    const prompt = await client.getPrompt({
      name: "mister_clean_closeout",
      arguments: { repository: "example-repository", mode: "CLOSE" },
    });
    const content = prompt.messages[0]?.content;
    expect(content?.type).toBe("text");
    expect(content?.type === "text" ? content.text : "").toContain("standing authorization");
    expect(content?.type === "text" ? content.text : "").toContain("hard safety");
  });

  it("exposes GUARD as an executable prompt mode", async () => {
    const prompt = await client.getPrompt({
      name: "mister_clean_closeout",
      arguments: { repository: "example-repository", mode: "GUARD" },
    });
    const content = prompt.messages[0]?.content;
    const text = content?.type === "text" ? content.text : "";
    expect(text).toContain("in GUARD mode");
    expect(text).toContain("standing authorization");
  });

  it("instantiates the optional persistent goal without making it evidence", async () => {
    const prompt = await client.getPrompt({
      name: "mister_clean_orchestration_goal",
      arguments: { repository: "example-repository", mode: "CLOSE" },
    });
    const content = prompt.messages[0]?.content;
    const text = content?.type === "text" ? content.text : "";
    expect(text).toContain("$mister-clean");
    expect(text).toContain("example-repository");
    expect(text).toContain("zero cleanup-introduced debt");
    expect(text).toContain("not evidence of cleanliness");
    expect(text).not.toContain("{repository}");
    expect(text).not.toContain("{mode}");
  });
});
