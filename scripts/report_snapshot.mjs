import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function prepareReportOutput(assetRoot, outputRoot) {
  mkdirSync(outputRoot, { recursive: true });
  if (outputRoot === assetRoot) return;
  copyFileSync(join(assetRoot, "dashboard-tokens.css"), join(outputRoot, "dashboard-tokens.css"));
  cpSync(join(assetRoot, "fonts"), join(outputRoot, "fonts"), { recursive: true });
}

export function freezeInputs(paths) {
  const bytes = new Map(paths.map((path) => [path, readFileSync(path)]));
  const hashes = Object.fromEntries(paths.map((path) => [basename(path), sha256(bytes.get(path))]));
  return {
    bytes,
    hashes,
    assertUnchanged() {
      const changed = paths.filter((path) => sha256(readFileSync(path)) !== hashes[basename(path)]);
      if (changed.length) throw new Error(`report inputs changed during render: ${changed.join(", ")}`);
    },
  };
}

function qualificationState(entry) {
  if (entry.qualificationState) return entry.qualificationState;
  if (entry.band === "failed") return "disqualified";
  if (entry.band === "promising") return "trial_pending";
  if (entry.taskClasses.every((value) => /diagnostic|contract analysis/i.test(value))) return "diagnostic_only";
  return "role_evidence";
}

export function publishedScorecard(raw, sourceHashes) {
  const { targetRepositoryPath: _privateRepositoryPath, ...publicSnapshot } = raw.snapshot;
  const tuples = raw.tuples.map(({ score: _score, competencies: _competencies, ...entry }) => ({
    ...entry,
    qualificationState: qualificationState(entry),
  }));
  return {
    ...raw,
    snapshot: {
      ...publicSnapshot,
      sourceSha256: sourceHashes,
    },
    coverage: raw.coverage ?? {
      configuredTupleCount: null,
      observedTupleCount: tuples.length,
      universeStatus: "not_frozen",
      note: "The configured provider universe has not been frozen, so no completeness denominator is claimed.",
    },
    tuples,
  };
}

function git(repositoryPath, ...args) {
  return execFileSync("/usr/bin/git", ["-C", repositoryPath, ...args], { encoding: "utf8" }).trim();
}

function repositoryWebUrl(remote) {
  if (/^https?:\/\//.test(remote)) return remote.replace(/\.git$/, "");
  const ssh = remote.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  throw new Error(`scorecard target remote is not a canonical web locator: ${remote}`);
}

function resolveCommit(repositoryPath, ref) {
  try {
    return git(repositoryPath, "rev-parse", "--verify", `${ref}^{commit}`);
  } catch {
    throw new Error(`scorecard evidence commit does not resolve in the target repository: ${ref}`);
  }
}

function preserveEvidenceObject(directory, localPath) {
  if (!existsSync(localPath)) throw new Error(`scorecard evidence path is missing: ${localPath}`);
  if (!statSync(localPath).isFile()) throw new Error(`scorecard evidence path is not a regular file: ${localPath}`);
  const bytes = readFileSync(localPath);
  const digest = sha256(bytes);
  const suffix = extname(localPath).toLocaleLowerCase("und") || ".evidence";
  const objectDirectory = join(directory, "objects");
  const filename = `${digest}${suffix}`;
  const path = join(objectDirectory, filename);
  mkdirSync(objectDirectory, { recursive: true });
  if (existsSync(path) && !readFileSync(path).equals(bytes)) {
    throw new Error(`content-addressed evidence collision at ${path}`);
  }
  if (!existsSync(path)) writeFileSync(path, bytes);
  return { digest, filename, size: bytes.length };
}

function evidenceRecord(directory, repositoryPath, targetCommit, tuple, locator) {
  const directPath = locator.startsWith("/") ? locator.split(" · ", 1)[0].trim() : undefined;
  const localPath = directPath && existsSync(directPath)
    ? directPath
    : locator.match(/\/tmp\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+/)?.[0];
  const evidenceObject = localPath ? preserveEvidenceObject(directory, localPath) : undefined;
  const commitRefs = [...locator.matchAll(/\b[0-9a-f]{7,40}\b/g)].map((match) => match[0]);
  const commits = [...new Set(commitRefs.map((ref) => resolveCommit(repositoryPath, ref)))];
  const assertionOnly = !evidenceObject && commits.length === 0;
  if (assertionOnly && !locator.startsWith("assertion:")) {
    throw new Error(`unbound scorecard evidence must be explicitly labeled assertion-only: ${tuple.id} :: ${locator}`);
  }
  const identity = {
    tuple_id: tuple.id,
    locator_sha256: sha256(locator),
    target_commit: targetCommit,
    ...(evidenceObject ? { content_sha256: evidenceObject.digest } : {}),
    ...(commits.length ? { commits } : {}),
  };
  return {
    receipt_id: sha256(JSON.stringify(identity)),
    ...identity,
    ...(localPath ? { source_name: basename(localPath) } : { locator }),
    binding_status: assertionOnly ? "assertion_only" : "content_or_commit_bound",
    ...(evidenceObject ? {
      content_size_bytes: evidenceObject.size,
      evidence_object: `./objects/${evidenceObject.filename}`,
    } : {}),
    ...(commitRefs.length ? { cited_commit_refs: commitRefs } : {}),
  };
}

function writeReceiptIndex(directory, currentFilename) {
  const entries = readdirSync(directory)
    .filter((filename) => /-model-receipts-[0-9a-f]{64}\.json$/.test(filename))
    .sort()
    .map((filename) => ({
      filename,
      sha256: filename.match(/([0-9a-f]{64})\.json$/)?.[1],
      current: filename === currentFilename,
    }));
  writeFileSync(join(directory, "index.json"), `${JSON.stringify({
    record_type: "mister-clean.model-evidence-receipt-index",
    schema_version: "1.0",
    current: currentFilename,
    manifests: entries,
  }, null, 2)}\n`, "utf8");
}

export function writeReceiptManifest(assetRoot, scorecard, { repositoryPath }) {
  if (!repositoryPath) throw new Error("scorecard targetRepositoryPath is required for receipt binding");
  const targetCommit = scorecard.snapshot.targetCommit;
  if (!/^[0-9a-f]{40}$/.test(targetCommit ?? "")) {
    throw new Error("scorecard targetCommit must be a full 40-character commit SHA");
  }
  if (resolveCommit(repositoryPath, targetCommit) !== targetCommit) {
    throw new Error("scorecard targetCommit does not resolve to itself in the target repository");
  }
  const targetRemote = git(repositoryPath, "remote", "get-url", "origin");
  if (!scorecard.snapshot.targetRepository || !scorecard.snapshot.targetRepositoryRemote) {
    throw new Error("scorecard target repository identity and canonical remote are required");
  }
  if (targetRemote !== scorecard.snapshot.targetRepositoryRemote) {
    throw new Error(`scorecard target remote mismatch: expected ${scorecard.snapshot.targetRepositoryRemote}, observed ${targetRemote}`);
  }
  const targetRepositoryUrl = repositoryWebUrl(targetRemote);
  const directory = join(assetRoot, "receipts");
  mkdirSync(directory, { recursive: true });
  const entries = scorecard.tuples.flatMap((tuple) => tuple.evidence.map((locator) => evidenceRecord(
    directory,
    repositoryPath,
    targetCommit,
    tuple,
    locator,
  )));
  const manifest = {
    record_type: "mister-clean.model-evidence-receipts",
    schema_version: "1.1",
    campaign: scorecard.snapshot.campaign,
    snapshot_generated_at: scorecard.snapshot.generatedAt,
    target_repository: scorecard.snapshot.targetRepository,
    target_repository_remote: scorecard.snapshot.targetRepositoryRemote,
    target_repository_url: targetRepositoryUrl,
    target_commit: targetCommit,
    target_commit_url: `${targetRepositoryUrl}/commit/${targetCommit}`,
    source_sha256: scorecard.snapshot.sourceSha256,
    binding_summary: {
      total: entries.length,
      content_or_commit_bound: entries.filter((entry) => entry.binding_status === "content_or_commit_bound").length,
      assertion_only: entries.filter((entry) => entry.binding_status === "assertion_only").length,
    },
    entries,
  };
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  const digest = sha256(bytes);
  const slug = scorecard.snapshot.targetRepository.toLocaleLowerCase("und").replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
  const filename = `${slug}-model-receipts-${digest}.json`;
  const path = join(directory, filename);
  if (existsSync(path) && readFileSync(path, "utf8") !== bytes) {
    throw new Error(`content-addressed receipt collision at ${path}`);
  }
  if (!existsSync(path)) writeFileSync(path, bytes, "utf8");
  writeReceiptIndex(directory, filename);
  const evidenceByTuple = Object.fromEntries(scorecard.tuples.map((tuple) => [
    tuple.id,
    entries.filter((entry) => entry.tuple_id === tuple.id).map((entry) => {
      if (entry.evidence_object) {
        return {
          href: `./receipts/${entry.evidence_object.replace(/^\.\//, "")}`,
          label: `Preserved evidence · ${entry.source_name} · ${entry.content_sha256.slice(0, 12)}`,
        };
      }
      if (entry.commits?.length) {
        const commit = entry.commits[0];
        return {
          href: `${targetRepositoryUrl}/commit/${commit}`,
          label: `Commit-bound evidence · ${commit.slice(0, 12)}`,
        };
      }
      return { label: `Assertion only · ${entry.receipt_id.slice(0, 12)}` };
    }),
  ]));
  return { digest, filename, path, bindingSummary: manifest.binding_summary, evidenceByTuple };
}
