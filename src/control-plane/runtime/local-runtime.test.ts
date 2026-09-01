import { mkdtemp, rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { AuthorityEvidenceVerifier } from "./evidence.js";
import type { LiveRouteAdmissionProbes } from "./admission.js";
import type { ControlPlaneRequest } from "./protocol.js";
import type { DirectiveId } from "../contracts/primitives.js";
import type { DirectiveState } from "../contracts/wave-directive.js";
import { startLocalControlPlaneRuntime } from "./local-runtime.js";
import { openControlPlaneDatabase } from "../persistence/sqlite.js";
import { canonicalJson, sha256Bytes } from "./authority.js";
import { TEST_NOW, testSha, validManifestValue } from "./test-fixture.js";

const token = "local-control-plane-test-token-0000000001";

async function roundTrip(path: string, payload: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = createConnection(path, () => socket.end(payload));
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("end", () => {
      const text = new TextDecoder().decode(Buffer.concat(chunks));
      resolve(JSON.parse(text.slice(text.indexOf("\n\n") + 2)) as unknown);
    });
    socket.on("error", reject);
  });
}

describe("shipped local control-plane composition", () => {
  it("serves authenticated queries while honestly denying dispatch and execution support", async () => {
    const directory = await mkdtemp("/tmp/mc-local-runtime-");
    const socketPath = join(directory, "control.sock");
    const runtime = await startLocalControlPlaneRuntime({
      repository_database_path: join(directory, "repository.sqlite"),
      bearer_token: token,
      unix_socket_path: socketPath,
    });
    try {
      const body = JSON.stringify({ version: "1", request_id: "health-1", kind: "query", name: "health", input: {} });
      const frame = `Authorization: Bearer ${token}\nContent-Length: ${Buffer.byteLength(body)}\n\n${body}`;
      await expect(roundTrip(socketPath, frame)).resolves.toMatchObject({
        ok: true,
        result: {
          route_admission_configured: false,
          evidence_verification_configured: false,
          dispatch_supported: false,
          execution_supported: false,
        },
      });
    } finally {
      await runtime.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves explicit internal authority configuration without inheriting a polluted service option", async () => {
    const directory = await mkdtemp("/tmp/mc-local-runtime-own-authority-");
    const socketPath = join(directory, "control.sock");
    const priorRouteAdmission = Object.getOwnPropertyDescriptor(Object.prototype, "route_admission");
    let inheritedRouteReads = 0;
    let runtime: Awaited<ReturnType<typeof startLocalControlPlaneRuntime>> | null = null;
    let health: unknown;
    try {
      try {
        Object.defineProperty(Object.prototype, "route_admission", {
          configurable: true,
          get: () => {
            inheritedRouteReads += 1;
            return { configured: false, async admit() { return { admitted: false, reason: "polluted", evidence: [] }; } };
          },
        });
        const probes: LiveRouteAdmissionProbes = {
          async repositorySubject() { throw new Error("health must not invoke route probes"); },
          async targetCommit() { throw new Error("health must not invoke route probes"); },
          async issueGraph() { throw new Error("health must not invoke route probes"); },
          async lease() { throw new Error("health must not invoke route probes"); },
          async coordinationDomain() { throw new Error("health must not invoke route probes"); },
        };
        const verifier: AuthorityEvidenceVerifier = {
          configured: true,
          async verifyDirective() { return []; },
          async verifyReceipt() { return []; },
        };
        runtime = await startLocalControlPlaneRuntime({
          repository_database_path: join(directory, "repository.sqlite"),
          bearer_token: token,
          unix_socket_path: socketPath,
          live_route_probes: probes,
          evidence_verifier: verifier,
          clock: () => TEST_NOW,
        });
        const body = JSON.stringify({ version: "1", request_id: "health-own-authority", kind: "query", name: "health", input: {} });
        health = await roundTrip(socketPath, `Authorization: Bearer ${token}\nContent-Length: ${Buffer.byteLength(body)}\n\n${body}`);
      } finally {
        if (priorRouteAdmission === undefined) delete (Object.prototype as Record<string, unknown>).route_admission;
        else Object.defineProperty(Object.prototype, "route_admission", priorRouteAdmission);
      }
      expect(inheritedRouteReads).toBe(0);
      expect(health).toMatchObject({
        ok: true,
        result: {
          route_admission_configured: true,
          evidence_verification_configured: true,
          dispatch_supported: false,
          execution_supported: false,
        },
      });
    } finally {
      await runtime?.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("composes live repository, target, graph, lease/fence, and coordination CAS probes through the runtime", async () => {
    const directory = await mkdtemp("/tmp/mc-live-runtime-");
    const databasePath = join(directory, "repository.sqlite");
    const database = await openControlPlaneDatabase("repository", databasePath, TEST_NOW);
    const manifest = validManifestValue();
    const manifestBytes = canonicalJson(manifest);
    const manifestDigest = sha256Bytes(manifestBytes);
    database.database.query(
      "INSERT INTO repositories(repository_id, repository_root, display_name, created_at) VALUES (?, ?, ?, ?)",
    ).run(manifest.repository.repository_id, "/repo", "Repo", TEST_NOW);
    database.database.query(
      `INSERT INTO runs(run_id, repository_id, mister_clean_version, detector_set_id, detector_set_sha256, observed_then_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(manifest.run_id, manifest.repository.repository_id, "6.4.0", "detectors-1", testSha("b"), "{}", TEST_NOW);
    database.database.query(
      `INSERT INTO manifest_revisions(manifest_id, revision, run_id, parent_manifest_sha256, manifest_sha256, canonical_manifest_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(manifest.manifest_id, 1, manifest.run_id, null, manifestDigest, manifestBytes, TEST_NOW);
    database.close();

    const routeEvidence = [{ path: "route-admission.json", sha256: testSha("7"), record_type: "mister-clean.directive-state-evidence" }];
    const calls = { repository: 0, target: 0, graph: 0, lease: 0, coordination: 0 };
    let targetCommit = manifest.expected_target_commit;
    let fencingToken = manifest.lanes[0]!.lease!.fencing_token;
    let coordinationVersion = manifest.lanes[0]!.coordination_claims[0]!.expected_version;
    const probes: LiveRouteAdmissionProbes = {
      async repositorySubject() { calls.repository += 1; return { value: manifest.repository, evidence: routeEvidence }; },
      async targetCommit() { calls.target += 1; return { value: targetCommit, evidence: routeEvidence }; },
      async issueGraph() { calls.graph += 1; return { value: manifest.issue_graph.sha256, evidence: routeEvidence }; },
      async lease() {
        calls.lease += 1;
        return {
          value: {
            ...manifest.lanes[0]!.lease!,
            fencing_token: fencingToken,
            active: true,
          },
          evidence: routeEvidence,
        };
      },
      async coordinationDomain() {
        calls.coordination += 1;
        return {
          value: {
            key: manifest.lanes[0]!.coordination_claims[0]!.key,
            version: coordinationVersion,
            state_digest: manifest.lanes[0]!.coordination_claims[0]!.expected_state_digest,
          },
          evidence: routeEvidence,
        };
      },
    };
    const evidenceVerifier: AuthorityEvidenceVerifier = {
      configured: true,
      async verifyDirective(request) {
        return request.evidence.map((entry) => ({ path: entry.path, sha256: entry.sha256, ...(entry.record_type === null ? {} : { record_type: entry.record_type }) }));
      },
      async verifyReceipt(request) { return request.receipt.evidence; },
    };
    const socketPath = join(directory, "control.sock");
    const runtime = await startLocalControlPlaneRuntime({
      repository_database_path: databasePath,
      bearer_token: token,
      unix_socket_path: socketPath,
      live_route_probes: probes,
      evidence_verifier: evidenceVerifier,
      clock: () => TEST_NOW,
    });
    const invoke = async (request: ControlPlaneRequest): Promise<unknown> => {
      const payload = JSON.stringify(request);
      return roundTrip(socketPath, `Authorization: Bearer ${token}\nContent-Length: ${Buffer.byteLength(payload)}\n\n${payload}`);
    };
    const transition = (directiveId: string, expected: DirectiveState | null, state: DirectiveState, evidence = [] as never[]): ControlPlaneRequest => ({
      version: "1",
      request_id: `${directiveId}-${state}`,
      kind: "command",
      name: "directive.transition",
      input: {
        directive_id: directiveId as DirectiveId,
        run_id: manifest.run_id,
        manifest_id: manifest.manifest_id,
        manifest_revision: 1,
        manifest_sha256: manifestDigest,
        expected_state: expected,
        to_state: state,
        control_surface_id: state === "queued" ? "surface-1" : null,
        evidence,
        receipt_ids: [],
      },
    } as unknown as ControlPlaneRequest);
    const projectEvidence = [{ path: "projected.json", sha256: testSha("6"), record_type: "mister-clean.directive-state-evidence" }] as never;
    const prepare = async (id: string): Promise<void> => {
      expect(await invoke(transition(id, null, "recommended"))).toMatchObject({ ok: true });
      expect(await invoke(transition(id, "recommended", "projected", projectEvidence))).toMatchObject({ ok: true });
    };
    try {
      await prepare("directive-live");
      expect(await invoke(transition("directive-live", "projected", "queued"))).toMatchObject({ ok: true, result: { state: "queued" } });
      expect(calls).toEqual({ repository: 1, target: 1, graph: 1, lease: 1, coordination: 1 });

      await prepare("directive-stale-target");
      targetCommit = "stale";
      expect(await invoke(transition("directive-stale-target", "projected", "queued"))).toMatchObject({ ok: false, error: { code: "PRECONDITION_FAILED" } });
      targetCommit = manifest.expected_target_commit;

      await prepare("directive-stale-fence");
      fencingToken += 1;
      expect(await invoke(transition("directive-stale-fence", "projected", "queued"))).toMatchObject({ ok: false, error: { code: "PRECONDITION_FAILED" } });
      fencingToken = manifest.lanes[0]!.lease!.fencing_token;

      await prepare("directive-stale-domain");
      coordinationVersion += 1;
      expect(await invoke(transition("directive-stale-domain", "projected", "queued"))).toMatchObject({ ok: false, error: { code: "PRECONDITION_FAILED" } });
    } finally {
      await runtime.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
