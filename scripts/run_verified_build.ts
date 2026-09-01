#!/usr/bin/env bun

import { resolve } from "node:path";

import { captureRepositoryObject } from "../src/closeout/repository-object.js";
import { verifyGeneratedCandidate, type GeneratedCandidateKind } from "./verify_generated_candidate.js";

function sameObject(
  left: ReturnType<typeof captureRepositoryObject>,
  right: ReturnType<typeof captureRepositoryObject>,
): boolean {
  return left.head_commit === right.head_commit
    && left.entry_count === right.entry_count
    && left.sha256 === right.sha256;
}

function parseCandidate(args: readonly string[]): GeneratedCandidateKind {
  if (args.length !== 1 || !args[0]?.startsWith("--candidate=")) {
    throw new Error("usage: bun scripts/run_verified_build.ts --candidate=worktree");
  }
  const value = args[0].slice("--candidate=".length);
  if (value !== "worktree") throw new Error("verified in-place build supports only --candidate=worktree");
  return value;
}

export function runVerifiedBuild(
  root: string,
  candidate: GeneratedCandidateKind,
  verifier: typeof verifyGeneratedCandidate = verifyGeneratedCandidate,
): ReturnType<typeof captureRepositoryObject> {
  const before = captureRepositoryObject(root);
  let verificationFailure: unknown;
  try {
    verifier(root, candidate);
  } catch (error) {
    verificationFailure = error;
  }
  const after = captureRepositoryObject(root);
  if (!sameObject(before, after)) {
    const mutation = new Error(`verified build changed the candidate RepositoryObject: before=${before.sha256} after=${after.sha256}`);
    if (verificationFailure !== undefined) {
      throw new AggregateError([verificationFailure, mutation], "private verification failed and the source candidate changed");
    }
    throw mutation;
  }
  if (verificationFailure !== undefined) throw verificationFailure;
  return before;
}

if (import.meta.main) {
  const candidate = parseCandidate(process.argv.slice(2));
  const root = resolve(import.meta.dir, "..");
  const object = runVerifiedBuild(root, candidate);
  process.stdout.write(`verified build: PASS (${object.sha256})\n`);
}
