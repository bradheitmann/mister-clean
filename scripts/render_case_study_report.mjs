#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const assetRoot = join(root, "assets", "codebase-state-dashboard");
const history = JSON.parse(readFileSync(join(assetRoot, "okgo-main-history.json"), "utf8"));
const state = JSON.parse(readFileSync(join(assetRoot, "okgo-case-study-state.json"), "utf8"));
const tokens = readFileSync(join(assetRoot, "dashboard-tokens.css"), "utf8");
const instrument = readFileSync(join(assetRoot, "index.html"), "utf8");
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
const modelRows = state.models.map((entry) => `
  <tr>
    <td><strong>${escapeHtml(entry.model)}</strong><span class="table-sub">${escapeHtml(entry.surface)}</span></td>
    <td>${escapeHtml(entry.reasoning)}</td>
    <td>${escapeHtml(entry.harness)}</td>
    <td>${escapeHtml(entry.task)}</td>
    <td class="${statusClass(entry.status)}">${escapeHtml(entry.status)}</td>
    <td>${escapeHtml(entry.fieldResult)}</td>
  </tr>`).join("");

const learningCards = state.learnings.map((entry, index) => `
  <article class="card learning-card">
    <span class="label">L${String(index + 1).padStart(2, "0")}</span>
    <h3>${escapeHtml(entry.title)}</h3>
    <p>${escapeHtml(entry.detail)}</p>
  </article>`).join("");
const skillGaps = state.skill.openGaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join("");
const snapshotJson = JSON.stringify({ history, state }).replaceAll("<", "\\u003c");
const paidPercent = (state.debt.resolved / state.debt.normalizedGenuine) * 100;
const openPercent = (state.debt.outstanding / state.debt.normalizedGenuine) * 100;

const customStyles = `
  .report-shell { width: min(100% - var(--okoa-space-6), 1600px); margin-inline: auto; }
  .report-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .report-grid .metric { min-height: 9rem; }
  .report-grid .metric-value { font-size: clamp(1.7rem, 3vw, 3.3rem); }
  .section-wide { grid-template-columns: minmax(7rem, 10rem) minmax(0, 1fr); }
  .two-up { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--okoa-space-5); }
  .three-up { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--okoa-space-4); }
  .chart-svg { min-height: 18rem; }
  .chart-label { font-size: var(--okoa-type-caption-size); }
  .milestone { display: flex; flex-direction: column; min-height: 12rem; }
  .milestone strong { font-family: var(--okoa-mono); font-size: var(--okoa-type-title-size); font-weight: var(--okoa-type-title-weight); }
  .milestone code, code { font-family: var(--okoa-mono); font-size: var(--okoa-type-caption-size); }
  .debt-stack { display: flex; height: var(--okoa-space-5); background: var(--okoa-semantic-surface-alt); overflow: hidden; }
  .debt-segment { transform-origin: left; }
  .debt-paid { flex-basis: ${paidPercent.toFixed(3)}%; background: var(--okoa-signal-pass); }
  .debt-open { flex-basis: ${openPercent.toFixed(3)}%; background: var(--okoa-signal-risk); }
  html.mc-js .debt-segment { transform: scaleX(0); }
  html.mc-js .debt-segment.is-drawn { transform: scaleX(1); transition: transform var(--okoa-dataviz-draw-duration) var(--okoa-ease-out); }
  .debt-numbers { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--okoa-space-3); margin-top: var(--okoa-space-4); }
  .debt-numbers strong { display: block; font-family: var(--okoa-mono); font-size: var(--okoa-type-title-size); }
  .debt-numbers span { color: var(--okoa-semantic-fg2); font-family: var(--okoa-mono); font-size: var(--okoa-type-caption-size); }
  .learning-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--okoa-space-4); }
  .learning-card h3 { margin-top: var(--okoa-space-3); }
  .learning-card p { color: var(--okoa-semantic-fg2); margin-bottom: 0; font-size: var(--okoa-type-table-cell-size); }
  .table-wrap { overflow-x: auto; border: var(--okoa-border-hair) solid var(--okoa-semantic-border-default); }
  .table-wrap .truth-table { min-width: 70rem; }
  .model-table td:nth-child(2), .model-table td:nth-child(3), .model-table td:nth-child(5) { font-family: var(--okoa-mono); font-size: var(--okoa-type-caption-size); }
  .model-table td:last-child { min-width: 22rem; }
  .table-sub { display: block; color: var(--okoa-semantic-fg3); font-family: var(--okoa-mono); font-size: var(--okoa-type-label-size); font-weight: var(--okoa-type-body-weight); }
  .history-tools { display: flex; justify-content: space-between; align-items: end; gap: var(--okoa-space-4); margin-bottom: var(--okoa-space-3); }
  .history-search { min-height: var(--okoa-touch-target-min); width: min(100%, 28rem); border: var(--okoa-border-hair) solid var(--okoa-semantic-border-default); border-radius: 0; background: var(--okoa-semantic-surface-default); color: var(--okoa-semantic-fg1); padding-inline: var(--okoa-space-3); font: inherit; }
  .history-search:focus-visible { outline: var(--okoa-focus-ring-width) solid var(--okoa-focus-ring-color); outline-offset: var(--okoa-focus-ring-offset); }
  .commit-table td:nth-child(1), .commit-table td:nth-child(5), .commit-table td:nth-child(6), .commit-table td:nth-child(7), .commit-table td:nth-child(8) { font-family: var(--okoa-mono); font-size: var(--okoa-type-caption-size); text-align: right; font-variant-numeric: tabular-nums; }
  .commit-table td:nth-child(4) { min-width: 26rem; }
  .gap-list { margin: var(--okoa-space-4) 0 0; padding-left: var(--okoa-space-5); }
  .gap-list li { margin-bottom: var(--okoa-space-2); }
  .masthead h1 { max-width: 14ch; }
  @media (max-width: 1200px) { .report-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } .learning-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 800px) { .report-shell { width: min(100% - var(--okoa-space-4), 1600px); } .two-up, .three-up { grid-template-columns: 1fr; } .section-wide { grid-template-columns: 1fr; } .section-wide .index-rail { position: static; } .learning-grid { grid-template-columns: 1fr; } .history-tools { display: block; } .history-search { margin-top: var(--okoa-space-3); } }
  @media (max-width: 560px) { .report-grid { grid-template-columns: 1fr; } }
  @media (prefers-reduced-motion: reduce) { html.mc-js .debt-segment { transform: none !important; } }
`;

const html = `<!doctype html>
<html lang="en" data-style="ridgeline">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Mister Clean · OKGO State Report</title>
  <script>document.documentElement.classList.add('mc-js');</script>
  <style>${tokens}\n${baseStyles}\n${customStyles}</style>
</head>
<body>
  <header class="masthead">
    <div class="report-shell masthead-row">
      <div class="title-block">
        <p class="eyebrow">Mister Clean / OKGO case study / live state instrument</p>
        <h1>Closer. Not clean yet.</h1>
        <p class="lede">A commit-complete view of codebase growth, normalized hygiene debt, skill capability, and the models currently proving the cleanup process.</p>
      </div>
      <div class="snapshot" aria-label="Report snapshot identity">
        <strong>OKGO · MAIN · ${history.repository.head.slice(0, 7)}</strong>
        <span>${escapeHtml(date(state.snapshot.generatedAt))} MDT</span>
        <span>${escapeHtml(state.snapshot.scope)}</span>
      </div>
    </div>
  </header>
  <nav class="view-nav" aria-label="Report sections"><div class="report-shell">
    <a href="#trajectory">Trajectory</a><a href="#debt">Debt</a><a href="#skill">Skill</a><a href="#models">Models</a><a href="#learnings">Learnings</a><a href="#history">Every commit</a>
  </div></nav>
  <main class="report-shell">
    <p class="no-js-note method">Animation and filtering are unavailable, but the bound values and complete commit table remain visible.</p>
    <section aria-labelledby="summary-title">
      <h2 id="summary-title">Current state</h2>
      <div class="metric-grid report-grid">
        <article class="card metric verdict-card"><span class="label">Closeout verdict</span><span class="chip chip-risk">${state.snapshot.verdict}</span><p class="metric-note">Payable and boundary-blocked work remains.</p></article>
        <article class="card metric"><span class="label">Tracked files</span><strong class="metric-value" data-count="${history.summary.last.files}" data-format="integer">${integer.format(history.summary.last.files)}</strong><p class="metric-note">Everything tracked on local main.</p></article>
        <article class="card metric"><span class="label">Tracked tree</span><strong class="metric-value" data-count="${history.summary.last.kib}" data-format="decimal">${decimal.format(history.summary.last.kib)}</strong><p class="metric-note">KiB of Git blob content.</p></article>
        <article class="card metric"><span class="label">Main states</span><strong class="metric-value" data-count="${history.summary.stateCount}" data-format="integer">${integer.format(history.summary.stateCount)}</strong><p class="metric-note">Every first-parent commit since inception.</p></article>
        <article class="card metric"><span class="label">Genuine debt paid</span><strong class="metric-value"><span data-count="${state.debt.resolved}" data-format="integer">${integer.format(state.debt.resolved)}</span>/${integer.format(state.debt.normalizedGenuine)}</strong><p class="metric-note">Latest normalized campaign ledger.</p></article>
        <article class="card metric"><span class="label">Mister Clean</span><strong class="metric-value">v${state.skill.version}</strong><p class="metric-note">Installed copies match; new learned gaps remain.</p></article>
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
        <h2 id="debt-title">The census became useful when it stopped pretending every symptom was work.</h2>
        <div class="two-up">
          <article class="card"><span class="label">Normalized genuine debt</span><div class="debt-stack" role="img" aria-label="${state.debt.resolved} resolved and ${state.debt.outstanding} outstanding of ${state.debt.normalizedGenuine} genuine debts"><span class="debt-segment debt-paid"></span><span class="debt-segment debt-open"></span></div><div class="debt-numbers"><div><strong data-count="${state.debt.resolved}">${state.debt.resolved}</strong><span>Resolved</span></div><div><strong data-count="${state.debt.outstanding}">${state.debt.outstanding}</strong><span>Outstanding</span></div><div><strong data-count="${state.debt.normalizedGenuine}">${state.debt.normalizedGenuine}</strong><span>Genuine baseline</span></div></div><p class="metric-note">${escapeHtml(state.debt.measurementNote)}</p></article>
          <article class="card"><span class="label">Detector correction</span><div class="holdout-number"><span data-count="${state.debt.detectorFalsePositives}">${state.debt.detectorFalsePositives}</span></div><p>of the original ${integer.format(state.debt.originalSymptoms)} findings were normalized as detector false positives. Those are Mister Clean defects—not permission to edit OKGO until the count falls.</p><span class="chip chip-caution">W-FP1–W-FP12</span></article>
        </div>
        <div class="table-wrap section-block"><table class="truth-table"><thead><tr><th>Git surface</th><th>State</th><th>Bound fact</th></tr></thead><tbody>
          <tr><td>Local main</td><td class="state-active">Ahead</td><td>${state.repository.aheadOfOrigin} commits ahead, ${state.repository.behindOrigin} behind origin/main at ${state.repository.commit.slice(0, 7)}.</td></tr>
          <tr><td>Worktrees</td><td class="state-active">${state.repository.worktrees} present</td><td>One primary tree plus three owned closeout/migration trees. Integration and retirement remain.</td></tr>
          <tr><td>Dirty state</td><td class="state-open">${state.repository.dirtyTracked + state.repository.untracked} paths</td><td>${state.repository.dirtyTracked} tracked modification; ${state.repository.untracked} untracked surfaces: ${state.repository.untrackedPaths.map(escapeHtml).join(", ")}.</td></tr>
          <tr><td>Stashes</td><td class="state-verified">${state.repository.stashes}</td><td>No stash debt at this snapshot.</td></tr>
        </tbody></table></div>
      </div>
    </section>

    <section id="skill" class="section-block section-head section-wide" aria-labelledby="skill-title">
      <div class="index-rail"><span class="index-number">03</span><span class="index-label">Skill</span></div>
      <div class="section-content"><h2 id="skill-title">Synchronized is not the same as finished.</h2><div class="two-up">
        <article class="card"><span class="label">Current release</span><div class="holdout-number">v${state.skill.version}</div><p><code>${state.skill.commit}</code> · repository clean · canonical install hash matches · ${state.skill.linkedHarnessRegistries} linked global registries.</p><span class="chip chip-pass">Current copies agree</span></article>
        <article class="card"><span class="label">Capability closure</span><h3>${escapeHtml(state.skill.status)}</h3><ul class="gap-list">${skillGaps}</ul></article>
      </div><p class="method">The release contains zero-harm action boundaries, persistent goal construction, atomic lifecycle projections, and worktree isolation. The W-FP dossier and the newest miss classes postdate v${state.skill.version}; they are not honestly “incorporated” until code, tests, release, installed copies, and a fresh blind invocation all agree.</p></div>
    </section>

    <section id="models" class="section-block section-head section-wide" aria-labelledby="models-title">
      <div class="index-rail"><span class="index-number">04</span><span class="index-label">Models</span></div>
      <div class="section-content"><h2 id="models-title">Field evidence first. Controlled comparison second.</h2><p class="lede">${state.models.length} observed model/reasoning/harness combinations. Naturalistic ratings describe only the competency exercised; they are not a full-runner leaderboard.</p><div class="table-wrap section-block"><table class="truth-table model-table"><thead><tr><th>Actual model</th><th>Reasoning</th><th>Harness</th><th>Current or completed task</th><th>Status</th><th>Observed performance</th></tr></thead><tbody>${modelRows}</tbody></table></div><details><summary>Evaluation doctrine</summary><div class="method">Every model begins at its lowest exposed reasoning level and steps upward one level per fresh, calibrated task. Finalists invoke Mister Clean on identical disposable repositories. The comparison records actual model, reasoning level, harness, fallback, context policy, elapsed time, hard-gate failures, prerequisite inflation, artifact residue, cleanup-introduced debt, and output hash. Current results are harness-native ecological evidence; a later minimal-harness campaign will isolate model capability. Live implementation, scouting, verification, integration, and full closeout remain separate capabilities.</div></details></div>
    </section>

    <section id="learnings" class="section-block section-head section-wide" aria-labelledby="learnings-title">
      <div class="index-rail"><span class="index-number">05</span><span class="index-label">Learnings</span></div>
      <div class="section-content"><h2 id="learnings-title">What the runs have taught the skill.</h2><div class="learning-grid">${learningCards}</div></div>
    </section>

    <section id="history" class="section-block section-head section-wide" aria-labelledby="history-title">
      <div class="index-rail"><span class="index-number">06</span><span class="index-label">Every commit</span></div>
      <div class="section-content"><h2 id="history-title">No milestone sampling. Every main state.</h2><div class="history-tools"><p class="metric-note"><span id="history-visible">${history.states.length}</span> of ${history.states.length} commits visible · bytes and KiB are both exact.</p><label><span class="label">Filter commits</span><input id="history-search" class="history-search" type="search" placeholder="SHA, date, or subject"></label></div><div class="table-wrap"><table class="truth-table commit-table"><thead><tr><th>#</th><th>Commit</th><th>Date</th><th>Subject</th><th>Files</th><th>Bytes</th><th>KiB</th><th>Δ KiB</th></tr></thead><tbody>${commitRows}</tbody></table></div></div>
    </section>

    <section class="section-block"><div class="method"><strong>Evidence boundary.</strong> This dashboard is a derived projection. It does not establish CLEAN, replace a digest-bound closeout bundle, authorize an action, or satisfy a test. Main history, campaign debt, and live model observations move on different clocks; each section names its measured object. If this report and repository evidence disagree, the report is stale debt.</div></section>
  </main>
  <footer><div class="report-shell"><p>Mister Clean · OKGO State Report · no logo used.</p><p>Animated data views · complete first-parent history · reduced-motion path.</p></div></footer>
  <script type="application/json" id="report-snapshot">${snapshotJson}</script>
  <script>
    (function () {
      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var rootStyle = getComputedStyle(document.documentElement);
      var countDuration = parseFloat(rootStyle.getPropertyValue('--okoa-dataviz-count-duration')) || 560;
      function format(value, kind) { return kind === 'decimal' ? Number(value).toLocaleString(undefined, {minimumFractionDigits: 3, maximumFractionDigits: 3}) : Math.round(Number(value)).toLocaleString(); }
      function animateCount(node) { var target = Number(node.dataset.count); var kind = node.dataset.format || 'integer'; if (!Number.isFinite(target) || reduced) { node.textContent = format(target, kind); return; } var start; requestAnimationFrame(function tick(now) { if (!start) start = now; var progress = Math.min(1, (now - start) / countDuration); var eased = 1 - Math.pow(1 - progress, 3); node.textContent = format(target * eased, kind); if (progress < 1) requestAnimationFrame(tick); }); }
      function reveal() { document.querySelectorAll('[data-count]').forEach(animateCount); document.querySelectorAll('.debt-segment').forEach(function (node) { node.classList.add('is-drawn'); }); document.querySelectorAll('.chart-line[data-draw]').forEach(function (path) { var length = path.getTotalLength(); path.style.setProperty('--path-length', length); requestAnimationFrame(function () { path.classList.add('is-drawn'); }); }); }
      reveal();
      var search = document.getElementById('history-search'); var rows = Array.from(document.querySelectorAll('[data-history-row]')); var visible = document.getElementById('history-visible');
      search.addEventListener('input', function () { var query = search.value.trim().toLowerCase(); var count = 0; rows.forEach(function (row) { var show = !query || row.dataset.search.includes(query); row.hidden = !show; if (show) count += 1; }); visible.textContent = count.toLocaleString(); });
    })();
  </script>
</body>
</html>\n`;

writeFileSync(join(assetRoot, "case-study-okgo.html"), html);
console.error(`Rendered ${history.states.length} commit states and ${state.models.length} model rows to assets/codebase-state-dashboard/case-study-okgo.html`);
