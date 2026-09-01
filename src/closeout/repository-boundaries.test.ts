import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  auditRepositoryBoundaries,
  classifyParserShapes,
  validateExternalProducerWireShape,
  type ObjectMapArrayWireContract,
} from "./repository-boundaries.js";

const roots: string[] = [];

function fixture(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-repository-boundaries-"));
  roots.push(root);
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  execFileSync("git", ["-C", root, "config", "user.name", "Mister Clean Test"]);
  execFileSync("git", ["-C", root, "config", "user.email", "mister-clean.invalid"]);
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source, "utf8");
  }
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-qm", "fixture"]);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("repository boundary detector", () => {
  it("censuses custom, Bun, Node, Python, shell, Rust, and Go parser surfaces", () => {
    const cases: ReadonlyArray<readonly [string, string, string]> = [
      ["custom.ts", "function parseLines(text: string) { return text.split('\\n'); }", "custom"],
      ["bun.ts", "await Bun.file('input.json').json();", "bun"],
      ["node.ts", "JSON.parse(text);", "node"],
      ["tool.py", "value = json.loads(text)", "python"],
      ["tool.sh", "jq -e . input.json", "shell"],
      ["tool.rs", "serde_json::from_str::<Value>(text)", "rust"],
      ["tool.go", "json.Unmarshal(data, &value)", "go"],
    ];
    for (const [path, source, expected] of cases) expect(classifyParserShapes(path, source), path).toContain(expected);
  });

  it("binds external producer version, map shape, forbidden keys, and exact row keys", () => {
    const contract: ObjectMapArrayWireContract = {
      id: "resource-census",
      producer: "producer-cli",
      expected_version: "2.4.0",
      observed_version: "2.4.0",
      fixture: "fixtures/resources.json",
      shape: "object-map-of-arrays",
      required_keys: ["service:a"],
      row_keys: ["path", "status"],
    };
    expect(validateExternalProducerWireShape(contract, {
      "service:a": [{ path: "src/a.ts", status: "active" }],
    })).toEqual([]);
    expect(validateExternalProducerWireShape({ ...contract, observed_version: "2.5.0" }, {
      "service:a": [{ path: "src/a.ts", status: "active" }],
    })).toContain("producer version does not match expected_version");
    expect(validateExternalProducerWireShape(contract, [{ path: "src/a.ts", status: "active" }]))
      .toContain("fixture root is not an object map");
    expect(validateExternalProducerWireShape(contract, {
      "service:a": [{ path: "src/a.ts", resource_id: "service:a", status: "active" }],
    })).toContain("map entry service:a[0] row keys drifted");
    expect(validateExternalProducerWireShape(contract, JSON.parse('{"__proto__":[]}')))
      .toContain("fixture contains forbidden map key __proto__");
  });

  it("catches the missed parser-custody, prototype, ignored-output, and Docker closure class", () => {
    const parser = (name: string) => `export function ${name}(text: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of text.split("\\n")) {
    const [key, ...rest] = line.split(":");
    if (key) parsed[key.trim()] = rest.join(":").trim();
  }
  return parsed;
}
`;
    const root = fixture({
      ".gitignore": "dist/\n",
      "Dockerfile": "FROM oven/bun:1\nWORKDIR /app\nCOPY src/runtime.ts ./src/runtime.ts\nCMD [\"bun\", \"src/runtime.ts\"]\n",
      "src/parser-a.ts": parser("parseYamlA"),
      "src/parser-b.ts": parser("parseYamlB"),
      "src/runtime.ts": "import { sharedPolicy } from './shared.js';\nconsole.log(sharedPolicy);\n",
      "src/shared.ts": "export const sharedPolicy = 'strict';\n",
      "test/parser.test.ts": "import { readFileSync } from 'node:fs';\nreadFileSync('dist/generated.txt', 'utf8');\n",
    });
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", "generated.txt"), "stale\n", "utf8");

    const result = auditRepositoryBoundaries(root);
    expect(new Set(result.findings.map((row) => row.rule))).toEqual(new Set([
      "docker_copy_closure_gap",
      "duplicate_handwritten_parser",
      "ignored_artifact_acceptance_dependency",
      "prototype_bearing_parsed_map",
    ]));
    expect(result.status).toBe("fail");
    expect(result.parser_surfaces.map((row) => row.path)).toEqual([
      "src/parser-a.ts",
      "src/parser-b.ts",
    ]);
  });

  it("accepts one safe parser custodian and a closed Docker import surface", () => {
    const root = fixture({
      "Dockerfile": "FROM oven/bun:1\nWORKDIR /app\nCOPY src/ ./src/\nCMD [\"bun\", \"src/runtime.ts\"]\n",
      "src/parser.ts": `const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
export function parseLines(text: string): Record<string, string> {
  const parsed: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const line of text.split("\\n")) {
    const [key, value] = line.split(":");
    if (key && !FORBIDDEN.has(key)) parsed[key] = value ?? "";
  }
  return parsed;
}
`,
      "src/runtime.ts": "import { sharedPolicy } from './shared.js';\nconsole.log(sharedPolicy);\n",
      "src/shared.ts": "export const sharedPolicy = 'strict';\n",
    });

    expect(auditRepositoryBoundaries(root)).toMatchObject({ status: "pass", findings: [] });
  });

  it("executes prospective external-producer fixtures declared by the topology inventory", () => {
    const root = fixture({
      ".mister-clean/repository-boundaries.json": JSON.stringify({
        schema_version: "1.0",
        external_producers: [{
          id: "resources",
          producer: "producer-cli",
          expected_version: "1.0.0",
          observed_version: "1.0.0",
          fixture: "fixtures/resources.json",
          shape: "object-map-of-arrays",
          required_keys: ["service:a"],
          row_keys: ["path"],
        }],
      }),
      "fixtures/resources.json": JSON.stringify({ "service:a": [{ path: "src/a.ts", invented: true }] }),
    });

    const result = auditRepositoryBoundaries(root);
    expect(result.external_contract_count).toBe(1);
    expect(result.findings).toContainEqual(expect.objectContaining({ rule: "external_producer_contract_invalid" }));
  });
});
