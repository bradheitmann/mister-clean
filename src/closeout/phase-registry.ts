/**
 * The detector families Mister Clean knows, as one data table.
 *
 * Every list of family ids in the product is derived from `PHASES`: detector
 * registry 6 (`CLOSEOUT_DETECTORS`), the receipt families, the families a legacy
 * bundle baseline may hold, the command line's audit kinds and its table of
 * bundle result files, and the order in which a live revalidation reports the
 * families. Each place that behaves differently per family keeps that
 * behaviour beside the code that owns it, as a record typed
 * `satisfies Record<PhaseId, ...>`: a family added here without an entry
 * there does not compile.
 *
 * Order matters. The closeout families, in this order, are detector registry
 * 6, whose digest is frozen in detector-coverage.ts; the same order is the
 * order of `required_detector_ids` and of the executions in every bundle.
 * Moving or editing a closeout entry therefore needs a new registry version.
 *
 * Detector registries 1 to 5 are not derived from this table. They are frozen
 * data in detector-coverage.ts, kept so that older bundles validate against
 * the exact definitions they were written under.
 *
 * This module is data only and imports nothing: the family modules import it.
 */
export const PHASES = [
  {
    id: "planning_graph",
    auditKind: "planning",
    closeout: {
      scope: ".",
      command: "mister-clean audit planning . --json",
      detector: "mister-clean/planning_graph@2",
      bundleFile: "planning-audit.json",
    },
  },
  {
    id: "public_safety",
    auditKind: "public-safety",
    closeout: {
      scope: "tracked_shippable",
      command: "mister-clean audit public-safety . --tracked --json",
      detector: "mister-clean/public_safety@1",
      bundleFile: "public-safety-audit.json",
    },
  },
  {
    id: "github_actions",
    auditKind: "github-actions",
    closeout: {
      scope: ".",
      command: "mister-clean audit github-actions . --json",
      detector: "mister-clean/github_actions@3",
      bundleFile: "github-actions-audit.json",
    },
  },
  // Audit-only: it writes receipts but takes no part in a closeout bundle.
  {
    id: "repository_boundaries",
    auditKind: "repository-boundaries",
    closeout: null,
  },
  {
    id: "semantic_boundary",
    auditKind: "semantic",
    closeout: {
      scope: ".",
      command: "mister-clean audit semantic . --json",
      detector: "mister-clean/semantic_boundary@1",
      bundleFile: "semantic-audit.json",
    },
  },
  // Always required since registry 6; a repository without a policy yields a
  // not_applicable result with zero fingerprints, never a missing execution.
  {
    id: "language_policy",
    auditKind: "language-policy",
    closeout: {
      scope: "tracked_shippable",
      command: "mister-clean audit language-policy . --json",
      detector: "mister-clean/language_policy@1",
      bundleFile: "language-policy-audit.json",
    },
  },
] as const;

export type Phase = (typeof PHASES)[number];
/** Every family id. */
export type PhaseId = Phase["id"];
/** A family that takes part in a closeout bundle. */
export type CloseoutPhase = Extract<Phase, { readonly closeout: object }>;
export type CloseoutPhaseId = CloseoutPhase["id"];
/** The word that selects a family on the command line: `mister-clean audit <kind>`. */
export type AuditKind = Phase["auditKind"];

/** Every family id, in registry order. */
export const PHASE_IDS: readonly PhaseId[] = PHASES.map((phase) => phase.id);

/** The closeout families, in registry order: detector registry 6. */
export const CLOSEOUT_PHASES: readonly CloseoutPhase[] = PHASES.filter((phase): phase is CloseoutPhase => phase.closeout !== null);

export const CLOSEOUT_PHASE_IDS: readonly CloseoutPhaseId[] = CLOSEOUT_PHASES.map((phase) => phase.id);

/** Every audit kind, in registry order. */
export const AUDIT_KINDS: readonly AuditKind[] = PHASES.map((phase) => phase.auditKind);

/** The result file each closeout family writes into a bundle, in registry order. */
export const CLOSEOUT_BUNDLE_FILES: readonly { readonly family: CloseoutPhaseId; readonly file: string }[] = CLOSEOUT_PHASES
  .map((phase) => ({ family: phase.id, file: phase.closeout.bundleFile }));

export function phaseById(id: string): Phase | undefined {
  return PHASES.find((phase) => phase.id === id);
}

export function phaseByAuditKind(kind: string): Phase | undefined {
  return PHASES.find((phase) => phase.auditKind === kind);
}

/** True for a registered family id; an inherited object key such as `constructor` is not one. */
export function isPhaseId(id: string): id is PhaseId {
  return phaseById(id) !== undefined;
}
