import { describe, expect, it } from "vitest";

import type { AgentTuple } from "../contracts/agent-evaluation.js";
import { sha256Bytes } from "./authority.js";
import { CmuxAssistedVisualReadbackAdapter, type CmuxCommandRunner, type CmuxVisualSelectorSource } from "./cmux-visual-readback.js";

const tuple = { agent_tuple_id: "tuple-1", model_id: "model-1", harness_id: "droid", reasoning_level: "high" } as AgentTuple;
const identify = (windowId = "window-1", surfaceId = "surface-1") => JSON.stringify({ workspace_id: "workspace-1", workspace_ref: "workspace:1", window_id: windowId, window_ref: "window:1", surface_id: surfaceId, surface_ref: "surface:1", surface_type: "terminal" });
const request = { phase: "pre_dispatch" as const, run_event_id: "run-1", requested_tuple: tuple, execution_route_id: "route-1", invocation_ids: ["invocation-1"], retained_evidence: [] };

function runnerFor(outputs: string[]): CmuxCommandRunner {
  let index = 0;
  return { async run() { const stdout = new TextEncoder().encode(outputs[Math.min(index++, outputs.length - 1)]!); return { stdout, stderr: new Uint8Array() }; } };
}

function source(overrides: Partial<Awaited<ReturnType<CmuxVisualSelectorSource["captureSelector"]>>> = {}): CmuxVisualSelectorSource {
  return { captureSelector: () => ({ screenshot_bytes: new TextEncoder().encode("operator screenshot bytes"), screenshot_media_type: "image/png", observed_tuple: tuple, observer_actor_id: "observer-1", observed_at: new Date().toISOString(), ...overrides } as never) };
}

function adapter(options: { readonly runner?: CmuxCommandRunner; readonly source?: CmuxVisualSelectorSource; readonly max_screenshot_bytes?: number } = {}) {
  return new CmuxAssistedVisualReadbackAdapter({ adapter_id: "cmux-visual", adapter_version: "1", observer_actor_id: "observer-1", workspace_ref: "workspace:1", surface_ref: "surface:1", socket_namespace: "cmux://host/socket", source: options.source ?? source(), command_runner: options.runner ?? runnerFor([identify(), identify()]), ...(options.max_screenshot_bytes === undefined ? {} : { max_screenshot_bytes: options.max_screenshot_bytes }) });
}

describe("assisted CMUX visual identity readback", () => {
  it("binds a trusted selector capture to an unchanged CMUX target and retains collector-owned evidence", async () => {
    const result = await adapter().capture(request);
    expect(result.observation).toMatchObject({ observed_model_id: "model-1", observed_harness_id: "droid", observed_reasoning_level: "high", evidence_kind: "external_visual_readback", process_instance_token: null });
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]!.sha256).toBe(sha256Bytes(result.evidence[0]!.bytes));
    expect(new TextDecoder().decode(result.evidence[0]!.bytes)).toContain("screenshot_base64");
  });

  it("fails closed when the CMUX target changes during capture", async () => {
    await expect(adapter({ runner: runnerFor([identify("window-1", "surface-1"), identify("window-2", "surface-1")]) }).capture(request)).rejects.toThrow(/target changed/);
  });

  it("fails closed for stale visual evidence", async () => {
    const stale = source({ observed_at: new Date(Date.now() - 60_000).toISOString() as never });
    await expect(adapter({ source: stale }).capture(request)).rejects.toThrow(/stale/);
  });

  it("fails closed for a future capture, an unconfigured observer, or a non-image payload", async () => {
    const future = source({ observed_at: new Date(Date.now() + 60_000).toISOString() as never });
    await expect(adapter({ source: future }).capture(request)).rejects.toThrow(/future/);
    const wrongActor = source({ observer_actor_id: "worker-claim" });
    await expect(adapter({ source: wrongActor }).capture(request)).rejects.toThrow(/configured independent observer/);
    const plainText = source({ screenshot_media_type: "text/plain" as never });
    await expect(adapter({ source: plainText }).capture(request)).rejects.toThrow(/media type/);
    const missing = source({ screenshot_bytes: new Uint8Array() });
    await expect(adapter({ source: missing }).capture(request)).rejects.toThrow(/size/);
    const oversized = source({ screenshot_bytes: new Uint8Array(3) });
    await expect(adapter({ source: oversized, max_screenshot_bytes: 2 }).capture(request)).rejects.toThrow(/size/);
  });

  it("fails closed for a selector that does not match the requested tuple", async () => {
    const mismatched = source({ observed_tuple: { ...tuple, model_id: "other-model" } as AgentTuple });
    await expect(adapter({ source: mismatched }).capture(request)).rejects.toThrow(/does not match/);
  });

  it("does not use caller-retained evidence as a selector", async () => {
    const forged = { sha256: "f".repeat(64), bytes: new TextEncoder().encode("forged selector"), media_type: "image/png" };
    const result = await adapter().capture({ ...request, retained_evidence: [forged] });
    expect(result.evidence[0]!.sha256).not.toBe(forged.sha256);
  });
});
