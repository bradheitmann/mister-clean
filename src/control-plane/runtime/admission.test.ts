import { describe, expect, it } from "vitest";

import type { IsoTimestamp, RepositoryId, Sha256 } from "../contracts/primitives.js";
import type { RemediationWaveManifest } from "../contracts/wave-directive.js";
import { ProbedRouteAdmission, type LiveRouteAdmissionProbes } from "./admission.js";

const now = "2026-08-26T12:00:00.000Z" as IsoTimestamp;
const sha = (value: string): Sha256 => value.repeat(64) as Sha256;
const evidence = [{ path: "/custody/admission.json", sha256: sha("e"), record_type: "mister-clean.directive-state-evidence" }];

function manifest(): RemediationWaveManifest {
  return {
    authority_mode: "OPERATE",
    repository: {
      repository_id: "repo-1" as RepositoryId,
      branch: "work",
      commit: "abc",
      tree: "def",
      repository_object_sha256: sha("a"),
      observed_at: now,
    },
    target_ref: "refs/heads/work",
    expected_target_commit: "abc",
    issue_graph: { issue_graph_id: "graph-1", version: 2, sha256: sha("g") },
    lanes: [{
      lane_id: "lane-1",
      role: "writer",
      baseline_commit: "abc",
      lease: {
        lease_id: "lease-1",
        fencing_token: 7,
        worktree: "/repo-wt",
        branch: "work",
        owner: "agent-1",
        expires_at: "2026-08-26T13:00:00.000Z",
      },
      coordination_claims: [{ key: "domain-1", expected_version: 3, expected_state_digest: sha("d") }],
    }],
  } as unknown as RemediationWaveManifest;
}

function probes(overrides: Partial<LiveRouteAdmissionProbes> = {}): LiveRouteAdmissionProbes {
  return {
    async repositorySubject() { return { value: manifest().repository, evidence }; },
    async targetCommit() { return { value: "abc", evidence }; },
    async issueGraph() { return { value: sha("g"), evidence }; },
    async lease() {
      return {
        value: {
          lease_id: "lease-1" as never,
          fencing_token: 7,
          worktree: "/repo-wt",
          branch: "work",
          owner: "agent-1",
          active: true,
          expires_at: "2026-08-26T13:00:00.000Z",
        },
        evidence,
      };
    },
    async coordinationDomain() { return { value: { key: "domain-1" as never, version: 3, state_digest: sha("d") }, evidence }; },
    ...overrides,
  };
}

describe("probed route admission", () => {
  const request = {
    directive_id: "directive-1",
    manifest: manifest(),
    control_surface_id: "surface-1",
    requested_at: now,
  } as never;

  it("admits only when repository, target, graph, lease, and domain CAS all match", async () => {
    await expect(new ProbedRouteAdmission(probes()).admit(request)).resolves.toMatchObject({ admitted: true });
    await expect(new ProbedRouteAdmission(probes({
      async targetCommit() { return { value: "changed", evidence }; },
    })).admit(request)).resolves.toMatchObject({ admitted: false, reason: expect.stringContaining("Target") });
    await expect(new ProbedRouteAdmission(probes({
      async lease() { return { value: null, evidence }; },
    })).admit(request)).resolves.toMatchObject({ admitted: false, reason: expect.stringContaining("lease") });
    await expect(new ProbedRouteAdmission(probes({
      async coordinationDomain() { return { value: { key: "domain-1" as never, version: 4, state_digest: sha("d") }, evidence }; },
    })).admit(request)).resolves.toMatchObject({ admitted: false, reason: expect.stringContaining("domain") });
    await expect(new ProbedRouteAdmission(probes({
      async coordinationDomain() { return { value: { key: "other-domain" as never, version: 3, state_digest: sha("d") }, evidence }; },
    })).admit(request)).resolves.toMatchObject({ admitted: false, reason: expect.stringContaining("domain") });
  });
});
