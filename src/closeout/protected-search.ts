import { posix } from "node:path";

export interface ProtectedSearchPolicy {
  readonly allowed_roots: readonly string[];
  readonly protected_roots: readonly string[];
  readonly exclusions?: readonly string[];
}

export interface ProtectedSearchPlan {
  readonly executable: "rg";
  readonly argv: readonly string[];
  readonly allowed_roots: readonly string[];
  readonly protected_roots: readonly string[];
}

function repositoryPath(value: string): string | undefined {
  const stripped = value.replace(/^!/u, "").replace(/\/\*\*$/u, "").replace(/\/$/u, "");
  const normalized = posix.normalize(stripped);
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/")) {
    return undefined;
  }
  return normalized;
}

function contains(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

export function validateProtectedSearchPolicy(policy: ProtectedSearchPolicy): readonly string[] {
  const errors: string[] = [];
  if (policy.allowed_roots.length === 0) errors.push("allowed_roots requires positive repository-root enumeration");
  const allowed = policy.allowed_roots.map(repositoryPath);
  const protectedRoots = policy.protected_roots.map(repositoryPath);
  if (allowed.some((path) => path === undefined)) errors.push("allowed_roots contains a non-repository-relative root");
  if (protectedRoots.some((path) => path === undefined)) errors.push("protected_roots contains a non-repository-relative root");
  for (const protectedRoot of protectedRoots) {
    if (!protectedRoot) continue;
    for (const allowedRoot of allowed) {
      if (allowedRoot && contains(allowedRoot, protectedRoot)) {
        errors.push(`allowed root ${allowedRoot} contains protected root ${protectedRoot}`);
      }
    }
  }
  for (const exclusion of policy.exclusions ?? []) {
    const normalized = repositoryPath(exclusion);
    if (!normalized) {
      errors.push(`exclusion ${exclusion} is not repository-root-qualified`);
      continue;
    }
    if (!protectedRoots.includes(normalized)) {
      errors.push(`exclusion ${exclusion} does not exactly bind a declared protected root`);
    }
  }
  return [...new Set(errors)].sort();
}

export function buildProtectedSearchPlan(
  policy: ProtectedSearchPolicy,
  patterns: readonly string[],
): ProtectedSearchPlan {
  const errors = validateProtectedSearchPolicy(policy);
  if (errors.length > 0) throw new Error(`unsafe protected search policy: ${errors.join("; ")}`);
  const allowed = policy.allowed_roots.map((root) => repositoryPath(root) as string).sort();
  const protectedRoots = policy.protected_roots.map((root) => repositoryPath(root) as string).sort();
  const argv = ["--line-number", "--hidden"];
  for (const pattern of patterns) argv.push("--regexp", pattern);
  for (const root of allowed) argv.push("--glob", `${root}/**`);
  for (const root of protectedRoots) argv.push("--glob", `!${root}/**`);
  argv.push(".");
  return Object.freeze({
    executable: "rg",
    argv: Object.freeze(argv),
    allowed_roots: Object.freeze(allowed),
    protected_roots: Object.freeze(protectedRoots),
  });
}
