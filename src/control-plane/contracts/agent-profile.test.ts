import { describe, expect, it } from "vitest";
import { parseAgentExecutionProfile, parseExecutionTreatment } from "./agent-profile.js";

const sha = (character: string): string => character.repeat(64);
type FieldProvenance = { status: "verified" | "reported" | "inferred" | "unavailable"; evidence: { path: string; sha256: string }[]; note: string | null };
const unavailable: FieldProvenance = { status: "unavailable", evidence: [], note: "not observed" };
const reported: FieldProvenance = { status: "reported", evidence: [], note: "operator-provided recipe" };
const field = <Value>(value: Value | null, provenance: FieldProvenance = unavailable) => ({ value, provenance });

function profile(): Record<string, unknown> {
  const metric = field(null);
  return {
    schema_version: "1.0", profile_id: "profile-1", revision: 1, captured_at: "2026-08-27T10:00:00.000Z", fingerprint_sha256: sha("a"), agent_tuple_id: "tuple-1",
    harness: { id: field("codex-desktop", reported), version: field(null) },
    model: { id: field("gpt-5.6-sol", reported), version: field(null), release_date: field(null), family: field("gpt-5", reported) },
    reasoning_level: field("high", reported), settings: [{ name: "temperature", value: field(null) }],
    inference: { deployment_mode: field("cloud", reported), provider: field("OpenAI", reported), gateway: field(null), server: field(null), server_version: field(null), endpoint_ref: field(null), secret_ref: field("keychain://openai/default", reported) },
    capability_environment: { tools: field(null), plugins: field(null), mcp_servers: field(null), skills: field(null) },
    context: { starting_context_tokens: field(null), context_window_tokens: field(null) },
    performance: { time_to_first_token_ms: metric, tokens_per_second: metric, input_tokens: metric, output_tokens: metric, cost_usd: metric, reliability: field(null) },
    a2a_agent_card_extension: { enabled: false, public_card_url: null, extension_uri: null }, evidence: [],
  };
}

describe("portable agent execution records", () => {
  it("accepts an honest partial recipe and rejects embedded secret-shaped values", () => {
    expect(parseAgentExecutionProfile(profile()).profile_id).toBe("profile-1");
    const embedded = structuredClone(profile());
    (((embedded.inference as Record<string, unknown>).secret_ref as Record<string, unknown>).value) = "sk-live-secret";
    expect(() => parseAgentExecutionProfile(embedded)).toThrow();
  });

  it("binds an immutable evaluated treatment to the exact profile fingerprint", () => {
    const treatment = parseExecutionTreatment({ schema_version: "1.0", treatment_id: "treatment-1", profile_id: "profile-1", profile_revision: 1, profile_fingerprint_sha256: sha("a"), run_event_id: "run-event-1", repository_cohort_token: "cohort-1", capability_id: "code_correctness_remediation", started_at: "2026-08-27T10:00:00.000Z", completed_at: null, observed_identity_disposition: "IDENTITY_UNBOUND", observed_profile_sha256: sha("b"), telemetry_sha256: null, evidence: [{ path: "identity.json", sha256: sha("c") }] });
    expect(treatment.profile_fingerprint_sha256).toBe(sha("a"));
  });
});
