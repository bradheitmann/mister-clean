import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import { proveCurrentProjectionCommand } from "../repository-inspection.js";
import { assertDirectory, discoverPlanningRoots, git, isGitAncestor, listEntriesRecursively } from "../repository.js";
import { auditPlanningArtifacts as assessPlanningArtifacts, finalizePlanningAudit, isPlanningTextPath,
  type PlanningSource, type PlanningFinding, type PlanningAuditResult, type PlanningRepositoryObservations } from "./policy.js";

function observationsFor(repository: string): PlanningRepositoryObservations {
  return {
    projectionCommandPasses: (command) => proveCurrentProjectionCommand(command, repository).status === "pass",
    currentIdentity: () => {
      try { return { commit: git(repository, "rev-parse", "HEAD"), tree: git(repository, "rev-parse", "HEAD^{tree}") }; }
      catch { return undefined; }
    },
    commitIsAncestor: (commit) => isGitAncestor(repository, commit, "HEAD"),
  };
}

/** Compatibility adapter: repository observations remain enabled whenever a repository is supplied. */
export function auditPlanningArtifacts(
  sources: readonly PlanningSource[], planningRootCount = sources.length > 0 ? 1 : 0,
  options: { readonly repository?: string; readonly snapshot?: string } = {},
): PlanningAuditResult {
  return assessPlanningArtifacts(sources, planningRootCount, {
    ...(options.repository ? { observations: observationsFor(options.repository) } : {}),
    ...(options.snapshot !== undefined ? { snapshot: options.snapshot } : {}),
  });
}

const PLANNING_CANDIDATE_DIRECTORIES = new Set(["docs", "documentation", "references", "specs"]);
const PLANNING_CANDIDATE_IGNORED_SEGMENTS = new Set(["examples", "fixtures", "node_modules", "test-data", "testdata", "vendor"]);
const ACTIVE_IMPLEMENTATION_STATUS = /^status\s*:\s*[^\n]*(?:implementation\s+)?(?:active|in[ -]progress|pending|underway)\b/imu;
const IMPLEMENTATION_SEQUENCE_HEADING = /^#{1,6}\s+(?:\d+(?:\.\d+)*\.?\s+)?(?:implementation|migration|remediation|rollout)\s+(?:plan|roadmap|sequence)\b/imu;
const MAX_PLANNING_CANDIDATE_BYTES = 2 * 1024 * 1024;

interface PlanningCandidate {
  readonly content: string;
  readonly path: string;
}

function planningCandidatePaths(root: string, planningRoots: readonly string[]): string[] {
  const candidates: string[] = [];
  const roots = planningRoots.map((path) => path.split("/").join(sep));
  const insidePlanningRoot = (path: string): boolean => roots.some((candidate) =>
    path === candidate || path.startsWith(`${candidate}${sep}`));
  const append = (path: string): void => {
    const relativePath = relative(root, path);
    if (!relativePath || insidePlanningRoot(relativePath)) return;
    const segments = relativePath.split(sep).map((segment) => segment.toLocaleLowerCase("und"));
    if (segments.some((segment) => PLANNING_CANDIDATE_IGNORED_SEGMENTS.has(segment))) return;
    if (!isPlanningTextPath(path)) return;
    candidates.push(path);
  };

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isFile()) append(path);
    else if (entry.isDirectory() && !entry.isSymbolicLink()
      && PLANNING_CANDIDATE_DIRECTORIES.has(entry.name.toLocaleLowerCase("und"))) {
      for (const nested of listEntriesRecursively(path)) if (nested.kind === "file") append(nested.path);
    }
  }
  return [...new Set(candidates)].sort();
}

function discoverUnprojectedPlanningCandidates(
  root: string,
  planningRoots: readonly string[],
  planningSources: readonly PlanningSource[],
): { readonly candidates: readonly PlanningCandidate[]; readonly findings: readonly PlanningFinding[] } {
  const candidates: PlanningCandidate[] = [];
  for (const path of planningCandidatePaths(root, planningRoots)) {
    try {
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.size > MAX_PLANNING_CANDIDATE_BYTES) continue;
      const content = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
      if (content.includes("\0")
        || !ACTIVE_IMPLEMENTATION_STATUS.test(content)
        || !IMPLEMENTATION_SEQUENCE_HEADING.test(content)) continue;
      candidates.push({ content, path: relative(root, path).split(sep).join("/") });
    } catch {
      continue;
    }
  }

  const findings = candidates
    .filter((candidate) => !planningSources.some((source) => source.content.includes(candidate.path)))
    .map((candidate): PlanningFinding => ({
      code: "planning_surface_undiscovered",
      detail: "live implementation status and sequence are outside planning discovery and are not projected by a canonical planning artifact",
      path: candidate.path,
      related: [...planningRoots],
      subject: `PLANNING-CANDIDATE-${createHash("sha256").update(candidate.path.trim()).digest("hex").slice(0, 20).toUpperCase()}`,
    }));
  return { candidates, findings };
}

export function auditPlanningRepository(repository: string): PlanningAuditResult {
  const root = resolve(repository);
  assertDirectory(root);
  const planningRoots = discoverPlanningRoots(root);
  const sources: PlanningSource[] = [];
  const appendEntry = (entry: { readonly kind: "file" | "other" | "symlink"; readonly path: string }): void => {
    const relativePath = relative(root, entry.path).split(sep).join("/");
    if (entry.kind === "file" && basename(entry.path) === ".gitkeep" && lstatSync(entry.path).size === 0) return;
    if (entry.kind !== "file" || !isPlanningTextPath(entry.path)) {
      sources.push({ content: "", path: relativePath });
      return;
    }
    let content = "";
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(entry.path));
    } catch {
      sources.push({ content: "", path: relativePath });
      return;
    }
    sources.push({ content: content.includes("\0") ? "" : content, path: relativePath });
  };
  for (const rootText of planningRoots) {
    const rootPath = resolve(root, rootText);
    const rootStat = lstatSync(rootPath);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      appendEntry({ kind: rootStat.isFile() ? "file" : rootStat.isSymbolicLink() ? "symlink" : "other", path: rootPath });
      continue;
    }
    for (const entry of listEntriesRecursively(rootPath)) appendEntry(entry);
  }
  let snapshot = "unbound";
  try {
    snapshot = git(root, "rev-parse", "HEAD");
  } catch {
    snapshot = "unbound";
  }
  const base = auditPlanningArtifacts(sources, planningRoots.length, { repository: root, snapshot });
  const probes = discoverUnprojectedPlanningCandidates(root, planningRoots, sources);
  return finalizePlanningAudit([...base.findings, ...probes.findings], snapshot, {
    artifactCount: base.artifactCount,
    candidateProbeCount: probes.candidates.length,
    planningRootCount: base.planningRootCount,
    structuredArtifactCount: base.structuredArtifactCount,
    suppressedByTypedNonartifactCount: base.suppressed_by_typed_nonartifact_count,
  });
}
