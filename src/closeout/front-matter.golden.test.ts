/**
 * Golden tests of mg-s2c-front-matter (charter/DONE/mg-s2c-front-matter.md), written on
 * the golden commit against the base code (main 469d740) and never edited afterwards.
 *
 * - "front matter oracle fidelity" (proof 1) ties the frozen oracles in
 *   front-matter-oracles.test-fixture.ts to the real public entry points. It holds only
 *   on base, because the semantic and bundle readers change by the declared deltas, so
 *   it runs only with MISTER_CLEAN_FM_BASE=1 and is skipped on head by design.
 * - "front matter policy parity: recorded vectors" (proof 2) pins the policy audit
 *   output that base produced; it holds on base and on head.
 * - "procedure check conditions" (proof 4a) pins when the validator's
 *   executed-early/unexecuted-later check runs; it holds on base and on head.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import { canonicalJson } from "../canonical-json.js";
import { auditPlanningArtifacts } from "./planning.js";
import { auditSemanticRepository } from "./semantic.js";
import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";
import {
  CARTESIAN_COUNT,
  CORPUS_COUNT,
  GRID_COUNT,
  HAND_ROW_COUNT,
  HAND_ROWS,
  SEEDED_COUNT,
  SEMANTIC_DISAGREEMENTS,
  SEMANTIC_DISAGREEMENTS_BY_CLASS,
  cartesianCorpus,
  corpus,
  deltaClasses,
  gridCorpus,
  type DeltaClass,
  policyGridBlock,
  seededCorpus,
  semanticGridBlock,
  withProcedureBody,
  PROCEDURE_BODY,
} from "./front-matter-corpus.test-fixture.js";
import {
  oracleBundleProcedure,
  oraclePolicyParse,
  oraclePolicyRecord,
  oracleSemanticRecord,
} from "./front-matter-oracles.test-fixture.js";
import {
  cleanupBundleFixtures,
  preparedCascade,
  procedureError,
  validateWithPlanningEntries,
} from "./front-matter-bundle.test-fixture.js";

const BASE = process.env.MISTER_CLEAN_FM_BASE === "1";
const BASE_ONLY = "(base only: runs with MISTER_CLEAN_FM_BASE=1)";

/** Policy audit findings of every grid document under the fixed policy block, as written by base 469d740. */
const GRID_FINDINGS_SHA256 = "7f791eab1865d03cb8da506dca6dffec6ea19f4acf2756b3e86eb4fed9ff64de";
/** Policy audit findings of the 40 hand rows, as written by base 469d740. */
const HAND_ROW_FINDINGS_SHA256 = "e5f6e1366a905a3eaecbbd0222638411e45fdd7e183829b36939e6059380b34c";

const POLICY_PATH = "docs/x.md";
const BOM = String.fromCharCode(0xfeff);

/**
 * The document as a file-reading entry point sees it (PM ruling, DONE text correction C1):
 * the semantic scan (semantic.ts:1199 at 469d740) and the bundle file port
 * (bundle-runtime.ts:271) both decode the written bytes with this exact call, whose
 * default drops one leading U+FEFF. The policy check reads the raw string.
 */
function asRead(content: string): string {
  const writtenBytes = Buffer.from(content, "utf8");
  return new TextDecoder("utf-8", { fatal: true }).decode(writtenBytes);
}

/**
 * Whether a record is a DEV record (PM ruling, DONE text correction C2): mirrors the
 * projection of semantic.ts:299-306 `recordRole` at 469d740 on the `role` field (a string;
 * trim; toLocaleLowerCase("und") equals "dev"). The fixed block `role: dev` yields one
 * exactly when the reader frames the block without folding a later line into the value.
 */
function devRole(record: Record<string, unknown> | undefined): boolean {
  const role = record?.role;
  return typeof role === "string" && role.trim().toLocaleLowerCase("und") === "dev";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function policyFindings(content: string) {
  return auditPlanningArtifacts([{ path: POLICY_PATH, content }]).findings;
}

afterEach(() => {
  cleanupBundleFixtures();
});

describe("front matter corpus counts", () => {
  it("has the declared size on every axis", () => {
    expect(cartesianCorpus()).toHaveLength(CARTESIAN_COUNT);
    expect(CARTESIAN_COUNT).toBe(2 * 9 * 7 * 10 * 7 * 4);
    expect(seededCorpus()).toHaveLength(SEEDED_COUNT);
    expect(corpus()).toHaveLength(CORPUS_COUNT);
    expect(CORPUS_COUNT).toBe(55_280);
    expect(HAND_ROWS).toHaveLength(HAND_ROW_COUNT);
    expect(new Set(HAND_ROWS.map(([name]) => name)).size).toBe(HAND_ROW_COUNT);
    expect(gridCorpus(policyGridBlock)).toHaveLength(GRID_COUNT);
    expect(GRID_COUNT).toBe(2 * 9 * 7 * 7 * 4);
  });

  it("is deterministic", () => {
    expect(sha256(JSON.stringify(seededCorpus()))).toBe(sha256(JSON.stringify(seededCorpus())));
    expect(new Set(cartesianCorpus()).size).toBe(CARTESIAN_COUNT);
  });
});

describe("front matter oracle fidelity", () => {
  it.skipIf(!BASE)(`policy: no planning_input_unparsed iff the oracle frames a block that parses to an object ${BASE_ONLY}`, () => {
    const mismatches: string[] = [];
    for (const content of gridCorpus(policyGridBlock)) {
      const parsed = !policyFindings(content).some((finding) => finding.code === "planning_input_unparsed");
      const oracle = oraclePolicyParse(content);
      if (parsed !== (oracle.framed && oracle.structured)) mismatches.push(`${JSON.stringify(content)} audit-parsed=${parsed} oracle=${JSON.stringify(oracle)}`);
    }
    expect(mismatches).toEqual([]);
  });

  it.skipIf(!BASE)(`semantic: a missing-execution-identity row iff the oracle returns a DEV record ${BASE_ONLY}`, () => {
    const root = mkdtempSync(join(tmpdir(), "mister-clean-front-matter-semantic-"));
    try {
      createFixtureRepository(root);
      mkdirSync(join(root, "planning", "active"), { recursive: true });
      const documents = gridCorpus(semanticGridBlock);
      documents.forEach((content, index) => writeFileSync(join(root, "planning", "active", `${index}.md`), content, "utf8"));
      fixtureCommit(root, "grid");
      const result = auditSemanticRepository(root);
      const reported = new Set(result.candidates.find((candidate) => candidate.kind === "execution_identity_coverage")?.refs ?? []);
      const mismatches: string[] = [];
      documents.forEach((content, index) => {
        const path = `planning/active/${index}.md`;
        const expected = devRole(oracleSemanticRecord(asRead(content)));
        if (reported.has(path) !== expected) mismatches.push(`${path} ${JSON.stringify(content)} reported=${reported.has(path)} oracle=${expected}`);
      });
      expect(mismatches).toEqual([]);
      expect(reported.size).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 600_000);

  it.skipIf(!BASE)(`bundle: the executed-early/unexecuted-later error iff the oracle gate says procedure ${BASE_ONLY}`, async () => {
    const fixture = await preparedCascade();
    const path = "planning/done/done.md";
    const mismatches: string[] = [];
    let blocked = 0;
    for (const [name, row] of HAND_ROWS) {
      const content = withProcedureBody(row);
      const errors = await validateWithPlanningEntries(fixture, [{ path, content }]);
      const reported = procedureError(errors, path) !== undefined;
      if (reported) blocked += 1;
      const expected = oracleBundleProcedure(asRead(content));
      if (reported !== expected) mismatches.push(`${name} ${JSON.stringify(content)} reported=${reported} oracle=${expected}`);
    }
    expect(mismatches).toEqual([]);
    expect(blocked).toBeGreaterThan(0);
    expect(blocked).toBeLessThan(HAND_ROW_COUNT);
  }, 600_000);
});

describe("front matter policy parity: recorded vectors", () => {
  it("policy audit findings over the grid equal the base vector", () => {
    const findings = gridCorpus(policyGridBlock).map(policyFindings);
    expect(sha256(canonicalJson(findings))).toBe(GRID_FINDINGS_SHA256);
  });

  it("policy audit findings over the hand rows equal the base vector", () => {
    const findings = HAND_ROWS.map(([, row]) => policyFindings(row));
    expect(sha256(canonicalJson(findings))).toBe(HAND_ROW_FINDINGS_SHA256);
  });
});

describe("front matter semantic parity: recorded counts", () => {
  it("the policy grammar and the semantic oracle disagree only on the declared classes, in the recorded numbers", () => {
    const unexplained: string[] = [];
    const byClass: Record<DeltaClass, number> = { C1: 0, C2: 0, C3: 0, C4: 0 };
    let disagreements = 0;
    for (const content of corpus()) {
      if (JSON.stringify(oraclePolicyRecord(content)) === JSON.stringify(oracleSemanticRecord(content))) continue;
      disagreements += 1;
      const classes = deltaClasses(content);
      if (classes.length === 0) unexplained.push(JSON.stringify(content));
      for (const name of classes) byClass[name] += 1;
    }
    expect(unexplained).toEqual([]);
    expect(disagreements).toBe(SEMANTIC_DISAGREEMENTS);
    expect(byClass).toEqual(SEMANTIC_DISAGREEMENTS_BY_CLASS);
  });
});

describe("front matter reader: leading BOM", () => {
  // DONE text correction C1: the decoder drops one leading U+FEFF before any parser runs, so a
  // leading-BOM file yields the same result on base and on head through the real entry points.
  // A later decoder change must not turn this into a silent behaviour change.
  it("the semantic scan reads a leading-BOM DEV record like the same file without the BOM", () => {
    const root = mkdtempSync(join(tmpdir(), "mister-clean-front-matter-bom-"));
    try {
      createFixtureRepository(root);
      mkdirSync(join(root, "planning", "active"), { recursive: true });
      writeFileSync(join(root, "planning", "active", "bom.md"), `${BOM}---\nrole: dev\n---\nbody\n`, "utf8");
      writeFileSync(join(root, "planning", "active", "plain.md"), "---\nrole: dev\n---\nbody\n", "utf8");
      fixtureCommit(root, "bom");
      const result = auditSemanticRepository(root);
      expect(result.candidates.find((candidate) => candidate.kind === "execution_identity_coverage")?.refs)
        .toEqual(["planning/active/bom.md", "planning/active/plain.md"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  it("the validator reads a leading-BOM declared reference like the same file without the BOM", async () => {
    const fixture = await preparedCascade();
    const path = "planning/done/done.md";
    const body = `---\nartifact_type: reference\n---\n${PROCEDURE_BODY}`;
    expect(procedureError(await validateWithPlanningEntries(fixture, [{ path, content: `${BOM}${body}` }]), path)).toBeUndefined();
    expect(procedureError(await validateWithPlanningEntries(fixture, [{ path, content: body }]), path)).toBeUndefined();
  }, 120_000);
});

describe("procedure check conditions", () => {
  const path = "planning/done/done.md";
  const procedure = { path, content: PROCEDURE_BODY };

  it("(a) reports no procedure error without a repository: base needs file access to read the content, so this pin is assertion-only", async () => {
    const fixture = await preparedCascade();
    const errors = await validateWithPlanningEntries(fixture, [procedure], { withRepo: false });
    expect(errors.some((error) => error.startsWith("$.live_repo"))).toBe(true);
    expect(errors.filter((error) => error.includes("executed-early/unexecuted-later"))).toEqual([]);
  }, 120_000);

  it("(a') reports no procedure error when the system has no census", async () => {
    const fixture = await preparedCascade();
    const errors = await validateWithPlanningEntries(fixture, [procedure], {
      system: (system) => { delete (system.corpus as Record<string, unknown>).census; },
    });
    expect(errors.some((error) => error.endsWith(".corpus.census: canonical file census is required for a live or CLEAN repository-file corpus"))).toBe(true);
    expect(errors.filter((error) => error.includes("executed-early/unexecuted-later"))).toEqual([]);
  }, 120_000);

  it("(a') reports no procedure error when the system is not repo_files", async () => {
    const fixture = await preparedCascade();
    const errors = await validateWithPlanningEntries(fixture, [procedure], {
      system: (system) => { system.kind = "external_snapshot"; },
    });
    expect(errors.filter((error) => error.includes("executed-early/unexecuted-later"))).toEqual([]);
  }, 120_000);

  it("(b) reports no procedure error for a bundle that is not CLEAN", async () => {
    const fixture = await preparedCascade();
    const errors = await validateWithPlanningEntries(fixture, [procedure], { verdict: "NOT_CLEAN" });
    expect(errors.filter((error) => error.includes("executed-early/unexecuted-later"))).toEqual([]);
  }, 120_000);

  it("(c) control: reports the procedure error with a repository, repo_files, a census and CLEAN", async () => {
    const fixture = await preparedCascade();
    const errors = await validateWithPlanningEntries(fixture, [procedure]);
    expect(procedureError(errors, path)).toBeDefined();
  }, 120_000);
});

afterAll(() => {
  cleanupBundleFixtures();
});
