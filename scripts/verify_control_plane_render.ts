import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { OKOA_THEMES } from "../control-plane-app/src/theme.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chromeBinary = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const views = ["Progress / Command", "Issues / Remediation", "Agent Finder", "Team Roster", "Raw Agent Inventory", "Run History", "System / Method"] as const;
const sourceInputRoots = [
  "control-plane-app",
  "src/control-plane/contracts",
  "src/control-plane/domain",
  "assets/codebase-state-dashboard/fonts",
] as const;
const explicitSourceInputs = [
  "assets/codebase-state-dashboard/dashboard-tokens.css",
  "package.json",
  "pnpm-lock.yaml",
  "tsconfig.json",
  "scripts/verify_control_plane_render.ts",
] as const;
const allThemes = OKOA_THEMES.map((theme) => theme.id);
const fullMatrixThemes = new Set(["voltage", "stillness"]);
// Mirrors the published OKOA clipping matrix: phones, landscape phones,
// tablets, desktops, ultrawide, portrait monitors, and deliberate extremes.
const widths = [
  { width: 320, height: 568 }, { width: 360, height: 800 }, { width: 375, height: 812 },
  { width: 390, height: 844 }, { width: 414, height: 896 }, { width: 430, height: 932 },
  { width: 568, height: 320 }, { width: 812, height: 375 }, { width: 932, height: 430 },
  { width: 600, height: 1024 }, { width: 768, height: 1024 }, { width: 834, height: 1112 },
  { width: 1024, height: 768 }, { width: 1180, height: 820 }, { width: 1280, height: 800 },
  { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1536, height: 864 },
  { width: 1680, height: 1050 }, { width: 1920, height: 1080 }, { width: 2560, height: 1080 },
  { width: 3440, height: 1440 }, { width: 1080, height: 1920 }, { width: 1200, height: 2000 },
  { width: 320, height: 1024 }, { width: 2560, height: 640 },
] as const;
const representativeViewportKeys = new Set(["390x844", "768x1024", "1440x900", "2560x640"]);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
interface HashedFile { readonly path: string; readonly bytes: number; readonly sha256: string }

function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function hashFiles(paths: readonly string[]): Promise<HashedFile[]> {
  const entries = await Promise.all([...paths].sort().map(async (path) => {
    const content = await readFile(resolve(repositoryRoot, path));
    return { path, bytes: content.byteLength, sha256: sha256(content) } satisfies HashedFile;
  }));
  return entries;
}

async function filesBelow(root: string): Promise<string[]> {
  const found: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) found.push(relative(repositoryRoot, path));
    }
  }
  await visit(root);
  return found;
}

async function collectSourceInputs(): Promise<string[]> {
  const rooted = await Promise.all(sourceInputRoots.map((root) => filesBelow(resolve(repositoryRoot, root))));
  return [...new Set([...explicitSourceInputs, ...rooted.flat()])].sort();
}

function manifestDigest(entries: readonly HashedFile[]): string {
  return sha256(entries.map((entry) => `${entry.path}\0${entry.bytes}\0${entry.sha256}\n`).join(""));
}

function assertSameManifest(before: readonly HashedFile[], after: readonly HashedFile[], label: string): void {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`${label} drifted during proof; before=${manifestDigest(before)} after=${manifestDigest(after)}`);
  }
}

async function runChecked(command: string, args: readonly string[], label: string): Promise<void> {
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(command, [...args], { cwd: repositoryRoot, stdio: "inherit" });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${label} failed with ${signal ? `signal ${signal}` : `exit ${code ?? "unknown"}`}`));
    });
  });
}

class CdpClient {
  readonly #socket: WebSocket;
  readonly #pending = new Map<number, { resolve(value: Json): void; reject(error: Error): void }>();
  #nextId = 1;

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: Json; error?: { message?: string } };
      if (message.id === undefined) return;
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? "CDP command failed"));
      else pending.resolve(message.result ?? null);
    });
    socket.addEventListener("close", () => {
      for (const pending of this.#pending.values()) pending.reject(new Error("CDP connection closed"));
      this.#pending.clear();
    });
  }

  static async connect(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolveOpen, rejectOpen) => {
      socket.addEventListener("open", () => resolveOpen(), { once: true });
      socket.addEventListener("error", () => rejectOpen(new Error("CDP WebSocket failed")), { once: true });
    });
    return new CdpClient(socket);
  }

  command(method: string, params: Record<string, Json> = {}): Promise<Json> {
    const id = this.#nextId++;
    return new Promise<Json>((resolveCommand, rejectCommand) => {
      this.#pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T extends Json>(expression: string): Promise<T> {
    const response = await this.command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }) as { result?: { value?: T }; exceptionDetails?: Json };
    if (response.exceptionDetails) throw new Error(`browser evaluation failed: ${JSON.stringify(response.exceptionDetails)}`);
    return response.result?.value as T;
  }

  close(): void { this.#socket.close(); }
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") return rejectPort(new Error("could not allocate port"));
      server.close((error) => error ? rejectPort(error) : resolvePort(address.port));
    });
  });
}

async function waitFor<T>(read: () => Promise<T | null>, label: string, timeoutMs = 10_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (value !== null) return value;
    } catch (error) { lastError = error; }
    await Bun.sleep(50);
  }
  throw new Error(`${label} did not become ready${lastError ? `: ${String(lastError)}` : ""}`);
}

function stop(process: ChildProcess | null): void {
  if (process?.exitCode === null) process.kill("SIGTERM");
}

const browserState = String.raw`(() => {
  const root = document.documentElement;
  const verticalOwners = [...document.querySelectorAll('*')].flatMap((element) => {
    const node = element;
    const style = getComputedStyle(node);
    if (!['auto', 'scroll'].includes(style.overflowY) || node.scrollHeight <= node.clientHeight + 1) return [];
    if (node === root || node === document.body) return [];
    return [node.tagName.toLowerCase() + (node.className ? '.' + String(node.className).trim().replace(/\s+/g, '.') : '')];
  });
  const pageClips = [root, document.body, document.querySelector('#app'), document.querySelector('.app-shell'), document.querySelector('.layout'), document.querySelector('.main')]
    .filter(Boolean).flatMap((node) => {
      const value = getComputedStyle(node).overflowX;
      return value === 'hidden' || value === 'clip' ? [node.tagName.toLowerCase() + ':' + value] : [];
    });
  const localHorizontalOwners = [...document.querySelectorAll('*')].flatMap((element) => {
    const style = getComputedStyle(element);
    if (!['auto', 'scroll'].includes(style.overflowX) || element.scrollWidth <= element.clientWidth + 1) return [];
    if (element.matches('input, textarea, select')) return [];
    return [{ tag: element.tagName.toLowerCase(), className: String(element.className), label: element.getAttribute('aria-label'), tabindex: element.getAttribute('tabindex') }];
  });
  const overflowFindings = [...document.querySelectorAll('*')].flatMap((element) => {
    const rect = element.getBoundingClientRect();
    const outsideViewport = rect.width > 0 && (rect.right > root.clientWidth + 1 || rect.left < -1);
    const internalOverflow = element.scrollWidth > element.clientWidth + 1;
    if (!outsideViewport && !internalOverflow) return [];
    const finding = {
      tag: element.tagName.toLowerCase(),
      className: String(element.className),
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      left: Math.round(rect.left),
      right: Math.round(rect.right),
    };
    const responsiveHeader = element.closest('.table thead');
    if (responsiveHeader) {
      const style = getComputedStyle(responsiveHeader);
      const valid = innerWidth <= 1023
        && style.position === 'absolute'
        && responsiveHeader.clientWidth <= 1
        && responsiveHeader.clientHeight <= 1
        && style.overflowX === 'hidden'
        && style.overflowY === 'hidden';
      return [{ ...finding, classification: valid ? 'intentional_responsive_table_header' : 'invalid_responsive_table_header', disposition: valid ? 'intentional' : 'harmful' }];
    }
    const mobileThemeLabel = element.matches('.theme-picker > span:first-child');
    if (mobileThemeLabel) {
      const style = getComputedStyle(element);
      const valid = innerWidth <= 640
        && style.position === 'absolute'
        && element.clientWidth <= 1
        && element.clientHeight <= 1
        && style.overflowX === 'hidden'
        && style.overflowY === 'hidden';
      return [{ ...finding, classification: valid ? 'intentional_mobile_theme_label' : 'invalid_mobile_theme_label', disposition: valid ? 'intentional' : 'harmful' }];
    }
    const accessibleText = element.closest('.sr-only');
    if (accessibleText) {
      const style = getComputedStyle(accessibleText);
      const valid = style.position === 'absolute'
        && accessibleText.clientWidth <= 1
        && accessibleText.clientHeight <= 1
        && style.overflowX === 'hidden'
        && style.overflowY === 'hidden';
      return [{ ...finding, classification: valid ? 'intentional_accessible_text' : 'invalid_accessible_text', disposition: valid ? 'intentional' : 'harmful' }];
    }
    if (element.matches('input, select, textarea')) {
      const valid = rect.left >= -1 && rect.right <= root.clientWidth + 1;
      return [{ ...finding, classification: valid ? 'native_control_internal_scroll_model' : 'overflowing_native_control', disposition: valid ? 'intentional' : 'harmful' }];
    }
    const meter = element.closest('.debt-track');
    if (meter) {
      const meterRect = meter.getBoundingClientRect();
      const style = getComputedStyle(meter);
      const valid = meterRect.left >= -1
        && meterRect.right <= root.clientWidth + 1
        && style.overflowX === 'hidden'
        && style.overflowY === 'hidden';
      return [{ ...finding, classification: valid ? 'intentional_data_meter_clip' : 'overflowing_data_meter', disposition: valid ? 'intentional' : 'harmful' }];
    }
    return [{ ...finding, classification: 'unclassified_overflow', disposition: 'harmful' }];
  });
  const overflowClassifications = overflowFindings.filter((finding) => finding.disposition === 'intentional');
  const overflowDebts = overflowFindings.filter((finding) => finding.disposition !== 'intentional');
  const interactionDebts = [...document.querySelectorAll('button, select, input:not([type="checkbox"]), summary, .check-target')].flatMap((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return [];
    return rect.height < 43 ? [{ tag: element.tagName.toLowerCase(), className: String(element.className), height: Math.round(rect.height * 10) / 10 }] : [];
  }).slice(0, 12);
  const excludedTextSelector = '.tuple, .sr-only, pre, code, script, style, svg, [hidden], [aria-hidden="true"]';
  const isVisibleTextNode = (node) => {
    const parent = node.parentElement;
    if (!parent || parent.closest(excludedTextSelector)) return false;
    const style = getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0) return false;
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getClientRects().length > 0;
  };
  const splitWords = [];
  const rawEnumLeaks = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let textNode;
  while ((textNode = walker.nextNode())) {
    if (!isVisibleTextNode(textNode)) continue;
    const parent = textNode.parentElement;
    const value = textNode.textContent ?? '';
    for (const match of value.matchAll(/\b(?:Recommended_supervised|Production_cleared|[A-Za-z][A-Za-z0-9]*_[A-Za-z][A-Za-z0-9_]+)\b/g)) {
      rawEnumLeaks.push({ value: match[0], tag: parent.tagName.toLowerCase(), className: String(parent.className) });
      if (rawEnumLeaks.length >= 12) break;
    }
    for (const match of value.matchAll(/[A-Za-z]{5,}/g)) {
      if (/^[a-f0-9]{16,}$/i.test(match[0])) continue;
      const range = document.createRange();
      range.setStart(textNode, match.index);
      range.setEnd(textNode, match.index + match[0].length);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
      if (rects.length > 1) splitWords.push({ word: match[0], tag: parent.tagName.toLowerCase(), className: String(parent.className), lines: rects.length });
      if (splitWords.length >= 12) break;
    }
    if (splitWords.length >= 12 && rawEnumLeaks.length >= 12) break;
  }
  const measurementCanvas = document.createElement('canvas');
  const measurementContext = measurementCanvas.getContext('2d');
  const controlTextDebts = [...document.querySelectorAll('select, input:not([type="checkbox"])')].flatMap((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || !measurementContext) return [];
    const style = getComputedStyle(element);
    measurementContext.font = style.font;
    const text = element instanceof HTMLSelectElement
      ? element.selectedOptions[0]?.textContent?.trim() ?? ''
      : element.value || element.getAttribute('placeholder') || '';
    if (!text) return [];
    const available = rect.width - Number.parseFloat(style.paddingInlineStart || '0') - Number.parseFloat(style.paddingInlineEnd || '0');
    const measured = measurementContext.measureText(text).width;
    return measured > available + 1 ? [{ tag: element.tagName.toLowerCase(), className: String(element.className), text, available: Math.round(available), measured: Math.round(measured) }] : [];
  }).slice(0, 12);
  const tableModes = [...document.querySelectorAll('.table')].map((table) => ({ className: String(table.className), display: getComputedStyle(table).display, columns: table.querySelectorAll('th').length }));
  const expectedTableDisplay = innerWidth <= 1023 ? 'block' : 'table';
  const tableModeDebts = tableModes.filter((table) => table.display !== expectedTableDisplay || table.columns !== 5);
  const topbarChildren = [...document.querySelector('.topbar')?.children ?? []].filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  const headerOverlapDebts = root.clientWidth < 1024 ? [] : topbarChildren.flatMap((left, index) => topbarChildren.slice(index + 1).flatMap((right) => {
    const a = left.getBoundingClientRect(); const b = right.getBoundingClientRect();
    const intersects = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return intersects ? [{ left: String(left.className), right: String(right.className) }] : [];
  }));
  const heading = document.querySelector('.view-heading');
  return {
    clientWidth: root.clientWidth,
    scrollWidth: root.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    verticalOwners,
    pageClips,
    localHorizontalOwners,
    overflowClassifications,
    overflowDebts,
    interactionDebts,
    splitWords,
    rawEnumLeaks,
    controlTextDebts,
    tableModeDebts,
    headerOverlapDebts,
    heading: heading?.textContent?.trim() ?? null,
    headingTop: heading?.getBoundingClientRect().top ?? null,
    scrollY,
  };
})()`;

function assertState(state: {
  clientWidth: number; scrollWidth: number; bodyScrollWidth: number; verticalOwners: Json[];
  pageClips: Json[]; localHorizontalOwners: Json[]; overflowClassifications: Json[]; overflowDebts: Json[]; interactionDebts: Json[];
  splitWords: Json[]; rawEnumLeaks: Json[]; controlTextDebts: Json[]; tableModeDebts: Json[];
  headerOverlapDebts: Json[]; heading: string | null;
}, context: string): void {
  if (state.scrollWidth !== state.clientWidth || state.bodyScrollWidth > state.clientWidth) {
    throw new Error(`${context}: horizontal overflow ${state.scrollWidth}/${state.bodyScrollWidth} > ${state.clientWidth}; ${JSON.stringify(state.overflowDebts ?? [])}`);
  }
  if (state.verticalOwners.length !== 0) throw new Error(`${context}: competing vertical owners ${JSON.stringify(state.verticalOwners)}`);
  if (state.pageClips.length !== 0) throw new Error(`${context}: page clipping masks ${JSON.stringify(state.pageClips)}`);
  if (state.overflowDebts.length !== 0) throw new Error(`${context}: harmful or unclassified overflow ${JSON.stringify(state.overflowDebts)}`);
  for (const owner of state.localHorizontalOwners as { label: string | null; tabindex: string | null }[]) {
    if (!owner.label || owner.tabindex !== "0") throw new Error(`${context}: unnamed or keyboard-inaccessible horizontal region ${JSON.stringify(owner)}`);
  }
  if (state.interactionDebts.length !== 0) throw new Error(`${context}: undersized interactions ${JSON.stringify(state.interactionDebts)}`);
  if (state.rawEnumLeaks.length !== 0) throw new Error(`${context}: raw UI enum leaks ${JSON.stringify(state.rawEnumLeaks)}`);
  if (state.controlTextDebts.length !== 0) throw new Error(`${context}: clipped control text ${JSON.stringify(state.controlTextDebts)}`);
  if (state.splitWords.length !== 0) throw new Error(`${context}: words split across lines ${JSON.stringify(state.splitWords)}`);
  if (state.tableModeDebts.length !== 0) throw new Error(`${context}: table reflow contract failed ${JSON.stringify(state.tableModeDebts)}`);
  if (state.headerOverlapDebts.length !== 0) throw new Error(`${context}: topbar overlap ${JSON.stringify(state.headerOverlapDebts)}`);
  if (!state.heading) throw new Error(`${context}: view heading is absent`);
}

async function selectView(client: CdpClient, view: string): Promise<void> {
  await client.evaluate(`(async () => {
    const view = ${JSON.stringify(view)};
    const button = [...document.querySelectorAll('.nav-button')].find((item) => item.textContent.trim() === view);
    if (!button) throw new Error('view button not found: ' + view);
    button.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
}

async function selectTheme(client: CdpClient, theme: string): Promise<void> {
  await client.evaluate(`(async () => {
    const select = document.querySelector('.theme-picker select');
    select.value = ${JSON.stringify(theme)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
}

async function screenshot(client: CdpClient, path: string): Promise<void> {
  const response = await client.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }) as { data?: string };
  if (!response.data) throw new Error("Chrome did not return screenshot bytes");
  await writeFile(path, Buffer.from(response.data, "base64"));
}

interface ModalFocusState {
  readonly open: boolean;
  readonly contained: boolean;
  readonly activeTag: string | null;
  readonly activeClass: string | null;
  readonly activeLabel: string | null;
  readonly focusVisible: boolean;
  readonly outlineStyle: string | null;
  readonly outlineWidth: number;
  readonly outlineColor: string | null;
  readonly focusableCount: number;
}

interface ModalScrollState {
  readonly open: boolean;
  readonly rootLocked: boolean;
  readonly bodyLocked: boolean;
  readonly rootOverflowY: string;
  readonly bodyOverflowY: string;
  readonly bodyPosition: string;
  readonly bodyTop: number;
  readonly savedScrollY: number | null;
  readonly windowScrollY: number;
  readonly dialogScrollOwner: boolean;
}

async function dispatchKeyboardKey(client: CdpClient, key: string, code: string, virtualKeyCode: number, modifiers = 0): Promise<void> {
  const keyParams = { key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode, modifiers };
  await client.command("Input.dispatchKeyEvent", { type: "keyDown", ...keyParams });
  await client.command("Input.dispatchKeyEvent", { type: "keyUp", ...keyParams });
  await client.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
}

async function readModalFocus(client: CdpClient): Promise<ModalFocusState> {
  return client.evaluate<ModalFocusState>(`(() => {
    const dialog = document.querySelector('.intro-dialog');
    const active = document.activeElement;
    const style = active instanceof HTMLElement ? getComputedStyle(active) : null;
    const focusable = dialog ? [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter((element) => element.offsetWidth > 0 || element.offsetHeight > 0) : [];
    return {
      open: Boolean(dialog?.open),
      contained: Boolean(dialog && active && active !== dialog && dialog.contains(active)),
      activeTag: active?.tagName?.toLowerCase() ?? null,
      activeClass: active instanceof HTMLElement ? active.className : null,
      activeLabel: active instanceof HTMLElement ? active.getAttribute('aria-label') ?? active.textContent?.trim() ?? null : null,
      focusVisible: active instanceof HTMLElement ? active.matches(':focus-visible') : false,
      outlineStyle: style?.outlineStyle ?? null,
      outlineWidth: Number.parseFloat(style?.outlineWidth ?? '0'),
      outlineColor: style?.outlineColor ?? null,
      focusableCount: focusable.length,
    };
  })()`);
}

function assertModalFocus(state: ModalFocusState, context: string): void {
  const transparentOutline = state.outlineColor === "transparent" || state.outlineColor === "rgba(0, 0, 0, 0)";
  if (!state.open || !state.contained || state.activeTag !== "button") {
    throw new Error(`${context}: focus escaped the modal ${JSON.stringify(state)}`);
  }
  if (state.outlineStyle === "none" || state.outlineWidth < 2 || transparentOutline) {
    throw new Error(`${context}: modal focus was not visibly token-ringed ${JSON.stringify(state)}`);
  }
}

async function readModalScrollState(client: CdpClient): Promise<ModalScrollState> {
  return client.evaluate<ModalScrollState>(`(() => {
    const root = document.documentElement;
    const body = document.body;
    const dialog = document.querySelector('.intro-dialog');
    const savedScrollY = root.dataset.productIntroScrollY;
    return {
      open: Boolean(dialog?.open),
      rootLocked: root.dataset.productIntroOpen === 'true',
      bodyLocked: body.dataset.productIntroOpen === 'true',
      rootOverflowY: getComputedStyle(root).overflowY,
      bodyOverflowY: getComputedStyle(body).overflowY,
      bodyPosition: getComputedStyle(body).position,
      bodyTop: Number.parseFloat(getComputedStyle(body).top || '0'),
      savedScrollY: savedScrollY === undefined ? null : Number(savedScrollY),
      windowScrollY: window.scrollY,
      dialogScrollOwner: Boolean(dialog && dialog.scrollHeight > dialog.clientHeight),
    };
  })()`);
}

function assertModalScrollLocked(state: ModalScrollState, context: string): void {
  const lockedOverflow = new Set(["hidden", "clip"]);
  if (!state.open || !state.rootLocked || !state.bodyLocked) {
    throw new Error(`${context}: modal-open document lock markers are absent ${JSON.stringify(state)}`);
  }
  if (!lockedOverflow.has(state.rootOverflowY) || !lockedOverflow.has(state.bodyOverflowY) || state.bodyPosition !== "fixed") {
    throw new Error(`${context}: modal-open document remains scrollable ${JSON.stringify(state)}`);
  }
  if (state.savedScrollY === null || !Number.isFinite(state.savedScrollY) || Math.abs(state.bodyTop + state.savedScrollY) > 1) {
    throw new Error(`${context}: modal-open scroll position is not preserved ${JSON.stringify(state)}`);
  }
}

async function main(): Promise<void> {
  const proofArgument = process.argv.find((argument) => argument.startsWith("--proof-dir="));
  const proofDirectory = resolve(proofArgument?.slice("--proof-dir=".length) ?? "/tmp/mister-clean-control-plane-proof");
  const sourceInputs = await collectSourceInputs();
  const sourceBeforeBuild = await hashFiles(sourceInputs);
  await rm(proofDirectory, { recursive: true, force: true });
  await mkdir(proofDirectory, { recursive: true });
  await runChecked("bunx", ["--bun", "vite", "build", "--config", "control-plane-app/vite.config.ts"], "control-plane build");
  const sourceAfterBuild = await hashFiles(sourceInputs);
  assertSameManifest(sourceBeforeBuild, sourceAfterBuild, "control-plane source input");
  const buildRoot = resolve(repositoryRoot, "dist/control-plane");
  const buildBeforeProof = await hashFiles(await filesBelow(buildRoot));
  if (buildBeforeProof.length === 0) throw new Error("control-plane build produced no files");
  const fixtureEntry = sourceBeforeBuild.find((entry) => entry.path === "control-plane-app/src/fixture.ts");
  if (!fixtureEntry) throw new Error("demo fixture was not included in the source manifest");
  if (!sourceBeforeBuild.some((entry) => entry.path === "control-plane-app/src/lane-contract.test.ts")) {
    throw new Error("lane-contract.test.ts was not included in the source manifest");
  }
  const proofSubject = {
    kind: "DEMO_FIXTURE",
    source_label: "DEMONSTRATION DATA — NOT A CLEANLINESS VERDICT",
    query: "?demo=1",
    fixture_path: fixtureEntry.path,
    fixture_sha256: fixtureEntry.sha256,
  } as const;
  const custodyBase = {
    schema_version: "1.0",
    algorithm: "SHA-256",
    proof_subject: proofSubject,
    source_manifest_scope: {
      recursive_roots: [...sourceInputRoots],
      explicit_files: [...explicitSourceInputs],
      dependency_resolution: ["package.json", "pnpm-lock.yaml"],
      generated_build_root: "dist/control-plane (bound separately as build_outputs)",
      exclusions: ["node_modules file contents (versions are bound by package.json and pnpm-lock.yaml)", "Google Chrome application binary", "operating-system font and rendering libraries"],
    },
    source_bundle_sha256: manifestDigest(sourceBeforeBuild),
    source_inputs: sourceBeforeBuild,
    build_bundle_sha256: manifestDigest(buildBeforeProof),
    build_outputs: buildBeforeProof,
  } as const;
  const chromeProfile = await mkdtemp("/tmp/mister-clean-chrome-");
  const previewPort = await freePort();
  const debuggingPort = await freePort();
  let preview: ChildProcess | null = null;
  let chrome: ChildProcess | null = null;
  let client: CdpClient | null = null;
  let proofFailure: unknown = null;
  let observationReport: Record<string, unknown> | null = null;
  let enumLeakNegativeControl: string[] = [];
  let modalFocus: Record<string, Json> | null = null;
  let modalFocusNegativeControl: Record<string, Json> | null = null;
  let modalScrollNegativeControl: Record<string, Json> | null = null;
  let overflowNegativeControl: Record<string, Json> | null = null;
  const observations: Record<string, Json>[] = [];
  const matrixFailures: string[] = [];
  const supplementalFailures: string[] = [];

  try {
    preview = spawn("bunx", ["--bun", "vite", "preview", "--config", "control-plane-app/vite.config.ts", "--host", "127.0.0.1", "--port", String(previewPort), "--strictPort"], { cwd: repositoryRoot, stdio: "ignore" });
    await waitFor(async () => (await fetch(`http://127.0.0.1:${previewPort}/?demo=1`, { signal: AbortSignal.timeout(1_000) })).ok ? true : null, "Vite preview");
    chrome = spawn(chromeBinary, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-allow-origins=*", `--remote-debugging-port=${debuggingPort}`, `--user-data-dir=${chromeProfile}`, `http://127.0.0.1:${previewPort}/?demo=1`], { stdio: "ignore" });
    const target = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`, { signal: AbortSignal.timeout(1_000) });
      if (!response.ok) return null;
      const targets = await response.json() as { type: string; webSocketDebuggerUrl: string; url: string }[];
      return targets.find((item) => item.type === "page" && item.url.includes(`127.0.0.1:${previewPort}`)) ?? null;
    }, "Chrome page");
    client = await CdpClient.connect(target.webSocketDebuggerUrl);
    await client.command("Runtime.enable");
    await client.command("Page.enable");
    await waitFor(async () => await client!.evaluate<boolean>("Boolean(document.querySelector('.view-heading'))") ? true : null, "Svelte application");

    await client.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const firstUseIntro = await client.evaluate<{ open: boolean; title: string | null; groups: number }>("({ open: Boolean(document.querySelector('.intro-dialog')?.open), title: document.querySelector('#intro-title')?.textContent?.trim() ?? null, groups: document.querySelectorAll('.intro-card').length })");
    if (!firstUseIntro.open || firstUseIntro.title !== "What Mister Clean does" || firstUseIntro.groups !== 8) throw new Error(`first-use introduction failed: ${JSON.stringify(firstUseIntro)}`);
    await screenshot(client, join(proofDirectory, "voltage-1440-first-use-introduction.png"));

    const modalFocusSamples: ModalFocusState[] = [];
    const initialModalFocus = await readModalFocus(client);
    assertModalFocus(initialModalFocus, "modal initial focus");
    modalFocusSamples.push(initialModalFocus);
    for (const shiftKey of [false, false, false, false, false, false, false, false, true, true, true, true, true, true, true, true]) {
      await dispatchKeyboardKey(client, "Tab", "Tab", 9, shiftKey ? 8 : 0);
      const focusState = await readModalFocus(client);
      assertModalFocus(focusState, shiftKey ? "modal reverse Tab cycle" : "modal forward Tab cycle");
      modalFocusSamples.push(focusState);
    }
    const modalFocusLabels = [...new Set(modalFocusSamples.map((sample) => sample.activeLabel).filter((label): label is string => label !== null))];
    if (initialModalFocus.focusableCount < 2 || modalFocusLabels.length < 2) {
      throw new Error(`modal focus cycle did not exercise every control: ${JSON.stringify({ initialModalFocus, modalFocusLabels })}`);
    }

    await client.evaluate(`(() => {
      const dialog = document.querySelector('.intro-dialog');
      if (!dialog) throw new Error('focus negative-control dialog is absent');
      if (dialog.open) dialog.close();
      dialog.setAttribute('open', '');
      const outside = document.createElement('button');
      outside.type = 'button';
      outside.dataset.modalFocusEscapeControl = 'true';
      outside.textContent = 'Injected focus escape';
      document.body.append(outside);
      outside.focus({ preventScroll: true });
    })()`);
    const escapedFocusState = await readModalFocus(client);
    let escapedFocusDetected: string | null = null;
    try {
      assertModalFocus(escapedFocusState, "modal containment negative control");
    } catch (error) {
      escapedFocusDetected = error instanceof Error ? error.message : String(error);
    }
    if (escapedFocusDetected === null) throw new Error("modal containment negative control was not detected");
    await client.evaluate(`(() => {
      const dialog = document.querySelector('.intro-dialog');
      document.querySelector('[data-modal-focus-escape-control]')?.remove();
      dialog.removeAttribute('open');
      dialog.showModal();
      dialog.querySelector('button')?.focus({ preventScroll: true });
    })()`);
    assertModalFocus(await readModalFocus(client), "modal containment negative-control restoration");

    const priorActiveStyle = await client.evaluate<string | null>("document.activeElement instanceof HTMLElement ? document.activeElement.getAttribute('style') : null");
    await client.evaluate("(() => { const active = document.activeElement; if (!(active instanceof HTMLElement)) throw new Error('focus-ring negative-control target absent'); active.style.setProperty('outline', 'none', 'important'); active.style.setProperty('outline-color', 'transparent', 'important'); })()");
    const missingRingState = await readModalFocus(client);
    let missingRingDetected: string | null = null;
    try {
      assertModalFocus(missingRingState, "modal focus-ring negative control");
    } catch (error) {
      missingRingDetected = error instanceof Error ? error.message : String(error);
    }
    if (missingRingDetected === null) throw new Error("modal focus-ring negative control was not detected");
    await client.evaluate(`(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) throw new Error('focus-ring negative-control restoration target absent');
      const prior = ${JSON.stringify(priorActiveStyle)};
      if (prior === null) active.removeAttribute('style'); else active.setAttribute('style', prior);
    })()`);
    assertModalFocus(await readModalFocus(client), "modal focus-ring negative-control restoration");
    modalFocusNegativeControl = {
      containment_detected: escapedFocusDetected !== null,
      containment_failure: escapedFocusDetected,
      focus_ring_detected: missingRingDetected !== null,
      focus_ring_failure: missingRingDetected,
      restored: true,
    };

    await dispatchKeyboardKey(client, "Escape", "Escape", 27);
    await waitFor(async () => await client!.evaluate<boolean>("!document.querySelector('.intro-dialog')") ? true : null, "Escape introduction dismissal");
    const escapeFocusRestored = await client.evaluate<boolean>("document.activeElement?.classList.contains('header-action') === true");
    if (!escapeFocusRestored) throw new Error("Escape dismissal did not restore the introduction trigger focus");

    await client.evaluate("document.querySelector('.header-action').click()");
    await waitFor(async () => await client!.evaluate<boolean>("Boolean(document.querySelector('.intro-dialog')?.open)") ? true : null, "introduction button-focus restoration setup");
    assertModalFocus(await readModalFocus(client), "modal reopened focus");
    await client.evaluate("document.querySelector('.intro-dismiss').click()");
    await waitFor(async () => await client!.evaluate<boolean>("!document.querySelector('.intro-dialog')") ? true : null, "button introduction dismissal");
    const buttonFocusRestored = await client.evaluate<boolean>("document.activeElement?.classList.contains('header-action') === true");
    if (!buttonFocusRestored) throw new Error("button dismissal did not restore the introduction trigger focus");
    modalFocus = {
      forward_cycles: 8,
      reverse_cycles: 8,
      focusable_controls: initialModalFocus.focusableCount,
      visited_labels: modalFocusLabels,
      all_samples_contained: modalFocusSamples.every((sample) => sample.contained),
      all_samples_visible: modalFocusSamples.every((sample) => sample.outlineStyle !== "none" && sample.outlineWidth >= 2),
      escape_restored_trigger: escapeFocusRestored,
      button_restored_trigger: buttonFocusRestored,
      samples: modalFocusSamples as unknown as Json,
    };

    const demoBinding = await client.evaluate<{ banner: string | null; source: string | null }>("({ banner: document.querySelector('.demo-banner')?.textContent?.trim() ?? null, source: new URL(location.href).searchParams.get('demo') })");
    if (demoBinding.banner !== proofSubject.source_label || demoBinding.source !== "1") throw new Error(`demo fixture binding failed: ${JSON.stringify(demoBinding)}`);

    await client.evaluate("(() => { const node = document.createElement('span'); node.dataset.enumLeakNegativeControl = 'true'; node.textContent = 'Recommended_supervised Production_cleared BOUND_FOR_EVALUATION'; document.body.append(node); })()");
    const enumControlState = await client.evaluate<{ rawEnumLeaks: { value: string }[] }>(browserState);
    await client.evaluate("document.querySelector('[data-enum-leak-negative-control]')?.remove()");
    enumLeakNegativeControl = enumControlState.rawEnumLeaks.map((finding) => finding.value).filter((value) => ["Recommended_supervised", "Production_cleared", "BOUND_FOR_EVALUATION"].includes(value));
    if (new Set(enumLeakNegativeControl).size !== 3) throw new Error(`raw-enum negative control failed: ${JSON.stringify(enumLeakNegativeControl)}`);

    await client.evaluate("(() => { const node = document.createElement('div'); node.className = 'overflow-negative-control'; node.style.position = 'absolute'; node.style.insetInlineStart = '0'; node.style.width = 'calc(100vw + 64px)'; node.style.height = '1px'; document.body.append(node); })()");
    const overflowControlState = await client.evaluate<{ overflowDebts: { className: string; classification: string; disposition: string }[] }>(browserState);
    await client.evaluate("document.querySelector('.overflow-negative-control')?.remove()");
    const overflowControlFindings = overflowControlState.overflowDebts.filter((finding) => finding.className.includes("overflow-negative-control"));
    overflowNegativeControl = {
      detected: overflowControlFindings.length > 0,
      classifications: overflowControlFindings.map((finding) => finding.classification),
      dispositions: overflowControlFindings.map((finding) => finding.disposition),
    };
    if (overflowControlFindings.length === 0 || overflowControlFindings.some((finding) => finding.classification !== "unclassified_overflow" || finding.disposition !== "harmful")) {
      throw new Error(`overflow negative control failed: ${JSON.stringify(overflowControlState.overflowDebts)}`);
    }

    for (const theme of allThemes) {
      await selectTheme(client, theme);
      const viewports = fullMatrixThemes.has(theme)
        ? widths
        : widths.filter((viewport) => representativeViewportKeys.has(`${viewport.width}x${viewport.height}`));
      for (const viewport of viewports) {
        await client.command("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
        for (const view of views) {
          await selectView(client, view);
          const state = await client.evaluate<{
            clientWidth: number; scrollWidth: number; bodyScrollWidth: number; verticalOwners: Json[];
            pageClips: Json[]; localHorizontalOwners: Json[]; overflowClassifications: Json[]; overflowDebts: Json[]; interactionDebts: Json[];
            splitWords: Json[]; rawEnumLeaks: Json[]; controlTextDebts: Json[];
            tableModeDebts: Json[]; headerOverlapDebts: Json[];
            heading: string | null; headingTop: number | null; scrollY: number;
          }>(browserState);
          try {
            assertState(state, `${theme} ${viewport.width}x${viewport.height} ${view}`);
          } catch (error) {
            matrixFailures.push(error instanceof Error ? error.message : String(error));
          }
          observations.push({ theme, width: viewport.width, height: viewport.height, view, ...state });
          if (theme === "voltage" && [320, 768, 1024, 1440].includes(viewport.width) && ["Progress / Command", "Issues / Remediation"].includes(view)) {
            await screenshot(client, join(proofDirectory, `${theme}-${viewport.width}-${view.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.png`));
          } else if (viewport.width === 1440) {
            await screenshot(client, join(proofDirectory, `${theme}-${viewport.width}-${view.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.png`));
          }
        }
      }
    }

    const expectedObservationCount = views.length * (fullMatrixThemes.size * widths.length + (allThemes.length - fullMatrixThemes.size) * representativeViewportKeys.size);
    if (observations.length !== expectedObservationCount) throw new Error(`theme/viewport coverage incomplete: ${observations.length}/${expectedObservationCount}`);

    await selectTheme(client, "voltage");
    await client.command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    const preModalScroll = await client.evaluate<{ scrollY: number; maxScrollY: number }>(`(async () => {
      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      window.scrollTo(0, Math.min(240, maxScrollY));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { scrollY: window.scrollY, maxScrollY };
    })()`);
    await client.evaluate("document.querySelector('.header-action').click()");
    await waitFor(async () => await client!.evaluate<boolean>("Boolean(document.querySelector('.intro-dialog')?.open)") ? true : null, "introduction reopen");
    await screenshot(client, join(proofDirectory, "voltage-390-first-use-introduction.png"));
    const beforeBackgroundScroll = await readModalScrollState(client);
    assertModalScrollLocked(beforeBackgroundScroll, "mobile introduction initial scroll lock");
    if (!beforeBackgroundScroll.dialogScrollOwner) throw new Error(`mobile introduction did not own its required local scroll: ${JSON.stringify(beforeBackgroundScroll)}`);
    const backgroundScrollAttempt = await client.evaluate<{ requested: number; before: number; after: number }>(`(async () => {
      const before = window.scrollY;
      const requested = before + 480;
      window.scrollTo(0, requested);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { requested, before, after: window.scrollY };
    })()`);
    const afterBackgroundScroll = await readModalScrollState(client);
    assertModalScrollLocked(afterBackgroundScroll, "mobile introduction post-attempt scroll lock");
    if (backgroundScrollAttempt.after !== backgroundScrollAttempt.before || afterBackgroundScroll.windowScrollY !== beforeBackgroundScroll.windowScrollY) {
      throw new Error(`modal-open background moved during scroll attempt: ${JSON.stringify({ backgroundScrollAttempt, beforeBackgroundScroll, afterBackgroundScroll })}`);
    }

    await client.evaluate(`(async () => {
      const root = document.documentElement;
      const body = document.body;
      delete root.dataset.productIntroOpen;
      delete body.dataset.productIntroOpen;
      window.scrollTo(0, Math.min(360, Math.max(0, root.scrollHeight - innerHeight)));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()`);
    const missingScrollLockState = await readModalScrollState(client);
    let missingScrollLockDetected: string | null = null;
    try {
      assertModalScrollLocked(missingScrollLockState, "modal scroll-lock negative control");
    } catch (error) {
      missingScrollLockDetected = error instanceof Error ? error.message : String(error);
    }
    if (missingScrollLockDetected === null) throw new Error("modal scroll-lock negative control was not detected");
    await client.evaluate(`(async () => {
      const root = document.documentElement;
      const body = document.body;
      root.dataset.productIntroOpen = 'true';
      body.dataset.productIntroOpen = 'true';
      window.scrollTo(0, ${beforeBackgroundScroll.windowScrollY});
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()`);
    const restoredScrollLockState = await readModalScrollState(client);
    assertModalScrollLocked(restoredScrollLockState, "modal scroll-lock negative-control restoration");
    modalScrollNegativeControl = {
      detected: missingScrollLockDetected !== null,
      failure: missingScrollLockDetected,
      missing_lock_state: missingScrollLockState as unknown as Json,
      background_scroll_attempt: backgroundScrollAttempt as unknown as Json,
      restored: true,
    };

    await client.evaluate("document.querySelector('.intro-dismiss').click()");
    await waitFor(async () => await client!.evaluate<boolean>("!document.querySelector('.intro-dialog')") ? true : null, "mobile introduction dismissal");
    const postModalScroll = await client.evaluate<{ scrollY: number; rootLocked: boolean; bodyLocked: boolean; bodyPosition: string; movedAfterClose: boolean }>(`(async () => {
      const root = document.documentElement;
      const body = document.body;
      const restored = window.scrollY;
      const maxScrollY = Math.max(0, root.scrollHeight - innerHeight);
      const target = restored > 0 ? 0 : Math.min(240, maxScrollY);
      window.scrollTo(0, target);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const movedAfterClose = maxScrollY === 0 ? true : window.scrollY !== restored;
      const result = { scrollY: restored, rootLocked: root.dataset.productIntroOpen === 'true', bodyLocked: body.dataset.productIntroOpen === 'true', bodyPosition: getComputedStyle(body).position, movedAfterClose };
      window.scrollTo(0, 0);
      return result;
    })()`);
    if (postModalScroll.rootLocked || postModalScroll.bodyLocked || postModalScroll.bodyPosition === "fixed" || Math.abs(postModalScroll.scrollY - preModalScroll.scrollY) > 1 || !postModalScroll.movedAfterClose) {
      throw new Error(`modal dismissal did not restore document scrolling: ${JSON.stringify({ preModalScroll, postModalScroll })}`);
    }

    await client.command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await selectView(client, "Raw Agent Inventory");
    await client.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
    await selectView(client, "System / Method");
    const routeReset = await client.evaluate<{ scrollY: number; focused: boolean; headingTop: number }>("({ scrollY, focused: document.activeElement === document.querySelector('.main'), headingTop: document.querySelector('.view-heading').getBoundingClientRect().top })");
    if (routeReset.scrollY > 1 || !routeReset.focused || routeReset.headingTop < 0 || routeReset.headingTop >= 844) throw new Error(`deep-scroll route reset failed: ${JSON.stringify(routeReset)}`);

    const activeMobile = await client.evaluate<{ open: boolean; scrollY: number; focused: boolean }>(`(async () => {
      const menu = document.querySelector('.mobile-nav'); menu.open = true; window.scrollTo(0, 200);
      const active = [...menu.querySelectorAll('.nav-button')].find((button) => button.textContent.trim() === 'System / Method');
      active.click(); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { open: menu.open, scrollY, focused: document.activeElement === document.querySelector('.main') };
    })()`);
    if (activeMobile.open || activeMobile.scrollY > 1 || !activeMobile.focused) throw new Error(`active mobile selection did not close/reset/focus: ${JSON.stringify(activeMobile)}`);

    const longToken = await client.evaluate<{
      clientWidth: number; scrollWidth: number; panelDebt: number;
    }>(`(() => { const value = document.querySelector('.list strong'); value.textContent = 'x'.repeat(256); const root = document.documentElement; const panel = value.closest('.panel'); return { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, panelDebt: panel.scrollWidth - panel.clientWidth }; })()`);
    if (longToken.scrollWidth !== longToken.clientWidth || longToken.panelDebt > 1) throw new Error(`long-token reflow failed: ${JSON.stringify(longToken)}`);

    await client.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await selectView(client, "Progress / Command");
    const reducedMotion = await client.evaluate<string[]>("[...document.querySelectorAll('.debt-track i, .size-chart polyline')].map((node) => getComputedStyle(node).animationName)");
    if (reducedMotion.some((value) => value !== "none")) throw new Error(`reduced motion retained animation: ${JSON.stringify(reducedMotion)}`);
    await client.command("Emulation.setEmulatedMedia", { features: [] });

    await client.evaluate("document.documentElement.style.fontSize = '200%'");
    for (const view of views) {
      await selectView(client, view);
      try {
        assertState(await client.evaluate(browserState), `200% text 390x844 ${view}`);
      } catch (error) {
        supplementalFailures.push(error instanceof Error ? error.message : String(error));
      }
    }
    await client.evaluate("document.documentElement.style.removeProperty('font-size')");

    await client.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 360, deviceScaleFactor: 1, mobile: false });
    await selectView(client, "Progress / Command");
    const shortHeight = await client.evaluate<{ reachable: boolean; position: string }>(`(() => { const sidebar = document.querySelector('.sidebar'); const last = sidebar.querySelector('.nav-button:last-of-type') ?? sidebar.querySelector('li:last-child .nav-button'); const rect = last.getBoundingClientRect(); return { reachable: rect.bottom <= document.documentElement.scrollHeight, position: getComputedStyle(sidebar).position }; })()`);
    if (!shortHeight.reachable || shortHeight.position !== "static") throw new Error(`short-height sidebar is not document-reachable: ${JSON.stringify(shortHeight)}`);

    await client.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 500, deviceScaleFactor: 1, mobile: false });
    await selectView(client, "Issues / Remediation");
    const sticky = await client.evaluate<{ position: string; top: number; scoped: boolean }>(`(() => { const table = document.querySelector('.issue-table'); const header = table.querySelector('th'); window.scrollTo(0, table.getBoundingClientRect().top + scrollY + 20); const headers = [...table.querySelectorAll('th')]; return { position: getComputedStyle(header).position, top: header.getBoundingClientRect().top, scoped: headers.every((node) => node.getAttribute('scope') === 'col') }; })()`);
    if (sticky.position !== "sticky" || sticky.top < -1 || sticky.top > 1 || !sticky.scoped) throw new Error(`sticky accessible table header failed: ${JSON.stringify(sticky)}`);

    const overflowClassificationCounts: Record<string, number> = {};
    let overflowClassificationTotal = 0;
    let harmfulOverflowTotal = 0;
    for (const observation of observations) {
      const classifications = Array.isArray(observation.overflowClassifications) ? observation.overflowClassifications : [];
      const debts = Array.isArray(observation.overflowDebts) ? observation.overflowDebts : [];
      harmfulOverflowTotal += debts.length;
      for (const classification of classifications) {
        if (typeof classification !== "object" || classification === null || Array.isArray(classification)) continue;
        const name = typeof classification.classification === "string" ? classification.classification : "missing_classification";
        overflowClassificationCounts[name] = (overflowClassificationCounts[name] ?? 0) + 1;
        overflowClassificationTotal += 1;
      }
    }
    if (harmfulOverflowTotal !== 0) throw new Error(`classified proof retained ${harmfulOverflowTotal} harmful overflow findings`);

    observationReport = { schema_version: "1.0", generated_at: new Date().toISOString(), proof_subject: proofSubject, custody: { source_bundle_sha256: custodyBase.source_bundle_sha256, build_bundle_sha256: custodyBase.build_bundle_sha256, manifest_path: "sha256-manifest.json" }, checks: observations.length, themes: allThemes, full_matrix_themes: [...fullMatrixThemes], representative_viewports: [...representativeViewportKeys], widths, views, observations, matrix_failures: matrixFailures, supplemental_failures: supplementalFailures, enum_leak_negative_control: enumLeakNegativeControl, overflow_negative_control: overflowNegativeControl, overflow_classifications: { intentional_total: overflowClassificationTotal, harmful_total: harmfulOverflowTotal, by_classification: overflowClassificationCounts }, modal_focus: modalFocus, modal_focus_negative_control: modalFocusNegativeControl, modal_scroll_negative_control: modalScrollNegativeControl, route_reset: routeReset, active_mobile: activeMobile, long_token: longToken, reduced_motion: reducedMotion, short_height: shortHeight, sticky_header: sticky };
    if (matrixFailures.length > 0 || supplementalFailures.length > 0) {
      const failures = [...matrixFailures, ...supplementalFailures];
      throw new Error(`render proof found ${failures.length} responsive defects; first findings: ${JSON.stringify(failures.slice(0, 20))}`);
    }
  } catch (error) {
    proofFailure = error;
    throw error;
  } finally {
    client?.close();
    stop(chrome);
    stop(preview);
    const sourceAfterProof = await hashFiles(sourceInputs);
    const buildAfterProof = await hashFiles(await filesBelow(buildRoot));
    const sourceDrift = JSON.stringify(sourceBeforeBuild) !== JSON.stringify(sourceAfterProof);
    const buildDrift = JSON.stringify(buildBeforeProof) !== JSON.stringify(buildAfterProof);
    const custodyManifest = {
      ...custodyBase,
      generated_at: new Date().toISOString(),
      proof_status: proofFailure === null && !sourceDrift && !buildDrift ? "PASS" : "FAILED",
      failure: proofFailure === null ? null : proofFailure instanceof Error ? proofFailure.message : String(proofFailure),
      source_after_proof_sha256: manifestDigest(sourceAfterProof),
      build_after_proof_sha256: manifestDigest(buildAfterProof),
      source_drift: sourceDrift,
      build_drift: buildDrift,
    } as const;
    if (observationReport !== null) {
      await writeFile(join(proofDirectory, "render-observations.json"), `${JSON.stringify(observationReport, null, 2)}\n`, "utf8");
    }
    await writeFile(join(proofDirectory, "sha256-manifest.json"), `${JSON.stringify(custodyManifest, null, 2)}\n`, "utf8");
    await rm(chromeProfile, { recursive: true, force: true });
    if (sourceDrift || buildDrift) {
      const driftError = new Error(`proof custody drift: source=${sourceDrift} build=${buildDrift}`);
      if (proofFailure !== null) throw new AggregateError([proofFailure, driftError], "render proof failed and custody drifted");
      throw driftError;
    }
  }
  process.stdout.write(`control-plane render proof: PASS (${observations.length} route × theme × viewport observations)\n${proofDirectory}\n`);
}

await main();
