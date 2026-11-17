/**
 * Guards that each backbone primitive has exactly one implementation. One
 * `describe` per master-gate S2 slice; each fails, naming file:line, if a
 * duplicate the slice removed comes back.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { PHASE_IDS } from "./closeout/phase-registry.js";
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

/** Quoted family ids, for the two phase-registry guards below. */
const FAMILY_IDS: ReadonlySet<string> = new Set<string>(PHASE_IDS);
const REGISTRY = "src/closeout/phase-registry.ts";

function unwrapped(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isSpreadElement(current)) {
    current = current.expression;
  }
  return current;
}

function isFamilyIdLiteral(node: ts.Node): boolean {
  return (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && FAMILY_IDS.has(node.text);
}

/**
 * Does one element of a list name a family? It does when it is a quoted family
 * id, an object with a property whose value is one (a registry row), or a
 * tuple that holds one (a pair keyed by family).
 */
function elementNamesFamily(element: ts.Expression): boolean {
  const value = unwrapped(element);
  if (isFamilyIdLiteral(value)) return true;
  if (ts.isObjectLiteralExpression(value)) {
    return value.properties.some((property) => ts.isPropertyAssignment(property) && isFamilyIdLiteral(unwrapped(property.initializer)));
  }
  if (ts.isArrayLiteralExpression(value)) return value.elements.some((inner) => isFamilyIdLiteral(unwrapped(inner)));
  return false;
}

/** The const, let or var a node initializes, or "<expression>". */
function declarationName(node: ts.Node): string {
  for (let current: ts.Node | undefined = node; current !== undefined; current = current.parent) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) return current.name.text;
    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) break;
  }
  return "<expression>";
}

interface FamilyList {
  readonly site: string;
  readonly name: string;
}

/**
 * Every array literal (a tuple and the argument of `new Set` are array
 * literals too) and every tuple type in `text` that holds two or more quoted
 * family ids.
 */
function familyLists(path: string, text: string): FamilyList[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: FamilyList[] = [];
  const record = (node: ts.Node): void => {
    found.push({ site: `${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`, name: declarationName(node) });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isArrayLiteralExpression(node) && node.elements.filter(elementNamesFamily).length >= 2) record(node);
    if (ts.isTupleTypeNode(node) && node.elements.filter((element) => ts.isLiteralTypeNode(element) && isFamilyIdLiteral(element.literal)).length >= 2) record(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("phase registry", () => {
  /** Detector registries 1 to 5 are frozen data keyed by version; registry 6 is derived. */
  const FROZEN_REGISTRIES = /^DETECTOR_REGISTRY_V[1-5]$/u;
  const isFrozenRegistry = (path: string, list: FamilyList): boolean => path === "src/closeout/detector-coverage.ts" && FROZEN_REGISTRIES.test(list.name);

  it("lists the production sources it guards", () => {
    const paths = productionSources(["src"]).map((source) => source.path);
    for (const path of [REGISTRY, "src/cli.ts", "src/closeout/detector-coverage.ts", "src/closeout/finding-anchors.ts", "src/closeout/second-pass.ts", "src/closeout/bundle-live-validation.ts", "src/closeout/prepare.ts"]) {
      expect(paths).toContain(path);
    }
    expect(paths.some((path) => path.endsWith(".test.ts") || path.endsWith(".test-fixture.ts"))).toBe(false);
  });

  it("(a) no array, tuple or Set literal outside the registry and the frozen registries 1 to 5 holds two or more family ids", () => {
    const offenders: string[] = [];
    const frozen: string[] = [];
    for (const { path, lines } of productionSources(["src"])) {
      if (path === REGISTRY) continue;
      for (const list of familyLists(path, lines.join("\n"))) {
        if (isFrozenRegistry(path, list)) frozen.push(list.name);
        else offenders.push(`${list.site} ${list.name}`);
      }
    }
    expect(offenders).toEqual([]);
    // The exemption is live: these are the frozen registries that spell out two or more ids.
    expect(frozen.sort()).toEqual(["DETECTOR_REGISTRY_V1", "DETECTOR_REGISTRY_V5"]);
  });

  it("(b) the registry itself is the one list the scan finds in its file", () => {
    const registry = productionSources(["src"]).find((source) => source.path === REGISTRY)!;
    expect(familyLists(REGISTRY, registry.lines.join("\n")).map((list) => list.name)).toEqual(["PHASES"]);
  });

  it("(c) the scan flags each way of writing the list by hand, and nothing else", () => {
    const names = (text: string): string[] => familyLists("src/sample.ts", text).map((list) => list.name);
    expect(familyLists("src/closeout/second-pass.ts", "const first = 1;\nconst again = [\"planning_graph\", \"public_safety\"];\n")).toEqual([{ site: "src/closeout/second-pass.ts:2", name: "again" }]);
    expect(names("const list = ['planning_graph', `language_policy`] as const;")).toEqual(["list"]);
    expect(names("const set = new Set([\n  \"github_actions\",\n  \"semantic_boundary\",\n]);")).toEqual(["set"]);
    expect(names("const typed: ReadonlySet<string> = new Set<string>([\"planning_graph\", \"repository_boundaries\"]);")).toEqual(["typed"]);
    expect(names("const table = [{ family: \"planning_graph\", file: \"a.json\" }, { family: \"public_safety\", file: \"b.json\" }];")).toEqual(["table"]);
    expect(names("const pairs = [[\"planning_graph\", one], [\"github_actions\", two]];")).toEqual(["pairs"]);
    expect(names("const spread = [...earlier, \"planning_graph\", \"public_safety\"];")).toEqual(["spread"]);
    expect(names("type Listed = readonly [\"planning_graph\", \"public_safety\"];")).toEqual(["<expression>"]);
    expect(names("call([\"semantic_boundary\", \"language_policy\"]);")).toEqual(["<expression>"]);
    // One id, an id inside a longer string, a call's arguments, and a record keyed by family are not lists of ids.
    expect(names("const one = [\"planning_graph\", \"planning\"];")).toEqual([]);
    expect(names("const commands = [\"mister-clean/planning_graph@2\", \"mister-clean/public_safety@1\"];")).toEqual([]);
    expect(names("frozenInput(\"public_safety\", \"semantic_boundary\");")).toEqual([]);
    expect(names("const record = { planning_graph: 1, public_safety: 2 };")).toEqual([]);
    expect(names("const compared = id === \"planning_graph\" || id === \"public_safety\";")).toEqual([]);
  });

  it("(d) the six consumers read the registry", () => {
    const imports = /from\s+["'][^"']*\/phase-registry\.js["']/u;
    const importers = productionSources(["src"]).filter((source) => source.lines.some((line) => imports.test(line))).map((source) => source.path);
    for (const path of ["src/cli.ts", "src/closeout/bundle-detector-evidence.ts", "src/closeout/bundle-live-validation.ts", "src/closeout/detector-coverage.ts", "src/closeout/finding-anchors.ts", "src/closeout/second-pass.ts"]) {
      expect(importers).toContain(path);
    }
    // Data only: the registry imports nothing.
    const registry = productionSources(["src"]).find((source) => source.path === REGISTRY)!;
    expect(registry.lines.filter((line) => /^\s*import\s/u.test(line))).toEqual([]);
  });
});

describe("phase branches", () => {
  /** The files whose per-family behaviour the slice turned into records. */
  const SITES = [
    "src/closeout/bundle-detector-evidence.ts",
    "src/closeout/detector-coverage.ts",
    "src/closeout/finding-anchors.ts",
    "src/closeout/second-pass.ts",
  ] as const;

  /** Does `node` compare something with a quoted family id (`===`, `!==`, `==`, `!=`)? */
  function comparesFamilyId(node: ts.Node): boolean {
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      const equality = operator === ts.SyntaxKind.EqualsEqualsEqualsToken || operator === ts.SyntaxKind.ExclamationEqualsEqualsToken
        || operator === ts.SyntaxKind.EqualsEqualsToken || operator === ts.SyntaxKind.ExclamationEqualsToken;
      if (equality && (isFamilyIdLiteral(unwrapped(node.left)) || isFamilyIdLiteral(unwrapped(node.right)))) return true;
    }
    return ts.forEachChild(node, (child) => comparesFamilyId(child) || undefined) ?? false;
  }

  /** Every `else if` in `text` whose condition compares with a quoted family id. */
  function familyElseIfs(path: string, text: string): string[] {
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const found: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isIfStatement(node) && node.elseStatement !== undefined && ts.isIfStatement(node.elseStatement) && comparesFamilyId(node.elseStatement.expression)) {
        found.push(`${path}:${source.getLineAndCharacterOfPosition(node.elseStatement.getStart(source)).line + 1}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
  }

  const siteSources = () => productionSources(["src"]).filter((source) => (SITES as readonly string[]).includes(source.path));

  it("lists the four sites it guards", () => {
    expect(siteSources().map((source) => source.path).sort()).toEqual([...SITES]);
  });

  it("(a) no else-if compares a family or detector id with a quoted family id at the four sites", () => {
    expect(siteSources().flatMap((source) => familyElseIfs(source.path, source.lines.join("\n")))).toEqual([]);
  });

  it("(b) the scan flags such a chain, on one line or several, and not a plain if", () => {
    expect(familyElseIfs("src/sample.ts", "if (id === \"planning_graph\") a();\nelse if (id === \"public_safety\") b();\nelse c();\n")).toEqual(["src/sample.ts:2"]);
    expect(familyElseIfs("src/sample.ts", "if (ready) a();\nelse if (\n  family !== \"language_policy\"\n  && ready\n) {\n  b();\n} else if (\"github_actions\" == detectorId) c();\n")).toEqual(["src/sample.ts:2", "src/sample.ts:7"]);
    expect(familyElseIfs("src/sample.ts", "if (id === \"planning_graph\") a();\nif (id === \"public_safety\") b();\nelse if (kind === \"planning\") c();\n")).toEqual([]);
  });

  it("(c) each site keys its per-family behaviour by the registry's id type, so a family without an entry does not compile", () => {
    for (const source of siteSources()) {
      expect(source.lines.some((line) => /\}\s*satisfies\s+Record<PhaseId,/u.test(line)), source.path).toBe(true);
    }
  });
});

const REDUCER = "src/closeout/completion-debts.ts";
const PREPARE = "src/closeout/prepare.ts";

describe("completion debt reducer", () => {
  /** A call of either disposition, not its definition. */
  const DISPOSITION_CALL = /(?<!function\s+)\b(?:applyPublicSafetyExemptions|applyRetirements)\(/u;

  /** Each call of `callee` in `text`, with the names of the consts, lets and vars it lies inside. */
  function calls(path: string, text: string, callee: string): { readonly site: string; readonly within: readonly string[] }[] {
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    const found: { site: string; within: string[] }[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === callee) {
        const within: string[] = [];
        for (let current: ts.Node | undefined = node.parent; current !== undefined; current = current.parent) {
          if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) within.push(current.name.text);
        }
        found.push({ site: `${path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`, within });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
  }

  const prepareText = () => productionSources(["src"]).find((source) => source.path === PREPARE)!.lines.join("\n");

  it("lists the production sources it guards", () => {
    const paths = productionSources(["src"]).map((source) => source.path);
    for (const path of [REDUCER, PREPARE, "src/closeout/retirements.ts"]) expect(paths).toContain(path);
  });

  it("(a) only completion-debts.ts calls applyPublicSafetyExemptions or applyRetirements", () => {
    expect(occurrences(DISPOSITION_CALL, new Set([REDUCER]), ["src"])).toEqual([]);
    // The exemption is live: the reducer calls each once.
    const reducer = productionSources(["src"]).find((source) => source.path === REDUCER)!;
    expect(reducer.lines.filter((line) => DISPOSITION_CALL.test(line))).toHaveLength(2);
  });

  it("(b) prepare.ts builds its debts through reduceCompletionDebts: one call, and baselineDebt only for the ratification debts", () => {
    expect(calls(PREPARE, prepareText(), "reduceCompletionDebts")).toHaveLength(1);
    const outside = calls(PREPARE, prepareText(), "baselineDebt").filter((call) => !call.within.includes("ratificationDebts"));
    expect(outside.map((call) => call.site)).toEqual([]);
    expect(calls(PREPARE, prepareText(), "baselineDebt")).toHaveLength(1);
  });

  it("(c) the scans flag a call and not a definition, and place a call by its enclosing const", () => {
    expect(DISPOSITION_CALL.test("const outcome = applyRetirements(debts, records);")).toBe(true);
    expect(DISPOSITION_CALL.test("  const kept = applyPublicSafetyExemptions(")).toBe(true);
    expect(DISPOSITION_CALL.test("export function applyRetirements(")).toBe(false);
    expect(DISPOSITION_CALL.test("export function applyPublicSafetyExemptions<T extends {")).toBe(false);
    const sample = "const ratificationDebts = rows.map((row) => baselineDebt(id, row));\nconst planningDebts = roots.map((root) => baselineDebt(id, root));\n";
    expect(calls("src/sample.ts", sample, "baselineDebt")).toEqual([
      { site: "src/sample.ts:1", within: ["ratificationDebts"] },
      { site: "src/sample.ts:2", within: ["planningDebts"] },
    ]);
  });
});

describe("completion debt literals", () => {
  const FILES: readonly string[] = [PREPARE, REDUCER];
  /** A quoted string that holds a registered detector id, `mister-clean/<family>@<n>`. */
  const DETECTOR_ID = new RegExp(`["'\`][^"'\`\\n]*mister-clean/(?:${[...FAMILY_IDS].join("|")})@\\d+[^"'\`\\n]*["'\`]`, "u");
  /** A quoted string that ends in `-audit.json`. */
  const BUNDLE_FILE = /["'`][^"'`\n]*-audit\.json["'`]/u;

  function literals(path: string, lines: readonly string[]): string[] {
    return lines.flatMap((line, index) => (DETECTOR_ID.test(line) || BUNDLE_FILE.test(line) ? [`${path}:${index + 1}`] : []));
  }

  it("lists the two files it guards", () => {
    expect(productionSources(["src"]).filter((source) => FILES.includes(source.path)).map((source) => source.path).sort()).toEqual([...FILES].sort());
  });

  it("(a) prepare.ts and completion-debts.ts write no detector id and no bundle file name by hand", () => {
    expect(productionSources(["src"]).filter((source) => FILES.includes(source.path)).flatMap((source) => literals(source.path, source.lines))).toEqual([]);
  });

  it("(b) the scan flags each form, and not the normalizers or the native-gate files", () => {
    expect(literals("src/sample.ts", [
      "observationId(\"mister-clean/public_safety@1\", fingerprint)",
      "const id = 'mister-clean/planning_graph@2';",
      "writeJson(join(bundleDirectory, \"semantic-audit.json\"), audit);",
      "const name = `language-policy-audit.json`;",
      "}, \"mister-clean/public-safety-root@1\", {",
      "path: \"native-gate-validation.json\",",
      "command: \"mister-clean audit planning . --json\",",
    ])).toEqual(["src/sample.ts:1", "src/sample.ts:2", "src/sample.ts:3", "src/sample.ts:4"]);
  });
});
