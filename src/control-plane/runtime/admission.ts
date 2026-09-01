import type {
  CoordinationDomainKey,
  EvidenceRef,
  IssueGraphId,
  LeaseId,
  RepositorySubject,
  Sha256,
} from "../contracts/primitives.js";
import type { RemediationWaveManifest } from "../contracts/wave-directive.js";
import type { RouteAdmissionDecision, RouteAdmissionPort, RouteAdmissionRequest } from "./service.js";

export interface ObservedValue<Value> {
  readonly value: Value;
  readonly evidence: readonly EvidenceRef[];
}

export interface LiveLeaseState {
  readonly lease_id: LeaseId;
  readonly fencing_token: number;
  readonly worktree: string;
  readonly branch: string;
  readonly owner: string;
  readonly active: boolean;
  readonly expires_at: string;
}

export interface LiveCoordinationDomainState {
  readonly key: CoordinationDomainKey;
  readonly version: number;
  readonly state_digest: Sha256;
}

export interface LiveRouteAdmissionProbes {
  repositorySubject(manifest: RemediationWaveManifest): Promise<ObservedValue<RepositorySubject>>;
  targetCommit(targetRef: string): Promise<ObservedValue<string>>;
  issueGraph(issueGraphId: IssueGraphId, version: number): Promise<ObservedValue<Sha256>>;
  lease(leaseId: LeaseId): Promise<ObservedValue<LiveLeaseState | null>>;
  coordinationDomain(key: CoordinationDomainKey): Promise<ObservedValue<LiveCoordinationDomainState | null>>;
}

function sameRepositorySubject(left: RepositorySubject, right: RepositorySubject): boolean {
  return left.repository_id === right.repository_id
    && left.branch === right.branch
    && left.commit === right.commit
    && left.tree === right.tree
    && left.repository_object_sha256 === right.repository_object_sha256;
}

function mergeEvidence(target: Map<string, EvidenceRef>, source: readonly EvidenceRef[]): void {
  for (const evidence of source) target.set(`${evidence.path}\u0000${evidence.sha256}`, evidence);
}

/**
 * Concrete admission checker. It observes every live CAS dimension through
 * injected local probes and admits only when all manifest expectations still
 * match. It attests admission only; it never dispatches or executes work.
 */
export class ProbedRouteAdmission implements RouteAdmissionPort {
  readonly configured = true;
  readonly #probes: LiveRouteAdmissionProbes;

  constructor(probes: LiveRouteAdmissionProbes) {
    this.#probes = probes;
  }

  async admit(request: RouteAdmissionRequest): Promise<RouteAdmissionDecision> {
    const manifest = request.manifest;
    if (manifest.authority_mode !== "OPERATE") return { admitted: false, reason: "Manifest authority is not OPERATE", evidence: [] };
    const evidence = new Map<string, EvidenceRef>();

    const repository = await this.#probes.repositorySubject(manifest);
    mergeEvidence(evidence, repository.evidence);
    if (!sameRepositorySubject(repository.value, manifest.repository)) {
      return { admitted: false, reason: "Repository baseline changed before route admission", evidence: [...evidence.values()] };
    }

    const target = await this.#probes.targetCommit(manifest.target_ref);
    mergeEvidence(evidence, target.evidence);
    if (target.value !== manifest.expected_target_commit) {
      return { admitted: false, reason: "Target reference changed before route admission", evidence: [...evidence.values()] };
    }

    const graph = await this.#probes.issueGraph(manifest.issue_graph.issue_graph_id, manifest.issue_graph.version);
    mergeEvidence(evidence, graph.evidence);
    if (graph.value !== manifest.issue_graph.sha256) {
      return { admitted: false, reason: "Issue graph changed before route admission", evidence: [...evidence.values()] };
    }

    const now = Date.parse(request.requested_at);
    if (!Number.isFinite(now)) return { admitted: false, reason: "Admission clock is invalid", evidence: [...evidence.values()] };
    for (const lane of manifest.lanes) {
      if (lane.role === "read_only") continue;
      if (lane.baseline_commit !== manifest.repository.commit) {
        return { admitted: false, reason: `Lane ${lane.lane_id} is not bound to the manifest baseline commit`, evidence: [...evidence.values()] };
      }
      if (lane.lease === null) return { admitted: false, reason: `Lane ${lane.lane_id} has no writer lease`, evidence: [...evidence.values()] };
      const observed = await this.#probes.lease(lane.lease.lease_id);
      mergeEvidence(evidence, observed.evidence);
      const live = observed.value;
      if (
        live === null
        || !live.active
        || live.lease_id !== lane.lease.lease_id
        || live.fencing_token !== lane.lease.fencing_token
        || live.worktree !== lane.lease.worktree
        || live.branch !== lane.lease.branch
        || live.owner !== lane.lease.owner
        || live.expires_at !== lane.lease.expires_at
        || Date.parse(live.expires_at) <= now
      ) {
        return { admitted: false, reason: `Writer lease for lane ${lane.lane_id} is stale`, evidence: [...evidence.values()] };
      }
    }

    const claims = new Map<string, { version: number; digest: Sha256 }>();
    for (const lane of manifest.lanes) {
      for (const expectation of lane.coordination_claims) {
        const prior = claims.get(expectation.key);
        if (prior !== undefined && (prior.version !== expectation.expected_version || prior.digest !== expectation.expected_state_digest)) {
          return { admitted: false, reason: `Manifest contains conflicting expectations for ${expectation.key}`, evidence: [...evidence.values()] };
        }
        claims.set(expectation.key, { version: expectation.expected_version, digest: expectation.expected_state_digest });
      }
    }
    for (const [key, expected] of claims) {
      const observed = await this.#probes.coordinationDomain(key as CoordinationDomainKey);
      mergeEvidence(evidence, observed.evidence);
      if (observed.value === null || observed.value.key !== key || observed.value.version !== expected.version || observed.value.state_digest !== expected.digest) {
        return { admitted: false, reason: `Coordination domain ${key} is stale`, evidence: [...evidence.values()] };
      }
    }

    if (evidence.size === 0) return { admitted: false, reason: "Live route admission produced no evidence", evidence: [] };
    return { admitted: true, reason: "All live route CAS expectations match; dispatch remains unsupported by this boundary", evidence: [...evidence.values()] };
  }
}
