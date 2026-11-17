/**
 * Differential proof for mg-s2d-phase-registry (charter/DONE/mg-s2d-phase-registry.md, proof 4).
 *
 * Every corpus item goes to the current `detectorResultShapeErrors`,
 * `findingFingerprintsFromAudit`, `detectorRootProjections` and
 * `receiptFindingsFromAudit`, and to the verbatim base copies of the four in
 * phase-oracles.test-fixture.ts. The two must agree on the returned value
 * (deeply, `undefined` included) and on the message of a thrown error.
 *
 * Only the six registered family ids are used: an id outside the registry is a
 * declared behaviour change (Δ4) with its own proof.
 */
import { mkdtempSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { detectorRootProjections } from "./bundle-detector-evidence.js";
import { detectorResultShapeErrors, findingFingerprintsFromAudit } from "./detector-coverage.js";
import { receiptFindingsFromAudit, sha256Text, type AnchorContext } from "./finding-anchors.js";
import { buildPhaseCorpus, CORPUS_FAMILIES, type CorpusFamily, type CorpusItem, type PhaseCorpus } from "./phase-corpus.test-fixture.js";
import {
  oracle_detectorResultShapeErrors,
  oracle_detectorRootProjections,
  oracle_findingFingerprintsFromAudit,
  oracle_receiptFindingsFromAudit,
} from "./phase-oracles.test-fixture.js";

type Outcome = { readonly returned: unknown } | { readonly threw: string };

function outcome(run: () => unknown): Outcome {
  try {
    return { returned: run() };
  } catch (error) {
    return { threw: error instanceof Error ? error.message : String(error) };
  }
}

const REPO_ID = "repo:phase-corpus";

/** Blob ids without Git: a digest of the path, and none for a path that names a missing file. */
function fixedBlobOids(paths: readonly string[]): ReadonlyMap<string, string> {
  return new Map(paths.filter((path) => !path.includes("missing") && !path.includes("absent")).map((path) => [path, sha256Text(`blob\0${path}`).slice(0, 40)]));
}

function contextsFor(item: CorpusItem): { readonly name: string; readonly context: AnchorContext }[] {
  return [
    { name: "fixed blob ids", context: { repository: item.repository, blobOids: fixedBlobOids } },
    { name: "fixed blob ids under a path prefix", context: { repository: item.repository, path_prefix: "nested/dir/", blobOids: fixedBlobOids } },
    // The default blob lookup spawns Git, so only results a real auditor produced on a worktree take it.
    ...(item.live ? [{ name: "Git blob ids", context: { repository: item.repository } }] : []),
  ];
}

interface Tally {
  comparisons: number;
  readonly mismatches: string[];
}

function compare(tally: Tally, label: string, current: () => unknown, oracle: () => unknown): void {
  tally.comparisons += 1;
  const actual = outcome(current);
  const expected = outcome(oracle);
  if (!isDeepStrictEqual(actual, expected) && tally.mismatches.length < 20) {
    tally.mismatches.push(`${label}\n  current: ${JSON.stringify(actual)?.slice(0, 400)}\n  base:    ${JSON.stringify(expected)?.slice(0, 400)}`);
  }
}

/** Compare the four functions for `value` read as a result of `family`. */
function compareAll(tally: Tally, label: string, family: CorpusFamily, value: unknown, contexts: readonly { readonly name: string; readonly context: AnchorContext }[]): void {
  compare(tally, `${label}: detectorResultShapeErrors`, () => detectorResultShapeErrors(family, value), () => oracle_detectorResultShapeErrors(family, value));
  compare(tally, `${label}: findingFingerprintsFromAudit`, () => findingFingerprintsFromAudit(family, value), () => oracle_findingFingerprintsFromAudit(family, value));
  compare(tally, `${label}: detectorRootProjections`, () => detectorRootProjections(family, value, REPO_ID), () => oracle_detectorRootProjections(family, value, REPO_ID));
  for (const { name, context } of contexts) {
    compare(tally, `${label}: receiptFindingsFromAudit (${name})`, () => receiptFindingsFromAudit(family, value, context), () => oracle_receiptFindingsFromAudit(family, value, context));
  }
}

describe("phase registry differential: current functions against the base copies", () => {
  let scratch: string;
  let corpus: PhaseCorpus;

  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), "mc-phase-corpus-"));
    corpus = buildPhaseCorpus(scratch);
  }, 120_000);

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("holds a corpus for every family and prints its size", () => {
    expect(Object.keys(corpus.counts).sort()).toEqual([...CORPUS_FAMILIES].sort());
    const live = Object.fromEntries(CORPUS_FAMILIES.map((family) => [family, corpus.items.filter((item) => item.family === family && item.live).length]));
    writeSync(1, `phase corpus items per family: ${CORPUS_FAMILIES.map((family) => `${family}=${corpus.counts[family]}`).join(" ")} total=${corpus.items.length}\n`);
    writeSync(1, `phase corpus live auditor results per family: ${CORPUS_FAMILIES.map((family) => `${family}=${live[family]}`).join(" ")}\n`);
    for (const family of CORPUS_FAMILIES) {
      expect(corpus.counts[family], family).toBeGreaterThan(0);
      expect(live[family], `${family} live`).toBeGreaterThan(0);
    }
    expect(corpus.items.length).toBe(CORPUS_FAMILIES.reduce((sum, family) => sum + corpus.counts[family], 0));
  });

  it("exercises, per family, both the accepting and the refusing path of each base function", () => {
    const CLOSEOUT: readonly CorpusFamily[] = CORPUS_FAMILIES.filter((family) => family !== "repository_boundaries");
    for (const family of CORPUS_FAMILIES) {
      const items = corpus.items.filter((item) => item.family === family);
      const reach = { shape_valid: 0, shape_invalid: 0, fingerprints: 0, no_fingerprints: 0, root_rows: 0, root_refused: 0, receipt_rows: 0, receipt_refused: 0 };
      for (const item of items) {
        if (oracle_detectorResultShapeErrors(family, item.value).length === 0) reach.shape_valid += 1;
        else reach.shape_invalid += 1;
        const fingerprints = oracle_findingFingerprintsFromAudit(family, item.value);
        if (fingerprints === undefined) reach.no_fingerprints += 1;
        else if (fingerprints.length > 0) reach.fingerprints += 1;
        const roots = outcome(() => oracle_detectorRootProjections(family, item.value, REPO_ID));
        if ("threw" in roots) reach.root_refused += 1;
        else if ((roots.returned as readonly unknown[]).length > 0) reach.root_rows += 1;
        const receipt = outcome(() => oracle_receiptFindingsFromAudit(family, item.value, { repository: item.repository, blobOids: fixedBlobOids }));
        if ("threw" in receipt) reach.receipt_refused += 1;
        else if ((receipt.returned as readonly unknown[]).length > 0) reach.receipt_rows += 1;
      }
      writeSync(1, `phase corpus reach ${family}: ${Object.entries(reach).map(([name, count]) => `${name}=${count}`).join(" ")}\n`);
      expect(reach.shape_invalid, `${family} shape_invalid`).toBeGreaterThan(0);
      expect(reach.no_fingerprints, `${family} no_fingerprints`).toBeGreaterThan(0);
      expect(reach.receipt_rows, `${family} receipt_rows`).toBeGreaterThan(0);
      expect(reach.receipt_refused, `${family} receipt_refused`).toBeGreaterThan(0);
      if (CLOSEOUT.includes(family)) {
        expect(reach.shape_valid, `${family} shape_valid`).toBeGreaterThan(0);
        expect(reach.fingerprints, `${family} fingerprints`).toBeGreaterThan(0);
        expect(reach.root_rows, `${family} root_rows`).toBeGreaterThan(0);
      } else {
        // repository_boundaries has no closeout part: the base refuses its shape and projects no rows.
        expect([reach.shape_valid, reach.fingerprints, reach.root_rows]).toEqual([0, 0, 0]);
      }
    }
  });

  it("is deterministic: building the corpus twice yields the same items", () => {
    const again = mkdtempSync(join(tmpdir(), "mc-phase-corpus-again-"));
    try {
      const second = buildPhaseCorpus(again);
      expect(second.counts).toEqual(corpus.counts);
      // The scratch directory differs between the two builds; nothing else may.
      const portable = (items: readonly CorpusItem[], root: string): string => JSON.stringify(items.map((item) => [item.family, item.name, item.live, item.value])).split(root).join("<scratch>");
      expect(sha256Text(portable(second.items, again))).toBe(sha256Text(portable(corpus.items, scratch)));
    } finally {
      rmSync(again, { recursive: true, force: true });
    }
  }, 120_000);

  it.each(CORPUS_FAMILIES.map((family) => [family] as const))("%s: every corpus item yields what the base yielded", (family) => {
    const tally: Tally = { comparisons: 0, mismatches: [] };
    const items = corpus.items.filter((item) => item.family === family);
    for (const item of items) compareAll(tally, `${family} / ${item.name}`, family, item.value, contextsFor(item));
    expect(tally.mismatches, tally.mismatches.join("\n")).toEqual([]);
    // Four functions, the receipt projection in at least two contexts.
    expect(tally.comparisons).toBeGreaterThanOrEqual(items.length * 5);
  }, 120_000);

  it.each(CORPUS_FAMILIES.map((family) => [family] as const))("%s: results of the other five families, read as this family, yield what the base yielded", (family) => {
    const tally: Tally = { comparisons: 0, mismatches: [] };
    const foreign = corpus.items.filter((item) => item.family !== family);
    for (const item of foreign) compareAll(tally, `${family} given ${item.family} / ${item.name}`, family, item.value, contextsFor(item).slice(0, 1));
    expect(tally.mismatches, tally.mismatches.join("\n")).toEqual([]);
    expect(tally.comparisons).toBe(foreign.length * 4);
  }, 120_000);

  it.each(CORPUS_FAMILIES.map((family) => [family] as const))("%s: a value that is not an audit result yields what the base yielded", (family) => {
    const tally: Tally = { comparisons: 0, mismatches: [] };
    corpus.nonObjects.forEach((value, index) => compareAll(tally, `${family} given non-object #${index}`, family, value, [{ name: "fixed blob ids", context: { repository: scratch, blobOids: fixedBlobOids } }]));
    expect(tally.mismatches, tally.mismatches.join("\n")).toEqual([]);
    expect(tally.comparisons).toBe(corpus.nonObjects.length * 4);
  });
});
