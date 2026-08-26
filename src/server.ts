import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { MATERIALS, PACKAGE_VERSION } from "./generated-materials.js";
import {
  getMaterial,
  listMaterials,
  MATERIAL_CATEGORIES,
  readMaterialLines,
} from "./materials.js";

const ResponseFormatSchema = z.enum(["markdown", "json"]);
const MaterialCategorySchema = z.enum(MATERIAL_CATEGORIES);

const MaterialSummarySchema = z
  .object({
    id: z.string(),
    category: MaterialCategorySchema,
    title: z.string(),
    mime_type: z.string(),
    line_count: z.number().int().nonnegative(),
    resource_uri: z.string(),
  })
  .strict();

const ListMaterialsInputSchema = z
  .object({
    category: MaterialCategorySchema.optional().describe("Optional material category filter."),
    limit: z.number().int().min(1).max(100).default(25).describe("Maximum materials to return."),
    offset: z.number().int().min(0).default(0).describe("Number of matching materials to skip."),
    response_format: ResponseFormatSchema.default("markdown").describe("Human-readable Markdown or machine-readable JSON."),
  })
  .strict();

const ListMaterialsOutputSchema = z
  .object({
    total_count: z.number().int().nonnegative(),
    count: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative(),
    has_more: z.boolean(),
    next_offset: z.number().int().nonnegative().optional(),
    items: z.array(MaterialSummarySchema),
  })
  .strict();

const ReadMaterialInputSchema = z
  .object({
    material_id: z.string().min(1).max(240).describe("Exact ID returned by mister_clean_list_materials."),
    start_line: z.number().int().min(1).default(1).describe("First one-based line to return."),
    line_count: z.number().int().min(1).max(400).default(200).describe("Maximum number of lines to return."),
    response_format: ResponseFormatSchema.default("markdown").describe("Human-readable Markdown or machine-readable JSON."),
  })
  .strict();

const ReadMaterialOutputSchema = z
  .object({
    id: z.string(),
    category: MaterialCategorySchema,
    title: z.string(),
    mime_type: z.string(),
    start_line: z.number().int().positive(),
    end_line: z.number().int().nonnegative(),
    total_lines: z.number().int().nonnegative(),
    has_more: z.boolean(),
    next_line: z.number().int().positive().optional(),
    content: z.string(),
  })
  .strict();

function materialUri(id: string): string {
  return `mister-clean://materials/${encodeURIComponent(id)}`;
}

function orchestrationGoal(repository: string, mode: string): string {
  const template = getMaterial("templates/orchestration-goal.md");
  if (!template) throw new Error("Bundled orchestration-goal template is unavailable");
  return template.content
    .replaceAll("{mode}", mode)
    .replaceAll("{repository}", repository);
}

function asText(format: "markdown" | "json", markdown: string, value: object): string {
  return format === "json" ? JSON.stringify(value, null, 2) : markdown;
}

export function createMisterCleanServer(): McpServer {
  const server = new McpServer({
    name: "mister-clean-mcp-server",
    version: PACKAGE_VERSION,
  });

  server.registerTool(
    "mister_clean_list_materials",
    {
      title: "List Mister Clean materials",
      description:
        "List the canonical, public Mister Clean skill materials. Use this before reading references so progressive disclosure remains navigable. This tool only reads bundled public content; it does not inspect or modify a repository.",
      inputSchema: ListMaterialsInputSchema,
      outputSchema: ListMaterialsOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ category, limit, offset, response_format }) => {
      const matching = listMaterials(category);
      const page = matching.slice(offset, offset + limit);
      const items = page.map((material) => ({
        id: material.id,
        category: material.category,
        title: material.title,
        mime_type: material.mimeType,
        line_count: material.lineCount,
        resource_uri: materialUri(material.id),
      }));
      const hasMore = offset + items.length < matching.length;
      const output = {
        total_count: matching.length,
        count: items.length,
        offset,
        has_more: hasMore,
        ...(hasMore ? { next_offset: offset + items.length } : {}),
        items,
      };
      const lines = [
        "# Mister Clean materials",
        "",
        `Showing ${items.length} of ${matching.length}${category ? ` ${category}` : ""} materials.`,
        "",
        ...items.map((item) => `- \`${item.id}\` — ${item.title} (${item.line_count} lines)`),
      ];
      return {
        content: [{ type: "text", text: asText(response_format, lines.join("\n"), output) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    "mister_clean_read_material",
    {
      title: "Read a Mister Clean material",
      description:
        "Read a bounded line range from one canonical public Mister Clean material by exact ID. Use the returned next_line until has_more is false when the complete document is required. This tool never reads arbitrary paths and never receives repository contents.",
      inputSchema: ReadMaterialInputSchema,
      outputSchema: ReadMaterialOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ material_id, start_line, line_count, response_format }) => {
      const material = getMaterial(material_id);
      if (!material) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Unknown material_id ${JSON.stringify(material_id)}. Call mister_clean_list_materials for valid IDs.`,
            },
          ],
        };
      }
      if (start_line > material.lineCount) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `start_line ${start_line} exceeds ${material.id}'s ${material.lineCount} lines.`,
            },
          ],
        };
      }
      const range = readMaterialLines(material, start_line, line_count);
      const output = {
        id: material.id,
        category: material.category,
        title: material.title,
        mime_type: material.mimeType,
        start_line: range.startLine,
        end_line: range.endLine,
        total_lines: range.totalLines,
        has_more: range.hasMore,
        ...(range.nextLine ? { next_line: range.nextLine } : {}),
        content: range.content,
      };
      const markdown = `# ${material.title}\n\nLines ${range.startLine}-${range.endLine} of ${range.totalLines}.\n\n${range.content}`;
      return {
        content: [{ type: "text", text: asText(response_format, markdown, output) }],
        structuredContent: output,
      };
    },
  );

  for (const [index, material] of MATERIALS.entries()) {
    const uri = materialUri(material.id);
    server.registerResource(
      `mister-clean-material-${index + 1}`,
      uri,
      {
        title: material.title,
        description: `Canonical Mister Clean ${material.category}: ${material.id}`,
        mimeType: material.mimeType,
      },
      async (requestedUri) => ({
        contents: [
          {
            uri: requestedUri.href,
            mimeType: material.mimeType,
            text: material.content,
          },
        ],
      }),
    );
  }

  server.registerPrompt(
    "mister_clean_closeout",
    {
      title: "Close a repository with Mister Clean",
      description:
        "Prepare a local repository for a successor team under Mister Clean's standing-authority and successor-readiness contracts.",
      argsSchema: z
        .object({
          repository: z
            .string()
            .min(1)
            .max(500)
            .describe("Local repository path or unambiguous repository name."),
          mode: z.enum(["CLOSE", "CLEAN", "CONFORM", "AUDIT"]).default("CLOSE"),
        })
        .strict(),
    },
    ({ repository, mode }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Invoke $mister-clean in ${mode} mode for ${repository}. Read ` +
              `${materialUri("SKILL.md")} completely before acting, then follow its progressive-disclosure routes. ` +
              "The invocation is standing authorization for the documented in-scope procedures; pay actionable debt rather than queuing it. " +
              "Respect the skill's hard safety, ownership, and external-effect boundaries, and do not claim CLEAN without its evidence gates.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "mister_clean_orchestration_goal",
    {
      title: "Create an optional persistent Mister Clean goal",
      description:
        "Instantiate Mister Clean's optional, non-authoritative persistent-goal template for a long-running repository closeout.",
      argsSchema: z
        .object({
          repository: z.string().min(1).max(500).describe("Local repository path or unambiguous repository name."),
          mode: z.enum(["CLOSE", "CLEAN", "CONFORM", "AUDIT"]).default("CLOSE"),
        })
        .strict(),
    },
    ({ repository, mode }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: orchestrationGoal(repository, mode),
          },
        },
      ],
    }),
  );

  return server;
}
