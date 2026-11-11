/**
 * The deterministic front-matter corpus of mg-s2c-front-matter
 * (charter/DONE/mg-s2c-front-matter.md, "Corpus"). Defined once here; the golden and
 * head tests both read it, and the golden test asserts the counts so that a changed
 * axis fails loudly.
 *
 * - cartesian: 2 line endings x 9 prefixes x 7 openers x 10 blocks x 7 closers x 4 tails = 35,280
 * - seeded: 20,000 documents from mulberry32(20261110)
 * - hand rows: the 40 named shapes of the planner's probe
 * - grid: the cartesian without the block axis (3,528), with one fixed block per consumer
 */

export const CARTESIAN_COUNT = 35_280;
export const SEEDED_COUNT = 20_000;
export const CORPUS_COUNT = CARTESIAN_COUNT + SEEDED_COUNT;
export const HAND_ROW_COUNT = 40;
export const GRID_COUNT = 3_528;
export const SEED = 20_261_110;

const BOM = String.fromCharCode(0xfeff);

const LINE_ENDINGS = ["\n", "\r\n"] as const;
const PREFIXES = [
  "",
  BOM,
  "\n",
  "  \n",
  "<!-- g -->\n",
  "<!--\n g\n-->\n",
  "<!-- a --> t\n",
  "text\n",
  `${BOM}<!-- g -->\n`,
] as const;
const OPENERS = ["---", " ---", "--- ", "---\t", "--- x", "----", "-- -"] as const;
const BLOCKS = [
  "",
  "type: reference",
  "kind: a\ntype: b",
  "type: a\ntype: b",
  "meta:\n  type: a",
  "type: 1",
  "type: [a, b]",
  "[unclosed",
  "# only comment",
  " ",
] as const;
/** `undefined` is the "no closer" value of the axis. */
const CLOSERS = ["---", "--- ", " ---", "...", "----", "--- x", undefined] as const;
const TAILS = ["", "body\n", "body\n---\nmore\n", "...\nmore\n"] as const;

function document(prefix: string, opener: string, block: string, closer: string | undefined, tail: string, lineEnding: string): string {
  const lf = `${prefix}${opener}\n${block}${block ? "\n" : ""}${closer === undefined ? "" : `${closer}\n`}${tail}`;
  return lineEnding === "\n" ? lf : lf.replaceAll("\n", lineEnding);
}

/** The 35,280 cartesian documents, in axis order (line ending outermost, tail innermost). */
export function cartesianCorpus(): string[] {
  const documents: string[] = [];
  for (const lineEnding of LINE_ENDINGS) {
    for (const prefix of PREFIXES) {
      for (const opener of OPENERS) {
        for (const block of BLOCKS) {
          for (const closer of CLOSERS) {
            for (const tail of TAILS) documents.push(document(prefix, opener, block, closer, tail, lineEnding));
          }
        }
      }
    }
  }
  return documents;
}

/** mulberry32: a 32-bit seeded generator, so the seeded corpus is the same on every run and runtime. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDED_LINES = [
  "---", "--- ", "...", "", "type: reference", "kind: x", "<!-- c -->", " ---", "text", `${BOM}---`, "a: 1", "----",
] as const;

/** The 20,000 seeded documents: 0 to 8 lines each, joined with LF (70%) or CRLF (30%). */
export function seededCorpus(): string[] {
  const random = mulberry32(SEED);
  const documents: string[] = [];
  for (let index = 0; index < SEEDED_COUNT; index += 1) {
    const count = Math.floor(random() * 9);
    const lines = Array.from({ length: count }, () => SEEDED_LINES[Math.floor(random() * SEEDED_LINES.length)]!);
    documents.push(lines.join(random() < 0.3 ? "\r\n" : "\n"));
  }
  return documents;
}

/** The cartesian followed by the seeded documents: 55,280. */
export function corpus(): string[] {
  return [...cartesianCorpus(), ...seededCorpus()];
}

/** The 40 named hand rows (one or more per shape of the DONE's parser table). */
export const HAND_ROWS: ReadonlyArray<readonly [name: string, content: string]> = [
  ["lf-plain", "---\ntype: reference\n---\nbody\n"],
  ["crlf", "---\r\ntype: reference\r\n---\r\nbody\r\n"],
  ["bom-prefix", `${BOM}---\ntype: reference\n---\nbody\n`],
  ["missing-close", "---\ntype: reference\nbody\n"],
  ["dup-key-same", "---\ntype: reference\ntype: reference\n---\n"],
  ["dup-key-differ", "---\ntype: reference\ntype: slice\n---\n"],
  ["kind-vs-type (D6)", "---\nkind: reference\ntype: slice\n---\n"],
  ["nested-only", "---\nmeta:\n  type: reference\n---\n"],
  ["indented-key", "---\n  type: reference\n---\n"],
  ["scalar-int", "---\ntype: 1\n---\n"],
  ["scalar-bool", "---\ntype: true\n---\n"],
  ["scalar-null", "---\ntype: null\n---\n"],
  ["scalar-list", "---\ntype: [a, b]\n---\n"],
  ["quoted+comment", "---\ntype: \"reference\" # c\n---\n"],
  ["empty-block", "---\n---\nbody\n"],
  ["empty-block-then-hr", "---\n---\ntype: reference\n---\n"],
  ["whitespace-block", "---\n \n---\nbody\n"],
  ["leading-comment", "<!-- generated -->\n---\ntype: reference\n---\n"],
  ["leading-blank", "\n---\ntype: reference\n---\n"],
  ["multiline-comment", "<!--\n gen\n-->\n---\ntype: reference\n---\n"],
  ["comment+text-same-line", "<!-- a --> text\n---\ntype: reference\n---\n"],
  ["text-before", "intro\n---\ntype: reference\n---\n"],
  ["close-trailing-space", "---\ntype: reference\n--- \nbody\n"],
  ["close-dots", "---\ntype: reference\n...\nbody\n"],
  ["close-dots-then-hr", "---\ntype: reference\n...\nbody\n---\nmore\n"],
  ["indented-delims", " ---\ntype: reference\n ---\n"],
  ["open-trailing-text", "--- yaml\ntype: reference\n---\n"],
  ["four-dashes-close", "---\ntype: reference\n----\nbody\n"],
  ["open-trailing-tab", "---\t\ntype: reference\n---\n"],
  ["case+spacing", "---\ntype:   Reference\n---\n"],
  ["key-space-colon", "---\ntype : reference\n---\n"],
  ["yaml-error", "---\ntype: [unclosed\n---\n"],
  ["json-flow-body", "---\n{\"type\": \"reference\"}\n---\n"],
  ["multi-doc", "---\ntype: reference\n---\nb: 2\n---\n"],
  ["close-no-trailing-newline", "---\ntype: reference\n---"],
  ["lone-cr", "---\rtype: reference\r---\r"],
  ["bom+comment", `${BOM}<!-- g -->\n---\ntype: reference\n---\n`],
  ["hr-in-body-only", "intro\n\n---\n\nbody\n"],
  ["only-opener", "---\n"],
  ["empty-file", ""],
];

/**
 * The 3,528-document grid: the cartesian without the block axis, each document carrying
 * the block that `block(index)` returns (a consumer's fixed block; `index` is the
 * document's position, for blocks that need a unique identifier).
 */
export function gridCorpus(block: (index: number) => string): string[] {
  const documents: string[] = [];
  for (const lineEnding of LINE_ENDINGS) {
    for (const prefix of PREFIXES) {
      for (const opener of OPENERS) {
        for (const closer of CLOSERS) {
          for (const tail of TAILS) documents.push(document(prefix, opener, block(documents.length), closer, tail, lineEnding));
        }
      }
    }
  }
  return documents;
}

/** The fixed policy block of proof 1 and proof 2: a typed story, so a framed and parsed block is structured. */
export function policyGridBlock(index: number): string {
  return `artifact_type: story\nstory_id: S${index}\nstatus: done`;
}

/** The fixed semantic block of proof 1 and proof 3: a DEV record with no execution identity. */
export function semanticGridBlock(): string {
  return "role: dev";
}

/** The procedure words of proof 1 (bundle), proof 5 and the deltas. */
export const PROCEDURE_BODY = "implementation done; acceptance review not_run\n";

/** A hand row with the procedure body appended on its own line. */
export function withProcedureBody(content: string): string {
  return content === "" || /[\r\n]$/u.test(content) ? `${content}${PROCEDURE_BODY}` : `${content}\n${PROCEDURE_BODY}`;
}

/** The declared semantic delta classes of proof 3 (Δ1a-d). */
export type DeltaClass = "C1" | "C2" | "C3" | "C4";

/**
 * The delta classes a document belongs to (proof 3), judged on its LF/CRLF lines:
 * - C1: a delimiter-shaped line (`---` once trimmed) with leading whitespace or any U+FEFF;
 * - C2: a comment line followed by text on that line (`-->` then a non-space character);
 * - C3: a line `...` (with optional trailing spaces or tabs);
 * - C4: a CR not followed by LF.
 */
export function deltaClasses(content: string): DeltaClass[] {
  const lines = content.split(/\r?\n/u);
  const classes: DeltaClass[] = [];
  if (lines.some((line) => line.trim() === "---" && (line !== line.trimStart() || line.includes(BOM)))) classes.push("C1");
  if (lines.some((line) => /-->[ \t]*[^\s]/u.test(line))) classes.push("C2");
  if (lines.some((line) => /^\.\.\.[ \t]*$/u.test(line))) classes.push("C3");
  if (/\r(?!\n)/u.test(content)) classes.push("C4");
  return classes;
}

/**
 * Recorded on the golden commit from the two base oracles (the policy parser composed as
 * `planningRecord` composes it, against the semantic oracle): over the 55,280 corpus
 * documents, how many records disagree, and how many of those carry each class (a
 * document may carry several classes).
 */
export const SEMANTIC_DISAGREEMENTS = 3_868;
export const SEMANTIC_DISAGREEMENTS_BY_CLASS: Readonly<Record<DeltaClass, number>> = { C1: 2_692, C2: 480, C3: 1_660, C4: 0 };
