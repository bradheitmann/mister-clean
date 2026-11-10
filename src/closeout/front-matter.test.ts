/**
 * Head tests of mg-s2c-front-matter (charter/DONE/mg-s2c-front-matter.md): one shared
 * front-matter parser, the semantic reader on the policy grammar, and the validator's
 * procedure gate taking the audit's classification.
 *
 * - "front matter policy parity" (proof 2): the shared parser equals the base policy parser.
 * - "front matter semantic parity" (proof 3): the semantic reader equals base except on the
 *   declared delta classes C1-C4, in the numbers recorded on the golden commit.
 * - "front matter declared deltas" (proof 4): one test per declared delta (Δ1a-d, Δ2a-e, Δ3).
 * - "front matter validator parity" (proof 5): the validator and the audit on a fixed table.
 */
import { isDeepStrictEqual } from "node:util";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { frontMatterBlock, frontMatterRange } from "./planning-analysis/front-matter.js";
import { auditPlanningArtifacts, type PlanningSource } from "./planning.js";
import { auditSemanticRepository } from "./semantic.js";
import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";
import {
  HAND_ROWS,
  PROCEDURE_BODY,
  SEMANTIC_DISAGREEMENTS,
  SEMANTIC_DISAGREEMENTS_BY_CLASS,
  corpus,
  deltaClasses,
  gridCorpus,
  semanticGridBlock,
  type DeltaClass,
} from "./front-matter-corpus.test-fixture.js";
import {
  oracleBundleProcedure,
  oracle_policy,
  oracleSemanticRecord,
} from "./front-matter-oracles.test-fixture.js";
import {
  cleanupBundleFixtures,
  preparedCascade,
  procedureError,
  validateWithPlanningEntries,
  type BundleFixture,
  type PlanningEntry,
} from "./front-matter-bundle.test-fixture.js";

const BOM = String.fromCharCode(0xfeff);

/**
 * The document as a file-reading entry point sees it (DONE text correction C1): the semantic
 * scan and the bundle file port decode the written bytes with this exact call, which drops
 * one leading U+FEFF.
 */
function asRead(content: string): string {
  const writtenBytes = Buffer.from(content, "utf8");
  return new TextDecoder("utf-8", { fatal: true }).decode(writtenBytes);
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** The composition semantic.ts `planningRecord` uses for `.md`/`.mdx` on head. */
function sharedRecord(content: string): Record<string, unknown> | undefined {
  try {
    const metadata = frontMatterBlock(content);
    return metadata ? object(parseYaml(metadata)) : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a record is a DEV record: mirrors semantic.ts `recordRole` (string; trim; toLocaleLowerCase("und") equals "dev") on `role`. */
function devRole(record: Record<string, unknown> | undefined): boolean {
  const role = record?.role;
  return typeof role === "string" && role.trim().toLocaleLowerCase("und") === "dev";
}

/** Write the documents as tracked planning/active/<name>.md files and return the paths the real semantic scan reports. */
function semanticReported(documents: readonly (readonly [name: string, content: string])[]): Set<string> {
  const root = mkdtempSync(join(tmpdir(), "mister-clean-front-matter-semantic-"));
  try {
    createFixtureRepository(root);
    mkdirSync(join(root, "planning", "active"), { recursive: true });
    for (const [name, content] of documents) writeFileSync(join(root, "planning", "active", `${name}.md`), content, "utf8");
    fixtureCommit(root, "rows");
    const result = auditSemanticRepository(root);
    return new Set(result.candidates.find((candidate) => candidate.kind === "execution_identity_coverage")?.refs ?? []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function sameRecord(left: Record<string, unknown> | undefined, right: Record<string, unknown> | undefined): boolean {
  return isDeepStrictEqual(left, right);
}

describe("front matter policy parity", () => {
  const documents = [...corpus(), ...HAND_ROWS.map(([, content]) => content)];

  it("frontMatterRange deep-equals the base policy parser on every corpus document and hand row (start, end and lines)", () => {
    const mismatches: string[] = [];
    for (const content of documents) {
      const shared = frontMatterRange(content);
      const base = oracle_policy(content);
      if (!isDeepStrictEqual(shared === undefined ? undefined : { ...shared }, base)) mismatches.push(JSON.stringify(content));
    }
    expect(mismatches.length, mismatches.slice(0, 5).join("\n")).toBe(0);
  });

  it("frontMatterBlock is the lines between the delimiters joined with LF, or undefined where there is no range", () => {
    const mismatches: string[] = [];
    for (const content of documents) {
      const base = oracle_policy(content);
      const expected = base ? base.lines.slice(base.start + 1, base.end).join("\n") : undefined;
      if (frontMatterBlock(content) !== expected) mismatches.push(JSON.stringify(content));
    }
    expect(mismatches.length, mismatches.slice(0, 5).join("\n")).toBe(0);
  });
});

describe("front matter semantic parity", () => {
  it("disagrees with the base semantic reader only on the declared classes, in the recorded numbers", () => {
    const unexplained: string[] = [];
    const byClass: Record<DeltaClass, number> = { C1: 0, C2: 0, C3: 0, C4: 0 };
    let disagreements = 0;
    for (const content of corpus()) {
      if (sameRecord(sharedRecord(content), oracleSemanticRecord(content))) continue;
      disagreements += 1;
      const classes = deltaClasses(content);
      if (classes.length === 0) unexplained.push(JSON.stringify(content));
      for (const name of classes) byClass[name] += 1;
    }
    expect(unexplained).toEqual([]);
    expect(disagreements).toBe(SEMANTIC_DISAGREEMENTS);
    expect(byClass).toEqual(SEMANTIC_DISAGREEMENTS_BY_CLASS);
  });

  it("each class has a hand row that disagrees, and no hand row disagrees outside the classes", () => {
    const covered = new Set<DeltaClass>();
    const unexplained: string[] = [];
    for (const [name, content] of HAND_ROWS) {
      if (sameRecord(sharedRecord(content), oracleSemanticRecord(content))) continue;
      const classes = deltaClasses(content);
      if (classes.length === 0) unexplained.push(name);
      for (const item of classes) covered.add(item);
    }
    expect(unexplained).toEqual([]);
    expect([...covered].sort()).toEqual(["C1", "C2", "C3", "C4"]);
  });

  it("the real semantic scan reports a DEV row for a grid file iff the shared composition reads a DEV record", () => {
    const documents = gridCorpus(semanticGridBlock);
    const reported = semanticReported(documents.map((content, index) => [String(index), content]));
    const mismatches: string[] = [];
    documents.forEach((content, index) => {
      const path = `planning/active/${index}.md`;
      const expected = devRole(sharedRecord(asRead(content)));
      if (reported.has(path) !== expected) mismatches.push(`${path} ${JSON.stringify(content)} reported=${reported.has(path)} shared=${expected}`);
    });
    expect(mismatches).toEqual([]);
    expect(reported.size).toBeGreaterThan(0);
  }, 600_000);
});

describe("front matter declared deltas", () => {
  /** Old: whether base reported a DEV row (the semantic oracle on the text the scan reads). New: the real scan on head. */
  function delta1(rows: readonly (readonly [name: string, content: string])[]): { old: Record<string, boolean>; head: Record<string, boolean> } {
    const reported = semanticReported(rows);
    const old: Record<string, boolean> = {};
    const head: Record<string, boolean> = {};
    for (const [name, content] of rows) {
      old[name] = devRole(oracleSemanticRecord(asRead(content)));
      head[name] = reported.has(`planning/active/${name}.md`);
    }
    return { old, head };
  }

  it("Δ1a semantic: an indented or BOM-prefixed delimiter is framed", () => {
    const { old, head } = delta1([
      ["indented-delims", " ---\nrole: dev\n ---\n"],
      ["bom-closer", `---\nrole: dev\n${BOM}---\nbody\n`],
    ]);
    expect(old).toEqual({ "indented-delims": false, "bom-closer": false });
    expect(head).toEqual({ "indented-delims": true, "bom-closer": true });
    // A leading U+FEFF never reaches the scan (the UTF-8 decoder drops it), so the bom-prefix row is a
    // delta of the reader on a string: base did not frame it, head does.
    const bomPrefix = `${BOM}---\nrole: dev\n---\nbody\n`;
    expect(oracleSemanticRecord(bomPrefix)).toBeUndefined();
    expect(sharedRecord(bomPrefix)).toEqual({ role: "dev" });
  });

  it("Δ1b semantic: a comment line with trailing text is skipped", () => {
    const { old, head } = delta1([["comment-text", "<!-- a --> text\n---\nrole: dev\n---\n"]]);
    expect(old).toEqual({ "comment-text": false });
    expect(head).toEqual({ "comment-text": true });
  });

  it("Δ1c semantic: a dots line does not close the block", () => {
    const { old, head } = delta1([
      ["close-dots", "---\nrole: dev\n...\nbody\n"],
      ["close-dots-then-hr", "---\nrole: dev\n...\nbody\n---\nmore\n"],
    ]);
    expect(old).toEqual({ "close-dots": true, "close-dots-then-hr": true });
    expect(head).toEqual({ "close-dots": false, "close-dots-then-hr": false });
  });

  it("Δ1d semantic: lone CR is not a line break", () => {
    // Through the real scan: the opener ends in CRLF and the rest breaks on lone CRs. Base read the
    // record {"role":"dev\r"} (a DEV row once trimmed); head finds no closer, so no record.
    const { old, head } = delta1([["lone-cr-after-crlf-opener", "---\r\nrole: dev\r---\r"]]);
    expect(old).toEqual({ "lone-cr-after-crlf-opener": true });
    expect(head).toEqual({ "lone-cr-after-crlf-opener": false });
    // The hand row lone-cr on the reader: base framed it (with the CR kept in the key), head does not frame it.
    const loneCr = HAND_ROWS.find(([name]) => name === "lone-cr")![1];
    expect(oracleSemanticRecord(loneCr)).toEqual({ "\rtype": "reference\r" });
    expect(frontMatterRange(loneCr)).toBeUndefined();
    expect(sharedRecord(loneCr)).toBeUndefined();
  });

  let fixture: BundleFixture;
  beforeAll(async () => {
    fixture = await preparedCascade();
  }, 120_000);

  /** Old: the base gate (oracle) on the subject; new: whether head's validator reports the procedure error for it. */
  async function delta2(entries: readonly PlanningEntry[], subject: string): Promise<{ oldBlocks: boolean; headBlocks: boolean }> {
    const content = entries.find((entry) => entry.path === subject)!.content;
    const errors = await validateWithPlanningEntries(fixture, entries);
    return { oldBlocks: oracleBundleProcedure(asRead(content)), headBlocks: procedureError(errors, subject) !== undefined };
  }

  it("Δ2a validator: a bundle class reference with a rationale and no front matter is exempt", async () => {
    const subject = "planning/notes/ref.md";
    expect(await delta2([{ path: subject, content: PROCEDURE_BODY, class: "reference", rationale: "x" }], subject))
      .toEqual({ oldBlocks: true, headBlocks: false });
  }, 120_000);

  it("Δ2b validator: a leading comment, or a closing \"--- \", does not hide the declared type", async () => {
    const subject = "planning/notes/ref.md";
    expect(await delta2([{ path: subject, content: `<!-- generated -->\n---\nartifact_type: reference\nrationale: x\n---\n${PROCEDURE_BODY}`, class: "reference", rationale: "x" }], subject))
      .toEqual({ oldBlocks: true, headBlocks: false });
    expect(await delta2([{ path: subject, content: `---\nartifact_type: reference\nrationale: x\n--- \n${PROCEDURE_BODY}`, class: "reference", rationale: "x" }], subject))
      .toEqual({ oldBlocks: true, headBlocks: false });
  }, 120_000);

  it("Δ2c validator: a yaml planning file is classified like the audit", async () => {
    const subject = "planning/notes/glossary.yaml";
    expect(await delta2([{ path: subject, content: `terms: [a]\nrationale: x\n# ${PROCEDURE_BODY}`, class: "reference", rationale: "x" }], subject))
      .toEqual({ oldBlocks: true, headBlocks: false });
  }, 120_000);

  it("Δ2d validator: a type conflict in front matter is not exempt", async () => {
    const subject = "planning/notes/x.md";
    const content = `---\nkind: reference\ntype: slice\nrationale: x\n---\n${PROCEDURE_BODY}`;
    const errors = await validateWithPlanningEntries(fixture, [{ path: subject, content, class: "reference", rationale: "x" }]);
    expect(oracleBundleProcedure(content)).toBe(false);
    expect(procedureError(errors, subject)).toBeDefined();
  }, 120_000);

  it("Δ2e validator: a compound dispatch internal is exempt", async () => {
    const subject = "planning/packets/p1/execution-dag.md";
    expect(await delta2([
      { path: "planning/packets/p1/dispatch.md", content: "---\nartifact_type: dispatch\n---\nPacket envelope.\n", class: "story" },
      { path: subject, content: PROCEDURE_BODY, class: "story" },
    ], subject)).toEqual({ oldBlocks: true, headBlocks: false });
  }, 120_000);

  it("Δ3 validator: procedure errors follow their sibling corpus errors and precede the audit findings", async () => {
    const artifactA = "planning/done/done.md";
    const artifactB = "planning/backlog/blob.bin";
    const errors = await validateWithPlanningEntries(fixture, [
      { path: artifactA, content: PROCEDURE_BODY },
      { path: artifactB, content: "not planning text\n", class: "story" },
    ]);
    const iP = errors.findIndex((error) => error === procedureError(errors, artifactA));
    const iB = errors.findIndex((error) => error.endsWith(`.corpus: unsupported planning entry ${artifactB} requires an explicit non-artifact class and classification_rationale`));
    const iF = errors.findIndex((error) => /^\$\.planning_discovery\.corpus: [a-z_]+ at /u.test(error));
    expect({ iP: iP >= 0, iB: iB >= 0, iF: iF >= 0 }).toEqual({ iP: true, iB: true, iF: true });
    expect(iB).toBeLessThan(iP);
    expect(iP).toBeLessThan(iF);
  }, 120_000);
});

interface ParityRow {
  readonly name: string;
  readonly subject: string;
  readonly entries: readonly PlanningEntry[];
  readonly audit: "clean" | "blocks";
  readonly validatorBase: "exempt" | "blocks";
  readonly validatorHead: "exempt" | "blocks";
}

const reference = (path: string, content: string, rationale?: string): PlanningEntry =>
  ({ path, content, class: "reference", ...(rationale === undefined ? {} : { rationale }) });

const PARITY_TABLE: readonly ParityRow[] = [
  { name: "reference + rationale, outside a lane directory", subject: "planning/notes/ref.md", audit: "clean", validatorBase: "exempt", validatorHead: "exempt",
    entries: [reference("planning/notes/ref.md", `---\nartifact_type: reference\nrationale: x\n---\n${PROCEDURE_BODY}`, "x")] },
  { name: "D3", subject: "planning/notes/ref.md", audit: "clean", validatorBase: "blocks", validatorHead: "exempt",
    entries: [reference("planning/notes/ref.md", PROCEDURE_BODY, "x")] },
  { name: "D4 leading comment", subject: "planning/notes/ref.md", audit: "clean", validatorBase: "blocks", validatorHead: "exempt",
    entries: [reference("planning/notes/ref.md", `<!-- generated -->\n---\nartifact_type: reference\nrationale: x\n---\n${PROCEDURE_BODY}`, "x")] },
  { name: "D4 closing \"--- \"", subject: "planning/notes/ref.md", audit: "clean", validatorBase: "blocks", validatorHead: "exempt",
    entries: [reference("planning/notes/ref.md", `---\nartifact_type: reference\nrationale: x\n--- \n${PROCEDURE_BODY}`, "x")] },
  { name: "D5 glossary.yaml", subject: "planning/notes/glossary.yaml", audit: "clean", validatorBase: "blocks", validatorHead: "exempt",
    entries: [reference("planning/notes/glossary.yaml", `terms: [a]\nrationale: x\n# ${PROCEDURE_BODY}`, "x")] },
  { name: "D6", subject: "planning/notes/x.md", audit: "blocks", validatorBase: "exempt", validatorHead: "blocks",
    entries: [reference("planning/notes/x.md", `---\nkind: reference\ntype: slice\nrationale: x\n---\n${PROCEDURE_BODY}`, "x")] },
  { name: "compound dispatch internal", subject: "planning/packets/p1/execution-dag.md", audit: "clean", validatorBase: "blocks", validatorHead: "exempt",
    entries: [
      { path: "planning/packets/p1/dispatch.md", content: "---\nartifact_type: dispatch\n---\nPacket envelope.\n", class: "story" },
      { path: "planning/packets/p1/execution-dag.md", content: PROCEDURE_BODY, class: "story" },
    ] },
  { name: "slice (control)", subject: "planning/notes/x.md", audit: "blocks", validatorBase: "blocks", validatorHead: "blocks",
    entries: [{ path: "planning/notes/x.md", content: `---\nartifact_type: slice\n---\n${PROCEDURE_BODY}`, class: "story" }] },
  { name: "no front matter, class story (control, hardening.test.ts:199)", subject: "planning/done/done.md", audit: "blocks", validatorBase: "blocks", validatorHead: "blocks",
    entries: [{ path: "planning/done/done.md", content: PROCEDURE_BODY, class: "story" }] },
  { name: "residual: reference with no rationale, lane done/ (hardening.test.ts:210)", subject: "planning/done/done.md", audit: "blocks", validatorBase: "exempt", validatorHead: "exempt",
    entries: [reference("planning/done/done.md", `---\nartifact_type: reference\n---\n${PROCEDURE_BODY}`)] },
  { name: "residual: reference with rationale, lane history/ (A2-2 D1)", subject: "planning/history/old.md", audit: "blocks", validatorBase: "exempt", validatorHead: "exempt",
    entries: [reference("planning/history/old.md", `---\nartifact_type: reference\nrationale: x\n---\n${PROCEDURE_BODY}`, "x")] },
  { name: "residual: reference with no rationale, outside a lane directory", subject: "planning/notes/ref.md", audit: "blocks", validatorBase: "exempt", validatorHead: "exempt",
    entries: [reference("planning/notes/ref.md", `---\nartifact_type: reference\n---\n${PROCEDURE_BODY}`)] },
];

describe("front matter validator parity", () => {
  let fixture: BundleFixture;
  beforeAll(async () => {
    fixture = await preparedCascade();
  }, 120_000);

  it("the table has 11 lines and 12 documents", () => {
    expect(PARITY_TABLE).toHaveLength(12);
    expect(new Set(PARITY_TABLE.map((row) => row.name.replace(/^D4 .*/u, "D4"))).size).toBe(11);
  });

  for (const row of PARITY_TABLE) {
    it(`${row.name}: audit ${row.audit}, validator ${row.validatorBase} on base and ${row.validatorHead} on head`, async () => {
      const sources: PlanningSource[] = row.entries.map((entry) => ({
        path: entry.path,
        content: entry.content,
        declaredClass: entry.class ?? "story",
        ...(entry.rationale === undefined ? {} : { classificationRationale: entry.rationale }),
      }));
      const auditFindings = auditPlanningArtifacts(sources).findings.filter((finding) => finding.path === row.subject);
      const subject = row.entries.find((entry) => entry.path === row.subject)!.content;
      const errors = await validateWithPlanningEntries(fixture, row.entries);
      expect({
        audit: auditFindings.length === 0 ? "clean" : "blocks",
        validatorBase: oracleBundleProcedure(asRead(subject)) ? "blocks" : "exempt",
        validatorHead: procedureError(errors, row.subject) === undefined ? "exempt" : "blocks",
      }).toEqual({ audit: row.audit, validatorBase: row.validatorBase, validatorHead: row.validatorHead });
    }, 120_000);
  }
});

afterAll(() => {
  cleanupBundleFixtures();
});
