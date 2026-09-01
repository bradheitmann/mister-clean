import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { extname, join, normalize, posix, resolve } from "node:path";

export type ParserSurfaceShape = "bun" | "custom" | "go" | "node" | "python" | "rust" | "shell";

export type RepositoryBoundaryRule =
  | "docker_copy_closure_gap"
  | "duplicate_handwritten_parser"
  | "external_producer_contract_invalid"
  | "ignored_artifact_acceptance_dependency"
  | "prototype_bearing_parsed_map"
  | "topology_inventory_invalid";

export interface RepositoryBoundaryFinding {
  readonly fingerprint: string;
  readonly rule: RepositoryBoundaryRule;
  readonly path: string;
  readonly detail: string;
  readonly related_paths: readonly string[];
}

export interface ParserSurface {
  readonly path: string;
  readonly shapes: readonly ParserSurfaceShape[];
}

export interface RepositoryBoundaryAuditResult {
  readonly record_type: "mister-clean.repository-boundary-audit";
  readonly schema_version: "1.0";
  readonly status: "pass" | "fail";
  readonly exitCode: 0 | 1;
  readonly candidate_path_count: number;
  readonly parser_surfaces: readonly ParserSurface[];
  readonly external_contract_count: number;
  readonly findings: readonly RepositoryBoundaryFinding[];
}

export interface ObjectMapArrayWireContract {
  readonly id: string;
  readonly producer: string;
  readonly expected_version: string;
  readonly observed_version: string;
  readonly fixture: string;
  readonly shape: "object-map-of-arrays";
  readonly required_keys?: readonly string[];
  readonly row_keys?: readonly string[];
}

const SOURCE_EXTENSIONS = new Set([".bash", ".cjs", ".go", ".js", ".jsx", ".mjs", ".py", ".rs", ".sh", ".ts", ".tsx"]);
const FORBIDDEN_MAP_KEYS = Object.freeze(["__proto__", "constructor", "prototype"] as const);
const INVENTORY_PATH = ".mister-clean/repository-boundaries.json";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function finding(
  rule: RepositoryBoundaryRule,
  path: string,
  detail: string,
  relatedPaths: readonly string[] = [],
): RepositoryBoundaryFinding {
  const related_paths = [...new Set(relatedPaths)].sort();
  return Object.freeze({
    fingerprint: digest(`repository_boundary\0${rule}\0${path}\0${detail}\0${related_paths.join("\0")}`),
    rule,
    path,
    detail,
    related_paths,
  });
}

function candidatePaths(root: string): string[] {
  return execFileSync("git", ["-C", root, "ls-files", "-co", "--exclude-standard", "-z"], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  }).split("\0").filter(Boolean).sort();
}

function readableText(root: string, path: string): string | undefined {
  try {
    const metadata = lstatSync(join(root, path));
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 1_048_576) return undefined;
    return readFileSync(join(root, path), "utf8");
  } catch {
    return undefined;
  }
}

export function classifyParserShapes(path: string, source: string): readonly ParserSurfaceShape[] {
  const shapes = new Set<ParserSurfaceShape>();
  if (/\bBun\.file\s*\(|\bBun\.(?:JSON5|TOML)\b/u.test(source)) shapes.add("bun");
  if (/\b(?:JSON\.parse|parseDocument|yaml\.parse|YAML\.parse|URLSearchParams)\s*\(/u.test(source)) shapes.add("node");
  if (/\b(?:function\s+parse[A-Za-z0-9_]*|parse[A-Za-z0-9_]*\s*=)[\s\S]{0,800}\.(?:split|match)\s*\(/u.test(source)) shapes.add("custom");
  if (extname(path) === ".py" && /\b(?:json\.loads?|yaml\.safe_load|csv\.DictReader|configparser\.)\b/u.test(source)) shapes.add("python");
  if (new Set([".sh", ".bash"]).has(extname(path)) && /(?:\bjq\b|\bwhile\s+IFS=|\bread\s+-r\b)/u.test(source)) shapes.add("shell");
  if (extname(path) === ".rs" && /\b(?:serde_json|serde_yaml)::(?:from_|Deserializer)/u.test(source)) shapes.add("rust");
  if (extname(path) === ".go" && /\b(?:json\.(?:Unmarshal|NewDecoder)|yaml\.Unmarshal)\b/u.test(source)) shapes.add("go");
  return [...shapes].sort();
}

function parserFingerprint(source: string): string | undefined {
  if (!/\b(?:function\s+parse[A-Za-z0-9_]*|parse[A-Za-z0-9_]*\s*=)/u.test(source)) return undefined;
  return digest(source
    .replace(/\bparse[A-Za-z0-9_]*\b/gu, "parse$HANDWRITTEN")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/\/\/[^\n]*/gu, "")
    .replace(/\s+/gu, ""));
}

function unsafeParsedMaps(source: string): string[] {
  const results: string[] = [];
  const parserRanges = [...source.matchAll(/\bfunction\s+parse[A-Za-z0-9_]*\s*\([^)]*\)[^{]*\{[\s\S]*?^\}/gmu)]
    .filter((match) => codePosition(source, match.index))
    .map((match) => [match.index, match.index + match[0].length] as const);
  const declarations = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)(?:\s*:[^=;]+)?\s*=\s*(\{\s*\}|Object\.create\s*\(\s*null\s*\))/gu;
  for (const match of source.matchAll(declarations)) {
    if (!codePosition(source, match.index)
      || !parserRanges.some(([start, end]) => match.index >= start && match.index < end)) continue;
    const name = match[1];
    const initializer = match[2] ?? "";
    if (!name || !new RegExp(`\\b${name.replace(/[$]/gu, "\\$")}\\s*\\[[^\\]]+\\]\\s*=`, "u").test(source)) continue;
    const nullPrototype = initializer.includes("Object.create");
    const filtersForbiddenKeys = FORBIDDEN_MAP_KEYS.every((key) => source.includes(key));
    if (!nullPrototype || !filtersForbiddenKeys) results.push(name);
  }
  return results;
}

function ignored(root: string, path: string): boolean {
  try {
    execFileSync("git", ["-C", root, "check-ignore", "-q", "--", path], {
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function codePosition(source: string, target: number): boolean {
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < target; index += 1) {
    const character = source[index] ?? "";
    const next = source[index + 1] ?? "";
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
    } else if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
    } else if (character === "\"" || character === "'" || character === "`") {
      quote = character;
    }
  }
  return !quote && !lineComment && !blockComment;
}

function ignoredAcceptancePaths(root: string, source: string): string[] {
  const paths: string[] = [];
  const pattern = /\b(?:readFileSync|readFile|Bun\.file)\s*\(\s*["']([^"']+)["']/gu;
  for (const match of source.matchAll(pattern)) {
    if (!codePosition(source, match.index)) continue;
    const path = match[1];
    if (path && !path.startsWith("/") && ignored(root, path)) paths.push(path);
  }
  return [...new Set(paths)].sort();
}

function resolveImport(from: string, specifier: string, paths: ReadonlySet<string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  const withoutRuntimeExtension = base.replace(/\.(?:c|m)?js$/u, "");
  for (const candidate of [base, ...[".ts", ".tsx", ".js", ".mjs", ".cjs"].flatMap((extension) => [`${base}${extension}`, `${withoutRuntimeExtension}${extension}`]), ...[".ts", ".tsx", ".js"].map((extension) => `${base}/index${extension}`)]) {
    if (paths.has(candidate)) return candidate;
  }
  return undefined;
}

function importClosure(entrypoint: string, sources: ReadonlyMap<string, string>): Set<string> {
  const closure = new Set<string>();
  const pending = [entrypoint];
  while (pending.length > 0) {
    const path = pending.pop() as string;
    if (closure.has(path)) continue;
    closure.add(path);
    const source = sources.get(path);
    if (!source) continue;
    const pattern = /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*["']([^"']+)["']/gu;
    for (const match of source.matchAll(pattern)) {
      const dependency = resolveImport(path, match[1] ?? "", new Set(sources.keys()));
      if (dependency && !closure.has(dependency)) pending.push(dependency);
    }
  }
  return closure;
}

function dockerCopySources(source: string): { readonly copied: readonly string[]; readonly entrypoints: readonly string[] } | undefined {
  const copied: string[] = [];
  const entrypoints: string[] = [];
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (/^COPY\s+/iu.test(line)) {
      const body = line.replace(/^COPY\s+/iu, "").replace(/^--[A-Za-z-]+=(?:"[^"]*"|\S+)\s+/u, "");
      if (!body || /[*?$]/u.test(body) || body.includes("--from=")) return undefined;
      if (body.startsWith("[")) {
        try {
          const values = JSON.parse(body) as unknown;
          if (!Array.isArray(values) || values.some((value) => typeof value !== "string") || values.length < 2) return undefined;
          copied.push(...values.slice(0, -1));
        } catch {
          return undefined;
        }
      } else {
        const values = body.split(/\s+/u);
        if (values.length < 2) return undefined;
        copied.push(...values.slice(0, -1));
      }
    }
    if (/^(?:CMD|ENTRYPOINT)\s+/iu.test(line)) {
      for (const match of line.matchAll(/["']([^"']+\.(?:[cm]?[jt]sx?))["']/gu)) entrypoints.push(match[1] as string);
    }
  }
  return { copied: copied.map((path) => normalize(path).replaceAll("\\", "/").replace(/^\.\//u, "")), entrypoints };
}

function coveredByCopy(path: string, copied: readonly string[]): boolean {
  return copied.some((candidate) => candidate === "." || candidate === path || (candidate.endsWith("/") && path.startsWith(candidate)));
}

function wireContractErrors(contract: ObjectMapArrayWireContract, value: unknown): string[] {
  const errors: string[] = [];
  if (contract.observed_version !== contract.expected_version) errors.push("producer version does not match expected_version");
  if (value === null || Array.isArray(value) || typeof value !== "object") return [...errors, "fixture root is not an object map"];
  const record = value as Record<string, unknown>;
  for (const key of FORBIDDEN_MAP_KEYS) if (Object.prototype.hasOwnProperty.call(record, key)) errors.push(`fixture contains forbidden map key ${key}`);
  for (const key of contract.required_keys ?? []) if (!Object.prototype.hasOwnProperty.call(record, key)) errors.push(`fixture is missing required key ${key}`);
  const exactRowKeys = contract.row_keys === undefined ? undefined : [...contract.row_keys].sort();
  for (const [mapKey, rows] of Object.entries(record)) {
    if (!Array.isArray(rows)) {
      errors.push(`map entry ${mapKey} is not an array`);
      continue;
    }
    if (exactRowKeys !== undefined) {
      for (const [index, row] of rows.entries()) {
        if (row === null || Array.isArray(row) || typeof row !== "object") {
          errors.push(`map entry ${mapKey}[${index}] is not an object`);
          continue;
        }
        const observed = Object.keys(row as Record<string, unknown>).sort();
        if (JSON.stringify(observed) !== JSON.stringify(exactRowKeys)) errors.push(`map entry ${mapKey}[${index}] row keys drifted`);
      }
    }
  }
  return errors;
}

export function validateExternalProducerWireShape(contract: ObjectMapArrayWireContract, value: unknown): readonly string[] {
  return wireContractErrors(contract, value);
}

function externalContracts(root: string, paths: ReadonlySet<string>): { readonly count: number; readonly findings: readonly RepositoryBoundaryFinding[] } {
  if (!paths.has(INVENTORY_PATH)) return { count: 0, findings: [] };
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(join(root, INVENTORY_PATH), "utf8"));
  } catch (error) {
    return { count: 0, findings: [finding("topology_inventory_invalid", INVENTORY_PATH, error instanceof Error ? error.message : String(error))] };
  }
  const record = data !== null && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : undefined;
  const contracts = record?.schema_version === "1.0" && Array.isArray(record.external_producers) ? record.external_producers : undefined;
  if (!contracts) return { count: 0, findings: [finding("topology_inventory_invalid", INVENTORY_PATH, "inventory requires schema_version 1.0 and external_producers array")] };
  const findings: RepositoryBoundaryFinding[] = [];
  for (const [index, raw] of contracts.entries()) {
    const contract = raw as Partial<ObjectMapArrayWireContract>;
    const path = typeof contract.fixture === "string" ? contract.fixture : INVENTORY_PATH;
    if (typeof contract.id !== "string" || typeof contract.producer !== "string"
      || typeof contract.expected_version !== "string" || typeof contract.observed_version !== "string"
      || typeof contract.fixture !== "string" || contract.shape !== "object-map-of-arrays"
      || !paths.has(contract.fixture)) {
      findings.push(finding("topology_inventory_invalid", INVENTORY_PATH, `external_producers[${index}] is incomplete or references a path outside the candidate surface`, [path]));
      continue;
    }
    try {
      const errors = wireContractErrors(contract as ObjectMapArrayWireContract, JSON.parse(readFileSync(join(root, contract.fixture), "utf8")));
      if (errors.length > 0) findings.push(finding("external_producer_contract_invalid", contract.fixture, `${contract.id}: ${errors.join("; ")}`, [INVENTORY_PATH]));
    } catch (error) {
      findings.push(finding("external_producer_contract_invalid", contract.fixture, error instanceof Error ? error.message : String(error), [INVENTORY_PATH]));
    }
  }
  return { count: contracts.length, findings };
}

export function auditRepositoryBoundaries(rootInput: string): RepositoryBoundaryAuditResult {
  const root = resolve(rootInput);
  const paths = candidatePaths(root);
  const pathSet = new Set(paths);
  const sources = new Map<string, string>();
  for (const path of paths) {
    if (!SOURCE_EXTENSIONS.has(extname(path))) continue;
    const text = readableText(root, path);
    if (text !== undefined) sources.set(path, text);
  }
  const parser_surfaces = [...sources.entries()]
    .map(([path, source]) => ({ path, shapes: classifyParserShapes(path, source) }))
    .filter((surface) => surface.shapes.length > 0)
    .sort((left, right) => left.path.localeCompare(right.path));
  const findings: RepositoryBoundaryFinding[] = [];

  const duplicateGroups = new Map<string, string[]>();
  for (const surface of parser_surfaces) {
    const source = sources.get(surface.path) as string;
    for (const name of unsafeParsedMaps(source)) {
      findings.push(finding("prototype_bearing_parsed_map", surface.path, `dynamic parsed map ${name} must use a null prototype and reject __proto__, constructor, and prototype`));
    }
    if (surface.shapes.includes("custom")) {
      const fingerprint = parserFingerprint(source);
      if (fingerprint) duplicateGroups.set(fingerprint, [...(duplicateGroups.get(fingerprint) ?? []), surface.path]);
    }
  }
  for (const group of duplicateGroups.values()) {
    if (group.length > 1) findings.push(finding("duplicate_handwritten_parser", group[0] as string, "equivalent handwritten parser implementations have split custody", group));
  }

  for (const [path, source] of sources) {
    if (!/(?:^|\/)(?:test|tests|__tests__|scripts)\//u.test(path) && !/\.test\.[^.]+$/u.test(path)) continue;
    for (const artifact of ignoredAcceptancePaths(root, source)) {
      findings.push(finding("ignored_artifact_acceptance_dependency", path, `acceptance reads ignored artifact ${artifact}; only exact-candidate clean reconstruction can confer credit`, [artifact]));
    }
  }

  const dockerPaths = paths.filter((path) => /(?:^|\/)(?:Dockerfile|Containerfile)(?:\.[^/]*)?$/u.test(path));
  for (const dockerPath of dockerPaths) {
    const inventory = dockerCopySources(readableText(root, dockerPath) ?? "");
    if (!inventory) continue;
    for (const entrypoint of inventory.entrypoints) {
      const normalizedEntrypoint = posix.normalize(entrypoint.replace(/^\.\//u, ""));
      if (!sources.has(normalizedEntrypoint)) continue;
      const missing = [...importClosure(normalizedEntrypoint, sources)].filter((path) => !coveredByCopy(path, inventory.copied));
      if (missing.length > 0) findings.push(finding("docker_copy_closure_gap", dockerPath, `runtime entrypoint ${normalizedEntrypoint} imports source omitted from declarative COPY inventory`, missing));
    }
  }

  const contracts = externalContracts(root, pathSet);
  findings.push(...contracts.findings);
  findings.sort((left, right) => left.rule.localeCompare(right.rule) || left.path.localeCompare(right.path));
  const status = findings.length === 0 ? "pass" : "fail";
  return Object.freeze({
    record_type: "mister-clean.repository-boundary-audit",
    schema_version: "1.0",
    status,
    exitCode: status === "pass" ? 0 : 1,
    candidate_path_count: paths.length,
    parser_surfaces,
    external_contract_count: contracts.count,
    findings,
  });
}
