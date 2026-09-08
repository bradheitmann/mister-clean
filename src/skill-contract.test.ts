import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  RELEASE_ATTESTATION_FILE,
  REQUIRED_ENTRYPOINT_PATHS,
  createReleaseAttestation,
  generateAttestedPackageManifest,
  releaseAttestationBytes,
} from "./attestation.js";
import { generatePackageManifest, STACK_MARKERS } from "./closeout/inspection.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const skill = await readFile(join(ROOT, "SKILL.md"), "utf8");
const authority = await readFile(join(ROOT, "references", "authorization-and-modes.md"), "utf8");
const openai = await readFile(join(ROOT, "agents", "openai.yaml"), "utf8");
const dashboard = await readFile(join(ROOT, "assets", "codebase-state-dashboard", "index.html"), "utf8");
const scorecard = await readFile(join(ROOT, "assets", "codebase-state-dashboard", "model-scorecard.html"), "utf8");
const productMark = await readFile(join(ROOT, "assets", "codebase-state-dashboard", "product-mark.svg"), "utf8");
const orchestrationGoal = await readFile(join(ROOT, "templates", "orchestration-goal.md"), "utf8");
const tokensPath = join(ROOT, "assets", "codebase-state-dashboard", "dashboard-tokens.css");
const manifest = JSON.parse(await readFile(join(ROOT, "assets", "action-manifest.json"), "utf8")) as Record<string, unknown>;
const regressionTemplate = JSON.parse(await readFile(join(ROOT, "assets", "regression-delta.json"), "utf8")) as Record<string, unknown>;
const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
  bin: Record<string, string>;
  files: string[];
  name: string;
  version: string;
};

describe("invocation contract", () => {
  it("defaults a bare invocation to CLOSE rather than silently downgrading it to AUDIT", () => {
    expect(skill).toContain("A bare `$mister-clean` invocation means");
    expect(skill).toContain("Never downgrade a bare invocation to `AUDIT`");
  });

  it("makes the invocation standing authority while retaining explicit activation", () => {
    expect(skill).toContain("Invocation is standing authorization");
    expect(authority).toContain("does not ask again for these actions");
    expect(openai).toContain("allow_implicit_invocation: false");
    expect(openai).not.toContain("explicit_invocation_required");
    expect(openai.replace("# NO default_prompt", "")).not.toContain("default_prompt");
    expect(openai).not.toContain("audit this repository");
  });

  it("starts the action ledger authorized but empty", () => {
    expect(manifest.schema_version).toBe("1.2");
    expect(manifest.execution_state).toBe("authorized");
    expect(manifest.authorization_basis).toMatchObject({ source: "skill_invocation", standing: true });
    expect(manifest.actions).toEqual([]);
    expect(skill.replaceAll(/\s+/g, " ")).toContain("Claim a debt in its action manifest immediately before paying it");
  });

  it("keeps current-branch push and hard safety boundaries explicit", () => {
    expect(authority).toContain("pushing the current branch");
    expect(skill).toContain("current-branch push");
    for (const boundary of [
      "unrecoverable destruction",
      "security/audit-control bypass",
      "another owner's live work",
      "production deployment",
      "third parties",
    ]) {
      expect(skill).toContain(boundary);
    }
  });

  it("does not treat process names or parent chains alone as termination authority", async () => {
    const awareness = await readFile(join(ROOT, "references", "situational-awareness.md"), "utf8");
    expect(skill).toContain("process signaling");
    expect(awareness).toContain("durable task/session\n  record plus the live PID, start time");
    expect(awareness).toContain("command string or parent chain alone is not ownership");
  });

  it("ships an optional persistent goal with monotonic progress and unchanged authority", () => {
    expect(skill).toContain("templates/orchestration-goal.md");
    expect(orchestrationGoal).toContain("a bare\n`$mister-clean` invocation remains sufficient authorization");
    expect(orchestrationGoal).toContain("open_at_boundary_observation_ids` set is empty");
    expect(orchestrationGoal).toContain("After two consecutive attempts");
    expect(orchestrationGoal).toContain("The goal does not widen Mister Clean's scope");
    expect(orchestrationGoal).toContain("terminalizing a story and updating its epic and\n   rollup are one transaction");
  });

  it("requires a closing candidate to contain the current target", async () => {
    const successor = await readFile(join(ROOT, "references", "successor-readiness.md"), "utf8");
    const isolation = await readFile(join(ROOT, "references", "write-lane-isolation.md"), "utf8");
    expect(skill).toContain("the closing candidate contains the current target state");
    expect(successor).toContain("The closing candidate contains the current target");
    expect(isolation).toContain("merge-base plus left/right");
  });

  it("blocks shared-integration writes before the first mutation", async () => {
    const concurrency = await readFile(join(ROOT, "references", "concurrent-remediation.md"), "utf8");
    expect(skill).toContain("stop mutation and route to\n`concurrent-remediation.md`");
    expect(skill).toContain("Each modifying delegate then receives its own\nworktree and branch before its first write");
    expect(concurrency).toContain("Admission gate before the first write");
    expect(concurrency.replaceAll(/\s+/g, " ")).toContain("freeze all writers and preserve the new object");
    expect(concurrency).toContain("push it merely because the operator asked to keep the remote current");
  });

  it("guards an exact candidate tree without defanging the cleanup agent", async () => {
    const guard = await readFile(join(ROOT, "references", "continuous-clean-development.md"), "utf8");
    const product = await readFile(join(ROOT, "references", "control-plane-product-spec.md"), "utf8");
    const evaluations = await readFile(join(ROOT, "references", "behavioral-evals.md"), "utf8");
    expect(skill).toContain("`GUARD`");
    expect(skill).toContain("git write-tree");
    expect(skill).toContain("Every Mister Clean commit candidate");
    expect(guard).toContain("No agent owns an immutable tree object");
    expect(guard).toContain("Mister Clean may receive custody through a recorded handoff");
    expect(guard).toContain("Any Mister Clean mutation invalidates the earlier QA receipt");
    expect(guard).toContain("Across pods");
    expect(guard.toLocaleLowerCase("und").replaceAll(/\s+/g, " ")).toContain("holdout remains the final independent pass");
    expect(guard).toContain("Do not create a commit merely to obtain something QA can name");
    expect(guard).toContain("Do not batch several\nuncertified commits and test only their aggregate");
    expect(product).toContain("Run this gate for every commit candidate");
    expect(product).toContain("the registry package and website must\nidentify the same accepted version");
    expect(evaluations).toContain("Mister Clean batches uncertified self-commits");
  });

  it("serializes repository-wide verification without charging contention to the candidate or model", async () => {
    const concurrency = await readFile(join(ROOT, "references", "concurrent-remediation.md"), "utf8");
    const doctrine = await readFile(join(ROOT, "references", "verification-doctrine.md"), "utf8");
    const normalizedSkill = skill.replaceAll(/\s+/g, " ");
    const normalizedConcurrency = concurrency.replaceAll(/\s+/g, " ");
    const normalizedDoctrine = doctrine.replaceAll(/\s+/g, " ");

    expect(normalizedSkill).toContain("Full root suites use a Git-common-directory lease and registered supervisor");
    expect(normalizedSkill).toContain("Busy emits a typed `resource_contention` no-start receipt excluded from model scoring");
    expect(normalizedConcurrency).toContain("Both acquire the same SQLite exclusive transaction, keyed to the repository's Git common directory");
    expect(normalizedConcurrency).toContain("A per-lease atomic supervisor lock serializes registration before the target starts");
    expect(normalizedConcurrency).toContain("PIDs are paired with process-birth identities");
    expect(normalizedConcurrency).toContain("A unique inherited custody marker detects a target that daemonizes outside its process group");
    expect(normalizedConcurrency).toContain("never steals ownership by elapsed time");
    expect(normalizedConcurrency).toContain("a raw duplicate root suite is a procedure breach rather than useful corroboration");
    expect(normalizedDoctrine).toContain("Lease refusal occurs before evidence creation and emits a typed `resource_contention` no-start receipt");
  });

  it("separates generic GUARD history from externally held live closeout authority", async () => {
    const guard = await readFile(join(ROOT, "references", "continuous-clean-development.md"), "utf8");
    const concurrency = await readFile(join(ROOT, "references", "concurrent-remediation.md"), "utf8");
    const claims = await readFile(join(ROOT, "references", "verification-and-claims.md"), "utf8");
    const readme = await readFile(join(ROOT, "README.md"), "utf8");
    const normalizedSkill = skill.replaceAll(/\s+/g, " ");
    const normalizedClaims = claims.replaceAll(/\s+/g, " ");
    expect(normalizedSkill).toContain("Generic action manifests use schema 1.2");
    expect(normalizedSkill).toContain("`closeout_guard` schema 1.3");
    expect(guard).toContain("--accepted-evaluator <absolute accepted-release path>");
    expect(guard).toContain("--guard-authority <absolute guard-authority path>");
    expect(concurrency).toContain("New coordination runs use 1.2");
    expect(concurrency).toContain("Schema 1.3 does not replace the schema-1.2 operation graph");
    expect(normalizedClaims).toContain("Any live bundle that records an executed `git_commit` requires an operator-selected accepted release");
    expect(normalizedClaims).toContain("schema-1.3 boundary additionally requires a separately retained current guard authority");
    expect(normalizedClaims).toContain("current exact-object and record coherence");
    expect(normalizedClaims).toContain("does not prove actor authorship");
    expect(normalizedClaims).toContain("historical mutex or compare-and-swap execution");
    expect(claims).toContain("`--structural` checks only bundle shape");
    expect(readme).toContain("Any live bundle with an executed `git_commit` requires an absolute");
    expect(readme).toContain("additionally requires an absolute\n`--guard-authority` path");
    expect(readme).toContain("Both options are valid only for live bundle validation and are rejected with\n`--structural`");
    expect(readme).toContain("every newly prepared\nGUARD closeout is schema 1.3 from initialization");
  });

  it("documents the narrow public local control-plane capability without expanding attestation claims", async () => {
    const readme = await readFile(join(ROOT, "README.md"), "utf8");
    const security = await readFile(join(ROOT, "SECURITY.md"), "utf8");
    const evaluations = await readFile(join(ROOT, "references", "behavioral-evals.md"), "utf8");
    const product = await readFile(join(ROOT, "references", "control-plane-product-spec.md"), "utf8");
    const controlPlaneSource = await readFile(join(ROOT, "src", "control-plane.ts"), "utf8");
    expect(skill).toContain("@bradheitmann/mister-clean/control-plane");
    expect(skill).toContain("admits queries/state only");
    expect(readme).toContain('from "@bradheitmann/mister-clean/control-plane"');
    expect(readme).toContain("`dispatch_supported: false`");
    expect(readme).toContain("`execution_supported: false`");
    expect(readme).toContain("`LocalControlPlaneRuntimeOptions`");
    expect(readme).toContain("`RunningLocalControlPlaneRuntime`");
    expect(readme).toContain("Route probes,\nevidence verifiers, clocks, stores, services, authenticators, and adapters are\ninternal composition capabilities");
    expect(security).toContain("exact own transport fields only");
    expect(security).toContain("export map is a supported-capability boundary, not a sandbox");
    expect(REQUIRED_ENTRYPOINT_PATHS).not.toContain("./dist/control-plane.js");
    expect(controlPlaneSource).not.toContain("bindRuntimeAttestation");
    expect(readme).toContain("`./dist/control-plane.js` is not a required entrypoint");
    expect(readme).toContain("performs no runtime-attestation binding before use");
    expect(security).toContain("bytes are covered by the package manifest and claim\nscope");
    expect(product).toContain("Current public package boundary");
    expect(product).toContain("terminal `closeout_guard` schema-1.3 records");
    expect(product).toContain("not a claim that the broader directive-routing roadmap already ships");
    expect(product).toContain("A surface counts as shipped only when");
    expect(evaluations).toContain("Sanitized wrapper reconstructs inheritable authority");
  });

  it("rejects stale plans with versioned coordination-domain CAS", async () => {
    const concurrency = await readFile(join(ROOT, "references", "concurrent-remediation.md"), "utf8");
    expect(skill).toContain("fenced lease, invariant-domain CAS, and combined-tree gate");
    expect(concurrency).toContain("serialize the plan, not only the write");
    expect(concurrency).toContain("semantic conflict key");
    expect(concurrency).toContain("expected_version + expected_state_digest");
    expect(concurrency).toContain("A mismatch rejects integration and requires a new\nplan and new attestations");
    expect(concurrency).toContain("Commutativity is a bilateral proof obligation");
  });

  it("preserves role authority across continuation and refuses model attribution on identity mismatch", async () => {
    const concurrency = await readFile(join(ROOT, "references", "concurrent-remediation.md"), "utf8");
    const evaluations = await readFile(join(ROOT, "references", "behavioral-evals.md"), "utf8");
    const trial = await readFile(join(ROOT, "evals", "model-hygiene-trial.md"), "utf8");
    expect(skill).toContain("`continue` resumes the same role, read/write scope, and task");
    expect(skill).toContain("Retain findings as `identity_unbound`");
    expect(skill).toContain("Tab labels/self-reports are not execution identity");
    expect(skill).toContain("provider route before dispatch/scoring");
    expect(skill).toContain("never backfill unknown identity");
    expect(concurrency).toContain("Role authority survives continuation and compaction unchanged");
    expect(concurrency).toContain("identity_unbound");
    expect(evaluations).toContain("Read-only verifier writes after continuation");
    expect(evaluations).toContain("Harness identity and worker self-report disagree");
    expect(trial).toContain("identity_unbound");
    expect(trial).toContain("pane/tab title only as the intended configuration");
    expect(trial).toContain("Read them back again immediately before");
    expect(evaluations).toContain("Restarted harness inherits another pane's model");
  });

  it("binds installed runtime identity without a self-referential attestation", async () => {
    const liveness = await readFile(join(ROOT, "references", "tool-liveness.md"), "utf8");
    expect(skill).toContain('bin/mister-clean.js" attest');
    expect(skill).toContain("never mix prose and executables from different installations");
    expect(liveness).toContain("missing or stale");
    expect(liveness).toContain("excluded from the manifest it attests");
    expect(liveness).toContain("production\nentrypoints fail closed");
    expect(liveness).toContain("Avoid the attestation self-reference trap");
    expect(packageJson.files).toContain("RELEASE_ATTESTATION.json");
  });

  it("ships and manifest-binds the license notice for bundled YAML", async () => {
    const notices = await readFile(join(ROOT, "THIRD_PARTY_NOTICES.md"), "utf8");
    expect(packageJson.files).toContain("THIRD_PARTY_NOTICES.md");
    expect(notices).toContain("Mister Clean's standalone CLI bundles the `yaml` package");
    expect(notices).toContain(`Copyright Eemeli Aro <${["eemeli", "gmail.com"].join("@")}>`);
    const manifest = await generateAttestedPackageManifest(ROOT);
    expect(manifest.entries.map((entry) => entry.path)).toContain("./THIRD_PARTY_NOTICES.md");
  });

  it("binds a policy-derived detector universe and rejects future event evidence", async () => {
    const doctrine = await readFile(join(ROOT, "references", "verification-doctrine.md"), "utf8");
    const evaluations = await readFile(join(ROOT, "references", "behavioral-evals.md"), "utf8");
    expect(skill).toContain("Freeze applicable comparators before the first mutation");
    expect(skill).toContain("Run the complete applicable suite on the closing object");
    expect(skill).toContain("references/verification-doctrine.md");
    expect(doctrine).toContain("Evidence cannot be observed in the future");
    expect(doctrine).toContain("`manifest_observed_at` are event claims and fail when future-dated");
    expect(doctrine).toContain("External producer serialization is a versioned contract");
    expect(doctrine).toContain("representative producer-shaped positive and near-miss negatives");
    expect(doctrine).toContain("Privileged declarative inputs require an exhaustive context census");
    expect(doctrine).toContain("exact action-and-version input\nkey allowlists");
    expect(doctrine).toContain("Generated acceptance begins with exact clean materialization");
    expect(doctrine).toContain("Search custody is a root-qualified topology contract");
    expect(doctrine).toContain("Public and successor surfaces are measured, not inferred");
    expect(skill).toContain("is `NOT VERIFIED` unless those artifacts are reconstructed from the exact candidate");
    expect(skill).toContain("audit repository-boundaries . --json");
    expect(skill).toContain("Prefer positive enumeration of allowed search roots");
    expect(skill).toContain("actual prospective package file list");
    expect(evaluations).toContain("Comparator ledger disagrees with preserved detector bytes");
    expect(evaluations).toContain("Guessed external-tool JSON passes an authority validator (v7.0.0)");
    expect(evaluations).toContain("guessed\nflat array, an invented embedded ID, a missing map key, value type drift");
    expect(evaluations).toContain("Extra action input exfiltrates privileged context (v7.0.0)");
    expect(evaluations).toContain("github[format('{0}', 'token')]");
    expect(evaluations).toContain("Case-folded authority context escapes a field-narrow census (v7.0.0)");
    expect(evaluations).toContain("GITHUB.token");
    expect(evaluations).toContain("Ignored warm output manufactures a cold acceptance (v7.0.0)");
    expect(evaluations).toContain("Nested holdout escapes a basename-only exclusion (v7.0.0)");
    expect(evaluations).toContain("Tracked privacy scan misses the prospective package (v7.0.0)");
    expect(evaluations).toContain("Phantom successor command receives substring credit (v7.0.0)");
    expect(evaluations).toContain("Post-seal mutation retains the original PASS (v7.0.0)");
    expect(regressionTemplate.schema_version).toBe("1.4");
    expect(regressionTemplate.detector_coverage).toMatchObject({
      registry_version: "1",
      required_detector_ids: ["planning_graph", "semantic_boundary"],
      applicability: expect.arrayContaining([
        { detector_id: "public_safety", disposition: "not_applicable", basis: "empty_tracked_surface" },
      ]),
    });
  });

  it("treats corpus sealing as byte-bound verification rather than a filesystem lock", () => {
    const normalized = skill.replaceAll(/\s+/g, " ");
    expect(normalized).toContain("A seal is not a timestamp, hash, or filesystem lock");
    expect(normalized).toContain("stop all writers and release ownership");
    expect(normalized).toContain("read-only custody or a copied frozen object");
    expect(normalized).toContain("Mandatory post-review recapture and compatible comparison precede acceptance/integration");
    expect(normalized).toContain("Any byte, path, or metadata change invalidates the seal and forces re-freeze");
    expect(normalized).toContain("never regenerate evidence in place");
    expect(normalized).toContain("incompatible measurement is measurement debt, not mutation");
  });

  it("requires a complete governed-corpus partition and semantic validation outcomes", async () => {
    const successor = await readFile(join(ROOT, "references", "successor-readiness.md"), "utf8");
    const evaluations = await readFile(join(ROOT, "references", "behavioral-evals.md"), "utf8");
    const claims = await readFile(join(ROOT, "references", "verification-and-claims.md"), "utf8");
    expect(skill).toContain("unclassified planning artifacts");
    expect(successor).toContain("class counts reconcile to the census");
    expect(evaluations).toContain("66 of 68 artifacts are");
    expect(evaluations).toContain("PASS with 7/10 verified");
    expect(claims).toContain("Validation results are tuples, not exit codes");
    expect(skill).toContain("exit zero does not overrule warnings,\npartial coverage, skips, or semantic failures");
  });

  it("keeps complexity, evidence, and new product-surface claims honest", async () => {
    const evaluations = await readFile(join(ROOT, "references", "behavioral-evals.md"), "utf8");
    const claims = await readFile(join(ROOT, "references", "verification-and-claims.md"), "utf8");
    const normalizedSkill = skill.replace(/\s+/gu, " ");
    const requiredComplexityPolicy = "Use one analyzer and count generated shippable mirrors in shipped weight, never authored structure; keep evidence outside the measured subject.";
    expect(normalizedSkill).toContain(requiredComplexityPolicy);
    expect(skill).toContain("A path plus digest is an evidence locator, not proof");
    expect(skill).toContain("A green root typecheck does not cover excluded\ndirectories");
    expect(skill).toContain("Every production executable surface needs a reachable canonical syntax/static/type/build/test gate");
    expect(skill).toContain("Fixture/demo projections\nmust identify themselves conspicuously");
    expect(claims).toContain("Evidence locators are not claims");
    expect(claims).toContain("Coverage of new product surfaces");
    expect(evaluations).toContain("Generated distribution mirror counted as authored complexity");
    expect(evaluations).toContain("Root typecheck excludes the new product surface");
    expect(evaluations).toContain("Authenticated evidence reference manufactures delivery");
    expect(evaluations).toContain("Unlabeled fixture presented as current repository truth");
    expect(evaluations).toContain("Presentation-local accounting and planning drift");
    expect(evaluations).toContain("Ineligible agent wins a partial-taxonomy ranking");
    expect(evaluations).toContain("Verification receipt binds every role to the baseline object");
    expect(evaluations).toContain("Rejection-only route advertised as an operating control plane");
    expect(evaluations).toContain("Local socket can hold closeout open forever");
    expect(evaluations).toContain("Clipboard success without clipboard evidence");
    expect(evaluations).toContain("Theme variety changes semantic truth");
    expect(normalizedSkill).toContain("Toggles/migrations need reused A→B/B→A/system/host-handoff traces, clear hosts, and path parity; fresh states fail");
    expect(evaluations).toContain("Fresh-state toggle hides one-way and host-migration cleanup (v7.0.0)");
    expect(evaluations).toContain("Historical import rewrites observation into current truth");
    expect(evaluations).toContain("Import metadata claims bytes the importer never loads");
    expect(evaluations).toContain("Safe import builder fronts a permissive schema");
    expect(evaluations).toContain("Import batch identity changes when input order changes");
    expect(evaluations).toContain("Incomplete legacy dispatch self-asserts authority");
    expect(evaluations).toContain("Zero issues renders CLEAN without the closing contract");
    expect(evaluations).toContain("Manifest label wraps UI-selected unbound issues");
    expect(evaluations).toContain("URL-shaped snapshot source has no live producer");
    expect(evaluations).toContain("Shallow read-model cast accepts a plausible shell");
    expect(evaluations).toContain("Seven-page shell is blank without JavaScript");
    expect(evaluations).toContain("General design lint passes while the selected lane fails");
    expect(evaluations).toContain("Entry projection contradicts ratified authority (v7.0.0)");
    expect(evaluations).toContain("Declared routing classes are behaviorally identical (v7.0.0)");
    expect(evaluations).toContain("Zero-build JavaScript package sits outside every static gate (v7.0.0)");
    expect(evaluations).toContain("Durable idempotency state grows forever (v7.0.0)");
    expect(evaluations).toContain("Agent evidence omits the actual execution route (v7.0.0)");
    expect(evaluations).toContain("Short identifier resolves to two unrelated authorities (v7.0.0)");
  });

  it("rejects a positive review whose own body contains payable debt", async () => {
    const doctrine = await readFile(join(ROOT, "references", "verification-doctrine.md"), "utf8");
    const guard = await readFile(join(ROOT, "references", "continuous-clean-development.md"), "utf8");
    const evaluations = await readFile(join(ROOT, "references", "behavioral-evals.md"), "utf8");
    expect(skill.replaceAll(/\s+/g, " ")).toContain("A positive headline containing any substantiated payable finding is a rejection");
    expect(skill).toContain("final independent review passes with no substantiated payable finding in its\n  body");
    expect(doctrine).toContain("`LOW`, `non-blocking`, and\n  `recommend fixing before merge`");
    expect(guard).toContain("reads and reconciles the receipt body, not only its headline");
    expect(evaluations).toContain("Positive review contains a payable low-severity finding (v6.2.2)");
    expect(evaluations).toContain("hang-on-throw defect");
  });

  it("invalidates all commit-bound proof after any late mutation, even for NOT CLEAN", async () => {
    const evaluations = await readFile(join(ROOT, "references", "behavioral-evals.md"), "utf8");
    expect(skill).toContain("The evidence freeze is the final state transition");
    expect(skill).toContain("regenerate it before either verdict");
    expect(evaluations).toContain("Late mutation after the evidence freeze (v6.1.4)");
    expect(evaluations).toContain("never permits an internally inconsistent or parent-bound evidence bundle");
  });

  it("requires generated planning-debt sidecars to use a portable executable command", async () => {
    const evaluations = await readFile(join(ROOT, "references", "behavioral-evals.md"), "utf8");
    expect(evaluations).toContain("Planning-debt scaffold must validate live (v6.1.5)");
    expect(evaluations).toContain("mister-clean audit planning . --json");
    expect(evaluations).not.toContain("mister-clean audit planning --json <repository>");
  });

  it("keeps repository prose out of template-sensitive generated debt fields", async () => {
    const evaluations = await readFile(join(ROOT, "references", "behavioral-evals.md"), "utf8");
    expect(evaluations).toContain("Repository prose resembles template syntax (v6.1.6)");
    expect(evaluations).toContain("exact diagnostic in the referenced planning-audit evidence");
  });

  it("treats model evaluation as tuple coverage with matched contrasts", async () => {
    const trial = await readFile(join(ROOT, "evals", "model-hygiene-trial.md"), "utf8");
    expect(skill).toContain("evals/model-hygiene-trial.md");
    expect(trial).toContain("Coverage is a tensor, not a leaderboard");
    expect(trial).toContain("dispatch_attempted -> accepted_by_harness -> completed");
    expect(trial).toContain("Reasoning-level contrast");
    expect(trial).toContain("Harness contrast");
    expect(trial).toContain("recoverable Pi message");
    expect(trial).toContain("send `continue` plus Enter once, verify visible uptake");
    expect(trial).toContain("A recoverable harness pause\ndoes not end or duplicate the sample");
    expect(trial).toContain("read-only verifier success and write-heavy implementer incidents are different");
    expect(trial).toContain("untested | diagnostic_only | role_evidence | trial_pending | qualified");
    expect(trial).toContain("Receipts are immutable, append-only, and content-addressed");
    expect(trial).toContain("Hashing a mutable evidence locator is not custody");
    expect(trial).toContain("full 40-character target commit");
    expect(trial).toContain("`assertion_only`");
    expect(trial).toContain("universe_status: not_frozen");
    expect(trial).toContain("clock_status: valid | invalid | not_recorded");
    expect(trial).toContain("projection_validation_receipt");
  });
});

describe("stack-adapter contract", () => {
  it("keeps an adapter section for every executable ecosystem, including shell", async () => {
    const adapters = await readFile(join(ROOT, "references", "stack-adapters.md"), "utf8");
    for (const ecosystem of [...Object.keys(STACK_MARKERS), "shell"]) {
      expect(adapters).toContain(`## ${ecosystem}`);
    }
  });
});

describe("entrypoint navigability contract", () => {
  it("keeps SKILL.md within the compact-router budget", () => {
    expect(skill.split("\n").length - 1).toBeLessThanOrEqual(300);
    expect(Buffer.byteLength(skill)).toBeLessThanOrEqual(20_000);
  });

  it("routes every reference, evaluation, and template without inlining the campaign", async () => {
    for (const directory of ["references", "evals", "templates"] as const) {
      const entries = await readdir(join(ROOT, directory));
      for (const entry of entries.filter((candidate) => candidate.endsWith(".md") || candidate.endsWith(".xml"))) {
        const relative = `${directory}/${entry}`;
        expect(skill, `missing trigger route for ${relative}`).toContain(relative);
      }
    }
  });

  it("keeps topology policy-derived and closeout authority non-interruptive", async () => {
    const awareness = await readFile(join(ROOT, "references", "situational-awareness.md"), "utf8");
    const momentum = await readFile(join(ROOT, "references", "intelligent-momentum.md"), "utf8");
    const claims = await readFile(join(ROOT, "references", "verification-and-claims.md"), "utf8");
    expect(skill).toContain("according to repository policy");
    expect(awareness).not.toContain("ask the user what you cannot detect");
    expect(awareness).not.toContain("every worktree must be gone");
    expect(momentum).not.toContain("one `main`, one working branch");
    expect(claims).toContain("mandatory dimension in `CLOSE`");
  });
});

describe("canonical report surfaces", () => {
  it("puts acceptance criteria on every human-facing canonical surface", async () => {
    const surfaces = [
      "assets/closeout-report.json",
      "templates/session-close-report.md",
      "templates/hygiene-report.md",
      "examples/example-report.md",
      "SKILL.md",
    ];
    const missing: string[] = [];
    for (const surface of surfaces) {
      const content = (await readFile(join(ROOT, surface), "utf8")).toLowerCase();
      if (!content.includes("acceptance crit") && !content.includes("acceptance_criteria")) missing.push(surface);
    }
    expect(missing).toEqual([]);
  });
});

describe("dashboard contract", () => {
  it("keeps the optional dashboard reachable and token-bound", async () => {
    expect(skill).toContain("assets/codebase-state-dashboard/index.html");
    expect(dashboard).toContain("./model-scorecard.html");
    expect(scorecard).toContain("./index.html");
    await expect(readFile(tokensPath, "utf8")).resolves.toContain("--okoa-");
    await expect(readFile(tokensPath, "utf8")).resolves.toContain("url('./fonts/inter/Inter-Regular.otf')");
    expect(packageJson.files).toContain("assets/codebase-state-dashboard/fonts/**");
    expect(packageJson.files).toContain("assets/codebase-state-dashboard/product-mark.svg");
    for (const contract of [
      "--okoa-dataviz-count-duration",
      "--okoa-dataviz-draw-duration",
      "--okoa-dataviz-series",
      "prefers-reduced-motion: reduce",
      "MISTER_CLEAN_DASHBOARD_STATE",
    ]) {
      expect(dashboard).toContain(contract);
    }
  });

  it("keeps the dashboard non-authoritative and limits identity to the approved product mark", () => {
    expect(dashboard.toLowerCase()).toContain("derived projection");
    expect(dashboard).toContain("does not establish CLEAN");
    expect(skill).toContain("Optional visual state projection");
    expect(dashboard.toLowerCase()).not.toContain("<img");
    expect(dashboard.toLowerCase()).not.toContain("brand-logo");
    expect(dashboard.toLowerCase()).not.toContain("logo_");
    expect(scorecard.toLowerCase()).toContain("derived projection");
    expect(scorecard).toContain("does not establish runner fitness");
    expect(scorecard).toContain('rel="icon" href="./product-mark.svg" type="image/svg+xml"');
    expect(scorecard).toContain('<img class="product-mark" src="./product-mark.svg" alt=""');
    expect(scorecard).toContain("<span>Mister Clean</span>");
    expect(scorecard.toLowerCase()).not.toContain("brand-logo");
    expect(scorecard.toLowerCase()).not.toContain("logo_");
    expect(productMark).toContain("Repository paths converging through a clean passage");
    expect(productMark).not.toMatch(/<script\b|<foreignObject\b/i);
    expect(scorecard).toContain("content-addressed receipt manifest");
    expect(scorecard).toContain("aria-live=\"polite\"");
    expect(scorecard).not.toContain("score-track");
  });

  it("uses dashboard tokens rather than raw color literals", () => {
    expect(dashboard).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(dashboard).not.toMatch(/rgba?\s*\(/i);
  });

  it("keeps live case-study state out of the public package and MCP material graph", async () => {
    expect(packageJson.files).not.toContain("assets/**");
    for (const localProjection of [
      "assets/codebase-state-dashboard/case-study-okgo.html",
      "assets/codebase-state-dashboard/model-scorecard-okgo.html",
      "assets/codebase-state-dashboard/okgo-case-study-state.json",
      "assets/codebase-state-dashboard/okgo-main-history.json",
      "assets/codebase-state-dashboard/okgo-model-scorecard.json",
    ]) {
      expect(packageJson.files).not.toContain(localProjection);
    }
    const generator = await readFile(join(ROOT, "scripts", "generate_materials.mjs"), "utf8");
    expect(generator).toContain("localEvidenceAssets");
  });
});

describe("unified TypeScript distribution contract", () => {
  it("keeps skill, package, and both executable entry points on one versioned surface", () => {
    const frontmatter = skill.match(/^\s*version:\s*([^\s]+)\s*$/m);
    expect(frontmatter?.[1]).toBe(packageJson.version);
    expect(packageJson.name).toBe("@bradheitmann/mister-clean");
    expect(packageJson.bin).toEqual({
      "mister-clean": "bin/mister-clean.js",
      "mister-clean-mcp": "dist/stdio.js",
    });
  });

  it("ships Node artifacts and public materials, never source trees or Python runtime", () => {
    expect(packageJson.files).toContain("bin/mister-clean.js");
    expect(packageJson.files).toContain("dist/public.*");
    expect(packageJson.files).toContain("dist/stdio.*");
    expect(packageJson.files).not.toContain("src");
    expect(packageJson.files).not.toContain(".npmrc");
    expect(packageJson.files.some((entry) => entry.includes(".py"))).toBe(false);
  });

  it("keeps the self-contained skill CLI byte-identical to the current build", async () => {
    const [standalone, built] = await Promise.all([
      readFile(join(ROOT, "bin", "mister-clean.js")),
      readFile(join(ROOT, "dist", "cli.js")),
    ]);
    expect(standalone).toEqual(built);
    const builtText = Buffer.from(built).toString("utf8");
    expect(builtText).toContain('"node:sqlite"');
    expect(builtText).not.toContain('from "sqlite"');
  }, 30_000);

  it("keeps source and standalone planning behavior identical", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "mister-clean-cli-parity-"));
    const runtime = await mkdtemp(join(tmpdir(), "mister-clean-runtime-parity-"));
    try {
      await mkdir(join(fixture, "planning"));
      await writeFile(join(fixture, "planning", "status.json"), JSON.stringify({
        artifactType: "statusIndex",
        id: "STATUS",
        status: "active",
        stories: [{ status: "MAYBE", storyId: "MISSING" }],
      }));
      await Promise.all([
        mkdir(join(runtime, "assets"), { recursive: true }),
        mkdir(join(runtime, "bin"), { recursive: true }),
        mkdir(join(runtime, "dist"), { recursive: true }),
      ]);
      await Promise.all([
        copyFile(join(ROOT, "assets", "closure-bundle.json"), join(runtime, "assets", "closure-bundle.json")),
        copyFile(join(ROOT, "SKILL.md"), join(runtime, "SKILL.md")),
        copyFile(join(ROOT, "bin", "mister-clean.js"), join(runtime, "bin", "mister-clean.js")),
        copyFile(join(ROOT, "dist", "public.js"), join(runtime, "dist", "public.js")),
        copyFile(join(ROOT, "dist", "stdio.js"), join(runtime, "dist", "stdio.js")),
      ]);
      await writeFile(join(runtime, "package.json"), `${JSON.stringify({
        name: "@example/mister-clean-runtime",
        version: "1.2.3",
        type: "module",
        files: [
          RELEASE_ATTESTATION_FILE,
          "MANIFEST.sha256",
          "SKILL.md",
          "assets/**",
          "bin/*.js",
          "dist/*.js",
        ],
      }, null, 2)}\n`);
      const runtimeManifest = await generateAttestedPackageManifest(runtime);
      await writeFile(join(runtime, "MANIFEST.sha256"), runtimeManifest.content);
      const attestation = await createReleaseAttestation(runtime, {
        git_commit: "0123456789abcdef0123456789abcdef01234567",
        git_tag: "v1.2.3",
      });
      await writeFile(join(runtime, RELEASE_ATTESTATION_FILE), releaseAttestationBytes(attestation));
      const args = ["audit", "planning", fixture, "--json"];
      const source = spawnSync("bun", [join(ROOT, "src", "cli.ts"), ...args], {
        encoding: "utf8",
        env: { ...process.env, MISTER_CLEAN_SOURCE_DEVELOPMENT: "1" },
      });
      const standalone = spawnSync(process.execPath, [join(runtime, "bin", "mister-clean.js"), ...args], { encoding: "utf8" });
      expect(source.status).toBe(1);
      expect(standalone.status).toBe(1);
      expect(source.stderr).toBe(standalone.stderr);
      expect(source.stdout).toBe(standalone.stdout);
    } finally {
      await Promise.all([
        rm(fixture, { recursive: true }),
        rm(runtime, { recursive: true }),
      ]);
    }
  });

  it("documents the unified CLI instead of requiring Python script paths", () => {
    expect(skill).toContain('bin/mister-clean.js" validate');
    expect(skill).toContain("mister-clean prepare");
    expect(skill).not.toContain("scripts/validate_bundle.py");
    expect(skill).not.toMatch(/\bpython3\b/);
  });

  it("keeps the public MCP intentionally read-only and without repository access", async () => {
    const readme = await readFile(join(ROOT, "README.md"), "utf8");
    const security = await readFile(join(ROOT, "SECURITY.md"), "utf8");
    expect(readme).toContain("intentionally read-only");
    expect(security).toContain("public MCP surface is read-only");
    expect(security).toContain("does not receive repository access");
  });

  it("requires the live-bound closure bundle rather than a standalone report", async () => {
    const bundle = JSON.parse(await readFile(join(ROOT, "assets", "closure-bundle.json"), "utf8")) as Record<string, unknown>;
    expect(bundle.record_type).toBe("mister-clean.closure-bundle");
    expect(skill).toContain("live closure bundle validates and reports `CLEAN`");
  });

  it("keeps the shipped package manifest complete, current, and free of Python runtime entries", async () => {
    const expected = await generatePackageManifest(ROOT);
    const lines = (await readFile(join(ROOT, "MANIFEST.sha256"), "utf8")).trimEnd().split("\n");
    const recorded = new Map(lines.map((line) => {
      const [digest, path] = line.split("  ");
      return [path, digest] as const;
    }));
    expect([...recorded.keys()].sort()).toEqual(expected.entries.map((entry) => entry.path));
    for (const entry of expected.entries) expect(recorded.get(entry.path)).toBe(entry.sha256);
    expect(expected.entries.some((entry) => entry.path.endsWith(".py"))).toBe(false);
    expect(expected.entries.some((entry) => entry.path.startsWith("./src/"))).toBe(false);
    expect(expected.entries.some((entry) => entry.path.startsWith("./dist/"))).toBe(true);
  });

  it("retains ten complete read-only MCP evaluation pairs", async () => {
    const evaluation = await readFile(join(ROOT, "evals", "mcp-evaluation.xml"), "utf8");
    const pairs = [...evaluation.matchAll(/<qa_pair>([\s\S]*?)<\/qa_pair>/g)];
    expect(pairs).toHaveLength(10);
    for (const pair of pairs) {
      expect(pair[1]).toMatch(/<question>\s*\S[\s\S]*?<\/question>/);
      expect(pair[1]).toMatch(/<answer>\s*\S[\s\S]*?<\/answer>/);
    }
  });
});
