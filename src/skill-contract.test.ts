import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { generatePackageManifest, STACK_MARKERS } from "./closeout/inspection.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const skill = await readFile(join(ROOT, "SKILL.md"), "utf8");
const authority = await readFile(join(ROOT, "references", "authorization-and-modes.md"), "utf8");
const openai = await readFile(join(ROOT, "agents", "openai.yaml"), "utf8");
const dashboard = await readFile(join(ROOT, "assets", "codebase-state-dashboard", "index.html"), "utf8");
const orchestrationGoal = await readFile(join(ROOT, "templates", "orchestration-goal.md"), "utf8");
const tokensPath = join(ROOT, "assets", "codebase-state-dashboard", "dashboard-tokens.css");
const manifest = JSON.parse(await readFile(join(ROOT, "assets", "action-manifest.json"), "utf8")) as Record<string, unknown>;
const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
  bin: Record<string, string>;
  files: string[];
  name: string;
  version: string;
};

describe("invocation contract", () => {
  it("defaults a bare invocation to CLOSE rather than silently downgrading it to AUDIT", () => {
    expect(skill).toContain("Bare `$mister-clean`");
    expect(skill).toContain("Do not downgrade a bare invocation to AUDIT");
  });

  it("makes the invocation standing authority while retaining explicit activation", () => {
    expect(skill).toContain("Invocation is the authorization grant");
    expect(authority).toContain("does not need to be reconfirmed");
    expect(openai).toContain("allow_implicit_invocation: false");
    expect(openai).not.toContain("explicit_invocation_required");
    expect(openai.replace("# NO default_prompt", "")).not.toContain("default_prompt");
    expect(openai).not.toContain("audit this repository");
  });

  it("starts the action ledger authorized but empty", () => {
    expect(manifest.execution_state).toBe("authorized");
    expect(manifest.authorization_basis).toMatchObject({ source: "skill_invocation", standing: true });
    expect(manifest.actions).toEqual([]);
    expect(skill).toContain("execution ledger");
  });

  it("keeps current-branch push and hard safety boundaries explicit", () => {
    expect(authority).toContain("pushing the current branch");
    expect(skill).toContain("Push the current branch");
    for (const boundary of [
      "unrecoverable destruction",
      "security-control bypass",
      "another owner’s live work",
      "production deployment",
      "non-consenting third parties",
    ]) {
      expect(skill).toContain(boundary);
    }
  });

  it("does not treat process ownership alone as authority to terminate it", () => {
    expect(skill).toContain("Ownership alone is not a reason to terminate it");
  });

  it("ships an optional persistent goal with monotonic progress and unchanged authority", () => {
    expect(skill).toContain("templates/orchestration-goal.md");
    expect(orchestrationGoal).toContain("a bare\n`$mister-clean` invocation remains sufficient authorization");
    expect(orchestrationGoal).toContain("introduced_by_run_open` is zero");
    expect(orchestrationGoal).toContain("After two consecutive attempts");
    expect(orchestrationGoal).toContain("The goal does not widen Mister Clean's scope");
    expect(orchestrationGoal).toContain("terminalizing a story and updating its epic and\n   rollup are one transaction");
  });

  it("requires a closing candidate to contain the current target", async () => {
    const successor = await readFile(join(ROOT, "references", "successor-readiness.md"), "utf8");
    const isolation = await readFile(join(ROOT, "references", "write-lane-isolation.md"), "utf8");
    expect(skill.replaceAll(/\s+/g, " ")).toContain("a candidate that is behind a moving target is not a closing state");
    expect(successor).toContain("The closing candidate contains the current target");
    expect(isolation).toContain("merge-base plus left/right");
    expect(skill).toContain("two-tip `target..candidate` diff");
  });

  it("requires a complete governed-corpus partition and semantic validation outcomes", async () => {
    const successor = await readFile(join(ROOT, "references", "successor-readiness.md"), "utf8");
    const evaluations = await readFile(join(ROOT, "references", "behavioral-evals.md"), "utf8");
    const claims = await readFile(join(ROOT, "references", "verification-and-claims.md"), "utf8");
    expect(skill).toContain("zero unclassified remainder");
    expect(successor).toContain("class counts reconcile to the census");
    expect(evaluations).toContain("66 of 68 artifacts are");
    expect(evaluations).toContain("PASS with 7/10 verified");
    expect(claims).toContain("Validation results are tuples, not exit codes");
    expect(skill).toContain("Advisory checks may inform cleanup but never establish CLEAN");
  });

  it("invalidates all commit-bound proof after any late mutation, even for NOT CLEAN", async () => {
    const evaluations = await readFile(join(ROOT, "references", "behavioral-evals.md"), "utf8");
    expect(skill).toContain("The evidence freeze is the last state transition");
    expect(skill).toContain("This applies equally to `NOT CLEAN`");
    expect(skill).toContain("leaving the report and bundle bound to its parent");
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
});

describe("stack-adapter contract", () => {
  it("keeps an adapter section for every executable ecosystem, including shell", async () => {
    const adapters = await readFile(join(ROOT, "references", "stack-adapters.md"), "utf8");
    for (const ecosystem of [...Object.keys(STACK_MARKERS), "shell"]) {
      expect(adapters).toContain(`## ${ecosystem}`);
    }
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
    await expect(readFile(tokensPath, "utf8")).resolves.toContain("--mc-");
    for (const contract of [
      "--mc-dataviz-count-duration",
      "--mc-dataviz-draw-duration",
      "--mc-dataviz-series",
      "prefers-reduced-motion: reduce",
      "MISTER_CLEAN_DASHBOARD_STATE",
    ]) {
      expect(dashboard).toContain(contract);
    }
  });

  it("keeps the dashboard non-authoritative and logo-free", () => {
    expect(dashboard.toLowerCase()).toContain("derived projection");
    expect(dashboard).toContain("does not establish CLEAN");
    expect(skill.toLowerCase().replaceAll("**", "").replaceAll(/\s+/g, " ")).toContain("never a proof surface or prerequisite");
    expect(dashboard.toLowerCase()).not.toContain("<img");
    expect(dashboard.toLowerCase()).not.toContain("brand-logo");
    expect(dashboard.toLowerCase()).not.toContain("logo_");
  });

  it("uses dashboard tokens rather than raw color literals", () => {
    expect(dashboard).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(dashboard).not.toMatch(/rgba?\s*\(/i);
  });
});

describe("unified TypeScript distribution contract", () => {
  it("keeps skill, package, and both executable entry points on one versioned surface", () => {
    const frontmatter = skill.match(/^\s*version:\s*([^\s]+)\s*$/m);
    const heading = skill.match(/^# Mister Clean — v([^\s]+)\s*$/m);
    expect(frontmatter?.[1]).toBe(packageJson.version);
    expect(heading?.[1]).toBe(packageJson.version);
    expect(packageJson.name).toBe("@bradheitmann/mister-clean");
    expect(packageJson.bin).toEqual({
      "mister-clean": "bin/mister-clean.js",
      "mister-clean-mcp": "dist/stdio.js",
    });
  });

  it("ships Node artifacts and public materials, never source trees or Python runtime", () => {
    expect(packageJson.files).toContain("bin/mister-clean.js");
    expect(packageJson.files).toContain("dist/server.*");
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
  });

  it("keeps source and standalone planning behavior identical", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "mister-clean-cli-parity-"));
    try {
      await mkdir(join(fixture, "planning"));
      await writeFile(join(fixture, "planning", "status.json"), JSON.stringify({
        artifactType: "statusIndex",
        id: "STATUS",
        status: "active",
        stories: [{ status: "MAYBE", storyId: "MISSING" }],
      }));
      const args = ["audit", "planning", fixture, "--json"];
      const source = spawnSync("bun", [join(ROOT, "src", "cli.ts"), ...args], { encoding: "utf8" });
      const standalone = spawnSync(process.execPath, [join(ROOT, "bin", "mister-clean.js"), ...args], { encoding: "utf8" });
      expect(source.status).toBe(1);
      expect(standalone.status).toBe(1);
      expect(source.stderr).toBe(standalone.stderr);
      expect(source.stdout).toBe(standalone.stdout);
    } finally {
      await rm(fixture, { recursive: true });
    }
  });

  it("documents the unified CLI instead of requiring Python script paths", () => {
    expect(skill).toContain('bin/mister-clean.js" validate');
    expect(skill).toContain('bin/mister-clean.js" prepare');
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
    expect(skill).toContain("standalone report is structural evidence only");
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
