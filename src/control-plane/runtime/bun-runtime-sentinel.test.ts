import { describe, expect, it } from "vitest";

describe("Bun test partition runtime", () => {
  it("runs under Bun", () => {
    expect(process.versions.bun).toBeDefined();
  });
});
