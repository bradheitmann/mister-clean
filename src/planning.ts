import { execFileSync } from "node:child_process";
import { realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isSourceDevelopmentEntrypoint, rootForModule, verifyReleaseAttestation, RuntimeAttestationError } from "./attestation.js";
import { auditPlanningArtifacts, type PlanningAuditResult, type PlanningSource } from "./closeout/planning-analysis/policy.js";

const packageRoot = await rootForModule(import.meta.url);
const sourceDevelopment = process.env.MISTER_CLEAN_SOURCE_DEVELOPMENT === "1"
  && isSourceDevelopmentEntrypoint(packageRoot, import.meta.url);
if (sourceDevelopment) {
  if (!existsSync(join(packageRoot, ".git"))
    || await realpath(execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: packageRoot, encoding: "utf8" }).trim()) !== await realpath(packageRoot)) {
    throw new Error("source-development planning requires the verified Git package root");
  }
} else {
  // This read-only entrypoint verifies its own installed package. It does not
  // mint runtime authority, inspect a target repository, or execute commands.
  const attestation = await verifyReleaseAttestation(packageRoot, { exactSurface: true });
  if (attestation.status !== "pass") throw new RuntimeAttestationError(attestation);
}

export type { PlanningSource, PlanningFinding, PlanningFindingCode } from "./closeout/planning-analysis/policy.js";

export interface PlanningAssessment {
  readonly scope: "supplied_artifacts";
  readonly repository_verification: "not_performed";
  readonly excluded_checks: readonly ["repository_discovery", "live_current_projection", "git_ancestry", "repository_closeout"];
  readonly analysis: PlanningAuditResult;
}

const SOURCE_KEYS = new Set(["path", "content", "classificationRationale", "compoundEnvelope", "declaredClass"]);

/** Assess supplied document contents without target filesystem, process, SQLite,
 * transport, or CLI activation. A passing analysis is never repository CLEAN.
 * Full repository audits continue to discover inputs and verify live evidence. */
export function assessPlanningSources(sources: readonly PlanningSource[]): PlanningAssessment {
  if (!Array.isArray(sources)) throw new TypeError("planning sources must be an array");
  const inputs = sources.map((source, index): PlanningSource => {
    if (!source || typeof source !== "object"
      || (Object.getPrototypeOf(source) !== Object.prototype && Object.getPrototypeOf(source) !== null)) {
      throw new TypeError(`planning source ${index} must be a plain data record`);
    }
    for (const key of Reflect.ownKeys(source)) {
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (typeof key !== "string" || !SOURCE_KEYS.has(key) || !descriptor || !("value" in descriptor)
        || typeof descriptor.value !== "string") throw new TypeError(`planning source ${index} has an unsupported data field`);
    }
    if (!Object.hasOwn(source, "path") || !Object.hasOwn(source, "content")) {
      throw new TypeError(`planning source ${index} requires path and content`);
    }
    // Copy only own data fields; inherited policy/authority options cannot enter.
    return Object.fromEntries(Object.getOwnPropertyNames(source).map((key) => [key, Object.getOwnPropertyDescriptor(source, key)!.value])) as unknown as PlanningSource;
  });
  return {
    scope: "supplied_artifacts",
    repository_verification: "not_performed",
    excluded_checks: ["repository_discovery", "live_current_projection", "git_ancestry", "repository_closeout"],
    analysis: auditPlanningArtifacts(inputs),
  };
}
