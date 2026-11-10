/**
 * Frozen oracles for mg-s2c-front-matter: verbatim copies of the three front-matter
 * parsers as they stood on main 469d740, before the slice replaced them with one
 * shared parser (src/closeout/planning-analysis/front-matter.ts).
 *
 * Each copy sits between a BEGIN and an END marker line with the base lines verbatim
 * between them, so a text diff against `git show 469d740:<path> | sed -n <range>p`
 * proves the copy is exact (charter/DONE/mg-s2c-front-matter.md, proof 1). Do not
 * reformat the lines between the markers.
 *
 * The compositions below the copies reproduce how each base consumer used its parser:
 * policy `parseSource` for a non-structured extension (policy.ts:725-733 with the
 * YAML branch of `parseStructured`), semantic `planningRecord`'s `.md` branch
 * (semantic.ts:266-278) and the bundle procedure gate (bundle.ts:375-376).
 */
import { parse as parseYaml } from "yaml";

import { isNonArtifactPlanningClass } from "./planning.js";

// src/closeout/bundle.ts:88-96 at 469d740
// BEGIN oracle_bundle
function declaredPlanningType(content: string): string | undefined {
  const frontMatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontMatter) return undefined;
  for (const key of ["artifact_type", "kind", "type"]) {
    const line = frontMatter[1]!.match(new RegExp(`^${key}:[ \\t]*["']?([^"'\\r\\n#]+?)["']?[ \\t]*(?:#.*)?$`, "m"));
    if (line) return line[1]!.trim();
  }
  return undefined;
}
// END oracle_bundle
export { declaredPlanningType as oracle_bundle };

// src/closeout/planning-analysis/policy.ts:685-702 at 469d740
// BEGIN oracle_policy
function frontmatterRange(content: string): { end: number; lines: string[]; start: number } | undefined {
  const lines = content.split(/\r?\n/);
  let start = 0;
  while (start < lines.length) {
    while (lines[start]?.trim() === "") start += 1;
    if (lines[start]?.trim().startsWith("<!--")) {
      while (start < lines.length && !lines[start]?.includes("-->")) start += 1;
      if (start < lines.length) start += 1;
      continue;
    }
    break;
  }
  if (lines[start]?.trim() !== "---") return undefined;
  for (let end = start + 1; end < lines.length; end += 1) {
    if (lines[end]?.trim() === "---") return { end, lines, start };
  }
  return undefined;
}
// END oracle_policy
export { frontmatterRange as oracle_policy };

// src/closeout/semantic.ts:255-264 at 469d740
// BEGIN oracle_semantic
function frontmatter(content: string): string | undefined {
  const opening = /^---[ \t]*$/mu.exec(content);
  if (!opening) return undefined;
  const prefix = content.slice(0, opening.index).replaceAll(/<!--[\s\S]*?-->/gu, "").trim();
  if (prefix) return undefined;
  const bodyStart = opening.index + opening[0].length;
  const remainder = content.slice(bodyStart).replace(/^\r?\n/u, "");
  const closing = /^(?:---|\.\.\.)[ \t]*$/mu.exec(remainder);
  return closing ? remainder.slice(0, closing.index).replace(/\r?\n$/u, "") : undefined;
}
// END oracle_semantic
export { frontmatter as oracle_semantic };

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/**
 * Base policy `parseSource` for a non-structured extension (policy.ts:725-733) composed
 * with the YAML branch of `parseStructured` (policy.ts:704-723): whether the base
 * framed a block, and whether that block parsed to a YAML object (`structured`).
 */
export function oraclePolicyParse(content: string): { readonly framed: boolean; readonly structured: boolean } {
  const range = frontmatterRange(content);
  if (!range) return { framed: false, structured: false };
  const raw = range.lines.slice(range.start + 1, range.end).join("\n");
  try {
    return { framed: true, structured: object(parseYaml(raw)) !== undefined };
  } catch {
    return { framed: true, structured: false };
  }
}

/** Base semantic `planningRecord`'s `.md`/`.mdx` branch (semantic.ts:266-278). */
export function oracleSemanticRecord(content: string): Record<string, unknown> | undefined {
  try {
    const metadata = frontmatter(content);
    return metadata ? object(parseYaml(metadata)) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The policy oracle composed the way `planningRecord` composes its parser: the record
 * semantic.ts reads once it uses the policy grammar (proof 3 records its disagreements
 * with `oracleSemanticRecord` on the golden commit).
 */
export function oraclePolicyRecord(content: string): Record<string, unknown> | undefined {
  try {
    const range = frontmatterRange(content);
    const metadata = range ? range.lines.slice(range.start + 1, range.end).join("\n") : undefined;
    return metadata ? object(parseYaml(metadata)) : undefined;
  } catch {
    return undefined;
  }
}

/** Base bundle procedure gate (bundle.ts:375-376): true when the procedure check applies to the document. */
export function oracleBundleProcedure(content: string): boolean {
  const declaredType = declaredPlanningType(content);
  return declaredType === undefined || !isNonArtifactPlanningClass(declaredType);
}
