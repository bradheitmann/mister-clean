import { resolve } from "node:path";

import { captureRepositoryObject, type RepositoryObject } from "./repository-object.js";

export const CANONICAL_REPOSITORY_OBJECT_COMMAND = Object.freeze([
  "mister-clean",
  "inspect",
  "repository-object",
  ".",
  "--json",
] as const);

export interface ProjectionCommandProof {
  readonly status: "pass" | "fail";
  readonly command: readonly string[];
  readonly repository_object?: RepositoryObject;
  readonly error?: string;
}

export function inspectRepositoryObject(root: string): RepositoryObject {
  return captureRepositoryObject(resolve(root));
}

function commandTokens(command: string): readonly string[] | undefined {
  const trimmed = command.trim();
  if (!trimmed || /["'`\\;&|<>$(){}\[\]]/u.test(trimmed)) return undefined;
  return trimmed.split(/\s+/u);
}

/**
 * Prove the one supported current-projection command through the same engine
 * used by the CLI. Substrings and executable-looking prose confer no credit.
 */
export function proveCurrentProjectionCommand(command: string, repository: string): ProjectionCommandProof {
  const tokens = commandTokens(command);
  if (tokens === undefined || JSON.stringify(tokens) !== JSON.stringify(CANONICAL_REPOSITORY_OBJECT_COMMAND)) {
    return Object.freeze({
      status: "fail",
      command: tokens ?? [],
      error: "unsupported or noncanonical current projection command",
    });
  }
  try {
    return Object.freeze({
      status: "pass",
      command: CANONICAL_REPOSITORY_OBJECT_COMMAND,
      repository_object: inspectRepositoryObject(repository),
    });
  } catch (error) {
    return Object.freeze({
      status: "fail",
      command: CANONICAL_REPOSITORY_OBJECT_COMMAND,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
