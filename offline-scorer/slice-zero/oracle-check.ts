/**
 * Oracle check for the two Slice Zero case sets.
 *
 * A case set's expected values are written by hand. This check recomputes each
 * one from the case's own `material` and refuses a set where they disagree:
 *   - json-validity: `valid` exactly when JSON.parse accepts the material;
 *   - canonical-json: the material parsed, its object keys sorted at every
 *     level, and written back with no whitespace.
 * It also checks that every prompt holds its material between the markers.
 *
 * Usage: bun offline-scorer/slice-zero/oracle-check.ts
 * Exit 0 with one `oracle-check: ok` line, 1 with every disagreement printed.
 */
import { readFileSync } from "node:fs";

interface OracleCase {
  readonly id: string;
  readonly material: string;
  readonly input: string;
  readonly expected: string;
}

function casesOf(name: string): OracleCase[] {
  const set = JSON.parse(readFileSync(new URL(`./${name}.case-set.json`, import.meta.url), "utf8")) as { cases: OracleCase[] };
  return set.cases;
}

function parses(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function disagreements(name: string, recompute: (material: string) => string): { count: number; problems: string[] } {
  const cases = casesOf(name);
  const problems: string[] = [];
  for (const entry of cases) {
    if (typeof entry.material !== "string") {
      problems.push(`${name} ${entry.id}: no material`);
      continue;
    }
    if (!entry.input.includes(`<<<\n${entry.material}\n>>>`)) problems.push(`${name} ${entry.id}: the prompt does not hold the material between the markers`);
    const computed = recompute(entry.material);
    if (computed !== entry.expected) problems.push(`${name} ${entry.id}: expected is ${entry.expected}, recomputed ${computed}`);
  }
  return { count: cases.length, problems };
}

const validity = disagreements("json-validity", (material) => (parses(material) ? "valid" : "invalid"));
const canon = disagreements("canonical-json", (material) => canonical(JSON.parse(material) as unknown));
const problems = [...validity.problems, ...canon.problems];
for (const problem of problems) console.error(`oracle-check: ${problem}`);
if (problems.length === 0) console.log(`oracle-check: ok (json-validity ${validity.count}, canonical-json ${canon.count})`);
process.exitCode = problems.length === 0 ? 0 : 1;
