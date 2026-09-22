import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  RELEASE_ATTESTATION_FILE,
  createReleaseAttestation,
  bindRuntimeAttestation,
  generateAttestedPackageManifest,
  releaseAttestationBytes,
} from "./attestation.js";
import { type CliIO, isDirectInvocation, runCli } from "./cli.js";
import { createOpenGuardValidationFixture } from "./closeout/guard-authority.test-fixture.js";
import { discoverSemanticProbeCandidates } from "./closeout/semantic.js";

const roots: string[] = [];

function fixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `mister-clean-cli-${name}-`));
  roots.push(root);
  return root;
}

function capture(): { io: CliIO; stderr: string[]; stdout: string[] } {
  const stderr: string[] = [];
  const stdout: string[] = [];
  return {
    io: { stderr: (line) => stderr.push(line), stdout: (line) => stdout.push(line) },
    stderr,
    stdout,
  };
}

async function attestedFixture(name: string): Promise<string> {
  const root = fixture(name);
  mkdirSync(join(root, "bin"), { recursive: true });
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), `${RELEASE_ATTESTATION_FILE}\n`);
  writeFileSync(join(root, "package.json"), `${JSON.stringify({
    name: "@example/mister-clean-fixture",
    version: "1.2.3",
    files: [
      RELEASE_ATTESTATION_FILE,
      "MANIFEST.sha256",
      "SKILL.md",
      "bin/*.js",
      "dist/*.js",
    ],
  }, null, 2)}\n`);
  writeFileSync(join(root, "SKILL.md"), "skill\n");
  writeFileSync(join(root, "bin", "mister-clean.js"), "cli\n");
  writeFileSync(join(root, "dist", "public.js"), "public server\n");
  writeFileSync(join(root, "dist", "stdio.js"), "stdio\n");
  const manifest = await generateAttestedPackageManifest(root);
  writeFileSync(join(root, "MANIFEST.sha256"), manifest.content);
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
  execFileSync("git", ["-C", root, "config", "user.email", "fixture.invalid"]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-qm", "release"]);
  execFileSync("git", ["-C", root, "tag", "v1.2.3"]);
  const gitCommit = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const attestation = await createReleaseAttestation(root, {
    git_commit: gitCommit,
    git_tag: "v1.2.3",
  });
  writeFileSync(join(root, RELEASE_ATTESTATION_FILE), releaseAttestationBytes(attestation));
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("unified Mister Clean CLI", () => {
  it("executes the canonical successor RepositoryObject projection command", async () => {
    const root = fixture("repository-object-inspection");
    writeFileSync(join(root, "README.md"), "fixture\n");
    execFileSync("git", ["init", "-q", "-b", "main", root]);
    execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
    execFileSync("git", ["-C", root, "config", "user.email", "fixture.invalid"]);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", ["-C", root, "commit", "-qm", "fixture"]);
    const output = capture();

    expect(await runCli(["inspect", "repository-object", root, "--json"], output.io)).toBe(0);
    expect(JSON.parse(output.stdout.join("\n"))).toMatchObject({
      record_type: "mister-clean.repository-object",
      surface: "tracked_and_nonignored",
      entry_count: 1,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("captures, validates, and compares one canonical file census", async () => {
    const root = fixture("census");
    mkdirSync(join(root, "records", "nested"), { recursive: true });
    writeFileSync(join(root, "records", "direct.txt"), "direct\n");
    writeFileSync(join(root, "records", "nested", "receipt.txt"), "receipt\n");
    const before = join(root, "before.json");
    const after = join(root, "after.json");
    const captureBefore = capture();
    expect(await runCli(["census", "capture", "--repo", root, "--root", "records", "--output", before], captureBefore.io)).toBe(0);
    expect(captureBefore.stdout[0]).toContain("file_count=2 direct=1 nested=1");
    expect(readFileSync(before, "utf8")).not.toContain("\n");

    const validation = capture();
    expect(await runCli(["census", "validate", before], validation.io)).toBe(0);
    expect(validation.stdout[0]).toContain("PASS kind=file-census");

    writeFileSync(join(root, "records", "direct.txt"), "changed\n");
    expect(await runCli(["census", "capture", "--repo", root, "--root", "records", "--output", after], capture().io)).toBe(0);
    const comparison = capture();
    expect(await runCli(["census", "compare", before, after], comparison.io)).toBe(1);
    expect(comparison.stdout).toEqual(["CENSUS_DELTA status=present"]);
  });

  it("keeps an unknown stack exit-relevant", async () => {
    const output = capture();
    const code = await runCli(["detect", "stack", fixture("unknown")], output.io);
    expect(code).toBe(3);
    expect(output.stdout).toEqual([
      "NO KNOWN ECOSYSTEM DETECTED -- inspect manually; adapter checks may not be silently skipped",
    ]);
  });

  it("reports public-safety locations without source contents", async () => {
    const root = fixture("safety");
    const secret = `${"person"}@${"example.org"}`;
    writeFileSync(join(root, "source.txt"), `contact=${secret}\n`);
    const output = capture();
    const code = await runCli(["audit", "public-safety", root], output.io);
    expect(code).toBe(1);
    expect(output.stdout).toEqual(["source.txt:1: email-address"]);
    expect(output.stderr).toEqual(["public-safety: FAIL (1 finding(s))"]);
    expect(JSON.stringify(output)).not.toContain(secret);
  });

  it("emits redacted public-safety fingerprints in machine-readable mode", async () => {
    const root = fixture("safety-json");
    const secret = `${"person"}@${"example.org"}`;
    writeFileSync(join(root, "source.txt"), `contact=${secret}\n`);
    const output = capture();
    const code = await runCli(["audit", "public-safety", root, "--json"], output.io);
    const audit = JSON.parse(output.stdout.join("\n")) as { findings: Array<{ fingerprint: string }> };
    expect(code).toBe(1);
    expect(audit.findings[0]?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(audit)).not.toContain(secret);
  });

  it("limits the explicit tracked public-safety mode to Git-tracked files", async () => {
    const root = fixture("tracked-safety");
    mkdirSync(join(root, ".crush", "logs"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), ".crush/\n");
    writeFileSync(join(root, "public.txt"), "safe public text\n");
    writeFileSync(join(root, "retired.txt"), "deleted candidate bytes\n");
    writeFileSync(join(root, ".crush", "logs", "crush.log"), `local=/${"Users"}/operator/private\n`);
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "add", "."]);
    rmSync(join(root, "retired.txt"));
    const output = capture();
    const code = await runCli(["audit", "public-safety", root, "--tracked", "--json"], output.io);
    const audit = JSON.parse(output.stdout.join("\n")) as { findings: unknown[]; scope: string };
    expect(code).toBe(0);
    expect(audit).toMatchObject({
      findings: [],
      scope: "tracked_shippable",
      tracked_path_count: 2,
      unassessed: [],
    });
  });

  it("makes effectful GitHub Actions authority gaps exit-relevant", async () => {
    const root = fixture("github-actions-audit");
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(join(root, ".github", "workflows", "cd.yml"), `name: CD
on:
  workflow_dispatch: {}
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: flyctl deploy --app production
`);
    execFileSync("git", ["init", "-q", "-b", "main", root]);
    execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
    execFileSync("git", ["-C", root, "config", "user.email", "fixture.invalid"]);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", ["-C", root, "commit", "-qm", "fixture"]);
    const output = capture();
    const code = await runCli(["audit", "github-actions", root, "--json"], output.io);
    const audit = JSON.parse(output.stdout.join("\n")) as { findings: Array<{ rule: string }> };

    expect(code).toBe(1);
    expect(audit.findings).toContainEqual(expect.objectContaining({ rule: "manual_sensitive_ref_unbound" }));
    expect(audit.findings).toContainEqual(expect.objectContaining({ rule: "permissions_implicit" }));
  });

  it("makes child-established planning cascade debt exit-relevant", async () => {
    const root = fixture("planning-audit");
    mkdirSync(join(root, "planning", "stories"), { recursive: true });
    mkdirSync(join(root, "planning", "done"), { recursive: true });
    mkdirSync(join(root, "planning", "holdouts"), { recursive: true });
    writeFileSync(join(root, "planning", "stories", "WORK.md"), "---\nartifact_type: story\nstory_id: WORK\nstatus: IN_PROGRESS\nholdout_status: NOT_RUN\n---\n");
    writeFileSync(join(root, "planning", "done", "TASK.md"), "---\nartifact_type: slice\nslice_id: TASK\nparent_id: WORK\nstatus: Done\n---\n");
    writeFileSync(join(root, "planning", "holdouts", "HOLDOUT.md"), "---\nartifact_type: holdout\nstory_id: WORK\nresult: NOT_RUN\n---\n");
    const output = capture();
    const code = await runCli(["audit", "planning", root, "--json"], output.io);
    expect(code).toBe(1);
    const audit = JSON.parse(output.stdout.join("\n")) as { findings: Array<{ code: string; subject: string }> };
    expect(audit.findings).toContainEqual(expect.objectContaining({ code: "acceptance_cascade_unexecuted", subject: "WORK" }));
  });

  it("returns an input failure when the planning root does not exist", async () => {
    const root = join(fixture("missing-planning-root"), "not-there");
    const output = capture();
    const code = await runCli(["audit", "planning", root, "--json"], output.io);
    expect(code).toBe(2);
    expect(output.stderr).toEqual([`ERROR: not a directory: ${root}`]);
  });

  it("discovers common todo-doing-complete planning lanes", async () => {
    const root = fixture("planning-lane-aliases");
    mkdirSync(join(root, "coordination", "todo"), { recursive: true });
    mkdirSync(join(root, "coordination", "doing"), { recursive: true });
    mkdirSync(join(root, "coordination", "complete"), { recursive: true });
    writeFileSync(join(root, "coordination", "todo", "next.md"), "---\nartifact_type: story\nstatus: todo\n---\n");
    writeFileSync(join(root, "coordination", "doing", "current.md"), "---\nartifact_type: story\nstatus: doing\n---\n");
    writeFileSync(join(root, "coordination", "complete", "past.md"), "---\nartifact_type: story\nstatus: complete\n---\n");
    const output = capture();
    const code = await runCli(["audit", "planning", root, "--json"], output.io);
    expect(code).toBe(0);
    const audit = JSON.parse(output.stdout.join("\n")) as { artifactCount: number; planningRootCount: number; status: string };
    expect(audit).toEqual(expect.objectContaining({ artifactCount: 3, planningRootCount: 1, status: "pass" }));
  });

  it("makes unproved critical-boundary claims exit-relevant", async () => {
    const root = fixture("semantic-audit");
    mkdirSync(join(root, "planning"));
    writeFileSync(join(root, "planning", "SECURITY.md"), `---
artifact_type: product_contract
status: active
---
The credential validator is a security choke point and must be safe by construction.
`);
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
    execFileSync("git", ["-C", root, "config", "user.email", "fixture.invalid"]);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", ["-C", root, "commit", "-qm", "fixture"]);
    const output = capture();
    const code = await runCli(["audit", "semantic", root, "--json"], output.io);
    expect(code).toBe(1);
    const audit = JSON.parse(output.stdout.join("\n")) as { candidate_probe_count: number; findings: Array<{ code: string }> };
    expect(audit.candidate_probe_count).toBe(1);
    expect(audit.findings).toContainEqual(expect.objectContaining({ code: "semantic_probe_unassigned" }));
  });

  it("requires a bound manifest before semantic execution", async () => {
    const output = capture();
    const code = await runCli(["audit", "semantic", fixture("semantic-execute"), "--execute"], output.io);
    expect(code).toBe(2);
    expect(output.stderr).toContain("ERROR: audit semantic --execute requires --manifest");
  });

  it("generates a v2 semantic plan outside the audited RepositoryObject and verifies direct candidates internally", async () => {
    const root = fixture("semantic-v2-plan-subject");
    mkdirSync(join(root, "planning", "todo"), { recursive: true });
    writeFileSync(join(root, "planning", "STORY.md"), `---
artifact_type: product_contract
status: active
---
The credential validator is a security choke point and must be safe by construction.
`);
    writeFileSync(join(root, "planning", "todo", "DEV.yaml"), "artifact_type: slice\nslice_type: DEV\nstatus: To Do\n");
    execFileSync("git", ["init", "-q", root]);
    execFileSync("git", ["-C", root, "config", "user.name", "Fixture"]);
    execFileSync("git", ["-C", root, "config", "user.email", "fixture.invalid"]);
    execFileSync("git", ["-C", root, "add", "."]);
    execFileSync("git", ["-C", root, "commit", "-qm", "fixture"]);
    const candidates = discoverSemanticProbeCandidates(root);
    const construction = candidates.find((item) => item.kind === "construction_boundary")!;
    const external = fixture("semantic-v2-plan-output");
    const proposals = join(external, "case-proposals.json");
    const planPath = join(external, "semantic-plan.json");
    writeFileSync(proposals, `${JSON.stringify({
      record_type: "mister-clean.semantic-case-proposals",
      schema_version: "1.0",
      cases: {
        [construction.id]: [{ case_id: "forged-credential", intent: "reject a forged credential", required_observations: ["decision"] }],
      },
    })}\n`);
    const generated = capture();
    expect(await runCli([
      "semantic", "plan", root,
      "--case-proposals", proposals,
      "--run-id", "run-001",
      "--nonce", "nonce-001",
      "--output", planPath,
      "--json",
    ], generated.io)).toBe(0);
    const plan = JSON.parse(readFileSync(planPath, "utf8")) as {
      candidates: Array<{ candidate_id: string; kind: string; resolution_mode: string }>;
      record_type: string;
    };
    expect(plan.record_type).toBe("mister-clean.semantic-plan");
    const identity = plan.candidates.find((item) => item.kind === "execution_identity_coverage")!;
    const verified = capture();
    expect(await runCli([
      "semantic", "verify", root,
      "--plan", planPath,
      "--candidate", identity.candidate_id,
      "--json",
    ], verified.io)).toBe(1);
    expect(JSON.parse(verified.stdout.join("\n"))).toMatchObject({ errors: [], verdict: "confirmed_failure" });
  });

  it("writes and then verifies a deterministic manifest", async () => {
    const root = fixture("manifest");
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "index.ts"), "export {};\n");
    const first = capture();
    expect(await runCli(["manifest", root], first.io)).toBe(0);
    expect(first.stdout[0]).toMatch(/^manifest: wrote 1 entries$/);
    const second = capture();
    expect(await runCli(["manifest", root, "--check"], second.io)).toBe(0);
    expect(second.stdout).toEqual(["manifest: PASS (1 entries)"]);
  });

  it("diagnoses a valid strict release attestation through the CLI", async () => {
    const root = await attestedFixture("attest-valid");
    const output = capture();
    const code = await runCli(["attest", root, "--json", "--strict"], output.io);
    expect(code).toBe(0);
    expect(output.stderr).toEqual([]);
    expect(JSON.parse(output.stdout.join("\n"))).toMatchObject({
      record_type: "mister-clean.release-attestation-result",
      status: "pass",
      package: { name: "@example/mister-clean-fixture", version: "1.2.3" },
    });
  });

  it("returns an attestation failure with exact diagnostics for an unattested root", async () => {
    const root = fixture("attest-missing");
    const output = capture();
    const code = await runCli(["attest", root, "--json"], output.io);
    const result = JSON.parse(output.stdout.join("\n")) as { errors: string[]; status: string };
    expect(code).toBe(1);
    expect(output.stderr).toEqual([]);
    expect(result.status).toBe("fail");
    expect(result.errors.some((error) => error.startsWith(`${RELEASE_ATTESTATION_FILE}:`))).toBe(true);
  });

  it("returns usage failure for an incomplete validation command", async () => {
    const output = capture();
    expect(await runCli(["validate", "bundle"], output.io)).toBe(2);
    expect(output.stderr).toContain("ERROR: validate bundle requires a path");
  });

  it("accepts --accepted-evaluator only as an absolute live bundle option", async () => {
    const reportPath = join(fixture("accepted-flag-report"), "report.json");
    writeFileSync(reportPath, "{}\n");
    const elsewhere = capture();
    expect(await runCli(["validate", "report", reportPath, "--accepted-evaluator", "/external/accepted.json"], elsewhere.io)).toBe(2);
    expect(elsewhere.stderr).toContain(
      "ERROR: --structural, --repo, and --accepted-evaluator are only valid for bundle validation",
    );

    const relative = capture();
    expect(await runCli(["validate", "bundle", reportPath, "--accepted-evaluator", "accepted.json"], relative.io)).toBe(2);
    expect(relative.stderr).toContain("ERROR: --accepted-evaluator requires an absolute path");

    const structural = capture();
    expect(await runCli(["validate", "bundle", reportPath, "--structural", "--accepted-evaluator", "/external/accepted.json"], structural.io)).toBe(2);
    expect(structural.stderr).toContain("ERROR: --accepted-evaluator is only valid for live bundle validation");

    const guardReport = capture();
    expect(await runCli(["validate", "report", reportPath, "--guard-authority", "/external/guard.json"], guardReport.io)).toBe(2);
    expect(guardReport.stderr).toContain("ERROR: --guard-authority is only valid for bundle validation");
    const guardRelative = capture();
    expect(await runCli(["validate", "bundle", reportPath, "--guard-authority", "guard.json"], guardRelative.io)).toBe(2);
    expect(guardRelative.stderr).toContain("ERROR: --guard-authority requires an absolute path");
    const guardStructural = capture();
    expect(await runCli(["validate", "bundle", reportPath, "--structural", "--guard-authority", "/external/guard.json"], guardStructural.io)).toBe(2);
    expect(guardStructural.stderr).toContain("ERROR: --guard-authority is only valid for live bundle validation");
  });

  it("validates a live passed/open GUARD through both absolute CLI authority options", { timeout: 15_000 }, async () => {
    const packageRoot = process.cwd();
    const runtimeAttestation = await bindRuntimeAttestation(packageRoot, {
      moduleUrl: pathToFileURL(join(packageRoot, "src", "cli.ts")).href,
      expectedEntrypoint: "./bin/mister-clean.js",
      allowSourceDevelopment: true,
      sourceDevelopmentReason: "explicit source-development CLI execution",
    });
    const value = await createOpenGuardValidationFixture({
      root: fixture("guard-cli-success"),
      runtimeAttestation,
    });
    const output = capture();
    const code = await runCli([
      "validate", "bundle", value.bundlePath,
      "--repo", value.repo,
      "--accepted-evaluator", value.acceptedEvaluatorPath,
      "--guard-authority", value.authority.precommitPath,
    ], output.io);

    expect(code).toBe(0);
    expect(output.stderr).toEqual([]);
    expect(output.stdout).toEqual([`PASS kind=bundle path=${value.bundlePath} live=true`]);
  });

  it("prints exact help for each public action lifecycle subcommand", async () => {
    const begin = capture();
    expect(await runCli(["action", "begin", "--help"], begin.io)).toBe(0);
    expect(begin.stdout).toEqual([]);
    expect(begin.stderr).toEqual([
      "usage: mister-clean action begin <bundle-dir> --id <id> --debt-key <sha256> --kind <kind> --target <path-or-resource> --purpose <text>",
    ]);

    const finish = capture();
    expect(await runCli(["action", "finish", "--help"], finish.io)).toBe(0);
    expect(finish.stdout).toEqual([]);
    expect(finish.stderr).toEqual([
      "usage: mister-clean action finish <bundle-dir> --id <id> --status <closed|interrupted>",
    ]);
  });

  it("returns an input failure for an unreadable bundle without double-prefixing", async () => {
    const output = capture();
    const code = await runCli(["validate", "bundle", join(fixture("missing-bundle"), "missing.json")], output.io);
    expect(code).toBe(2);
    expect(output.stderr).toHaveLength(1);
    expect(output.stderr[0]).toMatch(/^ERROR: /);
    expect(output.stderr[0]).not.toMatch(/^ERROR: ERROR:/);
  });

  it("recognizes a package-bin symlink as a direct invocation", () => {
    const root = fixture("bin-link");
    const target = new URL("./cli.ts", import.meta.url);
    const link = join(root, "mister-clean");
    symlinkSync(target, link);
    expect(isDirectInvocation(link, target.href)).toBe(true);
  });
});
