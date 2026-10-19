export type PlanningLaneLifecycle = "active" | "archived" | "done" | "preexecution";

export const PLANNING_LANE_LIFECYCLES: ReadonlyMap<string, PlanningLaneLifecycle> = new Map([
  ["backlog", "preexecution"],
  ["todo", "preexecution"],
  ["to-do", "preexecution"],
  ["to_do", "preexecution"],
  ["ready", "preexecution"],
  ["planned", "preexecution"],
  ["active", "active"],
  ["doing", "active"],
  ["in-progress", "active"],
  ["in_progress", "active"],
  ["inprogress", "active"],
  ["failed", "active"],
  ["done", "done"],
  ["complete", "done"],
  ["completed", "done"],
  ["closed", "done"],
  ["history", "archived"],
  ["historical", "archived"],
  ["archive", "archived"],
  ["archived", "archived"],
  ["superseded", "archived"],
]);

export const PLANNING_LANE_NAMES: ReadonlySet<string> = new Set(PLANNING_LANE_LIFECYCLES.keys());

export function planningLaneLifecycle(name: string): PlanningLaneLifecycle | undefined {
  return PLANNING_LANE_LIFECYCLES.get(name.toLocaleLowerCase("und"));
}
