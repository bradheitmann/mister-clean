import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // One temporary root per run; see scripts/test-tmp-root.ts.
    globalSetup: ["./scripts/test-tmp-root.ts"],
  },
});
