import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const styles = readFileSync(resolve(root, "src/styles.css"), "utf8");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const app = readFileSync(resolve(root, "src/App.svelte"), "utf8");
const renderVerifier = readFileSync(resolve(root, "../scripts/verify_control_plane_render.ts"), "utf8");
const tokenCss = readFileSync(
  resolve(root, "../assets/codebase-state-dashboard/dashboard-tokens.css"),
  "utf8",
);

function pixels(name: string): number {
  const value = tokenCss.match(new RegExp(`${name}:\\s*(\\d+)px`, "u"))?.[1];
  if (value === undefined) throw new Error(`missing pixel token ${name}`);
  return Number(value);
}

describe("dashboard lane source contract", () => {
  it("does not reference dashboard-forbidden token names", () => {
    for (const token of ["--okoa-touch-target-min", "--okoa-index-column", "--okoa-motion-fast", "--okoa-ease-out", "--okoa-motion-flow-duration", "--okoa-ease-in-out", "--okoa-elevation-hover", "--okoa-motion-instant"]) expect(styles).not.toContain(token);
  });
  it("uses a token-composed 44px interaction floor and resolving data motion", () => {
    expect(pixels("--okoa-control-height") + pixels("--okoa-space-1")).toBeGreaterThanOrEqual(44);
    expect(styles).toContain("min-height: calc(var(--okoa-control-height) + var(--okoa-space-1)) !important");
    expect(styles.match(/min-height\s*:[^;}]+!important/gu)).toHaveLength(1);
    for (const selector of [".theme-picker select", ".control", ".input"]) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rule = styles.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`, "u"))?.[0] ?? "";
      expect(rule).not.toContain("min-height:var(--okoa-control-height)");
    }
    expect(styles).not.toMatch(/animation:[^;]*\binfinite\b/u);
    expect(app).toContain('class="check-target"');
    expect(app).toContain("debtFlowShare(Number(lane[1]), snapshot.current_flow)");
    expect(styles).toContain("@keyframes debt-reveal");
    expect(styles).not.toContain(".flow-path");
  });
  it("keeps headline debt readable through progressive disclosure", () => {
    expect(app).toContain('<section class="blocker-preview"');
    expect(app).toContain("terminal.reasons.slice(0, 3)");
    expect(app).toContain('<details class="terminal-reasons disclosure">');
    expect(app).not.toContain('terminal.reasons.join("; ")');
    expect(app).toContain('<details class="flow-adjustments disclosure">');
    expect(styles).toContain("repeat(auto-fit, minmax(min(100%, 8rem), 1fr))");
    expect(styles).toMatch(/\.terminal-reason-list li[^}]*overflow-wrap:normal; word-break:normal/u);
    expect(styles).not.toMatch(/\.flow-cell span[^}]*overflow-wrap:\s*anywhere/u);
  });
  it("renders exactly one document-level title across every source path", () => {
    expect((`${app}\n${html}`.match(/<h1\b/g) ?? []).length).toBe(1);
    expect((app.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(html).not.toMatch(/<h1\b/u);
  });
  it("binds Finder button text and accessible state directly to reactive weights", () => {
    expect(app).toContain("{definition.label} · {capabilityWeights[definition.id] ?? 0}");
    expect(app).toContain('aria-label={`Weight ${definition.label}: ${capabilityWeights[definition.id] ?? 0}`}');
    expect(app).toContain('aria-pressed={(capabilityWeights[definition.id] ?? 0) > 0}');
    expect(app).not.toContain("capabilityWeight(definition.id)");
    expect(app).toContain("snapshot && selections.length > 0 ? rankSnapshotAgents");
  });
  it("keeps responsive navigation vertical, theme labels visible, and clipping rules warning-free", () => {
    expect(styles).toMatch(/@media \(max-width: 1279px\)[^{]*\{[\s\S]*?\.sidebar \{ display:none; \}[\s\S]*?\.mobile-nav \{ display:block;/u);
    expect(styles).toContain(".theme-picker select { max-width:100%;");
    expect(styles).toContain(".header-action { grid-column:1 / -1; width:100%; }");
    expect(styles).toContain(".theme-picker { grid-column:1 / -1; display:block;");
    expect(styles).toContain(".sr-only { position:absolute; width:1px; height:1px; padding:0; margin:0;");
    expect(styles).not.toContain("margin:-1px");
    expect(styles).not.toMatch(/\.mobile-nav[^}]*overflow-x/u);
  });
  it("uses theme-semantic error-boundary surfaces and foregrounds", () => {
    expect(styles).toContain(".error-state { border-left:var(--okoa-border-emphasis) solid var(--okoa-signal-risk); background:var(--okoa-semantic-surface-default); color:var(--okoa-semantic-fg1);");
    expect(styles).toContain(".error-state .view-heading { color:var(--okoa-semantic-fg1); }");
    expect(styles).toContain(".error-state .view-lead { color:var(--okoa-semantic-fg2); }");
  });
  it("keeps the document as the single vertical scroll owner", () => {
    expect(styles).not.toMatch(/overflow-y\s*:\s*(?:auto|scroll|clip)/u);
    expect(styles).not.toMatch(/body\s*\{[^}]*overflow-x\s*:\s*(?:hidden|clip)/u);
    expect(styles).toContain(".table-wrap { position:relative; width:100%; max-width:100%; min-width:0; overflow:visible;");
    expect(app).not.toContain("<textarea");
    expect(app).toContain('<pre class="directive"');
    expect(app).toContain("window.scrollTo({ top: 0, left: 0, behavior: \"auto\" })");
    expect(app).toContain("mobileNavElement.open = false");
    expect(app).toContain("mainElement.focus({ preventScroll: true })");
    expect(app).toContain('root.dataset.productIntroOpen = "true"');
    expect(app).toContain("delete root.dataset.productIntroOpen");
    expect(app).toContain("window.scrollTo({ left: lock.scrollX, top: lock.scrollY, behavior: \"auto\" })");
    expect(styles).toContain('html[data-product-intro-open="true"], body[data-product-intro-open="true"] { overflow:hidden; overscroll-behavior:none; }');
    expect(styles).toContain('body[data-product-intro-open="true"] { position:fixed; inset-inline:0; width:100%; }');
  });
  it("contains modal focus and restores the invoking control", () => {
    expect(app).toContain("function trapIntroFocus(event: KeyboardEvent): void");
    expect(app).toContain("introFocusableElements()[0]?.focus({ preventScroll: true })");
    expect(app).toContain("focusable[nextIndex]?.focus({ preventScroll: true })");
    expect(app).toContain("returnTarget?.focus({ preventScroll: true })");
    expect(app).toContain("onkeydown={trapIntroFocus}");
    expect(app).toContain("event.preventDefault(); void closeProductIntro()");
    expect(styles).toContain(".intro-dialog :where(button, a[href], input, select, textarea, summary, [tabindex]):focus");
    expect(renderVerifier).toContain("modal_focus_negative_control");
    expect(renderVerifier).toContain("modal_scroll_negative_control");
    expect(renderVerifier).toContain("background_scroll_attempt");
    expect(renderVerifier).not.toContain("document.documentElement.scrollHeight === document.documentElement.clientHeight || document.querySelector('.intro-dialog').open");
  });
  it("reflows dense surfaces instead of masking overflow", () => {
    expect(styles).toMatch(/@media \(max-width: 1023px\)[\s\S]*?\.table \{ display:block; min-width:0; \}/u);
    expect(styles).toContain(".table td::before { content:attr(data-label);");
    expect(styles).toContain(".table { width:100%; table-layout:fixed;");
    expect(styles).toContain(".table td { min-width:0; padding:var(--okoa-space-3); overflow-wrap:break-word;");
    expect(styles).toContain(".plan-cell { display:grid; grid-template-columns:minmax(0, 1fr);");
    expect(styles).not.toMatch(/\.table td[^}]*overflow-wrap:anywhere/u);
    expect(app).toContain('data-label="Recommended route"');
    expect(app).toContain('data-label="Execution route"');
    expect(styles).toContain("@media (min-width: 1280px) and (max-height: 480px)");
    expect(app).toContain('class="run-timeline"');
    expect(app).not.toContain("history-table");
    expect(app).toContain("inventoryPageSize = 6");
  });
  it("keeps mobile work controls compact through progressive disclosure", () => {
    expect(app).toContain('class="filter-grid primary-filters"');
    expect(app).toContain('class="filter-grid primary-filters inventory-primary"');
    expect((app.match(/<details class="panel disclosure more-filters">/gu) ?? [])).toHaveLength(2);
    expect(app).not.toContain('class="toolbar inventory-sort"');
    expect(styles).toContain(".primary-filters { grid-template-columns:minmax(0, 2fr) repeat(2, minmax(10rem, 1fr)); }");
    expect(styles).toContain(".primary-filters > label:first-child { grid-column:1 / -1; }");
  });
  it("translates internal qualification enums before presentation", () => {
    expect(app).toContain("qualificationLabel(primaryQualification(");
    expect(app).toContain("qualificationLabel(inventoryScore.qualification)");
    expect(app).not.toContain("{inventoryScore.qualification}");
    expect(app).not.toContain("{evidenceScore?.qualification ?? \"UNTESTED\"}");
  });
});
