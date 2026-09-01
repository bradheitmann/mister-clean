import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { auditPlanningArtifacts, auditPlanningRepository, type PlanningSource } from "./planning.js";

function source(path: string, content: string): PlanningSource {
  return { path, content };
}

function bodyLineAt(lineNumber: number, line: string): string {
  return `${Array.from({ length: lineNumber - 1 }, (_, index) => `padding ${index + 1}`).join("\n")}\n${line}\n`;
}

function completedParentSources(parent: string, child: string): PlanningSource[] {
  return [
    source(`planning/done/${parent}.md`, `---
artifact_type: story
story_id: ${parent}
status: done
holdout_status: pass
---
| Task | Status |
| ${child} | Done |
`),
    source(`planning/done/${child}.md`, `---
artifact_type: task
task_id: ${child}
parent_id: ${parent}
status: done
---
`),
  ];
}

describe("executable planning graph audit", () => {
  it("derives payable acceptance from child truth instead of trusting a stale parent label", () => {
    const result = auditPlanningArtifacts([
      source("planning/stories/WORK-1.md", `---
artifact_type: story
story_id: WORK-1
status: DRAFT
holdout_status: NOT_RUN
---
| Child | Status |
| TASK-1 | Backlog |
| TASK-2 | Backlog |
`),
      source("planning/slices/done/TASK-1.md", `---
artifact_type: slice
slice_id: TASK-1
parent_id: WORK-1
status: Done
---
STATUS: Backlog
`),
      source("planning/slices/done/TASK-2.md", `---
artifact_type: slice
slice_id: TASK-2
parent_id: WORK-1
status: Backlog
---
STATUS: Done
`),
      source("planning/holdouts/HOLDOUT-WORK-1.md", `---
artifact_type: holdout
story_id: WORK-1
result: NOT_RUN
---
`),
    ]);

    expect(result.status).toBe("fail");
    expect(result.counts.acceptance_cascade_unexecuted).toBe(1);
    expect(result.counts.preexecution_parent_has_started_children).toBe(1);
    expect(result.counts.parent_child_projection_conflict).toBe(2);
    expect(result.counts.lane_status_conflict).toBe(1);
    expect(result.counts.body_projection_conflict).toBe(1);
    const cascade = result.findings.find((finding) => finding.code === "acceptance_cascade_unexecuted");
    expect(cascade?.subject).toBe("WORK-1");
    expect(cascade?.detail).toContain("all 2 direct children are done");
    expect(cascade?.related).toEqual([
      "planning/holdouts/HOLDOUT-WORK-1.md",
      "planning/stories/WORK-1.md#holdout_status",
    ]);
  });

  it("reports a failed acceptance gate as unpaid debt", () => {
    const result = auditPlanningArtifacts([
      source("work-items/parents/WORK-2.md", `---
artifact_type: story
story_id: WORK-2
status: IN_PROGRESS
---
`),
      source("work-items/done/TASK-3.md", `---
artifact_type: slice
slice_id: TASK-3
parent_id: WORK-2
status: Done
---
`),
      source("work-items/reviews/REVIEW-WORK-2.md", `---
artifact_type: review
story_id: WORK-2
verdict: REJECT
---
`),
    ]);

    expect(result.counts.acceptance_failure_unpaid).toBe(1);
    expect(result.counts.acceptance_cascade_unexecuted).toBe(0);
  });

  it("passes a coherent completed graph", () => {
    const result = auditPlanningArtifacts([
      source("planning/stories/WORK-3.md", `---
artifact_type: story
story_id: WORK-3
status: Done
holdout_status: PASS
---
| Child | Status |
| TASK-4 | Done |
`),
      source("planning/done/TASK-4.md", `---
artifact_type: slice
slice_id: TASK-4
parent_id: WORK-3
status: Done
---
STATUS: Done
`),
      source("planning/holdouts/HOLDOUT-WORK-3.md", `---
artifact_type: holdout
story_id: WORK-3
result: PASS
---
`),
    ]);

    expect(result.status).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("parses nested YAML and normal JSON instead of silently passing them", () => {
    const result = auditPlanningArtifacts([
      source("planning/stories/YAML-1.yaml", `
artifact_type: story
story_id: YAML-1
status: in_progress
acceptance:
  holdout:
    status: not_run
children:
  - JSON-TASK-1
`),
      source("planning/done/JSON-TASK-1.json", JSON.stringify({
        artifact_type: "slice",
        slice_id: "JSON-TASK-1",
        parent_id: "YAML-1",
        status: "done",
      })),
    ]);

    expect(result.counts.acceptance_cascade_unexecuted).toBe(1);
    expect(result.counts.planning_input_unparsed).toBe(0);
  });

  it("fails closed for unknown and conflicting acceptance projections", () => {
    const result = auditPlanningArtifacts([
      source("planning/stories/GATE-1.mdx", `---
artifact_type: story
story_id: GATE-1
status: in_progress
acceptance:
  review:
    status: MAYBE
review_status: PASS
---
`),
      source("planning/done/GATE-TASK.md", `---
artifact_type: slice
slice_id: GATE-TASK
parent_id: GATE-1
status: done
---
`),
    ]);

    expect(result.counts.acceptance_gate_unknown).toBe(1);
    expect(result.counts.acceptance_gate_identity_conflict).toBe(1);
  });

  it("rejects an omitted gate after every direct child is done", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/NO-GATE.md", `---
artifact_type: story
story_id: NO-GATE
status: done
---
`),
      source("planning/done/NO-GATE-TASK.md", `---
artifact_type: slice
slice_id: NO-GATE-TASK
parent_id: NO-GATE
status: done
---
`),
    ]);

    expect(result.counts.acceptance_gate_undiscovered).toBe(1);
  });

  it("does not let a failed physical lane inherit a stale done declaration", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/FAILED-PARENT.md", `---
artifact_type: story
story_id: FAILED-PARENT
status: done
holdout_status: pass
---
`),
      source("planning/failed/FAILED-CHILD.md", `---
artifact_type: slice
slice_id: FAILED-CHILD
parent_id: FAILED-PARENT
status: done
---
`),
    ]);

    expect(result.counts.lane_status_conflict).toBe(1);
    expect(result.counts.parent_completion_stale).toBe(0);
  });

  it("requires each leaf planning artifact to resolve to one parent", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/ORPHAN-LEAF.md", `---
artifact_type: slice
slice_id: ORPHAN-LEAF
status: done
---
`),
    ]);

    expect(result.counts.planning_relationship_unresolved).toBe(1);
  });

  it("allows an explicitly top-level leaf without inventing a parent", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/TOP-LEVEL.md", `---
artifact_type: task
task_id: TOP-LEVEL
status: done
top_level: true
---
`),
    ]);

    expect(result.counts.planning_relationship_unresolved).toBe(0);
  });

  it("requires a rationale when acceptance is explicitly not applicable", () => {
    const withoutReason = auditPlanningArtifacts([
      source("planning/done/NA-NO-REASON.md", `---
artifact_type: story
story_id: NA-NO-REASON
status: done
acceptance:
  status: not_applicable
---
`),
      source("planning/done/NA-TASK.md", `---
artifact_type: slice
slice_id: NA-TASK
parent_id: NA-NO-REASON
status: done
---
`),
    ]);
    const withReason = auditPlanningArtifacts([
      source("planning/done/NA-WITH-REASON.md", `---
artifact_type: story
story_id: NA-WITH-REASON
status: done
acceptance:
  status: not_applicable
  rationale: This synthetic aggregate has no independent acceptance procedure.
---
`),
      source("planning/done/NA-TASK-2.md", `---
artifact_type: slice
slice_id: NA-TASK-2
parent_id: NA-WITH-REASON
status: done
---
`),
    ]);

    expect(withoutReason.counts.acceptance_gate_unknown).toBe(1);
    expect(withReason.findings).toEqual([]);
  });

  it("rejects a completed parent with an unexecuted gate even without children", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/PARENT-DONE.md", `---
artifact_type: story
story_id: PARENT-DONE
status: done
holdout_status: not_run
---
`),
    ]);

    expect(result.counts.completed_parent_unexecuted_acceptance).toBe(1);
  });

  it("uses exact child cells and never substring-matches TASK-1 to TASK-10", () => {
    const result = auditPlanningArtifacts([
      source("planning/stories/EXACT.md", `---
artifact_type: story
story_id: EXACT
status: active
holdout_status: not_run
---
| Child | Status |
| TASK-1 | Backlog |
| TASK-10 | Done |
`),
      source("planning/done/TASK-1.md", `---
artifact_type: slice
slice_id: TASK-1
status: done
---
`),
      source("planning/done/TASK-10.md", `---
artifact_type: slice
slice_id: TASK-10
status: done
---
`),
    ]);

    expect(result.counts.parent_child_projection_conflict).toBe(1);
    const conflict = result.findings.find((finding) => finding.code === "parent_child_projection_conflict");
    expect(conflict?.detail).toContain("TASK-1");
    expect(conflict?.detail).not.toContain("TASK-10");
  });

  it("keeps escaped pipes inside child-table cells", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/ESCAPED-PIPE-PARENT.md", `---
artifact_type: story
story_id: ESCAPED-PIPE-PARENT
status: done
holdout_status: pass
---
| Child | Note | Status |
| --- | --- | --- |
| ESCAPED\\|PIPE | literal \\| pipe | Done |
`),
      source("planning/done/ESCAPED-PIPE-TASK.md", `---
artifact_type: task
task_id: "ESCAPED|PIPE"
parent_id: ESCAPED-PIPE-PARENT
status: done
---
`),
    ]);

    expect(result.findings).toEqual([]);
  });

  it("keeps inline-code pipes inside child-table cells", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/INLINE-CODE-PIPE-PARENT.md", `---
artifact_type: story
story_id: INLINE-CODE-PIPE-PARENT
status: done
holdout_status: pass
---
| Child | Note | Status |
| --- | --- | --- |
| \`INLINE|PIPE\` | \`left|right\` | Done |
`),
      source("planning/done/INLINE-CODE-PIPE-TASK.md", `---
artifact_type: task
task_id: "INLINE|PIPE"
parent_id: INLINE-CODE-PIPE-PARENT
status: done
---
`),
    ]);

    expect(result.findings).toEqual([]);
  });

  it("detects duplicate IDs and contradictory parentage", () => {
    const result = auditPlanningArtifacts([
      source("planning/stories/PARENT-1.md", `---
artifact_type: story
story_id: PARENT-1
status: active
---
`),
      source("planning/stories/PARENT-2.md", `---
artifact_type: story
story_id: PARENT-2
status: active
---
| Child | Status |
| SHARED | Active |
`),
      source("planning/active/SHARED-A.md", `---
artifact_type: slice
slice_id: SHARED
parent_id: PARENT-1
status: active
---
`),
      source("planning/active/SHARED-B.md", `---
artifact_type: slice
slice_id: SHARED
parent_id: PARENT-1
status: active
---
`),
    ]);

    expect(result.counts.duplicate_artifact_id).toBe(2);
    expect(result.counts.planning_relationship_conflict).toBeGreaterThan(0);
  });

  it("fails malformed structured input and cannot archive by bundle label alone", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/BROKEN.yaml", "status: [unterminated"),
      {
        path: "planning/active/LIVE.md",
        declaredClass: "archived",
        content: "---\nartifact_type: story\nstory_id: LIVE\nstatus: active\n---\n",
      },
    ]);

    expect(result.counts.planning_input_unparsed).toBe(1);
    expect(result.counts.archive_classification_conflict).toBe(1);
  });

  it("reconciles an archived lane against active frontmatter before exclusion", () => {
    const result = auditPlanningArtifacts([
      source("planning/archive/LIVE.md", `---
artifact_type: task
task_id: LIVE
status: active
top_level: true
---
Status: Active
`),
    ]);

    expect(result.counts.lane_status_conflict).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("reconciles an archived lane against a current active body before exclusion", () => {
    const result = auditPlanningArtifacts([
      source("planning/archive/BODY-LIVE.md", `---
artifact_type: task
task_id: BODY-LIVE
status: archived
top_level: true
---
Status: Active
`),
    ]);

    expect(result.counts.body_projection_conflict).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("cannot hide an active failed acceptance record in an archive lane", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/ARCHIVE-GATE-PARENT.md", `---
artifact_type: story
story_id: ARCHIVE-GATE-PARENT
status: done
holdout_status: pass
---
| Child | Status |
| ARCHIVE-GATE-CHILD | Done |
`),
      source("planning/done/ARCHIVE-GATE-CHILD.md", `---
artifact_type: task
task_id: ARCHIVE-GATE-CHILD
parent_id: ARCHIVE-GATE-PARENT
status: done
---
`),
      source("planning/archive/ARCHIVE-GATE-REVIEW.md", `---
artifact_type: review
review_id: ARCHIVE-GATE-REVIEW
story_id: ARCHIVE-GATE-PARENT
status: active
verdict: reject
---
`),
    ]);

    expect(result.counts.lane_status_conflict).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("excludes a coherently archived historical acceptance record from the current cascade", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/HISTORICAL-GATE-PARENT.md", `---
artifact_type: story
story_id: HISTORICAL-GATE-PARENT
status: done
holdout_status: pass
---
| Child | Status |
| HISTORICAL-GATE-CHILD | Done |
`),
      source("planning/done/HISTORICAL-GATE-CHILD.md", `---
artifact_type: task
task_id: HISTORICAL-GATE-CHILD
parent_id: HISTORICAL-GATE-PARENT
status: done
---
`),
      source("planning/archive/HISTORICAL-GATE-REVIEW.md", `---
artifact_type: review
review_id: HISTORICAL-GATE-REVIEW
story_id: HISTORICAL-GATE-PARENT
status: archived
verdict: reject
---
Status: Archived
`),
    ]);

    expect(result.findings).toEqual([]);
  });

  it("still requires an archived acceptance record to resolve its parent", () => {
    const result = auditPlanningArtifacts([
      source("planning/archive/ORPHAN-HISTORICAL-REVIEW.md", `---
artifact_type: review
review_id: ORPHAN-HISTORICAL-REVIEW
parent_id: MISSING-HISTORICAL-PARENT
status: archived
verdict: reject
---
Status: Archived
`),
    ]);

    expect(result.counts.orphan_parent_reference).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("rejects an archived acceptance record that resolves to multiple parents", () => {
    const result = auditPlanningArtifacts([
      source("planning/archive/HISTORICAL-PARENT-A.md", `---
artifact_type: story
story_id: HISTORICAL-PARENT-A
status: archived
---
`),
      source("planning/archive/HISTORICAL-PARENT-B.md", `---
artifact_type: story
story_id: HISTORICAL-PARENT-B
status: archived
---
`),
      source("planning/archive/AMBIGUOUS-HISTORICAL-REVIEW.md", `---
artifact_type: review
review_id: AMBIGUOUS-HISTORICAL-REVIEW
parent_ids: [HISTORICAL-PARENT-A, HISTORICAL-PARENT-B]
status: archived
verdict: reject
---
Status: Archived
`),
    ]);

    expect(result.counts.planning_relationship_conflict).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("allows an archived acceptance record to resolve to one archived parent", () => {
    const result = auditPlanningArtifacts([
      source("planning/archive/ONE-HISTORICAL-PARENT.md", `---
artifact_type: story
story_id: ONE-HISTORICAL-PARENT
status: archived
---
`),
      source("planning/archive/ONE-HISTORICAL-REVIEW.md", `---
artifact_type: review
review_id: ONE-HISTORICAL-REVIEW
parent_id: ONE-HISTORICAL-PARENT
status: archived
verdict: reject
---
Status: Archived
`),
    ]);

    expect(result.findings).toEqual([]);
  });

  it("rejects a live child whose only declared parent is archived", () => {
    const result = auditPlanningArtifacts([
      source("planning/archive/ARCHIVED-PARENT.md", `---
artifact_type: story
story_id: ARCHIVED-PARENT
status: archived
---
`),
      source("planning/active/LIVE-CHILD.md", `---
artifact_type: task
task_id: LIVE-CHILD
parent_id: ARCHIVED-PARENT
status: active
---
`),
    ]);

    expect(result.counts.planning_relationship_conflict).toBe(1);
    expect(result.counts.planning_relationship_unresolved).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("accepts an explicitly archived child retired under a live parent", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/LIVE-PARENT.md", `---
artifact_type: story
story_id: LIVE-PARENT
status: active
---
| Child | Status |
| ARCHIVED-CHILD | Archived |
`),
      source("planning/archive/ARCHIVED-CHILD.md", `---
artifact_type: task
task_id: ARCHIVED-CHILD
parent_id: LIVE-PARENT
status: archived
---
`),
    ]);

    expect(result.counts.planning_relationship_conflict ?? 0).toBe(0);
  });

  it("allows an archived parent and archived child to remain a coherent historical graph", () => {
    const result = auditPlanningArtifacts([
      source("planning/archive/HISTORICAL-PARENT.md", `---
artifact_type: story
story_id: HISTORICAL-PARENT
status: archived
---
| Child | Status |
| HISTORICAL-CHILD | Archived |
`),
      source("planning/archive/HISTORICAL-CHILD.md", `---
artifact_type: task
task_id: HISTORICAL-CHILD
parent_id: HISTORICAL-PARENT
status: archived
---
`),
    ]);

    expect(result.findings).toEqual([]);
  });

  it("requires an archived leaf to have one parent or declare itself top-level", () => {
    const result = auditPlanningArtifacts([
      source("planning/archive/ORPHAN-HISTORICAL-TASK.md", `---
artifact_type: task
task_id: ORPHAN-HISTORICAL-TASK
status: archived
---
`),
    ]);

    expect(result.counts.planning_relationship_unresolved).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("allows an intentionally top-level archived leaf", () => {
    const result = auditPlanningArtifacts([
      source("planning/archive/TOP-LEVEL-HISTORICAL-TASK.md", `---
artifact_type: task
task_id: TOP-LEVEL-HISTORICAL-TASK
status: archived
top_level: true
---
`),
    ]);

    expect(result.findings).toEqual([]);
  });

  it("rejects an archived top-level leaf that declares a Markdown child table", () => {
    const result = auditPlanningArtifacts([
      source("planning/archive/HISTORICAL-LEAF-WITH-CHILD.md", `---
artifact_type: slice
slice_id: HISTORICAL-LEAF-WITH-CHILD
status: archived
top_level: true
---
| Child | Status |
| MISSING-HISTORICAL-CHILD | Archived |
`),
    ]);

    expect(result.counts.planning_relationship_conflict).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("rejects a live top-level leaf that declares structured children", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/LIVE-LEAF-WITH-CHILD.md", `---
artifact_type: task
task_id: LIVE-LEAF-WITH-CHILD
status: done
top_level: true
holdout_status: pass
children: [MISSING-LIVE-CHILD]
---
`),
    ]);

    expect(result.counts.planning_relationship_conflict).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("reconciles child projections on custom and untyped parent artifacts", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/CUSTOM-MILESTONE.md", `---
artifact_type: milestone
id: CUSTOM-MILESTONE
status: active
children: [MISSING-CUSTOM-CHILD]
---
`),
      source("planning/active/UNTYPED-PARENT.md", `---
id: UNTYPED-PARENT
status: active
children: [MISSING-UNTYPED-CHILD]
---
`),
    ]);

    expect(result.counts.planning_relationship_unresolved).toBe(2);
    expect(result.status).toBe("fail");
  });

  it("accepts a valid custom parent relationship", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/CUSTOM-INITIATIVE.md", `---
artifact_type: initiative
id: CUSTOM-INITIATIVE
status: active
children: [CUSTOM-INITIATIVE-CHILD]
---
`),
      source("planning/active/CUSTOM-INITIATIVE-CHILD.md", `---
artifact_type: task
task_id: CUSTOM-INITIATIVE-CHILD
parent_id: CUSTOM-INITIATIVE
status: active
---
`),
    ]);

    expect(result.findings).toEqual([]);
  });

  it("rejects a cycle formed by custom parent types", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/CUSTOM-CYCLE-A.md", `---
artifact_type: milestone
id: CUSTOM-CYCLE-A
parent_id: CUSTOM-CYCLE-B
status: active
children: [CUSTOM-CYCLE-B]
---
`),
      source("planning/active/CUSTOM-CYCLE-B.md", `---
artifact_type: initiative
id: CUSTOM-CYCLE-B
parent_id: CUSTOM-CYCLE-A
status: active
children: [CUSTOM-CYCLE-A]
---
`),
    ]);

    expect(result.counts.planning_relationship_conflict).toBe(2);
    expect(result.status).toBe("fail");
  });

  it("reconciles archived parent-table projections with archived children", () => {
    const result = auditPlanningArtifacts([
      source("planning/archive/HISTORICAL-PROJECTION-PARENT.md", `---
artifact_type: story
story_id: HISTORICAL-PROJECTION-PARENT
status: archived
---
| Child | Status |
| HISTORICAL-PROJECTION-CHILD | Done |
`),
      source("planning/archive/HISTORICAL-PROJECTION-CHILD.md", `---
artifact_type: task
task_id: HISTORICAL-PROJECTION-CHILD
parent_id: HISTORICAL-PROJECTION-PARENT
status: archived
---
`),
    ]);

    expect(result.counts.parent_child_projection_conflict).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("rejects cycles inside a coherent historical relationship graph", () => {
    const result = auditPlanningArtifacts([
      source("planning/archive/HISTORICAL-CYCLE-A.md", `---
artifact_type: story
story_id: HISTORICAL-CYCLE-A
parent_id: HISTORICAL-CYCLE-B
status: archived
---
`),
      source("planning/archive/HISTORICAL-CYCLE-B.md", `---
artifact_type: story
story_id: HISTORICAL-CYCLE-B
parent_id: HISTORICAL-CYCLE-A
status: archived
---
`),
    ]);

    expect(result.counts.planning_relationship_conflict).toBe(2);
    expect(result.status).toBe("fail");
  });

  it("leaves a live parent and live child relationship unchanged", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/CURRENT-PARENT.md", `---
artifact_type: story
story_id: CURRENT-PARENT
status: active
---
| Child | Status |
| CURRENT-CHILD | Active |
`),
      source("planning/active/CURRENT-CHILD.md", `---
artifact_type: task
task_id: CURRENT-CHILD
parent_id: CURRENT-PARENT
status: active
---
`),
    ]);

    expect(result.findings).toEqual([]);
  });

  it.each(["reject", "pass", "not_run"])(
    "rejects a live %s acceptance result whose parent is archived",
    (verdict) => {
      const result = auditPlanningArtifacts([
        source("planning/archive/ACCEPTANCE-ARCHIVED-PARENT.md", `---
artifact_type: story
story_id: ACCEPTANCE-ARCHIVED-PARENT
status: archived
---
`),
        source("planning/reviews/ACCEPTANCE-LIVE-REVIEW.md", `---
artifact_type: review
review_id: ACCEPTANCE-LIVE-REVIEW
parent_id: ACCEPTANCE-ARCHIVED-PARENT
status: active
verdict: ${verdict}
---
`),
      ]);

      expect(result.counts.planning_relationship_conflict).toBe(1);
      expect(result.counts.planning_relationship_unresolved).toBe(1);
      expect(result.status).toBe("fail");
    },
  );

  it("leaves a live acceptance result attached to a live parent unchanged", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/ACCEPTANCE-LIVE-PARENT.md", `---
artifact_type: story
story_id: ACCEPTANCE-LIVE-PARENT
status: active
---
`),
      source("planning/reviews/ACCEPTANCE-LIVE-REVIEW.md", `---
artifact_type: review
review_id: ACCEPTANCE-LIVE-REVIEW
parent_id: ACCEPTANCE-LIVE-PARENT
status: active
verdict: pass
---
`),
    ]);

    expect(result.findings).toEqual([]);
  });

  it("rejects a self-referential live planning relationship", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/SELF-LOOP.md", `---
artifact_type: story
story_id: SELF-LOOP
parent_id: SELF-LOOP
status: done
holdout_status: pass
---
| Child | Status |
| SELF-LOOP | Done |
`),
    ]);

    expect(result.counts.planning_relationship_conflict).toBe(1);
    expect(result.findings[0]?.detail).toContain("cycle contains 1 artifact");
  });

  it("rejects every member of a two-artifact live planning cycle", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/CYCLE-A.md", `---
artifact_type: story
story_id: CYCLE-A
parent_id: CYCLE-B
status: done
holdout_status: pass
---
| Child | Status |
| CYCLE-B | Done |
`),
      source("planning/done/CYCLE-B.md", `---
artifact_type: story
story_id: CYCLE-B
parent_id: CYCLE-A
status: done
holdout_status: pass
---
| Child | Status |
| CYCLE-A | Done |
`),
    ]);

    expect(result.counts.planning_relationship_conflict).toBe(2);
    expect(result.findings.filter((finding) => finding.detail.includes("cycle contains 2 artifacts"))).toHaveLength(2);
  });

  it("rejects a live planning cycle spanning independently discovered roots", () => {
    const result = auditPlanningArtifacts([
      source("product/plans/done/CROSS-CYCLE-A.md", `---
artifact_type: story
story_id: CROSS-CYCLE-A
parent_id: CROSS-CYCLE-B
status: done
holdout_status: pass
---
| Child | Status |
| CROSS-CYCLE-B | Done |
`),
      source("delivery/tasks/done/CROSS-CYCLE-B.md", `---
artifact_type: story
story_id: CROSS-CYCLE-B
parent_id: CROSS-CYCLE-A
status: done
holdout_status: pass
---
| Child | Status |
| CROSS-CYCLE-A | Done |
`),
    ], 2);

    expect(result.planningRootCount).toBe(2);
    expect(result.counts.planning_relationship_conflict).toBe(2);
    expect(result.status).toBe("fail");
  });

  it("cannot establish CLEAN from a wholly narrative planning corpus", () => {
    const result = auditPlanningArtifacts([
      source("planning/backlog.md", "# Backlog\n\nEventually implement the feature.\n"),
    ]);

    expect(result.status).toBe("fail");
    expect(result.structuredArtifactCount).toBe(0);
    expect(result.counts.planning_input_unparsed).toBe(1);
  });

  it("cannot hide planning signals behind a non-artifact class or type", () => {
    const byBundle = auditPlanningArtifacts([
      {
        path: "planning/done/GUIDANCE-LIE.md",
        declaredClass: "guidance",
        classificationRationale: "claimed prose",
        content: `---
artifact_type: story
story_id: GUIDANCE-LIE
status: done
holdout_status: not_run
---
`,
      },
      source("planning/done/GUIDANCE-TASK.md", `---
artifact_type: slice
slice_id: GUIDANCE-TASK
parent_id: GUIDANCE-LIE
status: done
---
`),
    ]);
    const byFrontmatter = auditPlanningArtifacts([
      source("planning/done/GUIDANCE-TYPE.md", `---
artifact_type: guidance
story_id: GUIDANCE-TYPE
status: done
holdout_status: not_run
classification_rationale: claimed prose
---
`),
      source("planning/done/GUIDANCE-TYPE-TASK.md", `---
artifact_type: slice
slice_id: GUIDANCE-TYPE-TASK
parent_id: GUIDANCE-TYPE
status: done
---
`),
    ]);

    expect(byBundle.counts.planning_input_unparsed).toBe(1);
    expect(byBundle.counts.acceptance_cascade_unexecuted).toBe(1);
    expect(byFrontmatter.counts.planning_input_unparsed).toBe(1);
    expect(byFrontmatter.counts.acceptance_cascade_unexecuted).toBe(1);
  });

  it("permits only inert, reasoned non-artifact guidance", () => {
    const reasoned = auditPlanningArtifacts([{
      path: "planning/guidance/CONVENTIONS.md",
      declaredClass: "guidance",
      classificationRationale: "Repository planning vocabulary reference; it declares no work item.",
      content: "# Planning conventions\n",
    }]);
    const unexplained = auditPlanningArtifacts([{
      path: "planning/guidance/UNEXPLAINED.md",
      declaredClass: "guidance",
      content: "# Notes\n",
    }]);

    expect(reasoned.findings).toEqual([]);
    expect(unexplained.counts.planning_input_unparsed).toBe(1);
  });

  it("fails closed when a multi-artifact collection names records that are not materialized", () => {
    const result = auditPlanningArtifacts([
      source("planning/graph.json", JSON.stringify({
        artifacts: [{ id: "A", status: "done" }, { id: "B", parent_id: "A", status: "done" }],
      })),
    ]);

    expect(result.counts.planning_relationship_unresolved).toBe(2);
    expect(result.status).toBe("fail");
  });

  it("requires acceptance artifacts themselves to resolve to a parent", () => {
    const result = auditPlanningArtifacts([
      source("planning/holdouts/FLOATING.md", `---
artifact_type: holdout
holdout_id: FLOATING
result: pass
---
`),
    ]);

    expect(result.counts.planning_relationship_unresolved).toBe(1);
  });

  it("does not treat a historical status section as the current projection", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/HISTORY.md", `---
artifact_type: story
story_id: HISTORY
status: done
---
## Previous status
Status: Backlog

## Resolution
The work is complete.
`),
    ]);

    expect(result.counts.body_projection_conflict).toBe(0);
  });

  it("scans current body state before, at, and after the former 240-line boundary", () => {
    const result = auditPlanningArtifacts([239, 240, 241].map((lineNumber) =>
      source(`planning/done/BOUNDARY-${lineNumber}.md`, `---
artifact_type: story
story_id: BOUNDARY-${lineNumber}
status: done
---
${bodyLineAt(lineNumber, "Status: Backlog")}`)));

    expect(result.counts.body_projection_conflict).toBe(3);
    expect(result.findings
      .filter((finding) => finding.code === "body_projection_conflict")
      .map((finding) => finding.path)).toEqual([
        "planning/done/BOUNDARY-239.md",
        "planning/done/BOUNDARY-240.md",
        "planning/done/BOUNDARY-241.md",
      ]);
  });

  it("fails closed on contradictory lifecycle fields independent of key order", () => {
    const results = [
      "status: done\nstate: active",
      "state: active\nstatus: done",
    ].map((fields) => auditPlanningArtifacts([
      source("planning/items/STATE-PERMUTATION.md", `---
artifact_type: task
task_id: STATE-PERMUTATION
top_level: true
${fields}
---
`),
    ]));

    expect(results[0]).toEqual(results[1]);
    expect(results[0]?.counts.lifecycle_state_unknown).toBe(1);
    expect(results[0]?.status).toBe("fail");
  });

  it("treats a decisive lifecycle status as authoritative over progress phase", () => {
    for (const fields of [
      "status: Ready for QA\nphase: IMPLEMENTED",
      "phase: IMPLEMENTED\nstatus: Ready for QA",
      "status: active\nphase: done",
    ]) {
      const result = auditPlanningArtifacts([
        source("planning/items/STATUS-DECISIVE.md", `---
artifact_type: task
task_id: STATUS-DECISIVE
top_level: true
${fields}
---
`),
      ]);
      expect(result.counts.lifecycle_state_unknown ?? 0).toBe(0);
    }
  });

  it("uses explicit acceptance outcomes ahead of generic status independent of key order", () => {
    const results = [
      "status: failed\nverdict: pass",
      "verdict: pass\nstatus: failed",
    ].map((fields) => auditPlanningArtifacts([
      source("planning/done/ACCEPTANCE-PRECEDENCE.md", `---
artifact_type: story
story_id: ACCEPTANCE-PRECEDENCE
status: done
---
| Child | Status |
| ACCEPTANCE-PRECEDENCE-TASK | Done |
`),
      source("planning/done/ACCEPTANCE-PRECEDENCE-TASK.md", `---
artifact_type: task
task_id: ACCEPTANCE-PRECEDENCE-TASK
parent_id: ACCEPTANCE-PRECEDENCE
status: done
---
`),
      source("planning/reviews/ACCEPTANCE-PRECEDENCE-REVIEW.md", `---
artifact_type: review
review_id: ACCEPTANCE-PRECEDENCE-REVIEW
story_id: ACCEPTANCE-PRECEDENCE
${fields}
---
`),
    ]));

    expect(results[0]).toEqual(results[1]);
    expect(results[0]?.findings).toEqual([]);
  });

  it("fails closed on contradictory explicit acceptance outcomes independent of key order", () => {
    const results = [
      "result: pass\nverdict: fail",
      "verdict: fail\nresult: pass",
    ].map((fields) => auditPlanningArtifacts([
      source("planning/active/ACCEPTANCE-CONFLICT.md", `---
artifact_type: story
story_id: ACCEPTANCE-CONFLICT
status: active
---
`),
      source("planning/reviews/ACCEPTANCE-CONFLICT-REVIEW.md", `---
artifact_type: review
review_id: ACCEPTANCE-CONFLICT-REVIEW
story_id: ACCEPTANCE-CONFLICT
${fields}
---
`),
    ]));

    expect(results[0]).toEqual(results[1]);
    expect(results[0]?.counts.acceptance_gate_identity_conflict).toBe(1);
    expect(results[0]?.counts.acceptance_failure_unpaid).toBe(1);
    expect(results[0]?.status).toBe("fail");
  });

  it("shares nested historical-section awareness between body states and child tables", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/HISTORICAL-TABLE.md", `---
artifact_type: story
story_id: HISTORICAL-TABLE
status: done
holdout_status: pass
---
## History
### Snapshot
Status: Backlog

| Child | Status |
| GHOST-TASK | Done |

## Current projection
Status: Done

${bodyLineAt(241, "| Child | Status |\n| CURRENT-TASK | Done |")}`),
      source("planning/done/CURRENT-TASK.md", `---
artifact_type: task
task_id: CURRENT-TASK
parent_id: HISTORICAL-TABLE
status: done
---
`),
    ]);

    expect(result.findings).toEqual([]);
  });

  it("resolves canonical hierarchy parent fields for feature artifacts", () => {
    const missing = auditPlanningArtifacts([
      source("planning/active/FEATURE-MISSING.md", `---
artifact_type: feature
feature_id: FEATURE-MISSING
epic_id: MISSING-EPIC
status: active
---
`),
    ]);
    const existing = auditPlanningArtifacts([
      source("planning/active/EPIC-EXISTS.md", `---
artifact_type: epic
epic_id: EPIC-EXISTS
status: active
---
`),
      source("planning/active/FEATURE-EXISTS.md", `---
artifact_type: feature
feature_id: FEATURE-EXISTS
epic_id: EPIC-EXISTS
status: active
---
`),
    ]);

    expect(missing.counts.orphan_parent_reference).toBe(1);
    expect(missing.status).toBe("fail");
    expect(existing.findings).toEqual([]);
  });

  it("normalizes camelCase JSON planning keys into the canonical schema", () => {
    const results = [
      auditPlanningArtifacts([
        source("planning/active/FEATURE-CAMEL.json", JSON.stringify({
          artifactType: "feature",
          epicId: "MISSING-EPIC",
          featureId: "FEATURE-CAMEL",
          status: "active",
        })),
      ]),
      auditPlanningArtifacts([
        source("planning/active/TASK-CAMEL.json", JSON.stringify({
          artifactType: "task",
          parentId: "MISSING-PARENT",
          status: "active",
          taskId: "TASK-CAMEL",
          topLevel: true,
        })),
      ]),
    ];

    for (const result of results) {
      expect(result.counts.orphan_parent_reference).toBe(1);
      expect(result.status).toBe("fail");
    }
  });

  it("reconciles every declared artifact type and identity alias", () => {
    const equal = auditPlanningArtifacts([
      source("planning/active/EQUAL-ALIASES.json", JSON.stringify({
        artifactType: "story",
        id: "EQUAL-ALIASES",
        kind: "Story",
        status: "active",
        storyId: "EQUAL-ALIASES",
      })),
    ]);
    const identityConflicts = [
      { artifact_type: "story", id: "S2", status: "active", story_id: "S1" },
      { artifactType: "story", id: "S2", status: "active", storyId: "S1" },
      { ArtifactType: "story", ID: "S2", Status: "active", StoryID: "S1" },
    ].map((record) => auditPlanningArtifacts([
      source("planning/active/IDENTITY-CONFLICT.json", JSON.stringify(record)),
    ]));
    const typeConflict = auditPlanningArtifacts([
      source("planning/active/TYPE-CONFLICT.json", JSON.stringify({
        artifact_type: "story",
        kind: "task",
        status: "active",
        story_id: "TYPE-CONFLICT",
      })),
    ]);

    expect(equal.findings).toEqual([]);
    for (const result of identityConflicts) {
      expect(result.counts.planning_relationship_conflict).toBe(1);
      expect(result.status).toBe("fail");
    }
    expect(identityConflicts[0]).toEqual(identityConflicts[1]);
    expect(identityConflicts[1]).toEqual(identityConflicts[2]);
    expect(typeConflict.counts.planning_relationship_conflict).toBe(1);
    expect(typeConflict.status).toBe("fail");
  });

  it("fails every malformed artifact type or identity alias instead of inferring through it", () => {
    const malformedTypes = [
      { artifact_type: ["story", "task"], status: "active" },
      { artifactType: { value: "story" }, status: "active" },
      { ArtifactType: null, Status: "active" },
      { kind: "", status: "active" },
    ].map((record, index) => auditPlanningArtifacts([
      source(`planning/active/MALFORMED-TYPE-${index}.json`, JSON.stringify(record)),
    ]));
    const malformedIdentities = [
      { artifact_type: "story", status: "active", story_id: ["S1", "S2"] },
      { artifactType: "story", status: "active", storyId: { value: "S1" } },
      { ArtifactType: "story", Status: "active", StoryID: null },
      { artifact_type: "story", id: "", status: "active" },
    ].map((record, index) => auditPlanningArtifacts([
      source(`planning/active/MALFORMED-IDENTITY-${index}.json`, JSON.stringify(record)),
    ]));

    for (const result of [...malformedTypes, ...malformedIdentities]) {
      expect(result.counts.planning_relationship_conflict).toBe(1);
      expect(result.status).toBe("fail");
    }
  });

  it("infers artifact type and identity only when no corresponding alias is declared", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/INFERRED-STORY.md", `---
status: active
---
`),
    ]);

    expect(result.findings).toEqual([]);
  });

  it("never treats an incoming parent ID as the child's own fallback identity", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/PARENT-STORY.md", `---
artifact_type: story
story_id: PARENT-STORY
status: active
---
`),
      source("planning/active/CHILD-WITH-FILENAME-ID.md", `---
artifact_type: task
story_id: PARENT-STORY
status: active
---
`),
    ]);

    expect(result.findings).toEqual([]);
  });

  it("fails conflicting explicit and canonical parent references", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/EPIC-ONE.md", `---
artifact_type: epic
epic_id: EPIC-ONE
status: active
---
`),
      source("planning/active/EPIC-TWO.md", `---
artifact_type: epic
epic_id: EPIC-TWO
status: active
---
`),
      source("planning/active/FEATURE-CONFLICT.md", `---
artifact_type: feature
feature_id: FEATURE-CONFLICT
parent_id: EPIC-ONE
epic_id: EPIC-TWO
status: active
---
`),
    ]);

    expect(result.counts.planning_relationship_conflict).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("treats status indexes as rollup projections rather than extra parents", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/INDEX-EPIC.md", `---
artifact_type: epic
epic_id: INDEX-EPIC
status: active
---
`),
      source("planning/active/INDEX-STORY.md", `---
artifact_type: story
story_id: INDEX-STORY
parent_id: INDEX-EPIC
status: active
---
`),
      source("planning/active/STATUS.md", `---
artifact_type: status_index
id: STATUS
status: active
---
| Story | Status |
| INDEX-STORY | Active |
`),
    ]);

    expect(result.findings).toEqual([]);
  });

  it("still fails rollup projections with missing targets or stale state", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/ROLLUP-STORY.md", `---
artifact_type: story
story_id: ROLLUP-STORY
status: active
---
`),
      source("planning/active/STATUS.md", `---
artifact_type: rollup
id: STATUS
status: active
---
| Story | Status |
| ROLLUP-STORY | Done |
| MISSING-STORY | Active |
`),
    ]);

    expect(result.counts.parent_child_projection_conflict).toBe(1);
    expect(result.counts.planning_relationship_unresolved).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("parses epic, feature, and generic artifact rollup headers", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/ROLLUP-EPIC.md", `---
artifact_type: epic
epic_id: ROLLUP-EPIC
status: active
---
`),
      source("planning/active/ROLLUP-FEATURE.md", `---
artifact_type: feature
feature_id: ROLLUP-FEATURE
epic_id: ROLLUP-EPIC
status: active
---
`),
      source("planning/active/STATUS.md", `---
artifact_type: status_index
id: STATUS
status: active
---
| Epic | Status |
| ROLLUP-EPIC | Done |

| Feature | Status |
| MISSING-FEATURE | Active |

| Artifact | Status |
| ROLLUP-FEATURE | Active |
`),
    ]);

    expect(result.counts.parent_child_projection_conflict).toBe(1);
    expect(result.counts.planning_relationship_unresolved).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("fails closed on unknown rollup target columns and supports a reasoned custom column", () => {
    const target = source("planning/active/CUSTOM-COLUMN-TARGET.md", `---
artifact_type: story
story_id: CUSTOM-COLUMN-TARGET
status: active
---
`);
    const unknown = auditPlanningArtifacts([
      target,
      source("planning/active/UNKNOWN-COLUMN.md", `---
artifact_type: status_index
id: UNKNOWN-COLUMN
status: active
---
| Component | Status |
| CUSTOM-COLUMN-TARGET | Active |
`),
    ]);
    const configured = auditPlanningArtifacts([
      target,
      source("planning/active/CONFIGURED-COLUMN.md", `---
artifact_type: status_index
id: CONFIGURED-COLUMN
status: active
rollup_target_column: Component
rollup_target_column_rationale: Component is this repository's canonical work-item label.
---
| Component | Status |
| CUSTOM-COLUMN-TARGET | Active |
`),
    ]);

    expect(unknown.counts.planning_relationship_conflict).toBe(1);
    expect(unknown.status).toBe("fail");
    expect(configured.findings).toEqual([]);
  });

  it("cannot hide parentage behind generic or plural state-table headers", () => {
    for (const header of ["Artifact", "Item", "Planning Artifact", "Artifacts", "Children"]) {
      const result = auditPlanningArtifacts([
        source(`planning/done/PARENT-${header.replaceAll(" ", "-")}.md`, `---
artifact_type: story
story_id: PARENT-${header.replaceAll(" ", "-")}
status: done
holdout_status: pass
---
| ${header} | Status |
| MISSING-CHILD | Done |
`),
      ]);

      expect(result.status, header).toBe("fail");
      expect(result.counts.planning_relationship_unresolved, header).toBe(1);
    }
  });

  it("fails relationship rows with blank targets or unknown states", () => {
    const blankTarget = auditPlanningArtifacts([
      source("planning/active/BLANK-TARGET-INDEX.md", `---
artifact_type: status_index
id: BLANK-TARGET-INDEX
status: active
---
| Story | Status |
|       | Done |
`),
    ]);
    expect(blankTarget.counts.planning_relationship_unresolved).toBe(1);

    for (const state of ["MAYBE", "—", "TBD", "N/A", "Not Yet", ""]) {
      const result = auditPlanningArtifacts([
        source("planning/active/ROW-STATE-TARGET.md", `---
artifact_type: story
story_id: ROW-STATE-TARGET
status: active
---
`),
        source("planning/active/ROW-STATE-INDEX.md", `---
artifact_type: status_index
id: ROW-STATE-INDEX
status: active
---
| Story | Status |
| ROW-STATE-TARGET | ${state} |
`),
      ]);

      expect(result.counts.planning_relationship_conflict, JSON.stringify(state)).toBe(1);
      expect(result.status, JSON.stringify(state)).toBe("fail");
    }
  });

  it("uses Status as the default authoritative lifecycle column and fails only genuine state ambiguity", () => {
    const statusAndPhase = auditPlanningArtifacts([
      source("planning/active/DUPLICATE-STATE-TARGET.md", `---
artifact_type: story
story_id: DUPLICATE-STATE-TARGET
status: active
---
`),
      source("planning/active/DUPLICATE-STATE-INDEX.md", `---
artifact_type: status_index
id: DUPLICATE-STATE-INDEX
status: active
---
| Story | Status | State |
| DUPLICATE-STATE-TARGET | Active | Done |
`),
    ]);
    const ambiguous = auditPlanningArtifacts([
      source("planning/active/AMBIGUOUS-STATE-TARGET.md", `---
artifact_type: story
story_id: AMBIGUOUS-STATE-TARGET
status: active
---
`),
      source("planning/active/AMBIGUOUS-STATE-INDEX.md", `---
artifact_type: status_index
id: AMBIGUOUS-STATE-INDEX
status: active
---
| Story | State | Phase |
| AMBIGUOUS-STATE-TARGET | Active | Done |
`),
    ]);
    const declared = auditPlanningArtifacts([
      source("planning/active/DECLARED-STATE-TARGET.md", `---
artifact_type: story
story_id: DECLARED-STATE-TARGET
status: active
---
`),
      source("planning/active/DECLARED-STATE-INDEX.md", `---
artifact_type: status_index
id: DECLARED-STATE-INDEX
status: active
primary_state_column: State
---
| Story | State | Phase |
| DECLARED-STATE-TARGET | Active | Done |
`),
    ]);
    const duplicateTarget = auditPlanningArtifacts([
      source("planning/active/DUPLICATE-TARGET.md", `---
artifact_type: story
story_id: DUPLICATE-TARGET
status: active
---
`),
      source("planning/active/DUPLICATE-TARGET-INDEX.md", `---
artifact_type: status_index
id: DUPLICATE-TARGET-INDEX
status: active
---
| Story | Artifact | Status |
| DUPLICATE-TARGET | MISSING | Active |
`),
    ]);

    expect(statusAndPhase.findings).toEqual([]);
    expect(ambiguous.counts.planning_relationship_conflict).toBe(1);
    expect(declared.findings).toEqual([]);
    expect(duplicateTarget.counts.planning_relationship_conflict).toBe(1);
  });

  it("supports a reasoned rollup-role override for repository-specific index types", () => {
    const valid = auditPlanningArtifacts([
      source("planning/active/CUSTOM-ROLLUP-TARGET.md", `---
artifact_type: story
story_id: CUSTOM-ROLLUP-TARGET
status: active
---
`),
      source("planning/active/CUSTOM-DASHBOARD.md", `---
artifact_type: dashboard
id: CUSTOM-DASHBOARD
status: active
relationship_role: rollup_projection
relationship_role_rationale: This repository uses dashboards as generated planning indexes.
---
| Story | Status |
| CUSTOM-ROLLUP-TARGET | Active |
`),
    ]);
    const unexplained = auditPlanningArtifacts([
      source("planning/active/CUSTOM-DASHBOARD.md", `---
artifact_type: dashboard
id: CUSTOM-DASHBOARD
status: active
relationship_role: rollup_projection
---
| Story | Status |
| MISSING-TARGET | Active |
`),
    ]);

    expect(valid.findings).toEqual([]);
    expect(unexplained.counts.planning_relationship_conflict).toBe(1);
    expect(unexplained.status).toBe("fail");
  });

  it("does not let an explained role override defang a canonical hierarchy artifact", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/CANONICAL-SLICE.md", `---
artifact_type: slice
slice_id: CANONICAL-SLICE
status: done
top_level: true
relationship_role: rollup_projection
relationship_role_rationale: Treat this task table as a convenient status rollup.
---
| Task | Status |
| CANONICAL-TASK | Done |
`),
      source("planning/done/CANONICAL-TASK.md", `---
artifact_type: task
task_id: CANONICAL-TASK
status: done
top_level: true
---
`),
    ]);

    expect(result.counts.planning_relationship_conflict).toBeGreaterThanOrEqual(1);
    expect(result.status).toBe("fail");
  });

  it("rejects a child projection whose implicit identity is ambiguous", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/PARENT.md", `---
artifact_type: story
story_id: PARENT
status: done
holdout_status: pass
---
| Child | Status |
| CHILD | Done |
`),
      source("planning/done/a/CHILD.md", `---
artifact_type: task
parent_id: PARENT
status: done
---
`),
      source("planning/done/b/CHILD.md", `---
artifact_type: task
parent_id: PARENT
status: done
---
`),
    ]);

    expect(result.counts.planning_relationship_conflict).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("parses every structured relationship entry or reports its exact debt", () => {
    const malformed = auditPlanningArtifacts([
      source("planning/done/STRUCTURED-MALFORMED.md", `---
artifact_type: story
story_id: STRUCTURED-MALFORMED
status: done
holdout_status: pass
children:
  - {name: MISSING, status: done}
  - {status: done}
  - null
  - {}
  - []
---
`),
    ]);
    const empty = auditPlanningArtifacts([
      source("planning/active/STRUCTURED-EMPTY.md", `---
artifact_type: story
story_id: STRUCTURED-EMPTY
status: active
children: []
---
`),
    ]);

    expect(malformed.counts.planning_relationship_unresolved).toBe(5);
    expect(malformed.status).toBe("fail");
    expect(empty.findings).toEqual([]);
  });

  it("recognizes canonical generic and plural structured relationship keys", () => {
    for (const key of [
      "epics", "features", "artifacts", "items", "ids", "artifact_ids", "item_ids",
      "artifacts_ids", "children_ids", "epics_ids", "features_ids", "items_ids",
      "planning_artifacts_ids", "slices_ids", "stories_ids", "tasks_ids", "work_items_ids",
      "childrenIds", "storiesIds", "workItemsIds",
    ]) {
      const result = auditPlanningArtifacts([
        source(`planning/active/STRUCTURED-${key}.yaml`, `
artifact_type: status_index
id: STRUCTURED-${key}
status: active
${key}: [MISSING]
`),
      ]);

      expect(result.counts.planning_relationship_unresolved, key).toBe(1);
      expect(result.status, key).toBe("fail");
    }
  });

  it("does not ignore singular structured relationship objects", () => {
    for (const key of [
      "child", "artifact", "item", "feature", "epic", "slice", "story", "task", "work_item",
      "planning_artifact",
    ]) {
      const result = auditPlanningArtifacts([
        source(`planning/done/SINGULAR-${key}.yaml`, `
artifact_type: story
story_id: SINGULAR-${key}
status: done
holdout_status: pass
${key}: {id: MISSING, status: done}
`),
      ]);

      expect(result.status, key).toBe("fail");
      expect(
        result.counts.planning_relationship_unresolved + result.counts.orphan_parent_reference,
        key,
      ).toBe(1);
    }
  });

  it("treats singular canonical ancestor objects as incoming parent references", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/ANCESTOR-EPIC.md", `---
artifact_type: epic
epic_id: ANCESTOR-EPIC
status: done
---
`),
      source("planning/active/CHILD-FEATURE.md", `---
artifact_type: feature
feature_id: CHILD-FEATURE
epic: {id: ANCESTOR-EPIC, status: done}
status: active
---
`),
    ]);

    const finding = result.findings.find((item) => item.code === "parent_child_projection_conflict");
    expect(finding?.subject).toBe("ANCESTOR-EPIC");
    expect(finding?.related).toEqual(["planning/active/CHILD-FEATURE.md"]);
  });

  it("recognizes singular and plural generic parent reference aliases", () => {
    for (const key of ["parent", "parent_ids", "parents", "parents_ids", "parentsIds"]) {
      const result = auditPlanningArtifacts([
        source("planning/active/PARENT-ALIAS.md", `---
artifact_type: epic
epic_id: PARENT-ALIAS
status: active
---
`),
        source(`planning/active/CHILD-${key}.yaml`, `
artifact_type: task
task_id: CHILD-${key}
status: active
${key}: [PARENT-ALIAS]
`),
      ]);

      expect(result.findings, key).toEqual([]);
    }
  });

  it("reconciles lifecycle projections carried by parent reference objects", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/PARENT-PROJECTION-EPIC.md", `---
artifact_type: epic
epic_id: PARENT-PROJECTION-EPIC
status: done
holdout_status: pass
---
`),
      source("planning/done/PARENT-PROJECTION-FEATURE.md", `---
artifact_type: feature
feature_id: PARENT-PROJECTION-FEATURE
epic: {id: PARENT-PROJECTION-EPIC, status: active}
status: done
---
`),
    ]);

    const finding = result.findings.find((item) => item.code === "parent_child_projection_conflict");
    expect(finding?.subject).toBe("PARENT-PROJECTION-FEATURE");
    expect(finding?.detail).toContain("parent reference projects active");
  });

  it("reconciles structured relationship state and rejects unknown projections", () => {
    const stale = auditPlanningArtifacts([
      source("planning/active/STRUCTURED-TARGET.md", `---
artifact_type: story
story_id: STRUCTURED-TARGET
status: active
---
`),
      source("planning/active/STRUCTURED-ROLLUP.md", `---
artifact_type: status_index
id: STRUCTURED-ROLLUP
status: active
stories:
  - story_id: STRUCTURED-TARGET
    status: done
---
`),
    ]);
    const unknown = auditPlanningArtifacts([
      source("planning/active/STRUCTURED-TARGET.md", `---
artifact_type: story
story_id: STRUCTURED-TARGET
status: active
---
`),
      source("planning/active/STRUCTURED-ROLLUP.md", `---
artifact_type: status_index
id: STRUCTURED-ROLLUP
status: active
stories:
  - story_id: STRUCTURED-TARGET
    status: MAYBE
---
`),
    ]);

    expect(stale.counts.parent_child_projection_conflict).toBe(1);
    expect(unknown.counts.planning_relationship_conflict).toBe(1);
  });

  it("does not let malformed raw planning signals hide behind non-artifact classification", () => {
    const results = [
      source("planning/guidance/MALFORMED-CHILD.md", `---
artifact_type: guidance
rationale: Historical reference only.
children: [{name: MISSING, status: done}]
---
`),
      source("planning/guidance/MALFORMED-STATE.md", `---
artifact_type: guidance
rationale: Historical reference only.
status: {value: done}
---
`),
      source("planning/guidance/MALFORMED-PARENT.md", `---
artifact_type: guidance
rationale: Historical reference only.
parent: {name: MISSING}
---
`),
    ].map((item) => auditPlanningArtifacts([item]));

    for (const result of results) {
      expect(result.counts.planning_input_unparsed).toBe(1);
      expect(result.status).toBe("fail");
    }

    const contextualTable = auditPlanningArtifacts([
      source("planning/guidance/CONTEXT-TABLE.md", `---
artifact_type: guidance
rationale: Historical reference only.
---
| Metric | Status |
| X | Done |
`),
    ]);
    expect(contextualTable.findings).toEqual([]);
  });

  it("allows a reasoned non-relationship checklist without weakening rollup indexes", () => {
    const checklist = auditPlanningArtifacts([
      source("planning/active/CHECKLIST-STORY.md", `---
artifact_type: story
story_id: CHECKLIST-STORY
status: active
non_relationship_table_columns: [Criterion]
non_relationship_table_rationale: Acceptance criteria are checks, not child work items.
---
| Criterion | Status |
| Response schema documented | Done |
`),
    ]);
    const unexplained = auditPlanningArtifacts([
      source("planning/active/CHECKLIST-UNEXPLAINED.md", `---
artifact_type: story
story_id: CHECKLIST-UNEXPLAINED
status: active
non_relationship_table_columns: [Criterion]
---
| Criterion | Status |
| Response schema documented | Done |
`),
    ]);
    const rollupEscape = auditPlanningArtifacts([
      source("planning/active/CHECKLIST-ROLLUP.md", `---
artifact_type: status_index
id: CHECKLIST-ROLLUP
status: active
non_relationship_table_columns: [Criterion]
non_relationship_table_rationale: Pretend the rollup is a checklist.
---
| Criterion | Status |
| MISSING | Done |
`),
      ]);
    const lifecycleEscape = auditPlanningArtifacts([
      source("planning/active/CHECKLIST-LIFECYCLE-ESCAPE.md", `---
artifact_type: story
story_id: CHECKLIST-LIFECYCLE-ESCAPE
status: active
non_relationship_table_columns: [Status]
non_relationship_table_rationale: Suppress the lifecycle column itself.
---
| Metric | Status |
| MISSING | Done |
`),
    ]);

    expect(checklist.findings).toEqual([]);
    expect(unexplained.counts.planning_relationship_conflict).toBeGreaterThanOrEqual(1);
    expect(rollupEscape.counts.planning_relationship_conflict).toBeGreaterThanOrEqual(1);
    expect(lifecycleEscape.counts.planning_relationship_conflict).toBeGreaterThanOrEqual(1);
  });

  it("rejects lifecycle columns configured as relationship targets", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/TARGET-OVERLAP.md", `---
artifact_type: status_index
id: TARGET-OVERLAP
status: active
rollup_target_column: Status
rollup_target_column_rationale: Treat the status value as a target.
---
| Story | Status |
| MISSING | Done |
`),
    ]);

    expect(result.counts.planning_relationship_conflict).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("fails malformed singular semantic aliases instead of defaulting through them", () => {
    const sources = [
      source("planning/done/MALFORMED-LIFECYCLE.json", JSON.stringify({
        artifact_type: "story", status: ["done", "active"], story_id: "MALFORMED-LIFECYCLE", top_level: true,
      })),
      source("planning/done/MALFORMED-EXTRA-LIFECYCLE.json", JSON.stringify({
        artifactType: "story", state: {}, status: "done", storyId: "MALFORMED-EXTRA-LIFECYCLE", topLevel: true,
      })),
      source("planning/active/MALFORMED-ROLE.json", JSON.stringify({
        artifact_type: "story", relationship_role: { value: "rollup_projection" }, status: "active",
        story_id: "MALFORMED-ROLE", top_level: true,
      })),
      source("planning/active/MALFORMED-ROLE-ALIAS.json", JSON.stringify({
        artifact_type: "initiative", child_relationship_role: {}, id: "MALFORMED-ROLE-ALIAS",
        relationship_role: "rollup_projection", relationship_role_rationale: "Repository-specific rollup.", status: "active",
      })),
      source("planning/active/MALFORMED-TARGET.json", JSON.stringify({
        artifact_type: "story", child_target_column: ["Component"],
        child_target_column_rationale: "Repository-specific hierarchy.", status: "active",
        story_id: "MALFORMED-TARGET", top_level: true,
      })),
      source("planning/active/MALFORMED-TARGET-ALIAS.json", JSON.stringify({
        artifact_type: "status_index", id: "MALFORMED-TARGET-ALIAS",
        relationship_target_column: "Child", rollup_target_column: {},
        rollup_target_column_rationale: "Repository-specific rollup.", status: "active",
      })),
      source("planning/active/MALFORMED-TOP-LEVEL.json", JSON.stringify({
        artifact_type: "story", status: "active", story_id: "MALFORMED-TOP-LEVEL", top_level: null,
      })),
    ];

    for (const item of sources) {
      const result = auditPlanningArtifacts([item]);
      expect(result.counts.planning_relationship_conflict, item.path).toBeGreaterThanOrEqual(1);
      expect(result.status, item.path).toBe("fail");
    }
  });

  it("rejects duplicate graph identities even when both IDs were inferred", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/tasks/a/DUP.md", `---
status: active
top_level: true
---
`),
      source("planning/active/tasks/b/DUP.md", `---
status: active
top_level: true
---
`),
    ]);

    expect(result.counts.duplicate_artifact_id).toBe(2);
    expect(result.status).toBe("fail");
  });

  it("reconciles current-state aliases in tables, structured children, and parent references", () => {
    const table = auditPlanningArtifacts([
      source("planning/done/CURRENT-TABLE-CHILD.md", `---
artifact_type: task
task_id: CURRENT-TABLE-CHILD
status: done
top_level: true
---
`),
      source("planning/active/CURRENT-TABLE-INDEX.md", `---
artifact_type: status_index
id: CURRENT-TABLE-INDEX
status: active
---
| Task | Current Status |
| CURRENT-TABLE-CHILD | Active |
`),
    ]);
    const structured = auditPlanningArtifacts([
      source("planning/done/CURRENT-STRUCTURED-CHILD.md", `---
artifact_type: story
story_id: CURRENT-STRUCTURED-CHILD
status: done
top_level: true
---
`),
      source("planning/active/CURRENT-STRUCTURED-INDEX.json", JSON.stringify({
        artifactType: "status_index", id: "CURRENT-STRUCTURED-INDEX", status: "active",
        stories: [{ currentStatus: "active", storyId: "CURRENT-STRUCTURED-CHILD" }],
      })),
    ]);
    const parent = auditPlanningArtifacts([
      source("planning/done/CURRENT-PARENT.md", `---
artifact_type: story
story_id: CURRENT-PARENT
status: done
---
`),
      source("planning/active/CURRENT-PARENT-CHILD.json", JSON.stringify({
        artifactType: "task", parent: { currentStatus: "active", id: "CURRENT-PARENT" },
        status: "active", taskId: "CURRENT-PARENT-CHILD",
      })),
    ]);

    for (const result of [table, structured, parent]) {
      expect(result.counts.parent_child_projection_conflict).toBeGreaterThanOrEqual(1);
      expect(result.status).toBe("fail");
    }
  });

  it("rejects duplicate JSON declaration keys before last-key-wins parsing", () => {
    const records = [
      '{"artifact_type":"story","story_id":"DUP-STATUS","status":"active","status":"done","top_level":true}',
      '{"artifact_type":"story","story_id":"DUP-ID-A","story_id":"DUP-ID-B","status":"active","top_level":true}',
      '{"artifact_type":"initiative","id":"DUP-ROLE","relationship_role":"child_parentage","relationship_role":"rollup_projection","relationship_role_rationale":"Custom.","status":"active"}',
    ];

    for (const [index, content] of records.entries()) {
      const result = auditPlanningArtifacts([
        source(`planning/active/DUPLICATE-JSON-${index}.json`, content),
      ]);
      expect(result.counts.planning_input_unparsed).toBe(1);
      expect(result.status).toBe("fail");
    }
  });

  it("rejects compound lifecycle prose that mixes or obscures canonical state", () => {
    for (const [index, status] of ["done pending", "completed draft", "done (pending acceptance)"].entries()) {
      const result = auditPlanningArtifacts([
        source(`planning/done/COMPOUND-${index}.json`, JSON.stringify({
          artifact_type: "story", status, story_id: `COMPOUND-${index}`, top_level: true,
        })),
      ]);
      expect(result.counts.planning_relationship_conflict).toBeGreaterThanOrEqual(1);
      expect(result.status).toBe("fail");
    }
  });

  it("discovers untyped acceptance records from acceptance IDs or parent-plus-outcome metadata", () => {
    const base = [
      source("planning/done/ACCEPTANCE-DISCOVERY-PARENT.md", `---
artifact_type: story
story_id: ACCEPTANCE-DISCOVERY-PARENT
status: done
holdout_status: pass
---
| Task | Status |
| ACCEPTANCE-DISCOVERY-CHILD | Done |
`),
      source("planning/done/ACCEPTANCE-DISCOVERY-CHILD.md", `---
artifact_type: task
task_id: ACCEPTANCE-DISCOVERY-CHILD
parent_id: ACCEPTANCE-DISCOVERY-PARENT
status: done
---
`),
    ];
    const byReviewId = auditPlanningArtifacts([
      ...base,
      source("planning/active/UNLABELED-A.md", `---
review_id: UNLABELED-REVIEW-A
parent_id: ACCEPTANCE-DISCOVERY-PARENT
status: active
verdict: not_run
---
`),
    ]);
    const byRelationship = auditPlanningArtifacts([
      ...base,
      source("planning/active/P-review.md", `---
id: UNLABELED-REVIEW-B
review_of: ACCEPTANCE-DISCOVERY-PARENT
status: active
verdict: not_run
---
`),
    ]);

    for (const result of [byReviewId, byRelationship]) {
      expect(result.counts.acceptance_cascade_unexecuted).toBeGreaterThanOrEqual(1);
      expect(result.status).toBe("fail");
    }
  });

  it("rejects malformed embedded acceptance aliases even beside a valid projection", () => {
    const topLevel = auditPlanningArtifacts([
      source("planning/done/MALFORMED-EMBEDDED-TOP.json", JSON.stringify({
        artifact_type: "story", holdout_outcome: [], holdout_status: "pass",
        status: "done", story_id: "MALFORMED-EMBEDDED-TOP", top_level: true,
      })),
    ]);
    const nested = auditPlanningArtifacts([
      source("planning/done/MALFORMED-EMBEDDED-NESTED.json", JSON.stringify({
        artifact_type: "story", holdout: { outcome: [], status: "pass" },
        status: "done", story_id: "MALFORMED-EMBEDDED-NESTED", top_level: true,
      })),
    ]);

    for (const result of [topLevel, nested]) {
      expect(result.counts.planning_relationship_conflict).toBeGreaterThanOrEqual(1);
      expect(result.status).toBe("fail");
    }
  });

  it("reconciles every acceptance-specific current-state alias", () => {
    for (const field of [
      "holdout_current_status", "holdout_current_state", "holdout_phase", "holdout_lifecycle",
    ]) {
      const result = auditPlanningArtifacts([
        source("planning/done/ACCEPTANCE-STATE-PARENT.json", JSON.stringify({
          artifact_type: "story", holdout_status: "pass", [field]: "not_run",
          status: "done", story_id: "ACCEPTANCE-STATE-PARENT", top_level: true,
        })),
      ]);

      expect(result.counts.acceptance_gate_identity_conflict, field).toBe(1);
      expect(result.status, field).toBe("fail");
    }
  });

  it("rejects every empty acceptance scope and observes scalar-list shorthand", () => {
    const scopes: unknown[] = [[], {}, [{}], [[]], ["not_run"]];
    for (const [index, holdout] of scopes.entries()) {
      const result = auditPlanningArtifacts([
        source(`planning/done/ACCEPTANCE-SCOPE-${index}.json`, JSON.stringify({
          artifact_type: "story", holdout, holdout_status: "pass", status: "done",
          story_id: `ACCEPTANCE-SCOPE-${index}`, top_level: true,
        })),
      ]);

      expect(result.status, String(index)).toBe("fail");
      expect(result.findings.length, String(index)).toBeGreaterThanOrEqual(1);
    }
  });

  it("reconciles every nested acceptance outcome alias on typed acceptance artifacts", () => {
    const kinds = ["acceptance", "holdout", "qa", "review"];
    const fields = [
      "outcome", "result", "verdict", "status", "state", "phase", "lifecycle",
      "current_status", "current_state", "current_phase", "current_lifecycle",
    ];
    for (const kind of kinds) {
      for (const field of fields) {
        const parent = `NESTED-${kind}-${field}-P`.toUpperCase();
        const child = `NESTED-${kind}-${field}-C`.toUpperCase();
        const result = auditPlanningArtifacts([
          ...completedParentSources(parent, child),
          source(`planning/active/${parent}-REVIEW.json`, JSON.stringify({
            artifact_type: "review", parent_id: parent, review_id: `${parent}-REVIEW`,
            status: "active", verdict: "pass", [kind]: { [field]: "not_run" },
          })),
        ]);

        expect(result.status, `${kind}.${field}`).toBe("fail");
        expect(
          result.counts.acceptance_gate_identity_conflict + result.counts.acceptance_cascade_unexecuted,
          `${kind}.${field}`,
        ).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("discovers the complete acceptance vocabulary across every strong parent relation", () => {
    const relations = ["review_of", "reviewed_id", "subject_id", "target_id"];
    const kinds = ["acceptance", "holdout", "qa", "review"];
    const fields = [
      "outcome", "result", "verdict", "status", "state", "phase", "lifecycle",
      "current_status", "current_state", "current_phase", "current_lifecycle",
    ];
    const parent = "DISCOVERY-MATRIX-P";
    const child = "DISCOVERY-MATRIX-C";
    for (const relation of relations) {
      for (const kind of kinds) {
        for (const field of fields) {
          const result = auditPlanningArtifacts([
            ...completedParentSources(parent, child),
            source("planning/R.yaml", `
id: R-${relation}-${kind}-${field}
status: active
${relation}: ${parent}
${kind}_${field}: not_run
`),
          ]);

          expect(result.status, `${relation}.${kind}.${field}`).toBe("fail");
        }
      }
    }
    for (const field of ["outcome", "result", "verdict"]) {
      const result = auditPlanningArtifacts([
        ...completedParentSources(parent, child),
        source("planning/R-STORY.yaml", `
id: R-STORY-${field}
story_id: ${parent}
status: active
${field}: not_run
`),
      ]);
      expect(result.status, `story_id.${field}`).toBe("fail");
    }
  }, 10_000);

  it("discovers nested acceptance declarations across generic and hierarchy relations", () => {
    const parent = "NESTED-DISCOVERY-P";
    const child = "NESTED-DISCOVERY-C";
    const records = [
      { acceptance: { status: "not_run" }, id: "R1", status: "active", subject_id: parent },
      { id: "R2", qa: { current_status: "not_run" }, status: "active", target_id: parent },
      { holdout: { result: "not_run" }, id: "R3", status: "active", story_id: parent },
      { feature_id: parent, id: "R4", review: { verdict: "not_run" }, status: "active" },
      { id: "R5", metadata: { review_status: "not_run" }, status: "active", subject_id: parent },
      { acceptance: [{ status: "not_run" }], id: "R6", status: "active", target_id: parent },
    ];
    for (const [index, record] of records.entries()) {
      const result = auditPlanningArtifacts([
        ...completedParentSources(parent, child),
        source(`planning/NESTED-DISCOVERY-${index}.json`, JSON.stringify(record)),
      ]);

      expect(result.status, String(index)).toBe("fail");
      expect(
        result.counts.acceptance_cascade_unexecuted + result.counts.acceptance_gate_identity_conflict,
        String(index),
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("accepts feature as a canonical acceptance-parent alias", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/FEATURE-ACCEPTANCE.md", `---
artifact_type: feature
feature_id: FEATURE-ACCEPTANCE
status: done
holdout_status: pass
---
| Task | Status |
| FEATURE-ACCEPTANCE-TASK | Done |
`),
      source("planning/done/FEATURE-ACCEPTANCE-TASK.md", `---
artifact_type: task
task_id: FEATURE-ACCEPTANCE-TASK
feature_id: FEATURE-ACCEPTANCE
status: done
---
`),
      source("planning/done/FEATURE-ACCEPTANCE-REVIEW.md", `---
artifact_type: review
review_id: FEATURE-ACCEPTANCE-REVIEW
feature_id: FEATURE-ACCEPTANCE
status: done
verdict: pass
---
`),
    ]);

    expect(result.findings).toEqual([]);
  });

  it("binds not-applicable rationales to the exact acceptance scope", () => {
    const unrelated = auditPlanningArtifacts([
      source("planning/done/SCOPED-RATIONALE-P.md", `---
artifact_type: story
story_id: SCOPED-RATIONALE-P
status: done
holdout:
  first: {status: not_applicable}
  second: {rationale: Unrelated sibling rationale.}
---
| Task | Status |
| SCOPED-RATIONALE-C | Done |
`),
      source("planning/done/SCOPED-RATIONALE-C.md", `---
artifact_type: task
task_id: SCOPED-RATIONALE-C
parent_id: SCOPED-RATIONALE-P
status: done
---
`),
    ]);
    const sameScope = auditPlanningArtifacts([
      source("planning/done/SCOPED-RATIONALE-OK.md", `---
artifact_type: story
story_id: SCOPED-RATIONALE-OK
status: done
holdout:
  first:
    status: not_applicable
    rationale: This scope has no independent holdout.
---
| Task | Status |
| SCOPED-RATIONALE-OK-C | Done |
`),
      source("planning/done/SCOPED-RATIONALE-OK-C.md", `---
artifact_type: task
task_id: SCOPED-RATIONALE-OK-C
parent_id: SCOPED-RATIONALE-OK
status: done
---
`),
    ]);

    expect(unrelated.counts.acceptance_gate_unknown).toBe(1);
    expect(sameScope.findings).toEqual([]);
  });

  it("validates every structured relationship identity alias", () => {
    const childAlias = auditPlanningArtifacts([
      source("planning/done/STRUCTURED-ID-TARGET.md", `---
artifact_type: task
task_id: STRUCTURED-ID-TARGET
status: done
top_level: true
---
`),
      source("planning/active/STRUCTURED-ID-INDEX.json", JSON.stringify({
        artifact_type: "status_index", id: "STRUCTURED-ID-INDEX", status: "active",
        tasks: [{ id: "STRUCTURED-ID-TARGET", status: "done", task_id: [] }],
      })),
    ]);
    const parentConflict = auditPlanningArtifacts([
      source("planning/active/PARENT-IDENTITY-A.md", `---
artifact_type: story
story_id: PARENT-IDENTITY-A
status: active
---
`),
      source("planning/active/PARENT-IDENTITY-B.md", `---
artifact_type: story
story_id: PARENT-IDENTITY-B
status: active
---
`),
      source("planning/active/PARENT-IDENTITY-CHILD.json", JSON.stringify({
        artifactType: "task", parent: { id: "PARENT-IDENTITY-A", parentId: "PARENT-IDENTITY-B" },
        status: "active", taskId: "PARENT-IDENTITY-CHILD",
      })),
    ]);

    for (const result of [childAlias, parentConflict]) {
      expect(result.counts.planning_relationship_conflict).toBeGreaterThanOrEqual(1);
      expect(result.status).toBe("fail");
    }
  });

  it("never ignores parent semantics nested inside relationship entries", () => {
    const childEntries = [
      { parent_id: "OTHER-PARENT", status: "done", task_id: "NESTED-PARENT-CHILD" },
      { parent_id: [], status: "done", task_id: "NESTED-PARENT-CHILD" },
      { status: "done", task_id: "NESTED-PARENT-CHILD", top_level: true },
      { artifact_type: [], status: "done", task_id: "NESTED-PARENT-CHILD", top_level: [] },
    ];
    for (const [index, childEntry] of childEntries.entries()) {
      const result = auditPlanningArtifacts([
        source("planning/done/NESTED-PARENT-CHILD.md", `---
artifact_type: task
task_id: NESTED-PARENT-CHILD
status: done
top_level: true
---
`),
        source(`planning/active/NESTED-PARENT-${index}.json`, JSON.stringify({
          artifact_type: "story", children: [childEntry], status: "active",
          story_id: `NESTED-PARENT-${index}`, top_level: true,
        })),
      ]);
      expect(result.counts.planning_relationship_conflict, String(index)).toBeGreaterThanOrEqual(1);
      expect(result.status, String(index)).toBe("fail");
    }
    const parentObject = auditPlanningArtifacts([
      source("planning/active/NESTED-PARENT-OBJECT-P.md", `---
artifact_type: story
story_id: NESTED-PARENT-OBJECT-P
status: active
---
`),
      source("planning/active/NESTED-PARENT-OBJECT-C.json", JSON.stringify({
        artifact_type: "task", parent: { id: "NESTED-PARENT-OBJECT-P", parent_ids: [] },
        status: "active", task_id: "NESTED-PARENT-OBJECT-C",
      })),
    ]);
    expect(parentObject.counts.planning_relationship_conflict).toBeGreaterThanOrEqual(1);
  });

  it("fails closed on unsupported state-like aliases at every graph scope", () => {
    for (const [index, key] of ["work_state", "execution_phase", "release_status", "delivery_stage"].entries()) {
      const artifact = auditPlanningArtifacts([
        source(`planning/done/STATE-ALIAS-${index}.json`, JSON.stringify({
          artifact_type: "story", [key]: "active", holdout_status: "pass", status: "done",
          story_id: `STATE-ALIAS-${index}`, top_level: true,
        })),
      ]);
      const structured = auditPlanningArtifacts([
        source(`planning/done/STATE-ALIAS-TARGET-${index}.md`, `---
artifact_type: task
task_id: STATE-ALIAS-TARGET-${index}
status: done
top_level: true
---
`),
        source(`planning/active/STATE-ALIAS-INDEX-${index}.json`, JSON.stringify({
          artifact_type: "status_index", id: `STATE-ALIAS-INDEX-${index}`, status: "active",
          tasks: [{ [key]: "active", status: "done", task_id: `STATE-ALIAS-TARGET-${index}` }],
        })),
      ]);

      for (const result of [artifact, structured]) {
        expect(result.counts.planning_relationship_conflict, key).toBeGreaterThanOrEqual(1);
        expect(result.status, key).toBe("fail");
      }
    }
  });

  it("never scans structured records, fenced examples, or HTML comments as current prose state", () => {
    const structured = auditPlanningArtifacts([
      source("planning/done/NO-PROSE-TARGET.yaml", `
artifact_type: story
story_id: NO-PROSE-TARGET
status: done
top_level: true
holdout_status: pass
`),
      source("planning/active/NO-PROSE-INDEX.yaml", `
artifact_type: status_index
id: NO-PROSE-INDEX
status: active
stories:
  - story_id: NO-PROSE-TARGET
    status: done
metadata:
  status: archived
`),
    ]);
    const markdown = auditPlanningArtifacts([
      source("planning/done/NO-PROSE-MARKDOWN.md", `---
artifact_type: story
story_id: NO-PROSE-MARKDOWN
status: done
top_level: true
holdout_status: pass
---
\`\`\`yaml
status: active
\`\`\`
<!-- Status: Active -->
`),
    ]);

    expect(structured.findings).toEqual([]);
    expect(markdown.findings).toEqual([]);
  });

  it("reconciles blockquote and heading status labels in current Markdown prose", () => {
    for (const [index, line] of [
      "> Status: Active",
      "> **Current Status:** Active",
      "## Status: Active",
      "### **Status:** Active",
    ].entries()) {
      const result = auditPlanningArtifacts([
        source(`planning/done/VISIBLE-STATUS-${index}.md`, `---
artifact_type: story
story_id: VISIBLE-STATUS-${index}
status: done
top_level: true
holdout_status: pass
---
${line}
`),
      ]);

      expect(result.counts.body_projection_conflict, line).toBe(1);
      expect(result.status, line).toBe("fail");
    }
  });

  it("rejects top-level artifacts that also participate as children", () => {
    const explicit = auditPlanningArtifacts([
      source("planning/active/TOP-PARENT.md", `---
artifact_type: story
story_id: TOP-PARENT
status: active
---
`),
      source("planning/active/TOP-CHILD.md", `---
artifact_type: task
task_id: TOP-CHILD
parent_id: TOP-PARENT
status: active
top_level: true
---
`),
    ]);
    const projected = auditPlanningArtifacts([
      source("planning/active/TOP-PROJECTOR.md", `---
artifact_type: story
story_id: TOP-PROJECTOR
status: active
---
| Task | Status |
| TOP-PROJECTED-CHILD | Active |
`),
      source("planning/active/TOP-PROJECTED-CHILD.md", `---
artifact_type: task
task_id: TOP-PROJECTED-CHILD
status: active
top_level: true
---
`),
    ]);

    for (const result of [explicit, projected]) {
      expect(result.counts.planning_relationship_conflict).toBeGreaterThanOrEqual(1);
      expect(result.status).toBe("fail");
    }
  });

  it("reconciles implementation-status table headers as lifecycle projections", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/STATE-LIKE-TARGET.md", `---
artifact_type: story
story_id: STATE-LIKE-TARGET
status: done
top_level: true
holdout_status: pass
---
`),
      source("planning/active/STATE-LIKE-INDEX.md", `---
artifact_type: status_index
id: STATE-LIKE-INDEX
status: active
---
| Story | Implementation Status |
| STATE-LIKE-TARGET | Active |
`),
    ]);

    expect(result.counts.parent_child_projection_conflict).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("rejects a done parent with any unfinished direct child", () => {
    const result = auditPlanningArtifacts([
      source("planning/done/GRANDPARENT.md", `---
artifact_type: story
story_id: GRANDPARENT
status: done
holdout_status: pass
---
| Story | Status |
| PARENT-INCOMPLETE | Done |
`),
      source("planning/done/PARENT-INCOMPLETE.md", `---
artifact_type: story
story_id: PARENT-INCOMPLETE
parent_id: GRANDPARENT
status: done
holdout_status: pass
---
| Task | Status |
| CHILD-ACTIVE | Active |
`),
      source("planning/active/CHILD-ACTIVE.md", `---
artifact_type: task
task_id: CHILD-ACTIVE
parent_id: PARENT-INCOMPLETE
status: active
---
`),
    ]);

    expect(result.counts.parent_child_projection_conflict).toBe(1);
    expect(result.status).toBe("fail");
  });

  it("cannot hide recursive canonical acceptance or work declarations", () => {
    for (const metadata of [
      { review_id: "NESTED-REVIEW", verdict: "not_run" },
      { artifact_type: "review", verdict: "not_run" },
    ]) {
      const parent = "NESTED-CANONICAL-P";
      const child = "NESTED-CANONICAL-C";
      const result = auditPlanningArtifacts([
        ...completedParentSources(parent, child),
        source("planning/active/NESTED-REVIEW.json", JSON.stringify({
          id: "NESTED-REVIEW", metadata, status: "active", subject_id: parent,
        })),
      ]);
      expect(result.status, JSON.stringify(metadata)).toBe("fail");
      expect(
        result.counts.acceptance_cascade_unexecuted + result.counts.acceptance_gate_unknown,
        JSON.stringify(metadata),
      ).toBeGreaterThanOrEqual(1);
    }

    const guidance = auditPlanningArtifacts([
      source("planning/GUIDANCE.json", JSON.stringify({
        artifact_type: "guidance",
        classification_rationale: "Reference prose only.",
        metadata: { parent_id: "HIDDEN-PARENT", status: "done", task_id: "HIDDEN-TASK" },
      })),
    ]);
    expect(guidance.counts.planning_input_unparsed).toBeGreaterThanOrEqual(1);
    expect(guidance.status).toBe("fail");

    const lifecycleOnlyGuidance = auditPlanningArtifacts([
      source("planning/GUIDANCE-LIFECYCLE.json", JSON.stringify({
        artifact_type: "guidance",
        classification_rationale: "Reference prose only.",
        metadata: { status: "done" },
      })),
    ]);
    expect(lifecycleOnlyGuidance.counts.planning_input_unparsed).toBeGreaterThanOrEqual(1);
    expect(lifecycleOnlyGuidance.status).toBe("fail");
  });

  it("requires every recognized acceptance scope to resolve to a canonical outcome", () => {
    const invalidScopes: unknown[] = [
      { note: "execution is not recorded" },
      { review_id: "MISSING" },
      { review: { review_id: "MISSING" } },
      [{ note: "a" }, { detail: "b" }],
      { review: { execution_result: "not_run" } },
      { review: { status: "pass", status_current: "not_run" } },
    ];
    for (const [index, acceptanceScope] of invalidScopes.entries()) {
      const result = auditPlanningArtifacts([
        source(`planning/done/STRICT-SCOPE-${index}.json`, JSON.stringify({
          acceptance: acceptanceScope,
          artifact_type: "story",
          holdout_status: "pass",
          status: "done",
          story_id: `STRICT-SCOPE-${index}`,
          top_level: true,
        })),
      ]);
      expect(
        result.counts.planning_relationship_unresolved + result.counts.planning_relationship_conflict,
        String(index),
      ).toBeGreaterThanOrEqual(1);
      expect(result.status, String(index)).toBe("fail");
    }
  });

  it("reconciles visible Markdown acceptance labels and pending prose", () => {
    const lines = [
      "Review: NOT_RUN",
      "QA Result: NOT_RUN",
      "Acceptance status: NOT_RUN",
      "Holdout verdict: NOT_RUN",
      "> Review: NOT_RUN",
      "## QA Result: NOT_RUN",
      "PENDING review",
      "Review status: Pending",
    ];
    for (const [index, line] of lines.entries()) {
      const parent = `BODY-GATE-${index}-P`;
      const child = `BODY-GATE-${index}-C`;
      const fixtures = completedParentSources(parent, child);
      const parentSource = fixtures[0]!;
      const result = auditPlanningArtifacts([
        { ...parentSource, content: `${parentSource.content}\n${line}\n` },
        fixtures[1]!,
      ]);
      expect(result.status, line).toBe("fail");
      expect(result.counts.acceptance_cascade_unexecuted, line).toBeGreaterThanOrEqual(1);
    }
  });

  it("classifies unchecked acceptance checklists as unfinished markers rather than invented gates", () => {
    for (const line of ["- [ ] Review executed", "- [ ] QA complete"]) {
      const fixtures = completedParentSources("BODY-MARKER-P", "BODY-MARKER-C");
      const parentSource = fixtures[0]!;
      const result = auditPlanningArtifacts([
        { ...parentSource, content: `${parentSource.content}\n${line}\n` },
        fixtures[1]!,
      ]);
      expect(result.counts.unfinished_completion_marker, line).toBe(1);
      expect(result.counts.acceptance_cascade_unexecuted, line).toBe(0);
    }
  });

  it("fails closed on unsupported, binary, and symlinked entries in a discovered planning root", () => {
    const repository = mkdtempSync(join(tmpdir(), "mister-clean-planning-corpus-"));
    try {
      mkdirSync(join(repository, "planning"));
      writeFileSync(join(repository, "planning", "CURRENT.org"), "* Current\n");
      writeFileSync(join(repository, "planning", "BINARY.md"), Buffer.from([0xff, 0x00, 0x01]));
      writeFileSync(join(repository, "outside.md"), "---\nstatus: active\n---\n");
      symlinkSync("../outside.md", join(repository, "planning", "LINK.md"));

      const result = auditPlanningRepository(repository);
      expect(result.planningRootCount).toBe(1);
      expect(result.artifactCount).toBe(3);
      expect(result.counts.planning_input_unparsed).toBe(3);
      expect(result.status).toBe("fail");
    } finally {
      rmSync(repository, { force: true, recursive: true });
    }
  });

  it("audits a canonical planning file without inflating its containing directory", () => {
    const repository = mkdtempSync(join(tmpdir(), "mister-clean-roadmap-file-"));
    try {
      mkdirSync(join(repository, "docs"));
      writeFileSync(join(repository, "docs", "ROADMAP.md"), "# Roadmap\n\nProduction is not complete until acceptance runs.\n");
      writeFileSync(join(repository, "docs", "architecture.md"), "# Architecture\n");

      const result = auditPlanningRepository(repository);
      expect(result.planningRootCount).toBe(1);
      expect(result.artifactCount).toBe(1);
      expect(result.counts.planning_input_unparsed).toBe(1);
      expect(result.status).toBe("fail");
    } finally {
      rmSync(repository, { force: true, recursive: true });
    }
  });

  it("ignores only an exact zero-byte .gitkeep in a planning root", () => {
    const repository = mkdtempSync(join(tmpdir(), "mister-clean-gitkeep-"));
    try {
      mkdirSync(join(repository, "planning"));
      writeFileSync(join(repository, "planning", ".gitkeep"), "");
      const empty = auditPlanningRepository(repository);
      expect(empty.artifactCount).toBe(0);
      expect(empty.findings).toEqual([]);

      writeFileSync(join(repository, "planning", ".gitkeep"), "not empty\n");
      const nonempty = auditPlanningRepository(repository);
      expect(nonempty.counts.planning_input_unparsed).toBe(1);
    } finally {
      rmSync(repository, { force: true, recursive: true });
    }
  });

  it("treats root underscore YAML policy and typed dispatch packet internals as context, not work items", () => {
    const policy = auditPlanningArtifacts([
      source("project/planning/_DISPATCH-POLICY.yaml", `repo_class: governed
baseline_mode: frozen
qa_policy:
  review:
    status: required
`),
    ]);
    const packet = auditPlanningArtifacts([
      source("project/planning/dispatches/D-1/dispatch.md", `---
artifact_type: dispatch
id: D-1
status: done
---
# Dispatch D-1
`),
      source("project/planning/dispatches/D-1/manifest.yaml", `stories:
  - story_id: STORY-1
    status: done
`),
      source("project/planning/dispatches/D-1/execution-dag.yaml", `nodes:
  - id: N1
    status: complete
`),
      source("project/planning/dispatches/D-1/ledger.md", "# Execution ledger\n\nStatus: historical evidence.\n"),
    ]);

    expect(policy.findings).toEqual([]);
    expect(packet.artifactCount).toBe(4);
    expect(packet.findings).toEqual([]);
  });

  it("uses a strict first-class remediation-finding state instead of lifecycle prose", () => {
    const result = auditPlanningArtifacts([
      source("project/planning/remediation/OPEN.md", `---
artifact_type: finding
id: FINDING-OPEN
status: OPEN — accepted known limitation
---
Status: This narrative sentence is not a lifecycle projection.
`),
      source("project/planning/remediation/PARTIAL.md", `---
artifact_type: finding
id: FINDING-PARTIAL
status: PARTIALLY RESOLVED — one mechanism remains OPEN
---
`),
      source("project/planning/remediation/RESOLVED.md", `---
artifact_type: finding
id: FINDING-RESOLVED
status: RESOLVED — landed abcdef1
---
`),
      source("project/planning/remediation/UNKNOWN.md", `---
artifact_type: finding
id: FINDING-UNKNOWN
status: DEFERRED
---
`),
    ]);

    expect(result.counts.remediation_finding_open).toBe(1);
    expect(result.counts.remediation_finding_partial).toBe(1);
    expect(result.counts.finding_state_unknown).toBe(1);
    expect(result.counts.body_projection_conflict).toBe(0);
  });

  it("requires graph eligibility before extracting report tables or narrative Status prose", () => {
    const narrative = auditPlanningArtifacts([
      source("project/planning/PLANNING-AUDIT.md", `---
artifact_type: audit_report
id: PLANNING-AUDIT
status: completed
---
Status: audit complete; repair phase executed.

| ID | Status |
| P-1 | D4 plane-supervisor unreached |
`),
    ]);
    const strict = auditPlanningArtifacts([
      source("project/planning/stories/STRICT.md", `---
artifact_type: story
story_id: STRICT
status: active
---
| Child | Status |
| MISSING-CHILD | Active |
`),
    ]);

    expect(narrative.findings).toEqual([]);
    expect(strict.counts.planning_relationship_unresolved).toBe(1);
  });

  it("maps exact story_review_status to review acceptance while rejecting invented aliases", () => {
    const canonical = auditPlanningArtifacts([
      source("project/planning/stories/STORY-REVIEW.md", `---
artifact_type: story
story_id: STORY-REVIEW
status: active
story_review_status: rejected
---
`),
    ]);
    const invented = auditPlanningArtifacts([
      source("project/planning/stories/STORY-CUSTOM-REVIEW.md", `---
artifact_type: story
story_id: STORY-CUSTOM-REVIEW
status: active
custom_review_status: rejected
---
`),
    ]);

    expect(canonical.counts.planning_relationship_conflict).toBe(0);
    expect(canonical.counts.acceptance_failure_unpaid).toBe(1);
    expect(invented.counts.planning_relationship_conflict).toBeGreaterThanOrEqual(1);
  });

  it("does not let procedural checklists override structured acceptance truth", () => {
    const checklist = auditPlanningArtifacts([
      source("project/planning/stories/STORY-CHECKLIST.md", `---
artifact_type: story
story_id: STORY-CHECKLIST
status: active
holdout_status: passed
---
## Definition of done
- [ ] Story holdout run by Story QA with result PASS recorded in frontmatter.
`),
      source("project/planning/holdouts/HOLDOUT-CHECKLIST.md", `---
artifact_type: holdout
holdout_id: HOLDOUT-CHECKLIST
story_id: STORY-CHECKLIST
result: pass
---
`),
    ]);
    const explicitConflict = auditPlanningArtifacts([
      source("project/planning/stories/STORY-EXPLICIT.md", `---
artifact_type: story
story_id: STORY-EXPLICIT
status: active
holdout_status: passed
---
Holdout verdict: NOT_RUN
`),
      source("project/planning/holdouts/HOLDOUT-EXPLICIT.md", `---
artifact_type: holdout
holdout_id: HOLDOUT-EXPLICIT
story_id: STORY-EXPLICIT
result: pass
---
`),
    ]);

    expect(checklist.counts.acceptance_gate_identity_conflict).toBe(0);
    expect(checklist.counts.acceptance_cascade_unexecuted).toBe(0);
    expect(explicitConflict.counts.acceptance_gate_identity_conflict).toBe(1);
  });

  it("reports stale completion checklists without inventing a new acceptance execution", () => {
    const result = auditPlanningArtifacts([
      source("project/planning/stories/STORY-FINALIZED.md", `---
artifact_type: story
story_id: STORY-FINALIZED
status: done
holdout_status: pass
story_review_status: pass
top_level: true
---
## Acceptance Criteria
- [ ] AC1 is satisfied.

## Definition of Done
- [ ] Story holdout run by Story QA with result PASS recorded in frontmatter.
`),
    ]);

    expect(result.counts.acceptance_cascade_unexecuted).toBe(0);
    expect(result.counts.acceptance_gate_identity_conflict).toBe(0);
    expect(result.counts.unfinished_completion_marker).toBe(1);
    const marker = result.findings.find((finding) => finding.code === "unfinished_completion_marker");
    expect(marker?.related).toHaveLength(2);
    expect(result.root_debts.find((debt) => debt.class === "unfinished_completion_marker")?.observation_count).toBe(1);
  });

  it("keeps typed reviews typed and accepts bounded terminal review prose", () => {
    const result = auditPlanningArtifacts([
      source("project/planning/slices/done/SLICE-REVIEWED.md", `---
artifact_type: slice
slice_id: SLICE-REVIEWED
status: done
top_level: true
---
`),
      source("project/planning/story-reviews/REVIEW-SLICE.md", `---
artifact_type: story-review
id: REVIEW-SLICE
slice: SLICE-REVIEWED
verdict: ACCEPT
acceptance:
  scope: entire candidate
  result: ACCEPT
---
`),
      source("project/planning/story-reviews/REVIEW-RECEIPT.md", `---
artifact_type: story_review
id: REVIEW-RECEIPT
reviews: Human-readable provenance only.
verdict: CONDITIONAL ACCEPT — follow-ups routed separately
---
`),
    ]);

    expect(result.counts.planning_relationship_conflict).toBe(0);
    expect(result.counts.planning_relationship_unresolved).toBe(0);
    expect(result.counts.acceptance_gate_unknown).toBe(0);
    expect(result.counts.acceptance_partial_malformed).toBe(0);
  });

  it("keeps distinct acceptance artifacts distinct and requires reviews to carry verdict truth", () => {
    const distinct = auditPlanningArtifacts([
      source("project/planning/stories/STORY-GATES.md", `---
artifact_type: story
story_id: STORY-GATES
status: active
---
`),
      source("project/planning/holdouts/H1.md", `---
artifact_type: holdout
holdout_id: H1
story_id: STORY-GATES
result: pass
---
`),
      source("project/planning/holdouts/H2.md", `---
artifact_type: holdout
holdout_id: H2
story_id: STORY-GATES
result: not_run
---
`),
    ]);
    const receipt = auditPlanningArtifacts([
      source("project/planning/story-reviews/REVIEW-RECEIPT.md", `---
artifact_type: review
review_id: REVIEW-RECEIPT
status: completed
verdict: pass
reviews: Human-readable subject plus branch and commit provenance.
---
`),
    ]);

    expect(distinct.counts.acceptance_gate_identity_conflict).toBe(0);
    expect(receipt.findings).toEqual([]);
  });

  it("retains raw observations while grouping only connected causal repair units", () => {
    const parent = (id: string, children: readonly string[]) => source(`project/planning/epics/${id}.md`, `---
artifact_type: epic
epic_id: ${id}
status: active
---
| Story | Status |
| --- | --- |
${children.map((child) => `| ${child} | Done |`).join("\n")}
`);
    const child = (id: string, parentId: string) => source(`project/planning/stories/${id}.md`, `---
artifact_type: story
story_id: ${id}
epic_id: ${parentId}
status: active
---
`);
    const firstChildren = ["STORY-A1", "STORY-A2", "STORY-A3", "STORY-A4", "STORY-A5"];
    const result = auditPlanningArtifacts([
      parent("EPIC-A", firstChildren),
      ...firstChildren.map((id) => child(id, "EPIC-A")),
      parent("EPIC-B", ["STORY-B1"]),
      child("STORY-B1", "EPIC-B"),
    ], 1, { snapshot: "a".repeat(40) });

    const projectionRaw = result.raw_findings.filter((item) => item.code === "parent_child_projection_conflict");
    const projectionRoots = result.root_debts.filter((item) => item.affected_projection_field === "lifecycle_projection");
    expect(projectionRaw).toHaveLength(6);
    expect(projectionRoots).toHaveLength(2);
    expect(projectionRoots.map((item) => item.observation_count).sort((a, b) => a - b)).toEqual([1, 5]);
    expect(projectionRoots.flatMap((item) => item.raw_finding_ids)).toHaveLength(6);
    expect(result.raw_finding_count).toBe(result.findings.length);
    expect(result.root_debt_count).toBeLessThan(result.raw_finding_count);
  });

  it("keeps unchanged debt identities stable when only the measured commit changes", () => {
    const sources = [
      source("project/planning/epics/EPIC-STABLE.md", `---
artifact_type: epic
epic_id: EPIC-STABLE
status: active
---
| Story | Status |
| --- | --- |
| STORY-STABLE | Done |
`),
      source("project/planning/stories/STORY-STABLE.md", `---
artifact_type: story
story_id: STORY-STABLE
epic_id: EPIC-STABLE
status: active
---
`),
    ];
    const first = auditPlanningArtifacts(sources, 1, { snapshot: "a".repeat(40) });
    const second = auditPlanningArtifacts(sources, 1, { snapshot: "b".repeat(40) });

    expect(second.raw_findings.map((item) => item.id)).toEqual(first.raw_findings.map((item) => item.id));
    expect(second.root_debts.map((item) => item.id)).toEqual(first.root_debts.map((item) => item.id));
    expect(second.root_debts.map((item) => item.cause_key)).toEqual(first.root_debts.map((item) => item.cause_key));
    expect(second.root_debts.map((item) => item.snapshot)).not.toEqual(first.root_debts.map((item) => item.snapshot));
  });

  it("represents PARTIAL as nonterminal debt with typed operate-time legs", () => {
    const valid = auditPlanningArtifacts([
      ...completedParentSources("PARTIAL-PARENT", "PARTIAL-CHILD"),
      source("project/planning/holdouts/PARTIAL-HOLDOUT.md", `---
artifact_type: holdout
holdout_id: PARTIAL-HOLDOUT
story_id: PARTIAL-PARENT
result: partial
operate_time_legs:
  - status: pending
    required_next_action: Run the live browser proof.
    owner: deployment operator
    evidence_required: Signed browser-run receipt.
---
`),
    ]);
    const malformed = auditPlanningArtifacts([
      source("project/planning/stories/PARTIAL-MALFORMED-PARENT.md", `---
artifact_type: story
story_id: PARTIAL-MALFORMED-PARENT
status: active
---
`),
      source("project/planning/holdouts/PARTIAL-MALFORMED.md", `---
artifact_type: holdout
holdout_id: PARTIAL-MALFORMED
story_id: PARTIAL-MALFORMED-PARENT
result: partial
---
`),
    ]);

    expect(valid.counts.acceptance_partial_unpaid).toBe(1);
    expect(valid.counts.acceptance_partial_malformed).toBe(0);
    expect(valid.counts.acceptance_failure_unpaid).toBe(0);
    expect(valid.counts.acceptance_gate_unknown).toBe(0);
    expect(malformed.counts.acceptance_partial_malformed).toBe(1);
  });

  it("detects active maintenance whose verified implementation commit already landed", () => {
    const repository = mkdtempSync(join(tmpdir(), "mister-clean-maintenance-"));
    try {
      execFileSync("git", ["init", "-q", repository]);
      execFileSync("git", ["-C", repository, "config", "user.email", "test.invalid"]);
      execFileSync("git", ["-C", repository, "config", "user.name", "Mister Clean Test"]);
      writeFileSync(join(repository, "implementation.txt"), "landed\n");
      execFileSync("git", ["-C", repository, "add", "implementation.txt"]);
      execFileSync("git", ["-C", repository, "commit", "-q", "-m", "implementation"]);
      const implementationCommit = execFileSync("git", ["-C", repository, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
      mkdirSync(join(repository, "planning", "maintenance"), { recursive: true });
      writeFileSync(join(repository, "planning", "maintenance", "MAINT-X.md"), `---
artifact_type: maintenance
id: MAINT-X
status: active
---

RESOLUTION: landed at ${implementationCommit}. Independently verified.
`);
      execFileSync("git", ["-C", repository, "add", "planning/maintenance/MAINT-X.md"]);
      execFileSync("git", ["-C", repository, "commit", "-q", "-m", "stale maintenance record"]);

      const result = auditPlanningRepository(repository);
      expect(result.counts.maintenance_lifecycle_stale).toBe(1);
    } finally {
      rmSync(repository, { force: true, recursive: true });
    }
  });

  it("never drops canonical hierarchy aliases when artifact type is absent or custom", () => {
    for (const [index, field] of ["story_id", "feature_id", "epic_id", "task_id"].entries()) {
      for (const artifactType of [undefined, "custom_record"]) {
        const result = auditPlanningArtifacts([
          source(`planning/active/UNTYPED-${index}-${artifactType ?? "absent"}.json`, JSON.stringify({
            ...(artifactType ? { artifact_type: artifactType } : {}),
            [field]: "PARENT",
            id: `UNTYPED-${index}`,
            status: "active",
          })),
        ]);
        expect(result.counts.planning_relationship_conflict, `${field}/${artifactType}`).toBeGreaterThanOrEqual(1);
        expect(result.status, `${field}/${artifactType}`).toBe("fail");
      }
    }
  });

  it("fails when a live implementation sequence is hidden outside planning discovery", () => {
    const repository = mkdtempSync(join(tmpdir(), "mister-clean-hidden-plan-"));
    try {
      mkdirSync(join(repository, "references"), { recursive: true });
      writeFileSync(join(repository, "references", "product-spec.md"), `# Product contract

Status: approved contract; implementation active

## 19. Implementation sequence

1. Build the service.
2. Verify the candidate.
`);

      const result = auditPlanningRepository(repository);
      expect(result.status).toBe("fail");
      expect(result.candidate_probe_count).toBe(1);
      expect(result.counts.planning_surface_undiscovered).toBe(1);
      expect(result.findings[0]?.path).toBe("references/product-spec.md");
    } finally {
      rmSync(repository, { force: true, recursive: true });
    }
  });

  it("accepts a live implementation sequence projected by the canonical current artifact", () => {
    const repository = mkdtempSync(join(tmpdir(), "mister-clean-projected-plan-"));
    try {
      mkdirSync(join(repository, "references"), { recursive: true });
      writeFileSync(join(repository, "references", "product-spec.md"), `# Product contract

Status: approved contract; implementation active

## Implementation sequence

1. Build the service.
2. Verify the candidate.
`);
      writeFileSync(join(repository, "CURRENT.md"), `---
artifact_type: maintenance
maint_id: CURRENT-IMPLEMENTATION
title: Current implementation
status: active
timezone: UTC
contract: references/product-spec.md
current_projection_source: machine
current_projection_command: mister-clean inspect repository-object . --json
---
`);
      execFileSync("git", ["init", "-q", "-b", "main", repository]);
      execFileSync("git", ["-C", repository, "config", "user.email", "test.invalid"]);
      execFileSync("git", ["-C", repository, "config", "user.name", "Mister Clean Test"]);
      execFileSync("git", ["-C", repository, "add", "CURRENT.md", "references/product-spec.md"]);
      execFileSync("git", ["-C", repository, "commit", "-q", "-m", "fixture"]);

      const result = auditPlanningRepository(repository);
      expect(result.status).toBe("pass");
      expect(result.planningRootCount).toBe(1);
      expect(result.artifactCount).toBe(1);
      expect(result.candidate_probe_count).toBe(1);
      expect(result.counts.planning_surface_undiscovered).toBe(0);
    } finally {
      rmSync(repository, { force: true, recursive: true });
    }
  });

  it("rejects a phantom current projection command even when it contains repository-object prose", () => {
    const repository = mkdtempSync(join(tmpdir(), "mister-clean-phantom-projection-"));
    try {
      writeFileSync(join(repository, "CURRENT.md"), `---
artifact_type: maintenance
maint_id: CURRENT-PHANTOM
title: Phantom projection
status: active
timezone: UTC
designation: current_state
current_projection_source: machine
current_projection_command: mister-clean phantom repository-object . --json
---
`);
      execFileSync("git", ["init", "-q", "-b", "main", repository]);
      execFileSync("git", ["-C", repository, "config", "user.email", "test.invalid"]);
      execFileSync("git", ["-C", repository, "config", "user.name", "Mister Clean Test"]);
      execFileSync("git", ["-C", repository, "add", "CURRENT.md"]);
      execFileSync("git", ["-C", repository, "commit", "-q", "-m", "fixture"]);

      expect(auditPlanningRepository(repository).counts.current_projection_stale).toBe(1);
    } finally {
      rmSync(repository, { force: true, recursive: true });
    }
  });

  it("enforces canonical maintenance headers and closes standing grants after durable terminal evidence", () => {
    const stale = auditPlanningArtifacts([
      source("planning/maintenance/MAINT-STALE.md", `---
artifact_type: maintenance
id: MAINT-STALE
status: active
completed_at: 2026-08-27T12:00:00Z
resolution: Accepted work is already complete.
---
`),
    ]);
    const terminal = auditPlanningArtifacts([
      source("planning/maintenance/MAINT-DONE.md", `---
artifact_type: maintenance
maint_id: MAINT-DONE
title: Terminal maintenance record
status: completed
timezone: America/Denver
completed_at: 2026-08-27T12:00:00-06:00
resolution: Accepted work is complete.
---
`),
    ]);

    expect(stale.counts.maintenance_header_noncanonical).toBeGreaterThan(0);
    expect(stale.counts.maintenance_lifecycle_stale).toBe(1);
    expect(terminal.counts.maintenance_header_noncanonical).toBe(0);
    expect(terminal.counts.maintenance_lifecycle_stale).toBe(0);
  });

  it("rejects stale ownership and active-abandoned state contradictions", () => {
    const result = auditPlanningArtifacts([
      source("planning/stories/STORY-OWNER.md", `---
artifact_type: story
story_id: STORY-OWNER
top_level: true
status: active
owner: none
ownership_status: abandoned
---
`),
    ]);

    expect(result.counts.ownership_claim_stale).toBe(2);
  });

  it("derives review projections from verdicts rather than artifact lifecycle", () => {
    const review = auditPlanningArtifacts([
      source("planning/reviews/REVIEW-LIFECYCLE.md", `---
artifact_type: review
review_id: REVIEW-LIFECYCLE
status: accepted
reviews: Retained subject provenance.
---
`),
    ]);
    const story = auditPlanningArtifacts([
      source("planning/stories/STORY-UNBOUND-REVIEW.md", `---
artifact_type: story
story_id: STORY-UNBOUND-REVIEW
top_level: true
status: completed
story_review_status: PASS
---
`),
    ]);

    expect(review.counts.review_projection_unbound).toBe(1);
    expect(story.counts.review_projection_unbound).toBe(1);
  });

  it("propagates principal-only global blockers into dependent prerequisites", () => {
    const blocked = auditPlanningArtifacts([
      source("planning/blockers/BLOCKER-GLOBAL.md", `---
artifact_type: blocker
id: BLOCKER-GLOBAL
status: active
blocker_scope: global
decision_authority: principal
dependent_ids: [STORY-DEPENDENT]
---
`),
      source("planning/stories/STORY-DEPENDENT.md", `---
artifact_type: story
story_id: STORY-DEPENDENT
top_level: true
status: planned
---
`),
    ]);
    const propagated = auditPlanningArtifacts([
      source("planning/blockers/BLOCKER-GLOBAL.md", `---
artifact_type: blocker
id: BLOCKER-GLOBAL
status: active
blocker_scope: global
decision_authority: principal
dependent_ids: [STORY-DEPENDENT]
---
`),
      source("planning/stories/STORY-DEPENDENT.md", `---
artifact_type: story
story_id: STORY-DEPENDENT
top_level: true
status: planned
prerequisite_ids: [BLOCKER-GLOBAL]
---
`),
    ]);

    expect(blocked.counts.global_blocker_not_propagated).toBe(1);
    expect(propagated.counts.global_blocker_not_propagated).toBe(0);
  });

  it("separates admission approval from product scope and terminal acceptance prose", () => {
    const ambiguous = auditPlanningArtifacts([
      source("planning/admission/ALLOWLIST-ONE.md", `---
artifact_type: admission
id: ALLOWLIST-ONE
status: accepted
---

Acceptance pending QA.
`),
    ]);
    const bounded = auditPlanningArtifacts([
      source("planning/admission/ALLOWLIST-TWO.md", `---
artifact_type: admission
id: ALLOWLIST-TWO
status: accepted
approval_scope: admission_only
---

Admission accepted. Product scope remains independently governed.
`),
    ]);

    expect(ambiguous.counts.admission_scope_ambiguous).toBe(1);
    expect(ambiguous.counts.accepted_artifact_pending_prose).toBe(1);
    expect(bounded.counts.admission_scope_ambiguous).toBe(0);
    expect(bounded.counts.accepted_artifact_pending_prose).toBe(0);
  });

  it("rejects stale designated current-state snapshots and accepts machine-derived projections", () => {
    const repository = mkdtempSync(join(tmpdir(), "mister-clean-current-binding-"));
    try {
      execFileSync("git", ["init", "-q", "-b", "main", repository]);
      execFileSync("git", ["-C", repository, "config", "user.email", "test.invalid"]);
      execFileSync("git", ["-C", repository, "config", "user.name", "Mister Clean Test"]);
      writeFileSync(join(repository, "README.md"), "fixture\n");
      execFileSync("git", ["-C", repository, "add", "README.md"]);
      execFileSync("git", ["-C", repository, "commit", "-q", "-m", "fixture"]);
      writeFileSync(join(repository, "CURRENT.md"), `---
artifact_type: maintenance
maint_id: CURRENT-BINDING
title: Current binding
status: active
timezone: UTC
designation: current_state
current_commit: ${"a".repeat(40)}
current_tree: ${"b".repeat(40)}
---
`);
      expect(auditPlanningRepository(repository).counts.current_projection_stale).toBe(1);

      writeFileSync(join(repository, "CURRENT.md"), `---
artifact_type: maintenance
maint_id: CURRENT-BINDING
title: Current binding
status: active
timezone: UTC
designation: current_state
current_projection_source: machine
current_projection_command: mister-clean inspect repository-object . --json
---
`);
      expect(auditPlanningRepository(repository).counts.current_projection_stale).toBe(0);
    } finally {
      rmSync(repository, { force: true, recursive: true });
    }
  });

  it("does not promote an inactive reference sequence into planning debt", () => {
    const repository = mkdtempSync(join(tmpdir(), "mister-clean-reference-plan-"));
    try {
      mkdirSync(join(repository, "references"), { recursive: true });
      writeFileSync(join(repository, "references", "historical-spec.md"), `# Historical contract

Status: approved reference

## Implementation sequence

1. Historical example only.
`);

      const result = auditPlanningRepository(repository);
      expect(result.status).toBe("not_applicable");
      expect(result.candidate_probe_count).toBe(0);
      expect(result.counts.planning_surface_undiscovered).toBe(0);
    } finally {
      rmSync(repository, { force: true, recursive: true });
    }
  });

  it("exempts a superseded partial acceptance record from live pending-leg shape", () => {
    const result = auditPlanningArtifacts([
      source("planning/reviews/REVIEW-DISCHARGED.md", `---
artifact_type: review
review_id: REVIEW-DISCHARGED
status: superseded
verdict: partial
---
`),
    ]);
    expect(result.counts.acceptance_partial_malformed ?? 0).toBe(0);
  });

  it("resolves a struck-through relationship row as retired", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/EPIC-WITH-TOMBSTONE.md", `---
artifact_type: epic
epic_id: EPIC-WITH-TOMBSTONE
status: active
---
| Story | Status |
|-------|--------|
| LIVE-STORY | Active |
| ~~RETIRED-STORY~~ | -- |
`),
      source("planning/active/LIVE-STORY.md", `---
artifact_type: story
story_id: LIVE-STORY
parent_id: EPIC-WITH-TOMBSTONE
status: active
---
`),
      source("planning/archive/RETIRED-STORY.md", `---
artifact_type: story
story_id: RETIRED-STORY
parent_id: EPIC-WITH-TOMBSTONE
status: archived
---
`),
    ]);
    expect(result.counts.planning_relationship_unresolved ?? 0).toBe(0);
    expect(result.counts.planning_relationship_conflict ?? 0).toBe(0);
  });

  it("normalizes archived canonical artifact types and governance validator code", () => {
    const result = auditPlanningArtifacts([
      source("planning/active/PARENT-EPIC.md", `---
artifact_type: epic
epic_id: PARENT-EPIC
status: active
---
`),
      source("planning/stories/RETIRED-VIA-TYPE.md", `---
artifact_type: archived_story
story_id: RETIRED-VIA-TYPE
parent_id: PARENT-EPIC
status: archived
---
`),
      source("planning/governance/check-something.py", "#!/usr/bin/env python3\nprint('gate')\n"),
      source("planning/governance/check-something.ts", "export const gate = 1;\n"),
    ]);
    expect(result.counts.planning_relationship_conflict ?? 0).toBe(0);
    expect(result.counts.planning_input_unparsed ?? 0).toBe(0);
  });
});
