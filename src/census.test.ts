import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { captureFileCensus, compareFileCensuses, validateFileCensus } from "./census.js";
import { captureRepositoryObject } from "./closeout/repository-object.js";

function fixture(): string {
  return mkdtempSync(join(tmpdir(), "mister-clean-census-"));
}

describe("canonical file census", () => {
  it("counts direct-root and nested regular files under one exact contract", async () => {
    const repository = fixture();
    mkdirSync(join(repository, "evidence", "nested"), { recursive: true });
    for (let index = 0; index < 61; index += 1) writeFileSync(join(repository, "evidence", `direct-${String(index).padStart(2, "0")}.txt`), `direct ${index}\n`);
    writeFileSync(join(repository, "evidence", "nested", "receipt.txt"), "nested\n");

    const census = await captureFileCensus({ repository_root: repository, roots: ["evidence"] });

    expect(census.summary.file_count).toBe(62);
    expect(census.summary.direct_file_count).toBe(61);
    expect(census.summary.nested_file_count).toBe(1);
    expect(census.summary.direct_file_count + census.summary.nested_file_count).toBe(census.summary.file_count);
    expect(census.entries[0]?.path).toBe("evidence/direct-00.txt");
    expect(validateFileCensus(census)).toEqual([]);
  });

  it("distinguishes incompatible measurement scope from mutation", async () => {
    const repository = fixture();
    mkdirSync(join(repository, "evidence", "nested"), { recursive: true });
    writeFileSync(join(repository, "evidence", "direct.txt"), "direct\n");
    writeFileSync(join(repository, "evidence", "nested", "receipt.txt"), "nested\n");
    const full = await captureFileCensus({ repository_root: repository, roots: ["evidence"] });
    const nestedOnly = await captureFileCensus({ repository_root: repository, roots: ["evidence/nested"] });

    expect(compareFileCensuses(full, nestedOnly)).toMatchObject({ status: "scope_mismatch" });
  });

  it("detects same-size content changes as actual mutation", async () => {
    const repository = fixture();
    mkdirSync(join(repository, "evidence"));
    const target = join(repository, "evidence", "receipt.txt");
    writeFileSync(target, "alpha\n");
    const before = await captureFileCensus({ repository_root: repository, roots: ["evidence"] });
    writeFileSync(target, "bravo\n");
    const after = await captureFileCensus({ repository_root: repository, roots: ["evidence"] });

    expect(before.summary.file_count).toBe(after.summary.file_count);
    expect(before.summary.total_bytes).toBe(after.summary.total_bytes);
    expect(compareFileCensuses(before, after)).toMatchObject({ status: "present" });
  });

  it("invalidates a passed corpus seal after byte, path, or executable-metadata mutation", async () => {
    const repository = fixture();
    mkdirSync(join(repository, "evidence"));
    const target = join(repository, "evidence", "receipt.txt");
    const renamed = join(repository, "evidence", "renamed.txt");
    writeFileSync(target, "alpha\n");
    execFileSync("git", ["init", "--quiet", repository]);
    execFileSync("git", ["-C", repository, "add", "evidence/receipt.txt"]);
    const fixtureEmail = `user.email=seal${String.fromCharCode(64)}example.invalid`;
    execFileSync("git", ["-C", repository, "-c", "user.name=Seal Test", "-c", fixtureEmail, "commit", "--quiet", "-m", "seal fixture"]);
    const sealedCensus = await captureFileCensus({ repository_root: repository, roots: ["evidence"] });
    const sealedObject = captureRepositoryObject(repository);
    const recheck = async (): Promise<boolean> => {
      const reviewed = await captureFileCensus({ repository_root: repository, roots: ["evidence"] });
      return compareFileCensuses(sealedCensus, reviewed).status === "absent"
        && captureRepositoryObject(repository).sha256 === sealedObject.sha256;
    };

    expect(await recheck()).toBe(true);
    writeFileSync(target, "bravo\n");
    expect(await recheck()).toBe(false);
    writeFileSync(target, "alpha\n");
    renameSync(target, renamed);
    expect(await recheck()).toBe(false);
    renameSync(renamed, target);
    chmodSync(target, 0o755);
    expect((await captureFileCensus({ repository_root: repository, roots: ["evidence"] })).summary.aggregate_sha256)
      .toBe(sealedCensus.summary.aggregate_sha256);
    expect(await recheck()).toBe(false);
  });

  it("rejects symlinks instead of silently counting or following them", async () => {
    const repository = fixture();
    mkdirSync(join(repository, "evidence"));
    writeFileSync(join(repository, "outside.txt"), "outside\n");
    symlinkSync(join(repository, "outside.txt"), join(repository, "evidence", "linked.txt"));

    await expect(captureFileCensus({ repository_root: repository, roots: ["evidence"] }))
      .rejects.toThrow("rejects symbolic link");
  });

  it("rejects special filesystem entries instead of omitting them", async () => {
    const repository = fixture();
    mkdirSync(join(repository, "evidence"));
    execFileSync("mkfifo", [join(repository, "evidence", "receipt.pipe")]);

    await expect(captureFileCensus({ repository_root: repository, roots: ["evidence"] }))
      .rejects.toThrow("rejects special filesystem entry");
  });

  it("fails closed when the corpus changes between stability passes", async () => {
    const repository = fixture();
    mkdirSync(join(repository, "evidence"));
    const target = join(repository, "evidence", "receipt.txt");
    writeFileSync(target, "before\n");

    await expect(captureFileCensus({
      repository_root: repository,
      roots: ["evidence"],
      test_hooks: {
        between_stability_passes: () => writeFileSync(target, "after!\n"),
      },
    })).rejects.toThrow("scope changed between stability passes");
  });

  it("rejects an explicit root reached through a symbolic-link ancestor", async () => {
    const repository = fixture();
    mkdirSync(join(repository, "outside", "nested"), { recursive: true });
    writeFileSync(join(repository, "outside", "nested", "receipt.txt"), "outside\n");
    symlinkSync(join(repository, "outside"), join(repository, "linked"));

    await expect(captureFileCensus({ repository_root: repository, roots: ["linked/nested"] }))
      .rejects.toThrow("resolves through a symbolic-link path");
  });

  it("rejects a sidecar inside the measured root", async () => {
    const repository = fixture();
    mkdirSync(join(repository, "evidence"));
    writeFileSync(join(repository, "evidence", "receipt.txt"), "receipt\n");

    await expect(captureFileCensus({
      repository_root: repository,
      roots: ["evidence"],
      output_path: join(repository, "evidence", "census.json"),
    })).rejects.toThrow("outside every measured root");
  });

  it("rejects forged summary totals before interpreting a delta", async () => {
    const repository = fixture();
    mkdirSync(join(repository, "evidence"));
    writeFileSync(join(repository, "evidence", "receipt.txt"), "receipt\n");
    const valid = await captureFileCensus({ repository_root: repository, roots: ["evidence"] });
    const forged = { ...valid, summary: { ...valid.summary, file_count: 99 } };

    expect(compareFileCensuses(valid, forged)).toMatchObject({ status: "invalid_summary" });
  });

  it("rejects empty, overlapping, and misleading scope declarations", async () => {
    const repository = fixture();
    mkdirSync(join(repository, "evidence", "nested"), { recursive: true });
    writeFileSync(join(repository, "evidence", "nested", "receipt.txt"), "receipt\n");

    await expect(captureFileCensus({ repository_root: repository, roots: [] }))
      .rejects.toThrow("at least one measured root");
    await expect(captureFileCensus({ repository_root: repository, roots: ["evidence", "evidence/nested"] }))
      .rejects.toThrow("must not overlap");
    await expect(captureFileCensus({
      repository_root: repository,
      roots: ["evidence"],
      exclusions: ["outside"],
    })).rejects.toThrow("outside every measured root");
  });

  it("rejects forged entries outside or excluded by the declared scope", async () => {
    const repository = fixture();
    mkdirSync(join(repository, "evidence"));
    writeFileSync(join(repository, "evidence", "receipt.txt"), "receipt\n");
    const valid = await captureFileCensus({ repository_root: repository, roots: ["evidence"] });
    const outside = {
      ...valid,
      entries: valid.entries.map((entry) => ({ ...entry, path: "outside.txt" })),
      summary: { ...valid.summary, direct_file_count: 0, nested_file_count: 1 },
    };
    const excluded = {
      ...valid,
      scope: { ...valid.scope, exclusions: ["evidence/receipt.txt"] },
    };

    expect(validateFileCensus(outside).some((error) => error.includes("outside every measured root"))).toBe(true);
    expect(validateFileCensus(excluded).some((error) => error.includes("excluded by census scope"))).toBe(true);
  });
});
