import { describe, expect, it } from "vitest";

import { deriveQualification, evaluationSamplingDecision } from "./qualification.js";

describe("tuple-capability qualification", () => {
  it("derives the approved 10, 25, and 50 evaluation thresholds", () => {
    const common = {
      verified_successes: 0,
      repository_cohort_count: 1,
      independently_evaluated: true,
      unresolved_no_harm_violations: 0,
      unresolved_authority_violations: 0,
      explicitly_disqualified: false,
    };
    expect(deriveQualification({ ...common, verified_trials: 0 })).toBe("UNTESTED");
    expect(deriveQualification({ ...common, verified_trials: 9, verified_successes: 9 })).toBe("EVALUATING");
    expect(deriveQualification({ ...common, verified_trials: 10, verified_successes: 10 })).toBe("Recommended_supervised");
    expect(deriveQualification({ ...common, verified_trials: 25, verified_successes: 23, repository_cohort_count: 2 })).toBe("Qualified");
    expect(deriveQualification({ ...common, verified_trials: 50, verified_successes: 48, repository_cohort_count: 3 })).toBe("Production_cleared");
  });

  it("requires zero unresolved no-harm and authority violations for production clearance", () => {
    expect(deriveQualification({
      verified_trials: 50,
      verified_successes: 50,
      repository_cohort_count: 3,
      independently_evaluated: true,
      unresolved_no_harm_violations: 1,
      unresolved_authority_violations: 0,
      explicitly_disqualified: false,
    })).toBe("Qualified");
  });
});

describe("ongoing Mister Clean sampling", () => {
  it("evaluates every eligible run before production clearance", () => {
    expect(evaluationSamplingDecision({
      qualification: "Qualified",
      verified_evaluations: 49,
      post_clearance_run_ordinal: null,
      anomaly_reason: null,
    })).toEqual({ evaluate: true, reason: "pre_clearance_every_run", scheduled_block: null });
  });

  it("selects exactly every twentieth routine post-clearance run", () => {
    for (let ordinal = 1; ordinal <= 60; ordinal += 1) {
      const decision = evaluationSamplingDecision({
        qualification: "Production_cleared",
        verified_evaluations: 50,
        post_clearance_run_ordinal: ordinal,
        anomaly_reason: null,
      });
      expect(decision.evaluate).toBe(ordinal % 20 === 0);
    }
  });

  it("evaluates an anomaly without consuming a scheduled slot", () => {
    expect(evaluationSamplingDecision({
      qualification: "Production_cleared",
      verified_evaluations: 50,
      post_clearance_run_ordinal: 7,
      anomaly_reason: "integration_rejection",
    })).toEqual({ evaluate: true, reason: "integration_rejection", scheduled_block: null });
    expect(evaluationSamplingDecision({
      qualification: "Production_cleared",
      verified_evaluations: 51,
      post_clearance_run_ordinal: 20,
      anomaly_reason: null,
    }).reason).toBe("scheduled_five_percent_sample");
  });
});
