import { MATERIALS } from "./generated-materials.js";

export const MATERIAL_CATEGORIES = [
  "agent",
  "asset",
  "entrypoint",
  "evaluation",
  "example",
  "reference",
  "template",
] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];
export type Material = (typeof MATERIALS)[number];

export function listMaterials(category?: MaterialCategory): readonly Material[] {
  return category ? MATERIALS.filter((material) => material.category === category) : MATERIALS;
}

export function getMaterial(id: string): Material | undefined {
  return MATERIALS.find((material) => material.id === id);
}

export function readMaterialLines(
  material: Material,
  startLine: number,
  lineCount: number,
): {
  content: string;
  endLine: number;
  hasMore: boolean;
  nextLine?: number;
  startLine: number;
  totalLines: number;
} {
  const lines = material.content.split("\n");
  const startIndex = startLine - 1;
  const selected = lines.slice(startIndex, startIndex + lineCount);
  const endLine = startIndex + selected.length;
  const hasMore = endLine < lines.length;
  return {
    content: selected.join("\n"),
    endLine,
    hasMore,
    ...(hasMore ? { nextLine: endLine + 1 } : {}),
    startLine,
    totalLines: lines.length,
  };
}
