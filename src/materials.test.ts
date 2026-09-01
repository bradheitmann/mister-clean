import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { getMaterial, listMaterials, readMaterialLines } from "./materials.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

describe("Mister Clean materials", () => {
  it("serves the canonical entrypoint bytes and categories", async () => {
    const materials = listMaterials();
    expect(materials.length).toBeGreaterThan(20);
    expect(materials.map((material) => material.id)).toContain("SKILL.md");
    expect(materials.map((material) => material.id)).toContain("templates/orchestration-goal.md");
    expect(getMaterial("SKILL.md")?.content).toBe(await readFile(join(ROOT, "SKILL.md"), "utf8"));
    expect(getMaterial("templates/orchestration-goal.md")?.content).toContain("Monotonic loop contract");
    expect(listMaterials("reference").every((material) => material.category === "reference")).toBe(true);
  });

  it("does not interpret material IDs as filesystem paths", () => {
    expect(getMaterial("../../SKILL.md")).toBeUndefined();
    expect(getMaterial("/etc/passwd")).toBeUndefined();
  });

  it("paginates long materials without losing line boundaries", () => {
    const skill = getMaterial("SKILL.md");
    expect(skill).toBeDefined();
    if (!skill) return;
    const first = readMaterialLines(skill, 1, 10);
    const second = readMaterialLines(skill, first.nextLine ?? 1, 10);
    expect(first.startLine).toBe(1);
    expect(first.endLine).toBe(10);
    expect(first.hasMore).toBe(true);
    expect(first.nextLine).toBe(11);
    expect(second.startLine).toBe(11);
    expect(`${first.content}\n${second.content}`).toBe(skill.content.split("\n").slice(0, 20).join("\n"));
  });
});
