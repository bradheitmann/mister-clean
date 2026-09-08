import {
  startLocalControlPlaneRuntime as startInternalLocalControlPlaneRuntime,
} from "./control-plane/runtime/local-runtime.js";
import { ConfiguredEvaluationIdentityReceiptAuthority, ConfiguredLogicalProjectRegistrationAuthority } from "./control-plane/runtime/evaluation-intake.js";
import { nullPrototypeRecord } from "./control-plane/runtime/null-prototype-record.js";
import type { CapabilityEvaluatorAdapter } from "./control-plane/runtime/capability-evaluator-execution.js";
import type { EvaluationIdentityObservationAdapter } from "./control-plane/runtime/evaluation-identity-receipt.js";

const PUBLIC_OPTION_KEYS = new Set([
  "repository_database_path",
  "global_database_path",
  "bearer_token",
  "unix_socket_path",
  "http",
  "logical_project_registration_receipts",
  "invocation_journal_path",
  "evaluation_identity_receipts",
  "capability_evaluator_adapter",
  "evaluation_identity_observation_adapter",
]);

const PUBLIC_HTTP_OPTION_KEYS = new Set([
  "host",
  "port",
  "app_root",
]);

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
  /** Startup-only operator receipts for immutable logical-project aliases.
   * This is declarative data, never a caller supplied authority callback. */
  readonly logical_project_registration_receipts?: readonly {
    readonly registration_evidence_sha256: string;
    readonly operator_actor_id: string;
  }[];
  /** Startup-selected canonical local CLI journal; never accepted over IPC. */
  readonly invocation_journal_path?: string;
  /** Startup-only receipt custody declarations. These prove neither a remote
   * principal nor a cryptographic signature; the boundary is same-OS-user. */
  readonly evaluation_identity_receipts?: readonly {
    readonly receipt_sha256: string;
    readonly observer_actor_id: string;
    readonly identity_assurance: "requested_configuration" | "active_harness_selection" | "provider_execution_attested";
  }[];
  /** Startup-only evaluator authority. It is never accepted inside an IPC
   * request and cannot be replaced by caller-provided verdicts. */
  readonly capability_evaluator_adapter?: CapabilityEvaluatorAdapter;
  /** Startup-only route-specific harness-state observation authority. */
  readonly evaluation_identity_observation_adapter?: EvaluationIdentityObservationAdapter;
}

function assertRegistrationReceipts(value: unknown): readonly { readonly registration_evidence_sha256: string; readonly operator_actor_id: string }[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new Error("logical_project_registration_receipts must contain one to 100 declarations");
  }
  const receipts = value.map((item, index) => {
    assertExactOwnKeys(item, new Set(["registration_evidence_sha256", "operator_actor_id"]), ["registration_evidence_sha256", "operator_actor_id"], `logical_project_registration_receipts[${index}]`);
    const digest = (item as Record<string, unknown>).registration_evidence_sha256;
    const actor = (item as Record<string, unknown>).operator_actor_id;
    if (typeof digest !== "string" || !/^[0-9a-f]{64}$/u.test(digest) || typeof actor !== "string" || actor.trim().length === 0) {
      throw new Error(`logical_project_registration_receipts[${index}] must contain a canonical digest and non-empty actor`);
    }
    return Object.freeze({ registration_evidence_sha256: digest, operator_actor_id: actor });
  });
  if (new Set(receipts.map((receipt) => receipt.registration_evidence_sha256)).size !== receipts.length) {
    throw new Error("logical_project_registration_receipts must have distinct receipt digests");
  }
  return Object.freeze(receipts);
}

function assertIdentityReceipts(value: unknown): readonly { readonly receipt_sha256: string; readonly observer_actor_id: string; readonly identity_assurance: "requested_configuration" | "active_harness_selection" | "provider_execution_attested" }[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) throw new Error("evaluation_identity_receipts must contain one to 100 declarations");
  const receipts = value.map((item, index) => {
    assertExactOwnKeys(item, new Set(["receipt_sha256", "observer_actor_id", "identity_assurance"]), ["receipt_sha256", "observer_actor_id", "identity_assurance"], `evaluation_identity_receipts[${index}]`);
    const digest = (item as Record<string, unknown>).receipt_sha256;
    const actor = (item as Record<string, unknown>).observer_actor_id;
    const assurance = (item as Record<string, unknown>).identity_assurance;
    if (typeof digest !== "string" || !/^[0-9a-f]{64}$/u.test(digest) || typeof actor !== "string" || actor.trim().length === 0
      || (assurance !== "requested_configuration" && assurance !== "active_harness_selection" && assurance !== "provider_execution_attested")) throw new Error(`evaluation_identity_receipts[${index}] must contain a canonical digest, non-empty actor, and authority-assigned assurance`);
    return Object.freeze({ receipt_sha256: digest, observer_actor_id: actor, identity_assurance: assurance });
  });
  if (new Set(receipts.map((receipt) => receipt.receipt_sha256)).size !== receipts.length) throw new Error("evaluation_identity_receipts must have distinct receipt digests");
  return Object.freeze(receipts);
}

export interface RunningLocalControlPlaneRuntime {
  readonly unix_socket: Readonly<{ readonly path: string }> | null;
  readonly http: Readonly<{
    readonly host: "127.0.0.1" | "::1";
    readonly port: number;
    readonly url: string;
    readonly app_url: string | null;
  }> | null;
  readonly dispatch_supported: false;
  readonly execution_supported: false;
  close(): Promise<void>;
}

function assertExactOwnKeys(
  value: unknown,
  allowed: ReadonlySet<string>,
  required: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must have Object.prototype or null prototype`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      throw new Error(`${label} contains unsupported option ${String(key)}`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label} requires own option ${key}`);
  }
}

/**
 * Start the supported local query/state-admission boundary. The public package
 * accepts transport configuration only: repository-owned admission probes,
 * evidence authorities, services, stores, authenticators, adapters, and clocks
 * remain internal composition capabilities.
 */
export async function startLocalControlPlaneRuntime(
  options: LocalControlPlaneRuntimeOptions,
): Promise<RunningLocalControlPlaneRuntime> {
  assertExactOwnKeys(
    options,
    PUBLIC_OPTION_KEYS,
    ["repository_database_path", "bearer_token"],
    "Local control-plane runtime options",
  );
  const httpOptions = Object.hasOwn(options, "http") ? options.http : undefined;
  if (httpOptions !== undefined) {
    assertExactOwnKeys(httpOptions, PUBLIC_HTTP_OPTION_KEYS, [], "Local control-plane HTTP options");
  }

  const repositoryDatabasePath = options.repository_database_path;
  const bearerToken = options.bearer_token;
  const globalDatabasePath = Object.hasOwn(options, "global_database_path")
    ? options.global_database_path
    : undefined;
  const unixSocketPath = Object.hasOwn(options, "unix_socket_path")
    ? options.unix_socket_path
    : undefined;
  const registrationReceipts = Object.hasOwn(options, "logical_project_registration_receipts")
    ? assertRegistrationReceipts(options.logical_project_registration_receipts)
    : undefined;
  const invocationJournalPath = Object.hasOwn(options, "invocation_journal_path") ? options.invocation_journal_path : undefined;
  if (invocationJournalPath !== undefined && (typeof invocationJournalPath !== "string" || !invocationJournalPath.startsWith("/"))) throw new Error("invocation_journal_path must be an absolute machine-local path");
  const identityReceipts = Object.hasOwn(options, "evaluation_identity_receipts")
    ? assertIdentityReceipts(options.evaluation_identity_receipts)
    : undefined;
  const capabilityEvaluatorAdapter = Object.hasOwn(options, "capability_evaluator_adapter")
    ? options.capability_evaluator_adapter
    : undefined;
  const identityObservationAdapter = Object.hasOwn(options, "evaluation_identity_observation_adapter")
    ? options.evaluation_identity_observation_adapter
    : undefined;

  let httpHost: "127.0.0.1" | "::1" | undefined;
  let httpPort: number | undefined;
  let httpAppRoot: string | undefined;
  if (httpOptions !== undefined) {
    httpHost = Object.hasOwn(httpOptions, "host") ? httpOptions.host : undefined;
    httpPort = Object.hasOwn(httpOptions, "port") ? httpOptions.port : undefined;
    httpAppRoot = Object.hasOwn(httpOptions, "app_root") ? httpOptions.app_root : undefined;
  }

  const internalHttpOptions = httpOptions === undefined
    ? undefined
    : nullPrototypeRecord({
      ...(httpHost === undefined ? {} : { host: httpHost }),
      ...(httpPort === undefined ? {} : { port: httpPort }),
      ...(httpAppRoot === undefined ? {} : { app_root: httpAppRoot }),
    });
  const internal = await startInternalLocalControlPlaneRuntime(nullPrototypeRecord({
    repository_database_path: repositoryDatabasePath,
    ...(globalDatabasePath === undefined ? {} : { global_database_path: globalDatabasePath }),
    bearer_token: bearerToken,
    ...(unixSocketPath === undefined ? {} : { unix_socket_path: unixSocketPath }),
    ...(invocationJournalPath === undefined ? {} : { invocation_journal_path: invocationJournalPath }),
    ...(internalHttpOptions === undefined ? {} : { http: internalHttpOptions }),
    ...(registrationReceipts === undefined
      ? {}
      : { logical_project_registration_authority: new ConfiguredLogicalProjectRegistrationAuthority(registrationReceipts) }),
    ...(identityReceipts === undefined ? {} : { evaluation_identity_receipt_authority: new ConfiguredEvaluationIdentityReceiptAuthority(identityReceipts) }),
    ...(capabilityEvaluatorAdapter === undefined ? {} : { capability_evaluator_adapter: capabilityEvaluatorAdapter }),
    ...(identityObservationAdapter === undefined ? {} : { evaluation_identity_observation_adapter: identityObservationAdapter }),
  }));

  const unixSocket = internal.unix_socket === null
    ? null
    : Object.freeze({ path: internal.unix_socket.path });
  const http = internal.http === null
    ? null
    : Object.freeze({
      host: internal.http.host,
      port: internal.http.port,
      url: internal.http.url,
      app_url: internal.http.app_url,
    });

  return Object.freeze({
    unix_socket: unixSocket,
    http,
    dispatch_supported: false,
    execution_supported: false,
    close: () => internal.close(),
  });
}
