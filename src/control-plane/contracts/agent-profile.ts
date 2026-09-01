import * as z from "zod";

const text = z.string().min(1);
const timestamp = text.regex(/^\d{4}-\d\d-\d\dT/u).refine((value) => !Number.isNaN(Date.parse(value)));
const digest = text.regex(/^[a-f0-9]{64}$/u);
const evidence = z.object({ path: text, sha256: digest }).strict();
const provenance = z.object({
  status: z.enum(["verified", "reported", "inferred", "unavailable"]),
  evidence: z.array(evidence),
  note: text.nullable(),
}).strict().superRefine((value, context) => {
  if (value.status === "verified" && value.evidence.length === 0) context.addIssue({ code: "custom", message: "verified profile fields require retained evidence" });
});
const field = <Schema extends z.ZodType>(schema: Schema) => z.object({ value: schema.nullable(), provenance }).strict();
const distribution = z.object({ count: z.number().int().nonnegative().safe(), p50: z.number().finite().nonnegative().nullable(), p95: z.number().finite().nonnegative().nullable(), max: z.number().finite().nonnegative().nullable(), unit: text }).strict();
const settingValue = z.union([z.string(), z.number().finite(), z.boolean()]);
const secretReference = text.regex(/^(secret|keychain|env-ref):\/\//u);

/** Private, machine-local desired execution recipe. It contains references to
 * secrets, never secret values, and preserves provenance for every field that
 * might otherwise be guessed from a pane label or model self-report. */
export const agentExecutionProfileSchema = z.object({
  schema_version: z.literal("1.0"), profile_id: text, revision: z.number().int().positive().safe(), captured_at: timestamp, fingerprint_sha256: digest,
  agent_tuple_id: text,
  harness: z.object({ id: field(text), version: field(text) }).strict(),
  model: z.object({ id: field(text), version: field(text), release_date: field(text), family: field(text) }).strict(),
  reasoning_level: field(text),
  settings: z.array(z.object({ name: text, value: field(settingValue) }).strict()),
  inference: z.object({
    deployment_mode: field(z.enum(["cloud", "local_direct", "remote_local_api", "unknown"])),
    provider: field(text), gateway: field(text), server: field(text), server_version: field(text), endpoint_ref: field(text), secret_ref: field(secretReference),
  }).strict(),
  capability_environment: z.object({ tools: field(z.array(text)), plugins: field(z.array(text)), mcp_servers: field(z.array(text)), skills: field(z.array(text)) }).strict(),
  context: z.object({ starting_context_tokens: field(z.number().int().nonnegative().safe()), context_window_tokens: field(z.number().int().positive().safe()) }).strict(),
  performance: z.object({ time_to_first_token_ms: field(distribution), tokens_per_second: field(distribution), input_tokens: field(distribution), output_tokens: field(distribution), cost_usd: field(distribution), reliability: field(z.number().min(0).max(1)) }).strict(),
  a2a_agent_card_extension: z.object({ enabled: z.boolean(), public_card_url: text.nullable(), extension_uri: text.nullable() }).strict(),
  evidence: z.array(evidence),
}).strict();

/** Immutable record of what actually ran. Evaluations bind to treatments, not
 * mutable desired profiles, surface labels, or a model's self-identification. */
export const executionTreatmentSchema = z.object({
  schema_version: z.literal("1.0"), treatment_id: text, profile_id: text, profile_revision: z.number().int().positive().safe(), profile_fingerprint_sha256: digest,
  run_event_id: text, repository_cohort_token: text, capability_id: text, started_at: timestamp, completed_at: timestamp.nullable(),
  observed_identity_disposition: z.enum(["BOUND_FOR_EVALUATION", "BOUND_FOR_DISPATCH", "IDENTITY_UNBOUND", "MISMATCH", "INVALIDATED", "UNTESTED"]),
  observed_profile_sha256: digest, telemetry_sha256: digest.nullable(), evidence: z.array(evidence).min(1),
}).strict();

export const agentCardSchema = z.object({
  schema_version: z.literal("1.0"), card_id: text, profile: agentExecutionProfileSchema, treatments: z.array(executionTreatmentSchema),
  capability_summary: z.array(z.object({ capability_id: text, qualification: text, verified_trials: z.number().int().nonnegative().safe(), score: z.number().min(0).max(1).nullable(), confidence: z.number().min(0).max(1).nullable(), evidence: z.array(evidence) }).strict()),
  privacy: z.object({ machine_local: z.literal(true), secrets_embedded: z.literal(false), export_requires_redaction_review: z.literal(true) }).strict(),
}).strict();

export type AgentExecutionProfile = z.infer<typeof agentExecutionProfileSchema>;
export type ExecutionTreatment = z.infer<typeof executionTreatmentSchema>;
export type AgentCard = z.infer<typeof agentCardSchema>;

export const parseAgentExecutionProfile = (value: unknown): AgentExecutionProfile => agentExecutionProfileSchema.parse(value);
export const parseExecutionTreatment = (value: unknown): ExecutionTreatment => executionTreatmentSchema.parse(value);
export const parseAgentCard = (value: unknown): AgentCard => agentCardSchema.parse(value);
