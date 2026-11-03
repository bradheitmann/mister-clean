import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Every vitest run gets its own temporary root under the temp directory the run
 * started with. Workers and child processes inherit it through TMPDIR, so a
 * fixture whose teardown fails (hook timeout under load, a killed run, an
 * ENOTEMPTY race with a child still writing) cannot outlive the run, and tests
 * that look for leftovers see only their own run.
 */
export const RUN_ROOT_PREFIX = "mister-clean-test-run-";

export function createRunRoot(base: string = tmpdir()): string {
  return mkdtempSync(join(base, RUN_ROOT_PREFIX));
}

export function removeRunRoot(root: string): { readonly removed: string } {
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  return { removed: root };
}

export default function setup(): () => void {
  const root = createRunRoot();
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = root;
  return () => {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
    removeRunRoot(root);
  };
}
