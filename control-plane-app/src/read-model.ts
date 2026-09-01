import { noHarmPassed } from "../../src/control-plane/domain/accounting.js";
import { DEFAULT_PLANNER_POLICY, planRemediation, type PlannerIssue, type PlannerPolicy } from "../../src/control-plane/domain/planner.js";
import { rankAgents, type AgentCandidate, type CapabilitySelection, type RankedAgentCandidate } from "../../src/control-plane/domain/ranking.js";
import { CAPABILITY_DEFINITIONS } from "../../src/control-plane/contracts/capability-taxonomy.js";
import type { DebtFlow, PlannedIssue } from "../../src/control-plane/contracts/run-issue.js";
import type { AgentTupleId, CapabilityId, CoordinationDomainKey, IssueId, Sha256 } from "../../src/control-plane/contracts/primitives.js";
import {
  parseCanonicalLiveSnapshot,
  type CanonicalControlPlaneSnapshot,
} from "../../src/control-plane/contracts/snapshot.js";

export type SnapshotStatus = "loading" | "ready" | "empty" | "error";
export type Objective = "default" | "severity" | "difficulty" | "unlock" | "risk";
export type WorkbenchSort = "plan" | "severity" | "difficulty" | "age" | "confidence" | "domain" | "owner";
export type InventorySort = "model" | "harness" | "reasoning_level" | "qualification" | "capability" | "samples" | "success" | "reliability" | "cost" | "speed" | "inference" | "headless" | "local" | "familiarity" | "availability";
export type ControlPlaneSnapshot = CanonicalControlPlaneSnapshot;
export type SnapshotSource = ControlPlaneSnapshot["source"];
export type SnapshotSubject = ControlPlaneSnapshot["current_subject"];
export type SnapshotIssue = ControlPlaneSnapshot["issues"][number];
export type SnapshotCapabilityScore = ControlPlaneSnapshot["agents"][number]["capability_scores"][number];
export type SnapshotAgent = ControlPlaneSnapshot["agents"][number];
export type SnapshotRun = ControlPlaneSnapshot["runs"][number];
export type SnapshotComplexity = ControlPlaneSnapshot["complexity"];
export type SnapshotManifest = NonNullable<ControlPlaneSnapshot["manifest"]>;
export type TerminalContractProjection = ControlPlaneSnapshot["terminal_contract"];
export type TerminalContract = NonNullable<TerminalContractProjection["contract"]>;
export type TerminalVerdict = NonNullable<TerminalContractProjection["declared_verdict"]>;
export type ExecutionIdentityDisposition = SnapshotAgent["execution_identity"]["disposition"];
export interface PlannedSnapshotIssue extends SnapshotIssue { readonly plan: PlannedIssue; }
export interface RankingResult {
  readonly ranked: readonly (RankedAgentCandidate & { readonly agent: SnapshotAgent })[];
  readonly excluded: readonly { readonly agent: SnapshotAgent; readonly reason: string }[];
}

export function parseSnapshot(value: unknown): ControlPlaneSnapshot {
  return parseCanonicalLiveSnapshot(value, { allow_demo: true });
}

export const validateSnapshot = (snapshot: ControlPlaneSnapshot): ControlPlaneSnapshot => parseSnapshot(snapshot);

const same = (left: SnapshotSubject, right: SnapshotSubject): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
export function terminalVerdict(x:ControlPlaneSnapshot):{verdict:TerminalVerdict;evidence_state:"VERIFIED"|"UNKNOWN";reasons:readonly string[]}{const p=x.terminal_contract,c=p.contract,r:string[]=[];if(p.declared_verdict!=="CLEAN")r.push("no explicit CLEAN terminal verdict");if(!p.subject||!same(p.subject,x.current_subject))r.push("terminal subject does not bind current repository object");if(!c)r.push("terminal contract is absent");if(!p.evidence.length)r.push("terminal evidence is absent");if(c)for(const[k,v]of Object.entries(c))if(!v)r.push(`terminal contract failed: ${k}`);if(x.current_flow.ending_real_issues!==0)r.push("payable issues remain");if(x.current_flow.caused_by_remediation!==0)r.push("remediation-caused debt remains");if(x.current_flow.boundary_blocked!==0)r.push("boundary-blocked debt remains");return r.length?{verdict:"NOT_CLEAN",evidence_state:p.declared_verdict===null?"UNKNOWN":"VERIFIED",reasons:r}:{verdict:"CLEAN",evidence_state:"VERIFIED",reasons:[]}}
export function dependencyClosure(issues:readonly SnapshotIssue[],selected:readonly string[]):readonly string[]{const map=new Map(issues.map(i=>[i.issue_id,i])),out=new Set(selected);const visit=(id:string):void=>{for(const p of map.get(id)?.prerequisite_issue_ids??[])if(!out.has(p)){out.add(p);visit(p)}};for(const id of[...out])visit(id);return[...out]}
export function manifestBinding(x:ControlPlaneSnapshot,selected:readonly string[]):{bound:boolean;reasons:readonly string[]}{const m=x.manifest,r:string[]=[];if(!m)r.push("manifest is absent");else{if(!same(m.subject,x.current_subject))r.push("manifest subject does not exactly match current subject");const c=dependencyClosure(x.issues,selected),s=new Set(m.selected_issue_ids);if(s.size!==c.length||c.some(id=>!s.has(id)))r.push("selected dependency closure does not match manifest selected_issue_ids")}return{bound:!r.length,reasons:r}}
export const cycleCapabilityWeight=(n:number):0|1|2|3=>((n+1)%4)as 0|1|2|3; export const currentNoHarm=(x:ControlPlaneSnapshot)=>noHarmPassed(x.current_flow);
const asIssue=(x:string)=>x as IssueId,asCap=(x:CapabilityId)=>x,asAgent=(x:string)=>x as AgentTupleId,asKey=(x:string)=>x as CoordinationDomainKey,asSha=(x:string)=>x as Sha256;
function policy(o:Objective):PlannerPolicy{return o==="severity"?{...DEFAULT_PLANNER_POLICY,difficulty_weight:0,unlock_value_weight:0,regression_risk_weight:0}:o==="difficulty"?{...DEFAULT_PLANNER_POLICY,severity_weight:0,unlock_value_weight:0,regression_risk_weight:0}:o==="unlock"?{...DEFAULT_PLANNER_POLICY,severity_weight:0,difficulty_weight:0,regression_risk_weight:0}:o==="risk"?{...DEFAULT_PLANNER_POLICY,severity_weight:0,difficulty_weight:0,unlock_value_weight:0}:DEFAULT_PLANNER_POLICY}
export function planSnapshotIssues(issues:readonly SnapshotIssue[],objective:Objective){const input:readonly PlannerIssue[]=issues.map(i=>({issue_id:asIssue(i.issue_id),prerequisite_issue_ids:i.prerequisite_issue_ids.map(asIssue),severity:i.severity,remediation_difficulty:i.remediation_difficulty,unlock_value:i.unlock_value,regression_risk:i.regression_risk,blocked_reasons:i.blocked_reasons,coordination_claims:i.coordination_claims.map(c=>({...c,key:asKey(c.key),commutativity_ref:c.commutativity_ref?{...c.commutativity_ref,sha256:asSha(c.commutativity_ref.sha256)}:null}))}));const plan=planRemediation(input,policy(objective)),by=new Map(plan.items.map(i=>[String(i.issue_id),i]));const items=issues.flatMap(i=>{const p=by.get(i.issue_id);return p?[{...i,plan:p}]:[]}).sort((left,right)=>(left.plan.order||Number.MAX_SAFE_INTEGER)-(right.plan.order||Number.MAX_SAFE_INTEGER)||left.issue_id.localeCompare(right.issue_id)) as readonly PlannedSnapshotIssue[];return{plan,items}}
export function hasBoundExecutionIdentity(agent: SnapshotAgent): boolean { return agent.execution_identity.disposition === "BOUND_FOR_EVALUATION" || agent.execution_identity.disposition === "BOUND_FOR_DISPATCH"; }
export function hasHistoricalQualification(agent: SnapshotAgent): boolean { return agent.capability_scores.some((score) => score.qualification === "Recommended_supervised" || score.qualification === "Qualified" || score.qualification === "Production_cleared"); }
export function rankSnapshotAgents(agents:readonly SnapshotAgent[],selections:readonly CapabilitySelection[]):RankingResult {const c=(a:SnapshotAgent):AgentCandidate=>({agent_tuple_id:asAgent(a.agent_tuple_id),active_in_repository:a.active_in_repository,available:a.available,capability_scores:a.capability_scores.map(s=>({...s,capability_id:asCap(s.capability_id)}))});const eligible=agents.filter(hasHistoricalQualification);const ranked=rankAgents(eligible.map(c),selections).map(r=>({...r,agent:agents.find(a=>a.agent_tuple_id===String(r.agent_tuple_id))!})),ids=new Set(ranked.map(r=>r.agent.agent_tuple_id));return{ranked,excluded:agents.filter(a=>!ids.has(a.agent_tuple_id)).map(agent=>({agent,reason:!hasHistoricalQualification(agent)?"qualification ledger gate: insufficient credited trials":!agent.available?`availability gate: ${agent.availability}`:"qualification/confidence gate: no selected capability meets the minimum"}))}}
export const capabilityDefinitions=()=>CAPABILITY_DEFINITIONS;

export function formatAgentTuple(agent: SnapshotAgent | undefined): string {
  return agent ? `${agent.model} · ${agent.harness} · ${agent.reasoning_level} · ${agent.agent_tuple_id}` : "NOT MEASURED";
}

const qualificationRank: Readonly<Record<SnapshotCapabilityScore["qualification"], number>> = {
  DISQUALIFIED: -1,
  UNTESTED: 0,
  EVALUATING: 1,
  Recommended_supervised: 2,
  Qualified: 3,
  Production_cleared: 4,
};

export function primaryQualification(agent: SnapshotAgent, capabilityIds: readonly string[]): SnapshotCapabilityScore["qualification"] {
  const relevant = capabilityIds.length === 0
    ? agent.capability_scores
    : agent.capability_scores.filter((score) => capabilityIds.includes(score.capability_id));
  return relevant.reduce<SnapshotCapabilityScore["qualification"]>((best, score) =>
    qualificationRank[score.qualification] > qualificationRank[best] ? score.qualification : best, "UNTESTED");
}

export function preferredCapabilityScore(agent: SnapshotAgent, capabilityId: string): SnapshotCapabilityScore | null {
  return capabilityId
    ? agent.capability_scores.find((score) => score.capability_id === capabilityId) ?? null
    : [...agent.capability_scores].sort((left, right) => right.verified_trials - left.verified_trials || right.score - left.score || left.capability_id.localeCompare(right.capability_id))[0] ?? null;
}

export interface InventoryProjectionOptions {
  readonly sort: InventorySort;
  readonly query: string;
  readonly harness: string;
  readonly availability: string;
  readonly capability: string;
}

export function projectInventoryAgents(agents: readonly SnapshotAgent[], options: InventoryProjectionOptions): readonly SnapshotAgent[] {
  const qualificationOrder: Readonly<Record<string, number>> = { DISQUALIFIED: -1, UNTESTED: 0, EVALUATING: 1, Recommended_supervised: 2, Qualified: 3, Production_cleared: 4 };
  const availabilityOrder: Readonly<Record<string, number>> = { unknown: 0, offline: 1, paused: 2, busy: 3, available: 4 };
  const query = options.query.trim().toLocaleLowerCase();
  const filtered = agents.filter((agent) => {
    const searchable = `${agent.model} ${agent.family} ${agent.harness} ${agent.reasoning_level} ${agent.inference_source} ${agent.route} ${agent.agent_tuple_id}`.toLocaleLowerCase();
    return (!query || searchable.includes(query))
      && (!options.harness || agent.harness === options.harness)
      && (!options.availability || agent.availability === options.availability)
      && (!options.capability || agent.capability_scores.some((score) => score.capability_id === options.capability));
  });
  const metric = (agent: SnapshotAgent): number | null => {
    const score = preferredCapabilityScore(agent, options.capability);
    if (options.sort === "capability") return score?.score ?? null;
    if (options.sort === "samples") return score?.verified_trials ?? null;
    if (options.sort === "success") return agent.metrics.verified_success_rate;
    if (options.sort === "reliability") return agent.metrics.reliability;
    if (options.sort === "cost") return agent.metrics.cost_per_success_usd;
    if (options.sort === "speed") return agent.metrics.tokens_per_second;
    if (options.sort === "familiarity") return agent.familiarity_runs;
    if (options.sort === "qualification") return qualificationOrder[primaryQualification(agent, options.capability ? [options.capability] : [])] ?? 0;
    if (options.sort === "headless") return agent.headless === null ? null : Number(agent.headless);
    if (options.sort === "local") return agent.metrics.local === null ? null : Number(agent.metrics.local);
    if (options.sort === "availability") return availabilityOrder[agent.availability] ?? 0;
    return null;
  };
  return [...filtered].sort((left, right) => {
    const leftMetric = metric(left), rightMetric = metric(right);
    if (leftMetric !== null || rightMetric !== null) {
      if (leftMetric === null) return 1;
      if (rightMetric === null) return -1;
      const direction = options.sort === "cost" ? leftMetric - rightMetric : rightMetric - leftMetric;
      if (direction !== 0) return direction;
    }
    const text = (agent: SnapshotAgent): string => {
      if (options.sort === "harness") return agent.harness;
      if (options.sort === "reasoning_level") return agent.reasoning_level;
      if (options.sort === "inference") return agent.inference_source;
      return agent.model;
    };
    return text(left).localeCompare(text(right)) || left.agent_tuple_id.localeCompare(right.agent_tuple_id);
  });
}

export function bestValueAgent(agents: readonly SnapshotAgent[]): SnapshotAgent | null {
  const measured = agents.filter((agent) => agent.available && agent.metrics.cost_per_success_usd !== null);
  return measured.sort((left, right) =>
    (left.metrics.cost_per_success_usd ?? Number.MAX_VALUE) - (right.metrics.cost_per_success_usd ?? Number.MAX_VALUE)
    || left.agent_tuple_id.localeCompare(right.agent_tuple_id))[0] ?? null;
}

export interface SnapshotAgentGroup {
  readonly key: string;
  readonly family: string;
  readonly harness: string;
  readonly active_count: number;
  readonly available_count: number;
  readonly treatments: readonly SnapshotAgent[];
}

export function groupSnapshotAgents(agents: readonly SnapshotAgent[]): readonly SnapshotAgentGroup[] {
  const grouped = new Map<string, SnapshotAgent[]>();
  for (const agent of agents) {
    const key = `${agent.family}\u0000${agent.harness}`;
    grouped.set(key, [...(grouped.get(key) ?? []), agent]);
  }
  return [...grouped.entries()].map(([key, treatments]) => ({
    key,
    family: treatments[0]!.family,
    harness: treatments[0]!.harness,
    active_count: treatments.filter((agent) => agent.active_in_repository).length,
    available_count: treatments.filter((agent) => agent.available).length,
    treatments: [...treatments].sort((left, right) => left.model.localeCompare(right.model) || left.reasoning_level.localeCompare(right.reasoning_level) || left.agent_tuple_id.localeCompare(right.agent_tuple_id)),
  })).sort((left, right) => right.active_count - left.active_count || left.family.localeCompare(right.family) || left.harness.localeCompare(right.harness));
}

export function knownNowIssueIds(snapshot: ControlPlaneSnapshot, run: SnapshotRun): readonly string[] {
  const runObservedAt = new Map(snapshot.runs.map((item) => [item.run_id, item.observed_at]));
  const targetObservedAt = runObservedAt.get(run.run_id);
  if (targetObservedAt === undefined) return [];
  const currentIssues = new Map(snapshot.issues.map((issue) => [issue.issue_id, issue]));
  const explicit = new Set(run.known_now_issue_ids.filter((issueId) => currentIssues.get(issueId)?.state !== "false_positive"));
  for (const issue of snapshot.issues) {
    if (issue.state === "false_positive") continue;
    const firstObservedAt = runObservedAt.get(issue.first_detected_run_id);
    const knownToPreexist = issue.origin === "baseline" || issue.origin === "newly_discovered_preexisting";
    if (knownToPreexist || (firstObservedAt !== undefined && firstObservedAt <= targetObservedAt)) explicit.add(issue.issue_id);
  }
  return [...explicit].sort();
}

export interface WorkbenchProjectionOptions {
  readonly sort: WorkbenchSort;
  readonly query: string;
  readonly domain: string;
  readonly owner: string;
  readonly state: string;
}

export function projectWorkbenchIssues(items: readonly PlannedSnapshotIssue[], runs: readonly SnapshotRun[], options: WorkbenchProjectionOptions): readonly PlannedSnapshotIssue[] {
  const observedAt = new Map(runs.map((run) => [run.run_id, run.observed_at]));
  const query = options.query.trim().toLocaleLowerCase();
  const filtered = items.filter((issue) => {
    const searchable = `${issue.issue_id} ${issue.title} ${issue.description} ${issue.debt_domain} ${issue.owner}`.toLocaleLowerCase();
    return (!query || searchable.includes(query))
      && (!options.domain || issue.debt_domain === options.domain)
      && (!options.owner || issue.owner === options.owner)
      && (!options.state || issue.state === options.state);
  });
  const planOrder = (issue: PlannedSnapshotIssue): number => issue.plan.order || Number.MAX_SAFE_INTEGER;
  return [...filtered].sort((left, right) => {
    if (options.sort === "severity") return right.severity - left.severity || planOrder(left) - planOrder(right);
    if (options.sort === "difficulty") return right.remediation_difficulty - left.remediation_difficulty || planOrder(left) - planOrder(right);
    if (options.sort === "age") return (observedAt.get(left.first_detected_run_id) ?? "").localeCompare(observedAt.get(right.first_detected_run_id) ?? "") || left.issue_id.localeCompare(right.issue_id);
    if (options.sort === "confidence") return left.confidence - right.confidence || planOrder(left) - planOrder(right);
    if (options.sort === "domain") return left.debt_domain.localeCompare(right.debt_domain) || planOrder(left) - planOrder(right);
    if (options.sort === "owner") return left.owner.localeCompare(right.owner) || planOrder(left) - planOrder(right);
    return planOrder(left) - planOrder(right) || left.issue_id.localeCompare(right.issue_id);
  });
}

export function debtFlowShare(value: number, flow: DebtFlow): number {
  const scale = Math.max(1, flow.starting_real_issues + flow.discovered_preexisting + flow.caused_by_remediation + flow.concurrently_introduced);
  return Math.max(0, Math.min(100, value / scale * 100));
}
