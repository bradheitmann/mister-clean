import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMisterCleanServer } from "./server.js";

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

  it("advertises two bounded read-only tools and one closeout prompt", async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "mister_clean_list_materials",
      "mister_clean_read_material",
    ]);
    expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(tools.tools.every((tool) => tool.annotations?.destructiveHint === false)).toBe(true);

    const prompts = await client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name)).toEqual(["mister_clean_closeout"]);
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
    expect("text" in content ? content.text : "").toContain("Founding contract");
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
});
