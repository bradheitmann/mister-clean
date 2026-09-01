import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { auditGitHubActionsRepository, type GitHubActionsFindingRule } from "./github-actions.js";

const roots: string[] = [];

function git(repository: string, ...args: string[]): void {
  execFileSync("git", ["-C", repository, ...args], {
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    stdio: "ignore",
  });
}

function fixture(workflow?: string): string {
  const repository = mkdtempSync(join(tmpdir(), "mister-clean-github-actions-"));
  roots.push(repository);
  git(repository, "init", "-q", "-b", "main");
  git(repository, "config", "user.name", "Mister Clean Test");
  git(repository, "config", "user.email", "mister-clean.invalid");
  writeFileSync(join(repository, "README.md"), "fixture\n", "utf8");
  if (workflow !== undefined) {
    mkdirSync(join(repository, ".github", "workflows"), { recursive: true });
    writeFileSync(join(repository, ".github", "workflows", "cd.yml"), workflow, "utf8");
  }
  git(repository, "add", ".");
  git(repository, "commit", "-qm", "fixture");
  return repository;
}

function addWorkflow(repository: string, name: string, workflow: string): void {
  writeFileSync(join(repository, ".github", "workflows", name), workflow, "utf8");
  git(repository, "add", ".");
  git(repository, "commit", "-qm", `add ${name}`);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("GitHub Actions governance audit", () => {
  it("is not applicable when no tracked workflows exist", () => {
    expect(auditGitHubActionsRepository(fixture())).toMatchObject({
      status: "not_applicable",
      workflow_count: 0,
      findings: [],
    });
  });

  it("finds the complete effectful-workflow authority defect class", () => {
    const result = auditGitHubActionsRepository(fixture(`name: CD
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
  workflow_dispatch: {}
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: vendor/setup-deployer@master
      - name: Release identity
        run: echo "bound through --image-label"
      - name: Deploy backend
        run: flyctl deploy --app backend
        env:
          FLY_API_TOKEN: \${{ secrets.FLY_API_TOKEN }}
      - name: Verify backend health
        run: |
          flyctl checks list --app backend --json
          echo "::warning::not ready"
`));

    expect(new Set(result.findings.map((row) => row.rule))).toEqual(new Set([
      "health_gate_identity_unbound",
      "health_gate_nonblocking",
      "manual_sensitive_ref_unbound",
      "permissions_implicit",
      "privileged_action_context_exposed",
      "privileged_action_mutable",
      "release_identity_unbound",
      "workflow_run_checkout_unbound",
      "workflow_run_source_untrusted",
      "workflow_run_upstream_identity_unbound",
    ]));
    expect(result.findings.find((row) => row.rule === "manual_sensitive_ref_unbound")?.severity).toBe("P0");
  });

  it("passes an immutable, ref-bound, fail-closed workflow", () => {
    const sha = "a".repeat(40);
    const result = auditGitHubActionsRepository(fixture(`name: CD
permissions:
  contents: read
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
  workflow_dispatch: {}
jobs:
  deploy:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Bootstrap trusted policy
        uses: actions/checkout@${sha}
        with:
          ref: refs/heads/main
          fetch-depth: 0
      - name: Authorize source
        env:
          REPOSITORY: \${{ github.repository }}
          HEAD_REPOSITORY: \${{ github.event.workflow_run.head_repository.full_name }}
          UPSTREAM_EVENT: \${{ github.event.workflow_run.event }}
          SOURCE_SHA: \${{ github.event.workflow_run.head_sha }}
        run: |
          test "$HEAD_REPOSITORY" = "$REPOSITORY"
          test "$UPSTREAM_EVENT" = "push"
          git merge-base --is-ancestor "$SOURCE_SHA" refs/remotes/origin/main
          TRUSTED_TIP="$(git rev-parse refs/remotes/origin/main)"
          test "$SOURCE_SHA" = "$TRUSTED_TIP"
      - uses: actions/checkout@${sha}
        with:
          ref: \${{ github.event.workflow_run.head_sha || github.sha }}
      - uses: vendor/setup-deployer@${sha}
      - name: Deploy backend
        run: flyctl deploy --app backend
      - name: Verify backend health
        run: |
          status="$(flyctl checks list --app backend --json | jq -er 'any(.[]; .name == "backend_planes" and .status == "passing")')"
          test "$status" = "true"
`));

    expect(result.findings).toEqual([]);
    expect(result).toMatchObject({ status: "pass", exitCode: 0, sensitive_workflow_count: 1 });
  });

  it("rejects a same-named fork branch even when checkout is SHA-bound", () => {
    const sha = "d".repeat(40);
    const result = auditGitHubActionsRepository(fixture(`name: CD
permissions:
  contents: read
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${sha}
        with:
          ref: \${{ github.event.workflow_run.head_sha }}
      - run: flyctl deploy --app backend
      - name: Verify backend health
        run: flyctl checks list --app backend --json | jq -e 'any(.[]; .name == "backend_planes" and .status == "passing")'
`));

    expect(result.findings).toContainEqual(expect.objectContaining({
      rule: "workflow_run_source_untrusted",
      severity: "P0",
    }));
  });

  it("rejects historical green reruns whose upstream workflow identity is not temporally bound", () => {
    const sha = "f".repeat(40);
    const result = auditGitHubActionsRepository(fixture(`name: CD
permissions:
  contents: read
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${sha}
        with:
          ref: refs/heads/main
          fetch-depth: 0
      - name: Authorize source
        env:
          REPOSITORY: \${{ github.repository }}
          HEAD_REPOSITORY: \${{ github.event.workflow_run.head_repository.full_name }}
          UPSTREAM_EVENT: \${{ github.event.workflow_run.event }}
          SOURCE_SHA: \${{ github.event.workflow_run.head_sha }}
        run: |
          test "$HEAD_REPOSITORY" = "$REPOSITORY"
          test "$UPSTREAM_EVENT" = "push"
          git merge-base --is-ancestor "$SOURCE_SHA" refs/remotes/origin/main
      - uses: actions/checkout@${sha}
        with:
          ref: \${{ github.event.workflow_run.head_sha }}
      - run: flyctl deploy --app backend
`));

    expect(result.findings.some((row) => row.rule === "workflow_run_source_untrusted")).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({
      rule: "workflow_run_upstream_identity_unbound",
      severity: "P0",
    }));
  });

  it("proves authority detectors fire under each trust-boundary mutation", () => {
    const sha = "9".repeat(40);
    const canonical = `name: CD
permissions:
  contents: read
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
  workflow_dispatch: {}
jobs:
  deploy:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${sha}
        with:
          ref: refs/heads/main
          fetch-depth: 0
      - name: Authorize source
        env:
          REPOSITORY: \${{ github.repository }}
          HEAD_REPOSITORY: \${{ github.event.workflow_run.head_repository.full_name }}
          UPSTREAM_EVENT: \${{ github.event.workflow_run.event }}
          SOURCE_SHA: \${{ github.event.workflow_run.head_sha }}
        run: |
          test "$HEAD_REPOSITORY" = "$REPOSITORY"
          test "$UPSTREAM_EVENT" = "push"
          git merge-base --is-ancestor "$SOURCE_SHA" refs/remotes/origin/main
          TRUSTED_TIP="$(git rev-parse refs/remotes/origin/main)"
          test "$SOURCE_SHA" = "$TRUSTED_TIP"
      - uses: actions/checkout@${sha}
        with:
          ref: \${{ github.event.workflow_run.head_sha }}
      - name: Release identity uses --image-label
        run: flyctl deploy --app backend --image-label "$SOURCE_SHA"
      - name: Verify backend health
        run: |
          status="$(flyctl checks list --app backend --json | jq -er 'any(.[]; .name == "backend_planes" and .status == "passing")')"
          test "$status" = "true"
`;
    const mutations: readonly [GitHubActionsFindingRule, string][] = [
      ["manual_sensitive_ref_unbound", canonical.replace("if: github.ref == 'refs/heads/main'", "if: always()")],
      ["workflow_run_source_untrusted", canonical.replace("github.event.workflow_run.head_repository.full_name", "github.event.repository.full_name")],
      ["workflow_run_upstream_identity_unbound", canonical.replace(
        "TRUSTED_TIP=\"$(git rev-parse refs/remotes/origin/main)\"\n          test \"$SOURCE_SHA\" = \"$TRUSTED_TIP\"",
        "echo historical ancestor accepted",
      )],
      ["health_gate_nonblocking", canonical.replace(
        "status=\"$(flyctl checks list",
        "exit 0\n          status=\"$(flyctl checks list",
      )],
      ["release_identity_unbound", canonical.replace(
        "flyctl deploy --app backend --image-label \"$SOURCE_SHA\"",
        "flyctl deploy --app backend",
      )],
    ];

    expect(auditGitHubActionsRepository(fixture(canonical)).findings).toEqual([]);
    for (const [rule, workflow] of mutations) {
      expect(auditGitHubActionsRepository(fixture(workflow)).findings, rule).toContainEqual(
        expect.objectContaining({ rule }),
      );
    }
  });

  it("rejects whole, computed, secret, case-folded, and extra privileged declarative inputs", () => {
    const sha = "8".repeat(40);
    const canonical = `name: CD
permissions:
  contents: read
on:
  workflow_dispatch: {}
jobs:
  deploy:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${sha}
        with:
          ref: refs/heads/main
          fetch-depth: 0
      - run: flyctl deploy --app backend
`;
    const mutations: readonly [string, boolean, boolean][] = [
      [canonical.replace("          fetch-depth: 0", "          fetch-depth: 0\n          audit-context: \${{ toJSON(github) }}"), true, true],
      [canonical.replace("          fetch-depth: 0", "          fetch-depth: 0\n          auth-token: \${{ github[format('{0}', 'token')] }}"), true, true],
      [canonical.replace("          fetch-depth: 0", "          fetch-depth: 0\n          auth-token: \${{ github.token }}"), true, true],
      [canonical.replace("          fetch-depth: 0", "          fetch-depth: 0\n          telemetry: disabled"), false, true],
      [canonical.replace(
        "      - run: flyctl deploy --app backend",
        "      - run: flyctl deploy --app backend\n        working-directory: \${{ GITHUB.token }}",
      ), true, false],
      [canonical.replace(
        "      - run: flyctl deploy --app backend",
        "      - run: flyctl deploy --app backend\n        working-directory: \${{ Secrets.DEPLOY_PATH }}",
      ), true, false],
      [canonical.replace(
        "      - run: flyctl deploy --app backend",
        "      - run: flyctl deploy --app backend\n        shell: \${{ secrets.DEPLOY_SHELL }}",
      ), true, false],
      [canonical.replace(
        "      - run: flyctl deploy --app backend",
        "      - name: \${{ secrets.STEP_NAME }}\n        uses: ./deploy\n        run: flyctl deploy --app backend",
      ), true, false],
      [canonical.replace(
        "    runs-on: ubuntu-latest",
        "    runs-on: ubuntu-latest\n    container: \${{ SECRETS.DEPLOY_IMAGE }}",
      ), true, false],
      [canonical.replace(
        "      - run: flyctl deploy --app backend",
        "      - run: flyctl deploy --app backend\n        working-directory: ${{ secret.DEPLOY_PATH }}",
      ), false, false],
      [canonical.replace(
        "      - run: flyctl deploy --app backend",
        "      - run: flyctl deploy --app backend\n        working-directory: secrets.DEPLOY_PATH",
      ), false, false],
    ];

    expect(auditGitHubActionsRepository(fixture(canonical)).findings).toEqual([]);
    for (const [workflow, expectsContextEscape, expectsInputShapeFailure] of mutations) {
      const findings = auditGitHubActionsRepository(fixture(workflow)).findings;
      expect(findings.some((finding) => finding.rule === "privileged_action_context_exposed"))
        .toBe(expectsContextEscape);
      expect(findings.some((finding) => finding.rule === "privileged_action_input_shape_unbound"))
        .toBe(expectsInputShapeFailure);
    }
  });

  it("rejects a green but unrelated health check", () => {
    const sha = "e".repeat(40);
    const result = auditGitHubActionsRepository(fixture(`name: CD
permissions:
  contents: read
on:
  workflow_dispatch: {}
jobs:
  deploy:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${sha}
      - run: flyctl deploy --app backend
      - name: Verify backend health
        run: flyctl checks list --app backend --json | jq -e 'all(.[]; .status == "passing")'
`));

    expect(result.findings).toContainEqual(expect.objectContaining({
      rule: "health_gate_identity_unbound",
      severity: "P1",
    }));
  });

  it("accepts a fail-closed main-ref resolver that dominates the effectful job", () => {
    const sha = "b".repeat(40);
    const result = auditGitHubActionsRepository(fixture(`name: CD
permissions:
  contents: read
on:
  workflow_dispatch: {}
jobs:
  authorize:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - run: echo authorized
  deploy:
    needs: authorize
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${sha}
      - run: flyctl deploy --app backend
`));

    expect(result.findings.some((row) => row.rule === "manual_sensitive_ref_unbound")).toBe(false);
  });

  it("treats an upstream workflow_run source as part of the deployment trust boundary", () => {
    const sha = "c".repeat(40);
    const repository = fixture(`name: CD
permissions:
  contents: read
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${sha}
        with:
          ref: \${{ github.event.workflow_run.head_sha }}
      - run: flyctl deploy --app backend
`);
    addWorkflow(repository, "ci.yml", `name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun test
`);

    const result = auditGitHubActionsRepository(repository);
    const upstream = result.findings.filter((row) => row.path === ".github/workflows/ci.yml");
    expect(upstream).toHaveLength(2);
    expect(new Set(upstream.map((row) => row.rule))).toEqual(new Set([
      "permissions_implicit",
      "workflow_run_upstream_mutable",
    ]));
  });

  it("fails closed on ambiguous YAML", () => {
    const result = auditGitHubActionsRepository(fixture(`name: one
name: two
on: push
jobs: {}
`));
    expect(result.findings).toEqual([
      expect.objectContaining({ rule: "workflow_unparseable", severity: "P1" }),
    ]);
  });
});
