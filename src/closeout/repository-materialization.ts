import {
  chmodSync,
  mkdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import type { RepositoryObjectSurfaceCapture } from "./repository-object.js";

/**
 * Recreate the exact filesystem projection captured by a RepositoryObject.
 * Git metadata and dependency installation are intentionally caller-owned:
 * this primitive writes only candidate entries and never resurrects a tracked
 * deletion or imports ignored build output.
 */
export function materializeRepositoryObjectSurface(
  capture: RepositoryObjectSurfaceCapture,
  destination: string,
): void {
  for (const entry of capture.entries) {
    const target = join(destination, entry.path);
    mkdirSync(dirname(target), { recursive: true });
    if (entry.kind === "regular_file") {
      const mode = entry.executable ? 0o755 : 0o644;
      writeFileSync(target, entry.bytes, { mode });
      chmodSync(target, mode);
    } else if (entry.kind === "symlink") {
      symlinkSync(Buffer.from(entry.target), target);
    } else if (entry.kind === "missing_tracked_entry" || entry.kind === "missing_gitlink") {
      // Absence is part of this candidate. Never restore the corresponding
      // HEAD/index bytes while materializing a worktree object.
      continue;
    } else {
      throw new Error(`RepositoryObject materialization refuses unsupported entry ${entry.kind}: ${entry.path}`);
    }
  }
}
