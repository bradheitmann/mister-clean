import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runVerifiedBuild } from "./run_verified_build.js";

const temporaryRoots: string[] = [];

async function repositoryFixture(): Promise<string> {
  const repository = await mkdtemp(join(tmpdir(), "mc-verified-build-test-"));
  temporaryRoots.push(repository);
  await writeFile(join(repository, "source.txt"), "pristine\n", "utf8");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: repository });
  execFileSync("git", ["config", "user.name", "Verified Build Fixture"], { cwd: repository });
  execFileSync("git", ["config", "user.email", "verified-build.invalid"], { cwd: repository });
  execFileSync("git", ["add", "source.txt"], { cwd: repository });
  execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: repository });
  return repository;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("verified build source boundary", () => {
  it("leaves the source RepositoryObject exact when private verification fails", async () => {
    const repository = await repositoryFixture();
    expect(() => runVerifiedBuild(repository, "worktree", () => {
      throw new Error("private capsule build failed");
    })).toThrow("private capsule build failed");
    await expect(readFile(join(repository, "source.txt"), "utf8")).resolves.toBe("pristine\n");
  });

  it("reports a source mutation even when the private verifier also fails", async () => {
    const repository = await repositoryFixture();
    expect(() => runVerifiedBuild(repository, "worktree", () => {
      execFileSync(process.execPath, ["-e", "require('node:fs').writeFileSync('source.txt','mutated\\n')"], { cwd: repository });
      throw new Error("private capsule build failed");
    })).toThrow("private verification failed and the source candidate changed");
  });
});
