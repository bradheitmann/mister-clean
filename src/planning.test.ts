import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessPlanningSources } from "./planning.js";
import { auditPlanningArtifacts } from "./closeout/planning.js";

const valid = { path: "/does-not-exist/planning/tasks/TASK-1.md", content: "---\nartifact_type: task\ntask_id: TASK-1\ntop_level: true\nstatus: active\n---\n" };

describe("selective supplied-document planning capability", () => {
  it("reuses full content policy while explicitly withholding repository verification", () => {
    const result = assessPlanningSources([valid]);
    expect(result.analysis).toEqual(auditPlanningArtifacts([valid]));
    expect(result.analysis.status).toBe("pass");
    expect(result.scope).toBe("supplied_artifacts");
    expect(result.repository_verification).toBe("not_performed");
    expect(result.excluded_checks).toEqual(["repository_discovery", "live_current_projection", "git_ancestry", "repository_closeout"]);
    expect(result.analysis.raw_findings.every((finding) => finding.snapshot === "unbound")).toBe(true);
  });

  it("keeps malformed, duplicate, and unresolved documents payable", () => {
    for (const inputs of [
      [{ path: "planning/bad.md", content: "---\ninvalid: [\n---\n" }],
      [valid, { ...valid, path: "planning/other/TASK-1.md" }],
      [{ ...valid, content: "---\nartifact_type: task\ntask_id: TASK-1\nparent_id: MISSING\nstatus: active\n---\n" }],
    ]) {
      const result = assessPlanningSources(inputs);
      expect(result.analysis.status).toBe("fail");
      expect(result.scope).toBe("supplied_artifacts");
      expect(result.repository_verification).toBe("not_performed");
      expect(result.analysis.raw_findings.every((finding) => finding.snapshot === "unbound")).toBe(true);
      expect(result.analysis).toEqual(auditPlanningArtifacts(inputs));
    }
    expect(assessPlanningSources([]).analysis.status).toBe("not_applicable");
  });

  it("preserves permitted own data fields even when they are non-enumerable", () => {
    const source = Object.create(null);
    Object.defineProperties(source, { path: { value: valid.path }, content: { value: valid.content } });
    expect(assessPlanningSources([source])).toEqual(assessPlanningSources([valid]));
  });

  it("rejects authority injection, getters, inherited records, and undefined inputs", () => {
    let getterReads = 0;
    const accessor = { ...valid, get repository() { getterReads++; return "/tmp"; } };
    for (const input of [undefined, null, {}, [null], [accessor], [{ ...valid, repository: "/tmp" }],
      [Object.assign(Object.create({ snapshot: "forged" }), valid)], [{ path: valid.path }], [{ ...valid, content: 1 }]]) {
      expect(() => assessPlanningSources(input as never)).toThrow(TypeError);
    }
    expect(getterReads).toBe(0);
  });

  it("keeps target I/O and observation callbacks outside the policy dependency seam", () => {
    const policy = readFileSync(new URL("./closeout/planning-analysis/policy.ts", import.meta.url), "utf8");
    expect(policy).not.toMatch(/from ["']node:(?:fs|child_process|sqlite)/u);
    expect(policy).not.toMatch(/from ["'].*(?:repository|repository-inspection)\.js/u);
    const entry = readFileSync(new URL("./planning.ts", import.meta.url), "utf8");
    expect(entry).not.toContain('from "./closeout/planning-analysis/repository.js"');
  });
});
