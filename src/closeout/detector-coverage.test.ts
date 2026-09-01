import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CLOSEOUT_DETECTORS,
  createDetectorRuntimeIdentity,
  createDetectorRunPolicy,
  detectorResultShapeErrors,
  detectorApplicabilityForPolicy,
  detectorRegistrySha256,
  detectorRuntimeIdentityErrors,
  detectorRuntimeIdentitySha256,
  findingFingerprintsFromAudit,
  planningFindingFingerprint,
  requiredDetectorIdsForPolicy,
  semanticFindingFingerprint,
} from "./detector-coverage.js";
import { auditPlanningArtifacts, type PlanningAuditResult } from "./planning.js";
import { semanticCandidateSetSha256 } from "./semantic.js";
import { mintServerAttestationBinding } from "../runtime-binding.js";

const PLANNING_SNAPSHOT = "a".repeat(40);

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalPlanningResult(): PlanningAuditResult {
  return auditPlanningArtifacts([{
    content: "not structured",
    path: "planning/story.md",
  }], 1, { snapshot: PLANNING_SNAPSHOT });
}

describe("detector coverage registry", () => {
  it("defines the complete canonical ledger universe in a stable order", () => {
    expect(CLOSEOUT_DETECTORS.map((detector) => detector.id)).toEqual([
      "planning_graph",
      "public_safety",
      "github_actions",
      "semantic_boundary",
    ]);
    expect(detectorRegistrySha256()).toBe("35d8e9e9595c124bdf68eb363621533c99e920e454a6d49749702479f9647ee6");
    expect(detectorRegistrySha256("4")).toBe("2a6687eac140f4277510c11648f3b0bbf06b104390d8a992b2c021999458c1b1");
    expect(detectorRegistrySha256("3")).toBe("856ea127812f22aa50f0b566fae1350bf5d8c13db5c29548eff112d63027e47e");
    expect(detectorRegistrySha256("2")).toBe("bd49c47b93786e215c9e02e6850e55ea9f19c5ff99666e768cd55e6911cfc66a");
    expect(detectorRegistrySha256("1")).toBe("803e6d35762a802e980c874a4e8783c219234fdcaef9b9f2c570df9ba3d66f50");
    const empty = createDetectorRunPolicy({ trackedShippablePathCount: 0 });
    expect(requiredDetectorIdsForPolicy(empty)).toEqual(["planning_graph", "github_actions", "semantic_boundary"]);
    expect(detectorApplicabilityForPolicy(empty)).toContainEqual({
      detector_id: "public_safety", disposition: "not_applicable", basis: "empty_tracked_surface",
    });
    const publicSurface = createDetectorRunPolicy({ trackedShippablePathCount: 1 });
    expect(requiredDetectorIdsForPolicy(publicSurface)).toEqual(["planning_graph", "public_safety", "github_actions", "semantic_boundary"]);
  });

  it("projects a portable release identity independent of installation path", () => {
    const binding = (root: string) => mintServerAttestationBinding({
      record_type: "mister-clean.runtime-attestation-binding" as const,
      schema_version: "1.0" as const,
      status: "pass" as const,
      package_root: root,
      package_root_realpath: root,
      entrypoint: { path: "./bin/mister-clean.js", realpath: `${root}/bin/mister-clean.js`, sha256: "1".repeat(64) },
      package: { name: "@example/mister-clean", version: "1.0.0" },
      claimed_source: { git_commit: "2".repeat(40), git_tag: "v1.0.0" },
      claim_scope: {
        covers: "own_package_regular_file_bytes" as const,
        excludes: [
          "registry_publication_provenance",
          "dependency_resolution_graph",
          "filesystem_mode_bits_xattrs_and_timestamps",
          "release_attestation_self_bytes",
          "claimed_source_authenticity",
        ] as const,
      },
      manifest: { path: "./MANIFEST.sha256" as const, format: "sha256sum-v1-lf" as const, entry_count: 5, sha256: "3".repeat(64) },
    });
    const left = createDetectorRuntimeIdentity(binding("/one/install"));
    const right = createDetectorRuntimeIdentity(binding("/another/install"));
    expect(left).toEqual(right);
    expect(detectorRuntimeIdentitySha256(left)).toBe(detectorRuntimeIdentitySha256(right));
  });

  it("keeps source-development identity narrow and fully explained", () => {
    const source = createDetectorRuntimeIdentity(mintServerAttestationBinding({
      record_type: "mister-clean.runtime-attestation-binding",
      schema_version: "1.0",
      status: "source_development",
      package_root: "/source",
      package_root_realpath: "/source",
      entrypoint: { path: "./src/cli.ts", realpath: "/source/src/cli.ts", sha256: "4".repeat(64) },
      reason: "explicit source execution",
    }));
    expect(detectorRuntimeIdentityErrors(source)).toEqual([]);
    expect(source.claim_scope).toEqual({
      covers: "source_entrypoint_regular_file_bytes_only",
      excludes: ["imported_source_module_graph", "dependency_resolution_graph", "runtime_host"],
    });
    expect(detectorRuntimeIdentityErrors({ ...source, reason: "" })).toContain(
      "$.reason: source_development requires an explanation",
    );
    expect(detectorRuntimeIdentityErrors({ ...source, entrypoint: { ...source.entrypoint, path: "./other.ts" } })).toContain(
      "$.entrypoint.path: source_development requires ./src/cli.ts",
    );
  });

  it("derives redacted, detector-scoped fingerprints from emitted audit shapes", () => {
    const planning = canonicalPlanningResult();
    expect(detectorResultShapeErrors("planning_graph", planning)).toEqual([]);
    expect(findingFingerprintsFromAudit("planning_graph", planning))
      .toEqual([planningFindingFingerprint(planning.raw_findings[0]!.id)]);

    const semanticCandidates = [{
      evidence: ["claim"], id: "SEM-1", kind: "construction_boundary" as const,
      path: "src/factory.ts", refs: ["src/factory.ts"],
    }];
    const semantic = {
      candidate_probe_count: 1,
      candidate_set_sha256: semanticCandidateSetSha256(semanticCandidates),
      candidates: semanticCandidates,
      confirmed_failure_count: 0,
      executed_probe_count: 0,
      executions: [],
      exitCode: 1,
      findings: [{
        candidate_id: "SEM-1", classification: "verification_debt", code: "semantic_probe_unassigned",
        detail: "unassigned", kind: "construction_boundary", refs: ["src/factory.ts"],
      }],
      pending_probe_count: 0,
      resolved_probe_count: 0,
      resolutions: [],
      snapshot: "a".repeat(40),
      status: "fail",
      working_tree_sha256: "1".repeat(64),
    };
    expect(detectorResultShapeErrors("semantic_boundary", semantic)).toEqual([]);
    expect(findingFingerprintsFromAudit("semantic_boundary", semantic))
      .toEqual([semanticFindingFingerprint("SEM-1", "semantic_probe_unassigned")]);

    const publicSafety = {
      findings: [{
        path: "src/example.ts", line: 7, rule: "email-address",
        fingerprint: "3d2cd096afa87ba398336a2bce1ccfb74af6dd4dcb9b490066ac232641c6a98f",
      }],
      scope: "tracked_shippable",
      status: "fail",
      exitCode: 1,
      tracked_path_count: 1,
      tracked_paths_sha256: "2".repeat(64),
      unassessed: [],
    };
    expect(detectorResultShapeErrors("public_safety", publicSafety)).toEqual([]);
    expect(findingFingerprintsFromAudit("public_safety", publicSafety))
      .toEqual(["3d2cd096afa87ba398336a2bce1ccfb74af6dd4dcb9b490066ac232641c6a98f"]);

    const githubActions = {
      record_type: "mister-clean.github-actions-audit",
      schema_version: "1.0",
      status: "fail",
      exitCode: 1,
      workflow_count: 1,
      sensitive_workflow_count: 1,
      findings: [{
        path: ".github/workflows/cd.yml",
        rule: "manual_sensitive_ref_unbound",
        severity: "P0",
        detail: "manual deployment is not main-bound",
        refs: [".github/workflows/cd.yml#line-3"],
        fingerprint: "832395d72908af4919230ee1c4cc30bc1c797c91d26bb0b71a2e9f7ac7bdbed4",
      }],
    };
    expect(detectorResultShapeErrors("github_actions", githubActions)).toEqual([]);
    expect(findingFingerprintsFromAudit("github_actions", githubActions)).toEqual([
      "832395d72908af4919230ee1c4cc30bc1c797c91d26bb0b71a2e9f7ac7bdbed4",
    ]);

    for (const rule of ["workflow_run_source_untrusted", "health_gate_identity_unbound"]) {
      const refs = [`.github/workflows/cd.yml#line-${rule.length}`];
      const result = {
        ...githubActions,
        findings: [{
          ...githubActions.findings[0],
          rule,
          refs,
          fingerprint: digest(`github_actions\0${rule}\0.github/workflows/cd.yml\0${refs.join("\0")}`),
        }],
      };
      expect(detectorResultShapeErrors("github_actions", result)).toEqual([]);
      expect(findingFingerprintsFromAudit("github_actions", result)).toEqual([result.findings[0]!.fingerprint]);
    }
  });

  it("rejects fingerprint fragments and internally inconsistent detector accounting", () => {
    expect(findingFingerprintsFromAudit("planning_graph", { raw_findings: [{ id: "PLAN-1" }] })).toBeUndefined();
    expect(findingFingerprintsFromAudit("semantic_boundary", {
      findings: [{ candidate_id: "SEM-1", code: "semantic_probe_unassigned" }],
    })).toBeUndefined();
    expect(findingFingerprintsFromAudit("public_safety", {
      findings: [{
        path: "src/example.ts", line: 7, rule: "email-address",
        fingerprint: "3d2cd096afa87ba398336a2bce1ccfb74af6dd4dcb9b490066ac232641c6a98f",
      }],
    })).toBeUndefined();
  });

  it("rejects fabricated planning raw IDs instead of minting observations for them", () => {
    const planning = structuredClone(canonicalPlanningResult());
    Object.assign(planning.raw_findings[0]!, { id: "RAW-PLANNING-FABRICATED" });
    Object.assign(planning.root_debts[0]!, {
      raw_finding_ids: ["RAW-PLANNING-FABRICATED"],
    });

    expect(detectorResultShapeErrors("planning_graph", planning)).toContain(
      "$.raw_findings: must equal the deterministic causal projection derived from findings and snapshot",
    );
    expect(findingFingerprintsFromAudit("planning_graph", planning)).toBeUndefined();
  });

  it("rejects arbitrary and zero-observation planning root projections", () => {
    const arbitrary = structuredClone(canonicalPlanningResult());
    Object.assign(arbitrary.root_debts[0]!, {
      cause_key: "planning:arbitrary",
      repair_boundary: "invented-boundary",
    });
    expect(detectorResultShapeErrors("planning_graph", arbitrary)).toContain(
      "$.root_debts: must equal the deterministic causal projection derived from findings and snapshot",
    );

    const canonicalEmpty = auditPlanningArtifacts([], 0, { snapshot: PLANNING_SNAPSHOT });
    const inventedRoot = {
      affected_paths: [],
      affected_projection_field: "planning_input",
      causal_evidence: {
        component_refs: [],
        kind: "single_artifact",
        violated_invariant: "planning_input",
      },
      cause_key: "planning:invented",
      class: "planning_input_unparsed",
      detector_family: "planning_graph",
      id: "ROOT-PLANNING-INVENTED",
      observation_count: 0,
      raw_finding_ids: [],
      repair_boundary: "invented-boundary",
      snapshot: PLANNING_SNAPSHOT,
    } as const;
    const empty = {
      ...canonicalEmpty,
      root_debt_count: 1,
      root_debts: [inventedRoot],
    };
    expect(detectorResultShapeErrors("planning_graph", empty)).toContain(
      "$.root_debts[0].raw_finding_ids: root debt must own at least one canonical raw finding",
    );
    expect(findingFingerprintsFromAudit("planning_graph", empty)).toBeUndefined();
  });

  it("rejects semantic findings for candidates the detector did not discover", () => {
    const semantic = {
      candidate_probe_count: 0,
      candidate_set_sha256: semanticCandidateSetSha256([]),
      candidates: [],
      confirmed_failure_count: 1,
      executed_probe_count: 0,
      executions: [],
      exitCode: 1,
      findings: [{
        candidate_id: "SEM-FABRICATED",
        classification: "confirmed_product_defect",
        code: "semantic_probe_unassigned",
        detail: "fabricated",
        kind: "construction_boundary",
        refs: [],
      }],
      pending_probe_count: 0,
      resolved_probe_count: 0,
      resolutions: [],
      snapshot: PLANNING_SNAPSHOT,
      status: "fail",
      working_tree_sha256: "1".repeat(64),
    };

    expect(detectorResultShapeErrors("semantic_boundary", semantic)).toContain(
      "$.findings[0].candidate_id: must name one discovered candidate",
    );
    expect(findingFingerprintsFromAudit("semantic_boundary", semantic)).toBeUndefined();
  });

  it("recomputes semantic candidate-set identity and binds manifest-boundary evidence", () => {
    const candidates = [{
      evidence: ["claim"], id: "SEM-1", kind: "construction_boundary" as const,
      path: "src/factory.ts", refs: ["src/factory.ts#line-1"],
    }];
    const base = {
      candidate_probe_count: 1,
      candidate_set_sha256: semanticCandidateSetSha256(candidates),
      candidates,
      confirmed_failure_count: 0,
      executed_probe_count: 0,
      executions: [],
      exitCode: 1,
      findings: [{
        candidate_id: "manifest",
        classification: "verification_debt",
        code: "semantic_probe_manifest_invalid",
        detail: "invalid manifest",
        kind: "construction_boundary",
        refs: ["semantic-probes.json"],
      }],
      manifest_sha256: "2".repeat(64),
      pending_probe_count: 0,
      resolved_probe_count: 0,
      resolutions: [],
      snapshot: PLANNING_SNAPSHOT,
      status: "fail",
      working_tree_sha256: "1".repeat(64),
    };

    expect(detectorResultShapeErrors("semantic_boundary", base)).toEqual([]);
    expect(detectorResultShapeErrors("semantic_boundary", {
      ...base,
      candidate_set_sha256: "0".repeat(64),
    })).toContain("$.candidate_set_sha256: must equal the deterministic digest of candidates");
    expect(detectorResultShapeErrors("semantic_boundary", {
      ...base,
      manifest_sha256: undefined,
    })).toContain("$.manifest_sha256: manifest boundary requires the observed manifest digest");
    expect(detectorResultShapeErrors("semantic_boundary", {
      ...base,
      findings: [{ ...base.findings[0], refs: [] }],
    })).toContain("$.findings[0].refs: manifest boundary requires a manifest evidence reference");
  });
});
