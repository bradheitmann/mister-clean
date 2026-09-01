import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { parseDocument } from "yaml";

export type GitHubActionsFindingRule =
  | "health_gate_nonblocking"
  | "health_gate_identity_unbound"
  | "manual_sensitive_ref_unbound"
  | "permissions_implicit"
  | "privileged_action_context_exposed"
  | "privileged_action_input_shape_unbound"
  | "privileged_action_mutable"
  | "release_identity_unbound"
  | "workflow_run_checkout_unbound"
  | "workflow_run_source_untrusted"
  | "workflow_run_upstream_identity_unbound"
  | "workflow_run_upstream_mutable"
  | "workflow_unparseable";

export interface GitHubActionsFinding {
  readonly fingerprint: string;
  readonly path: string;
  readonly rule: GitHubActionsFindingRule;
  readonly severity: "P0" | "P1" | "P2";
  readonly detail: string;
  readonly refs: readonly string[];
}

export interface GitHubActionsAuditResult {
  readonly record_type: "mister-clean.github-actions-audit";
  readonly schema_version: "1.0";
  readonly status: "not_applicable" | "pass" | "fail";
  readonly exitCode: 0 | 1;
  readonly workflow_count: number;
  readonly sensitive_workflow_count: number;
  readonly findings: readonly GitHubActionsFinding[];
}

type YamlValue = Map<unknown, unknown> | readonly unknown[] | string | number | boolean | null;

const SENSITIVE_COMMAND = /(?:\bflyctl\s+deploy\b|\bwrangler\s+deploy\b|\bpnpm\s+publish\b|\bnpm\s+publish\b|\bdocker\s+push\b|\bkubectl\b|\bterraform\s+apply\b|\bgh\s+release\b|\bgit\s+push\b)/iu;
const HEALTH_COMMAND = /(?:\bchecks?\s+list\b|\bhealthz\b|\bhealth(?:check)?\b)/iu;
const FULL_COMMIT_REF = /^[0-9a-f]{40}$/u;
const DECLARATIVE_STEP_FIELDS = Object.freeze([
  "name",
  "uses",
  "run",
  "shell",
  "working-directory",
  "env",
  "with",
  "container",
] as const);
const PRIVILEGED_ACTION_INPUT_ALLOWLISTS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["actions/checkout", new Set(["fetch-depth", "ref"])],
]);

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function map(value: unknown): Map<unknown, unknown> | undefined {
  return value instanceof Map ? value : undefined;
}

function get(value: unknown, key: string): unknown {
  const record = map(value);
  if (!record) return undefined;
  for (const [candidate, item] of record) if (String(candidate) === key) return item;
  return undefined;
}

function entries(value: unknown): Array<[string, unknown]> {
  const record = map(value);
  return record ? [...record.entries()].map(([key, item]) => [String(key), item]) : [];
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function scalar(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value instanceof Map) return [...value.entries()].flatMap(([key, item]) => [String(key), ...strings(item)]);
  return [];
}

function privilegedContextEscape(value: unknown): boolean {
  for (const candidate of strings(value)) {
    for (const expression of candidate.matchAll(/\$\{\{([\s\S]*?)\}\}/gu)) {
      const body = expression[1] ?? "";
      if (/\bsecrets\b/iu.test(body)) return true;
      if (/(?:\btoJSON\s*\(\s*github\s*\)|\bgithub\s*\[|\bgithub\.token\b|^\s*github\s*$)/iu.test(body)) {
        return true;
      }
    }
  }
  return false;
}

function stepExposesPrivilegedContext(step: unknown): boolean {
  return DECLARATIVE_STEP_FIELDS.some((field) => privilegedContextEscape(get(step, field)));
}

function jobExposesPrivilegedContext(job: unknown): boolean {
  return privilegedContextEscape(get(job, "container")) || privilegedContextEscape(get(job, "env"));
}

function eventPresent(on: unknown, event: string): boolean {
  if (typeof on === "string") return on === event;
  if (Array.isArray(on)) return on.some((item) => item === event);
  return entries(on).some(([key]) => key === event);
}

function lineRef(path: string, text: string, needle: string): string {
  const index = text.split(/\r?\n/u).findIndex((line) => line.includes(needle));
  return index < 0 ? path : `${path}#line-${index + 1}`;
}

function finding(
  path: string,
  rule: GitHubActionsFindingRule,
  severity: GitHubActionsFinding["severity"],
  detail: string,
  refs: readonly string[],
): GitHubActionsFinding {
  const normalizedRefs = [...new Set(refs)].sort();
  return {
    fingerprint: digest(`github_actions\0${rule}\0${path}\0${normalizedRefs.join("\0")}`),
    path,
    rule,
    severity,
    detail,
    refs: normalizedRefs,
  };
}

function checkoutRef(step: unknown): string {
  return scalar(get(get(step, "with"), "ref"));
}

function usesRef(value: string): string | null {
  if (value.startsWith("./")) return null;
  const marker = value.lastIndexOf("@");
  return marker < 0 ? "" : value.slice(marker + 1);
}

function actionId(value: string): string {
  const marker = value.lastIndexOf("@");
  return marker < 0 ? value : value.slice(0, marker);
}

function unexpectedPrivilegedActionInputs(step: unknown): string[] {
  const uses = scalar(get(step, "uses"));
  const withBlock = map(get(step, "with"));
  if (!uses || !withBlock || withBlock.size === 0) return [];
  const allowlist = PRIVILEGED_ACTION_INPUT_ALLOWLISTS.get(actionId(uses));
  if (!allowlist) return [...withBlock.keys()].map(String).sort();
  return [...withBlock.keys()].map(String).filter((key) => !allowlist.has(key)).sort();
}

function hasExplicitPermissions(workflow: unknown, job: unknown): boolean {
  return get(job, "permissions") !== undefined || get(workflow, "permissions") !== undefined;
}

function hasMainRefGuard(job: unknown): boolean {
  const joined = strings(job).join("\n");
  if (!/(?:github\.ref\b|GITHUB_REF\b|github\.ref_name\b)/u.test(joined)) return false;
  return /refs\/heads\/main|ref_name\s*==\s*['"]main['"]|GITHUB_REF[^\n]*refs\/heads\/main/u.test(joined);
}

function healthGateIsFailClosed(run: string): boolean {
  const executable = run.split(/\r?\n/u)
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  const lines = executable.split(/\r?\n/u);
  const firstHealthLine = lines.findIndex((line) => HEALTH_COMMAND.test(line));
  if (firstHealthLine >= 0
    && lines.slice(0, firstHealthLine).some((line) => /^\s*(?:exit|return)\s+0\s*(?:;|$)/u.test(line))) return false;
  if (/::warning::/u.test(executable) && !/exit\s+[1-9]/u.test(executable)) return false;
  if (/\bset\s+-[^\n]*e[^\n]*\b/u.test(executable)
    && /(?:\bbun|\bnode|\bdeno|\bsh|\bbash)\s+[^\n]*(?:validat|verif)[^\n]*(?:check|health)/iu.test(executable)
    && !/\|\|\s*(?:true|:)|continue-on-error/iu.test(executable)) return true;
  return /(?:\bexit\s+[1-9]\b|\bjq\s+-e\b|\bcurl\s+(?:[^\n]*\s)?(?:-f\b|--fail(?:-with-body)?\b)|\btest\s+[^\n]+|\[\[[^\n]+\]\]|(?:^|\n)\s*\[[^\n]+\]\s*(?:$|\n)|\bif\s+!\s+[^\n]+;?\s*then[\s\S]*?\bexit\s+[1-9]\b)/mu.test(executable);
}

function referencedLocalSourceText(repository: string, run: string): string {
  const sources: string[] = [];
  const pattern = /(?:^|[\s"'`])((?:\.?\.?\/)?[A-Za-z0-9_@+./-]+\.(?:[cm]?[jt]sx?|sh|bash))(?=$|[\s"'`;])/gmu;
  for (const match of run.matchAll(pattern)) {
    const candidate = match[1];
    if (!candidate) continue;
    const absolute = resolve(repository, candidate);
    const relation = relative(repository, absolute);
    if (isAbsolute(relation) || relation === ".." || relation.startsWith("../")) continue;
    try {
      const metadata = lstatSync(absolute);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 1_048_576) continue;
      sources.push(readFileSync(absolute, "utf8"));
    } catch {
      // Missing or unreadable command sources cannot contribute positive proof.
    }
  }
  return sources.join("\n");
}

function trustedMainCheckout(step: unknown): boolean {
  const uses = scalar(get(step, "uses"));
  if (!/^actions\/checkout@/u.test(uses)) return false;
  const withBlock = get(step, "with");
  const ref = scalar(get(withBlock, "ref"));
  const fetchDepth = get(withBlock, "fetch-depth");
  return (ref === "refs/heads/main" || ref.includes("github.event.repository.default_branch"))
    && (fetchDepth === 0 || fetchDepth === "0");
}

function hasTrustedWorkflowRunSourceBoundary(repository: string, jobs: readonly [string, unknown][]): boolean {
  for (const [, job] of jobs) {
    const steps = array(get(job, "steps"));
    for (const [index, step] of steps.entries()) {
      const stepStrings = strings(step).join("\n");
      const run = scalar(get(step, "run"));
      if (!run || !stepStrings.includes("github.event.workflow_run.head_sha")) continue;
      const bindsRepository = stepStrings.includes("github.event.workflow_run.head_repository.full_name")
        && stepStrings.includes("github.repository");
      const bindsEvent = stepStrings.includes("github.event.workflow_run.event");
      const trustedBootstrap = steps.slice(0, index).some(trustedMainCheckout);
      const policy = `${run}\n${referencedLocalSourceText(repository, run)}`;
      const verifiesRepository = /(?:ciHeadRepository|head_repository|HEAD_REPOSITORY)/u.test(policy)
        && /(?:!==?|===?|\btest\b|\[\[)/u.test(policy);
      const verifiesPush = /(?:ciEvent|workflow_run\.event|UPSTREAM_EVENT|upstream[^\n]*event)/iu.test(policy)
        && /\bpush\b/iu.test(policy);
      const verifiesAncestry = /\bmerge-base\b[\s\S]{0,240}--is-ancestor\b|--is-ancestor\b[\s\S]{0,240}\bmerge-base\b/iu.test(policy);
      if (bindsRepository && bindsEvent && trustedBootstrap
        && verifiesRepository && verifiesPush && verifiesAncestry) return true;
    }
  }
  return false;
}

function hasTrustedWorkflowRunTemporalBinding(repository: string, jobs: readonly [string, unknown][]): boolean {
  for (const [, job] of jobs) {
    const steps = array(get(job, "steps"));
    for (const [index, step] of steps.entries()) {
      const stepStrings = strings(step).join("\n");
      const run = scalar(get(step, "run"));
      if (!run || !stepStrings.includes("github.event.workflow_run.head_sha")) continue;
      const trustedBootstrap = steps.slice(0, index).some(trustedMainCheckout);
      if (!trustedBootstrap) continue;
      const policy = `${run}\n${referencedLocalSourceText(repository, run)}`;
      const bindsCurrentTrustedTip = /\brev-parse\s+(?:--verify\s+)?refs\/remotes\/origin\/main\b/u.test(policy)
        && /(?:SOURCE_SHA|head_sha)[^\n]{0,120}(?:={1,3}|!=|\btest\b)|(?:={1,3}|!=|\btest\b)[^\n]{0,120}(?:SOURCE_SHA|head_sha)/iu.test(policy);
      if (bindsCurrentTrustedTip) return true;

      const bindsRunIdentity = stepStrings.includes("github.event.workflow_run.id")
        && (stepStrings.includes("github.event.workflow_run.workflow_id")
          || stepStrings.includes("github.event.workflow_run.name"));
      const readsHistoricalWorkflowBytes = /\bgit\s+show\b[^\n]*(?:SOURCE_SHA|head_sha)[^\n]*:\.github\/workflows\//iu.test(policy);
      const verifiesWorkflowDigest = /(?:sha256sum|shasum\s+-a\s+256)/iu.test(policy)
        && /(?:allowlist|allowed|expected|trusted)[A-Za-z0-9_ -]{0,48}(?:digest|sha256|workflow)/iu.test(policy)
        && /(?:!==?|===?|\btest\b|\[\[)/u.test(policy);
      if (bindsRunIdentity && readsHistoricalWorkflowBytes && verifiesWorkflowDigest) return true;
    }
  }
  return false;
}

function healthGateIdentityIsBound(repository: string, run: string): boolean {
  if (!/\bchecks?\s+list\b/iu.test(run)) return true;
  const material = `${run}\n${referencedLocalSourceText(repository, run)}`;
  const readsName = /(?:\.(?:name|Name)\b|\bnameValue\b|\bobservedNames?\b)/u.test(material);
  const declaresExpectation = /(?:required|expected)[A-Za-z0-9_ -]{0,48}checks?|checks?[A-Za-z0-9_ -]{0,48}(?:required|expected)|missing required check/iu.test(material);
  const directNamedPredicate = /\.(?:name|Name)\s*(?:==|===|!=|!==)\s*["'][^"']+["']/u.test(material);
  return readsName && (declaresExpectation || directNamedPredicate);
}

function neededJobIds(job: unknown): string[] {
  const needs = get(job, "needs");
  if (typeof needs === "string") return [needs];
  return array(needs).filter((value): value is string => typeof value === "string");
}

function mainGuardDominates(jobId: string, jobs: ReadonlyMap<string, unknown>, seen = new Set<string>()): boolean {
  if (seen.has(jobId)) return false;
  seen.add(jobId);
  const job = jobs.get(jobId);
  if (!job) return false;
  if (hasMainRefGuard(job)) return true;
  if (strings(get(job, "if")).some((value) => /\balways\s*\(/u.test(value))) return false;
  return neededJobIds(job).some((needed) => mainGuardDominates(needed, jobs, new Set(seen)));
}

interface WorkflowAudit {
  readonly path: string;
  readonly text: string;
  readonly workflow: YamlValue | null;
  readonly name: string | null;
  readonly workflow_run_sources: readonly string[];
  readonly findings: readonly GitHubActionsFinding[];
  readonly sensitive: boolean;
}

function auditWorkflow(repository: string, path: string, text: string): WorkflowAudit {
  const findings: GitHubActionsFinding[] = [];
  let workflow: YamlValue;
  try {
    const document = parseDocument(text, { prettyErrors: false, uniqueKeys: true });
    if (document.errors.length > 0) throw new Error(document.errors.map((error) => error.message).join("; "));
    workflow = document.toJS({ mapAsMap: true }) as YamlValue;
    if (!(workflow instanceof Map)) throw new Error("workflow root is not a mapping");
  } catch {
    return {
      path,
      text,
      workflow: null,
      name: null,
      workflow_run_sources: [],
      sensitive: false,
      findings: [finding(path, "workflow_unparseable", "P1", "Workflow YAML cannot be parsed into one unambiguous mapping.", [path])],
    };
  }

  const on = get(workflow, "on");
  const hasManual = eventPresent(on, "workflow_dispatch");
  const hasWorkflowRun = eventPresent(on, "workflow_run");
  const jobs = entries(get(workflow, "jobs"));
  const jobsById = new Map(jobs);
  const sensitiveJobs = jobs.filter(([, job]) => strings(job).some((value) => SENSITIVE_COMMAND.test(value)));
  const sensitive = sensitiveJobs.length > 0;

  if (hasManual && sensitive && sensitiveJobs.some(([jobId]) => !mainGuardDominates(jobId, jobsById))) {
    findings.push(finding(
      path,
      "manual_sensitive_ref_unbound",
      "P0",
      "A manually dispatched effectful workflow is not fail-closed to refs/heads/main.",
      [lineRef(path, text, "workflow_dispatch")],
    ));
  }

  if (hasWorkflowRun && sensitive) {
    const workflowStrings = strings(workflow);
    const hasDerivedSourceBinding = workflowStrings.some((value) => value.includes("github.event.workflow_run.head_sha"))
      && workflowStrings.some((value) => /\.outputs\.source_sha\b/u.test(value))
      && workflowStrings.some((value) => /(?:--expected|rev-parse\s+HEAD)/u.test(value));
    const unbound: string[] = [];
    for (const [, job] of jobs) {
      for (const step of array(get(job, "steps"))) {
        const uses = scalar(get(step, "uses"));
        if (!/^actions\/checkout@/u.test(uses)) continue;
        if (trustedMainCheckout(step)) continue;
        const ref = checkoutRef(step);
        if (!ref.includes("github.event.workflow_run.head_sha") && !hasDerivedSourceBinding) {
          unbound.push(lineRef(path, text, uses));
        }
      }
    }
    if (unbound.length > 0) {
      findings.push(finding(
        path,
        "workflow_run_checkout_unbound",
        "P1",
        "An effectful workflow_run checkout is not explicitly bound to the CI-passed head SHA.",
        unbound,
      ));
    }
    if (!hasTrustedWorkflowRunSourceBoundary(repository, jobs)) {
      findings.push(finding(
        path,
        "workflow_run_source_untrusted",
        "P0",
        "A privileged workflow_run source is not jointly bound to the same repository, a trusted push event, and ancestry in a freshly fetched trusted main ref before candidate code executes.",
        [lineRef(path, text, "workflow_run")],
      ));
    }
    if (!hasTrustedWorkflowRunTemporalBinding(repository, jobs)) {
      findings.push(finding(
        path,
        "workflow_run_upstream_identity_unbound",
        "P0",
        "A privileged workflow_run can accept a historical rerun without binding it either to the current trusted main tip or to retained, allowlisted upstream workflow identity and bytes.",
        [lineRef(path, text, "workflow_run")],
      ));
    }
  }

  for (const [jobId, job] of sensitiveJobs) {
    const refs = [lineRef(path, text, `${jobId}:`)];
    if (!hasExplicitPermissions(workflow, job)) {
      findings.push(finding(
        path,
        "permissions_implicit",
        "P1",
        `Effectful job ${jobId} relies on implicit GitHub token permissions.`,
        refs,
      ));
    }
    const mutableUses: string[] = [];
    const exposedContexts: string[] = [];
    const unallowlistedInputShapes: string[] = [];
    if (jobExposesPrivilegedContext(job)) exposedContexts.push(lineRef(path, text, `${jobId}:`));
    for (const step of array(get(job, "steps"))) {
      const uses = scalar(get(step, "uses"));
      if (stepExposesPrivilegedContext(step)) {
        const label = uses || scalar(get(step, "name")) || "working-directory:";
        exposedContexts.push(lineRef(path, text, label));
      }
      if (!uses) continue;
      const ref = usesRef(uses);
      if (ref !== null && !FULL_COMMIT_REF.test(ref)) mutableUses.push(lineRef(path, text, uses));
      if (unexpectedPrivilegedActionInputs(step).length > 0) {
        unallowlistedInputShapes.push(lineRef(path, text, uses));
      }
    }
    if (mutableUses.length > 0) {
      findings.push(finding(
        path,
        "privileged_action_mutable",
        "P1",
        `Effectful job ${jobId} executes one or more actions that are not pinned to immutable commits.`,
        mutableUses,
      ));
    }
    if (exposedContexts.length > 0) {
      findings.push(finding(
        path,
        "privileged_action_context_exposed",
        "P0",
        `Effectful job ${jobId} exposes a secret, direct token, whole authority context, or computed authority-context lookup through a declarative job or step field.`,
        exposedContexts,
      ));
    }
    if (unallowlistedInputShapes.length > 0) {
      findings.push(finding(
        path,
        "privileged_action_input_shape_unbound",
        "P1",
        `Effectful job ${jobId} supplies declarative action inputs outside a canonical exact-key allowlist.`,
        unallowlistedInputShapes,
      ));
    }
  }

  for (const [, job] of jobs) {
    for (const step of array(get(job, "steps"))) {
      const name = scalar(get(step, "name"));
      const run = scalar(get(step, "run"));
      const executable = run.split(/\r?\n/u).filter((line) => !line.trimStart().startsWith("#")).join("\n");
      if (!run || !HEALTH_COMMAND.test(executable)) continue;
      if (!healthGateIsFailClosed(run)) {
        findings.push(finding(
          path,
          "health_gate_nonblocking",
          "P1",
          `Health-verification step ${name || "(unnamed)"} does not prove a nonpassing dependency stops promotion.`,
          [lineRef(path, text, name || run.split(/\r?\n/u)[0] || "run:")],
        ));
      }
      if (!healthGateIdentityIsBound(repository, run)) {
        findings.push(finding(
          path,
          "health_gate_identity_unbound",
          "P1",
          `Health-verification step ${name || "(unnamed)"} accepts status without proving the expected named check is present exactly as required.`,
          [lineRef(path, text, name || run.split(/\r?\n/u)[0] || "run:")],
        ));
      }
    }
  }

  const allRuns = jobs.flatMap(([, job]) => array(get(job, "steps")).map((step) => scalar(get(step, "run"))));
  const deploymentRuns = allRuns.filter((run) => SENSITIVE_COMMAND.test(run));
  if (text.includes("--image-label") && !deploymentRuns.some((run) => run.includes("--image-label"))) {
    findings.push(finding(
      path,
      "release_identity_unbound",
      "P2",
      "Workflow prose claims image-label release binding, but no executed command supplies the label.",
      [lineRef(path, text, "--image-label")],
    ));
  }

  const workflowRun = map(get(on, "workflow_run"));
  const workflowRunSources = array(get(workflowRun, "workflows"))
    .filter((value): value is string => typeof value === "string");
  return {
    path,
    text,
    workflow,
    name: scalar(get(workflow, "name")) || null,
    workflow_run_sources: workflowRunSources,
    sensitive,
    findings,
  };
}

function auditTrustedUpstream(workflow: WorkflowAudit): GitHubActionsFinding[] {
  if (!workflow.workflow) return [];
  const findings: GitHubActionsFinding[] = [];
  const jobs = entries(get(workflow.workflow, "jobs"));
  const implicitPermissionRefs: string[] = [];
  const mutableUses: string[] = [];
  for (const [jobId, job] of jobs) {
    if (!hasExplicitPermissions(workflow.workflow, job)) {
      implicitPermissionRefs.push(lineRef(workflow.path, workflow.text, `${jobId}:`));
    }
    for (const step of array(get(job, "steps"))) {
      const uses = scalar(get(step, "uses"));
      if (!uses) continue;
      const ref = usesRef(uses);
      if (ref !== null && !FULL_COMMIT_REF.test(ref)) mutableUses.push(lineRef(workflow.path, workflow.text, uses));
    }
  }
  if (implicitPermissionRefs.length > 0) {
    findings.push(finding(
      workflow.path,
      "permissions_implicit",
      "P1",
      "A workflow whose success authorizes an effectful workflow relies on implicit GitHub token permissions.",
      implicitPermissionRefs,
    ));
  }
  if (mutableUses.length > 0) {
    findings.push(finding(
      workflow.path,
      "workflow_run_upstream_mutable",
      "P1",
      "A workflow whose success authorizes an effectful workflow executes actions not pinned to immutable commits.",
      mutableUses,
    ));
  }
  return findings;
}

function trackedWorkflowPaths(repository: string): string[] {
  return execFileSync("git", ["--no-optional-locks", "-C", repository, "ls-files", "-z", "--", ".github/workflows"], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split("\0")
    .filter((path) => /\.ya?ml$/iu.test(path))
    .sort();
}

/** Audit tracked GitHub Actions workflows without executing them or trusting generated workflow prose. */
export function auditGitHubActionsRepository(root: string): GitHubActionsAuditResult {
  const repository = resolve(execFileSync("git", ["--no-optional-locks", "-C", root, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim());
  const paths = trackedWorkflowPaths(repository);
  const findings: GitHubActionsFinding[] = [];
  let sensitiveWorkflowCount = 0;
  const audits: WorkflowAudit[] = [];
  for (const path of paths) {
    const absolute = join(repository, path);
    const metadata = lstatSync(absolute);
    if (!metadata.isFile()) {
      findings.push(finding(path, "workflow_unparseable", "P1", "Tracked workflow is not a regular file.", [path]));
      continue;
    }
    const result = auditWorkflow(repository, path, readFileSync(absolute, "utf8"));
    audits.push(result);
    if (result.sensitive) sensitiveWorkflowCount += 1;
    findings.push(...result.findings);
  }
  const trustBearingNames = new Set(
    audits.filter((audit) => audit.sensitive).flatMap((audit) => audit.workflow_run_sources),
  );
  for (const audit of audits) {
    if (audit.name && trustBearingNames.has(audit.name)) findings.push(...auditTrustedUpstream(audit));
  }
  const unique = [...new Map(findings.map((row) => [row.fingerprint, row])).values()]
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
  const status = paths.length === 0 ? "not_applicable" : unique.length > 0 ? "fail" : "pass";
  return {
    record_type: "mister-clean.github-actions-audit",
    schema_version: "1.0",
    status,
    exitCode: status === "fail" ? 1 : 0,
    workflow_count: paths.length,
    sensitive_workflow_count: sensitiveWorkflowCount,
    findings: unique,
  };
}
