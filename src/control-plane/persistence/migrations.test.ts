import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../..", import.meta.url));

describe("Bun SQLite control-plane stores", () => {
  it("applies and reopens both append-only schemas", () => {
    const output = execFileSync("bun", ["scripts/verify_control_plane_sqlite.ts"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(output.trim()).toBe("control-plane SQLite schemas verified");
  });
});
