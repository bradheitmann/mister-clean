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

  it("(b) a date-shaped regex literal occurs only in src/timestamp.ts, apart from the 5 allowlisted Date.parse grammars", () => {
    // Obligations for mg-s2-ts-dateparse: these sites define their grammar through Date.parse,
    // so no Date.parse-free profile reproduces them byte for byte. Each is allowed once, by file
    // and enclosing function or const name; any other site fails, including a new one in these files.
    const OBLIGATION = "obligation: mg-s2-ts-dateparse";
    const DATE_PARSE_GRAMMARS: Readonly<Record<string, string>> = {
      "src/closeout/accepted-release.ts iso": OBLIGATION,
      "src/closeout/planning-analysis/policy.ts validTimestampWithZone": OBLIGATION,
      "src/control-plane/contracts/agent-profile.ts timestamp": OBLIGATION,
      "src/control-plane/contracts/snapshot.ts timestamp": OBLIGATION,
      "src/control-plane/runtime/snapshot-producer.ts timestamp": OBLIGATION,
    };
    const declaration = /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*))/u;
    const enclosingName = (lines: readonly string[], index: number): string => {
      for (let line = index; line >= 0; line -= 1) {
        const match = declaration.exec(lines[line]!);
        if (match) return match[1] ?? match[2]!;
      }
      return "<module>";
    };
    const seen = new Map<string, string[]>();
    const unexpected: string[] = [];
    for (const { path, lines } of productionSources()) {
      if (path === "src/timestamp.ts") continue;
      lines.forEach((line, index) => {
        if (!/\\d\{4\}-|\(\\d\{4\}\)-/u.test(line)) return;
        const key = `${path} ${enclosingName(lines, index)}`;
        if (DATE_PARSE_GRAMMARS[key] === undefined) unexpected.push(`${path}:${index + 1}`);
        else seen.set(key, [...(seen.get(key) ?? []), `${path}:${index + 1}`]);
      });
    }
    expect(unexpected).toEqual([]);
    const repeated = [...seen.values()].filter((sites) => sites.length > 1).flat();
    expect(repeated).toEqual([]);
    expect([...seen.keys()].sort()).toEqual(Object.keys(DATE_PARSE_GRAMMARS).sort());
  });

  it("(c) a toISOString round-trip check occurs only in src/timestamp.ts", () => {
    expect(occurrences(/toISOString\(\) ===/u, new Set(["src/timestamp.ts"]))).toEqual([]);
  });

  it("(d) no private timestamp or canonical-JSON helper is defined outside the two modules", () => {
    const names = /\b(?:function|const|let|var|class)\s+(?:isoTimestamp|validIsoTimestamp|canonicalTimestamp|ISO_TIMESTAMP|canonicalJsonForSnapshot)\b/u;
    expect(occurrences(names, new Set(["src/timestamp.ts", "src/canonical-json.ts"]))).toEqual([]);
  });
});
