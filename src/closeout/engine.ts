import {
  type BundleValidationOptions,
  type BundleValidationResult,
  validateBundleFile,
} from "./bundle.js";
import {
  detectStack,
  generateManifest,
  loadDenylist,
  scanPublicSafety,
  type ManifestResult,
  type PublicSafetyScanResult,
  type StackDetectionResult,
} from "./inspection.js";
import {
  prepareCloseout,
  type PrepareCloseoutOptions,
  type PreparedCloseout,
} from "./prepare.js";
import {
  auditPlanningRepository,
  type PlanningAuditResult,
} from "./planning.js";
import { validateManifest, validateReport } from "./records.js";

export type CloseoutRecordKind = "manifest" | "report";

export interface CloseoutEngine {
  prepare(options: PrepareCloseoutOptions): PreparedCloseout;
  validateRecord(kind: CloseoutRecordKind, data: unknown, allowPlaceholders?: boolean): readonly string[];
  validateBundle(path: string, options?: BundleValidationOptions): Promise<BundleValidationResult>;
  detectStack(root: string): Promise<StackDetectionResult>;
  auditPlanning(root: string): Promise<PlanningAuditResult>;
  scanPublicSafety(root: string, denylistPath?: string): Promise<PublicSafetyScanResult>;
  generateManifest(root: string): Promise<ManifestResult>;
}

/**
 * The single application boundary used by the CLI. Policy stays in the pure
 * validators; filesystem and Git effects remain behind their Node adapters.
 */
export const nodeCloseoutEngine: CloseoutEngine = {
  prepare: prepareCloseout,
  validateRecord(kind, data, allowPlaceholders = false) {
    return kind === "report"
      ? validateReport(data, allowPlaceholders)
      : validateManifest(data, allowPlaceholders);
  },
  validateBundle: validateBundleFile,
  detectStack,
  async auditPlanning(root) {
    return auditPlanningRepository(root);
  },
  async scanPublicSafety(root, denylistPath) {
    return scanPublicSafety(root, await loadDenylist(denylistPath));
  },
  generateManifest,
};
