import { describe, expect, it } from "vitest";
import { CAPABILITY_DEFINITIONS } from "../../src/control-plane/contracts/capability-taxonomy.js";
import { PRODUCT_INTRO_GROUPS } from "./product-intro.js";

describe("first-use product introduction", () => {
  it("covers every repository-remediation capability exactly once", () => {
    const grouped = PRODUCT_INTRO_GROUPS.flatMap((group) => group.capability_ids);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(CAPABILITY_DEFINITIONS.map((item) => item.id).sort());
  });

  it("keeps the introductory inventory scannable", () => {
    expect(PRODUCT_INTRO_GROUPS).toHaveLength(8);
    expect(PRODUCT_INTRO_GROUPS.every((group) => group.title.length > 0 && group.summary.length > 0)).toBe(true);
  });
});
