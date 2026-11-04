/**
 * Ratification of retirements: shared by prepare, which mints the decision
 * debts, and the bundle validator, which projects the same set. No file system
 * access here, so the validator stays portable.
 */
import { array, object, type JsonObject } from "./bundle-runtime.js";
import type { CanonicalRootProjection } from "./bundle-detector-evidence.js";
import { canonicalObservationId, canonicalRootDebtKey } from "./regression-accounting.js";

/**
 * A retirement record is a repository file that any agent can commit, and the
 * ruling it cites is too. Nothing yet proves an owner ratified it (O-RET-2), so
 * prepare never presents a retirement as an operator's own act:
 *
 * - each per-debt ruling record it writes declares itself tool-minted
 *   (`minted_by`) and binds the retirement record's bytes (`source`);
 * - each applied retirement record adds one open root debt under this
 *   normalizer, a decision the owner must take, so the run cannot be CLEAN
 *   while the retirement is unratified.
 */
export const RETIREMENT_RATIFICATION_NORMALIZER = "mister-clean/retirement-ratification@1";
export const RETIREMENT_RULING_MINTED_BY = "mister-clean prepare";
export const RETIREMENT_RATIFICATION_NOTE = "retirement ratification: not verifiable (O-RET-2) — owner decision required";

export interface RetirementRatification {
  readonly record_path: string;
  /** SHA-256 of the retirement record's bytes, as prepare read them. */
  readonly record_sha256: string;
  /** Sorted retired roots of this record that matched at least one debt. */
  readonly roots: readonly string[];
  readonly debt_ids: readonly string[];
}

/**
 * One ratification decision per applied retirement record: the applications
 * (one per record and root) grouped by record path. Prepare mints the debts
 * from this and the bundle validator projects the same set, so the two cannot
 * drift.
 */
export function retirementRatifications(applications: readonly unknown[]): RetirementRatification[] {
  const grouped = new Map<string, { record_sha256: string; roots: Set<string>; debt_ids: Set<string> }>();
  for (const raw of applications) {
    const application = object(raw);
    if (!application || typeof application.record_path !== "string") continue;
    const group = grouped.get(application.record_path)
      ?? { record_sha256: typeof application.record_sha256 === "string" ? application.record_sha256 : "", roots: new Set<string>(), debt_ids: new Set<string>() };
    // Applications of one record that disagree on its digest cannot both be true.
    if (group.record_sha256 !== application.record_sha256) group.record_sha256 = "";
    if (typeof application.root === "string") group.roots.add(application.root);
    for (const id of array(application.debt_ids) ?? []) if (typeof id === "string") group.debt_ids.add(id);
    grouped.set(application.record_path, group);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([record_path, group]) => ({ record_path, record_sha256: group.record_sha256, roots: [...group.roots].sort(), debt_ids: [...group.debt_ids].sort() }));
}

export function retirementRatificationCauseKey(ratification: Pick<RetirementRatification, "record_path" | "record_sha256">): JsonObject {
  return { record_path: ratification.record_path, record_sha256: ratification.record_sha256 };
}

export function retirementRatificationObservationId(recordSha256: string): string {
  return canonicalObservationId({ source_id: RETIREMENT_RATIFICATION_NORMALIZER, source_native_fingerprint: recordSha256 });
}

/**
 * The root debts a bundle must carry for its retirements, derived only from
 * `retirement_applications`: one open decision per applied record. The bundle
 * validator adds these to its evidence-derived roots, so a report that drops or
 * re-keys a ratification debt no longer matches its own evidence.
 */
export function retirementRatificationProjections(applications: readonly unknown[], repoId: string): CanonicalRootProjection[] {
  return retirementRatifications(applications)
    .filter((ratification) => /^[0-9a-f]{64}$/u.test(ratification.record_sha256))
    .map((ratification) => {
      const causeKey = retirementRatificationCauseKey(ratification);
      return {
        debt_key: canonicalRootDebtKey({ repo_id: repoId, normalizer: RETIREMENT_RATIFICATION_NORMALIZER, cause_key: causeKey as never }),
        normalizer: RETIREMENT_RATIFICATION_NORMALIZER,
        cause_key: causeKey,
        observation_ids: [retirementRatificationObservationId(ratification.record_sha256)],
      };
    });
}
