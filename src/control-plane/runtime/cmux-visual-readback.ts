import { execFile } from "node:child_process";
import { Buffer } from "node:buffer";
import { promisify } from "node:util";

import type { AgentIdentityObservation, AgentTuple } from "../contracts/agent-evaluation.js";
import type { ControlSurfaceId, IsoTimestamp, Sha256 } from "../contracts/primitives.js";
import { canonicalJson, sha256Bytes } from "./authority.js";
import type { EvaluationIdentityObservationAdapter, IdentityObservationCapture } from "./evaluation-identity-receipt.js";

const execFileAsync = promisify(execFile);
const DEFAULT_CMUX_BINARY = "/Applications/cmux.app/Contents/Resources/bin/cmux";
const DEFAULT_CAPTURE_MAX_AGE_MS = 5_000;
const DEFAULT_SCREEN_MAX_BYTES = 8 * 1024 * 1024;
const SCREENSHOT_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

interface CmuxIdentifyResult {
  readonly workspace_id?: unknown;
  readonly workspace_ref?: unknown;
  readonly window_id?: unknown;
  readonly window_ref?: unknown;
  readonly surface_id?: unknown;
  readonly surface_ref?: unknown;
  readonly surface_type?: unknown;
  readonly socket_path?: unknown;
}

export interface CmuxVisualSelectorCapture {
  /** Bytes captured by the trusted operator/Computer Use bridge, not IPC. */
  readonly screenshot_bytes: Uint8Array;
  readonly screenshot_media_type: "image/png" | "image/jpeg" | "image/webp";
  readonly observed_tuple: AgentTuple;
  readonly observer_actor_id: string;
  readonly observed_at: IsoTimestamp;
}

export interface CmuxVisualSelectorSource {
  /** This source is installed in trusted runtime configuration. It is not a
   * field accepted by the public evaluation command. */
  captureSelector(input: {
    readonly phase: "pre_dispatch" | "pre_evaluation";
    readonly requested_tuple: AgentTuple;
    readonly target: CmuxTarget;
  }): Promise<CmuxVisualSelectorCapture> | CmuxVisualSelectorCapture;
}

export interface CmuxTarget {
  readonly host_socket_namespace: string;
  readonly workspace_id: string;
  readonly window_id: string;
  readonly surface_id: string;
  readonly workspace_ref: string;
  readonly surface_ref: string;
  readonly tool_target_root: string | null;
  readonly command_cwd: string | null;
}

interface CommandResult {
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

export interface CmuxCommandRunner {
  run(args: readonly string[]): Promise<CommandResult>;
}

const productionCommandRunner: CmuxCommandRunner = Object.freeze({
  async run(args: readonly string[]) {
    const result = await execFileAsync(DEFAULT_CMUX_BINARY, [...args], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 });
    return { stdout: new Uint8Array(Buffer.from(result.stdout as Uint8Array)), stderr: new Uint8Array(Buffer.from(result.stderr as Uint8Array)) };
  },
});

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function parseIdentify(bytes: Uint8Array): CmuxIdentifyResult {
  const parsed: unknown = JSON.parse(decode(bytes));
  if (typeof parsed !== "object" || parsed === null) throw new Error("CMUX identify output is not an object");
  return parsed as CmuxIdentifyResult;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`CMUX identify field ${field} is missing`);
  return value;
}

function targetFromIdentify(value: CmuxIdentifyResult, hostSocketNamespace: string, configured: { readonly workspace_ref: string; readonly surface_ref: string; readonly tool_target_root: string | null; readonly command_cwd: string | null }): CmuxTarget {
  const target = {
    host_socket_namespace: hostSocketNamespace,
    workspace_id: requiredString(value.workspace_id, "workspace_id"),
    window_id: requiredString(value.window_id, "window_id"),
    surface_id: requiredString(value.surface_id, "surface_id"),
    workspace_ref: requiredString(value.workspace_ref, "workspace_ref"),
    surface_ref: requiredString(value.surface_ref, "surface_ref"),
    tool_target_root: configured.tool_target_root,
    command_cwd: configured.command_cwd,
  } satisfies CmuxTarget;
  if (target.workspace_ref !== configured.workspace_ref || target.surface_ref !== configured.surface_ref) throw new Error("CMUX identify target does not match the configured workspace or surface");
  if (value.surface_type !== "terminal") throw new Error("CMUX visual identity requires a terminal surface");
  return target;
}

function sameTarget(left: CmuxTarget, right: CmuxTarget): boolean {
  return left.host_socket_namespace === right.host_socket_namespace
    && left.workspace_id === right.workspace_id
    && left.window_id === right.window_id
    && left.surface_id === right.surface_id
    && left.workspace_ref === right.workspace_ref
    && left.surface_ref === right.surface_ref;
}

function freshTimestamp(value: string, now: number, maxAgeMs: number): void {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) throw new Error("CMUX visual selector timestamp is not canonical");
  if (timestamp > now + 1_000 || now - timestamp > maxAgeMs) throw new Error("CMUX visual selector capture is stale or from the future");
}

function captureEvidence(input: { readonly phase: string; readonly run_event_id: string; readonly adapter_id: string; readonly adapter_version: string; readonly target_before: CmuxTarget; readonly target_after: CmuxTarget; readonly identify_before: Uint8Array; readonly identify_after: Uint8Array; readonly screenshot: CmuxVisualSelectorCapture }): { readonly sha256: Sha256; readonly media_type: string; readonly bytes: Uint8Array } {
  const screenshot = Buffer.from(input.screenshot.screenshot_bytes);
  const payload = canonicalJson({
    schema_version: "1.0",
    record_type: "mister-clean.cmux-assisted-visual-readback",
    adapter_id: input.adapter_id,
    adapter_version: input.adapter_version,
    phase: input.phase,
    run_event_id: input.run_event_id,
    target_before: input.target_before,
    target_after: input.target_after,
    identify_before_base64: Buffer.from(input.identify_before).toString("base64"),
    identify_after_base64: Buffer.from(input.identify_after).toString("base64"),
    screenshot_base64: screenshot.toString("base64"),
    screenshot_media_type: input.screenshot.screenshot_media_type,
    selected_tuple: input.screenshot.observed_tuple,
    observer_actor_id: input.screenshot.observer_actor_id,
    observed_at: input.screenshot.observed_at,
  });
  const bytes = new TextEncoder().encode(payload);
  return { sha256: sha256Bytes(bytes), media_type: "application/vnd.mister-clean.cmux-assisted-visual-readback+json", bytes };
}

/**
 * CMUX has no native model selector API. This adapter therefore requires an
 * explicitly trusted Computer Use/operator source for the selector itself and
 * independently captures CMUX identity before and after that visual readback.
 * It never parses terminal text, tab titles, or worker self-reports, and it
 * never emits provider_execution_attested.
 */
export class CmuxAssistedVisualReadbackAdapter implements EvaluationIdentityObservationAdapter {
  readonly configured = true;
  readonly identity_assurance = "active_harness_selection" as const;
  readonly adapter_id: string;
  readonly adapter_version: string;
  readonly observer_actor_id: string;
  readonly #workspaceRef: string;
  readonly #surfaceRef: string;
  readonly #socketNamespace: string;
  readonly #toolTargetRoot: string | null;
  readonly #commandCwd: string | null;
  readonly #source: CmuxVisualSelectorSource;
  readonly #runner: CmuxCommandRunner;
  readonly #maxAgeMs: number;
  readonly #maxScreenshotBytes: number;

  constructor(input: {
    readonly adapter_id: string;
    readonly adapter_version: string;
    readonly observer_actor_id: string;
    readonly workspace_ref: string;
    readonly surface_ref: string;
    readonly socket_namespace: string;
    readonly source: CmuxVisualSelectorSource;
    readonly command_runner?: CmuxCommandRunner;
    readonly max_age_ms?: number;
    readonly max_screenshot_bytes?: number;
    readonly tool_target_root?: string | null;
    readonly command_cwd?: string | null;
  }) {
    for (const [name, value] of [["adapter_id", input.adapter_id], ["adapter_version", input.adapter_version], ["observer_actor_id", input.observer_actor_id], ["workspace_ref", input.workspace_ref], ["surface_ref", input.surface_ref], ["socket_namespace", input.socket_namespace]] as const) {
      if (value.trim().length === 0) throw new Error(`CMUX visual readback requires non-empty ${name}`);
    }
    this.adapter_id = input.adapter_id;
    this.adapter_version = input.adapter_version;
    this.observer_actor_id = input.observer_actor_id;
    this.#workspaceRef = input.workspace_ref;
    this.#surfaceRef = input.surface_ref;
    this.#socketNamespace = input.socket_namespace;
    this.#toolTargetRoot = input.tool_target_root ?? null;
    this.#commandCwd = input.command_cwd ?? null;
    this.#source = input.source;
    this.#runner = input.command_runner ?? productionCommandRunner;
    this.#maxAgeMs = input.max_age_ms ?? DEFAULT_CAPTURE_MAX_AGE_MS;
    this.#maxScreenshotBytes = input.max_screenshot_bytes ?? DEFAULT_SCREEN_MAX_BYTES;
    if (!Number.isInteger(this.#maxAgeMs) || this.#maxAgeMs <= 0) throw new Error("CMUX visual readback max age must be positive");
    if (!Number.isInteger(this.#maxScreenshotBytes) || this.#maxScreenshotBytes <= 0) throw new Error("CMUX visual readback max screenshot size must be positive");
  }

  async #identify(): Promise<{ readonly target: CmuxTarget; readonly raw: Uint8Array }> {
    const result = await this.#runner.run(["--json", "--id-format", "both", "identify", "--workspace", this.#workspaceRef, "--surface", this.#surfaceRef]);
    const target = targetFromIdentify(parseIdentify(result.stdout), this.#socketNamespace, { workspace_ref: this.#workspaceRef, surface_ref: this.#surfaceRef, tool_target_root: this.#toolTargetRoot, command_cwd: this.#commandCwd });
    const raw = new TextEncoder().encode(canonicalJson({ stdout_base64: Buffer.from(result.stdout).toString("base64"), stderr_base64: Buffer.from(result.stderr).toString("base64") }));
    return { target, raw };
  }

  async capture(input: Parameters<EvaluationIdentityObservationAdapter["observe"]>[0]): Promise<IdentityObservationCapture> {
    const before = await this.#identify();
    const screenshot = await this.#source.captureSelector({ phase: input.phase, requested_tuple: input.requested_tuple, target: before.target });
    if (screenshot.observer_actor_id !== this.observer_actor_id) throw new Error("CMUX visual selector observer is not the configured independent observer");
    if (!SCREENSHOT_MEDIA_TYPES.has(screenshot.screenshot_media_type)) throw new Error("CMUX visual selector screenshot media type is invalid");
    if (screenshot.screenshot_bytes.byteLength === 0 || screenshot.screenshot_bytes.byteLength > this.#maxScreenshotBytes) throw new Error("CMUX visual selector screenshot size is invalid");
    if (screenshot.observed_tuple.agent_tuple_id !== input.requested_tuple.agent_tuple_id || screenshot.observed_tuple.model_id !== input.requested_tuple.model_id || screenshot.observed_tuple.harness_id !== input.requested_tuple.harness_id || screenshot.observed_tuple.reasoning_level !== input.requested_tuple.reasoning_level) throw new Error("CMUX visual selector does not match the requested agent tuple");
    freshTimestamp(screenshot.observed_at, Date.now(), this.#maxAgeMs);
    const after = await this.#identify();
    if (!sameTarget(before.target, after.target)) throw new Error("CMUX target changed across visual selector capture");
    const evidence = captureEvidence({ phase: input.phase, run_event_id: input.run_event_id, adapter_id: this.adapter_id, adapter_version: this.adapter_version, target_before: before.target, target_after: after.target, identify_before: before.raw, identify_after: after.raw, screenshot });
    const observation: AgentIdentityObservation = {
      observation_id: `cmux-visual-${evidence.sha256.slice(0, 32)}`,
      phase: input.phase,
      requested_agent_tuple_id: input.requested_tuple.agent_tuple_id,
      observed_model_id: screenshot.observed_tuple.model_id,
      observed_harness_id: screenshot.observed_tuple.harness_id,
      observed_reasoning_level: screenshot.observed_tuple.reasoning_level,
      execution_route_id: input.execution_route_id as AgentIdentityObservation["execution_route_id"],
      control_surface_id: after.target.surface_id as ControlSurfaceId,
      control_target: { kind: "cmux", host_socket_namespace: after.target.host_socket_namespace, workspace_id: after.target.workspace_id, window_id: after.target.window_id, surface_id: after.target.surface_id, tool_target_root: after.target.tool_target_root, command_cwd: after.target.command_cwd },
      harness_session_token: sha256Bytes(canonicalJson({ socket_namespace: after.target.host_socket_namespace, workspace_id: after.target.workspace_id, window_id: after.target.window_id, surface_id: after.target.surface_id })),
      process_instance_token: null,
      evidence_kind: "external_visual_readback",
      evidence: [{ path: `cmux-visual-readback/${evidence.sha256}.json`, sha256: evidence.sha256 }],
      observer_actor_id: this.observer_actor_id,
      intended_surface_label: null,
      worker_self_report: null,
      observed_at: screenshot.observed_at,
    };
    return { observation, identity_assurance: "active_harness_selection", evidence: [evidence] };
  }

  async observe(input: Parameters<EvaluationIdentityObservationAdapter["observe"]>[0]): Promise<AgentIdentityObservation | null> {
    return (await this.capture(input)).observation;
  }
}
