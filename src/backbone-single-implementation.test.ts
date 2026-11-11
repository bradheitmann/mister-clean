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

const DEFAULT_ROOTS = ["src", "scripts", "tools"] as const;

/** Tracked non-test TypeScript under `roots` (src/, scripts/ and tools/ by default). */
function productionSources(roots: readonly string[] = DEFAULT_ROOTS): readonly { readonly path: string; readonly lines: readonly string[] }[] {
  return fixtureGit(ROOT, ["ls-files", "-z", "--", ...roots])
    .split("\0")
    .filter((path) => path.endsWith(".ts"))
    .filter((path) => !path.endsWith(".test.ts") && !path.endsWith(".test-fixture.ts"))
    .filter((path) => !path.startsWith("src/test-support/") && !path.startsWith("bin/"))
    .map((path) => ({ path, lines: readFileSync(join(ROOT, path), "utf8").split("\n") }));
}

function occurrences(pattern: RegExp, allowed: ReadonlySet<string>, roots: readonly string[] = DEFAULT_ROOTS): string[] {
  const found: string[] = [];
  for (const { path, lines } of productionSources(roots)) {
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

describe("git runner", () => {
  const RUNNER = "src/closeout/git-hardening.ts";
  /** The only src/ modules that may import node:child_process, and the program expressions each may spawn. */
  const SPAWN_PROGRAMS: Readonly<Record<string, readonly string[]>> = {
    [RUNNER]: ["\"git\""],
    "src/closeout/action-hygiene.ts": ["\"ps\"", "\"lsof\""],
    "src/closeout/execution-lease.ts": ["\"powershell.exe\"", "\"ps\""],
    "src/closeout/execution-supervisor.ts": ["\"/bin/ps\"", "\"taskkill\"", "spec.executable", "process.execPath"],
    "src/closeout/native-gate-runner.ts": ["\"taskkill\""],
    "src/closeout/semantic.ts": ["command"],
    "src/control-plane/runtime/cmux-visual-readback.ts": ["DEFAULT_CMUX_BINARY"],
  };
  /**
   * Self-facing release scripts keep their base git spawns, frozen per file
   * (obligation: S6). prepare_release_archive.ts is absent from the DONE's
   * count of 16; its one spawn is a multi-line call at base 74e23b1.
   */
  const SCRIPT_GIT_SPAWNS: Readonly<Record<string, number>> = {
    "scripts/generate_codebase_history.ts": 1,
    "scripts/prepare_release_archive.ts": 1,
    "scripts/release_capsule.ts": 6,
    "scripts/verify_generated_candidate.ts": 4,
    "scripts/verify_packed_cli.ts": 5,
  };
  const CHILD_PROCESS = /["'](?:node:)?child_process["']/u;
  // Every child_process spawn API and the promisified alias in use; the program is the first argument.
  const SPAWN_CALL = new RegExp(`(?<![.\\w$])(?:${["spawnSync", "execFileSync", "execFileAsync", "execFile", "execSync", "spawn", "fork", "exec"].join("|")})\\(\\s*([^,)]+?)\\s*[,)]`, "gu");

  function spawnPrograms(text: string): { readonly program: string; readonly line: number }[] {
    return [...text.matchAll(SPAWN_CALL)].map((match) => ({ program: match[1]!, line: text.slice(0, match.index).split("\n").length }));
  }

  const sources = (prefix: string) => productionSources().filter((source) => source.path.startsWith(prefix)).map((source) => ({ path: source.path, text: source.lines.join("\n") }));

  it("(a) only the seven allowed src/ modules import node:child_process", () => {
    const importers = sources("src/").filter((source) => CHILD_PROCESS.test(source.text)).map((source) => source.path).sort();
    expect(importers).toEqual(Object.keys(SPAWN_PROGRAMS).sort());
  });

  it("(b) the literal \"git\" is a spawn program only in git-hardening.ts", () => {
    const offenders = sources("src/").filter((source) => source.path !== RUNNER)
      .flatMap((source) => spawnPrograms(source.text).filter((spawn) => spawn.program === "\"git\"").map((spawn) => `${source.path}:${spawn.line}`));
    expect(offenders).toEqual([]);
  });

  it("(c) every spawn in an allowed module names a program on that module's list", () => {
    const offenders: string[] = [];
    for (const source of sources("src/")) {
      const allowed = SPAWN_PROGRAMS[source.path];
      if (allowed === undefined) continue;
      for (const spawn of spawnPrograms(source.text)) {
        if (!allowed.includes(spawn.program)) offenders.push(`${source.path}:${spawn.line} ${spawn.program}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("(d) hardenedGitArgs and hardenedGitEnv are called outside git-hardening.ts only by native-gate-runner.ts", () => {
    const callers = occurrences(/\bhardenedGit(?:Args|Env)\(/u, new Set([RUNNER])).filter((site) => site.startsWith("src/"));
    expect(callers.map((site) => site.replace(/:\d+$/u, ""))).toEqual(["src/closeout/native-gate-runner.ts"]);
  });

  it("(e) scripts/ keeps its frozen per-file git spawn counts", () => {
    const counts: Record<string, number> = {};
    const sites: string[] = [];
    for (const source of sources("scripts/")) {
      const spawns = spawnPrograms(source.text).filter((spawn) => spawn.program === "\"git\"");
      if (spawns.length === 0) continue;
      counts[source.path] = spawns.length;
      sites.push(...spawns.map((spawn) => `${source.path}:${spawn.line}`));
    }
    expect(counts, sites.join("\n")).toEqual(SCRIPT_GIT_SPAWNS);
  });
});

describe("front matter", () => {
  const PARSER = "src/closeout/planning-analysis/front-matter.ts";
  /** Wider than the default: a parser added under customer-tests/ or ablations/ is seen too. */
  const ROOTS = ["src", "scripts", "tools", "customer-tests", "ablations"] as const;

  it("lists the production sources it guards", () => {
    const paths = productionSources(ROOTS).map((source) => source.path);
    expect(paths).toContain(PARSER);
    expect(paths).toContain("src/closeout/bundle.ts");
    expect(paths.some((path) => path.endsWith(".test.ts") || path.endsWith(".test-fixture.ts"))).toBe(false);
  });

  it("(a) a front-matter delimiter literal occurs only in the shared parser", () => {
    // A string literal "---" (any quote), or a regex starting ^--- or ^(?:---.
    expect(occurrences(/["'`]---["'`]|\/\^---|\/\^\(\?:---/u, new Set([PARSER]), ROOTS)).toEqual([]);
  });

  it("(b) no front-matter parser function or const is defined outside the shared parser", () => {
    expect(occurrences(/\b(?:function|const|let|var)\s+(?:declaredPlanningType|frontmatterRange|frontmatter)\b/u, new Set([PARSER]), ROOTS)).toEqual([]);
  });

  it("(c) only policy.ts and semantic.ts import the shared parser", () => {
    const IMPORTERS = new Set(["src/closeout/planning-analysis/policy.ts", "src/closeout/semantic.ts"]);
    const imports = /from\s+["'][^"']*\/front-matter\.js["']/u;
    expect(occurrences(imports, IMPORTERS, ROOTS)).toEqual([]);
    const importers = productionSources(ROOTS).filter((source) => source.lines.some((line) => imports.test(line))).map((source) => source.path);
    expect(importers.sort()).toEqual([...IMPORTERS].sort());
  });
});
