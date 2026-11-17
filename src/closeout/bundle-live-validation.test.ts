/**
 * Live revalidation's judgement of fresh detector fingerprints
 * (charter/DONE/mg-s2e-finding-reducer.md, proof 6; pays QA-S2D-D1).
 */
import { describe, expect, it } from "vitest";

import { judgeLiveDetectorFindings } from "./bundle-live-validation.js";
import { CLOSEOUT_PHASE_IDS, type CloseoutPhaseId } from "./phase-registry.js";

const fingerprint = (seed: string): string => seed.repeat(64).slice(0, 64);

describe("judgeLiveDetectorFindings", () => {
  it("reports the live detector error order of the registry, whatever order the families were rerun in", () => {
    // Inserted in an order other than the registry's (which is planning_graph,
    // public_safety, github_actions, semantic_boundary, language_policy).
    const rerun: readonly (readonly [CloseoutPhaseId, readonly string[] | undefined])[] = [
      ["language_policy", [fingerprint("a"), fingerprint("b")]],
      ["semantic_boundary", [fingerprint("c")]],
      ["github_actions", undefined],
      ["public_safety", [fingerprint("d"), fingerprint("e"), fingerprint("f")]],
      ["planning_graph", [fingerprint("1"), fingerprint("2")]],
    ];
    const live = new Map<CloseoutPhaseId, readonly string[] | undefined>(rerun);
    expect([...live.keys()]).not.toEqual(CLOSEOUT_PHASE_IDS);
    expect([...live.keys()].sort()).toEqual([...CLOSEOUT_PHASE_IDS].sort());
    // One owner-signed exception per family key: it clears exactly its own finding,
    // and the same fingerprint under another family clears nothing.
    const accepted = new Set([
      `public_safety\0${fingerprint("d")}`,
      `planning_graph\0${fingerprint("c")}`,
    ]);

    expect(judgeLiveDetectorFindings(live, accepted)).toEqual([
      "$.live_detector_coverage.planning_graph: CLEAN requires zero payable findings after owner-signed exceptions (got 2)",
      "$.live_detector_coverage.public_safety: CLEAN requires zero payable findings after owner-signed exceptions (got 2)",
      "$.live_detector_coverage.github_actions: fresh registered detector result was not canonical",
      "$.live_detector_coverage.semantic_boundary: CLEAN requires zero payable findings after owner-signed exceptions (got 1)",
      "$.live_detector_coverage.language_policy: CLEAN requires zero payable findings after owner-signed exceptions (got 2)",
    ]);
  });

  it("is silent for a family that was not rerun, or whose findings are all accepted", () => {
    const live = new Map<CloseoutPhaseId, readonly string[] | undefined>([["public_safety", [fingerprint("d")]], ["planning_graph", []]]);
    expect(judgeLiveDetectorFindings(live, new Set([`public_safety\0${fingerprint("d")}`]))).toEqual([]);
  });
});
