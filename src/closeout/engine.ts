import {
  type BundleValidationOptions,
  type BundleValidationResult,
  validateBundleFile,
} from "./bundle.js";
import {
  detectStack,
  generateManifest,
  generatePackageManifest,
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
import {
  auditSemanticRepository,
  type SemanticAuditOptions,
  type SemanticAuditResult,
} from "./semantic.js";
import { auditSemanticEvidencePackageV2 } from "./semantic-v2.js";
import {
  auditGitHubActionsRepository,
  type GitHubActionsAuditResult,
} from "./github-actions.js";
import {
  auditRepositoryBoundaries,
  type RepositoryBoundaryAuditResult,
} from "./repository-boundaries.js";
import { validateManifest, validateReport } from "./records.js";
import {
  beginAction,
  finishAction,
  type ActionBeginOptions,
  type ActionFinishOptions,
  type ActionLifecycleResult,
} from "./action-lifecycle.js";

export type CloseoutRecordKind = "manifest" | "report";

export interface CloseoutEngine {
  prepare(options: PrepareCloseoutOptions): Promise<PreparedCloseout>;
  beginAction(options: ActionBeginOptions): Promise<ActionLifecycleResult>;
  finishAction(options: ActionFinishOptions): Promise<ActionLifecycleResult>;
  validateRecord(kind: CloseoutRecordKind, data: unknown, allowPlaceholders?: boolean): readonly string[];
  validateBundle(path: string, options?: BundleValidationOptions): Promise<BundleValidationResult>;
  detectStack(root: string): Promise<StackDetectionResult>;
  auditPlanning(root: string): Promise<PlanningAuditResult>;
  auditSemantic(root: string, options?: SemanticAuditOptions): Promise<SemanticAuditResult>;
  auditGitHubActions(root: string): Promise<GitHubActionsAuditResult>;
  auditRepositoryBoundaries(root: string): Promise<RepositoryBoundaryAuditResult>;
  scanPublicSafety(root: string, denylistPath?: string): Promise<PublicSafetyScanResult>;
  generateManifest(root: string): Promise<ManifestResult>;
  generatePackageManifest(root: string): Promise<ManifestResult>;
}

/**
 * The single application boundary used by the CLI. Policy stays in the pure
 * validators; filesystem and Git effects remain behind their Node adapters.
 */
export const nodeCloseoutEngine: CloseoutEngine = {
  prepare: prepareCloseout,
  beginAction,
  finishAction,
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
  async auditSemantic(root, options) {
    if (options?.evidencePackagePath !== undefined) {
      if (options.trustPolicyPath === undefined) throw new Error("semantic v2 evidence package requires trustPolicyPath");
      if (options.manifestPath !== undefined || options.execute) throw new Error("semantic v2 evidence package is mutually exclusive with legacy manifest execution");
      return auditSemanticEvidencePackageV2(root, options.evidencePackagePath, options.trustPolicyPath);
    }
    return auditSemanticRepository(root, options);
  },
  async auditGitHubActions(root) {
    return auditGitHubActionsRepository(root);
  },
  async auditRepositoryBoundaries(root) {
    return auditRepositoryBoundaries(root);
  },
  async scanPublicSafety(root, denylistPath) {
    return scanPublicSafety(root, await loadDenylist(denylistPath));
  },
  generateManifest,
  generatePackageManifest,
};
