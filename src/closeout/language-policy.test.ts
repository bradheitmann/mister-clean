import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { receiptFindingsFromAudit } from "./finding-anchors.js";
import {
  auditLanguagePolicy,
  globMatcher,
  LANGUAGE_POLICY_SCHEMA,
  LanguagePolicyInvalidError,
  languagePolicyFindingFingerprint,
} from "./language-policy.js";
import { type CliIO, runCli } from "../cli.js";
import { LocalRunReceiptStore } from "../run-receipt.js";
import { createFixtureRepository, fixtureCommit, fixtureGit } from "../test-support/fixture-repo.js";

const roots: string[] = [];

function scratch(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `mc-language-policy-${name}-`));
  roots.push(root);
  return root;
}

function repository(name: string): string {
  const root = scratch(name);
  createFixtureRepository(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function writePolicy(root: string, policy: unknown): void {
  mkdirSync(join(root, ".mister-clean"), { recursive: true });
  writeFileSync(join(root, ".mister-clean", "language-policy.json"), typeof policy === "string" ? policy : `${JSON.stringify(policy, null, 2)}\n`);
}

function cliOutput(): { io: CliIO; stderr: string[]; stdout: string[] } {
  const stderr: string[] = [];
  const stdout: string[] = [];
  return { io: { stderr: (line) => stderr.push(line), stdout: (line) => stdout.push(line) }, stderr, stdout };
}

const POLICY = {
  schema: LANGUAGE_POLICY_SCHEMA,
  forbid_extensions: [".py", ".js", ".mjs"],
  generated: ["dist/*.js"],
};

describe("language-policy detector family", () => {
  it("tracked: findings are exactly the tracked forbidden files; generated is counted; untracked is ignored", () => {
    const root = repository("tracked");
    writePolicy(root, POLICY);
    writeFileSync(join(root, "a.py"), "print('a')\n");
    writeFileSync(join(root, "b.mjs"), "export {};\n");
    writeFileSync(join(root, "c.ts"), "export {};\n");
    mkdirSync(join(root, "dist"));
    writeFileSync(join(root, "dist", "g.js"), "export {};\n");
    fixtureCommit(root);
    writeFileSync(join(root, "d.py"), "print('untracked')\n");
    const result = auditLanguagePolicy(root);
    expect(result.status).toBe("fail");
    expect(result.exitCode).toBe(1);
    expect(result.findings.map((finding) => finding.path)).toEqual(["a.py", "b.mjs"]);
    expect(result.findings[0]).toEqual({
      fingerprint: languagePolicyFindingFingerprint("a.py", ".py"),
      family: "language_policy",
      rule: "forbidden_language",
      path: "a.py",
      extension: ".py",
    });
    expect(result.generated_exempt).toEqual({ count: 1, paths: ["dist/g.js"] });
    expect(result.findings.some((finding) => finding.path === "d.py")).toBe(false);
  });

  it("no policy: the family is not_applicable with zero findings", async () => {
    const root = repository("no-policy");
    writeFileSync(join(root, "a.py"), "print('a')\n");
    writeFileSync(join(root, "b.mjs"), "export {};\n");
    fixtureCommit(root);
    const result = auditLanguagePolicy(root);
    expect(result).toMatchObject({ status: "not_applicable", exitCode: 0, policy: null, findings: [] });
    const output = cliOutput();
    expect(await runCli(["audit", "language-policy", root, "--json"], output.io)).toBe(0);
    expect(JSON.parse(output.stdout.join("\n"))).toMatchObject({ status: "not_applicable", findings: [] });
  });

  it("invalid: an unknown key or a wrong schema is a typed language_policy_invalid refusal; the CLI exits 2", async () => {
    const unknownKey = repository("invalid-key");
    writePolicy(unknownKey, { ...POLICY, forbid: [".py"] });
    fixtureCommit(unknownKey);
    expect(() => auditLanguagePolicy(unknownKey)).toThrow(LanguagePolicyInvalidError);
    try { auditLanguagePolicy(unknownKey); } catch (error) {
      expect(error).toMatchObject({ code: "language_policy_invalid", path: ".mister-clean/language-policy.json" });
      expect((error as Error).message).toMatch(/unknown key\(s\): forbid/u);
    }
    const badSchema = repository("invalid-schema");
    writePolicy(badSchema, { ...POLICY, schema: "mister-clean.language-policy/0" });
    fixtureCommit(badSchema);
    expect(() => auditLanguagePolicy(badSchema)).toThrow(/schema must be mister-clean\.language-policy\/1/u);
    const notJson = repository("invalid-json");
    writePolicy(notJson, "{ not json");
    expect(() => auditLanguagePolicy(notJson)).toThrow(/not valid JSON/u);
    const output = cliOutput();
    expect(await runCli(["audit", "language-policy", badSchema, "--json"], output.io)).toBe(2);
    expect(JSON.parse(output.stdout.join("\n"))).toEqual({
      code: "language_policy_invalid",
      path: ".mister-clean/language-policy.json",
      reason: "schema must be mister-clean.language-policy/1",
    });
    expect(output.stderr.join("\n")).toMatch(/language policy is invalid/u);
  });

  it("lang-guard-allow: root .lang-guard-allow globs are honoured as allow", () => {
    const root = repository("lang-guard");
    writePolicy(root, POLICY);
    mkdirSync(join(root, "scripts"));
    writeFileSync(join(root, "scripts", "allowed.mjs"), "export {};\n");
    writeFileSync(join(root, "b.mjs"), "export {};\n");
    writeFileSync(join(root, ".lang-guard-allow"), "# owner-authorized\n\nscripts/*.mjs\n");
    fixtureCommit(root);
    const result = auditLanguagePolicy(root);
    expect(result.findings.map((finding) => finding.path)).toEqual(["b.mjs"]);
    expect(result.allowed_count).toBe(1);
    expect(result.policy?.lang_guard_allow).toMatchObject({ path: ".lang-guard-allow", glob_count: 1 });
  });

  it("globs: ** crosses directories, * and ? stay inside one segment", () => {
    expect(globMatcher("dist/**").test("dist/a/b.js")).toBe(true);
    expect(globMatcher("**/*.js").test("a.js")).toBe(true);
    expect(globMatcher("src/*.js").test("src/a/b.js")).toBe(false);
    expect(globMatcher("a?.py").test("ab.py")).toBe(true);
    expect(globMatcher("vendor/").test("vendor/x/y.py")).toBe(true);
  });

  it("second-pass: an AUDIT receipt's language_policy finding reads cleared once the file is ported and committed", async () => {
    const root = repository("second-pass");
    writePolicy(root, POLICY);
    writeFileSync(join(root, "b.mjs"), "export const value = 1;\n");
    writeFileSync(join(root, "c.ts"), "export {};\n");
    fixtureCommit(root);
    const store = new LocalRunReceiptStore(join(scratch("second-pass-receipts"), "receipts"));
    const audit = cliOutput();
    expect(await runCli(["audit", "language-policy", root, "--json"], audit.io, undefined, undefined, store)).toBe(1);
    const [auditEntry] = store.index();
    expect(auditEntry).toMatchObject({ mode: "AUDIT", families: ["language_policy"], finding_count: 1 });
    const receipt = store.read(auditEntry!.receipt_id);
    expect(receipt.findings).toEqual([expect.objectContaining({
      family: "language_policy",
      rule: "forbidden_language",
      path: "b.mjs",
      anchor: expect.objectContaining({ kind: "file", line_hint: null }),
      legacy_fingerprint: languagePolicyFindingFingerprint("b.mjs", ".mjs"),
    })]);
    // The fingerprint binds the path, not its bytes: an edit does not move it.
    const fingerprint = receipt.findings[0]!.fingerprint;
    writeFileSync(join(root, "b.mjs"), "export const value = 2;\n");
    expect(receiptFindingsFromAudit("language_policy", auditLanguagePolicy(root), { repository: root })[0]!.finding.fingerprint).toBe(fingerprint);
    // Port it: rename .mjs to .ts and commit.
    fixtureGit(root, ["mv", "b.mjs", "b.ts"]);
    fixtureCommit(root, "port b.mjs to TypeScript");
    const secondPass = cliOutput();
    expect(await runCli(["second-pass", root, "--against", auditEntry!.receipt_id, "--json"], secondPass.io, undefined, undefined, store)).toBe(0);
    const result = JSON.parse(secondPass.stdout.join("\n")) as { families: string[]; rows: readonly { classification: string; family: string; path: string }[]; miss_count: number };
    expect(result.families).toEqual(["language_policy"]);
    expect(result.rows).toEqual([expect.objectContaining({ classification: "cleared", family: "language_policy", path: "b.mjs" })]);
    expect(result.miss_count).toBe(0);
  });

  it("second-pass: a tracked forbidden file the earlier receipt did not report is a MISS decided by Git", async () => {
    const root = repository("miss");
    writePolicy(root, POLICY);
    writeFileSync(join(root, "c.ts"), "export {};\n");
    writeFileSync(join(root, "old.py"), "print('old')\n");
    fixtureCommit(root);
    const store = new LocalRunReceiptStore(join(scratch("miss-receipts"), "receipts"));
    // Earlier run under a policy that allowed .py: no finding.
    writePolicy(root, { ...POLICY, allow: ["*.py"] });
    fixtureCommit(root, "allow py");
    expect(await runCli(["audit", "language-policy", root, "--json"], cliOutput().io, undefined, undefined, store)).toBe(0);
    const [earlier] = store.index();
    writePolicy(root, POLICY);
    fixtureCommit(root, "forbid py again");
    const secondPass = cliOutput();
    expect(await runCli(["second-pass", root, "--against", earlier!.receipt_id, "--json"], secondPass.io, undefined, undefined, store)).toBe(1);
    const result = JSON.parse(secondPass.stdout.join("\n")) as { rows: readonly { classification: string; path: string }[] };
    expect(result.rows).toEqual([expect.objectContaining({ classification: "persisting_unseen", path: "old.py" })]);
  });
});
