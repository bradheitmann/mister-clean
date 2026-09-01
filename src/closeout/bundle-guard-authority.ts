/** External GUARD authority envelopes and live Git-state binding. */
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { canonicalJson } from "../canonical-json.js";
import {
  canonicalRemoteRepositoryIdentity,
  localRepositoryIdentity,
} from "./repository.js";
import { captureRepositoryObject } from "./repository-object.js";
import {
  HEX64,
  array,
  compareCodePoints,
  loadBytesRef,
  object,
  requireExactObject,
  sha256,
  stableEqual,
  text,
  validateRepositoryObject,
  type BundlePorts,
  type FilePort,
  type GitPort,
  type JsonObject,
} from "./bundle-runtime.js";

export interface GuardAuthorityLoad {
  readonly data: JsonObject;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly path: string;
}

export function guardAuthorityDigest(value: unknown): boolean {
  return typeof value === "string" && HEX64.test(value);
}

export function guardAuthorityEnvelope(
  value: unknown,
  kind: "precommit" | "commit",
  manifest: JsonObject,
  bundle: JsonObject,
  guard: JsonObject,
  path: string,
  errors: string[],
): JsonObject | undefined {
  const common = ["record_type", "schema_version", "repo", "request_ref", "run_id", "round_id", "pod_id", "task_id", "target", "candidate", "receipts", "deterministic_gates", "no_harm", "commit_barrier"];
  const keys = kind === "commit" ? [...common, "precommit_sha256", "precommit_ref", "precommit", "commit"] : common;
  const envelope = requireExactObject(value, keys, path, errors);
  if (!envelope) return undefined;
  if (envelope.record_type !== `mister-clean.guard-${kind}-authority`) errors.push(`${path}.record_type: expected mister-clean.guard-${kind}-authority`);
  if (envelope.schema_version !== "1.0") errors.push(`${path}.schema_version: expected 1.0`);
  const historicalRepo = { ...(object(manifest.repo) ?? {}), commit: guard.baseline_commit };
  if (!stableEqual(envelope.repo, kind === "precommit" ? historicalRepo : manifest.repo)) {
    errors.push(`${path}.repo: must equal ${kind === "precommit" ? "the guarded baseline repository projection" : "manifest.repo"}`);
  }
  if (envelope.request_ref !== manifest.request_ref) errors.push(`${path}.request_ref: must equal manifest.request_ref`);
  if (envelope.run_id !== bundle.run_id) errors.push(`${path}.run_id: must equal bundle.run_id`);
  for (const field of ["run_id", "round_id", "pod_id", "task_id"] as const) {
    if (!text(envelope[field])) errors.push(`${path}.${field}: required canonical selected-receipt binding`);
  }
  const target = requireExactObject(envelope.target, ["ref", "expected_commit"], `${path}.target`, errors);
  const manifestTarget = object(object(manifest.coordination)?.target);
  if (target && manifestTarget && !stableEqual(target, { ref: manifestTarget.ref, expected_commit: manifestTarget.expected_commit })) {
    errors.push(`${path}.target: must equal manifest.coordination.target`);
  }
  const candidate = requireExactObject(envelope.candidate, [
    "baseline_commit", "candidate_tree", "minted_at", "repository_object", "staged_paths", "writers_frozen",
  ], `${path}.candidate`, errors);
  if (candidate) {
    if (candidate.baseline_commit !== guard.baseline_commit) errors.push(`${path}.candidate.baseline_commit: must equal guard.baseline_commit`);
    if (candidate.candidate_tree !== guard.candidate_tree) errors.push(`${path}.candidate.candidate_tree: must equal guard.candidate_tree`);
    if (candidate.minted_at !== guard.minted_at) errors.push(`${path}.candidate.minted_at: must equal guard.minted_at`);
    validateRepositoryObject(candidate.repository_object, `${path}.candidate.repository_object`, errors);
    const staged = array(candidate.staged_paths);
    if (!staged || staged.some((entry) => typeof entry !== "string")) errors.push(`${path}.candidate.staged_paths: expected string array`);
    else if (JSON.stringify(staged) !== JSON.stringify([...staged].sort((left, right) => compareCodePoints(String(left), String(right)))) || new Set(staged).size !== staged.length) errors.push(`${path}.candidate.staged_paths: required sorted unique paths`);
    if (!stableEqual(candidate.staged_paths, guard.staged_paths)) errors.push(`${path}.candidate.staged_paths: must equal guard.staged_paths`);
    if (candidate.writers_frozen !== guard.writers_frozen) errors.push(`${path}.candidate.writers_frozen: must equal guard.writers_frozen`);
  }
  if (!stableEqual(envelope.receipts, guard.receipts)) errors.push(`${path}.receipts: must equal the complete inline guard.receipts projection`);
  if (!stableEqual(envelope.deterministic_gates, guard.deterministic_gates)) errors.push(`${path}.deterministic_gates: must equal the complete inline guard projection`);
  if (!stableEqual(envelope.no_harm, guard.no_harm)) errors.push(`${path}.no_harm: must equal the complete inline guard projection`);
  const authorityBarrier = requireExactObject(envelope.commit_barrier, [
    "state", "approved_tree", "receipt_ids", "opened_at", "crossed_action_id",
  ], `${path}.commit_barrier`, errors);
  const currentBarrier = object(guard.commit_barrier);
  const expectedBarrier = kind === "precommit" && currentBarrier
    ? { ...currentBarrier, state: "open", crossed_action_id: null }
    : currentBarrier;
  if (authorityBarrier && !stableEqual(authorityBarrier, expectedBarrier)) {
    errors.push(`${path}.commit_barrier: must equal the exact ${kind === "precommit" ? "historical open" : "current"} guard.commit_barrier projection`);
  }
  const selectedReceiptIds = new Set(array(object(guard.commit_barrier)?.receipt_ids).map(object).map((seal) => seal?.receipt_id).filter(text));
  const selectedTasks = array(guard.receipts).map(object)
    .filter((receipt): receipt is JsonObject => !!receipt && selectedReceiptIds.has(String(receipt.id)))
    .map((receipt) => [receipt.run_id, receipt.round_id, receipt.pod_id, receipt.task_id] as const);
  const selectedTuple = selectedTasks[0];
  if (selectedTasks.length !== 4) errors.push(`${path}.receipts: must resolve exactly four selected barrier receipts`);
  if (selectedTuple) {
    for (const [index, tuple] of selectedTasks.entries()) {
      if (tuple.some((value, fieldIndex) => value !== selectedTuple[fieldIndex])) {
        errors.push(`${path}.receipts[${index}]: must agree on the selected run/round/pod/task tuple`);
        break;
      }
    }
    const fields = ["run_id", "round_id", "pod_id", "task_id"] as const;
    for (const [index, field] of fields.entries()) {
      if (envelope[field] !== selectedTuple[index]) errors.push(`${path}.${field}: must equal the selected four-receipt tuple`);
    }
  }
  if (kind === "commit") {
    if (!guardAuthorityDigest(envelope.precommit_sha256)) errors.push(`${path}.precommit_sha256: required embedded precommit authority SHA-256`);
    const precommitRef = requireExactObject(envelope.precommit_ref, ["path", "sha256"], `${path}.precommit_ref`, errors);
    if (precommitRef) {
      if (typeof precommitRef.path !== "string" || !isAbsolute(precommitRef.path)) errors.push(`${path}.precommit_ref.path: required absolute external authority path`);
      if (!guardAuthorityDigest(precommitRef.sha256)) errors.push(`${path}.precommit_ref.sha256: required lowercase SHA-256`);
      if (precommitRef.sha256 !== object(guard.authority)?.precommit_sha256) errors.push(`${path}.precommit_ref.sha256: must equal manifest.guard.authority.precommit_sha256`);
    }
    const precommit = guardAuthorityEnvelope(envelope.precommit, "precommit", manifest, bundle, guard, `${path}.precommit`, errors);
    if (precommit && guardAuthorityDigest(envelope.precommit_sha256)) {
      if (!stableEqual(envelope.candidate, precommit.candidate)) {
        errors.push(`${path}.candidate: must equal the historical precommit candidate projection`);
      }
      const canonicalDigest = sha256(new TextEncoder().encode(canonicalJson(precommit)));
      if (canonicalDigest !== envelope.precommit_sha256) errors.push(`${path}.precommit_sha256: must equal the canonical precommit envelope digest`);
      const projected = object(guard.authority)?.precommit_sha256;
      if (envelope.precommit_sha256 !== projected) errors.push(`${path}.precommit_sha256: must equal manifest.guard.authority.precommit_sha256`);
    }
    const commit = requireExactObject(envelope.commit, ["commit", "commit_tree", "parent", "ref", "cas", "postcommit_repository_object"], `${path}.commit`, errors);
    if (commit) validateRepositoryObject(commit.postcommit_repository_object, `${path}.commit.postcommit_repository_object`, errors);
    const crossedActionId = object(envelope.commit_barrier)?.crossed_action_id;
    const crossedAction = array(manifest.actions).map(object)
      .find((action): action is JsonObject => !!action
        && action.id === crossedActionId
        && action.kind === "git_commit"
        && action.status === "executed");
    if (!stableEqual(object(envelope.commit_barrier)?.receipt_ids, object(crossedAction?.guard_commit)?.receipt_ids)) {
      errors.push(`${path}.commit_barrier.receipt_ids: must equal the crossed guard_commit receipt projection`);
    }
  }
  return envelope;
}

export async function loadExternalGuardAuthority(
  files: FilePort,
  selectedPath: string | undefined,
  kind: "precommit" | "commit",
  manifest: JsonObject,
  bundle: JsonObject,
  guard: JsonObject,
  bundleBase: string,
  repo: string,
  worktrees: readonly string[],
  errors: string[],
): Promise<{ readonly load?: GuardAuthorityLoad; readonly envelope?: JsonObject }> {
  const path = "$.guard_authority";
  if (!selectedPath) {
    errors.push(`${path}: live GUARD ${kind} state requires --guard-authority <absolute path>`);
    return {};
  }
  if (!isAbsolute(selectedPath)) {
    errors.push(`${path}: path must be absolute`);
    return {};
  }
  const resolvedPath = resolve(selectedPath);
  let realPath: string;
  try {
    realPath = await files.realpath(resolvedPath);
  } catch {
    errors.push(`${path}: authority file does not exist`);
    return {};
  }
  if (realPath !== resolvedPath) errors.push(`${path}: authority file must not be a symlink or realpath alias`);
  const forbiddenRoots = [repo, bundleBase, ...worktrees];
  for (const root of forbiddenRoots) {
    let rootReal: string;
    try { rootReal = await files.realpath(resolve(root)); } catch { rootReal = resolve(root); }
    const relation = relative(rootReal, realPath);
    if (!(relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation))) {
      errors.push(`${path}: authority file must be outside candidate repository, bundle directory, and every live worktree`);
      break;
    }
  }
  if (!(await files.isFile(realPath))) {
    errors.push(`${path}: authority file must be a regular file`);
    return {};
  }
  let bytes: Uint8Array;
  try { bytes = await files.readBytes(realPath); } catch (error) {
    errors.push(`${path}: authority file is unreadable: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
  let data: unknown;
  let sourceText = "";
  try {
    sourceText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    data = JSON.parse(sourceText);
  }
  catch (error) { errors.push(`${path}: invalid UTF-8/JSON: ${error instanceof Error ? error.message : String(error)}`); return {}; }
  if (object(data) && sourceText !== canonicalJson(data)) errors.push(`${path}: authority file must use canonical JSON bytes without whitespace or trailing newline`);
  const guardAuthority = guardAuthorityEnvelope(data, kind, manifest, bundle, guard, path, errors);
  const digest = sha256(bytes);
  const projection = object(guard.authority);
  const expected = kind === "commit" ? projection?.crossing_sha256 : projection?.precommit_sha256;
  if (!guardAuthorityDigest(expected) || expected !== digest) errors.push(`${path}: selected authority digest must equal manifest.guard.authority.${kind === "commit" ? "crossing" : "precommit"}_sha256`);
  return guardAuthority
    ? { load: { data: guardAuthority, bytes, sha256: digest, path: realPath }, envelope: guardAuthority }
    : { load: { data: {}, bytes, sha256: digest, path: realPath } };
}

export function authorityRefValues(envelope: JsonObject, manifest: JsonObject): readonly { readonly value: unknown; readonly externalAllowed: boolean }[] {
  const values: Array<{ readonly value: unknown; readonly externalAllowed: boolean }> = [];
  for (const receipt of array(envelope.receipts).map(object).filter((entry): entry is JsonObject => !!entry)) {
    values.push({ value: receipt.evidence_ref, externalAllowed: false });
    const evaluator = object(receipt.mister_clean_evaluator);
    if (evaluator) {
      values.push({ value: evaluator.evidence_ref, externalAllowed: true });
      values.push({ value: evaluator.accepted_release_ref, externalAllowed: true });
    }
  }
  for (const value of [object(envelope.deterministic_gates)?.evidence_ref, object(envelope.no_harm)?.evidence_ref]) values.push({ value, externalAllowed: false });
  for (const action of array(manifest.actions).map(object).filter((entry): entry is JsonObject => !!entry)) {
    if (action.kind === "git_commit") {
      values.push({ value: object(action.guard_commit)?.evidence_ref, externalAllowed: false });
      values.push(...array(object(action.outcome)?.evidence).map(object).map((entry) => ({ value: entry?.evidence_ref, externalAllowed: false })));
    }
  }
  return values;
}

export async function guardEvidenceSnapshot(
  files: FilePort,
  bundleBase: string,
  envelope: JsonObject,
  manifest: JsonObject,
  errors: string[],
): Promise<ReadonlyMap<string, string>> {
  const snapshot = new Map<string, string>();
  for (const [index, entry] of authorityRefValues(envelope, manifest).entries()) {
    const ref = object(entry.value);
    if (!ref) continue;
    const label = `$.guard_authority.evidence[${index}]`;
    if (typeof ref.path === "string" && isAbsolute(ref.path)) {
      if (!entry.externalAllowed) { errors.push(`${label}.path: evidence references inside guard authority must be bundle-relative`); continue; }
      if (!(await files.isFile(ref.path))) { errors.push(`${label}: external evidence reference is not a regular file`); continue; }
      const bytes = await files.readBytes(ref.path);
      const digest = sha256(bytes);
      if (ref.sha256 !== digest) errors.push(`${label}.sha256: digest mismatch`);
      snapshot.set(resolve(ref.path), digest);
    } else {
      const loaded = await loadBytesRef(files, bundleBase, ref, label, errors, false);
      if (loaded.file && loaded.digest) snapshot.set(resolve(loaded.file), loaded.digest);
    }
  }
  return snapshot;
}

export function compareEvidenceSnapshots(before: ReadonlyMap<string, string>, after: ReadonlyMap<string, string>, errors: string[]): void {
  if (before.size !== after.size) errors.push("$.guard_authority.evidence: selected evidence set changed during live Git validation");
  for (const [path, digest] of before) if (after.get(path) !== digest) errors.push(`$.guard_authority.evidence: selected evidence drifted at ${path}`);
  for (const path of after.keys()) if (!before.has(path)) errors.push(`$.guard_authority.evidence: new selected evidence appeared at ${path}`);
}

export async function repositoryIdentity(repo: string, git: GitPort, files: FilePort): Promise<string> {
  const remote = (await git.run(repo, ["config", "--get", "remote.origin.url"], [0, 1])).stdout;
  return canonicalRemoteRepositoryIdentity(remote)
    ?? localRepositoryIdentity(await files.realpath(resolve(repo)));
}

export async function validateGuardLiveAuthority(
  bundle: JsonObject,
  report: JsonObject,
  manifest: JsonObject,
  bundlePath: string,
  repo: string,
  ports: BundlePorts,
  selectedPath: string | undefined,
  errors: string[],
): Promise<void> {
  const guard = object(manifest.guard);
  if (!guard) { errors.push("$.guard: live GUARD validation requires manifest.guard"); return; }
  const schemaVersion = String(manifest.schema_version);
  const barrier = object(guard.commit_barrier);
  const barrierState = String(barrier?.state ?? "");
  const actions = array(manifest.actions).map(object).filter((entry): entry is JsonObject => !!entry);
  const executedCommit = actions.find((action) => action.kind === "git_commit" && action.status === "executed");
  if (schemaVersion === "1.2" && (barrierState === "open" || barrierState === "crossed" || executedCommit)) {
    errors.push("$.guard.authority: live schema 1.2 open/crossed/executed-commit GUARD authorization is closed; use closeout_guard schema 1.3");
    return;
  }
  if (schemaVersion !== "1.3" || manifest.manifest_kind !== "closeout_guard") return;
  const guardStatus = String(guard.status);
  if (guardStatus !== "passed" && guardStatus !== "crossed" && !executedCommit) return;
  const kind = barrierState === "crossed" || executedCommit ? "commit" : "precommit";
  let initialRootRealpath: string | undefined;
  let initialTopRealpath: string | undefined;
  let worktrees: string[] = [repo];
  try {
    const listing = (await ports.git.run(repo, ["worktree", "list", "--porcelain"])).stdout;
    const discovered = listing.split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length).trim())
      .filter((path) => path.length > 0);
    worktrees = [...new Set([repo, ...discovered.map((path) => resolve(path))])];
  } catch (error) {
    errors.push(`$.guard_authority.worktrees: unable to independently enumerate live worktrees: ${error instanceof Error ? error.message : String(error)}`);
  }
  const initialWorktreePaths = new Set(worktrees.map((path) => resolve(path)));
  const loaded = await loadExternalGuardAuthority(
    ports.files,
    selectedPath,
    kind,
    manifest,
    bundle,
    guard,
    dirname(resolve(bundlePath)),
    repo,
    worktrees,
    errors,
  );
  if (!loaded.envelope) return;
  let originalPrecommit: GuardAuthorityLoad | undefined;
  if (kind === "commit") {
    const precommitRef = object(loaded.envelope.precommit_ref);
    const precommitLoaded = await loadExternalGuardAuthority(
      ports.files,
      typeof precommitRef?.path === "string" ? precommitRef.path : undefined,
      "precommit",
      manifest,
      bundle,
      guard,
      dirname(resolve(bundlePath)),
      repo,
      worktrees,
      errors,
    );
    originalPrecommit = precommitLoaded.load;
    if (precommitLoaded.envelope && !stableEqual(precommitLoaded.envelope, loaded.envelope.precommit)) {
      errors.push("$.guard_authority.precommit: embedded precommit differs from the separately retained precommit authority");
    }
    if (precommitRef && precommitLoaded.load && precommitRef.sha256 !== precommitLoaded.load.sha256) {
      errors.push("$.guard_authority.precommit_ref.sha256: separately retained precommit digest differs");
    }
  }
  const beforeEvidence = await guardEvidenceSnapshot(
    ports.files,
    dirname(resolve(bundlePath)),
    loaded.envelope,
    manifest,
    errors,
  );
  const candidate = object(loaded.envelope.candidate);
  const candidateRepositoryObject = candidate?.repository_object;
  const target = object(object(manifest.coordination)?.target);
  const subject = object(bundle.custody)?.subject_commit;
  try {
    const liveTop = await ports.files.realpath(resolve((await ports.git.run(repo, ["rev-parse", "--show-toplevel"])).stdout));
    const requestedRoot = await ports.files.realpath(resolve(repo));
    initialTopRealpath = liveTop;
    initialRootRealpath = requestedRoot;
    if (liveTop !== requestedRoot) errors.push("$.guard_authority.repository: live Git top-level differs from the requested repository root");
    const liveIdentity = await repositoryIdentity(repo, ports.git, ports.files);
    if (!stableEqual(object(manifest.repo)?.id, liveIdentity)) errors.push("$.guard_authority.repository: live repository identity differs from manifest.repo.id");
    if (!stableEqual(object(report.repo)?.commit, object(manifest.repo)?.commit)) errors.push("$.guard_authority.repository: report and manifest result commits differ");
    const head = (await ports.git.run(repo, ["rev-parse", "HEAD"])).stdout;
    const expectedTarget = String(target?.expected_commit ?? "");
    const targetRef = String(target?.ref ?? "");
    const liveTarget = (await ports.git.run(repo, ["rev-parse", targetRef])).stdout;
    if (kind === "precommit" && liveTarget !== expectedTarget) errors.push("$.guard_authority.target: live target differs from manifest coordination target");
    if (barrierState === "open" || String(guard.status) === "passed") {
      if (head !== String(guard.baseline_commit)) errors.push("$.guard_authority.candidate.baseline_commit: live HEAD differs from the guarded baseline");
      const unstaged = (await ports.git.run(repo, ["diff", "--name-only"])).stdout;
      const untracked = (await ports.git.run(repo, ["ls-files", "--others", "--exclude-standard"])).stdout;
      if (unstaged || untracked) errors.push("$.guard_authority: open GUARD requires no unstaged tracked or nonignored untracked files");
      const unmerged = (await ports.git.run(repo, ["diff", "--cached", "--diff-filter=U", "--name-only", "--no-renames", "-z"])).stdout;
      if (unmerged) errors.push("$.guard_authority: open GUARD requires an index without unmerged paths");
      const staged = (await ports.git.run(repo, ["diff", "--cached", "--name-only", "--no-renames", "-z"])).stdout.split("\0").filter(Boolean).sort(compareCodePoints);
      if (!stableEqual(staged, guard.staged_paths)) errors.push("$.guard_authority.candidate.staged_paths: live staged path set differs");
      const tree = (await ports.git.run(repo, ["write-tree"])).stdout;
      if (tree !== String(guard.candidate_tree)) errors.push("$.guard_authority.candidate.candidate_tree: live write-tree differs");
      const liveObject = captureRepositoryObject(repo);
      if (!stableEqual(liveObject, candidateRepositoryObject)) errors.push("$.guard_authority.candidate.repository_object: live RepositoryObject differs");
      if (liveObject.head_commit !== String(guard.baseline_commit)) errors.push("$.guard_authority.candidate.repository_object.head_commit: must equal the guarded baseline commit");
    }
    if (kind === "commit") {
      const commit = object(loaded.envelope.commit);
      const proof = object(executedCommit?.guard_commit);
      const cas = object(executedCommit?.cas);
      if (!executedCommit) errors.push("$.guard_authority.commit: crossed authority requires one executed git_commit action");
      if (commit) {
        const commitId = String(commit.commit ?? "");
        if (commit.commit !== executedCommit?.after_object) errors.push("$.guard_authority.commit.commit: must equal the executed commit action after_object");
        if (head !== commitId) errors.push("$.guard_authority.commit.commit: HEAD must equal the resulting commit");
        if (object(manifest.repo)?.commit !== commitId || object(report.repo)?.commit !== commitId) errors.push("$.guard_authority.commit.commit: manifest and report repo.commit must equal the resulting commit");
        if (object(bundle.custody)?.subject_commit !== commitId) errors.push("$.guard_authority.commit.commit: bundle custody subject must equal the resulting commit");
        if (commit.commit_tree !== guard.candidate_tree) errors.push("$.guard_authority.commit.commit_tree: must equal guard candidate_tree");
        if (commit.ref !== targetRef) errors.push("$.guard_authority.commit.ref: must equal the coordination target ref");
        if (commit.parent !== candidate?.baseline_commit) errors.push("$.guard_authority.commit.parent: must equal the guarded baseline commit");
        if (!stableEqual(commit.cas, cas)) errors.push("$.guard_authority.commit.cas: must equal the executed commit CAS/mutex/fencing projection");
        if (proof && !stableEqual(proof.receipt_ids, barrier?.receipt_ids)) errors.push("$.guard_authority.commit: commit proof receipts differ from the barrier projection");
        const liveCommit = (await ports.git.run(repo, ["rev-parse", commitId], [0, 128])).stdout;
        if (liveCommit !== commitId) errors.push("$.guard_authority.commit.commit: commit is not the live resolved commit");
        if (liveTarget !== commitId) errors.push("$.guard_authority.commit.commit: live target does not resolve to the guarded result commit");
        const liveTree = (await ports.git.run(repo, ["rev-parse", `${commitId}^{tree}`], [0, 128])).stdout;
        if (liveTree !== String(commit.commit_tree)) errors.push("$.guard_authority.commit.commit_tree: commit tree differs");
        const parents = (await ports.git.run(repo, ["show", "-s", "--format=%P", commitId])).stdout.split(/\s+/).filter(Boolean);
        if (parents.length !== 1 || parents[0] !== commit.parent) errors.push("$.guard_authority.commit.parent: commit must have exactly the guarded baseline parent");
        const indexTree = (await ports.git.run(repo, ["write-tree"])).stdout;
        if (indexTree !== String(commit.commit_tree)) errors.push("$.guard_authority.commit.commit_tree: live index tree differs");
        const postObject = captureRepositoryObject(repo);
        if (!stableEqual(postObject, commit.postcommit_repository_object)) errors.push("$.guard_authority.commit.postcommit_repository_object: live RepositoryObject differs");
        if (postObject.head_commit !== commitId) errors.push("$.guard_authority.commit.postcommit_repository_object.head_commit: must equal the resulting commit");
        if (subject && subject !== commitId) errors.push("$.guard_authority.commit.commit: must equal the bundle custody subject commit");
      }
      const unstaged = (await ports.git.run(repo, ["diff", "--name-only", "-z"])).stdout;
      const untracked = (await ports.git.run(repo, ["ls-files", "--others", "--exclude-standard", "-z"])).stdout;
      const unmerged = (await ports.git.run(repo, ["diff", "--cached", "--diff-filter=U", "--name-only", "--no-renames", "-z"])).stdout;
      if (unstaged || untracked || unmerged) errors.push("$.guard_authority: crossed GUARD requires a clean tracked/untracked worktree and resolved index");
    }
  } catch (error) {
    errors.push(`$.guard_authority.live: ${error instanceof Error ? error.message : String(error)}`);
  }
  let afterWorktrees = [...initialWorktreePaths];
  try {
    const listing = (await ports.git.run(repo, ["worktree", "list", "--porcelain"])).stdout;
    afterWorktrees = listing.split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => resolve(line.slice("worktree ".length).trim()))
      .filter((path) => path.length > 0);
    if (!stableEqual([...new Set(afterWorktrees)].sort(compareCodePoints), [...initialWorktreePaths].sort(compareCodePoints))) {
      errors.push("$.guard_authority.worktrees: live worktree set changed during validation");
    }
  } catch (error) {
    errors.push(`$.guard_authority.worktrees: unable to re-enumerate live worktrees: ${error instanceof Error ? error.message : String(error)}`);
  }
  const reloadedAuthority = await loadExternalGuardAuthority(
    ports.files,
    selectedPath,
    kind,
    manifest,
    bundle,
    guard,
    dirname(resolve(bundlePath)),
    repo,
    afterWorktrees,
    errors,
  );
  if (loaded.load && reloadedAuthority.load && loaded.load.sha256 !== reloadedAuthority.load.sha256) {
    errors.push("$.guard_authority: selected authority file changed during live Git validation");
  }
  if (kind === "commit" && originalPrecommit) {
    const precommitRef = object(loaded.envelope.precommit_ref);
    const reloadedPrecommit = await loadExternalGuardAuthority(
      ports.files,
      typeof precommitRef?.path === "string" ? precommitRef.path : undefined,
      "precommit",
      manifest,
      bundle,
      guard,
      dirname(resolve(bundlePath)),
      repo,
      afterWorktrees,
      errors,
    );
    if (reloadedPrecommit.load && originalPrecommit.sha256 !== reloadedPrecommit.load.sha256) errors.push("$.guard_authority.precommit: separately retained precommit changed during live Git validation");
  }
  const afterEvidence = await guardEvidenceSnapshot(
    ports.files,
    dirname(resolve(bundlePath)),
    loaded.envelope,
    manifest,
    errors,
  );
  compareEvidenceSnapshots(beforeEvidence, afterEvidence, errors);
  try {
    const afterBytes = await ports.files.readBytes(loaded.load?.path ?? "");
    const afterSha = sha256(afterBytes);
    if (afterSha !== loaded.load?.sha256) errors.push("$.guard_authority: selected authority file changed during live Git validation");
  } catch (error) {
    errors.push(`$.guard_authority: selected authority file could not be re-read after live Git validation: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const finalTop = await ports.files.realpath(resolve((await ports.git.run(repo, ["rev-parse", "--show-toplevel"])).stdout));
    const finalRoot = await ports.files.realpath(resolve(repo));
    if (finalTop !== finalRoot || finalTop !== initialTopRealpath || finalRoot !== initialRootRealpath) errors.push("$.guard_authority.repository: repository root changed during final custody validation");
    const finalIdentity = await repositoryIdentity(repo, ports.git, ports.files);
    if (!stableEqual(object(manifest.repo)?.id, finalIdentity)) errors.push("$.guard_authority.repository: repository identity changed during final custody validation");
    const finalHead = (await ports.git.run(repo, ["rev-parse", "HEAD"])).stdout;
    const finalUnstaged = (await ports.git.run(repo, ["diff", "--name-only", "-z"])).stdout;
    const finalUntracked = (await ports.git.run(repo, ["ls-files", "--others", "--exclude-standard", "-z"])).stdout;
    const finalUnmerged = (await ports.git.run(repo, ["diff", "--cached", "--diff-filter=U", "--name-only", "--no-renames", "-z"])).stdout;
    if (finalUnstaged || finalUntracked || finalUnmerged) errors.push("$.guard_authority: final live repository state is dirty or has unmerged index entries");
    const finalTarget = (await ports.git.run(repo, ["rev-parse", String(target?.ref ?? "")])).stdout;
    const finalExpected = kind === "commit" ? String(object(loaded.envelope.commit)?.commit ?? "") : String(target?.expected_commit ?? "");
    if (finalTarget !== finalExpected) errors.push("$.guard_authority.target: target ref moved after final custody validation");
    if (kind === "precommit") {
      if (finalHead !== String(guard.baseline_commit)) errors.push("$.guard_authority.candidate.baseline_commit: HEAD changed during final custody validation");
      const finalTree = (await ports.git.run(repo, ["write-tree"])).stdout;
      if (finalTree !== String(guard.candidate_tree)) errors.push("$.guard_authority.candidate.candidate_tree: final write-tree differs");
      const finalObject = captureRepositoryObject(repo);
      if (!stableEqual(finalObject, candidateRepositoryObject)) errors.push("$.guard_authority.candidate.repository_object: final RepositoryObject differs");
    } else {
      const finalCommit = String(object(loaded.envelope.commit)?.commit ?? "");
      if (finalHead !== finalCommit) errors.push("$.guard_authority.commit.commit: final HEAD differs from the resulting commit");
      const finalTree = (await ports.git.run(repo, ["write-tree"])).stdout;
      if (finalTree !== String(object(loaded.envelope.commit)?.commit_tree ?? "")) errors.push("$.guard_authority.commit.commit_tree: final index tree differs");
      const finalObject = captureRepositoryObject(repo);
      if (!stableEqual(finalObject, object(loaded.envelope.commit)?.postcommit_repository_object)) errors.push("$.guard_authority.commit.postcommit_repository_object: final RepositoryObject differs");
    }
  } catch (error) {
    errors.push(`$.guard_authority.final_live: ${error instanceof Error ? error.message : String(error)}`);
  }
}
