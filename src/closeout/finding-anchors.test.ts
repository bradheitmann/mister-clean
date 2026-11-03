import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { receiptFindingsFromAudit, receiptFingerprint, type ReceiptFamily } from "./finding-anchors.js";
import { auditGitHubActionsRepository } from "./github-actions.js";
import { scanPublicSafetySync, scanTrackedPublicSafetySync } from "./inspection.js";
import { trackedShippablePaths } from "./repository.js";
import { createFixtureRepository, fixtureCommit } from "../test-support/fixture-repo.js";

const roots: string[] = [];

function fixture(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `mc-anchors-${name}-`));
  roots.push(root);
  createFixtureRepository(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// A planted contact address: the same shape the public-safety email rule matches.
const PLANTED = `${"person"}@${"example.org"}`;

const WORKFLOW = `name: CD
on:
  workflow_dispatch: {}
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: flyctl deploy --app production
`;

describe("finding anchors", () => {
  it("fingerprint-line-shift: a public-safety fingerprint survives a line inserted above the offender", () => {
    const root = fixture("shift-ps");
    writeFileSync(join(root, "notes.txt"), `contact=${PLANTED}\n`);
    fixtureCommit(root);
    const before = receiptFindingsFromAudit("public_safety", scanTrackedPublicSafetySync(root, trackedShippablePaths(root), []), { repository: root });
    expect(before).toHaveLength(1);
    expect(before[0]!.finding.anchor).toMatchObject({ kind: "value_digest", line_hint: 1 });

    writeFileSync(join(root, "notes.txt"), `# heading\ncontact=${PLANTED}\n`);
    fixtureCommit(root, "shift");
    const after = receiptFindingsFromAudit("public_safety", scanTrackedPublicSafetySync(root, trackedShippablePaths(root), []), { repository: root });
    expect(after).toHaveLength(1);
    expect(after[0]!.finding.anchor.line_hint).toBe(2);
    expect(after[0]!.finding.fingerprint).toBe(before[0]!.finding.fingerprint);
    // The legacy fingerprint is positional and does move; the receipt keeps both.
    expect(after[0]!.finding.legacy_fingerprint).not.toBe(before[0]!.finding.legacy_fingerprint);
    // Receipt findings carry digests only, never the planted value.
    expect(JSON.stringify(after)).not.toContain(PLANTED);
  });

  it("fingerprint-line-shift: a GitHub Actions fingerprint survives a line inserted above the offending job", () => {
    const root = fixture("shift-gha");
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(join(root, ".github", "workflows", "cd.yml"), WORKFLOW);
    fixtureCommit(root);
    const before = receiptFindingsFromAudit("github_actions", auditGitHubActionsRepository(root), { repository: root });
    expect(before.length).toBeGreaterThan(0);
    writeFileSync(join(root, ".github", "workflows", "cd.yml"), `# comment\n${WORKFLOW}`);
    fixtureCommit(root, "shift");
    const after = receiptFindingsFromAudit("github_actions", auditGitHubActionsRepository(root), { repository: root });
    expect(after.map((item) => item.finding.fingerprint)).toEqual(before.map((item) => item.finding.fingerprint));
    expect(after.every((item) => item.finding.anchor.kind === "line_content")).toBe(true);
  });

  it("audit-close-parity: the tracked (closeout) and walked (audit) public-safety scans yield one fingerprint per finding", () => {
    const root = fixture("parity");
    writeFileSync(join(root, "notes.txt"), `contact=${PLANTED}\n`);
    fixtureCommit(root);
    const tracked = receiptFindingsFromAudit("public_safety", scanTrackedPublicSafetySync(root, trackedShippablePaths(root), []), { repository: root });
    const walked = receiptFindingsFromAudit("public_safety", scanPublicSafetySync(root), { repository: root });
    expect(tracked.map((item) => item.finding.fingerprint)).toEqual(walked.map((item) => item.finding.fingerprint));
    expect(tracked.map((item) => item.finding)).toEqual(walked.map((item) => item.finding));
  });

  it("audit-close-parity: a result read back from a bundle file fingerprints exactly as the in-process result", () => {
    const root = fixture("parity-roundtrip");
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(join(root, ".github", "workflows", "cd.yml"), WORKFLOW);
    writeFileSync(join(root, "notes.txt"), `contact=${PLANTED}\n`);
    fixtureCommit(root);
    const cases: ReadonlyArray<readonly [ReceiptFamily, unknown]> = [
      ["github_actions", auditGitHubActionsRepository(root)],
      ["public_safety", scanTrackedPublicSafetySync(root, trackedShippablePaths(root), [])],
    ];
    const bundle = mkdtempSync(join(tmpdir(), "mc-anchors-bundle-"));
    roots.push(bundle);
    for (const [family, result] of cases) {
      const file = join(bundle, `${family}.json`);
      writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
      const live = receiptFindingsFromAudit(family, result, { repository: root }).map((item) => item.finding);
      const fromFile = receiptFindingsFromAudit(family, JSON.parse(readFileSync(file, "utf8")), { repository: root }).map((item) => item.finding);
      expect(fromFile).toEqual(live);
    }
  });

  it("binds the fingerprint to family, rule, path, anchor kind and content digest only", () => {
    const base = { family: "public_safety" as const, rule: "email-address", path: "notes.txt", anchor_kind: "value_digest" as const, content_sha256: "a".repeat(64) };
    expect(receiptFingerprint(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(receiptFingerprint({ ...base, path: "other.txt" })).not.toBe(receiptFingerprint(base));
    expect(receiptFingerprint({ ...base, content_sha256: "b".repeat(64) })).not.toBe(receiptFingerprint(base));
    expect(receiptFingerprint({ ...base, anchor_kind: "legacy" })).not.toBe(receiptFingerprint(base));
  });
});
