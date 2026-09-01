#!/usr/bin/env bun

import { copyFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { freezeInputs, prepareReportOutput, publishedScorecard, writeReceiptManifest } from "./report_snapshot.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const assetRoot = join(root, "assets", "codebase-state-dashboard");
const outputRoot = resolve(process.env.MISTER_CLEAN_REPORT_OUTPUT_DIR ?? assetRoot);
const targetRepositoryPath = process.env.MISTER_CLEAN_REPORT_TARGET_REPOSITORY;
if (!targetRepositoryPath) throw new Error("MISTER_CLEAN_REPORT_TARGET_REPOSITORY is required");
const historyPath = join(assetRoot, "okgo-main-history.json");
const statePath = join(assetRoot, "okgo-case-study-state.json");
const scorecardPath = join(assetRoot, "okgo-model-scorecard.json");
const scorecardTemplatePath = join(assetRoot, "model-scorecard.html");
const tokenPath = join(assetRoot, "dashboard-tokens.css");
const instrumentPath = join(assetRoot, "index.html");
const productMarkPath = join(assetRoot, "product-mark.svg");
const outputProductMarkPath = join(outputRoot, "product-mark.svg");
const frozen = freezeInputs([historyPath, statePath, scorecardPath, scorecardTemplatePath, tokenPath, instrumentPath, productMarkPath]);
const history = JSON.parse(frozen.bytes.get(historyPath).toString("utf8"));
const state = JSON.parse(frozen.bytes.get(statePath).toString("utf8"));
const rawScorecard = JSON.parse(frozen.bytes.get(scorecardPath).toString("utf8"));
const scorecard = publishedScorecard(rawScorecard, {
  "model-scorecard.html": frozen.hashes["model-scorecard.html"],
  "okgo-model-scorecard.json": frozen.hashes["okgo-model-scorecard.json"],
});
prepareReportOutput(assetRoot, outputRoot);
if (resolve(productMarkPath) !== resolve(outputProductMarkPath)) copyFileSync(productMarkPath, outputProductMarkPath);
const receipt = writeReceiptManifest(outputRoot, scorecard, { repositoryPath: targetRepositoryPath });
const instrument = frozen.bytes.get(instrumentPath).toString("utf8");
const baseStyles = instrument.match(/<style>([\s\S]*?)<\/style>/)?.[1];
if (!baseStyles) throw new Error("Could not extract dashboard base styles");

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const date = (value) => new Date(value).toLocaleString("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Denver",
});
const signedKiB = (bytes) => `${bytes >= 0 ? "+" : ""}${decimal.format(bytes / 1024)}`;

const chart = (() => {
  const width = 900;
  const height = 280;
  const inset = { left: 48, right: 24, top: 26, bottom: 38 };
  const values = history.states.map((entry) => entry.bytes);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const floor = Math.max(0, minimum - (maximum - minimum) * 0.04);
  const range = Math.max(1, maximum - floor);
  const x = (index) => inset.left + (index / Math.max(1, history.states.length - 1)) * (width - inset.left - inset.right);
  const y = (value) => inset.top + ((maximum - value) / range) * (height - inset.top - inset.bottom);
  const path = history.states.map((entry, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)} ${y(entry.bytes).toFixed(2)}`).join(" ");
  const markers = [history.summary.first, history.summary.largestGrowth, history.summary.largestReduction, history.summary.last]
    .filter((entry, index, all) => all.findIndex((item) => item.commit === entry.commit) === index)
    .map((entry) => `<circle class="chart-point" cx="${x(entry.ordinal - 1).toFixed(2)}" cy="${y(entry.bytes).toFixed(2)}" r="4"><title>State ${entry.ordinal} · ${decimal.format(entry.kib)} KiB · ${escapeHtml(entry.subject)}</title></circle>`)
    .join("\n");
  const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const gridY = inset.top + ratio * (height - inset.top - inset.bottom);
    const value = maximum - ratio * range;
    return `<line class="chart-grid" x1="${inset.left}" y1="${gridY.toFixed(2)}" x2="${width - inset.right}" y2="${gridY.toFixed(2)}"></line><text class="chart-label" x="0" y="${(gridY + 4).toFixed(2)}">${integer.format(value / 1024)}</text>`;
  }).join("\n");
  return { width, height, path, markers, grid };
})();

const commitRows = history.states.map((entry) => `
  <tr data-history-row data-search="${escapeHtml(`${entry.shortCommit} ${entry.subject} ${entry.date}`.toLowerCase())}">
    <td>${entry.ordinal}</td>
    <td><code>${entry.shortCommit}</code></td>
    <td>${escapeHtml(entry.date.slice(0, 10))}</td>
    <td>${escapeHtml(entry.subject)}</td>
    <td>${integer.format(entry.files)}</td>
    <td>${integer.format(entry.bytes)}</td>
    <td>${decimal.format(entry.kib)}</td>
    <td class="${entry.deltaBytes < 0 ? "state-verified" : entry.deltaBytes > 0 ? "state-active" : ""}">${signedKiB(entry.deltaBytes)}</td>
  </tr>`).join("");

const statusClass = (value) => /failure|blocked|not clean/i.test(value)
  ? "state-open"
  : /complete|strong|excellent|exceptional|synchronized/i.test(value)
    ? "state-verified"
    : "state-active";
const qualificationLabels = {
  disqualified: "Disqualified",
  diagnostic_only: "Diagnostic only",
  qualified: "Qualified",
  role_evidence: "Role evidence",
  trial_pending: "Trial pending",
  untested: "Untested",
};
const modelRows = scorecard.tuples.map((entry) => `
  <tr>
    <td><strong>${escapeHtml(entry.model)}</strong><span class="table-sub">${escapeHtml(entry.id)}</span></td>
    <td>${escapeHtml(entry.reasoning)}</td>
    <td>${escapeHtml(entry.harness)}</td>
    <td>${escapeHtml(entry.taskClasses.join(", "))}</td>
    <td class="${statusClass(entry.rating)}">${escapeHtml(qualificationLabels[entry.qualificationState] ?? "Unclassified")}</td>
    <td>${escapeHtml(entry.rating)}. ${escapeHtml(entry.caveat)}</td>
  </tr>`).join("");

const learningCards = state.learnings.map((entry, index) => `
  <article class="card learning-card">
    <span class="label">L${String(index + 1).padStart(2, "0")}</span>
    <h3>${escapeHtml(entry.title)}</h3>
    <p>${escapeHtml(entry.detail)}</p>
  </article>`).join("");
const skillGaps = state.skill.openGaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join("");
const qaFindings = state.ci.freshHostedQa.findings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join("");
const rootPercent = (state.debt.rootRepairUnits / state.debt.rawFindings) * 100;
const symptomPercent = (state.debt.symptomOnly / state.debt.rawFindings) * 100;
const repositoryClean = state.repository.dirtyTracked + state.repository.untracked === 0;
const installedCopiesMatch = state.skill.canonicalInstallMatches === true;
const installCopy = installedCopiesMatch
  ? "Canonical installed copies match this source snapshot."
  : "Canonical installed copies do not yet match this working source; changes remain unreleased.";
const mebibytes = (value) => `${decimal.format(value / (1024 * 1024))} MiB`;
const percent = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const complexity = state.complexity;
const assertReport = (condition, message) => {
  if (!condition) throw new Error(`Case-study report invariant failed: ${message}`);
};
const categoryTotal = (categories, field) => categories.reduce((sum, entry) => sum + entry[field], 0);
assertReport(complexity?.snapshotCommit === state.repository.commit, "complexity census is not bound to the repository snapshot");
assertReport(complexity.thresholdLabel === "local governance heuristic, not industry truth", "complexity threshold label changed");
for (const surface of [complexity.committed, complexity.ignored]) {
  for (const field of ["files", "bytes", "physicalLines"]) {
    assertReport(categoryTotal(surface.categories, field) === surface.total[field], `${field} category sum does not match its surface total`);
  }
}
assertReport(complexity.committed.categories.length === 8, "committed census must contain eight mutually exclusive categories");
assertReport(complexity.ignored.categories.length === 4, "ignored census must contain four mutually exclusive classes");
const committedCategory = (id) => complexity.committed.categories.find((entry) => entry.id === id);
const ignoredCategory = (id) => complexity.ignored.categories.find((entry) => entry.id === id);
const productionCategory = committedCategory("production_code");
const publicDocsCategory = committedCategory("markdown_public_docs");
const planningCategory = committedCategory("planning_protocol_docs");
const ignoredEvidenceCategory = ignoredCategory("ignored_local_evidence_planning");
assertReport(productionCategory && publicDocsCategory && planningCategory && ignoredEvidenceCategory, "documentation ratio categories are incomplete");
const round3 = (value) => Math.round(value * 1000) / 1000;
assertReport(complexity.compositionPlanningDrift.ratiosByPhysicalLines.committedDocsToProduction === round3((publicDocsCategory.physicalLines + planningCategory.physicalLines) / productionCategory.physicalLines), "committed documentation ratio is stale");
assertReport(complexity.compositionPlanningDrift.ratiosByPhysicalLines.ignoredLocalEvidenceToProduction === round3(ignoredEvidenceCategory.physicalLines / productionCategory.physicalLines), "ignored local-evidence ratio is stale");
assertReport(complexity.compositionPlanningDrift.documentationSurfaces.allObservedDocumentationContext.physicalLines === publicDocsCategory.physicalLines + planningCategory.physicalLines + ignoredEvidenceCategory.physicalLines, "cross-surface documentation total is stale");

const censusRows = (surface) => surface.categories.map((entry) => `
  <tr>
    <td><strong>${escapeHtml(entry.label)}</strong><span class="table-sub">${escapeHtml(entry.id)}</span></td>
    <td>${integer.format(entry.files)}</td>
    <td>${integer.format(entry.bytes)}<span class="table-sub">${mebibytes(entry.bytes)}</span></td>
    <td>${integer.format(entry.physicalLines)}</td>
  </tr>`).join("");
const committedCensusRows = censusRows(complexity.committed);
const ignoredCensusRows = censusRows(complexity.ignored);
const thresholdLabel = escapeHtml(complexity.thresholdLabel);

const customStyles = `
  .report-shell { width: min(100% - var(--okoa-space-6), 1600px); margin-inline: auto; }
  .view-nav .report-shell { display: flex; min-height: calc(var(--okoa-control-height) + var(--okoa-space-1)); gap: var(--okoa-space-5); overflow-x: auto; }
  .card { box-shadow: none; }
  @media (hover: hover) and (pointer: fine) { .card:hover { box-shadow: none; transform: none; } }
  .report-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .report-grid .metric { min-height: 9rem; }
  .report-grid .metric-value { font-size: clamp(1.55rem, 2vw, 2.2rem); line-height: 1.05; }
  .section-wide { grid-template-columns: minmax(7rem, 10rem) minmax(0, 1fr); }
  .two-up { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--okoa-space-5); }
  .three-up { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--okoa-space-4); }
  .chart-svg { min-height: 18rem; }
  .chart-label { font-size: var(--t-fine); }
  .milestone { display: flex; flex-direction: column; min-height: 12rem; }
  .milestone strong { font-family: var(--okoa-mono); font-size: var(--t-title); font-weight: var(--w-medium); }
  .milestone code, code { font-family: var(--okoa-mono); font-size: var(--t-fine); }
  .debt-stack { display: flex; height: var(--okoa-space-5); background: var(--okoa-semantic-surface-alt); overflow: hidden; }
  .debt-segment { transform-origin: left; animation: mc-grow var(--okoa-dataviz-draw-duration) var(--okoa-ease-out) both; }
  .debt-root { flex-basis: ${rootPercent.toFixed(3)}%; background: var(--okoa-signal-risk); }
  .debt-symptom { flex-basis: ${symptomPercent.toFixed(3)}%; background: var(--okoa-semantic-fg3); animation-delay: var(--okoa-motion-stagger); }
  .debt-numbers { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--okoa-space-3); margin-top: var(--okoa-space-4); }
  .debt-numbers strong { display: block; font-family: var(--okoa-mono); font-size: var(--t-title); }
  .debt-numbers span { color: var(--okoa-semantic-fg2); font-family: var(--okoa-mono); font-size: var(--t-fine); }
  .learning-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--okoa-space-4); }
  .learning-card h3 { margin-top: var(--okoa-space-3); }
  .learning-card p { color: var(--okoa-semantic-fg2); margin-bottom: 0; font-size: var(--t-body-sm); }
  .complexity-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--okoa-space-4); }
  .complexity-panel { display: flex; flex-direction: column; gap: var(--okoa-space-3); min-height: 25rem; }
  .complexity-panel h3 { margin: 0; }
  .complexity-panel .holdout-number { margin-top: 0; }
  .complexity-panel .method { margin-top: auto; }
  .complexity-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--okoa-space-3); }
  .complexity-facts div { border-top: var(--okoa-border-hair) solid var(--okoa-semantic-border-default); padding-top: var(--okoa-space-2); }
  .complexity-facts strong { display: block; font-family: var(--okoa-mono); font-size: var(--t-title); font-weight: var(--w-medium); overflow-wrap: anywhere; }
  .complexity-facts span { color: var(--okoa-semantic-fg2); font-size: var(--t-fine); }
  .census-table { min-width: 40rem !important; }
  .census-table td:nth-child(n+2), .census-table th:nth-child(n+2) { font-family: var(--okoa-mono); font-size: var(--t-fine); text-align: right; font-variant-numeric: tabular-nums; }
  .governance-label { color: var(--okoa-semantic-fg3); display: block; font-family: var(--okoa-mono); font-size: var(--t-label); letter-spacing: var(--tracking-wide); text-transform: uppercase; }
  .table-wrap { overflow-x: auto; border: var(--okoa-border-hair) solid var(--okoa-semantic-border-default); }
  .table-wrap .truth-table { min-width: 70rem; }
  .model-table td:nth-child(2), .model-table td:nth-child(3), .model-table td:nth-child(5) { font-family: var(--okoa-mono); font-size: var(--t-fine); }
  .model-table td:last-child { min-width: 22rem; }
  .table-sub { display: block; color: var(--okoa-semantic-fg3); font-family: var(--okoa-mono); font-size: var(--t-label); font-weight: var(--w-regular); }
  .history-tools { display: flex; justify-content: space-between; align-items: end; gap: var(--okoa-space-4); margin-bottom: var(--okoa-space-3); }
  .commit-table td:nth-child(1), .commit-table td:nth-child(5), .commit-table td:nth-child(6), .commit-table td:nth-child(7), .commit-table td:nth-child(8) { font-family: var(--okoa-mono); font-size: var(--t-fine); text-align: right; font-variant-numeric: tabular-nums; }
  .commit-table td:nth-child(4) { min-width: 26rem; }
  .gap-list { margin: var(--okoa-space-4) 0 0; padding-left: var(--okoa-space-5); }
  .gap-list li { margin-bottom: var(--okoa-space-2); overflow-wrap: anywhere; }
  .product-lockup { align-items: center; display: inline-flex; gap: var(--okoa-space-2); margin-bottom: var(--okoa-space-4); }
  .product-lockup img { block-size: 2.5rem; inline-size: 2.5rem; }
  .product-lockup span { color: var(--okoa-semantic-fg1); font-family: var(--okoa-mono); font-size: var(--t-body-sm); font-weight: var(--w-medium); letter-spacing: var(--tracking-wide); text-transform: uppercase; }
  .masthead h1 { max-width: 14ch; }
  .section-content h2 { overflow-wrap: anywhere; }
  @media (max-width: 1200px) { .report-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .learning-grid, .complexity-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .chart-line[data-draw] { stroke-dasharray: 1; stroke-dashoffset: 1; animation: mc-line-draw var(--okoa-dataviz-draw-duration) var(--okoa-ease-out) both; }
  @keyframes mc-grow { from { transform: scaleX(0.02); } to { transform: scaleX(1); } }
  @keyframes mc-line-draw { to { stroke-dashoffset: 0; } }
  @media (max-width: 800px) { .report-shell { width: min(100% - var(--okoa-space-4), 1600px); } .two-up, .three-up { grid-template-columns: 1fr; } .two-up > *, .three-up > *, .section-content, .card { min-width: 0; } .section-wide { grid-template-columns: 1fr; } .section-wide .index-rail { position: static; } .learning-grid, .complexity-grid { grid-template-columns: 1fr; } .history-tools { display: block; } .table-wrap .truth-table, .census-table { min-width: 0 !important; width: 100%; } .truth-table thead { position: fixed; inset: 0 auto auto 0; width: 1px; height: 1px; overflow: hidden; transform: translate(-200vw, -200vh); } }
  @media (max-width: 560px) { .report-grid { grid-template-columns: 1fr; } }
  @media (prefers-reduced-motion: reduce) { .debt-segment, .chart-line[data-draw] { animation: none !important; transform: none !important; stroke-dashoffset: 0 !important; } }
`;

const html = `<!doctype html>
<html lang="en" data-style="ridgeline">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Mister Clean · OKGO State Report</title>
  <link rel="icon" href="./product-mark.svg" type="image/svg+xml">
  <link rel="stylesheet" href="./dashboard-tokens.css">
  <style>${baseStyles}\n${customStyles}</style>
</head>
<body>
  <header class="masthead">
    <div class="report-shell masthead-row">
      <div class="title-block">
        <div class="product-lockup"><img src="./product-mark.svg" alt="" width="40" height="40"><span>Mister Clean</span></div>
        <p class="eyebrow">Mister Clean / OKGO case study / live state instrument</p>
        <p class="label">${escapeHtml(state.distributionClassification)}</p>
        <h1>Closer. Not clean yet.</h1>
        <p class="lede">A commit-complete view of codebase growth, normalized hygiene debt, orthogonal complexity signals, skill capability, and the models currently proving the cleanup process.</p>
      </div>
      <div class="snapshot" aria-label="Report snapshot identity">
        <strong>OKGO · MAIN · ${history.repository.head.slice(0, 7)}</strong>
        <span>${escapeHtml(date(state.snapshot.generatedAt))} MDT</span>
        <span>${escapeHtml(state.snapshot.scope)}</span>
        <span>SOURCES ${frozen.hashes["okgo-case-study-state.json"].slice(0, 12)} · RECEIPTS ${receipt.digest.slice(0, 12)} · ${receipt.bindingSummary.content_or_commit_bound} BOUND / ${receipt.bindingSummary.assertion_only} ASSERTION ONLY</span>
      </div>
    </div>
  </header>
  <nav class="view-nav" aria-label="Report sections"><div class="report-shell">
    <a href="#trajectory">Trajectory</a><a href="#debt">Debt</a><a href="#wave">Active wave</a><a href="#skill">Skill</a><a href="#models">Models</a><a href="#learnings">Learnings</a><a href="#complexity">Complexity</a><a href="#history">Every commit</a><a href="./model-scorecard-okgo.html">Agent scorecard</a>
  </div></nav>
  <main class="report-shell">
    <p class="no-js-note method">Static, evidence-bound report. All values and the complete commit table are present in the file; no script is required.</p>
    <section aria-labelledby="summary-title">
      <h2 id="summary-title">Current state</h2>
      <div class="metric-grid report-grid">
        <article class="card metric verdict-card"><span class="label">Closeout verdict</span><span class="chip chip-risk">${state.snapshot.verdict}</span><p class="metric-note">Payable and boundary-blocked work remains.</p></article>
        <article class="card metric"><span class="label">Tracked files</span><strong class="metric-value" data-count="${history.summary.last.files}" data-format="integer">${integer.format(history.summary.last.files)}</strong><p class="metric-note">Everything tracked on local main.</p></article>
        <article class="card metric"><span class="label">Tracked tree</span><strong class="metric-value" data-count="${history.summary.last.kib}" data-format="decimal">${decimal.format(history.summary.last.kib)}</strong><p class="metric-note">KiB of Git blob content.</p></article>
        <article class="card metric"><span class="label">Main states</span><strong class="metric-value" data-count="${history.summary.stateCount}" data-format="integer">${integer.format(history.summary.stateCount)}</strong><p class="metric-note">Every first-parent commit since inception.</p></article>
        <article class="card metric"><span class="label">Transferred planning baseline</span><strong class="metric-value"><span data-count="${state.debt.rootRepairUnits}" data-format="integer">${integer.format(state.debt.rootRepairUnits)}</span></strong><p class="metric-note">Historical baseline: ${integer.format(state.debt.rawFindings)} raw findings grouped by normalized root identity. No fresh same-detector replay exists, so this is not a current after-count.</p></article>
        <article class="card metric"><span class="label">Mister Clean</span><strong class="metric-value">v${state.skill.version}</strong><p class="metric-note">${escapeHtml(installCopy)}</p></article>
      </div>
    </section>

    <section id="trajectory" class="section-block section-head section-wide" aria-labelledby="trajectory-title">
      <div class="index-rail"><span class="index-number">01</span><span class="index-label">Trajectory</span></div>
      <div class="section-content">
        <h2 id="trajectory-title">Size is context, not guilt.</h2>
        <article class="card chart-card">
          <div class="chart-head"><div><span class="label">Tracked blob bytes / first-parent main</span><p class="metric-note">${history.summary.stateCount} of ${history.summary.stateCount} states measured; no sampling.</p></div><strong>${decimal.format(history.summary.last.kib)} KiB</strong></div>
          <svg class="chart-svg" viewBox="0 0 ${chart.width} ${chart.height}" role="img" aria-labelledby="growth-title growth-desc">
            <title id="growth-title">OKGO tracked codebase size at every main commit</title>
            <desc id="growth-desc">The tracked tree grows from ${decimal.format(history.summary.first.kib)} KiB at state one to ${decimal.format(history.summary.last.kib)} KiB at state ${history.summary.stateCount}.</desc>
            ${chart.grid}
            <line class="chart-axis" x1="48" y1="242" x2="876" y2="242"></line>
            <path class="chart-line" data-draw pathLength="1" d="${chart.path}"></path>
            ${chart.markers}
            <text class="chart-label" x="48" y="270">STATE 1</text><text class="chart-label" x="412" y="270">FIRST-PARENT MAIN</text><text class="chart-label" x="820" y="270">STATE ${history.summary.stateCount}</text>
          </svg>
          <p class="method">Metric: ${escapeHtml(history.metric.definition)} Growth is not a hygiene verdict; unexplained or successor-hostile growth is.</p>
        </article>
        <div class="three-up section-block">
          <article class="card milestone"><span class="label">Inception</span><strong>${decimal.format(history.summary.first.kib)} KiB</strong><code>${history.summary.first.shortCommit}</code><p class="metric-note">${escapeHtml(history.summary.first.subject)}</p></article>
          <article class="card milestone"><span class="label">Largest one-commit addition</span><strong>${signedKiB(history.summary.largestGrowth.deltaBytes)} KiB</strong><code>${history.summary.largestGrowth.shortCommit}</code><p class="metric-note">${escapeHtml(history.summary.largestGrowth.subject)}</p></article>
          <article class="card milestone"><span class="label">Largest one-commit reduction</span><strong>${signedKiB(history.summary.largestReduction.deltaBytes)} KiB</strong><code>${history.summary.largestReduction.shortCommit}</code><p class="metric-note">${escapeHtml(history.summary.largestReduction.subject)}</p></article>
        </div>
      </div>
    </section>

    <section id="debt" class="section-block section-head section-wide" aria-labelledby="debt-title">
      <div class="index-rail"><span class="index-number">02</span><span class="index-label">Debt</span></div>
      <div class="section-content">
        <h2 id="debt-title">Root candidates organize work. Raw findings measure coverage.</h2>
        <div class="two-up">
          <article class="card"><span class="label">Transferred planning baseline</span><div class="debt-stack" role="img" aria-label="${state.debt.rootRepairUnits} normalized root candidates and ${state.debt.symptomOnly} duplicate or dependent symptoms among ${state.debt.rawFindings} raw findings"><span class="debt-segment debt-root"></span><span class="debt-segment debt-symptom"></span></div><div class="debt-numbers"><div><strong data-count="${state.debt.rootRepairUnits}">${state.debt.rootRepairUnits}</strong><span>Root candidates</span></div><div><strong data-count="${state.debt.symptomOnly}">${state.debt.symptomOnly}</strong><span>Dependent symptoms</span></div><div><strong data-count="${state.debt.rawFindings}">${state.debt.rawFindings}</strong><span>Raw findings</span></div></div><p class="metric-note">${escapeHtml(state.debt.measurementNote)}</p></article>
          <article class="card"><span class="label">Largest baseline classes</span><div class="holdout-number"><span data-count="${state.debt.artifactCount}">${state.debt.artifactCount}</span></div><p>structured planning artifacts were examined. The largest baseline raw classes are unfinished completion markers (${state.debt.counts.unfinished_completion_marker}), planning inputs requiring classification (${state.debt.counts.planning_input_unparsed}), acceptance cascades not executed (${state.debt.counts.acceptance_cascade_unexecuted}), and unknown lifecycle states (${state.debt.counts.lifecycle_state_unknown}). Their exact current distribution is pending a fresh replay.</p><span class="chip chip-caution">NOT CLEAN</span></article>
        </div>
        <div class="table-wrap section-block"><table class="truth-table"><thead><tr><th>Git surface</th><th>State</th><th>Bound fact</th></tr></thead><tbody>
          <tr><td>Local main</td><td class="${state.repository.aheadOfOrigin === 0 && state.repository.behindOrigin === 0 ? "state-verified" : "state-active"}">${state.repository.aheadOfOrigin === 0 && state.repository.behindOrigin === 0 ? "Synchronized" : "Diverged"}</td><td>${state.repository.aheadOfOrigin} commits ahead, ${state.repository.behindOrigin} behind origin/main at ${state.repository.commit.slice(0, 7)}.</td></tr>
          <tr><td>Worktrees</td><td class="state-active">${state.repository.worktrees} present</td><td>${repositoryClean ? "The measured inventory had no dirty paths at the snapshot." : "The measured inventory was dirty at the snapshot."} Integration and retirement remain separate closure questions.</td></tr>
          <tr><td>Dirty state</td><td class="${state.repository.dirtyTracked + state.repository.untracked === 0 ? "state-verified" : "state-open"}">${state.repository.dirtyTracked} staged path instances</td><td>${state.repository.dirtyWorktrees} worktrees carry staged-only changes: ${state.repository.dirtyTracked} path instances across ${state.repository.dirtyTrackedUniquePaths} unique paths, with ${state.repository.untracked} nonignored-untracked surfaces.</td></tr>
          <tr><td>Stashes</td><td class="state-verified">${state.repository.stashes}</td><td>No stash debt at this snapshot.</td></tr>
        </tbody></table></div>
      </div>
    </section>

    <section id="wave" class="section-block section-head section-wide" aria-labelledby="wave-title">
      <div class="index-rail"><span class="index-number">03</span><span class="index-label">Active wave</span></div>
      <div class="section-content">
        <h2 id="wave-title">Green main. Terminal writer. Fresh QA in flight.</h2>
        <p class="lede">The current branch topology is a controlled work queue, not evidence that closeout is complete. Terminal QA findings, content-addressed writer evidence, fresh independent review, and integration authority remain separate facts.</p>
        <div class="two-up">
          <article class="card"><span class="label">Canonical main · observed live</span><h3>${state.ci.main.ci === "success" && state.ci.main.cd === "success" ? "CI and CD are green" : "Hosted checks need attention"}</h3><p><code>${state.ci.main.commit.slice(0, 12)}</code> equals local and origin/main. CI run <code>${state.ci.main.ciRun}</code> and CD run <code>${state.ci.main.cdRun}</code> both completed ${escapeHtml(state.ci.main.ci)}.</p><span class="chip chip-pass">MAIN SYNCHRONIZED</span><p class="method">Observed ${escapeHtml(date(state.ci.main.observedAt))} MDT. Main's green state does not adjudicate an uncommitted staged candidate.</p></article>
          <article class="card"><span class="label">Hosted writer · terminal receipt</span><h3>${escapeHtml(state.ci.activeRemediation.status)}</h3><p><code>${state.ci.activeRemediation.currentStagedTree}</code> · ${state.ci.activeRemediation.stagedPathCount} staged paths · ${escapeHtml(state.ci.activeRemediation.stagedDiff)}.</p><p>${escapeHtml(state.ci.activeRemediation.observedChecks)}</p><p class="method">Manifest <code>${state.ci.activeRemediation.writerReceipt.manifestSha256.slice(0, 12)}</code> · summary <code>${state.ci.activeRemediation.writerReceipt.summarySha256.slice(0, 12)}</code> · ${escapeHtml(state.ci.activeRemediation.writerReceipt.payloadEntriesVerified)} payload entries verified.</p><span class="chip chip-caution">WRITER DONE · NOT ACCEPTED</span></article>
          <article class="card"><span class="label">Fresh QA3 · terminal content-addressed verdict</span><h3>${escapeHtml(state.ci.freshHostedQa.model)} · ${escapeHtml(state.ci.freshHostedQa.reasoning)} · ${escapeHtml(state.ci.freshHostedQa.harness)}</h3><p><strong>${escapeHtml(state.ci.freshHostedQa.status)}</strong></p><ul class="gap-list">${qaFindings}</ul><p class="method"><code>${state.ci.freshHostedQa.targetTree.slice(0, 12)}</code> · report ${state.ci.freshHostedQa.reportSha256.slice(0, 12)} · manifest ${state.ci.freshHostedQa.manifestSha256.slice(0, 12)}.</p></article>
          <article class="card"><span class="label">Fresh QA4 · observed in flight</span><h3>${escapeHtml(state.ci.currentHostedQa.model)} · ${escapeHtml(state.ci.currentHostedQa.reasoning)} · ${escapeHtml(state.ci.currentHostedQa.harness)}</h3><p><strong>${escapeHtml(state.ci.currentHostedQa.status)}</strong></p><p><code>${state.ci.currentHostedQa.targetTree}</code></p><span class="chip chip-caution">NO VERDICT YET</span><p class="method">Dispatch <code>${state.ci.currentHostedQa.dispatchSha256.slice(0, 12)}</code>. Active work is excluded from scorecard totals until a terminal artifact exists.</p></article>
          <article class="card"><span class="label">Process debt · supervisor-observed</span><div class="holdout-number">${state.processDebt.incident.processGroups}</div><p>abandoned Codex scan process groups were found and terminated after ${escapeHtml(state.processDebt.incident.reportedAge)}.</p><p>${escapeHtml(state.processDebt.established)}</p><span class="chip chip-caution">COVERAGE LESSON</span><p class="method"><strong>Not established:</strong> ${escapeHtml(state.processDebt.notEstablished)} <strong>Working-source response:</strong> ${escapeHtml(state.processDebt.skillResponse)}</p></article>
        </div>
      </div>
    </section>

    <section id="skill" class="section-block section-head section-wide" aria-labelledby="skill-title">
      <div class="index-rail"><span class="index-number">04</span><span class="index-label">Skill</span></div>
      <div class="section-content"><h2 id="skill-title">Synchronized is not the same as finished.</h2><div class="two-up">
        <article class="card"><span class="label">Working source</span><div class="holdout-number">v${state.skill.version}</div><p><code>${state.skill.commit.slice(0, 12)}</code> · source repository ${state.skill.repositoryClean ? "clean" : "dirty"} with ${state.skill.workingTreePathCount} changed path entries · registry package v${state.skill.publishedVersion} · ${installedCopiesMatch ? "canonical install hash matches" : "canonical install differs"} · ${state.skill.linkedHarnessRegistries} linked global registries.</p><span class="chip ${state.skill.repositoryClean && installedCopiesMatch ? "chip-pass" : "chip-caution"}">${state.skill.repositoryClean && installedCopiesMatch ? "Released copies agree" : "Unreleased and unsynchronized"}</span><p class="method">Focused development tests are not release qualification: ${escapeHtml(state.skill.workingSourceEvidence.targetedTests)}</p></article>
        <article class="card"><span class="label">Capability closure</span><h3>${escapeHtml(state.skill.status)}</h3><ul class="gap-list">${skillGaps}</ul></article>
      </div><p class="method">The working source contains zero-harm action boundaries, persistent goal construction, atomic lifecycle projections, worktree isolation, and a developing repository-process census. None is honestly release-qualified until a stable exact source object, the complete test and packaging matrix, independent re-audit, published package, synchronized installed copies, and a fresh blind invocation all agree.</p></div>
    </section>

    <section id="models" class="section-block section-head section-wide" aria-labelledby="models-title">
      <div class="index-rail"><span class="index-number">05</span><span class="index-label">Models</span></div>
      <div class="section-content"><h2 id="models-title">Field evidence first. Controlled comparison second.</h2><p class="lede">${scorecard.tuples.length} observed model/reasoning/harness combinations. Naturalistic ratings describe only the competency exercised; they are not a full-runner leaderboard.</p><div class="table-wrap section-block"><table class="truth-table model-table"><thead><tr><th>Actual model</th><th>Reasoning</th><th>Harness</th><th>Observed work</th><th>Qualification state</th><th>Observed performance</th></tr></thead><tbody>${modelRows}</tbody></table></div><details><summary>Evaluation doctrine</summary><div class="method">Every model begins at its lowest exposed reasoning level and steps upward one level per fresh, calibrated task. Finalists invoke Mister Clean on identical disposable repositories. The comparison records actual model, reasoning level, harness, fallback, context policy, elapsed time, hard-gate failures, prerequisite inflation, artifact residue, cleanup-introduced debt, and output hash. Current results are harness-native ecological evidence; a later minimal-harness campaign will isolate model capability. Live implementation, scouting, verification, integration, and full closeout remain separate capabilities.</div></details></div>
    </section>

    <section id="learnings" class="section-block section-head section-wide" aria-labelledby="learnings-title">
      <div class="index-rail"><span class="index-number">06</span><span class="index-label">Learnings</span></div>
      <div class="section-content"><h2 id="learnings-title">What the runs have taught the skill.</h2><div class="learning-grid">${learningCards}</div></div>
    </section>

    <section id="complexity" class="section-block section-head section-wide" aria-labelledby="complexity-title">
      <div class="index-rail"><span class="index-number">07</span><span class="index-label">Complexity</span></div>
      <div class="section-content">
        <h2 id="complexity-title">Complexity is a vector, not a score.</h2>
        <p class="lede">Five independent guardrails describe structure, dependency custody, change amplification, planning composition, and the shipped boundary. No composite score is calculated, and size alone is not treated as guilt.</p>
        <div class="two-up section-block">
          <article class="card">
            <span class="label">Committed snapshot · ${complexity.snapshotCommit.slice(0, 7)}</span>
            <h3>${integer.format(complexity.committed.total.files)} tracked paths · ${mebibytes(complexity.committed.total.bytes)}</h3>
            <div class="table-wrap"><table class="truth-table census-table"><thead><tr><th>Category</th><th>Files</th><th>Bytes</th><th>Physical lines</th></tr></thead><tbody>${committedCensusRows}<tr><td><strong>Total committed</strong></td><td>${integer.format(complexity.committed.total.files)}</td><td>${integer.format(complexity.committed.total.bytes)}<span class="table-sub">${mebibytes(complexity.committed.total.bytes)}</span></td><td>${integer.format(complexity.committed.total.physicalLines)}</td></tr></tbody></table></div>
          </article>
          <article class="card">
            <span class="label">Ignored working surface · same observation</span>
            <h3>${integer.format(complexity.ignored.total.files)} ignored paths · ${mebibytes(complexity.ignored.total.bytes)}</h3>
            <div class="table-wrap"><table class="truth-table census-table"><thead><tr><th>Class</th><th>Files</th><th>Bytes</th><th>Physical lines</th></tr></thead><tbody>${ignoredCensusRows}<tr><td><strong>Total ignored</strong></td><td>${integer.format(complexity.ignored.total.files)}</td><td>${integer.format(complexity.ignored.total.bytes)}<span class="table-sub">${mebibytes(complexity.ignored.total.bytes)}</span></td><td>${integer.format(complexity.ignored.total.physicalLines)}</td></tr></tbody></table></div>
          </article>
        </div>
        <p class="method"><strong>Measurement boundary.</strong> ${escapeHtml(complexity.method.committedBytes)} ${escapeHtml(complexity.method.ignoredBytes)} ${escapeHtml(complexity.method.physicalLines)} ${escapeHtml(complexity.method.classification)} <strong>Separate analyzer denominator:</strong> ${escapeHtml(complexity.method.staticAnalyzerClassification)}</p>
        <div class="complexity-grid section-block" aria-label="Five independent complexity guardrails">
          <article class="card complexity-panel" data-complexity-panel="structural-shape">
            <span class="label">01 · Structural shape</span>
            <h3>File scale and workspace truth must agree.</h3>
            <div class="complexity-facts"><div><strong>${integer.format(complexity.structuralShape.productionPhysicalLinesP95)}</strong><span>production P95 physical lines</span></div><div><strong>${integer.format(complexity.structuralShape.productionPhysicalLinesMax)}</strong><span>maximum physical lines</span></div><div><strong>${integer.format(complexity.structuralShape.sourceComponents.total)}</strong><span>source components</span></div><div><strong>${complexity.structuralShape.workspaceCounts.rootPackageJson} / ${complexity.structuralShape.workspaceCounts.pnpmWorkspaceYaml}</strong><span>root / pnpm workspace members</span></div></div>
            <p>${complexity.structuralShape.productionFilesOver500PhysicalLines} production files exceed 500 physical lines; ${complexity.structuralShape.productionFilesOver1000PhysicalLines} exceeds 1,000. The 25 source components are 9 services, 12 plugins, 3 libraries, and 1 fork patch. Workspace declarations disagree at 43 versus 45, and the YAML comment still claims 31.</p>
            <p><strong>Do not mix denominators:</strong> the dashboard classifier reports production-file length P95 ${complexity.structuralShape.productionPhysicalLinesP95} / max ${integer.format(complexity.structuralShape.productionPhysicalLinesMax)} across ${complexity.structuralShape.productionFiles} paths. The analyzer's separate 291-file policy found ${integer.format(complexity.structuralShape.staticAnalyzer.functions)} functions with function-length P95 ${complexity.structuralShape.staticAnalyzer.functionLengthPhysicalLines.p95} / max ${complexity.structuralShape.staticAnalyzer.functionLengthPhysicalLines.max} and cyclomatic P95 ${complexity.structuralShape.staticAnalyzer.cyclomaticComplexity.p95} / max ${complexity.structuralShape.staticAnalyzer.cyclomaticComplexity.max}. It found ${complexity.structuralShape.staticAnalyzer.dependencyCycles} dependency cycles and ${complexity.structuralShape.staticAnalyzer.unresolvedRelativeImports} unresolved relative imports; the top hotspot is <code>${escapeHtml(complexity.structuralShape.staticAnalyzer.topHotspot.path)}</code> <code>${escapeHtml(complexity.structuralShape.staticAnalyzer.topHotspot.symbol)}</code> at ${complexity.structuralShape.staticAnalyzer.topHotspot.physicalLines} physical lines × cyclomatic ${complexity.structuralShape.staticAnalyzer.topHotspot.cyclomaticComplexity}.</p>
            <p><strong>Current:</strong> ${escapeHtml(complexity.structuralShape.currentAssessment)}</p>
            <p class="method"><span class="governance-label">${thresholdLabel}</span>${escapeHtml(complexity.structuralShape.heuristic)}</p>
          </article>
          <article class="card complexity-panel" data-complexity-panel="dependency-vendor-boundary">
            <span class="label">02 · Dependency / vendor boundary</span>
            <h3>Vendored weight needs custody, not erasure.</h3>
            <div class="complexity-facts"><div><strong>${integer.format(complexity.dependencyVendorBoundary.trackedVendoredPackages)}</strong><span>tracked vendor identities</span></div><div><strong>${percent.format(complexity.dependencyVendorBoundary.trackedVendorShareBytesPercent)}%</strong><span>committed bytes are vendor/generated</span></div><div><strong>${complexity.dependencyVendorBoundary.ignoredDependencyToTrackedTreeRatio.toFixed(2)}×</strong><span>ignored dependency bytes / tracked tree</span></div><div><strong>${integer.format(complexity.dependencyVendorBoundary.externalDirectRuntimeDependencies)}</strong><span>direct external runtime dependency</span></div></div>
            <p>All ${complexity.dependencyVendorBoundary.trackedVendoredPackages} tracked vendor manifests have unique name/version pairs. Vendor/generated content is ${integer.format(complexity.dependencyVendorBoundary.trackedVendorBytes)} bytes and ${integer.format(complexity.dependencyVendorBoundary.trackedVendorPhysicalLines)} physical lines; ignored dependencies add ${integer.format(complexity.dependencyVendorBoundary.ignoredDependencyBytes)} path bytes.</p>
            <p><strong>Current:</strong> ${escapeHtml(complexity.dependencyVendorBoundary.currentAssessment)}</p>
            <p class="method"><span class="governance-label">${thresholdLabel}</span>${escapeHtml(complexity.dependencyVendorBoundary.heuristic)}</p>
          </article>
          <article class="card complexity-panel" data-complexity-panel="duplication-change-amplification">
            <span class="label">03 · Duplication / change amplification</span>
            <h3>Small repeated config and broad commits both multiply change.</h3>
            <div class="complexity-facts"><div><strong>${complexity.duplicationChangeAmplification.duplicateTsconfigCopies}</strong><span>identical tsconfig copies</span></div><div><strong>${integer.format(complexity.duplicationChangeAmplification.redundantDuplicateBytes)}</strong><span>redundant exact-copy bytes</span></div><div><strong>${complexity.duplicationChangeAmplification.componentsPerCommit.p95}</strong><span>P95 components / commit</span></div><div><strong>${complexity.duplicationChangeAmplification.componentsPerCommit.max}</strong><span>maximum components / commit</span></div></div>
            <p>The one exact duplicate group contains 11 copies at 528 bytes each. Across 50 first-parent commits, file count per commit is P50 ${complexity.duplicationChangeAmplification.filesPerCommit.p50}, P95 ${complexity.duplicationChangeAmplification.filesPerCommit.p95}, max ${complexity.duplicationChangeAmplification.filesPerCommit.max}; 2 commits touched more than 5 components and 9 coupled production with planning.</p>
            <p><strong>Current:</strong> ${escapeHtml(complexity.duplicationChangeAmplification.currentAssessment)}</p>
            <p class="method"><span class="governance-label">${thresholdLabel}</span>${escapeHtml(complexity.duplicationChangeAmplification.heuristic)}</p>
          </article>
          <article class="card complexity-panel" data-complexity-panel="composition-planning-drift">
            <span class="label">04 · Composition / planning drift</span>
            <h3>Direction matters more than a raw Markdown ratio.</h3>
            <div class="complexity-facts"><div><strong>${decimal.format(complexity.compositionPlanningDrift.ratiosByPhysicalLines.planningToProduction)}×</strong><span>planning / production physical lines</span></div><div><strong>${decimal.format(complexity.compositionPlanningDrift.ratiosByPhysicalLines.publicDocsToProduction)}×</strong><span>public docs / production physical lines</span></div><div><strong>${decimal.format(complexity.compositionPlanningDrift.ratiosByPhysicalLines.committedDocsToProduction)}×</strong><span>all committed docs / production</span></div><div><strong>${decimal.format(complexity.compositionPlanningDrift.ratiosByPhysicalLines.ignoredLocalEvidenceToProduction)}×</strong><span>ignored local evidence / production</span></div><div><strong>+${integer.format(complexity.compositionPlanningDrift.recentFirstParentWindow.planningNetPhysicalLines)}</strong><span>recent planning direction</span></div><div><strong>+${integer.format(complexity.compositionPlanningDrift.recentFirstParentWindow.productionPlusTestsNetPhysicalLines)}</strong><span>recent production + tests</span></div></div>
            <p>Committed public and planning documentation is ${integer.format(complexity.compositionPlanningDrift.documentationSurfaces.committedPublicAndPlanning.files)} files / ${integer.format(complexity.compositionPlanningDrift.documentationSurfaces.committedPublicAndPlanning.physicalLines)} physical lines versus ${integer.format(complexity.compositionPlanningDrift.documentationSurfaces.production.files)} production files / ${integer.format(complexity.compositionPlanningDrift.documentationSurfaces.production.physicalLines)} physical lines. Ignored local evidence and planning adds ${integer.format(complexity.compositionPlanningDrift.documentationSurfaces.ignoredLocalEvidencePlanning.files)} files / ${integer.format(complexity.compositionPlanningDrift.documentationSurfaces.ignoredLocalEvidencePlanning.physicalLines)} physical lines. Across both surfaces that is ${decimal.format(complexity.compositionPlanningDrift.documentationSurfaces.allObservedDocumentationContext.physicalLineRatioToProduction)}× production lines, but ${escapeHtml(complexity.compositionPlanningDrift.documentationSurfaces.allObservedDocumentationContext.boundary)}</p>
            <p>The 25-commit window adds +${integer.format(complexity.compositionPlanningDrift.recentFirstParentWindow.planningNetPhysicalLines)} planning physical lines versus +${integer.format(complexity.compositionPlanningDrift.recentFirstParentWindow.productionPlusTestsNetPhysicalLines)} production-plus-test physical lines. Tests remain a separate ${decimal.format(complexity.compositionPlanningDrift.ratiosByPhysicalLines.testsToProduction)}× coverage surface. Active planning is ${integer.format(complexity.compositionPlanningDrift.activePlanning.files)} files / ${integer.format(complexity.compositionPlanningDrift.activePlanning.physicalLines)} physical lines; done and archived planning is ${integer.format(complexity.compositionPlanningDrift.doneAndArchivedPlanning.files)} / ${integer.format(complexity.compositionPlanningDrift.doneAndArchivedPlanning.physicalLines)}.</p>
            <p><strong>Current:</strong> ${escapeHtml(complexity.compositionPlanningDrift.currentAssessment)}</p>
            <p class="method"><span class="governance-label">${thresholdLabel}</span>${escapeHtml(complexity.compositionPlanningDrift.heuristic)}</p>
          </article>
          <article class="card complexity-panel" data-complexity-panel="build-context-final-surface">
            <span class="label">05 · Build context / final shipped surface</span>
            <h3>Repository size cannot establish what the image ships.</h3>
            <div class="complexity-facts"><div><strong>${complexity.buildContextFinalSurface.trackedDockerfiles}</strong><span>tracked Dockerfiles</span></div><div><strong>${complexity.buildContextFinalSurface.dockerignoreFiles}</strong><span>.dockerignore files</span></div><div><strong>${complexity.buildContextFinalSurface.dockerCopyDirectives}</strong><span>Docker COPY directives</span></div><div><strong>${escapeHtml(complexity.buildContextFinalSurface.finalImageInventory)}</strong><span>final image inventory</span></div></div>
            <p>The compressed Git archive is ${integer.format(complexity.buildContextFinalSurface.compressedGitArchiveBytes)} bytes (${mebibytes(complexity.buildContextFinalSurface.compressedGitArchiveBytes)}). The non-.git working surface is ${integer.format(complexity.buildContextFinalSurface.nonGitWorkingTreeLogicalPaths)} logical paths and ${integer.format(complexity.buildContextFinalSurface.nonGitWorkingTreeLogicalPathBytes)} bytes (${mebibytes(complexity.buildContextFinalSurface.nonGitWorkingTreeLogicalPathBytes)}). Neither number establishes final shipped size.</p>
            <p><strong>Current:</strong> ${escapeHtml(complexity.buildContextFinalSurface.currentAssessment)}</p>
            <p class="method"><span class="governance-label">${thresholdLabel}</span>${escapeHtml(complexity.buildContextFinalSurface.heuristic)}</p>
          </article>
        </div>
      </div>
    </section>

    <section id="history" class="section-block section-head section-wide" aria-labelledby="history-title">
      <div class="index-rail"><span class="index-number">08</span><span class="index-label">Every commit</span></div>
      <div class="section-content"><h2 id="history-title">No milestone sampling. Every main state.</h2><div class="history-tools"><p class="metric-note">All ${history.states.length} commits are visible · bytes and KiB are both exact.</p><p class="label">First-parent main</p></div><div class="table-wrap"><table class="truth-table commit-table"><thead><tr><th>#</th><th>Commit</th><th>Date</th><th>Subject</th><th>Files</th><th>Bytes</th><th>KiB</th><th>Δ KiB</th></tr></thead><tbody>${commitRows}</tbody></table></div></div>
    </section>

    <section class="section-block"><div class="method"><strong>Evidence boundary.</strong> This dashboard is a derived projection. It does not establish CLEAN, replace a digest-bound closeout bundle, authorize an action, or satisfy a test. Main history, campaign debt, and live model observations move on different clocks; each section names its measured object. If this report and repository evidence disagree, the report is stale debt. <a href="./receipts/${receipt.filename}">Open the content-addressed model-evidence receipt manifest.</a></div></section>
  </main>
  <footer><div class="report-shell"><p>Mister Clean · OKGO State Report · three paths, one clean passage.</p><p>CSS-animated data views · complete first-parent history · reduced-motion path.</p></div></footer>
</body>
</html>\n`;

assertReport(!/<script\b/i.test(html), "case-study output contains a script element");
assertReport(!/javascript\s*:/i.test(html), "case-study output contains a javascript URL");
assertReport(!/\son[a-z]+\s*=/i.test(html), "case-study output contains an inline event handler");
assertReport(html.includes('href="#complexity"') && html.includes('id="complexity"'), "complexity navigation is not connected to its section");
assertReport(html.includes('href="#wave"') && html.includes('id="wave"'), "active-wave navigation is not connected to its section");
assertReport(html.includes("not a proven detector false negative"), "process-debt caveat was weakened or omitted");
assertReport(html.includes(state.ci.activeRemediation.currentStagedTree), "active remediation tree is missing");
assertReport(html.includes(state.ci.freshHostedQa.reportSha256.slice(0, 12)), "fresh QA receipt binding is missing");
assertReport(html.includes(state.ci.activeRemediation.writerReceipt.manifestSha256.slice(0, 12)), "terminal writer receipt binding is missing");
assertReport(html.includes(state.ci.currentHostedQa.dispatchSha256.slice(0, 12)), "fresh QA4 dispatch binding is missing");
assertReport((html.match(/data-complexity-panel=/g) ?? []).length === 5, "complexity section must render exactly five independent panels");
assertReport((html.match(/local governance heuristic, not industry truth/g) ?? []).length === 5, "every complexity threshold must carry the governance label");
assertReport(html.includes("Physical lines are not claimed to be logical LOC."), "physical-line measurement caveat is missing");
assertReport(html.includes("No composite score is calculated"), "complexity section could be mistaken for a composite score");

frozen.assertUnchanged();
writeFileSync(join(outputRoot, "case-study-okgo.html"), html);
console.error(`Rendered ${history.states.length} commit states and ${scorecard.tuples.length} model rows to ${join(outputRoot, "case-study-okgo.html")}`);
