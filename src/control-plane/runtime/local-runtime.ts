import type { AuthorityEvidenceVerifier } from "./evidence.js";
import { ProbedRouteAdmission, type LiveRouteAdmissionProbes } from "./admission.js";
import type { IsoTimestamp } from "../contracts/primitives.js";
import { StaticBearerAuthenticator } from "./auth.js";
import { startLoopbackHttpAdapter, type RunningLoopbackHttpAdapter } from "./http.js";
import { ControlPlaneService } from "./service.js";
import { SqliteControlPlaneStore } from "./sqlite-store.js";
import { startUnixSocketAdapter, type RunningUnixSocketAdapter } from "./unix-socket.js";
import { SqliteControlPlaneSnapshotProducer } from "./snapshot-producer.js";
import { openControlPlaneDatabase, type OpenControlPlaneDatabase } from "../persistence/sqlite.js";
import { nullPrototypeRecord } from "./null-prototype-record.js";
import { SqliteMachineLocalEvaluationIntake } from "./evaluation-intake.js";
import type { LogicalProjectRegistrationAuthority } from "./evaluation-intake.js";
import type { EvaluationIdentityObservationAdapter, EvaluationIdentityReceiptAuthority } from "./evaluation-identity-receipt.js";
import type { CapabilityEvaluatorAdapter } from "./capability-evaluator-execution.js";
import { invocationJournalPathFromEnvironment } from "../../mister-clean-invocation-journal.js";

export interface LocalControlPlaneRuntimeOptions {
  readonly repository_database_path: string;
  readonly global_database_path?: string;
  readonly bearer_token: string;
  readonly unix_socket_path?: string;
  readonly http?: {
    readonly host?: "127.0.0.1" | "::1";
    readonly port?: number;
    readonly app_root?: string;
  };
  readonly live_route_probes?: LiveRouteAdmissionProbes;
  readonly evidence_verifier?: AuthorityEvidenceVerifier;
  /** Trusted startup authority for logical-project alias registration. */
  readonly logical_project_registration_authority?: LogicalProjectRegistrationAuthority;
  /** Optional explicit state-root journal. Absent uses the standard local
   * XDG/HOME journal, never a client-provided request field. */
  readonly invocation_journal_path?: string;
  /** Trusted startup receipt custody; no request payload can configure it. */
  readonly evaluation_identity_receipt_authority?: EvaluationIdentityReceiptAuthority;
  /** Startup-only route-specific observation source. Without it, active
   * identity remains explicitly unknown and cannot receive quality credit. */
  readonly evaluation_identity_observation_adapter?: EvaluationIdentityObservationAdapter;
  /** Trusted startup evaluator authority; request payloads cannot provide
   * evaluator verdicts or replace this adapter. */
  readonly capability_evaluator_adapter?: CapabilityEvaluatorAdapter;
  readonly clock?: () => IsoTimestamp;
}

export interface RunningLocalControlPlaneRuntime {
  readonly unix_socket: RunningUnixSocketAdapter | null;
  readonly http: RunningLoopbackHttpAdapter | null;
  /** This boundary admits and records states; it never dispatches or executes. */
  readonly dispatch_supported: false;
  readonly execution_supported: false;
  close(): Promise<void>;
}

/**
 * Compose the shipped local query/state-admission boundary. External-effect
 * transitions remain denied unless explicit admission and evidence authorities
 * are injected. No dispatch or execution adapter is installed here.
 */
export async function startLocalControlPlaneRuntime(
  options: LocalControlPlaneRuntimeOptions,
): Promise<RunningLocalControlPlaneRuntime> {
  if (!Object.hasOwn(options, "repository_database_path") || !Object.hasOwn(options, "bearer_token")) {
    throw new Error("Local control-plane runtime requires own database and bearer-token options");
  }
  const repositoryDatabasePath = options.repository_database_path;
  const bearerToken = options.bearer_token;
  const globalDatabasePath = Object.hasOwn(options, "global_database_path")
    ? options.global_database_path
    : undefined;
  const unixSocketPath = Object.hasOwn(options, "unix_socket_path")
    ? options.unix_socket_path
    : undefined;
  const httpOptions = Object.hasOwn(options, "http") ? options.http : undefined;
  const liveRouteProbes = Object.hasOwn(options, "live_route_probes")
    ? options.live_route_probes
    : undefined;
  const evidenceVerifier = Object.hasOwn(options, "evidence_verifier")
    ? options.evidence_verifier
    : undefined;
  const registrationAuthority = Object.hasOwn(options, "logical_project_registration_authority")
    ? options.logical_project_registration_authority
    : undefined;
  const invocationJournalPath = Object.hasOwn(options, "invocation_journal_path")
    ? options.invocation_journal_path
    : undefined;
  const identityReceiptAuthority = Object.hasOwn(options, "evaluation_identity_receipt_authority")
    ? options.evaluation_identity_receipt_authority
    : undefined;
  const identityObservationAdapter = Object.hasOwn(options, "evaluation_identity_observation_adapter")
    ? options.evaluation_identity_observation_adapter
    : undefined;
  const capabilityEvaluatorAdapter = Object.hasOwn(options, "capability_evaluator_adapter")
    ? options.capability_evaluator_adapter
    : undefined;
  const clock = Object.hasOwn(options, "clock") ? options.clock : undefined;
  const httpHost = httpOptions !== undefined && Object.hasOwn(httpOptions, "host")
    ? httpOptions.host
    : undefined;
  const httpPort = httpOptions !== undefined && Object.hasOwn(httpOptions, "port")
    ? httpOptions.port
    : undefined;
  const httpAppRoot = httpOptions !== undefined && Object.hasOwn(httpOptions, "app_root")
    ? httpOptions.app_root
    : undefined;

  if (unixSocketPath === undefined && httpOptions === undefined) {
    throw new Error("Local control-plane runtime requires at least one IPC adapter");
  }
  const repository = await openControlPlaneDatabase("repository", repositoryDatabasePath);
  let global: OpenControlPlaneDatabase | null = null;
  let unixSocket: RunningUnixSocketAdapter | null = null;
  let http: RunningLoopbackHttpAdapter | null = null;
  try {
    if (globalDatabasePath !== undefined) {
      global = await openControlPlaneDatabase("global", globalDatabasePath);
    }
    const evaluationIntake = global === null ? null : new SqliteMachineLocalEvaluationIntake(
      global,
      registrationAuthority,
      invocationJournalPath ?? invocationJournalPathFromEnvironment(process.env),
      identityReceiptAuthority,
      capabilityEvaluatorAdapter ?? null,
      identityObservationAdapter ?? null,
    );
    evaluationIntake?.reconcileInvocations(clock === undefined ? new Date().toISOString() : clock());
    const service = new ControlPlaneService(nullPrototypeRecord({
      store: new SqliteControlPlaneStore(repository, global),
      ...(liveRouteProbes === undefined
        ? {}
        : { route_admission: new ProbedRouteAdmission(liveRouteProbes) }),
      ...(evidenceVerifier === undefined ? {} : { evidence_verifier: evidenceVerifier }),
      ...(evaluationIntake === null ? {} : { evaluation_intake: evaluationIntake }),
      ...(clock === undefined ? {} : { clock }),
    }));
    const authenticator = new StaticBearerAuthenticator(bearerToken);
    if (unixSocketPath !== undefined) {
      unixSocket = await startUnixSocketAdapter(nullPrototypeRecord({
        path: unixSocketPath,
        service,
        authenticator,
      }));
    }
    if (httpOptions !== undefined) {
      const snapshotProducer = httpAppRoot === undefined || global === null
        ? undefined
        : new SqliteControlPlaneSnapshotProducer(nullPrototypeRecord({ repository, global }));
      http = await startLoopbackHttpAdapter(nullPrototypeRecord({
        service,
        authenticator,
        ...(httpHost === undefined ? {} : { host: httpHost }),
        ...(httpPort === undefined ? {} : { port: httpPort }),
        ...(httpAppRoot === undefined ? {} : {
          app_root: httpAppRoot,
          ...(snapshotProducer === undefined ? {} : { snapshot_producer: snapshotProducer }),
        }),
      }));
    }
    let closed = false;
    return {
      unix_socket: unixSocket,
      http,
      dispatch_supported: false,
      execution_supported: false,
      close: async () => {
        if (closed) return;
        closed = true;
        const failures: unknown[] = [];
        for (const adapter of [http, unixSocket]) {
          if (adapter === null) continue;
          try { await adapter.close(); } catch (error) { failures.push(error); }
        }
        try { global?.close(); } catch (error) { failures.push(error); }
        try { repository.close(); } catch (error) { failures.push(error); }
        if (failures.length > 0) throw new AggregateError(failures, "Local control-plane runtime did not close cleanly");
      },
    };
  } catch (error) {
    try { await http?.close(); } catch { /* preserve the startup failure */ }
    try { await unixSocket?.close(); } catch { /* preserve the startup failure */ }
    global?.close();
    repository.close();
    throw error;
  }
}
