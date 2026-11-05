import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";
import { discoverNativeGates, validateDiscoveryIntegrity } from "./native-gates.js";
import { captureRepositoryObject } from "./repository-object.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("native gate source ref order", () => {
  // Field defect (7.5.1): ICU collation sorts `bun.lock` before `Cargo.lock`,
  // but the discovery validator requires UTF-8 byte order, so `prepare`
  // refused any repository mixing an uppercase root manifest with lowercase paths.
  it("emits mixed-case source refs in the UTF-8 byte order the validator requires", () => {
    const root = mkdtempSync(join(tmpdir(), "mister-clean-source-ref-order-"));
    roots.push(root);
    const repo = join(root, "repo");
    createFixtureRepository(repo, { identity: { name: "Source Ref Order Fixture", email: "source-ref-order.invalid" } });
    writeFileSync(join(repo, "Cargo.toml"), "[package]\nname='fixture'\nversion='0.1.0'\n");
    writeFileSync(join(repo, "Cargo.lock"), "version = 4\n");
    // Cargo.lock is not a gate source ref; it stays in the fixture to mirror the field repository shape.
    writeFileSync(join(repo, "package.json"), `${JSON.stringify({
      name: "source-ref-order-fixture",
      private: true,
      packageManager: "bun@1.0.0",
      scripts: { test: "bun test" },
    }, null, 2)}\n`);
    writeFileSync(join(repo, "bun.lock"), "fixture lock\n");
    mkdirSync(join(repo, "apps", "web"), { recursive: true });
    writeFileSync(join(repo, "apps", "web", "package.json"), `${JSON.stringify({ name: "web", private: true }, null, 2)}\n`);
    fixtureCommit(repo, "fixture");

    const discovery = discoverNativeGates(repo, captureRepositoryObject(repo));

    expect(discovery.source_refs.map((ref) => ref.path)).toEqual([
      "Cargo.toml",
      "apps/web/package.json",
      "bun.lock",
      "package.json",
    ]);
    expect(validateDiscoveryIntegrity(discovery)).toEqual([]);
  });
});
