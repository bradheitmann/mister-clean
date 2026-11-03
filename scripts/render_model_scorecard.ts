#!/usr/bin/env bun

import { copyFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { freezeInputs, prepareReportOutput, publishedScorecard, writeReceiptManifest } from "./report_snapshot.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const assetRoot = join(root, "assets", "codebase-state-dashboard");
const outputRoot = resolve(process.env.MISTER_CLEAN_REPORT_OUTPUT_DIR ?? assetRoot);
const targetRepositoryPath = process.env.MISTER_CLEAN_REPORT_TARGET_REPOSITORY;
if (!targetRepositoryPath) throw new Error("MISTER_CLEAN_REPORT_TARGET_REPOSITORY is required");

const templatePath = join(assetRoot, "model-scorecard.html");
const statePath = join(assetRoot, "okgo-model-scorecard.json");
const interactionSourcePath = join(assetRoot, "model-scorecard-interactions.ts");
const interactionPath = join(assetRoot, "model-scorecard-interactions.js");
const productMarkPath = join(assetRoot, "product-mark.svg");
const outputPath = join(outputRoot, "model-scorecard-okgo.html");
const outputInteractionPath = join(outputRoot, "model-scorecard-interactions.js");
const outputProductMarkPath = join(outputRoot, "product-mark.svg");
const frozen = freezeInputs([templatePath, statePath, interactionSourcePath, interactionPath, productMarkPath]);
const template = frozen.bytes.get(templatePath).toString("utf8");
const interaction = frozen.bytes.get(interactionPath).toString("utf8");
const expectedSourceMarker = `SHA-256 ${frozen.hashes["model-scorecard-interactions.ts"]}`;
if (!interaction.startsWith("/* Generated") || !interaction.includes(expectedSourceMarker)) {
  throw new Error("compiled scorecard interactions are stale; run bun run build:scorecard");
}
const interactionModule = await import(`${pathToFileURL(interactionPath).href}?sha256=${frozen.hashes["model-scorecard-interactions.js"]}`);
const { PRODUCTION_TRIAL_FLOOR, evaluateProductionClearance } = interactionModule;
if (PRODUCTION_TRIAL_FLOOR !== 50 || typeof evaluateProductionClearance !== "function") {
  throw new Error("compiled scorecard interaction contract is invalid");
}

const rawState = JSON.parse(frozen.bytes.get(statePath).toString("utf8"));
const state = publishedScorecard(rawState, frozen.hashes);
prepareReportOutput(assetRoot, outputRoot);
if (resolve(interactionPath) !== resolve(outputInteractionPath)) copyFileSync(interactionPath, outputInteractionPath);
if (resolve(productMarkPath) !== resolve(outputProductMarkPath)) copyFileSync(productMarkPath, outputProductMarkPath);
const receipt = writeReceiptManifest(outputRoot, state, { repositoryPath: targetRepositoryPath });
state.tuples = state.tuples.map((tuple) => ({ ...tuple, evidence: receipt.evidenceByTuple[tuple.id] }));
state.snapshot.receiptManifest = `./receipts/${receipt.filename}`;
state.snapshot.receiptManifestSha256 = receipt.digest;
state.snapshot.receiptBindingSummary = receipt.bindingSummary;

const baseStyles = template.match(/<style>([\s\S]*?)<\/style>/)?.[1];
if (!baseStyles) throw new Error("Could not extract scorecard base styles");

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const date = (value) => new Date(value).toLocaleString("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Denver",
});
const safeBand = (value) => ["qualified", "promising", "insufficient", "failed"].includes(value) ? value : "insufficient";
const qualificationLabels = {
  untested: "Untested",
  diagnostic_only: "Diagnostic only",
  role_evidence: "Role evidence",
  trial_pending: "Trial pending",
  qualified: "Full-runner qualified",
  disqualified: "Disqualified",
};
const bandLabels = {
  qualified: "Full-runner qualified",
  promising: "Trial candidate",
  insufficient: "Role evidence / insufficient",
  failed: "Hard-gate failure",
};
const chip = (band, value) => `<span class="chip chip-${safeBand(band)}">${escapeHtml(value)}</span>`;
const evidenceMarkup = (item) => {
  if (typeof item === "string") return escapeHtml(item);
  return item.href
    ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`
    : escapeHtml(item.label);
};
const evidenceText = (item) => typeof item === "string" ? item : item.label;

const evaluatedTuples = state.tuples.map((entry) => ({
  ...entry,
  production: evaluateProductionClearance({
    terminalTrials: entry.tasks.terminal,
    qualificationState: entry.qualificationState,
    band: entry.band,
    confidence: entry.confidence,
    identityStatus: entry.identityStatus,
    identityProvenance: entry.identityProvenance,
  }),
}));
const productionCleared = evaluatedTuples.filter((entry) => entry.production.cleared);
const highlightedTuples = (productionCleared.length ? productionCleared : [...evaluatedTuples]
  .sort((left, right) => right.tasks.terminal - left.tasks.terminal || left.model.localeCompare(right.model)))
  .slice(0, 3);

const metrics = state.summary.metrics.map((metric) => `
  <article class="card metric">
    <span class="label">${escapeHtml(metric.label)}</span>
    <strong class="metric-value">${integer.format(metric.value ?? 0)}</strong>
    <p class="metric-note">${escapeHtml(metric.note)}</p>
  </article>`).join("");

const productionCards = highlightedTuples.map((entry) => {
  const progressValue = Math.min(entry.production.terminalTrials, PRODUCTION_TRIAL_FLOOR);
  const blockers = entry.production.blockers.length
    ? `${entry.production.blockers.join("; ")}.`
    : "All production-clearance gates are satisfied.";
  return `
    <article class="card candidate-card">
      <span class="label">${escapeHtml(entry.model)} · ${escapeHtml(entry.reasoning)} · ${escapeHtml(entry.harness)}</span>
      <h3>${integer.format(entry.production.terminalTrials)}/${PRODUCTION_TRIAL_FLOOR} terminal trials</h3>
      <progress class="trial-progress" value="${progressValue}" max="${PRODUCTION_TRIAL_FLOOR}" aria-label="${integer.format(entry.production.terminalTrials)} of ${PRODUCTION_TRIAL_FLOOR} terminal trials"${entry.band === "failed" ? ' aria-invalid="true"' : ""}>${integer.format(entry.production.terminalTrials)} of ${PRODUCTION_TRIAL_FLOOR}</progress>
      ${chip(entry.production.cleared ? "qualified" : entry.band, entry.production.cleared ? "Production-cleared" : "Not cleared")}
      <p class="caveat">${escapeHtml(blockers)} ${escapeHtml(entry.production.warnings.join(" "))}</p>
    </article>`;
}).join("");

const bandOrder = ["qualified", "promising", "insufficient", "failed"];
const bandTotal = Math.max(1, bandOrder.reduce((total, band) => total + Number(state.bands[band] ?? 0), 0));
const bandSegments = bandOrder.map((band, index) => {
  const count = Number(state.bands[band] ?? 0);
  const basis = ((count / bandTotal) * 100).toFixed(3);
  return `<span class="band-segment band-${band}" style="flex-basis:${basis}%;animation-delay:calc(var(--okoa-motion-stagger) * ${index})" title="${escapeHtml(bandLabels[band])}: ${count}"></span>`;
}).join("");
const bandLegend = bandOrder.map((band) => `<span class="legend-item"><span class="legend-swatch band-${band}"></span>${escapeHtml(bandLabels[band])} · ${integer.format(state.bands[band] ?? 0)}</span>`).join("");

const roleCards = state.roleLeaders.map((entry) => `
  <article class="card role-card">
    <span class="label">${escapeHtml(entry.role)}</span>
    <h3>${escapeHtml(entry.tuple)}</h3>
    <span class="role-tuple">${integer.format(entry.samples)} samples · ${escapeHtml(entry.confidence)} confidence</span>
    <p>${escapeHtml(entry.rationale)}</p>
    ${chip(entry.band, entry.qualificationLabel ?? bandLabels[safeBand(entry.band)])}
    <p class="caveat">${escapeHtml(entry.caveat)}</p>
  </article>`).join("");

const tupleRows = evaluatedTuples.map((entry) => {
  const progressValue = Math.min(entry.production.terminalTrials, PRODUCTION_TRIAL_FLOOR);
  const identityDetails = [entry.identityProvenance, entry.identityNote].filter(Boolean);
  const blockers = entry.production.blockers.length
    ? `${entry.production.blockers.join("; ")}.`
    : "All production-clearance gates are satisfied.";
  const searchText = [
    entry.model,
    entry.reasoning,
    entry.harness,
    entry.qualificationState,
    entry.rating,
    entry.confidence,
    entry.identityStatus,
    ...identityDetails,
    ...entry.taskClasses,
    ...entry.evidence.map(evidenceText),
    entry.caveat,
  ].join(" ");
  return `
  <tr data-scorecard-row data-tuple-id="${escapeHtml(entry.id)}" data-model="${escapeHtml(entry.model)}" data-reasoning="${escapeHtml(entry.reasoning)}" data-harness="${escapeHtml(entry.harness)}" data-tasks="${entry.tasks.assigned}" data-qualification="${escapeHtml(entry.qualificationState)}" data-production-cleared="${entry.production.cleared}" data-search="${escapeHtml(searchText)}">
    <td data-label="Tuple"><span class="tuple-name">${escapeHtml(entry.model)}</span><span class="tuple-meta">${escapeHtml(entry.reasoning)} · ${escapeHtml(entry.harness)}</span>${chip(entry.band, entry.rating)}</td>
    <td data-label="Qualification"><span class="qualification-state">${escapeHtml(qualificationLabels[entry.qualificationState] ?? "Unclassified")}</span></td>
    <td data-label="Tasks">${integer.format(entry.tasks.assigned)}</td>
    <td data-label="Terminal">${integer.format(entry.tasks.terminal)}</td>
    <td data-label="Useful">${integer.format(entry.tasks.useful)}</td>
    <td data-label="Trial floor"><span class="trial-count">${integer.format(entry.production.terminalTrials)}/${PRODUCTION_TRIAL_FLOOR}</span><progress class="trial-progress" value="${progressValue}" max="${PRODUCTION_TRIAL_FLOOR}" aria-label="${integer.format(entry.production.terminalTrials)} of ${PRODUCTION_TRIAL_FLOOR} terminal trials"${entry.band === "failed" ? ' aria-invalid="true"' : ""}>${integer.format(entry.production.terminalTrials)} of ${PRODUCTION_TRIAL_FLOOR}</progress><p class="caveat">${escapeHtml(blockers)}</p></td>
    <td data-label="Confidence">${escapeHtml(entry.confidence)}${entry.production.warnings.length ? `<p class="caveat">${escapeHtml(entry.production.warnings.join(" "))}</p>` : ""}</td>
    <td data-label="Identity"><span class="qualification-state">${escapeHtml(entry.identityStatus ?? "not_recorded")}</span>${identityDetails.map((detail) => `<p class="caveat identity-copy">${escapeHtml(detail)}</p>`).join("")}</td>
    <td data-label="Work exercised">${escapeHtml(entry.taskClasses.join(", "))}</td>
    <td data-label="Evidence"><ul class="evidence-list">${entry.evidence.map((item) => `<li>${evidenceMarkup(item)}</li>`).join("")}</ul><p class="caveat">${escapeHtml(entry.caveat)}</p></td>
  </tr>`;
}).join("");

const comparisonCards = (state.comparisons ?? []).map((entry) => `
  <article class="card"><span class="label">Paired comparison</span><h3>${escapeHtml(entry.title)}</h3>${chip(entry.state, entry.result)}<p class="caveat">${escapeHtml(entry.detail)}</p></article>`).join("");
const gapCards = (state.gaps ?? []).map((entry) => `
  <article class="card"><span class="label">${escapeHtml(entry.tuple)}</span><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.task)}</p></article>`).join("");
const inFlightCards = (state.currentInFlight ?? []).map((entry) => `
  <article class="card"><span class="label">In flight · excluded from ratings</span><h3>${escapeHtml(entry.tuple)}</h3><p>${escapeHtml(entry.role)} · ${escapeHtml(entry.observedResult)}</p>${entry.identityProvenance ? `<p class="caveat">${escapeHtml(entry.identityProvenance)}</p>` : ""}<p class="caveat">${escapeHtml(entry.countDisposition)}</p></article>`).join("");
const unboundCards = (state.identityAccounting?.externalIdentityUnboundObservations ?? []).map((entry) => `
  <article class="card"><span class="label">Identity-unbound observation</span><h3>${escapeHtml(entry.model ?? entry.runtimeIdentity ?? entry.id)}</h3><p>${escapeHtml(entry.outcome)}</p>${entry.identityProvenance || entry.identityNote ? `<p class="caveat">${escapeHtml(entry.identityProvenance ?? entry.identityNote)}</p>` : ""}<p class="caveat">${escapeHtml(entry.attributionDisposition)}</p></article>`).join("");

const coverage = state.coverage?.configuredTupleCount == null
  ? `${integer.format(state.coverage?.observedTupleCount ?? state.tuples.length)} observed tuples; configured universe not frozen. ${state.coverage?.note ?? ""}`
  : `${integer.format(state.coverage.observedTupleCount)} of ${integer.format(state.coverage.configuredTupleCount)} frozen configured tuples; universe ${state.coverage.universeStatus}. ${state.coverage.note}`;
const sourceKey = state.snapshot.sourceDocument || Object.keys(state.snapshot.sourceSha256 ?? {}).find((key) => /\.json$/i.test(key));
const sourceProof = sourceKey && state.snapshot.sourceSha256?.[sourceKey];
const binding = state.snapshot.receiptBindingSummary;
const bindingText = binding ? `${integer.format(binding.content_or_commit_bound)} BOUND / ${integer.format(binding.assertion_only)} ASSERTION ONLY` : "binding summary unavailable";

const html = `<!doctype html>
<html lang="en" data-style="ridgeline">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Mister Clean · ${escapeHtml(state.snapshot.campaign)} Agent Scorecard</title>
  <link rel="icon" href="./product-mark.svg" type="image/svg+xml">
  <link rel="stylesheet" href="./dashboard-tokens.css">
  <style>${baseStyles}</style>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to scorecard evidence</a>
  <header class="masthead"><div class="shell masthead-grid">
    <div><div class="product-identity"><img class="product-mark" src="./product-mark.svg" alt="" width="32" height="32"><span>Mister Clean</span></div><p class="eyebrow">Mister Clean / agent qualification instrument</p><p class="label">${escapeHtml(state.snapshot.distributionClassification)}</p><h1>Trust is earned in receipts.</h1><p class="lede">Performance is a vector, not a leaderboard. Model, reasoning level, and harness remain separate treatments; every judgment carries its sample size and evidence boundary.</p></div>
    <div class="snapshot" aria-label="Scorecard snapshot identity"><strong>${escapeHtml(state.snapshot.campaign)}</strong><span>${escapeHtml(date(state.snapshot.generatedAt))} MDT</span><span>${escapeHtml(state.snapshot.scope)}</span><span>SOURCE ${escapeHtml(String(sourceProof ?? "unbound").slice(0, 12))} · RECEIPTS ${receipt.digest.slice(0, 12)} · ${bindingText}</span></div>
  </div></header>
  <nav class="view-nav" aria-label="Connected reports"><div class="shell"><a href="./case-study-okgo.html">Codebase state</a><a href="#production-cleared" aria-current="page">Production-cleared</a><a href="#qualification">Current evidence</a><a href="#roles">Role fit</a><a href="#evidence">Evidence matrix</a><a href="#comparisons">Harness effects</a><a href="#gaps">Next samples</a></div></nav>
  <main id="main-content" class="shell">
    <p class="method">Complete static, evidence-bound report. JavaScript is optional: it adds local sorting and filtering without creating, replacing, or reinterpreting evidence.</p>
    <noscript><p class="method-band method">Interactive controls are unavailable. All ${integer.format(evaluatedTuples.length)} execution tuples remain visible below in their original evidence order.</p></noscript>
    <section id="production-cleared" class="section" aria-labelledby="production-title"><div class="rail"><b>00</b><span>Production-cleared</span></div><div class="content"><h2 id="production-title">Sample size opens the gate. It never closes the case.</h2><div class="production-summary">
      <article class="card production-count"><span class="label">Production-cleared</span><strong>${integer.format(productionCleared.length)}</strong><p class="metric-note">${integer.format(productionCleared.length)} of ${integer.format(evaluatedTuples.length)} execution tuples. Fifty terminal trials are necessary, not sufficient.</p></article>
      <article class="card"><span class="label">Four conjunctive gates</span><ul class="gate-list"><li><strong>${PRODUCTION_TRIAL_FLOOR} terminal trials</strong><span class="caveat">Measured per exact model × reasoning × harness tuple.</span></li><li><strong>No unresolved hard-gate disqualification</strong><span class="caveat">More samples cannot average away a safety, custody, or completion stop.</span></li><li><strong>Full-runner qualification</strong><span class="caveat">Role evidence and naturalistic success do not establish end-to-end runner fitness.</span></li><li><strong>Complete execution identity and provenance</strong><span class="caveat">An identity label without observation-producing provenance fails closed.</span></li></ul></article>
    </div><div class="candidate-grid" aria-label="${productionCleared.length ? "Production-cleared tuples" : "Highest-sample uncleared tuples"}">${productionCards}</div></div></section>
    <section aria-labelledby="current-evidence-title" class="section"><div class="rail"><b>01</b><span>Current evidence</span></div><div class="content"><h2 id="current-evidence-title">${escapeHtml(state.summary.headline)}</h2><div class="summary-grid">${metrics}</div></div></section>
    <section id="qualification" class="section" aria-labelledby="bands-title"><div class="rail"><b>02</b><span>Qualification</span></div><div class="content"><h2 id="bands-title">Confidence before rank.</h2><div class="two-up">
      <article class="card"><span class="label">Full-runner qualification</span><div class="band-stack" role="img" aria-label="Qualification-band distribution">${bandSegments}</div><div class="legend">${bandLegend}</div><p class="metric-note">A useful result remains bounded to the role and task class exercised. A hard-gate failure remains visible even when the sample floor is met.</p></article>
      <article class="card static-status"><span class="label">Interpretation</span><h3>${escapeHtml(state.summary.headline)}</h3><p>${escapeHtml(state.summary.interpretation)}</p><p class="caveat">${escapeHtml(state.snapshot.evidenceBoundary)}</p></article>
    </div></div></section>
    <section id="roles" class="section" aria-labelledby="roles-title"><div class="rail"><b>03</b><span>Role fit</span></div><div class="content"><h2 id="roles-title">Different work needs different teeth.</h2><div class="role-grid">${roleCards}</div></div></section>
    <section id="evidence" class="section" aria-labelledby="evidence-title"><div class="rail"><b>04</b><span>Evidence</span></div><div class="content"><h2 id="evidence-title">Every tuple. Every counted task.</h2><div class="table-tools">
      <p class="metric-note">${escapeHtml(coverage)} Missing evidence means unexercised, not zero capability.</p>
      <div class="enhancement-panel" hidden data-scorecard-controls><form data-scorecard-form><div class="filter-group">
        <label class="filter-control"><span class="filter-label">Find evidence</span><input type="search" data-scorecard-search placeholder="Model, harness, task, or receipt"></label>
        <label class="filter-control"><span class="filter-label">Qualification</span><select data-scorecard-qualification><option value="">All qualifications</option><option value="production_cleared">Production-cleared</option><option value="qualified">Full-runner qualified</option><option value="trial_pending">Trial pending</option><option value="role_evidence">Role evidence</option><option value="diagnostic_only">Diagnostic only</option><option value="untested">Untested</option><option value="disqualified">Disqualified</option></select></label>
        <label class="filter-control"><span class="filter-label">Sort by</span><select data-scorecard-sort><option value="tasks">Task count · high to low</option><option value="model">Model · A to Z</option><option value="reasoning">Reasoning level · low to max</option><option value="harness">Harness · A to Z</option><option value="qualification">Qualification · strongest evidence first</option></select></label>
        <button class="reset-button" type="reset">Reset</button>
      </div><p class="results-status metric-note" role="status" aria-live="polite" aria-atomic="true" data-scorecard-results>${integer.format(evaluatedTuples.length)} of ${integer.format(evaluatedTuples.length)} execution tuples shown.</p></form></div>
    </div><div class="table-wrap"><table><caption>Execution-tuple evidence. The complete table is the no-script fallback; controls only reorder or hide existing rows locally.</caption><thead><tr><th>Model × reasoning × harness</th><th>Qualification</th><th>Tasks</th><th>Terminal</th><th>Useful</th><th>Trial floor</th><th>Confidence</th><th>Identity provenance</th><th>Work exercised</th><th>Evidence and caveat</th></tr></thead><tbody data-scorecard-body>${tupleRows}</tbody></table></div></div></section>
    <section id="identity" class="section" aria-labelledby="identity-title"><div class="rail"><b>05</b><span>Identity</span></div><div class="content"><h2 id="identity-title">Unbound evidence stays useful, not rankable.</h2><div class="identity-grid">${unboundCards || '<article class="card"><p>No identity-unbound observations are recorded.</p></article>'}</div><p class="method">${escapeHtml(state.identityAccounting?.policy ?? "Execution identity must bind model, reasoning, and harness before comparative use.")}</p></div></section>
    <section id="in-flight" class="section" aria-labelledby="in-flight-title"><div class="rail"><b>06</b><span>In flight</span></div><div class="content"><h2 id="in-flight-title">Active work is not a result.</h2><div class="in-flight-grid">${inFlightCards || '<article class="card"><p>No active work is excluded at this snapshot.</p></article>'}</div><p class="method">Local inference: ${escapeHtml(state.operatingConstraints?.localInference ?? "not recorded")}. ${escapeHtml(state.operatingConstraints?.rule ?? "")}</p></div></section>
    <section id="comparisons" class="section" aria-labelledby="comparisons-title"><div class="rail"><b>07</b><span>Harness effects</span></div><div class="content"><h2 id="comparisons-title">Same model is not the same experiment.</h2><div class="comparison-grid">${comparisonCards}</div></div></section>
    <section id="gaps" class="section" aria-labelledby="gaps-title"><div class="rail"><b>08</b><span>Next samples</span></div><div class="content"><h2 id="gaps-title">The next task should reduce uncertainty.</h2><div class="gap-grid">${gapCards}</div></div></section>
    <aside class="method-band method"><strong>Evidence boundary.</strong> This scorecard is a derived projection. It does not establish runner fitness, replace exact candidate and verdict receipts, or authorize integration. Naturalistic work is useful ecological evidence; controlled qualification requires matched disposable fixtures. If this page and repository evidence disagree, the page is stale debt. <a href="./receipts/${receipt.filename}">Open the content-addressed receipt manifest.</a></aside>
  </main>
  <script type="module" src="./model-scorecard-interactions.js"></script>
</body>
</html>\n`;

frozen.assertUnchanged();
writeFileSync(outputPath, html, "utf8");
console.error(`Rendered ${state.tuples.length} evidence tuples, ${productionCleared.length} production-cleared, and receipt manifest ${receipt.digest.slice(0, 12)} to ${outputPath}`);
