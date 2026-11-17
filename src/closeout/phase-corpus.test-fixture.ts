/**
 * Deterministic corpus for the differential proof of mg-s2d-phase-registry
 * (charter/DONE/mg-s2d-phase-registry.md, proof 4).
 *
 * For each of the six detector families it holds the audit-result shapes the
 * existing tests and fixtures build for the four functions under proof
 * (detector-coverage.test.ts, bundle.test.ts, bundle.test-fixture.ts,
 * finding-anchors.test.ts, second-pass.test.ts, language-policy.test.ts,
 * public-safety-provenance.test.ts, inspection.test.ts, repository-boundaries.test.ts,
 * semantic.test.ts), written out as literals or produced by the real auditors on
 * fixture repositories with fixed content and fixed commit dates, plus variants
 * generated from every one of them: a missing field, a wrong type, an empty
 * list, an unknown rule, a foreign row. Nothing here draws from a random source.
 *
 * Never import this file from non-test code.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { auditGitHubActionsRepository } from "./github-actions.js";
import { scanPublicSafetySync, scanTrackedPublicSafetySync } from "./inspection.js";
import { auditLanguagePolicy, LANGUAGE_POLICY_SCHEMA } from "./language-policy.js";
import { oracle_RECEIPT_FAMILIES, type OracleReceiptFamily } from "./phase-oracles.test-fixture.js";
import { auditPlanningArtifacts, auditPlanningRepository } from "./planning.js";
import { auditRepositoryBoundaries } from "./repository-boundaries.js";
import { trackedShippablePaths } from "./repository.js";
import { auditSemanticRepository, semanticCandidateSetSha256 } from "./semantic.js";
import { createFixtureRepository, fixtureGit } from "../test-support/fixture-repo.js";

export type CorpusFamily = OracleReceiptFamily;
export const CORPUS_FAMILIES: readonly CorpusFamily[] = oracle_RECEIPT_FAMILIES;

export interface CorpusItem {
  readonly family: CorpusFamily;
  readonly name: string;
  readonly value: unknown;
  /** Directory that receipt anchoring reads referenced lines from. */
  readonly repository: string;
  /** True when `repository` is a Git worktree and the value came from a real auditor run on it. */
  readonly live: boolean;
}

export interface PhaseCorpus {
  readonly items: readonly CorpusItem[];
  readonly counts: Readonly<Record<CorpusFamily, number>>;
  /** Values that are not audit results at all; fed to every family. */
  readonly nonObjects: readonly unknown[];
}

const SNAPSHOT = "a".repeat(40);
/** A planted contact address, assembled so this file never holds one. */
const PLANTED = `${"person"}@${"example.org"}`;
const FIXED_DATE = "2026-01-01T00:00:00Z";

const WORKFLOW = `name: CD
on:
  workflow_dispatch: {}
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: flyctl deploy --app production
`;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function put(root: string, path: string, content: string | Uint8Array): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** A fixture repository whose commit ids depend only on its content. */
function repository(root: string, files: Readonly<Record<string, string | Uint8Array>>): string {
  createFixtureRepository(root);
  for (const [path, content] of Object.entries(files)) put(root, path, content);
  const env = { ...process.env, GIT_AUTHOR_DATE: FIXED_DATE, GIT_COMMITTER_DATE: FIXED_DATE };
  fixtureGit(root, ["add", "-A"], { env });
  fixtureGit(root, ["commit", "-qm", "fixture"], { env });
  return root;
}

const boundaryParser = (name: string): string => `export function ${name}(text: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of text.split("\\n")) {
    const [key, ...rest] = line.split(":");
    if (key) parsed[key.trim()] = rest.join(":").trim();
  }
  return parsed;
}
`;

const LANGUAGE_POLICY = {
  schema: LANGUAGE_POLICY_SCHEMA,
  forbid_extensions: [".py", ".js", ".mjs"],
  generated: ["dist/*.js"],
};

interface BaseItem {
  readonly name: string;
  readonly value: unknown;
  readonly repository: string;
  readonly live: boolean;
}

function planningBases(plain: string, debtful: string, clean: string): BaseItem[] {
  const valid = { path: "planning/tasks/TASK-1.md", content: "---\nartifact_type: task\ntask_id: TASK-1\ntop_level: true\nstatus: active\n---\n" };
  const canonical = (): ReturnType<typeof auditPlanningArtifacts> => auditPlanningArtifacts([{ content: "not structured", path: "planning/story.md" }], 1, { snapshot: SNAPSHOT });
  const fabricated = structuredClone(canonical());
  Object.assign(fabricated.raw_findings[0]!, { id: "RAW-PLANNING-FABRICATED" });
  Object.assign(fabricated.root_debts[0]!, { raw_finding_ids: ["RAW-PLANNING-FABRICATED"] });
  const arbitrary = structuredClone(canonical());
  Object.assign(arbitrary.root_debts[0]!, { cause_key: "planning:arbitrary", repair_boundary: "invented-boundary" });
  const inventedRoot = {
    affected_paths: [],
    affected_projection_field: "planning_input",
    causal_evidence: { component_refs: [], kind: "single_artifact", violated_invariant: "planning_input" },
    cause_key: "planning:invented",
    class: "planning_input_unparsed",
    detector_family: "planning_graph",
    id: "ROOT-PLANNING-INVENTED",
    observation_count: 0,
    raw_finding_ids: [],
    repair_boundary: "invented-boundary",
    snapshot: SNAPSHOT,
  };
  const literal = (name: string, value: unknown): BaseItem => ({ name, value, repository: plain, live: false });
  return [
    literal("unstructured artifact (detector-coverage.test)", canonical()),
    literal("empty input, not_applicable", auditPlanningArtifacts([], 0, { snapshot: SNAPSHOT })),
    literal("one valid top-level task, pass", auditPlanningArtifacts([valid], 1, { snapshot: SNAPSHOT })),
    literal("unbound snapshot", auditPlanningArtifacts([{ content: "not structured", path: "planning/story.md" }])),
    literal("malformed front matter", auditPlanningArtifacts([{ path: "planning/bad.md", content: "---\ninvalid: [\n---\n" }], 1, { snapshot: SNAPSHOT })),
    literal("duplicate ids", auditPlanningArtifacts([valid, { ...valid, path: "planning/other/TASK-1.md" }], 1, { snapshot: SNAPSHOT })),
    literal("unresolved parent", auditPlanningArtifacts([{ ...valid, content: "---\nartifact_type: task\ntask_id: TASK-1\nparent_id: MISSING\nstatus: active\n---\n" }], 1, { snapshot: SNAPSHOT })),
    literal("story with unresolved children and an orphan leaf", auditPlanningArtifacts([
      { path: "planning/stories/WORK-1.md", content: "---\nartifact_type: story\nstory_id: WORK-1\nstatus: DRAFT\nholdout_status: NOT_RUN\n---\n| Child | Status |\n| TASK-1 | Backlog |\n| TASK-2 | Backlog |\n" },
      { path: "planning/done/ORPHAN-LEAF.md", content: "---\nartifact_type: slice\nslice_id: ORPHAN-LEAF\nstatus: done\n---\n" },
      { path: "planning/notes.md", content: "not structured" },
    ], 1, { snapshot: SNAPSHOT })),
    literal("comparator literal, not_applicable (bundle.test)", {
      artifactCount: 0, candidate_probe_count: 0, counts: {}, exitCode: 0, findings: [], planningRootCount: 0,
      raw_finding_count: 0, raw_findings: [], root_debt_count: 0, root_debts: [], status: "not_applicable",
      structuredArtifactCount: 0, suppressed_by_typed_nonartifact_count: 0,
    }),
    literal("fabricated raw id (detector-coverage.test)", fabricated),
    literal("arbitrary root projection (detector-coverage.test)", arbitrary),
    literal("invented zero-observation root (detector-coverage.test)", {
      ...auditPlanningArtifacts([], 0, { snapshot: SNAPSHOT }), root_debt_count: 1, root_debts: [inventedRoot],
    }),
    literal("fingerprint fragment (detector-coverage.test)", { raw_findings: [{ id: "PLAN-1" }] }),
    { name: "live audit of a repository with planning debt", value: auditPlanningRepository(debtful), repository: debtful, live: true },
    { name: "live audit of a repository without planning", value: auditPlanningRepository(clean), repository: clean, live: true },
  ];
}

function semanticBases(plain: string, debtful: string, clean: string): BaseItem[] {
  const candidates = [{ evidence: ["claim"], id: "SEM-1", kind: "construction_boundary" as const, path: "src/factory.ts", refs: ["src/factory.ts"] }];
  const unassigned = {
    candidate_probe_count: 1,
    candidate_set_sha256: semanticCandidateSetSha256(candidates),
    candidates,
    confirmed_failure_count: 0,
    executed_probe_count: 0,
    executions: [],
    exitCode: 1,
    findings: [{
      candidate_id: "SEM-1", classification: "verification_debt", code: "semantic_probe_unassigned",
      detail: "unassigned", kind: "construction_boundary", refs: ["src/factory.ts"],
    }],
    pending_probe_count: 0,
    resolved_probe_count: 0,
    resolutions: [],
    snapshot: SNAPSHOT,
    status: "fail",
    working_tree_sha256: "1".repeat(64),
  };
  const twoCandidates = [
    ...candidates,
    { evidence: ["second claim"], id: "SEM-2", kind: "gate_semantic_bite" as const, path: "contracts/CONTRACT.yaml", refs: ["contracts/CONTRACT.yaml#line-3"] },
    { evidence: ["third claim"], id: "SEM-3", kind: "identifier_namespace" as const, path: "src/ids.ts", refs: ["src/ids.ts"] },
  ];
  const mixed = {
    ...unassigned,
    candidate_probe_count: 3,
    candidate_set_sha256: semanticCandidateSetSha256(twoCandidates),
    candidates: twoCandidates,
    confirmed_failure_count: 1,
    executed_probe_count: 1,
    executions: [{
      candidate_id: "SEM-2", command_sha256: "3".repeat(64), evidence_sha256: "4".repeat(64), executable: "bun",
      observed_status: 1, receipt_sha256: "5".repeat(64), result: "fail",
    }],
    findings: [
      ...unassigned.findings,
      { candidate_id: "SEM-2", classification: "confirmed_product_defect", code: "semantic_probe_failed", detail: "probe failed", kind: "gate_semantic_bite", refs: ["contracts/CONTRACT.yaml#line-3"] },
      { candidate_id: "SEM-2", classification: "operate_time_pending", code: "semantic_probe_pending", detail: "pending", kind: "gate_semantic_bite", refs: [] },
    ],
    pending_probe_count: 1,
    resolved_probe_count: 1,
    resolutions: [{
      candidate_id: "SEM-3", disposition: "attested_satisfied", evidence_refs: [{ path: "evidence/sem-3.json", sha256: "6".repeat(64) }], rationale: "attested",
    }],
  };
  const boundaryCandidates = [{ evidence: ["claim"], id: "SEM-1", kind: "construction_boundary" as const, path: "src/factory.ts", refs: ["src/factory.ts#line-1"] }];
  const manifestBoundary = {
    candidate_probe_count: 1,
    candidate_set_sha256: semanticCandidateSetSha256(boundaryCandidates),
    candidates: boundaryCandidates,
    confirmed_failure_count: 0,
    executed_probe_count: 0,
    executions: [],
    exitCode: 1,
    findings: [{
      candidate_id: "manifest", classification: "verification_debt", code: "semantic_probe_manifest_invalid",
      detail: "invalid manifest", kind: "construction_boundary", refs: ["semantic-probes.json"],
    }],
    manifest_sha256: "2".repeat(64),
    pending_probe_count: 0,
    resolved_probe_count: 0,
    resolutions: [],
    snapshot: SNAPSHOT,
    status: "fail",
    working_tree_sha256: "1".repeat(64),
  };
  const literal = (name: string, value: unknown): BaseItem => ({ name, value, repository: plain, live: false });
  return [
    literal("one unassigned candidate (detector-coverage.test)", unassigned),
    literal("unassigned, failed, pending and resolved candidates", mixed),
    literal("finding for an undiscovered candidate (detector-coverage.test)", {
      ...unassigned,
      candidate_probe_count: 0,
      candidate_set_sha256: semanticCandidateSetSha256([]),
      candidates: [],
      confirmed_failure_count: 1,
      findings: [{
        candidate_id: "SEM-FABRICATED", classification: "confirmed_product_defect", code: "semantic_probe_unassigned",
        detail: "fabricated", kind: "construction_boundary", refs: [],
      }],
    }),
    literal("manifest boundary (detector-coverage.test)", manifestBoundary),
    literal("manifest boundary, stale candidate digest", { ...manifestBoundary, candidate_set_sha256: "0".repeat(64) }),
    literal("manifest boundary, manifest digest undefined", { ...manifestBoundary, manifest_sha256: undefined }),
    literal("manifest boundary, no manifest reference", { ...manifestBoundary, findings: [{ ...manifestBoundary.findings[0], refs: [] }] }),
    literal("comparator literal, not_applicable (bundle.test)", {
      candidate_probe_count: 0, candidate_set_sha256: digest("[]"), candidates: [], confirmed_failure_count: 0,
      executed_probe_count: 0, executions: [], exitCode: 0, findings: [], pending_probe_count: 0, resolved_probe_count: 0,
      resolutions: [], snapshot: SNAPSHOT, status: "not_applicable", working_tree_sha256: digest("fixture-tree"),
    }),
    literal("no candidates, canonical empty digest", {
      candidate_probe_count: 0, candidate_set_sha256: semanticCandidateSetSha256([]), candidates: [], confirmed_failure_count: 0,
      executed_probe_count: 0, executions: [], exitCode: 0, findings: [], pending_probe_count: 0, resolved_probe_count: 0,
      resolutions: [], snapshot: SNAPSHOT, status: "not_applicable", working_tree_sha256: "1".repeat(64),
    }),
    literal("fingerprint fragment (detector-coverage.test)", { findings: [{ candidate_id: "SEM-1", code: "semantic_probe_unassigned" }] }),
    { name: "live audit of a repository with a completed contract", value: auditSemanticRepository(debtful, { execute: false }), repository: debtful, live: true },
    { name: "live audit of a repository without contracts", value: auditSemanticRepository(clean, { execute: false }), repository: clean, live: true },
  ];
}

function publicSafetyBases(plain: string, debtful: string, clean: string): BaseItem[] {
  const ruled = (path: string, line: number, rule: string, extra: Readonly<Record<string, unknown>> = {}): Record<string, unknown> => ({
    path, line, rule, fingerprint: digest(`public_safety\0${rule}\0${path}\0${line}`), ...extra,
  });
  const unassessed = (path: string, reason: string): Record<string, unknown> => ({
    path, reason, fingerprint: digest(`public_safety_unassessed\0${reason}\0${path}`),
  });
  const tracked = {
    findings: [{ path: "src/example.ts", line: 7, rule: "email-address", fingerprint: "3d2cd096afa87ba398336a2bce1ccfb74af6dd4dcb9b490066ac232641c6a98f" }],
    scope: "tracked_shippable",
    status: "fail",
    exitCode: 1,
    tracked_path_count: 1,
    tracked_paths_sha256: "2".repeat(64),
    unassessed: [],
  };
  const full = {
    exitCode: 1,
    findings: [
      ruled("notes.txt", 1, "email-address", { provenance: "tracked", value_sha256: digest("value-one") }),
      ruled("notes.txt", 4, "email-address", { provenance: "tracked", value_sha256: digest("value-one") }),
      ruled("src/config.ts", 12, "posix-home-path", { provenance: "tracked", value_sha256: digest("value-two") }),
      ruled("src/config.ts", 13, "custom-denylist-1", { provenance: "tracked", value_sha256: digest("value-three") }),
    ],
    input_sha256: "7".repeat(64),
    provenance_counts: { tracked: 4, untracked: 0, ignored: 0, unknown: 0 },
    provenance_source: "scope",
    scope: "tracked_shippable",
    status: "fail",
    tracked_path_count: 6,
    tracked_paths_sha256: "2".repeat(64),
    unassessed: [
      unassessed("asset.bin", "binary_content"),
      unassessed("latin1.txt", "invalid_utf8"),
      unassessed("missing.txt", "missing_or_unreadable"),
      unassessed("link", "unsupported_tracked_entry"),
    ],
  };
  const trackedPaths = trackedShippablePaths(debtful);
  const literal = (name: string, value: unknown): BaseItem => ({ name, value, repository: plain, live: false });
  const live = (name: string, value: unknown, root: string): BaseItem => ({ name, value, repository: root, live: true });
  return [
    literal("tracked literal without a value digest (detector-coverage.test)", tracked),
    literal("ruled rows and unassessed rows of every reason", full),
    literal("only unassessed rows", { ...full, findings: [], provenance_counts: { tracked: 0, untracked: 0, ignored: 0, unknown: 0 } }),
    literal("only ruled rows", { ...full, unassessed: [] }),
    literal("a row with both a rule and a reason", { ...full, findings: [{ ...ruled("notes.txt", 1, "email-address", { value_sha256: digest("value-one") }), reason: "binary_content" }], unassessed: [] }),
    literal("an unassessed row with a line and a value digest", { ...full, findings: [], unassessed: [{ ...unassessed("asset.bin", "binary_content"), line: 3, value_sha256: digest("value-one") }] }),
    literal("ruled row with an uppercase value digest", { ...full, findings: [ruled("notes.txt", 1, "email-address", { value_sha256: "A".repeat(64) })], unassessed: [] }),
    literal("ruled row with a fractional line", { ...full, findings: [{ ...ruled("notes.txt", 1, "email-address", { value_sha256: digest("value-one") }), line: 1.5 }], unassessed: [] }),
    literal("comparator literal, pass (bundle.test)", {
      exitCode: 0, findings: [], scope: "tracked_shippable", status: "pass", tracked_path_count: 0, tracked_paths_sha256: digest(""), unassessed: [],
    }),
    literal("fingerprint fragment (detector-coverage.test)", {
      findings: [{ path: "src/example.ts", line: 7, rule: "email-address", fingerprint: "3d2cd096afa87ba398336a2bce1ccfb74af6dd4dcb9b490066ac232641c6a98f" }],
    }),
    live("live tracked scan with planted values", scanTrackedPublicSafetySync(debtful, trackedPaths, []), debtful),
    live("live tracked scan with a custom denylist term", scanTrackedPublicSafetySync(debtful, trackedPaths, ["flyctl"]), debtful),
    live("live tracked scan with a path that cannot be read", scanTrackedPublicSafetySync(debtful, [...trackedPaths, "missing.txt"], []), debtful),
    live("live walked scan, which also sees the untracked file", scanPublicSafetySync(debtful), debtful),
    live("live tracked scan of a clean repository", scanTrackedPublicSafetySync(clean, trackedShippablePaths(clean), []), clean),
    live("live walked scan of a clean repository", scanPublicSafetySync(clean), clean),
  ];
}

function githubActionsBases(plain: string, debtful: string, clean: string): BaseItem[] {
  const finding = (path: string, rule: string, refs: readonly string[], severity = "P0"): Record<string, unknown> => ({
    path, rule, severity, detail: `${rule} at ${path}`, refs: [...refs],
    fingerprint: digest(`github_actions\0${rule}\0${path}\0${[...new Set(refs)].sort().join("\0")}`),
  });
  const base = {
    record_type: "mister-clean.github-actions-audit",
    schema_version: "1.0",
    status: "fail",
    exitCode: 1,
    workflow_count: 1,
    sensitive_workflow_count: 1,
    findings: [{
      path: ".github/workflows/cd.yml",
      rule: "manual_sensitive_ref_unbound",
      severity: "P0",
      detail: "manual deployment is not main-bound",
      refs: [".github/workflows/cd.yml#line-3"],
      fingerprint: "832395d72908af4919230ee1c4cc30bc1c797c91d26bb0b71a2e9f7ac7bdbed4",
    }],
  };
  const literal = (name: string, value: unknown): BaseItem => ({ name, value, repository: plain, live: false });
  const ruleVariants = ["workflow_run_source_untrusted", "health_gate_identity_unbound"].map((rule) => {
    const refs = [`.github/workflows/cd.yml#line-${rule.length}`];
    return literal(`rule ${rule} (detector-coverage.test)`, {
      ...base,
      findings: [{ ...base.findings[0], rule, refs, fingerprint: digest(`github_actions\0${rule}\0.github/workflows/cd.yml\0${refs.join("\0")}`) }],
    });
  });
  return [
    literal("one finding (detector-coverage.test)", base),
    ...ruleVariants,
    literal("several findings that share a path and a rule", {
      ...base,
      workflow_count: 2,
      findings: [
        finding(".github/workflows/cd.yml", "permissions_implicit", [".github/workflows/cd.yml#line-1"], "P1"),
        finding(".github/workflows/cd.yml", "permissions_implicit", [".github/workflows/cd.yml#line-5", ".github/workflows/cd.yml#line-9"], "P1"),
        finding(".github/workflows/cd.yml", "privileged_action_mutable", [".github/workflows/cd.yml#line-8"], "P0"),
        finding(".github/workflows/ci.yml", "health_gate_nonblocking", [".github/workflows/ci.yml#line-2"], "P2"),
        finding(".github/workflows/ci.yml", "workflow_unparseable", [".github/workflows/ci.yml"], "P1"),
      ],
    }),
    literal("refs that are unsorted, repeated, out of range or malformed", {
      ...base,
      findings: [
        finding(".github/workflows/cd.yml", "release_identity_unbound", [".github/workflows/cd.yml#line-9", ".github/workflows/cd.yml#line-3"]),
        finding(".github/workflows/cd.yml", "workflow_run_checkout_unbound", [".github/workflows/cd.yml#line-3", ".github/workflows/cd.yml#line-3"]),
        finding(".github/workflows/cd.yml", "workflow_run_upstream_mutable", [".github/workflows/cd.yml#line-400", ".github/workflows/cd.yml#line-0", ".github/workflows/cd.yml#line-x"]),
        finding(".github/workflows/absent.yml", "workflow_run_upstream_identity_unbound", [".github/workflows/absent.yml#line-1"]),
      ],
    }),
    literal("comparator literal, not_applicable (bundle.test)", {
      record_type: "mister-clean.github-actions-audit", schema_version: "1.0", status: "not_applicable", exitCode: 0,
      workflow_count: 0, sensitive_workflow_count: 0, findings: [],
    }),
    literal("workflows present, no findings", { ...base, status: "pass", exitCode: 0, findings: [] }),
    { name: "live audit of a manual deployment workflow", value: auditGitHubActionsRepository(debtful), repository: debtful, live: true },
    { name: "live audit of a repository without workflows", value: auditGitHubActionsRepository(clean), repository: clean, live: true },
  ];
}

function repositoryBoundariesBases(plain: string, boundaries: string, clean: string): BaseItem[] {
  const finding = (rule: string, path: string, detail: string): Record<string, unknown> => ({
    fingerprint: digest(`repository_boundaries\0${rule}\0${path}\0${detail}`), rule, path, detail, related_paths: [path],
  });
  const base = {
    record_type: "mister-clean.repository-boundary-audit",
    schema_version: "1.0",
    status: "fail",
    exitCode: 1,
    candidate_path_count: 4,
    parser_surfaces: [{ path: "src/parser-a.ts", shapes: ["custom"] }, { path: "src/parser-b.ts", shapes: ["custom"] }],
    external_contract_count: 0,
    findings: [
      finding("duplicate_handwritten_parser", "src/parser-a.ts", "two hand-written parsers of one shape"),
      finding("prototype_bearing_parsed_map", "src/parser-b.ts", "parsed map keeps a prototype"),
      finding("docker_copy_closure_gap", "Dockerfile", "runtime imports a file the image does not copy"),
      finding("duplicate_handwritten_parser", "src/parser-a.ts", "two hand-written parsers of one shape"),
    ],
  };
  const literal = (name: string, value: unknown): BaseItem => ({ name, value, repository: plain, live: false });
  return [
    literal("findings of three rules, one repeated", base),
    literal("no findings, pass", { ...base, status: "pass", exitCode: 0, findings: [] }),
    literal("another record type", { ...base, record_type: "mister-clean.github-actions-audit" }),
    { name: "live audit of parser, prototype, ignored-output and Docker closure debt", value: auditRepositoryBoundaries(boundaries), repository: boundaries, live: true },
    { name: "live audit of a clean repository", value: auditRepositoryBoundaries(clean), repository: clean, live: true },
  ];
}

function languagePolicyBases(plain: string, debtful: string, clean: string): BaseItem[] {
  const finding = (path: string, extension: string): Record<string, unknown> => ({
    fingerprint: digest(`language_policy\0forbidden_language\0${path}\0${extension}`),
    family: "language_policy", rule: "forbidden_language", path, extension,
  });
  const base = {
    record_type: "mister-clean.language-policy-audit",
    schema_version: "1.0",
    status: "fail",
    exitCode: 1,
    policy: {
      forbid_extensions: [".py", ".js", ".mjs"], allow: [], generated: ["dist/*.js"],
      source: { path: ".mister-clean/language-policy.json", sha256: "8".repeat(64) },
      lang_guard_allow: null,
    },
    tracked_path_count: 5,
    allowed_count: 0,
    generated_exempt: { count: 1, paths: ["dist/out.js"] },
    findings: [finding("a.py", ".py"), finding("tools/b.mjs", ".mjs"), finding("a.py", ".py")],
  };
  const literal = (name: string, value: unknown): BaseItem => ({ name, value, repository: plain, live: false });
  return [
    literal("declared policy with findings, one repeated", base),
    literal("declared policy, no findings, pass", { ...base, status: "pass", exitCode: 0, findings: [] }),
    literal("no declared policy, not_applicable", {
      ...base, status: "not_applicable", exitCode: 0, policy: null, tracked_path_count: 2, generated_exempt: { count: 0, paths: [] }, findings: [],
    }),
    literal("no declared policy but findings", { ...base, policy: null }),
    literal("another record type", { ...base, record_type: "mister-clean.repository-boundary-audit" }),
    { name: "live audit under a declared policy", value: auditLanguagePolicy(debtful), repository: debtful, live: true },
    { name: "live audit without a policy", value: auditLanguagePolicy(clean), repository: clean, live: true },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A value of another type than `value`, chosen by its type alone. */
function wrongType(value: unknown): unknown {
  if (typeof value === "string") return 7;
  if (typeof value === "number") return "7";
  if (typeof value === "boolean") return "true";
  if (Array.isArray(value)) return { 0: "not-a-list" };
  if (value === null) return "null";
  if (typeof value === "object") return ["not-an-object"];
  return null;
}

/** Row fields whose value names a rule, a code or another closed vocabulary. */
const VOCABULARY_FIELDS = new Set(["rule", "code", "kind", "classification", "reason", "severity", "family", "detector", "detector_family", "class", "result", "disposition"]);

/**
 * Variants of one audit result. Each differs from `base` in exactly one place:
 * a top-level field missing or of the wrong type, a list emptied, a status or
 * exit code swapped, a row field missing, of the wrong type or outside its
 * vocabulary, a row that is not an object, or a row repeated.
 */
function variantsOf(base: Record<string, unknown>): { readonly name: string; readonly value: unknown }[] {
  const out: { readonly name: string; readonly value: unknown }[] = [];
  const without = (record: Record<string, unknown>, key: string): Record<string, unknown> => Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
  for (const key of Object.keys(base).sort()) {
    const value = base[key];
    out.push({ name: `missing field ${key}`, value: without(base, key) });
    out.push({ name: `wrong type for ${key}`, value: { ...base, [key]: wrongType(value) } });
    if (!Array.isArray(value)) continue;
    if (value.length > 0) out.push({ name: `empty list ${key}`, value: { ...base, [key]: [] } });
    out.push({ name: `${key} holds a row that is not an object`, value: { ...base, [key]: [...value, "not-a-row"] } });
    out.push({ name: `${key} holds a null row`, value: { ...base, [key]: [null, ...value] } });
    const rowIndexes = [...new Set([0, value.length - 1])].filter((index) => index >= 0 && isRecord(value[index]));
    for (const index of rowIndexes) {
      const row = value[index] as Record<string, unknown>;
      const withRow = (replacement: unknown): Record<string, unknown> => ({ ...base, [key]: value.map((entry, at) => at === index ? replacement : entry) });
      out.push({ name: `${key}[${index}] repeated`, value: { ...base, [key]: [...value, structuredClone(row)] } });
      for (const field of Object.keys(row).sort()) {
        out.push({ name: `${key}[${index}] missing ${field}`, value: withRow(without(row, field)) });
        out.push({ name: `${key}[${index}] wrong type for ${field}`, value: withRow({ ...row, [field]: wrongType(row[field]) }) });
        if (typeof row[field] === "string") out.push({ name: `${key}[${index}] empty ${field}`, value: withRow({ ...row, [field]: "" }) });
        if (VOCABULARY_FIELDS.has(field)) out.push({ name: `${key}[${index}] unknown ${field}`, value: withRow({ ...row, [field]: `unknown_${field}` }) });
      }
    }
  }
  for (const status of ["pass", "fail", "not_applicable", "unknown_status"]) {
    if (base.status !== status) out.push({ name: `status ${status}`, value: { ...base, status } });
  }
  for (const exitCode of [0, 1, 2, 3]) {
    if (base.exitCode !== exitCode) out.push({ name: `exitCode ${exitCode}`, value: { ...base, exitCode } });
  }
  out.push({ name: "an extra unknown field", value: { ...base, unknown_field: "unknown" } });
  return out;
}

/**
 * Build the corpus under `scratch`, an empty directory the caller owns and
 * removes. It creates one plain directory and three fixture repositories.
 */
export function buildPhaseCorpus(scratch: string): PhaseCorpus {
  // A directory that is not a Git worktree: literal results anchor their line references here.
  const plain = join(scratch, "plain");
  put(plain, ".github/workflows/cd.yml", WORKFLOW);
  put(plain, "nested/dir/.github/workflows/cd.yml", `# shifted\n${WORKFLOW}`);
  put(plain, "notes.txt", `contact=${PLANTED}\n`);

  const debtful = repository(join(scratch, "debtful"), {
    ".github/workflows/cd.yml": WORKFLOW,
    ".mister-clean/language-policy.json": `${JSON.stringify(LANGUAGE_POLICY, null, 2)}\n`,
    "a.py": "print('a')\n",
    "asset.bin": new Uint8Array([0, ...Buffer.from(`owner=${PLANTED}`, "utf8"), 0]),
    "contracts/CONTRACT.yaml": "artifact_type: product_contract\nstatus: done\nclaim: The canonical CI gate proves every production parser rejects malformed input.\n",
    "dist/out.js": "export {};\n",
    "notes.txt": `# heading\ncontact=${PLANTED}\nroot=/${"Users"}/corpus-fixture/project\n`,
    "planning/done/ORPHAN-LEAF.md": "---\nartifact_type: slice\nslice_id: ORPHAN-LEAF\nstatus: done\n---\n",
    "planning/story.md": "not structured\n",
    "tools/b.mjs": "export {};\n",
    "tools/c.ts": "export {};\n",
  });
  // Untracked and not ignored: only the walked public-safety scan sees it.
  put(debtful, "untracked.txt", `contact=${PLANTED}\n`);

  const boundaries = repository(join(scratch, "boundaries"), {
    ".gitignore": "dist/\n",
    "Dockerfile": "FROM oven/bun:1\nWORKDIR /app\nCOPY src/runtime.ts ./src/runtime.ts\nCMD [\"bun\", \"src/runtime.ts\"]\n",
    "src/parser-a.ts": boundaryParser("parseYamlA"),
    "src/parser-b.ts": boundaryParser("parseYamlB"),
    "src/runtime.ts": "import { sharedPolicy } from './shared.js';\nconsole.log(sharedPolicy);\n",
    "src/shared.ts": "export const sharedPolicy = 'strict';\n",
    "test/parser.test.ts": "import { readFileSync } from 'node:fs';\nreadFileSync('dist/generated.txt', 'utf8');\n",
  });
  put(boundaries, "dist/generated.txt", "stale\n");

  const clean = repository(join(scratch, "clean"), { "README.md": "clean\n" });

  const bases: Readonly<Record<CorpusFamily, readonly BaseItem[]>> = {
    planning_graph: planningBases(plain, debtful, clean),
    public_safety: publicSafetyBases(plain, debtful, clean),
    github_actions: githubActionsBases(plain, debtful, clean),
    repository_boundaries: repositoryBoundariesBases(plain, boundaries, clean),
    semantic_boundary: semanticBases(plain, debtful, clean),
    language_policy: languagePolicyBases(plain, debtful, clean),
  };
  const items: CorpusItem[] = [];
  const counts = Object.fromEntries(CORPUS_FAMILIES.map((family) => [family, 0])) as Record<CorpusFamily, number>;
  for (const family of CORPUS_FAMILIES) {
    for (const base of bases[family]) {
      items.push({ family, ...base });
      // A JSON round trip is what a result read back from a bundle file looks like.
      const readBack: unknown = JSON.parse(JSON.stringify(base.value));
      items.push({ family, name: `${base.name}; read back from JSON`, value: readBack, repository: base.repository, live: base.live });
      if (!isRecord(readBack)) continue;
      for (const variant of variantsOf(readBack)) {
        items.push({ family, name: `${base.name}; ${variant.name}`, value: variant.value, repository: base.repository, live: false });
      }
    }
    counts[family] = items.filter((item) => item.family === family).length;
  }
  return { items, counts, nonObjects: [undefined, null, [], "not-a-result", 7, true] };
}
