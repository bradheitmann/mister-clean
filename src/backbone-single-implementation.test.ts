/**
 * Guards that each backbone primitive has exactly one implementation. One
 * `describe` per master-gate S2 slice; each fails, naming file:line, if a
 * duplicate the slice removed comes back.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { fixtureGit } from "./test-support/fixture-repo.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Tracked non-test TypeScript under src/, scripts/ and tools/. */
function productionSources(): readonly { readonly path: string; readonly lines: readonly string[] }[] {
  return fixtureGit(ROOT, ["ls-files", "-z", "--", "src", "scripts", "tools"])
    .split("\0")
    .filter((path) => path.endsWith(".ts"))
    .filter((path) => !path.endsWith(".test.ts") && !path.endsWith(".test-fixture.ts"))
    .filter((path) => !path.startsWith("src/test-support/") && !path.startsWith("bin/"))
    .map((path) => ({ path, lines: readFileSync(join(ROOT, path), "utf8").split("\n") }));
}

function occurrences(pattern: RegExp, allowed: ReadonlySet<string>): string[] {
  const found: string[] = [];
  for (const { path, lines } of productionSources()) {
    if (allowed.has(path)) continue;
    lines.forEach((line, index) => {
      if (pattern.test(line)) found.push(`${path}:${index + 1}`);
    });
  }
  return found;
}

describe("codecs", () => {
  it("lists the production sources it guards", () => {
    const paths = productionSources().map((source) => source.path);
    expect(paths).toContain("src/canonical-json.ts");
    expect(paths).toContain("src/timestamp.ts");
    expect(paths).toContain("src/closeout/native-gates.ts");
    expect(paths.some((path) => path.endsWith(".test.ts"))).toBe(false);
  });

  it("(a) the canonical-JSON object encoder template occurs only in src/canonical-json.ts", () => {
    expect(occurrences(/\$\{JSON\.stringify\(key\)\}:/u, new Set(["src/canonical-json.ts"]))).toEqual([]);
  });

  it("(b) a date-shaped regex literal occurs only in src/timestamp.ts, apart from the recorded Date.parse-grammar obligations", () => {
    // Out of mg-s2a scope: these sites define their grammar through Date.parse, so no
    // engine-independent profile reproduces them byte for byte. Each is an obligation for
    // a follow-up slice; the list is exact, so a new site, or a moved one, fails here.
    const DATE_PARSE_GRAMMAR_OBLIGATIONS = [
      "src/closeout/accepted-release.ts:58",
      "src/closeout/planning-analysis/policy.ts:543",
      "src/control-plane/contracts/agent-profile.ts:4",
      "src/control-plane/contracts/snapshot.ts:22",
      "src/control-plane/runtime/snapshot-producer.ts:15",
    ];
    expect(occurrences(/\\d\{4\}-|\(\\d\{4\}\)-/u, new Set(["src/timestamp.ts"]))).toEqual(DATE_PARSE_GRAMMAR_OBLIGATIONS);
  });

  it("(c) a toISOString round-trip check occurs only in src/timestamp.ts", () => {
    expect(occurrences(/toISOString\(\) ===/u, new Set(["src/timestamp.ts"]))).toEqual([]);
  });

  it("(d) no private timestamp or canonical-JSON helper is defined outside the two modules", () => {
    const names = /\b(?:function|const|let|var|class)\s+(?:isoTimestamp|validIsoTimestamp|canonicalTimestamp|ISO_TIMESTAMP|canonicalJsonForSnapshot)\b/u;
    expect(occurrences(names, new Set(["src/timestamp.ts", "src/canonical-json.ts"]))).toEqual([]);
  });
});
