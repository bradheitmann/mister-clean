import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const generatedModuleUrl = new URL("../assets/codebase-state-dashboard/model-scorecard-interactions.js", import.meta.url).href;
const scorecard = await import(/* @vite-ignore */ generatedModuleUrl);

const entries = [
  { id: "c", model: "Zulu", reasoning: "router auto", harness: "Pi", tasks: 3, qualification: "diagnostic_only", originalIndex: 0, searchText: "local audit" },
  { id: "a", model: "Alpha", reasoning: "low", harness: "Droid", tasks: 8, qualification: "trial_pending", originalIndex: 1, searchText: "receipt implementation" },
  { id: "b", model: "Beta", reasoning: "xhigh", harness: "Codex", tasks: 5, qualification: "qualified", productionCleared: true, originalIndex: 2, searchText: "full runner" },
];

describe("model scorecard progressive enhancement", () => {
  it("sorts exact tuples by every supported field", () => {
    expect(scorecard.sortScorecardEntries(entries, "model").map(({ id }: { id: string }) => id)).toEqual(["a", "b", "c"]);
    expect(scorecard.sortScorecardEntries(entries, "reasoning").map(({ id }: { id: string }) => id)).toEqual(["a", "b", "c"]);
    expect(scorecard.sortScorecardEntries(entries, "harness").map(({ id }: { id: string }) => id)).toEqual(["b", "a", "c"]);
    expect(scorecard.sortScorecardEntries(entries, "tasks").map(({ id }: { id: string }) => id)).toEqual(["a", "b", "c"]);
    expect(scorecard.sortScorecardEntries(entries, "qualification").map(({ id }: { id: string }) => id)).toEqual(["b", "a", "c"]);
  });

  it("filters without weakening tuple identity or qualification boundaries", () => {
    expect(scorecard.matchesScorecardFilters(entries[1]!, { query: "RECEIPT", qualification: "trial_pending" })).toBe(true);
    expect(scorecard.matchesScorecardFilters(entries[1]!, { query: "receipt", qualification: "qualified" })).toBe(false);
    expect(scorecard.matchesScorecardFilters(entries[2]!, { query: "", qualification: "production_cleared" })).toBe(true);
    expect(scorecard.matchesScorecardFilters(entries[0]!, { query: "", qualification: "production_cleared" })).toBe(false);
  });

  it("treats 50 terminal trials as necessary but never sufficient", () => {
    const identity = { identityStatus: "identity_bound", identityProvenance: "durable execution receipt" };
    expect(scorecard.evaluateProductionClearance({ terminalTrials: 49, qualificationState: "qualified", band: "qualified", ...identity })).toMatchObject({ cleared: false });
    expect(scorecard.evaluateProductionClearance({ terminalTrials: 50, qualificationState: "trial_pending", band: "promising", ...identity })).toMatchObject({ cleared: false });
    expect(scorecard.evaluateProductionClearance({ terminalTrials: 100, qualificationState: "disqualified", band: "failed", ...identity })).toMatchObject({ cleared: false });
    expect(scorecard.evaluateProductionClearance({ terminalTrials: 50, qualificationState: "qualified", band: "qualified", identityStatus: "identity_bound" })).toMatchObject({ cleared: false });
    expect(scorecard.evaluateProductionClearance({ terminalTrials: 50, qualificationState: "qualified", band: "qualified", ...identity })).toMatchObject({ cleared: true });
  });

  it("ships a deterministic module while retaining a complete no-script table", () => {
    const template = readFileSync(new URL("../assets/codebase-state-dashboard/model-scorecard.html", import.meta.url), "utf8");
    const browserModule = readFileSync(new URL("../assets/codebase-state-dashboard/model-scorecard-interactions.js", import.meta.url), "utf8");
    const renderer = readFileSync(new URL("../scripts/render_model_scorecard.mjs", import.meta.url), "utf8");
    const startMarker = "/* MISTER_CLEAN_SCORECARD_INTERACTIONS_START */";
    const endMarker = "/* MISTER_CLEAN_SCORECARD_INTERACTIONS_END */";
    const inline = template.slice(template.indexOf(startMarker) + startMarker.length, template.indexOf(endMarker)).trim();
    expect(inline).toBe(browserModule.trim());
    expect(template).toContain("<noscript>");
    expect(template.match(/<tr data-scorecard-row/g)).toHaveLength(3);
    expect(template).toContain("hidden data-scorecard-controls");
    expect(template).toContain('rel="icon" href="./product-mark.svg" type="image/svg+xml"');
    expect(template).toContain('<img class="product-mark" src="./product-mark.svg" alt=""');
    expect(renderer).toContain("freezeInputs([templatePath, statePath, interactionSourcePath, interactionPath, productMarkPath])");
    expect(renderer).toContain("copyFileSync(productMarkPath, outputProductMarkPath)");
    expect(browserModule).not.toContain("innerHTML");
  });
});
