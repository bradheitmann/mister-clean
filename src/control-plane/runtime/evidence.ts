import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import * as z from "zod";

import type { DirectiveId, EvidenceRef, RepositorySubject, RunId } from "../contracts/primitives.js";
import type { DirectiveState, ManifestRevision } from "../contracts/wave-directive.js";
import { canonicalJson, type RuntimeBoundReceipt, sha256Bytes } from "./authority.js";
import type { EvidenceInput } from "./protocol.js";

const STATE_CLAIMS: Readonly<Partial<Record<DirectiveState, string>>> = Object.freeze({
  projected: "manifest_projected",
  copied: "projection_copied",
  queued: "route_admitted",
  delivered: "transport_delivered",
  accepted: "turn_accepted",
  running: "execution_started",
  completed: "agent_reported_completed",
  failed: "execution_failed",
  delivery_uncertain: "delivery_uncertain",
});

const identifier = z.string().min(1).max(512).regex(/^[^\u0000-\u001f\u007f]+$/);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const isoTimestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);

const directiveEvidenceSchema = z.object({
  record_type: z.literal("mister-clean.directive-state-evidence"),
  schema_version: z.literal("1.0"),
  state: z.enum(["projected", "copied", "queued", "delivered", "accepted", "running", "completed", "failed", "delivery_uncertain"]),
  directive_id: identifier,
  run_id: identifier,
  manifest_id: identifier,
  manifest_revision: z.number().int().positive(),
  manifest_sha256: sha256,
  repository_object_sha256: sha256,
  control_surface_id: identifier.nullable(),
  lane_id: identifier.nullable(),
  actor: identifier,
  claims: z.array(identifier).min(1).max(100),
  observed_at: isoTimestamp,
}).strict();

const receiptEvidenceSchema = z.object({
  record_type: z.literal("mister-clean.receipt-evidence"),
  schema_version: z.literal("1.0"),
  directive_id: identifier,
  run_id: identifier,
  receipt_id: identifier,
  manifest_id: identifier,
  manifest_revision: z.number().int().positive(),
  manifest_sha256: sha256,
  baseline_repository_object_sha256: sha256,
  output_repository_object_sha256: sha256,
  role: z.enum(["dev", "qa", "mister_clean", "holdout", "integrator"]),
  actor: identifier,
  claims: z.array(identifier).min(1).max(1_000),
  conclusion: z.literal("pass"),
  observed_at: isoTimestamp,
}).strict();

export interface DirectiveEvidenceVerificationRequest {
  readonly state: Exclude<DirectiveState, "recommended" | "verified">;
  readonly directive_id: DirectiveId;
  readonly run_id: RunId;
  readonly revision: ManifestRevision;
  readonly repository: RepositorySubject;
  readonly control_surface_id: string | null;
  readonly evidence: readonly EvidenceInput[];
}

export interface ReceiptEvidenceVerificationRequest {
  readonly directive_id: DirectiveId;
  readonly run_id: RunId;
  readonly revision: ManifestRevision;
  readonly receipt: RuntimeBoundReceipt;
}

export interface AuthorityEvidenceVerifier {
  readonly configured: boolean;
  verifyDirective(request: DirectiveEvidenceVerificationRequest): Promise<readonly EvidenceRef[]>;
  verifyReceipt(request: ReceiptEvidenceVerificationRequest): Promise<readonly EvidenceRef[]>;
}

export const denyAuthorityEvidence: AuthorityEvidenceVerifier = Object.freeze({
  configured: false,
  async verifyDirective(): Promise<readonly EvidenceRef[]> {
    throw new Error("No local evidence-verification authority is configured");
  },
  async verifyReceipt(): Promise<readonly EvidenceRef[]> {
    throw new Error("No local receipt-evidence authority is configured");
  },
});

export interface LocalAuthorityEvidenceOptions {
  readonly custody_roots: readonly string[];
  readonly actor_roots: Readonly<Record<string, string>>;
}

function within(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

interface LoadedEvidence {
  readonly value: unknown;
  readonly ref: EvidenceRef;
  readonly real_path: string;
}

/**
 * Concrete local verifier: every authority record must be a canonical regular
 * file beneath configured custody and actor roots, and its bytes must match the
 * declared digest before state-specific semantics are inspected.
 */
export class LocalAuthorityEvidenceVerifier implements AuthorityEvidenceVerifier {
  readonly configured = true;
  readonly #custodyRoots: readonly string[];
  readonly #actorRoots: Readonly<Record<string, string>>;

  constructor(options: LocalAuthorityEvidenceOptions) {
    if (options.custody_roots.length === 0 || options.custody_roots.some((root) => !isAbsolute(root))) {
      throw new Error("Local evidence custody roots must contain absolute paths");
    }
    if (Object.keys(options.actor_roots).length === 0 || Object.values(options.actor_roots).some((root) => !isAbsolute(root))) {
      throw new Error("Local evidence actor roots must bind at least one actor to an absolute path");
    }
    this.#custodyRoots = [...new Set(options.custody_roots.map((root) => resolve(root)))];
    this.#actorRoots = Object.freeze({ ...options.actor_roots });
  }

  async #load(input: EvidenceInput | EvidenceRef): Promise<LoadedEvidence> {
    const candidates = isAbsolute(input.path)
      ? [input.path]
      : this.#custodyRoots.map((root) => resolve(root, input.path));
    const matches: string[] = [];
    for (const candidate of candidates) {
      try {
        const actual = await realpath(candidate);
        const custodyMatches = await Promise.all(this.#custodyRoots.map(async (root) => within(await realpath(root), actual)));
        if (custodyMatches.some(Boolean)) matches.push(actual);
      } catch {
        // A missing or escaped candidate is not authority evidence.
      }
    }
    const unique = [...new Set(matches)];
    if (unique.length !== 1) throw new Error("Evidence path does not resolve to exactly one file in configured custody");
    const metadata = await stat(unique[0]!);
    if (!metadata.isFile()) throw new Error("Authority evidence must be a regular file");
    const bytes = await readFile(unique[0]!);
    if (sha256Bytes(bytes) !== input.sha256) throw new Error("Authority evidence digest does not match its bytes");
    const text = new TextDecoder().decode(bytes);
    let value: unknown;
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      throw new Error("Authority evidence is not valid JSON");
    }
    if (canonicalJson(value) !== text) throw new Error("Authority evidence is not canonical JSON");
    return {
      value,
      real_path: unique[0]!,
      ref: input.record_type === undefined || input.record_type === null
        ? { path: input.path, sha256: input.sha256 }
        : { path: input.path, sha256: input.sha256, record_type: input.record_type },
    };
  }

  async #assertActorCustody(actor: string, realPath: string): Promise<void> {
    const configured = this.#actorRoots[actor];
    if (configured === undefined) throw new Error("Evidence actor has no configured custody binding");
    const actorRoot = await realpath(configured);
    if (!within(actorRoot, realPath)) throw new Error("Evidence bytes are outside the declared actor custody root");
  }

  async verifyDirective(request: DirectiveEvidenceVerificationRequest): Promise<readonly EvidenceRef[]> {
    const requiredClaim = STATE_CLAIMS[request.state];
    if (requiredClaim === undefined || request.evidence.length === 0) throw new Error("Directive state has no verifiable evidence contract");
    const verified: EvidenceRef[] = [];
    for (const input of request.evidence) {
      if (input.record_type !== "mister-clean.directive-state-evidence") throw new Error("Directive evidence record_type is not state evidence");
      const loaded = await this.#load(input);
      const record = directiveEvidenceSchema.parse(loaded.value);
      if (
        record.state !== request.state
        || record.directive_id !== request.directive_id
        || record.run_id !== request.run_id
        || record.manifest_id !== request.revision.manifest_id
        || record.manifest_revision !== request.revision.revision
        || record.manifest_sha256 !== request.revision.manifest_sha256
        || record.repository_object_sha256 !== request.repository.repository_object_sha256
        || record.control_surface_id !== request.control_surface_id
        || !record.claims.includes(requiredClaim)
      ) {
        throw new Error("Directive evidence is not bound to the requested state, manifest, control surface, and repository object");
      }
      if (["accepted", "running", "completed"].includes(request.state)) {
        const lane = request.revision.canonical_manifest.lanes.find((candidate) => candidate.lane_id === record.lane_id);
        if (lane === undefined || lane.owner !== record.actor) throw new Error("Agent-state evidence is not bound to an assigned manifest lane owner");
      }
      await this.#assertActorCustody(record.actor, loaded.real_path);
      verified.push(loaded.ref);
    }
    return verified;
  }

  async verifyReceipt(request: ReceiptEvidenceVerificationRequest): Promise<readonly EvidenceRef[]> {
    const verified: EvidenceRef[] = [];
    const observedClaims = new Set<string>();
    for (const input of request.receipt.evidence) {
      if (input.record_type !== "mister-clean.receipt-evidence") throw new Error("Receipt evidence record_type is not receipt evidence");
      const loaded = await this.#load(input);
      const record = receiptEvidenceSchema.parse(loaded.value);
      if (
        record.directive_id !== request.directive_id
        || record.run_id !== request.run_id
        || record.receipt_id !== request.receipt.receipt_id
        || record.manifest_id !== request.revision.manifest_id
        || record.manifest_revision !== request.revision.revision
        || record.manifest_sha256 !== request.revision.manifest_sha256
        || record.baseline_repository_object_sha256 !== request.receipt.baseline_repository.repository_object_sha256
        || record.output_repository_object_sha256 !== request.receipt.output_repository.repository_object_sha256
        || record.role !== request.receipt.role
        || record.actor !== request.receipt.actor
      ) {
        throw new Error("Receipt evidence is not bound to the receipt, actor, manifest, baseline, and output object");
      }
      await this.#assertActorCustody(record.actor, loaded.real_path);
      for (const claim of record.claims) observedClaims.add(claim);
      verified.push(loaded.ref);
    }
    if (request.receipt.claims.some((claim) => !observedClaims.has(claim))) {
      throw new Error("Receipt claims are not covered by its verified evidence bytes");
    }
    return verified;
  }
}

export const AUTHORITY_EVIDENCE_RECORD_TYPES = Object.freeze({
  directive: "mister-clean.directive-state-evidence",
  receipt: "mister-clean.receipt-evidence",
} as const);

export type AuthorityEvidenceRecordType = z.infer<typeof directiveEvidenceSchema>["record_type"] | z.infer<typeof receiptEvidenceSchema>["record_type"];
