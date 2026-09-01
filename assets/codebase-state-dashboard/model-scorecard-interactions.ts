/// <reference lib="dom" />

export const PRODUCTION_TRIAL_FLOOR = 50;

export type QualificationState =
  | "qualified"
  | "trial_pending"
  | "role_evidence"
  | "diagnostic_only"
  | "untested"
  | "disqualified"
  | string;

export type ScorecardSortKey = "model" | "reasoning" | "harness" | "tasks" | "qualification";

export interface ProductionClearanceInput {
  terminalTrials: number;
  qualificationState: QualificationState;
  band: string;
  confidence?: string;
  identityStatus?: string;
  identityProvenance?: string;
}

export interface ProductionClearance {
  cleared: boolean;
  terminalTrials: number;
  requiredTrials: number;
  blockers: string[];
  warnings: string[];
}

export interface ScorecardSortEntry {
  id: string;
  model: string;
  reasoning: string;
  harness: string;
  tasks: number;
  qualification: QualificationState;
  productionCleared?: boolean;
  searchText?: string;
  originalIndex?: number;
}

export interface ScorecardFilters {
  query: string;
  qualification: string;
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

const qualificationOrder: Record<string, number> = {
  qualified: 0,
  trial_pending: 1,
  role_evidence: 2,
  diagnostic_only: 3,
  untested: 4,
  disqualified: 5,
};

export function qualificationRank(value: string): number {
  return qualificationOrder[value] ?? 6;
}

export function reasoningRank(value: string): number {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (/auto|router/u.test(normalized)) return 5;
  if (/\blow\b/u.test(normalized)) return 0;
  if (/\bmedium\b/u.test(normalized)) return 1;
  if (/\bhigh\b/u.test(normalized) && !/xhigh|extra[ -]?high/u.test(normalized)) return 2;
  if (/xhigh|extra[ -]?high/u.test(normalized)) return 3;
  if (/\bmax\b/u.test(normalized)) return 4;
  return 6;
}

export function evaluateProductionClearance(input: ProductionClearanceInput): ProductionClearance {
  const terminalTrials = Number.isFinite(input.terminalTrials)
    ? Math.max(0, Math.trunc(input.terminalTrials))
    : 0;
  const sampleFloorMet = terminalTrials >= PRODUCTION_TRIAL_FLOOR;
  const hardGateClear = input.band !== "failed" && input.qualificationState !== "disqualified";
  const runnerQualified = input.qualificationState === "qualified";
  const identityComplete = input.identityStatus === "identity_bound"
    && typeof input.identityProvenance === "string"
    && input.identityProvenance.trim().length > 0;
  const blockers: string[] = [];

  if (!sampleFloorMet) {
    blockers.push(`${PRODUCTION_TRIAL_FLOOR - terminalTrials} more terminal trials required`);
  }
  if (!hardGateClear) blockers.push("unresolved hard-gate disqualification");
  if (!runnerQualified) blockers.push("full-runner qualification absent");
  if (!identityComplete) blockers.push("complete execution identity and provenance absent");

  const warnings: string[] = [];
  if (sampleFloorMet && (!hardGateClear || !runnerQualified || !identityComplete)) {
    warnings.push("The 50-trial floor is met, but sample size alone never clears a tuple.");
  } else if (!sampleFloorMet) {
    warnings.push(`${terminalTrials}/${PRODUCTION_TRIAL_FLOOR} terminal trials; the sample floor is not met.`);
  }
  const confidence = input.confidence?.trim().toLocaleLowerCase("en-US") ?? "";
  if (confidence.startsWith("low")) warnings.push("Low-confidence evidence remains directional only.");
  else if (confidence.startsWith("medium")) warnings.push("Moderate confidence still requires broader controlled evidence.");

  return {
    cleared: sampleFloorMet && hardGateClear && runnerQualified && identityComplete,
    terminalTrials,
    requiredTrials: PRODUCTION_TRIAL_FLOOR,
    blockers,
    warnings,
  };
}

export function sortScorecardEntries(
  entries: readonly ScorecardSortEntry[],
  sortKey: ScorecardSortKey,
): ScorecardSortEntry[] {
  return [...entries].sort((left, right) => {
    let comparison = 0;
    if (sortKey === "model") comparison = collator.compare(left.model, right.model);
    else if (sortKey === "reasoning") {
      comparison = reasoningRank(left.reasoning) - reasoningRank(right.reasoning)
        || collator.compare(left.reasoning, right.reasoning);
    } else if (sortKey === "harness") comparison = collator.compare(left.harness, right.harness);
    else if (sortKey === "tasks") comparison = right.tasks - left.tasks;
    else if (sortKey === "qualification") {
      comparison = qualificationRank(left.qualification) - qualificationRank(right.qualification);
    }
    return comparison
      || collator.compare(left.model, right.model)
      || collator.compare(left.harness, right.harness)
      || (left.originalIndex ?? 0) - (right.originalIndex ?? 0);
  });
}

export function matchesScorecardFilters(entry: ScorecardSortEntry, filters: ScorecardFilters): boolean {
  const query = filters.query.trim().toLocaleLowerCase("en-US");
  const searchable = (entry.searchText ?? [
    entry.model,
    entry.reasoning,
    entry.harness,
    entry.qualification,
  ].join(" ")).toLocaleLowerCase("en-US");
  const qualificationMatches = !filters.qualification
    || (filters.qualification === "production_cleared"
      ? entry.productionCleared === true
      : entry.qualification === filters.qualification);
  return qualificationMatches && (!query || searchable.includes(query));
}

function numberFromDataset(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowEntry(row: HTMLTableRowElement, originalIndex: number): ScorecardSortEntry {
  return {
    id: row.dataset.tupleId ?? String(originalIndex),
    model: row.dataset.model ?? "",
    reasoning: row.dataset.reasoning ?? "",
    harness: row.dataset.harness ?? "",
    tasks: numberFromDataset(row.dataset.tasks),
    qualification: row.dataset.qualification ?? "untested",
    productionCleared: row.dataset.productionCleared === "true",
    searchText: row.dataset.search ?? "",
    originalIndex,
  };
}

export function bootstrapScorecard(documentRoot: Document = document): void {
  const tableBody = documentRoot.querySelector<HTMLTableSectionElement>("[data-scorecard-body]");
  const controls = documentRoot.querySelector<HTMLElement>("[data-scorecard-controls]");
  const form = documentRoot.querySelector<HTMLFormElement>("[data-scorecard-form]");
  const search = documentRoot.querySelector<HTMLInputElement>("[data-scorecard-search]");
  const qualification = documentRoot.querySelector<HTMLSelectElement>("[data-scorecard-qualification]");
  const sort = documentRoot.querySelector<HTMLSelectElement>("[data-scorecard-sort]");
  const resultStatus = documentRoot.querySelector<HTMLElement>("[data-scorecard-results]");
  if (!tableBody || !controls || !form || !search || !qualification || !sort || !resultStatus) return;

  const rows = Array.from(tableBody.querySelectorAll<HTMLTableRowElement>("[data-scorecard-row]"));
  const records = rows.map((row, originalIndex) => ({ row, entry: rowEntry(row, originalIndex) }));

  const apply = (): void => {
    const sortKey = sort.value as ScorecardSortKey;
    const ordered = sortScorecardEntries(records.map(({ entry }) => entry), sortKey);
    const byId = new Map(records.map((record) => [record.entry.id, record]));
    const fragment = documentRoot.createDocumentFragment();
    let visible = 0;
    for (const entry of ordered) {
      const record = byId.get(entry.id);
      if (!record) continue;
      const matches = matchesScorecardFilters(entry, {
        query: search.value,
        qualification: qualification.value,
      });
      record.row.hidden = !matches;
      if (matches) visible += 1;
      fragment.append(record.row);
    }
    tableBody.append(fragment);
    resultStatus.textContent = `${visible} of ${records.length} execution tuples shown.`;
  };

  form.addEventListener("input", apply);
  form.addEventListener("change", apply);
  form.addEventListener("reset", () => requestAnimationFrame(apply));
  controls.hidden = false;
  documentRoot.documentElement.classList.add("scorecard-enhanced");
  apply();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => bootstrapScorecard(), { once: true });
  } else {
    bootstrapScorecard();
  }
}
