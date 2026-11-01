import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { JsonObject } from "./bundle-runtime.js";
import { CensusInputRefused, applyPublicSafetyExemptions, applyRetirements, readPublicSafetyExemptions, readRetirements } from "./retirements.js";

const roots: string[] = [];

function scratch(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `mister-clean-retirements-${name}-`));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function sha256(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

function debt(id: string, path: string, body: Record<string, unknown> = {}): JsonObject {
  return {
    id,
    class: "planning_status_drift",
    affected_paths: [path],
    repair_boundary: path,
    procedure: "reconcile",
    state: "open",
    disposition: "autonomously_repair",
    ...body,
  } as JsonObject;
}

function writeRuling(repository: string, detail = "the legacy corpus is frozen by owner ruling"): string {
  const path = "charter/owner-decisions/2026-11-01-retire-legacy.md";
  mkdirSync(join(repository, "charter", "owner-decisions"), { recursive: true });
  writeFileSync(join(repository, path), `${detail}\n`, "utf8");
  return path;
}

function writeRetirement(
  repository: string,
  value: { roots: unknown[]; evidence: { path: string; sha256: string }; author?: string; at?: string },
  name = "2026-11-01-legacy.json",
): void {
  mkdirSync(join(repository, "charter", "retirements"), { recursive: true });
  writeFileSync(join(repository, "charter", "retirements", name), `${JSON.stringify({
    record_type: "mister-clean.retirement",
    schema_version: "1.0",
    slug: "legacy-corpus",
    roots: value.roots,
    ruling: {
      author: value.author ?? "operator",
      at: value.at ?? "2026-11-01T00:00:00Z",
      scope: "Retire the frozen legacy corpus; keep it discoverable but out of the repair queue",
      evidence: value.evidence,
    },
  }, null, 2)}\n`, "utf8");
}

describe("retirement records", () => {
  it("turns every debt under a retired root into one accepted exception and leaves the rest alone", () => {
    const repository = scratch("apply");
    const rulingPath = writeRuling(repository);
    writeRetirement(repository, {
      roots: ["planning/legacy"],
      evidence: { path: rulingPath, sha256: sha256(readFileSync(join(repository, rulingPath), "utf8")) },
    });
    const debts = [
      debt("D1", "planning/legacy/status.md"),
      debt("D2", "planning/legacy/nested/todo.md"),
      debt("D3", "planning/current/status.md"),
    ];

    const outcome = applyRetirements(debts, readRetirements(repository));

    expect(outcome.debts.map((row) => row.state)).toEqual(["accepted_exception", "accepted_exception", "open"]);
    expect(outcome.debts.map((row) => row.disposition)).toEqual([
      "accepted_exception", "accepted_exception", "autonomously_repair",
    ]);
    expect(outcome.debts[0]?.exception).toEqual({
      actor: "operator",
      at: "2026-11-01T00:00:00Z",
      ref: {
        path: rulingPath,
        sha256: sha256(readFileSync(join(repository, rulingPath), "utf8")),
      },
      scope: "retired root planning/legacy",
      rationale: "Retire the frozen legacy corpus; keep it discoverable but out of the repair queue",
    });
    expect(outcome.debts[2]?.exception).toBeUndefined();
    expect(outcome.applications).toEqual([{
      record_path: "charter/retirements/2026-11-01-legacy.json",
      slug: "legacy-corpus",
      root: "planning/legacy",
      debt_ids: ["D1", "D2"],
    }]);
    const census = {
      discovered: outcome.debts.length,
      paid: 0,
      accepted_exception: outcome.debts.filter((row) => row.state === "accepted_exception").length,
    };
    expect(census).toEqual({ discovered: 3, paid: 0, accepted_exception: 2 });
  });

  it("refuses a retirement whose ruling digest does not match", () => {
    const repository = scratch("stale-digest");
    const rulingPath = writeRuling(repository);
    writeRetirement(repository, { roots: ["planning/legacy"], evidence: { path: rulingPath, sha256: "0".repeat(64) } });
    expect(() => readRetirements(repository)).toThrow(CensusInputRefused);
    expect(() => readRetirements(repository)).toThrow(/does not match/u);
  });

  it("refuses a retirement that cites no ruling file", () => {
    const repository = scratch("missing-ruling");
    writeRetirement(repository, { roots: ["planning/legacy"], evidence: { path: "charter/owner-decisions/absent.md", sha256: "0".repeat(64) } });
    expect(() => readRetirements(repository)).toThrow(/does not exist/u);
  });

  it("refuses a root that escapes the repository and a record with no author or date", () => {
    const repository = scratch("bad-roots");
    const rulingPath = writeRuling(repository);
    const evidence = { path: rulingPath, sha256: sha256(readFileSync(join(repository, rulingPath), "utf8")) };
    writeRetirement(repository, { roots: ["../outside"], evidence }, "2026-11-01-escape.json");
    expect(() => readRetirements(repository)).toThrow(/repository-relative path inside the repository/u);

    rmSync(join(repository, "charter", "retirements", "2026-11-01-escape.json"));
    writeRetirement(repository, { roots: ["planning/legacy"], evidence, author: " ", at: "yesterday" });
    expect(() => readRetirements(repository)).toThrow(/ruling.author is required/u);
    expect(() => readRetirements(repository)).toThrow(/ruling.at must be a timezone-aware ISO-8601 timestamp/u);
  });

  it("refuses to retire a debt class that stays payable", () => {
    const repository = scratch("payable");
    const rulingPath = writeRuling(repository);
    writeRetirement(repository, {
      roots: ["planning/legacy"],
      evidence: { path: rulingPath, sha256: sha256(readFileSync(join(repository, rulingPath), "utf8")) },
    });
    const debts = [debt("D1", "planning/legacy/status.md", { class: "stale_doc_or_comment" })];
    expect(() => applyRetirements(debts, readRetirements(repository))).toThrow(/stays payable/u);
  });
});

describe("public-safety fixture exemptions", () => {
  function writeExemption(repository: string, entries: unknown[]): void {
    mkdirSync(join(repository, "charter", "public-safety-exemptions"), { recursive: true });
    writeFileSync(join(repository, "charter", "public-safety-exemptions", "2026-11-01-fixtures.json"), `${JSON.stringify({
      record_type: "mister-clean.public-safety-exemption",
      schema_version: "1.0",
      entries,
    }, null, 2)}\n`, "utf8");
  }

  it("exempts exactly the planted value and keeps a different match in the same file", () => {
    const repository = scratch("exemption");
    const planted = "fixture.invalid";
    const real = "someone.example";
    writeExemption(repository, [{
      file: "src/redactor.test.ts",
      rule: "email-address",
      value_sha256: sha256(planted),
      rationale: "synthetic address that proves the redactor catches addresses",
    }]);
    const findings = [
      { path: "src/redactor.test.ts", rule: "email-address", value_sha256: sha256(planted) },
      { path: "src/redactor.test.ts", rule: "email-address", value_sha256: sha256(real) },
    ];

    const outcome = applyPublicSafetyExemptions(findings, readPublicSafetyExemptions(repository));

    expect(outcome.findings).toHaveLength(1);
    expect(outcome.findings[0]?.value_sha256).toBe(sha256(real));
    expect(outcome.exempted).toHaveLength(1);
    expect(outcome.exempted[0]?.finding.value_sha256).toBe(sha256(planted));
  });

  it("refuses an exemption that no longer matches any finding", () => {
    const repository = scratch("stale-exemption");
    writeExemption(repository, [{
      file: "src/redactor.test.ts",
      rule: "email-address",
      value_sha256: sha256("removed.invalid"),
      rationale: "synthetic address",
    }]);
    expect(() => applyPublicSafetyExemptions([], readPublicSafetyExemptions(repository))).toThrow(/stale/u);
  });

  it("refuses an exemption entry without a value digest", () => {
    const repository = scratch("exemption-shape");
    writeExemption(repository, [{ file: "src/redactor.test.ts", rule: "email-address", rationale: "synthetic" }]);
    expect(() => readPublicSafetyExemptions(repository)).toThrow(/value_sha256/u);
  });
});
