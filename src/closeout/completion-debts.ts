/**
 * The completion-debt reducer: one pure function from the detector results of one
 * closeout run, and the committed rulings that change how they read, to its debts.
 *
 * `reduceCompletionDebts` applies the public-safety exemptions to the public-safety
 * findings, builds the root debts of each family, concatenates them in
 * `COMPLETION_DEBT_ORDER`, and applies the retirements, in that order. It reads no file
 * and writes none: prepare.ts reads the rulings, stages and binds them, writes the
 * bundle, and adds the retirement-ratification debts.
 *
 * Each closeout family's root-debt builder is an entry of `ROOT_DEBT_BUILDERS`, keyed by
 * the phase registry's closeout ids, so a family added to the registry without a builder
 * does not compile. Native gates are not a registry family and have their own builder.
 */
import { createHash } from "node:crypto";

import type { JsonObject } from "./bundle-runtime.js";
import {
  detectorById,
  planningFindingFingerprint,
  semanticFindingFingerprint,
} from "./detector-coverage.js";
import type { GitHubActionsAuditResult } from "./github-actions.js";
import type { PublicSafetyFinding, PublicSafetyScanResult } from "./inspection.js";
import type { LanguagePolicyAuditResult } from "./language-policy.js";
import {
  nativeGateFailureObservations,
  type NativeGateCoverage,
  type NativeGateDiscovery,
} from "./native-gates.js";
import type { CloseoutPhaseId } from "./phase-registry.js";
import type { PlanningAuditResult } from "./planning.js";
import {
  canonicalObservationId,
  canonicalRootDebtKey,
  type CanonicalJsonValue,
  type RootDebtAccountingRow,
} from "./regression-accounting.js";
import {
  applyPublicSafetyExemptions,
  applyRetirements,
  type PublicSafetyExemptionEntry,
  type PublicSafetyExemptionOutcome,
  type RetirementApplication,
  type RetirementRecord,
} from "./retirements.js";
import type { SemanticAuditResult } from "./semantic.js";

/** A family's debts in the report, or the native gates', which are not a registry family. */
export type CompletionDebtSource = CloseoutPhaseId | "native_gate";

/**
 * The order in which the families' root debts are concatenated: the key order of this
 * record. It is prepare's order at main 803fd4c and differs from the phase registry's
 * order (which puts semantic_boundary before language_policy). Changing it changes the
 * bytes of every closeout report that holds debts of both families.
 */
const COMPLETION_DEBT_SOURCES = {
  planning_graph: true,
  public_safety: true,
  github_actions: true,
  language_policy: true,
  semantic_boundary: true,
  native_gate: true,
} as const satisfies Record<CompletionDebtSource, true>;

export const COMPLETION_DEBT_ORDER: readonly CompletionDebtSource[] = Object.keys(COMPLETION_DEBT_SOURCES) as CompletionDebtSource[];

interface EvidenceRef {
  readonly path: string;
  readonly sha256: string;
}

/** What one closeout run's detectors found, and how prepare cites it. */
export interface CompletionDebtInput {
  readonly repoId: string;
  /** The run's formatted observation time. */
  readonly now: string;
  readonly baselineRepositoryObject: { readonly sha256: string };
  readonly planningAudit: Pick<PlanningAuditResult, "root_debts">;
  readonly planningAuditRef: EvidenceRef;
  /** Absent when the run policy did not require the public-safety scan. */
  readonly publicSafetyAudit?: Pick<PublicSafetyScanResult, "findings" | "unassessed"> | undefined;
  readonly publicSafetyAuditRef?: EvidenceRef | undefined;
  readonly publicSafetyCommand: string;
  readonly githubActionsAudit: Pick<GitHubActionsAuditResult, "findings">;
  readonly githubActionsAuditRef: EvidenceRef;
  readonly languagePolicyAudit: Pick<LanguagePolicyAuditResult, "findings">;
  readonly languagePolicyAuditRef: EvidenceRef;
  readonly semanticAudit: Pick<SemanticAuditResult, "findings" | "candidate_set_sha256">;
  readonly semanticAuditRef: EvidenceRef;
  readonly semanticCommand: string;
  readonly nativeGateDiscovery: NativeGateDiscovery;
  readonly nativeGateCoverage: NativeGateCoverage;
  /** The bundle's native-gate-validation.json, which every native-gate debt cites. */
  readonly nativeGateValidationRef: EvidenceRef;
}

/** The committed rulings, as prepare read them from the repository. */
export interface CompletionDebtDispositions {
  readonly publicSafetyExemptions: readonly PublicSafetyExemptionEntry[];
  readonly retirements: readonly RetirementRecord[];
}

export interface CompletionDebtReduction {
  /** Each source's root debts, before retirements. */
  readonly rootDebts: Readonly<Record<CompletionDebtSource, readonly RootDebtAccountingRow[]>>;
  /** Every root debt, in `COMPLETION_DEBT_ORDER`, before retirements. */
  readonly completionDebts: readonly RootDebtAccountingRow[];
  /** The public-safety findings an exemption took out of the census. */
  readonly exempted: PublicSafetyExemptionOutcome<PublicSafetyFinding>["exempted"];
  /** The debts after retirements, and the retirement applications. */
  readonly retirementOutcome: { readonly debts: JsonObject[]; readonly applications: RetirementApplication[] };
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
function evidenceLabel(value: string): string {
  return value.replaceAll("<", "‹").replaceAll(">", "›");
}
export function nativeGateCommand(executable: string, argv: readonly string[], cwd: string): string {
  const args = argv.map((value) => JSON.stringify(value)).join(" ");
  return `${executable}${args ? ` ${args}` : ""} (cwd ${cwd})`;
}
function observationId(sourceId: string, nativeFingerprint: string): string {
  return canonicalObservationId({
    source_id: sourceId,
    source_native_fingerprint: nativeFingerprint,
  });
}
export function baselineDebt<T extends JsonObject & Pick<RootDebtAccountingRow, "state" | "disposition">>(
  repoId: string,
  row: T,
  normalizer: string,
  causeKey: CanonicalJsonValue,
  observationIds: readonly string[],
): T & RootDebtAccountingRow {
  return {
    ...row,
    debt_key: canonicalRootDebtKey({ repo_id: repoId, normalizer, cause_key: causeKey }),
    normalizer,
    cause_key: causeKey,
    observation_ids: [...new Set(observationIds)].sort(),
    origin: { class: "baseline" },
  } as T & RootDebtAccountingRow;
}

/** The detector id a family's debts cite, from the phase registry; a family without one cannot be built. */
function registeredDetector(family: CloseoutPhaseId, label: string): string {
  const detector = detectorById(family)?.detector;
  if (!detector) throw new Error(`${label} detector is absent from the canonical registry`);
  return detector;
}

type RootDebtBuilder = (
  input: CompletionDebtInput,
  publicSafetyExemptions: PublicSafetyExemptionOutcome<PublicSafetyFinding>,
) => readonly RootDebtAccountingRow[];

/** One root-debt builder per closeout family; the bodies are prepare.ts's at 803fd4c. */
const ROOT_DEBT_BUILDERS = {
  planning_graph: (input) => {
    const { repoId, now, planningAudit, planningAuditRef } = input;
    const planningDetector = registeredDetector("planning_graph", "planning");
    const validationDebtClasses = new Set([
      "acceptance_cascade_unexecuted",
      "acceptance_gate_unknown",
      "completed_parent_unexecuted_acceptance",
    ]);
    const planningDebts = planningAudit.root_debts.map((debt) => {
      const nativeFingerprints = debt.raw_finding_ids.map(planningFindingFingerprint).sort();
      const causeKey = {
        detector_family: "planning_graph",
        source_cause_key: debt.cause_key,
        repair_boundary: debt.repair_boundary,
      } as const;
      return baselineDebt(repoId, {
        id: debt.id.replace("ROOT-", "DEBT-"),
        class: debt.class,
        observation_count: debt.observation_count,
        raw_finding_ids: debt.raw_finding_ids,
        detector_finding_fingerprints: nativeFingerprints,
        affected_paths: debt.affected_paths,
        repair_boundary: debt.repair_boundary,
        causal_evidence: debt.causal_evidence,
        procedure: `Reconcile ${debt.affected_projection_field} across ${evidenceLabel(debt.repair_boundary)}`,
        state: "open",
        disposition: debt.class.split("+").some((code) => validationDebtClasses.has(code))
          ? "autonomously_validate"
          : "autonomously_repair",
        evidence: [{
          kind: "planning_census",
          object: debt.cause_key,
          command: "mister-clean audit planning . --json",
          result: `${debt.observation_count} raw observations: ${debt.class}`,
          observed_at: now,
          evidence_ref: planningAuditRef,
        }],
      }, "mister-clean/planning-root@1", causeKey, nativeFingerprints.map((fingerprint) => (
        observationId(planningDetector, fingerprint)
      )));
    });
    return planningDebts;
  },
  public_safety: (input, publicSafetyExemptions) => {
    const { repoId, now, baselineRepositoryObject, publicSafetyAudit, publicSafetyAuditRef, publicSafetyCommand } = input;
    const publicSafetyDetector = registeredDetector("public_safety", "public-safety");
    const publicSafetyDebts = publicSafetyExemptions.findings.map((finding) => baselineDebt(repoId, {
      id: `DEBT-PUBLIC-SAFETY-${finding.fingerprint.slice(0, 16).toUpperCase()}`,
      class: `public_safety_${finding.rule}`,
      observation_count: 1,
      detector_finding_fingerprints: [finding.fingerprint],
      affected_paths: [finding.path],
      repair_boundary: `file:${finding.path}:${String(finding.line)}`,
      procedure: `Remove or remediate the ${finding.rule} public-safety finding, then rerun the redacted public-safety audit`,
      state: "open",
      disposition: "autonomously_repair",
      evidence: [{
        kind: "public_safety_scan",
        object: baselineRepositoryObject.sha256,
        command: publicSafetyCommand,
        result: `public-safety fingerprint ${finding.fingerprint}`,
        observed_at: now,
        evidence_ref: publicSafetyAuditRef,
      }],
    }, "mister-clean/public-safety-root@1", {
      detector_family: "public_safety",
      rule: finding.rule,
      path: finding.path,
      line: finding.line,
    }, [observationId(publicSafetyDetector, finding.fingerprint)]));
    const publicSafetyUnassessedDebts = (publicSafetyAudit?.unassessed ?? []).map((finding) => baselineDebt(repoId, {
      id: `DEBT-PUBLIC-SAFETY-UNASSESSED-${finding.fingerprint.slice(0, 16).toUpperCase()}`,
      class: `public_safety_unassessed_${finding.reason}`,
      observation_count: 1,
      detector_finding_fingerprints: [finding.fingerprint],
      affected_paths: [finding.path],
      repair_boundary: `file:${finding.path}`,
      procedure: `Make ${finding.path} safely text-assessable or explicitly remove it from the tracked shippable surface, then rerun public-safety inspection`,
      state: "open",
      disposition: "autonomously_repair",
      evidence: [{
        kind: "public_safety_scan",
        object: baselineRepositoryObject.sha256,
        command: publicSafetyCommand,
        result: `unassessed ${finding.reason} fingerprint ${finding.fingerprint}`,
        observed_at: now,
        evidence_ref: publicSafetyAuditRef,
      }],
    }, "mister-clean/public-safety-root@1", {
      detector_family: "public_safety",
      reason: finding.reason,
      path: finding.path,
    }, [observationId(publicSafetyDetector, finding.fingerprint)]));
    const publicSafetyRootDebts = [...publicSafetyDebts, ...publicSafetyUnassessedDebts];
    return publicSafetyRootDebts;
  },
  github_actions: (input) => {
    const { repoId, now, baselineRepositoryObject, githubActionsAudit, githubActionsAuditRef } = input;
    const githubActionsCommand = "mister-clean audit github-actions . --json";
    const githubActionsDetector = registeredDetector("github_actions", "GitHub Actions");
    const githubActionGroups = new Map<string, typeof githubActionsAudit.findings>();
    for (const finding of githubActionsAudit.findings) {
      const key = `${finding.path}\0${finding.rule}`;
      githubActionGroups.set(key, [...(githubActionGroups.get(key) ?? []), finding]);
    }
    const githubActionsRootDebts = [...githubActionGroups.entries()].map(([key, findings]) => {
      const first = findings[0];
      if (!first) throw new Error(`empty GitHub Actions finding group: ${key}`);
      const fingerprints = findings.map((finding) => finding.fingerprint).sort();
      return baselineDebt(repoId, {
        id: `DEBT-GITHUB-ACTIONS-${sha256(Buffer.from(key, "utf8")).slice(0, 16).toUpperCase()}`,
        class: `github_actions_${first.rule}`,
        severity: first.severity,
        observation_count: findings.length,
        detector_finding_fingerprints: fingerprints,
        affected_paths: [first.path],
        affected_refs: unique(findings.flatMap((finding) => finding.refs)),
        repair_boundary: `path:${first.path}`,
        procedure: `Repair ${first.rule.replaceAll("_", " ")} as one fail-closed workflow invariant, add a negative control, then rerun the GitHub Actions audit`,
        state: "open",
        disposition: "autonomously_repair",
        evidence: [{
          kind: "gate_result",
          object: baselineRepositoryObject.sha256,
          command: githubActionsCommand,
          result: `${findings.length} observation(s): ${first.detail}`,
          observed_at: now,
          evidence_ref: githubActionsAuditRef,
        }],
      }, "mister-clean/github-actions-root@1", {
        detector_family: "github_actions",
        path: first.path,
        rule: first.rule,
      }, fingerprints.map((fingerprint) => observationId(githubActionsDetector, fingerprint)));
    });
    return githubActionsRootDebts;
  },
  language_policy: (input) => {
    const { repoId, now, baselineRepositoryObject, languagePolicyAudit, languagePolicyAuditRef } = input;
    const languagePolicyCommand = "mister-clean audit language-policy . --json";
    const languagePolicyDetector = registeredDetector("language_policy", "language-policy");
    const languagePolicyRootDebts = languagePolicyAudit.findings.map((finding) => baselineDebt(repoId, {
      id: `DEBT-LANGUAGE-POLICY-${finding.fingerprint.slice(0, 16).toUpperCase()}`,
      class: `language_policy_${finding.rule}`,
      observation_count: 1,
      detector_finding_fingerprints: [finding.fingerprint],
      affected_paths: [finding.path],
      repair_boundary: `file:${finding.path}`,
      procedure: `Port ${finding.path} out of the forbidden ${finding.extension} language declared in .mister-clean/language-policy.json (or have the owner allow it), then rerun the language-policy audit`,
      state: "open",
      disposition: "autonomously_repair",
      evidence: [{
        kind: "gate_result",
        object: baselineRepositoryObject.sha256,
        command: languagePolicyCommand,
        result: `forbidden_language ${finding.extension}: ${finding.path}`,
        observed_at: now,
        evidence_ref: languagePolicyAuditRef,
      }],
    }, "mister-clean/language-policy-root@1", {
      detector_family: "language_policy",
      path: finding.path,
      extension: finding.extension,
    }, [observationId(languagePolicyDetector, finding.fingerprint)]));
    return languagePolicyRootDebts;
  },
  semantic_boundary: (input) => {
    const { repoId, now, baselineRepositoryObject, semanticAudit, semanticAuditRef, semanticCommand } = input;
    const semanticDetector = registeredDetector("semantic_boundary", "semantic");
    const unassignedSemanticFindings = semanticAudit.findings
      .filter((finding) => finding.code === "semantic_probe_unassigned");
    const semanticDebts = semanticAudit.findings
      .filter((finding) => finding.code !== "semantic_probe_unassigned")
      .map((finding) => baselineDebt(repoId, {
      id: `DEBT-SEMANTIC-${sha256(Buffer.from(`${finding.candidate_id}\0${finding.code}\0${finding.refs.join("\0")}\0${finding.detail.replaceAll(/\s+/g, " ")}`, "utf8")).slice(0, 16).toUpperCase()}`,
      class: finding.code,
      observation_count: 1,
      detector_finding_fingerprints: [semanticFindingFingerprint(finding.candidate_id, finding.code)],
      affected_paths: unique(finding.refs.map((ref) => ref.split("#line-", 1)[0] ?? ref)),
      repair_boundary: `candidate:${finding.candidate_id}`,
      procedure: finding.classification === "confirmed_product_defect"
        ? `Repair ${finding.kind.replaceAll("_", " ")} and rerun its bound semantic probe`
        : finding.classification === "operate_time_pending"
          ? `Execute and record the owned operate-time proof for ${finding.candidate_id}`
          : `Bind and execute complete adversarial coverage for ${finding.candidate_id}`,
      state: "open",
      disposition: finding.classification === "confirmed_product_defect"
        ? "autonomously_repair"
        : finding.classification === "operate_time_pending"
          ? "decision_or_coordination_required"
          : "autonomously_validate",
      evidence: [{
        kind: "gate_result",
        object: baselineRepositoryObject.sha256,
        command: semanticCommand,
        result: `${finding.code}: ${finding.detail}`,
        observed_at: now,
        evidence_ref: semanticAuditRef,
      }],
    }, "mister-clean/semantic-root@1", {
      detector_family: "semantic_boundary",
      candidate_id: finding.candidate_id,
      code: finding.code,
    }, [observationId(
      semanticDetector,
      semanticFindingFingerprint(finding.candidate_id, finding.code),
    )]));
    if (unassignedSemanticFindings.length > 0) {
      const fingerprints = unassignedSemanticFindings
        .map((finding) => semanticFindingFingerprint(finding.candidate_id, finding.code))
        .sort();
      semanticDebts.push(baselineDebt(repoId, {
        id: `DEBT-SEMANTIC-SET-${semanticAudit.candidate_set_sha256.slice(0, 16).toUpperCase()}`,
        class: "semantic_probe_set_unassigned",
        observation_count: unassignedSemanticFindings.length,
        detector_finding_fingerprints: fingerprints,
        affected_paths: unique(unassignedSemanticFindings.flatMap((finding) => (
          finding.refs.map((ref) => ref.split("#line-", 1)[0] ?? ref)
        ))),
        repair_boundary: `probe-set:${semanticAudit.candidate_set_sha256}`,
        procedure: `Triage the ${unassignedSemanticFindings.length} semantic candidates once, bind one complete manifest to candidate set ${semanticAudit.candidate_set_sha256}, then execute or explicitly dispose each candidate`,
        state: "open",
        disposition: "autonomously_validate",
        evidence: [{
          kind: "gate_result",
          object: baselineRepositoryObject.sha256,
          command: semanticCommand,
          result: `${unassignedSemanticFindings.length} unassigned candidates share one missing-manifest root cause`,
          observed_at: now,
          evidence_ref: semanticAuditRef,
        }],
      }, "mister-clean/semantic-candidate-set@1", {
        detector_family: "semantic_boundary",
        candidate_set_sha256: semanticAudit.candidate_set_sha256,
        code: "semantic_probe_unassigned",
      }, fingerprints.map((fingerprint) => observationId(semanticDetector, fingerprint))) as unknown as (typeof semanticDebts)[number]);
    }
    return semanticDebts;
  },
} satisfies Record<CloseoutPhaseId, RootDebtBuilder>;

/** Native gates are not a registry family: their root debts have their own builder. */
function nativeGateRootDebts(input: CompletionDebtInput): readonly RootDebtAccountingRow[] {
  const { repoId, now, baselineRepositoryObject, nativeGateDiscovery, nativeGateCoverage, nativeGateValidationRef } = input;
  const nativeGateDebts = nativeGateFailureObservations(nativeGateDiscovery, nativeGateCoverage).map((projection) => {
    const { gate, execution } = projection;
    const failure = gate.disposition === "absent"
      ? `required native gate is absent (${gate.basis})`
      : `native gate ended ${execution?.state ?? "without execution"}: ${execution?.failure_reason ?? "no passing evidence"}`;
    return baselineDebt(repoId, {
      id: `DEBT-NATIVE-GATE-${projection.source_native_fingerprint.slice(0, 16).toUpperCase()}`,
      class: gate.disposition === "absent" ? "native_gate_absent" : `native_gate_${execution?.state ?? "unexecuted"}`,
      observation_count: 1,
      affected_paths: gate.source_refs.map((ref) => ref.path),
      repair_boundary: `gate:${gate.id}`,
      procedure: gate.disposition === "absent"
        ? `Restore a safe repository-native ${gate.kind} gate for ${gate.id}, then rerun closeout`
        : `Repair ${gate.id} and rerun the exact repository-native gate on an unchanged repository object`,
      state: "open",
      disposition: "autonomously_repair",
      evidence: [{
        kind: "gate_result",
        object: baselineRepositoryObject.sha256,
        command: execution
          ? nativeGateCommand(execution.command.executable, execution.command.argv, execution.command.cwd)
          : "mister-clean native gate discovery",
        result: failure,
        observed_at: execution?.finished_at ?? now,
        evidence_ref: {
          path: nativeGateValidationRef.path,
          sha256: nativeGateValidationRef.sha256,
        },
      }],
    }, projection.normalizer, projection.cause_key, [
      observationId(projection.source_id, projection.source_native_fingerprint),
    ]);
  });
  return nativeGateDebts;
}

/**
 * Exemptions first, then each source's root debts in `COMPLETION_DEBT_ORDER`, then the
 * retirements. Pure: every input is passed in, and nothing is read or written.
 */
export function reduceCompletionDebts(
  input: CompletionDebtInput,
  dispositions: CompletionDebtDispositions,
): CompletionDebtReduction {
  const publicSafetyExemptions = applyPublicSafetyExemptions(
    input.publicSafetyAudit?.findings ?? [],
    dispositions.publicSafetyExemptions,
  );
  const rootDebts = {} as Record<CompletionDebtSource, readonly RootDebtAccountingRow[]>;
  for (const source of COMPLETION_DEBT_ORDER) {
    rootDebts[source] = source === "native_gate"
      ? nativeGateRootDebts(input)
      : ROOT_DEBT_BUILDERS[source](input, publicSafetyExemptions);
  }
  const completionDebts = COMPLETION_DEBT_ORDER.flatMap((source) => rootDebts[source]);
  const retirementOutcome = applyRetirements(completionDebts as unknown as JsonObject[], dispositions.retirements);
  return {
    rootDebts,
    completionDebts,
    exempted: publicSafetyExemptions.exempted,
    retirementOutcome,
  };
}
