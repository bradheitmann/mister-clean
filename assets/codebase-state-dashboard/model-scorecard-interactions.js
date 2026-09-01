/* Generated from model-scorecard-interactions.ts · SHA-256 64d3db8619cf9ef6a859a898138837c8dc19cdd42277472df9faca775e15c609. */
// assets/codebase-state-dashboard/model-scorecard-interactions.ts
var PRODUCTION_TRIAL_FLOOR = 50;
var collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
var qualificationOrder = {
  qualified: 0,
  trial_pending: 1,
  role_evidence: 2,
  diagnostic_only: 3,
  untested: 4,
  disqualified: 5
};
function qualificationRank(value) {
  return qualificationOrder[value] ?? 6;
}
function reasoningRank(value) {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (/auto|router/u.test(normalized))
    return 5;
  if (/\blow\b/u.test(normalized))
    return 0;
  if (/\bmedium\b/u.test(normalized))
    return 1;
  if (/\bhigh\b/u.test(normalized) && !/xhigh|extra[ -]?high/u.test(normalized))
    return 2;
  if (/xhigh|extra[ -]?high/u.test(normalized))
    return 3;
  if (/\bmax\b/u.test(normalized))
    return 4;
  return 6;
}
function evaluateProductionClearance(input) {
  const terminalTrials = Number.isFinite(input.terminalTrials) ? Math.max(0, Math.trunc(input.terminalTrials)) : 0;
  const sampleFloorMet = terminalTrials >= PRODUCTION_TRIAL_FLOOR;
  const hardGateClear = input.band !== "failed" && input.qualificationState !== "disqualified";
  const runnerQualified = input.qualificationState === "qualified";
  const identityComplete = input.identityStatus === "identity_bound" && typeof input.identityProvenance === "string" && input.identityProvenance.trim().length > 0;
  const blockers = [];
  if (!sampleFloorMet) {
    blockers.push(`${PRODUCTION_TRIAL_FLOOR - terminalTrials} more terminal trials required`);
  }
  if (!hardGateClear)
    blockers.push("unresolved hard-gate disqualification");
  if (!runnerQualified)
    blockers.push("full-runner qualification absent");
  if (!identityComplete)
    blockers.push("complete execution identity and provenance absent");
  const warnings = [];
  if (sampleFloorMet && (!hardGateClear || !runnerQualified || !identityComplete)) {
    warnings.push("The 50-trial floor is met, but sample size alone never clears a tuple.");
  } else if (!sampleFloorMet) {
    warnings.push(`${terminalTrials}/${PRODUCTION_TRIAL_FLOOR} terminal trials; the sample floor is not met.`);
  }
  const confidence = input.confidence?.trim().toLocaleLowerCase("en-US") ?? "";
  if (confidence.startsWith("low"))
    warnings.push("Low-confidence evidence remains directional only.");
  else if (confidence.startsWith("medium"))
    warnings.push("Moderate confidence still requires broader controlled evidence.");
  return {
    cleared: sampleFloorMet && hardGateClear && runnerQualified && identityComplete,
    terminalTrials,
    requiredTrials: PRODUCTION_TRIAL_FLOOR,
    blockers,
    warnings
  };
}
function sortScorecardEntries(entries, sortKey) {
  return [...entries].sort((left, right) => {
    let comparison = 0;
    if (sortKey === "model")
      comparison = collator.compare(left.model, right.model);
    else if (sortKey === "reasoning") {
      comparison = reasoningRank(left.reasoning) - reasoningRank(right.reasoning) || collator.compare(left.reasoning, right.reasoning);
    } else if (sortKey === "harness")
      comparison = collator.compare(left.harness, right.harness);
    else if (sortKey === "tasks")
      comparison = right.tasks - left.tasks;
    else if (sortKey === "qualification") {
      comparison = qualificationRank(left.qualification) - qualificationRank(right.qualification);
    }
    return comparison || collator.compare(left.model, right.model) || collator.compare(left.harness, right.harness) || (left.originalIndex ?? 0) - (right.originalIndex ?? 0);
  });
}
function matchesScorecardFilters(entry, filters) {
  const query = filters.query.trim().toLocaleLowerCase("en-US");
  const searchable = (entry.searchText ?? [
    entry.model,
    entry.reasoning,
    entry.harness,
    entry.qualification
  ].join(" ")).toLocaleLowerCase("en-US");
  const qualificationMatches = !filters.qualification || (filters.qualification === "production_cleared" ? entry.productionCleared === true : entry.qualification === filters.qualification);
  return qualificationMatches && (!query || searchable.includes(query));
}
function numberFromDataset(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function rowEntry(row, originalIndex) {
  return {
    id: row.dataset.tupleId ?? String(originalIndex),
    model: row.dataset.model ?? "",
    reasoning: row.dataset.reasoning ?? "",
    harness: row.dataset.harness ?? "",
    tasks: numberFromDataset(row.dataset.tasks),
    qualification: row.dataset.qualification ?? "untested",
    productionCleared: row.dataset.productionCleared === "true",
    searchText: row.dataset.search ?? "",
    originalIndex
  };
}
function bootstrapScorecard(documentRoot = document) {
  const tableBody = documentRoot.querySelector("[data-scorecard-body]");
  const controls = documentRoot.querySelector("[data-scorecard-controls]");
  const form = documentRoot.querySelector("[data-scorecard-form]");
  const search = documentRoot.querySelector("[data-scorecard-search]");
  const qualification = documentRoot.querySelector("[data-scorecard-qualification]");
  const sort = documentRoot.querySelector("[data-scorecard-sort]");
  const resultStatus = documentRoot.querySelector("[data-scorecard-results]");
  if (!tableBody || !controls || !form || !search || !qualification || !sort || !resultStatus)
    return;
  const rows = Array.from(tableBody.querySelectorAll("[data-scorecard-row]"));
  const records = rows.map((row, originalIndex) => ({ row, entry: rowEntry(row, originalIndex) }));
  const apply = () => {
    const sortKey = sort.value;
    const ordered = sortScorecardEntries(records.map(({ entry }) => entry), sortKey);
    const byId = new Map(records.map((record) => [record.entry.id, record]));
    const fragment = documentRoot.createDocumentFragment();
    let visible = 0;
    for (const entry of ordered) {
      const record = byId.get(entry.id);
      if (!record)
        continue;
      const matches = matchesScorecardFilters(entry, {
        query: search.value,
        qualification: qualification.value
      });
      record.row.hidden = !matches;
      if (matches)
        visible += 1;
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
export {
  PRODUCTION_TRIAL_FLOOR,
  bootstrapScorecard,
  evaluateProductionClearance,
  matchesScorecardFilters,
  qualificationRank,
  reasoningRank,
  sortScorecardEntries
};
