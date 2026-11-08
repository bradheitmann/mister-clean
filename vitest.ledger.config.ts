import { mergeConfig } from "vitest/config";
import base from "./vitest.config.ts";

// vitest.config.ts plus the git spawn ledger (src/test-support/git-spawn-ledger.ts).
export default mergeConfig(base, {
  test: {
    setupFiles: ["./src/test-support/git-spawn-ledger.ts"],
  },
});
