import { describe, expect, it } from "vitest";

import { sha256Bytes } from "./authority.js";
import { ConfiguredHarnessStateObservationAdapter } from "./evaluation-identity-receipt.js";

const bytes = new TextEncoder().encode("trusted harness receipt");
const evidence = { sha256: sha256Bytes(bytes), bytes };
const request = {
  phase: "pre_dispatch" as const,
  run_event_id: "run-1",
  requested_tuple: { agent_tuple_id: "tuple-1", model_id: "model-1", harness_id: "harness-1", reasoning_level: "high" } as never,
  execution_route_id: "route-1",
  invocation_ids: ["invocation-1"],
  retained_evidence: [evidence],
};

function observed(overrides: Record<string, unknown> = {}) {
  return {
    observation_id: "observation-1", phase: "pre_dispatch", requested_agent_tuple_id: "tuple-1", observed_model_id: "model-1", observed_harness_id: "harness-1", observed_reasoning_level: "high", execution_route_id: "route-1", control_surface_id: null,
    control_target: { kind: "headless", adapter_id: "route-adapter", request_or_session_id: "session-1", tool_target_root: "/repo", command_cwd: "/repo" },
    harness_session_token: "session-1", process_instance_token: "process-1", evidence_kind: "trusted_runtime_receipt", evidence: [{ path: "harness-receipt.json", sha256: evidence.sha256 }], observer_actor_id: "observer-1", intended_surface_label: null, worker_self_report: null, observed_at: "2026-09-08T13:00:00.000Z", ...overrides,
  };
}

describe("harness-state identity observation adapter", () => {
  it("admits a timestamped route observation only when it is retained and actor-bound", async () => {
    const adapter = new ConfiguredHarnessStateObservationAdapter({ adapter_id: "route-reader", adapter_version: "1", observer_actor_id: "observer-1", reader: () => observed() as never });
    await expect(adapter.observe(request)).resolves.toMatchObject({ observation_id: "observation-1", observer_actor_id: "observer-1" });
  });

  it("rejects tab labels and worker self-reports as identity evidence", async () => {
    const adapter = new ConfiguredHarnessStateObservationAdapter({ adapter_id: "route-reader", adapter_version: "1", observer_actor_id: "observer-1", reader: () => observed({ intended_surface_label: "GLM tab", worker_self_report: "I am model-1" }) as never });
    await expect(adapter.observe(request)).rejects.toThrow(/incomplete|caller-shaped/);
  });

  it("rejects an observation whose evidence is not retained", async () => {
    const adapter = new ConfiguredHarnessStateObservationAdapter({ adapter_id: "route-reader", adapter_version: "1", observer_actor_id: "observer-1", reader: () => observed({ evidence: [{ path: "missing.json", sha256: "a".repeat(64) }] }) as never });
    await expect(adapter.observe(request)).rejects.toThrow(/retained and digest-bound/);
  });
});
