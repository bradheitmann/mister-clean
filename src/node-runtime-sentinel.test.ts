import { describe, expect, it } from "vitest";

describe("Node test partition runtime", () => {
  it("runs outside Bun", () => {
    expect(process.versions.bun).toBeUndefined();
  });
});
